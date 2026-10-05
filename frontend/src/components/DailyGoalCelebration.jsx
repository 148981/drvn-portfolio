import React, { useEffect, useMemo, useState } from 'react';
import FullScreenCelebration from './FullScreenCelebration';

// ══════════════════════════════════════════════════════════════════════════
// 🎉 DailyGoalCelebration — 當日訓練達標的「同理時刻」
//
// 使用者要求：
//   「當使用者每天做完每天的訓練進度，做完之後都要跳出動畫來同理使用者的辛苦，
//     並簡意賅地顯示他的數據，說他真的辛苦了。」
//
// 設計原則（DRVN product-os 鐵律）：
//   1. 先同理，再數據 —— 第一行是一句陪伴語，不是彩帶不是分數。
//   2. 簡意賅 —— 只給三個數字，多一個都不給。跑者剛跑完，沒有耐心讀段落。
//   3. 真實數據 —— 每個數字都對得回一筆紀錄；沒破紀錄就不假裝破紀錄，
//      改講「本週第 3 次」「連續 5 天」這種一樣有感但為真的事實。
//   4. 每日只播一次（per-user + 日期 key 去重），不重複騷擾。
//   5. 無 emoji（介面圖示一律走 SVG）。
//
// 2026-08 稽核後的改動：
//   這支原本是「半透明遮罩 + 360px 置中卡」，看起來像整頁其實不是。
//   現在外殼交給共用的 FullScreenCelebration（真的整頁），本檔只負責
//   「今天該不該播」與「該講哪一句、給哪三個數字」——
//   也就是把視覺決策交出去，留下領域邏輯。
// ══════════════════════════════════════════════════════════════════════════

const seenKey = (userId, dateKey, kind) => `drvn_celebrated_${kind}_${userId}_${dateKey}`;

/** 今天是否已經慶祝過（外部也可用來決定要不要 render）。 */
export const hasCelebratedToday = (userId, dateKey, kind = 'daily') => {
    try { return localStorage.getItem(seenKey(userId, dateKey, kind)) === '1'; }
    catch { return false; }
};
export const markCelebratedToday = (userId, dateKey, kind = 'daily') => {
    try { localStorage.setItem(seenKey(userId, dateKey, kind), '1'); } catch { /* ignore */ }
};

/**
 * 依真實數據挑一句陪伴語 —— 不套罐頭，也不誇大。
 * 難度越高語氣越有重量，普通日子就講得平實一點。
 */
const buildEmpathyLine = ({ kind, distanceKm, durationSec, volumeKg, prCount, streakDays }) => {
    const mins = Math.round((durationSec || 0) / 60);
    if (prCount > 0) return '你今天把自己的紀錄往前推了。這不是運氣，是練出來的。';
    if (kind === 'run' && distanceKm >= 15) return `${distanceKm.toFixed(1)} 公里不是隨便跑得完的距離。今天辛苦了。`;
    if (kind === 'run' && mins >= 60) return '跑滿一小時，中途一定有想停的時候 —— 你沒有。';
    if (kind === 'strength' && volumeKg >= 8000) return '這個總量壓下來，明天會有點痠 —— 那是身體在回應你。';
    if (streakDays >= 5) return `連續第 ${streakDays} 天了。維持比爆發難，你正在做比較難的那件事。`;
    if (mins >= 40) return '今天這一場不輕鬆，你把它收下了。';
    return '今天有出門、有完成。累積就是這樣一天一天長出來的。';
};

/**
 * @param {object}   props
 * @param {boolean}  props.open
 * @param {string}   props.userId
 * @param {string}   props.dateKey        今天的日期 key（YYYY-MM-DD，走 logicalDayKey）
 * @param {'run'|'strength'} props.kind
 * @param {object}   props.stats          { distanceKm, durationSec, paceSec, volumeKg, sets, calories }
 * @param {number}   props.prCount        本場破紀錄數（真實值，沒有就 0）
 * @param {number}   props.streakDays     連續訓練天數（真實值）
 * @param {number}   props.weekCount      本週第幾次（真實值）
 * @param {Function} props.onClose
 */
const DailyGoalCelebration = ({
    open, userId, dateKey, kind = 'run', stats = {},
    prCount = 0, streakDays = 0, weekCount = 0, onClose,
}) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!open) { setVisible(false); return; }
        if (hasCelebratedToday(userId, dateKey, 'daily')) return;   // 每日只播一次
        setVisible(true);
        markCelebratedToday(userId, dateKey, 'daily');
        // 自動退場改由 FullScreenCelebration 的 autoDismissMs 統一處理，
        // 不再每個慶祝頁自己設一顆 timer（原本 6s / 2.2s 各講各的）。
    }, [open, userId, dateKey]);

    const { line, metrics } = useMemo(() => {
        const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
        const distanceKm = n(stats.distanceKm);
        const durationSec = n(stats.durationSec);
        const paceSec = n(stats.paceSec);
        const volumeKg = n(stats.volumeKg);
        const sets = n(stats.sets);

        const fmtClock = (s) => {
            const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
            return h > 0
                ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
                : `${m}:${String(sec).padStart(2, '0')}`;
        };
        const fmtPace = (s) => s > 0 ? `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"` : null;

        // ⚠️ 只放「真的有值」的欄位，最多三個 —— 簡意賅是規格的一部分。
        const out = [];
        if (kind === 'run') {
            if (distanceKm > 0) out.push({ value: distanceKm.toFixed(2), unit: 'KM', label: '距離' });
            if (durationSec > 0) out.push({ value: fmtClock(durationSec), unit: '', label: '時間' });
            if (fmtPace(paceSec)) out.push({ value: fmtPace(paceSec), unit: '/KM', label: '配速' });
        } else {
            if (volumeKg > 0) out.push({ value: Math.round(volumeKg).toLocaleString(), unit: 'KG', label: '總容量' });
            if (durationSec > 0) out.push({ value: fmtClock(durationSec), unit: '', label: '時間' });
            if (sets > 0) out.push({ value: String(sets), unit: '組', label: '組數' });
        }
        // 破紀錄／連續天數 是「真實且有感」的第三格候補
        if (out.length < 3) {
            if (prCount > 0) out.push({ value: String(prCount), unit: '項', label: '新紀錄' });
            else if (streakDays >= 2) out.push({ value: String(streakDays), unit: '天', label: '連續' });
            else if (weekCount >= 2) out.push({ value: String(weekCount), unit: '次', label: '本週' });
        }

        return {
            line: buildEmpathyLine({ kind, distanceKm, durationSec, volumeKg, prCount, streakDays }),
            metrics: out.slice(0, 3),
        };
    }, [kind, stats, prCount, streakDays, weekCount]);

    const close = () => { setVisible(false); onClose?.(); };

    return (
        <FullScreenCelebration
            open={visible}
            onDismiss={close}
            eyebrow={kind === 'run' ? "TODAY'S RUN · DONE" : "TODAY'S SESSION · DONE"}
            title="辛苦了。"
            subtitle={line}
            stats={metrics}
            tone="dark"
            dismissMode="tap-anywhere-timed"
            autoDismissMs={6000}
            hint="點一下繼續"
        />
    );
};

export default DailyGoalCelebration;
