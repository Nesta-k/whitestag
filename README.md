# WhiteStag

WhiteStag is a full-stack e-commerce application foundation with catalogue,
customer/cart, inventory, order, and Paystack payment workflows.

## Architecture

- **Frontend:** Next.js, React, TypeScript, and Tailwind CSS in `frontend/`.
- **Backend:** Django and Django REST Framework in `backend/`.
- **Database:** PostgreSQL is configurable through `DATABASE_URL`. Development
  uses a local SQLite database when that variable is blank.
- **Payments:** Backend-only Paystack initialization, verification, signed
  webhooks, settlement, and refund reconciliation are implemented. The
  frontend checkout and automated refund initiation are not.

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

`NEXT_PUBLIC_API_URL` is public browser configuration; never put secrets,
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

The API health check is available at `http://127.0.0.1:8000/api/health/`.

Run backend tests only after selecting an isolated database. To force a
disposable in-memory SQLite test database from PowerShell:

```powershell
$env:DATABASE_URL = "sqlite:///:memory:"
$env:DJANGO_SECRET_KEY = "test-only-key-not-for-deployment-012345678901234567890123"
$env:DJANGO_DEBUG = "True"
python backend\manage.py test apps.catalogue apps.customers apps.inventory apps.orders apps.api
Remove-Item Env:DATABASE_URL, Env:DJANGO_SECRET_KEY, Env:DJANGO_DEBUG
```

The test runner creates and destroys its temporary database; the configured
PostgreSQL database is not used by this command. On SQLite, tests requiring
PostgreSQL row-lock behavior are skipped. Use a separately provisioned,
disposable PostgreSQL test database to validate those concurrency cases.

## Catalogue API

The read-only public catalogue endpoints are:

- `GET /api/catalogue/categories/`
- `GET /api/catalogue/brands/`
- `GET /api/catalogue/products/`
- `GET /api/catalogue/products/{slug}/`

Product lists can be filtered with `category` and `brand` slugs, and with
`product_type` and `sales_method` values. List endpoints use page-number
pagination (`page` and optional `page_size`). Only published products appear
in public product results; catalogue records are managed through Django Admin.

## Inventory

Inventory is staff-only under `/api/inventory/`. Staff can list records,
retrieve a product's record and movement history, and post to the
`receive/`, `adjust/`, `reserve/`, `release/`, `sale/`, and `return/` actions
for a product ID. Each stock-change request must send a UUID in the
`Idempotency-Key` header. Keys are globally unique across products. Repeating
the same request replays its original movement; reusing the key with a
different product, operation, quantity, reason, or reference returns a
conflict.

Available quantity is unreserved physical stock; reserved quantity is held
stock. Total on-hand stock is their sum. Receipts and returns increase
available stock; reservations transfer quantity from available to reserved;
release transfers it back; a sale consumes reserved stock. Adjustments change
available stock only. Each change is transactional and creates an immutable
stock-movement audit record. Detailed shipment/delivery workflows and public
inventory quantity disclosure remain outside this backend.

## Customer accounts and cart

Customer APIs are under `/api/accounts/`: `POST register/`, `POST login/`,
`POST logout/`, and `GET me/`. Registration and login return a Django REST
Framework token. Send it as `Authorization: Token <token>` on subsequent
requests; logout deletes that token. Session authentication remains enabled
for Django Admin and clients that deliberately use cookie sessions. Token
authentication is bearer-style: use HTTPS in deployment, keep tokens private,
and understand that DRF's built-in tokens do not expire automatically; logout
invalidates that user's active DRF token. Password-change and password-reset
flows are not implemented and would need to revoke tokens when added.

Registration requires a unique email address (case-insensitive) and a password
that passes Django's configured validators. Login errors do not distinguish an
unknown email from a wrong password. Registration is limited to 5 attempts per
hour and login to 10 per minute per IP by DRF throttling. Configure a shared
cache and suitable edge-level rate limits for multi-process production
deployments; Django's local-memory cache does not coordinate limits between
workers.

The authenticated customer's persistent cart is available at `GET /api/cart/`.
Use `POST /api/cart/items/` to add a product and quantity,
`PATCH /api/cart/items/{item_id}/` to set a quantity, and
`DELETE /api/cart/items/{item_id}/` to remove it. Only published spare parts
marked for direct purchase and having a current price can be added. Add/update
also require an inventory record with enough currently available stock; this
is a momentary check, not a reservation. The cart does not reserve stock.
Existing lines remain visible if their product becomes unavailable; such lines
are marked unavailable, and product details are omitted if the listing is no
longer published/eligible. The cart always reports the current catalogue price,
not a client-supplied or saved price. A changed price is therefore reflected
immediately; unavailable-stock changes return a conflict response.

