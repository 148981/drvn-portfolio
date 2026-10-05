/**
 * specialPlanProgress.js — 專項訓練計劃的進度與啟用（單一真相源）
 * ══════════════════════════════════════════════════════════════════════
 * 為什麼要有這支檔案：
 *   專項計劃（胸/背/腿/臀/肩臂/核心/全身）過去有三個各算各的地方 —
 *     · 首頁卡片：`plan_progress_<planId>`，分母算不出來就退回寫死的 12
 *     · 追蹤頁：同一把 key，但分母用「當前 level 的 weeks」
 *     · 卡片抬頭：寫死的 "28 DAYS" / "30 DAYS"
 *   結果就是同一張卡上出現「28 DAYS」跟「0/8 天」兩個對不起來的數字，
 *   而且 key 沒有 userId 命名空間，換帳號會串進度。
 *
 *   更嚴重的是「啟用」：追蹤頁把 currentPlan_<uid> 寫成 { id, name }，
 *   沒有 weeks —— 而今日議程（dailyAgenda.loadStrengthInputs）是讀 plan.weeks 的，
 *   所以開始一份專項計劃之後，首頁的今日議程根本看不到這份重訓課表。
 *
 * 這支檔案把上面四件事收成一份：
 *   1. planSessions()      攤平出「這份計劃到底有幾次訓練」——所有分母的唯一來源
 *   2. readPlanProgress()  讀進度（per-user key，含舊 key 自動遷移）
 *   3. writePlanProgress() 寫進度
 *   4. activateSpecialPlan() 啟用計劃，且**帶著 weeks** 寫進 currentPlan_<uid>，
 *                          讓今日議程／完整計劃入口卡／恢復追蹤都讀得到同一份資料
 *
 * ⚠ 誠實數據：算不出總次數時回 total = null，呼叫端要顯示誠實空狀態，
 *   不准再用「12」這種假分母。
 */

const LEGACY_PROGRESS_KEY = (planId) => `plan_progress_${planId}`;
const LEGACY_STARTED_KEY = (planId) => `plan_started_${planId}`;
const PROGRESS_KEY = (uid, planId) => `plan_progress_${uid || 'guest'}_${planId}`;
const STARTED_KEY = (uid, planId) => `plan_started_${uid || 'guest'}_${planId}`;
// 每份計劃最後一次被改動的時間 —— 和後端合併時用它決定誰比較新。
const META_KEY = (uid) => `plan_progress_meta_${uid || 'guest'}`;

const safeParse = (raw, fallback) => {
    try {
        const v = JSON.parse(raw);
        return v == null ? fallback : v;
    } catch { return fallback; }
};

/** 取這份計劃在指定 level 下的週陣列（沒有 levels 就用頂層 weeks）。 */
export function planWeeks(plan, level = 'beginner') {
    if (!plan) return [];
    const byLevel = plan.levels?.[level]?.weeks;
    if (Array.isArray(byLevel)) return byLevel;
    const firstLevelKey = plan.levels ? Object.keys(plan.levels)[0] : null;
    const firstLevel = firstLevelKey ? plan.levels[firstLevelKey]?.weeks : null;
    if (Array.isArray(firstLevel)) return firstLevel;
    return Array.isArray(plan.weeks) ? plan.weeks : [];
}

/**
 * 攤平成一維的訓練場次清單 —— 所有「幾次 / 第幾次」的唯一來源。
 * globalIdx 與 PlanTrackingPageMobile 的編號規則一致（wi * 10 + di），
 * 兩邊共用同一份編號，進度才不會對不起來。
 */
export function planSessions(plan, level = 'beginner') {
    const weeks = planWeeks(plan, level);
    return weeks.flatMap((w, wi) =>
        (w.days || []).map((d, di) => ({
            ...d,
            weekNumber: w.weekNumber ?? wi + 1,
            weekName: w.name,
            globalIdx: wi * 10 + di,
        }))
    );
}

/** 這份計劃共幾週 / 共幾次訓練。算不出來回 null（呼叫端顯示誠實空狀態）。 */
export function planShape(plan, level = 'beginner') {
    const weeks = planWeeks(plan, level);
    const sessions = planSessions(plan, level);
    return {
        weeks: weeks.length || null,
        sessions: sessions.length || null,
    };
}

/**
 * 讀「已完成的場次編號」陣列（globalIdx）。
 * 舊 key（沒有 userId 命名空間）讀到就自動遷移，搬完刪掉，避免資料孤島。
 */
