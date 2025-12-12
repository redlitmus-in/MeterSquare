"""
Support Ticket Controller - Standalone Version
Handles CRUD operations for support tickets (bugs, issues, implementations)
No authentication required - fully public API
"""

from flask import request, jsonify
from config.db import db
from models.support_ticket import SupportTicket
from config.logging import get_logger
from datetime import datetime
from sqlalchemy import or_
import os
import uuid
from werkzeug.utils import secure_filename
from supabase import create_client, Client

log = get_logger()

# Supabase configuration
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_KEY')
SUPABASE_BUCKET = "file_upload"

# Upload configuration
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'txt', 'xlsx', 'xls'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Initialize Supabase client
supabase: Client = None
PUBLIC_URL_BASE = None

if supabase_url and supabase_key:
    try:
        supabase = create_client(supabase_url, supabase_key)
        PUBLIC_URL_BASE = f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/"
        log.info("Supabase client initialized for support tickets")
    except Exception as e:
        log.error(f"Failed to initialize Supabase client: {str(e)}")
else:
    log.warning("Supabase not configured - file uploads will be disabled")


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def upload_file_to_supabase(file, ticket_id):
    """Upload a single file to Supabase storage"""
    if not supabase:
        raise Exception("Supabase storage not configured")

    try:
        filename = secure_filename(file.filename)
        name, ext = os.path.splitext(filename)
        unique_id = str(uuid.uuid4())[:8]
        unique_filename = f"{name}_{unique_id}{ext}"

        supabase_path = f"support/ticket_{ticket_id}/{unique_filename}"
        file_content = file.read()
        file_size = len(file_content)

        if file_size > MAX_FILE_SIZE:
            raise Exception(f"File too large. Maximum size is {MAX_FILE_SIZE / (1024*1024):.0f}MB")

        if file_size == 0:
            raise Exception("File is empty")

        content_type = file.content_type or "application/octet-stream"

        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=supabase_path,
            file=file_content,
            file_options={"content-type": content_type, "upsert": "true"}
        )

        public_url = f"{PUBLIC_URL_BASE}{supabase_path}"
        log.info(f"File uploaded to Supabase: {supabase_path}")

        return {
            'file_name': unique_filename,
            'file_path': public_url,
            'file_type': content_type,
            'file_size': file_size,
            'storage_path': supabase_path,
            'uploaded_at': datetime.utcnow().isoformat()
        }

    except Exception as e:
        log.error(f"Failed to upload file to Supabase: {str(e)}")
        raise


def delete_file_from_supabase(storage_path):
    """Delete a file from Supabase storage"""
    if not supabase:
        return
    try:
        supabase.storage.from_(SUPABASE_BUCKET).remove([storage_path])
        log.info(f"File deleted from Supabase: {storage_path}")
    except Exception as e:
        log.warning(f"Failed to delete file from Supabase: {str(e)}")


# ============ PUBLIC FUNCTIONS ============

