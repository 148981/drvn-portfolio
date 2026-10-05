// ══════════════════════════════════════════════════════════════════════════
// 📜 journeyHistory — 完整歷史回顧的資料層
//
// 使用者要求：
//   「幫我做完整的歷史回顧系統，看看自己所有歷經的努力數據。」
//   「要是一個能給使用者正向完整回饋的完整系統。」
//
// 原本的進化日誌只有「累積數字」（總共幾次、總共幾噸），
// 缺了真正能讓人回顧的四種東西：
//   ① 時間軸  —— 每一筆紀錄，一筆一筆看得到
//   ② 里程碑  —— 第一次、累積達標，以及「下一個還差多少」
//   ③ 熱力圖  —— 哪幾天有出現，連續性一眼看穿
//   ④ 演進線  —— 同一件事隨時間變好的證據
//
// 正向回饋原則（product-os 鐵律）：
//   • 每個數字都對得回一筆真實紀錄
//   • 沒進步不亂顯示，但「還沒達成的下一個里程碑」要給 —— 那是希望不是評判
//   • 空狀態也要正向：講「起點」，不講「你什麼都沒有」
// ══════════════════════════════════════════════════════════════════════════

import { sessionVolume } from './strengthMath';

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const dayKey = (d) => {
    const t = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(t.getTime())) return null;
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// ══════════════════════════════════════════════════════════════════════════
// ① 統一事件流 —— 三個系統的紀錄併成一條時間軸
// ══════════════════════════════════════════════════════════════════════════

/**
 * @returns {Array<{ id, kind:'run'|'strength'|'inbody', date:Date, dayKey, title, metrics:[{v,u,l}], raw }>}
 */
export const buildEventStream = ({ runs = [], workouts = [], inbody = [] } = {}) => {
    const out = [];

    for (const r of runs) {
        const d = new Date(r.date || r.timestamp || r.created_at || 0);
        if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) continue;
        const km = n(r.distance ?? r.distance_km ?? r.metrics?.distance_km ?? r.metrics?.distance);
        const sec = n(r.duration ?? r.duration_sec ?? r.metrics?.duration_seconds ?? r.metrics?.duration);
        let pace = n(r.avg_pace ?? r.avgPace ?? r.metrics?.pace_per_km);
        if (!(pace >= 120 && pace <= 1200) && km > 0 && sec > 0) pace = Math.round(sec / km);
        out.push({
            id: `run-${r.session_id || r.run_id || d.getTime()}-${out.length}`,
            kind: 'run',
            date: d,
            dayKey: dayKey(d),
            title: km > 0 ? `${km.toFixed(2)} 公里` : '跑步',
            metrics: [
                km > 0 && { v: km.toFixed(2), u: 'KM', l: '距離' },
                sec > 0 && { v: fmtClock(sec), u: '', l: '時間' },
                pace >= 120 && pace <= 1200 && { v: fmtPace(pace), u: '/KM', l: '配速' },
            ].filter(Boolean),
            sortValue: km,
            raw: r,
        });
    }

    for (const w of workouts) {
        const d = new Date(w.timestamp || w.date || w.created_at || 0);
        if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) continue;
        // 🩹 原本只認 total_volume / volume：只存了 volume_kg 或 metrics.volume_kg
        //    的紀錄在這裡會變成 0（今日議程卻看得到）。改走單一讀取入口。
        const vol = sessionVolume(w);
        const sets = n(w.hard_sets) || (w.exercises || []).reduce(
            (s, ex) => s + (Array.isArray(ex.detailedSets) ? ex.detailedSets.length : n(ex.sets)), 0);
        out.push({
            id: `w-${w.session_id || w.id || d.getTime()}-${out.length}`,
            kind: 'strength',
            date: d,
            dayKey: dayKey(d),
            title: w.focus || w.name || '重訓',
            metrics: [
                vol > 0 && { v: Math.round(vol).toLocaleString(), u: 'KG', l: '總容量' },
                sets > 0 && { v: String(sets), u: '組', l: '組數' },
                n(w.duration_seconds) > 0 && { v: fmtClock(n(w.duration_seconds)), u: '', l: '時間' },
            ].filter(Boolean),
            sortValue: vol,
            raw: w,
        });
    }

    for (const b of inbody) {
        const d = new Date(b.date || b.timestamp || 0);
        if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) continue;
        out.push({
            id: `inbody-${d.getTime()}-${out.length}`,
            kind: 'inbody',
            date: d,
            dayKey: dayKey(d),
            title: '身體數據量測',
            metrics: [
                n(b.weight) > 0 && { v: n(b.weight).toFixed(1), u: 'KG', l: '體重' },
                n(b.smm) > 0 && { v: n(b.smm).toFixed(1), u: 'KG', l: '骨骼肌' },
                n(b.bf) > 0 && { v: n(b.bf).toFixed(1), u: '%', l: '體脂' },
            ].filter(Boolean),
            sortValue: 0,
            raw: b,
        });
    }

    return out.sort((a, b) => b.date - a.date);   // 最新在前
};

