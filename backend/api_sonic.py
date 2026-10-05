from fastapi import APIRouter, HTTPException, Depends
from auth_guard import owner_guard
from pydantic import BaseModel
from typing import List, Optional
import os
import json
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
os.makedirs(DATA_DIR, exist_ok=True)

# ── Helpers ────────────────────────────────────────────────────────────────
def _library_path(user_id: str) -> str:
    return os.path.join(DATA_DIR, f"sonic_library_{user_id}.json")

def _load_library(user_id: str) -> dict:
    # Phase 2：改 DB（sonic_libraries 表）
    from repositories import sonic_repo
    return sonic_repo.get(user_id)

def _save_library(user_id: str, data: dict):
    from repositories import sonic_repo
    data["updated_at"] = datetime.now().isoformat()
    sonic_repo.save(user_id, data)

# ── Pydantic Models ────────────────────────────────────────────────────────
class SonicLibraryPayload(BaseModel):
    user_id: str
    categories: List[dict]
    playlists: List[dict]

# ── Routes ────────────────────────────────────────────────────────────────

@router.get("/api/sonic/library/{user_id}", dependencies=[Depends(owner_guard)])
async def get_sonic_library(user_id: str):
    """Get SonicFocus music library (categories + playlists) for a user."""
    try:
        library = _load_library(user_id)
        logger.info(f"[SonicFocus] Loaded library for {user_id}: "
                    f"{len(library.get('categories', []))} cats, "
                    f"{len(library.get('playlists', []))} playlists")
        return library
    except Exception as e:
        logger.error(f"[SonicFocus] GET error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sonic/library")
async def save_sonic_library(payload: SonicLibraryPayload):
    """Save SonicFocus music library (full overwrite) for a user."""
    try:
        data = {
            "categories": payload.categories,
            "playlists": payload.playlists,
        }
        _save_library(payload.user_id, data)
        logger.info(f"[SonicFocus] Saved library for {payload.user_id}: "
                    f"{len(payload.categories)} cats, {len(payload.playlists)} playlists")
        return {"status": "success", "user_id": payload.user_id,
                "categories": len(payload.categories),
                "playlists": len(payload.playlists)}
    except Exception as e:
        logger.error(f"[SonicFocus] POST error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
