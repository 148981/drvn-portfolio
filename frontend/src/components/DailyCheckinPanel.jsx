import React, { useMemo, useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ChevronRight, Activity, UtensilsCrossed, HeartPulse, CalendarCheck } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { uStorage } from '../utils/userStorage';
import { haptic } from '../utils/haptics';
import { logicalDayKey, logicalNow } from '../utils/dailyAgenda';
import { titleForRun } from '../utils/runDistanceClass';
import TaskDoneCelebration, { hasCelebratedTask } from './TaskDoneCelebration';
import { getPeriodicCheckinItems } from '../utils/periodicEvents';
import { categoryStyle } from '../utils/taskCategories';
import { checkinAmbient } from '../utils/checkinAmbient';
import { TYPE, hairlineList, indexNumber, textCTA } from '../utils/swissUI';

/**
 * 🥇 DailyCheckinPanel — 每日打卡金屬面板
 * ─────────────────────────────────────────────────────────────
 * 入口：主頁「活動紀錄」月曆點擊。
 * 內容：今天的目標清單（重訓 / 跑步 / 記錄飲食）—
 *   已完成自動打勾（真實資料判定），未完成給明確導引 CTA。
 * 語言：瑞士極簡 × 拉絲金屬（MuchaTseBle.jpeg）× 激勵口吻。
 *
 * Props:
 *   open      — 顯示開關
 *   onClose   — 關閉
 *   cell      — dailyAgenda 的今日格 { strength, run, warnings }（主頁 weekAgenda 供給）
 *   userId    — 目前使用者
 *   navigate  — react-router navigate
 */

const zhFocus = (s) => s?.focus || s?.name || (s?.dayNumber ? `第 ${s.dayNumber} 天課表` : '今日重訓');

/* 營養的「今天完成了」門檻 —— 與 dailyAgenda 的 COMPLETION_THRESHOLD 對齊。
   刻意不 import 過來：那支是排程模組，這裡只需要一個數字，
   多一條相依會讓打卡面板拖進整個議程引擎。兩邊要一起改。 */
const NUTRITION_DONE_THRESHOLD = 0.8;

/**
 * 🧮 getTodayCheckinItems — 今日打卡目標清單「單一真相源」。
 * 打卡面板與主頁月曆的呼吸燈共用這一份判定，保證兩邊完成狀態永遠一致。
 * 三大系統齊備：重訓（dailyAgenda.strength）/ 跑步（dailyAgenda.run）/ 營養（每日飲食紀錄）。
 * navigate 可傳 null（只算狀態、不需要跳轉時）。
 */
