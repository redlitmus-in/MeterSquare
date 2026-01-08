from flask import request, jsonify
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import uuid
from config.db import db
from config.logging import get_logger
from werkzeug.utils import secure_filename
from supabase import create_client, Client
from models.change_request import ChangeRequest
from models.boq import *
from PIL import Image
import io

log = get_logger()

# Configuration constants from environment variables based on ENVIRONMENT
environment = os.environ.get('ENVIRONMENT', 'production')
if environment == 'development':
    supabase_url = os.environ.get('DEV_SUPABASE_URL')
    supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
else:
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_ANON_KEY')
SUPABASE_BUCKET = "file_upload"
ITEM_SUPABASE_BUCKET = "boq_file"
ALLOWED_EXTENSIONS = {
    # Documents
    'pdf', 'doc', 'docx', 'txt', 'xlsx', 'xls', 'csv', 'ppt', 'pptx',
    # Images
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'svg', 'webp',
    # CAD files
    'dwg', 'dxf', 'dwf', 'dgn', 'rvt', 'rfa', 'nwd', 'nwc', 'ifc', 'sat', 'step', 'stp', 'iges', 'igs',
    # 3D files
    'skp', 'obj', 'fbx', '3ds', 'stl', 'ply', 'dae',
    # Other engineering files
    'zip', 'rar', '7z'
}
MAX_WORKERS = 12
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB max file size (increased for CAD files)
MAX_IMAGE_SIZE = 50 * 1024 * 1024  # 50MB max image size

# Validate Supabase configuration
if not supabase_url or not supabase_key:
    log.error("Supabase URL or Key not configured in environment variables")
    raise ValueError("Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_KEY environment variables")

# Initialize Supabase client
try:
    supabase: Client = create_client(supabase_url, supabase_key)
    log.info(f"Supabase client initialized successfully")
    log.info(f"Using bucket: {SUPABASE_BUCKET}")
except Exception as e:
    log.error(f"Failed to initialize Supabase client: {str(e)}")
    raise

# Pre-build base URL for public files
PUBLIC_URL_BASE = f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/"
IMAGE_PUBLIC_URL_BASE = f"{supabase_url}/storage/v1/object/public/{ITEM_SUPABASE_BUCKET}/"

# Global executor for better resource management
global_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def compress_image(file_content, max_size=MAX_IMAGE_SIZE, quality=95):
    """
    Compress image to ensure it's under max_size (default 50MB)

    Args:
        file_content: Raw image file content
        max_size: Maximum size in bytes (default 50MB)
        quality: Initial JPEG quality (1-100, default 95)

    Returns:
        tuple: (compressed_content, content_type)
    """
    try:
        # Open image
        img = Image.open(io.BytesIO(file_content))

        # Convert RGBA to RGB if necessary (for JPEG compatibility)
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background

        # If image is already under max size, return original
        if len(file_content) <= max_size:
            return file_content, "image/jpeg"

        # Compress image iteratively
        output = io.BytesIO()
        current_quality = quality

        while current_quality > 10:
            output.seek(0)
            output.truncate(0)

            # Save with current quality
            img.save(output, format='JPEG', quality=current_quality, optimize=True)

            # Check size
            compressed_size = output.tell()
            if compressed_size <= max_size:
                log.info(f"Image compressed from {len(file_content)} to {compressed_size} bytes (quality: {current_quality})")
                return output.getvalue(), "image/jpeg"

            # Reduce quality for next iteration
            current_quality -= 5

        # If still too large, resize image
        output.seek(0)
        output.truncate(0)

        # Calculate new dimensions (reduce by 20%)
        new_width = int(img.width * 0.8)
        new_height = int(img.height * 0.8)
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Try compression again with resized image
        img.save(output, format='JPEG', quality=85, optimize=True)
        compressed_size = output.tell()

        log.info(f"Image resized and compressed from {len(file_content)} to {compressed_size} bytes")
        return output.getvalue(), "image/jpeg"

    except Exception as e:
        log.error(f"Image compression failed: {str(e)}")
        raise Exception(f"Failed to compress image: {str(e)}")


