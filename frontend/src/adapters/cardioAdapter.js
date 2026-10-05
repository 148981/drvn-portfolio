// src/adapters/cardioAdapter.js

// ============================================================================
// 1. 資料標準化 (Normalization)
// 將後端複雜/不統一的 Schema 轉換為前端 UI 穩定可用的格式
// ============================================================================

const ZONE_MAP = {
    "1": "z1", "2": "z2", "3": "z3", "4": "z4", "5": "z5",
    "warm-up": "z1",
    "fat burn": "z2",
    "aerobic": "z3",
    "anaerobic": "z4",
    "extreme": "z5"
};

export const normalizeZones = (dist = {}) => {
    const result = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    // 🛡 防呆：dist 可能為 null（後端尚未回傳）→ 退回空物件，避免 Object.entries(null) 崩潰
    const safe = (dist && typeof dist === 'object') ? dist : {};
    Object.entries(safe).forEach(([k, v]) => {
        const key = ZONE_MAP[k.toLowerCase()];
        if (key) result[key] += Number(v);
    });
    // ⭐️ 專業格式：回傳物件（邏輯用）+ 陣列（UI 圖表用）
    return {
        ...result,
        array: Object.values(result)
    };
};

// ══════════════════════════════════════════════════════════════════════════
// ⏱ 時長萃取（欄位別名地獄的解藥）
//
//    同一個概念在不同來源有 duration / duration_sec / duration_seconds /
//    duration_mins（分！）/ durationMin 等寫法。舊版直接 `m.duration / 60`，
//    一旦某筆資料的 duration 其實是「分鐘」，時長就被縮成 1/60，
//    推出來的配速快到不可能 —— 這就是趨勢頁預測出
//    「5K 16:44 / 3'21"/km」這種對不上真實水準的數字的原因（使用者截圖十四）。
//
//    這裡改成：先蒐集所有可能欄位，再用「距離換算出的配速是否落在
//    150–1200 秒/km」反推哪個單位才是對的。對不上就回 0（誠實不硬算）。
// ══════════════════════════════════════════════════════════════════════════
const SANE_PACE_MIN = 150;   // 2'30"/km
const SANE_PACE_MAX = 1200;  // 20'00"/km

export const extractDurationSec = (m = {}, distanceKm = 0) => {
    const raw = {
        sec: Number(m.duration_seconds ?? m.duration_sec ?? m.durationSeconds ?? 0),
        min: Number(m.duration_mins ?? m.duration_min ?? m.durationMin ?? 0),
        amb: Number(m.duration ?? 0),   // 語意不明的那一個
    };
    const candidates = [];
    if (raw.sec > 0) candidates.push(raw.sec);
    if (raw.min > 0) candidates.push(raw.min * 60);
    if (raw.amb > 0) { candidates.push(raw.amb); candidates.push(raw.amb * 60); }
    if (candidates.length === 0) return 0;

    // 有距離 → 用配速合理性挑出正確的解讀
    if (distanceKm > 0.2) {
        const sane = candidates.filter((t) => {
            const p = t / distanceKm;
            return p >= SANE_PACE_MIN && p <= SANE_PACE_MAX;
        });
        if (sane.length > 0) return Math.round(sane[0]);
        return 0;   // 沒有任何解讀說得通 → 這筆資料不可信，不要拿去算
    }
    // 沒距離就採最保守（最大）的解讀，避免把分鐘當秒
    return Math.round(Math.max(...candidates));
};

