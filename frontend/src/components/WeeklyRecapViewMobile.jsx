import React, { useState, useEffect, useCallback, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Zap, Trophy, Activity, Star as StarIcon, Flame, Droplet as Drop, TrendingUp, FileBarChart, Share2, Lock, CalendarClock } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import DataPulse from './ui/DataPulse';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { getSettledMonth, getNextSettlementLabel, isRecapUnlocked, markSettlementSeen } from '../utils/monthlyRecap';
import { toLocalDateKey } from '../utils/localDate';
import { shareImageBlob } from '../utils/shareCard';


/* ── 顏色與常數 ── */
const V = {
    black: '#161415', paper: '#F6F4F1', stone: '#E4DED2', pebble: '#CFC6B8',
    mist: '#ECEDEA', // DRVN 冷中性層（取圖二那種很淺的冷灰）
    coral: '#F95C4B', ember: '#D94030',
    muted: 'rgba(0,0,0,0.4)', success: '#27AE60', white: '#FFFFFF'
};
// DRVN 英文版招牌顯示字體：Tenor Sans（標題/大字/kicker）；內文沿用中性 DM Sans。
const TENOR = '"Tenor Sans", "Noto Sans TC", system-ui, sans-serif';
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const TOTAL_SLIDES = 8;
const SLIDE_DURATION = 9000;

/* ── 基礎樣式 ── */
const cardBase = { borderRadius: 28, padding: 24, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' };
// 🏗 DRVN 材質：深色卡改用「鈦金屬深板」漸層 + 內緣立體斜角，而非死黑色塊；
//    淺色卡保留暖 Paper；新增 ms 用冷調 Mist 當退後層，讓暖卡浮起。
const dk = {
    ...cardBase,
    background: 'linear-gradient(150deg, #232021 0%, #161415 55%, #100E0F 100%)',
    color: V.paper,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 8px rgba(0,0,0,0.5)',
};
const wh = { ...cardBase, background: V.paper, color: V.black, border: `1px solid ${V.pebble}` };
const st = { ...cardBase, background: V.stone, color: V.black };
const ms = { ...cardBase, background: V.mist, color: V.black }; // 冷調 Mist 退後層
// 強化物理彈性
const sl = (delay = 0) => ({
    initial: { opacity: 0, y: 30, scale: 0.9, rotateX: 10 },
    animate: {
        opacity: 1, y: 0, scale: 1, rotateX: 0,
        transition: {
            delay,
            type: "spring",
            stiffness: 90,
            damping: 12,
            mass: 0.8
        }
    }
});

// 🛡️ P2 修復：把原本定義在元件內部的 Scribble / Row / Mini 搬到模組頂層，
// 避免每次父元件 render 都重建這三個函式型別、導致 React 把整個子樹卸載重掛。
// 它們本來就只依賴模組層的 V 與常數 hair，是純展示元件，hoist 完全等價。
const RECAP_HAIR = '1px solid rgba(22,20,21,0.16)';

// 手繪紅色馬克筆圈（不規則、收尾overshoot，呼應 Break Conventions 海報風）
const Scribble = () => (
    <svg viewBox="0 0 240 120" preserveAspectRatio="none" aria-hidden="true"
        style={{ position: 'absolute', left: -20, top: -16, width: 'calc(100% + 40px)', height: 'calc(100% + 30px)', pointerEvents: 'none' }}>
        <path d="M46 74 C28 40 86 22 136 27 C190 33 216 55 199 81 C185 103 106 107 53 93 C18 84 22 53 52 49"
            fill="none" stroke={V.coral} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" transform="rotate(-3 120 60)" />
    </svg>
);
const Row = ({ en, zh, value, unit, sub, highlight }) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '16px 0', borderTop: RECAP_HAIR }}>
        <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.24em' }}>{en}</div>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.45, letterSpacing: '0.06em', marginTop: 4 }}>{zh} · {sub}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, position: 'relative' }}>
            {highlight && <Scribble />}
            <div style={{ fontSize: 54, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 0.9, position: 'relative' }}>{value}</div>
            <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.5, position: 'relative' }}>{unit}</div>
        </div>
    </div>
);
const Mini = ({ label, value }) => (
    <div>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em' }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.45, letterSpacing: '0.12em', marginTop: 5, textTransform: 'uppercase' }}>{label}</div>
    </div>
);

/* ── 數字跳動動畫組件 ── */
const CountUp = ({ value, decimals = 0, duration = 2 }) => {
    const [displayValue, setDisplayValue] = useState(0);
    useEffect(() => {
        const end = parseFloat(value) || 0;
        if (duration === 0) { setDisplayValue(end); return; }

        let start = 0;
        let totalFrames = duration * 60;
        let frame = 0;
        const timer = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            const current = start + (end - start) * (1 - Math.pow(1 - progress, 3));
            setDisplayValue(current);
            if (frame >= totalFrames) {
                setDisplayValue(end);
                clearInterval(timer);
            }
        }, 16);
        return () => clearInterval(timer);
    }, [value, duration]);
    return <span>{displayValue.toFixed(decimals)}</span>;
};

const slideV = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };

/* ── 小工具與圖標 ── */
const Star = ({ color = V.coral, size = 22 }) => (
    <motion.div
        animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill={color} />
        </svg>
    </motion.div>
);

const ProgressBar = ({ total, current, duration }) => (
    <div style={{ display: 'flex', gap: 6, padding: '0 12px' }}>
        {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ 
                flex: 1, 
                height: 8, 
                borderRadius: 4, 
                background: 'rgba(0,0,0,0.08)', 
                position: 'relative',
                overflow: 'visible',
                border: '1px solid rgba(0,0,0,0.03)'
            }}>
                {/* 跑道虛線 */}
                <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: 1, borderTop: '1px dashed rgba(0,0,0,0.1)', transform: 'translateY(-50%)' }} />
                
                {i < current && <div style={{ width: '100%', height: '100%', background: V.black, borderRadius: 4 }} />}
                {i === current && (
                    <>
                        <motion.div 
                            key={`p${current}${i}`} 
                            initial={{ width: '0%' }} 
                            animate={{ width: '100%' }} 
                            transition={{ duration: duration / 1000, ease: 'linear' }} 
                            style={{ height: '100%', background: V.black, borderRadius: 4, position: 'relative' }} 
                        />
                        {/* 進度條三角形指針已移除（視覺干擾） */}
                    </>
                )}
            </div>
        ))}
    </div>
);

// 標題斜向彈入
const GuideHeader = ({ text, delay = 0.1 }) => (
    <motion.div
        initial={{ opacity: 0, x: -30, skewX: -15 }}
        animate={{ opacity: 0.95, x: 0, skewX: -15 }}
        transition={{ delay, type: "spring", stiffness: 100 }}
        style={{
            position: 'absolute', top: 95, left: 24, zIndex: 100, pointerEvents: 'none'
        }}
    >
        <p style={{ fontSize: 22, fontWeight: 900, color: V.coral, letterSpacing: '-1px', textTransform: 'uppercase', fontStyle: 'italic', margin: 0 }}>
            {text}
        </p>
    </motion.div>
);

