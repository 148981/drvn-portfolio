/**
 * runMemory.js — 跑步記憶：你在哪裡跑、常跑哪幾條路線
 * ══════════════════════════════════════════════════════════════════════
 * 和健身房記憶（utils/gymMemory）同一套想法，換成跑步的單位：
 *
 *   地點   起跑點附近的操場／公園／河濱／路跑（Apple 地圖找得到就用店名，找不到用地區名）。
 *          記去過幾次、總里程、每種課跑過幾次、熟練度（門檻跟健身房同一份）。
 *   路線   起點、終點、中途三個點、距離都對得上 → 同一條。
 *          記跑過幾次、最快配速、最快完成時間、最近一次。
 *
 * 依地點排課（會員 placePlans）：操場適合間歇與節奏、公園與河濱適合有氧與恢復，
 * 快速訓練把適合這裡的課排前面。
 *
 * 純函式＋一個 localStorage key，node 驗證腳本直接 import。
 * 跑步機（沒有 GPS 路線）不記。
 * ══════════════════════════════════════════════════════════════════════
 */
import { uStorage } from './userStorage';
import { distanceM, proficiencyOf } from './gymMemory';

const KEY = 'runMemory';
export const RUN_PLACE_RADIUS_M = 250;   // 起跑點多近算同一個地點
export const RUN_MAX_PLACES = 30;
export const RUN_MAX_ROUTES = 20;
const ROUTE_START_M = 150, ROUTE_END_M = 200, ROUTE_MID_M = 250, ROUTE_DIST_TOL = 0.12;
const MIN_ROUTE_KM = 0.3, MIN_ROUTE_POINTS = 5;

/** 地點類型：中文名、適合的快速訓練（id 對 utils/quickRunCourses） */
export const RUN_KINDS = {
    track: { zh: '操場', suits: ['hill', 'progressive'] },
    park: { zh: '公園', suits: ['base', 'recovery'] },
    riverside: { zh: '河濱', suits: ['base', 'recovery'] },
    road: { zh: '路跑', suits: ['base', 'progressive'] },
};
export const COURSE_ZH = { recovery: '恢復跑', base: '有氧跑', progressive: '節奏跑', hill: '間歇跑' };

