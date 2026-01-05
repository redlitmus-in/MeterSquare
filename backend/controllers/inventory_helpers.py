"""
Shared helper functions and constants for inventory controllers.
This module contains utilities used across multiple inventory controller modules.
"""

from flask import jsonify, request, g
from config.db import db
from models.inventory import *
from models.project import Project
from models.user import User
from models.system_settings import SystemSettings
from datetime import datetime


# ==================== CONSTANTS ====================

DELIVERY_NOTE_PREFIX = 'MDN'
MAX_STOCK_ALERTS = 10
MAX_PAGINATION_LIMIT = 1000  # Max items per page to prevent abuse
MAX_BATCH_SIZE = 100  # Max items in batch operations

# Material return constants
MATERIAL_CONDITIONS = ['Good', 'Damaged', 'Defective']
RETURNABLE_DN_STATUSES = ['DELIVERED']  # Only delivered materials can be returned

# Disposal status constants
DISPOSAL_PENDING_APPROVAL = 'pending_approval'
DISPOSAL_APPROVED = 'approved'
DISPOSAL_PENDING_REVIEW = 'pending_review'
DISPOSAL_APPROVED_DISPOSAL = 'approved_disposal'
DISPOSAL_DISPOSED = 'disposed'
DISPOSAL_SENT_FOR_REPAIR = 'sent_for_repair'  # In backup stock, awaiting repair
DISPOSAL_REPAIRED = 'repaired'  # Repair completed, added to main stock
DISPOSAL_REJECTED = 'rejected'


# ==================== HELPER FUNCTIONS ====================

def generate_material_code():
    """Auto-generate sequential material code (MAT001, MAT002, ...)"""
    try:
        last_material = InventoryMaterial.query.order_by(
            InventoryMaterial.inventory_material_id.desc()
        ).first()

        if last_material and last_material.material_code:
            last_code = last_material.material_code
            if last_code.startswith('MAT'):
                last_number = int(last_code.replace('MAT', ''))
                new_number = last_number + 1
            else:
                new_number = 1
        else:
            new_number = 1

        return f"MAT{new_number:03d}"

    except Exception as e:
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        return f"MAT{timestamp}"


def sanitize_search_term(term: str) -> str:
    """Escape SQL wildcards in search terms to prevent wildcard injection"""
    if not term:
        return term
    return term.replace('%', '\\%').replace('_', '\\_')


def validate_pagination_params(page, limit):
    """Validate pagination parameters and return error response if invalid"""
    if page is not None and limit is not None:
        if page < 1:
            return {'error': 'Page must be greater than 0'}, 400
        if limit < 1:
            return {'error': 'Limit must be greater than 0'}, 400
        if limit > MAX_PAGINATION_LIMIT:
            return {'error': f'Limit cannot exceed {MAX_PAGINATION_LIMIT}'}, 400
    return None


def validate_quantity(value, field_name='quantity'):
    """Validate and convert quantity value to float"""
    try:
        quantity = float(value) if value is not None else 0
        if quantity < 0:
            return None, f'{field_name} cannot be negative'
        return quantity, None
    except (TypeError, ValueError):
        return None, f'{field_name} must be a valid number'


def get_store_name():
    """Get the store name from system settings"""
    try:
        settings = SystemSettings.query.first()
        return settings.company_name if settings else 'M2 Store'
    except:
        return 'M2 Store'


def get_inventory_config():
    """Get inventory configuration (store name, currency, etc.)"""
    try:
        settings = SystemSettings.query.first()
        return jsonify({
            'store_name': settings.company_name if settings else 'M2 Store',
            'company_name': settings.company_name if settings else 'MeterSquare ERP',
            'currency': 'AED',
            'delivery_note_prefix': DELIVERY_NOTE_PREFIX
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== ENRICHMENT HELPERS ====================

def get_project_managers(project):
    """Get project manager details for a project"""
    managers = []
    if project.user_id:
        for user_id in project.user_id:
            user = User.query.get(user_id)
            if user:
                managers.append({
                    'user_id': user.user_id,
                    'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
                    'email': user.email
                })
    return managers


def get_mep_supervisors(project):
    """Get MEP supervisor details for a project"""
    supervisors = []
    if project.mep_supervisor_id:
        for user_id in project.mep_supervisor_id:
            user = User.query.get(user_id)
            if user:
                supervisors.append({
                    'user_id': user.user_id,
                    'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
                    'email': user.email
                })
    return supervisors


def get_site_supervisor(project):
    """Get site supervisor details for a project"""
    if project.site_supervisor_id:
        user = User.query.get(project.site_supervisor_id)
        if user:
            return {
                'user_id': user.user_id,
                'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
                'email': user.email
            }
    return None


def enrich_project_details(project, include_mep=True):
    """Enrich project with manager details"""
    details = {
        'project_id': project.project_id,
        'project_name': project.project_name,
        'project_code': project.project_code,
        'location': project.location,
        'project_managers': get_project_managers(project),
        'site_supervisor': get_site_supervisor(project)
    }
    if include_mep:
        details['mep_supervisors'] = get_mep_supervisors(project)
    return details


def build_returnable_material_item(delivery_note, item, material):
    """Build returnable material dictionary for a delivery note item."""
    # Calculate already returned quantity
    returned_qty = db.session.query(
        db.func.coalesce(db.func.sum(MaterialReturn.quantity), 0)
    ).filter(
        MaterialReturn.delivery_note_item_id == item.item_id,
        MaterialReturn.add_to_stock == True
    ).scalar() or 0

    # Calculate quantity in pending RDNs (not yet received)
    rdn_items_quantity = db.session.query(
        db.func.coalesce(db.func.sum(ReturnDeliveryNoteItem.quantity), 0)
    ).join(
        ReturnDeliveryNote,
        ReturnDeliveryNoteItem.return_note_id == ReturnDeliveryNote.return_note_id
    ).filter(
        ReturnDeliveryNoteItem.original_delivery_note_item_id == item.item_id,
        ReturnDeliveryNote.status.notin_(['RECEIVED', 'PARTIAL'])
    ).scalar() or 0

    returnable_qty = max(0, item.quantity - returned_qty - rdn_items_quantity)

    return {
        'delivery_note_id': delivery_note.delivery_note_id,
        'delivery_note_number': delivery_note.delivery_note_number,
        'delivery_date': delivery_note.delivery_date.isoformat() if delivery_note.delivery_date else None,
        'item_id': item.item_id,
        'delivery_note_item_id': item.item_id,  # Alias for frontend compatibility
        'inventory_material_id': material.inventory_material_id,
        'material_code': material.material_code,
        'material_name': material.material_name,
        'brand': material.brand,
        'size': material.size,
        'unit': material.unit,
        'original_quantity': item.quantity,
        'returned_quantity': returned_qty,
        'pending_return_quantity': rdn_items_quantity,
        'returnable_quantity': returnable_qty,
        'unit_price': item.unit_price or material.unit_price
    }
