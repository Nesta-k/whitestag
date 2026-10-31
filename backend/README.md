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

Delivery pricing is managed from the staff dashboard and Django Admin.
Migration `0010_regional_and_quoted_delivery` seeds editable starter fees for
Ghana's 16 regions and enables African destinations for manual quotations.
These suggested domestic fees are not guaranteed courier prices; no
international shipping rates are configured.

Create an active general pricing configuration and assign it a unique version
for fallback areas. Staff configure the GHS base fee, per-kilometre and
per-kilogram rates, minimum fee, optional maximum fee, rounding mode, and
optional manual-review thresholds. Only one configuration may be active at a
time. Configuration changes are
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
| `GET` | `/api/orders/delivery-options/` | List available Ghana regions, African countries, and international quote instructions |
| `GET` | `/api/orders/delivery-zones/` | List active fallback delivery areas and estimated distances |
| `POST` | `/api/orders/delivery-quote/` | Authenticated quote calculated from the customer's server-side cart |
| `POST` | `/api/orders/delivery-quote-requests/` | Save an authenticated manual quotation request for staff review |
| `POST` | `/api/orders/checkout/` | Revalidate pricing, create the order, and snapshot the quote |

Admin delivery configuration is available under
`/api/orders/superadmin/delivery-pricing/`: region and country lists/details,
special-rule list/create/detail, international settings, quote-request
list/detail, and the existing configuration, zone, surcharge, and audit
resources. These endpoints require an Admin or Superadmin role.

The quote and checkout endpoints require an authenticated customer account.
For Ghana, an active configured regional fee takes priority and is combined
with the region's optional per-kilogram rate and applicable surcharges; it is
never added to the fallback distance formula. Inactive regions use the general
formula only when the region explicitly allows fallback and a matching active
zone exists. Destinations without a regional rate can use the configured zone
fallback. If pricing is unavailable or a product rule requires review, no fee
is invented and checkout is not allowed.

African destinations other than Ghana are always manual quotation requests.
Their country must be enabled, and international delivery must be enabled in
the admin settings. No Ghana regional or fallback rates are applied abroad.
Vehicle types, products matching the configurable heavy-item threshold, and
products matching configured special rules require staff review by default.
Requests snapshot the submitted destination and cart items but do not reserve
inventory or create a payable order.

A successful domestic quote returns its regional or fallback mode and an
explicit breakdown including base, distance/weight components, applicable
surcharges, formula/rate version, and estimated order total.

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

Administrators can manage regional fees and their versions, region enablement
and fallback coverage, African country availability, international quote
instructions, special product rules, and manual quotation requests in the
delivery pricing dashboard. These changes are recorded in the pricing audit
log. Staff can set a quoted fee and update the request status there; customer
notification and conversion of an accepted manual quote into a payable order
are not yet automated.

Paystack returns customers to `FRONTEND_BASE_URL/checkout/complete`, where the
frontend asks the authenticated API to verify the transaction with Paystack.
Set `FRONTEND_BASE_URL` to the frontend origin and include that exact origin in
`CORS_ALLOWED_ORIGINS` for production. The Paystack secret remains server-side.

## Staff dashboard API

The Next.js staff dashboard is available at `/admin-dashboard`; the built-in
Django Admin remains available at `/admin/`. Staff sign in at
`/admin-dashboard/login` with an existing Django staff account. The frontend
uses the existing DRF token authentication. `POST /api/accounts/staff-login/`
issues a token only after validating staff credentials, and
`GET /api/accounts/staff/me/` verifies that the token still belongs to a staff
user. Staff API views use Django's `IsAdminUser` permission; hiding dashboard
controls is not the security boundary, and customer tokens cannot access these
endpoints.

The dashboard uses these endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/catalogue/staff/products/` | Search/list and create products |
| `GET`, `PATCH` | `/api/catalogue/staff/products/{id}/` | Read or update product details and publication status |
| `GET`, `POST` | `/api/catalogue/staff/categories/` | Search/list and create categories |
| `GET`, `PATCH` | `/api/catalogue/staff/categories/{id}/` | Read or update a category |
| `GET`, `POST` | `/api/catalogue/staff/brands/` | Search/list and create brands |
| `GET`, `PATCH` | `/api/catalogue/staff/brands/{id}/` | Read or update a brand |
| `GET` | `/api/inventory/` | List/search inventory |
| `POST` | `/api/inventory/{product_id}/receive/` | Receive stock using the inventory service |
| `GET` | `/api/orders/staff/` | List orders |
| `POST` | `/api/orders/staff/{reference}/complete/` | Complete an order through the existing state-transition service |
| `GET` | `/api/orders/staff/dashboard/` | Order/payment status counts, paid revenue, recent orders, and low-stock alerts |
| `GET` | `/api/orders/staff/payments/` | Read-only payment records |
| `GET` | `/api/orders/staff/delivery-pricing/` | Read pricing configuration, zones, and surcharges |
| `GET` | `/api/staff/customers/` | Search/list customer records |

Product SKUs and slugs are generated automatically when staff create a product.
Slugs are based on the product name and receive a numeric suffix when needed to
remain unique. Existing SKUs remain visible in product listings and inventory.
Product creation accepts an optional `initial_stock_quantity`; positive values
are recorded as audited stock receipts, while omitted or zero values create an
empty inventory record. Further stock changes are made from the Inventory page.
Product enquiry forms submit to the vehicle-enquiries API and appear in the
staff dashboard's Product enquiries list. Enquiries are accepted for any
published product.

Superuser account management is separate from the staff operations permission.
Only active Django superusers can use:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/superadmin/users/` | Search/list accounts and create customers, staff, or superusers |
| `GET`, `PATCH` | `/api/superadmin/users/{id}/` | Read or update an account, role, activation state, or password |

Creating a customer also creates its customer profile and cart. Passwords are
validated by Django's configured validators and stored only as Django password
hashes. The API does not expose password values. Superusers cannot deactivate
or demote themselves, and the final active superuser cannot be deactivated or
demoted. Ordinary staff tokens are explicitly denied these account-management
routes.

Payment records are read-only in the dashboard; staff cannot mark an order paid
there. Payment state remains controlled by verified provider callbacks and the
existing payment services. Product enquiries use their separate enquiry
workflow; delivery quotations submitted from checkout use the delivery quote
request workflow above. Promotions, preorders, and general business settings
do not currently have supporting backend models and APIs, so the dashboard
marks those sections as unavailable rather than displaying fabricated data or
accepting changes that would not be persisted.

## Media and Image File Uploads

Images across the system support direct file uploads (JPEG, PNG, WebP, GIF up to 10 MB):
- **Cloudinary / Local Storage:** If Cloudinary credentials are configured (`CLOUDINARY_URL` or keys in `.env`), images are automatically processed and stored on Cloudinary with automatic optimization. Otherwise, they fall back gracefully to local Django media storage.
- **Product Images:** Products support up to 3 images (with 1 primary image). More than 3 images are rejected at both the model validation and serializer levels.
- **Direct Uploads in Django Admin:** Categories, Brands, Products, Promotions, and Homepage Settings all have native file upload inputs with image thumbnail and preview rendering in Django Admin.
- **Direct Uploads via Staff API:** The staff endpoints accept `multipart/form-data` uploads directly (e.g. `images` files for products, `image_file` for categories/promotions, `logo_file` for brands, and `hero_image_file` for homepage settings), as well as batch file uploads to `/api/catalogue/staff/media/`.

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
