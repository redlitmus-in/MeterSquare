"""
Check Supabase Realtime Configuration for BOQ Tables
This script verifies if realtime is properly configured for BOQ tables
"""
import psycopg2
import os
import sys
from dotenv import load_dotenv

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables
load_dotenv()

def check_realtime_config():
    """Check if BOQ tables are properly configured for realtime"""

    # Database connection
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()

    print("\n" + "="*60)
    print("SUPABASE REALTIME CONFIGURATION CHECK")
    print("="*60)

    # Check 1: Verify tables exist
    print("\n1️⃣ CHECKING IF TABLES EXIST...")
    cur.execute("""
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('boq', 'boq_details', 'boq_internal_revisions')
        ORDER BY tablename;
    """)
    tables = cur.fetchall()
    if tables:
        print("✅ Found tables:")
        for table in tables:
            print(f"   - {table[0]}")
    else:
        print("❌ No tables found!")

    # Check 2: Check RLS status
    print("\n2️⃣ CHECKING ROW LEVEL SECURITY (RLS) STATUS...")
    cur.execute("""
        SELECT
            tablename,
            rowsecurity as rls_enabled,
            CASE
                WHEN rowsecurity THEN '⚠️ RLS is ON - may block Realtime'
                ELSE '✅ RLS is OFF'
            END as status
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('boq', 'boq_details', 'boq_internal_revisions')
        ORDER BY tablename;
    """)
    rls_status = cur.fetchall()
    for row in rls_status:
        print(f"   {row[0]}: {row[2]}")

    # Check 3: Check if tables are in realtime publication
    print("\n3️⃣ CHECKING REALTIME PUBLICATION...")
    cur.execute("""
        SELECT
            t.tablename,
            CASE
                WHEN p.tablename IS NOT NULL THEN '✅ IN REALTIME PUBLICATION'
                ELSE '❌ NOT IN REALTIME PUBLICATION'
            END as publication_status
        FROM pg_tables t
        LEFT JOIN pg_publication_tables p
            ON p.tablename = t.tablename
            AND p.pubname = 'supabase_realtime'
        WHERE t.schemaname = 'public'
        AND t.tablename IN ('boq', 'boq_details', 'boq_internal_revisions')
        ORDER BY t.tablename;
    """)
    pub_status = cur.fetchall()
    all_in_publication = True
    for row in pub_status:
        print(f"   {row[0]}: {row[1]}")
        if '❌' in row[1]:
            all_in_publication = False

    # Check 4: Check RLS policies
    print("\n4️⃣ CHECKING RLS POLICIES...")
    cur.execute("""
        SELECT
            tablename,
            policyname,
            cmd as command
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename IN ('boq', 'boq_details', 'boq_internal_revisions')
        ORDER BY tablename, policyname;
    """)
    policies = cur.fetchall()
    if policies:
        print("   Found RLS policies:")
        for policy in policies:
            print(f"   - {policy[0]}.{policy[1]} ({policy[2]})")
    else:
        print("   ✅ No RLS policies found (good for realtime)")

    # Check 5: List all tables in realtime publication
    print("\n5️⃣ ALL TABLES IN REALTIME PUBLICATION...")
    cur.execute("""
        SELECT schemaname, tablename
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        ORDER BY tablename;
    """)
    all_pub_tables = cur.fetchall()
    if all_pub_tables:
        print(f"   Found {len(all_pub_tables)} tables in publication:")
        for table in all_pub_tables:
            emoji = "✅" if table[1] in ['boq', 'boq_details', 'boq_internal_revisions'] else "  "
            print(f"   {emoji} {table[1]}")
    else:
        print("   ⚠️ No tables found in realtime publication!")

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    issues = []

    # Check RLS
    rls_on = any('⚠️' in str(row[2]) for row in rls_status)
    if rls_on:
        issues.append("❌ RLS is enabled on some tables - this can block realtime")
        print("❌ RLS is enabled on some tables")
    else:
        print("✅ RLS is disabled on all BOQ tables")

    # Check publication
    if not all_in_publication:
        issues.append("❌ Not all tables are in realtime publication")
        print("❌ Not all tables are in realtime publication")
    else:
        print("✅ All BOQ tables are in realtime publication")

    if not issues:
        print("\n🎉 REALTIME IS PROPERLY CONFIGURED!")
        print("   If you're still seeing errors, the issue may be:")
        print("   - Network connectivity")
        print("   - Supabase quota limits")
        print("   - Browser console errors")
    else:
        print("\n⚠️ ISSUES FOUND:")
        for issue in issues:
            print(f"   {issue}")
        print("\n🔧 TO FIX: Run the diagnose_and_fix_realtime.sql script in Supabase SQL Editor")

    print("="*60 + "\n")

    cur.close()
    conn.close()

if __name__ == '__main__':
    try:
        check_realtime_config()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        print("\nMake sure:")
        print("1. DATABASE_URL is set in backend/.env")
        print("2. Database connection is working")
        print("3. You have proper database permissions")
