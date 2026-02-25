"""
Get Actual Transport Fee for a Project
Used by BOQ Tracking Controller to calculate real transport spending
"""

from sqlalchemy import text
from config.db import db
from decimal import Decimal


def get_actual_transport_for_project(project_id):
    """
    Get total actual transport fees spent for a project

    Sums transport fees from ALL 6 sources:
    1. inventory_transactions.transport_fee (Vendor → Store)
    2. material_delivery_notes.transport_fee (Store → Site)
    3. return_delivery_notes.transport_fee (Site → Store)
    4. asset_delivery_notes.transport_fee (Asset delivery)
    5. asset_return_delivery_notes.transport_fee (Asset return)
    6. labour_requisitions.transport_fee (Labour transport)

    Args:
        project_id (int): Project ID

    Returns:
        Decimal: Total actual transport fees
    """

    query = text("""
        SELECT
            -- 1. Inventory Transport (Vendor → Store)
            COALESCE((
                SELECT SUM(transport_fee)
                FROM inventory_transactions
                WHERE project_id = :project_id
                  AND transaction_type = 'PURCHASE'
                  AND transport_fee IS NOT NULL
            ), 0) AS vendor_to_store_transport,

            -- 2. Material Delivery Transport (Store → Site)
            COALESCE((
                SELECT SUM(transport_fee)
                FROM material_delivery_notes
                WHERE project_id = :project_id
                  AND transport_fee IS NOT NULL
            ), 0) AS store_to_site_transport,

            -- 3. Material Return Transport (Site → Store)
            COALESCE((
                SELECT SUM(transport_fee)
                FROM return_delivery_notes
                WHERE project_id = :project_id
                  AND transport_fee IS NOT NULL
            ), 0) AS site_to_store_transport,

            -- 4. Asset Delivery Transport (Store → Site)
            COALESCE((
                SELECT SUM(transport_fee)
                FROM asset_delivery_notes
                WHERE project_id = :project_id
                  AND transport_fee IS NOT NULL
            ), 0) AS asset_delivery_transport,

            -- 5. Asset Return Transport (Site → Store)
            COALESCE((
                SELECT SUM(transport_fee)
                FROM asset_return_delivery_notes
                WHERE project_id = :project_id
                  AND transport_fee IS NOT NULL
            ), 0) AS asset_return_transport,

            -- 6. Labour Transport (Labour → Site)
            COALESCE((
                SELECT SUM(transport_fee)
                FROM labour_requisitions
                WHERE project_id = :project_id
                  AND transport_fee IS NOT NULL
                  AND is_deleted = FALSE
            ), 0) AS labour_transport
    """)

    result = db.session.execute(query, {'project_id': project_id}).fetchone()

    if not result:
        return Decimal('0')

    # Sum all transport fees - convert each to Decimal first to avoid type mixing
    vendor_to_store = Decimal(str(result.vendor_to_store_transport or 0))
    store_to_site = Decimal(str(result.store_to_site_transport or 0))
    site_to_store = Decimal(str(result.site_to_store_transport or 0))
    asset_delivery = Decimal(str(result.asset_delivery_transport or 0))
    asset_return = Decimal(str(result.asset_return_transport or 0))
    labour_transport = Decimal(str(result.labour_transport or 0))

    total_transport = vendor_to_store + store_to_site + site_to_store + asset_delivery + asset_return + labour_transport

    return total_transport


def get_actual_transport_breakdown(project_id):
    """
    Get detailed breakdown of actual transport fees for a project

    Returns:
        dict: Breakdown of transport fees by source
    """

    query = text("""
        SELECT
            COALESCE((SELECT SUM(transport_fee) FROM inventory_transactions WHERE project_id = :project_id AND transaction_type = 'PURCHASE'), 0) AS vendor_to_store,
            COALESCE((SELECT SUM(transport_fee) FROM material_delivery_notes WHERE project_id = :project_id), 0) AS store_to_site,
            COALESCE((SELECT SUM(transport_fee) FROM return_delivery_notes WHERE project_id = :project_id), 0) AS site_to_store,
            COALESCE((SELECT SUM(transport_fee) FROM asset_delivery_notes WHERE project_id = :project_id), 0) AS asset_delivery,
            COALESCE((SELECT SUM(transport_fee) FROM asset_return_delivery_notes WHERE project_id = :project_id), 0) AS asset_return,
            COALESCE((SELECT SUM(transport_fee) FROM labour_requisitions WHERE project_id = :project_id AND is_deleted = FALSE), 0) AS labour_transport
    """)

    result = db.session.execute(query, {'project_id': project_id}).fetchone()

    if not result:
        return {
            'vendor_to_store': 0.0,
            'store_to_site': 0.0,
            'site_to_store': 0.0,
            'asset_delivery': 0.0,
            'asset_return': 0.0,
            'labour_transport': 0.0,
            'total': 0.0
        }

    # Convert to Decimal first, then to float for JSON serialization
    vendor_to_store = float(Decimal(str(result.vendor_to_store or 0)))
    store_to_site = float(Decimal(str(result.store_to_site or 0)))
    site_to_store = float(Decimal(str(result.site_to_store or 0)))
    asset_delivery = float(Decimal(str(result.asset_delivery or 0)))
    asset_return = float(Decimal(str(result.asset_return or 0)))
    labour_transport = float(Decimal(str(result.labour_transport or 0)))

    total = vendor_to_store + store_to_site + site_to_store + asset_delivery + asset_return + labour_transport

    return {
        'vendor_to_store': vendor_to_store,
        'store_to_site': store_to_site,
        'site_to_store': site_to_store,
        'asset_delivery': asset_delivery,
        'asset_return': asset_return,
        'labour_transport': labour_transport,
        'total': total
    }
