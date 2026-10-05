import os
from core.json_cache import save_json_atomic
import json
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel

router = APIRouter(prefix="/api/exercises", tags=["custom_exercises"])

CUSTOM_EXERCISES_FILE = "data/custom_exercises.json"
CUSTOM_IMAGE_DIR = "static/custom_exercises"

os.makedirs("data", exist_ok=True)
os.makedirs(CUSTOM_IMAGE_DIR, exist_ok=True)

def load_custom_exercises():
    if os.path.exists(CUSTOM_EXERCISES_FILE):
        try:
            with open(CUSTOM_EXERCISES_FILE, "r") as f:
                return json.load(f)
        except:
            return []
    return []

def save_custom_exercises(exercises):
    save_json_atomic(CUSTOM_EXERCISES_FILE, exercises, indent=4)
@router.get("/custom")
def get_custom_exercises(user_id: str = Query(..., description="User ID to fetch custom exercises for")):
    exercises = load_custom_exercises()
    user_exercises = [ex for ex in exercises if ex.get("user_id") == user_id]
    return {"exercises": user_exercises}

@router.post("/custom")
async def add_custom_exercise(
    user_id: str = Form(...),
    name: str = Form(...),
    nameEn: str = Form(""),
    cat: str = Form(...),
    tier: int = Form(...),
    subPart: str = Form(...),
    equipment: str = Form("bodyweight"),
    role: str = Form("accessory"),
    cns: int = Form(1),
    pattern: str = Form("other"),
    image: Optional[UploadFile] = File(None)
):
    try:
        exercises = load_custom_exercises()
        
        # Check if already exists for this user
        for ex in exercises:
            if ex.get("user_id") == user_id and ex.get("name") == name:
                raise HTTPException(status_code=400, detail="動作名稱已存在")

        custom_id = str(uuid.uuid4())
        image_url = None

        if image and image.filename:
            # save image
            ext = os.path.splitext(image.filename)[1]
            if not ext:
                ext = ".jpg"
            filename = f"custom_{custom_id}{ext}"
            file_path = os.path.join(CUSTOM_IMAGE_DIR, filename)
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
            
            # Base URL is expected to serve /static/
            image_url = f"/static/custom_exercises/{filename}"

        new_exercise = {
            "id": custom_id,
            "user_id": user_id,
            "name": name,
            "nameEn": nameEn,
            "cat": cat,
            "tier": tier,
            "subPart": subPart,
            "equipment": equipment,
            "role": role,
            "cns": cns,
            "pattern": pattern,
            "image_url": image_url,
            "sourcePlan": "Custom"
        }

        exercises.append(new_exercise)
        save_custom_exercises(exercises)

        return {"status": "success", "exercise": new_exercise}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
