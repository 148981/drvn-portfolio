// 🧪 規格書 v2 驗收 — 逐條對照「精確標準」，不是「大概做了」。
//   npx esbuild scripts/verify_spec_v2.mjs --bundle --platform=node --format=cjs --outfile=/tmp/s2.cjs && node /tmp/s2.cjs
import {
    classifyDistance, titleForRun, reconcileSubtypeWithDistance,
    clampRunDistance, distanceRangeFor, previewDistanceStep, chipForRun,
} from '../src/utils/runDistanceClass.js';
import { predictRaceTimesByNeighborhood, pickReferenceForDistance } from '../src/adapters/cardioAdapter.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ════════════════════════════════════════════════════════════
console.log('\n── B1. 三段里程分級（<6 短 / 6–12 中 / >12 長）──');
ok('3.2 km → 短距離', classifyDistance(3.2) === 'short');
ok('8 km → 中距離', classifyDistance(8) === 'mid');
ok('16 km → 長距離', classifyDistance(16) === 'long');
ok('6 km 邊界 → 中距離', classifyDistance(6) === 'mid');
ok('12 km 邊界 → 中距離', classifyDistance(12) === 'mid');
ok('12.5 km → 長距離', classifyDistance(12.5) === 'long');

console.log('\n   課名跟著里程走：');
ok('titleForRun(easy, 3.2) = "3.2 公里 輕鬆跑"',
    titleForRun('easy', 3.2) === '3.2 公里 輕鬆跑', titleForRun('easy', 3.2));
ok('titleForRun(easy, 8) = "8 公里 中距離跑"  ← v2 新增',
    titleForRun('easy', 8) === '8 公里 中距離跑', titleForRun('easy', 8));
ok('titleForRun(easy, 16) = "16 公里 長跑"',
    titleForRun('easy', 16) === '16 公里 長跑', titleForRun('easy', 16));
ok('titleForRun(long, 4) = "4 公里 輕鬆跑"（降級）',
    titleForRun('long', 4) === '4 公里 輕鬆跑', titleForRun('long', 4));
ok('titleForRun(interval, 20) 不被距離改名',
    titleForRun('interval', 20) === '20 公里 間歇跑', titleForRun('interval', 20));
ok('titleForRun(tempo, 3) 不被距離改名',
    titleForRun('tempo', 3) === '3 公里 節奏跑', titleForRun('tempo', 3));
ok('恢復跑在短距離帶維持原名',
    titleForRun('recovery', 4) === '4 公里 恢復慢跑', titleForRun('recovery', 4));
ok('整數不補小數點（16 不是 16.0）', !titleForRun('easy', 16).includes('16.0'));

console.log('\n   chip 標籤對應：');
ok('3.2km → EASY 綠', chipForRun('easy', 3.2).text === 'EASY');
ok('8km → MEDIUM 黃', chipForRun('easy', 8).text === 'MEDIUM', chipForRun('easy', 8).text);
ok('16km → LONG 橘', chipForRun('easy', 16).text === 'LONG', chipForRun('easy', 16).text);

// ════════════════════════════════════════════════════════════
console.log('\n── B2. ± 調整器：上下限、跨界改名、觸覺時機 ──');
ok('輕鬆跑上限 12 km', distanceRangeFor('easy').max === 12);
ok('中距離範圍 6–16 km',
    distanceRangeFor('medium').min === 6 && distanceRangeFor('medium').max === 16);
ok('恢復跑上限 6 km', distanceRangeFor('recovery').max === 6);
ok('步進 0.5 km', distanceRangeFor('easy').step === 0.5);

const stepUp = previewDistanceStep('easy', 5.5, +1);
ok('5.5 → 6.0 會跨界（短→中）', stepUp.willChangeBand === true, JSON.stringify(stepUp));
ok('5.5 → 6.0 課名變成中距離跑',
    stepUp.nextTitle === '6 公里 中距離跑', stepUp.nextTitle);
const stepNoChange = previewDistanceStep('easy', 3.0, +1);
ok('3.0 → 3.5 不跨界', stepNoChange.willChangeBand === false);
const atMax = previewDistanceStep('recovery', 6, +1);
ok('恢復跑 6km 再按 + 到頂（atLimit）', atMax.atLimit === true, JSON.stringify(atMax));
ok('到頂時有原因說明', /恢復/.test(atMax.hint), atMax.hint);
ok('短跑被夾住不能加到 30km', clampRunDistance('easy', 30) === 12);

// ════════════════════════════════════════════════════════════
console.log('\n── A1. 成績預測：用最接近該距離的紀錄 ──');