// 統一的精簡標題（DRVN 編輯式）：一行 tracked-caps kicker + 小號中文標。
// 取代各頁原本「絕對定位斜體大標 + 52~60px 兩行英文巨標」造成的失衡感。
const SlideHead = ({ kicker, zh, delay = 0.1 }) => (
    <motion.div {...sl(delay)} style={{ flexShrink: 0 }}>
        <p style={{ fontFamily: TENOR, fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.4)', margin: 0 }}>{kicker}</p>
        {zh && (
            <h2 style={{ fontFamily: TENOR, fontSize: 27, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.1, margin: '6px 0 0', color: V.black }}>
                {zh}<span style={{ color: V.coral }}>.</span>
            </h2>
        )}
    </motion.div>
);

/* ── 圖表視覺化元件 (五角形 - 增加重量顯示與空間優化) ── */
const RadarChart = ({ md }) => {
    const axes = [ { label: '胸', key: 'chest' }, { label: '背', key: 'back' }, { label: '核心', key: 'core' }, { label: '臂', key: 'arms' }, { label: '腿', key: 'legs' } ];
    const size = 220; // 稍微加大視窗防止遮擋
    const center = size / 2; 
    const radius = 65; // 縮小半徑，為外部文字留空
    
    const points = axes.map((axis, i) => {
        const val = Math.max(15, (md?.[axis.key] || { pct: 0 }).pct || 0);
        const r = (val / 100) * radius; const angle = (i * 72 - 90) * (Math.PI / 180);
        return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
    });
    
    const polygonPath = points.map(p => `${p.x},${p.y}`).join(' ');
    
    return (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {[0.2, 0.4, 0.6, 0.8, 1].map((scale) => (
                    <polygon key={scale} points={axes.map((_, i) => `${center + scale * radius * Math.cos((i * 72 - 90) * (Math.PI / 180))},${center + scale * radius * Math.sin((i * 72 - 90) * (Math.PI / 180))}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                ))}
                {axes.map((_, i) => <line key={i} x1={center} y1={center} x2={center + radius * Math.cos((i * 72 - 90) * (Math.PI / 180))} y2={center + radius * Math.sin((i * 72 - 90) * (Math.PI / 180))} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />)}
                <motion.polygon initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, duration: 0.8 }} points={polygonPath} fill="rgba(249, 92, 75, 0.25)" stroke={V.coral} strokeWidth="3" style={{ transformOrigin: 'center' }} />
                {axes.map((axis, i) => {
                    const angle = (i * 72 - 90) * (Math.PI / 180);
                    const lx = center + (radius + 28) * Math.cos(angle);
                    const ly = center + (radius + 28) * Math.sin(angle);
                    return (
                        <g key={i}>
                            <text x={lx} y={ly - 5} fill="white" fontSize="11" fontWeight="900" textAnchor="middle" style={{ fontFamily: 'var(--font-body)' }}>{axis.label}</text>
                            <text x={lx} y={ly + 8} fill={V.coral} fontSize="11" fontWeight="700" textAnchor="middle">{md[axis.key]?.vol || 0}kg</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

const Lollipop = ({ data, color = V.black }) => {
    const maxVal = Math.max(...data.map(d => d.value), 1);
    return (
        <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '20px 10px 0' }}>
            {data.map((d, i) => {
                const ratio = d.value / maxVal; const h = Math.max(4, ratio * 70); const isMax = d.value === maxVal && d.value > 0;
                return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <AnimatePresence>{isMax && <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 900, color: V.black, marginBottom: 6, whiteSpace: 'nowrap' }}>{d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value}</motion.div>}</AnimatePresence>
                        <div style={{ width: 4, height: ratio > 0 ? h : 6, background: ratio > 0 ? color : 'rgba(0,0,0,0.15)', position: 'relative', borderRadius: 2 }}>
                            <div style={{ position: 'absolute', top: -4, left: -3, width: 10, height: 10, borderRadius: '50%', background: ratio > 0 ? color : 'rgba(0,0,0,0.2)', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                        </div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 900, color: ratio > 0 ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.25)', marginTop: 12, margin: '12px 0 0' }}>{d.label}</p>
                    </div>
                );
            })}
        </div>
    );
};

const RacingLanesChart = ({ runs, color = V.white }) => {
    const validRuns = runs || [];
    const maxDist = Math.max(...validRuns.map(r => r.distance), 1);
    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {validRuns.map((run, i) => {
                const ratio = run.distance / maxDist;
                return (
                    <div key={i} style={{ position: 'relative', height: 18, background: 'rgba(255,255,255,0.1)', borderRadius: 9, overflow: 'visible' }}>
                        {/* 跑道虛線 */}
                        <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: 1, borderTop: '1px dashed rgba(255,255,255,0.15)', transform: 'translateY(-50%)' }} />
                        
                        {/* 進度三角指針 */}
                        <motion.div
                            initial={{ left: '0%' }}
                            animate={{ left: `${ratio * 92}%` }}
                            transition={{ delay: 0.5 + i * 0.1, duration: 1.2, type: "spring" }}
                            style={{ 
                                position: 'absolute', 
                                top: '50%', 
                                transform: 'translateY(-50%)',
                                width: 0, 
                                height: 0, 
                                borderTop: '6px solid transparent', 
                                borderBottom: '6px solid transparent', 
                                borderLeft: `8px solid ${V.white}`,
                                zIndex: 10
                            }}
                        />
                        
                        {/* 標籤 */}
                        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 8, fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.6)' }}>
                            <span>{run.date}</span>
                            <span style={{ color: V.white }}>{run.distance.toFixed(1)}KM</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

/* ── 力量訓練分布圖 (對應截圖 5.19.45.png) ── */
const WorkoutVolumeChart = ({ workouts }) => {
    const validData = workouts || [];
    const maxVol = Math.max(...validData.map(w => w.volume), 1);
    return (
        <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '20px 10px 0' }}>
            {validData.map((w, i) => {
                const ratio = w.volume / maxVol;
                const h = Math.max(10, ratio * 80);
                const isMax = w.volume === maxVol;
                return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <AnimatePresence>
                            {isMax && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 11, fontWeight: 900, color: V.coral, marginBottom: 4 }}>{w.volume}kg</motion.div>}
                        </AnimatePresence>
                        {/* 圓點 */}
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: isMax ? V.coral : V.paper, zIndex: 2 }} />
                        {/* 垂直線 */}
                        <motion.div 
                            initial={{ height: 0 }} animate={{ height: h }} transition={{ delay: 0.5 + i * 0.05, type: "spring" }}
                            style={{ width: 2, background: isMax ? V.coral : 'rgba(255,255,255,0.2)', borderRadius: 1 }} 
                        />
                        <p style={{ fontSize: 11, opacity: 0.3, marginTop: 8, fontWeight: 900 }}>{w.label}</p>
                    </div>
                );
            })}
        </div>
    );
};

const HRZoneBar = ({ z2Min = 180, z3Min = 120, z4Min = 45 }) => {
    const formatTime = (mins) => {
        if (!mins) return '0m';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    const total = (z2Min + z3Min + z4Min) || 1;
    const z2Pct = (z2Min / total) * 100;
    const z3Pct = (z3Min / total) * 100;
    const z4Pct = (z4Min / total) * 100;
    return (
        <div style={{ width: '100%', display: 'flex', height: 24, borderRadius: 12, overflow: 'hidden', background: 'rgba(0,0,0,0.05)', marginTop: 8 }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${z2Pct}%` }} transition={{ duration: 1 }} style={{ background: '#3498DB', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {z2Pct > 15 && <span style={{ fontSize: 11, fontWeight: 900, color: V.white, whiteSpace: 'nowrap' }}>{formatTime(z2Min)}</span>}
            </motion.div>
            <motion.div initial={{ width: 0 }} animate={{ width: `${z3Pct}%` }} transition={{ duration: 1, delay: 0.2 }} style={{ background: '#F1C40F', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {z3Pct > 15 && <span style={{ fontSize: 11, fontWeight: 900, color: V.white, whiteSpace: 'nowrap' }}>{formatTime(z3Min)}</span>}
            </motion.div>
            <motion.div initial={{ width: 0 }} animate={{ width: `${z4Pct}%` }} transition={{ duration: 1, delay: 0.4 }} style={{ background: V.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {z4Pct > 15 && <span style={{ fontSize: 11, fontWeight: 900, color: V.white, whiteSpace: 'nowrap' }}>{formatTime(z4Min)}</span>}
            </motion.div>
        </div>
    );
};

const NutritionDonutChart = ({ carbs = 45, protein = 30, fats = 25, size = 110 }) => {
    const total = carbs + protein + fats || 1; const r = (size / 2) - 10; const center = size / 2; const circumference = 2 * Math.PI * r;
    const arcs = [{ key: 'carbs', value: carbs, color: '#F1C40F', label: 'C' }, { key: 'protein', value: protein, color: V.white, label: 'P' }, { key: 'fats', value: fats, color: 'rgba(255,255,255,0.2)', label: 'F' }];
    let offset = 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: size, height: size, position: 'relative' }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
                    {arcs.map((arc, i) => {
                        const pct = arc.value / total; const strokeDasharray = `${pct * circumference} ${circumference}`; const strokeDashoffset = -offset; offset += pct * circumference;
                        return (<motion.circle key={arc.key} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: strokeDashoffset }} transition={{ delay: Math.min(i, 6) * 0.1 + 0.5, duration: 1 }} cx={center} cy={center} r={r} fill="none" stroke={arc.color} strokeWidth="12" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }} />);
                    })}
                </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {arcs.map(arc => (
                    <div key={arc.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: arc.color }} />
                        <p style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.6)' }}>{arc.label} <span style={{ color: V.paper }}>{arc.value}%</span></p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const WeightSparkline = ({ data = [75, 74.8, 74.5, 74.2, 73.8], color = V.success }) => {
    const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1;
    const points = data.map((d, i) => `${(i / (data.length - 1)) * 100},${100 - ((d - min) / range) * 100}`).join(' L ');
    return (
        <svg width="100%" height="40" viewBox="0 -10 100 120" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
            <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, ease: "easeOut" }} d={`M 0,${100 - ((data[0] - min) / range) * 100} L ${points}`} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

const NutritionHitGrid = ({ daysInMonth = 30, hitDays = 22 }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 8 }}>
        {Array.from({ length: daysInMonth }).map((_, i) => (
            <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: Math.min(i, 6) * 0.02 }} style={{ aspectRatio: '1', borderRadius: 4, background: i < hitDays ? V.coral : 'rgba(255,255,255,0.08)' }} />
        ))}
    </div>
);

const CalHeatmap = ({ trainingDays, monthStart, daysInMonth }) => {
    const firstDow = new Date(monthStart).getDay(); const today = new Date(); const todayDate = today.getDate();
    const isCurrentMonth = new Date(monthStart).getMonth() === today.getMonth();
    const cells = Array(firstDow).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} />;
                const isFuture = isCurrentMonth && day > todayDate; const hasT = trainingDays.has(day);
                return <div key={`d${i}`} style={{ aspectRatio: '1', borderRadius: 6, background: hasT ? V.coral : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontSize: 11, fontWeight: 900, color: hasT ? 'white' : 'rgba(255,255,255,0.2)' }}>{day}</p></div>;
            })}
        </div>
    );
};

