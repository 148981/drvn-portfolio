"""
api_squads.py — DRVN Squad / Club System Backend
社團 ID 格式：{TYPE_PREFIX}-{4位數字}，例如 RUN-0042、STR-0001
"""

from fastapi import APIRouter, HTTPException, Body, Depends, Request, Query, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from contextvars import ContextVar
from auth_guard import enforce_owner
import json, os, time, random, string
from datetime import datetime

from repositories import squad_repo
from core.route_privacy import trim_route_for_others

_viewer = ContextVar("squad_viewer", default=None)

async def squad_access(request: Request):
    uid = getattr(request.state, "user_id", None)
    enforce_owner(request, uid)
    # 個人資料預覽要看「別人加入了哪些社團」：這支唯讀、只回公開欄位（見 get_user_squads），可互看
    cross_user_read = request.method in ("GET", "HEAD") and request.url.path.rstrip("/").endswith("/memberships")
    for key in ("user_id", "operator_id"):
        claimed = request.query_params.get(key) or request.path_params.get(key)
        if claimed is not None and not (cross_user_read and key in request.path_params):
            enforce_owner(request, claimed)
    if request.method not in ("GET", "HEAD"):
        try:
            body = await request.json()
        except Exception:
            body = None
        if isinstance(body, str):
            enforce_owner(request, body)
        if isinstance(body, dict):
            for key in ("user_id", "operator_id", "creator_id"):
                if key in body:
                    enforce_owner(request, body[key])
            if isinstance(body.get("payload"), dict):
                for key in ("user_id", "operator_id", "creator_id"):
                    if key in body["payload"]:
                        enforce_owner(request, body["payload"][key])
    token = _viewer.set(uid)
    try:
        yield
    finally:
        _viewer.reset(token)

from functools import wraps

class SquadRouter(APIRouter):
    def add_api_route(self, path, endpoint, **kwargs):
        @wraps(endpoint)
        def atomic(*args, **kw):
            _migrate_json_to_db_once()
            with squad_repo.transaction():
                return endpoint(*args, **kw)
        return super().add_api_route(path, atomic, **kwargs)

router = SquadRouter(prefix="/api/squads", tags=["squads"], dependencies=[Depends(squad_access)])


def _visible(squad):
    """Never expose member activity, requests or discussions to non-members."""
    uid = _viewer.get()
    member = next((m for m in squad.get("member_list", []) if m.get("user_id") == uid), None)
    if not member:
        keys = ("id", "name", "type", "privacy", "description", "cover_url", "avatar", "location", "region", "tags", "members", "created_at", "established_year")
        return {k: squad[k] for k in keys if k in squad}
    result = dict(squad)
    result.pop("discussion_blocks", None)
    result.pop("discussion_reports", None)
    if member.get("role") not in ("leader", "admin", "moderator"):
        result["pending_approvals"] = []
    return result


def _require_member(squad):
    member = next((m for m in squad.get("member_list", []) if m.get("user_id") == _viewer.get()), None)
    if not member:
        raise HTTPException(403, "僅限社團成員存取")
    return member


# ── Data persistence path ──
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SQUADS_FILE = os.path.join(DATA_DIR, "squads.json")
MEMBERSHIP_FILE = os.path.join(DATA_DIR, "squad_memberships.json")

os.makedirs(DATA_DIR, exist_ok=True)

# ── Club type → ID prefix mapping ──
TYPE_PREFIX = {
    "run":        "RUN",
    "strength":   "STR",
    "cycling":    "CYC",
    "multisport": "MLT",
    "yoga":       "YGA",
    "hiit":       "HIT",
    "swimming":   "SWM",
    "hiking":     "HIK",
    "other":      "OTH",
}

# ── Storage helpers（真相源＝Postgres，經 squad_repo）──
# 舊版存後端 JSON 檔（多實例/多請求會互相蓋檔、重裝可能遺失）；改以 DB 為真相源，
# 與 cardio / workout / inbody 等功能一致。首次讀取時自動把舊 JSON 檔的資料
# 一次性搬進 DB（冪等），搬完標記，避免既有社團被孤立。
_MIGRATION_FLAG = os.path.join(DATA_DIR, ".squads_migrated_to_db")

def _read_json_file(path: str):
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def _migrate_json_to_db_once():
    """把舊 JSON 檔內容搬進 DB（只在 DB 尚無資料且旗標未設時）。best-effort。"""
    if os.path.exists(_MIGRATION_FLAG):
        return
    try:
        if not squad_repo.load_squads():
            legacy_squads = _read_json_file(SQUADS_FILE)
            if isinstance(legacy_squads, dict) and legacy_squads:
                squad_repo.save_squads(legacy_squads)
        if not squad_repo.load_memberships():
            legacy_mem = _read_json_file(MEMBERSHIP_FILE)
            if isinstance(legacy_mem, dict) and legacy_mem:
                squad_repo.save_memberships(legacy_mem)
        with open(_MIGRATION_FLAG, "w") as f:
            f.write("done")
    except Exception:
        # DB 尚未就緒等狀況 → 不阻斷；下次呼叫再試
        pass

def _load_squads() -> Dict[str, Any]:
    _migrate_json_to_db_once()
    return squad_repo.load_squads()

def _save_squads(data: Dict):
    squad_repo.save_squads(data)

def _load_memberships() -> Dict[str, List[str]]:
    _migrate_json_to_db_once()
    return squad_repo.load_memberships()

