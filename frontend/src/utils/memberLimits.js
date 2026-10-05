/**
 * memberLimits.js — 免費版的每一條界線，全專案只有這一份
 * ══════════════════════════════════════════════════════════════════════
 * 純函式、不碰網路也不碰 React：畫面、驗證腳本、之後的後端對照都讀這裡。
 * 「是不是會員」由呼叫端傳進來（通常是 utils/membership 的 isMember()）。
 *
 * 原則（付費模式分析）：資料永遠是使用者的 —— 界線只擋「看得多深、看得多遠」，
 * 不刪任何紀錄，也不擋今天要練的課。
 */

/** 趨勢圖：2026-09 起所有人都看全部（完整歷史改免費）。null＝不切 */
export const FREE_HISTORY_DAYS = null;

/** 姿勢檢查：2026-09 起全部免費、不限次數（本地運算，成本不隨次數增加；還在收集回饋）。
 *  null＝不限；後端 api_membership.FREE_POSE_CHECKS_PER_MONTH 同步。 */
export const FREE_POSE_CHECKS_PER_MONTH = null;

/** 進階課程：鋼骨基石（iron-base-56）整門免費；其他五門第 1 週免費試上 */
export const MEMBER_COURSE_IDS = [
    'v-taper-suit-56',    // 型男套裝
    'peach-suit-56',      // 蜜桃翹臀
    'lean-light-42',      // 燃脂輕跑
    'runners-armor-42',   // 跑者護甲
    'hybrid-engine-56',   // HYROX 混合體能
];
export const FREE_COURSE_WEEKS = 1;

const DAY = 24 * 60 * 60 * 1000;

/** Expire a cached subscription locally without changing a server-disabled gate. */
export function effectiveMembershipCache(cache, now = Date.now()) {
    if (!cache) return null;
    if (!['active', 'trial', 'grace'].includes(cache.status)) return cache;
    const expires = cache.expires_at ? Date.parse(cache.expires_at) : NaN;
    if (Number.isFinite(expires) && expires > now) return cache;
    return { ...cache, status: 'expired', is_member: cache.gate_enabled === false };
}

/** 趨勢圖最早可以畫到哪一刻（ms）。會員 → null（不限）。 */
export function historyCutoffMs(member, now = Date.now()) {
    if (member || FREE_HISTORY_DAYS == null) return null;
    return now - FREE_HISTORY_DAYS * DAY;
}

/** 依日期欄位把一串點切到免費範圍內。回傳 { rows, trimmed }：trimmed = 有沒有被切掉。 */
export function trimToHistory(rows = [], getTime, member, now = Date.now()) {
    const cutoff = historyCutoffMs(member, now);
    if (cutoff == null) return { rows, trimmed: false };
    const kept = rows.filter((r) => {
        const t = getTime(r);
        return !Number.isFinite(t) || t >= cutoff;
    });
    return { rows: kept, trimmed: kept.length < rows.length };
}

/** 這門課是不是會員課程（課程 id 或啟用後帶著的 source_course.id 都認得） */
export function isMemberCourse(planOrId) {
    if (!planOrId) return false;
    const id = typeof planOrId === 'string'
        ? planOrId
        : (planOrId.source_course?.id || planOrId.plan_id || planOrId.id);
    return MEMBER_COURSE_IDS.includes(id);
}

/** 這一週要不要擋（第 1 週免費試上；鋼骨基石與自己的計劃永遠不擋） */
export function courseWeekLocked(planOrId, weekNumber, member) {
    if (member) return false;
    const w = Number(weekNumber) || 1;
    return isMemberCourse(planOrId) && w > FREE_COURSE_WEEKS;
}

/** 這個月還能不能再做一次姿勢檢查 */
export function poseCheckAllowed(usedThisMonth, member) {   // eslint-disable-line no-unused-vars
    if (FREE_POSE_CHECKS_PER_MONTH == null) return true;
    if (member) return true;
    return (Number(usedThisMonth) || 0) < FREE_POSE_CHECKS_PER_MONTH;
}

