// 🧑‍🏫 全組合教練稽核（plan-auditor 主稽核）：窮舉所有使用者「選得到」的組合，逐週逐天用教練標準檢查。
//   用法（在 frontend/ 底下）：
//     node scripts/audit_plans.mjs                 # 標準：等級×1–6天×環境×風格×全部 64 種部位子集×(無傷＋單一傷病)×(預設時長, 60 分)
//     node scripts/audit_plans.mjs --full          # 再加兩處傷病組合、時長 30/45/60/75/90
//     node scripts/audit_plans.mjs --quick         # 只跑 2–5 天（開發時快速回歸）
//     node scripts/audit_plans.mjs --show=10       # 每個問題代碼多印幾筆範例
//     node scripts/audit_plans.mjs --engine=/abs/path/UnifiedTrainingEngine.js   # 指定引擎（前後對照用）
//     node scripts/audit_plans.mjs --strict        # 連「僅 API」（沒有畫面選得出來）的組合有硬傷也算失敗
//   回傳碼：畫面選得到的組合有任何 ❌ 硬傷 → 1；只有 ⚠️ 警告、或硬傷只出現在「僅 API」組合 → 0（報表照樣列出）。
//
// 為什麼要有這支：verify_coach_plans 只跑 2–5 天、預設時長、單一傷病，而且不查「同部位被切開」、
// 「每天動作數」、「高 CNS 上限」、「每週都有選的部位」、「新手引體」—— 那些散在別的腳本、各跑一小撮組合，
// 於是「全部檢查都過」跟「課表沒問題」不是同一件事。這支把教練標準一次套在所有組合上。
//
// 組合來源（跟產品對齊）：
//   天數 1–6：訓練計劃設計器（不帶部位）與新手引導可以選 1–6 天，不受精靈的 2–5 限制
//   部位：精靈＝六個部位的子集（有加強部位上限）；新手引導＝七個部位（含臀部）任選 1–3；設計器＝空集合
//   報表依入口（精靈／新手引導／計劃設計器／計劃預覽／僅 API）分開列出有硬傷的份數
//   時長：精靈不傳（引擎依等級＋風格決定）；計劃預覽固定 60 分鐘；其他時長只在 --full
//   傷病：膝／下背／肩／腕／髖／踝（精靈的六個選項）
//
// 規則 —— 每一條對應 verify_coach_plans.mjs 開頭的教練標準與 scripts/PLAN_CHECK_STANDARD.md。
// 「❌ 硬傷」＝教練不會交給學生；「⚠️ 警告」＝輸入本身做不到（例：徒手＋傷病把動作池砍光、一週一天想練六個部位）。
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const FULL = process.argv.includes('--full');
const STRICT = process.argv.includes('--strict');   // 「僅 API」（沒有任何畫面選得出來的輸入）的硬傷也算失敗
const QUICK = process.argv.includes('--quick');
const SHOW = +arg('show', 3);
const ENGINE = arg('engine', 'src/utils/UnifiedTrainingEngine.js');

// ── 規則參數 ─────────────────────────────────────────
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const DAYS = QUICK ? [2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];
const EQUIPS = ['mixed', 'equipment', 'bodyweight'];
const STYLES = ['bodybuilding', 'strength'];
const T = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs'];
const INJ = ['knee', 'back', 'shoulder', 'wrist', 'hip', 'ankle'];
const DURATIONS = FULL ? [undefined, 30, 45, 60, 75, 90] : [undefined, 60];
const TAG_MUSCLES = { chest: ['chest'], back: ['back'], shoulders: ['shoulders'], arms: ['biceps', 'triceps'], core: ['core'], legs: ['quads', 'hamstrings', 'glutes'], glutes: ['glutes', 'hamstrings'] };
const ANY_OF = new Set(['legs', 'glutes']);   // 腿／臀：其中一個肌群有練到就算有
const LEGS = new Set(['quads', 'hamstrings', 'glutes', 'calves']);
const ARM = new Set(['biceps', 'triceps']);
const STRICT_PULLS = new Set(['Pull Ups', 'Chin Ups']);
const HINGE_EN = new Set(['45° Back Extension', 'Cable Pull Through', 'Good Morning', 'Deadlift', 'Romanian Deadlift', 'Dumbbell Romanian Deadlift', 'Single Leg Romanian Deadlift', 'Sumo Deadlift', 'Band Good Morning', 'Hyperextensions']);
const LOWER_FORBID = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
const FORBID = { PUSH: ['back', 'biceps'], PULL: ['chest', 'triceps'], 'UPPER A': ['back', 'biceps'], 'UPPER B': ['chest', 'triceps'], CHEST: ['back', 'biceps'], BACK: ['chest', 'triceps'], LEGS: LOWER_FORBID, LOWER: LOWER_FORBID, 'LOWER A': LOWER_FORBID, 'LOWER B': LOWER_FORBID, QUADS: LOWER_FORBID, GLUTES: LOWER_FORBID };

