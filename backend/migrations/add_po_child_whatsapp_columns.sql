-- Add WhatsApp tracking columns to po_child table

ALTER TABLE po_child
ADD COLUMN IF NOT EXISTS vendor_whatsapp_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE po_child
ADD COLUMN IF NOT EXISTS vendor_whatsapp_sent_at TIMESTAMP;

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'po_child'
AND column_name IN ('vendor_whatsapp_sent', 'vendor_whatsapp_sent_at');