// 案例 1：兩筆 5.x + 一筆 10.2 → 5K 要用前兩筆，不被 10K 稀釋
const case1 = [
    { metrics: { distance_km: 5.1, duration_seconds: Math.round(5.1 * 380) } },  // 6'20"
    { metrics: { distance_km: 5.4, duration_seconds: Math.round(5.4 * 370) } },  // 6'10"
    { metrics: { distance_km: 10.2, duration_seconds: Math.round(10.2 * 390) } },// 6'30"
];
const p1 = predictRaceTimesByNeighborhood(case1);
console.log(`     5K=${mmss(p1['5K'].seconds)} (${p1['5K'].basis}, ${p1['5K'].sampleSize}筆)　10K=${mmss(p1['10K'].seconds)} (${p1['10K'].basis}, ${p1['10K'].sampleSize}筆)`);
ok('5K 用鄰域', p1['5K'].basis === 'neighborhood', p1['5K'].basis);
ok('5K 樣本數 = 2（只採 5.1 與 5.4）', p1['5K'].sampleSize === 2, String(p1['5K'].sampleSize));
ok('5K 配速接近 6\'15"（375±8 秒）',
    Math.abs(p1['5K'].pacePerKm - 375) <= 8, String(p1['5K'].pacePerKm));
ok('5K 沒被 10K 的 6\'30" 稀釋', p1['5K'].pacePerKm < 385, String(p1['5K'].pacePerKm));
ok('10K 用鄰域且只採 10.2', p1['10K'].sampleSize === 1, String(p1['10K'].sampleSize));
ok('5K 信心度 0.9', p1['5K'].confidence === 0.9);
ok('有 sourceLabel 說明依據', /筆/.test(p1['5K'].sourceLabel || ''), p1['5K'].sourceLabel);

// 案例 2：只有 10.2 → 5K 走 nearest
const case2 = [{ metrics: { distance_km: 10.2, duration_seconds: Math.round(10.2 * 390) } }];
const p2 = predictRaceTimesByNeighborhood(case2);
ok('只有 10.2km 時 5K 走 nearest', p2['5K'].basis === 'nearest', p2['5K'].basis);
ok('nearest 信心度 0.55', p2['5K'].confidence === 0.55);
ok('nearest 的 sourceLabel 標明參考性較低',
    /參考性較低/.test(p2['5K'].sourceLabel || ''), p2['5K'].sourceLabel);

// 案例 3：只跑過 5.1km → 全馬不預測（42.195 > 5.1 × 2.5）
const case3 = [{ metrics: { distance_km: 5.1, duration_seconds: Math.round(5.1 * 380) } }];
const p3 = predictRaceTimesByNeighborhood(case3);
ok('只跑過 5.1km → 不預測全馬', !p3['Full'], JSON.stringify(p3['Full']));
ok('只跑過 5.1km → 不預測半馬', !p3['Half'], JSON.stringify(p3['Half']));
ok('只跑過 5.1km → 10K 仍可預測（10 < 5.1×2.5）', !!p3['10K']);
ok('5K 本身正常預測', !!p3['5K']);

// 案例 4：全是腳踏車配速 → 全部剔除
const case4 = [
    { metrics: { distance_km: 30, duration_seconds: Math.round(30 * 130) } },
    { metrics: { distance_km: 25, duration_seconds: Math.round(25 * 125) } },
];
ok('腳踏車配速全被剔除 → 不預測', predictRaceTimesByNeighborhood(case4) === null);

// 案例 5：真實使用者情境（6'17"/km 的 10K 跑者）
const case5 = [
    { metrics: { distance_km: 10.22, duration_seconds: 3907 } },
    { metrics: { distance_km: 10.05, duration_seconds: 4460 } },
    { metrics: { distance_km: 5.1, duration_seconds: 1980 } },
    { metrics: { distance_km: 8.0, duration_seconds: 3100 } },
];
const p5 = predictRaceTimesByNeighborhood(case5);
console.log(`     真實情境：5K=${mmss(p5['5K'].seconds)}　10K=${mmss(p5['10K'].seconds)}　半馬=${p5['Half'] ? mmss(p5['Half'].seconds) : '不預測'}`);
ok('5K 不再是 16:44 這種幻想數字', p5['5K'].seconds > 25 * 60, mmss(p5['5K'].seconds));
ok('10K 落在 62–78 分（符合 6 分半跑者）',
    p5['10K'].seconds > 62 * 60 && p5['10K'].seconds < 78 * 60, mmss(p5['10K'].seconds));
ok('半馬有預測（21.1 < 10.22×2.5）', !!p5['Half']);
ok('全馬不預測（42.2 > 10.22×2.5）', !p5['Full']);

// ════════════════════════════════════════════════════════════
console.log('\n── P0-1. 標題不再重複 ──');
ok('titleForRun 自帶里程，不需外部再前綴',
    titleForRun('easy', 3.6) === '3.6 公里 輕鬆跑', titleForRun('easy', 3.6));
ok('不會出現「3.6 公里 3.6 公里」',
    !/3\.6 公里 3\.6 公里/.test(titleForRun('easy', 3.6)));

console.log(`\n═══ 結果：${pass} 通過 / ${fail} 失敗 ═══\n`);
if (fail > 0) process.exit(1);
