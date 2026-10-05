/**
 * AntigravityMuscleMap — v7
 *
 * CHANGE from v6: removed confirm dialog after scan.
 * Parent now handles forced form opening via onPhotoAdd.
 */

import React, { useState, useCallback, memo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BodyScanner from './BodyScanner';
import BodyPhotoCompare from './BodyPhotoCompare';
import { T } from '../utils/theme';

const FontInjector = () => (<style>{`
    @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
    .ag-display { font-family: 'Tenor Sans', sans-serif !important; }
    .ag-serif   { font-family: 'Tenor Sans', sans-serif !important; }
    .ag-body    { font-family: 'Tenor Sans', sans-serif !important; }
    @keyframes ag-fill { from { width:0% } to { width:var(--target-w) } }
    @keyframes ag-pop  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
  `}</style>);


const recoveryStroke = s => s >= 90 ? '#84A98C' : s >= 70 ? '#A4C3B2' : s >= 50 ? T.PEBBLE : s >= 30 ? T.CORAL : T.EMBER;
const pctDelta = (now, prev) => { const n = parseFloat(now), p = parseFloat(prev); return (!n || !p || p === 0) ? null : ((n - p) / p) * 100; };

const FRONT = [
    // CHEST
    { id: 'chest_upper', d: "M 500 350 Q 400 340 380 395 L 500 425 L 620 395 Q 600 340 500 350 Z" },
    { id: 'chest_lower', d: "M 380 400 L 500 435 L 620 400 Q 580 460 505 450 L 500 450 L 495 450 Q 420 460 380 400 Z" },

    // ABS
    { id: 'abs_upper', d: "M 495 455 Q 430 460 440 520 L 500 530 L 560 520 Q 570 460 505 455 Z" },
    { id: 'abs_lower', d: "M 440 520 L 500 530 L 560 520 Q 570 580 500 600 Q 430 580 440 520 Z" },

    // DELTS
    { id: 'left_front_delt', d: "M 380 340 Q 300 350 315 390 L 380 400 Z" },
    { id: 'right_front_delt', d: "M 620 340 Q 700 350 685 390 L 620 400 Z" },

    // ARMS
    {
        id: 'left_biceps',
        d: `
          M 320 430
          Q 285 500 320 575
          Q 355 560 355 470
          Z
        `
    },
    {
        id: 'left_forearm',
        d: `
          M 325 585
          Q 285 670 330 735
          L 355 720
          Q 350 650 350 585
          Z
        `
    },
    {
        id: 'right_biceps',
        d: `
          M 680 430
          Q 715 500 680 575
          Q 645 560 645 470
          Z
        `
    },
    {
        id: 'right_forearm',
        d: `
          M 675 585
          Q 715 670 670 735
          L 645 720
          Q 650 650 650 585
          Z
        `
    },

    // LEGS
    {
        id: 'left_quads',
        d: `
          M 485 620
          L 410 610
          Q 390 760 430 860
          L 485 845
          Z
        `
    },
    {
        id: 'left_calves',
        d: `
          M 435 890
          Q 400 1010 430 1110
          L 465 1110
          Q 475 1010 468 910
          Z
        `
    },
    {
        id: 'right_quads',
        d: `
          M 515 620
          L 590 610
          Q 610 760 570 860
          L 515 845
          Z
        `
    },
    {
        id: 'right_calves',
        d: `
          M 565 890
          Q 600 1010 570 1110
          L 535 1110
          Q 525 1010 532 910
          Z
        `
    },
];

const BACK = [
    // TRAPS (Refined edge)
    {
        id: 'traps',
        d: `
          M 500 250
          Q 455 265 430 305
          L 470 365
          L 530 365
          L 570 305
          Q 545 265 500 250
          Z
        `,
    },

    // REAR DELTS (Independent)
    {
        id: 'left_rear_delt',
        d: `
          M 405 320
          Q 340 340 315 390
          Q 355 425 400 395
          Z
        `
    },
    {
        id: 'right_rear_delt',
        d: `
          M 595 320
          Q 660 340 685 390
          Q 645 425 600 395
          Z
        `
    },

    // LATS (Refined V-Shape)
    {
        id: 'left_lats',
        d: `
          M 430 340
          Q 350 450 395 610
          L 500 650
          L 500 430
          Z
        `
    },
    {
        id: 'right_lats',
        d: `
          M 570 340
          Q 650 450 605 610
          L 500 650
          L 500 430
          Z
        `
    },

    { id: 'left_triceps', d: "M 340 430 Q 300 520 325 620 Q 370 590 370 500 Z" },
    { id: 'right_triceps', d: "M 660 430 Q 700 520 675 620 Q 630 590 630 500 Z" },
    { id: 'spinal_erectors', d: "M 500 580 L 470 560 Q 470 650 490 720 L 510 720 Q 530 650 530 560 Z" },
    { id: 'glutes', d: "M 495 720 L 410 680 Q 395 760 485 790 Z M 505 720 L 590 680 Q 605 760 515 790 Z" },

    // HAMSTRINGS
    { id: 'left_hamstrings', d: "M 485 800 L 420 770 Q 400 870 440 950 L 490 930 Z" },
    { id: 'right_hamstrings', d: "M 515 800 L 580 770 Q 600 870 560 950 L 510 930 Z" },

    // CALVES (BACK)
    { id: 'left_calves_back', d: "M 440 960 Q 395 1040 430 1120 L 465 1120 Q 475 1030 470 970 Z" },
    { id: 'right_calves_back', d: "M 560 960 Q 605 1040 570 1120 L 535 1120 Q 525 1030 530 970 Z" },
];

const MUSCLE_KEYS = [
    { key: 'left_arm_muscle', label: '左臂' },
    { key: 'right_arm_muscle', label: '右臂' },
    { key: 'trunk_muscle', label: '軀幹' },
    { key: 'left_leg_muscle', label: '左腿' },
    { key: 'right_leg_muscle', label: '右腿' }
];

const calcScore = (now, prev) => { if (!prev || !Object.keys(prev).length) return null; let pts = 0, n = 0; MUSCLE_KEYS.forEach(({ key }) => { const d = pctDelta(now[key], prev[key]); if (d !== null) { pts += Math.max(-20, Math.min(20, d)); n++; } }); const fd = pctDelta(now.body_fat_percentage, prev.body_fat_percentage); if (fd !== null) { pts += Math.max(-20, Math.min(20, -fd)); n++; } return n ? Math.max(0, Math.min(100, Math.round(50 + (pts / n) * 5))) : null; };
const gradeOf = s => {
    if (s === null) return { letter: '—', label: '無數據',     col: 'rgba(22,20,21,0.4)', bg: T.STONE,  sub: '分析等待中' };
    if (s >= 88)   return { letter: 'S', label: '卓越', col: '#161415',            bg: T.PEBBLE, sub: '頂尖水準' };
    if (s >= 75)   return { letter: 'A', label: '強壯',      col: '#fff',               bg: '#84A98C', sub: '高質量' };
    if (s >= 60)   return { letter: 'B', label: '進步中', col: '#161415',            bg: '#A4C3B2', sub: '積極成長' };
    if (s >= 45)   return { letter: 'C', label: '穩定',      col: '#161415',            bg: T.STONE,  sub: '基準同步' };
    return               { letter: 'D', label: 'KEEP PUSHING', col: '#fff',               bg: T.EMBER,  sub: 'Critical Delta' };
};

const BodyLabel = ({ label, val, style: s }) => (
    <div style={{ background: 'rgba(246,244,241,0.95)', backdropFilter: 'blur(20px)', borderRadius: 18, padding: '10px 14px', border: '1px solid rgba(22,20,21,0.08)', minWidth: 70, boxShadow: '0 8px 24px rgba(0,0,0,0.06)', ...s }}>
        <p className="ag-display" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, color: 'rgba(22,20,21,0.4)', margin: '0 0 2px', textTransform: 'uppercase' }}>{label}</p>
        <p className="ag-display" style={{ fontSize: 18, fontWeight: 300, color: T.BLACK, margin: 0, letterSpacing: -1 }}>
            {val ? `${parseFloat(val).toFixed(1)}` : '—'}
            <span style={{ fontSize: 11, fontWeight: 800, marginLeft: 2, opacity: 0.3 }}>KG</span>
        </p>
    </div>
);

