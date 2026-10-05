/**
 * widgetBridge.js — iOS 桌面小工具資料橋
 * ─────────────────────────────────────────────────────────
 * 把「今日進度 / 段位邀請函 / 飲食連續天數」快照推給原生層，
 * 原生寫入 App Group UserDefaults 後刷新 DailyPromptWidget
 * （小/中/大三種桌面小工具）。
 *
 * 呼叫端：ActionFirstDashboardMobile 在 weekAgenda / 打卡狀態
 * 變化時呼叫 pushDailyWidgetData(userId, weekAgenda)。
 * 非 iOS WebView 環境（純瀏覽器）自動 no-op。
 */

import { getTodayCheckinItems } from '../components/DailyCheckinPanel';
import { shouldShowLeaguePromotion } from './leaguePromotionReminder';
import { uGet } from './userStorage';
import { logicalDayKey } from './dailyAgenda';
import apiClient from '../api/client';
import { sessionVolume } from './strengthMath';

const WEEK_ZH = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

/** 今日已攝取 kcal（nutrition_log 加總，套 6 點日界線） */
function todayIntakeKcal(userId) {
    try {
        const log = uGet(userId, 'nutrition_log', []) || [];
        const today = logicalDayKey(new Date());
        return (Array.isArray(log) ? log : [])
            .filter((e) => logicalDayKey(new Date(e?.date || e?.timestamp || 0)) === today)
            .reduce((s, e) => s + (parseFloat(e?.calories ?? e?.kcal ?? e?.totalCalories ?? 0) || 0), 0);
    } catch { return 0; }
}

/** 目標 kcal：嘗試常見儲存鍵；拿不到回 null（小工具會自動退回語錄卡） */
function targetKcal(userId) {
    try {
        for (const key of ['nutrition_targets', 'nutritionTargets', 'nutrition_goal', 'nutrition_plan']) {
            const v = uGet(userId, key, null);
            const t = parseFloat(v?.targetCalories ?? v?.calories ?? v?.target_kcal ?? NaN);
            if (Number.isFinite(t) && t > 500) return Math.round(t);
        }
    } catch { /* */ }
    return null;
}

/** 營養紀錄連續天數（含今天；以 6 點日界線的邏輯日計）
 *
 *  2026-08 稽核：這支本來只餵 iOS 桌面小工具，App 自己的營養頁反而顯示
 *  寫死的 1 —— 造成「小工具講真話、App 講假話」。改成 export，讓
 *  NutritionPageMobile 直接用同一支，維持單一真相源。
 */
export function nutritionStreakDays(userId) {
    try {
        const log = uGet(userId, 'nutrition_log', []) || [];
        const days = new Set(
            (Array.isArray(log) ? log : [])
                .map((e) => logicalDayKey(new Date(e?.date || e?.timestamp || 0)))
                .filter(Boolean)
        );
        let streak = 0;
        const d = new Date();
        for (let i = 0; i < 60; i++) {
            const key = logicalDayKey(new Date(d.getTime() - i * 86400000));
            if (days.has(key)) streak++;
            else if (i === 0) continue;   // 今天還沒記不斷 streak（給今天機會）
            else break;
        }
        return streak;
    } catch { return 0; }
}

