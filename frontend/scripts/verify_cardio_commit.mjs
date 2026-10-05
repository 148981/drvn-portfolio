/**
 * verify_cardio_commit.mjs —— 「確認計劃」按下去之後，一定要有事情發生。
 *
 * 使用者回報：「現在甚至也按不下去」。
 * 按鈕其實按得下去 —— 是那條路上有四個無聲的出口：
 *   ① 沒有 generatedPlan → return   ② 沒有 userId → return
 *   ③ 後端沒回 plan_id  → catch    ④ 連線失敗／逾時 → catch
 * 四個都只 console.warn。使用者看到的就是「按了沒反應」。
 *
 * 所以這支不是檢查按鈕能不能點，而是檢查：
 *   這條路徑上「每一個出口都會在畫面上留下痕跡」。
 *
 * 掃描器自己也要被驗：最後會拿「舊版的寫法」當靶子跑一次，
 * 抓不到舊版的四個無聲出口，這支就等於橡皮圖章。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (p) => readFileSync(join(SRC, p), 'utf8');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
    return cond;
};

/* ════════════════════════════════════════════════════════════════
   掃描器：把一段 commitPlan 的原始碼拆開，找出「沒有回饋的出口」
   ════════════════════════════════════════════════════════════════ */

/** 使用者看得到的動作 —— 出口上至少要有一個 */
const VISIBLE = [/toast\./, /navigate\(/, /goAfterCommit\(/, /recordPlanLive\(/, /fireMoment\(/];
const isVisible = (s) => VISIBLE.some((re) => re.test(s));

/** 從 `開頭` 起找到配對的大括號，回傳 { body, end } */
function blockAfter(src, from) {
    const open = src.indexOf('{', from);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return { body: src.slice(open + 1, i), end: i };
        }
    }
    return null;
}

/** 找出函式體裡所有的 return，回報它所在的那一段有沒有給使用者回饋。 */
function auditExits(body) {
    const problems = [];
    // 每一個 `return` 往回找它最近的 `{`，取那一段（同層）當上下文
    const re = /\breturn\b[^;\n]*;/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        const before = body.slice(0, m.index);
        // 往回抓最近一個未閉合的 `{` → 這個 return 所在的區塊
        let depth = 0, start = -1;
        for (let i = before.length - 1; i >= 0; i--) {
            const c = before[i];
            if (c === '}') depth++;
            else if (c === '{') { if (depth === 0) { start = i; break; } depth--; }
        }
        // start < 0 = 這個 return 直接掛在函式最外層（`if (x) return;` 這種），
        // 它的上下文只有那一句；拿整個函式體當上下文的話，函式裡任何一個
        // toast 都會替它背書 —— 舊版四個無聲出口就是這樣被漏掉的。
        let ctx;
        if (start < 0) {
            let s = 0;
            for (const ch of [';', '}', '{']) {
                const k = before.lastIndexOf(ch);
                if (k > s) s = k;
            }
            ctx = body.slice(s + 1, m.index + m[0].length);
        } else {
            ctx = blockAfter(body, start - 1)?.body ?? body.slice(start + 1);
        }
        // 連點防護（if (saving) return;）是刻意安靜的：那不是失敗，是重複觸發
        const isReentrancyGuard = /\bsaving\b/.test(before.slice(-60));
        if (isReentrancyGuard) continue;
        if (!isVisible(ctx)) {
            problems.push(`無聲出口：${m[0].trim()}  ← 這一段沒有 toast／導航`);
        }
    }
    // catch 一定要講話
    const cIdx = body.search(/\bcatch\s*\(/);
    if (cIdx < 0) problems.push('沒有 catch —— 網路失敗會變成沒人接的 rejection');
    else {
        const cb = blockAfter(body, cIdx);
        if (!cb) problems.push('catch 區塊解析失敗');
        else if (!isVisible(cb.body)) problems.push('catch 只寫進 console，使用者看不到任何東西');
    }
    return problems;
}

function commitBodyOf(src) {
    const i = src.indexOf('const commitPlan = useCallback(');
    if (i < 0) return null;
    return blockAfter(src, i + 'const commitPlan = useCallback('.length)?.body ?? null;
}

/* ════════════════════════════════════════════════════════════════
   1 · 真正的 CardioPlanBuilder：出口必須全部有回饋
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 1 · 確認計劃這條路上沒有無聲的出口 ──');
const builder = read('components/CardioPlanBuilder.jsx');
const body = commitBodyOf(builder);
ok(!!body, 'commitPlan 找得到（兩顆按鈕只有一條存檔路徑）');
const problems = body ? auditExits(body) : ['找不到 commitPlan'];
ok(problems.length === 0, `commitPlan 的每個出口都會讓使用者看到東西`, problems.length ? `\n     ${problems.join('\n     ')}` : '');

ok(!/const handleCommitAndEdit = useCallback\(async/.test(builder),
    '沒有第二份存檔函式（舊版兩份幾乎一樣，改一邊另一邊不會跟）');

/* ════════════════════════════════════════════════════════════════
   2 · 掃描器自檢：舊版的寫法一定要被抓出來
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 2 · 掃描器自檢：拿舊版當靶子 ──');
const OLD_SHAPE = `
    const commitPlan = useCallback(async () => {
        if (!generatedPlan || !userId) return;
        setSaving(true);
        try {
            const { data } = await apiClient.post('/api/cardio-plan/save', {
                user_id: userId,
                plan: { ...generatedPlan },
            });
            if (!data?.plan?.plan_id) throw new Error('沒有取得已儲存計劃');
            publishProgram(userId, { running: data.plan });
            navigate(returnTo || '/cardio-microcycle-inbox');
        } catch (e) {
            console.warn('[CardioPlanBuilder] save failed:', e?.message);
            setSaving(false);
        }
    }, []);`;
const oldProblems = auditExits(commitBodyOf(OLD_SHAPE));
ok(oldProblems.length >= 2, `舊版被抓到 ${oldProblems.length} 個無聲出口（掃描器有在做事）`,
    `\n     ${oldProblems.join('\n     ')}`);

/* ════════════════════════════════════════════════════════════════
   3 · 失敗訊息：每一種失敗都要說「怎麼了 ＋ 現在做什麼」
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 3 · 每一種失敗都有一句給使用者的話 ──');
const { commitErrorMessage, planWeeks } = await import('../src/utils/cardioPlanCommit.js');
const failures = [
    ['後端沒回計劃編號', new Error('NO_PLAN_ID')],
    ['逾時',            { code: 'ECONNABORTED' }],
    ['登入過期 401',    { response: { status: 401 } }],
    ['沒有權限 403',    { response: { status: 403 } }],
    ['已有計劃 409',    { response: { status: 409 } }],
    ['斷網（無 response）', { message: 'Network Error' }],
    ['其他 500',        { response: { status: 500 } }],
    ['完全空的錯誤',    undefined],
];
const seen = new Set();
for (const [name, e] of failures) {
    const msg = commitErrorMessage(e);
    const good = typeof msg === 'string' && msg.length > 0 && msg.length <= 30;
    ok(good, `${name.padEnd(18)}→「${msg}」`, good ? '' : '（空的或超過 30 字）');
    seen.add(msg);
}
ok(seen.size >= 6, `${seen.size} 種不同的說法（不是一句「失敗」打發全部）`);

/* ════════════════════════════════════════════════════════════════
   4 · 儀式上的週數必須來自「後端存回來的那一份」
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 4 · 儀式報的週數不會說謊 ──');
ok(planWeeks({ weeks: [1, 2, 3, 4, 5, 6, 7, 8] }, 12) === 8, '後端回 8 週 → 報 8（不是畫面上設定的 12）');
ok(planWeeks({ total_weeks: 10 }, 12) === 10, '只有 total_weeks → 報 10');
ok(planWeeks({}, 12) === 12, '後端沒講 → 退回畫面上的設定');
ok(planWeeks(null, 0) === 0, '什麼都沒有 → 0（不編一個數字）');
ok(planWeeks({ total_weeks: 'x' }, NaN) === 0, '壞資料 → 0，不會印出 NaN 週');
ok(builder.includes('planWeeks(saved, config.totalWeeks)'), '存檔成功後真的用 planWeeks 算儀式的週數');

/* ════════════════════════════════════════════════════════════════
   5 · 儀式：每一次確認都要有，而且一定走得掉
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 5 · 計劃成立的儀式 ──');
const engine = read('utils/momentEngine.js');
ok(/export function recordPlanLive/.test(engine), 'recordPlanLive 存在');
const pIdx = engine.indexOf('export function recordPlanLive');
const planLive = pIdx < 0 ? '' : engine.slice(pIdx, engine.indexOf('\n}\n', pIdx) + 3);
ok(!/hitGrowing|MILESTONES|momentFirst:/.test(planLive),
    '不做里程碑節流 —— 每一次確認計劃都要看得到');
ok(/holdMs:\s*1200/.test(planLive), 'holdMs 1200ms（加上打字約 1.6s 內，符合儀式型動畫上限）');
ok(/recordFirst\(userId, 'gen_run_plan'\)\)\s*\{\s*\n\s*recordPlanLive/.test(builder)
   || /if \(!recordFirst\(userId, 'gen_run_plan'\)\)/.test(builder),
    '第一次有專屬時刻、之後每次都有成立時刻 —— 兩者不會同時播');
ok(/afterMomentIdle\(\(\) => goAfterCommit\(dest\)\)/.test(builder), '儀式收場後才跳頁');
ok(/setTimeout\(\(\) => goAfterCommit\(dest\), \d+\)/.test(builder),
    '有保險計時器 —— 儀式萬一沒收場，也不會把人鎖在原地');
ok(/leaveOnce\.current/.test(builder), '跳頁只會發生一次（儀式與保險同時到也不會跳兩次）');

// goAfterCommit 的「只跳一次」在這裡真的跑一遍
const calls = [];
const leaveOnce = { current: false };
const goAfterCommit = (dest) => {
    if (leaveOnce.current) return;
    leaveOnce.current = true;
    calls.push(dest);
};
goAfterCommit('plan'); goAfterCommit('plan'); goAfterCommit('editor');
ok(calls.length === 1 && calls[0] === 'plan', `連叫三次只跳一次 → ${JSON.stringify(calls)}`);

/* ════════════════════════════════════════════════════════════════
   6 · 減少動態：儀式要跳過動畫，但不可以跳過內容
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 6 · prefers-reduced-motion ──');
const swiss = read('components/SwissMoment.jsx');
ok(/prefers-reduced-motion/.test(swiss), 'SwissMoment 讀得到系統的減少動態設定');
ok(/const RM = reduceMotion\(\)/.test(swiss), 'render 時決定要不要動');
const motionProps = swiss.match(/initial=\{[^}]*\}/g) || [];
const guarded = motionProps.filter((s) => s.includes('RM')).length;
ok(guarded >= 5, `${guarded}/${motionProps.length} 個進場動畫會被減少動態關掉`);
ok(!/if \(reduceMotion\(\)\) return;?\s*\n\s*queue/.test(swiss),
    '減少動態時不是整則靜音 —— 使用者還是要看得到計劃成立');

/* ════════════════════════════════════════════════════════════════
   7 · 逾時：存檔不能用預設的 15 秒
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 7 · 存檔逾時 ──');
const client = read('api/client.js');
const dflt = Number((client.match(/timeout:\s*(\d+)/) || [])[1] || 0);
const save = Number((builder.match(/\{\s*timeout:\s*(\d+)\s*\},/) || [])[1] || 0);
ok(save > dflt, `存檔逾時 ${save}ms > apiClient 預設 ${dflt}ms（冷啟動不會白按一次）`);

/* ════════════════════════════════════════════════════════════════
   8 · 按鈕文案
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 8 · 兩顆按鈕 ──');
ok(builder.includes('確認計劃並微調'), '次要按鈕叫「確認計劃並微調」');
ok(builder.includes("'確認計劃'"), '主要按鈕叫「確認計劃」');
ok(!builder.includes('儲存並微調'), '「儲存並微調」已經不在了');
for (const label of ['確認計劃', '確認計劃並微調', '建立中…', '繼續']) {
    ok(label.length <= 8, `「${label}」${label.length} 字 ≤ 8`);
}
// 「計畫」的畫字用碼點寫，否則下次全庫換字時連這條檢查也會被一起換掉
const OLD_PLAN = '\u8a08\u756b';
ok(!builder.includes(`\u78ba\u8a8d${OLD_PLAN}`), `按鈕不再是「\u78ba\u8a8d${OLD_PLAN}」`);

/* ════════════════════════════════════════════════════════════════
   9 · 圖六那塊排程確認只從跑步精靈拿掉，別處不受影響
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 9 · 拿掉的只有跑步精靈那一塊 ──');
ok(!/TrainingScheduleReview/.test(builder), '跑步精靈裡沒有「健身與跑步日期確認」了');
ok(/TrainingScheduleReview/.test(read('components/TrainingProgramDesigner.jsx')), 'TrainingProgramDesigner.jsx 照舊');
// 健身計劃精靈在 e253285 把「日期確認清單」換成七天排程條（WeekScheduleStrip，與首頁同一支 buildWeeklyAgenda）——
// 這裡要確認的是「精靈仍然看得到這一週的重訓＋跑步排法」，不是舊元件的名字。
{
    const gen = read('components/WorkoutPlanGeneratorViewMobile.jsx');
    const strip = read('components/WeekScheduleStrip.jsx');
    ok(/<WeekScheduleStrip\b/.test(gen), '健身計劃精靈照舊看得到一週排程（七天排程條）');
    ok(/buildWeeklyAgenda/.test(strip), '七天排程條跟首頁／週課表同一支 buildWeeklyAgenda');
}

console.log(fail === 0
    ? '\n✅ 確認計劃這條路：按下去一定有事情發生\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
