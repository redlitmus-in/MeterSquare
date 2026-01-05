"""
Migration script to add completion confirmation tracking fields
This adds fields to track SE completion requests and PM confirmations
Author: System
Date: 2025-11-15

Usage: DATABASE_URL='postgresql://...' python migrations/add_completion_confirmation_tracking.py
"""

import os
import psycopg2
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path to import config
sys.path.append(str(Path(__file__).parent.parent))

def run_migration():
    """Add completion tracking columns to pm_assign_ss and project tables"""

    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        print("Usage: DATABASE_URL='postgresql://...' python migrations/add_completion_confirmation_tracking.py")
        sys.exit(1)

    conn = None
    cursor = None

    try:
        # Connect to database
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()

        print("Connected to database successfully")

        # ======== Part 1: Add columns to pm_assign_ss table ========
        print("\n1. Updating pm_assign_ss table...")

        # Check and add se_completion_requested
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='pm_assign_ss' AND column_name='se_completion_requested';
        """)

        if not cursor.fetchone():
            cursor.execute("""
                ALTER TABLE pm_assign_ss
                ADD COLUMN se_completion_requested BOOLEAN DEFAULT FALSE;
            """)
            print("   ✓ Added se_completion_requested column")
        else:
            print("   - se_completion_requested already exists")

        # Check and add se_completion_request_date
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='pm_assign_ss' AND column_name='se_completion_request_date';
        """)

        if not cursor.fetchone():
            cursor.execute("""
                ALTER TABLE pm_assign_ss
                ADD COLUMN se_completion_request_date TIMESTAMP DEFAULT NULL;
            """)
            print("   ✓ Added se_completion_request_date column")
        else:
            print("   - se_completion_request_date already exists")

        # Check and add pm_confirmed_completion
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='pm_assign_ss' AND column_name='pm_confirmed_completion';
        """)

        if not cursor.fetchone():
            cursor.execute("""
                ALTER TABLE pm_assign_ss
                ADD COLUMN pm_confirmed_completion BOOLEAN DEFAULT FALSE;
            """)
            print("   ✓ Added pm_confirmed_completion column")
        else:
            print("   - pm_confirmed_completion already exists")

        # Check and add pm_confirmation_date
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='pm_assign_ss' AND column_name='pm_confirmation_date';
        """)

        if not cursor.fetchone():
            cursor.execute("""
                ALTER TABLE pm_assign_ss
                ADD COLUMN pm_confirmation_date TIMESTAMP DEFAULT NULL;
            """)
            print("   ✓ Added pm_confirmation_date column")
        else:
            print("   - pm_confirmation_date already exists")

        # Add comments for documentation
        cursor.execute("""
            COMMENT ON COLUMN pm_assign_ss.se_completion_requested IS
            'Flag indicating if SE has requested completion for their assigned items';
        """)

        cursor.execute("""
            COMMENT ON COLUMN pm_assign_ss.se_completion_request_date IS
            'Timestamp when SE requested completion';
        """)

        cursor.execute("""
            COMMENT ON COLUMN pm_assign_ss.pm_confirmed_completion IS
            'Flag indicating if the assigning PM has confirmed SE completion';
        """)

        cursor.execute("""
            COMMENT ON COLUMN pm_assign_ss.pm_confirmation_date IS
            'Timestamp when PM confirmed the SE completion';
        """)

        # ======== Part 2: Add columns to project table ========
        print("\n2. Updating project table...")

        # Check and add total_se_assignments
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='project' AND column_name='total_se_assignments';
        """)

        if not cursor.fetchone():
            cursor.execute("""
                ALTER TABLE project
                ADD COLUMN total_se_assignments INTEGER DEFAULT 0;
            """)
            print("   ✓ Added total_se_assignments column")
        else:
            print("   - total_se_assignments already exists")

        # Check and add confirmed_completions
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='project' AND column_name='confirmed_completions';
        """)

        if not cursor.fetchone():
            cursor.execute("""
                ALTER TABLE project
                ADD COLUMN confirmed_completions INTEGER DEFAULT 0;
            """)
            print("   ✓ Added confirmed_completions column")
        else:
            print("   - confirmed_completions already exists")

        # Add comments for documentation
        cursor.execute("""
            COMMENT ON COLUMN project.total_se_assignments IS
            'Total number of unique PM-SE assignment pairs for this project';
        """)

        cursor.execute("""
            COMMENT ON COLUMN project.confirmed_completions IS
            'Number of PM-SE pairs where PM has confirmed SE completion';
        """)

        # ======== Part 3: Create indexes for better performance ========
        print("\n3. Creating indexes for better query performance...")

        # Create index on pm_assign_ss for completion tracking queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_pm_assign_ss_completion_tracking
            ON pm_assign_ss(project_id, assigned_by_pm_id, assigned_to_se_id, se_completion_requested, pm_confirmed_completion)
            WHERE is_deleted = FALSE;
        """)
        print("   ✓ Created index on pm_assign_ss for completion tracking")

        # Create index on project for completion counters
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_project_completion_counters
            ON project(project_id, total_se_assignments, confirmed_completions)
            WHERE is_deleted = FALSE AND completion_requested = TRUE;
        """)
        print("   ✓ Created index on project for completion counters")

        # Commit all changes
        conn.commit()

        # ======== Part 4: Update existing data ========
        print("\n4. Updating existing project counters...")

        # Update total_se_assignments for existing projects
        cursor.execute("""
            UPDATE project p
            SET total_se_assignments = (
                SELECT COUNT(DISTINCT (assigned_by_pm_id, assigned_to_se_id))
                FROM pm_assign_ss
                WHERE project_id = p.project_id
                  AND is_deleted = FALSE
                  AND assigned_by_pm_id IS NOT NULL
                  AND assigned_to_se_id IS NOT NULL
            )
            WHERE p.is_deleted = FALSE;
        """)

        # Update confirmed_completions (will be 0 for all since this is new)
        cursor.execute("""
            UPDATE project
            SET confirmed_completions = 0
            WHERE is_deleted = FALSE;
        """)

        conn.commit()

        rows_updated = cursor.rowcount
        print(f"   ✓ Updated {rows_updated} project records with initial counters")

        # Close cursor and connection
        cursor.close()
        conn.close()

        print("\n" + "="*60)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY!")
        print("="*60)
        print("\nSummary of changes:")
        print("- Added SE completion tracking to pm_assign_ss table")
        print("- Added PM confirmation tracking to pm_assign_ss table")
        print("- Added confirmation counters to project table")
        print("- Created performance indexes")
        print("- Updated existing project counters")

    except psycopg2.Error as e:
        print(f"❌ Database error occurred: {e}")
        if conn:
            conn.rollback()
            conn.close()
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        sys.exit(1)

if __name__ == "__main__":
    print("="*60)
    print("COMPLETION CONFIRMATION TRACKING MIGRATION")
    print("="*60)
    print("\nThis migration adds completion tracking fields to support:")
    print("- SE completion requests per assignment")
    print("- PM confirmations for SE work")
    print("- Project-level confirmation counters (X/Y confirmations)")
    print("\nStarting migration...\n")

    run_migration()