/**
 * historyCalendar.js — 中控台「訓練月曆」的資料層（純函式，可測）
 * ──────────────────────────────────────────────────────────────
 * 輸入：activityFeedSource.loadMyActivities 的 sessions（已去重、已標獎牌）
 * 輸出：每一天練了什麼、有沒有破紀錄、有沒有比上一次進步。
 *
 * 誠實規則（跟獎牌同一套）：
 *   • 進步只跟「同一件事的上一次」比：重訓＝同一個動作的上一次最佳 e1RM；
 *     跑步＝距離差不多（±25%）的上一次配速。第一次做的沒有「進步」可言。
 *   • 破紀錄只認 prMedals 算出的金牌（rank 'PR'），銀銅不算破紀錄。
 */
// 跟 activityFeedSource 同一套判斷（那支會連到 API client，這裡保持純函式才測得了）
const isStrengthSession = (s) => {
    const k = String(s?.sport || s?.sportType || s?.type || s?.metrics?.type || 'running').toLowerCase();
    return k === 'strength' || k === 'gym';
};
const parseSessionDate = (s) => {
    const raw = s?.created_at ?? s?.date ?? s?.timestamp;
    if (raw == null) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
};
import { parseExercises, bestSetOf, normExerciseName } from './prMedals';
import { toLocalDateKey } from './localDate';
import { toZhExerciseName } from './exerciseNameZh';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// 重訓：部位 → 月曆格子上的一個字（跟週曆的推／拉／腿同一套）
const PUSH = /chest|shoulder|tricep|胸|肩|三頭/i;
const PULL = /back|bicep|lat|背|二頭/i;
const LEGS = /leg|quad|glute|hamstring|calf|calves|腿|臀/i;
export const strengthGlyph = (s = {}) => {
    const src = [s.focus_group, ...(Array.isArray(s.muscles) ? s.muscles : [])].filter(Boolean).join(' ');
    if (LEGS.test(src)) return '腿';
    if (PUSH.test(src) && PULL.test(src)) return '上';
    if (PUSH.test(src)) return '推';
    if (PULL.test(src)) return '拉';
    if (/core|abs|核心|腹/i.test(src)) return '核';
    if (/full|全身/i.test(src)) return '全';
    return '練';
};
export const strengthTitle = (s = {}) => ({
    推: '推（胸・肩）', 拉: '拉（背）', 腿: '腿', 上: '上半身', 核: '核心', 全: '全身', 練: '重訓',
}[strengthGlyph(s)]);

