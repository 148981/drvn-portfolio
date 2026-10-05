/**
 * advancedCharts.js — 圖表分級的唯一真相源：基本圖表 vs 進階圖表
 * ══════════════════════════════════════════════════════════════════════
 * 規則只有兩層（付費模式分析 §功能切分）：
 *   · 基本圖表：看自己的紀錄 —— 所有人都看得到，永遠免費
 *   · 進階圖表：運動科學的深度分析 —— 會員功能；會員可以在設定裡關掉，保持畫面清爽
 *
 * 每一張會被分級的圖表都登記在 CHART_REGISTRY（系統、名稱、層級）。
 * 畫面只問 useChartVisibility().visible(key)，不自己判斷；
 * 設定頁的說明也直接從這張表產生，說明跟實際顯示永遠一致。
 * 沒登記的 key 一律當基本圖表。
 *
 * 免費使用者：進階圖表不渲染，每個畫面最多放一張 MemberLockCard（hasLockedCharts）。
 */
import { useEffect, useState } from 'react';
import { isMember } from './membership';

const LEVEL_KEY = 'drvn_chart_level';       // 'basic' | 'advanced'（舊值 beginner/intermediate/advanced 自動換算）
const LEGACY_KEY = 'drvn_advanced_charts';  // 更舊的二元 '1'/'0'
const EVENT = 'drvn:advanced-charts-changed';
const MEMBER_EVENT = 'drvn:membership-changed';

/** 圖表登記表：key → { system, name, tier } */
export const CHART_REGISTRY = {
    // ── 重訓（訓練紀錄頁）──
    strengthWeeklyVolume: { system: '重訓', name: '本週每日訓練量', tier: 'basic' },
    strengthRecovery:     { system: '重訓', name: '肌群恢復', tier: 'basic' },
    strengthAcwr:         { system: '重訓', name: 'ACWR 負荷比', tier: 'advanced' },
    strengthLoad:         { system: '重訓', name: '訓練負荷分析', tier: 'advanced' },
    // ── 跑步（單次結算與分析）──
    runPhysio:            { system: '跑步', name: '跑步效率、心率恢復、後半段掉速', tier: 'advanced' },
    // ── 跑步（趨勢）──
    heartRate:            { system: '跑步', name: '心率趨勢', tier: 'basic' },
    lsd:                  { system: '跑步', name: '最長一趟進展', tier: 'basic' },
    cadence:              { system: '跑步', name: '步頻趨勢', tier: 'advanced' },
    vo2max:               { system: '跑步', name: 'VO₂max 趨勢', tier: 'advanced' },
    relativeEffort:       { system: '跑步', name: '相對努力', tier: 'advanced' },
    fitnessFreshness:     { system: '跑步', name: '體能與新鮮度', tier: 'advanced' },
    // ── 營養（分析分頁）──
    nutritionTdee:        { system: '營養', name: '動態代謝估算', tier: 'advanced' },
    nutritionMealTiming:  { system: '營養', name: '進食時間分布', tier: 'advanced' },
};

/** 使用者偏好：'basic' | 'advanced'（只對會員有意義；沒選過＝進階，付費後立刻看得到） */
export function getChartPreference() {
    try {
        const v = localStorage.getItem(LEVEL_KEY);
        if (v === 'basic' || v === 'beginner') return 'basic';
        if (v === 'advanced' || v === 'intermediate') return 'advanced';
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy === '1') return 'advanced';
        if (legacy === '0') return 'basic';
        /* 沒選過 → 進階。進階圖表只有會員畫得出來（chartVisible 另外檢查 member），
           以前預設 'basic' 的結果是：訂閱完回到分析頁，畫面跟訂閱前一模一樣。 */
        return 'advanced';
    } catch (_) { return 'advanced'; }
}

export function setChartPreference(pref) {
    const p = pref === 'advanced' ? 'advanced' : 'basic';
    try {
        localStorage.setItem(LEVEL_KEY, p);
        localStorage.setItem(LEGACY_KEY, p === 'advanced' ? '1' : '0');
    } catch (_) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { pref: p } })); } catch (_) { /* ignore */ }
    return p;
}

/** 這張圖現在要不要畫（非 React 環境也能用） */
export function chartVisible(key, member = isMember(), pref = getChartPreference()) {
    const entry = CHART_REGISTRY[key];
    if (!entry || entry.tier === 'basic') return true;
    return member && pref === 'advanced';
}

/** 某系統有沒有「因為不是會員」而沒畫出來的進階圖表 → 決定要不要放那一張會員卡 */
export function hasLockedCharts(system, member = isMember()) {
    if (member) return false;
    return Object.values(CHART_REGISTRY).some((c) => c.system === system && c.tier === 'advanced');
}

/** 各系統的進階圖表名稱（設定頁說明用） */
export function advancedChartsBySystem() {
    const out = {};
    Object.values(CHART_REGISTRY).forEach((c) => {
        if (c.tier !== 'advanced') return;
        (out[c.system] = out[c.system] || []).push(c.name);
    });
    return out;
}

/** React hook：{ member, pref, visible(key), locked(system) }，隨會員狀態與設定即時更新 */
export function useChartVisibility() {
    const read = () => ({ member: isMember(), pref: getChartPreference() });
    const [state, setState] = useState(read);
    useEffect(() => {
        const sync = () => setState(read());
        window.addEventListener(EVENT, sync);
        window.addEventListener(MEMBER_EVENT, sync);
        const onStorage = (e) => { if (e.key === LEVEL_KEY || e.key === LEGACY_KEY) sync(); };
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(EVENT, sync);
            window.removeEventListener(MEMBER_EVENT, sync);
            window.removeEventListener('storage', onStorage);
        };
    }, []);
    return {
        ...state,
        visible: (key) => chartVisible(key, state.member, state.pref),
        locked: (system) => hasLockedCharts(system, state.member),
    };
}

// ── 相容舊呼叫（onboarding 仍用 setChartLevel(新手/中階/進階) 設預設值）──────
export function setChartLevel(level) {
    return setChartPreference(level === 'beginner' || level === 'basic' ? 'basic' : 'advanced');
}
export function getChartLevel() { return getChartPreference(); }

export default {
    CHART_REGISTRY, getChartPreference, setChartPreference, chartVisible,
    hasLockedCharts, advancedChartsBySystem, useChartVisibility, setChartLevel, getChartLevel,
};