/* ── 分頁內容 ── */
const SlideCover = ({ d, patchReady }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '140px 24px 40px', background: V.mist, color: V.black }}>
        <GuideHeader text="這個月，你超乎想像" />
        <motion.div {...sl(0.2)}>
            <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 4 }} style={{ display: 'inline-block' }}>
                <Star color={V.coral} size={48} />
            </motion.div>
            <p style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.2em', opacity: 0.5, marginTop: 16 }}>MONTHLY RECAP</p>
            <motion.h1
                {...sl(0.3)}
                style={{
                    fontFamily: TENOR,
                    fontSize: 84,
                    fontWeight: 400,
                    lineHeight: 0.88,
                    margin: '10px 0',
                    letterSpacing: '-3px',
                    textTransform: 'uppercase',
                    display: 'block'
                }}
            >
                {d.monthEn}<br /><span style={{ color: V.coral, fontSize: 96 }}>{d.year}</span>
            </motion.h1>
            <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <motion.div {...sl(0.6)}><p style={{ fontSize: 11, opacity: 0.4, marginBottom: 4 }}>訓練次數</p><p style={{ fontSize: 32, fontWeight: 900 }}><DataPulse ready={patchReady} w="3.5rem" h="2.5rem" radius="0.75rem" theme="dark" inline><CountUp value={d.totalWorkouts || 0} /></DataPulse></p></motion.div>
                <motion.div {...sl(0.7)}><p style={{ fontSize: 11, opacity: 0.4, marginBottom: 4 }}>ACTIVE</p><p style={{ fontSize: 32, fontWeight: 900 }}><DataPulse ready={patchReady} w="3.5rem" h="2.5rem" radius="0.75rem" theme="dark" inline><CountUp value={d.activeDays || 0} /></DataPulse></p></motion.div>
                <motion.div {...sl(0.8)}><p style={{ fontSize: 11, opacity: 0.4, marginBottom: 4 }}>HOURS</p><p style={{ fontSize: 32, fontWeight: 900 }}><DataPulse ready={patchReady} w="3.5rem" h="2.5rem" radius="0.75rem" theme="dark" inline><CountUp value={d.totalHours || 0} /></DataPulse></p></motion.div>
            </div>
        </motion.div>
    </div>
);

const SlideConsistency = ({ d }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '72px 24px 40px', background: V.mist, color: V.black }}>
        <SlideHead kicker="CONSISTENCY · STREAK" zh="這就是自律的形狀" />
        <motion.div {...sl(0.2)} style={{ marginTop: 18 }}>
            <motion.div {...sl(0.4)}><CalHeatmap trainingDays={d.trainingDaysSet} monthStart={d.monthStart} daysInMonth={d.daysInMonth} /></motion.div>
            <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <motion.div {...sl(0.6)} style={{ background: V.black, borderRadius: 18, padding: '16px', color: V.paper }}><p style={{ fontSize: 11, opacity: 0.4, marginBottom: 4 }}>連續天數</p><p style={{ fontSize: 32, fontWeight: 900 }}><CountUp value={d.bestStreak || 0} />d</p></motion.div>
                <motion.div {...sl(0.7)} style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 18, padding: '16px', color: V.black }}><p style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>ACTIVE</p><p style={{ fontSize: 32, fontWeight: 900 }}><CountUp value={d.activeDays || 0} />d</p></motion.div>
            </div>
        </motion.div>
    </div>
);

