"""
Migration: Create vendor_categories table for dynamic category management
Purpose: Store vendor categories in database instead of hardcoding

Categories will be:
1. Fetched from the database for dropdown population
2. New categories can be added when creating vendors
3. Default categories are pre-seeded and marked with is_default=True

Author: Claude Code
Date: 2026-01-28
"""

import psycopg2
import os


def run_migration():
    """Create vendor_categories table and seed default categories"""

    conn = None
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()


        # ========================================
        # CREATE VENDOR_CATEGORIES TABLE
        # ========================================


        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vendor_categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_by INTEGER REFERENCES users(user_id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create index on name for faster lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_vendor_categories_name
            ON vendor_categories(name)
        """)

        # Create index on is_active for filtering
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_vendor_categories_active
            ON vendor_categories(is_active) WHERE is_active = TRUE
        """)

        # ========================================
        # SEED DEFAULT CATEGORIES
        # ========================================


        default_categories = [
            ('Construction Materials', 'Building materials, cement, concrete, bricks, etc.'),
            ('Electrical Equipment', 'Electrical supplies, wiring, switches, panels, etc.'),
            ('Plumbing Supplies', 'Pipes, fittings, valves, sanitary ware, etc.'),
            ('HVAC Equipment', 'Heating, ventilation, air conditioning equipment'),
            ('Safety Equipment', 'PPE, safety gear, signage, fire equipment'),
            ('Tools & Machinery', 'Hand tools, power tools, construction machinery'),
            ('Furniture', 'Office furniture, site furniture, fixtures'),
            ('IT Equipment', 'Computers, networking, communication equipment'),
            ('Office Supplies', 'Stationery, office consumables'),
            ('Transportation', 'Vehicle services, logistics, shipping'),
            ('Consulting Services', 'Professional consulting, engineering services'),
            ('Maintenance Services', 'Repair, maintenance, facility management'),
            ('Other', 'Miscellaneous categories')
        ]

        for name, description in default_categories:
            cursor.execute("""
                INSERT INTO vendor_categories (name, description, is_default, is_active)
                VALUES (%s, %s, TRUE, TRUE)
                ON CONFLICT (name) DO NOTHING
            """, (name, description))


        # ========================================
        # MIGRATE EXISTING VENDOR CATEGORIES
        # ========================================


        # Find any categories in vendors table that are not in our default list
        cursor.execute("""
            SELECT DISTINCT category
            FROM vendors
            WHERE category IS NOT NULL
              AND category != ''
              AND category NOT IN (SELECT name FROM vendor_categories)
        """)

        custom_categories = cursor.fetchall()

        if custom_categories:
            for (cat_name,) in custom_categories:
                cursor.execute("""
                    INSERT INTO vendor_categories (name, is_default, is_active)
                    VALUES (%s, FALSE, TRUE)
                    ON CONFLICT (name) DO NOTHING
                """, (cat_name,))
        else:
            pass

        if custom_categories:
            pass

        cursor.close()

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise

    finally:
        if conn:
            conn.close()


def rollback_migration():
    """Drop vendor_categories table (rollback)"""

    conn = None
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()


        cursor.execute("DROP TABLE IF EXISTS vendor_categories CASCADE")


        cursor.close()

    except Exception as e:
        raise

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    """Run migration directly"""
    run_migration()
