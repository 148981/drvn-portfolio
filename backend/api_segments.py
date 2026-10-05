"""
api_segments.py — Strava 風格路段(Segments)路由
（Phase 1 從 main.py 抽出；行為不變，僅改為獨立 APIRouter）

對應前綴：/api/segments/*
依賴：segment_logic（SegmentStorage / SegmentMatcher / segment_manager / SegmentCreate）、
      core.cardio_storage（個人紀錄由真實有氧歷史計算）
"""
import os
import uuid
import time
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, Body

import segment_logic as segments
import core.cardio_storage as cardio_storage

# 與 main.py 一致：DATA_DIR 指向專案根層 data/（backend 的上一層）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

# 路段儲存 / 比對 單例（原本建立在 main.py，移入本模組）
segment_storage = segments.SegmentStorage(DATA_DIR)
segment_matcher = segments.SegmentMatcher()

router = APIRouter(tags=["segments"])


@router.get("/api/segments/{segment_id}/personal-record")
async def get_segment_personal_record(segment_id: str, user_id: str):
    """Compute a user's personal record for a segment from their cardio history.

    The PR is derived purely from real history: every cardio session the user
    saved that is tagged with this `segment_id` is scanned. Returns the best
    pace, fastest finish time, highest effort score (耗力分數) and attempt count.

    Effort score = a TRIMP-style physiological load index. When heart-rate
    data exists we use it; otherwise we fall back to a pace/duration estimate.
    Returns has_record=False when the user has never run this tagged route.
    """
    try:
        sessions = cardio_storage.get_user_sessions(user_id, limit=1000)

        # ── keep only sessions tagged with this segment ──
        runs = [s for s in sessions if s.get("segment_id") == segment_id]

        if not runs:
            return {
                "segment_id": segment_id,
                "user_id": user_id,
                "has_record": False,
                "attempts": 0,
                "best_pace_sec": None,
                "best_time_sec": None,
                "best_effort_score": None,
            }

        def _num(v, d=0):
            try:
                n = float(v)
                return n if n == n else d  # NaN guard
            except (TypeError, ValueError):
                return d

        def _effort_score(metrics):
            """TRIMP-style effort (耗力分數). HR-based when possible."""
            dur_min = _num(metrics.get("duration")) / 60.0
            if dur_min <= 0:
                return 0.0
            avg_hr = _num(metrics.get("avgHR") or metrics.get("avg_hr"))
            if avg_hr > 0:
                # Banister TRIMP — rest 60, max 190 as population defaults
                rest_hr, max_hr = 60.0, 190.0
                hr_ratio = max(0.0, min(1.0, (avg_hr - rest_hr) / (max_hr - rest_hr)))
                return round(dur_min * hr_ratio * 0.64 * (2.718281828 ** (1.92 * hr_ratio)), 1)
            # Fallback: pace-weighted load (faster pace -> higher intensity)
            pace_sec = _num(metrics.get("avgPace") or metrics.get("pace_per_km"))
            intensity = 1.0
            if pace_sec > 0:
                intensity = max(0.4, min(1.6, 360.0 / pace_sec))
            return round(dur_min * intensity * 6.0, 1)

        attempts = len(runs)
        best_pace = None      # sec/km — lower is better
        best_time = None      # sec — lower is better
        best_effort = None    # higher is better

        for s in runs:
            m = s.get("metrics") or {}
            pace = _num(m.get("avgPace") or m.get("pace_per_km"))
            time_sec = _num(m.get("duration") or m.get("duration_seconds"))
            effort = _effort_score(m)

            if pace > 0 and (best_pace is None or pace < best_pace):
                best_pace = pace
            if time_sec > 0 and (best_time is None or time_sec < best_time):
                best_time = time_sec
            if best_effort is None or effort > best_effort:
                best_effort = effort

        return {
            "segment_id": segment_id,
            "user_id": user_id,
            "has_record": True,
            "attempts": attempts,
            "best_pace_sec": best_pace,
            "best_time_sec": best_time,
            "best_effort_score": best_effort,
        }
    except Exception as e:
        print(f"Error computing segment PR: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/api/segments/create")
async def create_segment(req: segments.SegmentCreate):
    """Create a new segment"""
    import uuid
    from datetime import datetime
    
    segment_data = {
        "segment_id": str(uuid.uuid4()),
        **req.dict(),
        "created_at": datetime.now().isoformat(),
        "total_attempts": 0
    }
    
    saved_segment = segment_storage.save_segment(segment_data)
    return saved_segment

@router.get("/api/segments/nearby")
async def get_nearby_segments(lat: float, lng: float, radius: float = 5.0):
    """Get segments near a location
    
    Args:
        lat: Latitude
        lng: Longitude  
        radius: Search radius in kilometers (default 5km)
    """
    nearby = segment_storage.get_nearby_segments(lat, lng, radius)
    return {"segments": nearby, "count": len(nearby)}

