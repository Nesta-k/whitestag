ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}
MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024


def public_image_url(request, value):
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if request is None:
        return value
    return request.build_absolute_uri(value)
