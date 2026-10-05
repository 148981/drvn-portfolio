"""
api_nutrition.py — 飲食/營養追蹤 (檔案版 Nutrition) 路由（Phase 1 從 main.py 抽出，行為不變）

對應前綴：/api/nutrition/*（meal CRUD、daily、history、recent、meals）
注意：與 api_nutrition_sql.py 的 /api/nutrition/sql/* 是不同路徑、不衝突。
依賴：core.nutrition
"""
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from auth_guard import owner_guard, enforce_owner
from fastapi.responses import JSONResponse

import core.nutrition as nutrition

router = APIRouter(tags=["nutrition"])


class MealLogBox(BaseModel):
    user_id: str
    name: str = "Meal"
    calories: int
    protein: int = 0
    carbs: int = 0
    fats: int = 0
    water: int = 0
    vegetables: int = 0
    type: str = "snack"

@router.post("/api/nutrition/meal")
async def log_meal(meal: MealLogBox, request: Request):
    """Log a consumed meal"""
    # 舊版檔案型路由：body 裡的 user_id 必須是本人（否則誰都能寫進別人的紀錄）
    enforce_owner(request, meal.user_id)
    try:
        entry = nutrition.log_meal(meal.user_id, meal.dict())
        return entry
    except Exception as e:
        print(f"Error logging meal: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/nutrition/daily/{user_id}", dependencies=[Depends(owner_guard)])
async def get_daily_nutrition(
    user_id: str, 
    date: str = Query(None, description="Date YYYY-MM-DD")
):
    """Get today's nutrition summary"""
    try:
        # Pass the date to the core function (logic already exists in core/nutrition.py)
        data = nutrition.get_daily_nutrition(user_id, date)
        return data
    except Exception as e:
        print(f"Error getting nutrition: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/nutrition/history/{user_id}", dependencies=[Depends(owner_guard)])
async def get_nutrition_history(user_id: str, days: int = 7):
    """Get nutrition history for charts"""
    try:
        history = nutrition.get_nutrition_history(user_id, days)
        return {"history": history}
    except Exception as e:
        print(f"Error getting nutrition history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/nutrition/recent/{user_id}", dependencies=[Depends(owner_guard)])
async def get_recent_foods(user_id: str, limit: int = 20):
    """Get list of distinct recently eaten foods"""
    try:
        foods = nutrition.get_recent_foods(user_id, limit)
        return {"foods": foods}
    except Exception as e:
        print(f"Error getting recent foods: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/nutrition/recent/{user_id}/{food_name}", dependencies=[Depends(owner_guard)])
async def delete_recent_food(user_id: str, food_name: str):
    """Delete a food item from recent history"""
    try:
        success = nutrition.delete_food(user_id, food_name)
        if success:
            return {"status": "success", "message": f"Deleted {food_name}"}
        else:
            return JSONResponse(status_code=404, content={"error": "Food not found"})
    except Exception as e:
        print(f"Error deleting recent food: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/nutrition/meals/{user_id}/{date_str}", dependencies=[Depends(owner_guard)])
async def get_meals_for_date(user_id: str, date_str: str):
    """Get all meals for a specific date with full details"""
    try:
        meals = nutrition.get_meals_for_date(user_id, date_str)
        return {"meals": meals}
    except Exception as e:
        print(f"Error getting meals for date: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class MealUpdateRequest(BaseModel):
    user_id: str
    name: str
    calories: int
    protein: int = 0
    carbs: int = 0
    fats: int = 0
    water: int = 0
    vegetables: int = 0

@router.put("/api/nutrition/meal/{meal_id}")
async def update_meal(meal_id: str, request: MealUpdateRequest, http_request: Request):
    """Update a specific meal by ID"""
    enforce_owner(http_request, request.user_id)
    try:
        updates = {
            "name": request.name,
            "calories": request.calories,
            "protein": request.protein,
            "carbs": request.carbs,
            "fats": request.fats,
            "water": request.water,
            "vegetables": request.vegetables
        }
        success = nutrition.update_meal(request.user_id, meal_id, updates)
        if success:
            return {"status": "success", "message": "Meal updated"}
        else:
            return JSONResponse(status_code=404, content={"error": "Meal not found"})
    except Exception as e:
        print(f"Error updating meal: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/nutrition/meal/{meal_id}")
async def delete_meal(meal_id: str, user_id: str, request: Request):
    """Delete a specific meal by ID"""
    enforce_owner(request, user_id)
    try:
        success = nutrition.delete_meal(user_id, meal_id)
        if success:
            return {"status": "success", "message": "Meal deleted"}
        else:
            return JSONResponse(status_code=404, content={"error": "Meal not found"})
    except Exception as e:
        print(f"Error deleting meal: {e}")
        raise HTTPException(status_code=500, detail=str(e))
