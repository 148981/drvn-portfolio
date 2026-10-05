"""owner_guard_middleware 的路徑規則：私人資料擋住，公開動作不能被誤擋。

真實事故：r"^/api/nutrition/(?:sql/)?[^/]+/(?P<uid>[^/]+)" 把 /api/nutrition/sql/search
的 "search" 當成 user_id → 食物搜尋、記一餐、設定目標在正式環境一律 401/403。
"""
import re

import main


def _match(path):
    for pat in main._OWNER_ONLY_PATTERNS:
        m = pat.match(path)
        if m:
            return m.group("uid")
    return None


def test_public_nutrition_actions_are_not_owner_guarded():
    for path in (
        "/api/nutrition/sql/search",
        "/api/nutrition/sql/log",
        "/api/nutrition/sql/targets",
        "/api/nutrition/meal",
        "/api/nutrition/meal/123",
        "/api/nutrition/sql/meal/123",
    ):
        assert _match(path) is None, path


def test_private_nutrition_paths_still_guarded():
    assert _match("/api/nutrition/sql/daily/u1") == "u1"
    assert _match("/api/nutrition/sql/history/u1") == "u1"
    assert _match("/api/nutrition/sql/targets/u1") == "u1"
    assert _match("/api/nutrition/sql/recent-entries/u1") == "u1"
    assert _match("/api/nutrition/daily/u1") == "u1"
    assert _match("/api/nutrition/recent/u1/雞腿") == "u1"
    assert _match("/api/nutrition/meals/u1/2026-09-28") == "u1"
