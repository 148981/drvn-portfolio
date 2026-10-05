"""
api_challenges.py — 挑戰系統 (Challenges) 路由（Phase 1 從 main.py 抽出，行為不變）

對應前綴：/api/challenges/*（templates、join-template、create、active、join/leave、progress…）
注意：與 api_permanent_challenges 的 /api/challenges/permanent/* 不同路徑、不衝突。
依賴：core.challenges（challenge_manager）、core.challenge_templates
"""
import uuid
from typing import Optional, List, Dict
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Request
from auth_guard import enforce_owner

import core.challenges as challenges
from core import challenge_templates

router = APIRouter(tags=["challenges"])


class ChallengeCreate(BaseModel):
    user_id: str
    challenge_type: str  # "personal" | "friend" | "club"
    name: str
    description: str
    goal_type: str  # "distance" | "duration" | "frequency" | "streak"
    goal_value: float
    time_window: int  # days
    badge_icon: str = "🏆"
    badge_color: str = "gold"
    invited_users: Optional[List[str]] = None
    club_id: Optional[str] = None


# System-provided challenges API
@router.get("/api/challenges/templates")
async def get_challenge_templates(category: Optional[str] = None, difficulty: Optional[str] = None):
    """Get available system challenge templates"""
    try:
        templates = challenge_templates.get_available_challenges(category, difficulty)
        return {"templates": templates, "count": len(templates)}
    except Exception as e:
        print(f"Error getting challenge templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/challenges/join-template")
async def join_template_challenge(user_id: str, template_id: str):
    """Join a system-provided challenge"""
    try:
        # Create instance from template
        instance = challenge_templates.create_instance_from_template(template_id, user_id)
        if not instance:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Save to challenges using file storage
        all_challenges = challenges.challenge_manager._load_challenges()
        all_challenges.append(instance)
        challenges.challenge_manager._save_challenges(all_challenges)
        
        # Initialize participant record
        all_participants = challenges.challenge_manager._load_participants()
        all_participants.append({
            "participant_id": str(uuid.uuid4()),
            "challenge_id": instance["challenge_id"],
            "user_id": user_id,
            "joined_at": datetime.now().isoformat(),
            "status": "active",
            "current_progress": 0,
            "completed": False
        })
        challenges.challenge_manager._save_participants(all_participants)
        
        return {"success": True, "challenge": instance}
    except Exception as e:
        print(f"Error joining challenge: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/challenges/leave")
async def leave_challenge(user_id: str, challenge_id: str):
    """Leave an active challenge"""
    try:
        success = challenges.challenge_manager.leave_challenge(challenge_id, user_id)
        if not success:
             raise HTTPException(status_code=404, detail="Challenge not found or user not participant")
             
        return {"success": True, "message": "Successfully left the challenge"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error leaving challenge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Keep old create endpoint for backward compatibility (but hide from UI)
@router.post("/api/challenges/create")
async def create_challenge(challenge: ChallengeCreate, request: Request):
    """Create a new challenge"""
    # body 裡的 user_id 不會被 identity_guard 覆蓋 → 這裡自己驗
    enforce_owner(request, challenge.user_id)
    name = (challenge.name or "").strip()
    description = (challenge.description or "").strip()
    if not name or len(name) > 60 or len(description) > 500:
        raise HTTPException(status_code=422, detail="挑戰名稱 1–60 字、說明最多 500 字")
    if not (0 < float(challenge.goal_value) <= 100000) or not (1 <= int(challenge.time_window) <= 366):
        raise HTTPException(status_code=422, detail="目標或天數不合理")
    try:
        from api_moderation import filter_text
        challenge.name, challenge.description = filter_text(name), filter_text(description)
    except Exception:
        challenge.name, challenge.description = name, description
    try:
        created = challenges.challenge_manager.create_challenge(
            user_id=challenge.user_id,
            challenge_type=challenge.challenge_type,
            name=challenge.name,
            description=challenge.description,
            goal_type=challenge.goal_type,
            goal_value=challenge.goal_value,
            time_window=challenge.time_window,
            badge_icon=challenge.badge_icon,
            badge_color=challenge.badge_color,
            invited_users=challenge.invited_users,
            club_id=challenge.club_id
        )
        return {"success": True, "challenge": created}
    except Exception as e:
        print(f"Error creating challenge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/challenges/active")
async def get_active_challenges(user_id: str):
    """Get all active challenges for a user"""
    try:
        active = challenges.challenge_manager.get_active_challenges(user_id)
        return {"challenges": active, "count": len(active)}
    except Exception as e:
        print(f"Error getting active challenges: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/challenges/{challenge_id}/join")
async def join_challenge(challenge_id: str, user_id: str):
    """Join an existing challenge"""
    try:
        success = challenges.challenge_manager.join_challenge(challenge_id, user_id)
        if success:
            return {"success": True, "message": "Successfully joined challenge"}
        else:
            raise HTTPException(status_code=400, detail="Failed to join challenge or already joined")
    except Exception as e:
        print(f"Error joining challenge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/challenges/{challenge_id}/leave")
async def leave_challenge(challenge_id: str, user_id: str):
    """Leave a challenge"""
    try:
        success = challenges.challenge_manager.leave_challenge(challenge_id, user_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to leave challenge")
        return {"success": True}
    except Exception as e:
        print(f"Error leaving challenge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/challenges/{challenge_id}/progress")
async def get_challenge_progress(challenge_id: str):
    """Get detailed progress for a challenge"""
    try:
        progress = challenges.challenge_manager.get_challenge_progress(challenge_id)
        if progress is None:
            raise HTTPException(status_code=404, detail="Challenge not found")
        return progress
    except Exception as e:
        print(f"Error getting challenge progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ProgressUpdate(BaseModel):
    user_id: str
    activity_data: Dict


@router.post("/api/challenges/{challenge_id}/update-progress")
async def update_challenge_progress(challenge_id: str, update: ProgressUpdate, request: Request):
    """Update user's progress in a challenge

    以前這支只有 docstring、沒有本體 —— 永遠回 null，前端以為更新成功，
    挑戰進度其實從來沒動過。而且 body 的 user_id 沒驗，補上本人檢查。
    """
    enforce_owner(request, update.user_id)
    result = challenges.challenge_manager.update_progress(challenge_id, update.user_id, update.activity_data or {})
    if result is None:
        raise HTTPException(status_code=404, detail="Challenge not found or user not participant")
    return result
