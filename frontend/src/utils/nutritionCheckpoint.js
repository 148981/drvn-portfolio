/**
 * nutritionCheckpoint.js — 減脂／增重／維持計劃的「每 4 週回饋」
 * ══════════════════════════════════════════════════════════════════════
 * 一期可能要走好幾個月，只在「達標那天」結算太晚了 —— 走偏了三個月才知道。
 * 所以每 4 週停一次（跟重訓換季同一個節奏）：
 *
 *   1. 先量：上次量體重超過 7 天 → 先請使用者量一次（體重必填、體脂選填）。
 *      回饋只用實測數字，不用熱量推估頂替。
 *   2. 結果：這 4 週照原訂配速應該走多少、實際走了多少 → 達成／差一點／沒動／走反／太快。
 *      數字太離譜（每週變化 > 2 kg）先問是不是量錯，不硬下結論。
 *   3. 原因：沒達成時，拿這 4 週的紀錄一條一條對（有數字才講）：
 *        記錄天數、平均熱量 vs 目標、週末、蛋白質、點心與含糖飲料、重訓次數、
 *        「照計劃吃了體重卻沒動」（份量低估或代謝適應）、量測次數太少。
 *   4. 接下來：繼續／放慢配速／每天調整熱量 —— 每個選項都說為什麼。
 *   5. 下一期吃什麼：utils/foodGuidance（依這一期真的吃過的東西）。
 *
 * 研究依據：7700 大卡 ≈ 1 kg 體重（粗估）；規律自我記錄與減重成效有一致的正相關（Burke 2011）；
 *   減脂每週 0.5–1% 體重較能保住肌肉（ISSN 2017）；增重每週 0.25–0.5%（Iraki 2019）。
 * 純函式＋讀幾個 localStorage key；node 驗證腳本直接 import。
 * ══════════════════════════════════════════════════════════════════════
 */
import { computeCutProgress } from './cutProgress';
import { committedNutritionGoals } from './nutritionTargets';
import { slotOfEntry } from './foodGuidance';

