"""
api_cardio_sessions.py — 有氧 Session 儲存 / 查詢 / 分析 路由
（Phase 1 從 main.py 抽出；行為不變，改為獨立 APIRouter）

對應前綴：/api/cardio/session、/api/cardio/{user_id}/... insights/sessions/route/deep-analysis 等
依賴：core.cardio_storage（+ handler 內 local import：core.challenges 等）
"""
import os
from auth_guard import owner_guard
from typing import List, Optional
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse

import core.insights as insights
import core.challenges as challenges

# debug log 寫到 backend 目錄（與 main.py 一致）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

router = APIRouter(tags=["cardio-sessions"])


# ==================== Cardio Tracking Endpoints ====================
from core import cardio_storage

class CardioSessionRequest(BaseModel):
    user_id: str
    date: str
    route_data: List[dict]
    metrics: dict
    emotion: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    stream_data: Optional[dict] = None  # [RELOAD] Added for physiological analysis
    # ── Route-tag: which Segment Explorer route this run belongs to (null = free run) ──
    segment_id: Optional[str] = None
    segment_name: Optional[str] = None
    # 🟢 運動模式（跑步以外：cycling/trail_running/hiking/swimming/skiing）。預設 running。
    sport: Optional[str] = None
    sport_type: Optional[str] = None
    sport_label: Optional[str] = None
    sport_icon: Optional[str] = None
    has_elevation: Optional[bool] = None
    # 🌤️ 天氣（存檔當下）：給最新動態卡片顯示天氣/溫度。
    weather: Optional[dict] = None
    location_name: Optional[str] = None
    # 🤝 同跑者（前端自動偵測，時間+路線吻合；不限好友）
    companions: Optional[List[dict]] = None

    class Config:
        extra = "ignore"  # 容忍前端多送的欄位（如 sportType 駝峰）

