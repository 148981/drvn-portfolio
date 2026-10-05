"""
api_telemetry.py — 自建觀測性端點（無第三方依賴）
====================================================
上市後回答三個問題：
  1. 有沒有人在當機？（etype=error）
  2. 漏斗掉在哪？（onboarding_completed → first_workout → D1/D7 回訪）
  3. 哪些功能有人用？（事件計數）

設計原則：
  - 前端 fire-and-forget 批次上報，這裡永不回 5xx 給前端拖慢 UI
  - 寫入失敗只 log，不拋
  - summary 端點需 ADMIN_KEY（環境變數）保護，未設定則拒絕
"""
import logging
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse

from core.db import SessionLocal, init_db
from core.models_misc import TelemetryEvent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

init_db()

MAX_BATCH = 50            # 單次最多收 50 筆
MAX_PROP_CHARS = 2000     # props 序列化長度上限（防塞爆）


def _clean_props(props):
    if not isinstance(props, dict):
        return None
    out = {}
    total = 0
    for k, v in list(props.items())[:20]:
        s = str(v)[:500]
        total += len(s)
        if total > MAX_PROP_CHARS:
            break
        out[str(k)[:64]] = s
    return out


@router.post("/events")
async def ingest_events(request: Request):
    """批次收事件：{ user_id, events: [{type?, name, props?, ts?}] }"""
    try:
        body = await request.json()
        user_id = str(body.get("user_id") or "")[:128] or None
        events = body.get("events") or []
        if not isinstance(events, list):
            return {"ok": False}
        rows = []
        for ev in events[:MAX_BATCH]:
            if not isinstance(ev, dict):
                continue
            name = str(ev.get("name") or "")[:64]
            if not name:
                continue
            etype = "error" if ev.get("type") == "error" else "event"
            rows.append(TelemetryEvent(
                user_id=user_id,
                etype=etype,
                name=name,
                props=_clean_props(ev.get("props")),
            ))
        if rows:
            with SessionLocal() as db:
                db.add_all(rows)
                db.commit()
        return {"ok": True, "stored": len(rows)}
    except Exception as e:  # noqa: BLE001
        logger.warning("telemetry ingest failed: %s", e)
        return {"ok": False}  # 永不 5xx


