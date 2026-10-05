// ══════════════════════════════════════════════════════════════════════════
// 🎚 runnerLevel — 「跟得上」的難度推導與初學者保護
//
// 使用者要求原文：
//   「跑步計劃生成系統應該要讓使用者有跟得上的感覺，而且是根據跑齡、
//     平均週跑量、還有一開始選擇的目標去做智慧調整計劃的難易度。
//     不要讓使用者一開始就有做不到的感覺 —— 像是初學者可能就算
//     一個禮拜五公里對他們來說都有困難了。如果是初學者，
//     要讓他們先相信自己做得到。」
//
// 設計原則：
//   1. 難度由「真實輸入」決定，不由使用者的野心決定。
//      想跑全馬不代表身體現在能承受全馬課表。
//   2. 兩個維度不一致時取「較保守」的那一級 —— 寧可太簡單，
//      也不要第一週就讓人放棄。做得到才會有下一週。
//   3. 初學者保護是硬規則，目標無法覆蓋它。
//   4. 不拒絕任何目標。想跑半馬就給他通往半馬的第 1 階段，
//      並誠實說明這是第幾階段 —— 誠實但不潑冷水。
// ══════════════════════════════════════════════════════════════════════════

import { reconcileSubtypeWithDistance, titleForRun } from './runDistanceClass';

export const LEVELS = ['beginner', 'intermediate', 'advanced'];
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

/** 跑齡（年）→ 級別 */
export const levelFromExperience = (years) => {
    // 沒填跑齡＝不表態（null），不是「初學者」。
    //   以前沒填就當初學者，週跑 40 公里的人第 1 週被排成 9 公里。
    if (years == null || years === '') return null;
    const y = Number(years);
    if (!Number.isFinite(y)) return null;
    if (y < 0.5) return 'beginner';
    if (y <= 2) return 'intermediate';
    return 'advanced';
};

/** 平均週跑量（km）→ 級別 */
export const levelFromWeeklyKm = (km) => {
    const v = Number(km);
    if (!Number.isFinite(v) || v < 10) return 'beginner';
    if (v <= 30) return 'intermediate';
    return 'advanced';
};

/** 最近一次 5K 配速（秒/公里）→ 級別。實測成績是「現況體能」的硬證據，
 *  sub-4:30/km(≈sub-22:30 5K)=進階、sub-5:30/km(≈sub-27:30)=中階、更慢/未填=無訊號。 */
export const levelFrom5kPace = (paceSecPerKm) => {
    const p = Number(paceSecPerKm);
    if (!Number.isFinite(p) || p <= 0) return null;   // 沒填就不表態
    if (p < 270) return 'advanced';
    if (p < 330) return 'intermediate';
    return 'beginner';
};

/**
 * 綜合推導級別 —— 兩個維度取「較保守」的那一個。
 *
 * 例：跑齡 3 年但週跑量只有 6km（久沒練了）→ beginner，不是 advanced。
 *     這正是「讓他先相信自己做得到」的關鍵：身體現況比履歷重要。
 *
 * @param {{ runningYears?:number, currentWeeklyKm?:number, goal?:string }} input
 * @returns {{ level, byExperience, byWeeklyKm, reason }}
 */
