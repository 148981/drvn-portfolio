/**
 * seasonTransition.js —— 換季（下一個 4 週）要怎麼改課表：單一真相源
 * ════════════════════════════════════════════════════════════════
 * 季末收官畫面「預告會改什麼」跟「按確認真的改了什麼」都呼叫這一支 ——
 * 預告與執行同源（介面標準 §8），不會出現畫面說 A、實際做 B。
 *
 * 三種改法：
 *   intensity  依 RPE 升／降一級強度（全部 4 週一致；減量週不動）
 *   progress   複合動作各加 1 組（上限 5 組；減量週不動）
 *   keep       照原本的課表，從第 1 週重新開始
 *
 * ⚠️ 修掉的兩個長週期 bug：
 *   ① 以前判斷複合動作看 ex.category，但引擎輸出的欄位叫 ex.cat ——
 *      「複合動作各加 1 組」從來沒有真的加過任何一組。
 *   ② 強度等級是「相對原始課表」的絕對值，但以前沒存原始課表：
 *      第二季降一級、第三季降兩級，會變成在已經降過的課表上再降兩級（實際 −3）。
 *      現在第一次換季就把原始課表存成 _originalSnapshot，之後一律從它算。
 *      組數例外：組數以「現在」為準，不然「加 1 組」的累積會被強度調整洗掉。
 */
import { applyLevelToWholePlan } from './ProgressiveTrainingSystem';
import { findAlternativeExercise, recommendAlternatives, lookupEngineExercise } from './UnifiedTrainingEngine';
import { epleyE1RMStrict, roundToPlate } from './strengthMath';
import { strengthDetraining, floorToPlate, prescribeWorkingWeight } from './e1rmAdvisor';

export const MAX_COMPOUND_SETS = 5;

/** 換季最多降到 −2。
 *  連續兩季都「太吃力」還在降，整份課表會變得跟減量週一樣輕 —— 那不是訓練，是空轉。
 *  到了 −2 還是太吃力，問題多半在睡眠、飲食或動作選擇，下一步該換部位／重排，不是再降。 */
export const SEASON_MIN_LEVEL = -2;

/* ════ 換季的專業標準（數字的出處與理由：scripts/CYCLE_ROTATION_STANDARD.md）════════════
   scripts/audit_cycle_rotation.mjs 用同一組數字稽核，改這裡就是改標準。 */
export const ROTATION = {
    LOW_ADHERENCE: 50,        // S2 完成率 < 50%：重複這一季，不加任何負荷
    GOOD_ADHERENCE: 75,       // S2 ≥ 75% 才算「有照課表練」：進步／平台期的判定才算數
    PROGRESS_E1RM_PCT: 1.5,   // S3 估算 1RM 季內 +1.5% 以上 = 有進步
    PROGRESS_VOLUME_PCT: 2.5, // S3 每堂訓練量比上一季 +2.5% 以上 = 有進步
    READY_PCT: 50,            // S3 一半以上的動作次數做到區間上限（雙重漸進：該加重了）= 有進步
    MAX_LOAD_STEP_PCT: 10,    // S4 一季加重上限 10%（最小一格槓片例外）
    MAX_SET_STEP: 1,          // S4 一個動作一季最多 +1 組
    MIN_RETAIN: 0.7,          // S5 原地換季至少留 70% 動作（換器材不算）
};

/** 這一季還能不能再往 dir 調強度 */
export const canShiftIntensity = (plan, dir) => {
    const lvl = plan?._intensityLevel || 0;
    if (dir === 'down') return lvl > SEASON_MIN_LEVEL;
    if (dir === 'up') return lvl < 3;
    return false;
};

const isDeload = (w) => /deload|taper|減量/i.test(String(w?.phase || ''));
export const isCompound = (ex) => ex?.cat === 'compound' || ex?.category === 'compound';

/** 這份課表還能不能「複合動作加 1 組」：全部都 5 組了、或那個部位每週組數已經到上限（20 組）就不能 ——
 *  不然決策說「加組」，加上去又被每週上限扣回來，換季等於什麼都沒加。 */
export const canAddCompoundSet = (plan) => !!plan?.weeks?.some((w, wi) => {
    if (isDeload(w)) return false;
    const mainList = (w.days || []).flatMap((d) => (d.exercises || []).filter((e) => !e.isWarmup && e.tier !== 4));
    const tot = (list) => list.reduce((m, e) => { m[e.muscle] = (m[e.muscle] || 0) + (parseInt(e.sets, 10) || 0); return m; }, {});
    const cur = tot(mainList);
    const orig = tot((plan._originalSnapshot?.[wi]?.days || []).flatMap((d) => (d.exercises || []).filter((e) => !e.isWarmup && e.tier !== 4)));
    return mainList.some((e) => isCompound(e) && (parseInt(e.sets, 10) || 3) < MAX_COMPOUND_SETS
        && (cur[e.muscle] || 0) < Math.max(MAX_WEEKLY_SETS_PER_MUSCLE, orig[e.muscle] || 0));
});

/* ══════════════════════════════════════════════════════════════════
 * 個人化：用「這一季每一組真的做了什麼」決定每個動作下一季怎麼改
 * ══════════════════════════════════════════════════════════════════
 * 規則（照教練帶學生的做法，一個動作只套第一條成立的）：
 *   ① 排了 ≥3 次、一次都沒做   → 換一個比較簡單的同部位動作（做不到的動作留著沒意義）
 *   ② 平均 RPE ≥ 9、很少做滿次數 → 少 1 組（至少 2 組）—— 太吃力，先把品質做回來
 *   ③ 做了 ≥4 次、估算 1RM 沒進步、也很少做滿 → 換同部位的變化式（卡住了換角度刺激）
 *   ④ 六成以上的組做滿次數、RPE ≤ 8.5 → 雙重漸進：下一季加重量
 *        下肢複合 +5 kg、其他槓鈴／器械 +2.5 kg、啞鈴與孤立 +1 kg；徒手動作改成次數區間往上 2 下
 *   ⑤ 平均 RPE ≤ 6.5 → 太輕鬆，加 1 組（上限 5）
 *   其他 → 照舊
 * 沒有紀錄的動作一律不動 —— 沒資料就不猜。
 */
const REPS_RE = /(\d+)\s*[-–]\s*(\d+)/;
const parseRange = (reps) => {
    const m = String(reps ?? '').match(REPS_RE);
    if (m) return [Number(m[1]), Number(m[2])];
    const n = parseInt(reps, 10);
    return Number.isFinite(n) && n > 0 ? [n, n] : null;
};
const LOWER_ZONES = /quads|hamstrings|glutes/;
/** 這個動作的重量最小能調多少：啞鈴／壺鈴 0.5 kg 一格（最輕 1 kg），其他（槓鈴、機械、滑輪）2.5 kg */
const plateOf = (ex) => (/^(dumbbell|kettlebell)$/.test(String(ex?.eq || '')) ? { step: 0.5, min: 1 } : { step: 2.5, min: 2.5 });
const loadStep = (ex) => {
    const eq = String(ex.eq || '');
    if (eq === 'dumbbell' || eq === 'kettlebell' || !isCompound(ex)) return 1;
    if (LOWER_ZONES.test(String(ex.zone || ex.muscle || ''))) return 5;
    return 2.5;
};

/* ── 跨健身房 ─────────────────────────────────────────────────────────
   一份課表是「主場」的版本；到別間練時，訓練頁會把那間沒有的器材換成替代動作
   （utils/gymMemory.adaptDayForGym）。這些替代在紀錄裡帶著 slot（原本課表上的動作名），
   換季分析要分清楚三件事：
     · 照課表做了 → 算進表現
     · 因為那間沒器材改做替代 → 不算跳過、也不算進原動作的表現（是另一個動作）
     · 那天有練、卻沒做也沒替代 → 才是跳過；但那間後來被標成「沒有這台」的，算器材問題不算跳過
   機械／滑輪的重量各家不同（A 館的腿推機 100 kg ≠ B 館的 100 kg），
   這類動作的進步趨勢與下一季起始重量只看「做最多次的那一間」。 */
const GYM_SPECIFIC_EQ = new Set(['machine', 'cable', 'smith', 'plate_loaded', 'plate-loaded']);
const eqOf = (ex) => ex?.eq || lookupEngineExercise(ex?.nameEn || ex?.name)?.eq || null;
export const isGymSpecificLoad = (ex) => GYM_SPECIFIC_EQ.has(String(eqOf(ex) || '').toLowerCase());
const keysOf = (ex) => [ex?.name, ex?.nameEn].filter(Boolean);
/** 課表上的一個動作在「原課表」是哪一個（照健身房換過的，記在 gymOrig） */
const slotKeysOf = (ex) => [...keysOf(ex), ex?.gymOrig?.name, ex?.gymOrig?.nameEn].filter(Boolean);

/** 這一季每個動作的實際表現
 *  @param {{ gymMissing?: (gymId:string, exercise:object) => boolean }} opts
 *         那間健身房（現在）是不是被標成沒有這個動作要用的器材 */
