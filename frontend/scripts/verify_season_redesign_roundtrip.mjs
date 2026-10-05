// verify_season_redesign_roundtrip.mjs — 季末「換部位，重排一份」來回一趟
//   · 收官頁存舊計劃快照 → 產生器成功後拿一次就刪 → 回收官頁給看「改了什麼」
//   · 快照綁這一次收官（cycleDoneKey）＋ 時效：返回／失敗／重新整理後，不會在別次生成冒出錯的摘要
//   · 摘要只寫真的有變的：天數、分化、每週組數、次數、部位組數、加進來跟拿掉的動作（前 3 個＋還有 N 個）
import * as esbuild from 'esbuild';
const r = await esbuild.build({
    stdin: { contents: "export * as rd from './src/utils/planRedesignDiff.js';", resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
});
const { rd } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
let fail = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };

const mkStore = () => {
    const m = {};
    return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
};
const ex = (name, muscle, sets = 3, reps = '8-12', extra = {}) => ({ name, muscle, sets, reps, ...extra });
const weeks = (days) => [1, 2, 3, 4].map((n) => ({ week: n, phase: n === 4 ? 'deload' : 'build', days: days() }));

const oldPlan = {
    plan_id: 'old', split_label: '上肢強化分化 (PPL + Upper)', days_per_week: 3,
    weeks: weeks(() => [
        { exercises: [ex('暖身跳繩', 'core', 1, '60', { isWarmup: true }), ex('槓鈴臥推', 'chest', 4), ex('上斜啞鈴推舉', 'chest'), ex('啞鈴側平舉', 'shoulders', 3, '12-15')] },
        { exercises: [ex('引體向上', 'back', 4), ex('槓鈴划船', 'back'), ex('二頭彎舉', 'biceps')] },
        { exercises: [ex('深蹲', 'quads', 3), ex('羅馬尼亞硬舉', 'hamstrings')] },
    ]),
};
const newPlan = {
    plan_id: 'new', split_label: '下肢強化分化 (Lower Focus)', days_per_week: 4,
    weeks: weeks(() => [
        { exercises: [ex('深蹲', 'quads', 4, '6-10'), ex('保加利亞分腿蹲', 'quads', 3, '6-10'), ex('腿彎舉', 'hamstrings', 3, '6-10')] },
        { exercises: [ex('槓鈴臥推', 'chest', 3, '6-10'), ex('引體向上', 'back', 3, '6-10')] },
        { exercises: [ex('臀推', 'glutes', 4, '6-10'), ex('羅馬尼亞硬舉', 'hamstrings', 4, '6-10'), ex('提踵', 'calves', 3, '6-10')] },
        { exercises: [ex('坐姿肩推', 'shoulders', 3, '6-10'), ex('滑輪下拉', 'back', 3, '6-10'), ex('繩索夾胸', 'chest', 3, '6-10')] },
    ]),
};

// ── 摘要 ─────────────────────────────────────────────
const s = rd.summarizeRedesign(oldPlan, newPlan);
const ov = Object.fromEntries(s.overview.map((o) => [o.label, `${o.from}→${o.to}`]));
ok(ov['每週'] === '3 天→4 天', `每週天數 3→4（${ov['每週']}）`);
ok(ov['分化'] === '上肢強化分化→下肢強化分化', `分化名稱去掉英文括號（${ov['分化']}）`);
ok(ov['組數'] === '每週 26 組→每週 36 組', `每週組數只算正式動作、不算暖身、不看減量週（${ov['組數']}）`);
ok(ov['次數'] === '8-12 下→6-10 下', `常用次數 8-12→6-10（${ov['次數']}）`);
const legs = s.muscles.find((m) => m.tag === 'legs');
ok(legs && legs.from === 6 && legs.to === 21 && s.muscles[0].tag === 'legs', `腿每週 6→21 組，多練的排第一（${s.muscles.map((m) => `${m.label}${m.from}→${m.to}`).join('、')}）`);
ok(!s.muscles.some((m) => Math.abs(m.to - m.from) < 3), '變化不到 3 組的部位不列（不灌水）');
ok(s.added.length === 7 && s.added[0] === '保加利亞分腿蹲', `新加 7 個動作（${s.added.join('、')}）`);
ok(s.removed.length === 4 && !s.removed.includes('暖身跳繩'), `拿掉 4 個動作、暖身不算（${s.removed.join('、')}）`);
ok(s.kept === 4, `沿用 4 個動作（${s.kept}）`);
const clip = rd.clipNames(s.added, 3);
ok(clip.shown.length === 3 && clip.rest === 4 && clip.text.endsWith('還有 4 個'), `名單只列前 3 個＋「還有 N 個」（${clip.text}）`);
ok(rd.redesignHeadline(s) === '每週 3→4 天、腿多練、換了 7 個動作', `頁首一句話：${rd.redesignHeadline(s)}`);
ok(s.muscles.some((m) => m.tag === 'arms' && m.from === 3 && m.to === 0), '手臂 3→0 組也列出來（少練）');

