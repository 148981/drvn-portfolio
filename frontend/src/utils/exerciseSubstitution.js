/**
 * exerciseSubstitution.js — 替代動作：哪些真的能換，以及該先推薦誰。
 * ══════════════════════════════════════════════════════════════════════
 * 舊版的做法是「同 muscle 就列出來，依 tier 排序」，於是：
 *   · 引體向上 的替代清單裡出現「硬舉」「背部伸展」（同 muscle=back，但一個是拉、
 *     一個是髖鉸鏈、一個是脊椎伸展 —— 換了根本不是同一件事）
 *   · 側平舉 的替代清單第 3 名是「槓鈴肩推」（面板寫「換了保留你的組數」，
 *     於是你會拿 4×12-15 去做槓鈴肩推）
 *   · 資料庫查不到的自訂動作 → 一口氣列出全部位的 Tier 1 複合動作，
 *     深蹲跟臥推互為替代
 * 這一版改成兩件事決定候選資格，一件事決定順序：
 *
 *   資格① 同動作模式 —— 真的在做同一件事，才叫替代（硬舉↔羅馬尼亞硬舉 可以，
 *         引體向上↔硬舉 不行）。這是主要來源。
 *   資格② 同部位、不同模式 —— 只有在①湊不滿時才補，而且一定排在①後面，
 *         標籤也誠實寫「同部位換刺激」，不會假裝它是等價動作。
 *   排序   你自己練得多的 > 健身房常有的 > 訓練效果接近的。
 *
 * 「你練得多」讀的是真實訓練紀錄（trainingRecords），沒有紀錄就是 0，
 * 不會憑空生一個偏好出來 —— 新使用者的排序自然就由「健身房常有的」決定。
 * ══════════════════════════════════════════════════════════════════════
 */
import { ALL_EXERCISES } from './UnifiedTrainingEngine';
import {
    defOfExercise, patternOfExercise, muscleOfExercise, toMacroMuscle,
    gymAvailability, equipmentZh, loadClassOf, PATTERN_ZH,
} from './exerciseTaxonomy';
import { uStorage } from './userStorage';
import { stationOf } from './gymStations';

// 只看最近這段時間的紀錄：半年前練過但現在不碰的動作，不該排在前面
export const FAMILIARITY_WINDOW_DAYS = 120;

// 排序權重：使用者自己的習慣最重、其次是換過去感覺接不接得上、最後是器材普及度。
// ⚠️ 接近度一開始只給 0.15，結果徒手動作（普及度滿分）把所有槓鈴候選壓在後面：
//    槓鈴臥推的第一順位變成伏地挺身、槓鈴深蹲變成徒手後弓步。
//    換器材是替代，砍掉一半強度不是替代。
const W_FAMILIAR = 0.42;
const W_CLOSENESS = 0.35;
const W_AVAILABLE = 0.23;
// 指定健身房時：在這間用過的器材往前排（utils/gymMemory.gymProfile）
const W_GYM = 0.3;

// ①同模式與②同部位分成兩段，②永遠排在①後面。只有①不足這個數才補②。
const MIN_TRUE_SUBSTITUTES = 4;

/**
 * 讀使用者真實練過的組數（動作名 → 組數）。
 * 沒有紀錄回傳空物件 —— 那代表「還不知道你習慣什麼」，不是 0 偏好。
 */
export function readExerciseFamiliarity(userId) {
    const out = {};
    try {
        const records = uStorage(userId).get('trainingRecords', {}) || {};
        const cutoff = Date.now() - FAMILIARITY_WINDOW_DAYS * 86400000;
        Object.values(records).forEach((r) => {
            const t = new Date(r?.timestamp || r?.date || 0).getTime();
            if (!Number.isFinite(t) || t < cutoff) return;
            (Array.isArray(r?.exercises) ? r.exercises : []).forEach((ex) => {
                const def = defOfExercise(ex?.name);
                if (!def) return;
                const counted = Number(ex?.setsCount);
                const n = Number.isFinite(counted) && counted > 0
                    ? counted
                    : (Array.isArray(ex?.sets) ? ex.sets.filter((s) => s?.completed).length : 0);
                if (n > 0) out[def.name] = (out[def.name] || 0) + n;
            });
        });
    } catch { /* 讀不到歷史 → 沒有熟悉度，排序改由器材普及度決定 */ }
    return out;
}