export const fmtClock = (s) => {
    const v = Math.max(0, Math.round(s || 0));
    const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), sec = v % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
};
export const fmtPace = (s) => (s > 0 ? `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"` : '—');

// ══════════════════════════════════════════════════════════════════════════
// ② 里程碑 —— 已達成的，以及「下一個還差多少」
//
// 「下一個」是這個系統最重要的設計：只列已達成會讓人停在過去，
// 給下一個門檻才會讓人想繼續。而且進度條是真的算出來的，不是裝飾。
// ══════════════════════════════════════════════════════════════════════════

const RUN_DISTANCE_MILESTONES = [3, 5, 10, 15, 21.0975, 30, 42.195];
const RUN_TOTAL_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
const STRENGTH_COUNT_MILESTONES = [1, 5, 10, 25, 50, 100, 200];
const STRENGTH_TONS_MILESTONES = [1, 5, 10, 25, 50, 100, 250];

const mk = (id, label, note, achieved, at, progress, remainText) => ({
    id, label, note, achieved, at, progress, remainText,
});

/**
 * @returns {{ achieved:Array, next:Array, achievedCount:number }}
 */
export const buildMilestones = ({ runs = [], workouts = [], inbody = [], events = [] } = {}) => {
    const list = [];

    // ── 跑步：單次最遠 ──
    const runKm = (r) => n(r.distance ?? r.distance_km ?? r.metrics?.distance_km ?? r.metrics?.distance);
    const runsSorted = [...runs].sort(
        (a, b) => new Date(a.date || a.timestamp || a.created_at || 0) - new Date(b.date || b.timestamp || b.created_at || 0)
    );
    const longestKm = runsSorted.length ? Math.max(...runsSorted.map(runKm)) : 0;
    for (const m of RUN_DISTANCE_MILESTONES) {
        const hit = runsSorted.find((r) => runKm(r) >= m);
        const label = m === 21.0975 ? '首次半程馬拉松' : m === 42.195 ? '首次全程馬拉松' : `首次跑到 ${m} 公里`;
        list.push(mk(
            `run-dist-${m}`, label, '單次距離',
            !!hit,
            hit ? new Date(hit.date || hit.timestamp || hit.created_at) : null,
            Math.min(1, longestKm / m),
            longestKm > 0 ? `再 ${(m - longestKm).toFixed(1)} 公里` : `目標 ${m} 公里`,
        ));
    }

    // ── 跑步：累積里程 ──
    let cum = 0;
    const cumHits = {};
    for (const r of runsSorted) {
        cum += runKm(r);
        for (const m of RUN_TOTAL_MILESTONES) {
            if (!cumHits[m] && cum >= m) cumHits[m] = new Date(r.date || r.timestamp || r.created_at);
        }
    }
    for (const m of RUN_TOTAL_MILESTONES) {
        list.push(mk(
            `run-total-${m}`, `累積 ${m} 公里`, '跑步總里程',
            !!cumHits[m], cumHits[m] || null,
            Math.min(1, cum / m),
            `再 ${Math.max(0, m - cum).toFixed(1)} 公里`,
        ));
    }

    // ── 重訓：次數 ──
    const wSorted = [...workouts].sort(
        (a, b) => new Date(a.timestamp || a.date || 0) - new Date(b.timestamp || b.date || 0)
    );
    for (const m of STRENGTH_COUNT_MILESTONES) {
        const hit = wSorted[m - 1];
        list.push(mk(
            `str-count-${m}`, m === 1 ? '第一次重訓' : `第 ${m} 次重訓`, '訓練次數',
            !!hit, hit ? new Date(hit.timestamp || hit.date) : null,
            Math.min(1, wSorted.length / m),
            `再 ${Math.max(0, m - wSorted.length)} 次`,
        ));
    }

    // ── 重訓：累積噸數 ──
    const volOf = sessionVolume; // 同一份邏輯已收進 strengthMath，不再各自維護
    let cumT = 0;
    const tonHits = {};
    for (const w of wSorted) {
        cumT += volOf(w) / 1000;
        for (const m of STRENGTH_TONS_MILESTONES) {
            if (!tonHits[m] && cumT >= m) tonHits[m] = new Date(w.timestamp || w.date);
        }
    }
    for (const m of STRENGTH_TONS_MILESTONES) {
        list.push(mk(
            `str-ton-${m}`, `累積舉起 ${m} 噸`, '總負重',
            !!tonHits[m], tonHits[m] || null,
            Math.min(1, cumT / m),
            `再 ${Math.max(0, m - cumT).toFixed(1)} 噸`,
        ));
    }

    // ── 身體：第一筆量測 ──
    if (inbody.length > 0) {
        const first = [...inbody].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
        list.push(mk('body-first', '建立身體基準', '身體數據', true, new Date(first.date), 1, ''));
    } else {
        list.push(mk('body-first', '建立身體基準', '身體數據', false, null, 0, '量第一筆 InBody'));
    }

    // ── 連續性：最長連續訓練天數 ──
    const streak = computeStreaks(events);
    for (const m of [3, 7, 14, 30]) {
        list.push(mk(
            `streak-${m}`, `連續 ${m} 天有訓練`, '習慣養成',
            streak.longest >= m, null,
            Math.min(1, streak.longest / m),
            `目前最長 ${streak.longest} 天`,
        ));
    }

    const achieved = list.filter((x) => x.achieved).sort((a, b) => (b.at || 0) - (a.at || 0));
    // 「下一個」只給進度最高的 3 個 —— 給希望，不給壓力清單
    const next = list
        .filter((x) => !x.achieved)
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 3);

    return { achieved, next, achievedCount: achieved.length, total: list.length };
};