@router.post("/api/cardio/session")
async def save_cardio_session(request: CardioSessionRequest):
    """Save a completed cardio tracking session and update challenges"""
    try:
        _session_data = {
            "date": request.date,
            "route_data": request.route_data,
            "metrics": request.metrics,
            "emotion": request.emotion,
            "photo_url": request.photo_url,
            "notes": request.notes,
            "stream_data": request.stream_data,  # [RELOAD] Pass stream_data
            # 🟢 運動類型：優先用前端送的 sport，沒送才預設 running。
            "type": request.sport or "running",
            "sport": request.sport or "running",
            "sport_type": request.sport_type,
            "sport_label": request.sport_label,
            "sport_icon": request.sport_icon,
            "has_elevation": request.has_elevation,
            # 🌤️ 天氣 / 地點（存檔當下）
            "weather": request.weather,
            "location_name": request.location_name,
            # ── Route-tag persisted alongside the session (null when free run) ──
            "segment_id": request.segment_id,
            "segment_name": request.segment_name,
            # 🤝 同跑者 — 跟 session 一起存，換裝置也看得到
            "companions": request.companions,
        }
        session_id = cardio_storage.create_session(
            user_id=request.user_id,
            session_data=_session_data,
        )

        # 🏅 存檔後計算本場破紀錄名次（金銀銅），把 pr_count/medals 寫回 metrics，
        #    之後列表讀取就不用逐場重算（O(n²)）。best-effort，失敗不影響存檔。
        try:
            medal_info = cardio_storage.compute_session_medals(request.user_id, session_id)
            all_sessions = cardio_storage.load_user_sessions(request.user_id)
            sess = all_sessions.get(session_id) if isinstance(all_sessions, dict) else None
            if sess is not None:
                sess.setdefault("metrics", {})
                sess["metrics"]["pr_count"] = medal_info.get("pr_count", 0)
                sess["metrics"]["medal_count"] = medal_info.get("medal_count", 0)
                # 🏅 明細也一起存：動態卡要顯示「破了什麼」（5K 24:10 / 最長距離…）
                sess["metrics"]["medals"] = medal_info.get("medals", [])
                cardio_storage.save_user_sessions(request.user_id, all_sessions)
        except Exception as _me:
            print(f"[medals] compute at save skipped: {_me}")

        # 🗄️ P0 雙寫過渡：除 JSON 檔外，也 best-effort 寫進 Postgres（持久、重新部署不掉）。
        #    純附加、包 try/except，DB 失敗絕不影響既有存檔流程。讀取暫時仍走 JSON。
        try:
            from repositories import cardio_session_repo
            cardio_session_repo.insert_raw(request.user_id, session_id, {**_session_data, "session_id": session_id})
        except Exception as _dbe:
            print(f"[cardio dual-write] DB insert skipped: {_dbe}")

        # --- CHALLENGE UPDATE LOGIC (Ported from save_cardio) ---
        challenge_updates = []
        try:
            from core import challenges
            import datetime
            
            def log_debug(msg):
                try:
                    with open(os.path.join(BASE_DIR, "debug_challenges.log"), "a", encoding="utf-8") as f:
                        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        f.write(f"[{ts}] {msg}\n")
                except:
                    pass

            # Extract metrics
            metrics = request.metrics or {}
            raw_dist = metrics.get('distance', 0)
            raw_dur = metrics.get('duration', 0)
            
            # --- DEBUG START ---
            log_debug(f"🔍 [Session Save] Checking Challenges for User: {request.user_id}")
            log_debug(f"👉 Input Stats - Dist: {raw_dist}, Dur: {raw_dur}, Calories: {metrics.get('calories', 0)}")
            print(f"🔍 [Session Save] Checking Challenges for User: {request.user_id}")
            print(f"👉 Input Stats - Dist: {raw_dist}, Dur: {raw_dur}")
            # --- DEBUG END ---
            
            # Prepare activity data for challenges
            # Logic: If distance > 100, assume it's meters and convert to km. Otherwise assume km.
            distance_km = raw_dist / 1000.0 if raw_dist > 100 else raw_dist
            duration_mins = raw_dur / 60.0 if raw_dur > 0 else 0
            
            activity_data = {
                "activity_type": "running",  # Explicitly set to running
                "distance_km": distance_km,
                "duration_minutes": duration_mins,
                "date": request.date,
                "calories": metrics.get('calories', 0)
            }
            
            log_debug(f"📦 Payload to Challenge Manager: {activity_data}")
            print(f"📦 Payload to Challenge Manager: {activity_data}")
            
            # Update all active challenges for this user
            active_challenges = challenges.challenge_manager.get_active_challenges(request.user_id)
            log_debug(f"🎯 Found {len(active_challenges)} active challenges for user {request.user_id}")
            print(f"🎯 Found {len(active_challenges)} active challenges")
            
            if not active_challenges:
                log_debug("[WARNING] NO ACTIVE CHALLENGES FOUND. Check if user has joined any challenge.")

            for challenge in active_challenges:
                log_debug(f"   ... Processing challenge: {challenge.get('name')} (ID: {challenge.get('challenge_id')}) (Type: {challenge.get('goal_type', 'unknown')})")
                print(f"   ... Processing challenge: {challenge.get('name')} (Type: {challenge.get('goal_type', 'unknown')})")
                
                updated = challenges.challenge_manager.update_progress(
                    challenge["challenge_id"],
                    request.user_id,
                    activity_data
                )
                
                if updated:
                    log_debug(f"   [SUCCESS] Update Success! New Progress: {updated['current_progress']} / {challenge.get('goal_value')}")
                    print(f"   [SUCCESS] Update Success! New Progress: {updated['current_progress']}")
                    challenge_updates.append({
                        "id": challenge["challenge_id"], 
                        "name": challenge["name"],
                        "progress": updated["current_progress"],
                        "completed": updated["completed"]
                    })
                else:
                    log_debug(f"   [WARNING] Update returned False/None. Criteria mismatch? Goal Type: {challenge.get('goal_type')}")
                    print(f"   [WARNING] Update returned False/None. Criteria mismatch?")
            
        except Exception as e:
            log_debug(f"[ERROR] FATAL ERROR in Challenge Update: {e}")
            print(f"[ERROR] FATAL ERROR in Challenge Update: {e}")
            # Non-blocking error
        
        return {
            "session_id": session_id,
            "message": "Session saved successfully",
            "challenge_updates": challenge_updates
        }
    except Exception as e:
        print(f"Error saving cardio session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cardio/insights/post-run/{session_id}")
