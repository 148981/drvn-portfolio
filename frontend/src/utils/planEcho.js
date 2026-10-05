// planEcho.js — 🔁 「上次同款計劃」回聲系統
// ─────────────────────────────────────────────────────────────────────────────
// 目的：結算時把「這次練得如何」濃縮成 3-4 個列點存起來；
//       下次使用者開啟「一樣 / 相似」的計劃時，跳出提示卡告訴他：
//       「上次練這份課表時你表現如何、教練說了什麼、這次目標是什麼」。
//
// 設計原則：
//   1. 零依賴、純 localStorage（透過 uStorage 以 userId 隔離）。
//   2. 簽名（signature）決定「同款」：
//      - 重訓：動作名稱排序後 join（±容忍 1 個動作差異視為相似）
//      - 跑步：subtype + 距離取整 km（easy-5k 與 easy-5.4k 視為同款）
//   3. 每個簽名只留最近 3 筆，總簽名數上限 40，不撐爆 storage。
//
// API：
//   saveStrengthEcho(userId, { exercises, coachSummary, stats })
//   saveRunEcho(userId, { subtype, distanceKm, runIntel, stats })
//   getStrengthEcho(userId, exercises)   → { echo, similarity } | null
//   getRunEcho(userId, subtype, distanceKm) → echo | null
// ─────────────────────────────────────────────────────────────────────────────

import { uStorage } from './userStorage';

const KEY = 'drvn_plan_echoes';
const MAX_SIGNATURES = 40;
const MAX_PER_SIGNATURE = 3;

const exNames = (exercises = []) =>
    (exercises || [])
        .map((e) => String(e?.name || e?.exercise_name || '').trim())
        .filter(Boolean)
        .sort();

export const strengthSignature = (exercises = []) => `s:${exNames(exercises).join('|')}`;
export const runSignature = (subtype, distanceKm) =>
    `r:${String(subtype || 'easy').toLowerCase()}:${Math.round(Number(distanceKm) || 0)}k`;

/**
 * 兩趟算不算「同款距離」。
 *
 * ⚠️ 以前只比對「四捨五入到公里」的簽名、再加上 ±1k 的鄰居 —— 等於容忍到
 *    ±1.5 km。實際後果（使用者回報）：打開 **3.9 公里** 的輕鬆跑課表，
 *    「上次同款」秀的是一趟 **5.10 公里** 的跑步，差了 31%。
 *    那不是同一堂課，拿來比配速只會得到錯的結論。
 *
 * 改成按比例：±12%，但短課表至少給 ±0.5 km（3 公里 ×12% 只有 0.36，太嚴）。
 *   3.9 vs 5.10 → 差 1.20 > 0.50 → 不同款 ✅
 *   5.0 vs 5.40 → 差 0.40 ≤ 0.60 → 同款 ✅
 */
const SAME_DISTANCE_RATIO = 0.12;
const SAME_DISTANCE_MIN_KM = 0.5;
export const isSameRunDistance = (a, b) => {
    const x = Number(a) || 0, y = Number(b) || 0;
    if (!(x > 0) || !(y > 0)) return false;
    return Math.abs(x - y) <= Math.max(SAME_DISTANCE_MIN_KM, x * SAME_DISTANCE_RATIO);
};

/** 由時間與距離回推配速；算不出合理值就回 null（不猜）。 */
const paceSecFrom = (durationSec, distanceKm) => {
    const t = Number(durationSec) || 0, k = Number(distanceKm) || 0;
    if (!(t > 0) || !(k > 0)) return null;
    const pace = Math.round(t / k);
    return pace >= 150 && pace <= 900 ? pace : null;   // 與 personalRecords 同一組合理區間
};

function loadAll(userId) {
    try {
        const all = uStorage(userId).get(KEY, {});
        return all && typeof all === 'object' ? all : {};
    } catch { return {}; }
}

