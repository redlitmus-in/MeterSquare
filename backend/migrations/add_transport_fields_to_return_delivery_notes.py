"""
Migration: Add Transport Fee and Delivery Note URL to Return Delivery Notes
Purpose: Add transport_fee and delivery_note_url columns to return_delivery_notes table
Author: System
Date: 2026-01-22
"""

import os
import sys

# Add parent directory to path to import models
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config.db import db
from sqlalchemy import text


def add_transport_fields_to_return_delivery_notes():
    """Add transport_fee and delivery_note_url columns to return_delivery_notes table"""

    add_columns_sql = text("""
    -- Add transport_fee column
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'return_delivery_notes'
            AND column_name = 'transport_fee'
        ) THEN
            ALTER TABLE return_delivery_notes
            ADD COLUMN transport_fee NUMERIC(10, 2) DEFAULT 0;

            COMMENT ON COLUMN return_delivery_notes.transport_fee
                IS 'Transport fee paid for returning materials from site to store (AED)';
        END IF;
    END $$;

    -- Add delivery_note_url column
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'return_delivery_notes'
            AND column_name = 'delivery_note_url'
        ) THEN
            ALTER TABLE return_delivery_notes
            ADD COLUMN delivery_note_url TEXT;

            COMMENT ON COLUMN return_delivery_notes.delivery_note_url
                IS 'URL to uploaded delivery note document from vendor (PDF, image, etc.)';
        END IF;
    END $$;
    """)

    try:
        db.session.execute(add_columns_sql)
        db.session.commit()
        print("✓ Added transport_fee and delivery_note_url columns to return_delivery_notes table")
        return True

    except Exception as e:
        db.session.rollback()
        print(f"✗ Error adding columns to return_delivery_notes: {str(e)}")
        return False


def rollback_transport_fields():
    """Remove transport_fee and delivery_note_url columns (for rollback)"""

    rollback_sql = text("""
    ALTER TABLE IF EXISTS return_delivery_notes DROP COLUMN IF EXISTS transport_fee;
    ALTER TABLE IF EXISTS return_delivery_notes DROP COLUMN IF EXISTS delivery_note_url;
    """)

    try:
        db.session.execute(rollback_sql)
        db.session.commit()
        print("✓ Removed transport_fee and delivery_note_url columns from return_delivery_notes table")
        return True
    except Exception as e:
        db.session.rollback()
        print(f"✗ Error removing columns from return_delivery_notes: {str(e)}")
        return False


if __name__ == "__main__":
    from app import create_app

    app = create_app()
    with app.app_context():
        print("=== Adding Transport Fields to Return Delivery Notes Table ===")
        success = add_transport_fields_to_return_delivery_notes()

        if success:
            print("\n✓ Migration completed successfully!")
            print("\nColumns added:")
            print("  - transport_fee (NUMERIC(10, 2))")
            print("  - delivery_note_url (TEXT)")
        else:
            print("\n✗ Migration failed!")
