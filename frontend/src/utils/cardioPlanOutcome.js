// ════════════════════════════════════════════════════════════════════════
//  cardioPlanOutcome.js — 「完成這個計劃之後，你會變成什麼樣子」
//  ─────────────────────────────────────────────────────────────────────
//  使用者在按下「確認計劃」前，唯一真正想知道的問題是：
//     「我花 14 週做完這些，到底換到什麼？」
//
//  這支模組把生成好的計劃換算成「具體、有數字、可驗證」的預期提升。
//  原則：
//    1. 能從計劃直接讀到的（週跑量、最長單次跑、總里程）→ 標為「確定」，
//       那不是預測，那是課表本身寫好的。
//    2. 需要推估的（VO₂max、配速、靜止心率）→ 標為「預估」，並附上依據，
//       絕不給不敢負責的數字。
//    3. 沒有基準線就不硬掰 — 該省略的卡片直接不顯示。
//
//  推估依據：
//    · VO₂max：8–12 週規律耐力訓練，未受訓者 +10~20%、已受訓者 +3~5%
//      (ACSM Guidelines / Milanović et al. 2015 meta-analysis)
//    · 配速：同心率下的速度提升約為 VO₂max 增幅的 0.5–0.7 倍（適應有落差）
//    · 靜止心率：規律有氧 8 週以上，每分鐘下降 2–8 下（依起始體能）
//    · 熱量：跑步約 1.036 kcal × 體重(kg) × 距離(km)
// ════════════════════════════════════════════════════════════════════════

const LEVEL_VO2_GAIN = {
    beginner: 0.15,      // 未受訓者提升空間最大
    intermediate: 0.08,
    advanced: 0.04,      // 已接近天花板，進步靠的是經濟性而非 VO₂max
};

const LEVEL_RHR_DROP = {
    beginner: 6,
    intermediate: 4,
    advanced: 2,
};

const round1 = (v) => Math.round(v * 10) / 10;

/** 秒/公里 → "5'30"/km" */
export const fmtPace = (sec) => {
    if (!sec || !Number.isFinite(sec)) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}'${String(s).padStart(2, '0')}"`;
};