export function analyzeSeasonExercises(plan, records = [], sinceMs = 0, { gymMissing = null } = {}) {
    const out = {};
    const inSeason = (Array.isArray(records) ? records : [])
        .filter((r) => {
            const t = new Date(r?.timestamp || r?.date || 0).getTime();
            return Number.isFinite(t) && t >= sinceMs;
        })
        .sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));
    // 一筆紀錄裡每個動作「代表課表上的哪個位置」：做的動作本身＋替代的那個（slot）
    const recNames = (r) => (r.exercises || []).flatMap((e) => [e?.name, e?.slot]).filter(Boolean);
    const planned = {};
    /* 每一週排的次數區間：課表是週期化的（第 3 週 Peak 常常是 10-12 而不是 12-15），
       「做滿了沒」要跟那一週排的比，不能都拿第 1 週的區間比 —— 不然 Peak 週的每一組都算沒做滿。 */
    const rangeByWeek = {};
    (plan?.weeks || []).forEach((w, wi) => w.days?.forEach((d) => d.exercises?.forEach((ex) => {
        if (ex.isWarmup || ex.tier === 4) return;
        planned[ex.name] = (planned[ex.name] || 0) + 1;
        ((rangeByWeek[ex.name] ||= {})[wi]) ??= parseRange(ex.reps);
    })));
    const nWeeks = (plan?.weeks || []).length;
    const weekIdxOf = (r) => {
        if (!(sinceMs > 0) || !nWeeks) return -1;
        const wi = Math.floor((new Date(r.timestamp || r.date).getTime() - sinceMs) / (7 * 86400000));
        return Math.max(0, Math.min(nWeeks - 1, wi));
    };
    // 同一天的其他動作（判斷「那天有練，卻跳過這個動作」用）
    const mates = {};
    (plan?.weeks || []).forEach((w) => w.days?.forEach((d) => {
        const list = (d.exercises || []).filter((e) => !e.isWarmup && e.tier !== 4);
        list.forEach((ex) => {
            mates[ex.name] = mates[ex.name] || new Set();
            list.forEach((o) => { if (o.name !== ex.name) slotKeysOf(o).forEach((n) => mates[ex.name].add(n)); });
        });
    }));
    /* 每筆訓練紀錄對到「最像的那一天」（重疊動作最多、比例最高）。
       只有那一天排了、紀錄裡卻沒有的動作才算跳過 —— 不然第二個上半身日跟拉日共用引體向上時，
       記一次拉日就會把上半身日的臥推也算成「跳過」，換季時被誤換掉。 */
    const dayTemplates = [];
    const seenKey = new Set();
    (plan?.weeks || []).forEach((w) => w.days?.forEach((d) => {
        const names = new Set();
        (d.exercises || []).filter((e) => !e.isWarmup && e.tier !== 4).forEach((e) => slotKeysOf(e).forEach((n) => names.add(n)));
        const key = [...names].sort().join('|');
        if (names.size && !seenKey.has(key)) { seenKey.add(key); dayTemplates.push({ names, size: (d.exercises || []).filter((e) => !e.isWarmup && e.tier !== 4).length }); }
    }));
    const bestDayOf = new Map();
    inSeason.forEach((r) => {
        const rn = [...new Set(recNames(r))];
        let best = null, bestHit = 0, bestRatio = 0;
        dayTemplates.forEach((t) => {
            const hit = rn.filter((n) => t.names.has(n)).length;
            const ratio = hit / Math.max(1, t.size);
            if (hit > bestHit || (hit === bestHit && hit > 0 && ratio > bestRatio)) { best = t; bestHit = hit; bestRatio = ratio; }
        });
        bestDayOf.set(r, best);
    });
    Object.keys(planned).forEach((name) => {
        const ref = plan.weeks.flatMap((w) => w.days || []).flatMap((d) => d.exercises || []).find((e) => e.name === name);
        const names = new Set(keysOf(ref).length ? keysOf(ref) : [name]);
        const slotKeys = new Set([name, ...slotKeysOf(ref)]);
        const range = parseRange(ref?.reps);
        const gymSpecific = isGymSpecificLoad(ref);
        const sessions = [];   // { sets, gymId, gymName, wi }
        let skipped = 0, subbed = 0, gymSkipped = 0;
        const gymsSeen = new Set();
        inSeason.forEach((r) => {
            const gymId = r.gym?.id || null;
            // ① 照課表做了這個動作（不是在別間被換掉的替代）
            const hit = (r.exercises || []).find((e) => names.has(e?.name));
            if (!hit) {
                // ② 那間沒器材 → 做了替代（slot 指回這個動作），或回到原課表的版本
                const sub = (r.exercises || []).find((e) => (e?.slot && slotKeys.has(e.slot)) || (slotKeys.has(e?.name) && !names.has(e?.name)));
                if (sub) { subbed += 1; return; }
                const day = bestDayOf.get(r);
                const wasDay = day ? [...slotKeys].some((n) => day.names.has(n)) : (r.exercises || []).some((e) => mates[name]?.has(e?.name));
                if (!wasDay) return;
                // ③ 那天有練卻沒做：那間後來被標成沒有這台 → 器材問題，不是不想做
                if (gymId && gymMissing && ref && gymMissing(gymId, ref)) gymSkipped += 1;
                else skipped += 1;
                return;
            }
            const sets = (Array.isArray(hit.sets) ? hit.sets : []).filter((s) => s && s.completed !== false && (parseInt(s.reps, 10) || 0) > 0);
            if (sets.length) { sessions.push({ sets, gymId, gymName: r.gym?.name || null, wi: weekIdxOf(r) }); gymsSeen.add(gymId || '_'); }
        });
        const allSets = sessions.flatMap((x) => x.sets);
        const rpes = allSets.map((s) => Number(s.rpe)).filter((v) => Number.isFinite(v) && v > 0);
        // 做滿／做到區間：跟「那一週」排的區間比；減量週故意輕，不算
        const judged = sessions.filter((x) => !(x.wi >= 0 && isDeload(plan.weeks[x.wi])));
        const rangeOf = (x) => (x.wi >= 0 && rangeByWeek[name]?.[x.wi]) || range;
        const judgedSets = judged.flatMap((x) => x.sets.map((st) => ({ reps: parseInt(st.reps, 10) || 0, rg: rangeOf(x) }))).filter((x) => x.rg);
        const topHit = judgedSets.length ? judgedSets.filter((x) => x.reps >= x.rg[1]).length / judgedSets.length : 0;
        const minHit = judgedSets.length ? judgedSets.filter((x) => x.reps >= x.rg[0]).length / judgedSets.length : 0;
        // 機械／滑輪：重量只在同一間比（做最多次的那一間）
        let loadSessions = sessions, loadGym = null;
        if (gymSpecific && gymsSeen.size > 1) {
            const cnt = {};
            sessions.forEach((x) => { const k = x.gymId || '_'; cnt[k] = (cnt[k] || 0) + 1; });
            const lastIdx = (k) => sessions.map((x) => x.gymId || '_').lastIndexOf(k);
            const topK = Object.keys(cnt).sort((a, b) => (cnt[b] - cnt[a]) || (lastIdx(b) - lastIdx(a)))[0];
            loadSessions = sessions.filter((x) => (x.gymId || '_') === topK);
            const any = loadSessions[loadSessions.length - 1];
            loadGym = any ? { id: any.gymId, name: any.gymName } : null;
        }
        /* 表現趨勢：每次最好的一組換算成同一把尺 —— 有重量：重量 × (1 + 次數/30)；
           徒手：比那一週排的下限多做幾下（10 + 多出來的次數；週期化的區間不同也能比，多 1 下 ≈ +10%）。
           這只用來比「自己前後」，不顯示成 1RM —— 所以 12 下以上的組也算得進來
           （以前用嚴格版 e1RM，12-15 下的課表永遠算不出趨勢，卡住也偵測不到）。
           減量週故意輕，不算進趨勢；至少 2 次（一週練一次、完成率 75% 的人一季也只有 2 次）。 */
        const perf = (st, x) => {
            const wt = parseFloat(st.weight) || 0, rp = Math.min(20, parseInt(st.reps, 10) || 0);
            if (rp <= 0) return 0;
            if (wt >= 0.5) return wt * (1 + rp / 30);
            const rg = rangeOf(x);
            return rg ? Math.max(0.5, 10 + rp - rg[0]) : rp;
        };
        const best = loadSessions.filter((x) => !(x.wi >= 0 && isDeload(plan.weeks[x.wi]))).map((x) => Math.max(0, ...x.sets.map((st) => perf(st, x))));
        let trendPct = null;
        if (best.length >= 2 && best.every((v) => v > 0)) {
            const h = Math.floor(best.length / 2);
            const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
            const a1 = avg(best.slice(0, h)), a2 = avg(best.slice(h));
            trendPct = a1 > 0 ? ((a2 - a1) / a1) * 100 : null;
        }
        /* 下一季的起始重量用「跟第 1 週同一個次數區間」的最後一次（Peak 週次數少、重量重，拿它當第 1 週的起點會太重） */
        const r0 = rangeByWeek[name]?.[0] || range;
        const sameRange = loadSessions.filter((x) => x.wi < 0 || (!isDeload(plan.weeks[x.wi]) && String(rangeOf(x)) === String(r0)));
        const last = (sameRange.length ? sameRange : loadSessions)[(sameRange.length ? sameRange : loadSessions).length - 1]?.sets || [];
        out[name] = {
            planned: planned[name],
            done: sessions.length,
            skipped,
            subbed,          // 在別間改做替代的次數（不算跳過）
            gymSkipped,      // 那間沒這台而沒做（不算跳過）
            gyms: gymsSeen.size,
            loadGym,         // 機械類跨館時，重量以哪一間為準
            avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
            topHit,
            minHit,
            trendPct,
            lastTopWeight: Math.max(0, ...last.map((s) => parseFloat(s.weight) || 0)),
        };
    });
    return out;
}

