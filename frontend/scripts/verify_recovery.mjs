/**
 * verify_recovery.mjs —— 「準備度 100」不可以憑空出現，跑步要算進肌群恢復。
 *
 * 使用者問的兩句：
 *   「那個準備度是什麼」——
 *      它是 9 塊肌肉分數的平均，而沒練過的肌肉一律算 100。
 *      所以一次都沒練的人拿到「準備度 100 · 恢復 極佳」。
 *      那不是「你恢復得很好」，是「我們沒看過你訓練」。
 *   「跑步系統是不是也要有計算」——
 *      要。前端的 recordWorkoutCompletion 只有重訓頁在呼叫，
 *      所以跑再多，身體肌群恢復圖都還是全綠。
 */
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, '..', p), 'utf8');
const readRoot = (p) => readFileSync(join(HERE, '..', '..', p), 'utf8');

const store = {};
globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
};
globalThis.window = { localStorage: globalThis.localStorage };

const T = await import('../src/utils/muscleRecoveryTracker.js');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};
const reset = () => { for (const k of Object.keys(store)) delete store[k]; };

/* ════════════════════════════════════════════════════════════════
   1 · 全新使用者：不可以拿到任何準備度數字
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 1 · 一次都沒練過的人 ──');
reset();
const fresh = T.getMuscleRecoveryScores('u1');
ok(fresh._anyTracked === false, '_anyTracked = false（我們沒看過他訓練）');
ok(Object.values(fresh._tracked).every((v) => v === false), '每一塊肌肉都標記為「沒練過」');
ok(T.readinessFromScores(fresh) === null, '準備度 = null（不是 100）');

// 舊算法拿同一份資料
const oldWay = (sc) => {
    const vals = Object.entries(sc).filter(([k, v]) => !k.startsWith('_') && Number.isFinite(v)).map(([, v]) => v);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
};
ok(oldWay(fresh) === 100,
    `舊算法（全部平均）對同一個人算出 ${oldWay(fresh)} —— 這就是畫面上那個「準備度 100」`);

/* ════════════════════════════════════════════════════════════════
   2 · 跑步要算進肌群恢復
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 2 · 跑完一趟 10 公里 ──');
reset();
const touched = T.recordCardioCompletion('u1', { distanceKm: 10, durationMin: 55, sport: 'run' });
ok(Array.isArray(touched) && touched.length > 0, `記進了 ${touched?.join('、')}`);
const afterRun = T.getMuscleRecoveryScores('u1');
for (const m of ['calves', 'quads', 'hamstrings', 'glutes', 'abs']) {
    ok(afterRun._tracked[m] === true, `　 ${m} 現在有訓練紀錄了`);
    ok(afterRun[m] < 100, `　 ${m} 分數 ${afterRun[m]}（跑完當下不是滿分）`);
}
ok(afterRun.chest_upper === 100 && afterRun._tracked.chest_upper === false,
    '胸沒被跑步影響（而且仍標記為沒練過）');
const r = T.readinessFromScores(afterRun);
ok(r && Number.isFinite(r.score), `準備度現在算得出來：${r?.score}（來自 ${r?.from} 塊練過的肌肉）`);
// 狀態文字現在統一由 utils/readiness 提供（準備度不只看訓練負荷了）
const { readinessLabel } = await import('../src/utils/readiness.js');
ok(readinessLabel(r.score) !== null, `狀態文字：${readinessLabel(r.score)}`);

console.log('\n── 3 · 輕鬆跑不該把身體圖打成一片紅 ──');
reset(); T.recordCardioCompletion('easy', { distanceKm: 3 });
const easy = T.getMuscleRecoveryScores('easy');
reset(); T.recordCardioCompletion('long', { distanceKm: 25 });
const long = T.getMuscleRecoveryScores('long');
console.log(`  跑完當下：3 公里 ${easy.calves} 分 · 25 公里 ${long.calves} 分`);
ok(easy.calves > long.calves, '3 公里的谷底比 25 公里高（輕鬆跑不該讀成「掏空」）');
ok(easy.calves >= 40, `　 3 公里後小腿 ${easy.calves} 分 —— 不會整片紅`);
ok(long.calves <= 25, `　 25 公里後小腿 ${long.calves} 分 —— 該紅的還是會紅`);

/* ════════════════════════════════════════════════════════════════
   3b · 努力值：距離看不到強度，努力值看得到
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 3b · 同樣 5 公里，輕鬆跑 vs 節奏跑 ──');
// 心率版努力值 = 逐秒 Zone 權重 ÷ 60。5 公里 30 分鐘：
//   全程 Z2(×1.0) → 30 分；全程 Z4(×3.5) → 105 分
const easy5k = { effortScore: 30, effortSource: 'hr', distanceKm: 5, durationMin: 30 };
const tempo5k = { effortScore: 105, effortSource: 'hr', distanceKm: 5, durationMin: 30 };
const le = T.cardioLoadOf(easy5k), lt = T.cardioLoadOf(tempo5k);
console.log(`  Z2 輕鬆跑 → 負荷 ${le.volume}（${le.from}） · Z4 節奏跑 → 負荷 ${lt.volume}（${lt.from}）`);
ok(lt.volume > le.volume * 2, '節奏跑的負荷是輕鬆跑的兩倍以上');
reset(); T.recordCardioCompletion('e', easy5k);
const ea = T.getMuscleRecoveryScores('e');
reset(); T.recordCardioCompletion('t', tempo5k);
const te = T.getMuscleRecoveryScores('t');
console.log(`  跑完當下小腿：輕鬆 ${ea.calves} 分 · 節奏 ${te.calves} 分`);
ok(ea.calves > te.calves, '身體圖上分得出來（以前兩趟一模一樣）');

console.log('\n── 3c · 舊模型（只看距離）分不出這兩趟 ──');
const KM_ONLY = (r) => r.distanceKm * 400;
ok(KM_ONLY(easy5k) === KM_ONLY(tempo5k),
    `舊模型兩趟都算 ${KM_ONLY(easy5k)} —— 強度在它眼裡不存在`);

console.log('\n── 3d · 戴不戴錶，同一趟的負荷要差不多 ──');
// 同一趟 10 公里 60 分鐘 6'00"/km：心率版約 90 分，後備版 = 100 + 36 + 0 = 136 分
const withWatch = T.cardioLoadOf({ effortScore: 90, effortSource: 'hr' });
const noWatch = T.cardioLoadOf({ effortScore: 136, effortSource: 'fallback' });
const gap = Math.abs(withWatch.volume - noWatch.volume) / withWatch.volume;
console.log(`  戴錶 ${withWatch.volume} · 沒戴 ${noWatch.volume}（差 ${Math.round(gap * 100)}%）`);
ok(gap < 0.15, '兩條路校準過，差距在 15% 以內（否則身體圖會因為有沒有戴錶而不一樣）');

console.log('\n── 3e · 沒有努力值才退回距離 ──');
ok(T.cardioLoadOf({ distanceKm: 10 })?.from === 'distance', '只有距離 → 用距離');
ok(T.cardioLoadOf({ durationMin: 40 })?.from === 'duration', '只有時間 → 用時間');
ok(T.cardioLoadOf({ effortScore: 50, effortSource: 'hr', distanceKm: 10 })?.from === 'effort_hr',
    '兩者都有 → 努力值優先');
ok(T.cardioLoadOf({ effortScore: 0, distanceKm: 8 })?.from === 'distance',
    '努力值是 0（沒戴錶又沒後備）→ 退回距離，不是當成「沒負荷」');
ok(T.cardioLoadOf({}) === null, '什麼都沒有 → null');

console.log('\n── 4 · 沒有距離也沒有時間 → 不記一筆假的 ──');
reset();
ok(T.recordCardioCompletion('u1', {}) === null, '完全沒資料 → 回 null');
ok(T.recordCardioCompletion('u1', { distanceKm: 0 }) === null, '距離 0 → 回 null');
ok(T.getMuscleRecoveryScores('u1')._anyTracked === false, '　 也沒有偷偷寫進去');
ok(T.recordCardioCompletion(null, { distanceKm: 5 }) === null, '沒有 userId → 回 null');
ok(T.recordCardioCompletion('u1', { durationMin: 40 }) !== null, '只有時間（跑步機沒記距離）→ 還是算得出來');

/* ════════════════════════════════════════════════════════════════
   5 · 畫面
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 5 · 畫面 ──');
const sculpt = read('src/components/LoeweMuscleSculpture.jsx');
ok(/const centroidOf/.test(sculpt), '算得出每塊肌肉的重心（引線從這裡出發）');
ok(/<g pointerEvents="none">[\s\S]{0,400}centroidOf/.test(sculpt), '標籤那一層不吃點擊（不會擋到 hover）');
ok(/\.filter\(\(p\) => p\.c && isTracked\(p\.m\.id\)\)/.test(sculpt), '沒練過的肌群不標數字');
/* 數字改成拉引線到側邊 —— 壓在人像上要墊黑底、左右對稱的兩塊還會疊字。 */
ok(/GUTTER_L|GUTTER_R/.test(sculpt), '數字拉到人像旁邊，不再壓在肌肉上');
ok(!/paintOrder: 'stroke'/.test(sculpt), '不再需要墊一層黑底才看得到');
ok(/last \+ MIN_GAP/.test(sculpt), '同一側的標籤會推開，不會疊字');
ok(/const zhLabel =/.test(sculpt) && !/>\{m\.label\}</.test(sculpt), '肌群名全中文，而且只有一份');
ok(/const isTracked =/.test(sculpt), '分得出「沒練過」與「完全恢復」');
ok(/overallScore = null/.test(sculpt), '大數字不再預設 100');
ok(/Number\.isFinite\(overallScore\) \? \(/.test(sculpt), '算不出來 → 顯示動作而不是數字');
ok(!/>\s*Recovery\s*</.test(sculpt), '「Recovery」換成中文');

const lux = read('src/components/LuxuryPlanViewMobile.jsx');
ok(/readinessFromScores\(muscleRecoveryScores\)\?\.score \?\? null/.test(lux),
    '恢復度走同一支 readinessFromScores');
ok(!/if \(scores\.length === 0\) return 85;/.test(lux), '不再有憑空的 85 分');

const tracker = read('src/components/CardioTrackerMobile.jsx');
ok(/recordCardioCompletion\(userIdToUse/.test(tracker), '跑步存檔時會記進肌群恢復');
ok(/effortScore: Number\(data\?\.stats\?\.score\)/.test(tracker), '而且把努力值交出去');
ok(/score_source: scoreSource/.test(tracker),
    '努力值連同它的來源一起存（心率版與後備版尺度不同，要據此校準）');
ok(!/let weightKg = 65;/.test(tracker),
    '卡路里不再用 65kg 編（體重是編的，算出來的熱量就是編的）');
ok(/if \(weightKg\) \{/.test(tracker), '沒有真實體重就不給熱量數字');
// 只看 persistCardioSession 這一段（檔案裡別處也有 POST /api/cardio/session）
const persist = tracker.slice(tracker.indexOf('const persistCardioSession'));
const idx = persist.indexOf('recordCardioCompletion(userIdToUse');
const post = persist.indexOf("apiClient.post('/api/cardio/session'");
ok(idx > 0 && post > 0 && idx < post,
    '而且在送出後端請求之前 —— 連線失敗不代表這趟跑步沒發生');

const card = read('src/components/DailyInsightCard.jsx');
ok(!/恢復<\/div>[\s\S]{0,200}text-\[46px\]/.test(card),
    '不再有兩個 46px 大字互搶主角（準備度與恢復是同一個數字的兩種說法）');
ok(/readinessSourceLine\(ready\?\.from \|\| \[\]\)/.test(card),
    '準備度底下那一行會寫出它用了哪些訊號（訓練負荷／睡眠／HRV）');

/* ════════════════════════════════════════════════════════════════
   6 · 後端
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 6 · 後端 ──');
const rec = readRoot('backend/core/recovery.py');
ok(/def calculate_recovery_detail/.test(rec), '拆得出「分數」與「哪些肌群真的練過」');
ok(/return recovery_scores, trained/.test(rec), '回傳 trained 集合');
ok(/cardio_weight = max\(0\.45, min\(1\.5, km \/ 10\.0\)\)/.test(rec),
    '跑步負荷依實際距離縮放（以前 2 公里跟 25 公里被當成一樣重）');
ok(/def calculate_muscle_fatigue/.test(rec) && /scores, _trained = calculate_recovery_detail/.test(rec),
    '舊呼叫端（api_dashboard）照樣拿得到純分數');
const ss = readRoot('backend/core/system_status.py');
ok(/for m in trained/.test(ss), '準備度只把練過的肌群納入平均');
ok(!/scores\.values\(\) if isinstance/.test(ss), '不再把沒練過的 100 分算進去');

console.log(fail === 0
    ? '\n✅ 準備度有來源，跑步也算進肌群恢復\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
