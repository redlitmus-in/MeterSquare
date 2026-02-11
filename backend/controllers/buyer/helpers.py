from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import or_, and_, func, desc
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails, MasterItem, MasterSubItem, MasterMaterial
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.vendor import Vendor
from models.inventory import *
from config.logging import get_logger
from datetime import datetime, timedelta
import os
import json
import re

log = get_logger()

__all__ = [
    'is_technical_director', 'is_buyer_role', 'is_admin_role',
    'is_estimator_role', 'has_buyer_permissions', 'sanitize_string',
    '_parse_custom_terms', 'process_materials_with_negotiated_prices',
    'MAX_STRING_LENGTH', 'MAX_TEXT_LENGTH',
]


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


def is_estimator_role(user_role: str) -> bool:
    """Check if user role is Estimator"""
    if not user_role:
        return False
    return user_role.lower() == 'estimator'


def has_buyer_permissions(user_role: str) -> bool:
    """Check if user has buyer-level permissions (buyer, estimator, TD, or admin)"""
    return is_buyer_role(user_role) or is_estimator_role(user_role) or is_technical_director(user_role) or is_admin_role(user_role)


# ============================================================================
# VALIDATION HELPER FUNCTIONS
# ============================================================================

# Input sanitization constants
MAX_STRING_LENGTH = 255
MAX_TEXT_LENGTH = 5000

