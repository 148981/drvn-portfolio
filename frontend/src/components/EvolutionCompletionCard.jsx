import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { getDisplayName } from '../utils/socialIdentity';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
// html2canvas loaded on-demand (bundle-dynamic-imports)
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Send, Download, Check, Loader, Move, GripHorizontal, UserPlus, Share2 } from 'lucide-react';
import apiClient from '../api/client';
import { FeatureCard, PeakCard, ReportCard } from './FitnessCardComponents';
import { getUserId } from '../utils/auth';
import { addSocialPost, getSocialPosts } from '../utils/socialPostsStore';
import { toast } from '../utils/toast';
import { sessionVolume, exerciseVolume } from '../utils/strengthMath';

// 🔴 零模擬數據：@mention 名單改用真實好友（utils/mentionDirectory），不再用假人

const LAYOUT_MODES = { POSTER: 'POSTER', PR: 'PR', MINIMAL: 'MINIMAL' };
const LAYOUT_LABELS = { POSTER: 'Feature', PR: 'Peak', MINIMAL: 'Report' };

const T = {
    primary: '#F95C4B',
    bg: '#0D0D0D',
    surface: 'rgba(22, 20, 21, 0.92)',
    pebble: '#CFC6B8',
    deepBlack: '#161415',
    stone: '#E4DED2',
    paper: '#F6F4F1'
};

