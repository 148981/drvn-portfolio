import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { getDisplayName } from '../utils/socialIdentity';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
// html2canvas loaded on-demand (bundle-dynamic-imports)
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Send, Download, Check, Loader, Move, GripHorizontal, Target, Camera, Zap, Activity, UserPlus, Share2 } from 'lucide-react';
import apiClient from '../api/client';
import { RunningFeatureCard, RunningApexCard, RunningPhysioCard, RouteThumbnail, formatPace } from './RunningCardComponents';
import { getUserId } from '../utils/auth';
import { addSocialPost } from '../utils/socialPostsStore';
import { toast } from '../utils/toast';

const LAYOUT_MODES = { POSTER: 'POSTER', PEAK: 'PEAK', REPORT: 'REPORT' };
const LAYOUT_LABELS = { POSTER: 'Feature', PEAK: 'Apex', REPORT: 'Physio' };

const screenW = typeof window !== 'undefined' ? window.innerWidth : 390;
const CARD_W = screenW - 32;

// 🚩 核心配色：Minimalist Premium System
const T = {
    primary: '#F95C4B', // Coral
    stone: '#E4DED2',   // Stone (次要文字、邊框)
    pebble: '#CFC6B8',  // Pebble (過渡色)
    paper: '#F6F4F1',   // Paper (主要對比文字色)
    bg: '#000000',      // Deep Pure Black (背景)
    surface: 'rgba(228, 222, 210, 0.05)', // 基於 Stone 的極透底色
    text: {
        bright: '#FFFFFF', // 主要亮色
        subtle: 'rgba(255, 255, 255, 0.65)', // 微調亮色次要文字
        micro: 'rgba(255, 255, 255, 0.35)', // 極淡文字
    },
};

