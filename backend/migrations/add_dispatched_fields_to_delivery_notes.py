"""
Migration to add dispatched_at and dispatched_by fields to material_delivery_notes table
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def run_migration():
    environment = os.getenv('ENVIRONMENT', 'development')
    if environment == 'production':
        database_url = os.getenv('DATABASE_URL')
    else:
        database_url = os.getenv('DEV_DATABASE_URL')

    conn = psycopg2.connect(database_url)

    cursor = conn.cursor()

    try:
        # Add dispatched_at column
        cursor.execute("""
            ALTER TABLE material_delivery_notes
            ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP;
        """)
        print("Added dispatched_at column")

        # Add dispatched_by column
        cursor.execute("""
            ALTER TABLE material_delivery_notes
            ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(255);
        """)
        print("Added dispatched_by column")

        conn.commit()
        print("Migration completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
