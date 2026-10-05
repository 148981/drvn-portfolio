/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * cardioDownsample.js — 跑步時序資料「上傳前降取樣」
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 目的：雲端只收「顯示需要的密度」，省 70–80% 容量，圖表/地圖肉眼無差。
 *   · stream_data（HR / 配速 / 海拔 / 步頻）：每秒 → 每 5 秒（且總點數上限 ~360）
 *   · route（GPS 路線）：Douglas–Peucker 簡化（~5m 容差）
 * 注意：headline 數據（距離/均速/最大心率…）存在 metrics，不靠這些序列，
 *       所以降取樣不影響任何統計數字；裝置本地 IndexedDB 仍保留完整解析度。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// 圖表在手機上寬度約 350px，超過 ~360 點視覺上無意義。
const MAX_STREAM_POINTS = 360;
const MIN_STEP = 5; // 至少每 5 秒一點

/**
 * 依索引等距抽樣 stream_data 的每一條序列（lockstep）。
 * 保留第一點與最後一點，避免頭尾被切掉。
 */
export function downsampleStream(stream, { minStep = MIN_STEP, maxPoints = MAX_STREAM_POINTS } = {}) {
  if (!stream || typeof stream !== 'object') return stream;

  const keys = ['timestamps', 'heart_rate', 'pace', 'elevation', 'cadence'];
  const present = keys.filter(k => Array.isArray(stream[k]) && stream[k].length > 0);
  if (present.length === 0) return stream;

  const n = Math.max(...present.map(k => stream[k].length));
  if (n <= maxPoints && minStep <= 1) return stream;

  // step：至少 minStep，且讓總點數不超過 maxPoints
  const step = Math.max(minStep, Math.ceil(n / maxPoints));
  if (step <= 1) return stream;

  // 要保留的索引（含最後一點）
  const idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);

  const out = { ...stream };
  for (const k of present) {
    const arr = stream[k];
    out[k] = idx.filter(i => i < arr.length).map(i => arr[i]);
  }
  return out;
}

// ── Douglas–Peucker 路線簡化（lat/lng，容差以公尺計）──
function perpDistanceMeters(p, a, b) {
  // 以等距圓柱投影把經緯度換成公尺平面（短距離誤差可忽略）
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const latRef = toRad(a.lat);
  const x = (pt) => R * toRad(pt.lng) * Math.cos(latRef);
  const y = (pt) => R * toRad(pt.lat);
  const px = x(p), py = y(p);
  const ax = x(a), ay = y(a);
  const bx = x(b), by = y(b);
  const dx = bx - ax, dy = by - ay;
  const segLen2 = dx * dx + dy * dy;
  if (segLen2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / segLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDist = 0, index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDistanceMeters(points[i], points[0], points[end]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, index + 1), tolerance);
    const right = douglasPeucker(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/**
 * 簡化 GPS 路線。toleranceMeters 越大、點越少（地圖線條視覺幾乎相同）。
 * 路線點需含 { lat, lng }。其他形狀則原樣回傳（安全）。
 */
export function simplifyRoute(route, toleranceMeters = 5) {
  if (!Array.isArray(route) || route.length <= 2) return route || [];
  const ok = route.every(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!ok) return route;
  return douglasPeucker(route, toleranceMeters);
}

/**
 * 一次降取樣整個 cardio payload 的時序部分。回傳新物件，不改原始 data。
 */
export function downsampleCardioForUpload({ route, stream_data } = {}) {
  return {
    route: simplifyRoute(route, 5),
    stream_data: downsampleStream(stream_data),
  };
}
