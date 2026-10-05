// ════════════════════════════════════════════════════════════════════════
//  routeNavigation.js — 幾何式路線導航（Google Maps 風格的路口提示）
//  ─────────────────────────────────────────────────────────────────────
//  DRVN 的路線是使用者在地圖上自己標的 waypoints，沒有街道資料，
//  所以我們不講「在民生東路右轉」，而是講「300 公尺後 右轉」。
//
//  做法：
//    1. 把 waypoints 依「轉角明顯程度」簡化（去掉幾乎直線的中間點）。
//    2. 在每個保留下來的頂點計算方位角變化 → 轉彎方向與程度。
//    3. 跑步時把 GPS 位置投影回路線上 → 算出「還有幾公尺到下一個路口」。
//    4. 偏離路線超過門檻 → 回報 offRoute，讓 UI 提示回到路線上。
//
//  所有函式都是純函式，好測、不依賴地圖套件。
// ════════════════════════════════════════════════════════════════════════

const R_EARTH = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/**
 * 座標正規化 —— 路線可能來自手繪 ({lat,lng})、後端 segment ({latitude,longitude})
 * 或 Leaflet 陣列 ([lat,lng])。統一成 {lat,lng}，無效點直接丟掉。
 */
export const normalizePoints = (pts = []) =>
    (Array.isArray(pts) ? pts : [])
        .map((p) => {
            if (!p) return null;
            if (Array.isArray(p)) return { lat: Number(p[0]), lng: Number(p[1]) };
            const lat = Number(p.lat ?? p.latitude ?? p[0]);
            const lng = Number(p.lng ?? p.lon ?? p.longitude ?? p[1]);
            return { lat, lng };
        })
        .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
            && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);

