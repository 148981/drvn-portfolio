/**
 * 🧾 cardioSettlementEngine — 週結算演算法
 *
 * 設計哲學（NRC philosophy + 神經系統避震）：
 *   - 完成率高、無過勞 → 升階（promote），下週里程 +5~10%
 *   - 完成率剛好、體感正常 → 維持（hold）
 *   - 完成率低或 RPE 飆高 → 降階（demote），下週里程 ×0.8
 *
 * 演算法輸入：
 *   week.bricks[].status ∈ { 'pending' | 'completed' | 'skipped' }
 *   week.bricks[].actual_distance_km
 *   week.bricks[].distance_km
 *   sessions[]（optional）：完賽的 cardio session 物件，可帶 avg_hr / rpe / duration
 *
 * 演算法輸出：
 *   {
 *     verdict: 'promote' | 'hold' | 'demote',
 *     score:   0..100,         // 綜合分數
 *     stats:   { completion_rate, mileage_rate, avg_rpe, skipped, missed },
 *     adjustments: {
 *       next_week_mileage_multiplier: 0.8 | 1.0 | 1.07,
 *       intensity_shift:              -1 | 0 | +1,  // -1 = 降強度（少 1 個 hard）
 *       insert_recovery:              boolean,
 *     },
 *     rationale: string[]
 *   }
 *
 * 注意：
 *   - 這個演算法是「純函式」，不直接寫入後端；UI 拿到 verdict 後才 POST 給
 *     /api/cardio-plan/settle-week（後端尚未實作則先 mock）。
 */

import { actualRunKm, hasBrickActivity, nonNegativeMeasurement } from './cardioPlanActuals';
import { normalizeRunPrescription, summarizeCardioWeek, PACE_SHIFT_BY_SUBTYPE } from './cardioPrescription';
import { flatEquivalentPace } from './runPlaceFeedback';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 從一週的 bricks 算出基本統計（pure）
 */
export function deriveWeekStats(week, sessions = []) {
    const bricks = week?.bricks || [];
    const total = bricks.length;
    const completed = bricks.filter((b) => b.status === 'completed');
    const skipped = bricks.filter((b) => b.status === 'skipped').length;
    const missed = bricks.filter((b) => b.status === 'pending').length;

    const targetMileage = bricks.reduce(
        (s, b) => s + (b.distance_km || 0),
        0
    );
    const actualMileage = bricks.reduce(
        (s, b) => s + actualRunKm(b),
        0
    );

    // RPE is a reported measurement. A prescribed band is not user feedback.
    let rpeSamples = [];
    if (sessions.length > 0) {
        rpeSamples = sessions
            .map((s) => nonNegativeMeasurement(s.user_rpe ?? s.actual_rpe ?? s.rpe))
            .filter((v) => v >= 1 && v <= 10);
    }
    if (rpeSamples.length === 0) {
        rpeSamples = bricks
            .filter(hasBrickActivity)
            .map((b) => nonNegativeMeasurement(b.user_rpe ?? b.actual_rpe))
            .filter((v) => v >= 1 && v <= 10);
    }
    const avgRpe = rpeSamples.length
        ? rpeSamples.reduce((s, v) => s + v, 0) / rpeSamples.length
        : null;

    return {
        completion_rate: total ? completed.length / total : 0,
        mileage_rate: targetMileage > 0 ? actualMileage / targetMileage : 0,
        avg_rpe: avgRpe,
        skipped,
        missed,
        target_mileage_km: Math.round(targetMileage * 10) / 10,
        actual_mileage_km: Math.round(actualMileage * 10) / 10,
        total_bricks: total,
        completed_bricks: completed.length,
        recorded_bricks: bricks.filter(b => b.status === 'completed' || actualRunKm(b) > 0 || Number(b.actual_duration_min) > 0).length,
        partial_bricks: bricks.filter(b => b.status === 'partial').length,
    };
}

/**
 * 把統計轉成 0-100 綜合分數
 *   - 完成率 50%
 *   - 里程率 30%
 *   - RPE 體感 20%（RPE > 8.5 扣分）
 */
