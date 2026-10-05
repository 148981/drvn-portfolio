// verify_membership.mjs — 會員分級的邏輯斷言
//   · 減量永遠免費，自動加量才是會員（memberProgression）
//   · 圖表分級登記表：基本／進階、設定頁說明由登記表產生（advancedCharts）
//   · 每次訓練的建議重量與換季負重處方是同一條規則（e1rmAdvisor）
//   · 付費牆沒開時所有人可用、沒有任何會員入口（membership）
import * as esbuild from 'esbuild';

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.window = { location: { hostname: 'x', pathname: '/' }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, matchMedia: () => ({ matches: false }) };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };

const entry = `
export * as mp from './src/utils/memberProgression.js';
export * as ac from './src/utils/advancedCharts.js';
export * as e1 from './src/utils/e1rmAdvisor.js';
export * as ms from './src/utils/membership.js';
export * as am from './src/utils/advancedMode.js';
export * as ml from './src/utils/memberLimits.js';
export * as rd from './src/utils/readiness.js';
export * as forecast from './src/utils/strengthOutcomeForecast.js';
export * as sn from './src/utils/strengthCoachNotes.js';
export * as mcs from './src/utils/monthlyCoachSummary.js';
`;
const r = await esbuild.build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{"DEV":true}' },
    // api/client（axios）換成空殼：這支只驗純邏輯，不打網路
    plugins: [{ name: 'stub-api', setup(b) { b.onResolve({ filter: /api\/client$/ }, () => ({ path: 'stub', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { get: async () => ({}) };', loader: 'js' })); } }],
});
const { mp, ac, e1, ms, am, ml, rd, forecast, sn, mcs } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

let fail = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };

// ── 減量永遠免費，自動加量才是會員 ──
ok(mp.gateStrengthProgression({ intensityLevel: 1, prevIntensityLevel: 0 }, false).locked, '重訓：免費使用者加量 → 不寫入課表');
ok(!mp.gateStrengthProgression({ intensityLevel: -1, prevIntensityLevel: 0 }, false).locked, '重訓：免費使用者減量 → 照常套用');
ok(!mp.gateStrengthProgression({ intensityLevel: 0, prevIntensityLevel: 0 }, false).locked, '重訓：維持 → 照常');
ok(!mp.gateStrengthProgression({ intensityLevel: 2, prevIntensityLevel: 0 }, true).locked, '重訓：會員加量 → 照常');
let g = mp.gateRunAdjustments({ next_week_mileage_multiplier: 1.07, intensity_shift: 1 }, false);
ok(g.locked && g.adjustments.next_week_mileage_multiplier === 1 && g.adjustments.intensity_shift === 0, '跑步：免費使用者升階 → 下週維持同樣里程');
g = mp.gateRunAdjustments({ next_week_mileage_multiplier: 0.8, intensity_shift: -1, insert_recovery: true }, false);
ok(!g.locked && g.adjustments.next_week_mileage_multiplier === 0.8 && g.adjustments.insert_recovery === true, '跑步：免費使用者降階 → 照常減量並插恢復跑');
g = mp.gateRunAdjustments({ next_week_mileage_multiplier: 1.07, intensity_shift: 1 }, true);
ok(!g.locked && g.adjustments.next_week_mileage_multiplier === 1.07, '跑步：會員升階 → 照常加量');
ok(mp.gateRunAdjustments(null, false).locked === false, '跑步：沒有調整資料 → 不擋');

// ── 圖表分級 ──
ok(!('pacemaker' in ac.CHART_REGISTRY), '寫死 30 km 的配速員圖已移除（本週目標改讀跑步計劃）');
ok(ac.chartVisible('strengthWeeklyVolume', false, 'basic') && ac.chartVisible('strengthRecovery', false, 'basic'), '近七天訓練量、肌群恢復：免費看得到');
ok(!ac.chartVisible('vo2max', false, 'advanced'), 'VO₂max：免費看不到（就算偏好設成進階）');
ok(ac.chartVisible('vo2max', true, 'advanced'), 'VO₂max：會員＋進階 → 顯示');
ok(!ac.chartVisible('vo2max', true, 'basic'), 'VO₂max：會員自己關掉 → 不顯示');
ok(ac.chartVisible('someNewChart', false, 'basic'), '沒登記的圖表當基本圖表');
ok(['跑步', '重訓', '營養'].every((s) => ac.hasLockedCharts(s, false)), '免費版：跑步／重訓／營養各放一張會員卡');
ok(!ac.hasLockedCharts('跑步', true), '會員：不放會員卡');
ok(!ac.hasLockedCharts('身體', false), '身體分析沒有進階圖表 → 不放會員卡');
localStorage.setItem('drvn_chart_level', 'intermediate');
ok(ac.getChartPreference() === 'advanced', '舊設定「中階」換算成進階');
ac.setChartLevel('beginner');
ok(ac.getChartPreference() === 'basic', '註冊選新手 → 預設基本圖表');
const bySys = ac.advancedChartsBySystem();
ok(bySys['跑步']?.length === 5 && bySys['重訓']?.length === 2 && bySys['營養']?.length === 2 && !bySys['身體'],
    '設定頁說明由登記表產生：' + Object.entries(bySys).map(([k, v]) => `${k}×${v.length}`).join(' '));

// ── 付費牆開關與開發預覽 ──
ok(ms.isMember() && !ms.isGateActive(), '付費牆未開、沒快取：所有人可用、不顯示會員入口');
ms.setMembershipPreview('free');
ok(!ms.isMember() && ms.isGateActive() && !ms.canUse('sessionWeight') && ms.canUse('someFreeFeature'), '開發預覽免費版：會員功能鎖住、免費功能照常');
ms.setMembershipPreview('member');
ok(ms.isMember() && ms.isSubscribed(), '開發預覽會員版：全部可用');
ms.setMembershipPreview(null);
ok(ms.MEMBERSHIP_PLANS.find((p) => p.id === 'yearly')?.price === 1290 && ms.MEMBERSHIP_PLANS.find((p) => p.id === 'monthly')?.price === 190, '方案價格：年 1290／月 190（唯一一份）');

// ── 進階模式＝會員＋圖表選進階（同一個開關）──
localStorage.setItem('drvn_membership_preview', 'free');
ac.setChartPreference('advanced');
ok(am.isAdvancedMode() === false, '進階模式：免費版選了進階也不會開');
localStorage.setItem('drvn_membership_preview', 'member');
ok(am.isAdvancedMode() === true, '進階模式：會員＋進階 → 開');
ac.setChartPreference('basic');
ok(am.isAdvancedMode() === false, '進階模式：會員選基本 → 關');
localStorage.removeItem('drvn_membership_preview');
ok(!('advancedMode' in ms.MEMBER_FEATURES), '會員清單不寫做不到的功能（進階模式併進進階圖表）');

// ── 其餘會員界線（utils/memberLimits，唯一一份）──
const DAY = 86400000, NOW = new Date(2026, 8, 26).getTime();
let t = ml.trimToHistory([{ t: NOW - 100 * DAY }, { t: NOW - 10 * DAY }], (r) => r.t, false, NOW);
ok(t.rows.length === 2 && !t.trimmed, '完整歷史：免費也看全部（2026-09 改免費）');
t = ml.trimToHistory([{ t: NOW - 100 * DAY }, { t: NOW - 10 * DAY }], (r) => r.t, true, NOW);
ok(t.rows.length === 2 && !t.trimmed, '完整歷史：會員看全部');
// 核心賣點：三計劃整合排程永遠免費 —— 會員清單裡不可以出現排課／今日議程／計劃精靈
ok(!Object.keys(ms.MEMBER_FEATURES).some((k) => /agenda|schedule|plan(Wizard|Builder)|integrat/i.test(k)), '三計劃整合（排課、今日議程、計劃精靈）不在會員清單');
ok(!ml.courseWeekLocked('iron-base-56', 5, false), '課程：鋼骨基石整門免費');
ok(!ml.courseWeekLocked('v-taper-suit-56', 1, false), '課程：進階課程第 1 週免費試上');
ok(ml.courseWeekLocked({ plan_id: 'x', source_course: { id: 'hybrid-engine-56' } }, 2, false), '課程：第 2 週起是會員（認得啟用後的 source_course）');
ok(!ml.courseWeekLocked('peach-suit-56', 4, true), '課程：會員全部可練');
ok(!ml.courseWeekLocked({ plan_id: 'fusion_123' }, 3, false), '課程：融合／自己產生的計劃不擋');
ok(ml.FREE_POSE_CHECKS_PER_MONTH == null && ml.poseCheckAllowed(99, false) && !('poseCheck' in ms.MEMBER_FEATURES), '姿勢檢查：全部免費、不限次數（本地運算、收集回饋中）');
localStorage.setItem('drvn_membership_preview', 'free');
ok(rd.readinessSignalsLocked('nobody') === false, '準備度：沒有睡眠資料 → 不放會員卡');
const PAID = ['readiness', 'forecast', 'runAnalysis', 'strengthAnalysis', 'monthlyReport', 'reportPdf', 'courses'];
ok(!('fullHistory' in ms.MEMBER_FEATURES) && !('personality' in ms.MEMBER_FEATURES) && ms.canUse('personality') && ms.canUse('fullHistory'), '完整歷史、健身人格：免費');
ok(PAID.every((k) => k in ms.MEMBER_FEATURES && !ms.canUse(k)), `免費版：${PAID.length} 項會員功能都鎖住（含完整跑步／健身分析、月報、PDF；姿勢分析、健身人格、完整歷史免費）`);
ok(ml.featureAllowed('monthlyReport') === false, '提醒類工具也問得到同一個答案（月報不主動推給免費使用者）');
localStorage.setItem('drvn_membership_preview', 'member');
ok(PAID.every((k) => ms.canUse(k)) && ml.featureAllowed('monthlyReport'), '會員：全部可用');
localStorage.removeItem('drvn_membership_preview');

// ── 建議重量：同一條規則 ──
const hit = { e1rm: 100, bestWeight: 90, samples: 3 };
const w = e1.prescribeWorkingWeight(hit, '8-12');
ok(typeof w === 'number' && w > 0 && w <= 99, `e1RM 100 → 8–12 下建議 ${w}kg（不超過最佳 ×1.1）`);
ok(e1.prescribeWorkingWeight({ ...hit, samples: 1 }, '10') === null, '不到 2 組真實紀錄 → 不給建議');
ok(e1.prescribeWorkingWeight(hit, '30s') === null, '時間型動作 → 不給建議');
store.u_u1_trainingRecords = JSON.stringify({
    a: { timestamp: new Date().toISOString(), exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }] }] },
});
const plan = { weeks: [{ days: [{ exercises: [{ name: 'Bench Press', reps: '8-12' }] }] }] };
e1.applyLoadPrescriptions(plan, 'u1');
const seasonRx = plan.weeks[0].days[0].exercises[0].suggestedWeight;
const sessionRx = e1.sessionWeightFor('u1', 'Bench Press', '8-12');
ok(seasonRx > 0 && sessionRx === seasonRx, `每次訓練建議（${sessionRx}kg）＝ 換季處方（${seasonRx}kg）`);
ok(e1.sessionWeightFor('u1', 'Squat', '5') === null, '沒練過的動作 → 不給建議');

