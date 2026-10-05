import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, Flag, ChevronRight } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { ALL_EXERCISES } from '../utils/UnifiedTrainingEngine';
import { getExerciseNameZh } from '../data/exerciseDatabase';
import { findExerciseByName } from '../utils/exerciseDB';
import { ExercisePicker } from './ExercisePicker';

// ════════════════════════════════════════════════════════════════
// FreestyleExercisePicker — 直接訓練模式：從全域動作庫挑動作 + 設定組數/次數
// ① 動作清單（縮圖 + 分類 + 搜尋）→ ② 設定面板（組數 / 次數 / 休息，含快捷按鈕）
// 可選「完成此次計劃」長按進度環按鈕。
// ════════════════════════════════════════════════════════════════

const COARSE_CATS = ['all', 'chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
const CAT_ZH = { all: '全部', chest: '胸', back: '背', shoulders: '肩', arms: '手臂', legs: '腿', core: '核心' };
const CAT_EN = { all: 'ALL', chest: 'CHEST', back: 'BACK', shoulders: 'SHOULDER', arms: 'ARMS', legs: 'LEGS', core: 'CORE' };

const MUSCLE_TO_CAT = {
    chest: 'chest', pecs: 'chest',
    back: 'back', lats: 'back', traps: 'back', 'upper back': 'back', 'lower back': 'back',
    shoulders: 'shoulders', delts: 'shoulders', deltoids: 'shoulders',
    // 🩹 後三角/前三角/中三角 都屬肩 —— 舊版沒列，害 Reverse Pec Deck 掉進 core（圖三顯示 CORE 的 bug）
    rear_delts: 'shoulders', 'rear delts': 'shoulders', 'rear deltoid': 'shoulders',
    front_delts: 'shoulders', 'front delts': 'shoulders', side_delts: 'shoulders',
    biceps: 'arms', triceps: 'arms', forearms: 'arms',
    quads: 'legs', quadriceps: 'legs', hamstrings: 'legs', glutes: 'legs',
    calves: 'legs', adductors: 'legs', abductors: 'legs',
    core: 'core', abs: 'core', abdominals: 'core', obliques: 'core',
};

// 部位推斷：先查 muscle 對照表；查不到再從「動作名稱關鍵字」推，最後才 fallback。
// 絕不再無腦掉進 'core' —— 那正是圖三 Reverse Pec Deck 顯示 CORE 的原因。
const NAME_HINTS = [
    [/(bench|chest|pec|fly|dip|push[\s-]?up)/i, 'chest'],
    [/(row|pull[\s-]?up|chin[\s-]?up|pulldown|lat|deadlift|face pull|pull apart|shrug)/i, 'back'],
    [/(shoulder|press|lateral raise|front raise|rear|delt|reverse pec|upright)/i, 'shoulders'],
    [/(curl|tricep|extension|pushdown|dips)/i, 'arms'],
    [/(squat|lunge|leg|calf|hip thrust|glute|hamstring|quad)/i, 'legs'],
    [/(plank|crunch|sit[\s-]?up|ab |oblique|core)/i, 'core'],
];
const catOf = (ex) => {
    const m = String(ex.muscle || '').toLowerCase().trim();
    if (MUSCLE_TO_CAT[m]) return MUSCLE_TO_CAT[m];
    const hay = `${ex.name || ''} ${ex.nameEn || ''}`;
    for (const [re, cat] of NAME_HINTS) if (re.test(hay)) return cat;
    return 'core';
};

// 部位圓點色 —— 收斂到調色盤內（原本用 Tailwind 藍/綠/紫/粉，違反色票）
const PART_DOT = {
    chest: '#F95C4B', back: '#5B7183', shoulders: '#C68E5D',
    arms: '#8B7F72', legs: '#5A7A3A', core: '#8F9E8B',
};

const REP_PRESETS = ['5-8', '8-12', '10-12', '12-15', '15-20'];
const SET_PRESETS = [3, 4, 5];
const REST_PRESETS = ['60s', '90s', '120s'];

const PAPER = '#F6F4F1';
const INK = '#161415';
const CORAL = '#F95C4B';

// ── 縮圖快取（避免重複查找 / 重抓 DB）──
const _thumbCache = new Map(); // name -> url | null

const ExerciseThumb = ({ name, dot }) => {
    const [url, setUrl] = useState(() => (_thumbCache.has(name) ? _thumbCache.get(name) : undefined));

    useEffect(() => {
        let alive = true;
        if (_thumbCache.has(name)) { setUrl(_thumbCache.get(name)); return; }
        (async () => {
            try {
                const data = await findExerciseByName(name);
                const u = data?.imageUrls?.[0] || null;
                _thumbCache.set(name, u);
                if (alive) setUrl(u);
            } catch {
                _thumbCache.set(name, null);
                if (alive) setUrl(null);
            }
        })();
        return () => { alive = false; };
    }, [name]);

    const fallback = (
        <div style={{ width: '100%', height: '100%', background: `${dot}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Dumbbell size={20} color={dot} />
        </div>
    );

    return (
        <div style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: '#EDEAE5', boxShadow: 'inset 0 0 0 1px rgba(22,20,21,0.05)' }}>
            {url
                ? <img src={url} alt="" loading="lazy" decoding="async"
                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.dataset.failed = '1'; }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#fff' }} />
                : fallback}
        </div>
    );
};

// ── 長按進度環的「完成此次計劃」按鈕（coral 淡色 + 液態玻璃）──
const HoldToFinishButton = ({ label, onComplete, holdMs = 1000 }) => {
    const [progress, setProgress] = useState(0);
    const rafRef = useRef(null);
    const startRef = useRef(0);
    const doneRef = useRef(false);

    const stop = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        if (!doneRef.current) setProgress(0);
    }, []);

    const tick = useCallback((now) => {
        const elapsed = now - startRef.current;
        const p = Math.min(1, elapsed / holdMs);
        setProgress(p);
        if (p >= 1) {
            doneRef.current = true;
            rafRef.current = null;
            try { window.navigator?.vibrate?.(30); } catch { /* noop */ }
            onComplete?.();
            setTimeout(() => { doneRef.current = false; setProgress(0); }, 400);
            return;
        }
        rafRef.current = requestAnimationFrame(tick);
    }, [holdMs, onComplete]);

    const start = useCallback((e) => {
        e.preventDefault();
        doneRef.current = false;
        startRef.current = performance.now();
        rafRef.current = requestAnimationFrame(tick);
    }, [tick]);

    useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

    const deg = Math.round(progress * 360);

    return (
        <div style={{ position: 'relative', width: '100%', borderRadius: 20, padding: 2 }}>
            {/* 外圈進度光暈：conic 掃一圈 */}
            <div aria-hidden style={{
                position: 'absolute', inset: 0, borderRadius: 20, padding: 2,
                background: progress > 0
                    ? `conic-gradient(${CORAL} ${deg}deg, rgba(249,92,75,0.18) ${deg}deg)`
                    : 'rgba(249,92,75,0.18)',
                WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                WebkitMaskComposite: 'xor', maskComposite: 'exclude',
                filter: progress > 0 ? `drop-shadow(0 0 6px rgba(249,92,75,${0.35 * progress}))` : 'none',
                transition: 'filter 0.1s linear',
            }} />
            <motion.button {...pressProps('row')}
 onPointerDown={start}
 onPointerUp={stop}
 onPointerLeave={stop}
 onPointerCancel={stop}
 style={{
 position: 'relative', width: '100%', height: 54, borderRadius: 18,
 border: '1px solid rgba(249,92,75,0.35)', cursor: 'pointer',
 color: '#C5402F', fontSize: 15, fontWeight: 700,
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
 // coral 淡色液態玻璃
 background: 'linear-gradient(180deg, rgba(249,92,75,0.20) 0%, rgba(249,92,75,0.12) 100%)',
 backdropFilter: 'blur(20px) saturate(160%)',
 WebkitBackdropFilter: 'blur(20px) saturate(160%)',
 boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.55), 0 6px 18px rgba(249,92,75,0.14)',
 touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent',
 }}>
                <Flag size={16} /> {progress > 0 && progress < 1 ? '持續長按…' : label}
            </motion.button>
        </div>
    );
};

const FreestyleExercisePicker = ({
    onConfirm,
    onFinish,
    onBack,
    title = '選擇動作',
    subtitle = '從動作庫挑一個動作開始',
    finishLabel = '完成此次計劃',
    confirmLabel = '加入並開始',
    fullScreen = true,
    fillWhileDoing = false,   // 邊做邊填：只填次數/休息，隱藏組數
}) => {
    const [cat, setCat] = useState('all');
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState(null);
    const [sets, setSets] = useState(3);
    const [reps, setReps] = useState('8-12');
    const [rest, setRest] = useState('90s');

    const list = useMemo(() => {
        const kw = search.trim().toLowerCase();
        return ALL_EXERCISES.filter((ex) => {
            const matchCat = cat === 'all' || catOf(ex) === cat;
            if (!matchCat) return false;
            if (!kw) return true;
            const zh = getExerciseNameZh(ex.name) || '';
            return ex.name.toLowerCase().includes(kw) || zh.includes(kw);
        });
    }, [cat, search]);

    const openConfig = (ex) => {
        setPicked(ex);
        setSets(ex.sets || 3);
        setReps(ex.reps || '8-12');
        setRest(ex.rest || '90s');
    };

    const confirm = () => {
        if (!picked) return;
        onConfirm?.({
            name: picked.name,
            // 邊做邊填：組數開放（99 哨兵），由使用者邊做邊決定；一般模式用填入的組數
            sets: fillWhileDoing ? 99 : Math.max(1, parseInt(sets) || 3),
            openEnded: fillWhileDoing,
            reps: String(reps),
            rest: String(rest),
            muscle: picked.muscle,
            category: catOf(picked),
        });
        setPicked(null);
        setSearch('');
    };

    const wrapStyle = fullScreen
        ? { position: 'fixed', inset: 0, zIndex: 80, background: PAPER, display: 'flex', flexDirection: 'column' }
        : { position: 'relative', width: '100%', height: '100%', background: PAPER, display: 'flex', flexDirection: 'column' };

    // ── ② 設定面板（帶液態玻璃材質）──
    if (picked) {
        return (
            <div style={wrapStyle}>
                <div style={{ padding: 'max(54px, env(safe-area-inset-top)) 22px 12px', flexShrink: 0 }}>
                    <motion.button {...pressProps('row')} onClick={() => setPicked(null)}
 style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(22,20,21,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <ArrowLeft size={18} color="rgba(22,20,21,0.6)" />
                    </motion.button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 24px' }}>
                    <p style={{ fontSize: 12, letterSpacing: '0.24em', color: 'rgba(22,20,21,0.4)', fontFamily: '"Geist Mono", monospace', margin: 0 }}>
                        {CAT_EN[catOf(picked)]} · 設定本動作
                    </p>
                    <h2 style={{ fontFamily: 'var(--font-display, "Tenor Sans", "Noto Sans TC", sans-serif)', fontSize: 32, fontWeight: 500, color: INK, margin: '6px 0 24px', lineHeight: 1.15 }}>
                        {getExerciseNameZh(picked.name)}
                    </h2>

                    {/* 液態玻璃卡片包住設定 */}
                    <div style={{
                        borderRadius: 24, padding: '20px 18px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(246,244,241,0.35) 100%)',
                        backdropFilter: 'blur(30px) saturate(150%)', WebkitBackdropFilter: 'blur(30px) saturate(150%)',
                        border: '1px solid rgba(255,255,255,0.7)',
                        boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.8), 0 8px 28px rgba(22,20,21,0.06)',
                    }}>
                        {/* 組數 —— 邊做邊填模式不顯示（組數由使用者邊做邊決定，做到自己按「完成此動作」） */}
                        {!fillWhileDoing && (<>
                        <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.55)', fontFamily: '"Geist Mono", monospace', marginBottom: 10 }}>組數 SETS</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
                            <motion.button {...pressProps('row')} onClick={() => setSets((s) => Math.max(1, (parseInt(s) || 1) - 1))}
 style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)', color: INK, fontSize: 22, cursor: 'pointer' }}>−</motion.button>
                            <div style={{ minWidth: 52, textAlign: 'center', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 28, color: INK }}>{sets}</div>
                            <motion.button {...pressProps('row')} onClick={() => setSets((s) => (parseInt(s) || 0) + 1)}
 style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)', color: INK, fontSize: 22, cursor: 'pointer' }}>+</motion.button>
                            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                                {SET_PRESETS.map((n) => (
                                    <motion.button {...pressProps('row')} key={n} onClick={() => setSets(n)}
 style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
 background: parseInt(sets) === n ? INK : 'rgba(22,20,21,0.06)',
 color: parseInt(sets) === n ? '#fff' : 'rgba(22,20,21,0.55)' }}>{n}</motion.button>
                                ))}
                            </div>
                        </div>
                        </>)}

                        {/* 邊做邊填提示 */}
                        {fillWhileDoing && (
                            <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 12, background: 'rgba(249,92,75,0.08)', border: '1px solid rgba(249,92,75,0.2)' }}>
                                <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'rgba(22,20,21,0.62)', fontFamily: '"Noto Sans TC", sans-serif' }}>
                                    <span style={{ color: CORAL, fontWeight: 700 }}>邊做邊填</span> · 組數不用先決定 —— 每做完一組就休息，想結束這個動作時按「完成此動作」，再選下一個。
                                </p>
                            </div>
                        )}

                        {/* 次數 */}
                        <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.55)', fontFamily: '"Geist Mono", monospace', marginBottom: 10 }}>次數 REPS</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                            {REP_PRESETS.map((r) => (
                                <motion.button {...pressProps('row')} key={r} onClick={() => setReps(r)}
 style={{ padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: '"Geist Mono", monospace',
 background: String(reps) === r ? CORAL : 'rgba(22,20,21,0.06)',
 color: String(reps) === r ? '#fff' : 'rgba(22,20,21,0.6)' }}>{r}</motion.button>
                            ))}
                        </div>
                        <input value={reps} onChange={(e) => setReps(e.target.value)} placeholder="自訂，例如 8 或 6-10"
                            style={{ width: '100%', boxSizing: 'border-box', height: 50, borderRadius: 14, padding: '0 16px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.7)', color: INK, fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 17, outline: 'none', marginBottom: 22 }} />

                        {/* 休息 */}
                        <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.55)', fontFamily: '"Geist Mono", monospace', marginBottom: 10 }}>休息 REST</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {REST_PRESETS.map((r) => (
                                <motion.button {...pressProps('row')} key={r} onClick={() => setRest(r)}
 style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: '"Geist Mono", monospace',
 background: String(rest) === r ? INK : 'rgba(22,20,21,0.06)',
 color: String(rest) === r ? '#fff' : 'rgba(22,20,21,0.6)' }}>{r}</motion.button>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ flexShrink: 0, padding: '12px 22px max(20px, env(safe-area-inset-bottom))',
                    background: 'linear-gradient(180deg, rgba(246,244,241,0) 0%, rgba(246,244,241,0.9) 30%)',
                    borderTop: '1px solid rgba(22,20,21,0.06)' }}>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={confirm}
                        style={{ width: '100%', height: 58, borderRadius: 18, border: 'none', cursor: 'pointer', color: '#fff',
                            background: 'linear-gradient(135deg, #F95C4B, #E04A39)', fontSize: 17, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            boxShadow: '0 8px 24px rgba(249,92,75,0.32)' }}>
                        {confirmLabel} <ChevronRight size={18} />
                    </motion.button>
                </div>
            </div>
        );
    }

    // ── ① 動作清單 —— 改用全 App 共用的 ExercisePicker（分類 + 真人示範圖片）──
    //    挑到動作後仍進入下方原本的「組數/次數設定」步驟，confirm 輸出格式不變。
    return (
        <ExercisePicker
            title={title}
            subtitle={subtitle}
            onSelect={(ex) => openConfig(ex)}
            onClose={() => onBack?.()}
            renderFooter={onFinish ? () => (
                <HoldToFinishButton label={finishLabel} onComplete={() => onFinish?.()} />
            ) : null}
        />
    );
};

export default FreestyleExercisePicker;
