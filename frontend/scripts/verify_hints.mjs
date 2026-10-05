/**
 * verify_hints.mjs —— 全 App 的「提示」只有一種長相、一套詞彙。
 *
 * 提示＝首頁輪播那張卡（每日提示與 homeAlerts 的每一則）。
 * 它要回答三件事，而且各只回答一次：
 *
 *     中標   這是哪一種提醒        跑步提醒 / 營養提醒 / 段位晉升 …
 *     標題   所以現在要做什麼      去練 … / 去記 … / 去看 …（動詞開頭）
 *     說明   為什麼是現在          一句、≤30 字
 *
 * 加上兩個視覺約定：動作那一截跳色、底下一道手寫波浪。
 *
 * 這支腳本擋的是 2026-09 稽核抓到的三類毛病：
 *   ① 中標其實是一句話（「這一輪跑完了」），而且跟系統對不上 ——
 *      key 有 strength/run/nutrition 三種，程式卻只分「是不是 strength」，
 *      於是營養週期結束時畫面寫「這一輪跑完了」，把營養說成跑步。
 *   ② 中標與標題講同一個詞（「跑步週結算」＋「去看本週跑步結算」）。
 *      中標以前沒被畫出來，所以沒人發現；一畫出來就是重複。
 *   ③ 標題不是動作（「你有 3 則新互動」），跳色沒有東西可以跳。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

/* splitHint 的規則在這裡照抄一份，用來檢查每一則提示都跳得了色。
   （元件是 .jsx，腳本不好直接 import，所以規則同步兩份 ——
    下面第 0 節會驗證兩份沒有走鐘。） */
const VERB = /^(去(?:延續|結算|完成|看|練|記|填|跑|補|改|試|選|設))/;
function splitHint(text) {
    const t = String(text || '').trim();
    if (!t) return { lead: '', rest: '' };
    const i = t.search(/[，,]/);
    if (i > 0 && i <= 12) return { lead: t.slice(0, i), rest: t.slice(i) };
    const v = t.match(VERB);
    if (v) return { lead: v[1], rest: t.slice(v[1].length) };
    return { lead: '', rest: t };
}

console.log('── 0 · 跳色規則本身 ──');
{
    ok(splitHint('再練一次，總訓練量再疊一層。').lead === '再練一次', '有逗號 → 逗號前面那一截');
    ok(splitHint('去記今天吃了什麼').lead === '去記', '沒逗號 → 只跳動詞');
    ok(splitHint('去延續第 12 天').lead === '去延續', '三個字的動詞也認得');
    /* 這條是真的踩過：/^去[一-鿿]{1,2}/ 會貪心吃到下一個字，
       「去記今天吃了什麼」變成跳「去記今」。動詞必須逐個列。 */
    ok(!/^去[一-鿿]\{1,2\}/.test(VERB.source), '動詞是明列的，不是貪心量詞');
    ok(splitHint('你有 3 則新互動').lead === '', '認不出動作就整句不跳色');

    const copy = read('utils/hintCopy.js');
    ok(/去\(\?:延續\|結算\|完成\|看\|練\|記\|填\|跑\|補\|改\|試\|選\|設\)/.test(copy),
        'utils/hintCopy 的動詞表與這支腳本一致');
    const wave = read('components/ui/HandWave.jsx');
    ok(!/export (function|const) splitHint/.test(wave),
        '純函式不住在元件檔裡（react-refresh 會壞）');
    ok(/vectorEffect="non-scaling-stroke"/.test(wave),
        '波浪橫向拉伸時筆畫不變形');
}

