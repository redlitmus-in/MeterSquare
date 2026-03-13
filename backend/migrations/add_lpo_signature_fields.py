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
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN md_signature_image TEXT
                """))
            else:
                pass

            # Add md_name column
            if 'md_name' not in existing_columns:
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN md_name VARCHAR(255) DEFAULT 'Managing Director'
                """))
            else:
                pass

            # Add td_signature_image column
            if 'td_signature_image' not in existing_columns:
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN td_signature_image TEXT
                """))
            else:
                pass

            # Add td_name column
            if 'td_name' not in existing_columns:
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN td_name VARCHAR(255) DEFAULT 'Technical Director'
                """))
            else:
                pass

            # Add company_trn column
            if 'company_trn' not in existing_columns:
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN company_trn VARCHAR(50)
                """))
            else:
                pass

            # Add company_fax column
            if 'company_fax' not in existing_columns:
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN company_fax VARCHAR(50)
                """))
            else:
                pass

            # Add company_stamp_image column
            if 'company_stamp_image' not in existing_columns:
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN company_stamp_image TEXT
                """))
            else:
                pass

            # Add default_payment_terms column
            if 'default_payment_terms' not in existing_columns:
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN default_payment_terms TEXT DEFAULT '100% after delivery'
                """))
            else:
                pass

            # Add lpo_header_image column (for custom LPO header)
            if 'lpo_header_image' not in existing_columns:
                db.session.execute(text("""
                    ALTER TABLE system_settings
                    ADD COLUMN lpo_header_image TEXT
                """))
            else:
                pass

            db.session.commit()

        except Exception as e:
            db.session.rollback()
            raise e

if __name__ == '__main__':
    migrate()
