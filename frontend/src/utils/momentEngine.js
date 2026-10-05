/**
 * momentEngine.js — Swiss Moment 滿版儀式感回饋引擎（單一真相源）
 * ═══════════════════════════════════════════════════════════════
 * 黏著度設計核心：把「值得被看見的瞬間」升格成滿版瑞士極簡語句。
 * 三類時刻，全部走同一個事件通道（drvn:moment），由全域 <SwissMoment/>
 * 監聽渲染 —— 任何頁面呼叫 engine 即可觸發，不需各自實作 UI。
 *
 *   1. 連續開啟（recordAppOpen）  ：第 N 天回來 → 滿版「第 N 天。」
 *      （6 點日界線；只在里程碑天發：2/3/5/7/10/14/21/30/50/75/100…
 *        前期密、越後面間隔越長；斷了從 1 重數，第 1 天不打擾）
 *   2. 今日全完成（recordAllDone）：任務全打勾 → 滿版「全部到位。」
 *      （只在第 1/3/7/15/30/60/100 個全完成日發，第一次一定有）
 *   3. 行為里程碑（recordAction）：任何行為的第 1/3/7/15/30/60/100 次
 *      → 遞進回饋：第一次一定慶祝，之後間隔越拉越長，不天天打擾。
 *
 * 🪜 節奏總原則：「第一次一定要有，越後面越久才有」— 前期高頻建立
 *    回饋感，中後期只在有份量的里程碑打擾，維持稀有度與儀式感。
 *
 * 語句規範：一句話、一個 coral 關鍵詞、不塞數據 —— 儀式感不是報表。
 */

import { uGet, uSet } from './userStorage';
import { logicalDayKey } from './dailyAgenda';
import { toLocalDateKey } from './localDate';

const EVT = 'drvn:moment';

/** 發射一個滿版時刻。payload: { kicker, parts:[[text, tone]], holdMs? }
 *  tone: 'dim' | 'main' | 'coral' */
export function fireMoment(payload) {
    try {
        // 全域旗標：讓「每日首開簡報」等其他開屏彈窗知道要排隊（收場時由
        // SwissMoment 清旗標並發 drvn:moment-idle）
        window.__drvnMomentActive = true;
        window.dispatchEvent(new CustomEvent(EVT, { detail: payload }));
    } catch { /* */ }
}
export const MOMENT_EVENT = EVT;
export const MOMENT_IDLE_EVENT = 'drvn:moment-idle';

/** 等 moment 收場再執行（沒有 moment 進行中就立刻執行）。 */
export function afterMomentIdle(fn, extraDelayMs = 350) {
    try {
        if (!window.__drvnMomentActive) { fn(); return; }
        const h = () => {
            window.removeEventListener(MOMENT_IDLE_EVENT, h);
            setTimeout(fn, extraDelayMs);
        };
        window.addEventListener(MOMENT_IDLE_EVENT, h);
    } catch { fn(); }
}

const today = () => { try { return logicalDayKey(new Date()); } catch { return toLocalDateKey(new Date()); } };

/* 🪜 通用「前密後疏」里程碑：第一次一定有，之後間隔遞增；破百後每逢百再發 */
const GROWING_MILESTONES = [1, 3, 7, 15, 30, 60, 100];
const hitGrowing = (n) => GROWING_MILESTONES.includes(n) || (n > 100 && n % 100 === 0);

