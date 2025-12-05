-- =====================================================
-- TERMS & CONDITIONS COMPLETE SETUP SCRIPT
-- Run this script in your PostgreSQL database
-- =====================================================

-- Step 1: Update existing boq_terms table
-- Add new columns for better management
ALTER TABLE boq_terms
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

ALTER TABLE boq_terms
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

ALTER TABLE boq_terms
ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id);

-- Make template_name optional (nullable)
ALTER TABLE boq_terms
ALTER COLUMN template_name DROP NOT NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_boq_terms_is_active_deleted
ON boq_terms(is_active, is_deleted);

CREATE INDEX IF NOT EXISTS idx_boq_terms_display_order
ON boq_terms(display_order);

-- Step 2: Create boq_terms_selections junction table
-- This table links BOQs with selected terms (many-to-many relationship)
CREATE TABLE IF NOT EXISTS boq_terms_selections (
    id SERIAL PRIMARY KEY,
    boq_id INTEGER NOT NULL REFERENCES boq(boq_id) ON DELETE CASCADE,
    term_id INTEGER NOT NULL REFERENCES boq_terms(term_id) ON DELETE CASCADE,
    is_checked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_boq_term UNIQUE(boq_id, term_id)
);

-- Create indexes for junction table
CREATE INDEX IF NOT EXISTS idx_boq_terms_selections_boq_id
ON boq_terms_selections(boq_id);

CREATE INDEX IF NOT EXISTS idx_boq_terms_selections_term_id
ON boq_terms_selections(term_id);

CREATE INDEX IF NOT EXISTS idx_boq_terms_selections_is_checked
ON boq_terms_selections(is_checked);

-- Step 3: Create trigger function for updated_at auto-update
CREATE OR REPLACE FUNCTION update_boq_terms_selections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trigger_update_boq_terms_selections_updated_at
ON boq_terms_selections;

CREATE TRIGGER trigger_update_boq_terms_selections_updated_at
BEFORE UPDATE ON boq_terms_selections
FOR EACH ROW
EXECUTE FUNCTION update_boq_terms_selections_updated_at();

-- Step 4: Clear any existing terms (optional - comment out if you want to keep existing data)
-- DELETE FROM boq_terms WHERE template_name IS NULL OR template_name = '';

-- Step 5: Insert default terms & conditions
-- These are the 16 default terms from your PDF example
INSERT INTO boq_terms (terms_text, is_active, is_deleted, display_order, created_at, updated_at) VALUES
('This quotation is valid for 30 days from the date of issue.', TRUE, FALSE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Payment terms: 50% advance, 40% on delivery, 10% after installation.', TRUE, FALSE, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('All prices are in AED and exclude VAT unless stated otherwise.', TRUE, FALSE, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Any changes to the scope of work after approval may incur additional charges.', TRUE, FALSE, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('The client is responsible for providing access to the site during working hours.', TRUE, FALSE, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MeterSquare Interiors LLC reserves the right to modify terms with prior notice.', TRUE, FALSE, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Water and electricity during execution period shall be arranged by client FOC.', TRUE, FALSE, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('All materials are subject to availability.', TRUE, FALSE, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('VAT is excluded in this offer. VAT is applicable as per law.', TRUE, FALSE, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Access or entry pass to site be provided by the client or the charge shall be reimbursed.', TRUE, FALSE, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Any addition or deletion of items can be done upon mutual agreement.', TRUE, FALSE, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('All variations to be registered either by email or through written document approved by project manager.', TRUE, FALSE, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MeterSquare will not be responsible for delays caused by shop drawing approval delays or site not ready.', TRUE, FALSE, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Completion period: 40 working days after drawing and sample approval (subject to material availability).', TRUE, FALSE, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Material is available only after 4-5 weeks.', TRUE, FALSE, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Condition of Contract: As per FIDIC Condition of Contract for Civil engineering works Fourth Edition 1987.', TRUE, FALSE, 16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Step 6: Verification queries
-- Run these to verify everything is set up correctly

-- Check if boq_terms table has the new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'boq_terms'
ORDER BY ordinal_position;

-- Check if boq_terms_selections table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'boq_terms_selections';

-- Count active terms
SELECT COUNT(*) as active_terms_count
FROM boq_terms
WHERE is_active = TRUE AND is_deleted = FALSE;

-- View all active terms
SELECT term_id, LEFT(terms_text, 60) as terms_preview, display_order, is_active, is_deleted
FROM boq_terms
WHERE is_active = TRUE AND is_deleted = FALSE
ORDER BY display_order, term_id;

-- Check indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('boq_terms', 'boq_terms_selections')
ORDER BY tablename, indexname;

-- Check triggers
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'boq_terms_selections';

-- =====================================================
-- MIGRATION COMPLETE!
-- =====================================================
-- Expected results:
-- - boq_terms table updated with display_order, is_deleted, updated_by columns
-- - boq_terms_selections table created with indexes and trigger
-- - 16 default terms inserted
-- - All indexes and triggers in place
-- =====================================================
