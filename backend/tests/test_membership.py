"""
會員身分：判定規則、倉儲、付費牆開關。
"""
import os
import tempfile
from datetime import datetime, timedelta

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_membership_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ["USERS_DB_URL"] = f"sqlite:///{os.path.join(tempfile.gettempdir(), 'drvn_membership_users_test.db')}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_membership import AppleMembershipVersion, MembershipSurvey, UserMembership
from repositories import membership_repo
import api_membership
from config import settings

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(AppleMembershipVersion).delete()
        db.query(UserMembership).delete()
        db.query(MembershipSurvey).delete()
        db.commit()
    yield


def test_status_rules():
    now = datetime(2026, 9, 26)
    later, earlier = now + timedelta(days=3), now - timedelta(days=1)
    assert membership_repo.is_member_status("active", later, now)
    assert membership_repo.is_member_status("trial", later, now)
    assert membership_repo.is_member_status("grace", None, now)
    assert not membership_repo.is_member_status("active", earlier, now)
    assert not membership_repo.is_member_status("expired", later, now)
    assert not membership_repo.is_member_status("none", None, now)


def test_no_record_is_free():
    m = membership_repo.get_membership("u1")
    assert m["status"] == "none" and m["is_member"] is False


def test_upsert_and_expire():
    exp = datetime.utcnow() + timedelta(days=14)
    m = membership_repo.upsert_membership("u1", status="trial", product_id="drvn.member.yearly", expires_at=exp)
    assert m["is_member"] is True
    m = membership_repo.upsert_membership("u1", status="expired", product_id="drvn.member.yearly", expires_at=exp)
    assert m["is_member"] is False
    with pytest.raises(ValueError):
        membership_repo.upsert_membership("u1", status="gold")


def test_gate_off_everyone_member(monkeypatch):
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_ENABLED", False)
    assert api_membership.resolve_membership(None)["is_member"] is True
    assert api_membership.resolve_membership("u2")["is_member"] is True


def test_gate_on_uses_subscription(monkeypatch):
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_ENABLED", True)
    assert api_membership.resolve_membership(None)["is_member"] is False
    assert api_membership.resolve_membership("u3")["is_member"] is False
    membership_repo.upsert_membership("u3", status="active", expires_at=datetime.utcnow() + timedelta(days=30))
    info = api_membership.resolve_membership("u3")
    assert info["is_member"] is True and info["gate_enabled"] is True


def test_monthly_report_has_server_membership_dependency(monkeypatch):
    from api_user_profile import router
    from starlette.requests import Request
    from fastapi import HTTPException
    route = next(r for r in router.routes if r.path == '/api/user/monthly-report/{user_id}')
    assert api_membership.require_member in [d.call for d in route.dependant.dependencies]
    monkeypatch.setattr(settings, 'MEMBERSHIP_GATE_ENABLED', True)
    request = Request({'type': 'http', 'headers': [], 'state': {'user_id': 'report_free'}})
    with pytest.raises(HTTPException) as exc:
        api_membership.require_member(request)
    assert exc.value.status_code == 403
    membership_repo.upsert_membership('report_free', status='active', expires_at=datetime.utcnow() + timedelta(days=1))
    api_membership.require_member(request)
    monkeypatch.setattr(settings, 'MEMBERSHIP_GATE_ENABLED', False)
    api_membership.require_member(Request({'type': 'http', 'headers': [], 'state': {}}))


# ── 姿勢檢查：免費每個月 3 次、會員不限 ──────────────────────────
def _add_motion(user_id, ts, sid):
    from core.models_training import WorkoutSession
    with SessionLocal() as db:
        db.add(WorkoutSession(session_id=sid, user_id=user_id, timestamp=ts,
                              session_type="motion_analysis", payload={"type": "motion_analysis"}))
        db.commit()


def _clean_motion():
    from core.models_training import WorkoutSession
    with SessionLocal() as db:
        db.query(WorkoutSession).filter(WorkoutSession.user_id.like("pose_%")).delete(synchronize_session=False)
        db.commit()


def test_pose_count_only_this_month():
    _clean_motion()
    now = datetime(2026, 9, 26, 10, 0)
    _add_motion("pose_u1", "2026-09-02T08:00:00", "m1")
    _add_motion("pose_u1", "2026-08-30T08:00:00", "m2")   # 上個月不算
    assert membership_repo.count_pose_checks_this_month("pose_u1", now) == 1
    assert membership_repo.count_pose_checks_this_month("pose_other", now) == 0


def test_pose_checks_unlimited(monkeypatch):
    """2026-09 起姿勢檢查全部免費、不限次數（本地運算、收集回饋中）。"""
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_ENABLED", True)
    monkeypatch.setattr(membership_repo, "count_pose_checks_this_month", lambda uid, now=None: 99)
    assert api_membership.FREE_POSE_CHECKS_PER_MONTH is None
    assert api_membership.pose_check_allowed("pose_u2") is True


def _user(email, created_at):
    from core.database import SessionLocal as UserSession, init_db as init_user_db
    from core.models_user import User
    init_user_db()
    with UserSession() as db:
        db.query(User).filter(User.email == email).delete()
        u = User(email=email, created_at=created_at)
        db.add(u)
        db.commit()
        return u.id


