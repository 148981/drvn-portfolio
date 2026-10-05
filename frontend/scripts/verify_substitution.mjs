// Run with: node --import ./scripts/_register_hooks.mjs scripts/verify_substitution.mjs
// 替代動作系統的守門員：
//   ① 動作模式表與 ALL_EXERCISES 一對一對齊（有人加動作忘了給模式 → 這裡擋下）
//   ② 真的不會亂塞：跨部位、跨模式的假替代要是 0
//   ③ 排序真的照「你常練的 → 健身房常有的」走
//   ④ 舊做法（同 muscle + tier 排序）確實會產生上面那些垃圾 —— 沒有這一段，
//      前三項可能只是在證明一個本來就對的東西。
import { ALL_EXERCISES } from '../src/utils/UnifiedTrainingEngine.js';
import { EXERCISE_PATTERN, patternOfExercise, muscleOfExercise, equipmentZh, PATTERN_ZH } from '../src/utils/exerciseTaxonomy.js';
import { getSubstitutes } from '../src/utils/exerciseSubstitution.js';
import { toZhExerciseName } from '../src/utils/exerciseNameZh.js';

let failures = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { failures++; console.log('  ❌ ' + m); };
const check = (cond, m, detail = '') => cond ? ok(m) : bad(m + (detail ? ' → ' + detail : ''));

// ── 用 localStorage 假替身餵訓練紀錄，驗「你常練的排前面」 ──────────
function installStorage(records) {
    const store = {};
    if (records) store['trainingRecords'] = JSON.stringify(records);
    global.localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        key: (i) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; },
    };
    global.window = global.window || { localStorage: global.localStorage, addEventListener() {}, removeEventListener() {} };
    global.window.localStorage = global.localStorage;
}
installStorage(null);

console.log('\n── ① 動作模式表與動作庫對齊 ──');
const libNames = new Set(ALL_EXERCISES.map((e) => e.name));
const mapNames = new Set(Object.keys(EXERCISE_PATTERN));
const missing = [...libNames].filter((n) => !mapNames.has(n));
const orphan = [...mapNames].filter((n) => !libNames.has(n));
check(missing.length === 0, `動作庫 ${libNames.size} 個動作都有動作模式`, missing.slice(0, 5).join('、'));
check(orphan.length === 0, '模式表沒有動作庫不存在的孤兒', orphan.slice(0, 5).join('、'));
const unknownPattern = Object.entries(EXERCISE_PATTERN).filter(([, p]) => !PATTERN_ZH[p]);
check(unknownPattern.length === 0, '每個模式都有中文名', unknownPattern.slice(0, 3).map(([n, p]) => `${n}=${p}`).join('、'));

console.log('\n── ② 不會亂塞：每一個候選都必須同模式或同部位 ──');
let crossJunk = [];
for (const ex of ALL_EXERCISES) {
    const p = patternOfExercise(ex.name), m = muscleOfExercise(ex.name);
    for (const s of getSubstitutes(ex.name, { userId: 'verify', limit: 20 })) {
        const sp = patternOfExercise(s.name), sm = muscleOfExercise(s.name);
        if (sp !== p && sm !== m) crossJunk.push(`${ex.name} → ${s.name}`);
        if (s.name === ex.name) crossJunk.push(`${ex.name} → 自己`);
    }
}
check(crossJunk.length === 0, '全庫掃描沒有跨模式又跨部位的假替代', crossJunk.slice(0, 4).join(' / '));

console.log('\n── ②-1 螢幕上看得到的那幾筆垃圾，現在不見了 ──');
const namesOf = (n) => getSubstitutes(n, { userId: 'verify', limit: 20 }).map((s) => s.name);
const pullUps = namesOf('Pull Ups');
check(!pullUps.includes('Deadlift'), '引體向上不再被推薦「硬舉」', pullUps.join('、'));
check(!pullUps.includes('Hyperextensions'), '引體向上不再被推薦「背部伸展」');
const lat = namesOf('Dumbbell Lateral Raise');
check(!lat.includes('Barbell Overhead Press'), '側平舉不再被推薦「槓鈴肩推」', lat.join('、'));
check(lat.every((n) => patternOfExercise(n) === 'lateral-raise' || muscleOfExercise(n) === 'shoulders'),
    '側平舉的候選全部仍在肩部範圍內');
const bench = namesOf('Barbell Bench Press');
check(!bench.includes('Pec Deck Fly') || bench.indexOf('Pec Deck Fly') > bench.indexOf('Dumbbell Bench Press'),
    '臥推的夾胸類候選排在推類候選之後');
check(getSubstitutes('Sled Push', { userId: 'verify' }).length === 0,
    '查不到定義的自訂動作回傳空清單，不再倒出全部位 Tier 1 複合動作');

console.log('\n── ②-2 中文課表名也查得到（以前查不到就走 fallback）──');
const rdlZh = getSubstitutes('羅馬尼亞硬舉', { userId: 'verify', limit: 20 });
check(rdlZh.length > 0, '中文名「羅馬尼亞硬舉」查得到替代動作', String(rdlZh.length));
check(!rdlZh.some((s) => s.name === 'Romanian Deadlift'),
    '中文名不會把自己列進替代清單', rdlZh.map((s) => s.name).join('、'));
check(rdlZh.every((s) => /[一-鿿]/.test(toZhExerciseName(s.name))),
    '清單上每一個動作都有中文名（不會顯示英文）',
    rdlZh.filter((s) => !/[一-鿿]/.test(toZhExerciseName(s.name))).map((s) => s.name).join('、'));