// 這組輸入是哪個畫面選得出來的（報表分開列，優先修使用者真的會碰到的）
function surfaceOf(c, getLevelCode) {
    const t = c.selectedHashtags, out = [];
    const focusN = t.filter(x => ['chest', 'back', 'legs'].includes(x)).length;
    const units = t.filter(x => !['chest', 'back', 'legs'].includes(x)).reduce((a, x) => a + (x === 'arms' && c.level === 'beginner' ? 2 : 1), 0);
    const boostCap = c.level !== 'beginner' ? (c.daysPerWeek <= 2 ? 1 : c.daysPerWeek === 3 ? 2 : 3) : Math.max(0, Math.min(3, c.daysPerWeek - focusN));
    const wizard = c.daysPerWeek >= 2 && c.daysPerWeek <= getLevelCode(c.level).maxDaysPerWeek && !t.includes('glutes') && focusN >= 1 && units <= boostCap;
    if (c.sessionDuration === undefined) {
        if (wizard) out.push('精靈');
        if (t.length >= 1 && t.length <= 3 && c.trainingStyle === 'bodybuilding' && c.equipment !== 'equipment') out.push('新手引導');
        if (!t.length) out.push('計劃設計器');
    }
    if (c.sessionDuration === 60 && wizard) out.push('計劃預覽');   // 預覽頁拿精靈的參數、固定 60 分鐘重算
    return out.length ? out : ['僅 API'];
}

function buildCombos() {
    // 精靈：六個部位的所有子集；新手引導：七個部位（多了臀部）任選 1–3 個 → 補上含臀部的 ≤3 子集
    const subsets = []; for (let m = 0; m < 128; m++) { const s = [...T, 'glutes'].filter((_, i) => m >> i & 1); if (!s.includes('glutes') || s.length <= 3) subsets.push(s); }
    const injSets = [[], ...INJ.map(i => [i])];
    if (FULL) for (let m = 1; m < 64; m++) { const s = INJ.filter((_, i) => m >> i & 1); if (s.length === 2) injSets.push(s); }
    const out = [];
    for (const level of LEVELS) for (const daysPerWeek of DAYS) for (const equipment of EQUIPS) for (const trainingStyle of STYLES)
        for (const tags of subsets) for (const injuries of injSets) for (const sessionDuration of DURATIONS)
            out.push({ level, daysPerWeek, equipment, trainingStyle, selectedHashtags: tags, injuries, sessionDuration });
    return out;
}