const runKm = (s) => num(s?.metrics?.distance ?? s?.metrics?.distance_km ?? s?.distance);
const runSec = (s) => num(s?.metrics?.duration ?? s?.metrics?.duration_seconds ?? s?.duration);
const runPace = (s) => {
    let p = num(s?.metrics?.avgPace || s?.metrics?.pace_per_km || s?.metrics?.pace || s?.metrics?.avg_pace || s?.avg_pace);
    if (!(p >= 120 && p <= 1200)) { const km = runKm(s), sec = runSec(s); p = km > 0 && sec > 0 ? sec / km : 0; }
    return p >= 120 && p <= 1200 ? Math.round(p) : 0;
};
export const fmtPace = (sec) => (sec > 0 ? `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"` : '—');
export const fmtClock = (sec) => {
    const s = Math.round(num(sec)); if (!(s > 0)) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * @returns {Map<dayKey, {sessions:[{s, kind, glyph, title, prs:[], gains:[], summary}], pr:boolean, gain:string|null}>}
 */
export function buildHistoryDays(sessions = []) {
    const dated = sessions
        .map((s) => ({ s, d: parseSessionDate(s) }))
        .filter((x) => x.d)
        .sort((a, b) => a.d - b.d);                  // 舊 → 新，才知道「上一次」是哪次

    const lastE1rm = new Map();   // 動作 → 上一次最佳 e1RM
    const runs = [];              // 過去的跑步 {km, pace}
    const days = new Map();

    for (const { s, d } of dated) {
        const key = toLocalDateKey(d);
        const strength = isStrengthSession(s);
        const prs = (Array.isArray(s.medals) ? s.medals : []).filter((m) => m?.rank === 'PR')
            .map((m) => ({ key: normExerciseName(m.label), label: toZhExerciseName(m.label) || m.label, detail: m.detail || '' }));
        const gains = [];
        let entry;

        if (strength) {
            const exercises = parseExercises(s.raw || s);
            const lines = [];
            for (const ex of exercises) {
                const name = ex.name || ex.exercise_name;
                const k = normExerciseName(name);
                const best = bestSetOf(ex);
                if (!k || !best) continue;
                const prev = lastE1rm.get(k);
                if (prev > 0 && best.e1rm - prev >= 0.5) {
                    gains.push({ key: k, label: toZhExerciseName(name) || name, from: r1(prev), to: r1(best.e1rm), delta: r1(best.e1rm - prev), unit: 'kg' });
                }
                lastE1rm.set(k, best.e1rm);
                lines.push({ name: toZhExerciseName(name) || name, best: `${best.weight}kg × ${best.reps}` });
            }
            gains.sort((a, b) => b.delta - a.delta);
            // 破紀錄的動作，進步幅度併進那一行，不再另外列一次
            for (const p of prs) {
                const g = gains.find((x) => x.key === p.key);
                if (g) p.gain = g.delta;
            }
            const shownGains = gains.filter((g) => !prs.some((p) => p.key === g.key));
            const vol = num(s.metrics?.volume), sets = num(s.metrics?.sets), dur = num(s.metrics?.duration);
            entry = {
                s, kind: 'strength', glyph: strengthGlyph(s), title: strengthTitle(s), prs, gains: shownGains, lines,
                stats: [
                    vol > 0 && { v: Math.round(vol).toLocaleString(), l: '總容量 kg' },
                    sets > 0 && { v: String(sets), l: '組' },
                    dur > 0 && { v: fmtClock(dur), l: '時間' },
                ].filter(Boolean),
                gainShort: gains.length ? `+${gains[0].delta}` : null,
            };
        } else {
            const km = runKm(s), pace = runPace(s), sec = runSec(s);
            if (km > 0 && pace > 0) {
                const prev = [...runs].reverse().find((r) => r.km >= km * 0.75 && r.km <= km * 1.25);
                if (prev && prev.pace - pace >= 3) {
                    gains.push({ label: `配速（跟上次 ${r1(prev.km)} 公里比）`, from: fmtPace(prev.pace), to: fmtPace(pace), delta: prev.pace - pace, unit: '秒/公里' });
                }
                runs.push({ km, pace });
            }
            const sport = String(s.sport || s.sportType || s.type || 'running').toLowerCase();
            const sportZh = /walk/.test(sport) ? '走路' : /cycl|bike/.test(sport) ? '騎車' : /swim/.test(sport) ? '游泳' : '跑步';
            entry = {
                s, kind: 'run', glyph: sportZh[0], title: km > 0 ? `${sportZh} ${r1(km)} 公里` : sportZh, prs, gains, lines: [],
                km,
                stats: [
                    km > 0 && { v: r1(km).toFixed(1), l: '公里' },
                    sec > 0 && { v: fmtClock(sec), l: '時間' },
                    pace > 0 && { v: fmtPace(pace), l: '配速' },
                ].filter(Boolean),
                gainShort: gains.length ? `快${gains[0].delta}秒` : null,
            };
        }

        const day = days.get(key) || { key, date: d, sessions: [], pr: false, gain: null };
        day.sessions.push(entry);
        day.pr = day.pr || prs.length > 0;
        day.gain = day.gain || entry.gainShort;
        days.set(key, day);
    }
    return days;
}

/** 某個月的格子（週一起算，前後補空格）。 */
export function monthGrid(year, month) {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;                   // 週一＝0
    const n = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= n; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7) cells.push(null);
    return cells;
}

/** 這個月的小結：練了幾天、幾次重訓、跑了幾公里、破了幾次紀錄。 */
export function monthSummary(days, year, month) {
    let trainDays = 0, strength = 0, km = 0, prs = 0;
    for (const day of days.values()) {
        if (day.date.getFullYear() !== year || day.date.getMonth() !== month) continue;
        trainDays++;
        day.sessions.forEach((e) => {
            if (e.kind === 'strength') strength++; else km += e.km || 0;
            prs += e.prs.length;
        });
    }
    return { trainDays, strength, km: r1(km), prs };
}
