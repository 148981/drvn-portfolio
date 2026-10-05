/**
 * cutProgress.js — 「這一期的體重進度」單一真相源
 * ══════════════════════════════════════════════════════════════════════
 * 解決的問題：
 *   使用者在減脂期心裡只有兩句話 —— 「我掉了幾公斤」與「還要多久」。
 *   但 app 過去沒有任何一個地方直接回答：總覽頁只有一行 10px 的
 *   「72KG → 65KG」（那是目標，不是進度），分析頁的「目標配速引擎」
 *   算的是「照你吃的推估你應該掉多少」，而且被「進階圖表」開關擋住，
 *   預設使用者根本看不到。
 *
 * 誠實數據鐵律（本檔的核心約束）：
 *   進度一律以「實測體重」計算。熱量結餘推估出來的曲線不是進度，
 *   拿它冒充事實會直接違反產品的第一條鐵律。所以：
 *     · 這一期開始之後沒有量過 → 回 'no_measurement'，讓 UI 顯示誠實空狀態
 *     · 量測太舊 → 照樣算，但回報 ageDays 讓 UI 標記
 *     · 達標日一律用「實際配速」重算，不沿用承諾當下寫死的 etaDate ——
 *       那個日期是用目標配速算的，走得慢的人看到它只會覺得系統在騙人
 *
 * 單一真相源：總覽頁的一行極簡版與分析頁的完整卡片都讀這支，
 * 兩處數字不可能再打架（完成狀態兩處不一致是 P0 bug）。
 */

/** 量測值容錯萃取（欄位別名地獄：weight_kg / weight、measurement_date / date / created_at） */
const readMeasurements = (userId) => {
    let raw = [];
    try { raw = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]'); }
    catch { return []; }
    if (!Array.isArray(raw)) return [];
    return raw
        .map((r) => {
            const w = Number(r?.weight_kg ?? r?.weight);
            const d = r?.measurement_date || r?.date || r?.created_at || null;
            const t = d ? new Date(String(d).slice(0, 10)).getTime() : NaN;
            const bf = Number(r?.body_fat_percent ?? r?.body_fat_percentage);
            return {
                t,
                weight: Number.isFinite(w) && w > 30 && w < 300 ? w : null,
                bodyFat: Number.isFinite(bf) && bf > 0 && bf < 60 ? bf : null,
            };
        })
        .filter((m) => m.weight != null && Number.isFinite(m.t))
        .sort((a, b) => a.t - b.t);
};

const DAY = 86400000;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * 這一期走到哪了。
 *
 * @param {string} userId
 * @param {object} activePlan  drvn_nutrition_plan_<uid> 的內容
 * @param {Date}   [today]
 * @returns {{
 *   status: 'no_plan'|'no_measurement'|'too_early'|'ok',
 *   direction: 'cut'|'bulk'|'recomp',
 *   startWeight:number|null, currentWeight:number|null, targetWeight:number|null,
 *   movedKg:number|null,      // 往目標方向移動了多少（正數 = 有進展）
 *   remainingKg:number|null,  // 這一期還沒走完的部分（走過頭時為 0）
 *   overshootKg:number,       // 超過目標多少（沒超過就是 0）
 *   progressPct:number|null,  // 0–100
 *   offTrack:boolean,         // 往反方向跑
 *   weekIndex:number, weeksElapsed:number,
 *   actualPaceKgWk:number|null, targetPaceKgWk:number|null,
 *   etaDate:Date|null, etaReachable:boolean,
 *   measuredAt:Date|null, ageDays:number|null,
 *   headline:string, support:string
 * }}
 */
/**
 * 這一期的起點體重 —— 取「開始當下」最接近的一筆真實量測。
 *
 * 開始那天（含前後一天）或更早有量過 → 用最靠近開始那天的那一筆。
 * 開始之前完全沒量過 → 用之後的第一筆（那是我們手上最早的真實數字）。
 * 一次都沒量過 → 回 null，讓呼叫端決定要不要退回計劃裡存的值。
 *
 * @param {Array<{t:number,weight:number}>} list 依時間由舊到新
 * @param {number} committedAt
 * @returns {number|null}
 */
