from django.core.exceptions import ImproperlyConfigured

from .base import *


if DEBUG:
    raise ImproperlyConfigured("DJANGO_DEBUG must be False in production.")

if not env("DATABASE_URL", default=""):
    raise ImproperlyConfigured("DATABASE_URL must be set for production.")

if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured(
        "DATABASE_URL must configure PostgreSQL in production."
    )

if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS must contain explicit production host names, not '*'."
    )

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)
if SECURE_HSTS_SECONDS < 1:
    raise ImproperlyConfigured("SECURE_HSTS_SECONDS must be positive in production.")
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=False,
)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

if not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured(
        "CORS_ALLOWED_ORIGINS must contain the deployed frontend origin."
    )
if not CSRF_TRUSTED_ORIGINS:
    raise ImproperlyConfigured(
        "CSRF_TRUSTED_ORIGINS must contain trusted HTTPS origins."
    )
if any(
    not origin.lower().startswith("https://")
    for origin in CORS_ALLOWED_ORIGINS + CSRF_TRUSTED_ORIGINS
):
    raise ImproperlyConfigured(
        "Production CORS and CSRF trusted origins must use HTTPS."
    )
if not PAYSTACK_SECRET_KEY or PAYSTACK_SECRET_KEY.startswith("sk_test_"):
    raise ImproperlyConfigured(
        "A live PAYSTACK_SECRET_KEY must be configured for production payments."
    )

if env.bool("TRUST_X_FORWARDED_PROTO", default=False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

email_host = env("EMAIL_HOST", default="")
default_from_email = env("DEFAULT_FROM_EMAIL", default="")
email_use_tls = env.bool("EMAIL_USE_TLS", default=True)
email_use_ssl = env.bool("EMAIL_USE_SSL", default=False)

if not email_host or not default_from_email:
    raise ImproperlyConfigured(
        "EMAIL_HOST and DEFAULT_FROM_EMAIL must be configured for production."
    )

if email_use_tls and email_use_ssl:
    raise ImproperlyConfigured("EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be True.")

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = email_host
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = email_use_tls
EMAIL_USE_SSL = email_use_ssl
DEFAULT_FROM_EMAIL = default_from_email