export const CHECKPOINT_WEEKS = 4;
export const MEASURE_FRESH_DAYS = 7;
export const KCAL_PER_KG = 7700;
const DAY = 86400000;
const r0 = (v) => Math.round(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const dkey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ── 讀取 ─────────────────────────────────────────────────────────── */
export function readMeasurements(userId) {
    let raw = [];
    try { raw = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]'); } catch { return []; }
    if (!Array.isArray(raw)) return [];
    return raw.map((r) => {
        const d = r?.measurement_date || r?.date || r?.created_at;
        const t = d ? new Date(String(d).slice(0, 10)).getTime() : NaN;
        const w = num(r?.weight_kg ?? r?.weight);
        const bf = num(r?.body_fat_percent ?? r?.body_fat_percentage);
        return { t, weight: w && w > 30 && w < 300 ? w : null, bodyFat: bf && bf > 0 && bf < 60 ? bf : null };
    }).filter((m) => m.weight != null && Number.isFinite(m.t)).sort((a, b) => a.t - b.t);
}

const STORE = (uid) => `drvn_nutrition_checkpoints_${uid || 'guest'}`;
export function readCheckpointStore(userId) {
    try { const v = JSON.parse(localStorage.getItem(STORE(userId)) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
/** 記下這一期第 n 次回饋看過了（連同結果摘要，之後的回饋看得到上一次） */
export function markCheckpointReviewed(userId, planId, index, summary = null) {
    const all = readCheckpointStore(userId);
    const cur = all[planId] || { reviewed: [], results: {} };
    for (let i = 1; i <= index; i++) if (!cur.reviewed.includes(i)) cur.reviewed.push(i);
    if (summary) cur.results[index] = summary;
    all[planId] = cur;
    try { localStorage.setItem(STORE(userId), JSON.stringify(all)); } catch { /* 隱私模式 */ }
    return cur;
}

/* ── 什麼時候該回饋 ───────────────────────────────────────────────── */
/**
 * 現在有沒有該看的回饋：最近一個「已經走完」的 4 週區塊、而且還沒看過。
 * 好幾個區塊都沒看（很久沒開 App）→ 只回最近那一個，前面的一起算看過。
 */
export function checkpointDue(plan, store = {}, today = new Date()) {
    if (!plan?.committedAt || !plan?.goalType) return null;
    const from0 = Number(plan.committedAt);
    const span = CHECKPOINT_WEEKS * 7 * DAY;
    const done = Math.floor((today.getTime() - from0) / span);
    if (done < 1) return null;
    const reviewed = store?.[plan.planId]?.reviewed || [];
    if (reviewed.includes(done)) return null;
    return { index: done, from: from0 + (done - 1) * span, to: from0 + done * span };
}

/** 下一次回饋還有幾天（總覽頁的一行小字用） */
export function daysToNextCheckpoint(plan, today = new Date()) {
    if (!plan?.committedAt) return null;
    const span = CHECKPOINT_WEEKS * 7 * DAY;
    const el = today.getTime() - Number(plan.committedAt);
    return Math.max(0, Math.ceil((span - (el % span)) / DAY));
}

/** 回饋前要不要先量：最新一筆超過 7 天、或這個區塊開始之後都沒量過 */
export function needsFreshMeasurement(measures, block, today = new Date()) {
    const last = measures[measures.length - 1];
    if (!last) return { need: true, last: null, ageDays: null };
    const ageDays = Math.floor((today.getTime() - last.t) / DAY);
    return { need: ageDays > MEASURE_FRESH_DAYS || last.t < block.from - DAY, last, ageDays };
}

/* ── 這 4 週的紀錄 ─────────────────────────────────────────────────── */
function adherenceOf({ plan, dailyLogs = [], mealDays = [], training = null, block }) {
    const goals = committedNutritionGoals(plan) || {};
    const targetKcal = num(goals.calories) || num(plan?.adjustedIntake) || null;
    const targetProtein = num(goals.protein) || num(plan?.newProtein) || null;
    const blockDays = Math.max(1, Math.round((block.to - block.from) / DAY));
    const inBlock = (date) => { const t = new Date(`${String(date).slice(0, 10)}T12:00:00`).getTime(); return t >= block.from && t < block.to; };
    const logged = (dailyLogs || []).filter((d) => d && inBlock(d.date) && num(d.calories) > 0);
    const loggedDays = new Set(logged.map((d) => String(d.date).slice(0, 10))).size;
    const avg = (arr, k) => (arr.length ? arr.reduce((s, d) => s + (num(d[k]) || 0), 0) / arr.length : null);
    const avgKcal = avg(logged, 'calories');
    const avgProtein = avg(logged, 'protein');
    const isWeekend = (d) => { const w = new Date(`${String(d.date).slice(0, 10)}T12:00:00`).getDay(); return w === 0 || w === 6; };
    const we = logged.filter(isWeekend), wd = logged.filter((d) => !isWeekend(d));
    const weekendDiff = we.length >= 2 && wd.length >= 3 ? avg(we, 'calories') - avg(wd, 'calories') : null;

    // 點心／宵夜佔比、含糖飲料（要逐筆紀錄才算得出來）
    let snackKcal = 0, totalKcal = 0, drinks = 0, entryDays = 0;
    (mealDays || []).filter((d) => inBlock(d.date)).forEach((d) => {
        let any = false;
        (d.meals || []).forEach((e) => {
            const k = num(e?.calories) || 0;
            if (k <= 0) return;
            any = true;
            totalKcal += k;
            if (slotOfEntry(e) === 'snacks') snackKcal += k;   // 跟快速新增的分餐同一套時間規則
            if (/奶茶|珍珠|汽水|可樂|果汁|手搖|含糖|冰沙/.test(String(e?.name || '')) && (num(e?.protein) || 0) < 5) drinks += 1;
        });
        if (any) entryDays += 1;
    });
    const weeks = blockDays / 7;
    return {
        blockDays, loggedDays, loggedPct: loggedDays / blockDays,
        targetKcal, avgKcal: avgKcal == null ? null : r0(avgKcal),
        kcalDiff: avgKcal != null && targetKcal ? r0(avgKcal - targetKcal) : null,
        kcalDiffPct: avgKcal != null && targetKcal ? r2((avgKcal - targetKcal) / targetKcal) : null,
        targetProtein, avgProtein: avgProtein == null ? null : r0(avgProtein),
        weekendDiff: weekendDiff == null ? null : r0(weekendDiff),
        snackShare: totalKcal > 0 && entryDays >= 5 ? r2(snackKcal / totalKcal) : null,
        drinksPerWeek: entryDays >= 5 ? r1(drinks / weeks) : null,
        strengthPerWeek: training ? r1((training.strength || 0) / weeks) : null,
        cardioPerWeek: training ? r1((training.cardio || 0) / weeks) : null,
    };
}

/** 這個區塊的訓練次數（與 nutritionCycle 讀同一組 key） */
export function readTrainingInBlock(userId, block) {
    const readList = (key) => { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
    const count = (rows) => rows.filter((r) => {
        const t = new Date(r?.date || r?.completedAt || r?.timestamp || r?.startTime || r?.ts).getTime();
        return Number.isFinite(t) && t >= block.from && t < block.to;
    }).length;
    const sRows = [...readList('workout_history'), ...readList(`workout_history_${userId}`)];
    const cRows = [...readList('cardio_sessions'), ...readList(`cardio_sessions_${userId}`)];
    if (!sRows.length && !cRows.length) return null;     // 完全沒有訓練資料 → 不說「你都沒練」
    return { strength: count(sRows), cardio: count(cRows) };
}

/* ── 評估 ─────────────────────────────────────────────────────────── */
/**
 * @param {{ plan, measures, dailyLogs, mealDays, training, block, userId?, today? }} input
 */
export function evaluateCheckpoint({ plan, measures = [], dailyLogs = [], mealDays = [], training = null, block, userId = null, today = new Date() }) {
    const goal = plan.goalType === 'bulk' ? 'bulk' : plan.goalType === 'cut' ? 'cut' : 'maintain';
    const dirSign = goal === 'bulk' ? 1 : -1;
    const weeks = (block.to - block.from) / (7 * DAY);
    const pace = Math.abs(num(plan.pace) || 0);

    // 區塊起點：開始前後最接近的一筆；終點：區塊開始之後最新的一筆
    const before = measures.filter((m) => m.t <= block.from + DAY);
    const startM = before.length ? before[before.length - 1] : measures.find((m) => m.t >= block.from) || null;
    const after = measures.filter((m) => m.t >= block.from - DAY);
    const endM = after.length ? after[after.length - 1] : null;
    const measureCount = measures.filter((m) => m.t >= block.from - DAY && m.t <= today.getTime()).length;

    const adherence = adherenceOf({ plan, dailyLogs, mealDays, training, block });
    const overall = userId ? computeCutProgress(userId, plan, today) : null;

    const base = { goal, index: block.index || null, weeks: r1(weeks), adherence, overall, measureCount };
    if (!startM || !endM || startM === endM) {
        return { ...base, verdict: 'no_data', headline: '這 4 週還沒有兩次量測', sub: '量一次體重，就能跟上一次比。', reasons: [], options: [{ id: 'continue', label: '繼續', primary: true }] };
    }

    const delta = r1(endM.weight - startM.weight);
    const toward = r1(delta * dirSign);                        // 往目標方向走了多少（負 = 走反）
    const spanWeeks = Math.max(0.5, (endM.t - startM.t) / (7 * DAY));
    const perWeek = r2(delta / spanWeeks);
    const expected = goal === 'maintain' ? 0 : r1(pace * weeks);
    const ratio = expected > 0 ? r2(toward / expected) : null;
    const bfDelta = startM.bodyFat != null && endM.bodyFat != null ? r1(endM.bodyFat - startM.bodyFat) : null;
    const pctPerWeek = Math.abs(perWeek) / startM.weight * 100;
    const verb = goal === 'bulk' ? '增' : '減';

    let verdict;
    if (Math.abs(perWeek) > 2) verdict = 'check';
    // 維持／體態重塑沒有「到終點」這回事（目標體重≈起點，一量就到），不判 reached
    else if (goal !== 'maintain' && overall && overall.status === 'ok' && overall.remainingKg <= 0.05) verdict = 'reached';
    else if (goal === 'maintain') verdict = Math.abs(delta) <= 0.8 ? 'achieved' : 'drift';
    else if (goal === 'cut' && toward > 0 && pctPerWeek > 1) verdict = 'too_fast';
    else if (goal === 'bulk' && toward > 0 && pctPerWeek > 0.75) verdict = 'too_fast';
    else if (ratio != null && ratio >= 0.8) verdict = 'achieved';
    else if (toward < -0.3) verdict = 'reverse';
    else if (ratio != null && ratio >= 0.3) verdict = 'partial';
    else verdict = 'missed';

    const fmtKg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} kg`;
    const HEAD = {
        check: `跟上次差了 ${Math.abs(delta)} kg`,
        reached: '目標達成',
        achieved: goal === 'maintain' ? '體重穩住了' : `這 4 週${verb}了 ${Math.abs(toward)} kg`,
        too_fast: `${verb}得比計劃快`,
        partial: `走了一半多一點`,
        missed: '這 4 週幾乎沒動',
        reverse: '這 4 週走反了',
        drift: `體重${delta > 0 ? '多' : '少'}了 ${Math.abs(delta)} kg`,
    };
    const sub = verdict === 'check'
        ? `${startM.weight} → ${endM.weight} kg，每週 ${Math.abs(perWeek)} kg，比身體一般能變化的快很多。是不是量錯了，或換了一台秤？`
        : goal === 'maintain'
            ? `${startM.weight} → ${endM.weight} kg（${fmtKg(delta)}）`
            : `${startM.weight} → ${endM.weight} kg（${fmtKg(delta)}）・照計劃這 4 週是 ${goal === 'bulk' ? '+' : '−'}${expected} kg${ratio != null && ratio > 0 ? `，完成 ${Math.round(ratio * 100)}%` : ''}`;

    const reasons = verdict === 'check' ? [] : buildReasons({ goal, verdict, adherence, ratio, measureCount, expected, toward, weeks });
    const options = buildOptions({ goal, verdict, adherence, ratio, plan, delta });
    const praise = ['achieved', 'reached'].includes(verdict) ? buildPraise({ goal, adherence, bfDelta }) : [];

    return {
        ...base, verdict, headline: HEAD[verdict], sub,
        startWeight: startM.weight, endWeight: endM.weight, delta, toward, expected, ratio, perWeek,
        bodyFat: { start: startM.bodyFat, end: endM.bodyFat, delta: bfDelta },
        reasons, options, praise,
    };
}

/** 沒達成的原因：一條一條對，有數字才講；依影響大小排 */
function buildReasons({ goal, verdict, adherence: a, ratio, measureCount, weeks }) {
    if (['achieved', 'reached'].includes(verdict)) return [];
    const out = [];
    const cutLike = goal !== 'bulk';
    if (a.loggedPct < 0.5) {
        out.push({ code: 'logging', w: 100, title: `${r0(weeks * 7)} 天裡記了 ${a.loggedDays} 天`,
            detail: '記不到一半，系統看不清楚吃了什麼，下面的原因也只能猜。規律記錄的人，減重成效一致比較好。' });
    }
    if (a.kcalDiffPct != null && a.loggedDays >= 5) {
        if (cutLike && a.kcalDiffPct >= 0.08) {
            const kg = r1((a.kcalDiff * a.blockDays) / KCAL_PER_KG);
            out.push({ code: 'over_kcal', w: 90, title: `平均每天多吃 ${a.kcalDiff} 大卡`,
                detail: `目標 ${a.targetKcal}，記錄的日子平均 ${a.avgKcal}。累積 4 週約 ${kg} kg 的差距（7700 大卡 ≈ 1 kg）。` });
        } else if (goal === 'bulk' && a.kcalDiffPct <= -0.08) {
            const kg = r1((-a.kcalDiff * a.blockDays) / KCAL_PER_KG);
            out.push({ code: 'under_kcal', w: 90, title: `平均每天少吃 ${-a.kcalDiff} 大卡`,
                detail: `目標 ${a.targetKcal}，記錄的日子平均 ${a.avgKcal}。4 週少了約 ${kg} kg 的量 —— 增重卡住最常見就是吃不夠。` });
        }
    }
    if (a.weekendDiff != null && ((cutLike && a.weekendDiff >= 300) || (goal === 'bulk' && a.weekendDiff <= -300))) {
        out.push({ code: 'weekend', w: 70, title: `週末平均${a.weekendDiff > 0 ? '多' : '少'} ${Math.abs(a.weekendDiff)} 大卡`,
            detail: cutLike ? '平日做得到，週末把赤字吃回去了。先挑週末的一餐固定下來就好。' : '平日有吃到，週末掉下來。週末也要固定三餐。' });
    }
    if (a.targetProtein && a.avgProtein != null && a.loggedDays >= 5 && a.avgProtein < a.targetProtein * 0.8) {
        out.push({ code: 'protein', w: 60, title: `蛋白質平均 ${a.avgProtein}g（目標 ${a.targetProtein}g）`,
            detail: cutLike ? '蛋白質不夠會比較容易餓，掉的體重裡肌肉也會變多。每餐先放一份豆魚蛋肉。' : '蛋白質不夠，增加的體重比較少是肌肉。' });
    }
    if (cutLike && a.drinksPerWeek != null && a.drinksPerWeek >= 3) {
        out.push({ code: 'drinks', w: 55, title: `含糖飲料每週約 ${a.drinksPerWeek} 杯`,
            detail: '喝進去的熱量不太會讓人飽。換成無糖茶或無糖豆漿，是最不痛的少吃方式。' });
    }
    if (cutLike && a.snackShare != null && a.snackShare >= 0.25) {
        out.push({ code: 'snacks', w: 50, title: `點心和宵夜佔 ${r0(a.snackShare * 100)}% 熱量`,
            detail: '建議約一成。正餐蛋白質吃夠，下午和晚上比較不會餓出來。' });
    }
    if (a.strengthPerWeek != null) {
        if (goal === 'bulk' && a.strengthPerWeek < 2) out.push({ code: 'training', w: 65, title: `重訓每週 ${a.strengthPerWeek} 次`, detail: '增重的熱量要靠重訓才會長成肌肉。每週少於兩次，增加的多半是脂肪。' });
        if (goal === 'cut' && a.strengthPerWeek < 1.5) out.push({ code: 'training', w: 40, title: `重訓每週 ${a.strengthPerWeek} 次`, detail: '減脂期沒有阻力訓練，掉下來的體重裡肌肉比例會比較高。一週兩次就有差。' });
    }
    // 照計劃吃了，體重卻沒動 → 份量低估或身體適應
    const followed = a.loggedPct >= 0.7 && a.kcalDiffPct != null && Math.abs(a.kcalDiffPct) <= 0.05;
    if (followed && (ratio == null || ratio < 0.3) && verdict !== 'too_fast') {
        out.push({ code: 'stall_followed', w: 85, title: '照計劃吃了，體重卻沒動',
            detail: goal === 'bulk'
                ? '最常見是活動量比估計的大。下一期每天多 150 大卡，再看兩週。'
                : '最常見是份量估少了（醬料、油、飲料），其次是身體適應了較低的熱量。下一期每天再少 120 大卡，或先用拍照確認兩週的份量。' });
    }
    if (measureCount <= 1) {
        out.push({ code: 'measure', w: 20, title: '這 4 週只量了一次',
            detail: '單次體重會被水分、鹽分影響 ±1 kg。一週量一次（同一天、早上、空腹），趨勢才看得準。' });
    }
    if (!out.length) {
        out.push({ code: 'unclear', w: 0, title: '紀錄裡看不出明顯原因',
            detail: '吃的跟計劃差不多、也有在練。可能只是水分波動，再看 4 週；或記錄更完整一點，下次就看得出來。' });
    }
    return out.sort((x, y) => y.w - x.w).slice(0, 4);
}

function buildPraise({ goal, adherence: a, bfDelta }) {
    const out = [];
    if (a.loggedPct >= 0.7) out.push(`${a.blockDays} 天裡記了 ${a.loggedDays} 天`);
    if (a.targetProtein && a.avgProtein != null && a.avgProtein >= a.targetProtein * 0.9) out.push(`蛋白質平均 ${a.avgProtein}g，有吃到`);
    if (bfDelta != null && ((goal !== 'bulk' && bfDelta < 0) || (goal === 'bulk' && bfDelta <= 0.5))) out.push(`體脂 ${bfDelta > 0 ? '+' : ''}${bfDelta}%`);
    if (a.strengthPerWeek != null && a.strengthPerWeek >= 2) out.push(`重訓每週 ${a.strengthPerWeek} 次`);
    return out.slice(0, 3);
}

/** 接下來怎麼做：每個選項都說為什麼；primary 是建議的那一個 */
function buildOptions({ goal, verdict, adherence: a, ratio, plan, delta = 0 }) {
    const followed = a.loggedPct >= 0.7 && a.kcalDiffPct != null && Math.abs(a.kcalDiffPct) <= 0.05;
    const pace = Math.abs(num(plan.pace) || 0);
    const cont = { id: 'continue', label: '照原計劃繼續', detail: '目標和每天熱量都不變。' };
    if (verdict === 'check') return [{ id: 'remeasure', label: '重新量一次', detail: '確認數字後再看結果。', primary: true }, { ...cont, label: '數字沒錯，繼續' }];
    if (verdict === 'reached') return [{ id: 'recap', label: '看這一期結算', detail: '設定下一期的方向。', primary: true }];
    if (['achieved'].includes(verdict)) return [{ ...cont, primary: true, detail: '做得到的配速就是好配速，下一個 4 週照走。' }];
    if (verdict === 'too_fast') {
        return [{ id: 'adjust_kcal', delta: goal === 'bulk' ? -150 : 150, label: goal === 'bulk' ? '每天少吃 150 大卡' : '每天多吃 150 大卡',
            detail: goal === 'bulk' ? '增得太快，多出來的多半是脂肪。' : '掉太快容易連肌肉一起掉，也比較撐不久。', primary: true }, cont];
    }
    if (goal === 'maintain') {
        const d = verdictDelta(delta);
        return [{ id: 'adjust_kcal', delta: d, label: `每天${d > 0 ? '多' : '少'} ${Math.abs(d)} 大卡`, detail: '把體重拉回原本的位置。', primary: true }, cont];
    }
    if (followed && (ratio == null || ratio < 0.3)) {
        const d = goal === 'bulk' ? 150 : -120;
        return [{ id: 'adjust_kcal', delta: d, label: `每天${d > 0 ? '多' : '少'} ${Math.abs(d)} 大卡`, detail: '你照計劃吃了，代表估計的消耗跟實際有落差，調一點點就好。', primary: true }, cont];
    }
    const slower = pace > 0 && (goal === 'cut' ? pace > 0.25 : pace > 0.2);
    const top = buildReasonsTop(a, goal);
    return [
        { ...cont, primary: true, label: '照原計劃，先做到一件事', detail: top },
        ...(slower ? [{ id: 'slower_pace', label: '放慢配速', detail: '每天的熱量放寬一點，比較做得到；達標日會往後。' }] : []),
    ];
}
/* 維持期偏離了要往「體重的反方向」拉：重了就少吃、輕了就多吃。
   以前看的是「吃得比目標多不多」—— 沒記錄（kcalDiff=null）或吃得剛好卻變重的人
   會被建議「每天多 120」，越調越偏。體重才是結果，方向只看體重。 */
const verdictDelta = (weightDelta) => (weightDelta > 0 ? -120 : 120);
function buildReasonsTop(a, goal) {
    if (a.loggedPct < 0.5) return '下個 4 週先做到「每天記錄」，就看得出問題在哪。';
    if (goal !== 'bulk' && a.kcalDiffPct != null && a.kcalDiffPct >= 0.08) return `先把每天的熱量拉回 ${a.targetKcal} 大卡附近。`;
    if (goal === 'bulk' && a.kcalDiffPct != null && a.kcalDiffPct <= -0.08) return `先把每天吃到 ${a.targetKcal} 大卡。`;
    return '下面的建議飲食挑一兩樣換進每天的菜單。';
}

/* ── 套用選項到計劃 ───────────────────────────────────────────────── */
export const MIN_CARBS_G = 30;
/** 每天熱量的安全下限：1200 大卡，知道基礎代謝就不低於基礎代謝 */
export function safeKcalFloor(plan) {
    return Math.max(1200, r0(num(plan?.bmr) || 0));
}

/**
 * 把計劃的每天熱量改成 kcal：蛋白質、脂肪是錨定的，碳水補滿差額。
 * 回傳的 adjustedIntake 一定等於 P×4 + C×4 + F×9（整數克數，差額最多 2 大卡），
 * 畫面上的熱量才不會跟三大營養素對不起來。
 * 碳水會掉到 30 g 以下、或熱量低於安全下限 → 回傳 null（這個調整不該做），
 * 由呼叫端說明原因，而不是悄悄夾住數字、存一份加總對不上的計劃。
 */
export function rebalanceToKcal(plan, kcal) {
    const target = r0(num(kcal) || 0);
    if (!(target > 0)) return null;
    const P = r0(num(plan?.newProtein) || 0);
    const F = r0(num(plan?.newFat) || 0);
    const C = r0((target - P * 4 - F * 9) / 4);
    if (C < MIN_CARBS_G) return null;
    const total = P * 4 + C * 4 + F * 9;
    return { adjustedIntake: total, newProtein: P, newCarbs: C, newFat: F };
}

/** 每天熱量 ± delta：差額由碳水吸收（蛋白質、脂肪是錨定的）。做不到（見上）→ null */
export function applyKcalDelta(plan, delta, reason = '') {
    const kcal = num(plan.adjustedIntake) || num(plan.recommendedIntake);
    if (!kcal) return null;
    const want = r0(kcal + delta);
    // 往下調才擋下限：本來就低於下限的計劃，往上加是在變安全，不擋
    if (delta < 0 && want < safeKcalFloor(plan)) return null;
    const macros = rebalanceToKcal(plan, want);
    if (!macros) return null;
    return {
        ...plan, ...macros,
        kcalAdjustments: [...(plan.kcalAdjustments || []), { at: Date.now(), delta: macros.adjustedIntake - kcal, reason }],
    };
}

/** 放慢配速：照計劃精靈的檔位往下一檔，熱量跟著放寬。沒有更慢的檔或熱量做不到 → null */
export const PACE_STEPS = { cut: [0.25, 0.5, 0.8], bulk: [0.2, 0.35, 0.6], recomp: [0.1, 0.2, 0.35] };
export function applySlowerPace(plan) {
    const steps = PACE_STEPS[plan.goalType] || PACE_STEPS.cut;
    const pace = Math.abs(num(plan.pace) || 0);
    const slower = [...steps].reverse().find((v) => v < pace - 1e-6);
    if (!slower) return null;
    const dailyDiff = ((pace - slower) * KCAL_PER_KG) / 7;
    const delta = plan.goalType === 'bulk' ? -dailyDiff : dailyDiff;
    return applyKcalDelta({ ...plan, pace: slower, weeklyChange: plan.goalType === 'bulk' ? slower : -slower }, delta, `配速 ${pace} → ${slower} kg/週`);
}

export default evaluateCheckpoint;