/** 依實際表現改每個動作。回傳改過的 plan 與每個動作一條說明 */
export function personalizeSeason(plan, records = [], { sinceMs = 0, level, equipment, injuries, isBlocked = null, gymMissing = null, homeGymName = null, daysOff = 0, setAdded = null, hold = false, intensityUp = false, trainedPlan = null } = {}) {
    const p = JSON.parse(JSON.stringify(plan || {}));
    if (!Array.isArray(p.weeks)) return { plan: p, changes: [] };
    /* 表現要跟「這一季真的照著練的那份」比（trainedPlan）—— 換季前面的步驟可能已經把次數區間改了
       （降一級：8-10 → 6-9），拿改過的區間判斷「做滿了沒」會全部算錯。 */
    const stats = analyzeSeasonExercises(trainedPlan || p, records, sinceMs, { gymMissing });
    const det = strengthDetraining(daysOff);
    const weeksOff = Math.max(2, Math.floor(det.days / 7));
    const lv = level || String(p.user_level || 'beginner').toLowerCase();
    const eq = equipment || p.equipment_preference || 'mixed';
    const inj = injuries || p.injuries || [];
    const changes = [];
    const forEachSame = (name, fn) => p.weeks.forEach((w) => w.days?.forEach((d) => {
        d.exercises = (d.exercises || []).map((ex) => (ex.name === name ? (fn(ex, w, d) || ex) : ex));
    }));
    /* 換動作時連原始快照一起換（保留快照裡的基準組數／次數／休息）——
       不然下一季 normalizeToLevel 對不到名字，這個位置就再也不會跟著強度等級調整。 */
    const IDENTITY = ['name', 'nameEn', 'zone', 'muscle', 'cat', 'tier', 'cns', 'diff', 'eq', 'time'];
    const swapTo = (name, alt) => {
        const ident = Object.fromEntries(IDENTITY.filter((k) => alt[k] !== undefined).map((k) => [k, alt[k]]));
        forEachSame(name, (ex) => {
            const next = { ...ex, ...ident, _swappedFrom: name };
            delete next.suggestedWeight; delete next.suggestedWeightEach; delete next.note;
            // 換季換掉的是「課表本身」：之前照某間健身房換過的標記作廢，
            // 不然到別間練時 restorePlannedExercises 會把它還原成上一季的舊動作
            delete next.gymOrig; delete next.gymSwappedFrom;
            return next;
        });
        (p._originalSnapshot || []).forEach((w) => w.days?.forEach((d) => {
            d.exercises = (d.exercises || []).map((ex) => {
                if (ex.name !== name) return ex;
                const next = { ...ex, ...ident };
                delete next.gymOrig; delete next.gymSwappedFrom;
                return next;
            });
        }));
    };
    /* 一季最多換 3 個動作：教練換季只換卡住或不適合的幾個，主架構要留著，
       不然每季都是新課表，前一季累積的動作熟練度跟重量紀錄全部歸零。
       先換「那天有練卻一直跳過」的（最明確不適合），再換卡住的。 */
    /* S5：換掉的動作（不算主場沒器材被迫換的）最多佔 30%，至少留 70% 讓兩季的重量可以比；
       動作很少的課表（≤3 個）至少可以換掉 1 個一直跳過的。 */
    const MAX_SWAPS = Math.min(3, Math.max(1, Math.floor(Object.keys(stats).length * (1 - ROTATION.MIN_RETAIN))));
    let swaps = 0;
    const order = Object.entries(stats).sort(([, a], [, b]) =>
        ((b.done === 0 ? b.skipped : 0) - (a.done === 0 ? a.skipped : 0)) || ((a.trendPct ?? 99) - (b.trendPct ?? 99)));
    order.forEach(([name, st]) => {
        const ref = p.weeks.flatMap((w) => w.days || []).flatMap((d) => d.exercises || []).find((e) => e.name === name);
        if (!ref) return;
        const dayNamesOf = (d) => (d.exercises || []).map((e) => e.nameEn || e.name);
        // ⓪ 主場（課表排給的那間／這季最常去的那間）沒有這台 → 換成主場做得到的。
        //    不然每次練都要在訓練頁臨時替換，課表上寫的永遠不是你真的在做的。
        //    這是器材不符，不是表現問題，不佔「一季最多換 3 個」的名額。
        if (isBlocked && isBlocked(ref)) {
            const alt = findAlternativeExercise(ref, { level: lv, equipment: eq, injuries: inj, isBlocked,
                exclude: p.weeks.flatMap((w) => w.days || []).flatMap(dayNamesOf) });
            if (alt) {
                swapTo(name, alt);
                changes.push({ name, kind: 'swap', text: `${name} → ${alt.name}`, why: homeGymName ? `${homeGymName}沒有這台` : '常去的健身房沒有這台' });
                return;
            }
        }
        // ① 那天有練，卻每次都跳過這個動作（至少 3 次）→ 換一個簡單一點的
        //    （只看「沒紀錄」不夠：使用者可能根本沒記那一天，不能因此就換掉）
        if (st.done === 0) {
            if (st.skipped < 3 || swaps >= MAX_SWAPS) return;
            const alt = findAlternativeExercise(ref, { level: lv, equipment: eq, injuries: inj, easier: true, isBlocked,
                exclude: p.weeks.flatMap((w) => w.days || []).flatMap(dayNamesOf) });
            if (alt) {
                swapTo(name, alt);
                swaps += 1;
                changes.push({ name, kind: 'swap', text: `${name} → ${alt.name}`, why: '一直跳過' });
            }
            return;
        }
        if (st.done < 2) return;   // 資料太少不動
        // ② 太吃力
        if (st.avgRpe != null && st.avgRpe >= 9 && st.topHit < 0.3) {
            let did = false;
            forEachSame(name, (ex, w) => {
                if (isDeload(w)) return ex;
                const cur = parseInt(ex.sets, 10) || 3;
                if (cur <= 2) return ex;
                did = true;
                return { ...ex, sets: cur - 1, _addedSets: (Number(ex._addedSets) || 0) - 1 };
            });
            if (did) changes.push({ name, kind: 'ease', text: `${name} −1 組`, why: `RPE ${st.avgRpe}` });
            return;
        }
        // ③ 卡住了：有認真練（RPE ≥ 7.5）但估算最大肌力一整季沒漲、次數也沒做滿 → 換變化式給新刺激
        //    （RPE 低又沒進步不是卡住，是練太輕 → 交給 ④／⑤ 加量）
        if (swaps < MAX_SWAPS && st.done >= 4 && st.trendPct != null && st.trendPct <= 1 && st.topHit < 0.6
            && st.avgRpe != null && st.avgRpe >= 7.5) {
            const alt = findAlternativeExercise(ref, { level: lv, equipment: eq, injuries: inj, isBlocked,
                exclude: p.weeks.flatMap((w) => w.days || []).flatMap(dayNamesOf) });
            if (alt) {
                swapTo(name, alt);
                swaps += 1;
                changes.push({ name, kind: 'swap', text: `${name} → ${alt.name}`, why: '重量卡住' });
                return;
            }
        }
        // ⓪-b 停練回來：重量先退（不是加），跟每次訓練的處方同一張表（e1rmAdvisor.strengthDetraining）
        if (det.factor < 1 && st.lastTopWeight > 0) {
            const pl = plateOf(ref);
            const next = Math.max(pl.min, floorToPlate(st.lastTopWeight * det.factor, pl.step));
            // 已經是最輕的一格退不下去，也要把上一季留下來（可能更重）的建議重量蓋掉
            const prevSuggested = parseFloat(ref.suggestedWeight) || null;
            forEachSame(name, (ex) => ({ ...ex, suggestedWeight: next, suggestedWeightEach: undefined,
                note: `隔了 ${weeksOff} 週沒練，這季先從 ${next} kg 回來。` }));
            const from = prevSuggested ?? st.lastTopWeight;
            if (next !== from) changes.push({ name, kind: 'load', text: `${name} ${from}→${next} kg`, why: `隔了 ${weeksOff} 週沒練`, from, to: next });
            else changes.push({ name, kind: 'hold', text: `${name} 維持 ${next} kg`, why: `隔了 ${weeksOff} 週沒練` });
            return;
        }
        // ④ 做滿了 → 加重量（徒手 → 加次數）。一季最多 +10%（太輕的重量至少給一格最小槓片）
        if (hold) return;
        // 次數做滿但表現在往下掉（e1RM 趨勢 < −1%）→ 不加重，先把這個重量穩住
        const sliding = st.trendPct != null && st.trendPct < -1;
        if (!sliding && st.topHit >= 0.6 && (st.avgRpe == null || st.avgRpe <= 8.5)) {
            if (st.lastTopWeight > 0) {
                const step = Math.min(loadStep(ref), Math.max(loadStep(ref) >= 2.5 ? 2.5 : 1, st.lastTopWeight * ROTATION.MAX_LOAD_STEP_PCT / 100));
                const next = step >= 2.5 ? roundToPlate(st.lastTopWeight + step) : Math.round((st.lastTopWeight + step) * 2) / 2;
                const at = st.loadGym?.name ? `（${st.loadGym.name}的機台）` : '';
                forEachSame(name, (ex) => ({ ...ex, suggestedWeight: next, suggestedWeightEach: undefined,
                    note: `上一季每組都做滿，這季從 ${next} kg 開始${at}。` }));
                changes.push({ name, kind: 'load', text: `${name} ${st.lastTopWeight}→${next} kg`, why: '每組都做滿', from: st.lastTopWeight, to: next });
            } else if (!intensityUp) {   // 整份已經加一級強度（次數區間已經往上）→ 不再疊加
                forEachSame(name, (ex, w) => {
                    if (isDeload(w)) return ex;
                    const r = parseRange(ex.reps);
                    return r && r[0] !== r[1] ? { ...ex, reps: `${r[0] + 2}-${r[1] + 2}` } : ex;
                });
                changes.push({ name, kind: 'reps', text: `${name} 每組 +2 下`, why: '每組都做滿' });
            }
            return;
        }
        // ⑤ 太輕鬆（這一輪已經因為「複合動作加 1 組」加過的、或整份已經「加一級強度」的不再加：
        //    一季一個動作最多 +1 組，而且一次只加一種負荷 —— 強度跟組數一起加，恢復跟不上）
        if (st.avgRpe != null && st.avgRpe <= 6.5 && !sliding && !intensityUp && !(setAdded && setAdded.has(name))) {
            let did = false;
            forEachSame(name, (ex, w) => {
                if (isDeload(w)) return ex;
                const cur = parseInt(ex.sets, 10) || 3;
                if (cur >= MAX_COMPOUND_SETS) return ex;
                did = true;
                return { ...ex, sets: cur + 1, _addedSets: (Number(ex._addedSets) || 0) + 1 };
            });
            if (did) changes.push({ name, kind: 'add', text: `${name} +1 組`, why: `RPE ${st.avgRpe}` });
        }
    });
    return { plan: p, changes };
}

