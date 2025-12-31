"""
Fix Development Supabase Storage RLS policies to match Production
"""
import os
from dotenv import load_dotenv

load_dotenv()

def fix_rls_policies():
    """Add RLS policies to Development Supabase storage bucket"""
    print("Fixing Development Supabase Storage RLS Policies")
    print("="*60)

    supabase_url = os.environ.get('DEV_SUPABASE_URL')
    supabase_key = os.environ.get('DEV_SUPABASE_KEY')

    if not supabase_url or not supabase_key:
        print("[X] DEV_SUPABASE credentials not found in .env")
        return

    print(f"URL: {supabase_url}")

    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_key)

        # SQL to add RLS policies for file_upload bucket
        policies_sql = """
        -- First, check if policies exist and drop them if they do
        DO $$
        BEGIN
            -- Drop existing policies if they exist
            DROP POLICY IF EXISTS "Public read access for file_upload" ON storage.objects;
            DROP POLICY IF EXISTS "Allow uploads for file_upload" ON storage.objects;
            DROP POLICY IF EXISTS "Allow updates for file_upload" ON storage.objects;
            DROP POLICY IF EXISTS "Allow deletes for file_upload" ON storage.objects;
        EXCEPTION
            WHEN undefined_table THEN
                NULL;
        END $$;

        -- Create new policies
        -- Allow public read access
        CREATE POLICY "Public read access for file_upload" ON storage.objects
        FOR SELECT USING (bucket_id = 'file_upload');

        -- Allow uploads (INSERT) for anyone
        CREATE POLICY "Allow uploads for file_upload" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'file_upload');

        -- Allow updates for anyone
        CREATE POLICY "Allow updates for file_upload" ON storage.objects
        FOR UPDATE USING (bucket_id = 'file_upload');

        -- Allow deletes for anyone
        CREATE POLICY "Allow deletes for file_upload" ON storage.objects
        FOR DELETE USING (bucket_id = 'file_upload');
        """

        print("\n[1] Executing RLS policy SQL...")

        # Try using rpc to execute raw SQL
        try:
            result = client.rpc('exec_sql', {'sql': policies_sql}).execute()
            print(f"   Result: {result}")
        except Exception as e:
            print(f"   RPC method failed: {e}")
            print("\n[2] Trying alternative method with postgrest...")

        # Alternative: Use direct database connection
        print("\n[3] Trying direct PostgreSQL connection...")

        # Get database URL from environment
        dev_db_url = os.environ.get('DEV_DATABASE_URL')
        if dev_db_url:
            import psycopg2

            conn = psycopg2.connect(dev_db_url)
            conn.autocommit = True
            cur = conn.cursor()

            # Execute each policy separately
            policies = [
                ("Drop existing policies", """
                    DROP POLICY IF EXISTS "Public read access for file_upload" ON storage.objects;
                    DROP POLICY IF EXISTS "Allow uploads for file_upload" ON storage.objects;
                    DROP POLICY IF EXISTS "Allow updates for file_upload" ON storage.objects;
                    DROP POLICY IF EXISTS "Allow deletes for file_upload" ON storage.objects;
                """),
                ("Create SELECT policy", """
                    CREATE POLICY "Public read access for file_upload" ON storage.objects
                    FOR SELECT USING (bucket_id = 'file_upload');
                """),
                ("Create INSERT policy", """
                    CREATE POLICY "Allow uploads for file_upload" ON storage.objects
                    FOR INSERT WITH CHECK (bucket_id = 'file_upload');
                """),
                ("Create UPDATE policy", """
                    CREATE POLICY "Allow updates for file_upload" ON storage.objects
                    FOR UPDATE USING (bucket_id = 'file_upload');
                """),
                ("Create DELETE policy", """
                    CREATE POLICY "Allow deletes for file_upload" ON storage.objects
                    FOR DELETE USING (bucket_id = 'file_upload');
                """),
            ]

            for name, sql in policies:
                try:
                    print(f"   Executing: {name}...")
                    cur.execute(sql)
                    print(f"   [OK] {name} - Success")
                except Exception as e:
                    print(f"   [X] {name} - Error: {e}")

            cur.close()
            conn.close()
            print("\n[OK] Database connection closed")
        else:
            print("   [X] DEV_DATABASE_URL not found in .env")

        # Test upload again
        print("\n[4] Testing upload permission after fix...")
        try:
            test_content = b"test file content after RLS fix"
            test_path = "test_rls_fix.txt"
            result = client.storage.from_('file_upload').upload(
                test_path,
                test_content,
                {"content-type": "text/plain", "x-upsert": "true"}
            )
            print(f"   [OK] Upload test SUCCESS!")
            # Clean up
            client.storage.from_('file_upload').remove([test_path])
            print(f"   [OK] Test file cleaned up")
        except Exception as e:
            print(f"   [X] Upload test still FAILED: {e}")
            print("\n   You may need to run the SQL manually in Supabase Dashboard:")
            print("   Go to SQL Editor and run:")
            print("""
   CREATE POLICY "Allow uploads for file_upload" ON storage.objects
   FOR INSERT WITH CHECK (bucket_id = 'file_upload');
            """)

    except Exception as e:
        print(f"[X] Error: {e}")

if __name__ == "__main__":
    fix_rls_policies()
