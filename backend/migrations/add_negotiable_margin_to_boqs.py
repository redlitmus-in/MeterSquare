"""
Migration Script: Add Negotiable Margin to Existing BOQs
This script calculates and adds negotiable_margin fields to all BOQ sub-items
that don't have them yet.

Formula:
negotiable_margin = rate - (materials_cost + labour_cost + misc + O&P + transport)

Where:
- rate = client amount (quantity * rate = sub_item_total)
- materials_cost = sum of materials
- labour_cost = sum of labour
- misc, O&P, transport = calculated from percentages

Run this script ONCE to update all existing BOQs.
"""

import sys
sys.path.append('/home/development1/Desktop/MeterSquare/backend')

from app import create_app
from config.db import db
from models.boq import BOQDetails
from config.change_request_config import CR_CONFIG
from config.logging import get_logger

log = get_logger()
app = create_app()


def calculate_negotiable_margin_for_subitem(sub_item: dict, boq_percentages: dict) -> dict:
    """
    Calculate negotiable margin for a single sub-item

    Args:
        sub_item: Sub-item dictionary
        boq_percentages: Dict with misc_percentage, overhead_profit_percentage, transport_percentage

    Returns:
        dict: Updated sub-item with negotiable margin fields
    """
    # Get values
    quantity = float(sub_item.get('quantity', 0) or 0)
    rate = float(sub_item.get('rate', 0) or 0)
    materials_cost = float(sub_item.get('materials_cost', 0) or 0)
    labour_cost = float(sub_item.get('labour_cost', 0) or 0)

    # Client amount (what customer pays)
    sub_item_client_amount = quantity * rate

    # Internal cost
    internal_cost = materials_cost + labour_cost

    # Get percentages (use provided or defaults)
    misc_percentage = boq_percentages.get('misc_percentage', CR_CONFIG.DEFAULT_MISC_PERCENTAGE)
    overhead_profit_percentage = boq_percentages.get('overhead_profit_percentage', CR_CONFIG.DEFAULT_OVERHEAD_PROFIT_PERCENTAGE)
    transport_percentage = boq_percentages.get('transport_percentage', CR_CONFIG.DEFAULT_TRANSPORT_PERCENTAGE)

    # Calculate amounts
    misc_amount = sub_item_client_amount * (misc_percentage / 100)
    overhead_profit_amount = sub_item_client_amount * (overhead_profit_percentage / 100)
    transport_amount = sub_item_client_amount * (transport_percentage / 100)

    # Calculate negotiable margin
    # Formula: Client Amount - (Materials + Labour + Misc + O&P + Transport)
    negotiable_margin = sub_item_client_amount - internal_cost - misc_amount - overhead_profit_amount - transport_amount

    # Update sub-item with new fields
    sub_item['sub_item_total'] = sub_item_client_amount
    sub_item['internal_cost'] = internal_cost
    sub_item['misc_percentage'] = misc_percentage
    sub_item['misc_amount'] = misc_amount
    sub_item['overhead_profit_percentage'] = overhead_profit_percentage
    sub_item['overhead_profit_amount'] = overhead_profit_amount
    sub_item['transport_percentage'] = transport_percentage
    sub_item['transport_amount'] = transport_amount
    sub_item['planned_profit'] = overhead_profit_amount
    sub_item['negotiable_margin'] = round(negotiable_margin, 2)

    return sub_item


def migrate_boq(boq_details: BOQDetails) -> bool:
    """
    Migrate a single BOQ to add negotiable margin fields

    Returns:
        bool: True if migration successful, False otherwise
    """
    try:
        if not boq_details.boq_details:
            log.warning(f"BOQ {boq_details.boq_id} has no details")
            return False

        data = boq_details.boq_details
        items = data.get('items', [])
        summary = data.get('summary', {})

        # Get BOQ-level percentages if available
        boq_percentages = {
            'misc_percentage': summary.get('misc_percentage', CR_CONFIG.DEFAULT_MISC_PERCENTAGE),
            'overhead_profit_percentage': summary.get('overhead_profit_percentage', CR_CONFIG.DEFAULT_OVERHEAD_PROFIT_PERCENTAGE),
            'transport_percentage': summary.get('transport_percentage', CR_CONFIG.DEFAULT_TRANSPORT_PERCENTAGE)
        }

        updated_count = 0
        total_sub_items = 0

        # Process all items
        for item in items:
            if item.get('has_sub_items') and item.get('sub_items'):
                for sub_item in item['sub_items']:
                    total_sub_items += 1

                    # Always recalculate if negotiable_margin is missing or sub_item_total is missing
                    if ('negotiable_margin' not in sub_item or sub_item.get('negotiable_margin') is None or
                        'sub_item_total' not in sub_item or sub_item.get('sub_item_total') is None):
                        # Calculate and add negotiable margin
                        calculate_negotiable_margin_for_subitem(sub_item, boq_percentages)
                        updated_count += 1

        if updated_count > 0:
            # Update the boq_details JSON field
            boq_details.boq_details = data
            # Mark as modified for SQLAlchemy to detect changes
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_details, "boq_details")
            db.session.add(boq_details)
            log.info(f"BOQ {boq_details.boq_id}: Updated {updated_count}/{total_sub_items} sub-items with negotiable margin")
            return True
        else:
            log.info(f"BOQ {boq_details.boq_id}: All {total_sub_items} sub-items already have negotiable margin")
            return False

    except Exception as e:
        log.error(f"Error migrating BOQ {boq_details.boq_id}: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return False


def run_migration():
    """
    Main migration function
    """
    with app.app_context():
        log.info("=" * 80)
        log.info("Starting BOQ Negotiable Margin Migration")
        log.info("=" * 80)

        # Get all BOQs
        all_boqs = BOQDetails.query.filter_by(is_deleted=False).all()
        log.info(f"Found {len(all_boqs)} BOQs to process")

        migrated_count = 0
        skipped_count = 0
        error_count = 0

        for boq in all_boqs:
            try:
                if migrate_boq(boq):
                    migrated_count += 1
                else:
                    skipped_count += 1
            except Exception as e:
                log.error(f"Error processing BOQ {boq.boq_id}: {str(e)}")
                error_count += 1

        # Commit all changes
        try:
            db.session.commit()
            log.info("=" * 80)
            log.info("Migration Summary:")
            log.info(f"  Total BOQs: {len(all_boqs)}")
            log.info(f"  Migrated: {migrated_count}")
            log.info(f"  Skipped (already migrated): {skipped_count}")
            log.info(f"  Errors: {error_count}")
            log.info("Migration completed successfully!")
            log.info("=" * 80)
        except Exception as e:
            db.session.rollback()
            log.error(f"Failed to commit changes: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False

        return True


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("BOQ Negotiable Margin Migration Script")
    print("=" * 80)
    print("\nThis script will add negotiable_margin calculations to all existing BOQs.")
    print("\nFormula:")
    print("  negotiable_margin = client_amount - (materials + labour + misc + O&P + transport)")
    print("\n" + "=" * 80)

    response = input("\nDo you want to proceed? (yes/no): ").strip().lower()

    if response == 'yes':
        success = run_migration()
        if success:
            print("\n✅ Migration completed successfully!")
        else:
            print("\n❌ Migration failed. Check logs for details.")
    else:
        print("\n❌ Migration cancelled by user.")