export function computeScore(stats) {
    // ══════════════════════════════════════════════════════════════════════
    // 🚫 沒有任何訓練紀錄 → 不給分數（回 null）
    //
    // 使用者截圖：一週完全沒跑，畫面卻寫「平靜的一週。」＋「20/100 分」。
    // 一個沒運動的人被系統打 20 分，感覺是被審判，不是被陪伴 ——
    // 而且那 20 分還是 RPE 沒資料時的預設分，根本不對應任何真實表現。
    // 誠實數據原則：沒資料就顯示「—」，不是硬算一個數字出來評判人。
    // ══════════════════════════════════════════════════════════════════════
    if (!stats || (stats.recorded_bricks ?? stats.completed_bricks ?? 0) === 0) return null;

    const cr = clamp(stats.completion_rate, 0, 1) * 50;
    
    // 修正超量訓練漏洞：里程達成率 (r)
    // 甜蜜點：0.95 ~ 1.15 拿滿分； 超過 1.15 開始倒扣
    const r = stats.mileage_rate;
    let mr = 0;
    if (r <= 1.0) {
        mr = r * 30;
    } else if (r <= 1.15) {
        mr = 30;
    } else {
        // 懲罰機制：超過 1.15 開始倒扣
        mr = Math.max(0, 30 - 30 * (r - 1.15) * 2);
    }

    // RPE：5-7 為甜蜜點 (得 20)，>8.5 開始扣分，<4 也扣分（沒練到）
    let rpeScore = 20;
    if (stats.avg_rpe != null) {
        const r = stats.avg_rpe;
        if (r > 8.5) rpeScore = 20 - (r - 8.5) * 8;       // 8.5→20, 10→8
        else if (r < 4) rpeScore = 20 - (4 - r) * 6;     // 4→20, 1→2
    }
    return Math.round(clamp(cr + mr + rpeScore, 0, 100));
}

/**
 * 從統計推 verdict + adjustments
 */
/**
 * 🛡️ ACWR（急慢性負荷比）— 跑步傷害預防的黃金指標
 * acute = 最近 7 天跑量；chronic = 最近 28 天的週平均跑量。
 * 甜蜜區 0.8–1.3；>1.5 = 傷害風險顯著上升（sweet spot 理論，Gabbett 2016）。
 * @param {Array} allSessions  所有 cardio session（需含 date/created_at 與 distance）
 * @returns {null | { acwr, acuteKm, chronicWeeklyKm, risk: 'low'|'sweet'|'elevated'|'high', message }}
 */
export function computeACWR(allSessions = []) {
    try {
        const now = Date.now();
        const km = (s) => {
            const d = parseFloat(s?.metrics?.distance_km ?? s?.metrics?.distance ?? s?.distance ?? s?.distance_km ?? 0);
            return isFinite(d) && d > 0 && d < 300 ? d : 0;
        };
        const ts = (s) => new Date(s?.created_at || s?.date || s?.completed_at || s?.timestamp || 0).getTime();
        const within = (s, days) => { const t = ts(s); return t > 0 && t <= now && now - t <= days * 86400000; };
        const seen = new Set();
        const recent28 = allSessions.filter(s => {
            if (s?.metrics?.source === 'simulation' || s?.source === 'simulation') return false;
            const sport = String(s.sport || s.sport_type || s.activity_type || s.type || '').toLowerCase();
            if (sport && !['run', 'running', 'trail', 'trail_running', 'cardio', 'free'].includes(sport)) return false;
            if (!within(s, 28) || !km(s)) return false;
            const id = s.session_id || s.id;
            if (id && seen.has(id)) return false;
            if (id) seen.add(id);
            return true;
        });
        if (recent28.length < 4) return null;                    // 資料不足不評
        const acuteKm = recent28.filter(s => within(s, 7)).reduce((a, s) => a + km(s), 0);
        const chronicWeeklyKm = recent28.reduce((a, s) => a + km(s), 0) / 4;
        if (chronicWeeklyKm < 5) return null;                    // 跑量太小無意義
        const acwr = Math.round((acuteKm / chronicWeeklyKm) * 100) / 100;
        const risk = acwr > 1.5 ? 'high' : acwr > 1.3 ? 'elevated' : acwr >= 0.8 ? 'sweet' : 'low';
        const message = risk === 'high'
            ? `⚠️ 本週跑量是近月平均的 ${acwr} 倍 — 負荷飆升過快，受傷風險顯著上升。下週強制回落，別跟身體對賭。`
            : risk === 'elevated'
                ? `本週負荷比 ${acwr} 略高於甜蜜區（0.8–1.3），下週先穩住不加量。`
                : null;
        return { acwr, acuteKm: Math.round(acuteKm * 10) / 10, chronicWeeklyKm: Math.round(chronicWeeklyKm * 10) / 10, risk, message };
    } catch { return null; }
}