/* ── 給純工具檔用的「這個會員功能現在能不能用」──────────────────────
   提醒、推播、首頁提示這些 utils 不能 import utils/membership（會把網路層拉進驗證腳本）。
   membership 在 App 啟動時把判斷注入這裡；沒注入 = 全開（跟以前一樣）。
   用途：會員專屬頁面（月報）不主動推給免費使用者 —— 推播裡不出現付費牆。 */
let featureGate = () => true;
export function setFeatureGate(fn) {
    featureGate = typeof fn === 'function' ? fn : () => true;
}
export function featureAllowed(feature) {
    try { return !!featureGate(feature); } catch { return true; }
}

/** 方案與價格（唯一一份；付費牆、方案頁、扣款提醒都從這裡取；utils/membership 轉出同一份） */
export const MEMBERSHIP_PLANS = [
    { id: 'yearly',  productId: 'drvn.member.yearly',  price: 1290, period: '年', trialDays: 14 },
    { id: 'monthly', productId: 'drvn.member.monthly', price: 190,  period: '月', trialDays: 0 },
];
export const planByProduct = (productId) => MEMBERSHIP_PLANS.find((p) => p.productId === productId) || null;

/** 手機 StoreKit 回報的續訂狀態（utils/membership 寫入）：{ productId, expiresAt, willAutoRenew, isTrial, firstRenewal, displayPrice } */
export const renewalStorageKey = (userId) => `drvn_iap_renewal_${userId || 'guest'}`;
export function readRenewal(userId) {
    try {
        const v = JSON.parse(localStorage.getItem(renewalStorageKey(userId)) || 'null');
        return v && v.productId ? v : null;
    } catch (_) { return null; }
}

/**
 * 扣款前提醒的規則（與 ios StoreManager.scheduleReminder 同一套，推播與 App 內提示一致）：
 *   取消自動續訂 → 到期前 3 天；免費試用 → 結束前 3 天；年訂閱 → 續訂前 7 天；
 *   月訂閱只提醒第一次續訂（前 2 天），之後每月扣款不打擾。
 */
export function renewalReminder(r, now = Date.now()) {
    if (!r || !r.productId || !r.expiresAt) return null;
    const plan = planByProduct(r.productId);
    const yearly = plan ? plan.id === 'yearly' : String(r.productId).endsWith('yearly');
    let kind, windowDays;
    if (r.willAutoRenew === false) { kind = 'expire'; windowDays = 3; }
    else if (r.isTrial) { kind = 'trialEnd'; windowDays = 3; }
    else if (yearly) { kind = 'renew'; windowDays = 7; }
    else if (r.firstRenewal) { kind = 'renew'; windowDays = 2; }
    else return null;
    const msLeft = r.expiresAt - now;
    if (msLeft <= 0 || msLeft > windowDays * DAY) return null;
    const daysLeft = Math.max(1, Math.ceil(msLeft / DAY));
    const d = new Date(r.expiresAt);
    const date = `${d.getMonth() + 1}月${d.getDate()}日`;
    const price = r.displayPrice || (plan ? `NT$${plan.price.toLocaleString()}` : '');
    const per = price ? `以 ${price}／${yearly ? '年' : '月'}` : '';
    const title = kind === 'expire' ? `會員 ${daysLeft} 天後到期`
        : kind === 'trialEnd' ? `免費試用 ${daysLeft} 天後結束` : `會員 ${daysLeft} 天後續訂`;
    const detail = kind === 'expire' ? `${date} 到期，之後不會再扣款`
        : `${date} ${kind === 'trialEnd' ? '起' : '將'}${per}自動續訂`;
    return { kind, daysLeft, date, title, detail, key: `${r.productId}:${r.expiresAt}:${kind}` };
}

export default {
    FREE_HISTORY_DAYS, FREE_POSE_CHECKS_PER_MONTH, MEMBER_COURSE_IDS, FREE_COURSE_WEEKS,
    historyCutoffMs, trimToHistory, isMemberCourse, setFeatureGate, featureAllowed, courseWeekLocked, poseCheckAllowed,
};