const SlideCardio = ({ d }) => {
    const pace = d.cardio.avgPace
        ? `${Math.floor(d.cardio.avgPace / 60)}'${String(d.cardio.avgPace % 60).padStart(2, '0')}"`
        : "--'--";
    const kickerDark = { fontFamily: TENOR, fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 };
    const kickerLight = { fontFamily: TENOR, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.4)', margin: 0 };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '72px 20px 40px', height: '100%', background: V.mist }}>
            {/* 編輯式精簡標題（不再佔掉整個上半屏）*/}
            <SlideHead kicker="RECAP · CARDIO" zh="路面上的每一公里" />

            {/* HERO：深鈦金屬板 + 大輕量距離數字（全屏唯一 Coral 焦點）*/}
            <motion.div {...sl(0.2)} className="recap-brushed recap-sheen" style={{ ...dk, padding: '26px 24px', flexShrink: 0 }}>
                <div style={{ position: 'relative', zIndex: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={kickerDark}>距離 · DISTANCE</p>
                            <h3 style={{ fontFamily: TENOR, fontSize: 74, fontWeight: 300, lineHeight: 0.9, letterSpacing: '-0.03em', margin: '10px 0 0', color: V.paper, fontVariantNumeric: 'tabular-nums' }}>
                                <CountUp value={d.cardio.distance || 0} decimals={1} />
                                <span style={{ fontSize: 20, fontWeight: 400, color: V.coral, letterSpacing: 0, marginLeft: 6 }}>KM</span>
                            </h3>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={kickerDark}>活躍燃燒</p>
                            <p style={{ fontFamily: TENOR, fontSize: 26, fontWeight: 300, margin: '10px 0 0', color: V.paper, fontVariantNumeric: 'tabular-nums' }}>
                                {d.cardio.calories || 0}<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}> kcal</span>
                            </p>
                        </div>
                    </div>
                    {/* 一道 Coral 細線：全屏的單一焦點 */}
                    <div style={{ height: 2, width: 44, background: V.coral, borderRadius: 2, margin: '18px 0 14px' }} />
                    <RacingLanesChart runs={d.cardio.individualRuns} />
                </div>
            </motion.div>

            {/* 配速 / 爬升 / 心率區間 — Paper 卡 + 1.5px Pebble 直角數據列 */}
            <motion.div {...sl(0.3)} style={{ ...wh, padding: '20px 24px', flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', borderBottom: `1px solid ${V.pebble}`, paddingBottom: 16, marginBottom: 16 }}>
                    <div style={{ flex: 1, borderRight: `1.5px solid ${V.pebble}`, paddingRight: 16 }}>
                        <p style={kickerLight}>平均配速</p>
                        <p style={{ fontFamily: TENOR, fontSize: 32, fontWeight: 300, margin: '6px 0 0', color: V.black, fontVariantNumeric: 'tabular-nums' }}>{pace}</p>
                    </div>
                    <div style={{ flex: 1, paddingLeft: 18 }}>
                        <p style={kickerLight}>爬升 · ELEVATION</p>
                        <p style={{ fontFamily: TENOR, fontSize: 32, fontWeight: 300, margin: '6px 0 0', color: V.black, fontVariantNumeric: 'tabular-nums' }}>
                            +<CountUp value={d.cardio.totalElevation || 0} /><span style={{ fontSize: 13, color: 'rgba(22,20,21,0.4)' }}>m</span>
                        </p>
                    </div>
                </div>
                <p style={{ ...kickerLight, marginBottom: 4 }}>HR ZONES · TIME IN ZONE</p>
                <HRZoneBar z2Min={d.cardio.hrZones?.z2 || 185} z3Min={d.cardio.hrZones?.z3 || 90} z4Min={d.cardio.hrZones?.z4 || 45} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(22,20,21,0.45)' }}>
                    <span>有氧區 Z2</span>
                    <span>高強度區 Z4</span>
                </div>
            </motion.div>
        </div>
    );
};

const SlideStrength = ({ d }) => {
    const totalTonnes = (d.totalVolume || 0) / 1000;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '72px 20px 40px', height: '100%', background: V.mist }}>
            <SlideHead kicker="STRENGTH · MASTER" zh="你不只是流汗，還移山倒海了" />

            <motion.div {...sl(0.4)} style={{ ...dk, padding: '32px 24px' }}>
                <h2 style={{ fontFamily: TENOR, fontSize: 64, fontWeight: 400, lineHeight: 0.86, letterSpacing: '-2px', margin: '4px 0' }}>
                    <CountUp value={totalTonnes} decimals={1} />
                    <span style={{ fontSize: 24, opacity: 0.3 }}> TONS</span>
                </h2>
                <motion.p {...sl(0.4)} style={{ fontSize: 15, fontStyle: 'italic', opacity: 0.7 }}>
                    等同於舉起了 {Math.round(totalTonnes / 4)} 輛 SUV 🚗
                </motion.p>
                
                {/* 插入新設計的每次訓練重量圖 */}
                <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 18, padding: '10px' }}>
                    <WorkoutVolumeChart workouts={d.individualWorkouts} />
                </div>
            </motion.div>

            {/* 下方數據改用 Bento 網格，更有層次 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <motion.div {...sl(0.5)} style={{ ...wh, padding: '20px' }}>
                    <p style={{ fontSize: 11, opacity: 0.5, fontWeight: 900 }}>TOTAL REPS</p>
                    <p style={{ fontSize: 28, fontWeight: 900, margin: '4px 0' }}><CountUp value={d.totalReps} /></p>
                </motion.div>
                <motion.div {...sl(0.6)} style={{ ...wh, padding: '20px' }}>
                    <p style={{ fontSize: 11, opacity: 0.5, fontWeight: 900 }}>MAX LOAD</p>
                    <p style={{ fontSize: 28, fontWeight: 900, margin: '4px 0' }}><CountUp value={d.maxLoad} />kg</p>
                </motion.div>
                <motion.div {...sl(0.7)} style={{ ...dk, padding: '20px', background: '#1E1C1A' }}>
                    <p style={{ fontSize: 11, opacity: 0.4, fontWeight: 900 }}>訓練燃燒</p>
                    <p style={{ fontSize: 28, fontWeight: 900, margin: '4px 0', color: V.coral }}><CountUp value={d.workoutBurn} />kcal</p>
                </motion.div>
                <motion.div {...sl(0.8)} style={{ ...dk, padding: '20px', background: '#1E1C1A' }}>
                    <p style={{ fontSize: 11, opacity: 0.4, fontWeight: 900 }}>AVG EFFORT</p>
                    <p style={{ fontSize: 28, fontWeight: 900, margin: '4px 0' }}><CountUp value={d.avgIntensity} />%</p>
                </motion.div>
            </div>
        </div>
    );
};

const SlideTrophyRoom = ({ d }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '72px 20px 40px', height: '100%', background: V.mist }}>
        <SlideHead kicker="TROPHY · ROOM" zh="看看你征服的重量" />
        {d.prsThisMonth.slice(0, 3).map((pr, i) => {
            // 淡液態玻璃：第一名留一抹珊瑚（唯一焦點），其餘中性霜玻璃；文字改深色 ink
            const top = i === 0;
            return (
            <motion.div key={i} {...sl(0.4 + i * 0.2)} style={{
                position: 'relative', overflow: 'hidden',
                background: top
                    ? 'linear-gradient(145deg, rgba(249,92,75,0.22) 0%, rgba(249,92,75,0.10) 100%)'
                    : 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.30) 100%)',
                backdropFilter: 'blur(24px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                border: top ? '1px solid rgba(249,92,75,0.30)' : '1px solid rgba(255,255,255,0.7)',
                borderTop: top ? '1px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.95)',
                boxShadow: '0 10px 28px -12px rgba(22,20,21,0.18), inset 0 1px 2px rgba(255,255,255,0.6)',
                color: V.black, padding: '24px', borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                {/* 頂部高光弧 */}
                <span style={{ position: 'absolute', top: 0, left: '8%', right: '8%', height: '40%', pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 100%)', borderRadius: '0 0 50% 50%' }} />
                <div style={{ position: 'relative', zIndex: 1 }}><p style={{ fontSize: 11, fontWeight: 900, color: top ? V.ember : 'rgba(22,20,21,0.45)', marginBottom: 4, letterSpacing: '0.1em' }}>NEW PR</p><p style={{ fontSize: 24, fontWeight: 900 }}>{pr.name}</p></div>
                <div style={{ textAlign: 'right', position: 'relative', zIndex: 1 }}><p style={{ fontSize: 32, fontWeight: 900 }}><CountUp value={pr.weight || 0} />kg</p><p style={{ fontSize: 12, fontWeight: 900, color: V.success }}>+<CountUp value={pr.growth || 0} />kg</p></div>
            </motion.div>
            );
        })}
    </div>
);