/* ── 1. 連續開啟 ─────────────────────────────────────────── */
export function recordAppOpen(userId) {
    try {
        const key = 'momentAppOpen';
        const st = uGet(userId, key, { last: '', days: 0, firedOn: '' }) || {};
        const t = today();
        if (st.last === t) return null;                    // 今天已記過
        const yesterday = logicalDayKey(new Date(Date.now() - 86400000));
        const days = st.last === yesterday ? (st.days || 0) + 1 : 1;

        // 💌 回歸時刻：斷了 3 天以上又回來 → 不罵人，給台階＋擁抱（Rosehip）
        if (st.last && st.last !== yesterday) {
            const gap = Math.round((new Date(t) - new Date(st.last)) / 86400000);
            uSet(userId, key, { last: t, days: 1, firedOn: t });
            if (gap >= 3) {
                const payload = {
                    kicker: 'WELCOME BACK',
                    theme: 'rosehip',
                    parts: [['離開 ', 'dim'], [`${gap} 天`, 'main'], ['。\n回來，只花了', 'dim'], ['一次點擊', 'accent'], ['。', 'main']],
                    holdMs: 3000,
                };
                fireMoment(payload);
                return payload;
            }
            return null;
        }

        uSet(userId, key, { last: t, days, firedOn: t });
        if (days < 2) return null;                          // 第 1 天不打擾
        // 🪜 里程碑節奏：不再天天發 — 前期密（2/3/5/7/10…）、越後面間隔越長，
        //    讓「第 N 天」保持稀有度；非里程碑天安靜累計。
        const STREAK_MILESTONES = [2, 3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 300, 365];
        if (!STREAK_MILESTONES.includes(days) && !(days > 365 && days % 100 === 0)) return null;
        // 大里程碑放大力道（Brick 滿版）；小里程碑輕聲但有趣（四色輪轉）
        const big = [7, 14, 30, 50, 100, 200, 365].includes(days) || (days > 365 && days % 100 === 0);
        // 😏 有趣文案池（依天數確定性輪替，不會每次亂跳）
        const NORMAL_LINES = [
            [`。\n健身房都認得你了。`],
            [`報到。\n比鬧鐘還準。`],
            [`。\n慣性是你養的。`],
            [`。\n又是說到做到的一天。`],
        ];
        const BIG_LINES = {
            7: '。\n你把一週練成了習慣。',
            14: '。\n兩週了，身體開始期待你。',
            30: '。\n這不是熱情，是人格。',
            50: '。\n半百天，鐵都被你捏軟了。',
            100: '。\n一百天。傳說的開始。',
            200: '。\n兩百天。身體是你蓋的作品。',
            365: '。\n一年了。你把自己活成證據。',
        };
        // 🎨 一般日輪轉多巴胺四色（Rosehip→Viola→Clear Day→Apple），里程碑 Brick 滿版
        const DAILY_THEMES = ['rosehip', 'viola', 'clearday', 'apple'];
        const payload = big
            ? {
                kicker: `DAY ${days} · 連續開啟`,
                theme: 'brick',
                parts: [[`第 ${days} 天`, 'accent'], [BIG_LINES[days] || '。\n這已經是你的一部分。', 'main']],
                holdMs: 3400,
            }
            : {
                kicker: `DAY ${days} · 連續開啟`,
                theme: DAILY_THEMES[days % DAILY_THEMES.length],
                parts: [['第 ', 'dim'], [`${days} 天`, 'accent'], [NORMAL_LINES[days % NORMAL_LINES.length][0], 'main']],
                holdMs: 2600,
            };
        fireMoment(payload);
        return payload;
    } catch { return null; }
}

/* ── 2. 今日全完成 ───────────────────────────────────────── */
export function recordAllDone(userId, doneCount = 0) {
    try {
        const key = 'momentAllDone';
        const t = today();
        if (uGet(userId, key, '') === t) return null;
        uSet(userId, key, t);
        // 🪜 里程碑節奏：第 1/3/7/15/30/60/100 個「全完成日」才發滿版
        //   （第一次一定有；非里程碑日安靜累計，避免天天全完成 → 天天被打斷）
        const n = (parseInt(uGet(userId, 'momentAllDoneCount', 0)) || 0) + 1;
        uSet(userId, 'momentAllDoneCount', n);
        if (!hitGrowing(n)) return null;
        // 😏 有趣文案池（依日期確定性輪替）
        const DONE_LINES = [
            [['清單', 'dim'], ['清空', 'accent'], ['。\n肌肉知道你來過。', 'main']],
            [['全部', 'dim'], ['到位', 'accent'], ['。\n今天可以理直氣壯地躺。', 'main']],
            [['做完了', 'accent'], ['。\n明天的你會謝謝現在的你。', 'main']],
        ];
        const pick = (new Date().getDate()) % DONE_LINES.length;
        const payload = {
            kicker: 'TODAY · COMPLETE',
            theme: 'sunshine',   // 🎨 全完成 = 陽光黃滿版（清單清空的多巴胺）
            parts: DONE_LINES[pick],
            holdMs: 3200,
        };
        fireMoment(payload);
        return payload;
    } catch { return null; }
}

