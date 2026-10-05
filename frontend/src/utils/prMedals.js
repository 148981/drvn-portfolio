/**
 * ══════════════════════════════════════════════════════════════════════════
 * prMedals.js — 破紀錄 → 金銀銅獎牌的「單一真相源」（跑步 ＋ 重訓共用）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼有這支（2026-09 動態卡稽核）：
 *
 * 「破紀錄」在專案裡有三套各自為政的答案：
 *   • 有氧  後端 cardio_storage.compute_session_medals() 存進 metrics.medals
 *           （PR / 2nd / 3rd，語意完整）
 *   • 重訓  前端 strengthCoachEngine 產 pr_alerts（只有「破了」，沒有名次）
 *   • 動態卡 只讀 s.medals / s.metrics.medals →
 *           **重訓卡永遠拿不到獎牌**，因為重訓從來不寫這個欄位。
 *
 * 於是同一件事（我這場破了紀錄）在跑步卡上有金牌、在重訓卡上什麼都沒有。
 * 這支把兩邊收斂成同一個形狀：
 *
 *     { key, label, rank: 'PR'|'2nd'|'3rd', detail }
 *
 * 名次語意兩邊一致（照抄後端的定義）：
 *   PR  = 歷來第 1 名（金）   2nd = 第 2 名（銀）   3rd = 第 3 名（銅）
 *   進不了前三 → 沒有獎牌。**不會有「比上次多 0%」這種安慰獎**（鐵律 2）。
 *
 * 誠實規則（三條，違反就不給獎牌）：
 *   1. 只跟「這場之前」的紀錄比 —— 排序後單向掃描，本場算完才寫進歷史，
 *      結構上不可能發生 pitfalls.md 說的「跟自己比」。
 *   2. 第一次做的動作不給金牌 —— 沒有對手的第一名不是成就，是噪音。
 *   3. 估不出可信數字的組不納入（強度靠 strengthMath 的 e1RM 有效區間把關）。
 */

import { epleyE1RM, isValidE1RMSet } from './strengthMath';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// ── 名次語彙 ──────────────────────────────────────────────────────────────
const RANK_BY_PLACE = { 1: 'PR', 2: '2nd', 3: '3rd' };
export const RANK_ORDER = { PR: 0, '1st': 0, '2nd': 1, '3rd': 2 };
export const RANK_ZH = { PR: '金牌', '2nd': '銀牌', '3rd': '銅牌' };

/** 各種寫法的名次 → 正規化成 'PR' | '2nd' | '3rd'；不是前三名回 null。 */
export const normalizeRank = (rank) => {
    const k = String(rank ?? '').toLowerCase();
    if (k === 'pr' || k === '1st' || k === '1' || k === 'gold') return 'PR';
    if (k === '2nd' || k === '2' || k === 'silver') return '2nd';
    if (k === '3rd' || k === '3' || k === 'bronze') return '3rd';
    return null;
};

/**
 * mine 在 previous（**不含自己**）之中排第幾；進不了前三回 null。
 * higherIsBetter=true  → 重量/訓練量/距離（越大越好）
 * higherIsBetter=false → 完成時間（越小越好）
 */
const rankAmong = (previous, mine, higherIsBetter = true) => {
    if (!(mine > 0)) return null;
    const better = previous.filter((v) => (
        higherIsBetter ? v > mine : (v > 0 && v < mine)
    )).length;
    return RANK_BY_PLACE[better + 1] || null;
};

const sortMedals = (medals) => medals
    .filter((m) => m && m.rank)
    .sort((a, b) => (RANK_ORDER[a.rank] ?? 9) - (RANK_ORDER[b.rank] ?? 9));

/** 一組獎牌 → { gold, silver, bronze, total, prCount, best }（卡片摘要用）。 */
export const summarizeMedals = (medals = []) => {
    const gold = medals.filter((m) => m.rank === 'PR').length;
    const silver = medals.filter((m) => m.rank === '2nd').length;
    const bronze = medals.filter((m) => m.rank === '3rd').length;
    return {
        gold, silver, bronze,
        total: gold + silver + bronze,
        prCount: gold,
        best: gold > 0 ? 'PR' : silver > 0 ? '2nd' : bronze > 0 ? '3rd' : null,
    };
};