/**
 * @param {object} plan   目前的課表
 * @param {'intensity'|'progress'|'keep'|string[]} choice  可以是陣列（複選）
 * @param {'up'|'down'|'maintain'} dir  intensity 的方向
 * @param {object} opts
 *   records   這一季的訓練紀錄（有給才做逐動作個人化）
 *   daysOff   距離最後一次訓練幾天（停練回來要先退重量、少一組；S6）
 *   loadTable e1RM 表（e1rmAdvisor.buildE1RMTable）：有給就替每個有紀錄的動作帶建議重量（會員）
 *   hold      這一季不准往上加負荷（decideSeason().hold）：重量、組數、強度只能持平或往下
 * @returns {{ plan: object, changes: string[], personal: object[] }}  changes：第 1 週每個動作一條（給畫面預告）
 */
export function buildNextSeasonPlan(plan, choice, dir = 'maintain', { records = null, sinceMs = 0, isBlocked = null, gymMissing = null, homeGymName = null, daysOff = 0, loadTable = null, hold = false } = {}) {
    const p = JSON.parse(JSON.stringify(plan || {}));
    if (!Array.isArray(p.weeks)) return { plan: p, changes: [], personal: [] };
    // 第一次換季：把原始課表存起來，之後的強度等級都相對它
    if (!p._originalSnapshot) p._originalSnapshot = JSON.parse(JSON.stringify(p.weeks));
    // 每週回饋紀錄是「這一季」的：換季時封存，不然下一季的收官會把上一季的「太吃力」也算進去
    if (Array.isArray(p._feedbackHistory) && p._feedbackHistory.length) {
        p._feedbackArchive = [...(p._feedbackArchive || []), { season: p.season || null, history: p._feedbackHistory }];
        p._feedbackHistory = [];
    }
    const det = strengthDetraining(daysOff);
    const weeksOff = Math.max(2, Math.floor(det.days / 7));

    // ① 先把四週拉回同一個強度等級。
    //    每週回饋是「下一週全量、之後半量」，這一季結束時第 2 週跟第 3 週可能停在不同等級；
    //    新的一季要從一致的起點開始，不能把上一季某一週的臨時調整帶過去。
    normalizeToLevel(p, p._intensityLevel || 0);

    // ② 使用者選的改法 —— 可以複選（例：降一級強度 ＋ 依紀錄逐動作調整；加一級強度 ＋ 複合動作加組）。
    //    先調強度（整份課表的次數／休息），再加組，最後才是逐動作個人化；互不覆蓋。
    //    停練 4 週以上回來（S6）：加強度、加組一律不做 —— 先把身體找回來。
    const picks = new Set((Array.isArray(choice) ? choice : [choice]).filter(Boolean));
    if (det.dropSet || hold) { picks.delete('progress'); if (dir === 'up') picks.delete('intensity'); }
    let changes = [];
    if (picks.has('intensity') && dir !== 'maintain') {
        const curLvl = p._intensityLevel || 0;
        const newLvl = Math.max(SEASON_MIN_LEVEL, Math.min(3, curLvl + (dir === 'up' ? 1 : -1)));
        const applied = applyLevelToWholePlan(p, newLvl);
        Object.assign(p, applied.plan);
        changes = [...changes, ...(applied.changes || [])];
    }
    const setAdded = new Set();
    if (picks.has('progress')) {
        const seen = new Set();
        p.weeks.forEach((w, wi) => {
            if (isDeload(w)) return;
            w.days?.forEach((d) => d.exercises?.forEach((ex) => {
                if (!isCompound(ex)) return;
                const cur = parseInt(ex.sets, 10) || 3;
                if (cur >= MAX_COMPOUND_SETS) return;
                ex.sets = cur + 1;
                ex._addedSets = (Number(ex._addedSets) || 0) + 1;   // 讓之後的強度調整知道這組是加上去的
                setAdded.add(ex.name);
                if (wi === 0 && !seen.has(ex.name)) { seen.add(ex.name); changes.push(`${ex.name} ${cur}→${cur + 1} 組`); }
            }));
        });
    }
    p._nextCycleStrategy = [...picks].filter((x) => x === 'intensity' || x === 'progress').join('+') || 'keep';

    // ③ 照這一季每一組的實際紀錄，逐個動作個人化（加重量／換動作／減組…）
    let personal = [];
    if (Array.isArray(records) && records.length) {
        const r = personalizeSeason(p, records, { sinceMs, isBlocked, gymMissing, homeGymName, daysOff, setAdded, hold,
            intensityUp: picks.has('intensity') && dir === 'up', trainedPlan: plan });
        Object.assign(p, r.plan);
        personal = r.changes;
    }
    const handled = new Set(personal.filter((c) => c.kind === 'load' || c.kind === 'swap' || c.kind === 'hold').map((c) => c.name));
    const swappedTo = new Set();
    p.weeks.forEach((w) => w.days?.forEach((d) => d.exercises?.forEach((ex) => { if (ex._swappedFrom && handled.has(ex._swappedFrom)) swappedTo.add(ex.name); })));

    // ④ 依 e1RM 帶建議重量（會員）：個人化已經決定重量的、這季剛換的動作不覆蓋
    //    以前是「預告畫完之後」才套 —— 預告清單跟真的寫進去的不一樣（S9）。現在在這裡一起算。
    if (loadTable && typeof loadTable === 'object') {
        const rx = [];
        // e1RM 表是近 60 天最好的那一組；這一季退步了、或這一季不准加（hold）→ 不超過這一季實際做到的重量（S2、S4）
        const seasonStats = Array.isArray(records) && records.length ? analyzeSeasonExercises(plan, records, sinceMs) : {};
        /* 一個動作一個建議重量（跟逐動作個人化一樣，四週共用）：用第一個算得出來的次數區間算
           （「12 -> 8」這種遞減組算不出中位數；以前那幾格就留著上一季的舊重量）。 */
        const occ = new Map();
        p.weeks.forEach((w) => w.days?.forEach((d) => d.exercises?.forEach((ex) => {
            if (ex.isWarmup || handled.has(ex.name) || swappedTo.has(ex.name)) return;
            if (!occ.has(ex.name)) occ.set(ex.name, []);
            occ.get(ex.name).push(ex);
        })));
        occ.forEach((list, name) => {
            const hit = loadTable[name];
            let w8 = null;
            for (const ex of list) { w8 = prescribeWorkingWeight(hit, ex.reps); if (w8) break; }
            if (!w8) return;
            const pl = plateOf(list[0]);
            const stx = seasonStats[name];
            if (hold && !(stx?.lastTopWeight > 0) && hit?.bestWeight > 0 && w8 > hit.bestWeight) w8 = Math.max(pl.min, floorToPlate(hit.bestWeight, pl.step));
            if (stx?.lastTopWeight > 0) {
                const down = stx.trendPct != null && stx.trendPct < 0;
                const ceiling = hold || down ? stx.lastTopWeight : stx.lastTopWeight * (1 + ROTATION.MAX_LOAD_STEP_PCT / 100);
                // 上限一定 ≥ 這一季做到的重量；往下取整到最小一格，但不低於這一季做到的
                if (w8 > ceiling) w8 = Math.max(stx.lastTopWeight, floorToPlate(ceiling, pl.step));
                // 雙重漸進：這個重量的次數都做到區間裡、也沒退步 → 不往回降（e1RM 表只收 12 下以內的組，會低估高次數的課）
                if (!hold && !down && stx.minHit >= 0.6 && w8 < stx.lastTopWeight) w8 = stx.lastTopWeight;
            }
            if (det.factor < 1) w8 = Math.max(pl.min, floorToPlate(w8 * det.factor, pl.step));
            if (det.factor < 1 && stx?.lastTopWeight > 0) w8 = Math.min(w8, Math.max(pl.min, floorToPlate(stx.lastTopWeight * det.factor, pl.step)));
            list.forEach((ex) => { ex.suggestedWeight = w8; ex.e1rmBasis = hit.e1rm; delete ex.note; });
            rx.push({ name, suggestedWeight: w8, e1rm: hit.e1rm });
            personal.push({ name, kind: 'rx', auto: true, text: `${name} ${w8} kg`, why: det.factor < 1 ? `隔了 ${weeksOff} 週沒練` : '依最近紀錄推算', from: hit.bestWeight, to: w8 });
        });
        if (rx.length) p._loadPrescriptions = rx; else delete p._loadPrescriptions;
        rx.forEach((x) => handled.add(x.name));
    }

    // ⑤ 停練回來（S6）：上一季留下的建議重量也要退；4 週以上主項各少 1 組（至少 2 組）
    if (det.factor < 1) {
        const seen = new Set();
        p.weeks.forEach((w) => w.days?.forEach((d) => d.exercises?.forEach((ex) => {
            if (ex.isWarmup || handled.has(ex.name) || swappedTo.has(ex.name)) return;
            const cur = parseFloat(ex.suggestedWeight);
            if (!(cur > 0)) return;
            const pl = plateOf(ex);
            const next = Math.max(pl.min, floorToPlate(cur * det.factor, pl.step));
            if (next >= cur) return;
            ex.suggestedWeight = next;
            ex.note = `隔了 ${weeksOff} 週沒練，這季先從 ${next} kg 回來。`;
            if (!seen.has(ex.name)) { seen.add(ex.name); personal.push({ name: ex.name, kind: 'load', auto: true, text: `${ex.name} ${cur}→${next} kg`, why: `隔了 ${weeksOff} 週沒練`, from: cur, to: next }); }
        })));
    }
    if (det.dropSet) {
        const eased = new Set(personal.filter((c) => c.kind === 'ease').map((c) => c.name));
        const seen = new Set();
        p.weeks.forEach((w) => {
            if (isDeload(w)) return;
            w.days?.forEach((d) => d.exercises?.forEach((ex) => {
                if (ex.isWarmup || ex.tier === 4 || eased.has(ex.name)) return;
                const cur = parseInt(ex.sets, 10) || 3;
                if (cur <= 2) return;
                ex.sets = cur - 1;
                ex._addedSets = (Number(ex._addedSets) || 0) - 1;
                if (!seen.has(ex.name)) { seen.add(ex.name); personal.push({ name: ex.name, kind: 'ease', auto: true, text: `${ex.name} −1 組`, why: `隔了 ${weeksOff} 週沒練` }); }
            }));
        });
    }

    // ⑥ S4：一個動作一季最多 +1 組（強度 +3、複合加組、太輕鬆加組 疊在一起會一次 +2、+3）
    capSetStep(p, plan);
    capWeeklySets(p);
    return { plan: p, changes, personal };
}