ADMIN_DASHBOARD_HTML = """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DRVN Analytics</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  body{margin:0;background:#161415;color:#F6F4F1;font-family:-apple-system,'Noto Sans TC',sans-serif;padding:24px}
  h1{font-size:15px;letter-spacing:.3em;text-transform:uppercase;color:#F95C4B;margin:0 0 4px}
  .sub{font-size:11px;color:#8E8E93;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px}
  .card{background:#1E1C1D;border:1px solid #2B2722;border-radius:14px;padding:14px}
  .num{font-size:26px;font-weight:800}.lbl{font-size:10px;color:#8E8E93;letter-spacing:.1em;margin-top:2px}
  .accent{color:#F95C4B}
  canvas{background:#1E1C1D;border-radius:14px;padding:8px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td,th{padding:6px 8px;border-bottom:1px solid #2B2722;text-align:left}
  th{color:#8E8E93;font-size:10px;letter-spacing:.1em}
  .bar{height:22px;background:#F95C4B;border-radius:4px;min-width:2px}
  .fr{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:12px}
  .fr .lab{width:150px;color:#CFC6B8;flex-shrink:0}
</style></head><body>
<h1>DRVN · Analytics</h1><div class="sub" id="range">近 30 天</div>
<div class="grid" id="cards"></div>
<div style="max-width:900px"><canvas id="dauChart" height="90"></canvas></div>
<h1 style="font-size:12px">Funnel · 新手到習慣</h1><div id="funnel" style="max-width:600px;margin:10px 0 24px"></div>
<h1 style="font-size:12px">Errors · Top 10</h1>
<table id="errs"><tr><th>錯誤</th><th>次數</th></tr></table>
<script>
const key = new URLSearchParams(location.search).get('key') || localStorage.getItem('drvn_admin_key') || prompt('ADMIN_KEY?');
localStorage.setItem('drvn_admin_key', key);
fetch(`/api/telemetry/analytics?days=30&key=${encodeURIComponent(key)}`)
 .then(r => { if(!r.ok) throw new Error(r.status); return r.json(); })
 .then(d => {
   const pct = (r) => r?.rate == null ? '—' : r.rate + '%';
   document.getElementById('cards').innerHTML = `
     <div class="card"><div class="num">${d.total_users}</div><div class="lbl">TOTAL USERS (30D)</div></div>
     <div class="card"><div class="num">${d.wau}</div><div class="lbl">WAU</div></div>
     <div class="card"><div class="num accent">${pct(d.retention.d1)}</div><div class="lbl">D1 RETENTION</div></div>
     <div class="card"><div class="num accent">${pct(d.retention.d7)}</div><div class="lbl">D7 RETENTION</div></div>
     <div class="card"><div class="num accent">${pct(d.retention.d30)}</div><div class="lbl">D30 RETENTION</div></div>`;
   new Chart(document.getElementById('dauChart'), { type:'line',
     data:{ labels:d.dau.map(x=>x.date.slice(5)), datasets:[{ label:'DAU', data:d.dau.map(x=>x.users),
       borderColor:'#F95C4B', backgroundColor:'rgba(249,92,75,.12)', fill:true, tension:.3, pointRadius:2 }]},
     options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'#2B2722'},ticks:{color:'#8E8E93'}},
       y:{grid:{color:'#2B2722'},ticks:{color:'#8E8E93',precision:0}} } } });
   const max = Math.max(...d.funnel.map(f=>f.users), 1);
   document.getElementById('funnel').innerHTML = d.funnel.map(f =>
     `<div class="fr"><span class="lab">${f.step}</span><div class="bar" style="width:${f.users/max*100}%"></div><b>${f.users}</b></div>`).join('');
   document.getElementById('errs').innerHTML += (d.errors_top.length ? d.errors_top.map(e =>
     `<tr><td>${e.name}</td><td>${e.count}</td></tr>`).join('') : '<tr><td colspan=2>🎉 沒有錯誤</td></tr>');
 })
 .catch(e => { document.body.innerHTML += `<p style="color:#F95C4B">載入失敗（${e.message}）— 檢查 ADMIN_KEY 是否已設在 Railway 環境變數。</p>`; localStorage.removeItem('drvn_admin_key'); });
</script></body></html>"""


@router.get("/dashboard", response_class=HTMLResponse)
async def analytics_dashboard():
    """分析儀表板（頁面本身公開，資料請求仍需 ADMIN_KEY）。
    用法：https://<backend>/api/telemetry/dashboard?key=<ADMIN_KEY>"""
    return HTMLResponse(ADMIN_DASHBOARD_HTML)


def _check_admin(request: Request):
    admin_key = os.getenv("ADMIN_KEY")
    supplied = request.headers.get("X-Admin-Key") or request.query_params.get("key")
    if not admin_key or supplied != admin_key:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/analytics")
