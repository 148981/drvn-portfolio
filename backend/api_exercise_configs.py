"""
api_exercise_configs.py — 動作偵測參數設定 (Exercise Configs) 路由（Phase 1 抽出，行為不變）
對應前綴：/api/exercise-configs  ｜ 依賴：core.multi_exercise
"""
import os
import glob as _glob

from fastapi import APIRouter, HTTPException

import core.multi_exercise as multi_exercise

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

router = APIRouter(tags=["exercise-configs"])


@router.get("/api/exercise-configs")
async def get_exercise_configs():
    """
    回傳所有動作的前端配置（metric_labels, thresholds, preferred_view 等），
    讓前端知道每個動作需要哪些 landmark 和閾值。
    """
    configs = {}
    for key, cfg in multi_exercise.EXERCISE_CONFIGS.items():
        configs[key] = {
            "name": cfg["name"],
            "name_zh": cfg["name_zh"],
            "name_en": cfg["name_en"],
            "icon": cfg["icon"],
            "metric_labels": cfg["metric_labels"],
            "preferred_view": cfg["preferred_view"],
            "ar_mode": cfg["ar_mode"],
            "body_thr": cfg["body_thr"],
            "joint_thr": cfg["joint_thr"],
            "segment_signal_idx": cfg["segment_signal_idx"],
            "segment_prominence": cfg["segment_prominence"],
            "min_rep_sec": cfg.get("min_rep_sec", 1.5),
            # 【v9.3】v5.3 之後模板是「每個機位一份」(template_{key}__{view}.npz)，
            #   只查舊的共用檔名會對每一個 per-view 模板說謊。
            "has_template": bool(
                _glob.glob(os.path.join(DATA_DIR, f"template_{key}__*.npz"))
                or os.path.exists(os.path.join(DATA_DIR, f"template_{key}.npz"))
            ),
        }
    return {"configs": configs}