export async function pushDailyWidgetData(userId, weekAgenda) {
    const post = window.webkit?.messageHandlers?.widgetData;
    if (!post) return;   // 非 iOS 原生環境

    // 🌤️ 天氣快照（3 秒超時；失敗不擋主資料）— 供「晨間天氣×運動建議」卡
    let weather = null;
    try {
        const res = await Promise.race([
            apiClient.get('/api/weather'),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);
        const t = parseFloat(res?.data?.temperature);
        if (Number.isFinite(t)) {
            weather = { tempC: t, rainPct: parseFloat(res?.data?.rain ?? 0) || 0, windKph: parseFloat(res?.data?.wind_speed ?? 0) || 0, fetchedAt: Date.now() / 1000 };
        }
    } catch { /* 無天氣 → 小工具跳過天氣卡 */ }

    try {
        const idx = weekAgenda?.todayIdx ?? 0;
        const cell = weekAgenda?.week?.[idx] || { strength: null, run: null };
        const items = (getTodayCheckinItems(cell, userId, null) || []).map((i) => ({
            // 🧘 小工具版面小：標題去掉括號細節與破折號副標
            //   「推力強化 (胸·肩·三頭)」→「推力強化」
            //   「量第一筆 InBody — 建立身體基準」→「量第一筆 InBody」
            label: (i.label || '').replace(/\s*[（(].*$/, '').split('—')[0].trim(),
            sub: i.sub, cat: i.key || 'default', done: !!i.done,
        }));
        const done = items.filter((i) => i.done).length;
        const next = items.find((i) => !i.done);

        let league = null;
        try {
            const r = shouldShowLeaguePromotion(userId);
            league = { pending: !!r.show, label: r.label || '' };
        } catch { /* league store 不可用 */ }

        // 🔥 訓練連續（streakEngine v2：寬容凍結卡）→ 小工具可顯示保衛戰卡
        let streak = null;
        try {
            const { getStreak } = await import('./streakEngine');
            const s = getStreak(userId);
            streak = { current: s.current, freezes: s.freezes, atRisk: !!s.atRisk, todayDone: !!s.todayDone };
        } catch { /* streak 引擎不可用 → 略過 */ }

        // 🎴 事件提示卡（依時間 × 事件挑「一張」；null → 小工具走預設策展）
        //    優先序：streak 保衛戰（傍晚）＞ 晚間收尾（18 後還有未完成）＞ 週一開賽（早上）
        let hint = null;
        try {
            const h = new Date().getHours();
            const remain = items.filter((i) => !i.done).length;
            if (streak?.atRisk) {
                hint = {
                    kind: 'streak',
                    title: `連續第 ${streak.current} 天`,
                    sub: '今天還沒動 — 30 分鐘就夠',
                };
            } else if (h >= 18 && remain > 0) {
                hint = { kind: 'wrapup', title: `今天還差 ${remain} 件`, sub: next?.label || '收尾一下，讓今天完整' };
            } else if (h < 11 && new Date().getDay() === 1 && items.length > 0) {
                hint = { kind: 'kickoff', title: '新的一週', sub: next?.label || '先從最簡單的那件開始' };
            }
        } catch { /* */ }

        const payload = {
            dayLabel: WEEK_ZH[idx] || '今天',
            dayTitle: cell.strength && cell.run ? '雙 Session 日'
                : cell.strength ? '重訓日'
                : cell.run ? '跑步日' : '休息日',
            done,
            total: items.length,
            nextLabel: next?.label || '',
            tasks: items.slice(0, 4),
            league,
            streakDays: nutritionStreakDays(userId),
            updatedAt: Date.now() / 1000,
            weather,   // 晨間天氣卡（null → 跳過）
            nutrition: { intakeKcal: Math.round(todayIntakeKcal(userId)), targetKcal: targetKcal(userId) },
            streak,    // 🔥 訓練連續（null → 小工具不顯示 streak 卡）
            hint,      // 🎴 事件提示卡（null → 預設策展）
            recentWorkout: await recentWidgetWorkout(userId),
        };
        post.postMessage({ json: JSON.stringify(payload) });
    } catch { /* 快照失敗不影響 App */ }
}

async function recentWidgetWorkout(userId) {
    const results = await Promise.allSettled([
        apiClient.get(`/api/cardio/sessions/${userId}?limit=20`, { timeout: 3000 }),
        apiClient.get(`/api/workout/history/${userId}?limit=20`, { timeout: 3000 }),
    ]);
    const candidates = [];
    const timestamp = r => new Date(r.completed_at || r.date || r.timestamp || r.created_at).getTime();
    const runs = results[0].status === 'fulfilled' ? results[0].value?.data?.sessions : [];
    for (const run of Array.isArray(runs) ? runs : []) {
        const distance = Number(run.metrics?.distance);
        const duration = Number(run.metrics?.duration);
        if (distance > 0 && Number.isFinite(distance)) candidates.push({
            title: '最近有氧', value: distance.toFixed(2), unit: 'km',
            detail: duration > 0 && Number.isFinite(duration) ? `${Math.round(duration / 60)} 分鐘` : '',
            performedAt: timestamp(run) / 1000,
        });
    }
    const server = results[1].status === 'fulfilled' ? results[1].value?.data : null;
    const strength = server?.history || server?.sessions || [];
    const local = uGet(userId, 'trainingRecords', {});
    for (const rec of [...(Array.isArray(strength) ? strength : []), ...Object.values(local || {})]) {
        if (!rec || !Array.isArray(rec.exercises) || !rec.exercises.length) continue;
        const volume = sessionVolume(rec);
        if (volume > 0 && Number.isFinite(volume)) candidates.push({
            title: '最近重訓', value: Math.round(volume).toLocaleString('en-US'), unit: 'kg',
            detail: '總訓練量', performedAt: timestamp(rec) / 1000,
        });
    }
    const now = Date.now() / 1000;
    return candidates.filter(r => Number.isFinite(r.performedAt) && r.performedAt <= now && now - r.performedAt < 7 * 86400)
        .sort((a, b) => b.performedAt - a.performedAt)[0] || null;
}
