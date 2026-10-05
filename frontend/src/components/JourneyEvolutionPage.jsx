import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileDown, Check, ChevronDown } from 'lucide-react';
import { canUse, openPaywall } from '../utils/membership';
import {
    ResponsiveContainer, ComposedChart, Area, LineChart, Line,
    BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts';
import apiClient, { getWorkoutHistory } from '../api/client';
import { getUserId } from '../utils/auth';
import { reconcileJoinDate, storedJoinDate, joinDaysFrom } from '../utils/journeyJoinDate';
import { toast } from '../utils/toast';
import { haptic } from '../utils/haptics';
import { recordFirst } from '../utils/momentEngine';
import { SWISS, TYPE, displaySize } from '../utils/swissUI';
import {
    buildEventStream, buildHeatmap, buildCityMonths, computeStreaks, buildJourneySummary,
    bucketize, peakOf, pickPaceBand,
} from '../utils/journeyHistory';
import { deltaOf, gainedMuscle, lostFat } from '../utils/bodyProgress';
import { buildPlaces, placeDetail } from '../utils/journeyPlaces';
import { CityLights, HistoryTimeline, Rolling, Reveal } from './journey/JourneyHistoryKit';

/**
 * 🛤️ JourneyEvolutionPage — 「進化日誌 · Evolution Log」（變強的第 N 天）
 * ─────────────────────────────────────────────────────────────────────
 * 這一頁只做一件事：讓使用者看見自己的「歷史進步趨勢」，並為此感到驕傲。
 *
 * 為什麼不放里程碑 / 完整度：
 *   里程碑已經有徽章系統在管，重複放會稀釋兩邊；
 *   完整度是「評分」的語氣，跟這一頁「回顧與肯定」的語氣互相打架。
 *   這一頁的貨幣是「趨勢線」，不是「清單」。
 *
 * 四個層次：
 *   01 整體總覽 —— 累積了什麼 ＋ 月度節奏（你每個月出現的樣子）
 *   ✦ 大膽數據帶 —— 全頁最有份量的一個數字，用海報級尺度砸出來
 *   02 出席趨勢 —— 你真的來過這麼多次（可點的熱力圖）
 *   03 系統趨勢 —— 重訓 / 跑步 / 身體 各自的完整趨勢圖表
 *   ＋ 完整紀錄（預設收合，要看細節才展開，不搶趨勢的版面）
 *
 * 原則：
 *   1. 只放真實紀錄 — 每格數據都能對回原始 session。
 *   2. 「沒進步不亂顯示」— 進步型指標只有真的變好才出現；
 *      累積型指標誠實照放，並配「有感換算」放大回饋感。
 *   3. 趨勢優先於數字：能畫成線的就不要只寫成字。
 *   4. 一鍵匯出 A4 趨勢分析報告（utils/journeyPdf）。
 */

const C = {
    paper: SWISS.paper, ink: SWISS.ink, coral: SWISS.coral,
    muted: 'rgba(22,20,21,0.45)', faint: 'rgba(22,20,21,0.30)',
    hair: 'rgba(22,20,21,0.10)',
};
// 🌫 Misty Grey — 「那個月你沒做這件事」的量體。留白會被讀成「沒資料」，灰塊才講得出事實。
const MIST = 'rgba(22,20,21,0.11)';
const EASE = [0.16, 1, 0.3, 1];

const fmtPace = (sec) => {
    if (!sec || !isFinite(sec) || sec <= 0) return '—';
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return `${m}'${String(s).padStart(2, '0')}"`;
};

// ── 有感換算（成就感放大器：把抽象數字翻成看得見的畫面）───────────────
const tonsEquiv = (tons) => {
    if (!tons || tons <= 0) return null;
    if (tons < 4.5) {
        const cars = tons / 1.5;                       // 一台小客車 ≈ 1.5 t
        return cars >= 0.9 ? `≈ 舉起 ${cars.toFixed(1)} 台汽車` : null;
    }
    return `≈ 舉起 ${(tons / 5).toFixed(1)} 頭非洲象`;  // 一頭非洲象 ≈ 5 t
};
const kmEquiv = (km) => {
    if (!km || km <= 0) return null;
    if (km >= 300) return `≈ 台北 → 高雄 ${(km / 350 * 100).toFixed(0)}%`;
    return `≈ 操場 ${Math.round(km / 0.4)} 圈`;
};
const elevEquiv = (m) => (m > 400 ? `≈ ${(m / 508).toFixed(1)} 座台北 101` : null);
const fmtGainTime = (sec) => {
    const s = Math.round(sec);
    if (s < 60) return `${s} 秒`;
    return `${Math.floor(s / 60)} 分 ${s % 60 ? `${s % 60} 秒` : ''}`.trim();
};

// ── 資料萃取 helpers（容錯欄位別名）────────────────────────────────
const runKm = (r) => Number(r.distance ?? r.distance_km ?? r.metrics?.distance_km ?? r.metrics?.distance ?? 0) || 0;
const runSec = (r) => Number(r.duration ?? r.duration_sec ?? r.metrics?.duration_seconds ?? r.metrics?.duration ?? 0) || 0;
const runElev = (r) => Number(r.metrics?.elevationGain ?? r.metrics?.elevation_gain ?? r.elevationGain ?? 0) || 0;
const runDate = (r) => new Date(r.date || r.timestamp || r.created_at || 0);
const runPace = (r) => {
    const direct = Number(r.avg_pace ?? r.avgPace ?? r.metrics?.avg_pace ?? r.metrics?.pace_per_km ?? r.metrics?.avgPace ?? 0);
    if (direct > 120 && direct < 1200) return direct;
    const km = runKm(r), sec = runSec(r);
    return km > 0.3 && sec > 0 ? sec / km : null;
};
const sportOf = (s) => String(s?.sport || s?.sport_type || s?.type || 'running').toLowerCase();
const RUN_SPORTS = new Set(['running', 'run', 'free', 'trail_running', 'trail']);

const setWeight = (s) => (parseFloat(s?.weight) || 0);
const exSets = (ex) => ex?.detailedSets
    || (Array.isArray(ex?.sets) && ex.sets.length && typeof ex.sets[0] === 'object' ? ex.sets : []);
const calcVol = (w) => {
    const fromSets = (w.exercises || []).reduce((acc, ex) =>
        acc + exSets(ex).reduce((v, s) => v + setWeight(s) * (parseFloat(s.reps) || 0), 0), 0);
    return Number(w.total_volume ?? w.volume ?? 0) || fromSets;
};
const mdLabel = (d) => d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });

// ── 🧹 內容指紋去重 ────────────────────────────────────────────────
// 同一次跑步/訓練被存成多筆（重複送出、離線補傳、同步回填）在真實資料裡很常見，
// 每一筆都有自己的 session_id，所以只靠 id 去重抓不到。
// 指紋 = 時間（到分鐘）＋ 距離 ＋ 時長：兩次真正不同的訓練不可能三項全等。
// 不去重的後果：里程、噸數被灌水，配速趨勢變成一條平線 —— 這一頁的每個數字都會失真。
const dedupeBy = (list, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const x of list) {
        const k = keyFn(x);
        if (k == null) { out.push(x); continue; }
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(x);
    }
    return out;
};

