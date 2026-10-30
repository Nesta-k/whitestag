# WhiteStag frontend

The storefront frontend uses Next.js, React, TypeScript, and Tailwind CSS.

## Requirements

- Node.js 20.9 or newer
- npm

## Local development

From the repository root, install the locked dependencies and start the app:

```powershell
npm --prefix frontend ci
npm --prefix frontend run dev
```

The site runs at `http://localhost:3000`. To connect it to a local backend,
copy the public API URL example:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
```

Set `NEXT_PUBLIC_API_URL` to the backend origin without an API path (for
example, `http://127.0.0.1:8000`). Variables prefixed with
`NEXT_PUBLIC_` are included in browser bundles. Never put credentials,
database passwords, Django secret keys, or payment-provider secrets there.

The public catalogue is available at `/products`; product details use
`/products/{slug}`. Sign-in, registration, and the saved cart are available at
`/account` and `/cart`. Catalogue data is loaded from the Django API at runtime.
For local development, allow `http://localhost:3000` in the backend's
`CORS_ALLOWED_ORIGINS` setting.

Order checkout and payment are not yet exposed in the frontend.

## Validation and production

```powershell
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix frontend run start
```
