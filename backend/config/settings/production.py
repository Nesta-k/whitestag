from django.core.exceptions import ImproperlyConfigured

from .base import *


if DEBUG:
    raise ImproperlyConfigured("DJANGO_DEBUG must be False in production.")

if not env("DATABASE_URL", default=""):
    raise ImproperlyConfigured("DATABASE_URL must be set for production.")

if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS must contain explicit production host names, not '*'."
    )

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=3600)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=False,
)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

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

MAILERS = {
    "default": {
        "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "OPTIONS": {
            "host": email_host,
            "port": env.int("EMAIL_PORT", default=587),
            "username": env("EMAIL_HOST_USER", default=""),
            "password": env("EMAIL_HOST_PASSWORD", default=""),
            "use_tls": email_use_tls,
            "use_ssl": email_use_ssl,
        },
    },
}
DEFAULT_FROM_EMAIL = default_from_email