// =====================================================
// FULLSCREEN CARD EDITOR
// =====================================================
const CardEditor = ({ mode, cardioData, customImage, initialState, cardW, cardH, onDone, onClose }) => {
    const editorRef = useRef(null);
    const [state, setState] = useState(initialState);
    const [isCapturing, setIsCapturing] = useState(false);
    const initialDistanceRef = useRef(0); // 縮放開始時的初始兩指距離
    const initialScaleRef = useRef(1); // 縮放開始時的初始卡片大小
    const [isPinching, setIsPinching] = useState(false); // 禁用拖動當在縮放時

    const PHONE_W = cardW; 
    const PHONE_H = cardH;

    // ── Pinch-zoom: 手指滑動放大縮小（線性） ──
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            setIsPinching(true);
            const [t1, t2] = [e.touches[0], e.touches[1]];
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            initialDistanceRef.current = distance;
            initialScaleRef.current = state.scale; // 記錄縮放開始時的 scale
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && initialDistanceRef.current > 0) {
            const [t1, t2] = [e.touches[0], e.touches[1]];
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            // 始終與初始距離比較 → 線性縮放
            const ratio = currentDistance / initialDistanceRef.current;
            const newScale = Math.max(0.4, Math.min(2.5, initialScaleRef.current * ratio));
            setState(s => ({ ...s, scale: newScale }));
        }
    };

    const handleTouchEnd = () => {
        initialDistanceRef.current = 0;
        initialScaleRef.current = 1;
        setIsPinching(false);
    };

    const handleConfirm = async () => {
        setIsCapturing(true);
        try {
            await document.fonts.ready;
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(editorRef.current, {
                useCORS: true, scale: 4, backgroundColor: '#0A0A0A'
            });
            onDone(canvas.toDataURL('image/png'), state);
        } catch (e) { console.error(e); }
        setIsCapturing(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="fixed inset-0 bg-black z-[400] flex flex-col items-center justify-start pt-6 overflow-hidden"
        >
            <div ref={editorRef} style={{ width: PHONE_W, height: PHONE_H, position: 'relative', borderRadius: 0, overflow: 'hidden', background: '#0A0A0A', flexShrink: 0, touchAction: 'none' }}>
                {customImage && (
                    <div 
                        className="absolute inset-0 w-full h-full" 
                        style={{ 
                            backgroundImage: `url(${customImage})`, 
                            backgroundSize: 'cover', 
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat'
                        }} 
                    />
                )}
                <div className="absolute inset-0 bg-black/20" />
                
                {/* 統一採用置中布局，確保 x,y 座標在編輯器與社群牆完全一致 */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <motion.div
                        drag={!isPinching} // 縮放時禁用拖動
                        dragMomentum={false}
                        initial={{ x: state.x, y: state.y }}
                        onDragEnd={(e, info) => {
                            setState(s => ({ ...s, x: s.x + info.offset.x, y: s.y + info.offset.y }));
                        }}
                        style={{ zIndex: 10, cursor: 'grab', position: 'relative' }}
                    >
                        <motion.div style={{ scale: state.scale }}>
                            {mode === LAYOUT_MODES.POSTER && <RunningFeatureCard data={cardioData} bgOpacity={state.opacity} />}
                            {mode === LAYOUT_MODES.PEAK && <RunningApexCard data={cardioData} bgOpacity={state.opacity} />}
                            {mode === LAYOUT_MODES.REPORT && <RunningPhysioCard data={cardioData} bgOpacity={state.opacity} />}
                        </motion.div>

                    {!isCapturing && (
                        <motion.div 
                            drag="y" dragConstraints={{ top: 0, bottom: 0 }}
                            onDrag={(e, info) => {
                                setState(s => ({ ...s, scale: Math.max(0.4, Math.min(2.5, s.scale - info.delta.y * 0.008)) }));
                            }}
                            style={{ position: 'absolute', bottom: -40, left: '50%', x: '-50%', width: 48, height: 24, background: 'rgba(255,255,255,0.35)', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}
                        >
                            <GripHorizontal size={16} color="white" />
                        </motion.div>
                    )}
                    </motion.div>
                </div>
            </div>

            {/* Controls — Fixed at bottom to ensure visibility */}
            <div
                className="absolute bottom-10 w-full max-w-[340px] px-4 space-y-6"
                onTouchStart={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
                onTouchEnd={e => e.stopPropagation()}
            >
                <div className="space-y-4">
                    <div className="flex justify-between text-[9px] font-black text-white/40 tracking-[0.2em] uppercase">
                        <span>Background Opacity</span>
                        <span style={{ color: T.primary }}>{state.opacity}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="100" value={state.opacity} 
                        onChange={e => setState(s => ({ ...s, opacity: parseInt(e.target.value) }))} 
                        className="w-full h-1.5 accent-[#F95C4B] bg-white/10 rounded-full appearance-none" 
                    />
                </div>

                <div className="flex gap-4 pb-10">
                    <motion.button {...pressProps('cta')} onClick={onClose} className="flex-1 py-5 rounded-[18px] bg-white/5 border border-white/10 font-bold text-xs uppercase tracking-widest text-[#E4DED2]">CANCEL</motion.button>
                    <motion.button {...pressProps('row')} onClick={handleConfirm} disabled={isCapturing} className="flex-[2] py-5 rounded-[18px] bg-[#F95C4B] text-[#161415] font-black flex items-center justify-center gap-2 tracking-widest text-xs uppercase shadow-xl shadow-[#F95C4B]/20">
                        {isCapturing ? <Loader size={18} className="animate-spin" /> : <><Check size={18} /> CONFIRM</>}
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
};

// =====================================================
// MAIN ENTRY: GALLERY + SOCIAL ACTION
// =====================================================
const RunningEvolutionCard = ({ cardioData, onExit }) => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const offscreenStickerRef = useRef(null);

    const [customImage, setCustomImage] = useState(null);
    const [editorMode, setEditorMode] = useState(null);
    const [selectedLayout, setSelectedLayout] = useState(LAYOUT_MODES.POSTER);
    const [isLandscape, setIsLandscape] = useState(false);
    const cardH = isLandscape ? Math.round(CARD_W * 0.75) : Math.round(CARD_W * (4/3));
    
    // CARD STATE PERSISTENCE
    const [cardStates, setCardStates] = useState({
        [LAYOUT_MODES.POSTER]: { x: 0, y: 0, scale: 1, opacity: 15 },
        [LAYOUT_MODES.PEAK]: { x: 0, y: 0, scale: 1, opacity: 85 },
        [LAYOUT_MODES.REPORT]: { x: 0, y: 0, scale: 1, opacity: 90 },
    });

    const [previewImages, setPreviewImages] = useState({ POSTER: null, PEAK: null, REPORT: null });
    const [caption, setCaption] = useState('今天這趟跑完真的很有感！💦 #DRVN #RunningPerformance');
    const [postTitle, setPostTitle] = useState('');
    const [taggedUsers, setTaggedUsers] = useState([]);
    const [tagInput, setTagInput] = useState('');
    const [showTagField, setShowTagField] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    // ─── iOS save overlay ───
    const [showSaveOverlay, setShowSaveOverlay] = useState(false);
    const [saveOverlayImg, setSaveOverlayImg] = useState(null);
    const [saveToastVisible, setSaveToastVisible] = useState(false);
    // 哪個 mode 正在 loading（顯示 spinner 在按鈕上）
    const [savingMode, setSavingMode] = useState(null);

    // ─── iOS detection ───
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) setCustomImage(URL.createObjectURL(file));
    };

    const downloadCardJPG = async (mode) => {
        if (savingMode) return; // 防止重複點擊
        setSavingMode(mode);

        const targetId = `capture-${mode}`;
        const targetElement = document.getElementById(targetId);
        if (!targetElement) {
            setSavingMode(null);
            return;
        }

        let dataUrl;
        try {
            await document.fonts.ready;
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(targetElement, {
                useCORS: true,
                allowTaint: true,
                logging: false,
                scale: 4,
                backgroundColor: null, // 透明背景 → 去背 PNG
                onclone: (clonedDoc) => {
                    // 在 clone 裡強制移除所有 backdrop-filter（html2canvas 不支援）
                    const allEls = clonedDoc.querySelectorAll('*');
                    allEls.forEach(el => {
                        el.style.backdropFilter = 'none';
                        el.style.webkitBackdropFilter = 'none';
                    });
                    // 套用圓角裁切
                    const card = clonedDoc.getElementById(targetId);
                    if (card) {
                        const br = window.getComputedStyle(targetElement).borderRadius;
                        if (br && br !== '0px') {
                            card.style.clipPath = `inset(0 round ${br})`;
                            card.style.webkitClipPath = `inset(0 round ${br})`;
                        }
                    }
                }
            });
            dataUrl = canvas.toDataURL('image/png');
        } catch (e) {
            console.error('[DRVN] Card capture failed:', e);
            setSavingMode(null);
            toast.error('卡片截圖失敗，請再試一次。');
            return;
        }

        setSavingMode(null);

        // ── Path 1: Swift 原生 handler（saveImage registered in WKWebView）──
        if (window.webkit?.messageHandlers?.saveImage) {
            try {
                window.webkit.messageHandlers.saveImage.postMessage(dataUrl);
                setSaveToastVisible(true);
                setTimeout(() => setSaveToastVisible(false), 2500);
            } catch (e) {
                console.warn('[DRVN] saveImage handler failed:', e);
                // 降級到 overlay
                setSaveOverlayImg(dataUrl);
                setShowSaveOverlay(true);
            }
            return;
        }

        // ── Path 2: iOS — in-app overlay，讓使用者透過 Share Sheet 存到相簿 ──
        if (isIOS) {
            setSaveOverlayImg(dataUrl);
            setShowSaveOverlay(true);
            return;
        }

        // ── Path 3: Desktop — 標準 <a download> ──
        const link = document.createElement('a');
        link.download = `DRVN_RUN_${mode}_${Date.now()}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 🔧 Helper: 壓縮大型 base64 截圖成適合 localStorage 的小縮圖（約 30-80KB）
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

    const handleFinalShare = async () => {
        // 有沒有真的送到伺服器 —— 決定要不要說「已分享」、要不要把人帶去社群頁
        let syncedToServer = true;
        setIsSharing(true);
        try {
            const userName = getDisplayName();
            const userId = getUserId();

            // ── 1. 不存截圖：用 cardStates 記錄使用者調整的 x/y/scale/opacity
            //       feed 端以相同參數重新渲染原始組件，達到等比例同步顯示

            // ── 2. Backend API sync (non-fatal) ──
            try {
                const formData = new FormData();
                formData.append('user_id', userId);
                formData.append('user_name', userName);
                formData.append('caption', caption || '');
                formData.append('activity_type', 'run');
                formData.append('session_data', JSON.stringify({
                    session_id: cardioData.sessionId || `local_${Date.now()}`,
                    stats: cardioData.stats,
                    activity_type: 'run'
                }));

                // 背景圖（customImage）壓縮後才傳給 backend
                if (customImage) {
                    try {
                        const bgThumb = await compressToThumbnail(customImage, 800, 0.5);
                        const blob = await fetch(bgThumb).then(r => r.blob());
                        formData.append('photo', blob, 'running_card.jpg');
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

            // ── 3. 限制 route 資料量（防止 localStorage 爆炸） ──
            const rawRoute = cardioData.route || [];
            const limitedRoute = rawRoute.length > 200
                ? rawRoute.filter((_, i) => i % Math.ceil(rawRoute.length / 200) === 0)
                : rawRoute;

            // ── 4. 建構本地貼文 ──
            const localPost = {
                activity_id: `local_run_${Date.now()}`,
                user_id: userId,
                user_name: userName,
                title: postTitle?.trim() || null,
                tags: taggedUsers,
                caption,
                photo: null,
                activity_type: 'run',
                metrics: {
                    distance: cardioData.stats?.distance || 0,
                    pace: cardioData.stats?.pace || 0,
                    duration: cardioData.stats?.duration || 0,
                    calories: cardioData.stats?.calories || 0,
                },
                created_at: new Date().toISOString(),
                kudos_count: 0,
                drvnCard: {
                    layout: selectedLayout,
                    cardStates: cardStates,   // ✅ 含 x/y/scale/opacity，feed 端等比例重建
                    route: limitedRoute,
                    stats: cardioData.stats,
                    customImage: customImage  // 背景圖（壓縮後）存入，feed 端套用相同背景
                        ? await compressToThumbnail(customImage, 600, 0.5).catch(() => null)
                        : null,
                    editorWidth: CARD_W,      // ✅ 記錄編輯器寬高，供 feed 計算等比例偏移
                    editorHeight: cardH,
                    accentColor: '#F95C4B'
                }
            };

            // ── 5. 儲存貼文（已用 userId 命名空間，uStorage 自動處理容量保護）──
            try {
                addSocialPost(localPost, userId);
                console.log('✅ Native Hydration Post saved safely');
            } catch (storageErr) {
                console.error('❌ socialPostsStore save failed:', storageErr);
            }

            toast.success('跑步報告已發佈到社群');
            navigate('/social-mobile');
        } catch (e) {
            console.error('❌ Share error:', e);
            toast.warning('已儲存到本地，但同步到雲端失敗，請檢查網路後再試');
            navigate('/social-mobile');
        }
        setIsSharing(false);
    };

    return (
        <div className="fixed inset-0 z-[300] flex flex-col items-center overflow-y-auto pt-[4.5rem] pb-10 px-5 font-sans text-[#161415]" style={{ backgroundColor: '#F6F4F1' }}>
            {/* 氛圍燈：soft-gold 落定情緒，一屏一盞、墊在內容後（z-0） */}
            <div
                className="pointer-events-none fixed inset-x-0 top-0 h-[46dvh] z-0"
                style={{ background: 'radial-gradient(60% 70% at 50% 0%, rgba(212,197,165,0.45) 0%, transparent 65%)' }}
            />

            {/* ─── Header — Swiss 左對齊、kicker → display 兩級跳 ─── */}
            <div className="w-full max-w-[420px] mb-10 flex flex-col items-start text-left relative z-10">
                <p className="text-[9px] uppercase" style={{ color: 'rgba(22,20,21,0.40)', letterSpacing: '0.22em', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                    DRVN® Studio · Run Complete
                </p>
                <h1 className="mt-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 40, lineHeight: 0.95, letterSpacing: '-0.02em', color: '#161415' }}>
                    Share.
                </h1>
            </div>

            {/* Section title 01 — kicker ＋ 髮絲線 */}
            <div className="w-full max-w-[420px] mb-4 flex items-center gap-3 relative z-10">
                <p className="text-[9px] uppercase whitespace-nowrap" style={{ color: 'rgba(22,20,21,0.40)', letterSpacing: '0.22em', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                    01 · Layout
                </p>
                <div style={{ flex: 1, height: 1, background: '#CFC6B8', opacity: 0.7 }} />
            </div>

            {/* ─── Gallery — 橫向捲動縮圖（Swiss editorial，選取態 ink 細框＋coral 小點） ─── */}
            <div className="w-full max-w-[420px] mb-5 relative z-10">
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    {Object.values(LAYOUT_MODES).map(mode => {
                        const isSelected = selectedLayout === mode;
                        const hasComposed = !!previewImages[mode];
                        const THUMB_W = 128;
                        const THUMB_H = isLandscape ? Math.round(THUMB_W * 0.75) : Math.round(THUMB_W * (4 / 3));
                        const thumbScale = THUMB_W / 320;
                        return (
                            <div key={mode} className="flex-shrink-0 flex flex-col items-center gap-2" style={{ width: THUMB_W }}>
                                {/* Thumbnail — 點擊進編輯器 */}
                                <motion.button {...pressProps('pill')}
 onClick={() => setEditorMode(mode)}
 className="relative rounded-[18px] overflow-hidden duration-200 "
 style={{
 width: THUMB_W,
 height: THUMB_H,
 border: isSelected ? '1.5px solid #161415' : '1px solid rgba(22,20,21,0.08)',
 boxShadow: isSelected ? '0 8px 24px -10px rgba(32,32,32,0.25)' : 'none',
 background: 'rgba(22,20,21,0.06)',
 flexShrink: 0,
 }}
 >
                                    {customImage && (
                                        <img loading="lazy" decoding="async" src={customImage} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="" style={{ pointerEvents: 'none' }} />
                                    )}
                                    {/* Scaled-down live card preview */}
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(-50%, -50%) scale(${thumbScale})`, transformOrigin: 'center center', pointerEvents: 'none' }}>
                                        {mode === LAYOUT_MODES.POSTER && <RunningFeatureCard data={cardioData} bgOpacity={cardStates[mode].opacity} />}
                                        {mode === LAYOUT_MODES.PEAK && <RunningApexCard data={cardioData} bgOpacity={cardStates[mode].opacity} />}
                                        {mode === LAYOUT_MODES.REPORT && <RunningPhysioCard data={cardioData} bgOpacity={cardStates[mode].opacity} />}
                                    </div>
                                    {/* Edit overlay */}
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '10px' }}>
                                        <span style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.15em', background: 'rgba(0,0,0,0.45)', borderRadius: 18, padding: '3px 8px' }}>✏ 編輯</span>
                                    </div>
                                    {isSelected && (
                                        <div className="absolute top-2 right-2 w-[10px] h-[10px] rounded-full" style={{ background: '#F95C4B', boxShadow: '0 0 0 3px rgba(249,92,75,0.25)' }} />
                                    )}
                                    {hasComposed && (
                                        <div className="absolute top-2 left-2 text-[9px] rounded-full px-2 py-0.5 uppercase" style={{ background: 'rgba(246,244,241,0.85)', color: '#161415', letterSpacing: '0.16em', fontWeight: 800 }}>
                                            Edited
                                        </div>
                                    )}
                                </motion.button>

                                {/* Label — 選取態 ink 實色 */}
                                <p className="text-[9px] uppercase" style={{ color: isSelected ? '#161415' : 'rgba(22,20,21,0.30)', letterSpacing: '0.18em', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                                    {LAYOUT_LABELS[mode]}
                                </p>

                                {/* Download — 安靜文字鈕 */}
                                <motion.button {...pressProps('pill')}
 onClick={() => downloadCardJPG(mode)}
 disabled={!!savingMode}
 className="flex items-center gap-1 px-2 py-1 text-[11px] disabled:opacity-40"
 style={{ color: 'rgba(22,20,21,0.55)', letterSpacing: '0.08em', fontWeight: 700, borderBottom: '1px solid rgba(22,20,21,0.15)' }}
 >
                                    {savingMode === mode ? <Loader size={10} className="animate-spin" /> : <Share2 size={10} />} 分享
                                </motion.button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ─── Actions — Mist 冷灰地面（溫度分層）：上方暖縮圖浮起、此區後退 ─── */}
            <div className="w-full max-w-[420px] space-y-4 rounded-[28px] p-4 relative z-10" style={{ background: '#E8E9E6', border: '1px solid rgba(22,20,21,0.05)' }}>

                {/* Section kicker 02 */}
                <div className="flex items-center gap-3">
                    <p className="text-[9px] uppercase whitespace-nowrap" style={{ color: 'rgba(22,20,21,0.40)', letterSpacing: '0.22em', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                        02 · Customize
                    </p>
                    <div style={{ flex: 1, height: 1, background: '#CFC6B8', opacity: 0.7 }} />
                </div>

                {/* Photo + Landscape row — Paper 卡浮在 Mist 上 */}
                <div className="flex gap-3">
                    <motion.button {...pressProps('row')}
 onClick={() => fileInputRef.current?.click()}
 className="flex-1 py-3.5 rounded-[18px] flex items-center justify-center gap-2 text-sm font-bold "
 style={{ background: '#FBFAF8', border: '1px solid rgba(207,198,184,0.5)', color: '#161415', boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}
 >
                        <Camera size={15} /> {customImage ? '更換照片' : '+ 加入照片'}
                    </motion.button>
                    <motion.button {...pressProps('row')}
 onClick={() => setIsLandscape(v => !v)}
 className="flex-1 py-3.5 rounded-[18px] flex items-center justify-center gap-2 text-sm font-bold "
 style={{
 background: isLandscape ? '#161415' : '#FBFAF8',
 border: isLandscape ? '1px solid #161415' : '1px solid rgba(207,198,184,0.5)',
 color: isLandscape ? '#F6F4F1' : '#161415',
 boxShadow: '0 1px 2px rgba(32,32,32,0.04)',
 }}
 >
                        <Move size={15} /> {isLandscape ? 'Landscape' : 'Portrait'}
                    </motion.button>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />

                {/* Caption — Paper 卡 ＋ Pebble 髮絲框；標題（選填）＋ 內文 */}
                <div className="rounded-[18px] p-4 relative" style={{ background: '#FBFAF8', border: '1px solid rgba(207,198,184,0.5)', boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}>
                    <input
                        value={postTitle}
                        onChange={(e) => setPostTitle(e.target.value)}
                        placeholder="標題（選填）"
                        className="w-full bg-transparent border-none outline-none"
                        style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', color: '#161415', paddingBottom: 10, caretColor: '#F95C4B' }}
                    />
                    <div style={{ height: 1, background: '#CFC6B8', opacity: 0.5, marginBottom: 10 }} />
                    <textarea
                        value={caption} onChange={e => setCaption(e.target.value)}
                        placeholder="說點什麼..."
                        className="w-full min-h-[72px] bg-transparent border-none text-sm leading-relaxed resize-none outline-none caret-[#F95C4B]"
                        style={{ color: '#161415' }}
                    />
                </div>

                {/* 標註用戶 — DRVN 髮絲線列樣式 */}
                <div className="rounded-[18px] px-4" style={{ background: '#FBFAF8', border: '1px solid rgba(207,198,184,0.5)', boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}>
                    <motion.button {...pressProps('cta')} onClick={() => setShowTagField(v => !v)}
 className="w-full flex items-center justify-between py-3.5"
 style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <div className="flex items-center gap-3">
                            <UserPlus size={16} color="rgba(22,20,21,0.55)" strokeWidth={1.8} />
                            <span style={{ fontSize: 14, color: '#161415', fontWeight: 600 }}>標註用戶</span>
                        </div>
                        {taggedUsers.length > 0
                            ? <span style={{ fontSize: 12, color: '#161415', fontWeight: 700 }}>{taggedUsers.length} 人</span>
                            : <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.40)' }}>›</span>}
                    </motion.button>
                    {showTagField && (
                        <div style={{ padding: '0 0 14px 28px' }}>
                            <div className="flex items-center gap-2" style={{ borderBottom: '1px solid rgba(22,20,21,0.12)', paddingBottom: 8 }}>
                                <span style={{ color: 'rgba(22,20,21,0.4)', fontSize: 14 }}>@</span>
                                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { setTaggedUsers(t => [...t, tagInput.trim()]); setTagInput(''); } }}
                                    placeholder="輸入帳號後按 Enter"
                                    className="flex-1 bg-transparent border-none outline-none"
                                    style={{ fontSize: 13, color: '#161415', caretColor: '#F95C4B' }} />
                            </div>
                            {taggedUsers.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2.5">
                                    {taggedUsers.map((tg, i) => (
                                        <span key={i} onClick={() => setTaggedUsers(arr => arr.filter((_, j) => j !== i))}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full cursor-pointer"
                                            style={{ background: 'rgba(22,20,21,0.06)', fontSize: 12, color: '#161415' }}>
                                            @{tg} <X size={10} />
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Close + Share — 本屏唯一 coral 焦點落在 Share CTA */}
                <div className="flex gap-3 pb-2 mt-4">
                    <motion.button {...pressProps('cta')} onClick={onExit}
 className="flex-1 py-4 rounded-[28px] text-sm "
 style={{ background: 'transparent', border: '1px solid rgba(207,198,184,0.8)', color: 'rgba(22,20,21,0.60)', letterSpacing: '0.14em', fontWeight: 700, fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}
 >
                        Close
                    </motion.button>
                    <motion.button {...pressProps('cta')}
 onClick={handleFinalShare}
 disabled={isSharing}
 className="flex-[2] py-4 rounded-[28px] flex items-center justify-center gap-2 text-[13px] "
 style={{
 background: isSharing ? 'rgba(22,20,21,0.20)' : 'linear-gradient(135deg, #F95C4B 0%, #E2542C 100%)',
 color: '#FFFFFF', letterSpacing: '0.16em', fontWeight: 800, fontFamily: 'var(--font-display)', textTransform: 'uppercase',
 boxShadow: isSharing ? 'none' : '0 10px 24px -8px rgba(249,92,75,0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
 }}
 >
                        {isSharing ? <><Loader size={16} className="animate-spin" /> Sharing...</> : <><Send size={16} /> Share {LAYOUT_LABELS[selectedLayout]}</>}
                    </motion.button>
                </div>
            </div>

            {/* Modal Editor Overlay — portal 到 body，避免 iOS Safari overflow 容器破壞 fixed 定位 */}
            {editorMode && createPortal(
                <CardEditor
                    key={editorMode}
                    mode={editorMode}
                    customImage={customImage}
                    cardioData={cardioData}
                    initialState={cardStates[editorMode]}
                    cardW={CARD_W}
                    cardH={cardH}
                    onDone={(img, newState) => {
                        setPreviewImages(p => ({ ...p, [editorMode]: img }));
                        setCardStates(p => ({ ...p, [editorMode]: newState }));
                        setSelectedLayout(editorMode);
                        setEditorMode(null);
                    }}
                    onClose={() => setEditorMode(null)}
                />,
                document.body
            )}

            {/* ─── Save Success Toast ─── */}
            <AnimatePresence>
                {saveToastVisible && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 30 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                        style={{
                            position: 'fixed', bottom: 48, left: '50%', x: '-50%',
                            zIndex: 9999,
                            background: '#161415',
                            border: '1px solid rgba(249,92,75,0.4)',
                            borderRadius: 36,
                            padding: '12px 24px',
                            display: 'flex', alignItems: 'center', gap: 10,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <Check size={16} color="#F95C4B" />
                        <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>已儲存到相簿！</span>
                    </motion.div>
                )}
            </AnimatePresence>

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
                            {/* Close button */}
                            <motion.button {...pressProps('row')}
 onClick={() => setShowSaveOverlay(false)}
 style={{
 alignSelf: 'flex-end',
 width: 36, height: 36, borderRadius: '50%',
 background: 'rgba(255,255,255,0.12)',
 border: 'none', color: 'rgba(255,255,255,0.7)',
 fontSize: 20, cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'center'
 }}
 >×</motion.button>

                            {/* Image preview — long-press disabled; data-URI long-press crashes WKWebView */}
                            {saveOverlayImg && (
                                <img loading="lazy" decoding="async"
                                    src={saveOverlayImg}
                                    alt="DRVN Running Card"
                                    style={{
                                        width: '100%',
                                        borderRadius: 0,
                                        boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
                                        WebkitTouchCallout: 'none',
                                        WebkitUserSelect: 'none',
                                        userSelect: 'none',
                                        display: 'block',
                                        pointerEvents: 'none',
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

                            {/* Save button — 3-path fallback: Share API → Swift saveImage → desktop */}
                            <motion.button {...pressProps('row')}
 onClick={async () => {
 if (!saveOverlayImg) return;

 // ─── Path 0: 打包版原生分享面板（WKWebView 無 Web Share API）
 try {
 if (window.webkit?.messageHandlers?.shareImage) {
 window.webkit.messageHandlers.shareImage.postMessage({
 dataURL: saveOverlayImg, filename: `DRVN_Run_${Date.now()}.png`, text: '',
 });
 setSaveToastVisible(true);
 setShowSaveOverlay(false);
 setTimeout(() => setSaveToastVisible(false), 2500);
 return;
 }
 } catch (_) { /* bridge 失敗 → 繼續走 Path 1 */ }

 // ─── Path 1: navigator.share (iOS 15+) ───
 try {
 const parts = saveOverlayImg.split(',');
 const base64 = parts[1] || '';
 const binary = atob(base64);
 const bytes = new Uint8Array(binary.length);
 for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
 const blob = new Blob([bytes], { type: 'image/png' });
 const file = new File([blob], `DRVN_Run_${Date.now()}.png`, { type: 'image/png' });
 if (navigator.canShare && navigator.canShare({ files: [file] })) {
 await navigator.share({ files: [file], title: 'DRVN Running Card' });
 setSaveToastVisible(true);
 setShowSaveOverlay(false);
 setTimeout(() => setSaveToastVisible(false), 2500);
 return;
 }
 } catch (shareErr) {
 if (shareErr?.name === 'AbortError') return;
 console.warn('[save] navigator.share failed:', shareErr);
 }

 // ─── Path 2: saveImage webkit bridge ───
 if (window.webkit?.messageHandlers?.saveImage) {
 try {
 window.webkit.messageHandlers.saveImage.postMessage(saveOverlayImg);
 setSaveToastVisible(true);
 setShowSaveOverlay(false);
 setTimeout(() => setSaveToastVisible(false), 2500);
 return;
 } catch (e) { console.warn('[save] saveImage failed:', e); }
 }

 // ─── Path 3: fitnessApp bridge ───
 if (window.webkit?.messageHandlers?.fitnessApp) {
 try {
 window.webkit.messageHandlers.fitnessApp.postMessage({ type: 'saveImage', data: saveOverlayImg });
 setSaveToastVisible(true);
 setShowSaveOverlay(false);
 setTimeout(() => setSaveToastVisible(false), 2500);
 return;
 } catch (e) { console.warn('[save] fitnessApp failed:', e); }
 }

 // ─── Path 4: Desktop download fallback ───
 try {
 const link = document.createElement('a');
 link.href = saveOverlayImg;
 link.download = `DRVN_Run_${Date.now()}.png`;
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
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
 }}
 >
                                <Share2 size={20} />
                                分享到相簿
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* OFFSCREEN CARD CONTAINER — forCapture=true 停用 backdrop-filter 讓 html2canvas 能正確截圖 */}
            {/* background: 'transparent' → 圓角外圍去背，只有卡片本身有顏色 */}
            <div style={{ position: 'fixed', top: -9999, left: -9999, pointerEvents: 'none', zIndex: -1 }}>
                <div id="capture-POSTER" style={{ width: CARD_W, height: cardH, position: 'relative', overflow: 'hidden', background: 'transparent' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <div style={{ transform: `translate(${cardStates.POSTER.x}px, ${cardStates.POSTER.y}px) scale(${cardStates.POSTER.scale})` }}>
                            <RunningFeatureCard data={cardioData} bgOpacity={cardStates.POSTER.opacity} forCapture={true} />
                         </div>
                    </div>
                </div>
                <div id="capture-PEAK" style={{ width: CARD_W, height: cardH, position: 'relative', overflow: 'hidden', background: 'transparent' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ transform: `translate(${cardStates.PEAK.x}px, ${cardStates.PEAK.y}px) scale(${cardStates.PEAK.scale})` }}>
                            <RunningApexCard data={cardioData} bgOpacity={cardStates.PEAK.opacity} forCapture={true} />
                        </div>
                    </div>
                </div>
                <div id="capture-REPORT" style={{ width: CARD_W, height: cardH, position: 'relative', overflow: 'hidden', background: 'transparent' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ transform: `translate(${cardStates.REPORT.x}px, ${cardStates.REPORT.y}px) scale(${cardStates.REPORT.scale})` }}>
                            <RunningPhysioCard data={cardioData} bgOpacity={cardStates.REPORT.opacity} forCapture={true} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RunningEvolutionCard;
