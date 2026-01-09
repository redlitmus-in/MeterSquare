"""
Asset Requisition Controller
Handles SE asset requests with PM and Production Manager approval workflow

Workflow:
1. SE creates requisition → status: pending_pm
2. PM approves → status: pending_prod_mgr
3. Production Manager approves → status: prod_mgr_approved
4. Production Manager dispatches → status: dispatched
5. SE confirms receipt → status: completed
"""

from flask import jsonify, request, g, current_app
from config.db import db
from sqlalchemy.orm import joinedload, lazyload
from sqlalchemy import or_, cast, String
from models.asset_requisition import AssetRequisition, RequisitionStatus, UrgencyLevel
from models.returnable_assets import ReturnableAssetCategory, ReturnableAssetItem
from models.project import Project
from models.user import User
from models.role import Role
from datetime import datetime


# ==================== ROLE CHECK HELPER FUNCTIONS ====================

def is_site_engineer(user_role: str) -> bool:
    """Check if user role is Site Engineer"""
    if not user_role:
        return False
    role_lower = user_role.lower().replace(' ', '_').replace('-', '_')
    return role_lower in ['site_engineer', 'siteengineer', 'site_supervisor', 'sitesupervisor']


def is_project_manager(user_role: str) -> bool:
    """Check if user role is Project Manager"""
    if not user_role:
        return False
    role_lower = user_role.lower().replace(' ', '_').replace('-', '_')
    return role_lower in ['project_manager', 'projectmanager', 'pm']


def is_production_manager(user_role: str) -> bool:
    """Check if user role is Production Manager"""
    if not user_role:
        return False
    role_lower = user_role.lower().replace(' ', '_').replace('-', '_')
    return role_lower in ['production_manager', 'productionmanager']


def is_admin_role(user_role: str) -> bool:
    """Check if user role is Admin"""
    if not user_role:
        return False
    return user_role.lower() == 'admin'


def has_pm_permissions(user_role: str) -> bool:
    """Check if user has PM-level permissions (PM, Admin)"""
    return is_project_manager(user_role) or is_admin_role(user_role)


def has_prod_mgr_permissions(user_role: str) -> bool:
    """Check if user has Production Manager-level permissions (Production Manager, Admin)"""
    return is_production_manager(user_role) or is_admin_role(user_role)


# ==================== HELPER FUNCTIONS ====================

def get_user_name(user_id):
    """Get full name of user by ID"""
    try:
        user = User.query.get(user_id)
        return user.full_name if user else None
    except Exception as e:
        current_app.logger.error(f"Error fetching user {user_id}: {e}")
        return None


def get_user_role(user_id):
    """Get user's role name"""
    try:
        user = User.query.options(joinedload(User.role)).get(user_id)
        if user and user.role:
            return user.role.role.lower().replace(' ', '_').replace('-', '_')
        return None
    except Exception as e:
        current_app.logger.error(f"Error fetching user role: {e}")
        return None


def get_users_by_role(role_name):
    """Get list of user IDs with a specific role"""
    try:
        normalized_role = role_name.lower().replace(' ', '').replace('_', '').replace('-', '')
        users = User.query.join(Role, User.role_id == Role.role_id).filter(
            or_(
                Role.role.ilike(f'%{role_name}%'),
                Role.role.ilike(f'%{normalized_role}%')
            ),
            User.is_active == True
        ).all()
        return [u.user_id for u in users]
    except Exception as e:
        current_app.logger.error(f"Error fetching users by role {role_name}: {e}")
        return []


def get_project_pm_user_ids(project_id):
    """Get PM user IDs assigned to a project"""
    try:
        project = Project.query.get(project_id)
        if not project:
            return []

        pm_ids = []

        # Project.user_id is a JSONB array containing PM IDs like [1, 2, 3]
        if project.user_id:
            if isinstance(project.user_id, list):
                pm_ids.extend(project.user_id)
            elif isinstance(project.user_id, int):
                pm_ids.append(project.user_id)

        # If no specific PM from project, try PMAssignSS
        if not pm_ids:
            try:
                from models.pm_assign_ss import PMAssignSS
                pm_assign_records = PMAssignSS.query.filter(
                    PMAssignSS.project_id == project_id
                ).all()
                for record in pm_assign_records:
                    if record.pm_ids:
                        pm_ids.append(record.pm_ids)
                    if record.assigned_by_pm_id:
                        pm_ids.append(record.assigned_by_pm_id)
            except Exception:
                pass

        # If still no PM, get all PMs
        if not pm_ids:
            pm_ids = get_users_by_role('projectmanager')

        return list(set(pm_ids))
    except Exception as e:
        current_app.logger.error(f"Error fetching project PM: {e}")
        return get_users_by_role('projectmanager')


