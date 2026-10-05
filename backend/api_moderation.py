"""
api_moderation.py — 社群內容：過濾、檢舉、封鎖、處理（App Store 審查指南 1.2）
==============================================================================
1.2 對「使用者產生內容」的四個要求，對應這裡：
  ① 過濾不當內容  → filter_text()：發文、留言寫入前把髒話遮掉
  ② 檢舉          → POST /api/moderation/report（貼文／留言／使用者）
  ③ 封鎖使用者    → POST /api/moderation/block、DELETE /api/moderation/block/{uid}
  ④ 24 小時內處理 → GET /api/moderation/dashboard?key=<ADMIN_KEY>（移除或駁回）
另外：
  · 檢舉的人立刻看不到那則；同一則被 3 個不同的人檢舉 → 所有人先看不到，等人工處理
  · 封鎖雙向生效：你看不到他，他也看不到你（動態與留言）
  · 動態牆與留言列表用 visible_activities / visible_comments 過濾
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_

from auth_guard import current_user_id
from core.db import SessionLocal, init_db
from core.models_moderation import ContentReport, UserBlock

init_db()
router = APIRouter(tags=["moderation"])

REPORT_REASONS = {
    "sexual": "色情或裸露",
    "harassment": "騷擾、霸凌或仇恨",
    "violence": "暴力或危險行為",
    "spam": "垃圾訊息或廣告",
    "misinformation": "不實或有害的健康資訊",
    "other": "其他",
}
AUTO_HIDE_REPORTERS = 3
# club_message：社團討論的訊息，target_id = "<squad_id>:<message_id>"
REPORT_TARGET_TYPES = ("post", "comment", "user", "club_message")

# ① 過濾：常見髒話與性暗示詞，寫入前遮成＊（不擋發文，只遮字）
_BAD_WORDS = [
    "幹你娘", "幹您娘", "操你媽", "操你妈", "肏", "機掰", "雞掰", "機歪", "靠北", "靠杯", "三小", "去死",
    "賤人", "婊子", "妓女", "智障", "腦殘", "白癡", "白痴", "約砲", "援交", "做愛",
    "fuck", "fucking", "shit", "bitch", "cunt", "dick", "pussy", "nigger", "nigga", "slut", "whore", "retard",
]
_BAD_RE = re.compile("|".join(re.escape(w) for w in sorted(_BAD_WORDS, key=len, reverse=True)), re.IGNORECASE)


def filter_text(text: Optional[str]) -> Optional[str]:
    if not text:
        return text
    return _BAD_RE.sub(lambda m: "＊" * len(m.group(0)), text)


# ── 讀：誰被誰封鎖、哪些內容要藏 ─────────────────────────────────────

def blocked_ids(user_id: Optional[str]) -> set:
    """雙向：我封鎖的人 ＋ 封鎖我的人。"""
    if not user_id:
        return set()
    with SessionLocal() as db:
        rows = db.query(UserBlock).filter(or_(UserBlock.user_id == user_id, UserBlock.blocked_user_id == user_id)).all()
    return {r.blocked_user_id if r.user_id == user_id else r.user_id for r in rows}


def hidden_target_ids(user_id: Optional[str]) -> set:
    """我檢舉過的 ＋ 已被移除的 ＋ 被 3 個以上不同的人檢舉、還沒處理的。"""
    with SessionLocal() as db:
        rows = db.query(ContentReport.target_id, ContentReport.reporter_id, ContentReport.status).all()
    hidden, open_reporters = set(), {}
    for tid, rid, status in rows:
        if status == "removed" or (user_id and rid == user_id and status != "dismissed"):
            hidden.add(tid)
        if status == "open":
            open_reporters.setdefault(tid, set()).add(rid)
    hidden |= {t for t, rs in open_reporters.items() if len(rs) >= AUTO_HIDE_REPORTERS}
    return hidden


def visible_activities(items: list, viewer_id: Optional[str]) -> list:
    try:
        blocked, hidden = blocked_ids(viewer_id), hidden_target_ids(viewer_id)
    except Exception:
        return items
    def uid(a): return a.get("user_id") if isinstance(a, dict) else getattr(a, "user_id", None)
    def aid(a): return a.get("activity_id") if isinstance(a, dict) else getattr(a, "activity_id", None)
    return [a for a in items if uid(a) not in blocked and aid(a) not in hidden]


def visible_comments(items: list, viewer_id: Optional[str]) -> list:
    try:
        blocked, hidden = blocked_ids(viewer_id), hidden_target_ids(viewer_id)
    except Exception:
        return items
    def get(c, k): return c.get(k) if isinstance(c, dict) else getattr(c, k, None)
    return [c for c in items if get(c, "user_id") not in blocked and get(c, "comment_id") not in hidden]


# ── ② 檢舉、③ 封鎖 ─────────────────────────────────────────────────

class ReportBody(BaseModel):
    target_type: str
    target_id: str = Field(max_length=128)
    target_user_id: Optional[str] = Field(default=None, max_length=128)
    reason: str
    note: Optional[str] = Field(default=None, max_length=500)
    snapshot: Optional[str] = Field(default=None, max_length=2000)


def _require_user(request: Request) -> str:
    uid = current_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="login_required")
    return uid


@router.post("/api/moderation/report")
async def report_content(body: ReportBody, request: Request):
    uid = _require_user(request)
    if body.target_type not in REPORT_TARGET_TYPES or body.reason not in REPORT_REASONS:
        raise HTTPException(status_code=400, detail="invalid_report")
    with SessionLocal() as db:
        dup = db.query(ContentReport).filter(ContentReport.reporter_id == uid, ContentReport.target_id == body.target_id).first()
        if dup is None:
            db.add(ContentReport(reporter_id=uid, target_type=body.target_type, target_id=body.target_id,
                                 target_user_id=body.target_user_id, reason=body.reason,
                                 note=(body.note or "").strip() or None, snapshot=body.snapshot))
            db.commit()
    return {"ok": True}


class BlockBody(BaseModel):
    user_id: str = Field(max_length=128)


@router.post("/api/moderation/block")
async def block_user(body: BlockBody, request: Request):
    uid = _require_user(request)
    if body.user_id == uid:
        raise HTTPException(status_code=400, detail="cannot_block_self")
    with SessionLocal() as db:
        if not db.query(UserBlock).filter(UserBlock.user_id == uid, UserBlock.blocked_user_id == body.user_id).first():
            db.add(UserBlock(user_id=uid, blocked_user_id=body.user_id))
            db.commit()
    _sever_social_ties(uid, body.user_id)
    return {"ok": True}


def _sever_social_ties(uid: str, other: str) -> None:
    """封鎖 = 好友、追蹤、待審邀請一起斷。
    以前只寫 user_blocks：被封鎖的人仍是好友、仍追蹤著你、還能再送好友邀請，
    好友動態與排行榜照樣互相看得到 —— 封鎖只在社群牆生效。"""
    try:
        from core.friends import friends_storage
        friends_storage.block_user(uid, other)        # 舊名冊：解除好友 + 清掉邀請 + 寫 blocks
        friends_storage.unfollow(uid, other)
        friends_storage.unfollow(other, uid)
    except Exception as e:
        print(f"[moderation] 封鎖後清除好友／追蹤失敗（封鎖本身已生效）: {e}")


@router.delete("/api/moderation/block/{blocked_user_id}")
async def unblock_user(blocked_user_id: str, request: Request):
    uid = _require_user(request)
    with SessionLocal() as db:
        db.query(UserBlock).filter(UserBlock.user_id == uid, UserBlock.blocked_user_id == blocked_user_id).delete()
        db.commit()
    try:
        from core.friends import friends_storage
        friends_storage.unblock_user(uid, blocked_user_id)   # 舊名冊的封鎖也要一起解，不然加不回好友
    except Exception as e:
        print(f"[moderation] 解除舊名冊封鎖失敗: {e}")
    return {"ok": True}


@router.get("/api/moderation/blocks")
async def my_blocks(request: Request):
    uid = _require_user(request)
    with SessionLocal() as db:
        rows = db.query(UserBlock).filter(UserBlock.user_id == uid).order_by(UserBlock.created_at.desc()).all()
    ids = [r.blocked_user_id for r in rows]
    # 封鎖名單要顯示名字，使用者才知道要解除誰（只給名字與頭像，不給其他資料）
    users = []
    try:
        from core.coach_profile import load_user_profiles
        profiles = load_user_profiles() or {}
    except Exception:
        profiles = {}
    for bid in ids:
        prof = profiles.get(bid) or {}
        users.append({"user_id": bid, "name": prof.get("name") or "", "avatar": prof.get("avatar")})
    return {"blocked": ids, "users": users}


def purge_user_moderation(user_id: str) -> int:
    """刪帳號：他做過的檢舉與封鎖一起刪（被檢舉的紀錄留著給處理用，但內容已隨帳號刪除）。"""
    with SessionLocal() as db:
        n = db.query(UserBlock).filter(or_(UserBlock.user_id == user_id, UserBlock.blocked_user_id == user_id)).delete()
        n += db.query(ContentReport).filter(ContentReport.reporter_id == user_id).delete()
        db.commit()
    return n


# ── ④ 處理（ADMIN_KEY）──────────────────────────────────────────────

def _check_admin(request: Request) -> None:
    admin_key = os.getenv("ADMIN_KEY")
    supplied = request.headers.get("X-Admin-Key") or request.query_params.get("key")
    # 常數時間比對，避免從回應時間猜出管理金鑰
    import hmac
    if not admin_key or not supplied or not hmac.compare_digest(str(supplied), admin_key):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/api/moderation/reports")
async def list_reports(request: Request, status: str = "open"):
    _check_admin(request)
    with SessionLocal() as db:
        q = db.query(ContentReport)
        if status != "all":
            q = q.filter(ContentReport.status == status)
        rows = q.order_by(ContentReport.created_at.asc()).limit(200).all()
    return {"reports": [{
        "id": r.id, "target_type": r.target_type, "target_id": r.target_id, "target_user_id": r.target_user_id,
        "reason": REPORT_REASONS.get(r.reason, r.reason), "note": r.note, "snapshot": r.snapshot,
        "status": r.status, "created_at": r.created_at.isoformat() + "Z",
    } for r in rows]}


class ResolveBody(BaseModel):
    action: str   # remove | dismiss


@router.post("/api/moderation/reports/{report_id}/resolve")
async def resolve_report(report_id: int, body: ResolveBody, request: Request):
    _check_admin(request)
    if body.action not in ("remove", "dismiss"):
        raise HTTPException(status_code=400, detail="invalid_action")
    with SessionLocal() as db:
        r = db.get(ContentReport, report_id)
        if r is None:
            raise HTTPException(status_code=404, detail="not_found")
        target_type, target_id = r.target_type, r.target_id
        # 同一個內容的所有檢舉一起結案
        for x in db.query(ContentReport).filter(ContentReport.target_id == target_id, ContentReport.status == "open").all():
            x.status = "removed" if body.action == "remove" else "dismissed"
            x.resolved_at = datetime.utcnow()
        db.commit()
    removed = False
    if body.action == "remove":
        removed = _remove_content(target_type, target_id)
    return {"ok": True, "removed": removed}


def _remove_content(target_type: str, target_id: str) -> bool:
    """真的刪掉被檢舉的貼文／留言（動態牆也會因為 status=removed 而先藏起來）。"""
    try:
        from api_activities import social_storage
        if target_type == "post":
            a = social_storage.get_activity(target_id)
            return bool(a) and social_storage.delete_activity(target_id, a.user_id)
        if target_type == "club_message":
            # 社團討論：標記刪除（與社團管理員刪除同一個欄位），照片一起清掉
            squad_id, _, msg_id = target_id.partition(":")
            from repositories import squad_repo
            with squad_repo.transaction():
                squads = squad_repo.load_squads()
                squad = squads.get(squad_id)
                msg = next((m for m in (squad or {}).get("chat", []) if str(m.get("id")) == msg_id), None)
                if not msg:
                    return False
                msg["deleted"] = True
                msg["image"] = None
                squad_repo.save_squads(squads)
            return True
        if target_type == "comment":
            items = social_storage._load_json(social_storage.comments_file)
            kept = [c for c in items if c.get("comment_id") != target_id]
            social_storage._save_json(social_storage.comments_file, kept)
            return len(kept) < len(items)
    except Exception as e:
        print(f"[moderation] 移除內容失敗: {e}")
    return False


DASHBOARD_HTML = """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DRVN 檢舉處理</title>
<style>
  body{margin:0;background:#161415;color:#F6F4F1;font-family:-apple-system,'Noto Sans TC',sans-serif;padding:24px;max-width:760px}
  h1{font-size:22px;font-weight:300;margin:6px 0 4px}.sub{font-size:12px;color:#A09A92}
  .r{background:#1E1C1D;border:1px solid #2B2722;border-radius:14px;padding:14px;margin:12px 0;font-size:13px;line-height:1.6}
  .r b{color:#D4C5A5}.snap{background:#161415;border-radius:10px;padding:10px;margin:8px 0;white-space:pre-wrap;color:#CFC6B8}
  button{border:0;border-radius:999px;padding:10px 16px;font-weight:800;margin-right:8px;cursor:pointer}
  .rm{background:#F95C4B;color:#fff}.ok{background:#2B2722;color:#F6F4F1}
</style></head><body>
<div class="sub" style="letter-spacing:.3em;color:#D4C5A5">DRVN · MODERATION</div>
<h1>待處理的檢舉</h1><div class="sub">Apple 要求 24 小時內處理。「移除」會刪掉內容；「沒問題」只結案。</div>
<div id="list"></div>
<script>
const key = new URLSearchParams(location.search).get('key') || localStorage.getItem('drvn_admin_key') || prompt('ADMIN_KEY?');
localStorage.setItem('drvn_admin_key', key);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TYPE = {post:'貼文', comment:'留言', user:'使用者'};
function load() {
  fetch(`/api/moderation/reports?key=${encodeURIComponent(key)}`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
   .then(d => {
     const el = document.getElementById('list');
     el.innerHTML = d.reports.length ? d.reports.map(r => `<div class="r">
       <b>${TYPE[r.target_type]||r.target_type}</b> · ${esc(r.reason)} · ${r.created_at.slice(0,16).replace('T',' ')} UTC
       ${r.snapshot ? `<div class="snap">${esc(r.snapshot)}</div>` : ''}
       ${r.note ? `<div class="sub">補充：${esc(r.note)}</div>` : ''}
       <div class="sub">內容 ID ${esc(r.target_id)} · 作者 ${esc(r.target_user_id || '—')}</div>
       <div style="margin-top:10px"><button class="rm" onclick="act(${r.id},'remove')">移除內容</button><button class="ok" onclick="act(${r.id},'dismiss')">沒問題</button></div>
     </div>`).join('') : '<p class="sub">目前沒有待處理的檢舉。</p>';
   })
   .catch(e => { document.body.innerHTML += `<p style="color:#F95C4B">載入失敗（${e.message}）— 檢查 ADMIN_KEY。</p>`; localStorage.removeItem('drvn_admin_key'); });
}
function act(id, action) {
  fetch(`/api/moderation/reports/${id}/resolve?key=${encodeURIComponent(key)}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action})}).then(load);
}
load();
</script></body></html>"""


@router.get("/api/moderation/dashboard", response_class=HTMLResponse)
async def moderation_dashboard():
    """檢舉處理頁（頁面公開，資料要 ADMIN_KEY）：https://<backend>/api/moderation/dashboard?key=<ADMIN_KEY>"""
    return HTMLResponse(DASHBOARD_HTML)
