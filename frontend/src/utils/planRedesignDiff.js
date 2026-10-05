/**
 * planRedesignDiff — 季末「換部位，重排一份」：舊計劃 vs 新計劃，到底改了什麼
 * ─────────────────────────────────────────────────────────────
 * 換季原地套用用的是 diffSeasonPlans（同一份課表逐格比對）。
 * 重排是整份換掉，分化、天數、動作順序都可能不同，逐格比對會變成一堆假的「換成」，
 * 所以這裡改成整份比：天數／分化／每週組數／常用次數／各部位每週組數／加進來跟拿掉的動作。
 *
 * 舊計劃要在離開收官頁「之前」存一份快照（產生器成功啟用後會把 currentPlan 蓋掉）。
 * 快照綁 cycleDoneKey（哪一份計劃的第幾季）＋ 時效：
 *   · 中途返回 / 生成失敗 → 快照留著沒用到，下一次重排會覆蓋，過期自動作廢
 *   · App 重新整理 → 快照還在，但只有同一個 cycleDoneKey 的那次重排拿得到
 *   · 拿過一次就刪掉，不會在之後別的生成又冒出一份舊的摘要
 * 純函式＋可注入 storage，scripts/verify_season_redesign_roundtrip.mjs 直接測。
 */

export const REDESIGN_SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000;   // 半天內沒完成重排就作廢
export const redesignSnapshotKey = (userId) => `season_redesign_snapshot_${userId || 'guest'}`;

const isDeload = (w) => /deload|taper|減量/i.test(String(w?.phase || ''));
const isMain = (ex) => ex && !ex.isWarmup && ex.tier !== 4;

/* 部位分組：跟 seasonTransition.TAG_MUSCLES 同一套（這裡不 import，避免把整個引擎拉進來） */
const TAG_MUSCLES = {
    chest: ['chest'], back: ['back', 'lats', 'traps'], legs: ['quads', 'hamstrings', 'glutes', 'calves', 'legs'],
    shoulders: ['shoulders'], arms: ['biceps', 'triceps', 'arms'], core: ['core', 'abs'],
};
const TAG_ZH = { chest: '胸', back: '背', legs: '腿', shoulders: '肩', arms: '手臂', core: '核心' };
const MUSCLE_TO_TAG = Object.fromEntries(Object.entries(TAG_MUSCLES).flatMap(([t, ms]) => ms.map((m) => [m, t])));
const tagOf = (ex) => MUSCLE_TO_TAG[String(ex?.muscle || '').toLowerCase()] || null;

/** 只留比對需要的欄位，存進 localStorage 不會太大 */
export function compactPlan(plan) {
    if (!plan || !Array.isArray(plan.weeks)) return null;
    return {
        plan_id: plan.plan_id || plan.id || null,
        split_label: plan.split_label || null,
        days_per_week: plan.days_per_week || null,
        training_style: plan.training_style || null,
        weeks: plan.weeks.map((w) => ({
            phase: w?.phase || null,
            days: (w?.days || []).map((d) => ({
                exercises: (d?.exercises || []).map((e) => ({
                    name: e?.name, muscle: e?.muscle || null, sets: e?.sets ?? null, reps: e?.reps ?? null,
                    isWarmup: !!e?.isWarmup, tier: e?.tier ?? null,
                })),
            })),
        })),
    };
}

/** 收官頁按「去換部位」之前：存舊計劃快照 */
export function saveRedesignSnapshot(storage, userId, { plan, cycleDoneKey, season, history = null, now = Date.now() } = {}) {
    try {
        const compact = compactPlan(plan);
        if (!compact || !cycleDoneKey) return false;
        /* history：換季歷史（seasonTransition.redesignSeasonHistory）—— 新計劃接著記，下一季的平台期／訓練量比較才接得上 */
        storage.setItem(redesignSnapshotKey(userId), JSON.stringify({ v: 1, at: now, cycleDoneKey, season: Number(season) || null, plan: compact,
            ...(Array.isArray(history) ? { history } : {}) }));
        return true;
    } catch { return false; }
}

export function clearRedesignSnapshot(storage, userId) {
    try { storage.removeItem(redesignSnapshotKey(userId)); } catch { /* */ }
}

/** 讀快照（不刪）：對不上 cycleDoneKey、過期、壞掉 → null，並順手清掉壞的／過期的 */
export function readRedesignSnapshot(storage, userId, { cycleDoneKey, now = Date.now() } = {}) {
    let raw = null, snap = null;
    try { raw = storage.getItem(redesignSnapshotKey(userId)); } catch { raw = null; }
    if (!raw) return null;
    try { snap = JSON.parse(raw); } catch { snap = null; }
    if (!snap || !snap.plan || !Number.isFinite(snap.at)) { clearRedesignSnapshot(storage, userId); return null; }
    if (now - snap.at > REDESIGN_SNAPSHOT_TTL_MS || now < snap.at - 60000) { clearRedesignSnapshot(storage, userId); return null; }
    if (!cycleDoneKey || snap.cycleDoneKey !== cycleDoneKey) return null;   // 別一次重排的，不動它
    return snap;
}

/** 新計劃啟用成功才呼叫：拿一次就刪 */
export function takeRedesignSnapshot(storage, userId, opts = {}) {
    const snap = readRedesignSnapshot(storage, userId, opts);
    if (snap) clearRedesignSnapshot(storage, userId);
    return snap;
}

