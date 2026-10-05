/**
 * gymMemory.js — 健身房記憶：你去過哪些健身房、每間有什麼、沒有什麼
 * ══════════════════════════════════════════════════════════════════════
 * 兩層資料，分得很清楚：
 *
 *   ① 紀錄（每一間都記，免費）
 *      名稱、地區、座標、去過幾次、熟練度、每個部位常用哪幾台器材。
 *      「常用」只從真的做完的組數來 —— 沒練過就是沒有，不猜。
 *
 *   ② 客製條件（最多 GYM_CUSTOM_SLOTS 間）
 *      這間「沒有」哪幾台、沒有時改做什麼。
 *      依健身房排課（adaptPlanForGym）只讀這一層，是會員功能；
 *      記下來這件事本身免費 —— 資料永遠是使用者的。
 *
 * 器材的單位是「那一台」（utils/gymStations），不是器材大類。
 * 做完組數的器材自動算「有」；「沒有」只能由使用者親口說，不從跳過推論。
 *
 * 這支檔案只有純函式＋讀寫一個 localStorage key，node 驗證腳本直接 import。
 * ══════════════════════════════════════════════════════════════════════
 */
import { uStorage } from './userStorage';
import { stationOf, stationZh } from './gymStations';
import { getSubstitutes } from './exerciseSubstitution';
import { MUSCLE_ZH, defOfExercise } from './exerciseTaxonomy';
import { toZhExerciseName, toEnExerciseName } from './exerciseNameZh';

export const GYM_CUSTOM_SLOTS = 3;          // 客製條件最多記幾間
export const GYM_LOG_KEEP = 20;             // 每間保留最近幾場訓練
export const GYM_MATCH_RADIUS_M = 150;      // 多近算「同一間」
export const GYM_MAX_RECORDED = 30;         // 紀錄最多保留幾間（超過丟最久沒去的非客製）
export const GYM_IGNORE_RADIUS_M = 120;     // 「這裡不是健身房」記在哪、多近不再問
const KEY = 'gymMemory';

/** 熟練度：只看在這間練了幾次。門檻全專案只有這一份。 */
export const GYM_PROFICIENCY = [
    { level: 1, min: 1, label: '初訪' },
    { level: 2, min: 2, label: '熟悉中' },
    { level: 3, min: 5, label: '常客' },
    { level: 4, min: 15, label: '主場' },
];

const emptyMemory = () => ({ v: 1, gyms: {}, custom: [], ignored: [], lastGymId: null });
const clone = (x) => JSON.parse(JSON.stringify(x));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* ── 讀寫 ─────────────────────────────────────────────────────────── */
export function loadGymMemory(userId) {
    try {
        const raw = uStorage(userId).get(KEY, null);
        if (!raw || typeof raw !== 'object' || !raw.gyms) return emptyMemory();
        return { ...emptyMemory(), ...raw, custom: (raw.custom || []).filter((id) => raw.gyms[id]).slice(0, GYM_CUSTOM_SLOTS) };
    } catch { return emptyMemory(); }
}

export function saveGymMemory(userId, mem) {
    try { uStorage(userId).set(KEY, mem); } catch { /* 容量滿就算了，下次再存 */ }
    // ☁️ 換機不遺失（best-effort；動態載入，讓純邏輯測試不必帶網路層）
    import('./cloudSync').then(({ pushBlob }) => pushBlob('gym_memory', mem)).catch(() => {});
    try { window.dispatchEvent(new CustomEvent('drvn:gym-memory-changed')); } catch { /* node */ }
    return mem;
}

