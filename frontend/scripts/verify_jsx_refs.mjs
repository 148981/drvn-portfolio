#!/usr/bin/env node
/**
 * verify_jsx_refs.mjs — 抓出「JSX 裡用了、但根本沒宣告」的元件
 * ══════════════════════════════════════════════════════════════════════
 * 為什麼需要這支（2026-09-08 社群頁全頁崩潰的教訓）：
 *
 *   SocialHubMobile.jsx 用了 <motion.div> 共 37 次，
 *   但檔案最上面只寫 `import { AnimatePresence } from 'framer-motion'`
 *   —— 沒有 motion。整頁一渲染就丟 "Can't find variable: motion"，
 *   使用者點社群只看得到「頁面暫時迷路了」。
 *
 *   而這個錯誤，vite build 過、eslint 也過。原因是：
 *   ESLint 的 no-undef 靠作用域分析找「變數參照」，
 *   但 <motion.div> 在 AST 裡是 JSXMemberExpression，
 *   基礎 ESLint 不會替 JSXIdentifier 建立變數參照
 *   （那是 eslint-plugin-react 的 react/jsx-no-undef 才管的事）。
 *   於是「JSX 元件沒宣告」整類錯誤，現有工具鏈完全看不到。
 *
 * 這支就補這個洞：解析每一支檔案，把 JSX 標籤的「根識別字」抓出來，
 * 對照檔案裡所有的繫結（import / 宣告 / 參數 / 解構）與瀏覽器全域。
 * 對不上的就是會在執行期炸掉的東西。
 *
 *   <div>            → 純小寫、沒有點 → HTML 標籤，跳過
 *   <motion.div>     → 根是 motion    → 必須有宣告  ← 這次漏掉的就是這種
 *   <FoodIcon />     → 大寫開頭       → 必須有宣告
 *
 * 用法：node scripts/verify_jsx_refs.mjs [檔案或資料夾…]（預設掃 src）
 * 回傳碼：有問題 = 1，乾淨 = 0（可直接擋 CI / 部署）
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const ROOT = process.cwd();
const IGNORE = /node_modules|[\\/]dist[\\/]|\.git|_to_delete|__tests__|\.test\.|\.spec\./;

/* 瀏覽器 / JS 內建的全域 —— 這些不用 import 也合法。 */
const GLOBALS = new Set([
    'window', 'document', 'navigator', 'console', 'location', 'history', 'screen',
    'localStorage', 'sessionStorage', 'fetch', 'Image', 'Audio', 'Blob', 'File',
    'FormData', 'URL', 'URLSearchParams', 'Date', 'Math', 'JSON', 'Object', 'Array',
    'String', 'Number', 'Boolean', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
    'Symbol', 'Error', 'RegExp', 'Intl', 'React', 'globalThis',
]);

const collectFiles = (target, out = []) => {
    const stat = fs.statSync(target);
    if (stat.isFile()) {
        if (/\.(jsx?|tsx?)$/.test(target) && !IGNORE.test(target)) out.push(target);
        return out;
    }
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        const p = path.join(target, entry.name);
        if (IGNORE.test(p)) continue;
        if (entry.isDirectory()) collectFiles(p, out);
        else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(p);
    }
    return out;
};

/** 走訪 AST 的每一個節點。 */
function walk(node, visit, parent = null) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parent);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
        const child = node[key];
        if (Array.isArray(child)) {
            for (const c of child) if (c && typeof c.type === 'string') walk(c, visit, node);
        } else if (child && typeof child.type === 'string') {
            walk(child, visit, node);
        }
    }
}

/** 把一個繫結樣式（可能是解構）裡的所有名字收進 set。 */
function collectPatternNames(node, set) {
    if (!node) return;
    switch (node.type) {
        case 'Identifier': set.add(node.name); break;
        case 'ObjectPattern':
            for (const p of node.properties) {
                if (p.type === 'RestElement') collectPatternNames(p.argument, set);
                else collectPatternNames(p.value, set);
            }
            break;
        case 'ArrayPattern':
            for (const e of node.elements) collectPatternNames(e, set);
            break;
        case 'AssignmentPattern': collectPatternNames(node.left, set); break;
        case 'RestElement': collectPatternNames(node.argument, set); break;
        default: break;
    }
}

