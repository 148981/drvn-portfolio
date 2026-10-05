// 👀 教練眼掃描：其他腳本沒有管到、但教練一眼就會挑出來的課表問題。
// 窮舉 等級 × 天數(1–6) × 器材(健身房/混合/徒手) × 風格 × 常見重點組合 × 關節限制 × 時長，
// 每一條都對應一句教練會講的話（見 scripts/PLAN_CHECK_STANDARD.md）。
// 用法：node --import ./scripts/_register_hooks.mjs scripts/verify_plan_coach_eye.mjs
//       加 --quick 只跑一半組合（開發中快速回歸）
import { readFileSync } from 'node:fs';
import { generateUnifiedPlan, STRICT_BW_PULLS, getLevelCode, MUSCLES, ALL_EXERCISES, passesLevelGate } from '../src/utils/UnifiedTrainingEngine.js';

// 從引擎原始碼取出 INJURY_AVOID（與 verify_strength_fixes 同一個做法，避免測試裡抄一份脫鉤）
const src = readFileSync(new URL('../src/utils/UnifiedTrainingEngine.js', import.meta.url), 'utf8');
const INJURY_AVOID = new Function('return ' + src.match(/const INJURY_AVOID = (\{[\s\S]*?\n\});/)[1])();

const QUICK = process.argv.includes('--quick');
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const DAYS = [1, 2, 3, 4, 5, 6];
const EQUIP = ['equipment', 'mixed', 'bodyweight'];
const STYLES = ['bodybuilding', 'strength'];
const FOCUS = [[], ['chest'], ['back'], ['legs'], ['arms'], ['chest', 'back'], ['chest', 'back', 'legs'],
    ['shoulders', 'back', 'glutes'], ['chest', 'arms'], ['glutes'], ['legs', 'core']];
const INJ = [[], ['knee'], ['shoulder'], ['back']];
const DURATIONS = QUICK ? [60] : [45, 60];

const en = (e) => e.nameEn || e.name;
const isMain = (e) => !e.isWarmup && e.tier !== 4;
const topReps = (r) => { const m = String(r || '').match(/(\d+)\s*[-–]\s*(\d+)/); return m ? Number(m[2]) : (Number.parseInt(r) || null); };
const secs = (r) => { const s = String(r ?? ''); const m = s.match(/([\d.]+)\s*(min|m)\b/); if (m) return Number(m[1]) * 60; return Number.parseInt(s) || 0; };
const HINGE = new Set(['hamstrings-hinge', 'back-lower']);

const found = {};
const hit = (code, msg) => { const r = found[code] ||= { n: 0, ex: [] }; r.n++; if (r.ex.length < 4) r.ex.push(msg); };
let plans = 0;