// ══════════════════════════════════════════════════════════════════════════
// ③ 熱力圖 + 連續天數
// ══════════════════════════════════════════════════════════════════════════

/** 最長 / 目前連續有訓練的天數 */
export const computeStreaks = (events = []) => {
    const days = [...new Set(events.map((e) => e.dayKey).filter(Boolean))].sort();
    if (days.length === 0) return { longest: 0, current: 0, activeDays: 0 };

    let longest = 1, run = 1;
    for (let i = 1; i < days.length; i++) {
        const prev = new Date(days[i - 1]);
        const cur = new Date(days[i]);
        const gap = Math.round((cur - prev) / 86400000);
        if (gap === 1) { run += 1; longest = Math.max(longest, run); }
        else run = 1;
    }

    // 目前連續：從今天（或昨天）往回數
    const todayK = dayKey(new Date());
    const yestK = dayKey(new Date(Date.now() - 86400000));
    let current = 0;
    if (days.includes(todayK) || days.includes(yestK)) {
        let cursor = days.includes(todayK) ? new Date(todayK) : new Date(yestK);
        const set = new Set(days);
        while (set.has(dayKey(cursor))) {
            current += 1;
            cursor = new Date(cursor.getTime() - 86400000);
        }
    }
    return { longest, current, activeDays: days.length };
};

