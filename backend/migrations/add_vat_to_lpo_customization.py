"""
Migration: Add VAT fields to lpo_customizations table
Date: 2025-12-19
"""

from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

def upgrade(database_url=None):
    """Add VAT fields to lpo_customizations table"""
    if database_url is None:
        database_url = os.getenv('DATABASE_URL')

    engine = create_engine(database_url)

    with engine.connect() as conn:
        try:
            # Check if columns exist before adding
            result = conn.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'lpo_customizations'
                AND column_name IN ('vat_percent', 'vat_amount')
            """))

            existing_columns = {row[0] for row in result}

            if 'vat_percent' not in existing_columns:
                conn.execute(text("""
                    ALTER TABLE lpo_customizations
                    ADD COLUMN vat_percent NUMERIC(5,2) DEFAULT 5.0
                """))
                conn.commit()
            else:
                pass

            if 'vat_amount' not in existing_columns:
                conn.execute(text("""
                    ALTER TABLE lpo_customizations
                    ADD COLUMN vat_amount NUMERIC(15,2) DEFAULT 0.0
                """))
                conn.commit()
            else:
                pass


        except Exception as e:
            conn.rollback()
            raise

def downgrade(database_url=None):
    """Remove VAT fields from lpo_customizations table"""
    if database_url is None:
        database_url = os.getenv('DATABASE_URL')

    engine = create_engine(database_url)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE lpo_customizations
                DROP COLUMN IF EXISTS vat_percent,
                DROP COLUMN IF EXISTS vat_amount
            """))
            conn.commit()

        except Exception as e:
            conn.rollback()
            raise

if __name__ == '__main__':

    # Run on PRODUCTION database
    prod_db_url = os.getenv('DATABASE_URL')
    upgrade(prod_db_url)

    # Run on DEVELOPMENT database
    dev_db_url = os.getenv('DEV_DATABASE_URL')
    if dev_db_url:
        upgrade(dev_db_url)
    else:
        pass