## Orders

Authenticated customers create an order from their cart with
`POST /api/orders/checkout/`, list their own orders at `GET /api/orders/`,
retrieve an order at `GET /api/orders/{public_reference}/`, and request
cancellation with `POST /api/orders/{public_reference}/cancel/`. The public
reference is a random UUID; internal sequential database IDs are not exposed.
Checkout requires a UUID
`Idempotency-Key` header and shipping/contact details. Repeating the same key
and details returns the original order; changing the details with that key is
a conflict. Submitted prices and totals are ignored. The server snapshots
current catalogue prices, SKU and product names, computes totals in the
products' currency (GHS by default), and requires a single currency per order.

Checkout accepts only published, priced spare parts set to direct purchase.
It locks the customer's cart, then products and inventory in ascending product
ID order, reserves stock through the inventory service, and clears the cart
only after order and reservations succeed in one database transaction. An
empty/ineligible cart is rejected; insufficient or unavailable stock returns
a conflict. Cancellation is allowed only for pending, unpaid orders; stock is
released through the inventory service in the same transaction, with a
deterministic idempotency key per order line. Repeated cancellation is safe.
New orders start pending and unpaid. Payment and fulfilment transitions are
not accepted through the API; order totals and snapshots are read-only to API
users and protected from editing in Django Admin. Vehicles and quote-only
products are not orderable through this API.

Staff can view all orders at `GET /api/orders/staff/` and mark paid processing
orders complete with `POST /api/orders/staff/{public_reference}/complete/`.
Customer list/detail access is restricted to that customer's records. No
customer endpoint marks an order paid or accepts client changes to order
totals. The `expire_unpaid_orders` management command releases reservations
and marks old, unpaid orders expired; it skips orders with active or unresolved
payment attempts. Schedule it periodically in the deployment environment and
set `ORDER_EXPIRY_HOURS` to a positive value.

## Payment processing

The orders app now has persistent payment-attempt and payment-event models.
Payment attempts snapshot the order's GHS amount in major and minor units,
have unique references and order-scoped idempotency keys, and use controlled
service-layer status transitions. Only one active attempt is allowed per
order. Failed or abandoned attempts may be retried. Webhook event records
retain a deduplication key and payload digest, not the raw request body.
Cancellation and expiry are blocked while payment is active or otherwise
unresolved.

`POST /api/orders/{public_reference}/payments/` initializes a Paystack
transaction for the authenticated order owner. It accepts a UUID
`Idempotency-Key`, derives amount and currency from the persisted order, and
returns only the payment reference, status, and Paystack authorization URL.
The backend uses a fixed HTTPS Paystack endpoint and a 10-second timeout. The
secret is configured as `PAYSTACK_SECRET_KEY` through Django's environment
settings; the example file contains only a blank placeholder, and the secret
must never be put in frontend configuration.

An initialization attempt is committed before the provider request, and the
database lock is not held during network I/O. If the result is ambiguous (for
example, a timeout or malformed response), the attempt remains initializing.
Repeating the same request returns its reference and does not send another
provider request; the outcome can be checked using the verification endpoint
below. A malformed or mismatched provider result remains unresolved for
reconciliation.

`POST /api/orders/payments/{payment_reference}/verify/` performs server-side
verification for the authenticated payment owner. It uses the stored reference
and reconciles provider status, reference, minor-unit amount, and currency
against the payment and order snapshots. Pending or inconclusive results are
never treated as paid. A verified success consumes each reserved order line
with deterministic inventory idempotency keys and marks the order paid in one
transaction. Repeated verification does not consume stock twice. A verified
success after cancellation or a released reservation is marked for refund or
reconciliation and does not reopen the order or consume stock. Payment events
retain a digest and outcome, not the raw Paystack payload.