const same = rd.summarizeRedesign(oldPlan, JSON.parse(JSON.stringify({ ...oldPlan, plan_id: 'x' })));
ok(rd.redesignChangeCount(same) === 0, '整份一樣 → 0 項改動（不編造）');
ok(rd.redesignHeadline(same) === '課表沒有變', '整份一樣 → 頁首寫「課表沒有變」');
ok(rd.summarizeRedesign(null, newPlan) === null && rd.summarizeRedesign(oldPlan, {}) === null, '缺一份計劃 → 不給摘要');
const zh = rd.summarizeRedesign({ weeks: [{ days: [{ exercises: [ex('Barbell Bench Press', 'chest')] }] }] }, { weeks: [{ days: [{ exercises: [ex('槓鈴臥推', 'chest')] }] }] },
    { nameOf: (n) => (n === 'Barbell Bench Press' ? '槓鈴臥推' : n) });
ok(zh.added.length === 0 && zh.removed.length === 0, '英文名（引擎）跟中文名（舊計劃）先轉中文再比：同一個動作不算換');

// ── 快照：存 → 拿一次就刪 ───────────────────────────────
const KEY = 'drvn_cycle_shown_u1_old_s1';
const T0 = 1_700_000_000_000;
let st = mkStore();
ok(rd.saveRedesignSnapshot(st, 'u1', { plan: oldPlan, cycleDoneKey: KEY, season: 2, now: T0 }), '收官頁按「去換部位」：存舊計劃快照');
ok(JSON.parse(st.m[rd.redesignSnapshotKey('u1')]).plan.weeks[0].days[0].exercises[1].name === '槓鈴臥推', '快照只留比對要用的欄位');
ok(rd.readRedesignSnapshot(st, 'u1', { cycleDoneKey: 'other_key', now: T0 + 1000 }) === null && st.m[rd.redesignSnapshotKey('u1')], '別一次收官的 key 拿不到，也不會被刪');
const got = rd.takeRedesignSnapshot(st, 'u1', { cycleDoneKey: KEY, now: T0 + 60_000 });
ok(got && got.season === 2 && got.plan.plan_id === 'old', '產生器成功：同一次收官拿得到快照');
ok(!st.m[rd.redesignSnapshotKey('u1')], '拿過一次就刪掉');
ok(rd.takeRedesignSnapshot(st, 'u1', { cycleDoneKey: KEY, now: T0 + 61_000 }) === null, '第二次生成（上一頁回去又按一次）→ 沒有摘要，不重複結算');

// 返回不生成：快照清掉；之後重新換部位會覆蓋舊的
st = mkStore();
rd.saveRedesignSnapshot(st, 'u1', { plan: oldPlan, cycleDoneKey: KEY, season: 2, now: T0 });
rd.clearRedesignSnapshot(st, 'u1');
ok(rd.readRedesignSnapshot(st, 'u1', { cycleDoneKey: KEY, now: T0 }) === null, '在產生器按返回：快照清掉');
rd.saveRedesignSnapshot(st, 'u1', { plan: oldPlan, cycleDoneKey: KEY, season: 2, now: T0 });
rd.saveRedesignSnapshot(st, 'u1', { plan: newPlan, cycleDoneKey: KEY, season: 2, now: T0 + 5000 });
ok(rd.readRedesignSnapshot(st, 'u1', { cycleDoneKey: KEY, now: T0 + 6000 }).plan.plan_id === 'new', '再換一次部位：用最新存的那份');

// 過期 / 壞掉 / 時鐘倒退
st = mkStore();
rd.saveRedesignSnapshot(st, 'u1', { plan: oldPlan, cycleDoneKey: KEY, season: 2, now: T0 });
ok(rd.takeRedesignSnapshot(st, 'u1', { cycleDoneKey: KEY, now: T0 + rd.REDESIGN_SNAPSHOT_TTL_MS + 1 }) === null && !st.m[rd.redesignSnapshotKey('u1')], '放太久（重新整理後隔天才生成）→ 作廢並清掉，不顯示錯的摘要');
st = mkStore(); st.setItem(rd.redesignSnapshotKey('u1'), '{not json');
ok(rd.takeRedesignSnapshot(st, 'u1', { cycleDoneKey: KEY, now: T0 }) === null && !st.m[rd.redesignSnapshotKey('u1')], '快照壞掉 → null 並清掉');
st = mkStore();
rd.saveRedesignSnapshot(st, 'u1', { plan: oldPlan, cycleDoneKey: KEY, season: 2, now: T0 });
ok(rd.readRedesignSnapshot(st, 'u1', { cycleDoneKey: KEY, now: T0 - 3_600_000 }) === null, '時鐘倒退（存的時間在未來）→ 不採用');
ok(!rd.saveRedesignSnapshot(mkStore(), 'u1', { plan: oldPlan, cycleDoneKey: null }), '沒有 cycleDoneKey 不存（綁不到哪一次收官）');
ok(rd.readRedesignSnapshot(st, 'u2', { cycleDoneKey: KEY, now: T0 }) === null, '換帳號拿不到別人的快照');

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
