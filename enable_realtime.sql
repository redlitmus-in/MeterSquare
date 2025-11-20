-- Enable Realtime for BOQ tables
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wgddnoiakkoskbbkbygw/sql

-- Enable Realtime on boq table
ALTER PUBLICATION supabase_realtime ADD TABLE boq;

-- Enable Realtime on boq_details table
ALTER PUBLICATION supabase_realtime ADD TABLE boq_details;

-- Enable Realtime on boq_internal_revisions table
ALTER PUBLICATION supabase_realtime ADD TABLE boq_internal_revisions;

-- Verify it worked
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
