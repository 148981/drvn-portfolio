"""PR 名次：存值、算名次、方向（越快越好／越重越好）、擋掉不合理的值、只認 JWT 身分。"""
import os
import tempfile

os.environ.setdefault("DATABASE_URL", "sqlite:///" + os.path.join(tempfile.mkdtemp(), "t.db"))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import api_pr_rank  # noqa: E402

app = FastAPI()


@app.middleware("http")
async def fake_jwt(request: Request, call_next):
    request.state.user_id = request.headers.get("x-test-user")
    return await call_next(request)


app.include_router(api_pr_rank.router)
client = TestClient(app)


def post(uid, records):
    h = {"x-test-user": uid} if uid else {}
    return client.post("/api/pr-rank/submit", json={"records": records}, headers=h)


def test_requires_identity():
    assert post(None, [{"id": "fastest_5k", "value": 1500}]).status_code == 401


def test_rank_lower_better_and_gap():
    for i, t in enumerate([1500, 1600, 1700, 1800]):
        assert post(f"r{i}", [{"id": "fastest_5k", "value": t}]).status_code == 200
    r = post("me", [{"id": "fastest_5k", "value": 1650}]).json()["ranks"]["fastest_5k"]
    assert r["rank"] == 3 and r["total"] == 5
    assert r["next_value"] == 1600 and r["top_value"] == 1500
    assert r["lower_better"] is True and r["top_pct"] == 60


def test_rank_higher_better():
    for i, kg in enumerate([100, 140, 180]):
        post(f"s{i}", [{"id": "est_squat_1rm", "value": kg}])
    r = post("me2", [{"id": "est_squat_1rm", "value": 160}]).json()["ranks"]["est_squat_1rm"]
    assert r["rank"] == 2 and r["total"] == 4 and r["next_value"] == 180


def test_update_replaces_own_value_not_duplicate():
    post("dup", [{"id": "total_km", "value": 10}])
    r = post("dup", [{"id": "total_km", "value": 20}]).json()["ranks"]["total_km"]
    assert r["total"] == 1 and r["rank"] == 1


def test_implausible_values_are_dropped():
    r = post("cheat", [{"id": "fastest_5k", "value": 180}, {"id": "fastest_1k", "value": -3}]).json()
    assert r["ranks"] == {}