@router.get("/api/segments/{segment_id}/leaderboard")
async def get_segment_leaderboard(segment_id: str, timeframe: str = "all"):
    """Get leaderboard for a segment
    
    Args:
        segment_id: Segment ID
        timeframe: 'all', 'week', 'month' (currently all timeframes return same data)
    """
    segment = segment_storage.get_segment(segment_id)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    efforts = segment_storage.get_segment_efforts(segment_id)
    
    # Group by user and get best time for each
    from collections import defaultdict
    user_best_times = defaultdict(lambda: float('inf'))
    user_efforts = {}
    
    for effort in efforts:
        user_id = effort['user_id']
        if effort['elapsed_time_seconds'] < user_best_times[user_id]:
            user_best_times[user_id] = effort['elapsed_time_seconds']
            user_efforts[user_id] = effort
    
    # Sort by time
    leaderboard = sorted(user_efforts.values(), key=lambda x: x['elapsed_time_seconds'])
    
    # Add rank
    for i, effort in enumerate(leaderboard):
        effort['rank'] = i + 1
        if i == 0:
            effort['is_kom'] = True  # King/Queen of Mountain
    
    return {
        "segment": segment,
        "leaderboard": leaderboard[:100],  # Top 100
        "total_attempts": segment.get('total_attempts', 0)
    }

@router.get("/api/segments/{segment_id}/my-efforts")
async def get_my_segment_efforts(segment_id: str, user_id: str):
    """Get user's efforts for a specific segment"""
    efforts = segment_storage.get_segment_efforts(segment_id, user_id)
    pr = segment_storage.get_user_pr(user_id, segment_id)
    
    return {
        "segment_id": segment_id,
        "user_id": user_id,
        "efforts": efforts,
        "personal_record": pr,
        "total_attempts": len(efforts)
    }

@router.get("/api/segments/by-session/{session_id}")
async def get_segment_results_for_session(session_id: str, user_id: str = None):
    """這次跑步（session）觸發了哪些賽段成果 — 給 Feed 的 RunCard badge 用。

    對該 session 的每個 effort，計算它在賽段排行榜上的當下名次、是否個人最佳(PR)、
    是否登頂(KOM/第一名)。無資料就回空陣列（不塞假資料）。
    """
    try:
        all_efforts = segment_storage._load_json(segment_storage.efforts_file)
    except Exception:
        all_efforts = []

    session_efforts = [e for e in all_efforts if e.get('session_id') == session_id]
    if user_id:
        session_efforts = [e for e in session_efforts if str(e.get('user_id')) == str(user_id)]

    results = []
    for eff in session_efforts:
        seg_id = eff.get('segment_id')
        segment = segment_storage.get_segment(seg_id)
        if not segment:
            continue

        seg_efforts = segment_storage.get_segment_efforts(seg_id)
        best = {}
        for se in seg_efforts:
            uid_i = se['user_id']
            if uid_i not in best or se['elapsed_time_seconds'] < best[uid_i]['elapsed_time_seconds']:
                best[uid_i] = se
        leaderboard = sorted(best.values(), key=lambda x: x['elapsed_time_seconds'])
        total_athletes = len(leaderboard)

        uid = eff.get('user_id')
        rank = next((i + 1 for i, se in enumerate(leaderboard) if se['user_id'] == uid), None)

        pr = segment_storage.get_user_pr(uid, seg_id)
        is_pr = bool(pr and eff.get('elapsed_time_seconds') == pr.get('best_time_seconds'))

        results.append({
            "segment_id": seg_id,
            "segment_name": segment.get('name', '未命名賽段'),
            "distance_meters": segment.get('distance_meters', 0),
            "elapsed_time_seconds": eff.get('elapsed_time_seconds'),
            "rank": rank,
            "total_athletes": total_athletes,
            "is_kom": rank == 1,
            "is_pr": is_pr,
        })

    results.sort(key=lambda r: (r['rank'] if r['rank'] else 9999))
    return {"session_id": session_id, "segment_results": results, "count": len(results)}

@router.delete("/api/segments/{segment_id}")
async def delete_segment(segment_id: str):
    """Delete a segment"""
    success = segment_storage.delete_segment(segment_id)
    if success:
        return {"success": True, "message": "Segment deleted"}
    else:
        raise HTTPException(status_code=404, detail="Segment not found")

@router.put("/api/segments/{segment_id}")
async def update_segment(segment_id: str, req: segments.SegmentCreate):
    """Update a segment"""
    # Exclude fields that shouldn't be updated or handle logic
    update_data = req.dict(exclude_unset=True)
    updated = segment_storage.update_segment(segment_id, update_data)
    if updated:
        return updated
    else:
        raise HTTPException(status_code=404, detail="Segment not found")

@router.post("/api/segments/detect")
async def detect_segments_in_route(req: dict):
    """Detect which segments were completed in a cardio session
    
    Body:
        gps_data: List of {lat, lng, timestamp} points
        user_id: User ID
        session_id: Session ID (for linking efforts)
    """
    gps_data = req.get('gps_data', [])
    user_id = req.get('user_id')
    session_id = req.get('session_id', str(uuid.uuid4()))
    
    if not gps_data or len(gps_data) < 2:
        return {"matched_segments": [], "message": "Insufficient GPS data"}
    
    # Get nearby segments (using center point of route)
    center_lat = sum(p['lat'] for p in gps_data) / len(gps_data)
    center_lng = sum(p['lng'] for p in gps_data) / len(gps_data)
    nearby_segments = segment_storage.get_nearby_segments(center_lat, center_lng, radius_km=10)
    
    if not nearby_segments:
        return {"matched_segments": [], "message": "No segments found nearby"}
    
    # Match route to segments
    matched = segment_matcher.match_route_to_segments(gps_data, nearby_segments)
    

@router.get("/api/segments/{segment_id}")
async def get_segment(segment_id: str):
    """Get segment details"""
    try:
        segment = segments.segment_manager.get_segment(segment_id)
        if not segment:
            raise HTTPException(status_code=404, detail="Segment not found")
        return segment
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting segment: {e}")
        raise HTTPException(status_code=500, detail=str(e))
