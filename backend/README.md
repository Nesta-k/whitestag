# WhiteStag Backend

The backend is a Django REST Framework API for the WhiteStag storefront. It
provides catalogue, customer account, cart, wishlist, inventory, order and
payment services. PostgreSQL is the intended deployment database; the backend
uses the configured `DATABASE_URL` when present.

## Wishlist API

Wishlist endpoints require an authenticated customer account:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/wishlist/` | List the signed-in customer's published products |
| `POST` | `/api/wishlist/` | Add a published product with `{"product_id": 123}` |
| `DELETE` | `/api/wishlist/{item_id}/` | Remove an item owned by the signed-in customer |

Listing uses the catalogue page-number pagination format. Both spare parts and
vehicle listings are supported. Draft, archived, and unknown products cannot be
added. Repeating an add for the same product returns the existing wishlist item
instead of creating a duplicate.

## Customer authentication

Email/password registration and login continue to use Django REST Framework
token authentication. Google sign-in uses `POST /api/accounts/google/` with a
Google ID token in `{"credential": "..."}` and returns that same token/customer
response. Google tokens are verified server-side against
`GOOGLE_OAUTH_CLIENT_ID`; only Google-verified email identities can be linked
to existing customer accounts. Configure the matching frontend client ID and
local origins using [the Google authentication setup guide](../docs/google-authentication.md).

## Delivery pricing and checkout

Delivery pricing is configured in Django Admin under **Delivery pricing
configurations**, **Delivery zones**, and **Delivery surcharges**. No rates,
distances, or surcharges are seeded in code.

Create one active pricing configuration and assign it a unique version. Staff
configure the GHS base fee, per-kilometre and per-kilogram rates, minimum fee,
optional maximum fee, rounding mode, and optional manual-review thresholds.
Only one configuration may be active at a time. Configuration changes are
recorded in a read-only Django Admin audit log with the acting staff account
and before/after values. Zone estimates, surcharge rules, and active states are
audited as well. Keep the version identifier meaningful when changing
commercial rates. Historical fixed zone fees are retained as read-only legacy
data and are not used in new quotes.

Each active delivery zone maps a unique city/region pair to a staff-entered
estimated distance from the dispatch point. This is explicitly an estimate, not
a live route calculation. A missing zone or distance never falls back to a
fabricated distance or exact fee; the quote is marked for manual review and
checkout is blocked until staff configure the destination. An external routing
provider can replace the zone-estimate service interface later, but no provider
is currently called and no routing API key is required.

Staff enter each catalogue product's shipping weight in kilograms. A missing,
zero, or otherwise invalid product weight makes the delivery quote require
manual review; unknown weights are never treated as zero. The server calculates
shipment weight by multiplying current trusted product weights by cart
quantities. Request-supplied weights, fees, distances, or totals are ignored.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/orders/delivery-zones/` | List active delivery areas and estimated distances |
| `POST` | `/api/orders/delivery-quote/` | Authenticated quote calculated from the customer's server-side cart |
| `POST` | `/api/orders/checkout/` | Revalidate pricing, create the order, and snapshot the quote |

The quote and checkout endpoints require an authenticated customer account.
They accept a Ghana destination (`country: "GH"`) and match city/region to an
active zone. A successful quote returns an explicitly estimated breakdown:
base fee, distance and weight components, applicable fixed surcharges, route
distance source, shipment weight, formula version, and estimated order total.
When location, weight, route estimate, configuration, or safety thresholds
require manual review, the response contains no exact fee or order total.

Checkout recalculates from locked server-side cart/product/configuration data.
It persists the pricing inputs and formula version, zone destination,
per-product weight/quantity snapshot, estimated distance/source, component
breakdown, final fee and final total before payment can be initialized.
Idempotent retries replay the saved order snapshot; pricing changes never alter
an existing order or the amount used to initialize payment. Cancellation keeps
the delivery snapshot for the order record while releasing inventory through
the existing cancellation service.

Hard safety limits route extreme shipments for manual review: 10,000 kg,
20,000 km, or a GHS 1,000,000 delivery fee. Staff can set lower review
thresholds in the active pricing configuration. These are operational limits,
not commercial rates.

No new environment variables are required for this zone-estimate implementation.
`backend/.env.example` explicitly notes that delivery rates/distances are
configured in Admin and that no external routing secret is currently used.

## Local development and migrations

From PowerShell:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py check
python manage.py makemigrations --check --dry-run
```

Configure the backend environment using `backend/.env.example` as a reference.
Keep real secrets and database credentials in the local `backend/.env` or
deployment environment; never put them in the frontend. Set `DATABASE_URL` to
the PostgreSQL connection URL when using PostgreSQL. Before applying migrations,
confirm the target database is the intended local development database.

After review, apply migrations and create a Django staff account using the
project's normal deployment procedure. Staff need Django Admin access to enter
product weights, create zones and estimated distances, define surcharge rules,
and activate a pricing configuration before automatic delivery quotes are
available. Do not configure production rates or credentials in source control.
