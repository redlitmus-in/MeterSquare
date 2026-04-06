"""
MeterSquare: Storage Bucket Migration (Production → ATH)
Copies all files from production Supabase storage to ATH Supabase storage.
"""

import sys
import subprocess

# Ensure supabase is installed
try:
    from supabase import create_client
except ImportError:
    print("  Installing supabase-py...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "supabase", "-q"])
    from supabase import create_client

# Production Supabase
PROD_URL = "https://wgddnoiakkoskbbkbygw.supabase.co"
PROD_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZGRub2lha2tvc2tiYmtieWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDM5MzM2NywiZXhwIjoyMDY5OTY5MzY3fQ."
    "0-SpSHgZBrVzAlEP9LLY0ch-3O4NJ8T2GD5LM1NlKSk"
)

# ATH Supabase
ATH_URL = "https://iqkbmieiyavceuqfoqtw.supabase.co"
ATH_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxa2JtaWVpeWF2Y2V1cWZvcXR3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk3MSwiZXhwIjoyMDg4OTU3OTcxfQ."
    "rnbYUwmYchQVZkW8asNZv8AJmFgSWG5pzCh0wQl1vAw"
)

BUCKETS = ["file_upload", "inventory-files"]

CONTENT_TYPES = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "csv": "text/csv",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "json": "application/json",
    "txt": "text/plain",
}


def get_content_type(file_path: str) -> str:
    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    return CONTENT_TYPES.get(ext, "application/octet-stream")


def list_all_files(client, bucket_name: str, path: str = "") -> list[str]:
    """Recursively list all files in a bucket."""
    all_files = []
    try:
        items = client.storage.from_(bucket_name).list(path)
    except Exception as e:
        print(f"  Warning: Could not list {bucket_name}/{path}: {e}")
        return all_files

    for item in items:
        item_path = f"{path}/{item['name']}" if path else item["name"]

        if item.get("id") is None:
            # Folder — recurse into it
            all_files.extend(list_all_files(client, bucket_name, item_path))
        else:
            # File
            all_files.append(item_path)

    return all_files


def delete_all_files(client, bucket_name: str) -> int:
    """Delete all files in a bucket."""
    files = list_all_files(client, bucket_name)
    if not files:
        return 0

    deleted = 0
    for i in range(0, len(files), 100):
        batch = files[i : i + 100]
        try:
            client.storage.from_(bucket_name).remove(batch)
            deleted += len(batch)
        except Exception as e:
            print(f"  Warning: Could not delete batch: {e}")

    return deleted


def copy_bucket(prod_client, ath_client, bucket_name: str) -> int:
    """Copy all files from production bucket to ATH bucket."""
    print(f"\n  Bucket: {bucket_name}")
    print(f"  {'─' * 40}")

    # Ensure bucket exists in ATH
    try:
        ath_client.storage.create_bucket(bucket_name, options={"public": True})
        print("  Created bucket in ATH")
    except Exception:
        print("  Bucket already exists in ATH")

    # Delete existing ATH files
    print("  Clearing existing ATH files...")
    deleted = delete_all_files(ath_client, bucket_name)
    print(f"  Deleted {deleted} existing files")

    # List all production files
    print("  Listing production files...")
    prod_files = list_all_files(prod_client, bucket_name)
    total = len(prod_files)
    print(f"  Found {total} files to copy")

    if total == 0:
        return 0

    # Copy files one by one
    copied = 0
    errors = 0
    for i, file_path in enumerate(prod_files):
        try:
            data = prod_client.storage.from_(bucket_name).download(file_path)
            content_type = get_content_type(file_path)

            ath_client.storage.from_(bucket_name).upload(
                file_path,
                data,
                file_options={"content-type": content_type, "upsert": "true"},
            )
            copied += 1

            if (i + 1) % 10 == 0 or (i + 1) == total:
                print(f"  Progress: {i + 1}/{total} files copied")

        except Exception as e:
            errors += 1
            print(f"  ERROR copying {file_path}: {e}")

    print(f"  ✓ Copied: {copied}/{total} | Errors: {errors}")
    return copied


def main():
    print("\n  Starting storage bucket migration...")
    print("  Production → ATH\n")

    prod = create_client(PROD_URL, PROD_KEY)
    ath = create_client(ATH_URL, ATH_KEY)

    total_copied = 0
    for bucket in BUCKETS:
        total_copied += copy_bucket(prod, ath, bucket)

    print(f"\n  {'═' * 40}")
    print(f"  Total files migrated: {total_copied}")
    print(f"  {'═' * 40}")


if __name__ == "__main__":
    main()
