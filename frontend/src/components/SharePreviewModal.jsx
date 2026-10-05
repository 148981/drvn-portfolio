import React, { useState, useRef, useEffect } from 'react';
import { getDisplayName } from '../utils/socialIdentity';
import { pressProps } from '../utils/nutritionMotion';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, AtSign, Image, ChevronDown } from 'lucide-react';
// html2canvas loaded on-demand (bundle-dynamic-imports)
import { getUserId } from '../utils/auth';
import { addSocialPost } from '../utils/socialPostsStore';
import { toast } from '../utils/toast';
import { formatPace as fmtPace } from '../utils/format';


// Helper to project GPS coordinates to SVG path
const getSvgPathFromRoute = (route, width = 300, height = 160) => {
    if (!route || !Array.isArray(route) || route.length < 2) return '';
    const validPoints = route.filter(p =>
        p && typeof p.lat === 'number' && !isNaN(p.lat) &&
        p && typeof p.lng === 'number' && !isNaN(p.lng)
    );
    if (validPoints.length < 2) return '';
    const lats = validPoints.map(p => p.lat);
    const lngs = validPoints.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;
    const scaleX = width / lngRange;
    const scaleY = height / latRange;
    const scale = Math.min(scaleX, scaleY) * 0.75;
    if (!isFinite(scale)) return '';
    const offsetX = (width - lngRange * scale) / 2;
    const offsetY = (height - latRange * scale) / 2;
    return validPoints.map((p, i) => {
        const x = (p.lng - minLng) * scale + offsetX;
        const y = height - ((p.lat - minLat) * scale + offsetY);
        if (isNaN(x) || isNaN(y)) return '';
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
    }).filter(Boolean).join(' ');
};

// 🔴 零模擬數據：@mention 名單改用真實好友（utils/mentionDirectory），不再用假人

