import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Sparkles, Users, Footprints, ChevronDown } from 'lucide-react';
import { getLatestRunMeta } from '../utils/personalProgress';

/**
 * MonthlyProgressCard — 個人月度進步卡（跟自己比）
 * ──────────────────────────────────────────────────────────────
 * 重點不是贏過誰，而是「你這個月比上個月進步了」。
 * 顯示三個進步指標（里程 / 次數 / 配速）＋一句鼓勵，
 * 若有下一階目標則顯示「距離超越前一名」進度條。
 */

const C = {
    paper: '#161415', black: '#F6F4F1', coral: '#F95C4B',
    stone: '#E4DED2', pebble: '#CFC6B8', up: '#3D6B4F', down: '#B4534B',
};

const fmtPace = (sec) => (sec > 0 ? `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"` : '—');

const DeltaChip = ({ delta, kind }) => {
    const { dir, value } = delta;
    const color = dir === 'up' ? C.up : dir === 'down' ? C.down : C.pebble;
    const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
    let txt = '持平';
    if (dir !== 'flat') {
        if (kind === 'distance') txt = `${dir === 'up' ? '+' : '−'}${value} km`;
        else if (kind === 'count') txt = `${dir === 'up' ? '+' : '−'}${value} 次`;
        else if (kind === 'pace') txt = `快 ${value}s`; // 配速 dir=up 代表變快
        else if (kind === 'volume') txt = `${dir === 'up' ? '+' : '−'}${value >= 1000 ? (value / 1000).toFixed(1) + 't' : value + 'kg'}`;
    }
    // 配速的 dir 已由 util 依「越小越好」轉成 up=進步
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 900,
            color, background: `${color}18`, padding: '2px 7px', borderRadius: 7, whiteSpace: 'nowrap',
        }}>
            <Icon size={10} />{txt}
        </span>
    );
};

const Metric = ({ label, thisVal, unit, delta, kind }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 9, fontWeight: 900, color: C.paper, opacity: 0.4, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 4px' }}>{label}</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: C.paper, margin: 0, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {thisVal}<span style={{ fontSize: 11, fontWeight: 700, opacity: 0.35, marginLeft: 2 }}>{unit}</span>
        </p>
        <div style={{ marginTop: 6 }}><DeltaChip delta={delta} kind={kind} /></div>
    </div>
);

