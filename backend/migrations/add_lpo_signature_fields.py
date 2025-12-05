"""
Migration: Add LPO signature fields to system_settings table
Run this script to add MD/TD signature fields for LPO PDF generation
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app
from sqlalchemy import text

def migrate():
    """Add MD/TD signature and company fields to system_settings"""
    app = create_app()

    with app.app_context():
        try:
            # Check which columns already exist
            check_query = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'system_settings'
                AND column_name IN (
                    'md_signature_image', 'md_name',
                    'td_signature_image', 'td_name',
                    'company_trn', 'company_fax',
                    'company_stamp_image', 'default_payment_terms',
                    'lpo_header_image'
                )
            """)
            result = db.session.execute(check_query)
            existing_columns = [row[0] for row in result]

            # Add md_signature_image column
            if 'md_signature_image' not in existing_columns:
                print("Adding md_signature_image column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN md_signature_image TEXT
                """))
                print("  md_signature_image column added successfully")
            else:
                print("  md_signature_image column already exists")

            # Add md_name column
            if 'md_name' not in existing_columns:
                print("Adding md_name column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN md_name VARCHAR(255) DEFAULT 'Managing Director'
                """))
                print("  md_name column added successfully")
            else:
                print("  md_name column already exists")

            # Add td_signature_image column
            if 'td_signature_image' not in existing_columns:
                print("Adding td_signature_image column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN td_signature_image TEXT
                """))
                print("  td_signature_image column added successfully")
            else:
                print("  td_signature_image column already exists")

            # Add td_name column
            if 'td_name' not in existing_columns:
                print("Adding td_name column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN td_name VARCHAR(255) DEFAULT 'Technical Director'
                """))
                print("  td_name column added successfully")
            else:
                print("  td_name column already exists")

            # Add company_trn column
            if 'company_trn' not in existing_columns:
                print("Adding company_trn column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN company_trn VARCHAR(50)
                """))
                print("  company_trn column added successfully")
            else:
                print("  company_trn column already exists")

            # Add company_fax column
            if 'company_fax' not in existing_columns:
                print("Adding company_fax column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN company_fax VARCHAR(50)
                """))
                print("  company_fax column added successfully")
            else:
                print("  company_fax column already exists")

            # Add company_stamp_image column
            if 'company_stamp_image' not in existing_columns:
                print("Adding company_stamp_image column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN company_stamp_image TEXT
                """))
                print("  company_stamp_image column added successfully")
            else:
                print("  company_stamp_image column already exists")

            # Add default_payment_terms column
            if 'default_payment_terms' not in existing_columns:
                print("Adding default_payment_terms column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN default_payment_terms TEXT DEFAULT '100% after delivery'
                """))
                print("  default_payment_terms column added successfully")
            else:
                print("  default_payment_terms column already exists")

            # Add lpo_header_image column (for custom LPO header)
            if 'lpo_header_image' not in existing_columns:
                print("Adding lpo_header_image column...")
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN lpo_header_image TEXT
                """))
                print("  lpo_header_image column added successfully")
            else:
                print("  lpo_header_image column already exists")

            db.session.commit()
            print("\n[SUCCESS] Migration completed successfully!")
            print("New fields added for LPO PDF generation:")
            print("  - md_signature_image: Managing Director signature")
            print("  - md_name: Managing Director name")
            print("  - td_signature_image: Technical Director signature")
            print("  - td_name: Technical Director name")
            print("  - company_trn: Company TRN number")
            print("  - company_fax: Company fax number")
            print("  - company_stamp_image: Company stamp/seal image")
            print("  - default_payment_terms: Default payment terms for LPO")
            print("  - lpo_header_image: Custom LPO header image")

        except Exception as e:
            db.session.rollback()
            print(f"\n[ERROR] Migration failed: {str(e)}")
            raise e

if __name__ == '__main__':
    migrate()
