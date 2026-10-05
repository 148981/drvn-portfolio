"""
JSON File In-Memory Cache
─────────────────────────────────────────────────────────────────────
Eliminates repeated disk I/O for frequently-read JSON data files.

Usage:
    from core.json_cache import load_json_cached, invalidate_cache, save_json_atomic

    # Instead of:
    #   with open(path) as f: data = json.load(f)
    # Use:
    data = load_json_cached(path)

    # After writing, call:
    save_json_atomic(path, data)   # saves + invalidates cache automatically
"""

import json
import os
import threading
import time
from typing import Any, Optional

# ── Cache store ──────────────────────────────────────────────────────────────
_cache: dict[str, dict] = {}   # { abs_path: { "data": ..., "mtime": float, "ts": float } }
_lock = threading.Lock()

# TTL (seconds): how long a cached value stays valid without checking mtime
TTL = 30.0


def load_json_cached(path: str, default: Any = None) -> Any:
    """
    Return parsed JSON from `path`, using an in-memory cache.

    The cache entry is refreshed when:
    - the file's mtime has changed (immediate invalidation), OR
    - TTL seconds have elapsed since the last load.

    If the file does not exist or is empty, returns `default`.
    """
    path = os.path.abspath(path)
    now = time.monotonic()

    with _lock:
        entry = _cache.get(path)

        # Fast path: cache hit within TTL
        if entry and (now - entry["ts"]) < TTL:
            return entry["data"]

        # Check file mtime to detect external writes
        try:
            mtime = os.path.getmtime(path)
        except FileNotFoundError:
            return default if default is not None else {}

        if entry and entry["mtime"] == mtime:
            # File unchanged, just refresh TTL timestamp
            entry["ts"] = now
            return entry["data"]

        # Load from disk
        try:
            size = os.path.getsize(path)
            if size == 0:
                data = default if default is not None else {}
            else:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
        except (json.JSONDecodeError, OSError):
            data = default if default is not None else {}

        _cache[path] = {"data": data, "mtime": mtime, "ts": now}
        return data


def save_json_atomic(path: str, data: Any, indent: int = 2) -> None:
    """
    Write `data` to `path` as JSON, then update (or invalidate) the cache.

    Uses a temp-file + rename pattern so concurrent readers never see a
    partially-written file.
    """
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"

    # ⚠ 這裡必須是原生 json.dump —— 這支函式「就是」原子寫入的實作，
    #   改成呼叫自己會無限遞迴。
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)

    os.replace(tmp_path, path)         # atomic on POSIX

    # Update cache so the next reader skips disk I/O
    mtime = os.path.getmtime(path)
    with _lock:
        _cache[path] = {"data": data, "mtime": mtime, "ts": time.monotonic()}


def invalidate_cache(path: str) -> None:
    """Force-expire a cache entry (e.g. after an external write)."""
    path = os.path.abspath(path)
    with _lock:
        _cache.pop(path, None)


def cache_stats() -> dict:
    """Return diagnostic info about the current cache state."""
    with _lock:
        return {
            "entries": len(_cache),
            "paths": list(_cache.keys()),
        }
