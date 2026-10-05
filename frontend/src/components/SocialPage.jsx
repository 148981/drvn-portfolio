import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// 🎬 互動回饋預設 —— 與飲食系統共用同一份按壓手感（見 utils/nutritionMotion.jsx）
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import FriendActivityCard from './FriendActivityCard';
import { Search, UserPlus, Check, Copy, UserCircle, Ban, Trash2, Activity, Zap, Gift, QrCode, Flame, MessageCircle, MoreHorizontal, X, TrendingUp, Calendar, Info, ChevronDown, Heart, Crosshair, Users } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { getUserId } from '../utils/auth';
import { getDisplayName } from '../utils/socialIdentity';
import { uStorage } from '../utils/userStorage';
import BespokeAmbientGlow from './ui/BespokeAmbientGlow';
import { getSocialPosts } from '../utils/socialPostsStore';
// 🧩 「我的訓練紀錄」與最新動態同一份來源（抓取／正規化／去重／獎牌都在那裡）
import { loadMyActivities, toSocialFeedItem } from '../utils/activityFeedSource';
import apiClient from '../api/client';
import { resolveApiBase } from '../utils/apiHostFix';
import MobileNavigation from './MobileNavigation';
import StickerGallery from './StickerGallery';
import GrowthAchievementSystem, { GrowthAchievementProfileCard } from './GrowthAchievementSystem';
import UserProfileFormMobile from './UserProfileFormMobile';
import ProfilePreviewSheet from './ProfilePreviewSheet';
import { confirmDialog, toast } from '../utils/toast';
import RewardUnlockAnimation from './RewardUnlockAnimation';
import { recordCollabCompletion, syncUnlockedStickers } from '../utils/stickerUnlock';
import { recordFirst } from '../utils/momentEngine';
// 🤝 一起練：收邀請／接受／拒絕／雙方進度（單一資料層見 utils/trainTogether.js）
import { useTrainTogether } from './SocialFeed/useTrainTogether';
import { InviteCard, ActiveCard, BondRow } from './SocialFeed/TrainTogetherCards';
// 🚩 App Store 1.2：好友動態、留言也要能檢舉／封鎖，封鎖的人不出現
import ModerationMenu from './SocialFeed/ModerationMenu';
import { isBlockedUser, isHiddenContent, useModerationVersion } from '../utils/moderation';
// 🔴 即時一起練：同一個當下，看得到對方現在到哪
import { useLiveSession } from './SocialFeed/useLiveSession';
import { LiveInviteBanner, LivePanel } from './SocialFeed/LiveTogether';

/* ⚠️ 原本寫死 `http://${hostname}:8000` —— 打包版靠 utils/apiHostFix 攔截 fetch 才沒出事，
   但 <img src> 不經過 fetch，所以 https 網頁版的後端頭像會直接被當成 mixed content 擋掉。
   改用專案自己的 resolveApiBase()：打包版回正式後端、開發時維持本機 :8000。 */
const API_BASE_URL = resolveApiBase();

/* ── helper：把 backend 來的相對 /static/... 補成完整 URL，避免 <img loading="lazy" decoding="async"> 抓不到頭像
   讓 DRVN IDENTITY、Leaderboard、Roster、Search 等位置全部從 fallback 字母
   切換到使用者真正的 profile 頭像。 ──────────────────────────────────────── */
const resolveAvatarUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;      // 已上傳照片 / 完整網址
    if (trimmed.startsWith('/')) {
        // ⚠️ 前端 public 資產（DRVN 預設頭貼 /desktop/、/avatars/、/onboarding/）由前端伺服，
        //    不可加後端 :8000 前綴（會 404 變成 ? 破圖）；只有後端的 /static/ 才加前綴。
        return trimmed.startsWith('/static/') ? `${API_BASE_URL}${trimmed}` : trimmed;
    }
    // emoji 或非圖片字串 → 不是圖片 URL，回 null 讓呼叫端改顯示縮寫，避免破圖
    if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(trimmed)) return null;
    return `${API_BASE_URL}/static/${trimmed}`;                       // 後端裸檔名
};

const parseName = (rawName, fallbackDisc) => {
    if (!rawName) return { name: 'User', disc: '0000' };
    if (rawName.includes('#')) {
        const parts = rawName.split('#');
        return { name: parts[0], disc: parts[1] };
    }
    return { name: rawName, disc: fallbackDisc || '0000' };
};

// ─── 💖 INTIMACY TITLE HELPER ──────────────────────────────────────────
// getIntimacyTitle 已移除 —— 它回傳 MUSE / TWIN / ECHO 這種看不懂的英文代號，
// 而且吃的是前端記憶體裡那個永遠歸零的 intimacy。
// 親密度的說法統一走 utils/trainTogether.js 的 bondLevel（中文、且吃後端真值）。

// ─── 🏃 ACTIVITY STATUS HELPER ─────────────────────────────────────────
const getActivityStatus = (friend) => {
    if (friend.is_running) return { label: '跑步中', color: '#F95C4B', type: 'run' };
    if (friend.is_lifting || friend.is_workout) return { label: '重訓中', color: '#161415', type: 'lift' };
    if (friend.current_activity === 'run') return { label: '跑步中', color: '#F95C4B', type: 'run' };
    if (friend.current_activity === 'lift' || friend.current_activity === 'strength') return { label: '重訓中', color: '#161415', type: 'lift' };
    return null;
};

const noiseTexture = 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")';
const dotGrid = 'radial-gradient(rgba(22,20,21,0.08) 1px, transparent 1px)';

const Toast = ({ message }) => (
    <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.9 }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100100] bg-[#161415] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3"
    >
        <Info size={16} className="text-[#F95C4B]" />
        <span className="text-[12px] font-black uppercase tracking-widest">{message}</span>
    </motion.div>
);