const empty = () => ({ v: 1, places: {}, routes: {}, lastPlaceId: null });
const clone = (x) => JSON.parse(JSON.stringify(x));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pt = (p) => {
    if (!p) return null;
    const lat = num(p.lat ?? p.latitude ?? (Array.isArray(p) ? p[0] : null));
    const lng = num(p.lng ?? p.lon ?? p.longitude ?? (Array.isArray(p) ? p[1] : null));
    return lat === null || lng === null ? null : { lat, lng };
};
const newId = (prefix, at) => `${prefix}_${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Apple 地圖的 POI 類別（和店名）→ 地點類型 */
export function kindFromCategory(cat, name = '') {
    const n = String(name || '');
    if (/河濱|河岸|水岸|堤/.test(n)) return 'riverside';
    if (/操場|田徑|運動場|體育場/.test(n)) return 'track';
    const c = String(cat || '').toLowerCase();
    if (c.includes('stadium') || c.includes('school')) return 'track';
    if (c.includes('park')) return 'park';
    if (c.includes('beach') || c.includes('marina')) return 'riverside';
    return 'road';
}

/* ── 讀寫 ─────────────────────────────────────────────────────────── */
export function loadRunMemory(userId) {
    try {
        const raw = uStorage(userId).get(KEY, null);
        return raw && typeof raw === 'object' && raw.places ? { ...empty(), ...raw } : empty();
    } catch { return empty(); }
}
export function saveRunMemory(userId, mem) {
    try { uStorage(userId).set(KEY, mem); } catch { /* 容量滿就算了 */ }
    import('./cloudSync').then(({ pushBlob }) => pushBlob('run_memory', mem)).catch(() => {});
    try { window.dispatchEvent(new CustomEvent('drvn:run-memory-changed')); } catch { /* node */ }
    return mem;
}

/* ── 地點 ─────────────────────────────────────────────────────────── */
export function findRunPlaceNear(mem, coords) {
    let best = null, bestD = Infinity;
    Object.values(mem?.places || {}).forEach((p) => {
        const d = distanceM(p, coords);
        if (d < bestD) { best = p; bestD = d; }
    });
    return bestD <= RUN_PLACE_RADIUS_M ? best : null;
}

export function createRunPlace(mem, { name, poiName = null, kind = 'road', area = null, lat, lng, at = Date.now() } = {}) {
    const next = clone(mem);
    const id = newId('rp', at);
    next.places[id] = {
        id, name: String(name || poiName || area || '').trim().slice(0, 24) || '我的跑點',
        poiName, kind: RUN_KINDS[kind] ? kind : 'road', area, lat: num(lat), lng: num(lng),
        createdAt: at, lastAt: null, sessions: 0, totalKm: 0, types: {},
    };
    const ids = Object.keys(next.places);
    if (ids.length > RUN_MAX_PLACES) {
        const victim = ids.filter((x) => x !== id).sort((a, b) => (next.places[a].lastAt || 0) - (next.places[b].lastAt || 0))[0];
        if (victim) delete next.places[victim];
    }
    return { mem: next, place: next.places[id] };
}

export function renameRunPlace(mem, id, name) {
    const next = clone(mem);
    const clean = String(name || '').trim().slice(0, 24);
    if (next.places[id] && clean) next.places[id].name = clean;
    return next;
}
export function setRunPlaceKind(mem, id, kind) {
    const next = clone(mem);
    if (next.places[id] && RUN_KINDS[kind]) next.places[id].kind = kind;
    return next;
}
export function forgetRunPlace(mem, id) {
    const next = clone(mem);
    delete next.places[id];
    Object.values(next.routes).forEach((r) => { if (r.placeId === id) r.placeId = null; });
    if (next.lastPlaceId === id) next.lastPlaceId = null;
    return next;
}
export const runPlaceProficiency = (place) => proficiencyOf(place);

/* ── 路線 ─────────────────────────────────────────────────────────── */
/** 一趟路線的指紋：起點、終點、25/50/75% 三個中途點、距離 */
export function routeSignature(route = [], distanceKm = 0) {
    const pts = (route || []).map(pt).filter(Boolean);
    const km = num(Number(distanceKm)) || 0;
    if (pts.length < MIN_ROUTE_POINTS || km < MIN_ROUTE_KM) return null;
    const at = (f) => pts[Math.min(pts.length - 1, Math.round((pts.length - 1) * f))];
    return { start: pts[0], end: pts[pts.length - 1], mids: [at(0.25), at(0.5), at(0.75)], distanceKm: km };
}

export function sameRoute(sig, r) {
    if (!sig || !r?.start) return false;
    if (Math.abs(sig.distanceKm - r.distanceKm) / Math.max(r.distanceKm, 0.1) > ROUTE_DIST_TOL) return false;
    if (distanceM(sig.start, r.start) > ROUTE_START_M || distanceM(sig.end, r.end) > ROUTE_END_M) return false;
    const hits = (r.mids || []).filter((m, i) => distanceM(m, sig.mids[i]) <= ROUTE_MID_M).length;
    return hits >= 2;
}

/** 畫地圖用：路線最多留 60 個點 */
function thin(route, max = 60) {
    const pts = (route || []).map(pt).filter(Boolean);
    if (pts.length <= max) return pts;
    const step = (pts.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

/**
 * 記一趟跑步。
 * @param {{route, distanceKm, durationSec, type?, at?, place?:{name,poiName,kind,area,lat,lng}}} run
 *        place 只有在「起點附近沒有記過的地點」時才用來新建
 * @returns {{ mem, placeId, routeId, newRoute:boolean, routePR:boolean }}
 */
export function recordRun(mem, run = {}) {
    const at = run.at || Date.now();
    const sig = routeSignature(run.route, run.distanceKm);
    const start = sig?.start || pt(run.route?.[0]);
    if (!start) return { mem, placeId: null, routeId: null, newRoute: false, routePR: false };
    let next = clone(mem);

    // 地點
    let place = findRunPlaceNear(next, start);
    if (!place) {
        const r = createRunPlace(next, { ...(run.place || {}), lat: run.place?.lat ?? start.lat, lng: run.place?.lng ?? start.lng, at });
        next = r.mem; place = r.place;
    }
    const p = next.places[place.id];
    p.sessions += 1;
    p.totalKm = Math.round((p.totalKm + (Number(run.distanceKm) || 0)) * 100) / 100;
    p.lastAt = at;
    if (run.type) p.types[run.type] = (p.types[run.type] || 0) + 1;
    next.lastPlaceId = p.id;

    // 路線
    let routeId = null, newRoute = false, routePR = false;
    if (sig) {
        const pace = num(Number(run.durationSec)) && sig.distanceKm ? Math.round(run.durationSec / sig.distanceKm) : null;
        let r = Object.values(next.routes).find((x) => sameRoute(sig, x));
        if (!r) {
            const id = newId('rt', at);
            r = next.routes[id] = {
                // 名字不帶距離（距離另外顯示，不講兩次）：同一個跑點的第幾條 → A、B、C…
                id, name: `${p.name} ${String.fromCharCode(65 + Object.values(next.routes).filter((x) => x.placeId === p.id).length % 26)}`, placeId: p.id,
                start: sig.start, end: sig.end, mids: sig.mids, distanceKm: Math.round(sig.distanceKm * 100) / 100,
                path: thin(run.route), runs: 0, bestPaceSec: null, bestTimeSec: null, lastAt: null, createdAt: at,
            };
            newRoute = true;
        }
        r.runs += 1;
        r.lastAt = at;
        if (pace && (!r.bestPaceSec || pace < r.bestPaceSec)) { routePR = r.runs > 1; r.bestPaceSec = pace; }
        const secs = num(Number(run.durationSec));
        if (secs && (!r.bestTimeSec || secs < r.bestTimeSec)) r.bestTimeSec = Math.round(secs);
        routeId = r.id;
        const ids = Object.keys(next.routes);
        if (ids.length > RUN_MAX_ROUTES) {
            const victim = ids.filter((x) => x !== routeId)
                .sort((a, b) => (next.routes[a].runs - next.routes[b].runs) || ((next.routes[a].lastAt || 0) - (next.routes[b].lastAt || 0)))[0];
            if (victim) delete next.routes[victim];
        }
    }
    return { mem: next, placeId: p.id, routeId, newRoute, routePR };
}

export function renameRoute(mem, id, name) {
    const next = clone(mem);
    const clean = String(name || '').trim().slice(0, 24);
    if (next.routes[id] && clean) next.routes[id].name = clean;
    return next;
}
export function forgetRoute(mem, id) {
    const next = clone(mem);
    delete next.routes[id];
    return next;
}

/**
 * 選路線時：這條路線之前跑過的紀錄。
 *   · 從記憶裡選的路線 → 直接用它的 id
 *   · 自己畫的路線 → 用指紋（起點、終點、中途點、距離）比對記憶裡的路線
 * 沒跑過就回 null —— 不編紀錄。
 */
export function routeHistoryFor(mem, { routeId = null, waypoints = [], distanceKm = 0 } = {}) {
    if (routeId && mem?.routes?.[routeId]) return mem.routes[routeId];
    const sig = routeSignature(waypoints, distanceKm);
    if (!sig) return null;
    return Object.values(mem?.routes || {}).find((r) => sameRoute(sig, r)) || null;
}

/** 常跑路線：跑過 2 次以上才算「常跑」，依次數排 */
export const frequentRoutes = (mem, minRuns = 2) => Object.values(mem?.routes || {})
    .filter((r) => r.runs >= minRuns).sort((a, b) => b.runs - a.runs || (b.lastAt || 0) - (a.lastAt || 0));

export const runPlacesByRecent = (mem) => Object.values(mem?.places || {})
    .sort((a, b) => (b.lastAt || b.createdAt || 0) - (a.lastAt || a.createdAt || 0));

/* ── 依地點排課 ───────────────────────────────────────────────────── */
export const suitedCourses = (place) => (place && RUN_KINDS[place.kind]?.suits) || [];

/** 快速訓練的課依這個地點排：適合的在前，其餘照原本順序 */
export function sortCoursesForPlace(courses = [], place) {
    const suits = suitedCourses(place);
    if (!suits.length) return courses;
    const rank = (c) => { const i = suits.indexOf(c?.id); return i === -1 ? 99 : i; };
    return [...courses].map((c, i) => ({ c, i })).sort((a, b) => (rank(a.c) - rank(b.c)) || (a.i - b.i)).map((x) => x.c);
}

/** 配速秒數 → 5'12" */
export const paceLabel = (sec) => {
    if (!num(sec)) return null;
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;
};

export default {
    RUN_KINDS, loadRunMemory, saveRunMemory, recordRun, findRunPlaceNear, frequentRoutes,
    sortCoursesForPlace, suitedCourses, routeSignature, sameRoute,
};