export function getTodayCheckinItems(cell, userId, navigate = null, doneSummary = {}) {
    const list = [];
    // 🎉 doneSummary = { run: agenda.todayRunDone, strength: agenda.todayStrengthDone }
    //    完成慶祝動畫要顯示「真實數據」，所以在這裡把摘要一起帶進每個 item。
    const runDone = doneSummary.run || null;
    const strengthDone = doneSummary.strength || null;

    if (cell?.strength) {
        list.push({
            key: 'strength', Icon: Dumbbell,
            label: zhFocus(cell.strength),
            sub: '重訓',
            done: !!cell.strength.done,
            cta: '去訓練',
            go: () => navigate?.('/luxury-plan-view-mobile'),
            celebrationStats: strengthDone ? {
                volumeKg: strengthDone.volumeKg,
                sets: strengthDone.sets,
                durationSec: strengthDone.durationSec,
            } : {},
        });
    }
    if (cell?.run) {
        const km = parseFloat(cell.run.distance_km ?? cell.run.distanceKm ?? 0) || null;
        list.push({
            key: 'run', Icon: Activity,
            // 🏷️ 標題單一真相源：一律走 titleForRun()（它已經內含里程前綴）。
            //    以前這裡自己拼 `${km} 公里 ${title}`，title 改成自帶里程後
            //    就變成「3.6 公里 3.6 公里 輕鬆跑」。UI 不准再自己接前綴。
            label: titleForRun(cell.run.subtype || cell.run.type, km) || cell.run.title || '今日跑步',
            sub: '跑步',
            done: cell.run.status === 'completed',
            cta: '去跑步',
            go: () => navigate?.('/cardio-tracker-mobile'),
            celebrationStats: runDone ? {
                distanceKm: runDone.distanceKm,
                durationSec: runDone.durationSec,
                paceSec: runDone.paceSec,
            } : {},
        });
    }

    // 🥗 記錄飲食 — 每天都有的打卡點（與主頁議程同一判定；套 6 點日界線）
    let nutriDone = false;
    let nutriStats = {};
    try {
        const log = uStorage(userId).get('nutrition_log', []) || [];
        const today = logicalDayKey(new Date());
        const todayMeals = (Array.isArray(log) ? log : []).filter(
            (e) => logicalDayKey(e?.date || e?.timestamp || '') === today
        );
        const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
        const hasMeals = todayMeals.length > 0;

        /* 🩹 2026-08 稽核：原本是 `nutriDone = todayMeals.length > 0` ——
           記一筆熱量 0 的餐也算「今天的營養完成了」。
           改成與重訓/跑步同一套門檻：已記錄熱量要達到目標的 80%。
           取不到目標熱量時（還沒設定營養目標）退回舊行為，
           不然沒設目標的人會永遠打不了勾。 */
        const kcal = Math.round(todayMeals.reduce((s, e) => s + n(e?.calories ?? e?.kcal), 0));
        let targetKcal = 0;
        try {
            const goals = uStorage(userId).get('nutrition_goals', null);
            targetKcal = n(goals?.target_calories ?? goals?.targetCalories ?? goals?.calories);
        } catch { /* 讀不到就當沒設定 */ }

        const ratio = targetKcal > 0 ? kcal / targetKcal : null;
        nutriDone = ratio == null ? hasMeals : (hasMeals && ratio >= NUTRITION_DONE_THRESHOLD);

        if (hasMeals) {
            nutriStats = {
                calories: kcal,
                protein: Math.round(todayMeals.reduce((s, e) => s + n(e?.protein), 0)),
                meals: todayMeals.length,
                pct: ratio == null ? null : Math.max(0, Math.min(100, Math.round(ratio * 100))),
                targetCalories: targetKcal || null,
            };
        }
    } catch { /* */ }
    list.push({
        key: 'nutrition', Icon: UtensilsCrossed,
        label: '記錄今天的飲食',
        sub: '營養',
        done: nutriDone,
        cta: '去記錄',
        go: () => navigate?.('/nutrition-mobile'),
        celebrationStats: nutriStats,
    });

    // 🗓️ 週期事件（InBody 每 2 週 / 週日回顧 / 月初月報）— 時間到自動加入清單
    try {
        const periodic = getPeriodicCheckinItems(userId, navigate);
        periodic.forEach((p) => list.push({ ...p, Icon: p.key === 'inbody' ? HeartPulse : CalendarCheck }));
    } catch { /* 週期引擎失敗不影響基本三項 */ }

    return list;
}

