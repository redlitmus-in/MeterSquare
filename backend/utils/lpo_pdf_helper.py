"""
LPO PDF Helper — Generate LPO PDF and upload to Supabase storage.

Called at TD approval time to pre-generate the PDF so the email flow
can attach it from storage instead of generating on-the-fly.
"""
import os
import time
import json
from datetime import datetime
from config.db import db
from config.logging import get_logger

log = get_logger()


def generate_and_save_lpo_pdf(cr_id, po_child_id=None):
    """
    Generate LPO PDF and upload to Supabase storage.

    Reuses the same data-building logic as preview_lpo_pdf() in lpo_controller.py
    but without Flask request context (no g.user, no request.args).

    Args:
        cr_id: Change request ID
        po_child_id: Optional PO child ID (for split POs)

    Returns:
        str: Public URL of the uploaded PDF, or None on failure
    """
    from models.change_request import ChangeRequest
    from models.po_child import POChild
    from models.project import Project
    from models.vendor import Vendor, VendorProduct
    from models.system_settings import SystemSettings
    from models.lpo_customization import LPOCustomization
    from controllers.buyer.helpers import _parse_custom_terms, process_materials_with_negotiated_prices
    from utils.lpo_pdf_generator import LPOPDFGenerator

    try:
        # ── Load CR and optional POChild ────────────────────────────
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            log.warning(f"LPO PDF: CR-{cr_id} not found")
            return None

        po_child = None
        if po_child_id:
            po_child = POChild.query.filter_by(id=po_child_id, is_deleted=False).first()
            if not po_child:
                log.warning(f"LPO PDF: POChild-{po_child_id} not found")
                return None

        # ── Load LPO customization (priority: POChild > CR > default template) ─
        saved_customization = None
        default_template = None
        try:
            if po_child_id:
                saved_customization = LPOCustomization.query.filter_by(
                    cr_id=cr_id, po_child_id=po_child_id
                ).first()
            if not saved_customization:
                saved_customization = LPOCustomization.query.filter_by(
                    cr_id=cr_id, po_child_id=None
                ).first()
            if not saved_customization:
                from models.lpo_default_template import LPODefaultTemplate
                default_template = LPODefaultTemplate.query.order_by(
                    LPODefaultTemplate.updated_at.desc()
                ).first()
        except Exception as e:
            log.warning(f"LPO PDF: Error loading customization: {e}")

        # ── Resolve vendor ──────────────────────────────────────────
        vendor = None
        if po_child and po_child.vendor_id:
            vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id, is_deleted=False).first()
        elif cr.selected_vendor_id:
            vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
        else:
            # Auto-detect from material_vendor_selections
            if cr.material_vendor_selections and isinstance(cr.material_vendor_selections, dict):
                vendor_ids = {
                    sel.get('vendor_id')
                    for sel in cr.material_vendor_selections.values()
                    if isinstance(sel, dict) and sel.get('vendor_id')
                }
                if len(vendor_ids) == 1:
                    vendor = Vendor.query.filter_by(
                        vendor_id=list(vendor_ids)[0], is_deleted=False
                    ).first()

        if not vendor:
            log.warning(f"LPO PDF: No vendor found for CR-{cr_id}")
            return None

        # ── Load project & system settings ──────────────────────────
        project = Project.query.get(cr.project_id)
        settings = SystemSettings.query.first()

        # ── Process materials ───────────────────────────────────────
        if po_child and po_child.materials_data:
            materials_list, cr_total = _process_po_child_materials(po_child, cr)
        else:
            materials_list, cr_total = process_materials_with_negotiated_prices(cr)
            # Exclude store-routed materials
            routed_materials = cr.routed_materials or {}
            store_routed_names = {
                name for name, info in routed_materials.items()
                if isinstance(info, dict) and info.get('routing') == 'store'
            }
            if store_routed_names:
                materials_list = [
                    m for m in materials_list
                    if m.get('material_name', '') not in store_routed_names
                ]
                cr_total = sum(m.get('total_price', 0) for m in materials_list)

        if not materials_list:
            log.warning(f"LPO PDF: No materials for CR-{cr_id}")
            return None

        # ── Build items list with totals ────────────────────────────
        subtotal = 0
        items = []
        for i, material in enumerate(materials_list, 1):
            negotiated = float(material.get('negotiated_price', 0) or 0)
            unit = float(material.get('unit_price', 0) or 0)
            rate = negotiated if negotiated > 0 else (unit if unit > 0 else 0)

            qty = material.get('quantity') or material.get('rejected_qty', 0)
            amount = float(qty) * float(rate)
            subtotal += amount

            boq_rate = material.get('boq_unit_price') or material.get('original_unit_price') or 0

            material_name = material.get('material_name', '') or material.get('sub_item_name', '')
            vendor_material_name = material_name
            if cr and cr.material_vendor_selections:
                vs = cr.material_vendor_selections.get(material_name, {})
                if isinstance(vs, dict) and vs.get('vendor_material_name'):
                    vendor_material_name = vs['vendor_material_name']

            items.append({
                "sl_no": i,
                "material_name": vendor_material_name,
                "brand": material.get('brand', ''),
                "size": material.get('size', ''),
                "specification": material.get('specification', ''),
                "description": vendor_material_name,
                "qty": qty,
                "unit": material.get('unit', 'Nos'),
                "rate": round(rate, 2),
                "amount": round(amount, 2),
                "boq_rate": round(float(boq_rate), 2) if boq_rate else 0,
                "supplier_notes": material.get('supplier_notes', ''),
            })

        # ── VAT ─────────────────────────────────────────────────────
        if saved_customization and hasattr(saved_customization, 'vat_percent'):
            vat_percent = float(saved_customization.vat_percent) if saved_customization.vat_percent is not None else 5.0
        else:
            vat_percent = 5.0
        vat_amount = (subtotal * vat_percent) / 100
        grand_total = subtotal + vat_amount

        # ── Vendor details ──────────────────────────────────────────
        DEFAULT_COMPANY_TRN = "100223723600003"
        vendor_phone = ""
        if hasattr(vendor, 'phone_code') and vendor.phone_code and vendor.phone:
            vendor_phone = f"{vendor.phone_code} {vendor.phone}"
        elif vendor.phone:
            vendor_phone = vendor.phone
        vendor_trn = getattr(vendor, 'trn', '') or getattr(vendor, 'gst_number', '') or ""

        default_subject = cr.item_name or cr.justification or ""

        # ── Build lpo_data (same structure as preview_lpo_pdf) ──────
        lpo_data = {
            "vendor": {
                "company_name": vendor.company_name or "",
                "contact_person": vendor.contact_person_name or "",
                "phone": vendor_phone,
                "fax": getattr(vendor, 'fax', '') or "",
                "email": vendor.email or "",
                "trn": vendor_trn,
                "project": project.project_name if project else "",
                "subject": (
                    saved_customization.subject
                    if saved_customization and getattr(saved_customization, 'subject', None)
                    else default_subject
                ),
            },
            "company": {
                "name": settings.company_name if settings else "Meter Square Interiors LLC",
                "contact_person": getattr(settings, 'company_contact_person', 'Mr. Mohammed Sabir') if settings else "Mr. Mohammed Sabir",
                "division": "Admin",
                "phone": settings.company_phone if settings else "",
                "fax": getattr(settings, 'company_fax', '') if settings else "",
                "email": settings.company_email if settings else "",
                "trn": (getattr(settings, 'company_trn', '') or DEFAULT_COMPANY_TRN) if settings else DEFAULT_COMPANY_TRN,
            },
            "lpo_info": {
                "lpo_number": f"MS/PO/{po_child.get_formatted_id().replace('PO-', '')}" if po_child else f"MS/PO/{cr.cr_id}",
                "lpo_date": datetime.now().strftime('%d.%m.%Y'),
                "quotation_ref": saved_customization.quotation_ref if saved_customization else "",
                "custom_message": (
                    saved_customization.custom_message
                    if saved_customization and getattr(saved_customization, 'custom_message', None)
                    else "Thank you very much for quoting us for requirements. As per your quotation and settlement done over the mail, we are issuing the LPO and please ensure the delivery on time"
                ),
            },
            "items": items,
            "totals": {
                "subtotal": round(subtotal, 2),
                "vat_percent": vat_percent,
                "vat_amount": round(vat_amount, 2),
                "grand_total": round(grand_total, 2),
            },
            "terms": {
                "payment_terms": (
                    saved_customization.payment_terms
                    if saved_customization and getattr(saved_customization, 'payment_terms', None)
                    else (
                        default_template.payment_terms
                        if default_template and getattr(default_template, 'payment_terms', None)
                        else (
                            getattr(settings, 'default_payment_terms', '100% CDC after delivery')
                            if settings else "100% CDC after delivery"
                        )
                    )
                ),
                "delivery_terms": (
                    saved_customization.completion_terms
                    if saved_customization and getattr(saved_customization, 'completion_terms', None)
                    else (
                        default_template.completion_terms
                        if default_template and getattr(default_template, 'completion_terms', None)
                        else ""
                    )
                ),
                "custom_terms": _parse_custom_terms(saved_customization, default_template),
            },
            "signatures": {
                "md_name": getattr(settings, 'md_name', 'Managing Director') if settings else "Managing Director",
                "md_signature": getattr(settings, 'md_signature_image', None) if settings else None,
                "td_name": getattr(settings, 'td_name', 'Technical Director') if settings else "Technical Director",
                "td_signature": getattr(settings, 'td_signature_image', None) if settings else None,
                "stamp_image": getattr(settings, 'company_stamp_image', None) if settings else None,
                "is_system_signature": True,
            },
            "header_image": getattr(settings, 'lpo_header_image', None) if settings else None,
        }

        # ── Generate PDF bytes ──────────────────────────────────────
        generator = LPOPDFGenerator()
        pdf_bytes = generator.generate_lpo_pdf(lpo_data)
        if not pdf_bytes:
            log.error(f"LPO PDF: Generator returned empty bytes for CR-{cr_id}")
            return None

        # ── Upload to Supabase storage ──────────────────────────────
        pdf_url = _upload_to_supabase(pdf_bytes, cr_id, po_child, project)
        if not pdf_url:
            return None

        # ── Save URL in database ────────────────────────────────────
        if po_child:
            po_child.lpo_pdf_url = pdf_url
        else:
            cr.lpo_pdf_url = pdf_url
        db.session.commit()

        return pdf_url

    except Exception as e:
        log.error(f"LPO PDF generation error for CR-{cr_id}: {e}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        try:
            db.session.rollback()
        except Exception:
            pass
        return None


def _process_po_child_materials(po_child, cr):
    """
    Process POChild materials with price enrichment from parent CR.
    Mirrors the logic in lpo_controller.py:167-262.
    """
    from models.vendor import VendorProduct

    materials_list = []
    cr_total = 0
    parent_vendor_selections = cr.material_vendor_selections or {}

    # Get vendor product prices as fallback
    vendor_product_prices = {}
    if po_child.vendor_id:
        vendor_products = VendorProduct.query.filter_by(
            vendor_id=po_child.vendor_id, is_deleted=False
        ).all()
        for vp in vendor_products:
            if vp.product_name:
                vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)

    for material in po_child.materials_data:
        mat_name = material.get('material_name', '')
        quantity = material.get('quantity') or material.get('rejected_qty', 0)

        stored_unit_price = float(material.get('unit_price', 0) or 0)
        negotiated_price = float(material.get('negotiated_price', 0) or 0)

        selection = parent_vendor_selections.get(mat_name, {})
        if isinstance(selection, dict):
            selection_vendor_rate = float(selection.get('negotiated_price', 0) or 0)
            vendor_brand = selection.get('brand', '')
            vendor_specification = selection.get('specification', '')
        else:
            selection_vendor_rate = 0
            vendor_brand = ''
            vendor_specification = ''

        vendor_product_price = vendor_product_prices.get(mat_name.lower().strip(), 0)

        # Price priority: negotiated > selection vendor rate > stored > vendor catalog > 0
        if negotiated_price > 0:
            final_price = negotiated_price
        elif selection_vendor_rate > 0:
            final_price = selection_vendor_rate
        elif stored_unit_price > 0:
            final_price = stored_unit_price
        elif vendor_product_price > 0:
            final_price = vendor_product_price
        else:
            final_price = 0

        mat_total = quantity * final_price if final_price else float(material.get('total_price', 0) or 0)
        boq_unit_price = material.get('boq_unit_price') or material.get('original_unit_price') or 0
        final_brand = vendor_brand or material.get('brand', '')
        final_specification = vendor_specification or material.get('specification', '')

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
            'supplier_notes': supplier_notes,
        })
        cr_total += mat_total

    cr_total = po_child.materials_total_cost or cr_total or sum(m.get('total_price', 0) for m in materials_list)
    return materials_list, cr_total


