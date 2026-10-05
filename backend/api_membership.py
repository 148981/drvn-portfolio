"""
api_membership.py — 會員身分
============================

GET /api/membership/me
    回傳目前登入者的會員狀態。前端的會員判斷一律以這支為準。
    沒登入（訪客）→ 免費。

付費牆總開關 settings.MEMBERSHIP_GATE_ENABLED：
    關閉時（App 內購上線前）所有人 is_member = True，行為與現在相同；
    status 仍回報真實訂閱狀態，方便之後切換時核對。

require_member(request)
    之後要在伺服器端擋會員功能（例如完整歷史、PDF）時呼叫，
    與 /me 共用同一個判斷，不另寫規則。

POST /api/membership/survey               （訂閱／退訂原因，一題可複選）
GET  /api/membership/survey/stats?key=     （統計，ADMIN_KEY）
GET  /api/membership/survey/dashboard?key= （統計頁）

POST /api/membership/apple/verify         （App 內購：登入者送 Apple 簽的交易 JWS）
POST /api/membership/apple/notifications  （App Store Server Notifications V2：續訂、扣款失敗、退款）
    兩支都先用 core.apple_iap.verify_jws 驗 Apple 憑證鏈，驗不過一律不寫入。
    會員狀態的換算只在 apple_iap.transaction_to_membership 一處。
"""
import logging
import re
from datetime import datetime, timedelta
from typing import List, Optional

import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from auth_guard import current_user_id
from config import settings
from core.apple_iap import AppleJWSError, transaction_to_membership, verify_jws
from repositories import membership_repo

logger = logging.getLogger(__name__)

router = APIRouter(tags=["membership"])

# 姿勢檢查：2026-09 起全部免費、不限次數（本地運算、還在收集回饋）。None＝不限；
# 前端 utils/memberLimits.FREE_POSE_CHECKS_PER_MONTH 同步。要再收費時改回數字即可。
FREE_POSE_CHECKS_PER_MONTH = None


def founding_cutoff() -> Optional[datetime]:
    """FOUNDING_MEMBERS_BEFORE（台灣時間當天 0 點）→ UTC；沒設或格式錯 → None。"""
    raw = settings.FOUNDING_MEMBERS_BEFORE
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d") - timedelta(hours=8)
    except ValueError:
        logger.warning("FOUNDING_MEMBERS_BEFORE 格式要是 YYYY-MM-DD：%r", raw)
        return None


def resolve_membership(user_id):
    """會員身分的唯一計算：訂閱紀錄 ＋ 永久免費名單 × 付費牆開關。
    付費牆沒全開時，MEMBERSHIP_GATE_USERS 名單上的帳號（App 審核帳號、自己測試）照樣看到付費牆。"""
    gate = bool(settings.MEMBERSHIP_GATE_ENABLED)
    if not gate and user_id and settings.MEMBERSHIP_GATE_USERS:
        try:
            gate = membership_repo.user_in_list(user_id, settings.MEMBERSHIP_GATE_USERS)
        except Exception:
            gate = False
    if not user_id:
        base = {"user_id": None, "status": "none", "product_id": None,
                "source": None, "expires_at": None, "is_member": False}
    else:
        base = membership_repo.get_membership(user_id)
    subscribed = bool(base.get("is_member"))
    # 有在訂閱的照訂閱顯示（才能管理／取消）；沒訂閱但在永久免費名單 → comp
    comp = None
    if user_id and not subscribed:
        try:
            comp = membership_repo.comp_reason(user_id, free_members=settings.FREE_MEMBERS,
                                               founding_before=founding_cutoff())
        except Exception:
            comp = None
    try:
        pose_used = membership_repo.count_pose_checks_this_month(user_id) if user_id else 0
    except Exception:
        pose_used = 0
    return {
        "status": "comp" if comp else base["status"],
        "comp_reason": comp,
        "product_id": base.get("product_id"),
        "expires_at": None if comp else base.get("expires_at"),
        "gate_enabled": gate,
        "is_member": (subscribed or bool(comp)) if gate else True,
        "pose_checks_used": pose_used,
        "pose_checks_free": FREE_POSE_CHECKS_PER_MONTH,
    }


def pose_check_allowed(user_id) -> bool:
    """這個月還能不能再做一次姿勢檢查（FREE_POSE_CHECKS_PER_MONTH 為 None → 所有人不限）。"""
    if FREE_POSE_CHECKS_PER_MONTH is None:
        return True
    info = resolve_membership(user_id)
    if info["is_member"]:
        return True
    return info["pose_checks_used"] < FREE_POSE_CHECKS_PER_MONTH