export default function DailyCheckinPanel({ open, onClose, cell, userId, navigate }) {
    // ── 今天的目標清單（與主頁呼吸燈共用 getTodayCheckinItems → 狀態永遠一致）──
    const items = useMemo(
        () => (open ? getTodayCheckinItems(cell, userId, navigate) : []),
        [open, cell, userId, navigate]
    );

    const doneCount = items.filter((i) => i.done).length;
    const total = items.length;
    const isRestDay = !cell?.strength && !cell?.run;

    // ══════════════════════════════════════════════════════════════════════
    // ✨ 任務完成的那一刻 → 播一段精緻動畫（三拍，≤2.2s）
    //
    // 使用者要求：「做完一項運動…或者是紀錄飲食之後，反正就是每日任務之後，
    //   都會有一段特別的精緻的動畫去顯示說你今天的這項任務已達成，
    //   而且會顯示你達成的簡易數據。」
    //
    // 偵測方式：記住上一輪各項的 done 狀態，任一項 false → true 就觸發。
    //   （元件內另有 per-user + 日期 + 任務 key 的去重，重開 app 不會重播。）
    // ══════════════════════════════════════════════════════════════════════
    const [celebrate, setCelebrate] = useState(null);
    const prevDoneRef = React.useRef(null);
    const todayKey = logicalDayKey();

    useEffect(() => {
        if (!open) return;
        const snapshot = {};
        items.forEach((i) => { snapshot[i.key] = !!i.done; });

        const prev = prevDoneRef.current;
        if (prev) {
            const justDone = items.find((i) => i.done && prev[i.key] === false);
            if (justDone && !hasCelebratedTask(userId, todayKey, justDone.key)) {
                setCelebrate({
                    kind: justDone.key,            // run / strength / nutrition / inbody
                    taskKey: justDone.key,
                    stats: justDone.celebrationStats || {},
                });
            }
        }
        prevDoneRef.current = snapshot;
    }, [open, items, userId, todayKey]);

    // ── 激勵標語（依進度動態切換）────────────────────────────
    const headline = total > 0 && doneCount === total
        ? '全數達成。'
        : doneCount > 0
            ? '就差一步。'
            : isRestDay
                ? '今天是恢復日。'
                : '目標已就位。';
    const subline = total > 0 && doneCount === total
        ? '今天的你，贏過昨天的你 — 好好休息，明天再來。'
        : doneCount > 0
            ? `已完成 ${doneCount}/${total} — 把最後一項拿下，今天就完整了。`
            : isRestDay
                ? '恢復也是訓練的一部分 — 記錄好飲食，讓身體把力量長回來。'
                : '每個打勾都是一次兌現。從第一項開始。';

    // ── 🎬 進場節奏（瑞士極簡滿版）──────────────────────────────
    const container = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.16 } } };
    const rise = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 20 } } };

    // ══════════════════════════════════════════════════════════════════════
    // 🎨 時段漸層主題（破曉 / 早晨 / 正午 / 午後 / 黃昏 / 夜晚 / 深夜）
    //
    // 一天七段各有自己的色票，18 點後翻成深色底、文字自動轉淺。
    // 版式完全不動 —— 換的是空氣，不是骨架：大字、髮絲線、編號、CTA
    // 全部照舊，只是每次打開的顏色都不一樣，讓每日打卡有「今天」的感覺。
    // 顏色一律走 A.*，不在這裡寫死，深淺才不會有可讀性破口。
    // ══════════════════════════════════════════════════════════════════════
    const A = useMemo(() => checkinAmbient(logicalNow()), [open]);   // eslint-disable-line react-hooks/exhaustive-deps

    // 完成圈的勾勾在深色主題要用底色（不是白），才不會在淺 accent 上糊掉
    const checkInk = A.dark ? '#161415' : '#FFFFFF';

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    key="daily-checkin"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.24 } }}
                    onClick={onClose}
                    style={{
                        // 🇨🇭 瑞士大膽極簡 × 時段漸層：骨架不變，只換空氣。
                        position: 'fixed', inset: 0, zIndex: 2147483200, overflow: 'hidden',
                        background: A.bg,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        padding: 'calc(env(safe-area-inset-top, 0px) + 30px) 24px calc(env(safe-area-inset-bottom, 0px) + 30px)',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    {/* 時段光暈：一顆很淡的呼吸光，讓漸層不死板 */}
                    <motion.span
                        aria-hidden
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: [0.55, 0.85, 0.55], scale: [0.95, 1.05, 0.95] }}
                        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute', top: '-18%', right: '-22%', width: '78vw', height: '78vw',
                            borderRadius: '50%', background: `radial-gradient(circle, ${A.glow} 0%, transparent 68%)`,
                            pointerEvents: 'none', filter: 'blur(14px)',
                        }}
                    />

                    {/* 頂端一條時段 accent 細線 —— 全頁唯一的硬裝飾 */}
                    <motion.span
                        aria-hidden
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                            background: A.accent, transformOrigin: 'left', pointerEvents: 'none',
                        }}
                    />

                    {/* 關閉鈕（右上，避開靈動島）— 純線條，不加玻璃 */}
                    <motion.button {...pressProps('row')} onClick={onClose} aria-label="關閉"
 style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 18px)', right: 20, width: 34, height: 34, borderRadius: 0, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: A.inkFaint, zIndex: 2 }}>
                        <X size={18} strokeWidth={2} />
                    </motion.button>

                    <motion.div
                        variants={container} initial="hidden" animate="show"
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 460, margin: '0 auto' }}
                    >
                        {/* kicker：短劃 + 日期 + 時段字（瑞士部門標） */}
                        <motion.div variants={rise} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <span aria-hidden style={{ width: 16, height: 1, background: A.inkGhost, display: 'inline-block' }} />
                            <span style={{ ...TYPE.micro, color: A.inkFaint }}>
                                Daily Check-in · {logicalNow().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                            </span>
                            <span aria-hidden style={{ ...TYPE.micro, color: A.accent }}>{A.slotLabel}</span>
                        </motion.div>

                        {/* 大膽標語（滿版 display） */}
                        <motion.h2 variants={rise} style={{ ...TYPE.display, margin: 0, fontSize: 'clamp(2.6rem, 12vw, 3.6rem)', color: A.ink }}>
                            {headline}
                        </motion.h2>
                        <motion.p variants={rise} style={{ ...TYPE.body, margin: '16px 0 0', color: A.inkSoft, maxWidth: 340 }}>
                            {subline}
                        </motion.p>

                        {/* 進度 hairline */}
                        <motion.div variants={rise} style={{ margin: '32px 0 8px', height: 1, background: A.line, overflow: 'hidden' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
                                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                                style={{ height: '100%', background: A.accent }}
                            />
                        </motion.div>

                        {/* 目標清單（玻璃列，保留去訓練/去記錄/去量測路徑） */}
                        <div style={hairlineList}>
                            {items.map((it, idx) => (
                                <motion.div
                                    key={it.key}
                                    variants={rise}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        paddingTop: 16, paddingBottom: 16,
                                        borderBottom: idx === items.length - 1 ? 'none' : A.hairline,
                                    }}
                                >
                                    {/* 左側編號 —— 雜誌感，不佔色彩預算 */}
                                    <span style={{ ...indexNumber, color: A.inkGhost }}>{String(idx + 1).padStart(2, '0')}</span>
                                    {/* 勾選圈 — 完成自動打勾 */}
                                    <div style={{
                                        width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: it.done ? A.accent : 'transparent',
                                        border: it.done ? 'none' : `1px solid ${A.inkGhost}`,
                                        transition: 'all 0.3s',
                                    }}>
                                        {it.done && <Check size={12} strokeWidth={3} color={checkInk} />}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ ...TYPE.micro, margin: 0, color: A.inkFaint }}>
                                            {it.sub}
                                        </p>
                                        <p style={{
                                            ...TYPE.body, margin: '5px 0 0', fontWeight: 600,
                                            color: it.done ? A.inkFaint : A.ink,
                                            textDecoration: it.done ? 'line-through' : 'none',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {it.label}
                                        </p>
                                    </div>

                                    {/* 未完成 → 明確導引 CTA（保留原路徑） */}
                                    {/* 文字型 CTA —— 全頁只留「勾選圈」一個時段 accent 焦點 */}
                                    {it.done ? (
                                        <span style={{ ...TYPE.micro, flexShrink: 0, color: A.accent }}>完成</span>
                                    ) : (
                                        <motion.button {...pressProps('row')}
 onClick={(e) => { e.stopPropagation(); haptic('medium'); onClose(); it.go(); }}
 style={{ ...textCTA(false), flexShrink: 0, color: A.inkSoft }}
 >
                                            {it.cta}<ChevronRight size={13} strokeWidth={2.4} />
                                        </motion.button>
                                    )}
                                </motion.div>
                            ))}
                        </div>

                        {/* 底部簽名 */}
                        <motion.p variants={rise} style={{ ...TYPE.micro, margin: '32px 0 0', color: A.inkGhost }}>
                            Move with intent<span style={{ color: A.accent }}>.</span>
                        </motion.p>
                    </motion.div>

                    {/* ✨ 任務完成的精緻時刻（三拍 ≤2.2s，每項每天只播一次） */}
                    {celebrate && (
                        <TaskDoneCelebration
                            open
                            userId={userId}
                            dateKey={todayKey}
                            kind={celebrate.kind}
                            taskKey={celebrate.taskKey}
                            stats={celebrate.stats}
                            ambient={A}
                            onClose={() => setCelebrate(null)}
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