// ══════════════════════════════════════════════════════════════════════════
// 🏋️ 重訓
// ══════════════════════════════════════════════════════════════════════════

/** 動作名正規化 —— 「槓鈴臥推 」和「槓鈴臥推」是同一個動作，不能各排各的名次。 */
export const normExerciseName = (name) =>
    String(name ?? '').trim().toLowerCase().replace(/\s+/g, '');

/**
 * exercises 可能是陣列、也可能是 JSON 字串（後端存 DB 時序列化過）。
 * ⚠ 這正是「分享按完返回找不到頁面」的成因：字串沒有 .map()，
 *   直接 (rec.exercises || []).map(...) 會丟 TypeError 把整頁炸掉。
 */
export const parseExercises = (rec = {}) => {
    let ex = rec?.exercises ?? rec?.completedExercises;
    if (typeof ex === 'string') { try { ex = JSON.parse(ex); } catch { ex = []; } }
    return Array.isArray(ex) ? ex : [];
};

/** 該動作「真的做完」的組（未完成的不能拿去破紀錄）。 */
const completedSetsOf = (ex = {}) => {
    const sets = (Array.isArray(ex.sets) && ex.sets.length)
        ? ex.sets
        : (Array.isArray(ex.detailedSets) ? ex.detailedSets : []);
    return sets.filter((s) => s && s.completed !== false && num(s.weight) > 0 && num(s.reps) > 0);
};

/** 該動作本場最佳的一組（以 e1RM 比較，不是以最大重量 —— 100×1 vs 90×5 要看 e1RM）。 */
export const bestSetOf = (ex) => {
    let best = null;
    completedSetsOf(ex).forEach((s) => {
        if (!isValidE1RMSet(s)) return;
        const e1rm = epleyE1RM(s.weight, s.reps);
        if (e1rm > 0 && (!best || e1rm > best.e1rm)) {
            best = { e1rm, weight: num(s.weight), reps: Math.round(num(s.reps)) };
        }
    });
    return best;
};

/** 存檔時記下的 pr_alerts（陣列或 JSON 字串）→ 陣列。 */
export const parsePrAlerts = (rec = {}) => {
    let pr = rec?.pr_alerts ?? rec?.prAlerts;
    if (typeof pr === 'string') { try { pr = JSON.parse(pr); } catch { pr = []; } }
    return Array.isArray(pr) ? pr.filter((p) => p && (p.name || p.exercise)) : [];
};

/**
 * 幫「一整批重訓紀錄」標上獎牌。**必須整批一起算** ——
 * 名次只有放回時間軸才有意義，單看一筆紀錄永遠算不出第幾名。
 *
 * @param {object[]} records 已正規化的重訓卡（含 raw / created_at / metrics.volume）
 * @returns {object[]} 同一批物件（原地補上 medals / pr_count / medal_summary）
 */