// ── 稽核一份課表 ─────────────────────────────────────
function auditPlan(E, AVOID, cfg, flag) {
    const { level, daysPerWeek: days, equipment, trainingStyle: style, selectedHashtags: tags, injuries, sessionDuration } = cfg;
    const law = E.getLevelCode(level);
    const avoid = new Set(injuries.flatMap(i => AVOID[i] || []));
    const constrained = injuries.length > 0 || equipment === 'bodyweight';   // 動作池被輸入砍過
    const defaultDur = law.sessionMins + (style === 'strength' ? 15 : 0);
    const shortTime = sessionDuration != null && sessionDuration < defaultDur;
    const sev = (hard) => (hard ? 'H' : 'W');
    // 某肌群在這組輸入下是否「還有動作可排」（傷病／環境／等級把整個部位封掉就不算漏）
    const feasible = (m) => E.ALL_EXERCISES.some(ex => ex.muscle === m && ex.tier !== 4 && !avoid.has(ex.name)
        && (equipment !== 'bodyweight' || ['bodyweight', 'band'].includes(ex.eq)) && E.passesLevelGate(ex, level, equipment));

    let p;
    try { p = E.generateUnifiedPlan(cfg); } catch (e) { flag('H', 'EXCEPTION', '', e.message); return; }
    if (!p?.weeks || p.weeks.length !== 4) { flag('H', 'STRUCT', '', `週數 ${p?.weeks?.length}`); return; }
    const totalSets = (wk) => wk.days.flatMap(d => d.exercises).filter(e => !e.isWarmup && e.tier !== 4).reduce((a, e) => a + (+e.sets || 0), 0);

    p.weeks.forEach((w, wi) => {
        const W = `W${wi + 1}${w.phase}`;
        if (w.days.length !== days) flag('H', 'STRUCT', W, `天數 ${w.days.length} ≠ ${days}`);
        const weekSets = {}; const hit = new Set();
        let prevExtreme = false;
        w.days.forEach((d, di) => {
            const at = `${W} D${di + 1}[${d.shortFocus}]`;
            const main = d.exercises.filter(e => !e.isWarmup && e.tier !== 4);
            const units = main.filter(e => !(e.supersetId && e.supersetOrder === 'B'));
            const seqStr = () => main.map(e => `${e.nameEn || e.name}(${e.muscle}/${e.cat[0]}${e.tier}${e.supersetId ? '/SS' + e.supersetOrder : ''}${e._maintenance ? '/維持' : ''})`).join(' → ');
            const sf = String(d.shortFocus || '').toUpperCase();
            main.forEach(e => { hit.add(e.muscle); weekSets[e.muscle] = (weekSets[e.muscle] || 0) + (+e.sets || 0); });

            // 結構／處方完整
            if (!main.length) flag('H', 'EMPTY_DAY', at, '');
            main.forEach(e => {
                if (!e.name) flag('H', 'NO_NAME', at, JSON.stringify(e).slice(0, 80));
                if (!(Number.isInteger(+e.sets) && +e.sets > 0) || !e.reps || e.rest == null) flag('H', 'PRESCRIPTION', at, e.nameEn);
            });
            // 同日重複動作／重複動作模式（同部位同區塊同類型；核心除外）
            const names = main.map(e => e.nameEn || e.name);
            if (new Set(names).size !== names.length) flag('H', 'DUP_EXERCISE', at, names.join(', '));
            const pats = main.filter(e => e.muscle !== 'core').map(e => `${e.muscle}|${e.zone}|${e.cat}`);
            if (new Set(pats).size !== pats.length) flag(sev(!constrained), 'DUP_PATTERN', at, seqStr());

            // ── 單堂順序 ──
            const nonCore = units.filter(e => e.muscle !== 'core');
            const armDay = nonCore.length > 0 && nonCore.every(e => ARM.has(e.muscle));
            const hasCompound = nonCore.some(e => e.cat === 'compound');
            if (nonCore.length && !armDay && hasCompound && nonCore[0].cat !== 'compound') flag('H', 'FIRST_COMPOUND', at, seqStr());
            if (nonCore.length && !armDay && !hasCompound) flag(sev(!constrained), 'NO_COMPOUND', at, seqStr());
            const coreIdx = units.findIndex(e => e.muscle === 'core');
            if (coreIdx >= 0 && units.slice(coreIdx).some(e => e.muscle !== 'core')) flag('H', 'CORE_NOT_LAST', at, seqStr());
            if (!armDay) {
                // 當天沒有胸背肩腿的複合時，手臂複合（雙槓撐體）就是主項、可以排第一（「先多關節」優先於「手臂放後面」）
                const bigC = nonCore.some(e => e.cat === 'compound' && !ARM.has(e.muscle));
                const firstArm = nonCore.findIndex(e => ARM.has(e.muscle) && (bigC || e.cat !== 'compound'));
                if (firstArm >= 0 && nonCore.slice(firstArm).some(e => !ARM.has(e.muscle))) flag('H', 'ARMS_BEFORE_BIG', at, seqStr());
            }
            const seenIso = {};
            let maxTier = 0;
            for (const e of nonCore) {
                if (e.cat === 'compound' && seenIso[e.muscle]) flag('H', 'ISO_BEFORE_COMPOUND', at, seqStr());
                if (e.cat === 'isolation') seenIso[e.muscle] = true;
                if ((e.tier || 3) === 1 && maxTier >= 3) flag('H', 'TIER1_AFTER_LIGHT', at, seqStr());
                maxTier = Math.max(maxTier, e.tier || 3);
            }
            // 群聚：同部位相鄰；唯一允許的拆法＝先做完複合再回頭補孤立（兩段、第一段全複合、第二段無重壓複合）
            const runs = {};
            units.forEach((e, i) => {
                if (e.muscle === 'core') return;
                const r = runs[e.muscle] ||= [];
                if (i > 0 && units[i - 1].muscle === e.muscle) r[r.length - 1].push(e); else r.push([e]);
            });
            for (const [m, r] of Object.entries(runs)) {
                if (r.length <= 1) continue;
                const ok = r.length === 2 && r[0].every(e => e.cat === 'compound') && !r[1].some(e => e.cat === 'compound' && (e.tier || 3) <= 2);
                if (!ok) flag('H', 'CLUSTER_SPLIT', at, `${m}：${seqStr()}`);
            }
            // 孤立先接最後一個複合的部位（RDL 後先腿彎舉；背動作中間不插後三角）
            const lastC = nonCore.map(e => e.cat).lastIndexOf('compound');
            if (lastC >= 0 && lastC + 1 < nonCore.length) {
                const lm = nonCore[lastC].muscle, nx = nonCore[lastC + 1];
                if (!ARM.has(lm) && nx.cat === 'isolation' && nx.muscle !== lm && nonCore.slice(lastC + 1).some(e => e.muscle === lm && e.cat === 'isolation')) flag('H', 'ISO_NOT_CONTINUING', at, seqStr());
            }
            // 分化純度
            const forb = new Set(FORBID[sf] || []);
            main.forEach(e => { if (forb.has(e.muscle)) flag('H', 'PURITY', at, `${e.nameEn}(${e.muscle})`); });
            if (/^(PULL|UPPER B|BACK)$/.test(sf) && main.some(e => e.zone === 'shoulders-press')) flag('H', 'PURITY', at, '拉日出現肩推');

            // ── 動作數（等級區間＋高 CNS 扣減）──
            const heavy = main.filter(e => e.cat === 'compound' && ['extreme', 'high'].includes(e.cns) && (e.tier ?? 3) <= 2).length;
            const cap = Math.max(law.exMin, law.exMax - (heavy >= 3 ? 2 : heavy >= 2 ? 1 : 0));
            if (main.length > law.exMax) flag('H', 'COUNT_OVER_LEVEL', at, `${main.length} > ${law.exMax}`);
            else if (main.length > cap) flag('H', 'CNS_CAP', at, `${main.length} > ${cap}（重壓複合 ${heavy}）`);
            if (main.length && main.length < law.exMin) flag(sev(!shortTime && !constrained), 'COUNT_UNDER_LEVEL', at, `${main.length} < ${law.exMin}${shortTime ? `（選 ${sessionDuration} 分）` : ''}`);
            const ext = main.filter(e => e.cns === 'extreme');
            if (ext.length > 1) flag('H', 'EXTREME_2_PER_DAY', at, ext.map(e => e.nameEn).join(', '));
            if (ext.length && prevExtreme) flag('H', 'EXTREME_BACK_TO_BACK', at, ext.map(e => e.nameEn).join(', '));
            prevExtreme = ext.length > 0;

            // ── 處方：次數／休息／遞減組／超級組 ──
            const pr = (r) => { const s = String(r); const m = s.match(/(\d+)\s*[-–]\s*(\d+)/); if (m) return [+m[1], +m[2]]; if (/->/.test(s)) return [6, 12]; if (/s\b|sec|秒/.test(s)) return [8, 12]; const n = parseInt(s); return [n, n]; };
            const restS = (r) => { const s = String(r ?? ''); const n = parseFloat(s); return /min/.test(s) ? n * 60 : n; };
            let drops = 0; const ss = {};
            main.forEach(e => {
                const [lo, hi] = pr(e.reps), rs = restS(e.rest), en = e.nameEn || e.name;
                if (!(+e.sets >= 1 && +e.sets <= 5)) flag('H', 'SETS_RANGE', at, `${en} ${e.sets}`);
                if (!(lo >= 1 && hi <= 20 && lo <= hi)) flag('H', 'REPS_RANGE', at, `${en} ${e.reps}`);
                if (wi === 0 && !e.isDropSet && e.cat === 'compound' && e.muscle !== 'core') {
                    if (style === 'bodybuilding' && (lo < 5 || hi > 15)) flag('H', 'REPS_HYPERTROPHY', at, `${en} ${e.reps}`);
                    if (style === 'strength' && level !== 'beginner' && e.tier === 1 && hi > 8) flag('H', 'REPS_STRENGTH_MAIN', at, `${en} ${e.reps}`);
                    if (style === 'strength' && level === 'beginner' && hi > 10) flag('H', 'REPS_BEGINNER_STRENGTH', at, `${en} ${e.reps}`);
                }
                if (e.cat === 'compound' && (e.eq === 'barbell' || e.cns === 'extreme') && hi > 12 && !e.isDropSet) flag('H', 'REPS_HEAVY_TOO_HIGH', at, `${en} ${e.reps}`);
                if (STRICT_PULLS.has(e.nameEn) && level !== 'advanced') {
                    const okR = style === 'strength' ? (lo >= 5 && hi <= 8) : (lo >= 6 && hi <= 10);
                    if (!okR && w.phase !== 'Peak') flag('H', 'REPS_PULLUP', at, `${en} ${e.reps}（${style}）`);
                    if (w.phase === 'Peak' && hi > 10) flag('H', 'REPS_PULLUP', at, `${en} ${e.reps}（Peak）`);
                }
                if (e.cat === 'compound' && e.tier === 1 && w.phase !== 'Deload' && rs < 90) flag('H', 'REST_MAIN_SHORT', at, `${en} ${e.rest}`);
                if (e.cat === 'isolation' && rs > 120) flag('H', 'REST_ISO_LONG', at, `${en} ${e.rest}`);
                if (e.isDropSet) {
                    drops++;
                    if (!['cable', 'machine', 'dumbbell'].includes(e.eq) || e.cat !== 'isolation') flag('H', 'DROPSET_MISUSE', at, en);
                    if (+e.sets > 2) flag('H', 'DROPSET_MISUSE', at, `${en} ${e.sets} 輪`);
                    if (w.phase === 'Deload') flag('H', 'DROPSET_MISUSE', at, `減量週 ${en}`);
                }
                // 新手
                if (level === 'beginner') {
                    if (e.eq === 'barbell') flag('H', 'BEGINNER_BARBELL', at, en);
                    if (e.cns === 'extreme') flag('H', 'BEGINNER_EXTREME', at, en);
                    if (STRICT_PULLS.has(e.nameEn)) flag('H', 'BEGINNER_PULLUP', at, en);
                    if (e.isDropSet) flag('H', 'BEGINNER_DROPSET', at, en);
                    if (lo < 6 && !/s\b|sec|秒/.test(String(e.reps))) flag('H', 'BEGINNER_LOW_REPS', at, `${en} ${e.reps}`);
                }
                // 安全／環境
                if (avoid.has(e.nameEn) || avoid.has(e.name)) flag('H', 'INJURY', at, `${en}（${injuries.join('+')}）`);
                if (equipment === 'bodyweight' && !['bodyweight', 'band'].includes(e.eq)) flag('H', 'EQUIPMENT', at, `${en}(${e.eq})`);
                if (e.supersetId) (ss[e.supersetId] ||= []).push(e);
            });
            if (drops > 1) flag('H', 'DROPSET_MISUSE', at, `${drops} 個遞減組`);
            const groups = Object.values(ss);
            if (groups.length > law.maxSupersetsPerDay) flag('H', 'SUPERSET', at, `${groups.length} 組 > ${law.maxSupersetsPerDay}`);
            groups.forEach(g => {
                if (g.length !== 2) flag('H', 'SUPERSET', at, `孤兒超級組 ${g.map(e => e.nameEn)}`);
                else if (+g[0].sets !== +g[1].sets) flag('H', 'SUPERSET', at, `輪數不同 ${g.map(e => e.nameEn + '×' + e.sets)}`);
                if (g.filter(e => ['extreme', 'high'].includes(e.cns)).length >= 2) flag('H', 'SUPERSET', at, `兩個高 CNS ${g.map(e => e.nameEn)}`);
            });
            // 週期：高峰週一天最多 2 個大重量
            if (w.phase === 'Peak') {
                const hv = main.filter(e => e.cat === 'compound' && pr(e.reps)[1] <= 5).length;
                if (hv > 2) flag('H', 'PEAK_HEAVY', at, `${hv} 個 ≤5 下`);
            }
            // 時間：顯示值與重算一致、旗標誠實；超出選的時間 → 警告（新手 3 個動作在 30 分鐘本來就排不下）
            const budget = sessionDuration ?? defaultDur;
            if (+d.time !== E.estimateDayMinutes(d.exercises, d.warmup)) flag('H', 'TIME_STALE', at, `${d.time} vs ${E.estimateDayMinutes(d.exercises, d.warmup)}`);
            if (d.time_budget_met != null && d.time_budget_met !== (+d.time <= budget)) flag('H', 'TIME_FLAG', at, `${d.time}/${budget} met=${d.time_budget_met}`);
            if (+d.time > budget) flag('W', 'TIME_OVER', at, `${d.time} > ${budget} 分`);
        });

        // ── 週層級 ──
        // 每個選的部位每一週都要練到（整個部位被傷病／環境／等級封掉的除外）
        //   1–2 天的課表名額有物理上限：上半身那一天要先放胸、背（沒選也要練，教練標準「沒選 ≠ 不練」），
        //   再放選的肩／二頭／三頭；1 天的全身日還要放腿。排不下 → 降為警告（例：新手 2 天選胸背手臂＝上肢日 4 個部位、只有 3 格）。
        const needs = tags.flatMap(t => ANY_OF.has(t) ? [[t, TAG_MUSCLES[t].filter(feasible)]] : TAG_MUSCLES[t].filter(feasible).map(m => [t, [m]])).filter(([, a]) => a.length);
        const upperNeed = new Set(['chest', 'back'].filter(feasible));
        needs.forEach(([, a]) => a.forEach(m => { if (['shoulders', 'biceps', 'triceps'].includes(m)) upperNeed.add(m); }));
        const lowerNeed = 1 + (tags.includes('glutes') && tags.includes('legs') ? 1 : 0) + (tags.includes('core') ? 1 : 0);
        const fits = days >= 3 || (days === 2 ? upperNeed.size <= law.exMax && lowerNeed <= law.exMax : upperNeed.size + lowerNeed <= law.exMax);
        for (const [t, alt] of needs) if (!alt.some(m => hit.has(m))) flag(sev(fits), 'FOCUS_MISSING', W, `${t} 沒練到（${alt.join('/')}）`);
        // 任何肌群一週 ≤ 20 組
        for (const m in weekSets) if (weekSets[m] > 20) flag('H', 'VOLUME_OVER_20', W, `${m} ${weekSets[m]} 組`);
        // 減量週總組數 < 基礎週
        if (w.phase === 'Deload' && totalSets(w) >= totalSets(p.weeks[0])) flag('H', 'DELOAD_NOT_LIGHTER', W, `${totalSets(w)} ≥ ${totalSets(p.weeks[0])}`);
        if (wi !== 0) return;
        // 重點部位週量下限（基礎週）＝ verify_coach_plans 的 V1：新手 ≥6、中高階 ≥8；2 天課表 ≥6
        //   （名額物理上限：新手 2 天胸背都選或加強肩臂 ≥3；中高階 2 天加強手臂、或胸背都選又加強肩 ≥4）
        const upperFocusN = ['chest', 'back'].filter(t => tags.includes(t)).length;
        const upperBoost = tags.includes('shoulders') || tags.includes('arms');
        const needOf = (t) => {
            const lower = t === 'legs' || t === 'glutes';
            if (level === 'beginner') return days < 3 && !lower && (upperFocusN === 2 || upperBoost) ? 3 : 6;
            return days >= 3 ? 8 : ((tags.includes('arms') || (tags.includes('shoulders') && upperFocusN === 2)) && !lower ? 4 : 6);
        };
        //   降為警告：1–2 天、輸入受限（傷病／徒手）、選的時間比等級預設短（例：計劃預覽固定 60 分，高階預設 75 分）、
        //   或新手名額物理上不夠 —— 新手組數固定 3 組，6 組＝那個部位要 2 個動作，同一種日子還要放選的其他部位
        //   （推日：肩、三頭；拉日：二頭），三頭不能放拉日或腿日（分化純度）。例：新手 3 天選胸肩手臂 → 推日 3 格要放 4 個。
        const HOME_RE = { chest: /^(PUSH|UPPER|UPPER A|CHEST|FB.*)$/i, back: /^(PULL|UPPER|UPPER B|BACK|FB.*)$/i, legs: /^(LEGS|LOWER.*|QUADS|GLUTES|FB.*)$/i, glutes: /^(LEGS|LOWER.*|QUADS|GLUTES|FB.*)$/i };
        const SAME_DAY = { chest: ['shoulders', 'triceps'], back: ['biceps'], legs: [], glutes: [] };
        const selMus = new Set(tags.flatMap(t => TAG_MUSCLES[t]));
        for (const t of tags.filter(x => ['chest', 'back', 'legs', 'glutes'].includes(x))) {
            const s = TAG_MUSCLES[t].reduce((a, m) => a + (weekSets[m] || 0), 0);
            const need = needOf(t);
            let fitsVol = days >= 2 && !constrained && !shortTime;
            if (fitsVol && level === 'beginner') {
                const homeN = p.weeks[0].days.filter(d => HOME_RE[t].test(String(d.shortFocus || ''))).length;
                const needEx = Math.ceil(need / 3) + SAME_DAY[t].filter(m => selMus.has(m) && feasible(m)).length;
                fitsVol = needEx <= homeN * law.exMax;
            }
            if (s < need) flag(sev(fitsVol), 'FOCUS_VOLUME', W, `${t} ${s} 組 < ${need}`);
        }
        // 推拉比 ≤ 1.6（胸背都選、輸入沒受限時）
        if (tags.includes('chest') && tags.includes('back')) {
            const z = (zone) => p.weeks[0].days.flatMap(d => d.exercises).filter(e => !e.isWarmup && e.tier !== 4 && e.zone === zone).reduce((a, e) => a + (+e.sets || 0), 0);
            const push = (weekSets.chest || 0) + z('shoulders-press'), pull = (weekSets.back || 0) + z('shoulders-rear');
            //   新手 1–2 天：上半身日只有 3 格、只排複合 → 胸、背、肩推各一 = 推 6：拉 3，物理上平衡不了 → 警告
            const pushPullFits = !constrained && days >= 2 && !(level === 'beginner' && days < 3 && tags.includes('shoulders'));
            if (push && pull && Math.max(push / pull, pull / push) > 1.6) flag(sev(pushPullFits), 'PUSH_PULL', W, `推 ${push} / 拉 ${pull}`);
        }
        const all = w.days.flatMap(d => d.exercises.filter(e => !e.isWarmup && e.tier !== 4));
        // 有練腿（股四頭／臀）就要有髖鉸鏈
        const hingeFeasible = E.ALL_EXERCISES.some(ex => (ex.zone === 'hamstrings-hinge' || HINGE_EN.has(ex.name)) && !avoid.has(ex.name) && (equipment !== 'bodyweight' || ['bodyweight', 'band'].includes(ex.eq)) && E.passesLevelGate(ex, level, equipment));
        //   動作池有安全的鉸鏈（已扣掉傷病與環境）就算硬傷；只有一週一天、名額不夠時降為警告：
        //   全身日先要胸、背、股四頭（覆蓋）＋選的其他部位，再加鉸鏈；高階同天兩三個大重量時上限實際是 5（S-06）
        const extraSel = new Set(tags.flatMap(t => TAG_MUSCLES[t]).filter(m => !['chest', 'back', 'quads', 'hamstrings'].includes(m) && feasible(m)));
        const fbCap = level === 'advanced' ? law.exMax - 1 : law.exMax;
        //   下背／髖的關節限制本身就是在限制鉸鏈這個動作模式（剩下的只有繩索髖伸、背伸展，正好壓在那個關節上）→ 警告
        const hingeLimited = injuries.some(i => i === 'back' || i === 'hip');
        const hingeFits = !hingeLimited && (days >= 2 || (3 + extraSel.size + 1) <= fbCap);
        if (all.some(e => ['quads', 'glutes'].includes(e.muscle)) && hingeFeasible && !all.some(e => e.zone === 'hamstrings-hinge' || e.zone === 'back-lower' || HINGE_EN.has(e.nameEn)))
            flag(sev(hingeFits), 'NO_HINGE', W, '有練腿沒有髖鉸鏈');
        // 背是重點（一週 ≥2 個背動作）→ 垂直拉＋水平拉
        if (tags.includes('back') && level !== 'beginner' && all.filter(e => e.muscle === 'back').length >= 2 && !(all.some(e => e.zone === 'back-lats') && all.some(e => e.zone === 'back-mid')))
            flag(sev(!constrained), 'PULL_PLANES', W, '垂直拉／水平拉缺一');
    });
}

