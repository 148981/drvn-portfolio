import { formatPace as fmtPace } from './format';
// ─────────────────────────────────────────────────────────────
// 🏆 Personal Records — 從真實跑步歷史計算個人最佳，取代寫死的假 PR。
//
// v2 重點修正：改用「分段(splits)最佳努力(best effort)」計算各標準距離，
// 不再用整趟平均配速。舊版 1K/3K/5K 全部等於整趟平均 → 三個紀錄
// 永遠同一個配速（假象）。新版用連續 km 分段滑動視窗找出該距離
// 真正最快的一段，1K/3K/5K 自然各不相同。
//
// 資料來源優先序：
//   1. run.metrics.splits / run.stats.splits / run.splits（每公里一筆 {km,time,pace}）
//   2. 無 splits → 退回整趟 時間×(目標距離/總距離) 的保守估計
// ─────────────────────────────────────────────────────────────

// 標準距離門檻（公里）
export const STANDARD_DISTANCES = [
    { key: '1K', km: 1, label: '1 公里' },
    { key: '3K', km: 3, label: '3 公里' },
    { key: '5K', km: 5, label: '5 公里' },
    { key: '10K', km: 10, label: '10 公里' },
    { key: 'HALF', km: 21.0975, label: '半程馬拉松' },
];

// ── 合理區間守門（髒資料／混入他種運動的最後一道防線）─────────────
// 人類跑步配速合理範圍：2'30"/km（世界級）～ 15'00"/km（走路級）。
// 落在區間外的多半是腳踏車、開車軌跡、或 GPS 爆掉的紀錄。
export const MIN_RUN_PACE_SEC = 150;   // 2'30"/km
export const MAX_RUN_PACE_SEC = 900;   // 15'00"/km
const isSanePace = (p) => Number.isFinite(p) && p >= MIN_RUN_PACE_SEC && p <= MAX_RUN_PACE_SEC;

// ── 進步幅度可不可以拿出來講 ─────────────────────────────────────
// isSanePace 放行到 15'00"/km（走路級）—— 這是「髒資料」的門檻，不是
// 「可比較的努力」的門檻。兩者混用會產生這種畫面（使用者實際回報）：
//   「1 公里新紀錄 5'33"/km — 比先前最佳快了 4 分 48 秒」
// 反推先前最佳是 10'21"/km，那是一趟散步或熱身，不是一次同類型的嘗試。
// 數字沒有錯，但拿它當「你進步了多少」是在誤導。
//
// 規則：每公里進步超過這個秒數，就代表基準不是可比較的努力 ——
// 仍然算新紀錄，但不報進步幅度（誠實的作法是少說一句，不是編一個）。
export const MAX_CLAIMABLE_GAIN_SEC_PER_KM = 75;

// ── 只認跑步 ────────────────────────────────────────────────────
// 使用者回報：PR 檔案出現 10 公里 22:53（2'17"/km）這種不可能的數字 —
// 那是腳踏車／其他有氧被混進跑步 PR 的典型症狀。
const RUN_TYPES = ['run', 'running', 'trail_run', 'treadmill', 'jog', 'outdoor_run', 'indoor_run', '跑步', '慢跑'];
const isRunActivity = (run) => {
    const t = String(
        run?.activity_type ?? run?.activityType ?? run?.type ??
        run?.sport ?? run?.stats?.type ?? run?.metrics?.type ?? ''
    ).toLowerCase().trim();
    // 沒有標註類型的舊資料：保守放行（跑步 app 的預設），但仍要過配速合理性
    if (!t) return true;
    return RUN_TYPES.some((k) => t.includes(k));
};

// 從 run 物件取出每公里分段的「秒數」陣列（只取有效值）
// ⚠️ 尾段（partial:true，不足 1 公里）必須排除 —— 否則 0.22km 跑了 82 秒
//    會被當成「1 公里只花 82 秒」的假 PR（使用者回報的 5'00" 最快段就是這樣來的）。
const extractSplitSeconds = (run) => {
    const raw = run?.metrics?.splits || run?.stats?.splits || run?.splits || [];
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const secs = [];
    for (const s of raw) {
        if (s?.partial === true) continue;                    // 尾段不參與紀錄比較
        const segKm = Number(s?.distanceKm ?? s?.distance_km ?? 1);
        if (Number.isFinite(segKm) && segKm > 0 && segKm < 0.95) continue; // 不完整的一段
        let t = Number(s?.time ?? s?.duration ?? 0);
        // 有些資料只存 pace（秒/km），每段 1km → time = pace
        if (!(t > 0)) t = Number(s?.pace ?? s?.avg_pace ?? 0);
        if (isSanePace(t)) secs.push(t);
    }
    return secs;
};