def require_member(request: Request) -> None:
    info = resolve_membership(current_user_id(request))
    if not info["is_member"]:
        raise HTTPException(status_code=403, detail="membership_required")


@router.get("/api/membership/me")
async def get_my_membership(request: Request):
    return resolve_membership(current_user_id(request))


# ── App 內購（StoreKit 2）──────────────────────────────────────────────

class AppleVerifyBody(BaseModel):
    # 一次購買一筆；恢復購買／同步可能好幾筆（例如月訂閱升年訂閱留下的舊交易）
    transactions: List[str] = Field(default_factory=list, max_length=20)


def _checked_transaction(jws: str) -> dict:
    """驗簽 + 確認是這個 App、這幾個商品的交易。"""
    tx = verify_jws(jws)
    if tx.get("bundleId") != settings.APPLE_BUNDLE_ID:
        raise AppleJWSError("bundle mismatch")
    if tx.get("productId") not in settings.APPLE_IAP_PRODUCT_IDS:
        raise AppleJWSError("unknown product")
    if not tx.get("originalTransactionId"):
        raise AppleJWSError("missing originalTransactionId")
    try:
        if isinstance(tx.get('signedDate'), bool) or int(tx.get('signedDate') or 0) <= 0:
            raise ValueError('missing signed date')
        transaction_to_membership(tx)
    except (TypeError, ValueError, OverflowError, OSError) as exc:
        raise AppleJWSError('invalid subscription dates') from exc
    return tx


@router.post("/api/membership/apple/verify")
async def verify_apple_purchase(body: AppleVerifyBody, request: Request):
    user_id = current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="login_required")
    valid = []
    for jws in body.transactions:
        try:
            valid.append(_checked_transaction(jws))
        except AppleJWSError as exc:
            logger.warning("apple verify rejected for %s: %s", user_id, exc)
    if body.transactions and not valid:
        raise HTTPException(status_code=400, detail="invalid_transaction")
    if valid:
        # 好幾筆時取「到期日最晚」的那一筆 —— 那才是現在有效的訂閱
        tx = max(valid, key=lambda t: (int(t.get("expiresDate") or 0), int(t["signedDate"]), bool(t.get("revocationDate"))))
        status, expires_at = transaction_to_membership(tx)
        membership_repo.apply_app_store_transaction(
            user_id, status=status, product_id=tx["productId"],
            original_transaction_id=str(tx["originalTransactionId"]), expires_at=expires_at,
            signed_at_ms=int(tx['signedDate']),
        )
    # 沒帶任何交易（這個 Apple ID 沒有有效訂閱）→ 不降級：到期由 expires_at 與 Apple 通知處理
    return resolve_membership(user_id)


class AppleNotificationBody(BaseModel):
    signedPayload: str


# 退款、撤銷（家庭共享被移除）→ 立刻失效；其餘依交易本身的到期日與寬限期換算
_REVOKING = {"REFUND", "REVOKE"}


@router.post("/api/membership/apple/notifications")
async def apple_server_notification(body: AppleNotificationBody):
    try:
        note = verify_jws(body.signedPayload)
        data = note.get("data") or {}
        if data.get("bundleId") != settings.APPLE_BUNDLE_ID:
            raise AppleJWSError("bundle mismatch")
        signed_tx = data.get("signedTransactionInfo")
        if not signed_tx:
            return {"ok": True, "ignored": note.get("notificationType")}   # 例如 TEST
        tx = _checked_transaction(signed_tx)
        renewal: Optional[dict] = verify_jws(data["signedRenewalInfo"]) if data.get("signedRenewalInfo") else None
        signed_at_ms = int(note.get('signedDate') or 0)
        if signed_at_ms <= 0:
            raise AppleJWSError('missing notification signed date')
    except (AppleJWSError, KeyError, TypeError, ValueError) as exc:
        logger.warning("apple notification rejected: %s", exc)
        raise HTTPException(status_code=400, detail="invalid_signed_payload")

    user_id = membership_repo.find_user_by_original_transaction(str(tx["originalTransactionId"]))
    if not user_id:
        # 還沒在 App 裡驗證過的訂閱：回 200，等使用者開 App 同步時再綁帳號
        return {"ok": True, "unlinked": True}
    status, expires_at = transaction_to_membership(tx, renewal)
    if note.get("notificationType") in _REVOKING:
        status = "expired"
    membership_repo.apply_app_store_transaction(
        user_id, status=status, product_id=tx["productId"],
        original_transaction_id=str(tx["originalTransactionId"]), expires_at=expires_at,
        signed_at_ms=signed_at_ms,
    )
    return {"ok": True}


