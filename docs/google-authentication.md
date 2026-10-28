# Google sign-in setup

WhiteStag uses Google Identity Services' JavaScript sign-in button to receive a
Google ID token. The frontend posts that token to
`POST /api/accounts/google/`; Django verifies its signature, issuer, expiry,
and audience, then returns the same token/customer response used by email
sign-in. No OAuth redirect or callback URL is used.

## Google Cloud Console

1. Select or create the Google Cloud project and configure the OAuth consent
   screen for the intended audience.
2. Create an OAuth client ID with application type **Web application**.
3. Add these local **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`
4. No **Authorized redirect URI** is required for this ID-token-to-Django flow.
5. Add the production frontend origin separately once the production domain is
   known. This implementation does not require a Google client secret.

## WhiteStag configuration

- Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `frontend/.env.local` to the Web client
  ID. `frontend/.env.example` contains a placeholder.
- Set `GOOGLE_OAUTH_CLIENT_ID` in the backend environment to the same Web
  client ID. `backend/.env.example` contains an empty placeholder.
- Ensure the frontend origin is included in Django's `CORS_ALLOWED_ORIGINS`.
  The backend example includes both local origins.
- Install backend dependencies from `backend/requirements/development.txt`;
  this includes Google's trusted `google-auth` verification library.

These are client IDs, not client secrets. Never place a Google client secret,
Django secret, or database credential in the frontend. The Google subject is
stored on the customer account; only a verified Google email can be linked to
an existing customer account. Existing password login remains available.
