"""
api_user_profile.py — 使用者個人檔案核心 (User Profile Core) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/user/initialize、/api/user/profile*、/api/user/profiles、
          /api/user/{user_id} (DELETE)、/api/user/delete、/api/user/monthly-report/{user_id}
依賴：core.coach_profile、core.workout_history、core.nutrition（及多個 in-function imports）

註：
 - DELETE /api/user/{user_id} 為 catch-all，但僅匹配 DELETE 方法；其餘 /api/user/* 的
   GET/POST/PUT 路由不會被它遮蔽（FastAPI 以 method+path 共同匹配）。維持原註冊順序以策安全。
 - BASE_DIR / DATA_DIR 與 main.py 定義一致（BASE_DIR=backend 目錄，DATA_DIR=../data）。
"""
import os
from core.json_cache import save_json_atomic
import json
import uuid
import shutil
from datetime import datetime, timedelta
from typing import List, Optional

from pydantic import BaseModel
from fastapi import APIRouter, Request, Form, File, UploadFile, Body, HTTPException, Depends
from auth_guard import owner_guard
from api_membership import require_member
from fastapi.responses import JSONResponse

import core.coach_profile as coach_profile
import core.workout_history as workout_history
import core.nutrition as nutrition
import core.cardio_storage as cardio_storage

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")  # 頭貼/封面圖上傳目錄（與 main.py 一致）

router = APIRouter(tags=["user-profile"])


class UserEvolutionProfile(BaseModel):
    # Stage 1: The Shell (Physiology)
    gender: str          # 'Titan' (Male-like) or 'Flow' (Female-like)
    height: float
    weight: float
    age: int

    # Stage 2: The Vision
    goal: str            # 'Sculpt', 'Build', 'Maintain'
    experience_level: int # 1-10

    # Stage 3: Urban Life
    urban_tags: List[str] # e.g., ['#commuting_fatigue', '#sedentary']
    weekly_frequency: int # 1-7

    # Stage 4: The Nexus
    training_space: str   # 'Commercial_Gym', 'Home', 'Street'
    diet_preference: str  # 'Low_Carb', 'High_Protein', 'Intermittent_Fasting'
    
    # Stage 5: Reveal
    apple_watch_synced: bool
    plan_name: Optional[str] = None # User custom plan name
    mindset_tags: List[str] = [] # e.g., ['performance', 'routine']

class UserProfileResponse(BaseModel):
    user_id: str
    tdee: float
    goals: List[str]
    message: str

