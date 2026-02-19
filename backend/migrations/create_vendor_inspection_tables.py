"""
Migration: Create vendor delivery inspection and return tables
Purpose: Support quality inspection of vendor deliveries at M2 Store
         and return-to-vendor flow (refund/replacement/new vendor)

Tables Created:
  1. vendor_delivery_inspections - PM inspection records
  2. vendor_return_requests - Buyer return requests with TD approval
  3. inspection_iteration_tracker - Parent-child numbering for re-purchases

Columns Added:
  - change_requests.inspection_status
  - po_child.inspection_status
  - po_child.delivery_routing (if not exists)
  - po_child.store_request_status (if not exists)

Author: Claude Code
Date: 2026-02-16
"""

import psycopg2
import os


def run_migration():
    """Create vendor inspection and return tables"""

    conn = None
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print("\n" + "=" * 60)
        print("VENDOR DELIVERY INSPECTION MIGRATION")
        print("=" * 60)
        print("\nConnected to database successfully")
        print("\nThis migration adds support for quality inspection of")
        print("vendor deliveries and return-to-vendor workflow.\n")

        # ========================================
        # TABLE 1: vendor_delivery_inspections
        # ========================================

        print("1/6 Creating vendor_delivery_inspections table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vendor_delivery_inspections (
                id SERIAL PRIMARY KEY,
                cr_id INTEGER NOT NULL REFERENCES change_requests(cr_id),
                po_child_id INTEGER REFERENCES po_child(id),
                imr_id INTEGER REFERENCES internal_inventory_material_requests(request_id),
                vendor_id INTEGER REFERENCES vendors(vendor_id),

                -- Inspection Decision
                inspection_status VARCHAR(30) NOT NULL DEFAULT 'pending',
                inspected_by_user_id INTEGER NOT NULL,
                inspected_by_name VARCHAR(255) NOT NULL,
                inspected_at TIMESTAMP,

                -- Per-material inspection results (JSONB array)
                materials_inspection JSONB NOT NULL DEFAULT '[]'::jsonb,

                -- Overall notes and category
                overall_notes TEXT,
                overall_rejection_category VARCHAR(50),

                -- Evidence (photos/videos uploaded to Supabase Storage)
                evidence_urls JSONB DEFAULT '[]'::jsonb,

                -- Iteration tracking
                iteration_number INTEGER DEFAULT 0,
                parent_inspection_id INTEGER REFERENCES vendor_delivery_inspections(id),

                -- Metadata
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                created_by INTEGER NOT NULL,
                is_deleted BOOLEAN DEFAULT FALSE
            )
        """)
        print("  vendor_delivery_inspections table created")

        # ========================================
        # TABLE 2: vendor_return_requests
        # ========================================

        print("2/6 Creating vendor_return_requests table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vendor_return_requests (
                id SERIAL PRIMARY KEY,
                inspection_id INTEGER NOT NULL REFERENCES vendor_delivery_inspections(id),
                cr_id INTEGER NOT NULL REFERENCES change_requests(cr_id),
                po_child_id INTEGER REFERENCES po_child(id),
                vendor_id INTEGER NOT NULL REFERENCES vendors(vendor_id),
                vendor_name VARCHAR(255),

                -- Return request details
                return_request_number VARCHAR(50) UNIQUE NOT NULL,
                resolution_type VARCHAR(30) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'pending_td_approval',

                -- Rejected materials data
                rejected_materials JSONB NOT NULL DEFAULT '[]'::jsonb,
                total_rejected_value FLOAT DEFAULT 0.0,

                -- SLA / Deadline (optional)
                sla_deadline TIMESTAMP,
                sla_notes TEXT,

                -- Buyer info
                created_by_buyer_id INTEGER NOT NULL,
                created_by_buyer_name VARCHAR(255),
                buyer_notes TEXT,

                -- TD Approval
                td_approved_by_id INTEGER,
                td_approved_by_name VARCHAR(255),
                td_approval_date TIMESTAMP,
                td_rejection_reason TEXT,

                -- Return tracking
                return_initiated_at TIMESTAMP,
                return_confirmed_at TIMESTAMP,
                vendor_return_reference VARCHAR(100),

                -- Financial tracking
                credit_note_number VARCHAR(100),
                credit_note_amount FLOAT DEFAULT 0.0,
                credit_note_date TIMESTAMP,
                lpo_adjustment_amount FLOAT DEFAULT 0.0,

                -- New vendor fields (resolution_type='new_vendor')
                new_vendor_id INTEGER REFERENCES vendors(vendor_id),
                new_vendor_name VARCHAR(255),
                new_vendor_status VARCHAR(30),
                new_lpo_id INTEGER,

                -- Replacement tracking (resolution_type='replacement')
                replacement_expected_date TIMESTAMP,
                replacement_inspection_id INTEGER REFERENCES vendor_delivery_inspections(id),

                -- Metadata
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                is_deleted BOOLEAN DEFAULT FALSE
            )
        """)
        print("  vendor_return_requests table created")

        # ========================================
        # TABLE 3: inspection_iteration_tracker
        # ========================================

        print("3/6 Creating inspection_iteration_tracker table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS inspection_iteration_tracker (
                id SERIAL PRIMARY KEY,
                cr_id INTEGER NOT NULL REFERENCES change_requests(cr_id),
                po_child_id INTEGER REFERENCES po_child(id),
                iteration_suffix VARCHAR(20) NOT NULL,
                parent_iteration_id INTEGER REFERENCES inspection_iteration_tracker(id),

                -- Context
                inspection_id INTEGER REFERENCES vendor_delivery_inspections(id),
                return_request_id INTEGER REFERENCES vendor_return_requests(id),
                resolution_type VARCHAR(30),

                -- New vendor/LPO tracking
                vendor_id INTEGER REFERENCES vendors(vendor_id),
                vendor_name VARCHAR(255),
                new_po_child_id INTEGER REFERENCES po_child(id),

                -- Status
                status VARCHAR(30) DEFAULT 'active',

                -- Metadata
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                created_by INTEGER NOT NULL,
                is_deleted BOOLEAN DEFAULT FALSE
            )
        """)
        print("  inspection_iteration_tracker table created")

        # ========================================
        # ALTER EXISTING TABLES
        # ========================================

        print("4/6 Adding inspection_status to change_requests...")
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS inspection_status VARCHAR(30)
        """)
        print("  change_requests.inspection_status added")

        print("5/6 Adding columns to po_child...")
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS inspection_status VARCHAR(30)
        """)
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS delivery_routing VARCHAR(50) DEFAULT 'direct_to_site'
        """)
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS store_request_status VARCHAR(50)
        """)
        print("  po_child columns added")

        # ========================================
        # INDEXES
        # ========================================

        print("6/6 Creating indexes...")

        # vendor_delivery_inspections indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vdi_cr_id ON vendor_delivery_inspections(cr_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vdi_po_child_id ON vendor_delivery_inspections(po_child_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vdi_status ON vendor_delivery_inspections(inspection_status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vdi_vendor_id ON vendor_delivery_inspections(vendor_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vdi_deleted_status ON vendor_delivery_inspections(is_deleted, inspection_status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vdi_imr_id ON vendor_delivery_inspections(imr_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vdi_created_at_desc ON vendor_delivery_inspections(created_at DESC)")

        # vendor_return_requests indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vrr_inspection_id ON vendor_return_requests(inspection_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vrr_cr_id ON vendor_return_requests(cr_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vrr_vendor_id ON vendor_return_requests(vendor_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vrr_status ON vendor_return_requests(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vrr_resolution ON vendor_return_requests(resolution_type, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vrr_deleted_status ON vendor_return_requests(is_deleted, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vrr_buyer ON vendor_return_requests(created_by_buyer_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vrr_created_at_desc ON vendor_return_requests(created_at DESC)")

        # inspection_iteration_tracker indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_iit_cr_id ON inspection_iteration_tracker(cr_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_iit_parent ON inspection_iteration_tracker(parent_iteration_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_iit_suffix ON inspection_iteration_tracker(cr_id, iteration_suffix)")

        print("  All indexes created")

        cursor.close()

        print("\n" + "=" * 60)
        print("MIGRATION COMPLETED SUCCESSFULLY")
        print("=" * 60)
        print("\nTables created:")
        print("  1. vendor_delivery_inspections")
        print("  2. vendor_return_requests")
        print("  3. inspection_iteration_tracker")
        print("\nColumns added:")
        print("  - change_requests.inspection_status")
        print("  - po_child.inspection_status")
        print("  - po_child.delivery_routing (if not existed)")
        print("  - po_child.store_request_status (if not existed)")
        print("=" * 60 + "\n")

    except Exception as e:
        print(f"\nMIGRATION FAILED: {str(e)}\n")
        raise

    finally:
        if conn:
            conn.close()
            print("Database connection closed\n")


def rollback_migration():
    """Remove vendor inspection tables and columns (rollback)"""

    conn = None
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print("\n" + "=" * 60)
        print("ROLLING BACK VENDOR INSPECTION MIGRATION")
        print("=" * 60 + "\n")

        # Drop tables in reverse dependency order
        print("Dropping tables...")
        cursor.execute("DROP TABLE IF EXISTS inspection_iteration_tracker CASCADE")
        cursor.execute("DROP TABLE IF EXISTS vendor_return_requests CASCADE")
        cursor.execute("DROP TABLE IF EXISTS vendor_delivery_inspections CASCADE")

        # Remove added columns
        print("Removing added columns...")
        cursor.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS inspection_status")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS inspection_status")
        # Note: NOT removing delivery_routing and store_request_status from po_child
        # as they may have been added by a different migration

        print("\nROLLBACK COMPLETED SUCCESSFULLY\n")

        cursor.close()

    except Exception as e:
        print(f"\nROLLBACK FAILED: {str(e)}\n")
        raise

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    """Run migration directly"""
    run_migration()
