// ─────────────────────────────────────────────────────────────
// 🔔 Home Alerts — 主頁天氣卡輪播提醒聚合器
//
// 把各種「值得提醒」的事件收成一個依優先級排序的清單，給天氣卡下方的輪播用。
// 設計原則：
//   • 每個來源一個獨立 builder，回傳 alert 或 null（沒事件就不進輪播）。
//   • 只在「真的有事件」時才出現，沒事件 → 不顯示，不佔版面、不製造假提醒。
//   • 資料源隔離：訓練/營養/黑卡用各自既有系統；社群先留框架接口。
//
// 優先級（數字小 = 高，先輪播）：
//   1 訓練提醒（今日計劃 / 已排程的下次跑步）— 真資料、可直接行動
//   2 段位晉升（真的升上更高段位、還沒去看）— 真資料、慶祝 + 可直接 check
//   2 營養紀錄（月報提醒）— 真資料
//   3 黑卡晉升邀請（週末且在晉升區）— 沿用 MasterJourney 既有條件
//   4 社群新動態 — 框架先留，接上真實多帳戶社群後啟用
// ─────────────────────────────────────────────────────────────

import { shouldShowLeaguePromotion } from './leaguePromotionReminder';
import { formatRelativeDay } from './scheduleTime';
import { getStreak } from './streakEngine';
import { hasNewSettlement, getSettledMonth } from './monthlyRecap';
import { toLocalDateKey, mondayWeekKey } from './localDate';
import { featureAllowed, readRenewal, renewalReminder } from './memberLimits';
import { readSystemCycles, readReviewed, markReviewed, strengthSeasonDone, strengthCycleTimeUp, strengthCycleConfirmed } from './trainingFocus';

const isWeekend = (d = new Date()) => { const x = d.getDay(); return x === 0 || x === 6; };

// 段位 → 在淺色玻璃橫幅上可讀的強調色（與解鎖卡 tier 色一致）
const LEAGUE_ACCENT = {
    bronze: '#A8693B',
    silver: '#8A8A92',
    gold:   '#B8862F',
    black:  '#161415',
};

// ── 1. 訓練提醒 ───────────────────────────────────────────────
// 來源：結果頁存的 drvn_next_goal（含 title / scheduledFor）。
const buildTrainingAlert = (userId) => {
    try {
        const raw = localStorage.getItem(`drvn_next_goal_${userId}`);
        if (!raw) return null;
        const goal = JSON.parse(raw);
        if (!goal?.title) return null;
        let when = '';
        if (goal.scheduledFor) {
            const d = new Date(goal.scheduledFor);
            if (!isNaN(d.getTime())) {
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                when = `${formatRelativeDay(d)} ${hh}:${mm}`;
            }
        }
        return {
            id: 'training',
            priority: 1,
            icon: 'target',
            accent: '#F95C4B',
            eyebrow: goal.type === 'PLAN' ? '計劃下一課' : '下次訓練',
            title: `去練 ${goal.title}`,
            detail: when || '準備好就開始',
            route: '/cardio-tracker-mobile',
        };
    } catch { return null; }
};

// ── 2. 營養紀錄提醒 ───────────────────────────────────────────
/* ❌ buildNutritionAlert（「你的營養月報出爐了」）已移除 —— 它是假的：
     · 守門寫成 `if (!shouldShowMonthlyRecap(userId))`，但那支回傳的是物件
       （{show, monthKey, …}），物件恆為 truthy，所以這個 return 永遠不會執行
       → 每個使用者、每一天都會看到這張卡。
     · 就算守門修好，它讀的是 trainingRecords（訓練紀錄），跟營養無關。
     · 它指向 /nutrition-mobile，而那一頁根本沒有「月報」這個東西。
   營養真正該提示的是「這一輪營養計劃跑完了」，由 buildCycleSettleAlert 負責。 */