const SharePreviewModal = ({ cardioData, onClose, onShare }) => {
    const stats = cardioData?.stats || {};
    const dist = Number(stats.distance || 0);
    const duration = Number(stats.duration || 0);
    const pace = Number(stats.pace || stats.avgPace || 0);

    const [caption, setCaption] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const [customImage, setCustomImage] = useState(null);
    const [mentionQuery, setMentionQuery] = useState(null); // string or null
    const [mentions, setMentions] = useState([]); // confirmed @mentions
    const [accentColor, setAccentColor] = useState('#E53935'); // Default Strava red
    const fileInputRef = useRef(null);
    const captionRef = useRef(null);
    const cardRef = useRef(null);

    const ACCENT_COLORS = [
        { label: '🔴 Fire', value: '#E53935' },
        { label: '🔵 Ice', value: '#1565C0' },
        { label: '🟡 Yellow', value: '#FFD93D' },
        { label: '🍦 Cream', value: '#FAF5EE' },
        { label: '🟠 Orange', value: '#E67E51' },
        { label: '🌳 Sage', value: '#8FA87A' },
        { label: '✨ Gold', value: '#E6C288' },
        { label: '⚫ Night', value: '#212121' },
    ];

    const formatTime = (seconds) => {
        if (!seconds) return '00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const formatPace = fmtPace;   // 🩹 J: 單一真相源（全站統一 M'SS" 樣式）

    const svgPath = cardioData?.route ? getSvgPathFromRoute(cardioData.route, 340, 160) : '';

    const handleCaptionChange = (e) => {
        const val = e.target.value;
        setCaption(val);
        // Detect @mention
        const match = val.match(/@(\w*)$/);
        if (match) {
            setMentionQuery(match[1]);
        } else {
            setMentionQuery(null);
        }
    };

    const insertMention = (name) => {
        const newCaption = caption.replace(/@\w*$/, `@${name} `);
        setCaption(newCaption);
        setMentions(prev => prev.includes(name) ? prev : [...prev, name]);
        setMentionQuery(null);
        captionRef.current?.focus();
    };

    const [customImageBase64, setCustomImageBase64] = useState(null);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setCustomImage(URL.createObjectURL(file));
            
            // Compress image for localStorage immediately
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new window.Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 600;
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    // Compress to lightweight JPEG (~40kb) suitable for localStorage
                    setCustomImageBase64(canvas.toDataURL('image/jpeg', 0.6));
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    const renderCaption = (text) => {
        if (!text) return null;
        return text.split(/(@\w+)/g).map((part, i) =>
            part.startsWith('@')
                ? <span key={i} style={{ color: accentColor, fontWeight: 700 }}>{part}</span>
                : part
        );
    };

    const handleShare = async () => {
        setIsSharing(true);
        try {
            const userName = getDisplayName();
            const usrId = getUserId();

            // 1. Try screenshot (non-fatal if fails) — only used for API upload, NOT localStorage
            let imgData = null;
            try {
                if (cardRef.current) {
                    const { default: html2canvas } = await import('html2canvas');
                    const canvas = await html2canvas(cardRef.current, {
                        useCORS: true,
                        backgroundColor: '#161415',
                        scale: 2,
                    });
                    imgData = canvas.toDataURL('image/png');
                }
            } catch (imgErr) {
                console.warn('⚠️ Screenshot failed, sharing without image:', imgErr);
            }

            // 2. Build post for localStorage (NO base64 image — keeps it small & avoids quota)
            const newPost = {
                activity_id: `run_${Date.now()}`,
                user_id: usrId,
                user_name: userName,
                activity_type: 'run',
                created_at: new Date().toISOString(),
                caption: caption || `Just completed a ${dist.toFixed(2)}km run! 🏃‍♂️`,
                mentions,
                metrics: {
                    distance: dist,
                    pace,
                    duration,
                },
                drvnCard: {
                    layout: 'POSTER',
                    editorWidth: 390,
                    editorHeight: 520,
                    cardStates: {
                        POSTER: { x: 0, y: 0, scale: 1, opacity: 100 }
                    },
                    accentColor,
                    route: cardioData?.route || [],
                    stats: cardioData?.stats || {},
                    customImage: customImageBase64 || null, // Compressed thumbnail
                },
                kudos_count: 0,
                comments: 0,
                reactions: {},
                photo_url: null, // Base64 NOT stored — too large for localStorage
            };

            // 3. Save post（已用 userId 命名空間）
            try {
                const userId = getUserId();
                addSocialPost(newPost, userId);
                console.log('✅ Post saved to socialPostsStore');
            } catch (storageErr) {
                console.error('❌ socialPostsStore save failed:', storageErr);
                toast.error('儲存失敗，請稍後再試');
                setIsSharing(false);
                return;
            }

            // 4. Call parent handler (API sync + navigate)
            await onShare({
                caption: newPost.caption,
                cardioData,
                imageDataUrl: imgData, // Pass base64 to parent for API upload only
            });

        } catch (err) {
            console.error('Share error:', err);
            toast.error('分享失敗，請稍後再試');
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

    return ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 2147483647, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
            <style>{`
                @keyframes drvnRoute {
                    from { stroke-dashoffset: 600; }
                    to { stroke-dashoffset: 0; }
                }
                .drvn-route {
                    fill: none;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                    stroke-dasharray: 600;
                    animation: drvnRoute 2s ease forwards;
                }
                .drvn-mention-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    padding: 2px 8px;
                    border-radius: 18px;
                    font-size: 11px;
                    font-weight: 700;
                }
            `}</style>

            <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                style={{ width: '100%', maxWidth: 430, background: '#111', borderRadius: '28px 28px 0 0', maxHeight: '95dvh', overflowY: 'auto', boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}
            >
                {/* ── Header ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 12px' }}>
                    <div>
                        <p style={{ fontSize: 9, fontWeight: 800, color: accentColor, letterSpacing: '0.15em', textTransform: 'uppercase' }}>DRVN</p>
                        <h3 style={{ fontSize: 20, fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.5px' }}>分享訓練</h3>
                    </div>
                    <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <X size={18} color="white" />
                    </motion.button>
                </div>

                {/* ── DRVN STAT CARD (Strava style) ── */}
                <div ref={cardRef} style={{ margin: '0 16px 16px', borderRadius: 24, overflow: 'hidden', position: 'relative', background: '#161415', minHeight: 280 }}>
                    {/* Background Photo */}
                    {customImage && (
                        <img loading="lazy" decoding="async" src={customImage} alt="bg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }} />
                    )}
                    {/* Gradient Overlay */}
                    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${accentColor}22 0%, #000 100%)` }} />

                    {/* Content */}
                    <div style={{ position: 'relative', zIndex: 1, padding: '24px 20px 20px', textAlign: 'center' }}>
                        {/* Brand */}
                        <p style={{ fontSize: 13, fontWeight: 900, color: 'white', letterSpacing: '0.2em', marginBottom: 2, opacity: 0.6, textTransform: 'uppercase' }}>DRVN</p>

                        {/* Primary Metric: Distance */}
                        <p style={{ fontSize: 64, fontWeight: 900, color: 'white', lineHeight: 1, letterSpacing: '-3px', margin: '4px 0 0' }}>{dist.toFixed(2)}</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Kilometers</p>

                        {/* Secondary Metrics */}
                        <div style={{ display: 'flex', gap: 40, marginBottom: 16, justifyContent: 'center' }}>
                            <div>
                                <p style={{ fontSize: 22, fontWeight: 800, color: 'white', lineHeight: 1 }}>{formatPace(pace)} <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>/km</span></p>
                                <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pace</p>
                            </div>
                            <div>
                                <p style={{ fontSize: 22, fontWeight: 800, color: 'white', lineHeight: 1 }}>{formatTime(duration)}</p>
                                <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Moving Time</p>
                            </div>
                        </div>

                        {/* Route SVG */}
                        {svgPath ? (
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 18, padding: '12px 8px', marginBottom: 12 }}>
                                <svg viewBox="0 0 340 160" style={{ width: '100%', height: 'auto', maxHeight: 120, display: 'block' }}>
                                    <path d={svgPath} className="drvn-route" stroke={accentColor} strokeWidth="3" />
                                </svg>
                            </div>
                        ) : (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 18, height: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1px dashed rgba(255,255,255,0.15)`, marginBottom: 12 }}
                            >
                                <Image size={22} color="rgba(255,255,255,0.3)" style={{ marginBottom: 6 }} />
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>點擊上傳背景圖片</span>
                            </div>
                        )}

                        {/* Date + Activity type */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>🏃 Run</span>
                        </div>
                    </div>
                </div>

                {/* ── Caption + Mentions ── */}
                <div style={{ margin: '0 16px 12px', background: '#262523', borderRadius: 18, padding: '14px 16px', position: 'relative' }}>
                    {/* @mention prefix */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <AtSign size={16} color="rgba(255,255,255,0.3)" style={{ marginTop: 3, flexShrink: 0 }} />
                        <textarea
                            ref={captionRef}
                            value={caption}
                            onChange={handleCaptionChange}
                            placeholder="說點什麼…使用 @ 標記朋友"
                            rows={3}
                            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: 15, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, placeholder: 'rgba(255,255,255,0.3)' }}
                        />
                    </div>

                    {/* Mention Tags */}
                    {mentions.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            {mentions.map(m => (
                                <span key={m} className="drvn-mention-tag" style={{ background: `${accentColor}20`, color: accentColor }}>
                                    @{m}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Mention autocomplete */}
                    <AnimatePresence>
                        {filteredMentions.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 4 }}
                                style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: '#262523', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                            >
                                {filteredMentions.map(name => (
                                    <motion.button {...pressProps('row')} key={name} onClick={() => insertMention(name)}
 style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${accentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: accentColor }}>
                                            {name[0]}
                                        </div>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{name}</span>
                                    </motion.button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Controls ── */}
                <div style={{ margin: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Color Picker */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>主色</span>
                        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1 }}>
                            {ACCENT_COLORS.map(c => (
                                <button key={c.value} onClick={() => setAccentColor(c.value)}
                                    style={{ width: 28, height: 28, borderRadius: '50%', background: c.value, border: accentColor === c.value ? '3px solid white' : '3px solid transparent', flexShrink: 0, cursor: 'pointer', boxShadow: accentColor === c.value ? `0 0 12px ${c.value}` : 'none', transition: 'all 0.2s' }} />
                            ))}
                        </div>
                    </div>

                    {/* Upload Photo */}
                    <motion.button {...pressProps('row')} onClick={() => fileInputRef.current?.click()}
 style={{ width: '100%', padding: '10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Image size={16} /> {customImage ? '更換背景圖片' : '上傳背景圖片'}
                    </motion.button>
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
                </div>

                {/* ── Share Button ── */}
                <div style={{ margin: '4px 16px 32px' }}>
                    <motion.button {...pressProps('row')}
 onClick={handleShare}
 disabled={isSharing}
 style={{ width: '100%', padding: '16px', borderRadius: 18, background: accentColor, border: 'none', color: 'white', fontSize: 15, fontWeight: 900, letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isSharing ? 0.6 : 1, transition: 'opacity 0.2s' }}
 >
                        <Send size={18} />
                        {isSharing ? '發佈中...' : '分享到動態'}
                    </motion.button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

export default SharePreviewModal;
