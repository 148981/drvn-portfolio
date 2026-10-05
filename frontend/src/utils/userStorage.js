/**
 * userStorage.js
 * ──────────────────────────────────────────────────────────────────
 * 統一管理所有「使用者相關」的 localStorage key。
 * 每筆資料都以 userId 做命名空間，確保多使用者資料完全隔離。
 *
 * 使用方式：
 *   import { uStorage } from './userStorage';
 *   const store = uStorage(userId);
 *   store.set('trainingRecords', { ... });
 *   const records = store.get('trainingRecords', {});
 *
 * 遷移策略：
 *   首次讀取時若新 key 不存在，自動從舊的無前綴 key 讀取並遷移，
 *   遷移完成後刪除舊 key，避免資料孤島。
 * ──────────────────────────────────────────────────────────────────
 */

/** 需要 userId 命名空間的 key 及其對應的舊 key（用於遷移） */
const USER_KEYS = {
  trainingRecords:        { legacy: 'trainingRecords',        default: {} },
  master_journey:         { legacy: 'master_journey',         default: null },
  currentWorkoutPlan:     { legacy: 'currentWorkoutPlan',     default: null },
  savedFusionPlans:       { legacy: 'savedFusionPlans',       default: [] },
  masterJourneyCardOrder: { legacy: 'masterJourneyCardOrder', default: [] },
  userRadarScores:        { legacy: 'userRadarScores',        default: null },
  cardio_sessions:        { legacy: 'cardio_sessions',        default: [] },
  weeklyCardioLog:        { legacy: 'weeklyCardioLog',        default: {} },
  workout_history:        { legacy: 'workout_history',        default: [] },
  nutrition_log:          { legacy: 'nutrition_log',          default: [] },
  user_profile_cache:     { legacy: 'user_profile_cache',     default: {} },
  // Profile images — 補上 legacy 支援，確保舊版裸 key 可遷移
  user_avatar_photo:      { legacy: 'user_avatar_photo',      default: null },
  user_cover_photo:       { legacy: 'user_cover_photo',       default: null },
  // Profile stickers — 過去未加 userId 前綴，遷移時自動從舊 key 讀取
  profileStickerPos:      { legacy: 'profileStickerPos',      default: {} },
  profileShowStickers:    { legacy: 'profileShowStickers',    default: true },
  profileActiveStickers:  { legacy: 'profileActiveStickers',  default: [] },
  // Social posts — 所有使用者的貼文過去共用同一個 key，現在以 userId 隔離
  socialPosts:            { legacy: 'socialPosts',            default: [] },
  // 裝備倉庫 —— 以前是全域 key，換帳號會看到上一個人的鞋
  running_shoes:          { legacy: 'running_shoes',          default: [] },
};

/**
 * 取得使用者命名空間後的完整 key 名稱。
 * @param {string} uid   - userId（若為空則用 'local'）
 * @param {string} key   - 邏輯 key 名稱
 */
const nsKey = (uid, key) => `u_${uid || 'local'}_${key}`;

/**
 * 建立針對特定 userId 的 storage 操作介面。
 * @param {string} userId
 */
