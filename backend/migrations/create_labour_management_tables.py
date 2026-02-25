"""
Migration: Create Labour Management System Tables
Date: 2026-01-02
Description: Creates all 6 tables for the Labour/Attendance Management System:
    1. workers - Worker registry
    2. labour_requisitions - Site requisition requests
    3. labour_arrivals - Worker arrival confirmations
    4. worker_assignments - Project-worker linking
    5. daily_attendance - Clock-in/out records
    6. attendance_approval_history - Audit trail
"""

import psycopg2
import os
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / '.env'
    load_dotenv(env_path)
except ImportError:
    pass  # dotenv not installed, rely on environment variables


def run_migration():
    """Create all labour management tables"""

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
        print("=" * 60)

        # ============================================================
        # 1. WORKERS TABLE
        # ============================================================
        print("\n[1/6] Creating workers table...")

        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'workers'
            )
        """)
        if not cursor.fetchone()[0]:
            cursor.execute("""
                CREATE TABLE workers (
                    worker_id SERIAL PRIMARY KEY,
                    worker_code VARCHAR(50) UNIQUE NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50),
                    email VARCHAR(255),
                    hourly_rate DECIMAL(10,2) NOT NULL,
                    skills JSONB DEFAULT '[]'::jsonb,
                    worker_type VARCHAR(50) DEFAULT 'regular',
                    emergency_contact VARCHAR(255),
                    emergency_phone VARCHAR(50),
                    id_number VARCHAR(100),
                    id_type VARCHAR(50),
                    photo_url TEXT,
                    status VARCHAR(50) DEFAULT 'active',
                    notes TEXT,
                    is_deleted BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    created_by VARCHAR(255) NOT NULL,
                    last_modified_at TIMESTAMP DEFAULT NOW(),
                    last_modified_by VARCHAR(255)
                )
            """)

            # Create indexes
            cursor.execute("CREATE INDEX idx_workers_code ON workers(worker_code)")
            cursor.execute("CREATE INDEX idx_workers_status ON workers(status) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_workers_skills ON workers USING GIN(skills)")
            cursor.execute("CREATE INDEX idx_workers_is_deleted ON workers(is_deleted)")

            print("✓ workers table created successfully")
        else:
            print("→ workers table already exists, skipping...")

        # ============================================================
        # 2. LABOUR REQUISITIONS TABLE
        # ============================================================
        print("\n[2/6] Creating labour_requisitions table...")

        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'labour_requisitions'
            )
        """)
        if not cursor.fetchone()[0]:
            cursor.execute("""
                CREATE TABLE labour_requisitions (
                    requisition_id SERIAL PRIMARY KEY,
                    requisition_code VARCHAR(50) UNIQUE NOT NULL,
                    project_id INTEGER NOT NULL REFERENCES project(project_id),
                    site_name VARCHAR(255) NOT NULL,
                    work_description TEXT NOT NULL,
                    skill_required VARCHAR(100) NOT NULL,
                    workers_count INTEGER NOT NULL,
                    required_date DATE NOT NULL,

                    -- Requester info
                    requested_by_user_id INTEGER NOT NULL REFERENCES users(user_id),
                    requested_by_name VARCHAR(255) NOT NULL,
                    request_date TIMESTAMP DEFAULT NOW(),

                    -- Approval workflow
                    status VARCHAR(50) DEFAULT 'pending',
                    approved_by_user_id INTEGER REFERENCES users(user_id),
                    approved_by_name VARCHAR(255),
                    approval_date TIMESTAMP,
                    rejection_reason TEXT,

                    -- Assignment tracking
                    assignment_status VARCHAR(50) DEFAULT 'unassigned',
                    assigned_worker_ids JSONB,
                    assigned_by_user_id INTEGER REFERENCES users(user_id),
                    assignment_date TIMESTAMP,
                    whatsapp_notified BOOLEAN DEFAULT FALSE,

                    is_deleted BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    created_by VARCHAR(255) NOT NULL,
                    last_modified_at TIMESTAMP DEFAULT NOW(),
                    last_modified_by VARCHAR(255)
                )
            """)

            # Create indexes
            cursor.execute("CREATE INDEX idx_requisitions_project ON labour_requisitions(project_id) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_requisitions_status ON labour_requisitions(status) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_requisitions_assignment_status ON labour_requisitions(assignment_status) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_requisitions_requested_by ON labour_requisitions(requested_by_user_id)")
            cursor.execute("CREATE INDEX idx_requisitions_required_date ON labour_requisitions(required_date)")
            cursor.execute("CREATE INDEX idx_requisitions_code ON labour_requisitions(requisition_code)")

            print("✓ labour_requisitions table created successfully")
        else:
            print("→ labour_requisitions table already exists, skipping...")

        # ============================================================
        # 3. LABOUR ARRIVALS TABLE
        # ============================================================
        print("\n[3/6] Creating labour_arrivals table...")

        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'labour_arrivals'
            )
        """)
        if not cursor.fetchone()[0]:
            cursor.execute("""
                CREATE TABLE labour_arrivals (
                    arrival_id SERIAL PRIMARY KEY,
                    requisition_id INTEGER NOT NULL REFERENCES labour_requisitions(requisition_id),
                    worker_id INTEGER NOT NULL REFERENCES workers(worker_id),
                    project_id INTEGER NOT NULL REFERENCES project(project_id),
                    arrival_date DATE NOT NULL,

                    -- Arrival confirmation
                    arrival_status VARCHAR(50) DEFAULT 'assigned',
                    confirmed_at TIMESTAMP,
                    confirmed_by_user_id INTEGER REFERENCES users(user_id),

                    is_deleted BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    created_by VARCHAR(255) NOT NULL,

                    UNIQUE(requisition_id, worker_id, arrival_date)
                )
            """)

            # Create indexes
            cursor.execute("CREATE INDEX idx_arrivals_project_date ON labour_arrivals(project_id, arrival_date) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_arrivals_worker ON labour_arrivals(worker_id) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_arrivals_requisition ON labour_arrivals(requisition_id)")
            cursor.execute("CREATE INDEX idx_arrivals_status ON labour_arrivals(arrival_status)")

            print("✓ labour_arrivals table created successfully")
        else:
            print("→ labour_arrivals table already exists, skipping...")

        # ============================================================
        # 4. WORKER ASSIGNMENTS TABLE
        # ============================================================
        print("\n[4/6] Creating worker_assignments table...")

        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'worker_assignments'
            )
        """)
        if not cursor.fetchone()[0]:
            cursor.execute("""
                CREATE TABLE worker_assignments (
                    assignment_id SERIAL PRIMARY KEY,
                    worker_id INTEGER NOT NULL REFERENCES workers(worker_id),
                    project_id INTEGER NOT NULL REFERENCES project(project_id),
                    requisition_id INTEGER REFERENCES labour_requisitions(requisition_id),
                    assigned_by_user_id INTEGER NOT NULL REFERENCES users(user_id),
                    assignment_type VARCHAR(50) DEFAULT 'regular',
                    assignment_start_date DATE NOT NULL,
                    assignment_end_date DATE,
                    hourly_rate_override DECIMAL(10,2),
                    role_at_site VARCHAR(100),
                    status VARCHAR(50) DEFAULT 'active',
                    is_factory_resource BOOLEAN DEFAULT FALSE,
                    allocated_by_production_manager_id INTEGER REFERENCES users(user_id),
                    allocation_date TIMESTAMP,
                    notes TEXT,

                    is_deleted BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    created_by VARCHAR(255) NOT NULL,
                    last_modified_at TIMESTAMP DEFAULT NOW(),
                    last_modified_by VARCHAR(255)
                )
            """)

            # Create indexes
            cursor.execute("CREATE INDEX idx_assignments_worker ON worker_assignments(worker_id) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_assignments_project ON worker_assignments(project_id) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_assignments_status ON worker_assignments(status, is_deleted)")
            cursor.execute("CREATE INDEX idx_assignments_dates ON worker_assignments(assignment_start_date, assignment_end_date)")
            cursor.execute("CREATE INDEX idx_assignments_factory ON worker_assignments(is_factory_resource) WHERE is_factory_resource = TRUE")

            print("✓ worker_assignments table created successfully")
        else:
            print("→ worker_assignments table already exists, skipping...")

        # ============================================================
        # 5. DAILY ATTENDANCE TABLE
        # ============================================================
        print("\n[5/6] Creating daily_attendance table...")

        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'daily_attendance'
            )
        """)
        if not cursor.fetchone()[0]:
            cursor.execute("""
                CREATE TABLE daily_attendance (
                    attendance_id SERIAL PRIMARY KEY,
                    worker_id INTEGER NOT NULL REFERENCES workers(worker_id),
                    project_id INTEGER NOT NULL REFERENCES project(project_id),
                    assignment_id INTEGER REFERENCES worker_assignments(assignment_id),
                    requisition_id INTEGER REFERENCES labour_requisitions(requisition_id),
                    attendance_date DATE NOT NULL,

                    -- Clock times
                    clock_in_time TIMESTAMP,
                    clock_out_time TIMESTAMP,
                    total_hours DECIMAL(5,2),
                    break_duration_minutes INTEGER DEFAULT 0,
                    regular_hours DECIMAL(5,2),
                    overtime_hours DECIMAL(5,2) DEFAULT 0,

                    -- Cost
                    hourly_rate DECIMAL(10,2) NOT NULL,
                    overtime_rate_multiplier DECIMAL(3,2) DEFAULT 1.5,
                    total_cost DECIMAL(12,2),

                    -- Status
                    attendance_status VARCHAR(50) DEFAULT 'present',
                    is_absent BOOLEAN DEFAULT FALSE,
                    absent_reason TEXT,

                    -- Entry tracking
                    entered_by_user_id INTEGER NOT NULL REFERENCES users(user_id),
                    entered_by_role VARCHAR(50) NOT NULL,
                    entry_notes TEXT,

                    -- Approval workflow (Lock)
                    approval_status VARCHAR(50) DEFAULT 'pending',
                    approved_by_user_id INTEGER REFERENCES users(user_id),
                    approved_by_name VARCHAR(255),
                    approval_date TIMESTAMP,
                    rejection_reason TEXT,

                    -- Correction tracking
                    original_clock_in TIMESTAMP,
                    original_clock_out TIMESTAMP,
                    correction_reason TEXT,
                    corrected_by_user_id INTEGER REFERENCES users(user_id),
                    corrected_at TIMESTAMP,

                    is_deleted BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    created_by VARCHAR(255) NOT NULL,
                    last_modified_at TIMESTAMP DEFAULT NOW(),
                    last_modified_by VARCHAR(255),

                    UNIQUE(worker_id, project_id, attendance_date)
                )
            """)

            # Create indexes
            cursor.execute("CREATE INDEX idx_attendance_worker_date ON daily_attendance(worker_id, attendance_date) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_attendance_project_date ON daily_attendance(project_id, attendance_date) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_attendance_approval_status ON daily_attendance(approval_status, attendance_date) WHERE is_deleted = FALSE")
            cursor.execute("CREATE INDEX idx_attendance_entered_by ON daily_attendance(entered_by_user_id, attendance_date)")
            cursor.execute("CREATE INDEX idx_attendance_date ON daily_attendance(attendance_date)")

            print("✓ daily_attendance table created successfully")
        else:
            print("→ daily_attendance table already exists, skipping...")

        # ============================================================
        # 6. ATTENDANCE APPROVAL HISTORY TABLE
        # ============================================================
        print("\n[6/6] Creating attendance_approval_history table...")

        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'attendance_approval_history'
            )
        """)
        if not cursor.fetchone()[0]:
            cursor.execute("""
                CREATE TABLE attendance_approval_history (
                    history_id SERIAL PRIMARY KEY,
                    attendance_id INTEGER NOT NULL REFERENCES daily_attendance(attendance_id),
                    action VARCHAR(50) NOT NULL,
                    action_by_user_id INTEGER NOT NULL REFERENCES users(user_id),
                    action_by_name VARCHAR(255) NOT NULL,
                    action_by_role VARCHAR(50) NOT NULL,
                    action_date TIMESTAMP DEFAULT NOW(),
                    comments TEXT,
                    previous_status VARCHAR(50),
                    new_status VARCHAR(50),
                    data_snapshot JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Create indexes
            cursor.execute("CREATE INDEX idx_approval_history_attendance ON attendance_approval_history(attendance_id)")
            cursor.execute("CREATE INDEX idx_approval_history_date ON attendance_approval_history(action_date)")
            cursor.execute("CREATE INDEX idx_approval_history_action ON attendance_approval_history(action)")

            print("✓ attendance_approval_history table created successfully")
        else:
            print("→ attendance_approval_history table already exists, skipping...")

        print("\n" + "=" * 60)
        print("Labour Management System migration completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        raise
    finally:
        if conn:
            conn.close()
            print("\nDatabase connection closed")


if __name__ == "__main__":
    run_migration()
