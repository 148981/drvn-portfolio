/**
 * verify_copy_budget.mjs —— 文案違規只能變少，不能變多。
 *
 * verify_copy_rules.mjs 一直存在，但從來沒被掛進 `npm run verify` ——
 * 所以它擋不住任何東西，數字就這樣長到 232 處。
 *
 * 一次全修不切實際（R4 的 105 處多半是「（Deload）」這種中英對照，
 * R3 的 7 處是使用者主動點進去看的長說明，該標豁免而不是刪），
 * 但「不准再變多」是做得到的：把現況記在 copy-baseline.json，
 * 任何一條規則超過基準線就擋下來。修掉之後把基準線調降。
 *
 * ⚠️ R5（字級）與 R6（字距）的基準線是 0，而且永遠是 0 ——
 *    讀不到就是讀不到，那兩條不接受任何債務。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(HERE, 'copy-baseline.json'), 'utf8'));

let out = '';
try {
    out = execFileSync(process.execPath, [join(HERE, 'verify_copy_rules.mjs')], { encoding: 'utf8' });
} catch (e) {
    // 有違規時 verify_copy_rules 會以非 0 結束，但 stdout 仍是我們要的報表
    out = (e.stdout || '') + (e.stderr || '');
}

const counts = {};
for (const m of out.matchAll(/^❌\s+(R\d)\s+\S+\s+(\d+)\s*處/gm)) counts[m[1]] = Number(m[2]);

let fail = 0;
const RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];
const NEVER_IN_DEBT = new Set(['R5', 'R6']);

console.log('── 文案違規預算 ──');
for (const r of RULES) {
    const now = counts[r] || 0;
    const cap = baseline[r] ?? 0;
    const hard = NEVER_IN_DEBT.has(r) ? 0 : cap;
    const good = now <= hard;
    if (!good) fail++;
    const note = now < cap ? `（比基準線少 ${cap - now} 處，記得把基準線調降）` : '';
    console.log(`${good ? '✓' : '✗'} ${r}  現在 ${now} / 上限 ${hard} ${note}`);
}

if (!Object.keys(counts).length && !/共 0 處違規/.test(out)) {
    console.log('✗ 解析不到 verify_copy_rules 的報表 —— 它的輸出格式可能改了');
    fail++;
}

console.log(fail === 0
    ? '\n✅ 文案違規沒有變多（R5 字級、R6 字距維持 0）\n'
    : `\n❌ ${fail} 條規則超過基準線 —— 這一輪新增的文案違規要修掉\n`);
process.exit(fail === 0 ? 0 : 1);