/**
 * 近 N 週的熱力圖格子（GitHub 風），每格帶當天的紀錄。
 * @returns {{ weeks: Array<Array<{dayKey, date, level, events}>>, maxLevel:number }}
 */
export const buildHeatmap = (events = [], weeks = 20) => {
    const byDay = {};
    for (const e of events) {
        if (!e.dayKey) continue;
        (byDay[e.dayKey] = byDay[e.dayKey] || []).push(e);
    }

    // 對齊到「本週日」為最後一欄
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));   // 本週日（週一為始）

    const cols = [];
    for (let w = weeks - 1; w >= 0; w--) {
        const col = [];
        for (let d = 0; d < 7; d++) {
            const cur = new Date(end);
            cur.setDate(end.getDate() - (w * 7) - (6 - d));
            const k = dayKey(cur);
            const evs = byDay[k] || [];
            col.push({
                dayKey: k,
                date: cur,
                level: evs.length === 0 ? 0 : Math.min(3, evs.length),
                events: evs,
                isFuture: cur > today,
            });
        }
        cols.push(col);
    }
    return { weeks: cols };
};

// ══════════════════════════════════════════════════════════════════════════
// ④ 正向總結 —— 把整段歷程翻成一句人話
// ══════════════════════════════════════════════════════════════════════════

/**
 * 給頁面頂部的一句話。永遠正向，但永遠對得回真實數字。
 */
export const buildJourneySummary = ({ events = [], runs = [], workouts = [], joinDays = 0 } = {}) => {
    const streak = computeStreaks(events);
    const totalSessions = events.filter((e) => e.kind !== 'inbody').length;

    if (totalSessions === 0) {
        return {
            headline: '故事從第一筆開始。',
            body: '這一頁會記錄你每一次出現 —— 跑過的每一公里、舉起的每一公斤。現在還是空的，但那只代表你正站在起點。',
            stats: [],
        };
    }

    const runKm = (r) => n(r.distance ?? r.distance_km ?? r.metrics?.distance_km ?? r.metrics?.distance);
    const totalKm = runs.reduce((s, r) => s + runKm(r), 0);
    const totalSec = events
        .filter((e) => e.kind === 'run')
        .reduce((s, e) => s + n(e.raw?.duration ?? e.raw?.duration_sec ?? e.raw?.metrics?.duration_seconds), 0);
    const hours = totalSec / 3600;

    // 出席率：加入天數中有幾天真的有出現
    const rate = joinDays > 0 ? streak.activeDays / joinDays : 0;

    let headline;
    if (streak.current >= 3) headline = `連續第 ${streak.current} 天。`;
    else if (streak.longest >= 7) headline = `你最長連過 ${streak.longest} 天。`;
    else if (totalSessions >= 20) headline = `${totalSessions} 次出現。`;
    else headline = `已經累積 ${totalSessions} 次。`;

    const bits = [];
    if (totalKm >= 1) bits.push(`跑了 ${totalKm.toFixed(1)} 公里`);
    if (hours >= 0.5) bits.push(`花了 ${hours.toFixed(1)} 小時在路上`);
    if (workouts.length > 0) bits.push(`練了 ${workouts.length} 次重訓`);

    const body = bits.length
        ? `${joinDays} 天裡，你${bits.join('、')}。這些不是別人給的數字 —— 每一筆都是你自己走出來的。`
        : `${joinDays} 天裡，你出現了 ${streak.activeDays} 次。持續本身就是一種能力。`;

    return {
        headline,
        body,
        stats: [
            { l: '出席天數', v: streak.activeDays, u: '天' },
            { l: '最長連續', v: streak.longest, u: '天' },
            { l: '總時數', v: hours >= 1 ? hours.toFixed(1) : '—', u: hours >= 1 ? '小時' : '' },
        ],
        streak,
        rate,
    };
};

export default {
    buildEventStream, buildMilestones, buildHeatmap, computeStreaks, buildJourneySummary,
    fmtClock, fmtPace,
};

