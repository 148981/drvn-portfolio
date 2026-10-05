"""
社群內容（App Store 1.2）：過濾髒話、檢舉、封鎖、3 人檢舉自動先藏、管理員處理。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_moderation_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api_moderation as mod
from core.db import SessionLocal, init_db
from core.models_moderation import ContentReport, UserBlock

init_db()


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    with SessionLocal() as db:
        db.query(ContentReport).delete()
        db.query(UserBlock).delete()
        db.commit()
    # 封鎖會連帶解除好友／追蹤（寫 JSON 名冊）—— 測試裡只記錄呼叫，不碰真資料檔
    severed = []
    monkeypatch.setattr(mod, "_sever_social_ties", lambda a, b: severed.append((a, b)))
    mod._test_severed = severed
    yield


def client_as(user_id):
    app = FastAPI()

    @app.middleware("http")
    async def _uid(request: Request, call_next):
        request.state.user_id = user_id
        return await call_next(request)

    app.include_router(mod.router)
    return TestClient(app)


def test_filter_masks_bad_words():
    assert mod.filter_text("今天練腿 幹你娘 好累") == "今天練腿 ＊＊＊ 好累"
    assert mod.filter_text("FUCK this") == "＊＊＊＊ this"
    assert mod.filter_text("深蹲 100kg") == "深蹲 100kg"


def test_report_hides_for_reporter_only():
    c = client_as("a")
    assert c.post("/api/moderation/report", json={"target_type": "post", "target_id": "p1", "reason": "spam"}).status_code == 200
    posts = [{"activity_id": "p1", "user_id": "x"}, {"activity_id": "p2", "user_id": "x"}]
    assert [p["activity_id"] for p in mod.visible_activities(posts, "a")] == ["p2"]
    assert len(mod.visible_activities(posts, "b")) == 2
    assert c.post("/api/moderation/report", json={"target_type": "post", "target_id": "p1", "reason": "nope"}).status_code == 400
    assert client_as(None).post("/api/moderation/report", json={"target_type": "post", "target_id": "p1", "reason": "spam"}).status_code == 401


def test_three_reporters_hide_for_everyone():
    for u in ("r1", "r2", "r3"):
        client_as(u).post("/api/moderation/report", json={"target_type": "comment", "target_id": "c9", "reason": "harassment"})
    comments = [{"comment_id": "c9", "user_id": "x"}, {"comment_id": "c1", "user_id": "x"}]
    assert [c["comment_id"] for c in mod.visible_comments(comments, "someone")] == ["c1"]


def test_block_is_mutual():
    client_as("a").post("/api/moderation/block", json={"user_id": "b"})
    posts = [{"activity_id": "1", "user_id": "b"}, {"activity_id": "2", "user_id": "a"}]
    assert [p["activity_id"] for p in mod.visible_activities(posts, "a")] == ["2"]
    assert [p["activity_id"] for p in mod.visible_activities(posts, "b")] == ["1"]
    assert client_as("a").get("/api/moderation/blocks").json()["blocked"] == ["b"]
    client_as("a").delete("/api/moderation/block/b")
    assert len(mod.visible_activities(posts, "a")) == 2
    assert client_as("a").post("/api/moderation/block", json={"user_id": "a"}).status_code == 400


def test_admin_resolve(monkeypatch):
    monkeypatch.setenv("ADMIN_KEY", "k")
    monkeypatch.setattr(mod, "_remove_content", lambda t, i: True)
    client_as("a").post("/api/moderation/report", json={"target_type": "post", "target_id": "p5", "reason": "sexual", "snapshot": "內文"})
    c = client_as(None)
    assert c.get("/api/moderation/reports").status_code == 403
    reps = c.get("/api/moderation/reports?key=k").json()["reports"]
    assert len(reps) == 1 and reps[0]["snapshot"] == "內文"
    r = c.post(f"/api/moderation/reports/{reps[0]['id']}/resolve?key=k", json={"action": "remove"}).json()
    assert r["removed"] is True
    assert c.get("/api/moderation/reports?key=k").json()["reports"] == []
    assert mod.visible_activities([{"activity_id": "p5", "user_id": "x"}], "anyone") == []


def test_account_purge():
    client_as("a").post("/api/moderation/block", json={"user_id": "b"})
    client_as("a").post("/api/moderation/report", json={"target_type": "post", "target_id": "p", "reason": "spam"})
    assert mod.purge_user_moderation("a") == 2


def test_block_severs_ties_and_lists_names():
    client_as("a").post("/api/moderation/block", json={"user_id": "b"})
    assert mod._test_severed == [("a", "b")]
    body = client_as("a").get("/api/moderation/blocks").json()
    assert body["blocked"] == ["b"] and body["users"][0]["user_id"] == "b"


def test_club_message_report_and_admin_key(monkeypatch):
    c = client_as("a")
    assert c.post("/api/moderation/report", json={"target_type": "club_message", "target_id": "RUN-0001:m1", "reason": "other"}).status_code == 200
    monkeypatch.setenv("ADMIN_KEY", "k")
    anon = client_as(None)
    assert anon.post("/api/moderation/reports/1/resolve?key=wrong", json={"action": "remove"}).status_code == 403
    assert anon.post("/api/moderation/reports/1/resolve", json={"action": "remove"}).status_code == 403
    monkeypatch.delenv("ADMIN_KEY")
    assert anon.get("/api/moderation/reports?key=").status_code == 403