async def telemetry_analytics(request: Request, days: int = 30):
    """數據分析核心：DAU 序列、D1/D7/D30 留存、轉換漏斗、錯誤排行。
    保護：header X-Admin-Key 或 query ?key= 需等於環境變數 ADMIN_KEY。"""
    _check_admin(request)
    days = max(7, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)

    with SessionLocal() as db:
        rows = (
            db.query(TelemetryEvent.user_id, TelemetryEvent.name,
                     TelemetryEvent.etype, TelemetryEvent.created_at)
            .filter(TelemetryEvent.created_at >= since)
            .all()
        )

    day_of = lambda dt: dt.strftime("%Y-%m-%d")  # noqa: E731

    # ── DAU（以 app_open 的去重 user/日）──
    dau: dict = {}
    # ── 每使用者的活躍日集合 / 首日（留存 cohort）──
    user_days: dict = {}
    funnel_users = {"app_open": set(), "onboarding_completed": set(),
                    "first_workout": set(), "habit_5_workouts": set(),
                    "season_continued": set()}
    workout_counts: dict = {}
    error_counts: dict = {}

    for uid, name, etype, at in rows:
        if not at:
            continue
        d = day_of(at)
        if etype == "error":
            error_counts[name] = error_counts.get(name, 0) + 1
            continue
        if uid:
            user_days.setdefault(uid, set()).add(d)
        if name == "app_open":
            dau.setdefault(d, set())
            if uid:
                dau[d].add(uid)
                funnel_users["app_open"].add(uid)
        elif name == "onboarding_completed" and uid:
            funnel_users["onboarding_completed"].add(uid)
        elif name == "workout_completed" and uid:
            funnel_users["first_workout"].add(uid)
            workout_counts[uid] = workout_counts.get(uid, 0) + 1
        elif name == "season_continued" and uid:
            funnel_users["season_continued"].add(uid)

    for uid, c in workout_counts.items():
        if c >= 5:
            funnel_users["habit_5_workouts"].add(uid)

    # ── 留存：cohort = 每人最早活躍日；DN = 第 N 天仍出現 ──
    def retention(n: int):
        eligible = returned = 0
        cutoff = datetime.utcnow() - timedelta(days=n)
        for uid, ds in user_days.items():
            first = min(ds)
            first_dt = datetime.strptime(first, "%Y-%m-%d")
            if first_dt > cutoff:
                continue  # 還沒活過 N 天，不計入分母
            eligible += 1
            target = day_of(first_dt + timedelta(days=n))
            if target in ds:
                returned += 1
        return {"eligible": eligible, "returned": returned,
                "rate": round(returned / eligible * 100, 1) if eligible else None}

    dau_series = sorted(
        [{"date": d, "users": len(s)} for d, s in dau.items()], key=lambda x: x["date"])

    return {
        "window_days": days,
        "dau": dau_series,
        "wau": len({u for d, s in dau.items() for u in s
                    if datetime.strptime(d, "%Y-%m-%d") >= datetime.utcnow() - timedelta(days=7)}),
        "total_users": len(user_days),
        "retention": {"d1": retention(1), "d7": retention(7), "d30": retention(30)},
        "funnel": [
            {"step": "開啟 App", "users": len(funnel_users["app_open"])},
            {"step": "完成 Onboarding", "users": len(funnel_users["onboarding_completed"])},
            {"step": "完成首次訓練", "users": len(funnel_users["first_workout"])},
            {"step": "養成習慣（≥5 次）", "users": len(funnel_users["habit_5_workouts"])},
            {"step": "延續 Season", "users": len(funnel_users["season_continued"])},
        ],
        "errors_top": sorted(
            [{"name": k, "count": v} for k, v in error_counts.items()],
            key=lambda x: -x["count"])[:10],
    }


@router.get("/summary")
async def telemetry_summary(request: Request, days: int = 7):
    """事件計數摘要（給你自己看漏斗用）。需 header: X-Admin-Key = $ADMIN_KEY"""
    admin_key = os.getenv("ADMIN_KEY")
    if not admin_key or request.headers.get("X-Admin-Key") != admin_key:
        raise HTTPException(status_code=403, detail="Forbidden")
    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)
    from sqlalchemy import func
    with SessionLocal() as db:
        counts = (
            db.query(TelemetryEvent.name, TelemetryEvent.etype,
                     func.count(TelemetryEvent.id),
                     func.count(func.distinct(TelemetryEvent.user_id)))
            .filter(TelemetryEvent.created_at >= since)
            .group_by(TelemetryEvent.name, TelemetryEvent.etype)
            .all()
        )
        recent_errors = (
            db.query(TelemetryEvent)
            .filter(TelemetryEvent.etype == "error", TelemetryEvent.created_at >= since)
            .order_by(TelemetryEvent.created_at.desc())
            .limit(20)
            .all()
        )
    return {
        "days": days,
        "events": [
            {"name": n, "type": t, "count": c, "unique_users": u}
            for n, t, c, u in counts
        ],
        "recent_errors": [
            {"user_id": e.user_id, "name": e.name, "props": e.props,
             "at": e.created_at.isoformat() if e.created_at else None}
            for e in recent_errors
        ],
    }
