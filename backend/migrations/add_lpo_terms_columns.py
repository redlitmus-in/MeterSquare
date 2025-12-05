"""
Migration: Add LPO Terms and Conditions columns to system_settings
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def run_migration():
    """Add lpo_general_terms and lpo_payment_terms_list columns to system_settings"""

    # Database connection
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        database=os.getenv('DB_NAME', 'metersquare'),
        user=os.getenv('DB_USER', 'postgres'),
        password=os.getenv('DB_PASSWORD', 'postgres'),
        port=os.getenv('DB_PORT', '5432')
    )

    cursor = conn.cursor()

    try:
        # Check if columns already exist
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'system_settings'
            AND column_name IN ('lpo_general_terms', 'lpo_payment_terms_list')
        """)
        existing_columns = [row[0] for row in cursor.fetchall()]

        # Add lpo_general_terms column if it doesn't exist
        if 'lpo_general_terms' not in existing_columns:
            cursor.execute("""
                ALTER TABLE system_settings
                ADD COLUMN lpo_general_terms TEXT
            """)
            print("Added lpo_general_terms column")
        else:
            print("lpo_general_terms column already exists")

        # Add lpo_payment_terms_list column if it doesn't exist
        if 'lpo_payment_terms_list' not in existing_columns:
            cursor.execute("""
                ALTER TABLE system_settings
                ADD COLUMN lpo_payment_terms_list TEXT
            """)
            print("Added lpo_payment_terms_list column")
        else:
            print("lpo_payment_terms_list column already exists")

        # Set default values with the terms from the image
        default_general_terms = [
            "The validity of this quotation is 2 weeks.",
            "The completion period: To be agreed",
            "Any changes in sizes or quantity or color will be re measured at the end of the project and invoiced accordingly.",
            "If any Re Installation works: We will not take responsibility for any breakage / scratch or quality issue for client supplied glass or accessories during and after installation. (BREAKAGE DURING INSTALLATION MAY OCCUR)",
            "Any damage or accidental breakage during Removal/Refixing work will not be under our responsibility.",
            "All variations to be confirmed in writing prior to start.",
            "Any items not clearly mentioned in the BOQ are excluded.",
            "All materials Samples are to be provided by vendor.",
            "External Support for fixing the partition to be provided by client.",
            "Any delay for the following reason will not be our responsibility: Delay because of site problems or site not ready. Delay for shortage in preparing any of our site requests.",
            "We need the following request on site in order to accomplish the job within deadlines: proper light source, continuous power and water sources. Facility for removing wastages. Validity of continuous working hours including holidays."
        ]

        default_payment_terms = [
            "50% Advance",
            "40% On Delivery",
            "10% On Completion"
        ]

        import json

        # Update existing row with default terms if empty
        cursor.execute("""
            UPDATE system_settings
            SET lpo_general_terms = COALESCE(lpo_general_terms, %s),
                lpo_payment_terms_list = COALESCE(lpo_payment_terms_list, %s)
            WHERE id = 1
        """, (json.dumps(default_general_terms), json.dumps(default_payment_terms)))

        conn.commit()
        print("Migration completed successfully!")
        print(f"Default general terms set: {len(default_general_terms)} items")
        print(f"Default payment terms set: {len(default_payment_terms)} items")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {str(e)}")
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    run_migration()
