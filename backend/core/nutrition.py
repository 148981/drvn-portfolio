"""
Nutrition Tracking Module
Handles meal logging, calorie tracking, and macro calculations.
"""
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from .json_cache import load_json_cached, save_json_atomic

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
NUTRITION_DB_PATH = os.path.join(DATA_DIR, "nutrition_log.json")

def load_nutrition_log() -> Dict:
    """Load nutrition log from JSON file (cache-backed)"""
    return load_json_cached(NUTRITION_DB_PATH, default={})

def save_nutrition_log(data: Dict):
    """Save nutrition log to JSON file and update cache"""
    save_json_atomic(NUTRITION_DB_PATH, data)

def _backup_user_nutrition(user_id: str, db: Dict):
    """🗄️ best-effort 把該使用者的營養紀錄雙寫進 Postgres（持久、重新部署不掉）。"""
    try:
        from repositories import user_blob_repo
        user_blob_repo.put(user_id, "nutrition_log", db.get(user_id, {}))
    except Exception as _e:
        print(f"[nutrition dual-write] DB backup skipped: {_e}")

def _get_user_nutrition(user_id: str) -> Dict:
    """讀單一使用者的營養紀錄：先 DB（user_blob，不靠 Volume），
    DB 沒有才退回 JSON 並 lazy 補寫進 DB（讓既有資料自動遷移）。"""
    try:
        from repositories import user_blob_repo
        blob = user_blob_repo.get(user_id, "nutrition_log")
        if isinstance(blob, dict):
            return blob
    except Exception:
        pass
    db = load_nutrition_log()
    user_data = db.get(user_id, {})
    if user_data:
        try:
            from repositories import user_blob_repo
            user_blob_repo.put(user_id, "nutrition_log", user_data)
        except Exception:
            pass
    return user_data

