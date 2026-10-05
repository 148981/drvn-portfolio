// 🧪 跑步資料管線驗證 — 塞模擬數據，確認每個偵測數據都正確流到該去的地方。
//   跑法：npx esbuild scripts/verify_run_pipeline.mjs --bundle --platform=node --outfile=/tmp/v.cjs && node /tmp/v.cjs
import {
    computePersonalRecords, computeDistanceRankings, buildPRTimeline,
    detectNewRecords, summarizeMedals, formatPaceSec,
} from '../src/utils/personalRecords.js';
import { computeRunScore, buildRunIntelligence } from '../src/utils/coachAnalysisEngine.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

// ── 模擬：使用者截圖那一場 10.22km / 1:06:47 / 逐公里配速真實不同 ──
const todaySplits = [
    { km: 1, time: 353, pace: 353, avgHR: 158, cadence: 168, elevGain: 12 },
    { km: 2, time: 376, pace: 376, avgHR: 163, cadence: 170, elevGain: 24 },
    { km: 3, time: 373, pace: 373, avgHR: 166, cadence: 171, elevGain: 18 },
    { km: 4, time: 388, pace: 388, avgHR: 169, cadence: 169, elevGain: 26 },
    { km: 5, time: 381, pace: 381, avgHR: 171, cadence: 170, elevGain: 20 },
    { km: 6, time: 378, pace: 378, avgHR: 173, cadence: 172, elevGain: 22 },
    { km: 7, time: 401, pace: 401, avgHR: 176, cadence: 167, elevGain: 28 },
    { km: 8, time: 414, pace: 414, avgHR: 179, cadence: 165, elevGain: 24 },
    { km: 9, time: 396, pace: 396, avgHR: 181, cadence: 168, elevGain: 19 },
    { km: 10, time: 391, pace: 391, avgHR: 183, cadence: 169, elevGain: 16 },
    // 尾段 0.22km — 必須被排除在紀錄比較之外
    { km: 11, distanceKm: 0.22, time: 56, pace: 254, avgHR: 184, cadence: 174, elevGain: 0, partial: true },
];
const todayRun = {
    activity_type: 'running', session_id: 'today-1', date: '2026-07-24T21:55:00',
    distance: 10.22, duration: 3907, splits: todaySplits,
};

// 歷史：兩場較慢的跑步 ＋ 一筆腳踏車髒資料（2'17"/km 的 10 公里）
const priorRuns = [
    {
        activity_type: 'running', session_id: 'p1', date: '2026-06-29T20:00:00',
        distance: 10.05, duration: 4460,
        splits: Array.from({ length: 10 }, (_, i) => ({ km: i + 1, time: 440 + i * 4 })),
    },
    {
        activity_type: 'running', session_id: 'p2', date: '2026-07-07T20:00:00',
        distance: 10.1, duration: 4000,
        splits: Array.from({ length: 10 }, (_, i) => ({ km: i + 1, time: 396 + (i % 3) * 6 })),
    },
    // 🚴 腳踏車 — 絕對不能污染跑步 PR
    { activity_type: 'cycling', session_id: 'bike1', date: '2026-07-07T18:00:00', distance: 30, duration: 4110 },
    // 同一筆 p2 重複（後端重複回傳）— 應該被去重
    {
        activity_type: 'running', session_id: 'p2', date: '2026-07-07T20:00:00',
        distance: 10.1, duration: 4000,
        splits: Array.from({ length: 10 }, (_, i) => ({ km: i + 1, time: 396 + (i % 3) * 6 })),
    },
];

console.log('\n── 1. 逐公里分段是否被視為真實 ──');
const rankings = computeDistanceRankings(todayRun, priorRuns);
const byKey = Object.fromEntries(rankings.map((r) => [r.key, r]));
ok('1K 與 10K 的最佳努力配速不同（不再每公里都一樣）',
    byKey['1K'] && byKey['10K'] && byKey['1K'].paceSec !== byKey['10K'].paceSec,
    `1K=${byKey['1K']?.paceSec} 10K=${byKey['10K']?.paceSec}`);
ok('1K 最快 = 最快的那一段 353 秒', byKey['1K']?.sec === 353, `got ${byKey['1K']?.sec}`);
ok('尾段 0.22km(254"/km) 沒有被誤判成 1K 新紀錄',
    byKey['1K']?.sec !== 254 && byKey['1K']?.paceSec > 300, `got ${byKey['1K']?.paceSec}`);

