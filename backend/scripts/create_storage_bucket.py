"""
Script to create Supabase Storage bucket for inventory files
Run with: python3 scripts/create_storage_bucket.py
"""

import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_storage_bucket():
    """Create inventory-files storage bucket in Supabase"""

    # Use ENVIRONMENT variable to determine which Supabase to use
    environment = os.environ.get('ENVIRONMENT', 'production')
    if environment == 'development':
        supabase_url = os.getenv('DEV_SUPABASE_URL')
        supabase_key = os.getenv('DEV_SUPABASE_ANON_KEY')
        env_label = 'DEVELOPMENT'
    else:
        supabase_url = os.getenv('SUPABASE_URL')
        supabase_key = os.getenv('SUPABASE_ANON_KEY')
        env_label = 'PRODUCTION'

    if not supabase_url or not supabase_key:
        print('❌ Missing Supabase environment variables')
        return False

    bucket_name = 'inventory-files'

    print('=' * 70)
    print(f'Creating Supabase Storage Bucket ({env_label})')
    print('=' * 70)

    try:
        # Check if bucket already exists
        print(f'\nChecking if bucket "{bucket_name}" exists...')
        list_url = f'{supabase_url}/storage/v1/bucket'
        headers = {
            'Authorization': f'Bearer {supabase_key}',
            'apikey': supabase_key,
            'Content-Type': 'application/json'
        }

        response = requests.get(list_url, headers=headers)

        if response.status_code == 200:
            buckets = response.json()
            bucket_exists = any(bucket.get('name') == bucket_name for bucket in buckets)

            if bucket_exists:
                print(f'✓ Bucket "{bucket_name}" already exists')
                return True

        # Create the bucket
        print(f'\nCreating bucket "{bucket_name}"...')
        create_url = f'{supabase_url}/storage/v1/bucket'

        payload = {
            'name': bucket_name,
            'public': True,
            'file_size_limit': 10485760,  # 10MB
            'allowed_mime_types': [
                'application/pdf',
                'image/jpeg',
                'image/jpg',
                'image/png',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ]
        }

        response = requests.post(create_url, json=payload, headers=headers)

        if response.status_code in [200, 201]:
            print(f'✓ Successfully created bucket "{bucket_name}"')
            print('\n✅ Storage bucket setup completed!')
            return True
        else:
            print(f'❌ Error creating bucket: {response.status_code}')
            print(f'Response: {response.text}')
            return False

    except Exception as e:
        print(f'\n❌ Error during bucket creation: {e}')
        return False

    finally:
        print('=' * 70)

if __name__ == '__main__':
    create_storage_bucket()
