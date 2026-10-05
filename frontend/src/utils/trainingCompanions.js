/**
 * trainingCompanions.js — 「一起訓練」自動偵測（前端啟動式，仿 Strava）
 * ──────────────────────────────────────────────────────────────────────
 * 概念：跑步結束時，用「我這趟」的時間窗 + GPS 路線，跟好友最近的 session 比對。
 *   若兩人的訓練「時間重疊」且「路線起點/軌跡夠近」，就判定為一起訓練。
 *
 * 判定條件（兩者皆須成立）：
 *   1. 時間重疊：兩段訓練的 [start,end] 有交集，或起跑時間相差 < TIME_TOL 分鐘。
 *   2. 空間鄰近：任一取樣點對之間的最短距離 < DIST_TOL 公尺（用起點/若干取樣點）。
 *
 * 設計成純函式、資料形狀寬鬆：呼叫端把「我的 session」與「候選好友 sessions」丟進來即可。
 * 偵測到的同行者存進該次 session 的 companions 欄位，供圖一/排行卡牌顯示。
 * ──────────────────────────────────────────────────────────────────────
 */

const TIME_TOL_MIN = 20;   // 起跑時間容忍（分鐘）
const DIST_TOL_M = 120;    // 空間鄰近容忍（公尺）
const MIN_NEAR_PTS = 2;    // 至少幾個取樣點鄰近才算同行

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Haversine 距離（公尺）
export function haversineM(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(num(b.lat) - num(a.lat));
    const dLng = toRad(num(b.lng) - num(a.lng));
    const la1 = toRad(num(a.lat));
    const la2 = toRad(num(b.lat));
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 從各種可能的 session 形狀抽出路線點 [{lat,lng}]
export function extractRoute(session) {
    const raw = session?.route || session?.route_data || session?.path || session?.coordinates || [];
    if (!Array.isArray(raw)) return [];
    return raw.map((p) => {
        if (Array.isArray(p)) return { lat: num(p[0]), lng: num(p[1]) };
        return { lat: num(p.lat ?? p.latitude ?? p[0]), lng: num(p.lng ?? p.lon ?? p.longitude ?? p[1]) };
    }).filter((p) => p.lat !== 0 || p.lng !== 0);
}

// 起跑時間（ms）
const startMs = (s) => {
    const t = s?.startTime ?? s?.start_time ?? s?.timestamp ?? s?.date ?? s?.created_at ?? null;
    const v = typeof t === 'number' ? t : Date.parse(t);
    return Number.isFinite(v) ? v : null;
};
// 訓練時長（秒）→ 結束時間
const durSec = (s) => num(s?.duration ?? s?.duration_seconds ?? s?.metrics?.duration ?? s?.stats?.duration);
const endMs = (s) => { const st = startMs(s); return st == null ? null : st + durSec(s) * 1000; };

// 取路線的取樣點（起點 + 均勻幾個）
function samplePoints(route, n = 5) {
    if (route.length === 0) return [];
    if (route.length <= n) return route;
    const step = Math.floor(route.length / n);
    const out = [];
    for (let i = 0; i < route.length; i += step) out.push(route[i]);
    return out;
}

/** 時間是否重疊 / 相近 */
export function timesOverlap(mine, other) {
    const ms1 = startMs(mine), me1 = endMs(mine);
    const ms2 = startMs(other), me2 = endMs(other);
    if (ms1 == null || ms2 == null) return false;
    // 起跑相差在容忍內
    if (Math.abs(ms1 - ms2) <= TIME_TOL_MIN * 60000) return true;
    // 或 [start,end] 區間有交集
    if (me1 != null && me2 != null) return ms1 <= me2 && ms2 <= me1;
    return false;
}

/** 空間是否鄰近（至少 MIN_NEAR_PTS 個取樣點對 < DIST_TOL） */
export function routesNear(mine, other) {
    const r1 = samplePoints(extractRoute(mine));
    const r2 = samplePoints(extractRoute(other));
    if (r1.length === 0 || r2.length === 0) return false;
    let near = 0;
    for (const p of r1) {
        const closest = Math.min(...r2.map((q) => haversineM(p, q)));
        if (closest <= DIST_TOL_M) near += 1;
        if (near >= MIN_NEAR_PTS) return true;
    }
    return false;
}

/**
 * 主偵測：回傳判定為同行的好友清單。
 * @param {object} mySession   我剛完成的 session（需含 route + 時間）
 * @param {object[]} friendSessions 候選好友 session（每筆需含 userId/name/avatar + route + 時間）
 * @returns {{userId,name,avatar,confidence}[]}
 */
export function detectCompanions(mySession, friendSessions = []) {
    if (!mySession || !Array.isArray(friendSessions)) return [];
    const seen = new Map();
    friendSessions.forEach((fs) => {
        const uid = fs.userId || fs.user_id || fs.id;
        if (!uid) return;
        const tOk = timesOverlap(mySession, fs);
        if (!tOk) return;
        const sOk = routesNear(mySession, fs);
        // 時間吻合但無 GPS → 低信心；時間+空間皆吻合 → 高信心
        const hasGps = extractRoute(mySession).length > 0 && extractRoute(fs).length > 0;
        if (hasGps && !sOk) return;
        const confidence = hasGps && sOk ? 'high' : 'time-only';
        const prev = seen.get(uid);
        if (!prev || confidence === 'high') {
            // 📊 同行者「完賽數據」— 對方已結束的 session 才有；供最新動態卡直接顯示
            const m = fs.metrics || fs.stats || {};
            const dist = Number(m.distance ?? m.distance_km ?? fs.distance ?? 0) || 0;
            const dur = Number(m.duration ?? m.duration_seconds ?? fs.duration ?? 0) || 0;
            let pace = Number(m.avgPace ?? m.pace ?? m.pace_per_km ?? 0) || 0;
            if (!pace && dist > 0 && dur > 0) pace = Math.round(dur / dist);
            // 🏋️ 重訓同行者：帶訓練量 / 組數（無 GPS，靠時間重疊判定）
            const vol = Number(m.volume ?? m.volume_kg ?? fs.volume ?? 0) || 0;
            const sets = Number(m.sets ?? fs.sets ?? 0) || 0;
            seen.set(uid, {
                userId: uid,
                name: fs.name || fs.user_name || 'Athlete',
                avatar: fs.avatar || null,
                confidence,
                type: fs.type || (vol > 0 && dist === 0 ? 'strength' : 'cardio'),
                isFriend: fs.is_friend !== false, // 同跑偵測不限好友：非好友來源也收
                stats: (dist > 0 || dur > 0 || vol > 0) ? { distance: dist, duration: dur, pace, volume: vol, sets } : null,
            });
        }
    });
    return [...seen.values()];
}

// ── companions 存 / 讀（掛在 workout_history 對應 session 上）──────────
const COMPANION_KEY = 'drvn_session_companions'; // { [sessionId]: Companion[] }

export function saveSessionCompanions(sessionId, companions) {
    if (!sessionId || !companions?.length) return;
    try {
        const all = JSON.parse(localStorage.getItem(COMPANION_KEY) || '{}');
        all[sessionId] = companions;
        localStorage.setItem(COMPANION_KEY, JSON.stringify(all));
    } catch (_) {}
}

export function getSessionCompanions(sessionId) {
    try {
        const all = JSON.parse(localStorage.getItem(COMPANION_KEY) || '{}');
        return all[sessionId] || [];
    } catch (_) { return []; }
}

/** 取得「我最近一次跑步」偵測到的同行者（給圖一顯示） */
export function getLatestCompanions() {
    try {
        const all = JSON.parse(localStorage.getItem(COMPANION_KEY) || '{}');
        const keys = Object.keys(all);
        if (!keys.length) return [];
        // 以最後寫入者為準
        return all[keys[keys.length - 1]] || [];
    } catch (_) { return []; }
}

// ──────────────────────────────────────────────────────────────────────────
// 🤝 「一起練」的確定來源（不是猜的）
// ──────────────────────────────────────────────────────────────────────────
// detectCompanions 是靠時間＋GPS 推測的；但社群的「一起練」功能裡，
// 兩個人是真的按了「加入」「接受」—— 那是事實，不是推測。
// 事實優先於推測：這支把 live 房間的成員與「進行中的一起練約定」抓回來，
// 存檔時併進 companions，動態卡就能誠實寫出「和 XXX 一起練」。
//
// 失敗一律靜默降級（回空陣列）—— 社群端點掛掉不能擋存檔（鐵律：外部依賴不擋核心迴圈）。
// ──────────────────────────────────────────────────────────────────────────

/** 帶 timeout 的 GET，避免社群端點卡住存檔流程。 */
const _get = async (apiClient, url, ms = 3500) => {
    try {
        return await Promise.race([
            apiClient.get(url),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
        ]);
    } catch (_) { return null; }
};

/**
 * 現在正在「一起練」的夥伴（live 房間成員 ＋ 已接受且進行中的約定）。
 * @param {string} userId
 * @param {'strength'|'cardio'} kind 只影響回傳的 type 標記
 * @returns {Promise<Array>} companion 形狀，與 detectCompanions 一致
 */
export async function fetchTogetherPartners(userId, kind = 'cardio') {
    if (!userId) return [];
    const out = new Map();
    let apiClient;
    try { ({ default: apiClient } = await import('../api/client')); } catch (_) { return []; }

    // ① 即時一起練（同一個當下開房／加入）—— 最確定的一種
    const live = await _get(apiClient, `/api/live/mine/${userId}`);
    const cur = live?.data?.current;
    (cur?.members || []).forEach((m) => {
        const uid = m.user_id;
        if (!uid || uid === userId || m.is_me) return;
        out.set(uid, {
            userId: uid,
            name: m.name || '夥伴',
            avatar: m.avatar || null,
            confidence: 'confirmed',       // 對方真的按了加入，不是偵測出來的
            source: 'live',
            type: String(cur.type || '').toLowerCase() === 'lift' ? 'strength' : kind,
            isFriend: true,
            stats: null,                   // 這一場的數據由對方存檔後自己帶
        });
    });

    // ② 非同步的一起練約定（已接受、還在進行中）
    const list = await _get(apiClient, `/api/social/challenge/list/${userId}`);
    const rows = list?.data?.challenges || [];
    rows.forEach((c) => {
        const status = String(c.status || '').toLowerCase();
        if (status !== 'accepted' && status !== 'active' && status !== 'in_progress') return;
        const uid = c.from_user_id === userId ? c.to_user_id : c.from_user_id;
        if (!uid || uid === userId || out.has(uid)) return;
        out.set(uid, {
            userId: uid,
            name: c.opponent_name || c.to_user_name || c.from_user_name || '夥伴',
            avatar: c.opponent_avatar || null,
            confidence: 'confirmed',
            source: 'invite',
            type: String(c.type || '').toLowerCase() === 'lift' ? 'strength' : kind,
            isFriend: true,
            stats: null,
        });
    });

    return [...out.values()];
}

/**
 * 合併多組 companions（確定來源優先於偵測來源），以 userId 去重。
 * 同一個人被 live 房間與 GPS 偵測各抓到一次時，保留有數據的那筆、
 * 但 confidence 取較高者 —— 不能因為合併而把「確定」降級成「猜的」。
 */
export function mergeCompanions(...groups) {
    const rank = { confirmed: 3, high: 2, 'time-only': 1 };
    const out = new Map();
    groups.flat().filter(Boolean).forEach((c) => {
        const uid = c.userId || c.user_id;
        if (!uid) return;
        const prev = out.get(uid);
        if (!prev) { out.set(uid, { ...c, userId: uid }); return; }
        out.set(uid, {
            ...prev,
            ...c,
            userId: uid,
            // 有數據的那筆留著；兩邊都有就用新的
            stats: c.stats || prev.stats,
            confidence: (rank[c.confidence] || 0) >= (rank[prev.confidence] || 0) ? c.confidence : prev.confidence,
            source: prev.source === 'live' ? prev.source : (c.source || prev.source),
        });
    });
    return [...out.values()];
}