export const deriveRunnerLevel = ({ runningYears, currentWeeklyKm, pace5kSec, canRun5k = null } = {}) => {
    const byExperience = levelFromExperience(runningYears);
    const byWeeklyKm = levelFromWeeklyKm(currentWeeklyKm);
    const by5k = levelFrom5kPace(pace5kSec);   // 可能為 null（未填）

    /* 🧱 「我還跑不到 5K」—— 使用者親口說的現況，比任何推導都硬。
       連續 5 公里跑不完的人，不管跑齡填幾年、週跑量填多少、目標選全馬，
       都是初學者。這一格不做推導、也不給任何東西抬上去 ——
       抬上去等於第一週就給他做不到的量，然後他就不會有第二週。 */
    if (canRun5k === false) {
        return {
            level: 'beginner',
            byExperience, byWeeklyKm, by5k,
            canRun5k: false,
            reason: '你說還跑不到 5K — 第 1 週每趟最多 3 公里、一週 3 趟，前兩週不排間歇。',
        };
    }

    // 先由「跑齡 × 週跑量」取較保守者（避免野心蓋過現況）
    let level = byExperience == null ? byWeeklyKm
        : (LEVEL_RANK[byExperience] <= LEVEL_RANK[byWeeklyKm] ? byExperience : byWeeklyKm);

    // 但實測 5K 是現況體能的硬證據：跑得夠快就往上抬（sub-20 的人不可能是初學者）。
    //   只「抬」不「壓」——慢的 5K 不拿來懲罰跑量已足夠的人。
    let reason;
    if (by5k && LEVEL_RANK[by5k] > LEVEL_RANK[level]) {
        reason = `你最近的 5K 成績已達${LEVEL_ZH[by5k]}水準 — 用實測體能而非跑齡來排課，起點不會被低估。`;
        level = by5k;
    } else if (byExperience == null) {
        reason = `依目前週跑量判定為${LEVEL_ZH[level]}。`;
    } else if (byExperience === byWeeklyKm) {
        reason = `跑齡與目前週跑量一致，判定為${LEVEL_ZH[level]}。`;
    } else if (level === byWeeklyKm) {
        reason = `雖然有跑步經驗，但目前週跑量偏低 — 先從${LEVEL_ZH[level]}的量開始，身體回來得比記憶快。`;
    } else {
        reason = `跑量夠但經驗還在累積 — 先用${LEVEL_ZH[level]}的節奏把技術與恢復顧好。`;
    }
    return { level, byExperience, byWeeklyKm, by5k, reason };
};

export const LEVEL_ZH = { beginner: '初學者', intermediate: '中階', advanced: '進階' };

// ══════════════════════════════════════════════════════════════════════════
// 🛡 初學者保護條款（硬規則，目標不可覆蓋）
// ══════════════════════════════════════════════════════════════════════════
export const BEGINNER_GUARD = {
    /** 第 1 週總里程不得超過現況的幾倍 */
    week1MaxRatio: 1.1,
    /** 完全沒跑步習慣時的第 1 週保底總量（km） */
    week1FloorKm: 6,
    /** 第 1 週單次跑步上限（km） */
    week1MaxSingleKm: 3,
    /** 第 1 週最多跑幾次 */
    week1MaxSessions: 3,
    /** 前幾週不排任何間歇 / 節奏（只有輕鬆跑與恢復跑） */
    noQualityWeeks: 2,
    /** 每週成長率上限 */
    maxRampRate: 0.08,
};

/**
 * 算出「第 1 週的安全上限」。
 * @returns {{ maxWeekKm, maxSingleKm, maxSessions, applied:boolean, note:string }}
 */
export const week1Ceiling = (level, currentWeeklyKm) => {
    const cur = Number(currentWeeklyKm);
    const hasBaseline = Number.isFinite(cur) && cur > 0;

    if (level !== 'beginner') {
        // 非初學者也不該一開始就暴衝：第 1 週最多是現況的 1.1 倍。
        //   但週量很小時（每週 1–4 公里）1.1 倍連一趟 2 公里都排不出來 → 允許 +2 公里、最多到 5 公里
        //   （= 引擎的最低起步量 MIN_START_KM），讓第 1 週至少是一趟像樣的課。
        const maxWeekKm = hasBaseline ? Math.round(Math.max(cur * 1.1, Math.min(cur + 2, 5)) * 10) / 10 : null;
        return {
            maxWeekKm,
            maxSingleKm: null,
            maxSessions: null,
            applied: false,
            note: hasBaseline ? '第 1 週從你目前的量接手，不做跳躍。' : '',
        };
    }

    // 初學者：取「現況 × 1.1」與保底值的較大者，但單次與次數硬限制
    const maxWeekKm = hasBaseline
        ? Math.max(BEGINNER_GUARD.week1FloorKm * 0.5, Math.round(cur * BEGINNER_GUARD.week1MaxRatio * 10) / 10)
        : BEGINNER_GUARD.week1FloorKm;

    return {
        maxWeekKm,
        maxSingleKm: BEGINNER_GUARD.week1MaxSingleKm,
        maxSessions: BEGINNER_GUARD.week1MaxSessions,
        applied: true,
        note: hasBaseline
            ? `第 1 週 ${maxWeekKm} 公里 — 只比你現在多一點點。先做得到，再談變強。`
            : `第 1 週 ${maxWeekKm} 公里、每次不超過 3 公里 — 這是刻意設計的簡單，讓身體先習慣。`,
    };
};

