"""
core/apple_iap.py — 驗證 Apple App 內購的簽章資料（StoreKit 2 / App Store Server Notifications V2）
====================================================================================

Apple 送來的交易都是 JWS（ES256），header 的 x5c 帶三張憑證：
    葉憑證（Apple 簽交易用） → 中繼（Apple Worldwide Developer Relations） → Apple Root CA - G3

驗證步驟（與 Apple 官方 app-store-server-library 相同的檢查）：
  1. alg 必須是 ES256，x5c 恰好三張
  2. 根憑證的 SHA-256 指紋 = Apple Root CA - G3（寫死；可用環境變數 APPLE_ROOT_CA_SHA256 覆寫）
  3. 每一張都由下一張簽發、在有效期內；葉憑證與中繼帶 Apple 專屬 OID
  4. 用葉憑證公鑰驗 JWS 簽章
全部過了才回傳 payload；任何一步不過就丟 AppleJWSError —— 不接受「先相信、之後再查」。

transaction_to_membership() 把一筆交易換成會員狀態（trial / active / grace / expired），
規則只寫在這裡，購買驗證與 Apple 伺服器通知共用。
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Optional, Tuple

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

# Apple Root CA - G3（https://www.apple.com/certificateauthority/）DER 的 SHA-256
APPLE_ROOT_CA_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179"
OID_LEAF = x509.ObjectIdentifier("1.2.840.113635.100.6.11.1")          # App Store 收據簽章
OID_INTERMEDIATE = x509.ObjectIdentifier("1.2.840.113635.100.6.2.1")   # WWDR 中繼


class AppleJWSError(ValueError):
    """簽章資料不可信（格式錯、憑證鏈不對、簽章不符）。"""


def _b64url(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _root_fingerprints() -> set:
    extra = os.environ.get("APPLE_ROOT_CA_SHA256", "")
    pins = {APPLE_ROOT_CA_G3_SHA256}
    pins.update(p.strip().lower().replace(":", "") for p in extra.split(",") if p.strip())
    return pins


def _valid_now(cert: x509.Certificate, now: datetime) -> bool:
    start = getattr(cert, "not_valid_before_utc", None) or cert.not_valid_before.replace(tzinfo=timezone.utc)
    end = getattr(cert, "not_valid_after_utc", None) or cert.not_valid_after.replace(tzinfo=timezone.utc)
    return start <= now <= end


def _has_oid(cert: x509.Certificate, oid: x509.ObjectIdentifier) -> bool:
    try:
        cert.extensions.get_extension_for_oid(oid)
        return True
    except x509.ExtensionNotFound:
        return False


def verify_jws(token: str, now: Optional[datetime] = None) -> dict:
    """驗證 Apple 簽的 JWS，回傳 payload（dict）。不可信就丟 AppleJWSError。"""
    if not isinstance(token, str) or token.count(".") != 2:
        raise AppleJWSError("not a JWS")
    head_b64, body_b64, sig_b64 = token.split(".")
    try:
        header = json.loads(_b64url(head_b64))
        payload = json.loads(_b64url(body_b64))
        signature = _b64url(sig_b64)
    except Exception as exc:
        raise AppleJWSError("malformed JWS") from exc
    if header.get("alg") != "ES256":
        raise AppleJWSError("unexpected alg")
    x5c = header.get("x5c") or []
    if len(x5c) != 3:
        raise AppleJWSError("x5c must hold 3 certificates")
    try:
        ders = [base64.b64decode(c) for c in x5c]
        certs = [x509.load_der_x509_certificate(d) for d in ders]
    except Exception as exc:
        raise AppleJWSError("bad certificate") from exc

    leaf, intermediate, root = certs
    if hashlib.sha256(ders[2]).hexdigest() not in _root_fingerprints():
        raise AppleJWSError("root is not Apple Root CA - G3")
    if not (_has_oid(leaf, OID_LEAF) and _has_oid(intermediate, OID_INTERMEDIATE)):
        raise AppleJWSError("missing Apple certificate markers")

    now = now or datetime.now(timezone.utc)
    for child, issuer in ((leaf, intermediate), (intermediate, root), (root, root)):
        if child.issuer != issuer.subject:
            raise AppleJWSError("broken certificate chain")
        if not _valid_now(child, now):
            raise AppleJWSError("certificate expired")
        try:
            issuer.public_key().verify(child.signature, child.tbs_certificate_bytes,
                                       ec.ECDSA(child.signature_hash_algorithm))
        except (InvalidSignature, TypeError, AttributeError) as exc:
            raise AppleJWSError("certificate signature invalid") from exc

    if len(signature) != 64:
        raise AppleJWSError("bad ES256 signature length")
    der_sig = encode_dss_signature(int.from_bytes(signature[:32], "big"), int.from_bytes(signature[32:], "big"))
    try:
        leaf.public_key().verify(der_sig, f"{head_b64}.{body_b64}".encode(), ec.ECDSA(hashes.SHA256()))
    except (InvalidSignature, TypeError, AttributeError) as exc:
        raise AppleJWSError("JWS signature invalid") from exc
    return payload


def _ms_to_dt(ms) -> Optional[datetime]:
    """Apple 的毫秒時間戳 → UTC naive datetime（與資料表 expires_at 同格式）。"""
    if ms in (None, ""):
        return None
    return datetime.utcfromtimestamp(int(ms) / 1000)


def transaction_to_membership(tx: dict, renewal: Optional[dict] = None,
                              now: Optional[datetime] = None) -> Tuple[str, Optional[datetime]]:
    """一筆已驗證的訂閱交易 → (status, expires_at)。

      退款／撤銷                        → expired
      已過期但還在 Apple 扣款寬限期     → grace（到寬限期結束）
      已過期                            → expired
      介紹優惠（免費試用）期間          → trial
      其他                              → active
    """
    now = now or datetime.utcnow()
    expires = _ms_to_dt(tx.get("expiresDate"))
    if expires is None:
        raise AppleJWSError("subscription expiry missing")
    if tx.get("revocationDate"):
        return "expired", expires
    if expires is not None and expires <= now:
        grace = _ms_to_dt((renewal or {}).get("gracePeriodExpiresDate"))
        if grace is not None and grace > now:
            return "grace", grace
        return "expired", expires
    if tx.get("offerType") == 1 and tx.get("offerDiscountType", "FREE_TRIAL") == "FREE_TRIAL":
        return "trial", expires
    return "active", expires
