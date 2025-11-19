-- Fix RLS policies to allow Realtime subscriptions
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wgddnoiakkoskbbkbygw/sql

-- Check current RLS status
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('boq', 'boq_details', 'boq_internal_revisions');

-- Option 1: Disable RLS (Quick fix for development)
ALTER TABLE boq DISABLE ROW LEVEL SECURITY;
ALTER TABLE boq_details DISABLE ROW LEVEL SECURITY;
ALTER TABLE boq_internal_revisions DISABLE ROW LEVEL SECURITY;

-- Option 2: Keep RLS enabled but add policies for realtime (Better for production)
-- Uncomment these if you want to keep RLS enabled:

-- DROP POLICY IF EXISTS "Allow realtime for boq" ON boq;
-- CREATE POLICY "Allow realtime for boq" ON boq FOR SELECT USING (true);

-- DROP POLICY IF EXISTS "Allow realtime for boq_details" ON boq_details;
-- CREATE POLICY "Allow realtime for boq_details" ON boq_details FOR SELECT USING (true);

-- DROP POLICY IF EXISTS "Allow realtime for boq_internal_revisions" ON boq_internal_revisions;
-- CREATE POLICY "Allow realtime for boq_internal_revisions" ON boq_internal_revisions FOR SELECT USING (true);

-- Verify tables are in realtime publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- If tables are missing from publication, add them:
-- ALTER PUBLICATION supabase_realtime ADD TABLE boq;
-- ALTER PUBLICATION supabase_realtime ADD TABLE boq_details;
-- ALTER PUBLICATION supabase_realtime ADD TABLE boq_internal_revisions;