export const uStorage = (userId) => {
  const uid = userId || 'local';

  return {
    /**
     * 讀取資料。若新 key 不存在，自動從舊 key 遷移。
     * @param {string} key        - 邏輯 key
     * @param {*}      fallback   - 若完全找不到資料的預設值
     */
    get(key, fallback) {
      const newKey = nsKey(uid, key);
      try {
        const raw = localStorage.getItem(newKey);
        if (raw !== null) return JSON.parse(raw);

        // ── 遷移：嘗試從舊的無前綴 key 讀取 ──
        const meta = USER_KEYS[key];
        if (meta?.legacy) {
          const legacyRaw = localStorage.getItem(meta.legacy);
          if (legacyRaw !== null) {
            try {
              const legacyData = JSON.parse(legacyRaw);
              // 寫入新 key
              localStorage.setItem(newKey, legacyRaw);
              // 刪除舊 key（防止其他使用者誤讀）
              localStorage.removeItem(meta.legacy);
              console.log(`[userStorage] 遷移完成：${meta.legacy} → ${newKey}`);
              return legacyData;
            } catch { /* 舊資料損壞，忽略 */ }
          }
        }

        const def = fallback !== undefined ? fallback : (meta?.default ?? null);
        return def;
      } catch {
        const meta = USER_KEYS[key];
        return fallback !== undefined ? fallback : (meta?.default ?? null);
      }
    },

    /**
     * 寫入資料。
     * @param {string} key   - 邏輯 key
     * @param {*}      value - 要儲存的資料
     */
    set(key, value) {
      const newKey = nsKey(uid, key);
      try {
        // 🔴 Fix: 若 key 是 trainingRecords，在寫入前自動裁剪，只保留最近 500 筆
        // 防止無限累積導致 QuotaExceededError
        let dataToStore = value;
        if (key === 'trainingRecords' && value && typeof value === 'object' && !Array.isArray(value)) {
          const entries = Object.entries(value);
          if (entries.length > 500) {
            // 🛡️ P2 Fix：裁剪「之前」先把完整資料推上雲端（後端做合併，
            // 被裁掉的舊紀錄仍保留在雲端）。fire-and-forget，失敗進重試佇列。
            import('./cloudSync')
              .then(({ pushBlob }) => pushBlob('trainingRecords', value, { storageKey: newKey }))
              .catch(() => {});
            // 依 timestamp 排序後只保留最新 500 筆
            entries.sort((a, b) => {
              const tsA = a[1]?.timestamp ? new Date(a[1].timestamp).getTime() : 0;
              const tsB = b[1]?.timestamp ? new Date(b[1].timestamp).getTime() : 0;
              return tsB - tsA; // 新 → 舊
            });
            dataToStore = Object.fromEntries(entries.slice(0, 500));
            console.warn(`[userStorage] trainingRecords 裁剪：${entries.length} → 500 筆`);
          }
        }
        localStorage.setItem(newKey, JSON.stringify(dataToStore));
      } catch (e) {
        // 🔴 Fix: QuotaExceededError 時嘗試緊急清理最舊的訓練紀錄，再重試
        if (e?.name === 'QuotaExceededError' || e?.code === 22) {
          console.warn(`[userStorage] QuotaExceededError on ${newKey}，嘗試緊急清理...`);
          try {
            if (key === 'trainingRecords' && value && typeof value === 'object') {
              const entries = Object.entries(value);
              entries.sort((a, b) => {
                const tsA = a[1]?.timestamp ? new Date(a[1].timestamp).getTime() : 0;
                const tsB = b[1]?.timestamp ? new Date(b[1].timestamp).getTime() : 0;
                return tsB - tsA;
              });
              // 緊急保留最近 200 筆
              const trimmed = Object.fromEntries(entries.slice(0, 200));
              localStorage.setItem(newKey, JSON.stringify(trimmed));
              console.warn(`[userStorage] 緊急裁剪至 200 筆成功`);
            }
          } catch (e2) {
            console.error(`[userStorage] 緊急清理失敗，資料無法寫入：${newKey}`, e2);
          }
        } else {
          console.error(`[userStorage] set 失敗：${newKey}`, e);
        }
      }
    },

    /**
     * 原子性讀-改-寫。每次呼叫都重新從 localStorage 讀取最新值再寫入，
     * 避免多分頁同時 get → modify → set 造成的覆蓋競態（multi-tab race condition）。
     *
     * @param {string}   key      - 邏輯 key
     * @param {Function} updater  - (currentValue) => newValue
     * @param {*}        fallback - 若 key 不存在時傳入 updater 的初始值
     *
     * Usage:
     *   store.getAndUpdate('trainingRecords', records => {
     *       records[sessionId] = newEntry;
     *       return records;
     *   }, {});
     */
    getAndUpdate(key, updater, fallback) {
      const newKey = nsKey(uid, key);
      try {
        // 1. 直接從 localStorage 重新讀最新值（不用快取）
        const raw = localStorage.getItem(newKey);
        let current;
        if (raw !== null) {
          try { current = JSON.parse(raw); } catch { current = undefined; }
        }
        // 若新 key 沒有，嘗試舊 key 遷移
        if (current === undefined) {
          const meta = USER_KEYS[key];
          if (meta?.legacy) {
            const legacyRaw = localStorage.getItem(meta.legacy);
            if (legacyRaw !== null) {
              try {
                current = JSON.parse(legacyRaw);
                localStorage.removeItem(meta.legacy);
              } catch { /* 舊資料損壞，忽略 */ }
            }
          }
        }
        if (current === undefined) {
          const def = fallback !== undefined ? fallback : (USER_KEYS[key]?.default ?? null);
          current = Array.isArray(def) ? [...def] : (def && typeof def === 'object' ? { ...def } : def);
        }
        // 2. 執行 updater
        const updated = updater(current);
        // 3. 透過 set() 寫入（含裁剪 / QuotaExceededError 保護）
        this.set(key, updated);
        return updated;
      } catch (e) {
        console.error(`[userStorage] getAndUpdate 失敗：${newKey}`, e);
        return fallback !== undefined ? fallback : (USER_KEYS[key]?.default ?? null);
      }
    },

    /**
     * 刪除資料（同時清除舊 key）。
     * @param {string} key
     */
    remove(key) {
      const newKey = nsKey(uid, key);
      try {
        localStorage.removeItem(newKey);
        const meta = USER_KEYS[key];
        if (meta?.legacy) localStorage.removeItem(meta.legacy);
      } catch { /* 忽略 */ }
    },

    /**
     * 取得底層完整 key 名稱（供需要直接監聽 storage 事件的元件使用）。
     * @param {string} key
     */
    rawKey(key) {
      return nsKey(uid, key);
    },
  };
};

