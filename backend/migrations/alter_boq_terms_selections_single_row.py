"""
Migration: Alter boq_terms_selections to store single row per BOQ
Instead of multiple rows (one per term), store a single row with term_ids as JSON array
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    """Get database connection based on environment"""
    env = os.getenv('ENV', 'development')

    if env == 'production':
        return psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            port=os.getenv('DB_PORT', '5432'),
            database=os.getenv('DB_NAME', 'meter_square'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD', 'postgres')
        )
    else:
        return psycopg2.connect(
            host=os.getenv('LOCAL_DB_HOST', 'localhost'),
            port=os.getenv('LOCAL_DB_PORT', '5432'),
            database=os.getenv('LOCAL_DB_NAME', 'meter_square'),
            user=os.getenv('LOCAL_DB_USER', 'postgres'),
            password=os.getenv('LOCAL_DB_PASSWORD', 'postgres')
        )


def run_migration():
    """Run the migration to convert boq_terms_selections to single-row-per-BOQ structure"""
    conn = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    try:
        print("Starting migration: boq_terms_selections to single-row-per-BOQ structure")
        print("=" * 60)

        # Step 1: Backup existing data
        print("\n[1/5] Backing up existing data...")
        cursor.execute("""
            SELECT boq_id, term_id, is_checked, created_at, updated_at
            FROM boq_terms_selections
            ORDER BY boq_id, term_id
        """)
        existing_data = cursor.fetchall()
        print(f"  Found {len(existing_data)} existing records")

        # Group by boq_id and collect checked term_ids
        boq_terms_map = {}
        for row in existing_data:
            boq_id = row['boq_id']
            if boq_id not in boq_terms_map:
                boq_terms_map[boq_id] = {
                    'term_ids': [],
                    'created_at': row['created_at'],
                    'updated_at': row['updated_at']
                }
            if row['is_checked']:
                boq_terms_map[boq_id]['term_ids'].append(row['term_id'])
            # Keep the latest updated_at
            if row['updated_at'] and (not boq_terms_map[boq_id]['updated_at'] or row['updated_at'] > boq_terms_map[boq_id]['updated_at']):
                boq_terms_map[boq_id]['updated_at'] = row['updated_at']

        print(f"  Grouped into {len(boq_terms_map)} BOQs")

        # Step 2: Rename old table
        print("\n[2/5] Renaming old table to boq_terms_selections_old...")
        cursor.execute("ALTER TABLE IF EXISTS boq_terms_selections RENAME TO boq_terms_selections_old")
        conn.commit()
        print("  Done")

        # Step 3: Create new table structure
        print("\n[3/5] Creating new boq_terms_selections table...")
        cursor.execute("""
            CREATE TABLE boq_terms_selections (
                id SERIAL PRIMARY KEY,
                boq_id INTEGER NOT NULL REFERENCES boq(boq_id) ON DELETE CASCADE,
                term_ids INTEGER[] NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                CONSTRAINT unique_boq_terms_selection UNIQUE (boq_id)
            )
        """)
        conn.commit()
        print("  Created table with columns: id, boq_id, term_ids (INTEGER[]), created_at, updated_at")

        # Step 4: Create index
        print("\n[4/5] Creating indexes...")
        cursor.execute("""
            CREATE INDEX idx_boq_terms_selections_boq_id ON boq_terms_selections(boq_id)
        """)
        conn.commit()
        print("  Created index on boq_id")

        # Step 5: Migrate data
        print("\n[5/5] Migrating data to new structure...")
        migrated_count = 0
        for boq_id, data in boq_terms_map.items():
            term_ids = data['term_ids']
            created_at = data['created_at']
            updated_at = data['updated_at']

            cursor.execute("""
                INSERT INTO boq_terms_selections (boq_id, term_ids, created_at, updated_at)
                VALUES (%s, %s, %s, %s)
            """, (boq_id, term_ids, created_at, updated_at))
            migrated_count += 1

        conn.commit()
        print(f"  Migrated {migrated_count} BOQs")

        # Step 6: Drop old table (optional - keep for safety)
        print("\n[INFO] Old table 'boq_terms_selections_old' kept for backup")
        print("       You can drop it manually after verification: DROP TABLE boq_terms_selections_old;")

        print("\n" + "=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: Migration failed: {str(e)}")
        print("Rolling back changes...")

        # Try to restore old table if it was renamed
        try:
            cursor.execute("DROP TABLE IF EXISTS boq_terms_selections")
            cursor.execute("ALTER TABLE IF EXISTS boq_terms_selections_old RENAME TO boq_terms_selections")
            conn.commit()
            print("Restored original table")
        except Exception as restore_error:
            print(f"Failed to restore: {restore_error}")

        raise e
    finally:
        cursor.close()
        conn.close()


def rollback_migration():
    """Rollback the migration"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        print("Rolling back migration...")
        cursor.execute("DROP TABLE IF EXISTS boq_terms_selections")
        cursor.execute("ALTER TABLE IF EXISTS boq_terms_selections_old RENAME TO boq_terms_selections")
        conn.commit()
        print("Rollback completed!")
    except Exception as e:
        conn.rollback()
        print(f"Rollback failed: {str(e)}")
        raise e
    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == 'rollback':
        rollback_migration()
    else:
        run_migration()
