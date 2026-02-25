"""
Migration: Add delivery_note_url field to material_delivery_notes table and remove transport_fee
Date: 2026-01-22
Purpose: Replace transport_fee with delivery_note_url to store uploaded delivery note files from vendors

IMPORTANT: This script should be run manually by the developer.
Database: Run on DEVELOP database only

Usage:
    python migrations/add_delivery_note_url_to_material_delivery_notes.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from config.db import db
from sqlalchemy import text

# Create a minimal Flask app for migration context
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', '')
db.init_app(app)

def upgrade():
    """Add delivery_note_url and remove transport_fee from material_delivery_notes table"""
    try:
        with app.app_context():
            with db.engine.connect() as conn:
                # Add delivery_note_url column
                conn.execute(text("""
                    ALTER TABLE material_delivery_notes
                    ADD COLUMN IF NOT EXISTS delivery_note_url TEXT;
                """))
                conn.commit()
                print("✓ Successfully added delivery_note_url to material_delivery_notes")
                print("  - delivery_note_url (TEXT)")

                # Remove transport_fee column
                conn.execute(text("""
                    ALTER TABLE material_delivery_notes
                    DROP COLUMN IF EXISTS transport_fee;
                """))
                conn.commit()
                print("✓ Successfully removed transport_fee from material_delivery_notes")
    except Exception as e:
        print(f"✗ Error during migration: {e}")
        raise

def downgrade():
    """Remove delivery_note_url and add back transport_fee to material_delivery_notes table"""
    try:
        with db.engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE material_delivery_notes
                DROP COLUMN IF EXISTS delivery_note_url;
            """))
            conn.commit()
            print("✓ Successfully removed delivery_note_url from material_delivery_notes")

            conn.execute(text("""
                ALTER TABLE material_delivery_notes
                ADD COLUMN IF NOT EXISTS transport_fee FLOAT DEFAULT 0.0;
            """))
            conn.commit()
            print("✓ Successfully added back transport_fee to material_delivery_notes")
    except Exception as e:
        print(f"✗ Error during rollback: {e}")
        raise

if __name__ == '__main__':
    print("=" * 70)
    print("Migration: Add delivery_note_url to material_delivery_notes")
    print("=" * 70)
    print("\nThis migration:")
    print("  1. Adds delivery_note_url column to store uploaded files")
    print("  2. Removes transport_fee column (no longer needed)")
    print("\nTarget: DEVELOP database only")
    print("\nStarting migration...\n")

    upgrade()

    print("\n" + "=" * 70)
    print("Migration complete!")
    print("=" * 70)