def sanitize_string(value, max_length=MAX_STRING_LENGTH, field_name="input"):
    """
    Sanitize string input to prevent XSS and enforce length limits

    Args:
        value: Input value to sanitize
        max_length: Maximum allowed length
        field_name: Name of field for error messages

    Returns:
        Sanitized string or None

    Raises:
        ValueError: If input exceeds max length
    """
    if value is None:
        return None

    # Convert to string and strip whitespace
    value = str(value).strip()

    # Check length
    if len(value) > max_length:
        raise ValueError(f"{field_name} exceeds maximum length of {max_length} characters")

    # Return sanitized value (truncated to max_length as safety backup)
    return value[:max_length] if value else None


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

                        # Get brand and specification from vendor selection (same as POChild path)
                        vendor_brand = vendor_selection.get('brand', '') if isinstance(vendor_selection, dict) else ''
                        vendor_specification = vendor_selection.get('specification', '') if isinstance(vendor_selection, dict) else ''

                        # Lookup vendor product price from catalog
                        vendor_product_price = 0
                        if vendor_id and vendor_id in vendor_product_prices:
                            vendor_product_price = vendor_product_prices[vendor_id].get(material_name.lower().strip(), 0)

                        # FIXED: Use proper priority
                        # Priority: 1. vendor rate from selection, 2. vendor_product_price (catalog), 3. BOQ original_unit_price
                        if vendor_rate_from_selection > 0:
                            effective_price = vendor_rate_from_selection  # VENDOR RATE (THIS IS THE KEY!)
                        elif vendor_product_price > 0:
                            effective_price = vendor_product_price
                        else:
                            effective_price = original_unit_price

                        # CRITICAL FIX: When vendor is selected, use vendor price for display AND total
                        # Use vendor price if ANY vendor price exists
                        has_vendor_price = (vendor_rate_from_selection > 0) or (vendor_product_price > 0)
                        vendor_selected = (cr.vendor_selection_status in ['approved', 'pending_td_approval'] and has_vendor_price)

                        # FIX: Use vendor price when available, regardless of approval status
                        # If vendor has a price, use it (for LPO generation, vendor must be selected)
                        # Only fall back to BOQ if no vendor pricing exists at all
                        if has_vendor_price:
                            display_unit_price = effective_price  # Use vendor price
                        else:
                            display_unit_price = original_unit_price  # Fall back to BOQ only if no vendor price

                        material_total = float(quantity) * float(display_unit_price)

                        # FIXED: Use vendor price for cr_total when approved
                        cr_total += material_total

                        # Get brand, size, and specification - prefer vendor selection, fallback to material data (same as POChild)
                        final_brand = vendor_brand or material.get('brand', '')
                        final_size = material.get('size', '')
                        final_specification = vendor_specification or material.get('specification', '')

                        # Get supplier notes from vendor selection or material data
                        supplier_notes = vendor_selection.get('supplier_notes', '') if isinstance(vendor_selection, dict) else ''

                        materials_list.append({
                            "material_name": material_name,
                            "master_material_id": master_material_id,
                            "is_new_material": material.get('is_new_material', False),  # From change request
                            "justification": material.get('justification', ''),  # Individual material justification
                            "sub_item_name": sub_item_name_for_material,  # FIXED: Add sub_item_name to match other branches
                            "quantity": quantity,
                            "unit": material.get('unit', ''),
                            "unit_price": display_unit_price,  # Vendor price when approved, BOQ otherwise
                            "total_price": material_total,  # Based on vendor/BOQ price depending on approval
                            "negotiated_price": effective_price if effective_price != original_unit_price else None,
                            "vendor_product_price": vendor_product_price,
                            "original_unit_price": original_unit_price,  # Add original for reference
                            "boq_unit_price": original_unit_price,  # For PDF comparison
                            "brand": final_brand,  # Brand from vendor selection (same as POChild)
                            "size": final_size,  # Size from material data
                            "specification": final_specification,  # Specification from vendor selection (same as POChild)
                            "supplier_notes": supplier_notes  # Supplier notes from vendor selection
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

                    # Get brand and specification from vendor selection
                    vendor_brand = vendor_selection.get('brand', '') if isinstance(vendor_selection, dict) else ''
                    vendor_specification = vendor_selection.get('specification', '') if isinstance(vendor_selection, dict) else ''

                    # Lookup vendor product price from catalog
                    vendor_product_price = 0
                    if vendor_id and vendor_id in vendor_product_prices:
                        vendor_product_price = vendor_product_prices[vendor_id].get(material_name.lower().strip(), 0)

                    # FIXED: Use proper priority
                    # Priority: 1. vendor rate from selection, 2. vendor_product_price (catalog), 3. BOQ original_unit_price
                    if vendor_rate_from_selection > 0:
                        effective_price = vendor_rate_from_selection  # VENDOR RATE (THIS IS THE KEY!)
                    elif vendor_product_price > 0:
                        effective_price = vendor_product_price
                    else:
                        effective_price = original_unit_price

                    # CRITICAL FIX: When vendor is selected, use vendor price for display AND total
                    # Use vendor price if ANY vendor price exists
                    has_vendor_price = (vendor_rate_from_selection > 0) or (vendor_product_price > 0)
                    vendor_selected = (cr.vendor_selection_status in ['approved', 'pending_td_approval'] and has_vendor_price)

                    # FIX: Use vendor price when available, regardless of approval status
                    if has_vendor_price:
                        display_unit_price = effective_price  # Use vendor price
                    else:
                        display_unit_price = original_unit_price  # Fall back to BOQ only if no vendor price

                    sub_total = float(quantity) * float(display_unit_price)

                    # FIXED: Use vendor price for cr_total when approved
                    cr_total += sub_total

                    # Get brand and specification - prefer vendor selection, fallback to sub_item data (same as POChild)
                    final_brand = vendor_brand or sub_item.get('brand', '')
                    final_specification = vendor_specification or sub_item.get('specification', '')

                    # Get supplier notes from vendor selection
                    supplier_notes = vendor_selection.get('supplier_notes', '') if isinstance(vendor_selection, dict) else ''

                    materials_list.append({
                        "material_name": material_name,
                        "master_material_id": master_material_id,
                        "is_new_material": sub_item.get('is_new_material', False),  # From change request
                        "justification": sub_item.get('justification', ''),  # Individual material justification
                        "sub_item_name": sub_item.get('sub_item_name', ''),
                        "brand": final_brand,  # Brand from vendor selection (same as POChild)
                        "specification": final_specification,  # Specification from vendor selection (same as POChild)
                        "size": sub_item.get('size', ''),
                        "quantity": quantity,
                        "unit": sub_item.get('unit', ''),
                        "unit_price": display_unit_price,  # Vendor price when approved, BOQ otherwise
                        "total_price": sub_total,  # Based on vendor/BOQ price depending on approval
                        "negotiated_price": effective_price if effective_price != original_unit_price else None,
                        "vendor_product_price": vendor_product_price,
                        "original_unit_price": original_unit_price,  # Add original for reference
                        "supplier_notes": supplier_notes,  # Supplier notes from vendor selection
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

            # Get brand and specification from vendor selection (same as other branches)
            vendor_brand = vendor_selection.get('brand', '') if isinstance(vendor_selection, dict) else ''
            vendor_specification = vendor_selection.get('specification', '') if isinstance(vendor_selection, dict) else ''

            # Get supplier notes from vendor selection (same as other branches)
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

            # Get brand and specification - prefer vendor selection, fallback to material data (same as other branches)
            final_brand = vendor_brand or material.get('brand', '')
            final_specification = vendor_specification or material.get('specification', '')

            materials_list.append({
                "material_name": material_name,
                "master_material_id": master_material_id,
                "is_new_material": material.get('is_new_material', False),  # From change request
                "justification": material.get('justification', ''),  # Individual material justification
                "sub_item_name": material.get('sub_item_name', ''),
                "brand": final_brand,  # Brand from vendor selection (same as other branches)
                "specification": final_specification,  # Specification from vendor selection (same as other branches)
                "size": material.get('size', ''),
                "quantity": quantity,
                "unit": material.get('unit', ''),
                "unit_price": display_unit_price,  # Vendor price when approved, BOQ otherwise
                "total_price": material_total,  # Based on vendor/BOQ price depending on approval
                "negotiated_price": effective_price if effective_price != original_unit_price else None,
                "vendor_product_price": vendor_product_price,
                "original_unit_price": original_unit_price,  # Add original for reference
                "boq_unit_price": original_unit_price,  # For PDF comparison
                "supplier_notes": supplier_notes  # Supplier notes from vendor selection (same as other branches)
            })

    return materials_list, cr_total
