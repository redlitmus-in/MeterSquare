"""
Migration: Add Critical Performance Indexes
Date: 2025-12-17
Purpose: Add missing database indexes to improve query performance,
         particularly for Buyer, TD, and Estimator modules

This migration adds composite indexes for common query patterns to reduce query times
from 10-30 seconds to under 1 second for large datasets.
"""

from config.db import db
from sqlalchemy import text
import logging

log = logging.getLogger(__name__)

def upgrade():
    """Add missing performance indexes"""

    conn = db.engine.connect()
    trans = conn.begin()

    try:

        # ========== CHANGE REQUEST TABLE INDEXES ==========

        # Index for buyer-specific queries (heavily used in buyer_controller.py)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_cr_buyer_status
            ON change_requests(assigned_to_buyer_user_id, status)
            WHERE is_deleted = false AND assigned_to_buyer_user_id IS NOT NULL
        """))

        # Index for vendor selection status queries
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_cr_vendor_selection
            ON change_requests(vendor_selection_status, status)
            WHERE is_deleted = false
        """))

        # Index for combined status + vendor selection queries (pending purchases)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_cr_status_vendor_selection
            ON change_requests(status, vendor_selection_status, assigned_to_buyer_user_id)
            WHERE is_deleted = false
        """))

        # ========== PO_CHILD TABLE INDEXES ==========

        # Index for parent CR lookups (used in all purchase endpoints)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_po_child_parent_deleted
            ON po_child(parent_cr_id, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for vendor lookups
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_po_child_vendor_status
            ON po_child(vendor_id, vendor_selection_status)
            WHERE is_deleted = false AND vendor_id IS NOT NULL
        """))

        # Index for completed PO children queries
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_po_child_status_deleted
            ON po_child(status, is_deleted)
        """))

        # ========== INTERNAL MATERIAL REQUESTS TABLE INDEXES ==========

        # Index for CR-specific material requests (store requests)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_imr_cr_id
            ON internal_inventory_material_requests(cr_id)
            WHERE cr_id IS NOT NULL
        """))

        # Index for status-based queries
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_imr_status
            ON internal_inventory_material_requests(status, cr_id)
        """))

        # ========== BOQ TABLE INDEXES ==========

        # Index for email_sent + status queries (TD dashboard)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_boq_email_status
            ON boq(email_sent, status, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for project-specific BOQ queries with status
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_boq_project_status_deleted
            ON boq(project_id, status, is_deleted)
            WHERE is_deleted = false
        """))

        # ========== VENDORS TABLE INDEXES ==========

        # Index for deleted vendors (frequently filtered)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_deleted
            ON vendors(is_deleted, vendor_id)
            WHERE is_deleted = false
        """))

        trans.commit()

    except Exception as e:
        trans.rollback()
        log.error(f"[ERROR] Error creating performance indexes: {e}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        raise
    finally:
        conn.close()


def downgrade():
    """Remove performance indexes"""

    conn = db.engine.connect()
    trans = conn.begin()

    try:

        indexes = [
            "DROP INDEX IF EXISTS idx_cr_buyer_status",
            "DROP INDEX IF EXISTS idx_cr_vendor_selection",
            "DROP INDEX IF EXISTS idx_cr_status_vendor_selection",
            "DROP INDEX IF EXISTS idx_po_child_parent_deleted",
            "DROP INDEX IF EXISTS idx_po_child_vendor_status",
            "DROP INDEX IF EXISTS idx_po_child_status_deleted",
            "DROP INDEX IF EXISTS idx_imr_cr_id",
            "DROP INDEX IF EXISTS idx_imr_status",
            "DROP INDEX IF EXISTS idx_boq_email_status",
            "DROP INDEX IF EXISTS idx_boq_project_status_deleted",
            "DROP INDEX IF EXISTS idx_vendor_deleted"
        ]

        for index_sql in indexes:
            conn.execute(text(index_sql))

        trans.commit()

    except Exception as e:
        trans.rollback()
        log.error(f"[ERROR] Error dropping indexes: {e}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":

    # Initialize Flask app context
    from app import create_app

    app = create_app()

    with app.app_context():
        try:
            upgrade()
        except Exception as e:
            raise
