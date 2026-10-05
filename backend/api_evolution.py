from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from core import evolution_matrix

router = APIRouter()


def _jwt_owner(request: Request) -> str:
    """🔴 資安修復：body.user_id 不可信，寫入一律以 JWT 身分為準，沒有 JWT → 401。"""
    uid = getattr(request.state, "user_id", None)
    if not isinstance(uid, str) or not uid.strip():
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    return uid

class MatrixConfigUpdate(BaseModel):
    user_id: str
    tags: List[str]

@router.get("/api/evolution/status")
async def get_evolution_status(user_id: str):
    """
    Get full Evolution Dashboard status: Targets, Progress, Feedback.
    """
    try:
        report = evolution_matrix.generate_evolution_report(user_id)
        return report
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/evolution/config")
async def update_evolution_config(config: MatrixConfigUpdate, request: Request):
    """
    Update selected tags for the matrix.
    """
    owner = _jwt_owner(request)
    try:
        new_conf = evolution_matrix.update_user_tags(owner, config.tags)
        return {"status": "success", "config": new_conf}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class TargetsUpdate(BaseModel):
    user_id: str
    target_plan: Optional[List[dict]] = None
    cycle_start_date: Optional[str] = None
    targets: Optional[dict] = None # Legacy support

@router.post("/api/evolution/targets")
async def update_evolution_targets(data: TargetsUpdate, request: Request):
    """
    Update custom target overrides.
    """
    owner = _jwt_owner(request)
    data.user_id = owner
    try:
        # Convert Pydantic model to dict, filtering None
        update_data = data.dict(exclude_none=True)
        new_conf = evolution_matrix.update_user_targets(owner, update_data)
        return {"status": "success", "config": new_conf}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
