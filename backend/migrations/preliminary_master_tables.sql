-- ===================================================
-- Create Preliminaries Master and BOQ Preliminaries Tables
-- ===================================================

-- 1. Create preliminaries_master table (master list of all preliminary items)
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

-- 2. Create boq_preliminaries junction table (links BOQs with selected preliminaries)
CREATE TABLE IF NOT EXISTS boq_preliminaries (
    id SERIAL PRIMARY KEY,
    boq_id INTEGER NOT NULL REFERENCES boq(boq_id) ON DELETE CASCADE,
    prelim_id INTEGER NOT NULL REFERENCES preliminaries_master(prelim_id),
    is_checked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(boq_id, prelim_id)
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_boq_id ON boq_preliminaries(boq_id);
CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_prelim_id ON boq_preliminaries(prelim_id);
CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_is_checked ON boq_preliminaries(is_checked);
CREATE INDEX IF NOT EXISTS idx_preliminaries_master_is_active ON preliminaries_master(is_active, is_deleted);

-- 4. Insert default preliminary items
INSERT INTO preliminaries_master (name, description, unit, rate, display_order, created_by) VALUES
('Health & Safety', 'Providing the necessary Health & Safety protection as per site requirements', 'nos', 0, 1, 'system'),
('Consultant Appointment', 'Appointing Consultant for ALAIN Municipality and Civil defense', 'nos', 0, 2, 'system'),
('Authority Approval', 'Obtaining authority approval (Al Ain Municipality, AACD, TAQA) with necessary submission drawings, Preparing AMC with base build fire Contractor', 'nos', 0, 3, 'system'),
('TAQA Power Application', 'TAQA temporary power application through TAQA approved contractor', 'nos', 0, 4, 'system'),
('CAR Insurance', 'CAR Insurance: Complete Fit-out Insurance', 'nos', 0, 5, 'system'),
('Mobilization', 'Mobilization: Mobilization of necessary personnel required for works', 'nos', 0, 6, 'system'),
('Coordination', 'Coordination: Allow for the comprehensive coordination of all services with other contractors, client, building maintenance team, security', 'nos', 0, 7, 'system'),
('Sample Board Submission', 'Submission of sample board 3D MOOD board for client and Landlord approval', 'nos', 0, 8, 'system'),
('Scaffolding', 'Scaffolding: Necessary scaffolding to carry out the works', 'nos', 0, 9, 'system'),
('Drawing Preparation', 'Delay & Stop drawing preparation, rebuilt drawing and project managements of the project', 'nos', 0, 10, 'system'),
('Preliminaries Cleaning', 'Preliminaries cleaning on handover', 'nos', 0, 11, 'system')
ON CONFLICT DO NOTHING;

-- 5. Verify the tables
SELECT 'preliminaries_master' as table_name, COUNT(*) as record_count FROM preliminaries_master
UNION ALL
SELECT 'boq_preliminaries' as table_name, COUNT(*) as record_count FROM boq_preliminaries;
