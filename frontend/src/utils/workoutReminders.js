// utils/workoutReminders.js
// ─────────────────────────────────────────────────────────────────────────────
import { toLocalDateKey } from './localDate';
import { featureAllowed } from './memberLimits';
// 🔔 DRVN 訓練提醒引擎（零外部依賴）
//
// 目的：補上 app 最大的留存漏洞 —— 完全沒有任何提醒 / 通知機制。
//
// 設計原則：
//   1. 不新增 npm 依賴。前景用 Web Notifications API；若在 Capacitor / iOS
//      WebView 中，會把「排程請求」轉交給原生層（沿用專案既有的
//      window.webkit.messageHandlers / ReactNativeWebView 模式），由原生
//      UNUserNotification 負責「app 關閉後」的背景遞送。
//   2. 不依賴目前被停用的 cache service worker（那支 SW 造成過版本卡舊的問題）。
//   3. 所有「今天是否已訓練 / 連續紀錄是否將中斷」的判斷都讀真實 localStorage
//      （completed_workouts_${userId}_week*），不捏造數字。
//
// 對外 API：
//   getReminderSettings(userId) / saveReminderSettings(userId, settings)
//   requestNotificationPermission()
//   initWorkoutReminders(userId)   ← 在 App 掛載時呼叫一次
//   refreshCompletionMeta(userId)  ← app 取得焦點 / 完成訓練後呼叫
//   fireReminder(title, body, data)
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_KEY = (uid) => `drvn_reminder_settings_${uid}`;
const META_KEY = (uid) => `drvn_completion_meta_${uid}`;
const LAST_FIRED_KEY = (uid) => `drvn_reminder_last_fired_${uid}`;

const DEFAULT_SETTINGS = {
    enabled: false,      // 預設關閉 → 由使用者主動開啟（尊重通知疲勞）
    time: '19:00',       // 每日提醒時間 HH:MM
    streakGuard: true,   // 連續紀錄將中斷時加碼提醒
};

function todayStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return todayStr(d);
}

// ── 設定存取 ──────────────────────────────────────────────────────────────
export function getReminderSettings(userId) {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY(userId));
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveReminderSettings(userId, settings) {
    const next = { ...getReminderSettings(userId), ...settings };
    try {
        localStorage.setItem(SETTINGS_KEY(userId), JSON.stringify(next));
    } catch { /* ignore quota */ }
    // 設定變更 → 立即重排程
    scheduleNext(userId, next);
    // 同步給原生層（若存在）做背景排程
    handoffToNative(next);
    return next;
}

// ── 權限 ──────────────────────────────────────────────────────────────────
export async function requestNotificationPermission() {
    // 原生 WebView：交給原生詢問
    //   原生會用 'drvn:native-notif-permission' 事件回報結果 → 等它回來再回傳
    //   'granted' / 'denied'，呼叫端才能在被拒絕時顯示「到設定開啟通知」引導。
    //   （以前立刻回 'native'，拒絕了也照樣把提醒開關打開。）系統彈窗等使用者按，
    //   給 60 秒；逾時才退回 'native'。
    if (window?.webkit?.messageHandlers?.requestNotificationPermission) {
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const onPerm = (e) => finish(e?.detail?.permission === 'granted' ? 'granted' : 'denied');
            function finish(result) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                window.removeEventListener('drvn:native-notif-permission', onPerm);
                resolve(result);
            }
            window.addEventListener('drvn:native-notif-permission', onPerm);
            timer = setTimeout(() => finish('native'), 60000);
            try {
                window.webkit.messageHandlers.requestNotificationPermission.postMessage('request');
            } catch {
                finish('native');
            }
        });
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
        return await Notification.requestPermission();
    } catch {
        return 'denied';
    }
}

// ── 真實完成度判斷（不捏造）──────────────────────────────────────────────
// 掃描所有 completed_workouts_${uid}_week* 的總完成筆數，與快照比較；
// 數字上升 → 視為「今天有訓練」並蓋上今天日期。
function totalCompleted(userId) {
    let total = 0;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(`completed_workouts_${userId}_week`)) {
                const arr = JSON.parse(localStorage.getItem(k) || '[]');
                if (Array.isArray(arr)) total += arr.length;
            }
        }
    } catch { /* */ }
    return total;
}

export function refreshCompletionMeta(userId) {
    if (!userId) return { trainedToday: false, lastDate: null };
    const cur = totalCompleted(userId);
    let meta = { count: 0, lastDate: null };
    try {
        meta = JSON.parse(localStorage.getItem(META_KEY(userId)) || 'null') || meta;
    } catch { /* */ }
    if (cur > (meta.count || 0)) {
        meta = { count: cur, lastDate: todayStr() };
    } else {
        meta = { count: cur, lastDate: meta.lastDate || null };
    }
    try { localStorage.setItem(META_KEY(userId), JSON.stringify(meta)); } catch { /* */ }
    return { trainedToday: meta.lastDate === todayStr(), lastDate: meta.lastDate };
}