// ── 2b. 段位晉升提醒（真的升上更高段位、還沒 check）─────────────
// 來源：leaguePromotionReminder（比對目前段位 rank 與已看過 rank）。
// 點擊後由 UI 端呼叫 dismissLeaguePromotion 消除，直到下次晉升。
const buildLeaguePromotionAlert = (userId) => {
    try {
        const r = shouldShowLeaguePromotion(userId);
        if (!r.show) return null;
        return {
            id: 'leaguePromotion',
            priority: 2,
            icon: 'trophy',
            accent: LEAGUE_ACCENT[r.leagueId] || '#B8862F',
            eyebrow: '段位晉升',
            title: '去看你升到哪了',
            detail: `晉升到 ${r.label} 了`,
            route: '/social-mobile',
            routeState: { activeTab: 'ranking' }, // 導到社群「排行」分頁（季排行）
        };
    } catch { return null; }
};

// ── 1b. 跑步週結算出爐 ────────────────────────────────────────
// 跑步沒有「使用者手填的週回饋」——RPE 是每次跑完即時填、系統自動結算。
// 這裡對應真實存在的「週結算」頁（WeekSettlementSheet, route /cardio-week-settlement）：
// 本週跑步已完成、且還沒看過該週結算 → 提示去看結算結果。
const buildRunSettlementAlert = (userId) => {
    try {
        /* run_week_done_ 存的是「哪一週跑完了」（例如 2026-W37）。
           以前只檢查有沒有值 —— 那個值會一直留著，所以下一週、下下週
           都會再亮一次「本週跑步結算出爐」，但那一週根本還沒跑完。 */
        const wk = weekKey();
        const done = localStorage.getItem(`run_week_done_${userId}`);
        const seen = localStorage.getItem(`run_settlement_seen_${userId}_${wk}`);
        if (done !== wk || seen) return null;
        return {
            id: 'runSettlement',
            priority: 1,
            icon: 'activity',
            accent: '#F95C4B',
            eyebrow: '跑步',
            title: '去看本週結算',
            detail: '系統怎麼調整你的下週',
            route: '/cardio-week-settlement',
        };
    } catch { return null; }
};