/**
 * 🗣 依「實際完成度」產生一則**詢問式**的調整提議。
 *
 * 使用者要求原文：
 *   「根據實際完成度，譬如這個計劃要跑 10 公里每週，可是他只跑 8km，
 *     就可以詢問是否要調降。還有可以著重於哪些點去做進步。」
 *
 * 鐵律：一律「提議 + 兩顆按鈕」，不替使用者決定。
 *   系統只負責把事實與選項攤開，決定權在跑者手上。
 *
 * @returns {{ tier, title, body, primaryLabel, secondaryLabel, multiplier, needsConfirm, focus }}
 */
export function buildAdjustmentProposal(stats, opts = {}) {
    const r = Number(stats?.mileage_rate ?? stats?.completion_rate ?? 0);
    const actual = stats?.actual_mileage_km ?? 0;
    const target = stats?.target_mileage_km ?? 0;
    const hasRecord = (stats?.recorded_bricks ?? stats?.completed_bricks ?? 0) > 0;

    // ── 完全沒練 ──
    if (!hasRecord) {
        return {
            tier: 'restart',
            title: '這週先休息了。',
            body: '休息也是計劃的一部分 —— 沒有人能每週都全滿。要不要用 80% 的量重新啟動，讓身體慢慢接回來？',
            primaryLabel: '好，用 80% 重新開始',
            secondaryLabel: '不用，我照原計劃來',
            multiplier: 0.8,
            needsConfirm: true,
            focus: '下週先求「有出門」，量的事之後再說。',
        };
    }

    // ── 超額或達標 ──
    if (r >= 1.0) {
        return {
            tier: 'promote',
            title: `這週 ${actual} 公里，完整收下。`,
            body: '身體吸收了這個量。下週加 7%，一步一步往上疊。',
            primaryLabel: '好，下週加一點',
            secondaryLabel: '維持這個量就好',
            multiplier: 1.07,
            needsConfirm: false,
            focus: focusHint(stats, opts),
        };
    }
    if (r >= 0.85) {
        return {
            tier: 'hold',
            title: `這週 ${actual} / ${target} 公里。`,
            body: '差一點點而已，這個量你其實接得住。下週維持同樣的課，把它踩實。',
            primaryLabel: '維持原計劃',
            secondaryLabel: '幫我降一點',
            multiplier: 1.0,
            needsConfirm: false,
            focus: focusHint(stats, opts),
        };
    }
    // ── 0.6–0.85：詢問是否調降 ──
    if (r >= 0.6) {
        const gap = Math.round((target - actual) * 10) / 10;
        return {
            tier: 'ask_reduce',
            title: `這週跑了 ${actual} 公里，差 ${gap} 公里。`,
            body: '不是你不夠努力，是課表排得比你的生活多了一點。要不要把下週降 10%，'
                + '讓它變成一個你「一定做得到」的量？做得到才會有下一週。',
            primaryLabel: '好，降 10%',
            secondaryLabel: '不用，我可以',
            multiplier: 0.9,
            needsConfirm: true,
            focus: focusHint(stats, opts),
        };
    }
    // ── < 0.6：詢問是否重設基準 ──
    return {
        tier: 'ask_reset',
        title: `這週跑了 ${actual} / ${target} 公里。`,
        body: '連續接不上通常不是意志力問題，是起點設得太高。要不要把下週降 20% 並插一趟恢復跑，'
            + '重新找一個真正貼合你生活的量？',
        primaryLabel: '好，重設基準',
        secondaryLabel: '再給我一週試試',
        multiplier: 0.8,
        needsConfirm: true,
        focus: '先把「每週固定出門幾次」穩住，里程之後自然會長。',
    };
}

/**
 * 🎯 這週最該著重的「一件事」—— 只給一個，不列一堆。
 * 判斷順序＝槓桿由大到小：頻率 → 步頻 → 配速分配 → 下一個里程碑。
 */