def upload_single_file(path, content, content_type):
    """Upload a single file to Supabase storage"""
    try:
        log.info(f"Uploading file to: {path}, size: {len(content)} bytes")
        log.info(f"Content type: {content_type}")
        log.info(f"Bucket: {SUPABASE_BUCKET}")

        # Direct upload with upsert enabled to overwrite if exists
        response = supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=path,
            file=content,
            file_options={
                "content-type": content_type,
                "upsert": "true"  # This will overwrite if file exists
            }
        )

        # Log the response for debugging
        log.info(f"Upload response: {response}")
        log.info(f"Successfully uploaded: {path}")

        # Get the public URL
        public_url = f"{PUBLIC_URL_BASE}{path}"
        log.info(f"Public URL: {public_url}")
        return public_url

    except Exception as e:
        error_msg = str(e)
        log.error(f"Upload failed for {path}: {error_msg}")
        log.error(f"Error type: {type(e).__name__}")
        log.error(f"Full error details: {repr(e)}")

        # More specific error messages
        if "payload too large" in error_msg.lower():
            raise Exception("File exceeds Supabase storage limits")
        elif "unauthorized" in error_msg.lower() or "forbidden" in error_msg.lower():
            raise Exception("Storage authentication error - check Supabase credentials")
        elif "not found" in error_msg.lower():
            raise Exception(f"Storage bucket '{SUPABASE_BUCKET}' not found")
        elif "bucket" in error_msg.lower():
            raise Exception(f"Storage bucket error: {error_msg}")
        else:
            # Return the actual error for debugging
            raise Exception(f"Upload failed: {error_msg}")


def upload_single_image(path, content, content_type):
    """Upload a single image to Supabase storage (ITEM_SUPABASE_BUCKET)"""
    try:
        log.info(f"Uploading image to: {path}, size: {len(content)} bytes")
        log.info(f"Content type: {content_type}")
        log.info(f"Bucket: {ITEM_SUPABASE_BUCKET}")

        # Direct upload with upsert enabled to overwrite if exists
        response = supabase.storage.from_(ITEM_SUPABASE_BUCKET).upload(
            path=path,
            file=content,
            file_options={
                "content-type": content_type,
                "upsert": "true"
            }
        )

        log.info(f"Upload response: {response}")
        log.info(f"Successfully uploaded: {path}")

        # Get the public URL
        public_url = f"{IMAGE_PUBLIC_URL_BASE}{path}"
        log.info(f"Public URL: {public_url}")
        return public_url

    except Exception as e:
        error_msg = str(e)
        log.error(f"Upload failed for {path}: {error_msg}")
        log.error(f"Error type: {type(e).__name__}")
        log.error(f"Full error details: {repr(e)}")

        if "payload too large" in error_msg.lower():
            raise Exception("Image exceeds Supabase storage limits")
        elif "unauthorized" in error_msg.lower() or "forbidden" in error_msg.lower():
            raise Exception("Storage authentication error - check Supabase credentials")
        elif "not found" in error_msg.lower():
            raise Exception(f"Storage bucket '{ITEM_SUPABASE_BUCKET}' not found")
        elif "bucket" in error_msg.lower():
            raise Exception(f"Storage bucket error: {error_msg}")
        else:
            raise Exception(f"Upload failed: {error_msg}")


def process_file_batch(files, cr_id):
    """Process multiple files for upload in parallel"""
    if not files:
        return [], []

    uploaded_files = []
    errors = []
    futures = []

    # Use timestamp for uniqueness
    import time
    timestamp = int(time.time())

    for index, file in enumerate(files):
        if not file or file.filename == '':
            continue

        try:
            # Secure filename
            filename = secure_filename(file.filename)
            # Validate file extension
            if not allowed_file(filename):
                errors.append(f"{file.filename}: Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}")
                continue

            # Create unique filename with UUID to avoid conflicts
            name_part, ext_part = os.path.splitext(filename)
            unique_id = str(uuid.uuid4())[:8]
            unique_filename = f"{name_part}_{unique_id}{ext_part}"
            # Build storage path for buyer files
            supabase_path = f"buyer/cr_{cr_id}/{unique_filename}"
            # Read file content
            file_content = file.read()
            file_size = len(file_content)

            # Validate file size
            if file_size > MAX_FILE_SIZE:
                errors.append(f"{file.filename}: File too large. Maximum size is {MAX_FILE_SIZE / (1024*1024):.0f}MB")
                continue

            if file_size == 0:
                errors.append(f"{file.filename}: File is empty")
                continue

            content_type = file.content_type or "application/octet-stream"

            # Submit upload task
            future = global_executor.submit(
                upload_single_file,
                supabase_path,
                file_content,
                content_type
            )

            futures.append((future, {
                "filename": unique_filename,
                "original": filename,
                "path": supabase_path,
                "size": file_size,
                "type": content_type
            }))
        except Exception as e:
            errors.append(f"Error processing {file.filename}: {str(e)}")

    # Collect results
    for future, file_info in futures:
        try:
            public_url = future.result(timeout=30)  # Increased timeout for larger files
            uploaded_files.append({
                "filename": file_info["filename"],
                "original": file_info["original"],
                "path": file_info["path"],
                "size": file_info["size"],
                "type": file_info["type"],
                "url": public_url
            })
            log.info(f"Successfully processed upload for {file_info['original']}")
        except Exception as e:
            error_msg = str(e) if str(e) else "Upload failed"
            errors.append(f"{file_info['original']}: {error_msg}")
            log.error(f"Failed to upload {file_info['original']}: {error_msg}")
            log.error(f"Error details: {repr(e)}")

    return uploaded_files, errors