def _save_memberships(data: Dict):
    squad_repo.save_memberships(data)

# ── 系統預設封面 ──────────────────────────────────────────────────────
# 由後端提供（main.py 掛在 /squad-assets），所以：
#   · 每一台裝置、每一個環境看到的預設封面都一樣
#   · 前端沒有 bundle 這些圖也不會開天窗
#   · 使用者沒選封面時，社團不會是一片空的漸層（使用者回報：圖六沒有圖片）
SQUAD_COVER_PRESETS = [
    "/squad-assets/squad_running_club_cover.png",
    "/squad-assets/squad_running_club_cover_03.png",
    "/squad-assets/squad_running_club_cover_04.png",
    "/squad-assets/squad_running_club_cover_05.png",
    "/squad-assets/squad_running_club_cover_06.png",
    "/squad-assets/squad_strength_club_cover.png",
]
# 健身社團預設給重訓那張，其餘給跑步系列的第一張
SQUAD_COVER_BY_TYPE = {"strength": SQUAD_COVER_PRESETS[5]}


def _default_cover(squad_id: str, squad_type: str) -> str:
    """沒選封面時給一張。同一個社團永遠拿到同一張（用 id 決定，不是隨機）。"""
    preset = SQUAD_COVER_BY_TYPE.get(squad_type)
    if preset:
        return preset
    pool = SQUAD_COVER_PRESETS[:5]
    digits = "".join(ch for ch in (squad_id or "") if ch.isdigit())
    idx = int(digits) % len(pool) if digits else 0
    return pool[idx]


# ── ID Generator ──
def _generate_squad_id(squad_type: str, existing_ids: set) -> str:
    prefix = TYPE_PREFIX.get(squad_type, "OTH")
    for _ in range(1000):
        num = random.randint(1, 9999)
        candidate = f"{prefix}-{num:04d}"
        if candidate not in existing_ids:
            return candidate
    raise ValueError("Cannot generate unique squad ID")

# ── Pydantic Models ──
# 長度上限：社團資料是公開給所有人看的使用者內容，不能無限長
# cover_url 允許站內路徑、https 圖片，或壓過的 data:image（前端上傳封面）
_COVER_MAX = 1_200_000

class SquadCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=40)
    type: Literal["run", "strength", "cycling", "multisport", "yoga", "hiit", "swimming", "hiking", "other"] = "run"
    privacy: Literal["public", "invite_only", "private"] = "public"  # public | invite_only | private
    description: str = Field(default="", max_length=300)
    cover_url: Optional[str] = Field(default=None, max_length=_COVER_MAX)
    avatar: str = Field(default="🏃", max_length=16)
    location: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=80)
    tags: List[str] = Field(default_factory=list, max_length=12)
    creator_id: str
    creator_name: str = Field(..., max_length=40)

class SquadUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=40)
    description: Optional[str] = Field(default=None, max_length=300)
    cover_url: Optional[str] = Field(default=None, max_length=_COVER_MAX)
    avatar: Optional[str] = Field(default=None, max_length=16)
    location: Optional[str] = Field(default=None, max_length=80)
    privacy: Optional[Literal["public", "invite_only", "private"]] = None
    announcement: Optional[str] = Field(default=None, max_length=2000)

class MemberAction(BaseModel):
    user_id: str
    user_name: str
    avatar: Optional[str] = "🏃"

class RoleUpdate(BaseModel):
    target_user_id: str
    new_role: Literal["leader", "admin", "moderator", "member"]  # leader | admin | moderator | member

class JoinRequest(BaseModel):
    user_id: str
    user_name: str = Field(..., max_length=40)
    avatar: Optional[str] = Field(default="🏃", max_length=16)
    note: Optional[str] = Field(default="", max_length=300)


def _clean_text(value):
    """寫入前遮掉不雅字（App Store 1.2）。None 原樣回傳。"""
    if value is None:
        return None
    from api_moderation import filter_text
    return filter_text(str(value).strip())


def _safe_cover(url):
    """封面只收站內路徑、http(s) 或 data:image —— 擋掉 javascript: 之類的怪東西。"""
    if not url:
        return None
    u = str(url).strip()
    if u.startswith("/") or u.startswith("https://") or u.startswith("http://") or u.startswith("data:image/"):
        return u
    raise HTTPException(status_code=422, detail="封面圖片格式不支援")

# ── Endpoints ──

@router.get("/")
def list_squads(type: Optional[str] = None, privacy: Optional[Literal["public", "invite_only", "private"]] = None,
                search: Optional[str] = None, limit: int = Query(20, ge=1, le=100)):
    """列出所有社團（可過濾種類、隱私設定、搜尋名稱）"""
    squads = _load_squads()
    result = list(squads.values())

    if type:
        result = [s for s in result if s.get("type") == type]
    if privacy:
        result = [s for s in result if s.get("privacy") == privacy]
    if search:
        q = search.lower()
        result = [s for s in result if q in s.get("name", "").lower()
                  or q in s.get("description", "").lower()]

    # Sort by member count desc
    result.sort(key=lambda s: s.get("members", 0), reverse=True)
    return {"squads": [_visible(s) for s in result[:limit]], "total": len(result)}


@router.get("/cover-presets")
def list_cover_presets():
    """系統預設封面清單 —— 建立／編輯社團時的可選圖庫。"""
    return {"covers": SQUAD_COVER_PRESETS}