/** 跟換季前同一格比：組數最多 +1（多出來的從 _addedSets 扣回去）、次數區間上下限各最多 +2 */
function capSetStep(p, before) {
    p.weeks.forEach((w, wi) => w.days?.forEach((d, di) => d.exercises?.forEach((ex, ei) => {
        const o = before?.weeks?.[wi]?.days?.[di]?.exercises?.[ei];
        if (!o || ex.isWarmup) return;
        const or = parseRange(o.reps), nr = parseRange(ex.reps);
        if (o.name === ex.name && or && nr && (nr[1] > or[1] + 2 || nr[0] > or[0] + 2)) {
            const lo = Math.min(nr[0], or[0] + 2), hi = Math.max(lo + 1, Math.min(nr[1], or[1] + 2));
            ex.reps = `${lo}-${hi}`;
        }
        const os = parseInt(o.sets, 10) || 0, ns = parseInt(ex.sets, 10) || 0;
        const over = ns - (os + ROTATION.MAX_SET_STEP);
        if (!os || over <= 0) return;
        ex.sets = os + ROTATION.MAX_SET_STEP;
        if (Number(ex._addedSets) > 0) ex._addedSets = Math.max(0, Number(ex._addedSets) - over);
    })));
}

/** 把每一週拉回「原始課表 ＋ 這個強度等級」（減量週不動；換過的動作沒有快照就維持現狀） */
function normalizeToLevel(p, lvl) {
    const snap = p._originalSnapshot || [];
    p.weeks.forEach((w, wi) => {
        if (isDeload(w)) return;
        w.days?.forEach((d, di) => d.exercises?.forEach((ex, ei) => {
            const s = snap[wi]?.days?.[di]?.exercises?.[ei];
            if (!s || s.name !== ex.name) return;
            ex.reps = s.reps;
            ex.rest = s.rest;
            ex.sets = Math.max(2, (parseInt(s.sets, 10) || 3) + (Number(ex._addedSets) || 0));
        }));
    });
    if (lvl) {
        const applied = applyLevelToWholePlan(p, lvl);
        Object.assign(p, applied.plan);
    }
    p._intensityLevel = lvl;
}

/** 每個肌群每週直接組數的上限。研究上 10–20 組是肌肥大的常用區間，再多恢復跟不上。
 *  原始課表本來就超過的（少數進階菜單）不往下砍，只擋「換季加上去」造成的超量。 */
export const MAX_WEEKLY_SETS_PER_MUSCLE = 20;

function capWeeklySets(p) {
    const snap = p._originalSnapshot || [];
    p.weeks.forEach((w, wi) => {
        const main = (days) => (days || []).flatMap((d) => (d.exercises || []).filter((e) => !e.isWarmup && e.tier !== 4));
        const total = (list) => list.reduce((m, e) => { m[e.muscle] = (m[e.muscle] || 0) + (parseInt(e.sets, 10) || 0); return m; }, {});
        const now = main(w.days);
        const cur = total(now);
        const orig = total(main(snap[wi]?.days));
        Object.keys(cur).forEach((muscle) => {
            const limit = Math.max(MAX_WEEKLY_SETS_PER_MUSCLE, orig[muscle] || 0);
            let over = cur[muscle] - limit;
            if (over <= 0) return;
            // 先從孤立動作扣（tier 大的先扣），複合動作最後才動；每個動作至少留 2 組
            const cands = now.filter((e) => e.muscle === muscle).sort((a, b) => (b.tier || 3) - (a.tier || 3));
            let guard = 50;
            while (over > 0 && guard-- > 0) {
                const e = cands.find((x) => (parseInt(x.sets, 10) || 0) > 2);
                if (!e) break;
                e.sets = (parseInt(e.sets, 10) || 0) - 1;
                if (e._addedSets) e._addedSets -= 1;
                over -= 1;
                cands.push(cands.splice(cands.indexOf(e), 1)[0]);   // 輪流扣，不要全扣同一個
            }
        });
    });
}

