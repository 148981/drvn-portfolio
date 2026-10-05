// 🗓️ periodicEvents — 一季訓練週期裡「時間到了就該做」的事件引擎
// ─────────────────────────────────────────────────────────────
// 模擬一整季（12 週）真實使用者會遇到的節點，時間到就注入每日打卡清單，
// 讓使用者每天打開都有明確目標。全部用真實資料判定「到期/完成」，不硬塞：
//
//   • InBody 量測  — 每 14 天一次（增肌/減脂看趨勢的最短有效間隔）；
//                    從未量過 → 溫和引導第一筆。今天量了 → 自動打勾。
//   • 週回顧      — 週日（一週訓練結束）且本週有訓練才出現；看過就打勾。
//   • 月報        — 每月 1–3 號出現上月報告入口；看過就打勾。
//
// done 的落檔：`drvn:pev:<uid>:<key>:<期別>` = '1'（uStorage 不適合一次性 flag）。
// 所有日期判定走 dailyAgenda 的 6 點日界線（logicalDayKey / logicalNow）。
import { logicalDayKey, logicalNow } from './dailyAgenda';
import { featureAllowed } from './memberLimits';

const FLAG = (uid, key, period) => `drvn:pev:${uid || 'guest'}:${key}:${period}`;

const readInbody = (userId) => {
    try {
        const arr = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
};

/** 標記某週期事件完成（點 CTA 進去時呼叫） */
export function markPeriodicDone(userId, key, period) {
    try { localStorage.setItem(FLAG(userId, key, period), '1'); } catch { /* */ }
}
const isMarked = (userId, key, period) => {
    try { return localStorage.getItem(FLAG(userId, key, period)) === '1'; } catch { return false; }
};

/**
 * 取得今天到期的週期事件（打卡清單項目格式，與 getTodayCheckinItems 相容）。
 * @param {string} userId
 * @param {function|null} navigate
 * @param {Date} now
 */
export function getPeriodicCheckinItems(userId, navigate = null, now = new Date()) {
    const items = [];
    const ln = logicalNow(now);
    const todayKey = logicalDayKey(now);

    // ── 🩻 InBody：每 14 天 ───────────────────────────────────
    const inbody = readInbody(userId);
    const lastTs = inbody
        .map((r) => new Date(r.measurement_date || r.date || r.created_at || NaN))
        .filter((d) => !isNaN(d))
        .sort((a, b) => b - a)[0] || null;
    const daysSince = lastTs ? Math.floor((now - lastTs) / 86400000) : null;
    const measuredToday = lastTs ? logicalDayKey(lastTs) === todayKey : false;
    if (measuredToday || daysSince === null || daysSince >= 14) {
        items.push({
            key: 'inbody',
            label: daysSince === null
                ? '量第一筆 InBody — 建立身體基準'
                : measuredToday ? '量 InBody（每 2 週追蹤）'
                    : `量 InBody — 距上次已 ${daysSince} 天`,
            sub: '身體數據',
            done: measuredToday,
            cta: '去量測',
            go: () => navigate?.('/body-analysis-mobile'),
        });
    }

    // ── 📋 週回顧：週日出現（idx 6），看過本週的就打勾 ─────────
    const weekIdx = (ln.getDay() + 6) % 7; // 0=一 … 6=日
    if (weekIdx === 6) {
        const period = `${ln.getFullYear()}-W${Math.ceil((((ln - new Date(ln.getFullYear(), 0, 1)) / 86400000) + new Date(ln.getFullYear(), 0, 1).getDay() + 1) / 7)}`;
        items.push({
            key: 'weekly-recap',
            label: '看本週回顧 — 這週的汗值多少',
            sub: '週回顧',
            done: isMarked(userId, 'weekly-recap', period),
            cta: '去回顧',
            go: () => { markPeriodicDone(userId, 'weekly-recap', period); navigate?.('/weekly-recap-mobile'); },
        });
    }

    // ── 📈 月報：每月 1–3 號出現上月報告 ──────────────────────
    if (ln.getDate() <= 3 && featureAllowed('monthlyReport')) {   // 💳 月報是會員；免費使用者不列這一項
        const period = `${ln.getFullYear()}-M${ln.getMonth() + 1}`;
        items.push({
            key: 'monthly-report',
            label: '看上月報告 — 一個月的進化總結',
            sub: '月報',
            done: isMarked(userId, 'monthly-report', period),
            cta: '去看',
            go: () => { markPeriodicDone(userId, 'monthly-report', period); navigate?.('/monthly-report-mobile'); },
        });
    }

    return items;
}
