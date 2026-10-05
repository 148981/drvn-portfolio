#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════
 * verify_copy_rules — DRVN 介面文案規則檢查
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼有這支：
 *
 * 「資訊簡單易懂、不要過多小字」這條規則講過很多次，但每次改完新的畫面
 * 又會冒出三行的說明文字、11 個字的按鈕、以及同一句話在兩張卡各講一次。
 * 寫在註解或設計文件裡擋不住 —— 人（和 AI）都會忘。
 * 所以把它變成可以跑的檢查：改完畫面跑一次，違規會被列出來。
 *
 * 用法：
 *   node scripts/verify_copy_rules.mjs                # 檢查全部
 *   node scripts/verify_copy_rules.mjs src/components/NutritionPageMobile.jsx
 *   node scripts/verify_copy_rules.mjs --fix-hints    # 附上修法建議
 *
 * 規則見下方 RULES；每條都有「為什麼」與實際踩過的例子。
 */

import fs from 'fs';
import path from 'path';

// ── 規則參數（要調就改這裡，不要在個別檔案破例）────────────────────────────
export const LIMITS = {
    BUTTON_MAX_CJK: 8,      // 按鈕文案上限（中文字數）
    SENTENCE_MAX_CJK: 30,   // 單一句子上限；超過就是段落，該拆或該刪
    BLOCK_MAX_CJK: 60,      // 單一文字節點總長上限
    /* 字級下限。原本是 11，但那跟設計系統直接衝突：
       字階是 9(kicker) + 12·14·16·18·20·24·28/30·36·48·60，11px 不在裡面，
       《DRVN_資訊密度與資料一致性稽核_20260908》還明文寫「11px 一律不准」，
       並已把 1,155 處拉丁 kicker 從 11px 收斂成 9px。
       門檻停在 11 會把那批刻意的收斂全部報成違規，逼人改回被禁止的尺寸。
       改成 9 = 設計系統認可的最小尺寸；全站目前沒有任何 <9px，不會漏掉真問題。 */
    MIN_FONT_PX: 9,
    MAX_CJK_TRACKING: 0.12, // 中文的 letter-spacing 上限（em）；再大就散了
};

const CJK = /[一-鿿]/;

/* ── 豁免 ────────────────────────────────────────────────────────────────
   有些長文字是對的，不該被當成違規；但豁免必須「明講」，不能靠檢查器猜：

   1. aria-label / alt / title —— 給讀螢幕軟體用的，本來就該把話說完整，
      而且不佔畫面。這類自動略過長度檢查。
   2. 點開才看得到的說明（說明卡、教學卡、免責聲明）—— 使用者是「主動想知道」
      才點進來的，那裡本來就是放完整解釋的地方。
      這類要在該區塊上方標一行：
          // copy-rules: allow-long — 為什麼這裡可以長
      豁免到 `copy-rules: end` 為止；沒標結束的話預設 80 行。
      區塊很長（例如整個說明彈窗）就務必標結束，不要靠行數硬撐。
   3. 字級與字距（R5/R6）永遠不豁免 —— 讀不到就是讀不到，沒有例外。
── */
const ALLOW_LONG = /copy-rules:\s*allow-long/;
const ALLOW_END = /copy-rules:\s*end/;
const A11Y_ATTR = /(aria-label|alt|title|placeholder)\s*=/;

function buildAllowRanges(src) {
    const lines = src.split('\n');
    const ranges = [];
    lines.forEach((l, i) => {
        if (!ALLOW_LONG.test(l)) return;
        let end = i + 81;                       // 沒標結束就預設 80 行
        for (let j = i + 1; j < lines.length; j++) {
            if (ALLOW_END.test(lines[j])) { end = j + 1; break; }
            if (ALLOW_LONG.test(lines[j])) break;   // 下一個豁免開始 → 這段到此為止
        }
        ranges.push([i + 1, end]);
    });
    return ranges;
}
const inAllow = (ranges, line) => ranges.some(([a, b]) => line >= a && line <= b);
const cjkLen = (s) => (s.match(/[一-鿿]/g) || []).length;