const AmplitudeBar = ({ label, now, prev, color, delay = 0 }) => {
    const nf = parseFloat(now) || 0;
    const pf = parseFloat(prev) || 0;
    const mx = Math.max(nf, pf, 0.1);
    const d  = pctDelta(now, prev);
    return (
        <div style={{ marginBottom: 20, animation: `ag-pop .4s ease ${delay}ms both` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="ag-display" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2.5, color: 'rgba(22,20,21,0.3)', textTransform: 'uppercase' }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="ag-display" style={{ fontSize: 20, fontWeight: 300, color: T.BLACK, letterSpacing: -1 }}>
                        {nf > 0 ? nf.toFixed(1) : '—'}
                        <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.2, marginLeft: 2 }}>KG</span>
                    </span>
                    {d !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: d >= 0 ? 'rgba(132,169,140,0.1)' : 'rgba(249,92,75,0.1)', padding: '4px 8px', borderRadius: 100 }}>
                            <span className="ag-body" style={{ fontSize: 11, fontWeight: 900, color: d >= 0 ? '#84A98C' : T.CORAL }}>
                                {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%
                            </span>
                        </div>
                    )}
                </div>
            </div>
            <div style={{ position: 'relative', height: 10, background: 'rgba(22,20,21,0.03)', borderRadius: 18 }}>
                {pf > 0 && (
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 18, background: 'rgba(22,20,21,0.08)', '--target-w': `${(pf / mx) * 100}%`, animation: `ag-fill .8s cubic-bezier(0.16, 1, 0.3, 1) ${delay + 100}ms both`, zIndex: 1 }} />
                )}
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 18, background: color, '--target-w': `${(nf / mx) * 100}%`, animation: `ag-fill .9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both`, zIndex: 2, boxShadow: `0 4px 12px ${color}44` }} />
            </div>
        </div>
    );
};