def public_create_ticket():
    """Create a new support ticket (public - no auth required)"""
    try:
        if request.content_type and 'multipart/form-data' in request.content_type:
            data = request.form.to_dict()
        else:
            data = request.get_json()

        # Validate required fields
        if not data.get('ticket_type'):
            return jsonify({"success": False, "error": "Ticket type is required"}), 400
        if not data.get('title'):
            return jsonify({"success": False, "error": "Title is required"}), 400
        if not data.get('reporter_name'):
            return jsonify({"success": False, "error": "Your name is required"}), 400
        if not data.get('reporter_email'):
            return jsonify({"success": False, "error": "Your email is required"}), 400

        ticket_type = data.get('ticket_type', 'bug')
        if ticket_type not in ['bug', 'issue', 'implementation', 'feature']:
            return jsonify({"success": False, "error": "Invalid ticket type"}), 400

        ticket_number = SupportTicket.generate_ticket_number(ticket_type)
        as_draft = data.get('as_draft', 'false').lower() == 'true'

        new_ticket = SupportTicket(
            ticket_number=ticket_number,
            reporter_user_id=None,
            reporter_name=data['reporter_name'],
            reporter_email=data['reporter_email'],
            reporter_role=data.get('reporter_role', 'Public User'),
            ticket_type=ticket_type,
            title=data['title'],
            description=data.get('description', ''),
            current_concern=data.get('current_concern', ''),
            proposed_changes=data.get('proposed_changes', ''),
            priority=data.get('priority', 'medium'),
            status='draft' if as_draft else 'submitted',
            submitted_at=None if as_draft else datetime.utcnow(),
            attachments=[]
        )

        db.session.add(new_ticket)
        db.session.commit()

        # Handle file uploads - support both legacy 'files' and new section-based uploads
        attachments = []

        # Handle concern_files (Current Concern section)
        if 'concern_files' in request.files and supabase:
            concern_files = request.files.getlist('concern_files')
            for file in concern_files:
                if file and file.filename and allowed_file(file.filename):
                    try:
                        attachment = upload_file_to_supabase(file, new_ticket.ticket_id)
                        attachment['section'] = 'current_concern'
                        attachments.append(attachment)
                    except Exception as e:
                        log.warning(f"Failed to upload concern file {file.filename}: {str(e)}")

        # Handle implementation_files (Concern Implementation section)
        if 'implementation_files' in request.files and supabase:
            impl_files = request.files.getlist('implementation_files')
            for file in impl_files:
                if file and file.filename and allowed_file(file.filename):
                    try:
                        attachment = upload_file_to_supabase(file, new_ticket.ticket_id)
                        attachment['section'] = 'implementation'
                        attachments.append(attachment)
                    except Exception as e:
                        log.warning(f"Failed to upload implementation file {file.filename}: {str(e)}")

        # Legacy support for 'files' field (no section specified)
        if 'files' in request.files and supabase and not attachments:
            files = request.files.getlist('files')
            for file in files:
                if file and file.filename and allowed_file(file.filename):
                    try:
                        attachment = upload_file_to_supabase(file, new_ticket.ticket_id)
                        attachment['section'] = 'current_concern'  # Default to current_concern
                        attachments.append(attachment)
                    except Exception as e:
                        log.warning(f"Failed to upload file {file.filename}: {str(e)}")

        if attachments:
            new_ticket.attachments = attachments
            db.session.commit()

        log.info(f"Ticket created: {new_ticket.ticket_number} by {data['reporter_email']}")

        return jsonify({
            "success": True,
            "message": "Ticket created successfully",
            "ticket": new_ticket.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to create ticket: {str(e)}"}), 500


def public_get_all_tickets():
    """Get all tickets (public)"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        status = request.args.get('status')
        ticket_type = request.args.get('ticket_type')

        query = SupportTicket.query.filter_by(is_deleted=False)

        if status:
            query = query.filter_by(status=status)
        if ticket_type:
            query = query.filter_by(ticket_type=ticket_type)

        query = query.order_by(SupportTicket.created_at.desc())
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        tickets = [ticket.to_dict() for ticket in paginated.items]

        stats = {
            'total_submitted': SupportTicket.query.filter_by(status='submitted', is_deleted=False).count(),
            'total_in_review': SupportTicket.query.filter_by(status='in_review', is_deleted=False).count(),
            'total_approved': SupportTicket.query.filter_by(status='approved', is_deleted=False).count(),
            'total_in_progress': SupportTicket.query.filter_by(status='in_progress', is_deleted=False).count(),
            'total_resolved': SupportTicket.query.filter_by(status='resolved', is_deleted=False).count(),
            'total_rejected': SupportTicket.query.filter_by(status='rejected', is_deleted=False).count(),
        }

        return jsonify({
            "success": True,
            "tickets": tickets,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "pages": paginated.pages,
                "has_next": paginated.has_next,
                "has_prev": paginated.has_prev
            },
            "statistics": stats
        }), 200

    except Exception as e:
        log.error(f"Error fetching tickets: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to fetch tickets: {str(e)}"}), 500


def public_update_ticket(ticket_id):
    """Update a ticket (public)"""
    try:
        if request.content_type and 'multipart/form-data' in request.content_type:
            data = request.form.to_dict()
        else:
            data = request.get_json() or {}

        ticket = SupportTicket.query.get(ticket_id)
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if ticket.status != 'draft':
            return jsonify({"success": False, "error": "Can only edit draft tickets"}), 400

        if data.get('title'):
            ticket.title = data['title']
        if data.get('description'):
            ticket.description = data['description']
        if data.get('current_concern'):
            ticket.current_concern = data['current_concern']
        if data.get('proposed_changes'):
            ticket.proposed_changes = data['proposed_changes']
        if data.get('priority'):
            ticket.priority = data['priority']
        if data.get('ticket_type'):
            ticket.ticket_type = data['ticket_type']

        # Handle file uploads - support both legacy 'files' and new section-based uploads
        attachments = ticket.attachments or []
        new_files_added = False

        # Handle concern_files (Current Concern section)
        if 'concern_files' in request.files and supabase:
            concern_files = request.files.getlist('concern_files')
            for file in concern_files:
                if file and file.filename and allowed_file(file.filename):
                    try:
                        attachment = upload_file_to_supabase(file, ticket.ticket_id)
                        attachment['section'] = 'current_concern'
                        attachments.append(attachment)
                        new_files_added = True
                    except Exception as e:
                        log.warning(f"Failed to upload concern file {file.filename}: {str(e)}")

        # Handle implementation_files (Concern Implementation section)
        if 'implementation_files' in request.files and supabase:
            impl_files = request.files.getlist('implementation_files')
            for file in impl_files:
                if file and file.filename and allowed_file(file.filename):
                    try:
                        attachment = upload_file_to_supabase(file, ticket.ticket_id)
                        attachment['section'] = 'implementation'
                        attachments.append(attachment)
                        new_files_added = True
                    except Exception as e:
                        log.warning(f"Failed to upload implementation file {file.filename}: {str(e)}")

        # Legacy support for 'files' field
        if 'files' in request.files and supabase and not new_files_added:
            files = request.files.getlist('files')
            for file in files:
                if file and file.filename and allowed_file(file.filename):
                    try:
                        result = upload_file_to_supabase(file, ticket.ticket_id)
                        result['section'] = 'current_concern'
                        attachments.append(result)
                    except Exception as e:
                        log.warning(f"Failed to upload file {file.filename}: {str(e)}")

        ticket.attachments = attachments
        ticket.updated_at = datetime.utcnow()

        # Flag attachments as modified for SQLAlchemy to detect JSONB change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(ticket, 'attachments')

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Ticket updated successfully",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to update ticket: {str(e)}"}), 500


def public_submit_ticket(ticket_id):
    """Submit a draft ticket (public)"""
    try:
        ticket = SupportTicket.query.get(ticket_id)
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if ticket.status != 'draft':
            return jsonify({"success": False, "error": "Ticket is already submitted"}), 400

        ticket.status = 'submitted'
        ticket.submitted_at = datetime.utcnow()
        ticket.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Ticket submitted successfully",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error submitting ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to submit ticket: {str(e)}"}), 500


def public_delete_ticket(ticket_id):
    """Delete a ticket (public)"""
    try:
        ticket = SupportTicket.query.get(ticket_id)
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if ticket.status != 'draft':
            return jsonify({"success": False, "error": "Can only delete draft tickets"}), 400

        if ticket.attachments and supabase:
            for attachment in ticket.attachments:
                if attachment.get('storage_path'):
                    delete_file_from_supabase(attachment['storage_path'])

        db.session.delete(ticket)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Ticket deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to delete ticket: {str(e)}"}), 500


def public_confirm_resolution(ticket_id):
    """Confirm resolution (public)"""
    try:
        ticket = SupportTicket.query.get(ticket_id)
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if ticket.status != 'resolved':
            return jsonify({"success": False, "error": "Can only confirm resolved tickets"}), 400

        old_status = ticket.status
        ticket.status = 'closed'
        ticket.updated_at = datetime.utcnow()

        # Track who closed the ticket
        ticket.closed_by = 'client'
        ticket.closed_by_name = ticket.reporter_name
        ticket.closed_date = datetime.utcnow()

        # Add to response history
        from sqlalchemy.orm.attributes import flag_modified
        response_history = ticket.response_history or []
        response_history.append({
            'type': 'closed',
            'response': 'Resolution confirmed by client',
            'admin_name': ticket.reporter_name,
            'closed_by': 'client',
            'old_status': old_status,
            'new_status': 'closed',
            'created_at': datetime.utcnow().isoformat()
        })
        ticket.response_history = response_history
        flag_modified(ticket, 'response_history')

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Resolution confirmed. Ticket closed.",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error confirming resolution: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to confirm resolution: {str(e)}"}), 500


# ============ ADMIN FUNCTIONS (No Auth - Internal Use) ============

def admin_get_all_tickets():
    """Get all tickets for admin/dev team"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        status = request.args.get('status')
        ticket_type = request.args.get('ticket_type')
        search = request.args.get('search')
        priority = request.args.get('priority')

        query = SupportTicket.query.filter_by(is_deleted=False)

        if not status:
            query = query.filter(SupportTicket.status != 'draft')
        elif status:
            query = query.filter_by(status=status)

        if ticket_type:
            query = query.filter_by(ticket_type=ticket_type)
        if priority:
            query = query.filter_by(priority=priority)

        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    SupportTicket.ticket_number.ilike(search_term),
                    SupportTicket.title.ilike(search_term),
                    SupportTicket.reporter_name.ilike(search_term),
                    SupportTicket.reporter_email.ilike(search_term)
                )
            )

        query = query.order_by(SupportTicket.created_at.desc())
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        tickets = [ticket.to_dict() for ticket in paginated.items]

        stats = {
            'total_submitted': SupportTicket.query.filter_by(status='submitted', is_deleted=False).count(),
            'total_in_review': SupportTicket.query.filter_by(status='in_review', is_deleted=False).count(),
            'total_approved': SupportTicket.query.filter_by(status='approved', is_deleted=False).count(),
            'total_in_progress': SupportTicket.query.filter_by(status='in_progress', is_deleted=False).count(),
            'total_resolved': SupportTicket.query.filter_by(status='resolved', is_deleted=False).count(),
            'total_rejected': SupportTicket.query.filter_by(status='rejected', is_deleted=False).count(),
        }

        return jsonify({
            "success": True,
            "tickets": tickets,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "pages": paginated.pages,
                "has_next": paginated.has_next,
                "has_prev": paginated.has_prev
            },
            "statistics": stats
        }), 200

    except Exception as e:
        log.error(f"Error fetching admin tickets: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to fetch tickets: {str(e)}"}), 500


