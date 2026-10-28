# WhiteStag

WhiteStag is a full-stack web application foundation. Paystack is planned but
has not been integrated.

## Architecture

- **Frontend:** Next.js, React, TypeScript, and Tailwind CSS in `frontend/`.
- **Backend:** Django and Django REST Framework in `backend/`.
- **Database:** PostgreSQL is configurable through `DATABASE_URL`. Development
  uses a local SQLite database when that variable is blank.
- **Payments:** Paystack integration is not configured.

## Windows prerequisites

- Node.js 20.9 or newer and npm.
- Python 3.12 or newer.
- PostgreSQL for PostgreSQL-backed development or deployment.
- PowerShell.

The backend dependencies are listed in
[`backend/requirements/development.txt`](backend/requirements/development.txt).
The frontend lockfile is `frontend/package-lock.json`.

## Frontend

From the repository root, install the locked dependencies and start Next.js:

```powershell
npm --prefix frontend ci
npm --prefix frontend run dev
```

The development server is available at `http://localhost:3000`. To configure
the public backend URL, copy the example and edit it as needed:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
```

`NEXT_PUBLIC_API_BASE_URL` is public browser configuration; never put secrets,
database passwords, Django keys, or Paystack secret keys in `NEXT_PUBLIC_*`
variables.

## Backend

The repository already has a virtual environment at `backend\.venv`. Reuse it:

```powershell
.\backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements\development.txt
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env` before starting Django. Replace the example secret with a
locally generated development key of at least 50 characters. Generate one with:

```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

With `DATABASE_URL` blank, Django uses SQLite; set it to a PostgreSQL URL when
a local PostgreSQL server is ready.

Run the backend from the repository root:

```powershell
python backend\manage.py check
python backend\manage.py runserver
```

Django reads the environment through `django-environ`. `manage.py`, WSGI, and
ASGI default to `config.settings.development`. Production must explicitly use
`config.settings.production`; production settings require a PostgreSQL
`DATABASE_URL`, configured `DJANGO_ALLOWED_HOSTS`, and SMTP mail host/sender
settings, with `DJANGO_DEBUG=False`. They enable HTTPS-related security
settings. Configure SMTP credentials when the provider requires them; do not
commit them. Enable HSTS preload only after the domain and all required
subdomains are confirmed HTTPS-ready; subdomain inclusion is disabled by
default for the same reason. After configuring the production values in
`backend\.env`, run these commands from `backend/` to select and check the
production settings:

```powershell
$env:DJANGO_SETTINGS_MODULE = "config.settings.production"
python manage.py check --deploy
```

## PostgreSQL setup

Install and start PostgreSQL, then create a database and a dedicated login role
with permission to use it. For example, in `psql`:

```sql
CREATE ROLE whitestag WITH LOGIN PASSWORD 'choose-a-local-password';
CREATE DATABASE whitestag OWNER whitestag;
```

Set `DATABASE_URL` in `backend\.env` to the matching connection URL:

```text
postgresql://whitestag:URL_ENCODED_PASSWORD@127.0.0.1:5432/whitestag
```

URL-encode special characters in the password. Verify that PostgreSQL is
running and accepts the connection before applying migrations. No migrations
are included or run by this foundation.

## Configuration and next development steps

- Development and production settings are separated under
  `backend/config/settings/`. The old generated, hard-coded development key
  has been removed.
- Django REST Framework, CORS middleware, and PostgreSQL URL parsing are
  configured. CORS and CSRF origins come from environment variables; configure
  only the frontend origins you control.
- `.env.example` files contain examples, not real credentials. Copy them to
  local `.env` files and replace example values before use. Local environment
  files, virtual environments, generated output, databases, and uploads are
  ignored by Git; the examples remain trackable.
- PostgreSQL has not been connection-tested. To use it, install/start the
  server, create the role and database, configure `DATABASE_URL`, and test the
  connection before deciding to create migrations.
- No application API endpoint or Paystack integration has been implemented.
  To begin the first API endpoint, from `backend/` run
  `python manage.py startapp api apps\api`, change the generated app config
  name to `apps.api`, and register `apps.api` in `INSTALLED_APPS`. Add a
  serializer and view in that app, define its URL in `apps\api\urls.py`, and
  include it under an `/api/` path in `config\urls.py`. Start with a
  database-independent endpoint if possible; only add models and migrations
  once the data contract is settled and PostgreSQL has been configured and
  connection-tested.