def log_meal(user_id: str, meal_data: Dict) -> Dict:
    """
    Log a meal for a user.
    meal_data should contain:
    - name: str
    - calories: int
    - protein: int (g)
    - carbs: int (g)
    - fats: int (g)
    - fats: int (g)
    - water: int (ml, optional)
    - vegetables: int (g, optional)
    - date: str (YYYY-MM-DD, optional, defaults to today)
    - time: str (HH:MM, optional)
    """
    db = load_nutrition_log()
    if user_id not in db:
        db[user_id] = {}
    
    date_str = meal_data.get("date", datetime.now().strftime("%Y-%m-%d"))
    
    if date_str not in db[user_id]:
        db[user_id][date_str] = {
            "meals": [],
            "summary": {"calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "water": 0, "vegetables": 0}
        }
    
    entry = {
        "id": f"{datetime.now().timestamp()}",
        "name": meal_data.get("name", "Quick Add"),
        "calories": int(meal_data.get("calories", 0)),
        "protein": int(meal_data.get("protein", 0)),
        "carbs": int(meal_data.get("carbs", 0)),
        "carbs": int(meal_data.get("carbs", 0)),
        "fats": int(meal_data.get("fats", 0)),
        "fiber": float(meal_data.get("fiber", 0)),
        "water": int(meal_data.get("water", 0)),
        "vegetables": int(meal_data.get("vegetables", 0)),
        "timestamp": datetime.now().isoformat(),
        "type": meal_data.get("type", "snack") # breakfast, lunch, dinner, snack
    }
    
    db[user_id][date_str]["meals"].append(entry)
    
    # Update daily summary
    current_summary = db[user_id][date_str]["summary"]
    current_summary["calories"] += entry["calories"]
    current_summary["protein"] += entry["protein"]
    current_summary["carbs"] += entry["carbs"]
    current_summary["fats"] += entry["fats"]
    current_summary["fiber"] = current_summary.get("fiber", 0) + entry.get("fiber", 0)
    current_summary["water"] = current_summary.get("water", 0) + entry.get("water", 0)
    current_summary["vegetables"] = current_summary.get("vegetables", 0) + entry.get("vegetables", 0)
    
    save_nutrition_log(db)
    _backup_user_nutrition(user_id, db)
    return entry

def get_daily_nutrition(user_id: str, date_str: str = None) -> Dict:
    """Get nutrition summary for a specific date"""
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
        
    user_data = _get_user_nutrition(user_id)
    day_data = user_data.get(date_str, {
        "meals": [],
        "summary": {"calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "water": 0, "vegetables": 0}
    })

    return day_data

def get_nutrition_history(user_id: str, days: int = 7) -> List[Dict]:
    """Get nutrition history for the last N days"""
    user_data = _get_user_nutrition(user_id)

    history = []
    for i in range(days):
        date = (datetime.now() - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        day_data = user_data.get(date, {
            "meals": [],
            "summary": {"calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "water": 0, "vegetables": 0}
        })
        
        history.append({
            "date": date,
            "summary": day_data["summary"],
            "meal_count": len(day_data["meals"])
        })
    
    return history

def get_recent_foods(user_id: str, limit: int = 20) -> List[Dict]:
    """Get list of distinct recently eaten foods for quick add"""
    user_data = _get_user_nutrition(user_id)

    # Flatten all meals with date info
    all_meals = []
    for date_str, data in user_data.items():
        for meal in data.get("meals", []):
            meal_entry = meal.copy()
            meal_entry['last_eaten'] = date_str
            all_meals.append(meal_entry)
            
    # Sort by timestamp descending (newest first)
    # Meals have a timestamp field, trust that
    all_meals.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    # Deduplicate by name
    seen_names = set()
    distinct_foods = []
    
    for meal in all_meals:
        name = meal.get("name").strip().lower()
        if name not in seen_names:
            seen_names.add(name)
            distinct_foods.append({
                "name": meal.get("name"),
                "calories": meal.get("calories"),
                "protein": meal.get("protein"),
                "carbs": meal.get("carbs"),
                "carbs": meal.get("carbs"),
                "fats": meal.get("fats"),
                "water": meal.get("water", 0),
                "vegetables": meal.get("vegetables", 0),
                "type": meal.get("type", "snack")
            })
            if len(distinct_foods) >= limit:
                break
                
    return distinct_foods

def delete_food(user_id: str, food_name: str) -> bool:
    """Delete all instances of a food from recent list (by name)"""
    db = load_nutrition_log()
    user_data = db.get(user_id, {})
    
    deleted = False
    
    # Iterate through all dates and meals
    for date_str, data in user_data.items():
        if "meals" in data:
            original_len = len(data["meals"])
            # Filter out meals with matching name (case-insensitive)
            data["meals"] = [
                m for m in data["meals"] 
                if m.get("name", "").strip().lower() != food_name.strip().lower()
            ]
            
            if len(data["meals"]) < original_len:
                deleted = True
                
                # Recalculate summary
                new_summary = {"calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "water": 0, "vegetables": 0}
                for m in data["meals"]:
                    new_summary["calories"] += m.get("calories", 0)
                    new_summary["protein"] += m.get("protein", 0)
                    new_summary["carbs"] += m.get("carbs", 0)
                    new_summary["fats"] += m.get("fats", 0)
                    new_summary["fiber"] += m.get("fiber", 0)
                    new_summary["water"] += m.get("water", 0)
                    new_summary["vegetables"] += m.get("vegetables", 0)
                data["summary"] = new_summary
                
    if deleted:
        save_nutrition_log(db)
        _backup_user_nutrition(user_id, db)

    return deleted

def get_meals_for_date(user_id: str, date_str: str = None) -> List[Dict]:
    """Get all meals for a specific date with full details"""
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
    
    user_data = _get_user_nutrition(user_id)
    day_data = user_data.get(date_str, {"meals": []})

    return day_data.get("meals", [])

def update_meal(user_id: str, meal_id: str, updates: Dict) -> bool:
    """Update a specific meal by ID"""
    db = load_nutrition_log()
    user_data = db.get(user_id, {})
    
    updated = False
    
    # Find and update the meal
    for date_str, data in user_data.items():
        if "meals" in data:
            for i, meal in enumerate(data["meals"]):
                if meal.get("id") == meal_id:
                    # Update meal fields
                    data["meals"][i].update({
                        "name": updates.get("name", meal.get("name")),
                        "calories": int(updates.get("calories", meal.get("calories", 0))),
                        "protein": int(updates.get("protein", meal.get("protein", 0))),
                        "carbs": int(updates.get("carbs", meal.get("carbs", 0))),
                        "fats": int(updates.get("fats", meal.get("fats", 0))),
                        "fiber": float(updates.get("fiber", meal.get("fiber", 0))),
                        "water": int(updates.get("water", meal.get("water", 0))),
                        "vegetables": int(updates.get("vegetables", meal.get("vegetables", 0))),
                    })
                    
                    # Recalculate summary
                    new_summary = {"calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "water": 0, "vegetables": 0}
                    for m in data["meals"]:
                        new_summary["calories"] += m.get("calories", 0)
                        new_summary["protein"] += m.get("protein", 0)
                        new_summary["carbs"] += m.get("carbs", 0)
                        new_summary["fats"] += m.get("fats", 0)
                        new_summary["fiber"] += m.get("fiber", 0)
                        new_summary["water"] += m.get("water", 0)
                        new_summary["vegetables"] += m.get("vegetables", 0)
                    data["summary"] = new_summary
                    
                    updated = True
                    break
        
        if updated:
            break
    
    if updated:
        save_nutrition_log(db)
        _backup_user_nutrition(user_id, db)

    return updated

def delete_meal(user_id: str, meal_id: str) -> bool:
    """Delete a specific meal by ID"""
    db = load_nutrition_log()
    user_data = db.get(user_id, {})
    
    deleted = False
    
    # Find and delete the meal
    for date_str, data in user_data.items():
        if "meals" in data:
            original_len = len(data["meals"])
            data["meals"] = [m for m in data["meals"] if m.get("id") != meal_id]
            
            if len(data["meals"]) < original_len:
                # Recalculate summary
                new_summary = {"calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "water": 0, "vegetables": 0}
                for m in data["meals"]:
                    new_summary["calories"] += m.get("calories", 0)
                    new_summary["protein"] += m.get("protein", 0)
                    new_summary["carbs"] += m.get("carbs", 0)
                    new_summary["fats"] += m.get("fats", 0)
                    new_summary["fiber"] += m.get("fiber", 0)
                    new_summary["water"] += m.get("water", 0)
                    new_summary["vegetables"] += m.get("vegetables", 0)
                data["summary"] = new_summary
                
                deleted = True
                break
    
    if deleted:
        save_nutrition_log(db)
        _backup_user_nutrition(user_id, db)

    return deleted