// ── 規則說明（違規訊息會引用）──────────────────────────────────────────────
const RULES = {
    R1: {
        name: '按鈕文案過長',
        why: `按鈕上的字是「要做什麼」，不是說明。超過 ${LIMITS.BUTTON_MAX_CJK} 字就該砍動詞以外的東西。`,
        eg: '「搜尋食物並記錄今天吃了什麼」(11字) → 「記錄一餐」(4字)',
    },
    R2: {
        name: '句子過長',
        why: `一句超過 ${LIMITS.SENTENCE_MAX_CJK} 字，使用者不會讀完。規則說明放到點得開的地方，畫面上只留現在要做的事。`,
        eg: '「先記錄實際飲食，再看剩餘量安排下一餐；運動紀錄不會自動增加飲食額度…」→ 整段刪除',
    },
    R3: {
        name: '文字區塊過長',
        why: `單一文字節點超過 ${LIMITS.BLOCK_MAX_CJK} 字就是一段散文，不是介面。`,
        eg: '三行的計劃說明 → 只留按鈕',
    },
    R4: {
        name: '括號補充說明',
        why: '要加括號解釋，代表主文案沒寫清楚。改寫主文案，或把說明移到說明卡。',
        eg: '「匯入此裝置的舊收藏（請先確認是自己的資料）」→ 「匯入舊收藏」',
    },
    R5: {
        name: '字級低於下限',
        why: `設計系統的字級下限是 ${LIMITS.MIN_FONT_PX}px（.ti-caption）。更小的字在手機上讀不到。`,
        eg: 'text-[8px] → text-[11px]',
    },
    R6: {
        name: '中文字距過大',
        why: `中文沒有字母間隙的概念，拉超過 ${LIMITS.MAX_CJK_TRACKING}em 只會讓字散開。大字距留給英文全大寫 kicker。`,
        eg: 'tracking-[0.25em] 的「當日攝取」→ tracking-[0.04em]',
    },
    R7: {
        name: '同畫面重複文案',
        why: '同一句話在同一個畫面出現兩次，第二次只會讓人困惑「這跟上面那個有什麼不一樣」。留一個，砍一個。',
        eg: '教練卡與計劃卡都說「已超過目標 4.7 KG」→ 讓計劃卡負責，教練卡讓位',
    },
};

// ── 抽出 JSX 裡「使用者看得到的」中文字串 ──────────────────────────────────
// 只看 >文字< 的文字節點與明顯的字串常值，避免掃到註解與程式邏輯。
function extractVisibleText(src) {
    const out = [];
    const lines = src.split('\n');
    let inBlockComment = false;

    lines.forEach((raw, i) => {
        let line = raw;
        // 去掉註解（區塊與單行），註解裡的中文不是介面文案
        if (inBlockComment) {
            const end = line.indexOf('*/');
            if (end === -1) return;
            line = line.slice(end + 2); inBlockComment = false;
        }
        for (;;) {
            const s = line.indexOf('/*');
            if (s === -1) break;
            const e = line.indexOf('*/', s + 2);
            if (e === -1) { line = line.slice(0, s); inBlockComment = true; break; }
            line = line.slice(0, s) + line.slice(e + 2);
        }
        line = line.replace(/\/\/.*$/, '');
        if (!CJK.test(line)) return;

        // JSX 文字節點：>中文<
        for (const m of line.matchAll(/>([^<>{}]*[一-鿿][^<>{}]*)</g)) {
            const t = m[1].trim();
            if (t) out.push({ line: i + 1, text: t, raw: line });
        }
        // 字串常值（toast / label / placeholder…）
        for (const m of line.matchAll(/['"`]([^'"`\n]*[一-鿿][^'"`\n]*)['"`]/g)) {
            const t = m[1].trim();
            if (t && !t.startsWith('//')) out.push({ line: i + 1, text: t, raw: line });
        }
    });
    return out;
}

// 是不是按鈕上的字（往上找最近的開標籤）
function isButtonContext(src, lineNo) {
    const lines = src.split('\n');
    for (let i = lineNo - 1; i >= Math.max(0, lineNo - 12); i--) {
        const l = lines[i];
        if (/<\/(motion\.)?button>/.test(l)) return false;
        if (/<(motion\.)?button\b/.test(l)) return true;
        if (/<(div|section|p|span|h[1-6])\b/.test(l) && i < lineNo - 2) return false;
    }
    return false;
}

