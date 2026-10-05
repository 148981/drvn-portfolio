"""
api_cardio_analytics.py — 有氧數據分析 (Cardio Analytics) 路由
（Phase 1 從 main.py 抽出；行為不變，改為獨立 APIRouter）

對應前綴：/api/cardio/analytics/*（summary / trends / records）
依賴：core.cardio_storage
"""
from fastapi import APIRouter, HTTPException, Depends
from auth_guard import owner_guard

import core.cardio_storage as cardio_storage

router = APIRouter(tags=["cardio-analytics"])


@router.get("/api/cardio/analytics/summary/{user_id}", dependencies=[Depends(owner_guard)])
async def get_running_summary(user_id: str, period: str = "month"):
    """Get summary analytics for a period (week, month, year, all)"""
    try:
        analytics = cardio_storage.get_running_analytics(user_id, period)
        return {
            "user_id": user_id,
            "analytics": analytics
        }
    except Exception as e:
        print(f"Error getting analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/cardio/analytics/trends/{user_id}", dependencies=[Depends(owner_guard)])
async def get_metric_trends(user_id: str, metric: str = "pace", limit: int = 30, period: str = "month"):
    """Get trend data for specific metric (pace, distance, cadence, hr), filtered by period"""
    try:
        trends = cardio_storage.get_metric_trends(user_id, metric, limit, period)
        return {
            "user_id": user_id,
            "metric": metric,
            "period": period,
            "trends": trends
        }
    except Exception as e:
        print(f"Error getting trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/cardio/analytics/records/{user_id}", dependencies=[Depends(owner_guard)])
async def get_running_records(user_id: str):
    """Get personal records (PRs) for running"""
    try:
        records = cardio_storage.get_personal_records(user_id)
        return {
            "user_id": user_id,
            "records": records
        }
    except Exception as e:
        print(f"Error getting records: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cardio/analytics/medals/{user_id}/{session_id}", dependencies=[Depends(owner_guard)])
async def get_session_medals(user_id: str, session_id: str):
    """🏅 某一場運動拿到的獎牌（金銀銅名次）+ 破紀錄數。前端 medal 顯示用。"""
    try:
        return cardio_storage.compute_session_medals(user_id, session_id)
    except Exception as e:
        print(f"Error computing medals: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cardio/analytics/pr-profile/{user_id}", dependencies=[Depends(owner_guard)])
async def get_pr_profile(user_id: str):
    """🏆 完整 PR 檔案（公里制）：各標準距離現任 PR、歷史前三、歷年 PR 進程。"""
    try:
        return cardio_storage.compute_pr_profile(user_id)
    except Exception as e:
        print(f"Error computing PR profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))

