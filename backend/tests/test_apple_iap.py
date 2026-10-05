"""
App 內購驗證：Apple 憑證鏈、JWS 簽章、會員狀態換算、購買驗證與伺服器通知端點。
用自己產生的三層憑證（模擬 Apple Root CA - G3 → WWDR → 簽章憑證），
把根憑證指紋透過 APPLE_ROOT_CA_SHA256 加進信任名單 —— 正式環境只信任 Apple 的根。
"""
import base64
import hashlib
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_apple_iap_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.x509.oid import NameOID
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from core import apple_iap
from core.db import SessionLocal, init_db
from core.models_membership import AppleMembershipVersion, UserMembership
from repositories import membership_repo
import api_membership
from config import settings

init_db()
NOW = datetime.now(timezone.utc)


def _name(cn):
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def _cert(subject, issuer, pub, issuer_key, oid=None, ca=False):
    b = (x509.CertificateBuilder().subject_name(_name(subject)).issuer_name(_name(issuer))
         .public_key(pub).serial_number(x509.random_serial_number())
         .not_valid_before(NOW - timedelta(days=1)).not_valid_after(NOW + timedelta(days=365))
         .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True))
    if oid:
        b = b.add_extension(x509.UnrecognizedExtension(x509.ObjectIdentifier(oid), b"\x05\x00"), critical=False)
    return b.sign(issuer_key, hashes.SHA256())


ROOT_KEY = ec.generate_private_key(ec.SECP384R1())
MID_KEY = ec.generate_private_key(ec.SECP256R1())
LEAF_KEY = ec.generate_private_key(ec.SECP256R1())
ROOT = _cert("Test Root G3", "Test Root G3", ROOT_KEY.public_key(), ROOT_KEY, ca=True)
MID = _cert("Test WWDR", "Test Root G3", MID_KEY.public_key(), ROOT_KEY, oid="1.2.840.113635.100.6.2.1", ca=True)
LEAF = _cert("Test Signer", "Test WWDR", LEAF_KEY.public_key(), MID_KEY, oid="1.2.840.113635.100.6.11.1")
DER = [c.public_bytes(serialization.Encoding.DER) for c in (LEAF, MID, ROOT)]
os.environ["APPLE_ROOT_CA_SHA256"] = hashlib.sha256(DER[2]).hexdigest()


def _b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def sign(payload, key=LEAF_KEY, der=DER):
    head = _b64url(json.dumps({"alg": "ES256", "x5c": [base64.b64encode(d).decode() for d in der]}).encode())
    body = _b64url(json.dumps(payload).encode())
    r, s = decode_dss_signature(key.sign(f"{head}.{body}".encode(), ec.ECDSA(hashes.SHA256())))
    return f"{head}.{body}.{_b64url(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"


def ms(dt):
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def tx(days=30, **kw):
    base = {"bundleId": settings.APPLE_BUNDLE_ID, "productId": "drvn.member.yearly",
            "originalTransactionId": "1000", "transactionId": "2000",
            "expiresDate": ms(datetime.utcnow() + timedelta(days=days)), "environment": "Sandbox",
            "signedDate": ms(datetime.utcnow())}
    base.update(kw)
    return base


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_ENABLED", True)
    with SessionLocal() as db:
        db.query(AppleMembershipVersion).delete()
        db.query(UserMembership).delete()
        db.commit()
    yield


def client_as(user_id):
    app = FastAPI()

    @app.middleware("http")
    async def _uid(request: Request, call_next):
        request.state.user_id = user_id
        return await call_next(request)

    app.include_router(api_membership.router)
    return TestClient(app)


# ── 簽章驗證 ─────────────────────────────────────────────────────

def test_valid_jws_passes():
    assert apple_iap.verify_jws(sign({"a": 1}))["a"] == 1


def test_tampered_payload_rejected():
    head, body, sig = sign({"productId": "drvn.member.monthly"}).split(".")
    forged = _b64url(json.dumps({"productId": "drvn.member.yearly"}).encode())
    with pytest.raises(apple_iap.AppleJWSError):
        apple_iap.verify_jws(f"{head}.{forged}.{sig}")


def test_untrusted_root_rejected():
    fake_root_key = ec.generate_private_key(ec.SECP384R1())
    fake_root = _cert("Test Root G3", "Test Root G3", fake_root_key.public_key(), fake_root_key, ca=True)
    der = [DER[0], DER[1], fake_root.public_bytes(serialization.Encoding.DER)]
    with pytest.raises(apple_iap.AppleJWSError):
        apple_iap.verify_jws(sign({"a": 1}, der=der))


def test_self_signed_leaf_rejected():
    rogue = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(apple_iap.AppleJWSError):
        apple_iap.verify_jws(sign({"a": 1}, key=rogue))


def test_missing_apple_oid_rejected():
    plain_leaf = _cert("Test Signer", "Test WWDR", LEAF_KEY.public_key(), MID_KEY)
    der = [plain_leaf.public_bytes(serialization.Encoding.DER), DER[1], DER[2]]
    with pytest.raises(apple_iap.AppleJWSError):
        apple_iap.verify_jws(sign({"a": 1}, der=der))


def test_real_apple_root_pinned():
    assert apple_iap.APPLE_ROOT_CA_G3_SHA256 in apple_iap._root_fingerprints()


# ── 狀態換算 ─────────────────────────────────────────────────────