/* ── 3. 行為里程碑（第 1/3/7/15/30/60/100 次遞進回饋）──────
 *    🪜 第一次一定慶祝；之後間隔越拉越長（破百後每逢百次再發）。 */
const ACTION_LINES = {
    1: (zh) => ({ kicker: 'FIRST TIME', parts: [['第一次', 'accent'], [`${zh}。\n`, 'main'], ['萬事起頭難，你剛把難字劃掉。', 'dim']] }),
    3: (zh) => ({ kicker: 'MILESTONE · 3RD', parts: [['第三次', 'accent'], [`${zh}。\n`, 'main'], ['身體開始背下這件事了。', 'dim']] }),
    7: (zh) => ({ kicker: 'MILESTONE · 7TH', parts: [['第七次', 'accent'], [`${zh}。\n`, 'main'], ['不用提醒，你自己就來了。', 'dim']] }),
    15: (zh) => ({ kicker: 'MILESTONE · 15TH', parts: [['第 15 次', 'accent'], [`${zh}。\n`, 'main'], ['已經不是嘗試，是日常。', 'dim']] }),
    30: (zh) => ({ kicker: 'MILESTONE · 30TH', parts: [['第 30 次', 'accent'], [`${zh}。\n`, 'main'], ['別人叫堅持，你叫習慣。', 'dim']] }),
    60: (zh) => ({ kicker: 'MILESTONE · 60TH', parts: [['第 60 次', 'accent'], [`${zh}。\n`, 'main'], ['量變，正在悄悄質變。', 'dim']] }),
    100: (zh) => ({ kicker: 'MILESTONE · 100TH', parts: [['第 100 次', 'accent'], [`${zh}。\n`, 'main'], ['一百次。這已經是身分了。', 'dim']] }),
};
// 破百後每逢百次的通用文案
const makeHundred = (n, zh) => ({ kicker: `MILESTONE · ${n}TH`, parts: [[`第 ${n} 次`, 'accent'], [`${zh}。\n`, 'main'], ['數字還在長，你也是。', 'dim']] });

// 🎨 行為 → 主題色（對齊最新動態卡的多巴胺配色：
//    重訓=Brick 橘、跑步=Clear Day 藍、營養=Apple 綠、分析=Viola 紫）
const ACTION_THEMES = {
    workout_save: 'brick',
    run_save: 'clearday',
    nutrition_log: 'apple',
    pose_analysis: 'viola',
};

/**
 * 記一次行為；命中 1/3/7/15/30/60/100（及其後每百次）時觸發滿版回饋。
 * @param {string} actionKey 行為鍵（如 'pose_analysis'、'nutrition_log'、'workout_done'）
 * @param {string} zhLabel   中文動詞短語（如「完成動作分析」）
 */
export function recordAction(userId, actionKey, zhLabel) {
    try {
        const key = `momentAction:${actionKey}`;
        const n = (parseInt(uGet(userId, key, 0)) || 0) + 1;
        uSet(userId, key, n);
        if (!hitGrowing(n)) return null;
        const make = ACTION_LINES[n] || ((zh) => makeHundred(n, zh));
        const payload = { ...make(zhLabel), theme: ACTION_THEMES[actionKey] || 'mist', holdMs: 2800 };
        fireMoment(payload);
        return payload;
    } catch { return null; }
}

/* ── 3b. 一次性「第一次」時刻註冊表 ──────────────────────────
 *  社群/建置類行為只慶祝第一次（沒有第三次加入社團這種事）。
 *  {label} 佔位符會被 dynamicLabel 取代（如人格名稱）。 */