export function readPlanDoneIdxs(userId, plan) {
    const planId = plan?.id;
    if (!planId) return [];
    const key = PROGRESS_KEY(userId, planId);
    let done = safeParse(localStorage.getItem(key), null);
    if (done == null) {
        const legacy = safeParse(localStorage.getItem(LEGACY_PROGRESS_KEY(planId)), null);
        if (Array.isArray(legacy)) {
            done = legacy;
            try {
                localStorage.setItem(key, JSON.stringify(legacy));
                localStorage.removeItem(LEGACY_PROGRESS_KEY(planId));
            } catch { /* 容量滿 → 至少這次讀得到 */ }
        }
    }
    return Array.isArray(done) ? done : [];
}

/**
 * 讀進度。回 { done, total, pct, started }。
 * total 算不出來時為 null —— 不再用寫死的 12 當分母。
 */
export function readPlanProgress(userId, plan, level = 'beginner') {
    const planId = plan?.id;
    const total = planSessions(plan, level).length || null;
    if (!planId) return { done: 0, total, pct: 0, started: false };

    const doneList = readPlanDoneIdxs(userId, plan);
    const started = safeParse(localStorage.getItem(STARTED_KEY(userId, planId)), null) === true
        || localStorage.getItem(LEGACY_STARTED_KEY(planId)) === 'true'
        || doneList.length > 0;

    return {
        done: doneList.length,
        total,
        pct: total ? Math.min(1, doneList.length / total) : 0,
        started,
    };
}

/** 寫進度（doneIdxs = globalIdx 陣列）。 */
export function writePlanProgress(userId, plan, doneIdxs) {
    if (!plan?.id) return;
    try {
        localStorage.setItem(PROGRESS_KEY(userId, plan.id), JSON.stringify([...(doneIdxs || [])]));
    } catch { /* 容量滿 → 不阻擋流程 */ }
    touchPlan(userId, plan.id);
}

/** 標記這份計劃已開始。 */
export function markPlanStarted(userId, plan) {
    if (!plan?.id) return;
    try { localStorage.setItem(STARTED_KEY(userId, plan.id), 'true'); } catch { /* */ }
    touchPlan(userId, plan.id);
}

/**
 * 啟用專項計劃 —— 關鍵在「把 weeks 一起寫進 currentPlan_<uid>」。
 * 今日議程（dailyAgenda.loadStrengthInputs）、完整計劃入口卡的完成判定、
 * 恢復追蹤都讀這一份，缺 weeks 就等於「開始了但系統看不到」。
 *
 * 融合計劃（plan.isFusion）維持原本行為：不搶 currentPlan。
 */
export function activateSpecialPlan(userId, plan, level = 'beginner') {
    if (!plan?.id || plan.isFusion) return null;
    const weeks = planWeeks(plan, level).map((w, wi) => ({
        weekNumber: w.weekNumber ?? wi + 1,
        name: w.name,
        days: w.days || [],
    }));
    const record = {
        id: plan.id,
        plan_id: plan.id,
        name: plan.name || plan.plan_name || '',
        level,
        weeks,
        source: 'special',
        activatedAt: new Date().toISOString(),
        // 中控台讀的是 startDate（不是 activatedAt）—— 少了它就有計劃卻沒有進度
        startDate: (() => {
            const d = new Date();
            const p = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        })(),
    };
    try {
        localStorage.setItem(`currentPlan_${userId || 'guest'}`, JSON.stringify(record));
        localStorage.setItem(STARTED_KEY(userId, plan.id), 'true');
    } catch { /* 容量滿 → 不阻擋流程 */ }
    touchPlan(userId, plan.id);
    return record;
}

/** 目前執行中的計劃（id / name）。 */
export function getActivePlanMeta(userId) {
    const p = safeParse(localStorage.getItem(`currentPlan_${userId || 'guest'}`), null);
    if (!p) return { id: null, name: null, hasWeeks: false };
    return {
        id: p.plan_id || p.id || null,
        name: p.name || p.plan_name || null,
        hasWeeks: Array.isArray(p.weeks) && p.weeks.length > 0,
    };
}

/* ══════════════════════════════════════════════════════════════════════
   換裝置不失憶 —— 完課紀錄與後端同步
   ══════════════════════════════════════════════════════════════════════
   上面那些 key 全部只活在這支手機的 localStorage 裡。換手機、重灌 App、
   清快取，練了三週的進度就整個歸零。

   做法和 InBody 那邊一致：後端存一份，開機拉回來，改動時推上去。
   合併規則是「每份計劃各自比 updatedAt，新的贏」—— 不是整包覆蓋，
   所以兩台裝置各自練不同計劃時，不會互相把對方洗掉。

   任何一步失敗都不影響本機使用：拿不到就用本機的，推不上去下次再推。
   ══════════════════════════════════════════════════════════════════════ */