/* ── 位置 ─────────────────────────────────────────────────────────── */
export function distanceM(a, b) {
    const la1 = num(a?.lat), lo1 = num(a?.lng), la2 = num(b?.lat), lo2 = num(b?.lng);
    if ([la1, lo1, la2, lo2].some((v) => v === null)) return Infinity;
    const R = 6371000, rad = Math.PI / 180;
    const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** 最近、而且在 GYM_MATCH_RADIUS_M 內的那一間；沒有回 null */
export function findGymNear(mem, coords) {
    let best = null, bestD = Infinity;
    Object.values(mem?.gyms || {}).forEach((g) => {
        const d = distanceM(g, coords);
        if (d < bestD) { best = g; bestD = d; }
    });
    return bestD <= GYM_MATCH_RADIUS_M ? best : null;
}

/** 使用者說過「這裡不是健身房」的地方 */
export function isIgnoredPlace(mem, coords) {
    return (mem?.ignored || []).some((p) => distanceM(p, coords) <= GYM_IGNORE_RADIUS_M);
}
export function ignorePlace(mem, coords) {
    const next = clone(mem);
    if (num(coords?.lat) === null) return next;
    next.ignored = [...(next.ignored || []), { lat: coords.lat, lng: coords.lng }].slice(-10);
    return next;
}

/* ── 建立／改名 ───────────────────────────────────────────────────── */
export function createGym(mem, { name, poiName = null, area = null, lat = null, lng = null, at = Date.now() } = {}) {
    const next = clone(mem);
    const id = `g_${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const clean = String(name || poiName || area || '').trim().slice(0, 24) || '我的健身房';
    next.gyms[id] = {
        id, name: clean, poiName, area, lat: num(lat), lng: num(lng),
        createdAt: at, lastAt: null, sessions: 0,
        stations: {},        // stationId → { sets, sessions, lastAt }
        usage: {},           // 部位 → { stationId → 組數 }（常用器材依部位分）
        missing: {},         // stationId → at（只有客製的健身房才會有）
        have: {},            // stationId → at（使用者說「有，只是沒練」—— 下次不再問）
        swaps: {},           // 動作名 → 這間改做的動作名
    };
    // 紀錄上限：丟最久沒去、又不是客製的那一間
    const ids = Object.keys(next.gyms);
    if (ids.length > GYM_MAX_RECORDED) {
        const victim = ids.filter((x) => x !== id && !next.custom.includes(x))
            .sort((a, b) => (next.gyms[a].lastAt || 0) - (next.gyms[b].lastAt || 0))[0];
        if (victim) {
            delete next.gyms[victim];
            if (next.lastGymId === victim) next.lastGymId = null;
        }
    }
    return { mem: next, gym: next.gyms[id] };
}

export function renameGym(mem, gymId, name) {
    const next = clone(mem);
    const clean = String(name || '').trim().slice(0, 24);
    if (next.gyms[gymId] && clean) next.gyms[gymId].name = clean;
    return next;
}

export function forgetGym(mem, gymId) {
    const next = clone(mem);
    delete next.gyms[gymId];
    next.custom = next.custom.filter((x) => x !== gymId);
    if (next.lastGymId === gymId) next.lastGymId = null;
    return next;
}

/* ── 熟練度 ───────────────────────────────────────────────────────── */
export function proficiencyOf(gym) {
    const n = gym?.sessions || 0;
    if (n <= 0) return null;
    let cur = GYM_PROFICIENCY[0];
    GYM_PROFICIENCY.forEach((p) => { if (n >= p.min) cur = p; });
    const nextStep = GYM_PROFICIENCY.find((p) => p.min > n) || null;
    return { ...cur, sessions: n, toNext: nextStep ? nextStep.min - n : 0, nextLabel: nextStep?.label || null };
}

/* ── 記一次訓練 ───────────────────────────────────────────────────── */
/**
 * 把一場訓練記進這間健身房：次數＋1、做完組數的器材算「常用」也算「有」。
 * 做過的器材如果之前被標成沒有 → 拿掉（你都在這裡用過了）。
 */
export function recordGymSession(mem, gymId, exercises = [], at = Date.now(), meta = {}) {
    const next = clone(mem);
    const g = next.gyms[gymId];
    if (!g) return next;
    // 同一場只記一次（結束時直接記、或問完問題卡才記 —— 兩條路都可能走到）
    if (meta.recordId && (g.log || []).some((l) => l.id === meta.recordId)) return next;
    g.sessions = (g.sessions || 0) + 1;
    g.lastAt = at;
    const touched = new Set();
    let totalSets = 0, volume = 0, exCount = 0;
    (exercises || []).forEach((ex) => {
        const doneSets = (ex?.sets || []).filter((s) => s && s.completed !== false && Number(s.reps) > 0);
        const done = doneSets.length;
        if (!done) return;
        totalSets += done; exCount += 1;
        doneSets.forEach((s) => { volume += (Number(s.weight) || 0) * (Number(s.reps) || 0); });
        const st = stationOfEx(ex);
        if (!st) return;
        const cur = g.stations[st.id] || { sets: 0, sessions: 0, lastAt: null };
        cur.sets += done;
        if (!touched.has(st.id)) { cur.sessions += 1; touched.add(st.id); }
        cur.lastAt = at;
        g.stations[st.id] = cur;
        if (st.macro) {
            g.usage = g.usage || {};
            const m = (g.usage[st.macro] = g.usage[st.macro] || {});
            m[st.id] = (m[st.id] || 0) + done;
        }
        if (g.missing[st.id]) delete g.missing[st.id];
    });
    // 這間的訓練紀錄（最近 GYM_LOG_KEEP 場）：哪天、練了什麼、幾組、總量
    g.log = [...(g.log || []), {
        id: meta.recordId || null, at,
        focus: meta.focus || null,
        exercises: exCount, sets: totalSets, volume: Math.round(volume),
        swapped: Number(meta.swapped) || 0,
    }].slice(-GYM_LOG_KEEP);
    next.lastGymId = gymId;
    return next;
}

/** 這間最近的訓練（新到舊） */
export const gymLog = (gym) => [...(gym?.log || [])].sort((a, b) => (b.at || 0) - (a.at || 0));

/** 每個部位最常用的器材（依在這間做完的組數），畫面上的「常用器材」就是這個 */
export function stationsByMacro(gym, perMacro = 3) {
    const ORDER = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
    const usage = gym?.usage || {};
    return ORDER.filter((m) => usage[m] && Object.keys(usage[m]).length).map((m) => ({
        macro: m, zh: MUSCLE_ZH[m] || m,
        stations: Object.entries(usage[m])
            .map(([id, sets]) => ({ id, zh: stationZh(id) || id, sets }))
            .sort((a, b) => b.sets - a.sets).slice(0, perMacro),
    }));
}

/* ── 客製條件（最多三間）─────────────────────────────────────────── */
export const isCustomGym = (mem, gymId) => (mem?.custom || []).includes(gymId);
export const customSlotsFull = (mem) => (mem?.custom || []).length >= GYM_CUSTOM_SLOTS;

/**
 * 把這間設成客製。名額滿了要指定換掉哪一間（replaceId），否則回 needsReplace。
 * 被換掉的那間：紀錄留著，只清掉「沒有的器材」與替換。
 */
export function makeCustomGym(mem, gymId, replaceId = null) {
    if (!mem?.gyms?.[gymId]) return { ok: false, mem };
    if (isCustomGym(mem, gymId)) return { ok: true, mem };
    const next = clone(mem);
    if (customSlotsFull(next)) {
        if (!replaceId || !next.custom.includes(replaceId)) return { ok: false, needsReplace: true, mem };
        next.custom = next.custom.filter((x) => x !== replaceId);
        if (next.gyms[replaceId]) { next.gyms[replaceId].missing = {}; next.gyms[replaceId].swaps = {}; }
    }
    next.custom = [...next.custom, gymId];
    return { ok: true, mem: next };
}

export function removeCustomGym(mem, gymId) {
    const next = clone(mem);
    next.custom = next.custom.filter((x) => x !== gymId);
    if (next.gyms[gymId]) { next.gyms[gymId].missing = {}; next.gyms[gymId].swaps = {}; }
    return next;
}

/** 這間沒有這台（非客製且名額滿 → needsSlot，由畫面問要換掉哪一間） */
export function markMissing(mem, gymId, stationId, at = Date.now()) {
    if (!mem?.gyms?.[gymId] || !stationId) return { ok: false, mem };
    let base = mem;
    if (!isCustomGym(base, gymId)) {
        const r = makeCustomGym(base, gymId);
        if (!r.ok) return { ok: false, needsSlot: true, mem };
        base = r.mem;
    }
    const next = clone(base);
    next.gyms[gymId].missing[stationId] = at;
    if (next.gyms[gymId].have?.[stationId]) delete next.gyms[gymId].have[stationId];
    return { ok: true, mem: next };
}

export function markAvailable(mem, gymId, stationId, at = Date.now()) {
    const next = clone(mem);
    const g = next.gyms[gymId];
    if (!g || !stationId) return next;
    if (g.missing?.[stationId]) delete g.missing[stationId];
    g.have = { ...(g.have || {}), [stationId]: at };
    return next;
}

export function setGymSwap(mem, gymId, fromName, toName) {
    const next = clone(mem);
    const g = next.gyms[gymId];
    if (g && isCustomGym(next, gymId) && fromName && toName) g.swaps[fromName] = toName;
    return next;
}

/** 'missing' | 'available' | 'unknown' */
export function stationStatus(gym, stationId) {
    if (!gym || !stationId) return 'unknown';
    if (gym.missing?.[stationId]) return 'missing';
    if ((gym.stations?.[stationId]?.sets || 0) > 0 || gym.have?.[stationId]) return 'available';
    return 'unknown';
}

/* ── 訓練結束時要問的：跳過的動作 ─────────────────────────────────── */
/**
 * 計劃裡有、但一組都沒做完的動作中，器材在這間「還不知道有沒有」的那些。
 * 同一台器材只問一次；不需要器材的動作（徒手）不問。
 */
export function skippedToAsk(gym, plannedNames = [], doneExercises = []) {
    const done = new Set((doneExercises || [])
        .filter((ex) => (ex?.sets || []).some((s) => s && s.completed !== false && Number(s.reps) > 0))
        .map((ex) => ex.name));
    const doneStations = new Set([...done].map((n) => stationOf(n)?.id).filter(Boolean));
    const seen = new Set();
    const out = [];
    (plannedNames || []).forEach((name) => {
        if (!name || done.has(name)) return;
        const st = stationOf(name);
        if (!st || seen.has(st.id) || doneStations.has(st.id)) return;
        if (gym && stationStatus(gym, st.id) !== 'unknown') return;
        seen.add(st.id);
        out.push({ name, station: st });
    });
    return out;
}

/* ── 依健身房換動作（會員：依健身房排課）──────────────────────────── */
/** getSubstitutes 用的健身房條件：沒有的器材排除、這間常用的往前排 */
export function gymProfile(gym) {
    const used = {};   // '部位:器材' → 在這間做完的組數
    Object.entries(gym?.usage || {}).forEach(([macro, m]) => {
        Object.entries(m || {}).forEach(([id, n]) => { used[`${macro}:${id}`] = n || 0; });
    });
    return { missing: new Set(Object.keys(gym?.missing || {})), used };
}

/** 在這間可以改做什麼（前 limit 個） */
export function substitutesAtGym(exerciseName, gym, userId, limit = 3) {
    return getSubstitutes(exerciseName, { userId, limit, gym: gymProfile(gym) });
}

/**
 * 一串動作套上這間健身房：器材沒有的，換成使用者指定的替代，否則換成最適合的替代。
 * 組數、次數、休息保留原本的。換不到（沒有可替代的）就留著，不硬塞。
 * @returns {{ exercises:Array, changes:Array<{from,to,station}> }}
 */
const HAS_CJK = /[㐀-鿿]/;
/** 同一個動作的中英文名都對到同一個 key（比對「已經在菜單上」與使用者指定的替代用） */
const exKey = (name) => defOfExercise(name)?.name || toEnExerciseName(String(name || '').trim()) || String(name || '');
/** 課表上的一個動作 → 動作庫的 key（中文名對不到時用 nameEn） */
const exKeyOf = (ex) => defOfExercise(ex?.name)?.name || defOfExercise(ex?.nameEn)?.name || exKey(ex?.name);
/** 動作用哪一台（中文名對不到時用 nameEn） */
export const stationOfEx = (ex) => stationOf(ex?.name) || (ex?.nameEn ? stationOf(ex.nameEn) : null);

/** 使用者指定的替代：記的時候可能是中文或英文名，兩種都查 */
function swapFor(gym, name) {
    const s = gym?.swaps || {};
    return s[name] || s[toEnExerciseName(name)] || s[toZhExerciseName(name)] || null;
}

/** 換上去的動作：名稱沿用課表原本的語言（中文課表換上中文名），器材／部位跟著新動作 */
function swappedExercise(ex, toName) {
    const def = defOfExercise(toName);
    const en = def?.name || toEnExerciseName(toName) || toName;
    const zhIn = HAS_CJK.test(String(ex.name || ''));
    const orig = ex.gymOrig || { name: ex.name, nameEn: ex.nameEn ?? null, eq: ex.eq ?? null, muscle: ex.muscle ?? null };
    const out = { ...ex, name: zhIn ? toZhExerciseName(en) : en, gymSwappedFrom: orig.name, gymOrig: orig };
    if (zhIn || ex.nameEn) out.nameEn = en;
    if (def?.eq) out.eq = def.eq;
    if (def?.muscle && ex.muscle) out.muscle = def.muscle;
    return out;
}

/**
 * 把先前照某間健身房換掉的動作換回課表原本的樣子（換健身房時從原課表重新套，
 * 不會在「A 館換過的菜單」上再換一次，切回原本的健身房也能完整還原）。
 */
export function restorePlannedExercises(exercises = []) {
    return (exercises || []).map((ex) => {
        if (!ex?.gymOrig) return ex;
        const { gymOrig, gymSwappedFrom, ...rest } = ex;   // eslint-disable-line no-unused-vars
        const out = { ...rest, name: gymOrig.name };
        ['nameEn', 'eq', 'muscle'].forEach((k) => {
            if (gymOrig[k] === null || gymOrig[k] === undefined) delete out[k];
            else out[k] = gymOrig[k];
        });
        return out;
    });
}

export function adaptExercisesForGym(exercises = [], gym, userId) {
    const changes = [];
    if (!gym || !Object.keys(gym.missing || {}).length) return { exercises, changes };
    const missing = new Set(Object.keys(gym.missing));
    const taken = new Set((exercises || []).map(exKeyOf));
    const out = (exercises || []).map((ex) => {
        if (!ex || ex.isWarmup) return ex;
        const st = stationOfEx(ex);
        if (!st || !missing.has(st.id)) return ex;
        const lookupName = defOfExercise(ex.name) ? ex.name : (ex.nameEn || ex.name);
        let to = swapFor(gym, ex.name) || swapFor(gym, ex.nameEn) || swapFor(gym, ex.gymSwappedFrom);
        if (to && (missing.has(stationOf(to)?.id) || (taken.has(exKey(to)) && exKey(to) !== exKeyOf(ex)))) to = null;   // 指定的替代這間也沒有／已經在菜單上
        if (!to) {
            const cands = substitutesAtGym(lookupName, gym, userId, 8);
            to = cands.find((c) => !taken.has(exKey(c.name)))?.name || null;   // 不換成菜單上已經有的動作（不然同一個動作做兩次）
        }
        if (!to) return ex;                                                    // 換不到就留著，訓練時跳過會再問
        taken.add(exKey(to));
        const next = swappedExercise(ex, to);
        changes.push({ from: ex.name, to: next.name, station: st.zh });
        return next;
    });
    return { exercises: out, changes };
}

/**
 * 預覽面板換健身房用：先還原成課表原本的動作，再套這間。
 * gym 為 null → 只還原。回傳的 swaps 是「相對原課表」換了哪些（畫面上列出來的就是這個）。
 */
export function adaptDayForGym(exercises = [], gym, userId) {
    const base = restorePlannedExercises(exercises);
    const r = gym ? adaptExercisesForGym(base, gym, userId) : { exercises: base, changes: [] };
    return { exercises: r.exercises, swaps: r.changes };
}

/** 一份菜單裡目前照健身房換過的動作（相對原課表） */
export const swappedInMenu = (exercises = []) => (exercises || [])
    .filter((ex) => ex?.gymOrig)
    .map((ex) => ({ from: ex.gymOrig.name, to: ex.name, station: stationOfEx(ex.gymOrig)?.zh || '' }));

/**
 * 開始前選健身房的清單：客製的（最多三間）在前，其餘依最近去的時間，總共最多 limit 間。
 */
export function gymChoiceList(mem, limit = 8) {
    const custom = customGyms(mem);
    const ids = new Set(custom.map((g) => g.id));
    const rest = gymsByRecent(mem).filter((g) => !ids.has(g.id));
    return [
        ...custom.map((g) => ({ gym: g, custom: true, missingCount: Object.keys(g.missing || {}).length })),
        ...rest.slice(0, Math.max(0, limit - custom.length)).map((g) => ({ gym: g, custom: false, missingCount: 0 })),
    ];
}

/** 整份計劃（weeks → days → exercises）套上這間健身房 */
export function adaptPlanForGym(plan, gym, userId) {
    if (!plan || !gym) return { plan, changes: [] };
    const all = [];
    const seen = new Set();
    const mapDay = (day) => {
        if (!Array.isArray(day?.exercises)) return day;
        const r = adaptExercisesForGym(day.exercises, gym, userId);
        r.changes.forEach((c) => { const k = `${c.from}>${c.to}`; if (!seen.has(k)) { seen.add(k); all.push(c); } });
        return { ...day, exercises: r.exercises };
    };
    const next = { ...plan };
    if (Array.isArray(plan.weeks)) next.weeks = plan.weeks.map((w) => ({ ...w, days: (w.days || []).map(mapDay) }));
    if (Array.isArray(plan.days)) next.days = plan.days.map(mapDay);
    if (Array.isArray(plan.exercises)) {
        const r = adaptExercisesForGym(plan.exercises, gym, userId);
        next.exercises = r.exercises;
        r.changes.forEach((c) => { const k = `${c.from}>${c.to}`; if (!seen.has(k)) { seen.add(k); all.push(c); } });
    }
    return { plan: next, changes: all };
}

/* ── 換季用：課表的「主場」───────────────────────────────────────────
   換季改的是課表本身（全部健身房共用的那一份），不是每間各一份：
   課表照主場排，到別間練時再由訓練頁臨時換（adaptDayForGym）。
   主場 = 排課時指定的那間（plan.gymId，還記著器材才算）
        → 否則這一季在哪間練最多次 → 否則上次去的那間。 */
export function primaryGymFor(mem, { planGymId = null, sinceMs = 0 } = {}) {
    if (!mem?.gyms) return null;
    if (planGymId && mem.gyms[planGymId]) return mem.gyms[planGymId];
    let best = null, bestN = 0, bestLast = 0;
    Object.values(mem.gyms).forEach((g) => {
        const inSeason = (g.log || []).filter((l) => (l.at || 0) >= sinceMs);
        const n = inSeason.length;
        const last = Math.max(0, ...inSeason.map((l) => l.at || 0));
        if (n > bestN || (n === bestN && n > 0 && last > bestLast)) { best = g; bestN = n; bestLast = last; }
    });
    return best || (mem.lastGymId ? mem.gyms[mem.lastGymId] || null : null);
}

/** 這間沒有的器材 → 換動作時不推（recommendAlternatives 的 isBlocked）；沒記缺什麼就回 null */
export function gymBlocker(gym) {
    const miss = new Set(Object.keys(gym?.missing || {}));
    if (!miss.size) return null;
    return (ex) => { const st = stationOfEx(ex); return !!(st && miss.has(st.id)); };
}

/** 換季分析用：某一場所在的那間（現在）是不是被標成沒有這個動作的器材 */
export function gymMissingFn(mem) {
    return (gymId, ex) => {
        const g = mem?.gyms?.[gymId];
        const st = stationOfEx(ex) || stationOfEx(ex?.gymOrig);
        return !!(g && st && g.missing?.[st.id]);
    };
}

/** 客製的健身房（依名額順序），計劃頁的切換列用 */
export const customGyms = (mem) => (mem?.custom || []).map((id) => mem.gyms[id]).filter(Boolean);

/** 依最近一次去的時間排序的全部健身房 */
export const gymsByRecent = (mem) => Object.values(mem?.gyms || {})
    .sort((a, b) => (b.lastAt || b.createdAt || 0) - (a.lastAt || a.createdAt || 0));

export default {
    GYM_CUSTOM_SLOTS, GYM_PROFICIENCY, loadGymMemory, saveGymMemory, findGymNear, createGym, renameGym,
    proficiencyOf, recordGymSession, stationsByMacro, makeCustomGym, markMissing, skippedToAsk,
    adaptExercisesForGym, adaptPlanForGym,
};