`POST /api/orders/payments/paystack/webhook/` accepts signed Paystack events.
It validates `x-paystack-signature` using HMAC-SHA512 and the backend-only
`PAYSTACK_SECRET_KEY`, rejects oversized/invalid requests, and uses a
payload-digest uniqueness key for replay protection. Charge success is sent
through the same reconciliation service as customer verification; unknown,
contradictory, and unsupported events are durably ignored or flagged without
settling orders. A full, processed refund event is reconciled only when the
provider transaction reference, amount, and currency match the persisted
payment. Partial or inconsistent refunds require staff reconciliation.
Pending or processing refunds remain in a durable `refund_pending` payment
state until a processed event arrives. Refund reconciliation records a
`refunded_at` timestamp and does not restore sold inventory; returns are a
separate stock workflow.

Late success after cancellation or an unavailable reservation remains
`refund_required`; it does not reopen the order or consume released stock.
Authorized staff can initiate a full refund at
`POST /api/orders/staff/payments/{payment_reference}/refunds/` with an
`Idempotency-Key`. The refund attempt and `refund_pending` payment status are
persisted before the Paystack request. Retries reuse the existing attempt and
never resubmit an ambiguous refund request; resolve such attempts through
Paystack verification/webhook and staff reconciliation. Refund issuance is
limited to one full refund per payment; partial refunds are not supported.
Frontend checkout is not implemented.

Orders can be expired by scheduling
`python backend\manage.py expire_unpaid_orders` (or running it from `backend/`
as `python manage.py expire_unpaid_orders`). Expiry releases inventory and
marks eligible old orders `expired` transactionally. Orders with active,
successful, or reconciliation-required payment attempts are left untouched so
they can be verified before reservations are released.

Django reads the environment through `django-environ`. `manage.py`, WSGI, and
ASGI default to `config.settings.development`. Production must explicitly use
`config.settings.production`; production settings require a PostgreSQL
`DATABASE_URL`, configured `DJANGO_ALLOWED_HOSTS`, and SMTP mail host/sender
settings, with `DJANGO_DEBUG=False`. They require PostgreSQL, explicit hosts,
frontend CORS/CSRF origins, a Paystack secret, and SMTP settings, and enable
HTTPS-related security settings including one-year HSTS by default. Configure SMTP credentials when the
provider requires them; do not commit them. Enable HSTS preload or subdomain
inclusion only after the domain and all required subdomains are confirmed
HTTPS-ready; both are disabled by default. Set
`TRUST_X_FORWARDED_PROTO=True` only when a trusted TLS-terminating reverse
proxy sets that header. After configuring the production values in
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
running and accepts the connection before applying migrations:

```powershell
python backend\manage.py migrate
```

No migrations were applied to the configured development or production
database as part of this work. Orders migrations `0002` through `0007` add
payment persistence, payment authorization URLs, active-payment uniqueness,
order expiration support, refund-pending/refunded timestamp tracking, and
durable staff refund attempts. The
migration graph was checked for model drift,
and test migrations ran only on a temporary in-memory SQLite database. The
migration state of the configured development database has not been queried.
Confirm the target and review/backup its data before applying pending
migrations; never run migrations against production without a deployment plan.

## Configuration and next development steps

- Development and production settings are separated under
  `backend/config/settings/`. The old generated, hard-coded development key
  has been removed.
- Django REST Framework, CORS middleware, PostgreSQL URL parsing, production
  HTTPS settings, and SMTP settings use the documented environment variables.
  Configure only frontend CORS/CSRF origins you control.
- The catalogue app provides categories, brands, products, images, and
  specifications with public, read-only catalogue endpoints. Staff-only
  inventory management, customer accounts, and persistent carts are implemented;
  order creation, cancellation, expiry, and completion are implemented. Paystack
  initialization, verification, signed webhook reconciliation, and refund
  reconciliation are implemented; delivery-provider and quotation workflows
  remain outside the backend.
- `.env.example` files contain examples, not real credentials. Copy them to
  local `.env` files and replace example values before use. Local environment
  files, virtual environments, generated output, databases, and uploads are
  ignored by Git; the examples remain trackable.
- Paystack behavior is covered by mocked tests only; no live provider call is
  made by the test suite. Configure the webhook URL in the Paystack dashboard.
- The webhook implementation expects Paystack's `charge.success`,
  `charge.failed`, `charge.abandoned`, and `refund.processed` event shapes.
  Confirm refund-event fields against the Paystack configuration before
  enabling refund reconciliation in production.
- Delivery-provider integration, quotations, password reset/change, automatic
  refund requests, and frontend checkout remain outside the backend scope.
