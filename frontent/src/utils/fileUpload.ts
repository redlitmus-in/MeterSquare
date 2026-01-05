import { supabase } from '@/lib/supabase';

/**
 * Upload a file to Supabase Storage
 * @param file - The file to upload
 * @param bucket - The storage bucket name
 * @param path - The path within the bucket (e.g., 'delivery-notes/2024/file.pdf')
 * @returns The public URL of the uploaded file
 */
export const uploadFileToSupabase = async (
  file: File,
  bucket: string,
  path: string
): Promise<string> => {
  try {
    // Upload file to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return publicUrl;
  } catch (error) {
    console.error('File upload error:', error);
    throw error;
  }
};

/**
 * Delete a file from Supabase Storage
 * @param bucket - The storage bucket name
 * @param path - The path within the bucket
 */
export const deleteFileFromSupabase = async (
  bucket: string,
  path: string
): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.error('Supabase delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  } catch (error) {
    console.error('File delete error:', error);
    throw error;
  }
};

/**
 * Generate a unique file path for storage
 * @param originalFileName - The original file name
 * @param prefix - Optional prefix (e.g., 'delivery-notes')
 * @returns A unique file path
 */
export const generateUniqueFilePath = (
  originalFileName: string,
  prefix: string = ''
): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalFileName.split('.').pop();
  const nameWithoutExtension = originalFileName.replace(`.${extension}`, '').replace(/[^a-zA-Z0-9]/g, '_');

  const fileName = `${nameWithoutExtension}_${timestamp}_${randomString}.${extension}`;

  if (prefix) {
    return `${prefix}/${fileName}`;
  }

  return fileName;
};
