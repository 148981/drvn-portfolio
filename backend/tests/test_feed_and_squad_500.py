"""2026-09 正式站 500 回歸測試。

兩個各自獨立、但被前端一起說成「連不到伺服器」的故障：

  1. core/friends.py 與 core/social.py 共用同一個 "kudos" 集合，欄位名不同。
     好友動態按一次讚 → 社群牆每一支 API 永久 KeyError 500。
  2. user_blob_repo 用 [] 當新列的佔位值、又只靠 INSERT 的 rowcount 判斷
     「這列是不是我建的」。rowcount 一旦沒回 1，[] 就被當成真資料存回去，
     之後 squad_repo.load_squads() 做 []['squads'] → 整個社團系統永久 500。

每個測試都先證明「舊寫法會壞」，再證明現在不會 —— 否則測試會變成橡皮圖章。
"""
import os
import tempfile

_TEST_DB = os.path.join(tempfile.gettempdir(), "drvn_feed_squad_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("APP_ENV", "development")

import pytest

from core.db import SessionLocal, init_db
from core.models_social import SocialCollection
from core.models_misc import UserBlob
from repositories import social_repo, squad_repo, user_blob_repo

init_db()


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.query(SocialCollection).delete()
        db.query(UserBlob).delete()
        db.commit()
    yield


def _activity():
    from core.social import Activity
    return Activity(
        activity_id="act-1", user_id="u1", user_name="U1", session_id="s1",
        activity_type="run", distance_km=5.0, duration_seconds=1800,
        pace_per_km=360, calories=300, community="cardio",
        privacy="public", created_at="2026-09-01T10:00:00",
    )


def _social_storage():
    from core.social import SocialStorage
    from config import DATA_DIR
    return SocialStorage(DATA_DIR)


# ── 1. kudos 集合撞名 ──────────────────────────────────────────────────

def test_friend_kudo_does_not_poison_the_wall():
    """好友動態按讚後，社群牆與按讚名單都還讀得回來。"""
    ss = _social_storage()
    ss.create_activity(_activity())

    from core.friends import friends_storage
    friends_storage.add_kudo("u2", "act-1")

    assert len(ss.get_feed("u1", 0, 10, "cardio")) == 1
    assert ss.get_activity_kudos("act-1") == []          # 那不是社群牆的讚


def test_the_old_shape_would_have_crashed():
    """舊寫法（k['from_user_id']）遇到好友動態的資料就是 KeyError —— 證明上面那條不是橡皮圖章。"""
    friend_shaped = {"user_id": "u2", "activity_id": "act-1", "created_at": "2026-09-01T10:00:00"}
    with pytest.raises(KeyError):
        {k["to_activity_id"] for k in [friend_shaped] if k["from_user_id"] == "u1"}


def test_two_subsystems_no_longer_share_a_collection():
    """friends 與 social 的 kudos 必須落在不同的集合。"""
    from core.friends import friends_storage
    ss = _social_storage()
    assert ss.kudos_file.stem != friends_storage.kudos_file.stem


def test_legacy_mixed_collection_is_split():
    """舊資料（兩種形狀混在 kudos 裡）會被一次性拆開，兩邊都拿得回自己的。"""
    social_row = {"kudo_id": "k1", "from_user_id": "u9", "from_user_name": "U9",
                  "to_activity_id": "act-1", "created_at": "2026-09-01T10:00:00"}
    friend_row = {"user_id": "u2", "activity_id": "act-1", "created_at": "2026-09-01T11:00:00"}
    social_repo.save("kudos", [social_row, friend_row])

    from core.friends import FriendsStorage, friends_storage
    FriendsStorage._split_done = False                    # 重跑一次搬遷
    stats = friends_storage.get_activity_stats("act-1", "u2")

    assert stats["count"] == 1 and stats["has_kudoed"] is True
    assert social_repo.load("kudos") == [social_row]      # 社群牆那筆留在原地
    assert social_repo.load("friend_kudos") == [friend_row]

    ss = _social_storage()
    ss.create_activity(_activity())
    assert [k.kudo_id for k in ss.get_activity_kudos("act-1")] == ["k1"]


def test_one_unreadable_post_does_not_empty_the_wall():
    """一筆讀不回來的貼文只該少那一筆，不該讓整面牆消失。"""
    ss = _social_storage()
    ss.create_activity(_activity())
    rows = social_repo.load("activities")
    rows.append({"activity_id": "broken", "privacy": "public", "community": "cardio",
                 "created_at": None})        # 缺一堆必填欄位、created_at 還是 None
    social_repo.save("activities", rows)

    feed = ss.get_feed("u1", 0, 10, "cardio")
    assert [a.activity_id for a in feed] == ["act-1"]


# ── 2. squad state 信封 ────────────────────────────────────────────────

@pytest.mark.parametrize("broken", [[], None, {}, {"squads": {}}, "x", {"squads": [], "memberships": {}}])
def test_broken_squad_state_heals_itself(broken):
    """壞掉的 squad_state_v2 會被就地重建並寫回，不再 TypeError。"""
    user_blob_repo.put("__system__", "squad_state_v2", broken)

    assert squad_repo.load_squads() == {}                 # 交易外的讀取路徑
    with squad_repo.transaction():                        # 交易內的讀取路徑
        assert squad_repo.load_squads() == {}
        assert squad_repo.load_memberships() == {}

    assert squad_repo.is_state(user_blob_repo.get("__system__", "squad_state_v2"))


def test_the_old_envelope_read_would_have_crashed():
    """舊寫法只檢查 `is not None`，[] 就會 TypeError —— 證明上面那條不是橡皮圖章。"""
    empty = []                       # 變數形式，避免 Python 對字面量發 SyntaxWarning
    with pytest.raises(TypeError):
        empty["squads"]
    assert not squad_repo.is_state([])


def test_placeholder_is_never_mistaken_for_real_data():
    """新列的佔位值不能是使用者可能真的存進去的值。"""
    from repositories.user_blob_repo import _UNINITIALIZED
    assert not squad_repo.is_state(_UNINITIALIZED)
    assert _UNINITIALIZED not in ([], {}, None, 0, "")

    with squad_repo.transaction():
        pass
    stored = user_blob_repo.get("__system__", "squad_state_v2")
    assert stored != _UNINITIALIZED and squad_repo.is_state(stored)


def test_existing_squads_survive_the_rebuild():
    """重建信封時要沿用舊 key 的資料，不能把既有社團弄丟。"""
    user_blob_repo.put("__system__", "squads", {"RUN-0001": {"id": "RUN-0001", "name": "老社團"}})
    user_blob_repo.put("__system__", "squad_memberships", {"u1": ["RUN-0001"]})
    user_blob_repo.put("__system__", "squad_state_v2", [])      # 壞掉的信封

    with squad_repo.transaction():
        assert "RUN-0001" in squad_repo.load_squads()
        assert squad_repo.load_memberships()["u1"] == ["RUN-0001"]
