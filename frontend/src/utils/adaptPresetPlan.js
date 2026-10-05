// ════════════════════════════════════════════════════════════════
//  adaptPresetPlan.js — 單一 preset 計劃「依設定即時改編」(不進融合引擎)
//
//  單肌群專項計劃的預覽改編器。只在「該計劃自己的策展動作池」內運作，
//  讓 難度 / 風格(健美·健力) / 天數 即時生效，且絕不洩漏到其他部位。
//
//  規則（依使用者規格）：
//   • 每日動作數上限：新手 3 / 中階 4 / 精熟 5
//   • 動作優先序：複合先行（tier 小、非孤立優先）；超出上限的孤立動作被裁掉
//   • 新手「只做核心負荷動作」：優先保留複合(非孤立)動作；且新手強制健美(不可健力)
//   • 風格：健力→主項(T1)3–5下/180秒、次要(T2)5–8下/150秒；孤立(T3)維持高次數
//   • 天數：以該週日模板循環產生 N 天
//   • variationSeed(>0)：「重新生成」時，在該計劃動作池內換一批（同部位、不洩漏）
//   • 裁切若拆散超級組 → 落單者降級為獨立動作（避免孤兒）
// ════════════════════════════════════════════════════════════════
import { analyzeExercise } from '../data/globalExerciseRegistry';

const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 };
const MAX_BY_LEVEL = { beginner: 3, intermediate: 4, advanced: 5 };

// 孤立(單關節)力學模式 — 用於「複合先行」排序與新手核心負荷篩選
const ISO_PATTERNS = new Set([
    'fly', 'lateral_raise', 'glute_abduction', 'quad_iso', 'ham_iso', 'calf_iso',
    'bicep_curl', 'bicep_curl_hammer', 'tricep_ext', 'delt_rear_iso', 'lat_stretch',
    'rotation', 'anti_extension', 'core_stability', 'rear_delt',
]);

const stableHash = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h >>> 0;
};

const resolveLevel = (plan, requested) => {
    const avail = Object.keys(plan.levels || {});
    if (!avail.length) return null;
    if (requested && plan.levels[requested]) return requested;
    const reqR = LEVEL_RANK[requested] ?? 1;
    const sorted = avail.slice().sort((a, b) => (LEVEL_RANK[a] ?? 0) - (LEVEL_RANK[b] ?? 0));
    const notAbove = sorted.filter(l => (LEVEL_RANK[l] ?? 0) <= reqR);
    return notAbove.length ? notAbove[notAbove.length - 1] : sorted[0];
};

const exMeta = (e) => {
    const tier = e.tier ?? 3;
    let pattern;
    try { pattern = analyzeExercise(e).pattern; } catch { pattern = undefined; }
    const iso = ISO_PATTERNS.has(pattern) ? 1 : 0;
    return { tier, iso };
};

export const adaptPresetPlan = (base, requestedLevel, opts = {}) => {
    if (!base?.levels) return base;
    const { style = 'bodybuilding', daysPerWeek, variationSeed = 0 } = opts;
    const levelKey = resolveLevel(base, requestedLevel);
    if (!levelKey) return base;
    const lv = base.levels[levelKey];
    const weeks = lv.weeks || [];
    if (!weeks.length) return base;

    const cap = MAX_BY_LEVEL[levelKey] ?? 4;
    const isBeginner = levelKey === 'beginner';
    const effStyle = isBeginner ? 'bodybuilding' : style; // 新手不可健力

    // 該等級策展動作池(跨日去重)，供 variationSeed 換動作
    const pool = [];
    const seenPool = new Set();
    weeks.forEach(w => (w.days || []).forEach(d => (d.exercises || []).forEach(e => {
        if (!seenPool.has(e.name)) { seenPool.add(e.name); pool.push(e); }
    })));

    // 依設定改寫單一動作的次數/休息（容量由動作數上限控制，不再用 intensity 調組數）
    const transformEx = (e) => {
        const tier = e.tier ?? 3;
        let reps = e.reps, rest = e.rest;
        if (effStyle === 'powerlifting' && !e.superset && !e.supersetGroup) {
            if (tier === 1) { reps = '3-5'; rest = 180; }
            else if (tier === 2) { reps = '5-8'; rest = 150; }
            // T3 孤立維持原本高次數
        }
        // 🔧 顯示「訓練的細節部位」：用策展的 target 補上 targetLabel(原本只有融合引擎會帶)
        const targetLabel = e.targetLabel || e.target;
        return { ...e, reps, rest, ...(targetLabel ? { targetLabel } : {}) };
    };

    // 從來源動作清單挑出「複合先行、數量 ≤ cap」的當日動作
    const pickForDay = (srcExs, wIdx, dayIdx) => {
        // 去重
        const uniq = []; const seen = new Set();
        srcExs.forEach(e => { if (!seen.has(e.name)) { seen.add(e.name); uniq.push(e); } });
        // 排序：tier 小先、複合先於孤立、(變化模式)同分用 seed 打散
        const ranked = uniq.map(e => {
            const m = exMeta(e);
            return { e, key: m.tier * 10 + m.iso * 3, h: stableHash(e.name + '|' + variationSeed + '|' + wIdx + '|' + dayIdx) };
        }).sort((a, b) => (a.key - b.key) || (a.h - b.h));
        let list = ranked;
        // 新手只做核心負荷：優先保留非孤立動作（足夠時整批排除孤立）
        if (isBeginner) {
            const comp = ranked.filter(r => exMeta(r.e).iso === 0);
            if (comp.length >= Math.min(cap, 2)) list = comp;
        }
        let picked = list.slice(0, cap).map(r => r.e);
        // 維持「複合在前」的展示順序
        picked = picked.slice().sort((a, b) => (a.tier ?? 3) - (b.tier ?? 3));
        // 超級組收斂：被裁到只剩 1 員的群組 → 降級為獨立動作
        const gCount = {};
        picked.forEach(e => { if (e.supersetGroup) gCount[e.supersetGroup] = (gCount[e.supersetGroup] || 0) + 1; });
        picked = picked.map(e => {
            if (e.supersetGroup && gCount[e.supersetGroup] < 2) {
                const { supersetGroup, superset, ...rest } = e;
                return { ...rest, rest: rest.rest === 0 || rest.rest === '0s' ? 90 : rest.rest };
            }
            return e;
        });
        return picked.map(transformEx);
    };

    const days = daysPerWeek || lv.recommendedDays || weeks[0].days?.length || 3;
    const adaptedWeeks = weeks.map((w, wIdx) => {
        const templates = w.days || [];
        if (!templates.length) return w;
        const newDays = Array.from({ length: days }, (_, i) => {
            const tpl = templates[i % templates.length];
            const srcExs = variationSeed > 0 ? pool : (tpl.exercises || []);
            return { ...tpl, dayNumber: i + 1, exercises: pickForDay(srcExs, wIdx, i) };
        });
        return { ...w, days: newDays };
    });

    return {
        ...base,
        levels: { [levelKey]: { ...lv, recommendedDays: days, weeks: adaptedWeeks } },
    };
};

export default adaptPresetPlan;
