// shoeManager.js —— 裝備倉庫的資料層（跑鞋、手錶、腰帶…）
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ 2026-09 稽核：
//   1. 原本存在全域的 localStorage 'running_shoes'，沒有 userId —— 同一台手機換帳號，
//      上一個人的鞋子（連里程）全部跟過來。改用 uStorage 命名空間，第一次讀取時
//      自動把舊資料搬到「當下登入的那個人」名下並刪掉舊 key（其他帳號不會再讀到）。
//   2. 跑步只會「加里程」、沒有紀錄是哪一天加的 —— 裝備頁答不出「這雙跑了幾次、
//      最後一次什麼時候穿」。現在每次加里程都記一筆 log。
//   3. 裝備新增後就不能改（品牌打錯、里程登錯都只能刪掉重建）—— 補上 updateShoe
//      與 adjustShoeMileage。
//
// 對外 API 維持相容：getShoes / saveShoes / getCurrentShoe / setCurrentShoe /
// addMileageToCurrentShoe / addNewShoe / deleteShoe / setShoeRetired（呼叫端不用改）。
import { uStorage } from './userStorage';
import { getUserId } from './auth';

const KEY = 'running_shoes';
const CURRENT_KEY = 'current_running_shoe';
const LEGACY_CURRENT = 'current_running_shoe';   // 舊版存的是純字串 id，不是 JSON
const LOG_LIMIT = 200;

const store = () => uStorage(getUserId());
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export const getShoes = () => {
    try {
        const list = store().get(KEY, []);
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
};

// （假預設裝備已移除 — 空狀態由裝備頁引導新增）
export const getDefaultShoes = () => [];

export const saveShoes = (shoes) => {
    try { store().set(KEY, Array.isArray(shoes) ? shoes : []); } catch { /* 隱私模式 */ }
};

const readCurrentId = () => {
    const s = store();
    let id = null;
    try { id = s.get(CURRENT_KEY, null); } catch { id = null; }
    if (id) return id;
    // 舊版：全域 key、純字串 —— 搬一次，搬完刪掉
    try {
        const legacy = localStorage.getItem(LEGACY_CURRENT);
        if (legacy) {
            s.set(CURRENT_KEY, legacy);
            localStorage.removeItem(LEGACY_CURRENT);
            return legacy;
        }
    } catch { /* ignore */ }
    return null;
};

export const getCurrentShoe = () => {
    const id = readCurrentId();
    if (!id) return null;
    return getShoes().find((s) => s.id === id) || null;
};

export const setCurrentShoe = (shoeId) => {
    try { store().set(CURRENT_KEY, shoeId || null); } catch { /* ignore */ }
};

const withLog = (shoe, entry) => {
    const log = Array.isArray(shoe.log) ? shoe.log : [];
    return [...log, entry].slice(-LOG_LIMIT);
};

/**
 * 跑完一次把里程記到「目前使用中」的那雙。
 * @param {number} distance 公里
 * @param {{at?:string}} [meta]
 */
export const addMileageToCurrentShoe = (distance, meta = {}) => {
    const km = num(distance);
    if (!(km > 0)) return;
    const current = getCurrentShoe();
    if (!current) return;
    const at = meta.at || new Date().toISOString();
    saveShoes(getShoes().map((shoe) => (shoe.id === current.id
        ? { ...shoe, mileage: +(num(shoe.mileage) + km).toFixed(2), lastUsedAt: at, log: withLog(shoe, { at, km: +km.toFixed(2), source: 'run' }) }
        : shoe)));
};

export const addNewShoe = (shoe) => {
    const shoes = getShoes();
    const newShoe = {
        id: `shoe_${Date.now()}`,
        ...shoe,
        // 若呼叫端有帶 mileage（登錄既有里程）則尊重，否則歸 0
        mileage: typeof shoe.mileage === 'number' ? shoe.mileage : 0,
        retired: false,
        dateAdded: new Date().toISOString(),
        log: [],
    };
    shoes.push(newShoe);
    saveShoes(shoes);
    return newShoe;
};

/** 編輯裝備資料（品牌、型號、類別、建議里程、用途、照片…）。里程請用 adjustShoeMileage。 */
export const updateShoe = (shoeId, patch = {}) => {
    const { mileage, log, id, dateAdded, ...rest } = patch;   // 這幾個不能從這裡改
    let updated = null;
    saveShoes(getShoes().map((s) => {
        if (s.id !== shoeId) return s;
        updated = { ...s, ...rest, maxMileage: Math.max(1, num(rest.maxMileage ?? s.maxMileage, s.maxMileage || 800)) };
        return updated;
    }));
    return updated;
};

/** 手動校正里程（例如舊鞋登錄時少算、或換了錶）。差額會記一筆 manual。 */
export const adjustShoeMileage = (shoeId, newMileage) => {
    const target = Math.max(0, +num(newMileage).toFixed(2));
    let updated = null;
    saveShoes(getShoes().map((s) => {
        if (s.id !== shoeId) return s;
        const delta = +(target - num(s.mileage)).toFixed(2);
        if (!delta) { updated = s; return s; }
        updated = { ...s, mileage: target, log: withLog(s, { at: new Date().toISOString(), km: delta, source: 'manual' }) };
        return updated;
    }));
    return updated;
};

/** 這雙穿了幾次、最後一次什麼時候、最近幾筆（只算跑步，不算手動校正）。 */
export const getShoeStats = (shoe, recentN = 5) => {
    const runs = (Array.isArray(shoe?.log) ? shoe.log : []).filter((e) => e.source === 'run' && num(e.km) > 0);
    const last = runs.length ? runs[runs.length - 1].at : (shoe?.lastUsedAt || null);
    return { runs: runs.length, lastUsedAt: last, recent: runs.slice(-recentN).reverse() };
};

// 刪除一雙裝備；若刪到的是當前裝備，清掉 current 指標
export const deleteShoe = (shoeId) => {
    const shoes = getShoes().filter((s) => s.id !== shoeId);
    saveShoes(shoes);
    if (readCurrentId() === shoeId) setCurrentShoe(null);
    return shoes;
};

// 手動退役 / 復役（不刪資料，只標記）
export const setShoeRetired = (shoeId, retired = true) => {
    const shoes = getShoes().map((s) => (s.id === shoeId ? { ...s, retired } : s));
    saveShoes(shoes);
    if (retired && readCurrentId() === shoeId) setCurrentShoe(null);
    return shoes;
};

export default {
    getShoes,
    getCurrentShoe,
    setCurrentShoe,
    addMileageToCurrentShoe,
    addNewShoe,
    updateShoe,
    adjustShoeMileage,
    getShoeStats,
    deleteShoe,
    setShoeRetired,
    saveShoes,
};
