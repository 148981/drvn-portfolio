"""
api_plan_covers.py — 計劃 / 融合卡封面圖儲存 (Plan & Fusion Card Covers)（Phase 1 抽出，行為不變）
對應前綴：/api/plan-covers/*  ｜ 依賴：檔案系統（data/uploads/covers）
封面圖以 cover_{user_id}_{cover_id}.{ext} 命名，透過 /static/uploads/covers/ 對外提供。
"""
import os
import shutil

from fastapi import APIRouter, HTTPException, Form, File, UploadFile, Depends
from auth_guard import owner_guard

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
COVERS_DIR = os.path.join(DATA_DIR, "uploads", "covers")
os.makedirs(COVERS_DIR, exist_ok=True)

router = APIRouter(tags=["plan-covers"])


@router.get("/api/plan-covers/{user_id}", dependencies=[Depends(owner_guard)])
async def get_plan_covers(user_id: str):
    """Return all saved cover image URLs for a user (plan + fusion cards)."""
    covers = {}
    prefix = f"cover_{user_id}_"
    try:
        for fname in os.listdir(COVERS_DIR):
            if fname.startswith(prefix):
                cover_id = fname[len(prefix):].rsplit(".", 1)[0]  # strip extension
                covers[cover_id] = f"/static/uploads/covers/{fname}"
    except Exception as e:
        print(f"[plan-covers GET] error: {e}")
    return {"covers": covers}


@router.post("/api/plan-covers/{user_id}", dependencies=[Depends(owner_guard)])
async def save_plan_cover(
    user_id: str,
    cover_id: str = Form(...),   # e.g. "plan_arm-plan" or "fusion_abc123"
    image: UploadFile = File(...),
):
    """Upload and persist a cover image for a plan or fusion card."""
    try:
        ext = os.path.splitext(image.filename)[1] or ".jpg"
        safe_id = cover_id.replace("/", "_").replace("..", "_")
        filename = f"cover_{user_id}_{safe_id}{ext}"
        path = os.path.join(COVERS_DIR, filename)
        with open(path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        url = f"/static/uploads/covers/{filename}"
        return {"url": url, "cover_id": cover_id}
    except Exception as e:
        print(f"[plan-covers POST] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
