"""
Update all Supabase storage URLs in ATH database
from production (wgddnoiakkoskbbkbygw) to ATH (iqkbmieiyavceuqfoqtw)
"""

import subprocess
import sys

try:
    import psycopg2
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
    import psycopg2

PROD_SUPABASE_REF = "wgddnoiakkoskbbkbygw"
ATH_SUPABASE_REF = "iqkbmieiyavceuqfoqtw"

PROD_URL = f"https://{PROD_SUPABASE_REF}.supabase.co"
ATH_URL = f"https://{ATH_SUPABASE_REF}.supabase.co"

# ATH database connection
ATH_DB = {
    "host": "aws-1-us-east-2.pooler.supabase.com",
    "port": 6543,
    "dbname": "postgres",
    "user": "postgres.iqkbmieiyavceuqfoqtw",
    "password": "Redlitmus@321",
}

# All columns that store Supabase storage URLs (Text columns)
URL_COLUMNS = [
    ("po_child", "lpo_pdf_url"),
    ("returnable_asset_categories", "image_url"),
    ("asset_delivery_notes", "delivery_note_url"),
    ("asset_return_delivery_notes", "delivery_note_url"),
    ("asset_return_requests", "photo_url"),
    ("asset_stock_in", "document_url"),
    ("returnable_asset_items", "image_url"),
    ("workers", "photo_url"),
    ("change_requests", "lpo_pdf_url"),
    ("inventory_transactions", "delivery_note_url"),
    ("material_delivery_notes", "delivery_note_url"),
    ("return_delivery_notes", "delivery_note_url"),
    ("support_tickets", "attachments"),  # JSONB
    ("vendor_delivery_inspections", "evidence_urls"),  # JSONB
]

def main():
    print("=" * 50)
    print("  Updating ATH Storage URLs")
    print(f"  {PROD_URL}")
    print(f"  → {ATH_URL}")
    print("=" * 50)
    print()

    conn = psycopg2.connect(**ATH_DB)
    conn.autocommit = False
    cur = conn.cursor()

    total_updated = 0

    for table, column in URL_COLUMNS:
        try:
            # Check if table and column exist
            cur.execute("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = %s
                AND column_name = %s
            """, (table, column))

            if cur.fetchone()[0] == 0:
                print(f"  SKIP  {table}.{column} (column not found)")
                continue

            # Check column data type
            cur.execute("""
                SELECT data_type FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = %s
                AND column_name = %s
            """, (table, column))

            data_type = cur.fetchone()[0]

            if data_type in ("jsonb", "json", "ARRAY"):
                # For JSONB columns, cast to text, replace, cast back
                cur.execute(f"""
                    UPDATE public.{table}
                    SET {column} = ({column}::text)::jsonb
                    FROM (SELECT id FROM public.{table}
                          WHERE {column}::text LIKE %s) AS sub
                    WHERE public.{table}.id = sub.id
                """, (f"%{PROD_SUPABASE_REF}%",))

                # Actually do the replacement
                cur.execute(f"""
                    UPDATE public.{table}
                    SET {column} = REPLACE({column}::text, %s, %s)::jsonb
                    WHERE {column}::text LIKE %s
                """, (PROD_URL, ATH_URL, f"%{PROD_SUPABASE_REF}%"))
            else:
                # For text columns, simple REPLACE
                cur.execute(f"""
                    UPDATE public.{table}
                    SET {column} = REPLACE({column}, %s, %s)
                    WHERE {column} LIKE %s
                """, (PROD_URL, ATH_URL, f"%{PROD_SUPABASE_REF}%"))

            rows = cur.rowcount
            total_updated += rows
            status = f"{rows} rows" if rows > 0 else "no matches"
            print(f"  {'UPDATE' if rows > 0 else 'OK   '}  {table}.{column} — {status}")

        except Exception as e:
            print(f"  ERROR  {table}.{column} — {e}")
            conn.rollback()
            conn = psycopg2.connect(**ATH_DB)
            conn.autocommit = False
            cur = conn.cursor()
            continue

    conn.commit()
    cur.close()
    conn.close()

    print()
    print(f"  Total rows updated: {total_updated}")
    print("  Done!")


if __name__ == "__main__":
    main()
