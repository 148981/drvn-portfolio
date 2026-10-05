from fastapi import APIRouter, HTTPException, Query, Depends, Request
from auth_guard import owner_guard, enforce_owner
from pydantic import BaseModel, confloat, constr
from typing import Optional, List, Dict
import core.nutrition_db as nutrition_db

router = APIRouter()
NonnegativeNumber = confloat(ge=0, allow_inf_nan=False)

class MealLogRequest(BaseModel):
    user_id: str
    name: constr(strip_whitespace=True, min_length=1, max_length=300)
    calories: NonnegativeNumber
    protein: NonnegativeNumber
    carbs: NonnegativeNumber
    fats: NonnegativeNumber
    fiber: Optional[NonnegativeNumber] = 0
    grams: Optional[NonnegativeNumber] = 100
    water_ml: Optional[NonnegativeNumber] = 0
    date: Optional[str] = None          # YYYY-MM-DD
    timestamp: Optional[str] = None    # ISO 8601，用於進食時鐘分析
    food_id: Optional[int] = None
    is_tfda: Optional[int] = 0
    is_global: Optional[int] = 0

    class Config:
        extra = "ignore"                # 忽略前端額外送來的欄位（如 id、emoji 等）

@router.get("/api/nutrition/sql/search")
def search_food(q: str = Query(..., min_length=1, max_length=200), limit: int = Query(20, ge=1, le=100), mode: str = "fts"):
    """Search for food items using FTS5 or LIKE fallback"""
    try:
        if mode == "like":
            conn = nutrition_db.get_db_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM food_items WHERE name LIKE ? LIMIT ?", (f"%{q}%", limit))
            columns = [column[0] for column in c.description]
            results = [dict(zip(columns, row)) for row in c.fetchall()]
            conn.close()
            return {"results": results}
            
        results = nutrition_db.search_food_fts(q, limit)
        return {"results": results}
    except Exception as e:
        # Fallback if FTS5 fails automatically
        try:
            conn = nutrition_db.get_db_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM food_items WHERE name LIKE ? LIMIT ?", (f"%{q}%", limit))
            columns = [column[0] for column in c.description]
            results = [dict(zip(columns, row)) for row in c.fetchall()]
            conn.close()
            return {"results": results}
        except Exception as fallback_e:
            raise HTTPException(status_code=500, detail=str(fallback_e))

@router.post("/api/nutrition/sql/log")
def log_meal_sql(log_data: MealLogRequest, request: Request):
    """Log a meal to the SQL database"""
    enforce_owner(request, log_data.user_id)
    try:
        entry = nutrition_db.log_meal_sql(log_data.user_id, log_data.dict())
        return {"status": "success", "entry": entry}
    except Exception as e:
        print(f"Error logging meal: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/nutrition/sql/history/{user_id}", dependencies=[Depends(owner_guard)])
def get_nutrition_history(user_id: str, days: int = 7, logged_only: bool = False):
    """Get nutrition history from SQL.

    ?logged_only=true  → only return days that have ≥1 meal logged
                         (used by deep-analysis tab so charts always have real data)
    ?logged_only=false → return every day in range, filling 0s for unlogged days
                         (used by history tab to show calendar-style overview)
    """
    try:
        history = nutrition_db.get_nutrition_history_sql(user_id, days, logged_only=logged_only)
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/nutrition/sql/meal/{meal_id}", dependencies=[Depends(owner_guard)])
def delete_meal_sql(meal_id: str, user_id: str):
    """Delete a specific meal by ID from SQL"""
    try:
        success = nutrition_db.delete_meal_sql(user_id, meal_id)
        if success:
            return {"status": "success", "message": "Meal deleted"}
        else:
            raise HTTPException(status_code=404, detail="Meal not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MealUpdateSqlRequest(BaseModel):
    user_id: str
    name: constr(strip_whitespace=True, min_length=1, max_length=300)
    calories: NonnegativeNumber
    protein: NonnegativeNumber
    carbs: NonnegativeNumber
    fats: NonnegativeNumber
    fiber: Optional[NonnegativeNumber] = 0
    water_ml: Optional[NonnegativeNumber] = 0

@router.put("/api/nutrition/sql/meal/{meal_id}")
def update_meal_sql_endpoint(meal_id: str, request: MealUpdateSqlRequest, http_request: Request):
    """Update a specific meal by ID from SQL"""
    enforce_owner(http_request, request.user_id)
    try:
        success = nutrition_db.update_meal_sql(request.user_id, meal_id, request.dict())
        if success:
            return {"status": "success", "message": "Meal updated"}
        else:
            raise HTTPException(status_code=404, detail="Meal not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/api/nutrition/sql/meal/{meal_id}")
def patch_meal_sql_endpoint(meal_id: str, request: MealUpdateSqlRequest, http_request: Request):
    """PATCH alias for PUT — allows frontend fallback when server cached stale routes"""
    return update_meal_sql_endpoint(meal_id, request, http_request)

@router.get("/api/nutrition/sql/daily/{user_id}", dependencies=[Depends(owner_guard)])
def get_daily_summary(user_id: str, date: str):
    """Get daily nutrition summary from SQL (含 meal_count 與每日目標 targets)"""
    try:
        data = nutrition_db.get_daily_summary_sql(user_id, date)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class NutritionTargetsRequest(BaseModel):
    user_id: str
    calories: float = 2000
    protein: float = 150
    carbs: float = 200
    fats: float = 65
    fiber: Optional[float] = 25
    water: Optional[float] = 2500
    mode: Optional[str] = "maintenance"

    class Config:
        extra = "ignore"


@router.get("/api/nutrition/sql/targets/{user_id}", dependencies=[Depends(owner_guard)])
def get_nutrition_targets(user_id: str):
    """讀取使用者每日營養目標（手錶與手機共用同一來源）"""
    try:
        return {"targets": nutrition_db.get_nutrition_targets(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/nutrition/sql/targets")
def save_nutrition_targets(req: NutritionTargetsRequest, request: Request):
    """手機端（NutritionEngine 算好後）推送每日營養目標，供 Apple Watch 讀取。
    與 POST /log 一致：user_id 在 body，故不掛 owner_guard（owner_guard 只解析 path/query）。"""
    enforce_owner(request, req.user_id)
    try:
        saved = nutrition_db.save_nutrition_targets(req.user_id, req.dict())
        return {"ok": True, "targets": saved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/nutrition/sql/recent/{user_id}", dependencies=[Depends(owner_guard)])
def get_recent_foods(user_id: str):
    """Get recent foods for user"""
    try:
        results = nutrition_db.get_recent_foods(user_id)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/nutrition/sql/recent-entries/{user_id}", dependencies=[Depends(owner_guard)])
def get_recent_meal_entries(user_id: str, days: int = 3):
    """Get individual meal diary entries for the last N days (for Food Log persistence)"""
    try:
        data = nutrition_db.get_recent_meal_entries(user_id, days)
        return {"days": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