/**
 * 目標與現況的落差說明 —— 不拒絕目標，但誠實說這是第幾階段。
 * @returns {{ staged:boolean, stageNote:string }}
 */
export const goalStaging = (goal, level) => {
    const bigGoals = new Set(['race_half', 'race_full', 'half', 'full']);
    if (!bigGoals.has(goal) || level !== 'beginner') {
        return { staged: false, stageNote: '' };
    }
    const name = /full/.test(goal) ? '全馬' : '半馬';
    return {
        staged: true,
        stageNote: `這是通往${name}的第 1 階段。前 4 週先把「能連續跑 30 分鐘」練穩 — `
            + `這個地基打好，後面的里程才堆得上去。我們會一階一階帶你過去。`,
    };
};

/**
 * 把保護條款套到一份已生成的計劃上（在引擎產出之後執行）。
 * 只動第 1 週與前 noQualityWeeks 週，其餘交給引擎的成長軌道。
 *
 * @param {object} plan 引擎產出的計劃
 * @param {{ level, currentWeeklyKm }} ctx
 * @returns {object} 調整後的計劃（不修改原物件）
 */
export const applyBeginnerGuard = (plan, { level, currentWeeklyKm } = {}) => {
    if (!plan?.weeks?.length) return plan;
    const ceil = week1Ceiling(level, currentWeeklyKm);
    if (!ceil.maxWeekKm) return plan;

    const next = JSON.parse(JSON.stringify(plan));
    const w1 = next.weeks[0];

    // ── 第 1 週：總量、單次、次數三重上限 ──
    if (w1?.bricks?.length) {
        let runBricks = w1.bricks.filter((b) => b.distance_km != null);

        // ① 次數上限：超過的跑步磚移除（保留最短的幾個，先建立習慣）
        if (ceil.maxSessions && runBricks.length > ceil.maxSessions) {
            const keep = new Set(
                runBricks
                    .slice()
                    .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0))
                    .slice(0, ceil.maxSessions)
                    .map((b) => b.brick_id)
            );
            w1.bricks = w1.bricks.filter((b) => b.distance_km == null || keep.has(b.brick_id));
            runBricks = w1.bricks.filter((b) => b.distance_km != null);
        }

        // ② 單次上限
        if (ceil.maxSingleKm) {
            runBricks.forEach((b) => {
                if (b.distance_km > ceil.maxSingleKm) b.distance_km = ceil.maxSingleKm;
            });
        }

        // ③ 總量上限：等比縮放
        const total = runBricks.reduce((s, b) => s + (b.distance_km || 0), 0);
        if (total > ceil.maxWeekKm && total > 0) {
            const scale = ceil.maxWeekKm / total;
            runBricks.forEach((b) => {
                b.distance_km = Math.max(1, Math.round(b.distance_km * scale * 2) / 2);
            });
        }

        w1.target_mileage_km = Math.round(
            w1.bricks.reduce((s, b) => s + (b.distance_km || 0), 0) * 10
        ) / 10;
    }

    // 里程被壓過之後，課別與名稱必須跟著重算 —— 不然會出現
    // 「3 公里 長跑」這種被保護條款削短、名字卻沒改的矛盾。
    next.weeks.forEach((w) => {
        (w.bricks || []).forEach((b) => {
            if (b.distance_km == null) return;
            const resolved = reconcileSubtypeWithDistance(b.subtype || b.type, b.distance_km);
            b.subtype = resolved;
            b.title = titleForRun(resolved, b.distance_km);
        });
    });

    // ── 前 N 週：拿掉所有 quality（間歇 / 節奏）──
    if (level === 'beginner') {
        for (let i = 0; i < Math.min(BEGINNER_GUARD.noQualityWeeks, next.weeks.length); i++) {
            const w = next.weeks[i];
            (w.bricks || []).forEach((b) => {
                if (b.subtype === 'interval' || b.subtype === 'tempo') {
                    b.subtype = 'easy';
                    b.type = 'recovery';
                    b.rpe_band = { min: 5, max: 6, label: '輕鬆', color: '#D8F382' };
                }
            });
        }
    }

    next.meta = {
        ...next.meta,
        beginner_guard_applied: ceil.applied,
        week1_ceiling_km: ceil.maxWeekKm,
        week1_note: ceil.note,
    };
    return next;
};