@router.post("/api/user/initialize")
async def initialize_user(request: Request, data: UserEvolutionProfile):
    """
    Initialize user profile from Urban Silhouette Protocol (8-Stage Flow)
    """
    try:
        user_id = getattr(request.state, "user_id", None) or "guest_init"  # from JWT middleware
        
        # Map Urban Silhouette Goals to Physiological Targets
        goal_map = {
            # V3 Urban Silhouette Goals
            "THE MINIMALIST": ["fat_loss", "definition", "mobility"], # "Wear clothes slim"
            "THE URBAN TITAN": ["hypertrophy", "strength", "power"],  # "Suit thug"
            "THE PERFECTIONIST": ["posture", "core", "definition"],   # "Right-angle shoulders"
            
            # Legacy/Fallback
            "SCULPT": ["fat_loss", "definition"],
            "BUILD": ["hypertrophy", "strength"],
            "MAINTAIN": ["maintenance", "mobility"]
        }
        # Normalize uppercase for mapping
        # Handle cases like "The Minimalist" -> "THE MINIMALIST"
        lookup_key = data.goal.upper().strip()
        user_goals = goal_map.get(lookup_key, ["general_fitness"])
        
        # Calculate TDEE (Mifflin-St Jeor)
        # S value: +5 for Titan/Male, -161 for Flow/Female
        s = 5 if data.gender.lower() in ['titan', 'power', 'male'] else -161
        bmr = (10 * data.weight) + (6.25 * data.height) - (5 * data.age) + s
        
        # Activity Multiplier V3 (Urban Density Logic)
        # frequency 1-2 (Suburb): 1.2
        # frequency 3-5 (City Center): 1.375
        # frequency 6-7 (Metropolis): 1.55, but adjusted if #CommuteFatigue is present
        freq = data.weekly_frequency
        if freq <= 2:
            activity_multiplier = 1.2
        elif freq <= 5:
            activity_multiplier = 1.375
        else:
            activity_multiplier = 1.55
            
        # Optimization: Reduce slightly if #CommuteFatigue or #Sedentary is in tags to avoid burnout
        urban_drag_factors = ['#COMMUTEFATIGUE', '#SEDENTARY', '#BRAINFOG']
        if any(tag.upper() in [t.upper() for t in data.urban_tags] for tag in urban_drag_factors):
            activity_multiplier -= 0.05 # Slight conservative adjustment
            
        tdee = bmr * activity_multiplier

        # Map experience level (1-10) to fitness level string
        if data.experience_level <= 3:
            fitness_level = "beginner"
        elif data.experience_level <= 6:
            fitness_level = "intermediate"
        else:
            fitness_level = "advanced"

        profile = coach_profile.create_or_update_profile(
            user_id=user_id,
            name="Athlete",
            height_cm=data.height,
            weight_kg=data.weight,
            age=data.age,
            gender="male" if data.gender.lower() in ['titan', 'power', 'male'] else "female",
            fitness_level=fitness_level,
            goals=user_goals,
            weekly_frequency=data.weekly_frequency,
            diet=data.diet_preference,
            lifestyle=",".join(data.urban_tags) if data.urban_tags else None,
            mindset_tags=data.mindset_tags, # Pass new tags
            bmr=round(bmr, 0),
            tdee=round(tdee, 0),
            training_space=data.training_space,
            is_first_plan=True  # Mark as first time user
        )
        
        # Auto-generate 4-week personalized workout plan
        try:
            from core.hashtag_plan_generator import generate_plan_from_hashtags
            
            # Map user goals to appropriate hashtags
            goal_to_hashtags = {
                "hypertrophy": ["#增肌需求", "#胸肌無力", "#練不大困擾"],
                "strength": ["#力量提升", "#核心無力"],
                "power": ["#爆發力", "#運動表現"],
                "fat_loss": ["#減脂需求", "#久坐族", "#體態不佳"],
                "definition": ["#體態不佳", "#駝背改善"],
                "posture": ["#駝背改善", "#肩頸痠痛", "#體態不佳"],
                "core": ["#核心無力", "#腰痛困擾"],
                "mobility": ["#柔軟度差", "#關節僵硬"],
                "endurance": ["#耐力不足", "#有氧提升"],
                "general_fitness": ["#全面發展", "#功能性訓練"]
            }
            
            # Collect hashtags: Priority to Matrix Selection (urban_tags)
            selected_hashtags = list(data.urban_tags) if data.urban_tags else []
            
            # If no matrix tags, fallback to goal-based tags
            if not selected_hashtags:
                for goal in user_goals:
                    hashtags = goal_to_hashtags.get(goal, ["#全面發展"])
                    selected_hashtags.extend(hashtags)
            
            # Remove duplicates while preserving order
            selected_hashtags = list(dict.fromkeys(selected_hashtags))
            
            # If still no hashtags found (shouldn't happen due to fallbacks above), use generic default
            if not selected_hashtags:
                selected_hashtags = ["#全面發展"]
            
            # Map training space to equipment preference
            equipment_map = {
                "Commercial_Gym": "mixed",
                "Home": "bodyweight",
                "Street": "bodyweight"
            }
            equipment_pref = equipment_map.get(data.training_space, "mixed")
            
            # Generate 4-week plan
            print(f"DEBUG: Receiving plan_name: '{data.plan_name}'") # Debug Print

            plan = generate_plan_from_hashtags(
                user_id=user_id,
                selected_hashtags=selected_hashtags,
                fitness_level=fitness_level,
                days_per_week=data.weekly_frequency,
                split_type="mixed",
                equipment_preference=equipment_pref
            )
            
            # Override plan name if provided by user
            if data.plan_name and data.plan_name.strip():
                print(f"DEBUG: Overwriting plan name to: {data.plan_name.strip()}") # Debug Print
                plan['plan_name'] = data.plan_name.strip()
            else:
                print("DEBUG: Using default 'MY PLAN'") # Debug Print
                plan['plan_name'] = "MY PLAN"
            
            # Save plan to file
            import os
            import json
            from datetime import datetime
            
            DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
            plans_file = os.path.join(DATA_DIR, f"user_{user_id}_plans.json")
            
            # Add metadata
            plan['user_id'] = user_id
            plan['created_at'] = datetime.now().isoformat()
            plan['plan_id'] = str(__import__('uuid').uuid4())
            plan['is_first_plan'] = True
            
            # Phase 2：改 DB（修正：原本寫到 backend/data 的錯誤路徑，與其他人讀的位置不一致）
            from repositories import plan_repo
            with plan_repo.transaction(user_id):
                existing_plans = plan_repo.load(user_id)
                existing_plans.append(plan)
                plan_repo.save(user_id, existing_plans)

            print(f"[SUCCESS] Auto-generated 4-week plan for {user_id}")
            
        except Exception as plan_error:
            print(f"[WARNING] Failed to auto-generate plan: {plan_error}")
            import traceback
            traceback.print_exc()
            # Don't fail the entire onboarding if plan generation fails
        
        return UserProfileResponse(
            user_id=user_id,
            tdee=round(tdee, 0),
            goals=user_goals,
            message=f"Silhouette Initialized. {data.goal} Protocol Active."
        )

    except Exception as e:
        print(f"Error initializing user: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.post("/api/user/profile")
async def create_or_update_profile(
    user_id: str = Form(...),
    name: str = Form(...),
    height_cm: float = Form(...),
    weight_kg: float = Form(...),
    age: int = Form(...),
    gender: str = Form(...),
    fitness_level: str = Form("beginner"),
    goals: str = Form("[]"),
    # InBody fields (optional)
    body_fat_percent: float = Form(None),
    skeletal_muscle_mass: float = Form(None),
    body_water_percent: float = Form(None),
    visceral_fat_level: int = Form(None),
    bmr: float = Form(None),
    protein_mass: float = Form(None),
    mineral_mass: float = Form(None),
    body_fat_mass: float = Form(None),
    # Identity & Presentation Fields
    bio: str = Form(None),
    city: str = Form(None),
    tag: str = Form(None),
    avatar: str = Form(None),
    coverPhoto: str = Form(None),
    # 🎯 File uploads（不受 1MB form field 限制）
    avatar_file: UploadFile = File(None),
    cover_file: UploadFile = File(None),
):
    """Create or update user profile with optional InBody data"""
    print(f"[POST /api/user/profile] user_id={user_id}, name={name}, avatar_str={bool(avatar)}, avatar_file={bool(avatar_file and avatar_file.filename)}, cover_file={bool(cover_file and cover_file.filename)}")

    # 🎯 處理圖片上傳：優先 File upload，其次 Form string
    def _save_upload(uid, field, upload_file):
        """Save UploadFile to DATA_DIR/uploads/profiles/"""
        if not upload_file or not upload_file.filename:
            return None
        try:
            import asyncio
            profile_upload_dir = os.path.join(DATA_DIR, "uploads", "profiles")
            os.makedirs(profile_upload_dir, exist_ok=True)
            ext = os.path.splitext(upload_file.filename)[1] or '.jpg'
            fname = f"{uid}_{field}_{int(datetime.now().timestamp())}{ext}"
            fpath = os.path.join(profile_upload_dir, fname)
            # Read synchronously since we're already in async context
            contents = asyncio.get_event_loop().run_until_complete(upload_file.read()) if False else None
            url = f"/static/uploads/profiles/{fname}"
            return fpath, url
        except Exception as e:
            print(f"[SAVE UPLOAD] ❌ {field} error: {e}")
            return None

    avatar_url = avatar  # fallback to form string (could be existing URL)
    cover_url = coverPhoto

    # 🎯 File upload 處理
    if avatar_file and avatar_file.filename:
        try:
            profile_upload_dir = os.path.join(DATA_DIR, "uploads", "profiles")
            os.makedirs(profile_upload_dir, exist_ok=True)
            ext = os.path.splitext(avatar_file.filename)[1] or '.jpg'
            fname = f"{user_id}_avatar_{int(datetime.now().timestamp())}{ext}"
            fpath = os.path.join(profile_upload_dir, fname)
            contents = await avatar_file.read()
            with open(fpath, "wb") as f:
                f.write(contents)
            avatar_url = f"/static/uploads/profiles/{fname}"
            print(f"[SAVE IMAGE] ✅ avatar file → {fpath}")
        except Exception as e:
            print(f"[SAVE IMAGE] ❌ avatar file error: {e}")

    if cover_file and cover_file.filename:
        try:
            profile_upload_dir = os.path.join(DATA_DIR, "uploads", "profiles")
            os.makedirs(profile_upload_dir, exist_ok=True)
            ext = os.path.splitext(cover_file.filename)[1] or '.jpg'
            fname = f"{user_id}_cover_{int(datetime.now().timestamp())}{ext}"
            fpath = os.path.join(profile_upload_dir, fname)
            contents = await cover_file.read()
            with open(fpath, "wb") as f:
                f.write(contents)
            cover_url = f"/static/uploads/profiles/{fname}"
            print(f"[SAVE IMAGE] ✅ cover file → {fpath}")
        except Exception as e:
            print(f"[SAVE IMAGE] ❌ cover file error: {e}")

    goals_list = json.loads(goals) if goals else []
    profile = coach_profile.create_or_update_profile(
        user_id=user_id, name=name, height_cm=height_cm,
        weight_kg=weight_kg, age=age, gender=gender,
        fitness_level=fitness_level, goals=goals_list,
        body_fat_percent=body_fat_percent,
        skeletal_muscle_mass=skeletal_muscle_mass,
        body_water_percent=body_water_percent,
        visceral_fat_level=visceral_fat_level,
        bmr=bmr,
        protein_mass=protein_mass,
        mineral_mass=mineral_mass,
        body_fat_mass=body_fat_mass,
        bio=bio, city=city, tag=tag,
        avatar=avatar_url, coverPhoto=cover_url
    )
    return {"status": "success", "profile": profile}

@router.post("/api/user/profile/avatar")
async def upload_profile_avatar(
    user_id: str = Form(...),
    avatar_file: UploadFile = File(None),
    cover_file: UploadFile = File(None),
):
    """Upload avatar and/or cover photo as files, store URLs in profile"""
    import uuid
    profiles = coach_profile.load_user_profiles()
    profile = profiles.get(user_id, {})

    if avatar_file and avatar_file.filename:
        ext = os.path.splitext(avatar_file.filename)[1] or '.jpg'
        fname = f"avatar_{user_id}_{uuid.uuid4().hex[:8]}{ext}"
        fpath = os.path.join(UPLOAD_DIR, fname)
        contents = await avatar_file.read()
        with open(fpath, "wb") as f:
            f.write(contents)
        avatar_url = f"/static/uploads/{fname}"
        profile["avatar"] = avatar_url

    if cover_file and cover_file.filename:
        ext = os.path.splitext(cover_file.filename)[1] or '.jpg'
        fname = f"cover_{user_id}_{uuid.uuid4().hex[:8]}{ext}"
        fpath = os.path.join(UPLOAD_DIR, fname)
        contents = await cover_file.read()
        with open(fpath, "wb") as f:
            f.write(contents)
        cover_url = f"/static/uploads/{fname}"
        profile["coverPhoto"] = cover_url

    if user_id in profiles:
        profiles[user_id].update(profile)
    else:
        profile["user_id"] = user_id
        profiles[user_id] = profile

    profiles[user_id]["updated_at"] = datetime.now().isoformat()
    coach_profile.save_user_profiles(profiles)

    return {
        "status": "success",
        "avatar": profile.get("avatar"),
        "coverPhoto": profile.get("coverPhoto"),
    }

@router.get("/api/user/profile/{user_id}", dependencies=[Depends(owner_guard)])
async def get_profile(user_id: str):
    """Get user profile"""
    profile = coach_profile.get_user_profile(user_id)
    if not profile:
        return JSONResponse(status_code=404, content={"error": "Profile not found"})
    return profile

@router.get("/api/user/profiles")
async def get_all_profiles(request: Request):
    """社群「標註用戶」搜尋用的名單：只回顯示名稱。

    🔴 以前不用登入就回傳「所有人的完整個人檔案」（身高、體重、年齡、體脂…），
    任何人打一次就拿到全部會員的身體資料（App Store 5.1.1／5.1.2）。
    現在：必須登入，而且每個人只給名字欄位 —— 前端標註搜尋只讀 name/displayName/username。
    """
    if not getattr(request.state, "user_id", None):
        raise HTTPException(status_code=401, detail="Authentication required",
                            headers={"WWW-Authenticate": "Bearer"})
    profiles = coach_profile.load_user_profiles() or {}
    return {
        uid: {k: p.get(k) for k in ("name", "displayName", "username") if p.get(k)}
        for uid, p in profiles.items() if isinstance(p, dict)
    }


@router.delete("/api/user/{user_id}", dependencies=[Depends(owner_guard)])
async def delete_user_account(user_id: str, request: Request):
    """
    完整刪除使用者帳號（DELETE）：
    與 POST /api/user/delete 共用 _purge_all_user_data，避免兩邊規則漂移。
    """
    jwt_uid = getattr(request.state, "user_id", None)
    if not jwt_uid or jwt_uid != user_id:
        return JSONResponse(status_code=403, content={"error": "Forbidden: can only delete your own account"})

    deleted = _purge_all_user_data(user_id)
    return {"success": True, "user_id": user_id, "deleted": deleted, "count": len(deleted)}


# ── 共用「全域帳號刪除工具」 ─────────────────────────────────────────
# 兩個 endpoint（DELETE /api/user/{uid} 與 POST /api/user/delete）共用同一份邏輯
# 確保任何來源的清除請求，都會：
#   1) 同時掃描 root /data 與 backend/data 兩個目錄（避免 DATA_DIR 不一致漏刪）
#   2) 移除「以 user_id 做 key 的字典」內的條目
#   3) 過濾掉「list 內帶 user_id 欄位」的條目（例：custom_exercises.json）
#   4) 刪除任何檔名含 user_id 的獨立檔案
#   5) 刪除頭貼/封面上傳檔
def _purge_all_user_data(user_id: str) -> list:
    """回傳被清除/修改的檔案列表（相對路徑），供 debug。"""
    import glob as glob_module

    # Phase 2：先清掉 DB 裡所有已遷移資料表的該使用者資料（避免刪帳號後殘留）
    try:
        from repositories import profile_repo
        db_deleted = profile_repo.purge_user_everywhere(user_id)
        print(f"[purge] DB 清除: {db_deleted}")
    except Exception as _db_err:
        print(f"[purge] DB 清除失敗（非致命）: {_db_err}")

    # ⚠️ 最後一步，也是最容易漏的一步：把「帳號本體」刪掉。
    #    只清資料表的話，users 那一列與 auth_providers 的綁定還在 ——
    #    下次用同一個 Google / Apple 登入會拿回同一個 user_id，
    #    Email、顯示名稱、頭貼也都還留在資料庫。
    #    App Store 5.1.1(v) 要的是「帳號與個資一起消失」，不是「清空內容」。
    # 用 Apple 登入的帳號：先向 Apple 撤銷授權（5.1.1(v) 對 Sign in with Apple 的要求）
    try:
        from api_auth import revoke_apple_for_user
        print(f"[purge] Apple 授權撤銷: {revoke_apple_for_user(user_id)}")
    except Exception as _rv_err:
        print(f"[purge] Apple 授權撤銷失敗（非致命）: {_rv_err}")
    try:
        from core.database import SessionLocal as _UsersSession
        from core import user_service as _user_service
        with _UsersSession() as _udb:
            acct = _user_service.delete_user_account(_udb, user_id)
        print(f"[purge] 帳號本體: {acct}")
    except Exception as _acct_err:
        print(f"[purge] 帳號本體刪除失敗（非致命）: {_acct_err}")

    # 兩個可能的資料目錄都掃，徹底清乾淨
    root_data_dir = DATA_DIR  # …/data
    backend_data_dir = os.path.join(BASE_DIR, "data")  # …/backend/data
    candidate_dirs = []
    for d in (root_data_dir, backend_data_dir):
        if d and os.path.isdir(d) and d not in candidate_dirs:
            candidate_dirs.append(d)

    # 已知會以「user_id 為字典 key」的共用檔
    shared_dict_filenames = [
        "user_profiles.json",
        "workout_history.json",
        "strength_history.json",
        "nutrition_log.json",
        "inbody_history.json",
        "activities.json",
        "personal_records.json",
        "cardio_sessions.json",
        "segment_efforts.json",
        "blocks.json",
        "friendships.json",
        "friend_requests.json",
        "kudos.json",
        "comments.json",
        "challenge_participants.json",
        "evolution_config.json",
    ]

    # 已知以 list 儲存、每筆有 user_id 欄位的共用檔
    shared_list_filenames = [
        "custom_exercises.json",
        "social_challenges.json",
        "challenges.json",
        "segments.json",
    ]

    # 以 user_id 命名的獨立檔案 patterns（僅檔名，搭配每個 candidate_dir 使用）
    standalone_patterns = [
        f"user_{user_id}_*.json",
        f"user_{user_id}.json",
        f"cardio_sessions_{user_id}.json",
        f"sonic_library_{user_id}.json",
        f"programs_{user_id}.json",
        f"workout_plans_{user_id}.json",
        f"evolution_{user_id}*.json",
        f"nutrition_sql_{user_id}.db",
        f"nutrition_{user_id}.db",
        f"{user_id}_*.json",
        f"*_{user_id}.json",
    ]

    deleted: list = []

    for dpath in candidate_dirs:
        # ── 1. 從共用 dict-keyed 檔移除此 user_id 的 key ──
        for fname in shared_dict_filenames:
            fpath = os.path.join(dpath, fname)
            if not os.path.exists(fpath):
                continue
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                changed = False
                if isinstance(data, dict) and user_id in data:
                    del data[user_id]
                    changed = True
                if changed:
                    save_json_atomic(fpath, data, indent=2)
                    deleted.append(os.path.relpath(fpath, BASE_DIR))
            except Exception as e:
                print(f"[purge_user] 略過 {fpath}: {e}")

        # ── 2. 從 list-based 共用檔過濾掉此 user_id 的條目 ──
        for fname in shared_list_filenames:
            fpath = os.path.join(dpath, fname)
            if not os.path.exists(fpath):
                continue
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    before = len(data)
                    data = [
                        it for it in data
                        if not (isinstance(it, dict) and (
                            it.get("user_id") == user_id
                            or it.get("userId") == user_id
                            or it.get("owner_id") == user_id
                            or it.get("creator_id") == user_id
                        ))
                    ]
                    if len(data) != before:
                        save_json_atomic(fpath, data, indent=2)
                        deleted.append(os.path.relpath(fpath, BASE_DIR))
            except Exception as e:
                print(f"[purge_user] 略過 list {fpath}: {e}")

        # ── 3. 刪除以 user_id 命名的獨立檔案 ──
        for pat in standalone_patterns:
            for fpath in glob_module.glob(os.path.join(dpath, pat)):
                # 避免誤刪共用檔
                base = os.path.basename(fpath)
                if base in shared_dict_filenames or base in shared_list_filenames:
                    continue
                try:
                    os.remove(fpath)
                    deleted.append(os.path.relpath(fpath, BASE_DIR))
                except Exception as e:
                    print(f"[purge_user] 無法刪除 {fpath}: {e}")

        # ── 4. 上傳圖片（頭貼、封面） ──
        for sub in ("uploads", os.path.join("uploads", "profiles")):
            up_dir = os.path.join(dpath, sub)
            if not os.path.isdir(up_dir):
                continue
            for fpath in glob_module.glob(os.path.join(up_dir, f"{user_id}_*")):
                try:
                    os.remove(fpath)
                    deleted.append(os.path.relpath(fpath, BASE_DIR))
                except Exception as e:
                    print(f"[purge_user] 無法刪除圖片 {fpath}: {e}")
            for fpath in glob_module.glob(os.path.join(up_dir, f"*{user_id}*")):
                try:
                    os.remove(fpath)
                    deleted.append(os.path.relpath(fpath, BASE_DIR))
                except Exception as e:
                    print(f"[purge_user] 無法刪除圖片 {fpath}: {e}")

    # ── 5. SQLite 共用資料庫：刪掉此 user_id 的 row ──
    # 營養日誌、活動 log 等可能寫在共用 .db 內，僅靠檔名 pattern 抓不到
    import sqlite3
    sqlite_targets = []
    for dpath in candidate_dirs:
        for db_name in ("nutrition.db",):
            p = os.path.join(dpath, db_name)
            if os.path.isfile(p):
                sqlite_targets.append(p)
    for db_path in sqlite_targets:
        try:
            conn = sqlite3.connect(db_path, timeout=10.0)
            c = conn.cursor()
            # 取得所有有 user_id 欄位的 table
            c.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [r[0] for r in c.fetchall()]
            total_rows = 0
            for tbl in tables:
                try:
                    c.execute(f"PRAGMA table_info('{tbl}')")
                    cols = [r[1] for r in c.fetchall()]
                    if "user_id" in cols:
                        c.execute(f"DELETE FROM \"{tbl}\" WHERE user_id = ?", (user_id,))
                        if c.rowcount > 0:
                            total_rows += c.rowcount
                except Exception as inner:
                    print(f"[purge_user] sqlite 表 {tbl} 跳過: {inner}")
            conn.commit()
            conn.close()
            if total_rows > 0:
                rel = os.path.relpath(db_path, BASE_DIR)
                deleted.append(f"{rel} (sqlite -{total_rows} rows)")
        except Exception as e:
            print(f"[purge_user] sqlite {db_path} 失敗: {e}")

    print(f"[purge_user] ✅ 帳號 {user_id} 已清除，共 {len(deleted)} 筆資料 (dirs={candidate_dirs})")
    return deleted


@router.post("/api/user/delete")
async def delete_user_account_post(request: Request):
    """
    POST 版本的帳號刪除（和 DELETE /api/user/{user_id} 邏輯相同）
    用 POST 是為了繞過 Safari 對 DELETE method CORS preflight 的限制。
    Body: { "user_id": "line_Uxxxxxxxx" }
    """
    try:
        body = await request.json()
        user_id = body.get("user_id", "")
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})

    if not user_id:
        return JSONResponse(status_code=400, content={"error": "user_id is required"})

    # 🔴 安全驗證：一定要帶 JWT，而且只能刪自己。
    #    以前「沒帶 JWT 就放行」—— 這支路徑在 /api/user/ 的保留字裡（delete），
    #    集中式 owner guard 不會擋；body 也不叫參數 user_id，identity_guard 包不到。
    #    結果任何人不帶 token、POST 別人的 user_id（社群頁看得到）就能刪掉別人整個帳號。
    #    訪客也有匿名 token（utils/guestAuth），前端刪除前會先補一張。
    jwt_uid = getattr(request.state, "user_id", None)
    if not jwt_uid:
        return JSONResponse(status_code=401, content={"error": "Authentication required"},
                            headers={"WWW-Authenticate": "Bearer"})
    if jwt_uid != user_id:
        return JSONResponse(status_code=403, content={"error": "Forbidden: can only delete your own account"})

    deleted = _purge_all_user_data(user_id)
    return {"success": True, "user_id": user_id, "deleted": deleted, "count": len(deleted)}


