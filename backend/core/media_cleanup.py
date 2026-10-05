"""
core/media_cleanup.py — 影片/媒體目錄自動清理（容量治理）
=========================================================
背景：data/uploads（原始上傳影片）與 data/results（AR 分析影片）會無上限累積，
      實測 uploads 已達 ~4GB。分析結果（分數/雷達/reps）早已存進 session，影片只是
      過程產物，不需備份、不必上雲。

策略（雙保險）：
  1) 保留最新 N 個檔（依修改時間）。
  2) 即使數量未超過 N，總容量超過上限也從最舊開始刪到上限以下。

特性：純標準庫（os/glob），無外部相依；冪等；任何單檔錯誤都被吞掉不影響主流程。
呼叫時機：app 啟動時 + 每次使用者上傳分析後（best-effort）。
"""
from __future__ import annotations

import glob
import os
import logging

logger = logging.getLogger("media_cleanup")

VIDEO_EXTS = (".webm", ".mp4", ".mov", ".MOV", ".avi", ".mkv")

# 預設保留策略（可依雲端磁碟調整）
DEFAULTS = {
    "uploads": {"keep_newest": 8,  "max_total_mb": 300},   # 原始上傳 → 分析完即無用，留少量緩衝
    "results": {"keep_newest": 20, "max_total_mb": 400},   # AR 影片 → 留最新 20 供回看
}


def _collect(folder: str):
    items = []
    if not os.path.isdir(folder):
        return items
    for ext in VIDEO_EXTS:
        for f in glob.glob(os.path.join(folder, f"*{ext}")):
            try:
                items.append((f, os.path.getmtime(f), os.path.getsize(f)))
            except OSError:
                pass
    items.sort(key=lambda x: x[1], reverse=True)  # 最新在前
    return items


def prune_dir(folder: str, keep_newest: int, max_total_mb: int) -> dict:
    """清理單一目錄。回傳 {deleted, freed_bytes, kept}。"""
    items = _collect(folder)
    max_total = max_total_mb * 1024 * 1024
    deleted, freed = 0, 0

    # 1) 先標記「超過 keep_newest」的舊檔為待刪
    to_delete = list(items[keep_newest:])
    survivors = items[:keep_newest]

    # 2) 對保留下來的，若總量仍超過上限，從最舊開始再刪
    total = sum(s[2] for s in survivors)
    i = len(survivors) - 1
    while total > max_total and i >= 0:
        to_delete.append(survivors[i])
        total -= survivors[i][2]
        i -= 1

    for path, _, size in to_delete:
        try:
            os.remove(path)
            deleted += 1
            freed += size
        except OSError as e:
            logger.warning("prune_dir 刪除失敗 %s: %s", path, e)

    return {"deleted": deleted, "freed_bytes": freed, "kept": len(items) - deleted}


def prune_media_dirs(data_dir: str) -> dict:
    """清理 uploads + results。data_dir = 專案的 data/ 絕對路徑。"""
    report = {}
    for sub, cfg in DEFAULTS.items():
        folder = os.path.join(data_dir, sub)
        try:
            report[sub] = prune_dir(folder, cfg["keep_newest"], cfg["max_total_mb"])
        except Exception as e:  # noqa: BLE001 — 清理絕不可拖垮主流程
            logger.warning("prune_media_dirs(%s) 失敗: %s", sub, e)
            report[sub] = {"error": str(e)}
    freed_mb = sum(v.get("freed_bytes", 0) for v in report.values()) / (1024 * 1024)
    if freed_mb > 0:
        logger.info("media_cleanup 釋放 %.1f MB：%s", freed_mb, report)
    return report
