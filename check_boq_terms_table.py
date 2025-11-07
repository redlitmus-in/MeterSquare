import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Get database credentials from .env
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    cur = conn.cursor()

    # Get table structure
    cur.execute("""
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'boq_terms'
        ORDER BY ordinal_position
    """)

    print("=" * 100)
    print("BOQ_TERMS TABLE STRUCTURE")
    print("=" * 100)
    print(f"{'Column Name':<30} | {'Data Type':<20} | {'Max Length':<12} | {'Nullable':<10} | {'Default':<20}")
    print("-" * 100)

    columns = cur.fetchall()
    if not columns:
        print("Table 'boq_terms' does not exist or has no columns!")
    else:
        for row in columns:
            col_name = row[0] or ''
            data_type = row[1] or ''
            max_length = str(row[2]) if row[2] else 'N/A'
            nullable = row[3] or ''
            default = str(row[4]) if row[4] else 'None'
            print(f"{col_name:<30} | {data_type:<20} | {max_length:<12} | {nullable:<10} | {default:<20}")

    print("\n" + "=" * 100)

    # Check if table has any data
    cur.execute("SELECT COUNT(*) FROM boq_terms")
    count = cur.fetchone()[0]
    print(f"Total records in boq_terms: {count}")

    # Show sample data if exists
    if count > 0:
        cur.execute("SELECT * FROM boq_terms LIMIT 3")
        print("\nSample data (first 3 records):")
        print("-" * 100)
        for row in cur.fetchall():
            print(row)

    cur.close()
    conn.close()
    print("\n" + "=" * 100)

except Exception as e:
    print(f"Error: {str(e)}")