async def get_post_run_insights(session_id: str, user_id: str = None):
    """
    Get AI-powered insights for a specific cardio session
    Returns summary, stats, and recommendations
    """
    try:
        # 1. Get the specific session - FIXED: Extract user_id from session
        import sys
        
        print("="*50, flush=True)
        print(f"🔍 FETCHING INSIGHTS FOR: {session_id}", flush=True)
        if user_id:
            print(f"👤 Explicit User ID provided: {user_id}", flush=True)
        sys.stdout.flush()
        
        # Load session first to get correct user_id
        # RETRY LOGIC: Polling loop to handle race conditions
        import time
        max_retries = 5
        current_session = None
        session_user_id = None
        
        for attempt in range(max_retries):
            sessions = cardio_storage.load_sessions()
            if isinstance(sessions, list):
                current_session = next((s for s in sessions if isinstance(s, dict) and s.get('session_id') == session_id), None)
            else:
                current_session = sessions.get(session_id)
            
            if current_session:
                session_user_id = current_session.get('user_id')
                print(f"[SUCCESS] Found session on attempt {attempt+1}, user_id: {session_user_id}", flush=True)
                break
            else:
                print(f"[WARNING] Session not found (Attempt {attempt+1}/{max_retries}). Waiting...", flush=True)
                time.sleep(0.5)
        
        # LOGIC: Prefer explicit user_id > session user_id > fallback
        final_user_id = user_id or session_user_id or 'user1'
        
        if not current_session:
            print(f"[ERROR] Session CRITICAL FAILURE: Could not find session {session_id} after {max_retries} retries.", flush=True)
            print(f"[WARNING] Using User ID for history lookup: {final_user_id}", flush=True)
        
        sys.stdout.flush()
        
        # Get all sessions for the correct user
        all_sessions = cardio_storage.get_user_sessions(final_user_id, limit=1000)
        print(f"📊 User {final_user_id} has {len(all_sessions)} sessions", flush=True)
        sys.stdout.flush()
        
        if not current_session:
            current_session = next((s for s in all_sessions if s.get('session_id') == session_id), None)
            if not current_session:
                current_session = {
                    'metrics': {'distance': 0, 'avgPace': 330},
                    'created_at': datetime.now().isoformat()
                }

        # 2. Get History (sorted by date desc)
        # Fix: Robust sort key that handles None values (get returns None if key exists but value is null)
        history_sessions = sorted(all_sessions, key=lambda x: (x.get('created_at') or x.get('start_time') or ''), reverse=True)

        # 3. Generate Insights
        result = insights.generate_post_run_insights(current_session, history_sessions)
        
        # Inject Debug Info
        result['debug_info'] = {
            'user_id': final_user_id,
            'session_count': len(history_sessions),
            'calculated_at': datetime.now().isoformat(),
            'server_version': 'DEBUG_AGENT_V2_QUERY_PARAM'
        }
        
        print(f"[SUCCESS] Insights generated: {result.get('stats')}", flush=True)
        print(f"🐛 Debug Info: {result['debug_info']}", flush=True)
        sys.stdout.flush()

        return result

    except Exception as e:
        print(f"Error generating insights: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.get("/api/cardio/sessions/{user_id}", dependencies=[Depends(owner_guard)])
async def get_user_cardio_sessions(user_id: str, limit: int = 20):
    """Get cardio session history for a user"""
    try:
        sessions = cardio_storage.get_user_sessions(user_id, limit)

        # Return summary view (without full route data for performance)
        summaries = []
        def _mini_route(route, max_pts=40):
            """降採樣路線到 ≤max_pts 點，只留 lat/lng，給卡片畫真路線（省頻寬）。"""
            if not isinstance(route, list) or len(route) < 2:
                return []
            def latlng(p):
                if isinstance(p, dict):
                    lat = p.get("lat") or p.get("latitude")
                    lng = p.get("lng") or p.get("lon") or p.get("longitude")
                elif isinstance(p, (list, tuple)) and len(p) >= 2:
                    lat, lng = p[0], p[1]
                else:
                    return None
                try:
                    return {"lat": float(lat), "lng": float(lng)}
                except (TypeError, ValueError):
                    return None
            clean = [c for c in (latlng(p) for p in route) if c]
            if len(clean) <= max_pts:
                return clean
            step = (len(clean) - 1) / (max_pts - 1)
            return [clean[min(len(clean) - 1, round(i * step))] for i in range(max_pts)]

        for session in sessions:
            summaries.append({
                "session_id": session.get("session_id"),
                "date": session.get("created_at") or session.get("date"),
                "created_at": session.get("created_at") or session.get("date"),
                "metrics": session.get("metrics"),
                "emotion": session.get("emotion"),
                "type": session.get("type", "running"),
                # 🟢 運動模式欄位（給最新動態時間軸顯示正確圖示/名稱）
                "sport": session.get("sport") or session.get("type", "running"),
                "sport_type": session.get("sport_type"),
                "sport_label": session.get("sport_label"),
                "has_elevation": session.get("has_elevation"),
                # 🌤️ 天氣 / 地點（卡片顯示用）
                "weather": session.get("weather"),
                "location_name": session.get("location_name"),
                # 🗺️ 精簡路線（≤40 點）給卡片畫真路線
                "route": _mini_route(session.get("route_data")),
                # 🏅 破紀錄數：存檔當下已算好存進 metrics.pr_count（見 /api/cardio/session）；
                #    沒有就 0。避免在列表端逐場重算（O(n²)）。
                "pr_count": session.get("metrics", {}).get("pr_count", 0) if isinstance(session.get("metrics"), dict) else 0,
                # 🏅 獎牌明細（破了什麼）：動態卡「簡易預覽」用
                "medals": session.get("metrics", {}).get("medals") if isinstance(session.get("metrics"), dict) else None,
                # ── Route-tag: which Segment Explorer route this run belongs to ──
                "segment_id": session.get("segment_id"),
                "segment_name": session.get("segment_name"),
                # 🤝 同跑者（存檔時前端偵測寫入）— 最新動態卡直接顯示
                "companions": session.get("companions"),
            })
        
        return {
            "user_id": user_id,
            "sessions": summaries,
            "total": len(summaries)
        }
    except Exception as e:
        print(f"Error fetching cardio sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# [EXTRACTED Phase1] GET /api/segments/{segment_id}/personal-record → api_segments.py
@router.delete("/api/cardio/session/{session_id}")
async def delete_cardio_session(session_id: str, user_id: str = None):
    """Delete a cardio session"""
    try:
        # 🔥 FIX: Pass user_id to locate the correct file
        cardio_storage.delete_session(user_id, session_id)
        return {"message": "Session deleted successfully"}
    except Exception as e:
        print(f"Error deleting cardio session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/cardio/session/{session_id}/route")
async def get_session_route(session_id: str, user_id: str = None):
    """Get full route data for a specific session"""
    try:
        # 🔥 FIX: Pass user_id to locate the correct file
        session = cardio_storage.get_session_by_id(user_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {
            "session_id": session_id,
            "route_data": session.get("route_data", []),
            "metrics": session.get("metrics", {}),
            "stream_data": session.get("stream_data"),  # [RELOAD] Add stream data for charts
            "created_at": session.get("created_at")  # [RELOAD] Add timestamp
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching session route: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/cardio/deep-analysis/{session_id}")
async def get_depth_analysis(session_id: str, user_id: str = None):
    """
    Get deep analysis for a cardio session (PRs, Effort Density)
    """
    try:
        # If 'latest', fetch the user's most recent session
        if session_id == 'latest':
            if not user_id:
                raise HTTPException(status_code=400, detail="User ID required for 'latest' query")
            
            sessions = cardio_storage.get_user_sessions(user_id, limit=1)
            if not sessions:
                return {} # Return empty if no history
            session_id = sessions[0]['session_id']
            # Continue to analysis with resolved ID

        # Resolve user_id if not provided (for non-latest queries if needed for future logic, 
        # though get_session_deep_analysis handles user_id lookup if strictly needed, 
        # but here we pass user_id to it if we have it, or let it extract.)
        # Actually, get_session_deep_analysis takes (user_id, session_id). 
        # We need to ensure we pass the correct user_id that OWNS the session for PR comparison.
        
        if not user_id:
             # This is tricky without user_id in the new architecture. 
             # For deep analysis, we usually have user_id from the frontend.
             # If missing, we'd have to search or fail.
             raise HTTPException(status_code=400, detail="User ID required for storage lookups")

        analysis = cardio_storage.get_session_deep_analysis(user_id, session_id)
        return analysis
    except Exception as e:
        print(f"Error generating depth analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Running Analytics Endpoints ====================

# [EXTRACTED Phase1] /api/cardio/analytics/* → api_cardio_analytics.py
@router.post("/api/cardio/session/enhanced")
async def save_enhanced_cardio_session(request: dict):
    """Save cardio session with full analytics data"""
    try:
        user_id = request.get('user_id')
        session_data = request.get('session_data')
        
        if not user_id or not session_data:
            raise HTTPException(status_code=400, detail="Missing user_id or session_data")
        
        session_id = cardio_storage.save_enhanced_session(user_id, session_data)
        
        # [RELOAD] Automatic Challenge Update
        # Convert session data to flat activity data for challenges
        try:
            metrics = session_data.get("metrics", {})
            activity_data = {
                "activity_type": "cardio",  # or 'run'
                "distance_km": float(metrics.get("distance", 0)),
                "duration_minutes": float(metrics.get("duration", 0)) / 60.0,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "calories": float(metrics.get("calories", 0))
            }
            # [RELOAD] Automatic Challenge Update
            try:
                challenges.challenge_manager.process_active_challenges(user_id, activity_data)
            except Exception as ce:
                print(f"[WARNING] Challenge update failed (non-blocking): {ce}")
        except Exception as e:
            print(f"[WARNING] Error preparing challenge data: {e}")

        return {
            "session_id": session_id,
            "message": "Enhanced session saved successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error saving enhanced session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
