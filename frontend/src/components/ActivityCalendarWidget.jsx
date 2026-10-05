import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '../utils/haptics';
import { toLocalDateKey } from '../utils/localDate';

const cellVariants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 22 } },
};

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.012 } },
};

/**
 * ══════════════════════════════════════════════════════════════
 * ACTIVITY CALENDAR WIDGET — Swiss Editorial "Typographic" Edition
 * ══════════════════════════════════════════════════════════════
 * Featuring Zero-Noise typography, Negative Space aesthetics,
 * Leica-shutter haptic feedback, and watermark reveal animations.
 * ══════════════════════════════════════════════════════════════
 */

const TEXTURES = {
    titaniumMist: 'linear-gradient(135deg, #F6F4F1 0%, #FFFFFF 45%, #E4DED2 50%, #F6F4F1 100%)',
    titaniumPebble: 'linear-gradient(135deg, #BDB2A2 0%, #F6F4F1 45%, #DED9CF 50%, #BDB2A2 100%)',
    titaniumObsidian: 'linear-gradient(135deg, #161415 0%, #323031 45%, #262523 50%, #161415 100%)',
    titaniumCoral: 'linear-gradient(135deg, #FF7A6B 0%, #F95C4B 45%, #D94030 50%, #FF7A6B 100%)',
};

// 🖋️ 瑞士雜誌風：字體排印揭示特效 (Typographic Reveal)
const EditorialStreakReveal = ({ streak, onComplete }) => {
    let keyword = "已記錄";
    if (streak >= 14) {
        keyword = "習慣";
    } else if (streak >= 7) {
        keyword = "心流";
    } else if (streak >= 3) {
        keyword = "節奏";
    }

    return (
        <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
            <motion.div
                initial={{ opacity: 0, scale: 0.8, letterSpacing: '0.05em', filter: 'blur(4px)' }}
                animate={{
                    opacity: [0, 0.18, 0.18, 0],
                    scale: [0.8, 1.1, 1.15, 1.2],
                    letterSpacing: ['0.05em', '0.22em', '0.28em', '0.35em'],
                    filter: ['blur(4px)', 'blur(0px)', 'blur(0px)', 'blur(8px)']
                }}
                transition={{ duration: 2.6, ease: [0.16, 1, 0.3, 1] }}
                onAnimationComplete={onComplete}
                className="absolute text-white font-extralight select-none tracking-widest pointer-events-none"
                style={{
                    fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                    fontSize: '84px',
                    mixBlendMode: 'overlay', // 讓文字與背後的暗色紋理優雅融合
                    lineHeight: 1
                }}
            >
                {keyword}
            </motion.div>
        </div>
    );
};

/* ════════════════════════════════════════════════════════════════
   連續登錄的里程碑 —— 每一階都有名字，讓「再撐一天」有具體目標。
   ════════════════════════════════════════════════════════════════ */
const STREAK_MILESTONES = [
    { at: 3,  name: '節奏', line: '連三天，身體開始記住這件事' },
    { at: 7,  name: '心流', line: '整整一週 — 這已經是習慣的雛形' },
    { at: 14, name: '習慣', line: '兩週不間斷，你不再需要說服自己' },
    { at: 30, name: '本能', line: '一個月。現在是你的身體在要求你動' },
    { at: 60, name: '身份', line: '兩個月 — 你不是在跑步，你是跑者' },
    { at: 100,name: '傳說', line: '一百天。這已經不必解釋了' },
];

const nextMilestone = (streak) =>
    STREAK_MILESTONES.find((m) => m.at > streak) || null;
const currentMilestone = (streak) =>
    [...STREAK_MILESTONES].reverse().find((m) => m.at <= streak) || null;

/* ════════════════════════════════════════════════════════════════
   StreakBanner —— 連續 / 中斷 兩種狀態都要有回饋。
     · 連續中：火焰 + 大數字 + 進度條 + 「還差 N 天到 XX」
     · 中斷中：不責備，只給「今天就能重開」＋ 歷史最佳當目標
   ════════════════════════════════════════════════════════════════ */
