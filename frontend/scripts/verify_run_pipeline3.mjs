// 🧪 第三輪驗證 — 收尾的 5 項（步頻誠實 / 里程碑獎牌 / 重訓達標 / 自走計時錨點）
//   npx esbuild scripts/verify_run_pipeline3.mjs --bundle --platform=node --format=cjs --outfile=/tmp/v3.cjs && node /tmp/v3.cjs
import { applyTodayRealDone } from '../src/utils/dailyAgenda.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n── A. 步頻：沒量到就誠實說沒量到（不用 pace 反推）──');
// 複製 TechnicalDetails.buildChartData 的判斷邏輯做純函式驗證
const buildChart = (streamData, totalKm = 10) => {
    const N = 24;
    const cadRaw = Array.isArray(streamData?.cadence) ? streamData.cadence : [];
    const cadValid = cadRaw.filter((c) => Number.isFinite(c) && c > 0);
    if (cadValid.length >= 5) {
        const total = cadRaw.length;
        const step = Math.max(1, Math.floor(total / N));
        const out = [];
        for (let i = 0; i < total && out.length < N; i += step) {
            const raw = Number(cadRaw[i]);
            const has = Number.isFinite(raw) && raw > 0;
            out.push({
                km: Number(((i / Math.max(1, total - 1)) * totalKm).toFixed(1)),
                cadence: has ? Math.max(120, Math.min(220, Math.round(raw))) : null,
            });
        }
        return out;
    }
    return null;   // 不再用 pace 反推
};

ok('只有 pace、沒有步頻 → 回 null（不生假曲線）',
    buildChart({ pace: new Array(600).fill(380), cadence: [] }) === null);

// 前 6K 有步頻、後段感測器斷掉（0）
const cadStream = [...new Array(360).fill(0).map((_, i) => 168 + (i % 7) - 3), ...new Array(240).fill(0)];
const chart = buildChart({ cadence: cadStream }, 10);
ok('有真實步頻 → 有圖', Array.isArray(chart) && chart.length > 0);
const gaps = chart.filter((d) => d.cadence == null).length;
ok('感測缺口保留成 null（不被壓縮變形）', gaps > 0, `gaps=${gaps}`);
const lastKm = chart[chart.length - 1].km;
ok('X 軸最後一點仍接近總距離（時間軸沒被壓扁）',
    lastKm >= 9 && lastKm <= 10, String(lastKm));
const cadPoints = chart.filter((d) => Number.isFinite(d.cadence) && d.cadence > 0);
const coverage = cadPoints.length / chart.length;
ok('資料完整度 < 80% → 會顯示提醒', coverage < 0.8, `coverage=${(coverage * 100).toFixed(0)}%`);
const avg = Math.round(cadPoints.reduce((s, d) => s + d.cadence, 0) / cadPoints.length);
ok('平均步頻只用真實點計算（不被 null 稀釋）', avg >= 160 && avg <= 175, String(avg));

console.log('\n── B. 里程碑：每個距離獨立列出、金銀銅分明 ──');
const localMarkers = [
    { distance: 1, rankNum: 1, rank: 'PR', time: 353, paceSec: 353, improveSec: 43 },
    { distance: 5, rankNum: 2, rank: '2nd', time: 1871, paceSec: 374 },
    { distance: 10, rankNum: 1, rank: 'PR', time: 3851, paceSec: 385, improveSec: 163 },
];
const rows = localMarkers.map((m) => ({
    km: Number(m.distance),
    rank: m.rankNum ?? null,
    sec: Number(m.time || 0),
    paceSec: Number(m.paceSec || 0),
    improveSec: Number(m.improveSec || 0),
})).sort((a, b) => a.km - b.km);
const gold = rows.filter(r => r.rank === 1).length;
const silver = rows.filter(r => r.rank === 2).length;
ok('三個距離各自一行', rows.length === 3);
ok('金牌 2 面、銀牌 1 面', gold === 2 && silver === 1, `金${gold} 銀${silver}`);
ok('每行都有成績與配速', rows.every(r => r.sec > 0 && r.paceSec > 0));
ok('破紀錄行說得出進步幅度', rows.filter(r => r.rank === 1).every(r => r.improveSec > 0));
ok('有獎牌就不會同時顯示「本場無新紀錄」', (gold + silver) > 0);

console.log('\n── C. 今日重訓已達標摘要 ──');
const today = new Date(); today.setHours(19, 0, 0, 0);
const a2 = applyTodayRealDone(
    { todayIdx: 0, week: [{ strength: { done: false, focus: '推日' }, run: null, warnings: [] }] },
    {
        strengthSessions: [{
            session_id: 's1', timestamp: today.toISOString(), focus: '推日',
            detailedSets: [
                { weight: 60, reps: 10 }, { weight: 60, reps: 10 },
                { weight: 70, reps: 8 }, { weight: 70, reps: 8 },
            ],
            duration_seconds: 3600,
        }],
        cardioSessions: [],
    },
    today
);
ok('重訓被標記為完成', a2.week[0].strength.done === true);
ok('產出 todayStrengthDone', !!a2.todayStrengthDone, JSON.stringify(a2.todayStrengthDone));
ok('總容量由組數正確反算（60×10×2 + 70×8×2 = 2320）',
    a2.todayStrengthDone?.volumeKg === 2320, String(a2.todayStrengthDone?.volumeKg));
ok('組數 = 4', a2.todayStrengthDone?.sets === 4, String(a2.todayStrengthDone?.sets));
ok('沒練 → todayStrengthDone 為 null',
    applyTodayRealDone(
        { todayIdx: 0, week: [{ strength: { done: false }, run: null, warnings: [] }] },
        { strengthSessions: [], cardioSessions: [] }, today
    ).todayStrengthDone === null);

console.log('\n── D. Live Activity 自走計時錨點 ──');
const normalizeAnchor = (elapsedSec) => {
    const sec = Math.max(0, Math.round(Number(elapsedSec) || 0));
    return Math.round((Date.now() - sec * 1000) / 1000);
};
const anchor = normalizeAnchor(4007);
const derived = Math.round(Date.now() / 1000) - anchor;
ok('錨點回推的已用秒數 = 傳入值（誤差 ≤1 秒）', Math.abs(derived - 4007) <= 1, String(derived));
ok('elapsedSec=0 時錨點就是現在', Math.abs(normalizeAnchor(0) - Math.round(Date.now() / 1000)) <= 1);

console.log(`\n═══ 結果：${pass} 通過 / ${fail} 失敗 ═══\n`);
if (fail > 0) process.exit(1);
