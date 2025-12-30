"""
Check Supabase Storage buckets and RLS policies in both Production and Development
"""
import os
from dotenv import load_dotenv

load_dotenv()

def check_bucket(name, supabase_url, supabase_key):
    """Check a Supabase storage bucket and its policies"""
    print(f"\n{'='*60}")
    print(f"Checking {name} Supabase Storage")
    print(f"{'='*60}")

    if not supabase_url or not supabase_key:
        print(f"[X] {name} Supabase credentials not found in .env")
        return

    print(f"URL: {supabase_url}")
    print(f"Key: {supabase_key[:20]}...{supabase_key[-10:]}")

    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_key)

        # List all buckets
        print(f"\n[BUCKETS] Listing all buckets:")
        try:
            buckets = client.storage.list_buckets()
            for bucket in buckets:
                print(f"   - {bucket.name} (public: {bucket.public}, id: {bucket.id})")
        except Exception as e:
            print(f"   Error listing buckets: {e}")

        # Check file_upload bucket
        bucket_name = "file_upload"
        print(f"\n[FOLDER] Checking '{bucket_name}' bucket:")

        try:
            # List root level
            files = client.storage.from_(bucket_name).list()
            print(f"   Root level items: {len(files)}")
            for item in files[:20]:
                item_name = item.get('name', 'unknown')
                is_folder = item.get('id') is None
                prefix = "[DIR]" if is_folder else "[FILE]"
                print(f"      {prefix} {item_name}")

        except Exception as e:
            print(f"   [X] Error accessing bucket: {e}")

        # Check RLS policies using SQL query
        print(f"\n[POLICIES] Checking Storage RLS Policies:")
        try:
            # Query storage.objects policies
            result = client.rpc('get_storage_policies', {}).execute()
            print(f"   RPC result: {result}")
        except Exception as e:
            print(f"   [INFO] Cannot query policies via RPC: {e}")

        # Try to get bucket info
        print(f"\n[BUCKET INFO] Getting bucket details:")
        try:
            bucket_info = client.storage.get_bucket(bucket_name)
            print(f"   Name: {bucket_info.name}")
            print(f"   ID: {bucket_info.id}")
            print(f"   Public: {bucket_info.public}")
            print(f"   Allowed MIME types: {bucket_info.allowed_mime_types}")
            print(f"   File size limit: {bucket_info.file_size_limit}")
        except Exception as e:
            print(f"   [X] Error getting bucket info: {e}")

        # Test upload permission
        print(f"\n[TEST UPLOAD] Testing upload permission:")
        try:
            test_content = b"test file content"
            test_path = "test_upload_permission.txt"
            result = client.storage.from_(bucket_name).upload(
                test_path,
                test_content,
                {"content-type": "text/plain", "x-upsert": "true"}
            )
            print(f"   [OK] Upload test SUCCESS: {result}")
            # Clean up test file
            client.storage.from_(bucket_name).remove([test_path])
            print(f"   [OK] Test file cleaned up")
        except Exception as e:
            print(f"   [X] Upload test FAILED: {e}")

    except Exception as e:
        print(f"[X] Error connecting to {name} Supabase: {e}")

if __name__ == "__main__":
    print("Supabase Storage Bucket & Policy Checker")
    print("="*60)

    # Check Production
    check_bucket(
        "PRODUCTION",
        os.environ.get('SUPABASE_URL'),
        os.environ.get('SUPABASE_KEY')
    )

    # Check Development
    check_bucket(
        "DEVELOPMENT",
        os.environ.get('DEV_SUPABASE_URL'),
        os.environ.get('DEV_SUPABASE_KEY')
    )

    # Check for service role keys
    print(f"\n{'='*60}")
    print("Service Role Keys Check:")
    print(f"{'='*60}")
    prod_service = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    dev_service = os.environ.get('DEV_SUPABASE_SERVICE_ROLE_KEY')
    print(f"SUPABASE_SERVICE_ROLE_KEY: {'[OK] Found' if prod_service else '[X] Not found'}")
    print(f"DEV_SUPABASE_SERVICE_ROLE_KEY: {'[OK] Found' if dev_service else '[X] Not found'}")
