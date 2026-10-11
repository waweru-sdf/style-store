"""STYLE E-Fashion House: Flask API (Kenya, KES, Paystack).

Key rules from the brief, as implemented here:
- Prices and totals are always computed on the server from the database.
- An order is created as `pending_payment` BEFORE payment is initialised.
- The return page is never proof of payment: an order becomes `paid` only after
  server-side verification (reference + amount + currency + status), either via
  the verify endpoint or a signed webhook.
- Webhooks are signature-verified (HMAC SHA512) and idempotent.
- With no PAYSTACK_SECRET_KEY the app runs in MOCK mode so the whole flow can be
  demoed without a merchant account. Mock endpoints do not exist in live mode.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request
from flask_cors import CORS

load_dotenv()

CURRENCY = "KES"
PAYSTACK_BASE = "https://api.paystack.co"

DELIVERY_ZONES = [
    ("nairobi", "Nairobi (within city)", 250, "1-2 working days"),
    ("nairobi-metro", "Nairobi metro (Kiambu, Kajiado, Machakos)", 400, "2-3 working days"),
    ("major-towns", "Major towns (Mombasa, Kisumu, Nakuru, Eldoret)", 550, "3-4 working days"),
    ("rest-of-kenya", "Rest of Kenya", 700, "4-6 working days"),
]

DISCOUNT_CODES = {"STYLE10": 10}  # code -> percent off the subtotal

COLLECTIONS = {
    "women": "STYLE WOMAN",
    "mama": "STYLE MAMA",
    "kids": "STYLE KIDS",
    "sets": "Matching Sets & Gifts",
}

# slug, name, collection, price KES, description, sizes, colours, fulfilment, local stock per variant
PRODUCTS = [
    ("champagne-wrap-dress", "Champagne Wrap Dress", "women", 3800,
     "A fluid wrap dress in soft champagne crepe. Easy to dress up for dinner or down with flats.",
     ["S", "M", "L", "XL"], ["Champagne", "Black"], "local", 6),
    ("tailored-wide-leg-trousers", "Tailored Wide-Leg Trousers", "women", 3200,
     "High-waisted, wide-leg trousers with a clean drape. A workwear staple in neutral tones.",
     ["S", "M", "L", "XL"], ["Cream", "Camel"], "local", 5),
    ("ribbed-knit-top", "Ribbed Knit Top", "women", 1500,
     "A soft stretch rib top that layers under blazers and pairs with everything in your wardrobe.",
     ["S", "M", "L"], ["Black", "Cream"], "local", 10),
    ("linen-blazer", "Relaxed Linen Blazer", "women", 4500,
     "Breathable linen-blend blazer with a relaxed fit. Lined sleeves and two front pockets.",
     ["S", "M", "L", "XL"], ["Sand", "Ivory"], "supplier", 0),
    ("satin-midi-skirt", "Satin Midi Skirt", "women", 2800,
     "Bias-cut satin midi skirt with an elastic back waist for comfort all day.",
     ["S", "M", "L"], ["Champagne", "Black"], "supplier", 0),
    ("nursing-button-dress", "Nursing-Friendly Button Dress", "mama", 3600,
     "A practical shirt dress with concealed nursing access and a soft, breathable cotton blend.",
     ["S", "M", "L", "XL"], ["Cream", "Sage"], "local", 5),
    ("soft-lounge-set", "Soft Lounge Set", "mama", 3400,
     "Matching top and jogger set in brushed cotton. Comfortable for early mornings and late feeds.",
     ["S", "M", "L", "XL"], ["Oat", "Charcoal"], "local", 6),
    ("wrap-cardigan", "Everyday Wrap Cardigan", "mama", 2600,
     "A lightweight wrap cardigan with a stretch waist that moves with you.",
     ["M", "L", "XL"], ["Camel", "Black"], "supplier", 0),
    ("everyday-midi-dress", "Everyday Midi Dress", "mama", 3100,
     "Stretch jersey midi with side pockets. Easy to wear, easy to wash.",
     ["S", "M", "L", "XL"], ["Cream", "Black"], "local", 4),
    ("cotton-baby-romper", "Cotton Baby Romper", "kids", 1200,
     "Gentle organic-feel cotton romper with envelope shoulders and snap closures.",
     ["0-3M", "3-6M", "6-12M"], ["Cream", "Soft Grey"], "local", 8),
    ("little-linen-set", "Little Linen Set", "kids", 1800,
     "Two-piece linen-blend set for little ones. Airy, soft and made for play.",
     ["1-2Y", "2-3Y", "3-4Y"], ["Sand", "White"], "local", 6),
    ("occasion-party-dress", "Girls Occasion Dress", "kids", 2400,
     "A twirl-ready occasion dress with a soft tulle layer and a satin bow.",
     ["2-3Y", "4-5Y", "6-7Y"], ["Champagne", "Blush"], "supplier", 0),
    ("boys-smart-set", "Boys Smart Shirt & Trouser Set", "kids", 2600,
     "A smart shirt and tailored trouser set for church, weddings and family photos.",
     ["2-3Y", "4-5Y", "6-7Y"], ["Stone", "Navy"], "supplier", 0),
    ("mother-daughter-matching-set", "Mother & Daughter Matching Dress Set", "sets", 6200,
     "Matching everyday dresses in the same print, one for you and one for your little girl.",
     ["Mum M + Girl 2-3Y", "Mum L + Girl 4-5Y"], ["Cream", "Sage"], "supplier", 0),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  collection TEXT NOT NULL, price INTEGER NOT NULL, description TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
  sku TEXT UNIQUE NOT NULL, size TEXT NOT NULL, colour TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
  fulfilment TEXT NOT NULL CHECK (fulfilment IN ('local','supplier')),
  dispatch_estimate TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, reference TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL, currency TEXT NOT NULL,
  customer_name TEXT, email TEXT, phone TEXT, address TEXT, town TEXT, county TEXT,
  zone TEXT, subtotal INTEGER, delivery_fee INTEGER, discount INTEGER, total INTEGER,
  discount_code TEXT, payment_mode TEXT, authorization_url TEXT, mock_outcome TEXT,
  tracking_number TEXT, refund_reference TEXT, restocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT, paid_at TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  variant_id INTEGER, product_name TEXT, size TEXT, colour TEXT, sku TEXT,
  fulfilment TEXT, unit_price INTEGER, quantity INTEGER
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_key TEXT PRIMARY KEY, event TEXT, reference TEXT, received_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, order_id INTEGER, channel TEXT, recipient TEXT,
  subject TEXT, body TEXT, created_at TEXT
);
"""