export function annotateStrengthMedals(records = [], { minHistoryForVolume = 3 } = {}) {
    const dated = records
        .map((r) => ({ r, t: Date.parse(r?.created_at ?? r?.timestamp ?? r?.date ?? '') || 0 }))
        .sort((a, b) => a.t - b.t);                       // 舊 → 新，單向掃描

    const pastByExercise = new Map();   // normName → 過去各場的最佳 e1RM[]
    const pastVolumes = [];             // 過去各場的總訓練量

    dated.forEach(({ r }) => {
        const medals = [];
        const exercises = parseExercises(r.raw || r);
        const medalledNames = new Set();

        // ① 逐動作：本場最佳 e1RM 在「這個動作的歷史」裡排第幾
        exercises.forEach((ex) => {
            const best = bestSetOf(ex);
            if (!best) return;
            const key = normExerciseName(ex.name || ex.exercise_name);
            if (!key) return;
            const past = pastByExercise.get(key) || [];
            // 誠實規則 2：第一次做的動作沒有對手，不發金牌
            if (past.length >= 1) {
                const rank = rankAmong(past, best.e1rm, true);
                if (rank) {
                    medals.push({
                        key: `EX:${key}`,
                        label: String(ex.name || ex.exercise_name).trim(),
                        rank,
                        detail: `${best.weight}kg × ${best.reps}`,
                        e1rm: best.e1rm,
                    });
                    medalledNames.add(key);
                }
            }
            past.push(best.e1rm);
            pastByExercise.set(key, past);
        });

        // ② 整場訓練量：要有夠長的歷史才有「名次」可言
        /* ② 整場訓練量：**只發金牌，而且要真的贏過去最好的 3%**。
              給銀銅或給「贏 0.5 公斤」的金牌，等於每一場都有獎牌 ——
              獎牌到處都是就等於沒有獎牌，使用者很快就不看了。
              3% 這個門檻取自進步金字塔的容量標準，不是隨手訂的。 */
        const vol = num(r?.metrics?.volume ?? r?.total_volume ?? r?.volume);
        if (vol > 0) {
            if (pastVolumes.length >= minHistoryForVolume) {
                const bestBefore = Math.max(...pastVolumes);
                if (vol >= bestBefore * 1.03) {
                    medals.push({
                        key: 'VOLUME',
                        label: '單場訓練量',
                        rank: 'PR',
                        detail: `${Math.round(vol).toLocaleString()} kg`,
                    });
                }
            }
            pastVolumes.push(vol);
        }

        // ③ 舊紀錄退路：沒有逐組明細、算不出 e1RM 時，用存檔當下的 pr_alerts 補金牌。
        //    （只補「還沒被 ① 標到」的動作，避免同一個動作出現兩面獎牌）
        parsePrAlerts(r.raw || r).forEach((a) => {
            const name = a.name || a.exercise;
            const key = normExerciseName(name);
            if (!key || medalledNames.has(key)) return;
            const newPR = num(a.newPR ?? a.new_pr);
            medals.push({
                key: `EX:${key}`,
                label: name,
                rank: 'PR',
                detail: newPR > 0 ? `${newPR}kg` : '',
            });
            medalledNames.add(key);
        });

        r.medals = sortMedals(medals);
        r.medal_summary = summarizeMedals(r.medals);
        r.pr_count = r.medal_summary.prCount;
        if (r.metrics) r.metrics.pr_count = r.pr_count;
    });

    return records;
}

// ══════════════════════════════════════════════════════════════════════════
// 🏃 有氧
// ══════════════════════════════════════════════════════════════════════════

// 與後端 cardio_storage._PR_DISTANCES 同一份定義（改一邊要改兩邊）
const PR_DISTANCES = [
    { key: '1K', km: 1.0, min: 0.95, label: '1 公里最快' },
    { key: '3K', km: 3.0, min: 2.88, label: '3 公里最快' },
    { key: '5K', km: 5.0, min: 4.8, label: '5 公里最快' },
    { key: '10K', km: 10.0, min: 9.5, label: '10 公里最快' },
    { key: 'HALF', km: 21.0975, min: 20.5, label: '半馬' },
    { key: 'FULL', km: 42.195, min: 41.0, label: '全馬' },
];