// ── 教練等級的建議重量 ──
{
    const DAY = 86400000, t = (d) => new Date(Date.now() - d * DAY).toISOString();
    const sess = (d, w, reps) => ({ timestamp: t(d), exercises: [{ name: 'Barbell Back Squat', sets: reps.map((r) => ({ weight: w, reps: r })) }] });
    // 三次都 100kg，最近一次三組都做到 8（上限）
    store.u_u2_trainingRecords = JSON.stringify({ a: sess(9, 95, [8, 7, 6]), b: sess(5, 100, [7, 7, 6]), c: sess(1, 100, [8, 8, 8]) });
    const rx = e1.sessionPrescription('u2', 'Barbell Back Squat', '6-8', { eq: 'barbell' });
    ok(rx && rx.nudged && rx.weight === 102.5 && rx.reason.includes('每組都做滿'), `上次每組做滿 8 下 → 加一格到 ${rx?.weight}kg`);
    ok(rx.warmups.length === 3 && rx.warmups[0].weight >= 20 && rx.warmups.every((w, i, a) => w.weight < rx.weight && (i === 0 || w.weight > a[i - 1].weight)),
        `暖身三組由輕到重、都比工作重量輕（${rx.warmups.map((w) => `${w.weight}×${w.reps}`).join(' → ')}）`);
    const tired = e1.sessionPrescription('u2', 'Barbell Back Squat', '6-8', { eq: 'barbell', readinessScore: 40 });
    ok(tired.weight < rx.weight && tired.readinessPct === -5 && tired.reason.includes('準備度'), `準備度 40 → 先減 5%（${tired.weight}kg）`);
    ok(e1.sessionPrescription('u2', 'Barbell Back Squat', '6-8', { readinessScore: 80 }).readinessPct === 0, '準備度正常 → 不調');
    // 兩個月前很強、最近退步 → 看最近，不看巔峰
    store.u_u3_trainingRecords = JSON.stringify({ a: sess(50, 120, [8, 8]), b: sess(6, 100, [6, 6]), c: sess(2, 100, [6, 5]) });
    const back = e1.sessionPrescription('u3', 'Barbell Back Squat', '6-8', { eq: 'barbell' });
    ok(back && back.weight <= 105, `兩個月前 120kg、最近 100kg → 今天 ${back?.weight}kg（看最近，不看巔峰）`);
    const db = e1.sessionPrescription('u2', 'Barbell Back Squat', '6-8', { eq: 'dumbbell' });
    ok(db.warmups.length === 1, '啞鈴只留一組暖身');
}