function focusHint(stats, opts = {}) {
    if ((stats?.completion_rate ?? 1) < 0.85) {
        return '先顧「次數」再顧「距離」— 三趟短的，勝過一趟長的加兩趟沒跑。';
    }
    const cad = Number(opts.avgCadence || 0);
    if (cad > 0 && cad < 165) {
        return `步頻 ${Math.round(cad)} spm 偏低 — 步子改小、頻率加快，配速不變也能少掉很多膝蓋衝擊。`;
    }
    const fade = Number(opts.paceFadeSec || 0);
    if (fade > 25) {
        return `後段平均掉速 ${Math.round(fade)} 秒/km — 下次試著前 2 公里刻意壓慢 10 秒，後半會輕鬆很多。`;
    }
    return '節奏穩了，下一步是把單次長跑往上推一點點 — 那是有氧地基長最快的地方。';
}

export function evaluateWeek(week, sessions = [], opts = {}) {
    const stats = deriveWeekStats(week, sessions);
    const score = computeScore(stats);              // 沒紀錄會回 null
    let proposal = buildAdjustmentProposal(stats, opts);

    // ── Verdict thresholds ─────────────────────────────
    //    分數為 null（沒訓練）→ 一律走 demote 的量能保護，但語氣是「重新啟動」，不是懲罰。
    let verdict;
    if (score == null) {
        verdict = 'demote';
    } else if (score >= 85 && stats.completion_rate >= 0.85 && (stats.avg_rpe == null || stats.avg_rpe <= 8)) {
        verdict = 'promote';
    } else if (score < 55 || stats.completion_rate < 0.6) {
        verdict = 'demote';
    } else {
        verdict = 'hold';
    }

    // 🛡️ ACWR 護欄：負荷比過高時，本週再漂亮也不升階（傷害預防 > 進度）
    const acwrInfo = opts.allSessions ? computeACWR(opts.allSessions) : null;
    if (acwrInfo?.risk === 'high' && verdict === 'promote') verdict = 'hold';
    if (opts.historyComplete === false && verdict === 'promote') verdict = 'hold';
    if (acwrInfo?.risk === 'high' && verdict === 'hold') { /* 維持，但 rationale 會警示 */ }

    // ── Adjustments ────────────────────────────────────
    //    倍率改以「詢問式提議」為準，讓 UI 顯示的數字與實際套用的一致。
    const base = {
        promote: { next_week_mileage_multiplier: 1.07, intensity_shift: +1, insert_recovery: false },
        hold:    { next_week_mileage_multiplier: 1.00, intensity_shift:  0, insert_recovery: false },
        demote:  { next_week_mileage_multiplier: 0.80, intensity_shift: -1, insert_recovery: true },
    }[verdict];
    const adjustments = {
        ...base,
        next_week_mileage_multiplier: proposal.multiplier ?? base.next_week_mileage_multiplier,
        insert_recovery: proposal.tier === 'ask_reset' ? true : base.insert_recovery,
    };
    // A hold/demote decision must constrain the applied proposal too. Previously
    // ACWR could say hold while the mileage proposal still applied +7%.
    if (verdict !== 'promote') {
        adjustments.next_week_mileage_multiplier = Math.min(
            adjustments.next_week_mileage_multiplier, base.next_week_mileage_multiplier
        );
    }
    if (adjustments.next_week_mileage_multiplier !== proposal.multiplier) {
        const reduction = Math.round((1 - adjustments.next_week_mileage_multiplier) * 100);
        proposal = { ...proposal, tier: verdict, multiplier: adjustments.next_week_mileage_multiplier,
            body: reduction > 0 ? `依本週完成度與體感，建議下週減量 ${reduction}%。` : '依本週負荷與體感，下週維持原計劃。',
            primaryLabel: reduction > 0 ? `好，下週減量 ${reduction}%` : '維持原計劃',
        };
    }
    proposal.secondaryLabel = '維持原計劃，不調整';

    // ── Rationale（給 UI 顯示的人話）────────────────
    const rationale = [];
    const pct = (v) => `${Math.round(v * 100)}%`;
    rationale.push(`Completion ${pct(stats.completion_rate)} · Mileage ${pct(stats.mileage_rate)}`);
    if (stats.avg_rpe != null) {
        rationale.push(`Average RPE ${stats.avg_rpe.toFixed(1)} / 10`);
    }
    rationale.push(`下週里程調整 ${Math.round((adjustments.next_week_mileage_multiplier - 1) * 100)}%。`);
    if (acwrInfo?.message) rationale.push(acwrInfo.message);

    return {
        verdict,
        score,                 // 沒訓練紀錄時為 null → UI 顯示「—」，不是 20 分
        hasRecord: (stats.recorded_bricks || 0) > 0,
        proposal,              // 🗣 詢問式提議（標題／內文／兩顆按鈕／倍率／這週著重什麼）
        stats,
        adjustments,
        rationale,
        acwr: acwrInfo,
    };
}