def test_transaction_status_rules():
    now = datetime.utcnow()
    assert apple_iap.transaction_to_membership(tx(30), now=now)[0] == "active"
    assert apple_iap.transaction_to_membership(tx(14, offerType=1, offerDiscountType="FREE_TRIAL"), now=now)[0] == "trial"
    assert apple_iap.transaction_to_membership(tx(-1), now=now)[0] == "expired"
    grace = {"gracePeriodExpiresDate": ms(now + timedelta(days=5))}
    status, until = apple_iap.transaction_to_membership(tx(-1), grace, now=now)
    assert status == "grace" and until > now
    assert apple_iap.transaction_to_membership(tx(30, revocationDate=ms(now)), now=now)[0] == "expired"


# ── 端點 ────────────────────────────────────────────────────────

def test_verify_requires_login():
    r = client_as(None).post("/api/membership/apple/verify", json={"transactions": [sign(tx())]})
    assert r.status_code == 401


def test_verify_purchase_makes_member():
    r = client_as("u1").post("/api/membership/apple/verify", json={"transactions": [sign(tx(14, offerType=1))]})
    assert r.status_code == 200
    body = r.json()
    assert body["is_member"] is True and body["status"] == "trial"


def test_verify_rejects_other_app_and_unknown_product():
    c = client_as("u1")
    assert c.post("/api/membership/apple/verify", json={"transactions": [sign(tx(bundleId="com.other.app"))]}).status_code == 400
    assert c.post("/api/membership/apple/verify", json={"transactions": [sign(tx(productId="drvn.lifetime"))]}).status_code == 400
    assert membership_repo.get_membership("u1")["is_member"] is False


def test_empty_sync_does_not_downgrade():
    client_as("u1").post("/api/membership/apple/verify", json={"transactions": [sign(tx())]})
    r = client_as("u1").post("/api/membership/apple/verify", json={"transactions": []})
    assert r.json()["is_member"] is True


def test_latest_expiry_wins():
    old, new = sign(tx(-30, transactionId="1")), sign(tx(300, transactionId="2"))
    r = client_as("u1").post("/api/membership/apple/verify", json={"transactions": [old, new]})
    assert r.json()["status"] == "active"


def test_one_subscription_one_account():
    client_as("u1").post("/api/membership/apple/verify", json={"transactions": [sign(tx())]})
    client_as("u2").post("/api/membership/apple/verify", json={"transactions": [sign(tx())]})
    assert membership_repo.get_membership("u2")["is_member"] is True
    assert membership_repo.get_membership("u1")["is_member"] is False


def _notify(ntype, t, renewal=None):
    data = {"bundleId": settings.APPLE_BUNDLE_ID, "signedTransactionInfo": sign(t)}
    if renewal:
        data["signedRenewalInfo"] = sign(renewal)
    return client_as(None).post("/api/membership/apple/notifications",
                                json={"signedPayload": sign({"notificationType": ntype, "data": data, "signedDate": ms(datetime.utcnow())})})


def test_old_purchase_cannot_restore_refunded_access():
    c = client_as('u1')
    purchase = tx(signedDate=ms(datetime.utcnow() - timedelta(minutes=5)))
    c.post('/api/membership/apple/verify', json={'transactions': [sign(purchase)]})
    assert _notify('REFUND', purchase).status_code == 200
    r = c.post('/api/membership/apple/verify', json={'transactions': [sign(purchase)]})
    assert r.json()['is_member'] is False


def test_old_notification_cannot_downgrade_renewed_subscription():
    c = client_as('u1')
    c.post('/api/membership/apple/verify', json={'transactions': [sign(tx(365))]})
    old = {'notificationType': 'EXPIRED', 'signedDate': ms(datetime.utcnow() - timedelta(days=1)),
           'data': {'bundleId': settings.APPLE_BUNDLE_ID, 'signedTransactionInfo': sign(tx(-1))}}
    r = client_as(None).post('/api/membership/apple/notifications', json={'signedPayload': sign(old)})
    assert r.status_code == 200
    assert membership_repo.get_membership('u1')['is_member'] is True


@pytest.mark.parametrize('fields', [{'expiresDate': None}, {'expiresDate': 'invalid'}, {'signedDate': None}])
def test_missing_or_invalid_subscription_dates_rejected(fields):
    r = client_as('u1').post('/api/membership/apple/verify', json={'transactions': [sign(tx(**fields))]})
    assert r.status_code == 400
    assert membership_repo.get_membership('u1')['is_member'] is False


def test_notification_renew_refund_and_grace():
    client_as("u1").post("/api/membership/apple/verify", json={"transactions": [sign(tx(1))]})
    assert _notify("DID_RENEW", tx(365)).status_code == 200
    assert membership_repo.get_membership("u1")["status"] == "active"
    _notify("DID_FAIL_TO_RENEW", tx(-1), {"gracePeriodExpiresDate": ms(datetime.utcnow() + timedelta(days=6))})
    assert membership_repo.get_membership("u1")["status"] == "grace"
    _notify("REFUND", tx(365))
    assert membership_repo.get_membership("u1")["is_member"] is False


def test_notification_bad_signature_rejected():
    rogue = ec.generate_private_key(ec.SECP256R1())
    payload = sign({"notificationType": "DID_RENEW", "data": {"bundleId": settings.APPLE_BUNDLE_ID}}, key=rogue)
    r = client_as(None).post("/api/membership/apple/notifications", json={"signedPayload": payload})
    assert r.status_code == 400


def test_notification_for_unknown_subscription_is_ok():
    assert _notify("SUBSCRIBED", tx(originalTransactionId="999")).json().get("unlinked") is True


def test_account_delete_removes_membership():
    client_as("u1").post("/api/membership/apple/verify", json={"transactions": [sign(tx())]})
    assert membership_repo.delete_membership("u1") == 1
    assert membership_repo.get_membership("u1")["status"] == "none"
