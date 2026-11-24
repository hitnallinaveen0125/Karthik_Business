# ANANTAORA backend setup

## Required configuration

For the fastest local setup, copy `.env.example` to `.env`. To use Atlas as the primary database and mirror its data to local MongoDB, set `MONGODB_URI` to your Atlas URI (including the `anantaora` database name) and leave `LOCAL_MONGODB_URI` pointed to `mongodb://127.0.0.1:27017/anantaora`. Set your own random `JWT_SECRET` and founder credentials. Do not commit `.env`.

The checked-in Razorpay variables are intentionally blank. For local development, create a Test Mode key in the Razorpay Dashboard and enter it only in `backend/.env`; never place the key secret in the frontend. If a key has been shared, rotate it before use.

PowerShell quick start (local MongoDB service required):

```powershell
cd backend
Copy-Item .env.example .env
# Edit .env and set JWT_SECRET, founder credentials, and fresh Razorpay test credentials.
npm run dev:local
```

If Atlas is unreachable, use `npm run dev:local:offline` to run against local MongoDB instead. This mode does not change `.env` and does not sync local writes back to Atlas; switch back to `npm run dev:local` after Atlas connectivity is restored.

In a second terminal:

```powershell
cd frontend
npm run dev:local
```

The backend is available at `http://127.0.0.1:5000` and the frontend at `http://127.0.0.1:5174`. When configured, Atlas is the source of truth; the backend takes a non-destructive initial snapshot and mirrors subsequent collection/GridFS changes to local MongoDB in the background, so the API does not wait for the full initial mirror copy before starting. Existing local documents not present in Atlas are preserved. If the local database or change stream fails, Atlas-backed application requests continue, the mirror is marked degraded in the admin dashboard and health endpoint, and the backend does not retry automatically. Restart the backend after fixing local connectivity to take a fresh snapshot and resume mirroring. This is asynchronous mirroring, not a cross-database transaction; briefly stale data in the local mirror is possible. Primary MongoDB connection failures are reported after a 5-second server-selection timeout.

- `MONGODB_URI`: primary MongoDB connection string (Atlas for the dual-database setup). The URI may omit the database path when `MONGODB_DATABASE=anantaora` is set. The application stores products, orders, payments, download grants, webhook IDs, and sales here. PDFs are kept in the private `pdfs.files` / `pdfs.chunks` GridFS collections.
- `MONGODB_DATABASE`: database name to use for the primary and local mirror; defaults to the name in `MONGODB_URI`.
- `LOCAL_MONGODB_URI`: optional local mirror connection string; defaults to unset. Atlas change streams require Atlas as the primary. Percent-encode special characters in the database password and keep the URI only in `backend/.env`.
- `RAZORPAY_MODE`, `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: local development defaults to `test` and requires a `rzp_test_` Key ID. In production, the backend defaults to `live` and requires a `rzp_live_` Key ID. Set `RAZORPAY_MODE=live` and configure the Live Key ID and Key Secret as Render **backend** environment variables; never place the Key Secret in frontend configuration.
- `RAZORPAY_WEBHOOK_SECRET`: the secret configured for the Razorpay webhook endpoint.
- `JWT_SECRET`, `FOUNDER_EMAIL`, and `FOUNDER_PASSWORD`: a private founder login and a long random JWT signing secret.

The backend intentionally does not fall back to in-memory orders, demo payment signatures, or default founder credentials. It will not start if `MONGODB_URI` is missing. Real Test Mode checkout requires your own Razorpay test key ID and secret; checkout is not mocked.

Customers can create an account or sign in from the storefront. Passwords are stored as bcrypt hashes. Checkout requires a signed-in customer, and paid orders are linked to that account so the customer can return to **My purchases** and request a new secure download link at any time. Each link expires after 24 hours and allows up to three downloads; customers can request another link from their account.

On backend startup, the bundled `30_day_creator_playbook.pdf` is imported into private GridFS storage for the default playbook if it has no valid stored PDF. Keep this file alongside the workspace root when deploying. Other products, or deployments without the bundled PDF, require an upload from the founder dashboard before checkout is enabled.

The seeded books are priced at **₹99** (`9900` paise). On startup, the canonical catalog price and public cover-image URL are synchronized to existing MongoDB product records so checkout amounts and storefront displays stay aligned.

The database mirror is one-way (Atlas to local). Mirror outages are surfaced, but are not retried automatically per the selected failure policy. The local mirror should not be used as a second writable application database.

## Founder sales and database dashboard

Sign in at `/admin/login` with the founder credentials from `.env`, then open `/admin`. The dashboard reads verified sales, distinct purchasing customers, recent orders, and MongoDB collection statistics through founder-authenticated API routes. Select **This week**, **This month**, or **This year** to filter revenue and purchasing-customer metrics. Database reporting shows collection names, estimated document counts, and aggregate storage sizes only; it does not expose database credentials or raw collection contents.

Install dependencies if needed and start the API:

```powershell
cd backend
npm install
npm run dev
```

In another terminal, start the frontend with `cd frontend; npm run dev`. Set `VITE_API_BASE_URL` only when the API is not at `http://localhost:5000/api`.

The health endpoint reports the selected payment mode and whether valid credentials are configured (never credentials): `GET http://127.0.0.1:5000/api/health`. Local development defaults to Test mode; production defaults to Live mode. Configure the Live variables only on the Render backend service. If webhooks are enabled, configure a Live webhook and set its matching secret in `RAZORPAY_WEBHOOK_SECRET`.

## Upload the private product PDF

1. Start the backend with MongoDB configured.
2. Start the frontend and sign in at `/admin/login` with the founder credentials from `.env`.
3. Use the Product PDF storage form to upload the correct product PDF. The supplied `30_day_creator_playbook.pdf` is the current book file.
4. The authenticated endpoint is `PUT /api/admin/products/:productId/pdf`, multipart field `pdf`; a founder JWT is required. Uploads are limited to 50 MB and checked for a PDF signature. The product stores the resulting GridFS ObjectId; the file itself is never served publicly.

Checkout stays disabled for products without a matching GridFS file. The default playbook is seeded from the bundled PDF at backend startup; use the upload form to replace that PDF or upload files for other products.

## Razorpay webhook

Configure the Razorpay webhook URL as `https://<your-api-host>/api/payments/webhook`, use the same secret as `RAZORPAY_WEBHOOK_SECRET`, and subscribe to payment capture/failure and refund-processed events. The endpoint validates the signature against the raw request body and fetches captured payments from Razorpay before updating an order. Webhook event IDs are persisted to avoid duplicate sales.

## Purchase and delivery APIs

- `GET /api/products` and `GET /api/products/:slug`: published product metadata only.
- `POST /api/auth/signup` and `POST /api/auth/login`: create a customer account or start a customer session.
- `GET /api/auth/purchases` and `POST /api/auth/purchases/:orderId/download`: list the signed-in customer’s paid purchases and issue a fresh download link for an owned purchase.
- `POST /api/payments/create-order`: requires customer sign-in and creates a pending MongoDB order linked to that account, plus a Razorpay order using the stored product price.
- `POST /api/payments/verify`: requires the same customer account, verifies the Razorpay signature, fetches the payment from Razorpay, checks capture/order/amount/currency, then marks the matching MongoDB order paid.
- `GET /api/download/:token`: validates a hashed, expiring, capped download grant, checks the paid order and GridFS file, then streams PDF bytes.

The browser receives a download token only after server-side verification. Keep it private; it is a bearer authorization token with a 24-hour expiry and a three-download limit.
