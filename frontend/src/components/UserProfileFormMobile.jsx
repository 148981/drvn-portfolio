import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { resetOnboarding } from '../utils/onboardingState';
import { ONBOARDING_EVENT } from './OnboardingSpotlight';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Heart, Scale, Settings, Zap, TrendingUp, Award, Activity, MapPin, Edit3, Grid, List, ChevronDown, X, Camera, UserPlus, Users, Timer, Trophy, Star, Check, ChevronRight, Eye, Image, Share, Plus, Power, MessageCircle, Trash2, MoreVertical, Sparkles, Bell, HelpCircle, FileText, Shield, Download, Search } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import LegalSheet from './LegalSheet';
import { getUserId, resolveDisplayName } from '../utils/auth';
import apiClient from '../api/client';
import { API_BASE_URL } from '../config/api';
import { getReminderSettings, saveReminderSettings, requestNotificationPermission } from '../utils/workoutReminders';
import { getChartPreference, setChartPreference, advancedChartsBySystem } from '../utils/advancedCharts';
import { useMembership, openPaywall, openManageSubscriptions } from '../utils/membership';
import PremierMemberCard from './PremierMemberCard';
import IdentityTitlePicker from './IdentityTitlePicker';
import ProfilePreviewSheet from './ProfilePreviewSheet';
import { useFeaturedTitle } from '../utils/featuredTitle';
import { uStorage } from '../utils/userStorage';
import { getSocialPosts, deleteSocialPost, addSocialPost } from '../utils/socialPostsStore';
import { useLanguage } from '../contexts/LanguageContext';
import StickerGallery, { STICKER_TEMPLATES } from './StickerGallery';
import { createPortal } from 'react-dom';
import MobileNavigation from './MobileNavigation';
import GrowthAchievementSystem, { ProfileAchievementView } from './GrowthAchievementSystem';
import PowerPRTrackerMobile from './PowerPRTrackerMobile';
import AuraAvatar from './AuraAvatar';
import { getUserXPAndTitle } from '../utils/growthAchievements';
import { getFollowing, followUser, unfollowUser } from '../utils/socialDataConnector';
// 追蹤/粉絲/好友的單一真相源（見 utils/followGraph.js 的名詞定義）
import { getGraphLocal, fetchGraph, RELATION_LABEL, relationIn } from '../utils/followGraph';
// UI 無 emoji（Definition §6.3）— 頭像／徽章一律用 lucide 線性圖示
import { AVATAR_ICONS, Ico } from '../utils/drvnIcons';
import IGPostComposer from './IGPostComposer';
import { RunCard } from './SocialHubMobile';
import { DataStatCard } from './PostBodyCards';
import { FeatureCard, PeakCard, ReportCard } from './FitnessCardComponents';
import { RunningFeatureCard, RunningApexCard, RunningPhysioCard } from './RunningCardComponents';
// 🗑 FriendsSheet（舊底部彈窗名冊）已刪除 — 好友功能統一走 /friends-mobile 完整頁
import { toast, confirmDialog } from '../utils/toast';
import { haptic } from '../utils/haptics';
import { HOME_CARDS, HOME_CARDS_EVENT, getHiddenHomeCards, restoreHomeCard } from '../config/homeCards';
import { toLocalDateKey } from '../utils/localDate';
import { syncUserScope } from '../utils/userScopedStorage';
import { calcBMR_MifflinStJeor, calcTDEE } from '../utils/NutritionEngine';