/* ════ 下一季練哪裡：看上一季每個部位「實際做了多少組」來建議（單一真相源）════════════
   季末收官的「可以加強」與健身精靈的預選都呼叫這一支，說的是同一件事。
   規則（教練的輪替思路）：
     1. 每個部位算上一季平均每週實際完成的組數（有訓練紀錄就用紀錄；沒有就用課表排的組數）。
     2. 胸／背／腿裡，每週組數最少的那個 → 下一季的重點（它被冷落了）。
     3. 上一季的重點如果完成度不到 6 成 → 繼續當重點（量還沒吃到）；
        完成度夠、而且組數已經是最多的 → 下一季改成維持，把名額讓給別的部位（換刺激、避免失衡）。
     4. 重點最多 2 個；肩／手臂／核心每週不到 4 組的，建議「加強」其中最少的 1 個。 */
export const TAG_MUSCLES = {
    chest: ['chest'], back: ['back'], legs: ['quads', 'hamstrings', 'glutes', 'calves'],
    shoulders: ['shoulders'], arms: ['biceps', 'triceps'], core: ['core'],
};
const TAG_ZH = { chest: '胸', back: '背', legs: '腿', shoulders: '肩', arms: '手臂', core: '核心' };

export function suggestNextFocus(plan, records = [], { sinceMs = 0 } = {}) {
    const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
    if (!weeks.length) return null;
    const muscleToTag = {};
    Object.entries(TAG_MUSCLES).forEach(([t, ms]) => ms.forEach((m) => { muscleToTag[m] = t; }));
    const nameToTag = {};
    const planned = {};
    weeks.forEach((w) => (w.days || []).forEach((d) => (d.exercises || []).forEach((ex) => {
        if (ex.isWarmup || ex.tier === 4) return;
        const t = muscleToTag[ex.muscle];
        if (!t) return;
        planned[t] = (planned[t] || 0) + (parseInt(ex.sets, 10) || 0);
        slotKeysOf(ex).forEach((n) => { nameToTag[n] = t; });
    })));
    const inSeason = (Array.isArray(records) ? records : []).filter((r) => {
        const t = new Date(r?.timestamp || r?.date || 0).getTime();
        return Number.isFinite(t) && t >= sinceMs;
    });
    // 在別間做的替代動作（slot 指回課表上的動作）也算進原本的部位
    const tagOfRec = (e) => nameToTag[e?.name] || nameToTag[e?.slot];
    const hasRecords = inSeason.some((r) => (r.exercises || []).some((e) => tagOfRec(e)));
    const done = {};
    if (hasRecords) {
        inSeason.forEach((r) => (r.exercises || []).forEach((e) => {
            const t = tagOfRec(e);
            if (!t) return;
            const n = (Array.isArray(e.sets) ? e.sets : []).filter((x) => x && x.completed !== false && (parseInt(x.reps, 10) || 0) > 0).length;
            done[t] = (done[t] || 0) + n;
        }));
    }
    const nWeeks = Math.max(1, weeks.length);
    const perWeek = (t) => Math.round(((hasRecords ? done[t] : planned[t]) || 0) / nWeeks);
    const completion = (t) => (hasRecords && planned[t] ? (done[t] || 0) / planned[t] : null);
    const prevFocus = (plan.selected_tags || plan.selected_hashtags || []).filter((t) => ['chest', 'back', 'legs'].includes(t));

    const BIG = ['chest', 'back', 'legs'];
    const sorted = [...BIG].sort((a, b) => perWeek(a) - perWeek(b));
    const focus = [];
    const reasons = {};
    // ① 被冷落的：組數最少的大部位
    const least = sorted[0];
    focus.push(least);
    reasons[least] = `上一季每週 ${perWeek(least)} 組，練得最少`;
    // ② 上一季的重點沒練到位 → 留著
    prevFocus.forEach((t) => {
        const c = completion(t);
        if (c != null && c < 0.6 && !focus.includes(t) && focus.length < 2) {
            focus.push(t);
            reasons[t] = `上一季重點只完成 ${Math.round(c * 100)}%`;
        }
    });
    // ③ 還有名額：第二少、而且上一季不是重點的大部位（輪替）
    if (focus.length < 2) {
        const next = sorted.find((t) => !focus.includes(t) && !prevFocus.includes(t) && perWeek(t) < perWeek(sorted[2]));
        if (next) { focus.push(next); reasons[next] = `上一季每週 ${perWeek(next)} 組`; }
    }
    // 上一季的重點、完成度夠 → 改維持（說清楚為什麼沒被預選）
    const rotatedOut = prevFocus.filter((t) => !focus.includes(t));
    rotatedOut.forEach((t) => { reasons[t] = reasons[t] || (hasRecords ? '上一季練得夠了，這季維持' : '上一季是重點，這季換一個'); });

    const ACC = ['shoulders', 'arms', 'core'];
    const accLow = [...ACC].sort((a, b) => perWeek(a) - perWeek(b)).filter((t) => perWeek(t) < 4);
    const boosts = accLow.slice(0, 1);
    boosts.forEach((t) => { reasons[t] = `上一季每週 ${perWeek(t)} 組`; });

    /* 給畫面列點用：哪些要改（改成什麼＋為什麼）、哪些維持（為什麼不用動） */
    const changes = [
        ...focus.map((t) => ({ tag: t, to: '重點', why: reasons[t] })),
        ...boosts.map((t) => ({ tag: t, to: '加強', why: reasons[t] })),
    ];
    const keeps = [
        ...BIG.filter((t) => !focus.includes(t)).map((t) => ({ tag: t, why: reasons[t] || `上一季每週 ${perWeek(t)} 組，量夠了` })),
        ...ACC.filter((t) => !boosts.includes(t)).map((t) => ({ tag: t, why: `上一季每週 ${perWeek(t)} 組，照常練到` })),
    ];

    return {
        focus, boosts, reasons, rotatedOut, changes, keeps, basedOn: hasRecords ? 'records' : 'plan',
        perWeek: Object.fromEntries(Object.keys(TAG_MUSCLES).map((t) => [t, perWeek(t)])),
        label: (t) => TAG_ZH[t] || t,
    };
}

export default buildNextSeasonPlan;

/* ════ 換季前後差在哪：直接比對「舊課表 vs 新課表」═══════════════════════════════
   預告清單與套用後的「改了什麼」都用這一支 —— 比的是真的要寫進去的那份課表，
   所以強度調整、加組、個人化、每週組數上限……不管哪一步改的，都會列出來，不會漏。
   同一個動作四週都改一樣的，只列一次（取第一個非減量週）。 */
const numOr = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const wOf = (ex) => numOr(ex?.suggestedWeight ?? ex?.weight ?? ex?.targetWeight ?? ex?.load);
export function diffSeasonPlans(oldPlan, newPlan, personal = []) {
    const rows = [];
    const seen = new Set();
    const why = {}, lastLoad = {};
    (personal || []).forEach((c) => {
        if (c?.name && !why[c.name]) why[c.name] = c.why;
        if ((c?.kind === 'load' || c?.kind === 'rx') && Number.isFinite(c.from)) lastLoad[c.name] = c.from;
    });
    const ow = oldPlan?.weeks || [], nw = newPlan?.weeks || [];
    nw.forEach((w, wi) => {
        if (isDeload(w)) return;
        (w.days || []).forEach((d, di) => (d.exercises || []).forEach((ex, ei) => {
            if (ex?.isWarmup) return;
            const o = ow[wi]?.days?.[di]?.exercises?.[ei];
            if (!o) return;
            const key = o.name;
            if (seen.has(key)) return;
            const parts = [];
            let kind = null;
            if (o.name !== ex.name) { kind = 'swap'; parts.push({ label: '換成', from: o.name, to: ex.name }); }
            const os = parseInt(o.sets, 10) || 0, ns = parseInt(ex.sets, 10) || 0;
            if (os && ns && os !== ns) { kind = kind || (ns > os ? 'more' : 'less'); parts.push({ label: '組數', from: `${os} 組`, to: `${ns} 組` }); }
            if (String(o.reps ?? '') !== String(ex.reps ?? '') && ex.reps != null) { kind = kind || 'reps'; parts.push({ label: '次數', from: `${o.reps} 下`, to: `${ex.reps} 下` }); }
            const owt = wOf(o) ?? lastLoad[o.name] ?? null, nwt = wOf(ex);
            if (nwt != null && owt !== nwt) { kind = kind || (owt == null || nwt > owt ? 'more' : 'less'); parts.push({ label: '重量', from: owt != null ? `${owt} kg` : '—', to: `${nwt} kg` }); }
            const restTxt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? `${n} 秒` : String(v); };
            if (ex.rest != null && o.rest != null && restTxt(o.rest) !== restTxt(ex.rest)) { parts.push({ label: '休息', from: restTxt(o.rest), to: restTxt(ex.rest) }); kind = kind || 'rest'; }
            if (!parts.length) return;
            seen.add(key);
            rows.push({ name: o.name, newName: ex.name, kind, parts, why: why[o.name] || why[ex.name] || null });
        }));
    });
    return rows;
}