PHONE_RE = re.compile(r"^(?:\+?254|0)[17]\d{8}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(
        DATABASE=os.environ.get("DATABASE", os.path.join(os.path.dirname(__file__), "style.db")),
        PAYSTACK_SECRET_KEY=os.environ.get("PAYSTACK_SECRET_KEY", "").strip(),
        FRONTEND_URL=os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/"),
        ADMIN_TOKEN=os.environ.get("ADMIN_TOKEN", "").strip(),
    )
    if config:
        app.config.update(config)
    CORS(app, origins=[app.config["FRONTEND_URL"]])

    # ---------------------------------------------------------------- database
    def get_db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"])
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    @app.teardown_appcontext
    def close_db(_exc):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    def init_db():
        db = sqlite3.connect(app.config["DATABASE"])
        db.executescript(SCHEMA)
        # Small migration: databases created before refund_reference existed get the column added.
        order_cols = {r[1] for r in db.execute("PRAGMA table_info(orders)")}
        if "refund_reference" not in order_cols:
            db.execute("ALTER TABLE orders ADD COLUMN refund_reference TEXT")
        if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            seed(db)
        db.commit()
        db.close()

    def seed(db):
        for n, (slug, name, coll, price, desc, sizes, colours, fulfil, stock) in enumerate(PRODUCTS, 1):
            cur = db.execute(
                "INSERT INTO products (slug, name, collection, price, description, created_at) "
                "VALUES (?,?,?,?,?,?)", (slug, name, coll, price, desc, now()))
            pid = cur.lastrowid
            for size in sizes:
                for colour in colours:
                    sku = f"STY-{coll[:3].upper()}-{n:02d}-{re.sub('[^A-Z0-9]', '', size.upper())}-{colour[:3].upper()}"
                    db.execute(
                        "INSERT INTO variants (product_id, sku, size, colour, cost, stock, fulfilment, dispatch_estimate) "
                        "VALUES (?,?,?,?,?,?,?,?)",
                        (pid, sku, size, colour, int(price * 0.55), stock, fulfil,
                         "Dispatched in 1-2 working days" if fulfil == "local"
                         else "Supplier confirms availability. Dispatch in 5-8 working days"))

    # ------------------------------------------------------------- helpers
    def is_live():
        return bool(app.config["PAYSTACK_SECRET_KEY"])

    def paystack_api(method, path, **kwargs):
        """Single choke point for Paystack calls (easy to stub in tests)."""
        headers = {"Authorization": f"Bearer {app.config['PAYSTACK_SECRET_KEY']}"}
        resp = requests.request(method, PAYSTACK_BASE + path, headers=headers, timeout=20, **kwargs)
        resp.raise_for_status()
        return resp.json()

    app.paystack_api = paystack_api  # tests replace this

    def log_event(db, order_id, kind, detail=""):
        db.execute("INSERT INTO order_events (order_id, at, kind, detail) VALUES (?,?,?,?)",
                   (order_id, now(), kind, detail))

    def notify(db, order, subject, body):
        """Outbox: swap this body for a real email/SMS provider later."""
        db.execute("INSERT INTO notifications (order_id, channel, recipient, subject, body, created_at) "
                   "VALUES (?,?,?,?,?,?)", (order["id"], "email", order["email"], subject, body, now()))
        db.execute("INSERT INTO notifications (order_id, channel, recipient, subject, body, created_at) "
                   "VALUES (?,?,?,?,?,?)", (order["id"], "admin", "admin", f"[Admin] {subject}", body, now()))

    def variant_dict(row):
        return {
            "id": row["id"], "sku": row["sku"], "size": row["size"], "colour": row["colour"],
            "fulfilment": row["fulfilment"], "dispatch_estimate": row["dispatch_estimate"],
            "in_stock": row["fulfilment"] == "supplier" or row["stock"] > 0,
            "stock": row["stock"] if row["fulfilment"] == "local" else None,
        }

    def product_dict(db, row, with_variants=False):
        variants = db.execute("SELECT * FROM variants WHERE product_id=? ORDER BY id", (row["id"],)).fetchall()
        data = {
            "id": row["id"], "slug": row["slug"], "name": row["name"], "collection": row["collection"],
            "collection_label": COLLECTIONS[row["collection"]], "price": row["price"], "currency": CURRENCY,
            "description": row["description"], "created_at": row["created_at"],
            "sizes": sorted({v["size"] for v in variants}, key=[v["size"] for v in variants].index),
            "colours": sorted({v["colour"] for v in variants}, key=[v["colour"] for v in variants].index),
            "in_stock": any(v["fulfilment"] == "supplier" or v["stock"] > 0 for v in variants),
            "fulfilment": variants[0]["fulfilment"] if variants else "local",
        }
        if with_variants:
            data["variants"] = [variant_dict(v) for v in variants]
        return data

    def get_zone(zone_id):
        for z in DELIVERY_ZONES:
            if z[0] == zone_id:
                return z
        raise ApiError("Please choose a valid delivery area.")

    def price_cart(db, items, zone_id, code=None):
        """Authoritative pricing: never trust prices coming from the browser."""
        if not isinstance(items, list) or not items:
            raise ApiError("Your cart is empty.")
        merged = {}
        for it in items:
            try:
                vid, qty = int(it["variant_id"]), int(it["quantity"])
            except (KeyError, TypeError, ValueError):
                raise ApiError("Invalid cart item.")
            if qty < 1 or qty > 20:
                raise ApiError("Quantity must be between 1 and 20.")
            merged[vid] = merged.get(vid, 0) + qty
        lines, subtotal = [], 0
        for vid, qty in merged.items():
            row = db.execute(
                "SELECT v.*, p.name AS pname, p.price AS pprice, p.slug AS pslug "
                "FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?", (vid,)).fetchone()
            if not row:
                raise ApiError("An item in your cart is no longer available.")
            if row["fulfilment"] == "local" and row["stock"] < qty:
                raise ApiError(f"Only {row['stock']} left of {row['pname']} ({row['size']}, {row['colour']}).")
            lines.append({"variant_id": vid, "product_name": row["pname"], "slug": row["pslug"],
                          "size": row["size"], "colour": row["colour"], "sku": row["sku"],
                          "fulfilment": row["fulfilment"], "dispatch_estimate": row["dispatch_estimate"],
                          "unit_price": row["pprice"], "quantity": qty,
                          "line_total": row["pprice"] * qty})
            subtotal += row["pprice"] * qty
        zone = get_zone(zone_id)
        pct, applied = 0, None
        if code:
            applied = code.strip().upper()
            if applied not in DISCOUNT_CODES:
                raise ApiError("That discount code isn't valid.")
            pct = DISCOUNT_CODES[applied]
        discount = subtotal * pct // 100
        return {"lines": lines, "subtotal": subtotal, "delivery_fee": zone[2], "discount": discount,
                "discount_code": applied, "total": subtotal + zone[2] - discount,
                "currency": CURRENCY, "zone": zone[0], "zone_label": zone[1], "eta": zone[3]}

    def order_dict(db, order, public=True):
        items = db.execute("SELECT * FROM order_items WHERE order_id=?", (order["id"],)).fetchall()
        data = {
            "reference": order["reference"], "status": order["status"], "currency": order["currency"],
            "subtotal": order["subtotal"], "delivery_fee": order["delivery_fee"],
            "discount": order["discount"], "total": order["total"],
            "customer_name": order["customer_name"], "email": order["email"],
            "town": order["town"], "county": order["county"], "address": order["address"],
            "tracking_number": order["tracking_number"], "created_at": order["created_at"],
            "paid_at": order["paid_at"], "payment_mode": order["payment_mode"],
            "items": [{"product_name": i["product_name"], "size": i["size"], "colour": i["colour"],
                       "sku": i["sku"], "fulfilment": i["fulfilment"],
                       "unit_price": i["unit_price"], "quantity": i["quantity"]} for i in items],
        }
        if not public:
            data["phone"] = order["phone"]
            data["refund_reference"] = order["refund_reference"]
            data["events"] = [dict(e) for e in db.execute(
                "SELECT at, kind, detail FROM order_events WHERE order_id=? ORDER BY id", (order["id"],))]
        return data

    # ----------------------------------------------- payment state machine
    def deduct_stock(db, order):
        for it in db.execute("SELECT * FROM order_items WHERE order_id=?", (order["id"],)):
            if it["fulfilment"] == "local":
                db.execute("UPDATE variants SET stock = MAX(stock - ?, 0) WHERE id=?",
                           (it["quantity"], it["variant_id"]))

    def restock(db, order):
        if order["restocked"]:
            return
        for it in db.execute("SELECT * FROM order_items WHERE order_id=?", (order["id"],)):
            if it["fulfilment"] == "local":
                db.execute("UPDATE variants SET stock = stock + ? WHERE id=?", (it["quantity"], it["variant_id"]))
        db.execute("UPDATE orders SET restocked=1 WHERE id=?", (order["id"],))

    def mark_paid(db, order, source, from_review=False):
        """Idempotent: only the first successful call flips the order and deducts stock.

        Orders under review (payment_review) are only released by a person: from_review=True is
        passed by the admin approve action, never by verify or the webhook.
        """
        states = ("pending_payment", "payment_failed") + (("payment_review",) if from_review else ())
        marks = ",".join("?" * len(states))
        cur = db.execute(
            f"UPDATE orders SET status='paid', paid_at=? WHERE id=? AND status IN ({marks})",
            (now(), order["id"], *states))
        if cur.rowcount == 0:
            log_event(db, order["id"], "payment_duplicate_ignored", f"source={source}")
            return False
        deduct_stock(db, order)
        log_event(db, order["id"], "payment_verified",
                  f"source={source} amount={order['total']} {order['currency']}")
        notify(db, order, f"Order {order['reference']} confirmed",
               f"Hi {order['customer_name']}, we've received your payment of KES {order['total']:,}. "
               f"Your order reference is {order['reference']}.")
        return True

    def apply_transaction(db, order, tx, source):
        """tx: dict with status, reference, amount (subunits), currency from Paystack (or mock)."""
        status = tx.get("status")
        if status == "success":
            expected = order["total"] * 100
            problems = []
            if tx.get("reference") != order["reference"]:
                problems.append("reference mismatch")
            if tx.get("amount") != expected:
                problems.append(f"amount mismatch (got {tx.get('amount')}, expected {expected})")
            if tx.get("currency") != order["currency"]:
                problems.append(f"currency mismatch (got {tx.get('currency')})")
            if problems:
                if order["status"] == "pending_payment":
                    db.execute("UPDATE orders SET status='payment_review' WHERE id=?", (order["id"],))
                log_event(db, order["id"], "payment_rejected", "; ".join(problems))
                return "payment_review"
            mark_paid(db, order, source)
            return "paid"
        if status in ("failed", "reversed"):
            if order["status"] == "pending_payment":
                db.execute("UPDATE orders SET status='payment_failed' WHERE id=?", (order["id"],))
                log_event(db, order["id"], "payment_failed", f"source={source} status={status}")
            return "payment_failed"
        log_event(db, order["id"], "payment_pending", f"source={source} status={status}")
        return "pending_payment"

    def fetch_transaction(order):
        if order["payment_mode"] == "mock":
            outcome = order["mock_outcome"]
            if outcome == "success":
                return {"status": "success", "reference": order["reference"],
                        "amount": order["total"] * 100, "currency": CURRENCY}
            if outcome == "failed":
                return {"status": "failed", "reference": order["reference"],
                        "amount": order["total"] * 100, "currency": CURRENCY}
            return {"status": "abandoned", "reference": order["reference"]}
        body = app.paystack_api("GET", f"/transaction/verify/{order['reference']}")
        data = body.get("data") or {}
        if not body.get("status"):
            raise ApiError("Could not verify the payment right now.", 502)
        return {"status": data.get("status"), "reference": data.get("reference"),
                "amount": data.get("amount"), "currency": data.get("currency")}

    # --------------------------------------------------------------- errors
    @app.errorhandler(ApiError)
    def handle_api_error(e):
        return jsonify({"error": e.message}), e.status

    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"error": "Not found"}), 404

    # ---------------------------------------------------------------- routes
    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "payment_mode": "live" if is_live() else "mock", "currency": CURRENCY})

    @app.get("/api/collections")
    def collections():
        return jsonify([{"slug": k, "label": v} for k, v in COLLECTIONS.items()])

    @app.get("/api/products")
    def list_products():
        db = get_db()
        sql, args = "SELECT * FROM products WHERE 1=1", []
        coll = request.args.get("collection")
        if coll:
            sql += " AND collection=?"
            args.append(coll)
        q = request.args.get("q", "").strip()
        if q:
            sql += " AND (name LIKE ? OR description LIKE ?)"
            args += [f"%{q}%", f"%{q}%"]
        order = {"price_asc": "price ASC", "price_desc": "price DESC", "new": "created_at DESC, id DESC"}
        sql += " ORDER BY " + order.get(request.args.get("sort", ""), "id ASC")
        rows = db.execute(sql, args).fetchall()
        items = [product_dict(db, r) for r in rows]
        if request.args.get("available") == "1":
            items = [p for p in items if p["in_stock"]]
        if request.args.get("size"):
            items = [p for p in items if request.args["size"] in p["sizes"]]
        return jsonify(items)

    @app.get("/api/products/<slug>")
    def get_product(slug):
        db = get_db()
        row = db.execute("SELECT * FROM products WHERE slug=?", (slug,)).fetchone()
        if not row:
            raise ApiError("Product not found.", 404)
        return jsonify(product_dict(db, row, with_variants=True))

    @app.get("/api/delivery-zones")
    def delivery_zones():
        return jsonify([{"id": z[0], "label": z[1], "fee": z[2], "eta": z[3]} for z in DELIVERY_ZONES])

    @app.post("/api/quote")
    def quote():
        body = request.get_json(silent=True) or {}
        q = price_cart(get_db(), body.get("items"), body.get("zone") or DELIVERY_ZONES[0][0], body.get("discount_code"))
        return jsonify(q)

    def validate_customer(c):
        c = c or {}
        out = {k: str(c.get(k, "")).strip() for k in ("name", "email", "phone", "address", "town", "county")}
        for k, label in (("name", "full name"), ("address", "delivery address"), ("town", "town"), ("county", "county")):
            if len(out[k]) < 2:
                raise ApiError(f"Please enter your {label}.")
        if not EMAIL_RE.match(out["email"]):
            raise ApiError("Please enter a valid email address.")
        phone = re.sub(r"[\s-]", "", out["phone"])
        if not PHONE_RE.match(phone):
            raise ApiError("Please enter a valid Kenyan phone number (e.g. 0712 345 678).")
        out["phone"] = phone
        return out

    @app.post("/api/orders")
    def create_order():
        """1) price on server  2) create PENDING order  3) initialise payment."""
        db = get_db()
        body = request.get_json(silent=True) or {}
        cust = validate_customer(body.get("customer"))
        q = price_cart(db, body.get("items"), body.get("zone"), body.get("discount_code"))
        reference = "STY-" + secrets.token_hex(4).upper()
        mode = "live" if is_live() else "mock"
        cur = db.execute(
            "INSERT INTO orders (reference, status, currency, customer_name, email, phone, address, town, county, "
            "zone, subtotal, delivery_fee, discount, total, discount_code, payment_mode, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (reference, "pending_payment", CURRENCY, cust["name"], cust["email"], cust["phone"], cust["address"],
             cust["town"], cust["county"], q["zone"], q["subtotal"], q["delivery_fee"], q["discount"], q["total"],
             q["discount_code"], mode, now()))
        oid = cur.lastrowid
        for ln in q["lines"]:
            db.execute(
                "INSERT INTO order_items (order_id, variant_id, product_name, size, colour, sku, fulfilment, "
                "unit_price, quantity) VALUES (?,?,?,?,?,?,?,?,?)",
                (oid, ln["variant_id"], ln["product_name"], ln["size"], ln["colour"], ln["sku"],
                 ln["fulfilment"], ln["unit_price"], ln["quantity"]))
        log_event(db, oid, "order_created", f"total={q['total']} {CURRENCY} mode={mode}")
        db.commit()

        callback = f"{app.config['FRONTEND_URL']}/order/{reference}"
        if mode == "live":
            try:
                res = app.paystack_api("POST", "/transaction/initialize", json={
                    "email": cust["email"], "amount": q["total"] * 100, "currency": CURRENCY,
                    "reference": reference, "callback_url": callback,
                    "metadata": {"order_reference": reference}})
                auth_url = res["data"]["authorization_url"]
            except Exception as exc:  # network error, bad key, unsupported currency, etc.
                log_event(db, oid, "payment_init_failed", str(exc)[:300])
                db.commit()
                raise ApiError("We couldn't start the payment. Please try again.", 502)
        else:
            auth_url = f"{app.config['FRONTEND_URL']}/mock-pay/{reference}"
        db.execute("UPDATE orders SET authorization_url=? WHERE id=?", (auth_url, oid))
        log_event(db, oid, "payment_initialised", f"mode={mode}")
        db.commit()
        return jsonify({"reference": reference, "authorization_url": auth_url, "total": q["total"],
                        "currency": CURRENCY, "payment_mode": mode}), 201

    def load_order(db, reference):
        row = db.execute("SELECT * FROM orders WHERE reference=?", (reference,)).fetchone()
        if not row:
            raise ApiError("Order not found.", 404)
        return row

    @app.get("/api/orders/<reference>")
    def get_order(reference):
        db = get_db()
        return jsonify(order_dict(db, load_order(db, reference)))

    @app.post("/api/orders/<reference>/verify")
    def verify_order(reference):
        """Called by the return page. Asks Paystack; the browser's word is never trusted."""
        db = get_db()
        order = load_order(db, reference)
        if order["status"] in ("pending_payment", "payment_failed", "payment_review"):
            try:
                result = apply_transaction(db, order, fetch_transaction(order), "verify")
                db.commit()
            except ApiError:
                db.rollback()
                raise
            except requests.RequestException:
                db.rollback()
                raise ApiError("Could not reach the payment provider. Please refresh in a moment.", 502)
        order = load_order(db, reference)
        return jsonify(order_dict(db, order))

    @app.post("/api/paystack/webhook")
    def paystack_webhook():
        raw = request.get_data()
        secret = app.config["PAYSTACK_SECRET_KEY"]
        sent = request.headers.get("X-Paystack-Signature", "")
        if not secret:
            return jsonify({"error": "Webhook disabled in mock mode"}), 404
        expected = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
        if not hmac.compare_digest(expected, sent):
            return jsonify({"error": "Invalid signature"}), 401
        try:
            payload = json.loads(raw)
            event, data = payload["event"], payload["data"]
        except (ValueError, KeyError, TypeError):
            return jsonify({"error": "Bad payload"}), 400
        reference = data.get("reference")
        event_key = f"{event}:{data.get('id') or reference}"
        db = get_db()
        try:
            cur = db.execute("INSERT OR IGNORE INTO webhook_events (event_key, event, reference, received_at) "
                             "VALUES (?,?,?,?)", (event_key, event, reference, now()))
            if cur.rowcount == 0:
                db.rollback()
                return jsonify({"status": "duplicate"}), 200
            order = db.execute("SELECT * FROM orders WHERE reference=?", (reference,)).fetchone()
            if order and event == "charge.success":
                apply_transaction(db, order, {"status": "success", "reference": reference,
                                              "amount": data.get("amount"), "currency": data.get("currency")}, "webhook")
            elif order and event in ("charge.failed", "paymentrequest.failed"):
                apply_transaction(db, order, {"status": "failed", "reference": reference}, "webhook")
            db.commit()
        except Exception:
            db.rollback()  # non-2xx makes Paystack retry later
            raise
        return jsonify({"status": "ok"}), 200

    # ------------------------------------- mock mode only (no Paystack key)
    if not is_live():
        @app.post("/api/mock/pay/<reference>")
        def mock_pay(reference):
            db = get_db()
            order = load_order(db, reference)
            outcome = (request.get_json(silent=True) or {}).get("outcome")
            if outcome not in ("success", "failed", "abandoned"):
                raise ApiError("outcome must be success, failed or abandoned")
            db.execute("UPDATE orders SET mock_outcome=? WHERE id=?", (outcome, order["id"]))
            log_event(db, order["id"], "mock_payment", outcome)
            db.commit()
            return jsonify({"ok": True})

    # ----------------------------------------------------------------- admin
    def require_admin():
        token = app.config["ADMIN_TOKEN"]
        if not token or not hmac.compare_digest(request.headers.get("X-Admin-Token", ""), token):
            raise ApiError("Unauthorised", 401)

    @app.get("/api/admin/orders")
    def admin_orders():
        require_admin()
        db = get_db()
        rows = db.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 200").fetchall()
        return jsonify([order_dict(db, r, public=False) for r in rows])

    @app.get("/api/admin/notifications")
    def admin_notifications():
        require_admin()
        rows = get_db().execute("SELECT * FROM notifications ORDER BY id DESC LIMIT 100").fetchall()
        return jsonify([dict(r) for r in rows])

    @app.patch("/api/admin/orders/<reference>")
    def admin_update_order(reference):
        require_admin()
        db = get_db()
        order = load_order(db, reference)
        body = request.get_json(silent=True) or {}
        status = body.get("status")
        allowed = ("processing", "dispatched", "delivered", "cancelled", "refunded")
        if "tracking_number" in body:
            db.execute("UPDATE orders SET tracking_number=? WHERE id=?",
                       (str(body["tracking_number"]).strip()[:80], order["id"]))
            log_event(db, order["id"], "tracking_set", str(body["tracking_number"])[:80])
        if status:
            if status not in allowed:
                raise ApiError("Invalid status.")
            if not order["paid_at"]:
                raise ApiError("Only paid orders can be fulfilled, cancelled or refunded.")
            db.execute("UPDATE orders SET status=? WHERE id=?", (status, order["id"]))
            if status in ("cancelled", "refunded"):
                restock(db, order)
            if status == "refunded" and body.get("refund_reference"):
                ref_code = str(body["refund_reference"]).strip()[:80]
                db.execute("UPDATE orders SET refund_reference=? WHERE id=?", (ref_code, order["id"]))
                log_event(db, order["id"], "refund_recorded", ref_code)
            log_event(db, order["id"], "status_changed", f"{order['status']} -> {status}")
            notify(db, order, f"Order {order['reference']} is now {status}",
                   f"Hi {order['customer_name']}, your order {order['reference']} is now {status}.")
        db.commit()
        return jsonify(order_dict(db, load_order(db, reference), public=False))

    @app.get("/api/admin/summary")
    def admin_summary():
        """Payment overview for the Payments tab. Amounts are whole KES."""
        require_admin()
        row = get_db().execute(
            """SELECT
                 COALESCE(SUM(CASE WHEN paid_at IS NOT NULL AND status != 'refunded' THEN total END), 0) AS collected,
                 COALESCE(SUM(CASE WHEN status = 'refunded' THEN total END), 0) AS refunded,
                 COALESCE(SUM(paid_at IS NOT NULL), 0) AS paid_orders,
                 COALESCE(SUM(status = 'pending_payment'), 0) AS pending,
                 COALESCE(SUM(status = 'payment_failed'), 0) AS failed,
                 COALESCE(SUM(status = 'payment_review'), 0) AS under_review,
                 COUNT(*) AS total_orders
               FROM orders""").fetchone()
        return jsonify({**dict(row), "currency": CURRENCY})

    @app.post("/api/admin/orders/<reference>/resolve-payment")
    def admin_resolve_payment(reference):
        """A person decides an order whose payment did not match (status payment_review)."""
        require_admin()
        db = get_db()
        order = load_order(db, reference)
        body = request.get_json(silent=True) or {}
        action = body.get("action")
        note = str(body.get("note", "")).strip()[:200]
        if action not in ("approve", "reject"):
            raise ApiError("action must be approve or reject.")
        if order["status"] != "payment_review":
            raise ApiError("Only orders under payment review can be resolved here.")
        if action == "approve":
            mark_paid(db, order, "admin", from_review=True)
            log_event(db, order["id"], "review_approved", note)
        else:
            db.execute("UPDATE orders SET status='payment_failed' WHERE id=?", (order["id"],))
            log_event(db, order["id"], "review_rejected", note)
        db.commit()
        return jsonify(order_dict(db, load_order(db, reference), public=False))

    def slugify(text):
        return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "item"

    def clean_list(value, label, max_items=12):
        """Accepts a list or a comma-separated string; trims, drops blanks and case-insensitive duplicates."""
        if isinstance(value, str):
            value = value.split(",")
        if not isinstance(value, list):
            raise ApiError(f"Please give at least one {label}.")
        out, seen = [], set()
        for item in value:
            item = str(item).strip()
            if not item:
                continue
            key = re.sub(r"[^A-Z0-9]", "", item.upper())
            if len(item) > 24 or not key:
                raise ApiError(f"Each {label} must be 1-24 characters (letters or numbers).")
            if key not in seen:
                seen.add(key)
                out.append(item)
        if not 1 <= len(out) <= max_items:
            raise ApiError(f"Please give between 1 and {max_items} {label}s.")
        return out

    def whole_number(value, label, low, high):
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise ApiError(f"{label} must be a whole number.")
        if not low <= number <= high:
            raise ApiError(f"{label} must be between {low:,} and {high:,}.")
        return number

    @app.post("/api/admin/products")
    def admin_create_product():
        """Adds a product to the listing: one variant per size x colour, visible on the shop at once."""
        require_admin()
        db = get_db()
        b = request.get_json(silent=True) or {}
        name = str(b.get("name", "")).strip()
        if not 2 <= len(name) <= 100:
            raise ApiError("Product name must be 2-100 characters.")
        coll = b.get("collection")
        if coll not in COLLECTIONS:
            raise ApiError("Choose a valid collection.")
        price = whole_number(b.get("price"), "Price (KES)", 1, 1_000_000)
        cost_raw = b.get("cost")
        cost = int(price * 0.55) if cost_raw in (None, "") else whole_number(cost_raw, "Cost (KES)", 0, 1_000_000)
        desc = str(b.get("description", "")).strip()[:1000]
        fulfil = b.get("fulfilment", "local")
        if fulfil not in ("local", "supplier"):
            raise ApiError("Fulfilment must be local or supplier.")
        sizes = clean_list(b.get("sizes"), "size")
        colours = clean_list(b.get("colours"), "colour")
        stock = 0 if fulfil == "supplier" else whole_number(b.get("stock", 0), "Stock", 0, 9999)

        base = slugify(name)
        slug, n = base, 2
        while db.execute("SELECT 1 FROM products WHERE slug=?", (slug,)).fetchone():
            slug, n = f"{base}-{n}", n + 1
        estimate = ("Dispatched in 1-2 working days" if fulfil == "local"
                    else "Supplier confirms availability. Dispatch in 5-8 working days")
        try:
            cur = db.execute(
                "INSERT INTO products (slug, name, collection, price, description, created_at) VALUES (?,?,?,?,?,?)",
                (slug, name, coll, price, desc, now()))
            pid = cur.lastrowid
            for size in sizes:
                for colour in colours:
                    sku = (f"STY-{coll[:3].upper()}-{pid:02d}-{re.sub('[^A-Z0-9]', '', size.upper())}"
                           f"-{re.sub('[^A-Z0-9]', '', colour.upper())}")
                    db.execute(
                        "INSERT INTO variants (product_id, sku, size, colour, cost, stock, fulfilment, dispatch_estimate) "
                        "VALUES (?,?,?,?,?,?,?,?)", (pid, sku, size, colour, cost, stock, fulfil, estimate))
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            raise ApiError("Those sizes and colours clash with an existing item. Please adjust them.")
        row = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
        return jsonify(product_dict(db, row, with_variants=True)), 201

    init_db()
    return app


if __name__ == "__main__":
    application = create_app()
    mode = "LIVE Paystack" if application.config["PAYSTACK_SECRET_KEY"] else "MOCK payments (no PAYSTACK_SECRET_KEY set)"
    print(f"STYLE API running with {mode}")
    application.run(port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("FLASK_DEBUG") == "1")
