// runMilestones.js
// ──────────────────────────────────────────────────────────────────────────
// 跑步里程碑與步態（cadence/stride）工具
//   1. generateDistanceMarkers：每隔固定距離（預設 0.5km）在 GPS 路線上插一個
//      標記點，給結算地圖畫「每 0.5 公里」的里程牌（類似 Strava 的 split 標記）。
//   2. ensureGaitStreams：補齊步頻(cadence)/步幅(stride) 串流，避免結算頁出現 N/A。
//      stride 若沒原始值，用「速度 ÷ (步頻/60)」推算（公尺/步）。
// ──────────────────────────────────────────────────────────────────────────

/** 兩個經緯度點之間的距離（公尺）— Haversine。 */
function haversineMeters(a, b) {
    if (!a || !b) return 0;
    const toRad = (d) => (d * Math.PI) / 180;
    const lat1 = Array.isArray(a) ? a[0] : a.lat;
    const lng1 = Array.isArray(a) ? a[1] : a.lng;
    const lat2 = Array.isArray(b) ? b[0] : b.lat;
    const lng2 = Array.isArray(b) ? b[1] : b.lng;
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 把任意點正規化成 {lat,lng}；失敗回 null。 */
function toLatLng(p) {
    if (!p) return null;
    const lat = Array.isArray(p) ? Number(p[0]) : Number(p?.lat);
    const lng = Array.isArray(p) ? Number(p[1]) : Number(p?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
}

/**
 * 每隔 stepKm 公里，在路線上插一個里程碑標記。
 * @param {Array} route - GPS 點陣列（[[lat,lng]...] 或 [{lat,lng}...]）
 * @param {number} totalDistanceKm - 本次總距離（公里），用來決定要標到幾公里
 * @param {object} opts - { stepKm = 0.5, splits = [] }；splits 用來在標記上帶該段配速
 * @returns {Array} markers - [{ distance, label, subLabel, kind:'distance', coordinates:{lat,lng} }]
 */
export function generateDistanceMarkers(route, totalDistanceKm, opts = {}) {
    const stepKm = opts.stepKm || 0.5;
    const splits = opts.splits || [];
    const clean = (route || []).map(toLatLng).filter(Boolean);
    if (clean.length < 2) return [];

    // 沿路線累積距離，建立 cumMeters[i] = 從起點到第 i 點的累積公尺
    const cum = [0];
    for (let i = 1; i < clean.length; i++) {
        cum[i] = cum[i - 1] + haversineMeters(clean[i - 1], clean[i]);
    }
    const totalMetersRoute = cum[cum.length - 1];
    // 以 GPS 實際長度與回報距離取較可信者（GPS 抖動時回報距離通常較準）
    const totalMeters = (Number(totalDistanceKm) > 0 ? totalDistanceKm * 1000 : totalMetersRoute) || totalMetersRoute;
    if (totalMeters <= 0) return [];

    // 找出某個目標公尺數落在路線上的座標（線性內插）
    const coordAtMeters = (target) => {
        if (target <= 0) return clean[0];
        if (target >= totalMetersRoute) return clean[clean.length - 1];
        let i = 1;
        while (i < cum.length && cum[i] < target) i++;
        const prev = clean[i - 1];
        const next = clean[i];
        const segLen = cum[i] - cum[i - 1] || 1;
        const t = (target - cum[i - 1]) / segLen;
        return {
            lat: prev.lat + (next.lat - prev.lat) * t,
            lng: prev.lng + (next.lng - prev.lng) * t,
        };
    };

    const paceForKm = (km) => {
        // splits 可能用 km / split_index 命名；找最接近的整數公里
        const idx = Math.ceil(km) - 1;
        const s = splits[idx];
        if (!s) return null;
        return s.pace ?? s.avg_pace ?? null;
    };

    const markers = [];
    const maxKm = Math.floor((totalMeters / 1000) / stepKm) * stepKm;
    for (let km = stepKm; km <= maxKm + 1e-6; km += stepKm) {
        const c = coordAtMeters(km * 1000);
        if (!c) continue;
        const isWhole = Math.abs(km - Math.round(km)) < 1e-6;
        markers.push({
            kind: 'distance',
            distance: Number(km.toFixed(1)),
            isWhole,
            label: `${km % 1 === 0 ? km : km.toFixed(1)} 公里`,
            subLabel: '里程碑',
            pace: paceForKm(km),
            coordinates: { lat: c.lat, lng: c.lng },
        });
    }
    return markers;
}

/**
 * 補齊步頻 / 步幅串流，避免結算頁 N/A。
 * @param {object} streamData - { cadence?: number[], pace?: number[], stride?: number[] }
 * @returns {{ cadence:number[], stride:number[], avgCadence:number, avgStride:number }}
 *
 * 步幅推算：speed(m/s) = 1000 / paceSecPerKm；stride(m/步) = speed / (cadence/60)。
 * cadence 為單腳或雙腳 spm 皆可運作（這裡視為總步頻 spm）。
 */
export function ensureGaitStreams(streamData = {}) {
    const cadenceIn = Array.isArray(streamData.cadence) ? streamData.cadence.filter((v) => Number.isFinite(v) && v > 0) : [];
    const paceIn = Array.isArray(streamData.pace) ? streamData.pace : [];
    const strideIn = Array.isArray(streamData.stride) ? streamData.stride.filter((v) => Number.isFinite(v) && v > 0) : [];

    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    let cadence = cadenceIn;
    let stride = strideIn;

    // stride 沒有原始資料 → 用 pace + cadence 推算（兩者等長時逐點，否則用平均）
    if (stride.length === 0 && cadence.length > 0) {
        const len = Math.min(cadence.length, paceIn.length || cadence.length);
        const out = [];
        for (let i = 0; i < len; i++) {
            const cad = cadence[i];
            const paceSec = paceIn[i];
            const speed = paceSec > 0 ? 1000 / paceSec : 0; // m/s
            const stepsPerSec = cad / 60;
            const s = stepsPerSec > 0 ? speed / stepsPerSec : 0;
            if (Number.isFinite(s) && s > 0 && s < 3) out.push(Number(s.toFixed(2)));
        }
        stride = out;
    }

    const avgCadence = Math.round(avg(cadence));
    const avgStride = Number(avg(stride).toFixed(2));

    return { cadence, stride, avgCadence, avgStride };
}

export default { generateDistanceMarkers, ensureGaitStreams };