function startFromMeasurements(list, committedAt) {
    if (!Array.isArray(list) || !list.length) return null;
    const before = list.filter((m) => m.t <= committedAt + DAY);
    if (before.length) return before[before.length - 1].weight;
    return list[0].weight;
}

export function computeCutProgress(userId, activePlan, today = new Date()) {
    const base = {
        status: 'no_plan', direction: 'cut',
        startWeight: null, currentWeight: null, targetWeight: null,
        movedKg: null, remainingKg: null, overshootKg: 0, progressPct: null, offTrack: false,
        weekIndex: 0, weeksElapsed: 0,
        actualPaceKgWk: null, targetPaceKgWk: null,
        etaDate: null, etaReachable: false,
        measuredAt: null, ageDays: null,
        headline: '', support: '',
    };
    if (!activePlan?.goalType || !activePlan?.committedAt) return base;

    const direction = activePlan.goalType === 'bulk' ? 'bulk'
        : activePlan.goalType === 'recomp' ? 'recomp' : 'cut';
    const targetWeight = Number(activePlan.targetWeight) || null;
    const committedAt = Number(activePlan.committedAt);
    const now = today.getTime();
    const daysElapsed = Math.max(0, Math.floor((now - committedAt) / DAY));
    const weeksElapsed = daysElapsed / 7;
    const weekIndex = Math.floor(daysElapsed / 7) + 1;
    const targetPaceKgWk = Number(activePlan.pace) > 0
        ? (direction === 'bulk' ? Number(activePlan.pace) : -Number(activePlan.pace))
        : null;

    const shared = { ...base, status: 'no_measurement', direction, targetWeight, targetPaceKgWk, weekIndex, weeksElapsed };

    /* 起點：這一期開始當下那一筆「真實量測」。
       ⚠️ 原本一律用 activePlan.currentWeight，註解寫「它本身就是取自當時最新的
          一筆量測」—— 這個假設是錯的。建立計劃時如果還沒量過體重，
          NutritionEngine 會用 `parseFloat(weight) || 70` 把 70 頂上去，
          那個 70 被存進計劃之後就永遠蓋過使用者真正量到的數字。
          畫面上就會長成「目前 65.2 ／ 起點 70 ／ 今天該到 70.3」這種
          自己跟自己打架的狀態，配速也跟著整條算歪。
          真實量測永遠優先；存在計劃裡的值只有在一次都沒量過時才拿來用。 */
    const all = readMeasurements(userId);
    const startWeight = startFromMeasurements(all, committedAt)
        ?? (Number(activePlan.currentWeight) || null);
    if (!startWeight || !targetWeight) {
        return { ...shared, startWeight, headline: '還沒有量測紀錄', support: '量一次體重，這裡就會開始追蹤進度。' };
    }

    // 現在：這一期開始「之後」的最新一筆量測。沒有就是沒有 —— 不拿熱量推估頂替。
    const after = all.filter((m) => m.t >= committedAt - DAY);
    const latest = after.length ? after[after.length - 1] : null;
    if (!latest) {
        return {
            ...shared, startWeight,
            headline: '開始之後還沒量過',
            support: `起點 ${r1(startWeight)} kg。量一次就能看到自己走到哪。`,
        };
    }

    const currentWeight = latest.weight;
    const measuredAt = new Date(latest.t);
    const ageDays = Math.max(0, Math.floor((now - latest.t) / DAY));

    // 往目標方向移動了多少（正數 = 有進展，負數 = 反方向）
    const totalKg = Math.abs(targetWeight - startWeight);
    const signedDelta = currentWeight - startWeight;
    const towardTarget = targetWeight < startWeight ? -signedDelta : signedDelta;
    const movedKg = r1(towardTarget);
    // ⚠️ 「還剩多少」要用「這一期還沒走完的部分」算，不是「現在離目標多遠」。
    //    走過頭時後者會變大：起點 70 → 目標 70.2，量到 74.9 會顯示
    //    「進度 100%、還剩 4.7 kg」—— 同一張卡自己打自己，最傷信任。
    const remainingKg = r1(Math.max(0, totalKg - towardTarget));
    const overshootKg = towardTarget > totalKg ? r1(towardTarget - totalKg) : 0;
    const offTrack = towardTarget < -0.2;
    const progressPct = totalKg > 0
        ? Math.max(0, Math.min(100, Math.round((towardTarget / totalKg) * 100)))
        : null;

    // 太早：不到一週就談配速是雜訊（單日水分波動就 ±1kg）
    if (weeksElapsed < 1) {
        return {
            ...shared, status: 'too_early', startWeight, currentWeight, measuredAt, ageDays,
            movedKg, remainingKg, overshootKg, progressPct, offTrack,
            headline: '這一期剛開始',
            support: `起點 ${r1(startWeight)} kg → 目標 ${r1(targetWeight)} kg。滿一週後這裡會出現配速與達標日。`,
        };
    }

    // 實際配速（實測，不是熱量推估）
    const actualPaceKgWk = r2(signedDelta / weeksElapsed);
    const paceTowardTarget = targetWeight < startWeight ? -actualPaceKgWk : actualPaceKgWk;

    // 達標日一律用「實際配速」重算。走反方向或幾乎沒動 → 不編一個到不了的日期。
    let etaDate = null;
    let etaReachable = false;
    if (paceTowardTarget > 0.05 && remainingKg > 0.05) {
        const weeksLeft = remainingKg / paceTowardTarget;
        if (weeksLeft < 260) {          // 五年以上就不是一個有意義的預測
            etaDate = new Date(now + weeksLeft * 7 * DAY);
            etaReachable = true;
        }
    } else if (remainingKg <= 0.05) {
        etaReachable = true;            // 已經到了
    }

    const verb = direction === 'bulk' ? '增' : '減';
    const headline = remainingKg <= 0.05
        ? '已達標'
        : offTrack
            ? `體重反而${direction === 'bulk' ? '少' : '多'}了 ${Math.abs(movedKg)} kg`
            : `已${verb} ${Math.abs(movedKg)} kg`;
    const support = remainingKg <= 0.05
        ? (overshootKg > 0.3
            ? `${r1(startWeight)} → ${r1(currentWeight)} kg，已超過目標 ${overshootKg} kg。`
            : `${r1(startWeight)} → ${r1(currentWeight)} kg，目標達成。`)
        : etaReachable
            ? `還剩 ${remainingKg} kg・第 ${weekIndex} 週`
            : `還剩 ${remainingKg} kg・目前的速度到不了，配速需要調整`;

    /* 數字合不合理：每週變化超過 2 kg 不是脂肪的速度（多半是量錯、換了秤、或起點那筆是別人的）。
       不硬下結論，交給畫面先請使用者確認。 */
    const implausible = Math.abs(actualPaceKgWk) > 2;
    /* 目標跟方向對不起來：減脂卻把目標設得比起點重（或增重目標比起點輕）。 */
    const targetMismatch = (direction === 'cut' && targetWeight > startWeight + 0.2)
        || (direction === 'bulk' && targetWeight < startWeight - 0.2);

    return {
        status: 'ok', direction, implausible, targetMismatch,
        startWeight: r1(startWeight), currentWeight: r1(currentWeight), targetWeight: r1(targetWeight),
        movedKg, remainingKg, overshootKg, progressPct, offTrack,
        weekIndex, weeksElapsed,
        actualPaceKgWk, targetPaceKgWk,
        etaDate, etaReachable,
        measuredAt, ageDays,
        headline, support,
    };
}

/** 這一期的實測體重點（畫趨勢圖用；只有量過的日子，不內插） */
export function cycleWeightSeries(userId, activePlan) {
    if (!activePlan?.committedAt) return [];
    const from = Number(activePlan.committedAt) - 14 * DAY;   // 起點前兩週也帶進來，看得到「從哪裡開始」
    return readMeasurements(userId).filter((m) => m.t >= from).map((m) => {
        const d = new Date(m.t);
        return { t: m.t, label: `${d.getMonth() + 1}/${d.getDate()}`, weight: r1(m.weight), bodyFat: m.bodyFat };
    });
}

/** 達標日格式：11/24（同年）或 2027/1/8（跨年） */
export function formatEta(d, today = new Date()) {
    if (!d) return null;
    const sameYear = d.getFullYear() === today.getFullYear();
    return sameYear
        ? `${d.getMonth() + 1}/${d.getDate()}`
        : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default computeCutProgress;