const SlideMuscle = ({ d }) => {
    const md = d.muscleData || {};
    const getPct = (key) => (md[key] || { pct: 0 }).pct || 0;
    const focus = (d.primaryFocus || '').toLowerCase();
    const getReview = () => {
        if (getPct('legs') > 0 && getPct('legs') < 40) return { text: "嘿，別再跳過練腿日了", isRoast: true };
        if (getPct('chest') > 75 && getPct('back') < 40) return { text: "練胸不練背，遲早變圓背", isRoast: true };
        if (getPct('arms') > 75 && getPct('chest') < 50) return { text: "天天手臂日？彎舉當飯吃", isRoast: true };
        if (focus.includes('back')) return { text: "完美的厚實上半身，盔甲成型", isRoast: false };
        return { text: "六邊形戰士！發展平衡得像教科書", isRoast: false };
    };
    const review = getReview();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '72px 20px 40px', height: '100%', background: V.mist }}>
            <SlideHead kicker="MUSCLE · MAP" zh="身體各部位的激烈辯論" />
            <motion.div {...sl(0.2)} className="recap-brushed recap-sheen" style={{ ...dk, padding: '32px 24px' }}>
                <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.15em', opacity: 0.4, marginBottom: 8, position: 'relative', zIndex: 2 }}>主要訓練分配</p>
                <h2 style={{ fontFamily: TENOR, fontSize: 46, fontWeight: 400, textTransform: 'uppercase', margin: 0, letterSpacing: '-1px', position: 'relative', zIndex: 2 }}>
                    <span style={{ color: V.stone }}>{d.primaryFocus.split(' & ')[0]}</span>
                    <span style={{ color: V.white }}> & </span>
                    <span style={{ color: V.stone }}>{d.primaryFocus.split(' & ')[1]}</span>
                </h2>
                <motion.div {...sl(0.3)} style={{ marginTop: 24, display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                    <RadarChart md={d.muscleData} />
                </motion.div>
            </motion.div>

            {/* 提示語卡 — 改淡液態玻璃（一抹珊瑚），不再是深色實心塊 */}
            <motion.div {...sl(0.5)} style={{
                position: 'relative', overflow: 'hidden',
                background: 'linear-gradient(145deg, rgba(249,92,75,0.22) 0%, rgba(249,92,75,0.10) 100%)',
                backdropFilter: 'blur(24px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                border: '1px solid rgba(249,92,75,0.30)',
                borderTop: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 10px 28px -12px rgba(22,20,21,0.18), inset 0 1px 2px rgba(255,255,255,0.6)',
                color: V.black,
                padding: '24px',
                borderRadius: 28,
                display: 'flex',
                alignItems: 'center',
                gap: 16
            }}>
                <span style={{ position: 'absolute', top: 0, left: '8%', right: '8%', height: '40%', pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 100%)', borderRadius: '0 0 50% 50%' }} />
                <Zap size={24} color={V.ember} style={{ position: 'relative', zIndex: 1, flexShrink: 0 }} />
                <p style={{ fontSize: 16, fontWeight: 900, margin: 0, lineHeight: 1.4, position: 'relative', zIndex: 1 }}>{review.text}</p>
            </motion.div>
        </div>
    );
};

const SlideWellnessSummary = ({ d }) => {
    const inCal = d.nutrition.caloriesAvg; const outCal = d.energyOutAvg;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '72px 20px 40px', height: '100%', background: V.mist }}>
            <SlideHead kicker="BODY · ENGINE" zh="你吃進去的，與你贏回來的" />
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <motion.div {...sl(0)} style={{ ...dk, padding: '20px' }}>
                    <p style={{ fontSize: 11, opacity: 0.4 }}>WEIGHT</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <p style={{ fontSize: 32, fontWeight: 900, margin: '4px 0' }}><CountUp value={d.weightDelta || 0} decimals={1} />kg</p>
                    </div>
                    <motion.div {...sl(0.3)} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                        <div><p style={{ fontSize: 11, opacity: 0.4 }}>FAT</p><p style={{ fontSize: 12, fontWeight: 900, color: V.coral }}><CountUp value={d.bodyFatDelta || 0} decimals={1} />%</p></div>
                        <div><p style={{ fontSize: 11, opacity: 0.4 }}>MUSCLE</p><p style={{ fontSize: 12, fontWeight: 900, color: V.coral }}>{d.muscleDelta > 0 ? '+' : ''}<CountUp value={d.muscleDelta || 0} decimals={1} />kg</p></div>
                    </motion.div>
                    <motion.div {...sl(0.5)}><WeightSparkline data={d.weightTrend || []} color={V.coral} /></motion.div>
                </motion.div>
                <motion.div {...sl(0.2)} style={{ ...wh, padding: '20px' }}>
                    <p style={{ fontSize: 11, opacity: 0.5 }}>BALANCE</p>
                    <div style={{ margin: '8px 0' }}>
                        <p style={{ fontSize: 11, fontWeight: 900, opacity: 0.4 }}>燃燒</p>
                        <p style={{ fontSize: 24, fontWeight: 900, color: V.coral }}><CountUp value={outCal} /></p>
                        <p style={{ fontSize: 11, fontWeight: 900, opacity: 0.4, marginTop: 8 }}>IN</p>
                        <p style={{ fontSize: 24, fontWeight: 900 }}><CountUp value={inCal} /></p>
                    </div>
                    <Flame size={16} color={V.coral} />
                </motion.div>
            </div>
            <motion.div {...sl(0.4)} style={{ ...dk, padding: '28px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 20, marginBottom: 20 }}>
                    <motion.div {...sl(0.5)}><p style={{ fontSize: 11, opacity: 0.4 }}>平均熱量</p><p style={{ fontSize: 36, fontWeight: 900 }}><CountUp value={inCal} /></p></motion.div>
                    <motion.div {...sl(0.6)}><NutritionDonutChart carbs={d.nutrition.carbsPct} protein={d.nutrition.proteinPct} fats={d.nutrition.fatsPct} size={72} /></motion.div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                    <motion.div {...sl(0.7)}><p style={{ fontSize: 11, opacity: 0.4, marginBottom: 12 }}>飲食記錄達標</p><NutritionHitGrid daysInMonth={d.daysInMonth} hitDays={d.nutrition.logDays} /></motion.div>
                    <motion.div {...sl(0.8)} style={{ textAlign: 'right' }}><p style={{ fontSize: 11, opacity: 0.4, marginBottom: 8 }}>水分攝取</p><p style={{ fontSize: 28, fontWeight: 900, color: V.coral }}><CountUp value={d.nutrition.hydrationAvg} decimals={1} />L</p><Drop size={20} color={V.paper} /></motion.div>
                </div>
            </motion.div>
        </div>
    );
};