const StreakBanner = ({ streak, bestStreak, loggedToday, milestone, upcoming, toGo }) => {
    const alive = streak > 0;
    const prevAt = milestone?.at || 0;
    const span = upcoming ? upcoming.at - prevAt : 1;
    const progress = upcoming ? Math.min(1, (streak - prevAt) / span) : 1;

    /* 沒有連續中的串 → 整條不出現。
       「從今天重新開始 / 記錄第一天」那一行跟下面的月曆講的是同一件事（今天還沒動），
       多一條就多一段要讀的字。月曆本身就是行動入口。 */
    if (!alive) return null;

    return (
        <div className="relative z-10 mb-5">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-[18px] px-4 py-3.5 relative overflow-hidden"
                style={{
                    background: alive
                        ? 'linear-gradient(135deg, rgba(249,92,75,0.16) 0%, rgba(249,92,75,0.05) 60%, rgba(255,255,255,0.02) 100%)'
                        : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${alive ? 'rgba(249,92,75,0.30)' : 'rgba(255,255,255,0.10)'}`,
                }}
            >
                {/* 連續中 → 底層有一層緩慢流動的暖光 */}
                {alive && (
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ backgroundPosition: ['0% 50%', '200% 50%'] }}
                        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                        style={{
                            background: 'linear-gradient(100deg, transparent 30%, rgba(255,154,107,0.14) 48%, transparent 66%)',
                            backgroundSize: '200% 100%',
                        }}
                    />
                )}

                <div className="relative flex items-center gap-3.5">
                    {/* 火焰 / 餘燼 */}
                    <motion.div
                        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                        animate={alive ? { scale: [1, 1.07, 1] } : {}}
                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                            background: alive
                                ? 'radial-gradient(circle at 50% 65%, #FF9A6B 0%, #F95C4B 55%, #D94030 100%)'
                                : 'rgba(255,255,255,0.06)',
                            boxShadow: alive ? '0 0 18px rgba(249,92,75,0.5)' : 'none',
                            border: alive ? 'none' : '1px dashed rgba(255,255,255,0.20)',
                        }}
                    >
                        <span style={{ fontSize: 17, filter: alive ? 'none' : 'grayscale(1)', opacity: alive ? 1 : 0.45 }}>
                            {alive ? '🔥' : '🌱'}
                        </span>
                    </motion.div>

                    <div className="flex-1 min-w-0">
                        {alive ? (
                            <>
                                <div className="flex items-baseline gap-1.5">
                                    <motion.span
                                        key={streak}
                                        initial={{ opacity: 0, y: 8, scale: 0.85 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                                        className="text-[28px] font-light leading-none text-[#F6F4F1] tabular-nums"
                                        style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}
                                    >
                                        {streak}
                                    </motion.span>
                                    <span className="text-[12px] font-black tracking-[0.2em] text-white/45">
                                        天連續
                                    </span>
                                    {milestone && (
                                        <span
                                            className="ml-1 text-[9px] font-black tracking-[0.16em] px-1.5 py-[2px] rounded-full"
                                            style={{ background: 'rgba(249,92,75,0.20)', color: '#FFB4A2', border: '1px solid rgba(249,92,75,0.35)' }}
                                        >
                                            {milestone.name}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] mt-1.5 leading-snug text-white/50">
                                    {loggedToday
                                        ? (upcoming ? `今天已記錄 · 再 ${toGo} 天達成「${upcoming.name}」` : '今天已記錄 · 你已經在最高階了')
                                        : '今天還沒有紀錄 — 動一下，這串就不會斷'}
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="text-[15px] font-light leading-none text-[#F6F4F1]"
                                    style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                                    {bestStreak > 0 ? '從今天重新開始' : '記錄第一天'}
                                </div>
                                <p className="text-[11px] mt-1.5 leading-snug text-white/50">
                                    {bestStreak > 0
                                        ? `你最長連續過 ${bestStreak} 天 — 今天動一次，計數就從 1 重新亮起來`
                                        : '完成一次訓練，這裡就會開始燒起來'}
                                </p>
                            </>
                        )}
                    </div>

                    {/* 最佳紀錄 */}
                    {bestStreak > 0 && (
                        <div className="shrink-0 text-right">
                            <div className="text-[12px] font-black tracking-[0.04em] text-white/30">最佳</div>
                            <div className="text-[15px] font-light text-white/70 tabular-nums leading-none mt-0.5"
                                style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                                {bestStreak}
                            </div>
                        </div>
                    )}
                </div>

                {/* 下一個里程碑進度條 */}
                {alive && upcoming && (
                    <div className="relative mt-3">
                        <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                            <motion.div
                                className="h-full rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${progress * 100}%` }}
                                transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                style={{ background: 'linear-gradient(90deg, #F95C4B, #FF9A6B)', boxShadow: '0 0 8px rgba(249,92,75,0.6)' }}
                            />
                        </div>
                        <div className="flex justify-between mt-1.5">
                            <span className="text-[12px] font-black tracking-[0.14em] text-white/28 tabular-nums">{streak} 天</span>
                            <span className="text-[12px] font-black tracking-[0.14em] text-white/40">
                                {upcoming.at} 天 · {upcoming.name}
                            </span>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

/* 里程碑達成的一次性爆點 —— 火花 + 那一階的名字與句子 */
const MilestoneBurst = ({ milestone }) => (
    <motion.div
        className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ background: 'radial-gradient(circle at 50% 45%, rgba(22,20,21,0.82) 0%, rgba(22,20,21,0.94) 70%)' }}
    >
        {/* 放射火花 */}
        {Array.from({ length: 14 }).map((_, i) => {
            const angle = (i / 14) * Math.PI * 2;
            return (
                <motion.span
                    key={i}
                    className="absolute rounded-full"
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                    animate={{
                        x: Math.cos(angle) * 110,
                        y: Math.sin(angle) * 78,
                        opacity: [0, 1, 0],
                        scale: [0, 1, 0.4],
                    }}
                    transition={{ duration: 1.5, delay: 0.1 + i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                    style={{ width: 4, height: 4, background: i % 3 === 0 ? '#FFB4A2' : '#F95C4B', boxShadow: '0 0 8px rgba(249,92,75,0.9)' }}
                />
            );
        })}

        <motion.div
            initial={{ scale: 0.7, opacity: 0, filter: 'blur(8px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className="text-center"
        >
            <div className="text-[12px] font-black tracking-[0.34em] text-[#F95C4B] mb-2">
                {milestone.at} 天連續達成
            </div>
            <div
                className="text-[46px] font-extralight text-[#F6F4F1] leading-none"
                style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', letterSpacing: '0.14em' }}
            >
                {milestone.name}
            </div>
            <div className="text-[11px] text-white/55 mt-3 leading-snug">{milestone.line}</div>
        </motion.div>
    </motion.div>
);

const ActivityCalendarWidget = ({ trainingData = [], cardioData = [], currentMonth = new Date() }) => {
    const [showEasterEgg, setShowEasterEgg] = useState(false);
    const [milestoneBurst, setMilestoneBurst] = useState(null);
    const [todayClaimed, setTodayClaimed] = useState(() => {
        return localStorage.getItem('calendar_daily_claimed') === new Date().toDateString();
    });

    // 1. Generate Calendar Grid for the current month
    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const grid = [];

        for (let i = 0; i < startOffset; i++) grid.push({ empty: true });
        for (let day = 1; day <= daysInMonth; day++) {
            const y = year;
            const m = String(month + 1).padStart(2, '0');
            const d = String(day).padStart(2, '0');
            grid.push({ empty: false, dateNumber: day, isoDate: `${y}-${m}-${d}` });
        }
        const trailingDays = (7 - (grid.length % 7)) % 7;
        for (let i = 0; i < trailingDays; i++) grid.push({ empty: true });
        return grid;
    }, [currentMonth]);

    // 2. Map training/cardio data
    const activityMap = useMemo(() => {
        const map = {};
        const toDateKey = (raw) => raw ? String(raw).slice(0, 10) : null;

        trainingData.forEach(session => {
            const date = toDateKey(session.date || session.timestamp || session.created_at);
            if (!date) return;
            if (!map[date]) map[date] = { strengthVolume: 0, cardioVolume: 0 };
            map[date].strengthVolume += 1;
        });

        cardioData.forEach(session => {
            const date = toDateKey(session.date || session.created_at || session.timestamp);
            if (!date) return;
            if (!map[date]) map[date] = { strengthVolume: 0, cardioVolume: 0 };
            map[date].cardioVolume += 1;
        });

        Object.keys(map).forEach(key => {
            const d = map[key];
            if (d.strengthVolume && d.cardioVolume) d.type = 'both';
            else if (d.strengthVolume) d.type = 'strength';
            else if (d.cardioVolume) d.type = 'cardio';
        });
        return map;
    }, [trainingData, cardioData]);

    // 3. 計算目前的連擊天數 (Streak)
    const currentStreak = useMemo(() => {
        let streak = 0;
        let curr = new Date();

        // 從今天開始往前算，如果今天或昨天有紀錄就開始累加
        let keyToday = toLocalDateKey(curr);
        if (activityMap[keyToday]) {
            streak++;
            curr.setDate(curr.getDate() - 1);
        } else {
            curr.setDate(curr.getDate() - 1);
        }

        while (true) {
            let k = toLocalDateKey(curr);
            if (activityMap[k]) {
                streak++;
                curr.setDate(curr.getDate() - 1);
            } else {
                break;
            }
        }
        // ✅ 誠實回傳真實連擊數：無紀錄時為 0（UI 顯示新手引導，而非造假的 7 天）。
        //    把彩蛋留給真實達標的 3 / 7 / 14 天，避免數據可信度崩盤。
        return streak;
    }, [activityMap]);

    // ── 今天有沒有紀錄 / 歷史最佳連擊 ──────────────────────────────
    const todayKey = toLocalDateKey(new Date());
    const loggedToday = !!activityMap[todayKey];

    const bestStreak = useMemo(() => {
        const keys = Object.keys(activityMap).sort();
        let best = 0, run = 0, prev = null;
        keys.forEach((k) => {
            const d = new Date(`${k}T00:00:00`);
            if (prev && (d - prev) / 86400000 === 1) run += 1;
            else run = 1;
            prev = d;
            if (run > best) best = run;
        });
        return best;
    }, [activityMap]);

    // 「連續中」的日期集合 — 用來畫火線與光暈（只有現行連擊會發光）
    const streakDays = useMemo(() => {
        const set = new Set();
        if (currentStreak <= 0) return set;
        const cur = new Date();
        if (!activityMap[toLocalDateKey(cur)]) cur.setDate(cur.getDate() - 1);
        for (let i = 0; i < currentStreak; i++) {
            set.add(toLocalDateKey(cur));
            cur.setDate(cur.getDate() - 1);
        }
        return set;
    }, [activityMap, currentStreak]);

    const milestone = currentMilestone(currentStreak);
    const upcoming = nextMilestone(currentStreak);
    const toGo = upcoming ? upcoming.at - currentStreak : 0;

    // 里程碑達成 → 只慶祝一次（記在 localStorage，換裝置重跑也不會洗版）
    useEffect(() => {
        if (!milestone) return;
        const seenKey = `drvn_streak_milestone_${milestone.at}`;
        if (localStorage.getItem(seenKey)) return;
        localStorage.setItem(seenKey, '1');
        setMilestoneBurst(milestone);
        const t = setTimeout(() => setMilestoneBurst(null), 3200);
        return () => clearTimeout(t);
    }, [milestone?.at]);

    const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    return (
        <div className="w-full p-6 rounded-[28px] shadow-2xl relative overflow-hidden select-none"
            style={{
                // 鈦金屬曜石深板漸層（取代死黑），與全 App 深色卡一致
                background: 'linear-gradient(150deg, #2A2724 0%, #1A1718 45%, #161415 70%, #100E0F 100%)',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 8px rgba(0,0,0,0.5)'
            }}>

            {/* 🏗 拉絲鈦金屬紋理（11.jpeg）— 低透明度 luminosity 混合，只取金屬反光不染色 */}
            <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: "url('/desktop/11.jpeg')",
                backgroundSize: 'cover', backgroundPosition: 'center',
                opacity: 0.18, mixBlendMode: 'luminosity', zIndex: 0,
            }} />
            {/* 斜向高光掃過 */}
            <div className="absolute inset-0 pointer-events-none" style={{
                background: 'linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0.01) 50%, transparent 62%)',
                zIndex: 0,
            }} />

            {/* 後方巨大的瑞士排版字體特效 */}
            <AnimatePresence>
                {showEasterEgg && currentStreak > 0 && (
                    <EditorialStreakReveal streak={currentStreak} onComplete={() => setShowEasterEgg(false)} />
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex justify-between items-center mb-4 px-1 relative z-10">
                <span className="text-[14px] font-light uppercase tracking-[0.3em] text-[#F6F4F1]"
                    style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                    {currentMonth.toLocaleString('en-US', { month: 'long' })}
                </span>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-none" style={{ background: '#F95C4B' }} />
                        <span className="text-[9px] font-mono font-black tracking-[0.2em] text-white/40 uppercase">Run</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-none" style={{ background: '#F6F4F1' }} />
                        <span className="text-[9px] font-mono font-black tracking-[0.2em] text-white/40 uppercase">Gym</span>
                    </div>
                </div>
            </div>

            {/* 金色/曜石分割線 */}
            <div className="relative z-10" style={{
                height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(212,175,106,0.25), transparent)',
                marginBottom: '16px',
            }} />

            {/* ══════════════════════════════════════════════════════════
                連續登錄狀態列 —— 連續中 / 中斷中 都有各自的回饋。
                連續 → 火焰 + 距離下一個里程碑還差幾天（給下一個小目標）
                中斷 → 不指責，只給「今天就能重開」的明確一步 + 歷史最佳
                ══════════════════════════════════════════════════════ */}
            <StreakBanner
                streak={currentStreak}
                bestStreak={bestStreak}
                loggedToday={loggedToday}
                milestone={milestone}
                upcoming={upcoming}
                toGo={toGo}
            />

            {/* 里程碑達成爆點 */}
            <AnimatePresence>
                {milestoneBurst && <MilestoneBurst milestone={milestoneBurst} />}
            </AnimatePresence>

            {/* Grid Days Header */}
            <div className="grid grid-cols-7 gap-y-4 gap-x-2 relative z-10">
                {daysOfWeek.map((day, i) => (
                    <div key={i} className="flex justify-center mb-2">
                        <span className="text-[9px] font-mono font-black tracking-widest text-white/20">{day}</span>
                    </div>
                ))}
            </div>

            {/* Calendar Cells */}
            <motion.div
                className="grid grid-cols-7 gap-y-4 gap-x-2 relative z-10"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {calendarDays.map((cell, idx) => {
                    if (cell.empty) return (
                        <motion.div key={idx} className="aspect-square" variants={cellVariants} />
                    );

                    const today = todayKey;
                    const isToday = cell.isoDate === today;
                    const type = activityMap[cell.isoDate]?.type || 'none';

                    // ── 連續狀態：這一格是否屬於「現行連擊」，以及右邊那一天是否接得上 ──
                    const inStreak = streakDays.has(cell.isoDate);
                    const nextCell = calendarDays[idx + 1];
                    const isRowEnd = (idx + 1) % 7 === 0;
                    const linkRight =
                        inStreak && !isRowEnd && nextCell && !nextCell.empty &&
                        streakDays.has(nextCell.isoDate);
                    // 今天還沒打卡 → 這一格要「呼吸」，把人拉回來
                    const awaitingToday = isToday && !loggedToday;

                    let bg = 'rgba(255,255,255,0.03)';
                    let color = 'rgba(255,255,255,0.2)';
                    let texture = 'none';

                    if (type === 'cardio') {
                        bg = TEXTURES.titaniumCoral;
                        color = '#FFFFFF';
                        texture = 'url("https://www.transparenttextures.com/patterns/brushed-alum.png")';
                    } else if (type === 'strength') {
                        bg = TEXTURES.titaniumMist;
                        color = '#161415';
                        texture = 'url("https://www.transparenttextures.com/patterns/brushed-alum.png")';
                    } else if (type === 'both') {
                        bg = 'linear-gradient(135deg, #F95C4B 50%, #F6F4F1 50%)';
                        color = '#FFFFFF';
                        texture = 'url("https://www.transparenttextures.com/patterns/brushed-alum.png")';
                    }

                    const hasRun = type === 'cardio' || type === 'both';
                    const hasGym = type === 'strength' || type === 'both';

                    // 瑞士雜誌外框：用外層的細鈦金屬線框 (Fine Titanium Wireframe) 展現打卡與連擊狀態
                    let outerBorder = '1px solid transparent';
                    let outerShadow = 'none';

                    if (isToday && currentStreak > 0) {
                        if (todayClaimed) {
                            // 已打卡：高光澤亮鈦金屬細線框
                            outerBorder = '1px solid #E4DED2';
                            outerShadow = '0 0 12px rgba(228,222,210,0.25), inset 0 0 0 1px rgba(255,255,255,0.2)';
                        } else {
                            // 未打卡：霧面石灰鈦金屬細線框
                            outerBorder = '1px solid rgba(207,198,184,0.65)';
                            outerShadow = '0 0 8px rgba(207,198,184,0.15)';
                        }
                    } else if (isToday) {
                        outerBorder = '1px solid rgba(255,255,255,0.15)';
                    }

                    return (
                        <motion.div key={idx} variants={cellVariants}
                            className="flex flex-col items-center justify-center relative h-10 w-full z-10">

                            {/* 🔥 連擊火線 —— 把相鄰的連續日「接起來」，一眼看出這串有多長。
                                幾何：圓圈半徑 14px、格間距 8px → 線長 = 100% - 20px */}
                            {linkRight && (
                                <motion.div
                                    className="absolute pointer-events-none"
                                    initial={{ scaleX: 0, opacity: 0 }}
                                    animate={{ scaleX: 1, opacity: 1 }}
                                    transition={{ duration: 0.45, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                    style={{
                                        top: '50%',
                                        left: 'calc(50% + 14px)',
                                        width: 'calc(100% - 20px)',
                                        height: 2,
                                        marginTop: -1,
                                        transformOrigin: 'left center',
                                        background: 'linear-gradient(90deg, #F95C4B, #FF9A6B)',
                                        boxShadow: '0 0 6px rgba(249,92,75,0.7)',
                                        borderRadius: 2,
                                        zIndex: 5,
                                    }}
                                />
                            )}

                            {/* ✨ 連擊光暈 —— 屬於現行連擊的日子會持續呼吸，形成一條發光的鏈 */}
                            {inStreak && (
                                <motion.div
                                    className="absolute pointer-events-none rounded-full"
                                    animate={{ opacity: [0.25, 0.55, 0.25], scale: [1, 1.14, 1] }}
                                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: (idx % 7) * 0.12 }}
                                    style={{
                                        width: 30, height: 30,
                                        background: 'radial-gradient(circle, rgba(249,92,75,0.55) 0%, transparent 68%)',
                                        zIndex: 1,
                                    }}
                                />
                            )}

                            {/* ⏳ 今天還沒打卡 —— 虛線環呼吸，明確指出「就差你這一下」 */}
                            {awaitingToday && (
                                <motion.div
                                    className="absolute pointer-events-none rounded-full"
                                    animate={{ scale: [1, 1.22, 1], opacity: [0.75, 0.3, 0.75] }}
                                    transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                                    style={{
                                        width: 32, height: 32,
                                        border: `1.5px dashed ${currentStreak > 0 ? '#F95C4B' : 'rgba(207,198,184,0.8)'}`,
                                        zIndex: 6,
                                    }}
                                />
                            )}

                            <motion.div
                                className="absolute inset-0 flex items-center justify-center transition-all"
                                style={{
                                    border: outerBorder,
                                    boxShadow: outerShadow,
                                    borderRadius: '8px', // 外部採用微方角的秩序感
                                    cursor: (isToday && currentStreak > 0) ? 'pointer' : 'default',
                                    backgroundColor: (isToday && todayClaimed) ? 'rgba(228,222,210,0.05)' : 'transparent'
                                }}
                                whileTap={(isToday && currentStreak > 0) ? { scale: 0.93 } : {}}
                                onClick={() => {
                                    if (isToday && currentStreak > 0) {
                                        // 俐落乾淨的 Leica 快門觸覺回饋
                                        haptic('light');
                                        setShowEasterEgg(true);
                                        if (!todayClaimed) {
                                            setTodayClaimed(true);
                                            localStorage.setItem('calendar_daily_claimed', new Date().toDateString());
                                        }
                                    }
                                }}
                            >
                                {/* 🟢 核心：內部圓圈，完全保留原本的顏色邏輯與材質樣式 */}
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center relative overflow-hidden shadow-sm"
                                    style={{
                                        background: bg,
                                        boxShadow: type !== 'none' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
                                    }}
                                >
                                    {/* Brushed texture overlay */}
                                    {type !== 'none' && (
                                        <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay"
                                            style={{ backgroundImage: texture }} />
                                    )}

                                    {/* Specular sheen */}
                                    {type !== 'none' && (
                                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none" />
                                    )}

                                    <span className="text-[11px] font-medium z-10 relative"
                                        style={{ color, fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                                        {cell.dateNumber}
                                    </span>
                                </div>

                                {/* 右上角雜誌編排感導覽縮寫 */}
                                {isToday && todayClaimed && (
                                    <span
                                        className="absolute -top-1 -right-1 text-[11px] font-bold tracking-tighter text-[#F95C4B] bg-[#161415] px-0.5 rounded-none"
                                        style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}
                                    >
                                        stk
                                    </span>
                                )}
                            </motion.div>

                            {/* 跑步/健身紀錄精緻小點 */}
                            <div className="absolute bottom-0 flex gap-1 pointer-events-none">
                                {hasRun && <div className="w-[3px] h-[3px] bg-[#F95C4B] rounded-none shadow-2xs" />}
                                {hasGym && <div className="w-[3px] h-[3px] bg-[#F6F4F1] rounded-none opacity-80 shadow-2xs" />}
                            </div>

                        </motion.div>
                    );
                })}
            </motion.div>
        </div>
    );
};

export default ActivityCalendarWidget;