// ═══════════════════════════════════════════════
// FULLSCREEN CARD EDITOR
// Phone-sized 9:16 canvas. Feature = full-bleed poster.
// Peak / Report = draggable + scalable card overlay on photo.
// ═══════════════════════════════════════════════
const CardEditor = ({ mode, customImage, featuredPR, isNewRecord, processedExercises, calories, prExercises, avgEffort, totalVolume, totalSets, durationSeconds, heartRate, completedDate, locationName = '', onDone, onClose, initialState, cardH }) => {
    // 🎯 Native Hydration: track x/y/scale/opacity as state — no screenshot needed
    const [state, setState] = useState(initialState || { x: 0, y: 0, scale: 1, opacity: 10 });
    const editorRef = useRef(null);
    const initialDistanceRef = useRef(0);
    const initialScaleRef = useRef(1);
    const [isPinching, setIsPinching] = useState(false);

    const PHONE_W = 390;
    const PHONE_H = cardH || Math.round(PHONE_W * (4 / 3)); // default 4:3 portrait

    // ── Pinch-zoom: 手指滑動放大縮小（線性） ──
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            setIsPinching(true);
            const [t1, t2] = [e.touches[0], e.touches[1]];
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            initialDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
            initialScaleRef.current = state.scale;
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && initialDistanceRef.current > 0) {
            const [t1, t2] = [e.touches[0], e.touches[1]];
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            const ratio = Math.sqrt(dx * dx + dy * dy) / initialDistanceRef.current;
            setState(s => ({ ...s, scale: Math.max(0.4, Math.min(2.5, initialScaleRef.current * ratio)) }));
        }
    };

    const handleTouchEnd = () => {
        initialDistanceRef.current = 0;
        initialScaleRef.current = 1;
        setIsPinching(false);
    };

    // 🎯 Confirm: capture preview screenshot for gallery + pass state back
    const handleConfirm = async () => {
        try {
            await document.fonts.ready;
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(editorRef.current, {
                useCORS: true, scale: 3, backgroundColor: '#0A0A0A'
            });
            // Return both screenshot (for preview) and state (for hydration)
            onDone(canvas.toDataURL('image/png'), state);
        } catch (e) {
            console.warn('Preview capture failed:', e);
            onDone(null, state); // Still save state even if preview fails
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                position: 'fixed', inset: 0, background: '#000', zIndex: 200,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                overflowY: 'auto', paddingTop: 16, paddingBottom: 0,
                touchAction: 'none',
            }}
        >
            {/* ── Phone-sized canvas ── */}
            <div
                ref={editorRef}
                style={{
                    width: PHONE_W, height: PHONE_H,
                    position: 'relative',
                    borderRadius: 36, flexShrink: 0,
                    overflow: 'hidden',
                    background: '#0A0A0A',
                }}
            >
                {/* Background Photo */}
                {customImage
                    ? <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${customImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    : <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 30% 30%, ${T.primary}18 0%, transparent 60%)` }} />
                }
                {mode === LAYOUT_MODES.POSTER && customImage && (
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.6) 100%)' }} />
                )}
                <div style={{ position: 'absolute', inset: 0, background: customImage ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)' }} />

                {/* 🎯 Flex-center layout — matches feed display exactly so x/y coords are 1:1 */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <motion.div
                        drag={!isPinching}
                        dragMomentum={false}
                        initial={{ x: state.x, y: state.y }}
                        onDragEnd={(e, info) => {
                            setState(s => ({ ...s, x: s.x + info.offset.x, y: s.y + info.offset.y }));
                        }}
                        style={{
                            zIndex: 10, cursor: 'grab', position: 'relative',
                            width: mode === LAYOUT_MODES.POSTER ? PHONE_W : 'auto',
                            height: mode === LAYOUT_MODES.POSTER ? PHONE_H : 'auto',
                        }}
                        whileDrag={{ cursor: 'grabbing' }}
                    >
                        <div style={{ transform: `scale(${state.scale})`, transformOrigin: 'center' }}>
                            {mode === LAYOUT_MODES.POSTER && (
                                <div style={{ width: PHONE_W }}>
                                    <FeatureCard
                                        showDataOnly={true}
                                        minH={cardH || Math.round(PHONE_W * 4 / 3)}
                                        bgOpacity={state.opacity}
                                        processedExercises={processedExercises} prExercises={prExercises}
                                        avgEffort={avgEffort} totalVolume={totalVolume}
                                        durationSeconds={durationSeconds} calories={calories}
                                        heartRate={heartRate} completedDate={completedDate}
                                        locationName={locationName}
                                    />
                                </div>
                            )}
                            {mode === LAYOUT_MODES.PR && <PeakCard featuredPR={featuredPR} isNewRecord={isNewRecord} totalVolume={totalVolume} totalSets={totalSets} bgOpacity={state.opacity} />}
                            {mode === LAYOUT_MODES.MINIMAL && <ReportCard processedExercises={processedExercises} calories={calories} bgOpacity={state.opacity} />}
                        </div>

                        {/* ── Scale handle (drag up/down) ── */}
                        <motion.div
                            drag="y" dragMomentum={false}
                            onDrag={(e, info) => {
                                e.stopPropagation();
                                setState(s => ({ ...s, scale: Math.max(0.35, Math.min(2.5, s.scale - info.delta.y * 0.006)) }));
                            }}
                            style={{
                                position: 'absolute', bottom: mode === LAYOUT_MODES.POSTER ? 20 : -22,
                                left: '50%', transform: 'translateX(-50%)',
                                width: 36, height: 20,
                                background: 'rgba(255,255,255,0.15)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'ns-resize', zIndex: 20, touchAction: 'none',
                                backdropFilter: 'blur(10px)',
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <GripHorizontal size={11} color="rgba(255,255,255,0.7)" />
                        </motion.div>

                        {/* Drag + scale hint */}
                        <div style={{ position: 'absolute', bottom: mode === LAYOUT_MODES.POSTER ? 50 : -46, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.4, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                            <Move size={9} color="white" />
                            <span style={{ fontSize: 9, color: 'white', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Drag · Scale Content</span>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* ── Opacity Slider — below canvas, above buttons（線性軌道） ── */}
            <div style={{ width: PHONE_W, padding: '12px 24px 6px', background: 'rgba(0,0,0,0.9)' }}>
                <style>{`
                    /* 線性透明度滑桿：軌道用「已填(coral)→未填(灰)」的線性漸層，視覺與數值 1:1 對齊 */
                    .lg-opacity-range { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 4px; outline: none; cursor: pointer; }
                    .lg-opacity-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid ${T.primary}; box-shadow: 0 1px 4px rgba(0,0,0,0.4); cursor: pointer; margin-top: 0; }
                    .lg-opacity-range::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid ${T.primary}; box-shadow: 0 1px 4px rgba(0,0,0,0.4); cursor: pointer; }
                    .lg-opacity-range::-moz-range-track { height: 4px; border-radius: 4px; background: transparent; }
                `}</style>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>Card Opacity</span>
                    <input
                        className="lg-opacity-range"
                        type="range" min="0" max="100" step="1"
                        value={state.opacity}
                        onChange={e => setState(s => ({ ...s, opacity: parseInt(e.target.value) }))}
                        style={{
                            flex: 1,
                            // 線性漸層軌道：左側 coral 填滿到目前百分比，右側灰
                            background: `linear-gradient(to right, ${T.primary} 0%, ${T.primary} ${state.opacity}%, rgba(255,255,255,0.15) ${state.opacity}%, rgba(255,255,255,0.15) 100%)`,
                        }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 900, fontFamily: 'monospace', color: T.primary, minWidth: 32, textAlign: 'right' }}>{state.opacity}%</span>
                </div>
            </div>

            {/* ── Bottom buttons ── */}
            <div style={{ width: PHONE_W, background: 'rgba(0,0,0,0.95)', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px 0', display: 'flex', gap: 12, flexShrink: 0, borderRadius: '0 0 40px 40px' }}>
                <motion.button {...pressProps('row')} onClick={onClose}
 style={{ flex: 1, padding: '14px 0', borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginLeft: 16 }}
 >Cancel</motion.button>
                <motion.button {...pressProps('row')} onClick={handleConfirm}
 style={{ flex: 2, padding: '14px 0', borderRadius: 18, background: T.primary, border: 'none', color: 'black', fontWeight: 900, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginRight: 16 }}
 >
                    <Check size={16} />
                    Apply {LAYOUT_LABELS[mode]}
                </motion.button>
            </div>
        </motion.div>
    );
};


// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
const EvolutionCompletionCard = ({
    exercises = [], durationSeconds = 0, calories = 0, completedSets = 0,
    heartRate = 135, completedDate = new Date(), activity_type = 'Strength',
    exercisePRs = {}, locationName = '', onShare, onExit, backTo = null
}) => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const captionRef = useRef(null);

    // Off-screen render refs (transparent PNG generation)
    const offFeatureRef = useRef(null);     // with photo (for thumbnail preview)
    const offFeatureStickerRef = useRef(null); // without photo (for transparent download)
    const offPeakRef = useRef(null);
    const offReportRef = useRef(null);

    const [isGenerating, setIsGenerating] = useState(true);
    const [generatedImages, setGeneratedImages] = useState({ POSTER: null, PR: null, MINIMAL: null });
    // Separate transparent sticker PNGs for download
    const [stickerImages, setStickerImages] = useState({ POSTER: null });
    // Composed share images (with positioned card on photo)
    const [shareImages, setShareImages] = useState({ POSTER: null, PR: null, MINIMAL: null });
    // User-adjustable card background opacity (shared between editor and download)
    const [cardOpacity, setCardOpacity] = useState(0.1);

    // 🎨 CARD STATE PERSISTENCE - Track opacity and scale for each layout
    const [cardStates, setCardStates] = useState({
        [LAYOUT_MODES.POSTER]: { x: 0, y: 0, scale: 1, opacity: 10 },
        [LAYOUT_MODES.PR]: { x: 0, y: 0, scale: 1, opacity: 88 },
        [LAYOUT_MODES.MINIMAL]: { x: 0, y: 0, scale: 1, opacity: 93 },
    });

    const [selectedLayout, setSelectedLayout] = useState(LAYOUT_MODES.POSTER);
    const [editorMode, setEditorMode] = useState(null); // which layout is being edited

    const [isSharing, setIsSharing] = useState(false);
    const [customImage, setCustomImage] = useState(null);
    const [customImageBase64, setCustomImageBase64] = useState(null);
    const [caption, setCaption] = useState('Just crushed it! 💪 #DRVN');
    // 與 IGPostComposer 對齊：標題（選填）＋ 標註用戶
    const [postTitle, setPostTitle] = useState('');
    const [taggedUsers, setTaggedUsers] = useState([]);
    const [showTagField, setShowTagField] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [mentionQuery, setMentionQuery] = useState(null);
    const [mentions, setMentions] = useState([]);
    const [selectedPRIndex, setSelectedPRIndex] = useState(0);

    // 🖼️ Portrait/Landscape toggle (matches RunningEvolutionCard pattern)
    const [isLandscape, setIsLandscape] = useState(false);
    const PHONE_W = 390;
    const PHONE_H = isLandscape ? Math.round(PHONE_W * 0.75) : Math.round(PHONE_W * (4 / 3));

    // ─── iOS in-app save overlay ───
    const [showSaveOverlay, setShowSaveOverlay] = useState(false);
    const [saveOverlayImg, setSaveOverlayImg] = useState(null);
    const [saveToastVisible, setSaveToastVisible] = useState(false);

    // ── Computed data ──
    const processedExercises = useMemo(() =>
        exercises.map(ex => {
            const sets = ex.sets || [];
            const totalW = sets.reduce((s, set) => s + (parseFloat(set.weight) || 0), 0);
            return { ...ex, avgWeight: sets.length > 0 ? Math.round(totalW / sets.length) : 0, setsCount: sets.length };
        }), [exercises]);

    const bestSet = useMemo(() => {
        let maxW = 0, name = 'Workout';
        exercises.forEach(ex => ex.sets?.forEach(s => { const w = parseFloat(s.weight) || 0; if (w > maxW) { maxW = w; name = ex.name; } }));
        return { name, weight: maxW };
    }, [exercises]);

    const prExercises = useMemo(() =>
        exercises.filter(ex => {
            const maxW = Math.max(...(ex.sets?.map(s => parseFloat(s.weight) || 0) || [0]));
            return maxW > (exercisePRs[ex.name] || 0) && maxW > 0;
        }).map(ex => ({ name: ex.name, weight: Math.max(...(ex.sets?.map(s => parseFloat(s.weight) || 0) || [0])) })),
        [exercises, exercisePRs]);

    const featuredPR = prExercises.length > 0 ? prExercises[selectedPRIndex % prExercises.length] : bestSet;
    const isNewRecord = prExercises.length > 0;

    const avgEffort = useMemo(() => {
        const scores = exercises.flatMap(ex => ex.sets?.map(s => s.effortScore || 0) || []);
        return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    }, [exercises]);

    const totalVolume = exercises.reduce((sum, ex) => sum + (ex.sets?.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0) || 0), 0);
    const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);

    // ── Generate transparent PNGs (data stickers only, no photo bg) ──
    const captureTransparent = useCallback(async (node) => {
        if (!node) return null;
        try {
            const sx = window.scrollX;
            const sy = window.scrollY;

            // 🔥 確保字體完全載入
            await document.fonts.ready;

            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(node, {
                useCORS: true,
                scale: 3,
                backgroundColor: null,
                logging: false,
                // 🔧 用節點實際尺寸截圖，不再 +15/+50（那會在 PNG 邊緣留下空白/黑帶，與預覽不符）
                width: node.offsetWidth,
                height: node.offsetHeight,
                scrollX: -sx,
                scrollY: -sy,
                // 🔥 克隆修正：解決「去背 PNG 文字被裁掉一半」的排版問題。
                //    根因：卡片內各種 overflow:hidden / 固定高度容器在 html2canvas 量測時把文字下緣裁掉。
                //    對策：截圖用的 clone 上，把可能裁字的容器放寬 overflow，並給文字一點底部緩衝。
                onclone: (clonedDoc) => {
                    const cards = clonedDoc.querySelectorAll('[data-export-card]');
                    cards.forEach(c => {
                        try {
                            // 只放寬「卡片內部會裁字」的容器，保留卡片本體的圓角裁切與
                            // 單行省略(ellipsis)的橫向裁切；解決數字/標題上下緣被 overflow 切掉。
                            c.querySelectorAll('*').forEach(el => {
                                if (el === c) return;
                                const cs = window.getComputedStyle(el);
                                if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis') {
                                    el.style.overflow = 'visible';
                                }
                            });
                        } catch (_) { /* noop */ }
                    });
                }
            });
            return canvas.toDataURL('image/png');
        } catch (e) {
            console.warn('Capture failed:', e);
            return null;
        }
    }, []);

    // ─── Listen for Swift imageSaved callback ───────────────────────────────
    useEffect(() => {
        const prev = window.nativeBridge?.onNativeEvent;
        if (!window.nativeBridge) window.nativeBridge = {};
        window.nativeBridge.onNativeEvent = (jsonStr) => {
            prev?.(jsonStr);
            try {
                const data = JSON.parse(jsonStr);
                if (data?.type === 'imageSaved' && data?.success) {
                    setSaveToastVisible(true);
                    setShowSaveOverlay(false);
                    setTimeout(() => setSaveToastVisible(false), 2500);
                }
            } catch {}
        };
        return () => {
            if (window.nativeBridge) window.nativeBridge.onNativeEvent = prev;
        };
    }, []);

    useEffect(() => {
        const generate = async () => {
            setIsGenerating(true);
            // 🚩 確保 DRVN 規範字體（Tenor Sans 顯示/數字、JetBrains Mono 數據、Noto Sans TC 中文）
            //    在 html2canvas 截圖前「真正載入完成」，否則會用 fallback 字體量測 → 數字容器算錯而跑版。
            try {
                await Promise.all([
                    document.fonts.load("400 52px 'Michroma'"),   // 運動風大數字（寬體，務必先載入再量測）
                    document.fonts.load("800 17px 'Manrope'"),    // 大小標題
                    document.fonts.load("700 10px 'Manrope'"),    // kicker
                    document.fonts.load("600 30px 'Caveat'"),     // 手寫風 LAB
                    document.fonts.load("500 16px 'JetBrains Mono'"),
                    document.fonts.load("500 14px 'Noto Sans TC'"),
                    document.fonts.ready,
                ]);
            } catch (_) { /* 退回計時等待 */ }
            await new Promise(r => setTimeout(r, 400));
            const [feature, peak, report, featureSticker] = await Promise.all([
                captureTransparent(offFeatureRef.current),
                captureTransparent(offPeakRef.current),
                captureTransparent(offReportRef.current),
                captureTransparent(offFeatureStickerRef.current),
            ]);
            setGeneratedImages({ POSTER: feature, PR: peak, MINIMAL: report });
            setStickerImages({ POSTER: featureSticker });
            setIsGenerating(false);
        };
        generate();
        // 🔧 透明度改用 cardStates（每個 layout 各自的 opacity）→ 使用者調滑桿後要重新產圖，
        //    否則下載的圖透明度永遠不變（舊 bug：導出讀 cardOpacity 但使用者調的是 cardStates）。
    }, [captureTransparent, customImage, selectedPRIndex,
        cardStates[LAYOUT_MODES.POSTER].opacity,
        cardStates[LAYOUT_MODES.PR].opacity,
        cardStates[LAYOUT_MODES.MINIMAL].opacity]);

    // ── Caption helpers ──
    // 🔴 Fix(caption-color): overlay 只負責替 @mention 上色，
    // 其餘文字必須 transparent（底下 textarea 的 ink 文字才是本體）。
    // 舊值 color:'white' 是深底時代殘留，在淺色卡上會浮出白字。
    const renderCaption = (text) =>
        !text ? null : text.split(/(@\w+)/g).map((part, i) =>
            part.startsWith('@')
                ? <span key={i} style={{ color: T.primary, fontWeight: 700 }}>{part}</span>
                : <span key={i} style={{ color: 'transparent' }}>{part}</span>
        );

    const handleCaptionChange = (e) => {
        const val = e.target.value;
        setCaption(val);
        const match = val.match(/@(\w*)$/);
        setMentionQuery(match ? match[1] : null);
    };

    const insertMention = (name) => {
        setCaption(prev => prev.replace(/@\w*$/, `@${name} `));
        setMentions(prev => prev.includes(name) ? prev : [...prev, name]);
        setMentionQuery(null);
        captionRef.current?.focus();
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setCustomImage(URL.createObjectURL(file));
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 800;
                const scale = MAX / Math.max(img.width, img.height);
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                setCustomImageBase64(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };

    // ─── iOS detection helper ───
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // Download: Feature uses transparent sticker PNG; Peak/Report use transparent card PNGs
    //
    //  Fallback chain:
    //    1. window.webkit.messageHandlers.saveImage  → Swift 直接存到相片庫（Xcode rebuild 後）
    //    2. iOS: 顯示 in-app overlay，長按圖片儲存（立即可用，不需 rebuild）
    //    3. Desktop: 標準 <a download>
    const handleDownload = (mode) => {
        const img = mode === LAYOUT_MODES.POSTER
            ? (stickerImages.POSTER || generatedImages[mode])
            : generatedImages[mode];
        if (!img) return;

        // ── Path 1: Swift 原生 handler（Xcode rebuild 後生效）──
        if (window.webkit?.messageHandlers?.saveImage) {
            window.webkit.messageHandlers.saveImage.postMessage(img);
            return;
        }

        // ── Path 2: iOS — in-app overlay，長按圖片儲存到相簿 ─────────────
        //    WKWebView 中 window.open() 永遠返回 null（除非實作 WKUIDelegate），
        //    改用 React overlay：顯示圖片讓使用者長按 → iOS 原生選單 → 儲存到照片
        if (isIOS) {
            setSaveOverlayImg(img);
            setShowSaveOverlay(true);
            return;
        }

        // ── Path 3: Desktop: 標準 <a download> ──────────────────────────
        const filename = `DRVN_${LAYOUT_LABELS[mode]}_sticker_${Date.now()}.png`;
        const link = document.createElement('a');
        link.href = img;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Called when editor finishes — CardEditor calls onDone(screenshot, state)
    // We only need state for native hydration; screenshot can be used for preview thumbnail
    const handleEditorDone = (screenshot, newState) => {
        if (newState) {
            setCardStates(prev => ({ ...prev, [editorMode]: newState }));
        }
        // Optionally store screenshot thumbnail for gallery preview
        if (screenshot && editorMode) {
            setShareImages(prev => ({ ...prev, [editorMode]: screenshot }));
        }
        setSelectedLayout(editorMode);
        setEditorMode(null);
    };

    // 🔧 Helper: 壓縮大型 base64 截圖成適合 localStorage 的小縮圖（與 RunningEvolutionCard 完全相同）
    const compressToThumbnail = (dataUrl, maxWidth = 480, quality = 0.5) =>
        new Promise((resolve) => {
            if (!dataUrl) { resolve(null); return; }
            const img = new window.Image();
            img.onload = () => {
                try {
                    const scale = Math.min(1, maxWidth / img.width);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                } catch (e) {
                    console.warn('⚠️ Thumbnail compression failed:', e);
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });

    // Share to community feed — 與 RunningEvolutionCard.handleFinalShare 完全相同的架構
    const handleShare = async () => {
        // 有沒有真的送到伺服器 —— 決定要不要說「已分享」、要不要把人帶去社群頁
        let syncedToServer = true;
        setIsSharing(true);
        try {
            const userName = getDisplayName();
            const userId = getUserId();

            // ── 1. 壓縮背景圖（與 RunningEvolutionCard 相同：600px, 0.5 quality）──
            const compressedImage = customImageBase64
                ? await compressToThumbnail(customImageBase64, 600, 0.5).catch(() => null)
                : (customImage ? await compressToThumbnail(customImage, 600, 0.5).catch(() => null) : null);

            // ── 2. 精簡 processedExercises（只保留渲染所需欄位，避免 localStorage 爆炸）──
            const slimExercises = processedExercises.slice(0, 4).map(ex => ({
                name: ex.name,
                avgWeight: ex.avgWeight || 0,
                setsCount: ex.setsCount || 0,
                sets: (ex.sets || []).map(s => ({
                    weight: s.weight || 0,
                    reps: s.reps || 0,
                })),
            }));

            const slimPRExercises = prExercises.map(p => ({ name: p.name, weight: p.weight }));

            // ── 3. 建構本地貼文（結構與 RunningEvolutionCard.localPost 完全一致）──
            const localPost = {
                activity_id: `local_fitness_${Date.now()}`,
                user_id: userId,
                user_name: userName,
                title: postTitle.trim() || null,            // 與 IGPostComposer payload 對齊
                tags: taggedUsers,                           // 標註用戶
                caption: caption || 'Just crushed it! 💪 #DRVN',
                photo: null,
                activity_type: 'fitness',
                community: 'fitness',
                metrics: { heartRate, calories, duration: durationSeconds, volume_kg: totalVolume },
                created_at: new Date().toISOString(),
                kudos_count: 0,
                comments: 0,
                drvnCard: {
                    layout: selectedLayout,                    // 🎯 POSTER | PR | MINIMAL
                    cardStates: cardStates,                    // 🎯 含 x/y/scale/opacity
                    customImage: compressedImage,               // 🎯 壓縮後的背景圖
                    editorWidth: PHONE_W,                      // 🎯 記錄編輯器寬高
                    editorHeight: PHONE_H,
                    // ── Fitness-specific data for card rendering ──
                    processedExercises: slimExercises,
                    calories,
                    avgEffort,
                    totalVolume,
                    durationSeconds,
                    heartRate,
                    completedDate: completedDate instanceof Date ? completedDate.toISOString() : completedDate,
                    featuredPR: featuredPR ? { name: featuredPR.name, weight: featuredPR.weight } : { name: 'Workout', weight: 0 },
                    isNewRecord,
                    prExercises: slimPRExercises,
                    accentColor: '#F95C4B',
                },
            };

            console.log('🔍 [FITNESS SHARE] localPost.drvnCard:', {
                layout: localPost.drvnCard.layout,
                hasCardStates: !!localPost.drvnCard.cardStates,
                cardStateForLayout: localPost.drvnCard.cardStates?.[localPost.drvnCard.layout],
                hasImage: !!localPost.drvnCard.customImage,
                editorW: localPost.drvnCard.editorWidth,
                editorH: localPost.drvnCard.editorHeight,
                exerciseCount: localPost.drvnCard.processedExercises?.length,
            });

            // ── 4. 儲存貼文（已用 userId 命名空間，自動處理容量保護）──
            try {
                addSocialPost(localPost, userId);
                console.log('✅ Fitness Hydration Post saved safely');
            } catch (storageErr) {
                console.error('❌ socialPostsStore save failed:', storageErr);
            }

            // ── 5. 驗證儲存是否成功 ──
            try {
                const verify = getSocialPosts(userId);
                const saved = verify.find(p => p.activity_id === localPost.activity_id);
                console.log('🔍 [VERIFY] Post saved?', !!saved, 'Has drvnCard?', !!saved?.drvnCard, 'Layout?', saved?.drvnCard?.layout);
            } catch (e) { console.warn('Verify failed:', e); }

            // ── 6. Backend API sync (non-fatal, 與 RunningEvolutionCard 相同：放在 localStorage 後面) ──
            try {
                const formData = new FormData();
                formData.append('user_id', userId);
                formData.append('user_name', userName);
                formData.append('caption', caption || '');
                formData.append('activity_type', 'fitness');
                formData.append('session_data', JSON.stringify({
                    session_id: localPost.activity_id,
                    activity_type: 'fitness',
                    stats: { duration: durationSeconds, calories, volume_kg: totalVolume, heartRate },
                    drvnCard: localPost.drvnCard,
                }));
                if (compressedImage) {
                    try {
                        const blob = await fetch(compressedImage).then(r => r.blob());
                        formData.append('photo', blob, 'fitness_card.jpg');
                    } catch (fetchErr) {
                        console.warn('⚠️ Photo blob conversion failed (skipped):', fetchErr);
                    }
                }
                await apiClient.post('/api/activities/create', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 5000,
                });
                console.log('✅ Backend sync successful');
            } catch (apiErr) {
                console.warn('⚠️ Backend sync skipped:', apiErr.message);
                /* ⚠️ 2026-09 稽核：這個 catch 原本只 console.warn，
                   然後下面不論成敗都報「已分享」—— 使用者以為朋友看得到了，
                   其實只存在自己手機裡。本機那份仍然保留（離線也看得到自己的紀錄），
                   但提示要說實話。 */
                syncedToServer = false;
            }

            if (syncedToServer) {
                toast.success('健身報告已發佈到社群');
                /* replace:true —— 分享完再按返回，不該又回到「分享卡選擇頁」
                   （那一頁的 state 還帶著 openShare，會無限彈回分享頁，
                   使用者的體感就是「返回之後找不到頁面」）。
                   有來源頁就回來源頁，沒有才去社群。 */
                if (backTo) navigate(backTo, { replace: true });
                else navigate('/fitness-community-mobile', { replace: true });
            } else {
                // 檔案裡下方的 catch 已經說明過：發佈失敗不該把人帶去社群頁
                toast.error('沒有送到伺服器，目前只存在這台手機。請確認網路後重試');
            }
        } catch (err) {
            console.error('❌ Share error:', err);
            // ⚠️ 發佈失敗：用 error 樣式誠實告知，且「不」強制導去社群頁
            //    （否則用戶到社群找不到自己的貼文，會以為 App 壞了）。
            //    保留在當前卡片，讓用戶可重試。
            toast.error('發佈失敗，請稍後重試');
        }
        setIsSharing(false);
    };

    // 🔴 真實好友 @mention 名單（無好友 → 空清單，不捏造）
    const [mentionUsers, setMentionUsers] = useState([]);
    useEffect(() => {
        let alive = true;
        import('../utils/mentionDirectory').then(({ loadMentionNames }) =>
            loadMentionNames().then((names) => { if (alive) setMentionUsers(names); })
        ).catch(() => {});
        return () => { alive = false; };
    }, []);
    const filteredMentions = mentionQuery !== null
        ? mentionUsers.filter(u => u.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5)
        : [];

    // Canvas size for off-screen renders
    const CARD_W = 390;

    return (
        <>
            {/* ─── Off-screen Transparent Nodes ─── */}
            {/* Feature WITH photo: for gallery thumbnail preview
                🔧 高度改 auto + minHeight(4:3)，內容多時自動撐高、不再 overflow:hidden 把底部
                   (Key Movements / 動作清單) 裁掉；導出尺寸 = 內容實際高度。 */}
            <div style={{ position: 'fixed', top: -9999, left: -9999, pointerEvents: 'none', zIndex: -1 }}>
                <div ref={offFeatureRef} style={{ width: CARD_W, background: 'transparent', borderRadius: 36, overflow: 'visible', position: 'relative', display: 'flex' }}>
                    {customImage && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${customImage})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 36 }} />}
                    <FeatureCard showDataOnly minH={Math.round(CARD_W * 4 / 3)} photoBg={customImage} bgOpacity={cardStates[LAYOUT_MODES.POSTER].opacity} processedExercises={processedExercises} prExercises={prExercises} avgEffort={avgEffort} totalVolume={totalVolume} durationSeconds={durationSeconds} calories={calories} heartRate={heartRate} completedDate={completedDate} locationName={locationName} />
                </div>
            </div>
            {/* Feature WITHOUT photo: for transparent sticker download */}
            <div style={{ position: 'fixed', top: -9996, left: -9999, pointerEvents: 'none', zIndex: -1 }}>
                <div ref={offFeatureStickerRef} style={{ width: CARD_W, background: 'transparent', borderRadius: 36, overflow: 'visible', position: 'relative', display: 'flex' }}>
                    <FeatureCard showDataOnly minH={Math.round(CARD_W * 4 / 3)} photoBg={null} bgOpacity={cardStates[LAYOUT_MODES.POSTER].opacity} processedExercises={processedExercises} prExercises={prExercises} avgEffort={avgEffort} totalVolume={totalVolume} durationSeconds={durationSeconds} calories={calories} heartRate={heartRate} completedDate={completedDate} locationName={locationName} />
                </div>
            </div>
            <div style={{ position: 'fixed', top: -9998, left: -9999, pointerEvents: 'none', zIndex: -1 }}>
                <div ref={offPeakRef} style={{ background: 'transparent', display: 'inline-block' }}>
                    <PeakCard featuredPR={featuredPR} isNewRecord={isNewRecord} totalVolume={totalVolume} totalSets={totalSets} bgOpacity={cardStates[LAYOUT_MODES.PR].opacity} />
                </div>
            </div>
            <div style={{ position: 'fixed', top: -9997, left: -9999, pointerEvents: 'none', zIndex: -1 }}>
                <div ref={offReportRef} style={{ background: 'transparent', display: 'inline-block' }}>
                    <ReportCard processedExercises={processedExercises} calories={calories} bgOpacity={cardStates[LAYOUT_MODES.MINIMAL].opacity} />
                </div>
            </div>

            {/* ─── Main Screen ───
                規範 v1：慶祝三拍的第三拍「暖光落定」——
                整屏 rise 進場（0.6s house easing）＋ soft-gold 氛圍燈墊底，
                coral 預算讓給下方 Share CTA，header kicker 回歸 faint ink */}
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto pt-[4.5rem] pb-10 px-5" style={{ backgroundColor: T.paper }}>

                {/* 氛圍燈：soft-gold 恢復/落定情緒，一屏一盞、墊在內容後 */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-none fixed inset-x-0 top-0 h-[46dvh] z-0"
                    style={{ background: 'radial-gradient(60% 70% at 50% 0%, rgba(212,197,165,0.45) 0%, transparent 65%)' }}
                />

                {/* ─── Header — 規範 v1：Swiss 左對齊、kicker → display 兩級跳，
                    無情對齊單一左緣，不置中 ─── */}
                <div className="w-full max-w-[420px] mb-10 flex flex-col items-start text-left relative z-10">
                    <p className="text-[9px] uppercase" style={{ color: `${T.deepBlack}66`, letterSpacing: '0.22em', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                        DRVN® Studio · Session Complete
                    </p>
                    <h1 className="mt-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 40, lineHeight: 0.95, letterSpacing: '-0.02em', color: T.deepBlack }}>
                        Share.
                    </h1>

                    {/* Integrated Success Notification */}
                    <AnimatePresence>
                        {saveToastVisible && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute top-[110%] left-[30%] -translate-x-1/2 z-[150] bg-[#F95C4B] px-5 py-2.5 rounded-full shadow-xl flex items-center gap-2.5"
                            >
                                <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                                    <Check size={10} className="text-[#F95C4B] font-black" />
                                </div>
                                <span className="text-white text-[12px] font-black tracking-widest">已儲存至相簿</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Section title — kicker ＋ 髮絲線（雜誌欄間 rule，取代粗框） */}
                <div className="w-full max-w-[420px] mb-4 flex items-center gap-3">
                    <p className="text-[9px] uppercase whitespace-nowrap" style={{ color: `${T.deepBlack}40`, letterSpacing: '0.22em', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                        {isGenerating ? 'Generating layouts' : '01 · Layout'}
                    </p>
                    <div style={{ flex: 1, height: 1, background: '#CFC6B8', opacity: 0.7 }} />
                </div>

                {/* ─── Gallery ─── */}
                <div className="w-full max-w-[420px] mb-5">
                    {isGenerating ? (
                        <div className="flex items-center justify-center gap-4 h-56">
                            <Loader size={22} className="animate-spin text-[#F95C4B]" />
                            <p className="text-sm font-bold" style={{ color: `${T.deepBlack}40` }}>Rendering layouts...</p>
                        </div>
                    ) : (
                        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                            {Object.values(LAYOUT_MODES).map(mode => {
                                const downloadImg = generatedImages[mode];
                                const previewImg = shareImages[mode] || downloadImg;
                                const isSelected = selectedLayout === mode;
                                const hasComposed = !!shareImages[mode];
                                // Thumbnail ratio matches current PHONE_H/PHONE_W
                                const THUMB_W = 128;
                                const THUMB_H = Math.round(THUMB_W * (PHONE_H / PHONE_W));
                                return (
                                    <div key={mode} className="flex-shrink-0 flex flex-col items-center gap-2" style={{ width: THUMB_W }}>
                                        {/* Thumbnail — fixed height, all same */}
                                        <motion.button {...pressProps('pill')}
 onClick={() => setEditorMode(mode)}
 className="relative rounded-[18px] overflow-hidden duration-200 "
 style={{
 // 規範 v1：選取態降級 — ink 細框＋coral 小點，
 // 整圈 coral 光暈讓給 Share CTA
 width: THUMB_W,
 height: THUMB_H,
 border: isSelected ? `1.5px solid ${T.deepBlack}` : `1px solid ${T.deepBlack}15`,
 boxShadow: isSelected ? '0 8px 24px -10px rgba(32,32,32,0.25)' : 'none',
 background: `${T.deepBlack}10`,
 flexShrink: 0,
 }}
 >
                                            {previewImg ? (
                                                <img loading="lazy" decoding="async" src={previewImg} alt={mode} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Loader size={14} className="animate-spin text-white/20" />
                                                </div>
                                            )}
                                            {/* Edit overlay */}
                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '10px' }}>
                                                <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.15em', background: 'rgba(0,0,0,0.45)', borderRadius: 18, padding: '3px 8px' }}>✏ Edit</span>
                                            </div>
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-[10px] h-[10px] rounded-full" style={{ background: T.primary, boxShadow: '0 0 0 3px rgba(249,92,75,0.25)' }} />
                                            )}
                                            {hasComposed && (
                                                <div className="absolute top-2 left-2 text-[9px] rounded-full px-2 py-0.5 uppercase" style={{ background: 'rgba(246,244,241,0.85)', color: T.deepBlack, letterSpacing: '0.16em', fontWeight: 800 }}>
                                                    Edited
                                                </div>
                                            )}
                                        </motion.button>

                                        {/* Label — 選取態用 ink 實色，非 coral */}
                                        <p className="text-[9px] uppercase" style={{ color: isSelected ? T.deepBlack : `${T.deepBlack}30`, letterSpacing: '0.18em', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                                            {LAYOUT_LABELS[mode]}
                                        </p>

                                        {/* Download — 降為安靜文字鈕（雜誌 caption 級），不再三顆粗框 pill */}
                                        <motion.button {...pressProps('pill')}
 onClick={() => handleDownload(mode)}
 disabled={!downloadImg}
 className="flex items-center gap-1 px-2 py-1 text-[11px] "
 style={{
 color: downloadImg ? `${T.deepBlack}59` : `${T.deepBlack}20`,
 letterSpacing: '0.08em',
 fontWeight: 700,
 borderBottom: `1px solid ${downloadImg ? `${T.deepBlack}26` : 'transparent'}`,
 }}
 >
                                            <Share2 size={10} /> 分享
                                        </motion.button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* PR Swap (Peak mode only) — 降為 ink ghost，coral 預算讓給 Share */}
                {!isGenerating && prExercises.length > 1 && (
                    <div className="w-full max-w-[420px] mb-4">
                        <motion.button {...pressProps('pill')}
 onClick={() => setSelectedPRIndex(prev => prev + 1)}
 className="w-full py-2.5 rounded-[18px] text-[9px] uppercase "
 style={{ background: `${T.deepBlack}06`, color: `${T.deepBlack}99`, border: `1px solid ${T.deepBlack}14`, letterSpacing: '0.18em', fontWeight: 800, fontFamily: 'var(--font-display)' }}
 >
                            Swap PR Record ({(selectedPRIndex % prExercises.length) + 1} / {prExercises.length})
                        </motion.button>
                    </div>
                )}

                {/* ─── Actions — 規範 v1：次要控制區坐進 Mist 冷灰地面（溫度分層），
                    上方暖色縮圖區浮起、此區後退 ─── */}
                <div className="w-full max-w-[420px] space-y-4 rounded-[28px] p-4 relative z-10"
                    style={{ background: '#E8E9E6', border: '1px solid rgba(22,20,21,0.05)' }}>

                    {/* Section kicker */}
                    <div className="flex items-center gap-3">
                        <p className="text-[9px] uppercase whitespace-nowrap" style={{ color: `${T.deepBlack}40`, letterSpacing: '0.22em', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                            02 · Customize
                        </p>
                        <div style={{ flex: 1, height: 1, background: '#CFC6B8', opacity: 0.7 }} />
                    </div>

                    {/* Photo upload + Landscape toggle row — Paper 卡浮在 Mist 上 */}
                    <div className="flex gap-3">
                        <motion.button {...pressProps('row')}
 onClick={() => fileInputRef.current?.click()}
 className="flex-1 py-3.5 rounded-[18px] flex items-center justify-center gap-2 text-sm font-bold "
 style={{ background: '#FBFAF8', border: '1px solid rgba(207,198,184,0.5)', color: T.deepBlack, boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}
 >
                            <ImageIcon size={15} /> {customImage ? 'Change Photo' : '+ Add Photo'}
                        </motion.button>
                        <motion.button {...pressProps('row')}
 onClick={() => setIsLandscape(v => !v)}
 className="flex-1 py-3.5 rounded-[18px] flex items-center justify-center gap-2 text-sm font-bold "
 style={{
 background: isLandscape ? T.deepBlack : '#FBFAF8',
 border: isLandscape ? `1px solid ${T.deepBlack}` : '1px solid rgba(207,198,184,0.5)',
 color: isLandscape ? T.paper : T.deepBlack,
 boxShadow: '0 1px 2px rgba(32,32,32,0.04)',
 }}
 >
                            <Move size={15} /> {isLandscape ? 'Landscape' : 'Portrait'}
                        </motion.button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

                    {/* Caption — Paper 卡 ＋ Pebble 髮絲框；含標題（選填），與 IGPostComposer 對齊 */}
                    <div className="rounded-[18px] p-4 relative" style={{ background: '#FBFAF8', border: '1px solid rgba(207,198,184,0.5)', boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}>
                        {/* 標題（選填）— 雜誌式大標輸入 */}
                        <input
                            value={postTitle}
                            onChange={(e) => setPostTitle(e.target.value)}
                            placeholder="標題（選填）"
                            className="w-full bg-transparent border-none outline-none"
                            style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: 22,
                                fontWeight: 400,
                                letterSpacing: '-0.01em',
                                color: T.deepBlack,
                                paddingBottom: 10,
                                caretColor: T.primary,
                            }}
                        />
                        <div style={{ height: 1, background: '#CFC6B8', opacity: 0.5, marginBottom: 10 }} />
                        <div className="relative">
                            <div className="absolute inset-0 pointer-events-none text-sm leading-relaxed text-transparent break-words whitespace-pre-wrap">
                                {renderCaption(caption)}
                            </div>
                            <textarea
                                ref={captionRef} value={caption} onChange={handleCaptionChange}
                                placeholder="Add a caption... Use @ to mention"
                                className="w-full min-h-[72px] bg-transparent border-none text-sm leading-relaxed resize-none outline-none caret-[#F95C4B]"
                                style={{ color: T.deepBlack }}
                            />
                        </div>
                        <AnimatePresence>
                            {filteredMentions.length > 0 && (
                                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                    className="absolute bottom-full left-0 right-0 mb-2 bg-[#161415] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-[120]"
                                >
                                    {filteredMentions.map(name => (
                                        <motion.button {...pressProps('cta')} key={name} onClick={() => insertMention(name)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 border-b border-white/5 last:border-0">
                                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: `${T.primary}30`, color: T.primary }}>{name[0]}</div>
                                            <span className="text-white text-sm font-bold">{name}</span>
                                        </motion.button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* 標註用戶 — 與 IGPostComposer 同功能，DRVN 髮絲線列樣式 */}
                    <div className="rounded-[18px] px-4" style={{ background: '#FBFAF8', border: '1px solid rgba(207,198,184,0.5)', boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}>
                        <motion.button {...pressProps('cta')} onClick={() => setShowTagField(v => !v)}
 className="w-full flex items-center justify-between py-3.5"
 style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                            <div className="flex items-center gap-3">
                                <UserPlus size={16} color="rgba(22,20,21,0.55)" strokeWidth={1.8} />
                                <span style={{ fontSize: 14, color: T.deepBlack, fontWeight: 600 }}>標註用戶</span>
                            </div>
                            {taggedUsers.length > 0
                                ? <span style={{ fontSize: 12, color: T.deepBlack, fontWeight: 700 }}>{taggedUsers.length} 人</span>
                                : <span style={{ fontSize: 12, color: `${T.deepBlack}40` }}>›</span>}
                        </motion.button>
                        {showTagField && (
                            <div style={{ padding: '0 0 14px 28px' }}>
                                <div className="flex items-center gap-2" style={{ borderBottom: '1px solid rgba(22,20,21,0.12)', paddingBottom: 8 }}>
                                    <span style={{ color: 'rgba(22,20,21,0.4)', fontSize: 14 }}>@</span>
                                    <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { setTaggedUsers(t => [...t, tagInput.trim()]); setTagInput(''); } }}
                                        placeholder="輸入帳號後按 Enter"
                                        className="flex-1 bg-transparent border-none outline-none"
                                        style={{ fontSize: 13, color: T.deepBlack, caretColor: T.primary }} />
                                </div>
                                {taggedUsers.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                                        {taggedUsers.map((tg, i) => (
                                            <span key={i} onClick={() => setTaggedUsers(arr => arr.filter((_, j) => j !== i))}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full cursor-pointer"
                                                style={{ background: 'rgba(22,20,21,0.06)', fontSize: 12, color: T.deepBlack }}>
                                                @{tg} <X size={10} />
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Share button — 規範 v1：本屏唯一 coral 焦點落在主 CTA，
                        kicker 級字距大寫、按壓 scale .97 */}
                    <div className="flex gap-3 pb-2 mt-4">
                        <motion.button {...pressProps('cta')} onClick={onExit}
 className="flex-1 py-4 rounded-[28px] text-sm "
 style={{ background: 'transparent', border: '1px solid rgba(207,198,184,0.8)', color: `${T.deepBlack}99`, letterSpacing: '0.14em', fontWeight: 700, fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}
 >
                            Close
                        </motion.button>
                        <motion.button {...pressProps('cta')}
 onClick={handleShare}
 disabled={isSharing || isGenerating}
 className="flex-[2] py-4 rounded-[28px] flex items-center justify-center gap-2 text-[13px] "
 style={{
 background: (isSharing || isGenerating)
 ? `${T.deepBlack}20`
 : 'linear-gradient(135deg, #F95C4B 0%, #E2542C 100%)',
 color: '#FFFFFF',
 letterSpacing: '0.16em',
 fontWeight: 800,
 fontFamily: 'var(--font-display)',
 textTransform: 'uppercase',
 boxShadow: (isSharing || isGenerating) ? 'none' : '0 10px 24px -8px rgba(249,92,75,0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
 }}
 >
                            {isSharing ? <><Loader size={16} className="animate-spin" /> Sharing...</>
                                : <><Send size={16} /> Share {LAYOUT_LABELS[selectedLayout]}</>}
                        </motion.button>
                    </div>
                </div>
            </motion.div>

            {/* ─── iOS Save Overlay ─── */}
            <AnimatePresence>
                {showSaveOverlay && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setShowSaveOverlay(false)}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9998,
                            background: 'rgba(0,0,0,0.93)',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            padding: '24px',
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.88, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.88, opacity: 0 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}
                        >
                            {/* Close */}
                            <motion.button {...pressProps('row')}
 onClick={() => setShowSaveOverlay(false)}
 style={{
 alignSelf: 'flex-end',
 width: 36, height: 36, borderRadius: '50%',
 background: 'rgba(255,255,255,0.12)',
 border: 'none', color: 'rgba(255,255,255,0.7)',
 fontSize: 20, lineHeight: '36px', textAlign: 'center',
 cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
 }}
 >×</motion.button>

                            {/* Image preview — long-press disabled to prevent WKWebView data-URI crash */}
                            {saveOverlayImg && (
                                <img loading="lazy" decoding="async"
                                    src={saveOverlayImg}
                                    alt="DRVN Workout Card"
                                    style={{
                                        width: '100%',
                                        borderRadius: 18,
                                        boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
                                        WebkitTouchCallout: 'none',   // ⚠️ keep OFF — long-press save on data-URI crashes WKWebView
                                        WebkitUserSelect: 'none',
                                        userSelect: 'none',
                                        display: 'block',
                                        pointerEvents: 'none',         // disable all touch on image; use button below
                                    }}
                                    draggable={false}
                                />
                            )}

                            {/* Instruction */}
                            <p style={{
                                color: 'rgba(255,255,255,0.55)', fontSize: 12, margin: '4px 0 0',
                                textAlign: 'center', lineHeight: 1.5,
                                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
                            }}>
                                點按鈕 → 選 <span style={{ color: 'white', fontWeight: 700 }}>儲存影像</span> 即可存到相簿
                            </p>

                            {/* Save button — 3-path fallback: Share API → Swift saveImage → fitnessApp */}
                            <button
                                onClick={async () => {
                                    if (!saveOverlayImg) return;

                                    // ─── Path 0: 打包版原生分享面板（WKWebView 無 Web Share API）
                                    try {
                                        if (window.webkit?.messageHandlers?.shareImage) {
                                            window.webkit.messageHandlers.shareImage.postMessage({
                                                dataURL: saveOverlayImg, filename: `DRVN_${Date.now()}.png`, text: '',
                                            });
                                            setSaveToastVisible(true);
                                            setShowSaveOverlay(false);
                                            setTimeout(() => setSaveToastVisible(false), 2500);
                                            return;
                                        }
                                    } catch (_) { /* bridge 失敗 → 繼續走 Path 1 */ }

                                    // ─── Path 1: navigator.share (iOS 15+, uses native share sheet)
                                    //    最可靠，不需 Swift rebuild，原生「儲存影像」選項
                                    try {
                                        // Synchronously decode base64 → File (no await before share())
                                        const parts = saveOverlayImg.split(',');
                                        const base64 = parts[1] || '';
                                        const binary = atob(base64);
                                        const bytes = new Uint8Array(binary.length);
                                        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                                        const blob = new Blob([bytes], { type: 'image/png' });
                                        const file = new File([blob], `DRVN_${Date.now()}.png`, { type: 'image/png' });
                                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                            await navigator.share({ files: [file], title: 'DRVN Workout Card' });
                                            setSaveToastVisible(true);
                                            setShowSaveOverlay(false);
                                            setTimeout(() => setSaveToastVisible(false), 2500);
                                            return;
                                        }
                                    } catch (shareErr) {
                                        // User cancelled share sheet → don't show error, just return
                                        if (shareErr?.name === 'AbortError') return;
                                        console.warn('[save] navigator.share failed:', shareErr);
                                    }

                                    // ─── Path 2: dedicated saveImage handler (Xcode rebuilt)
                                    if (window.webkit?.messageHandlers?.saveImage) {
                                        try {
                                            window.webkit.messageHandlers.saveImage.postMessage(saveOverlayImg);
                                            return;
                                        } catch (e) { console.warn('[save] saveImage failed:', e); }
                                    }

                                    // ─── Path 3: fitnessApp bridge (requires Swift rebuild with new case)
                                    if (window.webkit?.messageHandlers?.fitnessApp) {
                                        try {
                                            window.webkit.messageHandlers.fitnessApp.postMessage({ type: 'saveImage', data: saveOverlayImg });
                                            return;
                                        } catch (e) { console.warn('[save] fitnessApp failed:', e); }
                                    }

                                    // ─── Path 4: Desktop download fallback
                                    try {
                                        const link = document.createElement('a');
                                        link.href = saveOverlayImg;
                                        link.download = `DRVN_${Date.now()}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    } catch (e) {
                                        toast.error('儲存失敗，請截圖保存。');
                                    }
                                }}
                                style={{
                                    width: '100%', padding: '16px 0', borderRadius: 12,
                                    background: '#F95C4B', border: 'none',
                                    color: 'white', fontSize: 16, fontWeight: 800,
                                    cursor: 'pointer', letterSpacing: '-0.3px',
                                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                                    WebkitTapHighlightColor: 'transparent',
                                    boxShadow: '0 4px 20px rgba(249,92,75,0.4)',
                                }}
                            >
                                儲存到相簿
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Full-Screen Editor Modal ─── */}
            <AnimatePresence>
                {editorMode && (
                    <CardEditor
                        mode={editorMode}
                        customImage={customImage}
                        featuredPR={featuredPR}
                        isNewRecord={isNewRecord}
                        processedExercises={processedExercises}
                        calories={calories}
                        prExercises={prExercises}
                        avgEffort={avgEffort}
                        totalVolume={totalVolume}
                        totalSets={totalSets}
                        durationSeconds={durationSeconds}
                        heartRate={heartRate}
                        completedDate={completedDate}
                        locationName={locationName}
                        initialState={cardStates[editorMode] || { x: 0, y: 0, scale: 1, opacity: 10 }}
                        cardH={PHONE_H}
                        onDone={handleEditorDone}
                        onClose={() => setEditorMode(null)}
                    />
                )}
            </AnimatePresence>


        </>
    );
};

export default EvolutionCompletionCard;