// ═══════════════════════════════════════════════════════════════════
export default function JourneyEvolutionPage() {
    const navigate = useNavigate();
    const [userId] = useState(() => getUserId());
    const [loading, setLoading] = useState(true);
    const [cardioSessions, setCardioSessions] = useState([]);
    const [workouts, setWorkouts] = useState([]);
    const [joinDays, setJoinDays] = useState(() => {
        const j = storedJoinDate(userId);
        return j ? joinDaysFrom(j) : 1;
    });
    const [exporting, setExporting] = useState(false);
    const [exported, setExported] = useState(false);
    const [sysTab, setSysTab] = useState('strength');      // strength / running / body
    const [showLog, setShowLog] = useState(false);
    const [logFilter, setLogFilter] = useState('all');

    // InBody（本機，與營養/健身預測同一資料源）
    const inbody = useMemo(() => {
        try {
            const raw = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
            return (Array.isArray(raw) ? raw : [])
                .map((r) => {
                    const w = Number(r.weight_kg ?? r.weight) || null;
                    return {
                        date: new Date(r.measurement_date || r.date || r.created_at || 0),
                        w,
                        weight: w,   // buildEventStream 用 weight 這個欄位名
                        smm: Number(r.smm ?? r.skeletal_muscle_mass ?? r.muscle_mass) || null,
                        bf: Number(r.body_fat_percent ?? r.body_fat_percentage) || null,
                    };
                })
                .filter((r) => !isNaN(r.date) && r.date.getTime() > 0)
                .sort((a, b) => a.date - b.date);
        } catch { return []; }
    }, [userId]);

    useEffect(() => {
        let alive = true;
        (async () => {
            const [cardioRes, wRes] = await Promise.allSettled([
                apiClient.get(`/api/cardio/sessions/${userId}?limit=300`),
                getWorkoutHistory(userId, 300),
            ]);
            if (!alive) return;
            if (cardioRes.status === 'fulfilled') {
                const list = (cardioRes.value?.data?.sessions || []).filter((r) => runKm(r) > 0.05);
                setCardioSessions(dedupeBy(list, (r) => {
                    const t = runDate(r).getTime();
                    if (!t) return null;
                    return `${Math.round(t / 60000)}|${runKm(r).toFixed(2)}|${Math.round(runSec(r))}`;
                }));
            }
            if (wRes.status === 'fulfilled') {
                const list = wRes.value?.history || (Array.isArray(wRes.value) ? wRes.value : []);
                const clean = list
                    .map((w) => ({ ...w, _d: new Date(w.timestamp || w.date || 0) }))
                    .filter((w) => !isNaN(w._d) && w._d.getTime() > 0);
                setWorkouts(dedupeBy(clean, (w) =>
                    `${Math.round(w._d.getTime() / 60000)}|${Math.round(calcVol(w))}|${(w.exercises || []).length}`
                ).sort((a, b) => a._d - b._d));
            }
            setLoading(false);
            try {
                const join = await reconcileJoinDate(userId);
                if (alive && join) setJoinDays(joinDaysFrom(join));
            } catch { /* 校正失敗 → 沿用現值 */ }
        })();
        return () => { alive = false; };
    }, [userId]);

    const runs = useMemo(
        () => cardioSessions.filter((s) => RUN_SPORTS.has(sportOf(s))),
        [cardioSessions]
    );

    // ══ 歷史資料層（三系統合流）════════════════════════════════════
    const events = useMemo(() => buildEventStream({ runs, workouts, inbody }), [runs, workouts, inbody]);
    const streaks = useMemo(() => computeStreaks(events), [events]);
    const heatmap = useMemo(() => buildHeatmap(events, 20), [events]);      // PDF 報告仍用方格版
    const summary = useMemo(
        () => buildJourneySummary({ events, runs, workouts, joinDays }),
        [events, runs, workouts, joinDays]
    );

    // ── 📈 月度節奏：你每個月「出現的樣子」──────────────────────────
    //    這是全頁唯一的跨系統趨勢圖 —— 看的不是強度，是你有沒有一直在。
    const monthly = useMemo(() => {
        const m = {};
        const touch = (d) => {
            const k = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!m[k]) m[k] = { key: k, label: `${d.getMonth() + 1}月`, 重訓: 0, 跑步: 0, vol: 0, km: 0, paceSum: 0, paceN: 0 };
            return m[k];
        };
        workouts.forEach((w) => { const c = touch(w._d); c.重訓 += 1; c.vol += calcVol(w); });
        runs.forEach((r) => {
            const c = touch(runDate(r));
            c.跑步 += 1; c.km += runKm(r);
            const p = runPace(r);
            if (p) { c.paceSum += p; c.paceN += 1; }
        });
        const rows = Object.values(m)
            .sort((a, b) => (a.key < b.key ? -1 : 1))
            .slice(-12)
            .map((c) => ({ ...c, tons: +(c.vol / 1000).toFixed(1), km: +c.km.toFixed(1), pace: c.paceN ? Math.round(c.paceSum / c.paceN) : null }));
        // 🌫 沒跑步的月份也要有一塊同造型的量體（Misty Grey）——
        //    空白會讓人以為「那個月沒資料」，灰塊才講得出「那個月你沒跑」。
        const maxTotal = Math.max(1, ...rows.map((r) => r.重訓 + r.跑步));
        const ghost = Math.max(0.6, Math.round(maxTotal * 0.14 * 10) / 10);
        return rows.map((r) => ({
            ...r,
            未跑: r.跑步 === 0 ? ghost : 0,
            未重訓: r.重訓 === 0 ? ghost : 0,
        }));
    }, [workouts, runs]);

    // 月度節奏 / 每月訓練量的高點（標在圖表上方）
    const monthPeak = useMemo(() => {
        if (monthly.length < 2) return null;
        const best = monthly.reduce((a, b) => ((b.重訓 + b.跑步) > (a.重訓 + a.跑步) ? b : a));
        const total = best.重訓 + best.跑步;
        return total > 0 ? { value: total, unit: '次', at: best.key } : null;
    }, [monthly]);
    const tonsPeak = useMemo(() => {
        if (!monthly.some((m) => m.tons > 0)) return null;
        const best = monthly.reduce((a, b) => (b.tons > a.tons ? b : a));
        return { value: best.tons, unit: 't', at: best.key };
    }, [monthly]);

    // ── 系統 1：重訓 ───────────────────────────────────────────────
    const strength = useMemo(() => {
        if (workouts.length === 0) return null;
        const totalVolume = workouts.reduce((s, w) => s + calcVol(w), 0);
        const prCount = workouts.reduce((s, w) => {
            let pr = w.pr_alerts;
            if (typeof pr === 'string') { try { pr = JSON.parse(pr); } catch { pr = []; } }
            return s + (Array.isArray(pr) ? pr.length : 0);
        }, 0);
        const totalHardSets = workouts.reduce((s, w) => s + (Number(w.hard_sets) || 0), 0);
        let bestSession = null;
        workouts.forEach((w) => {
            const v = calcVol(w);
            if (v > 0 && (!bestSession || v > bestSession.volume)) bestSession = { volume: v, date: w._d };
        });

        // 每個動作的完整重量軌跡（不只首末兩點 —— 趨勢要看得到過程）
        const lifts = {};
        workouts.forEach((w) => {
            (w.exercises || []).forEach((ex) => {
                const name = ex.name || ex.exercise_name;
                if (!name) return;
                const maxW = Math.max(0, ...exSets(ex).map(setWeight));
                if (maxW <= 0) return;
                if (!lifts[name]) lifts[name] = { first: maxW, best: maxW, count: 1, firstDate: w._d, bestDate: w._d, points: [] };
                else {
                    if (maxW > lifts[name].best) { lifts[name].best = maxW; lifts[name].bestDate = w._d; }
                    lifts[name].count += 1;
                }
                lifts[name].points.push({ label: mdLabel(w._d), kg: maxW });
            });
        });
        // 🩹 沒進步不顯示：只留「真的變重」的動作，依成長幅度排序
        const improvedLifts = Object.entries(lifts)
            .filter(([, v]) => v.count >= 2 && v.best > v.first)
            .map(([name, v]) => ({
                name, from: v.first, to: v.best,
                gainKg: +(v.best - v.first).toFixed(1),
                gainPct: Math.round(((v.best - v.first) / v.first) * 100),
                sessions: v.count,
                spanDays: Math.max(1, Math.round((v.bestDate - v.firstDate) / 86400000)),
                points: v.points,
            }))
            .sort((a, b) => b.gainPct - a.gainPct)
            .slice(0, 5);

        // 累積總負重曲線 —— 只會往上，沒有一次訓練會消失
        //    agg='last'：桶內取最後一筆，累積線才不會被平均拉回去
        let cum = 0;
        const cumRaw = workouts.map((w) => {
            cum += calcVol(w);
            return { date: w._d, v: +(cum / 1000).toFixed(2) };
        });
        const cumB = bucketize(cumRaw, { agg: 'last' });

        return {
            count: workouts.length,
            totalTons: +(totalVolume / 1000).toFixed(1),
            prCount, totalHardSets, bestSession, improvedLifts,
            cum: { ...cumB, data: cumB.points.map((p) => ({ label: p.label, 累積: p.v })), peak: peakOf(cumB.points) },
        };
    }, [workouts]);

    // ── 系統 2：跑步 ───────────────────────────────────────────────
    const running = useMemo(() => {
        if (runs.length === 0) return null;
        const sorted = [...runs].sort((a, b) => runDate(a) - runDate(b));
        const paced = sorted.map((r) => ({ r, pace: runPace(r) })).filter((x) => x.pace);
        const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x.pace, 0) / arr.length : null);
        const earlyPace = avg(paced.slice(0, 5));
        const recentPace = avg(paced.slice(-5));
        const totalKm = +(sorted.reduce((s, r) => s + runKm(r), 0).toFixed(1));
        const totalElev = Math.round(sorted.reduce((s, r) => s + runElev(r), 0));
        let longest = null;
        sorted.forEach((r) => {
            const km = runKm(r);
            if (!longest || km > longest.km) longest = { km: +km.toFixed(1), date: runDate(r) };
        });
        // 最快的一次（配速最小）—— 給天際線的「比薩斜塔」用
        let fastest = null;
        paced.forEach((x) => { if (!fastest || x.pace < fastest.pace) fastest = { pace: x.pace, date: runDate(x.r) }; });
        // 累積里程（agg='last'：只會往上）
        let cum = 0;
        const cumRaw = sorted.map((r) => { cum += runKm(r); return { date: runDate(r), v: +cum.toFixed(1) }; });
        const cumB = bucketize(cumRaw, { agg: 'last' });

        // 單次距離（分桶後 agg='sum' = 該週/該月總里程，語意仍然成立）
        const distB = bucketize(sorted.map((r) => ({ date: runDate(r), v: +runKm(r).toFixed(2) })), { agg: 'sum' });

        // ══ 配速趨勢：只取「最常跑的距離區間」════════════════════════════
        // 3K 衝刺跟 15K 長跑的配速本來就不能畫在同一條線上 ——
        // 混在一起的「進步」多半只是那陣子剛好跑得比較短。
        const bandPick = pickPaceBand(paced.map((x) => ({ km: runKm(x.r) })));
        const inBand = bandPick
            ? paced.filter((x) => { const km = runKm(x.r); return km >= bandPick.band.min && km < bandPick.band.max; })
            : paced;
        const bandSorted = inBand.slice().sort((a, b) => runDate(a.r) - runDate(b.r));
        const paceB = bucketize(bandSorted.map((x) => ({ date: runDate(x.r), v: Math.round(x.pace) })), { agg: 'avg' });
        // 均線：分桶後再做 3 點移動平均（逐筆時就是 5 點，桶數少時自動收斂）
        const win = paceB.mode === 'session' ? 5 : 3;
        const paceData = paceB.points.map((p, i, arr) => {
            const w = arr.slice(Math.max(0, i - (win - 1)), i + 1);
            return { label: p.label, 配速: Math.round(p.v), 均線: Math.round(w.reduce((s, y) => s + y.v, 0) / w.length) };
        });
        // 該區間的早期 vs 近期（進步判定也只在同區間內比，才算數）
        const bandAvg = (arr) => (arr.length ? arr.reduce((s, x) => s + x.pace, 0) / arr.length : null);
        const bandEarly = bandAvg(bandSorted.slice(0, 5));
        const bandRecent = bandAvg(bandSorted.slice(-5));

        return {
            count: sorted.length,
            totalKm,
            totalHours: +(sorted.reduce((s, r) => s + runSec(r), 0) / 3600).toFixed(1),
            totalElev, longest, fastest,
            bestPace: paced.length ? Math.min(...paced.map((x) => x.pace)) : null,
            earlyPace: bandEarly ?? earlyPace,
            recentPace: bandRecent ?? recentPace,
            paceGain: (bandEarly && bandRecent)
                ? Math.round(bandEarly - bandRecent)
                : (earlyPace && recentPace ? Math.round(earlyPace - recentPace) : null),
            band: bandPick?.band || null,
            bandCount: bandSorted.length,
            enoughForTrend: paceData.length >= 3,
            cum: { ...cumB, data: cumB.points.map((p) => ({ label: p.label, 累積: p.v })), peak: peakOf(cumB.points) },
            dist: { ...distB, data: distB.points.map((p) => ({ label: p.label, 距離: p.v })), peak: peakOf(distB.points) },
            pace: { mode: paceB.mode, modeZh: paceB.modeZh, data: paceData },
            // 配速的「高點」是最快的那一格（值最小）
            paceBest: paceB.points.length ? paceB.points.reduce((a, b) => (b.v < a.v ? b : a)) : null,
        };
    }, [runs]);

    // ── 系統 3：身體數據 ───────────────────────────────────────────
    const body = useMemo(() => {
        if (inbody.length === 0) return null;
        const first = inbody[0], last = inbody[inbody.length - 1];
        const smmDelta = deltaOf(first.smm, last.smm);
        const bfDelta = deltaOf(first.bf, last.bf);
        // 🩹 門檻在 utils/bodyProgress：BIA 量測本身會晃，沒超過誤差就不寫成進步
        const gained = gainedMuscle(smmDelta);
        const lost = lostFat(bfDelta);
        return {
            count: inbody.length,
            spanDays: Math.max(1, Math.round((last.date - first.date) / 86400000)),
            weight: { from: first.w, to: last.w, delta: deltaOf(first.w, last.w) },
            smm: { from: first.smm, to: last.smm, delta: smmDelta },
            bf: { from: first.bf, to: last.bf, delta: bfDelta },
            gainedMuscle: gained,
            lostFat: lost,
            recomp: gained && lost,
            improved: gained || lost,
            series: inbody.map((r) => ({ label: mdLabel(r.date), 體重: r.w, 骨骼肌: r.smm })),
            bfSeries: inbody.filter((r) => r.bf != null).map((r) => ({ label: mdLabel(r.date), 體脂率: r.bf })),
        };
    }, [inbody]);

    // ── 📍 足跡：存檔當下記下的地名 → 「你練過的地方」（沒定位到的不列入）
    const places = useMemo(() => buildPlaces([
        ...workouts.map((w) => ({ name: w.location_name, kind: 'strength', date: w._d })),
        ...runs.map((r) => ({ name: r.location_name, kind: 'run', date: runDate(r) })),
    ]), [workouts, runs]);

    // 出現次數最多的那個月 → 該月最用力的一天（給天際線的「帝國大廈」用）
    const busiestMonthPeak = useMemo(() => {
        const sessions = events.filter((e) => e.kind !== 'inbody');
        if (sessions.length < 3) return null;
        const byMonth = {};
        sessions.forEach((e) => {
            const k = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
            (byMonth[k] = byMonth[k] || []).push(e);
        });
        const entries = Object.entries(byMonth);
        if (!entries.length) return null;
        const [mk, list] = entries.reduce((a, b) => (b[1].length > a[1].length ? b : a));
        if (list.length < 3) return null;
        const byDay = {};
        list.forEach((e) => { (byDay[e.dayKey] = byDay[e.dayKey] || []).push(e); });
        const [dkey] = Object.entries(byDay).reduce((a, b) => (b[1].length >= a[1].length ? b : a));
        const [yy, mm] = mk.split('-');
        return { date: new Date(dkey), monthLabel: `${yy} 年 ${Number(mm)} 月 · ${list.length} 次` };
    }, [events]);

    // ── 🗼 地標日 → 天際線上的地標建築 ──────────────────────────────
    // 「值得被記住的那幾天」不該只是另一根一樣的柱子。把它們蓋成認得出來的建築，
    // 使用者掃一眼就會停在那裡，然後想起那天發生了什麼。
    const landmarks = useMemo(() => {
        const dk = (d) => {
            const t = new Date(d);
            return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        };
        const map = {};
        const put = (d, type, title) => {
            if (!d) return;
            const k = dk(d);
            if (!map[k]) map[k] = { type, title };
        };
        put(running?.longest?.date, 'taipei101', `最遠的一次 · ${running?.longest?.km} km`);
        put(strength?.bestSession?.date,
            'eiffel', `最重的一練 · ${Math.round(strength?.bestSession?.volume || 0).toLocaleString()} kg`);
        put(running?.fastest?.date, 'pisa', `最快的一次 · ${fmtPace(running?.fastest?.pace)}/km`);
        // 出現次數最多的那個月，選該月最用力的一天 → 帝國大廈
        put(busiestMonthPeak?.date, 'empire', `最拚的一個月 · ${busiestMonthPeak?.monthLabel}`);
        // 第一次重訓 / 第一次跑步 → 金字塔 / 太空針塔
        put(workouts[0]?._d, 'pyramid', '第一次重訓');
        put(runs.length ? [...runs].sort((a, b) => runDate(a) - runDate(b))[0] && runDate([...runs].sort((a, b) => runDate(a) - runDate(b))[0]) : null,
            'needle', '第一次跑步');
        // 最長連續的最後一天 → 東京鐵塔
        if (streaks.longest >= 3 && events.length) {
            const days = [...new Set(events.map((e) => e.dayKey).filter(Boolean))].sort();
            let run = 1, best = { len: 1, end: days[0] };
            for (let i = 1; i < days.length; i++) {
                const gap = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 86400000);
                run = gap === 1 ? run + 1 : 1;
                if (run > best.len) best = { len: run, end: days[i] };
            }
            if (!map[best.end]) map[best.end] = { type: 'tokyo', title: `最長連續 · ${best.len} 天` };
        }
        // 一切的起點 → 大笨鐘
        if (events.length) {
            const first = events[events.length - 1];   // events 最新在前
            if (first?.dayKey && !map[first.dayKey]) map[first.dayKey] = { type: 'bigben', title: '一切的起點' };
        }
        return map;
    }, [running, strength, streaks, events, workouts, runs, busiestMonthPeak]);

    const city = useMemo(() => buildCityMonths(events, landmarks), [events, landmarks]);

    // ── ✦ 大膽數據帶：全頁最有份量的一個數字 ─────────────────────────
    //    選一個「最能代表這段歷程」的真實數字，用海報級尺度砸出來。
    const highlight = useMemo(() => {
        if (body?.recomp) return {
            kicker: 'Body Recomposition · 身體重組',
            value: `+${body.smm.delta}`, unit: 'kg 骨骼肌',
            line: `同一段 ${body.spanDays} 天裡，你增了肌、也減了脂 ${Math.abs(body.bf.delta)}%。體重也許只動一點，但身體的「內容」完全不一樣了。`,
        };
        if (strength?.totalTons >= 1) return {
            kicker: 'Total Volume · 累積總負重',
            value: strength.totalTons, unit: '公噸', roll: true, decimals: 1,
            line: `${tonsEquiv(strength.totalTons) || '這是你一組一組扛起來的'} — 分成 ${strength.count} 次訓練，一次都沒有白練。`,
        };
        if (running?.totalKm >= 5) return {
            kicker: 'Total Distance · 累積里程',
            value: running.totalKm, unit: '公里', roll: true, decimals: 1,
            line: `${kmEquiv(running.totalKm) || ''} — ${running.count} 次出門，${running.totalHours} 小時在路上。配速會有起伏，里程不會背叛你。`,
        };
        if (streaks.activeDays > 0) return {
            kicker: 'Consistency · 出席',
            value: streaks.activeDays, unit: '天有出現', roll: true,
            line: `加入後的 ${joinDays} 天裡，你有 ${streaks.activeDays} 天真的動了 — 最長連續 ${streaks.longest} 天。持續本身就是一種能力。`,
        };
        return null;
    }, [body, strength, running, streaks, joinDays]);

    // ── 📄 PDF 趨勢報告 ───────────────────────────────────────────
    const meta = `Day ${joinDays} · ${new Date().toLocaleDateString('zh-TW')}`;
    const dateZh = (d) => (d ? new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '');

    const exportReport = async () => {
        if (exporting) return;
        if (events.length === 0) { toast?.info?.('還沒有任何紀錄可以匯出 — 完成第一筆之後再回來'); return; }
        if (!canUse('reportPdf')) { openPaywall('reportPdf'); return; }   // 💳 PDF 報告是會員功能
        setExporting(true);
        try {
            const { exportJourneyReportPDF } = await import('../utils/journeyPdf');
            await exportJourneyReportPDF({
                fileName: `DRVN_Evolution_Trend_Day${joinDays}`,
                title: 'EVOLUTION',
                subtitle: `變強的第 ${joinDays} 天 — 歷史進步趨勢分析`,
                meta,
                lead: `${summary.headline} ${summary.body}`,
                stats: [
                    { label: '變強天數', value: String(joinDays), unit: '天', accent: true },
                    { label: '出席天數', value: String(streaks.activeDays), unit: '天', sub: `最長連續 ${streaks.longest} 天` },
                    { label: '總紀錄', value: String(events.length), unit: '筆', sub: '三系統合計' },
                    { label: '重訓', value: String(strength?.count || 0), unit: '次', sub: strength ? `${strength.totalTons} t 累積負重` : '尚無紀錄' },
                    { label: '跑步', value: String(running?.totalKm || 0), unit: 'km', sub: running ? `${running.count} 次 · ${running.totalHours} hr` : '尚無紀錄' },
                    { label: 'InBody', value: String(body?.count || 0), unit: '筆', sub: body ? `橫跨 ${body.spanDays} 天` : '尚無量測' },
                ],
                heat: heatmap,
                table: monthly.length ? {
                    heading: '月度趨勢 · Monthly Trend',
                    right: `近 ${monthly.length} 個月`,
                    columns: ['月份', '重訓', '訓練量', '跑步', '里程', '平均配速'],
                    barColumn: 1,
                    rows: monthly.map((m) => ({
                        cells: [
                            m.key,
                            m.重訓 ? `${m.重訓} 次` : '—',
                            m.tons ? `${m.tons} t` : '—',
                            m.跑步 ? `${m.跑步} 次` : '—',
                            m.km ? `${m.km} km` : '—',
                            m.pace ? fmtPace(m.pace) : '—',
                        ],
                        bar: m.重訓 + m.跑步,
                    })),
                } : null,
                lists: [
                    strength?.improvedLifts?.length ? {
                        heading: 'Progressive Overload · 動作重量趨勢',
                        rows: strength.improvedLifts.map((l) => ({
                            name: l.name,
                            detail: `${l.from}kg → ${l.to}kg · ${l.sessions} 次訓練 · ${l.spanDays} 天`,
                            badge: `+${l.gainKg}kg`,
                        })),
                    } : null,
                    (running?.paceGain > 0 || running?.longest || body?.improved || strength?.bestSession) ? {
                        heading: '進步指標 · Improvements',
                        rows: [
                            running?.paceGain > 0 && {
                                name: '平均配速', detail: `${fmtPace(running.earlyPace)} → ${fmtPace(running.recentPace)}`, badge: `-${running.paceGain}s/km`,
                            },
                            running?.longest && { name: '最長單次跑步', detail: dateZh(running.longest.date), badge: `${running.longest.km} km` },
                            strength?.bestSession && {
                                name: '單次最佳訓練容量', detail: dateZh(strength.bestSession.date),
                                badge: `${Math.round(strength.bestSession.volume).toLocaleString()} kg`,
                            },
                            body?.gainedMuscle && { name: '骨骼肌', detail: `${body.smm.from} → ${body.smm.to} kg`, badge: `+${body.smm.delta}kg` },
                            body?.lostFat && { name: '體脂率', detail: `${body.bf.from} → ${body.bf.to} %`, badge: `${body.bf.delta}%` },
                            strength?.prCount > 0 && { name: 'PR 突破', detail: '歷史最佳刷新', badge: `${strength.prCount} 次` },
                        ].filter(Boolean),
                    } : null,
                    places.count > 0 ? {
                        heading: '練過的地方',
                        rows: places.top.map((p) => ({
                            name: p.name,
                            detail: placeDetail(p, mdLabel),
                            badge: `${p.total} 次`,
                        })),
                    } : null,
                ].filter(Boolean),
                // copy-rules: allow-long —— 以下是 PDF 報告最後一頁的「資料怎麼算的」附註，
                // 不是介面文案：使用者是拿到報告後主動讀它，括號裡的誤差值就是這段的重點。
                notes: [
                    highlight ? `${highlight.value}${highlight.unit} — ${highlight.line}` : null,
                    '本報告只彙整真實紀錄：累積型數據誠實照放，進步型指標（配速 / 重量 / InBody）只有真的改善才會出現。',
                    '動作趨勢 = 該動作「首次紀錄的最大重量」到「歷史最佳」；配速進步 = 最早 5 次平均 vs 最近 5 次平均。',
                    'InBody 的增肌 / 減脂要超過量測誤差（骨骼肌 0.5kg、體脂率 1%）才算，以下視為尚未看得出變化。',
                    '地點來自每次存檔當下的定位，粒度到行政區；沒定位到的紀錄不列入。',
                    // copy-rules: end
                ].filter(Boolean),
            });
            setExported(true);
        } catch (e) {
            console.warn('[JourneyPDF] export failed:', e?.message);
            toast?.error?.('PDF 匯出失敗，稍後再試');
        } finally {
            setExporting(false);
        }
    };

    // ══ UI 元件（瑞士極簡：髮絲線分隔，不用圓角卡片堆疊）═══════════════
    const SectionHead = ({ no, kicker, title, sub }) => (
        <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                <span style={{ ...TYPE.micro, fontSize: 11, color: C.coral, fontVariantNumeric: 'tabular-nums' }}>{no}</span>
                <span style={{ width: 14, height: 1, background: 'rgba(22,20,21,0.24)' }} />
                <span style={{ ...TYPE.micro, color: C.muted }}>{kicker}</span>
            </div>
            <h2 style={{ ...TYPE.title, margin: 0, color: C.ink }}>{title}</h2>
            {sub && <p style={{ ...TYPE.body, fontSize: 13, margin: '8px 0 0', color: 'rgba(22,20,21,0.42)' }}>{sub}</p>}
        </div>
    );

    // 🎯 戲劇性尺度對比：超大 light-weight 數字壓著極小 tracked 標籤
    const Stat = ({ label, value, unit, sub, roll, decimals = 0, accent, first }) => (
        <div style={{ borderTop: first ? `2px solid ${C.ink}` : `1px solid ${C.hair}`, paddingTop: 13, paddingBottom: 4, minWidth: 0 }}>
            <p style={{ ...TYPE.micro, fontSize: 11, margin: 0, color: C.muted }}>{label}</p>
            <p style={{ margin: '11px 0 0', display: 'flex', alignItems: 'baseline', gap: 3, color: accent ? C.coral : C.ink }}>
                <span style={{ ...TYPE.display, fontSize: displaySize(String(value), 38), fontVariantNumeric: 'tabular-nums' }}>
                    {roll ? <Rolling to={Number(value) || 0} decimals={decimals} /> : value}
                </span>
                {unit && <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.40)' }}>{unit}</span>}
            </p>
            {sub && <p style={{ ...TYPE.micro, fontSize: 11, letterSpacing: '0.1em', textTransform: 'none', margin: '7px 0 0', color: C.faint, lineHeight: 1.5 }}>{sub}</p>}
        </div>
    );

    const StatRow = ({ children, cols = 3 }) => (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0 16px' }}>{children}</div>
    );

    // 🗣️ CoachNote — 把客觀數字翻成「有人看著你成長」的一句話
    const CoachNote = ({ children }) => (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 22 }}>
            <div style={{ flexShrink: 0, width: 18, height: 2, background: C.coral, marginTop: 10 }} />
            <p style={{
                margin: 0, flex: 1, fontSize: 13.5, lineHeight: 1.8, color: 'rgba(22,20,21,0.70)',
                fontFamily: '"Tenor Sans", "Noto Serif TC", serif', letterSpacing: '0.01em',
            }}>{children}</p>
        </div>
    );

    const Empty = ({ text }) => (
        <p style={{ ...TYPE.body, color: 'rgba(22,20,21,0.38)', padding: '22px 0', margin: 0, lineHeight: 1.8 }}>{text}</p>
    );

    const axisProps = {
        tick: { fontSize: 11, fill: 'rgba(22,20,21,0.32)', fontWeight: 700 },
        axisLine: false, tickLine: false, interval: 'preserveStartEnd',
    };
    const tooltipStyle = {
        fontSize: 11, borderRadius: 0, border: `1px solid ${C.hair}`,
        background: 'rgba(246,244,241,0.96)', boxShadow: 'none',
    };

    // 圖表框：標題列（左：英文/中文標；右：顆粒度）＋ 高點標記 ＋ 圖 ＋ 圖說。
    //   • 顆粒度徽章：告訴使用者這張圖現在是「每一次 / 每週 / 每月」——
    //     資料一多就自動升級，不講清楚會讓人以為紀錄變少了。
    //   • 高點標記：使用者要求「每個最高的那個數據要標出來顯示在圖表上方」。
    const Chart = ({ title, mode, peak, caption, height = 150, children }) => (
        <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, margin: '0 0 8px' }}>
                {title && <span style={{ ...TYPE.micro, fontSize: 11, color: C.muted }}>{title}</span>}
                {mode && <span style={{ ...TYPE.micro, fontSize: 11, color: C.faint, flexShrink: 0 }}>{mode}</span>}
            </div>
            {peak && (
                <motion.div
                    initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ duration: 0.5, ease: EASE, delay: 0.25 }}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '0 0 8px' }}>
                    <span style={{ width: 10, height: 2, background: C.coral, alignSelf: 'center' }} />
                    <span style={{ ...TYPE.micro, fontSize: 11, color: C.coral }}>最高</span>
                    <span style={{ ...TYPE.display, fontSize: 17, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{peak.value}</span>
                    <span style={{ ...TYPE.micro, fontSize: 11, color: C.faint }}>{peak.unit}</span>
                    <span style={{ ...TYPE.micro, fontSize: 11, letterSpacing: '0.1em', textTransform: 'none', color: C.faint }}>· {peak.at}</span>
                </motion.div>
            )}
            <div style={{ borderTop: `1px solid ${C.hair}`, paddingTop: 12, height, width: '100%' }}>
                <ResponsiveContainer width="99%" height="100%">{children}</ResponsiveContainer>
            </div>
            {caption && (
                <p style={{ ...TYPE.micro, fontSize: 11, letterSpacing: '0.1em', textTransform: 'none', margin: '9px 0 0', color: C.faint, lineHeight: 1.6 }}>
                    {caption}
                </p>
            )}
        </div>
    );

    // ✏️ Sparkline — 單一動作的重量軌跡。線用 pathLength 畫出來，像有人在你面前描一次。
    const Sparkline = ({ points, w = 96, h = 30 }) => {
        if (!points || points.length < 2) return <div style={{ width: w, height: h }} />;
        const ys = points.map((p) => p.kg);
        const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
        const d = points.map((p, i) => {
            const x = (i / (points.length - 1)) * (w - 2) + 1;
            const y = h - 2 - ((p.kg - min) / span) * (h - 4);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        const lastX = w - 1;
        const lastY = h - 2 - ((ys[ys.length - 1] - min) / span) * (h - 4);
        return (
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
                <motion.path
                    d={d} fill="none" stroke={C.coral} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 0.2 }}
                    whileInView={{ pathLength: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.05, ease: EASE }}
                />
                <motion.circle
                    cx={lastX} cy={lastY} r="2.4" fill={C.coral}
                    initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
                    transition={{ delay: 0.9, duration: 0.3, ease: EASE }}
                />
            </svg>
        );
    };

    const PAD = SWISS.pagePadding;
    const Block = ({ children, gap = 46 }) => (
        <div style={{ padding: `0 ${PAD}px`, marginBottom: gap }}>{children}</div>
    );

    const hasAny = events.length > 0;

    // ══════════════════════════════════════════════════════════════════════
    // 🩹 切分類 / 開合完整紀錄時「頁面往上跳」的修正
    //
    // 原因：舊寫法用 AnimatePresence mode="wait" —— 舊內容先卸載（高度歸零），
    //   新內容才掛上。那一瞬間整頁變短，瀏覽器把 scrollY 夾回可捲範圍內，
    //   放開後就跳掉了。收合「完整紀錄」同理。
    //
    // 修法：① 切換時先用測到的高度把容器撐住，等新內容掛好再放開（不再有塌陷那一幀）
    //       ② 切換後把捲動位置補回去（雙保險，對付非同步的 recharts 量測）
    // ══════════════════════════════════════════════════════════════════════
    const sysBodyRef = useRef(null);
    const [sysMinH, setSysMinH] = useState(0);
    const keepScrollRef = useRef(null);

    const changeTab = (k) => {
        if (k === sysTab) return;
        setSysMinH(sysBodyRef.current?.offsetHeight || 0);
        keepScrollRef.current = window.scrollY;
        setSysTab(k);
    };

    useLayoutEffect(() => {
        if (keepScrollRef.current == null) return;
        const y = keepScrollRef.current;
        keepScrollRef.current = null;
        window.scrollTo(0, y);
    }, [sysTab]);

    useEffect(() => {
        if (!sysMinH) return undefined;
        const t = setTimeout(() => setSysMinH(0), 450);   // 動畫走完再放開高度
        return () => clearTimeout(t);
    }, [sysTab, sysMinH]);

    // 完整紀錄開合：讓那顆按鈕在畫面上的位置維持不動
    const logBtnRef = useRef(null);
    const toggleLog = () => {
        const before = logBtnRef.current?.getBoundingClientRect().top;
        setShowLog((v) => !v);
        requestAnimationFrame(() => {
            const after = logBtnRef.current?.getBoundingClientRect().top;
            if (before != null && after != null && Math.abs(after - before) > 1) {
                window.scrollBy(0, after - before);
            }
        });
    };

    return (
        <div style={{
            minHeight: '100dvh', background: C.paper, fontFamily: 'var(--font-body)',
            paddingBottom: 'var(--nav-clearance, 110px)',
        }}>
            {/* ══ Hero（鈦金屬深色，延續入口卡的語言）══ */}
            <div style={{
                background: 'linear-gradient(150deg, rgba(22,20,21,0.62) 0%, rgba(22,20,21,0.82) 100%), url("/desktop/MuchaTseBle.jpeg") center/cover',
                padding: `calc(env(safe-area-inset-top, 44px) + 12px) ${PAD}px 32px`,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <motion.button {...pressProps('row')}
 onClick={() => {
 // ✨ 首訪進化日誌：離場時才發滿版時刻（進場發會壓住頁面本身的揭示）
 try { recordFirst(getUserId(), 'evolution_page'); } catch { /* */ }
 navigate(-1);
 }}
 style={{
 width: 38, height: 38, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
 background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer',
 }}>
                        <ArrowLeft size={17} color="#F6F4F1" />
                    </motion.button>
                    <motion.button {...pressProps('row')}
 onClick={exportReport}
 disabled={exporting}
 style={{
 display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 99,
 background: exported ? 'rgba(249,92,75,0.18)' : 'rgba(255,255,255,0.10)',
 border: `1px solid ${exported ? 'rgba(249,92,75,0.45)' : 'rgba(255,255,255,0.20)'}`,
 cursor: exporting ? 'default' : 'pointer',
 }}>
                        {exported
                            ? <Check size={13} strokeWidth={2.6} color={C.coral} />
                            : <FileDown size={13} strokeWidth={2.4} color="#F6F4F1" />}
                        <span style={{ ...TYPE.micro, fontSize: 12, letterSpacing: '0.16em', color: exported ? C.coral : '#F6F4F1' }}>
                            {exporting ? '匯出中' : exported ? '已匯出' : '趨勢報告'}
                        </span>
                    </motion.button>
                </div>

                <p style={{ ...TYPE.micro, fontSize: 12, letterSpacing: '0.3em', margin: 0, color: C.coral }}>Evolution Log · 進化日誌</p>
                <h1 style={{ ...TYPE.title, fontSize: 36, margin: '10px 0 0', color: '#F6F4F1', lineHeight: 1.14, letterSpacing: '-0.02em' }}>
                    變強的<br />第 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{joinDays}</span> 天
                </h1>

                {/* 正向總結：永遠對得回真實數字 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18, duration: 0.6, ease: EASE }}
                    style={{ marginTop: 20, borderTop: '1px solid rgba(246,244,241,0.16)', paddingTop: 16 }}>
                    <p style={{
                        margin: 0, fontSize: 17, fontWeight: 400, color: '#F6F4F1', letterSpacing: '-0.01em',
                        fontFamily: '"Tenor Sans", "Noto Serif TC", serif',
                    }}>{summary.headline}</p>
                    <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 500, color: 'rgba(246,244,241,0.60)', lineHeight: 1.75, maxWidth: '38ch' }}>
                        {summary.body}
                    </p>
                </motion.div>
            </div>

            <div style={{ paddingTop: 38 }}>
                {/* ══ 01 整體總覽 ══ */}
                <Block>
                    <SectionHead no="01" kicker="Overall · 整體" title="你累積了什麼" />
                    <StatRow>
                        <Stat first label="出席天數" value={streaks.activeDays} unit="天" roll accent sub={`加入後 ${joinDays} 天`} />
                        <Stat first label="最長連續" value={streaks.longest} unit="天" roll sub={streaks.current > 0 ? `目前 ${streaks.current} 天` : '目前中斷中'} />
                        <Stat first label="總紀錄" value={events.length} unit="筆" roll sub="三系統合計" />
                    </StatRow>
                    <div style={{ height: 22 }} />
                    <StatRow>
                        <Stat label="重訓" value={strength?.count || 0} unit="次" roll sub={strength ? `${strength.totalTons} t 累積負重` : '尚無紀錄'} />
                        <Stat label="跑步" value={running?.totalKm ?? 0} unit="km" roll decimals={1} sub={running ? `${running.count} 次 · ${running.totalHours} hr` : '尚無紀錄'} />
                        <Stat label="InBody" value={body?.count || 0} unit="筆" roll sub={body ? `橫跨 ${body.spanDays} 天` : '尚無量測'} />
                    </StatRow>

                    {/* 跨系統趨勢：每個月你出現的樣子 */}
                    {monthly.length >= 2 && (
                        <Chart
                            title="Monthly Rhythm · 月度節奏"
                            mode={`近 ${monthly.length} 個月`}
                            peak={monthPeak}
                            caption="每個月的訓練次數 — 看的不是強度，是你有沒有一直在。灰色那一塊代表「那個月沒有跑步／沒有重訓」，不是沒資料。"
                            height={150}>
                            <BarChart data={monthly} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="26%">
                                <XAxis dataKey="label" {...axisProps} />
                                <YAxis hide />
                                <Tooltip cursor={{ fill: 'rgba(22,20,21,0.04)' }} contentStyle={tooltipStyle}
                                    formatter={(v, n) => (n === '未跑' || n === '未重訓'
                                        ? [n === '未跑' ? '這個月沒跑步' : '這個月沒重訓', '']
                                        : [`${v} 次`, n])} />
                                <Bar dataKey="重訓" stackId="a" fill={C.ink} animationDuration={900} />
                                <Bar dataKey="未重訓" stackId="a" fill={MIST} animationDuration={900} />
                                <Bar dataKey="跑步" stackId="a" fill={C.coral} animationDuration={900} />
                                <Bar dataKey="未跑" stackId="a" fill={MIST} radius={[2, 2, 0, 0]} animationDuration={900} />
                            </BarChart>
                        </Chart>
                    )}
                </Block>

                {/* ══ ✦ 大膽數據帶：海報級的一個數字 ══ */}
                {highlight && (
                    <motion.div
                        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: '-60px' }}
                        transition={{ duration: 0.6, ease: EASE }}
                        style={{ background: C.ink, padding: `36px ${PAD}px 34px`, marginBottom: 46, overflow: 'hidden' }}>
                        <p style={{ ...TYPE.micro, fontSize: 11, margin: 0, color: C.coral }}>{highlight.kicker}</p>
                        <motion.p
                            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                            transition={{ delay: 0.12, duration: 0.7, ease: EASE }}
                            style={{ margin: '16px 0 0', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{
                                ...TYPE.display, fontSize: 76, lineHeight: 0.86, color: C.paper,
                                letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums',
                            }}>
                                {highlight.roll
                                    ? <Rolling to={Number(highlight.value) || 0} decimals={highlight.decimals || 0} duration={1.4} />
                                    : highlight.value}
                            </span>
                            <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(246,244,241,0.5)' }}>{highlight.unit}</span>
                        </motion.p>
                        <motion.div
                            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
                            transition={{ delay: 0.35, duration: 0.8, ease: EASE }}
                            style={{ height: 2, background: C.coral, margin: '22px 0 18px', transformOrigin: 'left' }} />
                        <p style={{
                            margin: 0, fontSize: 14, lineHeight: 1.85, color: 'rgba(246,244,241,0.72)', maxWidth: '34ch',
                            fontFamily: '"Tenor Sans", "Noto Serif TC", serif',
                        }}>{highlight.line}</p>
                    </motion.div>
                )}

                {/* ══ 02 出席趨勢 ══ */}
                <Block>
                    <Reveal>
                        <SectionHead no="02" kicker="Consistency · 出席" title="你來過的每一天"
                            sub="一天一棟樓。有出現的那天燈就亮著，並且標上日期 — 你越常來，這座城越亮。" />
                    </Reveal>
                </Block>
                {hasAny ? (
                    <Reveal>
                        {/* 滿版天際線（不吃 24px 頁邊 —— 城市要從畫面的一邊長到另一邊） */}
                        <div style={{ marginBottom: 46 }}>
                            <CityLights city={city} />
                        </div>
                    </Reveal>
                ) : (
                    <Block>
                        <Empty text="還沒有出現紀錄 — 第一盞燈亮起來的那天，這座城就開始蓋了。" />
                    </Block>
                )}

                {/* ══ 03 系統趨勢 ══ */}
                <Block>
                    <Reveal>
                        <SectionHead no="03" kicker="Trends · 系統趨勢" title="進步的形狀"
                            sub="每一條線都由真實紀錄畫成 —— 沒有真的變好，就不會有那條線。" />
                    </Reveal>

                    <div style={{ display: 'flex', gap: 26, borderBottom: SWISS.hairline, marginBottom: 22 }}>
                        {[['strength', '重訓'], ['running', '跑步'], ['body', '身體']].map(([k, label]) => (
                            <motion.button {...pressProps('row')} key={k} onClick={() => changeTab(k)}
 style={{
 position: 'relative', background: 'transparent', border: 'none',
 padding: '0 0 11px', cursor: 'pointer', ...TYPE.label, fontSize: 11,
 color: sysTab === k ? C.ink : 'rgba(22,20,21,0.32)', transition: 'color .2s',
 }}>
                                {label}
                                {sysTab === k && (
                                    <motion.span layoutId="sys-underline"
                                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                        style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: C.coral }} />
                                )}
                            </motion.button>
                        ))}
                    </div>

                    <div ref={sysBodyRef} style={{ minHeight: sysMinH || undefined }}>
                        <motion.div
                            key={sysTab}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: EASE }}>

                            {/* ── 重訓趨勢 ── */}
                            {sysTab === 'strength' && (loading && !strength ? null : strength ? (<>
                                <StatRow>
                                    <Stat first label="訓練次數" value={strength.count} unit="次" roll />
                                    <Stat first label="累積負重" value={strength.totalTons} unit="t" roll decimals={1} accent sub={tonsEquiv(strength.totalTons)} />
                                    <Stat first
                                        label={strength.prCount > 0 ? 'PR 突破' : '有效組'}
                                        value={strength.prCount > 0 ? strength.prCount : strength.totalHardSets}
                                        unit={strength.prCount > 0 ? '次' : '組'} roll
                                        sub={strength.prCount > 0 ? '歷史最佳刷新' : 'RPE ≥ 7'} />
                                </StatRow>

                                {strength.cum.data.length >= 2 && (
                                    <Chart title="Cumulative Volume · 累積總負重"
                                        mode={strength.cum.modeZh}
                                        peak={strength.cum.peak && { value: strength.cum.peak.v, unit: 't', at: strength.cum.peak.label }}
                                        caption="這條線只會往上 — 沒有任何一次訓練會從這裡消失。">
                                        <ComposedChart data={strength.cum.data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="jev-str-cum" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={C.ink} stopOpacity={0.20} />
                                                    <stop offset="100%" stopColor={C.ink} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="label" {...axisProps} />
                                            <YAxis hide domain={[0, 'dataMax + 0.5']} />
                                            <Tooltip cursor={{ stroke: C.hair }} formatter={(v) => [`${v} t`, '累積負重']} contentStyle={tooltipStyle} />
                                            <Area type="monotone" dataKey="累積" stroke={C.ink} strokeWidth={2} fill="url(#jev-str-cum)" dot={false}
                                                activeDot={{ r: 4, fill: C.coral, stroke: 'none' }} animationDuration={1100} />
                                        </ComposedChart>
                                    </Chart>
                                )}

                                {monthly.some((m) => m.tons > 0) && (
                                    <Chart title="Monthly Volume · 每月訓練量"
                                        mode={`近 ${monthly.length} 個月`}
                                        peak={tonsPeak}
                                        caption="柱子越高，那個月你越常出現、練得越紮實。" height={140}>
                                        <BarChart data={monthly} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
                                            <XAxis dataKey="label" {...axisProps} />
                                            <YAxis hide />
                                            <Tooltip cursor={{ fill: 'rgba(22,20,21,0.04)' }} formatter={(v) => [`${v} t`, '月訓練量']} contentStyle={tooltipStyle} />
                                            <Bar dataKey="tons" name="訓練量" fill={C.coral} radius={[2, 2, 0, 0]} animationDuration={900} />
                                        </BarChart>
                                    </Chart>
                                )}

                                {/* 動作重量趨勢 —— 每個動作一條自己的線 */}
                                <div style={{ marginTop: 32 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <span style={{ ...TYPE.micro, fontSize: 11, color: C.muted }}>Progressive Overload · 動作重量趨勢</span>
                                        {strength.improvedLifts.length > 0 && (
                                            <span style={{ ...TYPE.micro, fontSize: 11, color: C.faint }}>{strength.improvedLifts.length} 個動作在變強</span>
                                        )}
                                    </div>
                                    {strength.improvedLifts.length > 0 ? (
                                        <div style={{ borderTop: `2px solid ${C.ink}` }}>
                                            {strength.improvedLifts.map((l, i) => (
                                                <motion.div key={l.name}
                                                    initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                                                    viewport={{ once: true, margin: '-30px' }}
                                                    transition={{ delay: i * 0.06, duration: 0.45, ease: EASE }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 0', borderBottom: SWISS.hairline }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ ...TYPE.body, margin: 0, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {l.name}
                                                        </p>
                                                        <p style={{ ...TYPE.micro, fontSize: 11, letterSpacing: '0.1em', textTransform: 'none', margin: '6px 0 0', color: C.faint }}>
                                                            {l.from} → <span style={{ color: 'rgba(22,20,21,0.6)' }}>{l.to} kg</span>　{l.sessions} 次 · {l.spanDays} 天
                                                        </p>
                                                    </div>
                                                    <Sparkline points={l.points} />
                                                    <span style={{ flexShrink: 0, textAlign: 'right', width: 52 }}>
                                                        <span style={{ ...TYPE.display, fontSize: 19, color: C.coral }}>+{l.gainKg}</span>
                                                        <span style={{ ...TYPE.micro, fontSize: 11, color: C.faint, marginLeft: 2 }}>kg</span>
                                                        <span style={{ display: 'block', ...TYPE.micro, fontSize: 11, color: C.faint, marginTop: 4 }}>+{l.gainPct}%</span>
                                                    </span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    ) : (
                                        <Empty text="還沒有動作刷新重量 — 同一個動作練 2 次以上、把重量往上推，成長軌跡就會出現在這裡。" />
                                    )}
                                </div>

                                {strength.improvedLifts.length > 0 && (
                                    <CoachNote>
                                        你的{strength.improvedLifts[0].name}比第一天多扛了 {strength.improvedLifts[0].gainKg}kg —
                                        不是哪一次爆發，是 {strength.improvedLifts[0].sessions} 次訓練、每次多一點點的積累。這就是漸進超負荷該有的樣子。
                                    </CoachNote>
                                )}
                            </>) : (
                                <Empty text="還沒有重訓紀錄 — 完成第一次訓練後，每個動作的重量趨勢都會在這裡長出來。" />
                            ))}

                            {/* ── 跑步趨勢 ── */}
                            {sysTab === 'running' && (loading && !running ? null : running ? (<>
                                <StatRow>
                                    <Stat first label="累積里程" value={running.totalKm} unit="km" roll decimals={1} accent sub={kmEquiv(running.totalKm)} />
                                    <Stat first label="最長單次" value={running.longest?.km ?? 0} unit="km" roll decimals={1} sub={running.longest ? dateZh(running.longest.date) : null} />
                                    {/* 🩹 沒進步不顯示假進步 */}
                                    {running.paceGain > 0
                                        ? <Stat first label="配速進步" value={`-${running.paceGain}`} unit="秒/km" sub={`${fmtPace(running.earlyPace)} → ${fmtPace(running.recentPace)}`} />
                                        : <Stat first label="最快配速" value={fmtPace(running.bestPace)} unit="/km" sub="歷史最佳" />}
                                </StatRow>
                                <div style={{ height: 22 }} />
                                <StatRow cols={running.totalElev > 0 ? 3 : 2}>
                                    <Stat label="累積時數" value={running.totalHours} unit="hr" roll decimals={1} sub={`${running.count} 次跑步`} />
                                    <Stat label="跑步次數" value={running.count} unit="次" roll sub="真實紀錄" />
                                    {running.totalElev > 0 && <Stat label="累積爬升" value={running.totalElev} unit="m" roll sub={elevEquiv(running.totalElev)} />}
                                </StatRow>

                                {running.cum.data.length >= 2 && (
                                    <Chart title="Cumulative Distance · 累積里程"
                                        mode={running.cum.modeZh}
                                        peak={running.cum.peak && { value: running.cum.peak.v, unit: 'km', at: running.cum.peak.label }}
                                        caption="沒有一步是白跑的 — 這條線只會往上。">
                                        <ComposedChart data={running.cum.data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="jev-run-cum" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={C.coral} stopOpacity={0.26} />
                                                    <stop offset="100%" stopColor={C.coral} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="label" {...axisProps} />
                                            <YAxis hide domain={[0, 'dataMax + 1']} />
                                            <Tooltip cursor={{ stroke: C.hair }} formatter={(v) => [`${v} km`, '累積里程']} contentStyle={tooltipStyle} />
                                            <Area type="monotone" dataKey="累積" stroke={C.coral} strokeWidth={2} fill="url(#jev-run-cum)" dot={false}
                                                activeDot={{ r: 4, fill: C.coral, stroke: 'none' }} animationDuration={1100} />
                                        </ComposedChart>
                                    </Chart>
                                )}

                                {running.enoughForTrend && (
                                    <Chart
                                        title={`Pace Trend · 配速趨勢${running.band ? ` — ${running.band.label}` : ''}`}
                                        mode={running.pace.modeZh}
                                        peak={running.paceBest && { value: fmtPace(running.paceBest.v), unit: '/km', at: running.paceBest.label }}
                                        caption={running.band
                                            ? `只取你最常跑的${running.band.label}（${running.bandCount} 次）— 3K 衝刺跟 15K 長跑的配速本來就不能混在一起比。灰點是各次配速，黑線是移動平均；線往上代表越跑越快。`
                                            : '灰點是每一次的配速，黑線是移動平均。單次會有起伏，均線才是你真正的走向 — 線往上代表越跑越快。'}
                                        height={140}>
                                        <ComposedChart data={running.pace.data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
                                            <XAxis dataKey="label" {...axisProps} />
                                            {/* 配速反轉：越低越快 → 圖表往上代表進步 */}
                                            <YAxis hide domain={['dataMax + 25', 'dataMin - 25']} />
                                            <Tooltip cursor={{ stroke: C.hair }} formatter={(v, n) => [fmtPace(v), n]} contentStyle={tooltipStyle} />
                                            <Line type="monotone" dataKey="配速" stroke="rgba(22,20,21,0.22)" strokeWidth={1} dot={{ r: 1.6, fill: 'rgba(22,20,21,0.3)' }} animationDuration={900} />
                                            <Line type="monotone" dataKey="均線" stroke={C.ink} strokeWidth={2.2} dot={false}
                                                activeDot={{ r: 4, fill: C.coral, stroke: 'none' }} animationDuration={1200} />
                                        </ComposedChart>
                                    </Chart>
                                )}

                                {running.dist.data.length >= 3 && (
                                    <Chart
                                        title={running.dist.mode === 'session' ? 'Distance per Run · 單次距離' : 'Distance · 里程分佈'}
                                        mode={running.dist.modeZh}
                                        peak={running.dist.peak && { value: running.dist.peak.v, unit: 'km', at: running.dist.peak.label }}
                                        caption={running.dist.mode === 'session'
                                            ? '每一根柱子是一次出門 — 最高的那根，是你目前跑得最遠的一天。'
                                            : '紀錄變多了，這裡改用區間總里程 — 最高的那根是你跑得最兇的一段。'}
                                        height={130}>
                                        <BarChart data={running.dist.data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="24%">
                                            <XAxis dataKey="label" {...axisProps} />
                                            <YAxis hide />
                                            <Tooltip cursor={{ fill: 'rgba(22,20,21,0.04)' }} formatter={(v) => [`${v} km`, '距離']} contentStyle={tooltipStyle} />
                                            <Bar dataKey="距離" fill="rgba(22,20,21,0.72)" radius={[2, 2, 0, 0]} animationDuration={900} />
                                        </BarChart>
                                    </Chart>
                                )}

                                {running.paceGain > 0 ? (
                                    <CoachNote>
                                        每公里快 {running.paceGain} 秒 — 意思是同樣一場 5K，現在的你會比剛開始快 {fmtGainTime(running.paceGain * 5)}。
                                        剛起跑的那個你，已經追不上現在的你了。
                                    </CoachNote>
                                ) : running.totalKm >= 10 ? (
                                    <CoachNote>
                                        {running.totalKm} 公里，是一步一步跑出來的 — 配速會有起伏，但里程不會背叛你。
                                    </CoachNote>
                                ) : null}
                            </>) : (
                                <Empty text="還沒有跑步紀錄 — 完成第一次跑步後，配速與里程的趨勢會在這裡展開。" />
                            ))}

                            {/* ── 身體趨勢 ── */}
                            {sysTab === 'body' && (loading && !body ? null : body ? (<>
                                {body.recomp && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
                                        style={{ borderLeft: `2px solid ${C.coral}`, paddingLeft: 14, marginBottom: 24 }}>
                                        <p style={{ ...TYPE.micro, margin: 0, color: C.coral }}>身體重組達成</p>
                                        <p style={{ ...TYPE.body, margin: '7px 0 0', color: 'rgba(22,20,21,0.66)' }}>
                                            {body.spanDays} 天內增肌 +{body.smm.delta}kg、減脂 {body.bf.delta}% 同時發生
                                        </p>
                                    </motion.div>
                                )}
                                <StatRow>
                                    {body.gainedMuscle
                                        ? <Stat first label="骨骼肌" value={`+${body.smm.delta}`} unit="kg" accent sub={`${body.smm.from} → ${body.smm.to}`} />
                                        : <Stat first label="骨骼肌" value={body.smm.to ?? '—'} unit="kg" sub="最新量測" />}
                                    {body.lostFat
                                        ? <Stat first label="體脂率" value={body.bf.delta} unit="%" accent sub={`${body.bf.from} → ${body.bf.to}`} />
                                        : <Stat first label="體脂率" value={body.bf.to ?? '—'} unit="%" sub="最新量測" />}
                                    <Stat first label="體重" value={body.weight.to ?? '—'} unit="kg"
                                        sub={body.weight.delta != null ? `${body.weight.delta > 0 ? '+' : ''}${body.weight.delta} kg（${body.spanDays} 天）` : null} />
                                </StatRow>

                                {body.series.length >= 2 ? (<>
                                    <Chart title="Muscle vs Weight · 骨骼肌與體重"
                                        caption="珊瑚色是骨骼肌，黑線是體重。要看的是兩條線的關係 — 體重沒動、肌肉往上，那就是好事發生了。">
                                        <ComposedChart data={body.series} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="jev-body-smm" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={C.coral} stopOpacity={0.26} />
                                                    <stop offset="100%" stopColor={C.coral} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="label" {...axisProps} />
                                            <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                                            <Tooltip cursor={{ stroke: C.hair }} contentStyle={tooltipStyle} />
                                            <Area type="monotone" dataKey="骨骼肌" stroke={C.coral} strokeWidth={2.2} fill="url(#jev-body-smm)" dot={{ r: 2 }} connectNulls
                                                activeDot={{ r: 4, fill: C.coral, stroke: 'none' }} animationDuration={1000} />
                                            <Line type="monotone" dataKey="體重" stroke={C.ink} strokeWidth={1.8} dot={{ r: 2 }} connectNulls animationDuration={1000} />
                                        </ComposedChart>
                                    </Chart>

                                    {body.bfSeries.length >= 2 && (
                                        <Chart title="Body Fat · 體脂率趨勢" caption="往下走就是好事 — 這條線比體重計誠實得多。" height={120}>
                                            <LineChart data={body.bfSeries} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
                                                <XAxis dataKey="label" {...axisProps} />
                                                <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                                                <Tooltip cursor={{ stroke: C.hair }} formatter={(v) => [`${v} %`, '體脂率']} contentStyle={tooltipStyle} />
                                                <Line type="monotone" dataKey="體脂率" stroke={C.ink} strokeWidth={2} dot={{ r: 2.2 }}
                                                    activeDot={{ r: 4, fill: C.coral, stroke: 'none' }} animationDuration={1000} />
                                            </LineChart>
                                        </Chart>
                                    )}
                                </>) : (
                                    <p style={{ ...TYPE.micro, fontSize: 12, letterSpacing: '0.1em', textTransform: 'none', margin: '20px 0 0', color: C.faint, lineHeight: 1.7 }}>
                                        目前只有 1 筆量測 — 再量一筆，這裡就會長出你的變化曲線。
                                    </p>
                                )}

                                {body.recomp ? (
                                    <CoachNote>
                                        體重也許只動了一點，但身體的「內容」完全不一樣了 — 肌肉不會說謊，這 +{body.smm.delta}kg 是你一組一組換來的。
                                    </CoachNote>
                                ) : body.gainedMuscle ? (
                                    <CoachNote>
                                        {body.spanDays} 天，骨骼肌 +{body.smm.delta}kg。增肌是全健身房最慢的一件事，而你正在做到。
                                    </CoachNote>
                                ) : body.lostFat ? (
                                    <CoachNote>
                                        體脂 {body.bf.delta}%，是 {body.spanDays} 天裡每一餐、每一次訓練共同的結果 — 曲線比體重誠實。
                                    </CoachNote>
                                ) : null}
                            </>) : (
                                <Empty text="還沒有 InBody 紀錄 — 到「身體數據」量第一筆，之後的每一筆都會在這裡連成你的變化曲線。" />
                            ))}
                        </motion.div>
                    </div>
                </Block>

                {/* ══ 04 足跡 ══ */}
                {/* 🩹 沒地點也要在：這一區不是「有資料才出現的獎勵」，
                    而是「你還沒開始留下足跡」——沒資料時整區換成一行動作，把人帶去運動。 */}
                <Block>
                    <Reveal>
                        <SectionHead no="04" kicker="足跡" title="你練過的地方"
                            sub="你在哪裡練過、在哪裡跑過 —— 記到行政區。" />
                    </Reveal>

                    {places.count === 0 ? (
                        <motion.button {...pressProps('row')}
                            onClick={() => { haptic('light'); navigate('/luxury-plan-view-mobile'); }}
                            style={{
                                width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 12,
                                padding: '22px 0', background: 'transparent', cursor: 'pointer', textAlign: 'left',
                                borderTop: `2px solid ${C.ink}`, borderBottom: SWISS.hairline,
                                borderLeft: 'none', borderRight: 'none',
                            }}>
                            <span style={{ ...TYPE.title, fontSize: 17, color: C.ink, flex: 1 }}>去練一場</span>
                            <ChevronDown size={18} color={C.faint} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
                        </motion.button>
                    ) : (<>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ ...TYPE.micro, fontSize: 11, color: C.muted }}>最常去的</span>
                            <span style={{ ...TYPE.micro, fontSize: 11, color: C.faint }}>共 {places.count} 個地方</span>
                        </div>

                        <div style={{ borderTop: `2px solid ${C.ink}` }}>
                            {places.top.map((p, i) => (
                                <motion.div key={p.name}
                                    initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true, margin: '-30px' }}
                                    transition={{ delay: Math.min(i, 5) * 0.07, duration: 0.45, ease: EASE }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 0', borderBottom: SWISS.hairline }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ ...TYPE.body, margin: 0, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.name}
                                        </p>
                                        <p style={{ ...TYPE.micro, fontSize: 11, letterSpacing: '0.1em', textTransform: 'none', margin: '6px 0 0', color: C.faint }}>
                                            {placeDetail(p, mdLabel)}
                                        </p>
                                    </div>
                                    <span style={{ flexShrink: 0, textAlign: 'right', width: 52 }}>
                                        <span style={{ ...TYPE.display, fontSize: 19, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{p.total}</span>
                                        <span style={{ ...TYPE.micro, fontSize: 11, color: C.faint, marginLeft: 2 }}>次</span>
                                    </span>
                                </motion.div>
                            ))}
                        </div>

                        <CoachNote>
                            最常出現的是{places.top[0].name} —— 同一扇門走進去這麼多次，本身就是一種紀律。
                        </CoachNote>
                    </>)}
                </Block>

                {/* ══ 完整紀錄（預設收合：趨勢是主角，明細是備查）══ */}
                {hasAny && (
                    <Block gap={24}>
                        <motion.button {...pressProps('row')}
 ref={logBtnRef}
 onClick={toggleLog}
 style={{
 width: '100%', display: 'flex', alignItems: 'center', gap: 10,
 padding: '16px 0', background: 'transparent',
 borderTop: `1px solid ${C.hair}`, borderBottom: showLog ? 'none' : `1px solid ${C.hair}`,
 borderLeft: 'none', borderRight: 'none', cursor: 'pointer', textAlign: 'left',
 }}>
                            <span style={{ ...TYPE.micro, fontSize: 11, color: C.muted }}>完整紀錄</span>
                            <span style={{ flex: 1 }} />
                            <span style={{ ...TYPE.micro, fontSize: 11, color: C.faint }}>{events.length} 筆</span>
                            <motion.span animate={{ rotate: showLog ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }} style={{ display: 'flex' }}>
                                <ChevronDown size={14} color="rgba(22,20,21,0.35)" />
                            </motion.span>
                        </motion.button>
                        <AnimatePresence initial={false}>
                            {showLog && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.34, ease: EASE }} style={{ overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', gap: 8, margin: '18px 0 4px', flexWrap: 'wrap' }}>
                                        {[['all', '全部'], ['strength', '重訓'], ['run', '跑步'], ['inbody', '量測']].map(([k, label]) => {
                                            const on = logFilter === k;
                                            return (
                                                <motion.button {...pressProps('row')} key={k} onClick={() => setLogFilter(k)}
 style={{
 padding: '8px 14px', minHeight: 44, display: 'inline-flex', alignItems: 'center',
 borderRadius: 99, cursor: 'pointer',
 border: `1px solid ${on ? 'transparent' : 'rgba(22,20,21,0.14)'}`,
 background: on ? C.ink : 'transparent',
 color: on ? C.paper : 'rgba(22,20,21,0.5)',
 ...TYPE.micro, fontSize: 11, letterSpacing: '0.16em', transition: 'all .2s',
 }}>
                                                    {label}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                    <HistoryTimeline events={events} filter={logFilter} pageSize={12} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Block>
                )}

                {/* 底部激勵語 */}
                <motion.p
                    initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
                    style={{ ...TYPE.micro, textAlign: 'center', color: C.faint, margin: '18px 0 0' }}>
                    Move with intent<span style={{ color: C.coral }}>.</span>
                </motion.p>
            </div>
        </div>
    );
}
