"""
core/route_privacy.py — 給別人看的路線，先把起點與終點附近剪掉
==================================================================
跑步大多從家門口出發、在家門口結束。社群牆、社團動態把原始 GPS 點回傳給
其他使用者，等於把住址公開給陌生人（任何人都能加入公開社團、看公開動態）。

做法同 Strava 的隱私區：從頭、從尾各剪掉 PRIVACY_METERS 公尺的點。
路線太短（剪完不剩什麼）就整條不給 —— 寧可不畫，也不洩漏位置。
只在「回傳給別人」時使用；自己看自己的路線不受影響。
"""
from __future__ import annotations

import math
from typing import Any, List, Optional, Tuple

PRIVACY_METERS = 250.0


def _latlng(p: Any) -> Optional[Tuple[float, float]]:
    try:
        if isinstance(p, dict):
            lat = p.get("lat", p.get("latitude"))
            lng = p.get("lng", p.get("lon", p.get("longitude")))
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            lat, lng = p[0], p[1]
        else:
            return None
        return float(lat), float(lng)
    except (TypeError, ValueError):
        return None


def _meters(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    r = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _cut_index(points: List[Tuple[float, float]], meters: float) -> int:
    """從 points[0] 往後走，回傳第一個「離起點直線距離超過 meters」的索引。"""
    origin = points[0]
    for i, p in enumerate(points):
        if _meters(origin, p) >= meters:
            return i
    return len(points)


def trim_route_for_others(route: Any, meters: float = PRIVACY_METERS) -> list:
    """回傳剪掉頭尾隱私區後的路線（保留原本每個點的格式）。壞資料 → []。"""
    if not isinstance(route, list) or len(route) < 2:
        return []
    pairs = [(_latlng(p), p) for p in route]
    pairs = [(ll, raw) for ll, raw in pairs if ll is not None]
    if len(pairs) < 2:
        return []
    lls = [ll for ll, _ in pairs]
    start = _cut_index(lls, meters)
    end = len(lls) - _cut_index(lls[::-1], meters)
    if end - start < 2:
        return []
    return [raw for _, raw in pairs[start:end]]
