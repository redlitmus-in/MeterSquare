"""
Migration: Create Return Delivery Notes Tables
Purpose: Create tables to track material return delivery notes (RDN) similar to outbound delivery notes
Author: System
Date: 2025-12-11
"""

import os
import sys

# Add parent directory to path to import models
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config.db import db
from sqlalchemy import text


def create_return_delivery_notes_tables():
    """Create return_delivery_notes and return_delivery_note_items tables"""

    # Create return_delivery_notes table
    create_return_delivery_notes_sql = text("""
    CREATE TABLE IF NOT EXISTS return_delivery_notes (
        return_note_id SERIAL PRIMARY KEY,
        return_note_number VARCHAR(50) UNIQUE NOT NULL,
        project_id INTEGER NOT NULL REFERENCES project(project_id) ON DELETE RESTRICT,
        return_date TIMESTAMP NOT NULL,
        returned_by VARCHAR(255) NOT NULL,
        return_to VARCHAR(255) DEFAULT 'M2 Store',
        original_delivery_note_id INTEGER REFERENCES material_delivery_notes(delivery_note_id),
        vehicle_number VARCHAR(100),
        driver_name VARCHAR(255),
        driver_contact VARCHAR(50),
        prepared_by VARCHAR(255) NOT NULL,
        checked_by VARCHAR(255),
        status VARCHAR(20) DEFAULT 'DRAFT' NOT NULL CHECK (status IN ('DRAFT', 'ISSUED', 'IN_TRANSIT', 'RECEIVED', 'PARTIAL', 'CANCELLED')),
        notes TEXT,

        -- Store acceptance fields
        accepted_by VARCHAR(255),
        accepted_at TIMESTAMP,
        acceptance_notes TEXT,

        -- Audit fields
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_by VARCHAR(255) NOT NULL,
        last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_modified_by VARCHAR(255),
        issued_at TIMESTAMP,
        issued_by VARCHAR(255),
        dispatched_at TIMESTAMP,
        dispatched_by VARCHAR(255)
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_return_delivery_notes_project_id
        ON return_delivery_notes(project_id);
    CREATE INDEX IF NOT EXISTS idx_return_delivery_notes_status
        ON return_delivery_notes(status);
    CREATE INDEX IF NOT EXISTS idx_return_delivery_notes_return_date
        ON return_delivery_notes(return_date);
    CREATE INDEX IF NOT EXISTS idx_return_delivery_notes_created_at
        ON return_delivery_notes(created_at);
    CREATE INDEX IF NOT EXISTS idx_return_delivery_notes_number
        ON return_delivery_notes(return_note_number);
    CREATE INDEX IF NOT EXISTS idx_return_delivery_notes_original_dn
        ON return_delivery_notes(original_delivery_note_id);

    COMMENT ON TABLE return_delivery_notes IS 'Tracks material returns from sites to store with formal delivery notes';
    COMMENT ON COLUMN return_delivery_notes.return_note_number IS 'Unique RDN number (e.g., RDN-2025-001)';
    COMMENT ON COLUMN return_delivery_notes.status IS 'DRAFT, ISSUED, IN_TRANSIT, RECEIVED, PARTIAL, CANCELLED';
    COMMENT ON COLUMN return_delivery_notes.original_delivery_note_id IS 'Reference to original outbound delivery note';
    """)

    # Create return_delivery_note_items table
    create_return_note_items_sql = text("""
    CREATE TABLE IF NOT EXISTS return_delivery_note_items (
        return_item_id SERIAL PRIMARY KEY,
        return_note_id INTEGER NOT NULL REFERENCES return_delivery_notes(return_note_id) ON DELETE CASCADE,
        inventory_material_id INTEGER NOT NULL REFERENCES inventory_materials(inventory_material_id),
        original_delivery_note_item_id INTEGER REFERENCES delivery_note_items(item_id),
        material_return_id INTEGER REFERENCES material_returns(return_id),
        quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
        condition VARCHAR(20) NOT NULL CHECK (condition IN ('Good', 'Damaged', 'Defective')),
        return_reason TEXT,
        notes TEXT,

        -- Acceptance tracking
        quantity_accepted NUMERIC(12, 3) CHECK (quantity_accepted >= 0 AND (quantity_accepted IS NULL OR quantity_accepted <= quantity)),
        acceptance_status VARCHAR(20) CHECK (acceptance_status IS NULL OR acceptance_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'PARTIAL')),

        -- Link to transaction when stock is added back
        inventory_transaction_id INTEGER
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_return_note_items_note_id
        ON return_delivery_note_items(return_note_id);
    CREATE INDEX IF NOT EXISTS idx_return_note_items_material_id
        ON return_delivery_note_items(inventory_material_id);
    CREATE INDEX IF NOT EXISTS idx_return_note_items_original_dn_item
        ON return_delivery_note_items(original_delivery_note_item_id);
    CREATE INDEX IF NOT EXISTS idx_return_note_items_material_return
        ON return_delivery_note_items(material_return_id);
    CREATE INDEX IF NOT EXISTS idx_return_note_items_condition
        ON return_delivery_note_items(condition);
    CREATE INDEX IF NOT EXISTS idx_return_note_items_acceptance_status
        ON return_delivery_note_items(acceptance_status) WHERE acceptance_status IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_return_note_items_transaction_id
        ON return_delivery_note_items(inventory_transaction_id) WHERE inventory_transaction_id IS NOT NULL;

    -- Composite index for common queries
    CREATE INDEX IF NOT EXISTS idx_return_notes_project_status
        ON return_delivery_notes(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_return_notes_accepted_at
        ON return_delivery_notes(accepted_at) WHERE accepted_at IS NOT NULL;

    COMMENT ON TABLE return_delivery_note_items IS 'Individual materials in a return delivery note';
    COMMENT ON COLUMN return_delivery_note_items.condition IS 'Good, Damaged, or Defective';
    COMMENT ON COLUMN return_delivery_note_items.acceptance_status IS 'PENDING, ACCEPTED, REJECTED, PARTIAL';
    """)

    try:
        # Execute table creation
        db.session.execute(create_return_delivery_notes_sql)
        db.session.execute(create_return_note_items_sql)
        db.session.commit()
        print("✓ Return delivery notes tables created successfully")

        # Add foreign key to material_returns table to link with RDN
        add_rdn_to_returns_sql = text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'material_returns'
                AND column_name = 'return_delivery_note_id'
            ) THEN
                ALTER TABLE material_returns
                ADD COLUMN return_delivery_note_id INTEGER REFERENCES return_delivery_notes(return_note_id);

                CREATE INDEX IF NOT EXISTS idx_material_returns_rdn_id
                    ON material_returns(return_delivery_note_id);

                COMMENT ON COLUMN material_returns.return_delivery_note_id
                    IS 'Link to formal return delivery note if part of bulk return';
            END IF;
        END $$;
        """)

        db.session.execute(add_rdn_to_returns_sql)
        db.session.commit()
        print("✓ Added return_delivery_note_id to material_returns table")

        # Create sequence for RDN numbering
        create_sequence_sql = text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'return_note_number_seq'
            ) THEN
                CREATE SEQUENCE return_note_number_seq START 1;
            END IF;
        END $$;
        """)

        db.session.execute(create_sequence_sql)
        db.session.commit()
        print("✓ Created sequence for RDN numbering")

        return True

    except Exception as e:
        db.session.rollback()
        print(f"✗ Error creating return delivery notes tables: {str(e)}")
        return False


