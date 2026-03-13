"""
Verify SE BOQ fields exist in database
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'metersquare'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'postgres'),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432')
}

def verify():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'boq_material_assignments'
            AND column_name IN ('assignment_date', 'material_ids', 'base_total_for_overhead', 'overhead_percentage')
            ORDER BY column_name;
        """)

        columns = cur.fetchall()

        expected = ['assignment_date', 'base_total_for_overhead', 'material_ids', 'overhead_percentage']

        found = [col[0] for col in columns]

        for col_name in expected:
            if col_name in found:
                col_type = [c[1] for c in columns if c[0] == col_name][0]
            else:
                pass

        if len(found) == len(expected):
            return True
        else:
            return False

        cur.close()
    except Exception as e:
        return False
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    verify()
