-- Migration: Add WhatsApp tracking columns to change_requests table
-- Date: 2025-11-21

-- Add WhatsApp tracking columns to change_requests table
ALTER TABLE change_requests
ADD COLUMN IF NOT EXISTS vendor_whatsapp_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE change_requests
ADD COLUMN IF NOT EXISTS vendor_whatsapp_sent_at TIMESTAMP;

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'change_requests'
AND column_name IN ('vendor_whatsapp_sent', 'vendor_whatsapp_sent_at');