/* 訓練效果接近程度。四個差距，權重刻意排成這個順序：
     負重等級 26 —— 槓鈴換徒手是砍強度，不是換器材，扣最重
     tier      12 —— 同一個動作模式已經保證「在做同一件事」，主副之分不必扣太兇
                     （原本扣 20，會讓哈克機贏過腿推：哈克機同 tier，但四成健身房沒有）
     cat       14 —— 複合換孤立，訓練意義會變
     zone      10 —— 平臥推優先換平的（機械胸推／啞鈴臥推），不是上斜 */
const closeness = (a, b) => {
    const tierGap = Math.abs((a.tier || 3) - (b.tier || 3));
    const catGap = (a.cat || '') === (b.cat || '') ? 0 : 1;
    const loadGap = loadClassOf(a) === loadClassOf(b) ? 0 : 1;
    const zoneGap = (a.zone || '') === (b.zone || '') ? 0 : 1;
    return Math.max(0, 100 - tierGap * 12 - catGap * 14 - loadGap * 26 - zoneGap * 10);
};

/**
 * 取得一個動作的替代清單（已排序）。
 * @param {string|object} exercise  課表裡的動作（中英文名皆可，或整個動作物件）
 * @param {object}  opts
 * @param {string}  opts.userId
 * @param {number}  opts.limit     最多幾個（預設 10）
 * @param {object}  [opts.gym]     { missing:Set<stationId>, used:{'部位:stationId':組數} } —— 這間沒有的器材不列，常用的往前排
 * @returns {Array<{name, nameZh, eq, eqZh, tier, cat, pattern, patternZh,
 *                  matchKind:'pattern'|'muscle', reason, familiarSets}>}
 *          查不到這個動作的定義時回傳空陣列 —— 寧可說「沒有」，也不要亂塞。
 */