// ══════════════════════════════════════════════════════════════════════════
// ⑤ 時間桶 —— 資料一多，圖表自動從「逐筆」升級到「週」再升到「月」
//
// 使用者要求：「這些圖表你都要根據紀錄數據數量去改變顯示範圍，
//   譬如說數據變幾筆之後就變成以周來顯示趨勢，再來就是月。」
//
// 為什麼一定要做：50 筆紀錄硬塞進 350px 寬，X 軸會出現 7/1 7/1 7/1 三個一樣的標籤，
// 線也會擠成毛毛蟲 —— 那不叫趨勢圖，那叫雜訊圖。
// ══════════════════════════════════════════════════════════════════════════

export const mdLabel = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

/** 依筆數決定顆粒度：≤12 逐筆 / ≤40 每週 / 更多 每月 */
export const bucketMode = (n) => (n <= 12 ? 'session' : n <= 40 ? 'week' : 'month');
export const bucketModeZh = (m) => (m === 'session' ? '每一次' : m === 'week' ? '每週' : '每月');

const weekStart = (d) => {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // 週一為一週之始（與課表一致）
    return x;
};
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * 把 [{date, v}] 依筆數自動分桶。
 * @param {Array<{date:Date, v:number}>} points
 * @param {{agg:'sum'|'avg'|'last'|'max', mode?:string}} opts
 *        agg='last' 給累積型序列（桶內取最後一筆，曲線才不會倒退）
 * @returns {{ mode, modeZh, points:[{date,label,v,n}] }}
 */
export const bucketize = (points = [], { agg = 'sum', mode } = {}) => {
    const list = points
        .filter((p) => p && p.date instanceof Date && !Number.isNaN(p.date.getTime()) && Number.isFinite(p.v))
        .sort((a, b) => a.date - b.date);
    const m = mode || bucketMode(list.length);

    if (m === 'session') {
        return {
            mode: m, modeZh: bucketModeZh(m),
            points: list.map((p) => ({ date: p.date, label: mdLabel(p.date), v: p.v, n: 1 })),
        };
    }

    const keyOf = m === 'week' ? weekStart : monthStart;
    const groups = new Map();
    for (const p of list) {
        const k = keyOf(p.date).getTime();
        if (!groups.has(k)) groups.set(k, { date: new Date(k), vals: [] });
        groups.get(k).vals.push(p.v);
    }
    const out = [...groups.values()].sort((a, b) => a.date - b.date).map((g) => {
        const vals = g.vals;
        const v = agg === 'last' ? vals[vals.length - 1]
            : agg === 'avg' ? vals.reduce((s, x) => s + x, 0) / vals.length
                : agg === 'max' ? Math.max(...vals)
                    : vals.reduce((s, x) => s + x, 0);
        return {
            date: g.date,
            label: m === 'week' ? mdLabel(g.date) : `${g.date.getMonth() + 1}月`,
            v: Math.round(v * 100) / 100,
            n: vals.length,
        };
    });
    return { mode: m, modeZh: bucketModeZh(m), points: out };
};

/** 找出序列的高點（給圖表上方的「最高」標記用） */
export const peakOf = (points = []) => {
    if (!points.length) return null;
    let best = points[0];
    for (const p of points) if (p.v > best.v) best = p;
    return best;
};

// ══════════════════════════════════════════════════════════════════════════
// ⑥ 配速可比性 —— 只拿「同一個距離區間」的跑步來看趨勢
//
// 使用者要求：「配速趨勢可以訂在使用者平均最長跑步的里程，例如 5 公里區間
//   或者 10 公里區間平均配速，根據使用者最常跑步里程。」
//
// 這是專業上唯一正確的做法：3K 衝刺跟 15K 長跑的配速本來就不該畫在同一條線上，
// 混在一起的「進步」多半只是那週剛好跑得比較短。
// ══════════════════════════════════════════════════════════════════════════

