"""
repositories/membership_repo.py — 會員訂閱狀態 倉儲層
=====================================================

get_membership() 永遠回傳一個完整的 dict，沒有紀錄就是免費。
「有沒有會員權限」的判斷只在這裡做一次（is_member_status），
API 與之後的伺服器端檢查都呼叫它，不各寫一份。
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from core.db import SessionLocal, init_db
from core.models_membership import AppleMembershipVersion, MembershipSurvey, UserMembership
from core.models_training import WorkoutSession

init_db()

VALID_STATUSES = ("none", "trial", "active", "grace", "expired")
MEMBER_STATUSES = ("trial", "active", "grace")


def is_member_status(status: str, expires_at: Optional[datetime], now: Optional[datetime] = None) -> bool:
    """會員權限判定（唯一一份）。

    trial / active / grace 且尚未過期 → 會員。
    expires_at 為 None 時不視為過期（寬限期由 Apple 通知結束）。
    """
    if status not in MEMBER_STATUSES:
        return False
    if expires_at is None:
        return True
    return expires_at > (now or datetime.utcnow())


def _to_dict(row: Optional[UserMembership], user_id: str) -> dict:
    if row is None:
        return {"user_id": user_id, "status": "none", "product_id": None,
                "source": None, "expires_at": None, "is_member": False}
    return {
        "user_id": row.user_id,
        "status": row.status,
        "product_id": row.product_id,
        "source": row.source,
        "expires_at": row.expires_at.isoformat() + "Z" if row.expires_at else None,
        "is_member": is_member_status(row.status, row.expires_at),
    }


def get_membership(user_id: str) -> dict:
    with SessionLocal() as db:
        row = db.query(UserMembership).filter(UserMembership.user_id == user_id).one_or_none()
        return _to_dict(row, user_id)


def upsert_membership(user_id: str, *, status: str, product_id: Optional[str] = None,
                      original_transaction_id: Optional[str] = None, source: str = "app_store",
                      expires_at: Optional[datetime] = None) -> dict:
    if status not in VALID_STATUSES:
        raise ValueError(f"invalid membership status: {status}")
    with SessionLocal() as db:
        row = db.query(UserMembership).filter(UserMembership.user_id == user_id).one_or_none()
        if row is None:
            row = UserMembership(user_id=user_id)
            db.add(row)
        row.status = status
        row.product_id = product_id
        row.original_transaction_id = original_transaction_id
        row.source = source
        row.expires_at = expires_at
        row.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _to_dict(row, user_id)


def apply_app_store_transaction(user_id: str, *, status: str, product_id: str,
                                original_transaction_id: str, expires_at: Optional[datetime],
                                signed_at_ms: Optional[int] = None) -> dict:
    """把一筆已驗證的 App Store 訂閱寫給 user_id。

    同一個 Apple 訂閱（original_transaction_id）一次只算一個 DRVN 帳號：
    換帳號登入後恢復購買，訂閱就移到新帳號，舊帳號改成 expired —— 不會一份錢開兩個會員。
    """
    if status not in VALID_STATUSES:
        raise ValueError(f"invalid membership status: {status}")
    with SessionLocal() as db:
        current = db.query(UserMembership).filter(UserMembership.user_id == user_id).with_for_update().one_or_none()
        version = db.query(AppleMembershipVersion).filter(
            AppleMembershipVersion.original_transaction_id == original_transaction_id,
        ).with_for_update().one_or_none()
        if version and (signed_at_ms is None or signed_at_ms < version.signed_at_ms
                        or (signed_at_ms == version.signed_at_ms and version.status == 'expired' and status != 'expired')):
            return _to_dict(current, user_id)
        if signed_at_ms is not None:
            if version is None:
                version = AppleMembershipVersion(original_transaction_id=original_transaction_id)
                db.add(version)
            version.signed_at_ms = signed_at_ms
            version.status = status
        others = db.query(UserMembership).filter(
            UserMembership.original_transaction_id == original_transaction_id,
            UserMembership.user_id != user_id,
        ).all()
        for row in others:
            row.status = "expired"
            row.updated_at = datetime.utcnow()
        if current is None:
            current = UserMembership(user_id=user_id)
            db.add(current)
        current.status = status
        current.product_id = product_id
        current.original_transaction_id = original_transaction_id
        current.source = 'app_store'
        current.expires_at = expires_at
        current.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(current)
        return _to_dict(current, user_id)


def find_user_by_original_transaction(original_transaction_id: str) -> Optional[str]:
    """Apple 伺服器通知只帶 original_transaction_id —— 用它找回是哪個帳號。"""
    if not original_transaction_id:
        return None
    with SessionLocal() as db:
        row = db.query(UserMembership).filter(
            UserMembership.original_transaction_id == original_transaction_id,
            UserMembership.status != "expired",
        ).order_by(UserMembership.updated_at.desc()).first()
        if row is None:
            row = db.query(UserMembership).filter(
                UserMembership.original_transaction_id == original_transaction_id,
            ).order_by(UserMembership.updated_at.desc()).first()
        return row.user_id if row else None


def delete_membership(user_id: str) -> int:
    """刪除帳號時一起清掉會員紀錄與問卷（Apple 那邊的訂閱要使用者自己到 Apple ID 取消）。"""
    with SessionLocal() as db:
        n = db.query(UserMembership).filter(UserMembership.user_id == user_id).delete()
        db.query(MembershipSurvey).filter(MembershipSurvey.user_id == user_id).delete()
        db.commit()
        return n


def user_in_list(user_id: Optional[str], ids_or_emails) -> bool:
    """帳號 ID 或註冊 Email 在名單上（名單已轉小寫）。"""
    if not user_id or not ids_or_emails:
        return False
    if str(user_id).lower() in ids_or_emails:
        return True
    from core.database import SessionLocal as UserSession
    from core.models_user import User
    with UserSession() as db:
        user = db.query(User).filter(User.id == user_id).first()
        return bool(user and user.email and user.email.lower() in ids_or_emails)


def comp_reason(user_id: Optional[str], *, free_members=frozenset(),
                founding_before: Optional[datetime] = None) -> Optional[str]:
    """永久免費會員（不用訂閱）→ 'free_list'（名單上的 Email／帳號 ID）或 'founding'（創始會員）；不是回 None。"""
    if not user_id:
        return None
    if str(user_id).lower() in free_members:
        return "free_list"
    if not free_members and founding_before is None:
        return None
    # 帳號在另一個資料庫（core.database：users.db／USERS_DB_URL）
    from core.database import SessionLocal as UserSession
    from core.models_user import User
    with UserSession() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            return None
        if user.email and user.email.lower() in free_members:
            return "free_list"
        if founding_before is not None and user.created_at is not None and user.created_at < founding_before:
            return "founding"
    return None


def count_pose_checks_this_month(user_id: str, now: Optional[datetime] = None) -> int:
    """這個月做了幾次姿勢檢查（動作偵測）。

    以 workout_sessions 裡 session_type='motion_analysis' 的紀錄為準 ——
    那是分析成功後才寫入的（debug／測試模式不寫），失敗的上傳不算次數。
    timestamp 是本地時間的 ISO 字串，用「YYYY-MM」前綴比對當月。
    """
    if not user_id:
        return 0
    month = (now or datetime.now()).strftime("%Y-%m")
    with SessionLocal() as db:
        return db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.session_type == "motion_analysis",
            WorkoutSession.timestamp.like(f"{month}%"),
        ).count()


# ── 訂閱／退訂原因 ────────────────────────────────────────────────

def add_survey(user_id: str, *, kind: str, reasons: list, note: Optional[str] = None,
               product_id: Optional[str] = None, feature: Optional[str] = None) -> None:
    with SessionLocal() as db:
        db.add(MembershipSurvey(user_id=user_id, kind=kind, reasons=",".join(reasons),
                                note=(note or None), product_id=product_id, feature=feature))
        db.commit()


def survey_stats(days: int = 365, now: Optional[datetime] = None) -> dict:
    """每個原因被選幾次、回覆幾份、最近的文字補充；外加目前各狀態會員人數。"""
    from collections import Counter
    from datetime import timedelta
    since = (now or datetime.utcnow()) - timedelta(days=days)
    out = {"days": days, "subscribe": {}, "cancel": {}, "pose": {},
           "responses": {"subscribe": 0, "cancel": 0, "pose": 0},
           "features": {}, "pose_exercises": {}, "notes": [], "members": {}}
    counts = {"subscribe": Counter(), "cancel": Counter(), "pose": Counter()}
    features = Counter()
    pose_ex = Counter()   # 哪個動作被說「不準／部分準」最多
    with SessionLocal() as db:
        rows = db.query(MembershipSurvey).filter(MembershipSurvey.created_at >= since) \
                 .order_by(MembershipSurvey.created_at.desc()).all()
        for r in rows:
            if r.kind not in counts:
                continue
            out["responses"][r.kind] += 1
            counts[r.kind].update([x for x in (r.reasons or "").split(",") if x])
            if r.kind == "subscribe" and r.feature:
                features[r.feature] += 1
            if r.kind == "pose" and r.feature and "accurate" not in (r.reasons or "").split(","):
                pose_ex[r.feature] += 1
            if r.note and len(out["notes"]) < 50:
                out["notes"].append({"kind": r.kind, "note": r.note, "at": r.created_at.isoformat() + "Z"})
        for status, n in Counter(m.status for m in db.query(UserMembership).all()).items():
            out["members"][status] = n
    out["subscribe"] = dict(counts["subscribe"].most_common())
    out["cancel"] = dict(counts["cancel"].most_common())
    out["pose"] = dict(counts["pose"].most_common())
    out["features"] = dict(features.most_common())
    out["pose_exercises"] = dict(pose_ex.most_common())
    return out
