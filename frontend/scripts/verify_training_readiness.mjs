/**
 * verify_training_readiness.mjs —— 訓練頁（圖一）不可以把編出來的數字湊成一個分數。
 *
 * 事故現場：一個完全沒練過的帳號打開「訓練 → 總覽」，看到
 *     系統準備狀態  94 / 100   巔峰
 *     恢復度 100%   訓練負荷(ACWR) —   訓練頻率 0/14
 *     有效總量 0 組數  ▲ 0% 較上週
 * 94 是這樣來的：
 *     沒有恢復紀錄 → avgRecovery 墊 85
 *     ACWR 資料不足 → acwrScore  墊 100（「不扣分」）
 *     一次都沒練     → freqScore  墊 70
 *     85×0.5 + 100×0.3 + 70×0.2 = 94
 * 三個墊底值湊出一個看起來很專業的分數，而旁邊自己就寫著「0/14」「0 組」。
 *
 * 另外兩件同一類的：
 *   · 有效組數 `(parseFloat(s.rpe) || 8) >= 7` —— 沒填 RPE 一律當 8，
 *     於是「有效總量」其實是「總組數」，標題與內容對不上。
 *   · 「▲ 0% 較上週」—— 這週 0、上週也 0，根本沒有東西可以比。
 *
 * 還有一件：這一頁的準備度跟跑步頁的準備度是兩套算法、兩個數字。
 * 同一個概念只能有一份定義（介面標準 §8）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* 先把註解拿掉 —— 上面那段說明裡就寫著 85 跟 freqScore，不能被自己騙到 */
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

const page = stripJs(read('components/TrainingRecordPageMobile.jsx'));

console.log('── 0 · 先證明舊算法真的會生出 94 ──');
{
    /* 舊公式原封不動照抄一份，輸入用「全新帳號」的實際值：
         恢復度 100 —— getMuscleRecoveryDetails 給每個沒練過的部位 score 100，
                       length > 0 所以平均就是 100（那個 85 的墊底值反而用不到）
         ACWR   100 —— status === 'insufficient' → 不扣分
         頻率    70 —— active = 0，不在 3..10 */
    const old = Math.round(100 * 0.5 + 100 * 0.3 + 70 * 0.2);
    ok(old === 94, '舊公式給沒練過的人 94 分（所以這支檢查不是橡皮圖章）', `得到 ${old}`);
    ok(old >= 85, '而且 ≥85 會被標成「巔峰」');
}

console.log('\n── 1 · 三個墊底值都不見了 ──');
ok(!/:\s*85;?\s*$/m.test(page) && !/reduce\([\s\S]{0,80}\)\s*\/\s*recoveryScores\.length/.test(page),
    '沒有恢復紀錄時不再墊 85');
ok(!/acwrScore\s*=\s*100/.test(page), 'ACWR 資料不足時不再給滿分');
ok(!/freqScore/.test(page), '訓練頻率不再有 70 分的地板');
ok(!/avgRecovery \* 0\.5/.test(page), '那個自己算的複合公式整個移除');

console.log('\n── 2 · 準備度全 App 只有一份定義 ──');
/* 準備度的唯一入口是 utils/readiness 的 getTodayReadiness（9dae692 收斂）：
   它內部做「訓練負荷＋睡眠／HRV／靜息心率」，會員界線也在裡面。
   畫面只能呼叫它，不能自己拼 computeReadiness 或自己讀訊號。 */
const rsrc = stripJs(read('utils/readiness.js'));
ok(/getTodayReadiness\(/.test(page) && !/computeReadiness\(/.test(page), '訓練頁改用 utils/readiness 的唯一入口 getTodayReadiness');
ok(/readinessFromScores\(getMuscleRecoveryScores\(userId\)\)/.test(rsrc), '訓練負荷只算真的練過的肌群');
ok(/readRecoverySignals\(userId\)/.test(rsrc), '睡眠 / HRV 有的話也算進去（會員）');
const cardio = stripJs(read('components/CardioTrackerMobile.jsx'));
ok(/getTodayReadiness\(/.test(cardio) && !/computeReadiness\(/.test(cardio),
    '跑步頁與訓練頁走同一個入口（同一個數字）');

console.log('\n── 3 · 算不出來就顯示該做的事，不是一個數字 ──');
ok(/if \(!r\) return null;/.test(page), '沒有任何訊號 → readiness 回 null');
ok(/\{!readiness \? \(/.test(page), 'null 時整塊換掉，不是補一個預設分數');
ok(/還沒有東西可以算準備度/.test(page), '而且講得出為什麼');
ok(/readiness\.source/.test(page), '有分數時說得出是用什麼算的');

console.log('\n── 4 · 沒練過 ≠ 完全恢復 ──');
const tracker = stripJs(read('utils/muscleRecoveryTracker.js'));
ok(/tracked: false/.test(tracker) && /tracked: true/.test(tracker),
    'getMuscleRecoveryDetails 分得出「沒練過」與「已恢復」');
ok((page.match(/data\.tracked === false/g) || []).length >= 4,
    '恢復分頁四個地方都看 tracked（長條、倒數、狀態字、時間）');
ok(!/hoursUntilRecovery > 0 \? `\$\{data\.hoursUntilRecovery\}h 後` : '已準備好'\}/.test(page),
    '沒練過的肌群不會被寫成「已準備好」');

console.log('\n── 5 · 有效組數：標籤要跟實際算的東西一致 ──');
ok(!/\.rpe\)\s*\|\|\s*8/.test(page), '沒填 RPE 的組不再被當成 RPE 8（有效組數與強度分布都是）');
ok(/if \(rated === 0\) return null;/.test(page) && /!trainingStimulus \? \(/.test(page),
    '一組 RPE 都沒有時，強度區間分布不畫圖，改講要怎麼才有');
ok(/Number\.isFinite\(rpe\)/.test(page), '只有真的填了 RPE 才納入有效組判定');
ok(/hasRpe \? '有效總量' : '總組數'/.test(page), '一次都沒填 RPE 時，標題誠實寫「總組數」');

console.log('\n── 6 · 沒有東西可以比就不要比 ──');
ok(/compare = 'none'/.test(page) && /compare === 'pct'/.test(page),
    '「比得出來 / 第一週 / 沒得比」是三種狀態，不是一個 0');
ok(!/diff = lastWeek > 0 \? [\s\S]{0,60}: 0\)/.test(page),
    '兩週都沒紀錄時不再回 0（那會畫成「▲ 0% 較上週」）');

console.log(fail === 0
    ? '\n✅ 訓練頁：沒資料就不生分數，準備度全 App 同一份\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
