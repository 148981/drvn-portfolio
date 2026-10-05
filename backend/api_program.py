"""
api_program.py — 個人化課表(Program)產生與儲存 路由（Phase 1 抽出，行為不變）
對應前綴：/api/program/*  ｜ 依賴：core.program_generator（直接讀寫 data/programs_*.json）
"""
import os
from core.json_cache import save_json_atomic
import json

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from auth_guard import owner_guard

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

router = APIRouter(tags=["program"])


# ==================== Program Generation APIs ====================
from core.program_generator import (
    ProgramGenerationRequest,
    generate_personalized_program
)

@router.post("/api/program/generate")
async def generate_program(request: ProgramGenerationRequest):
    """Generate personalized 4-week training program based on hashtag goals"""
    try:
        program = generate_personalized_program(request)
        
        # Save to file for persistence
        programs_path = os.path.join(DATA_DIR, f"programs_{request.user_id}.json")
        programs = []
        if os.path.exists(programs_path):
            with open(programs_path, 'r', encoding='utf-8') as f:
                programs = json.load(f)
        
        programs.append(program.dict())
        save_json_atomic(programs_path, programs, indent=2)
        return program.dict()
    except Exception as e:
        print(f"Error generating program: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/program/{user_id}/latest", dependencies=[Depends(owner_guard)])
async def get_latest_program(user_id: str):
    """Get user's latest program"""
    try:
        programs_path = os.path.join(DATA_DIR, f"programs_{user_id}.json")
        if not os.path.exists(programs_path):
            return {"program": None}
        
        with open(programs_path,  'r', encoding='utf-8') as f:
            programs = json.load(f)
        
        if programs:
            return programs[-1]  # Return latest
        return {"program": None}
    except Exception as e:
        print(f"Error getting program: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ProgramUpdate(BaseModel):
    program_id: str
    user_id: str
    updates: dict

@router.put("/api/program/update")
async def update_program(data: ProgramUpdate):
    """Update an existing program (allow user editing)"""
    try:
        programs_path = os.path.join(DATA_DIR, f"programs_{data.user_id}.json")
        if not os.path.exists(programs_path):
            raise HTTPException(status_code=404, detail="Program not found")
        
        with open(programs_path, 'r', encoding='utf-8') as f:
            programs = json.load(f)
        
        # Find and update the program
        for i, prog in enumerate(programs):
            if prog.get('program_id') == data.program_id:
                programs[i].update(data.updates)
                break
        
        save_json_atomic(programs_path, programs, indent=2)
        return {"success": True, "message": "Program updated"}
    except Exception as e:
        print(f"Error updating program: {e}")
        raise HTTPException(status_code=500, detail=str(e))
