from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails, MasterItem, MasterSubItem, MasterMaterial
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.role import Role
from models.vendor import Vendor
from models.inventory import *
from config.logging import get_logger
from datetime import datetime
import os
import json
import re
from supabase import create_client, Client
from utils.comprehensive_notification_service import notification_service

log = get_logger()


# ============================================================================
# ROLE CHECK HELPER FUNCTIONS
# Centralized role checks to avoid duplication throughout the file
# ============================================================================

def is_technical_director(user_role: str) -> bool:
    """Check if user role is Technical Director"""
    if not user_role:
        return False
    role_lower = user_role.lower()
    return role_lower in ['technical_director', 'technicaldirector', 'technical director', 'td']


def is_buyer_role(user_role: str) -> bool:
    """Check if user role is Buyer"""
    if not user_role:
        return False
    return user_role.lower() == 'buyer'


def is_admin_role(user_role: str) -> bool:
    """Check if user role is Admin"""
    if not user_role:
        return False
    return user_role.lower() == 'admin'


def has_buyer_permissions(user_role: str) -> bool:
    """Check if user has buyer-level permissions (buyer, TD, or admin)"""
    return is_buyer_role(user_role) or is_technical_director(user_role) or is_admin_role(user_role)


# ============================================================================
# VALIDATION HELPER FUNCTIONS
# ============================================================================

# Configuration constants based on environment
environment = os.environ.get('ENVIRONMENT', 'production')
if environment == 'development':
    supabase_url = os.environ.get('DEV_SUPABASE_URL')
    supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
else:
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_ANON_KEY')
SUPABASE_BUCKET = "file_upload"
# Pre-build base URL for public files
PUBLIC_URL_BASE = f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/"
# Initialize Supabase client
supabase: Client = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None


def _parse_custom_terms(saved_customization, default_template=None):
    """
    Parse custom terms similar to BOQ terms system.
    
    How it works (like BOQ):
    1. Load master list from system_settings.lpo_payment_terms_list (global terms available to all)
    2. Load saved selections from lpo_customizations.custom_terms (which terms are checked)
    3. Merge them: return all master terms with 'selected' flag based on saved selections
    
    Returns: Array of {text: string, selected: boolean}
    """
    from models.system_settings import SystemSettings
    
    # Step 1: Get master list of terms from system settings (like boq_terms table)
    master_terms = []
    try:
        settings = SystemSettings.query.first()
        if settings:
            # Get payment terms list from system settings
            payment_terms_str = getattr(settings, 'lpo_payment_terms_list', None)
            if payment_terms_str:
                payment_terms_list = json.loads(payment_terms_str)
                if payment_terms_list and isinstance(payment_terms_list, list):
                    # Convert to new format if needed
                    for term in payment_terms_list:
                        if isinstance(term, str):
                            master_terms.append({"text": term, "selected": False})
                        elif isinstance(term, dict) and 'text' in term:
                            master_terms.append(term)
            
            # Also get general terms if available
            general_terms_str = getattr(settings, 'lpo_general_terms', None)
            if general_terms_str:
                general_terms_list = json.loads(general_terms_str)
                if general_terms_list and isinstance(general_terms_list, list):
                    for term in general_terms_list:
                        if isinstance(term, str):
                            master_terms.append({"text": term, "selected": False})
                        elif isinstance(term, dict) and 'text' in term:
                            master_terms.append(term)
    except Exception as e:
        log.warning(f"Error loading master terms from system settings: {e}")
    
    # Step 2: Get saved selections (which terms are checked for this specific LPO)
    saved_selections = []
    
    # Priority 1: Check saved_customization (this specific LPO)
    if saved_customization:
        try:
            custom_terms_str = getattr(saved_customization, 'custom_terms', None)
            if custom_terms_str:
                parsed = json.loads(custom_terms_str)
                if parsed and isinstance(parsed, list):
                    saved_selections = parsed
        except Exception as e:
            log.warning(f"Error parsing custom_terms from customization: {e}")
    
    # Priority 2: If no saved customization, check default_template (user's defaults)
    if not saved_selections and default_template:
        try:
            custom_terms_str = getattr(default_template, 'custom_terms', None)
            if custom_terms_str:
                parsed = json.loads(custom_terms_str)
                if parsed and isinstance(parsed, list):
                    saved_selections = parsed
        except Exception as e:
            log.warning(f"Error parsing custom_terms from default template: {e}")
    
    # Step 3: Merge master terms with saved selections
    # If we have saved selections, use them to mark which terms are selected
    if saved_selections:
        # Create a set of selected term texts for quick lookup
        selected_texts = {term.get('text', '') for term in saved_selections if term.get('selected', False)}
        
        # Update master terms with selection state
        for term in master_terms:
            if term.get('text') in selected_texts:
                term['selected'] = True
        
        # Also add any custom terms from saved_selections that aren't in master list
        # (user might have added custom terms)
        master_term_texts = {term.get('text') for term in master_terms}
        for saved_term in saved_selections:
            if saved_term.get('text') and saved_term.get('text') not in master_term_texts:
                master_terms.append(saved_term)
    
    return master_terms


def process_materials_with_negotiated_prices(cr, boq_details=None):
    """
    Helper function to process materials and apply negotiated prices
    Returns (materials_list, cr_total)

    NOTE: cr_total uses ORIGINAL prices (not negotiated)
    Individual materials show negotiated_price separately

    Also enriches unit_price from BOQ for existing materials when stored price is 0
    Also looks up vendor product prices from vendor catalog when available
    """
    from models.vendor import VendorProduct

    sub_items_data = cr.sub_items_data or cr.materials_data or []
    cr_total = 0
    materials_list = []
    material_vendor_selections = cr.material_vendor_selections or {}

    # Build vendor product price lookup by vendor_id
    # Get unique vendor IDs from material selections
    vendor_ids = set()
    for mat_name, selection in material_vendor_selections.items():
        if isinstance(selection, dict) and selection.get('vendor_id'):
            vendor_ids.add(selection.get('vendor_id'))

    # Lookup vendor product prices for all selected vendors
    vendor_product_prices = {}  # {vendor_id: {material_name.lower(): price}}
    for vendor_id in vendor_ids:
        vendor_products = VendorProduct.query.filter_by(
            vendor_id=vendor_id,
            is_deleted=False
        ).all()
        vendor_product_prices[vendor_id] = {}
        for vp in vendor_products:
            if vp.product_name:
                vendor_product_prices[vendor_id][vp.product_name.lower().strip()] = float(vp.unit_price or 0)

    # Build BOQ material price lookup for enrichment
    # Two lookups: by material_id and by material_name (for when IDs don't match)
    boq_material_prices = {}
    boq_material_prices_by_name = {}
    if boq_details is None and cr.boq_id:
        boq_details = BOQDetails.query.filter_by(boq_id=cr.boq_id, is_deleted=False).first()

    if boq_details and boq_details.boq_details:
        boq_items = boq_details.boq_details.get('items', [])
        for item_idx, item in enumerate(boq_items):
            for sub_item_idx, sub_item in enumerate(item.get('sub_items', [])):
                sub_item_name = sub_item.get('sub_item_name', '')
                for mat_idx, boq_material in enumerate(sub_item.get('materials', [])):
                    material_id = f"mat_{cr.boq_id}_{item_idx+1}_{sub_item_idx+1}_{mat_idx+1}"
                    unit_price = boq_material.get('unit_price', 0)
                    material_name = boq_material.get('material_name', '')
                    boq_material_prices[material_id] = unit_price
                    # Also store by material_name + sub_item_name for fallback matching
                    if material_name:
                        name_key = f"{material_name}_{sub_item_name}"
                        boq_material_prices_by_name[name_key] = unit_price
                        # Also store just by material_name (less specific fallback)
                        boq_material_prices_by_name[material_name] = unit_price

    if cr.sub_items_data:
        for sub_item in sub_items_data:
            if isinstance(sub_item, dict):
                sub_materials = sub_item.get('materials', [])
                if sub_materials:
                    for material in sub_materials:
                        material_name = material.get('material_name', '')
                        sub_item_name_for_material = material.get('sub_item_name', '') or sub_item.get('sub_item_name', '')
                        quantity = material.get('quantity') or 0
                        original_unit_price = material.get('unit_price') or 0

                        # Enrich unit_price from BOQ for existing materials when stored price is 0
                        master_material_id = material.get('master_material_id')
                        if (original_unit_price == 0 or not original_unit_price) and master_material_id:
                            original_unit_price = boq_material_prices.get(master_material_id, 0)
                        # Fallback: try matching by material_name + sub_item_name
                        if (original_unit_price == 0 or not original_unit_price) and material_name:
                            name_key = f"{material_name}_{sub_item_name_for_material}"
                            original_unit_price = boq_material_prices_by_name.get(name_key, 0)
                        # Final fallback: try matching by just material_name
                        if (original_unit_price == 0 or not original_unit_price) and material_name:
                            original_unit_price = boq_material_prices_by_name.get(material_name, 0)

                        # Check if there's a vendor price for this material
                        # IMPORTANT: Frontend saves vendor rate in 'negotiated_price' field (not 'quoted_price')
                        vendor_selection = material_vendor_selections.get(material_name, {})

                        # Frontend sends vendor rate as 'negotiated_price'
                        vendor_rate_from_selection = float(vendor_selection.get('negotiated_price', 0) or 0) if isinstance(vendor_selection, dict) else 0
                        vendor_id = vendor_selection.get('vendor_id') if isinstance(vendor_selection, dict) else None

                        # ✅ Get brand and specification from vendor selection (same as POChild path)
                        vendor_brand = vendor_selection.get('brand', '') if isinstance(vendor_selection, dict) else ''
                        vendor_specification = vendor_selection.get('specification', '') if isinstance(vendor_selection, dict) else ''

                        # Lookup vendor product price from catalog
                        vendor_product_price = 0
                        if vendor_id and vendor_id in vendor_product_prices:
                            vendor_product_price = vendor_product_prices[vendor_id].get(material_name.lower().strip(), 0)

                        # ✅ FIXED: Use proper priority
                        # Priority: 1. vendor rate from selection, 2. vendor_product_price (catalog), 3. BOQ original_unit_price
                        if vendor_rate_from_selection > 0:
                            effective_price = vendor_rate_from_selection  # ✅ VENDOR RATE (THIS IS THE KEY!)
                        elif vendor_product_price > 0:
                            effective_price = vendor_product_price
                        else:
                            effective_price = original_unit_price

                        # CRITICAL FIX: When vendor is selected, use vendor price for display AND total
                        # Use vendor price if ANY vendor price exists
                        has_vendor_price = (vendor_rate_from_selection > 0) or (vendor_product_price > 0)
                        vendor_selected = (cr.vendor_selection_status in ['approved', 'pending_td_approval'] and has_vendor_price)

                        # ✅ FIX: Use vendor price when available, regardless of approval status
                        # If vendor has a price, use it (for LPO generation, vendor must be selected)
                        # Only fall back to BOQ if no vendor pricing exists at all
                        if has_vendor_price:
                            display_unit_price = effective_price  # Use vendor price
                        else:
                            display_unit_price = original_unit_price  # Fall back to BOQ only if no vendor price

                        material_total = float(quantity) * float(display_unit_price)

                        # FIXED: Use vendor price for cr_total when approved
                        cr_total += material_total

                        # ✅ Get brand and specification - prefer vendor selection, fallback to material data (same as POChild)
                        final_brand = vendor_brand or material.get('brand', '')
                        final_specification = vendor_specification or material.get('specification', '')

                        # ✅ Get supplier notes from vendor selection or material data
                        supplier_notes = vendor_selection.get('supplier_notes', '') if isinstance(vendor_selection, dict) else ''

                        materials_list.append({
                            "material_name": material_name,
                            "master_material_id": master_material_id,
                            "is_new_material": material.get('is_new_material', False),  # From change request
                            "justification": material.get('justification', ''),  # Individual material justification
                            "quantity": quantity,
                            "unit": material.get('unit', ''),
                            "unit_price": display_unit_price,  # Vendor price when approved, BOQ otherwise
                            "total_price": material_total,  # Based on vendor/BOQ price depending on approval
                            "negotiated_price": effective_price if effective_price != original_unit_price else None,
                            "vendor_product_price": vendor_product_price,
                            "original_unit_price": original_unit_price,  # Add original for reference
                            "boq_unit_price": original_unit_price,  # For PDF comparison
                            "brand": final_brand,  # ✅ Brand from vendor selection (same as POChild)
                            "specification": final_specification,  # ✅ Specification from vendor selection (same as POChild)
                            "supplier_notes": supplier_notes  # ✅ Supplier notes from vendor selection
                        })
                else:
                    material_name = sub_item.get('material_name', '')
                    sub_item_name_for_lookup = sub_item.get('sub_item_name', '')
                    quantity = sub_item.get('quantity') or 0
                    original_unit_price = sub_item.get('unit_price') or 0

                    # Enrich unit_price from BOQ for existing materials when stored price is 0
                    master_material_id = sub_item.get('master_material_id')
                    if (original_unit_price == 0 or not original_unit_price) and master_material_id:
                        original_unit_price = boq_material_prices.get(master_material_id, 0)
                    # Fallback: try matching by material_name + sub_item_name
                    if (original_unit_price == 0 or not original_unit_price) and material_name:
                        name_key = f"{material_name}_{sub_item_name_for_lookup}"
                        original_unit_price = boq_material_prices_by_name.get(name_key, 0)
                    # Final fallback: try matching by just material_name
                    if (original_unit_price == 0 or not original_unit_price) and material_name:
                        original_unit_price = boq_material_prices_by_name.get(material_name, 0)

                    # Check if there's a vendor price for this material
                    # IMPORTANT: Frontend saves vendor rate in 'negotiated_price' field (not 'quoted_price')
                    vendor_selection = material_vendor_selections.get(material_name, {})

                    # Frontend sends vendor rate as 'negotiated_price'
                    vendor_rate_from_selection = float(vendor_selection.get('negotiated_price', 0) or 0) if isinstance(vendor_selection, dict) else 0
                    vendor_id = vendor_selection.get('vendor_id') if isinstance(vendor_selection, dict) else None

                    # ✅ Get brand and specification from vendor selection
                    vendor_brand = vendor_selection.get('brand', '') if isinstance(vendor_selection, dict) else ''
                    vendor_specification = vendor_selection.get('specification', '') if isinstance(vendor_selection, dict) else ''

                    # Lookup vendor product price from catalog
                    vendor_product_price = 0
                    if vendor_id and vendor_id in vendor_product_prices:
                        vendor_product_price = vendor_product_prices[vendor_id].get(material_name.lower().strip(), 0)

                    # ✅ FIXED: Use proper priority
                    # Priority: 1. vendor rate from selection, 2. vendor_product_price (catalog), 3. BOQ original_unit_price
                    if vendor_rate_from_selection > 0:
                        effective_price = vendor_rate_from_selection  # ✅ VENDOR RATE (THIS IS THE KEY!)
                    elif vendor_product_price > 0:
                        effective_price = vendor_product_price
                    else:
                        effective_price = original_unit_price

                    # CRITICAL FIX: When vendor is selected, use vendor price for display AND total
                    # Use vendor price if ANY vendor price exists
                    has_vendor_price = (vendor_rate_from_selection > 0) or (vendor_product_price > 0)
                    vendor_selected = (cr.vendor_selection_status in ['approved', 'pending_td_approval'] and has_vendor_price)

                    # ✅ FIX: Use vendor price when available, regardless of approval status
                    if has_vendor_price:
                        display_unit_price = effective_price  # Use vendor price
                    else:
                        display_unit_price = original_unit_price  # Fall back to BOQ only if no vendor price

                    sub_total = float(quantity) * float(display_unit_price)

                    # FIXED: Use vendor price for cr_total when approved
                    cr_total += sub_total

                    # ✅ Get brand and specification - prefer vendor selection, fallback to sub_item data (same as POChild)
                    final_brand = vendor_brand or sub_item.get('brand', '')
                    final_specification = vendor_specification or sub_item.get('specification', '')

                    # ✅ Get supplier notes from vendor selection
                    supplier_notes = vendor_selection.get('supplier_notes', '') if isinstance(vendor_selection, dict) else ''

                    materials_list.append({
                        "material_name": material_name,
                        "master_material_id": master_material_id,
                        "is_new_material": sub_item.get('is_new_material', False),  # From change request
                        "justification": sub_item.get('justification', ''),  # Individual material justification
                        "sub_item_name": sub_item.get('sub_item_name', ''),
                        "brand": final_brand,  # ✅ Brand from vendor selection (same as POChild)
                        "specification": final_specification,  # ✅ Specification from vendor selection (same as POChild)
                        "size": sub_item.get('size', ''),
                        "quantity": quantity,
                        "unit": sub_item.get('unit', ''),
                        "unit_price": display_unit_price,  # Vendor price when approved, BOQ otherwise
                        "total_price": sub_total,  # Based on vendor/BOQ price depending on approval
                        "negotiated_price": effective_price if effective_price != original_unit_price else None,
                        "vendor_product_price": vendor_product_price,
                        "original_unit_price": original_unit_price,  # Add original for reference
                        "supplier_notes": supplier_notes,  # ✅ Supplier notes from vendor selection
                        "boq_unit_price": original_unit_price  # For PDF comparison
                    })
    else:
        for material in sub_items_data:
            material_name = material.get('material_name', '')
            sub_item_name_for_lookup = material.get('sub_item_name', '')
            quantity = material.get('quantity', 0)
            original_unit_price = material.get('unit_price', 0)

            # Enrich unit_price from BOQ for existing materials when stored price is 0
            master_material_id = material.get('master_material_id')
            if (original_unit_price == 0 or not original_unit_price) and master_material_id:
                original_unit_price = boq_material_prices.get(master_material_id, 0)
            # Fallback: try matching by material_name + sub_item_name
            if (original_unit_price == 0 or not original_unit_price) and material_name:
                name_key = f"{material_name}_{sub_item_name_for_lookup}"
                original_unit_price = boq_material_prices_by_name.get(name_key, 0)
            # Final fallback: try matching by just material_name
            if (original_unit_price == 0 or not original_unit_price) and material_name:
                original_unit_price = boq_material_prices_by_name.get(material_name, 0)

            # Check if there's a negotiated price or vendor product price for this material
            vendor_selection = material_vendor_selections.get(material_name, {})
            negotiated_price = vendor_selection.get('negotiated_price')
            vendor_id = vendor_selection.get('vendor_id')

            # ✅ Get brand and specification from vendor selection (same as other branches)
            vendor_brand = vendor_selection.get('brand', '') if isinstance(vendor_selection, dict) else ''
            vendor_specification = vendor_selection.get('specification', '') if isinstance(vendor_selection, dict) else ''

            # ✅ Get supplier notes from vendor selection (same as other branches)
            supplier_notes = vendor_selection.get('supplier_notes', '') if isinstance(vendor_selection, dict) else ''

            # Lookup vendor product price from catalog
            vendor_product_price = 0
            if vendor_id and vendor_id in vendor_product_prices:
                vendor_product_price = vendor_product_prices[vendor_id].get(material_name.lower().strip(), 0)

            # Use vendor price if no negotiated price (prefer vendor catalog over BOQ)
            effective_price = negotiated_price or vendor_product_price or original_unit_price

            # CRITICAL FIX: When vendor is selected, use vendor price for display AND total
            # Show vendor price for both pending_td_approval AND approved status
            # Use vendor price if EITHER negotiated_price OR vendor_product_price exists
            has_vendor_price = (negotiated_price and negotiated_price > 0) or (vendor_product_price and vendor_product_price > 0)
            vendor_selected = (cr.vendor_selection_status in ['approved', 'pending_td_approval'] and has_vendor_price)

            # Use vendor price when vendor selected, otherwise BOQ price
            display_unit_price = effective_price if vendor_selected else original_unit_price
            material_total = float(quantity) * float(display_unit_price)

            # FIXED: Use vendor price for cr_total when approved
            cr_total += material_total

            # ✅ Get brand and specification - prefer vendor selection, fallback to material data (same as other branches)
            final_brand = vendor_brand or material.get('brand', '')
            final_specification = vendor_specification or material.get('specification', '')

            materials_list.append({
                "material_name": material_name,
                "master_material_id": master_material_id,
                "is_new_material": material.get('is_new_material', False),  # From change request
                "justification": material.get('justification', ''),  # Individual material justification
                "sub_item_name": material.get('sub_item_name', ''),
                "brand": final_brand,  # ✅ Brand from vendor selection (same as other branches)
                "specification": final_specification,  # ✅ Specification from vendor selection (same as other branches)
                "size": material.get('size', ''),
                "quantity": quantity,
                "unit": material.get('unit', ''),
                "unit_price": display_unit_price,  # Vendor price when approved, BOQ otherwise
                "total_price": material_total,  # Based on vendor/BOQ price depending on approval
                "negotiated_price": effective_price if effective_price != original_unit_price else None,
                "vendor_product_price": vendor_product_price,
                "original_unit_price": original_unit_price,  # Add original for reference
                "boq_unit_price": original_unit_price,  # For PDF comparison
                "supplier_notes": supplier_notes  # ✅ Supplier notes from vendor selection (same as other branches)
            })

    return materials_list, cr_total

