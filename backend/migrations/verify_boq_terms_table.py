"""
Verify and show boq_terms table structure
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def verify_table():
    conn = None
    cursor = None

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        print("Checking if boq_terms table exists...")
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'boq_terms'
            );
        """)
        exists = cursor.fetchone()[0]

        if not exists:
            print("[INFO] boq_terms table does not exist")
            return

        print("[OK] boq_terms table exists")
        print("\nTable Structure:")
        print("=" * 100)

        cursor.execute("""
            SELECT
                column_name,
                data_type,
                character_maximum_length,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = 'boq_terms'
            ORDER BY ordinal_position;
        """)

        columns = cursor.fetchall()
        print(f"{'Column Name':<30} | {'Data Type':<20} | {'Max Length':<12} | {'Nullable':<10} | {'Default'}")
        print("-" * 100)

        for row in columns:
            col_name = row[0] or ''
            data_type = row[1] or ''
            max_length = str(row[2]) if row[2] else 'N/A'
            nullable = row[3] or ''
            default = str(row[4])[:30] if row[4] else 'None'
            print(f"{col_name:<30} | {data_type:<20} | {max_length:<12} | {nullable:<10} | {default}")

        print("\n" + "=" * 100)

        # Check record count
        cursor.execute("SELECT COUNT(*) FROM boq_terms")
        count = cursor.fetchone()[0]
        print(f"Total records: {count}")

        if count > 0:
            print("\nSample records:")
            cursor.execute("SELECT term_id, template_name, LEFT(terms_text, 50), is_default FROM boq_terms LIMIT 3")
            for row in cursor.fetchall():
                print(f"  ID: {row[0]}, Name: {row[1]}, Text: {row[2]}..., Default: {row[3]}")

    except Exception as e:
        print(f"[ERROR] {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    verify_table()