// ── App 內購：三端同一份商品 ID、原生橋接有註冊、付費牆預設關 ──
{
    const { readFileSync } = await import('node:fs');
    const swift = readFileSync('../ios/FitnessApp/StoreManager.swift', 'utf8');
    const webview = readFileSync('../ios/FitnessApp/WebView.swift', 'utf8');
    const pbx = readFileSync('../ios/FitnessApp/FitnessApp.xcodeproj/project.pbxproj', 'utf8');
    const cfg = readFileSync('../backend/config.py', 'utf8');
    const sheet = readFileSync('src/components/MembershipSheet.jsx', 'utf8');
    const swiftIds = (swift.match(/productIds: \[String\] = \[([^\]]*)\]/)?.[1] || '').match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)).sort() || [];
    const webIds = ms.MEMBERSHIP_PLANS.map((p) => p.productId).sort();
    const pyIds = (cfg.match(/"APPLE_IAP_PRODUCT_IDS", "([^"]*)"/)?.[1] || '').split(',').map((x) => x.trim()).filter(Boolean).sort();
    ok(swiftIds.length === 2 && JSON.stringify(swiftIds) === JSON.stringify(webIds) && JSON.stringify(pyIds) === JSON.stringify(webIds), `商品 ID 三端一致（${webIds.join('、')}）`);
    const bundle = pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/)?.[1];
    ok(cfg.includes(`"APPLE_BUNDLE_ID", "${bundle}"`), `後端驗證的 bundle ID ＝ App（${bundle}）`);
    ok(/userContentController\.add\(storeManager, name: "purchase"\)/.test(webview) && pbx.includes('StoreManager.swift in Sources'), 'iOS：購買橋接有註冊、StoreManager 有編進 App');
    ok(/Transaction\.updates/.test(swift) && /AppStore\.sync\(\)/.test(swift), 'iOS：有聽續訂／家長核准、有恢復購買');
    ok(!/is_member/.test(swift), 'iOS 不自己判斷會員，一律後端驗證');
    ok(/恢復購買/.test(sheet) && /自動續訂/.test(sheet) && /服務條款|LegalSheet/.test(sheet), '付費牆：恢復購買、自動續訂說明、條款（Apple 審核 3.1.2）');
    ok(ms.iapAvailable() === false && ms.iapSend('buy', 'x') === false, '網頁版沒有原生橋接 → 不假裝能買');
    ok(/"MEMBERSHIP_GATE_ENABLED", "0"/.test(cfg), '後端付費牆預設關（產品在 App Store Connect 建好前）');
}

