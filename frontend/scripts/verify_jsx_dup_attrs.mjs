/**
 * verify_jsx_dup_attrs.mjs —— 同一個 JSX 元素上不可以有兩個同名屬性。
 *
 * 真實案例：RouteMap.jsx 的 <MapContainer> 同時有
 *     className="drvn-map drvn-map--light"     ← 後來加的地圖主題
 *     className="w-full h-full z-10"           ← 原本就有的版面
 * JSX 只留後面那個，所以地圖主題那一整條 CSS 從來沒生效過 ——
 * 畫面不會壞、也不會報錯，只是那個功能安靜地不存在。
 *
 * esbuild 只印一行 warning，build 照樣過；eslint 預設也不看。
 * 用文字批次改過 JSX（正規表示式插屬性）之後，這是最容易留下的傷。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        const p = join(dir, name);
        let st; try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, out);
        else if (name.endsWith('.jsx')) out.push(p);
    }
    return out;
};

/** 掃一支檔案的所有 JSX 開標籤，回傳 [{ line, tag, attr }] */
export function findDuplicateAttrs(src) {
    const found = [];
    const lineOf = (i) => src.slice(0, i).split('\n').length;

    for (const m of src.matchAll(/<([A-Za-z][\w.]*)(?=[\s/>])/g)) {
        const tag = m[1];
        let i = m.index + m[0].length;
        let depth = 0;           // {} 深度
        let quote = null;        // 目前在哪一種引號裡
        const names = new Map(); // 屬性名 → 第一次出現的行
        let buf = '';            // 正在累積的屬性名
        let reading = true;      // depth 0 且不在引號裡 → 可能在讀屬性名

        for (; i < src.length; i++) {
            const c = src[i];
            if (quote) { if (c === quote) quote = null; continue; }
            if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
            if (c === '{') { depth++; reading = false; buf = ''; continue; }
            if (c === '}') { depth--; if (depth === 0) reading = true; continue; }
            if (depth > 0) continue;
            if (c === '>' ) break;
            if (c === '/' && src[i + 1] === '>') break;

            if (/[A-Za-z0-9_:-]/.test(c) && reading) { buf += c; continue; }
            if (c === '=' && buf) {
                if (names.has(buf)) found.push({ line: lineOf(i), tag, attr: buf, first: names.get(buf) });
                else names.set(buf, lineOf(i));
                buf = '';
                continue;
            }
            if (/\s/.test(c)) { buf = ''; continue; }
            buf = '';
        }
    }
    return found;
}

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

const files = walk(SRC);
console.log(`\n── 掃描 ${files.length} 支 .jsx ──`);
const problems = [];
for (const p of files) {
    for (const d of findDuplicateAttrs(readFileSync(p, 'utf8'))) {
        problems.push(`${relative(SRC, p)}:${d.line} <${d.tag}> 的 ${d.attr} 重複（第一次在第 ${d.first} 行）`);
    }
}
ok(problems.length === 0, '沒有任何元素帶著兩個同名屬性',
    problems.length ? `\n     ${problems.slice(0, 15).join('\n     ')}` : '');

console.log('\n── 掃描器自檢 ──');
const PROBE_BAD = `
const A = () => (
    <MapContainer className="drvn-map drvn-map--light"
        center={[0, 0]}
        zoom={13}
        className="w-full h-full z-10"
        style={{ backgroundColor: '#fff' }}
    >
        <TileLayer url={TILE_URL} />
    </MapContainer>
);`;
const PROBE_OK = `
const B = () => (
    <div className={\`a \${x ? 'b' : 'c'}\`} style={{ color: '#fff' }} onClick={() => setX({ className: 1 })}>
        <span className="x" />
        <span className="y" />
    </div>
);`;
const bad = findDuplicateAttrs(PROBE_BAD);
ok(bad.length === 1 && bad[0].attr === 'className',
    `故意寫壞的探針被抓到：<${bad[0]?.tag}> 的 ${bad[0]?.attr} 重複`);
const good = findDuplicateAttrs(PROBE_OK);
ok(good.length === 0,
    '正常寫法不會誤報（樣板字串、巢狀物件裡的 className、兄弟元素各有一個）',
    good.length ? JSON.stringify(good) : '');

console.log(fail === 0
    ? '\n✅ 沒有被 JSX 靜靜丟掉的屬性\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