def validate_positive_integer(value, field_name):
    """Validate that a value is a positive integer"""
    if value is None:
        return False, f'{field_name} is required'
    if not isinstance(value, int) or value <= 0:
        return False, f'{field_name} must be a positive integer'
    return True, None


def send_requisition_notification(notification_type, requisition, recipients, actor_name=None, reason=None):
    """Send notification for requisition events"""
    try:
        from utils.comprehensive_notification_service import ComprehensiveNotificationService

        project_name = requisition.project.project_name if requisition.project else 'Unknown'

        # Handle multi-item requisitions
        if requisition.items and len(requisition.items) > 0:
            # Multi-item: build summary like "3 items (Chair x2, Table x1)"
            items_summary = ', '.join([
                f"{item.get('category_name', item.get('category_code', 'Item'))} x{item.get('quantity', 1)}"
                for item in requisition.items[:3]  # Show first 3 items
            ])
            if len(requisition.items) > 3:
                items_summary += f" +{len(requisition.items) - 3} more"
            category_name = f"{len(requisition.items)} items ({items_summary})"
            quantity = sum(item.get('quantity', 1) for item in requisition.items)
        else:
            # Legacy single-item
            category_name = requisition.category.category_name if requisition.category else 'Unknown'
            quantity = requisition.quantity or 1

        if notification_type == 'created':
            ComprehensiveNotificationService.notify_asset_requisition_created(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_id=requisition.project_id,
                project_name=project_name,
                asset_name=category_name,
                quantity=quantity,
                se_user_id=requisition.requested_by_user_id,
                se_name=requisition.requested_by_name,
                pm_user_ids=recipients
            )
        elif notification_type == 'pm_approved':
            ComprehensiveNotificationService.notify_asset_requisition_pm_approved(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                asset_name=category_name,
                pm_user_id=requisition.pm_reviewed_by_user_id,
                pm_name=actor_name,
                prod_mgr_user_ids=recipients
            )
        elif notification_type == 'pm_rejected':
            ComprehensiveNotificationService.notify_asset_requisition_pm_rejected(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                asset_name=category_name,
                pm_user_id=requisition.pm_reviewed_by_user_id,
                pm_name=actor_name,
                se_user_id=requisition.requested_by_user_id,
                rejection_reason=reason
            )
        elif notification_type == 'prod_mgr_approved':
            ComprehensiveNotificationService.notify_asset_requisition_prod_mgr_approved(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                asset_name=category_name,
                prod_mgr_user_id=requisition.prod_mgr_reviewed_by_user_id,
                prod_mgr_name=actor_name,
                se_user_id=requisition.requested_by_user_id
            )
        elif notification_type == 'prod_mgr_rejected':
            ComprehensiveNotificationService.notify_asset_requisition_prod_mgr_rejected(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                asset_name=category_name,
                prod_mgr_user_id=requisition.prod_mgr_reviewed_by_user_id,
                prod_mgr_name=actor_name,
                se_user_id=requisition.requested_by_user_id,
                rejection_reason=reason
            )
        elif notification_type == 'dispatched':
            ComprehensiveNotificationService.notify_asset_requisition_dispatched(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                asset_name=category_name,
                quantity=quantity,
                prod_mgr_user_id=requisition.dispatched_by_user_id,
                prod_mgr_name=actor_name,
                se_user_id=requisition.requested_by_user_id
            )
    except Exception as e:
        current_app.logger.error(f"Error sending requisition notification: {e}")


# ==================== SE ENDPOINTS ====================

