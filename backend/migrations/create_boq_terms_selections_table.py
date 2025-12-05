import psycopg2
from psycopg2 import sql
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """
    Migration to create boq_terms_selections table and update boq_terms table
    This enables the terms & conditions selection system similar to preliminaries
    """

    # Database connection parameters from environment
    db_config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'database': os.getenv('DB_NAME', 'metersquare'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', 'postgres'),
        'port': os.getenv('DB_PORT', '5432')
    }

    conn = None
    cur = None

    try:
        print("=" * 60)
        print("TERMS & CONDITIONS MIGRATION - START")
        print("=" * 60)

        conn = psycopg2.connect(**db_config)
        cur = conn.cursor()

        # ===== STEP 1: Update boq_terms table =====
        print("\n[1/4] Updating boq_terms table...")

        # Add display_order column
        cur.execute("""
            ALTER TABLE boq_terms
            ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
        """)
        print("  ✓ Added display_order column")

        # Add is_deleted column
        cur.execute("""
            ALTER TABLE boq_terms
            ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
        """)
        print("  ✓ Added is_deleted column")

        # Make template_name nullable (we're focusing on terms_text only)
        cur.execute("""
            ALTER TABLE boq_terms
            ALTER COLUMN template_name DROP NOT NULL;
        """)
        print("  ✓ Made template_name nullable")

        # Create indexes for better query performance
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_terms_is_active_deleted
            ON boq_terms(is_active, is_deleted);
        """)
        print("  ✓ Created index: idx_boq_terms_is_active_deleted")

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_terms_display_order
            ON boq_terms(display_order);
        """)
        print("  ✓ Created index: idx_boq_terms_display_order")

        # ===== STEP 2: Create boq_terms_selections junction table =====
        print("\n[2/4] Creating boq_terms_selections table...")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS boq_terms_selections (
                id SERIAL PRIMARY KEY,
                boq_id INTEGER NOT NULL REFERENCES boq(boq_id) ON DELETE CASCADE,
                term_id INTEGER NOT NULL REFERENCES boq_terms(term_id) ON DELETE CASCADE,
                is_checked BOOLEAN DEFAULT FALSE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_boq_term UNIQUE(boq_id, term_id)
            );
        """)
        print("  ✓ Created boq_terms_selections table")

        # Create indexes for junction table
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_terms_selections_boq_id
            ON boq_terms_selections(boq_id);
        """)
        print("  ✓ Created index: idx_boq_terms_selections_boq_id")

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_terms_selections_term_id
            ON boq_terms_selections(term_id);
        """)
        print("  ✓ Created index: idx_boq_terms_selections_term_id")

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_terms_selections_is_checked
            ON boq_terms_selections(is_checked);
        """)
        print("  ✓ Created index: idx_boq_terms_selections_is_checked")

        # Create trigger function for updated_at
        cur.execute("""
            CREATE OR REPLACE FUNCTION update_boq_terms_selections_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)
        print("  ✓ Created trigger function: update_boq_terms_selections_updated_at")

        # Drop trigger if exists and create new one
        cur.execute("""
            DROP TRIGGER IF EXISTS trigger_update_boq_terms_selections_updated_at
            ON boq_terms_selections;
        """)

        cur.execute("""
            CREATE TRIGGER trigger_update_boq_terms_selections_updated_at
            BEFORE UPDATE ON boq_terms_selections
            FOR EACH ROW
            EXECUTE FUNCTION update_boq_terms_selections_updated_at();
        """)
        print("  ✓ Created trigger: trigger_update_boq_terms_selections_updated_at")

        # ===== STEP 3: Clear old terms and insert default terms =====
        print("\n[3/4] Inserting default terms...")

        # Clear existing terms that might be from old system
        cur.execute("""
            DELETE FROM boq_terms WHERE template_name IS NULL OR template_name = '';
        """)

        # Default terms based on the PDF example
        default_terms = [
            "This quotation is valid for 30 days from the date of issue.",
            "Payment terms: 50% advance, 40% on delivery, 10% after installation.",
            "All prices are in AED and exclude VAT unless stated otherwise.",
            "Any changes to the scope of work after approval may incur additional charges.",
            "The client is responsible for providing access to the site during working hours.",
            "MeterSquare Interiors LLC reserves the right to modify terms with prior notice.",
            "Water and electricity during execution period shall be arranged by client FOC.",
            "All materials are subject to availability.",
            "VAT is excluded in this offer. VAT is applicable as per law.",
            "Access or entry pass to site be provided by the client or the charge shall be reimbursed.",
            "Any addition or deletion of items can be done upon mutual agreement.",
            "All variations to be registered either by email or through written document approved by project manager.",
            "MeterSquare will not be responsible for delays caused by shop drawing approval delays or site not ready.",
            "Completion period: 40 working days after drawing and sample approval (subject to material availability).",
            "Material is available only after 4-5 weeks.",
            "Condition of Contract: As per FIDIC Condition of Contract for Civil engineering works Fourth Edition 1987."
        ]

        inserted_count = 0
        for idx, term in enumerate(default_terms, 1):
            cur.execute("""
                INSERT INTO boq_terms (terms_text, is_active, is_deleted, display_order, created_at, updated_at)
                VALUES (%s, TRUE, FALSE, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT DO NOTHING;
            """, (term, idx))
            if cur.rowcount > 0:
                inserted_count += 1

        print(f"  ✓ Inserted {inserted_count} default terms")

        # ===== STEP 4: Commit changes =====
        print("\n[4/4] Committing changes...")
        conn.commit()
        print("  ✓ All changes committed successfully")

        # ===== VERIFICATION =====
        print("\n" + "=" * 60)
        print("VERIFICATION")
        print("=" * 60)

        # Count terms in master table
        cur.execute("SELECT COUNT(*) FROM boq_terms WHERE is_active = TRUE AND is_deleted = FALSE;")
        terms_count = cur.fetchone()[0]
        print(f"  • Active terms in boq_terms: {terms_count}")

        # Check if junction table exists
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = 'boq_terms_selections';
        """)
        table_exists = cur.fetchone()[0]
        print(f"  • boq_terms_selections table exists: {'Yes' if table_exists else 'No'}")

        # Check indexes
        cur.execute("""
            SELECT COUNT(*) FROM pg_indexes
            WHERE tablename IN ('boq_terms', 'boq_terms_selections');
        """)
        indexes_count = cur.fetchone()[0]
        print(f"  • Total indexes created: {indexes_count}")

        print("\n" + "=" * 60)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 60)
        print("\nNext steps:")
        print("  1. Restart the backend server")
        print("  2. Test the terms selection in BOQ creation")
        print("  3. Verify PDF generation includes selected terms")
        print("\n")

    except Exception as e:
        if conn:
            conn.rollback()
        print("\n" + "=" * 60)
        print("❌ MIGRATION FAILED!")
        print("=" * 60)
        print(f"Error: {str(e)}")
        print("\nChanges have been rolled back.")
        raise

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    run_migration()