def rollback_return_delivery_notes_tables():
    """Drop return delivery notes tables (for rollback)"""

    rollback_sql = text("""
    -- Remove foreign key from material_returns
    ALTER TABLE IF EXISTS material_returns DROP COLUMN IF EXISTS return_delivery_note_id;

    -- Drop tables (cascade will handle foreign keys)
    DROP TABLE IF EXISTS return_delivery_note_items CASCADE;
    DROP TABLE IF EXISTS return_delivery_notes CASCADE;

    -- Drop sequence
    DROP SEQUENCE IF EXISTS return_note_number_seq;
    """)

    try:
        db.session.execute(rollback_sql)
        db.session.commit()
        print("✓ Return delivery notes tables rolled back successfully")
        return True
    except Exception as e:
        db.session.rollback()
        print(f"✗ Error rolling back return delivery notes tables: {str(e)}")
        return False


if __name__ == "__main__":
    from app import create_app

    app = create_app()
    with app.app_context():
        print("=== Creating Return Delivery Notes Tables ===")
        success = create_return_delivery_notes_tables()

        if success:
            print("\n✓ Migration completed successfully!")
            print("\nTables created:")
            print("  - return_delivery_notes")
            print("  - return_delivery_note_items")
            print("\nIndexes created for optimal query performance")
            print("Added return_delivery_note_id column to material_returns table")
        else:
            print("\n✗ Migration failed!")