def test_free_list_by_email_and_id(monkeypatch):
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_ENABLED", True)
    uid = _user("friend@example.com", datetime.utcnow())
    other = _user("stranger@example.com", datetime.utcnow())
    monkeypatch.setattr(settings, "FREE_MEMBERS", frozenset({"friend@example.com", "coach-uid"}))
    m = api_membership.resolve_membership(uid)
    assert m["is_member"] is True and m["status"] == "comp" and m["comp_reason"] == "free_list"
    assert api_membership.resolve_membership("coach-uid")["is_member"] is True
    assert api_membership.resolve_membership(other)["is_member"] is False


def test_founding_members_cutoff_is_taiwan_midnight(monkeypatch):
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_ENABLED", True)
    monkeypatch.setattr(settings, "FREE_MEMBERS", frozenset())
    # 台灣 12/31 23:00 註冊（UTC 15:00）→ 算創始；台灣 1/1 01:00（UTC 12/31 17:00）→ 不算
    early = _user("early@example.com", datetime(2026, 12, 31, 15, 0))
    late = _user("late@example.com", datetime(2026, 12, 31, 17, 0))
    monkeypatch.setattr(settings, "FOUNDING_MEMBERS_BEFORE", "2027-01-01")
    assert api_membership.resolve_membership(early)["comp_reason"] == "founding"
    assert api_membership.resolve_membership(late)["is_member"] is False
    monkeypatch.setattr(settings, "FOUNDING_MEMBERS_BEFORE", "")
    assert api_membership.resolve_membership(early)["is_member"] is False


def test_gate_only_for_review_accounts(monkeypatch):
    """試營運：付費牆沒全開，只有審核帳號看得到付費牆（其他人照樣全部免費）。"""
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_ENABLED", False)
    monkeypatch.setattr(settings, "FREE_MEMBERS", frozenset())
    reviewer = _user("review@example.com", datetime.utcnow())
    someone = _user("someone@example.com", datetime.utcnow())
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_USERS", frozenset({"review@example.com"}))
    r = api_membership.resolve_membership(reviewer)
    assert r["gate_enabled"] is True and r["is_member"] is False
    s = api_membership.resolve_membership(someone)
    assert s["gate_enabled"] is False and s["is_member"] is True


def test_subscriber_on_free_list_still_sees_subscription(monkeypatch):
    monkeypatch.setattr(settings, "MEMBERSHIP_GATE_ENABLED", True)
    uid = _user("payer@example.com", datetime.utcnow())
    monkeypatch.setattr(settings, "FREE_MEMBERS", frozenset({"payer@example.com"}))
    membership_repo.upsert_membership(uid, status="active", product_id="drvn.member.yearly",
                                      expires_at=datetime.utcnow() + timedelta(days=30))
    assert api_membership.resolve_membership(uid)["status"] == "active"   # 才能在設定頁管理／取消


# ── 訂閱／退訂原因問卷 ──────────────────────────────────────────

def _client(user_id):
    from fastapi import FastAPI, Request as Req
    from fastapi.testclient import TestClient
    app = FastAPI()

    @app.middleware("http")
    async def _uid(request: Req, call_next):
        request.state.user_id = user_id
        return await call_next(request)

    app.include_router(api_membership.router)
    return TestClient(app)


def test_survey_submit_and_stats(monkeypatch):
    monkeypatch.setenv("ADMIN_KEY", "k")
    c = _client("u1")
    assert c.post("/api/membership/survey", json={"kind": "subscribe", "reasons": ["analysis", "charts", "hack"],
                                                  "feature": "runAnalysis", "product_id": "drvn.member.yearly"}).status_code == 200
    assert c.post("/api/membership/survey", json={"kind": "cancel", "reasons": ["price"], "note": "有點貴"}).status_code == 200
    assert c.post("/api/membership/survey", json={"kind": "cancel", "reasons": ["nope"]}).status_code == 400
    assert c.post("/api/membership/survey", json={"kind": "refund", "reasons": ["price"]}).status_code == 400
    assert _client(None).post("/api/membership/survey", json={"kind": "cancel", "reasons": ["price"]}).status_code == 401
    assert c.get("/api/membership/survey/stats").status_code == 403
    d = c.get("/api/membership/survey/stats?key=k").json()
    assert d["subscribe"] == {"analysis": 1, "charts": 1} and d["cancel"] == {"price": 1}
    assert d["features"] == {"runAnalysis": 1} and d["notes"][0]["note"] == "有點貴"
    assert d["labels"]["cancel"]["price"] == "太貴了"
    assert c.post("/api/membership/survey", json={"kind": "pose", "reasons": ["inaccurate", "depth"], "feature": "squat"}).status_code == 200
    d2 = c.get("/api/membership/survey/stats?key=k").json()
    assert d2["pose"] == {"inaccurate": 1, "depth": 1} and d2["pose_exercises"] == {"squat": 1}
    assert "會員與訂閱原因" in c.get("/api/membership/survey/dashboard").text


def test_account_delete_removes_surveys():
    membership_repo.add_survey("u9", kind="cancel", reasons=["price"])
    membership_repo.delete_membership("u9")
    with SessionLocal() as db:
        assert db.query(MembershipSurvey).filter(MembershipSurvey.user_id == "u9").count() == 0
