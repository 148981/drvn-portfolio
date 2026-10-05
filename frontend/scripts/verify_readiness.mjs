/**
 * verify_readiness.mjs —— 準備度合成得對，而且永遠說得出它從哪來。
 *
 * 使用者要的三件事：
 *   ① 整體恢復度要把睡眠 / HRV 納入考量與顯示
 *   ② 跑步頁上方的提示字也要有這項數據
 *   ③ 沒有睡眠 / HRV 就退回「重訓與跑步後的身體恢復度」
 *
 * 最容易出事的地方是③：缺的訊號被一個預設值頂替（例如睡眠當成 7.6 小時），
 * 算出來的準備度有一半是編的，而畫面不會說哪一半。
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
const readIos = (p) => readFileSync(join(HERE, '..', '..', 'ios', 'FitnessApp', p), 'utf8');

const store = {};
globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
};
globalThis.window = { localStorage: globalThis.localStorage };

const R = await import('../src/utils/readiness.js');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

/* ════════════════════════════════════════════════════════════════
   1 · 退回行為：沒有健康資料就只用訓練負荷
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 1 · 有哪些訊號就用哪些 ──');
const onlyLoad = R.computeReadiness({ loadScore: 70, signals: null });
ok(onlyLoad?.score === 70, `只有訓練負荷 → ${onlyLoad?.score}（原封不動）`);
ok(onlyLoad?.from.join('') === '訓練負荷', `來源寫「${onlyLoad?.from.join(' · ')}」`);

const withSleep = R.computeReadiness({ loadScore: 70, signals: { sleepHours: 5 } });
ok(withSleep.from.length === 2, `加上睡眠 → 來源「${withSleep.from.join(' · ')}」`);
ok(withSleep.score < onlyLoad.score, `睡 5 小時把準備度從 ${onlyLoad.score} 拉到 ${withSleep.score}`);

const goodSleep = R.computeReadiness({ loadScore: 70, signals: { sleepHours: 8.5 } });
ok(goodSleep.score > onlyLoad.score, `睡 8.5 小時拉到 ${goodSleep.score}`);

const nothing = R.computeReadiness({ loadScore: null, signals: null });
ok(nothing === null, '什麼訊號都沒有 → null（畫面顯示動作，不是滿分數字）');
ok(R.computeReadiness({ loadScore: null, signals: { sleepHours: 7 } })?.from.join('') === '睡眠',
    '只有睡眠也算得出來（還沒練過但有手錶的人）');

/* ════════════════════════════════════════════════════════════════
   2 · HRV / 靜息心率一定要有「自己的」基準
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 2 · 樣本不夠就不敢講 ──');
ok(R.hrvScoreOf(40, 55, 3) === null, `只有 3 天樣本 → 不採用（門檻 ${R.MIN_BASELINE_SAMPLES} 天）`);
ok(R.hrvScoreOf(40, 55, 20) !== null, '20 天樣本 → 採用');
ok(R.hrvScoreOf(40, null, 20) === null, '沒有基準 → 不採用');

const lowHrv = R.hrvScoreOf(40, 55, 20);      // 比值 0.73
const normHrv = R.hrvScoreOf(55, 55, 20);     // 比值 1.00
const highHrv = R.hrvScoreOf(65, 55, 20);     // 比值 1.18
console.log(`  HRV 40/55 → ${lowHrv} 分 · 55/55 → ${normHrv} 分 · 65/55 → ${highHrv} 分`);
ok(lowHrv < normHrv && normHrv < highHrv, '比自己的基準低就扣分，高就加分');
ok(highHrv === 100, '高於基準封頂 100（不會因為今天特別高就爆表）');

console.log('\n── 3 · 同一個絕對值，對不同人是不同意思 ──');
const personA = R.hrvScoreOf(45, 45, 20);   // 45ms 是這個人的常態
const personB = R.hrvScoreOf(45, 70, 20);   // 45ms 對這個人是明顯偏低
console.log(`  HRV 都是 45ms：A（基準 45）→ ${personA} 分 · B（基準 70）→ ${personB} 分`);
ok(personA > personB, '跟自己比才有意義');
// 舊寫法是 population 門檻
const oldWay = (hrv) => (hrv > 50 ? 100 : (hrv > 30 ? 75 : 50));
ok(oldWay(45) === oldWay(45), `舊寫法兩個人都算 ${oldWay(45)} 分 —— 看不出 B 的狀況`);

console.log('\n── 4 · 靜息心率 ──');
ok(R.rhrScoreOf(52, 52, 20) === 100, '跟基準持平 → 100');
ok(R.rhrScoreOf(57, 52, 20) === 50, '高 5 bpm → 50');
ok(R.rhrScoreOf(48, 52, 20) === 100, '低於基準 → 一樣 100（不會因為心跳慢就扣分）');
ok(R.rhrScoreOf(70, 52, 20) === 0, '高 18 bpm → 0');

/* ════════════════════════════════════════════════════════════════
   5 · 存取訊號
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 5 · 訊號的存與讀 ──');
for (const k of Object.keys(store)) delete store[k];
R.saveRecoverySignals('u1', { sleepHours: 7.2, hrv: 48, hrvBaseline: 52, hrvSamples: 21 });
const got = R.readRecoverySignals('u1');
ok(got?.sleepHours === 7.2 && got?.hrvSamples === 21, '存得進也讀得回');
// 原生端每次送的是「現在」的完整快照（readiness.js 9dae692 起不合併上一次）：
//   這次沒有睡眠 = 昨晚沒記錄到。以前合併舊值，一個月前戴錶睡的那一晚會每天被蓋上新時間戳，
//   一直被當成「昨晚」。null 不存成 0，也不把舊的睡眠搬過來。
R.saveRecoverySignals('u1', { sleepHours: null, hrv: 50 });
const after = R.readRecoverySignals('u1');
ok(after.sleepHours === undefined, '這次沒送睡眠 → 不沿用舊的那一晚（也不存成 0）');
ok(after.hrv === 50, '有值的欄位照樣更新');
// 太舊的訊號不能拿來講今天
store[`drvn_recovery_signals_u1`] = JSON.stringify({ ...after, at: Date.now() - 20 * 3600 * 1000 });
ok(R.readRecoverySignals('u1') === null, '超過 18 小時 → 當作沒有（昨天的睡眠講不了今天）');
ok(R.saveRecoverySignals(null, { sleepHours: 8 }) === null, '沒有 userId → 不存');

/* ════════════════════════════════════════════════════════════════
   6 · iOS：資料真的接起來了
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 6 · iOS 端 ──');
const hk = readIos('HealthKitManager.swift');
for (const [id, zh] of [
    ['heartRateVariabilitySDNN', 'HRV'],
    ['restingHeartRate', '靜息心率'],
    ['sleepAnalysis', '睡眠'],
]) ok(hk.includes(id), `requestAuthorization 有要 ${zh}`);
ok(/func fetchRecoverySignals/.test(hk), '有一支 fetchRecoverySignals 把三個訊號抓齊');
ok(/asleepCore|asleepREM/.test(hk), '睡眠只算真的睡著（不含躺著沒睡的 inBed）');
ok(/let rest = Array\(values\.dropFirst\(\)\)/.test(hk),
    '基準排除今天最新那一筆（否則今天的值會把自己的基準拉走）');
ok(/completion\(nil\); return/.test(hk), '沒有樣本回 nil，不是回 0');

const wv = readIos('WebView.swift');
ok(/case "requestReadiness":/.test(wv),
    'bridge 接上 requestReadiness（前端一直在發，以前掉進 default: break）');
ok(/sendMessage\(type: "readinessUpdate"/.test(wv), '回一個 readinessUpdate 給前端');

const plist = readIos('Info.plist');
ok(/睡眠/.test(plist) && /HRV/.test(plist),
    'Info.plist 的健康資料用途說明有寫到睡眠與 HRV（沒寫會被審核擋）');

/* ════════════════════════════════════════════════════════════════
   7 · 前端：一個人只會看到一個準備度
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 7 · 只有一套算法 ──');
const hook = read('src/hooks/useHealthKit.js');
ok(/saveRecoverySignals\(getUserId\(\), data\)/.test(hook), '收到訊號會存起來（別的畫面才讀得到）');

// 全 App 只有一個入口 getTodayReadiness（它內部呼叫 computeReadiness）——
// 畫面不可以自己拼 computeReadiness，否則會員界線與訊號來源又會各算各的。
const rsrc = read('src/utils/readiness.js');
ok(/export function getTodayReadiness[\s\S]{0,400}computeReadiness\(/.test(rsrc), 'getTodayReadiness 內部用 computeReadiness（唯一算法）');
for (const [f, zh] of [
    ['src/components/DailyInsightCard.jsx', '首頁狀態表'],
    ['src/components/CardioTrackerMobile.jsx', '跑步頁上方提示'],
    ['src/components/TrainingAnalyticsDashboard.jsx', '分析儀表板'],
    ['src/components/ActionFirstDashboardMobile.jsx', '首頁恢復卡'],
    ['src/components/TrainingRecordPageMobile.jsx', '訓練紀錄'],
]) {
    const src = read(f);
    ok(/getTodayReadiness\(/.test(src) && !/computeReadiness\(/.test(src), `${zh}用同一個入口 getTodayReadiness`);
}

// 會員界線：睡眠／HRV／靜息心率是會員；訓練負荷永遠算（安全）
for (const k of Object.keys(store)) delete store[k];
R.saveRecoverySignals('g1', { sleepHours: 4 });
R.setReadinessSignalGate(() => false);
const freeR = R.getTodayReadiness('g1');
ok(freeR === null || !freeR.from.includes('睡眠'), '免費版：準備度不算睡眠（只剩訓練負荷，或沒有就回 null）');
ok(R.readinessSignalsLocked('g1') === true, '免費版手上有睡眠資料 → 畫面知道要放會員卡');
R.setReadinessSignalGate(() => true);
const memR = R.getTodayReadiness('g1');
ok(memR?.from.includes('睡眠'), '會員：睡眠算進準備度');
ok(R.readinessSignalsLocked('g1') === false, '會員：不放會員卡');
R.setReadinessSignalGate(null);
ok(R.getTodayReadiness('g1')?.from.includes('睡眠'), '沒注入規則 → 全開（跟以前一樣）');
const dash = read('src/components/TrainingAnalyticsDashboard.jsx');
ok(!/metrics\.hrv > 50 \? 100/.test(dash), '儀表板不再用 population 門檻自己算一套');
const tracker = read('src/components/CardioTrackerMobile.jsx');
ok(/準備度 \{ready\.score\}/.test(tracker), '跑步頁上方真的印出準備度');
ok(/readinessSourceLine\(ready\.from\)/.test(tracker), '而且寫出它用了哪些訊號');
const mrt = read('src/utils/muscleRecoveryTracker.js');
ok(!/export const readinessLabel/.test(mrt), '狀態文字的門檻只有一份定義（不在 tracker 裡重複）');

console.log(fail === 0
    ? '\n✅ 準備度：有睡眠與 HRV 就用，沒有就退回訓練負荷，而且一定說得出來源\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
