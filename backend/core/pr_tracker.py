"""
PR (Personal Record) Tracking System
追蹤用戶的個人最佳重量記錄
"""
from typing import Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import os

class PRRecord(BaseModel):
    exercise_id: str
    exercise_name: str
    weight: float
    reps: int
    date: str

class PRSaveRequest(BaseModel):
    user_id: str
    exercise_id: str
    weight: float
    reps: int
    date: str

def save_pr_record(data: PRSaveRequest, data_dir: str) -> Dict:
    """Save a PR attempt and check if it's a new record"""
    try:
        # Phase 2：改 DB（per-user 的 user_prs 表）
        from repositories import pr_repo
        prs = pr_repo.get_all(data.user_id)

        # Check if this is a new PR
        is_new_pr = False
        exercise_data = prs.get(data.exercise_id, {})
        # 🟢 Fix：先記下「更新前」的舊重量。原本在 mutate 之後才讀 exercise_data，
        #    因為是同一個 dict 參考，previous_pr 會誤抓到新值。
        previous_weight = exercise_data.get('weight', 0) if exercise_data else 0

        if not exercise_data or data.weight > exercise_data.get('weight', 0):
            is_new_pr = True
            
            # Update PR
            if data.exercise_id not in prs:
                prs[data.exercise_id] = {
                    'weight': data.weight,
                    'reps': data.reps,
                    'date': data.date,
                    'history': []
                }
            else:
                prs[data.exercise_id]['weight'] = data.weight
                prs[data.exercise_id]['reps'] = data.reps
                prs[data.exercise_id]['date'] = data.date
            
            # Add to history
            prs[data.exercise_id]['history'].append({
                'weight': data.weight,
                'reps': data.reps,
                'date': data.date
            })
        
        # Save
        pr_repo.save(data.user_id, prs)

        return {
            "success": True,
            "is_new_pr": is_new_pr,
            "previous_pr": previous_weight,
            "new_pr": data.weight if is_new_pr else previous_weight
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def get_user_prs(user_id: str, data_dir: str = None) -> Dict:
    """Get all PR records for a user（Phase 2：改 DB）。"""
    try:
        from repositories import pr_repo
        return pr_repo.get_all(user_id)
    except Exception as e:
        print(f"Error getting PRs: {e}")
        return {}