export function isWorkoutDoneToday(userId) {
    return refreshCompletionMeta(userId).trainedToday;
}

// 連續紀錄是否「今天還沒練、但昨天有練」→ 將中斷
function isStreakAtRisk(userId) {
    const { trainedToday, lastDate } = refreshCompletionMeta(userId);
    if (trainedToday) return false;
    return lastDate === yesterdayStr();
}

// ── 🧠 通知治理（Notification Governor）─────────────────────────────────────
// 目標：該提醒的一個不漏、但使用者永遠不覺得煩。規則：
//   1. 安靜時段 22:30–08:00 一律不發（隔天有機會再說）。
//   2. 每日總量上限 3 則；其中 low 優先級最多 1 則、mid 最多 2 則（high 不受類別限制）。
//   3. 兩則之間最小間距 45 分鐘（high 例外：PR/里程碑當下就該慶祝）。
//   4. 全部決策寫遙測（notif_sent / notif_suppressed），上市後可調參。
const TAG_PRIORITY = {
    'pr-celebration': 'high', 'milestone-volume': 'high', 'milestone-run': 'high',
    'plan-graduation': 'high', 'acwr-overload': 'high', 'streak-guard': 'high',
    'daily-workout': 'mid', 'comeback': 'mid', 'planned-run': 'mid',
    'recovery-ready': 'mid', 'evening-wrapup': 'mid',
    'week-kickoff': 'low', 'deload-week': 'low', 'weekly-review': 'low',
    'monthly-report': 'low', 'nutrition-log': 'low',
};
const GOV_KEY = 'drvn:notifGovLog';
function govLog() {
    try {
        const raw = JSON.parse(localStorage.getItem(GOV_KEY) || 'null');
        if (raw?.day === todayStr()) return raw;
    } catch { /* */ }
    return { day: todayStr(), sent: [], lastAt: 0 };
}
function allowNotify(tag) {
    const pri = TAG_PRIORITY[tag] || 'mid';
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    // 安靜時段 22:30–08:00
    if (mins >= 22 * 60 + 30 || mins < 8 * 60) return { ok: false, why: 'quiet_hours' };
    const log = govLog();
    const total = log.sent.length;
    const byPri = (p) => log.sent.filter((s) => s.pri === p).length;
    if (pri !== 'high' && total >= 3) return { ok: false, why: 'daily_cap' };
    if (pri === 'low' && byPri('low') >= 1) return { ok: false, why: 'low_cap' };
    if (pri === 'mid' && byPri('mid') >= 2) return { ok: false, why: 'mid_cap' };
    if (pri !== 'high' && Date.now() - (log.lastAt || 0) < 45 * 60 * 1000) return { ok: false, why: 'spacing' };
    return { ok: true, pri };
}
function recordNotify(tag, pri) {
    try {
        const log = govLog();
        log.sent.push({ tag, pri, at: Date.now() });
        log.lastAt = Date.now();
        localStorage.setItem(GOV_KEY, JSON.stringify(log));
    } catch { /* */ }
}

// ── 發送通知（多通道 fallback）────────────────────────────────────────────
export function fireReminder(title, body, data = {}) {
    // 🧠 治理：時機不對 → 靜默略過並記遙測（上市後看哪些被壓掉、調參）
    const verdict = allowNotify(data.tag || 'untagged');
    try {
        import('./telemetry').then(({ track }) =>
            track(verdict.ok ? 'notif_sent' : 'notif_suppressed', { tag: data.tag || '', why: verdict.why || '' })
        ).catch(() => {});
    } catch { /* */ }
    if (!verdict.ok) return false;
    recordNotify(data.tag || 'untagged', verdict.pri);
    return fireReminderRaw(title, body, data);
}

function fireReminderRaw(title, body, data = {}) {
    // 1) 原生層優先（背景可送達）
    try {
        if (window?.webkit?.messageHandlers?.showLocalNotification) {
            window.webkit.messageHandlers.showLocalNotification.postMessage({ title, body, ...data });
            return true;
        }
        if (window?.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'localNotification', title, body, ...data }));
            return true;
        }
    } catch { /* */ }

    // 2) Web Notifications（前景；若 SW 啟用則用 SW 顯示，較穩定）
    try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            if (navigator.serviceWorker?.controller) {
                navigator.serviceWorker.ready.then((reg) =>
                    reg.showNotification(title, { body, icon: '/desktop/drvn_logo.png', badge: '/desktop/drvn_logo.png', tag: data.tag || 'drvn-reminder', data })
                ).catch(() => { try { new Notification(title, { body }); } catch { /* */ } });
            } else {
                new Notification(title, { body, icon: '/desktop/drvn_logo.png' });
            }
            return true;
        }
    } catch { /* */ }

    // 3) 最終 fallback：派發 app 內事件，由 UI 顯示一個 toast / banner
    try {
        window.dispatchEvent(new CustomEvent('drvn:in-app-reminder', { detail: { title, body, data } }));
    } catch { /* */ }
    return false;
}