/**
 * 靜態版本：直接傳入 userId 與 key 存取（不建立物件，適合 utility function 使用）。
 */
export const uGet = (userId, key, fallback) => uStorage(userId).get(key, fallback);
export const uSet = (userId, key, value)    => uStorage(userId).set(key, value);
export const uRemove = (userId, key)        => uStorage(userId).remove(key);
export const uRawKey = (userId, key)        => uStorage(userId).rawKey(key);
export const uGetAndUpdate = (userId, key, updater, fallback) => uStorage(userId).getAndUpdate(key, updater, fallback);

/**
 * Guest → OAuth 帳號資料遷移。
 *
 * 當使用者以 guest ID 累積了訓練紀錄、個人檔案、貼文等，
 * 登入 LINE / Google / Facebook 之後 userId 會改變。
 * 此函式把 `u_${fromUserId}_*` 的所有 key 複製（搬移）到
 * `u_${toUserId}_*`，確保 OAuth 登入後不會看到空白的 Profile。
 *
 * 規則：
 *  - 若目標 key 已存在（表示 OAuth 帳號本身已有資料），不覆蓋。
 *  - 搬移完成後刪除來源 key，避免資料孤島。
 *  - fromUserId === toUserId 時直接 return（無需遷移）。
 *
 * @param {string} fromUserId  - 遷移來源（通常是 guest_xxx 或舊 OAuth ID）
 * @param {string} toUserId    - 遷移目的（新的 OAuth userId）
 */
export const migrateUserData = (fromUserId, toUserId) => {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;

  const fromPrefix = `u_${fromUserId}_`;
  const toPrefix   = `u_${toUserId}_`;

  /* ⚠ 不是每個個人資料都用 u_<uid>_ 前綴。
     重訓課表、營養策略、跑步週期、訓練目標都是「<name>_<uid>」的形式，
     只搬 u_ 前綴的話，使用者選了「帶入我的資料」之後會發現重訓與營養
     全部不見（東西還在，只是掛在舊的訪客 id 底下變成孤兒）。 */
  const SUFFIX_KEYS = [
    'currentPlan', 'drvn_nutrition_plan', 'drvn_run_cycle',
    'drvn_training_focus', 'drvn_focus_reviewed', 'season', 'activeWeek',
    'onboarding', 'inbody_local', 'drvn:weekBricks',
  ];

  // 蒐集所有需要遷移的 key（不在迴圈中修改 localStorage 以避免 index 錯亂）
  const keysToMigrate = [];
  const suffixKeysToMigrate = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(fromPrefix)) { keysToMigrate.push(k); continue; }
    if (k.endsWith(`_${fromUserId}`) && SUFFIX_KEYS.some((n) => k === `${n}_${fromUserId}`)) {
      suffixKeysToMigrate.push(k);
    }
  }

  for (const oldKey of suffixKeysToMigrate) {
    const base = oldKey.slice(0, oldKey.length - (`_${fromUserId}`).length);
    const newKey = `${base}_${toUserId}`;
    try {
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
      }
      localStorage.removeItem(oldKey);
    } catch { /* 容量滿 → 不阻擋登入流程 */ }
  }

  let migratedCount = 0;
  for (const oldKey of keysToMigrate) {
    const suffix = oldKey.slice(fromPrefix.length);  // e.g. "user_profile_cache"
    const newKey = `${toPrefix}${suffix}`;

    // 目標 key 已有資料時保留（OAuth 帳號自己的資料優先）
    if (localStorage.getItem(newKey) === null) {
      const val = localStorage.getItem(oldKey);
      if (val !== null) {
        localStorage.setItem(newKey, val);
        migratedCount++;
      }
    }
    // 搬移後刪除來源 key
    localStorage.removeItem(oldKey);
  }

  if (keysToMigrate.length > 0) {
    console.log(
      `[userStorage] migrateUserData: ${fromUserId} → ${toUserId}，` +
      `共 ${keysToMigrate.length} 筆，成功遷移 ${migratedCount} 筆（其餘目標已有資料）`
    );
  }
};

export default uStorage;
