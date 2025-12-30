"""
Asset Disposal Controller
Handles disposal requests for returnable assets requiring TD approval.
"""

import os
import uuid
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from config.db import db
from models.returnable_assets import (
    AssetDisposal,
    AssetReturnDeliveryNoteItem,
    ReturnableAssetCategory,
    ReturnableAssetItem,
    AssetReturnDeliveryNote
)
from models.project import Project
from utils.authentication import jwt_required

logger = logging.getLogger(__name__)

asset_disposal_bp = Blueprint('asset_disposal', __name__)


# ============================================================================
# DISPOSAL REQUEST ENDPOINTS
# ============================================================================

@asset_disposal_bp.route('/api/assets/disposal', methods=['GET'])
@jwt_required
def get_disposal_requests():
    """Get all asset disposal requests

    Query params:
    - status: 'pending_review' (default), 'approved', 'rejected', 'all'
    """
    try:
        status = request.args.get('status', 'pending_review')

        query = AssetDisposal.query

        if status != 'all':
            query = query.filter(AssetDisposal.status == status)

        # Order by most recent first
        query = query.order_by(AssetDisposal.requested_at.desc())

        disposals = query.all()

        # Batch load related data
        category_ids = list(set(d.category_id for d in disposals if d.category_id))
        categories = {c.category_id: c for c in ReturnableAssetCategory.query.filter(
            ReturnableAssetCategory.category_id.in_(category_ids)
        ).all()} if category_ids else {}

        project_ids = list(set(d.project_id for d in disposals if d.project_id))
        projects = {p.project_id: p for p in Project.query.filter(
            Project.project_id.in_(project_ids)
        ).all()} if project_ids else {}

        result = []
        for disposal in disposals:
            data = disposal.to_dict()

            # Add category unit price for estimated value calculation
            category = categories.get(disposal.category_id)
            if category:
                data['unit_price'] = category.unit_price

            # Add project name
            project = projects.get(disposal.project_id)
            if project:
                data['project_name'] = project.project_name

            result.append(data)

        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        logger.error(f"Error fetching disposal requests: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@asset_disposal_bp.route('/api/assets/disposal', methods=['POST'])
@jwt_required
def create_disposal_request():
    """Create a new asset disposal request (requires TD approval)"""
    try:
        data = request.json or {}
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        # Validate required fields
        if not data.get('category_id'):
            return jsonify({'success': False, 'error': 'Category ID is required'}), 400
        if not data.get('disposal_reason'):
            return jsonify({'success': False, 'error': 'Disposal reason is required'}), 400

        quantity = data.get('quantity', 1)

        # Verify category exists
        category = ReturnableAssetCategory.query.get(data['category_id'])
        if not category:
            return jsonify({'success': False, 'error': 'Category not found'}), 404

        # Calculate estimated value
        estimated_value = (category.unit_price or 0) * quantity

        # Create disposal request
        disposal = AssetDisposal(
            return_item_id=data.get('return_item_id'),
            category_id=data['category_id'],
            asset_item_id=data.get('asset_item_id'),
            quantity=quantity,
            disposal_reason=data['disposal_reason'],
            justification=data.get('justification', ''),
            estimated_value=estimated_value,
            image_url=data.get('image_url'),
            image_filename=data.get('image_filename'),
            requested_by=user_name,
            requested_by_id=user_id,
            source_type=data.get('source_type', 'repair'),
            source_ardn_id=data.get('source_ardn_id'),
            project_id=data.get('project_id'),
            status='pending_review'
        )

        db.session.add(disposal)

        # If this is from a repair item, update the return item status
        if data.get('return_item_id'):
            return_item = AssetReturnDeliveryNoteItem.query.get(data['return_item_id'])
            if return_item:
                return_item.action_taken = 'pending_disposal'
                return_item.pm_notes = (return_item.pm_notes or '') + f"\n[Disposal requested by {user_name}: {data['disposal_reason']}]"

        db.session.commit()

        return jsonify({
            'success': True,
            'data': disposal.to_dict(),
            'message': 'Disposal request created. Awaiting TD approval.'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating disposal request: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@asset_disposal_bp.route('/api/assets/disposal/<int:disposal_id>/upload-image', methods=['POST'])
@jwt_required
def upload_disposal_image(disposal_id):
    """Upload image documentation for disposal request"""
    try:
        from supabase import create_client

        disposal = AssetDisposal.query.get(disposal_id)
        if not disposal:
            return jsonify({'success': False, 'error': 'Disposal request not found'}), 404

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        # Validate file type
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        file_ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if file_ext not in allowed_extensions:
            return jsonify({'success': False, 'error': 'Invalid file type. Only images allowed.'}), 400

        # Read file content
        file_content = file.read()

        # Create unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        filename = f"asset-disposal/{disposal_id}/{timestamp}_{unique_id}_{file.filename}"

        # Get content type
        content_type = file.content_type or 'image/jpeg'

        # Initialize Supabase client
        environment = os.environ.get('ENVIRONMENT', 'production')
        if environment == 'development':
            supabase_url = os.environ.get('DEV_SUPABASE_URL')
            supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
        else:
            supabase_url = os.environ.get('SUPABASE_URL')
            supabase_key = os.environ.get('SUPABASE_ANON_KEY')

        if not supabase_url or not supabase_key:
            return jsonify({'success': False, 'error': 'Storage configuration missing'}), 500

        supabase = create_client(supabase_url, supabase_key)

        # Upload to inventory-files bucket
        bucket = supabase.storage.from_('inventory-files')
        try:
            bucket.upload(
                filename,
                file_content,
                {"content-type": content_type, "upsert": "false"}
            )
        except Exception as upload_error:
            return jsonify({'success': False, 'error': f'Upload failed: {str(upload_error)}'}), 500

        # Get public URL
        public_url = bucket.get_public_url(filename)

        # Update disposal record
        disposal.image_url = public_url
        disposal.image_filename = file.filename
        db.session.commit()

        return jsonify({
            'success': True,
            'data': {
                'disposal_id': disposal_id,
                'image_url': public_url,
                'filename': file.filename
            }
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading disposal image: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# TD APPROVAL ENDPOINTS
# ============================================================================

@asset_disposal_bp.route('/api/assets/disposal/<int:disposal_id>/approve', methods=['PUT'])
@jwt_required
def approve_disposal(disposal_id):
    """TD approves disposal request - reduces inventory"""
    try:
        data = request.json or {}
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        disposal = AssetDisposal.query.get(disposal_id)
        if not disposal:
            return jsonify({'success': False, 'error': 'Disposal request not found'}), 404

        if disposal.status != 'pending_review':
            return jsonify({'success': False, 'error': f'Cannot approve. Current status: {disposal.status}'}), 400

        # Update disposal status
        disposal.status = 'approved'
        disposal.reviewed_by = user_name
        disposal.reviewed_by_id = user_id
        disposal.reviewed_at = datetime.utcnow()
        disposal.review_notes = data.get('notes', '')

        # Reduce inventory (total_quantity)
        if disposal.category:
            disposal.category.total_quantity = max(0, (disposal.category.total_quantity or 0) - disposal.quantity)
            # Note: available_quantity should already be reduced when item was sent to repair/disposal

        # Update individual asset item if applicable
        if disposal.asset_item:
            disposal.asset_item.current_status = 'retired'
            disposal.asset_item.is_active = False

        # Update the source return item if exists
        if disposal.return_item_id:
            return_item = AssetReturnDeliveryNoteItem.query.get(disposal.return_item_id)
            if return_item:
                return_item.action_taken = 'dispose'
                return_item.pm_notes = (return_item.pm_notes or '') + f"\n[Disposal approved by TD: {user_name}]"

        db.session.commit()

        return jsonify({
            'success': True,
            'data': disposal.to_dict(),
            'message': 'Disposal approved. Inventory has been reduced.'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error approving disposal: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@asset_disposal_bp.route('/api/assets/disposal/<int:disposal_id>/reject', methods=['PUT'])
@jwt_required
def reject_disposal(disposal_id):
    """TD rejects disposal request - return to stock or repair"""
    try:
        data = request.json or {}
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        disposal = AssetDisposal.query.get(disposal_id)
        if not disposal:
            return jsonify({'success': False, 'error': 'Disposal request not found'}), 404

        if disposal.status != 'pending_review':
            return jsonify({'success': False, 'error': f'Cannot reject. Current status: {disposal.status}'}), 400

        action = data.get('action', 'return_to_stock')  # return_to_stock or send_to_repair

        # Update disposal status
        disposal.status = 'rejected'
        disposal.reviewed_by = user_name
        disposal.reviewed_by_id = user_id
        disposal.reviewed_at = datetime.utcnow()
        disposal.review_notes = data.get('notes', '')

        # Handle the rejected item
        if disposal.return_item_id:
            return_item = AssetReturnDeliveryNoteItem.query.get(disposal.return_item_id)
            if return_item:
                return_item.action_taken = action
                return_item.pm_notes = (return_item.pm_notes or '') + f"\n[Disposal rejected by TD: {user_name}. Action: {action}]"

        # If returning to stock, add back to available quantity
        if action == 'return_to_stock' and disposal.category:
            disposal.category.available_quantity = (disposal.category.available_quantity or 0) + disposal.quantity

        # Update individual asset item if applicable
        if disposal.asset_item and action == 'return_to_stock':
            disposal.asset_item.current_status = 'available'

        db.session.commit()

        message = 'Disposal rejected. Asset returned to stock.' if action == 'return_to_stock' else 'Disposal rejected. Asset sent back for repair.'

        return jsonify({
            'success': True,
            'data': disposal.to_dict(),
            'message': message
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error rejecting disposal: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@asset_disposal_bp.route('/api/assets/disposal/<int:disposal_id>', methods=['GET'])
@jwt_required
def get_disposal_detail(disposal_id):
    """Get detailed information about a disposal request"""
    try:
        disposal = AssetDisposal.query.get(disposal_id)
        if not disposal:
            return jsonify({'success': False, 'error': 'Disposal request not found'}), 404

        data = disposal.to_dict()

        # Add additional details
        if disposal.category:
            data['unit_price'] = disposal.category.unit_price
            data['tracking_mode'] = disposal.category.tracking_mode

        if disposal.project_id:
            project = Project.query.get(disposal.project_id)
            if project:
                data['project_name'] = project.project_name

        # Add return item details if linked
        if disposal.return_item:
            data['reported_condition'] = disposal.return_item.reported_condition
            data['verified_condition'] = disposal.return_item.verified_condition
            data['damage_description'] = disposal.return_item.damage_description

        return jsonify({
            'success': True,
            'data': data
        })

    except Exception as e:
        logger.error(f"Error fetching disposal detail: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# CATALOG DISPOSAL - Direct disposal from catalog
# ============================================================================

@asset_disposal_bp.route('/api/assets/catalog/<int:category_id>/dispose', methods=['POST'])
@jwt_required
def request_catalog_disposal(category_id):
    """Request disposal of assets directly from catalog (requires TD approval)"""
    try:
        data = request.json or {}
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        # Verify category exists
        category = ReturnableAssetCategory.query.get(category_id)
        if not category:
            return jsonify({'success': False, 'error': 'Category not found'}), 404

        quantity = data.get('quantity', 1)

        # Validate quantity
        if quantity < 1:
            return jsonify({'success': False, 'error': 'Quantity must be at least 1'}), 400

        if quantity > (category.available_quantity or 0):
            return jsonify({'success': False, 'error': f'Only {category.available_quantity} available for disposal'}), 400

        if not data.get('disposal_reason'):
            return jsonify({'success': False, 'error': 'Disposal reason is required'}), 400

        # Calculate estimated value
        estimated_value = (category.unit_price or 0) * quantity

        # Create disposal request
        disposal = AssetDisposal(
            category_id=category_id,
            asset_item_id=data.get('asset_item_id'),
            quantity=quantity,
            disposal_reason=data['disposal_reason'],
            justification=data.get('justification', ''),
            estimated_value=estimated_value,
            image_url=data.get('image_url'),
            image_filename=data.get('image_filename'),
            requested_by=user_name,
            requested_by_id=user_id,
            source_type='catalog',
            status='pending_review'
        )

        db.session.add(disposal)

        # Reduce available quantity immediately (pending disposal)
        category.available_quantity = max(0, (category.available_quantity or 0) - quantity)

        db.session.commit()

        return jsonify({
            'success': True,
            'data': disposal.to_dict(),
            'message': 'Disposal request created. Awaiting TD approval.'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating catalog disposal request: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