/** JSX 標籤名稱的「根識別字」；回傳 null 代表是 HTML 標籤、不用檢查。 */
function jsxRootName(nameNode) {
    if (!nameNode) return null;
    if (nameNode.type === 'JSXIdentifier') {
        // 純小寫且沒有點 → <div> / <span>，是 HTML 標籤
        return /^[a-z]/.test(nameNode.name) ? null : nameNode.name;
    }
    if (nameNode.type === 'JSXMemberExpression') {
        // <motion.div> / <Foo.Bar> → 一路往左找到根，這個一定要有宣告
        let cur = nameNode;
        while (cur.type === 'JSXMemberExpression') cur = cur.object;
        return cur.type === 'JSXIdentifier' ? cur.name : null;
    }
    return null; // JSXNamespacedName（svg:foo 之類）不管
}

function checkFile(file) {
    const src = fs.readFileSync(file, 'utf8');
    let ast;
    try {
        ast = parse(src, {
            sourceType: 'module',
            plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
            errorRecovery: true,
        });
    } catch (e) {
        return [{ line: e?.loc?.line ?? 0, name: '(解析失敗)', detail: e.message }];
    }

    const declared = new Set();
    const used = new Map();  // name → 第一次出現的行號

    walk(ast, (node) => {
        switch (node.type) {
            case 'ImportDefaultSpecifier':
            case 'ImportNamespaceSpecifier':
            case 'ImportSpecifier':
                declared.add(node.local.name);
                break;
            case 'VariableDeclarator':
                collectPatternNames(node.id, declared);
                break;
            case 'FunctionDeclaration':
            case 'FunctionExpression':
            case 'ArrowFunctionExpression':
                if (node.id) declared.add(node.id.name);
                for (const p of node.params) collectPatternNames(p, declared);
                break;
            case 'ClassDeclaration':
            case 'ClassExpression':
                if (node.id) declared.add(node.id.name);
                break;
            case 'CatchClause':
                collectPatternNames(node.param, declared);
                break;
            case 'JSXOpeningElement': {
                const root = jsxRootName(node.name);
                if (root && !used.has(root)) used.set(root, node.loc?.start?.line ?? 0);
                break;
            }
            default: break;
        }
    });

    const problems = [];
    for (const [name, line] of used) {
        if (declared.has(name) || GLOBALS.has(name)) continue;
        problems.push({ line, name });
    }
    return problems.sort((a, b) => a.line - b.line);
}

// ── 主程式 ────────────────────────────────────────────────────────────
const targets = process.argv.slice(2);
const files = (targets.length ? targets : [path.join(ROOT, 'src')])
    .flatMap((t) => collectFiles(path.resolve(t)));

let total = 0;
const byFile = [];
for (const f of files) {
    const problems = checkFile(f);
    if (problems.length) {
        byFile.push([f, problems]);
        total += problems.length;
    }
}

console.log('\n══ JSX 元件參照檢查 ══\n');
if (!total) {
    console.log(`✅ ${files.length} 支檔案，每個 JSX 元件都有對應的宣告\n`);
    process.exit(0);
}
for (const [f, problems] of byFile) {
    console.log(`❌ ${path.relative(ROOT, f)}`);
    for (const p of problems) {
        console.log(`   第 ${p.line} 行：<${p.name}…> 沒有 import 也沒有宣告${p.detail ? ` — ${p.detail}` : ''}`);
    }
    console.log('');
}
console.log(`共 ${total} 處會在執行期丟 ReferenceError（vite build 與 eslint 都看不到這類錯誤）\n`);
process.exit(1);
