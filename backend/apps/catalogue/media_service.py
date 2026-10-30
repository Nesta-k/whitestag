from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.files.storage import default_storage
from rest_framework.exceptions import ValidationError

from .image_urls import public_image_url

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}
MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB limit
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def is_cloudinary_configured():
    """Checks whether valid Cloudinary credentials have been provided."""
    cloudinary_url = getattr(settings, "CLOUDINARY_URL", "")
    cloud_name = getattr(settings, "CLOUDINARY_CLOUD_NAME", "")
    api_key = getattr(settings, "CLOUDINARY_API_KEY", "")
    api_secret = getattr(settings, "CLOUDINARY_API_SECRET", "")
    return bool(cloudinary_url or (cloud_name and api_key and api_secret))


def validate_image_file(upload):
    """Validates that the upload is a supported image under size threshold."""
    if upload is None:
        raise ValidationError({"file": "An image file is required."})

    if upload.size > MAX_IMAGE_UPLOAD_BYTES:
        raise ValidationError(
            {"file": f"Images must be {MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)} MB or smaller."}
        )

    content_type = (upload.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise ValidationError({"file": "Upload a JPEG, PNG, GIF, or WebP image."})

    extension = Path(upload.name or "").suffix.lower()
    if extension and extension not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            {"file": f"File extension '{extension}' is not supported. Use .jpg, .png, .webp, or .gif."}
        )

    return extension or {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }.get(content_type, ".jpg")


def upload_media_file(upload, folder="catalogue", request=None):
    """
    Uploads an image file to Cloudinary if configured, otherwise falls back
    to local Django media storage.
    """
    extension = validate_image_file(upload)

    if is_cloudinary_configured():
        import cloudinary.uploader

        # Upload to Cloudinary with automatic optimization
        upload_result = cloudinary.uploader.upload(
            upload,
            folder=f"whitestag/{folder}",
            resource_type="image",
            quality="auto",
            fetch_format="auto",
            use_filename=False,
            unique_filename=True,
        )
        return {
            "url": upload_result.get("secure_url") or upload_result.get("url"),
            "public_id": upload_result.get("public_id"),
            "width": upload_result.get("width"),
            "height": upload_result.get("height"),
            "format": upload_result.get("format"),
            "bytes": upload_result.get("bytes"),
            "storage": "cloudinary",
        }

    # Fallback to local default storage
    stored_name = default_storage.save(
        f"{folder}/{uuid4().hex}{extension}",
        upload,
    )
    file_url = public_image_url(request, default_storage.url(stored_name))
    return {
        "url": file_url,
        "public_id": stored_name,
        "storage": "local",
    }


def upload_media_batch(uploads, folder="catalogue", request=None):
    """Uploads multiple files and returns a list of results."""
    return [
        upload_media_file(file, folder=folder, request=request)
        for file in uploads
    ]