const FIRSTS = {
    join_squad:        { theme: 'clearday', kicker: 'FIRST SQUAD',
        parts: [['加入第一個', 'dim'], ['社團', 'accent'], ['。\n訓練，從此有人陪。', 'main']] },
    add_friend:        { theme: 'viola', kicker: 'FIRST ALLY',
        parts: [['第一個', 'dim'], ['戰友', 'accent'], ['入列。\n互相追蹤，互相不放過。', 'main']] },
    new_persona:       { theme: 'brick', kicker: 'NEW PERSONA',
        parts: [['解鎖新人格：', 'dim'], ['{label}', 'accent'], ['。\n你又多了一種練法。', 'main']] },
    add_music:         { theme: 'rosehip', kicker: 'FIRST TRACK',
        parts: [['第一首', 'dim'], ['訓練歌', 'accent'], ['入庫。\n配樂到位，開練。', 'main']] },
    inbody_first:      { theme: 'apple', kicker: 'BASELINE SET',
        parts: [['第一筆 ', 'dim'], ['InBody', 'accent'], ['。\n從今天起，變化有據可查。', 'main']] },
    gen_workout_plan:  { theme: 'brick', kicker: 'FIRST PLAN',
        parts: [['第一份', 'dim'], ['健身計劃', 'accent'], ['生成。\n紙上談兵，結束了。', 'main']] },
    gen_run_plan:      { theme: 'clearday', kicker: 'FIRST PLAN',
        parts: [['第一份', 'dim'], ['跑步計劃', 'accent'], ['生成。\n路線畫好了，等你踩。', 'main']] },
    gen_nutrition_plan:{ theme: 'apple', kicker: 'FIRST STRATEGY',
        parts: [['第一份', 'dim'], ['營養策略', 'accent'], ['上線。\n連吃，都開始有戰術了。', 'main']] },
    first_post:        { theme: 'sunshine', kicker: 'FIRST POST',
        parts: [['第一篇', 'dim'], ['發文', 'accent'], ['。\n讓汗水也有觀眾。', 'main']] },
    fusion_plan:       { theme: 'viola', kicker: 'FUSION',
        parts: [['第一次', 'dim'], ['融合計劃', 'accent'], ['。\n兩套課表，煉成你的。', 'main']] },
    evolution_page:    { theme: 'mist', kicker: 'EVOLUTION LOG',
        parts: [['進化日誌', 'accent'], ['開張。\n之後的每一滴汗，都記帳。', 'main']] },
};

/**
 * 一次性首次時刻：只在「第一次」觸發，之後永遠靜音。
 * @param {string} key FIRSTS 的鍵
 * @param {string} [dynamicLabel] 取代文案中的 {label}（如人格名）
 */
export function recordFirst(userId, key, dynamicLabel = '') {
    try {
        const def = FIRSTS[key];
        if (!def) return null;
        const storeKey = `momentFirst:${key}`;
        if (uGet(userId, storeKey, false)) return null;
        uSet(userId, storeKey, true);
        const parts = def.parts.map(([t, tone]) => [t.replace('{label}', dynamicLabel), tone]);
        const payload = { kicker: def.kicker, theme: def.theme, parts, holdMs: 3000 };
        fireMoment(payload);
        return payload;
    } catch { return null; }
}

/* ── 3c. 計劃成立 ────────────────────────────────────────────
 *  跟上面每一則都不同：這一則「不節流」。
 *  使用者按下「確認計劃」，就必須當場看見計劃確實成立 ——
 *  那是承諾生效的那一刻，不是通知，所以每一次都要有。
 *  節流的是「我們想講的話」，不節流的是「使用者做完一件事的證明」。 */
export function recordPlanLive(userId, { weeks = 0, kind = 'run' } = {}) {
    try {
        const n = Math.max(0, Math.round(Number(weeks) || 0));
        const noun = kind === 'strength' ? '健身' : '跑步';
        const payload = {
            kicker: 'PLAN LIVE',
            theme: kind === 'strength' ? 'brick' : 'clearday',
            // 一句話、一個關鍵詞。週數是唯一的數字 —— 它就是「成立了多久」的證據
            parts: n > 0
                ? [['未來 ', 'dim'], [`${n} 週`, 'accent'], [`的${noun}計劃成立。`, 'main']]
                : [[`${noun}計劃`, 'accent'], ['成立。', 'main']],
            holdMs: 1200,
        };
        fireMoment(payload);
        return payload;
    } catch { return null; }
}