# ============ Data Export（GDPR / App Store 合規） ============
# ⚠️ 檔名清單需與 _purge_all_user_data 保持同步：purge 會刪什麼，export 就匯出什麼。

@router.get("/api/user/export/{user_id}", dependencies=[Depends(owner_guard)])
async def export_user_data(user_id: str):
    """一鍵匯出使用者全部資料（JSON）。對應設定頁「匯出我的資料」。"""
    import glob as glob_module

    export = {
        "app": "DRVN",
        "user_id": user_id,
        "exported_at": datetime.now().isoformat(),
        "data": {},
    }

    root_data_dir = DATA_DIR
    backend_data_dir = os.path.join(BASE_DIR, "data")
    candidate_dirs = []
    for d in (root_data_dir, backend_data_dir):
        if d and os.path.isdir(d) and d not in candidate_dirs:
            candidate_dirs.append(d)

    # 與 _purge_all_user_data 相同的檔案目錄（同步維護）
    shared_dict_filenames = [
        "user_profiles.json", "workout_history.json", "strength_history.json",
        "nutrition_log.json", "inbody_history.json", "activities.json",
        "personal_records.json", "cardio_sessions.json", "segment_efforts.json",
        "blocks.json", "friendships.json", "friend_requests.json", "kudos.json",
        "comments.json", "challenge_participants.json", "evolution_config.json",
    ]
    shared_list_filenames = [
        "custom_exercises.json", "social_challenges.json", "challenges.json", "segments.json",
    ]
    standalone_patterns = [
        f"user_{user_id}_*.json", f"user_{user_id}.json",
        f"cardio_sessions_{user_id}.json", f"sonic_library_{user_id}.json",
        f"programs_{user_id}.json", f"workout_plans_{user_id}.json",
        f"evolution_{user_id}*.json",
    ]

    def _put(key: str, value):
        if value in (None, {}, []):
            return
        if key in export["data"]:
            # 兩個資料目錄都有同名檔 → 保留較大的那份
            try:
                if len(json.dumps(value)) <= len(json.dumps(export["data"][key])):
                    return
            except Exception:
                return
        export["data"][key] = value

    for dpath in candidate_dirs:
        # 1. dict-keyed 共用檔：取出此 user_id 的值
        for fname in shared_dict_filenames:
            fpath = os.path.join(dpath, fname)
            if not os.path.exists(fpath):
                continue
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict) and user_id in data:
                    _put(fname[:-5], data[user_id])
            except Exception as e:
                print(f"[export_user] 略過 {fpath}: {e}")

        # 2. list-based 共用檔：過濾出此 user_id 的條目
        for fname in shared_list_filenames:
            fpath = os.path.join(dpath, fname)
            if not os.path.exists(fpath):
                continue
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    mine = [
                        it for it in data
                        if isinstance(it, dict) and (
                            it.get("user_id") == user_id
                            or it.get("creator_id") == user_id
                            or it.get("owner_id") == user_id
                        )
                    ]
                    _put(fname[:-5], mine)
            except Exception as e:
                print(f"[export_user] 略過 {fpath}: {e}")

        # 3. 以 user_id 命名的獨立 JSON 檔
        for pattern in standalone_patterns:
            for fpath in glob_module.glob(os.path.join(dpath, pattern)):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        _put(os.path.basename(fpath)[:-5], json.load(f))
                except Exception as e:
                    print(f"[export_user] 略過 {fpath}: {e}")

    export["sections"] = sorted(export["data"].keys())
    return JSONResponse(content=export)