/** 一條差異的短句：「槓鈴臥推 3→4 組」「深蹲 60→62.5 kg」「腿推 → 哈克深蹲」 */
export function diffRowText(r) {
    const p = r.parts.find((x) => x.label === '換成');
    if (p) return `${r.name} → ${r.newName}`;
    const main = r.parts[0];
    return `${r.name} ${String(main.from).replace(/ (組|下|kg)$/, '')}→${main.to}`;
}

/* ════ 這一季到底練得怎樣：只用真實紀錄（S1、S9）══════════════════════════════════
   收官畫面的完成率、訓練量成長、力量趨勢、換季決策都讀這一支。
   ⚠️ 以前收官頁：一堂都沒練 → 完成率顯示 100%（「沒紀錄就當全做完」）；
      「訓練量 +4.5%」是拿完成率乘出來的假數字；InBody 沒量過就模擬一筆
      「肌肉 +0.6 kg」，還拿它決定「身體有進步 → 加量」。
   沒有的資料一律 null，畫面就不顯示那一項。 */
const tsOf = (r) => new Date(r?.timestamp || r?.date || 0).getTime();

/**
 * @param {object} plan
 * @param {Array}  records       訓練紀錄（trainingRecords 的值）
 * @param {object} opts { sinceMs, untilMs, completedSessions, plannedSessions, prevTonnage }
 *   completedSessions／plannedSessions：課表打勾的堂數（strengthPlanCompletion）；沒給就用紀錄筆數
 *   prevTonnage：上一季每堂總量（plan._seasonHistory 最後一筆的 tonnage）
 * @returns {{ sessions, planned, adherencePct, e1rmDeltaPct, readyPct, tonnagePerSession, volumeDeltaPct, lastSessionMs, hasData }}
 */
export function measureSeason(plan, records = [], { sinceMs = 0, untilMs = Infinity, completedSessions = null, plannedSessions = null, prevTonnage = null } = {}) {
    const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
    const planned = plannedSessions != null ? Number(plannedSessions) || 0
        : weeks.reduce((n, w) => n + (w.days || []).filter((d) => d.exercises?.length > 0).length, 0);
    const recs = (Array.isArray(records) ? records : [])
        .filter((r) => { const t = tsOf(r); return Number.isFinite(t) && t >= sinceMs && t <= untilMs; })
        .sort((a, b) => tsOf(a) - tsOf(b));
    const done = completedSessions != null ? Number(completedSessions) || 0 : recs.length;
    const sessions = planned > 0 ? Math.min(done, planned) : done;
    const adherencePct = planned > 0 ? Math.round((sessions / planned) * 100) : null;
    // 力量趨勢：每個動作季內前半 vs 後半（analyzeSeasonExercises，不含減量週、≥3 次才算）→ 取中位數
    const stats = recs.length ? analyzeSeasonExercises(plan, recs, sinceMs) : {};
    const measuredEx = Object.values(stats).filter((x) => x.done >= 2);
    const trends = measuredEx.map((x) => x.trendPct).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const e1rmDeltaPct = trends.length ? Math.round(trends[Math.floor(trends.length / 2)] * 10) / 10 : null;
    // 雙重漸進：次數已經做到區間上限的動作佔幾成（≥ 一半 = 這一季在進步，可以往上加）
    const readyPct = measuredEx.length ? Math.round((measuredEx.filter((x) => x.topHit >= 0.6).length / measuredEx.length) * 100) : null;
    /* 訓練量：這一季每堂（不含減量週）的總量 vs 上一季。
       季內前後比沒有意義 —— 課表本身是週期化的（Peak 週次數少、組數不同），量本來就會變。
       第一季、或上一季沒紀錄 → null，畫面就不顯示。 */
    const weekOf = (t) => Math.floor((t - sinceMs) / (7 * 86400000));
    const loadRecs = recs.filter((r) => !(sinceMs > 0 && isDeload(weeks[weekOf(tsOf(r))])));
    const tonnage = loadRecs.map((r) => (r.exercises || []).reduce((sum, e) => sum + (Array.isArray(e?.sets) ? e.sets : [])
        .filter((x) => x && x.completed !== false)
        .reduce((a, x) => a + (parseFloat(x.weight) || 0) * (parseInt(x.reps, 10) || 0), 0), 0)).filter((v) => v > 0);
    const tonnagePerSession = tonnage.length ? Math.round(tonnage.reduce((a, b) => a + b, 0) / tonnage.length) : null;
    const prev = Number(prevTonnage) || null;
    const volumeDeltaPct = prev && tonnagePerSession ? Math.round(((tonnagePerSession - prev) / prev) * 1000) / 10 : null;
    const lastSessionMs = recs.length ? tsOf(recs[recs.length - 1]) : null;
    return { sessions, planned, adherencePct, e1rmDeltaPct, readyPct, tonnagePerSession, volumeDeltaPct, lastSessionMs, hasData: sessions > 0 };
}

/** 距離最後一次訓練幾天（所有紀錄，不限這一季；沒有任何紀錄 → null） */
export function daysSinceLastSession(records = [], nowMs = Date.now()) {
    let last = null;
    (Array.isArray(records) ? records : []).forEach((r) => { const t = tsOf(r); if (Number.isFinite(t) && t <= nowMs && (last == null || t > last)) last = t; });
    return last == null ? null : Math.max(0, (nowMs - last) / 86400000);
}

/** 換季時寫進 plan._seasonHistory 的一筆：下一季拿來判斷「是不是連兩季沒進步」 */
export const seasonHistoryEntry = (season, m) => ({
    season: Number(season) || 1, adherencePct: m?.adherencePct ?? null,
    e1rmDeltaPct: m?.e1rmDeltaPct ?? null, readyPct: m?.readyPct ?? null,
    volumeDeltaPct: m?.volumeDeltaPct ?? null, tonnage: m?.tonnagePerSession ?? null,
});
/** 換部位重排：舊計劃的換季歷史接到新計劃上（這一季標成「以重排結束」—— 新課表練第一季不能就被判「連兩季卡住」） */
export const redesignSeasonHistory = (plan, measured, season) => [
    ...(Array.isArray(plan?._seasonHistory) ? plan._seasonHistory : []),
    { ...seasonHistoryEntry(season ?? plan?.season ?? 1, measured), endedBy: 'redesign' },
].slice(-8);

/** 上一季每堂總量（給 measureSeason 的 prevTonnage） */
export const prevSeasonTonnage = (plan) => {
    const h = Array.isArray(plan?._seasonHistory) ? plan._seasonHistory : [];
    return h.length ? h[h.length - 1].tonnage ?? null : null;
};

/** S3 平台期：連續兩季都「有照課表練（≥75%）」而且力量、訓練量都沒長。
 *  兩個指標至少要有一個量得到（12 下以上的組估不出 1RM，就只看訓練量）；都沒有 → 不判，null 不算沒進步。 */
export function seasonPlateau(history = [], current = null) {
    const flat = (m) => m && (m.adherencePct ?? 0) >= ROTATION.GOOD_ADHERENCE
        && (m.e1rmDeltaPct != null || m.volumeDeltaPct != null)
        && (m.e1rmDeltaPct == null || m.e1rmDeltaPct < ROTATION.PROGRESS_E1RM_PCT)
        && (m.e1rmDeltaPct != null || m.volumeDeltaPct < ROTATION.PROGRESS_VOLUME_PCT)
        && (m.readyPct == null || m.readyPct < ROTATION.READY_PCT);
    const prev = (Array.isArray(history) ? history : []).slice(-1)[0];
    if (prev?.endedBy === 'redesign') return false;   // 上一季之後換了一份新課表：新課表才練一季，不算連兩季
    return !!(flat(current) && flat(prev));
}

/**
 * 換季決策（S1–S3）：建議走哪條路、強度往哪調。收官畫面的「建議」與稽核用同一支。
 * @param {object} m
 *   adherencePct, sessions      這一季的完成率與堂數（measureSeason）
 *   rpeWeekly                   每週 RPE 狀態 [{status:'under'|'on_target'|'over'|'no_data'}]（rpeHistoryReader.getCycleRPESummary）
 *   plateau                     平台期（seasonPlateau 或 e1rmAdvisor.detectPlateau）
 *   e1rmDeltaPct, volumeDeltaPct
 *   body                        { muscle, bodyFat } —— 只能是真的量過的 InBody，模擬的不准傳
 *   daysOff                     距離最後一次訓練幾天
 *   canProgress, canShiftUp, canShiftDown
 * @returns {{ recommend:'keep'|'intensity'|'progress'|'redesign', intensityDir:'up'|'down'|'maintain', progressed:boolean, plateau:boolean, reason:string, hold:boolean }}
 */
