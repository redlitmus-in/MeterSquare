from flask import request, jsonify, g, Response
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import or_, and_, func
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.vendor import Vendor
from models.inventory import *
from config.logging import get_logger
from datetime import datetime
from supabase import create_client, Client
import json
import os

log = get_logger()

__all__ = [
    'preview_vendor_email', 'preview_po_child_vendor_email',
    'send_vendor_email', 'send_po_child_vendor_email', 'send_vendor_whatsapp',
]

from controllers.buyer.helpers import (
    process_materials_with_negotiated_prices,
    has_buyer_permissions,
    is_buyer_role,
    is_admin_role,
    sanitize_string,
    MAX_STRING_LENGTH,
    _parse_custom_terms
)

# Configuration constants based on environment
environment = os.environ.get('ENVIRONMENT', 'production')
if environment == 'development':
    supabase_url = os.environ.get('DEV_SUPABASE_URL')
    supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
else:
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_ANON_KEY')
SUPABASE_BUCKET = "file_upload"
# Initialize Supabase client
supabase: Client = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None


def preview_vendor_email(cr_id):
    """Preview vendor purchase order email"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer or completed by this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id and cr.purchase_completed_by_user_id != buyer_id:
            return jsonify({"error": "You don't have access to this purchase"}), 403

        # Check if vendor is selected
        if not cr.selected_vendor_id:
            return jsonify({"error": "No vendor selected for this purchase"}), 400

        # Get vendor details
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Get project details
        project = Project.query.get(cr.project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ details
        boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()

        # Process materials with negotiated prices
        materials_list, cr_total = process_materials_with_negotiated_prices(cr)

        # Prepare data for email template
        vendor_data = {
            'company_name': vendor.company_name or 'N/A',
            'contact_person_name': vendor.contact_person_name or '',
            'email': vendor.email or 'N/A'
        }

        purchase_data = {
            'cr_id': cr.cr_id,
            'materials': materials_list,
            'total_cost': round(cr_total, 2),
            'file_bath' : cr.file_path
        }

        buyer_data = {
            'buyer_name': (buyer.full_name if buyer and buyer.full_name else None) or 'Procurement Team',
            'buyer_email': (buyer.email if buyer and buyer.email else None) or 'N/A',
            'buyer_phone': (buyer.phone if buyer and buyer.phone else None) or 'N/A'
        }

        project_data = {
            'project_name': project.project_name or 'N/A',
            'client': project.client or 'N/A',
            'location': project.location or 'N/A'
        }

        # Get uploaded files information
        uploaded_files = []
        if cr.file_path:
            filenames = [f.strip() for f in cr.file_path.split(",") if f.strip()]
            for filename in filenames:
                file_path = f"buyer/cr_{cr_id}/{filename}"
                file_size = None

                # Try to get file size from Supabase
                try:
                    file_response = supabase.storage.from_(SUPABASE_BUCKET).download(file_path)
                    if file_response:
                        file_size = len(file_response)
                except Exception as e:
                    log.warning(f"Could not get file size for {filename}: {str(e)}")

                uploaded_files.append({
                    "filename": filename,
                    "path": file_path,
                    "size_bytes": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2) if file_size else None,
                    "public_url": f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{file_path}"
                })

        # Generate email preview
        from utils.boq_email_service import BOQEmailService
        email_service = BOQEmailService()
        email_html = email_service.generate_vendor_purchase_order_email(
            vendor_data, purchase_data, buyer_data, project_data
        )

        # Use vendor table values and include uploaded files
        return jsonify({
            "success": True,
            "email_preview": email_html,
            "vendor_email": vendor.email,
            "vendor_name": vendor.company_name,
            "vendor_contact_person": vendor.contact_person_name,
            "vendor_phone": vendor.phone,
            "uploaded_files": uploaded_files,
            "total_attachments": len(uploaded_files)
        }), 200

    except Exception as e:
        log.error(f"Error generating email preview: {str(e)}")
        return jsonify({"error": f"Failed to generate email preview: {str(e)}"}), 500


def preview_po_child_vendor_email(po_child_id):
    """Preview vendor purchase order email for POChild (vendor-split purchases)"""
    try:
        from models.po_child import POChild
        from models.vendor import Vendor
        from utils.boq_email_service import BOQEmailService

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get the POChild record with parent_cr preloaded
        po_child = POChild.query.options(
            joinedload(POChild.parent_cr)
        ).filter_by(id=po_child_id, is_deleted=False).first()
        if not po_child:
            return jsonify({"error": "Purchase order child not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Check if vendor is selected
        if not po_child.vendor_id:
            return jsonify({"error": "No vendor selected for this purchase"}), 400

        # Get vendor details
        vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Get parent CR for project info (use preloaded relationship)
        parent_cr = po_child.parent_cr
        if not parent_cr:
            return jsonify({"error": "Parent purchase order not found"}), 404

        # Get project details
        project = Project.query.get(parent_cr.project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()

        # Process materials from POChild's materials_data
        materials_list = []
        total_cost = 0
        if po_child.materials_data:
            for material in po_child.materials_data:
                mat_total = float(material.get('total_price', 0) or 0)
                materials_list.append({
                    'material_name': material.get('material_name', 'N/A'),
                    'quantity': material.get('quantity', 0),
                    'unit': material.get('unit', 'pcs'),
                    'unit_price': material.get('unit_price', 0),
                    'total_price': round(mat_total, 2)
                })
                total_cost += mat_total

        # Prepare data for email template
        vendor_data = {
            'company_name': vendor.company_name or 'N/A',
            'contact_person_name': vendor.contact_person_name or '',
            'email': vendor.email or 'N/A'
        }

        purchase_data = {
            'cr_id': po_child.parent_cr_id,
            'po_child_id': po_child.id,
            'formatted_id': po_child.get_formatted_id(),
            'materials': materials_list,
            'total_cost': round(total_cost, 2)
        }

        buyer_data = {
            'buyer_name': (buyer.full_name if buyer and buyer.full_name else None) or 'Procurement Team',
            'buyer_email': (buyer.email if buyer and buyer.email else None) or 'N/A',
            'buyer_phone': (buyer.phone if buyer and buyer.phone else None) or 'N/A'
        }

        project_data = {
            'project_name': project.project_name or 'N/A',
            'client': project.client or 'N/A',
            'location': project.location or 'N/A'
        }

        # Get uploaded files from parent CR
        uploaded_files = []
        if parent_cr.file_path:
            filenames = [f.strip() for f in parent_cr.file_path.split(",") if f.strip()]
            for filename in filenames:
                file_path = f"buyer/cr_{parent_cr.cr_id}/{filename}"
                file_size = None
                try:
                    file_response = supabase.storage.from_(SUPABASE_BUCKET).download(file_path)
                    if file_response:
                        file_size = len(file_response)
                except Exception as e:
                    log.warning(f"Could not get file size for {filename}: {str(e)}")

                uploaded_files.append({
                    "filename": filename,
                    "path": file_path,
                    "size_bytes": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2) if file_size else None,
                    "public_url": f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{file_path}"
                })

        # Generate email preview
        email_service = BOQEmailService()
        email_html = email_service.generate_vendor_purchase_order_email(
            vendor_data, purchase_data, buyer_data, project_data
        )

        return jsonify({
            "success": True,
            "email_preview": email_html,
            "vendor_email": vendor.email,
            "vendor_name": vendor.company_name,
            "vendor_contact_person": vendor.contact_person_name,
            "vendor_phone": vendor.phone,
            "uploaded_files": uploaded_files,
            "total_attachments": len(uploaded_files)
        }), 200

    except Exception as e:
        log.error(f"Error generating POChild email preview: {str(e)}")
        return jsonify({"error": f"Failed to generate email preview: {str(e)}"}), 500


def send_vendor_email(cr_id, po_child_id=None):
    """
    Unified function to send purchase order email to vendor with optional LPO PDF attachment

    Handles both:
    - Parent CR (cr_id only)
    - POChild (cr_id + po_child_id)

    Args:
        cr_id: Change Request ID (parent)
        po_child_id: Optional POChild ID for vendor-split purchases
    """
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

        # Get request data
        data = request.get_json()
        vendor_email = data.get('vendor_email')
        custom_email_body = data.get('custom_email_body')
        vendor_company_name = data.get('vendor_company_name')
        vendor_contact_person = data.get('vendor_contact_person')
        vendor_phone = data.get('vendor_phone')
        cc_emails = data.get('cc_emails', [])

        # LPO PDF options
        include_lpo_pdf = data.get('include_lpo_pdf', False)
        lpo_data = data.get('lpo_data')

        # ==================== EMAIL VALIDATION ====================
        if not vendor_email:
            return jsonify({"error": "Vendor email is required"}), 400

        import re
        email_list = [email.strip() for email in vendor_email.split(',') if email.strip()]
        email_regex = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
        invalid_emails = [email for email in email_list if not email_regex.match(email)]

        if invalid_emails:
            return jsonify({"error": f"Invalid email address: {invalid_emails[0]}"}), 400
        if not email_list:
            return jsonify({"error": "At least one valid email address is required"}), 400

        # ==================== DETERMINE IF PARENT CR OR POCHILD ====================
        is_po_child = po_child_id is not None

        if is_po_child:
            # Get POChild record
            from models.po_child import POChild
            po_child = POChild.query.options(
                joinedload(POChild.parent_cr)
            ).filter_by(id=po_child_id, is_deleted=False).first()
            if not po_child:
                return jsonify({"error": "Purchase order child not found"}), 404

            # Get parent CR for project info (use preloaded relationship)
            parent_cr = po_child.parent_cr
            if not parent_cr:
                return jsonify({"error": "Parent purchase order not found"}), 404

            # Set variables from POChild
            vendor_id = po_child.vendor_id
            vendor_selection_status = po_child.vendor_selection_status
            materials_list = po_child.materials_data or []
            total_cost = po_child.materials_total_cost or 0
            formatted_id = po_child.get_formatted_id()
            project_id = po_child.project_id or parent_cr.project_id
            boq_id = po_child.boq_id or parent_cr.boq_id
            file_path = parent_cr.file_path  # Use parent CR's attachments
            email_record = po_child  # Will update POChild email status
            parent_cr_id = parent_cr.cr_id  # For file storage path
        else:
            # Get parent CR
            parent_cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
            if not parent_cr:
                return jsonify({"error": "Purchase not found"}), 404

            # Set variables from CR
            vendor_id = parent_cr.selected_vendor_id
            vendor_selection_status = parent_cr.vendor_selection_status
            materials_list, total_cost = process_materials_with_negotiated_prices(parent_cr)
            formatted_id = parent_cr.get_formatted_cr_id()
            project_id = parent_cr.project_id
            boq_id = parent_cr.boq_id
            file_path = parent_cr.file_path
            email_record = parent_cr  # Will update CR email status
            parent_cr_id = parent_cr.cr_id  # For file storage path

        # ==================== PERMISSION CHECKS ====================
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        if not is_admin and not is_admin_viewing and parent_cr.assigned_to_buyer_user_id != buyer_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # ==================== VENDOR VALIDATION ====================
        if not vendor_id:
            return jsonify({"error": "No vendor selected for this purchase"}), 400
        if vendor_selection_status != 'approved':
            return jsonify({"error": "Vendor selection must be approved by TD before sending email"}), 400

        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Update vendor details if provided
        if vendor_company_name and vendor_company_name != vendor.company_name:
            vendor.company_name = vendor_company_name
        if vendor_contact_person and vendor_contact_person != vendor.contact_person_name:
            vendor.contact_person_name = vendor_contact_person
        if vendor_phone and vendor_phone != vendor.phone:
            sanitized_phone = vendor_phone.strip()
            while sanitized_phone.count('+971') > 1:
                sanitized_phone = sanitized_phone.replace('+971 ', '', 1)
            vendor.phone = sanitized_phone[:20]
        if vendor_email and vendor_email != vendor.email:
            vendor.email = vendor_email

        # ==================== GET RELATED DATA ====================
        buyer = User.query.filter_by(user_id=buyer_id).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # ==================== PREPARE EMAIL DATA ====================
        vendor_data = {
            'company_name': vendor.company_name,
            'contact_person_name': vendor.contact_person_name,
            'email': email_list[0]
        }

        purchase_data = {
            'cr_id': cr_id,
            'po_child_id': po_child_id if is_po_child else None,
            'formatted_id': formatted_id,
            'materials': materials_list,
            'total_cost': round(total_cost, 2)
        }

        buyer_data = {
            'buyer_name': (buyer.full_name if buyer and buyer.full_name else None) or 'Procurement Team',
            'buyer_email': (buyer.email if buyer and buyer.email else None) or 'N/A',
            'buyer_phone': (buyer.phone if buyer and buyer.phone else None) or 'N/A'
        }

        project_data = {
            'project_name': project.project_name or 'N/A',
            'client': project.client or 'N/A',
            'location': project.location or 'N/A'
        }

        # ==================== FETCH ATTACHMENTS ====================
        attachments = []
        if file_path:
            try:
                filenames = [f.strip() for f in file_path.split(",") if f.strip()]
                for filename in filenames:
                    try:
                        # Build the full path in Supabase storage
                        supabase_file_path = f"buyer/cr_{parent_cr_id}/{filename}"
                        file_response = supabase.storage.from_(SUPABASE_BUCKET).download(supabase_file_path)

                        if file_response:
                            # Determine MIME type based on file extension
                            ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
                            mime_types = {
                                # Documents
                                'pdf': 'application/pdf',
                                'doc': 'application/msword',
                                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'xls': 'application/vnd.ms-excel',
                                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                'ppt': 'application/vnd.ms-powerpoint',
                                'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                                'csv': 'text/csv',
                                # Images
                                'png': 'image/png',
                                'jpg': 'image/jpeg',
                                'jpeg': 'image/jpeg',
                                'gif': 'image/gif',
                                'bmp': 'image/bmp',
                                'tiff': 'image/tiff',
                                'svg': 'image/svg+xml',
                                'webp': 'image/webp',
                                # Text
                                'txt': 'text/plain',
                                # Archives
                                'zip': 'application/zip',
                                'rar': 'application/x-rar-compressed',
                                '7z': 'application/x-7z-compressed',
                                # CAD files
                                'dwg': 'application/acad',
                                'dxf': 'application/dxf',
                                'dwf': 'application/x-dwf',
                                'dgn': 'application/x-dgn',
                                'rvt': 'application/octet-stream',
                                'rfa': 'application/octet-stream',
                                'nwd': 'application/octet-stream',
                                'nwc': 'application/octet-stream',
                                'ifc': 'application/x-step',
                                'sat': 'application/x-sat',
                                'step': 'application/x-step',
                                'stp': 'application/x-step',
                                'iges': 'application/iges',
                                'igs': 'application/iges',
                                # 3D files
                                'skp': 'application/vnd.sketchup.skp',
                                'obj': 'text/plain',
                                'fbx': 'application/octet-stream',
                                '3ds': 'application/x-3ds',
                                'stl': 'model/stl',
                                'ply': 'text/plain',
                                'dae': 'model/vnd.collada+xml'
                            }
                            mime_type = mime_types.get(ext, 'application/octet-stream')

                            # Add to attachments list
                            attachments.append((filename, file_response, mime_type))
                        else:
                            log.warning(f"Could not download file: {filename} for CR-{cr_id}")

                    except Exception as e:
                        log.error(f"Error downloading file {filename}: {str(e)}")
                        # Continue with other files even if one fails
                        continue

            except Exception as e:
                log.error(f"Error processing attachments for CR-{cr_id}: {str(e)}")

        # ==================== GENERATE LPO PDF ====================
        if include_lpo_pdf and lpo_data:
            try:
                from utils.lpo_pdf_generator import LPOPDFGenerator
                generator = LPOPDFGenerator()
                pdf_bytes = generator.generate_lpo_pdf(lpo_data)

                # Create filename: LPO-400.pdf or LPO-400.1.pdf
                project_name_clean = project.project_name.replace(' ', '_')[:20] if project else 'Project'
                lpo_filename = f"LPO-{formatted_id.replace('PO-', '')}-{project_name_clean}.pdf"

                # Add LPO PDF to attachments
                attachments.append((lpo_filename, pdf_bytes, 'application/pdf'))
                log.info(f"✅ LPO PDF generated and attached: {lpo_filename}")
            except Exception as e:
                log.error(f"❌ Error generating LPO PDF for {formatted_id}: {str(e)}")
                # Continue sending email even if LPO PDF generation fails

        # ==================== SEND EMAIL ====================
        from utils.boq_email_service import BOQEmailService
        email_service = BOQEmailService()
        cc_email_list = [cc.get('email') for cc in cc_emails if cc.get('email')]

        email_sent = email_service.send_vendor_purchase_order_async(
            email_list, vendor_data, purchase_data, buyer_data, project_data, custom_email_body, attachments, cc_email_list
        )

        # ==================== UPDATE EMAIL STATUS ====================
        if email_sent:
            # Mark email as sent (works for both CR and POChild)
            email_record.vendor_email_sent = True
            email_record.vendor_email_sent_date = datetime.utcnow()
            email_record.updated_at = datetime.utcnow()
            db.session.commit()

            recipient_count = len(email_list)
            po_type = "POChild" if is_po_child else "Parent CR"
            log.info(f"✅ Email sent for {formatted_id} ({po_type}) to {recipient_count} recipient(s)")

            return jsonify({
                "success": True,
                "message": f"Purchase order email sent to {recipient_count} recipient(s) successfully",
                "formatted_id": formatted_id,
                "is_po_child": is_po_child
            }), 200
        else:
            log.error(f"❌ Failed to send email for {formatted_id}")
            return jsonify({
                "success": False,
                "message": "Failed to send email to vendor"
            }), 500

    except Exception as e:
        log.error(f"Error sending vendor email: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send vendor email: {str(e)}"}), 500


def send_po_child_vendor_email(po_child_id):
    """
    DEPRECATED: Wrapper function for backward compatibility

    This function redirects to the unified send_vendor_email function.
    Use send_vendor_email(cr_id, po_child_id) directly instead.
    """
    try:
        from models.po_child import POChild

        # Get POChild to find parent CR ID
        po_child = POChild.query.filter_by(id=po_child_id, is_deleted=False).first()
        if not po_child:
            return jsonify({"error": "Purchase order child not found"}), 404

        # Redirect to unified function with LPO support
        log.info(f"🔄 Redirecting POChild {po_child_id} to unified send_vendor_email")
        return send_vendor_email(cr_id=po_child.parent_cr_id, po_child_id=po_child_id)

    except Exception as e:
        log.error(f"Error in send_po_child_vendor_email wrapper: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send vendor email: {str(e)}"}), 500


def send_vendor_whatsapp(cr_id):
    """Send purchase order via WhatsApp to vendor with LPO PDF - supports both parent CR and POChild"""
    try:
        from utils.whatsapp_service import WhatsAppService
        from datetime import datetime
        from models.po_child import POChild
        from models.vendor import Vendor

        # Ensure clean database session state at start
        try:
            db.session.rollback()
        except:
            pass

        current_user = g.user
        buyer_id = current_user['user_id']

        data = request.get_json()
        log.debug(f"WhatsApp request received for CR")

        vendor_phone = data.get('vendor_phone')
        include_lpo_pdf = data.get('include_lpo_pdf', True)  # Default to include PDF
        lpo_data = data.get('lpo_data')  # LPO customization data from frontend
        po_child_id = data.get('po_child_id')  # Optional: for POChild records

        if not vendor_phone:
            return jsonify({"error": "Vendor phone number is required"}), 400

        # Get the change request (parent)
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase order not found"}), 404

        # Check if this is a POChild request or parent CR request
        po_child = None
        vendor_id = None

        if po_child_id:
            # POChild specified directly
            po_child = POChild.query.filter_by(id=po_child_id, is_deleted=False).first()
            if po_child and po_child.vendor_id:
                vendor_id = po_child.vendor_id
                if po_child.vendor_selection_status != 'approved':
                    return jsonify({"error": "Vendor selection must be approved by TD before sending WhatsApp"}), 400

        if not vendor_id:
            # Try to find POChild by parent_cr_id with approved vendor
            po_children = POChild.query.filter_by(
                parent_cr_id=cr_id,
                is_deleted=False,
                vendor_selection_status='approved'
            ).all()

            if po_children:
                # Find the POChild that matches the vendor phone
                for pc in po_children:
                    if pc.vendor_id:
                        v = Vendor.query.filter_by(vendor_id=pc.vendor_id, is_deleted=False).first()
                        if v and v.phone == vendor_phone:
                            po_child = pc
                            vendor_id = pc.vendor_id
                            break

                # If no match by phone, use first approved POChild
                if not vendor_id and po_children:
                    po_child = po_children[0]
                    vendor_id = po_child.vendor_id

        if not vendor_id:
            # Fall back to parent CR's vendor
            if cr.selected_vendor_id:
                vendor_id = cr.selected_vendor_id
                if cr.vendor_selection_status != 'approved':
                    return jsonify({"error": "Vendor selection must be approved by TD before sending WhatsApp"}), 400
            else:
                return jsonify({"error": "No vendor selected for this purchase"}), 400

        # Get vendor details
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        # Get project details
        project = Project.query.filter_by(project_id=cr.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get materials - use POChild materials if available, otherwise parent CR
        if po_child and po_child.materials_data:
            # Use POChild's materials
            materials_list = []
            po_total = 0
            for material in po_child.materials_data:
                mat_total = float(material.get('total_price', 0) or 0)
                materials_list.append({
                    'material_name': material.get('material_name', ''),
                    'sub_item_name': material.get('sub_item_name', ''),
                    'quantity': material.get('quantity', 0),
                    'unit': material.get('unit', ''),
                    'unit_price': float(material.get('unit_price', 0) or 0),
                    'total_price': mat_total,
                    'negotiated_price': float(material.get('negotiated_price', 0) or material.get('unit_price', 0) or 0)
                })
                po_total += mat_total
            cr_total = po_child.materials_total_cost or po_total
        else:
            # Use parent CR's materials
            materials_list, cr_total = process_materials_with_negotiated_prices(cr)

        # Prepare data for message generation
        vendor_data = {
            'company_name': vendor.company_name or 'N/A',
            'contact_person_name': vendor.contact_person_name or '',
            'phone': vendor_phone
        }

        # Use POChild's formatted ID if available
        display_cr_id = po_child.get_formatted_id() if po_child else f"PO-{cr_id}"

        purchase_data = {
            'cr_id': display_cr_id.replace('PO-', '') if display_cr_id.startswith('PO-') else cr_id,
            'date': datetime.utcnow().strftime('%d/%m/%Y'),
            'materials': materials_list,
            'total_cost': round(cr_total, 2)
        }

        # Get system settings for company phone (used in WhatsApp message)
        from models.system_settings import SystemSettings
        settings = SystemSettings.query.first()
        company_phone = settings.company_phone if settings and settings.company_phone else ''

        buyer_data = {
            'name': buyer.full_name or buyer.username or 'Buyer',
            'email': buyer.email or '',
            'phone': company_phone  # Use company phone instead of buyer's personal phone
        }

        project_data = {
            'project_name': project.project_name,
            'location': project.location or '',
            'client': project.client or ''
        }

        # Generate LPO PDF if requested
        pdf_url = None

        if include_lpo_pdf:
            try:
                from utils.lpo_pdf_generator import LPOPDFGenerator
                from models.system_settings import SystemSettings
                from models.lpo_customization import LPOCustomization
                log.info("Step 1: Starting PDF generation...")

                # If no lpo_data provided, generate using same logic as preview_lpo_pdf
                if not lpo_data:
                    # Get saved customizations if any
                    # Priority: 1) PO child specific, 2) CR-level customization
                    saved_customization = None
                    try:
                        if po_child and po_child_id:
                            # First try to find customization specific to this PO child
                            saved_customization = LPOCustomization.query.filter_by(cr_id=cr_id, po_child_id=po_child_id).first()
                        if not saved_customization:
                            # Fall back to CR-level customization (po_child_id is NULL)
                            saved_customization = LPOCustomization.query.filter_by(cr_id=cr_id, po_child_id=None).first()
                    except Exception as e:
                        log.warning(f"Error fetching LPOCustomization: {e}")
                        db.session.rollback()  # Rollback to clear any failed transaction

                    # Get system settings
                    settings = SystemSettings.query.first()

                    # Calculate items with proper structure
                    subtotal = 0
                    items = []
                    for i, material in enumerate(materials_list, 1):
                        rate = material.get('negotiated_price') if material.get('negotiated_price') is not None else material.get('unit_price', 0)
                        qty = material.get('quantity', 0)
                        amount = float(qty) * float(rate)
                        subtotal += amount

                        # Get separate fields for material name, brand, and specification
                        material_name = material.get('material_name', '') or material.get('sub_item_name', '')
                        brand = material.get('brand', '')
                        specification = material.get('specification', '')

                        items.append({
                            "sl_no": i,
                            "material_name": material_name,
                            "brand": brand,
                            "specification": specification,
                            "description": material_name,  # Keep for backward compatibility
                            "qty": qty,
                            "unit": material.get('unit', 'Nos'),
                            "rate": round(rate, 2),
                            "amount": round(amount, 2)
                        })

                    # VAT - use saved customization values, otherwise default to 5%
                    if saved_customization and hasattr(saved_customization, 'vat_percent'):
                        vat_percent = float(saved_customization.vat_percent) if saved_customization.vat_percent is not None else 5.0
                        vat_amount = (subtotal * vat_percent) / 100
                    else:
                        # Default: 5% VAT
                        vat_percent = 5.0
                        vat_amount = (subtotal * 5.0) / 100
                    grand_total = subtotal + vat_amount

                    DEFAULT_COMPANY_TRN = "100223723600003"
                    # Use a different variable name to avoid overwriting request vendor_phone
                    vendor_phone_for_pdf = vendor.phone or ""
                    vendor_trn = getattr(vendor, 'trn', '') or getattr(vendor, 'gst_number', '') or ""
                    default_subject = cr.item_name or cr.justification or ""

                    import json

                    # Get vendor phone with code for PDF display
                    vendor_phone_formatted = ""
                    if hasattr(vendor, 'phone_code') and vendor.phone_code and vendor.phone:
                        vendor_phone_formatted = f"{vendor.phone_code} {vendor.phone}"
                    elif vendor.phone:
                        vendor_phone_formatted = vendor.phone

                    # Parse custom_terms from saved customization (new format - replaces old general_terms and payment_terms_list)
                    custom_terms_data = _parse_custom_terms(saved_customization)

                    lpo_data = {
                        "vendor": {
                            "company_name": vendor.company_name or "",
                            "contact_person": vendor.contact_person_name or "",
                            "phone": vendor_phone_formatted,
                            "fax": getattr(vendor, 'fax', '') or "",
                            "email": vendor.email or "",
                            "trn": vendor_trn,
                            "project": project.project_name or "",
                            "subject": saved_customization.subject if saved_customization and saved_customization.subject else default_subject
                        },
                        "company": {
                            "name": settings.company_name if settings else "Meter Square Interiors LLC",
                            "contact_person": getattr(settings, 'company_contact_person', 'Mr. Mohammed Sabir') if settings else "Mr. Mohammed Sabir",
                            "division": "Admin",
                            "phone": settings.company_phone if settings else "",
                            "fax": getattr(settings, 'company_fax', '') if settings else "",
                            "email": settings.company_email if settings else "",
                            "trn": getattr(settings, 'company_trn', '') or DEFAULT_COMPANY_TRN if settings else DEFAULT_COMPANY_TRN
                        },
                        "lpo_info": {
                            "lpo_number": f"MS/PO/{po_child.get_formatted_id().replace('PO-', '')}" if po_child else f"MS/PO/{cr_id}",
                            "lpo_date": datetime.utcnow().strftime('%d.%m.%Y'),
                            "quotation_ref": saved_customization.quotation_ref if saved_customization else "",
                            "custom_message": saved_customization.custom_message if saved_customization and saved_customization.custom_message else "Thank you very much for quoting us for requirements. As per your quotation and settlement done over the mail, we are issuing the LPO and please ensure the delivery on time"
                        },
                        "items": items,
                        "totals": {
                            "subtotal": round(subtotal, 2),
                            "vat_percent": vat_percent,
                            "vat_amount": round(vat_amount, 2),
                            "grand_total": round(grand_total, 2)
                        },
                        "terms": {
                            "payment_terms": saved_customization.payment_terms if saved_customization and saved_customization.payment_terms else (getattr(settings, 'default_payment_terms', '100% CDC after delivery') if settings else "100% CDC after delivery"),
                            "delivery_terms": saved_customization.completion_terms if saved_customization and saved_customization.completion_terms else "",
                            "custom_terms": custom_terms_data
                        },
                        "signatures": {
                            "md_name": getattr(settings, 'md_name', 'Managing Director') if settings else "Managing Director",
                            "md_signature": getattr(settings, 'md_signature_image', None) if settings else None,
                            "td_name": getattr(settings, 'td_name', 'Technical Director') if settings else "Technical Director",
                            "td_signature": getattr(settings, 'td_signature_image', None) if settings else None,
                            "stamp_image": getattr(settings, 'company_stamp_image', None) if settings else None,
                            "is_system_signature": True
                        },
                        "header_image": getattr(settings, 'lpo_header_image', None) if settings else None
                    }

                generator = LPOPDFGenerator()
                pdf_bytes = generator.generate_lpo_pdf(lpo_data)
                log.debug(f"LPO PDF generated successfully, size: {len(pdf_bytes)} bytes")

                # Upload PDF to Supabase and get public URL
                # Use timestamp to make filename unique
                import time
                timestamp = int(time.time())
                project_name_clean = project.project_name.replace(' ', '_')[:20] if project else 'Project'
                # Use POChild ID if available for correct PO number
                po_id_for_filename = po_child.get_formatted_id().replace('PO-', '') if po_child else str(cr_id)
                pdf_filename = f"LPO-{po_id_for_filename}-{timestamp}.pdf"
                # Use buyer/cr_X/lpo/ path which is allowed by Supabase RLS policy
                pdf_path = f"buyer/cr_{cr_id}/lpo/{pdf_filename}"

                # Try to use service role key to bypass RLS for server-side uploads
                from supabase import create_client as create_supabase_client
                upload_supabase_url = os.environ.get('DEV_SUPABASE_URL') if environment == 'development' else os.environ.get('SUPABASE_URL')
                # Try service role key first (bypasses RLS), fallback to anon key
                service_role_key = os.environ.get('DEV_SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
                if service_role_key:
                    upload_supabase_key = service_role_key
                else:
                    upload_supabase_key = os.environ.get('DEV_SUPABASE_KEY') if environment == 'development' else os.environ.get('SUPABASE_KEY')

                upload_client = create_supabase_client(upload_supabase_url, upload_supabase_key)

                # Upload the file with proper content-disposition for filename
                upload_result = upload_client.storage.from_(SUPABASE_BUCKET).upload(
                    pdf_path,
                    pdf_bytes,
                    {
                        "content-type": "application/pdf",
                        "content-disposition": f'attachment; filename="{pdf_filename}"',
                        "x-upsert": "true"  # Allow overwrite if exists
                    }
                )

                # Get public URL
                pdf_url = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(pdf_path)
                log.debug(f"PDF uploaded and URL generated")

            except Exception as e:
                log.error(f"Error in PDF generation/upload: {str(e)}")
                import traceback
                log.error(f"Traceback: {traceback.format_exc()}")
                # Rollback any failed database transaction
                try:
                    db.session.rollback()
                except:
                    pass
                # Continue without PDF

        # Send WhatsApp message
        log.info(f"=== SENDING WHATSAPP MESSAGE ===")
        whatsapp_service = WhatsAppService()
        result = whatsapp_service.send_purchase_order(
            phone_number=vendor_phone,
            vendor_data=vendor_data,
            purchase_data=purchase_data,
            buyer_data=buyer_data,
            project_data=project_data,
            pdf_url=pdf_url
        )
        log.info(f"WhatsApp send_purchase_order result: {result}")

        if result.get('success'):
            # Update WhatsApp sent status
            if po_child:
                # Update POChild WhatsApp sent status
                po_child.vendor_whatsapp_sent = True
                po_child.vendor_whatsapp_sent_at = datetime.utcnow()
                po_child.updated_at = datetime.utcnow()
            else:
                # Update parent CR WhatsApp sent status
                cr.vendor_whatsapp_sent = True
                cr.vendor_whatsapp_sent_at = datetime.utcnow()
                cr.updated_at = datetime.utcnow()
            db.session.commit()

            return jsonify({
                "success": True,
                "message": "Purchase order sent via WhatsApp successfully"
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": result.get('message', 'Failed to send WhatsApp message'),
                "debug": result.get('debug', {})
            }), 500

    except Exception as e:
        log.error(f"Error sending vendor WhatsApp: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        # Rollback any failed database transaction
        try:
            db.session.rollback()
        except:
            pass
        return jsonify({"error": f"Failed to send vendor WhatsApp: {str(e)}"}), 500
