/* ════════════════════════════════════════════════════════════════════════
   onboardingState — 新手教學完成狀態的持久化工具
   ────────────────────────────────────────────────────────────────────────
   獨立成檔，讓 OnboardingSpotlight.jsx 維持「只 export 元件」，
   符合 react-refresh 的 Fast Refresh 規範。
   ════════════════════════════════════════════════════════════════════════ */

export const ONBOARDING_STORAGE_KEY = 'drvn_onboarding_v1_done';

/** 教學進度膠囊（左下角浮動 badge）被使用者手動隱藏的旗標。
 *  「設定 → 重啟教學導覽」會清掉此旗標，讓膠囊重新出現。 */
export const TUTORIAL_BADGE_HIDDEN_KEY = 'drvn_tutorial_badge_hidden';

/** 是否已完成過新手教學 */
export function isOnboardingDone() {
    try {
        return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
    } catch {
        return false; // 隱私模式：視為未完成
    }
}

/** 標記新手教學為已完成 */
export function markOnboardingDone() {
    try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
        /* ignore */
    }
}

/** 重設新手教學狀態（給設定頁或「重看教學」按鈕用）。
 *  一併重置各頁的首次造訪情境提示，讓重看教學時情境提示也會再出現一次。
 *  同時清掉「教學膠囊已隱藏」旗標，讓左下角的教學進度膠囊重新顯示。 */
export function resetOnboarding() {
    try {
        localStorage.removeItem(ONBOARDING_STORAGE_KEY);
        localStorage.removeItem(TUTORIAL_BADGE_HIDDEN_KEY);
    } catch {
        /* ignore */
    }
    // 動態載入避免循環相依；失敗不影響主流程
    import('./firstVisitCoach')
        .then((m) => m.resetAllTips())
        .catch(() => {});
}