console.log('\n── 1 · 每一則提示的三件事 ──');
const alerts = stripJs(read('utils/homeAlerts.js'));
/* 把每一個 eyebrow / title 配成一對（同一則提示裡 eyebrow 一定在 title 前面） */
const pairs = [];
{
    const re = /eyebrow:\s*([^\n]+?),?\s*(?:\n\s*)?title:\s*([^\n]+?),\s*$/gm;
    let m;
    while ((m = re.exec(alerts))) pairs.push({ eyebrow: m[1].trim().replace(/,$/, ''), title: m[2].trim() });
}
ok(pairs.length >= 10, `抓得到每一則提示的中標與標題（${pairs.length} 則）`);

const literal = (expr) => {
    const out = [];
    const re = /'([^']*)'|`([^`]*)`/g;
    let m;
    while ((m = re.exec(expr))) out.push((m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, '＃'));
    return out;
};

let noVerb = [], echo = [], longEyebrow = [];
for (const { eyebrow, title } of pairs) {
    for (const t of literal(title)) {
        const clean = t.replace(/＃/g, '').trim();
        if (!clean) continue;
        if (!splitHint(clean).lead) noVerb.push(clean);
    }
    for (const e of literal(eyebrow)) {
        const ec = e.replace(/＃/g, '').trim();
        if (!ec) continue;
        if (ec.length > 5) longEyebrow.push(ec);
        // 中標裡連續兩個以上的中文字又出現在標題 → 同一件事講兩次
        for (const t of literal(title)) {
            for (let i = 0; i + 2 <= ec.length; i++) {
                const frag = ec.slice(i, i + 2);
                if (/[一-鿿]{2}/.test(frag) && t.includes(frag)) echo.push(`${ec} ↔ ${t}`);
            }
        }
    }
}
ok(noVerb.length === 0, '每一則標題都是動作開頭（跳色才有東西可跳）', noVerb.join(' / '));
ok(echo.length === 0, '中標沒有跟標題講同一個詞', [...new Set(echo)].join(' / '));
ok(longEyebrow.length === 0, '中標都 ≤5 字', [...new Set(longEyebrow)].join(' / '));

console.log('\n── 2 · 中標是分類，不是一句話 ──');
ok(!/eyebrow:\s*key === 'strength' \?/.test(alerts),
    '週期結算的中標不再用「是不是重訓」二分（營養會被說成跑步）');
ok(/const CYCLE_ENDED = \{/.test(alerts) && /nutrition: '這一期結束了'/.test(alerts),
    '三個系統各有自己的週期名稱');
/* ⚠️ 這條原本斷言中標是 `${s.label}提醒`。程式後來刻意把「提醒」拿掉了
   （homeAlerts.js 的註解寫了原因：整張卡就是提醒，中標再講一次是重複，
   介面標準 §2）。是這支檢查沒跟上，不是程式錯 —— 改成斷言現在的規則：
   中標就是系統名本身，而且不可以再加「提醒」。 */
ok(/eyebrow: s\.label,/.test(alerts), '週期結算的中標跟著系統走');
ok(!/eyebrow: `\$\{s\.label\}提醒`/.test(alerts), '中標沒有多一個「提醒」（整張卡就是提醒）');
ok(!/'這一季練完了',\s*\n\s*title: '去看這個月/.test(alerts),
    '同一則提示不會中標寫「這一季」、標題寫「這個月」');

console.log('\n── 3 · 兩種提示卡長得一樣 ──');
for (const [file, label] of [
    ['components/DailyInsightCard.jsx', '每日提示'],
    ['components/ActionFirstDashboardMobile.jsx', 'homeAlerts 提醒卡'],
]) {
    const src = read(file);
    ok(/splitHint\(/.test(src), `${label}：動作跳色`);
    ok(/<HandWave/.test(src), `${label}：手寫波浪`);
    ok(/fontWeight:[^,\n]*\b300\b/.test(src), `${label}：大字用細體`);
    ok(/fontSize: 11, fontWeight: 600/.test(src), `${label}：中標 11px`);
}

console.log(fail === 0
    ? '\n✅ 提示：中標／動作／原因各講一次，全 App 同一套詞彙與長相\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