// ══════════════════════════════════════════════════════════════════════════
// 📅 建議週期長度 —— 「幾週」不該由使用者憑感覺猜
//
// 使用者要求：「圖五這邊也要根據他是什麼樣的跑者去推薦建議的週期」。
//
// 兩件事決定它：
//   1. 目標需要多少跑道。半馬的長跑進程不是 8 週練得完的；
//      打底型目標則是越長越好，但太長會先失去耐心。
//   2. 這個人撐不撐得住那麼久。初學者的第一期要短一點 ——
//      先拿到一次「我做完了」，比一次做很久重要。
//
// 回傳的週數一定落在 WEEK_OPTIONS（4/6/8/10/12/14）裡面，
// 否則畫面上會標在一個點不到的位置。
// ══════════════════════════════════════════════════════════════════════════
export const CYCLE_WEEK_OPTIONS = [4, 6, 8, 10, 12, 14];

const CYCLE_TABLE = {
    fat_loss:     { beginner: 8,  intermediate: 8,  advanced: 12 },
    aerobic_base: { beginner: 8,  intermediate: 12, advanced: 12 },
    race_5k_10k:  { beginner: 8,  intermediate: 10, advanced: 12 },
    race_half:    { beginner: 12, intermediate: 12, advanced: 14 },
    race_full:    { beginner: 14, intermediate: 14, advanced: 14 },
};

/* ⚠️ 每一句都收 weeks 當參數，句子裡的數字一律用它。
   寫死數字的話，「進階 ＋ 5K/10K」會拿到 12 週卻讀到「10 週夠做完一輪」——
   圖說 12、字說 10，使用者只會不知道該信哪一個。 */
const CYCLE_WHY = {
    race_full:   (lv, w) => `全馬的長跑進程最少要 ${w} 週堆得完。`,
    race_half:   (lv, w) => (lv === 'advanced'
        ? `半馬想跑出成績，${w} 週才有完整的巔峰期。`
        : `半馬的長跑要 ${w} 週才堆得到 30 公里／週。`),
    race_5k_10k: (lv, w) => (lv === 'beginner'
        ? `先用 ${w} 週把跑量墊起來，速度課留到下一期。`
        : `${w} 週剛好跑完一輪速度進程，又不會拖到失去耐心。`),
    aerobic_base: (lv, w) => (lv === 'beginner'
        ? `第一期 ${w} 週就好 —— 先拿到一次「我做完了」。`
        : `打底靠時間，${w} 週的有氧累積才看得出變化。`),
    fat_loss:    (lv, w) => (lv === 'advanced'
        ? `${w} 週足夠讓體組成的變化穩定下來。`
        : `${w} 週看得到變化，也還撐得住不放棄。`),
};

/**
 * @returns {{ weeks:number, why:string }}
 */
export const recommendCycleWeeks = ({ goal, level } = {}) => {
    const lv = LEVELS.includes(level) ? level : 'beginner';
    const row = CYCLE_TABLE[goal] || CYCLE_TABLE.aerobic_base;
    const raw = row[lv] ?? 8;
    // 一定要落在可點的選項上，否則「建議」標記會標在沒有按鈕的地方
    const weeks = CYCLE_WEEK_OPTIONS.includes(raw)
        ? raw
        : CYCLE_WEEK_OPTIONS.reduce((best, w) => (Math.abs(w - raw) < Math.abs(best - raw) ? w : best), CYCLE_WEEK_OPTIONS[0]);
    const why = (CYCLE_WHY[goal] || CYCLE_WHY.aerobic_base)(lv, weeks);
    return { weeks, why };
};
