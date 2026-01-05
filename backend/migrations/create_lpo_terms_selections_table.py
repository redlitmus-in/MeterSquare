"""
Migration: Create lpo_terms_selections table
Stores selected term IDs for each LPO (similar to boq_terms_selections)
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv

load_dotenv()

def create_lpo_terms_selections_table():
    """Create lpo_terms_selections junction table"""
    try:
        # Database connection
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            database=os.getenv('DB_NAME', 'metersquare_erp'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD', 'postgres'),
            port=os.getenv('DB_PORT', '5432')
        )
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        print("\n" + "="*80)
        print("CREATE LPO_TERMS_SELECTIONS TABLE MIGRATION")
        print("="*80)
        
        # Create lpo_terms_selections table
        print("\n[1/2] Creating lpo_terms_selections table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lpo_terms_selections (
                id SERIAL PRIMARY KEY,
                cr_id INTEGER NOT NULL REFERENCES change_requests(cr_id) ON DELETE CASCADE,
                po_child_id INTEGER REFERENCES po_child(id) ON DELETE CASCADE,
                term_ids INTEGER[] NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(cr_id, po_child_id)
            );
        """)
        print("  ✓ Created lpo_terms_selections table")
        
        # Create indexes
        print("\n[2/2] Creating indexes...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_lpo_terms_selections_cr_id
            ON lpo_terms_selections(cr_id);
        """)
        print("  ✓ Created index: idx_lpo_terms_selections_cr_id")
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_lpo_terms_selections_po_child_id
            ON lpo_terms_selections(po_child_id);
        """)
        print("  ✓ Created index: idx_lpo_terms_selections_po_child_id")
        
        conn.commit()
        print("\n" + "="*80)
        print("✅ LPO_TERMS_SELECTIONS TABLE MIGRATION COMPLETED SUCCESSFULLY")
        print("="*80)
        
    except Exception as e:
        print(f"\n❌ Error during migration: {str(e)}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == '__main__':
    create_lpo_terms_selections_table()
