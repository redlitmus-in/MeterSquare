"""
Migration: Create boq_terms table for Terms & Conditions management
Run this script to create the terms and conditions management system
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Database connection from DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL")

def run_migration():
    """Create boq_terms table"""
    conn = None
    cursor = None

    try:
        # Connect to database using DATABASE_URL
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        print("Creating boq_terms table...")

        # Create boq_terms table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS boq_terms (
                term_id SERIAL PRIMARY KEY,
                template_name VARCHAR(255) NOT NULL,
                terms_text TEXT NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_by INTEGER REFERENCES users(user_id),
                client_id INTEGER REFERENCES clients(client_id) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_template_name UNIQUE(template_name)
            );
        """)

        print("[OK] boq_terms table created")

        # Create index for faster queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_terms_is_default ON boq_terms(is_default);
            CREATE INDEX IF NOT EXISTS idx_boq_terms_client_id ON boq_terms(client_id);
            CREATE INDEX IF NOT EXISTS idx_boq_terms_is_active ON boq_terms(is_active);
        """)

        print("[OK] Indexes created")

        # Insert default Terms & Conditions
        cursor.execute("""
            INSERT INTO boq_terms (template_name, terms_text, is_default, is_active)
            VALUES (
                'Default Terms & Conditions',
                '• This quotation is valid for 30 days from the date of issue.
• Payment terms: 50% advance, 40% on delivery, 10% after installation.
• All prices are in AED and exclude VAT unless stated otherwise.
• Any changes to the scope of work after approval may incur additional charges.
• The client is responsible for providing access to the site during working hours.
• MeterSquare Interiors LLC reserves the right to modify terms with prior notice.',
                TRUE,
                TRUE
            )
            ON CONFLICT (template_name) DO NOTHING;
        """)

        print("[OK] Default Terms & Conditions inserted")

        # Commit the transaction
        conn.commit()
        print("\n[SUCCESS] Migration completed successfully!")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"\n[ERROR] Migration failed: {str(e)}")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    print("=" * 80)
    print("BOQ TERMS TABLE MIGRATION")
    print("=" * 80)
    run_migration()
    print("=" * 80)
