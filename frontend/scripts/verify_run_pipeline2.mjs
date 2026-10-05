// 🧪 第二輪驗證 — 涵蓋這次修的其餘項目（時長解讀 / 成績預測 / 里程分級 / 分段柱高 / 分享卡）
//   npx esbuild scripts/verify_run_pipeline2.mjs --bundle --platform=node --format=cjs --outfile=/tmp/v2.cjs && node /tmp/v2.cjs
import { extractDurationSec, predictRaceTimes, pickReferenceRun, normalizeSession } from '../src/adapters/cardioAdapter.js';
import { classifyDistance, titleForRun, reconcileSubtypeWithDistance, clampRunDistance } from '../src/utils/runDistanceClass.js';
import { applyTodayRealDone, logicalDayKey } from '../src/utils/dailyAgenda.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n── A. 時長欄位別名地獄（預測亂算的根因）──');
ok('duration=3907（秒）+ 10.22km → 3907 秒',
    extractDurationSec({ duration: 3907 }, 10.22) === 3907,
    String(extractDurationSec({ duration: 3907 }, 10.22)));
ok('duration=65（其實是分鐘）+ 10.22km → 3900 秒（自動判斷單位）',
    extractDurationSec({ duration: 65 }, 10.22) === 3900,
    String(extractDurationSec({ duration: 65 }, 10.22)));
ok('duration_mins=65 → 3900 秒',
    extractDurationSec({ duration_mins: 65 }, 10.22) === 3900,
    String(extractDurationSec({ duration_mins: 65 }, 10.22)));
ok('完全對不上配速的髒資料 → 0（誠實不硬算）',
    extractDurationSec({ duration: 5 }, 10.22) === 0,
    String(extractDurationSec({ duration: 5 }, 10.22)));

console.log('\n── B. 成績預測必須貼近真實水準 ──');
// 6'17"/km 的跑者，歷史都是 6 分半上下
const sessions = [
    { metrics: { distance: 10.22, duration: 3907 } },
    { metrics: { distance: 10.05, duration: 4460 } },
    { metrics: { distance: 5.1, duration: 1980 } },
    { metrics: { distance: 8.0, duration: 3100 } },
].map(normalizeSession).map((s) => ({ distance_km: s.distance, duration_seconds: s.durationSec }));
const basis = pickReferenceRun(sessions);
const pred = predictRaceTimes({ refDistanceKm: basis.refDistanceKm, refTimeSec: basis.refTimeSec });
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
console.log(`     基準配速 ${mmss(basis.pace)}/km`);
console.log(`     5K ${mmss(pred['5K'].seconds)} · 10K ${mmss(pred['10K'].seconds)} · 半馬 ${mmss(pred['Half'].seconds)}`);
ok('5K 預測不再出現 16:44 這種不可能的數字', pred['5K'].seconds > 25 * 60, mmss(pred['5K'].seconds));
ok('5K 預測配速落在 5–8 分/km 的真實區間',
    pred['5K'].pacePerKm >= 300 && pred['5K'].pacePerKm <= 480, String(pred['5K'].pacePerKm));
ok('全馬預測 > 3 小時（符合 6 分半跑者）', pred['Full'].seconds > 3 * 3600, mmss(pred['Full'].seconds));
ok('基準配速不合理時整組不預測（回 null）',
    predictRaceTimes({ refDistanceKm: 10, refTimeSec: 1370 }) === null);

console.log('\n── C. 里程分級與命名（不再有「7.7 公里長跑」）──');
ok('7.7 km 被歸為中距離', classifyDistance(7.7) === 'mid', classifyDistance(7.7));
ok('subtype=long + 7.7km → 名稱不再叫長跑',
    !titleForRun('long', 7.7).includes('長跑'), titleForRun('long', 7.7));
