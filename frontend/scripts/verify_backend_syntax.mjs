/**
 * verify_backend_syntax.mjs —— 後端每一支 .py 都要編得過。
 * 前端有 32 支驗證腳本守著，後端改壞了卻要等到啟動才知道。
 * 這支只做最低限度的事：編譯一遍，抓語法錯與縮排錯。
 */
import { execFileSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';

const BE = path.resolve(process.cwd(), '..', 'backend');
const SKIP = ['.venv_arm64', '__pycache__', 'node_modules', '.git', 'venv', '.venv'];

const walk = (d) => {
    let out = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (SKIP.includes(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) out = out.concat(walk(p));
        else if (p.endsWith('.py')) out.push(p);
    }
    return out;
};

const py = ['python3', 'python'].find(c => {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
});

console.log('\n══ 後端語法 ══\n');
if (!py) {
    console.log('✗ 找不到 python，跳不過也測不了 —— 請在有 python 的環境跑');
    process.exit(1);
}

const files = walk(BE);
const failed = [];
for (const f of files) {
    try { execFileSync(py, ['-m', 'py_compile', f], { stdio: 'pipe' }); }
    catch (e) { failed.push({ f: path.relative(BE, f), msg: String(e.stderr || e.message).split('\n').slice(-4).join(' ').trim() }); }
}

console.log(`掃了 ${files.length} 支 .py`);
failed.forEach(x => console.log(`✗ ${x.f}\n    ${x.msg}`));
console.log(failed.length ? `\n❌ ${failed.length} 支編不過\n` : '\n✅ 後端全部編得過\n');
process.exit(failed.length ? 1 : 0);
