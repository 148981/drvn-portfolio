// ⚖️ UnifiedTrainingEngine 立法回歸稽核
// 窮舉 等級 × 標籤組合 × 天數 × 器材 × 風格，用 validatePlan 檢查教練硬傷。
// 用法：node scripts/audit_unified_legislation.mjs
import { generateUnifiedPlan, validatePlan, getLevelCode } from '../src/utils/UnifiedTrainingEngine.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const TAG_SETS = [
    [],
    ['chest'],
    ['back'],
    ['legs'],
    ['arms'],
    ['chest', 'back'],
    ['chest', 'arms'],
    ['back', 'legs'],
    ['chest', 'back', 'legs'],
    ['chest', 'back', 'legs', 'arms'],
    ['shoulders', 'back', 'glutes'],          // 沙漏型
    ['chest', 'back', 'shoulders', 'arms', 'core', 'legs'], // 全選
    ['legs', 'core'],
    ['glutes'],
];
const DAYS = [2, 3, 4, 5];
const EQUIP = ['mixed', 'bodyweight', 'equipment'];
const STYLES = ['bodybuilding', 'strength'];

let total = 0, failed = 0;
const failures = new Map(); // signature → [combos]

for (const level of LEVELS) {
    for (const tags of TAG_SETS) {
        for (const daysPerWeek of DAYS) {
            for (const equipment of EQUIP) {
                for (const trainingStyle of STYLES) {
                    total++;
                    const combo = `${level} | [${tags.join(',') || '無標籤'}] | ${daysPerWeek}天 | ${equipment} | ${trainingStyle}`;
                    let plan;
                    try {
                        plan = generateUnifiedPlan({ level, selectedHashtags: tags, daysPerWeek, equipment, trainingStyle, injuries: [] });
                    } catch (e) {
                        failed++;
                        const key = `💥 生成崩潰: ${e.message}`;
                        if (!failures.has(key)) failures.set(key, []);
                        failures.get(key).push(combo);
                        continue;
                    }
                    const v = validatePlan(plan);
                    // 額外硬性檢查：每日動作數下限（引擎內部下限）
                    const law = getLevelCode(level);
                    plan.weeks.forEach(w => w.days.forEach(d => {
                        const main = d.exercises.filter(e => !e.isWarmup && e.tier !== 4);
                        const slots = main.filter(e => !(e.supersetId && e.supersetOrder === 'B')).length;
                        if (slots < Math.min(2, law.exMin) && equipment !== 'bodyweight') {
                            v.push(`W${w.week_number} D${d.day_number} [${d.shortFocus}] 空洞日：僅 ${slots} 個動作`);
                        }
                    }));
                    if (v.length) {
                        failed++;
                        for (const msg of v) {
                            const key = msg.replace(/^W\d+ D\d+ /, ''); // 聚合同類違規
                            if (!failures.has(key)) failures.set(key, []);
                            if (failures.get(key).length < 3) failures.get(key).push(combo);
                        }
                    }
                }
            }
        }
    }
}

console.log(`\n══════ 稽核結果 ══════`);
console.log(`組合總數: ${total}，有硬傷: ${failed}，通過率: ${(((total - failed) / total) * 100).toFixed(1)}%\n`);
if (failures.size) {
    console.log(`── 違規類型 (${failures.size} 種) ──`);
    [...failures.entries()].slice(0, 40).forEach(([k, combos]) => {
        console.log(`✗ ${k}\n    e.g. ${combos[0]}`);
    });
    process.exitCode = 1;
} else {
    console.log('✅ 所有組合通過教練硬傷稽核');
}

// ── 抽樣目視：中階 PPL 拉日（過去的三頭漏洞現場）──
const sample = generateUnifiedPlan({ level: 'intermediate', selectedHashtags: ['chest', 'back', 'legs', 'arms'], daysPerWeek: 3, equipment: 'mixed', trainingStyle: 'bodybuilding' });
console.log(`\n── 抽樣：中階 3天 PPL (#chest#back#legs#arms) W1 ──`);
sample.weeks[0].days.forEach(d => {
    console.log(`\n[${d.shortFocus}] ${d.focus}｜${d.exercises.filter(e => !e.isWarmup && e.tier !== 4).length} 動作`);
    d.exercises.filter(e => !e.isWarmup).forEach(e => {
        console.log(`   ${e.supersetOrder ? e.supersetOrder + ' ' : '  '}${e.muscle.padEnd(11)} T${e.tier} ${e.sets}×${e.reps} ${e.nameEn || e.name}`);
    });
});
const sampleBeg = generateUnifiedPlan({ level: 'beginner', selectedHashtags: ['chest', 'back'], daysPerWeek: 3, equipment: 'mixed' });
console.log(`\n── 抽樣：新手 3天 (#chest#back) W3 強化週 ──`);
sampleBeg.weeks[2].days.forEach(d => {
    console.log(`\n[${d.shortFocus}] ${d.exercises.filter(e => !e.isWarmup && e.tier !== 4).length} 動作`);
    d.exercises.filter(e => !e.isWarmup).forEach(e => {
        console.log(`     ${e.muscle.padEnd(11)} T${e.tier} ${e.sets}×${e.reps} [${e.eq}] ${e.nameEn || e.name}`);
    });
});
