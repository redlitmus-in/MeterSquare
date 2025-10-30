"""
BOQ Calculation Helper
Ensures all BOQ items have calculated values before PDF generation
"""


def calculate_boq_values(items, boq_json=None):
    """
    Calculate all missing values for BOQ items
    This ensures selling prices, overhead amounts, etc. are populated

    Args:
        items: List of BOQ items (will be modified in place)
        boq_json: Full BOQ JSON containing preliminaries and other data (optional)

    Returns:
        tuple: (total_material_cost, total_labour_cost, items_subtotal, preliminary_amount, grand_total)
    """
    total_material_cost = 0
    total_labour_cost = 0
    items_subtotal = 0

    # Extract preliminary amount from boq_json if available
    preliminary_amount = 0
    if boq_json:
        preliminaries = boq_json.get('preliminaries', {})
        cost_details = preliminaries.get('cost_details', {})
        preliminary_amount = cost_details.get('amount', 0) or 0

    for item in items:
        # Set has_sub_items flag
        if 'sub_items' in item and item['sub_items'] and len(item['sub_items']) > 0:
            item['has_sub_items'] = True
        else:
            item['has_sub_items'] = False

        # Calculate item costs
        if item.get('has_sub_items') and item.get('sub_items'):
            # Calculate from sub-items
            item_materials = 0
            item_labour = 0

            for sub_item in item['sub_items']:
                # Calculate materials cost
                materials = sub_item.get('materials', [])
                sub_materials_cost = sum([m.get('total_price', 0) for m in materials])
                sub_item['materials_cost'] = sub_materials_cost
                item_materials += sub_materials_cost

                # Calculate labour cost
                labour = sub_item.get('labour', [])
                sub_labour_cost = sum([l.get('total_cost', 0) for l in labour])
                sub_item['labour_cost'] = sub_labour_cost
                item_labour += sub_labour_cost

            # Calculate base cost
            item_base_cost = item_materials + item_labour

            # Calculate overhead and profit amounts if only percentages exist
            # Get actual percentages from item (check multiple field names)
            overhead_pct = item.get('overhead_profit_percentage', item.get('overhead_percentage', item.get('profit_margin_percentage', 0)))
            misc_pct = item.get('miscellaneous_percentage', item.get('overhead_percentage', 0))

            if 'overhead_amount' not in item or item.get('overhead_amount', 0) == 0:
                item['overhead_amount'] = item_base_cost * (overhead_pct / 100)

            if 'profit_margin_amount' not in item or item.get('profit_margin_amount', 0) == 0:
                item['profit_margin_amount'] = item_base_cost * (overhead_pct / 100)

            if 'miscellaneous_amount' not in item or item.get('miscellaneous_amount', 0) == 0:
                item['miscellaneous_amount'] = item_base_cost * (misc_pct / 100)

            # Calculate selling price
            if 'selling_price' not in item or item.get('selling_price', 0) == 0:
                item['selling_price'] = (
                    item_base_cost +
                    item.get('overhead_amount', 0) +
                    item.get('profit_margin_amount', 0) +
                    item.get('miscellaneous_amount', 0)
                )

            total_material_cost += item_materials
            total_labour_cost += item_labour
            items_subtotal += item.get('selling_price', 0)

        else:
            # Old format: single item
            materials = item.get('materials', [])
            labour = item.get('labour', [])

            item_materials = sum([m.get('total_price', 0) for m in materials])
            item_labour = sum([l.get('total_cost', 0) for l in labour])
            item_base_cost = item_materials + item_labour

            # Calculate amounts if missing - use actual percentages from item
            overhead_pct = item.get('overhead_profit_percentage', item.get('overhead_percentage', item.get('profit_margin_percentage', 0)))
            misc_pct = item.get('miscellaneous_percentage', item.get('overhead_percentage', 0))

            if 'overhead_amount' not in item or item.get('overhead_amount', 0) == 0:
                item['overhead_amount'] = item_base_cost * (overhead_pct / 100)

            if 'profit_margin_amount' not in item or item.get('profit_margin_amount', 0) == 0:
                item['profit_margin_amount'] = item_base_cost * (overhead_pct / 100)

            if 'miscellaneous_amount' not in item or item.get('miscellaneous_amount', 0) == 0:
                item['miscellaneous_amount'] = item_base_cost * (misc_pct / 100)

            # Calculate selling price
            if 'selling_price' not in item or item.get('selling_price', 0) == 0:
                item['selling_price'] = (
                    item_base_cost +
                    item.get('overhead_amount', 0) +
                    item.get('profit_margin_amount', 0) +
                    item.get('miscellaneous_amount', 0)
                )

            total_material_cost += item_materials
            total_labour_cost += item_labour
            items_subtotal += item.get('selling_price', 0)

    # Calculate grand total including preliminary amount
    grand_total = items_subtotal + preliminary_amount

    return total_material_cost, total_labour_cost, items_subtotal, preliminary_amount, grand_total