@router.post("/create")
def create_squad(payload: SquadCreate):
    """建立新社團，自動生成格式化 squad_id"""
    squads = _load_squads()
    existing_ids = set(squads.keys())

    squad_id = _generate_squad_id(payload.type, existing_ids)
    now = datetime.utcnow().isoformat()

    squad = {
        "id": squad_id,
        "name": _clean_text(payload.name),
        "type": payload.type,
        "privacy": payload.privacy,
        "description": _clean_text(payload.description),
        # 沒給就指派一張系統預設 —— 社團不該有「沒有封面」這個狀態
        "cover_url": _safe_cover(payload.cover_url) or _default_cover(squad_id, payload.type),
        "avatar": payload.avatar,
        "location": _clean_text(payload.location),
        "region": payload.region,
        "tags": [_clean_text(t)[:30] for t in payload.tags if str(t or "").strip()],
        "created_at": now,
        "established_year": datetime.utcnow().year,
        "leader_id": payload.creator_id,
        "leader_name": payload.creator_name,
        "members": 1,
        "member_list": [
            {
                "user_id": payload.creator_id,
                "name": payload.creator_name,
                "avatar": "🏃",
                "role": "leader",
                "joined_at": now,
            }
        ],
        "pending_approvals": [],
        "announcement": "",
        "level": 1,
        "completed_expeditions": 0,
        "active_weeks": 0,
        "vibe_tier": "bronze",
        "active_challenges": [],
        "custom_challenges": [],
        "trophy_cabinet": [],
        "feed": [],
        "events": [],
        "chat": [],
        "weekly_contributions": {payload.creator_id: True},
    }

    squads[squad_id] = squad
    _save_squads(squads)

    # Add to creator's memberships
    memberships = _load_memberships()
    uid_memberships = memberships.get(payload.creator_id, [])
    if squad_id not in uid_memberships:
        uid_memberships.append(squad_id)
    memberships[payload.creator_id] = uid_memberships
    _save_memberships(memberships)

    return {"squad": squad, "message": f"社團 {squad_id} 建立成功"}


@router.get("/mine")
def my_squads(user_id: str):
    """回傳這位使用者「加入的所有社團」完整資料（給前端重開時做本機校正）。
    注意：此路由必須宣告在 /{squad_id} 之前，否則會被 path 參數攔截。"""
    squads = _load_squads()
    memberships = _load_memberships()
    mine = [s for s in squads.values() if any(m.get("user_id") == user_id for m in s.get("member_list", []))]
    return {"squads": [_visible(s) for s in mine], "total": len(mine)}


@router.get("/{squad_id}")
def get_squad(squad_id: str):
    """取得單一社團詳細資訊"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail=f"社團 {squad_id} 不存在")
    return {"squad": _visible(squad)}


@router.patch("/{squad_id}")
def update_squad(squad_id: str, payload: SquadUpdate, operator_id: str = Body(...)):
    """更新社團資訊（僅限 leader / admin）"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    # Permission check
    member = next((m for m in squad.get("member_list", []) if m["user_id"] == operator_id), None)
    if not member or member.get("role") not in ("leader", "admin"):
        raise HTTPException(status_code=403, detail="無編輯權限")

    update_data = payload.dict(exclude_none=True)
    for k in ("name", "description", "location", "announcement"):
        if k in update_data:
            update_data[k] = _clean_text(update_data[k])
    if "cover_url" in update_data:
        update_data["cover_url"] = _safe_cover(update_data["cover_url"]) or squad.get("cover_url")
    if "announcement" in update_data:
        squad["announcement_at"] = datetime.utcnow().isoformat()
    squad.update(update_data)
    squad["updated_at"] = datetime.utcnow().isoformat()
    squads[squad_id] = squad
    _save_squads(squads)
    return {"squad": squad, "message": "社團資訊已更新"}


@router.post("/{squad_id}/join")
def join_squad(squad_id: str, payload: JoinRequest):
    """加入社團（public → 直接加入；invite_only → 進入待審清單）"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    # Already a member?
    if any(m["user_id"] == payload.user_id for m in squad.get("member_list", [])):
        return {"message": "已是社團成員", "status": "already_member"}

    now = datetime.utcnow().isoformat()
    privacy = squad.get("privacy", "public")

    if privacy == "public":
        squad.setdefault("member_list", []).append({
            "user_id": payload.user_id,
            "name": payload.user_name,
            "avatar": payload.avatar,
            "role": "member",
            "joined_at": now,
        })
        squad["members"] = len(squad["member_list"])
        squads[squad_id] = squad
        _save_squads(squads)

        memberships = _load_memberships()
        uid_list = memberships.get(payload.user_id, [])
        if squad_id not in uid_list:
            uid_list.append(squad_id)
        memberships[payload.user_id] = uid_list
        _save_memberships(memberships)

        return {"message": "成功加入社團", "status": "joined"}
    else:
        # Add to pending
        pending = squad.setdefault("pending_approvals", [])
        if not any(p["user_id"] == payload.user_id for p in pending):
            pending.append({
                "user_id": payload.user_id,
                "name": payload.user_name,
                "avatar": payload.avatar,
                "note": payload.note,
                "requested_at": now,
            })
        squads[squad_id] = squad
        _save_squads(squads)
        return {"message": "申請已送出，等待審核", "status": "pending"}


@router.post("/{squad_id}/approve")
def approve_member(squad_id: str, target_user_id: str = Body(...), operator_id: str = Body(...)):
    """核准入社申請"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    operator = next((m for m in squad.get("member_list", []) if m["user_id"] == operator_id), None)
    if not operator or operator.get("role") not in ("leader", "admin", "moderator"):
        raise HTTPException(status_code=403, detail="無審核權限")

    pending = squad.get("pending_approvals", [])
    applicant = next((p for p in pending if p["user_id"] == target_user_id), None)
    if not applicant:
        raise HTTPException(status_code=404, detail="找不到申請者")

    squad["pending_approvals"] = [p for p in pending if p["user_id"] != target_user_id]
    squad.setdefault("member_list", []).append({
        "user_id": applicant["user_id"],
        "name": applicant["name"],
        "avatar": applicant.get("avatar", "🏃"),
        "role": "member",
        "joined_at": datetime.utcnow().isoformat(),
    })
    squad["members"] = len(squad["member_list"])
    squads[squad_id] = squad
    _save_squads(squads)

    memberships = _load_memberships()
    uid_list = memberships.get(target_user_id, [])
    if squad_id not in uid_list:
        uid_list.append(squad_id)
    memberships[target_user_id] = uid_list
    _save_memberships(memberships)

    return {"message": f"已核准 {applicant['name']} 入社"}


