/**
 * verify_collections.mjs —— 同一個資料集合不可以有兩個主人。
 *
 * 2026-09 正式站事故：
 *   core/friends.py  self.kudos_file = data_dir / 'kudos.json'   → 集合 "kudos"
 *   core/social.py   self.kudos_file = data_dir / 'kudos.json'   → 集合 "kudos"
 * 兩邊都經 social_repo 以「檔名去掉副檔名」為 key 整份讀寫，
 * 但存的形狀不一樣：friends 是 {user_id, activity_id}，
 * social 讀的是 k['to_activity_id']。
 *
 * 結果：任何人在好友動態按一次讚，社群牆的 /api/feed/global 就 KeyError，
 * 整面牆永久 500 —— 而前端把 500 說成「連不到伺服器」，
 * 使用者換了三次網路都沒用。這支腳本守的就是這一類：
 *
 *   1. 沒有兩個 Storage 類別共用同一個集合名稱
 *   2. 讀別人也碰得到的集合時，不准用 k['欄位'] 直接索引
 *   3. 失敗訊息不准在「其實是 500」的時候說成網路問題
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..', '..', 'backend');
const SRC = join(HERE, '..', 'src');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

/* 先把註解與 docstring 拿掉 —— 不然這支腳本會被自己的說明文字騙到。 */
const stripPy = (s) => s
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '')
    .replace(/^\s*#.*$/gm, '');

/**
 * 掃出「每個 class 宣告了哪些集合」。
 * 形狀：self.<x>_file = self.data_dir / '<name>.json'
 * @returns {Map<string, Set<string>>} class 名稱 → 集合名稱
 */
export function collectionsByClass(src) {
    const clean = stripPy(src);
    const out = new Map();
    let cls = null;
    for (const line of clean.split('\n')) {
        const m = line.match(/^class\s+(\w+)/);
        if (m) { cls = m[1]; continue; }
        const f = line.match(/self\.\w+\s*=\s*self\.data_dir\s*\/\s*['"]([\w.-]+)\.json['"]/);
        if (f && cls) {
            if (!out.has(cls)) out.set(cls, new Set());
            out.get(cls).add(f[1]);
        }
    }
    return out;
}

/** 掃出 `k['欄位']` 這種直接索引（在 kudos/activities 這些共用集合上很危險）。 */
export function bracketReads(src, varNames = ['k', 'a']) {
    const clean = stripPy(src);
    const hits = [];
    const re = new RegExp(`\\b(${varNames.join('|')})\\[['"](\\w+)['"]\\]`, 'g');
    let m;
    while ((m = re.exec(clean))) hits.push(`${m[1]}['${m[2]}']`);
    return hits;
}

/* ── 0 · 先自我測試，確認掃描器真的抓得到 ─────────────────────── */
console.log('── 0 · 掃描器自我測試 ──');
{
    const probe = `
class A:
    def __init__(self, data_dir):
        self.kudos_file = self.data_dir / 'kudos.json'
class B:
    def __init__(self, data_dir):
        # self.kudos_file = self.data_dir / 'commented_out.json'
        self.kudos_file = self.data_dir / 'kudos.json'
        self.other_file = self.data_dir / 'other.json'
`;
    const map = collectionsByClass(probe);
    ok(map.get('A')?.has('kudos') && map.get('B')?.has('kudos'), '抓得到兩個類別搶同一個集合');
    ok(!map.get('B')?.has('commented_out'), '註解掉的那行不算數');
    ok(map.get('B')?.has('other'), '同一個類別的其他集合也抓得到');

    const hits = bracketReads(`x = k['to_activity_id']\n# y = k['ignored']\nz = k.get('safe')`);
    ok(hits.length === 1 && hits[0] === "k['to_activity_id']", '抓得到直接索引，且不被註解騙');
}

/* ── 1 · 沒有兩個主人 ─────────────────────────────────────────── */
console.log('\n── 1 · 同一個集合只能有一個主人 ──');
const owners = new Map();   // 集合名稱 → [class 名稱]
for (const file of ['core/social.py', 'core/friends.py', 'core/challenges.py']) {
    const path = join(BACKEND, file);
    if (!existsSync(path)) continue;
    for (const [cls, names] of collectionsByClass(readFileSync(path, 'utf8'))) {
        for (const n of names) {
            if (!owners.has(n)) owners.set(n, []);
            owners.get(n).push(`${file}:${cls}`);
        }
    }
}
const shared = [...owners.entries()].filter(([, who]) => who.length > 1);
ok(shared.length === 0, '沒有集合被兩個 Storage 類別共用',
    shared.map(([n, who]) => `${n} ← ${who.join(' + ')}`).join(' / '));
ok(owners.has('kudos') && owners.has('friend_kudos'),
    '社群牆與好友動態的按讚分屬不同集合');

/* ── 2 · 讀共用集合時不准硬索引 ────────────────────────────────── */
console.log('\n── 2 · 一筆髒資料不可以毒死整支 API ──');
const social = readFileSync(join(BACKEND, 'core', 'social.py'), 'utf8');
const bad = bracketReads(social, ['k']);
ok(bad.length === 0, 'social.py 讀 kudos 不再用 k[...] 直接索引', bad.join(' '));
ok(/def is_social_kudo/.test(stripPy(social)), '形狀判定收成一支 is_social_kudo');
ok(/str\(x\.get\('created_at'\) or ''\)/.test(social),
    'created_at 是 None 也不會讓排序炸掉');
ok(/except Exception as e:[\s\S]{0,160}略過讀不回來的貼文/.test(social),
    '一筆讀不回來的貼文只少那一筆，不是整面牆消失');

/* ── 3 · squad 狀態信封壞掉要自己修好 ─────────────────────────── */
console.log('\n── 3 · squad 狀態信封 ──');
const squadRepo = stripPy(readFileSync(join(BACKEND, 'repositories', 'squad_repo.py'), 'utf8'));
ok(/def is_state\(/.test(squadRepo), '有 is_state 判斷信封形狀');
ok(!/if state is not None:\s*\n\s*return state\['squads'\]/.test(squadRepo),
    '不再只用 is not None 就直接索引');
ok((squadRepo.match(/is_state\(/g) || []).length >= 5, 'transaction 與兩支 load 都過 is_state');

const blob = stripPy(readFileSync(join(BACKEND, 'repositories', 'user_blob_repo.py'), 'utf8'));
ok(/_UNINITIALIZED\s*=/.test(blob), '新列用的是哨兵值，不是 []');
ok(!/inserted\.rowcount/.test(blob), '不再用 rowcount 判斷「這列是不是我建的」');
ok(/fresh\s*=\s*original == _UNINITIALIZED/.test(blob), '改用值判斷');

/* ── 4 · 前端不准把 500 說成網路問題 ──────────────────────────── */
console.log('\n── 4 · 錯誤訊息要講實話 ──');
const failure = readFileSync(join(SRC, 'utils', 'apiFailure.js'), 'utf8');
ok(/s >= 500/.test(failure) && /FAIL_SERVER/.test(failure), '5xx 有自己的分類');
ok(/不是你的網路問題/.test(failure), '5xx 明講不是使用者的網路');
ok(/if \(!s\) return FAIL_OFFLINE/.test(failure), '只有真的沒回應才算離線');

const chrome = readFileSync(join(SRC, 'components/SocialFeed/CommunityChrome.jsx'), 'utf8');
ok(/FeedOfflineNotice = \(\{ reason \}\)/.test(chrome), '提示條的原因由外面傳進來');
ok(!/目前連不到伺服器，只顯示這台裝置上的貼文/.test(chrome), '不再寫死「連不到伺服器」');

const hook = readFileSync(join(SRC, 'components/SocialFeed/useCommunityFeed.js'), 'utf8');
ok(/failureLine\(err, '動態'\)/.test(hook), '動態牆失敗時存的是實際原因');
ok(!/setFeedError\(true\)/.test(hook), 'feedError 不再是 true/false');

const squads = readFileSync(join(SRC, 'components/SquadsView.jsx'), 'utf8');
ok(!/請確認網路/.test(squads), 'SquadsView 不再一律叫人去檢查網路');
ok((squads.match(/failureDetail\(err,/g) || []).length >= 7, '七個失敗出口都改成講實話');
ok(!/discoverFailed \? '連不到伺服器'/.test(squads), '探索頁不再寫死「連不到伺服器」');

console.log(fail === 0
    ? '\n✅ 集合沒有共用、髒資料不會毒死整支 API、錯誤訊息講的是實話\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