// 依 plan 起始日算出「使用者實際已進行到第幾週」（1-based）。
//   起始日優先 plan.startDate/start_date/created_at；缺失時退回「最早一筆完成訓練」，
//   再退回今天（= 第 1 週）。與 LuxuryPlanView 的 cycleProgress 同一套演算法。
//   ⚠️ 這是修正「沒到時間卻說可以點」的關鍵：只有真的過了的週才算數。
function elapsedPlanWeeks(userId, plan) {
    try {
        const totalWeeks = plan?.weeks?.length || 4;
        let start = null;
        const startStr = plan?.startDate || plan?.start_date || plan?.created_at;
        if (startStr) { const d = new Date(startStr); if (!isNaN(d)) start = d; }
        if (!start) {
            // 退回：本機最早一次「完成訓練」的日期
            try {
                const recs = JSON.parse(localStorage.getItem('trainingRecords') || '{}');
                const dates = Object.values(recs).map(r => new Date(r?.date || r?.timestamp)).filter(d => !isNaN(d));
                if (dates.length) start = new Date(Math.min(...dates.map(d => d.getTime())));
            } catch { /* ignore */ }
        }
        if (!start) return 1; // 沒有任何起始資訊 → 保守視為第 1 週
        const s0 = new Date(start); s0.setHours(0, 0, 0, 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = Math.floor((today - s0) / 86400000);
        if (days < 0) return 0; // 起始日在未來 → 尚未開始
        const wk = Math.floor(days / 7) + 1; // Day 0-6 = 第1週
        return Math.min(wk, totalWeeks);
    } catch { return 1; }
}

// ── 1c. 健身週訓練評估待填 / 完美收官出爐 ─────────────────────
// 接 LuxuryPlanView 的 week_feedback / cycle_complete 旗標。
// 🔧 修正顯示時機：一週的回饋只有在「該週已實際過完（有進入下一週）」時才提示，
//    避免 demo/預填的 completed_workouts_weekN 旗標讓未到期的週就跳出可點提醒。
const buildLiftFeedbackAlert = (userId) => {
    try {
        const plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        if (!plan?.weeks?.length) return null;
        const totalWeeks = plan.weeks.length;
        const currentWeek = elapsedPlanWeeks(userId, plan); // 使用者真實所在週

        // 找出「已完成、尚未填回報、且該週已過去（w < 目前所在週）」的非最後一週
        for (let w = 1; w < totalWeeks; w++) {
            // ⏳ 時機守門：第 w 週的回饋，要等到使用者真的進到第 w+1 週（含）之後才提示
            if (currentWeek <= w) continue;
            const completed = localStorage.getItem(`completed_workouts_${userId}_week${w}`);
            const fb = localStorage.getItem(`week_feedback_${userId}_week${w}`);
            if (completed && !fb) {
                return {
                    id: 'liftFeedback', priority: 1, icon: 'dumbbell', accent: '#F95C4B',
                    eyebrow: '健身', title: `去填第 ${w} 週的訓練回饋`,
                    detail: '回報強度，系統幫你微調下週', route: '/luxury-plan-view-mobile',
                    // 點下去直接開「週回饋表單」，不只是導到計劃頁
                    routeState: { openWeekFeedback: true, feedbackWeek: w },
                };
            }
        }
        /* 「整個週期跑完」的提醒不在這裡做 —— 三個系統統一交給 buildCycleSettleAlert，
           不然健身會有兩張講同一件事的卡，而且舊的那張沒有「看過就不再提醒」的旗標。 */
        return null;
    } catch { return null; }
};

// ── 1d. 某一項計劃整輪跑完 → 去那個系統看回饋 ──────────────────
// 規則：只有「週期結束」才提醒（不是每週），看過一次就不再出現。
// 週期狀態與已讀旗標都用中控台的同一套（readSystemCycles / markReviewed），
// 兩邊不會一個說跑完了、一個說還在跑。
const SETTLE_BY_SYSTEM = {
    strength: { label: '健身', icon: 'dumbbell', accent: '#F95C4B', route: '/luxury-plan-view-mobile', state: { openCycleRecap: true } },   // 點了直接打開回饋
    run: { label: '跑步', icon: 'activity', accent: '#F95C4B', route: '/cardio-microcycle-inbox' },
    nutrition: { label: '營養', icon: 'apple', accent: '#7BB661', route: '/nutrition-mobile', state: { openPlanner: true } },
};

/* 哪一輪結束了 —— 三個系統各有自己的週期名稱，不能共用一句。 */
const CYCLE_ENDED = {
    strength: '這一季練完了',
    run: '這一輪跑完了',
    nutrition: '這一期結束了',
};
const buildCycleSettleAlert = (userId) => {
    try {
        const cycles = readSystemCycles(userId);
        const seen = readReviewed(userId);
        /* 重訓另外看「整季練完沒」——一季的課表可能提早練完，
           那一刻就該提醒，不必等日曆走完最後一天。 */
        /* 重訓：日曆到最後一天（第 28／28 天）就提醒，跟計劃頁同一天出現；
           「看過沒」以這份計劃自己的收官旗標為準（strengthCycleTimeUp 已經檢查），
           不用中控台那個跨計劃的已讀 —— 換新計劃後舊的已讀會把提醒吃掉。 */
        const strengthTimeUp = strengthCycleTimeUp(userId);
        /* 重訓「看過」＝按了下一季的確認，不是點開過 —— 點進去看一眼就關掉的人，提醒要留著 */
        seen.strength = strengthCycleConfirmed(userId);
        const done = {
            strength: strengthTimeUp || !!cycles.strength?.finished || strengthSeasonDone(userId),
            run: !!cycles.run?.finished,
            nutrition: !!cycles.nutrition?.finished,
        };
        const key = ['strength', 'run', 'nutrition'].find((k) => done[k] && !seen[k]);
        if (!key) return null;
        const s = SETTLE_BY_SYSTEM[key];
        return {
            id: `cycleSettle_${key}`, priority: 0, icon: s.icon, accent: s.accent,
            /* ⚠️ 這裡原本是 key === 'strength' ? A : B，但 key 有三種
               （strength / run / nutrition）—— 營養週期結束時會顯示
               「這一輪跑完了」，把營養說成跑步。而且重訓的中標寫「這一季」、
               標題卻寫「這個月」，同一件事兩個週期名。
               中標一律用系統名（健身／跑步／營養），與每日提示卡同一套詞彙；
               不加「提醒」—— 整張卡就是提醒，中標再講一次是重複（介面標準 §2）；
               「哪一輪結束了」屬於原因，放 detail。 */
            eyebrow: s.label,
            title: `去看${s.label}這一輪的回饋`,
            detail: `${CYCLE_ENDED[key]}，回饋完會推薦下一輪`,
            route: s.route, routeState: s.state,
            // 重訓不在點開時標記：要在計劃頁按了下一季的確認才算回饋完成
            onOpen: key === 'strength' ? undefined : () => markReviewed(userId, key),
        };
    } catch { return null; }
};

// ── 2c. 今日尚未記錄任何一餐（傍晚才提醒）────────────────────
const buildNutritionLogAlert = (userId) => {
    try {
        const hour = new Date().getHours();
        if (hour < 17) return null; // 傍晚 17:00 後才提醒
        const today = toLocalDateKey(new Date());
        const logged = localStorage.getItem(`nutrition_logged_${userId}_${today}`);
        if (logged) return null;
        return {
            id: 'nutritionLog', priority: 3, icon: 'apple', accent: '#7BB661',
            eyebrow: '營養', title: '去記今天吃了什麼',
            detail: '今天還沒有任何一餐，花 10 秒就好', route: '/nutrition-mobile',
        };
    } catch { return null; }
};

// 取本週 key（YYYY-Www 簡化版：用年+週數）
function weekKey(d = new Date()) { return mondayWeekKey(d); }

// ── 3. 黑卡晉升提醒 ───────────────────────────────────────────
// 沿用 MasterJourney 既有條件：週末 + 在晉升區。晉升區資料由呼叫端帶入
// （isInPromoZone），避免這支重複算排行。每天只提示一次。
const buildPromotionAlert = (userId, { isInPromoZone = false } = {}) => {
    if (!isWeekend() || !isInPromoZone) return null;
    const shownKey = `homeAlert_promo_${new Date().toDateString()}`;
    // 不在這裡寫 shown（讓輪播顯示），只提供 alert；是否已看由 UI 端決定要不要記
    return {
        id: 'promotion',
        priority: 3,
        icon: 'trophy',
        accent: '#D4A843',
        eyebrow: '晉升邀請',
        title: '去看你差多少',
        detail: '週末結算前衝一波，升級你的分區',
        route: '/master-journey',
        _shownKey: shownKey,
    };
};

// ── 1d. 月報結算出爐（每月 1 號，上個完整月份結算）─────────────
// 來源：monthlyRecap（最近已結算月份 != 已看過月份，且已解鎖）。
// 點開 /weekly-recap-mobile 後由該頁 markSettlementSeen 消除紅點。
const buildMonthlyRecapAlert = (userId) => {
    try {
        if (!hasNewSettlement(userId)) return null;
        const m = getSettledMonth();
        return {
            id: 'monthlyRecap',
            priority: 1,
            icon: 'trophy',
            accent: '#D4A843',
            eyebrow: '報告出爐',
            title: `去看 ${m.zh} 月的成效總結`,
            detail: '這一個月練了什麼、變了多少',
            route: '/weekly-recap-mobile',
        };
    } catch { return null; }
};

// ── 1e. 季報出爐（每季第一天：1/1、4/1、7/1、10/1）─────────────
// 導到月報頁並自動展開「季回饋」overlay。看過就以 seen 旗標消除，直到下一季。
const buildQuarterlyRecapAlert = (userId) => {
    try {
        const now = new Date();
        const m = now.getMonth(); // 0-based
        // 以前只認「季度第一天」——那天沒開 app 就永遠錯過。放寬成季初七天內。
        const isQuarterStart = now.getDate() <= 7 && (m === 0 || m === 3 || m === 6 || m === 9);
        if (!isQuarterStart) return null;
        if (!featureAllowed('monthlyReport')) return null;   // 💳 季回饋在月報裡（會員）；不主動推給免費使用者
        const q = Math.floor(m / 3) + 1; // 1..4
        const seenKey = `quarterly_recap_seen_${userId}_${now.getFullYear()}Q${q}`;
        if (localStorage.getItem(seenKey)) return null;
        return {
            id: 'quarterlyRecap',
            priority: 1,
            icon: 'trophy',
            accent: '#B8862F',
            eyebrow: '季報出爐',
            // 季初出爐的是「剛結束的那一季」：10 月初看的是第 3 季，不是才開始的第 4 季
            title: `去看第 ${q === 1 ? 4 : q - 1} 季的整體成效`,
            detail: '這三個月練了什麼、變了多少',
            route: '/monthly-report-mobile',
            routeState: { openQuarterly: true },
            _seenKey: seenKey, // UI 端點擊後寫入以消除
        };
    } catch { return null; }
};

// ── 4. 社群新動態（框架）──────────────────────────────────────
// 接口先留好：之後接上真實多帳戶社群，把未讀互動數帶進來即可啟用。
// 傳入 socialUnread（數字）>= 3 才產生 alert（少量互動交給社群 tab 徽章）。預設不啟用（傳 0）。
const buildSocialAlert = (userId, { socialUnread = 0 } = {}) => {
    // 少量互動由社群 tab 徽章表達即可；>=3 則才值得佔用首頁警示條，避免同一資訊雙重提示
    if (!socialUnread || socialUnread < 3) return null;
    return {
        id: 'social',
        priority: 4,
        icon: 'users',
        accent: '#6BAACC',
        eyebrow: '社群動態',
        title: `去看 ${socialUnread} 則新互動`,
        detail: '看看誰對你的跑步有反應',
        route: '/social-mobile',
    };
};

// ── 5. 🔥 連續紀錄（streakEngine v2：風險 / 凍結卡事件）──────────────
//    「公告欄先有數據，推播才跟進」— 這裡與 workoutReminders 的 streak-guard 同源。
const buildStreakAlert = (userId) => {
    try {
        const s = getStreak(userId);
        if (s.freezeUsedYesterday) {
            return {
                id: 'streakFreeze', priority: 2, icon: 'flame', accent: '#6BAACC',
                eyebrow: '連續紀錄', title: '今天回來，就接得上',
                detail: `昨天休息了一天，連續 ${s.current} 天還在`,
                route: '/mobile-home',
            };
        }
        if (s.atRisk) {
            return {
                id: 'streakRisk', priority: 1, icon: 'flame', accent: '#F95C4B',
                eyebrow: '連續紀錄', title: `去延續第 ${s.current} 天`,
                detail: '今天還沒動，30 分鐘就夠',
                route: '/mobile-home',
            };
        }
    } catch { /* streakEngine 不可用 → 不顯示 */ }
    return null;
};

// ── 6. 🌊 減量週（Deload）公告 — 與推播同源、每週一次 ────────────────
const buildDeloadAlert = (userId) => {
    try {
        const plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null');
        if (!plan?.weeks?.length) return null;
        // activeWeek 判定與 dailyAgenda.loadStrengthInputs 相同
        let activeWeek = 1;
        for (let w = 0; w < plan.weeks.length; w++) {
            let done = [];
            try { done = JSON.parse(localStorage.getItem(`completed_workouts_${userId}_week${w + 1}`)) || []; } catch { /* */ }
            if (done.length < (plan.weeks[w].days?.length || 0)) { activeWeek = w + 1; break; }
            activeWeek = w + 1;
        }
        const wk = plan.weeks[activeWeek - 1];
        const isDeload = activeWeek === 4 || /deload|減量/i.test(`${wk?.phase || ''}${wk?.name || ''}`);
        if (!isDeload) return null;
        return {
            id: 'deloadWeek', priority: 2, icon: 'activity', accent: '#7BD3A5',
            eyebrow: '週期節奏', title: '本週是減量週，練少就好',
            detail: '組數已自動降載，變強發生在恢復的時候',
            route: '/luxury-plan-view-mobile',
        };
    } catch { /* */ }
    return null;
};

// ── 7. 💳 扣款前提醒（試用結束／續訂／取消後到期）— 與 iOS 本機推播同一套規則 ──
//    點了就開會員方案頁（事件由 utils/membership.openPlanSheet 同名），同一期只提醒到點開為止。
const buildRenewalAlert = (userId) => {
    try {
        const rem = renewalReminder(readRenewal(userId));
        if (!rem) return null;
        const seenKey = `drvn_renewal_alert_seen_${userId}_${rem.key}`;
        if (localStorage.getItem(seenKey)) return null;
        return {
            id: 'renewal', priority: 0, icon: 'bell', accent: '#D4A843',
            eyebrow: '會員', title: rem.title, detail: rem.detail,
            route: '/mobile-home', _seenKey: seenKey,
            onOpen: () => { try { window.dispatchEvent(new CustomEvent('drvn:open-plan-sheet')); } catch { /* */ } },
        };
    } catch { return null; }
};

/**
 * 聚合所有提醒，依優先級排序回傳。
 * @param {string} userId
 * @param {object} ctx { isInPromoZone, socialUnread } — 由呼叫端帶入需要外部資料的旗標
 * @returns {Array} 依 priority 由小到大排序的 alert 陣列（可能為空）
 */
export const buildHomeAlerts = (userId, ctx = {}) => {
    if (!userId) return [];
    const alerts = [
        buildRenewalAlert(userId),       // 💳 快扣款了 → 最優先（不讓人莫名其妙被扣錢）
        buildTrainingAlert(userId),
        buildStreakAlert(userId),        // 🆕 連續紀錄風險 / 凍結卡事件
        buildRunSettlementAlert(userId),
        buildMonthlyRecapAlert(userId),
        buildQuarterlyRecapAlert(userId),
        buildCycleSettleAlert(userId),   // 🆕 整輪跑完 → 去該系統看回饋（最優先）
        buildLiftFeedbackAlert(userId),
        buildLeaguePromotionAlert(userId),
        buildDeloadAlert(userId),        // 🆕 減量週公告
        buildNutritionLogAlert(userId),
        // buildPromotionAlert 已移除：與「段位晉升」重複，統一走 buildLeaguePromotionAlert。
        /* buildSocialAlert 暫時不掛：首頁呼叫端傳的是寫死的 socialUnread: 0，
           全專案也還沒有任何「未讀互動數」的來源 —— 掛上去等於掛一張永遠不會亮的卡。
           等未讀數真的算得出來再接回去（函式保留在上面）。 */
    ].filter(Boolean);
    alerts.sort((a, b) => a.priority - b.priority);
    // 📊 公告欄曝光遙測（每次重建記一次 — 上市後看哪些公告有人看/點）
    try {
        import('./telemetry').then(({ track }) => track('home_alerts_built', { ids: alerts.map((a) => a.id).join(',') })).catch(() => {});
    } catch { /* */ }
    return alerts;
};

// ── 預覽用假資料：一次顯示所有類別的提示，讓你能滑動瀏覽整套設計 ──
// 跨四大類（跑步 / 健身 / 營養 / 社群），依重要程度 priority 排序。
export const buildHomeAlertsPreview = () => {
    const alerts = [
        { id: 'pv_harvest', priority: 0, icon: 'trophy', accent: '#F95C4B', title: '去看這個月的努力結晶', detail: '回饋完，系統依實際結果推薦下一輪', route: '/luxury-plan-view-mobile' },
        { id: 'pv_lift', priority: 1, icon: 'dumbbell', accent: '#F95C4B', title: '去填第 2 週的訓練回饋', detail: '回報強度，系統幫你微調下週', route: '/luxury-plan-view-mobile' },
        { id: 'pv_run', priority: 1, icon: 'activity', accent: '#F95C4B', title: '去看本週跑步結算', detail: '系統怎麼調整你的下週', route: '/cardio-week-settlement' },
        { id: 'pv_recap', priority: 1, icon: 'trophy', accent: '#D4A843', title: '去看 9 月的成效總結', detail: '這個月練了什麼、變了多少', route: '/weekly-recap-mobile' },
        { id: 'pv_league', priority: 2, icon: 'trophy', accent: '#161415', title: '去看你的新段位', detail: '晉升到 Black Card 了', route: '/social-mobile' },
        { id: 'pv_deload', priority: 2, icon: 'activity', accent: '#7BD3A5', title: '本週是減量週，練少就好', detail: '組數已自動降載，變強發生在恢復的時候', route: '/luxury-plan-view-mobile' },
        { id: 'pv_nutriLog', priority: 3, icon: 'apple', accent: '#7BB661', title: '去記今天吃了什麼', detail: '今天還沒有任何一餐，花 10 秒就好', route: '/nutrition-mobile' },
    ];
    alerts.sort((a, b) => a.priority - b.priority);
    return alerts;
};

// 依重要程度決定輪播停留時間（priority 越高停越久，讓重要提示被看到）
export const alertDwellMs = (priority) => {
    switch (priority) {
        case 1: return 6000; // 最重要：待辦/回饋
        case 2: return 5000;
        case 3: return 4000;
        default: return 3500; // 社群等
    }
};