const fmtClock = (sec) => {
    const s = Math.round(num(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${m}:${String(ss).padStart(2, '0')}`;
};

/**
 * 這一場在某個距離的成績（秒）。**誠實版**，刻意比後端保守：
 * 前端沒有可信的逐公里分段（很多舊紀錄的 splits 是把平均塞回每一段），
 * 所以只承認「整趟距離本來就約等於該距離」的成績，
 * 絕不用平均配速去「估」一個從沒真的連續跑出來的 5K 最快值。
 */
const finishTimeFor = (metrics = {}, targetKm) => {
    const dist = num(metrics.distance ?? metrics.distance_km);
    const dur = num(metrics.duration ?? metrics.duration_seconds);
    if (!(dist > 0) || !(dur > 0)) return 0;
    if (dist < targetKm * 0.95) return 0;    // 沒跑到這個距離
    if (dist > targetKm * 1.15) return 0;    // 跑更遠 → 整段時間不是這個距離的成績
    return dur * (targetKm / dist);
};

/** 後端已存的 medals → 正規化（後端算過的最權威，前端不重算）。 */
export const readStoredCardioMedals = (session = {}) => {
    const raw = Array.isArray(session.medals) ? session.medals
        : (Array.isArray(session.metrics?.medals) ? session.metrics.medals : null);
    if (!raw) return null;
    return sortMedals(raw.map((m) => ({ ...m, rank: normalizeRank(m.rank) })));
};

/**
 * 幫「一整批有氧紀錄」標上獎牌。
 * 後端存過 metrics.medals 的直接沿用；沒有的（舊紀錄）在前端補算，
 * 這樣「破紀錄有獎牌」在跑步側不會因為紀錄年份不同而時有時無。
 */
export function annotateCardioMedals(records = []) {
    const dated = records
        .map((r) => ({ r, t: Date.parse(r?.created_at ?? r?.timestamp ?? r?.date ?? '') || 0 }))
        .sort((a, b) => a.t - b.t);

    const pastTimes = new Map();   // distanceKey → 過去成績（秒）[]
    const pastDistances = [];

    dated.forEach(({ r }) => {
        const m = r.metrics || {};
        const stored = readStoredCardioMedals(r);
        const computed = [];

        PR_DISTANCES.forEach((d) => {
            const dist = num(m.distance ?? m.distance_km);
            if (dist < d.min) return;
            const mine = finishTimeFor(m, d.km);
            if (!(mine > 0)) return;
            const past = pastTimes.get(d.key) || [];
            if (past.length >= 1) {
                const rank = rankAmong(past, mine, false);   // 時間越小越好
                if (rank) computed.push({ key: d.key, label: d.label, rank, detail: fmtClock(mine) });
            }
            past.push(mine);
            pastTimes.set(d.key, past);
        });

        /* 最長距離：只發金牌，且要贏過去最遠的 2%。
           5.02 → 5.05 公里也給「最長距離」獎牌，是技術上為真、體感上為假。 */
        const dist = num(m.distance ?? m.distance_km);
        if (dist > 0) {
            if (pastDistances.length >= 1 && dist >= Math.max(...pastDistances) * 1.02) {
                computed.push({ key: 'LONGEST', label: '最長距離', rank: 'PR', detail: `${dist.toFixed(1)} 公里` });
            }
            pastDistances.push(dist);
        }

        // 後端有算過就用後端的（含「當時的名次」語意）；沒有才用前端補算的
        const medals = stored && stored.length ? stored : (stored ? [] : sortMedals(computed));
        r.medals = medals;
        r.medal_summary = summarizeMedals(medals);
        r.pr_count = r.medal_summary.prCount;
        if (r.metrics) r.metrics.pr_count = r.pr_count;
    });

    return records;
}

/**
 * 一批混合紀錄（重訓＋有氧）一次標完。動態卡與社群動態共用這支，
 * 才不會出現「同一場訓練在兩頁的獎牌不一樣」。
 */
export function annotateMedals(sessions = [], isStrength = (s) => {
    const k = String(s?.sport ?? s?.sportType ?? s?.type ?? '').toLowerCase();
    return k === 'strength' || k === 'gym';
}) {
    const strength = sessions.filter(isStrength);
    const cardio = sessions.filter((s) => !isStrength(s));
    annotateStrengthMedals(strength);
    annotateCardioMedals(cardio);
    return sessions;
}

export default {
    RANK_ORDER, RANK_ZH,
    normalizeRank, summarizeMedals,
    normExerciseName, parseExercises, parsePrAlerts, bestSetOf,
    annotateStrengthMedals, annotateCardioMedals, annotateMedals,
    readStoredCardioMedals,
};