# ── 訂閱／退訂原因問卷 ───────────────────────────────────────────────
# id 與前端 utils/membership.SURVEY_REASONS 同一份；統計頁用這裡的中文名稱。
SURVEY_REASONS = {
    "subscribe": {
        "auto_adjust": "課表會自動調整、加量",
        "analysis": "完整的跑步／健身分析",
        "charts": "進階圖表與長期趨勢",
        "report": "月報與 PDF 報告",
        "courses": "進階課程",
        "support": "想支持 DRVN",
        "other": "其他",
    },
    # 姿勢分析準不準（結果頁）：前三個是判定，其餘是哪裡不準；feature 放動作 key
    "pose": {
        "accurate": "很準",
        "partly": "部分準",
        "inaccurate": "不準",
        "count": "次數算錯",
        "depth": "深度／角度判斷錯",
        "skeleton": "骨架沒對上身體",
        "advice": "建議不合理",
        "filming": "不知道怎麼拍",
        "slow": "分析太慢",
    },
    "cancel": {
        "price": "太貴了",
        "not_used": "會員功能用不太到",
        "expectation": "功能不如預期",
        "trial_only": "只是想試用看看",
        "break": "最近沒在運動",
        "other_app": "改用其他 App",
        "bug": "遇到問題或錯誤",
        "other": "其他",
    },
}


# 付費牆是從哪個會員功能點進來的（前端 utils/membership.MEMBER_FEATURES 的 key → 名稱）
FEATURE_LABELS = {
    "sessionWeight": "每次訓練帶好重量", "autoProgress": "訓練太輕鬆自動加量", "runAutoProgress": "跑得順自動加里程",
    "seasonAuto": "換季一鍵套用", "advancedCharts": "進階圖表", "readiness": "準備度加入睡眠與 HRV",
    "forecast": "成效預測", "runAnalysis": "完整跑步分析", "strengthAnalysis": "完整健身分析",
    "monthlyReport": "月報", "reportPdf": "匯出 PDF 報告", "courses": "進階課程完整版",
    "placePlans": "依地點排課",
    # 完整歷史、健身人格 2026-09 起改免費（舊問卷若帶這兩個 feature 會存成 None）
}


class SurveyBody(BaseModel):
    kind: str
    reasons: List[str] = Field(default_factory=list, max_length=8)
    note: Optional[str] = Field(default=None, max_length=300)
    product_id: Optional[str] = Field(default=None, max_length=128)
    feature: Optional[str] = Field(default=None, max_length=64)


@router.post("/api/membership/survey")
async def submit_survey(body: SurveyBody, request: Request):
    user_id = current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="login_required")
    allowed = SURVEY_REASONS.get(body.kind)
    if allowed is None:
        raise HTTPException(status_code=400, detail="invalid_kind")
    reasons = [r for r in dict.fromkeys(body.reasons) if r in allowed][:3]
    if not reasons:
        raise HTTPException(status_code=400, detail="invalid_reasons")
    membership_repo.add_survey(
        user_id, kind=body.kind, reasons=reasons, note=(body.note or "").strip()[:300] or None,
        product_id=body.product_id if body.product_id in settings.APPLE_IAP_PRODUCT_IDS else None,
        feature=(body.feature if body.feature in FEATURE_LABELS else None) if body.kind != "pose"
                else (re.sub(r"[^\w-]", "", body.feature or "")[:64] or None),
    )
    return {"ok": True}


def _check_admin(request: Request) -> None:
    admin_key = os.getenv("ADMIN_KEY")
    supplied = request.headers.get("X-Admin-Key") or request.query_params.get("key")
    if not admin_key or supplied != admin_key:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/api/membership/survey/stats")
async def survey_stats(request: Request, days: int = 365):
    _check_admin(request)
    stats = membership_repo.survey_stats(days=max(7, min(days, 3650)))
    stats["labels"] = {**SURVEY_REASONS, "features": FEATURE_LABELS}
    return stats