/** 兩點距離（公尺） */
export const distanceM = (a, b) => {
    if (!a || !b) return 0;
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R_EARTH * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

/** a → b 的方位角（0–360，正北為 0，順時針） */
export const bearingDeg = (a, b) => {
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const dLng = toRad(b.lng - a.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

/** 方位角差，回傳 -180..180（正 = 右轉，負 = 左轉） */
export const bearingDelta = (from, to) => {
    let d = ((to - from + 540) % 360) - 180;
    if (Object.is(d, -180)) d = 180;
    return d;
};

/* ────────────────────────────────────────────────────────────────────
   轉彎分類 —— 門檻取自一般導航軟體的慣例
   ──────────────────────────────────────────────────────────────── */
export const TURN_TYPES = {
    straight:     { id: 'straight',     label: '直行',   icon: 'up',           minAbs: 0 },
    slight_right: { id: 'slight_right', label: '靠右',   icon: 'slight-right', minAbs: 20 },
    right:        { id: 'right',        label: '右轉',   icon: 'right',        minAbs: 50 },
    sharp_right:  { id: 'sharp_right',  label: '大幅右轉', icon: 'sharp-right', minAbs: 115 },
    uturn:        { id: 'uturn',        label: '迴轉',   icon: 'uturn',        minAbs: 155 },
    slight_left:  { id: 'slight_left',  label: '靠左',   icon: 'slight-left',  minAbs: 20 },
    left:         { id: 'left',         label: '左轉',   icon: 'left',         minAbs: 50 },
    sharp_left:   { id: 'sharp_left',   label: '大幅左轉', icon: 'sharp-left',  minAbs: 115 },
    arrive:       { id: 'arrive',       label: '抵達終點', icon: 'flag',        minAbs: 0 },
    depart:       { id: 'depart',       label: '出發',   icon: 'up',           minAbs: 0 },
};

export const classifyTurn = (delta) => {
    const a = Math.abs(delta);
    if (a >= 155) return TURN_TYPES.uturn;
    if (a < 20) return TURN_TYPES.straight;
    const right = delta > 0;
    if (a >= 115) return right ? TURN_TYPES.sharp_right : TURN_TYPES.sharp_left;
    if (a >= 50) return right ? TURN_TYPES.right : TURN_TYPES.left;
    return right ? TURN_TYPES.slight_right : TURN_TYPES.slight_left;
};

/* ────────────────────────────────────────────────────────────────────
   路線簡化 —— 手畫的路線常有一堆幾乎共線的點，直接逐點報轉彎會變噪音。
   用「累積角度」法：連續的小角度合併，累積夠大才視為一個路口。
   ──────────────────────────────────────────────────────────────── */
const simplify = (pts, minLegM = 25) => {
    if (pts.length <= 2) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
        const prev = out[out.length - 1];
        // 距離太近的點直接吃掉（GPS 抖動 / 手繪重複點）
        if (distanceM(prev, pts[i]) < minLegM) continue;
        out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out;
};

/**
 * 由 waypoints 產生轉彎指令列表
 *
 * @param {Array<{lat:number,lng:number}>} waypoints
 * @param {object} opts { minLegM, straightThreshold }
 * @returns {Array} steps
 *   { i, at, type, deltaDeg, distFromStartM, legM }
 *   legM = 從這個路口到下一個路口的距離
 */
export function buildTurnInstructions(waypoints = [], opts = {}) {
    const { minLegM = 25, straightThreshold = 20 } = opts;
    const pts = normalizePoints(waypoints);
    if (pts.length < 2) return [];

    const simple = simplify(pts, minLegM);
    if (simple.length < 2) return [];

    // 每個點的累積距離
    const cum = [0];
    for (let i = 1; i < simple.length; i++) {
        cum.push(cum[i - 1] + distanceM(simple[i - 1], simple[i]));
    }

    const steps = [];
    // 出發
    steps.push({
        i: 0,
        at: simple[0],
        type: TURN_TYPES.depart,
        deltaDeg: 0,
        distFromStartM: 0,
        legM: cum[1] - cum[0],
    });

    for (let i = 1; i < simple.length - 1; i++) {
        const inB = bearingDeg(simple[i - 1], simple[i]);
        const outB = bearingDeg(simple[i], simple[i + 1]);
        const delta = bearingDelta(inB, outB);
        if (Math.abs(delta) < straightThreshold) continue;   // 幾乎直行 → 不報

        steps.push({
            i,
            at: simple[i],
            type: classifyTurn(delta),
            deltaDeg: Math.round(delta),
            distFromStartM: cum[i],
            legM: 0, // 下面補
        });
    }

    // 抵達
    steps.push({
        i: simple.length - 1,
        at: simple[simple.length - 1],
        type: TURN_TYPES.arrive,
        deltaDeg: 0,
        distFromStartM: cum[cum.length - 1],
        legM: 0,
    });

    // 補 legM（到下一個指令的距離）
    for (let s = 0; s < steps.length - 1; s++) {
        steps[s].legM = steps[s + 1].distFromStartM - steps[s].distFromStartM;
    }

    return steps;
}

/* ────────────────────────────────────────────────────────────────────
   把目前位置投影回路線
   ──────────────────────────────────────────────────────────────── */

/** 以本地平面近似做點到線段的投影（幾百公尺尺度下誤差可忽略） */
const projectPointOnSegment = (p, a, b) => {
    const latRef = toRad((a.lat + b.lat) / 2);
    const mx = 111320 * Math.cos(latRef);   // 每度經度公尺
    const my = 110540;                      // 每度緯度公尺
    const ax = 0, ay = 0;
    const bx = (b.lng - a.lng) * mx, by = (b.lat - a.lat) * my;
    const px = (p.lng - a.lng) * mx, py = (p.lat - a.lat) * my;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const off = Math.hypot(px - cx, py - cy);
    return { t, offM: off, alongM: Math.hypot(cx - ax, cy - ay) };
};

/**
 * 位置 → 路線上的進度
 * @returns {{ alongM:number, offRouteM:number, segIndex:number }|null}
 */
export function projectOnRoute(position, waypoints = []) {
    const pts = normalizePoints(waypoints);
    const pos = normalizePoints([position])[0];
    if (!pos || pts.length < 2) return null;
    position = pos;

    let best = null;
    let cum = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const segLen = distanceM(pts[i], pts[i + 1]);
        const pr = projectPointOnSegment(position, pts[i], pts[i + 1]);
        if (!best || pr.offM < best.offRouteM) {
            best = { alongM: cum + pr.alongM, offRouteM: pr.offM, segIndex: i };
        }
        cum += segLen;
    }
    return best ? { ...best, totalM: cum } : null;
}

/* ────────────────────────────────────────────────────────────────────
   導航狀態
   ──────────────────────────────────────────────────────────────── */

const OFF_ROUTE_M = 45;          // 偏離超過這個距離才提示（GPS 誤差 + 人行道寬度）
const PASSED_MARGIN_M = 12;      // 過了路口多少公尺算通過

/**
 * @param {{lat,lng}} position 目前 GPS
 * @param {Array} steps buildTurnInstructions() 的輸出
 * @param {Array} waypoints 原始路線點
 * @returns {{
 *   current: object|null, next: object|null,
 *   distanceToTurnM: number|null, remainingM: number|null,
 *   offRoute: boolean, offRouteM: number, progress: number
 * }|null}
 */
export function getNavState(position, steps = [], waypoints = []) {
    if (!steps.length || !waypoints.length) return null;
    const proj = projectOnRoute(position, waypoints);
    if (!proj) return null;

    // 找出「還沒通過」的第一個指令（略過出發）
    const upcoming = steps.filter(
        (s) => s.type.id !== 'depart' && s.distFromStartM > proj.alongM - PASSED_MARGIN_M,
    );
    const current = upcoming[0] || steps[steps.length - 1];
    const next = upcoming[1] || null;

    const distanceToTurnM = Math.max(0, current.distFromStartM - proj.alongM);
    const remainingM = Math.max(0, (proj.totalM || 0) - proj.alongM);

    return {
        current,
        next,
        distanceToTurnM,
        remainingM,
        offRoute: proj.offRouteM > OFF_ROUTE_M,
        offRouteM: proj.offRouteM,
        progress: proj.totalM > 0 ? Math.min(1, proj.alongM / proj.totalM) : 0,
    };
}

/* ────────────────────────────────────────────────────────────────────
   中文播報／顯示
   ──────────────────────────────────────────────────────────────── */

/** 距離的口語化：500 公尺以內用公尺（取整到 10），以上用公里 */
export const speakDistance = (m) => {
    if (m == null) return '';
    if (m < 20) return '前方';
    if (m < 1000) return `${Math.round(m / 10) * 10} 公尺後`;
    return `${(m / 1000).toFixed(1)} 公里後`;
};

/** 導航文案：「300 公尺後 右轉」「抵達終點」 */
export function phraseFor(step, distanceM_) {
    if (!step) return '';
    if (step.type.id === 'arrive') {
        return distanceM_ != null && distanceM_ > 30
            ? `${speakDistance(distanceM_)}抵達終點`
            : '抵達終點';
    }
    if (step.type.id === 'straight' || step.type.id === 'depart') {
        return distanceM_ != null ? `直行 ${speakDistance(distanceM_).replace('後', '')}` : '直行';
    }
    return `${speakDistance(distanceM_)}${step.type.label}`;
}

/* ────────────────────────────────────────────────────────────────────
   Apple Maps 式樣的兩行結構：
     第 1 行 = 距離（大字）        例：「300 公尺」
     第 2 行 = 完整指令句           例：「向右轉，繼續沿路線前進」
   我們沒有街名，但可以把「轉哪邊 + 轉多急 + 接下來多長」講成完整的話，
   資訊量其實不輸街名，而且跑步時更好懂。
   ──────────────────────────────────────────────────────────────── */
const LEG_PHRASE = (m) => {
    if (!Number.isFinite(m) || m <= 0) return '';
    if (m < 400) return '接著是一小段直路';
    if (m < 1000) return `接著直行約 ${Math.round(m / 50) * 50} 公尺`;
    return `接著直行約 ${(m / 1000).toFixed(1)} 公里`;
};

const TURN_SENTENCE = {
    left:         '向左轉',
    right:        '向右轉',
    slight_left:  '靠左前方continue，保持在路線上',
    slight_right: '靠右前方continue，保持在路線上',
    sharp_left:   '大幅左轉，注意減速',
    sharp_right:  '大幅右轉，注意減速',
    uturn:        '迴轉，往反方向折返',
    straight:     '沿著路線直行',
    depart:       '沿著路線出發',
    arrive:       '抵達路線終點',
};

/**
 * 給 UI 用的兩行結構
 * @returns {{ distanceText:string, unit:string, sentence:string, imminent:boolean }}
 */
export function bannerTextFor(step, distanceM_, opts = {}) {
    if (!step) return { distanceText: '', unit: '', sentence: '', imminent: false };
    const imminent = distanceM_ != null && distanceM_ <= 30;

    let distanceText = '';
    let unit = '';
    if (distanceM_ != null && !imminent) {
        if (distanceM_ >= 1000) {
            distanceText = (distanceM_ / 1000).toFixed(1);
            unit = '公里';
        } else {
            distanceText = String(Math.max(10, Math.round(distanceM_ / 10) * 10));
            unit = '公尺';
        }
    } else {
        distanceText = '現在';
    }

    const base = TURN_SENTENCE[step.type.id] || step.type.label;
    // 靠左/靠右的句子上面誤植了英文，這裡統一產生
    const clean = step.type.id === 'slight_left' ? '靠左前方前進，保持在路線上'
        : step.type.id === 'slight_right' ? '靠右前方前進，保持在路線上'
        : base;

    const leg = opts.withLeg === false ? '' : LEG_PHRASE(step.legM);
    const sentence = step.type.id === 'arrive'
        ? '抵達路線終點'
        : leg ? `${clean}，${leg}` : clean;

    return { distanceText, unit, sentence, imminent };
}

/** 偏離路線時的句子 */
export const offRouteSentence = (offM) =>
    `偏離路線約 ${Math.round(offM)} 公尺，往回走回到路線上`;

/**
 * 播報節點 —— 與一般導航一致：500m / 200m / 50m / 抵達路口 各報一次。
 * 回傳這次應該播報的節點 id，沒有就回 null。
 */
export const ANNOUNCE_GATES = [500, 200, 50, 0];

export function nextAnnouncement(step, distanceM_, announced = new Set()) {
    if (!step || distanceM_ == null) return null;
    for (const gate of ANNOUNCE_GATES) {
        const key = `${step.i}:${gate}`;
        if (announced.has(key)) continue;
        // 抵達門檻：距離小於等於 gate（gate=0 用 15m 當「就是現在」）
        const trigger = gate === 0 ? 15 : gate;
        if (distanceM_ <= trigger) return { key, gate };
    }
    return null;
}

export default {
    distanceM,
    bearingDeg,
    bearingDelta,
    classifyTurn,
    buildTurnInstructions,
    projectOnRoute,
    getNavState,
    phraseFor,
    bannerTextFor,
    offRouteSentence,
    speakDistance,
    nextAnnouncement,
    normalizePoints,
    TURN_TYPES,
};