# ============ Monthly Deep Analysis Report ============

@router.get("/api/user/monthly-report/{user_id}", dependencies=[Depends(owner_guard), Depends(require_member)])
async def get_monthly_report(user_id: str, month: str = None):
    """
    月度深度分析報告 API
    - month: YYYY-MM 格式，預設當月
    回傳：健身/跑步/營養 三大系統分析 + 計劃更改建議
    """
    from collections import defaultdict
    import math

    # ── 1. 確定月份範圍 ──
    now = datetime.now()
    if month:
        try:
            year, mon = int(month.split('-')[0]), int(month.split('-')[1])
        except:
            year, mon = now.year, now.month
    else:
        year, mon = now.year, now.month

    month_start = datetime(year, mon, 1)
    if mon == 12:
        month_end = datetime(year + 1, 1, 1)
    else:
        month_end = datetime(year, mon + 1, 1)
    days_in_month = (month_end - month_start).days

    # ── 2. 載入所有資料來源 ──
    profile = coach_profile.get_user_profile(user_id) or {}
    # 🟢 P3 Fix：改讀 DB（Phase 2 後新 session 只寫 DB），舊 JSON 為輔
    all_workouts = workout_history.get_user_workout_history(user_id) or \
        workout_history.load_workout_history().get(user_id, [])
    all_cardio = cardio_storage.load_sessions()

    # 營養資料 — 從 SQLite DB 讀取（主要資料來源）
    import core.nutrition_db as nutrition_db
    nutrition_log = {}  # { "YYYY-MM-DD": { "summary": {...} } }
    try:
        for day_offset in range(days_in_month):
            date_str = (month_start + timedelta(days=day_offset)).strftime("%Y-%m-%d")
            day_data = nutrition_db.get_daily_summary_sql(user_id, date_str)
            if day_data and day_data.get("summary", {}).get("calories", 0) > 0:
                nutrition_log[date_str] = day_data
    except Exception as e:
        print(f"[monthly-report] nutrition_db read error: {e}")
        # Fallback to JSON
        nutrition_path = os.path.join(DATA_DIR, 'nutrition_log.json')
        if os.path.exists(nutrition_path):
            with open(nutrition_path, 'r', encoding='utf-8') as f:
                nutrition_log = json.load(f).get(user_id, {})

    # 力量紀錄
    strength_path = os.path.join(DATA_DIR, 'strength_history.json')
    strength_history = {}
    if os.path.exists(strength_path):
        with open(strength_path, 'r', encoding='utf-8') as f:
            strength_history = json.load(f).get(user_id, {})

    # InBody 歷史
    inbody_path = os.path.join(DATA_DIR, 'inbody_history.json')
    inbody_records = []
    if os.path.exists(inbody_path):
        with open(inbody_path, 'r', encoding='utf-8') as f:
            inbody_records = json.load(f).get(user_id, [])

    # Activities（跑步 + 健身的社群活動紀錄）
    activities_path = os.path.join(DATA_DIR, 'activities.json')
    all_activities = []
    if os.path.exists(activities_path):
        with open(activities_path, 'r', encoding='utf-8') as f:
            all_activities = json.load(f)

    # ── 3. 篩選當月資料 ──
    def in_month(ts_str):
        """判斷 ISO timestamp 是否在目標月份"""
        if not ts_str:
            return False
        try:
            dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00').split('+')[0].split('.')[0])
            return month_start <= dt < month_end
        except:
            return False

    def in_month_date(date_str):
        """判斷 YYYY-MM-DD 格式是否在目標月份"""
        if not date_str:
            return False
        try:
            dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
            return month_start <= dt < month_end
        except:
            return False

    # 當月健身紀錄
    month_workouts = [w for w in all_workouts if in_month(w.get('timestamp'))]

    # 當月跑步紀錄
    month_cardio = []
    cardio_list = all_cardio.values() if isinstance(all_cardio, dict) else all_cardio
    for sess in cardio_list:
        if sess.get('user_id') == user_id and in_month(sess.get('created_at') or sess.get('date') or sess.get('timestamp')):
            month_cardio.append(sess)

    # 當月活動紀錄
    month_activities = [a for a in all_activities if a.get('user_id') == user_id and in_month(a.get('created_at'))]

    # 當月營養（nutrition_log 已經按月份篩選，直接使用）
    month_nutrition = nutrition_log

    # ══════════════════════════════════════
    # 4. 健身系統分析
    # ══════════════════════════════════════
    fitness_sessions = len(month_workouts)
    total_volume = sum(w.get('total_volume', 0) or 0 for w in month_workouts)
    total_sets = sum(w.get('completed_sets_count', 0) or 0 for w in month_workouts)
    total_reps = 0
    avg_score = 0
    best_score = 0
    # 耗力指數先用佔位，workout_trend 計算後再更新（見下方）
    total_duration_mins = sum(w.get('duration_mins', 0) or 0 for w in month_workouts)

    # 肌群分布
    muscle_groups = defaultdict(lambda: {"sessions": 0, "volume": 0, "sets": 0})
    for w in month_workouts:
        fg = (w.get('focus_group') or 'other').lower()
        muscle_groups[fg]["sessions"] += 1
        muscle_groups[fg]["volume"] += w.get('total_volume', 0) or 0
        # 統計 exercises
        for ex in w.get('exercises', []):
            for s in ex.get('sets', []):
                if s.get('completed'):
                    total_reps += s.get('reps', 0) or 0

    # 肌群百分比
    total_mg_sessions = sum(v["sessions"] for v in muscle_groups.values()) or 1
    muscle_distribution = {}
    for mg, data in muscle_groups.items():
        muscle_distribution[mg] = {
            "sessions": data["sessions"],
            "volume": round(data["volume"]),
            "percentage": round(data["sessions"] / total_mg_sessions * 100, 1)
        }

    # PR 突破
    prs_this_month = []
    for w in month_workouts:
        for pr in w.get('pr_alerts', []):
            prs_this_month.append(pr)

    # 每次訓練趨勢 + 耗力指數
    # 優先使用 overall_score (RPE-based, 由前端 calculateEffortScore 計算)
    # 若 overall_score <= 10 (舊資料或未記錄), fallback 到 volume+duration 標準化
    sorted_workouts = sorted(month_workouts, key=lambda x: x.get('timestamp', ''))
    all_vols = [w.get('total_volume', 0) or 0 for w in sorted_workouts]
    all_durs = [w.get('duration_mins', 0) or 0 for w in sorted_workouts]
    max_vol = max(all_vols) if all_vols else 1
    max_dur = max(all_durs) if all_durs else 1

    workout_trend = []
    for w in sorted_workouts:
        vol = w.get('total_volume', 0) or 0
        dur = w.get('duration_mins', 0) or 0
        rpe_score = w.get('overall_score', 0) or 0
        if rpe_score > 10:
            effort = rpe_score  # 真實 RPE 耗力分數
        else:
            effort = round((vol / max(max_vol, 1)) * 70 + (dur / max(max_dur, 1)) * 30)
        workout_trend.append({
            "date": w.get('timestamp', '')[:10],
            "score": effort,
            "volume": vol,
            "duration": dur,
            "focus": w.get('focus_group', '')
        })

    # 耗力指數統計
    effort_scores = [w['score'] for w in workout_trend]
    avg_score = round(sum(effort_scores) / len(effort_scores), 1) if effort_scores else 0
    best_score = max(effort_scores) if effort_scores else 0

    # 完成率
    completion_rates = [w.get('metrics', {}).get('completion_rate', 0) for w in month_workouts if w.get('metrics')]
    avg_completion = round(sum(completion_rates) / len(completion_rates), 1) if completion_rates else 0

    # ══════════════════════════════════════
    # 5. 跑步系統分析
    # ══════════════════════════════════════
    run_count = len(month_cardio)
    total_distance = sum(s.get('metrics', {}).get('distance_km', 0) or 0 for s in month_cardio)
    total_run_duration = sum(s.get('metrics', {}).get('duration_seconds', 0) or 0 for s in month_cardio)
    total_elevation = sum(s.get('metrics', {}).get('elevation_gain_m', 0) or 0 for s in month_cardio)
    total_run_calories = sum(s.get('metrics', {}).get('calories', 0) or 0 for s in month_cardio)

    # 心率分區彙總（跨當月所有跑步 session 累加 zoneStats，單位：分鐘）
    _zone_acc = {"Warm-up": 0, "Fat Burn": 0, "Aerobic": 0, "Anaerobic": 0, "Extreme": 0}
    for s in month_cardio:
        zs = s.get('metrics', {}).get('zoneStats') or {}
        for _zk in _zone_acc:
            try:
                _zone_acc[_zk] += float(zs.get(_zk, 0) or 0)
            except (TypeError, ValueError):
                pass
    hr_zones_agg = {
        "z2": round(_zone_acc["Warm-up"] + _zone_acc["Fat Burn"]),  # 低強度 / 燃脂
        "z3": round(_zone_acc["Aerobic"]),                          # 有氧
        "z4": round(_zone_acc["Anaerobic"] + _zone_acc["Extreme"]), # 無氧 / 極限
    }

    # 配速趨勢
    pace_trend = []
    hr_data = []
    individual_runs = []
    for s in sorted(month_cardio, key=lambda x: x.get('created_at') or x.get('date', '')):
        metrics = s.get('metrics', {})
        pace = metrics.get('avg_pace', 0) or 0
        # Fallback: compute pace from duration / distance if avg_pace not stored
        if pace == 0:
            dist_km = metrics.get('distance_km', 0) or 0
            dur_sec = metrics.get('duration_seconds', 0) or 0
            if dist_km > 0.01 and dur_sec > 0:
                pace = round(dur_sec / dist_km)
        pace_trend.append(pace)
        if metrics.get('heart_rate_avg'):
            hr_data.append(metrics['heart_rate_avg'])
        individual_runs.append({
            "date": (s.get('created_at') or s.get('date', ''))[:10],
            "distance": round(metrics.get('distance_km', 0) or 0, 2),
            "pace": pace,
            "duration": metrics.get('duration_seconds', 0) or 0,
            "calories": metrics.get('calories', 0) or 0,
            "elevation": metrics.get('elevation_gain_m', 0) or 0,
            "hr_avg": metrics.get('heart_rate_avg', 0) or 0,
        })

    valid_paces = [p for p in pace_trend if p > 0]
    avg_pace = round(sum(valid_paces) / len(valid_paces)) if valid_paces else 0
    avg_hr = round(sum(hr_data) / len(hr_data)) if hr_data else 0
    best_pace = min(valid_paces) if valid_paces else 0
    longest_run = max((r['distance'] for r in individual_runs), default=0)

    # 配速進步 (只用有效配速值)
    pace_improvement = 0
    if len(valid_paces) >= 4:
        first_half = sum(valid_paces[:len(valid_paces)//2]) / (len(valid_paces)//2)
        second_half = sum(valid_paces[len(valid_paces)//2:]) / (len(valid_paces) - len(valid_paces)//2)
        pace_improvement = round(first_half - second_half)  # 正數 = 變快

    # ══════════════════════════════════════
    # 6. 營養系統分析
    # ══════════════════════════════════════
    nutrition_targets = {
        "calories": profile.get('daily_calorie_target', 2200),
        "protein": profile.get('daily_protein_target', 120),
        "carbs": profile.get('daily_carb_target', 280),
        "fats": profile.get('daily_fat_target', 60),
    }
    nutrition_mode = profile.get('nutrition_mode', 'maintenance')

    logged_days = len(month_nutrition)
    daily_cals = []
    daily_protein = []
    daily_carbs = []
    daily_fats = []
    daily_water = []
    calorie_hit_days = 0
    protein_hit_days = 0
    nutrition_daily_records = []

    for date_key, day_data in month_nutrition.items():
        summary = day_data.get('summary', {})
        cal = summary.get('calories', 0) or 0
        prot = summary.get('protein', 0) or 0
        carb = summary.get('carbs', 0) or 0
        fat = summary.get('fats', 0) or 0
        water = summary.get('water', 0) or 0
        daily_cals.append(cal)
        daily_protein.append(prot)
        daily_carbs.append(carb)
        daily_fats.append(fat)
        daily_water.append(water)
        nutrition_daily_records.append({
            "date": date_key,
            "calories": round(cal),
            "protein": round(prot),
            "carbs": round(carb),
            "fats": round(fat),
        })
        # 達標判定（±15% 容許範圍）
        target_cal = nutrition_targets['calories']
        if target_cal > 0 and abs(cal - target_cal) / target_cal <= 0.15:
            calorie_hit_days += 1
        if nutrition_targets['protein'] > 0 and prot >= nutrition_targets['protein'] * 0.85:
            protein_hit_days += 1
    nutrition_daily_records.sort(key=lambda x: x['date'], reverse=True)

    avg_calories = round(sum(daily_cals) / len(daily_cals)) if daily_cals else 0
    avg_protein = round(sum(daily_protein) / len(daily_protein)) if daily_protein else 0
    avg_carbs = round(sum(daily_carbs) / len(daily_carbs)) if daily_carbs else 0
    avg_fats = round(sum(daily_fats) / len(daily_fats)) if daily_fats else 0
    # 平均每日補水量（water_ml → 公升）
    avg_hydration_l = round(sum(daily_water) / len(daily_water) / 1000, 1) if daily_water else 0
    calorie_adherence = round(calorie_hit_days / logged_days * 100) if logged_days else 0
    protein_adherence = round(protein_hit_days / logged_days * 100) if logged_days else 0

    # ══════════════════════════════════════
    # 7. 身體組成變化
    # ══════════════════════════════════════
    month_inbody = [r for r in inbody_records if in_month_date(r.get('measurement_date'))]
    body_changes = {}
    if len(month_inbody) >= 2:
        first = month_inbody[-1]  # 最早
        last = month_inbody[0]   # 最新
        body_changes = {
            "weight_delta": round((last.get('weight_kg', 0) or 0) - (first.get('weight_kg', 0) or 0), 1),
            "fat_delta": round((last.get('body_fat_percent', 0) or 0) - (first.get('body_fat_percent', 0) or 0), 1),
            "muscle_delta": round((last.get('skeletal_muscle_mass', 0) or 0) - (first.get('skeletal_muscle_mass', 0) or 0), 1),
        }
    elif len(month_inbody) == 1:
        body_changes = {
            "weight_delta": 0,
            "fat_delta": 0,
            "muscle_delta": 0,
            "latest_weight": month_inbody[0].get('weight_kg'),
            "latest_fat": month_inbody[0].get('body_fat_percent'),
            "latest_muscle": month_inbody[0].get('skeletal_muscle_mass'),
        }

    # 體重曲線（當月 inbody 紀錄，由舊到新）
    weight_trend = [round(r.get('weight_kg'), 1) for r in reversed(month_inbody) if r.get('weight_kg')]
    if weight_trend:
        body_changes["weight_trend"] = weight_trend

    # ══════════════════════════════════════
    # 8. 訓練一致性分析
    # ══════════════════════════════════════
    training_dates = set()
    for w in month_workouts:
        ts = w.get('timestamp', '')[:10]
        if ts:
            try:
                training_dates.add(datetime.strptime(ts, "%Y-%m-%d").day)
            except:
                pass
    for s in month_cardio:
        ts = (s.get('created_at') or s.get('date', ''))[:10]
        if ts:
            try:
                training_dates.add(datetime.strptime(ts, "%Y-%m-%d").day)
            except:
                pass

    active_days = len(training_dates)
    consistency_pct = round(active_days / days_in_month * 100) if days_in_month else 0

    # 最長連續天數
    sorted_days = sorted(training_dates)
    best_streak = 0
    current_streak = 0
    for i, day in enumerate(sorted_days):
        if i == 0 or day == sorted_days[i-1] + 1:
            current_streak += 1
        else:
            current_streak = 1
        best_streak = max(best_streak, current_streak)

    # 每週訓練頻率
    weekly_freq = defaultdict(int)
    for day in sorted_days:
        week_num = (day - 1) // 7
        weekly_freq[week_num] += 1
    avg_weekly_sessions = round(sum(weekly_freq.values()) / max(len(weekly_freq), 1), 1)

    # ══════════════════════════════════════
    # 9. 🎯 計劃更改建議演算法
    # ══════════════════════════════════════
    recommendations = []

    # --- 9a. 訓練頻率建議 ---
    target_weekly = profile.get('weekly_frequency', 4) or 4
    if avg_weekly_sessions < target_weekly * 0.7:
        recommendations.append({
            "category": "training",
            "priority": "high",
            "icon": "calendar",
            "title": "訓練頻率不足",
            "description": f"本月平均每週 {avg_weekly_sessions} 次，低於目標 {target_weekly} 次。建議降低每次訓練量，提高頻率。",
            "action": "adjust_frequency",
            "suggestion": f"建議將每週訓練調整為 {max(3, target_weekly - 1)} 次，每次 40-50 分鐘",
            "data": {"current": avg_weekly_sessions, "target": target_weekly}
        })
    elif avg_weekly_sessions >= target_weekly * 1.3:
        recommendations.append({
            "category": "recovery",
            "priority": "medium",
            "icon": "heart",
            "title": "訓練頻率偏高，注意恢復",
            "description": f"本月平均每週 {avg_weekly_sessions} 次，超出目標。確保安排足夠休息日。",
            "action": "add_rest_days",
            "suggestion": "每訓練 2-3 天安排 1 天主動恢復日（輕度有氧 + 拉伸）",
            "data": {"current": avg_weekly_sessions, "target": target_weekly}
        })

    # --- 9b. 肌群平衡建議 ---
    if muscle_distribution:
        pcts = {k: v["percentage"] for k, v in muscle_distribution.items()}
        max_mg = max(pcts, key=pcts.get) if pcts else ""
        min_mg = min(pcts, key=pcts.get) if pcts else ""
        if pcts.get(max_mg, 0) > 40 and pcts.get(min_mg, 0) < 15:
            mg_names = {"chest": "胸部", "back": "背部", "legs": "腿部", "arms": "手臂", "shoulders": "肩膀", "core": "核心"}
            recommendations.append({
                "category": "training",
                "priority": "high",
                "icon": "balance",
                "title": f"肌群失衡：{mg_names.get(max_mg, max_mg)} 過多",
                "description": f"{mg_names.get(max_mg, max_mg)} 佔 {pcts[max_mg]:.0f}%，{mg_names.get(min_mg, min_mg)} 僅 {pcts[min_mg]:.0f}%。長期失衡可能導致傷害。",
                "action": "rebalance_muscles",
                "suggestion": f"建議每週增加 1-2 次{mg_names.get(min_mg, min_mg)}訓練，減少{mg_names.get(max_mg, max_mg)}訓練 1 次",
                "data": {"dominant": max_mg, "weak": min_mg, "dominant_pct": pcts[max_mg], "weak_pct": pcts[min_mg]}
            })

    # --- 9c. 訓練強度建議 ---
    if avg_score > 0:
        if avg_score < 60:
            recommendations.append({
                "category": "training",
                "priority": "high",
                "icon": "trending-down",
                "title": "訓練品質需要提升",
                "description": f"平均訓練評分 {avg_score}/100，動作品質有待加強。",
                "action": "reduce_weight",
                "suggestion": "建議降低 10-15% 重量，專注動作品質與完整 ROM",
                "data": {"avg_score": avg_score}
            })
        elif avg_score > 85:
            recommendations.append({
                "category": "training",
                "priority": "medium",
                "icon": "trending-up",
                "title": "表現優秀，可考慮漸進超負荷",
                "description": f"平均訓練評分 {avg_score}/100，狀態很好！",
                "action": "increase_weight",
                "suggestion": "下個月可嘗試增加 5% 訓練重量，或增加 1 組訓練量",
                "data": {"avg_score": avg_score}
            })

    # --- 9d. 跑步建議 ---
    if run_count > 0:
        if pace_improvement > 10:
            recommendations.append({
                "category": "cardio",
                "priority": "low",
                "icon": "zap",
                "title": "配速持續進步中！",
                "description": f"月底比月初平均快了 {pace_improvement} 秒/公里，維持目前訓練節奏。",
                "action": "maintain_cardio",
                "suggestion": "考慮加入 1 次間歇訓練（如 400m x 8）以進一步突破",
                "data": {"improvement_sec": pace_improvement}
            })
        elif pace_improvement < -10:
            recommendations.append({
                "category": "cardio",
                "priority": "medium",
                "icon": "alert",
                "title": "配速有下降趨勢",
                "description": f"月底比月初慢了 {abs(pace_improvement)} 秒/公里，可能是過度訓練或恢復不足。",
                "action": "reduce_cardio_intensity",
                "suggestion": "下週減少 20% 跑量，增加 Easy Run 比例（Z2 心率）",
                "data": {"decline_sec": abs(pace_improvement)}
            })

        if total_distance > 0 and longest_run / total_distance > 0.4:
            recommendations.append({
                "category": "cardio",
                "priority": "medium",
                "icon": "distribute",
                "title": "跑量分配不均",
                "description": f"單次最長跑 {longest_run:.1f}km 佔總跑量 {longest_run/total_distance*100:.0f}%。建議分散訓練。",
                "action": "distribute_runs",
                "suggestion": "嘗試每週 3-4 次短跑（5-8km）+ 1 次長跑，取代少次大量",
                "data": {"longest": longest_run, "total": total_distance}
            })

    # --- 9e. 營養建議 ---
    if logged_days > 0:
        if calorie_adherence < 60:
            diff = avg_calories - nutrition_targets['calories']
            direction = "過多" if diff > 0 else "不足"
            recommendations.append({
                "category": "nutrition",
                "priority": "high",
                "icon": "utensils",
                "title": f"熱量攝取{direction}",
                "description": f"僅 {calorie_adherence}% 天數達標（±15%），平均 {avg_calories} kcal vs 目標 {nutrition_targets['calories']} kcal。",
                "action": "adjust_calories",
                "suggestion": f"{'減少零食和高油脂食物' if diff > 0 else '增加正餐份量，確保每餐攝入足夠碳水和蛋白質'}",
                "data": {"adherence": calorie_adherence, "avg": avg_calories, "target": nutrition_targets['calories']}
            })

        if protein_adherence < 50:
            recommendations.append({
                "category": "nutrition",
                "priority": "high",
                "icon": "protein",
                "title": "蛋白質攝取嚴重不足",
                "description": f"僅 {protein_adherence}% 天數達標，平均 {avg_protein}g vs 目標 {nutrition_targets['protein']}g。",
                "action": "increase_protein",
                "suggestion": f"每餐至少攝入 {nutrition_targets['protein'] // 3}g 蛋白質，可補充乳清蛋白或雞胸肉",
                "data": {"adherence": protein_adherence, "avg": avg_protein, "target": nutrition_targets['protein']}
            })
    elif days_in_month > 7:
        recommendations.append({
            "category": "nutrition",
            "priority": "medium",
            "icon": "clipboard",
            "title": "缺少營養紀錄",
            "description": "本月沒有記錄任何營養攝取，無法分析飲食狀況。",
            "action": "start_logging",
            "suggestion": "每天花 2 分鐘記錄三餐，系統才能為你最佳化營養計劃",
            "data": {}
        })

    # --- 9f. 身體組成建議 ---
    if body_changes:
        w_delta = body_changes.get('weight_delta', 0)
        f_delta = body_changes.get('fat_delta', 0)
        m_delta = body_changes.get('muscle_delta', 0)
        if nutrition_mode == 'cutting' and w_delta > 0.5:
            recommendations.append({
                "category": "body",
                "priority": "high",
                "icon": "scale",
                "title": "減脂期體重反升",
                "description": f"目標減脂但體重增加了 {w_delta}kg，需檢視飲食和有氧量。",
                "action": "review_deficit",
                "suggestion": "確認每日熱量赤字 300-500kcal，增加每週 2 次低強度有氧",
                "data": body_changes
            })
        elif nutrition_mode == 'bulking' and m_delta <= 0 and w_delta > 1:
            recommendations.append({
                "category": "body",
                "priority": "medium",
                "icon": "scale",
                "title": "增肌期脂肪增加過快",
                "description": f"體重增加 {w_delta}kg 但肌肉未增長，可能熱量盈餘過大。",
                "action": "reduce_surplus",
                "suggestion": "將熱量盈餘從 500kcal 降至 250-300kcal，確保蛋白質充足",
                "data": body_changes
            })

    # 排序建議（高優先度在前）
    priority_order = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(key=lambda x: priority_order.get(x['priority'], 3))

    # ══════════════════════════════════════
    # 10. 組裝回傳
    # ══════════════════════════════════════
    months_zh = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
    months_en = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

    return {
        "meta": {
            "user_id": user_id,
            "user_name": profile.get('name', 'Athlete'),
            "month": f"{year}-{mon:02d}",
            "month_zh": months_zh[mon],
            "month_en": months_en[mon],
            "year": year,
            "days_in_month": days_in_month,
            "generated_at": datetime.now().isoformat(),
        },
        "overview": {
            "active_days": active_days,
            "consistency_pct": consistency_pct,
            "best_streak": best_streak,
            "avg_weekly_sessions": avg_weekly_sessions,
            "total_hours": round((total_duration_mins + total_run_duration / 60) / 60, 1),
            "training_days": sorted(list(training_dates)),
        },
        "fitness": {
            "sessions": fitness_sessions,
            "total_volume_kg": round(total_volume),
            "total_reps": total_reps,
            "total_sets": total_sets,
            "avg_score": avg_score,
            "best_score": best_score,
            "avg_completion_rate": avg_completion,
            "total_duration_mins": round(total_duration_mins),
            "muscle_distribution": muscle_distribution,
            "prs": prs_this_month[:5],
            "workout_trend": workout_trend,
        },
        "cardio": {
            "run_count": run_count,
            "total_distance_km": round(total_distance, 2),
            "total_duration_sec": round(total_run_duration),
            "total_elevation_m": round(total_elevation),
            "total_calories": round(total_run_calories),
            "avg_pace_sec": avg_pace,
            "best_pace_sec": best_pace,
            "avg_hr": avg_hr,
            "pace_improvement_sec": pace_improvement,
            "longest_run_km": round(longest_run, 2),
            "individual_runs": individual_runs,
            "hr_zones": hr_zones_agg,
        },
        "nutrition": {
            "mode": nutrition_mode,
            "logged_days": logged_days,
            "log_rate_pct": round(logged_days / days_in_month * 100) if days_in_month else 0,
            "avg_calories": avg_calories,
            "avg_protein": avg_protein,
            "avg_carbs": avg_carbs,
            "avg_fats": avg_fats,
            "avg_hydration_l": avg_hydration_l,
            "targets": nutrition_targets,
            "calorie_adherence_pct": calorie_adherence,
            "protein_adherence_pct": protein_adherence,
            "daily_records": nutrition_daily_records,
        },
        "body": body_changes,
        "recommendations": recommendations,
    }