// ── 執行（多執行緒）──────────────────────────────────
if (isMainThread) {
    const enginePath = path.resolve(ENGINE);
    const r = await esbuild.build({ entryPoints: [enginePath], bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error' });
    const code = r.outputFiles[0].text;
    const src = fs.readFileSync(enginePath, 'utf8');
    const m = src.match(/const INJURY_AVOID = (\{[\s\S]*?\n\});/);
    const AVOID_SRC = m[1];
    const combos = buildCombos();
    const N = Math.max(1, Math.min(os.cpus().length, 8));
    const t0 = Date.now();
    const results = await Promise.all(Array.from({ length: N }, (_, k) => new Promise((res, rej) => {
        const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { code, AVOID_SRC, combos: combos.filter((_, i) => i % N === k), show: SHOW }, argv: process.argv.slice(2) });
        wk.on('message', res); wk.on('error', rej);
    })));
    const counts = {}, plansHit = {}, ex = {}, bySurface = {}, codeSurf = {}; let badPlans = 0, warnPlans = 0, badReach = 0;
    for (const rr of results) {
        badReach += rr.badReach;
        for (const k in rr.codeSurf) for (const sn in rr.codeSurf[k]) { const o = codeSurf[k] ||= {}; o[sn] = (o[sn] || 0) + rr.codeSurf[k][sn]; }
        badPlans += rr.badPlans; warnPlans += rr.warnPlans;
        for (const k in rr.bySurface) { const b = bySurface[k] ||= [0, 0]; b[0] += rr.bySurface[k][0]; b[1] += rr.bySurface[k][1]; }
        for (const k in rr.counts) { counts[k] = (counts[k] || 0) + rr.counts[k]; plansHit[k] = (plansHit[k] || 0) + rr.plansHit[k]; (ex[k] ||= []).push(...rr.ex[k]); }
    }
    console.log(`全組合教練稽核：${combos.length} 份課表 × 4 週（${FULL ? 'full' : QUICK ? 'quick' : '標準'}；${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
    console.log(`有 ❌ 硬傷的課表：${badPlans}　只有 ⚠️ 警告的課表：${warnPlans}`);
    console.log('依入口：' + Object.entries(bySurface).map(([k, [n, b]]) => `${k} ${b}/${n}`).join('　') + '（有硬傷/組合數）\n');
    const keys = Object.keys(counts).sort((a, b) => (a[0] === b[0] ? counts[b] - counts[a] : a[0] === 'H' ? -1 : 1));
    for (const k of keys) {
        const [s, c] = k.split(':');
        console.log(`${s === 'H' ? '❌' : '⚠️ '} ${c.padEnd(24)} ${String(counts[k]).padStart(7)} 處／${plansHit[k]} 份　〔${Object.entries(codeSurf[k] || {}).map(([a, b]) => a + ' ' + b).join('、')}〕`);
        ex[k].slice(0, SHOW).forEach(x => console.log('      ' + x));
    }
    const apiOnly = badPlans - badReach;
    console.log('');
    if (!badPlans) console.log('✅ 沒有教練不會交給學生的硬傷');
    else if (!badReach) console.log(`✅ 畫面選得到的組合沒有硬傷。⚠️ 另有 ${apiOnly} 份「僅 API」組合有硬傷（精靈／新手引導／設計器／預覽都選不出這組輸入）${STRICT ? '' : '，加 --strict 會當成失敗'}`);
    else console.log(`❌ 畫面選得到的組合有 ${badReach} 份有硬傷（另有僅 API ${apiOnly} 份）`);
    if (process.env.AUDIT_ALL_OUT) fs.writeFileSync(process.env.AUDIT_ALL_OUT, results.flatMap(rr => rr.all).join('\n'));
    if (process.env.AUDIT_JSON) fs.writeFileSync(process.env.AUDIT_JSON, JSON.stringify({ combos: combos.length, badPlans, warnPlans, bySurface, counts, plansHit, codeSurf }, null, 1));
    process.exit(badReach || (STRICT && badPlans) ? 1 : 0);
} else {
    const { code, AVOID_SRC, combos, show } = workerData;
    const E = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    const AVOID = new Function('return ' + AVOID_SRC)();
    const counts = {}, plansHit = {}, ex = {}, bySurface = {}, all = [], codeSurf = {}; let badPlans = 0, warnPlans = 0, badReach = 0;
    const ALL_CODE = process.env.AUDIT_ALL;   // 除錯：把某個代碼的每一筆都寫出來（AUDIT_ALL=CNS_CAP AUDIT_ALL_OUT=檔名）
    const origLog = console.log, origWarn = console.warn; console.log = () => {}; console.warn = () => {};
    for (const cfg of combos) {
        const seen = new Set(), surf = surfaceOf(cfg, E.getLevelCode);
        const ctx = `〔${surf.join('·')}〕${cfg.level}/${cfg.daysPerWeek}天/${cfg.equipment}/${cfg.trainingStyle}/[${cfg.selectedHashtags.join(',')}]${cfg.injuries.length ? '/傷:' + cfg.injuries.join('+') : ''}${cfg.sessionDuration ? '/' + cfg.sessionDuration + '分' : ''}`;
        auditPlan(E, AVOID, cfg, (s, c, at, msg) => {
            const k = `${s}:${c}`;
            counts[k] = (counts[k] || 0) + 1;
            if (ALL_CODE && c === ALL_CODE && s === (process.env.AUDIT_SEV || s)) all.push(`${ctx}\t${at}\t${msg}`);
            if (!seen.has(k)) { seen.add(k); plansHit[k] = (plansHit[k] || 0) + 1; for (const sn of surf) { const o = codeSurf[k] ||= {}; o[sn] = (o[sn] || 0) + 1; } (ex[k] ||= []); if (ex[k].length < show) ex[k].push(`${ctx} ${at} → ${msg}`); }
        });
        const ks = [...seen], bad = ks.some(k => k.startsWith('H'));
        if (bad) badPlans++; else if (ks.length) warnPlans++;
        if (bad && !surf.includes('僅 API')) badReach++;
        for (const sname of surfaceOf(cfg, E.getLevelCode)) { const b = bySurface[sname] ||= [0, 0]; b[0]++; if (bad) b[1]++; }
    }
    console.log = origLog; console.warn = origWarn;
    parentPort.postMessage({ counts, plansHit, ex, badPlans, warnPlans, bySurface, all, codeSurf, badReach });
}
