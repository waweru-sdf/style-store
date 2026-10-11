import hashlib
import hmac
import json

import pytest

from app import create_app

SECRET = "sk_test_unit"
CUSTOMER = {"name": "Amina Wanjiru", "email": "amina@example.com", "phone": "0712345678",
            "address": "Kilimani Rd", "town": "Nairobi", "county": "Nairobi"}


def make_client(tmp_path, live=False):
    app = create_app({"DATABASE": str(tmp_path / "t.db"), "TESTING": True,
                      "PAYSTACK_SECRET_KEY": SECRET if live else "", "ADMIN_TOKEN": "admintok"})
    return app, app.test_client()


def first_local_variant(client):
    prod = client.get("/api/products/ribbed-knit-top").get_json()
    return prod["variants"][0]


def place_order(client, variant_id, qty=2, zone="nairobi", code=None):
    body = {"items": [{"variant_id": variant_id, "quantity": qty}], "zone": zone,
            "customer": CUSTOMER, "discount_code": code}
    return client.post("/api/orders", json=body)


def stock_of(client, slug, variant_id):
    prod = client.get(f"/api/products/{slug}").get_json()
    return next(v for v in prod["variants"] if v["id"] == variant_id)["stock"]


def signed_post(client, payload, secret=SECRET):
    raw = json.dumps(payload).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
    return client.post("/api/paystack/webhook", data=raw, headers={"X-Paystack-Signature": sig,
                                                                     "Content-Type": "application/json"})


@pytest.fixture
def mock(tmp_path):
    return make_client(tmp_path, live=False)


@pytest.fixture
def live(tmp_path):
    app, client = make_client(tmp_path, live=True)
    calls = {"init": [], "verify_result": None}

    def fake_api(method, path, **kw):
        if path == "/transaction/initialize":
            calls["init"].append(kw["json"])
            return {"status": True, "data": {"authorization_url": "https://checkout.paystack.com/abc",
                                               "reference": kw["json"]["reference"]}}
        if path.startswith("/transaction/verify/"):
            return {"status": True, "data": calls["verify_result"]}
        raise AssertionError(path)

    app.paystack_api = fake_api
    return app, client, calls


def test_quote_is_computed_on_server(mock):
    _, c = mock
    v = first_local_variant(c)
    q = c.post("/api/quote", json={"items": [{"variant_id": v["id"], "quantity": 2}],
                                    "zone": "nairobi", "discount_code": "STYLE10"}).get_json()
    assert q["subtotal"] == 3000 and q["discount"] == 300 and q["delivery_fee"] == 250
    assert q["total"] == 2950 and q["currency"] == "KES"


def test_order_created_pending_and_never_paid_by_return_page_alone(mock):
    _, c = mock
    v = first_local_variant(c)
    res = place_order(c, v["id"])
    assert res.status_code == 201
    ref = res.get_json()["reference"]
    assert c.get(f"/api/orders/{ref}").get_json()["status"] == "pending_payment"
    # customer lands on return page without paying: still pending, no stock change
    assert c.post(f"/api/orders/{ref}/verify").get_json()["status"] == "pending_payment"
    assert stock_of(c, "ribbed-knit-top", v["id"]) == 10


def test_mock_success_marks_paid_once_and_deducts_stock_once(mock):
    _, c = mock
    v = first_local_variant(c)
    ref = place_order(c, v["id"], qty=2).get_json()["reference"]
    c.post(f"/api/mock/pay/{ref}", json={"outcome": "success"})
    assert c.post(f"/api/orders/{ref}/verify").get_json()["status"] == "paid"
    assert c.post(f"/api/orders/{ref}/verify").get_json()["status"] == "paid"
    assert stock_of(c, "ribbed-knit-top", v["id"]) == 8


def test_failed_payment_is_not_fulfilled(mock):
    _, c = mock
    v = first_local_variant(c)
    ref = place_order(c, v["id"]).get_json()["reference"]
    c.post(f"/api/mock/pay/{ref}", json={"outcome": "failed"})
    assert c.post(f"/api/orders/{ref}/verify").get_json()["status"] == "payment_failed"
    assert stock_of(c, "ribbed-knit-top", v["id"]) == 10


def test_cannot_oversell_local_stock(mock):
    _, c = mock
    v = first_local_variant(c)
    res = place_order(c, v["id"], qty=11)
    assert res.status_code == 400 and "left" in res.get_json()["error"]


def test_validation_rejects_bad_phone_and_email(mock):
    _, c = mock
    v = first_local_variant(c)
    bad = dict(CUSTOMER, phone="12345")
    r = c.post("/api/orders", json={"items": [{"variant_id": v["id"], "quantity": 1}], "zone": "nairobi", "customer": bad})
    assert r.status_code == 400
    bad = dict(CUSTOMER, email="nope")
    r = c.post("/api/orders", json={"items": [{"variant_id": v["id"], "quantity": 1}], "zone": "nairobi", "customer": bad})
    assert r.status_code == 400