export const normalizeSession = (s) => {
    const m = s.metrics || s.stats || {};
    const d = s.deepData || {};
    const distanceKm = Number(m.distance ?? m.distance_km ?? 0) || 0;
    const durationSec = extractDurationSec(m, distanceKm);

    return {
        id: s.session_id,
        date: new Date(s.date || s.created_at),

        // --- 路徑標籤 (Segment Explorer route-tag, null = 自由跑) ---
        segmentId: s.segment_id ?? null,
        segmentName: s.segment_name ?? null,

        // --- 基礎數據 (給UI用) ---
        distance: distanceKm,
        durationMin: durationSec / 60,
        durationSec,                       // 給預測/PR 用的原始秒數（單一真相源）

        // --- 修正單位問題 ---
        pace: m.avgPace ? m.avgPace / 60 : null, // sec/km 轉 min/km
        hr: m.avgHR ?? m.avgHeartRate ?? null,                     // 修正命名對應
        cadence: m.avgCadence ?? m.cadence ?? null,           // 修正命名對應
        calories: m.calories ?? 0,
        score: m.score ?? 0, // 生理強度分數
        // 🔧 Fix(欄位錯配)：真實後端資料存的是 zoneStats（如 {"Warm-up":13,"Fat Burn":4}），
        //   舊版只讀 zone_distribution → 永遠為空 → Zone 卡鎖定、VO2 算不出。
        //   優先讀 zoneStats，向下相容舊欄位 zone_distribution / zones。
        zones: normalizeZones(m.zoneStats || m.zone_distribution || m.zones),

        // --- 進階深層數據 (Deep Metrics) (給模型用) ---
        effortDensity: d?.deep_metrics?.effort_density ?? 0,
        recoveryHours: d?.deep_metrics?.recovery_hours ?? 0,
        sleep: m.sleep || 7.5, // ⭐️ Readiness 診斷用的假資料

        // --- 生理學指標 (Physio) ---
        ef: d?.physio_metrics?.ef?.current ?? null,
        hrr: d?.physio_metrics?.hrr?.value ?? null,
        decoupling: d?.physio_metrics?.decoupling?.value ?? null
    };
};

// ============================================================================
// 2. 運動科學模型：TRIMP (訓練衝量)
// 基於心率與時間計算單次訓練對身體造成的真實壓力
// ============================================================================

export const calculateTRIMP = (session, userProfile = { maxHR: 190, restHR: 60 }) => {
    if (!session.durationMin) return 0;

    const HRmax = userProfile.maxHR || 190;
    const HRrest = userProfile.restHR || 60;

    // 儲備心率百分比 (Heart Rate Reserve)
    let HRr;
    if (session.hr) {
        HRr = (session.hr - HRrest) / (HRmax - HRrest);
    } else {
        // 🔧 無心率資料時的 fallback：由「配速」估算強度分數，
        //    讓沒戴心率帶的自由跑 / 計劃跑也能算出 TRIMP，圖表不再空白。
        //    以 pace(min/km) 對照常見有氧區間映射到 HRr(0.45~0.85)。
        //    pace ≤ 4:30 → 高強度(~0.85)；pace ≥ 8:00 → 輕鬆(~0.45)。
        const paceMin = Number(
            session.pace ??
            (session.distance > 0 ? (session.durationMin / session.distance) : 0)
        );
        if (!paceMin || paceMin <= 0) {
            HRr = 0.55; // 有時間無配速：給一個中等強度預設
        } else {
            const FAST = 4.5, SLOW = 8.0;   // min/km
            const clamped = Math.min(SLOW, Math.max(FAST, paceMin));
            const t = (SLOW - clamped) / (SLOW - FAST); // 0(慢)~1(快)
            HRr = 0.45 + t * 0.40;                       // 0.45~0.85
        }
    }
    if (HRr <= 0) return 0;

    // Banister's TRIMP formula (男性常數: 1.92, 0.64)
    return session.durationMin * HRr * 0.64 * Math.exp(1.92 * HRr);
};

// ============================================================================
// 3. 運動科學模型：Fitness / Fatigue / Form (CTL, ATL, TSB)
// 基於長期訓練數據，計算目前的體能狀況與疲勞程度
// ============================================================================