@router.post("/{squad_id}/reject")
def reject_member(squad_id: str, target_user_id: str = Body(...), operator_id: str = Body(...)):
    """拒絕入社申請"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    operator = _require_member(squad)
    if operator.get("role") not in ("leader", "admin", "moderator"):
        raise HTTPException(403, "無審核權限")

    squad["pending_approvals"] = [
        p for p in squad.get("pending_approvals", []) if p["user_id"] != target_user_id
    ]
    squads[squad_id] = squad
    _save_squads(squads)
    return {"message": "已拒絕申請"}


@router.post("/{squad_id}/leave")
def leave_squad(squad_id: str, user_id: str = Body(..., embed=True)):
    """退出社團"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    member = next((m for m in squad.get("member_list", []) if m["user_id"] == user_id), None)
    if member and member.get("role") == "leader":
        raise HTTPException(status_code=400, detail="社長需先轉移社長身份才能退出")

    squad["member_list"] = [m for m in squad.get("member_list", []) if m["user_id"] != user_id]
    squad["members"] = len(squad["member_list"])
    squads[squad_id] = squad
    _save_squads(squads)

    memberships = _load_memberships()
    uid_list = memberships.get(user_id, [])
    memberships[user_id] = [sid for sid in uid_list if sid != squad_id]
    _save_memberships(memberships)

    return {"message": "已退出社團"}


@router.post("/{squad_id}/kick")
def kick_member(squad_id: str, target_user_id: str = Body(...), operator_id: str = Body(...)):
    """踢出成員"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    operator = next((m for m in squad.get("member_list", []) if m["user_id"] == operator_id), None)
    if not operator or operator.get("role") not in ("leader", "admin"):
        raise HTTPException(status_code=403, detail="無踢出權限")

    target = next((m for m in squad.get("member_list", []) if m["user_id"] == target_user_id), None)
    if target and target.get("role") == "leader":
        raise HTTPException(status_code=400, detail="不可踢出社長")

    if not target:
        raise HTTPException(404, "成員不存在")
    if target.get("role") == "admin" and operator.get("role") != "leader":
        raise HTTPException(403, "僅社長可移除管理員")
    memberships = _load_memberships()
    memberships[target_user_id] = [sid for sid in memberships.get(target_user_id, []) if sid != squad_id]
    _save_memberships(memberships)

    squad["member_list"] = [m for m in squad.get("member_list", []) if m["user_id"] != target_user_id]
    squad["members"] = len(squad["member_list"])
    squads[squad_id] = squad
    _save_squads(squads)
    return {"message": "成員已移除"}


@router.patch("/{squad_id}/role")
def update_member_role(squad_id: str, payload: RoleUpdate, operator_id: str = Body(...)):
    """更新成員角色"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    operator = next((m for m in squad.get("member_list", []) if m["user_id"] == operator_id), None)
    if not operator or operator.get("role") != "leader":
        raise HTTPException(status_code=403, detail="僅社長可異動角色")

    target = next((m for m in squad["member_list"] if m["user_id"] == payload.target_user_id), None)
    if not target:
        raise HTTPException(404, "成員不存在")
    if target["user_id"] == operator_id:
        raise HTTPException(400, "請先將社長轉移給另一位成員")
    if payload.new_role == "leader":
        operator["role"] = "admin"
        squad["leader_id"] = target["user_id"]
        squad["leader_name"] = target.get("name", "成員")
    target["role"] = payload.new_role

    squads[squad_id] = squad
    _save_squads(squads)
    return {"message": f"角色已更新為 {payload.new_role}"}