const SlideClosing = ({ d, onClose, onReport }) => (
    <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '24px 20px',
        background: V.mist,
        justifyContent: 'center',
        position: 'relative'
    }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
            <motion.div {...sl(0)} style={{ marginBottom: 24 }}>
                <Star color={V.coral} size={26} />
                {/* Tenor Sans 顯示體：靠尺寸做階層、不靠粗體與傾斜（DRVN 是精密的，不歪斜）。
                    標題縮小，與其他頁的精簡標題一致，不再壓掉下方 bento。 */}
                <h2 style={{ fontFamily: TENOR, fontSize: 38, fontWeight: 400, color: V.black, lineHeight: 1.0, marginTop: 12, letterSpacing: '-1px' }}>{d.monthEn} <span style={{ color: V.coral }}>RECAP.</span></h2>
                <p style={{ fontFamily: TENOR, color: 'rgba(0,0,0,0.5)', fontSize: 13, marginTop: 10, letterSpacing: '0.02em' }}>Every drop of sweat counts.</p>
            </motion.div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '85px', gap: 10 }}>
                <motion.div {...sl(0.2)} className="recap-brushed recap-sheen" style={{ gridColumn: 'span 2', gridRow: 'span 2', background: V.black, color: V.paper, borderRadius: 28, padding: '24px', position: 'relative' }}>
                    <p style={{ fontSize: 11, fontWeight: 900, opacity: 0.5, position: 'relative', zIndex: 2 }}>總訓練量</p>
                    <div style={{ position: 'absolute', bottom: 16, left: 24, zIndex: 2 }}><p style={{ fontSize: 64, fontWeight: 900, lineHeight: 0.85, letterSpacing: '-4px' }}><CountUp value={(d.totalVolume || 0) / 1000} decimals={1} /></p><p style={{ fontSize: 24, fontWeight: 900, color: V.coral }}>TONS</p></div>
                </motion.div>
                <motion.div {...sl(0.3)} style={{ background: V.coral, borderRadius: 28, padding: '16px', color: V.white, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}><p style={{ fontSize: 11, fontWeight: 900, opacity: 0.8 }}>DAYS</p><p style={{ fontSize: 36, fontWeight: 900 }}><CountUp value={d.activeDays || 0} /></p></motion.div>
                <motion.div {...sl(0.4)} style={{ background: V.paper, borderRadius: 28, padding: '16px', color: V.black, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}><p style={{ fontSize: 11, opacity: 0.5 }}>HOURS</p><p style={{ fontSize: 36, fontWeight: 900 }}><CountUp value={d.totalHours || 0} /></p></motion.div>
                <motion.div {...sl(0.5)} style={{ gridColumn: 'span 2', gridRow: 'span 1', background: V.paper, color: V.black, borderRadius: 28, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div><p style={{ fontSize: 11, color: V.coral }}>距離</p><p style={{ fontSize: 28, fontWeight: 900 }}><CountUp value={d.cardio.distance || 0} decimals={1} /><span style={{ fontSize: 12, opacity: 0.4 }}>km</span></p></div>
                </motion.div>
                <motion.div {...sl(0.6)} className="recap-brushed recap-sheen" style={{ background: V.black, color: V.paper, borderRadius: 28, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}><p style={{ fontSize: 11, opacity: 0.5, position: 'relative', zIndex: 2 }}>連續</p><p style={{ fontSize: 36, fontWeight: 900, position: 'relative', zIndex: 2 }}><CountUp value={d.bestStreak || 0} />d</p></motion.div>
                {/* 主訓部位是「資訊展示」不是 CTA → 改鈦金屬深卡，與下方紅色主按鈕拉開語意與層次，
                    並收掉一個 Coral（整頁 CTA 焦點留給「查看報告」）。 */}
                <motion.div {...sl(0.7)} className="recap-brushed recap-sheen" style={{ gridColumn: 'span 3', gridRow: 'span 1', ...dk, borderRadius: 28, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, textAlign: 'center', position: 'relative' }}>
                    <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', opacity: 0.5, position: 'relative', zIndex: 2, margin: 0 }}>主訓部位</p>
                    <p style={{ fontFamily: TENOR, fontSize: 24, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.02em', position: 'relative', zIndex: 2, color: V.paper, margin: 0 }}>{d.primaryFocus}</p>
                </motion.div>
            </div>

            {/* 主 CTA — 珊瑚液態玻璃 */}
            <motion.button {...sl(0.85)} onClick={e => { e.stopPropagation(); onReport(); }} style={{
                position: 'relative', overflow: 'hidden', width: '100%', padding: '18px 0', marginTop: 28, borderRadius: 24,
                background: 'linear-gradient(145deg, rgba(249,92,75,0.78) 0%, rgba(255,122,107,0.62) 45%, rgba(217,64,48,0.8) 100%)',
                backdropFilter: 'blur(24px) saturate(2)', WebkitBackdropFilter: 'blur(24px) saturate(2)',
                border: '1px solid rgba(255,255,255,0.4)', borderTop: '1px solid rgba(255,255,255,0.6)',
                color: V.paper, fontSize: 15, fontWeight: 900, letterSpacing: '0.1em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 12px 28px -8px rgba(249,92,75,0.42), inset 0 1px 2px rgba(255,255,255,0.45)'
            }}>
                <span style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '40%', pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)', borderRadius: '0 0 50% 50%' }} />
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10 }}><FileBarChart size={18} /> 查看月度深度分析報告</span>
            </motion.button>
            {/* 次要 — 深色霜玻璃 */}
            <motion.button {...sl(0.95)} onClick={e => { e.stopPropagation(); onClose(); }} style={{
                position: 'relative', overflow: 'hidden', width: '100%', padding: '18px 0', marginTop: 10, borderRadius: 24,
                background: 'linear-gradient(145deg, rgba(38,35,36,0.62) 0%, rgba(22,20,21,0.52) 100%)',
                backdropFilter: 'blur(24px) saturate(1.6)', WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                border: '1px solid rgba(255,255,255,0.14)', borderTop: '1px solid rgba(255,255,255,0.24)',
                color: V.paper, fontSize: 15, fontWeight: 900, letterSpacing: '0.15em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 10px 24px -10px rgba(22,20,21,0.4), inset 0 1px 2px rgba(255,255,255,0.16)'
            }}>
                <span style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '40%', pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 100%)', borderRadius: '0 0 50% 50%' }} />
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>SHARE & FINISH <ArrowRight size={18} /></span>
            </motion.button>
        </div>
    </div>
);


/* ── 資料抓取模擬 ── */
// 示範資料（fallback）：當使用者尚無資料、未登入或 API 失敗時使用，確保卡片永遠有東西可顯示。
// 注意：不含日期欄位（月份等於執行當下計算）。
const RECAP_FALLBACK = {
    activeDays: 22, totalWorkouts: 25, totalHours: 28, totalVolume: 125400, totalReps: 1850, totalSets: 142,
    maxLoad: 180, workoutBurn: 8400, avgIntensity: 78,
    individualWorkouts: [
        { label: '01', volume: 4500 }, { label: '03', volume: 5200 },
        { label: '05', volume: 4800 }, { label: '08', volume: 6100 },
        { label: '10', volume: 5900 }, { label: '12', volume: 7200 },
        { label: '15', volume: 5400 }, { label: '18', volume: 6300 },
        { label: '21', volume: 5100 }, { label: '25', volume: 4900 }
    ],
    muscleData: {
        chest: { pct: 85, vol: 3200 }, back: { pct: 100, vol: 4100 }, core: { pct: 20, vol: 800 },
        arms: { pct: 40, vol: 1500 }, legs: { pct: 60, vol: 6800 }
    },
    primaryFocus: 'Back & Chest',
    prsThisMonth: [{ name: 'Deadlift', weight: 140, growth: 15 }, { name: 'Bench Press', weight: 95, growth: 5 }, { name: 'Squat', weight: 120, growth: 10 }],
    weeklyVolumes: [{ label: 'W1', value: 28000 }, { label: 'W2', value: 31000 }, { label: 'W3', value: 34500 }, { label: 'W4', value: 31900 }],
    cardio: {
        distance: 68.5, calories: 4200, avgPace: 345, totalElevation: 850,
        individualRuns: [{ date: '04/01', distance: 10.5 }, { date: '04/03', distance: 8.2 }, { date: '04/06', distance: 12.1 }, { date: '04/10', distance: 15.2 }],
        hrZones: { z2: 240, z3: 115, z4: 30 }
    },
    trainingDaysSet: new Set([2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 18, 19, 21, 22, 23, 25, 26, 28, 29, 30]),
    bestStreak: 6, consistencyPct: 73,
    nutrition: { caloriesAvg: 2150, carbsPct: 45, proteinPct: 30, fatsPct: 25, hydrationAvg: 2.8, logDays: 22 },
    energyOutAvg: 2600, weightDelta: -1.8, bodyFatDelta: -1.2, muscleDelta: 0.5, weightTrend: [75.5, 75.0, 74.8, 74.2, 73.7],
    quote: "Discipline builds the life you want."
};

// 從後端 /api/user/monthly-report 取真實「健身 + 跑步 + 營養」資料，對映成卡片所需的 d 結構。
// 任一欄位缺失/為 0 即退回示範值；整體失敗或完全無資料則回傳示範卡，確保畫面永不崩。
async function buildMonthlyData() {
    const now = new Date();
    const base = {
        monthEn: MONTHS_EN[now.getMonth()], monthZh: MONTHS_ZH[now.getMonth()], year: now.getFullYear(),
        daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
        monthStart: toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
        ...RECAP_FALLBACK,
    };
    // 📅 月報顯示「最近一個已結算（完整結束）的月份」＝上一個日曆月（每月 1 號出爐）。
    const settled = getSettledMonth();
    try {
        // 🔑 用標準 getUserId()（JWT → 快取 userId → guest id），
        //    先前用 localStorage.getItem('userId') 對 guest 使用者必為 null，
        //    導致每次都直接回退示範卡（25/22/28 假資料）而非真實月報。
        const userId = getUserId();
        // 未登入 → 鎖定
        if (!userId) return { _locked: true, nextLabel: getNextSettlementLabel() };

        // 抓「已結算月份」而非當月，避免顯示未結算的半個月資料
        const { data: r } = await apiClient.get(`/api/user/monthly-report/${userId}?month=${settled.ym}`);

        const num = (v, fb) => (typeof v === 'number' && !isNaN(v) ? v : fb);
        const fit = (r && r.fitness) || {}, car = (r && r.cardio) || {}, nut = (r && r.nutrition) || {}, ov = (r && r.overview) || {}, body = (r && r.body) || {};

        // 該已結算月份是否有真實資料
        const hasData = (fit.sessions || 0) > 0 || (car.run_count || 0) > 0 || (nut.logged_days || 0) > 0;
        if (!hasData) {
            // 已解鎖過（曾完成一個完整月份）→ 該月剛好沒紀錄：給溫和空狀態
            if (isRecapUnlocked(userId)) return { _empty: true, monthZh: settled.zh };
            // 從未解鎖（還沒完成第一個完整月份）→ 鎖定，提示先完成一個月訓練
            return { _locked: true, nextLabel: getNextSettlementLabel() };
        }

        // 🔑 有真實月資料時：缺漏欄位一律歸 0（顯示為灰色空值），
        //    不再用 RECAP_FALLBACK 的假數字補位，避免把 180kg/8400kcal 等示範值當成真的。
        //    真正「整月完全沒資料」的情況由上面的 _empty / _locked 分支處理。
        const rnum = (v) => num(v, 0); // real-only：缺就 0

        // 三大營養素佔比（由平均克數換算熱量比例）
        const cCal = (nut.avg_carbs || 0) * 4, pCal = (nut.avg_protein || 0) * 4, fCal = (nut.avg_fats || 0) * 9;
        const macroTot = cCal + pCal + fCal;
        const macroPct = macroTot > 0
            ? { carbsPct: Math.round(cCal / macroTot * 100), proteinPct: Math.round(pCal / macroTot * 100), fatsPct: Math.round(fCal / macroTot * 100) }
            : { carbsPct: 0, proteinPct: 0, fatsPct: 0 };

        // 肌群分布對映（缺的肌群 → 0，不借用示範值）
        const mdSrc = fit.muscle_distribution || {};
        const md = {};
        ['chest', 'back', 'core', 'arms', 'legs'].forEach(mg => {
            const m = mdSrc[mg];
            md[mg] = m ? { pct: Math.round(m.percentage || 0), vol: Math.round(m.volume || 0) } : { pct: 0, vol: 0 };
        });
        const focusName = { chest: 'Chest', back: 'Back', core: 'Core', arms: 'Arms', legs: 'Legs' };
        const topMg = Object.entries(mdSrc).sort((a, b) => (b[1].volume || 0) - (a[1].volume || 0)).slice(0, 2).map(([k]) => focusName[k] || k);

        // 訓練日 → 取「日」數字 set
        const dayOf = (ds) => parseInt(String(ds).split('-')[2], 10);
        const trainingDaysSet = Array.isArray(ov.training_days) && ov.training_days.length
            ? new Set(ov.training_days.map(dayOf).filter(Boolean))
            : new Set(); // 無真實訓練日 → 空日曆（不借示範日）

        return {
            ...base,
            monthEn: r.meta?.month_en || base.monthEn, monthZh: r.meta?.month_zh || base.monthZh,
            year: r.meta?.year || base.year, daysInMonth: r.meta?.days_in_month || base.daysInMonth,
            activeDays: rnum(ov.active_days),
            totalWorkouts: rnum(fit.sessions),
            totalHours: rnum(ov.total_hours),
            totalVolume: rnum(fit.total_volume_kg),
            totalReps: rnum(fit.total_reps),
            totalSets: rnum(fit.total_sets),
            avgIntensity: rnum(fit.avg_score),
            maxLoad: rnum(fit.max_load ?? fit.max_weight),
            workoutBurn: rnum(fit.total_calories ?? fit.workout_burn),
            individualWorkouts: Array.isArray(fit.workout_trend) && fit.workout_trend.length
                ? fit.workout_trend.map(w => ({ label: String(w.date || '').slice(8, 10) || '–', volume: Math.round(w.volume || 0) }))
                : [],
            muscleData: md,
            primaryFocus: topMg.length ? topMg.join(' & ') : '—',
            prsThisMonth: Array.isArray(fit.prs) && fit.prs.length
                ? fit.prs.slice(0, 3).map(p => ({ name: p.exercise || p.name || 'PR', weight: Math.round(p.weight || p.new_weight || 0), growth: Math.round(p.growth || p.increase || 0) }))
                : [],
            cardio: {
                distance: rnum(car.total_distance_km),
                calories: rnum(car.total_calories),
                avgPace: rnum(car.avg_pace_sec),
                totalElevation: rnum(car.total_elevation_m),
                individualRuns: Array.isArray(car.individual_runs) && car.individual_runs.length
                    ? car.individual_runs.map(rn => ({ date: String(rn.date || '').slice(5) || '–', distance: num(rn.distance, 0) }))
                    : [],
                hrZones: (car.hr_zones && (car.hr_zones.z2 || car.hr_zones.z3 || car.hr_zones.z4))
                    ? { z2: num(car.hr_zones.z2, 0), z3: num(car.hr_zones.z3, 0), z4: num(car.hr_zones.z4, 0) }
                    : { z2: 0, z3: 0, z4: 0 },
            },
            trainingDaysSet,
            bestStreak: rnum(ov.best_streak),
            consistencyPct: rnum(ov.consistency_pct),
            nutrition: {
                caloriesAvg: rnum(nut.avg_calories),
                ...macroPct,
                hydrationAvg: rnum(nut.avg_hydration_l),
                logDays: rnum(nut.logged_days),
            },
            weightDelta: rnum(body.weight_delta),
            bodyFatDelta: rnum(body.fat_delta),
            muscleDelta: rnum(body.muscle_delta),
            weightTrend: (Array.isArray(body.weight_trend) && body.weight_trend.length) ? body.weight_trend : [],
        };
    } catch (e) {
        console.warn('[WeeklyRecap] 取真實資料失敗：', e);
        // 取資料失敗：已解鎖過 → 溫和空狀態；否則鎖定
        if (isRecapUnlocked(getUserId())) return { _empty: true, monthZh: settled.zh };
        return { _locked: true, nextLabel: getNextSettlementLabel() };
    }
}

// 🎬 範例資料：用內建示範值（RECAP_FALLBACK）組出完整 recap，供「預覽範例」按鈕使用。
//    標記 _demo，讓畫面顯示「範例」並避免被當成真月報而清掉新結算紅點。
function buildDemoData() {
    const now = new Date();
    return {
        _demo: true,
        monthEn: MONTHS_EN[now.getMonth()], monthZh: MONTHS_ZH[now.getMonth()], year: now.getFullYear(),
        daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
        monthStart: toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
        ...RECAP_FALLBACK,
    };
}

/* ── 主元件 ── */
/* ── 分享圖：瑞士雜誌極簡幾何（International Typographic Style）──
   重新排版組件的主要數據（跑步 / 健身 / 飲食 + 綜合），固定 540×960（9:16），
   由 html2canvas 以 scale:2 擷取成 1080×1920 適合 IG 限動。 */
const RecapShareCard = ({ d, innerRef }) => {
    const km = Number(d.cardio?.distance ?? 0);
    const runs = Array.isArray(d.cardio?.individualRuns) ? d.cardio.individualRuns.length : 0;
    const volT = Number(d.totalVolume ?? 0) / 1000;
    return (
        <div ref={innerRef} style={{ width: 540, height: 960, background: V.paper, color: V.black, fontFamily: 'var(--font-body)', padding: 46, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* 頂部：品牌 + 標題 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.24em' }}>DRVN</div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.26em', opacity: 0.5, textAlign: 'right', lineHeight: 1.5 }}>MONTHLY<br />RECAP</div>
            </div>
            {/* 巨型月份 + 珊瑚色幾何塊 */}
            <div style={{ marginTop: 34, position: 'relative' }}>
                <div style={{ position: 'absolute', left: -46, top: 14, width: 16, height: 132, background: V.coral }} />
                <div style={{ fontSize: 112, fontWeight: 900, lineHeight: 0.84, letterSpacing: '-0.05em' }}>{d.monthEn}</div>
                {/* 手繪紅色底線 */}
                <svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block', width: 240, height: 15, marginTop: 4 }}>
                    <path d="M8 13 C72 5 152 17 224 8 C258 4 282 12 295 8" fill="none" stroke={V.coral} strokeWidth="5.5" strokeLinecap="round" />
                </svg>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', marginTop: 12 }}>{d.monthZh}回顧 · {d.year}</div>
            </div>
            {/* 三支柱主要數據 */}
            <div style={{ marginTop: 'auto' }}>
                <Row en="RUN" zh="跑步" value={km.toFixed(1)} unit="KM" sub={`${runs} 次出門`} highlight />
                <Row en="LIFT" zh="健身" value={String(d.totalWorkouts ?? 0)} unit="次" sub={`${volT.toFixed(1)} 噸總量`} />
                <Row en="EAT" zh="飲食" value={String(d.nutrition?.logDays ?? 0)} unit="天" sub={`${d.nutrition?.caloriesAvg ?? 0} kcal/日`} />
            </div>
            {/* 底部：三個綜合數據 */}
            <div style={{ marginTop: 30, paddingTop: 20, borderTop: `2px solid ${V.black}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                <Mini label="活躍天數" value={d.activeDays ?? 0} />
                <Mini label="一致性" value={`${d.consistencyPct ?? 0}%`} />
                <Mini label="連續紀錄" value={`${d.bestStreak ?? 0}天`} />
            </div>
        </div>
    );
};

const WeeklyRecapViewMobile = () => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [current, setCurrent] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [progressKey, setProgressKey] = useState(0);
    const shareRef = useRef(null);
    const [isSharing, setIsSharing] = useState(false);

    const userId = getUserId() || '';
    // data 從 null → 有值（buildMonthlyData 完成後），用來驅動 DataPulse
    const weeklyPatchReady = data !== null;

    useEffect(() => {
        if (isPaused || !data) return;
        const t = setTimeout(() => { if (current < TOTAL_SLIDES - 1) { setCurrent(c => c + 1); setProgressKey(k => k + 1); } }, SLIDE_DURATION);
        return () => clearTimeout(t);
    }, [current, isPaused, data, progressKey]);

    const handleTap = useCallback((e) => {
        if (e.target.closest('button')) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
        if (x < rect.width * 0.3) { setCurrent(c => Math.max(0, c - 1)); setProgressKey(k => k + 1); setIsPaused(false); }
        else if (x > rect.width * 0.7) { if (current < TOTAL_SLIDES - 1) { setCurrent(c => c + 1); setProgressKey(k => k + 1); setIsPaused(false); } }
        else setIsPaused(p => !p);
    }, [current]);

    useEffect(() => { buildMonthlyData().then(setData); }, []);

    // 顯示到真實已結算月報 → 標記已看，清掉首頁卡片紅點與「報告出爐」橫幅。
    // 範例預覽 (_demo) 不算「看過真月報」，不清紅點。
    useEffect(() => {
        if (data && !data._locked && !data._empty && !data._demo) markSettlementSeen(getSettledMonth().ym);
    }, [data]);

    // 把瑞士風分享圖轉成圖檔；優先呼叫手機原生分享，不支援時退回下載。
    const handleShare = async (e) => {
        if (e) e.stopPropagation();
        if (isSharing || !shareRef.current) return;
        setIsSharing(true);
        try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(shareRef.current, { backgroundColor: V.paper, scale: 2, useCORS: true, logging: false });
            const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.95));
            const fname = `DRVN_${data.monthEn}_${data.year}_recap.png`;
            // 🩹 L: 單一分享出口（打包版走原生分享面板；WKWebView 無 Web Share API）
            await shareImageBlob(blob, { filename: fname, title: 'DRVN Recap', text: `我的 ${data.monthZh}運動回顧` });
        } catch (err) {
            console.error('[WeeklyRecap] 分享失敗：', err);
        } finally {
            setIsSharing(false);
        }
    };

    if (!data) return <div style={{ position: 'fixed', inset: 0, background: V.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}><Zap size={32} /></motion.div></div>;

    // 🔒 鎖定：還沒完成第一個完整月份 → 提示先完成一個月訓練
    if (data._locked) {
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: V.mist, maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)' }}>
                <motion.button {...pressProps('row')} onClick={() => navigate(-1)} aria-label="關閉" style={{ position: 'absolute', top: 62, right: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></motion.button>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: V.stone, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}><Lock size={30} color={V.black} strokeWidth={2} /></div>
                <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.25em', color: 'rgba(22,20,21,0.45)', marginBottom: 10 }}>MONTHLY RECAP · LOCKED</p>
                <h2 style={{ fontFamily: TENOR, fontSize: 30, fontWeight: 400, color: V.black, lineHeight: 1.2, marginBottom: 14 }}>先完成一個月的訓練</h2>
                <p style={{ fontSize: 14, color: 'rgba(22,20,21,0.6)', lineHeight: 1.7, maxWidth: 300 }}>
                    月報會在每月 1 號結算上個完整月份的成效。完成你的第一個完整月份後，第一份月報將於 <b style={{ color: V.coral }}>{data.nextLabel}</b> 出爐。
                </p>
                <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.45)' }}>
                    <CalendarClock size={15} /> 下次結算：{data.nextLabel}
                </div>
                <motion.button {...pressProps('row')} onClick={() => { setCurrent(0); setData(buildDemoData()); }}
 style={{ marginTop: 28, padding: '11px 22px', background: V.black, color: V.paper, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <Zap size={15} /> 預覽範例月報
                </motion.button>
                <p style={{ marginTop: 10, fontSize: 11, color: 'rgba(22,20,21,0.4)' }}>範例為示範數據，非你的真實成績</p>
            </div>
        );
    }

    // 📭 已解鎖但該結算月份無紀錄 → 溫和空狀態
    if (data._empty) {
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: V.mist, maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)' }}>
                <motion.button {...pressProps('row')} onClick={() => navigate(-1)} aria-label="關閉" style={{ position: 'absolute', top: 62, right: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></motion.button>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: V.stone, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}><Trophy size={30} color={V.black} strokeWidth={2} /></div>
                <h2 style={{ fontFamily: TENOR, fontSize: 28, fontWeight: 400, color: V.black, lineHeight: 1.2, marginBottom: 14 }}>{data.monthZh}沒有訓練紀錄</h2>
                <p style={{ fontSize: 14, color: 'rgba(22,20,21,0.6)', lineHeight: 1.7, maxWidth: 300 }}>這個結算月份還沒有任何跑步、健身或營養資料。動起來，下個月的月報就會精彩起來。</p>
                <motion.button {...pressProps('row')} onClick={() => { setCurrent(0); setData(buildDemoData()); }}
 style={{ marginTop: 28, padding: '11px 22px', background: V.black, color: V.paper, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <Zap size={15} /> 預覽範例月報
                </motion.button>
                <p style={{ marginTop: 10, fontSize: 11, color: 'rgba(22,20,21,0.4)' }}>範例為示範數據，非你的真實成績</p>
            </div>
        );
    }

    const slides = [
        <SlideCover d={data} patchReady={weeklyPatchReady} />, <SlideConsistency d={data} />, <SlideCardio d={data} />, <SlideStrength d={data} />,
        <SlideTrophyRoom d={data} />, <SlideMuscle d={data} />, <SlideWellnessSummary d={data} />, <SlideClosing d={data} onClose={() => navigate(-1)} onReport={() => navigate('/monthly-report-mobile')} />
    ];

    return (
        <motion.div
            onClick={handleTap}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: V.mist, maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)', userSelect: 'none', cursor: 'pointer' }}
        >
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
                /* 🏗 拉絲鈦金屬紋理（11.jpeg）— 低透明度 + luminosity 混合，只取金屬反光不染色，當質感 garnish */
                .recap-brushed::before {
                    content: ''; position: absolute; inset: 0; border-radius: inherit;
                    background-image: url('/desktop/11.jpeg');
                    background-size: cover; background-position: center;
                    opacity: 0.20; mix-blend-mode: luminosity; pointer-events: none; z-index: 0;
                }
                /* 鈦金屬斜向高光掃過 */
                .recap-sheen::after {
                    content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 1;
                    background: linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.10) 42%, rgba(255,255,255,0.02) 50%, transparent 62%);
                }
            `}</style>
            <div style={{ padding: '54px 12px 10px', zIndex: 60 }}><ProgressBar key={progressKey} total={TOTAL_SLIDES} current={current} duration={SLIDE_DURATION} /></div>
            <motion.button {...pressProps('row')} onClick={e => { e.stopPropagation(); navigate(-1); }} style={{ position: 'absolute', top: 62, right: 16, zIndex: 60, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></motion.button>
            {/* 範例預覽標示 */}
            {data._demo && (
                <div style={{ position: 'absolute', top: 66, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '4px 12px', borderRadius: 14, background: V.black, color: V.paper, fontSize: 12, fontWeight: 900, letterSpacing: '0.18em' }}>範例預覽</div>
            )}
            {/* 左上角分享按鈕已依需求移除 */}
            {/* 離屏渲染的分享圖（供 html2canvas 擷取，不顯示在畫面上）*/}
            <div aria-hidden="true" style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none', opacity: 0 }}>
                <RecapShareCard d={data} innerRef={shareRef} />
            </div>
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <AnimatePresence mode="wait">
                    <motion.div key={current} variants={slideV} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35 }} style={{ width: '100%', height: '100%' }}>{slides[current]}</motion.div>
                </AnimatePresence>
            </div>
            {isPaused && <div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '6px 16px', borderRadius: 18, background: 'rgba(0,0,0,0.6)', color: V.paper, fontSize: 11, fontWeight: 900, letterSpacing: '0.15em' }}>PAUSED</div>}
        </motion.div>
    );
};

export default WeeklyRecapViewMobile;