function persist(userId, all) {
    try {
        // 簽名數超標 → 淘汰最舊的簽名
        const keys = Object.keys(all);
        if (keys.length > MAX_SIGNATURES) {
            keys
                .sort((a, b) => new Date(all[a][0]?.date || 0) - new Date(all[b][0]?.date || 0))
                .slice(0, keys.length - MAX_SIGNATURES)
                .forEach((k) => delete all[k]);
        }
        uStorage(userId).set(KEY, all);
    } catch { /* quota — 靜默失敗，回聲屬 nice-to-have */ }
}

function pushEcho(userId, signature, echo) {
    if (!userId || !signature) return;
    const all = loadAll(userId);
    const list = Array.isArray(all[signature]) ? all[signature] : [];
    list.unshift({ ...echo, date: new Date().toISOString() });
    all[signature] = list.slice(0, MAX_PER_SIGNATURE);
    persist(userId, all);
}

// ── 儲存：重訓結算 ──────────────────────────────────────────────────────────
export function saveStrengthEcho(userId, { exercises = [], coachSummary = null, stats = {} } = {}) {
    const names = exNames(exercises);
    if (!names.length) return;
    const bullets = [];
    if (stats.volume > 0) bullets.push(`總訓練量 ${Math.round(stats.volume).toLocaleString()} kg`);
    if (stats.prCount > 0) bullets.push(`刷新 ${stats.prCount} 項個人紀錄 🏅`);
    if (coachSummary?.strengthScore != null) bullets.push(`Strength Score ${coachSummary.strengthScore}（${coachSummary.strengthGrade}）`);
    // 教練下一步（最多 2 點）
    const pts = Array.isArray(coachSummary?.coaching_points) ? coachSummary.coaching_points : [];
    pts.filter((p) => /^下一步|^注意/.test(p)).slice(0, 2).forEach((p) => bullets.push(p));
    if (!bullets.length && coachSummary?.validation) bullets.push(coachSummary.validation);
    pushEcho(userId, strengthSignature(exercises), {
        type: 'strength',
        planName: stats.planName || stats.focusGroup || '',
        bullets: bullets.slice(0, 4),
        volume: Math.round(stats.volume || 0),
        score: coachSummary?.strengthScore ?? null,
        exerciseCount: names.length,
    });
}

// ── 儲存：跑步結算 ──────────────────────────────────────────────────────────
export function saveRunEcho(userId, { subtype = 'easy', distanceKm = 0, runIntel = null, stats = {} } = {}) {
    if (!(Number(distanceKm) >= 1)) return;
    /* ⚠️ 只存**數字**，不存句子。
       以前這裡把結算當下產生的整句（例：「1 公里新紀錄 5'33"/km —
       比先前最佳快了 4 分 48 秒」）原封不動存進 localStorage。那句話一旦寫進去
       就凍結了：後來把 PR 比較邏輯修好，畫面上還是繼續顯示那個舊的錯數字，
       而且永遠不會自己更新。存數字、要顯示的時候現算，才改得動。 */
    pushEcho(userId, runSignature(subtype, distanceKm), {
        type: 'run',
        planName: stats.planName || '',
        distanceKm: +Number(distanceKm).toFixed(2),
        durationSec: Number(stats.durationSec) > 0 ? Math.round(Number(stats.durationSec)) : null,
        avgPaceSec: paceSecFrom(stats.durationSec, distanceKm),
        score: runIntel?.runScore ?? null,
    });
}

