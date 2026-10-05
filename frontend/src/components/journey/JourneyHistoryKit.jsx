import React, { useMemo, useState, useEffect, useRef } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { SWISS, TYPE } from '../../utils/swissUI';
import { fmtClock, fmtPace } from '../../utils/journeyHistory';
import { hexA } from '../../utils/checkinAmbient';

// ══════════════════════════════════════════════════════════════════════════
// 📜 JourneyHistoryKit — 進化日誌的互動元件組
//
// 使用者要求：「與其用純數據顯示，不如用多一點互動和圖表，加上 motion。」
//
// 設計立場：互動不是裝飾，是「讓人願意多看三十秒」的手段。
//   • 熱力圖可點 → 點下去看那天做了什麼（回顧的核心動作）
//   • 里程碑可展開 → 已達成的看日期，未達成的看還差多少
//   • 時間軸可展開 → 每一筆的細節
//   • 趨勢圖可拖曳 → 掃過去看每一天
// motion 一律走 swissUI 的節奏，跟慶祝動畫同一套語言。
// ══════════════════════════════════════════════════════════════════════════

const EASE = [0.16, 1, 0.3, 1];
const KIND_COLOR = {
    run: SWISS.coral,
    strength: '#161415',
    inbody: '#5481D4',
};
const KIND_ZH = { run: '跑步', strength: '重訓', inbody: '身體數據' };

const prefersReduced = () => {
    try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; }
    catch { return false; }
};

// ── 數字滾動（共用） ───────────────────────────────────────────────
export const Rolling = ({ to = 0, decimals = 0, duration = 1.1, delay = 0 }) => {
    const target = Number(to) || 0;
    const [v, setV] = useState(() => (prefersReduced() ? target : 0));
    useEffect(() => {
        if (prefersReduced() || !(target > 0)) { setV(target); return; }
        let raf, start = null;
        const ms = duration * 1000;
        const tick = (now) => {
            if (start == null) start = now + delay * 1000;
            const p = Math.min(1, Math.max(0, (now - start) / ms));
            setV(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => raf && cancelAnimationFrame(raf);
    }, [target, duration, delay]);
    return <>{decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString()}</>;
};

// ── 捲到可視範圍才播（回顧頁很長，一次全播會很吵）────────────────
const Reveal = ({ children, delay = 0, y = 14 }) => (
    <motion.div
        initial={{ opacity: 0, y: prefersReduced() ? 0 : y }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.55, ease: EASE, delay }}
    >
        {children}
    </motion.div>
);
export { Reveal };

// ══════════════════════════════════════════════════════════════════════════
// 🔥 ActivityHeatmap — 出席熱力圖（可點）
//
// 這是整個回顧系統最有情感重量的一張圖：
// 一格一天，密密麻麻的格子就是「你真的來過這麼多次」的證據。
// 點任一格 → 展開那天做了什麼。
// ══════════════════════════════════════════════════════════════════════════
export const ActivityHeatmap = ({ heatmap, onPickDay }) => {
    const [picked, setPicked] = useState(null);
    const weeks = heatmap?.weeks || [];
    const total = weeks.flat().filter((d) => d.level > 0).length;

    const cellBg = (d) => {
        if (d.isFuture) return 'transparent';
        if (d.level === 0) return 'rgba(22,20,21,0.055)';
        const kinds = new Set(d.events.map((e) => e.kind));
        // 同一天既跑步又重訓 → 用 Coral（那天最值得被看見）
        if (kinds.size > 1) return SWISS.coral;
        const only = [...kinds][0];
        if (only === 'run') return 'rgba(249,92,75,0.55)';
        if (only === 'strength') return 'rgba(22,20,21,0.62)';
        return 'rgba(84,129,212,0.55)';
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.40)' }}>出席紀錄 · 近 20 週</span>
                <span style={{ ...TYPE.micro, color: SWISS.coral }}>{total} 天有出現</span>
            </div>

            {/* 格子牆 */}
            <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 4 }} className="no-scrollbar">
                {weeks.map((col, ci) => (
                    <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {col.map((d) => (
                            <motion.button
                                key={d.dayKey}
                                className="micro-target"
                                aria-label={`${d.dayKey}${d.level > 0 ? ` 有 ${d.events.length} 筆紀錄` : ' 無紀錄'}`}
                                onClick={() => {
                                    if (d.level === 0 || d.isFuture) return;
                                    setPicked(picked?.dayKey === d.dayKey ? null : d);
                                    onPickDay?.(d);
                                }}
                                initial={{ opacity: 0, scale: prefersReduced() ? 1 : 0.4 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.35, ease: EASE, delay: Math.min(0.5, ci * 0.012) }}
                                whileTap={d.level > 0 ? { scale: 1.35 } : undefined}
                                style={{
                                    width: 11, height: 11, borderRadius: 2, border: 'none', padding: 0,
                                    background: cellBg(d),
                                    outline: picked?.dayKey === d.dayKey ? `1.5px solid ${SWISS.ink}` : 'none',
                                    outlineOffset: 1.5,
                                    cursor: d.level > 0 ? 'pointer' : 'default',
                                }}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {/* 點某一天 → 展開那天做了什麼 */}
            <AnimatePresence mode="wait">
                {picked && (
                    <motion.div
                        key={picked.dayKey}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.32, ease: EASE }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ paddingTop: 14, marginTop: 12, borderTop: SWISS.hairline }}>
                            <p style={{ ...TYPE.micro, margin: 0, color: 'rgba(22,20,21,0.40)' }}>
                                {picked.date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                            </p>
                            {picked.events.map((e) => (
                                <div key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 99, background: KIND_COLOR[e.kind], flexShrink: 0 }} />
                                    <span style={{ ...TYPE.body, fontWeight: 600, color: SWISS.ink }}>{e.title}</span>
                                    <span style={{ flex: 1 }} />
                                    {e.metrics.slice(0, 2).map((m) => (
                                        <span key={m.l} style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.42)' }}>
                                            {m.v}{m.u}
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 圖例 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
                {[['run', '跑步'], ['strength', '重訓'], ['inbody', '量測']].map(([k, zh]) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: KIND_COLOR[k], opacity: 0.6 }} />
                        <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.35)' }}>{zh}</span>
                    </span>
                ))}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: SWISS.coral }} />
                    <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.35)' }}>兩種都做</span>
                </span>
            </div>
        </div>
    );
};

