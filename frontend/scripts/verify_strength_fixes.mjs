// ⚖️ 重訓引擎修復驗證（前後對照）
//   S-01 減量週不得開遞減組
//   S-02 新手器械替換不得繞過傷病清單與等級難度閘門
//   S-03 有體重時新手應拿到建議重量
// 用法：node --import ./scripts/_register_hooks.mjs scripts/verify_strength_fixes.mjs
import { readFileSync } from 'node:fs';
import * as AFTER from '../src/utils/UnifiedTrainingEngine.js';
// 「修改前」版本是選用的：把修改前的引擎複製成 src/utils/__UTE_before.js 就會跑前後對照，
// 沒有它就只驗現況（當成一般回歸測試用）。
let BEFORE = null;
try { BEFORE = await import('../src/utils/__UTE_before.js'); } catch { /* 沒有基準版 → 只驗現況 */ }

// 從引擎原始碼取出 INJURY_AVOID（避免在測試裡重抄一份、與引擎脫鉤）
const src = readFileSync(new URL('../src/utils/UnifiedTrainingEngine.js', import.meta.url), 'utf8');
const m = src.match(/const INJURY_AVOID = (\{[\s\S]*?\n\});/);
const INJURY_AVOID = new Function('return ' + m[1])();
const avoidOf = (injuries) => new Set(injuries.flatMap(i => INJURY_AVOID[i.toLowerCase()] || []));

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const TAGS = [['chest'], ['back'], ['legs'], ['chest', 'back'], ['legs', 'core'],
              ['chest', 'back', 'legs'], ['shoulders', 'back', 'glutes'], ['glutes'], ['arms']];
const DAYS = [3, 4, 5];
const EQUIP = ['mixed', 'equipment'];
const STYLES = ['bodybuilding', 'strength'];
const INJURIES = [[], ['knee'], ['shoulder'], ['back'], ['wrist'], ['knee', 'shoulder']];

const mainEx = (d) => (d.exercises || []).filter(e => !e.isWarmup && e.tier !== 4);
const enName = (e) => e.nameEn || e.name;

function run(ENGINE, label) {
    const r = { label, combos: 0, deloadDrop: 0, deloadDropCombos: [],
                normalDrop: 0, injury: 0, injuryCases: [], diff: 0, diffCases: [],
                capOver: 0, capCases: [] };
    for (const level of LEVELS)
      for (const tags of TAGS)
        for (const daysPerWeek of DAYS)
          for (const equipment of EQUIP)
            for (const trainingStyle of STYLES)
              for (const injuries of INJURIES) {
                r.combos++;
                const combo = `${level}|[${tags}]|${daysPerWeek}d|${equipment}|${trainingStyle}|傷:${injuries.join('+') || '無'}`;
                let plan;
                try {
                    plan = ENGINE.generateUnifiedPlan({ level, selectedHashtags: tags, daysPerWeek,
                        equipment, trainingStyle, injuries });
                } catch (error) { throw new Error(`生成失敗：${combo}`, { cause: error }); }
                const avoid = avoidOf(injuries);
                const maxDiff = ENGINE.getLevelCode(level).maxDiff;
                const law = ENGINE.getLevelCode(level);
                for (const w of plan.weeks) {
                    const isDeload = w.phase === 'Deload';
                    for (const d of w.days) {
                        // S-06 高 CNS 日扣減後的每日動作上限（測試端獨立重算，不依賴引擎內部）
                        const main = mainEx(d);
                        const heavy = main.filter(e => e.cat === 'compound'
                            && (e.cns === 'extreme' || e.cns === 'high') && (e.tier ?? 3) <= 2).length;
                        const cap = Math.max(law.exMin, law.exMax - (heavy >= 3 ? 2 : heavy >= 2 ? 1 : 0));
                        if (main.length > cap) {
                            r.capOver++;
                            if (r.capCases.length < 4) r.capCases.push(`${combo} → W${w.week_number} D${d.day_number} ${main.length} 個 > 上限 ${cap}（重壓複合 ${heavy}）`);
                        }
                        for (const e of main) {
                            if (e.isDropSet) { if (isDeload) { r.deloadDrop++; if (r.deloadDropCombos.length < 3) r.deloadDropCombos.push(`${combo} → W${w.week_number} ${enName(e)}`); } else r.normalDrop++; }
                            if (avoid.has(enName(e))) { r.injury++; if (r.injuryCases.length < 4) r.injuryCases.push(`${combo} → W${w.week_number} ${enName(e)}`); }
                            if ((e.diff ?? 0) > maxDiff) { r.diff++; if (r.diffCases.length < 4) r.diffCases.push(`${combo} → ${enName(e)} diff=${e.diff} > ${maxDiff}`); }
                        }
                    }
                }
              }
    return r;
}

const after  = run(AFTER,  '修改後');
const before = BEFORE ? run(BEFORE, '修改前') : { combos: after.combos, deloadDrop: '—', normalDrop: '—', injury: '—', diff: '—', capOver: '—', deloadDropCombos: [], injuryCases: [], diffCases: [], capCases: [] };

