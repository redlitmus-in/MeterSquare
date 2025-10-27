"""
BOQ Calculation Helper
Ensures all BOQ items have calculated values before PDF generation
"""


def calculate_boq_values(items):
    """
    Calculate all missing values for BOQ items
    This ensures selling prices, overhead amounts, etc. are populated

    Args:
        items: List of BOQ items (will be modified in place)

    Returns:
        tuple: (total_material_cost, total_labour_cost, grand_total)
    """
    total_material_cost = 0
    total_labour_cost = 0
    grand_total = 0

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
            if 'overhead_amount' not in item or item.get('overhead_amount', 0) == 0:
                overhead_pct = item.get('overhead_percentage', 10) / 100
                item['overhead_amount'] = item_base_cost * overhead_pct

            if 'profit_margin_amount' not in item or item.get('profit_margin_amount', 0) == 0:
                profit_pct = item.get('profit_margin_percentage', 15) / 100
                item['profit_margin_amount'] = item_base_cost * profit_pct

            if 'miscellaneous_amount' not in item or item.get('miscellaneous_amount', 0) == 0:
                misc_pct = item.get('miscellaneous_percentage', 10) / 100
                item['miscellaneous_amount'] = item_base_cost * misc_pct

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
            grand_total += item.get('selling_price', 0)

        else:
            # Old format: single item
            materials = item.get('materials', [])
            labour = item.get('labour', [])

            item_materials = sum([m.get('total_price', 0) for m in materials])
            item_labour = sum([l.get('total_cost', 0) for l in labour])
            item_base_cost = item_materials + item_labour

            # Calculate amounts if missing
            if 'overhead_amount' not in item or item.get('overhead_amount', 0) == 0:
                overhead_pct = item.get('overhead_percentage', 10) / 100
                item['overhead_amount'] = item_base_cost * overhead_pct

            if 'profit_margin_amount' not in item or item.get('profit_margin_amount', 0) == 0:
                profit_pct = item.get('profit_margin_percentage', 15) / 100
                item['profit_margin_amount'] = item_base_cost * profit_pct

            if 'miscellaneous_amount' not in item or item.get('miscellaneous_amount', 0) == 0:
                misc_pct = item.get('miscellaneous_percentage', 10) / 100
                item['miscellaneous_amount'] = item_base_cost * misc_pct

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
            grand_total += item.get('selling_price', 0)

    return total_material_cost, total_labour_cost, grand_total
