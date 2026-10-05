/**
 * safeStorage.js
 * ──────────────────────────────────────────────────────────────────
 * 帶「schema 版本化」的 localStorage 安全存取工具。
 *
 * 對應 vercel-react-best-practices 的 `client-localstorage-schema`：
 *   - 為每筆持久化資料附帶 schema 版本號，App 升級後若 schema 不相容
 *     可自動丟棄 / 遷移舊資料，避免「舊結構炸新程式」的執行期錯誤。
 *   - 統一命名空間前綴，避免不同功能 key 互撞。
 *   - JSON 解析全程 try/catch，永不因損壞資料拋例外（SSR / 無痕模式安全）。
 *
 * 設計原則：
 *   - 不強制重寫專案內既有的 429 處裸 localStorage 呼叫；本工具供
 *     「新程式」與「想漸進遷移的舊程式」採用，提供平滑導入路徑。
 *   - 與既有 userStorage.js 互補：userStorage 負責 userId 命名空間，
 *     safeStorage 負責 schema 版本化；兩者可獨立或搭配使用。
 *
 * 使用方式：
 *   import { createStore } from './safeStorage';
 *
 *   const focusStore = createStore('sonicfocus', {
 *       version: 2,                       // 每次改變資料結構就 +1
 *       defaults: { volume: 0.8, track: null },
 *       // 可選：把 v1 舊資料轉成 v2（回傳 null 代表丟棄）
 *       migrate: (oldData, oldVersion) => {
 *           if (oldVersion === 1) return { ...oldData, track: oldData.lastTrack ?? null };
 *           return null;
 *       },
 *   });
 *
 *   focusStore.get();                     // → { volume, track }（已驗證版本）
 *   focusStore.set({ volume: 0.5, track: 'abc' });
 *   focusStore.update(s => ({ ...s, volume: 1 }));
 *   focusStore.clear();
 * ──────────────────────────────────────────────────────────────────
 */

const PREFIX = 'drvn:v:'; // 全域命名空間前綴，避免與既有裸 key 衝突

/* ═══════════════════════════════════════════════════════════════════
   readJSON —— 給既有裸 key 用的最小防呆
   ─────────────────────────────────────────────────────────────────
   專案裡大量寫法是「JSON.parse(localStorage.getItem(k) || 空物件字面值)」，
   這只擋得住「key 不存在」，擋不住「值壞掉」。
   localStorage 的值會壞在很真實的情境：寫入中途分頁被殺、
   配額用盡導致半截寫入、使用者或舊版程式塞了非 JSON 字串。
   一旦壞掉，JSON.parse 直接拋例外 → 整頁掉到 error boundary
   （就是使用者看到的「頁面暫時迷路了」）。

   這支函式保證不拋例外，並在解析失敗時順手把壞資料清掉，
   避免使用者每次進來都再炸一次。
   ═══════════════════════════════════════════════════════════════ */
export const readJSON = (key, fallback = null) => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return fallback;
        const raw = window.localStorage.getItem(key);
        if (raw === null || raw === undefined || raw === '') return fallback;
        const v = JSON.parse(raw);
        return v === null || v === undefined ? fallback : v;
    } catch {
        // 壞資料就地清除，讓下一次讀取回到乾淨的預設值
        try { window.localStorage.removeItem(key); } catch { /* 無痕模式：忽略 */ }
        return fallback;
    }
};

const hasLocalStorage = (() => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return false;
        const probe = '__drvn_probe__';
        window.localStorage.setItem(probe, '1');
        window.localStorage.removeItem(probe);
        return true;
    } catch {
        // 無痕模式 / 已停用 storage / SSR
        return false;
    }
})();

/**
 * 安全 JSON parse，失敗回傳 undefined（永不拋例外）。
 */
const safeParse = (raw) => {
    if (raw === null || raw === undefined) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
};

/**
 * 建立一個版本化的 store。
 *
 * @param {string} name 邏輯名稱（會加上全域前綴）
 * @param {object} opts
 * @param {number} opts.version  目前 schema 版本（整數，預設 1）
 * @param {*}      opts.defaults 找不到 / 版本不符 / 損壞 時回傳的預設值
 * @param {(oldData:*, oldVersion:number)=>*} [opts.migrate]
 *        可選遷移函式。回傳新資料表示遷移成功並會寫回；回傳 null/undefined 表示丟棄舊資料用 defaults。
 */
export const createStore = (name, { version = 1, defaults = null, migrate } = {}) => {
    const storageKey = `${PREFIX}${name}`;

    const readEnvelope = () => {
        if (!hasLocalStorage) return undefined;
        return safeParse(window.localStorage.getItem(storageKey));
    };

    const writeEnvelope = (data) => {
        if (!hasLocalStorage) return false;
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({ __v: version, data }));
            return true;
        } catch (e) {
            // QuotaExceeded / 其他 → 不拋例外，記錄即可
            console.warn(`[safeStorage] 寫入失敗：${storageKey}`, e?.name || e);
            return false;
        }
    };

    const cloneDefault = () =>
        defaults && typeof defaults === 'object'
            ? JSON.parse(JSON.stringify(defaults))
            : defaults;

    return {
        /** 邏輯名稱對應的實際 storage key（除錯用） */
        key: storageKey,

        /**
         * 讀取資料，並做版本驗證。
         * - 版本相符：回傳資料。
         * - 版本不符：嘗試 migrate；成功則寫回新版並回傳，否則回傳 defaults。
         * - 損壞 / 不存在：回傳 defaults。
         */
        get() {
            const env = readEnvelope();
            if (!env || typeof env !== 'object' || !('__v' in env)) {
                return cloneDefault();
            }
            if (env.__v === version) {
                return env.data;
            }
            // 版本不符 → 嘗試遷移
            if (typeof migrate === 'function') {
                try {
                    const migrated = migrate(env.data, env.__v);
                    if (migrated !== null && migrated !== undefined) {
                        writeEnvelope(migrated);
                        return migrated;
                    }
                } catch (e) {
                    console.warn(`[safeStorage] 遷移失敗：${storageKey}`, e?.name || e);
                }
            }
            // 無法遷移 → 丟棄舊資料，回 defaults（不主動刪 key，待下次 set 覆蓋）
            return cloneDefault();
        },

        /** 寫入資料（附帶目前版本號）。回傳是否成功。 */
        set(value) {
            return writeEnvelope(value);
        },

        /**
         * 讀-改-寫。每次重新讀取最新值，降低多分頁競態風險。
         * @param {(current:*)=>*} updater
         */
        update(updater) {
            const current = this.get();
            const next = updater(current);
            this.set(next);
            return next;
        },

        /** 移除此 store 的資料。 */
        clear() {
            if (!hasLocalStorage) return;
            try {
                window.localStorage.removeItem(storageKey);
            } catch { /* ignore */ }
        },
    };
};

/** 是否可用 localStorage（無痕模式 / SSR 會是 false）。供呼叫端判斷是否要降級。 */
export const isStorageAvailable = () => hasLocalStorage;

export default createStore;