// 🆕 一次性排程（延遲 N 秒後推播；app 關閉也會送達 — 走原生 UNUserNotification）
//    用途：恢復提醒（48h 後「胸肌回滿血了」）、隔日回訪等。
//    原生層需支援 scheduleOneShotNotification handler；不支援就靜默略過（不硬送）。
export function scheduleOneShot(title, body, delaySeconds, data = {}) {
    try {
        const payload = { title, body, delaySeconds: Math.max(60, Number(delaySeconds) || 0), ...data };
        if (window?.webkit?.messageHandlers?.scheduleOneShotNotification) {
            window.webkit.messageHandlers.scheduleOneShotNotification.postMessage(payload);
            return true;
        }
        if (window?.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scheduleOneShotNotification', ...payload }));
            return true;
        }
    } catch { /* */ }
    return false;
}

// ── 🎉 有趣文案庫（每次隨機抽，不讓使用者看膩）──────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const COPY = {
    daily: [
        { t: '今天還沒訓練 💪', b: '你的課表在等你 — 花 30 分鐘完成今天這一步。' },
        { t: '槓片在想你 🏋️', b: '它們整天沒人理了。去安慰一下它們，順便變強。' },
        { t: '身體：請求出勤 ⚡', b: '大腦已閱。剩下的就是換衣服出門而已。' },
        { t: '未來的你發來訊息 📬', b: '「謝謝你今天有練。」— 三個月後的你。' },
    ],
    streak: [
        { t: '連續紀錄還在', b: '昨天你有練 — 今天再完成一次，就延續下去。' },
        { t: '今天還沒動', b: '連續紀錄只差今天這一場，30 分鐘就夠。' },
    ],
    pr: [
        { t: '新紀錄入袋 🏅', b: '{n} 項 PR 刷新！今天的你正式超越了過去所有版本的你。' },
        { t: '進化完成 ⚡', b: '恭喜破了 {n} 項紀錄 — 課表輸給你了，下週幫你加難度。' },
        { t: 'PR 警報 🚨', b: '偵測到 {n} 項個人紀錄被打破。犯人：你本人。' },
    ],
    recovery: [
        { t: '肌肉回滿血了 💚', b: '{part}恢復完成 — 超補償窗口已開，正是再練的黃金時機。' },
        { t: '充電完成 ⚡', b: '{part}修好了，還升級了一點點。要不要去驗收成果？' },
    ],
    comeback: [
        { t: '好久不見 👀', b: '已經 {d} 天沒動了 — 肌肉開始想你了。今天用 20 分鐘輕鬆回歸就好。' },
        { t: '沙發黏力警告 🛋️', b: '連續 {d} 天休息。回歸日不用拚，動起來就是勝利。' },
        { t: '你的課表在敲門 🚪', b: '{d} 天了。它說它可以先從最輕鬆的那天開始。' },
    ],
    plannedRun: [
        { t: '今天有跑步課 🏃', b: '課表：{title}。天氣不會等人，早點跑完早點爽。' },
        { t: '跑鞋已就位 👟', b: '今天的 {title} 在等你開跑 — 完成後跑量進度條會很好看。' },
    ],
    weekKickoff: [
        { t: '新的一週開賽 📋', b: '本週課表已就緒 — 先從最簡單的那天下手，贏在星期一。' },
        { t: '週一宣言 ⚡', b: '這週的你 vs 上週的你。計劃排好了，開練就贏一半。' },
        { t: '週報歸零、鬥志滿格 🔄', b: '新的一週、乾淨的進度條 — 今天填上第一格。' },
    ],
    deload: [
        { t: '本週是減量週 🌊', b: '練少一點是計劃的一部分 — 讓神經系統超補償，下週回來更強。' },
        { t: 'Deload 生效中 😌', b: '這週組數自動降載。放心練輕的 — 變強這件事，發生在恢復的時候。' },
    ],
    graduation: [
        { t: '畢業了 🎓', b: '這份 4 週計劃被你完食！你和四週前已經不是同一個人 — 來挑下一份挑戰。' },
        { t: '計劃通關 🏁', b: '最後一天也打勾了。課表：卒。你：進化。下一份計劃見。' },
    ],
    monthly: [
        { t: '你的月成績單來了 📊', b: '上個月的訓練量、跑量、PR 全部整理好了 — 一分鐘看完。' },
        { t: '月報出爐 📈', b: '數據不會說謊：上個月的你到底有多努力？點開看。' },
    ],
    milestoneVol: [
        { t: '里程碑解鎖 🏆', b: '累積訓練量突破 {n} 噸 — 大約 {e} 頭大象。你是在用槓鈴搬動物園嗎？' },
        { t: '噸位成就 💪', b: '你已經累積舉起 {n} 噸了。地球感謝你沒有一次舉完。' },
    ],
    milestoneRun: [
        { t: '里程碑解鎖 🏆', b: '累積跑量突破 {n} km — {lm}。' },
        { t: '跑量成就 👟', b: '{n} km 達成！你的鞋底比你誠實 — 它知道你有多拚。' },
    ],
    acwr: [
        { t: '這週衝太快了 ⚠️', b: '跑量已是近月平均的 {x} 倍 — 受傷風險上升。明天建議輕鬆跑或休息。' },
        { t: '負荷超標警示 🛑', b: '身體的帳不會賴帳：本週負荷比 {x}。降速一天，換整季不受傷。' },
    ],
};

