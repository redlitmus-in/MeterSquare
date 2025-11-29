"""
Migration: Create LPO Customizations Table
Stores user customizations for LPO PDF generation per purchase order
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def run_migration():
    """Create the lpo_customizations table"""

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
        # Create table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lpo_customizations (
                id SERIAL PRIMARY KEY,
                cr_id INTEGER UNIQUE NOT NULL REFERENCES change_requests(cr_id),
                quotation_ref VARCHAR(255) DEFAULT '',
                custom_message TEXT DEFAULT '',
                subject VARCHAR(500) DEFAULT '',
                payment_terms VARCHAR(255) DEFAULT '',
                completion_terms VARCHAR(255) DEFAULT '',
                general_terms TEXT DEFAULT '[]',
                payment_terms_list TEXT DEFAULT '[]',
                include_signatures BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER REFERENCES users(user_id)
            );
        """)

        # Create index for faster lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_lpo_customizations_cr_id
            ON lpo_customizations(cr_id);
        """)

        conn.commit()
        print("✅ Successfully created lpo_customizations table")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error creating table: {str(e)}")
        raise e
    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    run_migration()
