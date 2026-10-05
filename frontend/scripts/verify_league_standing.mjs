import assert from 'node:assert/strict';
import { posOf, promoGateAt, releGateAt, zoneOf, actionLine } from '../src/utils/leagueStanding.js';
import { computeSettlement, LEAGUES } from '../src/utils/leagueStore.js';

let n = 0;
const ok = (msg) => { n++; console.log('  ✓', msg); };

// ── 1. posOf 單調、落在 [0,1] ────────────────────────────────────
for (const total of [1, 2, 7, 24, 128, 1000]) {
    let prev = Infinity;
    for (let r = 1; r <= total; r++) {
        const p = posOf(r, total);
        assert.ok(p >= 0 && p <= 1, `posOf(${r},${total})=${p} 超出 [0,1]`);
        assert.ok(p < prev, `posOf 不單調：rank ${r} of ${total}`);
        prev = p;
    }
}
ok('posOf 對 1/2/7/24/128/1000 人都落在 [0,1] 且名次越前值越大');

assert.equal(posOf(undefined, 24), 0);
assert.equal(posOf(5, 0), 0);
assert.equal(posOf(5, undefined), 0);
ok('posOf 對缺資料回 0，不會產生 NaN 寬度');

// ── 2. 圖跟字不可矛盾（§4）：在晉升區 ⇒ 填滿一定越過晉升線 ────────
for (const total of [3, 7, 10, 24, 37, 128, 999]) {
    const promoCount = Math.ceil(total * 0.3);
    const releCount = Math.ceil(total * 0.3);
    const pg = promoGateAt(total, promoCount);
    const rg = releGateAt(total, releCount);
    for (let r = 1; r <= total; r++) {
        const p = posOf(r, total);
        const z = zoneOf(r, total, promoCount, releCount);
        if (z === 'promote' && pg !== null) {
            assert.ok(p > pg, `rank ${r}/${total} 在晉升區，但填滿 ${p} 沒越過晉升線 ${pg}`);
        }
        if (z === 'hold' && pg !== null) {
            assert.ok(p < pg, `rank ${r}/${total} 不在晉升區，填滿 ${p} 卻越過晉升線 ${pg}`);
        }
        if (z === 'relegate' && rg !== null) {
            assert.ok(p < rg, `rank ${r}/${total} 在降級區，但填滿 ${p} 沒落在降級線 ${rg} 左邊`);
        }
        if (z === 'hold' && rg !== null) {
            assert.ok(p > rg, `rank ${r}/${total} 不在降級區，填滿 ${p} 卻落在降級線 ${rg} 左邊`);
        }
    }
}
ok('每一個名次：實心填滿的位置與它所在的分區一致（圖不會跟字矛盾）');

// ── 3. 分區必須跟月底真正的結算同一套規則（§8 單一真相源）─────────
for (const total of [3, 7, 10, 24, 37, 128]) {
    const promoCount = Math.ceil(total * 0.3);
    const releCount = Math.ceil(total * 0.3);
    for (let r = 1; r <= total; r++) {
        const zone = zoneOf(r, total, promoCount, releCount);
        const mid = LEAGUES[1];                       // 中間段位，升降都可能
        const settle = computeSettlement({ rank: r, total, league: mid });
        const expect = settle.outcome === 'promote' ? 'promote'
            : settle.outcome === 'relegate' ? 'relegate' : 'hold';
        assert.equal(zone, expect,
            `rank ${r}/${total}：卡片說 ${zone}，月底結算會是 ${expect}`);
    }
}
ok('卡片畫的分區 === leagueStore.computeSettlement 月底真的會做的升/降/守');

// ── 4. 動作句 ────────────────────────────────────────────────────
assert.equal(actionLine(8, 24, 8, 8, null), '守到月底就留在最高段');
assert.equal(actionLine(8, 24, 8, 8, 'Black Card'), '守到月底就升上 Black Card');
assert.equal(actionLine(9, 24, 8, 8, 'X'), '再前進 1 名就進晉升區');
assert.equal(actionLine(17, 24, 8, 8, 'X'), '再前進 1 名就脫離降級區');
assert.equal(actionLine(24, 24, 8, 8, 'X'), '再前進 8 名就脫離降級區');
ok('動作句：晉升區/中段/降級區各講對一句，名次差算得對');

// 「再前進 N 名」的 N 一定 ≥ 1，不會出現「再前進 0 名」
for (const total of [3, 7, 24, 128]) {
    const pc = Math.ceil(total * 0.3), rc = Math.ceil(total * 0.3);
    for (let r = 1; r <= total; r++) {
        const line = actionLine(r, total, pc, rc, 'X');
        const m = line.match(/再前進 (\d+) 名/);
        if (m) assert.ok(Number(m[1]) >= 1, `rank ${r}/${total} → "${line}"`);
    }
}
ok('不會出現「再前進 0 名」這種沒意義的動作句');

// ── 5. 閘門在沒有晉升/降級區時不畫 ────────────────────────────────
assert.equal(promoGateAt(3, 3), null, '全員晉升時不該畫晉升線');
assert.equal(releGateAt(3, 3), null, '全員降級時不該畫降級線');
assert.equal(promoGateAt(24, 0), null);
ok('沒有晉升/降級區時不畫線（§5 沒資料就不顯示）');


// ── 6. 人少時兩條閘門不可以疊在同一個位置（標籤會變一團）──────────
{
    const { gatesOf } = await import('../src/utils/leagueStanding.js');
    for (let total = 1; total <= 200; total++) {
        const pc = Math.ceil(total * 0.3), rc = Math.ceil(total * 0.3);
        const gates = gatesOf(total, pc, rc);
        // 兩條線之間至少要拉開 12%（軌道約 318px → 38px，放得下兩個 34px 的標籤）
        for (let i = 1; i < gates.length; i++) {
            assert.ok(gates[i].at - gates[i - 1].at >= 0.12,
                `total=${total}：閘門 ${gates[i - 1].label}@${gates[i - 1].at} 與 ${gates[i].label}@${gates[i].at} 太近`);
        }
        // 沒有守段區時只能有一條線
        if (pc + rc >= total && gates.length) {
            assert.equal(gates.length, 1, `total=${total}：沒有守段區卻畫了 ${gates.length} 條線`);
            assert.equal(gates[0].label, '升降分界');
        }
        // 每一條線都要落在軌道內
        for (const g of gates) assert.ok(g.at > 0 && g.at < 1, `total=${total}：閘門 ${g.label} 在軌道外 (${g.at})`);
    }
    ok('1~200 人：閘門不重疊、沒有守段區時只畫一條、線都在軌道內');
}

console.log(`\n✅ ${n} 組斷言全過`);