@router.delete("/{squad_id}")
def dissolve_squad(squad_id: str, operator_id: str = Body(...)):
    """解散社團（僅限 leader）"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    if squad.get("leader_id") != operator_id:
        raise HTTPException(status_code=403, detail="僅社長可解散社團")

    # Remove from all memberships
    memberships = _load_memberships()
    for uid in memberships:
        memberships[uid] = [sid for sid in memberships[uid] if sid != squad_id]
    _save_memberships(memberships)

    del squads[squad_id]
    _save_squads(squads)
    return {"message": f"社團 {squad_id} 已解散"}


@router.get("/user/{user_id}/memberships")
def get_user_squads(user_id: str):
    """取得用戶加入的所有社團"""
    memberships = _load_memberships()
    squad_ids = memberships.get(user_id, [])
    squads = _load_squads()
    user_squads = [_visible(s) for s in squads.values() if any(m.get("user_id") == user_id for m in s.get("member_list", []))]
    if _viewer.get() != user_id:
        # 看別人的：私密社團不列出（加入了哪個私密社團本身就是隱私）
        user_squads = [s for s in user_squads if s.get("privacy") != "private"]
    return {"squads": user_squads, "count": len(user_squads)}


@router.post("/{squad_id}/announcement")
def post_announcement(squad_id: str, content: str = Body(...), operator_id: str = Body(...)):
    """更新公告"""
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")

    member = next((m for m in squad.get("member_list", []) if m["user_id"] == operator_id), None)
    if not member or member.get("role") not in ("leader", "admin"):
        raise HTTPException(status_code=403, detail="無公告權限")

    squad["announcement"] = _clean_text(content)[:2000]
    squad["announcement_at"] = datetime.utcnow().isoformat()
    squads[squad_id] = squad
    _save_squads(squads)
    return {"message": "公告已更新"}


# ══════════════════════════════════════════════════════════════════════════════
# 🏋️ 揪團開課表 —— 一個社團跟同一份課表，看得到彼此的進度
# ══════════════════════════════════════════════════════════════════════════════
# 為什麼要有：
#   社團原本只有「聊天 + 公告 + 排行」，沒有任何一起做的事。
#   一群人真正會黏住的原因是「我們現在在練同一份課表」——
#   有共同的下一步，也看得到誰跟上了、誰落後。
#
# 資料很淺，故意的：
#   一個社團同時只有一份進行中的課表（squad["plan"]），
#   每位成員在上面有一個 progress（完成到第幾次）。
#   課表內容本身沿用既有的計劃系統，這裡只存「跟哪一份、跟到哪」。
#
# 誠實鐵律：進度一律來自成員自己回報的完成次數，不從別的地方推估。

class SquadPlanSet(BaseModel):
    operator_id: str
    plan_id: Optional[str] = None
    title: str
    total_sessions: int = Field(gt=0, le=365)
    type: Optional[str] = "run"
    ends_at: Optional[str] = None


class SquadPlanProgress(BaseModel):
    user_id: str
    completed: int = Field(ge=0, le=365)


def _squad_or_404(squad_id: str):
    squads = _load_squads()
    squad = squads.get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail="社團不存在")
    return squads, squad


def _member(squad, user_id):
    return next((m for m in squad.get("member_list", []) if m["user_id"] == user_id), None)


@router.post("/{squad_id}/plan")
def set_squad_plan(squad_id: str, payload: SquadPlanSet):
    """開一份社團課表。只有團長／管理員可以開，避免課表被互相蓋掉。"""
    squads, squad = _squad_or_404(squad_id)
    me = _member(squad, payload.operator_id)
    if not me or me.get("role") not in ("leader", "admin"):
        raise HTTPException(status_code=403, detail="只有團長或管理員可以開課表")

    squad["plan"] = {
        "plan_id": payload.plan_id or f"squadplan_{int(time.time())}",
        "title": payload.title,
        "type": payload.type or squad.get("type") or "run",
        "total_sessions": payload.total_sessions,
        "started_at": datetime.utcnow().isoformat(),
        "ends_at": payload.ends_at,
        "created_by": payload.operator_id,
        # 開課當下所有人都是 0，不預設任何人已完成
        "progress": {m["user_id"]: 0 for m in squad.get("member_list", [])},
    }
    squads[squad_id] = squad
    _save_squads(squads)
    return {"plan": _plan_view(squad)}


@router.get("/{squad_id}/plan")
def get_squad_plan(squad_id: str):
    """課表 + 每位成員跟到哪。"""
    _, squad = _squad_or_404(squad_id)
    _require_member(squad)
    return {"plan": _plan_view(squad)}


@router.post("/{squad_id}/plan/progress")
def report_squad_plan_progress(squad_id: str, payload: SquadPlanProgress):
    """回報自己完成了幾次。"""
    squads, squad = _squad_or_404(squad_id)
    plan = squad.get("plan")
    if not plan:
        raise HTTPException(status_code=404, detail="這個社團還沒有課表")
    if not _member(squad, payload.user_id):
        raise HTTPException(status_code=403, detail="你不是這個社團的成員")

    plan.setdefault("progress", {})
    plan["progress"][payload.user_id] = min(int(payload.completed), int(plan["total_sessions"]))
    squad["plan"] = plan
    squads[squad_id] = squad
    _save_squads(squads)
    return {"plan": _plan_view(squad)}


@router.delete("/{squad_id}/plan")
def end_squad_plan(squad_id: str, operator_id: str):
    """結束課表。"""
    squads, squad = _squad_or_404(squad_id)
    me = _member(squad, operator_id)
    if not me or me.get("role") not in ("leader", "admin"):
        raise HTTPException(status_code=403, detail="只有團長或管理員可以結束課表")
    squad["plan"] = None
    squads[squad_id] = squad
    _save_squads(squads)
    return {"plan": None}


def _plan_view(squad):
    """把課表整理成畫面直接能用的樣子：每個人跟到哪、整團平均。"""
    plan = squad.get("plan")
    if not plan:
        return None
    total = max(1, int(plan.get("total_sessions") or 1))
    progress = plan.get("progress") or {}

    rows = []
    for m in squad.get("member_list", []):
        done = int(progress.get(m["user_id"], 0))
        rows.append({
            "user_id": m["user_id"],
            "name": m.get("name") or "成員",
            "avatar": m.get("avatar"),
            "role": m.get("role"),
            "completed": done,
            "pct": round(done / total * 100),
            "finished": done >= total,
        })
    rows.sort(key=lambda r: (-r["completed"], r["name"]))

    done_sum = sum(r["completed"] for r in rows)
    return {
        **plan,
        "members": rows,
        "member_count": len(rows),
        # 整團平均進度：讓「我們」而不是「我」也有一個數字
        "squad_pct": round(done_sum / (total * max(1, len(rows))) * 100),
        "finished_count": sum(1 for r in rows if r["finished"]),
    }


# ══════════════════════════════════════════════════════════════════════════
# 📰 GET /api/squads/{squad_id}/activity — 社團所有成員的「動態」
# ══════════════════════════════════════════════════════════════════════════
# 為什麼需要這支：
#   社團動態頁原本只有「每位成員的每週彙總」（距離／訓練量／次數），
#   沒有逐場紀錄，所以畫不出跟「最新動態」一樣的訓練卡 ——
#   使用者看到的是一張張摘要列，而不是「誰、什麼時候、練了什麼」。
#
#   /api/social/friends/recent-sessions 只涵蓋「好友」，社團成員不一定是好友，
#   所以那支端點在社團頁上會漏掉大部分的人。這支直接以社團成員名單為範圍。
#
# 回傳形狀刻意對齊前端動態卡（ActivityFeedMobile / FriendActivityCard）：
#   { userId, name, avatar, sessionId, sport, createdAt, metrics{...}, route[] }
# 讓前端不用再寫一套欄位轉換（單一真相源）。
@router.get("/{squad_id}/activity")
def squad_activity(squad_id: str, days: int = Query(1, ge=1, le=31), limit_per_member: int = Query(5, ge=1, le=20)):
    """社團成員最近 N 天的訓練紀錄（預設當天）。

    days=1 代表「今天」——社團動態的預設值，讓這一頁永遠是「現在正在發生什麼」，
    而不是一條翻不完的歷史時間軸。
    """
    from datetime import datetime, timedelta, timezone

    squad = _load_squads().get(squad_id)
    if not squad:
        raise HTTPException(status_code=404, detail=f"社團 {squad_id} 不存在")

    _require_member(squad)

    member_ids = [m.get("user_id") for m in (squad.get("member_list") or []) if m.get("user_id")]
    if squad.get("leader_id") and squad["leader_id"] not in member_ids:
        member_ids.append(squad["leader_id"])
    if not member_ids:
        return {"activities": [], "member_count": 0}

    # 成員名字/頭像：以社團名單為主，profile 為輔（社團暱稱優先）
    name_by_id, avatar_by_id = {}, {}
    for m in (squad.get("member_list") or []):
        uid = m.get("user_id")
        if uid:
            name_by_id[uid] = m.get("name") or "成員"
            avatar_by_id[uid] = m.get("avatar")
    try:
        from core.coach_profile import load_user_profiles
        profiles = load_user_profiles() or {}
    except Exception:
        profiles = {}
    for uid in member_ids:
        prof = profiles.get(uid, {}) or {}
        if not name_by_id.get(uid):
            name_by_id[uid] = prof.get("name") or "成員"
        if not avatar_by_id.get(uid):
            avatar_by_id[uid] = prof.get("avatar")

    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, days))

    def _parse_dt(ts):
        """ISO / epoch → aware datetime；失敗回 None。"""
        if ts is None:
            return None
        try:
            if isinstance(ts, (int, float)):
                v = float(ts)
                if v > 1e12:
                    v /= 1000.0
                return datetime.fromtimestamp(v, tz=timezone.utc)
            d = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    def _downsample(route, n=40):
        if not isinstance(route, list) or len(route) <= n:
            return route or []
        step = max(1, len(route) // n)
        return route[::step]

    out = []
    per_member = {uid: 0 for uid in member_ids}

    # ── 有氧 ──────────────────────────────────────────────────────────────
    try:
        from core.cardio_storage import load_sessions
        raw = load_sessions()
        sessions = list(raw.values()) if isinstance(raw, dict) else list(raw or [])
        for s in sessions:
            uid = s.get("user_id")
            if uid not in per_member or per_member[uid] >= limit_per_member:
                continue
            when = _parse_dt(s.get("created_at") or s.get("date") or s.get("timestamp"))
            if not when or when < cutoff:
                continue
            m = s.get("metrics") or {}
            out.append({
                "userId": uid,
                "name": name_by_id.get(uid, "成員"),
                "avatar": avatar_by_id.get(uid),
                "sessionId": s.get("session_id") or s.get("run_id"),
                "sport": s.get("sport") or s.get("type") or "running",
                "createdAt": when.isoformat(),
                "locationName": s.get("location_name"),
                "medals": (m.get("medals") if isinstance(m, dict) else None) or [],
                "prCount": (m.get("pr_count") if isinstance(m, dict) else 0) or 0,
                "companions": s.get("companions") or [],
                # 社團可能有陌生人（公開社團誰都能加入）→ 別人的路線剪掉起終點附近，不洩漏住處
                "route": (_downsample(s.get("route_data") or s.get("route")) if uid == _viewer.get()
                          else trim_route_for_others(_downsample(s.get("route_data") or s.get("route")))),
                "metrics": {
                    "distance": float(m.get("distance") or m.get("distance_km") or 0),
                    "duration": float(m.get("duration") or m.get("duration_seconds") or 0),
                    "pace": float(m.get("avgPace") or m.get("pace_per_km") or 0),
                    "elevationGain": float(m.get("elevationGain") or m.get("elevation_gain") or 0),
                },
            })
            per_member[uid] += 1
    except Exception as e:
        print(f"[squad-activity] cardio skipped: {e}")

    # ── 重訓 ──────────────────────────────────────────────────────────────
    try:
        from core.workout_history import get_user_workout_history
        for uid in member_ids:
            if per_member.get(uid, 0) >= limit_per_member:
                continue
            try:
                recs = get_user_workout_history(uid) or []
            except Exception:
                recs = []
            for r in recs:
                if per_member[uid] >= limit_per_member:
                    break
                when = _parse_dt(r.get("timestamp") or r.get("date") or r.get("created_at"))
                if not when or when < cutoff:
                    continue
                pr = r.get("pr_alerts")
                if isinstance(pr, str):
                    try:
                        pr = json.loads(pr)
                    except Exception:
                        pr = []
                out.append({
                    "userId": uid,
                    "name": name_by_id.get(uid, "成員"),
                    "avatar": avatar_by_id.get(uid),
                    "sessionId": r.get("session_id") or r.get("id"),
                    "sport": "strength",
                    "createdAt": when.isoformat(),
                    "locationName": r.get("location_name"),
                    "focusGroup": r.get("focus_group"),
                    "muscles": r.get("muscles") or [],
                    "prCount": len(pr) if isinstance(pr, list) else 0,
                    "prAlerts": pr if isinstance(pr, list) else [],
                    "companions": r.get("companions") or [],
                    "route": [],
                    "metrics": {
                        "volume": float(r.get("total_volume") or 0),
                        "duration": float(r.get("duration_seconds") or (float(r.get("duration_mins") or 0) * 60)),
                        "sets": int(r.get("completed_sets_count") or 0),
                    },
                })
                per_member[uid] += 1
    except Exception as e:
        print(f"[squad-activity] strength skipped: {e}")

    out.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return {
        "activities": out,
        "member_count": len(member_ids),
        "active_member_count": len({a["userId"] for a in out}),
        "days": days,
    }

class DiscussionAction(BaseModel):
    action: Literal['post', 'reply', 'reaction', 'vote', 'meetup', 'delete', 'report', 'block']
    message_id: Optional[str] = None
    client_id: Optional[str] = Field(default=None, max_length=80)
    type: Literal['text', 'photo', 'poll', 'meetup'] = 'text'
    text: str = Field(default='', max_length=3000)
    image: Optional[str] = Field(default=None, max_length=921600)
    options: List[str] = Field(default_factory=list, max_length=8)
    when: str = Field(default='', max_length=200)
    key: Optional[Literal['like', 'fire', 'join']] = None
    index: Optional[int] = Field(default=None, ge=0, le=7)


def _discussion_view(squad):
    viewer = _viewer.get()
    blocked = set(squad.get('discussion_blocks', {}).get(viewer, []))
    hidden = set()
    try:
        # 全站封鎖（雙向）與檢舉也要套在社團討論：在社群牆封鎖的人，不該在社團裡繼續出現
        from api_moderation import blocked_ids, hidden_target_ids
        blocked |= blocked_ids(viewer)
        prefix = f"{squad.get('id')}:"
        hidden = {t[len(prefix):] for t in hidden_target_ids(viewer) if str(t).startswith(prefix)}
    except Exception as e:
        print(f"[squad-discussion] moderation filter skipped: {e}")
    # 自己檢舉過的訊息立刻對自己藏起來（全站佇列在回應後才寫入）
    hidden |= {str(r.get('message_id')) for r in squad.get('discussion_reports', []) if r.get('reporter') == viewer}
    result = []
    for m in squad.get('chat', [])[-200:]:
        if m.get('userId') in blocked or m.get('deleted') or str(m.get('id')) in hidden:
            continue
        item = dict(m)
        item['replies'] = [r for r in m.get('replies', []) if r.get('userId') not in blocked]
        result.append(item)
    return result


@router.get('/{squad_id}/discussion')
def get_discussion(squad_id: str):
    _, squad = _squad_or_404(squad_id)
    _require_member(squad)
    return {'chat': _discussion_view(squad)}


def _queue_club_report(reporter: str, squad_id: str, msg: dict, note: str) -> None:
    """社團討論的檢舉 → 全站檢舉佇列（24 小時內處理）。
    在回應送出後才寫（BackgroundTasks）：社團資料的交易還開著時另開連線寫入，SQLite 會鎖死。"""
    try:
        from api_moderation import SessionLocal as _ModSession, ContentReport
        tid = f"{squad_id}:{msg.get('id')}"
        with _ModSession() as db:
            if not db.query(ContentReport).filter(ContentReport.reporter_id == reporter, ContentReport.target_id == tid).first():
                db.add(ContentReport(reporter_id=reporter, target_type='club_message', target_id=tid,
                                     target_user_id=msg.get('userId'), reason='other',
                                     note=(note or '')[:500] or None,
                                     snapshot=str(msg.get('text') or '')[:2000] or ('[照片]' if msg.get('image') else None)))
                db.commit()
    except Exception as e:
        print(f"[squad-discussion] 檢舉送入佇列失敗: {e}")


def _sync_global_block(uid: str, other: str) -> None:
    """社團裡的封鎖同步成全站封鎖（社群牆、留言、好友一併生效，可在封鎖名單解除）。"""
    try:
        from api_moderation import SessionLocal as _ModSession, UserBlock, _sever_social_ties
        with _ModSession() as db:
            if not db.query(UserBlock).filter(UserBlock.user_id == uid, UserBlock.blocked_user_id == other).first():
                db.add(UserBlock(user_id=uid, blocked_user_id=other))
                db.commit()
        _sever_social_ties(uid, other)
    except Exception as e:
        print(f"[squad-discussion] 全站封鎖同步失敗: {e}")


@router.post('/{squad_id}/discussion')
def change_discussion(squad_id: str, payload: DiscussionAction, background_tasks: BackgroundTasks):
    import uuid
    _, squad = _squad_or_404(squad_id)
    me = _require_member(squad)
    uid = _viewer.get()
    chat = squad.setdefault('chat', [])
    now = datetime.utcnow().isoformat() + 'Z'
    msg = next((m for m in chat if str(m.get('id')) == payload.message_id), None)
    identity = {'userId': uid, 'name': me.get('name') or '成員', 'time': now, 'createdAt': now}
    if payload.action == 'post':
        if payload.client_id and any(m.get('clientId') == payload.client_id and m.get('userId') == uid for m in chat):
            return {'chat': _discussion_view(squad)}
        if not payload.text.strip() and payload.type != 'photo':
            raise HTTPException(422, '請輸入內容')
        if payload.type == 'photo' and not (payload.image or '').startswith('data:image/jpeg;base64,'):
            raise HTTPException(422, '僅支援 JPEG 圖片')
        if payload.type == 'poll' and (len(payload.options) < 2 or any(not o.strip() or len(o)>120 for o in payload.options)):
            raise HTTPException(422, '投票需要 2 至 8 個選項')
        if payload.type == 'meetup' and not payload.when.strip():
            raise HTTPException(422, '請輸入集合時間地點')
        chat.append({**identity, 'id': str(uuid.uuid4()), 'clientId': payload.client_id, 'type': payload.type,
                     'text': _clean_text(payload.text), 'image': payload.image if payload.type == 'photo' else None,
                     'options': [_clean_text(o) for o in payload.options], 'when': _clean_text(payload.when), 'votes': {}, 'reactions': {}, 'replies': [], 'joined': []})
    else:
        if not msg or msg.get('deleted'):
            raise HTTPException(404, '討論不存在')
        if payload.action == 'reply':
            if not payload.text.strip():
                raise HTTPException(422, '請輸入回覆')
            replies = msg.setdefault('replies', [])
            if len(replies) >= 200:
                raise HTTPException(409, '回覆已達上限，請另開討論')
            replies.append({**identity, 'id': str(uuid.uuid4()), 'text': _clean_text(payload.text)})
        elif payload.action == 'reaction':
            if payload.key is None:
                raise HTTPException(422, '請指定反應')
            values = msg.setdefault('reactions', {}).setdefault(payload.key, [])
            values.remove(uid) if uid in values else values.append(uid)
        elif payload.action == 'vote':
            if msg.get('type') != 'poll' or payload.index is None or payload.index >= len(msg.get('options', [])):
                raise HTTPException(422, '投票選項無效')
            votes = msg.setdefault('votes', {})
            key = str(payload.index)
            had = uid in votes.get(key, [])
            for k in votes:
                votes[k] = [v for v in votes[k] if v != uid]
            if not had:
                votes.setdefault(key, []).append(uid)
        elif payload.action == 'meetup':
            if msg.get('type') != 'meetup':
                raise HTTPException(422, '不是團練邀請')
            joined = msg.setdefault('joined', [])
            had = any(j.get('userId') == uid for j in joined)
            msg['joined'] = [j for j in joined if j.get('userId') != uid]
            if not had:
                msg['joined'].append({'userId': uid, 'name': identity['name']})
        elif payload.action == 'delete':
            if msg.get('userId') != uid and me.get('role') not in ('leader', 'admin', 'moderator'):
                raise HTTPException(403, '無刪除權限')
            msg['deleted'] = True
            msg['image'] = None
        elif payload.action == 'report':
            reports = squad.setdefault('discussion_reports', [])
            if not any(r['message_id'] == payload.message_id and r['reporter'] == uid for r in reports):
                reports.append({'message_id': payload.message_id, 'reporter': uid, 'reason': payload.text, 'created_at': now})
            # 以前只存在社團裡，沒有人會處理。送進全站檢舉佇列（24 小時內處理）。
            background_tasks.add_task(_queue_club_report, uid, squad_id, dict(msg), payload.text)
        elif payload.action == 'block':
            if msg.get('userId') != uid:
                blocked = squad.setdefault('discussion_blocks', {}).setdefault(uid, [])
                if msg.get('userId') not in blocked:
                    blocked.append(msg.get('userId'))
                # 封鎖是對人不是對社團：回應送出後同步成全站封鎖
                if msg.get('userId'):
                    background_tasks.add_task(_sync_global_block, uid, msg.get('userId'))
    return {'chat': _discussion_view(squad)}
