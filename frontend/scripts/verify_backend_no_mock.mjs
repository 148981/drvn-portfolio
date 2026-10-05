/**
 * verify_backend_no_mock.mjs —— 後端不可以先編一份資料再送到前端。
 *
 * 使用者的規則：「所有數據都是等真實有才要讓他顯示 沒有就給他導航」。
 * 前端已經有 verify_no_fabricated_data 在守，但後端一直沒人看：
 *
 *   core/system_status.py  _mock_systems()
 *     「本週配速比上週快 8 秒/km」「訓練量 5,200 kg」「蛋白質 128g」
 *   core/weekly_review.py  _mock_review()
 *     胸 5200 · 背 4800 · 腿 6100 · 肩 2100 · 手臂 2600（五條有長度的長條圖）
 *
 * 前端靠一個 is_mock 旗標擋，擋住了就什麼都不顯示、擋不住就顯示假數字 ——
 * 兩種都不對。正確做法是後端根本不要生出來。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..', '..', 'backend');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

/* ── 掃描器 ───────────────────────────────────────────────────── */
const FAKE_NAME = /^def\s+(_?(?:mock|fake|dummy|placeholder|sample|demo)\w*|_\w*(?:mock|fake|dummy)\w*)\s*\(/i;

/** 把一個 python 檔拆成一個個頂層 def 區塊 */
function topLevelDefs(src) {
    const lines = src.split('\n');
    const defs = [];
    let cur = null;
    for (const line of lines) {
        if (/^def\s+\w+\s*\(/.test(line)) {
            if (cur) defs.push(cur);
            cur = { head: line, body: [] };
        } else if (cur) {
            if (/^\S/.test(line) && line.trim() && !/^[)\]}]/.test(line)) { defs.push(cur); cur = null; }
            else cur.body.push(line);
        }
    }
    if (cur) defs.push(cur);
    return defs;
}

/** 看起來像「量測值」的數字：兩位數以上，或帶單位／百分比 */
const looksLikeStat = (body) => {
    const text = body.join('\n');
    // 先把註解拿掉 —— 註解裡引用舊的假數字（說明為什麼拿掉）不算
    const code = text.replace(/#.*$/gm, '');
    const hits = [];
    for (const m of code.matchAll(/\b\d{2,}(?:,\d{3})*(?:\.\d+)?\s*(?:kg|km|g|%|大卡|公里|秒)?/g)) {
        const raw = m[0];
        const n = parseFloat(raw.replace(/,/g, ''));
        if (n >= 100) hits.push(raw.trim());        // 100 以上才算「像數據」，避免打到 limit=200
    }
    for (const m of code.matchAll(/["'][^"']*[+-]\d+\s*%[^"']*["']/g)) hits.push(m[0]);
    return hits;
};

function scan(dir) {
    const problems = [];
    for (const f of readdirSync(dir)) {
        if (!f.endsWith('.py')) continue;
        const p = join(dir, f);
        const src = readFileSync(p, 'utf8');
        for (const d of topLevelDefs(src)) {
            if (!FAKE_NAME.test(d.head)) continue;
            const hits = looksLikeStat(d.body);
            if (hits.length) {
                problems.push(`${f} :: ${d.head.trim().slice(0, 48)} 編了 ${hits.length} 個數字（${hits.slice(0, 4).join('、')}…）`);
            }
        }
    }
    return problems;
}

console.log('\n── 1 · 後端不再有編數字的函式 ──');
const problems = [...scan(join(BACKEND, 'core')), ...scan(BACKEND)];
ok(problems.length === 0, '沒有任何 mock／fake／placeholder 函式在生數據',
    problems.length ? `\n     ${problems.join('\n     ')}` : '');

console.log('\n── 2 · 掃描器自檢：把舊版丟回去一定要被抓到 ──');
const OLD = `
def _mock_systems():
    return {
        "running": {"label": "跑步", "state": "進步中", "line": "本週配速比上週快 8 秒/km，有氧引擎升級中。"},
        "strength": {"label": "健身", "state": "穩定成長", "line": "本週訓練量 5,200 kg，較上週 +12%。"},
        "nutrition": {"label": "營養", "state": "達標", "line": "今日蛋白質 128g，維持得很好。"},
    }
`;
const OLD2 = `
def _mock_review(label):
    return {
        "muscles": [
            {"name": "胸", "volume": 5200, "delta": "+12%"},
            {"name": "背", "volume": 4800, "delta": "+5%"},
        ],
    }
`;
for (const [name, code] of [['_mock_systems', OLD], ['_mock_review', OLD2]]) {
    const d = topLevelDefs(code).filter((x) => FAKE_NAME.test(x.head));
    const hits = d.length ? looksLikeStat(d[0].body) : [];
    ok(hits.length > 0, `舊的 ${name} 被抓到 ${hits.length} 個編出來的數字`, `（${hits.slice(0, 3).join('、')}）`);
}

console.log('\n── 3 · 沒資料時回的是空的，不是編的 ──');
/* 註解與 docstring 裡會引用舊的函式名與舊數字（說明為什麼拿掉），
   那不是程式在做的事 —— 掃描前先剝掉，否則寫註解說明反而會被判違規。 */
const stripPy = (s) => s.replace(/"""[\s\S]*?"""/g, '').replace(/'''[\s\S]*?'''/g, '').replace(/#.*$/gm, '');
const stripJs = (s) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ss = stripPy(readFileSync(join(BACKEND, 'core', 'system_status.py'), 'utf8'));
ok(!/_mock_systems/.test(ss), 'system_status 不再有 _mock_systems');
ok(/is_mock = len\(systems\) == 0/.test(ss) && !/systems = _mock_systems\(\)/.test(ss),
    '沒資料 → systems 就是空的');

const wr = stripPy(readFileSync(join(BACKEND, 'core', 'weekly_review.py'), 'utf8'));
ok(!/_mock_review/.test(wr), 'weekly_review 不再有 _mock_review');
const empty = wr.slice(wr.indexOf('def _empty_review'), wr.indexOf('def _muscle_volumes'));
ok(/"muscles": \[\]/.test(empty) && /"metrics": \[\]/.test(empty), '空的就是空陣列');
ok(/"consistency": None/.test(empty), '一致性沒資料時是 None（不是 100%）');
ok(!/else review\["consistency"\]/.test(wr) && /if train_days else None/.test(wr),
    '算不出來時是 None，不再退回那個編出來的 100%');

console.log('\n── 4 · 有計劃就報計劃，不要說使用者什麼都沒有 ──');
ok(/def _running_plan_status/.test(ss), '跑步：沒紀錄時改讀計劃');
ok(/def _strength_plan_status/.test(ss), '健身：沒紀錄時改讀課表');
ok(/cardio_plan_storage/.test(ss),
    '讀的是中控台同一份計劃（首頁與中控台不會再各說各話）');
ok(/return _running_plan_status\(user_id\)/.test(ss) && /return _strength_plan_status\(user_id\)/.test(ss),
    '兩邊的「沒有資料就 return None」都換成了讀計劃');

console.log('\n── 5 · 前端不再畫假的長條圖 ──');
const panel = stripJs(readFileSync(join(HERE, '..', 'src/components/WeeklyReviewPanel.jsx'), 'utf8'));
ok(/if \(!rv \|\| rv\.is_mock/.test(panel), '是示意資料就整塊不渲染');
ok(!/· 示意/.test(panel), '不再用「· 示意」兩個字帶過五條假長條圖');

console.log(fail === 0
    ? '\n✅ 後端沒有先編一份資料再送給前端\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
