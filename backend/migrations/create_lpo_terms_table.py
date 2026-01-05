"""
Migration: Create lpo_terms table for LPO Payment Terms management
Similar to boq_terms structure - master list of payment terms
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv

load_dotenv()

def create_lpo_terms_table():
    """Create lpo_terms table with master payment terms"""
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
        print("CREATE LPO_TERMS TABLE MIGRATION")
        print("="*80)
        
        # Create lpo_terms table
        print("\n[1/3] Creating lpo_terms table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lpo_terms (
                term_id SERIAL PRIMARY KEY,
                term_text TEXT NOT NULL,
                term_type VARCHAR(50) DEFAULT 'payment',  -- 'payment', 'delivery', 'general'
                is_active BOOLEAN DEFAULT TRUE,
                is_deleted BOOLEAN DEFAULT FALSE,
                display_order INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(user_id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER REFERENCES users(user_id)
            );
        """)
        print("  ✓ Created lpo_terms table")
        
        # Create indexes
        print("\n[2/3] Creating indexes...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_lpo_terms_is_active_deleted
            ON lpo_terms(is_active, is_deleted);
        """)
        print("  ✓ Created index: idx_lpo_terms_is_active_deleted")
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_lpo_terms_type
            ON lpo_terms(term_type);
        """)
        print("  ✓ Created index: idx_lpo_terms_type")
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_lpo_terms_display_order
            ON lpo_terms(display_order);
        """)
        print("  ✓ Created index: idx_lpo_terms_display_order")
        
        # Insert default payment terms
        print("\n[3/3] Inserting default payment terms...")
        
        default_payment_terms = [
            ("100% CDC after delivery", "payment", 1),
            ("50% Advance, 50% after delivery", "payment", 2),
            ("30% Advance, 70% after delivery", "payment", 3),
            ("100% Advance", "payment", 4),
            ("Net 30 days", "payment", 5),
            ("Net 60 days", "payment", 6),
            ("Net 90 days", "payment", 7),
        ]
        
        default_delivery_terms = [
            ("Delivery within 7 working days", "delivery", 1),
            ("Delivery within 14 working days", "delivery", 2),
            ("Delivery within 30 days", "delivery", 3),
            ("Delivery as per project schedule", "delivery", 4),
        ]
        
        default_general_terms = [
            ("All materials must meet specified quality standards", "general", 1),
            ("Supplier must provide necessary certifications", "general", 2),
            ("Prices are valid for 30 days from quotation date", "general", 3),
            ("Supplier is responsible for safe packaging and delivery", "general", 4),
        ]
        
        all_terms = default_payment_terms + default_delivery_terms + default_general_terms
        
        for term_text, term_type, display_order in all_terms:
            cursor.execute("""
                INSERT INTO lpo_terms (term_text, term_type, display_order, is_active, is_deleted)
                VALUES (%s, %s, %s, TRUE, FALSE)
                ON CONFLICT DO NOTHING;
            """, (term_text, term_type, display_order))
        
        print(f"  ✓ Inserted {len(all_terms)} default terms")
        
        conn.commit()
        print("\n" + "="*80)
        print("✅ LPO_TERMS TABLE MIGRATION COMPLETED SUCCESSFULLY")
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
    create_lpo_terms_table()
