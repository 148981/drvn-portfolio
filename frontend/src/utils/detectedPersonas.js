/**
 * detectedPersonas.js — 「曾經偵測過」的人格永久記錄
 * ──────────────────────────────────────────────────────────────────────
 * 核心解鎖語意：只要使用者「曾經有過」某個人格，對應稱號標籤就永久解鎖。
 * 因此這個 store 是一個**只增不減的集合（union set）**：
 *   每次偵測到的 persona ids 都併進來，之後就算數據下滑也不會被移除。
 *
 * 儲存位置：localStorage，key 依 userId 分開。
 *   drvn_detected_personas__<userId> = ["road_runner","iron_apprentice",...]
 *
 * 另外記錄每個 persona「首次解鎖時間」，方便 UI 顯示「NEW」或解鎖日期。
 *   drvn_persona_unlock_at__<userId> = { road_runner: 1720000000000, ... }
 * ──────────────────────────────────────────────────────────────────────
 */

const KEY = (userId) => `drvn_detected_personas__${userId || 'guest'}`;
const AT_KEY = (userId) => `drvn_persona_unlock_at__${userId || 'guest'}`;

function readSet(userId) {
    try {
        const raw = localStorage.getItem(KEY(userId));
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
    } catch (_) {
        return new Set();
    }
}

function writeSet(userId, set) {
    try {
        localStorage.setItem(KEY(userId), JSON.stringify([...set]));
    } catch (_) {}
}

function readUnlockAt(userId) {
    try {
        const raw = localStorage.getItem(AT_KEY(userId));
        const obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === 'object' ? obj : {};
    } catch (_) {
        return {};
    }
}

function writeUnlockAt(userId, obj) {
    try {
        localStorage.setItem(AT_KEY(userId), JSON.stringify(obj));
    } catch (_) {}
}

/** 取得目前已解鎖（曾偵測過）的所有 persona id 陣列 */
export function getDetectedPersonas(userId) {
    return [...readSet(userId)];
}

/** 該 persona 是否曾被偵測過（= 已解鎖） */
export function hasPersona(userId, personaId) {
    return readSet(userId).has(personaId);
}

/** 取得某 persona 的首次解鎖時間（ms），未解鎖回傳 null */
export function getUnlockedAt(userId, personaId) {
    const at = readUnlockAt(userId);
    return at[personaId] ?? null;
}

/**
 * 記錄一批「本次偵測到」的 persona ids。
 * 併進既有集合（union），並替新解鎖者寫入時間戳。
 * @returns {string[]} 這次「新解鎖」的 persona ids（供 UI 做 NEW 提示）
 */
export function recordDetectedPersonas(userId, personaIds = []) {
    if (!Array.isArray(personaIds) || personaIds.length === 0) return [];
    const set = readSet(userId);
    const at = readUnlockAt(userId);
    const now = Date.now();
    const newlyUnlocked = [];

    personaIds.forEach((id) => {
        if (!id) return;
        if (!set.has(id)) {
            set.add(id);
            at[id] = now;
            newlyUnlocked.push(id);
        }
    });

    if (newlyUnlocked.length) {
        writeSet(userId, set);
        writeUnlockAt(userId, at);
    }
    return newlyUnlocked;
}

/** 清空某使用者的解鎖記錄（測試 / 帳號重置用） */
export function clearDetectedPersonas(userId) {
    try {
        localStorage.removeItem(KEY(userId));
        localStorage.removeItem(AT_KEY(userId));
    } catch (_) {}
}
