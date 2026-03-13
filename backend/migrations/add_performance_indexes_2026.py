"""
Migration: Add performance indexes for frequently-filtered columns

These indexes target the most common filter patterns found in inventory,
delivery note, and transaction queries. Without them, every query performs
a full table scan — at ~350ms per Supabase round trip, this multiplies
load times significantly.

Run:    python migrations/add_performance_indexes_2026.py
Revert: python migrations/add_performance_indexes_2026.py --downgrade

All indexes use CREATE INDEX IF NOT EXISTS — safe to run multiple times.

Author: Claude Code
Date: 2026-03-09
"""

import os
import sys
from sqlalchemy import create_engine, text
from config.logging import get_logger

log = get_logger()

DATABASE_URL = os.environ.get('DATABASE_URL')


def upgrade():
    """Add missing performance indexes"""
    if not DATABASE_URL:
        log.error("DATABASE_URL not set in environment. Export it before running.")
        sys.exit(1)

    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:

        try:
            # ── internal_inventory_material_requests ──────────────────────
            # Filtered by project_id + status on every IMR list view
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_imr_project_status
                ON internal_inventory_material_requests(project_id, status);
            """))

            # Filtered by cr_id + status on purchase completion
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_imr_cr_status
                ON internal_inventory_material_requests(cr_id, status)
                WHERE cr_id IS NOT NULL;
            """))

            # status alone (PENDING list queries)
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_imr_status
                ON internal_inventory_material_requests(status);
            """))

            # ── material_delivery_notes ───────────────────────────────────
            # Filtered by project_id + status on SE delivery views
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_mdn_project_status
                ON material_delivery_notes(project_id, status)
                WHERE project_id IS NOT NULL;
            """))

            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_mdn_status
                ON material_delivery_notes(status);
            """))

            # ── return_delivery_notes ─────────────────────────────────────
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_rdn_project_status
                ON return_delivery_notes(project_id, status);
            """))

            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_rdn_status
                ON return_delivery_notes(status);
            """))

            # ── inventory_transactions ────────────────────────────────────
            # Used in stock history queries — material + type + recency
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_inv_tx_material_type
                ON inventory_transactions(inventory_material_id, transaction_type, created_at DESC);
            """))

            conn.commit()


        except Exception as e:
            log.error(f"Error creating indexes: {str(e)}")
            conn.rollback()
            raise


def downgrade():
    """Drop the indexes (rollback)"""
    if not DATABASE_URL:
        log.error("DATABASE_URL not set in environment.")
        sys.exit(1)

    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("DROP INDEX IF EXISTS idx_imr_project_status;"))
            conn.execute(text("DROP INDEX IF EXISTS idx_imr_cr_status;"))
            conn.execute(text("DROP INDEX IF EXISTS idx_imr_status;"))
            conn.execute(text("DROP INDEX IF EXISTS idx_mdn_project_status;"))
            conn.execute(text("DROP INDEX IF EXISTS idx_mdn_status;"))
            conn.execute(text("DROP INDEX IF EXISTS idx_rdn_project_status;"))
            conn.execute(text("DROP INDEX IF EXISTS idx_rdn_status;"))
            conn.execute(text("DROP INDEX IF EXISTS idx_inv_tx_material_type;"))
            conn.commit()
        except Exception as e:
            log.error(f"Error during rollback: {str(e)}")
            conn.rollback()
            raise


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--downgrade":
        downgrade()
    else:
        upgrade()