/** 秒 → "24:35" / "1:52:10" */
export const fmtClock = (sec) => {
    if (!sec || !Number.isFinite(sec)) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * 依 Riegel 公式由 5K 成績推估其他距離
 * T2 = T1 × (D2/D1)^1.06
 */
const riegel = (t5kSec, targetKm) => t5kSec * Math.pow(targetKm / 5, 1.06);

/**
 * @param {object} plan  generateCardioPlan() 的輸出
 * @param {object} opts  { weightKg }
 * @returns {{ headline: string, items: Array, disclaimer: string }}
 */
export function projectPlanOutcome(plan, opts = {}) {
    if (!plan?.weeks?.length) return { headline: '', weeksLabel: '', items: [], disclaimer: '', missingWeightForKcal: false };

    const weeks = plan.weeks;
    const totalWeeks = plan.total_weeks || weeks.length;
    const goal = plan.goal;
    const level = plan.current_level || 'intermediate';
    const weightKg = Number(opts.weightKg) > 30 ? Number(opts.weightKg) : null;

    // ★ v2.3 單一真相源 —— 一律讀引擎收斂好的 meta.totals，
    //   不要在這裡自己加總一次（那正是「圖三 6 km / 圖四 6.1 km」的來源）。
    const T = plan.meta?.totals || {};
    const mileages = weeks.map((w) => Number(w.target_mileage_km) || 0);
    const startKm = T.start_km ?? mileages[0] ?? 0;
    const peakKm = T.peak_km ?? Math.max(...mileages);
    const totalKm = T.total_km ?? mileages.reduce((a, b) => a + b, 0);
    const longestRunKm = T.longest_run_km ?? 0;
    const runSessions = T.total_run_sessions ?? 0;
    const strengthSessions = T.total_strength_sessions ?? 0;
    const totalSessions = runSessions + strengthSessions;

    // ── 推估係數：週期越長，適應越完整（12 週為滿分基準，14 週略加成） ──
    const doseFactor = Math.min(1.2, totalWeeks / 12);
    const vo2Gain = (LEVEL_VO2_GAIN[level] ?? 0.08) * doseFactor;   // 0..0.18
    const rhrDrop = Math.round((LEVEL_RHR_DROP[level] ?? 4) * doseFactor);

    const pace5K = Number(plan.meta?.baseline_pace_5k_sec) || null;
    const items = [];

    // ══ 1. 週跑量 — 直接來自課表，確定值 ═══════════════════════════
    items.push({
        key: 'volume',
        certainty: 'certain',
        icon: 'volume',
        accent: '#8BC34A',
        label: '每週跑量',
        from: `${round1(startKm)} km`,
        to: `${round1(peakKm)} km`,
        delta: startKm > 0 ? `${round1(peakKm / startKm)}×` : null,
        note: `${totalWeeks} 週內從你現在的量安全爬升，每次加量都不超過上一個訓練週的 15%。`,
    });

    // ══ 2. 最長單次跑 — 確定值 ════════════════════════════════════
    if (longestRunKm > 0) {
        items.push({
            key: 'long_run',
            certainty: 'certain',
            icon: 'route',
            accent: '#5C6BC0',
            label: '最長單次跑',
            from: null,
            to: `${round1(longestRunKm)} km`,
            delta: null,
            note: '課表中最長的一趟。跑得完它，你的耐力天花板就被往上推了一層。',
        });
    }

    // ══ 3. VO₂max — 預估 ══════════════════════════════════════════
    items.push({
        key: 'vo2max',
        certainty: 'estimated',
        icon: 'lungs',
        accent: '#F06292',
        label: '最大攝氧量 VO₂max',
        from: null,
        to: `+${Math.round(vo2Gain * 100)}%`,
        delta: null,
        note: `以你目前的${level === 'beginner' ? '起步' : level === 'advanced' ? '資深' : '進階'}程度，${totalWeeks} 週規律有氧的典型提升幅度。同樣的配速會變得更輕鬆。`,
    });

    // ══ 4. 輕鬆跑配速 — 有 5K 基準線才給 ═══════════════════════════
    if (pace5K) {
        const easyNow = pace5K + 90;                        // Jack Daniels：easy ≈ 5K pace + 90s
        const easyAfter = easyNow / (1 + vo2Gain * 0.6);    // 配速提升約為 VO₂ 增幅的 0.6 倍
        const gainSec = Math.round(easyNow - easyAfter);
        items.push({
            key: 'easy_pace',
            certainty: 'estimated',
            icon: 'pace',
            accent: '#FF9800',
            label: '同心率下的輕鬆配速',
            from: `${fmtPace(easyNow)}/km`,
            to: `${fmtPace(easyAfter)}/km`,
            delta: `快 ${gainSec} 秒`,
            note: '心率不變、速度變快 — 這是有氧引擎真的變強最誠實的證據。',
        });
    }

    // ══ 5. 目標專屬成果 ═══════════════════════════════════════════
    //   ⚠️ 若引擎判定「這個週期內爬不到賽事的最低準備量」，就不給完賽預估。
    //      在準備量不足的情況下報一個漂亮的完賽時間，是最不負責任的做法。
    const underPrepared = (plan.meta?.safety_flags || [])
        .some((f) => f.code === 'peak_below_race_minimum' || f.underprepared);   // 週數／最長一趟不足也算（raceReadinessFlags）

    if (pace5K && !underPrepared) {
        const t5kNow = pace5K * 5;
        const t5kAfter = t5kNow / (1 + vo2Gain * 0.55);

        if (goal === 'race_5k_10k') {
            items.push({
                key: 'race_5k',
                certainty: 'estimated',
                icon: 'trophy',
                accent: '#C9A227',
                label: '5K 預估成績',
                from: fmtClock(t5kNow),
                to: fmtClock(t5kAfter),
                delta: `進步 ${fmtClock(t5kNow - t5kAfter)}`,
                note: `10K 對應約 ${fmtClock(riegel(t5kAfter, 10))}。以 Riegel 公式由 5K 推算。`,
            });
        } else if (goal === 'race_half') {
            items.push({
                key: 'race_half',
                certainty: 'estimated',
                icon: 'trophy',
                accent: '#C9A227',
                label: '半馬完賽預估',
                from: fmtClock(riegel(t5kNow, 21.1)),
                to: fmtClock(riegel(t5kAfter, 21.1)),
                delta: `進步 ${fmtClock(riegel(t5kNow, 21.1) - riegel(t5kAfter, 21.1))}`,
                note: '前提是完成課表中的長跑段落 — 半馬成績由長跑量決定，不是速度。',
            });
        } else if (goal === 'race_full') {
            items.push({
                key: 'race_full',
                certainty: 'estimated',
                icon: 'trophy',
                accent: '#C9A227',
                label: '全馬完賽預估',
                from: fmtClock(riegel(t5kNow, 42.2)),
                to: fmtClock(riegel(t5kAfter, 42.2)),
                delta: `進步 ${fmtClock(riegel(t5kNow, 42.2) - riegel(t5kAfter, 42.2))}`,
                note: '純數學推算，未計入撞牆與補給。實際成績通常比推算慢 3–8 分鐘。',
            });
        }
    }

    // 準備量不足時，改成誠實的「這個週期能帶你到哪」
    if (underPrepared) {
        items.push({
            key: 'race_gap',
            certainty: 'certain',
            icon: 'trophy',
            accent: '#F95C4B',
            label: '距離完賽準備度',
            from: null,
            to: `尖峰 ${round1(peakKm)} km/週`,
            delta: '尚未達標',
            note: '以你目前的基準線，這個週期還爬不到該賽事建議的最低準備量，所以我們不給完賽時間預估。把它當成第一階段，跑完後再接一期就會到位。',
        });
    }

    // ══ 6. 減脂型：總消耗 ═════════════════════════════════════════
    if (goal === 'fat_loss' && Number(weightKg) > 0) {
        // 沒有真實體重就整項不報 —— 用 65 公斤估出來的熱量不是這個人的數字
        const kcal = Math.round(1.036 * Number(weightKg) * totalKm);
        items.push({
            key: 'burn',
            certainty: 'estimated',
            icon: 'flame',
            accent: '#FF9800',
            label: '整期累積消耗',
            from: null,
            to: `${kcal.toLocaleString()} kcal`,
            delta: `≈ ${round1(kcal / 7700)} kg 脂肪`,
            note: weightKg
                ? '依你的體重與課表總里程推算。飲食維持不變的前提下的理論值。'
                : '以 65 kg 體重推算；在個人資料填入體重後會依你的實際數字重算。',
        });
    }

    // ══ 7. 靜止心率 — 預估 ════════════════════════════════════════
    if (rhrDrop >= 2) {
        items.push({
            key: 'rhr',
            certainty: 'estimated',
            icon: 'heart',
            accent: '#F95C4B',
            label: '靜止心率',
            from: null,
            to: `−${rhrDrop} bpm`,
            delta: null,
            note: '心臟每一下打出的血量變多，所以跳得比較少。這通常是最早出現的變化。',
        });
    }

    // ══ 8. 累積投入 — 確定值 ══════════════════════════════════════
    items.push({
        key: 'commitment',
        certainty: 'certain',
        icon: 'calendar',
        accent: '#7BA05B',
        label: '整期累積',
        from: null,
        to: `${round1(totalKm)} km`,
        delta: strengthSessions > 0
            ? `${runSessions} 趟跑 + ${strengthSessions} 次重訓`
            : `${runSessions} 趟跑`,
        note: `平均每週 ${round1(totalKm / totalWeeks)} 公里。全部完成的話，這就是你這 ${totalWeeks} 週寫下的紀錄。`,
    });
    void totalSessions;

    const headline = `完成這 ${totalWeeks} 週之後`;
    // 給 UI 做大字破框用：「這 14 週 / 你將獲得」
    const weeksLabel = `這 ${totalWeeks} 週`;
    const disclaimer =
        '「確定」= 課表已寫定的數字；「預估」= 依運動科學文獻的族群平均，個體差異可達 ±50%。' +
        '實際結果取決於出席率、睡眠與飲食。';

    /* 告訴呼叫端「有一項因為缺體重沒算」—— 不然那一列只是默默不見，
       畫面上沒有任何線索可以讓使用者知道要去補什麼。 */
    const missingWeightForKcal = goal === 'fat_loss' && !(Number(weightKg) > 0);
    return { headline, weeksLabel, items, disclaimer, missingWeightForKcal };
}

export default projectPlanOutcome;
