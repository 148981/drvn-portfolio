"""
api_cardio_hr_pace.py — 有氧心率區間 / 配速分析 (Cardio HR & Pace) 路由
（Phase 1 從 main.py 抽出；行為不變，改為獨立 APIRouter）

對應前綴：/api/cardio/hr-zones、/analyze-hr-session、/analyze-pace、/mock-data
依賴：core.heart_rate_zones、core.pace_analyzer、core.recovery
"""
import os
import json
from typing import List, Optional

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

import core.recovery as recovery

# 與 main.py 一致：DATA_DIR 指向專案根層 data/；使用者檔案路徑
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
USER_PROFILES_PATH = os.path.join(DATA_DIR, "user_profiles.json")

router = APIRouter(tags=["cardio-hr-pace"])


# ========================================
# CARDIO / RUNNING MODULE APIs
# ========================================

from core import heart_rate_zones, pace_analyzer

class HRZonesRequest(BaseModel):
    user_id: str
    age: Optional[int] = None
    gender: Optional[str] = 'male'
    resting_hr: Optional[int] = None
    body_fat_percent: Optional[float] = None
    fitness_level: Optional[str] = 'intermediate'

class PaceAnalysisRequest(BaseModel):
    gps_data: List[dict]  # [{'lat': float, 'lng': float, 'timestamp': int, 'distance_cumulative': float}, ...]
    user_hashtags: Optional[List[str]] = []

class HRSessionAnalysisRequest(BaseModel):
    hr_data: List[int]  # Heart rate data points
    user_id: str
    hashtags: Optional[List[str]] = []


@router.post("/api/cardio/hr-zones")
async def calculate_heart_rate_zones(request: HRZonesRequest):
    """
    計算個人化心率區間
    
    Request:
        {
            "user_id": "user123",
            "age": 30,
            "gender": "male",
            "body_fat_percent": 15.0,
            "fitness_level": "intermediate"
        }
    
    Response:
        {
            "max_hr": 190,
            "resting_hr": 60,
            "zones": {
                "zone1": {"min": 125, "max": 138, "name": "熱身恢復", ...},
                "zone2": {"min": 138, "max": 151, "name": "燃脂區", "highlight": true},
                ...
            }
        }
    """
    try:
        # Get user profile if age not provided
        age = request.age
        if not age:
            # Try to get from user profile
            try:
                with open(USER_PROFILES_PATH, 'r', encoding='utf-8') as f:
                    profiles = json.load(f)
                    if request.user_id in profiles:
                        profile = profiles[request.user_id]
                        age = profile.get('age', 30)
            except:
                age = 30  # Default
        
        zones_data = heart_rate_zones.calculate_hr_zones(
            age=age,
            gender=request.gender,
            resting_hr=request.resting_hr,
            body_fat_percent=request.body_fat_percent,
            fitness_level=request.fitness_level
        )
        
        return zones_data
    except Exception as e:
        print(f"Error calculating HR zones: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/cardio/analyze-hr-session")
async def analyze_hr_session(request: HRSessionAnalysisRequest):
    """
    分析跑步過程中的心率分佈
    
    Request:
        {
            "user_id": "user123",
            "hr_data": [145, 150, 155, ...],
            "hashtags": ["#極致減脂"]
        }
    """
    try:
        # First get the HR zones
        zones_req = HRZonesRequest(user_id=request.user_id)
        zones_data = await calculate_heart_rate_zones(zones_req)
        
        # Analyze the session
        analysis = heart_rate_zones.analyze_hr_session(
            request.hr_data,
            zones_data['zones']
        )
        
        # Get recommendations based on hashtags
        if request.hashtags:
            recommendation = heart_rate_zones.get_zone_recommendation(
                request.hashtags,
                zones_data['zones']
            )
            analysis['recommendation'] = recommendation
        
        return {
            "zones": zones_data['zones'],
            "analysis": analysis
        }
    except Exception as e:
        print(f"Error analyzing HR session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/cardio/analyze-pace")
async def analyze_pace(request: PaceAnalysisRequest):
    """
    分析跑步配速
    
    Request:
        {
            "gps_data": [
                {"lat": 25.033, "lng": 121.565, "timestamp": 1609459200, "distance_cumulative": 100},
                ...
            ],
            "user_hashtags": ["#極致減脂"]
        }
    """
    try:
        print(f"📊 Received GPS data points: {len(request.gps_data)}")
        print(f"🏷️ User hashtags: {request.user_hashtags}")
        
        # Analyze pace
        analysis = pace_analyzer.analyze_split_pace(request.gps_data)
        
        print(f"[SUCCESS] Analysis result: {analysis.keys()}")
        
        # Check if we have valid analysis data (at least 1 km)
        if not analysis or 'splits' not in analysis or len(analysis.get('splits', [])) == 0:
            print("[WARNING] Not enough GPS data for pace analysis (need at least 1km)")
            return {
                "error": "insufficient_data",
                "message": "需要至少 1 公里的 GPS 數據才能進行配速分析",
                "gps_points": len(request.gps_data)
            }
        
        # Get recommendations only if we have valid analysis
        if request.user_hashtags and analysis:
            recommendations = pace_analyzer.get_pace_recommendations(
                analysis,
                request.user_hashtags
            )
            analysis['recommendations'] = recommendations
            print(f"[SUCCESS] Recommendations added")
        
        return analysis
    except Exception as e:
        import traceback
        print(f"[ERROR] Error analyzing pace: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cardio/mock-data/{distance_km}")
async def generate_mock_cardio_data(distance_km: float, avg_pace_sec: int = 330):
    """
    生成模擬跑步數據（用於測試）
    
    GET /api/cardio/mock-data/5?avg_pace_sec=330
    """
    try:
        gps_data = pace_analyzer.generate_mock_gps_data(distance_km, avg_pace_sec)
        return {"gps_data": gps_data}
    except Exception as e:
        print(f"Error generating mock data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


