"""
Migration: Create LPO Default Template Table
Stores default LPO customizations that can be reused across all projects
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def run_migration():
    """Create the lpo_default_templates table"""

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
        # Create table - one default template per user
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lpo_default_templates (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id),
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
                UNIQUE(user_id)
            );
        """)

        # Create index for faster lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_lpo_default_templates_user_id
            ON lpo_default_templates(user_id);
        """)

        conn.commit()
        print("Successfully created lpo_default_templates table")

    except Exception as e:
        conn.rollback()
        print(f"Error creating table: {str(e)}")
        raise e
    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    run_migration()
