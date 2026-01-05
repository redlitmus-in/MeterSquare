"""
Migration: Add backup stock fields to inventory_materials table
Date: 2025-12-11
Description: Adds backup_stock and backup_condition_notes columns for tracking partially usable materials
"""

import psycopg2
from psycopg2 import sql
import os

def run_migration():
    """Add backup stock fields to inventory_materials table"""

    conn = None
    try:
        # Connect using DATABASE_URL environment variable
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print("Connected to database successfully")

        # Check if backup_stock column exists
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'inventory_materials' AND column_name = 'backup_stock'
        """)

        if cursor.fetchone() is None:
            # Add backup_stock column
            print("Adding backup_stock column...")
            cursor.execute("""
                ALTER TABLE inventory_materials
                ADD COLUMN backup_stock FLOAT DEFAULT 0.0 NOT NULL
            """)
            print("Added backup_stock column successfully")
        else:
            print("backup_stock column already exists")

        # Check if backup_condition_notes column exists
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'inventory_materials' AND column_name = 'backup_condition_notes'
        """)

        if cursor.fetchone() is None:
            # Add backup_condition_notes column
            print("Adding backup_condition_notes column...")
            cursor.execute("""
                ALTER TABLE inventory_materials
                ADD COLUMN backup_condition_notes TEXT
            """)
            print("Added backup_condition_notes column successfully")
        else:
            print("backup_condition_notes column already exists")

        # Check if delivery_note_items table exists first
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'delivery_note_items'
            )
        """)
        table_exists = cursor.fetchone()[0]

        if table_exists:
            # Check if use_backup column exists in delivery_note_items
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'delivery_note_items' AND column_name = 'use_backup'
            """)

            if cursor.fetchone() is None:
                # Add use_backup column
                print("Adding use_backup column to delivery_note_items...")
                cursor.execute("""
                    ALTER TABLE delivery_note_items
                    ADD COLUMN use_backup BOOLEAN DEFAULT FALSE
                """)
                print("Added use_backup column successfully")
            else:
                print("use_backup column already exists")
        else:
            print("delivery_note_items table does not exist yet - will have use_backup column when created")

        print("\nMigration completed successfully!")

    except Exception as e:
        print(f"Error during migration: {e}")
        raise
    finally:
        if conn:
            conn.close()
            print("Database connection closed")

if __name__ == "__main__":
    run_migration()