def admin_approve_ticket(ticket_id):
    """Approve a ticket"""
    try:
        ticket = SupportTicket.query.filter_by(ticket_id=ticket_id, is_deleted=False).first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if ticket.status not in ['submitted', 'in_review']:
            return jsonify({"success": False, "error": "Only submitted tickets can be approved"}), 400

        data = request.get_json() or {}

        ticket.status = 'approved'
        ticket.approved_by_name = data.get('admin_name', 'Dev Team')
        ticket.approval_date = datetime.utcnow()
        ticket.admin_response = data.get('response', '')
        ticket.admin_name = data.get('admin_name', 'Dev Team')
        ticket.response_date = datetime.utcnow()
        ticket.updated_at = datetime.utcnow()

        # Add to response history if response provided
        if data.get('response'):
            from sqlalchemy.orm.attributes import flag_modified
            response_history = ticket.response_history or []
            response_history.append({
                'type': 'approval',
                'response': data['response'],
                'admin_name': data.get('admin_name', 'Dev Team'),
                'new_status': 'approved',
                'created_at': datetime.utcnow().isoformat()
            })
            ticket.response_history = response_history
            flag_modified(ticket, 'response_history')

        db.session.commit()
        log.info(f"Ticket approved: {ticket.ticket_number}")

        return jsonify({
            "success": True,
            "message": "Ticket approved successfully",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to approve ticket: {str(e)}"}), 500


def admin_reject_ticket(ticket_id):
    """Reject a ticket"""
    try:
        ticket = SupportTicket.query.filter_by(ticket_id=ticket_id, is_deleted=False).first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if ticket.status not in ['submitted', 'in_review']:
            return jsonify({"success": False, "error": "Only submitted tickets can be rejected"}), 400

        data = request.get_json() or {}
        if not data.get('reason'):
            return jsonify({"success": False, "error": "Rejection reason is required"}), 400

        ticket.status = 'rejected'
        ticket.rejected_by_name = data.get('admin_name', 'Dev Team')
        ticket.rejection_date = datetime.utcnow()
        ticket.rejection_reason = data['reason']
        ticket.admin_response = data.get('response', data['reason'])
        ticket.admin_name = data.get('admin_name', 'Dev Team')
        ticket.response_date = datetime.utcnow()
        ticket.updated_at = datetime.utcnow()

        # Add to response history
        from sqlalchemy.orm.attributes import flag_modified
        response_history = ticket.response_history or []
        response_history.append({
            'type': 'rejection',
            'response': data.get('response', data['reason']),
            'reason': data['reason'],
            'admin_name': data.get('admin_name', 'Dev Team'),
            'new_status': 'rejected',
            'created_at': datetime.utcnow().isoformat()
        })
        ticket.response_history = response_history
        flag_modified(ticket, 'response_history')

        db.session.commit()
        log.info(f"Ticket rejected: {ticket.ticket_number}")

        return jsonify({
            "success": True,
            "message": "Ticket rejected",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to reject ticket: {str(e)}"}), 500


def admin_resolve_ticket(ticket_id):
    """Mark a ticket as resolved"""
    try:
        ticket = SupportTicket.query.filter_by(ticket_id=ticket_id, is_deleted=False).first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if ticket.status not in ['approved', 'in_progress']:
            return jsonify({"success": False, "error": "Only approved/in-progress tickets can be resolved"}), 400

        if request.content_type and 'multipart/form-data' in request.content_type:
            data = request.form.to_dict()
        else:
            data = request.get_json() or {}

        old_status = ticket.status
        ticket.status = 'resolved'
        ticket.resolved_by_name = data.get('admin_name', 'Dev Team')
        ticket.resolution_date = datetime.utcnow()
        ticket.resolution_notes = data.get('notes', '')
        ticket.updated_at = datetime.utcnow()

        # Add to response history for resolution
        from sqlalchemy.orm.attributes import flag_modified
        response_history = ticket.response_history or []
        response_history.append({
            'type': 'resolution',
            'response': data.get('notes', ''),
            'admin_name': data.get('admin_name', 'Dev Team'),
            'old_status': old_status,
            'new_status': 'resolved',
            'created_at': datetime.utcnow().isoformat()
        })
        ticket.response_history = response_history
        flag_modified(ticket, 'response_history')

        # Handle file uploads for resolution
        if 'files' in request.files and supabase:
            files = request.files.getlist('files')
            attachments = ticket.attachments or []
            for file in files:
                if file and file.filename and allowed_file(file.filename):
                    try:
                        attachment = upload_file_to_supabase(file, ticket.ticket_id)
                        attachment['uploaded_by'] = data.get('admin_name', 'Dev Team')
                        attachment['uploaded_by_role'] = 'admin'
                        attachment['section'] = 'admin'  # Mark as admin/resolution files
                        attachments.append(attachment)
                    except Exception as e:
                        log.warning(f"Failed to upload file {file.filename}: {str(e)}")
            ticket.attachments = attachments
            flag_modified(ticket, 'attachments')

        db.session.commit()
        log.info(f"Ticket resolved: {ticket.ticket_number}")

        return jsonify({
            "success": True,
            "message": "Ticket resolved",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error resolving ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to resolve ticket: {str(e)}"}), 500


def admin_update_status(ticket_id):
    """Update ticket status"""
    try:
        ticket = SupportTicket.query.filter_by(ticket_id=ticket_id, is_deleted=False).first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        data = request.get_json()
        new_status = data.get('status')

        valid_statuses = ['in_review', 'in_progress', 'closed']
        if new_status not in valid_statuses:
            return jsonify({"success": False, "error": f"Invalid status. Must be one of: {valid_statuses}"}), 400

        old_status = ticket.status
        ticket.status = new_status
        ticket.admin_name = data.get('admin_name', 'Dev Team')
        ticket.updated_at = datetime.utcnow()

        if data.get('response'):
            ticket.admin_response = data['response']
            ticket.response_date = datetime.utcnow()

        # Add to response history for status change
        from sqlalchemy.orm.attributes import flag_modified
        response_history = ticket.response_history or []
        response_history.append({
            'type': 'status_change',
            'response': data.get('response', ''),
            'admin_name': data.get('admin_name', 'Dev Team'),
            'old_status': old_status,
            'new_status': new_status,
            'created_at': datetime.utcnow().isoformat()
        })
        ticket.response_history = response_history
        flag_modified(ticket, 'response_history')

        db.session.commit()
        log.info(f"Ticket status updated: {ticket.ticket_number} to {new_status}")

        return jsonify({
            "success": True,
            "message": f"Ticket status updated to {new_status}",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating ticket status: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to update status: {str(e)}"}), 500


def admin_add_files(ticket_id):
    """Add files to a ticket"""
    try:
        ticket = SupportTicket.query.filter_by(ticket_id=ticket_id, is_deleted=False).first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if 'files' not in request.files:
            return jsonify({"success": False, "error": "No files provided"}), 400

        if not supabase:
            return jsonify({"success": False, "error": "File storage not configured"}), 500

        data = request.form.to_dict() if request.form else {}
        files = request.files.getlist('files')
        attachments = ticket.attachments or []
        uploaded_count = 0

        for file in files:
            if file and file.filename and allowed_file(file.filename):
                try:
                    attachment = upload_file_to_supabase(file, ticket.ticket_id)
                    attachment['uploaded_by'] = data.get('admin_name', 'Dev Team')
                    attachment['uploaded_by_role'] = 'admin'
                    attachments.append(attachment)
                    uploaded_count += 1
                except Exception as e:
                    log.warning(f"Failed to upload file {file.filename}: {str(e)}")

        if uploaded_count == 0:
            return jsonify({"success": False, "error": "No files were uploaded"}), 400

        ticket.attachments = attachments
        ticket.updated_at = datetime.utcnow()

        # Flag attachments as modified for SQLAlchemy to detect JSONB change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(ticket, 'attachments')

        if data.get('response'):
            ticket.admin_response = data['response']
            ticket.admin_name = data.get('admin_name', 'Dev Team')
            ticket.response_date = datetime.utcnow()

        db.session.commit()
        log.info(f"Files added to ticket {ticket.ticket_number}")

        return jsonify({
            "success": True,
            "message": f"{uploaded_count} file(s) uploaded successfully",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error adding files to ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to upload files: {str(e)}"}), 500


def admin_close_ticket(ticket_id):
    """Admin can close a ticket directly (if client forgets to confirm)"""
    try:
        ticket = SupportTicket.query.filter_by(ticket_id=ticket_id, is_deleted=False).first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if ticket.status == 'closed':
            return jsonify({"success": False, "error": "Ticket is already closed"}), 400

        data = request.get_json() or {}
        old_status = ticket.status

        ticket.status = 'closed'
        ticket.admin_name = data.get('admin_name', 'Dev Team')
        ticket.updated_at = datetime.utcnow()

        # Track who closed the ticket
        ticket.closed_by = 'dev_team'
        ticket.closed_by_name = data.get('admin_name', 'Dev Team')
        ticket.closed_date = datetime.utcnow()

        if data.get('notes'):
            # Add closing note to admin response
            closing_note = f"[Closed by Dev Team] {data['notes']}"
            if ticket.admin_response:
                ticket.admin_response = f"{ticket.admin_response}\n\n{closing_note}"
            else:
                ticket.admin_response = closing_note
            ticket.response_date = datetime.utcnow()

        # Add to response history
        from sqlalchemy.orm.attributes import flag_modified
        response_history = ticket.response_history or []
        response_history.append({
            'type': 'closed',
            'response': data.get('notes', ''),
            'admin_name': data.get('admin_name', 'Dev Team'),
            'closed_by': 'dev_team',
            'old_status': old_status,
            'new_status': 'closed',
            'created_at': datetime.utcnow().isoformat()
        })
        ticket.response_history = response_history
        flag_modified(ticket, 'response_history')

        db.session.commit()
        log.info(f"Ticket closed by admin: {ticket.ticket_number}")

        return jsonify({
            "success": True,
            "message": "Ticket closed successfully",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error closing ticket: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to close ticket: {str(e)}"}), 500


def add_comment(ticket_id):
    """Add a comment to a ticket (can be from client or dev team)"""
    try:
        ticket = SupportTicket.query.filter_by(ticket_id=ticket_id, is_deleted=False).first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        message = data.get('message', '').strip()
        if not message:
            return jsonify({"success": False, "error": "Message is required"}), 400

        sender_type = data.get('sender_type', 'client')  # 'client' or 'dev_team'
        sender_name = data.get('sender_name', 'Unknown')
        sender_email = data.get('sender_email', '')

        # Create comment object
        comment = {
            'id': str(uuid.uuid4()),
            'sender_type': sender_type,
            'sender_name': sender_name,
            'sender_email': sender_email,
            'message': message,
            'created_at': datetime.utcnow().isoformat()
        }

        # Add to comments list - create a new list to ensure SQLAlchemy detects the change
        comments = list(ticket.comments) if ticket.comments else []
        comments.append(comment)
        ticket.comments = comments  # Assign new list to trigger JSONB update
        ticket.updated_at = datetime.utcnow()

        # Force SQLAlchemy to detect the JSONB change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(ticket, 'comments')

        db.session.commit()
        log.info(f"Comment added to ticket {ticket.ticket_number} by {sender_name} ({sender_type})")

        return jsonify({
            "success": True,
            "message": "Comment added successfully",
            "comment": comment,
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error adding comment: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to add comment: {str(e)}"}), 500
