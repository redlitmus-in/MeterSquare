-- Fix material_returns disposal_status constraint to include 'backup_added'
-- Run this SQL directly in your database

-- Drop the existing constraint
ALTER TABLE material_returns
DROP CONSTRAINT IF EXISTS material_returns_disposal_status_check;

-- Add the new constraint with 'backup_added' included
ALTER TABLE material_returns
ADD CONSTRAINT material_returns_disposal_status_check
CHECK (disposal_status IN (
    'pending_approval',
    'approved',
    'pending_review',
    'approved_disposal',
    'disposed',
    'sent_for_repair',
    'repaired',
    'rejected',
    'backup_added'
) OR disposal_status IS NULL);
