/**
 * nutritionProjection.js — 今日預估目標 ＋ 三條會被運動校準的預估曲線
 * ══════════════════════════════════════════════════════════════════════
 * 解決的問題：
 *   計劃在承諾當下算好一條直線配速，之後就不動了。可是使用者真正練了多少
 *   （重訓幾次、跑了多少）每天都在變 —— 練得比當初假設的多，體重當然走得
 *   比計劃快；練得少就走得慢。畫面上卻只有那條永遠不變的計劃線。
 *
 * 這裡做兩件事：
 *   1. 今日預估目標 —— 照「校準後的配速」，今天應該站在哪
 *   2. 三條預估曲線 —— 體重 / 體脂率 / 骨骼肌，未來幾週大概怎麼走
 *
 * 校準怎麼做（重點：不重複計算）：
 *   計劃的 TDEE ＝ BMR × 1.55（中度活動），本來就已經含了一份「假設的運動量」。
 *   把實際運動消耗直接加上去會重複計算，所以這裡算的是「差額」：
 *     假設的運動量 ≈ BMR × (1.55 − 1.375)   ← 中度活動與輕度活動的差
 *     差額 = 實際每日運動消耗 − 假設的運動量
 *     配速修正 = 差額 × 7 / 7700 kg/週      ← 7700 kcal ≈ 1 kg 體脂
 *   練得比假設多 → 減脂變快 / 增重變慢，反之亦然。
 *
 * 體脂與骨骼肌怎麼分：
 *   體重的變化不會全部是脂肪。分配比例取決於有沒有做阻力訓練 ——
 *   這是運動生理學上最站得住腳的一條，也是「為什麼要重訓」的答案。
 *     減重：每週 ≥2 次重訓 → 85% 脂肪 / 15% 淨體重；不足 → 70% / 30%
 *     增重：每週 ≥3 次重訓 → 50% 淨體重 / 50% 脂肪；不足 → 30% / 70%
 *   骨骼肌約佔淨體重變化的一半（其餘是水分與肝醣），所以 smm ≈ 0.5 × 淨體重變化。
 *
 * 誠實鐵律：
 *   · 起點一律是「最近一次實測」，不是推估值。沒量過就不畫，直接說沒量過。
 *   · 體脂／骨骼肌沒量過就不畫那一條，不用族群平均值頂替。
 *   · 全部標示為估計；這是規劃參考，不是醫療或營養處方。
 */

const DAY = 86400000;
const KCAL_PER_KG_FAT = 7700;

/** 中度活動(1.55) 與 輕度活動(1.375) 的差 —— 計劃裡「已經假設的運動量」。 */
const ASSUMED_EXERCISE_PAL = 1.55 - 1.375;

const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

const parseDate = (v) => {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : NaN;
};

/** 讀 InBody 量測；體重必填，體脂與骨骼肌可有可無（沒有就是 null，不補值）。 */
export function readBodyMeasurements(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        if (!Array.isArray(raw)) return [];
        return raw
            .map((r) => ({
                t: parseDate(r?.measurement_date || r?.date || r?.created_at),
                weight: num(r?.weight_kg ?? r?.weight),
                bodyFat: num(r?.body_fat_percent ?? r?.body_fat_percentage ?? r?.bodyFat),
                smm: num(r?.skeletal_muscle_mass ?? r?.smm),
            }))
            .filter((x) => Number.isFinite(x.t) && x.weight > 30 && x.weight < 300)
            .sort((a, b) => a.t - b.t);
    } catch { return []; }
}

/**
 * 這一期實際的每日運動消耗（kcal/day）與訓練頻率。
 * 重訓與跑步都算；沒有記熱量的場次用保守估值，寧可低估也不要灌水。
 */