SURVEY_DASHBOARD_HTML = """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DRVN 會員統計</title>
<style>
  body{margin:0;background:#161415;color:#F6F4F1;font-family:-apple-system,'Noto Sans TC',sans-serif;padding:24px;max-width:760px}
  h1{font-size:13px;letter-spacing:.3em;color:#D4C5A5;margin:28px 0 10px}
  .sub{font-size:12px;color:#A09A92}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
  .card{background:#1E1C1D;border:1px solid #2B2722;border-radius:14px;padding:14px}
  .num{font-size:26px;font-weight:300}.lbl{font-size:11px;color:#A09A92;margin-top:2px}
  .fr{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px}
  .fr .lab{width:170px;color:#CFC6B8;flex-shrink:0}
  .bar{height:18px;border-radius:4px;min-width:2px}
  .note{background:#1E1C1D;border:1px solid #2B2722;border-radius:12px;padding:10px 12px;margin:8px 0;font-size:13px}
  .note small{color:#A09A92}
</style></head><body>
<div class="sub" style="letter-spacing:.3em;color:#D4C5A5">DRVN · MEMBERSHIP</div>
<h1 style="margin-top:6px;font-size:22px;letter-spacing:0;color:#F6F4F1;font-weight:300">會員與訂閱原因</h1>
<div class="sub" id="range"></div>
<h1>目前會員</h1><div class="grid" id="members"></div>
<h1>為什麼訂閱</h1><div id="subscribe"></div>
<h1>從哪個功能點進來訂閱</h1><div id="features"></div>
<h1>為什麼退訂</h1><div id="cancel"></div>
<h1>姿勢分析準不準</h1><div id="pose"></div>
<h1>被說不準最多的動作</h1><div id="poseEx"></div>
<h1>文字回饋</h1><div id="notes"></div>
<script>
const key = new URLSearchParams(location.search).get('key') || localStorage.getItem('drvn_admin_key') || prompt('ADMIN_KEY?');
localStorage.setItem('drvn_admin_key', key);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const STATUS = {trial:'免費試用中', active:'訂閱中', grace:'扣款寬限期', expired:'已到期', none:'從未訂閱'};
function bars(el, counts, labels, color) {
  const entries = Object.entries(counts);
  if (!entries.length) { el.innerHTML = '<div class="sub">還沒有回覆</div>'; return; }
  const max = Math.max(...entries.map(e => e[1]), 1);
  el.innerHTML = entries.map(([k, n]) =>
    `<div class="fr"><span class="lab">${esc((labels||{})[k] || k)}</span><div class="bar" style="width:${n/max*60}%;background:${color}"></div><b>${n}</b></div>`).join('');
}
fetch(`/api/membership/survey/stats?days=365&key=${encodeURIComponent(key)}`)
 .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
 .then(d => {
   document.getElementById('range').textContent = `近 ${d.days} 天 · 訂閱問卷 ${d.responses.subscribe} 份 · 退訂問卷 ${d.responses.cancel} 份 · 姿勢分析回饋 ${d.responses.pose} 份`;
   const m = d.members;
   document.getElementById('members').innerHTML = ['active','trial','grace','expired'].map(s =>
     `<div class="card"><div class="num">${m[s]||0}</div><div class="lbl">${STATUS[s]}</div></div>`).join('');
   bars(document.getElementById('subscribe'), d.subscribe, d.labels.subscribe, '#D4C5A5');
   bars(document.getElementById('features'), d.features, d.labels.features, '#8F9E8B');
   bars(document.getElementById('cancel'), d.cancel, d.labels.cancel, '#F95C4B');
   bars(document.getElementById('pose'), d.pose, d.labels.pose, '#8B9DAB');
   bars(document.getElementById('poseEx'), d.pose_exercises, {}, '#C68E5D');
   document.getElementById('notes').innerHTML = d.notes.length ? d.notes.map(n =>
     `<div class="note">${esc(n.note)}<br><small>${({cancel:'退訂',subscribe:'訂閱',pose:'姿勢分析'})[n.kind] || n.kind} · ${n.at.slice(0,10)}</small></div>`).join('')
     : '<div class="sub">還沒有文字回饋</div>';
 })
 .catch(e => { document.body.innerHTML += `<p style="color:#F95C4B">載入失敗（${e.message}）— 檢查 ADMIN_KEY 是否已設在 Railway 環境變數。</p>`; localStorage.removeItem('drvn_admin_key'); });
</script></body></html>"""


@router.get("/api/membership/survey/dashboard", response_class=HTMLResponse)
async def survey_dashboard():
    """統計頁（頁面公開，資料要 ADMIN_KEY）。用法：https://<backend>/api/membership/survey/dashboard?key=<ADMIN_KEY>"""
    return HTMLResponse(SURVEY_DASHBOARD_HTML)
