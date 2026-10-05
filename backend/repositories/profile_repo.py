"""
repositories/profile_repo.py — 使用者個人檔案 倉儲層
====================================================

取代單一 user_profiles.json（{user_id: profile}）。coach_profile.py 的
load/save 原語改走這裡，其餘（get_user_profile、save_user_profile…）自動沿用。

另提供 purge_user_everywhere()：帳號刪除時，一併清掉該使用者在所有已遷移
資料表的資料（避免刪帳號後資料殘留）。
"""
from __future__ import annotations

from typing import Dict, Optional

from sqlalchemy.orm.attributes import flag_modified

from core.db import SessionLocal, init_db
from core.models_health import UserProfile

init_db()


def get_all() -> Dict[str, dict]:
    """回傳 {user_id: profile}，與舊 load_user_profiles 形狀一致。"""
    with SessionLocal() as db:
        return {r.user_id: dict(r.payload or {}) for r in db.query(UserProfile).all()}


def get(user_id: str) -> Optional[dict]:
    with SessionLocal() as db:
        r = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        return dict(r.payload or {}) if r else None


def upsert(user_id: str, profile: dict) -> dict:
    with SessionLocal() as db:
        r = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if r is None:
            r = UserProfile(user_id=user_id)
            db.add(r)
        r.payload = profile or {}
        flag_modified(r, "payload")
        db.commit()
        return profile or {}


def upsert_many(profiles: Dict[str, dict]) -> None:
    """把整份 {user_id: profile} 逐筆 upsert（不刪除未列出的，避免誤刪他人）。"""
    with SessionLocal() as db:
        existing = {r.user_id: r for r in db.query(UserProfile).all()}
        for uid, profile in (profiles or {}).items():
            r = existing.get(uid)
            if r is None:
                r = UserProfile(user_id=uid)
                db.add(r)
            r.payload = profile or {}
            flag_modified(r, "payload")
        db.commit()


def delete(user_id: str) -> bool:
    with SessionLocal() as db:
        r = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not r:
            return False
        db.delete(r)
        db.commit()
        return True


def purge_user_everywhere(user_id: str) -> dict:
    """帳號刪除：清掉該使用者在所有已遷移資料表的資料。回傳各表刪除筆數。"""
    from core.models_training import StrengthRecord, WorkoutSession, CardioSession, WorkoutPlan, UserPR
    from core.models_social import LeaderboardEntry, SonicLibrary, PRRankEntry
    from core.models_health import InBodyRecord, UserProfile as _UP
    from core.models_misc import UserBlob, TelemetryEvent

    deleted = {}
    with SessionLocal() as db:
        for name, model, col in [
            ("user_profiles", _UP, _UP.user_id),
            ("strength_records", StrengthRecord, StrengthRecord.user_id),
            ("workout_sessions", WorkoutSession, WorkoutSession.user_id),
            ("cardio_sessions", CardioSession, CardioSession.user_id),
            ("workout_plans", WorkoutPlan, WorkoutPlan.user_id),
            ("user_prs", UserPR, UserPR.user_id),
            ("inbody_records", InBodyRecord, InBodyRecord.user_id),
            ("leaderboard_entries", LeaderboardEntry, LeaderboardEntry.user_id),
            ("pr_rank_entries", PRRankEntry, PRRankEntry.user_id),   # PR 排名（公開排行）也要跟著帳號走
            ("sonic_libraries", SonicLibrary, SonicLibrary.user_id),
            # 通用資料格與功能使用／錯誤紀錄也跟著帳號走（隱私政策寫「刪帳號＝全部刪除」）
            ("user_blobs", UserBlob, UserBlob.user_id),
            ("telemetry_events", TelemetryEvent, TelemetryEvent.user_id),
        ]:
            deleted[name] = db.query(model).filter(col == user_id).delete()
        db.commit()

    # 會員訂閱紀錄
    try:
        from repositories import membership_repo
        deleted["user_memberships"] = membership_repo.delete_membership(user_id)
    except Exception as _e:
        deleted["membership_error"] = str(_e)

    # 社群檢舉與封鎖（他檢舉過的、他封鎖的、封鎖他的）
    try:
        from api_moderation import purge_user_moderation
        deleted["moderation"] = purge_user_moderation(user_id)
    except Exception as _e:
        deleted["moderation_error"] = str(_e)

    # 社群共用清單（activities/kudos/comments/friend_requests/friendships/blocks）
    try:
        from repositories import social_repo
        deleted["social"] = social_repo.purge_user(user_id)
    except Exception as _e:
        deleted["social_error"] = str(_e)
    return deleted
