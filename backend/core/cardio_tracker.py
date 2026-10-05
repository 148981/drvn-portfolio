"""
Cardio Running Data Storage and Retrieval
保存跑步路徑和數據
"""
from typing import Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import os

class RoutePoint(BaseModel):
    lat: float
    lng: float
    timestamp: int
    altitude: float = 0
    speed: float = 0

class CardioStats(BaseModel):
    distance: float        # km
    duration: int          # seconds
    pace: float           # min/km
    elevation: float      # meters
    calories: int
    avgHeartRate: Optional[int] = None
    currentSpeed: float = 0

class CardioRunData(BaseModel):
    user_id: str
    run_id: str
    date: str
    route: List[RoutePoint]
    stats: CardioStats
    mapStyle: str = 'default'
    mood: Optional[str] = None
    photo_url: Optional[str] = None
    hashtags: List[str] = []

def save_cardio_run(data: CardioRunData, data_dir: str) -> Dict:
    """Save a completed cardio run.

    Phase 2：改為寫入 cardio_storage（已走 DB），不再寫
    data/cardio_runs/{user_id}_runs.json。介面 / 回傳形狀維持不變，
    上層 api_cardio_tracking.py 不用改。
    data_dir 參數保留以相容呼叫端簽名（DB 路徑由 config 決定，這裡不再使用）。
    """
    try:
        from core import cardio_storage

        run_entry = data.dict()
        stats = run_entry.get("stats") or {}

        # 對齊 cardio_storage 的 session 形狀：
        #   metrics 為主要分析欄位；同時保留 stats 供舊讀取邏輯相容。
        session_payload = {
            "run_id":     data.run_id,
            "date":       data.date,
            "created_at": datetime.now().isoformat(),
            "route":      run_entry.get("route", []),
            "metrics":    stats,     # DB 端分析統一讀 metrics
            "stats":      stats,     # 相容 get_cardio_stats_summary 讀 run['stats']
            "mapStyle":   run_entry.get("mapStyle", "default"),
            "mood":       run_entry.get("mood"),
            "photo_url":  run_entry.get("photo_url"),
            "hashtags":   run_entry.get("hashtags", []),
            "type":       "running",
        }

        session_id = cardio_storage.create_session(data.user_id, session_payload)

        return {
            "success": True,
            "run_id": data.run_id,
            "session_id": session_id,
            "total_runs": cardio_storage_count(data.user_id),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


def cardio_storage_count(user_id: str) -> int:
    """目前該使用者在 DB 內的有氧 session 筆數（取代舊的 len(runs)）。"""
    try:
        from core import cardio_storage
        return len(cardio_storage.load_user_sessions(user_id))
    except Exception:
        return 0

def get_user_cardio_runs(user_id: str, data_dir: str, limit: int = 20) -> List[Dict]:
    """Get user's cardio run history.

    Phase 2：統一從 cardio_storage（已走 DB）讀取，不再優先讀 legacy
    data/cardio_runs/{user_id}_runs.json。data_dir 保留以相容呼叫端簽名。
    """
    try:
        from core import cardio_storage
        sessions_dict = cardio_storage.load_user_sessions(user_id)
        if not sessions_dict:
            return []

        # Transform session dict → list of run-like dicts the dashboard expects
        runs = []
        for session in sessions_dict.values():
            metrics = session.get("metrics") or session.get("stats") or {}
            distance_km = (
                metrics.get("distance_km")
                or metrics.get("distance")
                or 0
            )
            calories = metrics.get("calories") or 0
            pace = metrics.get("avgPace") or metrics.get("pace") or metrics.get("pace_per_km") or 0
            duration = metrics.get("duration") or metrics.get("duration_seconds") or 0
            date = session.get("date") or session.get("created_at") or ""
            runs.append({
                "run_id":   session.get("run_id") or session.get("session_id", ""),
                "date":     date,
                "timestamp": date,
                "distance": distance_km,
                "calories": calories,
                "pace":     pace,
                "duration": duration,
                "metrics":  metrics,
                # 相容 get_cardio_stats_summary 讀 run['stats'][...]
                "stats": {
                    "distance": distance_km,
                    "duration": duration,
                    "pace":     pace,
                    "calories": calories,
                },
            })

        # Sort newest first, then trim
        runs.sort(key=lambda r: r["date"], reverse=True)
        return runs[:limit]

    except Exception as e:
        print(f"Error getting cardio runs: {e}")
        return []

def get_cardio_stats_summary(user_id: str, data_dir: str) -> Dict:
    """Get summary statistics of user's running"""
    try:
        runs = get_user_cardio_runs(user_id, data_dir, limit=1000)
        
        if not runs:
            return {
                "total_runs": 0,
                "total_distance": 0,
                "total_duration": 0,
                "total_calories": 0,
                "avg_pace": 0,
                "best_pace": 0,
                "longest_run": 0
            }
        
        total_distance = sum(run['stats']['distance'] for run in runs)
        total_duration = sum(run['stats']['duration'] for run in runs)
        total_calories = sum(run['stats']['calories'] for run in runs)
        
        paces = [run['stats']['pace'] for run in runs if run['stats']['pace'] > 0]
        avg_pace = sum(paces) / len(paces) if paces else 0
        best_pace = min(paces) if paces else 0
        
        distances = [run['stats']['distance'] for run in runs]
        longest_run = max(distances) if distances else 0
        
        return {
            "total_runs": len(runs),
            "total_distance": round(total_distance, 2),
            "total_duration": total_duration,
            "total_calories": total_calories,
            "avg_pace": round(avg_pace, 2),
            "best_pace": round(best_pace, 2),
            "longest_run": round(longest_run, 2)
        }
    except Exception as e:
        print(f"Error getting cardio stats: {e}")
        return {}