/**
 * Apply settlement → 直接回傳一份「下週調整版」的 week（不修改原本）
 * - 不真的改 brick 名稱，僅按 multiplier 縮放 distance_km 與 duration_min
 * - intensity_shift = -1 時，把第一個 speed brick 換成 recovery
 */
export function applyAdjustmentsToWeek(nextWeek, adjustments) {
    if (!nextWeek || !adjustments) return nextWeek;
    // Preserve the denominator/prescription of a week that has already started.
    if ((nextWeek.bricks || []).some(hasBrickActivity)) return nextWeek;
    const m = Number(adjustments.next_week_mileage_multiplier);
    if (!Number.isFinite(m) || m <= 0) return nextWeek;
    const adjusted = JSON.parse(JSON.stringify(nextWeek)); // deep clone
    adjusted.bricks = (adjusted.bricks || []).map((b) => {
        if (b.type === 'strength' || b.subtype === 'strength') return b;
        if (b.distance_km != null) b.distance_km = Math.round(b.distance_km * m * 10) / 10;
        return normalizeRunPrescription(b);
    });

    // intensity shift: demote 時把第一個 speed brick 改 recovery
    if (adjustments.intensity_shift < 0 || adjustments.insert_recovery) {
        const idx = adjusted.bricks.findIndex((b) => b.type === 'speed');
        if (idx >= 0) {
            const b = adjusted.bricks[idx];
            const baseline = b.target_pace_sec - (PACE_SHIFT_BY_SUBTYPE[b.subtype] ?? 60);
            adjusted.bricks[idx] = normalizeRunPrescription({ ...b, type: 'recovery', subtype: 'recovery' }, baseline);
        }
    }
    // Recovery replaces existing quality work within the selected frequency and
    // mileage budget. Appending 3.5 km made a 10 km -20% proposal become 11.5 km.
    return summarizeCardioWeek(adjusted);
}

/**
 * 🏃 配速自適應校準（Pace Auto-Calibration）
 *
 * 設計：未測 5K 的人，計劃一開始用預設 6:00/km 估算配速（pacing_mode='estimated'）。
 *       等他實際跑了幾趟、留下真實資料後，這支函式用「實際距離 ÷ 實際時間」反推
 *       真實 easy pace，再扣掉 easy 的 paceShift(+60s) 回推 5K 基準配速，
 *       用指數平滑融合舊基準（避免單週雜訊把計劃帶歪），輸出新的 baselinePace5K。
 *
 * @param {object} plan          現有 cardio plan（需有 meta.baseline_pace_5k_sec）
 * @param {Array}  sessions      實際完賽 session：{ distance_km, duration_min, brick_subtype?, actual_pace_sec?, actual_rpe? }
 * @param {object} opts          { smoothing: 0..1 新資料權重，預設 0.35 }
 * @returns {{ newBaselinePace5K:number|null, pacingMode:string, confidence:number, samples:number, rationale:string[] }}
 */

