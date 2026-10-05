"""
Action-First Dashboard API Routes
支持新的 Action-First Dashboard 所需的後端 API

正規 FastAPI 模組：以 APIRouter 匯出，由 main.py 用
`app.include_router(routes_action_dashboard.router)` 載入
（已取代舊的 exec() 載入方式，可被靜態分析/測試正常解析）。
"""

import os as _os
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

import core.workout_history as workout_history
import core.cardio_storage as cardio_storage

router = APIRouter(tags=["action-dashboard"])

# 資料目錄：本檔由 exec() 載入，不能依賴 __file__；改用 workout_history 的權威 DATA_DIR
try:
    _DATA_DIR = workout_history.DATA_DIR
except Exception:
    _DATA_DIR = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "data")) \
        if "__file__" in globals() else _os.path.abspath("data")


# ----------------------------------------------------------------------------
# 共用工具：把任意 session 的時間欄位解析成 naive datetime
# ----------------------------------------------------------------------------
def _parse_session_time(raw):
    """接受 ISO 字串，回傳 naive datetime；失敗回 None。"""
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _load_combined_sessions(user_id, days_back=120):
    """合併真實的肌力 + 有氧 session，回傳 [(dt, session, is_cardio)] 由近到遠。"""
    cutoff = datetime.now() - timedelta(days=days_back)
    out = []

    try:
        strength = workout_history.get_user_workout_history(user_id) or []
    except Exception:
        strength = []
    for s in strength:
        dt = _parse_session_time(s.get("timestamp"))
        if dt and dt >= cutoff:
            out.append((dt, s, False))

    try:
        cardio = cardio_storage.get_user_sessions(user_id, limit=500) or []
    except Exception:
        cardio = []
    for s in cardio:
        dt = _parse_session_time(s.get("created_at") or s.get("completed_at") or s.get("timestamp"))
        if dt and dt >= cutoff:
            out.append((dt, s, True))

    out.sort(key=lambda x: x[0], reverse=True)
    return out


# ============================================================================
# API 3: 取得本週進度
# ============================================================================

@router.get("/api/user/{user_id}/week-progress")
async def get_week_progress(user_id: str):
    """
    取得用戶本週訓練進度
    
    Returns:
        completed: 本週已完成次數
        target: 本週目標次數
        streak: 連續打卡天數
    """
    try:
        now = datetime.now()
        sessions = _load_combined_sessions(user_id)  # 真實肌力 + 有氧

        # --- 本週已完成次數：以「不重複的訓練日」計，避免同日多筆灌水 ---
        # 本週一 00:00 為界（weekday(): Mon=0）
        week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        week_days = set()
        all_days = set()
        for dt, sess, is_cardio in sessions:
            day = dt.date()
            all_days.add(day)
            if dt >= week_start:
                week_days.add(day)
        completed = len(week_days)

        # --- 每週目標：優先讀使用者設定，否則用合理預設 4 ---
        target = 4
        try:
            import json
            profiles_path = _os.path.join(_DATA_DIR, "user_profiles.json")
            if _os.path.exists(profiles_path):
                with open(profiles_path, encoding="utf-8") as f:
                    profiles = json.load(f)
                user_rec = profiles.get(user_id, {}) if isinstance(profiles, dict) else {}
                t = user_rec.get("weekly_goal") or user_rec.get("days_per_week") or user_rec.get("training_days")
                if t:
                    target = int(t)
        except Exception as goal_err:
            print(f"[week-progress] target read failed: {goal_err}")

        # --- 連續打卡天數：從今天（或最近訓練日）往回數連續日 ---
        streak = 0
        if all_days:
            cursor = now.date()
            # 若今天還沒練，但昨天有練，streak 仍從昨天起算（允許今天尚未訓練）
            if cursor not in all_days and (cursor - timedelta(days=1)) in all_days:
                cursor = cursor - timedelta(days=1)
            while cursor in all_days:
                streak += 1
                cursor = cursor - timedelta(days=1)

        return {
            "completed": completed,
            "target": target,
            "streak": streak,
            "completion_rate": int((completed / target) * 100) if target > 0 else 0,
            "source": "workout_history",
        }
        
    except Exception as e:
        print(f"Error getting week progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))