def create_buyer():
    """Create a new buyer user"""
    try:
        data = request.get_json()

        # Validate role exists
        role = Role.query.filter_by(role='buyer').first()
        if not role:
            return jsonify({"error": "Buyer role not found"}), 404

        # Validate required fields
        if not data.get('email') or not data.get('full_name'):
            return jsonify({"error": "Email and full name are required"}), 400

        # Check for duplicate email
        existing_user = User.query.filter_by(email=data['email'], is_deleted=False).first()
        if existing_user:
            return jsonify({"error": f"User with email '{data['email']}' already exists"}), 409

        # Create new Buyer user
        new_buyer = User(
            email=data['email'],
            phone=data.get('phone'),
            role_id=role.role_id,
            full_name=data['full_name'],
            created_at=datetime.utcnow(),
            is_deleted=False,
            is_active=True,
            department='Operations - Procurement'
        )

        db.session.add(new_buyer)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Procurement created successfully",
            "user_id": new_buyer.user_id,
            "buyer": {
                "user_id": new_buyer.user_id,
                "full_name": new_buyer.full_name,
                "email": new_buyer.email,
                "phone": new_buyer.phone,
                "role": "buyer",
                "department": new_buyer.department
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating Buyer: {str(e)}")
        return jsonify({"error": f"Failed to create Buyer: {str(e)}"}), 500


def get_all_buyers():
    """Get all buyers (assigned and unassigned)"""
    try:
        # PERFORMANCE FIX: Use JOIN instead of N+1 queries (no User.buyer_projects relationship exists)
        from sqlalchemy import and_

        role = Role.query.filter_by(role='buyer').first()
        if not role:
            return jsonify({"error": "Buyer role not found"}), 404

        # Get buyers
        buyers = User.query.filter_by(role_id=role.role_id, is_deleted=False).all()

        # Pre-fetch ALL projects for all buyers in ONE query
        buyer_ids = [b.user_id for b in buyers]
        projects_by_buyer = {}
        if buyer_ids:
            projects = Project.query.filter(
                Project.buyer_id.in_(buyer_ids),
                Project.is_deleted == False
            ).all()

            # Group projects by buyer_id
            for project in projects:
                if project.buyer_id not in projects_by_buyer:
                    projects_by_buyer[project.buyer_id] = []
                projects_by_buyer[project.buyer_id].append(project)

        assigned_list = []
        unassigned_list = []

        for buyer in buyers:
            # Use pre-fetched projects instead of querying
            projects = projects_by_buyer.get(buyer.user_id, [])

            if projects and len(projects) > 0:
                # Add each project under assigned list
                for project in projects:
                    assigned_list.append({
                        "user_id": buyer.user_id,
                        "buyer_name": buyer.full_name,
                        "full_name": buyer.full_name,
                        "email": buyer.email,
                        "phone": buyer.phone,
                        "project_id": project.project_id,
                        "project_name": project.project_name
                    })
            else:
                # Buyer without project assignment
                unassigned_list.append({
                    "user_id": buyer.user_id,
                    "buyer_name": buyer.full_name,
                    "full_name": buyer.full_name,
                    "email": buyer.email,
                    "phone": buyer.phone,
                    "project_id": None
                })

        return jsonify({
            "success": True,
            "assigned_count": len(assigned_list),
            "unassigned_count": len(unassigned_list),
            "assigned_buyers": assigned_list,
            "unassigned_buyers": unassigned_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching Procurement: {str(e)}")
        return jsonify({"error": f"Failed to fetch Procurement: {str(e)}"}), 500


def get_buyer_id(user_id):
    """Get buyer by user ID with assigned projects"""
    try:
        buyer = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        # Get assigned projects
        projects = Project.query.filter_by(buyer_id=user_id, is_deleted=False).all()

        buyer_data = {
            "user_id": buyer.user_id,
            "full_name": buyer.full_name,
            "email": buyer.email,
            "phone": buyer.phone,
            "department": buyer.department,
            "assigned_projects": [
                {
                    "project_id": p.project_id,
                    "project_name": p.project_name,
                    "client": p.client,
                    "location": p.location
                } for p in projects
            ]
        }

        return jsonify({
            "success": True,
            "buyer": buyer_data
        }), 200

    except Exception as e:
        log.error(f"Error fetching Procurement {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to fetch Procurement: {str(e)}"}), 500


def update_buyer(user_id):
    """Update buyer details"""
    try:
        buyer = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        data = request.get_json()

        # Update buyer details
        if "full_name" in data:
            buyer.full_name = data["full_name"]
        if "email" in data:
            # Check for duplicate email
            existing = User.query.filter(
                User.email == data["email"],
                User.user_id != user_id,
                User.is_deleted == False
            ).first()
            if existing:
                return jsonify({"error": f"Email '{data['email']}' is already in use"}), 409
            buyer.email = data["email"]
        if "phone" in data:
            buyer.phone = data["phone"]

        buyer.last_modified_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Procurement updated successfully",
            "buyer": {
                "user_id": buyer.user_id,
                "full_name": buyer.full_name,
                "email": buyer.email,
                "phone": buyer.phone
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating Procurement {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to update Procurement: {str(e)}"}), 500


def delete_buyer(user_id):
    """Soft delete a buyer"""
    try:
        buyer = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not buyer:
            return jsonify({"error": "Procurement not found"}), 404

        # Check assigned projects
        assigned_projects = Project.query.filter_by(buyer_id=user_id, is_deleted=False).all()
        if assigned_projects and len(assigned_projects) > 0:
            projects_list = [
                {"project_id": p.project_id, "project_name": p.project_name}
                for p in assigned_projects
            ]
            return jsonify({
                "success": False,
                "message": "Cannot delete Procurement. They are assigned to one or more projects.",
                "assigned_projects": projects_list
            }), 400

        # Perform soft delete
        buyer.is_deleted = True
        buyer.is_active = False
        buyer.last_modified_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Procurement deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting Procurement {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to delete Procurement: {str(e)}"}), 500


def get_buyer_boq_materials():
    """Get BOQ materials from projects assigned to buyer AND site engineer by PM"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get projects where BOTH buyer AND site_supervisor (SE) are assigned
        # Only show materials when both buyer and SE are assigned to the project
        # Admin sees all projects
        # ✅ PERFORMANCE FIX: Eager load BOQs and BOQDetails (100+ queries → 2)
        if user_role == 'admin':
            projects = Project.query.options(
                selectinload(Project.boqs).selectinload(BOQ.details)
            ).filter(
                Project.site_supervisor_id.isnot(None),  # SE must be assigned
                Project.is_deleted == False
            ).all()
        else:
            projects = Project.query.options(
                selectinload(Project.boqs).selectinload(BOQ.details)
            ).filter(
                Project.buyer_id == buyer_id,
                Project.site_supervisor_id.isnot(None),  # SE must be assigned
                Project.is_deleted == False
            ).all()

        materials_list = []
        total_cost = 0

        for project in projects:
            # Get BOQs for this project (no query - already loaded via selectinload)
            boqs = [boq for boq in project.boqs if not boq.is_deleted]

            for boq in boqs:
                # Get BOQ details (no query - already loaded via selectinload)
                boq_details_list = [bd for bd in boq.details if not bd.is_deleted]
                boq_details = boq_details_list[0] if boq_details_list else None

                if boq_details and boq_details.boq_details:
                    items = boq_details.boq_details.get('items', [])

                    for item in items:
                        # Get sub-items
                        sub_items = item.get('sub_items', [])

                        for sub_item in sub_items:
                            materials = sub_item.get('materials', [])

                            for material in materials:
                                material_total = float(material.get('total_price', 0) or 0)
                                total_cost += material_total

                                materials_list.append({
                                    "project_id": project.project_id,
                                    "project_name": project.project_name,
                                    "client": project.client,
                                    "location": project.location,
                                    "boq_id": boq.boq_id,
                                    "boq_name": boq.boq_name,
                                    "item_name": item.get('item_name'),
                                    "sub_item_name": sub_item.get('sub_item_name'),
                                    "material_name": material.get('material_name'),
                                    "quantity": material.get('quantity'),
                                    "unit": material.get('unit'),
                                    "unit_price": material.get('unit_price'),
                                    "total_price": material_total,
                                    "master_material_id": material.get('master_material_id'),
                                    "material_type": "BOQ",
                                    "brand": material.get('brand'),
                                    "specification": material.get('specification')
                                })

        return jsonify({
            "success": True,
            "materials_count": len(materials_list),
            "total_cost": round(total_cost, 2),
            "projects_count": len(projects),
            "materials": materials_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching Procurement BOQ materials: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch BOQ materials: {str(e)}"}), 500


def get_buyer_dashboard():
    """Get buyer dashboard statistics with detailed counts and workflow data"""
    try:
        from sqlalchemy import or_, and_, func, desc
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = (current_user.get('role_name', '') or current_user.get('role', '')).lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # FORCE admin to see all data
        if user_role == 'admin':
            is_admin_viewing = True

        # Initialize detailed stats
        stats = {
            'total_materials': 0,
            'pending_purchase': 0,
            'ordered': 0,
            'delivered': 0,
            'total_projects': 0,
            'total_cost': 0
        }

        # Workflow stages with detailed tracking
        workflow_stats = {
            'new_requests': 0,           # assigned_to_buyer (needs vendor selection)
            'pending_td_approval': 0,    # pending_td_approval (waiting for TD)
            'vendor_approved': 0,        # vendor_approved (ready to purchase)
            'purchase_completed': 0,     # purchase_completed (done)
            'total_orders': 0
        }

        # Cost breakdown by status
        cost_breakdown = {
            'pending_cost': 0,
            'ordered_cost': 0,
            'completed_cost': 0,
            'total_cost': 0
        }

        # Materials by status
        materials_breakdown = {
            'pending_materials': 0,
            'ordered_materials': 0,
            'completed_materials': 0
        }

        project_ids = set()
        project_data = {}  # Track per-project stats
        pending_purchases = []
        recent_purchases = []

        # Define status categories - Match Purchase Orders page statuses
        # Pending: needs vendor selection
        pending_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'under_review']
        # TD Approval: vendor selected, waiting for TD
        td_approval_statuses = ['pending_td_approval']
        # Vendor Approved: ready to complete purchase
        ordered_statuses = ['vendor_approved']
        # Completed
        completed_statuses = ['purchase_completed']

        buyer_id_int = int(buyer_id)

        # Get all CRs assigned to buyer (or all for admin) - same logic as Purchase Orders page
        if is_admin_viewing or user_role == 'admin':
            # Admin sees ALL CRs assigned to any buyer
            change_requests = ChangeRequest.query.filter(
                ChangeRequest.assigned_to_buyer_user_id.isnot(None),
                ChangeRequest.is_deleted == False
            ).order_by(desc(ChangeRequest.updated_at)).all()
        else:
            # Regular buyer sees only their assigned CRs
            change_requests = ChangeRequest.query.filter(
                or_(
                    # Assigned to buyer statuses
                    and_(
                        func.trim(ChangeRequest.status).in_(pending_statuses + td_approval_statuses + ordered_statuses + completed_statuses),
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    ),
                    # Under review AND approval_required_from='buyer'
                    and_(
                        func.trim(ChangeRequest.status) == 'under_review',
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    )
                ),
                ChangeRequest.is_deleted == False
            ).order_by(desc(ChangeRequest.updated_at)).all()

        # ✅ PERFORMANCE OPTIMIZATION: Batch load all BOQs and Projects upfront
        # Instead of N+1 queries (2 queries per CR), we do 2 batch queries total
        cr_boq_ids = list(set([cr.boq_id for cr in change_requests if cr.boq_id]))

        # Batch load all BOQs (was: 1 query per CR = N queries, now: 1 query total)
        all_boqs = {}
        if cr_boq_ids:
            boqs = BOQ.query.filter(BOQ.boq_id.in_(cr_boq_ids), BOQ.is_deleted == False).all()
            for b in boqs:
                all_boqs[b.boq_id] = b

        # Batch load all Projects (was: 1 query per CR = N queries, now: 1 query total)
        project_ids_for_boqs = list(set([b.project_id for b in all_boqs.values() if b.project_id]))
        all_projects = {}
        if project_ids_for_boqs:
            projects = Project.query.filter(Project.project_id.in_(project_ids_for_boqs), Project.is_deleted == False).all()
            for p in projects:
                all_projects[p.project_id] = p

        # PERFORMANCE: Batch load all Vendors (was: 1 query per CR with vendor, now: 1 query total)
        vendor_ids = list(set([cr.selected_vendor_id for cr in change_requests if cr.selected_vendor_id]))
        all_vendors = {}
        if vendor_ids:
            vendors = Vendor.query.filter(Vendor.vendor_id.in_(vendor_ids), Vendor.is_deleted == False).all()
            for v in vendors:
                all_vendors[v.vendor_id] = v

        for cr in change_requests:
            # Get BOQ and project info from pre-loaded data (NO QUERY)
            boq = all_boqs.get(cr.boq_id)  # ✅ Uses pre-loaded dict instead of query
            if not boq:
                continue

            project = all_projects.get(boq.project_id)  # ✅ Uses pre-loaded dict instead of query
            if not project:
                continue

            project_id = boq.project_id
            project_ids.add(project_id)

            # Initialize project data if not exists
            if project_id not in project_data:
                project_data[project_id] = {
                    'project_id': project_id,
                    'project_name': project.project_name,
                    'total_orders': 0,
                    'pending': 0,
                    'completed': 0,
                    'total_cost': 0
                }

            # Calculate materials count and cost
            sub_items_data = cr.sub_items_data or cr.materials_data or []
            cr_total = 0
            materials_count = 0

            if cr.sub_items_data:
                for sub_item in sub_items_data:
                    if isinstance(sub_item, dict):
                        sub_materials = sub_item.get('materials', [])
                        if sub_materials:
                            materials_count += len(sub_materials)
                            for material in sub_materials:
                                cr_total += float(material.get('total_price', 0) or 0)
                        else:
                            materials_count += 1
                            cr_total += float(sub_item.get('total_price', 0) or 0)
            else:
                materials_count = len(sub_items_data)
                for material in sub_items_data:
                    cr_total += float(material.get('total_price', 0) or 0)

            # Update stats based on status
            stats['total_materials'] += materials_count
            stats['total_cost'] += cr_total
            workflow_stats['total_orders'] += 1
            project_data[project_id]['total_orders'] += 1
            project_data[project_id]['total_cost'] += cr_total

            cr_status = (cr.status or '').strip().lower()

            # Workflow stage tracking - match all buyer-related statuses
            if cr_status in ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'under_review']:
                # New requests - awaiting vendor selection
                stats['pending_purchase'] += 1
                workflow_stats['new_requests'] += 1
                cost_breakdown['pending_cost'] += cr_total
                materials_breakdown['pending_materials'] += materials_count
                project_data[project_id]['pending'] += 1
            elif cr_status == 'pending_td_approval':
                # Vendor selected, waiting for TD approval
                stats['ordered'] += 1
                workflow_stats['pending_td_approval'] += 1
                cost_breakdown['ordered_cost'] += cr_total
                materials_breakdown['ordered_materials'] += materials_count
            elif cr_status == 'vendor_approved':
                # TD approved, ready to complete purchase
                stats['ordered'] += 1
                workflow_stats['vendor_approved'] += 1
                cost_breakdown['ordered_cost'] += cr_total
                materials_breakdown['ordered_materials'] += materials_count
            elif cr_status == 'purchase_completed':
                # Purchase completed
                stats['delivered'] += 1
                workflow_stats['purchase_completed'] += 1
                cost_breakdown['completed_cost'] += cr_total
                materials_breakdown['completed_materials'] += materials_count
                project_data[project_id]['completed'] += 1
            else:
                # Any other status assigned to buyer - count as pending
                stats['pending_purchase'] += 1
                workflow_stats['new_requests'] += 1
                cost_breakdown['pending_cost'] += cr_total
                materials_breakdown['pending_materials'] += materials_count
                project_data[project_id]['pending'] += 1

            # Build purchase info
            purchase_info = {
                "cr_id": cr.cr_id,
                "project_id": project_id,
                "project_name": project.project_name,
                "materials_count": materials_count,
                "total_cost": round(cr_total, 2),
                "status": cr.status,
                "status_display": get_status_display(cr.status),
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "updated_at": cr.updated_at.isoformat() if cr.updated_at else None,
                "vendor_name": None
            }

            # PERFORMANCE: Get vendor info from pre-loaded dict (NO QUERY)
            if cr.selected_vendor_id:
                vendor = all_vendors.get(cr.selected_vendor_id)
                if vendor:
                    purchase_info['vendor_name'] = vendor.company_name

            # Add to pending list if not completed
            if cr_status != 'purchase_completed':
                pending_purchases.append(purchase_info)

            # Add to recent purchases (limit to 10)
            if len(recent_purchases) < 10:
                recent_purchases.append(purchase_info)

        # PERFORMANCE: Also count POChild records (split vendor orders like PO-400.1, PO-400.2)
        # Use eager loading to prevent N+1 queries
        from sqlalchemy.orm import joinedload
        po_children = POChild.query.options(
            joinedload(POChild.parent_cr)
        ).filter(
            POChild.is_deleted == False
        ).all()

        for po_child in po_children:
            # PERFORMANCE: Use preloaded parent CR (NO QUERY)
            parent_cr = po_child.parent_cr
            if not parent_cr or parent_cr.is_deleted or not parent_cr.assigned_to_buyer_user_id:
                continue

            # For non-admin, check if assigned to current buyer
            if not is_admin_viewing and user_role != 'admin':
                if parent_cr.assigned_to_buyer_user_id != buyer_id_int:
                    continue

            # Calculate materials cost from POChild
            po_child_materials = po_child.materials_data or []
            po_child_total = sum(float(m.get('total_price', 0) or 0) for m in po_child_materials)
            po_child_materials_count = len(po_child_materials)

            po_child_status = (po_child.status or '').strip().lower()

            # Count based on status - but don't double count if parent CR already counted
            if po_child_status == 'pending_td_approval':
                workflow_stats['pending_td_approval'] += 1
                stats['ordered'] += 1
                cost_breakdown['ordered_cost'] += po_child_total
                materials_breakdown['ordered_materials'] += po_child_materials_count
            elif po_child_status == 'vendor_approved':
                workflow_stats['vendor_approved'] += 1
                stats['ordered'] += 1
                cost_breakdown['ordered_cost'] += po_child_total
                materials_breakdown['ordered_materials'] += po_child_materials_count
            elif po_child_status == 'purchase_completed':
                workflow_stats['purchase_completed'] += 1
                stats['delivered'] += 1
                cost_breakdown['completed_cost'] += po_child_total
                materials_breakdown['completed_materials'] += po_child_materials_count

            workflow_stats['total_orders'] += 1
            stats['total_materials'] += po_child_materials_count
            stats['total_cost'] += po_child_total

            # Get project info for POChild
            if parent_cr.boq_id:
                boq = BOQ.query.filter_by(boq_id=parent_cr.boq_id, is_deleted=False).first()
                if boq:
                    project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
                    if project:
                        project_id = boq.project_id
                        project_ids.add(project_id)

                        if project_id not in project_data:
                            project_data[project_id] = {
                                'project_id': project_id,
                                'project_name': project.project_name,
                                'total_orders': 0,
                                'pending': 0,
                                'completed': 0,
                                'total_cost': 0
                            }

                        project_data[project_id]['total_orders'] += 1
                        project_data[project_id]['total_cost'] += po_child_total

                        if po_child_status == 'purchase_completed':
                            project_data[project_id]['completed'] += 1
                        elif po_child_status not in ['vendor_approved', 'pending_td_approval']:
                            project_data[project_id]['pending'] += 1

                        # Add to recent purchases
                        vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id).first() if po_child.vendor_id else None
                        if len(recent_purchases) < 10:
                            recent_purchases.append({
                                "cr_id": po_child.parent_cr_id,
                                "po_child_id": po_child.id,
                                "formatted_id": f"PO-{po_child.parent_cr_id}{po_child.suffix or ''}",
                                "project_id": project_id,
                                "project_name": project.project_name,
                                "materials_count": po_child_materials_count,
                                "total_cost": round(po_child_total, 2),
                                "status": po_child.status,
                                "status_display": get_status_display(po_child.status),
                                "created_at": po_child.created_at.isoformat() if po_child.created_at else None,
                                "updated_at": po_child.updated_at.isoformat() if po_child.updated_at else None,
                                "vendor_name": vendor.company_name if vendor else None
                            })

        stats['total_projects'] = len(project_ids)
        stats['total_cost'] = round(stats['total_cost'], 2)
        cost_breakdown['total_cost'] = round(cost_breakdown['pending_cost'] + cost_breakdown['ordered_cost'] + cost_breakdown['completed_cost'], 2)
        cost_breakdown['pending_cost'] = round(cost_breakdown['pending_cost'], 2)
        cost_breakdown['ordered_cost'] = round(cost_breakdown['ordered_cost'], 2)
        cost_breakdown['completed_cost'] = round(cost_breakdown['completed_cost'], 2)

        # Calculate completion rate
        total_orders = workflow_stats['total_orders']
        completion_rate = round((workflow_stats['purchase_completed'] / total_orders * 100), 1) if total_orders > 0 else 0

        # Sort projects by total cost
        projects_list = sorted(project_data.values(), key=lambda x: x['total_cost'], reverse=True)

        # Sort recent purchases by updated_at descending
        recent_purchases.sort(key=lambda x: x.get('updated_at') or '', reverse=True)

        return jsonify({
            "success": True,
            "stats": stats,
            "workflow_stats": workflow_stats,
            "cost_breakdown": cost_breakdown,
            "materials_breakdown": materials_breakdown,
            "completion_rate": completion_rate,
            "projects": projects_list[:5],  # Top 5 projects
            "recent_purchases": recent_purchases,
            "pending_purchases": pending_purchases,
            "total_cost": stats['total_cost']
        }), 200

    except Exception as e:
        log.error(f"Error fetching Procurement dashboard: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch dashboard: {str(e)}"}), 500


def get_status_display(status):
    """Convert status to user-friendly display text"""
    status_map = {
        'assigned_to_buyer': 'New - Awaiting Vendor Selection',
        'send_to_buyer': 'New - Awaiting Vendor Selection',
        'approved_by_pm': 'PM Approved - Awaiting Vendor',
        'under_review': 'Under Review',
        'pending_td_approval': 'Pending TD Approval',
        'vendor_approved': 'Vendor Approved - Ready to Purchase',
        'purchase_completed': 'Purchase Completed'
    }
    return status_map.get(status, status)


def get_buyer_pending_purchases():
    """Get approved change requests (extra materials) for buyer to purchase"""
    try:
        from flask import request as flask_request
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # Get headers for debugging
        viewing_as_role_header = flask_request.headers.get('X-Viewing-As-Role')
        viewing_as_role_id_header = flask_request.headers.get('X-Viewing-As-Role-Id')

        # FORCE admin to see all buyer data if they are admin (regardless of headers)
        # This is a workaround if headers are not working
        if user_role == 'admin':
            is_admin_viewing = True

        # Get change requests for buyer:
        # 1. Under review AND approval_required_from='buyer' (pending buyer's review/acceptance)
        # 2. Assigned to this buyer (via assigned_to_buyer_user_id) - actively being worked on
        # 3. CRs with pending_td_approval OR vendor_approved status (vendor selection flow)
        # NOTE: Sub-CRs are deprecated - now using po_child table for vendor splits
        from sqlalchemy import or_, and_, func

        # Convert buyer_id to int for safe comparison
        buyer_id_int = int(buyer_id)

        # ✅ PERFORMANCE OPTIMIZATION: Import eager loading functions
        from sqlalchemy.orm import selectinload, joinedload

        # ✅ PERFORMANCE: Add pagination support
        page = flask_request.args.get('page', 1, type=int)
        per_page = min(flask_request.args.get('per_page', 50, type=int), 100)  # Max 100 per page

        # If admin is viewing as buyer, show ALL purchases (no buyer filtering)
        # If regular buyer, show only purchases assigned to them
        if is_admin_viewing:
            # SIMPLIFIED QUERY: Show ALL CRs assigned to any buyer (for admin viewing)
            # Exclude purchase_completed status - those should go to completed tab
            # Exclude rejected items - those should only show in rejected tab
            # ✅ PERFORMANCE: Add eager loading to prevent N+1 queries + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),  # 1-to-1: Use joinedload
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),  # 1-to-many chain
                joinedload(ChangeRequest.vendor),  # 1-to-1: Use joinedload
                selectinload(ChangeRequest.store_requests),  # 1-to-many
                selectinload(ChangeRequest.po_children)  # 1-to-many
            ).filter(
                ChangeRequest.assigned_to_buyer_user_id.isnot(None),
                ChangeRequest.is_deleted == False,
                func.trim(ChangeRequest.status) != 'purchase_completed',
                or_(
                    ChangeRequest.vendor_selection_status.is_(None),
                    ChangeRequest.vendor_selection_status != 'rejected'
                )
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items

        else:
            # ✅ PERFORMANCE: Add eager loading to prevent N+1 queries + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor),
                selectinload(ChangeRequest.store_requests),
                selectinload(ChangeRequest.po_children)
            ).filter(
                or_(
                    # Under review AND approval_required_from='buyer' AND assigned to this buyer
                    and_(
                        func.trim(ChangeRequest.status) == 'under_review',
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    ),
                    # Assigned to this buyer - actively being worked on
                    and_(
                        func.trim(ChangeRequest.status).in_(['assigned_to_buyer', 'send_to_buyer']),
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    ),
                    # CRs with pending_td_approval OR vendor_approved status (full purchase to single vendor)
                    and_(
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int,
                        func.trim(ChangeRequest.status).in_(['pending_td_approval', 'vendor_approved'])
                    ),
                    # approved_by_pm or send_to_buyer status AND assigned to this buyer
                    and_(
                        func.trim(ChangeRequest.status).in_(['approved_by_pm', 'send_to_buyer']),
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    )
                ),
                ChangeRequest.is_deleted == False,
                # Exclude rejected items - those should only show in rejected tab
                or_(
                    ChangeRequest.vendor_selection_status.is_(None),
                    ChangeRequest.vendor_selection_status != 'rejected'
                )
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items

        pending_purchases = []
        total_cost = 0

        for cr in change_requests:
            # ✅ PERFORMANCE: Use preloaded relationships instead of separate queries
            # Get project details (already loaded via joinedload)
            project = cr.project
            if not project:
                continue

            # Get BOQ details (already loaded via selectinload)
            boq = cr.boq
            if not boq:
                continue

            # Get BOQ details (already loaded via selectinload chain)
            boq_details = boq.details[0] if boq.details else None
            materials_list, cr_total = process_materials_with_negotiated_prices(cr, boq_details)

            total_cost += cr_total

            # Get the first sub-item's sub_item_name for display (since all materials in a CR should be from same sub-item)
            first_sub_item_name = materials_list[0].get('sub_item_name', 'N/A') if materials_list else 'N/A'

            # Check if vendor selection is pending TD approval
            vendor_selection_pending_td_approval = (
                cr.vendor_selection_status == 'pending_td_approval'
            )

            # Validate and refresh material_vendor_selections with current vendor data
            # This ensures deleted vendors are removed and vendor names are up-to-date
            validated_material_vendor_selections = {}
            if cr.material_vendor_selections:
                from models.vendor import Vendor as VendorModel
                # Get all unique vendor IDs from selections
                mvs_vendor_ids = set()
                for selection in cr.material_vendor_selections.values():
                    if isinstance(selection, dict) and selection.get('vendor_id'):
                        mvs_vendor_ids.add(selection.get('vendor_id'))

                # Fetch all referenced vendors in one query
                active_mvs_vendors = {
                    v.vendor_id: v for v in VendorModel.query.filter(
                        VendorModel.vendor_id.in_(mvs_vendor_ids),
                        VendorModel.is_deleted == False
                    ).all()
                } if mvs_vendor_ids else {}

                # Validate each selection
                for material_name, selection in cr.material_vendor_selections.items():
                    if isinstance(selection, dict) and selection.get('vendor_id'):
                        vendor_id = selection.get('vendor_id')
                        if vendor_id in active_mvs_vendors:
                            # Vendor exists - refresh vendor_name with current value
                            validated_selection = dict(selection)
                            validated_selection['vendor_name'] = active_mvs_vendors[vendor_id].company_name
                            validated_material_vendor_selections[material_name] = validated_selection
                        # If vendor doesn't exist (deleted), skip this selection
                    else:
                        # Selection without vendor_id (just negotiated price) - keep it
                        validated_material_vendor_selections[material_name] = selection

            # Get full vendor details from Vendor table if vendor is selected
            vendor_details = {
                'phone': None,
                'phone_code': None,
                'contact_person': None,
                'email': None,
                'category': None,
                'street_address': None,
                'city': None,
                'state': None,
                'country': None,
                'gst_number': None,
                'selected_by_name': None
            }
            # Initialize vendor_trn and vendor_email before conditional blocks
            vendor_trn = ""
            vendor_email = ""
            if cr.selected_vendor_id:
                # ✅ PERFORMANCE: Use preloaded vendor relationship
                vendor = cr.vendor
                if vendor and not vendor.is_deleted:
                    vendor_details['phone'] = vendor.phone
                    vendor_details['phone_code'] = vendor.phone_code
                    vendor_details['contact_person'] = vendor.contact_person_name
                    vendor_details['email'] = vendor.email
                    vendor_details['category'] = vendor.category
                    vendor_details['street_address'] = vendor.street_address
                    vendor_details['city'] = vendor.city
                    vendor_details['state'] = vendor.state
                    vendor_details['country'] = vendor.country
                    vendor_details['gst_number'] = vendor.gst_number
                    # Set vendor_trn and vendor_email from vendor object
                    vendor_trn = vendor.gst_number or ""
                    vendor_email = vendor.email or ""
                # Get who selected the vendor
                if cr.vendor_selected_by_buyer_id:
                    from models.user import User
                    selector = User.query.get(cr.vendor_selected_by_buyer_id)
                    if selector:
                        vendor_details['selected_by_name'] = selector.full_name

            # ✅ PERFORMANCE: Use preloaded store_requests relationship
            store_requests = cr.store_requests if cr.store_requests else []
            has_store_requests = len(store_requests) > 0

            # Check store request statuses
            all_store_requests_approved = False
            any_store_request_rejected = False
            store_requests_pending = False

            # Track which specific materials have been sent to store (for partial store requests)
            store_requested_material_names = []

            if has_store_requests:
                approved_count = sum(1 for r in store_requests if r.status and r.status.lower() in ['approved', 'dispatched', 'fulfilled'])
                rejected_count = sum(1 for r in store_requests if r.status and r.status.lower() == 'rejected')
                pending_count = sum(1 for r in store_requests if r.status and r.status.lower() in ['pending', 'send_request'])

                # Get list of material names that have ACTIVE store requests (exclude rejected)
                # Rejected materials should become available for vendor selection again
                store_requested_material_names = [
                    r.material_name for r in store_requests
                    if r.material_name and r.status and r.status.lower() not in ['rejected']
                ]

                all_store_requests_approved = approved_count == len(store_requests) and len(store_requests) > 0
                any_store_request_rejected = rejected_count > 0

                # IMPORTANT: Only mark as "store_requests_pending" if ALL materials are sent to store
                # If only some materials are sent, keep PO in "Pending Purchase" so remaining can go to vendor
                total_materials = len(materials_list)
                store_requested_count = len(store_requested_material_names)

                # store_requests_pending = True only when ALL materials have pending store requests
                store_requests_pending = pending_count > 0 and store_requested_count >= total_materials

            # ✅ PERFORMANCE: Use preloaded po_children relationship
            # Get POChild records for this CR (if any exist)
            # This allows the frontend to know which materials have already been sent to TD
            po_children_data = []
            # Filter out deleted po_children in Python (they're already loaded)
            po_children_for_parent = [pc for pc in (cr.po_children or []) if not pc.is_deleted]

            for po_child in po_children_for_parent:
                po_children_data.append({
                    "id": po_child.id,
                    "formatted_id": po_child.get_formatted_id(),
                    "suffix": po_child.suffix,
                    "vendor_id": po_child.vendor_id,
                    "vendor_name": po_child.vendor_name,
                    "vendor_selection_status": po_child.vendor_selection_status,
                    "status": po_child.status,
                    "materials": po_child.materials_data or [],
                    "materials_count": len(po_child.materials_data) if po_child.materials_data else 0,
                    "materials_total_cost": po_child.materials_total_cost,
                    "vendor_email_sent": po_child.vendor_email_sent,
                    "purchase_completed_by_name": po_child.purchase_completed_by_name,
                    "purchase_completion_date": po_child.purchase_completion_date.isoformat() if po_child.purchase_completion_date else None
                })

            # Check if ALL children are pending TD approval OR all approved (for admin view - parent should be hidden)
            all_children_sent_to_td_or_approved = False
            if po_children_for_parent:
                all_children_sent_to_td_or_approved = all(
                    po_child.vendor_selection_status in ['pending_td_approval', 'approved']
                    for po_child in po_children_for_parent
                )

            # For buyer/TD view: Skip parent PO if all children are sent for TD approval or approved
            # Parent is hidden because the split children (POChild) are shown separately
            if is_admin_viewing and all_children_sent_to_td_or_approved:
                continue

            # Get submission_group_id from first POChild if any exist
            submission_group_id = po_children_data[0].get('submission_group_id') if po_children_data else None

            pending_purchases.append({
                "cr_id": cr.cr_id,
                "formatted_cr_id": cr.get_formatted_cr_id(),
                "submission_group_id": submission_group_id,  # From POChild records
                "po_children": po_children_data,  # POChild records for vendor splits
                "project_id": project.project_id,
                "project_name": project.project_name,
                "project_code": project.project_code,
                "client": project.client or "Unknown Client",
                "location": project.location or "Unknown Location",
                "boq_id": cr.boq_id,
                "boq_name": boq.boq_name if boq else "Unknown",
                "item_name": cr.item_name or "N/A",
                "sub_item_name": first_sub_item_name,
                "request_type": cr.request_type or "EXTRA_MATERIALS",
                "reason": cr.justification or "",
                "materials": materials_list,
                "materials_count": len(materials_list),
                "total_cost": round(cr_total, 2),
                "requested_by_user_id": cr.requested_by_user_id if cr.requested_by_user_id else None,
                "requested_by_name": cr.requested_by_name if cr.requested_by_name else None,
                "requested_by_role": cr.requested_by_role if cr.requested_by_role else None,
                "approved_by": cr.approved_by_user_id,
                "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "vendor_id": cr.selected_vendor_id,
                "vendor_name": cr.selected_vendor_name,
                "vendor_phone": vendor_details['phone'],
                "vendor_phone_code": vendor_details['phone_code'],
                "vendor_contact_person": vendor_details['contact_person'],
                "vendor_email": vendor_details['email'],
                "vendor_category": vendor_details['category'],
                "vendor_street_address": vendor_details['street_address'],
                "vendor_city": vendor_details['city'],
                "vendor_state": vendor_details['state'],
                "vendor_country": vendor_details['country'],
                "vendor_gst_number": vendor_details['gst_number'],
                "vendor_selected_by_name": vendor_details['selected_by_name'],
                "vendor_selected_by_buyer_name": cr.vendor_selected_by_buyer_name,
                "vendor_approved_by_td_name": cr.vendor_approved_by_td_name,
                "vendor_approval_date": cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
                "vendor_selection_date": cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None,
                "vendor_trn": vendor_trn,
                "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
                "vendor_selection_status": cr.vendor_selection_status,  # 'pending_td_approval', 'approved', 'rejected'
                "vendor_email_sent": cr.vendor_email_sent or False,
                "vendor_email_sent_date": cr.vendor_email_sent_date.isoformat() if cr.vendor_email_sent_date else None,
                "vendor_whatsapp_sent": cr.vendor_whatsapp_sent or False,
                "vendor_whatsapp_sent_at": cr.vendor_whatsapp_sent_at.isoformat() if cr.vendor_whatsapp_sent_at else None,
                "use_per_material_vendors": cr.use_per_material_vendors or False,
                "material_vendor_selections": validated_material_vendor_selections,
                "has_store_requests": has_store_requests,
                "store_request_count": len(store_requests),
                "store_requested_materials": store_requested_material_names,  # List of material names sent to store
                "all_store_requests_approved": all_store_requests_approved,
                "any_store_request_rejected": any_store_request_rejected,
                "store_requests_pending": store_requests_pending,
                # VAT data from LPO customization
                "vat_percent": 5.0,  # Default, will be updated below
                "vat_amount": cr_total * 0.05  # Default, will be updated below
            })

            # Get VAT data from LPO customization for this purchase
            try:
                from models.lpo_customization import LPOCustomization
                lpo_customization = LPOCustomization.query.filter_by(cr_id=cr.cr_id, po_child_id=None).first()
                if lpo_customization and lpo_customization.vat_percent is not None:
                    vat_percent = float(lpo_customization.vat_percent)
                    pending_purchases[-1]["vat_percent"] = vat_percent
                    # Always recalculate VAT based on current subtotal (stored vat_amount may be stale)
                    pending_purchases[-1]["vat_amount"] = cr_total * vat_percent / 100
            except Exception:
                pass  # Keep defaults

        # Separate ongoing and pending approval
        ongoing_purchases = []
        pending_approval_purchases = []
        ongoing_total = 0
        pending_approval_total = 0

        for purchase in pending_purchases:
            if purchase.get('vendor_selection_pending_td_approval'):
                pending_approval_purchases.append(purchase)
                pending_approval_total += purchase.get('total_cost', 0)
            else:
                ongoing_purchases.append(purchase)
                ongoing_total += purchase.get('total_cost', 0)

        return jsonify({
            "success": True,
            "pending_purchases_count": len(pending_purchases),
            "total_cost": round(total_cost, 2),
            "pending_purchases": pending_purchases,
            "ongoing_purchases": ongoing_purchases,
            "ongoing_purchases_count": len(ongoing_purchases),
            "ongoing_total_cost": round(ongoing_total, 2),
            "pending_approval_purchases": pending_approval_purchases,
            "pending_approval_count": len(pending_approval_purchases),
            "pending_approval_total_cost": round(pending_approval_total, 2),
            # ✅ PERFORMANCE: Add pagination metadata
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated_result.total,
                "pages": paginated_result.pages,
                "has_next": paginated_result.has_next,
                "has_prev": paginated_result.has_prev
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer pending purchases: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending purchases: {str(e)}"}), 500


def get_buyer_completed_purchases():
    """Get completed purchases by buyer"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # ✅ PERFORMANCE: Import eager loading functions
        from sqlalchemy.orm import selectinload, joinedload
        from flask import request as flask_request

        # ✅ PERFORMANCE: Add pagination support
        page = flask_request.args.get('page', 1, type=int)
        per_page = min(flask_request.args.get('per_page', 50, type=int), 100)  # Max 100 per page

        # FORCE admin to see all data
        if user_role == 'admin':
            is_admin_viewing = True
        # If admin is viewing as buyer, show ALL completed purchases
        # If regular buyer, show only purchases assigned to them (not just completed by them)
        if is_admin_viewing:
            # ✅ PERFORMANCE: Add eager loading + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor),
                selectinload(ChangeRequest.po_children)
            ).filter(
                ChangeRequest.status == 'purchase_completed',
                ChangeRequest.is_deleted == False
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items
        else:
            # ✅ PERFORMANCE: Add eager loading + pagination
            # Show completed purchases where assigned_to_buyer_user_id matches current buyer
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor),
                selectinload(ChangeRequest.po_children)
            ).filter(
                ChangeRequest.status == 'purchase_completed',
                ChangeRequest.assigned_to_buyer_user_id == buyer_id,
                ChangeRequest.is_deleted == False
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items

        # Import POChild for checking if parent has completed children
        from models.po_child import POChild

        completed_purchases = []
        total_cost = 0

        for cr in change_requests:
            # ✅ PERFORMANCE: Use preloaded relationships
            # Get project details (already loaded via joinedload)
            project = cr.project
            if not project:
                continue

            # Get BOQ details (already loaded via selectinload)
            boq = cr.boq
            if not boq:
                continue

            # ✅ PERFORMANCE: Use preloaded po_children
            # BUYER VIEW: Skip parent CRs that have POChildren (all completed)
            # Parents should be hidden when they have children - only show children cards
            po_children_for_cr = [pc for pc in (cr.po_children or []) if not pc.is_deleted]

            if po_children_for_cr:
                # Parent has children - check if all are completed
                all_children_completed = all(
                    pc.status == 'purchase_completed' for pc in po_children_for_cr
                )
                if all_children_completed:
                    # Skip this parent CR - children will be shown separately
                    continue

            # Process materials
            sub_items_data = cr.sub_items_data or cr.materials_data or []
            cr_total = 0
            materials_list = []

            if cr.sub_items_data:
                for sub_item in sub_items_data:
                    if isinstance(sub_item, dict):
                        sub_materials = sub_item.get('materials', [])
                        if sub_materials:
                            for material in sub_materials:
                                material_total = float(material.get('total_price', 0) or 0)
                                cr_total += material_total
                                materials_list.append({
                                    "material_name": material.get('material_name', ''),
                                    "quantity": material.get('quantity', 0),
                                    "unit": material.get('unit', ''),
                                    "unit_price": material.get('unit_price', 0),
                                    "total_price": material_total,
                                    "brand": material.get('brand'),
                                    "specification": material.get('specification')
                                })
                        else:
                            sub_total = float(sub_item.get('total_price', 0) or 0)
                            cr_total += sub_total
                            materials_list.append({
                                "material_name": sub_item.get('material_name', ''),
                                "sub_item_name": sub_item.get('sub_item_name', ''),
                                "quantity": sub_item.get('quantity', 0),
                                "unit": sub_item.get('unit', ''),
                                "unit_price": sub_item.get('unit_price', 0),
                                "total_price": sub_total,
                                "brand": sub_item.get('brand'),
                                "specification": sub_item.get('specification')
                            })
            else:
                for material in sub_items_data:
                    material_total = float(material.get('total_price', 0) or 0)
                    cr_total += material_total
                    materials_list.append({
                        "material_name": material.get('material_name', ''),
                        "sub_item_name": material.get('sub_item_name', ''),
                        "quantity": material.get('quantity', 0),
                        "unit": material.get('unit', ''),
                        "unit_price": material.get('unit_price', 0),
                        "total_price": material_total,
                        "brand": material.get('brand'),
                        "specification": material.get('specification')
                    })

            total_cost += cr_total

            # Get the first sub-item's sub_item_name for display (since all materials in a CR should be from same sub-item)
            first_sub_item_name = materials_list[0].get('sub_item_name', 'N/A') if materials_list else 'N/A'

            # Check if vendor selection is pending TD approval
            vendor_selection_pending_td_approval = (
                cr.vendor_selection_status == 'pending_td_approval'
            )

            # Get full vendor details from Vendor table if vendor is selected
            vendor_details = {
                'phone': None,
                'phone_code': None,
                'contact_person': None,
                'email': None,
                'category': None,
                'street_address': None,
                'city': None,
                'state': None,
                'country': None,
                'gst_number': None,
                'selected_by_name': None
            }
            # Initialize vendor_trn and vendor_email before conditional blocks
            vendor_trn = ""
            vendor_email = ""
            if cr.selected_vendor_id:
                # ✅ PERFORMANCE: Use preloaded vendor relationship
                vendor = cr.vendor
                if vendor and not vendor.is_deleted:
                    vendor_details['phone'] = vendor.phone
                    vendor_details['phone_code'] = vendor.phone_code
                    vendor_details['contact_person'] = vendor.contact_person_name
                    vendor_details['email'] = vendor.email
                    vendor_details['category'] = vendor.category
                    vendor_details['street_address'] = vendor.street_address
                    vendor_details['city'] = vendor.city
                    vendor_details['state'] = vendor.state
                    vendor_details['country'] = vendor.country
                    vendor_details['gst_number'] = vendor.gst_number
                    # Set vendor_trn and vendor_email from vendor object
                    vendor_trn = vendor.gst_number or ""
                    vendor_email = vendor.email or ""
                # Get who selected the vendor
                if cr.vendor_selected_by_buyer_id:
                    from models.user import User
                    selector = User.query.get(cr.vendor_selected_by_buyer_id)
                    if selector:
                        vendor_details['selected_by_name'] = selector.full_name

            completed_purchases.append({
                "cr_id": cr.cr_id,
                "project_id": project.project_id,
                "project_name": project.project_name,
                "project_code": project.project_code,
                "client": project.client or "Unknown Client",
                "location": project.location or "Unknown Location",
                "boq_id": cr.boq_id,
                "boq_name": boq.boq_name if boq else "Unknown",
                "item_name": cr.item_name or "N/A",
                "sub_item_name": first_sub_item_name,
                "request_type": cr.request_type or "EXTRA_MATERIALS",
                "reason": cr.justification or "",
                "materials": materials_list,
                "materials_count": len(materials_list),
                "total_cost": round(cr_total, 2),
                "requested_by_user_id": cr.requested_by_user_id if cr.requested_by_user_id else None,
                "requested_by_name": cr.requested_by_name if cr.requested_by_name else None,
                "requested_by_role": cr.requested_by_role if cr.requested_by_role else None,
                "approved_by": cr.approved_by_user_id,
                "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "status": "completed",
                "purchase_completed_by_user_id": cr.purchase_completed_by_user_id,
                "purchase_completed_by_name": cr.purchase_completed_by_name,
                "purchase_completion_date": cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
                "purchase_notes": cr.purchase_notes,
                "vendor_id": cr.selected_vendor_id,
                "vendor_name": cr.selected_vendor_name,
                "vendor_phone": vendor_details['phone'],
                "vendor_phone_code": vendor_details['phone_code'],
                "vendor_contact_person": vendor_details['contact_person'],
                "vendor_email": vendor_details['email'],
                "vendor_category": vendor_details['category'],
                "vendor_street_address": vendor_details['street_address'],
                "vendor_city": vendor_details['city'],
  "vendor_state": vendor_details['state'],
                "vendor_country": vendor_details['country'],
                "vendor_gst_number": vendor_details['gst_number'],
                "vendor_selected_by_name": vendor_details['selected_by_name'],
                "vendor_selected_by_buyer_name": cr.vendor_selected_by_buyer_name,
                "vendor_approved_by_td_name": cr.vendor_approved_by_td_name,
                "vendor_approval_date": cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
                "vendor_selection_date": cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_trn": vendor_trn,
                "vendor_email": vendor_email,
                "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
                # VAT data
                "vat_percent": 5.0,  # Default
                "vat_amount": cr_total * 0.05  # Default
            })

            # Get VAT data from LPO customization for this purchase
            try:
                from models.lpo_customization import LPOCustomization
                lpo_customization = LPOCustomization.query.filter_by(cr_id=cr.cr_id, po_child_id=None).first()
                if lpo_customization and lpo_customization.vat_percent is not None:
                    vat_percent = float(lpo_customization.vat_percent)
                    completed_purchases[-1]["vat_percent"] = vat_percent
                    # Always recalculate VAT based on current subtotal (stored vat_amount may be stale)
                    completed_purchases[-1]["vat_amount"] = cr_total * vat_percent / 100
            except Exception:
                pass  # Keep defaults

        # Also get completed POChildren (vendor-split purchases)
        # POChild already imported above

        if is_admin_viewing:
            completed_po_children = POChild.query.options(
                joinedload(POChild.parent_cr)
            ).filter(
                POChild.status.in_(['purchase_completed', 'routed_to_store']),
                POChild.is_deleted == False
            ).order_by(
                POChild.updated_at.desc().nulls_last(),
                POChild.created_at.desc()
            ).all()
        else:
            # Get POChildren where parent CR is assigned to this buyer
            completed_po_children = POChild.query.options(
                joinedload(POChild.parent_cr)
            ).join(
                ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
            ).filter(
                POChild.status.in_(['purchase_completed', 'routed_to_store']),
                POChild.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id == buyer_id
            ).order_by(
                POChild.updated_at.desc().nulls_last(),
                POChild.created_at.desc()
            ).all()

        completed_po_children_list = []
        for po_child in completed_po_children:
            parent_cr = po_child.parent_cr  # Use preloaded relationship
            project = Project.query.get(parent_cr.project_id) if parent_cr else None
            boq = BOQ.query.get(po_child.boq_id) if po_child.boq_id else (BOQ.query.get(parent_cr.boq_id) if parent_cr and parent_cr.boq_id else None)

            # Get vendor details
            vendor = None
            if po_child.vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.get(po_child.vendor_id)

            po_child_total = po_child.materials_total_cost or 0
            total_cost += po_child_total

            # Get VAT data for PO Child
            vat_percent = 5.0  # Default
            vat_amount = po_child_total * 0.05  # Default
            try:
                from models.lpo_customization import LPOCustomization
                lpo_customization = LPOCustomization.query.filter_by(
                    cr_id=parent_cr.cr_id if parent_cr else None,
                    po_child_id=po_child.id
                ).first()
                if not lpo_customization and parent_cr:
                    # Fall back to CR-level customization
                    lpo_customization = LPOCustomization.query.filter_by(cr_id=parent_cr.cr_id, po_child_id=None).first()
                if lpo_customization and lpo_customization.vat_percent is not None:
                    vat_percent = float(lpo_customization.vat_percent)
                    # Always recalculate VAT based on current subtotal (stored vat_amount may be stale)
                    vat_amount = po_child_total * vat_percent / 100
            except Exception:
                pass  # Keep defaults

            completed_po_children_list.append({
                **po_child.to_dict(),
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                'vendor_phone': vendor.phone if vendor else None,
                'vendor_contact_person': vendor.contact_person_name if vendor else None,
                'is_po_child': True,
                'vat_percent': vat_percent,
                'vat_amount': vat_amount
            })

        return jsonify({
            "success": True,
            "completed_purchases_count": len(completed_purchases),
            "total_cost": round(total_cost, 2),
            "completed_purchases": completed_purchases,
            "completed_po_children": completed_po_children_list,
            "completed_po_children_count": len(completed_po_children_list),
            # ✅ PERFORMANCE: Add pagination metadata
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated_result.total,
                "pages": paginated_result.pages,
                "has_next": paginated_result.has_next,
                "has_prev": paginated_result.has_prev
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching completed purchases: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch completed purchases: {str(e)}"}), 500


def get_buyer_rejected_purchases():
    """Get rejected change requests for buyer (rejected by TD or vendor selection rejected)"""
    try:
        from utils.admin_viewing_context import get_effective_user_context
        from sqlalchemy import or_, and_

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # ✅ PERFORMANCE: Import eager loading functions
        from sqlalchemy.orm import selectinload, joinedload
        from flask import request as flask_request

        # ✅ PERFORMANCE: Add pagination support
        page = flask_request.args.get('page', 1, type=int)
        per_page = min(flask_request.args.get('per_page', 50, type=int), 100)  # Max 100 per page

        # FORCE admin to see all data
        if user_role == 'admin':
            is_admin_viewing = True

        # Get rejected change requests:
        # 1. status='rejected' (rejected by TD)
        # 2. vendor_selection_status='rejected' (vendor rejected by TD)
        # EXCLUDE: CRs that have been split into POChildren (status='split_to_sub_crs')
        #          These are handled separately via td_rejected_po_children
        if is_admin_viewing:
            # ✅ PERFORMANCE: Add eager loading + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor)
            ).filter(
                or_(
                    ChangeRequest.status == 'rejected',
                    ChangeRequest.vendor_selection_status == 'rejected'
                ),
                ChangeRequest.status != 'split_to_sub_crs',  # Exclude split CRs - POChildren are handled separately
                ChangeRequest.is_deleted == False
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items
        else:
            # ✅ PERFORMANCE: Add eager loading + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor)
            ).filter(
                or_(
                    ChangeRequest.status == 'rejected',
                    ChangeRequest.vendor_selection_status == 'rejected'
                ),
                ChangeRequest.status != 'split_to_sub_crs',  # Exclude split CRs - POChildren are handled separately
                ChangeRequest.assigned_to_buyer_user_id == buyer_id,
                ChangeRequest.is_deleted == False
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items

        rejected_purchases = []

        for cr in change_requests:
            # ✅ PERFORMANCE: Use preloaded relationships
            # Get project details (already loaded via joinedload)
            project = cr.project
            if not project:
                continue

            # Get BOQ details (already loaded via selectinload)
            boq = cr.boq
            if not boq:
                continue

            # Process materials
            sub_items_data = cr.sub_items_data or cr.materials_data or []
            cr_total = 0
            materials_list = []
            first_sub_item_name = ""

            if cr.sub_items_data:
                for sub_item in sub_items_data:
                    if isinstance(sub_item, dict):
                        if not first_sub_item_name and sub_item.get('sub_item_name'):
                            first_sub_item_name = sub_item.get('sub_item_name', '')

                        sub_materials = sub_item.get('materials', [])
                        if sub_materials:
                            for material in sub_materials:
                                material_total = float(material.get('total_price', 0) or 0)
                                cr_total += material_total
                                materials_list.append({
                                    "material_name": material.get('material_name', ''),
                                    "quantity": material.get('quantity', 0),
                                    "unit": material.get('unit', ''),
                                    "unit_price": material.get('unit_price', 0),
                                    "total_price": material_total,
                                    "brand": material.get('brand'),
                                    "specification": material.get('specification')
                                })
                        else:
                            sub_total = float(sub_item.get('total_price', 0) or 0)
                            cr_total += sub_total
                            materials_list.append({
                                "material_name": sub_item.get('material_name', ''),
                                "sub_item_name": sub_item.get('sub_item_name', ''),
                                "quantity": sub_item.get('quantity', 0),
                                "unit": sub_item.get('unit', ''),
                                "unit_price": sub_item.get('unit_price', 0),
                                "total_price": sub_total,
                                "brand": sub_item.get('brand'),
                                "specification": sub_item.get('specification')
                            })
            else:
                for material in sub_items_data:
                    if isinstance(material, dict):
                        material_total = float(material.get('total_price', 0) or 0)
                        cr_total += material_total
                        materials_list.append({
                            "material_name": material.get('material_name', ''),
                            "quantity": material.get('quantity', 0),
                            "unit": material.get('unit', ''),
                            "unit_price": material.get('unit_price', 0),
                            "total_price": material_total
                        })

            # Get full vendor details if available
            vendor_phone = None
            vendor_phone_code = None
            vendor_contact_person = None
            vendor_email = None
            vendor_category = None
            vendor_street_address = None
            vendor_city = None
            vendor_state = None
            vendor_country = None
            vendor_gst_number = None
            vendor_selected_by_name = None
            if cr.selected_vendor_id:
                # ✅ PERFORMANCE: Use preloaded vendor relationship
                vendor = cr.vendor
                if vendor and not vendor.is_deleted:
                    vendor_phone = vendor.phone
                    vendor_phone_code = vendor.phone_code
                    vendor_contact_person = vendor.contact_person_name
                    vendor_email = vendor.email
                    vendor_category = vendor.category
                    vendor_street_address = vendor.street_address
                    vendor_city = vendor.city
                    vendor_state = vendor.state
                    vendor_country = vendor.country
                    vendor_gst_number = vendor.gst_number
                # Get who selected the vendor
                if cr.vendor_selected_by_buyer_user_id:
                    from models.user import User
                    selector = User.query.filter_by(user_id=cr.vendor_selected_by_buyer_user_id).first()
                    if selector:
                        vendor_selected_by_name = selector.full_name

            # Determine rejection type and reason
            rejection_type = "change_request"  # default
            rejection_reason = cr.rejection_reason or "No reason provided"

            if cr.vendor_selection_status == 'rejected':
                rejection_type = "vendor_selection"
                rejection_reason = cr.vendor_rejection_reason or "Vendor selection rejected by TD"

            rejected_purchases.append({
                "cr_id": cr.cr_id,
                "formatted_cr_id": cr.get_formatted_cr_id(),
                "project_id": cr.project_id,
                "project_name": project.project_name,
                "project_code": project.project_code,
                "client": project.client or "Unknown Client",
                "location": project.location or "Unknown Location",
                "boq_id": cr.boq_id,
                "boq_name": boq.boq_name if boq else "Unknown",
                "item_name": cr.item_name or "N/A",
                "sub_item_name": first_sub_item_name,
                "request_type": cr.request_type or "EXTRA_MATERIALS",
                "reason": cr.justification or "",
                "materials": materials_list,
                "materials_count": len(materials_list),
                "total_cost": round(cr_total, 2),
                "requested_by_user_id": cr.requested_by_user_id if cr.requested_by_user_id else None,
                "requested_by_name": cr.requested_by_name if cr.requested_by_name else None,
                "requested_by_role": cr.requested_by_role if cr.requested_by_role else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "status": cr.status,
                "rejection_type": rejection_type,
                "rejection_reason": rejection_reason,
                "rejected_by_name": cr.rejected_by_name,
                "rejected_at_stage": cr.rejected_at_stage,
                "vendor_id": cr.selected_vendor_id,
                "vendor_name": cr.selected_vendor_name,
                "vendor_phone": vendor_phone,
                "vendor_phone_code": vendor_phone_code,
                "vendor_contact_person": vendor_contact_person,
                "vendor_email": vendor_email,
                "vendor_category": vendor_category,
                "vendor_street_address": vendor_street_address,
                "vendor_city": vendor_city,
                "vendor_state": vendor_state,
                "vendor_country": vendor_country,
                "vendor_gst_number": vendor_gst_number,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_selected_by_name": vendor_selected_by_name
            })

        # Also get TD rejected POChild items
        td_rejected_po_children = []
        try:
            if is_admin_viewing:
                po_children = POChild.query.options(
                    joinedload(POChild.parent_cr)
                ).filter(
                    or_(
                        POChild.status == 'td_rejected',
                        POChild.vendor_selection_status == 'td_rejected'
                    ),
                    POChild.is_deleted == False
                ).order_by(
                    POChild.updated_at.desc().nulls_last(),
                    POChild.created_at.desc()
                ).all()
            else:
                # Query by vendor_selected_by_buyer_id OR by parent CR's assigned buyer
                po_children = POChild.query.options(
                    joinedload(POChild.parent_cr)
                ).outerjoin(
                    ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
                ).filter(
                    or_(
                        POChild.status == 'td_rejected',
                        POChild.vendor_selection_status == 'td_rejected'
                    ),
                    POChild.is_deleted == False,
                    or_(
                        POChild.vendor_selected_by_buyer_id == buyer_id,
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id
                    )
                ).order_by(
                    POChild.updated_at.desc().nulls_last(),
                    POChild.created_at.desc()
                ).all()

            for poc in po_children:
                # Get parent CR for project/boq info (use preloaded relationship)
                parent_cr = poc.parent_cr
                project = Project.query.get(poc.project_id) if poc.project_id else None
                boq = BOQ.query.filter_by(boq_id=poc.boq_id).first() if poc.boq_id else None

                td_rejected_po_children.append({
                    "po_child_id": poc.id,
                    "formatted_id": poc.get_formatted_id(),
                    "parent_cr_id": poc.parent_cr_id,
                    "project_id": poc.project_id,
                    "project_name": project.project_name if project else "Unknown",
                    "client": project.client if project else "Unknown",
                    "location": project.location if project else "Unknown",
                    "boq_id": poc.boq_id,
                    "boq_name": boq.boq_name if boq else "Unknown",
                    "item_name": poc.item_name or "N/A",
                    "materials": poc.materials_data or [],
                    "materials_count": len(poc.materials_data or []),
                    "total_cost": poc.materials_total_cost or 0,
                    "created_at": poc.created_at.isoformat() if poc.created_at else None,
                    "status": poc.status,
                    "rejection_type": "td_vendor_rejection",
                    "rejection_reason": poc.rejection_reason or "Vendor selection rejected by TD",
                    "rejected_by_name": poc.vendor_approved_by_td_name,
                    "vendor_selection_status": poc.vendor_selection_status,
                    "can_reselect_vendor": True  # Flag to indicate buyer can select new vendor
                })
        except Exception as poc_error:
            log.error(f"Error fetching TD rejected POChild items: {poc_error}")

        return jsonify({
            "success": True,
            "rejected_purchases_count": len(rejected_purchases),
            "rejected_purchases": rejected_purchases,
            "td_rejected_po_children": td_rejected_po_children,
            "td_rejected_count": len(td_rejected_po_children),
            # ✅ PERFORMANCE: Add pagination metadata
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated_result.total,
                "pages": paginated_result.pages,
                "has_next": paginated_result.has_next,
                "has_prev": paginated_result.has_prev
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching rejected purchases: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch rejected purchases: {str(e)}"}), 500


def complete_purchase():
    """Mark a purchase as complete"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        cr_id = data.get('cr_id')
        notes = data.get('notes', '')

        if not cr_id:
            return jsonify({"error": "Change request ID is required"}), 400

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

        # Verify it's assigned to this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        if cr.status != 'assigned_to_buyer':
            return jsonify({"error": f"Purchase cannot be completed. Current status: {cr.status}"}), 400

        # ========================================
        # NEW FEATURE: Route materials through Production Manager (M2 Store)
        # When buyer completes purchase, materials go to warehouse first,
        # then PM dispatches to site (like Internal Material Request flow)
        # ========================================

        # Update the change request - Route through Production Manager
        cr.delivery_routing = 'via_production_manager'  # NEW FIELD
        cr.store_request_status = 'pending_vendor_delivery'  # NEW FIELD
        cr.status = 'routed_to_store'  # Changed from 'purchase_completed'
        cr.purchase_completed_by_user_id = buyer_id
        cr.purchase_completed_by_name = buyer_name
        cr.purchase_completion_date = datetime.utcnow()
        cr.purchase_notes = notes
        cr.buyer_completion_notes = notes  # NEW FIELD
        cr.updated_at = datetime.utcnow()

        # Get the actual database item_id (master_item_id) from item_name
        # cr.item_id contains BOQ-specific identifier like "item_587_2"
        # We need to find the master_item_id using the item_name from the change request
        database_item_id = None
        if cr.item_name:
            try:
                # Look up the master item by name in boq_items table
                from models.boq import MasterItem
                master_item = MasterItem.query.filter(
                    MasterItem.item_name == cr.item_name,
                    MasterItem.is_deleted == False
                ).first()

                if master_item:
                    database_item_id = master_item.item_id
                else:
                    log.warning(f"Could not find master_item for item_name '{cr.item_name}'")
            except Exception as e:
                log.warning(f"Error looking up master_item: {e}")

        # Fallback: if item_id is already numeric, use it directly
        if not database_item_id and cr.item_id:
            try:
                database_item_id = int(cr.item_id) if isinstance(cr.item_id, str) and cr.item_id.isdigit() else cr.item_id
            except:
                pass

        # Save newly purchased materials to MasterMaterial table
        new_materials_added = []
        sub_items_data = cr.sub_items_data or cr.materials_data or []

        for sub_item in sub_items_data:
            if isinstance(sub_item, dict):
                # Check if this sub-item has materials
                materials_list = sub_item.get('materials', [])

                # If no materials array, treat the sub_item itself as a material
                if not materials_list:
                    materials_list = [sub_item]

                for material in materials_list:
                    material_name = material.get('material_name', '').strip()

                    # Skip if no material name
                    if not material_name:
                        continue

                    # Check if material already exists in MasterMaterial
                    existing_material = MasterMaterial.query.filter_by(
                        material_name=material_name,
                        is_active=True
                    ).first()

                    # Only add if it's a NEW material
                    if not existing_material:
                        # Get sub_item_id and ensure it's an integer
                        # Priority: material data > sub_item data > change request column
                        raw_sub_item_id = material.get('sub_item_id') or sub_item.get('sub_item_id') or cr.sub_item_id
                        sub_item_id_int = None
                        if raw_sub_item_id:
                            try:
                                # If it's already an int, use it (sub_item_id is INTEGER in database)
                                if isinstance(raw_sub_item_id, int):
                                    sub_item_id_int = raw_sub_item_id
                                # If it's a string like "123", convert it
                                elif isinstance(raw_sub_item_id, str) and raw_sub_item_id.isdigit():
                                    sub_item_id_int = int(raw_sub_item_id)
                                else:
                                    log.warning(f"⚠️ sub_item_id has unexpected format: {raw_sub_item_id} (type: {type(raw_sub_item_id)})")
                            except Exception as e:
                                log.warning(f"❌ Could not parse sub_item_id '{raw_sub_item_id}': {e}")

                        # Fallback to change request sub_item_id if still None
                        if sub_item_id_int is None and cr.sub_item_id:
                            sub_item_id_int = cr.sub_item_id

                        # Log warning if sub_item_id is still None
                        if sub_item_id_int is None:
                            log.warning(f"⚠️ No valid sub_item_id found for material '{material_name}' in CR-{cr_id}")

                        new_material = MasterMaterial(
                            material_name=material_name,
                            item_id=database_item_id,  # Use the actual database item_id, not BOQ identifier
                            sub_item_id=sub_item_id_int,  # Ensure it's an integer or None
                            description=material.get('description', ''),
                            brand=material.get('brand', ''),
                            size=material.get('size', ''),
                            specification=material.get('specification', ''),
                            quantity=material.get('quantity', 0),
                            default_unit=material.get('unit', 'unit'),
                            current_market_price=material.get('unit_price', 0),
                            total_price=material.get('total_price', 0),
                            is_active=True,
                            created_at=datetime.utcnow(),
                            created_by=buyer_name,
                            last_modified_at=datetime.utcnow(),
                            last_modified_by=buyer_name
                        )
                        db.session.add(new_material)
                        new_materials_added.append(material_name)

        # ========================================
        # NEW FEATURE: Auto-create Internal Material Requests
        # These requests go to Production Manager so they know
        # which materials to dispatch to which site
        # IMPORTANT: Skip if this CR has POChildren - they handle their own requests
        # ========================================
        created_imr_count = 0

        # Check if this CR has POChildren - if so, skip individual request creation
        # POChildren have their own completion flow via complete_po_child_purchase() which creates GROUPED requests
        po_children_exist = POChild.query.filter_by(parent_cr_id=cr.cr_id, is_deleted=False).first() is not None
        if po_children_exist:
            log.info(f"CR-{cr_id} has POChildren - skipping individual request creation (handled by POChild completion)")
        else:
            try:
                # Get project details for final destination
                project = Project.query.get(cr.project_id)
                final_destination = project.project_name if project else f"Project {cr.project_id}"

                # Create Internal Material Request for each material in the CR
                for sub_item in sub_items_data:
                    if isinstance(sub_item, dict):
                        imr = InternalMaterialRequest(
                            cr_id=cr.cr_id,
                            project_id=cr.project_id,
                            request_buyer_id=buyer_id,
                            material_name=sub_item.get('sub_item_name') or sub_item.get('material_name', 'Unknown'),
                            quantity=sub_item.get('quantity', 0),
                            brand=sub_item.get('brand', ''),
                            size=sub_item.get('size', ''),
                            unit=sub_item.get('unit', 'pcs'),
                            unit_price=sub_item.get('unit_price', 0),
                            total_cost=sub_item.get('total_price', 0),

                            # NEW FIELDS for vendor delivery tracking
                            source_type='from_vendor_delivery',
                            status='awaiting_vendor_delivery',
                            vendor_delivery_confirmed=False,
                            final_destination_site=final_destination,
                            routed_by_buyer_id=buyer_id,
                            routed_to_store_at=datetime.utcnow(),
                            request_send=True,  # Mark as sent to PM

                            created_at=datetime.utcnow()
                        )
                        db.session.add(imr)
                        created_imr_count += 1

                log.info(f"✅ Created {created_imr_count} Internal Material Requests for CR-{cr_id}")

            except Exception as imr_error:
                log.error(f"❌ Error creating Internal Material Requests: {imr_error}")
                # Don't fail the whole request, but log the error

        db.session.commit()

        # ========================================
        # NEW FEATURE: Notify Production Manager about incoming vendor delivery
        # ========================================
        try:
            # Notify Production Manager(s)
            pm_role = Role.query.filter_by(role='production_manager').first()
            if pm_role:
                pms = User.query.filter_by(
                    role_id=pm_role.role_id,
                    is_deleted=False,
                    is_active=True
                ).all()

                project_name = cr.project.project_name if cr.project else 'Unknown Project'
                vendor_name = cr.selected_vendor_name or 'Selected Vendor'

                for pm in pms:
                    notification_service.create_notification(
                        user_id=pm.user_id,
                        title=f"📦 Incoming Vendor Delivery - {project_name}",
                        message=f"{buyer_name} has routed {created_imr_count} material(s) from vendor '{vendor_name}' to M2 Store for project '{project_name}'. Materials will be delivered to warehouse for inspection and dispatch to site.",
                        type='vendor_delivery_incoming',
                        reference_type='change_request',
                        reference_id=cr_id,
                        action_url=f'/store/incoming-deliveries'
                    )
                    log.info(f"✅ Notified PM {pm.full_name} about incoming vendor delivery for CR-{cr_id}")

        except Exception as pm_notif_error:
            log.error(f"❌ Failed to send PM notification: {pm_notif_error}")

        # Send notification to CR creator about purchase routing
        try:
            if cr.requested_by_user_id:
                project_name = cr.project.project_name if cr.project else 'Unknown Project'
                notification_service.create_notification(
                    user_id=cr.requested_by_user_id,
                    title=f"Purchase Routed to M2 Store - {project_name}",
                    message=f"{buyer_name} has completed the purchase and routed materials to M2 Store. Production Manager will receive materials from vendor and dispatch to your site.",
                    type='cr_routed_to_store',
                    reference_type='change_request',
                    reference_id=cr_id
                )
        except Exception as notif_error:
            log.error(f"Failed to send CR routing notification: {notif_error}")

        success_message = f"Purchase routed to M2 Store successfully! {created_imr_count} material request(s) sent to Production Manager"
        if new_materials_added:
            success_message += f". {len(new_materials_added)} new material(s) added to system"

        return jsonify({
            "success": True,
            "message": success_message,
            "purchase": {
                "cr_id": cr.cr_id,
                "status": cr.status,
                "purchase_completed_by_user_id": cr.purchase_completed_by_user_id,
                "purchase_completed_by_name": cr.purchase_completed_by_name,
                "purchase_completion_date": cr.purchase_completion_date.isoformat(),
                "purchase_notes": cr.purchase_notes,
                "new_materials_added": new_materials_added
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to complete purchase: {str(e)}"}), 500


def get_purchase_by_id(cr_id):
    """Get purchase details by change request ID"""
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

        # Get project details
        project = Project.query.get(cr.project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ details
        boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Process materials with negotiated prices
        materials_list, cr_total = process_materials_with_negotiated_prices(cr)

        purchase_status = 'completed' if cr.status == 'purchase_completed' else 'pending'

        # Check if vendor selection is pending TD approval
        vendor_selection_pending_td_approval = (
            cr.vendor_selection_status == 'pending_td_approval'
        )

        # Get store requests for this CR to know which materials are sent to store
        # Exclude rejected requests - those materials should be available for vendor selection again
        store_requests = InternalMaterialRequest.query.filter_by(cr_id=cr_id).all()
        store_requested_material_names = [
            r.material_name for r in store_requests
            if r.material_name and r.status and r.status.lower() not in ['rejected']
        ]

        # Validate and refresh material_vendor_selections with current vendor data
        # This ensures deleted vendors are removed and vendor names are up-to-date
        validated_material_vendor_selections = {}
        if cr.material_vendor_selections:
            from models.vendor import Vendor
            # Get all unique vendor IDs from selections
            vendor_ids = set()
            for selection in cr.material_vendor_selections.values():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_ids.add(selection.get('vendor_id'))

            # Fetch all referenced vendors in one query
            active_vendors = {
                v.vendor_id: v for v in Vendor.query.filter(
                    Vendor.vendor_id.in_(vendor_ids),
                    Vendor.is_deleted == False
                ).all()
            } if vendor_ids else {}

            # Validate each selection
            for material_name, selection in cr.material_vendor_selections.items():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_id = selection.get('vendor_id')
                    if vendor_id in active_vendors:
                        # Vendor exists - refresh vendor_name with current value
                        validated_selection = dict(selection)
                        validated_selection['vendor_name'] = active_vendors[vendor_id].company_name
                        validated_material_vendor_selections[material_name] = validated_selection
                    # If vendor doesn't exist (deleted), skip this selection
                else:
                    # Selection without vendor_id (just negotiated price) - keep it
                    validated_material_vendor_selections[material_name] = selection

        purchase = {
            "cr_id": cr.cr_id,
            "project_id": project.project_id,
            "project_name": project.project_name,
            "client": project.client or "Unknown Client",
            "location": project.location or "Unknown Location",
            "boq_id": cr.boq_id,
            "boq_name": boq.boq_name,
            "item_name": cr.item_name or "N/A",
            "sub_item_name": "Extra Materials",
            "request_type": cr.request_type or "EXTRA_MATERIALS",
            "reason": cr.justification or "",
            "materials": materials_list,
            "materials_count": len(materials_list),
            "total_cost": round(cr_total, 2),
            "approved_by": cr.approved_by_user_id,
            "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
            "created_at": cr.created_at.isoformat() if cr.created_at else None,
            "status": purchase_status,
            "purchase_completed_by_user_id": cr.purchase_completed_by_user_id,
            "purchase_completed_by_name": cr.purchase_completed_by_name,
            "purchase_completion_date": cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
            "purchase_notes": cr.purchase_notes,
            "vendor_id": cr.selected_vendor_id,
            "vendor_name": cr.selected_vendor_name,
            "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
            "vendor_email_sent": cr.vendor_email_sent or False,
            "vendor_whatsapp_sent": cr.vendor_whatsapp_sent or False,
            "vendor_whatsapp_sent_at": cr.vendor_whatsapp_sent_at.isoformat() if cr.vendor_whatsapp_sent_at else None,
            # Include validated material vendor selections (with current vendor names, deleted vendors removed)
            "material_vendor_selections": validated_material_vendor_selections,
            # Include store requested materials for filtering in vendor selection
            "store_requested_materials": store_requested_material_names,
            "has_store_requests": len(store_requested_material_names) > 0,
            "store_request_count": len(store_requested_material_names)
        }

        # Get VAT data from LPO customization if available
        try:
            from models.lpo_customization import LPOCustomization
            # Check for PO child specific customization first, then CR-level
            lpo_customization = LPOCustomization.query.filter_by(cr_id=cr_id, po_child_id=None).first()
            if lpo_customization and lpo_customization.vat_percent is not None:
                vat_percent = float(lpo_customization.vat_percent)
                purchase["vat_percent"] = vat_percent
                # Always recalculate VAT based on current subtotal (stored vat_amount may be stale)
                purchase["vat_amount"] = cr_total * vat_percent / 100
            else:
                # Default 5% VAT for UAE
                purchase["vat_percent"] = 5.0
                purchase["vat_amount"] = cr_total * 0.05
        except Exception as vat_error:
            log.warning(f"Could not fetch VAT data: {vat_error}")
            purchase["vat_percent"] = 5.0
            purchase["vat_amount"] = cr_total * 0.05

        # If vendor is selected, add vendor contact details (with overrides)
        if cr.selected_vendor_id:
            from models.vendor import Vendor
            vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
            if vendor:
                # Use vendor table values
                purchase["vendor_contact_person"] = vendor.contact_person_name
                purchase["vendor_phone"] = vendor.phone
                purchase["vendor_email"] = vendor.email
            else:
                # Fallback if vendor not found
                purchase["vendor_contact_person"] = None
                purchase["vendor_phone"] = None
                purchase["vendor_email"] = None
        

        return jsonify({
            "success": True,
            "purchase": purchase
        }), 200

    except Exception as e:
        log.error(f"Error fetching purchase {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch purchase: {str(e)}"}), 500


def select_vendor_for_purchase(cr_id):
    """Select vendor for purchase (requires TD approval)"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        # Get effective context for admin viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']
        effective_role = context['effective_role']

        data = request.get_json()
        vendor_id = data.get('vendor_id')

        if not vendor_id:
            return jsonify({"error": "Vendor ID is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Allow admin viewing as buyer to select vendor
        is_admin_as_buyer = is_admin_viewing and effective_role == 'buyer'

        # Verify it's assigned to this buyer (skip check for TD, admin, or admin viewing as buyer)
        if not is_td and not is_admin and not is_admin_as_buyer and cr.assigned_to_buyer_user_id != user_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        # TD can change vendor even when status is pending_td_approval
        # Also allow 'split_to_sub_crs' for re-selecting vendor on rejected PO Children
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'split_to_sub_crs']
        if is_td:
            allowed_statuses.append('pending_td_approval')

        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot select vendor. Current status: {cr.status}"}), 400

        # Verify vendor exists
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Verify vendor is active
        if vendor.status != 'active':
            return jsonify({"error": "Selected vendor is not active"}), 400

        # Update the change request with vendor selection
        cr.selected_vendor_id = vendor_id
        cr.selected_vendor_name = vendor.company_name
        cr.updated_at = datetime.utcnow()

        # Set status and fields based on user role
        # TD changing vendor does NOT auto-approve - TD must manually click "Approve Vendor"
        if is_td:
            # TD is selecting/editing vendor - set to pending (TD must manually approve)
            cr.vendor_selection_status = 'pending_td_approval'
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
            # Clear previous approval info since vendor changed
            cr.vendor_approved_by_td_id = None
            cr.vendor_approved_by_td_name = None
            cr.vendor_approval_date = None
            # Track who made the change
            cr.vendor_selected_by_buyer_id = user_id
            cr.vendor_selected_by_buyer_name = user_name
            cr.vendor_selection_date = datetime.utcnow()
        else:
            # Buyer is selecting vendor - needs TD approval
            cr.vendor_selected_by_buyer_id = user_id
            cr.vendor_selected_by_buyer_name = user_name
            cr.vendor_selection_date = datetime.utcnow()
            cr.vendor_selection_status = 'pending_td_approval'
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD

        # Add to BOQ History - Vendor Selection
        from models.boq import BOQHistory
        from sqlalchemy.orm.attributes import flag_modified

        existing_history = BOQHistory.query.filter_by(boq_id=cr.boq_id).order_by(BOQHistory.action_date.desc()).first()

        if existing_history:
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Create history action based on user role
        # Both TD and Buyer vendor selection goes to pending_td_approval status
        if is_td:
            new_action = {
                "role": "technical_director",
                "type": "change_request_vendor_changed",
                "sender": user_name,
                "receiver": "Technical Director",
                "sender_role": "technical_director",
                "receiver_role": "technical_director",
                "status": cr.status,
                "cr_id": cr_id,
                "item_name": cr.item_name or f"CR #{cr_id}",
                "materials_count": len(cr.materials_data) if cr.materials_data else 0,
                "total_cost": cr.materials_total_cost,
                "vendor_id": vendor_id,
                "vendor_name": vendor.company_name,
                "vendor_selection_status": "pending_td_approval",
                "comments": f"TD changed vendor to '{vendor.company_name}'. Manual approval required.",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": user_name,
                "sender_user_id": user_id,
                "project_name": cr.project.project_name if cr.project else None,
                "project_id": cr.project_id
            }
        else:
            new_action = {
                "role": "buyer",
                "type": "change_request_vendor_selected",
                "sender": user_name,
                "receiver": "Technical Director",
                "sender_role": "buyer",
                "receiver_role": "technical_director",
                "status": cr.status,
                "cr_id": cr_id,
                "item_name": cr.item_name or f"CR #{cr_id}",
                "materials_count": len(cr.materials_data) if cr.materials_data else 0,
                "total_cost": cr.materials_total_cost,
                "vendor_id": vendor_id,
                "vendor_name": vendor.company_name,
                "vendor_selection_status": "pending_td_approval",
                "comments": f"Buyer selected vendor '{vendor.company_name}' for purchase. Awaiting TD approval.",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": user_name,
                "sender_user_id": user_id,
                "project_name": cr.project.project_name if cr.project else None,
                "project_id": cr.project_id
            }

        current_actions.append(new_action)

        # Update history entry based on user role
        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = user_name
            existing_history.sender = user_name

            if is_td:
                existing_history.receiver = "Technical Director"
                existing_history.comments = f"CR #{cr_id} vendor changed by TD, pending manual approval"
                existing_history.sender_role = 'technical_director'
                existing_history.receiver_role = 'technical_director'
            else:
                existing_history.receiver = "Technical Director"
                existing_history.comments = f"CR #{cr_id} vendor selected, pending TD approval"
                existing_history.sender_role = 'buyer'
                existing_history.receiver_role = 'technical_director'

            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            if is_td:
                boq_history = BOQHistory(
                    boq_id=cr.boq_id,
                    action=current_actions,
                    action_by=user_name,
                    boq_status=cr.boq.status if cr.boq else 'unknown',
                    sender=user_name,
                    receiver="Technical Director",
                    comments=f"CR #{cr_id} vendor changed by TD, pending manual approval",
                    sender_role='technical_director',
                    receiver_role='technical_director',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
            else:
                boq_history = BOQHistory(
                    boq_id=cr.boq_id,
                    action=current_actions,
                    action_by=user_name,
                    boq_status=cr.boq.status if cr.boq else 'unknown',
                    sender=user_name,
                    receiver="Technical Director",
                    comments=f"CR #{cr_id} vendor selected",
                    sender_role='buyer',
                    receiver_role='technical_director',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
            db.session.add(boq_history)

        db.session.commit()

        # Send notification when buyer selects vendor (needs TD approval)
        try:
            if not is_td:  # Only notify TD when buyer selects vendor
                # DEBUG: Log all roles to see what's in the database
                all_roles = Role.query.filter_by(is_deleted=False).all()
                log.info(f"[TD Notification DEBUG] All roles in database: {[(r.role_id, r.role) for r in all_roles]}")

                # Get TD users - try multiple role name variations
                td_role = None
                role_variations = [
                    'Technical Director', 'technicalDirector', 'technical_director',
                    'TechnicalDirector', 'TD', 'td'
                ]

                for role_name in role_variations:
                    td_role = Role.query.filter_by(role=role_name, is_deleted=False).first()
                    if td_role:
                        log.info(f"[TD Notification] Found TD role with name: '{role_name}', role_id={td_role.role_id}")
                        break

                if not td_role:
                    # Try case-insensitive search
                    td_role = Role.query.filter(
                        Role.role.ilike('%technical%director%'),
                        Role.is_deleted == False
                    ).first()
                    if td_role:
                        log.info(f"[TD Notification] Found TD role via ilike: {td_role.role}")

                if td_role:
                    tds = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    log.info(f"[TD Notification] Found {len(tds)} TD users for role_id={td_role.role_id}")

                    if tds:
                        project_name = cr.project.project_name if cr.project else 'Unknown Project'
                        # Send notification to all TDs
                        for td_user in tds:
                            log.info(f"[TD Notification] Sending notification to TD user_id={td_user.user_id}, name={td_user.full_name}")
                            notification_service.notify_vendor_selected_for_cr(
                                cr_id=cr_id,
                                project_name=project_name,
                                buyer_id=user_id,
                                buyer_name=user_name,
                                td_user_id=td_user.user_id,
                                vendor_name=vendor.company_name
                            )
                    else:
                        log.warning(f"[TD Notification] No active TD users found for role_id={td_role.role_id}")
                else:
                    log.warning(f"[TD Notification] Could not find TD role in database")
        except Exception as notif_error:
            log.error(f"Failed to send vendor selection notification: {notif_error}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")

        # Log and return response based on user role
        if is_td:
            return jsonify({
                "success": True,
                "message": "Vendor selection saved and approved",
                "purchase": {
                    "cr_id": cr.cr_id,
                    "selected_vendor_id": cr.selected_vendor_id,
                    "selected_vendor_name": cr.selected_vendor_name,
                    "vendor_selection_status": cr.vendor_selection_status,
                    "vendor_selection_date": cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None
                }
            }), 200
        else:
            return jsonify({
                "success": True,
                "message": "Vendor selection sent to TD for approval",
                "purchase": {
                    "cr_id": cr.cr_id,
                    "selected_vendor_id": cr.selected_vendor_id,
                    "selected_vendor_name": cr.selected_vendor_name,
                    "vendor_selection_status": cr.vendor_selection_status,
                    "vendor_selection_date": cr.vendor_selection_date.isoformat()
                }
            }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting vendor for purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to select vendor: {str(e)}"}), 500


def update_po_child_prices(po_child_id):
    """
    Update negotiated prices for POChild materials
    Allows buyer to edit prices based on vendor negotiation
    Returns original and negotiated prices for diff display
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')

        data = request.get_json()
        materials_updates = data.get('materials')  # Array of {material_name, negotiated_price}

        if not materials_updates or not isinstance(materials_updates, list):
            return jsonify({"error": "materials array is required"}), 400

        # Get the POChild with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(id=po_child_id, is_deleted=False).first()
        if not po_child:
            return jsonify({"error": "Purchase order not found"}), 404

        # Verify POChild is approved (vendor_approved status) - buyer can edit prices after TD approval
        if po_child.status not in ['vendor_approved', 'pending_td_approval']:
            return jsonify({"error": "Can only edit prices for approved purchase orders"}), 400

        # Get current materials_data
        materials_data = po_child.materials_data or []
        if not materials_data:
            return jsonify({"error": "No materials found in this purchase order"}), 400

        # Create a lookup map for updates
        updates_map = {update['material_name']: update for update in materials_updates}

        # Update materials with negotiated prices
        updated_materials = []
        new_total_cost = 0

        for material in materials_data:
            material_name = material.get('material_name', '')
            original_price = material.get('original_unit_price') or material.get('unit_price', 0)
            quantity = material.get('quantity', 0)

            # Store original price if not already stored
            if 'original_unit_price' not in material:
                material['original_unit_price'] = original_price

            # Check if there's an update for this material
            if material_name in updates_map:
                update = updates_map[material_name]
                negotiated_price = update.get('negotiated_price')

                if negotiated_price is not None and negotiated_price > 0:
                    material['negotiated_price'] = float(negotiated_price)
                    material['unit_price'] = float(negotiated_price)  # Update unit_price to negotiated
                    material['total_price'] = float(quantity) * float(negotiated_price)
                    material['price_updated_by'] = user_name
                    material['price_updated_at'] = datetime.utcnow().isoformat()
                else:
                    # Clear negotiated price if set to null/0
                    material.pop('negotiated_price', None)
                    material['unit_price'] = float(original_price)
                    material['total_price'] = float(quantity) * float(original_price)
            else:
                # No update for this material, recalculate with current price
                current_price = material.get('negotiated_price') or material.get('unit_price', 0)
                material['total_price'] = float(quantity) * float(current_price)

            new_total_cost += material.get('total_price', 0)
            updated_materials.append(material)

        # Update POChild with new materials_data and total
        from sqlalchemy.orm.attributes import flag_modified
        po_child.materials_data = updated_materials
        flag_modified(po_child, 'materials_data')
        po_child.materials_total_cost = new_total_cost
        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Prepare response with price diff information
        materials_response = []
        for material in updated_materials:
            original_price = material.get('original_unit_price', 0)
            negotiated_price = material.get('negotiated_price')
            current_price = negotiated_price if negotiated_price else original_price
            price_diff = float(current_price) - float(original_price) if negotiated_price else 0

            materials_response.append({
                'material_name': material.get('material_name', ''),
                'quantity': material.get('quantity', 0),
                'unit': material.get('unit', ''),
                'original_unit_price': original_price,
                'negotiated_price': negotiated_price,
                'unit_price': current_price,
                'total_price': material.get('total_price', 0),
                'price_diff': price_diff,
                'price_diff_percentage': round((price_diff / float(original_price)) * 100, 2) if original_price else 0,
                'price_updated_by': material.get('price_updated_by'),
                'price_updated_at': material.get('price_updated_at')
            })

        return jsonify({
            "success": True,
            "message": "Prices updated successfully",
            "po_child_id": po_child_id,
            "formatted_id": po_child.get_formatted_id(),
            "materials": materials_response,
            "original_total": sum(m.get('original_unit_price', 0) * m.get('quantity', 0) for m in updated_materials),
            "new_total": new_total_cost,
            "total_diff": new_total_cost - sum(m.get('original_unit_price', 0) * m.get('quantity', 0) for m in updated_materials)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating POChild prices: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update prices: {str(e)}"}), 500


def update_purchase_prices(cr_id):
    """
    Update negotiated prices for Purchase (Change Request) materials
    Allows buyer to edit prices based on vendor negotiation before sending for TD approval
    Returns original and negotiated prices for diff display
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')

        data = request.get_json()
        materials_updates = data.get('materials')  # Array of {material_name, negotiated_price}

        if not materials_updates or not isinstance(materials_updates, list):
            return jsonify({"error": "materials array is required"}), 400

        # Get the Change Request
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify CR is in appropriate status for price editing
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'pending']
        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot edit prices for purchase with status: {cr.status}"}), 400

        # Get current materials data
        materials_data = cr.sub_items_data or cr.materials_data or []
        if not materials_data:
            return jsonify({"error": "No materials found in this purchase"}), 400

        # Create a lookup map for updates
        updates_map = {update['material_name']: update for update in materials_updates}

        # Update material_vendor_selections to store negotiated prices
        # This is where process_materials_with_negotiated_prices looks for them
        material_vendor_selections = cr.material_vendor_selections or {}
        for update in materials_updates:
            material_name = update['material_name']
            negotiated_price = update.get('negotiated_price')

            if material_name not in material_vendor_selections:
                material_vendor_selections[material_name] = {}

            if negotiated_price is not None and negotiated_price > 0:
                material_vendor_selections[material_name]['negotiated_price'] = float(negotiated_price)
                material_vendor_selections[material_name]['price_updated_by'] = user_name
                material_vendor_selections[material_name]['price_updated_at'] = datetime.utcnow().isoformat()
            else:
                # Clear negotiated price
                material_vendor_selections[material_name].pop('negotiated_price', None)
                material_vendor_selections[material_name].pop('price_updated_by', None)
                material_vendor_selections[material_name].pop('price_updated_at', None)

        # Update materials with negotiated prices
        updated_materials = []
        new_total_cost = 0

        for material in materials_data:
            # Handle nested materials structure
            if isinstance(material, dict) and 'materials' in material:
                sub_materials = material.get('materials', [])
                updated_sub_materials = []
                for sub_mat in sub_materials:
                    material_name = sub_mat.get('material_name', '')
                    original_price = sub_mat.get('original_unit_price') or sub_mat.get('unit_price', 0)
                    quantity = sub_mat.get('quantity', 0)

                    # Store original price if not already stored
                    if 'original_unit_price' not in sub_mat:
                        sub_mat['original_unit_price'] = original_price

                    # Check if there's an update for this material
                    if material_name in updates_map:
                        update = updates_map[material_name]
                        negotiated_price = update.get('negotiated_price')

                        if negotiated_price is not None and negotiated_price > 0:
                            sub_mat['negotiated_price'] = float(negotiated_price)
                            sub_mat['unit_price'] = float(negotiated_price)
                            sub_mat['total_price'] = float(quantity) * float(negotiated_price)
                            sub_mat['price_updated_by'] = user_name
                            sub_mat['price_updated_at'] = datetime.utcnow().isoformat()
                        else:
                            # Clear negotiated price if set to null/0
                            sub_mat.pop('negotiated_price', None)
                            sub_mat['unit_price'] = float(original_price)
                            sub_mat['total_price'] = float(quantity) * float(original_price)
                    else:
                        current_price = sub_mat.get('negotiated_price') or sub_mat.get('unit_price', 0)
                        sub_mat['total_price'] = float(quantity) * float(current_price)

                    new_total_cost += sub_mat.get('total_price', 0)
                    updated_sub_materials.append(sub_mat)

                material['materials'] = updated_sub_materials
                updated_materials.append(material)
            else:
                # Direct material (not nested)
                material_name = material.get('material_name', '')
                original_price = material.get('original_unit_price') or material.get('unit_price', 0)
                quantity = material.get('quantity', 0)

                # Store original price if not already stored
                if 'original_unit_price' not in material:
                    material['original_unit_price'] = original_price

                # Check if there's an update for this material
                if material_name in updates_map:
                    update = updates_map[material_name]
                    negotiated_price = update.get('negotiated_price')

                    if negotiated_price is not None and negotiated_price > 0:
                        material['negotiated_price'] = float(negotiated_price)
                        material['unit_price'] = float(negotiated_price)
                        material['total_price'] = float(quantity) * float(negotiated_price)
                        material['price_updated_by'] = user_name
                        material['price_updated_at'] = datetime.utcnow().isoformat()
                    else:
                        # Clear negotiated price if set to null/0
                        material.pop('negotiated_price', None)
                        material['unit_price'] = float(original_price)
                        material['total_price'] = float(quantity) * float(original_price)
                else:
                    current_price = material.get('negotiated_price') or material.get('unit_price', 0)
                    material['total_price'] = float(quantity) * float(current_price)

                new_total_cost += material.get('total_price', 0)
                updated_materials.append(material)

        # Update CR with new materials data and material_vendor_selections
        from sqlalchemy.orm.attributes import flag_modified
        if cr.sub_items_data:
            cr.sub_items_data = updated_materials
            flag_modified(cr, 'sub_items_data')
        else:
            cr.materials_data = updated_materials
            flag_modified(cr, 'materials_data')

        # Save material_vendor_selections (where negotiated prices are stored for the API)
        cr.material_vendor_selections = material_vendor_selections
        flag_modified(cr, 'material_vendor_selections')

        cr.updated_at = datetime.utcnow()
        db.session.commit()

        # Prepare response with price diff information
        materials_response = []

        def extract_materials_for_response(mats, vendor_selections):
            result = []
            for mat in mats:
                if isinstance(mat, dict) and 'materials' in mat:
                    result.extend(extract_materials_for_response(mat['materials'], vendor_selections))
                else:
                    material_name = mat.get('material_name', '')
                    original_price = mat.get('original_unit_price') or mat.get('unit_price', 0)

                    # Get negotiated price from material_vendor_selections
                    vendor_sel = vendor_selections.get(material_name, {})
                    negotiated_price = vendor_sel.get('negotiated_price')
                    price_updated_by = vendor_sel.get('price_updated_by')
                    price_updated_at = vendor_sel.get('price_updated_at')

                    current_price = negotiated_price if negotiated_price else original_price
                    price_diff = float(current_price) - float(original_price) if negotiated_price else 0

                    result.append({
                        'material_name': material_name,
                        'quantity': mat.get('quantity', 0),
                        'unit': mat.get('unit', ''),
                        'original_unit_price': original_price,
                        'negotiated_price': negotiated_price,
                        'unit_price': current_price,
                        'total_price': float(mat.get('quantity', 0)) * float(current_price),
                        'price_diff': price_diff,
                        'price_diff_percentage': round((price_diff / float(original_price)) * 100, 2) if original_price else 0,
                        'price_updated_by': price_updated_by,
                        'price_updated_at': price_updated_at
                    })
            return result

        materials_response = extract_materials_for_response(updated_materials, material_vendor_selections)

        original_total = sum(m.get('original_unit_price', 0) * m.get('quantity', 0) for m in materials_response)
        negotiated_total = sum(m.get('total_price', 0) for m in materials_response)

        return jsonify({
            "success": True,
            "message": "Prices updated successfully",
            "cr_id": cr_id,
            "materials": materials_response,
            "original_total": original_total,
            "new_total": negotiated_total,
            "total_diff": negotiated_total - original_total
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating Purchase prices: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update prices: {str(e)}"}), 500


def select_vendor_for_material(cr_id):
    """Select vendor for specific material(s) in purchase order"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        material_selections = data.get('material_selections')  # Array of {material_name, vendor_id}

        if not material_selections or not isinstance(material_selections, list):
            return jsonify({"error": "material_selections array is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Get effective user context for admin viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for TD, Admin, or Admin viewing as Buyer)
        # Convert both to int for safe comparison (user_id from JWT may be string)
        assigned_buyer_id = int(cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            log.warning(f"select_vendor_for_material - Permission denied: assigned_buyer_id={assigned_buyer_id} != current_user_id={current_user_id}")
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        # Both buyer and TD can change vendor when status is pending_td_approval
        # Buyer may want to update their selection before TD approves
        # Also allow 'split_to_sub_crs' for re-selecting vendor on rejected PO Children
        # Allow 'rejected' for when vendor selection was rejected and buyer needs to resubmit
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'pending_td_approval', 'split_to_sub_crs', 'rejected']

        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot select vendor. Current status: {cr.status}"}), 400

        # Special handling for sub-CRs: TD changing vendor for specific material(s)
        # When TD changes vendor for ONE material, only that material should be separated
        # Other materials should stay in the original sub-CR with their existing vendor
        if is_td and cr.is_sub_cr and material_selections:
            from models.vendor import Vendor

            # Get the original sub-CR's vendor (convert to int for safe comparison)
            original_vendor_id = int(cr.selected_vendor_id) if cr.selected_vendor_id else None

            # Separate materials into: changed (different vendor) vs unchanged (same vendor)
            changed_materials = []  # Materials that TD is assigning to a DIFFERENT vendor
            unchanged_materials = []  # Materials staying with the original vendor

            for sel in material_selections:
                sel_vendor_id = sel.get('vendor_id')
                # Convert to int for safe comparison (JSON may send as string)
                sel_vendor_id_int = int(sel_vendor_id) if sel_vendor_id else None

                if sel_vendor_id_int and sel_vendor_id_int != original_vendor_id:
                    changed_materials.append(sel)
                else:
                    unchanged_materials.append(sel)

            # If no materials are being changed to a different vendor, just update the sub-CR
            if not changed_materials:
                # Single vendor selected - just update the sub-CR's vendor (no splitting)
                first_selection = material_selections[0]
                new_vendor_id = first_selection.get('vendor_id')

                if new_vendor_id:
                    new_vendor = Vendor.query.filter_by(vendor_id=new_vendor_id, is_deleted=False).first()
                    if not new_vendor:
                        return jsonify({"error": f"Vendor {new_vendor_id} not found"}), 404
                    if new_vendor.status != 'active':
                        return jsonify({"error": f"Vendor '{new_vendor.company_name}' is not active"}), 400

                    old_vendor_name = cr.selected_vendor_name

                    # Update sub-CR's main vendor fields (vendor changed, but NOT auto-approved)
                    cr.selected_vendor_id = new_vendor_id
                    cr.selected_vendor_name = new_vendor.company_name
                    # Keep status as pending_td_approval - TD needs to explicitly approve
                    cr.vendor_selection_status = 'pending_td_approval'
                    cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
                    cr.updated_at = datetime.utcnow()

                    db.session.commit()

                    return jsonify({
                        "success": True,
                        "message": f"Vendor changed from '{old_vendor_name}' to '{new_vendor.company_name}'",
                        "purchase": {
                            "cr_id": cr.cr_id,
                            "formatted_cr_id": cr.get_formatted_cr_id(),
                            "status": cr.status,
                            "selected_vendor_id": cr.selected_vendor_id,
                            "selected_vendor_name": cr.selected_vendor_name,
                            "vendor_selection_status": cr.vendor_selection_status
                        }
                    })
                # Fall through to normal processing if no vendor_id

            # 🗑️ DEPRECATED: Old sub-CR system - Now use POChild table instead
            # This code path is no longer supported after schema cleanup (2025-12-19)
            # If you need to split materials by vendor, use create_po_children_for_vendor_groups()
            return jsonify({
                "error": "Material-level vendor changes are not supported for this purchase type. Please use the POChild vendor management system."
            }), 400

            # Old deprecated code below (kept for reference):
            # parent_cr = ChangeRequest.query.filter_by(
            #     cr_id=cr.parent_cr_id,  # ❌ Column removed
            #     is_deleted=False
            # ).first()
            #
            # if not parent_cr:
            #     return jsonify({"error": "Parent CR not found for sub-CR splitting"}), 404

            # 🗑️ DEPRECATED CODE REMOVED (2025-12-19) - Lines 3216-3369
            # This code tried to create sub-CRs using deprecated columns:
            # - parent_cr_id, cr_number_suffix, submission_group_id
            # Use POChild table and create_po_children_for_vendor_groups() instead

        # Initialize material_vendor_selections if it doesn't exist
        if not cr.material_vendor_selections:
            cr.material_vendor_selections = {}

        # Enable per-material vendor mode
        cr.use_per_material_vendors = True

        # Process each material selection
        from models.vendor import Vendor
        updated_materials = []

        for selection in material_selections:
            material_name = selection.get('material_name')
            vendor_id = selection.get('vendor_id')
            negotiated_price = selection.get('negotiated_price')
            save_price_for_future = selection.get('save_price_for_future', False)
            supplier_notes_from_selection = selection.get('supplier_notes')  # Get notes from selection

            # Get vendor's material name from their catalog/product list
            vendor_material_name = None
            all_selected_vendors = selection.get('all_selected_vendors', [])
            if all_selected_vendors:
                for vendor_info in all_selected_vendors:
                    if vendor_info.get('vendor_id') == vendor_id:
                        vendor_material_name = vendor_info.get('vendor_material_name')
                        break

            if not material_name or not vendor_id:
                continue

            # Verify vendor exists and is active
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
            if not vendor:
                return jsonify({"error": f"Vendor {vendor_id} not found"}), 404

            if vendor.status != 'active':
                return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

            # Handle price updates for future purchases
            if save_price_for_future and negotiated_price is not None:
                try:
                    from models.vendor import VendorProduct

                    # Find matching product(s) for this vendor and material
                    # Try exact match first
                    material_lower = material_name.lower().strip()
                    products = VendorProduct.query.filter_by(
                        vendor_id=vendor_id,
                        is_deleted=False
                    ).all()

                    matching_products = []
                    for product in products:
                        product_name = (product.product_name or '').lower().strip()
                        # Exact match or contains match
                        if product_name == material_lower or material_lower in product_name or product_name in material_lower:
                            matching_products.append(product)

                    # Update unit_price for all matching products
                    if matching_products:
                        for product in matching_products:
                            product.unit_price = float(negotiated_price)

                        db.session.flush()  # Flush to ensure updates are persisted
                    else:
                        log.warning(f"No matching products found for material '{material_name}' from vendor {vendor_id}")

                except Exception as price_error:
                    log.error(f"Error updating vendor product price: {str(price_error)}")
                    # Continue with vendor selection even if price update fails

            # Set status based on user role
            if is_td:
                selection_status = 'approved'
                approved_by_td_id = user_id
                approved_by_td_name = user_name
                approval_date = datetime.utcnow().isoformat()
            else:
                selection_status = 'pending_td_approval'
                approved_by_td_id = None
                approved_by_td_name = None
                approval_date = None

            # Store vendor selection for this material (including negotiated price and vendor's material name)
            vendor_selection_data = {
                'vendor_id': vendor_id,
                'vendor_name': vendor.company_name,
                'vendor_material_name': vendor_material_name,
                'vendor_email': vendor.email,
                'vendor_phone': vendor.phone,
                'vendor_phone_code': vendor.phone_code,
                'vendor_contact_person': vendor.contact_person_name,
                'selected_by_user_id': user_id,
                'selected_by_name': user_name,
                'selection_date': datetime.utcnow().isoformat(),
                'selection_status': selection_status,
                'approved_by_td_id': approved_by_td_id,
                'approved_by_td_name': approved_by_td_name,
                'approval_date': approval_date,
                'rejection_reason': None
            }

            # CRITICAL: Include supplier_notes - use new notes from selection OR preserve existing ones
            if supplier_notes_from_selection is not None:
                # Use notes from current selection (buyer may have updated them)
                vendor_selection_data['supplier_notes'] = supplier_notes_from_selection.strip() if supplier_notes_from_selection else ''
            elif material_name in cr.material_vendor_selections and 'supplier_notes' in cr.material_vendor_selections[material_name]:
                # Preserve existing notes if not provided in current selection
                vendor_selection_data['supplier_notes'] = cr.material_vendor_selections[material_name]['supplier_notes']

            # Add negotiated price information if provided
            if negotiated_price is not None:
                vendor_selection_data['negotiated_price'] = float(negotiated_price)
                vendor_selection_data['save_price_for_future'] = bool(save_price_for_future)

            # CRITICAL: Store ALL evaluated vendors for TD comparison (vendor_comparison_data)
            # This allows TD to see which vendors were evaluated and their prices
            if all_selected_vendors and len(all_selected_vendors) > 0:
                # ✅ PERFORMANCE: Avoid N+1 query - fetch all vendors in one query
                vendor_ids = [v.get('vendor_id') for v in all_selected_vendors if v.get('vendor_id')]

                if vendor_ids:
                    # Single query to fetch all evaluated vendors at once
                    vendors_map = {
                        v.vendor_id: v
                        for v in Vendor.query.filter(
                            Vendor.vendor_id.in_(vendor_ids),
                            Vendor.is_deleted == False
                        ).all()
                    }

                    vendor_comparison_list = []
                    for evaluated_vendor_info in all_selected_vendors:
                        eval_vendor_id = evaluated_vendor_info.get('vendor_id')
                        if eval_vendor_id:
                            # O(1) lookup from pre-fetched map instead of N database queries
                            eval_vendor = vendors_map.get(eval_vendor_id)
                            if eval_vendor:
                                vendor_comparison_list.append({
                                    'vendor_id': eval_vendor_id,
                                    'vendor_name': evaluated_vendor_info.get('vendor_name', eval_vendor.company_name),
                                    'vendor_material_name': evaluated_vendor_info.get('vendor_material_name'),
                                    'negotiated_price': evaluated_vendor_info.get('negotiated_price'),
                                    'vendor_email': eval_vendor.email,
                                    'vendor_phone': eval_vendor.phone,
                                    'vendor_phone_code': eval_vendor.phone_code,
                                    'vendor_contact_person': eval_vendor.contact_person_name,
                                    'vendor_category': eval_vendor.category,
                                    'vendor_street_address': eval_vendor.street_address,
                                    'vendor_city': eval_vendor.city,
                                    'vendor_state': eval_vendor.state,
                                    'vendor_country': eval_vendor.country,
                                    'vendor_gst_number': eval_vendor.gst_number,
                                    'is_selected': eval_vendor_id == vendor_id
                                })
                    vendor_selection_data['vendor_comparison_data'] = vendor_comparison_list
                    log.info(f"Saved vendor comparison data for material '{material_name}': {len(vendor_comparison_list)} vendors evaluated")

            cr.material_vendor_selections[material_name] = vendor_selection_data

            updated_materials.append(material_name)

        # Mark the JSONB field as modified so SQLAlchemy detects the change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(cr, 'material_vendor_selections')

        # Check if ALL materials now have vendors selected
        all_materials_have_vendors = True
        if cr.materials_data and isinstance(cr.materials_data, list):
            for material in cr.materials_data:
                material_name = material.get('material_name')
                if material_name and material_name not in cr.material_vendor_selections:
                    all_materials_have_vendors = False
                    break

        # If all materials have vendors selected, change CR status to pending_td_approval
        # TD selecting vendors does NOT auto-approve - TD must manually click "Approve Vendor"
        if all_materials_have_vendors:
            cr.status = 'pending_td_approval'
            cr.vendor_selection_status = 'pending_td_approval'  # Also set vendor_selection_status for Pending Approval tab
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
            # Set selected_vendor fields from the first material's vendor (for single vendor case)
            first_material = list(cr.material_vendor_selections.values())[0] if cr.material_vendor_selections else None
            if first_material:
                cr.selected_vendor_id = first_material.get('vendor_id')
                cr.selected_vendor_name = first_material.get('vendor_name')
                cr.vendor_selected_by_buyer_id = user_id
                cr.vendor_selected_by_buyer_name = user_name
                cr.vendor_selection_date = datetime.utcnow()

        cr.updated_at = datetime.utcnow()
        db.session.commit()

        # Send notifications to TD if buyer made selections
        if not is_td:
            try:
                from models.role import Role
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user

                # Try multiple possible TD role names
                td_role = Role.query.filter_by(role='Technical Director', is_deleted=False).first()
                if not td_role:
                    td_role = Role.query.filter_by(role='technicalDirector', is_deleted=False).first()
                if not td_role:
                    td_role = Role.query.filter(Role.role.ilike('%technical%director%'), Role.is_deleted == False).first()

                log.info(f"TD notification - Found TD role: {td_role.role if td_role else 'None'}")

                if td_role:
                    from models.user import User
                    td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    log.info(f"TD notification - Found {len(td_users)} TD users")
                    for td_user in td_users:
                        # Customize notification based on whether all materials are submitted
                        if all_materials_have_vendors:
                            notification_title = 'Purchase Order Ready for Approval'
                            notification_message = f'Buyer completed vendor selection for all materials in CR #{cr_id}. Ready for your approval.'
                        else:
                            # Include material names to make each notification unique (avoid duplicate blocking)
                            material_names = ', '.join(updated_materials[:3])  # Show first 3 materials
                            if len(updated_materials) > 3:
                                material_names += f' and {len(updated_materials) - 3} more'
                            notification_title = 'Vendor Selections Need Approval'
                            notification_message = f'Buyer selected vendors for {len(updated_materials)} material(s) in CR #{cr_id}: {material_names}'

                        notification = NotificationManager.create_notification(
                            user_id=td_user.user_id,
                            type='action_required',
                            title=notification_title,
                            message=notification_message,
                            priority='high',
                            category='purchase',
                            action_url=f'/technical-director/change-requests?cr_id={cr_id}',  # TD reviews vendor selections in change-requests
                            action_label='Review Selections',
                            metadata={'cr_id': str(cr_id), 'materials_count': len(updated_materials), 'target_role': 'technical-director'},
                            sender_id=user_id,
                            sender_name=user_name,
                            target_role='technical-director'
                        )
                        send_notification_to_user(td_user.user_id, notification.to_dict())
            except Exception as notif_error:
                log.error(f"Failed to send notification: {notif_error}")

        # Determine appropriate message based on status
        if all_materials_have_vendors:
            if is_td:
                message = f"All materials approved! PO-{cr_id} is ready for purchase."
            else:
                message = f"All materials submitted for TD approval! PO-{cr_id} will be reviewed by Technical Director."
        else:
            message = f"Vendor(s) {'approved' if is_td else 'selected for TD approval'} for {len(updated_materials)} material(s)"

        return jsonify({
            "success": True,
            "message": message,
            "purchase": {
                "cr_id": cr.cr_id,
                "status": cr.status,
                "use_per_material_vendors": cr.use_per_material_vendors,
                "material_vendor_selections": cr.material_vendor_selections,
                "updated_materials": updated_materials,
                "all_materials_have_vendors": all_materials_have_vendors
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting vendors for materials: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to select vendors: {str(e)}"}), 500


def create_sub_crs_for_vendor_groups(cr_id):
    """
    Create separate sub-CRs for each vendor group
    Used when buyer wants to send vendors separately with full details

    Each sub-CR will have:
    - parent_cr_id pointing to the original CR
    - cr_number_suffix like ".1", ".2", ".3"
    - is_sub_cr = True
    - Subset of materials for that vendor
    - Independent lifecycle (status, approvals, etc.)
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_groups = data.get('vendor_groups')  # Array of {vendor_id, vendor_name, materials: []}
        submission_group_id = data.get('submission_group_id')  # UUID to group these sub-CRs

        if not vendor_groups or not isinstance(vendor_groups, list):
            return jsonify({"error": "vendor_groups array is required"}), 400

        if not submission_group_id:
            # Generate UUID if not provided
            import uuid
            submission_group_id = str(uuid.uuid4())

        # Get the parent change request
        parent_cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not parent_cr:
            return jsonify({"error": "Parent purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Get effective user context for admin viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for TD, Admin, or Admin viewing as Buyer)
        # Convert both to int for safe comparison (user_id from JWT may be string)
        assigned_buyer_id = int(parent_cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            return jsonify({"error": f"This purchase is not assigned to you (assigned to buyer ID {assigned_buyer_id})"}), 403

        # Verify parent CR is in correct status
        # Allow 'assigned_to_buyer', 'send_to_buyer', and 'approved_by_pm' statuses
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm']
        if parent_cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot create sub-CRs. Parent CR status: {parent_cr.status}"}), 400

        # Create sub-CRs for each vendor group
        from models.vendor import Vendor
        created_sub_crs = []

        # Count existing sub-CRs to determine the next suffix number
        existing_sub_cr_count = ChangeRequest.query.filter_by(
            parent_cr_id=cr_id,
            is_deleted=False
        ).count()
        next_suffix_number = existing_sub_cr_count + 1

        for idx, vendor_group in enumerate(vendor_groups, start=next_suffix_number):
            vendor_id = vendor_group.get('vendor_id')
            vendor_name = vendor_group.get('vendor_name')
            materials = vendor_group.get('materials')  # Array of material selections

            if not vendor_id or not materials:
                continue

            # Verify vendor exists and is active
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
            if not vendor:
                return jsonify({"error": f"Vendor {vendor_id} not found"}), 404

            if vendor.status != 'active':
                return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

            # Extract materials data for this vendor group
            sub_cr_materials = []
            total_cost = 0.0

            for material in materials:
                material_name = material.get('material_name')
                quantity = material.get('quantity', 0)
                unit = material.get('unit', '')
                negotiated_price = material.get('negotiated_price')
                save_price_for_future = material.get('save_price_for_future', False)

                # Find the material from parent CR
                # CRITICAL: Search sub_items_data first (has complete structure with sub_item_name)
                # Then fallback to materials_data for backward compatibility
                parent_material = None

                # First, search in sub_items_data (has sub_item_name and complete structure)
                if parent_cr.sub_items_data:
                    for pm in parent_cr.sub_items_data:
                        if pm.get('material_name') == material_name:
                            parent_material = pm
                            break

                # Fallback to materials_data if not found (for old CRs without sub_items_data)
                if not parent_material and parent_cr.materials_data:
                    for pm in parent_cr.materials_data:
                        if pm.get('material_name') == material_name:
                            parent_material = pm
                            break

                # Calculate price
                unit_price = negotiated_price if negotiated_price else (parent_material.get('unit_price', 0) if parent_material else 0)
                material_total = unit_price * quantity
                total_cost += material_total

                # Add to sub-CR materials
                sub_cr_materials.append({
                    'material_name': material_name,
                    'sub_item_name': parent_material.get('sub_item_name', '') if parent_material else '',
                    'quantity': quantity,
                    'unit': unit,
                    'unit_price': unit_price,
                    'total_price': material_total,
                    'master_material_id': parent_material.get('master_material_id') if parent_material else None
                })

            # Create the sub-CR
            # TD creating sub-CRs does NOT auto-approve - TD must manually click "Approve Vendor"
            sub_cr = ChangeRequest(
                boq_id=parent_cr.boq_id,
                project_id=parent_cr.project_id,
                requested_by_user_id=parent_cr.requested_by_user_id,
                requested_by_name=parent_cr.requested_by_name,
                requested_by_role=parent_cr.requested_by_role,
                request_type=parent_cr.request_type,
                justification=f"Sub-PO for vendor {vendor_name} - Split from PO-{cr_id}",
                status='pending_td_approval',  # Always pending - TD must manually approve
                approval_required_from='technical_director',  # Set approval_required_from to TD
                item_id=parent_cr.item_id,
                item_name=parent_cr.item_name,
                sub_item_id=parent_cr.sub_item_id,
                sub_items_data=sub_cr_materials,
                materials_data=sub_cr_materials,
                materials_total_cost=total_cost,
                assigned_to_buyer_user_id=parent_cr.assigned_to_buyer_user_id,
                assigned_to_buyer_name=parent_cr.assigned_to_buyer_name,
                assigned_to_buyer_date=parent_cr.assigned_to_buyer_date,
                # Vendor selection already done
                selected_vendor_id=vendor_id,
                selected_vendor_name=vendor.company_name,
                vendor_selected_by_buyer_id=user_id,
                vendor_selected_by_buyer_name=user_name,
                vendor_selection_date=datetime.utcnow(),
                vendor_selection_status='pending_td_approval',  # Always pending - TD must manually approve
                # Sub-CR specific fields
                parent_cr_id=parent_cr.cr_id,
                cr_number_suffix=f".{idx}",
                is_sub_cr=True,
                submission_group_id=submission_group_id,
                use_per_material_vendors=False,  # Sub-CR uses single vendor
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            # Note: TD must manually approve even when TD creates sub-CRs
            # No auto-approval here

            db.session.add(sub_cr)
            db.session.flush()  # Get the cr_id

            created_sub_crs.append({
                'cr_id': sub_cr.cr_id,
                'formatted_cr_id': sub_cr.get_formatted_cr_id(),
                'vendor_id': vendor_id,
                'vendor_name': vendor_name,
                'materials_count': len(sub_cr_materials),
                'total_cost': total_cost
            })

        # Check if ALL materials from parent CR have been sent to sub-CRs
        # Get all sub-CRs for this parent (including newly created ones)
        all_sub_crs = ChangeRequest.query.filter_by(
            parent_cr_id=parent_cr.cr_id,
            is_deleted=False
        ).all()

        # Collect all material names that are in sub-CRs
        materials_in_sub_crs = set()
        for sub_cr in all_sub_crs:
            if sub_cr.materials_data:
                for material in sub_cr.materials_data:
                    material_name = material.get('material_name')
                    if material_name:
                        materials_in_sub_crs.add(material_name)

        # Collect all material names from parent CR
        parent_materials = set()
        if parent_cr.materials_data:
            for material in parent_cr.materials_data:
                material_name = material.get('material_name')
                if material_name:
                    parent_materials.add(material_name)

        # Only mark parent as 'split_to_sub_crs' if ALL materials are now in sub-CRs
        if parent_materials and materials_in_sub_crs >= parent_materials:
            # All materials sent - mark parent as split
            parent_cr.status = 'split_to_sub_crs'
            parent_cr.updated_at = datetime.utcnow()
        else:
            # Some materials still not sent - keep parent as 'assigned_to_buyer'
            unsent_materials = parent_materials - materials_in_sub_crs

        db.session.commit()

        # Send notifications to TD if buyer created sub-CRs
        if not is_td:
            try:
                from models.role import Role
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user

                td_role = Role.query.filter_by(role='Technical Director', is_deleted=False).first()
                if td_role:
                    from models.user import User
                    td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    for td_user in td_users:
                        notification = NotificationManager.create_notification(
                            user_id=td_user.user_id,
                            type='action_required',
                            title=f'{len(created_sub_crs)} Purchase Orders Need Approval',
                            message=f'Buyer created {len(created_sub_crs)} separate purchase orders from PO-{cr_id}. Each needs approval.',
                            priority='high',
                            category='purchase',
                            action_url=f'/technical-director/vendor-approval?cr_id={cr_id}',
                            action_label='Review Purchase Orders',
                            metadata={'parent_cr_id': str(cr_id), 'sub_crs_count': len(created_sub_crs), 'submission_group_id': submission_group_id, 'target_role': 'technical-director'},
                            sender_id=user_id,
                            sender_name=user_name,
                            target_role='technical-director'
                        )
                        send_notification_to_user(td_user.user_id, notification.to_dict())
            except Exception as notif_error:
                log.error(f"Failed to send notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"Successfully created {len(created_sub_crs)} separate purchase orders!",
            "parent_cr_id": parent_cr.cr_id,
            "submission_group_id": submission_group_id,
            "sub_crs": created_sub_crs
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating sub-CRs: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to create sub-CRs: {str(e)}"}), 500


def create_po_children(cr_id):
    """
    Create POChild records for each vendor group.
    Replaces the deprecated create_sub_crs_for_vendor_groups() function.

    Each POChild will have:
    - parent_cr_id pointing to the original CR
    - suffix like ".1", ".2", ".3"
    - Subset of materials for that vendor
    - Independent lifecycle (vendor approval, purchase tracking)
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_groups = data.get('vendor_groups')  # Array of {vendor_id, vendor_name, materials: []}
        submission_group_id = data.get('submission_group_id')  # UUID to group these PO children

        if not vendor_groups or not isinstance(vendor_groups, list):
            return jsonify({"error": "vendor_groups array is required"}), 400

        if not submission_group_id:
            import uuid
            submission_group_id = str(uuid.uuid4())

        # Get the parent change request
        parent_cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not parent_cr:
            return jsonify({"error": "Parent purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Get effective user context for admin viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for TD, Admin, or Admin viewing as Buyer)
        assigned_buyer_id = int(parent_cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            return jsonify({"error": f"This purchase is not assigned to you (assigned to buyer ID {assigned_buyer_id})"}), 403

        # Verify parent CR is in correct status
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm']
        if parent_cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot create PO children. Parent CR status: {parent_cr.status}"}), 400

        # Create POChild records for each vendor group
        created_po_children = []

        # Get existing POChild records for this parent CR (to consolidate same vendors) with eager loading
        existing_po_children = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            parent_cr_id=cr_id,
            is_deleted=False
        ).all()

        # Build a map of vendor_id -> existing POChild for consolidation
        existing_vendor_po_children = {}
        for existing_po in existing_po_children:
            if existing_po.vendor_id:
                existing_vendor_po_children[existing_po.vendor_id] = existing_po

        # CRITICAL FIX: Build a set of ALL materials already in approved/completed POChildren
        # These materials should be REJECTED as duplicates to prevent double-ordering
        materials_already_approved = set()
        for existing_po in existing_po_children:
            if existing_po.status in ['vendor_approved', 'purchase_completed', 'approved']:
                if existing_po.materials_data:
                    for mat in existing_po.materials_data:
                        mat_name = mat.get('material_name')
                        if mat_name:
                            materials_already_approved.add(mat_name.lower().strip())

        if materials_already_approved:
            log.info(f"Materials already approved/purchased for CR {cr_id}: {materials_already_approved}")

        # Count existing POChild records to determine next suffix for NEW vendors
        # Use max suffix to avoid gaps if POChildren were deleted
        max_suffix = 0
        for existing_po in existing_po_children:
            if existing_po.suffix:
                try:
                    suffix_num = int(existing_po.suffix.replace('.', ''))
                    if suffix_num > max_suffix:
                        max_suffix = suffix_num
                except (ValueError, AttributeError):
                    pass
        next_suffix_number = max_suffix + 1

        for vendor_group in vendor_groups:
            vendor_id = vendor_group.get('vendor_id')
            vendor_name = vendor_group.get('vendor_name')
            materials = vendor_group.get('materials')

            if not vendor_id or not materials:
                continue

            # Extract child_notes from material_vendor_selections for this vendor
            # Look for any material assigned to this vendor that has supplier_notes
            child_notes_for_vendor = None
            if parent_cr.material_vendor_selections:
                for mat_name, selection in parent_cr.material_vendor_selections.items():
                    if isinstance(selection, dict):
                        selection_vendor_id = selection.get('vendor_id')
                        # Compare as integers to handle both string and int types
                        if selection_vendor_id is not None and int(selection_vendor_id) == int(vendor_id):
                            if selection.get('supplier_notes'):
                                child_notes_for_vendor = selection.get('supplier_notes')
                                log.info(f"Found child_notes for vendor {vendor_id} from material '{mat_name}': {child_notes_for_vendor[:50] if child_notes_for_vendor else ''}...")
                                break

            # Also check materials in vendor_group payload for supplier_notes
            if not child_notes_for_vendor:
                for material in materials:
                    mat_name = material.get('material_name')
                    if mat_name and parent_cr.material_vendor_selections:
                        selection = parent_cr.material_vendor_selections.get(mat_name, {})
                        if isinstance(selection, dict) and selection.get('supplier_notes'):
                            child_notes_for_vendor = selection.get('supplier_notes')
                            log.info(f"Found child_notes from material '{mat_name}' selection: {child_notes_for_vendor[:50] if child_notes_for_vendor else ''}...")
                            break

            # CRITICAL FIX: Filter out materials that are already in approved POChildren
            # This prevents duplicate ordering of the same materials
            filtered_materials = []
            duplicate_materials = []
            for material in materials:
                mat_name = material.get('material_name', '')
                if mat_name.lower().strip() in materials_already_approved:
                    duplicate_materials.append(mat_name)
                else:
                    filtered_materials.append(material)

            if duplicate_materials:
                log.warning(f"Skipping {len(duplicate_materials)} duplicate materials already approved for vendor {vendor_id}: {duplicate_materials}")

            if not filtered_materials:
                # All materials were duplicates, skip this vendor group entirely
                log.warning(f"All materials for vendor {vendor_id} are already approved - skipping vendor group")
                continue

            # Use filtered materials for the rest of the function
            materials = filtered_materials

            # Verify vendor exists and is active
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
            if not vendor:
                return jsonify({"error": f"Vendor {vendor_id} not found"}), 404

            if vendor.status != 'active':
                return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

            # Get vendor's product prices as fallback
            from models.vendor import VendorProduct
            vendor_product_prices = {}
            vendor_products = VendorProduct.query.filter_by(
                vendor_id=vendor_id,
                is_deleted=False
            ).all()
            for vp in vendor_products:
                if vp.product_name:
                    vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)

            # Extract materials data for this vendor group
            po_materials = []
            total_cost = 0.0

            for material in materials:
                material_name = material.get('material_name')
                quantity = material.get('quantity', 0)
                unit = material.get('unit', '')
                negotiated_price = material.get('negotiated_price')
                supplier_notes_for_material = material.get('supplier_notes')  # Per-material notes from frontend

                # Find the material from parent CR
                # CRITICAL: Search sub_items_data first (has complete structure with sub_item_name)
                # Then fallback to materials_data for backward compatibility
                parent_material = None

                # First, search in sub_items_data (has sub_item_name and complete structure)
                if parent_cr.sub_items_data:
                    for pm in parent_cr.sub_items_data:
                        if pm.get('material_name') == material_name:
                            parent_material = pm
                            break

                # Fallback to materials_data if not found (for old CRs without sub_items_data)
                if not parent_material and parent_cr.materials_data:
                    for pm in parent_cr.materials_data:
                        if pm.get('material_name') == material_name:
                            parent_material = pm
                            break

                # CRITICAL FIX: If negotiated_price not provided, check parent CR's material_vendor_selections
                # This is where the buyer stores the selected vendor price
                if not negotiated_price and parent_cr.material_vendor_selections:
                    vendor_selection = parent_cr.material_vendor_selections.get(material_name, {})
                    if isinstance(vendor_selection, dict):
                        negotiated_price = vendor_selection.get('negotiated_price')
                        if negotiated_price:
                            log.info(f"Using vendor price from parent CR material_vendor_selections for '{material_name}': {negotiated_price}")

                # ✅ CRITICAL FIX: If supplier_notes not provided, check parent CR's material_vendor_selections
                # This is where the buyer stores the supplier notes when selecting vendors
                if not supplier_notes_for_material and parent_cr.material_vendor_selections:
                    vendor_selection = parent_cr.material_vendor_selections.get(material_name, {})
                    if isinstance(vendor_selection, dict):
                        supplier_notes_for_material = vendor_selection.get('supplier_notes', '')
                        if supplier_notes_for_material:
                            log.info(f"✅ Using supplier notes from parent CR material_vendor_selections for '{material_name}': {supplier_notes_for_material[:50]}...")

                # Lookup vendor product price as fallback
                vendor_product_price = vendor_product_prices.get(material_name.lower().strip() if material_name else '', 0)

                # Calculate price - priority: negotiated > vendor product price > parent material price (BOQ)
                # CRITICAL: Changed order - only use parent_price (BOQ) as last resort
                parent_price = parent_material.get('unit_price', 0) if parent_material else 0
                unit_price = negotiated_price if negotiated_price else (vendor_product_price if vendor_product_price else parent_price)
                material_total = unit_price * quantity
                total_cost += material_total

                # Get BOQ price for comparison (original_unit_price if stored, or lookup from BOQ)
                boq_unit_price = 0
                if parent_material:
                    # First try original_unit_price (if stored during CR creation)
                    boq_unit_price = parent_material.get('original_unit_price', 0)
                    # Fallback to unit_price from sub_items_data (if not negotiated)
                    if not boq_unit_price:
                        # Check if parent CR has sub_items_data with original prices
                        sub_items = parent_cr.sub_items_data or []
                        for sub in sub_items:
                            if sub.get('material_name') == material_name:
                                boq_unit_price = sub.get('unit_price', 0) or sub.get('original_unit_price', 0)
                                break
                    # If still no price, use the parent material price as fallback
                    if not boq_unit_price:
                        boq_unit_price = parent_material.get('unit_price', 0)

                boq_total_price = boq_unit_price * quantity if boq_unit_price else 0

                po_materials.append({
                    'material_name': material_name,
                    'sub_item_name': parent_material.get('sub_item_name', '') if parent_material else '',
                    'description': parent_material.get('description', '') if parent_material else '',
                    'brand': parent_material.get('brand', '') if parent_material else '',
                    'size': parent_material.get('size', '') if parent_material else '',
                    'specification': parent_material.get('specification', '') if parent_material else '',
                    'quantity': quantity,
                    'unit': unit,
                    'unit_price': unit_price,  # Vendor's price
                    'total_price': material_total,  # Vendor's total
                    'boq_unit_price': boq_unit_price,  # Original BOQ price for comparison
                    'boq_total_price': boq_total_price,  # BOQ total for comparison
                    'master_material_id': parent_material.get('master_material_id') if parent_material else None,
                    'negotiated_price': negotiated_price,  # Store negotiated price
                    'is_new_material': parent_material.get('is_new_material', False) if parent_material else False,  # Flag if new material
                    'supplier_notes': supplier_notes_for_material  # Per-material notes for supplier
                })

            # Check if a POChild already exists for this vendor (consolidate materials)
            # Consolidation logic:
            # - 'pending_td_approval': Not yet approved by TD → MERGE into existing
            # - 'rejected': TD rejected → MERGE into existing (resubmit)
            # - 'vendor_approved' / 'approved': TD approved → CREATE NEW (separate purchase)
            # - 'purchase_completed': Already purchased → CREATE NEW (separate purchase)
            existing_po_child = existing_vendor_po_children.get(vendor_id)

            # Determine if we should consolidate or create new
            should_consolidate = False
            if existing_po_child:
                consolidate_statuses = ['pending_td_approval', 'rejected']
                if existing_po_child.status in consolidate_statuses:
                    should_consolidate = True
                    log.info(f"🔄 Found existing POChild {existing_po_child.get_formatted_id()} for vendor {vendor.company_name} with status '{existing_po_child.status}' - will MERGE materials")
                else:
                    # TD already approved or purchase completed - create new POChild for new purchase
                    log.info(f"✅ Existing POChild {existing_po_child.get_formatted_id()} for vendor {vendor.company_name} has status '{existing_po_child.status}' (approved/completed) - will create NEW POChild for new purchase")

            if should_consolidate and existing_po_child:
                # Consolidate: Add new materials to existing POChild for same vendor
                # Get existing materials and build a lookup by material_name
                existing_materials = list(existing_po_child.materials_data or [])  # Make a copy
                existing_material_names = {m.get('material_name'): idx for idx, m in enumerate(existing_materials)}

                materials_added = 0
                materials_updated = 0
                for new_mat in po_materials:
                    mat_name = new_mat.get('material_name')
                    if mat_name in existing_material_names:
                        # Update existing material (replace with new pricing/quantity)
                        existing_materials[existing_material_names[mat_name]] = new_mat
                        materials_updated += 1
                    else:
                        # Add new material
                        existing_materials.append(new_mat)
                        materials_added += 1

                # Recalculate total cost
                new_total_cost = sum(m.get('total_price', 0) for m in existing_materials)

                # Update existing POChild
                existing_po_child.materials_data = existing_materials
                existing_po_child.materials_total_cost = new_total_cost
                existing_po_child.vendor_selected_by_buyer_id = user_id
                existing_po_child.vendor_selected_by_buyer_name = user_name
                existing_po_child.vendor_selection_date = datetime.utcnow()
                existing_po_child.vendor_selection_status = 'pending_td_approval'
                existing_po_child.status = 'pending_td_approval'
                existing_po_child.updated_at = datetime.utcnow()
                # Clear any previous rejection
                existing_po_child.rejection_reason = None
                # Update child_notes if provided
                if child_notes_for_vendor:
                    existing_po_child.child_notes = child_notes_for_vendor

                # Mark JSON field as modified for SQLAlchemy
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_po_child, 'materials_data')

                po_child = existing_po_child
                log.info(f"📦 Consolidated into POChild {po_child.get_formatted_id()} for vendor {vendor.company_name}: {materials_added} added, {materials_updated} updated. Total: {len(existing_materials)} materials, AED {new_total_cost:.2f}")

                created_po_children.append({
                    'id': po_child.id,
                    'formatted_id': po_child.get_formatted_id(),
                    'vendor_id': vendor_id,
                    'vendor_name': vendor.company_name,
                    'materials_count': len(existing_materials),
                    'total_cost': new_total_cost,
                    'consolidated': True,
                    'materials_added': materials_added,
                    'materials_updated': materials_updated
                })
            else:
                # Create NEW POChild record for this vendor
                po_child = POChild(
                    parent_cr_id=parent_cr.cr_id,
                    suffix=f".{next_suffix_number}",
                    boq_id=parent_cr.boq_id,
                    project_id=parent_cr.project_id,
                    item_id=parent_cr.item_id,
                    item_name=parent_cr.item_name,
                    submission_group_id=submission_group_id,
                    materials_data=po_materials,
                    materials_total_cost=total_cost,
                    child_notes=child_notes_for_vendor,  # Copy supplier notes to child_notes column
                    vendor_id=vendor_id,
                    vendor_name=vendor.company_name,
                    vendor_selected_by_buyer_id=user_id,
                    vendor_selected_by_buyer_name=user_name,
                    vendor_selection_date=datetime.utcnow(),
                    vendor_selection_status='pending_td_approval',
                    status='pending_td_approval',
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )

                db.session.add(po_child)
                db.session.flush()  # Get the id

                # Add to existing map to prevent duplicates in same batch
                existing_vendor_po_children[vendor_id] = po_child
                next_suffix_number += 1

                log.info(f"📦 Created new POChild {po_child.get_formatted_id()} for vendor {vendor.company_name}, child_notes: {child_notes_for_vendor[:50] if child_notes_for_vendor else 'None'}")

                created_po_children.append({
                    'id': po_child.id,
                    'formatted_id': po_child.get_formatted_id(),
                    'vendor_id': vendor_id,
                    'vendor_name': vendor.company_name,
                    'materials_count': len(po_materials),
                    'total_cost': total_cost,
                    'consolidated': False
                })

        # Check if ALL materials from parent CR have been assigned to PO children with eager loading
        all_po_children = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            parent_cr_id=parent_cr.cr_id,
            is_deleted=False
        ).all()

        materials_in_po_children = set()
        for po_child in all_po_children:
            if po_child.materials_data:
                for material in po_child.materials_data:
                    material_name = material.get('material_name')
                    if material_name:
                        materials_in_po_children.add(material_name)

        parent_materials = set()
        if parent_cr.materials_data:
            for material in parent_cr.materials_data:
                material_name = material.get('material_name')
                if material_name:
                    parent_materials.add(material_name)

        # Mark parent as 'split_to_po_children' if all materials assigned
        if parent_materials and materials_in_po_children >= parent_materials:
            parent_cr.status = 'split_to_sub_crs'  # Keep same status name for compatibility
            parent_cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notifications to TD if buyer created PO children
        if not is_td and created_po_children:
            try:
                from models.role import Role
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user

                # Use ilike pattern matching to find TD role
                td_role = Role.query.filter(Role.role.ilike('%technical%director%'), Role.is_deleted == False).first()
                if td_role:
                    from models.user import User
                    td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()

                    for td_user in td_users:
                        try:
                            po_child_ids = [pc.get('formatted_id', f"PO-{pc.get('id')}") for pc in created_po_children]

                            notification = NotificationManager.create_notification(
                                user_id=td_user.user_id,
                                type='action_required',
                                title='Purchase Order Needs Approval',
                                message=f'{user_name} sent {len(created_po_children)} purchase order(s) for vendor approval: {", ".join(po_child_ids)}',
                                priority='high',
                                category='purchase',
                                action_url='/technical-director/change-requests?tab=vendor_approvals&subtab=pending',
                                action_label='Review Purchase Orders',
                                metadata={
                                    'parent_cr_id': str(cr_id),
                                    'po_children_count': len(created_po_children),
                                    'po_child_ids': [pc.get('id') for pc in created_po_children],
                                    'submission_group_id': submission_group_id,
                                    'target_role': 'technical-director'
                                },
                                sender_id=user_id,
                                sender_name=user_name,
                                target_role='technical-director'
                            )
                            send_notification_to_user(td_user.user_id, notification.to_dict())
                        except Exception as inner_error:
                            log.error(f"Failed to send notification to TD user {td_user.user_id}: {inner_error}")
            except Exception as notif_error:
                log.error(f"Failed to send TD notifications: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"Successfully created {len(created_po_children)} separate purchase orders!",
            "parent_cr_id": parent_cr.cr_id,
            "submission_group_id": submission_group_id,
            "po_children": created_po_children
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to create PO children: {str(e)}"}), 500


def update_purchase_order(cr_id):
    """Update purchase order materials and costs, and optionally material_vendor_selections"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        materials = data.get('materials')
        total_cost = data.get('total_cost')
        material_vendor_selections = data.get('material_vendor_selections')

        # Allow updating ONLY material_vendor_selections without materials/total_cost
        if not materials and total_cost is None and not material_vendor_selections:
            return jsonify({"error": "Materials, total cost, or material_vendor_selections are required"}), 400

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

        # Verify it's assigned to this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status (can only edit pending purchases)
        # Allow both 'assigned_to_buyer' and 'send_to_buyer' statuses
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer']
        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot edit purchase. Current status: {cr.status}"}), 400

        # Validate and update materials if provided
        if materials is not None:
            if not isinstance(materials, list):
                return jsonify({"error": "Materials must be an array"}), 400

            # Update materials in sub_items_data format
            updated_materials = []
            for material in materials:
                updated_materials.append({
                    "material_name": material.get('material_name', ''),
                    "sub_item_name": material.get('sub_item_name', ''),
                    "quantity": float(material.get('quantity', 0)),
                    "unit": material.get('unit', ''),
                    "unit_price": float(material.get('unit_price', 0)),
                    "total_price": float(material.get('total_price', 0))
                })

            cr.sub_items_data = updated_materials
            cr.materials_total_cost = float(total_cost)

        # Update material_vendor_selections if provided
        if material_vendor_selections is not None:
            from sqlalchemy.orm.attributes import flag_modified
            cr.material_vendor_selections = material_vendor_selections
            flag_modified(cr, 'material_vendor_selections')
            log.info(f"Updated material_vendor_selections for CR {cr_id}: {material_vendor_selections}")

        cr.updated_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Purchase order updated successfully",
            "purchase": {
                "cr_id": cr.cr_id,
                "materials": cr.sub_items_data if materials is not None else cr.sub_items_data or cr.materials_data,
                "total_cost": cr.materials_total_cost,
                "material_vendor_selections": cr.material_vendor_selections or {}
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating purchase order: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update purchase order: {str(e)}"}), 500


def td_approve_vendor(cr_id):
    """TD approves vendor selection for purchase"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify vendor selection is pending approval
        if cr.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {cr.vendor_selection_status}"}), 400

        # Approve the vendor selection
        cr.vendor_selection_status = 'approved'
        cr.vendor_approved_by_td_id = td_id
        cr.vendor_approved_by_td_name = td_name
        cr.vendor_approval_date = datetime.utcnow()
        cr.updated_at = datetime.utcnow()

        # Add to BOQ History - TD Vendor Approval
        from models.boq import BOQHistory
        from sqlalchemy.orm.attributes import flag_modified

        existing_history = BOQHistory.query.filter_by(boq_id=cr.boq_id).order_by(BOQHistory.action_date.desc()).first()

        if existing_history:
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        new_action = {
            "role": "technical_director",
            "type": "change_request_vendor_approved_by_td",
            "sender": td_name,
            "receiver": cr.vendor_selected_by_buyer_name or "Buyer",
            "sender_role": "technical_director",
            "receiver_role": "buyer",
            "status": cr.status,
            "cr_id": cr_id,
            "item_name": cr.item_name or f"CR #{cr_id}",
            "materials_count": len(cr.materials_data) if cr.materials_data else 0,
            "total_cost": cr.materials_total_cost,
            "vendor_id": cr.selected_vendor_id,
            "vendor_name": cr.selected_vendor_name,
            "vendor_selection_status": "approved",
            "comments": f"TD approved vendor selection: '{cr.selected_vendor_name}'. Buyer can proceed with purchase.",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": td_name,
            "sender_user_id": td_id,
            "project_name": cr.project.project_name if cr.project else None,
            "project_id": cr.project_id
        }

        current_actions.append(new_action)

        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = td_name
            existing_history.sender = td_name
            existing_history.receiver = cr.vendor_selected_by_buyer_name or "Buyer"
            existing_history.comments = f"CR #{cr_id} vendor approved by TD"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = td_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=cr.boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=cr.boq.status if cr.boq else 'unknown',
                sender=td_name,
                receiver=cr.vendor_selected_by_buyer_name or "Buyer",
                comments=f"CR #{cr_id} vendor approved by TD",
                sender_role='technical_director',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notification to buyer about vendor approval
        # Send to the buyer who selected the vendor, not necessarily the CR creator
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Prefer vendor_selected_by_buyer_id, fall back to created_by
            buyer_to_notify = cr.vendor_selected_by_buyer_id or cr.created_by
            if buyer_to_notify:
                notification = NotificationManager.create_notification(
                    user_id=buyer_to_notify,
                    type='approval',
                    title='Vendor Selection Approved',
                    message=f'TD approved vendor "{cr.selected_vendor_name}" for materials purchase: {cr.item_name or "Materials Request"}',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/purchase-orders?cr_id={cr_id}',
                    action_label='Proceed with Purchase',
                    metadata={
                        'cr_id': str(cr_id),
                        'vendor_name': cr.selected_vendor_name,
                        'vendor_id': str(cr.selected_vendor_id) if cr.selected_vendor_id else None,
                        'item_name': cr.item_name
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(buyer_to_notify, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor approval notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection approved successfully",
            "purchase": {
                "cr_id": cr.cr_id,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_approved_by_td_id": cr.vendor_approved_by_td_id,
                "vendor_approved_by_td_name": cr.vendor_approved_by_td_name,
                "vendor_approval_date": cr.vendor_approval_date.isoformat()
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to approve vendor: {str(e)}"}), 500


def td_reject_vendor(cr_id):
    """TD rejects vendor selection for purchase"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        data = request.get_json()
        reason = data.get('reason', '')

        if not reason:
            return jsonify({"error": "Rejection reason is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify vendor selection is pending approval
        if cr.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {cr.vendor_selection_status}"}), 400

        # Reject the vendor selection - clear vendor and allow buyer to select again
        cr.vendor_selection_status = 'rejected'
        cr.vendor_approved_by_td_id = td_id
        cr.vendor_approved_by_td_name = td_name
        cr.vendor_approval_date = datetime.utcnow()
        cr.vendor_rejection_reason = reason

        # Clear vendor selection so buyer can select new vendor
        cr.selected_vendor_id = None
        cr.selected_vendor_name = None
        cr.vendor_selected_by_buyer_id = None
        cr.vendor_selected_by_buyer_name = None
        cr.vendor_selection_date = None

        cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notification to buyer about vendor rejection
        # Send to the buyer who selected the vendor, not necessarily the CR creator
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Prefer vendor_selected_by_buyer_id, fall back to created_by
            buyer_to_notify = cr.vendor_selected_by_buyer_id or cr.created_by
            if buyer_to_notify:
                notification = NotificationManager.create_notification(
                    user_id=buyer_to_notify,
                    type='rejection',
                    title='Vendor Selection Rejected',
                    message=f'TD rejected vendor selection for materials purchase: {cr.item_name or "Materials Request"}. Reason: {reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/purchase-orders?cr_id={cr_id}',
                    action_label='Select New Vendor',
                    metadata={
                        'cr_id': str(cr_id),
                        'rejection_reason': reason,
                        'item_name': cr.item_name
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(buyer_to_notify, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection rejected",
            "purchase": {
                "cr_id": cr.cr_id,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_rejection_reason": cr.vendor_rejection_reason
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to reject vendor: {str(e)}"}), 500


def td_approve_po_child(po_child_id):
    """TD approves vendor selection for POChild"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        # Get the PO child with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Verify vendor selection is pending approval
        if po_child.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {po_child.vendor_selection_status}"}), 400

        # Approve the vendor selection
        po_child.vendor_selection_status = 'approved'
        po_child.status = 'vendor_approved'
        po_child.vendor_approved_by_td_id = td_id
        po_child.vendor_approved_by_td_name = td_name
        po_child.vendor_approval_date = datetime.utcnow()
        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notification to buyer about vendor approval
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if po_child.vendor_selected_by_buyer_id:
                notification = NotificationManager.create_notification(
                    user_id=po_child.vendor_selected_by_buyer_id,
                    type='approval',
                    title='Vendor Selection Approved',
                    message=f'TD approved vendor "{po_child.vendor_name}" for {po_child.get_formatted_id()}',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/purchase-orders?po_child_id={po_child_id}',
                    action_label='Proceed with Purchase',
                    metadata={
                        'po_child_id': str(po_child_id),
                        'vendor_name': po_child.vendor_name,
                        'vendor_id': str(po_child.vendor_id) if po_child.vendor_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(po_child.vendor_selected_by_buyer_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor approval notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection approved successfully",
            "po_child": po_child.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving PO child vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to approve vendor: {str(e)}"}), 500


def td_reject_po_child(po_child_id):
    """TD rejects vendor selection for POChild"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        data = request.get_json()
        reason = data.get('reason', '')

        if not reason:
            return jsonify({"error": "Rejection reason is required"}), 400

        # Get the PO child with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Verify vendor selection is pending approval
        if po_child.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {po_child.vendor_selection_status}"}), 400

        # Store buyer info before clearing for notification
        original_buyer_id = po_child.vendor_selected_by_buyer_id

        # Reject the vendor selection
        po_child.vendor_selection_status = 'td_rejected'
        po_child.status = 'td_rejected'
        po_child.vendor_approved_by_td_id = td_id
        po_child.vendor_approved_by_td_name = td_name
        po_child.vendor_approval_date = datetime.utcnow()
        po_child.rejection_reason = reason

        # Clear vendor selection so buyer can select a new vendor
        # BUT keep vendor_selected_by_buyer_id so we can query by buyer later
        po_child.vendor_id = None
        po_child.vendor_name = None
        # Don't clear buyer id - needed for querying rejected items
        # po_child.vendor_selected_by_buyer_id = None
        # po_child.vendor_selected_by_buyer_name = None
        po_child.vendor_selection_date = None

        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notification to buyer about vendor rejection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if original_buyer_id:
                notification = NotificationManager.create_notification(
                    user_id=original_buyer_id,
                    type='rejection',
                    title='Vendor Selection Rejected',
                    message=f'TD rejected vendor selection for {po_child.get_formatted_id()}. Reason: {reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/purchase-orders?po_child_id={po_child_id}',
                    action_label='Select New Vendor',
                    metadata={
                        'po_child_id': str(po_child_id),
                        'rejection_reason': reason
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(original_buyer_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection rejected",
            "po_child": po_child.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting PO child vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to reject vendor: {str(e)}"}), 500


def reselect_vendor_for_po_child(po_child_id):
    """Buyer re-selects vendor for a TD-rejected POChild (with full material data and prices)"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_id = data.get('vendor_id')
        materials = data.get('materials', [])

        # Input validation
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        try:
            vendor_id = int(vendor_id)
        except (ValueError, TypeError):
            return jsonify({"error": "vendor_id must be a valid integer"}), 400

        if not isinstance(materials, list):
            return jsonify({"error": "materials must be an array"}), 400

        # Validate each material
        for idx, material in enumerate(materials):
            if not isinstance(material, dict):
                return jsonify({"error": f"Material at index {idx} must be an object"}), 400

            if 'material_name' not in material or not material.get('material_name'):
                return jsonify({"error": f"Material at index {idx} missing material_name"}), 400

            if 'negotiated_price' in material and material['negotiated_price'] is not None:
                try:
                    price = float(material['negotiated_price'])
                    if price < 0:
                        return jsonify({"error": f"Negative price not allowed for material {material.get('material_name')}"}), 400
                except (ValueError, TypeError):
                    return jsonify({"error": f"Invalid negotiated_price for material {material.get('material_name')}"}), 400

        # Get the PO child with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Check if admin or buyer assigned to parent CR
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # Get parent CR to check assignment
        parent_cr = ChangeRequest.query.get(po_child.parent_cr_id)
        if not parent_cr:
            return jsonify({"error": "Parent change request not found"}), 404

        # Verify buyer is assigned to this purchase (or is admin)
        if not is_admin and not is_admin_viewing:
            if parent_cr.assigned_to_buyer_user_id != buyer_id and po_child.vendor_selected_by_buyer_id != buyer_id:
                return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify PO Child is in td_rejected status
        if po_child.vendor_selection_status != 'td_rejected' and po_child.status != 'td_rejected':
            return jsonify({"error": f"Cannot re-select vendor. PO Child status: {po_child.status}, vendor_selection_status: {po_child.vendor_selection_status}"}), 400

        # Verify vendor exists and is active
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        if vendor.status != 'active':
            return jsonify({"error": "Vendor is not active"}), 400

        # Update materials_data with new negotiated prices if provided
        if materials and len(materials) > 0:
            existing_materials = po_child.materials_data or []
            updated_materials = []
            total_cost = 0.0

            for existing_mat in existing_materials:
                mat_name = existing_mat.get('material_name', '')
                # Find matching material from request
                matching_material = next(
                    (m for m in materials if m.get('material_name') == mat_name),
                    None
                )

                if matching_material:
                    # Update with new negotiated price
                    negotiated_price = matching_material.get('negotiated_price')
                    if negotiated_price is not None:
                        existing_mat['negotiated_price'] = negotiated_price
                        existing_mat['unit_price'] = negotiated_price

                    # Calculate cost for this material
                    price = negotiated_price or existing_mat.get('unit_price', 0) or 0
                    quantity = existing_mat.get('quantity', 0) or 0
                    total_cost += price * quantity

                    # Track if price should be saved for future
                    if matching_material.get('save_price_for_future'):
                        existing_mat['save_price_for_future'] = True
                else:
                    # Keep existing material data, add to total
                    price = existing_mat.get('negotiated_price') or existing_mat.get('unit_price', 0) or 0
                    quantity = existing_mat.get('quantity', 0) or 0
                    total_cost += price * quantity

                updated_materials.append(existing_mat)

            # Update materials_data and total_cost
            po_child.materials_data = updated_materials
            po_child.materials_total_cost = round(total_cost, 2)

        # Update PO Child with new vendor (always use authoritative vendor name from database)
        po_child.vendor_id = vendor_id
        po_child.vendor_name = vendor.company_name
        po_child.vendor_selected_by_buyer_id = buyer_id
        po_child.vendor_selected_by_buyer_name = buyer_name
        po_child.vendor_selection_date = datetime.utcnow()
        po_child.vendor_selection_status = 'pending_td_approval'
        po_child.status = 'pending_td_approval'
        po_child.rejection_reason = None  # Clear previous rejection reason
        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Audit log for vendor re-selection
        log.info(f"PO Child {po_child.get_formatted_id()} vendor re-selected: "
                 f"vendor_id={vendor_id} ({vendor.company_name}), "
                 f"materials_total_cost={po_child.materials_total_cost}, "
                 f"by buyer {buyer_name} (id={buyer_id})")

        # Send notification to TD about new vendor selection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user
            from models.user import User

            # Find TD users to notify
            td_users = User.query.filter(
                User.role.in_(['technical_director', 'TechnicalDirector', 'Technical Director']),
                User.is_deleted == False
            ).all()

            for td_user in td_users:
                notification = NotificationManager.create_notification(
                    user_id=td_user.user_id,
                    type='approval',
                    title='Vendor Re-selected for Approval',
                    message=f'{buyer_name} re-selected vendor "{vendor.company_name}" for {po_child.get_formatted_id()} after previous rejection',
                    priority='high',
                    category='vendor',
                    action_url=f'/technical-director/vendor-approval?po_child_id={po_child_id}',
                    action_label='Review Selection',
                    metadata={
                        'po_child_id': str(po_child_id),
                        'vendor_name': vendor.company_name,
                        'vendor_id': str(vendor_id),
                        'target_role': 'technical-director'
                    },
                    sender_id=buyer_id,
                    sender_name=buyer_name,
                    target_role='technical-director'
                )
                send_notification_to_user(td_user.user_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor re-selection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor re-selected successfully. Awaiting TD approval.",
            "po_child": po_child.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error re-selecting vendor for PO child: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to re-select vendor: {str(e)}"}), 500


def get_project_site_engineers(project_id):
    """Get all site engineers assigned to a project for buyer to select recipient"""
    try:
        from models.pm_assign_ss import PMAssignSS
        from models.role import Role

        log.info(f"🔍 Fetching site engineers for project {project_id}")

        project = Project.query.filter_by(
            project_id=project_id,
            is_deleted=False
        ).first()

        if not project:
            log.warning(f"Project {project_id} not found")
            return jsonify({"error": "Project not found"}), 404

        log.info(f"✅ Project found: {project.project_name} (Code: {project.project_code})")
        log.info(f"   project.site_supervisor_id = {project.site_supervisor_id}")

        site_engineers = []
        seen_ids = set()

        # Get Site Engineer/Supervisor role IDs
        se_roles = Role.query.filter(
            Role.role.in_(['Site Engineer', 'Site Supervisor', 'site_engineer', 'site_supervisor', 'siteengineer', 'sitesupervisor']),
            Role.is_deleted == False
        ).all()
        se_role_ids = [role.role_id for role in se_roles]
        log.info(f"   SE Role IDs: {se_role_ids}")

        # Check direct site_supervisor_id
        if project.site_supervisor_id:
            se_user = User.query.filter_by(
                user_id=project.site_supervisor_id,
                is_deleted=False
            ).first()
            if se_user:
                log.info(f"   ✅ Found direct SE: {se_user.full_name} (ID: {se_user.user_id})")
                site_engineers.append({
                    'user_id': se_user.user_id,
                    'full_name': se_user.full_name,
                    'email': se_user.email
                })
                seen_ids.add(se_user.user_id)
            else:
                log.warning(f"   ⚠️ site_supervisor_id {project.site_supervisor_id} not found or deleted")

        # Check PMAssignSS table for additional site engineers
        assignments = PMAssignSS.query.filter_by(
            project_id=project_id,
            is_deleted=False
        ).all()

        # Collect all SE IDs from project assignments (batch fetch to avoid N+1)
        se_ids_to_fetch = set()
        for assignment in assignments:
            if assignment.ss_ids and isinstance(assignment.ss_ids, list):
                se_ids_to_fetch.update(assignment.ss_ids)
            if assignment.assigned_to_se_id:
                se_ids_to_fetch.add(assignment.assigned_to_se_id)

        # Remove already seen IDs and fetch in single query
        se_ids_to_fetch -= seen_ids
        if se_ids_to_fetch:
            se_users = User.query.filter(
                User.user_id.in_(se_ids_to_fetch),
                User.is_deleted.is_(False)
            ).all()
            for se_user in se_users:
                site_engineers.append({
                    'user_id': se_user.user_id,
                    'full_name': se_user.full_name,
                    'email': se_user.email
                })
                seen_ids.add(se_user.user_id)

        log.debug(f"Site engineers from project assignments: {len(site_engineers)}")

        # FALLBACK: If no SEs found, get SEs associated with project's PMs
        if not site_engineers:
            log.debug("No direct SEs found, checking PMs' associated SEs")

            # Get PM IDs from project (user_id is a JSONB array)
            pm_ids = []
            if project.user_id:
                if isinstance(project.user_id, list):
                    pm_ids = [int(pid) for pid in project.user_id if pid]
                elif isinstance(project.user_id, (int, str)):
                    pm_ids = [int(project.user_id)]

            if pm_ids:
                # Find all SEs that have been assigned by these PMs (across any project)
                pm_assignments = PMAssignSS.query.filter(
                    PMAssignSS.assigned_by_pm_id.in_(pm_ids),
                    PMAssignSS.is_deleted.is_(False)
                ).all()

                # Collect SE IDs from PM assignments (batch fetch)
                pm_se_ids = set()
                for assignment in pm_assignments:
                    if assignment.ss_ids and isinstance(assignment.ss_ids, list):
                        pm_se_ids.update(assignment.ss_ids)
                    if assignment.assigned_to_se_id:
                        pm_se_ids.add(assignment.assigned_to_se_id)

                # Remove already seen IDs and fetch in single query
                pm_se_ids -= seen_ids
                if pm_se_ids:
                    pm_se_users = User.query.filter(
                        User.user_id.in_(pm_se_ids),
                        User.is_deleted.is_(False)
                    ).all()
                    for se_user in pm_se_users:
                        site_engineers.append({
                            'user_id': se_user.user_id,
                            'full_name': se_user.full_name,
                            'email': se_user.email
                        })
                        seen_ids.add(se_user.user_id)

                log.debug(f"After PM fallback: {len(site_engineers)} SEs found")

        log.info(f"Site engineers for project {project_id}: {len(site_engineers)} found")

        return jsonify({
            "success": True,
            "project_id": project_id,
            "project_name": project.project_name,
            "project_code": project.project_code,
            "site_engineers": site_engineers
        }), 200

    except Exception as e:
        log.error(f"Error fetching site engineers for project {project_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch site engineers: {str(e)}"
        }), 500


def complete_po_child_purchase(po_child_id):
    """Mark a POChild purchase as complete"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')
        user_role = current_user.get('role', '').lower()

        data = request.get_json() or {}
        notes = data.get('notes', '')
        intended_recipient = data.get('intended_recipient_name', '')  # Site engineer selected by buyer

        # Get the PO child with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (via parent CR)
        parent_cr = po_child.parent_cr
        if parent_cr and not is_admin and not is_admin_viewing:
            if parent_cr.assigned_to_buyer_user_id != buyer_id:
                return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        if po_child.status != 'vendor_approved':
            return jsonify({"error": f"Purchase cannot be completed. Current status: {po_child.status}"}), 400

        # Update the PO child - Route through Production Manager (M2 Store)
        po_child.status = 'routed_to_store'  # Changed from 'purchase_completed'
        po_child.purchase_completed_by_user_id = buyer_id
        po_child.purchase_completed_by_name = buyer_name
        po_child.purchase_completion_date = datetime.utcnow()
        po_child.updated_at = datetime.utcnow()

        # Set delivery routing fields
        po_child.delivery_routing = 'via_production_manager'
        po_child.store_request_status = 'pending_vendor_delivery'

        # NOTE: Don't commit yet - wait until IMR is also created so they're atomic
        # db.session.commit() - REMOVED to fix bug where POChild status was committed but IMR wasn't created

        # Create Internal Material Requests for Production Manager
        created_imr_count = 0
        materials_to_route = po_child.materials_data

        # CRITICAL FIX: Handle case where materials_data might be a JSON string
        if materials_to_route:
            if isinstance(materials_to_route, str):
                import json
                try:
                    materials_to_route = json.loads(materials_to_route)
                    log.warning(f"POChild {po_child_id} materials_data was string, parsed to list with {len(materials_to_route)} items")
                except json.JSONDecodeError:
                    log.error(f"Failed to parse materials_data string for POChild {po_child_id}")
                    materials_to_route = []

            # Ensure it's a list
            if not isinstance(materials_to_route, list):
                log.error(f"POChild {po_child_id} materials_data is not a list: {type(materials_to_route)}")
                materials_to_route = [materials_to_route] if materials_to_route else []

            log.info(f"POChild {po_child_id}: Processing {len(materials_to_route)} materials for routing to store")

            from models.inventory import InternalMaterialRequest
            # notification_service is already imported at top of file

            # Get project info for the request
            parent_cr = po_child.parent_cr
            project_id = parent_cr.project_id if parent_cr else None
            project = Project.query.get(project_id) if project_id else None
            project_name = project.project_name if project else "Unknown Project"
            final_destination = project.location if project else "Unknown Site"

            # Prepare grouped materials list for single request
            grouped_materials = []
            primary_material_name = None

            for idx, material in enumerate(materials_to_route):
                if isinstance(material, dict):
                    material_name = material.get('sub_item_name') or material.get('material_name', 'Unknown')
                    quantity = material.get('quantity', 0)
                    log.info(f"  Material {idx+1}/{len(materials_to_route)}: {material_name} x {quantity}")

                    grouped_materials.append({
                        'material_name': material_name,
                        'quantity': quantity,
                        'brand': material.get('brand'),
                        'size': material.get('size'),
                        'unit': material.get('unit', '')
                    })
                    if not primary_material_name:
                        primary_material_name = material_name
                else:
                    log.warning(f"  Skipping material {idx+1}: not a dict, type={type(material)}")

            # Create ONE grouped Internal Material Request (not multiple)
            if grouped_materials:
                # Display name shows item category + count
                display_name = po_child.item_name or primary_material_name
                if len(grouped_materials) > 1:
                    display_name = f"{display_name} (+{len(grouped_materials)-1} more)"

                imr = InternalMaterialRequest(
                    cr_id=po_child.parent_cr_id,
                    project_id=project_id,
                    request_buyer_id=buyer_id,
                    material_name=display_name,
                    quantity=len(grouped_materials),  # Number of materials
                    brand=None,
                    size=None,
                    notes=f"From {po_child.get_formatted_id()} - {len(grouped_materials)} material(s) - Vendor delivery expected",
                    source_type='from_vendor_delivery',
                    status='awaiting_vendor_delivery',
                    final_destination_site=final_destination,
                    intended_recipient_name=intended_recipient,
                    routed_by_buyer_id=buyer_id,
                    routed_to_store_at=datetime.utcnow(),
                    po_child_id=po_child.id,  # Link to source POChild
                    materials_data=grouped_materials,  # All materials in JSONB
                    materials_count=len(grouped_materials),
                    request_send=True,
                    created_at=datetime.utcnow(),
                    created_by=buyer_name,
                    last_modified_by=buyer_name
                )
                db.session.add(imr)
                created_imr_count = 1

            db.session.commit()
            log.info(f"POChild {po_child_id}: Created 1 grouped request with {len(grouped_materials)} materials")

            # Notify Production Manager about incoming vendor delivery
            materials_count = len(grouped_materials) if grouped_materials else 0
            if created_imr_count > 0:
                from models.user import User
                from models.role import Role
                pm = User.query.filter(
                    User.role.has(Role.role == 'Production Manager'),
                    User.is_deleted == False
                ).first()
                if pm:
                    notification_service.create_notification(
                        user_id=pm.user_id,
                        title=f"📦 Incoming Vendor Delivery - {project_name}",
                        message=f"{buyer_name} has routed {po_child.get_formatted_id()} with {materials_count} material(s) to M2 Store. Expected destination: {final_destination}",
                        type='vendor_delivery_incoming',
                        link=f'/production-manager/stock-out'
                    )
        else:
            materials_count = 0

        # Check if all PO children for parent CR are completed with eager loading
        all_po_children = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            parent_cr_id=po_child.parent_cr_id,
            is_deleted=False
        ).all()

        all_routed = all(pc.status in ['routed_to_store', 'purchase_completed'] for pc in all_po_children)

        # If all routed to store, update parent CR status
        if all_routed and parent_cr:
            parent_cr.status = 'routed_to_store'
            parent_cr.delivery_routing = 'via_production_manager'
            parent_cr.store_request_status = 'pending_vendor_delivery'
            parent_cr.purchase_completed_by_user_id = buyer_id
            parent_cr.purchase_completed_by_name = buyer_name
            parent_cr.purchase_completion_date = datetime.utcnow()
            parent_cr.updated_at = datetime.utcnow()
            db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Purchase routed to M2 Store successfully! 1 request with {materials_count} material(s) created for Production Manager.",
            "po_child": po_child.to_dict(),
            "all_po_children_completed": all_routed,
            "material_requests_created": 1,
            "materials_count": materials_count,
            "status": "routed_to_store"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing PO child purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to complete purchase: {str(e)}"}), 500


def get_pending_po_children():
    """Get all POChild records pending TD approval"""
    try:
        current_user = g.user
        user_role = current_user.get('role', '').lower()

        # Check if TD or admin
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        if not is_td and not is_admin:
            return jsonify({"error": "Access denied. TD or Admin role required."}), 403

        # Get all POChild records pending TD approval with eager loading
        pending_po_children = POChild.query.options(
            joinedload(POChild.vendor)  # Eager load vendor relationship
        ).filter_by(
            vendor_selection_status='pending_td_approval',
            is_deleted=False
        ).order_by(
            POChild.updated_at.desc().nulls_last(),
            POChild.created_at.desc()
        ).all()

        result = []
        for po_child in pending_po_children:
            # Get parent CR
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id) if po_child.parent_cr_id else None

            # Get project details
            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            # Get BOQ details
            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            # Enrich materials with BOQ prices for comparison
            enriched_materials = []
            po_materials = po_child.materials_data or []

            # Get material vendor selections from parent CR for negotiated prices
            material_vendor_selections = {}
            if parent_cr and parent_cr.material_vendor_selections:
                material_vendor_selections = parent_cr.material_vendor_selections
                log.info(f"📦 POChild {po_child.id}: Parent CR {parent_cr.cr_id} has material_vendor_selections with {len(material_vendor_selections)} materials")
                for key, val in material_vendor_selections.items():
                    neg_price = val.get('negotiated_price') if isinstance(val, dict) else None
                    log.info(f"  - Material: '{key}' → negotiated_price: {neg_price}")
            else:
                log.warning(f"⚠️ POChild {po_child.id}: No material_vendor_selections found for parent CR {parent_cr.cr_id if parent_cr else 'None'}")

            # Get vendor product prices as fallback
            vendor_product_prices = {}
            if po_child.vendor_id:
                from models.vendor import VendorProduct
                vendor_products = VendorProduct.query.filter_by(
                    vendor_id=po_child.vendor_id,
                    is_deleted=False
                ).all()
                for vp in vendor_products:
                    if vp.product_name:
                        vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)
                log.info(f"📦 POChild {po_child.id}: Loaded {len(vendor_product_prices)} vendor products for vendor {po_child.vendor_id}")

            # Build BOQ price lookup - get REAL BOQ prices from BOQ details
            boq_price_lookup = {}

            # First, try to get prices from BOQ details (most accurate)
            boq_id = po_child.boq_id or (parent_cr.boq_id if parent_cr else None)
            if boq_id:
                boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
                if boq_details and boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item in boq_items:
                        for sub_item in item.get('sub_items', []):
                            for boq_mat in sub_item.get('materials', []):
                                mat_name = boq_mat.get('material_name', '').lower().strip()
                                if mat_name:
                                    boq_price_lookup[mat_name] = boq_mat.get('unit_price', 0)

            # Also check parent CR's sub_items_data and materials_data for prices
            # Build separate negotiated price lookup (vendor prices set by buyer)
            negotiated_price_lookup = {}

            if parent_cr:
                sub_items = parent_cr.sub_items_data or []
                for sub in sub_items:
                    mat_name = sub.get('material_name', '').lower().strip()
                    # Get negotiated price (buyer's vendor price) first
                    neg_price = sub.get('negotiated_price') or 0
                    if mat_name and neg_price:
                        negotiated_price_lookup[mat_name] = neg_price

                    # Fallback to BOQ/original price
                    if mat_name and mat_name not in boq_price_lookup:
                        price = sub.get('original_unit_price') or sub.get('unit_price', 0)
                        if price:
                            boq_price_lookup[mat_name] = price

                # Also check materials_data
                materials = parent_cr.materials_data or []
                for mat in materials:
                    mat_name = mat.get('material_name', '').lower().strip()
                    # Get negotiated price first
                    neg_price = mat.get('negotiated_price') or 0
                    if mat_name and neg_price and mat_name not in negotiated_price_lookup:
                        negotiated_price_lookup[mat_name] = neg_price

                    # Fallback to BOQ/original price
                    if mat_name and mat_name not in boq_price_lookup:
                        price = mat.get('original_unit_price') or mat.get('unit_price', 0)
                        if price:
                            boq_price_lookup[mat_name] = price

            for material in po_materials:
                mat_copy = dict(material)
                mat_name = material.get('material_name', '').lower().strip()
                mat_name_original = material.get('material_name', '')
                boq_price = boq_price_lookup.get(mat_name, 0)
                quantity = material.get('quantity', 0)

                # If BOQ price not found by exact name, try partial match
                if not boq_price:
                    for boq_name, price in boq_price_lookup.items():
                        if mat_name in boq_name or boq_name in mat_name:
                            boq_price = price
                            break

                # Check material_vendor_selections for negotiated price (set by buyer)
                log.info(f"🔍 Looking for material: '{mat_name_original}' (lowercase: '{mat_name}')")

                # Try multiple name variations for robust matching
                selection = (material_vendor_selections.get(mat_name_original) or
                           material_vendor_selections.get(mat_name) or
                           material_vendor_selections.get(mat_name.title()) or {})

                # If still not found, try case-insensitive match
                if not selection or not isinstance(selection, dict):
                    for key, val in material_vendor_selections.items():
                        if key.lower() == mat_name:
                            selection = val
                            log.info(f"✓ Found match via case-insensitive search: key='{key}'")
                            break

                negotiated_from_selection = selection.get('negotiated_price') if isinstance(selection, dict) else None
                # ✅ Get supplier notes from vendor selection
                supplier_notes_from_selection = selection.get('supplier_notes', '') if isinstance(selection, dict) else ''

                # Check negotiated_price_lookup from sub_items_data
                negotiated_from_sub_items = negotiated_price_lookup.get(mat_name, 0)

                # Check if material already has negotiated/vendor price directly
                # POChild materials_data already has vendor price in unit_price field (set during creation)
                material_unit_price = material.get('unit_price', 0)
                material_negotiated_price = material.get('negotiated_price', 0)
                material_vendor_price = material.get('vendor_price', 0)

                # Check vendor product catalog
                vendor_product_price = vendor_product_prices.get(mat_name, 0)

                # Priority: selection > sub_items > material negotiated > material vendor > material unit_price > vendor product
                vendor_price = (negotiated_from_selection or
                              negotiated_from_sub_items or
                              material_negotiated_price or
                              material_vendor_price or
                              material_unit_price or
                              vendor_product_price or 0)

                if negotiated_from_selection:
                    log.info(f"✅ Found negotiated price {negotiated_from_selection} for '{mat_name_original}' from material_vendor_selections")
                elif negotiated_from_sub_items:
                    log.info(f"✅ Found negotiated price {negotiated_from_sub_items} for '{mat_name_original}' from sub_items_data")
                elif material_negotiated_price:
                    log.info(f"✅ Found negotiated price {material_negotiated_price} for '{mat_name_original}' from material.negotiated_price")
                elif material_vendor_price:
                    log.info(f"✅ Found vendor price {material_vendor_price} for '{mat_name_original}' from material.vendor_price")
                elif material_unit_price:
                    log.info(f"✅ Using unit_price {material_unit_price} for '{mat_name_original}' from material.unit_price (may be vendor or BOQ)")
                elif vendor_product_price:
                    log.info(f"✅ Found vendor product price {vendor_product_price} for '{mat_name_original}' from vendor catalog")
                else:
                    log.warning(f"❌ No vendor price found for '{mat_name_original}'")

                # ALWAYS set BOQ price for reference (even if vendor price exists)
                mat_copy['boq_unit_price'] = boq_price
                mat_copy['boq_total_price'] = boq_price * quantity if boq_price else 0

                # Use vendor/negotiated price if available, otherwise BOQ price
                # CRITICAL: vendor_price may come from multiple sources (see priority above)
                if vendor_price and vendor_price > 0:
                    # Vendor negotiated price found - use it
                    mat_copy['unit_price'] = vendor_price
                    mat_copy['total_price'] = vendor_price * quantity
                    mat_copy['negotiated_price'] = vendor_price
                    log.info(f"✓ Set vendor price {vendor_price} for '{mat_name_original}' (BOQ: {boq_price})")
                elif boq_price and boq_price > 0:
                    # No vendor price - fallback to BOQ price
                    mat_copy['unit_price'] = boq_price
                    mat_copy['total_price'] = boq_price * quantity
                    mat_copy['negotiated_price'] = None  # No negotiation happened
                    log.info(f"ℹ Set BOQ price {boq_price} for '{mat_name_original}' (no vendor price)")
                else:
                    # No prices found at all - this shouldn't happen
                    mat_copy['unit_price'] = material.get('unit_price', 0)  # Keep original if any
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity if mat_copy['unit_price'] else 0
                    mat_copy['negotiated_price'] = None
                    log.warning(f"⚠ No BOQ or vendor price found for '{mat_name_original}', using stored unit_price: {mat_copy['unit_price']}")

                # Ensure total_price is calculated if unit_price exists but total_price is missing
                if mat_copy.get('unit_price') and (not mat_copy.get('total_price') or mat_copy.get('total_price') == 0):
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity

                # ✅ Add supplier notes - prioritize selection, then preserve existing material notes
                # CRITICAL FIX: Material may already have supplier_notes from POChild creation
                existing_supplier_notes = material.get('supplier_notes', '')
                final_supplier_notes = supplier_notes_from_selection or existing_supplier_notes

                if final_supplier_notes:
                    mat_copy['supplier_notes'] = final_supplier_notes
                    source = "vendor_selection" if supplier_notes_from_selection else "po_material_data"
                    log.info(f"✅ Added supplier notes for '{mat_name_original}' from {source}: {final_supplier_notes[:50]}...")
                else:
                    mat_copy['supplier_notes'] = ''  # Ensure field exists even if empty

                enriched_materials.append(mat_copy)

            # Recalculate total cost from enriched materials
            enriched_total_cost = sum(m.get('total_price', 0) for m in enriched_materials)

            po_dict = po_child.to_dict()
            po_dict['materials'] = enriched_materials  # Override with enriched materials
            po_dict['materials_total_cost'] = enriched_total_cost  # Override with recalculated total

            result.append({
                **po_dict,
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                # ✅ Include parent CR's material_vendor_selections for vendor comparison display
                'material_vendor_selections': material_vendor_selections,

                # ✅ Frontend compatibility fields (ChangeRequestDetailsModal expects these)
                'selected_vendor_id': po_child.vendor_id,  # Frontend checks for this field
                'selected_vendor_name': po_child.vendor_name,  # Frontend displays this
                'requested_by_name': parent_cr.requested_by_name if parent_cr else None,  # Original CR requester (PM/SE)
                'requested_by_role': parent_cr.requested_by_role if parent_cr else None,  # Original requester role

                # ✅ Include justification from parent CR
                'justification': parent_cr.justification if parent_cr else None,

                # ✅ Include vendor selection tracking
                'vendor_selected_by_buyer_name': po_child.vendor_selected_by_buyer_name,
                'vendor_selection_date': po_child.vendor_selection_date.isoformat() if po_child.vendor_selection_date else None,

                # ✅ Include material_vendor_selections from parent CR for competitor comparison
                'material_vendor_selections': parent_cr.material_vendor_selections if parent_cr and parent_cr.material_vendor_selections else {},
            })

        return jsonify({
            "success": True,
            "pending_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching pending PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending PO children: {str(e)}"}), 500


def get_rejected_po_children():
    """Get all POChild records rejected by TD"""
    try:
        from sqlalchemy import or_

        current_user = g.user
        user_role = current_user.get('role', '').lower()

        # Check if TD or admin
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        if not is_td and not is_admin:
            return jsonify({"error": "Access denied. TD or Admin role required."}), 403

        # Get all POChild records rejected by TD with eager loading
        rejected_po_children = POChild.query.options(
            joinedload(POChild.vendor)  # Eager load vendor relationship
        ).filter(
            or_(
                POChild.vendor_selection_status == 'td_rejected',
                POChild.vendor_selection_status == 'rejected',
                POChild.status == 'td_rejected'
            ),
            POChild.is_deleted == False
        ).order_by(
            POChild.updated_at.desc().nulls_last(),
            POChild.created_at.desc()
        ).all()

        result = []
        for po_child in rejected_po_children:
            # Get parent CR
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id) if po_child.parent_cr_id else None

            # Get project details
            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            # Get BOQ details
            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            # Enrich materials with prices from BOQ AND negotiated prices
            enriched_materials = []
            po_materials = po_child.materials_data or []

            # Get material vendor selections from parent CR for negotiated prices
            material_vendor_selections = {}
            if parent_cr and parent_cr.material_vendor_selections:
                material_vendor_selections = parent_cr.material_vendor_selections

            # Get vendor product prices as fallback
            vendor_product_prices = {}
            if po_child.vendor_id:
                from models.vendor import VendorProduct
                vendor_products = VendorProduct.query.filter_by(
                    vendor_id=po_child.vendor_id,
                    is_deleted=False
                ).all()
                for vp in vendor_products:
                    if vp.product_name:
                        vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)

            # Build BOQ price lookup
            boq_price_lookup = {}
            boq_id = po_child.boq_id or (parent_cr.boq_id if parent_cr else None)
            if boq_id:
                boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
                if boq_details and boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item in boq_items:
                        for sub_item in item.get('sub_items', []):
                            for boq_mat in sub_item.get('materials', []):
                                mat_name = boq_mat.get('material_name', '').lower().strip()
                                if mat_name:
                                    boq_price_lookup[mat_name] = boq_mat.get('unit_price', 0)

            for material in po_materials:
                mat_copy = dict(material)
                mat_name = material.get('material_name', '').lower().strip()
                mat_name_original = material.get('material_name', '')
                boq_price = boq_price_lookup.get(mat_name, 0)
                quantity = material.get('quantity', 0)

                # Check material_vendor_selections for negotiated price
                selection = (material_vendor_selections.get(mat_name_original) or
                           material_vendor_selections.get(mat_name) or {})
                if not selection or not isinstance(selection, dict):
                    for key, val in material_vendor_selections.items():
                        if key.lower() == mat_name:
                            selection = val
                            break

                negotiated_price = selection.get('negotiated_price') if isinstance(selection, dict) else None
                # ✅ Get supplier notes from vendor selection
                supplier_notes = selection.get('supplier_notes', '') if isinstance(selection, dict) else ''

                # Check vendor product catalog
                vendor_product_price = vendor_product_prices.get(mat_name, 0)

                # Priority: negotiated > material fields > material unit_price > vendor product
                vendor_price = (negotiated_price or
                              material.get('negotiated_price') or
                              material.get('vendor_price') or
                              material.get('unit_price') or
                              vendor_product_price or 0)

                # ALWAYS set BOQ price for reference
                mat_copy['boq_unit_price'] = boq_price
                mat_copy['boq_total_price'] = boq_price * quantity if boq_price else 0

                # CRITICAL FIX: For rejected PO children, ALWAYS use vendor price stored in material
                # Do NOT fall back to BOQ price - the material.unit_price contains the vendor price
                if vendor_price and vendor_price > 0:
                    mat_copy['unit_price'] = vendor_price
                    mat_copy['total_price'] = vendor_price * quantity
                    mat_copy['negotiated_price'] = vendor_price
                else:
                    # If no vendor price found, use stored unit_price (should be vendor price)
                    # Only use BOQ price as absolute last resort for display reference
                    stored_unit_price = material.get('unit_price', 0)
                    mat_copy['unit_price'] = stored_unit_price if stored_unit_price > 0 else boq_price
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity if mat_copy['unit_price'] else 0
                    mat_copy['negotiated_price'] = stored_unit_price if stored_unit_price > 0 else None

                # Ensure total_price is calculated
                if mat_copy.get('unit_price') and (not mat_copy.get('total_price') or mat_copy.get('total_price') == 0):
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity

                # ✅ Add supplier notes from vendor selection if available
                if supplier_notes:
                    mat_copy['supplier_notes'] = supplier_notes

                enriched_materials.append(mat_copy)

            # Recalculate total cost from enriched materials
            enriched_total_cost = sum(m.get('total_price', 0) for m in enriched_materials)

            po_dict = po_child.to_dict()
            po_dict['materials'] = enriched_materials
            po_dict['materials_total_cost'] = enriched_total_cost

            result.append({
                **po_dict,
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                # ✅ Include parent CR's material_vendor_selections for vendor comparison display
                'material_vendor_selections': material_vendor_selections,

                # ✅ Frontend compatibility fields (ChangeRequestDetailsModal expects these)
                'selected_vendor_id': po_child.vendor_id,
                'selected_vendor_name': po_child.vendor_name,
                'requested_by_name': parent_cr.requested_by_name if parent_cr else None,
                'requested_by_role': parent_cr.requested_by_role if parent_cr else None,

                # ✅ Include justification from parent CR
                'justification': parent_cr.justification if parent_cr else None,

                # ✅ Include vendor selection tracking
                'vendor_selected_by_buyer_name': po_child.vendor_selected_by_buyer_name,
                'vendor_selection_date': po_child.vendor_selection_date.isoformat() if po_child.vendor_selection_date else None,

                # ✅ Include material_vendor_selections from parent CR for competitor comparison
                'material_vendor_selections': parent_cr.material_vendor_selections if parent_cr and parent_cr.material_vendor_selections else {},
            })

        return jsonify({
            "success": True,
            "rejected_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching rejected PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch rejected PO children: {str(e)}"}), 500


def get_buyer_pending_po_children():
    """Get POChild records pending TD approval for the current buyer"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role_name', current_user.get('role', '')).lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        if user_role == 'admin':
            is_admin_viewing = True

        # DEBUG: Log the user info
        log.info(f"🔍 get_buyer_pending_po_children called by user_id={user_id}, role={user_role}, is_admin_viewing={is_admin_viewing}")

        # Get POChildren where parent CR is assigned to this buyer and pending TD approval
        if is_admin_viewing:
            pending_po_children = POChild.query.options(
                joinedload(POChild.vendor)  # Eager load vendor relationship
            ).filter(
                POChild.vendor_selection_status == 'pending_td_approval',
                POChild.is_deleted == False
            ).order_by(
                POChild.updated_at.desc().nulls_last(),
                POChild.created_at.desc()
            ).all()
        else:
            pending_po_children = POChild.query.options(
                joinedload(POChild.vendor)  # Eager load vendor relationship
            ).join(
                ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
            ).filter(
                POChild.vendor_selection_status == 'pending_td_approval',
                POChild.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id == user_id
            ).order_by(
                POChild.updated_at.desc().nulls_last(),
                POChild.created_at.desc()
            ).all()

        # DEBUG: Log query results
        log.info(f"🔍 Found {len(pending_po_children)} POChildren pending TD approval for buyer {user_id}")
        for poc in pending_po_children:
            parent_cr = ChangeRequest.query.get(poc.parent_cr_id) if poc.parent_cr_id else None
            assigned_buyer = parent_cr.assigned_to_buyer_user_id if parent_cr else None
            log.info(f"  - POChild ID={poc.id}, formatted_id={poc.get_formatted_id()}, parent_cr_id={poc.parent_cr_id}, vendor={poc.vendor_name}, vendor_selection_status={poc.vendor_selection_status}, assigned_buyer={assigned_buyer}")

        result = []
        for po_child in pending_po_children:
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id) if po_child.parent_cr_id else None

            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            # Enrich materials with prices from BOQ
            enriched_materials = []
            po_materials = po_child.materials_data or []

            # Get material vendor selections from parent CR for negotiated prices
            material_vendor_selections = {}
            if parent_cr and parent_cr.material_vendor_selections:
                material_vendor_selections = parent_cr.material_vendor_selections

            # Build BOQ price lookup
            boq_price_lookup = {}
            boq_id_for_lookup = po_child.boq_id or (parent_cr.boq_id if parent_cr else None)
            if boq_id_for_lookup:
                boq_details = BOQDetails.query.filter_by(boq_id=boq_id_for_lookup, is_deleted=False).first()
                if boq_details and boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item in boq_items:
                        for sub_item in item.get('sub_items', []):
                            for boq_mat in sub_item.get('materials', []):
                                mat_name = boq_mat.get('material_name', '').lower().strip()
                                if mat_name:
                                    boq_price_lookup[mat_name] = boq_mat.get('unit_price', 0)

            for material in po_materials:
                mat_copy = dict(material)
                mat_name = material.get('material_name', '').lower().strip()
                mat_name_original = material.get('material_name', '')
                boq_price = boq_price_lookup.get(mat_name, 0)
                quantity = material.get('quantity', 0)

                # Get supplier notes from material_vendor_selections
                selection = (material_vendor_selections.get(mat_name_original) or
                           material_vendor_selections.get(mat_name) or {})
                if not selection or not isinstance(selection, dict):
                    for key, val in material_vendor_selections.items():
                        if key.lower() == mat_name:
                            selection = val
                            break

                supplier_notes = selection.get('supplier_notes', '') if isinstance(selection, dict) else ''
                if supplier_notes:
                    log.info(f"✅ Buyer POChild: Found supplier notes for '{mat_name_original}': {supplier_notes[:50]}...")

                # If unit_price is 0 or missing, use BOQ price as fallback
                if not mat_copy.get('unit_price') or mat_copy.get('unit_price') == 0:
                    mat_copy['unit_price'] = boq_price
                    mat_copy['total_price'] = boq_price * quantity if boq_price else 0

                # Ensure total_price is calculated
                if mat_copy.get('unit_price') and (not mat_copy.get('total_price') or mat_copy.get('total_price') == 0):
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity

                # ✅ Add supplier notes from vendor selection if available
                if supplier_notes:
                    mat_copy['supplier_notes'] = supplier_notes
                    log.info(f"✅ [get_approved_po_children] Added supplier notes to material '{mat_name_original}': {supplier_notes[:50]}...")
                else:
                    # Ensure supplier_notes field exists even if empty (for frontend consistency)
                    mat_copy['supplier_notes'] = ''
                    log.info(f"⚠️ [get_approved_po_children] No supplier notes for material '{mat_name_original}'")

                enriched_materials.append(mat_copy)

            # Recalculate total cost from enriched materials
            enriched_total_cost = sum(m.get('total_price', 0) for m in enriched_materials)

            po_dict = po_child.to_dict()
            po_dict['materials'] = enriched_materials
            po_dict['materials_total_cost'] = enriched_total_cost

            result.append({
                **po_dict,
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                # ✅ Include parent CR's material_vendor_selections for vendor comparison display
                'material_vendor_selections': material_vendor_selections,

                # ✅ Frontend compatibility fields (ChangeRequestDetailsModal expects these)
                'selected_vendor_id': po_child.vendor_id,
                'selected_vendor_name': po_child.vendor_name,
                'requested_by_name': parent_cr.requested_by_name if parent_cr else None,
                'requested_by_role': parent_cr.requested_by_role if parent_cr else None,

                # ✅ Include justification from parent CR
                'justification': parent_cr.justification if parent_cr else None,

                # ✅ Include vendor selection tracking
                'vendor_selected_by_buyer_name': po_child.vendor_selected_by_buyer_name,
                'vendor_selection_date': po_child.vendor_selection_date.isoformat() if po_child.vendor_selection_date else None,

                # ✅ Include material_vendor_selections from parent CR for competitor comparison
                'material_vendor_selections': parent_cr.material_vendor_selections if parent_cr and parent_cr.material_vendor_selections else {},
            })

        return jsonify({
            "success": True,
            "pending_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer pending PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending PO children: {str(e)}"}), 500


def get_approved_po_children():
    """Get all POChild records with approved vendor selection (for buyer to complete purchase)"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role_name', current_user.get('role', '')).lower()

        log.info(f"get_approved_po_children called by user {user_id}, role: '{user_role}'")

        # Check roles
        is_buyer = user_role == 'buyer'
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        log.info(f"Role check: is_buyer={is_buyer}, is_td={is_td}, is_admin={is_admin}")

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        if user_role == 'admin':
            is_admin_viewing = True

        if not is_buyer and not is_td and not is_admin:
            return jsonify({"error": "Access denied. Buyer, TD, or Admin role required."}), 403

        # Get all POChild records with approved vendor selection (not yet completed) with eager loading
        approved_po_children = POChild.query.options(
            joinedload(POChild.vendor)  # Eager load vendor relationship
        ).filter(
            POChild.vendor_selection_status == 'approved',
            ~POChild.status.in_(['purchase_completed', 'routed_to_store']),
            POChild.is_deleted == False
        ).order_by(
            POChild.updated_at.desc().nulls_last(),
            POChild.created_at.desc()
        ).all()

        log.info(f"Found {len(approved_po_children)} approved PO children in database")

        result = []
        for po_child in approved_po_children:
            # Get parent CR to check buyer assignment
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id)

            # For buyer, only show PO children for CRs assigned to them (unless admin viewing)
            if is_buyer and not is_admin_viewing:
                if not parent_cr or parent_cr.assigned_to_buyer_user_id != user_id:
                    continue

            # Get project details
            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            # Get BOQ details
            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            # Get vendor details for phone/email
            vendor_phone = None
            vendor_email = None
            if po_child.vendor_id:
                vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id, is_deleted=False).first()
                if vendor:
                    vendor_phone = vendor.phone
                    vendor_email = vendor.email

            # Enrich materials with prices from BOQ AND negotiated prices
            enriched_materials = []
            po_materials = po_child.materials_data or []

            # Get material vendor selections from parent CR for negotiated prices
            material_vendor_selections = {}
            if parent_cr and parent_cr.material_vendor_selections:
                material_vendor_selections = parent_cr.material_vendor_selections

            # Get vendor product prices as fallback
            vendor_product_prices = {}
            if po_child.vendor_id:
                from models.vendor import VendorProduct
                vendor_products = VendorProduct.query.filter_by(
                    vendor_id=po_child.vendor_id,
                    is_deleted=False
                ).all()
                for vp in vendor_products:
                    if vp.product_name:
                        vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)

            # Build BOQ price lookup
            boq_price_lookup = {}
            boq_id_for_lookup = po_child.boq_id or (parent_cr.boq_id if parent_cr else None)
            if boq_id_for_lookup:
                boq_details = BOQDetails.query.filter_by(boq_id=boq_id_for_lookup, is_deleted=False).first()
                if boq_details and boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item in boq_items:
                        for sub_item in item.get('sub_items', []):
                            for boq_mat in sub_item.get('materials', []):
                                mat_name = boq_mat.get('material_name', '').lower().strip()
                                if mat_name:
                                    boq_price_lookup[mat_name] = boq_mat.get('unit_price', 0)

            for material in po_materials:
                mat_copy = dict(material)
                mat_name = material.get('material_name', '').lower().strip()
                mat_name_original = material.get('material_name', '')
                boq_price = boq_price_lookup.get(mat_name, 0)
                quantity = material.get('quantity', 0)

                # Check material_vendor_selections for negotiated price
                selection = (material_vendor_selections.get(mat_name_original) or
                           material_vendor_selections.get(mat_name) or {})
                if not selection or not isinstance(selection, dict):
                    for key, val in material_vendor_selections.items():
                        if key.lower() == mat_name:
                            selection = val
                            break

                negotiated_price = selection.get('negotiated_price') if isinstance(selection, dict) else None
                # ✅ Get supplier notes from vendor selection
                supplier_notes = selection.get('supplier_notes', '') if isinstance(selection, dict) else ''

                # Check vendor product catalog
                vendor_product_price = vendor_product_prices.get(mat_name, 0)

                # Priority: negotiated > material fields > material unit_price > vendor product
                vendor_price = (negotiated_price or
                              material.get('negotiated_price') or
                              material.get('vendor_price') or
                              material.get('unit_price') or
                              vendor_product_price or 0)

                # ALWAYS set BOQ price for reference
                mat_copy['boq_unit_price'] = boq_price
                mat_copy['boq_total_price'] = boq_price * quantity if boq_price else 0

                # CRITICAL FIX: For approved PO children, ALWAYS use vendor price stored in material
                # Do NOT fall back to BOQ price when vendor has been approved by TD
                # The material.unit_price contains the TD-approved vendor price
                if vendor_price and vendor_price > 0:
                    mat_copy['unit_price'] = vendor_price
                    mat_copy['total_price'] = vendor_price * quantity
                    mat_copy['negotiated_price'] = vendor_price
                else:
                    # If no vendor price found, use stored unit_price (should be vendor price)
                    # Only use BOQ price as absolute last resort for display reference
                    stored_unit_price = material.get('unit_price', 0)
                    mat_copy['unit_price'] = stored_unit_price if stored_unit_price > 0 else boq_price
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity if mat_copy['unit_price'] else 0
                    mat_copy['negotiated_price'] = stored_unit_price if stored_unit_price > 0 else None

                # Ensure total_price is calculated
                if mat_copy.get('unit_price') and (not mat_copy.get('total_price') or mat_copy.get('total_price') == 0):
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity

                # ✅ Add supplier notes from vendor selection if available
                if supplier_notes:
                    mat_copy['supplier_notes'] = supplier_notes

                enriched_materials.append(mat_copy)

            # Recalculate total cost from enriched materials
            enriched_total_cost = sum(m.get('total_price', 0) for m in enriched_materials)

            po_dict = po_child.to_dict()
            po_dict['materials'] = enriched_materials
            po_dict['materials_total_cost'] = enriched_total_cost

            result.append({
                **po_dict,
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                'vendor_phone': vendor_phone,
                'vendor_email': vendor_email,

                # ✅ Frontend compatibility fields (ChangeRequestDetailsModal expects these)
                'selected_vendor_id': po_child.vendor_id,
                'selected_vendor_name': po_child.vendor_name,
                'requested_by_name': parent_cr.requested_by_name if parent_cr else None,
                'requested_by_role': parent_cr.requested_by_role if parent_cr else None,

                # ✅ Include justification from parent CR
                'justification': parent_cr.justification if parent_cr else None,

                # ✅ Include vendor selection tracking
                'vendor_selected_by_buyer_name': po_child.vendor_selected_by_buyer_name,
                'vendor_selection_date': po_child.vendor_selection_date.isoformat() if po_child.vendor_selection_date else None,

                # ✅ Include material_vendor_selections from parent CR for competitor comparison
                'material_vendor_selections': parent_cr.material_vendor_selections if parent_cr and parent_cr.material_vendor_selections else {},
            })

        log.info(f"Returning {len(result)} approved PO children to user {user_id} (role: {user_role})")

        return jsonify({
            "success": True,
            "approved_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching approved PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch approved PO children: {str(e)}"}), 500


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

        print(f"\n{'='*60}")
        print(f"=== WHATSAPP SEND REQUEST RECEIVED ===")
        print(f"cr_id: {cr_id}")
        print(f"vendor_phone: {vendor_phone}")
        print(f"include_lpo_pdf: {include_lpo_pdf}")
        print(f"po_child_id: {po_child_id}")
        print(f"lpo_data provided: {lpo_data is not None}")
        print(f"{'='*60}\n")

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

        print(f"\n=== PDF GENERATION CHECK ===")
        print(f"include_lpo_pdf value: {include_lpo_pdf}")
        print(f"include_lpo_pdf type: {type(include_lpo_pdf)}")

        if include_lpo_pdf:
            print(f">>> ENTERING PDF GENERATION BLOCK")
            try:
                print(f">>> Importing LPOPDFGenerator...")
                from utils.lpo_pdf_generator import LPOPDFGenerator
                print(f">>> Importing SystemSettings...")
                from models.system_settings import SystemSettings
                print(f">>> Importing LPOCustomization...")
                from models.lpo_customization import LPOCustomization
                print(f">>> All imports successful!")

                print(f"\n=== PDF GENERATION DEBUG ===")
                print(f"include_lpo_pdf: {include_lpo_pdf}")
                print(f"po_child: {po_child}")
                print(f"po_child_id: {po_child_id}")
                print(f"cr_id: {cr_id}")
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

                print(f">>> Creating LPOPDFGenerator...")
                generator = LPOPDFGenerator()
                print(f">>> Generating PDF bytes...")
                pdf_bytes = generator.generate_lpo_pdf(lpo_data)
                print(f">>> PDF generated successfully, size: {len(pdf_bytes)} bytes")
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

                print(f">>> Uploading PDF to Supabase: {pdf_path}")
                print(f">>> SUPABASE_BUCKET: {SUPABASE_BUCKET}")

                # Try to use service role key to bypass RLS for server-side uploads
                from supabase import create_client as create_supabase_client
                upload_supabase_url = os.environ.get('DEV_SUPABASE_URL') if environment == 'development' else os.environ.get('SUPABASE_URL')
                # Try service role key first (bypasses RLS), fallback to anon key
                service_role_key = os.environ.get('DEV_SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
                if service_role_key:
                    upload_supabase_key = service_role_key
                    print(f">>> Using SERVICE ROLE KEY (bypasses RLS)")
                else:
                    upload_supabase_key = os.environ.get('DEV_SUPABASE_KEY') if environment == 'development' else os.environ.get('SUPABASE_KEY')
                    print(f">>> Using ANON KEY (subject to RLS)")
                print(f">>> Using Supabase URL: {upload_supabase_url}")

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
                print(f">>> Upload result: {upload_result}")

                # Get public URL
                pdf_url = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(pdf_path)
                print(f">>> PDF URL generated: {pdf_url}")
                log.debug(f"PDF uploaded and URL generated")

            except Exception as e:
                print(f"\n!!! PDF GENERATION ERROR !!!")
                print(f"Error: {str(e)}")
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
                log.error(f"Error in PDF generation/upload: {str(e)}")
                log.error(f"Traceback: {traceback.format_exc()}")
                # Rollback any failed database transaction
                try:
                    db.session.rollback()
                except:
                    pass
                # Continue without PDF
        else:
            print(f">>> SKIPPING PDF GENERATION: include_lpo_pdf is {include_lpo_pdf}")

        print(f"\n=== PRE-WHATSAPP: pdf_url = {pdf_url} ===")

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


def get_se_boq_assignments():
    """Get all BOQ material assignments from Site Engineer for current buyer"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment

        current_user = g.user
        buyer_id = current_user['user_id']

        # Get all assignments for this buyer
        assignments = BOQMaterialAssignment.query.filter(
            BOQMaterialAssignment.assigned_to_buyer_user_id == buyer_id,
            BOQMaterialAssignment.is_deleted == False
        ).order_by(BOQMaterialAssignment.created_at.desc()).all()

        assignments_list = []
        for assignment in assignments:
            # Get BOQ and project details
            boq = BOQ.query.filter_by(boq_id=assignment.boq_id, is_deleted=False).first()
            project = Project.query.filter_by(project_id=assignment.project_id, is_deleted=False).first()

            if not boq or not project:
                continue

            # Get BOQ details for overhead calculation
            boq_detail = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

            # Calculate overhead/miscellaneous from BOQ details
            overhead_allocated = 0.0
            overhead_percentage = 0.0
            base_total_for_overhead = 0.0

            if boq_detail and boq_detail.boq_details:
                boq_details_json = boq_detail.boq_details
                items = boq_details_json.get('items', [])

                # Calculate total base from all items
                for item in items:
                    sub_items = item.get('sub_items', [])

                    # Support both old and new BOQ structures
                    if (item.get('has_sub_items') and sub_items) or (sub_items and len(sub_items) > 0):
                        # Sum up base_total from all sub-items
                        for sub_item in sub_items:
                            # Try different fields for base total
                            base_total = float(sub_item.get('base_total', 0) or sub_item.get('internal_cost', 0) or 0)
                            quantity = float(sub_item.get('quantity', 1))
                            # base_total is already calculated per quantity in BOQ structure
                            base_total_for_overhead += base_total

                    # Get overhead percentage from item
                    if overhead_percentage == 0:
                        overhead_percentage = float(item.get('overhead_percentage', 0) or item.get('miscellaneous_percentage', 0) or item.get('misc_percentage', 0) or 0)

                # Calculate overhead amount
                if overhead_percentage > 0 and base_total_for_overhead > 0:
                    overhead_allocated = (base_total_for_overhead * overhead_percentage) / 100

            # Get BOQ materials from BOQ details JSONB
            materials_list = []
            total_cost = 0

            if boq_detail and boq_detail.boq_details:
                boq_details_json = boq_detail.boq_details
                items = boq_details_json.get('items', [])

                # Extract materials from all items and sub-items
                for item in items:
                    # Check both has_sub_items flag AND if sub_items array exists and has items
                    sub_items = item.get('sub_items', [])

                    # Support both old and new BOQ structures
                    if (item.get('has_sub_items') and sub_items) or (sub_items and len(sub_items) > 0):
                        for sub_item in sub_items:
                            # Get materials from sub-item
                            materials = sub_item.get('materials', [])
                            for material in materials:
                                material_total = float(material.get('total_price', 0) or 0)
                                total_cost += material_total
                                materials_list.append({
                                    'material_name': material.get('material_name', ''),
                                    'sub_item_name': sub_item.get('sub_item_name', ''),
                                    'item_name': item.get('item_name', ''),
                                    'quantity': float(material.get('quantity', 0) or 0),
                                    'unit': material.get('unit', ''),
                                    'unit_price': float(material.get('unit_price', 0) or 0),
                                    'total_price': material_total
                                })

            # Get vendor info if selected
            vendor_info = None
            if assignment.selected_vendor_id:
                vendor = Vendor.query.filter_by(vendor_id=assignment.selected_vendor_id).first()
                if vendor:
                    vendor_info = {
                        'vendor_id': vendor.vendor_id,
                        'company_name': vendor.company_name,
                        'email': vendor.email,
                        'phone': vendor.phone
                    }

            assignment_data = assignment.to_dict()
            assignment_data.update({
                'boq': {
                    'boq_id': boq.boq_id,
                    'boq_name': boq.boq_name
                },
                'project': {
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'client': project.client,
                    'location': project.location
                },
                'materials': materials_list,
                'total_cost': round(total_cost, 2),
                'overhead_allocated': round(overhead_allocated, 2),
                'overhead_percentage': round(overhead_percentage, 2),
                'base_total': round(base_total_for_overhead, 2),
                'vendor': vendor_info
            })
            assignments_list.append(assignment_data)

        return jsonify({
            "success": True,
            "assignments": assignments_list,
            "count": len(assignments_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching SE BOQ assignments: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch assignments: {str(e)}"}), 500


def select_vendor_for_se_boq(assignment_id):
    """Buyer selects vendor for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQHistory, BOQ
        from models.project import Project

        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_id = data.get('vendor_id')

        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        # Get assignment - TD/Admin can select for any assignment, Buyer only for their own
        if user_role in ['technicaldirector', 'admin']:
            assignment = BOQMaterialAssignment.query.filter_by(
                assignment_id=assignment_id,
                is_deleted=False
            ).first()
        else:
            assignment = BOQMaterialAssignment.query.filter_by(
                assignment_id=assignment_id,
                assigned_to_buyer_user_id=user_id,
                is_deleted=False
            ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        # Verify vendor exists
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Update assignment with vendor selection
        assignment.selected_vendor_id = vendor_id
        assignment.selected_vendor_name = vendor.company_name
        assignment.vendor_selected_by_buyer_id = user_id
        assignment.vendor_selected_by_buyer_name = user_name
        assignment.vendor_selection_date = datetime.utcnow()
        assignment.vendor_selection_status = 'pending_td_approval'
        assignment.updated_at = datetime.utcnow()

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=assignment.boq_id).first()
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id).first()
        project = Project.query.filter_by(project_id=assignment.project_id).first()

        # Handle existing actions
        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Create new action
        action_role = user_role if user_role in ['buyer', 'technicaldirector', 'admin'] else 'buyer'
        new_action = {
            "role": action_role,
            "type": "vendor_selected_for_se_boq" if user_role == 'buyer' else "vendor_changed_for_se_boq",
            "sender": action_role,
            "receiver": "technical_director",
            "status": "pending_td_approval",
            "boq_name": boq.boq_name if boq else '',
            "project_name": project.project_name if project else '',
            "vendor_name": vendor.company_name,
            "comments": f"{user_name} selected vendor {vendor.company_name} for SE BOQ assignment",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": user_name,
            "sender_user_id": user_id,
            "assignment_id": assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=assignment.boq_id,
                action=current_actions,
                action_by=user_name,
                boq_status=boq.status if boq else '',
                sender=user_name,
                receiver='Technical Director',
                comments=f"Vendor {vendor.company_name} selected, pending TD approval",
                sender_role=action_role,
                receiver_role='technical_director',
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Vendor {vendor.company_name} selected. Awaiting TD approval.",
            "vendor_selection_status": "pending_td_approval"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting vendor for SE BOQ: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to select vendor: {str(e)}"}), 500


def td_approve_vendor_for_se_boq(assignment_id):
    """Technical Director approves vendor selection for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQHistory, BOQ

        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Technical Director')

        # Get assignment
        assignment = BOQMaterialAssignment.query.filter_by(
            assignment_id=assignment_id,
            is_deleted=False
        ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        if assignment.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": "No pending vendor approval"}), 400

        # Approve vendor selection
        assignment.vendor_selection_status = 'approved'
        assignment.vendor_approved_by_td_id = td_id
        assignment.vendor_approved_by_td_name = td_name
        assignment.vendor_approval_date = datetime.utcnow()
        assignment.vendor_rejection_reason = None
        assignment.updated_at = datetime.utcnow()

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=assignment.boq_id).first()
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id).first()

        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        new_action = {
            "role": "technical_director",
            "type": "vendor_approved_for_se_boq",
            "sender": "technical_director",
            "receiver": "buyer",
            "status": "approved",
            "boq_name": boq.boq_name if boq else '',
            "vendor_name": assignment.selected_vendor_name,
            "comments": f"TD approved vendor {assignment.selected_vendor_name}",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": td_name,
            "sender_user_id": td_id,
            "assignment_id": assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=assignment.boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=boq.status if boq else '',
                sender=td_name,
                receiver=assignment.assigned_to_buyer_name,
                comments=f"Vendor {assignment.selected_vendor_name} approved",
                sender_role='technical_director',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notifications to buyer and site engineer about vendor approval
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Notify buyer
            if assignment.assigned_to_buyer_id:
                buyer_notification = NotificationManager.create_notification(
                    user_id=assignment.assigned_to_buyer_id,
                    type='approval',
                    title='SE BOQ Vendor Approved',
                    message=f'TD approved vendor "{assignment.selected_vendor_name}" for SE BOQ materials',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/purchase-orders?assignment_id={assignment_id}',
                    action_label='Proceed with Purchase',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'vendor_name': assignment.selected_vendor_name,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(assignment.assigned_to_buyer_id, buyer_notification.to_dict())

            # Notify site engineer
            if assignment.site_engineer_id:
                se_notification = NotificationManager.create_notification(
                    user_id=assignment.site_engineer_id,
                    type='info',
                    title='BOQ Vendor Approved',
                    message=f'TD approved vendor "{assignment.selected_vendor_name}" for your BOQ materials',
                    priority='medium',
                    category='vendor',
                    action_url=f'/site-engineer/boq/{assignment.boq_id}',
                    action_label='View BOQ',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'vendor_name': assignment.selected_vendor_name,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(assignment.site_engineer_id, se_notification.to_dict())

        except Exception as notif_error:
            log.error(f"Failed to send SE BOQ vendor approval notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection approved successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving vendor for SE BOQ: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to approve vendor: {str(e)}"}), 500


def td_reject_vendor_for_se_boq(assignment_id):
    """Technical Director rejects vendor selection for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQHistory, BOQ

        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Technical Director')

        data = request.get_json()
        rejection_reason = data.get('rejection_reason', '')

        # Get assignment
        assignment = BOQMaterialAssignment.query.filter_by(
            assignment_id=assignment_id,
            is_deleted=False
        ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        if assignment.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": "No pending vendor approval"}), 400

        # Store rejected vendor name for history
        rejected_vendor_name = assignment.selected_vendor_name

        # Reject vendor selection - clear vendor data
        assignment.vendor_selection_status = 'rejected'
        assignment.vendor_approved_by_td_id = td_id
        assignment.vendor_approved_by_td_name = td_name
        assignment.vendor_approval_date = datetime.utcnow()
        assignment.vendor_rejection_reason = rejection_reason
        # Clear vendor selection so buyer can select again
        assignment.selected_vendor_id = None
        assignment.selected_vendor_name = None
        assignment.vendor_selected_by_buyer_id = None
        assignment.vendor_selected_by_buyer_name = None
        assignment.vendor_selection_date = None
        assignment.updated_at = datetime.utcnow()

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=assignment.boq_id).first()
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id).first()

        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        new_action = {
            "role": "technical_director",
            "type": "vendor_rejected_for_se_boq",
            "sender": "technical_director",
            "receiver": "buyer",
            "status": "rejected",
            "boq_name": boq.boq_name if boq else '',
            "vendor_name": rejected_vendor_name,
            "rejection_reason": rejection_reason,
            "comments": f"TD rejected vendor {rejected_vendor_name}: {rejection_reason}",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": td_name,
            "sender_user_id": td_id,
            "assignment_id": assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=assignment.boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=boq.status if boq else '',
                sender=td_name,
                receiver=assignment.assigned_to_buyer_name,
                comments=f"Vendor {rejected_vendor_name} rejected: {rejection_reason}",
                sender_role='technical_director',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notifications to buyer and site engineer about vendor rejection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Notify buyer
            if assignment.assigned_to_buyer_id:
                buyer_notification = NotificationManager.create_notification(
                    user_id=assignment.assigned_to_buyer_id,
                    type='rejection',
                    title='SE BOQ Vendor Rejected',
                    message=f'TD rejected vendor "{rejected_vendor_name}" for SE BOQ materials. Reason: {rejection_reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/purchase-orders?assignment_id={assignment_id}',
                    action_label='Select New Vendor',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'rejected_vendor_name': rejected_vendor_name,
                        'rejection_reason': rejection_reason,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(assignment.assigned_to_buyer_id, buyer_notification.to_dict())

            # Notify site engineer
            if assignment.site_engineer_id:
                se_notification = NotificationManager.create_notification(
                    user_id=assignment.site_engineer_id,
                    type='info',
                    title='BOQ Vendor Rejected',
                    message=f'TD rejected vendor "{rejected_vendor_name}" for your BOQ materials. Buyer will select a new vendor.',
                    priority='medium',
                    category='vendor',
                    action_url=f'/site-engineer/boq/{assignment.boq_id}',
                    action_label='View BOQ',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'rejected_vendor_name': rejected_vendor_name,
                        'rejection_reason': rejection_reason,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(assignment.site_engineer_id, se_notification.to_dict())

        except Exception as notif_error:
            log.error(f"Failed to send SE BOQ vendor rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection rejected. Buyer can select a new vendor."
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting vendor for SE BOQ: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to reject vendor: {str(e)}"}), 500


def complete_se_boq_purchase(assignment_id):
    """Buyer completes purchase for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQHistory, BOQ

        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Buyer')

        data = request.get_json()
        notes = data.get('notes', '')

        # Get assignment
        assignment = BOQMaterialAssignment.query.filter_by(
            assignment_id=assignment_id,
            assigned_to_buyer_user_id=buyer_id,
            is_deleted=False
        ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        if assignment.vendor_selection_status != 'approved':
            return jsonify({"error": "Vendor selection must be approved by TD first"}), 400

        if assignment.status == 'purchase_completed':
            return jsonify({"error": "Purchase already completed"}), 400

        # Complete purchase
        assignment.status = 'purchase_completed'
        assignment.purchase_completed_by_user_id = buyer_id
        assignment.purchase_completed_by_name = buyer_name
        assignment.purchase_completion_date = datetime.utcnow()
        assignment.purchase_notes = notes
        assignment.updated_at = datetime.utcnow()

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=assignment.boq_id).first()
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id).first()

        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        new_action = {
            "role": "buyer",
            "type": "se_boq_purchase_completed",
            "sender": "buyer",
            "receiver": "site_engineer",
            "status": "purchase_completed",
            "boq_name": boq.boq_name if boq else '',
            "vendor_name": assignment.selected_vendor_name,
            "comments": f"Purchase completed by {buyer_name}",
            "notes": notes,
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": buyer_name,
            "sender_user_id": buyer_id,
            "assignment_id": assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=assignment.boq_id,
                action=current_actions,
                action_by=buyer_name,
                boq_status=boq.status if boq else '',
                sender=buyer_name,
                receiver=assignment.assigned_by_name,
                comments=f"SE BOQ purchase completed",
                sender_role='buyer',
                receiver_role='site_engineer',
                action_date=datetime.utcnow(),
                created_by=buyer_name
            )
            db.session.add(boq_history)

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Purchase completed successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing SE BOQ purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to complete purchase: {str(e)}"}), 500


def send_se_boq_vendor_email(assignment_id):
    """Send purchase order email to vendor for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQ, BOQDetails
        from models.project import Project

        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Buyer')

        data = request.get_json()
        vendor_email = data.get('vendor_email')

        if not vendor_email:
            return jsonify({"error": "Vendor email is required"}), 400

        # Get assignment
        assignment = BOQMaterialAssignment.query.filter_by(
            assignment_id=assignment_id,
            assigned_to_buyer_user_id=buyer_id,
            is_deleted=False
        ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        if assignment.vendor_selection_status != 'approved':
            return jsonify({"error": "Vendor must be approved by TD before sending email"}), 400

        # Get vendor
        vendor = Vendor.query.filter_by(vendor_id=assignment.selected_vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Get BOQ and project
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        project = Project.query.filter_by(project_id=assignment.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ details for materials
        boq_detail = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()
        materials_list = []

        if boq_detail and boq_detail.boq_details:
            items = boq_detail.boq_details.get('items', [])
            for item in items:
                item_name = item.get('description', '')
                sub_items = item.get('sub_items', [])
                for sub_item in sub_items:
                    sub_item_name = sub_item.get('sub_item_name', '')
                    materials = sub_item.get('materials', [])
                    for material in materials:
                        materials_list.append({
                            'item_name': item_name,
                            'sub_item_name': sub_item_name,
                            'material_name': material.get('material_name', ''),
                            'quantity': float(material.get('quantity', 0)),
                            'unit': material.get('unit', ''),
                            'unit_price': float(material.get('unit_price', 0)),
                            'total_price': float(material.get('total_price', 0))
                        })

        # Calculate totals from actual material data
        base_total = sum(mat['total_price'] for mat in materials_list)
        overhead_percentage = float(assignment.overhead_percentage or 0)
        overhead_amount = base_total * overhead_percentage / 100
        total_cost = base_total + overhead_amount

        # Prepare data for email
        vendor_data = {
            'vendor_id': vendor.vendor_id,
            'company_name': vendor.company_name,
            'contact_person_name': vendor.contact_person_name,
            'email': vendor_email
        }

        purchase_data = {
            'assignment_id': assignment.assignment_id,
            'materials': materials_list,
            'base_total': base_total,
            'overhead_percentage': overhead_percentage,
            'overhead_amount': overhead_amount,
            'total_cost': total_cost
        }

        buyer_data = {
            'buyer_id': buyer_id,
            'buyer_name': buyer_name,
            'buyer_email': current_user.get('email', '')
        }

        project_data = {
            'project_id': project.project_id,
            'project_name': project.project_name,
            'client': project.client,
            'location': project.location,
            'boq_name': boq.boq_name
        }

        # Send email to vendor
        # ✅ PERFORMANCE FIX: Use async email sending (15s → 0.1s response time)
        from utils.boq_email_service import BOQEmailService
        email_service = BOQEmailService()
        email_sent = email_service.send_vendor_purchase_order_async(
            vendor_email, vendor_data, purchase_data, buyer_data, project_data
        )

        if email_sent:
            # Mark email as sent
            assignment.vendor_email_sent = True
            assignment.vendor_email_sent_date = datetime.utcnow()
            assignment.vendor_email_sent_by_user_id = buyer_id
            assignment.updated_at = datetime.utcnow()
            db.session.commit()

            return jsonify({
                "success": True,
                "message": "Purchase order email sent to vendor successfully"
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Failed to send email to vendor"
            }), 500

    except Exception as e:
        log.error(f"Error sending SE BOQ vendor email: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send vendor email: {str(e)}"}), 500


# Store Management Functions
def get_store_items():
    """Get all available store items from inventory"""
    try:
        # Query real inventory data from InventoryMaterial table
        materials = InventoryMaterial.query.filter_by(is_active=True).all()

        store_items = []
        for material in materials:
            store_items.append({
                'id': material.inventory_material_id,
                'name': material.material_name,
                'description': material.description or f'{material.material_name} - {material.brand or ""}',
                'category': material.category or 'General',
                'price': material.unit_price or 0,
                'unit': material.unit,
                'available_quantity': material.current_stock or 0,
                'supplier_name': 'M2 Store',
                'supplier_location': 'Warehouse',
                'delivery_time_days': 1,
                'rating': 4.5,
                'specifications': {
                    'material_code': material.material_code,
                    'brand': material.brand or 'N/A',
                    'size': material.size or 'N/A'
                }
            })

        return jsonify(store_items), 200

    except Exception as e:
        log.error(f"Error getting store items: {str(e)}")
        return jsonify({"error": f"Failed to get store items: {str(e)}"}), 500


def get_store_item_details(item_id):
    """Get details of a specific store item"""
    try:
        # Query real inventory data
        material = InventoryMaterial.query.get(item_id)

        if not material:
            return jsonify({"error": "Item not found"}), 404

        item = {
            'id': material.inventory_material_id,
            'name': material.material_name,
            'description': material.description or f'{material.material_name} - {material.brand or ""}',
            'category': material.category or 'General',
            'price': material.unit_price or 0,
            'unit': material.unit,
            'available_quantity': material.current_stock or 0,
            'supplier_name': 'M2 Store',
            'supplier_location': 'Warehouse',
            'delivery_time_days': 1,
            'rating': 4.5,
            'specifications': {
                'material_code': material.material_code,
                'brand': material.brand or 'N/A',
                'size': material.size or 'N/A'
            },
            'images': [],
            'certifications': []
        }

        return jsonify(item), 200

    except Exception as e:
        log.error(f"Error getting store item details: {str(e)}")
        return jsonify({"error": f"Failed to get item details: {str(e)}"}), 500


def get_store_categories():
    """Get all store categories from inventory"""
    try:
        # Query unique categories from inventory with item counts
        from sqlalchemy import func
        category_counts = db.session.query(
            InventoryMaterial.category,
            func.count(InventoryMaterial.inventory_material_id).label('items_count')
        ).filter(
            InventoryMaterial.is_active == True,
            InventoryMaterial.category.isnot(None)
        ).group_by(InventoryMaterial.category).all()

        categories = []
        for idx, (category, count) in enumerate(category_counts):
            categories.append({
                'id': idx + 1,
                'name': category or 'General',
                'items_count': count
            })

        return jsonify(categories), 200

    except Exception as e:
        log.error(f"Error getting store categories: {str(e)}")
        return jsonify({"error": f"Failed to get categories: {str(e)}"}), 500


def get_projects_by_material(material_id):
    """Get projects with pending Change Requests containing this material, including CR details"""
    try:
        # Get the material name from inventory
        material = InventoryMaterial.query.get(material_id)
        if not material:
            return jsonify([]), 200

        material_name = material.material_name.lower()

        # Completed statuses for Change Requests
        completed_statuses = ['completed', 'purchase_completed', 'rejected']

        # Get Change Requests that contain this material and are not completed
        from sqlalchemy import cast, String
        change_requests = ChangeRequest.query.filter(
            ChangeRequest.status.notin_(completed_statuses),
            db.or_(
                cast(ChangeRequest.materials_data, String).ilike(f'%{material.material_name}%'),
                cast(ChangeRequest.sub_items_data, String).ilike(f'%{material.material_name}%')
            )
        ).all()

        if not change_requests:
            return jsonify([]), 200

        # Get CRs that already have active requests for this material
        existing_requests = InternalMaterialRequest.query.filter(
            InternalMaterialRequest.inventory_material_id == material_id,
            InternalMaterialRequest.cr_id.isnot(None),
            InternalMaterialRequest.status.in_(['PENDING', 'send_request', 'approved'])
        ).all()
        # Map cr_id to request status
        crs_with_active_requests = {req.cr_id: req.status for req in existing_requests}

        # Build project list with CR details
        projects_list = []
        for cr in change_requests:
            # Get project info
            project = Project.query.get(cr.project_id)
            if not project or project.is_deleted:
                continue

            # Check if this CR already has an active request
            has_active_request = cr.cr_id in crs_with_active_requests
            active_request_status = crs_with_active_requests.get(cr.cr_id)

            # Extract quantity and unit from materials_data
            quantity = 0
            unit = material.unit or 'nos'

            # Check materials_data
            materials = cr.materials_data or cr.sub_items_data or []
            if isinstance(materials, list):
                for mat in materials:
                    mat_name = (mat.get('material_name') or mat.get('name') or '').lower()
                    if material_name in mat_name or mat_name in material_name:
                        quantity = mat.get('quantity', 0)
                        unit = mat.get('unit', unit)
                        break

            projects_list.append({
                'project_id': project.project_id,
                'project_name': project.project_name,
                'cr_id': cr.cr_id,
                'quantity': quantity,
                'unit': unit,
                'cr_status': cr.status,
                'has_active_request': has_active_request,
                'active_request_status': active_request_status
            })

        return jsonify(projects_list), 200

    except Exception as e:
        log.error(f"Error getting projects: {str(e)}")
        return jsonify({"error": f"Failed to get projects: {str(e)}"}), 500


def check_store_availability(cr_id):
    """Check if materials in a CR are available in the M2 Store inventory"""
    try:
        cr = ChangeRequest.query.get(cr_id)
        if not cr:
            return jsonify({"error": "Change request not found"}), 404

        # Get materials from CR
        materials = cr.materials_data or cr.sub_items_data or []
        if not isinstance(materials, list):
            materials = []

        # Get materials that have already been sent to store (to exclude them)
        existing_store_requests = InternalMaterialRequest.query.filter_by(cr_id=cr_id).all()
        already_requested_materials = {req.material_name for req in existing_store_requests}

        available_materials = []
        unavailable_materials = []
        already_sent_materials = []  # Materials already sent to store

        for mat in materials:
            mat_name = mat.get('material_name') or mat.get('name') or ''
            mat_qty = mat.get('quantity', 0)

            # Skip materials that have already been sent to store
            if mat_name in already_requested_materials:
                # Find the existing request to get status
                existing_req = next((r for r in existing_store_requests if r.material_name == mat_name), None)
                already_sent_materials.append({
                    'material_name': mat_name,
                    'required_quantity': mat_qty,
                    'status': existing_req.status if existing_req else 'pending',
                    'already_sent': True
                })
                continue

            # Search in inventory by name
            inventory_item = InventoryMaterial.query.filter(
                InventoryMaterial.is_active == True,
                InventoryMaterial.material_name.ilike(f'%{mat_name}%')
            ).first()

            if inventory_item and inventory_item.current_stock >= mat_qty:
                available_materials.append({
                    'material_name': mat_name,
                    'required_quantity': mat_qty,
                    'available_quantity': inventory_item.current_stock,
                    'is_available': True,
                    'inventory_material_id': inventory_item.inventory_material_id
                })
            else:
                unavailable_materials.append({
                    'material_name': mat_name,
                    'required_quantity': mat_qty,
                    'available_quantity': inventory_item.current_stock if inventory_item else 0,
                    'is_available': False,
                    'inventory_material_id': inventory_item.inventory_material_id if inventory_item else None
                })

        # Can complete if there are available materials (even if some are unavailable or already sent)
        can_complete = len(available_materials) > 0

        return jsonify({
            'success': True,
            'cr_id': cr_id,
            'all_available_in_store': len(unavailable_materials) == 0 and len(available_materials) > 0,
            'available_materials': available_materials,
            'unavailable_materials': unavailable_materials,
            'already_sent_materials': already_sent_materials,  # Materials already requested from store
            'can_complete_from_store': can_complete
        }), 200

    except Exception as e:
        log.error(f"Error checking store availability: {str(e)}")
        return jsonify({"error": f"Failed to check store availability: {str(e)}"}), 500


def complete_from_store(cr_id):
    """Request materials from M2 Store - creates internal requests without completing the purchase

    Accepts optional 'selected_materials' in request body to request only specific materials.
    If not provided, requests all materials in the CR.
    """
    try:
        current_user = g.user
        data = request.get_json() or {}
        selected_materials = data.get('selected_materials')  # Optional: list of material names to request

        cr = ChangeRequest.query.get(cr_id)
        if not cr:
            return jsonify({"error": "Change request not found"}), 404

        # Get materials from CR
        materials = cr.materials_data or cr.sub_items_data or []
        if not isinstance(materials, list):
            return jsonify({"error": "No materials found in this CR"}), 400

        # Filter to selected materials if provided
        if selected_materials and isinstance(selected_materials, list):
            # Only include materials whose name is in selected_materials list
            materials = [
                mat for mat in materials
                if (mat.get('material_name') or mat.get('name') or '') in selected_materials
            ]
            if not materials:
                return jsonify({"error": "No matching materials found in selection"}), 400

        # Check if any of the selected materials were already requested from store
        for mat in materials:
            mat_name = mat.get('material_name') or mat.get('name') or ''
            existing_request = InternalMaterialRequest.query.filter_by(
                cr_id=cr_id,
                material_name=mat_name
            ).first()
            if existing_request:
                return jsonify({"error": f"Material '{mat_name}' was already requested from store"}), 400

        requests_created = 0
        # Check availability and create internal requests
        for mat in materials:
            mat_name = mat.get('material_name') or mat.get('name') or ''
            mat_qty = mat.get('quantity', 0)

            # Find in inventory
            inventory_item = InventoryMaterial.query.filter(
                InventoryMaterial.is_active == True,
                InventoryMaterial.material_name.ilike(f'%{mat_name}%')
            ).first()

            if not inventory_item:
                return jsonify({"error": f"Material '{mat_name}' not found in store"}), 400

            if inventory_item.current_stock < mat_qty:
                return jsonify({"error": f"Insufficient stock for '{mat_name}'. Need {mat_qty}, have {inventory_item.current_stock}"}), 400

            # Create internal material request
            new_request = InternalMaterialRequest(
                project_id=cr.project_id,
                cr_id=cr_id,
                material_name=mat_name,
                inventory_material_id=inventory_item.inventory_material_id,
                quantity=float(mat_qty),
                notes=f"Requested from CR-{cr_id}",
                request_send=True,
                status='send_request',
                created_by=current_user.get('email', 'system'),
                request_buyer_id=current_user.get('user_id'),
                last_modified_by=current_user.get('email', 'system')
            )
            db.session.add(new_request)
            requests_created += 1

        # Update CR notes to indicate store request was made (DON'T mark as completed yet)
        cr.purchase_notes = f"Requested from M2 Store by {current_user.get('full_name', current_user.get('email'))} on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"

        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Material requests sent to M2 Store. {requests_created} request(s) created.",
            "cr_id": cr_id,
            "requests_created": requests_created
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error requesting from store: {str(e)}")
        return jsonify({"error": f"Failed to request from store: {str(e)}"}), 500


def get_store_request_status(cr_id):
    """Get the status of store requests for a CR"""
    try:
        requests = InternalMaterialRequest.query.filter_by(cr_id=cr_id).all()

        if not requests:
            return jsonify({
                "success": True,
                "has_store_requests": False,
                "requests": []
            }), 200

        request_list = []
        for req in requests:
            request_list.append({
                "request_id": req.request_id,
                "material_name": req.material_name,
                "quantity": req.quantity,
                "status": req.status,
                "created_at": req.created_at.isoformat() if req.created_at else None
            })

        return jsonify({
            "success": True,
            "has_store_requests": True,
            "total_requests": len(requests),
            "requests": request_list
        }), 200

    except Exception as e:
        log.error(f"Error getting store request status: {str(e)}")
        return jsonify({"error": f"Failed to get store request status: {str(e)}"}), 500


def get_vendor_selection_data(cr_id):
    """
    Optimized endpoint for vendor selection modal
    Returns only essential fields (78% smaller payload)

    GET /api/buyer/purchase/{cr_id}/vendor-selection

    Returns:
    - cr_id, boq_id, project_id
    - materials list (from sub_items_data)
    - vendor selection details
    - overhead warning (if applicable)
    - per-material vendor selections (if enabled)
    """
    try:
        current_user = g.user
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

        # Allow buyer, TD, or admin
        if not any(role in user_role for role in ['buyer', 'technicaldirector', 'admin']):
            return jsonify({"error": "Access denied. Buyer, TD, or Admin role required."}), 403

        # Get change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase order not found"}), 404

        # Get project and BOQ info
        project = Project.query.filter_by(project_id=cr.project_id).first()
        boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()

        # Prepare materials list (use sub_items_data, NOT materials_data)
        materials = cr.sub_items_data if cr.sub_items_data else cr.materials_data

        # Calculate materials count
        materials_count = len(materials) if materials else 0

        # Validate and refresh material_vendor_selections with current vendor data
        # This ensures deleted vendors are removed and vendor names are up-to-date
        validated_material_vendor_selections = {}
        if cr.material_vendor_selections:
            from models.vendor import Vendor
            # Get all unique vendor IDs from selections
            vendor_ids = set()
            for selection in cr.material_vendor_selections.values():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_ids.add(selection.get('vendor_id'))

            # Fetch all referenced vendors in one query
            active_vendors = {
                v.vendor_id: v for v in Vendor.query.filter(
                    Vendor.vendor_id.in_(vendor_ids),
                    Vendor.is_deleted == False
                ).all()
            } if vendor_ids else {}

            # Validate each selection
            for material_name, selection in cr.material_vendor_selections.items():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_id = selection.get('vendor_id')
                    if vendor_id in active_vendors:
                        # Vendor exists - refresh vendor_name with current value
                        validated_selection = dict(selection)
                        validated_selection['vendor_name'] = active_vendors[vendor_id].company_name
                        validated_material_vendor_selections[material_name] = validated_selection
                    # If vendor doesn't exist (deleted), skip this selection
                else:
                    # Selection without vendor_id (just negotiated price) - keep it
                    validated_material_vendor_selections[material_name] = selection

        # Prepare vendor selection data
        vendor_data = {
            'selected_vendor_id': cr.selected_vendor_id,
            'selected_vendor_name': cr.selected_vendor_name,
            'vendor_selection_status': cr.vendor_selection_status,
            'vendor_selected_by_buyer_id': cr.vendor_selected_by_buyer_id,
            'vendor_selected_by_buyer_name': cr.vendor_selected_by_buyer_name,
            'vendor_selection_date': cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None,
            'vendor_approved_by_td_id': cr.vendor_approved_by_td_id,
            'vendor_approved_by_td_name': cr.vendor_approved_by_td_name,
            'vendor_approval_date': cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
            'vendor_rejection_reason': cr.vendor_rejection_reason,
            # Per-material vendor selection support
            'use_per_material_vendors': cr.use_per_material_vendors,
            'material_vendor_selections': validated_material_vendor_selections
        }

        # Overhead warning removed - columns dropped from database
        overhead_warning = None

        # Return optimized response (only 18-20 fields instead of 82)
        return jsonify({
            'success': True,
            # Core identifiers
            'cr_id': cr.cr_id,
            'boq_id': cr.boq_id,
            'project_id': cr.project_id,
            'status': cr.status,
            # Display info
            'project_name': project.project_name if project else None,
            'boq_name': boq.boq_name if boq else None,
            'item_name': cr.item_name,
            'item_id': cr.item_id,
            # Materials (from sub_items_data)
            'materials': materials,
            'materials_count': materials_count,
            'total_cost': round(cr.materials_total_cost, 2) if cr.materials_total_cost else 0,
            # Vendor selection
            'vendor': vendor_data,
            # Overhead warning (only if applicable)
            'overhead_warning': overhead_warning,
            # Metadata
            'created_at': cr.created_at.isoformat() if cr.created_at else None
        }), 200

    except Exception as e:
        log.error(f"Error getting vendor selection data for CR {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to get vendor selection data: {str(e)}"}), 500


def update_vendor_price(vendor_id):
    """
    Update vendor product price (immediate price negotiation).
    Supports two modes:
    1. Save for This BOQ: Updates material_vendor_selections for the CR
    2. Save for Future: Updates vendor_products.unit_price in database
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        material_name = data.get('material_name')
        new_price = data.get('new_price')
        save_for_future = data.get('save_for_future', False)
        cr_id = data.get('cr_id')  # Optional: CR to save negotiated price to

        if not material_name or new_price is None:
            return jsonify({"error": "material_name and new_price are required"}), 400

        # Validate new_price
        try:
            new_price = float(new_price)
            if new_price <= 0:
                return jsonify({"error": "Price must be greater than 0"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid price format"}), 400

        # Verify vendor exists
        from models.vendor import Vendor, VendorProduct
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Check role-based permissions (Buyer, TD, or Admin)
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_buyer = user_role == 'buyer'
        is_admin = user_role == 'admin'

        if not (is_buyer or is_td or is_admin):
            return jsonify({"error": "Insufficient permissions"}), 403

        updated_products = []

        # Update vendor product prices if save_for_future=true
        if save_for_future:
            material_lower = material_name.lower().strip()
            products = VendorProduct.query.filter_by(
                vendor_id=vendor_id,
                is_deleted=False
            ).all()

            # Find matching products
            matching_products = []
            for product in products:
                product_name = (product.product_name or '').lower().strip()
                # Exact match or contains match
                if product_name == material_lower or material_lower in product_name or product_name in material_lower:
                    matching_products.append(product)

            # Update unit_price for all matching products
            if matching_products:
                for product in matching_products:
                    old_price = product.unit_price
                    product.unit_price = new_price
                    updated_products.append({
                        'product_id': product.product_id,
                        'product_name': product.product_name,
                        'old_price': old_price,
                        'new_price': new_price
                    })

                db.session.flush()
            else:
                log.warning(f"No matching products found for material '{material_name}' from vendor {vendor_id}")

        # If cr_id provided, save negotiated price to the change request
        if cr_id:
            cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
            if cr:
                # Initialize material_vendor_selections if it doesn't exist
                if not cr.material_vendor_selections:
                    cr.material_vendor_selections = {}

                # Update or create material vendor selection with negotiated price
                if material_name in cr.material_vendor_selections:
                    # Update existing selection
                    cr.material_vendor_selections[material_name]['negotiated_price'] = new_price
                    cr.material_vendor_selections[material_name]['save_price_for_future'] = save_for_future
                else:
                    # Create new selection (for cases where price is negotiated before vendor selection)
                    cr.material_vendor_selections[material_name] = {
                        'vendor_id': vendor_id,
                        'vendor_name': vendor.company_name,
                        'negotiated_price': new_price,
                        'save_price_for_future': save_for_future,
                        'selected_by_user_id': user_id,
                        'selected_by_name': current_user.get('full_name', 'Unknown User'),
                        'selection_date': datetime.utcnow().isoformat()
                    }

                # Mark the JSONB field as modified
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(cr, 'material_vendor_selections')

                cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Prepare response message
        if save_for_future and updated_products:
            message = f"Price updated to AED {new_price:.2f} for {len(updated_products)} product(s). This price will be used for all future purchases."
        elif save_for_future and not updated_products:
            message = f"Price saved for this purchase (AED {new_price:.2f}). No matching products found to update for future."
        else:
            message = f"Negotiated price AED {new_price:.2f} saved for this purchase only."

        return jsonify({
            "success": True,
            "message": message,
            "vendor_id": vendor_id,
            "material_name": material_name,
            "new_price": new_price,
            "save_for_future": save_for_future,
            "updated_products": updated_products if save_for_future else [],
            "cr_id": cr_id
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating vendor price: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update vendor price: {str(e)}"}), 500


def save_supplier_notes(cr_id):
    """
    Save supplier notes for a specific material and vendor in CR's material_vendor_selections.
    This allows buyers to add notes immediately without waiting to create POChild.
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        material_name = data.get('material_name')
        vendor_id = data.get('vendor_id')
        supplier_notes = data.get('supplier_notes', '')

        if not material_name:
            return jsonify({"error": "material_name is required"}), 400

        # Validate supplier_notes
        if supplier_notes:
            supplier_notes = supplier_notes.strip()
            # Enforce length limit (5000 characters)
            if len(supplier_notes) > 5000:
                return jsonify({"error": "Supplier notes exceed maximum length of 5000 characters"}), 400
            # Basic content validation (no control characters except newlines/tabs)
            if any(ord(c) < 32 and c not in '\n\r\t' for c in supplier_notes):
                return jsonify({"error": "Supplier notes contain invalid characters"}), 400
            # Set to empty string if only whitespace
            if not supplier_notes:
                supplier_notes = ''

        # Get the change request
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check role-based permissions (Buyer, TD, or Admin)
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_buyer = user_role == 'buyer'
        is_admin = user_role == 'admin'

        if not (is_buyer or is_td or is_admin):
            return jsonify({"error": "Insufficient permissions"}), 403

        # Initialize material_vendor_selections if it doesn't exist
        if not cr.material_vendor_selections:
            cr.material_vendor_selections = {}

        # Update or create material vendor selection with supplier notes
        if material_name in cr.material_vendor_selections:
            # Update existing selection
            cr.material_vendor_selections[material_name]['supplier_notes'] = supplier_notes
        else:
            # Create new selection with notes only (vendor may be selected later)
            cr.material_vendor_selections[material_name] = {
                'supplier_notes': supplier_notes,
                'selected_by_user_id': user_id,
                'selected_by_name': current_user.get('full_name', 'Unknown User'),
                'selection_date': datetime.utcnow().isoformat()
            }
            # Add vendor info if provided
            if vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
                if vendor:
                    cr.material_vendor_selections[material_name]['vendor_id'] = vendor_id
                    cr.material_vendor_selections[material_name]['vendor_name'] = vendor.company_name

        # Mark the JSONB field as modified
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(cr, 'material_vendor_selections')

        cr.updated_at = datetime.utcnow()

        # Update POChild child_notes column directly
        # Find POChild by parent_cr_id and vendor_id OR by material_name in materials_data
        from models.po_child import POChild

        po_child_updated = None
        po_child = None

        # Method 1: Find by vendor_id
        if vendor_id:
            # Convert vendor_id to int for consistent comparison
            vendor_id_int = int(vendor_id)

            po_child = POChild.query.filter_by(
                parent_cr_id=cr_id,
                vendor_id=vendor_id_int,
                is_deleted=False
            ).first()

            log.info(f"Looking for POChild with parent_cr_id={cr_id}, vendor_id={vendor_id_int}, found: {po_child}")

        # Method 2: If not found by vendor_id, find by material_name in materials_data
        if not po_child and material_name:
            # Find all POChildren for this CR and check if any has this material
            all_po_children = POChild.query.filter_by(
                parent_cr_id=cr_id,
                is_deleted=False
            ).all()

            for pc in all_po_children:
                if pc.materials_data:
                    for mat in pc.materials_data:
                        if mat.get('material_name') == material_name:
                            po_child = pc
                            log.info(f"Found POChild {pc.id} by material_name '{material_name}'")
                            break
                    if po_child:
                        break

        if po_child:
            # Store notes in child_notes column
            # If there are existing notes, append the new note with material name prefix
            if po_child.child_notes and supplier_notes:
                # Check if this material's note already exists (avoid duplicates)
                material_prefix = f"[{material_name}]: "
                if material_prefix not in po_child.child_notes:
                    # Append new note with material name prefix
                    po_child.child_notes = f"{po_child.child_notes}\n\n{material_prefix}{supplier_notes}"
                else:
                    # Update existing note for this material
                    lines = po_child.child_notes.split('\n\n')
                    updated_lines = []
                    found = False
                    for line in lines:
                        if line.startswith(material_prefix):
                            updated_lines.append(f"{material_prefix}{supplier_notes}")
                            found = True
                        else:
                            updated_lines.append(line)
                    if not found:
                        updated_lines.append(f"{material_prefix}{supplier_notes}")
                    po_child.child_notes = '\n\n'.join(updated_lines)
            elif supplier_notes:
                # First note for this POChild - add with material name prefix
                po_child.child_notes = f"[{material_name}]: {supplier_notes}"

            po_child.updated_at = datetime.utcnow()
            po_child_updated = po_child.id
            log.info(f"✅ Updated child_notes for POChild {po_child.id}: {po_child.child_notes[:100] if po_child.child_notes else 'empty'}")
        else:
            log.warning(f"⚠️ No POChild found for CR {cr_id} with vendor_id={vendor_id} or material_name={material_name}")

        db.session.commit()

        log.info(f"Supplier notes saved for material '{material_name}' in CR {cr_id} by user {user_id}. POChild updated: {po_child_updated}")

        return jsonify({
            "success": True,
            "message": "Supplier notes saved successfully",
            "cr_id": cr_id,
            "material_name": material_name,
            "supplier_notes": supplier_notes,
            "po_child_id": po_child_updated
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error saving supplier notes: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to save supplier notes: {str(e)}"}), 500


# ============================================================================
# LPO PDF Generation Functions
# ============================================================================

def get_lpo_settings():
    """Get LPO settings (signatures, company info) for PDF generation"""
    try:
        from models.system_settings import SystemSettings

        settings = SystemSettings.query.first()
        if not settings:
            return jsonify({
                "success": True,
                "settings": {
                    "company_name": "Meter Square Interiors LLC",
                    "company_email": "",
                    "company_phone": "",
                    "company_fax": "",
                    "company_trn": "",
                    "company_address": "",
                    "md_name": "Managing Director",
                    "md_signature_image": None,
                    "td_name": "Technical Director",
                    "td_signature_image": None,
                    "company_stamp_image": None,
                    "default_payment_terms": "100% after delivery",
                    "lpo_header_image": None
                }
            }), 200

        return jsonify({
            "success": True,
            "settings": {
                "company_name": settings.company_name or "Meter Square Interiors LLC",
                "company_email": settings.company_email or "",
                "company_phone": settings.company_phone or "",
                "company_fax": getattr(settings, 'company_fax', '') or "",
                "company_trn": getattr(settings, 'company_trn', '') or "",
                "company_address": settings.company_address or "",
                "md_name": getattr(settings, 'md_name', 'Managing Director') or "Managing Director",
                "md_signature_image": getattr(settings, 'md_signature_image', None),
                "td_name": getattr(settings, 'td_name', 'Technical Director') or "Technical Director",
                "td_signature_image": getattr(settings, 'td_signature_image', None),
                "company_stamp_image": getattr(settings, 'company_stamp_image', None),
                "default_payment_terms": getattr(settings, 'default_payment_terms', '100% after delivery') or "100% after delivery",
                "lpo_header_image": getattr(settings, 'lpo_header_image', None)
            }
        }), 200

    except Exception as e:
        log.error(f"Error getting LPO settings: {str(e)}")
        return jsonify({"error": f"Failed to get LPO settings: {str(e)}"}), 500


def preview_lpo_pdf(cr_id):
    """Preview LPO PDF data before generation - returns editable data"""
    try:
        from models.system_settings import SystemSettings
        from models.vendor import Vendor
        from models.lpo_customization import LPOCustomization
        from models.po_child import POChild

        current_user = g.user
        buyer_id = current_user['user_id']

        # Check for po_child_id and vendor_id in query params
        po_child_id = request.args.get('po_child_id', type=int)
        vendor_id = request.args.get('vendor_id', type=int)
        po_child = None

        # Get the change request
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Get POChild if specified
        if po_child_id:
            po_child = POChild.query.filter_by(id=po_child_id, is_deleted=False).first()

        # Get saved customizations if any (handle case where table doesn't exist yet)
        # Priority: 1) PO child specific, 2) CR-level, 3) Global default template
        saved_customization = None
        default_template = None
        try:
            if po_child_id:
                # First try to find customization specific to this PO child
                saved_customization = LPOCustomization.query.filter_by(cr_id=cr_id, po_child_id=po_child_id).first()
            if not saved_customization:
                # Fall back to CR-level customization (po_child_id is NULL)
                saved_customization = LPOCustomization.query.filter_by(cr_id=cr_id, po_child_id=None).first()

            # If still no customization, try to get from global default template
            if not saved_customization:
                from models.lpo_default_template import LPODefaultTemplate
                # Get the most recently updated default template (any user's)
                default_template = LPODefaultTemplate.query.order_by(LPODefaultTemplate.updated_at.desc()).first()
        except Exception as e:
            db.session.rollback()  # Rollback failed transaction
            log.warning(f"LPO customization table may not exist, creating it: {str(e)}")
            try:
                # Try to create the table
                LPOCustomization.__table__.create(db.engine, checkfirst=True)
                db.session.commit()
                log.info("Created lpo_customizations table")
            except Exception as create_error:
                db.session.rollback()
                log.warning(f"Could not create table: {str(create_error)}")

        # Get vendor details - priority: POChild vendor > vendor_id param > CR's selected vendor > auto-detect from material_vendor_selections
        vendor = None
        if po_child and po_child.vendor_id:
            vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id, is_deleted=False).first()
        elif vendor_id:
            # Use vendor_id from query param (for pre-POChild preview)
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        elif cr.selected_vendor_id:
            vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
        else:
            # Auto-detect vendor from material_vendor_selections (for regular LPO with all materials to one vendor)
            if cr.material_vendor_selections and isinstance(cr.material_vendor_selections, dict):
                # Get unique vendor IDs from all materials
                vendor_ids_in_selections = set()
                for mat_name, selection in cr.material_vendor_selections.items():
                    if isinstance(selection, dict) and selection.get('vendor_id'):
                        vendor_ids_in_selections.add(selection.get('vendor_id'))

                # If all materials go to the same vendor, use that vendor
                if len(vendor_ids_in_selections) == 1:
                    auto_detected_vendor_id = list(vendor_ids_in_selections)[0]
                    vendor = Vendor.query.filter_by(vendor_id=auto_detected_vendor_id, is_deleted=False).first()
                    vendor_id = auto_detected_vendor_id  # Set vendor_id for later use

        # Get project details
        project = Project.query.get(cr.project_id)

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()

        # Get system settings
        settings = SystemSettings.query.first()

        # Process materials - use POChild materials if available
        if po_child and po_child.materials_data:
            # Use POChild's materials with price enrichment from parent CR
            materials_list = []
            cr_total = 0

            # Get negotiated prices from parent CR's material_vendor_selections
            parent_vendor_selections = cr.material_vendor_selections or {} if cr else {}

            # Get vendor's product prices as fallback (for when no negotiated price is set)
            vendor_product_prices = {}
            if po_child.vendor_id:
                from models.vendor import VendorProduct
                vendor_products = VendorProduct.query.filter_by(
                    vendor_id=po_child.vendor_id,
                    is_deleted=False
                ).all()
                for vp in vendor_products:
                    if vp.product_name:
                        vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)

            for material in po_child.materials_data:
                mat_name = material.get('material_name', '')
                quantity = material.get('quantity', 0)

                # Get price from multiple sources (priority order)
                stored_unit_price = float(material.get('unit_price', 0) or 0)
                negotiated_price = float(material.get('negotiated_price', 0) or 0)

                # Check parent CR's vendor selections
                # IMPORTANT: Frontend saves vendor rate in 'negotiated_price' field (not 'quoted_price')
                selection = parent_vendor_selections.get(mat_name, {})
                if isinstance(selection, dict):
                    # Frontend sends vendor rate as 'negotiated_price'
                    selection_vendor_rate = float(selection.get('negotiated_price', 0) or 0)
                    # Get brand and specification from vendor selection
                    vendor_brand = selection.get('brand', '')
                    vendor_specification = selection.get('specification', '')
                else:
                    selection_vendor_rate = 0
                    vendor_brand = ''
                    vendor_specification = ''

                # Lookup vendor product price as fallback
                vendor_product_price = vendor_product_prices.get(mat_name.lower().strip(), 0)

                # Use best available price with proper priority:
                # 1. negotiated_price from material data (if > 0) - custom override
                # 2. selection_vendor_rate from vendor selection (VENDOR RATE - if > 0) ← THE KEY!
                # 3. stored_unit_price from POChild (if > 0)
                # 4. vendor_product_price from vendor catalog (if > 0)
                # 5. fallback to 0
                if negotiated_price > 0:
                    final_price = negotiated_price
                elif selection_vendor_rate > 0:
                    final_price = selection_vendor_rate  # ✅ VENDOR RATE (THIS IS THE KEY!)
                elif stored_unit_price > 0:
                    final_price = stored_unit_price
                elif vendor_product_price > 0:
                    final_price = vendor_product_price
                else:
                    final_price = 0

                mat_total = quantity * final_price if final_price else float(material.get('total_price', 0) or 0)

                # Preserve BOQ/original prices for comparison display
                boq_unit_price = material.get('boq_unit_price') or material.get('original_unit_price') or 0

                # Get brand and specification - prefer vendor selection, fallback to material data
                final_brand = vendor_brand or material.get('brand', '')
                final_specification = vendor_specification or material.get('specification', '')

                # Get supplier notes from vendor selection or material data
                supplier_notes = ''
                if isinstance(selection, dict):
                    supplier_notes = selection.get('supplier_notes', '') or material.get('supplier_notes', '')
                else:
                    supplier_notes = material.get('supplier_notes', '')

                materials_list.append({
                    'material_name': mat_name,
                    'sub_item_name': material.get('sub_item_name', ''),
                    'quantity': quantity,
                    'unit': material.get('unit', ''),
                    'unit_price': final_price,
                    'total_price': mat_total,
                    'negotiated_price': final_price,
                    'boq_unit_price': float(boq_unit_price) if boq_unit_price else 0,
                    'original_unit_price': float(boq_unit_price) if boq_unit_price else 0,
                    'brand': final_brand,
                    'specification': final_specification,
                    'supplier_notes': supplier_notes
                })
                cr_total += mat_total
            cr_total = po_child.materials_total_cost or cr_total or sum(m.get('total_price', 0) for m in materials_list)
        else:
            # Use parent CR's materials
            materials_list, cr_total = process_materials_with_negotiated_prices(cr)

            # If vendor_id is provided (pre-POChild preview), filter materials for that vendor only
            if vendor_id and cr.material_vendor_selections:
                filtered_materials = []
                filtered_total = 0

                for material in materials_list:
                    mat_name = material.get('material_name', '')
                    vendor_selection = cr.material_vendor_selections.get(mat_name, {})

                    if isinstance(vendor_selection, dict):
                        selected_vendor_id = vendor_selection.get('vendor_id')

                        if selected_vendor_id == vendor_id:
                            # Enrich material with vendor-specific data
                            # IMPORTANT: Frontend saves vendor rate in 'negotiated_price' field (not 'quoted_price')
                            vendor_rate_from_selection = float(vendor_selection.get('negotiated_price', 0) or 0)

                            # Use vendor rate from selection, fallback to existing unit_price
                            vendor_rate = vendor_rate_from_selection if vendor_rate_from_selection > 0 else material.get('unit_price', 0)

                            # Update material with vendor-specific data
                            material['unit_price'] = vendor_rate
                            material['negotiated_price'] = vendor_rate
                            material['vendor_rate'] = vendor_rate
                            material['vendor_material_name'] = vendor_selection.get('vendor_material_name', mat_name)
                            material['brand'] = vendor_selection.get('brand', material.get('brand', ''))
                            material['specification'] = vendor_selection.get('specification', material.get('specification', ''))
                            # ✅ CRITICAL: Ensure supplier_notes is enriched from vendor selection
                            material['supplier_notes'] = vendor_selection.get('supplier_notes', material.get('supplier_notes', ''))

                            # Recalculate total with vendor rate
                            qty = material.get('quantity', 0)
                            material['total_price'] = qty * vendor_rate

                            filtered_materials.append(material)
                            filtered_total += material['total_price']

                materials_list = filtered_materials
                cr_total = filtered_total

        # Calculate totals
        subtotal = 0
        items = []
        for i, material in enumerate(materials_list, 1):
            # Use best available price with proper fallback logic
            # Priority: negotiated_price (if > 0) > unit_price (vendor rate) > 0
            negotiated = float(material.get('negotiated_price', 0) or 0)
            unit = float(material.get('unit_price', 0) or 0)

            # Only use negotiated_price if it's explicitly set and greater than 0
            if negotiated > 0:
                rate = negotiated
            elif unit > 0:
                rate = unit
            else:
                # Last resort: use 0 (will show as 0.00 in PDF)
                rate = 0

            qty = material.get('quantity', 0)
            amount = float(qty) * float(rate)
            subtotal += amount

            # Get BOQ rate for comparison display
            boq_rate = material.get('boq_unit_price') or material.get('original_unit_price') or 0

            # Get separate fields for material name, brand, and specification
            material_name = material.get('material_name', '') or material.get('sub_item_name', '')
            brand = material.get('brand', '')
            specification = material.get('specification', '')

            # Get vendor's material name from material_vendor_selections if available
            vendor_material_name = material_name  # Default to BOQ name
            if cr and cr.material_vendor_selections:
                vendor_selection = cr.material_vendor_selections.get(material_name, {})
                if isinstance(vendor_selection, dict) and vendor_selection.get('vendor_material_name'):
                    vendor_material_name = vendor_selection['vendor_material_name']

            # Get per-material supplier notes
            material_supplier_notes = material.get('supplier_notes', '')

            items.append({
                "sl_no": i,
                "material_name": vendor_material_name,  # Use vendor's material name
                "brand": brand,
                "specification": specification,
                "description": vendor_material_name,  # Use vendor's material name for LPO
                "qty": qty,
                "unit": material.get('unit', 'Nos'),
                "rate": round(rate, 2),
                "amount": round(amount, 2),
                "boq_rate": round(float(boq_rate), 2) if boq_rate else 0,
                "supplier_notes": material_supplier_notes  # Per-material notes for LPO display
            })

        # VAT - use saved customization, otherwise default to 5%
        if saved_customization and hasattr(saved_customization, 'vat_percent'):
            vat_percent = float(saved_customization.vat_percent) if saved_customization.vat_percent is not None else 5.0
            # Recalculate VAT amount based on subtotal
            vat_amount = (subtotal * vat_percent) / 100
        else:
            # Default: 5% VAT
            vat_percent = 5.0
            vat_amount = (subtotal * 5.0) / 100

        grand_total = subtotal + vat_amount

        # Default company TRN
        DEFAULT_COMPANY_TRN = "100223723600003"

        # Get vendor phone with code
        vendor_phone = ""
        if vendor:
            if hasattr(vendor, 'phone_code') and vendor.phone_code and vendor.phone:
                vendor_phone = f"{vendor.phone_code} {vendor.phone}"
            elif vendor.phone:
                vendor_phone = vendor.phone

        # Get vendor TRN (try trn field first, then gst_number)
        vendor_trn = ""
        if vendor:
            vendor_trn = getattr(vendor, 'trn', '') or getattr(vendor, 'gst_number', '') or ""

        # Build preview data
        # Default subject
        default_subject = cr.item_name or cr.justification or ""

        lpo_preview = {
            "vendor": {
                "company_name": vendor.company_name if vendor else "",
                "contact_person": vendor.contact_person_name if vendor else "",
                "phone": vendor_phone,
                "fax": getattr(vendor, 'fax', '') if vendor else "",
                "email": vendor.email if vendor else "",
                "trn": vendor_trn,
                "project": project.project_name if project else "",
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
                "lpo_number": f"MS/PO/{po_child.get_formatted_id().replace('PO-', '')}" if po_child else f"MS/PO/{cr.cr_id}",
                "lpo_date": datetime.now().strftime('%d.%m.%Y'),
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
                "payment_terms": saved_customization.payment_terms if saved_customization and saved_customization.payment_terms else (default_template.payment_terms if default_template and default_template.payment_terms else (getattr(settings, 'default_payment_terms', '100% CDC after delivery') if settings else "100% CDC after delivery")),
                "delivery_terms": saved_customization.completion_terms if saved_customization and saved_customization.completion_terms else (default_template.completion_terms if default_template and default_template.completion_terms else ""),
                "custom_terms": _parse_custom_terms(saved_customization, default_template)
            },
            "signatures": {
                "md_name": getattr(settings, 'md_name', 'Managing Director') if settings else "Managing Director",
                "md_signature": getattr(settings, 'md_signature_image', None) if settings else None,
                "td_name": getattr(settings, 'td_name', 'Technical Director') if settings else "Technical Director",
                "td_signature": getattr(settings, 'td_signature_image', None) if settings else None,
                "stamp_image": getattr(settings, 'company_stamp_image', None) if settings else None,
                "is_system_signature": True  # Mark as system-generated signature
            },
            "header_image": getattr(settings, 'lpo_header_image', None) if settings else None
        }

        return jsonify({
            "success": True,
            "lpo_data": lpo_preview,
            "cr_id": cr_id
        }), 200

    except Exception as e:
        log.error(f"Error previewing LPO PDF: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to preview LPO PDF: {str(e)}"}), 500


def save_lpo_customization(cr_id):
    """Save LPO customizations to database for persistence"""
    try:
        from models.lpo_customization import LPOCustomization

        current_user = g.user
        buyer_id = current_user['user_id']

        # Get the change request to verify it exists
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Get po_child_id from request data (if saving for specific PO child)
        po_child_id = data.get('po_child_id')

        # Get or create customization record - now with po_child_id support
        try:
            if po_child_id:
                customization = LPOCustomization.query.filter_by(cr_id=cr_id, po_child_id=po_child_id).first()
            else:
                customization = LPOCustomization.query.filter_by(cr_id=cr_id, po_child_id=None).first()
        except Exception as table_error:
            db.session.rollback()
            # Table might not exist, try to create it
            log.warning(f"LPO customization table may not exist, creating it: {str(table_error)}")
            try:
                LPOCustomization.__table__.create(db.engine, checkfirst=True)
                db.session.commit()
                log.info("Created lpo_customizations table")
                customization = None  # Table is empty, so no existing record
            except Exception as create_error:
                db.session.rollback()
                log.error(f"Could not create table: {str(create_error)}")
                return jsonify({"error": "Failed to create LPO customization table"}), 500
        if not customization:
            customization = LPOCustomization(cr_id=cr_id, po_child_id=po_child_id, created_by=buyer_id)
            db.session.add(customization)

        # Update fields from request
        lpo_info = data.get('lpo_info', {})
        terms = data.get('terms', {})
        vendor = data.get('vendor', {})

        customization.quotation_ref = lpo_info.get('quotation_ref', '')
        customization.custom_message = lpo_info.get('custom_message', '')
        customization.subject = vendor.get('subject', '')
        customization.payment_terms = terms.get('payment_terms', '')
        customization.completion_terms = terms.get('completion_terms', '') or terms.get('delivery_terms', '')

        # Save custom_terms (safely handle if column doesn't exist yet)
        try:
            customization.custom_terms = json.dumps(terms.get('custom_terms', []))
        except Exception as e:
            log.warning(f"Could not save custom_terms: {e}")

        customization.general_terms = json.dumps(terms.get('general_terms', []))
        customization.payment_terms_list = json.dumps(terms.get('payment_terms_list', []))
        customization.include_signatures = data.get('include_signatures', True)

        # Save VAT data from totals
        totals = data.get('totals', {})
        customization.vat_percent = float(totals.get('vat_percent', 5.0))
        customization.vat_amount = float(totals.get('vat_amount', 0.0))

        db.session.commit()

        log.info(f"LPO customization saved for CR {cr_id} by user {buyer_id}")

        return jsonify({
            "success": True,
            "message": "LPO customization saved successfully",
            "customization": customization.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error saving LPO customization: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to save LPO customization: {str(e)}"}), 500


def generate_lpo_pdf(cr_id):
    """Generate LPO PDF with editable data from frontend"""
    try:
        from utils.lpo_pdf_generator import LPOPDFGenerator
        from flask import Response

        current_user = g.user

        # Get the change request to verify it exists
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Get LPO data from request body (editable by buyer)
        data = request.get_json()
        lpo_data = data.get('lpo_data')

        if not lpo_data:
            return jsonify({"error": "LPO data is required"}), 400

        # Always fetch fresh signature names from database (don't rely on frontend cache)
        from models.system_settings import SystemSettings
        settings = SystemSettings.query.first()
        if settings and 'signatures' in lpo_data:
            lpo_data['signatures']['md_name'] = settings.md_name or 'Managing Director'
            lpo_data['signatures']['td_name'] = settings.td_name or 'Technical Director'
            lpo_data['signatures']['md_signature'] = getattr(settings, 'md_signature_image', None)
            lpo_data['signatures']['td_signature'] = getattr(settings, 'td_signature_image', None)
            lpo_data['signatures']['stamp_image'] = getattr(settings, 'company_stamp_image', None)

        # Always fetch fresh vendor data from database (don't rely on frontend cache)
        from models.vendor import Vendor
        from models.po_child import POChild

        # Get vendor_id from po_child_id or cr
        po_child_id = data.get('po_child_id') or request.args.get('po_child_id', type=int)
        vendor_id = None

        if po_child_id:
            po_child = POChild.query.filter_by(id=po_child_id, is_deleted=False).first()
            vendor_id = po_child.vendor_id if po_child else None
            log.info(f"LPO PDF - POChild {po_child_id} has vendor_id: {vendor_id}")

        # Fallback to CR's selected vendor
        if not vendor_id:
            vendor_id = cr.selected_vendor_id
            log.info(f"LPO PDF - Using CR's selected_vendor_id: {vendor_id}")

        # Auto-detect vendor from material_vendor_selections if still not found
        if not vendor_id and cr.material_vendor_selections and isinstance(cr.material_vendor_selections, dict):
            vendor_ids_in_selections = set()
            for mat_name, selection in cr.material_vendor_selections.items():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_ids_in_selections.add(selection.get('vendor_id'))

            if len(vendor_ids_in_selections) == 1:
                vendor_id = list(vendor_ids_in_selections)[0]
                log.info(f"LPO PDF - Auto-detected vendor_id: {vendor_id}")
            elif len(vendor_ids_in_selections) > 1:
                log.warning(f"LPO PDF - Multiple vendors detected, cannot auto-detect")

        # Refresh vendor data if vendor_id is available
        if vendor_id:
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
            if vendor:
                # Get vendor phone with code
                vendor_phone = ""
                if hasattr(vendor, 'phone_code') and vendor.phone_code and vendor.phone:
                    vendor_phone = f"{vendor.phone_code} {vendor.phone}"
                elif vendor.phone:
                    vendor_phone = vendor.phone

                # Get vendor TRN (try trn field first, then gst_number)
                vendor_trn = getattr(vendor, 'trn', '') or getattr(vendor, 'gst_number', '') or ""

                # Get project details
                project = Project.query.get(cr.project_id)

                # Update lpo_data with fresh vendor info (preserve subject and other customized fields)
                preserved_subject = lpo_data.get('vendor', {}).get('subject', '')

                lpo_data['vendor'] = {
                    "vendor_id": vendor.vendor_id,
                    "company_name": vendor.company_name,
                    "contact_person": vendor.contact_person_name,
                    "phone": vendor_phone,
                    "fax": getattr(vendor, 'fax', ''),
                    "email": vendor.email,
                    "trn": vendor_trn,
                    "project": project.project_name if project else "",
                    "subject": preserved_subject  # Keep customized subject
                }
                log.info(f"LPO PDF - Refreshed vendor data for vendor_id {vendor_id}: {vendor.company_name}")
            else:
                log.warning(f"LPO PDF - Vendor {vendor_id} not found in database")
        else:
            log.warning(f"LPO PDF - No vendor_id available for CR {cr_id}")

        # Generate PDF
        generator = LPOPDFGenerator()
        pdf_bytes = generator.generate_lpo_pdf(lpo_data)

        # Get project for filename
        project = Project.query.get(cr.project_id)
        project_name = project.project_name.replace(' ', '_')[:20] if project else 'Project'
        filename = f"LPO-{cr_id}-{project_name}.pdf"

        # Return PDF as downloadable file
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )

    except Exception as e:
        log.error(f"Error generating LPO PDF: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to generate LPO PDF: {str(e)}"}), 500


def save_lpo_default_template():
    """Save current LPO customizations as default template for future projects"""
    try:
        from models.lpo_default_template import LPODefaultTemplate

        current_user = g.user
        user_id = current_user['user_id']

        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Get or create default template for this user
        try:
            template = LPODefaultTemplate.query.filter_by(user_id=user_id).first()
        except Exception as table_error:
            db.session.rollback()
            # Table might not exist, try to create it
            log.warning(f"LPO default template table may not exist, creating it: {str(table_error)}")
            try:
                LPODefaultTemplate.__table__.create(db.engine, checkfirst=True)
                db.session.commit()
                log.info("Created lpo_default_templates table")
                template = None
            except Exception as create_error:
                db.session.rollback()
                log.error(f"Could not create table: {str(create_error)}")
                return jsonify({"error": "Failed to create LPO default template table"}), 500

        if not template:
            template = LPODefaultTemplate(user_id=user_id)
            db.session.add(template)

        # Update fields from request
        lpo_info = data.get('lpo_info', {})
        terms = data.get('terms', {})
        vendor = data.get('vendor', {})

        template.quotation_ref = lpo_info.get('quotation_ref', '')
        template.custom_message = lpo_info.get('custom_message', '')
        template.subject = vendor.get('subject', '')
        template.payment_terms = terms.get('payment_terms', '')
        template.completion_terms = terms.get('completion_terms', '') or terms.get('delivery_terms', '')

        # Save custom_terms (safely handle if column doesn't exist yet)
        try:
            template.custom_terms = json.dumps(terms.get('custom_terms', []))
        except Exception as e:
            log.warning(f"Could not save custom_terms to template: {e}")

        template.general_terms = json.dumps(terms.get('general_terms', []))
        template.payment_terms_list = json.dumps(terms.get('payment_terms_list', []))
        template.include_signatures = data.get('include_signatures', True)

        db.session.commit()

        log.info(f"LPO default template saved for user {user_id}")

        return jsonify({
            "success": True,
            "message": "Default template saved successfully. This will be used for new projects.",
            "template": template.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error saving LPO default template: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to save default template: {str(e)}"}), 500


def get_lpo_default_template():
    """Get the user's default LPO template"""
    try:
        from models.lpo_default_template import LPODefaultTemplate

        current_user = g.user
        user_id = current_user['user_id']

        try:
            template = LPODefaultTemplate.query.filter_by(user_id=user_id).first()
        except Exception as table_error:
            db.session.rollback()
            # Table might not exist
            log.warning(f"LPO default template table may not exist: {str(table_error)}")
            return jsonify({"template": None}), 200

        if template:
            return jsonify({
                "success": True,
                "template": template.to_dict()
            }), 200
        else:
            return jsonify({
                "success": True,
                "template": None
            }), 200

    except Exception as e:
        log.error(f"Error getting LPO default template: {str(e)}")
        return jsonify({"error": f"Failed to get default template: {str(e)}"}), 500