export function readTrainingLoad(userId, sinceTs, today = Date.now()) {
    const read = (key) => {
        try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
        catch { return []; }
    };
    const inRange = (r) => {
        const t = parseDate(r?.date || r?.completedAt || r?.timestamp || r?.startTime || r?.ts);
        return Number.isFinite(t) && t >= sinceTs && t <= today;
    };
    const kcal = (r, fallback) => {
        const c = num(r?.calories ?? r?.caloriesBurned ?? r?.calories_burned ?? r?.totalCalories);
        return c != null && c > 0 ? c : fallback;
    };

    const strength = read('workout_history').filter(inRange);
    const cardio = read('cardio_sessions').filter(inRange);

    // 沒記熱量時的保守估值：一場重訓 ~220 kcal、一次跑步 ~300 kcal
    const totalKcal =
        strength.reduce((s, r) => s + kcal(r, 220), 0) +
        cardio.reduce((s, r) => s + kcal(r, 300), 0);

    const days = Math.max(1, (today - sinceTs) / DAY);
    const weeks = Math.max(1, days / 7);

    return {
        strengthSessions: strength.length,
        cardioSessions: cardio.length,
        strengthPerWeek: strength.length / weeks,
        dailyKcal: totalKcal / days,
        days: Math.round(days),
        hasData: strength.length + cardio.length > 0,
    };
}

/** 體重變化怎麼分給脂肪與淨體重 —— 由每週重訓次數決定。 */
export function partitionFor(direction, strengthPerWeek) {
    if (direction === 'up') {
        return strengthPerWeek >= 3
            ? { fat: 0.5, lean: 0.5, note: '每週 3 次以上重訓，增加的重量約一半是淨體重' }
            : { fat: 0.7, lean: 0.3, note: '重訓不足每週 3 次，增加的重量多半是脂肪' };
    }
    return strengthPerWeek >= 2
        ? { fat: 0.85, lean: 0.15, note: '每週 2 次以上重訓，減掉的多半是脂肪' }
        : { fat: 0.7, lean: 0.3, note: '重訓不足每週 2 次，減掉的重量會有三成是肌肉' };
}

/**
 * @param {string} userId
 * @param {object} plan  已承諾的計劃（committedAt / currentWeight / targetWeight / goalType / pace / bmr）
 * @param {{today?:Date, weeksAhead?:number}} opts
 */
