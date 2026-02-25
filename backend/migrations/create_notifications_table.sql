-- ============================================================
-- Notifications Table Migration (Pure SQL)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(100) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    target_role VARCHAR(50),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    category VARCHAR(50) DEFAULT 'system',
    read BOOLEAN DEFAULT FALSE,
    action_required BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    action_label VARCHAR(50),
    metadata JSONB,
    sender_id INTEGER,
    sender_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, read, created_at DESC);

-- Display success message
DO $$
BEGIN
    RAISE NOTICE '✅ Notifications table created successfully!';
    RAISE NOTICE '✅ Indexes created for optimal performance';
    RAISE NOTICE '✅ Migration completed - Ready to use!';
END $$;