const ProgressPanel = ({ composition, prevComposition, prevDate }) => {
    const score   = calcScore(composition, prevComposition);
    const grade   = gradeOf(score);
    const hasPrev = prevComposition && Object.keys(prevComposition).length > 0;
    const BAR_COLORS = [T.CORAL, '#84A98C', '#A4C3B2', T.PEBBLE, '#B0C26A'];
    return (
        <div className="ag-body" style={{ background: T.PAPER, borderTop: `1px solid rgba(22,20,21,0.06)` }}>
            {/* ── Score + Key Stats row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {/* Score cell */}
                <div style={{ background: grade.bg, padding: '32px 24px', borderRight: `1px solid rgba(255,255,255,0.1)` }}>
                    <p className="ag-display" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 4, color: grade.col, opacity: .4, margin: '0 0 8px', textTransform: 'uppercase' }}>Protocol Tier</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="ag-serif" style={{ fontSize: 84, fontWeight: 300, lineHeight: .75, color: grade.col, fontStyle: 'italic' }}>{grade.letter}</span>
                        <div style={{ borderLeft: `1px solid ${grade.col}33`, paddingLeft: 12 }}>
                            <p className="ag-display" style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: grade.col, textTransform: 'uppercase', margin: 0 }}>{grade.label}</p>
                            <p className="ag-display" style={{ fontSize: 9, fontWeight: 700, color: grade.col, opacity: .5, margin: '2px 0 0', textTransform: 'uppercase' }}>{grade.sub}</p>
                        </div>
                    </div>
                </div>
                {/* Key stats cell */}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, borderBottom: `1px solid rgba(22,20,21,0.06)` }}>
                    {[
                        { label: '肌肉量',   k: 'muscle_mass',       unit: 'KG', pk: 'muscle_mass',       good: true  },
                        { label: '體脂', k: 'body_fat_percentage', unit: '%', pk: 'body_fat_percentage', good: false },
                        { label: '體重',   k: 'weight',             unit: 'KG', pk: 'weight',             good: false },
                    ].map(({ label, k, unit, pk, good }) => {
                        const val  = composition[k];
                        const prev = prevComposition?.[pk];
                        const d    = pctDelta(val, prev);
                        const ok   = d !== null && (good ? d >= 0 : d <= 0);
                        return (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="ag-display" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, color: 'rgba(22,20,21,0.3)', textTransform: 'uppercase' }}>{label}</span>
                                <div style={{ textAlign: 'right' }}>
                                    <span className="ag-display" style={{ fontSize: 16, fontWeight: 300, color: T.BLACK, letterSpacing: -1 }}>
                                        {val ? parseFloat(val).toFixed(1) : '—'}
                                        <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.2, marginLeft: 2 }}>{unit}</span>
                                    </span>
                                    {d !== null && (<span className="ag-body" style={{ fontSize: 11, fontWeight: 800, color: ok ? '#84A98C' : T.CORAL, marginLeft: 6 }}>{d >= 0 ? '+' : ''}{d.toFixed(1)}%</span>)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Amplitude bars ── */}
            <div style={{ padding: '32px 24px 24px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                    <div>
                        <p className="ag-display" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 4, color: 'rgba(22,20,21,0.2)', textTransform: 'uppercase', margin: '0 0 4px' }}>System Report</p>
                        <h4 className="editorial-title text-2xl font-light italic text-[#161415]">Muscle Amplitude</h4>
                    </div>
                    {hasPrev && prevDate && (
                        <div style={{ textAlign: 'right' }}>
                            <span className="ag-display" style={{ fontSize: 11, fontWeight: 900, color: 'rgba(22,20,21,0.2)', letterSpacing: 1.5 }}>BENCHMARK № {prevDate}</span>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {MUSCLE_KEYS.map(({ key, label }, i) => (
                        <AmplitudeBar key={key} label={label} now={composition[key]} prev={prevComposition?.[key]} color={['#F95C4B', '#84A98C', '#A4C3B2', '#CFC6B8', '#B0C26A'][i % 5]} delay={i * 70} />
                    ))}
                </div>
            </div>

            {/* ── No prev data hint ── */}
            {!hasPrev && (
                <div style={{ margin: '0 24px 24px', padding: '16px 20px', background: 'rgba(249,92,75,0.05)', borderRadius: 24, borderLeft: `4px solid ${T.CORAL}` }}>
                    <p className="ag-body" style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', margin: 0, lineHeight: 1.6, fontWeight: 900, letterSpacing: 0.5 }}>新增第二筆 InBody 數據後，將自動顯示各部位進步幅度比較。</p>
                </div>
            )}
        </div>
    );
};

