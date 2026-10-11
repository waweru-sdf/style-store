# STYLE E-Fashion House: Kenya store (React + Flask)

MVP of the store described in the STYLE developer brief: Kenya only, all prices in KES, Paystack checkout, no WhatsApp anywhere.

## Run it (two terminals)

**1. API (Flask)**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # Windows: copy .env.example .env
python app.py                     # http://localhost:5000
```

**2. Storefront (React + Vite)**
```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173  (proxies /api to Flask)
```

Open http://localhost:5173. Order desk: http://localhost:5173/admin (token = `ADMIN_TOKEN` in `backend/.env`).

Run the tests: `cd backend && pytest -q`

## Payment modes

| Mode | When | What happens |
|---|---|---|
| **Mock** (default) | `PAYSTACK_SECRET_KEY` empty | Checkout goes to a demo payment page where you simulate success, failure or abandoning. Goes through the same verification code as live mode. |
| **Live/Test** | `PAYSTACK_SECRET_KEY=sk_test_...` | Server initialises a real Paystack transaction (KES) and verifies it. Set the webhook URL in the Paystack dashboard to `https://<your-api-host>/api/paystack/webhook`. |

Paystack's Kenya support, methods and fees depend on your merchant account. Confirm eligibility with Paystack before launch.

## How the payment flow meets the brief

1. The server prices the cart from the database (the browser's prices are ignored) and creates the order as `pending_payment` with a unique reference (`STY-XXXXXXXX`).
2. The server initialises the payment with the secret key (amount in subunits, currency `KES`). The key never reaches the browser.
3. The return page `/order/<ref>` only asks the server to verify. The server checks reference, amount, currency and `success` status with Paystack before the order becomes `paid`. A mismatch goes to `payment_review`, never `paid`.
4. `POST /api/paystack/webhook` checks the `X-Paystack-Signature` (HMAC-SHA512) and is idempotent: duplicate events and a second verification never double-deduct stock.
5. On the first verified payment only: status → `paid`, stock deducted for locally stocked items, confirmation + admin alert written to the `notifications` outbox table.
6. Failed or abandoned payments stay unfulfilled. Every step is logged in `order_events` (the audit trail).

## What's built vs. next steps

Built: home with hero, 4 collections with sort/size/stock filters, product page (colour/size, size guide, stock and dispatch info), cart, guest checkout with delivery zones and a discount code (`STYLE10`), order status page, info/policy pages, an order desk at `/admin` with three tabs: **Orders** (what was ordered, filters and search, status, tracking, supplier-check reminder), **Payments** (collected/refunded/pending/failed totals, approve or reject payments under review, refund reference) and **Add product** (new listing items with sizes, colours, stock and fulfilment type), hybrid inventory (SKU, cost, stock, local vs supplier fulfilment).

Not built yet (out of scope for 3 hours): real emails/SMS (swap the body of `notify()` in `app.py`), editing existing products and stock in admin (adding products is built), product photo upload, customer accounts, real refunds through the Paystack API (admin marks refunded; refund the money in the Paystack dashboard), courier API, product photos (placeholders are shown), analytics.

Placeholders to replace before launch: contact email in `frontend/src/pages/Info.jsx`, the policy wording (have it reviewed), bestseller picks (curated list in `Home.jsx` until there is sales data).

## Put it on GitHub

```bash
cd style-store
git init
git add .
git commit -m "Initial commit: STYLE store MVP"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/style-store.git
git push -u origin main
```

`.gitignore` already keeps `.env`, the database, `venv/` and `node_modules/` out of the repo. Never commit your Paystack secret key.

## Layout

```
backend/   app.py (API, DB, Paystack), test_app.py, requirements.txt, .env.example
frontend/  Vite + React: src/pages, src/components, src/cart.jsx, src/api.js
```