def test_live_initialises_server_side_in_subunits(live):
    _, c, calls = live
    v = first_local_variant(c)
    res = place_order(c, v["id"], qty=1).get_json()
    assert res["authorization_url"].startswith("https://checkout.paystack.com")
    sent = calls["init"][0]
    assert sent["amount"] == (1500 + 250) * 100 and sent["currency"] == "KES"
    assert sent["reference"] == res["reference"]


def test_live_verify_checks_amount_and_currency(live):
    _, c, calls = live
    v = first_local_variant(c)
    ref = place_order(c, v["id"], qty=1).get_json()["reference"]
    calls["verify_result"] = {"status": "success", "reference": ref, "amount": 100, "currency": "KES"}
    assert c.post(f"/api/orders/{ref}/verify").get_json()["status"] == "payment_review"
    assert stock_of(c, "ribbed-knit-top", v["id"]) == 10

    ref2 = place_order(c, v["id"], qty=1).get_json()["reference"]
    calls["verify_result"] = {"status": "success", "reference": ref2, "amount": 175000, "currency": "USD"}
    assert c.post(f"/api/orders/{ref2}/verify").get_json()["status"] == "payment_review"

    ref3 = place_order(c, v["id"], qty=1).get_json()["reference"]
    calls["verify_result"] = {"status": "success", "reference": ref3, "amount": 175000, "currency": "KES"}
    assert c.post(f"/api/orders/{ref3}/verify").get_json()["status"] == "paid"


def test_webhook_rejects_bad_signature(live):
    _, c, _ = live
    r = signed_post(c, {"event": "charge.success", "data": {"id": 1, "reference": "x"}}, secret="wrong")
    assert r.status_code == 401


def test_webhook_is_idempotent(live):
    _, c, _ = live
    v = first_local_variant(c)
    ref = place_order(c, v["id"], qty=2).get_json()["reference"]
    payload = {"event": "charge.success",
               "data": {"id": 99, "reference": ref, "amount": (3000 + 250) * 100, "currency": "KES"}}
    assert signed_post(c, payload).get_json()["status"] == "ok"
    assert signed_post(c, payload).get_json()["status"] == "duplicate"
    assert c.get(f"/api/orders/{ref}").get_json()["status"] == "paid"
    assert stock_of(c, "ribbed-knit-top", v["id"]) == 8


def test_webhook_with_different_event_id_still_does_not_double_fulfil(live):
    _, c, _ = live
    v = first_local_variant(c)
    ref = place_order(c, v["id"], qty=2).get_json()["reference"]
    data = {"reference": ref, "amount": 325000, "currency": "KES"}
    signed_post(c, {"event": "charge.success", "data": dict(data, id=1)})
    signed_post(c, {"event": "charge.success", "data": dict(data, id=2)})
    assert stock_of(c, "ribbed-knit-top", v["id"]) == 8


def test_webhook_amount_mismatch_does_not_mark_paid(live):
    _, c, _ = live
    v = first_local_variant(c)
    ref = place_order(c, v["id"], qty=1).get_json()["reference"]
    signed_post(c, {"event": "charge.success", "data": {"id": 5, "reference": ref, "amount": 100, "currency": "KES"}})
    assert c.get(f"/api/orders/{ref}").get_json()["status"] == "payment_review"


def test_mock_endpoints_do_not_exist_in_live_mode(live):
    _, c, _ = live
    assert c.post("/api/mock/pay/STY-X", json={"outcome": "success"}).status_code == 404


def test_admin_requires_token_and_restocks_on_refund(mock):
    _, c = mock
    v = first_local_variant(c)
    assert c.get("/api/admin/orders").status_code == 401
    ref = place_order(c, v["id"], qty=2).get_json()["reference"]
    c.post(f"/api/mock/pay/{ref}", json={"outcome": "success"})
    c.post(f"/api/orders/{ref}/verify")
    hdr = {"X-Admin-Token": "admintok"}
    r = c.patch(f"/api/admin/orders/{ref}", json={"status": "dispatched", "tracking_number": "G4S123"}, headers=hdr)
    assert r.get_json()["status"] == "dispatched" and r.get_json()["tracking_number"] == "G4S123"
    c.patch(f"/api/admin/orders/{ref}", json={"status": "refunded"}, headers=hdr)
    assert stock_of(c, "ribbed-knit-top", v["id"]) == 10
    c.patch(f"/api/admin/orders/{ref}", json={"status": "cancelled"}, headers=hdr)
    assert stock_of(c, "ribbed-knit-top", v["id"]) == 10  # restocked only once