/**
 * 分段是否為「真實逐段量測」。
 * 舊資料常把整趟平均配速塞進每一段 → 全部一模一樣，
 * 拿去算 1K/3K/5K 會得到三個相同的假紀錄（使用者截圖：1公里與10公里都是 6'17"）。
 * 至少 2 段、且最快與最慢差 ≥ 2 秒，才視為真實。
 */
export const splitsAreReal = (splitSecs) => {
    if (!Array.isArray(splitSecs) || splitSecs.length === 0) return false;
    if (splitSecs.length === 1) return true;
    return (Math.max(...splitSecs) - Math.min(...splitSecs)) >= 2;
};

/**
 * 分段最佳努力：在連續 km 分段上滑動視窗，找出覆蓋 targetKm 的最快一段。
 * @returns {{sec:number, paceSec:number, startKm:number, endKm:number}|null}
 */
export const bestEffortFromSplits = (splitSecs, targetKm) => {
    const w = Math.ceil(targetKm - 1e-6); // 需要的連續分段數
    if (!Array.isArray(splitSecs) || splitSecs.length < w || w <= 0) return null;
    let best = Infinity, bestIdx = 0;
    let windowSum = 0;
    for (let i = 0; i < splitSecs.length; i++) {
        windowSum += splitSecs[i];
        if (i >= w) windowSum -= splitSecs[i - w];
        if (i >= w - 1 && windowSum < best) {
            best = windowSum;
            bestIdx = i - w + 1;
        }
    }
    if (!isFinite(best)) return null;
    // 視窗略大於目標（如半馬 21.0975 → 22 段）時按比例估回目標距離
    const sec = w > targetKm ? best * (targetKm / w) : best;
    return {
        sec: Math.round(sec),
        paceSec: Math.round(sec / targetKm),
        startKm: bestIdx,
        endKm: bestIdx + w,
    };
};

// 從一筆 run 取出標準化資料（含 splits）
const normalizeRun = (run) => {
    if (!run) return null;
    if (!isRunActivity(run)) return null;                 // 🚴 擋掉腳踏車等其他運動
    const stats = run.stats || {};
    const metrics = run.metrics || {};
    const distanceKm = Number(
        run.distance ?? stats.distance ?? run.distance_km ?? stats.distance_km ??
        metrics.distance ?? metrics.distance_km ?? 0
    );
    const durationSec = Number(
        run.duration ?? stats.duration ?? run.duration_seconds ?? run.duration_sec ??
        metrics.duration ?? 0
    );
    if (!(distanceKm > 0) || !(durationSec > 0)) return null;
    let avgPaceSec = Number(run.pace ?? stats.pace ?? stats.avgPace ?? run.avg_pace ?? 0);
    if (!(avgPaceSec > 0)) avgPaceSec = Math.round(durationSec / distanceKm);
    // 整趟平均配速不合理 → 這筆資料不可信，直接不採用（不讓它污染 PR）
    if (!isSanePace(avgPaceSec)) return null;
    const splitSecs = extractSplitSeconds(run);
    return {
        id: run.run_id || run.session_id || run.sessionId || null,
        date: run.date || run.timestamp || run.created_at || '',
        distanceKm,
        durationSec,
        avgPaceSec,
        splitSecs,
        hasRealSplits: splitsAreReal(splitSecs),
    };
};

/**
 * 去重 — 同一場跑步可能因後端重複/合併出現兩筆（使用者回報 PR 檔案同一天
 * 出現三筆一模一樣的 10:21）。雙鑰匙：session_id ＋ 內容簽章。
 */
