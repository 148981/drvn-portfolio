"""
repositories/squad_repo.py — 社團倉儲層（Postgres 真相源）
==========================================================
社團（squads）與成員關係（memberships）原本存在後端 JSON 檔
（backend/data/squads.json / squad_memberships.json），
換成以 Postgres 為真相源，避免多實例/多請求互相蓋檔，並與其他功能
（cardio / workout / inbody 皆走 repository）架構一致。

資料形狀不變（維持與舊 JSON 檔相同）：
  · squads      = { squad_id: {squad dict}, ... }
  · memberships = { user_id: [squad_id, ...], ... }

實作：直接複用既有的通用 user-blob 表（UserBlob），以固定「系統帳號」
key 存這兩份全域 dict。好處是免新增資料表 / 免改 init_db / 免 migration，
且沿用 social_repo 既有「整份 JSON 覆寫」的成熟寫法。

⚠ 若日後社團規模變大、需要並發逐列更新，再升級為獨立 squads 資料表
  （一列一社團）。目前規模（App Group 單機資料、社團數量小）整份覆寫足夠。
"""
from __future__ import annotations

from typing import Dict, List, Any

from repositories import user_blob_repo

# 全域資料掛在固定「系統帳號」名下（非真實使用者，僅作命名空間）
_SYSTEM_UID = "__system__"
_SQUADS_KEY = "squads"
_MEMBERSHIPS_KEY = "squad_memberships"


def load_squads() -> Dict[str, Any]:
    data = user_blob_repo.get(_SYSTEM_UID, _SQUADS_KEY)
    return data if isinstance(data, dict) else {}


def save_squads(squads: Dict[str, Any]) -> None:
    user_blob_repo.put(_SYSTEM_UID, _SQUADS_KEY, squads or {})


def load_memberships() -> Dict[str, List[str]]:
    data = user_blob_repo.get(_SYSTEM_UID, _MEMBERSHIPS_KEY)
    return data if isinstance(data, dict) else {}


def save_memberships(memberships: Dict[str, List[str]]) -> None:
    user_blob_repo.put(_SYSTEM_UID, _MEMBERSHIPS_KEY, memberships or {})

# One transaction covers both records; rollback also restores membership changes.
from contextvars import ContextVar
from contextlib import contextmanager
_active = ContextVar('squad_transaction', default=None)
_legacy_load_squads = load_squads
_legacy_load_memberships = load_memberships

_STATE_KEY = 'squad_state_v2'


def _fresh_state():
    """全新的狀態信封（沿用舊 key 裡的資料，才不會把既有社團弄丟）。"""
    return {'squads': _legacy_load_squads(), 'memberships': _legacy_load_memberships()}


def is_state(value) -> bool:
    """這份 payload 是不是合法的狀態信封。

    為什麼需要：正式站的 squad_state_v2 曾被存成 []（見 user_blob_repo 的
    _UNINITIALIZED 說明）。之後每一次 load_squads() 都做 []['squads']，
    TypeError → 整個社團系統每一支路由都 500。形狀不對就當作沒初始化，
    就地重建並寫回，讓它自己好起來，而不是等人去手動改資料庫。
    """
    return (isinstance(value, dict)
            and isinstance(value.get('squads'), dict)
            and isinstance(value.get('memberships'), dict))


@contextmanager
def transaction():
    with user_blob_repo.transaction(_SYSTEM_UID, _STATE_KEY, _fresh_state) as envelope:
        if not is_state(envelope['payload']):
            # 壞掉／舊格式 → 重建。與 original 不同，離開 with 時會自動寫回。
            envelope['payload'] = _fresh_state()
        token = _active.set(envelope['payload'])
        try:
            yield
        finally:
            _active.reset(token)

def load_squads():
    state = _active.get()
    if is_state(state):
        return state['squads']
    state = user_blob_repo.get(_SYSTEM_UID, _STATE_KEY)
    return state['squads'] if is_state(state) else _legacy_load_squads()

def load_memberships():
    state = _active.get()
    if is_state(state):
        return state['memberships']
    state = user_blob_repo.get(_SYSTEM_UID, _STATE_KEY)
    return state['memberships'] if is_state(state) else _legacy_load_memberships()

def save_squads(data):
    if _active.get() is not None:
        _active.get()['squads'] = data
    else:
        with transaction():
            _active.get()['squads'] = data

def save_memberships(data):
    if _active.get() is not None:
        _active.get()['memberships'] = data
    else:
        with transaction():
            _active.get()['memberships'] = data