// ══════════════════════════════════════════════════════════════════════════
// 🏅 MilestoneWall — 里程碑牆（已達成 + 下一個）
//
// 「下一個還差多少」是這裡的靈魂。
// 只列已達成會讓人停在過去；給下一個門檻，回顧才會變成動力。
// ══════════════════════════════════════════════════════════════════════════
export const MilestoneWall = ({ milestones }) => {
    const [tab, setTab] = useState('next');   // next | achieved
    const { achieved = [], next = [], achievedCount = 0, total = 0 } = milestones || {};
    const list = tab === 'next' ? next : achieved;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.40)' }}>里程碑</span>
                <span style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.40)' }}>
                    <span style={{ color: SWISS.coral }}>{achievedCount}</span> / {total}
                </span>
            </div>

            {/* 分頁：下一個 / 已達成 —— 底線用 layoutId 滑過去 */}
            <div style={{ display: 'flex', gap: 24, borderBottom: SWISS.hairline, marginBottom: 4 }}>
                {[['next', '下一個'], ['achieved', '已達成']].map(([k, label]) => (
                    <motion.button {...pressProps('row')}
 key={k}
 onClick={() => setTab(k)}
 style={{
 position: 'relative', background: 'transparent', border: 'none',
 padding: '0 0 10px', cursor: 'pointer',
 ...TYPE.label, fontSize: 11,
 color: tab === k ? SWISS.ink : 'rgba(22,20,21,0.32)',
 transition: 'color 0.2s',
 }}
 >
                        {label}
                        {tab === k && (
                            <motion.span
                                layoutId="ms-underline"
                                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: SWISS.coral }}
                            />
                        )}
                    </motion.button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: EASE }}
                >
                    {list.length === 0 ? (
                        <p style={{ ...TYPE.body, color: 'rgba(22,20,21,0.38)', padding: '20px 0' }}>
                            {tab === 'next' ? '全部達成了 —— 這句話本身就很不簡單。' : '還沒有已達成的里程碑。第一個永遠是最難的那一個。'}
                        </p>
                    ) : list.map((m, i) => (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, x: prefersReduced() ? 0 : -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05, duration: 0.4, ease: EASE }}
                            style={{ padding: '16px 0', borderBottom: i === list.length - 1 ? 'none' : SWISS.hairline }}
                        >
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                                <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.26)', width: 22, flexShrink: 0 }}>
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...TYPE.body, margin: 0, fontWeight: 600, color: m.achieved ? SWISS.ink : 'rgba(22,20,21,0.72)' }}>
                                        {m.label}
                                    </p>
                                    <p style={{ ...TYPE.micro, margin: '5px 0 0', color: 'rgba(22,20,21,0.32)' }}>
                                        {m.achieved && m.at
                                            ? m.at.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
                                            : m.note}
                                    </p>
                                </div>
                                {m.achieved ? (
                                    <span style={{ ...TYPE.micro, color: SWISS.coral, flexShrink: 0 }}>達成</span>
                                ) : (
                                    <span style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.38)', flexShrink: 0, letterSpacing: '0.12em' }}>
                                        {m.remainText}
                                    </span>
                                )}
                            </div>

                            {/* 未達成 → 真實進度條（不是裝飾，是算出來的） */}
                            {!m.achieved && (
                                <div style={{ marginTop: 10, marginLeft: 34, height: 2, background: 'rgba(22,20,21,0.07)' }}>
                                    <motion.div
                                        initial={{ scaleX: 0 }}
                                        whileInView={{ scaleX: Math.max(0.01, m.progress) }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.9, ease: EASE, delay: 0.1 + i * 0.05 }}
                                        style={{ height: '100%', background: SWISS.coral, transformOrigin: 'left' }}
                                    />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

// ══════════════════════════════════════════════════════════════════════════
// 🕰 HistoryTimeline — 完整歷史時間軸（可展開、可篩選）
//
// 「看看自己所有歷經的努力數據」—— 這是最直接的答案：
// 每一筆紀錄都在，按時間排好，點開看細節。
// ══════════════════════════════════════════════════════════════════════════
export const HistoryTimeline = ({ events = [], filter = 'all', pageSize = 12 }) => {
    const [limit, setLimit] = useState(pageSize);
    const [openId, setOpenId] = useState(null);

    const list = useMemo(
        () => (filter === 'all' ? events : events.filter((e) => e.kind === filter)),
        [events, filter]
    );
    const shown = list.slice(0, limit);

    // 依月份分組 —— 回顧要有「時間的厚度」
    const groups = useMemo(() => {
        const g = [];
        let cur = null;
        for (const e of shown) {
            const key = `${e.date.getFullYear()}/${e.date.getMonth() + 1}`;
            if (!cur || cur.key !== key) { cur = { key, label: `${e.date.getFullYear()} 年 ${e.date.getMonth() + 1} 月`, items: [] }; g.push(cur); }
            cur.items.push(e);
        }
        return g;
    }, [shown]);

    if (list.length === 0) {
        return (
            <p style={{ ...TYPE.body, color: 'rgba(22,20,21,0.38)', padding: '24px 0' }}>
                這個分類還沒有紀錄 —— 完成第一筆之後，它會出現在這裡，然後一直留著。
            </p>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.40)' }}>完整紀錄</span>
                <span style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.40)' }}>共 {list.length} 筆</span>
            </div>

            {groups.map((g) => (
                <div key={g.key} style={{ marginBottom: 8 }}>
                    <p style={{ ...TYPE.micro, margin: '18px 0 2px', color: 'rgba(22,20,21,0.28)' }}>{g.label}</p>
                    {g.items.map((e) => {
                        const open = openId === e.id;
                        return (
                            <div key={e.id} style={{ borderBottom: SWISS.hairline }}>
                                <motion.button {...pressProps('row')}
 onClick={() => setOpenId(open ? null : e.id)}
 style={{
 width: '100%', display: 'flex', alignItems: 'center', gap: 12,
 padding: '15px 0', background: 'transparent', border: 'none',
 cursor: 'pointer', textAlign: 'left',
 }}
 >
                                    <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.30)', width: 34, flexShrink: 0, letterSpacing: '0.08em' }}>
                                        {e.date.getMonth() + 1}/{e.date.getDate()}
                                    </span>
                                    <span style={{ width: 5, height: 5, borderRadius: 99, background: KIND_COLOR[e.kind], flexShrink: 0 }} />
                                    <span style={{ ...TYPE.body, fontWeight: 600, color: SWISS.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {e.title}
                                    </span>
                                    <motion.span
                                        animate={{ rotate: open ? 45 : 0 }}
                                        transition={{ duration: 0.25, ease: EASE }}
                                        style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.30)', flexShrink: 0, fontSize: 14, lineHeight: 1 }}
                                    >
                                        ＋
                                    </motion.span>
                                </motion.button>

                                <AnimatePresence initial={false}>
                                    {open && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: EASE }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            <div style={{ display: 'flex', paddingBottom: 18, paddingLeft: 51 }}>
                                                {e.metrics.map((m, mi) => (
                                                    <div
                                                        key={m.l}
                                                        style={{
                                                            flex: 1, minWidth: 0,
                                                            paddingLeft: mi === 0 ? 0 : 14,
                                                            borderLeft: mi === 0 ? 'none' : SWISS.hairline,
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                                                            <span style={{ ...TYPE.display, fontSize: 22, color: SWISS.ink }}>{m.v}</span>
                                                            {m.u && <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.35)' }}>{m.u}</span>}
                                                        </div>
                                                        <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(22,20,21,0.32)', display: 'block', marginTop: 6 }}>
                                                            {m.l}
                                                        </span>
                                                    </div>
                                                ))}
                                                {e.metrics.length === 0 && (
                                                    <span style={{ ...TYPE.micro, color: 'rgba(22,20,21,0.30)' }}>這筆沒有留下細部數據</span>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            ))}

            {limit < list.length && (
                <motion.button {...pressProps('row')}
 onClick={() => setLimit((v) => v + pageSize)}
 style={{
 width: '100%', marginTop: 20, padding: '14px 0', background: 'transparent',
 border: 'none', borderTop: SWISS.hairline, cursor: 'pointer',
 ...TYPE.label, fontSize: 11, color: 'rgba(22,20,21,0.50)',
 }}
 >
                    再看更早的 {Math.min(pageSize, list.length - limit)} 筆
                </motion.button>
            )}
        </div>
    );
};


// ══════════════════════════════════════════════════════════════════════════
// 🌆 CityLights — 「你來過的每一天」的城市天際線（一個月一排）
//
// 讀法：一天 = 一棟樓。有出現 → 高樓、窗戶亮著、樓下標日；沒出現 → 矮房、暗的。
//   月份寫在排標題，所以樓下只要標日，7px 也讀得到。
//   整排的亮度隨該月出席密度提升 —— 你那個月越常來，那排城市越亮。
//
// 🍂 季度換裝：Q1 冬春（尖頂・冷藍）/ Q2 春夏（平頂・淺膚）
//            Q3 盛夏（階梯頂・銅橘，最亮）/ Q4 秋冬（斜頂・金褐）
//   捲下來會看到城市隨季節換裝 —— 那是「時間真的過去了」最直觀的證據。
//
// 🗼 地標：值得被記住的那幾天不是普通大樓，是認得出來的建築。
//   地標不是裝飾 —— 它讓「那一天」在天際線上一眼就找得到。
//
// 夜色 #08172E / #15253F / #2B3D5B × 燈火 #CC7D51 / #BD9060 / #D9B59D
// ══════════════════════════════════════════════════════════════════════════
const SKY = { deep: '#08172E', mid: '#15253F', near: '#2B3D5B' };
const LIGHT = {
    run: '#CC7D51',        // 銅橘 — 跑步的燈
    strength: '#BD9060',   // 金褐 — 重訓的燈
    inbody: '#D9B59D',     // 淺膚 — 量測的燈
    both: '#FFE3C8',       // 兩種都做 → 最亮的那盞
};
const litColor = (kinds = []) => (kinds.length > 1 ? LIGHT.both : (LIGHT[kinds[0]] || LIGHT.strength));

// 季度：屋頂造型 + 該季主色（建築造型隨季節變）
const SEASON = {
    1: { zh: '冬春', roof: 'spire', tint: '#9FB6D9', body: 'rgba(159,182,217,0.16)' },
    2: { zh: '春夏', roof: 'flat', tint: '#D9B59D', body: 'rgba(217,181,157,0.16)' },
    3: { zh: '盛夏', roof: 'step', tint: '#CC7D51', body: 'rgba(204,125,81,0.18)' },
    4: { zh: '秋冬', roof: 'slope', tint: '#BD9060', body: 'rgba(189,144,96,0.16)' },
};
const ROOF_CLIP = {
    spire: 'polygon(50% 0%, 100% 100%, 0% 100%)',
    slope: 'polygon(100% 0%, 100% 100%, 0% 100%)',
    step: 'polygon(22% 0%, 78% 0%, 78% 45%, 100% 45%, 100% 100%, 0% 100%)',
    flat: null,
};

const LANDMARK_ZH = {
    taipei101: '台北 101',
    eiffel: '艾菲爾鐵塔',
    tokyo: '東京鐵塔',
    bigben: '大笨鐘',
    pisa: '比薩斜塔',
    empire: '帝國大廈',
    pyramid: '吉薩金字塔',
    needle: '太空針塔',
};

// ── 地標剪影（SVG，viewBox 0 0 100 260，底部對齊）─────────────────────
//    只畫輪廓與窗光 —— 剪影要在 20px 寬的時候還認得出來。
const LandmarkShape = ({ type, color, glow, w, h }) => {
    const gid = `lm-${type}`;
    const body = { fill: `url(#${gid})`, stroke: color, strokeWidth: 1.4, strokeOpacity: 0.55 + 0.35 * glow };
    const lamp = { fill: color, opacity: 0.55 + 0.45 * glow };
    return (
        <svg width={w} height={h} viewBox="0 0 100 260" preserveAspectRatio="none"
            style={{ display: 'block', overflow: 'visible', filter: `drop-shadow(0 0 ${5 + 12 * glow}px ${color}88)` }}>
            <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={SKY.deep} stopOpacity={0.88} />
                </linearGradient>
            </defs>

            {type === 'taipei101' && (<>
                <path d="M50 0 L54 34 L46 34 Z" {...body} />
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                    const y = 40 + i * 22;
                    return <path key={i} d={`M32 ${y + 22} L68 ${y + 22} L72 ${y} L28 ${y} Z`} {...body} />;
                })}
                <rect x="22" y="216" width="56" height="44" {...body} />
                {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x="44" y={52 + i * 22} width="12" height="5" {...lamp} />)}
            </>)}

            {type === 'eiffel' && (<>
                <path d="M50 0 L53 40 L47 40 Z" {...body} />
                <path d="M47 40 C 40 110, 28 170, 14 260 L 34 260 C 42 180, 46 110, 50 40 Z" {...body} />
                <path d="M53 40 C 60 110, 72 170, 86 260 L 66 260 C 58 180, 54 110, 50 40 Z" {...body} />
                <rect x="26" y="150" width="48" height="7" {...body} />
                <rect x="16" y="212" width="68" height="7" {...body} />
                <path d="M22 260 Q50 206 78 260" fill="none" stroke={color} strokeWidth="1.6" strokeOpacity={0.45 + 0.35 * glow} />
                {[60, 110, 176].map((y, i) => <rect key={i} x="45" y={y} width="10" height="5" {...lamp} />)}
            </>)}

            {type === 'tokyo' && (<>
                <path d="M50 0 L52 30 L48 30 Z" {...body} />
                <path d="M48 30 L30 260 L44 260 L50 30 Z" {...body} />
                <path d="M52 30 L70 260 L56 260 L50 30 Z" {...body} />
                <rect x="30" y="168" width="40" height="8" {...body} />
                <rect x="20" y="226" width="60" height="8" {...body} />
                {[52, 96, 140, 196].map((y, i) => <rect key={i} x="45" y={y} width="10" height="5" {...lamp} />)}
            </>)}

            {type === 'bigben' && (<>
                <path d="M50 0 L64 46 L36 46 Z" {...body} />
                <rect x="34" y="46" width="32" height="30" {...body} />
                <circle cx="50" cy="98" r="17" fill={SKY.deep} stroke={color} strokeWidth="1.8" strokeOpacity={0.7 + 0.3 * glow} />
                <circle cx="50" cy="98" r="11" {...lamp} />
                <rect x="30" y="122" width="40" height="138" {...body} />
                {[140, 172, 204, 236].map((y, i) => <rect key={i} x="44" y={y} width="12" height="6" {...lamp} />)}
            </>)}

            {type === 'pisa' && (
                // 斜塔：整體傾斜，六層拱廊
                <g transform="rotate(7 50 260)">
                    <rect x="34" y="14" width="32" height="24" {...body} />
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <rect key={i} x="30" y={44 + i * 36} width="40" height="32" {...body} />
                    ))}
                    <rect x="26" y="248" width="48" height="12" {...body} />
                    {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="44" y={56 + i * 36} width="12" height="6" {...lamp} />)}
                </g>
            )}

            {type === 'empire' && (<>
                <path d="M50 0 L52 26 L48 26 Z" {...body} />
                <rect x="42" y="26" width="16" height="34" {...body} />
                <rect x="34" y="60" width="32" height="40" {...body} />
                <rect x="26" y="100" width="48" height="56" {...body} />
                <rect x="16" y="156" width="68" height="104" {...body} />
                {[74, 118, 122, 180, 216].map((y, i) => (
                    <rect key={i} x={i % 2 ? 34 : 44} y={y} width="12" height="5" {...lamp} />
                ))}
            </>)}

            {type === 'pyramid' && (<>
                <path d="M50 44 L96 260 L4 260 Z" {...body} />
                <path d="M50 44 L50 260" stroke={color} strokeWidth="1.2" strokeOpacity={0.35 + 0.3 * glow} fill="none" />
                {[150, 192, 234].map((y, i) => <rect key={i} x="44" y={y} width="12" height="5" {...lamp} />)}
            </>)}

            {type === 'needle' && (<>
                <path d="M50 0 L52 40 L48 40 Z" {...body} />
                {/* 飛碟頂 */}
                <path d="M20 74 L80 74 L64 52 L36 52 Z" {...body} />
                <rect x="18" y="74" width="64" height="9" {...body} />
                {/* 三腳塔身 */}
                <path d="M44 83 L34 260 L44 260 L48 83 Z" {...body} />
                <path d="M56 83 L66 260 L56 260 L52 83 Z" {...body} />
                <rect x="46" y="83" width="8" height="177" {...body} />
                {[0, 1, 2, 3].map((i) => <rect key={i} x={28 + i * 12} y="62" width="8" height="5" {...lamp} />)}
                <rect x="44" y="170" width="12" height="5" {...lamp} />
            </>)}
        </svg>
    );
};