// ── 扣款前提醒、方案頁、問卷：前端／iOS／後端同一套 ──
{
    const { readFileSync } = await import('node:fs');
    const D = 86400000, now = Date.parse('2026-10-01T04:00:00Z');
    const yr = { productId: 'drvn.member.yearly', willAutoRenew: true, isTrial: false, firstRenewal: false, displayPrice: 'NT$1,290' };
    const R = (over, days) => ml.renewalReminder({ ...yr, ...over, expiresAt: now + days * D }, now);
    ok(R({}, 6.5)?.kind === 'renew' && R({}, 8) === null, '年訂閱：續訂前 7 天才提醒');
    ok(R({ isTrial: true }, 2.5)?.kind === 'trialEnd' && R({ isTrial: true }, 4) === null, '免費試用：結束前 3 天提醒');
    ok(R({ willAutoRenew: false }, 2)?.kind === 'expire' && /不會再扣款/.test(R({ willAutoRenew: false }, 2).detail), '取消後：到期前 3 天提醒「不會再扣款」');
    const mo = { productId: 'drvn.member.monthly', displayPrice: 'NT$190' };
    ok(R({ ...mo, firstRenewal: true }, 1.5)?.kind === 'renew' && R({ ...mo, firstRenewal: false }, 1.5) === null, '月訂閱：只提醒第一次續訂');
    ok(/NT\$1,290／年/.test(R({}, 3).detail), `提醒寫出金額：「${R({}, 3).detail}」`);
    const swift = readFileSync('../ios/FitnessApp/StoreManager.swift', 'utf8');
    const swiftDays = [...swift.matchAll(/plan = \((\d+), "([^"]+)"/g)].map((m) => `${m[1]}:${m[2].slice(0, 6)}`);
    ok(JSON.stringify(swiftDays.map((x) => x.split(':')[0])) === JSON.stringify(['3', '3', '7', '2']), `iOS 推播的天數與 App 內提示一致（${swiftDays.join('、')}）`);
    ok(/content\.userInfo = \["route"/.test(swift) && /reminderId/.test(swift), 'iOS：提醒用固定 id 重排，不會重複堆積');

    const api = readFileSync('../backend/api_membership.py', 'utf8');
    for (const kind of ['subscribe', 'cancel']) {
        const block2 = api.split(`"${kind}": {`)[1].split('},')[0];
        const pyIds = [...block2.matchAll(/"(\w+)":/g)].map((m) => m[1]);
        const jsIds = ms.SURVEY_REASONS[kind].map(([id]) => id);
        ok(JSON.stringify(pyIds) === JSON.stringify(jsIds), `${kind === 'subscribe' ? '訂閱' : '退訂'}問卷選項前後端一致（${jsIds.length} 個）`);
    }
    const featBlock = api.split('FEATURE_LABELS = {')[1].split('}')[0];
    const pyFeat = [...featBlock.matchAll(/"(\w+)":/g)].map((m) => m[1]).sort();
    ok(JSON.stringify(pyFeat) === JSON.stringify(Object.keys(ms.MEMBER_FEATURES).sort()), '統計頁的功能名稱涵蓋全部會員功能');

    ok(ms.planSummary({ comp: 'founding' }).name === '創始會員', '方案頁：創始會員');
    ok(/下次扣款 .*NT\$1,290／年/.test(ms.planSummary({ status: 'active', productId: 'drvn.member.yearly', renewal: { ...yr, expiresAt: now + 30 * D } }).line), '方案頁：年訂閱顯示下次扣款日與金額');
    ok(/不會再扣款/.test(ms.planSummary({ status: 'active', productId: 'drvn.member.monthly', renewal: { ...mo, willAutoRenew: false, expiresAt: now + 9 * D } }).line), '方案頁：取消後顯示到期、不會再扣款');
    const sheet = readFileSync('src/components/MembershipSheet.jsx', 'utf8');
    ok(/每天不到/.test(sheet) && /alignItems: 'center', justifyContent: 'center'/.test(sheet), '付費牆是置中懸浮視窗，寫出「每天不到」多少錢');
}

const expiryNow = Date.now();
const cachedPaid = { is_member: true, gate_enabled: true, status: 'active', expires_at: new Date(expiryNow - 1).toISOString() };
ok(!ml.effectiveMembershipCache(cachedPaid, expiryNow).is_member, '離線會員到期即失效');
ok(ml.effectiveMembershipCache({ ...cachedPaid, gate_enabled: false }, expiryNow).is_member, '到期但付費牆關閉仍保留全開');
ok(ml.effectiveMembershipCache({ is_member: true, status: 'comp' }, expiryNow).is_member, '永久會員不受訂閱到期限制');
ok(!ml.effectiveMembershipCache({ ...cachedPaid, expires_at: 'invalid' }, expiryNow).is_member, '無效到期資料不給無限會員');
store.u_u1_trainingRecords = JSON.stringify({ a: { timestamp: new Date().toISOString(), exercises: [{ name: 'Bench Press', sets: [
    { weight: 80, reps: 8 }, { weight: 80, reps: 8 },
    { weight: 200, reps: 8, completed: false }, { weight: 180, reps: 8, isWarmup: true },
] }] } });
ok(e1.buildE1RMTable('u1')['Bench Press'].bestWeight === 80 && e1.buildE1RMTable('u1')['Bench Press'].samples === 2,
    '重量建議排除未完成組與暖身組');
localStorage.setItem('inbody_local_u1', JSON.stringify([
    { measurement_date: '2025-01-01', skeletal_muscle_mass: 25 },
    { measurement_date: '2025-02-01', skeletal_muscle_mass: 28 },
    { measurement_date: 'invalid', skeletal_muscle_mass: 99 },
]));
ok(forecast.getLatestInbody('u1').skeletal_muscle_mass === 28, '預測基準依實際量測日期排序並排除壞日期');

// ── 進階圖表：結論＋下一步 ──
{
    const d = sn.acwrNote({ ratio: 1.42, status: 'caution' });
    ok(d.title.includes('42%') && d.action.includes('少 1 組') && d.title.length <= 20 && d.action.length <= 24, `ACWR 1.42 → 「${d.title}」「${d.action}」`);
    ok(sn.acwrNote({ ratio: 1.7, status: 'danger' }).action.includes('休息'), 'ACWR 1.7 → 先休息');
    ok(sn.acwrNote({ ratio: 0.6, status: 'detraining' }).title.includes('少 40%'), 'ACWR 0.6 → 這週少 40%');
    ok(sn.acwrNote({ ratio: '—', status: 'insufficient' }) === null, 'ACWR 資料不足 → 不給結論');
    const mb = sn.muscleBalanceNote([{ name: '胸', volume: 10000 }, { name: '背', volume: 5000 }, { name: '腿', volume: 8000 }]);
    ok(mb.title === '背的量只有胸的 50%' && mb.action.includes('先練背'), `推拉不平衡 → 「${mb.title}」`);
    ok(sn.muscleBalanceNote([{ name: '胸', volume: 5000 }, { name: '背', volume: 5000 }, { name: '腿', volume: 1000 }]).title.startsWith('腿只佔'), '腿練太少 → 提醒排腿');
    ok(sn.muscleBalanceNote([{ name: '胸', volume: 5000 }]) === null, '只練一個部位 → 不下結論');
}

// ── 月報：教練總評＋下個月三個重點 ──
{
    const m = mcs.monthlyCoachSummary({ overview: { active_days: 10, avg_weekly_sessions: 2.3, consistency_pct: 58 },
        fitness: { muscle_distribution: { chest: { percentage: 40 }, back: { percentage: 30 }, legs: { percentage: 10 } } },
        cardio: { run_count: 2 }, nutrition: { logged_days: 20, log_rate_pct: 66, protein_adherence_pct: 70 } });
    ok(m.verdict.includes('斷掉') && m.priorities.length === 3 && m.priorities[0].title === '每週固定練 3 次', `月報：一週 2.3 次 → 第一個重點是「${m.priorities[0].title}」`);
    ok(m.priorities.every((p) => p.title.length <= 14 && p.why.length <= 24 && /\d/.test(p.why)), '每個重點都附這個月的真實數字，字數在上限內');
    ok(mcs.monthlyCoachSummary({ overview: { active_days: 0 } }) === null, '一個月都沒練 → 不編總評');
    const good = mcs.monthlyCoachSummary({ overview: { active_days: 16, avg_weekly_sessions: 4, consistency_pct: 90 }, nutrition: { logged_days: 28, log_rate_pct: 93, protein_adherence_pct: 95 } });
    ok(good.priorities.length === 1 && good.priorities[0].title === '維持現在的節奏', '都在軌道上 → 只說維持');
}

// ── 付了錢要馬上看得到、用得到 ──
{
    const fs = await import('node:fs');
    delete store.drvn_chart_level; delete store.drvn_advanced_charts;
    ok(ac.getChartPreference() === 'advanced', '沒選過圖表偏好 → 進階（會員付完錢立刻看得到）');
    store.drvn_chart_level = 'basic';
    const uid = 'guest';
    store[`drvn_membership_${uid}`] = JSON.stringify({ is_member: false, status: 'none', gate_enabled: true });
    const src = fs.readFileSync('src/utils/membership.js', 'utf8');
    ok(/PAID\.includes\(data\.status\) && !PAID\.includes\(prev\?\.status\)/.test(src) && src.includes("setItem('drvn_chart_level', 'advanced')"),
        '剛開始訂閱（含試用）→ 進階圖表自動打開，只做一次');
    const swift = fs.readFileSync('../ios/FitnessApp/WebView.swift', 'utf8');
    ok(swift.includes('name: "saveFile"') && swift.includes('message.name == "saveFile"') && swift.includes('UIActivityViewController(activityItems: [url]'),
        'iPhone：PDF 存檔有原生 saveFile 橋接（寫檔＋分享面板）');
    const month = fs.readFileSync('src/components/MonthlyReportPage.jsx', 'utf8');
    const journey = fs.readFileSync('src/utils/journeyPdf.js', 'utf8');
    ok(month.includes('savePdfMobileFriendly') && !month.includes("type: 'savePdf'"), '月報 PDF 走共用存檔流程');
    ok(journey.includes('savePdfMobileFriendly') && !/pdf\.save\(/.test(journey), '進化日誌 PDF 走共用存檔流程（不用 App 裡存不下來的 pdf.save）');
    const sheet = fs.readFileSync('src/components/MembershipSheet.jsx', 'utf8');
    const welcome = fs.readFileSync('src/components/MemberWelcomeSheet.jsx', 'utf8');
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    ok(sheet.includes('openMemberWelcome({ survey:') && welcome.includes("openSurvey('subscribe', d.survey)") && app.includes('<MemberWelcomeSheet />'),
        '付款成功 → 開通頁（四條去處），關掉後才問為什麼訂閱');
    const routes = [...welcome.matchAll(/to: '(\/[a-z-]+)'/g)].map((m) => m[1]);
    ok(routes.length === 4 && routes.every((r) => app.includes(`path="${r.slice(1)}"`)), `開通頁每一條都到得了（${routes.join('、')}）`);
    const rp = fs.readFileSync('src/utils/reportPdf.js', 'utf8');
    ok(rp.indexOf('messageHandlers?.saveFile') < rp.indexOf('navigator.canShare'), '存檔優先走原生橋接（WKWebView 沒有 Web Share API）');
}

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
