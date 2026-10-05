"""
api_hashtags.py — Hashtag 池 / 雷達指標資訊 路由（Phase 1 抽出，行為不變）
對應前綴：/api/hashtags/*  ｜ 依賴：core.hashtag_pool
"""
from fastapi import APIRouter, HTTPException

from core.hashtag_pool import get_all_tags_by_category, METRICS

router = APIRouter(tags=["hashtags"])


@router.get("/api/hashtags/pool")
async def get_hashtag_pool():
    """Get all available hashtags grouped by category"""
    try:
        return get_all_tags_by_category()
    except Exception as e:
        print(f"Error getting hashtag pool: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/hashtags/metrics")
async def get_metrics_info():
    """Get information about all radar metrics"""
    try:
        return METRICS
    except Exception as e:
        print(f"Error getting metrics info: {e}")
        raise HTTPException(status_code=500, detail=str(e))