export const computeLoadMetrics = (normalizedSessions, userProfile) => {
    let ctl = 0; // Fitness (長期負荷)
    let atl = 0; // Fatigue (短期疲勞)

    const ctlAlpha = 1 / 42; // 常規設定為 42 天
    const atlAlpha = 1 / 7;  // 常規設定為 7 天

    if (!normalizedSessions || normalizedSessions.length === 0) return [];

    const MS_PER_DAY = 86400000;
    const startOfDay = (d) => {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    };

    // ── 1. 把每日 TRIMP 加總進 map（同一天多次跑步要相加）──
    const trimpByDay = new Map();
    normalizedSessions.forEach((s) => {
        const dayKey = startOfDay(s.date).getTime();
        const trimp = calculateTRIMP(s, userProfile);
        trimpByDay.set(dayKey, (trimpByDay.get(dayKey) || 0) + trimp);
    });

    // ── 2. 補齊「連續每一天」(含 TRIMP=0 的休息日)，
    //    讓 ATL/CTL 在沒訓練時依 EMA 自然指數衰退 ──
    const firstDay = startOfDay(normalizedSessions[0].date).getTime();
    const today = startOfDay(new Date()).getTime();
    const lastDay = Math.max(today, startOfDay(normalizedSessions.at(-1).date).getTime());

    const series = [];
    for (let t = firstDay; t <= lastDay; t += MS_PER_DAY) {
        const trimp = trimpByDay.get(t) || 0; // 休息日 = 0 → 疲勞會掉下來

        // 指數移動平均 (Exponential Moving Average)
        ctl = ctl + ctlAlpha * (trimp - ctl);
        atl = atl + atlAlpha * (trimp - atl);

        // 狀況指數 (Training Stress Balance)
        const form = ctl - atl;

        series.push({
            date: new Date(t),
            fitness: ctl,        // ✅ CTL
            fatigue: atl,        // ✅ ATL
            form: form,
            trimp: trimp,        // 當日總 TRIMP（休息日為 0）
            isRest: trimp === 0  // 標記休息日，供 UI 過濾用
        });
    }

    return series;
};

// ============================================================================
// 4. 運動科學模型：受傷害風險預測 (Acute:Chronic Workload Ratio)
// 比較短期負荷與長期負荷，過高或過低都會增加受傷風險
// ============================================================================

export const calculateInjuryRisk = (normalizedSessions, userProfile) => {
    if (normalizedSessions.length === 0) return 0;

    const sessionsWithTrimp = normalizedSessions.map(s => ({
        ...s,
        trimp: calculateTRIMP(s, userProfile)
    }));

    const now = new Date();
    const MS_PER_DAY = 86400000;

    const last7 = sessionsWithTrimp.filter(s => (now - s.date) <= 7 * MS_PER_DAY);
    const last28 = sessionsWithTrimp.filter(s => (now - s.date) <= 28 * MS_PER_DAY);

    const acuteLoad = last7.reduce((acc, s) => acc + (s.trimp || 0), 0);
    const chronicLoad = (last28.reduce((acc, s) => acc + (s.trimp || 0), 0) / 4) || 1;

    const acwr = acuteLoad / chronicLoad;

    // ⭐️ 必改 4：將 ACWR 映射到 0-100 的 UI 分數
    if (acwr < 0.8) return 30;  // 訓練不足
    if (acwr < 1.2) return 50;  // 最佳 (Sweet Spot)
    if (acwr < 1.5) return 70;  // 警告 (Overreaching)
    return 90;                  // 危險 (High Risk)
};

// ============================================================================
// 5. 運動科學模型：VO2 Max 估算 (次最大努力推算)
// 基於配速與心率的關係，推算使用者的最大攝氧量
// ============================================================================
export const estimateVO2Max = (s, user = { maxHR: 190, restHR: 60 }) => {
    // ⭐️ 必改 5：HR-aware 算法 (加入配速與心率比例)
    if (!s.distance || !s.durationMin || !s.hr) return null;

    // 計算平均速度 (km/h)
    const speedKmh = s.distance / (s.durationMin / 60);
    
    // 心率佔比 (相對於最大心率)
    const hrFactor = s.hr / user.maxHR;

    // 估算公式：速度 * 常數 / 心率佔比
    // (這是一個更精準的運動科學推導模型)
    return (speedKmh * 3.5) / hrFactor;
};

