from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.vendor import Vendor
from config.logging import get_logger
from datetime import datetime
import os
import json

log = get_logger()

__all__ = [
    'get_lpo_settings', 'preview_lpo_pdf', 'save_lpo_customization',
    'generate_lpo_pdf', 'save_lpo_default_template', 'get_lpo_default_template',
]

# Import shared helper
from controllers.buyer.helpers import _parse_custom_terms


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
                    'size': material.get('size', ''),
                    'specification': final_specification,
                    'supplier_notes': supplier_notes
                })
                cr_total += mat_total
            cr_total = po_child.materials_total_cost or cr_total or sum(m.get('total_price', 0) for m in materials_list)
        else:
            # Use parent CR's materials
            from controllers.buyer.helpers import process_materials_with_negotiated_prices
            materials_list, cr_total = process_materials_with_negotiated_prices(cr)

            # FIX: Exclude store-routed materials from LPO (they don't go to vendors)
            routed_materials = cr.routed_materials or {}
            store_routed_names = {
                name for name, info in routed_materials.items()
                if isinstance(info, dict) and info.get('routing') == 'store'
            }
            if store_routed_names:
                materials_list = [m for m in materials_list if m.get('material_name', '') not in store_routed_names]
                cr_total = sum(m.get('total_price', 0) for m in materials_list)

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

            # Get separate fields for material name, brand, size, and specification
            material_name = material.get('material_name', '') or material.get('sub_item_name', '')
            brand = material.get('brand', '')
            size = material.get('size', '')
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
                "size": size,
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
