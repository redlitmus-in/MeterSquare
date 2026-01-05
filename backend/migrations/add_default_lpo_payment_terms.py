"""
Add default payment terms to system_settings.lpo_payment_terms_list
This creates the master list of payment terms (like BOQ terms)
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import os
import json
from dotenv import load_dotenv

load_dotenv()

def add_default_payment_terms():
    """Add default payment terms to system_settings"""
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            database=os.getenv('DB_NAME', 'metersquare_erp'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD', 'postgres'),
            port=os.getenv('DB_PORT', '5432')
        )
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        print("\n" + "="*80)
        print("ADD DEFAULT PAYMENT TERMS TO SYSTEM SETTINGS")
        print("="*80)
        
        # Default payment terms (master list - like boq_terms)
        default_payment_terms = [
            "100% CDC after delivery",
            "50% Advance, 50% after delivery",
            "30% Advance, 70% after delivery",
            "100% Advance",
            "Net 30 days",
            "Net 60 days",
            "Net 90 days",
            "25% Advance, 75% after delivery",
            "40% Advance, 60% after delivery",
        ]
        
        # Default general terms
        default_general_terms = [
            "All materials must meet specified quality standards",
            "Supplier must provide necessary certifications",
            "Prices are valid for 30 days from quotation date",
            "Supplier is responsible for safe packaging and delivery",
            "Delivery within 7 working days",
            "Delivery within 14 working days",
            "Delivery as per project schedule",
        ]
        
        # Check if system_settings exists
        cursor.execute("SELECT id FROM system_settings LIMIT 1")
        settings = cursor.fetchone()
        
        if settings:
            print(f"\n✓ Found system_settings record (id={settings['id']})")
            
            # Update lpo_payment_terms_list
            print(f"\nUpdating lpo_payment_terms_list with {len(default_payment_terms)} terms...")
            cursor.execute("""
                UPDATE system_settings
                SET lpo_payment_terms_list = %s,
                    lpo_general_terms = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (json.dumps(default_payment_terms), json.dumps(default_general_terms), settings['id']))
            
            print(f"  ✓ Added {len(default_payment_terms)} payment terms")
            print(f"  ✓ Added {len(default_general_terms)} general terms")
            
            # Show what was added
            print("\n📋 Payment Terms Added:")
            for i, term in enumerate(default_payment_terms, 1):
                print(f"  {i}. {term}")
            
            print("\n📋 General Terms Added:")
            for i, term in enumerate(default_general_terms, 1):
                print(f"  {i}. {term}")
        else:
            print("\n❌ No system_settings record found!")
            print("Creating system_settings record...")
            cursor.execute("""
                INSERT INTO system_settings (
                    id, company_name, lpo_payment_terms_list, lpo_general_terms
                )
                VALUES (1, 'MeterSquare ERP', %s, %s)
            """, (json.dumps(default_payment_terms), json.dumps(default_general_terms)))
            print("  ✓ Created system_settings with default terms")
        
        conn.commit()
        print("\n" + "="*80)
        print("✅ DEFAULT PAYMENT TERMS ADDED SUCCESSFULLY")
        print("="*80)
        print("\nNow when you edit an LPO, these terms will appear as checkboxes!")
        print("Users can select which terms to include in each LPO.")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
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
    add_default_payment_terms()