/* ── 比對 ─────────────────────────────────────────────── */
const firstTrainWeek = (plan) => (plan?.weeks || []).find((w) => !isDeload(w) && (w.days || []).some((d) => (d.exercises || []).some(isMain))) || plan?.weeks?.[0] || null;
const trainDays = (w) => (w?.days || []).filter((d) => (d.exercises || []).some(isMain)).length;
const weekSets = (w) => (w?.days || []).flatMap((d) => d.exercises || []).filter(isMain).reduce((n, e) => n + (parseInt(e.sets, 10) || 0), 0);
const tagSets = (w) => (w?.days || []).flatMap((d) => d.exercises || []).filter(isMain).reduce((m, e) => {
    const t = tagOf(e);
    if (t) m[t] = (m[t] || 0) + (parseInt(e.sets, 10) || 0);
    return m;
}, {});
const commonReps = (w) => {
    const c = {};
    (w?.days || []).flatMap((d) => d.exercises || []).filter(isMain).forEach((e) => {
        const r = String(e.reps ?? '').trim();
        if (r) c[r] = (c[r] || 0) + 1;
    });
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
};
const exerciseNames = (plan) => {
    const out = [];
    (plan?.weeks || []).forEach((w) => (w.days || []).forEach((d) => (d.exercises || []).forEach((e) => {
        if (isMain(e) && e.name && !out.includes(e.name)) out.push(e.name);
    })));
    return out;
};
// 「上肢強化分化 (PPL + Upper)」→「上肢強化分化」：畫面全中文
const splitText = (s) => (s ? String(s).replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim() || null : null);

/**
 * 整份比對。回傳可以直接存進 plan._seasonApplied.redesign 的純資料：
 *   overview：[{ label, from, to }]   天數／分化／每週組數／次數（有變才列）
 *   muscles： [{ tag, label, from, to }] 每週組數變化 ≥ 3 組的部位（多練在前），最多 4 個
 *   added / removed：動作名稱（已轉中文），整份順序
 *   kept：沿用的動作數
 */
export function summarizeRedesign(oldPlan, newPlan, { nameOf = (n) => n } = {}) {
    if (!oldPlan?.weeks || !newPlan?.weeks) return null;
    const ow = firstTrainWeek(oldPlan), nw = firstTrainWeek(newPlan);
    const overview = [];
    const od = trainDays(ow), nd = trainDays(nw);
    if (od && nd && od !== nd) overview.push({ label: '每週', from: `${od} 天`, to: `${nd} 天` });
    const os = splitText(oldPlan.split_label), ns = splitText(newPlan.split_label);
    if (os && ns && os !== ns) overview.push({ label: '分化', from: os, to: ns });
    const osets = weekSets(ow), nsets = weekSets(nw);
    if (osets && nsets && osets !== nsets) overview.push({ label: '組數', from: `每週 ${osets} 組`, to: `每週 ${nsets} 組` });
    const or = commonReps(ow), nr = commonReps(nw);
    if (or && nr && or !== nr) overview.push({ label: '次數', from: `${or} 下`, to: `${nr} 下` });

    const ot = tagSets(ow), nt = tagSets(nw);
    const muscles = Object.keys(TAG_ZH)
        .map((t) => ({ tag: t, label: TAG_ZH[t], from: ot[t] || 0, to: nt[t] || 0 }))
        .filter((m) => Math.abs(m.to - m.from) >= 3)
        .sort((a, b) => (b.to - b.from) - (a.to - a.from))
        .slice(0, 4);

    const oldNames = exerciseNames(oldPlan), newNames = exerciseNames(newPlan);
    const oldZh = new Set(oldNames.map(nameOf)), newZh = new Set(newNames.map(nameOf));
    const added = [...newZh].filter((n) => !oldZh.has(n));
    const removed = [...oldZh].filter((n) => !newZh.has(n));
    const kept = [...newZh].filter((n) => oldZh.has(n)).length;

    return { overview, muscles, added, removed, kept };
}

/** 有沒有任何改動（整份一模一樣 → 畫面說「課表沒有變」，不編造） */
export const redesignChangeCount = (s) => (s ? s.overview.length + s.muscles.length + s.added.length + s.removed.length : 0);

/** 名單太長：前 n 個 ＋「還有 N 個」 */
export function clipNames(names = [], n = 3) {
    const shown = names.slice(0, n);
    const rest = Math.max(0, names.length - shown.length);
    return { shown, rest, text: shown.join('、') + (rest ? `，還有 ${rest} 個` : '') };
}

/** 一句話摘要（頁首小卡用）：「每週 3→4 天、腿 多練、換了 5 個動作」 */
export function redesignHeadline(s) {
    if (!s) return '';
    const bits = [];
    const days = s.overview.find((o) => o.label === '每週');
    if (days) bits.push(`每週 ${days.from.replace(' 天', '')}→${days.to}`);
    const up = s.muscles.filter((m) => m.to > m.from).map((m) => m.label);
    if (up.length) bits.push(`${up.slice(0, 2).join('、')}多練`);
    const swaps = Math.max(s.added.length, s.removed.length);
    if (swaps) bits.push(`換了 ${swaps} 個動作`);
    return bits.join('、') || '課表沒有變';
}