// ─── ⏱️ LONG PRESS HOOK (continuous fire while held) ──────────────────
// Captures the card's center coordinates at press-start so interval callbacks
// always have a valid position (getBoundingClientRect on a stale ref returns 0,0).
const useLongPress = (onLongPress, ms = 500) => {
    const initTimerRef = useRef(null);
    const intervalRef = useRef(null);
    const posRef = useRef({ x: 0, y: 0 });

    const fire = useCallback(() => {
        onLongPress(posRef.current.x, posRef.current.y);
    }, [onLongPress]);

    const start = useCallback((e) => {
        // Capture coordinates immediately while the element is fully in the DOM
        const el = e.currentTarget;
        if (el) {
            const rect = el.getBoundingClientRect();
            posRef.current = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
        }
        initTimerRef.current = setTimeout(() => {
            fire();
            intervalRef.current = setInterval(fire, 350);
        }, ms);
    }, [fire, ms]);

    const stop = useCallback(() => {
        if (initTimerRef.current) clearTimeout(initTimerRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
        initTimerRef.current = null;
        intervalRef.current = null;
    }, []);

    return {
        onTouchStart: start,
        onTouchEnd: stop,
        onTouchMove: stop,
        onMouseDown: start,
        onMouseUp: stop,
        onMouseLeave: stop,
    };
};

// ─── 💥 EMOJI EXPLOSION COMPONENT ─────────────────────────────────────
const EMOJIS = ['🔥', '💪', '⚡', '🏃', '❤️', '🎯', '🏆', '✨', '💯', '🚀'];

const EmojiExplosion = ({ x, y, id, onDone }) => {
    const count = 8;
    const particles = useRef(Array.from({ length: count }, (_, i) => ({
        id: i,
        emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
        angle: (360 / count) * i + Math.random() * 30 - 15,
        distance: 50 + Math.random() * 55,
        duration: 0.55 + Math.random() * 0.35,
        size: 16 + Math.random() * 14,
    }))).current;

    useEffect(() => {
        const t = setTimeout(() => onDone(id), 900);
        return () => clearTimeout(t);
    }, [id, onDone]);

    return createPortal(
        <div className="fixed pointer-events-none z-[200000]" style={{ left: x, top: y }}>
            {particles.map(p => {
                const rad = (p.angle * Math.PI) / 180;
                const tx = Math.cos(rad) * p.distance;
                const ty = Math.sin(rad) * p.distance;
                return (
                    <motion.div
                        key={p.id}
                        initial={{ opacity: 1, x: 0, y: 0, scale: 0.5 }}
                        animate={{ opacity: 0, x: tx, y: ty, scale: 1.2 }}
                        transition={{ duration: p.duration, ease: 'easeOut' }}
                        style={{ position: 'absolute', fontSize: p.size, userSelect: 'none' }}
                    >
                        {p.emoji}
                    </motion.div>
                );
            })}
        </div>,
        document.body
    );
};

// ─── 🛡️ PROFILE PEEKER — renders the real UserProfileFormMobile in guest mode ──
const ProfilePeeker = ({ userId: targetUserId, friendData, onClose }) => {
    const guestProfile = friendData ? {
        name: friendData.name,
        discriminator: friendData.discriminator,
        bio: friendData.bio || '',
        tag: friendData.tag || 'DRVN ATHLETE',
        city: friendData.city || '台北市',
        avatar: friendData.avatar || null,
        coverPhoto: friendData.coverPhoto || null,
        bond_score: friendData.bond_score || 0,
    } : null;

    return createPortal(
        <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="fixed inset-0 z-[100010]"
            style={{ maxWidth: 430, left: 0, right: 0, margin: '0 auto' }}
        >
            <UserProfileFormMobile
                guestUserId={targetUserId}
                guestProfile={guestProfile}
                onGuestClose={onClose}
            />
        </motion.div>,
        document.body
    );
};

// ─── ⚡ CHALLENGE SHEET COMPONENT ──────────────────────────────────────
// Modes: CHALLENGE (presets) | COLLAB (presets) | CUSTOM (form + mode toggle)
const ChallengeSheet = ({ targetUser, onClose, onSend }) => {
    const [mode, setMode] = useState('collaborate');
    const [selectedChallenge, setSelectedChallenge] = useState('run_10k');
    const [selectedCollab, setSelectedCollab] = useState('collab_run');
    // In CUSTOM tab, user picks whether it's a challenge or collab
    const [customMode, setCustomMode] = useState('challenge'); // 'challenge' | 'collaborate'

    // Custom / Challenge / Collaborate shared fields
    const [customTitle, setCustomTitle] = useState('');
    const [customCategory, setCustomCategory] = useState('Run'); // 'Run' | 'Lift'
    const [customMetric, setCustomMetric] = useState('Distance');
    const [customValue, setCustomValue] = useState(5);

    useEffect(() => {
        if (customCategory === 'Run') {
            setCustomMetric('Distance');
            setCustomValue(5);
        } else {
            setCustomMetric('Volume');
            setCustomValue(5000);
        }
    }, [customCategory]);

    // Run metrics: Pace is REMOVED per requirements
    const runMetrics = [
        { id: 'Distance', label: 'DIST.', unit: 'KM', step: 1 },
        { id: 'Duration', label: '時間', unit: 'MIN', step: 5 },
        { id: 'Calories', label: '燃燒', unit: 'KCAL', step: 50 },
    ];

    const liftMetrics = [
        { id: 'Volume', label: 'VOL.', unit: 'KG', step: 100 },
        { id: 'Sets', label: '組數', unit: '組', step: 1 },
        { id: 'Reps', label: '次數', unit: '次', step: 5 },
    ];

    const activeMetrics = customCategory === 'Run' ? runMetrics : liftMetrics;
    const currentMetricObj = activeMetrics.find(m => m.id === customMetric) || activeMetrics[0];
    const currentUnit = currentMetricObj?.unit || '';
    const currentStep = currentMetricObj?.step || 1;

    const handleDecrement = () => setCustomValue(prev => Math.max(0, Number((prev - currentStep).toFixed(1))));
    const handleIncrement = () => setCustomValue(prev => Number((prev + currentStep).toFixed(1)));

    const calculateBond = (cat, metric, val) => {
        if (!val || val <= 0) return 0;
        let pts = 10;
        if (cat === 'Run') {
            if (metric === 'Distance') pts = Math.floor(val * 5);
            if (metric === 'Duration') pts = Math.floor(val * 1);
            if (metric === 'Calories') pts = Math.floor(val / 10);
        } else {
            if (metric === 'Volume') pts = Math.floor(val / 100);
            if (metric === 'Sets') pts = Math.floor(val * 1.5);
            if (metric === 'Reps') pts = Math.floor(val / 5);
        }
        // Collaborate mode gives bonus bond points
        const bonus = mode === 'collaborate' ? 1.5 : 1;
        return Math.round(Math.min(Math.max(pts, 5), 200) * bonus);
    };

    // ── Pre-designed CHALLENGE presets (head-to-head, fastest wins) ──
    const CHALLENGE_PRESETS = [
        { id: 'run_10k', type: 'Run', icon: <Flame size={18}/>, title: '10KM SPRINT', desc: 'Fastest to accumulate 10KM running.', metric: '10', unit: 'KM', bond: 50 },
        { id: 'run_60', type: 'Run', icon: <Activity size={18}/>, title: '60-MIN GRIND', desc: 'Fastest to complete 60 minutes of running.', metric: '60', unit: 'MIN', bond: 40 },
        { id: 'lift_5t', type: 'Lift', icon: <Dumbbell size={18}/>, title: '5-TON CLUB', desc: 'Fastest to reach 5,000 KG total volume.', metric: '5,000', unit: 'KG', bond: 50 },
        { id: 'lift_100s', type: 'Lift', icon: <Zap size={18}/>, title: '100 SETS BLITZ', desc: 'Fastest to complete 100 sets of any lift.', metric: '100', unit: 'SETS', bond: 45 },
    ];

    // ── Pre-designed COLLAB presets (both must reach target together) ──
    const COLLAB_PRESETS = [
        { id: 'collab_run', type: 'Run', icon: <Users size={18}/>, title: 'TWIN RUNNERS', desc: 'Together reach a combined 20KM.', metric: '20', unit: 'KM', bond: 80 },
        { id: 'collab_half', type: 'Run', icon: <Activity size={18}/>, title: 'HALF MARATHON PACT', desc: 'Together log a combined 21.1KM.', metric: '21.1', unit: 'KM', bond: 100 },
        { id: 'collab_lift', type: 'Lift', icon: <Dumbbell size={18}/>, title: '10-TON DUO', desc: 'Together lift a combined 10,000 KG.', metric: '10,000', unit: 'KG', bond: 90 },
        { id: 'collab_burn', type: 'Run', icon: <Flame size={18}/>, title: 'BURN TOGETHER', desc: 'Together burn a combined 1,000 KCAL.', metric: '1,000', unit: 'KCAL', bond: 70 },
    ];

    const parsedName = parseName(targetUser?.name, targetUser?.discriminator);

    // In Custom tab, prefix only applies when customMode === 'challenge'
    const buildGoalPrefix = () => {
        if (customMode === 'challenge') return 'Fastest to ';
        if (customMode === 'collaborate') return 'Together reach ';
        return '';
    };

    const handleSend = () => {
        let payload;
        if (mode === 'live') {
            // 現在一起：不是寄一張邀請，是直接開一間房並邀對方進來
            payload = {
                mode: 'live',
                type: customCategory,
                goal: customValue > 0 ? customValue : null,
                unit: currentUnit,
                title: customTitle.trim(),
            };
        } else if (mode === 'challenge') {
            const ch = CHALLENGE_PRESETS.find(c => c.id === selectedChallenge);
            payload = { ...ch, mode: 'challenge', bond: ch.bond };
        } else if (mode === 'collaborate') {
            const co = COLLAB_PRESETS.find(c => c.id === selectedCollab);
            payload = { ...co, mode: 'collaborate', bond: co.bond };
        } else {
            // Custom tab
            const titleStr = customTitle.trim() || `${customMode.toUpperCase()} — ${customMetric.toUpperCase()}`;
            payload = {
                id: 'custom', type: customCategory, mode: customMode,
                title: titleStr,
                desc: `${buildGoalPrefix()}${customValue} ${currentUnit}`,
                metric: customValue, unit: currentUnit,
                bond: calculateBond(customCategory, customMetric, customValue),
            };
        }
        onSend(payload);
    };

    // 3 tabs only: Challenge presets | Collab presets | Custom (with mode toggle inside)
    /* 三種一起練，差別是「什麼時候」：
       現在一起 → 此刻兩人同時在練，看得到對方即時進度（api_live_session）
       一起練   → 各自找時間，都達標才算完成（collaborate）
       對決     → 同一個目標比誰先到（challenge） */
    const MODES = [
        { id: 'live', label: '現在一起' },
        { id: 'collaborate', label: '一起練' },
        { id: 'challenge', label: '對決' },
        { id: 'custom', label: '自訂' },
    ];

    const renderSharedForm = () => (
        <div className="space-y-8 pb-8">
            {/* Custom mode toggle */}
            <div className="flex bg-[#161415]/5 rounded-[18px] p-1">
                <motion.button {...pressProps('cta')} onClick={() => setCustomMode('challenge')} className={`flex-1 py-3 text-[12px] font-black tracking-widest rounded-xl ${customMode === 'challenge' ? 'bg-[#161415] text-white shadow' : 'text-[#161415]/40'}`}>
                    對決
                </motion.button>
                <motion.button {...pressProps('cta')} onClick={() => setCustomMode('collaborate')} className={`flex-1 py-3 text-[12px] font-black tracking-widest rounded-xl ${customMode === 'collaborate' ? 'bg-[#161415] text-white shadow' : 'text-[#161415]/40'}`}>
                    一起練
                </motion.button>
            </div>

            {/* Goal prefix badge */}
            <div className={`px-4 py-3 rounded-[18px] border flex items-center gap-3 ${customMode === 'collaborate' ? 'bg-[#161415]/5 border-[#161415]/20' : 'bg-[#F95C4B]/5 border-[#F95C4B]/20'}`}>
                {customMode === 'collaborate' ? <Users size={16} className="text-[#161415]/60" /> : <Zap size={16} className="text-[#F95C4B]" />}
                <span className={`text-[12px] font-black tracking-widest ${customMode === 'collaborate' ? 'text-[#161415]/60' : 'text-[#F95C4B]'}`}>
                    {customMode === 'challenge' ? '誰先到達目標就贏' : '兩個人都到達才算完成'}
                </span>
            </div>

            {/* Operation Name */}
            <div>
                <label className="text-[12px] font-black text-[#161415]/45 mb-3 block">這次叫什麼</label>
                <input
                    type="text" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="例如：週日長跑"
                    className="w-full bg-transparent border-b border-[#161415]/20 focus:border-[#F95C4B] py-2 text-[18px] font-normal outline-none text-[#161415] placeholder:text-[#161415]/20 transition-colors"
                    style={{ fontFamily: "'Tenor Sans', sans-serif" }}
                />
            </div>

            {/* Discipline */}
            <div>
                <label className="text-[12px] font-black text-[#161415]/45 mb-3 block">練什麼</label>
                <div className="flex gap-4">
                    <motion.button {...pressProps('cta')} onClick={() => setCustomCategory('Run')} className={`flex-1 py-4 flex flex-col items-center gap-2 rounded-[18px] ${customCategory === 'Run' ? 'bg-[#161415] text-white shadow-lg' : 'bg-[#161415]/5 text-[#161415]/50'}`}>
                        <Activity size={20} /> <span className="text-[13px] font-black tracking-widest">跑步</span>
                    </motion.button>
                    <motion.button {...pressProps('cta')} onClick={() => setCustomCategory('Lift')} className={`flex-1 py-4 flex flex-col items-center gap-2 rounded-[18px] ${customCategory === 'Lift' ? 'bg-[#161415] text-white shadow-lg' : 'bg-[#161415]/5 text-[#161415]/50'}`}>
                        <Dumbbell size={20} /> <span className="text-[13px] font-black tracking-widest">重訓</span>
                    </motion.button>
                </div>
            </div>

            {/* Metric Target */}
            <div>
                <label className="text-[12px] font-black tracking-[0.2em] text-[#161415]/40 mb-3 block">
                    {mode === 'collaborate' ? '共同目標' : '目標'}
                </label>
                <div className="flex flex-wrap gap-2 mb-6">
                    {activeMetrics.map(m => (
                        <motion.button {...pressProps('icon')} key={m.id} onClick={() => { setCustomMetric(m.id); }}
 className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-full ${customMetric === m.id ? 'bg-[#F95C4B] text-white' : 'bg-transparent border border-[#161415]/10 text-[#161415]/50'}`}
 >
                            {m.label}
                        </motion.button>
                    ))}
                </div>

                {/* Value input */}
                <div className="flex flex-col items-center justify-center py-6 bg-white rounded-3xl border border-[#161415]/5 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#161415]/30 mb-3">
                        {buildGoalPrefix()}{customValue} {currentUnit}
                    </p>
                    <div className="flex items-center gap-6">
                        <motion.button {...pressProps('icon')} onClick={handleDecrement} className="w-10 h-10 rounded-full bg-[#161415]/5 flex items-center justify-center text-[#161415]/50 hover:bg-[#161415]/10">-</motion.button>
                        <div className="flex items-baseline gap-2 min-w-[120px] justify-center">
                            <input
                                type="number" value={customValue} onChange={(e) => setCustomValue(Number(e.target.value))}
                                className="w-full max-w-[100px] bg-transparent text-[48px] font-black italic tracking-tighter text-center outline-none text-[#161415] border-b-2 border-transparent focus:border-[#F95C4B] transition-colors p-0 m-0"
                            />
                        </div>
                        <motion.button {...pressProps('icon')} onClick={handleIncrement} className="w-10 h-10 rounded-full bg-[#161415]/5 flex items-center justify-center text-[#161415]/50 hover:bg-[#161415]/10">+</motion.button>
                    </div>
                    <span className="text-[12px] font-black text-[#F95C4B] uppercase tracking-widest mt-2">{currentUnit}</span>
                </div>
            </div>

            {/* Bond Reward */}
            <div className="flex justify-between items-center bg-[#F95C4B]/5 px-5 py-4 rounded-[18px] border border-[#F95C4B]/10">
                <span className="text-[12px] font-black tracking-[0.2em] text-[#F95C4B]">親密度{mode === 'collaborate' ? '（一起練 ×1.5）' : ''}</span>
                <div className="flex items-center gap-1.5 text-[16px] font-black uppercase tracking-widest text-[#F95C4B]">
                    <Heart size={16} fill="#F95C4B" className="animate-pulse" /> +{calculateBond(customCategory, customMetric, customValue)}
                </div>
            </div>
        </div>
    );

    return createPortal(
        <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100005] bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[100006] max-w-[440px] mx-auto bg-[#F6F4F1] flex flex-col h-[88dvh] rounded-t-[28px] overflow-hidden"
            >
                {/* Header */}
                <div className="px-8 pt-8 pb-4 flex justify-between items-start flex-shrink-0">
                    <div>
                        <h3 className="text-[32px] font-normal leading-none text-[#161415]" style={{ fontFamily: "'Tenor Sans', sans-serif" }}>找 {parsedName.name}</h3>
                    </div>
                    <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} className="w-10 h-10 flex items-center justify-center text-[#161415]/40 hover:text-[#161415]"><X size={24} strokeWidth={1.5}/></motion.button>
                </div>

                {/* Mode tabs */}
                <div className="px-8 flex gap-4 border-b border-[#161415]/10 overflow-x-auto no-scrollbar flex-shrink-0">
                    {MODES.map(m => (
                        <motion.button {...pressProps('row')} key={m.id} onClick={() => setMode(m.id)}
 className={`pb-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap relative flex-shrink-0 ${mode === m.id ? 'text-[#161415]' : 'text-[#161415]/30'}`}>
                            {m.label}
                            {mode === m.id && <motion.div layoutId="duelTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#161415]" />}
                        </motion.button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-8 space-y-6 overflow-y-auto no-scrollbar flex-1">
                    {mode === 'live' ? (
                        /* 現在一起：欄位越少越好 —— 人已經準備要動了，
                           不該在這裡填一堆表單。練什麼、目標多少，兩個決定而已。 */
                        <div className="space-y-7 pb-4">
                            <p className="text-[15px] font-bold text-[#161415]/70 leading-relaxed">
                                開一間房，{parsedName.name} 進來之後<br />你們會看到彼此的即時進度。
                            </p>

                            <div>
                                <label className="text-[12px] font-black text-[#161415]/45 mb-3 block">練什麼</label>
                                <div className="flex gap-4">
                                    <motion.button {...pressProps('cta')} type="button" onClick={() => setCustomCategory('Run')}
                                        className={`flex-1 py-4 flex flex-col items-center gap-2 rounded-[18px] ${customCategory === 'Run' ? 'bg-[#161415] text-white shadow-lg' : 'bg-[#161415]/5 text-[#161415]/50'}`}>
                                        <Activity size={20} /> <span className="text-[13px] font-black tracking-widest">跑步</span>
                                    </motion.button>
                                    <motion.button {...pressProps('cta')} type="button" onClick={() => setCustomCategory('Lift')}
                                        className={`flex-1 py-4 flex flex-col items-center gap-2 rounded-[18px] ${customCategory === 'Lift' ? 'bg-[#161415] text-white shadow-lg' : 'bg-[#161415]/5 text-[#161415]/50'}`}>
                                        <Dumbbell size={20} /> <span className="text-[13px] font-black tracking-widest">重訓</span>
                                    </motion.button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[12px] font-black tracking-[0.2em] text-[#161415]/40 mb-3 block">
                                    目標（可以不設）
                                </label>
                                <div className="flex items-center justify-center gap-6 py-5 bg-white rounded-3xl border border-[#161415]/5">
                                    <motion.button {...pressProps('icon')} type="button" onClick={handleDecrement} aria-label="減少目標"
                                        className="w-10 h-10 rounded-full bg-[#161415]/5 flex items-center justify-center text-[#161415]/50">−</motion.button>
                                    <span className="tabular-nums text-[40px] font-black tracking-tighter text-[#161415] min-w-[90px] text-center">
                                        {customValue}
                                    </span>
                                    <motion.button {...pressProps('icon')} type="button" onClick={handleIncrement} aria-label="增加目標"
                                        className="w-10 h-10 rounded-full bg-[#161415]/5 flex items-center justify-center text-[#161415]/50">+</motion.button>
                                </div>
                                <p className="text-[13px] font-black text-[#F95C4B] tracking-widest text-center mt-2">{currentUnit}</p>
                            </div>
                        </div>
                    ) : mode === 'challenge' ? (
                        CHALLENGE_PRESETS.map(c => (
                            <div key={c.id} onClick={() => setSelectedChallenge(c.id)}
                                className={`group relative p-6 transition-all cursor-pointer border-b ${selectedChallenge === c.id ? 'border-[#161415]' : 'border-[#161415]/10 hover:border-[#161415]/30'}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full transition-colors ${selectedChallenge === c.id ? 'bg-[#161415] text-white' : 'bg-[#161415]/5 text-[#161415]'}`}>{c.icon}</div>
                                        <div>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-[#161415]/40 block mb-0.5">{c.type}</span>
                                            <h4 className="text-[16px] font-black uppercase tracking-widest text-[#161415] leading-none">{c.title}</h4>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <span className={`text-[28px] font-black italic tracking-tighter leading-none ${selectedChallenge === c.id ? 'text-[#F95C4B]' : 'text-[#161415]'}`}>{c.metric}</span>
                                        <span className="text-[9px] font-black text-[#161415]/40 uppercase tracking-widest">{c.unit}</span>
                                    </div>
                                </div>
                                <p className="text-[12px] font-medium text-[#161415]/50 mt-3 pr-10">{c.desc}</p>
                                <div className="mt-4 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#F95C4B]">
                                    <Heart size={12} fill="#F95C4B" /> +{c.bond} BOND
                                </div>
                            </div>
                        ))
                    ) : mode === 'collaborate' ? (
                        COLLAB_PRESETS.map(c => (
                            <div key={c.id} onClick={() => setSelectedCollab(c.id)}
                                className={`group relative p-6 transition-all cursor-pointer border-b ${selectedCollab === c.id ? 'border-[#161415]' : 'border-[#161415]/10 hover:border-[#161415]/30'}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full transition-colors ${selectedCollab === c.id ? 'bg-[#161415] text-white' : 'bg-[#161415]/5 text-[#161415]'}`}>{c.icon}</div>
                                        <div>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-[#161415]/40 block mb-0.5">{c.type}</span>
                                            <h4 className="text-[16px] font-black uppercase tracking-widest text-[#161415] leading-none">{c.title}</h4>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <span className={`text-[28px] font-black italic tracking-tighter leading-none ${selectedCollab === c.id ? 'text-[#161415]' : 'text-[#161415]'}`}>{c.metric}</span>
                                        <span className="text-[9px] font-black text-[#161415]/40 uppercase tracking-widest">{c.unit}</span>
                                    </div>
                                </div>
                                <p className="text-[12px] font-medium text-[#161415]/50 mt-3 pr-10">{c.desc}</p>
                                <div className="mt-4 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#161415]/60">
                                    <Heart size={12} fill="currentColor" /> +{c.bond} BOND
                                </div>
                            </div>
                        ))
                    ) : (
                        renderSharedForm()
                    )}
                </div>

                <div className="px-8 pb-8 pt-2 bg-gradient-to-t from-[#F6F4F1] via-[#F6F4F1] to-transparent flex-shrink-0">
                    <motion.button {...pressProps('pill')} onClick={handleSend} className="w-full py-5 text-white rounded-full flex items-center justify-center gap-2 text-[12px] font-black uppercase tracking-widest shadow-xl bg-[#161415]">
                        {(mode === 'collaborate' || (mode === 'custom' && customMode === 'collaborate')) ? <Users size={16} /> : <Zap size={16} fill="currentColor" />}
                        {mode === 'live' ? '現在就開始' : (mode === 'collaborate' || (mode === 'custom' && customMode === 'collaborate')) ? '送出邀請' : '送出對決'}
                    </motion.button>
                </div>
            </motion.div>
        </>,
        document.body
    );
};

// ─── 🤝 如何協作說明（收合式，預設收起）────────────────────────────────
const CollabHowTo = () => {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-8 bg-[#161415]/5 border border-[#161415]/10 rounded-[18px] overflow-hidden">
            <motion.button {...pressProps('cta')} onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between p-5 bg-transparent border-0 cursor-pointer">
                <p className="text-[12px] font-black tracking-widest text-[#161415]/45 m-0">一起練怎麼運作</p>
                <span className="text-[12px] font-black text-[#161415]/40" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
            </motion.button>
            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                        <div className="space-y-2.5 px-5 pb-5">
                            {[
                                { n: '1', t: '到「好友」分頁點夥伴的 ⚡，選「一起練」。' },
                                { n: '2', t: '你和夥伴各自在 2 小時內完成跑步或重訓。' },
                                { n: '3', t: '兩個人都達標就算一起完成，親密度也會往上。' },
                            ].map(s => (
                                <div key={s.n} className="flex items-start gap-2.5">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-[#161415] text-white text-[11px] font-black flex items-center justify-center mt-0.5">{s.n}</span>
                                    <p className="text-[12px] text-[#161415]/65 leading-relaxed">{s.t}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── 📰 FRIENDS FEED (JOURNAL) COMPONENT ─────────────────────────────
const FriendsFeedView = ({ onPeekProfile, onFindFriends, onInvite }) => {
    const userId = getUserId();
    const navigate = useNavigate();
    useModerationVersion();   // 封鎖／檢舉一變就重畫
    const [feed, setFeed] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    // 💬 留言（掛在該筆 session/activity id 上，後端 /api/activities/{id}/comments）
    const [openCommentsId, setOpenCommentsId] = useState(null);
    const [commentsMap, setCommentsMap] = useState({}); // { [id]: [{user_name, content}] }
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);

    const toggleComments = async (id) => {
        const next = openCommentsId === id ? null : id;
        setOpenCommentsId(next);
        setDraft('');
        if (next && commentsMap[id] === undefined) {
            try {
                const r = await apiClient.get(`/api/activities/${id}/comments`);
                setCommentsMap((p) => ({ ...p, [id]: r.data?.comments || [] }));
            } catch (_) { setCommentsMap((p) => ({ ...p, [id]: [] })); }
        }
    };
    const sendComment = async (id) => {
        const text = draft.trim().slice(0, 500);   // 後端上限 500 字
        if (!text || sending) return;
        setSending(true);
        try {
            const fd = new FormData();
            fd.append('user_id', userId);
            fd.append('user_name', getDisplayName(userId));
            fd.append('content', text);
            const r = await apiClient.post(`/api/activities/${id}/comments`, fd);
            setCommentsMap((p) => ({ ...p, [id]: [...(p[id] || []), r?.data || { user_name: getDisplayName(userId), content: text }] }));
            setDraft('');
        } catch (_) { toast.error('留言送出失敗'); }
        setSending(false);
    };

    // 🏃🏋️ 點卡 → 該次紀錄的結算頁。
    //   原本只有跑步能點，重訓卡點下去沒反應（同一條時間軸兩種行為 = 使用者以為壞了）。
    const openSession = (item) => {
        const sid = String(item.id || '');
        if (!sid || sid.startsWith('local_') || sid.startsWith('api_') || sid.startsWith('post_')) return;
        const isStrength = item.type === 'strength' || item.type === 'fitness';
        if (isStrength) {
            // 只有自己的紀錄才有完整 raw 可以還原結算頁
            const raw = item.source?.raw;
            if (!raw) return;
            navigate('/strength-session-mobile', { state: { from: '/social', record: raw } });
            return;
        }
        const isRun = item.type === 'run' || item.type === 'running';
        if (!isRun) return;
        navigate(`/running-analysis-mobile/${sid}`, { state: { from: '/social', ownerId: item.uId } });
    };

    useEffect(() => {
        const loadFeed = async () => {
            let allActivities = [];

            // 1. Pull own activities（已用 userId 命名空間隔離）
            try {
                const localPosts = getSocialPosts(userId);
                const myPosts = localPosts.slice(0, 20).map(p => ({
                    id: p.activity_id || p.id || `local_${Math.random()}`,
                    uId: p.user_id || p.uId || userId,
                    userName: p.userName || p.user_name || 'User',
                    discriminator: p.discriminator || '0000',
                    init: (p.userName || p.user_name || 'U').charAt(0).toUpperCase(),
                    createdAt: p.createdAt || p.created_at || new Date().toISOString(),
                    type: p.activity_type || p.type || 'run',
                    caption: p.caption || '',
                    stats: p.stats || {},
                    // 🎯 貼文也要進「動態」：這一頁的定義是
                    //    「好友的運動紀錄 ＋ 好友的最新貼文」，只有運動卡是不完整的。
                    photo: p.images?.[0] || p.photo || p.routeImg || null,
                    visibility: p.visibility || 'public',
                    kudos: p.kudos || 0,
                    myKudo: p.myKudo || false,
                    isPK: p.isPK || false,
                }));
                allActivities.push(...myPosts);
            } catch (e) {}

            // 1b. 好友的最新貼文（照片／文字），與運動紀錄併在同一條時間軸
            try {
                const res = await apiClient.get(`/api/activities/feed/${userId}`, { params: { limit: 30 } });
                {
                    const data = res.data || {};
                    const items = (data.activities || data.feed || []).map(a => ({
                        id: a.activity_id || a.id || `post_${Math.random()}`,
                        uId: a.user_id || 'unknown',
                        userName: a.user_name || a.userName || 'Athlete',
                        discriminator: a.discriminator || '0000',
                        avatar: a.avatar || null,
                        init: (a.user_name || a.userName || 'A').charAt(0).toUpperCase(),
                        createdAt: a.created_at || a.createdAt || new Date().toISOString(),
                        type: a.activity_type || 'post',
                        caption: a.caption || '',
                        stats: a.stats || {},
                        photo: a.photo_url || a.photo || null,
                        visibility: a.privacy || a.visibility || 'public',
                        kudos: a.kudos_count || 0,
                        myKudo: false,
                    }));
                    const existingIds = new Set(allActivities.map(a => a.id));
                    items.forEach(it => { if (!existingIds.has(it.id)) allActivities.push(it); });
                }
            } catch (e) { /* 後端沒這支就靜默降級，只顯示運動紀錄 */ }

            /* 2. 我自己的訓練紀錄 —— 與「最新動態」同一份來源。
               ⚠️ 這裡原本打 /api/history/logs（欄位名和動態頁完全不同、
                  也沒有獎牌），於是動態頁有 14 筆、社群卻顯示「還沒有動態」。
                  改吃 utils/activityFeedSource 之後，兩頁必然一致（鐵律 4）。 */
            try {
                const myName = getDisplayName(userId, '我');
                const { sessions } = await loadMyActivities(userId, { limit: 60 });
                const mine = sessions
                    .slice(0, 30)
                    .map((sess) => {
                        const it = toSocialFeedItem(sess, { userId, userName: myName });
                        // FriendActivityCard 讀 prCount / route
                        it.pr_count = Number(sess.pr_count) || 0;
                        it.route = sess.route || [];
                        return it;
                    });
                const existingIds = new Set(allActivities.map(a => a.id));
                mine.forEach(it => { if (!existingIds.has(it.id)) allActivities.push(it); });
            } catch (e) { /* 抓不到就只顯示貼文與好友動態，不擋整頁 */ }

            // 3. Try friends feed API
            try {
                /* ⚠️ 這行原本是 fetch(`http://${hostname}:8000/...`) —— 把後端位址寫死在元件裡。
                   打包版靠 utils/apiHostFix 攔截 window.fetch 才沒出事，
                   但只要是 https 網頁版就會變成 mixed content 被瀏覽器擋掉。
                   改走 apiClient：baseURL、JWT、timeout、攔截器一次到位。 */
                const res = await apiClient.get(`/api/social/friends/feed/${userId}`);
                {
                    const data = res.data || {};
                    const apiItems = (data.feed || []).map(item => ({
                        id: item.id || item.activity_id || `api_${Math.random()}`,
                        uId: item.user_id || item.uId || 'unknown',
                        userName: item.userName || item.user_name || 'Athlete',
                        discriminator: item.discriminator || '0000',
                        init: (item.userName || item.user_name || 'A').charAt(0).toUpperCase(),
                        createdAt: item.createdAt || item.created_at || item.time || new Date().toISOString(),
                        type: item.type || 'run',
                        caption: item.caption || '',
                        stats: item.stats || {},
                        kudos: item.kudos || 0,
                        myKudo: item.myKudo || false,
                        isPK: item.isPK || false,
                    }));
                    const existingIds = new Set(allActivities.map(a => a.id));
                    apiItems.forEach(it => { if (!existingIds.has(it.id)) allActivities.push(it); });
                }
            } catch (e) {}

            // Sort by most recent first
            allActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            /* 🧹 去重（四個來源都可能帶回同一次訓練）——
               我的訓練現在直接從 activityFeedSource 進來，好友動態 API 也可能
               把「我自己」的那筆回傳一次，貼文快取又有一份。
               用和最新動態同一招：id ＋ 內容簽章（人｜運動｜當日｜距離或訓練量），
               任一命中就是同一筆。少了這道，使用者會在社群看到自己跑了兩次。 */
            const dedupSeen = new Set();
            const deduped = [];
            for (const a of allActivities) {
                const st = a.stats || {};
                const day = String(a.createdAt || '').slice(0, 10);
                const amt = Math.round(((Number(st.distance) || 0) || (Number(st.volume_kg) || 0)) * 100);
                const kind = (a.type === 'fitness' ? 'strength' : a.type) || 'run';
                const sig = `${a.uId}|${kind}|${day}|${amt}|${Math.round(Number(st.duration_min) || 0)}`;
                const idKey = a.id ? `id:${a.id}` : null;
                // 貼文（照片／文字）不套內容簽章：同一天發兩則貼文是正常的
                const isPost = a.type === 'post' || a.type === 'photo';
                if (idKey && dedupSeen.has(idKey)) continue;
                if (!isPost && dedupSeen.has(sig)) continue;
                if (idKey) dedupSeen.add(idKey);
                if (!isPost) dedupSeen.add(sig);
                deduped.push(a);
            }
            allActivities = deduped;

            // 只顯示真實動態（不再用 SARAH/USER 假資料填版）；沒有資料時顯示空狀態
            // 🩹 v2：過濾「空殼紀錄」— 跑步沒距離、重訓沒訓練量/組數的垃圾資料
            //    （會顯示成「— KM 1:00 —/KM」的假卡）一律不上 feed。
            const valid = allActivities.filter((a) => {
                const st = a.stats || {};
                // 🎯 貼文（照片／文字）本來就沒有距離或訓練量，
                //    舊的過濾條件會把它們全部丟掉 → 「動態」永遠只有運動卡。
                //    有照片或有文字就是一則成立的貼文，放行。
                if (a.type === 'post' || a.type === 'photo') {
                    return !!a.photo || !!(a.caption && a.caption.trim());
                }
                if (a.type === 'strength' || a.type === 'fitness') {
                    return Number(st.volume_kg) > 0 || Number(st.sets) > 0;
                }
                return Number(st.distance) > 0.05;
            });
            setFeed(valid);
            setIsLoading(false);
        };

        loadFeed();
    }, [userId]);

    const handleKudo = async (activityId) => {
        const newFeed = [...feed];
        // 以 id 找：畫面上顯示的是過濾掉封鎖／檢舉後的清單，索引和 feed 對不上
        const index = newFeed.findIndex((f) => f.id === activityId);
        if (index < 0) return;
        if (!newFeed[index].myKudo) {
            newFeed[index].kudos += 1;
            newFeed[index].myKudo = true;
            setFeed([...newFeed]);
            if (window.navigator?.vibrate) window.navigator.vibrate(50);
            try {
                await apiClient.post('/api/social/friends/feed/kudo', { user_id: userId, activity_id: activityId });
            } catch (err) {
                /* ⚠️ 稽核前：失敗完全不吭聲，畫面停在已按讚的假狀態。
                   回滾並說明，使用者才知道要重按。 */
                /* 🩹 回滾以前比對 f.activity_id / user_gave_kudo —— 這頁的項目用的是 id / myKudo / kudos，
                   所以回滾從來沒對上任何一筆，畫面一直停在「已加油」。 */
                setFeed(prev => prev.map(f => f.id === activityId
                    ? { ...f, myKudo: false, kudos: Math.max(0, (f.kudos || 0) - 1) }
                    : f));
                toast.error('按讚沒有送出去，請稍後再試');
            }
        }
    };

    if (isLoading) return (
        <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-[12px] font-black tracking-widest text-[#161415]/30 animate-pulse">載入動態中…</p>
        </div>
    );

    // 🚩 封鎖的人、自己檢舉過的內容立即從畫面消失（後端也會濾，這裡是本機即時生效）
    const visibleFeed = feed.filter((it) => !isBlockedUser(it.uId) && !isHiddenContent(it.id));

    if (visibleFeed.length === 0) return (
        /* 空狀態不是用來說明的，是用來讓人做下一件事。
           原本只寫「先到好友分頁加入夥伴」—— 叫使用者自己去找，
           那是把工作丟回去。改成直接把入口放在手指底下。 */
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
            <Activity size={30} className="mb-4 text-[#161415]/25" strokeWidth={1.8} />
            <p className="text-[20px] font-black text-[#161415]/70">還沒有動態</p>
            <p className="text-[13px] font-medium text-[#161415]/45 mt-2 leading-relaxed max-w-[250px]">
                你自己的訓練會直接出現在這裡；<br />加入夥伴之後，也會看到他們的。
            </p>
            <div className="flex flex-col gap-2.5 mt-7 w-full max-w-[260px]">
                <motion.button
                    {...pressProps('cta')}
                    type="button"
                    onClick={() => onFindFriends?.()}
                    style={{
                        minHeight: 48, borderRadius: 999, border: 'none', cursor: 'pointer',
                        background: '#161415', color: '#F6F4F1', fontSize: 15, fontWeight: 800,
                    }}
                >
                    找夥伴
                </motion.button>
                <motion.button
                    {...pressProps('cta')}
                    type="button"
                    onClick={() => onInvite?.()}
                    style={{
                        minHeight: 48, borderRadius: 999, cursor: 'pointer',
                        background: 'transparent', color: '#161415',
                        border: '1px solid rgba(22,20,21,0.18)', fontSize: 15, fontWeight: 800,
                    }}
                >
                    邀人一起練
                </motion.button>
            </div>
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-24 pt-4">
            <div className="flex flex-col px-4 gap-4">
                {visibleFeed.map((item, index) => {
                    const isRun = item.type === 'run' || item.type === 'running';
                    const fmtPace = (s) => s ? `${Math.floor(s / 60)}'${String(Math.floor(s % 60)).padStart(2, '0')}"` : '--';
                    const fmtTimestamp = (iso) => {
                        try { return new Date(iso).toISOString().replace('T', 'T').substring(0, 23); }
                        catch { return iso || 'RECENTLY'; }
                    };
                    const isMe = item.uId === userId;

                    /* ── 貼文卡（照片／文字）— 與運動卡同一條時間軸，不同版型 ──
                       運動卡講數據，貼文卡講畫面與文字；混在一起才是完整的「動態」。 */
                    if (item.type === 'post' || item.type === 'photo') {
                        return (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(index * 0.06, 0.4), ease: [0.16, 1, 0.3, 1] }}
                                className="rounded-[24px] overflow-hidden bg-white border border-[#161415]/6"
                                style={{ boxShadow: '0 8px 24px -14px rgba(22,20,21,0.16)' }}
                            >
                                {/* 作者列 */}
                                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                                    <motion.button {...pressProps('pill')}
 onClick={() => onPeekProfile && onPeekProfile(item.uId)}
 className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
 style={{ background: 'rgba(22,20,21,0.06)' }}
 >
                                        {item.avatar
                                            ? <img loading="lazy" decoding="async" src={item.avatar} alt="" className="w-full h-full object-cover" />
                                            : <span className="text-[13px] font-black text-[#161415]">{item.init}</span>}
                                    </motion.button>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13.5px] font-bold text-[#161415] truncate">
                                            {isMe ? '你' : item.userName}
                                        </p>
                                        <p className="text-[12px] font-medium text-[#161415]/35 tracking-wider">
                                            {new Date(item.createdAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                            {item.visibility === 'friends' ? ' · 僅好友' : item.visibility === 'followers' ? ' · 粉絲可見' : ''}
                                        </p>
                                    </div>
                                    {!isMe && (
                                        <ModerationMenu type="post" targetId={item.id} authorId={item.uId} authorName={item.userName}
                                            snapshot={item.caption || ''} />
                                    )}
                                </div>

                                {item.photo && (
                                    <div style={{ width: '100%', aspectRatio: '4/5', background: '#EFEBE5' }}>
                                        <img loading="lazy" decoding="async" src={item.photo} alt=""
                                            className="w-full h-full object-cover" />
                                    </div>
                                )}

                                {item.caption?.trim() && (
                                    <p className="px-4 py-3.5 text-[13.5px] leading-relaxed text-[#161415]/85">
                                        {item.caption}
                                    </p>
                                )}
                            </motion.div>
                        );
                    }

                    // 正規化為 FriendActivityCard 需要的形狀
                    const na = {
                        sport: item.type,
                        distance: Number(item.stats?.distance) || 0,
                        durationSec: item.stats?.duration_min ? item.stats.duration_min * 60 : (Number(item.stats?.duration) || 0),
                        paceSec: Number(item.stats?.pace) || 0,
                        elev: Number(item.stats?.elevationGain || item.stats?.elevation_gain) || 0,
                        volumeKg: Number(item.stats?.volume_kg) || 0,
                        sets: Number(item.stats?.sets) || 0,
                        route: item.route || item.stats?.route || [],
                        prCount: Number(item.pr_count || item.stats?.pr_count) || 0,
                        // 🏅 金銀銅 + 🤝 一起練：與最新動態同一份資料
                        medals: Array.isArray(item.medals) ? item.medals : [],
                        companions: Array.isArray(item.companions) ? item.companions : [],
                        createdAt: item.createdAt,
                    };
                    return (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 6) * 0.08 }}
                            key={item.id}
                        >
                            {/* 與「最近動態」同版型的運動卡（多一列好友頭像/名字）；點卡 → 該次結算頁 */}
                            <FriendActivityCard
                                activity={na}
                                friend={{ uId: item.uId, name: item.userName, discriminator: item.discriminator, avatar: item.avatar, init: item.init, isMe }}
                                index={index}
                                onClick={() => openSession(item)}
                                onPeekProfile={onPeekProfile}
                            />
                            <div className="flex flex-col relative z-10">
                                {/* Actions：加油（kudo）＋ 留言（原「督促」只是個假按鈕） */}
                                <div className="flex items-center gap-3 pt-3 mt-1">
                                    <motion.button {...pressProps('cta')} onClick={() => handleKudo(item.id)} className={`flex-1 py-2.5 rounded-full flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] border ${item.myKudo ? 'bg-[#F95C4B]/10 border-[#F95C4B]/20 text-[#F95C4B]' : 'bg-transparent border-black/5 text-[#161415]/60 hover:bg-black/5'}`}>
                                        <Flame size={14} fill={item.myKudo ? '#F95C4B' : 'none'} className={item.myKudo ? 'animate-pulse' : ''} />
                                        {item.kudos > 0 ? item.kudos : '加油'}
                                    </motion.button>
                                    <motion.button {...pressProps('pill')}
 onClick={() => toggleComments(item.id)}
 className={`flex-1 py-2.5 rounded-full flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] border ${openCommentsId === item.id ? 'bg-[#161415] text-white border-[#161415]' : 'bg-transparent border-black/5 text-[#161415]/60 hover:bg-black/5'}`}>
                                        <MessageCircle size={14} /> 留言{(commentsMap[item.id]?.length || 0) > 0 ? ` ${commentsMap[item.id].length}` : ''}
                                    </motion.button>
                                    {!isMe && (
                                        <ModerationMenu type="post" targetId={item.id} authorId={item.uId} authorName={item.userName}
                                            snapshot={item.caption || ''} />
                                    )}
                                </div>

                                {/* 💬 留言區（展開式） */}
                                <AnimatePresence>
                                    {openCommentsId === item.id && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                                            <div className="pt-3 flex flex-col gap-2">
                                                {(commentsMap[item.id] || []).filter((cm) => !isBlockedUser(cm.user_id) && !isHiddenContent(cm.comment_id)).map((cm, ci) => (
                                                    <div key={cm.comment_id || ci} className="flex gap-2 items-start">
                                                        <div className="w-6 h-6 rounded-full bg-[#161415]/8 flex items-center justify-center text-[11px] font-black shrink-0">{(cm.user_name || 'U')[0]}</div>
                                                        <p className="flex-1 min-w-0 text-[12px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.8)' }}>
                                                            <span className="font-black mr-1.5">{cm.user_name || 'User'}</span>{cm.content}
                                                        </p>
                                                        {cm.comment_id && cm.user_id && (
                                                            <ModerationMenu type="comment" targetId={cm.comment_id} authorId={cm.user_id}
                                                                authorName={cm.user_name || ''} snapshot={cm.content || ''} label="檢舉" />
                                                        )}
                                                    </div>
                                                ))}
                                                {(commentsMap[item.id] || []).filter((cm) => !isBlockedUser(cm.user_id) && !isHiddenContent(cm.comment_id)).length === 0 && commentsMap[item.id] !== undefined && (
                                                    <p className="text-[11px] text-[#161415]/35 font-semibold">還沒有留言 — 說點什麼吧</p>
                                                )}
                                                <div className="flex gap-2 mt-1">
                                                    <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendComment(item.id); }}
                                                        placeholder="留言…" className="flex-1 px-3.5 py-2 rounded-xl text-[12px] outline-none" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(22,20,21,0.12)', color: '#161415' }} />
                                                    <motion.button {...pressProps('row')} onClick={() => sendComment(item.id)} disabled={sending || !draft.trim()}
 className="px-4 rounded-xl text-[11px] font-black" style={{ background: draft.trim() ? '#F95C4B' : 'rgba(22,20,21,0.08)', color: draft.trim() ? '#fff' : 'rgba(22,20,21,0.35)', border: 'none' }}>送出</motion.button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── 🏆 FRIENDS LEADERBOARD (RANK + COLLABORATE) ──────────────────────
const FriendsLeaderboard = ({ onPeekProfile, onChallenge, userAvatar }) => {
    const userId = getUserId();
    const [leaderboard, setLeaderboard] = useState([]);
    const [collabBoard, setCollabBoard] = useState([]);
    const [activeCategory, setActiveCategory] = useState('rank'); // 'rank' | 'collaborate'
    const [isLoading, setIsLoading] = useState(true);

    // Safely get local user profile for foolproof fallbacks
    const localProfile = useMemo(() => {
        try {
            const data = localStorage.getItem('userProfile');
            if (data) {
                const parsed = JSON.parse(data);
                return parsed[userId] || parsed;
            }
        } catch(e) {}
        return null;
    }, [userId]);

    // 🔑 與 Edit Profile 同源：優先讀使用者實際選的頭貼 user_avatar_photo（含 DRVN 預設頭像/上傳照/emoji）
    const savedAvatar = (() => { try { return uStorage(userId).get('user_avatar_photo', null); } catch { return null; } })();
    const savedName = (() => { try { return uStorage(userId).get('user_profile_cache', {})?.name; } catch { return null; } })();
    const myAvatar = savedAvatar || userAvatar || localProfile?.avatar;
    const myName = savedName || localProfile?.name || 'USER';

    // 我的真實積分（跑步 10 pts/km、重訓 1 pt/100kg）— 取本機真實數據
    const myScore = useMemo(() => {
        let km = 0, vol = 0, runCount = 0;
        try {
            const cardio = uStorage(userId).get('cardio_sessions', []) || []; // 🔴 Fix(A1)：per-user 命名空間
            runCount = cardio.length;
            cardio.forEach(s => { km += (s.distance ? s.distance / 1000 : (s.distanceKm || 0)); });
        } catch { /* ignore */ }
        try {
            const recs = uStorage(userId).get('trainingRecords', {}) || {};
            Object.values(recs).forEach(d => { if (d && d.volume) vol += Number(d.volume) || 0; });
        } catch { /* ignore */ }
        return { km: Math.round(km * 10) / 10, vol: Math.round(vol), runCount, pts: Math.round((km * 10 + vol / 100) * 10) / 10 };
    }, [userId]);

    // 真實協作：優先讀後端清單；並把「我這側」的真實進度推回後端讓協作前進。後端不可用則退回本機已發起的協作。
    const loadCollabData = useCallback(async () => {
        // 1) 後端真實協作清單
        try {
            const res = await apiClient.get(`/api/social/challenge/list/${userId}`);
            const all = (res?.data?.challenges || []).filter(c => c.mode === 'collaborate');
            if (all.length) {
                // 把我目前的真實累積（跑步 km / 重訓 volume）推回後端
                // 只推「已接受」的：還沒答應的邀請不該累積進度
                //（後端也已擋掉未接受就自動完成的情況）
                all.forEach(c => {
                    if (c.status === 'accepted') {
                        const mine = (c.type === 'Lift') ? myScore.vol : myScore.km;
                        apiClient.post('/api/social/challenge/progress', { user_id: userId, challenge_id: c.challenge_id, progress: mine }).catch(() => {});
                    }
                });
                const items = all.map(c => ({
                    pair_id: c.challenge_id,
                    nameA: myName, nameB: (c.other_user?.name || '夥伴'),
                    goalTitle: c.title || 'COLLAB',
                    target: `${c.metric ?? ''} ${c.unit || ''}`.trim(),
                    bondScore: c.bond || 0,
                    status: c.status === 'completed' ? 'done' : 'active',
                }));
                setCollabBoard(items);
                return;
            }
        } catch { /* 後端不可用 → 用本機 */ }

        // 2) 本機 fallback：使用者已發起的協作
        try {
            const pending = JSON.parse(localStorage.getItem('pendingCollabs') || '[]').filter(c => c.initiator_id === userId);
            const items = pending.map(c => ({
                pair_id: c.collab_id, nameA: myName, nameB: c.partner_name || '夥伴',
                goalTitle: c.title || c.goal_type || 'COLLAB',
                target: `${c.target_metric || ''} ${c.target_unit || ''}`.trim(),
                bondScore: c.bond || 0, status: 'active',
            }));
            setCollabBoard(items);
        } catch { setCollabBoard([]); }
    }, [userId, myName, myScore]);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            // 先把本機真實累積同步到後端，排行榜分數才會是真的
            try {
                await apiClient.post('/api/social/friends/sync-stats', {
                    user_id: userId, distance_km: myScore.km, volume_kg: myScore.vol, run_count: myScore.runCount,
                });
            } catch { /* 後端不可用 → 用本機 fallback */ }
            try {
                const res = await apiClient.get(`/api/social/friends/leaderboard/${userId}`);
                setLeaderboard(res.data?.leaderboard || []);
            } catch (error) {
                // 無後端：以本機真實數據顯示「你」的真實積分（含追蹤中的夥伴佔位）
                const me = { user_id: userId, name: myName, discriminator: '0000', score: myScore.pts, metrics: { run_distance: myScore.km } };
                let board = [me];
                try {
                    const friends = JSON.parse(localStorage.getItem(`friends_${userId}`) || '[]');
                    friends.slice(0, 8).forEach(f => board.push({ user_id: f.user_id || f.id, name: parseName(f.name).name || f.name || 'Athlete', discriminator: '----', score: 0, metrics: { run_distance: 0 }, pending: true }));
                } catch { /* ignore */ }
                board.sort((a, b) => b.score - a.score);
                setLeaderboard(board);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLeaderboard();
        loadCollabData();
    }, [userId, loadCollabData, myName, myScore]);

    if (isLoading) return (
        <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-[12px] font-black tracking-widest text-[#161415]/30 animate-pulse">計算排名中…</p>
        </div>
    );

    const myRankIndex = leaderboard.findIndex(u => u.user_id === userId);
    const someoneAboveMe = myRankIndex > 0 ? leaderboard[myRankIndex - 1] : null;

    return (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-24 pt-4">
            {/* Category tabs */}
            <div className="px-6 flex gap-3 mb-6">
                <motion.button {...pressProps('row')} onClick={() => setActiveCategory('rank')} className={`px-4 py-2 border-2 border-[#161415] text-[9px] font-black uppercase tracking-widest ${activeCategory === 'rank' ? 'bg-[#161415] text-white' : 'bg-white text-[#161415]/50'}`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                    Rank
                </motion.button>
                <motion.button {...pressProps('row')} onClick={() => setActiveCategory('collaborate')} className={`px-4 py-2 border-2 border-[#161415] text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${activeCategory === 'collaborate' ? 'bg-[#161415] text-white' : 'bg-white text-[#161415]/50'}`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                    <Users size={12} /> Collab
                </motion.button>
            </div>

            {activeCategory === 'rank' ? (
                <div className="px-6">
                    <div className="flex justify-between items-baseline mb-3 border-b border-[#161415]/10 pb-2">
                        <h4 className="text-[32px] font-light uppercase tracking-tighter text-[#161415] italic" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>排行榜</h4>
                        <p className="text-[12px] font-black text-white tracking-[0.04em] bg-[#161415] px-3 py-1 rounded-full">全球</p>
                    </div>
                    {/* Scoring formula explanation */}
                    <div className="flex items-center gap-4 mb-5 px-1">
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#161415]/40">
                            <Activity size={10} strokeWidth={3} className="text-[#F95C4B]" />
                            <span>跑步：<span className="text-[#161415]/70">10 pts / km</span></span>
                        </div>
                        <div className="w-px h-3 bg-[#161415]/10" />
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#161415]/40">
                            <Dumbbell size={10} className="text-[#161415]/60" />
                            <span>重訓：<span className="text-[#161415]/70">1 pt / 100 kg</span></span>
                        </div>
                        <div className="w-px h-3 bg-[#161415]/10" />
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#161415]/40">
                            <Zap size={10} className="text-[#161415]/60" />
                            <span>即時數據</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        {leaderboard.map((user, index) => {
                            const isMe = user.user_id === userId;
                            const rank = index + 1;
                            const rawAvatar = isMe ? (myAvatar || user.avatar) : user.avatar;
                            const displayAvatar = resolveAvatarUrl(rawAvatar);
                            // emoji 頭貼（非 URL、非圖片副檔名）→ 直接顯示 emoji，與 Edit Profile 一致
                            const emojiAvatar = (!displayAvatar && typeof rawAvatar === 'string' && rawAvatar.trim() && !/^(https?:|data:|blob:|\/)/.test(rawAvatar) && !/\.(png|jpe?g|webp|gif|svg)$/i.test(rawAvatar)) ? rawAvatar.trim() : null;
                            const displayName = isMe ? (myName || user.name || 'USER') : (user.name || 'USER');
                            const initial = displayName.charAt(0).toUpperCase();

                            return (
                                <motion.div
                                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index, 6) * 0.08 }}
                                    key={user.user_id} onClick={() => onPeekProfile(user.user_id)}
                                    className={`flex items-center justify-between py-4 cursor-pointer border-b border-[#161415]/10 transition-all hover:bg-black/5 px-4 rounded-xl ${
                                        isMe ? 'bg-[#161415] text-white hover:bg-[#161415] shadow-xl border-b-transparent' : 'bg-transparent text-[#161415]'
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 text-center border-r border-[#161415]/10 pr-2 flex-shrink-0">
                                            <span className={`text-[32px] font-light italic tracking-tighter ${rank === 1 && !isMe ? 'text-[#F95C4B]' : ''}`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{rank}</span>
                                        </div>
                                        <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center font-light italic text-[18px] overflow-hidden rounded-sm border-2 ${isMe ? 'border-[#F95C4B] text-[#161415] bg-white' : 'border-[#161415]/20 bg-[#161415]/5 text-[#161415]'}`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                            {displayAvatar ? (
                                                <img loading="lazy" decoding="async" src={displayAvatar} className="w-full h-full object-cover" alt="" />
                                            ) : emojiAvatar ? (
                                                <span className="text-[20px] leading-none">{emojiAvatar}</span>
                                            ) : (
                                                <span className={isMe ? 'text-[#F95C4B]' : ''}>{initial}</span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[16px] font-black uppercase tracking-widest leading-none mb-1.5 flex items-center gap-2" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                {displayName}
                                                {isMe && <span className="text-[12px] font-black tracking-widest text-white bg-[#F95C4B] px-1.5 py-0.5 rounded-sm">你</span>}
                                            </p>
                                            <p className={`text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-1.5 ${isMe ? 'text-[#F95C4B]' : 'text-[#161415]/40'}`}>
                                                <Activity size={12} strokeWidth={3} /> {user.metrics?.run_distance || 0} KM
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-[28px] font-black italic tracking-tighter leading-none">{(user.score || 0).toFixed(1)}</p>
                                            <p className={`text-[9px] font-black uppercase tracking-widest ${isMe ? 'text-white/50' : 'text-[#161415]/40'} mt-1`}>分</p>
                                        </div>
                                        {!isMe && (
                                            <motion.button {...pressProps('icon')} onClick={(e) => { e.stopPropagation(); onChallenge?.(user); }} className="w-10 h-10 rounded-full bg-[#161415]/5 flex items-center justify-center text-[#161415] hover:bg-[#F95C4B] hover:text-white"><Zap size={16} fill="currentColor" /></motion.button>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {someoneAboveMe && myRankIndex >= 0 && (
                        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                            className="mt-8 p-6 bg-white border border-[#161415]/10 rounded-[18px] relative overflow-hidden shadow-sm"
                        >
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#161415]/60 mb-2 flex items-center gap-2">
                                <Crosshair size={14} className="text-[#F95C4B]" /> 下一個超越對象
                            </p>
                            <p className="text-[28px] font-black uppercase italic text-[#161415] tracking-tighter mb-1">{someoneAboveMe.name}</p>
                            <p className="text-[14px] font-black text-[#161415]/60 mb-6 uppercase tracking-widest">
                                GAP: <span className="text-[#F95C4B]">{Math.max(0, someoneAboveMe.score - leaderboard[myRankIndex].score).toFixed(1)} PTS</span>
                            </p>
                            <motion.button {...pressProps('cta')} onClick={() => onChallenge?.(someoneAboveMe)} className="w-full py-4 bg-[#161415] text-white text-[12px] font-black uppercase tracking-[0.06em] rounded-full hover:bg-[#F95C4B] flex items-center justify-center gap-2 shadow-lg"><Zap size={16} fill="currentColor" /> 一起達成</motion.button>
                        </motion.div>
                    )}
                </div>
            ) : (
                // Collaborate board
                <div className="px-6">
                    <div className="mb-6 border-b border-[#161415]/10 pb-2">
                        <h4 className="text-[32px] font-black uppercase tracking-tighter text-[#161415] italic">共同挑戰</h4>
                        <p className="text-[9px] font-black text-[#161415]/40 uppercase tracking-widest mt-1">
                            兩人 2 小時內一起達標
                        </p>
                    </div>

                    {collabBoard.length > 0 ? (
                        <div className="space-y-3">
                            {collabBoard.map((pair, i) => (
                                <motion.div key={pair.pair_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 6) * 0.08 }}
                                    className="p-5 bg-white border-2 border-[#161415] shadow-[3px_3px_0px_#161415] flex items-center gap-4"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-[#161415] text-white flex items-center justify-center font-black text-[14px] italic border border-[#161415]">
                                            {(pair.nameA || '?').charAt(0)}
                                        </div>
                                        <div className="text-[#161415]/40 font-black text-[11px]">×</div>
                                        <div className="w-10 h-10 bg-[#F95C4B]/10 border-2 border-[#F95C4B] text-[#F95C4B] flex items-center justify-center font-black text-[14px] italic">
                                            {(pair.nameB || '?').charAt(0)}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-black uppercase tracking-widest text-[#161415] leading-none mb-1 truncate">
                                            {pair.nameA} & {pair.nameB}
                                        </p>
                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#161415]/40">
                                            {pair.status === 'active' ? (
                                                <>
                                                    <span className="px-1.5 py-0.5 bg-[#F95C4B]/10 text-[#F95C4B] rounded">進行中</span>
                                                    {pair.target && <span className="truncate">目標 {pair.target}</span>}
                                                </>
                                            ) : (
                                                <span>{pair.achievements} 次完成</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[20px] font-black italic text-[#F95C4B] leading-none">{pair.bondScore}</p>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-[#161415]/30 flex items-center gap-0.5 justify-end mt-0.5">
                                            <Heart size={8} fill="#F95C4B" className="text-[#F95C4B]" /> BOND
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-10 text-center border-2 border-dashed border-[#161415]/15 rounded-[20px]">
                            <p className="text-[14px] font-black text-[#161415]/50 mb-1">還沒有協作</p>
                            <p className="text-[11px] text-[#161415]/40">到「名冊」選一位夥伴，點 ⚡ 發起協作</p>
                        </div>
                    )}

                    {/* 操作說明 — 🩹 改為收合式（預設收起，點標題展開），不佔版面 */}
                    <CollabHowTo />
                </div>
            )}
        </div>
    );
};

// ─── Hoisted FriendCard (rerender-no-inline-components) ─────────────────────
// Was previously defined INSIDE SocialPage — caused remount + input focus loss
// on every parent state change. Now hoisted with callbacks passed as props.
const FriendCard = React.memo(({ f, userId, onPeek, onChallenge, onGift, onRemove, onExplosion }) => {
    const parsed = parseName(f.name, f.discriminator);
    const activityStatus = getActivityStatus(f);
    const receivedStickers = (() => {
        try { return JSON.parse(localStorage.getItem(`received_stickers_${userId}`) || '[]').filter(s => s.from_user_id === f.user_id && !s.seen); }
        catch { return []; }
    })();

    const longPressHandlers = useLongPress((x, y) => {
        onExplosion(x, y);
    }, 550);

    return (
        <div
            {...longPressHandlers}
            className="flex items-center gap-4 p-4 bg-white border-2 border-[#161415] shadow-[4px_4px_0px_rgba(22,20,21,0.1)] group hover:shadow-[4px_4px_0px_#F95C4B] transition-all select-none"
        >
            <div className="relative">
                <div
                    onClick={() => onPeek({ userId: f.user_id, friendData: f })}
                    className={`w-14 h-14 bg-[#161415] text-white flex items-center justify-center text-xl font-black italic border-2 cursor-pointer ${activityStatus ? 'border-[#F95C4B]' : 'border-[#161415]'}`}
                >
                    {resolveAvatarUrl(f.avatar) ? <img loading="lazy" decoding="async" src={resolveAvatarUrl(f.avatar)} alt="頭像" className="w-full h-full object-cover" /> : parsed.name.charAt(0)}
                </div>
                {activityStatus && (
                    <div className={`absolute -bottom-2 -right-2 text-white text-[9px] font-black px-1.5 py-0.5 border border-[#161415] uppercase tracking-widest shadow-sm whitespace-nowrap`}
                        style={{ background: activityStatus.color }}>
                        {activityStatus.type === 'run' ? '🏃' : '🏋️'} LIVE
                    </div>
                )}
                {receivedStickers.length > 0 && (
                    <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-[#F95C4B] text-white text-[11px] font-black flex items-center justify-center border border-[#161415]">
                        {receivedStickers.length}
                    </div>
                )}
            </div>
            <div className="flex-1 cursor-pointer" onClick={() => onPeek({ userId: f.user_id, friendData: f })}>
                <div className="flex items-center gap-2 mb-1">
                    <p className="text-[18px] font-black uppercase tracking-widest leading-none text-[#161415]">
                        {parsed.name} <span className="text-[11px] italic text-[#161415]/40">#{parsed.disc}</span>
                    </p>
                </div>
                {/* 🤝 一起練到什麼程度 —— 讀後端持久化的 bond_score。
                    原本這裡顯示的 intimacy 只存在前端記憶體，重新整理就歸零，
                    等於畫一個永遠是 0 的數字給使用者看。 */}
                <div className="mt-1.5 mb-1.5">
                    <BondRow score={f.bond_score} compact />
                </div>
                <div className="flex items-center gap-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#161415]/60 bg-[#161415]/5 px-1.5 py-0.5 border border-[#161415]/10">
                        {f.tag || 'ATHLETE'}
                    </p>
                    {activityStatus && (
                        <p className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: activityStatus.color }}>
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: activityStatus.color }} />
                            {activityStatus.label}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex flex-col gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); onChallenge(f); }} className="p-1.5 border border-[#161415] text-[#161415] hover:bg-[#F95C4B] hover:text-white transition-colors bg-white"><Zap size={14} /></motion.button>
                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); onGift(f); }} className="p-1.5 border border-[#161415] text-[#161415] hover:bg-[#161415] hover:text-white transition-colors bg-white relative">
                    <Gift size={14} />
                </motion.button>
                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); onRemove(f.user_id, parsed.name); }} className="p-1.5 border border-[#161415] text-[#161415]/50 hover:bg-[#D94030] hover:text-white transition-colors bg-white"><Trash2 size={14} /></motion.button>
            </div>
        </div>
    );
});

// ─── 🌐 MAIN SOCIAL PAGE COMPONENT ────────────────────────────────────
const SocialPage = ({ userProfile }) => {
    const userId = getUserId();

    // 🩹 名片要顯示「使用者自己的」資料 — userProfile prop 沒帶到（或缺欄位）時，
    //    自己向後端抓本人檔案（/api/social/friends/profile/{uid}），
    //    不再顯示 Athlete#0000 的預設佔位。
    const [myProfile, setMyProfile] = useState(null);
    useEffect(() => {
        if (!userId) return;
        if (userProfile?.name && userProfile?.discriminator) return; // prop 已完整
        apiClient.get(`/api/social/friends/profile/${userId}`)
            .then((r) => setMyProfile(r.data))
            .catch(() => { });
    }, [userId, userProfile?.name, userProfile?.discriminator]);

    const disc = userProfile?.discriminator || myProfile?.discriminator || '0000';
    const name = userProfile?.name || myProfile?.name || 'Athlete';
    const userData = {
        username: name,
        discriminator: disc,
        fullId: `${name}#${disc}`,
        avatar: userProfile?.avatar || myProfile?.avatar,
    };

    const [activeTab, setActiveTab] = useState('feed');
    const [friends, setFriends] = useState([]);
    const [requests, setRequests] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [showMyId, setShowMyId] = useState(true); // 名冊頁預設先顯示自己的名片
    const [isCopied, setIsCopied] = useState(false);
    const [peekingUser, setPeekingUser] = useState(null); // { userId, friendData }
    const [peekFull, setPeekFull] = useState(false);       // 預覽之後才開整頁
    const [challengeTarget, setChallengeTarget] = useState(null);
    const [giftingTarget, setGiftingTarget] = useState(null);
    const [selectedGifts, setSelectedGifts] = useState([]);
    const [toastMsg, setToastMsg] = useState(null);
    const [explosions, setExplosions] = useState([]); // [{ id, x, y }]
    const [collabReward, setCollabReward] = useState(null); // 協作完成獲取動畫

    /* 🤝 一起練：收邀請 → 接受／拒絕 → 看雙方進度。
       後端早就有 /respond 與 /inbox，但先前前端一個地方都沒接，
       邀請送出去對方永遠收不到（見 useTrainTogether 的說明）。 */
    const tt = useTrainTogether(userId);
    const live = useLiveSession(userId);
    const [joiningLive, setJoiningLive] = useState(false);
    const navigate = useNavigate();

    // ❌ API_FRIENDS 已移除 —— 好友相關呼叫全部改走 apiClient 的相對路徑

    const triggerToast = (msg) => {
        if (window.navigator?.vibrate) window.navigator.vibrate(50);
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    // ── Fetch friends ──
    useEffect(() => { if (userId) fetchFriendsData(); }, [userId]);

    // ── 協作完成結算：向後端查「已完成未領取」的協作，發放回饋（解鎖貼紙 + 親密度）──
    const settleCompletedCollabs = useCallback(async () => {
        if (!userId) return;
        let completed = [];
        try {
            const res = await apiClient.get(`/api/social/challenge/completed/${userId}`);
            completed = res.data?.completed || [];
        } catch (_) { return; }
        if (completed.length === 0) return;

        for (const c of completed) {
            // 回饋 1：記錄協作完成次數（驅動「同心協作」貼紙）
            recordCollabCompletion(userId);
            // 回饋 2：親密度 +15 —— 寫進後端 friendships.json，不是只加在記憶體裡
            //         （原本只 setFriends，重新整理就沒了，等於白加）
            const partnerId = c.other_user?.user_id;
            if (partnerId) {
                try {
                    await apiClient.patch('/api/social/friends/bond', {
                        user_id: userId, friend_id: partnerId, delta: 15,
                    });
                } catch (err) {
                    console.warn('親密度寫入失敗', err?.message || err);
                }
                setFriends((prev) => prev.map((f) =>
                    f.user_id === partnerId ? { ...f, bond_score: (f.bond_score || 0) + 15 } : f
                ));
            }
            // 標記已領取，避免重複發放
            try {
                await apiClient.post('/api/social/challenge/claim', { user_id: userId, challenge_id: c.challenge_id, action: 'claim' });
            } catch (_) {}
        }

        // 回饋 3：觸發限定貼紙解鎖 + 獲取動畫
        try {
            const newly = syncUnlockedStickers(userId) || [];
            if (newly.length > 0) setCollabReward(newly[0]);
        } catch (_) {}
    }, [userId]);

    useEffect(() => { settleCompletedCollabs(); }, [settleCompletedCollabs]);

    const fetchFriendsData = async () => {
        setIsLoading(true);
        try {
            const res = await apiClient.get(`/api/social/friends/${userId}/list`);
            const data = res.data || {};
            const fetchedFriends = data.friends || [];
            const fetchedRequests = data.pending_requests || [];

            // Validate friend IDs — filter out any placeholder IDs
            const validFriends = fetchedFriends.filter(f => f.user_id && f.user_id !== userId && f.user_id !== 'user_123' && f.user_id !== 'user1');

            setFriends(validFriends);
            setRequests(fetchedRequests);
        } catch (error) {
            // Fallback: build from localStorage friend list
            try {
                const stored = JSON.parse(localStorage.getItem(`friends_${userId}`) || '[]');
                setFriends(stored);
            } catch (e) {
                setFriends([]);
            }
            setRequests([]);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Search users ──
    useEffect(() => {
        const query = searchQuery.trim();
        if (query.length < 1) { setSearchResults([]); setIsSearching(false); return; }
        setIsSearching(true);
        const delayDebounceFn = setTimeout(async () => {
            try {
                const res = await apiClient.get(`/api/social/friends/search/${encodeURIComponent(query)}`, { params: { user_id: userId } });
                const data = res.data || [];
                const friendIds = new Set(friends.map(f => f.user_id));
                const filtered = data.filter(u => !friendIds.has(u.user_id));
                setSearchResults(filtered);
            } catch (error) {
                setSearchResults([]);
            } finally { setIsSearching(false); }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, userId, friends]);

    // 防止 onPointerDown + onClick 連續觸發兩次複製
    const copyLockRef = useRef(false);

    const handleCopyId = () => {
        // ── iOS Safari 剪貼簿終極解法 v2 ──
        // 根因分析（為什麼舊版在 iPhone 上失敗）：
        //  1. textarea 加上 readonly → iOS Safari 多版本會拒絕後續 execCommand('copy')
        //  2. clip: rect(0,0,0,0) → iOS 把它判定為「不可見元素」直接靜默拒絕複製
        //  3. ta.focus() → iOS 會喚出虛擬鍵盤 + 觸發捲動，這個 layout 變化會直接
        //     「消耗掉使用者手勢」，後續所有 copy 行為都會被當作「非使用者觸發」拒絕
        //  4. HTTP 環境下 navigator.clipboard 是 undefined → fallback 根本沒機會跑
        //
        // 修法：
        //  • 在 iOS 上改用 contenteditable 的 <span>（不會喚出鍵盤、不會搶 focus）
        //  • 完全不呼叫 .focus()
        //  • 移除 readonly、移除 clip
        //  • 用 Range + Selection 選取，不依賴 .select()
        //  • UI 回饋的 vibrate 移到複製成功後再觸發（避免影響手勢判定）

        if (copyLockRef.current) return;
        copyLockRef.current = true;
        // 300ms 後解鎖，足以避免 pointerdown→click 重入，但不影響使用者下一次點擊
        setTimeout(() => { copyLockRef.current = false; }, 300);

        const textToCopy = userData.fullId;
        const ua = navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        let success = false;

        // ═══ 第一順位（100% 同步）：execCommand on contentEditable / textarea ═══
        try {
            const el = document.createElement(isIOS ? 'span' : 'textarea');

            if (isIOS) {
                el.contentEditable = 'true';
                el.textContent = textToCopy;
            } else {
                el.value = textToCopy;
            }

            // 把元素放在畫面內但視覺上完全透明 — 千萬不要用 clip / visibility / display:none
            // 也不要用 pointer-events:none（iOS 對「不可互動」元素同樣會拒絕複製）
            el.style.position = 'fixed';
            el.style.top = '50%';
            el.style.left = '50%';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.width = '1px';
            el.style.height = '1px';
            el.style.padding = '0';
            el.style.margin = '0';
            el.style.border = '0';
            el.style.outline = '0';
            el.style.boxShadow = 'none';
            el.style.background = 'transparent';
            el.style.color = 'transparent';
            el.style.opacity = '0';
            el.style.fontSize = '16px';     // 防 iOS auto-zoom
            el.style.userSelect = 'text';
            el.style.webkitUserSelect = 'text';

            document.body.appendChild(el);

            // ⚠️ 故意不呼叫 el.focus()
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
            // 桌面版 textarea 多做一次 setSelectionRange（雙保險）
            if (!isIOS && typeof el.setSelectionRange === 'function') {
                el.setSelectionRange(0, textToCopy.length);
            }

            success = document.execCommand('copy');

            if (sel) sel.removeAllRanges();
            document.body.removeChild(el);
        } catch (err) {
            console.warn('[handleCopyId] execCommand path failed:', err);
        }

        // ═══ 第二順位：Clipboard API — 僅在 HTTPS / localhost 等 secure context 才可用 ═══
        // 注意：你目前的 API_BASE_URL 是 http://，在 iPhone 上 isSecureContext 通常為 false
        if (!success && navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                if (window.navigator?.vibrate) window.navigator.vibrate(50);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            }).catch(() => {
                triggerToast('複製失敗 — 請長按 ID 手動複製');
            });
            return;
        }

        // ═══ UI 回饋 ═══
        if (success) {
            if (window.navigator?.vibrate) window.navigator.vibrate(50);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } else {
            triggerToast('複製失敗 — 請長按下方 ID 文字手動複製');
        }
    };

    const sendRequest = async (toUserId) => {
        /* ⚠️ 稽核前：不論後端成不成功都先跳「Request Sent!」，
           失敗被 catch {} 吞掉 —— 使用者以為邀請送出去了，對方其實永遠收不到。
           現在等後端回覆再說結果，失敗把人放回搜尋結果讓他能重試。 */
        const removed = searchResults.find(u => u.user_id === toUserId);
        setSearchResults(prev => prev.filter(u => u.user_id !== toUserId));
        try {
            await apiClient.post('/api/social/friends/request', { from_user_id: userId, to_user_id: toUserId });
            triggerToast('好友邀請已送出');
            setSearchQuery('');
        } catch (error) {
            if (removed) setSearchResults(prev => [removed, ...prev]);
            triggerToast('邀請沒有送出去，請稍後再試');
        }
    };

    const respondRequest = async (requestId, action, reqData) => {
        // Optimistic: immediately remove from requests list
        setRequests(prev => prev.filter(r => r.request_id !== requestId));
        triggerToast(action === 'accept' ? '已加為好友' : '已拒絕邀請');
        // ✨ 第一個戰友入列 → 滿版時刻（只慶祝一次）
        if (action === 'accept') { try { recordFirst(userId, 'add_friend'); } catch { /* */ } }

        if (action === 'accept' && reqData) {
            // Optimistically add to friends list
            const newFriend = {
                user_id: reqData.from_user?.user_id || reqData.from_user_id,
                name: reqData.from_user?.name || 'Athlete',
                discriminator: reqData.from_user?.discriminator || '0000',
                tag: reqData.from_user?.tag || 'DRVN ATHLETE',
                avatar: reqData.from_user?.avatar || null,
                bond_score: 0,
                is_running: false,
                is_lifting: false,
            };
            if (newFriend.user_id && newFriend.user_id !== userId) {
                setFriends(prev => {
                    const existing = prev.find(f => f.user_id === newFriend.user_id);
                    if (existing) return prev;
                    const updated = [...prev, newFriend];
                    // Persist to localStorage as fallback
                    try { localStorage.setItem(`friends_${userId}`, JSON.stringify(updated)); } catch (e) {}
                    return updated;
                });
            }
        }

        try {
            // axios 在非 2xx 會直接 throw，不用再自己檢查 res.ok
            await apiClient.post('/api/social/friends/respond', { user_id: userId, request_id: requestId, action });
            // Re-fetch to get authoritative data
            if (action === 'accept') {
                setTimeout(() => fetchFriendsData(), 500);
            }
        } catch (error) {
            /* 沒送出去卻已經從待審清單消失，等於邀請被吃掉了 —— 重新拉一次還原真實狀態 */
            triggerToast(action === 'accept' ? '接受失敗，請稍後再試' : '拒絕失敗，請稍後再試');
            fetchFriendsData();
        }
    };

    const removeFriend = async (toUserId, friendName) => {
        if (!(await confirmDialog(`確定要將 ${friendName} 移除嗎？`, { danger: true }))) return;
        setFriends(prev => {
            const updated = prev.filter(f => f.user_id !== toUserId);
            try { localStorage.setItem(`friends_${userId}`, JSON.stringify(updated)); } catch (e) {}
            return updated;
        });
        try {
            await apiClient.post('/api/social/friends/remove', { user_id: userId, friend_id: toUserId });
            triggerToast('已移除好友');
        } catch (error) {
            /* 沒移除成功卻已經從清單消失，下次重開又冒出來 —— 直接重拉權威資料 */
            triggerToast('移除失敗，請稍後再試');
            fetchFriendsData();
        }
    };

    // ── Sticker gifting with actual API POST ──
    const sendStickers = async (targetFriend, stickerIds) => {
        if (!stickerIds || stickerIds.length === 0) return;
        const parsed = parseName(targetFriend?.name, targetFriend?.discriminator);
        triggerToast(`已送出 ${stickerIds.length} 張貼圖給 ${parsed.name}`);

        try {
            await apiClient.post('/api/social/stickers/send', {
                from_user_id: userId,
                to_user_id: targetFriend.user_id,
                sticker_ids: stickerIds,
                sent_at: new Date().toISOString(),
            });
        } catch (e) {
            /* 送不出去時仍寫進本機（下方），讓收件人在同一台裝置看得到；
               但也要說清楚沒有真的送到對方那裡，否則使用者以為送成功了。 */
            triggerToast('貼圖沒有送出去，對方目前收不到');
        }

        // Store in localStorage so the receiver can see stickers
        try {
            const receivedKey = `received_stickers_${targetFriend.user_id}`;
            const existing = JSON.parse(localStorage.getItem(receivedKey) || '[]');
            const newStickers = stickerIds.map(id => ({
                id: `sticker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                sticker_id: id,
                from_user_id: userId,
                from_name: userData.username,
                received_at: new Date().toISOString(),
                seen: false,
            }));
            localStorage.setItem(receivedKey, JSON.stringify([...newStickers, ...existing].slice(0, 50)));
        } catch (e) {}

        // 親密度：送貼紙也算互動，一樣寫進後端才會留下來
        try {
            await apiClient.patch('/api/social/friends/bond', {
                user_id: userId, friend_id: targetFriend.user_id, delta: stickerIds.length * 5,
            });
        } catch (err) {
            console.warn('親密度寫入失敗', err?.message || err);
        }
        setFriends(prev => prev.map(f => (
            f.user_id === targetFriend.user_id
                ? { ...f, bond_score: (f.bond_score || 0) + stickerIds.length * 5 }
                : f
        )));

        setGiftingTarget(null);
        setSelectedGifts([]);
    };

    // ── 送出一起練／對決，或直接開一間即時的房 ──
    const handleChallengeSend = async (targetUser, challengeInfo) => {
        const partnerName = parseName(targetUser?.name).name;

        /* 現在一起：不是寄邀請，是馬上開房並把對方拉進來。
           走 api_live_session，和非同步的 challenge 是兩條不同的路。 */
        if (challengeInfo.mode === 'live') {
            setChallengeTarget(null);
            try {
                await live.create({
                    type: challengeInfo.type,
                    title: challengeInfo.title,
                    goal: challengeInfo.goal,
                    unit: challengeInfo.unit,
                    inviteUserIds: [targetUser.user_id],
                });
                triggerToast(`房間開好了，等 ${partnerName} 進來`);
                setActiveTab('feed');
            } catch (err) {
                triggerToast(err?.response?.data?.detail || '開房失敗，請重試');
            }
            return;
        }

        /* 🩹 這裡原本先跳一則「已邀請 X」，再往下打 API；送失敗時
           使用者會同時看到「已邀請」和「沒有送出去」兩則相反的訊息。
           成敗只在真的知道結果之後說一次。 */
        setChallengeTarget(null);

        // Store pending collab in localStorage
        if (challengeInfo.mode === 'collaborate') {
            try {
                const pendingCollabs = JSON.parse(localStorage.getItem('pendingCollabs') || '[]');
                pendingCollabs.push({
                    collab_id: `collab_${Date.now()}`,
                    initiator_id: userId,
                    initiator_name: userData.username,
                    partner_id: targetUser.user_id,
                    partner_name: parseName(targetUser.name).name,
                    target_metric: challengeInfo.metric,
                    target_unit: challengeInfo.unit,
                    goal_type: challengeInfo.type,
                    title: challengeInfo.title || challengeInfo.type,
                    bond: challengeInfo.bond || 0,
                    created_at: new Date().toISOString(),
                    status: 'pending',
                });
                localStorage.setItem('pendingCollabs', JSON.stringify(pendingCollabs.slice(0, 20)));
            } catch (e) {}
        }

        /* 送邀請走 useTrainTogether.invite（同一支 hook 也負責收邀請、接受、回報進度）。
           這裡原本自己再打一次 /challenge/send，等於同一件事有兩條路：
           hook 的 invite() 從來沒被呼叫過（死碼），而這條路送完不會刷新邀請清單，
           送出去的邀請在自己畫面上看不到。合成一條之後兩個問題一起消失。 */
        try {
            await tt.invite({
                to_user_id: targetUser.user_id,
                type: challengeInfo.type,
                mode: challengeInfo.mode,
                title: challengeInfo.title,
                desc: challengeInfo.desc || '',
                metric: challengeInfo.metric,
                unit: challengeInfo.unit,
                bond: challengeInfo.bond || 50,
                preset_id: challengeInfo.id || null,
            });
        } catch (e) {
            /* ⚠️ 稽核前這裡只有 console.warn —— 使用者按下「送出一起練」之後
               畫面沒有任何反應，邀請其實沒送出去，他會以為對方不理他。
               和按讚失敗一樣：失敗就要說。 */
            console.warn('Challenge send failed:', e);
            triggerToast(e?.response?.data?.detail || '邀請沒有送出去，請確認網路後再試一次');
            return;
        }
        triggerToast(`已送出邀請給 ${parseName(targetUser.name).name}`);
    };

    // ── Long-press emoji explosion on friend cards (continuous) ──
    const triggerExplosion = useCallback((baseX, baseY) => {
        // Jitter each burst so overlapping explosions look distinct
        const x = baseX + (Math.random() * 50 - 25);
        const y = baseY + (Math.random() * 30 - 15);
        const id = `exp_${Date.now()}_${Math.random()}`;
        setExplosions(prev => [...prev, { id, x, y }]);
        if (window.navigator?.vibrate) window.navigator.vibrate(15);
    }, []);

    const removeExplosion = useCallback((id) => {
        setExplosions(prev => prev.filter(e => e.id !== id));
    }, []);

    // FriendCard is hoisted above SocialPage — see line ~958

    return (
        <div className="min-h-[100dvh] bg-[#F6F4F1] flex flex-col pb-4 font-sans text-[#161415] relative overflow-hidden" style={{ backgroundImage: dotGrid, backgroundSize: '16px 16px' }}>
            {/* 協作完成獲取動畫 */}
            <RewardUnlockAnimation reward={collabReward} onClose={() => setCollabReward(null)} />
            <BespokeAmbientGlow forceLightBg={true} />
            <div className="flex-1 max-w-[440px] mx-auto w-full h-full flex flex-col pt-16 relative z-10">
                {/* 鈦金屬細絲 (Titanium metal threads) */}
                <div className="absolute top-8 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-[#161415]/30 to-transparent"></div>
                <div className="absolute top-10 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-[#161415]/10 to-transparent"></div>

                <div className="px-6 pb-4 relative z-10">
                    <div className="flex justify-between items-end mb-8 border-b-[2px] border-[#161415]/10 pb-5">
                        <div>
                            {/* 「社群」只寫一次：以前上面還有一行小字「● 社群」，跟大標重複 */}
                            {/* 鈦金屬質感 (Titanium metal texture) + Tenor Sans
                                🎯 「社群名冊」→「社群」：名冊是內部說法，使用者只認得「社群」。
                                   單行大標更有瑞士編輯的乾淨感，也不再與右側搜尋鈕擠在一起。 */}
                            <h3 className="text-[52px] font-light italic leading-[0.9] uppercase text-transparent bg-clip-text"
                                style={{
                                    fontFamily: '"Tenor Sans", sans-serif',
                                    backgroundImage: 'linear-gradient(135deg, #161415 0%, #8A7E73 50%, #161415 100%)',
                                    filter: 'drop-shadow(0px 4px 12px rgba(0,0,0,0.08))'
                                }}>
                                社群
                            </h3>
                        </div>
                        {/* 🩹 進搜尋分頁「預設就亮出自己的 DRVN Identity 名片」—
                            舊版這裡 setShowMyId(false) 把設計好的名片藏死，要再點 QR 才看得到 */}
                        <motion.button {...pressProps('pill')} onClick={() => { setActiveTab('search'); setShowMyId(true); }}
 className={`w-12 h-12 rounded-full border border-black/5 shadow-[0_8px_20px_rgba(0,0,0,0.08)] flex items-center justify-center ${activeTab === 'search' ? 'bg-[#161415] text-white' : 'bg-white/80 backdrop-blur-md text-[#161415]'} relative overflow-hidden`}>
                            {/* 鈦金屬反光 */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent opacity-50 pointer-events-none" />
                            <Search size={18} strokeWidth={2.5} className="relative z-10" />
                        </motion.button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                        {['feed', 'leaderboard', 'friends', 'requests'].map(tab => (
                            <motion.button {...pressProps('icon')} key={tab} onClick={() => { setActiveTab(tab); setShowMyId(false); }}
 className={`px-5 py-2.5 rounded-full border border-black/5 text-[12px] font-bold tracking-widest whitespace-nowrap flex items-center gap-1.5 backdrop-blur-md ${activeTab === tab ? 'bg-[#161415] text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)]' : 'bg-white/60 text-[#161415]/60 hover:text-[#161415] hover:bg-white shadow-sm'}`}
 style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                {tab === 'feed' ? '動態'
                                 : tab === 'leaderboard' ? '排行'
                                 : tab === 'friends' ? '好友'
                                 : <span>邀請 {(requests.length + tt.inboxCount) > 0 && <span className="bg-[#F95C4B] text-white text-[11px] px-1.5 py-0.5 rounded-full ml-1">{requests.length + tt.inboxCount}</span>}</span>}
                            </motion.button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2 no-scrollbar relative">
                    {activeTab === 'feed' ? (
                        <>
                            {/* 「現在」永遠排在「最近」前面：
                                有人此刻在練 > 我進行中的約定 > 別人昨天跑了幾公里。 */}
                            {(live.invites.length > 0 || live.session || tt.active.length > 0) && (
                                <div className="px-6 pt-4">
                                    <LiveInviteBanner
                                        invites={live.invites}
                                        busy={joiningLive}
                                        onJoin={async (s) => {
                                            setJoiningLive(true);
                                            try {
                                                await live.join(s.session_id);
                                                triggerToast('加入了，開始練吧');
                                            } catch (e) {
                                                triggerToast(e?.response?.data?.detail || '加入失敗，請重試');
                                            } finally {
                                                setJoiningLive(false);
                                            }
                                        }}
                                    />
                                    <LivePanel
                                        session={live.session}
                                        onLeave={async () => {
                                            try { await live.leave(); triggerToast('已結束這一場'); }
                                            catch { triggerToast('結束失敗，請重試'); }
                                        }}
                                        onOpenWorkout={(s) => navigate(s.type === 'Lift' ? '/training-record-mobile' : '/cardio-tracker-mobile')}
                                    />
                                    {tt.active.length > 0 && (
                                        <>
                                            <p className="text-[12px] font-black text-[#161415]/45 mb-3">進行中</p>
                                            <AnimatePresence initial={false}>
                                                {tt.active.map(inv => (
                                                    <ActiveCard key={inv.id} invite={inv} />
                                                ))}
                                            </AnimatePresence>
                                        </>
                                    )}
                                </div>
                            )}
                            <FriendsFeedView
                                onPeekProfile={(uid) => setPeekingUser({ userId: uid, friendData: null })}
                                onFindFriends={() => setActiveTab('friends')}
                                onInvite={() => setActiveTab('friends')}
                            />
                        </>
                    ) : activeTab === 'leaderboard' ? (
                        <FriendsLeaderboard onPeekProfile={(uid) => setPeekingUser({ userId: uid, friendData: null })} onChallenge={(user) => setChallengeTarget(user)} userAvatar={userData.avatar} />
                    ) : activeTab === 'friends' ? (
                        <div className="space-y-4 pt-4 px-6">
                            {isLoading ? (
                                <div className="text-center py-12"><p className="text-[12px] font-black tracking-widest text-[#161415]/30 animate-pulse">載入名冊中…</p></div>
                            ) : friends.length === 0 ? (
                                <div className="text-center py-16 opacity-40">
                                    <Users size={32} className="mx-auto mb-4 text-[#161415]" />
                                    <p className="text-[18px] font-black uppercase tracking-widest italic text-[#161415]">還沒有隊友</p>
                                    <p className="text-[11px] text-[#161415]/60 mt-2 font-medium">搜尋並加入跑者，建立你的名冊。</p>
                                </div>
                            ) : (
                                friends.map(f => (
                                    <FriendCard
                                        key={f.user_id}
                                        f={f}
                                        userId={userId}
                                        onPeek={setPeekingUser}
                                        onChallenge={setChallengeTarget}
                                        onGift={(friend) => { setGiftingTarget(friend); setSelectedGifts([]); }}
                                        onRemove={removeFriend}
                                        onExplosion={triggerExplosion}
                                    />
                                ))
                            )}
                        </div>
                    ) : activeTab === 'requests' ? (
                        <div className="space-y-4 pt-4 px-6">
                            {/* 🤝 一起練的邀請 —— 這一段原本完全不存在：
                                後端 /api/social/challenge/respond 沒有任何前端呼叫，
                                所以邀請寄出去對方永遠看不到，也永遠無法接受。 */}
                            {tt.inbox.length > 0 && (
                                <div>
                                    <p className="text-[12px] font-black text-[#161415]/45 mb-3">一起練</p>
                                    <AnimatePresence initial={false}>
                                        {tt.inbox.map(inv => (
                                            <InviteCard
                                                key={inv.id}
                                                invite={inv}
                                                busy={tt.busyId === inv.id}
                                                onAccept={async (i) => {
                                                    try {
                                                        await tt.respond(i.id, 'accept');
                                                        triggerToast(`和 ${i.otherName} 的${i.mode.label}開始了`);
                                                    } catch (e) {
                                                        triggerToast(e?.response?.status === 400 ? '這筆邀請已經被處理過了' : '接受失敗，請重試');
                                                    }
                                                }}
                                                onDecline={async (i) => {
                                                    try {
                                                        await tt.respond(i.id, 'decline');
                                                        triggerToast('已婉拒');
                                                    } catch {
                                                        triggerToast('操作失敗，請重試');
                                                    }
                                                }}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}

                            {requests.length > 0 && tt.inbox.length > 0 && (
                                <p className="text-[12px] font-black text-[#161415]/45 pt-2">好友邀請</p>
                            )}

                            {requests.length === 0 && tt.inbox.length === 0 ? (
                                <div className="text-center py-16">
                                    <p className="text-[18px] font-black text-[#161415]/50">目前沒有邀請</p>
                                    <p className="text-[13px] text-[#161415]/40 mt-2">別人邀你一起練或加好友時，會出現在這裡。</p>
                                </div>
                            ) : (
                                requests.map(req => {
                                    const parsed = parseName(req.from_user?.name, req.from_user?.discriminator);
                                    return (
                                        <div key={req.request_id} className="flex items-center gap-4 bg-white p-4 border-2 border-[#161415] shadow-[4px_4px_0px_#161415]">
                                            <div className="w-12 h-12 bg-[#161415] text-white flex items-center justify-center font-black italic border-2 border-[#161415] flex-shrink-0">
                                                {resolveAvatarUrl(req.from_user?.avatar) ? <img loading="lazy" decoding="async" src={resolveAvatarUrl(req.from_user.avatar)} className="w-full h-full object-cover" alt="" /> : parsed.name.charAt(0)}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[16px] font-black uppercase tracking-widest leading-none mb-1 text-[#161415]">{parsed.name}</p>
                                                <p className="text-[12px] font-black tracking-widest text-[#161415]/40">想加你為好友</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <motion.button {...pressProps('row')} onClick={() => respondRequest(req.request_id, 'accept', req)} className="px-4 py-2 bg-[#161415] text-white border-2 border-[#161415] text-[12px] font-black tracking-widest hover:bg-[#F95C4B] transition-colors">接受</motion.button>
                                                <motion.button {...pressProps('row')} onClick={() => respondRequest(req.request_id, 'decline', req)} className="px-4 py-2 border-2 border-[#161415] text-[#161415] text-[9px] font-black uppercase tracking-widest hover:bg-[#D94030] hover:text-white transition-colors">✕</motion.button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        // Search tab — 🩹 底部留出導航列高度，名片/結果可完整捲到底
                        <div className="space-y-8 pt-4 px-6" style={{ paddingBottom: 160 }}>
                            <div className="flex items-end border-b-4 border-[#161415] pb-2 transition-all focus-within:border-[#F95C4B]">
                                <Search size={24} strokeWidth={3} className="text-[#161415] mr-4 mb-1" />
                                <input
                                    type="text" placeholder="輸入好友碼" value={searchQuery}
                                    // 打字時收起名片專心看結果；清空搜尋 → 名片自動回來
                                    onChange={(e) => { setSearchQuery(e.target.value); setShowMyId(!e.target.value); }}
                                    className="flex-1 bg-transparent outline-none text-[24px] font-black uppercase tracking-tighter placeholder:text-[#161415]/20 italic"
                                />
                                <motion.button {...pressProps('row')} onClick={() => setShowMyId(!showMyId)} className={`ml-4 p-2 transition-colors ${showMyId ? 'text-[#F95C4B]' : 'text-[#161415]/40 hover:text-[#161415]'}`}>
                                    <QrCode size={24} strokeWidth={2} />
                                </motion.button>
                            </div>
                                <div className="pt-4">
                                    {showMyId ? (
                                        <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }} className="flex justify-center mb-8 relative">
                                            {/* ── CORAL AMBIENT GLOW ── */}
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-[#F95C4B] blur-[40px] opacity-30 rounded-[28px] pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />

                                            {/* ── BESPOKE NAMEPLATE CARD ── */}
                                            <div className="w-full max-w-[320px] relative p-8 rounded-[24px] border border-white/15 shadow-[0_0_20px_rgba(249,92,75,0.15),0_24px_50px_rgba(0,0,0,0.4)] overflow-hidden">
                                                {/* Metallic background base */}
                                                <div className="absolute inset-0 bg-[#161415]" />
                                                {/* Subtle metallic gradient & lighting with slight coral tint */}
                                                <div className="absolute inset-0 bg-gradient-to-br from-[#262523] via-transparent to-[#F95C4B]/10 opacity-60 pointer-events-none" />
                                                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F95C4B]/40 to-transparent pointer-events-none" />
                                            
                                            <div className="relative z-10 flex flex-col items-center text-center pt-2">
                                                {/* Top small label */}
                                                <div className="flex items-center gap-3 mb-8">
                                                    <div className="h-px w-8 bg-white/20" />
                                                    <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-white/40" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>DRVN Identity</p>
                                                    <div className="h-px w-8 bg-white/20" />
                                                </div>
                                                
                                                {/* Avatar (Polished Circular Frame) */}
                                                <div className="w-[88px] h-[88px] rounded-full overflow-hidden border-[1.5px] border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] mb-6 bg-[#161415] flex items-center justify-center relative ring-4 ring-[#161415]">
                                                    {/* Internal reflection */}
                                                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none z-10" />
                                                    {resolveAvatarUrl(userData.avatar)
                                                        ? <img loading="lazy" decoding="async" src={resolveAvatarUrl(userData.avatar)} className="w-full h-full object-cover relative z-0" alt="" />
                                                        : <span className="text-[32px] font-light italic text-white/80 relative z-0" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{userData.username.charAt(0)}</span>
                                                    }
                                                </div>

                                                {/* Name and ID */}
                                                <h3 className="text-[28px] font-light text-white tracking-[0.15em] uppercase mb-1 leading-none" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                    {userData.username}
                                                </h3>
                                                {/* 終極保險：把 ID 文字本身設成可選取 */}
                                                <p 
                                                    className="text-[12px] font-light text-[#F95C4B] tracking-[0.4em] uppercase mb-10 cursor-text" 
                                                    style={{ 
                                                        fontFamily: '"Tenor Sans", sans-serif',
                                                        userSelect: 'text',
                                                        WebkitUserSelect: 'text',
                                                        WebkitTouchCallout: 'default',
                                                    }}
                                                >
                                                    #{userData.discriminator}
                                                </p>

                                                {/* Copy Button */}
                                                <motion.button {...pressProps('cta')}
 type="button"
 onPointerDown={handleCopyId}
 onClick={handleCopyId}
 className={`w-full py-4 rounded-full flex items-center justify-center gap-3 text-[9px] font-bold uppercase tracking-[0.3em] border touch-manipulation ${
 isCopied
 ? 'bg-[#F95C4B] border-[#F95C4B] text-white shadow-[0_0_20px_rgba(249,92,75,0.4)]'
 : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/10 hover:border-white/30 hover:text-white backdrop-blur-md shadow-[0_4px_15px_rgba(0,0,0,0.2)]'
 }`}
 style={{ fontFamily: '"Tenor Sans", sans-serif' }}
 >
                                                    {isCopied
                                                        ? <><Check size={14} /> 已複製</>
                                                        : <><UserPlus size={14} /> 複製 ID</>
                                                    }
                                                </motion.button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : isSearching ? (
                                    <div className="text-center py-12"><p className="text-[9px] font-black tracking-[0.06em] uppercase text-[#161415]/40 animate-pulse">搜尋中…</p></div>
                                ) : searchResults.length > 0 ? (
                                    <div className="space-y-0 border-t-2 border-[#161415]">
                                        {searchResults.map(u => {
                                            const parsed = parseName(u.name, u.discriminator);
                                            const isMe = u.user_id === userId;
                                            return (
                                                <div key={u.user_id} className="flex items-center gap-4 py-4 border-b-2 border-[#161415]">
                                                    <div className="w-12 h-12 bg-[#161415] text-white flex items-center justify-center font-black italic border-2 border-[#161415] shrink-0 overflow-hidden">
                                                        {resolveAvatarUrl(u.avatar || (isMe ? userData.avatar : null)) ? <img loading="lazy" decoding="async" src={resolveAvatarUrl(u.avatar || userData.avatar)} className="w-full h-full object-cover" alt="" /> : parsed.name.charAt(0)}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-[18px] font-black uppercase tracking-widest leading-none mb-1 flex items-center flex-wrap gap-2">
                                                            {parsed.name} <span className="text-[11px] italic text-[#161415]/40">#{parsed.disc}</span>
                                                            {isMe && <span className="text-[9px] font-black uppercase tracking-widest text-[#161415] bg-[#F95C4B] px-1.5 py-0.5 border border-[#161415]">你</span>}
                                                        </p>
                                                    </div>
                                                    {!isMe ? (
                                                        <motion.button {...pressProps('row')} onClick={() => sendRequest(u.user_id)} className="px-5 py-2.5 bg-[#161415] text-white text-[9px] font-black uppercase tracking-widest shadow-[4px_4px_0px_#F95C4B] border-2 border-[#161415] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none">加好友</motion.button>
                                                    ) : (
                                                        <div className="px-5 py-2.5 bg-[#161415]/5 text-[#161415]/30 text-[9px] font-black uppercase tracking-widest border border-[#161415]/10">已是好友</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : searchQuery.length > 0 ? (
                                    <div className="text-center py-12">
                                        <p className="text-[16px] font-black tracking-tighter text-[#161415]/40">找不到「{searchQuery}」</p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Portals & Overlays */}
            {/* 點一個人 → 先跳個人資料預覽（自介、稱號、社團、貼紙）；要看整頁再從預覽進去 */}
            <ProfilePreviewSheet
                open={!!peekingUser && !peekFull}
                userId={peekingUser?.userId}
                seed={peekingUser?.friendData ? {
                    name: peekingUser.friendData.name,
                    discriminator: peekingUser.friendData.discriminator,
                    avatar: peekingUser.friendData.avatar,
                    bio: peekingUser.friendData.bio,
                    tag: peekingUser.friendData.tag,
                    city: peekingUser.friendData.city,
                } : null}
                onClose={() => setPeekingUser(null)}
                onOpenFull={() => setPeekFull(true)}
            />
            <AnimatePresence>
                {peekingUser && peekFull && (
                    <ProfilePeeker
                        userId={peekingUser.userId}
                        friendData={peekingUser.friendData}
                        onClose={() => { setPeekFull(false); setPeekingUser(null); }}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {challengeTarget && (
                    <ChallengeSheet
                        targetUser={challengeTarget}
                        onClose={() => setChallengeTarget(null)}
                        onSend={(info) => handleChallengeSend(challengeTarget, info)}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {giftingTarget && (
                    <StickerGallery
                        onClose={() => { setGiftingTarget(null); setSelectedGifts([]); }}
                        onSelect={(stickerId) => {
                            setSelectedGifts(prev =>
                                prev.includes(stickerId) ? prev.filter(id => id !== stickerId) : [...prev, stickerId]
                            );
                        }}
                        onSave={() => sendStickers(giftingTarget, selectedGifts)}
                        activeStickers={selectedGifts}
                        actionText={`Send ${selectedGifts.length > 0 ? `(${selectedGifts.length})` : ''} Gift`}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {toastMsg && <Toast message={toastMsg} />}
            </AnimatePresence>
            {explosions.map(exp => (
                <EmojiExplosion
                    key={exp.id}
                    id={exp.id}
                    x={exp.x}
                    y={exp.y}
                    onDone={removeExplosion}
                />
            ))}

            <div className="fixed bottom-0 left-0 right-0 z-50"><MobileNavigation /></div>
        </div>
    );
};

export default SocialPage;