/* ── 4. 破 PR（每邏輯日最多一次＋前密後疏里程碑）──────────── */
const PR_MILESTONES = [1, 2, 4, 7, 12, 20, 30, 50, 75, 100];
export function recordPR(userId, prCount = 1) {
    try {
        const t = today();
        if (uGet(userId, 'momentPRDay', '') === t) return null;
        uSet(userId, 'momentPRDay', t);
        // 🪜 第 n 個「破 PR 日」：第一次一定發，之後間隔遞增（PR 較珍貴，排程比一般行為密）
        const n = (parseInt(uGet(userId, 'momentPRDayCount', 0)) || 0) + 1;
        uSet(userId, 'momentPRDayCount', n);
        if (!PR_MILESTONES.includes(n) && !(n > 100 && n % 50 === 0)) return null;
        const payload = {
            kicker: 'PERSONAL RECORD',
            theme: 'sunshine',
            parts: prCount > 1
                ? [['一口氣破 ', 'dim'], [`${prCount} 項紀錄`, 'accent'], ['。\n昨天的你剛被超車。', 'main']]
                : [['新紀錄', 'accent'], ['。\n昨天的你剛被超車。', 'main']],
            holdMs: 3200,
        };
        fireMoment(payload);
        return payload;
    } catch { return null; }
}

/* ── 5. 清晨 / 深夜訓練彩蛋（每邏輯日最多一次）──────────── */
export function recordTimeEgg(userId) {
    try {
        const h = new Date().getHours();
        const isMorning = h >= 4 && h < 7;
        const isNight = h >= 22 || h < 2;
        if (!isMorning && !isNight) return null;
        const t = today();
        if (uGet(userId, 'momentEggDay', '') === t) return null;
        uSet(userId, 'momentEggDay', t);
        // 🪜 彩蛋也走前密後疏：常態清晨/深夜訓練的人不會天天被打斷
        const n = (parseInt(uGet(userId, 'momentEggCount', 0)) || 0) + 1;
        uSet(userId, 'momentEggCount', n);
        if (!hitGrowing(n)) return null;
        const payload = isMorning
            ? {
                kicker: 'EARLY BIRD',
                theme: 'clearday',
                parts: [[`清晨 ${h} 點`, 'accent'], ['。\n全世界還在賴床，', 'dim'], ['你在練。', 'main']],
                holdMs: 3000,
            }
            : {
                kicker: 'NIGHT SHIFT',
                theme: 'viola',
                parts: [[`${h} 點還在練`, 'accent'], ['。\n夜色都替你讓路。', 'main']],
                holdMs: 3000,
            };
        fireMoment(payload);
        return payload;
    } catch { return null; }
}

/* ── 6. 訓練儲存統一入口：PR > 彩蛋 > 前幾次里程碑（一次最多疊兩張）──
 *    儲存訓練時呼叫；優先級高的先出，first-times 照常累計。 */
export function recordWorkoutSaveMoments(userId, { prCount = 0 } = {}) {
    let fired = null;
    if (prCount > 0) fired = recordPR(userId, prCount);
    if (!fired) fired = recordTimeEgg(userId);
    recordAction(userId, 'workout_save', '完成訓練紀錄');   // 1/3/7 次照常
    return fired;
}

/* ── 7. 週全勤（由 weeklyPlanReview 呼叫）────────────────── */
export function fireCleanWeek(userId, weekKey, doneDays) {
    try {
        if (uGet(userId, 'momentCleanWeek', '') === weekKey) return null;
        uSet(userId, 'momentCleanWeek', weekKey);
        // 🪜 第 n 個全勤週：1/2/4/8/16/26/52 前密後疏（之後每 26 週＝半年一次）
        const n = (parseInt(uGet(userId, 'momentCleanWeekCount', 0)) || 0) + 1;
        uSet(userId, 'momentCleanWeekCount', n);
        if (![1, 2, 4, 8, 16, 26, 52].includes(n) && !(n > 52 && n % 26 === 0)) return null;
        const payload = {
            kicker: 'PERFECT WEEK',
            theme: 'apple',
            parts: [['一週', 'dim'], ['全勤', 'accent'], [`。\n課表被你打卡打服了。`, 'main']],
            holdMs: 3200,
        };
        fireMoment(payload);
        return payload;
    } catch { return null; }
}