// ── 讀取：重訓（完全相同 or 相似課表都會命中）────────────────────────────────
export function getStrengthEcho(userId, exercises = []) {
    const names = exNames(exercises);
    if (!userId || !names.length) return null;
    const all = loadAll(userId);
    // 1) 完全同款
    const exact = all[strengthSignature(exercises)];
    if (Array.isArray(exact) && exact.length) return { echo: exact[0], similarity: 'exact' };
    // 2) 相似款：動作重疊率 >= 60%（Jaccard；例：3 動作中 2 個相同即命中）
    let best = null, bestScore = 0;
    for (const [sig, list] of Object.entries(all)) {
        if (!sig.startsWith('s:') || !Array.isArray(list) || !list.length) continue;
        const other = sig.slice(2).split('|').filter(Boolean);
        const setA = new Set(names), setB = new Set(other);
        const inter = [...setA].filter((n) => setB.has(n)).length;
        const union = new Set([...setA, ...setB]).size;
        const j = union > 0 ? inter / union : 0;
        if (j >= 0.6 && j > bestScore) { bestScore = j; best = list[0]; }
    }
    return best ? { echo: best, similarity: 'similar' } : null;
}

// ── 讀取：跑步（同 subtype、距離 ±1km 內視為同款）────────────────────────────
export function getRunEcho(userId, subtype = 'easy', distanceKm = 0) {
    if (!userId) return null;
    const want = Number(distanceKm) || 0;
    if (!(want > 0)) return null;
    const all = loadAll(userId);
    const kmR = Math.round(want);
    const prefix = `r:${String(subtype || 'easy').toLowerCase()}:`;

    /* 簽名只是粗篩（四捨五入到公里）；真正認不認，要看那一筆**實際存的距離**。
       只看簽名的話 3.9k 會撈到 5.1k 那趟 —— 見 isSameRunDistance 的說明。
       候選中挑距離最接近的一筆。 */
    let best = null, bestGap = Infinity;
    for (const dk of [kmR - 1, kmR, kmR + 1]) {
        const list = all[`${prefix}${dk}k`];
        if (!Array.isArray(list)) continue;
        for (const e of list) {
            if (!isSameRunDistance(want, e?.distanceKm)) continue;
            const gap = Math.abs(want - Number(e.distanceKm));
            if (gap < bestGap) { bestGap = gap; best = e; }
        }
    }
    return best;
}

// ── 讀取：跑步（只看類型、不限距離 — 給快速訓練卡用）────────────────────────
/** 這一筆回聲有沒有可以顯示的數字（舊格式只有凍結的句子 → 不顯示，不要拿舊錯數字騙人）。 */
export const runEchoHasNumbers = (echo) =>
    !!echo && (Number(echo.distanceKm) > 0) && (Number(echo.avgPaceSec) > 0 || Number(echo.durationSec) > 0);

export function getRunEchoBySubtype(userId, subtype = 'easy') {
    if (!userId) return null;
    const all = loadAll(userId);
    const prefix = `r:${String(subtype || 'easy').toLowerCase()}:`;
    let best = null;
    for (const [sig, list] of Object.entries(all)) {
        if (!sig.startsWith(prefix) || !Array.isArray(list) || !list.length) continue;
        const cand = list[0];
        if (!best || new Date(cand.date || 0) > new Date(best.date || 0)) best = cand;
    }
    return best;
}

// ── 提示文案（有趣、每次隨機）────────────────────────────────────────────────
const ECHO_OPENERS_STRENGTH = [
    '這份課表你不是第一次見了 👀',
    '老朋友回來了 — 上次的你 vs 這次的你',
    '既視感？沒錯，你練過這份課表',
    '回頭客！上次的成績單先給你看',
];
const ECHO_OPENERS_RUN = [
    '這條路線的配方你跑過 🏃',
    '同款跑步計劃 — 上次的數據先亮出來',
    '熟悉的距離、熟悉的你，上次表現在這',
    '回鍋跑者！先看看上次的成績',
];
export function echoOpener(type = 'strength') {
    const pool = type === 'run' ? ECHO_OPENERS_RUN : ECHO_OPENERS_STRENGTH;
    return pool[Math.floor(Math.random() * pool.length)];
}

export default {
    saveStrengthEcho, saveRunEcho, getStrengthEcho, getRunEcho, getRunEchoBySubtype,
    strengthSignature, runSignature, isSameRunDistance, runEchoHasNumbers, echoOpener,
};