def process_image_batch(files, item_id):
    """Process multiple images for upload with compression in parallel"""
    if not files:
        return [], []

    uploaded_files = []
    errors = []
    futures = []

    # Image extensions
    IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'}

    for file in files:
        if not file or file.filename == '':
            continue

        try:
            # Secure filename
            filename = secure_filename(file.filename)

            # Get file extension
            if '.' not in filename:
                errors.append(f"{file.filename}: No file extension")
                continue

            ext = filename.rsplit('.', 1)[1].lower()

            # Validate image extension
            if ext not in IMAGE_EXTENSIONS:
                errors.append(f"{file.filename}: Invalid image type. Allowed: {', '.join(IMAGE_EXTENSIONS)}")
                continue

            # Create unique filename
            name_part, ext_part = os.path.splitext(filename)
            unique_id = str(uuid.uuid4())[:8]
            unique_filename = f"{name_part}_{unique_id}.jpg"  # Always save as JPEG after compression

            # Build storage path for item images
            supabase_path = f"items/{item_id}/{unique_filename}"

            # Read file content
            file_content = file.read()
            file_size = len(file_content)

            if file_size == 0:
                errors.append(f"{file.filename}: File is empty")
                continue

            # Compress image to max 50MB
            try:
                compressed_content, content_type = compress_image(file_content, MAX_IMAGE_SIZE)
                compressed_size = len(compressed_content)
                log.info(f"Original size: {file_size} bytes, Compressed size: {compressed_size} bytes")
            except Exception as e:
                errors.append(f"{file.filename}: Compression failed - {str(e)}")
                continue

            # Submit upload task
            future = global_executor.submit(
                upload_single_image,
                supabase_path,
                compressed_content,
                content_type
            )

            futures.append((future, {
                "filename": unique_filename,
                "original": filename,
                "path": supabase_path,
                "original_size": file_size,
                "compressed_size": compressed_size,
                "type": content_type
            }))

        except Exception as e:
            errors.append(f"Error processing {file.filename}: {str(e)}")

    # Collect results
    for future, file_info in futures:
        try:
            public_url = future.result(timeout=30)
            uploaded_files.append({
                "filename": file_info["filename"],
                "original": file_info["original"],
                "path": file_info["path"],
                "original_size": file_info["original_size"],
                "compressed_size": file_info["compressed_size"],
                "type": file_info["type"],
                "url": public_url
            })
            log.info(f"Successfully processed upload for {file_info['original']}")
        except Exception as e:
            error_msg = str(e) if str(e) else "Upload failed"
            errors.append(f"{file_info['original']}: {error_msg}")
            log.error(f"Failed to upload {file_info['original']}: {error_msg}")

    return uploaded_files, errors