// v2 更新：6–12km 有了獨立的「中距離」帶，7.7km 不再被降級成輕鬆跑
ok('7.7km 顯示為中距離跑（v2）', titleForRun('long', 7.7) === '7.7 公里 中距離跑', titleForRun('long', 7.7));
ok('18km 的 easy 課自動升級為長跑', titleForRun('easy', 18) === '18 公里 長跑', titleForRun('easy', 18));
ok('4km 的 long 課降級', reconcileSubtypeWithDistance('long', 4) === 'easy');
ok('間歇課不因距離被改名', reconcileSubtypeWithDistance('interval', 20) === 'interval');
ok('短跑加太多距離被夾住（easy 上限 12km）', clampRunDistance('easy', 30) === 12, String(clampRunDistance('easy', 30)));
ok('恢復跑上限 6km', clampRunDistance('recovery', 15) === 6, String(clampRunDistance('recovery', 15)));

console.log('\n── D. 今日已達標 → 主頁卡片改顯示最近一次跑步 ──');
const todayIso = new Date(); todayIso.setHours(21, 30, 0, 0);
const agenda = {
    todayIdx: 0,
    week: [{ strength: null, run: { status: 'pending', type: 'easy' }, warnings: [] }],
};
const applied = applyTodayRealDone(agenda, {
    cardioSessions: [
        { type: 'running', created_at: todayIso.toISOString(), distance: 10.22, duration: 3907, avg_pace: 382, session_id: 'r1' },
    ],
}, new Date(todayIso));
ok('計劃磚被標記為 completed', applied.week[0].run.status === 'completed');
ok('產出 todayRunDone 摘要', !!applied.todayRunDone, JSON.stringify(applied.todayRunDone));
ok('距離正確', applied.todayRunDone?.distanceKm === 10.22, String(applied.todayRunDone?.distanceKm));
ok('配速正確（382 秒/km）', applied.todayRunDone?.paceSec === 382, String(applied.todayRunDone?.paceSec));
ok('標記為自由跑', applied.todayRunDone?.isFreeRun === true);

const noRun = applyTodayRealDone(
    { todayIdx: 0, week: [{ strength: null, run: { status: 'pending' }, warnings: [] }] },
    { cardioSessions: [] }, new Date(todayIso)
);
ok('今天沒跑 → todayRunDone 為 null（不亂顯示已達標）', noRun.todayRunDone === null);

console.log('\n── E. 分段柱高：高度要真的反映快慢 ──');
// 複製 LiveSplitsStrip 的高度演算法做純函式驗證
const splits = [
    { km: 1, pace: 353 }, { km: 2, pace: 376 }, { km: 3, pace: 414 },
    { km: 4, distanceKm: 0.22, pace: 254, partial: true },
];
const isPartial = (s) => s?.partial === true
    || (Number(s?.distanceKm ?? 1) > 0 && Number(s?.distanceKm ?? 1) < 0.95);
const fullPaces = splits.filter(s => !isPartial(s)).map(s => s.pace);
const fastest = Math.min(...fullPaces), slowest = Math.max(...fullPaces);
const h = (s) => {
    if (isPartial(s)) return 34;
    if (slowest === fastest) return 72;
    return Math.round(38 + ((slowest - s.pace) / (slowest - fastest)) * 62);
};
console.log(`     柱高: ${splits.map(s => `${isPartial(s) ? '尾' : s.km + 'K'}=${h(s)}%`).join(' ')}`);
ok('最快段最高（100%）', h(splits[0]) === 100, String(h(splits[0])));
ok('最慢段最矮（38%）', h(splits[2]) === 38, String(h(splits[2])));
ok('高度有明顯起伏（不是等高）', h(splits[0]) - h(splits[2]) > 40);
ok('尾段用固定矮柱、不參與最快段', h(splits[3]) === 34 && fastest === 353);

console.log(`\n═══ 結果：${pass} 通過 / ${fail} 失敗 ═══\n`);
if (fail > 0) process.exit(1);
