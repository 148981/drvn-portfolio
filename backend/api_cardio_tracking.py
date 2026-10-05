"""
api_cardio_tracking.py — 有氧基本紀錄 (save / runs / stats / today-summary) 路由
（Phase 1 從 main.py 抽出；行為不變，改為獨立 APIRouter）

對應前綴：/api/cardio/save、/api/cardio/{user_id}/runs|stats、/api/cardio/today-summary
依賴：core.cardio_tracker（+ handler 內 local import：cardio_storage / workout_history / dateutil / challenges）
"""
import os
from auth_guard import owner_guard
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends

# 與 main.py 一致：DATA_DIR 指向專案根層 data/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

router = APIRouter(tags=["cardio-tracking"])


# ==================== Cardio Tracking APIs ====================
from core.cardio_tracker import (
    CardioRunData,
    save_cardio_run,
    get_user_cardio_runs,
    get_cardio_stats_summary
)

@router.post("/api/cardio/save")
async def save_cardio(data: CardioRunData):
    """Save a completed cardio run and update challenges"""
    try:
        # 1. Save run
        result = save_cardio_run(data, DATA_DIR)
        
        # 2. Update challenges
        try:
            from core import challenges
            
            # Prepare activity data for challenges
            # Logic: If distance > 100, assume it's meters and convert to km. Otherwise assume km.
            distance_km = data.stats.distance / 1000.0 if data.stats.distance > 100 else data.stats.distance
            
            activity_data = {
                "activity_type": "running",  # Explicitly set to running as it's a cardio run
                "distance_km": distance_km,
                "duration_minutes": data.stats.duration / 60,
                "date": data.date,
                "calories": data.stats.calories
            }
            
            print(f"📦 [Challenge Sync] Processing cardio for user {data.user_id}")
            
            # Update all active challenges for this user using centralized method
            updates = challenges.challenge_manager.process_active_challenges(
                data.user_id,
                activity_data
            )
            
            # Add challenge updates to response for frontend feedback
            result["challenge_updates"] = updates
            
        except Exception as e:
            print(f"[ERROR] FATAL ERROR in Challenge Update: {e}")
            import traceback
            traceback.print_exc()
            # Don't fail the save if challenges fail
            
        return result
    except Exception as e:
        print(f"Error saving cardio run: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/cardio/{user_id}/runs", dependencies=[Depends(owner_guard)])
async def get_cardio_runs(user_id: str, limit: int = 20):
    """Get user's cardio run history"""
    try:
        runs = get_user_cardio_runs(user_id, DATA_DIR, limit)
        return {"runs": runs}
    except Exception as e:
        print(f"Error getting cardio runs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/cardio/{user_id}/stats", dependencies=[Depends(owner_guard)])
async def get_cardio_summary(user_id: str):
    """Get user's cardio statistics summary"""
    try:
        stats = get_cardio_stats_summary(user_id, DATA_DIR)
        return stats
    except Exception as e:
        print(f"Error getting cardio stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import Query

@router.get("/api/cardio/today-summary/{user_id}", dependencies=[Depends(owner_guard)])
async def get_today_workout_summary(
    user_id: str, 
    date: str = Query(None, description="Client local date YYYY-MM-DD")
):
    """
    獲取今日運動摘要。
    強制使用前端傳來的 'date' 來過濾數據，解決時區問題。
    """
    try:
        from core.cardio_storage import get_user_sessions
        from core.workout_history import get_user_workout_history
        from dateutil import parser

        # 1. 確定日期基準 (如果前端沒傳，才用後端時間)
        target_date_str = date if date else datetime.now().strftime("%Y-%m-%d")
        print(f"🔍 [Backend] Fetching summary for User: {user_id}, Date: {target_date_str}")

        # Helper: Robust Timezone-Aware Date Check
        def is_target_date(timestamp_str):
            if not timestamp_str: return False
            try:
                # 簡單且穩健的字符串匹配：如果前10個字符（YYYY-MM-DD）匹配即可
                # 這避免了複雜的時區轉換問題，假設前端和後端都在同一天
                return str(timestamp_str).startswith(target_date_str)
            except Exception:
                return False

        # 2. 獲取所有數據
        cardio_sessions = get_user_sessions(user_id, limit=50)
        strength_sessions = get_user_workout_history(user_id, limit=50)

        print(f"DEBUG: Raw Cardio Sessions: {len(cardio_sessions)}, Raw Strength Sessions: {len(strength_sessions)}")
        if cardio_sessions:
            print(f"DEBUG: First Cardio Session Date: {cardio_sessions[0].get('created_at')}")

        # 3. 過濾出「目標日期」的數據
        print(f"!!! API EXECUTING (Updated) - Target Date: {target_date_str}")
        
        today_cardio = []
        for s in cardio_sessions:
            ts = s.get('created_at', '')
            if is_target_date(ts):
                today_cardio.append(s)
                
        today_strength = []
        for s in strength_sessions:
            ts = s.get('timestamp', '')
            if is_target_date(ts):
                today_strength.append(s)

        print(f"[SUCCESS] Found {len(today_cardio)} cardio & {len(today_strength)} strength sessions for {target_date_str}.")

        # 4. 計算總消耗
        cardio_burn = sum(s.get('metrics', {}).get('calories', 0) or 0 for s in today_cardio)
        strength_burn = sum(s.get('calories_est', 0) or s.get('calories', 0) or 0 for s in today_strength)
        total_burn = int(cardio_burn + strength_burn)

        # 5. 判斷今日「整體」訓練類型 (用於 Macros 卡片)
        has_run = len(today_cardio) > 0
        has_strength = len(today_strength) > 0
        
        if has_run and has_strength: workout_type = 'mixed'
        elif has_run: workout_type = 'run'
        elif has_strength: workout_type = 'strength'
        else: workout_type = 'rest'

        # 6. 找出「絕對最後一次」運動 (用於 Recovery 卡片)
        # 這裡我們要跨越日期限制，找出該用戶「最新」的一筆，判斷是否剛結束
        # 為什麼？因為可能跨夜運動 (23:50 ~ 00:10)
        
        all_recent = []
        # 取最近 5 筆即可
        raw_cardio = cardio_sessions[:5]
        raw_strength = strength_sessions[:5]

        for s in raw_cardio:
            all_recent.append({
                "timestamp": s.get('created_at'),
                "calories": s.get('metrics', {}).get('calories', 0),
                "type": 'run',
                "duration": s.get('metrics', {}).get('duration', 0)
            })
        for s in raw_strength:
            all_recent.append({
                "timestamp": s.get('timestamp'),
                "calories": s.get('calories_est', 0) or s.get('calories', 0),
                "type": 'strength',
                "duration": s.get('duration_seconds', 0)
            })

        last_session = None
        if all_recent:
            # 依時間倒序 (最新的在第一個)
            all_recent.sort(key=lambda x: parser.parse(x['timestamp']), reverse=True)
            last_session = all_recent[0]
            
            # Debug: 印出最後一筆的時間
            print(f"🕒 Latest session found: {last_session['type']} at {last_session['timestamp']}")

        return {
            "total_burn": total_burn,
            "workout_type": workout_type, # 這是「整天」的類型
            "last_session": last_session  # 這是「最新」的一筆 (用於判斷是否剛結束)
        }

    except Exception as e:
        print(f"[ERROR] Error in summary: {e}")
        return {"total_burn": 0, "workout_type": "rest", "last_session": None}
        return {
            "total_burn": 0,
            "workout_type": "rest",
            "session_count": 0,
            "last_session": None
        }

# ==================== PR Tracking APIs ====================
