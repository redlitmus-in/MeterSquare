"""
Migration script to add mep_supervisor_id field to project table
This field stores MEP Supervisor assignments as JSONB array (similar to user_id for PMs)
Author: System
Date: 2025
"""

import psycopg2
import sys
from pathlib import Path

# Add parent directory to path to import config
sys.path.append(str(Path(__file__).parent.parent))

def run_migration():
    """Add mep_supervisor_id column to project table"""

    # Database connection parameters
    DB_CONFIG = {
        'dbname': 'metersquare',
        'user': 'postgres',
        'password': 'postgres',
        'host': 'localhost',
        'port': '5432'
    }

    try:
        # Connect to database
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()


        # Check if column already exists
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='project' AND column_name='mep_supervisor_id';
        """)

        if cursor.fetchone():
            cursor.close()
            conn.close()
            return


        # Add mep_supervisor_id column as JSONB type (stores array of MEP IDs)
        cursor.execute("""
            ALTER TABLE project
            ADD COLUMN mep_supervisor_id JSONB DEFAULT NULL;
        """)

        # Add comment to column for documentation
        cursor.execute("""
            COMMENT ON COLUMN project.mep_supervisor_id IS
            'Stores MEP Supervisor IDs as JSONB array, e.g., [1, 2]. Allows multiple MEP Supervisors per project.';
        """)

        # Commit the changes
        conn.commit()


        # Close cursor and connection
        cursor.close()
        conn.close()


    except psycopg2.Error as e:
        if conn:
            conn.rollback()
            conn.close()
        sys.exit(1)
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        sys.exit(1)

if __name__ == "__main__":

    run_migration()
