/**
 * PlanFullViewSheet.jsx  —  Full-page plan editor
 * ─────────────────────────────────────────────────────────────
 * Swiss-editorial full-screen page (slides in from right).
 * Week tabs → day sessions → exercise list with inline editing.
 *
 * Features:
 *   • Edit sets / reps / rest per exercise
 *   • Swap exercise  (opens exercise library picker)
 *   • Delete exercise
 *   • Add exercise
 *   • Saves via onPlanUpdate(updatedPlan)
 *   • 訓練區塊：把存好的區塊套到某一天／把某一天存成區塊（原「自訂計劃」頁的積木功能併進來）
 *   • 計劃庫：右上角進入自己排的其他計劃
 * ─────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { ArrowLeft, Check, Plus, Trash2, Edit2, ChevronDown, ChevronRight, X, Search, GripVertical } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { findExerciseByName } from '../utils/exerciseDB';
import { EXERCISE_MASTER_DB } from '../data/exerciseDatabase';
import ExercisePlanEditModal from './ExercisePlanEditModal';
import { BlockPickerModal, SaveWorkoutBlockModal } from './WorkoutBlockModals';
import { blockToDayExercises } from '../utils/workoutBlocks';
import { useNavigate } from 'react-router-dom';
import { Layers, BookmarkPlus, Library } from 'lucide-react';
import haptic from '../utils/haptics';

// ─── DESIGN TOKENS ────────────────────────────────────────────
const T = {
    INK:    '#161415',
    PAPER:  '#F6F4F1',
    STONE:  '#E8E2D8',
    PEBBLE: '#CFC6B8',
    CORAL:  '#F95C4B',
    EMBER:  '#D94030',
    MIST:   '#F0EDE7',
    WHITE:  '#FFFFFF',
};

const WEEK_PHASE = ['BASE', 'BUILD', 'PEAK', 'DELOAD'];

// ─── MUSCLE COLOR CHIP ─────────────────────────────────────────
const muscleMeta = (muscle = '') => {
    const m = muscle.toLowerCase();
    if (m.includes('chest') || m.includes('胸'))        return { bg: 'rgba(249,92,75,0.1)',  tx: '#F95C4B' };
    if (m.includes('back')  || m.includes('背'))        return { bg: 'rgba(22,20,21,0.07)',  tx: '#161415' };
    if (m.includes('glute') || m.includes('臀'))        return { bg: 'rgba(249,92,75,0.08)', tx: '#D94030' };
    if (m.includes('leg')   || m.includes('腿') || m.includes('quad') || m.includes('hamstring')) return { bg: 'rgba(207,198,184,0.5)', tx: '#161415' };
    if (m.includes('shoulder') || m.includes('肩'))     return { bg: 'rgba(22,20,21,0.05)',  tx: '#161415' };
    if (m.includes('bicep') || m.includes('tricep') || m.includes('arm') || m.includes('手')) return { bg: 'rgba(207,198,184,0.4)', tx: '#161415' };
    if (m.includes('core')  || m.includes('ab') || m.includes('腹'))  return { bg: 'rgba(249,92,75,0.06)', tx: '#F95C4B' };
    return { bg: 'rgba(22,20,21,0.04)', tx: 'rgba(22,20,21,0.35)' };
};

// 肌群 key → 中文標籤（給統一彈窗的 chip 用）
const SUBPART_ZH_MAP = { chest: '胸部', back: '背部', shoulder: '肩部', shoulders: '肩部', glutes: '臀部', glute: '臀部', legs: '腿部', lower: '下肢', arms: '手臂', bicep: '二頭', tricep: '三頭', core: '核心', general: '全身' };
const SUBPART_ZH_LABEL = (m = '') => SUBPART_ZH_MAP[String(m).toLowerCase()] || (m || 'General');

// ─── UNIFIED EXERCISE LIBRARY (from exerciseDatabase.js) ────────
// Category key order controls picker display order
const PICKER_CATEGORY_ORDER = ['chest', 'back', 'legs', 'glutes', 'shoulders', 'arms', 'core'];

// Build a flat lookup map: name → exercise object (for quick access)
const EXERCISE_BY_NAME = {};
EXERCISE_MASTER_DB.forEach(ex => {
    EXERCISE_BY_NAME[ex.name] = { ...ex };
});

// muscle field helper — reads from exerciseDatabase if available
const MUSCLE_FOR = (name) => {
    if (EXERCISE_BY_NAME[name]) {
        return EXERCISE_BY_NAME[name].cat;
    }
    const n = (name || '').toLowerCase();
    if (/(臥推|胸|飛鳥|夾胸|bench|chest|fly)/.test(n)) return 'chest';
    if (/(划船|下拉|引體|硬舉|背|row|pull|deadlift|lat)/.test(n)) return 'back';
    if (/(臀推|臀橋|蚌殼|臀|glute|hip thrust|kickback)/.test(n)) return 'glutes';
    if (/(深蹲|腿|弓箭步|squat|leg|lunge|calf|提踵)/.test(n)) return 'legs';
    if (/(肩推|側平舉|前平舉|肩|shoulder|lateral|overhead|raise)/.test(n)) return 'shoulder';
    if (/(彎舉|三頭|下壓|curl|tricep|pushdown|bicep)/.test(n)) return 'arms';
    if (/(平板|捲腹|腹輪|plank|crunch|ab|rollout)/.test(n)) return 'core';
    return 'general';
};

// Default for a brand-new exercise slot
const DEFAULT_EX = { sets: 3, reps: '10-12', rest: 90, cat: 'compound', eq: 'dumbbell', time: 7 };

// ─── EXERCISE IMAGE (lazy-loaded from open exercise DB) ────────
const imageCache = {}; // module-level: persists across re-renders

const ExerciseImage = memo(({ name, muscle }) => {
    const mc = muscleMeta(muscle || name || '');
    const [imgUrl, setImgUrl] = useState(() => imageCache[name] || null);
    const [err, setErr] = useState(false);

    useEffect(() => {
        if (!name || imgUrl || imageCache[name]) return;
        let cancelled = false;
        findExerciseByName(name).then(ex => {
            if (cancelled) return;
            const url = ex?.imageUrls?.[0] || ex?.gifUrl || null;
            if (url) { imageCache[name] = url; setImgUrl(url); }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

    if (imgUrl && !err) {
        return (
            <div style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', background: mc.bg, flexShrink: 0, border: `1px solid ${mc.tx}18` }}>
                <img loading="lazy" decoding="async"
                    src={imgUrl}
                    alt={name}
                    onError={() => setErr(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
            </div>
        );
    }

    // Fallback: muscle color chip with icon
    return (
        <div style={{ width: 44, height: 44, borderRadius: 12, background: mc.bg, border: `1px solid ${mc.tx}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Dumbbell size={15} color={mc.tx} />
        </div>
    );
});

const FIELD_OPTS = {
    sets: ['1','2','3','4','5','6'],
    reps: ['5','6','8','5-8','6-10','8-12','10-12','12-15','15-20','20+'],
    rest: ['30','45','60','90','120','150','180'],
    eq:   ['bodyweight','dumbbell','barbell','cable','band','machine','kettlebell'],
};

// ─── EXERCISE DETAIL OVERLAY ───────────────────────────────────
const ExerciseDetailSheet = ({ target, onClose, onPickerOpen, onUpdate }) => {
    const [local, setLocal]   = useState(null);
    const [dirty, setDirty]   = useState(false);
    const [field, setField]   = useState(null);

    React.useEffect(() => {
        if (target?.ex) { setLocal({ ...target.ex }); setDirty(false); setField(null); }
    }, [target]);

    if (!target || !local) return null;
    const mc = muscleMeta(local.muscle || '');
    const restVal = local.rest ? `${local.rest}`.replace('s','') : '60';

    const pick = (f, v) => { setLocal(p => ({ ...p, [f]: v })); setDirty(true); setField(null); };
    const save = () => { if (dirty && onUpdate) onUpdate(local); onClose(); };

    const Chip = ({ label, value, fieldKey, wide }) => {
        const active = field === fieldKey;
        return (
            <motion.div whileTap={{ scale: 0.94 }} onClick={() => setField(p => p === fieldKey ? null : fieldKey)}
                style={{
                    flex: wide ? 2 : 1, padding: wide ? '13px 16px' : '13px 8px',
                    borderRadius: 18, textAlign: wide ? 'left' : 'center', cursor: 'pointer',
                    background: active ? T.INK : T.WHITE,
                    border: `1.5px solid ${active ? T.INK : T.PEBBLE}`,
                    transition: 'all 0.15s',
                }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: active ? 'rgba(246,244,241,0.5)' : 'rgba(22,20,21,0.4)', marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: wide ? 14 : 18, fontWeight: 900, color: active ? T.PAPER : T.INK }}>
                    {fieldKey === 'rest' ? `${value}s` : value || '—'}
                </div>
            </motion.div>
        );
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 0 0' }}
            onClick={() => field ? setField(null) : save()}>
            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 500, background: T.PAPER, borderRadius: '28px 28px 0 0', padding: '8px 20px 0', boxShadow: '0 -20px 60px rgba(0,0,0,0.18)' }}>

                {/* Handle */}
                <div style={{ width: 36, height: 4, borderRadius: 99, background: T.PEBBLE, margin: '0 auto 18px' }} />

                {/* Muscle chip */}
                <div style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: 99, background: mc.bg, border: `1px solid ${mc.tx}25`, marginBottom: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: mc.tx, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{local.muscle || 'General'}</span>
                </div>

                {/* Name */}
                <h2 style={{ fontSize: 22, fontWeight: 900, color: T.INK, margin: '0 0 18px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>{local.name}</h2>

                {/* Fields */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <Chip label="SETS" value={local.sets} fieldKey="sets" />
                    <Chip label="REPS" value={local.reps} fieldKey="reps" />
                    <Chip label="REST" value={restVal} fieldKey="rest" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <Chip label="器材 Equipment" value={local.eq} fieldKey="eq" wide />
                </div>

                {/* Options drawer */}
                <AnimatePresence>
                    {field && (
                        <motion.div key={field} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden', marginBottom: 12 }}>
                            <div style={{ background: T.WHITE, border: `1px solid ${T.PEBBLE}`, borderRadius: 18, padding: '14px 16px' }}>
                                <div style={{ fontSize: 9, fontWeight: 900, color: T.CORAL, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>{field.toUpperCase()}</div>
                                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
                                    {(FIELD_OPTS[field] || []).map(opt => {
                                        const cur = String(local[field]).replace('s','');
                                        const isSel = cur === String(opt);
                                        return (
                                            <motion.button key={opt} whileTap={{ scale: 0.9 }} onClick={() => pick(field, field === 'rest' ? parseInt(opt) : opt)}
                                                style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 12, border: `1.5px solid ${isSel ? T.INK : T.PEBBLE}`, background: isSel ? T.INK : T.STONE, color: isSel ? T.PAPER : T.INK, fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em' }}>
                                                {field === 'rest' ? `${opt}s` : opt}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, paddingBottom: 40 }}>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={save}
                        style={{ flex: 1, padding: '14px', borderRadius: 18, background: T.STONE, border: `1px solid ${T.PEBBLE}`, color: T.INK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                        {dirty ? '✓ 儲存' : '關閉'}
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => { save(); onPickerOpen(); }}
                        style={{ flex: 2, padding: '14px', borderRadius: 18, background: T.INK, border: 'none', color: T.PAPER, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                        替換動作
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ─── EXERCISE ROW (reusable in picker) ────────────────────────
const ExerciseRow = ({ ex, onSelect, showCat = false }) => {
    const mc = muscleMeta(ex.catKey || ex.muscle || '');
    const typeLabel = TYPE_LABEL[ex.type] || ex.type || '';
    const typeColor = TYPE_COLOR[ex.type] || 'rgba(22,20,21,0.4)';
    const restStr = ex.rest ? `${ex.rest}` : '';
    return (
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => onSelect(ex)}
            style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.PEBBLE}`, background: T.WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%' }}>
            {/* Muscle chip */}
            <div style={{ width: 38, height: 38, borderRadius: 12, background: mc.bg, border: `1px solid ${mc.tx}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Dumbbell size={14} color={mc.tx} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.INK }}>{ex.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: typeColor, background: `${typeColor}15`, padding: '2px 7px', borderRadius: 99, letterSpacing: '0.08em', flexShrink: 0 }}>{typeLabel}</span>
                    {showCat && <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.35)', letterSpacing: '0.06em' }}>{ex.catLabel}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', fontWeight: 600, marginTop: 3, letterSpacing: '0.04em' }}>
                    {ex.sets}組 · {ex.reps}次{restStr ? ` · 休息 ${restStr}` : ''}
                </div>
            </div>
            <Plus size={14} color="rgba(22,20,21,0.25)" flexShrink={0} />
        </motion.button>
    );
};

// ─── EXERCISE PICKER (uses unified exerciseDatabase) ──────────
const TYPE_LABEL = { compound: '複合', isolation: '孤立', isometric: '靜態', dynamic: '動態', bodyweight: '自重', plyometric: '爆發', carry: '負重行走', complex: '複雜' };
const TYPE_COLOR = { compound: T.CORAL, isolation: 'rgba(22,20,21,0.4)', isometric: '#7B9EA0', dynamic: 'rgba(22,20,21,0.4)', bodyweight: '#A0855E', plyometric: '#C0614D', carry: '#7A7A7A', complex: '#9E5E8A' };

const ExercisePicker = ({ onSelect, onClose }) => {
    const [cat, setCat] = useState(null);
    const [query, setQuery] = useState('');
    // Search across all categories
    const searchResults = query.trim().length >= 1
        ? EXERCISE_MASTER_DB.filter(ex => 
            ex.name.toLowerCase().includes(query.trim().toLowerCase())
          )
        : null;

    const currentCatExercises = cat ? EXERCISE_MASTER_DB.filter(ex => {
        if (cat === 'chest') return ex.subPart.startsWith('chest');
        if (cat === 'back') return ex.cat === 'back';
        if (cat === 'legs') return ex.cat === 'lower'; // 腿日含臀：下肢動作全收（含臀大肌/腿後）
        if (cat === 'glutes') return ex.subPart === 'glutes';
        if (cat === 'shoulders') return ex.subPart.startsWith('delt');
        if (cat === 'arms') return ex.cat === 'arms';
        if (cat === 'core') return ex.cat === 'core';
        return false;
    }) : null;

    const catLabels = {
        chest: '胸部訓練', back: '背部訓練', legs: '腿部訓練', 
        glutes: '臀部訓練', shoulders: '肩膀訓練', arms: '手臂訓練', core: '核心訓練'
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end' }}
            onClick={onClose}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', background: T.PAPER, borderRadius: '28px 28px 0 0', maxHeight: '82dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 -20px 60px rgba(0,0,0,0.18)' }}>

                {/* Header */}
                <div style={{ padding: '8px 20px 12px', borderBottom: `1px solid ${T.STONE}`, flexShrink: 0 }}>
                    <div style={{ width: 36, height: 4, borderRadius: 99, background: T.PEBBLE, margin: '0 auto 14px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        {cat && !query && (
                            <motion.button {...pressProps('row')} onClick={() => setCat(null)} style={{ width: 30, height: 30, borderRadius: '50%', background: T.STONE, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                <ArrowLeft size={13} color={T.INK} />
                            </motion.button>
                        )}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: T.CORAL, letterSpacing: '0.2em', }}>動作庫 · EXERCISE LIBRARY</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: T.INK, letterSpacing: '-0.01em' }}>
                                {query ? `搜尋：${query}` : cat ? catLabels[cat] : '選擇肌群'}
                            </div>
                        </div>
                        <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: T.STONE, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <X size={13} color={T.INK} />
                        </motion.button>
                    </div>

                    {/* Search bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.WHITE, border: `1px solid ${T.PEBBLE}`, borderRadius: 12, padding: '10px 14px' }}>
                        <Search size={13} color="rgba(22,20,21,0.35)" />
                        <input
                            value={query}
                            onChange={e => { setQuery(e.target.value); if (e.target.value) setCat(null); }}
                            placeholder="搜尋動作名稱…"
                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: T.INK, fontFamily: 'inherit' }}
                        />
                        {query && (
                            <motion.button {...pressProps('row')} onClick={() => setQuery('')} style={{ width: 18, height: 18, borderRadius: '50%', background: T.PEBBLE, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                <X size={9} color={T.INK} />
                            </motion.button>
                        )}
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                    {/* Search results */}
                    {searchResults !== null ? (
                        searchResults.length === 0
                            ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(22,20,21,0.35)', fontSize: 13, fontWeight: 600 }}>找不到動作</div>
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {searchResults.map((ex, i) => (
                                    <ExerciseRow key={i} ex={ex} onSelect={onSelect} showCat />
                                ))}
                              </div>

                    /* Category grid */
                    ) : !cat ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {PICKER_CATEGORY_ORDER.map(catKey => {
                                const count = EXERCISE_MASTER_DB.filter(ex => {
                                    if (catKey === 'chest') return ex.subPart.startsWith('chest');
                                    if (catKey === 'back') return ex.cat === 'back';
                                    if (catKey === 'legs') return ex.cat === 'lower'; // 腿日含臀
                                    if (catKey === 'glutes') return ex.subPart === 'glutes';
                                    if (catKey === 'shoulders') return ex.subPart.startsWith('delt');
                                    if (catKey === 'arms') return ex.cat === 'arms';
                                    if (catKey === 'core') return ex.cat === 'core';
                                    return false;
                                }).length;
                                return (
                                    <motion.button key={catKey} whileTap={{ scale: 0.95 }} onClick={() => setCat(catKey)}
                                        style={{ padding: '16px 14px', borderRadius: 18, border: `1px solid ${T.PEBBLE}`, background: T.WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: T.INK }}>{catLabels[catKey]}</div>
                                            <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', fontWeight: 600, marginTop: 2 }}>{count} 個動作</div>
                                        </div>
                                        <ChevronRight size={13} color="rgba(22,20,21,0.3)" />
                                    </motion.button>
                                );
                            })}
                        </div>

                    /* Exercise list for selected category */
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {currentCatExercises.map((ex, i) => (
                                <ExerciseRow key={i} ex={{ ...ex, catLabel: catLabels[cat] }} onSelect={onSelect} />
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// ─── DRAGGABLE EXERCISE ROW ──────────────────────────────────────
const DraggableExerciseRow = ({ ex, exIdx, weekIdx, dayIdx, onEdit, onDelete, onDragEnd }) => {
    const dragControls = useDragControls();
    const restSec = ex.rest ? `${ex.rest}`.replace('s','') + 's' : null;
    
    return (
        <Reorder.Item
            value={ex}
            dragListener={false}
            dragControls={dragControls}
            onDragEnd={onDragEnd}
            style={{ marginBottom: 6, position: 'relative' }}
        >
            <div style={{ 
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 18, 
                background: 'rgba(207, 198, 184, 0.45)', 
                backdropFilter: 'blur(48px) saturate(150%)', WebkitBackdropFilter: 'blur(48px) saturate(150%)',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.25), 0 4px 14px rgba(0, 0, 0, 0.05)'
            }}>
                {/* Drag handle */}
                <div 
                    onPointerDown={(e) => dragControls.start(e)}
                    style={{ cursor: 'grab', padding: '4px', display: 'flex', alignItems: 'center', color: 'rgba(22,20,21,0.2)' }}
                >
                    <GripVertical size={16} />
                </div>

                {/* Exercise thumbnail (lazy-loaded from exercise DB) */}
                <ExerciseImage name={ex.name} muscle={ex.muscle} />

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', fontWeight: 600, marginTop: 2, letterSpacing: '0.04em' }}>
                        {ex.sets} × {ex.reps}{restSec ? ` · ${restSec}` : ''}
                    </div>
                </div>

                {/* Controls — stopPropagation prevents header toggle */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={(e) => { e.stopPropagation(); onEdit(weekIdx, dayIdx, exIdx, ex); }}
                        style={{ width: 34, height: 34, borderRadius: 12, background: T.MIST, border: `1px solid ${T.PEBBLE}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Edit2 size={13} color="rgba(22,20,21,0.55)" />
                    </motion.button>
                    <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={(e) => { e.stopPropagation(); onDelete(weekIdx, dayIdx, exIdx); }}
                        style={{ width: 34, height: 34, borderRadius: 12, background: 'rgba(249,92,75,0.1)', border: '1px solid rgba(249,92,75,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={13} color={T.CORAL} />
                    </motion.button>
                </div>
            </div>
        </Reorder.Item>
    );
};

// ─── SESSION CARD (expandable) ─────────────────────────────────
const SessionCard = ({ day, dayIdx, weekIdx, onEdit, onDelete, onAdd, onReorder, onApplyBlock, onSaveBlock }) => {
    const [open, setOpen] = useState(false);
    
    // Local state for dragging
    const [localExercises, setLocalExercises] = useState(day.exercises || []);

    // Sync with parent when not dragging
    useEffect(() => {
        setLocalExercises(day.exercises || []);
    }, [day.exercises]);

    const handleDragEnd = () => {
        if (onReorder) {
            onReorder(weekIdx, dayIdx, localExercises);
        }
    };

    const exercises = localExercises;
    const focusLabel = day.shortFocus || day.focus?.split('—')[0]?.trim() || day.focus?.split('（')[0]?.trim() || `Day ${dayIdx + 1}`;

    // Derive a one-word type label (PUSH / PULL / LEGS / etc.)
    const typeTag = (() => {
        const f = focusLabel.toLowerCase();
        if (f.includes('push') || f.includes('推力')) return 'PUSH';
        if (f.includes('pull') || f.includes('拉力')) return 'PULL';
        if (f.includes('legs') || f.includes('腿') || f.includes('leg')) return 'LEGS';
        if (f.includes('glute') || f.includes('臀')) return 'GLUTES';
        if (f.includes('upper') || f.includes('上肢')) return 'UPPER';
        if (f.includes('lower') || f.includes('下肢')) return 'LOWER';
        if (f.includes('arms') || f.includes('手臂')) return 'ARMS';
        if (f.includes('back') || f.includes('背')) return 'PULL';
        if (f.includes('chest') || f.includes('胸')) return 'PUSH';
        return focusLabel.substring(0, 6).toUpperCase();
    })();

    const dayNum = String(dayIdx + 1).padStart(2, '0');

    return (
        <div style={{ borderBottom: `1px solid ${T.STONE}` }}>
            {/* ── Session header row ── */}
            <motion.div whileTap={{ scale: 0.99 }} onClick={() => setOpen(v => !v)}
                style={{ padding: '20px 20px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>

                {/* Large editorial day number */}
                <div style={{
                    fontSize: 42, fontWeight: 900, color: open ? T.CORAL : T.PEBBLE,
                    lineHeight: 1, letterSpacing: '-0.04em', flexShrink: 0, width: 52,
                    fontFamily: 'var(--font-body)',
                    transition: 'color 0.2s',
                }}>
                    {dayNum}
                </div>

                {/* Day info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: 900, color: T.INK, letterSpacing: '-0.01em' }}>{typeTag}</span>
                        <span style={{
                            fontSize: 9, fontWeight: 900, color: open ? T.CORAL : 'rgba(22,20,21,0.35)',
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            padding: '3px 8px', borderRadius: 99,
                            background: open ? 'rgba(249,92,75,0.08)' : T.STONE,
                            transition: 'all 0.2s',
                        }}>
                            {day.weekday || `SESSION ${dayIdx + 1}`}
                        </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.45)', fontWeight: 600, letterSpacing: '0.04em' }}>
                        {exercises.length} 個動作{day.time ? ` · ${day.time}min` : ''}
                    </div>
                </div>

                {/* Expand chevron */}
                <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}>
                    <ChevronDown size={18} color="rgba(22,20,21,0.3)" />
                </motion.div>
            </motion.div>

            {/* ── Expanded exercise list ── */}
            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                        style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '0 20px 20px' }}>

                            {/* Section label */}
                            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.35)', marginBottom: 12 }}>
                                訓練動作 · EXERCISES
                            </div>

                            {/* Exercise rows */}
                            <Reorder.Group axis="y" values={localExercises} onReorder={setLocalExercises} style={{ padding: 0, margin: 0, listStyle: 'none' }}>
                                {localExercises.map((ex, exIdx) => (
                                    <DraggableExerciseRow
                                        key={ex._id}
                                        ex={ex}
                                        exIdx={exIdx}
                                        weekIdx={weekIdx}
                                        dayIdx={dayIdx}
                                        onEdit={onEdit}
                                        onDelete={onDelete}
                                        onDragEnd={handleDragEnd}
                                    />
                                ))}
                            </Reorder.Group>

                            {/* Add exercise button */}
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={(e) => { e.stopPropagation(); onAdd(weekIdx, dayIdx); }}
                                style={{ width: '100%', marginTop: 6, padding: '14px', borderRadius: 12, border: `1.5px dashed ${T.PEBBLE}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                <Plus size={13} color="rgba(22,20,21,0.3)" />
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.35)', letterSpacing: '0.1em', }}>新增動作</span>
                            </motion.button>

                            {/* 訓練區塊：整天換成存好的區塊／把這一天存起來 */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                {[
                                    { key: 'apply', Icon: Layers, label: '套用區塊', on: () => onApplyBlock?.(weekIdx, dayIdx) },
                                    { key: 'save', Icon: BookmarkPlus, label: '存成區塊', on: () => onSaveBlock?.(weekIdx, dayIdx), hide: !exercises.length },
                                ].filter((b) => !b.hide).map(({ key, Icon, label, on }) => (
                                    <motion.button key={key} {...pressProps('pill')}
                                        onClick={(e) => { e.stopPropagation(); haptic('light'); on(); }}
                                        style={{ flex: 1, minWidth: 0, minHeight: 44, borderRadius: 12, border: `1px solid ${T.STONE}`, background: T.WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: T.INK, fontSize: 12, fontWeight: 800 }}>
                                        <Icon size={14} color={T.CORAL} /> {label}
                                    </motion.button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── WEEK TAB ──────────────────────────────────────────────────
const WeekTab = ({ w, idx, active, onClick }) => {
    const phase = WEEK_PHASE[idx] || `W${idx + 1}`;
    const num   = w.weekNumber ?? w.week_number ?? idx + 1;
    return (
        <motion.button whileTap={{ scale: 0.93 }} onClick={onClick}
            style={{
                flexShrink: 0, padding: '10px 18px', borderRadius: 12,
                background: active ? T.INK : T.WHITE,
                border: `1.5px solid ${active ? T.INK : T.PEBBLE}`,
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.18s',
            }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: active ? T.CORAL : 'rgba(22,20,21,0.35)', marginBottom: 2 }}>{phase}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: active ? T.PAPER : T.INK, letterSpacing: '-0.01em' }}>W{num}</div>
        </motion.button>
    );
};

// ═════════════════════════════════════════════════════════════
// MAIN COMPONENT — Full Page Editor
// ═════════════════════════════════════════════════════════════
const PlanFullViewSheet = ({ plan, onPlanUpdate, onClose }) => {
    const [activeWeek, setActiveWeek] = useState(0);
    const [localPlan, setLocalPlan]   = useState(() => {
        const p = JSON.parse(JSON.stringify(plan));
        // Add stable _id to exercises for Reorder
        p.weeks?.forEach(w => w.days?.forEach(d => {
            if (d.exercises) {
                d.exercises.forEach(e => {
                    if (!e._id) e._id = Math.random().toString(36).substr(2, 9);
                });
            }
        }));
        return p;
    });
    // 統一動作編輯狀態：{ weekIdx, dayIdx, exIdx (null=新增), initialData }
    const [editTarget, setEditTarget] = useState(null);
    const [saveIndicator, setSaveIndicator] = useState(null); // 'saving' | 'ok' | null
    const [blockPick, setBlockPick] = useState(null);         // { weekIdx, dayIdx } → 套用區塊
    const [blockSave, setBlockSave] = useState(null);         // { exercises, category } → 存成區塊
    const navigate = useNavigate();
    const scrollRef = useRef(null);
    const saveTimerRef = useRef(null);

    React.useEffect(() => {
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: true } }));
        return () => window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
    }, []);

    const weeks = localPlan?.weeks || [];

    // ── mutate: local state only ──
    const mutate = useCallback((fn) => {
        setLocalPlan(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            fn(next);
            return next;
        });
    }, []);

    // ── mutateAndSave: local state + immediate backend save ──
    const mutateAndSave = useCallback((fn) => {
        // Capture next plan synchronously (React's functional updater runs sync)
        let nextPlan = null;
        setLocalPlan(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            fn(next);
            nextPlan = next;
            return next;
        });
        // Side effects OUTSIDE the updater (no React StrictMode double-fire issue)
        if (onPlanUpdate && nextPlan) {
            setSaveIndicator('saving');
            clearTimeout(saveTimerRef.current);
            try { onPlanUpdate(nextPlan); } catch (e) { console.warn('Auto-save error:', e); }
            saveTimerRef.current = setTimeout(() => {
                setSaveIndicator('ok');
                setTimeout(() => setSaveIndicator(null), 1600);
            }, 500);
        }
    }, [onPlanUpdate]);

    const handleReorder   = (wI, dI, newExercises) => mutateAndSave(p => { p.weeks[wI].days[dI].exercises = newExercises; });
    const handleDelete    = (wI, dI, eI) => mutateAndSave(p => p.weeks[wI].days[dI].exercises.splice(eI, 1));
    // 編輯既有動作 → 帶入 initialData（plan schema → modal schema）
    const handleEditOpen  = (wI, dI, eI, ex) => setEditTarget({
        weekIdx: wI, dayIdx: dI, exIdx: eI,
        initialData: {
            name: ex.name,
            targetLabel: SUBPART_ZH_LABEL(ex.muscle),
            sets: ex.sets,
            reps: String(ex.reps ?? '8-12'),
            rest: `${String(ex.rest ?? 90).replace(/[^0-9]/g, '') || 90}S`,
            note: ex.note || '',
        },
    });
    // 新增動作 → 無 initialData，modal 走選肌群流程
    const handleAddOpen   = (wI, dI) => setEditTarget({ weekIdx: wI, dayIdx: dI, exIdx: null, initialData: null });
    // 統一儲存（modal schema → plan schema）
    const handleUnifiedSave = (data) => {
        if (!editTarget) return;
        const { weekIdx, dayIdx, exIdx } = editTarget;
        const restSecs = parseInt(String(data.rest || '90').replace(/[^0-9]/g, '')) || 90;
        mutateAndSave(p => {
            const list = p.weeks[weekIdx].days[dayIdx].exercises;
            if (exIdx === null || exIdx === undefined) {
                list.push({
                    _id: Math.random().toString(36).substr(2, 9),
                    name: data.name, muscle: MUSCLE_FOR(data.name),
                    sets: data.sets, reps: String(data.reps), rest: restSecs,
                    cat: DEFAULT_EX.cat, eq: DEFAULT_EX.eq, time: 7, note: data.note || '',
                });
            } else {
                const cur = list[exIdx] || {};
                list[exIdx] = {
                    ...cur,
                    name: data.name, muscle: MUSCLE_FOR(data.name),
                    sets: data.sets, reps: String(data.reps), rest: restSecs, note: data.note || '',
                };
            }
        });
        setEditTarget(null);
    };
    // ── 訓練區塊 ──
    const handleApplyBlock = (wI, dI) => setBlockPick({ weekIdx: wI, dayIdx: dI });
    const handleSaveBlock = (wI, dI) => {
        const day = localPlan.weeks?.[wI]?.days?.[dI];
        if (!day?.exercises?.length) return;
        const f = String(day.shortFocus || day.focus || '').toLowerCase();
        const category = /push|推/.test(f) ? 'PUSH' : /pull|拉|背/.test(f) ? 'PULL' : /leg|腿|臀/.test(f) ? 'LEGS'
            : /upper|上/.test(f) ? 'UPPER' : /lower|下/.test(f) ? 'LOWER' : 'FULL BODY';
        setBlockSave({ exercises: day.exercises, category });
    };
    const applyBlock = (block) => {
        if (!blockPick || !block) return;
        const { weekIdx, dayIdx } = blockPick;
        const list = blockToDayExercises(block).map((ex) => ({
            ...ex,
            rest: parseInt(String(ex.rest ?? 90).replace(/[^0-9]/g, ''), 10) || 90,
        }));
        if (!list.length) return;
        haptic('success');
        mutateAndSave((p) => { p.weeks[weekIdx].days[dayIdx].exercises = list; });
        setBlockPick(null);
    };

    // Save + close (changes already auto-saved — this is just a confirm close)
    const handleSave = () => { onPlanUpdate(localPlan); onClose(); };

    // Derive split label
    const splitLabel = (() => {
        const s = localPlan.split_type || localPlan.bodyPartLabel || '';
        if (s.includes('PPL') || s.includes('ppl')) return 'PPL';
        if (s.includes('Upper') || s.includes('upper')) return 'Upper / Lower';
        if (s.includes('Push') && s.includes('Pull')) return 'Push / Pull';
        if (s.includes('推拉腿')) return 'PPL';
        if (s.includes('推力') && s.includes('臀腿')) return 'Push / Lower';
        return s || 'Full Body';
    })();

    const totalDays   = weeks[0]?.days?.length || 0;
    const planName    = localPlan.name || '訓練計劃';

    return (
        <>
            {/* ── Full-screen page — slides in from right ── */}
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 340, damping: 36 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: T.PAPER,
                    display: 'flex', flexDirection: 'column',
                    fontFamily: 'var(--font-body)',
                    overscrollBehavior: 'contain',
                }}>

                {/* ════ HEADER ════ */}
                <div style={{ flexShrink: 0, background: T.PAPER, borderBottom: `1px solid ${T.STONE}`, paddingTop: 'env(safe-area-inset-top, 0px)' }}>

                    {/* Top bar */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px 0', gap: 12 }}>
                        {/* Back */}
                        <motion.button {...pressProps('icon')} onClick={onClose} aria-label="返回"
                            style={{ width: 44, height: 44, borderRadius: 14, background: T.STONE, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            <ArrowLeft size={16} color={T.INK} />
                        </motion.button>

                        {/* Title block */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: T.CORAL, marginBottom: 1 }}>
                                編輯計劃
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: T.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {planName}
                            </div>
                        </div>

                        {/* Auto-save indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <AnimatePresence>
                                {saveIndicator && (
                                    <motion.div
                                        key={saveIndicator}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {saveIndicator === 'saving'
                                            ? <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.PEBBLE, animation: 'pulse 0.8s infinite' }} />
                                            : <Check size={11} color="#4CAF50" strokeWidth={3} />
                                        }
                                        <span style={{ fontSize: 11, fontWeight: 700, color: saveIndicator === 'ok' ? '#4CAF50' : 'rgba(22,20,21,0.4)', letterSpacing: '0.06em' }}>
                                            {saveIndicator === 'saving' ? '儲存中' : '已儲存'}
                                        </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            {/* 計劃庫：自己排的其他計劃（原本工具列的「自訂計劃」） */}
                            <motion.button {...pressProps('pill')} aria-label="計劃庫"
                                onClick={() => { haptic('light'); onClose(); navigate('/custom-plans'); }}
                                style={{ minHeight: 44, padding: '0 12px', borderRadius: 14, background: T.STONE, border: 'none', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: T.INK, fontSize: 12, fontWeight: 800 }}>
                                <Library size={14} color={T.INK} /> 計劃庫
                            </motion.button>
                        </div>
                    </div>

                    {/* Editorial rule + metadata */}
                    <div style={{ padding: '10px 20px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ height: 1, width: 20, background: T.PEBBLE }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.4)', letterSpacing: '0.12em' }}>
                            {weeks.length} 週 · {totalDays} 天/週 · {splitLabel}
                        </span>
                        <div style={{ flex: 1, height: 1, background: T.STONE }} />
                    </div>

                    {/* Week tabs */}
                    <div style={{ display: 'flex', gap: 6, padding: '0 20px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                        {weeks.map((w, i) => (
                            <WeekTab key={i} w={w} idx={i} active={activeWeek === i}
                                onClick={() => { setActiveWeek(i); scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                        ))}
                    </div>
                </div>

                {/* ════ CONTENT — Session list ════ */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                    <AnimatePresence mode="wait">
                        <motion.div key={activeWeek}
                            initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>

                            {/* Week hero banner */}
                            <div style={{ padding: '28px 20px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                                    <span style={{ fontSize: 52, fontWeight: 900, color: T.INK, letterSpacing: '-0.04em', lineHeight: 1 }}>
                                        W{weeks[activeWeek]?.weekNumber ?? weeks[activeWeek]?.week_number ?? activeWeek + 1}
                                    </span>
                                    <div>
                                        <div style={{ fontSize: 9, fontWeight: 900, color: T.CORAL, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 2 }}>{WEEK_PHASE[activeWeek]}</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.5)', letterSpacing: '0.04em' }}>
                                            {weeks[activeWeek]?.name || ''}
                                        </div>
                                    </div>
                                </div>
                                {/* thin rule */}
                                <div style={{ height: 1, background: T.STONE, marginTop: 16, marginBottom: 0 }} />
                            </div>

                            {/* Session cards */}
                            {(weeks[activeWeek]?.days || []).map((day, dIdx) => (
                                <SessionCard
                                    key={dIdx}
                                    day={day}
                                    dayIdx={dIdx}
                                    weekIdx={activeWeek}
                                    onEdit={handleEditOpen}
                                    onDelete={handleDelete}
                                    onAdd={handleAddOpen}
                                    onReorder={handleReorder}
                                    onApplyBlock={handleApplyBlock}
                                    onSaveBlock={handleSaveBlock}
                                />
                            ))}

                            {/* Bottom spacer */}
                            <div style={{ height: 80 }} />
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* ════ STICKY BOTTOM BAR ════ */}
                <div style={{
                    flexShrink: 0, padding: '12px 20px',
                    paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                    borderTop: `1px solid ${T.STONE}`,
                    background: T.PAPER,
                    display: 'flex', gap: 10,
                }}>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={onClose}
                        style={{ flex: 1, padding: '14px', borderRadius: 18, background: T.STONE, border: `1px solid ${T.PEBBLE}`, color: T.INK, fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em' }}>
                        關閉
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={handleSave}
                        style={{ flex: 2, padding: '14px', borderRadius: 18, background: T.INK, border: 'none', color: T.PAPER, fontSize: 13, fontWeight: 900, cursor: 'pointer', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <Check size={14} color={T.PAPER} strokeWidth={3} />
                        完成
                    </motion.button>
                </div>
            </motion.div>

            {/* ── 訓練區塊：挑一個套到這一天／把這一天存起來 ── */}
            <BlockPickerModal open={!!blockPick} onClose={() => setBlockPick(null)} onPick={applyBlock} />
            <SaveWorkoutBlockModal
                open={!!blockSave}
                exercises={blockSave?.exercises || []}
                defaultCategory={blockSave?.category || ''}
                source="manual"
                onClose={() => setBlockSave(null)}
                onSaved={() => { haptic('success'); setBlockSave(null); }}
            />

            {/* ── 統一動作編輯彈窗（與 FusePlan 共用 final-drvn 組件）── */}
            <ExercisePlanEditModal
                isOpen={!!editTarget}
                onClose={() => setEditTarget(null)}
                onSave={handleUnifiedSave}
                initialData={editTarget?.initialData || null}
            />
        </>
    );
};

export default PlanFullViewSheet;