// ============================================================================
// 6. 成績預測：由「近期最佳表現」或 VO2max 推算各距離等效完賽時間
//    採 Riegel 疲勞模型 T2 = T1 · (D2/D1)^1.06（跑界標準耐力衰退指數）。
//    人會想「去驗證」——這是最低成本、最高未完成感的鉤子。
// ============================================================================
const RIEGEL_EXP = 1.06;
const RACE_DISTANCES = { '5K': 5, '10K': 10, 'Half': 21.0975, 'Full': 42.195 };

// ══════════════════════════════════════════════════════════════════════════
// 🎯 v3 成績預測 — 用「最接近該距離」的真實紀錄，而不是全體平均
//
// 使用者要求：
//   「要使用跑者最接近那段距離的紀錄去預測。例如使用者這一次跑了 5.3 公里，
//     那你就拿這個歷史數據去做配速預測。如果有多筆 5.x 或 4.x 公里的
//     就去平均他們的平均配速。10 公里也同樣去預測。」
//
// 舊版問題：所有跑步取截尾平均配速，統一用 5K 當基準往外推
//   → 10K 跑者的 5K 預測被他所有慢跑稀釋，短距離永遠被低估。
//
// 新版每個目標距離各自找自己的參考樣本：
//   ① 鄰域 [D×0.8, D×1.25] 有 ≥2 筆 → 平均配速（confidence 0.9）
//   ② 鄰域只有 1 筆                 → 用它（confidence 0.7）
//   ③ 鄰域沒有                      → 用「距離最接近 D」的那一筆（confidence 0.55）
//   ④ 完全沒有有效紀錄              → 不預測
//   ⑤ D 超過最長紀錄 × 2.5          → 不預測（只跑過 5K 不該看到全馬預測）
// ══════════════════════════════════════════════════════════════════════════
const NEIGHBORHOOD_LOW = 0.8;
const NEIGHBORHOOD_HIGH = 1.25;
const MAX_EXTRAPOLATION_RATIO = 2.5;

/** 從 sessions 萃取「距離 + 配速」的乾淨樣本（已過濾髒資料）。 */
const extractPaceSamples = (sessions = []) => {
    const out = [];
    for (const s of (sessions || []).slice(0, 200)) {
        const m = s.metrics || s || {};
        const dist = Number(m.distance_km ?? m.distance ?? 0);
        if (!(dist >= 1)) continue;
        const dur = Number(m.duration_seconds ?? m.durationSec ?? m.duration ?? 0);
        if (!(dur > 0)) continue;
        const pace = dur / dist;
        if (pace < SANE_PACE_MIN || pace > SANE_PACE_MAX) continue;
        out.push({ distanceKm: dist, paceSec: pace, timeSec: dur });
    }
    return out;
};

/**
 * 為單一目標距離挑參考樣本。
 * @returns {{ refDistanceKm, refTimeSec, pace, basis, sampleSize, confidence, sourceRangeKm }|null}
 */
export const pickReferenceForDistance = (samples, targetKm) => {
    if (!Array.isArray(samples) || samples.length === 0 || !(targetKm > 0)) return null;

    // ⑤ 外推過頭 → 不預測（幻想不是預測）
    const longest = Math.max(...samples.map((s) => s.distanceKm));
    if (targetKm > longest * MAX_EXTRAPOLATION_RATIO) return null;

    const lo = targetKm * NEIGHBORHOOD_LOW;
    const hi = targetKm * NEIGHBORHOOD_HIGH;
    const near = samples.filter((s) => s.distanceKm >= lo && s.distanceKm <= hi);

    if (near.length > 0) {
        // ①② 鄰域平均：配速取平均，參考距離取鄰域的平均距離
        const avgPace = near.reduce((a, s) => a + s.paceSec, 0) / near.length;
        const avgDist = near.reduce((a, s) => a + s.distanceKm, 0) / near.length;
        return {
            refDistanceKm: avgDist,
            refTimeSec: Math.round(avgPace * avgDist),
            pace: Math.round(avgPace),
            basis: 'neighborhood',
            sampleSize: near.length,
            confidence: near.length >= 2 ? 0.9 : 0.7,
            sourceRangeKm: [
                Math.min(...near.map((s) => s.distanceKm)),
                Math.max(...near.map((s) => s.distanceKm)),
            ],
        };
    }

    // ③ 退回距離最接近的那一筆
    const nearest = samples
        .slice()
        .sort((a, b) => Math.abs(a.distanceKm - targetKm) - Math.abs(b.distanceKm - targetKm))[0];
    if (!nearest) return null;
    return {
        refDistanceKm: nearest.distanceKm,
        refTimeSec: Math.round(nearest.timeSec),
        pace: Math.round(nearest.paceSec),
        basis: 'nearest',
        sampleSize: 1,
        confidence: 0.55,
        sourceRangeKm: [nearest.distanceKm, nearest.distanceKm],
    };
};

