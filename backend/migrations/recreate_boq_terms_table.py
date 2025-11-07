"""
Migration: Recreate boq_terms table with proper structure for reusable T&C templates
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def run_migration():
    """Recreate boq_terms table with correct structure"""
    conn = None
    cursor = None

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        print("Dropping existing boq_terms table...")
        cursor.execute("DROP TABLE IF EXISTS boq_terms CASCADE;")
        print("[OK] Table dropped")

        print("\nCreating new boq_terms table with template structure...")
        cursor.execute("""
            CREATE TABLE boq_terms (
                term_id SERIAL PRIMARY KEY,
                template_name VARCHAR(255) NOT NULL UNIQUE,
                terms_text TEXT NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_by INTEGER,
                client_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("[OK] Table created with template structure")

        # Create indexes
        cursor.execute("""
            CREATE INDEX idx_boq_terms_is_default ON boq_terms(is_default) WHERE is_default = TRUE;
            CREATE INDEX idx_boq_terms_client_id ON boq_terms(client_id) WHERE client_id IS NOT NULL;
            CREATE INDEX idx_boq_terms_is_active ON boq_terms(is_active) WHERE is_active = TRUE;
        """)
        print("[OK] Indexes created")

        # Insert default Terms & Conditions template
        default_terms = """• This quotation is valid for 30 days from the date of issue.
• Payment terms: 50% advance, 40% on delivery, 10% after installation.
• All prices are in AED and exclude VAT unless stated otherwise.
• Any changes to the scope of work after approval may incur additional charges.
• The client is responsible for providing access to the site during working hours.
• MeterSquare Interiors LLC reserves the right to modify terms with prior notice."""

        cursor.execute("""
            INSERT INTO boq_terms (template_name, terms_text, is_default, is_active)
            VALUES (%s, %s, %s, %s);
        """, ('Default Terms & Conditions', default_terms, True, True))
        print("[OK] Default template inserted")

        # Insert a few more example templates
        flexible_payment_terms = """• This quotation is valid for 45 days from the date of issue.
• Payment terms: Flexible payment schedule available - contact us to discuss.
• All prices are in AED and exclude VAT unless stated otherwise.
• Project timeline and milestones will be mutually agreed upon.
• The client is responsible for providing access to the site during working hours."""

        cursor.execute("""
            INSERT INTO boq_terms (template_name, terms_text, is_default, is_active)
            VALUES (%s, %s, %s, %s);
        """, ('Flexible Payment Terms', flexible_payment_terms, False, True))
        print("[OK] Flexible payment template inserted")

        commercial_terms = """• This quotation is valid for 60 days from the date of issue.
• Payment terms: 30% advance, 30% at mid-point, 30% on completion, 10% after final inspection.
• All prices are in AED and exclude VAT unless stated otherwise.
• Insurance and safety compliance as per UAE regulations.
• Warranty period: 12 months from project completion date.
• The client is responsible for obtaining necessary permits and approvals."""

        cursor.execute("""
            INSERT INTO boq_terms (template_name, terms_text, is_default, is_active)
            VALUES (%s, %s, %s, %s);
        """, ('Commercial Project Terms', commercial_terms, False, True))
        print("[OK] Commercial project template inserted")

        # Commit the transaction
        conn.commit()
        print("\n[SUCCESS] Migration completed successfully!")
        print("\nTable structure:")
        print("  - term_id (PK)")
        print("  - template_name (UNIQUE)")
        print("  - terms_text (TEXT)")
        print("  - is_default (BOOLEAN)")
        print("  - is_active (BOOLEAN)")
        print("  - created_by (INT)")
        print("  - client_id (INT - for client-specific templates)")
        print("  - created_at, updated_at (TIMESTAMP)")
        print("\n3 sample templates inserted!")

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
    print("RECREATE BOQ_TERMS TABLE MIGRATION")
    print("=" * 80)
    run_migration()
    print("=" * 80)