const FontStyle = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,200;1,300;1,400;1,500;1,600;1,700;1,800&family=Tenor+Sans&display=swap');
        * {
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        h1, h2, h3, h4, .brand-font {
            font-family: 'Tenor Sans', sans-serif !important;
        }
    `}</style>
);

const PortalSheet = ({ children }) => createPortal(<div style={{ position: 'relative', zIndex: 100100 }}>{children}</div>, document.body);

/* ═══ COLORS — Morandi Palette ═══ */
const P = {
    bg: '#F6F4F1',
    card: 'rgba(255,255,255,0.72)',
    glass: 'rgba(255,255,255,0.5)',
    text: '#161415',
    sub: '#8A7E73',
    accent: '#F95C4B',
    sage: '#8FA87A',
    gold: '#D4A843',
    olive: '#515739',
    highlight: '#5E7A4B',
    cream: '#F6F4F1',
};

const DEFAULT_PROFILE_AVATAR = '/desktop/profile1.PNG';
const BUILTIN_AVATARS = [
    '/desktop/profile1.PNG',
    '/desktop/profile2.PNG',
    '/desktop/profile3.PNG',
    '/desktop/profile4.PNG',
    '/desktop/profile5.PNG',
    '/desktop/profile6.PNG'
];
const PROFILE_EMOJI_AVATARS = ['🏃', '🏋️', '💪', '🔥', '⚡', '🧘', '🚴', '🌙'];
const MISTY_AVATAR_BG = 'radial-gradient(circle at 28% 22%, #FAFAF7 0%, #E7E8E4 42%, #CED2CF 100%)';
const isImageAvatar = (avatar) => typeof avatar === 'string' && /^(https?:|data:|blob:|\/)/.test(avatar);

const ProfileAvatarVisual = ({ avatar, imgClassName = 'w-full h-full object-cover rounded-full', emojiClassName = 'text-[42px]' }) => {
    const value = avatar || DEFAULT_PROFILE_AVATAR;
    if (isImageAvatar(value)) {
        return <img loading="lazy" decoding="async" src={value} alt="Avatar" className={imgClassName} />;
    }
    // 新格式 icon:<id> → lucide 線性圖示（Definition §6.3）
    if (typeof value === 'string' && value.startsWith('icon:')) {
        const found = AVATAR_ICONS.find(a => a.id === value.slice(5));
        const Icon = found?.Icon;
        if (Icon) {
            // 圖示尺寸跟著容器走：emojiClassName 帶的字級是視覺基準
            const px = parseInt(String(emojiClassName).match(/\[(\d+)px\]/)?.[1] || '28', 10);
            return (
                <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: MISTY_AVATAR_BG }}>
                    <Icon size={px} strokeWidth={1.6} color="#161415" />
                </div>
            );
        }
    }
    // 舊資料仍是 emoji 字串 → 照舊渲染，不讓既有使用者的頭像消失
    return (
        <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: MISTY_AVATAR_BG }}>
            <span className={emojiClassName} style={{ filter: 'drop-shadow(0 8px 14px rgba(22,20,21,0.14))' }}>{value}</span>
        </div>
    );
};

/* ═══ MOCK ACTIVITY GRID — previous workouts for the IG photo grid ═══ */
const MOCK_GRID = [];

/* ═══ ACHIEVEMENT BADGES ═══ */
const BADGES = [
    { id: 'b1', icon: '🏃', label: '10K 完賽', unlocked: true },
    { id: 'b2', icon: '🏋️', label: '硬舉 100kg', unlocked: true },
    { id: 'b3', icon: '🔥', label: '連續 7 天', unlocked: true },
    { id: 'b4', icon: '🏅', label: '半馬完賽', unlocked: true },
    { id: 'b5', icon: '💎', label: '深蹲 100kg', unlocked: true },
    { id: 'b6', icon: '🌟', label: '月跑 100km', unlocked: false },
    { id: 'b7', icon: '👑', label: '全馬完賽', unlocked: false },
    { id: 'b8', icon: '⚡', label: '硬舉 200kg', unlocked: false },
];

/* ═══ DETAIL SHEET — IG / Community Post Style ═══ */
/* 🎯 支援兩種貼文：MOCK 靜態貼文 + localStorage 真實 Native Hydration 貼文 */
const DetailSheet = ({ item, onClose, userProfile, onDelete, onUpdate }) => {
    // hooks 必須無條件呼叫，提早 return 放最後（修正 rules-of-hooks）
    const [isEditing, setIsEditing] = useState(false);
    const [editCaption, setEditCaption] = useState(item?.caption || item?.detail || '');

    if (!item) return null;

    const isRun = item.type === 'run';
    const accent = isRun ? '#F95C4B' : '#FFF';

    // 🎯 判斷是否為 Native Hydration 貼文（從 localStorage 來的真實貼文）
    const drvn = item.drvnCard || null;
    const canHydrate = Boolean(drvn && drvn.layout);

    // 把 profile 的 item + 作者資料，組成 Feed RunCard 期望的 post 形狀 → 兩邊畫面/資料完全一致
    const authorName = userProfile?.name || userProfile?.displayName || 'User';
    const feedPost = {
        id: item.id,
        uId: userProfile?.id || userProfile?.user_id,
        userName: authorName,
        init: (authorName && authorName[0]) || 'U',
        type: item.type === 'run' ? 'run' : (item.type === 'fitness' || item.type === 'strength' ? 'fitness' : 'post'),
        activity_type: item.type === 'run' ? 'run' : (item.type === 'fitness' || item.type === 'strength' ? 'fitness' : 'post'),
        // 🗓️ 日期防呆：多個來源依序 fallback，最後才用當下，避免顯示 invalid date / NaN
        createdAt: item.createdAt || item.created_at || item.date || item.timestamp
            || item.session_data?.drvnCard?.dateIso || item.drvnCard?.dateIso || new Date().toISOString(),
        caption: item.caption || item.detail || '',
        title: item.title || null,
        photo: item.photo || null,
        routeImg: item.photo || null,
        meetup: item.meetup || null,
        drvnCard: drvn,
        // 🔢 數據防呆：優先讀真實 stats（發文時已帶），沒有才退回舊欄位 → 不再全是 0
        stats: item.type === 'run'
            ? { distance: Number(item.stats?.distance ?? item.dist) || 0, pace: Number(item.stats?.pace) || 0, duration: Number(item.stats?.duration) || 0 }
            : (item.type === 'fitness' || item.type === 'strength'
                ? { ...(item.stats || {}), volume: Number(item.stats?.volume ?? item.stats?.volume_kg ?? item.vol) || 0 }
                : null),
        metrics: item.metrics || null,
        kudos: item.kudos || 0,
        commentCount: item.commentCount || 0,
        myKudo: false,
        orientation: item.orientation || 'portrait',
        imgPos: item.imgPos ?? 50,
        raw: { activity_type: item.type === 'run' ? 'run' : (item.type === 'fitness' || item.type === 'strength' ? 'fitness' : 'post'), drvnCard: drvn, photo_url: item.photo, session_data: item.session_data },
    };

    const handleUpdate = () => {
        onUpdate(item.id, editCaption);
        setIsEditing(false);
    };

    // 🎯 Native Hydration 渲染器（與 FitnessCommunityPage 完全相同的架構）
    const renderHydratedCard = () => {
        // 與 Feed RunCard 完全相同的有效寬度與圓角容器 → 照片+數據卡叠放位置一致
        const containerWidth = Math.min(window.innerWidth, 440) - 56;
        const editorW = drvn.editorWidth || 390;
        const editorH = drvn.editorHeight || Math.round(editorW * 4 / 3);
        const scale = containerWidth / editorW;
        const cardState = (drvn.cardStates && drvn.cardStates[drvn.layout]) || { x: 0, y: 0, scale: 1, opacity: 100 };

        return (
            <div style={{
                position: 'relative', width: containerWidth, margin: '0 auto',
                height: containerWidth * (editorH / editorW),
                backgroundColor: '#0A0A0A', overflow: 'hidden',
                borderRadius: 28, boxShadow: '0 8px 30px rgba(0,0,0,0.1)'
            }}>
                {/* Dynamic Scaler：自動適配編輯器座標 → 當前顯示寬度 */}
                <div style={{
                    position: 'absolute', top: 0, left: 0,
                    width: editorW, height: editorH,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    pointerEvents: 'none'
                }}>
                    {/* Background */}
                    {drvn.customImage ? (
                        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${drvn.customImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    ) : (
                        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 30% 30%, #F95C4B18 0%, transparent 60%)` }} />
                    )}
                    {drvn.layout === 'POSTER' && drvn.customImage && (
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.6) 100%)' }} />
                    )}
                    <div style={{ position: 'absolute', inset: 0, background: drvn.customImage ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)' }} />

                    {/* Flex-center: 與 CardEditor 相同佈局 */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{
                            position: 'relative',
                            transform: `translate(${cardState.x}px, ${cardState.y}px)`,
                            willChange: 'transform',
                            width: drvn.layout === 'POSTER' ? editorW : 'auto',
                            height: drvn.layout === 'POSTER' ? editorH : 'auto',
                        }}>
                            <div style={{ transform: `scale(${cardState.scale})`, transformOrigin: 'center' }}>
                                {/* ── 健身卡牌 ── */}
                                {!isRun && ['POSTER', 'FEATURE'].includes(drvn.layout?.toUpperCase()) && (
                                    <FeatureCard
                                        showDataOnly={true}
                                        bgOpacity={cardState.opacity}
                                        processedExercises={drvn.processedExercises || []}
                                        prExercises={drvn.prExercises || []}
                                        avgEffort={drvn.avgEffort || 0}
                                        totalVolume={drvn.totalVolume || 0}
                                        durationSeconds={drvn.durationSeconds || 0}
                                        calories={drvn.calories || 0}
                                        heartRate={drvn.heartRate || 135}
                                        completedDate={drvn.completedDate ? new Date(drvn.completedDate) : new Date()}
                                    />
                                )}
                                {!isRun && ['PR', 'PEAK', 'APEX'].includes(drvn.layout?.toUpperCase()) && (
                                    <PeakCard
                                        featuredPR={drvn.featuredPR || { name: 'Workout', weight: 0 }}
                                        isNewRecord={drvn.isNewRecord || false}
                                        bgOpacity={cardState.opacity}
                                    />
                                )}
                                {!isRun && ['MINIMAL', 'REPORT', 'PHYSIO'].includes(drvn.layout?.toUpperCase()) && (
                                    <ReportCard
                                        processedExercises={drvn.processedExercises || []}
                                        calories={drvn.calories || 0}
                                        bgOpacity={cardState.opacity}
                                    />
                                )}
                                {/* ── 跑步卡牌 ── */}
                                {isRun && ['POSTER', 'FEATURE'].includes(drvn.layout?.toUpperCase()) && (
                                    <RunningFeatureCard data={drvn} bgOpacity={cardState.opacity ?? 35} />
                                )}
                                {isRun && ['PEAK', 'PR', 'APEX'].includes(drvn.layout?.toUpperCase()) && (
                                    <RunningApexCard data={drvn} bgOpacity={cardState.opacity ?? 85} />
                                )}
                                {isRun && ['REPORT', 'MINIMAL', 'PHYSIO'].includes(drvn.layout?.toUpperCase()) && (
                                    <RunningPhysioCard data={drvn} bgOpacity={cardState.opacity ?? 90} />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // 貼文靜態渲染：有照片 → 照片為主（對齊 Feed）；無照片 → 共用瑞士數據卡
    const renderLegacyCard = () => {
        const cw = Math.min(window.innerWidth, 440) - 56;
        if (item.photo) {
            return (
                <div style={{ width: cw, margin: '0 auto', aspectRatio: '4/5', borderRadius: 28, overflow: 'hidden', background: '#161415', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}>
                    <img loading="lazy" decoding="async" src={item.photo} alt={item.caption || 'post'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            );
        }
        // 無照片 → 瑞士極簡數據卡（與 Feed / composer 共用）
        const rows = isRun
            ? [item.pace && ['配速', `${item.pace} /公里`], item.dur && ['時間', item.dur]].filter(Boolean)
            : [item.vol && ['總量', `${(item.vol / 1000).toFixed(1)} 噸`], item.exercise && ['主項', item.exercise]].filter(Boolean);
        return (
            <div style={{ width: cw, margin: '0 auto' }}>
                <DataStatCard
                    type={isRun ? 'run' : 'fitness'}
                    bigValue={isRun ? item.dist : (item.weight?.split('kg')[0] || item.stat?.replace(' KG', '') || 0)}
                    bigUnit={isRun ? 'km' : 'kg'}
                    label={isRun ? '總距離' : '最大重量'}
                    date={item.date}
                    rows={rows}
                />
            </div>
        );
    };

    return createPortal(
        <>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100001] bg-black/80 backdrop-blur-md"
                onClick={onClose}
            />

            <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 z-[100001] max-w-[440px] mx-auto h-[88dvh] flex flex-col"
            >
                {/* 1. 浮動控制列（編輯 / 刪除 / 關閉）— 不再用框，直接浮在貼文卡上方 */}
                <div className="flex items-center justify-end gap-1 px-4 py-3 flex-shrink-0">
                    <motion.button {...pressProps('icon')}
 onClick={() => setIsEditing(!isEditing)}
 className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isEditing ? 'text-[#F95C4B] bg-white/80' : 'text-[#161415] bg-white/70 hover:bg-white'}`}
 >
                        <Edit3 size={18} />
                    </motion.button>
                    <motion.button {...pressProps('icon')}
 onClick={async () => {
 if ((await confirmDialog('確定要刪除這篇貼文嗎？', { danger: true }))) { onDelete(item.id); }
 }}
 className="w-9 h-9 rounded-full flex items-center justify-center text-[#161415] bg-white/70 hover:bg-white hover:text-red-500 transition-colors"
 >
                        <Trash2 size={18} />
                    </motion.button>
                    <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-[#161415] bg-white/70 hover:bg-white transition-colors">
                        <X size={20} />
                    </motion.button>
                </div>

                {/* 2. 貼文卡 — 就是 Feed 那張（含自己的黑色玻璃外框與作者 header），等比例完整呈現 */}
                <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                    <div style={{ padding: '0 12px' }}><RunCard post={feedPost} index={0} surface="card" /></div>

                    {/* 編輯心得（profile 專屬，僅編輯時顯示） */}
                    {isEditing && (
                        <div className="px-5 pb-5 space-y-3">
                            <textarea
                                value={editCaption}
                                onChange={(e) => setEditCaption(e.target.value)}
                                className="w-full bg-black/10 rounded-[18px] p-4 text-[14px] text-[#F6F4F1] outline-none border border-white/10 resize-none h-24"
                                placeholder="修改你的訓練心得..."
                            />
                            <div className="flex gap-2">
                                <motion.button {...pressProps('cta')} onClick={handleUpdate} className="flex-1 py-3 bg-[#F95C4B] text-white rounded-xl text-[13px] font-black uppercase tracking-widest">儲存修改</motion.button>
                                <motion.button {...pressProps('row')} onClick={() => setIsEditing(false)} className="px-6 py-3 bg-white/10 text-[#F6F4F1] rounded-xl text-[13px] font-black uppercase tracking-widest">取消</motion.button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </>,
        document.body
    );
};

/* ═══ EDIT PROFILE SHEET ═══ */
// 📍 城市自動偵測：GPS 座標 → 最近的台灣縣市（離線查表，不需外部 API）
const TAIWAN_CITIES = [
    ['台北市', 25.033, 121.565], ['新北市', 25.012, 121.465], ['桃園市', 24.994, 121.301],
    ['台中市', 24.148, 120.674], ['台南市', 22.999, 120.227], ['高雄市', 22.627, 120.301],
    ['基隆市', 25.128, 121.742], ['新竹市', 24.804, 120.971], ['新竹縣', 24.839, 121.004],
    ['苗栗縣', 24.560, 120.821], ['彰化縣', 24.052, 120.516], ['南投縣', 23.961, 120.972],
    ['雲林縣', 23.709, 120.431], ['嘉義市', 23.480, 120.449], ['嘉義縣', 23.452, 120.256],
    ['屏東縣', 22.552, 120.549], ['宜蘭縣', 24.702, 121.738], ['花蓮縣', 23.987, 121.601],
    ['台東縣', 22.758, 121.144], ['澎湖縣', 23.571, 119.579], ['金門縣', 24.437, 118.318],
    ['連江縣', 26.160, 119.951],
];
const nearestTaiwanCity = (lat, lng) => {
    let best = null, bestD = Infinity;
    for (const [name, cLat, cLng] of TAIWAN_CITIES) {
        const d = (lat - cLat) ** 2 + (lng - cLng) ** 2;
        if (d < bestD) { bestD = d; best = name; }
    }
    return best;
};

const EditProfileSheet = ({ profile, onSave, onClose }) => {
    const [data, setData] = useState(profile);
    const [detectingCity, setDetectingCity] = useState(false);

    const detectCity = React.useCallback((silent = false) => {
        if (!navigator.geolocation) return;
        setDetectingCity(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const city = nearestTaiwanCity(pos.coords.latitude, pos.coords.longitude);
                if (city) setData(d => ({ ...d, city }));
                setDetectingCity(false);
            },
            () => { setDetectingCity(false); if (!silent) { /* 使用者拒絕定位，保持手動輸入 */ } },
            { timeout: 8000, maximumAge: 600000 }
        );
    }, []);

    // 打開編輯頁時，若尚未填城市 → 自動偵測一次
    useEffect(() => {
        if (!profile?.city) detectCity(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return createPortal(
        <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100001] bg-black/80 backdrop-blur-md" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[100001] max-w-[440px] mx-auto">
                {/* 🎯 Swiss-Noir Luxury Editorial Aesthetic */}
                <div style={{ background: '#F6F4F1', borderRadius: '36px 40px 0 0', maxHeight: '92dvh', display: 'flex', flexDirection: 'column', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', boxShadow: '0 -20px 60px rgba(0,0,0,0.3)', border: '1px solid rgba(22,20,21,0.1)' }}>

                    {/* Header: Editorial Style */}
                    <div className="px-8 pt-8 pb-6 flex justify-between items-baseline border-b border-[#161415]/10">
                        <div>
                            <h3 className="text-[28px] font-normal leading-none" style={{ fontFamily: "'Tenor Sans', sans-serif", color: '#161415' }}>Edit Profile.</h3>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#161415]/40 mt-2">Identity & Biometrics</p>
                        </div>
                        <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="w-10 h-10 rounded-full bg-[#161415]/5 hover:bg-[#161415]/10 flex items-center justify-center "><X size={20} /></motion.button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 no-scrollbar">

                        {/* Avatar Edit Section: Minimalist & Clean */}
                        <div className="flex flex-col items-center py-2">
                            <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-input').click()}>
                                <input id="avatar-input" type="file" accept="image/*" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => setData(d => ({ ...d, avatar: ev.target.result }));
                                        reader.readAsDataURL(file);
                                    }
                                }} />
                                <div className="w-28 h-28 rounded-full overflow-hidden border-[1px] border-[#161415]/20 shadow-2xl p-1 bg-[#E8E9E6]">
                                    <ProfileAvatarVisual avatar={data.avatar} />
                                </div>
                                <div className="absolute inset-1 rounded-full bg-[#161415]/40 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                                    <Camera size={24} color="white" strokeWidth={1.5} />
                                </div>
                            </div>
                            <p className="text-[11px] font-black text-[#F95C4B] mt-4 uppercase tracking-[0.25em] border-b border-[#F95C4B]/30 pb-0.5">Change Avatar</p>
                            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-[270px]">
                                {BUILTIN_AVATARS.map(avatarImg => {
                                    const active = (data.avatar || DEFAULT_PROFILE_AVATAR) === avatarImg;
                                    return (
                                        <motion.button {...pressProps('pill')}
 key={avatarImg}
 type="button"
 aria-label="Use avatar"
 onClick={() => setData(d => ({ ...d, avatar: avatarImg }))}
 className="w-10 h-10 rounded-full overflow-hidden border "
 style={{
 backgroundColor: '#E8E9E6',
 borderColor: active ? '#F95C4B' : 'rgba(22,20,21,0.12)',
 boxShadow: active ? '0 8px 18px rgba(249,92,75,0.22)' : 'none',
 }}
 >
                                            <ProfileAvatarVisual avatar={avatarImg} imgClassName="w-full h-full object-cover" emojiClassName="text-[18px]" />
                                        </motion.button>
                                    );
                                })}
                                {/* 🎯 UI 無 emoji（Definition §6.3）：頭像符號改用 lucide 線性圖示。
                                    使用者選的是「一個代表自己的符號」，線性圖示同樣成立，
                                    而且和 app 其他圖示是同一套語言（emoji 在 iOS/Android 長得不一樣）。
                                    儲存值改為 icon:<id>，ProfileAvatarVisual 會辨識。 */}
                                {AVATAR_ICONS.map(({ id, Icon, label }) => {
                                    const value = `icon:${id}`;
                                    const active = data.avatar === value;
                                    return (
                                        <motion.button {...pressProps('pill')}
 key={id}
 type="button"
 aria-label={`使用「${label}」作為頭像`}
 onClick={() => setData(d => ({ ...d, avatar: value }))}
 className="w-10 h-10 rounded-full flex items-center justify-center border "
 style={{
 background: MISTY_AVATAR_BG,
 borderColor: active ? '#F95C4B' : 'rgba(22,20,21,0.12)',
 boxShadow: active ? '0 8px 18px rgba(249,92,75,0.22)' : '0 5px 12px rgba(22,20,21,0.04)',
 }}
 >
                                            <Icon size={18} strokeWidth={1.8} color={active ? '#F95C4B' : '#161415'} />
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Identity Section */}
                        <div className="space-y-6">
                            {[
                                { l: 'Display Name', k: 'name', ph: 'Your name', type: 'text' },
                                { l: 'Bio', k: 'bio', ph: 'Tell the community who you are...', multi: true },
                                { l: 'Status / Tag', k: 'tag', ph: 'e.g. Hybrid Athlete' },
                                { l: 'City', k: 'city', ph: 'Location' },
                            ].map(f => (
                                <div key={f.k} className="group">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 block text-[#161415]/40 transition-colors group-focus-within:text-[#F95C4B]">{f.l}</label>
                                    {f.multi ? (
                                        <textarea value={data[f.k] || ''} onChange={e => setData(d => ({ ...d, [f.k]: e.target.value }))} placeholder={f.ph} rows={2}
                                            className="w-full bg-transparent border-b border-[#161415]/10 py-2 text-[15px] font-medium resize-none outline-none transition-all focus:border-[#F95C4B] placeholder:text-[#161415]/20 text-[#161415]"
                                            style={{ fontFamily: "'Tenor Sans', sans-serif" }} />
                                    ) : (
                                        <div className="flex items-center border-b border-[#161415]/10 transition-all focus-within:border-[#F95C4B]">
                                            <input value={data[f.k] || ''} onChange={e => setData(d => ({ ...d, [f.k]: e.target.value }))} placeholder={f.ph}
                                                className="w-full bg-transparent py-2 text-[16px] font-medium outline-none placeholder:text-[#161415]/20 text-[#161415]"
                                                style={{ fontFamily: "'Tenor Sans', sans-serif" }} />
                                            {f.k === 'city' && (
                                                <motion.button {...pressProps('pill')}
 type="button"
 onClick={() => detectCity(false)}
 disabled={detectingCity}
 aria-label="自動偵測所在城市"
 className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest"
 style={{ color: '#F95C4B', background: 'rgba(249,92,75,0.08)' }}
 >
                                                    <MapPin size={12} className={detectingCity ? 'animate-pulse' : ''} />
                                                    {detectingCity ? '偵測中' : '自動偵測'}
                                                </motion.button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* 稱號已移到「設定 → 帳號與身分」。
                            它是按了立刻生效的設定，混在有存檔按鈕的表單裡會讓人以為
                            要按儲存才算數；而且原本兩個地方各有一份入口。 */}

                        {/* Physical Stats: Compact Grid */}
                        <div className="pt-2">
                            <div className="flex items-center gap-3 mb-5">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#161415]/40 whitespace-nowrap">Biometrics</p>
                                <div className="h-px w-full bg-[#161415]/5" />
                            </div>
                            <div className="grid grid-cols-3 gap-6">
                                {[
                                    { l: 'Age', k: 'age' },
                                    { l: 'Height', k: 'height_cm', unit: 'cm' },
                                    { l: 'Weight', k: 'weight_kg', unit: 'kg' },
                                ].map(f => (
                                    <div key={f.k} className="flex flex-col group">
                                        <label className="text-[9px] font-black uppercase tracking-widest mb-2 text-[#161415]/30 group-focus-within:text-[#F95C4B]">{f.l}</label>
                                        <div className="flex items-baseline border-b border-[#161415]/10 pb-1 group-focus-within:border-[#F95C4B] transition-all">
                                            <input type="number" value={data[f.k] || ''} onChange={e => setData(d => ({ ...d, [f.k]: e.target.value }))}
                                                className="w-full bg-transparent text-[18px] font-medium outline-none text-[#161415]"
                                                style={{ fontFamily: "'Tenor Sans', sans-serif" }} />
                                            {f.unit && <span className="text-[11px] font-bold text-[#161415]/30 ml-1">{f.unit}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Preference: Editorial Selects */}
                        <div className="grid grid-cols-2 gap-8 pt-2">
                            <div className="group">
                                <label className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 block text-[#161415]/40 group-focus-within:text-[#F95C4B]">Gender</label>
                                {/* 預設是空的 —— 預選 Male 等於替沒填的人做決定，
                                    而性別會直接影響 BMR（女性常數 −161）與體脂門檻 */}
                                <select value={data.gender || ''} onChange={e => setData(d => ({ ...d, gender: e.target.value }))}
                                    className="w-full bg-transparent border-b border-[#161415]/10 py-2 text-[14px] font-bold outline-none appearance-none cursor-pointer transition-all focus:border-[#F95C4B]"
                                    style={{ fontFamily: "'Tenor Sans', sans-serif", color: '#161415' }}>
                                    <option value="">未選擇</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                                </select>
                            </div>
                            <div className="group">
                                <label className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 block text-[#161415]/40 group-focus-within:text-[#F95C4B]">Activity Level</label>
                                <select value={data.activity_level || 'moderate'} onChange={e => setData(d => ({ ...d, activity_level: e.target.value }))}
                                    className="w-full bg-transparent border-b border-[#161415]/10 py-2 text-[14px] font-bold outline-none appearance-none cursor-pointer transition-all focus:border-[#F95C4B]"
                                    style={{ fontFamily: "'Tenor Sans', sans-serif", color: '#161415' }}>
                                    <option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="active">Active</option>
                                </select>
                            </div>
                        </div>

                        {/* Cover Photo: Large Preview */}
                        <div className="pt-4 pb-4">
                            <div className="flex items-center gap-3 mb-4">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#161415]/40 whitespace-nowrap">Background</p>
                                <div className="h-px w-full bg-[#161415]/5" />
                            </div>
                            <label className="relative block h-40 rounded-[24px] overflow-hidden cursor-pointer border-[1px] border-[#161415]/10 group bg-white shadow-sm hover:shadow-md transition-all">
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => setData(d => ({ ...d, coverPhoto: ev.target.result }));
                                        reader.readAsDataURL(file);
                                    }
                                }} />
                                {data.coverPhoto ? (
                                    <img loading="lazy" decoding="async" src={data.coverPhoto} alt="Cover Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20">
                                        <Image size={28} strokeWidth={1} />
                                        <span className="text-[11px] font-bold mt-3 tracking-widest uppercase">Upload Cover</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-all duration-300">
                                    <Camera size={28} color="white" strokeWidth={1.5} />
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Footer: Prominent Call to Action */}
                    <div className="px-8 py-6 bg-white/50 backdrop-blur-sm border-t border-[#161415]/5">
                        <motion.button {...pressProps('row')}
 onClick={() => { onSave(data); onClose(); }}
 className="w-full py-5 rounded-[18px] text-[14px] font-black text-white shadow-[0_10px_30px_rgba(249,92,75,0.3)] active:shadow-none"
 style={{ background: '#161415', letterSpacing: '0.15em', textTransform: 'uppercase' }}
 >
                            Confirm Changes
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </>,
        document.body
    );
};

/* ═══ FOLLOWING SHEET — 追蹤中／粉絲／好友 三分頁 ═══
   🩹 舊版問題：不管關係為何，每個人下面都寫死「好友」，
      而「粉絲（單方面追蹤我）」和「好友（互相追蹤）」在產品上是不同的權限。
      現在關係標籤來自 followGraph 的真實判定，而且三種名單各有分頁。 */
const FollowingSheet = ({ followingIds, onClose, userId }) => {
    const [tab, setTab] = useState('following'); // following | fans | friends
    const [graph, setGraph] = useState(() => getGraphLocal(userId));
    const [directory, setDirectory] = useState({});
    const [q, setQ] = useState('');

    useEffect(() => {
        let alive = true;
        (async () => {
            // 1) 關係圖（後端為真相源）
            const g = await fetchGraph(userId);
            if (alive && g) {
                setGraph(g);
                // hydrate 回來的使用者資料直接當名錄，省一次往返
                const map = {};
                [...(g.followingUsers || []), ...(g.followerUsers || []), ...(g.friendUsers || [])]
                    .forEach(u => { map[u.user_id] = { name: u.name, avatar: u.avatar, discriminator: u.discriminator }; });
                if (Object.keys(map).length) setDirectory(prev => ({ ...prev, ...map }));
            }
            // 2) 排行榜名錄補齊沒 hydrate 到的人（不捏造，抓不到就顯示 ID 簡寫）
            try {
                const { default: api } = await import('../api/client');
                const res = await api.get(`/api/social/friends/leaderboard/${userId}`);
                const map = {};
                (res?.data?.leaderboard || []).forEach((r) => { map[r.user_id] = { name: r.name, avatar: r.avatar }; });
                if (alive) setDirectory(prev => ({ ...map, ...prev }));
            } catch { /* 名錄抓不到 → 顯示 ID 簡寫 */ }
        })();
        return () => { alive = false; };
    }, [userId]);

    const TABS = [
        { id: 'following', label: '追蹤中', ids: graph.following?.length ? graph.following : followingIds },
        { id: 'fans', label: '粉絲', ids: graph.fans || [] },
        { id: 'friends', label: '好友', ids: graph.friends || [] },
    ];
    const activeIds = (TABS.find(t => t.id === tab)?.ids || []).filter(id => {
        if (!q.trim()) return true;
        const u = directory[id];
        const hay = `${u?.name || ''} ${id}`.toLowerCase();
        return hay.includes(q.trim().toLowerCase());
    });

    const EMPTY_COPY = {
        following: { title: '還沒有追蹤任何人', hint: '到社群頁的「探索」搜尋名稱或好友碼，開始建立你的動態流。' },
        fans: { title: '還沒有粉絲', hint: '粉絲是單方面追蹤你的人。發一則訓練紀錄，讓別人找到你。' },
        friends: { title: '還沒有好友', hint: '互相追蹤、或在社群名冊互相加入，就成為好友。' },
    };
    return createPortal(
        <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100001] bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 z-[100001] max-w-[440px] mx-auto h-[60dvh] flex flex-col">
                <div style={{ background: P.cream, borderRadius: '28px 28px 0 0', display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
                    <div className="px-5 pt-5 pb-3 border-b border-black/5">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-[18px] font-black" style={{ color: P.text }}>你的社群</h3>
                            <motion.button {...pressProps('icon')} onClick={onClose} aria-label="關閉" className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"><X size={16} /></motion.button>
                        </div>

                        {/* 三分頁：追蹤中 / 粉絲 / 好友 — 名詞在這裡第一次被清楚區分 */}
                        <div className="flex p-1 rounded-full mb-3" style={{ background: 'rgba(0,0,0,0.05)', gap: 4 }}>
                            {TABS.map(t => (
                                <motion.button {...pressProps('cta')}
 key={t.id}
 onClick={() => setTab(t.id)}
 aria-pressed={tab === t.id}
 className="flex-1 py-2 rounded-full text-[12.5px] font-black"
 style={{
 background: tab === t.id ? P.text : 'transparent',
 color: tab === t.id ? '#FFFFFF' : P.sub,
 }}
 >
                                    {t.label} {t.ids.length > 0 && <span style={{ opacity: 0.7 }}>{t.ids.length}</span>}
                                </motion.button>
                            ))}
                        </div>

                        {/* 搜尋已在名單裡的人 */}
                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-full"
                            style={{ background: 'rgba(0,0,0,0.04)' }}>
                            <Search size={14} style={{ color: P.sub }} strokeWidth={2.2} />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="搜尋名稱或 ID"
                                aria-label="搜尋名單"
                                className="flex-1 bg-transparent border-none outline-none text-[13px] font-medium"
                                style={{ color: P.text }}
                            />
                            {!!q && <motion.button {...pressProps('row')} onClick={() => setQ('')} aria-label="清除"><X size={13} style={{ color: P.sub }} /></motion.button>}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-2">
                        {activeIds.map(fId => {
                            const u = directory[fId] || { name: String(fId).slice(0, 10), avatar: null };
                            // 真實關係，不再一律寫「好友」
                            const rel = relationIn(graph, fId, userId);
                            return (
                                <div key={fId} className="flex items-center gap-3 py-3 border-b border-black/5">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg overflow-hidden" style={{ background: `${P.sage}20` }}>
                                        {u.avatar
                                            ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                                            : String(u.name || '?').slice(0, 1)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] font-black truncate" style={{ color: P.text }}>{u.name}</p>
                                        <p className="text-[11px] font-bold" style={{ color: rel === 'friend' ? '#F95C4B' : P.sub }}>
                                            {RELATION_LABEL[rel] || '—'}
                                        </p>
                                    </div>
                                    <motion.button {...pressProps('icon')} className="px-3 py-1.5 rounded-full text-[12px] font-black flex-shrink-0" style={{ background: 'rgba(0,0,0,0.05)', color: P.text }}>查看</motion.button>
                                </div>
                            );
                        })}
                        {activeIds.length === 0 && (
                            <div className="text-center py-10 px-6">
                                <p className="text-[14px] font-black" style={{ color: P.text, opacity: 0.6 }}>
                                    {q.trim() ? `找不到「${q}」` : EMPTY_COPY[tab].title}
                                </p>
                                {!q.trim() && (
                                    <p className="text-[11.5px] font-medium mt-2 leading-relaxed" style={{ color: P.sub }}>
                                        {EMPTY_COPY[tab].hint}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </>,
        document.body
    );
};

/* ═══════════════════════════════════════════
   MAIN COMPONENT — Strava × IG Fusion Profile
   ═══════════════════════════════════════════ */
/* 上架後使用者回報問題，第一句一定是「你是哪個版本」——
   這一頁原本沒有任何地方寫版本號。由 build 時的環境變數帶入，沒設就顯示 dev。 */
const APP_VERSION = import.meta.env?.VITE_APP_VERSION || 'dev';

/* ══════════════════════════════════════════════════════════════════════════
 * 設定頁的共用列元件
 * ══════════════════════════════════════════════════════════════════════════
 * 稽核前這一頁有 12 個區塊標題，其中 5 個底下只放 1 個項目 —— 標題比內容還多，
 * 一路捲下去像在讀目錄。而且分類本身不一致：「貼紙實驗室」在個人化、
 * 「圖表深度」在進階，兩個都是「畫面上顯示什麼」；帳號相關的三個動作
 * （切換帳號／清除資料／登出）散在兩個區塊加最底部。
 *
 * 收成 7 個區塊，每個都放得下兩項以上，並且抽出這幾個元件，
 * 讓每一列的高度、間距、分隔線都從同一個地方來（原本是每一列各寫一次
 * className，所以有的列有分隔線、有的沒有）。
 * ══════════════════════════════════════════════════════════════════════════ */

/** 一個區塊：標題 + 圓角卡片容器。 */
const SettingsGroup = ({ title, children }) => (
    <div className="space-y-3">
        <div className="text-[12px] font-black text-white/40 tracking-[0.2em] px-1">{title}</div>
        <div className="bg-white/5 rounded-[18px] overflow-hidden border border-white/10 backdrop-blur-md">
            {children}
        </div>
    </div>
);

/** 列與列之間的分隔線。縮排對齊圖示右緣。 */
const SettingsDivider = () => <div className="h-px w-full bg-white/10 ml-[52px]" />;

const rowIcon = (icon) => (
    <span className="w-[18px] flex justify-center shrink-0 opacity-60">{icon}</span>
);

/**
 * 可點擊的一列。
 * value 放在右側（例如「已連接」「3 張」），讓人不用點進去就知道現在的狀態 ——
 * 原本每一列都只有一個箭頭，設定值全藏在下一層。
 */
const SettingsRow = ({ icon, label, sub, value, badge, onClick, danger }) => (
    <motion.button
        {...pressProps('cta')}
        onClick={onClick}
        className={`w-full p-4 flex items-center gap-4 text-left transition-colors ${danger ? 'hover:bg-[#D94030]/10 active:bg-[#D94030]/20' : 'hover:bg-white/10 active:bg-white/20'}`}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
        {rowIcon(icon)}
        <span className="flex-1 min-w-0">
            <span className={`block font-bold tracking-wide ${danger ? 'text-[#D94030]' : 'text-white'}`}>{label}</span>
            {sub && <span className="block text-[11px] text-white/40 mt-0.5 leading-snug">{sub}</span>}
        </span>
        {badge > 0 && (
            <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#F95C4B] text-white text-[11px] font-black flex items-center justify-center">
                {badge}
            </span>
        )}
        {value && <span className="shrink-0 text-[12px] font-bold text-white/50 tabular-nums">{value}</span>}
        <ChevronRight size={16} className={`shrink-0 opacity-30 ${danger ? 'text-[#D94030]' : ''}`} />
    </motion.button>
);

/** 帶開關的一列。sub 一律顯示（不是只有開啟時才說明它在幹嘛）。 */
const SettingsToggle = ({ icon, label, sub, on, onChange, ariaLabel }) => (
    <div className="w-full p-4 flex items-center gap-4 text-white">
        {rowIcon(icon)}
        <div className="flex-1 min-w-0">
            <div className="font-bold tracking-wide">{label}</div>
            {sub && <div className="text-[11px] text-white/40 mt-0.5 leading-snug">{sub}</div>}
        </div>
        <motion.button
            {...pressProps('icon')}
            onClick={onChange}
            role="switch"
            aria-checked={!!on}
            aria-label={ariaLabel || label}
            className="shrink-0 relative rounded-full transition-colors"
            style={{
                width: 46, height: 27,
                background: on ? '#F95C4B' : 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.15)',
            }}
        >
            <span
                className="absolute top-[2px] rounded-full bg-white transition-all"
                style={{ width: 21, height: 21, left: on ? 22 : 2, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
            />
        </motion.button>
    </div>
);

/** 只顯示內容、不可點的一列（例如版本號、時間選擇）。 */
const SettingsStatic = ({ icon, label, children }) => (
    <div className="w-full p-4 flex items-center gap-4 text-white">
        {icon ? rowIcon(icon) : <span className="w-[18px] shrink-0" />}
        <div className="flex-1 min-w-0 font-bold tracking-wide">{label}</div>
        {children}
    </div>
);

const UserProfileFormMobile = ({ onSubmit, onSkip, userProfile, guestUserId, guestProfile, onGuestClose }) => {
    const navigate = useNavigate();
    const [oauthUser, setOauthUser] = useState(null);

    // When viewing a friend's profile (guestUserId set), use their ID; otherwise current user
    const isGuestView = !!guestUserId;
    const userId = guestUserId || getUserId();

    // 🎯 同步初始化：在 useState 內一次性從 localStorage 讀取所有資料
    // 所有 key 都以 userId 命名空間，不同帳號之間完全獨立
    const [profile, setProfile] = useState(() => {
        // ── Guest view: use passed guestProfile data directly ──
        if (guestProfile) {
            const gp = guestProfile;
            const parsed = gp.name?.includes('#')
                ? { name: gp.name.split('#')[0], disc: gp.name.split('#')[1] }
                : { name: gp.name || 'Athlete', disc: gp.discriminator || '0000' };
            return {
                name: parsed.name,
                bio: gp.bio || '',
                tag: gp.tag || 'DRVN ATHLETE',
                city: gp.city || '台北市',
                age: 25, height_cm: 170, weight_kg: 65, gender: 'male', activity_level: 'moderate',
                avatar: gp.avatar || DEFAULT_PROFILE_AVATAR,
                coverPhoto: gp.coverPhoto || '/desktop/profilerunningbackground.png',
                discriminator: parsed.disc,
            };
        }
        const defaults = {
            name: userProfile?.name || '',
            bio: userProfile?.bio || '',
            tag: userProfile?.tag || '',
            city: userProfile?.city || '台北市',
            age: userProfile?.biometrics?.age ?? '',
            // 沒量過就是空的，讓欄位顯示未填而不是預填一組假的
            height_cm: userProfile?.biometrics?.height ?? '',
            weight_kg: userProfile?.biometrics?.weight ?? '',
            gender: userProfile?.biometrics?.gender ?? '',
            activity_level: userProfile?.biometrics?.activityLevel || 'moderate',
            avatar: userProfile?.avatar || DEFAULT_PROFILE_AVATAR,
            coverPhoto: userProfile?.coverPhoto || '/desktop/profilerunningbackground.png',
        };
        try {
            // 0. 從 JWT 解出 OAuth provider 的名字和大頭貼（新帳號的預設值）
            let jwtName = null;
            let jwtAvatar = null;
            try {
                const token = localStorage.getItem('auth_token');
                if (token) {
                    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (payload.exp * 1000 > Date.now()) {
                        jwtName = payload.name || null;
                        jwtAvatar = payload.avatar || null;
                    }
                }
            } catch (_) { }

            // 1. 讀取此 userId 的 profile cache（使用者已手動改過的設定）
            const cachedData = uStorage(userId).get('user_profile_cache', {});
            // 2. 讀取此 userId 獨立儲存的圖片（手動上傳的頭貼）
            const savedAvatar = uStorage(userId).get('user_avatar_photo', null);
            const savedCover = uStorage(userId).get('user_cover_photo', null);

            // ── 統一名字（與首頁 ActionFirstDashboardMobile 完全一致）──
            // 首頁用 resolveDisplayName(userId, cache.name)；這裡刻意「只」用同一份
            // user_profile_cache 的 name，不再混入 App 全域 userProfile.name（可能是
            // "mike" 等其他來源），確保首頁標題與個人頁標題顯示相同。
            const unifiedName = resolveDisplayName(
                userId,
                cachedData.name
            );

            return {
                ...defaults,
                ...cachedData,
                // 頭貼優先順序：手動上傳 > cache > 後端 > JWT大頭貼 > 預設圖
                avatar: savedAvatar || cachedData.avatar || userProfile?.avatar || jwtAvatar || DEFAULT_PROFILE_AVATAR,
                coverPhoto: savedCover || cachedData.coverPhoto || userProfile?.coverPhoto || '/desktop/profilerunningbackground.png',
                // 名字 — 共用 resolveDisplayName，跟首頁 displayName 一致
                name: unifiedName,
            };
        } catch (e) {
            return defaults;
        }
    });
    const [following, setFollowing] = useState(() => getFollowing(userId));
    // 粉絲數：改為真實數據（不再用 MOCK_USERS 假算）。
    // 後端社群圖譜建立後，從 /api/social/friends 取真實粉絲數；目前訪客為 0。
    const [followers, setFollowers] = useState(0);
    useEffect(() => {
        let cancelled = false;
        if (!userId) { setFollowers(0); return; }
        // 🩹 原本寫死 http://<host>:8000 → 打包上線後必定失敗（永遠 0 粉絲）。
        //    改走 apiClient（統一 baseURL + 離線佇列）。
        apiClient.get(`/api/social/friends/${userId}/followers/count`)
            .then(res => {
                const d = res?.data;
                if (!cancelled && d && typeof d.count === 'number') setFollowers(d.count);
            })
            .catch(() => { /* 無資料時維持 0 — 誠實數據，不捏造 */ });
        return () => { cancelled = true; };
    }, [userId]);
    const [showEdit, setShowEdit] = useState(false);
    const [showDetail, setShowDetail] = useState(null);
    const [showFollowing, setShowFollowing] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    // 🔒 社群隱私：是否對好友分享我的運動動態（後端 /api/social/friends/privacy）
    const [shareActivities, setShareActivities] = useState(true);
    useEffect(() => {
        if (!showSettingsModal || !userId) return;
        apiClient.get(`/api/social/friends/privacy/${userId}`)
            .then((r) => setShareActivities(r.data?.share_activities !== false))
            .catch(() => { });
    }, [showSettingsModal, userId]);
    const toggleShareActivities = async () => {
        const next = !shareActivities;
        setShareActivities(next);
        try {
            await apiClient.post('/api/social/friends/privacy', { user_id: userId, share_activities: next });
        } catch (_) { setShareActivities(!next); }
    };
    // 🌐 語言狀態 (Global Context)
    const { language: appLanguage, setLanguage: setAppLanguage, t } = useLanguage();

    // ⚡ 圖表：基本（所有人）／進階（會員）—— 分級表在 utils/advancedCharts
    const [chartLevel, setChartLevelState] = useState(getChartPreference());
    const { member, gateActive, subscribed, comp } = useMembership();
    const [showChartsHelp, setShowChartsHelp] = useState(false); // 「?」說明：列出各系統隱藏了哪些圖表
    const [showHealthHelp, setShowHealthHelp] = useState(false);  // 「?」說明：手錶健康權限設定路徑
    const [profileCopied, setProfileCopied] = useState(false);    // 分享個人檔案：剪貼簿 fallback 的「已複製」提示

    // 🏠 功能卡牌區 — 被從主頁移除的卡牌，這裡仍可進入功能、或一鍵加回主頁
    const [hiddenHomeCards, setHiddenHomeCards] = useState(() => getHiddenHomeCards(getUserId()));
    useEffect(() => {
        const sync = () => setHiddenHomeCards(getHiddenHomeCards(getUserId()));
        window.addEventListener(HOME_CARDS_EVENT, sync);
        return () => window.removeEventListener(HOME_CARDS_EVENT, sync);
    }, []);
    // 設定頁：兩個可展開的子區塊（稱號、被移除的主頁卡牌）
    const [showTitlePicker, setShowTitlePicker] = useState(false);
    const [showHiddenCards, setShowHiddenCards] = useState(false);

    // 目前選的稱號 —— 顯示在「稱號」那一列，不用點進去才知道現在是什麼
    const featuredTitle = useFeaturedTitle(userId);
    const featuredTitleLabel = featuredTitle?.poeticZh || featuredTitle?.label || null;

    /* iOS 容器有沒有掛上健康橋接。
       ⚠️ 這只回答「能不能請求」，不是「已經授權」——
          授權結果 iOS 端不會回傳給網頁，所以畫面上不能寫「已授權」。 */
    const healthBridgeReady = typeof window !== 'undefined'
        && !!(window.webkit?.messageHandlers?.healthKit || window.webkit?.messageHandlers?.fitnessApp);

    const handleRequestHealth = useCallback(() => {
        haptic('medium');
        try { window.webkit?.messageHandlers?.fitnessApp?.postMessage({ type: 'requestHealthAuth' }); }
        catch (_) { /* 非 iOS 容器 */ }
    }, []);

    const handleRestartTutorial = useCallback(() => {
        setShowSettingsModal(false);
        try { resetOnboarding(); } catch { /* ignore */ }
        // 進主頁後再觸發，確保聚光燈掛載完成
        setTimeout(() => {
            navigate('/mobile-home');
            setTimeout(() => window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT)), 500);
        }, 0);
    }, [navigate]);

    const handleShareProfile = useCallback(async () => {
        const shareText = `我在 DRVN 訓練中 💪\n訓練者：${profile?.name || 'DRVN User'}\nID：${userId}\n加我好友一起練！`;
        haptic('medium');
        try {
            if (window.webkit?.messageHandlers?.shareImage) {
                // 打包版走原生分享面板（WKWebView 沒有 Web Share API）
                window.webkit.messageHandlers.shareImage.postMessage({ text: shareText });
            } else if (navigator.share) {
                await navigator.share({ title: 'DRVN 個人檔案', text: shareText });
            } else {
                await navigator.clipboard.writeText(shareText);
                setProfileCopied(true);
                setTimeout(() => setProfileCopied(false), 2000);
            }
        } catch (_) { /* 使用者取消分享 */ }
    }, [profile, userId]);

    const handleChartLevel = (lvl) => {
        // 進階圖表是會員功能：非會員點「進階」→ 打開付費牆，設定不變
        if (lvl === 'advanced' && !member) { openPaywall('advancedCharts'); return; }
        setChartLevelState(lvl);
        setChartPreference(lvl);
    };
    // 🔔 訓練提醒設定（每日提醒開關 + 時間）
    const [reminder, setReminder] = useState({ enabled: false, time: '19:00' });
    useEffect(() => {
        if (userId) setReminder(getReminderSettings(userId));
    }, [userId]);
    const handleReminderToggle = async () => {
        const next = !reminder.enabled;
        if (next) {
            const perm = await requestNotificationPermission();
            if (perm === 'denied') {
                toast.error('通知權限被拒絕。請到系統設定開啟通知，才能收到訓練提醒。');
                return;
            }
        }
        const saved = saveReminderSettings(userId, { enabled: next });
        setReminder(saved);
    };
    const handleReminderTime = (time) => {
        const saved = saveReminderSettings(userId, { time, enabled: reminder.enabled });
        setReminder(saved);
    };
    // （showFriends 狀態已隨 FriendsSheet 移除）
    const [gridFilter, setGridFilter] = useState('grid');
    const [showComposer, setShowComposer] = useState(false);
    const [gridItems, setGridItems] = useState(MOCK_GRID);

    // 🎯 貼紙的拖曳位置狀態 (存入 localStorage 讓位置保持)
    const [stickerMode, setStickerMode] = useState(false); // 是否在排版貼紙模式
    const [peekSelf, setPeekSelf] = useState(false);       // 點名字 → 個人資料預覽（別人看到的你）

    // 🔒 貼紙排版模式時鎖定 body 滾動，防止背景頁面跟著滑動
    useEffect(() => {
        if (stickerMode) {
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
        } else {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        };
    }, [stickerMode]);

    const [stickerPos, setStickerPos] = useState(() =>
        uStorage(userId).get('profileStickerPos', {
            // default 往下移一點，避免一開始壓到頂部資訊列
            workout: { x: 20, y: 200, rotation: -8 },
            run: { x: 220, y: 175, rotation: 12 },
            // DRVN TAIPEI 城市貼紙：每個人一開始就有一張，放在上方中間、不壓到好友鈕與選單
            drvnSticker4: { x: 150, y: 48, rotation: -8 },
        })
    );

    const [showStickers, setShowStickers] = useState(() =>
        uStorage(userId).get('profileShowStickers', true)
    );

    const [showStickerGallery, setShowStickerGallery] = useState(false);
    const [activeStickers, setActiveStickers] = useState(() =>
        uStorage(userId).get('profileActiveStickers', ['workout', 'run', 'drvnSticker4'])
    );

    const toggleStickerSelection = (id) => {
        setActiveStickers(prev => {
            const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
            uStorage(userId).set('profileActiveStickers', next);
            return next;
        });

        // Initialize position if not exists
        setStickerPos(prev => {
            if (prev[id]) return prev;
            const template = STICKER_TEMPLATES[id];
            const nextPos = { ...prev, [id]: template.defaultPos || { x: 100, y: 100, rotation: 0 } };
            uStorage(userId).set('profileStickerPos', nextPos);
            return nextPos;
        });
    };

    const toggleStickers = () => {
        const newVal = !showStickers;
        setShowStickers(newVal);
        uStorage(userId).set('profileShowStickers', newVal);
    };

    const handleDragEnd = (type, info) => {
        setStickerPos(prev => {
            // 重置後某些貼紙可能不在 prev 中 → 以 template 預設值兜底，避免讀取 undefined 造成白屏
            const base = prev[type] || STICKER_TEMPLATES[type]?.defaultPos || { x: 50, y: 50, rotation: 0, scale: 1 };
            const newPos = {
                ...prev,
                [type]: {
                    ...base,
                    x: (base.x || 0) + info.offset.x,
                    y: (base.y || 0) + info.offset.y
                }
            };
            uStorage(userId).set('profileStickerPos', newPos);
            return newPos;
        });
    };

    const handleRotate = (id, delta) => {
        setStickerPos(prev => {
            const base = prev[id] || STICKER_TEMPLATES[id]?.defaultPos || { x: 50, y: 50, rotation: 0, scale: 1 };
            const newPos = {
                ...prev,
                [id]: {
                    ...base,
                    rotation: ((base.rotation || 0) + delta + 360) % 360
                }
            };
            uStorage(userId).set('profileStickerPos', newPos);
            return newPos;
        });
    };

    // 縮放貼紙（限制 0.5x ~ 2.5x），供 +/- 按鈕與雙指縮放使用
    const handleScale = (id, factor) => {
        setStickerPos(prev => {
            const base = prev[id] || STICKER_TEMPLATES[id]?.defaultPos || { x: 50, y: 50, rotation: 0, scale: 1 };
            const nextScale = Math.min(2.5, Math.max(0.5, (base.scale || 1) * factor));
            const newPos = { ...prev, [id]: { ...base, scale: nextScale } };
            uStorage(userId).set('profileStickerPos', newPos);
            return newPos;
        });
    };

    // 直接設定絕對 scale / rotation（供雙指手勢使用）
    const setStickerTransform = (id, { scale, rotation }) => {
        setStickerPos(prev => {
            const base = prev[id] || STICKER_TEMPLATES[id]?.defaultPos || { x: 50, y: 50, rotation: 0, scale: 1 };
            const newPos = {
                ...prev,
                [id]: {
                    ...base,
                    ...(scale != null ? { scale: Math.min(2.5, Math.max(0.5, scale)) } : {}),
                    ...(rotation != null ? { rotation: ((rotation % 360) + 360) % 360 } : {}),
                },
            };
            uStorage(userId).set('profileStickerPos', newPos);
            return newPos;
        });
    };

    // ── 原生雙指手勢（pinch 縮放 + 旋轉）──
    // 記錄手勢起始的兩指距離/角度與貼紙當下的 scale/rotation，移動時即時換算。
    const gestureRef = React.useRef({});
    const getTouchMetrics = (touches) => {
        const [a, b] = touches;
        const dx = b.clientX - a.clientX;
        const dy = b.clientY - a.clientY;
        return { dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) * 180 / Math.PI };
    };
    const onStickerTouchStart = (id, e) => {
        if (!stickerMode || e.touches.length !== 2) return;
        e.stopPropagation();
        const m = getTouchMetrics(e.touches);
        const base = stickerPos[id] || STICKER_TEMPLATES[id]?.defaultPos || { scale: 1, rotation: 0 };
        gestureRef.current[id] = { startDist: m.dist, startAngle: m.angle, baseScale: base.scale || 1, baseRot: base.rotation || 0 };
    };
    const onStickerTouchMove = (id, e) => {
        if (!stickerMode || e.touches.length !== 2) return;
        const g = gestureRef.current[id];
        if (!g) return;
        e.stopPropagation();
        e.preventDefault();
        const m = getTouchMetrics(e.touches);
        const scale = g.baseScale * (m.dist / g.startDist);
        const rotation = g.baseRot + (m.angle - g.startAngle);
        setStickerTransform(id, { scale, rotation });
    };
    const onStickerTouchEnd = (id) => { delete gestureRef.current[id]; };

    const handleResetStickers = () => {
        // 用每個 active 貼紙的 template 預設值重置（含 scale），避免只重置兩個導致其餘貼紙 pos 遺失
        const resetPos = {};
        activeStickers.forEach(id => {
            const dp = STICKER_TEMPLATES[id]?.defaultPos || { x: 50, y: 50, rotation: 0 };
            resetPos[id] = { ...dp, scale: dp.scale || 1 };
        });
        setStickerPos(resetPos);
        uStorage(userId).remove('profileStickerPos');
    };

    /* 🎯 載入真實貼文到 Profile Grid（已用 userId 命名空間隔離） */
    useEffect(() => {
        try {
            const localPosts = getSocialPosts(userId);
            if (!Array.isArray(localPosts) || localPosts.length === 0) return;

            // socialPostsStore 已按 userId 隔離，所有取回的貼文都屬於此使用者
            // 🩹 修正：照片/一般貼文（type 'post'，IGPostComposer 發的）以前被過濾掉，
            // 導致 Profile 格只剩訓練 placeholder 而看不到使用者上傳的照片。
            const myPosts = localPosts.filter(p =>
                p.activity_type === 'run' || p.type === 'run' ||
                p.activity_type === 'fitness' || p.type === 'fitness' ||
                p.activity_type === 'strength' || p.type === 'strength' ||
                p.activity_type === 'post' || p.type === 'post'
            );

            const realGridItems = myPosts.map(p => {
                const drvn = p.drvnCard || null;
                const isRun = p.activity_type === 'run' || p.type === 'run';
                const isPhotoPost = p.activity_type === 'post' || p.type === 'post';
                const isLift = !isRun && !isPhotoPost;

                // 縮圖：欄位別名容錯（不同來源存的位置不同，少一個就變灰底無預覽）
                //   images[0]  ← IGPostComposer 的原始欄位
                //   photo / routeImg ← feed 正規化後的欄位
                //   drvnCard.customImage ← 數據卡自訂底圖
                const photo = p.images?.[0] || p.photo || p.routeImg || drvn?.customImage || null;

                // 統計摘要
                let stat = '';
                if (isRun) {
                    const dist = p.metrics?.distance || p.distance || 0;
                    stat = dist > 0 ? `${dist.toFixed(1)} KM` : 'RUN';
                } else if (isLift) {
                    const vol = p.metrics?.volume_kg || p.total_volume || drvn?.totalVolume || 0;
                    if (vol > 1000) stat = `${(vol / 1000).toFixed(1)} t`;
                    else if (vol > 0) stat = `${vol} KG`;
                    else stat = drvn?.featuredPR?.weight ? `${drvn.featuredPR.weight} KG` : 'LIFT';
                }

                const createdDate = p.created_at ? new Date(p.created_at) : new Date();
                const dateStr = `${createdDate.getMonth() + 1}/${createdDate.getDate()}`;

                return {
                    id: p.activity_id,
                    type: isRun ? 'run' : (isPhotoPost ? 'post' : 'lift'),
                    photo,
                    stat,
                    detail: p.caption || (isRun ? '跑步訓練' : (isPhotoPost ? '貼文' : '肌力訓練')),
                    caption: p.caption || '',
                    date: dateStr,
                    isPR: drvn?.isNewRecord || false,
                    // 🎯 保留完整 drvnCard 供 DetailSheet 做 Native Hydration
                    drvnCard: drvn,
                    isLocalPost: true,
                    // 保留原始 metrics 供 DetailSheet 顯示
                    dist: p.metrics?.distance,
                    pace: p.metrics?.pace,
                    dur: p.metrics?.duration,
                    vol: p.metrics?.volume_kg || drvn?.totalVolume,
                    exercise: drvn?.featuredPR?.name,
                    weight: drvn?.featuredPR ? `${drvn.featuredPR.weight}kg` : undefined,
                    kudos: p.kudos_count || 0,
                };
            });

            if (realGridItems.length > 0) {
                console.log('🔍 [PROFILE] Loaded', realGridItems.length, 'real posts from localStorage');
                setGridItems(prev => {
                    // 真實貼文放在最前面，MOCK 在後面
                    const existingIds = new Set(realGridItems.map(r => r.id));
                    const filtered = prev.filter(p => !existingIds.has(p.id));
                    return [...realGridItems, ...filtered];
                });
            }
        } catch (e) {
            console.warn('⚠️ [PROFILE] Failed to load localStorage posts:', e);
        }
    }, [userId]);

    /* Stats */
    const [stats, setStats] = useState({
        runDistance: 0, runPace: '-', strengthVolume: 0,
        streak: 0, workouts: 0, level: 1, tier: '銅牌', score: 0,
        prSquat: '-', prDeadlift: '-', prBench: '-',
    });

    useEffect(() => {
        const xp = getUserXPAndTitle(userId);
        const fetchStats = async () => {
            try {
                const res = await fetch(`http://${window.location.hostname}:8000/api/activities/user/${userId}?limit=100`);
                if (res.ok) {
                    const data = await res.json();
                    const acts = data.activities || [];
                    let runDist = 0, vol = 0;
                    acts.forEach(a => {
                        if (a.activity_type === 'run' && a.metrics?.distance) runDist += a.metrics.distance;
                        if (a.activity_type === 'strength' && a.metrics?.volume) vol += a.metrics.volume;
                    });
                    setStats(s => ({ ...s, runDistance: runDist.toFixed(1), strengthVolume: (vol / 1000).toFixed(1), workouts: acts.length }));
                }
            } catch { }
            setStats(s => ({
                ...s,
                streak: xp.streakDays || 0, level: xp.currentLevel?.level || 1,
                tier: xp.currentLevel?.title || '銅牌', score: xp.currentXP || 0,
                prDeadlift: '180kg', prSquat: '100kg', prBench: '120kg',
            }));
        };
        fetchStats();
    }, [userId]);

    /* Load OAuth user — 優先從 JWT 解析，fallback 到舊 key */
    useEffect(() => {
        // 優先：從 JWT 解出 name/avatar（LINE/Google/Facebook 登入都走這條）
        const token = localStorage.getItem('auth_token');
        if (token) {
            try {
                let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
                while (base64.length % 4 !== 0) base64 += '=';
                const payload = JSON.parse(atob(base64));
                if (payload.exp * 1000 > Date.now()) {
                    const jwtAvatar = payload.avatar || payload.picture || null;
                    const jwtName = payload.name || null;
                    if (jwtAvatar || jwtName) {
                        setOauthUser({ avatar: jwtAvatar, name: jwtName });
                        return; // 有 JWT 就不走 fallback
                    }
                }
            } catch (_) { }
        }
        // Fallback：舊版 oauth_avatar / oauth_name key
        const backupAvatar = localStorage.getItem('oauth_avatar');
        const backupName = localStorage.getItem('oauth_name');
        const isOAuth = localStorage.getItem('oauth_logged_in') === 'true';
        if (isOAuth && (backupAvatar || backupName)) {
            setOauthUser({ avatar: backupAvatar, name: backupName });
        }
    }, []);

    useEffect(() => {
        const syncFromAPI = async () => {
            if (!userId) return;
            const apiBase = `http://${window.location.hostname}:8000`;
            try {
                const res = await fetch(`${apiBase}/api/user/profile/${userId}`);
                if (!res.ok) return;
                const latest = await res.json();
                if (!latest) return;

                // 📸 照片一律「本地優先」：上傳的圖以 base64 存在本地，顯示直接用本地，
                //    避免依賴後端 /static URL（打包版/容器重啟時會顯示不出來）。
                //    本地有 base64 → 用本地；沒有才退回後端 URL。
                const localAvatar = uStorage(userId).get('user_avatar_photo', null);
                const localCover = uStorage(userId).get('user_cover_photo', null);
                const isData = (v) => typeof v === 'string' && v.startsWith('data:');

                const backendAvatar = latest.avatar
                    ? (latest.avatar.startsWith('http') || !latest.avatar.startsWith('/static/') ? latest.avatar : `${apiBase}${latest.avatar}`)
                    : null;
                const backendCover = latest.coverPhoto
                    ? (latest.coverPhoto.startsWith('http') || !latest.coverPhoto.startsWith('/static/') ? latest.coverPhoto : `${apiBase}${latest.coverPhoto}`)
                    : null;

                const fullAvatar = isData(localAvatar) ? localAvatar : (backendAvatar || localAvatar);
                const fullCover = isData(localCover) ? localCover : (backendCover || localCover);

                // 後端有值才覆蓋本地，null/undefined 時維持本地預設
                setProfile(p => ({
                    ...p,
                    name: latest.name || p.name,
                    discriminator: latest.discriminator || p.discriminator,
                    bio: latest.bio || p.bio,
                    tag: latest.tag || p.tag,
                    city: latest.city || p.city,
                    age: latest.age || p.age,
                    height_cm: latest.height_cm || p.height_cm,
                    weight_kg: latest.weight_kg || p.weight_kg,
                    gender: latest.gender || p.gender,
                    activity_level: latest.fitness_level || latest.activity_level || p.activity_level,
                    // 圖片：後端有值才覆蓋，否則維持本地預設（含 /assets/athlete_runner.png）
                    avatar: fullAvatar || p.avatar,
                    coverPhoto: fullCover || p.coverPhoto,
                }));

                // 同步回寫（userId 命名空間）
                if (fullAvatar) uStorage(userId).set('user_avatar_photo', fullAvatar);
                if (fullCover) uStorage(userId).set('user_cover_photo', fullCover);
                console.log('✅ Profile synced from API, avatar:', !!fullAvatar, 'cover:', !!fullCover);
            } catch (e) {
                console.warn('API sync skipped:', e.message);
            }
        };
        syncFromAPI();
    }, [userId]);

    /* 🎯 壓縮圖片工具函式 */
    const compressImage = async (base64, maxSize = 400, quality = 0.6) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
                canvas.width = Math.round(img.width * ratio);
                canvas.height = Math.round(img.height * ratio);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(base64); // fallback to original
            img.src = base64;
        });
    };

    /* Save profile */
    const handleSave = async (data) => {
        // 🎯 1. 頭貼壓縮（200px, 品質 0.5 → ~15-30KB base64）
        if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:')) {
            try {
                const compressed = await compressImage(data.avatar, 200, 0.5);
                data = { ...data, avatar: compressed };
                console.log('[handleSave] Avatar compressed:', Math.round(compressed.length / 1024), 'KB');
            } catch (e) { console.warn('Avatar compression failed:', e); }
        }
        // 🎯 2. 封面圖壓縮（600px, 品質 0.5 → ~50-100KB base64）
        if (data.coverPhoto && typeof data.coverPhoto === 'string' && data.coverPhoto.startsWith('data:')) {
            try {
                const compressed = await compressImage(data.coverPhoto, 600, 0.5);
                data = { ...data, coverPhoto: compressed };
                console.log('[handleSave] Cover compressed:', Math.round(compressed.length / 1024), 'KB');
            } catch (e) { console.warn('Cover photo compression failed:', e); }
        }

        setProfile(data);

        // 🎯 3. localStorage 快取（userId 命名空間，不同帳號獨立）
        if (data.avatar) uStorage(userId).set('user_avatar_photo', data.avatar);
        if (data.coverPhoto) uStorage(userId).set('user_cover_photo', data.coverPhoto);
        try {
            const cacheData = { ...data };
            delete cacheData.coverPhoto;
            delete cacheData.avatar;
            uStorage(userId).set('user_profile_cache', cacheData);
        } catch (e) { console.warn('Cache save failed:', e); }

        const apiBase = `http://${window.location.hostname}:8000`;

        // 🎯 4. 送所有資料到後端
        //    圖片用 File upload（不受 1MB form field 限制）
        try {
            // base64 → Blob 轉換（繞過 Starlette 1MB form field 限制）
            const base64ToBlob = (b64) => {
                const [header, encoded] = b64.split(',');
                const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                const binary = atob(encoded);
                const arr = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
                return new Blob([arr], { type: mime });
            };

            const fd = new FormData();
            fd.append('user_id', userId);
            fd.append('name', data.name || 'User');
            // 🔴 Fix(validation): 夾值防止極端生理數據污染演算法
            // 沒填或填了不合理的值 → null（不送），不是夾到邊界值假裝有填
            const _num = (v, min, max) => {
                const n = Number(v);
                return Number.isFinite(n) && n >= min && n <= max ? n : null;
            };
            const _gender = (v) => {
                const s = String(v ?? '').trim().toLowerCase();
                if (s.startsWith('m') || s === '男' || s === '男性') return 'male';
                if (s.startsWith('f') || s === '女' || s === '女性') return 'female';
                return null;
            };
            /* ⚠️ 缺的欄位就不送，不用 170／65／25／male 頂上去。
               那組預設值一旦存進後端就會被當成「使用者真正的身體數據」，
               之後熱量、蛋白質、目標、配速全部從一個不存在的人算出來。
               只送真的有填的欄位；缺什麼在上面已經擋下來並導去補。 */
            const _h = _num(data.height_cm, 100, 250);
            const _w = _num(data.weight_kg, 30, 300);
            const _a = _num(parseInt(data.age, 10), 10, 100);
            const _g = _gender(data.gender);
            if (_h != null) fd.append('height_cm', String(_h));
            if (_w != null) fd.append('weight_kg', String(_w));
            if (_a != null) fd.append('age', String(_a));
            if (_g != null) fd.append('gender', _g);
            fd.append('fitness_level', data.activity_level || 'moderate');
            if (data.bio) fd.append('bio', data.bio);
            if (data.city) fd.append('city', data.city);
            if (data.tag) fd.append('tag', data.tag);

            // 🎯 圖片：base64 → Blob → File upload（avatar_file / cover_file）
            //    如果是已存的 URL 則用 Form string 傳回
            if (data.avatar && typeof data.avatar === 'string') {
                if (data.avatar.startsWith('data:')) {
                    fd.append('avatar_file', base64ToBlob(data.avatar), 'avatar.jpg');
                } else {
                    fd.append('avatar', data.avatar);  // 已存的 URL
                }
            }
            if (data.coverPhoto && typeof data.coverPhoto === 'string') {
                if (data.coverPhoto.startsWith('data:')) {
                    fd.append('cover_file', base64ToBlob(data.coverPhoto), 'cover.jpg');
                } else {
                    fd.append('coverPhoto', data.coverPhoto);
                }
            }

            console.log('[handleSave] 🚀 POST /api/user/profile', {
                user_id: userId,
                name: data.name,
                avatarMode: data.avatar?.startsWith('data:') ? 'file_upload' : (data.avatar ? 'url' : 'none'),
                coverMode: data.coverPhoto?.startsWith('data:') ? 'file_upload' : (data.coverPhoto ? 'url' : 'none'),
            });

            const res = await fetch(`${apiBase}/api/user/profile`, { method: 'POST', body: fd });

            if (res.ok) {
                const result = await res.json();
                const saved = result.profile || {};
                console.log('[handleSave] ✅ Backend response:', { avatar: saved.avatar, coverPhoto: saved.coverPhoto });

                // 📸 本地優先：若本地已存 base64（上傳的圖），就「不要」用後端 /static URL 覆蓋，
                //    保留 base64 供顯示（打包版/容器重啟都能正常顯示）。
                const _localAvatar = uStorage(userId).get('user_avatar_photo', null);
                const _localCover = uStorage(userId).get('user_cover_photo', null);
                const _isData = (v) => typeof v === 'string' && v.startsWith('data:');

                if (!_isData(_localAvatar) && saved.avatar && typeof saved.avatar === 'string' && saved.avatar.startsWith('/static/')) {
                    const fullUrl = `${apiBase}${saved.avatar}`;
                    setProfile(p => {
                        const updated = { ...p, avatar: fullUrl };
                        if (onSubmit) onSubmit(updated, false);
                        return updated;
                    });
                    uStorage(userId).set('user_avatar_photo', fullUrl);
                }
                if (!_isData(_localCover) && saved.coverPhoto && typeof saved.coverPhoto === 'string' && saved.coverPhoto.startsWith('/static/')) {
                    const fullUrl = `${apiBase}${saved.coverPhoto}`;
                    setProfile(p => {
                        const updated = { ...p, coverPhoto: fullUrl };
                        if (onSubmit) onSubmit(updated, false); // Update global state but don't navigate
                        return updated;
                    });
                    uStorage(userId).set('user_cover_photo', fullUrl);
                } else {
                    // Even if images didn't change, update global state with other fields
                    if (onSubmit) onSubmit(data, false);
                }
            } else {
                // 🎯 關鍵：顯示具體的後端錯誤訊息
                const errText = await res.text();
                console.error('[handleSave] ❌ Backend error:', res.status, errText);
                toast.error('儲存失敗，請檢查網路後重試');
            }
        } catch (e) {
            console.error('[handleSave] ❌ Network error:', e);
            toast.error('儲存失敗：網路錯誤 ' + e.message);
        }
    };

    /* Logout — 必須清乾淨所有跟「上個帳號」有關的 cache，
       否則下次進訪客 / 換帳號時 App.jsx 會把舊 userProfile 讀回來，
       造成「兩個帳號內容看起來一樣」的錯覺。 */
    const handleLogout = () => {
        // 🔐 通知原生清掉 Keychain 登入，避免重裝後又自動還原舊帳號
        try { window.webkit?.messageHandlers?.authBridge?.postMessage({ action: 'clear' }); } catch (_) {}
        // JWT + 身份識別
        localStorage.removeItem('auth_token');
        try { localStorage.removeItem('drvn_auth_choice'); } catch { /* 登出要清掉登入選擇旗標 */ }
        localStorage.removeItem('userId');
        /* 也要清掉訪客 id：getUserId() 會 JWT → userId → guest_user_id 一路退回，
           留著的話登出後會拿到登入前那個訪客身分，把幾個月前的舊計劃整組叫回來
           （共用裝置上，下一個人會看到前一個人的東西）。 */
        try { localStorage.removeItem('guest_user_id'); } catch { /* */ }
        syncUserScope();   // 🩹 帳號隔離：登出即歸檔本人資料
        // OAuth provider cache
        localStorage.removeItem('oauth_logged_in');
        localStorage.removeItem('oauth_name');
        localStorage.removeItem('oauth_avatar');
        // 全域非命名空間舊 key (這次帳號切換的元兇)
        ['userProfile', 'selectedCoach', 'currentPlan', 'currentPlanId',
         'currentWorkoutPlan', 'workout_plans', 'savedFusionPlans',
         'master_journey', 'masterJourneyCardOrder', 'userRadarScores',
         'user_profile_cache', 'user_avatar_photo', 'user_cover_photo',
         'cardio_sessions', 'nutrition_log', 'analysisResult', 'trainingRecords',
        ].forEach(k => localStorage.removeItem(k));
        // ⚠️ HashRouter：必須用 hash 導向登入頁。
        //    直接 window.location.href='/login' 會把 pathname 改成 /login，
        //    被 App.jsx 的網址清洗器校正回 '#/mobile-home'（不是登入頁）；
        //    iOS file:// 打包版更會直接跳到沙箱外的不存在路徑。
        window.location.hash = '#/login';
        window.location.reload(); // 強制整頁重載，清空所有 React 狀態/Context
    };

    /* ── 法律與資料（上架合規 P0）───────────────────────────────────── */
    const [legalDoc, setLegalDoc] = useState(null); // 'disclaimer' | 'privacy' | 'terms' | null
    const [exporting, setExporting] = useState(false);

    const handleExportData = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const res = await apiClient.get(`/api/user/export/${userId}`, { timeout: 60000 });
            const jsonStr = JSON.stringify(res.data, null, 2);
            const fileName = `DRVN_data_export_${toLocalDateKey(new Date())}.json`;
            // ⓪ iOS App：saveFile 原生橋接（WebView.swift 寫成暫存檔再開分享面板）。
            //    WKWebView 沒有 Web Share API，blob 下載連結也不會動 —— 以前按了只跳「已匯出」、手上什麼都沒有。
            if (window.webkit?.messageHandlers?.saveFile) {
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(blob);
                });
                window.webkit.messageHandlers.saveFile.postMessage({ name: fileName, data: dataUrl });
                return;   // 分享面板會自己出現；不另外跳「已匯出」（使用者可能按取消）
            }
            // ① 支援分享的瀏覽器 → 系統分享面板（可「儲存到檔案」）
            if (navigator.share && typeof File !== 'undefined') {
                try {
                    const file = new File([jsonStr], fileName, { type: 'application/json' });
                    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: 'DRVN 資料匯出' });
                        toast.success(t('資料已匯出', 'Data exported'));
                        return;
                    }
                } catch (shareErr) {
                    if (shareErr?.name === 'AbortError') return; // 使用者取消分享 → 靜默
                }
            }
            // ② 瀏覽器 fallback → 直接下載
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            toast.success(t('資料已匯出', 'Data exported'));
        } catch (e) {
            toast.error(t('匯出失敗，請稍後再試', 'Export failed, please retry'));
        } finally {
            setExporting(false);
        }
    };

    /* ── 📣 意見回饋（NPS + 文字）— 上架後的「人話」回饋管道 ──────────── */
    const [showFeedback, setShowFeedback] = useState(false);
    const [fbScore, setFbScore] = useState(null);   // 0-10 NPS
    const [fbText, setFbText] = useState('');
    const [fbSending, setFbSending] = useState(false);
    const submitFeedback = async () => {
        if (fbScore == null) { toast.error(t('先給個分數吧（0-10）', 'Pick a score first (0-10)')); return; }
        setFbSending(true);
        try {
            const { track, flush } = await import('../utils/telemetry');
            track('nps_feedback', { score: fbScore, text: (fbText || '').slice(0, 480) });
            await flush();
            toast.success(t('收到！你的每一句都會被認真看 🙏', 'Got it! We read every word 🙏'));
            setShowFeedback(false); setFbScore(null); setFbText('');
        } catch {
            toast.error(t('送出失敗，請稍後再試', 'Failed to send, please retry'));
        } finally { setFbSending(false); }
    };

    /* ── 刪除帳號 ───────────────────────────────────────────────────── */
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteStep, setDeleteStep] = useState('confirm'); // 'confirm' | 'deleting' | 'done' | 'error'
    const [deleteError, setDeleteError] = useState('');

    const handleDeleteAccount = async () => {
        setDeleteStep('deleting');

        // 清除此 userId 的所有 localStorage 命名空間資料，保留登入狀態
        // ⚠️ 此函式必須覆蓋本 App 內所有「以 userId 為一部分」的 key 格式：
        //    1. 新格式：`u_${userId}_<sub>`（userStorage.js）
        //    2. 舊格式：`customSchedule_${userId}`、`masterJourney_${uid}`、`tdee_cache_${uid}`…
        //    3. Body photo / Goals / League / Shoe 等 manager 自訂前綴
        //    4. 完全沒帶 userId 的全域舊 key（userProfile、selectedCoach、analysisResult…）
        //       — 這些一定是上一個帳號殘留的孤兒，必須一併清掉避免下一次登入被讀回
        const clearLocalData = () => {
            const toDelete = [];

            // 不能刪的白名單（保留登入狀態）
            const KEEP = new Set(['auth_token', 'userId', 'guest_user_id',
                'oauth_logged_in', 'oauth_name', 'oauth_avatar']);

            // (A) 任何含此 userId 的 key
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || KEEP.has(k)) continue;
                if (k.includes(userId)) toDelete.push(k);
            }

            // (B) 計劃進度 key（以 plan ID 命名，不含 userId，需 prefix scan）
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || KEEP.has(k)) continue;
                if (k.startsWith('plan_progress_') || k.startsWith('plan_started_')) {
                    toDelete.push(k);
                }
            }

            // (C) 已知的全域非命名空間 key（圖一營養/圖二計劃/圖三收藏食物等）
            const GLOBAL_USER_KEYS = [
                // 營養（圖一、圖三）
                'drvn_starred_foods', 'drvn_favorites', 'nutrition_log',
                // 計劃（圖二）
                'currentPlan', 'currentPlanId', 'currentWorkoutPlan',
                'workout_plans', 'drvn_custom_plans', 'savedFusionPlans',
                'trainingDays', 'weeklyCardioLog', 'workout_history',
                // Profile
                'userProfile', 'user_profile_cache', 'user_avatar_photo', 'user_cover_photo',
                'profileStickerPos', 'profileShowStickers', 'profileActiveStickers',
                // Social
                'socialPosts',
                // 其他
                'selectedCoach', 'analysisResult', 'trainingRecords',
                'master_journey', 'masterJourneyCardOrder', 'userRadarScores',
                'cardio_sessions', 'shoes', 'currentShoe', 'goals', 'selectedLeague',
                'splitPRs', 'user_baseline', 'avatarConfig',
                'lastCardioSession', 'pendingCardioResults',
                'sonicfocus_library', 'sonicfocus_playback',
            ];
            GLOBAL_USER_KEYS.forEach(k => {
                if (localStorage.getItem(k) !== null) toDelete.push(k);
            });

            // 去重後刪除
            Array.from(new Set(toDelete)).forEach(k => localStorage.removeItem(k));
            console.log(`[deleteAccount] ✅ 已清除 ${new Set(toDelete).size} 筆 localStorage`);
        };

        // 清除完成後，全頁面強制重載到根目錄，確保所有 React 狀態/Context 重新初始化。
        // ⚠️ 注意：本 App 用 HashRouter，目前網址是 `/#/profile-mobile`。
        //    若只做 location.replace('/')，因為只差 fragment（#）→ 瀏覽器不會真正 reload，
        //    React state/Context 不會重置。故改帶一個 query 參數，強制觸發整頁 reload。
        const finishAndReload = () => {
            setDeleteStep('done');
            // 帳號已經刪掉了 → 一併登出（清 JWT、Keychain、身份），回登入頁。
            // 以前這裡留著登入、只把資料歸零 —— 那是重置，不是刪除帳號（5.1.1(v)）。
            setTimeout(() => handleLogout(), 1000);
        };

        // ── 後端資料清除 ────────────────────────────────────────────────
        // 不論訪客或 LINE/OAuth 用戶，都呼叫 POST /api/user/delete 清除後端資料：
        //   • LINE 登入 → user_id 是 Users.id (UUID)，清掉該 UUID 的所有後端 JSON / SQLite 資料
        //   • 訪客登入 → user_id 是 guest_xxx，訪客一樣會在後端產生 user_profiles.json 等資料，
        //                 同樣要清掉（之前版本誤以為「訪客無後端資料」而跳過，導致殘留）
        // 用 POST 而非 DELETE 是為了避開 Safari 對 DELETE 的 CORS preflight 限制。
        // 後端 delete_user_account_post 只有在「JWT 身份存在且與 user_id 不符」時才擋；
        // 訪客沒有 JWT → 後端視為 anonymous → 正常放行清除自己的 guest_xxx 資料。
        const isGuest = !!userId && userId.startsWith('guest_');
        // ⚠️ 統一走 API_BASE_URL：正式環境（Railway）/ iOS file:// 打包版
        //    hostname 不是後端主機，硬寫 :8000 會直接打不到後端。
        const apiBase = API_BASE_URL;
        // 後端刪帳號一定要驗身分（不帶 token 會 401）：訪客身上沒 token 就先補一張匿名 token
        try { const { ensureAuthBeforeFetch } = await import('../utils/guestAuth'); await ensureAuthBeforeFetch(); } catch (_) { /* 拿不到就照舊，下面會顯示要重新登入 */ }
        const token = localStorage.getItem('auth_token');
        try {
            const res = await fetch(`${apiBase}/api/user/delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ user_id: userId }),
            });
            if (res.ok) {
                let resJson = null;
                try { resJson = await res.json(); } catch (_) { }
                console.log(`[deleteAccount] ✅ 後端已清除（${isGuest ? '訪客' : 'LINE/OAuth'}）：`, resJson);
                clearLocalData();
                finishAndReload();
            } else {
                const errText = await res.text();
                console.error('[deleteAccount] ❌', res.status, errText);
                // 登入過期／身分不符：講人話，告訴他怎麼做（重新登入後再刪一次）
                setDeleteError(res.status === 401 || res.status === 403
                    ? '登入已過期，請重新登入後再刪除一次'
                    : `HTTP ${res.status}：${errText || '伺服器無回應'}`);
                setDeleteStep('error');
            }
        } catch (e) {
            console.error('[deleteAccount] ❌ network error', e);
            setDeleteError('網路錯誤：' + e.message);
            setDeleteStep('error');
        }
    };

    /* Post Management */
    const handleDeletePost = (id) => {
        setGridItems(prev => prev.filter(item => item.id !== id));
        setShowDetail(null);
        // 🎯 同步刪除（已用 userId 命名空間，只刪自己的貼文）
        try {
            deleteSocialPost(id, userId);
        } catch (e) { console.warn('Delete from socialPostsStore failed:', e); }
    };

    const handleUpdatePost = (id, newCaption) => {
        setGridItems(prev => prev.map(item =>
            item.id === id ? { ...item, detail: newCaption } : item
        ));
    };

    /* Health derivations */
    const bmr = useMemo(() => {
        const { weight_kg, height_cm, age, gender } = profile;
        if (!weight_kg || !height_cm || !age) return 0;
        return calcBMR_MifflinStJeor({ weight: weight_kg, height: height_cm, age, gender });
    }, [profile.weight_kg, profile.height_cm, profile.age, profile.gender]);
    const tdee = useMemo(() => {
        const m = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
        return Math.round(bmr * (m[profile.activity_level] || 1.55));
    }, [bmr, profile.activity_level]);
    const bmi = useMemo(() => {
        if (!profile.weight_kg || !profile.height_cm) return null;
        const h = profile.height_cm / 100;
        return (profile.weight_kg / (h * h)).toFixed(1);
    }, [profile.weight_kg, profile.height_cm]);

    const filteredGrid = MOCK_GRID.filter(g => gridFilter === 'all' || g.type === gridFilter);

    return (
        /* 🎯 去分色感：底色原本是純黑 #000，但 hero 的漸層收在 #161415 —
           兩者色差在貼文格上方造成一條明顯的「黑色切割線」。
           統一為 Deep Black #161415，整頁單一底色，接縫消失。 */
        <div className="h-[100dvh] overflow-x-hidden font-sans relative text-white bg-[#161415] no-scrollbar" style={{ maxWidth: '430px', margin: '0 auto', overflowY: stickerMode ? 'hidden' : 'auto' }}>
            <FontStyle />

            {/* 💡 1. 半截背景圖與玻璃霧化過渡 */}
            <div className="absolute inset-x-0 top-0 h-[100dvh] z-0 pointer-events-none bg-[#161415] overflow-hidden">
                <img loading="lazy" decoding="async"
                    src={profile.coverPhoto || '/desktop/profilerunningbackground.png'}
                    className="absolute top-0 left-0 w-full h-[65dvh] object-cover opacity-80"
                    alt="bg"
                />
                <div className="absolute top-0 left-0 w-full h-[65dvh] bg-gradient-to-b from-black/60 via-transparent to-transparent pointer-events-none" />

                {/* 這層負責把下半部「霧化」銜接到底色 */}
                <div className="absolute top-[40dvh] left-0 w-full h-[25dvh] backdrop-blur-2xl" style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 60%)', maskImage: 'linear-gradient(to bottom, transparent, black 60%)' }} />

                {/* 文字下方的保護漸層 —
                    🎯 拉長到 30dvh 並用三段停靠點，讓照片→底色是一段長距離的柔和過渡，
                    而不是在 65dvh 突然收尾造成的硬邊。 */}
                <div
                    className="absolute top-[38dvh] left-0 w-full h-[32dvh]"
                    style={{ background: 'linear-gradient(to bottom, rgba(22,20,21,0) 0%, rgba(22,20,21,0.45) 45%, rgba(22,20,21,0.88) 75%, #161415 100%)' }}
                />
                {/* 影像結束線之後補一段純底色，確保無論視窗多高都不會露出黑白斷層 */}
                <div className="absolute top-[68dvh] left-0 w-full h-[32dvh] bg-[#161415]" />
            </div>

            {/* 排版模式提示遮罩 (僅在 stickerMode 為 true 時顯示於頂部) */}
            <AnimatePresence>
                {stickerMode && (
                    <div className="fixed inset-x-0 top-0 z-[1000] flex flex-col items-center pt-16 px-6 pb-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none">
                        <div className="flex gap-3 pointer-events-auto">
                            <motion.button
                                initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                                onClick={() => setStickerMode(false)}
                                className="px-6 py-3 rounded-full bg-[#F95C4B] text-white text-[13px] font-black uppercase tracking-[0.15em] shadow-[0_0_30px_rgba(249,92,75,0.4)] flex items-center gap-2 active:scale-95"
                            >
                                <Check size={18} /> 完成排版
                            </motion.button>
                            <motion.button
                                initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                                onClick={handleResetStickers}
                                className="px-6 py-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-[13px] font-black uppercase tracking-[0.15em] flex items-center gap-2 active:scale-95"
                            >
                                <Trash2 size={16} /> 重置
                            </motion.button>
                        </div>
                        <p className="mt-3 text-[11px] font-bold text-white/50 tracking-wider">單指拖曳移動 · 雙指縮放與旋轉</p>
                    </div>
                )}
            </AnimatePresence>

            {/* 💡 Profile 區塊：固定高度 = 整個視窗 - 一排貼文高度 - tab 列高度，讓第一排貼文剛好在畫面底部露出 */}
            <div className="relative z-10 pt-12 overflow-hidden" style={{ height: 'calc(100dvh - (100vw - 16px) / 3 * 4 / 3 - 50px)', display: 'flex', flexDirection: 'column' }}>

                {/* 💡 2. 極簡頂部列：選單與貼紙庫 */}
                <div className="px-6 flex justify-between items-center text-white mb-auto h-14 relative z-50">
                    {isGuestView ? (
                        // Guest mode: show a close button on the left
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={onGuestClose}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 shadow-lg active:bg-white/20 transition-all"
                        >
                            <X size={16} className="text-white/80" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Close</span>
                        </motion.button>
                    ) : (
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            // 🩹 v4：好友鈕導向還原的 SocialPage（/social）—
                            //    協作/PK、好友最近訓練動態、名冊/請求/搜尋、親密度，一頁到位。
                            onClick={() => navigate('/social')}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 shadow-lg active:bg-white/20 transition-all"
                        >
                            <Users size={16} className="text-[#F95C4B]" />
                            <span className="text-[12px] font-black tracking-widest">好友</span>
                        </motion.button>
                    )}

                    {/* ⋯ Settings — hidden in guest view */}
                    {!isGuestView && (
                        <motion.button {...pressProps('pill')}
 onClick={() => setShowSettingsModal(true)}
 className="w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md border border-white/10 shadow-lg shadow-black/20 hover:bg-black/40"
 >
                            <MoreVertical size={20} className="text-white/90" />
                        </motion.button>
                    )}
                </div>

                {/* 🎯 復古數據貼紙 (Draggable Stickers) */}
                {showStickers && (
                    <div
                        data-onboard="profile-stickers"
                        className={`absolute inset-x-0 top-0 h-[60dvh] ${stickerMode ? 'z-[60]' : 'z-20 pointer-events-none'}`}
                        style={{ overflow: stickerMode ? 'visible' : 'hidden' }}>

                        {activeStickers.map(id => {
                            const template = STICKER_TEMPLATES[id];
                            if (!template) return null;
                            const pos = stickerPos[id] || template.defaultPos || { x: 50, y: 50, rotation: 0 };

                            return (
                                <motion.div
                                    key={id}
                                    drag={!isGuestView && stickerMode}
                                    dragMomentum={false}
                                    dragElastic={0}
                                    onDragEnd={(e, info) => handleDragEnd(id, info)}
                                    initial={pos}
                                    animate={{
                                        x: pos.x,
                                        y: pos.y,
                                        rotate: pos.rotation,
                                        // 套用使用者縮放；排版模式微放大 1.05 倍以利操作
                                        scale: (pos.scale || 1) * (stickerMode ? 1.05 : 1)
                                    }}
                                    className={`absolute ${stickerMode ? 'pointer-events-auto cursor-grab active:cursor-grabbing' : 'pointer-events-auto cursor-pointer hover:scale-105 transition-transform'}`}
                                    style={{ transformOrigin: 'center', touchAction: stickerMode ? 'none' : 'auto' }}
                                    onClick={() => !stickerMode && setGridFilter('grid')}
                                    onTouchStart={(e) => onStickerTouchStart(id, e)}
                                    onTouchMove={(e) => onStickerTouchMove(id, e)}
                                    onTouchEnd={() => onStickerTouchEnd(id)}
                                >
                                    {template.render({
                                        workouts: gridItems.filter(i => i.type === 'lift').length,
                                        runs: gridItems.filter(i => i.type === 'run').length
                                    })}
                                    {/* 控制按鈕已移除：改用手機原生手勢 — 單指拖曳移動、雙指縮放與旋轉 */}
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                <ProfilePreviewSheet
                    open={peekSelf}
                    userId={userId}
                    seed={{ name: profile.name, avatar: profile.avatar, bio: profile.bio, city: profile.city, tag: profile.tag }}
                    onClose={() => setPeekSelf(false)}
                />

                {/* 💡 3. 個人資訊區 (集中於畫面中下半部) */}
                <div className="px-6 flex flex-col items-start mt-auto pt-10 w-full relative z-30">

                    {/* 小頭像 */}
                    <div className="w-16 h-16 rounded-full border-2 border-white/20 overflow-hidden mb-4 bg-white/10 shadow-lg shadow-black/20 z-10 relative cursor-pointer" onClick={() => setShowEdit(true)}>
                        <ProfileAvatarVisual avatar={profile?.avatar || oauthUser?.avatar} imgClassName="w-full h-full object-cover" emojiClassName="text-[30px]" />
                    </div>

                    {/* 位置標籤與運動小數據 (整合在同一排) */}
                    <div className="flex flex-wrap items-center gap-2 mb-2 w-full">
                        <div className="flex items-center gap-1.5 text-white/70 text-xs font-bold tracking-wide"
                            style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                            <span>📍</span> <span className="truncate max-w-[100px]">{profile.city || 'Taipei, Taiwan'}</span>
                        </div>
                        <div className="w-1 h-1 rounded-full bg-white/30" />
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-[9px] uppercase tracking-wider text-white/90 font-bold"
                            style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{profile.tag || 'Athlete'}</span>
                    </div>

                    {/* 使用者名稱 — Plus Jakarta Sans 超粗體 */}
                    <h1 className="leading-[0.9] tracking-tight text-white mb-4 break-words cursor-pointer active:opacity-80"
                        role="button" aria-label="看個人資料預覽" onClick={() => setPeekSelf(true)}
                        style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 'clamp(3.2rem, 14vw, 4.2rem)', fontWeight: 'normal' }}>
                        {profile.name || oauthUser?.name || 'My Profile'}
                    </h1>

                    {/* 稱號也放在自介這一區（自己選的那個；沒選就不顯示） */}
                    {!isGuestView && featuredTitle?.label && (
                        <p className="mb-2 text-[17px] italic font-semibold"
                            style={{ fontFamily: '"ChironSungHK", "Noto Serif TC", serif', color: '#F2C7A8', letterSpacing: '0.04em' }}>
                            {featuredTitle.label}
                        </p>
                    )}

                    {/* Bio */}
                    {profile.bio && (
                        <p className="text-white/60 text-sm font-medium mb-4 leading-relaxed max-w-[90%] line-clamp-2"
                            style={{ fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.02em' }}>
                            {profile.bio}
                        </p>
                    )}

                    {/* 粉絲數據 */}
                    <div className="flex items-center gap-5 text-sm text-white/60 font-bold mb-5"
                        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        <div><span className="font-black text-white text-base mr-1.5">{gridItems.length}</span> 貼文</div>
                        <div><span className="font-black text-white text-base mr-1.5">{followers}</span> 粉絲</div>
                        <div onClick={() => setShowFollowing(true)} className="cursor-pointer active:scale-95 transition-transform"><span className="font-black text-white text-base mr-1.5">{following.length}</span> 追蹤中</div>
                    </div>

                    {/* 運動總結 (原本漂浮在上面的那兩顆) - 僅在無貼紙模式顯示 */}
                    {!showStickers && (
                        <div className="w-full flex gap-2 mb-6">
                            <div className="flex-1 flex items-center justify-around py-3.5 px-6 bg-white/5 backdrop-blur-md rounded-[18px] border border-white/10">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest flex items-center gap-1.5"><Dumbbell size={12} /> Lifts</span>
                                    <span className="text-sm font-black text-white">{gridItems.filter(i => i.type === 'lift').length}</span>
                                </div>
                                <div className="w-px h-4 bg-white/10" />
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-[#F95C4B]/70 uppercase tracking-widest flex items-center gap-1.5"><Flame size={12} /> Runs</span>
                                    <span className="text-sm font-black text-[#F95C4B]">{gridItems.filter(i => i.type === 'run').length}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </div> {/* profile 固定高度區塊結束 */}

            {/* 💡 4. 分類選項 (分類層) — sticky 吸頂，讓貼文往下滑時 tab 還在 */}
            {/* 🎯 去切割感：原本是 bg-[#161415] + border-b white/10 的硬色塊，
                在 hero 影像下方形成一條刺眼的分色帶。改為與底色同色的漸層帶
                （上緣透明 → 下緣實底），髮絲線降到 white/6，接縫看不見但吸頂時仍清楚。 */}
            <div
                className="w-full flex items-center justify-around px-8 mb-2 sticky top-0 pt-2 z-40"
                style={{
                    background: 'linear-gradient(to bottom, rgba(22,20,21,0.72) 0%, #161415 55%, #161415 100%)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                {[
                    { id: 'grid', icon: <Grid size={22} strokeWidth={1.5} /> },
                    { id: 'badges', icon: <Award size={22} strokeWidth={1.5} /> },
                    { id: 'pr', icon: <TrendingUp size={22} strokeWidth={1.5} /> }
                ].map(tab => (
                    <motion.button {...pressProps('pill')} key={tab.id}
 onClick={() => setGridFilter(tab.id)}
 className={`flex flex-col items-center justify-center pb-3 relative w-16
 ${gridFilter === tab.id ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                        {tab.icon}
                        {/* Active Indicator (Bottom line) — Coral 焦點 */}
                        {gridFilter === tab.id && (
                            <motion.div layoutId="profileTabIndicator" className="absolute -bottom-[1px] left-0 w-full h-[2px] bg-[#F95C4B]" />
                        )}
                    </motion.button>
                ))}
            </div>

            {/* 底部內容 (對應不同 Filter) */}
            {/* DRVN 安全邊界：保留浮動 nav + home indicator 空間，避免最後一列被擋住。 */}
            <div className="w-full relative z-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 160px)' }}>
                <AnimatePresence mode="wait">
                    {gridFilter === 'grid' && (
                        <motion.div
                            key="grid"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="w-full"
                        >
                            {/* 三欄垂直貼文格子 — 整頁往下滑，IG 風格 */}
                            <div
                                className="grid grid-cols-3 gap-1 w-full px-1 pb-4"
                            >
                                {gridItems.map((item, index) => (
                                    <div
                                        key={item.id}
                                        onClick={() => setShowDetail(item)}
                                        className="relative rounded-[18px] overflow-hidden cursor-pointer group"
                                        style={{
                                            aspectRatio: '3/4',
                                            background: item.photo ? '#161415' : (item.type === 'run' ? 'linear-gradient(135deg, #262523 0%, #F95C4B30 100%)' : 'linear-gradient(135deg, #262523 0%, #FFFFFF15 100%)'),
                                        }}
                                    >
                                        {item.photo && (
                                            <img loading="lazy" decoding="async" src={item.photo} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                        )}
                                        {/* ══════════════════════════════════════════
                                            沒有圖片時 →【顯示數據，不放佔位圖標】
                                            使用者回報：純發數據的貼文會出現「一個很醜的火」。
                                            改成瑞士極簡數據磚：大數字＋單位＋小標，
                                            跑步顯示距離/配速、重訓顯示總容量/組數。
                                            ══════════════════════════════════════════ */}
                                        {!item.photo && (() => {
                                            const st = item.stats || item.metrics || {};
                                            const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
                                            const isRun = item.type === 'run';
                                            const km = n(st.distance ?? st.distance_km);
                                            const paceSec = n(st.avgPace ?? st.pace ?? st.pace_per_km);
                                            const vol = n(st.volume ?? st.volume_kg);
                                            const sets = n(st.sets ?? st.setCount);
                                            const fmtPaceMini = (s) => s > 0
                                                ? `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`
                                                : null;

                                            const main = isRun
                                                ? (km > 0 ? { v: km.toFixed(2), u: 'KM', l: '距離' } : null)
                                                : (vol > 0 ? { v: Math.round(vol).toLocaleString(), u: 'KG', l: '總容量' } : null);
                                            const sub = isRun
                                                ? (fmtPaceMini(paceSec) ? `${fmtPaceMini(paceSec)}/km` : null)
                                                : (sets > 0 ? `${sets} 組` : null);

                                            return (
                                                <div className="absolute inset-0 flex flex-col justify-end p-3">
                                                    <span className="block w-5 h-px mb-2" style={{ background: 'rgba(255,255,255,0.35)' }} />
                                                    {main ? (
                                                        <>
                                                            <div className="flex items-baseline gap-1">
                                                                <span className="text-white tabular-nums"
                                                                      style={{ fontSize: 26, fontWeight: 200, lineHeight: 0.95, letterSpacing: '-0.01em' }}>
                                                                    {main.v}
                                                                </span>
                                                                <span className="text-white/55" style={{ fontSize: 9, letterSpacing: '0.18em' }}>{main.u}</span>
                                                            </div>
                                                            <span className="text-white/45 mt-1" style={{ fontSize: 9, letterSpacing: '0.2em' }}>
                                                                {sub || main.l}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        // 真的沒有數據 → 誠實留白，只放一行小標，不放假圖示
                                                        <span className="text-white/40" style={{ fontSize: 9, letterSpacing: '0.24em' }}>
                                                            {isRun ? 'RUN' : 'STRENGTH'}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                                        {/* Bottom Left Stat removed per user request */}

                                        {/* Top Right Activity Icon removed per user request */}

                                        {/* Top Left PR Trophy removed per user request */}
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                    {gridFilter === 'badges' && (
                        <motion.div key="badges" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
                            <ProfileAchievementView userId={userId} />
                        </motion.div>
                    )}
                    {gridFilter === 'pr' && (
                        <motion.div key="pr" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full px-5">
                            <div className="min-h-[400px] overflow-y-auto no-scrollbar pb-10">
                                <PowerPRTrackerMobile userId={userId} embedded={true} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div> {/* 底部內容結束 */}

            {/* 🚀 Floating Action Button (FAB) for Post Creation — hidden in guest view */}
            {!isGuestView && (
                <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowComposer(true)}
                    /* 🎯 實心 Coral：主行動鈕是整頁唯一的「主角」，
                       液態玻璃會讓它被背景吃掉、對比不穩。改為純 #F95C4B 實心，
                       只保留一層 coral 光暈作為層次（不是玻璃折射）。 */
                    className="fixed bottom-32 right-6 w-14 h-14 rounded-full text-white flex items-center justify-center z-[100]"
                    style={{
                        background: '#F95C4B',
                        border: 'none',
                        backdropFilter: 'none',
                        WebkitBackdropFilter: 'none',
                        boxShadow: '0 8px 24px rgba(249,92,75,0.38), 0 2px 6px rgba(0,0,0,0.24)',
                    }}
                    aria-label="發表貼文"
                >
                    <Plus size={28} strokeWidth={2.5} />
                </motion.button>
            )}

            {/* ── Sheets ── */}
            <AnimatePresence>
                {showComposer && (
                    <IGPostComposer
                        userId={userId}
                        onClose={() => setShowComposer(false)}
                        community="run"
                        onPost={(post) => {
                            /* 🩹 三個 bug 一次修掉：
                               1. 沒有預覽照片 — 這裡讀 post.photo，但 composer 送的是
                                  images[]，photo 永遠 undefined → 格子只剩灰底。
                                  改為 images[0] 優先，並保留多重 fallback。
                               2. 貼文沒被保存 — 只 setState 沒寫 socialPostsStore，
                                  重新整理就消失（而且「貼文數」也對不回真實紀錄）。
                               3. 沒有同步到社群 — 使用者選了「發布到跑步/健身社群」
                                  也不會出現在任何 feed。現在依 targets 寫進共用貼文庫，
                                  兩個社群的 feed 都讀同一份。 */
                            const photo = post.images?.[0] || post.photo || post.drvnCard?.customImage || null;
                            const nowIso = post.created_at || new Date().toISOString();
                            const activityId = `local_${Date.now()}`;
                            const isRun = !!post.activity || post.linkedWorkout?.type === 'run';
                            const targets = post.targets || post.communities || [];

                            // 1) 寫進共用貼文庫（Profile / 跑步社群 / 健身社群 讀同一份）
                            const stored = {
                                id: `p_new_${Date.now()}`,
                                activity_id: activityId,
                                uId: userId, user_id: userId,
                                userName: profile.name || 'User',
                                user_name: profile.name || 'User',
                                type: isRun ? 'run' : 'post',
                                activity_type: isRun ? 'run' : 'post',
                                caption: post.caption || '',
                                title: post.title || null,
                                photo, routeImg: photo,
                                images: post.images || (photo ? [photo] : []),
                                targets, communities: targets,
                                visibility: post.visibility || 'public',
                                tags: post.tags || [],
                                location: post.location || null,
                                orientation: post.orientation || 'portrait',
                                imgPos: post.imgPos ?? 50,
                                kudos: 0, kudos_count: 0, commentCount: 0,
                                createdAt: nowIso, created_at: nowIso,
                                drvnCard: post.linkedWorkout || null,
                                session_data: {
                                    type: isRun ? 'run' : 'post',
                                    route: [], stats: {},
                                    drvnCard: post.linkedWorkout || null,
                                },
                            };
                            try { addSocialPost(stored, userId); } catch (e) { console.warn('[PROFILE] 貼文保存失敗', e); }

                            // 2) 立刻反映到 Profile grid（樂觀更新）
                            const newGridItem = {
                                id: activityId,
                                type: isRun ? 'run' : (post.linkedWorkout ? 'lift' : 'post'),
                                photo,
                                stat: post.linkedWorkout ? (post.linkedWorkout.type === 'run' ? `${post.linkedWorkout.dist} KM` : `${post.linkedWorkout.vol} t`) : '',
                                detail: post.caption || (post.linkedWorkout ? post.linkedWorkout.title : '貼文'),
                                caption: post.caption || '',
                                date: 'Just now',
                                visibility: post.visibility || 'public',
                                targets,
                                isLocalPost: true,
                                drvnCard: post.linkedWorkout || null,
                                dist: post.linkedWorkout?.dist,
                                pace: post.linkedWorkout?.pace,
                                dur: post.linkedWorkout?.dur,
                                vol: post.linkedWorkout?.vol,
                                weight: post.linkedWorkout?.main,
                                exercise: post.linkedWorkout?.title,
                            };
                            setGridItems(prev => [newGridItem, ...prev]);

                            // 3) 同步到後端（失敗不擋 UI — 本機已存，之後補送）
                            (async () => {
                                try {
                                    const fd = new FormData();
                                    fd.append('user_id', userId);
                                    fd.append('user_name', profile.name || 'User');
                                    fd.append('caption', post.caption || '');
                                    fd.append('privacy', post.visibility || 'public');
                                    fd.append('activity_type', isRun ? 'run' : 'post');
                                    if (photo) fd.append('photo_url', photo);
                                    fd.append('communities', JSON.stringify(targets));
                                    fd.append('session_data', JSON.stringify(stored.session_data));
                                    await apiClient.post('/api/activities/create', fd);
                                } catch (e) { /* 離線佇列會補 */ }
                            })();

                            // 4) 誠實回饋：告訴使用者這篇去了哪裡
                            try {
                                const names = targets.map(t => (t === 'run' ? '跑步社群' : '健身社群'));
                                toast.success(names.length ? `已發布到${names.join('、')}` : '已發布到你的個人檔案');
                            } catch { /* toast 未載入 */ }

                            setShowComposer(false);
                        }}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {showDetail && (
                    <DetailSheet
                        item={showDetail}
                        onClose={() => setShowDetail(null)}
                        userProfile={{ ...profile, ...oauthUser }}
                        onDelete={handleDeletePost}
                        onUpdate={handleUpdatePost}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {showEdit && <EditProfileSheet profile={profile} onSave={handleSave} onClose={() => setShowEdit(false)} />}
            </AnimatePresence>
            <AnimatePresence>
                {/* 🗑 FriendsSheet 已刪除 — 好友功能統一走 /friends-mobile 完整頁 */}
            </AnimatePresence>
            <AnimatePresence>
                {showFollowing && <FollowingSheet followingIds={following} userId={userId} onClose={() => setShowFollowing(false)} />}
            </AnimatePresence>

            <AnimatePresence>
                {showSettingsModal && (
                    <PortalSheet>
                        <motion.div
                            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="fixed inset-0 z-[100000] bg-[#161415] flex flex-col"
                        >
                            {/* 固定標題列（不隨內容捲動）— 預留 Dynamic Island/瀏海安全區，標題不被遮 */}
                            <div className="flex items-center justify-between px-6 pb-3 shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top, 12px) + 18px)' }}>
                                <h3 className="text-[28px] text-white tracking-tight" style={{ fontFamily: "'Tenor Sans', sans-serif" }}>{t('設定', 'Settings.')}</h3>
                                <motion.button {...pressProps('pill')}
 onClick={() => setShowSettingsModal(false)}
 className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10"
 >
                                    <X size={16} />
                                </motion.button>
                            </div>
                            {/* 內容捲動區（固定頁面，非彈出式）*/}
                            <div className="flex-1 overflow-y-auto px-6 pb-12">
                                <div className="space-y-7">

                                    {/* ── 會員專屬：PREMIER DRVNNER（訂閱者與永久會員）；點進去看方案 ── */}
                                    <PremierMemberCard premier={!!(subscribed || comp)} />

                                    {/* ── 1 · 帳號與身分 ───────────────────────────── */}
                                    <SettingsGroup title={t('帳號與身分', 'Account & Identity')}>
                                        <SettingsRow
                                            icon={<Edit3 size={18} />}
                                            label={t('修改個人檔案', 'Edit Profile')}
                                            sub={profile?.name ? `${profile.name}${profile?.city ? ` · ${profile.city}` : ''}` : t('還沒填基本資料', 'Not set up yet')}
                                            onClick={() => { setShowEdit(true); setShowSettingsModal(false); }}
                                        />
                                        <SettingsDivider />
                                        {/* 稱號從「修改個人檔案」搬過來 —— 它是按了立刻生效的設定，
                                            混在有存檔按鈕的表單裡會讓人以為要按儲存才算數，
                                            而且原本兩個地方各有一份入口。 */}
                                        <SettingsRow
                                            icon={<Award size={18} />}
                                            label={t('稱號', 'Title')}
                                            sub={featuredTitleLabel || t('用成就獎牌累積點數解鎖，選一個顯示在首頁', 'Unlocked with achievement medals')}
                                            value={showTitlePicker ? t('收合', 'Close') : null}
                                            onClick={() => setShowTitlePicker(v => !v)}
                                        />
                                        <AnimatePresence initial={false}>
                                            {showTitlePicker && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                                    className="overflow-hidden border-t border-white/10"
                                                >
                                                    <div className="px-4 py-3">
                                                        <IdentityTitlePicker userId={userId} />
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                        <SettingsDivider />
                                        <SettingsRow
                                            icon={<Share size={18} />}
                                            label={profileCopied ? t('已複製到剪貼簿 ✓', 'Copied ✓') : t('分享個人檔案', 'Share Profile')}
                                            sub={t('把你的 ID 傳給朋友，互相加好友', 'Send your ID to a friend')}
                                            onClick={handleShareProfile}
                                        />
                                        <SettingsDivider />
                                        <SettingsRow
                                            icon={<Settings size={18} />}
                                            label={t('切換帳號', 'Switch Account')}
                                            onClick={() => { navigate('/login'); setShowSettingsModal(false); }}
                                        />
                                    </SettingsGroup>

                                    {/* ── 2 · 隱私與社群 ───────────────────────────── */}
                                    <SettingsGroup title={t('隱私與社群', 'Privacy & Community')}>
                                        <SettingsToggle
                                            icon={<Eye size={18} />}
                                            label={t('分享我的運動動態', 'Share My Activities')}
                                            sub={shareActivities
                                                ? t('開啟中 · 好友的動態頁看得到你的跑步與重訓', 'On · friends see your runs & lifts')
                                                : t('關閉中 · 你的訓練紀錄只有自己看得到', 'Off · your training is private')}
                                            on={shareActivities}
                                            onChange={toggleShareActivities}
                                            ariaLabel="切換分享動態"
                                        />
                                        <SettingsDivider />
                                        <SettingsRow
                                            icon={<Users size={18} />}
                                            label={t('好友與社群', 'Friends & Community')}
                                            sub={t('追蹤名單、社團、動態牆', 'Following, squads and the feed')}
                                            onClick={() => { setShowSettingsModal(false); navigate('/social-mobile'); }}
                                        />
                                    </SettingsGroup>

                                    {/* ── 3 · 健康與裝置 ───────────────────────────── */}
                                    <SettingsGroup title={t('健康與裝置', 'Health & Devices')}>
                                        <div className="w-full p-4 flex items-center gap-4 text-white">
                                            <span className="w-[18px] flex justify-center shrink-0"><Heart size={18} className="text-[#F95C4B]" /></span>
                                            <motion.button
                                                {...pressProps('row')}
                                                onClick={handleRequestHealth}
                                                className="flex-1 min-w-0 text-left"
                                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                            >
                                                <span className="block font-bold tracking-wide text-white">{t('Apple 健康權限', 'Apple Health Access')}</span>
                                                {/* ⚠️ 這裡只說得出「有沒有橋接」——授權結果 iOS 端不會回傳給網頁，
                                                    所以不能寫「已授權」。寧可講得保守，也不要顯示一個猜的狀態。 */}
                                                <span className="block text-[11px] text-white/40 mt-0.5 leading-snug">
                                                    {healthBridgeReady
                                                        ? t('點一下重新請求權限（已允許過就不會再跳）', 'Tap to re-request permission')
                                                        : t('目前不在 iOS App 內，無法連接 Apple 健康', 'Not in the iOS app — Apple Health unavailable')}
                                                </span>
                                            </motion.button>
                                            <span className={`shrink-0 text-[10px] font-black tracking-widest px-2 py-1 rounded-full ${healthBridgeReady ? 'text-[#7BB661] bg-[#7BB661]/10' : 'text-white/35 bg-white/5'}`}>
                                                {healthBridgeReady ? t('可連接', 'READY') : t('網頁版', 'WEB')}
                                            </span>
                                            <motion.button
                                                {...pressProps('icon')}
                                                onClick={() => setShowHealthHelp(v => !v)}
                                                aria-label="如何設定手錶健康接收"
                                                aria-expanded={showHealthHelp}
                                                className="flex items-center justify-center shrink-0 text-white/50 hover:text-white/80"
                                                style={{ width: 32, height: 44, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                            >
                                                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center"><HelpCircle size={13} /></span>
                                            </motion.button>
                                        </div>
                                        <AnimatePresence initial={false}>
                                            {showHealthHelp && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                                    className="overflow-hidden border-t border-white/10"
                                                >
                                                    <p className="text-[11px] leading-relaxed text-white/45 px-4 py-3">
                                                        心率與卡路里由 <span className="text-white/70 font-bold">Apple Watch</span> 量測。要開啟接收：
                                                        <br />① 在 <span className="text-white/70 font-bold">Apple Watch 上打開 DRVN</span>，第一次會跳出健康授權 → 全部允許。
                                                        <br />② 手機端可到 <span className="text-white/70 font-bold">設定 ＞ 隱私權與安全性 ＞ 健康 ＞ DRVN</span> 確認。
                                                        <br />開始運動時手機會自動連線手錶，不必每次手動打開。
                                                    </p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </SettingsGroup>

                                    {/* ── 4 · 通知 ─────────────────────────────────── */}
                                    <SettingsGroup title={t('通知', 'Notifications')}>
                                        <SettingsToggle
                                            icon={<Bell size={18} />}
                                            label={t('每日訓練提醒', 'Daily Reminder')}
                                            /* 說明改成一律顯示 —— 原本只有開啟後才看得到，
                                               關著的時候完全不知道打開會發生什麼事。 */
                                            sub={reminder.enabled
                                                ? t('到點時若今天還沒練就提醒你；連續紀錄快斷時也會提醒', 'Nudges you if today is still empty')
                                                : t('打開後，到點還沒練就會提醒你', 'Get a nudge if today is still empty')}
                                            on={reminder.enabled}
                                            onChange={handleReminderToggle}
                                            ariaLabel="切換每日訓練提醒"
                                        />
                                        {reminder.enabled && (
                                            <>
                                                <SettingsDivider />
                                                <SettingsStatic label={t('提醒時間', 'Reminder Time')}>
                                                    <input
                                                        id="drvn-reminder-time"
                                                        type="time"
                                                        value={reminder.time}
                                                        onChange={(e) => handleReminderTime(e.target.value)}
                                                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm font-bold tracking-wide focus:outline-none focus:border-[#F95C4B]"
                                                    />
                                                </SettingsStatic>
                                            </>
                                        )}
                                    </SettingsGroup>

                                    {/* ── 會員：狀態、管理訂閱（Apple 審核 3.1.2 要求設定頁找得到） ── */}
                                    {gateActive && !(subscribed || comp) && (
                                    <SettingsGroup title={t('會員', 'Membership')}>
                                        <SettingsRow
                                            icon={<Sparkles size={18} />}
                                            label={subscribed || comp ? t('DRVN 會員', 'DRVN Member') : t('成為會員', 'Become a member')}
                                            sub={comp ? (comp === 'founding' ? t('創始會員，永久免費', 'Founding member, free forever') : t('永久會員，不用訂閱', 'Lifetime member')) : subscribed ? t('管理或取消訂閱', 'Manage subscription') : t('自動調整課表、進階圖表、換季一鍵套用', 'Auto-adjusting plans and advanced charts')}
                                            onClick={() => {
                                                if (comp) return;
                                                if (subscribed) { try { window.open('https://apps.apple.com/account/subscriptions', '_blank'); } catch (_) { /* ignore */ } }
                                                else openPaywall();
                                            }}
                                        />
                                    </SettingsGroup>
                                    )}

                                    {/* ── 5 · 顯示與介面 ───────────────────────────── */}
                                    {/* 「個人化設定」「進階設定」「功能卡牌區」合併 ——
                                        三個區塊講的都是「畫面上要出現什麼」。 */}
                                    <SettingsGroup title={t('顯示與介面', 'Display')}>
                                        <div className="w-full p-4 flex flex-col gap-3 text-white">
                                            <div className="flex items-center gap-4">
                                                <span className="w-[18px] flex justify-center shrink-0 opacity-60"><Zap size={18} /></span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold tracking-wide">{t('圖表', 'Charts')}</div>
                                                    <div className="text-[11px] text-white/40 mt-0.5 leading-snug">
                                                        {member ? t('要不要顯示進階分析圖表', 'Show advanced charts') : t('進階圖表是會員功能', 'Advanced charts are for members')}
                                                    </div>
                                                </div>
                                                <motion.button
                                                    {...pressProps('pill')}
                                                    onClick={() => setShowChartsHelp(v => !v)}
                                                    aria-label="說明哪些是進階圖表"
                                                    aria-expanded={showChartsHelp}
                                                    className="w-11 h-11 -m-3 shrink-0 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
                                                >
                                                    <HelpCircle size={15} />
                                                </motion.button>
                                            </div>
                                            <div className="flex bg-black/40 rounded-full p-1 border border-white/10">
                                                {[
                                                    { id: 'basic', label: t('基本', 'Basic') },
                                                    { id: 'advanced', label: t('進階', 'Advanced') },
                                                ].map((opt) => {
                                                    const on = (member ? chartLevel : 'basic') === opt.id;
                                                    return (
                                                    <motion.button
                                                        {...pressProps('pill')}
                                                        key={opt.id}
                                                        onClick={() => handleChartLevel(opt.id)}
                                                        aria-label={`圖表 ${opt.label}`}
                                                        className={`flex-1 py-2 rounded-full text-[13px] font-bold duration-300 ${on ? 'bg-[#F95C4B] text-white shadow' : 'text-white/55'}`}
                                                    >
                                                        {opt.label}
                                                    </motion.button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {/* 說明直接由圖表登記表產生：這裡列的，就是各頁真的會多出來的圖 */}
                                        <AnimatePresence initial={false}>
                                            {showChartsHelp && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                                    className="overflow-hidden border-t border-white/10"
                                                >
                                                    <div className="px-4 py-3 space-y-2 text-[12px] text-white/50 leading-relaxed">
                                                        <div className="text-[11px] font-black text-white/35 tracking-[0.2em]">{t('進階圖表', 'Advanced charts')}</div>
                                                        {Object.entries(advancedChartsBySystem()).map(([sys, names]) => (
                                                            <div key={sys}><span className="text-white/75 font-bold">{sys}</span>　{names.join('、')}</div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                        <SettingsDivider />
                                        <SettingsToggle
                                            icon={<Image size={18} />}
                                            label={t('貼紙實驗室', 'Sticker Lab')}
                                            sub={t('在成果卡上貼貼紙。開啟後可從這裡進貼紙庫', 'Decorate your result cards')}
                                            on={showStickers}
                                            onChange={() => toggleStickers()}
                                            ariaLabel="切換貼紙實驗室"
                                        />
                                        {showStickers && (
                                            <>
                                                <SettingsDivider />
                                                <SettingsRow
                                                    icon={<Sparkles size={18} />}
                                                    label={t('打開貼紙庫', 'Open Sticker Gallery')}
                                                    onClick={() => { setShowStickerGallery(true); setShowSettingsModal(false); }}
                                                />
                                            </>
                                        )}
                                        <SettingsDivider />
                                        {/* 主頁卡牌一律顯示（原本 0 張時整個區塊消失，
                                            使用者不知道「移除的卡牌可以加回來」這件事存在）。 */}
                                        <SettingsRow
                                            icon={<Grid size={18} />}
                                            label={t('主頁卡牌', 'Home Cards')}
                                            sub={hiddenHomeCards.length > 0
                                                ? t('有卡牌被你從主頁移除了，可以在這裡加回來', 'Some cards are hidden from home')
                                                : t('全部卡牌都在主頁上', 'All cards are on your home screen')}
                                            value={hiddenHomeCards.length > 0 ? t(`已移除 ${hiddenHomeCards.length}`, `${hiddenHomeCards.length} hidden`) : null}
                                            onClick={() => setShowHiddenCards(v => !v)}
                                        />
                                        <AnimatePresence initial={false}>
                                            {showHiddenCards && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                                    className="overflow-hidden border-t border-white/10"
                                                >
                                                    {hiddenHomeCards.length === 0 ? (
                                                        <p className="text-[11px] text-white/40 px-4 py-4 leading-relaxed m-0">
                                                            {t('你沒有移除過任何卡牌。長按主頁上的卡牌就可以把它收起來，收起來的會列在這裡。', 'Long-press a card on the home screen to hide it; hidden cards appear here.')}
                                                        </p>
                                                    ) : hiddenHomeCards.map((id, idx) => {
                                                        const meta = HOME_CARDS.find(c => c.id === id);
                                                        if (!meta) return null;
                                                        return (
                                                            <React.Fragment key={id}>
                                                                {idx > 0 && <SettingsDivider />}
                                                                <div className="w-full p-4 flex items-center justify-between gap-3 text-white">
                                                                    <motion.button
                                                                        {...pressProps('cta')}
                                                                        className="flex-1 min-w-0 text-left"
                                                                        onClick={() => { if (meta.route) { setShowSettingsModal(false); navigate(meta.route); } }}
                                                                    >
                                                                        <div className="font-bold tracking-wide truncate">{meta.title}</div>
                                                                        <div className="text-[11px] text-white/40 mt-0.5 leading-snug truncate">{meta.desc}</div>
                                                                        {Array.isArray(meta.subLinks) && (
                                                                            <div className="flex gap-2 mt-2 flex-wrap">
                                                                                {meta.subLinks.map(sl => (
                                                                                    <span
                                                                                        key={sl.route}
                                                                                        onClick={(e) => { e.stopPropagation(); setShowSettingsModal(false); navigate(sl.route); }}
                                                                                        className="text-[11px] font-bold px-2 py-1 rounded-full bg-white/10 text-white/70 active:bg-white/20"
                                                                                    >
                                                                                        {sl.label} →
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </motion.button>
                                                                    <motion.button
                                                                        {...pressProps('pill')}
                                                                        onClick={() => { restoreHomeCard(getUserId(), id); haptic('light'); }}
                                                                        className="shrink-0 text-[11px] font-black px-3 py-2 rounded-full"
                                                                        style={{ background: 'rgba(249,92,75,0.15)', color: '#F95C4B', border: '1px solid rgba(249,92,75,0.35)' }}
                                                                    >
                                                                        {t('加回主頁', 'Add Back')}
                                                                    </motion.button>
                                                                </div>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </SettingsGroup>

                                    {/* ── 6 · 說明與支援 ───────────────────────────── */}
                                    <SettingsGroup title={t('說明與支援', 'Help & Support')}>
                                        <SettingsRow
                                            icon={<Sparkles size={18} />}
                                            label={t('重新設定精靈', 'Re-run Setup Wizard')}
                                            sub={t('重走一次註冊與課表生成流程', 'Redo onboarding and plan setup')}
                                            onClick={() => { setShowSettingsModal(false); navigate('/onboarding-wizard', { state: { from: 'settings' } }); }}
                                        />
                                        <SettingsDivider />
                                        <SettingsRow
                                            icon={<HelpCircle size={18} />}
                                            label={t('重啟教學導覽', 'Restart Tutorial')}
                                            sub={t('重新播放主頁的聚光燈引導', 'Replay the guided tour')}
                                            onClick={handleRestartTutorial}
                                        />
                                        <SettingsDivider />
                                        <SettingsRow
                                            icon={<MessageCircle size={18} />}
                                            label={t('給我們回饋', 'Send Feedback')}
                                            sub={t('哪裡不好用、想要什麼功能，直接說', 'Tell us what is missing')}
                                            onClick={() => { setShowFeedback(true); setFbScore(null); setFbText(''); }}
                                        />
                                    </SettingsGroup>

                                    {/* ── 7 · 資料與法律 ───────────────────────────── */}
                                    <SettingsGroup title={t('資料與法律', 'Data & Legal')}>
                                        <SettingsRow
                                            icon={<Download size={18} />}
                                            label={exporting ? t('匯出中…', 'Exporting…') : t('匯出我的資料', 'Export My Data')}
                                            sub={t('把你所有的訓練紀錄下載成檔案', 'Download everything you have logged')}
                                            onClick={exporting ? undefined : handleExportData}
                                        />
                                        <SettingsDivider />
                                        <SettingsRow icon={<FileText size={18} />} label={t('免責聲明', 'Disclaimer')} onClick={() => setLegalDoc('disclaimer')} />
                                        <SettingsDivider />
                                        <SettingsRow icon={<Shield size={18} />} label={t('隱私政策', 'Privacy Policy')} onClick={() => setLegalDoc('privacy')} />
                                        <SettingsDivider />
                                        <SettingsRow icon={<FileText size={18} />} label={t('服務條款', 'Terms of Service')} onClick={() => setLegalDoc('terms')} />
                                        <SettingsDivider />
                                        {/* 清除帳號資料從「系統與安全」搬到這裡 ——
                                            它跟匯出是同一件事的兩面，放在一起才找得到。 */}
                                        <SettingsRow
                                            icon={<Trash2 size={18} />}
                                            label={t('刪除帳號', 'Delete Account')}
                                            sub={t('帳號與所有紀錄一起刪除，無法復原', 'Deletes your account and all data')}
                                            onClick={() => { setShowDeleteConfirm(true); setDeleteStep('confirm'); setDeleteError(''); }}
                                            danger
                                        />
                                    </SettingsGroup>

                                    {/* ── 登出 + 版本 ──────────────────────────────── */}
                                    <div className="pt-1 space-y-4">
                                        <motion.button
                                            {...pressProps('pill')}
                                            onClick={handleLogout}
                                            className="w-full bg-transparent hover:bg-[#F95C4B]/10 transition-colors p-4 rounded-[18px] flex items-center justify-center text-[#F95C4B] border border-[#F95C4B]/30"
                                        >
                                            <div className="flex items-center gap-2 font-black tracking-[0.15em] uppercase text-xs">
                                                <Power size={16} strokeWidth={2.5} /> {t('登出', 'Log Out')}
                                            </div>
                                        </motion.button>
                                        {/* 上架後使用者回報問題時，第一句話一定是「你是哪個版本」。
                                            原本這一頁沒有任何地方寫版本號。 */}
                                        <p className="text-center text-[10px] font-bold tracking-[0.2em] text-white/25 m-0">
                                            DRVN {APP_VERSION}
                                        </p>
                                    </div>

                                    {/* 法律文件全屏閱讀層（portal 到 body） */}
                                    <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
                                </div>
                            </div>
                        </motion.div>
                    </PortalSheet>
                )}

                {showStickerGallery && (
                    <StickerGallery
                        onClose={() => setShowStickerGallery(false)}
                        onSave={() => {
                            setShowStickerGallery(false);
                            setStickerMode(true);
                        }}
                        onSelect={toggleStickerSelection}
                        activeStickers={activeStickers}
                    />
                )}

                {/* ── 📣 意見回饋 Dialog（NPS 0-10 + 文字）── */}
                {showFeedback && (
                    <PortalSheet>
                        <motion.div
                            key="feedback-sheet"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', inset: 0, zIndex: 200000,
                                background: 'rgba(22,20,21,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                            }}
                            onClick={() => !fbSending && setShowFeedback(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.94, y: 12, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
                                transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: '100%', maxWidth: 380, borderRadius: 22, background: '#F6F4F1',
                                    border: '1px solid rgba(22,20,21,0.10)', boxShadow: '0 30px 70px -22px rgba(0,0,0,0.45)',
                                    padding: '24px 22px',
                                }}
                            >
                                <div style={{ width: 22, height: 2, background: '#F95C4B', marginBottom: 12 }} />
                                <div style={{ fontSize: 17, fontWeight: 900, color: '#161415', marginBottom: 6 }}>
                                    {t('DRVN 值得推薦給朋友嗎？', 'Would you recommend DRVN?')}
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.5)', marginBottom: 16 }}>
                                    {t('0 = 完全不會 · 10 = 一定會', '0 = Never · 10 = Absolutely')}
                                </div>
                                {/* NPS 0-10 */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 4, marginBottom: 16 }}>
                                    {Array.from({ length: 11 }, (_, i) => (
                                        <motion.button {...pressProps('row')}
 key={i}
 onClick={() => setFbScore(i)}
 style={{
 aspectRatio: '1', borderRadius: 8, border: 'none',
 fontSize: 11.5, fontWeight: 800,
 background: fbScore === i ? '#161415' : 'rgba(22,20,21,0.06)',
 color: fbScore === i ? '#F6F4F1' : 'rgba(22,20,21,0.65)',
 transition: 'all .15s',
 }}
 >
                                            {i}
                                        </motion.button>
                                    ))}
                                </div>
                                <textarea
                                    value={fbText}
                                    onChange={(e) => setFbText(e.target.value)}
                                    placeholder={t('最想改哪裡？最喜歡哪裡？（選填）', 'What should we fix? What do you love? (optional)')}
                                    rows={3}
                                    maxLength={480}
                                    style={{
                                        width: '100%', borderRadius: 14, border: '1px solid rgba(22,20,21,0.12)',
                                        background: '#FFFFFF', padding: '12px 14px', fontSize: 13.5, color: '#161415',
                                        resize: 'none', outline: 'none', marginBottom: 16, fontFamily: 'inherit',
                                    }}
                                />
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <motion.button {...pressProps('row')}
 onClick={() => setShowFeedback(false)}
 disabled={fbSending}
 style={{ flex: 1, padding: '13px 0', borderRadius: 999, border: '1px solid rgba(22,20,21,0.15)', background: 'transparent', fontSize: 13, fontWeight: 800, color: 'rgba(22,20,21,0.6)' }}
 >
                                        {t('下次再說', 'Later')}
                                    </motion.button>
                                    <motion.button {...pressProps('row')}
 onClick={submitFeedback}
 disabled={fbSending}
 style={{ flex: 1.4, padding: '13px 0', borderRadius: 999, border: 'none', background: '#161415', fontSize: 13, fontWeight: 800, color: '#F6F4F1', opacity: fbSending ? 0.6 : 1 }}
 >
                                        {fbSending ? t('送出中…', 'Sending…') : t('送出回饋', 'Send')}
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </PortalSheet>
                )}

                {/* ── 清除帳號確認 Dialog ── */}
                {showDeleteConfirm && (
                    <PortalSheet>
                        <motion.div
                            key="delete-confirm"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', inset: 0, zIndex: 200000,
                                background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: '0 24px',
                            }}
                            onClick={() => { if (deleteStep === 'confirm') setShowDeleteConfirm(false); }}
                        >
                            <motion.div
                                initial={{ scale: 0.88, y: 24, opacity: 0 }}
                                animate={{ scale: 1, y: 0, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                                style={{
                                    background: '#161415',
                                    border: '1px solid rgba(255,60,60,0.2)',
                                    borderRadius: 28, padding: '32px 28px',
                                    maxWidth: 360, width: '100%', textAlign: 'center',
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                {/* confirm 步驟 */}
                                {deleteStep === 'confirm' && (<>
                                    <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
                                    <p style={{ fontSize: 18, fontWeight: 800, color: '#F6F4F1', marginBottom: 10 }}>刪除帳號？</p>
                                    <p style={{ fontSize: 13, color: 'rgba(246,244,241,0.6)', lineHeight: 1.65, marginBottom: subscribed ? 14 : 28 }}>
                                        帳號本身和所有訓練紀錄、個人檔案、貼文、跑步紀錄都會一起刪除，<b style={{ color: 'rgba(246,244,241,0.85)' }}>無法復原</b>。刪除後會登出。
                                    </p>
                                    {/* App Store 5.1.1(v)：有訂閱的 App，刪除帳號時要告訴使用者 Apple 的扣款不會自動停止 */}
                                    {subscribed && (
                                        <p style={{ fontSize: 12, color: 'rgba(246,244,241,0.6)', lineHeight: 1.6, marginBottom: 24, padding: '10px 12px', borderRadius: 12, background: 'rgba(212,197,165,0.10)', border: '1px solid rgba(212,197,165,0.25)' }}>
                                            訂閱由 Apple 扣款，刪除帳號不會自動取消。
                                            <button type="button" onClick={openManageSubscriptions}
                                                style={{ color: '#D4C5A5', fontWeight: 800, background: 'none', border: 'none', padding: 0, marginLeft: 4, cursor: 'pointer', textDecoration: 'underline' }}>
                                                先去取消訂閱
                                            </button>
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <motion.button {...pressProps('row')}
 onClick={handleDeleteAccount}
 style={{
 width: '100%', padding: '14px 0',
 background: '#D94030', border: 'none',
 borderRadius: 18, fontSize: 14,
 fontWeight: 800, color: '#fff',
 letterSpacing: '0.04em', cursor: 'pointer',
 }}
 >
                                            確認刪除帳號
                                        </motion.button>
                                        <motion.button {...pressProps('row')}
 onClick={() => setShowDeleteConfirm(false)}
 style={{
 width: '100%', padding: '14px 0',
 background: 'rgba(255,255,255,0.06)',
 border: '1px solid rgba(255,255,255,0.08)',
 borderRadius: 18, fontSize: 14,
 fontWeight: 700, color: 'rgba(246,244,241,0.6)',
 cursor: 'pointer',
 }}
 >
                                            取消
                                        </motion.button>
                                    </div>
                                </>)}

                                {/* deleting 步驟 */}
                                {deleteStep === 'deleting' && (<>
                                    <div style={{ margin: '0 auto 20px', width: 48, height: 48, borderRadius: '50%', border: '2px solid rgba(217,64,48,0.3)', borderTopColor: '#D94030', animation: 'spin 0.9s linear infinite' }} />
                                    <p style={{ fontSize: 15, fontWeight: 700, color: '#F6F4F1' }}>刪除中，請稍候...</p>
                                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                                </>)}

                                {/* done 步驟 */}
                                {deleteStep === 'done' && (<>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                                    <p style={{ fontSize: 16, fontWeight: 800, color: '#F6F4F1', marginBottom: 8 }}>帳號已刪除</p>
                                    <p style={{ fontSize: 13, color: 'rgba(246,244,241,0.5)' }}>正在回到登入頁…</p>
                                </>)}

                                {/* error 步驟 */}
                                {deleteStep === 'error' && (<>
                                    <div style={{ fontSize: 44, marginBottom: 16 }}>❌</div>
                                    <p style={{ fontSize: 16, fontWeight: 800, color: '#F6F4F1', marginBottom: 8 }}>刪除失敗</p>
                                    <p style={{ fontSize: 12, color: 'rgba(220,38,38,0.8)', marginBottom: 24, wordBreak: 'break-all' }}>{deleteError}</p>
                                    <motion.button {...pressProps('row')}
 onClick={() => setShowDeleteConfirm(false)}
 style={{
 width: '100%', padding: '12px 0',
 background: 'rgba(255,255,255,0.08)',
 border: '1px solid rgba(255,255,255,0.1)',
 borderRadius: 12, fontSize: 14,
 fontWeight: 700, color: 'rgba(246,244,241,0.7)',
 cursor: 'pointer',
 }}
 >
                                        關閉
                                    </motion.button>
                                </>)}
                            </motion.div>
                        </motion.div>
                    </PortalSheet>
                )}
            </AnimatePresence>

            {/* Bottom navigation — hidden when viewing a friend's profile */}
            {!isGuestView && <MobileNavigation />}
        </div>
    );
};

export default UserProfileFormMobile;
