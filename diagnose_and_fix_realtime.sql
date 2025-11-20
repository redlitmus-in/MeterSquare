-- COMPREHENSIVE REALTIME DIAGNOSTIC AND FIX
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wgddnoiakkoskbbkbygw/sql

-- =====================================================
-- STEP 1: CHECK IF TABLES EXIST
-- =====================================================
SELECT 'Checking if tables exist...' as step;
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('boq', 'boq_details', 'boq_internal_revisions');

-- =====================================================
-- STEP 2: CHECK RLS STATUS
-- =====================================================
SELECT 'Checking RLS status...' as step;
SELECT
    tablename,
    rowsecurity as rls_enabled,
    CASE
        WHEN rowsecurity THEN '⚠️ RLS is ON - may block Realtime'
        ELSE '✅ RLS is OFF'
    END as status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('boq', 'boq_details', 'boq_internal_revisions');

-- =====================================================
-- STEP 3: CHECK IF TABLES ARE IN REALTIME PUBLICATION
-- =====================================================
SELECT 'Checking realtime publication...' as step;
SELECT
    schemaname,
    tablename,
    CASE
        WHEN tablename IN (SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime')
        THEN '✅ IN PUBLICATION'
        ELSE '❌ NOT IN PUBLICATION'
    END as publication_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('boq', 'boq_details', 'boq_internal_revisions');

-- =====================================================
-- STEP 4: CHECK RLS POLICIES
-- =====================================================
SELECT 'Checking RLS policies...' as step;
SELECT
    schemaname,
    tablename,
    policyname,
    roles,
    cmd as command,
    qual as using_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('boq', 'boq_details', 'boq_internal_revisions');

-- =====================================================
-- FIX 1: DISABLE RLS (QUICK FIX)
-- =====================================================
SELECT '🔧 Disabling RLS on tables...' as step;
ALTER TABLE boq DISABLE ROW LEVEL SECURITY;
ALTER TABLE boq_details DISABLE ROW LEVEL SECURITY;
ALTER TABLE boq_internal_revisions DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- FIX 2: ADD TABLES TO REALTIME PUBLICATION
-- =====================================================
SELECT '🔧 Adding tables to realtime publication...' as step;

-- First, try to add them (will fail if already added, that's ok)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE boq;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Table boq already in publication';
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE boq_details;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Table boq_details already in publication';
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE boq_internal_revisions;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Table boq_internal_revisions already in publication';
END $$;

-- =====================================================
-- VERIFICATION: CHECK FINAL STATUS
-- =====================================================
SELECT '✅ FINAL STATUS' as step;
SELECT
    t.tablename,
    CASE WHEN t.rowsecurity THEN '❌ RLS ON' ELSE '✅ RLS OFF' END as rls_status,
    CASE
        WHEN p.tablename IS NOT NULL THEN '✅ IN REALTIME'
        ELSE '❌ NOT IN REALTIME'
    END as realtime_status
FROM pg_tables t
LEFT JOIN pg_publication_tables p ON p.tablename = t.tablename AND p.pubname = 'supabase_realtime'
WHERE t.schemaname = 'public'
AND t.tablename IN ('boq', 'boq_details', 'boq_internal_revisions');

SELECT '🎉 Done! Reload your app and check console for subscription status.' as result;