export const RUN_BANDS = [
    { id: 'b3', min: 0, max: 3.5, label: '3K 區間' },
    { id: 'b5', min: 3.5, max: 6.5, label: '5K 區間' },
    { id: 'b8', min: 6.5, max: 9, label: '8K 區間' },
    { id: 'b10', min: 9, max: 13, label: '10K 區間' },
    { id: 'b15', min: 13, max: 18, label: '15K 區間' },
    { id: 'bhalf', min: 18, max: 26, label: '半馬區間' },
    { id: 'blong', min: 26, max: Infinity, label: '超長距離' },
];

export const bandOf = (km) => RUN_BANDS.find((b) => km >= b.min && km < b.max) || RUN_BANDS[0];

/**
 * 挑出使用者「最常跑」的距離區間 —— 用「中位數距離」判定。
 *
 * 🐛 之前的做法是「各區間投票、平手時取較長的那段」，結果只跑過 10K 的人
 *    會被判成 15K 區間（幾個區間各 1 票平手 → 規則挑最長）。
 *    中位數不會被少數的長跑或短跑帶走，才是真正的「你平常跑多遠」。
 *
 * @param {Array<{km:number}>} runs
 * @returns {{band, count, share, median}|null}
 */
export const pickPaceBand = (runs = []) => {
    const kms = runs.map((r) => Number(r?.km) || 0).filter((k) => k > 0.3).sort((a, b) => a - b);
    if (kms.length === 0) return null;
    const median = kms[Math.floor(kms.length / 2)];

    const band = bandOf(median);
    const inBand = kms.filter((k) => k >= band.min && k < band.max);
    if (inBand.length >= 3) {
        return { band, count: inBand.length, share: inBand.length / kms.length, median };
    }

    // 該區間樣本太少 → 改用「中位數 ±25%」的距離窗，標題直接寫實際公里數
    const lo = median * 0.75, hi = median * 1.25;
    const win = kms.filter((k) => k >= lo && k <= hi);
    return {
        band: { id: 'win', min: lo, max: hi, label: `約 ${median.toFixed(median >= 10 ? 0 : 1)} 公里` },
        count: win.length, share: win.length / kms.length, median,
    };
};

// ══════════════════════════════════════════════════════════════════════════
// ⑦ 城市燈火 —— 「你來過的每一天」的天際線
//
// 使用者要求：「用城市剪影去做出燈火，每個燈火都要標上一個月份加上日子」
//   「越多天就越亮」。
//
// 設計：一天一棟樓。有出現 → 高樓、窗戶亮燈、標上日期；沒出現 → 矮房、暗的。
//   整座城的亮度 (glow) 隨「總出席天數 / 目前連續天數」提升 ——
//   你越常來，這座城就越亮。這比一格一格的方塊有情感重量得多。
// ══════════════════════════════════════════════════════════════════════════

const hash01 = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
};

/**
 * @param {Array} events buildEventStream 的輸出
 * @param {number} days  要畫幾天（預設 120 天）
 * @param {Object} landmarks { [dayKey]: { type:'taipei101'|'eiffel'|'tokyo'|'bigben', title } }
 * @returns {{ buildings:Array, glow:number, activeDays:number, streak:object }}
 */
export const buildSkyline = (events = [], days = 120, landmarks = {}) => {
    const byDay = {};
    for (const e of events) { if (e.dayKey) (byDay[e.dayKey] = byDay[e.dayKey] || []).push(e); }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buildings = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const k = dayKey(d);
        const evs = byDay[k] || [];
        const rnd = hash01(k);
        const act = evs.length;
        const kinds = [...new Set(evs.map((e) => e.kind))];
        buildings.push({
            dayKey: k,
            date: d,
            label: mdLabel(d),
            events: evs,
            active: act > 0,
            kinds,
            // 有出現 → 高樓；沒出現 → 矮房。同一天永遠同高度（hash 決定），天際線才穩定。
            height: act > 0
                ? Math.min(1, 0.52 + Math.min(0.34, act * 0.13) + rnd * 0.14)
                : 0.10 + rnd * 0.16,
            windows: act > 0 ? Math.min(8, 2 + act * 2) : 0,
            isToday: i === 0,
            // 🗼 地標日：那一天做了值得被記住的事 → 蓋一棟認得出來的建築
            landmark: act > 0 ? (landmarks[k] || null) : null,
        });
    }

    const streak = computeStreaks(events);
    const activeInRange = buildings.filter((b) => b.active).length;
    // 🔆 越多天就越亮：出席密度（0–1）＋ 連續天數加成，最後夾在 0.28–1
    const density = activeInRange / Math.max(1, days);
    const glow = Math.max(0.28, Math.min(1, density * 2.6 + Math.min(0.3, streak.current * 0.04)));

    return { buildings, glow, activeDays: activeInRange, streak };
};