console.log('\n── 2. 髒資料與重複資料過濾 ──');
const pr = computePersonalRecords([...priorRuns, todayRun]);
ok('腳踏車沒有混進跑步 PR（10K 不會出現 2\'17"/km）',
    !pr.standardDistances['10K'] || pr.standardDistances['10K'].avgPaceSec > 150 + 1,
    JSON.stringify(pr.standardDistances['10K']));
ok('10K PR 是合理配速（150–900 秒/km）',
    pr.standardDistances['10K']?.avgPaceSec >= 150 && pr.standardDistances['10K']?.avgPaceSec <= 900,
    `${pr.standardDistances['10K']?.avgPaceSec}`);
ok('重複的 p2 被去重（總筆數 = 3 場跑步）', pr.totalRuns === 3, `totalRuns=${pr.totalRuns}`);

console.log('\n── 3. 破紀錄與獎牌 ──');
ok('本場 10K 是個人新紀錄（金牌）', byKey['10K']?.rank === 1, `rank=${byKey['10K']?.rank}`);
ok('improveSec > 0（說得出快了幾秒）', byKey['10K']?.improveSec > 0, `${byKey['10K']?.improveSec}`);
const medals = summarizeMedals(rankings);
ok('獎牌統計有金牌', medals.gold >= 1, JSON.stringify(medals));

console.log('\n── 4. Run Score：破紀錄必須被獎勵 ──');
const M = {
    splitsReliable: true, paceDiff: 38, paceSpread: 61, isBike: false, isRun: true,
    ef: 1.0, decoup: 16.7, hrValid: new Array(60).fill(170), hrDrift: 17, gain: 209, durationSec: 3907,
    highPct: 60, lowPct: 20, cadReliable: true, cadAvg: 169, distanceKm: 10.22,
};
const before = computeRunScore(M, {});                       // 沒有名次資料（舊行為）
const after = computeRunScore(M, { rankings, paceDeltaVsLast: 25 });
console.log(`     舊分數 ${before.score} (${before.grade}) → 新分數 ${after.score} (${after.grade})`);
console.log('     pillars:', after.pillars.map((p) => `${p.label} ${p.points}/${p.max}`).join(' · '));
ok('破 PR 後分數顯著提高', after.score > before.score + 5, `${before.score} → ${after.score}`);
ok('破 PR 的 10K 不再是 D 級', after.grade !== 'D', `grade=${after.grade}`);
ok('有「突破」這個 pillar', after.pillars.some((p) => p.key === 'achievement'));
ok('突破項拿滿分 20', after.pillars.find((p) => p.key === 'achievement')?.points === 20);

console.log('\n── 5. 教練回饋：肯定是否排在第一 ──');
const intel = buildRunIntelligence(
    { stats: { distance: 10.22, duration: 3907, avgPace: 382 }, splits: todaySplits },
    { priorRuns }
);
console.log(`     validation: ${intel.validation}`);
console.log(`     第一條進步列點: ${intel.progress_points?.[0]}`);
ok('肯定文案提到新紀錄', /新紀錄|紀錄/.test(intel.validation || ''), intel.validation);
ok('第一條進步列點是破紀錄', /🥇/.test(intel.progress_points?.[0] || ''), intel.progress_points?.[0]);
ok('回傳 medalSummary 給 UI', intel.medalSummary && intel.medalSummary.total >= 1,
    JSON.stringify(intel.medalSummary));

console.log('\n── 6. PR 歷程時間軸 ──');
const tl = buildPRTimeline([...priorRuns, todayRun]);
ok('10K 時間軸是遞減（越來越快）',
    (tl['10K'] || []).every((p, i, a) => i === 0 || p.sec < a[i - 1].sec),
    JSON.stringify((tl['10K'] || []).map((p) => p.sec)));
ok('時間軸沒有腳踏車的 2\'17"/km',
    (tl['10K'] || []).every((p) => p.paceSec >= 150), JSON.stringify(tl['10K']));

console.log(`\n═══ 結果：${pass} 通過 / ${fail} 失敗 ═══\n`);
if (fail > 0) process.exit(1);
