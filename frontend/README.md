# ANANTAORA frontend

## Run locally

In PowerShell, start the API in one terminal:

```powershell
cd backend
Copy-Item .env.example .env
# Edit backend/.env with fresh Razorpay Test Mode keys and founder credentials.
npm install
npm run dev:local
```

In a second terminal, start the frontend:

```powershell
cd frontend
npm install
npm run dev:local
```

Open `http://127.0.0.1:5174`. The API health check is `http://127.0.0.1:5000/api/health`.
For Atlas as the primary database and a local mirror, set `MONGODB_URI` and `LOCAL_MONGODB_URI` in `backend/.env`. Use Atlas as the primary and `mongodb://127.0.0.1:27017/anantaora` as the local URI; never put the Atlas password in frontend configuration or source control. The admin database overview shows whether the local mirror is healthy.

Customers can create an account or log in from the storefront. Sign in before checkout; verified purchases appear under **My purchases**, where the buyer can download them again later. Local checkout uses Razorpay Test Mode keys configured only in `backend/.env`; the deployed production backend uses Live Mode credentials configured in the Render backend service. The frontend receives only the public Key ID from the backend and must never contain the Key Secret. The default playbook PDF is imported into private GridFS storage when the backend starts; upload PDFs for other products through `/admin/login`.

The supplied book PDF is `30_day_creator_playbook.pdf` in the workspace root. Razorpay credentials are intentionally blank in the example configuration; configure Test Mode credentials locally or Live Mode credentials on the Render backend before enabling checkout.

The seeded books are priced at **₹99**. The founder dashboard at `/admin` includes weekly, monthly, and yearly sales filters, purchasing-customer counts, recent verified orders, and a safe MongoDB collection/storage overview.

## Checks

```powershell
npm run build
npm run lint
```
