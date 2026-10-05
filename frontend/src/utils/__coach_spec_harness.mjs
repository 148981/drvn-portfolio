// 跑步教練回饋系統 — 規格驗證 loop（固定時間×里程，其餘條件全排列）
// 對照：跑步教練回饋系統_完整規格與驗證_v3.md
// Run: node src/utils/__coach_spec_harness.mjs
import { computeMetrics, buildPool, buildCoachReport, buildRunIntelligence, computeRunScore } from './coachAnalysisEngine.js';

// ── 固定量：時間 30 分、里程 5 km（平均配速 360 s/km）──
const DIST = 5.0, DUR = 1800, AVG = 360;
const arr = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// ── 條件維度 ──
const PACE = {
  neg:  [378, 368, 360, 352, 342],     // 負分割
  pos:  [340, 352, 362, 376, 392],     // 正分割
  even: [362, 358, 361, 359, 360],     // 穩定（有小波動＝真實）
  synth:[360, 360, 360, 360, 360],     // 合成（把平均塞進每段）
};
const HR = {
  none:  null,
  easy:  { mean: 138, drift: 0,  zones: { 'Warm Up': 800, 'Fat Burn': 1000 } },
  drift: { mean: 154, drift: 22, zones: { 'Aerobic': 1400, 'Fat Burn': 400 } },
  ctrl:  { mean: 150, drift: -8, zones: { 'Aerobic': 1500, 'Fat Burn': 300 } }, // 後段心率反降＝控制佳
  high:  { mean: 182, drift: 4,  zones: { 'Anaerobic': 1000, 'Extreme': 600, 'Aerobic': 200 } },
};
const CAD = {
  none:    null,
  fake:    { const: true, v: 112 },    // 整段同一值＝塞出來的假數據
  reallow: { const: false, base: 156 },// 真實逐秒、偏低
  realgood:{ const: false, base: 178 },// 真實逐秒、理想
};
const ELEV = { flat: 5, hilly: 110 };
const EFF = {
  none: null,
  good: { ef: 1.35, decoup: 4 },
  poor: { ef: 1.10, decoup: 13 },
};
const SPORT = ['run', 'bike'];

const priorRuns = arr(6, () => ({ distance: 5.0, duration: 5 * 368 })); // 歷史 ~6:08/km → 本場較快

function buildHRStream(hr) {
  if (!hr) return [];
  const n = 60;
  return arr(n, (i) => {
    const t = i / (n - 1);
    return Math.round(hr.mean - hr.drift / 2 + hr.drift * t + (Math.sin(i) * 2));
  });
}
function buildCadStream(cad) {
  if (!cad) return [];
  if (cad.const) return arr(60, () => cad.v);
  return arr(60, (i) => cad.base + Math.round(Math.sin(i * 0.6) * 6)); // 真實波動
}
function buildSplitHR(hr) { return hr ? hr.mean : 0; }

function makeSession(pace, hr, cad, elev, eff, sport) {
  const hrObj = HR[hr], cadObj = CAD[cad], effObj = EFF[eff];
  const splits = PACE[pace].map((p, i) => ({ km: i + 1, pace: p, avg_hr: buildSplitHR(hrObj) }));
  const physio = {};
  // 誠實：EF/脫鉤需要心率才算得出 → 無心率就不提供（否則本身就是造假）
  if (hrObj && effObj) {
    physio.ef = { current: effObj.ef };
    physio.decoupling = { value: effObj.decoup, first_half_ef: effObj.ef, second_half_ef: effObj.ef - effObj.decoup / 100 };
  }
  return {
    sport,
    stats: {
      distance: DIST, duration: DUR, avgPace: AVG,
      elevationGain: ELEV[elev], score: 60,
      zoneStats: hrObj ? hrObj.zones : {},
    },
    splits,
    stream_data: {
      heart_rate: buildHRStream(hrObj),
      cadence: buildCadStream(cadObj),
      pace: arr(60, () => AVG),
    },
    deepData: { deep_metrics: { zone_distribution: hrObj ? hrObj.zones : {}, recovery_hours: 12 }, physio_metrics: physio },
  };
}

// ── 驗證 ──
let scenarios = 0, viol = 0;
const violations = [];
const dimSeen = new Set();      // 覆蓋矩陣：pool 曾產出的維度 title
const validationSet = new Set();// 肯定文案去重集合（驗證「不會每次都一樣」）
const scoreSet = new Set();     // Run Score 分佈
const record = (cond, tag, ctx) => { if (!cond) { viol++; violations.push(`${tag} @ ${ctx}`); } };

