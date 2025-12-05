"""
Migration: Create preliminaries_master and boq_preliminaries tables
Run this script to create the new preliminary management system tables
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Database connection
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")


def run_migration():
    """Create preliminaries_master and boq_preliminaries tables"""
    conn = None
    cursor = None

    try:
        # Connect to database
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        cursor = conn.cursor()

        print("Creating preliminaries_master table...")

        # Create preliminaries_master table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS preliminaries_master (
                prelim_id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                unit VARCHAR(50) DEFAULT 'nos',
                rate NUMERIC(15, 2) DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by VARCHAR(255),
                is_deleted BOOLEAN DEFAULT FALSE
            );
        """)

        print("Creating boq_preliminaries junction table...")

        # Create boq_preliminaries junction table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS boq_preliminaries (
                id SERIAL PRIMARY KEY,
                boq_id INTEGER NOT NULL REFERENCES boq(boq_id) ON DELETE CASCADE,
                prelim_id INTEGER NOT NULL REFERENCES preliminaries_master(prelim_id),
                is_checked BOOLEAN DEFAULT FALSE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(boq_id, prelim_id)
            );
        """)

        print("Creating indexes...")

        # Create indexes for better performance
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_boq_id
            ON boq_preliminaries(boq_id);
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_prelim_id
            ON boq_preliminaries(prelim_id);
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_is_checked
            ON boq_preliminaries(is_checked);
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_preliminaries_master_is_active
            ON preliminaries_master(is_active, is_deleted);
        """)

        print("Inserting default preliminary items...")

        # Insert default preliminary items
        default_preliminaries = [
            ("Health & Safety", "Providing the necessary Health & Safety protection as per site requirements", "nos", 0, 1),
            ("Consultant Appointment", "Appointing Consultant for ALAIN Municipality and Civil defense", "nos", 0, 2),
            ("Authority Approval", "Obtaining authority approval (Al Ain Municipality, AACD, TAQA) with necessary submission drawings, Preparing AMC with base build fire Contractor", "nos", 0, 3),
            ("TAQA Power Application", "TAQA temporary power application through TAQA approved contractor", "nos", 0, 4),
            ("CAR Insurance", "CAR Insurance: Complete Fit-out Insurance", "nos", 0, 5),
            ("Mobilization", "Mobilization: Mobilization of necessary personnel required for works", "nos", 0, 6),
            ("Coordination", "Coordination: Allow for the comprehensive coordination of all services with other contractors, client, building maintenance team, security", "nos", 0, 7),
            ("Sample Board Submission", "Submission of sample board 3D MOOD board for client and Landlord approval", "nos", 0, 8),
            ("Scaffolding", "Scaffolding: Necessary scaffolding to carry out the works", "nos", 0, 9),
            ("Drawing Preparation", "Delay & Stop drawing preparation, rebuilt drawing and project managements of the project", "nos", 0, 10),
            ("Preliminaries Cleaning", "Preliminaries cleaning on handover", "nos", 0, 11)
        ]

        for name, description, unit, rate, display_order in default_preliminaries:
            cursor.execute("""
                INSERT INTO preliminaries_master (name, description, unit, rate, display_order, created_by)
                VALUES (%s, %s, %s, %s, %s, 'system')
                ON CONFLICT DO NOTHING;
            """, (name, description, unit, rate, display_order))

        # Commit changes
        conn.commit()
        print("[SUCCESS] Migration completed successfully!")
        print(f"   - Created preliminaries_master table with {len(default_preliminaries)} default items")
        print("   - Created boq_preliminaries junction table")
        print("   - Created necessary indexes")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] Migration failed: {str(e)}")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    print("Starting preliminary master tables migration...")
    run_migration()
