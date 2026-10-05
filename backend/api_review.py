"""
api_review.py — 週期回饋（月報 / 季回饋）路由
對應前綴：/api/review/*
"""
from fastapi import APIRouter

router = APIRouter(tags=["review"])


@router.get("/api/review/quarterly/{user_id}")
async def get_quarterly_review(user_id: str):
    """季回饋：跑步 / 健身 / 營養三大系統的季度深度回饋（模擬數據優先，能算真實值就覆蓋）。"""
    try:
        from core import quarterly_review
        return {"review": quarterly_review.generate_quarterly_review(user_id)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"review": None, "error": str(e)}


@router.get("/api/review/system-status/{user_id}")
async def get_system_status(user_id: str):
    """首頁三大系統目前狀態（跑步/健身/營養）+ 準備/恢復。模擬數據優先，能算真實值就覆蓋。"""
    try:
        from core import system_status
        return {"status": system_status.generate_system_status(user_id)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": None, "error": str(e)}


@router.get("/api/review/weekly/{user_id}")
async def get_weekly_review(user_id: str):
    """每週回顧：逐肌群分析 + 一句突破 + 下週建議（模擬數據優先，能算真實值就覆蓋）。"""
    try:
        from core import weekly_review
        return {"review": weekly_review.generate_weekly_review(user_id)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"review": None, "error": str(e)}