def _upload_to_supabase(pdf_bytes, cr_id, po_child, project):
    """Upload PDF to Supabase storage and return public URL."""
    try:
        from supabase import create_client as create_supabase_client

        environment = os.environ.get('ENVIRONMENT', 'production')
        SUPABASE_BUCKET = "file_upload"

        # Supabase URL
        if environment == 'development':
            upload_supabase_url = os.environ.get('DEV_SUPABASE_URL')
        else:
            upload_supabase_url = os.environ.get('SUPABASE_URL')

        # Use service role key to bypass RLS
        service_role_key = os.environ.get('DEV_SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
        if service_role_key:
            upload_key = service_role_key
        elif environment == 'development':
            upload_key = os.environ.get('DEV_SUPABASE_KEY')
        else:
            upload_key = os.environ.get('SUPABASE_KEY')

        if not upload_supabase_url or not upload_key:
            log.error("LPO PDF upload: Missing Supabase credentials")
            return None

        upload_client = create_supabase_client(upload_supabase_url, upload_key)

        # Build file path
        timestamp = int(time.time())
        po_id_str = po_child.get_formatted_id().replace('PO-', '') if po_child else str(cr_id)
        pdf_filename = f"LPO-{po_id_str}-{timestamp}.pdf"
        pdf_path = f"buyer/cr_{cr_id}/lpo/{pdf_filename}"

        # Upload
        upload_client.storage.from_(SUPABASE_BUCKET).upload(
            pdf_path,
            pdf_bytes,
            {
                "content-type": "application/pdf",
                "content-disposition": f'attachment; filename="{pdf_filename}"',
                "x-upsert": "true",
            }
        )

        # Get public URL (use anon client for public URL generation)
        if environment == 'development':
            anon_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
        else:
            anon_key = os.environ.get('SUPABASE_ANON_KEY')

        anon_client = create_supabase_client(upload_supabase_url, anon_key)
        pdf_url = anon_client.storage.from_(SUPABASE_BUCKET).get_public_url(pdf_path)

        return pdf_url

    except Exception as e:
        log.error(f"LPO PDF upload error: {e}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return None