// ══════════════════════════════════════════════════════════════════════════
// ⑧ 城市月曆 —— 一個月一排的天際線
//
// 使用者要求：「日期改成每一月一排，可以去調整第一年第一月之類的，
//   這樣才能多一點；每月的紀錄為一季去做每個建築不同的變化。」
//
// 為什麼一個月一排比橫向長捲好：
//   • 月份資訊移到「排標題」→ 樓下只要標日，7px 也放得下（燈火仍然有名字）
//   • 一排 = 一個月，看得出「這個月的城市長什麼樣」，月與月之間可以互相比較
//   • 不用橫向捲 300 天，可以直接跳到第一年第一月
//
// 季度變化：Q1 冬春 / Q2 春夏 / Q3 盛夏 / Q4 秋冬 —— 屋頂造型與燈色各不相同，
//   捲下來會看到城市隨季節換裝，那是「時間真的過去了」最直觀的證據。
// ══════════════════════════════════════════════════════════════════════════

/**
 * @param {Array}  events    buildEventStream 的輸出
 * @param {Object} landmarks { [dayKey]: { type, title } }
 * @returns {{ years:number[], months:Array, firstDate:Date|null }}
 */
export const buildCityMonths = (events = [], landmarks = {}) => {
    const byDay = {};
    for (const e of events) { if (e.dayKey) (byDay[e.dayKey] = byDay[e.dayKey] || []).push(e); }
    const keys = Object.keys(byDay).sort();
    if (keys.length === 0) return { years: [], months: [], firstDate: null };

    const firstDate = new Date(keys[0]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayK = dayKey(today);

    const months = [];
    const cur = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    let guard = 0;
    while (cur <= today && guard++ < 600) {
        const y = cur.getFullYear();
        const m = cur.getMonth();
        const dim = new Date(y, m + 1, 0).getDate();
        const cells = [];
        for (let d = 1; d <= dim; d++) {
            const dt = new Date(y, m, d);
            const k = dayKey(dt);
            const evs = byDay[k] || [];
            const rnd = hash01(k);
            const act = evs.length;
            cells.push({
                dayKey: k, date: dt, day: d, events: evs,
                active: act > 0,
                kinds: [...new Set(evs.map((e) => e.kind))],
                height: act > 0
                    ? Math.min(1, 0.50 + Math.min(0.36, act * 0.14) + rnd * 0.14)
                    : 0.10 + rnd * 0.15,
                windows: act > 0 ? Math.min(7, 2 + act * 2) : 0,
                isToday: k === todayK,
                isFuture: dt > today,
                landmark: act > 0 ? (landmarks[k] || null) : null,
            });
        }
        const activeDays = cells.filter((c) => c.active).length;
        months.push({
            key: `${y}-${String(m + 1).padStart(2, '0')}`,
            year: y, month: m + 1,
            quarter: Math.floor(m / 3) + 1,
            label: `${String(m + 1).padStart(2, '0')} 月`,
            cells, activeDays, daysInMonth: dim,
            // 這個月的亮度：出席密度（一個月來 15 天就接近全亮）
            glow: Math.max(0.22, Math.min(1, (activeDays / dim) * 2.4)),
        });
        cur.setMonth(cur.getMonth() + 1);
    }

    return { years: [...new Set(months.map((x) => x.year))], months, firstDate };
};