const row = (k, b, a, want) => {
    const ok = want(a);
    console.log(`${ok ? '✅' : '❌'} ${k.padEnd(30)} 前: ${String(b).padStart(5)}   後: ${String(a).padStart(5)}`);
    return ok;
};
console.log(`\n══════ 重訓引擎修復驗證 ══════`);
console.log(`每邊窮舉 ${before.combos} 組合（含 6 種關節限制情境）\n`);
let pass = true;
pass &= row('S-01 減量週遞減組（應為 0）', before.deloadDrop, after.deloadDrop, v => v === 0);
pass &= row('     一般週遞減組（應仍 > 0）', before.normalDrop, after.normalDrop, v => v > 0);
pass &= row('S-02 傷病清單違規（應為 0）', before.injury, after.injury, v => v === 0);
pass &= row('S-02 難度閘門違規（應為 0）', before.diff, after.diff, v => v === 0);
pass &= row('S-06 超出高CNS上限（應為 0）', before.capOver, after.capOver, v => v === 0);

if (before.deloadDropCombos.length) { console.log('\n── 修改前・減量週遞減組樣本 ──'); before.deloadDropCombos.forEach(x => console.log('   ' + x)); }
if (before.injuryCases.length) { console.log('\n── 修改前・傷病違規樣本 ──'); before.injuryCases.forEach(x => console.log('   ' + x)); }
if (before.diffCases.length) { console.log('\n── 修改前・難度違規樣本 ──'); before.diffCases.forEach(x => console.log('   ' + x)); }
if (before.capCases.length) { console.log('\n── 修改前・超出高CNS上限樣本 ──'); before.capCases.forEach(x => console.log('   ' + x)); }
if (after.capCases.length) { console.log('\n── ⚠️ 修改後仍超出上限 ──'); after.capCases.forEach(x => console.log('   ' + x)); }
if (after.injuryCases.length) { console.log('\n── ⚠️ 修改後仍有傷病違規 ──'); after.injuryCases.forEach(x => console.log('   ' + x)); }
if (after.diffCases.length) { console.log('\n── ⚠️ 修改後仍有難度違規 ──'); after.diffCases.forEach(x => console.log('   ' + x)); }

// S-03：有體重就要有建議重量
const withW = AFTER.generateUnifiedPlan({ level: 'beginner', selectedHashtags: ['chest', 'back'],
    daysPerWeek: 3, equipment: 'mixed', trainingStyle: 'bodybuilding', injuries: [],
    userBodyWeight: 60, userGender: 'female' });
const noW = AFTER.generateUnifiedPlan({ level: 'beginner', selectedHashtags: ['chest', 'back'],
    daysPerWeek: 3, equipment: 'mixed', trainingStyle: 'bodybuilding', injuries: [] });
const countSW = (p) => p.weeks[0].days.flatMap(mainEx).filter(e => e.suggestedWeight).length;
const swWith = countSW(withW), swNo = countSW(noW);
const s3ok = swWith > 0 && swNo === 0;
console.log(`\n${s3ok ? '✅' : '❌'} S-03 建議重量                  傳體重: ${swWith} 個動作有數字   不傳: ${swNo}`);
if (swWith) {
    console.log('   樣本（60kg 女性）：');
    withW.weeks[0].days.flatMap(mainEx).filter(e => e.suggestedWeight).slice(0, 4)
        .forEach(e => console.log(`     ${enName(e).padEnd(28)} ${e.suggestedWeight}`));
}
pass &= s3ok;

// S-03b：suggestedWeight 一律是數字（UI 用 `> 0` 判斷，字串永遠不顯示）
// S-03c：新手的機械／繩索動作要帶「怎麼挑重量」的指令，而不是假數字
// D    ：選太多重點導致部位低於 10 組/週時要出警示
let typeBad = 0, machineNoGuide = 0;
for (const level of ['beginner', 'intermediate', 'advanced'])
  for (const tags of [['chest'], ['legs'], ['chest','back'], ['chest','back','legs','arms']])
    for (const daysPerWeek of [3, 4]) {
      const p = AFTER.generateUnifiedPlan({ level, selectedHashtags: tags, daysPerWeek,
        equipment: 'mixed', trainingStyle: 'bodybuilding', injuries: [],
        userBodyWeight: 65, userGender: 'female' });
      for (const w of p.weeks) for (const d of w.days) for (const e of mainEx(d)) {
        if (e.suggestedWeight !== undefined && typeof e.suggestedWeight !== 'number') typeBad++;
        if (level === 'beginner' && (e.eq === 'machine' || e.eq === 'cable')
            && typeof e.suggestedWeight !== 'number' && !e.note) machineNoGuide++;
      }
    }
const hinted = AFTER.generateUnifiedPlan({ level: 'intermediate',
  selectedHashtags: ['chest','back','legs','arms'], daysPerWeek: 4,
  equipment: 'mixed', trainingStyle: 'bodybuilding', injuries: [] });
const okType = typeBad === 0, okGuide = machineNoGuide === 0, okHint = !!hinted.volume_hint;
console.log(`${okType  ? '✅' : '❌'} S-03b 建議重量非數字（應為 0）        ${typeBad}`);
console.log(`${okGuide ? '✅' : '❌'} S-03c 新手機械無選重指令（應為 0）    ${machineNoGuide}`);
console.log(`${okHint  ? '✅' : '❌'} D     週組數不足警示                  ${okHint ? '有觸發' : '未觸發'}`);
pass &= okType && okGuide && okHint;
console.log(`\n${pass ? '✅ 全部通過' : '❌ 有項目未通過'}\n`);
process.exit(pass ? 0 : 1);
