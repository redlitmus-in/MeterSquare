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
                print("Adding vat_percent column...")
                conn.execute(text("""
                    ALTER TABLE lpo_customizations
                    ADD COLUMN vat_percent NUMERIC(5,2) DEFAULT 5.0
                """))
                conn.commit()
                print("[OK] Added vat_percent column")
            else:
                print("vat_percent column already exists")

            if 'vat_amount' not in existing_columns:
                print("Adding vat_amount column...")
                conn.execute(text("""
                    ALTER TABLE lpo_customizations
                    ADD COLUMN vat_amount NUMERIC(15,2) DEFAULT 0.0
                """))
                conn.commit()
                print("[OK] Added vat_amount column")
            else:
                print("vat_amount column already exists")

            print("\n[SUCCESS] Migration completed successfully!")

        except Exception as e:
            print(f"[ERROR] Error during migration: {str(e)}")
            conn.rollback()
            raise

def downgrade(database_url=None):
    """Remove VAT fields from lpo_customizations table"""
    if database_url is None:
        database_url = os.getenv('DATABASE_URL')

    engine = create_engine(database_url)

    with engine.connect() as conn:
        try:
            print("Removing VAT columns...")
            conn.execute(text("""
                ALTER TABLE lpo_customizations
                DROP COLUMN IF EXISTS vat_percent,
                DROP COLUMN IF EXISTS vat_amount
            """))
            conn.commit()
            print("[OK] Removed VAT columns")

        except Exception as e:
            print(f"[ERROR] Error during downgrade: {str(e)}")
            conn.rollback()
            raise

if __name__ == '__main__':
    print("Running migration: Add VAT fields to lpo_customizations")
    print("=" * 60)

    # Run on PRODUCTION database
    print("\n>>> PRODUCTION DATABASE:")
    print("-" * 60)
    prod_db_url = os.getenv('DATABASE_URL')
    upgrade(prod_db_url)

    # Run on DEVELOPMENT database
    print("\n>>> DEVELOPMENT DATABASE:")
    print("-" * 60)
    dev_db_url = os.getenv('DEV_DATABASE_URL')
    if dev_db_url:
        upgrade(dev_db_url)
    else:
        print("DEV_DATABASE_URL not found, skipping development database")

    print("\n" + "=" * 60)
    print("[SUCCESS] Migration completed on ALL databases!")