const RUN_LANDMARKS = [
    [1000, '差不多環島一圈的量'],
    [500, '縱貫線半程的距離'],
    [250, '台北到台中來回'],
    [100, '等於從台北跑到新竹'],
    [50, '大約台北跑到桃園再折返'],
];
const landmarkFor = (km) => (RUN_LANDMARKS.find(([k]) => km >= k)?.[1]) || '每一步都算數';

// ── 🔔 結算後推播：PR 慶祝（立即）+ 恢復提醒（48h 後，原生排程）───────────────
//    由結算頁（StrengthResultsMobile / CardioResultsMobile）呼叫。
const MUSCLE_ZH_MAP = { chest: '胸', back: '背', shoulders: '肩', legs: '腿', arms: '手臂', core: '核心', glutes: '臀' };
export function firePostWorkoutNudges(userId, { type = 'strength', prCount = 0, volume = 0, distanceKm = 0, focusGroup = '' } = {}) {
    try {
        // 完成訓練 → 更新完成度快照（讓當日 daily reminder 不再打擾）
        if (userId) refreshCompletionMeta(userId);

        // ① PR 慶祝（立即推播；就算人在 app 裡，前景橫幅也是一種儀式感）
        if (prCount > 0) {
            const c = pick(COPY.pr);
            fireReminder(c.t, c.b.replace('{n}', String(prCount)), { tag: 'pr-celebration', route: type === 'run' ? '/activity-feed-mobile' : '/mobile-home' });
        }

        // ② 恢復提醒：48h 後「該部位回滿血」（僅重訓；原生一次性排程，app 關了也送得到）
        if (type === 'strength') {
            const zh = MUSCLE_ZH_MAP[String(focusGroup || '').toLowerCase()] || '';
            const part = zh ? `${zh}肌群` : '肌肉';
            const c = pick(COPY.recovery);
            scheduleOneShot(c.t, c.b.replace('{part}', part), 48 * 3600, { tag: 'recovery-ready', route: '/mobile-home' });
        }

        // ③ 累積里程碑 + ④ ACWR 過載警示 + ⑤ 計劃畢業（非同步，失敗靜默）
        checkCumulativeMilestones(userId, { type, volume, distanceKm }).catch(() => {});
        if (type === 'run') checkAcwrOverload(userId).catch(() => {});
        if (type === 'strength') runGraduationNudge(userId);
    } catch { /* 推播屬 nice-to-have */ }
}

// ── 🏆 累積里程碑：訓練總噸位 / 總跑量跨過門檻 → 推播 ─────────────────────
//    做法：首次從本地歷史一次性播種（seed），之後每次結算把本次量累加，
//    跨過新門檻才發（每門檻只發一次，紀錄「已達最高門檻」）。
const VOL_MILESTONES_T = [10, 25, 50, 100, 250, 500, 1000];   // 噸
const RUN_MILESTONES_KM = [50, 100, 250, 500, 1000];          // 公里
async function checkCumulativeMilestones(userId, { type, volume = 0, distanceKm = 0 }) {
    if (!userId) return;
    const { uStorage } = await import('./userStorage');
    const store = uStorage(userId);

    if (type === 'strength' && volume > 0) {
        let meta = store.get('drvn_cum_volume', null);
        if (!meta || typeof meta.totalKg !== 'number') {
            // 播種：從本地 workout_history 加總（抓不到就從 0 起算）
            let seed = 0;
            try {
                const hist = store.get('workout_history', []) || [];
                seed = hist.reduce((s, r) => s + (Number(r?.total_volume ?? r?.totalVolume ?? r?.volume) || 0), 0);
            } catch { /* */ }
            meta = { totalKg: seed, lastMilestoneT: 0 };
            // 播種時把「已達門檻」直接標到目前水位，避免補發一堆舊里程碑
            meta.lastMilestoneT = VOL_MILESTONES_T.filter((t) => seed / 1000 >= t).pop() || 0;
        }
        meta.totalKg += Number(volume) || 0;
        const tons = meta.totalKg / 1000;
        const crossed = VOL_MILESTONES_T.filter((t) => tons >= t && t > meta.lastMilestoneT).pop();
        if (crossed) {
            meta.lastMilestoneT = crossed;
            const c = pick(COPY.milestoneVol);
            fireReminder(c.t, c.b.replace('{n}', String(crossed)).replace('{e}', String(Math.max(1, Math.round(crossed / 5)))), { tag: 'milestone-volume', route: featureAllowed('monthlyReport') ? '/monthly-report-mobile' : '/training-record-mobile' });
        }
        store.set('drvn_cum_volume', meta);
    }

    if (type === 'run' && distanceKm > 0) {
        let meta = store.get('drvn_cum_run', null);
        if (!meta || typeof meta.totalKm !== 'number') {
            let seed = 0;
            try {
                const sessions = store.get('cardio_sessions', []) || [];
                seed = sessions.reduce((s, x) => {
                    const km = x?.distance ? Number(x.distance) / 1000 : Number(x?.distanceKm) || 0;
                    return s + (isFinite(km) && km > 0 && km < 300 ? km : 0);
                }, 0);
            } catch { /* */ }
            meta = { totalKm: seed, lastMilestoneKm: 0 };
            meta.lastMilestoneKm = RUN_MILESTONES_KM.filter((k) => seed >= k).pop() || 0;
        }
        meta.totalKm += Number(distanceKm) || 0;
        const crossed = RUN_MILESTONES_KM.filter((k) => meta.totalKm >= k && k > meta.lastMilestoneKm).pop();
        if (crossed) {
            meta.lastMilestoneKm = crossed;
            const c = pick(COPY.milestoneRun);
            fireReminder(c.t, c.b.replace(/\{n\}/g, String(crossed)).replace('{lm}', landmarkFor(crossed)), { tag: 'milestone-run', route: '/activity-feed-mobile' });
        }
        store.set('drvn_cum_run', meta);
    }
}

