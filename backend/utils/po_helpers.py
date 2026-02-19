"""
PO (Purchase Order) Helper Utilities

Shared logic for parent CR / PO child completion checks.
Prevents premature parent CR completion when uncovered materials remain.
"""

import json

from config.logging import get_logger

log = get_logger()


def are_all_cr_materials_covered(cr, po_children):
    """
    Check if ALL materials from a parent CR are accounted for by its PO children.

    A parent CR should only be marked as completed/routed when every one of its
    materials has been assigned to a PO child. Without this check, completing
    a single PO child (e.g., store-routed) can prematurely mark the parent as
    done while other materials still need vendor selection.

    Args:
        cr: ChangeRequest model instance (parent)
        po_children: list of POChild model instances for this parent

    Returns:
        tuple: (all_covered: bool, uncovered_materials: set of material names)
    """
    # Collect material names covered by PO children
    materials_in_children = set()
    for pc in po_children:
        if pc.materials_data:
            mat_list = pc.materials_data
            # Legacy records may have string-encoded JSON before JSONB migration
            if isinstance(mat_list, str):
                try:
                    mat_list = json.loads(mat_list)
                except (json.JSONDecodeError, TypeError):
                    mat_list = []
            if isinstance(mat_list, list):
                for mat in mat_list:
                    if isinstance(mat, dict):
                        mat_name = mat.get('material_name', '')
                        if mat_name:
                            materials_in_children.add(mat_name.lower().strip())

    # Collect all material names from parent CR
    parent_materials = cr.sub_items_data or cr.materials_data or []
    if not isinstance(parent_materials, list):
        parent_materials = []

    all_parent_names = set()
    for mat in parent_materials:
        if isinstance(mat, dict):
            mat_name = mat.get('material_name', '')
            if mat_name:
                all_parent_names.add(mat_name.lower().strip())

    # Also count store-routed materials (tracked in routed_materials JSON field)
    routed_mats = cr.routed_materials or {}
    if isinstance(routed_mats, dict):
        store_routed = {
            name.lower().strip() for name, info in routed_mats.items()
            if isinstance(info, dict) and info.get('routing') == 'store'
        }
    else:
        store_routed = set()

    covered = materials_in_children | store_routed
    uncovered = all_parent_names - covered

    if uncovered:
        log.info(
            f"CR-{cr.cr_id}: {len(uncovered)} materials NOT covered by PO children: {uncovered} "
            f"(parent has {len(all_parent_names)}, children cover {len(materials_in_children)}, "
            f"store-routed {len(store_routed)})"
        )

    return len(uncovered) == 0, uncovered