check(rdlZh.every((s) => s.eqZh),
    '每一個候選都有中文器材標籤', rdlZh.filter((s) => !s.eqZh).map((s) => s.name).join('、'));
check(rdlZh.every((s) => equipmentZh(s.eq) === s.eqZh),
    '器材標籤與動作定義一致（不會出現「啞鈴◯◯」卻標槓鈴）');

console.log('\n── ③ 排序：你常練的排前面 ──');
const before = namesOf('Barbell Bench Press');
// 故意挑「沒有歷史時排最後一名」的那個動作：它跑到第一，才證明排序真的被歷史推動，
// 而不是剛好本來就在前面。
const underdog = before[before.length - 1];
installStorage({
    s1: { timestamp: new Date().toISOString(), exercises: [{ name: underdog, setsCount: 40 }] },
});
const after = getSubstitutes('Barbell Bench Press', { userId: 'verify', limit: 20 });
check(before[0] !== underdog, `沒有紀錄時「${underdog}」排在最後`, `原本第一名 ${before[0]}`);
check(after[0]?.name === underdog,
    `練了 40 組「${underdog}」之後它排到第一`, `第一名是 ${after[0]?.name}`);
check(after[0]?.reason === '你練過 40 組', '理由標籤寫出真實組數', String(after[0]?.reason));
installStorage(null);
const noHist = getSubstitutes('Barbell Bench Press', { userId: 'verify', limit: 20 });
check(noHist.every((s) => s.familiarSets === 0 && s.reason !== undefined),
    '沒有訓練紀錄時不會憑空生出「你練過」');
check(noHist.every((s) => !String(s.reason).includes('練過')),
    '沒有紀錄時理由不會出現「練過」字樣', noHist.map((s) => s.reason).join('、'));

console.log('\n── ③-1 健身房常有的排在冷門器材前面 ──');
const hinge = noHist.length; // touch
const squat = getSubstitutes('Barbell Back Squat', { userId: 'verify', limit: 20 }).map((s) => s.name);
check(squat.indexOf('Leg Press') < squat.indexOf('Hack Squat'),
    '腿推（普及）排在哈克機（少見）前面', squat.join('、'));
const curls = getSubstitutes('Barbell Bicep Curl', { userId: 'verify', limit: 20 }).map((s) => s.name);
check(curls.indexOf('Dumbbell Bicep Curl') < curls.indexOf('Band Bicep Curl'),
    '啞鈴彎舉排在彈力帶彎舉前面', curls.join('、'));

console.log('\n── ④ 舊做法確實會產生那些垃圾（沒有這一段，上面等於沒證明什麼）──');
function legacyOptions(currentExDef) {
    const realDef = ALL_EXERCISES.find((e) => e.name === currentExDef.name) || {};
    const targetMuscle = currentExDef.muscle || realDef.muscle || null;
    const targetZone = currentExDef.zone || realDef.zone || '';
    const sortByZoneTier = (a, b) => {
        const aZ = a.zone || '', bZ = b.zone || '';
        if (targetZone) {
            if (aZ === targetZone && bZ !== targetZone) return -1;
            if (aZ !== targetZone && bZ === targetZone) return 1;
        }
        return (a.tier || 3) - (b.tier || 3);
    };
    let options = ALL_EXERCISES.filter((ex) => targetMuscle && ex.muscle === targetMuscle && ex.name !== currentExDef.name).sort(sortByZoneTier);
    if (options.length === 0) {
        const zp = (targetZone || '').split('-')[0];
        if (zp) options = ALL_EXERCISES.filter((ex) => (ex.zone || '').startsWith(zp) && ex.name !== currentExDef.name).sort(sortByZoneTier);
        if (options.length === 0) options = ALL_EXERCISES.filter((ex) => (ex.tier || 3) === 1 && ex.name !== currentExDef.name).sort((a, b) => (a.muscle || '').localeCompare(b.muscle || ''));
    }
    return options.slice(0, 14).map((e) => e.name);
}
const legacyPull = legacyOptions(ALL_EXERCISES.find((e) => e.name === 'Pull Ups'));
check(legacyPull.includes('Deadlift'), '舊做法真的會把「硬舉」塞進引體向上的替代清單');
const legacyLat = legacyOptions(ALL_EXERCISES.find((e) => e.name === 'Dumbbell Lateral Raise'));
check(legacyLat.includes('Barbell Overhead Press'), '舊做法真的會把「槓鈴肩推」塞進側平舉的替代清單');
const legacyCustom = legacyOptions({ name: 'Sled Push' });
check(legacyCustom.includes('Barbell Bench Press') && legacyCustom.includes('Barbell Back Squat'),
    '舊做法真的會對未知動作倒出臥推＋深蹲這種跨部位清單');
const legacyRdlZh = legacyOptions({ name: '羅馬尼亞硬舉', muscle: 'hamstrings', zone: 'hamstrings-hinge' });
check(legacyRdlZh.includes('Romanian Deadlift'),
    '舊做法真的會把「羅馬尼亞硬舉」自己列進自己的替代清單（中文名對不上英文庫）');

console.log(`\n${failures === 0 ? '✅ 替代動作系統 全部通過' : `❌ 替代動作系統 ${failures} 項未通過`}`);
process.exit(failures === 0 ? 0 : 1);