export function calibratePaceFromActuals(plan, sessions = [], opts = {}) {
    const smoothing = clamp(opts.smoothing ?? 0.35, 0, 1);
    const prevBaseline = plan?.meta?.baseline_pace_5k_sec ?? null;
    const prevMode = plan?.meta?.pacing_mode || (prevBaseline ? 'measured' : 'estimated');
    const rationale = [];

    // 1. 從每筆 session 反推「等效 5K 基準配速」
    const baselineSamples = [];
    const excluded = { indoor: 0, hilly: 0 };
    let terrainAdjusted = 0;
    for (const s of sessions) {
        /* 場地不同的配速不能直接比：跑步機不拿來校準，爬升換算成平路等效，
           爬太多的不拿來校準（utils/runPlaceFeedback）。不然在山路跑一週，下週配速會被整個放慢。 */
        const fe = flatEquivalentPace({
            paceSec: typeof s.actual_pace_sec === 'number' && s.actual_pace_sec > 0 ? s.actual_pace_sec : null,
            distanceKm: s.distance_km, durationMin: s.duration_min,
            elevGainM: s.elev_gain_m, indoor: !!s.indoor,
        });
        if (fe.excluded) { excluded[fe.excluded] += 1; continue; }
        const pace = fe.pace;
        if (fe.adjusted) terrainAdjusted += 1;
        if (pace == null) continue;
        // 扣掉該 brick 類型相對 5K 基準的 paceShift，回推 5K 基準配速
        const shift = PACE_SHIFT_BY_SUBTYPE[s.brick_subtype] ?? PACE_SHIFT_BY_SUBTYPE.easy;
        const implied5K = pace - shift;
        // 合理性過濾：2:30/km ~ 12:00/km
        if (implied5K >= 150 && implied5K <= 720) baselineSamples.push(implied5K);
    }

    const placeNote = [
        excluded.indoor ? `${excluded.indoor} 趟跑步機` : null,
        excluded.hilly ? `${excluded.hilly} 趟爬升多的路線` : null,
    ].filter(Boolean).join('、');
    if (baselineSamples.length === 0) {
        return {
            newBaselinePace5K: prevBaseline,
            pacingMode: prevMode,
            confidence: plan?.meta?.pace_confidence ?? (prevBaseline ? 0.9 : 0.4),
            samples: 0,
            excluded,
            rationale: [placeNote
                ? `這週的${placeNote}配速不能跟平路比，維持目前配速基準。`
                : '尚無可用的實際跑步資料 — 維持目前配速基準。'],
        };
    }

    // 2. 取樣本中位數（抗離群）
    const sorted = [...baselineSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // 3. 指數平滑融合舊基準
    let newBaseline;
    if (prevBaseline == null) {
        newBaseline = median; // 之前是估算/沒值 → 直接採用實測
    } else {
        newBaseline = Math.round(prevBaseline * (1 - smoothing) + median * smoothing);
    }
    newBaseline = Math.round(clamp(newBaseline, 150, 720));

    // 4. 信心度隨樣本數成長
    const confidence = clamp(0.45 + baselineSamples.length * 0.08, 0.45, 0.95);

    const fmt = (sec) => `${Math.floor(sec / 60)}'${String(sec % 60).padStart(2, '0')}"/km`;
    if (prevMode === 'estimated') {
        rationale.push(`偵測到 ${baselineSamples.length} 筆真實跑步資料 — 配速從「估算」升級為「實測校準」。`);
    } else {
        rationale.push(`依 ${baselineSamples.length} 筆實際資料微調配速基準。`);
    }
    if (placeNote) rationale.push(`${placeNote}沒有算進去（場地不同，配速不能直接比）。`);
    if (terrainAdjusted) rationale.push(`${terrainAdjusted} 趟有爬升，配速已換算成平路等效。`);
    if (prevBaseline != null) {
        rationale.push(`基準配速 ${fmt(prevBaseline)} → ${fmt(newBaseline)}`);
    } else {
        rationale.push(`新的 5K 基準配速：${fmt(newBaseline)}`);
    }

    return {
        newBaselinePace5K: newBaseline,
        pacingMode: 'calibrated',
        confidence: Math.round(confidence * 100) / 100,
        samples: baselineSamples.length,
        excluded,
        rationale,
    };
}

/**
 * 把校準結果套回 plan：更新 meta + 用新基準重算所有「未完成」brick 的 target_pace。
 * 已完成的 brick 保留原樣（歷史紀錄不可竄改）。
 * 需要傳入 materializeBricks 的 pace 計算邏輯，故這裡只改 target_pace_sec/label 顯示值。
 */
export function applyCalibrationToPlan(plan, calibration, afterWeek = 0) {
    if (!plan || !calibration || calibration.newBaselinePace5K == null || !calibration.samples) return plan;
    const base = calibration.newBaselinePace5K;
    const next = JSON.parse(JSON.stringify(plan));
    next.meta = {
        ...next.meta,
        baseline_pace_5k_sec: base,
        pacing_mode: calibration.pacingMode,
        pace_confidence: calibration.confidence,
        pace_calibrated_at: new Date().toISOString(),
    };
    (next.weeks || []).forEach((wk) => {
        if (wk.week_index <= afterWeek) return;
        wk.bricks = (wk.bricks || []).map(b => hasBrickActivity(b) ? b : normalizeRunPrescription(b, base));
        Object.assign(wk, summarizeCardioWeek(wk));
    });
    return next;
}

export default {
    deriveWeekStats,
    computeScore,
    evaluateWeek,
    applyAdjustmentsToWeek,
    calibratePaceFromActuals,
    applyCalibrationToPlan,
};