export function decideSeason(m = {}) {
    const adh = m.adherencePct;
    const weekly = Array.isArray(m.rpeWeekly) ? m.rpeWeekly : [];
    const over = weekly.filter((w) => w?.status === 'over').length;
    const under = weekly.filter((w) => w?.status === 'under').length;
    const det = strengthDetraining(m.daysOff);
    const muscleUp = m.body?.muscle != null && m.body.muscle >= 0.3;
    const fatDown = m.body?.bodyFat != null && m.body.bodyFat <= -0.3;
    // 訓練量（跨季每堂總量）受「哪幾天有練」影響很大，只在量不到力量趨勢時才拿來判斷
    const perfUp = (m.e1rmDeltaPct != null && m.e1rmDeltaPct >= ROTATION.PROGRESS_E1RM_PCT)
        || (m.readyPct != null && m.readyPct >= ROTATION.READY_PCT)
        || (m.e1rmDeltaPct == null && m.volumeDeltaPct != null && m.volumeDeltaPct >= ROTATION.PROGRESS_VOLUME_PCT);
    const adherent = adh != null && adh >= ROTATION.GOOD_ADHERENCE;
    // 有照練、表現卻往下掉（力量 −2.5% 以上；量不到力量時看每堂訓練量比上一季 −5% 以上）：不是加量的時候
    const regressing = adherent && (m.e1rmDeltaPct != null ? m.e1rmDeltaPct <= -2.5 : (m.volumeDeltaPct != null && m.volumeDeltaPct <= -5));
    const progressed = adherent && (perfUp || muscleUp || fatDown);
    const plateau = !!m.plateau && adherent && !progressed;
    /* hold：這一季不准往上加負荷（S2）—— 沒練／停練回來／太吃力／完成率不到一半。
       逐動作個人化與 e1RM 負重處方都只能持平或往下。 */
    const out = (recommend, intensityDir, reason) => ({ recommend, intensityDir, progressed, plateau, reason,
        hold: ['no_data', 'returning', 'too_hard', 'low_adherence', 'regressing'].includes(reason) });
    // ① 沒練、或停練一個月以上：照原本的課表回來（重量與組數由停練規則先退）
    if (!m.sessions || adh == null) return out('keep', 'maintain', 'no_data');
    if (det.dropSet) return out('keep', 'maintain', 'returning');
    // ② 太吃力：不管完成率，先降（降到底了才換一份）
    if (over >= 2 && over > under) return out(m.canShiftDown ? 'intensity' : 'redesign', 'down', 'too_hard');
    // ③ 完成率不到一半：重複這一季，什麼都不加 —— 問題是時間不是刺激
    if (adh < ROTATION.LOW_ADHERENCE) return out('keep', 'maintain', 'low_adherence');
    // ③-b 表現往下掉：先持平（不加重量、不加組），下一季再看；不是因為卡住所以不換刺激
    if (regressing && !progressed) return out('keep', 'maintain', 'regressing');
    const dirUp = under >= 2 && under > over && adherent;
    // ④ 有照練、強度也夠（RPE 不是偏低）卻連兩季沒進步：換刺激。
    //    RPE 偏低又沒進步不是卡住，是練太輕 → 交給 ⑥ 加強度
    if (plateau && !dirUp) return out('redesign', 'maintain', 'plateau');
    // ⑤ 有進步：加量（加不上去就交給逐動作加重量）
    if (progressed) {
        if (m.canProgress) return out('progress', dirUp ? 'up' : 'maintain', 'progressed');
        // 組數加不上去了 → 加一級強度；強度也到頂 → 這份課表能加的都加了，換一份新的（更難的變化式／新分化）
        if (m.canShiftUp) return out('intensity', 'up', 'progressed');
        return out('redesign', 'maintain', 'maxed');
    }
    // ⑥ 太輕鬆
    if (dirUp) {
        if (m.canShiftUp) return out('intensity', 'up', 'too_easy');
        if (m.canProgress) return out('progress', 'up', 'too_easy');
    }
    return out('keep', 'maintain', adherent ? 'steady' : 'partial');
}

/**
 * 換季的唯一入口（S9、S10）：預告畫面跟按下確認都呼叫這一支，寫進去的就是畫面上那一份。
 *   · 季數從課表本身算（plan.season），同一份課表再算一次得到一模一樣的結果 —— 不會一次跳兩季
 *   · 起始日換成今天、這一季的量化結果寫進 _seasonHistory（下一季判斷平台期用）
 * @returns {{ plan, rows, personal, changes, season, daysOff }}
 */
export function rotateStrengthSeason(plan, {
    picks = [], dir = 'maintain', records = [], sinceMs = 0, nowMs = Date.now(), todayKey = null,
    withPersonal = true, loadTable = null, swapChoices = {}, isBlocked = null, gymMissing = null,
    homeGymName = null, label = '', currentSeason = 1, measured = null, hold = false,
} = {}) {
    const season = Math.max(Number(plan?.season) || 1, Number(currentSeason) || 1) + 1;
    const daysOff = daysSinceLastSession(records, nowMs) ?? 0;
    const r = buildNextSeasonPlan(plan, (picks || []).filter((x) => x !== 'personal'), dir, {
        records: withPersonal ? records : null, sinceMs, isBlocked, gymMissing, homeGymName, daysOff, loadTable, hold,
    });
    const p = applySwapChoices(r.plan, plan, swapChoices);
    p.season = season;
    if (todayKey) p.startDate = todayKey;
    if (measured) p._seasonHistory = [...(Array.isArray(plan?._seasonHistory) ? plan._seasonHistory : []), seasonHistoryEntry(season - 1, measured)].slice(-8);
    const rows = diffSeasonPlans(plan, p, r.personal);
    p._seasonApplied = { season, label, at: nowMs, homeGymName: homeGymName || null,
        rows: rows.map((x) => ({ name: x.name, newName: x.newName, parts: x.parts, why: x.why })) };
    return { plan: p, rows, personal: r.personal, changes: r.changes, season, daysOff };
}

/* ════ 換季預告裡，使用者自己挑要換成哪個動作 ═════════════════════════════════
   swapChoices：{ 原本的動作名: 要換成的動作（引擎格式或動作庫格式）| null（不換，保留原本的） }
   直接改「真的會寫進去的那份課表」—— 預告清單跟套用後的課表都跟著變。 */
const SWAP_IDENTITY = ['name', 'nameEn', 'zone', 'muscle', 'cat', 'tier', 'cns', 'diff', 'eq', 'time'];
export function applySwapChoices(newPlan, oldPlan, swapChoices = {}) {
    const entries = Object.entries(swapChoices || {});
    if (!entries.length || !newPlan?.weeks) return newPlan;
    const p = JSON.parse(JSON.stringify(newPlan));
    const allOld = (oldPlan?.weeks || []).flatMap((w) => w.days || []).flatMap((d) => d.exercises || []);
    entries.forEach(([from, choice]) => {
        const orig = allOld.find((e) => e.name === from);
        let target = choice ? (lookupEngineExercise(choice.nameEn || choice.name) || choice) : orig;
        if (!target) return;
        const ident = Object.fromEntries(SWAP_IDENTITY.filter((k) => target[k] !== undefined).map((k) => [k, target[k]]));
        let autoName = null;
        p.weeks.forEach((w) => w.days?.forEach((d) => {
            d.exercises = (d.exercises || []).map((ex) => {
                const isThis = ex._swappedFrom === from || (!ex._swappedFrom && ex.name === from);
                if (!isThis) return ex;
                if (ex._swappedFrom) autoName = autoName || ex.name;
                const next = { ...ex, ...ident };
                delete next.suggestedWeight; delete next.suggestedWeightEach; delete next.note;
                delete next.gymOrig; delete next.gymSwappedFrom;   // 換季選的動作取代課表本身，健身房換過的標記作廢
                if (choice) next._swappedFrom = from; else delete next._swappedFrom;
                return next;
            });
        }));
        // 原始快照也跟著換，下一季的強度等級才對得到名字
        (p._originalSnapshot || []).forEach((w) => w.days?.forEach((d) => {
            d.exercises = (d.exercises || []).map((ex) => (ex.name === (autoName || from) ? { ...ex, ...ident } : ex));
        }));
    });
    return p;
}

/** 換季預告的「換別的」清單：跟換季用同一支推薦（同器材範圍、健身房沒有的器材不推） */
export function swapOptionsFor(oldPlan, fromName, { equipment, level, injuries, isBlocked, limit = 4, current } = {}) {
    const allOld = (oldPlan?.weeks || []).flatMap((w) => w.days || []).flatMap((d) => d.exercises || []);
    const orig = allOld.find((e) => e.name === fromName);
    if (!orig) return [];
    const names = allOld.flatMap((e) => [e.name, e.nameEn]).filter(Boolean);
    return recommendAlternatives(orig, {
        level: level || String(oldPlan.user_level || 'beginner').toLowerCase(),
        equipment: equipment || oldPlan.equipment_preference || 'mixed',
        injuries: injuries || oldPlan.injuries || [],
        exclude: names.filter((n) => n !== current),
        easier: true, limit, isBlocked,
    });
}