// ── 一個月一排 ─────────────────────────────────────────────────────
const MonthRow = ({ m, onPick, picked }) => {
    const season = SEASON[m.quarter];
    const glow = m.glow;
    const roofClip = ROOF_CLIP[season.roof];
    const H = 84;
    const reduced = prefersReduced();

    return (
        <div style={{ padding: '0 16px', marginBottom: 4 }}>
            {/* 排標題：月份 + 季 + 該月亮了幾天 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ ...TYPE.micro, fontSize: 11, color: m.activeDays ? season.tint : 'rgba(217,181,157,0.28)' }}>
                    {m.label}
                </span>
                <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(217,181,157,0.30)' }}>{season.zh}</span>
                <span style={{ flex: 1, height: 1, background: 'rgba(217,181,157,0.10)' }} />
                <span style={{ ...TYPE.micro, fontSize: 11, color: m.activeDays ? 'rgba(217,181,157,0.55)' : 'rgba(217,181,157,0.22)' }}>
                    {m.activeDays ? `${m.activeDays} 盞` : '沒有燈'}
                </span>
            </div>

            {/* 這個月的天際線 */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: H + 13 }}>
                {m.cells.map((c, i) => {
                    const isLm = !!c.landmark;
                    const on = picked?.dayKey === c.dayKey;
                    const bh = isLm ? H : Math.max(4, Math.round(c.height * H * 0.86));
                    const col = isLm ? LIGHT.both : c.active ? litColor(c.kinds) : null;
                    return (
                        <div key={c.dayKey}
                            style={{ flex: isLm ? 2.4 : 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <motion.button
                                className="micro-target"
                                aria-label={`${m.year}/${m.month}/${c.day}${c.active ? ` 有 ${c.events.length} 筆紀錄` : ' 沒有紀錄'}`}
                                onClick={() => c.active && onPick(on ? null : { ...c, monthLabel: `${m.year} / ${m.label}` })}
                                initial={{ height: reduced ? bh : 0 }}
                                whileInView={{ height: c.isFuture ? 0 : bh }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6, ease: EASE, delay: Math.min(0.35, i * 0.008) }}
                                style={{
                                    width: '100%', padding: 0, border: 'none', background: 'transparent',
                                    cursor: c.active ? 'pointer' : 'default', overflow: 'visible',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                                    outline: on ? `1px solid ${col}` : 'none', outlineOffset: 1.5,
                                }}
                            >
                                {isLm ? (
                                    <LandmarkShape type={c.landmark.type} color={col} glow={Math.max(0.5, glow)} w="100%" h={bh} />
                                ) : (<>
                                    {/* 季度屋頂：造型隨季節換 */}
                                    {roofClip && !c.isFuture && (
                                        <span style={{
                                            width: '100%', height: 6, flexShrink: 0,
                                            clipPath: roofClip, WebkitClipPath: roofClip,
                                            background: c.active ? season.body : 'rgba(217,181,157,0.07)',
                                            borderBottom: 'none',
                                        }} />
                                    )}
                                    <span style={{
                                        width: '100%', flex: 1, minHeight: 0,
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
                                        paddingTop: 3, overflow: 'hidden',
                                        background: c.active
                                            ? `linear-gradient(180deg, ${season.body} 0%, rgba(8,23,46,0.75) 100%)`
                                            : 'rgba(217,181,157,0.06)',
                                        boxShadow: c.active ? `0 0 ${6 + 14 * glow}px ${hexA(col, 0.24 * glow + 0.12)}` : 'none',
                                    }}>
                                        {c.active && Array.from({ length: c.windows }).map((_, wi) => (
                                            <motion.span
                                                key={wi}
                                                initial={{ opacity: 0 }}
                                                whileInView={{ opacity: 0.48 + 0.52 * glow }}
                                                viewport={{ once: true }}
                                                transition={{ duration: 0.4, ease: EASE, delay: Math.min(0.5, i * 0.008) + 0.3 + wi * 0.04 }}
                                                style={{
                                                    width: '58%', height: 2.5, background: col,
                                                    boxShadow: `0 0 4px ${hexA(col, 0.85)}`, flexShrink: 0,
                                                }}
                                            />
                                        ))}
                                    </span>
                                </>)}
                            </motion.button>

                            {/* 樓下標日（月份在排標題）—— 只有亮著的那幾天有名字 */}
                            <span style={{
                                height: 11, marginTop: 2, fontSize: 11, fontWeight: 800, lineHeight: '11px',
                                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                color: !c.active ? 'transparent'
                                    : c.isToday ? LIGHT.both
                                        : isLm ? LIGHT.both : 'rgba(217,181,157,0.62)',
                            }}>
                                {c.active ? c.day : ''}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const CityLights = ({ city, onPickDay }) => {
    const [picked, setPicked] = useState(null);
    const years = city?.years || [];
    const months = city?.months || [];
    const [year, setYear] = useState(() => (years.length ? years[years.length - 1] : null));

    useEffect(() => {
        if (years.length && (year == null || !years.includes(year))) setYear(years[years.length - 1]);
    }, [years, year]);

    const shown = useMemo(() => months.filter((m) => m.year === year), [months, year]);
    const yearActive = useMemo(() => shown.reduce((s, m) => s + m.activeDays, 0), [shown]);

    if (!months.length) return null;

    const pick = (c) => { setPicked(c); if (c) onPickDay?.(c); };

    return (
        <div style={{
            position: 'relative',
            background: `linear-gradient(178deg, ${SKY.deep} 0%, ${SKY.mid} 55%, ${SKY.near} 100%)`,
            overflow: 'hidden', paddingBottom: 4,
        }}>
            {/* 城市上空的光害（越多天越亮） */}
            <div aria-hidden style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(120% 60% at 50% 100%, rgba(204,125,81,${Math.min(0.28, yearActive * 0.004)}) 0%, transparent 70%)`,
                pointerEvents: 'none',
            }} />
            {!prefersReduced() && Array.from({ length: 18 }).map((_, i) => (
                <motion.span key={i} aria-hidden
                    animate={{ opacity: [0.10, 0.34, 0.10] }}
                    transition={{ duration: 3 + (i % 5), repeat: Infinity, ease: 'easeInOut', delay: i * 0.27 }}
                    style={{
                        position: 'absolute', width: 1.5, height: 1.5, borderRadius: 99, background: LIGHT.inbody,
                        left: `${(i * 37) % 96 + 2}%`, top: `${(i * 53) % 88 + 4}%`, pointerEvents: 'none',
                    }}
                />
            ))}

            {/* 年份切換 —— 可以一路跳回第一年 */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 12px', flexWrap: 'wrap' }}>
                {years.map((y) => {
                    const on = y === year;
                    return (
                        <motion.button {...pressProps('row')} key={y} onClick={() => { setYear(y); setPicked(null); }}
 style={{
 padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
 border: `1px solid ${on ? LIGHT.run : 'rgba(217,181,157,0.22)'}`,
 background: on ? hexA(LIGHT.run, 0.18) : 'transparent',
 color: on ? LIGHT.both : 'rgba(217,181,157,0.55)',
 ...TYPE.micro, fontSize: 9, letterSpacing: '0.14em',
 fontVariantNumeric: 'tabular-nums', transition: 'all .2s',
 }}>
                            {y}
                        </motion.button>
                    );
                })}
                <span style={{ flex: 1 }} />
                <span style={{ ...TYPE.micro, fontSize: 11, color: LIGHT.run }}>{yearActive} 盞燈亮著</span>
            </div>

            {/* 一個月一排 */}
            <div style={{ position: 'relative' }}>
                {shown.map((m) => (
                    <MonthRow key={m.key} m={m} onPick={pick} picked={picked} />
                ))}
            </div>

            {/* 點某一棟 → 那天做了什麼 */}
            <AnimatePresence mode="wait">
                {picked && (
                    <motion.div
                        key={picked.dayKey}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        style={{ overflow: 'hidden', position: 'relative' }}
                    >
                        <div style={{ padding: '14px 16px 16px', margin: '10px 0 0', borderTop: '1px solid rgba(217,181,157,0.18)' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                                <p style={{ ...TYPE.micro, fontSize: 11, margin: 0, color: 'rgba(217,181,157,0.55)' }}>
                                    {picked.date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                                </p>
                                {picked.landmark && (
                                    <span style={{ ...TYPE.micro, fontSize: 11, color: LIGHT.both }}>
                                        {LANDMARK_ZH[picked.landmark.type]} · {picked.landmark.title}
                                    </span>
                                )}
                            </div>
                            {picked.events.map((e) => (
                                <div key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
                                    <span style={{ width: 5, height: 5, borderRadius: 99, background: LIGHT[e.kind] || LIGHT.strength, flexShrink: 0 }} />
                                    <span style={{ ...TYPE.body, fontSize: 14, fontWeight: 600, color: '#F6F1EA' }}>{e.title}</span>
                                    <span style={{ flex: 1 }} />
                                    {e.metrics.slice(0, 2).map((mm) => (
                                        <span key={mm.l} style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(217,181,157,0.55)' }}>
                                            {mm.v}{mm.u}
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 圖例 */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px 16px', flexWrap: 'wrap' }}>
                {[['run', '跑步'], ['strength', '重訓'], ['inbody', '量測'], ['both', '兩種都做']].map(([k, zh]) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 3, background: LIGHT[k], boxShadow: `0 0 5px ${hexA(LIGHT[k], 0.85)}` }} />
                        <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(217,181,157,0.45)' }}>{zh}</span>
                    </span>
                ))}
                <span style={{ flex: 1 }} />
                <span style={{ ...TYPE.micro, fontSize: 11, color: 'rgba(217,181,157,0.35)' }}>越多天 · 越亮</span>
            </div>
        </div>
    );
};

export default { ActivityHeatmap, CityLights, MilestoneWall, HistoryTimeline, Rolling, Reveal };