def buyer_upload_files(cr_id):
    """
    Upload files for a buyer's change request

    POST /api/buyer/upload/<cr_id>
    """
    start_time = time.time()

    try:
        # Get files from request
        files = request.files.getlist("file") if "file" in request.files else []

        if not files:
            return jsonify({"error": "No files provided"}), 400

        # Get the change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Process uploads
        uploaded_files, errors = process_file_batch(files, cr_id)

        # Check if any files were successfully uploaded
        if not uploaded_files and errors:
            upload_time = time.time() - start_time
            return jsonify({
                "success": False,
                "message": "All file uploads failed",
                "uploaded_files": [],
                "errors": errors,
                "upload_time": f"{upload_time:.2f}s"
            }), 400

        # Update change request with filenames if we have successful uploads
        if uploaded_files:
            filenames = [f["filename"] for f in uploaded_files]

            # Get existing files
            existing_files = []
            if change_request.file_path:
                existing_files = [f.strip() for f in change_request.file_path.split(",") if f.strip()]

            # Append new files to existing ones
            all_files = existing_files + filenames
            change_request.file_path = ",".join(all_files)

            # Save to database
            db.session.add(change_request)
            db.session.commit()

        upload_time = time.time() - start_time

        # Build response
        if uploaded_files and not errors:
            message = "All files uploaded successfully"
            status_code = 200
        elif uploaded_files and errors:
            message = f"Partial success: {len(uploaded_files)} files uploaded, {len(errors)} failed"
            status_code = 207
        else:
            message = "Upload completed with errors"
            status_code = 400

        return jsonify({
            "success": len(uploaded_files) > 0,
            "message": message,
            "cr_id": cr_id,
            "uploaded_files": uploaded_files,
            "total_uploaded": len(uploaded_files),
            "errors": errors if errors else None,
            "upload_time": f"{upload_time:.2f}s",
            "file_path": change_request.file_path if uploaded_files else None
        }), status_code

    except Exception as e:
        db.session.rollback()
        log.error(f"Upload failed for change request {cr_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500

def buyer_view_files(cr_id):
    """
    View uploaded files for a buyer's change request

    GET /api/buyer/files/<cr_id>
    """
    start_time = time.time()

    try:
        # Get the change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        files_list = []

        # Check if there are files stored in the database
        if change_request.file_path:
            filenames = [f.strip() for f in change_request.file_path.split(",") if f.strip()]

            for filename in filenames:
                file_path = f"buyer/cr_{cr_id}/{filename}"
                files_list.append({
                    "filename": filename,
                    "file_path": file_path,
                    "public_url": f"{PUBLIC_URL_BASE}{file_path}",
                    "storage_bucket": SUPABASE_BUCKET
                })

        # Also check Supabase storage for any files not in database
        try:
            storage_path = f"buyer/cr_{cr_id}"
            entries = supabase.storage.from_(SUPABASE_BUCKET).list(path=storage_path)

            if isinstance(entries, list):
                # Get filenames from database to avoid duplicates
                db_filenames = set([f.strip() for f in change_request.file_path.split(",") if f.strip()]) if change_request.file_path else set()

                for entry in entries:
                    if isinstance(entry, dict) and entry.get('name'):
                        if entry['name'] not in db_filenames:
                            file_path = f"{storage_path}/{entry['name']}"
                            files_list.append({
                                "filename": entry['name'],
                                "file_path": file_path,
                                "public_url": f"{PUBLIC_URL_BASE}{file_path}",
                                "storage_bucket": SUPABASE_BUCKET,
                                "note": "Found in storage but not in database"
                            })
        except Exception as e:
            log.warning(f"Could not list storage files for CR {cr_id}: {str(e)}")

        response_time = time.time() - start_time

        return jsonify({
            "success": True,
            "cr_id": cr_id,
            "files": files_list,
            "total_files": len(files_list),
            "response_time": f"{response_time:.3f}s"
        }), 200

    except Exception as e:
        log.error(f"Failed to get files for change request {cr_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500

def buyer_delete_files(cr_id):
    """
    Delete specific files for a buyer's change request

    DELETE /api/buyer/files/<cr_id>
    Body: {"files_to_delete": ["filename1.pdf", "filename2.jpg"]}
    """
    try:
        # Get the change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Get files to delete from request body
        data = request.get_json()
        files_to_delete = data.get('files_to_delete', [])

        if not files_to_delete:
            return jsonify({"error": "No files specified for deletion"}), 400

        # Parse current filenames from database
        current_files = [f.strip() for f in (change_request.file_path or "").split(",") if f.strip()]

        # Convert to set for efficient lookup
        files_to_delete_set = {f.strip() for f in files_to_delete}

        # Delete files from storage
        deleted_count = 0
        failed_files = []

        for filename in files_to_delete_set:
            if filename in current_files:
                file_path = f"buyer/{cr_id}/{filename}"
                try:
                    supabase.storage.from_(SUPABASE_BUCKET).remove([file_path])
                    deleted_count += 1
                    log.info(f"Deleted file: {file_path}")
                except Exception as e:
                    log.error(f"Failed to delete {file_path}: {str(e)}")
                    failed_files.append(filename)

        # Update database with remaining files
        remaining_files = [f for f in current_files if f not in files_to_delete_set]
        change_request.file_path = ",".join(remaining_files) if remaining_files else None

        db.session.add(change_request)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "File deletion completed",
            "cr_id": cr_id,
            "deleted_count": deleted_count,
            "failed_files": failed_files,
            "remaining_files": len(remaining_files),
            "file_path": change_request.file_path
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting files for CR {cr_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500

def buyer_delete_all_files(cr_id):
    """
    Delete all files for a buyer's change request

    DELETE /api/buyer/files/all/<cr_id>
    """
    try:
        # Get the change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        deleted_count = 0
        failed_count = 0

        # Delete all files from storage
        if change_request.file_path:
            filenames = [f.strip() for f in change_request.file_path.split(",") if f.strip()]

            for filename in filenames:
                file_path = f"buyer/{cr_id}/{filename}"
                try:
                    supabase.storage.from_(SUPABASE_BUCKET).remove([file_path])
                    deleted_count += 1
                    log.info(f"Deleted file: {file_path}")
                except Exception as e:
                    log.warning(f"Failed to delete {file_path}: {str(e)}")
                    failed_count += 1

        # Clear file_path in database
        change_request.file_path = None
        db.session.add(change_request)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "All files deleted successfully",
            "cr_id": cr_id,
            "deleted_count": deleted_count,
            "failed_count": failed_count
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting all files for CR {cr_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500

def item_upload_image(id):
    """
    Upload image for sub_item with compression (max 50MB)
    Uploads to ITEM_SUPABASE_BUCKET ("images")

    POST /api/item/upload/<id>
    """
    start_time = time.time()

    try:
        # Get files from request
        files = request.files.getlist("file") if "file" in request.files else []

        if not files:
            return jsonify({"error": "No files provided"}), 400

        # Get the sub_item
        sub_item = MasterSubItem.query.filter_by(sub_item_id=id).first()
        if not sub_item:
            return jsonify({"error": "Sub_item not found"}), 404

        # Process image uploads with compression
        uploaded_files, errors = process_image_batch(files, id)

        # Check if any files were successfully uploaded
        if not uploaded_files and errors:
            upload_time = time.time() - start_time
            return jsonify({
                "success": False,
                "message": "All image uploads failed",
                "uploaded_files": [],
                "errors": errors,
                "upload_time": f"{upload_time:.2f}s"
            }), 400

        # Update sub_item with image data if we have successful uploads
        if uploaded_files:
            # Get existing images (JSONB array)
            existing_images = sub_item.sub_item_image if sub_item.sub_item_image else []

            # Ensure it's a list
            if not isinstance(existing_images, list):
                existing_images = []

            # Append new image data to existing ones
            new_images = [{
                "filename": f["filename"],
                "original_name": f["original"],
                "url": f["url"],
                "path": f["path"],
                "size": f["compressed_size"],
                "uploaded_at": time.strftime("%Y-%m-%d %H:%M:%S")
            } for f in uploaded_files]

            all_images = existing_images + new_images
            sub_item.sub_item_image = all_images

            # Save to database
            db.session.add(sub_item)
            db.session.commit()

        upload_time = time.time() - start_time

        # Build response
        if uploaded_files and not errors:
            message = "All images uploaded successfully"
            status_code = 200
        elif uploaded_files and errors:
            message = f"Partial success: {len(uploaded_files)} images uploaded, {len(errors)} failed"
            status_code = 207
        else:
            message = "Upload completed with errors"
            status_code = 400

        return jsonify({
            "success": len(uploaded_files) > 0,
            "message": message,
            "sub_item_id": id,
            "uploaded_files": uploaded_files,
            "total_uploaded": len(uploaded_files),
            "errors": errors if errors else None,
            "upload_time": f"{upload_time:.2f}s",
            "bucket": ITEM_SUPABASE_BUCKET,
            "sub_item_image": sub_item.sub_item_image if uploaded_files else None
        }), status_code

    except Exception as e:
        db.session.rollback()
        log.error(f"Upload failed for sub_item {id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_item_images(id):
    """
    View uploaded images for a sub_item

    GET /api/item/images/<id>
    """
    start_time = time.time()

    try:
        # Get the sub_item
        sub_item = MasterSubItem.query.filter_by(sub_item_id=id).first()
        if not sub_item:
            return jsonify({"error": "Sub_item not found"}), 404

        images_list = []

        # Check if there are images stored in the database (JSONB array)
        if sub_item.sub_item_image and isinstance(sub_item.sub_item_image, list):
            images_list = sub_item.sub_item_image

        # Also check Supabase storage for any files not in database
        try:
            storage_path = f"items/{id}"
            entries = supabase.storage.from_(ITEM_SUPABASE_BUCKET).list(path=storage_path)

            if isinstance(entries, list):
                # Get filenames from database to avoid duplicates
                db_filenames = set([img.get("filename") for img in images_list if isinstance(img, dict)])

                for entry in entries:
                    if isinstance(entry, dict) and entry.get('name'):
                        if entry['name'] not in db_filenames:
                            file_path = f"{storage_path}/{entry['name']}"
                            images_list.append({
                                "filename": entry['name'],
                                "url": f"{IMAGE_PUBLIC_URL_BASE}{file_path}",
                                "path": file_path,
                                "storage_bucket": ITEM_SUPABASE_BUCKET,
                                "note": "Found in storage but not in database"
                            })
        except Exception as e:
            log.warning(f"Could not list storage files for item {id}: {str(e)}")

        response_time = time.time() - start_time

        return jsonify({
            "success": True,
            "sub_item_id": id,
            "images": images_list,
            "total_images": len(images_list),
            "bucket": ITEM_SUPABASE_BUCKET,
            "response_time": f"{response_time:.3f}s"
        }), 200

    except Exception as e:
        log.error(f"Failed to get images for sub_item {id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


def delete_item_images(id):
    """
    Delete a specific image for a sub_item by filename

    DELETE /api/images/<id>
    Body: {"filename": "image_3_afe2f8a4.jpg"}
    """
    try:
        # Get the sub_item
        sub_item = MasterSubItem.query.filter_by(sub_item_id=id).first()
        if not sub_item:
            return jsonify({"error": "Sub_item not found"}), 404

        # Get image filename to delete from request body
        data = request.get_json()
        filename = data.get('filename', '').strip()

        if not filename:
            return jsonify({"error": "No filename specified for deletion"}), 400

        # Get current images from database (JSONB array)
        current_images = sub_item.sub_item_image if sub_item.sub_item_image and isinstance(sub_item.sub_item_image, list) else []

        # Check if image exists in database
        image_found = False
        for img in current_images:
            if isinstance(img, dict) and img.get("filename") == filename:
                image_found = True
                break

        if not image_found:
            return jsonify({"error": f"Image '{filename}' not found for this item"}), 404

        # Delete file from storage
        file_path = f"items/{id}/{filename}"
        try:
            supabase.storage.from_(ITEM_SUPABASE_BUCKET).remove([file_path])
            log.info(f"Deleted image from storage: {file_path}")
        except Exception as e:
            log.error(f"Failed to delete {file_path} from storage: {str(e)}")
            return jsonify({"error": f"Failed to delete image from storage: {str(e)}"}), 500

        # Update database - remove deleted image from JSONB array
        remaining_images = [
            img for img in current_images
            if isinstance(img, dict) and img.get("filename") != filename
        ]

        sub_item.sub_item_image = remaining_images if remaining_images else []

        db.session.add(sub_item)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Image deleted successfully",
            "sub_item_id": id,
            "deleted_filename": filename,
            "remaining_images": len(remaining_images),
            "bucket": ITEM_SUPABASE_BUCKET
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting image for item {id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


def delete_all_item_images(id):
    """
    Delete all images for a sub_item

    DELETE /api/images/all/<id>
    """
    try:
        # Get the sub_item
        sub_item = MasterSubItem.query.filter_by(sub_item_id=id).first()
        if not sub_item:
            return jsonify({"error": "Sub_item not found"}), 404

        deleted_count = 0
        failed_count = 0

        # Delete all images from storage
        current_images = sub_item.sub_item_image if sub_item.sub_item_image and isinstance(sub_item.sub_item_image, list) else []

        if current_images:
            for img in current_images:
                if isinstance(img, dict) and img.get("filename"):
                    filename = img.get("filename")
                    file_path = f"items/{id}/{filename}"
                    try:
                        supabase.storage.from_(ITEM_SUPABASE_BUCKET).remove([file_path])
                        deleted_count += 1
                        log.info(f"Deleted image: {file_path}")
                    except Exception as e:
                        log.warning(f"Failed to delete {file_path}: {str(e)}")
                        failed_count += 1

        # Clear sub_item_image in database
        sub_item.sub_item_image = []
        db.session.add(sub_item)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "All images deleted successfully",
            "sub_item_id": id,
            "deleted_count": deleted_count,
            "failed_count": failed_count,
            "bucket": ITEM_SUPABASE_BUCKET
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting all images for item {id}: {str(e)}")
        return jsonify({"error": str(e)}), 500