for (const level of LEVELS)
for (const daysPerWeek of DAYS)
for (const equipment of EQUIP)
for (const trainingStyle of STYLES)
for (const selectedHashtags of FOCUS)
for (const injuries of INJ)
for (const sessionDuration of DURATIONS) {
    const cfg = `${level}|${daysPerWeek}d|${equipment}|${trainingStyle}|[${selectedHashtags}]|傷:${injuries.join('+') || '無'}|${sessionDuration}m`;
    const plan = generateUnifiedPlan({ level, daysPerWeek, equipment, trainingStyle, selectedHashtags, injuries, sessionDuration });
    plans++;
    const law = getLevelCode(level);
    const avoid = new Set(injuries.flatMap(i => INJURY_AVOID[i] || []));
    const w1 = plan.weeks[0];
    // 這個人「做得到」的部位：等級閘門、器材、關節限制過濾後動作池還有東西（膝傷＋徒手時股四頭可能一個都不能排）
    const canTrain = (m) => ALL_EXERCISES.some(ex => ex.muscle === m && ex.tier <= 3 && !avoid.has(ex.name)
        && passesLevelGate(ex, level, equipment) && (equipment !== 'bodyweight' || ['bodyweight', 'band'].includes(ex.eq)));

    plan.weeks.forEach((w, wi) => {
        let prevHinge = 0;
        w.days.forEach((d, di) => {
            const at = `${cfg} W${w.week_number}D${d.day_number}[${d.shortFocus}]`;
            const main = d.exercises.filter(isMain);
            const names = main.map(en);

            // E1 同一天同一個動作出現兩次
            if (new Set(names).size !== names.length) hit('E1 同一天重複動作', `${at}: ${names.join(' → ')}`);

            // E2 同肌群的重壓複合排在該肌群的孤立之後（先磨累再推重，教練最忌）
            main.forEach((e, i) => {
                if (e.cat !== 'compound' || (e.tier || 3) > 2 || e.muscle === 'core') return;
                const before = main.slice(0, i).find(x => x.muscle === e.muscle && x.cat === 'isolation');
                if (before) hit('E2 重壓複合排在同肌群孤立之後', `${at}: ${en(before)} → ${en(e)}`);
            });

            // E3 同一天同一個動作模式（同肌群·同部位·同類型，例：三個水平推）超過 2 個，等於同一個刺激做三遍
            const pat = {};
            main.forEach(e => { const k = `${e.muscle}::${e.zone}::${e.cat}`; (pat[k] ||= []).push(en(e)); });
            Object.entries(pat).forEach(([k, v]) => {
                if (v.length > 2) hit('E3 同一動作模式超過 2 個', `${at}: ${k} ×${v.length}（${v.join('、')}）`);
            });

            // E4 整天只有孤立動作（核心除外）—— 沒有一個多關節主項
            const nonCore = main.filter(e => e.muscle !== 'core');
            if (nonCore.length && !nonCore.some(e => e.cat === 'compound')) hit('E4 整天只有孤立動作', `${at}: ${names.join('、')}`);

            main.forEach(e => {
                const top = topReps(e.reps), rest = secs(e.rest);
                // E5 槓鈴／極限 CNS 複合開 15 下以上：重量必須輕到失去主項意義，技術也會在高次數崩
                if (e.cat === 'compound' && e.muscle !== 'core' && (e.eq === 'barbell' || e.cns === 'extreme') && top > 12 && !e.isDropSet)
                    hit('E5 槓鈴主項次數過高', `${at}: ${en(e)} ${e.sets}×${e.reps}`);
                // E6 引體／反手引體：新手不排；中階不超過 10 下（拉自己的體重，寫 12–15 做不到）
                if (STRICT_BW_PULLS.has(en(e))) {
                    if (level === 'beginner') hit('E6 新手出現引體向上', `${at}: ${en(e)}`);
                    else if (level !== 'advanced' && top > 10) hit('E6 中階引體次數過高', `${at}: ${en(e)} ${e.reps}`);
                }
                // E7 休息時間跟動作類型不合：tier 1 大複合休不到 90 秒（下一組做不起來）；孤立休超過 2 分鐘（浪費時間）
                if (!e.supersetId) {
                    if (e.cat === 'compound' && (e.tier || 3) === 1 && e.muscle !== 'core' && rest > 0 && rest < 90)
                        hit('E7 大複合休息太短', `${at}: ${en(e)} rest ${e.rest}`);
                    if (e.cat === 'isolation' && rest > 120) hit('E7 孤立休息太長', `${at}: ${en(e)} rest ${e.rest}`);
                }
                // E8 關節限制清單裡的動作不可出現
                if (avoid.has(en(e))) hit('E8 違反關節限制', `${at}: ${en(e)}`);
                // E9 徒手環境只能有徒手／彈力帶
                if (equipment === 'bodyweight' && !['bodyweight', 'band'].includes(e.eq)) hit('E9 徒手環境出現器材', `${at}: ${en(e)}(${e.eq})`);
                // E10 處方不完整
                if (!(Number.isInteger(Number(e.sets)) && Number(e.sets) > 0) || !e.reps || e.rest == null) hit('E10 處方不完整', `${at}: ${en(e)}`);
                // E11 新手不碰 3–5 下、不做遞減組、不用槓鈴
                if (level === 'beginner' && (top !== null && top <= 6 || e.isDropSet || e.eq === 'barbell'))
                    hit('E11 新手處方超齡', `${at}: ${en(e)} ${e.reps}${e.isDropSet ? ' 遞減組' : ''} ${e.eq}`);
            });

            // E12 每日動作數在等級區間內（太少＝空洞日，太多＝做不完）
            const slots = main.filter(e => !(e.supersetId && e.supersetOrder === 'B')).length;
            if (slots > law.exMax) hit('E12 每日動作數超過等級上限', `${at}: ${slots} > ${law.exMax}`);
            if (slots < Math.min(2, law.exMin)) hit('E12 每日動作數太少', `${at}: ${slots}`);

            // E13 超級組：兩個一組、相鄰、輪數一樣；兩個都是高 CNS 不配
            const ss = {};
            main.forEach((e, i) => { if (e.supersetId) (ss[e.supersetId] ||= []).push(i); });
            Object.values(ss).forEach(ix => {
                const g = ix.map(i => main[i]);
                if (ix.length !== 2 || ix[1] !== ix[0] + 1) hit('E13 超級組落單或沒相鄰', `${at}: ${g.map(en).join('+')}`);
                else if (Number(g[0].sets) !== Number(g[1].sets)) hit('E13 超級組輪數不同', `${at}: ${g.map(x => `${en(x)} ${x.sets}`).join(' / ')}`);
                if (g.filter(x => ['high', 'extreme'].includes(x.cns)).length >= 2) hit('E13 兩個高 CNS 配超級組', `${at}: ${g.map(en).join('+')}`);
            });

            // E14 極限 CNS：一天最多一個，也不連兩天
            const ext = main.filter(e => e.cns === 'extreme');
            if (ext.length > 1) hit('E14 一天兩個極限動作', `${at}: ${ext.map(en).join('、')}`);
            const prevExt = di > 0 && w.days[di - 1].exercises.some(e => isMain(e) && e.cns === 'extreme');
            if (ext.length && prevExt) hit('E14 極限動作連兩天', `${at}: ${ext.map(en).join('、')}`);

            // E15 下背承重鉸鏈（硬舉／羅馬尼亞／早安）不連三天
            const hinge = main.some(e => e.cat === 'compound' && HINGE.has(e.zone) && ['high', 'extreme'].includes(e.cns));
            prevHinge = hinge ? prevHinge + 1 : 0;
            if (prevHinge >= 3) hit('E15 重鉸鏈連三天', `${at}`);

            // E19 高峰週一天最多 2 個 3–5 下的大重量（第三個以後回到 6–8 下），不然神經疲勞恢復不了
            if (w.phase === 'Peak') {
                const heavy = main.filter(e => e.cat === 'compound' && topReps(e.reps) !== null && topReps(e.reps) <= 5);
                if (heavy.length > 2) hit('E19 高峰週大重量超過 2 個', `${at}: ${heavy.map(en).join('、')}`);
            }

            // E20 同一個 tier 1 主項不排在連續兩天（同一個動作要 48 小時以上恢復）
            if (di > 0) {
                const prev = new Set(w.days[di - 1].exercises.filter(e => isMain(e) && (e.tier || 3) === 1).map(en));
                main.filter(e => (e.tier || 3) === 1 && prev.has(en(e)) && e.muscle !== 'core')
                    .forEach(e => hit('E20 同一主項連兩天', `${at}: ${en(e)}`));
            }

            // E16 四週同一套動作（只有處方跟著週期變）；新手尤其不能每週換
            if (wi > 0) {
                const base = new Set(w1.days[di].exercises.filter(isMain).map(en));
                const now = new Set(names);
                if (base.size !== now.size || [...base].some(n => !now.has(n)))
                    hit('E16 週與週之間換動作', `${at}: W1[${[...base]}] vs [${[...now]}]`);
                // E17 減量週每個動作組數不超過第 1 週；強化週次數不高於第 1 週
                w1.days[di].exercises.filter(isMain).forEach(b => {
                    const x = main.find(e => en(e) === en(b));
                    if (!x) return;
                    if (w.phase === 'Deload' && Number(x.sets) > Number(b.sets)) hit('E17 減量週組數反而變多', `${at}: ${en(x)} ${b.sets}→${x.sets}`);
                    if (w.phase === 'Deload' && x.isDropSet) hit('E17 減量週有遞減組', `${at}: ${en(x)}`);
                    if (w.phase === 'Peak' && !x.isDropSet && !b.isDropSet && topReps(x.reps) > topReps(b.reps)) hit('E17 強化週次數反而變高', `${at}: ${en(x)} ${b.reps}→${x.reps}`);
                });
            }
        });
    });

    // E21 每個肌群一週直接組數不超過 20 組（肌肥大有效區間約 10–20 組，再多恢復不了）
    plan.weeks.forEach(w => {
        const tot = {};
        w.days.forEach(d => d.exercises.filter(isMain).forEach(e => { tot[e.muscle] = (tot[e.muscle] || 0) + (Number(e.sets) || 0); }));
        Object.entries(tot).forEach(([m, n]) => { if (n > 20) hit('E21 單一肌群一週超過 20 組', `${cfg} W${w.week_number}: ${m} ${n} 組`); });
    });

    // E18 使用者選的重點部位，四週每一週都要練到（以標籤算：選「腿」= 股四頭或腿後至少一個；
    //     新手一週一天只有 3 格，胸＋背＋腿各一格是合理的，不要求腿的每塊肌肉都有）
    plan.weeks.forEach(w => {
        const ms = new Set(w.days.flatMap(d => d.exercises.filter(isMain).map(e => e.muscle)));
        selectedHashtags.forEach(t => {
            const list = (MUSCLES[t]?.muscles || [t]).filter(canTrain);
            // 關節限制把整個部位的動作池都封掉時（例：膝傷＋新手，股四頭沒有能做的動作）不算
            const need = t === 'arms' ? list.every(m => ms.has(m)) : list.some(m => ms.has(m));   // 選手臂＝二頭、三頭都要有
            if (list.length && !need) hit('E18 重點部位整週沒練到', `${cfg} W${w.week_number}: ${t}`);
        });
    });
}

console.log(`\n══════ 教練眼掃描 ══════\n組合 ${plans} 份課表 × 4 週\n`);
const codes = Object.keys(found).sort();
if (!codes.length) console.log('✅ 沒有教練會挑出來的問題');
codes.forEach(k => {
    console.log(`❌ ${k}：${found[k].n}`);
    found[k].ex.forEach(x => console.log(`     ${x}`));
});
if (codes.length) process.exitCode = 1;