const dedupeRuns = (list) => {
    const seen = new Set();
    const out = [];
    for (const r of list) {
        const sig = r.id
            ? `id:${r.id}`
            : `sig:${String(r.date).slice(0, 16)}|${r.distanceKm.toFixed(2)}|${r.durationSec}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(r);
    }
    return out;
};

/**
 * 該筆 run 在 targetKm 的努力時間（秒）。
 *
 * 【誠實原則】沒有真實逐段資料時，不再用「整趟均速 × 目標距離」去生出
 * 1K/3K/5K 的紀錄 —— 那正是使用者截圖裡「1 公里最快 6'17"、10 公里最快
 * 也是 6'17"」的來源，是假數據。
 * 無分段時只承認一件事：這個人確實用該均速跑完了「整趟距離」，
 * 因此只為「不超過實際距離的最大標準距離」給一個標註 estimated 的成績。
 */
const effortSecForRun = (r, d, opts = {}) => {
    if (!r || r.distanceKm + 1e-6 < d.km) return null;
    const be = bestEffortFromSplits(r.splitSecs, d.km);
    if (be && r.hasRealSplits) return be.sec;
    if (opts.strict) return null;                  // 嚴格模式：沒真實分段就不給
    // 無真實分段 → 只認「最接近整趟距離」的那一個標準距離
    const largestFit = [...STANDARD_DISTANCES]
        .filter((x) => x.km <= r.distanceKm + 1e-6)
        .sort((a, b) => b.km - a.km)[0];
    if (!largestFit || largestFit.key !== d.key) return null;
    return Math.round(r.avgPaceSec * d.km);
};

/** 這筆成績是不是「估算」（沒有真實逐段量測）。UI 要標示出來。 */
const effortIsEstimated = (r, d) => {
    if (!r) return false;
    const be = bestEffortFromSplits(r.splitSecs, d.km);
    return !(be && r.hasRealSplits);
};

/**
 * 從跑步歷史計算個人紀錄（各標準距離用分段最佳努力）。
 */
export const computePersonalRecords = (runs = []) => {
    const norm = dedupeRuns((Array.isArray(runs) ? runs : []).map(normalizeRun).filter(Boolean));

    const result = {
        longestDistance: null,
        bestAvgPace: null,
        standardDistances: {},
        totalRuns: norm.length,
    };
    if (norm.length === 0) return result;

    for (const r of norm) {
        if (!result.longestDistance || r.distanceKm > result.longestDistance.distanceKm) {
            result.longestDistance = { distanceKm: r.distanceKm, date: r.date, id: r.id };
        }
        if (r.distanceKm >= 1) {
            if (!result.bestAvgPace || r.avgPaceSec < result.bestAvgPace.avgPaceSec) {
                result.bestAvgPace = {
                    avgPaceSec: r.avgPaceSec, distanceKm: r.distanceKm, date: r.date, id: r.id,
                };
            }
        }
        for (const d of STANDARD_DISTANCES) {
            const sec = effortSecForRun(r, d);
            if (sec == null) continue;
            const paceSec = Math.round(sec / d.km);
            if (!isSanePace(paceSec)) continue;   // 最後一道髒資料防線
            const cur = result.standardDistances[d.key];
            if (!cur || sec < cur.sec) {
                result.standardDistances[d.key] = {
                    sec,
                    avgPaceSec: paceSec, // 保留舊欄位名（下游相容），意義改為該距離最佳努力配速
                    distanceKm: r.distanceKm,
                    durationSec: r.durationSec,
                    date: r.date,
                    id: r.id,
                    estimated: effortIsEstimated(r, d),   // UI 需標「估算」
                };
            }
        }
    }
    return result;
};

/**
 * 判斷「剛跑完這一筆」是否打破任何紀錄（用分段最佳努力比較）。
 */
export const detectNewRecords = (finishedRun, priorRecords) => {
    const r = normalizeRun(finishedRun);
    const records = [];
    if (!r || !priorRecords) return records;

    if (priorRecords.totalRuns === 0) {
        records.push({ type: 'FIRST', label: '首次紀錄', detail: '你的第一筆跑步！' });
        return records;
    }

    if (!priorRecords.longestDistance || r.distanceKm > priorRecords.longestDistance.distanceKm + 1e-6) {
        records.push({
            type: 'DISTANCE',
            label: '最遠距離',
            detail: `${r.distanceKm.toFixed(2)} 公里`,
        });
    }

    for (const d of STANDARD_DISTANCES) {
        const sec = effortSecForRun(r, d);
        if (sec == null) continue;
        const prev = priorRecords.standardDistances[d.key];
        const prevSec = prev ? (prev.sec ?? Math.round(prev.avgPaceSec * d.km)) : null;
        if (prevSec == null || sec < prevSec) {
            records.push({
                type: `PACE_${d.key}`,
                label: `${d.label}最快`,
                detail: formatPaceSec(Math.round(sec / d.km)),
                sec,
                improveSec: prevSec != null ? prevSec - sec : null,
            });
        }
    }
    return records;
};

/**
 * 🥇 本次在各標準距離的「歷史名次」（1/2/3 → 金/銀/銅，其餘 null）。
 * 供路線圖獎牌標記與 PR 系統頁使用。
 * @returns Array<{key, km, label, rank:1|2|3|null, sec, paceSec, bestEffort, routeFraction}>
 */
export const computeDistanceRankings = (finishedRun, priorRuns = []) => {
    const r = normalizeRun(finishedRun);
    if (!r) return [];
    const priors = dedupeRuns(
        (Array.isArray(priorRuns) ? priorRuns : []).map(normalizeRun).filter(Boolean)
    ).filter((p) => !r.id || p.id !== r.id);   // 別把「這一場」算進自己的歷史對手
    const out = [];
    for (const d of STANDARD_DISTANCES) {
        const mineBE = bestEffortFromSplits(r.splitSecs, d.km);
        const mine = effortSecForRun(r, d);
        if (mine == null) continue;
        const minePace = Math.round(mine / d.km);
        if (!isSanePace(minePace)) continue;
        // 🩹 只讓「有真實逐段量測」的歷史成績當比較基準：
        //    估算成績(整趟均速×距離)不可信，會製造假的「先前最佳」→ 造成
        //    「比先前最佳快 4 分 48 秒」這種不合理進步幅度。用 strict 模式排除估算值。
        const others = priors
            .map((p) => effortSecForRun(p, d, { strict: true }))
            .filter((s) => s != null && s > 0 && isSanePace(Math.round(s / d.km)));
        const faster = others.filter((s) => s < mine).length;
        const rank = faster + 1 <= 3 ? faster + 1 : null;
        out.push({
            key: d.key,
            km: d.km,
            label: d.label,
            rank,                                   // 1=金 2=銀 3=銅 null=無牌
            medal: rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null,
            isPR: rank === 1,
            sec: mine,
            paceSec: minePace,
            estimated: effortIsEstimated(r, d),
            // 進步幅度：比先前最佳快了幾秒。
            // ⚠️ 基準太慢（每公里快超過 MAX_CLAIMABLE_GAIN_SEC_PER_KM）時回 null：
            //    那不是進步，是上次根本沒在跑。全 App 只有這裡算這個數字，
            //    所以在這裡擋掉，四個顯示它的地方就一起乾淨了。
            improveSec: (() => {
                if (others.length === 0) return null;
                const gain = Math.min(...others) - mine;
                if (!(gain > 0)) return null;
                return gain / d.km > MAX_CLAIMABLE_GAIN_SEC_PER_KM ? null : gain;
            })(),
            prevBestSec: others.length > 0 ? Math.min(...others) : null,
            bestEffort: mineBE, // {startKm,endKm} → 地圖標記位置
            // 標記放在最佳努力段的「終點」；無分段就放在該距離處
            routeFraction: Math.min(1, (mineBE ? mineBE.endKm : d.km) / Math.max(r.distanceKm, 0.01)),
            historyCount: others.length,
        });
    }
    return out;
};

/**
 * 🏅 本場獎牌統計 — 給動態卡片用（使用者要求：卡牌顯示這次拿了金銀銅共幾個）。
 */
export const summarizeMedals = (rankings = []) => {
    const gold = rankings.filter((x) => x.rank === 1).length;
    const silver = rankings.filter((x) => x.rank === 2).length;
    const bronze = rankings.filter((x) => x.rank === 3).length;
    return { gold, silver, bronze, total: gold + silver + bronze };
};

/**
 * 📈 歷年 PR 進程 — 依時間序，記錄每個標準距離「紀錄被刷新」的時間點。
 * @returns { [key]: Array<{date, sec, paceSec}> }（由舊到新，最後一筆為現任 PR）
 */
export const buildPRTimeline = (runs = []) => {
    const norm = dedupeRuns(
        (Array.isArray(runs) ? runs : []).map(normalizeRun).filter(Boolean)
    ).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const timeline = {};
    const best = {};
    for (const r of norm) {
        for (const d of STANDARD_DISTANCES) {
            const sec = effortSecForRun(r, d);
            if (sec == null) continue;
            const paceSec = Math.round(sec / d.km);
            if (!isSanePace(paceSec)) continue;
            if (best[d.key] == null || sec < best[d.key]) {
                best[d.key] = sec;
                (timeline[d.key] = timeline[d.key] || []).push({
                    date: r.date,
                    sec,
                    paceSec,
                    estimated: effortIsEstimated(r, d),
                    id: r.id,
                });
            }
        }
    }
    return timeline;
};

// 秒/km → 「5'12"」
export const formatPaceSec = (sec) => fmtPace(sec, "—");   // 🩹 J: 單一真相源

// 秒 → 「25:19」/「1:02:33」
export const formatDurationSec = (sec) => {
    if (!sec || sec <= 0 || !isFinite(sec)) return "—";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
};
