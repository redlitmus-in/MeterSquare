/**
 * Script to create Supabase Storage bucket for inventory files
 * Run with: npx ts-node scripts/create-storage-bucket.ts
 */

import { supabase } from '../src/lib/supabase';

async function createStorageBucket() {
  const bucketName = 'inventory-files';

  console.log('=' .repeat(70));
  console.log('Creating Supabase Storage Bucket');
  console.log('=' .repeat(70));

  try {
    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      throw listError;
    }

    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);

    if (bucketExists) {
      console.log(`✓ Bucket '${bucketName}' already exists`);
      return;
    }

    // Create the bucket
    console.log(`Creating bucket '${bucketName}'...`);
    const { data, error } = await supabase.storage.createBucket(bucketName, {
      public: true, // Make files publicly accessible
      fileSizeLimit: 10485760, // 10MB limit
      allowedMimeTypes: [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    });

    if (error) {
      console.error('Error creating bucket:', error);
      throw error;
    }

    console.log(`✓ Successfully created bucket '${bucketName}'`);
    console.log('\n✅ Storage bucket setup completed!');

  } catch (error) {
    console.error('\n❌ Error during bucket creation:', error);
    process.exit(1);
  }

  console.log('=' .repeat(70));
}

// Run the script
createStorageBucket();
