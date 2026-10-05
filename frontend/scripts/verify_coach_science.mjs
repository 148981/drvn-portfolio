/**
 * verify_coach_science.mjs —— 教練說的每一句話都要對得上運動科學規則書。
 * ─────────────────────────────────────────────────────────────────────
 * 規則書的原話：「生理上錯的建議有絕對否決權 —— 寧可不說，不能說錯。」
 * 使用者會照著做，所以這裡的每一條都是硬性的，不是風格問題。
 *
 * 掃描範圍只含「真的會跑到的程式碼」。死掉的模組另外列管（見 DEAD_MODULES）：
 * 它們的數字不合規，所以規定它們必須維持沒人 import —— 有人想復活，
 * 這支就會擋下來，強迫先修數字。
 */
import fs from 'fs';
import path from 'path';

const FE = path.resolve(process.cwd(), 'src');
const BE = path.resolve(process.cwd(), '..', 'backend');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

/** 已確認沒人 import、且內含不合規數字的模組。 */
const DEAD_MODULES = ['utils/JourneyAlgorithm.js'];

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) bad++; };

const walk = (d, exts) => {
    let out = [];
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (['node_modules', '.venv_arm64', '__pycache__', 'dist', '.git'].includes(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) out = out.concat(walk(p, exts));
        else if (exts.some(x => p.endsWith(x))) out.push(p);
    }
    return out;
};

const files = [...walk(FE, ['.js', '.jsx']), ...walk(BE, ['.py'])]
    .filter(f => !DEAD_MODULES.some(d => f.endsWith(d)));

const lines = [];
for (const f of files) {
    const rel = path.relative(path.resolve(process.cwd(), '..'), f);
    read(f).split('\n').forEach((text, i) => lines.push({ f: rel, n: i + 1, text }));
}

const violations = (label, test) => {
    const hits = lines.filter(test);
    ok(hits.length === 0,
       `${label}${hits.length ? `（${hits.length} 處，例：${hits[0].f}:${hits[0].n}）` : ''}`);
    return hits;
};

console.log('\n══ 教練文案 × 運動科學規則書 ══\n');

// ── 1 · 進步判定金字塔的門檻 ──
const tp = read(path.join(BE, 'core/training_partner.py'));
ok(/e1rm_delta_pct["']?\]?\s*>=\s*2/.test(tp), 'L2 估算力量：e1RM 比近 90 天最佳高 ≥2% 才算進步');
ok(/vol_delta_pct\s*>=\s*3/.test(tp),          'L3 訓練容量：比上次同部位 ≥+3% 才算進步');
ok(/-3\s*<=\s*vol_delta_pct\s*<=\s*3/.test(tp),'±3% 視為持平（鞏固期），不包裝成進步');
ok(/density_delta_pct\s*>=\s*5/.test(tp),      'L5 訓練密度：≥+5% 才算進步');
ok(/近 30 天/.test(tp),                         'L4 里程碑用的是近 30 天');

// ── 2 · ACWR 負荷管理 ──
ok(/ratio\s*>\s*1\.5/.test(tp) && /ratio\s*>\s*1\.3/.test(tp) && /ratio\s*<\s*0\.8/.test(tp),
   'ACWR 區間是 1.5 / 1.3 / 0.8');
ok(/baseline_sessions\s*>\s*0/.test(tp),
   '沒有慢性負荷基線就不判定 ACWR（新手硬算會誤報過載）');

// ── 3 · 蛋白質只能落在 1.2–2.2 g/kg ──
violations('蛋白質都在 1.2–2.2 g/kg 之間', (l) => {
    if (!/蛋白|protein/i.test(l.text)) return false;
    // 「每餐 0.4 g/kg」是單餐的量（Schoenfeld & Aragon 2018），不是一天的總量
    if (/每餐|per[- ]meal/i.test(l.text)) return false;
    return [...l.text.matchAll(/(\d+(?:\.\d+)?)\s*(?:g\/kg|公克\/公斤|克\/公斤)/gi)]
        .some(m => { const v = parseFloat(m[1]); return v < 1.2 || v > 2.2; });
});

// ── 4 · 熱量赤字絕不超過 700，盈餘不超過 500 ──
violations('沒有超過 −700 kcal 的激進赤字', (l) =>
    [...l.text.matchAll(/(?:赤字|deficit\w*)\D{0,12}(\d{3,4})/gi)]
        .some(m => parseInt(m[1], 10) > 700));
violations('增肌盈餘沒有超過 +500 kcal', (l) =>
    [...l.text.matchAll(/(?:盈餘|surplus\w*)\D{0,12}(\d{3,4})/gi)]
        .some(m => parseInt(m[1], 10) > 500));

// ── 5 · 週跑量增幅 ≤10% ──
violations('建議的週跑量增幅都在 10% 以內', (l) =>
    [...l.text.matchAll(/跑量[^。\n]{0,8}?[+增大]\D{0,4}(\d{1,3})\s*%/g)]
        .some(m => parseInt(m[1], 10) > 10));

// ── 6 · 不准出現極端手段 ──
violations('沒有建議斷食、挨餓或其他極端手段', (l) =>
    /(間歇性?斷食|禁食|挨餓|催吐|極低熱量|暴汗減重|一天只吃)/.test(l.text) &&
    !/不建議|絕不|禁止|避免|不要/.test(l.text));

// ── 7 · 同肌群恢復 48–72 小時 ──
const recovery = lines.filter(l => /同肌群|同一部位|同部位/.test(l.text) && /小時/.test(l.text));
ok(recovery.length === 0 || recovery.every(l => /48|72/.test(l.text)),
   '同肌群恢復講的是 48–72 小時');

// ── 8 · 已經刪掉的死碼不要又長回來 ──
for (const d of DEAD_MODULES) {
    const name = path.basename(d, path.extname(d));
    ok(!fs.existsSync(path.join(FE, d)),
       `${name} 已經刪掉 —— 它建議「跑量大增 40%」，對不上週跑量 ≤10% 的護欄`);
    const importers = walk(FE, ['.js', '.jsx'])
        .filter(f => new RegExp(`from\\s+['"][^'"]*${name}['"]`).test(read(f)));
    ok(importers.length === 0,
       `沒有人匯入 ${name}` +
       (importers.length ? `（${importers.map(f => path.basename(f)).join('、')}）` : ''));
}

console.log(bad ? `\n❌ ${bad} 項不合規 —— 教練不能說生理上錯的話\n` : '\n✅ 教練說的話都對得上運動科學規則書\n');
process.exit(bad ? 1 : 0);
