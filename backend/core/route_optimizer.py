# -*- coding: utf-8 -*-
"""
route_optimizer.py
==================
Cardio session 逐點資料壓縮的單一真相來源 (single source of truth)。

被兩處共用：
  1. 後端 core/cardio_storage.py：新 session 存檔前自動套用。
  2. 專案根目錄 optimize_cardio_data.py：批次優化既有檔案。

策略（平衡模式）：
  - Douglas-Peucker 軌跡簡化：直線砍點、彎角保點。
  - 時間降採樣：route 最少 MIN_INTERVAL_SEC 秒留一點。
  - 保形下限：至少保留 MIN_KEEP_RATIO / MIN_KEEP_POINTS，避免彎道被拉直。
  - 同步裁切 stream_data 等長陣列（容忍 ±2 的 off-by-one）。
  - 摘要欄位 (metrics/notes/emotion/photo_url/deepData) 完全不動。
"""

import math
from typing import Dict, List, Tuple

# ---------- 平衡模式預設參數 ----------
MIN_INTERVAL_SEC = 4          # 逐點降採樣最小秒數
EPSILON_DEG = 0.00002         # Douglas-Peucker 容差（約 2.2 公尺）
KEEP_IF_FEWER_THAN = 30       # 點數太少就不動，避免毀掉短紀錄
MIN_KEEP_RATIO = 0.12         # 至少保留這個比例的點
MIN_KEEP_POINTS = 40          # 並且至少保留這麼多點（除非原本就更少）

TS_KEYS = ("timestamp", "time", "t")
LAT_KEYS = ("lat", "latitude")
LNG_KEYS = ("lng", "lon", "longitude")


def _get(d, keys):
    for k in keys:
        if isinstance(d, dict) and k in d and d[k] is not None:
            return d[k]
    return None


def _perp_distance(pt, a, b):
    (px, py), (ax, ay), (bx, by) = pt, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def douglas_peucker(points, epsilon) -> set:
    n = len(points)
    if n < 3:
        return set(range(n))
    keep = {0, n - 1}
    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        dmax, idx = 0.0, -1
        a, b = points[start], points[end]
        for i in range(start + 1, end):
            d = _perp_distance(points[i], a, b)
            if d > dmax:
                dmax, idx = d, i
        if idx != -1 and dmax > epsilon:
            keep.add(idx)
            stack.append((start, idx))
            stack.append((idx, end))
    return keep


def _time_downsample_indices(route, min_interval) -> set:
    n = len(route)
    keep = {0, n - 1}
    have_ts = isinstance(route[0], dict) and _get(route[0], TS_KEYS) is not None
    if have_ts:
        def ts(p):
            v = _get(p, TS_KEYS)
            return float(v) if v is not None else None
        first = ts(route[0])
        scale = 1000.0 if (first and first > 1e12) else 1.0
        last_kept = first
        for i in range(1, n):
            cur = ts(route[i])
            if cur is None or last_kept is None:
                keep.add(i)
                last_kept = cur
                continue
            if (cur - last_kept) / scale >= min_interval:
                keep.add(i)
                last_kept = cur
    else:
        step = max(1, int(min_interval))
        for i in range(0, n, step):
            keep.add(i)
    return keep


def optimize_session(sess: Dict,
                     min_interval: float = MIN_INTERVAL_SEC,
                     epsilon: float = EPSILON_DEG) -> Tuple[int, int]:
    """就地優化單一 session dict。回傳 (原 route 點數, 新 route 點數)。

    對 sess 物件直接修改 route_data 與 stream_data；其餘欄位不動。
    安全：route_data 不存在 / 過短時不做任何事。
    """
    route = sess.get("route_data")
    if not isinstance(route, list) or len(route) < KEEP_IF_FEWER_THAN:
        return (len(route) if isinstance(route, list) else 0,
                len(route) if isinstance(route, list) else 0)

    n = len(route)

    coord_pts: List[Tuple[float, float]] = []
    has_coords = isinstance(route[0], dict)
    if has_coords:
        for p in route:
            la, lo = _get(p, LAT_KEYS), _get(p, LNG_KEYS)
            if la is None or lo is None:
                has_coords = False
                break
            coord_pts.append((float(la), float(lo)))

    time_keep = _time_downsample_indices(route, min_interval)

    if has_coords:
        dp_keep = douglas_peucker(coord_pts, epsilon)
        keep = (time_keep & dp_keep) | {0, n - 1}
        floor = min(max(MIN_KEEP_POINTS, int(n * MIN_KEEP_RATIO)), n)
        if len(keep) < floor:
            keep |= dp_keep                    # 先補回所有彎角點
        if len(keep) < floor:
            stride = max(1, n // floor)
            keep |= set(range(0, n, stride))   # 再均勻補滿
        kept_idx = sorted(keep)
    else:
        kept_idx = sorted(time_keep | {0, n - 1})

    if len(kept_idx) >= n:
        return (n, n)

    sess["route_data"] = [route[i] for i in kept_idx]

    sd = sess.get("stream_data")
    if isinstance(sd, dict):
        for k in list(sd.keys()):
            arr = sd[k]
            if isinstance(arr, list) and abs(len(arr) - n) <= 2 and len(arr) > 0:
                m = len(arr)
                sd[k] = [arr[i] for i in kept_idx if i < m]

    return (n, len(kept_idx))
