/**
 * verify_no_default_biometrics.mjs —— 不准再幫使用者「假設」身體數據。
 *
 * 事故：全新使用者按一下「減脂」會 POST 出
 *     熱量 1859／蛋白 0g／脂肪 0g／碳水 465g
 * 熱量是用 `weight||70 / height||170 / age||25 / gender||'male'` 這個不存在的
 * 人算的，蛋白與脂肪用真實的 0。而那份目標是 Apple Watch 的唯一資料源，
 * 下一次又被當成「已知值」優先採用 —— 錯誤自我固化。
 *
 * 這支掃原始碼，只要又有人在體重／身高／年齡／性別旁邊寫預設值就擋下來。
 * 規則：有量到才顯示，沒量到就給入口（MissingDataRow）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src', import.meta.url));

const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(jsx|js)$/.test(name)) out.push(p);
    }
    return out;
};

/* 只看「身體數據的識別字」附近的預設值。
   像 `|| 25` 出現在分頁大小、動畫毫秒那些地方是完全合理的，不該擋。 */
/* ⚠️ 前面要卡一個「不是字母」的邊界，否則 age 會命中 pageSize / average / usage，
   於是 `const pageSize = opts.size || 25;` 被當成在編年齡。
   camelCase 的組合字（bodyWeight / weightKg）另外明列。 */
const BIO = /(?<![A-Za-z])(weight|height|age|gender)|bodyWeight|weightKg|heightCm|體重|身高|年齡|性別/i;
const FABRICATE = /\|\|\s*(70|65|60|170|175|180|25|26|28|'male'|"male"|'M'|'female')\b/;

/* ⚠️ 直接指派也算。真實案例：跑步頁算卡路里時寫
       let weightKg = 65;
   然後才去找真實體重，找不到就用這個 —— 熱量 = 體重 × 距離 × 1.036，
   體重是編的，算出來的熱量就是編的，而畫面不會說它是編的。
   舊版只抓 `|| 65` 這種寫法，抓不到指派式的預設，所以漏了一年。 */
const FABRICATE_ASSIGN = /\b(?:let|var|const)\s+\w*(?:weight|height|age|gender)\w*\s*=\s*(?:70|65|60|170|175|180|25|26|28|'male'|"male"|'female')\s*[;,]/i;

/* 這幾支是規則本身的定義處與說明，允許出現這些字串 */
const ALLOW = [/utils\/biometrics\.js$/, /scripts\//];

let files = 0;
const hits = [];

for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file);
    if (ALLOW.some((re) => re.test(file))) continue;
    files++;
    const lines = readFileSync(file, 'utf8').split('\n');
    /* 真的追蹤 /* *\/ 區塊註解的開合，不是用「開頭有沒有星號」猜 ——
       說明文字裡本來就會引用 `weight || 70` 來解釋為什麼不能那樣寫。 */
    let inBlock = false;
    lines.forEach((line, i) => {
        let code = line;
        if (inBlock) {
            const end = code.indexOf('*/');
            if (end === -1) return;
            code = code.slice(end + 2);
            inBlock = false;
        }
        // 去掉本行內成對的區塊註解，再看有沒有沒收尾的開頭
        code = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
        const open = code.indexOf('/*');
        if (open !== -1) { code = code.slice(0, open); inBlock = true; }
        code = code.split('//')[0];                 // 行末註解不算
        if (/KNOB_START/.test(code)) return;        // 旋鈕的起始停留位置，送出時不會被存
        const byOr = BIO.test(code) && FABRICATE.test(code);
        const byAssign = FABRICATE_ASSIGN.test(code);
        if (!byOr && !byAssign) return;
        hits.push({ rel, no: i + 1, text: line.trim().slice(0, 110) });
    });
}

/* ── 掃描器自檢：故意寫壞的兩種寫法都要被抓到 ────────────────────
   不自檢的話，規則寫錯就變成一張永遠會過的橡皮圖章 —— 這支就漏過
   `let weightKg = 65;` 很久，因為舊規則只認 `|| 65`。 */
const probes = [
    ['或運算式', 'const w = profile.weight || 70;', true],
    ['直接指派', '        let weightKg = 65;', true],
    ['身高指派', 'let heightCm = 175;', true],
    ['性別指派', "let gender = 'male';", true],
    ['分頁大小（不該擋）', 'const pageSize = opts.size || 25;', false],
    ['動畫毫秒（不該擋）', 'const delay = ms || 70;', false],
    ['真實體重（不該擋）', 'const w = Number(cache.weight_kg || 0);', false],
];
let probeFail = 0;
for (const [name, line, shouldHit] of probes) {
    const hit = (BIO.test(line) && FABRICATE.test(line)) || FABRICATE_ASSIGN.test(line);
    if (hit !== shouldHit) {
        probeFail++;
        console.log(`✗ 掃描器自檢：「${name}」應該${shouldHit ? '被抓到' : '放行'}，實際${hit ? '被抓到' : '放行'}`);
    }
}
if (probeFail) {
    console.log(`\n❌ 掃描器自己有 ${probeFail} 項不對，先修規則再看結果。\n`);
    process.exit(1);
}

console.log(`\n── 假設身體數據掃描：${files} 個檔（掃描器自檢 ${probes.length}/${probes.length} 通過）──`);
if (!hits.length) {
    console.log('✅ 沒有任何地方在替使用者假設體重／身高／年齡／性別\n');
    process.exit(0);
}
for (const h of hits) console.log(`❌ ${h.rel}:${h.no}\n   ${h.text}`);
console.log(`\n❌ ${hits.length} 處在編造身體數據。`);
console.log('   缺資料要顯示 <MissingDataRow gate={biometricsGate(userId, profile)} />，不是給一個預設值。\n');
process.exit(1);
