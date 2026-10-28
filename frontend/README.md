# WhiteStag storefront

The storefront is the existing Next.js App Router application. It consumes the
Django REST API and uses server responses as the source of truth for products,
prices, stock availability, orders, and payment outcomes.

## Local setup

Requirements: Node.js/npm and a running WhiteStag backend.

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to the backend API root,
including `/api` (for example, `http://127.0.0.1:8000/api`). For vehicle and
quote enquiries, configure `NEXT_PUBLIC_CONTACT_EMAIL` to a public WhiteStag
sales contact. Leave it empty until the business contact is confirmed.

## Implemented routes

- `/` — live categories, brands and featured directly purchasable spare parts
- `/products`, `/products/[slug]`, `/categories/[slug]` — published catalogue,
  backend category/brand/type/sales-method filters, page navigation, images,
  specifications and eligible cart actions
- `/cart` — account cart, server-reported availability and server-priced item
  data; the displayed subtotal is an estimate until order creation
- `/checkout` — authenticated delivery form, idempotent order creation, order
  total from the backend and Paystack authorization redirect
- `/checkout/verify` — backend-only payment verification and pending, failed,
  successful or review-required states
- `/account`, `/account/orders`, `/account/orders/[reference]` — token
  authentication, account order history, server-authoritative order details,
  payment and verification actions
- `/vehicles` — published car/electric-vehicle/tricycle enquiry listings where
  available; this is not a cart or direct-purchase flow
- `/promotions` — no active offers are shown because the API does not expose
  promotions

## Authentication and API

Registration, login, logout and current-customer hydration use the existing
DRF token endpoints. The API client sends `Authorization: Token <token>` and
stores the returned token in browser `localStorage`. This is not an
HttpOnly-cookie/BFF session; deployment should use HTTPS and an appropriate
content-security policy. Do not put backend secrets, database credentials or
Paystack secret keys in frontend environment variables.

The API client covers accounts, catalogue, cart, checkout, orders, payment
initialization and payment verification through the existing Django routes.
The backend validates cart eligibility and stock at checkout; the client never
reserves inventory or submits an authoritative amount.

## Checkout and payment

Checkout sends delivery fields and an `Idempotency-Key` to the existing order
checkout endpoint. The backend returns the order and authoritative total. The
frontend then initializes payment and redirects only to the backend-provided
Paystack authorization URL after checking its fixed HTTPS Paystack host. The
browser never calls Paystack's API or decides whether an order is paid.

The payment reference is retained locally to let the customer invoke the
authenticated backend verification endpoint after returning. A pending or
inconclusive verification is never presented as success. If payment
initialization times out, the frontend preserves the returned persisted
reference when available and offers verification rather than creating a new
charge blindly.

## Current API contract limits

- Catalogue endpoints support category, brand, product type, sales method and
  pagination, but no server-side text search. The storefront search filters
  only the currently loaded catalogue page.
- Payment initialization does not accept or return a frontend callback URL.
  Configure the Paystack account callback to the storefront's
  `/checkout/verify` route if automatic provider return is required. Otherwise,
  customers can return to their order and use its verification action.
- Order responses do not include the active payment reference or payment-event
  history. Verification from an order is available on the browser where the
  payment reference was retained; a customer on another device cannot discover
  an unresolved attempt through the current API.
- The cart response does not include product images or aggregate totals.
  Cart images are fetched through existing product-detail endpoints, and the
  client subtotal is only an estimate.
- Promotions and contact/enquiry submission endpoints do not exist. Offers are
  not fabricated; quote links require the public sales email configuration.
- PostgreSQL concurrency behavior and live Paystack behavior are not tested by
  frontend validation. No real provider requests are made by this application
  during build or lint.

## Validation

```powershell
npm run lint
npx tsc --noEmit
npm run build
```