def create_asset_requisition():
    """SE creates a new asset requisition (supports multiple items)"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))
        user_email = g.user.get('email', 'system')

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Validate required fields
        project_id = data.get('project_id')
        is_valid, error = validate_positive_integer(project_id, 'project_id')
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        purpose = data.get('purpose')
        if not purpose or not isinstance(purpose, str) or not purpose.strip():
            return jsonify({'success': False, 'error': 'purpose is required'}), 400

        required_date = data.get('required_date')
        if not required_date:
            return jsonify({'success': False, 'error': 'required_date is required'}), 400

        # Parse required_date
        try:
            required_date_parsed = datetime.strptime(required_date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'success': False, 'error': 'required_date must be in YYYY-MM-DD format'}), 400

        # Validate project exists
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'}), 404

        # Check for multi-item request (items array) or single item (category_id)
        items_data = data.get('items', [])
        category_id = data.get('category_id')
        quantity = data.get('quantity', 1)

        # Build items list
        validated_items = []

        if items_data and isinstance(items_data, list) and len(items_data) > 0:
            # Multi-item request
            for item in items_data:
                item_category_id = item.get('category_id')
                item_quantity = item.get('quantity', 1)

                if not item_category_id:
                    continue

                category = ReturnableAssetCategory.query.get(item_category_id)
                if not category:
                    continue

                validated_items.append({
                    'category_id': category.category_id,
                    'category_code': category.category_code,
                    'category_name': category.category_name,
                    'quantity': item_quantity,
                    'tracking_mode': category.tracking_mode
                })
        elif category_id:
            # Single item request (backward compatible)
            is_valid, error = validate_positive_integer(category_id, 'category_id')
            if not is_valid:
                return jsonify({'success': False, 'error': error}), 400

            is_valid, error = validate_positive_integer(quantity, 'quantity')
            if not is_valid:
                return jsonify({'success': False, 'error': error}), 400

            category = ReturnableAssetCategory.query.get(category_id)
            if not category:
                return jsonify({'success': False, 'error': 'Asset category not found'}), 404

            validated_items.append({
                'category_id': category.category_id,
                'category_code': category.category_code,
                'category_name': category.category_name,
                'quantity': quantity,
                'tracking_mode': category.tracking_mode
            })

        if not validated_items:
            return jsonify({'success': False, 'error': 'At least one valid item is required'}), 400

        # Validate urgency
        urgency = data.get('urgency', UrgencyLevel.NORMAL)
        valid_urgencies = [UrgencyLevel.URGENT, UrgencyLevel.HIGH, UrgencyLevel.NORMAL, UrgencyLevel.LOW]
        if urgency not in valid_urgencies:
            urgency = UrgencyLevel.NORMAL

        # Generate requisition code
        requisition_code = AssetRequisition.generate_requisition_code()

        # For backward compatibility, set category_id if single item
        first_item = validated_items[0] if len(validated_items) == 1 else None

        # Create requisition with items (starts as draft - SE needs to manually send to PM)
        requisition = AssetRequisition(
            requisition_code=requisition_code,
            project_id=project_id,
            # Legacy single-item fields (for backward compatibility)
            category_id=first_item['category_id'] if first_item else None,
            quantity=first_item['quantity'] if first_item else None,
            # Multi-item support
            items=validated_items,
            required_date=required_date_parsed,
            urgency=urgency,
            purpose=purpose.strip(),
            site_location=data.get('site_location'),
            status=RequisitionStatus.DRAFT,  # Start as draft, SE sends to PM manually
            approval_required_from=None,  # No approval required while in draft
            requested_by_user_id=user_id,
            requested_by_name=user_name,
            requested_at=datetime.utcnow(),
            created_by=user_email,
            last_modified_by=user_email
        )

        db.session.add(requisition)
        db.session.commit()

        # No automatic notification - SE will send to PM manually

        return jsonify({
            'success': True,
            'message': f'Asset requisition created as draft with {len(validated_items)} item(s). Send to PM for approval.',
            'data': requisition.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating asset requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def get_my_requisitions():
    """SE gets their own requisitions"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Filter by status if provided
        status_filter = request.args.get('status')
        project_filter = request.args.get('project_id')

        query = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).filter(
            AssetRequisition.requested_by_user_id == user_id,
            AssetRequisition.is_deleted == False
        )

        if status_filter and status_filter != 'all':
            query = query.filter(AssetRequisition.status == status_filter)

        if project_filter:
            try:
                query = query.filter(AssetRequisition.project_id == int(project_filter))
            except ValueError:
                pass

        requisitions = query.order_by(AssetRequisition.created_at.desc()).all()

        return jsonify({
            'success': True,
            'data': [r.to_dict() for r in requisitions],
            'total': len(requisitions)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching my requisitions: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def confirm_requisition_receipt(requisition_id):
    """SE confirms receipt of dispatched asset"""
    try:
        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        data = request.get_json() or {}

        # Load with relationships for multi-item support
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)
        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 400

        if requisition.status != RequisitionStatus.DISPATCHED:
            return jsonify({'success': False, 'error': f'Cannot confirm receipt. Status is {requisition.status}'}), 400

        # Only requester can confirm
        if requisition.requested_by_user_id != user_id:
            return jsonify({'success': False, 'error': 'Only the requester can confirm receipt'}), 403

        # Update requisition
        requisition.status = RequisitionStatus.COMPLETED
        requisition.approval_required_from = None
        requisition.received_by_user_id = user_id
        requisition.received_by_name = user_name
        requisition.received_at = datetime.utcnow()
        requisition.receipt_notes = data.get('notes')
        requisition.last_modified_by = g.user.get('email', 'system')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Receipt confirmed successfully',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error confirming receipt: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def send_to_pm(requisition_id):
    """SE sends draft or rejected requisition to PM for approval"""
    try:
        user_id = g.user.get('user_id')
        user_email = g.user.get('email', 'system')

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Lock row for update - use lazyload to avoid joined relationships issue with FOR UPDATE
        requisition = db.session.query(AssetRequisition).options(
            lazyload('*')
        ).filter(
            AssetRequisition.requisition_id == requisition_id
        ).with_for_update().first()

        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 400

        # Only requester can send to PM
        if requisition.requested_by_user_id != user_id:
            return jsonify({'success': False, 'error': 'Only the requester can send to PM'}), 403

        # Can only send draft or pm_rejected requisitions to PM
        allowed_statuses = [RequisitionStatus.DRAFT, RequisitionStatus.PM_REJECTED]
        if requisition.status not in allowed_statuses:
            return jsonify({
                'success': False,
                'error': f'Cannot send to PM. Current status: {requisition.status}'
            }), 400

        # Clear previous PM rejection data if resending
        if requisition.status == RequisitionStatus.PM_REJECTED:
            requisition.pm_reviewed_by_user_id = None
            requisition.pm_reviewed_by_name = None
            requisition.pm_reviewed_at = None
            requisition.pm_notes = None
            requisition.pm_decision = None
            requisition.pm_rejection_reason = None

        # Update status to pending PM
        requisition.status = RequisitionStatus.PENDING_PM
        requisition.approval_required_from = 'pm'
        requisition.last_modified_by = user_email

        db.session.commit()

        # Reload with relationships for response
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)

        # Send notification to PM
        try:
            pm_user_ids = get_project_pm_user_ids(requisition.project_id)
            send_requisition_notification('created', requisition, pm_user_ids)
        except Exception as notify_error:
            current_app.logger.error(f"Error sending notification: {notify_error}")

        return jsonify({
            'success': True,
            'message': 'Requisition sent to PM for approval',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error sending requisition to PM: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def update_requisition(requisition_id):
    """SE updates a draft or rejected requisition"""
    try:
        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))
        user_email = g.user.get('email', 'system')

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        # Lock row for update - use lazyload to avoid joined relationships issue with FOR UPDATE
        requisition = db.session.query(AssetRequisition).options(
            lazyload('*')
        ).filter(
            AssetRequisition.requisition_id == requisition_id
        ).with_for_update().first()

        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 400

        # Only requester can update
        if requisition.requested_by_user_id != user_id:
            return jsonify({'success': False, 'error': 'Only the requester can update'}), 403

        # Can only update draft or pm_rejected requisitions
        allowed_statuses = [RequisitionStatus.DRAFT, RequisitionStatus.PM_REJECTED]
        if requisition.status not in allowed_statuses:
            return jsonify({
                'success': False,
                'error': f'Cannot update. Current status: {requisition.status}'
            }), 400

        # Update allowed fields
        if 'project_id' in data:
            new_project_id = data['project_id']
            if not new_project_id or new_project_id == 0:
                return jsonify({'success': False, 'error': 'project_id cannot be empty'}), 400
            # Verify project exists
            project = Project.query.get(new_project_id)
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
            requisition.project_id = new_project_id

        if 'purpose' in data:
            if not data['purpose'] or not isinstance(data['purpose'], str) or not data['purpose'].strip():
                return jsonify({'success': False, 'error': 'purpose cannot be empty'}), 400
            requisition.purpose = data['purpose'].strip()

        if 'required_date' in data:
            try:
                requisition.required_date = datetime.strptime(data['required_date'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'success': False, 'error': 'required_date must be in YYYY-MM-DD format'}), 400

        if 'urgency' in data:
            valid_urgencies = [UrgencyLevel.URGENT, UrgencyLevel.HIGH, UrgencyLevel.NORMAL, UrgencyLevel.LOW]
            if data['urgency'] in valid_urgencies:
                requisition.urgency = data['urgency']

        if 'site_location' in data:
            requisition.site_location = data['site_location']

        # Update items if provided
        if 'items' in data and isinstance(data['items'], list) and len(data['items']) > 0:
            validated_items = []
            for item in data['items']:
                item_category_id = item.get('category_id')
                item_quantity = item.get('quantity', 1)

                if not item_category_id:
                    continue

                category = ReturnableAssetCategory.query.get(item_category_id)
                if not category:
                    continue

                validated_items.append({
                    'category_id': category.category_id,
                    'category_code': category.category_code,
                    'category_name': category.category_name,
                    'quantity': item_quantity,
                    'tracking_mode': category.tracking_mode
                })

            if validated_items:
                requisition.items = validated_items
                # Update legacy fields for single item
                if len(validated_items) == 1:
                    requisition.category_id = validated_items[0]['category_id']
                    requisition.quantity = validated_items[0]['quantity']
                else:
                    requisition.category_id = None
                    requisition.quantity = None

        requisition.last_modified_by = user_email

        db.session.commit()

        # Reload with relationships
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)

        return jsonify({
            'success': True,
            'message': 'Requisition updated successfully',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== PM ENDPOINTS ====================

def get_pm_pending_requisitions():
    """PM gets requisitions pending their approval"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Get projects assigned to this PM
        from models.pm_assign_ss import PMAssignSS

        project_ids = []

        # Method 1: Projects where user is PM via PMAssignSS (using pm_ids or assigned_by_pm_id)
        assigned_project_ids = db.session.query(PMAssignSS.project_id).filter(
            or_(
                PMAssignSS.pm_ids == user_id,
                PMAssignSS.assigned_by_pm_id == user_id
            )
        ).distinct().all()
        project_ids = [p[0] for p in assigned_project_ids if p[0]]

        # Method 2: Projects where user_id JSONB array contains this PM
        # Project.user_id is a JSONB array like [1, 2, 3]
        direct_projects = Project.query.filter(
            Project.user_id.cast(String).contains(str(user_id))
        ).all()

        for p in direct_projects:
            if p.project_id not in project_ids:
                project_ids.append(p.project_id)

        status_filter = request.args.get('status', 'pending_pm')

        query = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).filter(
            AssetRequisition.is_deleted == False
        )

        # Filter by projects if PM has specific assignments
        if project_ids:
            query = query.filter(AssetRequisition.project_id.in_(project_ids))

        if status_filter == 'pending':
            query = query.filter(AssetRequisition.status == RequisitionStatus.PENDING_PM)
        elif status_filter != 'all':
            query = query.filter(AssetRequisition.status == status_filter)

        requisitions = query.order_by(AssetRequisition.created_at.desc()).all()

        return jsonify({
            'success': True,
            'data': [r.to_dict() for r in requisitions],
            'total': len(requisitions)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching PM pending requisitions: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def pm_approve_requisition(requisition_id):
    """PM approves a requisition, routes to Production Manager"""
    try:
        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))
        user_role = g.user.get('role', '')

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Role-based authorization check
        if not has_pm_permissions(user_role):
            return jsonify({'success': False, 'error': 'Access denied. PM role required'}), 403

        data = request.get_json() or {}

        # Lock row for update - use lazyload to avoid joined relationships issue with FOR UPDATE
        requisition = db.session.query(AssetRequisition).options(
            lazyload('*')
        ).filter(
            AssetRequisition.requisition_id == requisition_id
        ).with_for_update().first()

        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 400

        # Project-level authorization check - ensure PM is assigned to this project
        if not is_admin_role(user_role):
            pm_ids = get_project_pm_user_ids(requisition.project_id)
            if pm_ids and user_id not in pm_ids:
                return jsonify({'success': False, 'error': 'Not authorized for this project'}), 403

        if requisition.status != RequisitionStatus.PENDING_PM:
            return jsonify({'success': False, 'error': f'Cannot approve. Current status: {requisition.status}'}), 400

        # Update requisition - PM approved, route to Production Manager
        requisition.status = RequisitionStatus.PENDING_PROD_MGR
        requisition.approval_required_from = 'production_manager'
        requisition.pm_reviewed_by_user_id = user_id
        requisition.pm_reviewed_by_name = user_name
        requisition.pm_reviewed_at = datetime.utcnow()
        requisition.pm_notes = data.get('notes')
        requisition.pm_decision = 'approved'
        requisition.last_modified_by = g.user.get('email', 'system')

        db.session.commit()

        # Reload with relationships for response
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)

        # Notify Production Manager
        try:
            prod_mgr_ids = get_users_by_role('productionmanager')
            send_requisition_notification('pm_approved', requisition, prod_mgr_ids, user_name)
        except Exception as notify_error:
            current_app.logger.error(f"Error sending notification: {notify_error}")

        return jsonify({
            'success': True,
            'message': 'Requisition approved and sent to Production Manager',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error approving requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def pm_reject_requisition(requisition_id):
    """PM rejects a requisition"""
    try:
        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))
        user_role = g.user.get('role', '')

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Role-based authorization check
        if not has_pm_permissions(user_role):
            return jsonify({'success': False, 'error': 'Access denied. PM role required'}), 403

        data = request.get_json() or {}

        rejection_reason = data.get('rejection_reason')
        if not rejection_reason or not rejection_reason.strip():
            return jsonify({'success': False, 'error': 'rejection_reason is required'}), 400

        # Lock row for update - use lazyload to avoid joined relationships issue with FOR UPDATE
        requisition = db.session.query(AssetRequisition).options(
            lazyload('*')
        ).filter(
            AssetRequisition.requisition_id == requisition_id
        ).with_for_update().first()

        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 400

        # Project-level authorization check - ensure PM is assigned to this project
        if not is_admin_role(user_role):
            pm_ids = get_project_pm_user_ids(requisition.project_id)
            if pm_ids and user_id not in pm_ids:
                return jsonify({'success': False, 'error': 'Not authorized for this project'}), 403

        if requisition.status != RequisitionStatus.PENDING_PM:
            return jsonify({'success': False, 'error': f'Cannot reject. Current status: {requisition.status}'}), 400

        # Update requisition
        requisition.status = RequisitionStatus.PM_REJECTED
        requisition.approval_required_from = None
        requisition.pm_reviewed_by_user_id = user_id
        requisition.pm_reviewed_by_name = user_name
        requisition.pm_reviewed_at = datetime.utcnow()
        requisition.pm_notes = data.get('notes')
        requisition.pm_decision = 'rejected'
        requisition.pm_rejection_reason = rejection_reason.strip()
        requisition.last_modified_by = g.user.get('email', 'system')

        db.session.commit()

        # Reload with relationships for response
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)

        # Notify SE
        try:
            send_requisition_notification('pm_rejected', requisition, [], user_name, rejection_reason)
        except Exception as notify_error:
            current_app.logger.error(f"Error sending notification: {notify_error}")

        return jsonify({
            'success': True,
            'message': 'Requisition rejected',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error rejecting requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== PRODUCTION MANAGER ENDPOINTS ====================

def get_prod_mgr_pending_requisitions():
    """Production Manager gets requisitions pending their approval"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        status_filter = request.args.get('status', 'pending_prod_mgr')

        query = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).filter(
            AssetRequisition.is_deleted == False
        )

        if status_filter == 'pending':
            query = query.filter(AssetRequisition.status == RequisitionStatus.PENDING_PROD_MGR)
        elif status_filter == 'ready_dispatch':
            query = query.filter(AssetRequisition.status == RequisitionStatus.PROD_MGR_APPROVED)
        elif status_filter != 'all':
            query = query.filter(AssetRequisition.status == status_filter)

        requisitions = query.order_by(AssetRequisition.created_at.desc()).all()

        return jsonify({
            'success': True,
            'data': [r.to_dict() for r in requisitions],
            'total': len(requisitions)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching Production Manager pending requisitions: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def prod_mgr_approve_requisition(requisition_id):
    """Production Manager approves a requisition (ready for dispatch)"""
    try:
        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))
        user_role = g.user.get('role', '')

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Role-based authorization check
        if not has_prod_mgr_permissions(user_role):
            return jsonify({'success': False, 'error': 'Access denied. Production Manager role required'}), 403

        data = request.get_json() or {}

        # Lock row for update - use lazyload to avoid joined relationships issue with FOR UPDATE
        requisition = db.session.query(AssetRequisition).options(
            lazyload('*')
        ).filter(
            AssetRequisition.requisition_id == requisition_id
        ).with_for_update().first()

        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 400

        if requisition.status != RequisitionStatus.PENDING_PROD_MGR:
            return jsonify({'success': False, 'error': f'Cannot approve. Current status: {requisition.status}'}), 400

        # Check stock availability for all items
        if requisition.items and len(requisition.items) > 0:
            # Multi-item: check each item's stock
            insufficient_items = []
            for item in requisition.items:
                cat = ReturnableAssetCategory.query.get(item.get('category_id'))
                if cat:
                    available = cat.available_quantity or 0
                    requested = item.get('quantity', 1)
                    if requested > available:
                        insufficient_items.append(
                            f"{item.get('category_name', 'Item')}: Available {available}, Requested {requested}"
                        )
            if insufficient_items:
                return jsonify({
                    'success': False,
                    'error': f'Insufficient stock for: {"; ".join(insufficient_items)}'
                }), 400
        else:
            # Legacy single-item: check stock
            category = ReturnableAssetCategory.query.get(requisition.category_id)
            if category:
                available = category.available_quantity or 0
                if (requisition.quantity or 1) > available:
                    return jsonify({
                        'success': False,
                        'error': f'Insufficient stock. Available: {available}, Requested: {requisition.quantity}'
                    }), 400

        # Update requisition - Production Manager approved, ready for dispatch
        requisition.status = RequisitionStatus.PROD_MGR_APPROVED
        requisition.approval_required_from = 'production_manager'  # PM will dispatch
        requisition.prod_mgr_reviewed_by_user_id = user_id
        requisition.prod_mgr_reviewed_by_name = user_name
        requisition.prod_mgr_reviewed_at = datetime.utcnow()
        requisition.prod_mgr_notes = data.get('notes')
        requisition.prod_mgr_decision = 'approved'
        requisition.last_modified_by = g.user.get('email', 'system')

        db.session.commit()

        # Reload with relationships for response
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)

        # Notify SE that requisition is approved and ready for dispatch
        try:
            send_requisition_notification('prod_mgr_approved', requisition, [], user_name)
        except Exception as notify_error:
            current_app.logger.error(f"Error sending notification: {notify_error}")

        return jsonify({
            'success': True,
            'message': 'Requisition approved and ready for dispatch',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error approving requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def prod_mgr_reject_requisition(requisition_id):
    """Production Manager rejects a requisition"""
    try:
        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))
        user_role = g.user.get('role', '')

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Role-based authorization check
        if not has_prod_mgr_permissions(user_role):
            return jsonify({'success': False, 'error': 'Access denied. Production Manager role required'}), 403

        data = request.get_json() or {}

        rejection_reason = data.get('rejection_reason')
        if not rejection_reason or not rejection_reason.strip():
            return jsonify({'success': False, 'error': 'rejection_reason is required'}), 400

        # Lock row for update - use lazyload to avoid joined relationships issue with FOR UPDATE
        requisition = db.session.query(AssetRequisition).options(
            lazyload('*')
        ).filter(
            AssetRequisition.requisition_id == requisition_id
        ).with_for_update().first()

        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 400

        if requisition.status != RequisitionStatus.PENDING_PROD_MGR:
            return jsonify({'success': False, 'error': f'Cannot reject. Current status: {requisition.status}'}), 400

        # Update requisition
        requisition.status = RequisitionStatus.PROD_MGR_REJECTED
        requisition.approval_required_from = None
        requisition.prod_mgr_reviewed_by_user_id = user_id
        requisition.prod_mgr_reviewed_by_name = user_name
        requisition.prod_mgr_reviewed_at = datetime.utcnow()
        requisition.prod_mgr_notes = data.get('notes')
        requisition.prod_mgr_decision = 'rejected'
        requisition.prod_mgr_rejection_reason = rejection_reason.strip()
        requisition.last_modified_by = g.user.get('email', 'system')

        db.session.commit()

        # Reload with relationships for response
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)

        # Notify SE
        try:
            send_requisition_notification('prod_mgr_rejected', requisition, [], user_name, rejection_reason)
        except Exception as notify_error:
            current_app.logger.error(f"Error sending notification: {notify_error}")

        return jsonify({
            'success': True,
            'message': 'Requisition rejected',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error rejecting requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def get_ready_for_dispatch():
    """Production Manager gets requisitions ready for dispatch"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        requisitions = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).filter(
            AssetRequisition.status == RequisitionStatus.PROD_MGR_APPROVED,
            AssetRequisition.is_deleted == False
        ).order_by(AssetRequisition.required_date.asc()).all()

        return jsonify({
            'success': True,
            'data': [r.to_dict() for r in requisitions],
            'total': len(requisitions)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching ready for dispatch: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def dispatch_requisition(requisition_id):
    """Production Manager dispatches the approved requisition"""
    try:
        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))
        user_role = g.user.get('role', '')

        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Role-based authorization check
        if not has_prod_mgr_permissions(user_role):
            return jsonify({'success': False, 'error': 'Access denied. Production Manager role required'}), 403

        data = request.get_json() or {}

        # Lock row for update - use lazyload to avoid joined relationships issue with FOR UPDATE
        requisition = db.session.query(AssetRequisition).options(
            lazyload('*')
        ).filter(
            AssetRequisition.requisition_id == requisition_id
        ).with_for_update().first()
        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 400

        if requisition.status != RequisitionStatus.PROD_MGR_APPROVED:
            return jsonify({'success': False, 'error': f'Cannot dispatch. Current status: {requisition.status}'}), 400

        # Handle multi-item or single-item stock validation and deduction
        if requisition.items and len(requisition.items) > 0:
            # Multi-item: validate and deduct stock for each item
            insufficient_items = []
            categories_to_update = []

            for item in requisition.items:
                cat_id = item.get('category_id')
                requested_qty = item.get('quantity', 1)
                category = ReturnableAssetCategory.query.with_for_update().get(cat_id)

                if not category:
                    return jsonify({'success': False, 'error': f'Category {cat_id} not found'}), 404

                available = category.available_quantity or 0
                if requested_qty > available:
                    insufficient_items.append(
                        f"{item.get('category_name', 'Item')}: Available {available}, Requested {requested_qty}"
                    )
                else:
                    categories_to_update.append((category, requested_qty))

            if insufficient_items:
                return jsonify({
                    'success': False,
                    'error': f'Insufficient stock for: {"; ".join(insufficient_items)}'
                }), 400

            # Deduct stock from all categories
            for category, qty in categories_to_update:
                category.available_quantity = (category.available_quantity or 0) - qty
                category.last_modified_by = g.user.get('email', 'system')
        else:
            # Legacy single-item: validate and deduct stock
            category = ReturnableAssetCategory.query.with_for_update().get(requisition.category_id)
            if not category:
                return jsonify({'success': False, 'error': 'Asset category not found'}), 404

            available = category.available_quantity or 0
            requested_qty = requisition.quantity or 1
            if requested_qty > available:
                return jsonify({
                    'success': False,
                    'error': f'Insufficient stock. Available: {available}, Requested: {requested_qty}'
                }), 400

            # Deduct from available quantity
            category.available_quantity = available - requested_qty
            category.last_modified_by = g.user.get('email', 'system')

            # If individual tracking, update item status
            if category.tracking_mode == 'individual' and requisition.asset_item_id:
                item = ReturnableAssetItem.query.with_for_update().get(requisition.asset_item_id)
                if item:
                    item.current_status = 'dispatched'
                    item.current_project_id = requisition.project_id
                    item.last_modified_by = g.user.get('email', 'system')

        # Update requisition
        requisition.status = RequisitionStatus.DISPATCHED
        requisition.approval_required_from = None
        requisition.dispatched_by_user_id = user_id
        requisition.dispatched_by_name = user_name
        requisition.dispatched_at = datetime.utcnow()
        requisition.dispatch_notes = data.get('notes')
        requisition.last_modified_by = g.user.get('email', 'system')

        # Optionally link to ADN if provided
        if data.get('adn_id'):
            requisition.adn_id = data.get('adn_id')

        db.session.commit()

        # Reload with relationships for response
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)

        # Notify SE that asset is dispatched
        try:
            send_requisition_notification('dispatched', requisition, [], user_name)
        except Exception as notify_error:
            current_app.logger.error(f"Error sending notification: {notify_error}")

        return jsonify({
            'success': True,
            'message': 'Asset dispatched successfully',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error dispatching requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== GENERAL ENDPOINTS ====================

def get_requisition_by_id(requisition_id):
    """Get single requisition by ID"""
    try:
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item),
            joinedload(AssetRequisition.delivery_note)
        ).get(requisition_id)

        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition has been deleted'}), 404

        return jsonify({
            'success': True,
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def get_all_requisitions():
    """Get all requisitions with filters (admin/dashboard view)"""
    try:
        status_filter = request.args.get('status')
        project_filter = request.args.get('project_id')
        category_filter = request.args.get('category_id')
        urgency_filter = request.args.get('urgency')

        query = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).filter(
            AssetRequisition.is_deleted == False
        )

        if status_filter and status_filter != 'all':
            query = query.filter(AssetRequisition.status == status_filter)

        if project_filter:
            try:
                query = query.filter(AssetRequisition.project_id == int(project_filter))
            except ValueError:
                pass

        if category_filter:
            try:
                query = query.filter(AssetRequisition.category_id == int(category_filter))
            except ValueError:
                pass

        if urgency_filter and urgency_filter != 'all':
            query = query.filter(AssetRequisition.urgency == urgency_filter)

        # Pagination
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        per_page = min(per_page, 100)  # Max 100 per page

        pagination = query.order_by(AssetRequisition.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )

        return jsonify({
            'success': True,
            'data': [r.to_dict() for r in pagination.items],
            'total': pagination.total,
            'page': pagination.page,
            'per_page': pagination.per_page,
            'pages': pagination.pages
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching all requisitions: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def cancel_requisition(requisition_id):
    """Cancel a requisition (only allowed before dispatch)"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        # Lock row for update - use lazyload to avoid joined relationships issue with FOR UPDATE
        requisition = db.session.query(AssetRequisition).options(
            lazyload('*')
        ).filter(
            AssetRequisition.requisition_id == requisition_id
        ).with_for_update().first()
        if not requisition:
            return jsonify({'success': False, 'error': 'Requisition not found'}), 404

        if requisition.is_deleted:
            return jsonify({'success': False, 'error': 'Requisition already deleted'}), 400

        # Only requester can cancel, and only before dispatch
        if requisition.requested_by_user_id != user_id:
            return jsonify({'success': False, 'error': 'Only the requester can cancel'}), 403

        non_cancelable = [RequisitionStatus.DISPATCHED, RequisitionStatus.COMPLETED]
        if requisition.status in non_cancelable:
            return jsonify({'success': False, 'error': f'Cannot cancel. Status is {requisition.status}'}), 400

        requisition.status = RequisitionStatus.CANCELLED
        requisition.approval_required_from = None
        requisition.last_modified_by = g.user.get('email', 'system')

        db.session.commit()

        # Reload with relationships for response
        requisition = AssetRequisition.query.options(
            joinedload(AssetRequisition.project),
            joinedload(AssetRequisition.category),
            joinedload(AssetRequisition.asset_item)
        ).get(requisition_id)

        return jsonify({
            'success': True,
            'message': 'Requisition cancelled',
            'data': requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error cancelling requisition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