export function getSubstitutes(exercise, { userId, limit = 10, gym = null } = {}) {
    const rawName = typeof exercise === 'string' ? exercise : exercise?.name;
    const current = defOfExercise(rawName);
    if (!current) return [];

    const pattern = patternOfExercise(current.name);
    const macro = muscleOfExercise(current.name);
    const familiarity = readExerciseFamiliarity(userId);

    const isSelf = (ex) => ex.name === current.name;
    // 矯正／活動度動作不拿來當一般動作的替代（反過來也是）
    const sameKind = (ex) => (ex.cat === 'corrective') === (current.cat === 'corrective');

    /* 矯正動作（鳥狗式／死蟲式／肩外旋…）不能當一般動作的替代，反過來也不行。
       這一條要同時套在同模式與同部位兩段上 —— 只套在補位那一段的話，
       平板支撐的替代第一名會是鳥狗式（同屬抗伸展模式），那是恢復日的東西。 */
    const tierPattern = pattern
        ? ALL_EXERCISES.filter((ex) => !isSelf(ex) && sameKind(ex) && patternOfExercise(ex.name) === pattern)
        : [];

    let tierMuscle = [];
    if (tierPattern.length < MIN_TRUE_SUBSTITUTES && macro) {
        const taken = new Set(tierPattern.map((ex) => ex.name));
        /* 補位有一條硬底線：複合只能換複合、孤立只能換孤立。
           沒有這條線的話，側平舉（孤立）就會被補上槓鈴肩推（複合）——
           面板寫著「換了保留你的組數」，於是你會拿 4×12-15 去做槓鈴肩推。
           同部位不等於可以互換，強度性質也要一樣。 */
        tierMuscle = ALL_EXERCISES.filter((ex) =>
            !isSelf(ex) && !taken.has(ex.name) && sameKind(ex) &&
            ex.cat === current.cat &&
            toMacroMuscle(ex.muscle) === macro &&
            patternOfExercise(ex.name) !== 'mobility');
    }

    const gymMissing = gym?.missing instanceof Set ? gym.missing : new Set();
    const gymUsed = gym?.used || {};
    // 用過要看「同部位」：胸推用的啞鈴不代表這間的啞鈴適合拿來練腿
    const usedAt = (ex) => { const st = stationOf(ex.name); return st ? (gymUsed[`${st.macro}:${st.id}`] || 0) : 0; };
    const candidates = [
        ...tierPattern.map((ex) => ({ ex, matchKind: 'pattern' })),
        ...tierMuscle.map((ex) => ({ ex, matchKind: 'muscle' })),
    ].filter(({ ex }) => !gymMissing.has(stationOf(ex.name)?.id));   // 這間沒有的器材不列
    if (candidates.length === 0) return [];

    // 熟悉度換算成 0–100：跟「這批候選裡你練最多的那個」比，而不是跟全庫比 ——
    // 全庫最大值通常是臥推，拿臥推當分母會讓腿的候選全部趨近 0，等於沒有作用。
    const maxSets = candidates.reduce((m, c) => Math.max(m, familiarity[c.ex.name] || 0), 0);
    const maxUsed = gym ? candidates.reduce((m, c) => Math.max(m, usedAt(c.ex)), 0) : 0;

    const scored = candidates.map(({ ex, matchKind }) => {
        const sets = familiarity[ex.name] || 0;
        const famScore = maxSets > 0 ? (sets / maxSets) * 100 : 0;
        const availScore = gymAvailability(ex);
        const gymScore = maxUsed > 0 ? (usedAt(ex) / maxUsed) * 100 : 0;
        const score = W_FAMILIAR * famScore + W_AVAILABLE * availScore + W_CLOSENESS * closeness(current, ex)
            + W_GYM * gymScore;
        return { ex, matchKind, sets, score, gymSets: gym ? usedAt(ex) : 0 };
    });

    // 同模式整段排在同部位前面；段內才比分數
    scored.sort((a, b) => {
        if (a.matchKind !== b.matchKind) return a.matchKind === 'pattern' ? -1 : 1;
        return b.score - a.score;
    });

    return scored.slice(0, limit).map(({ ex, matchKind, sets, gymSets }) => {
        const p = patternOfExercise(ex.name);
        return {
            ...ex,
            eqZh: equipmentZh(ex.eq),
            pattern: p,
            patternZh: PATTERN_ZH[p] || null,
            matchKind,
            familiarSets: sets,
            /* 理由只講得出來的事實。器材普及度是排序用的權重，不當理由寫出來 ——
               它會在半數列上印出同一句「健身房最常見」，變成一排重複文案。
               排序規則寫在面板副標講一次就好。 */
            reason: gymSets > 0
                ? '這間常用'
                : sets > 0
                ? `你練過 ${sets} 組`
                : (matchKind === 'pattern' ? `同${PATTERN_ZH[p] || '動作'}` : '同部位換刺激'),
        };
    });
}

/** 面板副標：講清楚這份清單是怎麼排的，不要讓使用者猜。 */
export function substituteSubtitle(exercise, options) {
    const current = defOfExercise(typeof exercise === 'string' ? exercise : exercise?.name);
    const p = current ? patternOfExercise(current.name) : null;
    const zh = p ? PATTERN_ZH[p] : null;
    if (!options || options.length === 0) return '這個動作沒有可直接替換的選項';
    return zh ? `同${zh}動作優先，你常練的排前面` : '你常練的排前面，換了保留組數';
}
