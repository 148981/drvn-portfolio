/**
 * advancedMode.js — 進階模式（會員）
 * ──────────────────────────────────────────────────────────────────
 * 進階模式跟「進階圖表」是同一個開關：設定頁「圖表 → 進階」。
 * 原本這裡有一個獨立的 localStorage 開關，但設定頁早就沒有入口可以打開它，
 * 等於沒有人用得到。現在收成一件事：
 *   會員 ＋ 圖表偏好選「進階」 → 進階模式開啟
 * 判斷全部交給 utils/advancedCharts（偏好）與 utils/membership（會員），這裡不另存狀態。
 *
 * 用法：
 *   import { isAdvancedMode, useAdvancedMode } from '../utils/advancedMode';
 *   const advanced = useAdvancedMode();
 *   {advanced && <FusionButton />}
 */
import { getChartPreference, setChartPreference, useChartVisibility } from './advancedCharts';
import { isMember } from './membership';

/** 是否開啟進階模式（會員且選了進階） */
export function isAdvancedMode() {
    return isMember() && getChartPreference() === 'advanced';
}

/** 設定進階模式 = 設定圖表偏好（非會員設了也不會生效） */
export function setAdvancedMode(on) {
    setChartPreference(on ? 'advanced' : 'basic');
}

export function toggleAdvancedMode() {
    const next = !isAdvancedMode();
    setAdvancedMode(next);
    return next;
}

/** React hook：隨會員狀態與設定即時更新 */
export function useAdvancedMode() {
    const { member, pref } = useChartVisibility();
    return member && pref === 'advanced';
}

export default { isAdvancedMode, setAdvancedMode, toggleAdvancedMode, useAdvancedMode };