const readMeta = (userId) => safeParse(localStorage.getItem(META_KEY(userId)), {}) || {};

/** 記下「這份計劃剛剛被改過」，並排程上傳。 */
function touchPlan(userId, planId) {
    if (!planId) return;
    try {
        const meta = readMeta(userId);
        meta[planId] = new Date().toISOString();
        localStorage.setItem(META_KEY(userId), JSON.stringify(meta));
    } catch { /* 容量滿 → 至少本機是對的 */ }
    schedulePush(userId);
}

/** 把本機所有計劃的進度攤成後端要的形狀。 */
export function collectLocalPlanProgress(userId) {
    const uid = userId || 'guest';
    const donePrefix = `plan_progress_${uid}_`;
    const startPrefix = `plan_started_${uid}_`;
    const meta = readMeta(userId);
    const plans = {};
    const ensure = (planId) => (plans[planId] ||= {
        done: [], started: false, updatedAt: meta[planId] || '',
    });
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith(donePrefix)) {
                const planId = k.slice(donePrefix.length);
                const v = safeParse(localStorage.getItem(k), []);
                if (Array.isArray(v)) ensure(planId).done = v;
            } else if (k.startsWith(startPrefix)) {
                const planId = k.slice(startPrefix.length);
                ensure(planId).started = localStorage.getItem(k) === 'true';
            }
        }
    } catch { /* localStorage 不可用 */ }
    return plans;
}

/** 把後端的一份計劃寫回本機。 */
function applyServerPlan(userId, planId, row) {
    try {
        if (Array.isArray(row?.done)) {
            localStorage.setItem(PROGRESS_KEY(userId, planId), JSON.stringify(row.done));
        }
        if (row?.started) localStorage.setItem(STARTED_KEY(userId, planId), 'true');
        const meta = readMeta(userId);
        meta[planId] = row?.updatedAt || new Date().toISOString();
        localStorage.setItem(META_KEY(userId), JSON.stringify(meta));
    } catch { /* 容量滿 → 這次不寫，下次開機再拉 */ }
}

let pushTimer = null;
/** 合併多次改動：連續打勾時只送最後一次。 */
function schedulePush(userId) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; pushPlanProgress(userId); }, 1500);
}

/** 把本機進度推上後端。失敗完全靜默 —— 下次改動或下次開機會再推。 */
export async function pushPlanProgress(userId) {
    if (!userId) return false;
    const plans = collectLocalPlanProgress(userId);
    if (!Object.keys(plans).length) return false;
    try {
        const [{ default: apiClient }, { ensureAuthBeforeFetch }] = await Promise.all([
            import('../api/client'), import('./guestAuth'),
        ]);
        await ensureAuthBeforeFetch();
        await apiClient.put(`/api/user/plan-progress/${userId}`, { plans }, { timeout: 8000 });
        return true;
    } catch { return false; }
}

/**
 * 開機拉回：後端那份比本機新才蓋過去。
 * 拉不到就什麼都不做 —— 絕不用空的把本機進度清掉。
 */
export async function hydratePlanProgress(userId) {
    if (!userId) return false;
    let server = null;
    try {
        const [{ default: apiClient }, { ensureAuthBeforeFetch }] = await Promise.all([
            import('../api/client'), import('./guestAuth'),
        ]);
        await ensureAuthBeforeFetch();
        const res = await apiClient.get(`/api/user/plan-progress/${userId}`, { timeout: 8000 });
        server = res?.data?.plans;
    } catch { return false; }
    if (!server || typeof server !== 'object') return false;

    const meta = readMeta(userId);
    let changed = false;
    for (const [planId, row] of Object.entries(server)) {
        const localAt = meta[planId] || '';
        const serverAt = typeof row?.updatedAt === 'string' ? row.updatedAt : '';
        // 本機沒有這份，或後端比較新 → 用後端的
        if (!localAt || serverAt > localAt) {
            applyServerPlan(userId, planId, row);
            changed = true;
        }
    }
    // 本機有、後端沒有的 → 補推上去（第一次升級的使用者就是這條路）
    const localPlans = collectLocalPlanProgress(userId);
    if (Object.keys(localPlans).some((id) => !(id in server))) {
        pushPlanProgress(userId);
    }
    return changed;
}
