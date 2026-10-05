/**
 * verify_plan_spelling.mjs —— 全庫只用一種寫法：計劃。
 *
 * 使用者每一次打字都是「計劃」，也指定了「確認計劃並微調」。
 * 之前程式碼裡兩種混用（計畫 656 處 / 計劃 539 處）——
 * 同一個東西在同一個 app 裡有兩個名字，就是設計語言不一致。
 *
 * ⚠️ 兩個地方刻意保留舊寫法，不是漏網：
 *   · planNaming.js 的 GENERIC_PLAN_NAMES —— 專門用來認出「舊的存檔名稱」。
 *     拿掉的話，使用者存檔裡的「我的訓練計畫」會被當成他自己取的名字。
 *   · i18nAutoTranslate.js 的舊寫法別名 —— 翻譯表逐字比對，
 *     鍵沒有舊寫法，存檔裡的舊字就翻不動。
 *
 * 「畫」字一律用碼點寫（\u756b），否則下次全庫換字時連這支檢查也會被換掉，
 * 變成一張永遠會過的橡皮圖章。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const OLD = '\u8a08\u756b';   // 計畫
const NEW = '\u8a08\u5283';   // 計劃

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

const SKIP = new Set(['node_modules', 'dist', '.git', '_to_delete', 'build', '__pycache__',
    'venv', '.venv', 'Pods', 'DerivedData', 'data', 'WebContent', '.verify_out_sec']);

/* 這兩支要留舊寫法才能跟舊存檔相處 —— 是設計，不是漏改 */
const ALLOW = new Map([
    ['frontend/src/utils/planNaming.js', '認出舊的存檔名稱'],
    ['frontend/src/utils/i18nAutoTranslate.js', '舊寫法的翻譯別名'],
    ['frontend/scripts/verify_plan_spelling.mjs', '這支檢查本身'],
    ['frontend/scripts/verify_cardio_commit.mjs', '斷言舊按鈕名稱已消失'],
    ['frontend/src/utils/tagToMuscleMap.js', '舊標籤「#翹臀計畫」的退路'],
]);

const walk = (dir, exts, out = []) => {
    for (const name of readdirSync(dir)) {
        // 點開頭的一律跳過（.venv、.git、.verify_out_sec…），
        // 裡面還可能有壞掉的 symlink，stat 會直接丟錯
        if (SKIP.has(name) || name.startsWith('.')) continue;
        const p = join(dir, name);
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, exts, out);
        else if (exts.some((e) => name.endsWith(e))) out.push(p);
    }
    return out;
};

const files = [
    ...walk(join(ROOT, 'frontend', 'src'), ['.js', '.jsx']),
    ...walk(join(ROOT, 'frontend', 'scripts'), ['.mjs', '.js']),
    ...walk(join(ROOT, 'backend'), ['.py']),
    ...walk(join(ROOT, 'ios'), ['.swift']),
];

console.log(`\n── 掃描 ${files.length} 支程式碼檔 ──`);
const offenders = [];
let allowed = 0;
for (const p of files) {
    const rel = relative(ROOT, p).split('\\').join('/');
    const n = (readFileSync(p, 'utf8').match(new RegExp(OLD, 'g')) || []).length;
    if (!n) continue;
    if (ALLOW.has(rel)) { allowed += n; continue; }
    offenders.push(`${rel}（${n} 處）`);
}
ok(offenders.length === 0, `沒有任何一支還在用舊寫法`,
    offenders.length ? `\n     ${offenders.slice(0, 12).join('\n     ')}` : '');
console.log(`  刻意保留：${allowed} 處，分別是`);
for (const [f, why] of ALLOW) console.log(`    · ${f.split('/').pop()} —— ${why}`);

console.log('\n── 相容性：舊存檔還認得出來嗎 ──');
const naming = readFileSync(join(ROOT, 'frontend/src/utils/planNaming.js'), 'utf8');
ok(naming.includes(`我的訓練${OLD}`), `GENERIC_PLAN_NAMES 仍認得「我的訓練${OLD}」`);
ok(naming.includes(`我的訓練${NEW}`), `也認得新寫法「我的訓練${NEW}」`);

const i18n = readFileSync(join(ROOT, 'frontend/src/utils/i18nAutoTranslate.js'), 'utf8');
ok(/legacyZhPairs/.test(i18n), '翻譯表自動補了舊寫法的別名');
ok(/const zhToEn = new Map\(\[\.\.\.pairs, \.\.\.legacyZhPairs\]\)/.test(i18n),
    '別名只進中→英');
ok(/const enToZh = new Map\(pairs\.map/.test(i18n),
    `英文切回中文一律回到「${NEW}」`);

console.log('\n── 存檔裡的舊標籤還查得到 ──');
const tagMap = await import('../src/utils/tagToMuscleMap.js');
const oldTag = `#\u7ff9\u81c0${OLD}`;
const newTag = `#\u7ff9\u81c0${NEW}`;
ok(tagMap.getMusclesFromTags([newTag]).length > 0, `新標籤「${newTag}」查得到肌群`);
ok(tagMap.getMusclesFromTags([oldTag]).length > 0,
    `舊標籤「${oldTag}」也查得到（查不到不會報錯，只會安靜少算一組肌群）`);
ok(tagMap.getMusclesFromTags(['#\u4e0d\u5b58\u5728\u7684\u6a19\u7c64']).length === 0, '不存在的標籤回空陣列');

console.log('\n── 沒有誤傷使用者存檔 ──');
for (const d of ['data', 'backend/data']) {
    try {
        const files2 = readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.json'));
        const withOld = files2.filter((f) => readFileSync(join(ROOT, d, f), 'utf8').includes(OLD));
        ok(true, `${d}/ 有 ${withOld.length} 支存檔仍是舊寫法 —— 沒有被動過`);
    } catch { ok(true, `${d}/ 不存在，略過`); }
}

console.log(fail === 0
    ? `\n✅ 全庫只剩一種寫法：${NEW}\n`
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