const AntigravityMuscleMap = ({ recoveryData = {}, composition = {}, prevComposition = {}, prevDate = null, bodyPhotos = [], activePhotoIndex = 0, onPhotoIndexChange, onPhotoAdd, onPhotoDelete, onOpenInBodyForm, buildCompositionForPhoto }) => {
    const [scanning, setScanning] = useState(false);
    const [view, setView] = useState('front');
    const [touchX, setTouchX] = useState(null);
    const [showCompare, setShowCompare] = useState(false);
    const [deletePhotoId, setDeletePhotoId] = useState(null); // ✅ 取代 window.confirm

    const handleDeletePhoto = useCallback(() => {
        if (deletePhotoId && onPhotoDelete) {
            onPhotoDelete(deletePhotoId);
        }
        setDeletePhotoId(null);
    }, [deletePhotoId, onPhotoDelete]);

    const idx = Math.min(activePhotoIndex ?? 0, Math.max(0, bodyPhotos.length - 1));
    const currentPhoto = bodyPhotos.length > 0 ? bodyPhotos[idx] : null;
    const slotImage = currentPhoto?.image ?? null;
    const finalImage = view === 'front' ? (slotImage ?? '/assets/model_front.png') : '/assets/model_front.png';
    const muscles = view === 'front' ? FRONT : BACK;
    const g = k => { const d = recoveryData[k]; if (typeof d === 'number') return Math.round(d); if (d?.hoursAgo != null) return Math.min(100, Math.round((d.hoursAgo / 48) * 100)); return 100; };
    const photoDate = currentPhoto?.date;
    const dateLabel = photoDate ? (() => { const d = new Date(photoDate); return `${d.getMonth() + 1}月${d.getDate()}日`; })() : (() => { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日`; })();

    if (scanning) {
        return (<div className="w-full max-w-md mx-auto z-50 bg-[#F4F1ED] p-4 rounded-3xl"><BodyScanner ghostImage={null}
            onScanComplete={img => {
                // ★ CHANGE: just pass image to parent. Parent handles form + save.
                if (onPhotoAdd) onPhotoAdd(img);
                setScanning(false);
            }}
            onCancel={() => setScanning(false)} /></div>);
    }

    return (
        <div style={{ width: '100%', maxWidth: 500, margin: '0 auto', borderRadius: 36, overflow: 'hidden', background: T.PAPER, boxShadow: '0 24px 60px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <FontInjector />
            <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 32, left: 32, zIndex: 20, pointerEvents: 'none' }}>
                    <p className="ag-display" style={{ fontSize: 12, fontWeight: 900, letterSpacing: 4, color: T.BLACK, opacity: .3, margin: '0 0 6px', }}>量測期間</p>
                    <p key={dateLabel} className="ag-display" style={{ fontSize: 42, fontWeight: 300, fontStyle: 'italic', color: T.BLACK, margin: 0, lineHeight: .9, animation: 'ag-pop .4s ease both' }}>{dateLabel}</p>
                    <div style={{ display: 'flex', background: 'rgba(26,26,26,0.05)', backdropFilter: 'blur(20px)', borderRadius: 100, padding: 4, marginTop: 16, pointerEvents: 'auto', width: 'fit-content', border: '1px solid rgba(0,0,0,0.05)' }}>
                        {[['FRONT','正面'], ['BACK','背面']].map(([v, label]) => (
                            <motion.button {...pressProps('row')} 
 key={v} 
 onClick={() => setView(v.toLowerCase())} 
 style={{ padding: '6px 18px', borderRadius: 100, border: 'none', cursor: 'pointer', fontFamily: "'Tenor Sans',sans-serif", fontSize: 11, fontWeight: 900, letterSpacing: 2, background: view === v.toLowerCase() ? T.BLACK : 'transparent', color: view === v.toLowerCase() ? '#fff' : 'rgba(26,26,26,0.4)', transition: 'all .3s cubic-bezier(0.16, 1, 0.3, 1)' }}
 >
                                {label}
                            </motion.button>
                        ))}
                    </div>
                </div>

                <motion.button
                    onClick={() => setScanning(true)}
                    whileTap={{ scale: 0.93 }}
                    whileHover={{ scale: 1.04 }}
                    style={{ position: 'absolute', top: 32, right: 32, zIndex: 20, fontFamily: "'Tenor Sans',sans-serif", fontSize: 9, fontWeight: 900, letterSpacing: 2.5, textTransform: 'uppercase', background: T.BLACK, color: '#fff', padding: '8px 14px', borderRadius: 100, border: 'none', cursor: 'pointer', boxShadow: '0 6px 14px rgba(0,0,0,0.18)' }}
                >
                    Scan {view}
                </motion.button>

                <div style={{ position: 'relative', paddingTop: 100, paddingBottom: 24, touchAction: 'pan-y' }}
                    onTouchStart={e => setTouchX(e.touches[0].clientX)}
                    onTouchEnd={e => { if (touchX === null) return; const dx = touchX - e.changedTouches[0].clientX; if (dx > 50 && idx > 0) onPhotoIndexChange?.(idx - 1); else if (dx < -50 && idx < bodyPhotos.length - 1) onPhotoIndexChange?.(idx + 1); setTouchX(null); }}>
                    <img loading="lazy" decoding="async" key={`photo-${idx}`} src={finalImage} alt={`body ${dateLabel}`} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover', mixBlendMode: 'multiply', opacity: 0.95 }} />
                    {currentPhoto && onPhotoDelete && (
                        <motion.button
                            onClick={() => setDeletePhotoId(currentPhoto.id)}
                            whileTap={{ scale: 0.9 }}
                            style={{ position: 'absolute', bottom: 32, right: 24, width: 44, height: 44, borderRadius: 24, background: T.EMBER, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, boxShadow: '0 8px 16px rgba(217,64,48,0.3)' }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                        </motion.button>
                    )}
                    <svg viewBox="0 0 1000 1200" style={{ position: 'absolute', top: 100, left: 0, width: '100%', height: 'calc(100% - 124px)', zIndex: 10, pointerEvents: 'none' }}>{muscles.map((m, i) => (<path key={i} d={m.d} fill="transparent" stroke={recoveryStroke(g(m.id))} strokeWidth="4" opacity={.6} />))}</svg>
                    <svg viewBox="0 0 1000 1200" style={{ position: 'absolute', top: 100, left: 0, width: '100%', height: 'calc(100% - 124px)', zIndex: 20, pointerEvents: 'none' }}>{['M 500 400 L 805 240', 'M 330 460 L 195 460', 'M 440 730 L 195 730', 'M 670 460 L 805 460', 'M 560 730 L 805 730'].map((d, i) => <path key={i} d={d} stroke="rgba(26,26,26,0.15)" strokeWidth="2" fill="none" />)}</svg>
                    <div style={{ position: 'absolute', top: 100, left: 0, width: '100%', height: 'calc(100% - 124px)', zIndex: 30, pointerEvents: 'none' }}>
                        <BodyLabel label="LEFT ARM" val={composition.left_arm_muscle} style={{ position: 'absolute', top: '38%', left: '2%' }} />
                        <BodyLabel label="LEFT LEG" val={composition.left_leg_muscle} style={{ position: 'absolute', top: '61%', left: '2%' }} />
                        
                        <BodyLabel label="TRUNK" val={composition.trunk_muscle} style={{ position: 'absolute', top: '20%', right: '2%', textAlign: 'right' }} />
                        <BodyLabel label="RIGHT ARM" val={composition.right_arm_muscle} style={{ position: 'absolute', top: '38%', right: '2%', textAlign: 'right' }} />
                        <BodyLabel label="RIGHT LEG" val={composition.right_leg_muscle} style={{ position: 'absolute', top: '61%', right: '2%', textAlign: 'right' }} />
                    </div>
                </div>
            </div>

            {bodyPhotos.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '16px 0', borderTop: '1px solid rgba(22,20,21,0.05)', background: 'rgba(246,244,241,0.9)', backdropFilter: 'blur(10px)' }}>
                    <motion.button {...pressProps('row')} onClick={() => onPhotoIndexChange?.(Math.max(idx - 1, 0))} disabled={idx === 0} style={{ padding: 10, borderRadius: 18, border: 'none', background: 'transparent', cursor: 'pointer', opacity: idx === 0 ? .1 : .4 }}><ChevronLeft size={24} color={T.BLACK} /></motion.button>
                    <div style={{ textAlign: 'center' }}>
                        <p className="ag-display" style={{ fontSize: 24, fontWeight: 300, fontStyle: 'italic', color: T.BLACK, margin: 0, lineHeight: 1 }}>{bodyPhotos.length - idx} / {bodyPhotos.length}</p>
                        <p className="ag-display" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2.5, color: 'rgba(22,20,21,0.3)', margin: '2px 0 0', textTransform: 'uppercase' }}>Past Journey</p>
                    </div>
                    <motion.button {...pressProps('row')} onClick={() => onPhotoIndexChange?.(Math.min(idx + 1, bodyPhotos.length - 1))} disabled={idx === bodyPhotos.length - 1} style={{ padding: 10, borderRadius: 18, border: 'none', background: 'transparent', cursor: 'pointer', opacity: idx === bodyPhotos.length - 1 ? .1 : .4 }}><ChevronRight size={24} color={T.BLACK} /></motion.button>
                </div>
            )}

            {bodyPhotos.length >= 2 && buildCompositionForPhoto && (
                <div style={{ padding: '0 24px 16px', background: T.PAPER }}>
                    <motion.button {...pressProps('row')} 
 onClick={() => setShowCompare(true)} 
 className="ag-display" 
 style={{ width: '100%', padding: '16px 0', borderRadius: 18, border: `1.5px solid ${T.BLACK}`, background: 'transparent', cursor: 'pointer', fontSize: 9, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: T.BLACK, transition: 'all .3s' }}
 >
                        Compare Evolution
                    </motion.button>
                </div>
            )}

            <ProgressPanel composition={composition} prevComposition={prevComposition} prevDate={prevDate} />
            {showCompare && buildCompositionForPhoto && (<BodyPhotoCompare bodyPhotos={bodyPhotos} buildCompositionForPhoto={buildCompositionForPhoto} onClose={() => setShowCompare(false)} />)}

            {/* ✅ 刪除照片 Confirm Modal */}
            <AnimatePresence>
                {deletePhotoId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    >
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }} onClick={() => setDeletePhotoId(null)} />
                        <motion.div
                            initial={{ scale: 0.9, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.9, y: 20, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                            style={{ position: 'relative', width: '100%', maxWidth: 300, background: T.PAPER, borderRadius: 36, padding: 28, boxShadow: '0 30px 80px rgba(0,0,0,0.25)' }}
                        >
                            <h4 className="ag-display" style={{ fontSize: 18, fontWeight: 900, color: T.BLACK, margin: '0 0 8px' }}>確認刪除</h4>
                            <div style={{ width: 40, height: 3, background: T.EMBER, marginBottom: 16 }} />
                            <p className="ag-body" style={{ fontSize: 13, color: 'rgba(22,20,21,0.55)', lineHeight: 1.6, marginBottom: 20 }}>確定要刪除這張體態照片？此操作無法復原。</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <motion.button {...pressProps('row')} onClick={() => setDeletePhotoId(null)} style={{ flex: 1, padding: '12px 0', borderRadius: 18, border: 'none', background: 'rgba(22,20,21,0.07)', color: T.BLACK, fontSize: 13, fontWeight: 900, cursor: 'pointer', fontFamily: "'Tenor Sans',sans-serif" }}>取消</motion.button>
                                <motion.button {...pressProps('row')} onClick={handleDeletePhoto} style={{ flex: 1, padding: '12px 0', borderRadius: 18, border: 'none', background: T.EMBER, color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer', fontFamily: "'Tenor Sans',sans-serif" }}>刪除</motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AntigravityMuscleMap;
