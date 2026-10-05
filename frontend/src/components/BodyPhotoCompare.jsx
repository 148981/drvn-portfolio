import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const P = { orange: '#F28132', olive: '#6B7A45', yellow: '#F5D061', cream: '#F0ECDF', dark: '#161415', mid: '#3A3A3A', muted: 'rgba(26,26,26,0.42)' };

const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}月${d.getDate()}日`;
};

const CompareRow = ({ label, leftVal, rightVal, unit, goodUp }) => {
    const lv = parseFloat(leftVal) || 0;
    const rv = parseFloat(rightVal) || 0;
    const diff = lv - rv;
    const pct = rv !== 0 ? ((diff / rv) * 100) : 0;
    const hasBoth = lv > 0 && rv > 0;
    const improved = hasBoth && (goodUp ? diff > 0 : diff < 0);
    const worsened = hasBoth && (goodUp ? diff < 0 : diff > 0);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
            {/* Left (NEW) value */}
            <div style={{ textAlign: 'center' }}>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 900, color: P.dark }}>
                    {lv > 0 ? `${lv.toFixed(1)}` : '—'}
                </span>
                {lv > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: P.muted }}>{unit}</span>}
            </div>

            {/* Center: label + delta */}
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: P.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                {hasBoth && Math.abs(diff) >= 0.05 ? (
                    <div style={{
                        fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '1px 6px', display: 'inline-block',
                        color: improved ? P.olive : worsened ? P.orange : P.muted,
                        background: improved ? 'rgba(107,122,69,0.12)' : worsened ? 'rgba(242,129,50,0.12)' : 'transparent',
                    }}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                    </div>
                ) : hasBoth ? (
                    <div style={{ fontSize: 11, fontWeight: 600, color: P.muted }}>±0</div>
                ) : null}
            </div>

            {/* Right (OLD) value */}
            <div style={{ textAlign: 'center' }}>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 900, color: P.dark, opacity: 0.4 }}>
                    {rv > 0 ? `${rv.toFixed(1)}` : '—'}
                </span>
                {rv > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: P.muted, opacity: 0.4 }}>{unit}</span>}
            </div>
        </div>
    );
};

const BodyPhotoCompare = ({ bodyPhotos, buildCompositionForPhoto, onClose }) => {
    const [leftIdx, setLeftIdx] = useState(0);
    const [rightIdx, setRightIdx] = useState(Math.min(1, bodyPhotos.length - 1));

    // ★ FIX: pass INDEX to buildCompositionForPhoto, not photo object
    const leftComp = useMemo(() => buildCompositionForPhoto(leftIdx), [buildCompositionForPhoto, leftIdx]);
    const rightComp = useMemo(() => buildCompositionForPhoto(rightIdx), [buildCompositionForPhoto, rightIdx]);

    const leftPhoto = bodyPhotos[leftIdx];
    const rightPhoto = bodyPhotos[rightIdx];

    const navLeft = (dir) => {
        const n = leftIdx + dir;
        if (n >= 0 && n < bodyPhotos.length && n !== rightIdx) setLeftIdx(n);
    };
    const navRight = (dir) => {
        const n = rightIdx + dir;
        if (n >= 0 && n < bodyPhotos.length && n !== leftIdx) setRightIdx(n);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: P.cream, display: 'flex', flexDirection: 'column', fontFamily: "'Barlow', sans-serif" }}>
            <style>{}</style>

            {/* Header */}
            <div style={{ padding: '14px 20px', paddingTop: 'max(14px, env(safe-area-inset-top, 48px))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${P.dark}` }}>
                <div>
                    <h2 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 900, fontStyle: 'italic', color: P.dark, margin: 0 }}>BODY EVOLUTION</h2>
                    <p style={{ fontSize: 11, fontWeight: 700, color: P.muted, letterSpacing: 1.5, margin: 0 }}>選擇兩張照片比較數據變化</p>
                </div>
                <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(26,26,26,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={18} color={P.dark} />
                </motion.button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

                {/* Photos */}
                <div style={{ display: 'flex', gap: 8, padding: '14px 14px 0' }}>
                    {/* Left photo (NEW) */}
                    <div style={{ flex: 1 }}>
                        <div style={{ borderRadius: 18, overflow: 'hidden', aspectRatio: '3/4', background: '#ddd', border: `2.5px solid ${P.dark}`, position: 'relative' }}>
                            {leftPhoto?.image && <img loading="lazy" decoding="async" src={leftPhoto.image} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />}
                            <div style={{ position: 'absolute', top: 8, left: 8, background: P.dark, color: '#fff', padding: '3px 10px', borderRadius: 8, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>NEW</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8, background: 'rgba(26,26,26,0.05)', borderRadius: 12, padding: '5px 4px' }}>
                            <motion.button {...pressProps('row')} onClick={() => navLeft(1)} style={{ width: 26, height: 26, borderRadius: 13, background: 'rgba(26,26,26,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: leftIdx >= bodyPhotos.length - 1 ? 0.2 : 1 }}><ChevronLeft size={13} color={P.dark} /></motion.button>
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 800, color: P.dark, minWidth: 56, textAlign: 'center' }}>{fmtDate(leftPhoto?.date)}</span>
                            <motion.button {...pressProps('row')} onClick={() => navLeft(-1)} style={{ width: 26, height: 26, borderRadius: 13, background: 'rgba(26,26,26,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: leftIdx <= 0 ? 0.2 : 1 }}><ChevronRight size={13} color={P.dark} /></motion.button>
                        </div>
                    </div>

                    {/* VS */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 900, color: P.muted, fontStyle: 'italic' }}>VS</span>
                    </div>

                    {/* Right photo (OLD) */}
                    <div style={{ flex: 1 }}>
                        <div style={{ borderRadius: 18, overflow: 'hidden', aspectRatio: '3/4', background: '#ddd', border: '2px solid rgba(26,26,26,0.15)', position: 'relative' }}>
                            {rightPhoto?.image && <img loading="lazy" decoding="async" src={rightPhoto.image} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.75 }} alt="" />}
                            <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(26,26,26,0.45)', color: '#fff', padding: '3px 10px', borderRadius: 8, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>OLD</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8, background: 'rgba(26,26,26,0.05)', borderRadius: 12, padding: '5px 4px' }}>
                            <motion.button {...pressProps('row')} onClick={() => navRight(1)} style={{ width: 26, height: 26, borderRadius: 13, background: 'rgba(26,26,26,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: rightIdx >= bodyPhotos.length - 1 ? 0.2 : 1 }}><ChevronLeft size={13} color={P.dark} /></motion.button>
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 800, color: P.muted, minWidth: 56, textAlign: 'center' }}>{fmtDate(rightPhoto?.date)}</span>
                            <motion.button {...pressProps('row')} onClick={() => navRight(-1)} style={{ width: 26, height: 26, borderRadius: 13, background: 'rgba(26,26,26,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: rightIdx <= 0 ? 0.2 : 1 }}><ChevronRight size={13} color={P.dark} /></motion.button>
                        </div>
                    </div>
                </div>

                {leftIdx === rightIdx && (
                    <div style={{ margin: '12px 14px 0', padding: '8px 12px', background: 'rgba(242,129,50,0.1)', borderRadius: 12, borderLeft: `3px solid ${P.orange}` }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: P.orange, margin: 0 }}>請選擇不同的兩張照片進行比較</p>
                    </div>
                )}

                {/* Data comparison table */}
                <div style={{ margin: '16px 14px', background: '#fff', borderRadius: 18, padding: '16px 14px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 'max(20px, calc(env(safe-area-inset-bottom, 34px) + 12px))' }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr', alignItems: 'center', padding: '0 0 10px', borderBottom: '2px solid rgba(26,26,26,0.1)' }}>
                        <div style={{ textAlign: 'center', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 800, color: P.dark, letterSpacing: 1 }}>NEW</div>
                        <div style={{ textAlign: 'center', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 700, color: P.muted, letterSpacing: 1 }}>指標</div>
                        <div style={{ textAlign: 'center', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 800, color: P.muted, letterSpacing: 1 }}>OLD</div>
                    </div>

                    <CompareRow label="體重" leftVal={leftComp.weight} rightVal={rightComp.weight} unit="kg" goodUp={false} />
                    <CompareRow label="肌肉量" leftVal={leftComp.muscle_mass} rightVal={rightComp.muscle_mass} unit="kg" goodUp={true} />
                    <CompareRow label="體脂率" leftVal={leftComp.body_fat_percentage} rightVal={rightComp.body_fat_percentage} unit="%" goodUp={false} />

                    <div style={{ padding: '10px 0 6px', marginTop: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: P.muted, letterSpacing: 1.5, }}>肌肉分佈</span>
                    </div>
                    <CompareRow label="軀幹" leftVal={leftComp.trunk_muscle} rightVal={rightComp.trunk_muscle} unit="kg" goodUp={true} />
                    <CompareRow label="左臂" leftVal={leftComp.left_arm_muscle} rightVal={rightComp.left_arm_muscle} unit="kg" goodUp={true} />
                    <CompareRow label="右臂" leftVal={leftComp.right_arm_muscle} rightVal={rightComp.right_arm_muscle} unit="kg" goodUp={true} />
                    <CompareRow label="左腿" leftVal={leftComp.left_leg_muscle} rightVal={rightComp.left_leg_muscle} unit="kg" goodUp={true} />
                    <CompareRow label="右腿" leftVal={leftComp.right_leg_muscle} rightVal={rightComp.right_leg_muscle} unit="kg" goodUp={true} />

                    <div style={{ padding: '10px 0 6px', marginTop: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: P.muted, letterSpacing: 1.5, }}>其他指標</span>
                    </div>
                    <CompareRow label="BMR" leftVal={leftComp.bmr} rightVal={rightComp.bmr} unit="" goodUp={true} />
                    <CompareRow label="內臟脂" leftVal={leftComp.visceral_fat_level} rightVal={rightComp.visceral_fat_level} unit="" goodUp={false} />
                    <CompareRow label="體水率" leftVal={leftComp.body_water_percent} rightVal={rightComp.body_water_percent} unit="%" goodUp={true} />

                    {/* Legend */}
                    <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(26,26,26,0.03)', borderRadius: 12 }}>
                        <p style={{ fontSize: 11, color: P.muted, margin: 0, lineHeight: 1.6 }}>
                            數值差 = NEW − OLD。
                            <span style={{ color: P.olive, fontWeight: 700 }}> 綠色</span> = 進步
                            <span style={{ color: P.orange, fontWeight: 700 }}> 橘色</span> = 需注意
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BodyPhotoCompare;
