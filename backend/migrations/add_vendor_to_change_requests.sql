-- Migration script to add vendor selection fields to change_requests table
-- Adds fields for tracking vendor selection by buyer and TD approval

-- Vendor Selection fields
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS selected_vendor_id INTEGER REFERENCES vendors(vendor_id);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS selected_vendor_name VARCHAR(255);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_selected_by_buyer_id INTEGER;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_selected_by_buyer_name VARCHAR(255);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_selection_date TIMESTAMP;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_selection_status VARCHAR(50);

-- TD Approval for Vendor
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_approved_by_td_id INTEGER;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_approved_by_td_name VARCHAR(255);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_approval_date TIMESTAMP;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_rejection_reason TEXT;

-- Comments for the new columns
COMMENT ON COLUMN change_requests.selected_vendor_id IS 'Vendor selected by buyer for this purchase';
COMMENT ON COLUMN change_requests.vendor_selection_status IS 'Status: pending_td_approval, approved, rejected';
COMMENT ON COLUMN change_requests.vendor_approved_by_td_id IS 'TD who approved/rejected the vendor selection';