for (const pace of Object.keys(PACE))
  for (const hr of Object.keys(HR))
    for (const cad of Object.keys(CAD))
      for (const elev of Object.keys(ELEV))
        for (const eff of Object.keys(EFF))
          for (const sport of SPORT) {
            // 無心率時 eff 一律 none（生理上算不出 EF）→ 避免重複跑等價情境
            if (hr === 'none' && eff !== 'none') continue;
            scenarios++;
            const ctx = `${sport}/${pace}/hr:${hr}/cad:${cad}/${elev}/eff:${eff}`;
            const s = makeSession(pace, hr, cad, elev, eff, sport);
            const M = computeMetrics(s);
            const pool = buildPool(M);
            const report = buildCoachReport(s);
            const intel = buildRunIntelligence(s, { priorRuns });
            const cards = report.cards;
            const titles = cards.map(c => c.title);
            const cats = cards.map(c => c.category);
            pool.forEach(c => dimSeen.add(c.title.replace(/第 \d+ 公里/, '第 N 公里')));

            // ── Run Score 評分驗證 ──
            const rs = computeRunScore(M);
            validationSet.add(intel.validation);
            if (rs.score != null) scoreSet.add(rs.score);
            record(rs.score === null || (rs.score >= 0 && rs.score <= 100), 'SC 分數超出0-100', ctx);
            // 誠實：合成分段 + 無心率 + 無真實步頻 → 沒有核心可評 → 不評分(null)
            if (pace === 'synth' && hr === 'none' && (cad === 'none' || cad === 'fake')) {
                record(rs.score === null, 'SC 無核心資料卻硬給分', ctx);
            }
            // 有核心資料（真實分段 或 心率）→ 一定給得出分數
            if (pace !== 'synth' || hr !== 'none') {
                record(rs.score !== null, 'SC 有核心資料卻不給分', ctx);
            }
            // 分數與內容一致：Run Score 出現在肯定文案裡（分數驅動）
            if (rs.score != null && !intel.emotion) {
                record(intel.validation.includes(String(rs.score)), 'SC 肯定未反映分數', ctx);
            }

            // ── 完整性不變式 ──
            record(!!intel.validation, 'I1 缺肯定', ctx);
            record(!!intel.progress, 'I2 缺進步定調', ctx);
            record(cards.some(c => c.tone === 'praise'), 'I3 無任何正向卡', ctx);
            record(!!(report.nextStep && report.nextStep.action), 'I4 無下一步處方', ctx);
            record(cards.every(c => !!c.verdict), 'I5 卡缺verdict', ctx);
            record(cards.filter(c => c.tone === 'warn' || c.tone === 'info').every(c => !!c.action), 'I5 warn/info缺action', ctx);

            // ── 誠實鐵律 ──
            if (hr === 'none') {
              record(!cats.includes('heart'), 'H1 無心率卻出心率卡', ctx);
              record(!report.deepCards.some(d => d.key === 'ef' || d.key === 'decoupling'), 'H1 無心率卻算EF/脫鉤', ctx);
            }
            if (cad === 'none' || cad === 'fake') {
              record(!titles.includes('步頻偏低') && !titles.includes('步頻理想'), 'H2 假/無步頻卻下步頻處方', ctx);
            }
            if (pace === 'synth') {
              record(!titles.some(t => /本場亮點 · 第 \d+ 公里/.test(t)), 'H3 合成分段卻出假亮點', ctx);
            }
            if (sport === 'bike') {
              record(!cats.includes('gait'), 'H4 騎車卻出步態卡', ctx);
            }

            // ── 情境專屬期望（在 pool 層檢查該維度有被產出）──
            const pt = pool.map(c => c.title);
            if (sport === 'run') {
              if (pace === 'neg') record(pt.includes('教科書級負分割'), 'S 負分割未觸發', ctx);
              if (pace === 'pos') record(pt.includes('體能分配需調整'), 'S 正分割未觸發', ctx);
              if (cad === 'reallow') record(pt.includes('步頻偏低'), 'S 真低步頻未觸發', ctx);
              if (cad === 'realgood') record(pt.includes('步頻理想'), 'S 真理想步頻未觸發', ctx);
              if ((cad === 'fake' || cad === 'none') && CAD[cad]) { /* fake only */ }
            }
            if (elev === 'hilly') record(pt.some(t => t.includes('丘陵')), 'S 丘陵未觸發', ctx);
            if (hr === 'drift') record(pt.includes('偵測到心率漂移'), 'S 心率漂移未觸發', ctx);
            if (hr === 'ctrl') record(pt.includes('心率控制出色'), 'S 心率控制未觸發', ctx);
            if (hr === 'high') record(pt.includes('高強度佔比偏高'), 'S 高強度未觸發', ctx);
            if (hr === 'easy') record(pt.includes('完美的輕鬆跑'), 'S 完美輕鬆跑未觸發', ctx);
          }

// ── 覆蓋矩陣：規格 §1/§2 每種回饋是否至少被某情境觸發 ──
const mustCover = [
  '教科書級負分割', '體能分配需調整', '穩定如節拍器',
  '偵測到心率漂移', '心率控制出色', '高強度佔比偏高', '完美的輕鬆跑',
  '步頻偏低', '步頻理想', '步頻未取得逐秒數據',
  '丘陵地形 · 隱形肌力課', '本場亮點 · 第 N 公里', '穩定完成',
];
console.log(`\n情境總數: ${scenarios}`);
console.log('\n覆蓋矩陣（每種回饋是否可被某情境觸發）:');
let missing = 0;
for (const m of mustCover) {
  const hit = dimSeen.has(m);
  if (!hit) missing++;
  console.log(`  ${hit ? '✓' : '✗ 未涵蓋'}  ${m}`);
}

console.log(`\nRun Score 出現的相異分數數量: ${scoreSet.size}（範圍 ${Math.min(...scoreSet)}–${Math.max(...scoreSet)}）`);
console.log(`肯定文案相異數量: ${validationSet.size}（越多代表越不會每次都一樣）`);
const varyOK = validationSet.size >= 8 && scoreSet.size >= 10;
record(varyOK, `變化不足：validation=${validationSet.size} score=${scoreSet.size}`, 'variety');

console.log(`\n不變式/誠實違規: ${viol}`);
if (viol) violations.slice(0, 20).forEach(v => console.log('  ✗', v));

const okAll = viol === 0 && missing === 0;
console.log(`\n${okAll ? '✅ 收斂：情境皆符合規格、每種回饋可觸發、分數與肯定都有變化' : '❌ 未收斂，需修正'}`);
process.exit(okAll ? 0 : 1);