export function checkFile(file) {
    const src = fs.readFileSync(file, 'utf8');
    const allowRanges = buildAllowRanges(src);
    const issues = [];
    const add = (rule, line, detail) => issues.push({ rule, file, line, detail });

    // ── R5 字級下限 ──
    for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]|fontSize:\s*(\d+(?:\.\d+)?)[,\s}]|fontSize=\{(\d+(?:\.\d+)?)\}/g)) {
        const v = parseFloat(m[1] || m[2] || m[3]);
        if (v > 3 && v < LIMITS.MIN_FONT_PX) {
            add('R5', src.slice(0, m.index).split('\n').length, `${v}px`);
        }
    }

    // ── R6 中文大字距 ──
    src.split('\n').forEach((line, i) => {
        const tm = line.match(/tracking-\[(0\.\d+)em\]/);
        if (!tm) return;
        if (parseFloat(tm[1]) <= LIMITS.MAX_CJK_TRACKING) return;
        const texts = [...line.matchAll(/>([^<>{}]+)</g)].map(x => x[1]).join('');
        if (CJK.test(texts)) add('R6', i + 1, `${tm[1]}em「${texts.trim().slice(0, 14)}」`);
    });

    // ── R1–R4 文案長度與括號 ──
    const visible = extractVisibleText(src);
    for (const v of visible) {
        const n = cjkLen(v.text);
        if (n === 0) continue;
        if (A11Y_ATTR.test(v.raw)) continue;          // 無障礙屬性：該講完整，且不佔畫面
        if (inAllow(allowRanges, v.line)) continue;   // 已明確標記為「點開才看的說明」

        if (isButtonContext(src, v.line) && n > LIMITS.BUTTON_MAX_CJK) {
            add('R1', v.line, `${n} 字「${v.text.slice(0, 24)}」`);
        }
        if (n > LIMITS.BLOCK_MAX_CJK) {
            add('R3', v.line, `${n} 字「${v.text.slice(0, 24)}…」`);
        } else {
            for (const sentence of v.text.split(/[。；]/)) {
                const sn = cjkLen(sentence);
                if (sn > LIMITS.SENTENCE_MAX_CJK) add('R2', v.line, `${sn} 字「${sentence.trim().slice(0, 24)}…」`);
            }
        }
        /* 只抓「括號裡是一句中文解釋」。中英對照（Lean Bulk）、代碼、單位、
           變數插值都不算 —— 那些是慣例，不是主文案沒寫清楚。 */
        for (const pm of v.text.matchAll(/（([^）]+)）/g)) {
            const inner = pm[1];
            if (inner.includes('$')) continue;                 // 變數插值
            if (cjkLen(inner) < 4) continue;                   // 中英對照 / 短單位
            add('R4', v.line, `「（${inner.slice(0, 18)}）」`);
        }
    }

    // ── R7 同檔重複文案（≥5 字的中文片語出現在兩個以上不同行）──
    const seen = new Map();
    for (const v of visible) {
        if (inAllow(allowRanges, v.line) || A11Y_ATTR.test(v.raw)) continue;
        const key = v.text.replace(/[\d.]+/g, '#').trim();      // 數字歸一：「已超過目標 4.7 KG」≈「已超過目標 # KG」
        if (cjkLen(key) < 5) continue;
        if (!seen.has(key)) seen.set(key, []);
        const arr = seen.get(key);
        if (!arr.includes(v.line)) arr.push(v.line);
    }
    for (const [key, lines] of seen) {
        if (lines.length >= 2) add('R7', lines[0], `「${key.slice(0, 20)}」也出現在第 ${lines.slice(1).join('、')} 行`);
    }

    return issues;
}

// ── CLI ────────────────────────────────────────────────────────────────────
function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
        return p.endsWith('.jsx') ? [p] : [];
    });
}

const args = process.argv.slice(2);
const showHints = args.includes('--fix-hints');
const targets = args.filter(a => !a.startsWith('--'));
const files = targets.length ? targets : walk('src');

let all = [];
for (const f of files) { try { all = all.concat(checkFile(f)); } catch { /* 跳過讀不到的 */ } }

const byRule = {};
for (const i of all) (byRule[i.rule] ||= []).push(i);

console.log('══ DRVN 介面文案規則檢查 ══\n');
const order = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];
let total = 0;
for (const r of order) {
    const list = byRule[r] || [];
    total += list.length;
    const mark = list.length ? '❌' : '✅';
    console.log(`${mark} ${r} ${RULES[r].name.padEnd(10)} ${String(list.length).padStart(4)} 處`);
    if (list.length && showHints) {
        console.log(`     └ ${RULES[r].why}`);
        console.log(`       例：${RULES[r].eg}`);
        list.slice(0, 6).forEach(i => console.log(`       · ${i.file.replace(/^src\//, '')}:${i.line}  ${i.detail}`));
        if (list.length > 6) console.log(`       · …另外 ${list.length - 6} 處`);
        console.log();
    }
}
console.log(`\n檢查 ${files.length} 支檔案，共 ${total} 處違規`);
if (!showHints && total) console.log('（加上 --fix-hints 看詳細位置與修法）');
process.exit(total ? 1 : 0);