// ── 🛑 ACWR 過載警示：跑後負荷比 >1.5 → 警示（一天最多一次）────────────────
async function checkAcwrOverload(userId) {
    if (!userId) return;
    const key = `drvn:acwrWarn_${userId}`;
    if (localStorage.getItem(key) === todayStr()) return;
    const { uStorage } = await import('./userStorage');
    const { computeACWR } = await import('./cardioSettlementEngine');
    const sessions = (uStorage(userId).get('cardio_sessions', []) || []).map((x) => ({
        distance_km: x?.distance ? Number(x.distance) / 1000 : Number(x?.distanceKm) || 0,
        created_at: x?.date || x?.timestamp || x?.startTime || x?.created_at || null,
    })).filter((x) => x.created_at && x.distance_km > 0 && x.distance_km < 300);
    const info = computeACWR(sessions);
    if (info?.risk === 'high') {
        localStorage.setItem(key, todayStr());
        const c = pick(COPY.acwr);
        fireReminder(c.t, c.b.replace('{x}', String(info.acwr)), { tag: 'acwr-overload', route: '/cardio-plan' });
    }
}

// ── 🎓 計劃畢業：4 週計劃全部打勾 → 推播（每份計劃只發一次）────────────────
function runGraduationNudge(userId) {
    try {
        if (!userId) return;
        const plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        if (!plan?.weeks?.length) return;
        let allDone = true;
        for (let w = 0; w < plan.weeks.length; w++) {
            const dayCount = plan.weeks[w]?.days?.length || 0;
            if (dayCount === 0) continue;
            let done = [];
            try { done = JSON.parse(localStorage.getItem(`completed_workouts_${userId}_week${w + 1}`)) || []; } catch { /* */ }
            if (done.length < dayCount) { allDone = false; break; }
        }
        if (!allDone) return;
        const planTag = `${plan.name || plan.plan_name || 'plan'}_${plan.weeks.length}w`;
        const key = `drvn:planGrad_${userId}`;
        if (localStorage.getItem(key) === planTag) return;   // 這份計劃已慶祝過
        localStorage.setItem(key, planTag);
        const c = pick(COPY.graduation);
        fireReminder(c.t, c.b, { tag: 'plan-graduation', route: featureAllowed('monthlyReport') ? '/monthly-report-mobile' : '/training-record-mobile' });
    } catch { /* */ }
}