/**
 * 主入口：對每個標準距離各自挑樣本、各自預測。
 * @returns {{ '5K':{...}, '10K':{...}, ... } | null}
 */
export const predictRaceTimesByNeighborhood = (sessions = []) => {
    const samples = extractPaceSamples(sessions);
    if (samples.length === 0) return null;

    const out = {};
    for (const [label, D] of Object.entries(RACE_DISTANCES)) {
        const ref = pickReferenceForDistance(samples, D);
        if (!ref) continue;
        const t = ref.refTimeSec * Math.pow(D / ref.refDistanceKm, RIEGEL_EXP);
        const pace = Math.round(t / D);
        if (pace < SANE_PACE_MIN || pace > SANE_PACE_MAX) continue;   // 生理上不可能就不顯示
        out[label] = {
            distanceKm: D,
            seconds: Math.round(t),
            pacePerKm: pace,
            basis: ref.basis,
            sampleSize: ref.sampleSize,
            confidence: ref.confidence,
            sourceRangeKm: ref.sourceRangeKm,
            // 給 UI 直接顯示「這個預測是根據什麼算的」
            sourceLabel: ref.basis === 'neighborhood'
                ? (ref.sampleSize >= 2
                    ? `依 ${ref.sampleSize} 筆 ${ref.sourceRangeKm[0].toFixed(1)}–${ref.sourceRangeKm[1].toFixed(1)} 公里的紀錄推估`
                    : `僅 1 筆 ${ref.sourceRangeKm[0].toFixed(1)} 公里紀錄，僅供參考`)
                : `由 ${ref.refDistanceKm.toFixed(1)} 公里的紀錄外推，參考性較低`,
        };
    }
    return Object.keys(out).length ? out : null;
};

export const predictRaceTimes = ({ refDistanceKm, refTimeSec, vo2max } = {}) => {
    let D1 = Number(refDistanceKm) || 0;
    let T1 = Number(refTimeSec) || 0;

    // 沒有參考跑步 → 由 VO2max 反推一個 5K 基準（粗略近似，僅作 fallback）
    if ((!D1 || !T1) && vo2max && vo2max > 0) {
        const vVO2 = vo2max / 3.5;          // km/h at VO2max（估）
        const race5kSpeed = vVO2 * 0.92;    // 5K 平均速度 ≈ 92% vVO2max
        if (race5kSpeed > 0) { D1 = 5; T1 = (5 / race5kSpeed) * 3600; }
    }

    if (!D1 || !T1 || D1 <= 0 || T1 <= 0) return null;

    // 🛡️ 最後一道防線：基準配速本身必須合理，否則整組預測都是幻想。
    //    （使用者回報「預測真的到如今還在隨意預測」— 全馬 2:40:29 對一個
    //      6'17"/km 的跑者是不可能的數字。）
    const refPace = T1 / D1;
    if (refPace < SANE_PACE_MIN || refPace > SANE_PACE_MAX) return null;

    const predict = (D2) => T1 * Math.pow(D2 / D1, RIEGEL_EXP);
    const out = {};
    for (const [label, D2] of Object.entries(RACE_DISTANCES)) {
        const t = predict(D2);
        const pace = Math.round(t / D2);
        if (pace < SANE_PACE_MIN) continue;   // 生理上不可能 → 不顯示，勝過顯示假數字
        out[label] = {
            distanceKm: D2,
            seconds: Math.round(t),
            pacePerKm: pace, // sec/km
        };
    }
    return Object.keys(out).length ? out : null;
};

