// 📦 inbodyStore — InBody 量測的單一真相源
// ─────────────────────────────────────────────────────────────────────────────
// 問題：後端一直都有完整的 InBody CRUD，而且 InBodyInputForm 存檔時本機與後端
//   都會寫。但「讀」這一側從來沒有人把後端的資料拉回來 ——
//   20 多支引擎（營養、TDEE、體態預測、成就、訓練焦點…）全部只讀
//   localStorage 的 inbody_local_<uid>。結果是：換一支手機、重灌 App、清快取，
//   後端明明有資料，App 卻當作你從來沒量過。一個主打「陪伴」的系統最不能失憶。
//
// 做法（沿用 reconcileJoinDate 的校正模式，改動半徑最小）：
//   開機時把後端的紀錄拉回來寫進同一個 localStorage key。
//   那 20 多支引擎一行都不用改 —— 它們讀的快取現在每次開機都會被後端填滿。
//
//   順便處理「本機有、後端沒有」的舊紀錄（離線時存的、或早於後端 POST 的年代）：
//   補傳上去，而且只補一次，失敗就下次再說，絕不刪本機資料。
//
// 鐵則：拿不到後端資料時，維持現狀。寧可用舊快取，也不要把使用者的紀錄清成空的。
import apiClient from '../api/client';
import { ensureAuthBeforeFetch } from './guestAuth';

const KEY = (uid) => `inbody_local_${uid}`;
const PUSHED_KEY = (uid) => `inbody_pushed_${uid}`;

const readJSONArray = (k) => {
    try {
        const v = JSON.parse(localStorage.getItem(k) || '[]');
        return Array.isArray(v) ? v : [];
    } catch { return []; }
};

/** 欄位別名地獄：measurement_date / date / created_at 都可能是日期。 */
const dayOf = (r) => {
    const d = r?.measurement_date || r?.date || r?.created_at;
    if (!d) return null;
    const s = String(d).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const byDayAsc = (a, b) => String(dayOf(a) || '').localeCompare(String(dayOf(b) || ''));

/** 同步讀快取 —— 引擎們原本就是這樣讀的，這裡只是給個具名入口。 */
export function readInBody(userId) {
    return readJSONArray(KEY(userId));
}

/** 後端為主、本機補齊：同一天只留一筆，以後端那筆為準。 */
function mergeByDay(serverRows, localRows) {
    const out = new Map();
    for (const r of localRows) {
        const d = dayOf(r);
        if (d) out.set(d, r);
    }
    for (const r of serverRows) {
        const d = dayOf(r);
        if (d) out.set(d, r);   // 後端覆蓋本機
    }
    return [...out.values()].sort(byDayAsc);
}

const NUMERIC_FIELDS = [
    'weight_kg', 'body_fat_percent', 'skeletal_muscle_mass', 'body_water_percent',
    'visceral_fat_level', 'bmr', 'protein_mass', 'mineral_mass', 'body_fat_mass',
    'right_arm_muscle', 'left_arm_muscle', 'trunk_muscle',
    'right_leg_muscle', 'left_leg_muscle', 'height',
];

/** 把一筆本機紀錄補傳到後端。任何一筆失敗就整批放棄（下次開機再試）。 */
async function pushOne(userId, rec) {
    const day = dayOf(rec);
    if (!day) return false;
    const form = new FormData();
    form.append('user_id', userId);
    form.append('measurement_date', day);
    for (const f of NUMERIC_FIELDS) {
        const v = rec?.[f] ?? rec?.[f.replace('_kg', '')] ?? null;
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) form.append(f, String(n));
    }
    const res = await apiClient.post('/api/user/inbody-record', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 8000,
    });
    return res?.status === 200 || res?.status === 201;
}

let inflight = null;

/**
 * 開機呼叫一次：把後端的 InBody 紀錄拉回本機快取。
 * @returns {Promise<Array>} 合併後的紀錄（失敗時就是原本的本機快取）
 */
export async function hydrateInBody(userId) {
    if (!userId) return [];
    if (inflight) return inflight;

    inflight = (async () => {
        const local = readInBody(userId);
        try {
            await ensureAuthBeforeFetch();   // 訪客也要先換一張匿名 token，否則一律 401
        } catch { /* 換不到就照樣試，後端會自己回 401 */ }

        let server = [];
        try {
            const res = await apiClient.get(
                `/api/user/inbody-history/${userId}?limit=100`, { timeout: 8000 });
            server = Array.isArray(res?.data?.history) ? res.data.history : [];
        } catch {
            // 連不到後端（離線 / 冷啟動）→ 什麼都不動，下次開機再試。
            return local;
        }

        // ── 本機有、後端沒有的日期 → 補傳（只做一次）──
        const serverDays = new Set(server.map(dayOf).filter(Boolean));
        const onlyLocal = local.filter((r) => dayOf(r) && !serverDays.has(dayOf(r)));
        let pushedAll = false;
        if (onlyLocal.length && !localStorage.getItem(PUSHED_KEY(userId))) {
            try {
                for (const r of onlyLocal) {
                    // eslint-disable-next-line no-await-in-loop
                    if (!(await pushOne(userId, r))) throw new Error('push rejected');
                }
                pushedAll = true;
                try { localStorage.setItem(PUSHED_KEY(userId), '1'); } catch { /* */ }
            } catch {
                // 補傳失敗 → 不標記完成，本機資料原封不動，下次開機再試。
            }
            if (pushedAll) {
                try {
                    const res2 = await apiClient.get(
                        `/api/user/inbody-history/${userId}?limit=100`, { timeout: 8000 });
                    if (Array.isArray(res2?.data?.history)) server = res2.data.history;
                } catch { /* 拉不到就用上一份 */ }
            }
        }

        const merged = mergeByDay(server, local);
        // 只有真的有東西才寫回去 —— 絕不用空陣列蓋掉使用者的紀錄。
        if (merged.length) {
            try { localStorage.setItem(KEY(userId), JSON.stringify(merged)); } catch { /* */ }
        }
        return merged.length ? merged : local;
    })().finally(() => { inflight = null; });

    return inflight;
}

/**
 * 快速量一次（營養回饋用）：體重必填、體脂選填。
 * 先寫本機（同一天只留一筆，今天的覆蓋），再送後端；送不上去就留給下次開機補傳。
 * @returns {Promise<{ok:boolean, synced:boolean, record:object|null}>}
 */
export async function saveQuickMeasurement(userId, { weight, bodyFat = null, date = null } = {}) {
    const w = Number(weight);
    if (!userId || !(w > 30 && w < 300)) return { ok: false, synced: false, record: null };
    const bf = Number(bodyFat);
    const d = date || (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
    const prev = readInBody(userId).find((r) => dayOf(r) === d) || {};
    const record = { ...prev, measurement_date: d, weight_kg: Math.round(w * 10) / 10,
        ...(bf > 0 && bf < 60 ? { body_fat_percent: Math.round(bf * 10) / 10 } : {}), source: prev.source || 'quick' };
    const merged = mergeByDay([], [...readInBody(userId).filter((r) => dayOf(r) !== d), record]);
    try { localStorage.setItem(KEY(userId), JSON.stringify(merged)); } catch { /* 容量滿 */ }
    try { window.dispatchEvent(new CustomEvent('drvn:inbody-changed', { detail: { date: d } })); } catch { /* node */ }
    let synced = false;
    try { synced = await pushOne(userId, record); } catch { synced = false; }
    if (!synced) { try { localStorage.removeItem(PUSHED_KEY(userId)); } catch { /* */ } }   // 讓下次開機補傳
    return { ok: true, synced, record };
}

export default hydrateInBody;
