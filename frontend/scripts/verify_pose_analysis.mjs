/**
 * verify_pose_analysis.mjs —— 影片動作分析這條路，從拍到看得懂。
 *
 * 這條路以前有幾個「不會報錯、只會安靜失效」的地方：
 *   · 結果頁按「再測一次」什麼都沒帶 → 掉進 v5 舊管線，
 *     歷史裡寫的是寫死的「Bicep Curl」、時長永遠 0、而且沒有 exerciseKey
 *     會被歷史頁直接濾掉 —— 使用者按了一下，成績就消失了。
 *   · AR 疊合影片的網址寫死 :8000。<video src> 不經過 apiHostFix 的攔截，
 *     所以打包版一定放不出來，而且不會報錯。
 *   · 徽章拿中文「互相包含」比對：「肘外展過開」與「手肘外展」互不包含，
 *     臥推的「已驗證可偵測」永遠不亮。
 *   · 動作清單四份，選擇頁 5 個、歷史頁 6 個。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const ROOT = join(HERE, '..', '..');
const read = (p) => readFileSync(join(SRC, p), 'utf8');
const readRoot = (p) => readFileSync(join(ROOT, p), 'utf8');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

/* ════════════════════════════════════════════════════════════════
   1 · 「已驗證可偵測」的徽章，不靠字面猜
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 1 · 驗證過的指標用 key 宣告 ──');
const spec = read('lib/exerciseSpec.js');
const result = read('components/ResultViewMobile.jsx');

// 每個宣告了 catches 的機位，都要有對應的 catchMetrics
const views = [...spec.matchAll(/catches:\s*\[([^\]]*)\]/g)];
const catchMetrics = [...spec.matchAll(/catchMetrics:\s*\[([^\]]*)\]/g)];
const nonEmptyCatches = views.filter((m) => m[1].trim().length > 0).length;
ok(catchMetrics.length >= nonEmptyCatches,
    `${nonEmptyCatches} 個機位宣告抓得到錯誤，${catchMetrics.length} 個有對應的指標 key`);

// key 必須是 METRIC_ZH 裡真的有的
const metricKeys = new Set([...result.matchAll(/'([A-Za-z][\w ]*)':\s*'[^']+'/g)].map((m) => m[1]));
const declared = catchMetrics.flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
const unknown = declared.filter((k) => !metricKeys.has(k));
ok(unknown.length === 0, `宣告的指標 key 都存在：${declared.join('、')}`,
    unknown.length ? `未知：${unknown.join('、')}` : '');
ok(!/name\.includes\(zhName\) \|\| zhName\.includes\(name\)/.test(result),
    '結果頁不再用中文「互相包含」去猜對應關係');

console.log('\n── 2 · 舊的猜法確實會漏掉臥推 ──');
const fuzzy = (errName, zhName) => errName.includes(zhName) || zhName.includes(errName);
ok(fuzzy('膝蓋內夾', '膝蓋內夾'), '深蹲剛好字面相同 → 舊版會中（所以一直沒被發現）');
ok(!fuzzy('肘外展過開', '手肘外展'),
    '臥推「肘外展過開」vs「手肘外展」互不包含 → 舊版永遠不亮');

/* ════════════════════════════════════════════════════════════════
   3 · 動作清單只有一份
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 3 · 動作清單 ──');
const order = (spec.match(/export const EXERCISE_ORDER = \[([\s\S]*?)\]/) || [])[1] || '';
const orderKeys = [...order.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const backend = readRoot('backend/core/multi_exercise.py');
const cfgSeg = backend.slice(backend.indexOf('EXERCISE_CONFIGS'));
const backendKeys = [...new Set([...cfgSeg.matchAll(/^\s{4}["']([a-z_]+)["']:\s*\{/gm)].map((m) => m[1]))]
    .filter((k) => !['tips', 'metric_directions', 'metric_labels'].includes(k));
console.log(`  前端 ${orderKeys.length} 個：${orderKeys.join('、')}`);
console.log(`  後端 ${backendKeys.length} 個：${backendKeys.join('、')}`);
ok(orderKeys.length === backendKeys.length,
    `前後端動作數一致（各 ${orderKeys.length} 個）`);
ok(backendKeys.every((k) => orderKeys.includes(k)),
    '後端支援的動作前端都認得（以前 lat_pulldown 不在 spec 裡，specFor 回 null）');
ok(/export const EXERCISE_LIST/.test(spec), '有一份共用的 EXERCISE_LIST');
for (const [f, label] of [
    ['components/ExerciseHistoryMobile.jsx', '歷史頁'],
    ['components/ExerciseSelectorMobile.jsx', '選擇頁'],
]) {
    const src = read(f);
    ok(/EXERCISE_LIST|EXERCISE_SPEC\[/.test(src), `${label}讀共用清單`);
    ok(!/name_zh: '深蹲'|lat_pulldown: \{ bg:/.test(src), `${label}沒有自己再寫一份`);
}

/* ════════════════════════════════════════════════════════════════
   4 · 媒體網址：<img>/<video> 不經過 fetch 攔截
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 4 · 圖片與影片的網址 ──');
const hostFix = read('utils/apiHostFix.js');
ok(/export function mediaUrl/.test(hostFix), '有一支 mediaUrl 單一真相源');
ok(/window\.fetch/.test(hostFix) && /XMLHttpRequest/.test(hostFix),
    '攔截只做得到 fetch 與 XHR（所以元素 src 一定要自己走 mediaUrl）');

const walk = (dir, out = []) => {
    for (const n of readdirSync(dir)) {
        if (n.startsWith('.') || n === 'node_modules') continue;
        const p = join(dir, n);
        let st; try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, out);
        else if (/\.(jsx?|mjs)$/.test(n)) out.push(p);
    }
    return out;
};
const offenders = [];
for (const p of walk(SRC)) {
    // 註解裡引用舊寫法（說明為什麼不能那樣寫）不算違規
    const src = readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/(src|poster)=\{`http:\/\/\$\{window\.location\.hostname\}:8000/g)) {
        offenders.push(`${relative(SRC, p)} 的 ${m[1]}`);
    }
}
ok(offenders.length === 0, '沒有任何 src/poster 寫死 :8000',
    offenders.length ? `\n     ${offenders.join('\n     ')}` : '');
ok(/const activeVideoUrl = mediaUrl\(videoUrl\)/.test(read('components/ARViewMobile.jsx')),
    'AR 疊合影片走 mediaUrl（分析的成果就是這支影片）');

// mediaUrl 的行為
globalThis.window = { location: { hostname: 'localhost', protocol: 'http:' } };
const { mediaUrl } = await import('../src/utils/apiHostFix.js');
ok(mediaUrl(null) === null && mediaUrl('') === null && mediaUrl('   ') === null,
    '沒有路徑 → 回 null（不生一個一定 404 的網址）');
ok(mediaUrl('https://x.com/a.mp4') === 'https://x.com/a.mp4', '已經是絕對網址 → 原樣');
ok(mediaUrl('blob:abc') === 'blob:abc', 'blob: 原樣（本機錄影預覽用）');
ok(/\/static\/results\/a\.mp4$/.test(mediaUrl('/static/results/a.mp4')), '相對路徑 → 補上 base');
ok(/\/static\/a\.mp4$/.test(mediaUrl('static/a.mp4')), '沒有開頭斜線也接得起來');

/* ════════════════════════════════════════════════════════════════
   5 · 再測一次不會換一台引擎
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 5 · 再測一次 ──');
ok(/const goReAnalyze = useCallback/.test(result), '有一個統一的「再測一次」');
const reanalyze = result.slice(result.indexOf('const goReAnalyze'), result.indexOf('const goReAnalyze') + 900);
for (const f of ['exerciseKey', 'multiExercise: true', 'viewCode']) {
    ok(reanalyze.includes(f), `　 帶了 ${f}`);
}
ok(!/onRetry \? onRetry : \(\) => navigate\('\/upload-mobile'\)/.test(result),
    '沒有任何一顆按鈕再裸奔到 /upload-mobile');
ok(/location\.state\?\.viewCode \|\| specFor/.test(read('components/UploadMobile.jsx')),
    '上傳頁會接住帶過來的機位（否則會被重設回主機位）');

/* ════════════════════════════════════════════════════════════════
   6 · 後端不編數字、欄位對得起來
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 6 · 後端 ──');
const pose = readRoot('backend/api_pose_analysis.py');
const stripPy = (t) => t.replace(/#.*$/gm, '');
const poseCode = stripPy(pose);
ok(!/Bicep Curl/.test(poseCode), '舊管線不再寫死「Bicep Curl」當動作名稱');
ok(!/"arVideoUrl": f"\/static\/results\/\{ar_filename\}"\s*\n/.test(poseCode),
    '沒有 AR 影片時不再組出 "/static/results/None" 這種一定 404 的網址');
ok(/"duration_seconds": int\(len\(reps\)/.test(poseCode),
    '舊管線改寫 duration_seconds（前端讀的就是這個，寫 duration_mins 時長永遠 0）');
ok(/"view": view,[\s\S]{0,200}"overallScore"/.test(pose),
    '分析結果帶頂層 view（結果頁才不會退回主機位、宣告錯誤的效度）');
ok(!/routine_data\.get\("overall_score", 95\)/.test(readRoot('backend/core/workout_history.py')),
    '重訓課表完成不再預設 95 分');
ok(/exercise: Optional\[str\] = None/.test(readRoot('backend/api_plan_endpoints.py')),
    '歷史 API 真的吃 exercise 參數（以前前端有傳、後端簽名沒有，靜靜忽略）');

/* ════════════════════════════════════════════════════════════════
   7 · 不給分就是不給分
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 7 · null 分數 ──');
const hist = read('components/ExerciseHistoryMobile.jsx');
ok(!/session\.overall_score \|\| 0/.test(hist),
    '歷史不再把 null 分數硬轉成 0（0 = 做得很差，null = 這個角度量不到）');
ok(/sScore == null \? '—' : sScore/.test(hist), '不給分的那一次顯示「—」');
ok(/s\.exerciseKey && \(!key \|\| s\.exerciseKey === key\)/.test(result),
    '趨勢只收這個動作的動作分析紀錄（以前深蹲臥推與重訓分數混同一條線）');

console.log(fail === 0
    ? '\n✅ 影片分析：拍完、分析、看得懂、回得去\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