// ── 📋 週一開跑：週一早上 6 點後開 app、本週有課表 → 提醒（每週一次）────────
function runWeekKickoffNudge(userId) {
    try {
        const settings = getReminderSettings(userId);
        if (!settings.enabled) return;
        const now = new Date();
        if (now.getDay() !== 1 || now.getHours() < 6) return;   // 週一限定
        const key = `drvn:weekKickoff_${userId}`;
        if (localStorage.getItem(key) === todayStr()) return;
        // 本週有東西可練才發：有重訓計劃 or 有跑步磚
        let hasPlan = false;
        try { hasPlan = !!(JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null')?.weeks?.length); } catch { /* */ }
        if (!hasPlan) return;
        localStorage.setItem(key, todayStr());
        const c = pick(COPY.weekKickoff);
        fireReminder(c.t, c.b, { tag: 'week-kickoff', route: '/mobile-home' });
    } catch { /* */ }
}

// ── 🌊 Deload 減量週通知：進入第 4 週（或 phase 標 deload）→ 每週提醒一次 ──
async function runDeloadWeekNudge(userId) {
    try {
        const settings = getReminderSettings(userId);
        if (!settings.enabled) return;
        const { loadStrengthInputs } = await import('./dailyAgenda');
        const { plan, activeWeek } = loadStrengthInputs(userId);
        if (!plan?.weeks?.length) return;
        const wk = plan.weeks[activeWeek - 1];
        const isDeload = activeWeek === 4 || /deload|減量/i.test(`${wk?.phase || ''}${wk?.name || ''}`);
        if (!isDeload) return;
        const key = `drvn:deloadNudge_${userId}`;
        const tag = `w${activeWeek}_${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        if (localStorage.getItem(key) === tag) return;
        localStorage.setItem(key, tag);
        const c = pick(COPY.deload);
        fireReminder(c.t, c.b, { tag: 'deload-week', route: '/mobile-home' });
    } catch { /* */ }
}

// ── 📊 月報出爐：每月 1–3 號首次開 app → 提醒看上月成績單（每月一次）────────
function runMonthlyReportNudge(userId) {
    try {
        const settings = getReminderSettings(userId);
        if (!settings.enabled) return;
        const now = new Date();
        if (now.getDate() > 3) return;                          // 只在月初 1-3 號
        if (!featureAllowed('monthlyReport')) return;          // 💳 月報是會員；推播裡不出現付費牆
        const key = `drvn:monthlyReportNudge_${userId}`;
        const monthTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        if (localStorage.getItem(key) === monthTag) return;
        localStorage.setItem(key, monthTag);
        const c = pick(COPY.monthly);
        fireReminder(c.t, c.b, { tag: 'monthly-report', route: '/monthly-report-mobile' });
    } catch { /* */ }
}

// ── 🚶 回訪提醒：3 天以上沒訓練、開 app 時提醒（一天最多一次）────────────────
function runComebackNudge(userId) {
    try {
        const settings = getReminderSettings(userId);
        if (!settings.enabled) return;
        const { lastDate } = refreshCompletionMeta(userId);
        if (!lastDate) return;                                   // 從沒練過 → 交給 onboarding
        const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
        if (days < 3) return;
        const key = `drvn:comebackNudge_${userId}`;
        if (localStorage.getItem(key) === todayStr()) return;
        localStorage.setItem(key, todayStr());
        const c = pick(COPY.comeback);
        fireReminder(c.t, c.b.replace('{d}', String(days)), { tag: 'comeback', route: '/mobile-home' });
    } catch { /* */ }
}

// ── 🏃 今日跑步課提醒：早上 8-12 點開 app、今天有 pending 跑步 brick ─────────
async function runPlannedRunNudge(userId) {
    try {
        const settings = getReminderSettings(userId);
        if (!settings.enabled) return;
        const h = new Date().getHours();
        if (h < 8 || h >= 12) return;
        const key = `drvn:plannedRunNudge_${userId}`;
        if (localStorage.getItem(key) === todayStr()) return;
        const { getTodayAgenda, loadStrengthInputs, loadCachedBricks } = await import('./dailyAgenda');
        const a = getTodayAgenda({ ...loadStrengthInputs(userId), cardioBricks: loadCachedBricks(userId) });
        if (a?.dayType !== 'run' && a?.dayType !== 'dual') return;
        const runBlock = (a?.blocks || []).find((b) => b?.type === 'run');
        const title = runBlock?.title || '今日跑步課';
        localStorage.setItem(key, todayStr());
        const c = pick(COPY.plannedRun);
        fireReminder(c.t, c.b.replace('{title}', title), { tag: 'planned-run', route: '/cardio-plan' });
    } catch { /* dailyAgenda 缺欄位就靜默略過 */ }
}

// 把每日排程交給原生層（背景遞送的唯一可靠途徑）
function handoffToNative(settings) {
    try {
        const payload = { time: settings.time, enabled: settings.enabled, type: 'dailyWorkoutReminder' };
        if (window?.webkit?.messageHandlers?.scheduleDailyReminder) {
            window.webkit.messageHandlers.scheduleDailyReminder.postMessage(payload);
        } else if (window?.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scheduleDailyReminder', ...payload }));
        }
    } catch { /* */ }
}

// ── 前景排程：app 開著時，到點若今天還沒練 → 提醒 ────────────────────────
let _timer = null;

function alreadyFiredToday(userId) {
    try { return localStorage.getItem(LAST_FIRED_KEY(userId)) === todayStr(); } catch { return false; }
}
function markFiredToday(userId) {
    try { localStorage.setItem(LAST_FIRED_KEY(userId), todayStr()); } catch { /* */ }
}

function scheduleNext(userId, settings = getReminderSettings(userId)) {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    if (!settings.enabled) return;

    const [hh, mm] = (settings.time || '19:00').split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hh || 19, mm || 0, 0, 0);

    // 已過今天的時間 → 排到明天
    if (target.getTime() <= now.getTime()) {
        // 但若今天還沒練、也還沒提醒過 → 立刻補一次（剛開 app 又已過提醒時間的情境）
        if (!isWorkoutDoneToday(userId) && !alreadyFiredToday(userId)) {
            fireDaily(userId);
        }
        target.setDate(target.getDate() + 1);
    }

    const delay = Math.max(1000, target.getTime() - now.getTime());
    // setTimeout 上限約 24.8 天，這裡一定 < 24h，安全
    _timer = setTimeout(() => fireDaily(userId), delay);
}

function fireDaily(userId) {
    const settings = getReminderSettings(userId);
    if (settings.enabled && !isWorkoutDoneToday(userId) && !alreadyFiredToday(userId)) {
        const c = pick(COPY.daily);
        fireReminder(c.t, c.b, { tag: 'daily-workout', route: '/mobile-home' });
        markFiredToday(userId);
    }
    // 重新排下一次
    scheduleNext(userId, settings);
}

// ── 連續紀錄搶救：app 取得焦點 / 開啟時檢查（v2：接 streakEngine 寬容機制）──
async function runStreakGuard(userId) {
    const settings = getReminderSettings(userId);
    if (!settings.enabled || !settings.streakGuard) return;
    try {
        const { getStreak } = await import('./streakEngine');
        const s = getStreak(userId);

        // 🕊️ 寬容機制安靜運作：昨天休息但紀錄仍延續 → 早上一句話帶過（不談機制、不談代幣）
        const fkey = `drvn:freezeNotice_${userId}`;
        if (s.freezeUsedYesterday && localStorage.getItem(fkey) !== todayStr()) {
            localStorage.setItem(fkey, todayStr());
            fireReminder(
                '紀錄仍在延續',
                `昨天休息了一天，連續 ${s.current} 天還在 — 今天回來就好。`,
                { tag: 'streak-guard', route: '/mobile-home' },
            );
            import('./telemetry').then(({ track }) => track('streak_freeze_used', { current: s.current, left: s.freezes })).catch(() => {});
            return;
        }

        // 🌙 傍晚提醒：講事實、不誇張 — 只說「連續幾天、今天還沒動」
        if (s.atRisk && !alreadyFiredToday(userId)) {
            fireReminder(
                `連續第 ${s.current} 天`,
                '今天還沒動 — 延續它，30 分鐘就夠。',
                { tag: 'streak-guard', route: '/mobile-home' },
            );
            markFiredToday(userId);
        }
    } catch {
        // streakEngine 不可用 → 退回舊版簡單判斷
        const hour = new Date().getHours();
        if (hour >= 18 && isStreakAtRisk(userId) && !alreadyFiredToday(userId)) {
            const c = pick(COPY.streak);
            fireReminder(c.t, c.b, { tag: 'streak-guard', route: '/mobile-home' });
            markFiredToday(userId);
        }
    }
}

// ── 🌙 晚間收尾：20:00–22:15、今天還有未完成項目 → 「今天還差 N 件」（一天一次）──
//    與主頁 CheckinReminderOverlay（滿版收尾頁）同一套資料邏輯：推播只負責把人拉回來。
async function runEveningWrapupNudge(userId) {
    try {
        const settings = getReminderSettings(userId);
        if (!settings.enabled) return;
        const now = new Date();
        const mins = now.getHours() * 60 + now.getMinutes();
        if (mins < 20 * 60 || mins > 22 * 60 + 15) return;
        const key = `drvn:eveningWrapup_${userId}`;
        if (localStorage.getItem(key) === todayStr()) return;

        const { getTodayAgenda, loadStrengthInputs, loadCachedBricks } = await import('./dailyAgenda');
        const a = getTodayAgenda({ ...loadStrengthInputs(userId), cardioBricks: loadCachedBricks(userId) });
        let pending = (a?.blocks || []).length;   // 未完成的重訓 / 跑步
        // 營養：今天一筆都沒記也算一件
        try {
            const { uStorage } = await import('./userStorage');
            const { logicalDayKey } = await import('./dailyAgenda');
            const log = uStorage(userId).get('nutrition_log', []) || [];
            const today = logicalDayKey(new Date());
            const logged = (Array.isArray(log) ? log : []).some((e) => logicalDayKey(new Date(e?.date || e?.timestamp || 0)) === today);
            if (!logged) pending += 1;
        } catch { /* */ }
        if (pending <= 0) return;

        localStorage.setItem(key, todayStr());
        fireReminder(
            `今天還差 ${pending} 件`,
            '收尾一下，讓今天完整 — 打開就看到還缺什麼。',
            { tag: 'evening-wrapup', route: '/mobile-home' },
        );
    } catch { /* */ }
}

// ── 週回顧提醒：週日 19:00 後開 app → 提示看本週回顧（現成內容，零新演算法）──
// 內容由 api_review.py 的 weekly_review 產出；這裡只負責把人拉回來看。
function runWeeklyReviewNudge(userId) {
    try {
        const settings = getReminderSettings(userId);
        if (!settings.enabled) return;
        const now = new Date();
        if (now.getDay() !== 0 || now.getHours() < 19) return;   // 週日晚間限定
        const key = `drvn:weeklyReviewNudge_${userId}`;
        const weekTag = `${now.getFullYear()}-w${Math.ceil(((now - new Date(now.getFullYear(),0,1)) / 86400000 + 1) / 7)}`;
        if (localStorage.getItem(key) === weekTag) return;       // 本週已提醒過
        localStorage.setItem(key, weekTag);
        fireReminder('本週回顧出爐了 📈', '看看這週的訓練量、配速與進步幅度 — 下週怎麼練，數據說了算。', { tag: 'weekly-review', route: '/analytics' });
    } catch { /* */ }
}

// ── 營養追蹤提醒：20:30 後開 app、今天一筆飲食都沒記 → 提醒補記 ──────────
// 依 dailyAgenda 日型客製文案（訓練日 vs 休息日提醒語氣不同）。
async function runNutritionLogNudge(userId) {
    try {
        const settings = getReminderSettings(userId);
        if (!settings.enabled) return;
        const now = new Date();
        if (now.getHours() < 20 || (now.getHours() === 20 && now.getMinutes() < 30)) return;
        const key = `drvn:nutriNudge_${userId}`;
        if (localStorage.getItem(key) === todayStr()) return;    // 今天提醒過

        // 今天有沒有記錄？讀 uStorage nutrition_log（本地為主，避免打 API）
        const { uStorage } = await import('./userStorage');
        const log = uStorage(userId).get('nutrition_log', []) || [];
        const today = toLocalDateKey(new Date());
        const loggedToday = (Array.isArray(log) ? log : []).some(e =>
            (e?.date || e?.timestamp || '').slice(0, 10) === today);
        if (loggedToday) return;

        localStorage.setItem(key, todayStr());
        let msg = '花 30 秒把今天吃的記一下 — 數據齊了，計劃才調得準。';
        try {
            const { getTodayAgenda, loadStrengthInputs, loadCachedBricks } = await import('./dailyAgenda');
            const a = getTodayAgenda({ ...loadStrengthInputs(userId), cardioBricks: loadCachedBricks(userId) });
            if (a?.dayType === 'strength' || a?.dayType === 'dual') msg = '今天練了但還沒記錄飲食 — 蛋白質有吃夠嗎？花 30 秒記一下。';
            else if (a?.dayType === 'run') msg = '今天跑完了嗎？肝醣回補要靠記錄追蹤 — 花 30 秒記一下。';
            else if (a?.dayType === 'rest') msg = '休息日的飲食也算數 — 記錄一下，讓下週的計劃更準。';
        } catch { /* 用預設文案 */ }
        fireReminder('今天的飲食還沒記錄 🥗', msg, { tag: 'nutrition-log', route: '/nutrition-mobile' });
    } catch { /* */ }
}

// ── 對外初始化（在 App 掛載時呼叫一次）────────────────────────────────────
export function initWorkoutReminders(userId) {
    if (!userId) return () => {};
    refreshCompletionMeta(userId);
    const settings = getReminderSettings(userId);
    handoffToNative(settings);          // 同步背景排程給原生層
    scheduleNext(userId, settings);     // 設定前景計時器
    runStreakGuard(userId);             // 開 app 立即檢查連續紀錄
    runWeeklyReviewNudge(userId);       // 週日晚間：週回顧提示
    runNutritionLogNudge(userId);       // 20:30 後：今日飲食未記錄提醒
    runComebackNudge(userId);           // 🆕 3 天沒練：回訪提醒
    runPlannedRunNudge(userId);         // 🆕 早上 8-12：今日跑步課提醒
    runWeekKickoffNudge(userId);        // 🆕 週一早上：新一週課表開跑
    runDeloadWeekNudge(userId);         // 🆕 第 4 週：減量週通知
    runMonthlyReportNudge(userId);      // 🆕 月初 1-3 號：月報出爐
    runGraduationNudge(userId);         // 🆕 計劃全打勾：畢業慶祝
    runEveningWrapupNudge(userId);      // 🆕 20:00-22:15：今天還差 N 件

    // app 重新取得焦點時：刷新完成度、重排、再查一次連續紀錄
    const onFocus = () => {
        refreshCompletionMeta(userId);
        scheduleNext(userId, getReminderSettings(userId));
        runStreakGuard(userId);
        runWeeklyReviewNudge(userId);
        runNutritionLogNudge(userId);
        runComebackNudge(userId);
        runPlannedRunNudge(userId);
        runWeekKickoffNudge(userId);
        runDeloadWeekNudge(userId);
        runMonthlyReportNudge(userId);
        runGraduationNudge(userId);
        runEveningWrapupNudge(userId);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') onFocus();
    });

    // 回傳清理函式
    return () => {
        window.removeEventListener('focus', onFocus);
        if (_timer) { clearTimeout(_timer); _timer = null; }
    };
}
