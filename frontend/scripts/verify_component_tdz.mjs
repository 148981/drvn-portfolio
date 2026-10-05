/**
 * verify_component_tdz.mjs — 「用在宣告之前」的白屏掃描（AST，不是字串比對）
 * 跑法：node scripts/verify_component_tdz.mjs
 *
 * 為什麼需要這支：
 *   在幾千行的 React 元件裡，把一段 const 移到錯的位置就會踩到 TDZ
 *   （Temporal Dead Zone）—— render 當下讀一個還沒初始化的 const，整頁白屏。
 *   這個錯 vite build 抓不到（語法完全合法）、eslint 的 no-use-before-define
 *   在本專案是關掉的，只有真的把那一頁打開才會炸。
 *   營養計劃精靈就是這樣白屏過一次（guardCtx 讀了下面才宣告的 weeklyChange）。
 *
 * 判定規則：
 *   一個 const／let／class 的引用，如果
 *     ① 出現在它自己的宣告之前，而且
 *     ② 那個位置在 render 當下就會執行
 *   就是會炸的。「render 當下會執行」＝從引用往上走到宣告所在的作用域，
 *   中間沒有經過任何「之後才呼叫」的函式；useMemo 的第一個參數算當下執行
 *   （useEffect / useCallback / 事件處理不算，它們晚一步才跑）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = fileURLToPath(new URL('../src', import.meta.url));

const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(jsx|js)$/.test(name)) out.push(p);
    }
    return out;
};

/** 這個函式在 render 當下就會被叫到嗎（useMemo 的第一個參數會） */
const runsDuringRender = (fnPath) => {
    const parent = fnPath.parentPath;
    if (!parent?.isCallExpression()) return false;
    if (parent.node.arguments[0] !== fnPath.node) return false;
    const callee = parent.node.callee;
    const name = callee?.name || callee?.property?.name;
    return name === 'useMemo';
};

let files = 0, refs = 0;
const violations = [];

for (const file of walk(ROOT)) {
    const code = readFileSync(file, 'utf8');
    let ast;
    try {
        ast = parser.parse(code, {
            sourceType: 'module',
            plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
        });
    } catch (e) {
        console.log(`⚠️  ${relative(ROOT, file)} 解析失敗：${e.message}`);
        continue;
    }
    files++;

    traverse(ast, {
        ReferencedIdentifier(path) {
            const { name } = path.node;
            const binding = path.scope.getBinding(name);
            if (!binding) return;
            if (!['const', 'let'].includes(binding.kind)) return;      // var / function 會提升，不會 TDZ
            const declStart = binding.path.node.start;
            if (declStart == null || path.node.start == null) return;
            if (path.node.start >= declStart) return;                   // 宣告在前，沒問題
            refs++;

            // 從引用往上走到宣告所在的函式，中間只要經過「晚一步才跑」的函式就安全
            let p = path.parentPath;
            while (p && p.node !== binding.scope.block) {
                if (p.isFunction() && !runsDuringRender(p)) return;
                if (p.isClassMethod?.() || p.isObjectMethod?.()) return;
                p = p.parentPath;
            }

            const line = path.node.loc?.start.line;
            violations.push({
                file: relative(ROOT, file),
                name,
                line,
                declLine: binding.path.node.loc?.start.line,
                snippet: (code.split('\n')[line - 1] || '').trim().slice(0, 80),
            });
        },
    });
}

console.log(`\n── TDZ 掃描：${files} 個檔、${refs} 處「宣告在後」的引用 ──`);
if (violations.length === 0) {
    console.log('✅ 沒有會在 render 當下讀到未初始化 const 的地方\n');
    process.exit(0);
}
for (const v of violations) {
    console.log(`❌ ${v.file}:${v.line}  讀了第 ${v.declLine} 行才宣告的 ${v.name}`);
    console.log(`   ${v.snippet}`);
}
console.log(`\n❌ ${violations.length} 處會在 render 當下白屏\n`);
process.exit(1);