const MonthlyProgressCard = ({ progress, myRank, nemesis, metric = 'distance' }) => {
    // ⚠ Hook 必須全部在早退 (early return) 之前呼叫。
    //   原本 return null 寫在 useMemo/useState 上面 → 第一次無資料時跑 0 個 hook、
    //   資料回來後跑 2 個 hook → React 拋 "Rendered more hooks than during the
    //   previous render" → 整頁掉到 error boundary。
    // 最近一次跑步的裝備 + 同行者（仿 Strava「與誰一起訓練」）
    const meta = React.useMemo(() => getLatestRunMeta() || {}, []);
    // 預設收合，點擊展開
    const [open, setOpen] = React.useState(false);

    if (!progress || !progress.hasData) return null;
    const { thisMonth, deltas } = progress;

    const companions = meta.companions || [];
    const shoe = meta.shoe;

    const hasStrength = (progress.thisStrength?.count || 0) > 0 || (progress.lastStrength?.count || 0) > 0;

    // 鼓勵語：以進步項目數量決定語氣
    const improved = [deltas.distance, deltas.count, deltas.pace, ...(hasStrength ? [deltas.volume] : [])].filter((d) => d.dir === 'up').length;
    const headline = improved >= 2 ? '這個月，你明顯在往上走' : improved === 1 ? '有進步，繼續保持節奏' : '新的一個月，從今天開始累積';
    // 收合時的一行摘要（里程 + 進步幅度）
    const summaryDelta = deltas.distance.dir === 'up' ? `↑ ${deltas.distance.value}km` : deltas.distance.dir === 'down' ? `↓ ${deltas.distance.value}km` : '持平';

    // 下一階進度：距離超越前一名（nemesis）還差多少
    let nextBar = null;
    if (nemesis && myRank) {
        const meVal = metric === 'pace' ? null : (metric === 'elevation' ? null : thisMonth.distance);
        if (metric === 'distance' && meVal != null) {
            const target = nemesis.dist || 0;
            const pct = target > 0 ? Math.min(100, Math.round((meVal / target) * 100)) : 0;
            const gap = Math.max(0, +(target - meVal).toFixed(1));
            nextBar = { pct, label: `距離超越 ${nemesis.name} 還差 ${gap} km`, done: gap <= 0 };
        }
    }

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{
                margin: '0 16px 14px', borderRadius: 20,
                // 🧊 iOS 液態玻璃：半透明白紗 + 高飽和模糊 + 頂部內高光
                background: 'rgba(255,255,255,0.42)',
                backdropFilter: 'blur(30px) saturate(180%)', WebkitBackdropFilter: 'blur(30px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.55)', position: 'relative', overflow: 'hidden',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 12px 32px -16px rgba(22,20,21,0.22)',
            }}>
            {/* 氛圍光（淡珊瑚） */}
            <div style={{ position: 'absolute', top: -40, right: -20, width: 200, height: 200, background: `radial-gradient(circle, ${C.coral}1C 0%, ${C.coral}08 40%, transparent 68%)`, filter: 'blur(26px)', pointerEvents: 'none' }} />

            {/* ── 標題列（可點擊收合/展開）── */}
            <motion.button {...pressProps('row')}
 onClick={() => setOpen((v) => !v)}
 style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}
 >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Sparkles size={11} color={C.coral} />
                        <span style={{ fontSize: 12, fontWeight: 900, color: C.coral, letterSpacing: '0.2em', }}>Your Progress · 本月 vs 上月</span>
                    </div>
                    <div style={{ fontSize: open ? 15 : 20, fontStyle: open ? 'normal' : 'italic', fontWeight: 900, color: C.paper, letterSpacing: '-0.02em', lineHeight: 1.05, transition: 'font-size .25s ease' }}>{headline}</div>
                    {!open && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 34, fontWeight: 900, color: C.paper, letterSpacing: '-0.04em', lineHeight: 0.9 }}>
                                {thisMonth.distance}<span style={{ fontSize: 13, fontWeight: 800, opacity: 0.4, marginLeft: 3 }}>km</span>
                            </span>
                            <DeltaChip delta={deltas.distance} kind="distance" />
                            {hasStrength && <span style={{ fontSize: 11, fontWeight: 800, color: C.paper, opacity: 0.45 }}>· 訓練量 {(progress.thisStrength.volume / 1000).toFixed(1)}t</span>}
                        </div>
                    )}
                </div>
                <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} style={{ flexShrink: 0, opacity: 0.4 }}>
                    <ChevronDown size={18} color={C.paper} />
                </motion.div>
            </motion.button>

            <AnimatePresence initial={false}>
            {open && (
            <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: 'hidden', position: 'relative', zIndex: 1 }}
            >
            <div style={{ padding: '0 20px 20px' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                    <Metric label="里程" thisVal={thisMonth.distance} unit="km" delta={deltas.distance} kind="distance" />
                    <Metric label="次數" thisVal={thisMonth.count} unit="次" delta={deltas.count} kind="count" />
                    <Metric label="平均配速" thisVal={fmtPace(thisMonth.avgPace)} unit="" delta={deltas.pace} kind="pace" />
                </div>

                {/* 💪 健身訓練量（本月 vs 上月）— 有重訓資料才顯示，讓健身也算進步 */}
                {hasStrength && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.paper}0E` }}>
                        <Metric
                            label="訓練量"
                            thisVal={progress.thisStrength.volume >= 1000 ? (progress.thisStrength.volume / 1000).toFixed(1) : progress.thisStrength.volume}
                            unit={progress.thisStrength.volume >= 1000 ? 't' : 'kg'}
                            delta={deltas.volume} kind="volume"
                        />
                        <Metric label="重訓次數" thisVal={progress.thisStrength.count} unit="次" delta={{ dir: (progress.thisStrength.count - (progress.lastStrength?.count || 0)) > 0 ? 'up' : (progress.thisStrength.count === (progress.lastStrength?.count || 0) ? 'flat' : 'down'), value: Math.abs(progress.thisStrength.count - (progress.lastStrength?.count || 0)) }} kind="count" />
                        <div style={{ flex: 1 }} />
                    </div>
                )}

                {/* 🤝 同行者 + 🥾 裝備（最近一次跑步）*/}
                {(companions.length > 0 || shoe) && (
                    <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {companions.length > 0 && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: `${C.coral}16`, border: `1px solid ${C.coral}30` }}>
                                <Users size={11} color={C.coral} />
                                <span style={{ fontSize: 11, fontWeight: 800, color: C.paper }}>
                                    與 {companions.slice(0, 2).map((c) => c.name).join('、')}
                                    {companions.length > 2 ? ` 等 ${companions.length} 人` : ''} 同行
                                </span>
                            </div>
                        )}
                        {shoe && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: `${C.paper}0A`, border: `1px solid ${C.paper}14` }}>
                                <Footprints size={11} color={C.paper} style={{ opacity: 0.6 }} />
                                <span style={{ fontSize: 11, fontWeight: 800, color: C.paper, opacity: 0.8 }}>
                                    {shoe.brand ? `${shoe.brand} ` : ''}{shoe.name}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {nextBar && (
                    <div style={{ marginTop: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: C.paper, opacity: 0.55 }}>{nextBar.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 900, color: C.coral }}>{nextBar.pct}%</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: `${C.paper}12`, overflow: 'hidden' }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${nextBar.pct}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                                style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${C.coral}, #FF8A6B)` }} />
                        </div>
                    </div>
                )}
            </div>
            </motion.div>
            )}
            </AnimatePresence>
        </motion.div>
    );
};

export default MonthlyProgressCard;