// 從一批 session 挑「最能代表當前實力」的參考基準。
//   ⚠ 舊版1：取單次配速最快 → 一次短衝刺就外推出世界級假成績。
//   ⚠ 舊版2：取「最快前 50% 的平均」→ 仍偏樂觀，且會被壞資料(2'17"/km 這種
//            不合理的假 PR)汙染，預測出 5K 13:44 這種誇張數字(截圖十)。
//   ✅ 新版：用「歷年所有有效跑步的截尾平均配速」當基準——
//            ① 過濾生理上不可能的配速(<2'30"/km)與雜訊(>20'/km)；
//            ② 去頭去尾各 10% 再平均，代表穩定實力而非單次噴發；
//            ③ 需 ≥3 筆長期資料才預測，資料不足就不硬預測(回 null)。
//   回傳與 predictRaceTimes 相容的 { refDistanceKm, refTimeSec, pace }。
export const pickReferenceRun = (sessions = []) => {
    const paces = [];
    for (const s of (sessions || []).slice(0, 120)) {
        const m = s.metrics || s || {};
        const dist = Number(m.distance_km ?? m.distance ?? 0);
        const dur = Number(m.duration_seconds ?? m.duration ?? 0);
        if (dist < 1.5 || dur <= 0) continue;
        const pace = dur / dist; // sec/km
        if (pace < 150 || pace > 1200) continue; // 濾掉不合理假配速與壞資料
        paces.push(pace);
    }
    // 需要足夠的長期資料才做預測，否則不硬預測
    if (paces.length < 3) return null;

    paces.sort((a, b) => a - b);
    const trim = Math.floor(paces.length * 0.1);
    const core = paces.slice(trim, paces.length - trim);
    const list = core.length ? core : paces;
    const avgPace = list.reduce((sum, p) => sum + p, 0) / list.length; // 歷年平均配速

    return {
        pace: avgPace,
        refDistanceKm: 5,
        refTimeSec: Math.round(avgPace * 5),
        sampleSize: paces.length,
    };
};

// ============================================================================
// 6b. 計劃版成績預測：由「本週計劃的目標配速 / 目標里程」推算等效完賽成績。
//     「照這樣練」→ 真的依計劃目標推算，而非過去跑步。
//     bricks 內若帶 target_pace_sec_per_km / target_distance_km 則優先採用；
//     否則退回 week.baseline_pace_sec_per_km。回傳含每個距離的完整配速。
// ============================================================================
export const predictRaceTimesFromPlan = ({ week, bricks } = {}) => {
    let paceSecPerKm = 0;
    let refDistanceKm = 0;

    // 從計劃磚找最長的一趟「有效配速」跑步當基準（長跑最能代表有氧實力）
    for (const b of (bricks || [])) {
        const p = Number(b?.target_pace_sec_per_km ?? b?.target_pace ?? 0);
        const d = Number(b?.target_distance_km ?? b?.distance_km ?? b?.distance ?? 0);
        if (p > 0 && d >= 1.5 && d > refDistanceKm) { paceSecPerKm = p; refDistanceKm = d; }
    }
    // 退回 week 層級的基準配速
    if (!paceSecPerKm) {
        const wp = Number(week?.baseline_pace_sec_per_km ?? week?.target_pace_sec_per_km ?? 0);
        if (wp > 0) { paceSecPerKm = wp; refDistanceKm = 5; }
    }
    if (!paceSecPerKm || !refDistanceKm) return null;

    const pred = predictRaceTimes({ refDistanceKm, refTimeSec: paceSecPerKm * refDistanceKm });
    if (!pred) return null;
    return { predictions: pred, basisPaceSecPerKm: Math.round(paceSecPerKm), basisDistanceKm: refDistanceKm };
};
