"""Read confirmed program targets without recalculating or modifying them."""
import math


def plan_targets(plan):
    if not isinstance(plan, dict):
        return None
    values = [plan.get('adjustedIntake') or plan.get('recommendedIntake'),
              plan.get('newProtein'), plan.get('newCarbs'), plan.get('newFat')]
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 for v in values):
        return None
    if values[0] <= 0:
        return None
    return dict(zip(('calories', 'protein', 'carbs', 'fats'), values),
                mode={'cut': 'cutting', 'bulk': 'bulking', 'recomp': 'maintenance'}.get(plan.get('goalType'), 'maintenance'))


def read_committed_plan(user_id):
    from core.db import SessionLocal
    from core.models_misc import UserBlob
    with SessionLocal() as db:
        row = db.query(UserBlob).filter_by(user_id=user_id, key=f'drvn_nutrition_plan_{user_id}').first()
        return row.payload if row and plan_targets(row.payload) else None
