from collections.abc import Mapping


class GoogleIdentityError(Exception):
    pass


def validate_google_claims(claims):
    if not isinstance(claims, Mapping):
        raise GoogleIdentityError("Google returned an invalid sign-in response.")
    if (
        not isinstance(claims.get("sub"), str)
        or not claims["sub"]
        or len(claims["sub"]) > 255
        or not isinstance(claims.get("email"), str)
        or claims.get("email_verified") is not True
    ):
        raise GoogleIdentityError("A verified Google email is required.")
    return claims


def verify_google_id_token(credential, audience):
    if not audience:
        raise GoogleIdentityError("Google sign-in is not configured.")

    try:
        from google.auth.exceptions import GoogleAuthError
        from google.auth.transport.requests import Request
        from google.oauth2 import id_token

        claims = id_token.verify_oauth2_token(
            credential,
            Request(),
            audience=audience,
        )
    except (ValueError, GoogleAuthError, TypeError) as exc:
        raise GoogleIdentityError("Google could not verify this sign-in.") from exc

    return validate_google_claims(claims)