export function buildProjection(userId, plan, opts = {}) {
    const today = opts.today ? new Date(opts.today) : new Date();
    const weeksAhead = Math.max(2, Math.min(16, opts.weeksAhead ?? 8));

    const empty = {
        ready: false, reason: 'no_plan',
        todayTarget: null, calibration: null, series: [], hasBodyFat: false, hasSmm: false,
    };
    if (!plan?.committedAt || !(num(plan.targetWeight) > 0)) return empty;

    const from = Number(plan.committedAt);
    const measures = readBodyMeasurements(userId).filter((m) => m.t >= from - 3 * DAY);
    const latest = measures[measures.length - 1] || null;
    if (!latest) return { ...empty, reason: 'no_measurement' };

    const target = num(plan.targetWeight);
    const startWeight = num(plan.currentWeight) ?? latest.weight;
    const direction = target >= startWeight ? 'up' : 'down';
    const dirSign = direction === 'up' ? 1 : -1;
    const planPace = Math.abs(num(plan.pace) || 0);           // kg/週（正值）

    // ── 校準：實際運動消耗 vs 計劃已經假設的運動消耗 ──────────────────
    const load = readTrainingLoad(userId, from, today.getTime());
    const bmr = num(plan.bmr) || null;
    const assumedDailyKcal = bmr ? bmr * ASSUMED_EXERCISE_PAL : null;
    const burnDeltaKcal = assumedDailyKcal != null ? load.dailyKcal - assumedDailyKcal : 0;
    // 練得多 → 減重更快 / 增重更慢
    const paceAdjust = (burnDeltaKcal * 7) / KCAL_PER_KG_FAT * (direction === 'up' ? -1 : 1);
    // 校準後的配速不可以是負的（那代表往反方向走，那是實測的事，不是預估的事）
    const rawPace = planPace + paceAdjust;
    const pace = Math.max(0, rawPace);
    const calibrated = assumedDailyKcal != null && load.hasData;

    const part = partitionFor(direction, load.strengthPerWeek);

    // ── 今日預估目標：從最近一次實測往前推到今天 ──────────────────────
    const daysSinceMeasure = Math.max(0, (today.getTime() - latest.t) / DAY);
    const weeksSinceMeasure = daysSinceMeasure / 7;
    const gapToTarget = Math.abs(target - latest.weight);
    const movedToday = Math.min(pace * weeksSinceMeasure, gapToTarget);

    const fatMass = latest.bodyFat != null ? (latest.weight * latest.bodyFat) / 100 : null;
    const projectAt = (deltaKg) => {
        const w = latest.weight + dirSign * deltaKg;
        let bf = null, smm = null;
        if (fatMass != null) {
            const newFat = Math.max(0, fatMass + dirSign * deltaKg * part.fat);
            bf = w > 0 ? Math.max(3, Math.min(60, (newFat / w) * 100)) : null;
        }
        if (latest.smm != null) {
            // 骨骼肌約佔淨體重變化的一半（其餘是水分與肝醣）
            smm = Math.max(5, latest.smm + dirSign * deltaKg * part.lean * 0.5);
        }
        return { weight: r1(w), bodyFat: bf != null ? r1(bf) : null, smm: smm != null ? r1(smm) : null };
    };

    const todayTarget = {
        ...projectAt(movedToday),
        actualWeight: r1(latest.weight),
        actualBodyFat: latest.bodyFat != null ? r1(latest.bodyFat) : null,
        actualSmm: latest.smm != null ? r1(latest.smm) : null,
        measuredDaysAgo: Math.round(daysSinceMeasure),
    };

    // ── 三條預估曲線：從量測當週往後推 weeksAhead 週 ──────────────────
    const series = [];
    const baseWeek = Math.floor((latest.t - from) / (7 * DAY));
    for (let i = 0; i <= weeksAhead; i++) {
        const moved = Math.min(pace * i, gapToTarget);
        const p = projectAt(moved);
        // 同一週如果有實測，把實測也放進去（實線 vs 虛線分得開）
        const wFrom = latest.t + (i - 0.5) * 7 * DAY;
        const wTo = latest.t + (i + 0.5) * 7 * DAY;
        const hit = measures.filter((m) => m.t >= wFrom && m.t < wTo).pop();
        series.push({
            week: baseWeek + i,
            weight: p.weight,
            bodyFat: p.bodyFat,
            smm: p.smm,
            actualWeight: hit ? r1(hit.weight) : null,
            actualBodyFat: hit?.bodyFat != null ? r1(hit.bodyFat) : null,
            actualSmm: hit?.smm != null ? r1(hit.smm) : null,
            isPast: latest.t + i * 7 * DAY <= today.getTime(),
        });
    }

    return {
        ready: true,
        reason: null,
        todayTarget,
        hasBodyFat: latest.bodyFat != null,
        hasSmm: latest.smm != null,
        series,
        calibration: {
            calibrated,
            planPace: r1(planPace),
            pace: r1(pace),
            paceAdjust: Math.round(paceAdjust * 100) / 100,
            dailyBurn: Math.round(load.dailyKcal),
            assumedBurn: assumedDailyKcal != null ? Math.round(assumedDailyKcal) : null,
            strengthSessions: load.strengthSessions,
            cardioSessions: load.cardioSessions,
            strengthPerWeek: Math.round(load.strengthPerWeek * 10) / 10,
            partition: part,
            direction,
            // 一句話說明校準的方向，UI 直接拿去用（不用自己再算一次）
            text: !calibrated
                ? '還沒有足夠的訓練紀錄，先照原訂配速估'
                : Math.abs(paceAdjust) < 0.02
                    ? '訓練量和當初假設差不多，配速照原訂估'
                    : (paceAdjust > 0
                        ? `訓練量高於當初假設，每週多估 ${r1(Math.abs(paceAdjust))} kg`
                        : `訓練量低於當初假設，每週少估 ${r1(Math.abs(paceAdjust))} kg`),
        },
    };
}

export default buildProjection;
