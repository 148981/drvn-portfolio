import React, { useState, useEffect, useCallback } from 'react';
import { useVisibilityInterval } from '../hooks/useVisibilityInterval';
import { motion, AnimatePresence } from 'framer-motion';
import StrideWordmark from './ui/StrideWordmark';
import {
    Activity, Trophy, Users, User, RefreshCcw, Map, Plus, X,
    MessageCircle, ArrowUp, Share2, Heart, MoreHorizontal, MoreVertical,
    ChevronLeft, ChevronRight, ChevronDown, X as XIcon, Calendar as CalIcon,
    Award, TrendingUp, Info, Pencil, Trash2, Search
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { OFFICIAL_EVENTS, getOfficialEvents, PERMANENT_CHALLENGES } from '../utils/socialDataConnector';
import FeedFilterTabs from './SocialFeed/FeedFilterTabs';
import FollowSuggestions from './SocialFeed/FollowSuggestions';
import { triggerHaptic, getSvgPathFromRoute, resolvePostDate, resolvePostAuthorName } from './SocialFeed/communityHelpers';
import { PortalSheet, Lbl, renderCaption, CommentSheet, KudosSheet, SegmentBadges, EditPostSheet, HeroCards } from './SocialFeed/communityShared';
import { getUserId } from '../utils/auth';
import { getSocialPosts } from '../utils/socialPostsStore';
// 🧩 動態牆的單一資料層 —— 映射／去重／排序只有一份（見 utils/socialFeed.js）
// 🧩 社群共用層：行為（hook）與外框（分頁列 / 骨架 / 空狀態 / 離線提示）
import { useCommunityFeed } from './SocialFeed/useCommunityFeed';
import { usePendingFriendRequests } from './SocialFeed/usePendingFriendRequests';
import { CommunityTabBar, CommunityMasthead, CommunitySwitch, FeedCardSkeleton, FeedEmptyState, FeedOfflineNotice } from './SocialFeed/CommunityChrome';
// 🎬 按壓回饋預設 —— 與飲食系統／其他社群頁共用同一份手感
import { pressProps } from '../utils/nutritionMotion';
// 🪪 送給後端的身分 —— 留言/按讚不再一律署名「我」（見 utils/socialIdentity.js）
import { resolvePostAvatar } from './SocialFeed/communityHelpers';

import GrowthAchievementSystem, { GrowthAchievementProfileCard } from './GrowthAchievementSystem';
import RankingBoard from './RankingBoard';
import RunningPulseRanking from './RunningPulseRanking';
import SquadsView from './SquadsView';
import MobileNavigation from './MobileNavigation';
import IGPostComposer from './IGPostComposer';
import { DataStatCard, MeetupCard } from './PostBodyCards';
import { FeedPostShell, PostPhotos } from './SocialFeed/FeedPost';
import { RunningFeatureCard, RunningApexCard, RunningPhysioCard } from './RunningCardComponents';
import { FeatureCard, PeakCard, ReportCard } from './FitnessCardComponents';
import imgFitness from '../assets/desktop/Found on Cosmos.jpeg';
import imgGear from '../assets/desktop/123.jpeg';
import DataPulse from './ui/DataPulse';
import PermanentChallenges from './SocialFeed/PermanentChallenges';
import BlockedUsersRow from './SocialFeed/BlockedUsersRow';
import { sessionVolume, exerciseVolume } from '../utils/strengthMath';


const C = {
    page: '#F6F4F1',        // Paper底色
    paper: '#161415',       // Swiss Noir Charcoal (Text/Accents)
    white: '#F6F4F1',       // Paper White
    stone: '#E4DED2',       // Stone
    sub: '#8A7E73',         // 次要文字 (暖灰)
    pebble: '#CFC6B8',      // Pebble分隔線
    coral: '#F95C4B',       // Coral
    ember: '#D94030',       // Ember
    textPrimary: '#161415', // Deep Black
    textMuted: '#8A7E73',   // 雜誌質感的次要文字
    highlight: '#F95C4B',   // 點綴色
    black: '#161415',       // Deep Black
    bg: '#F6F4F1',          // Paper
    textDim: 'rgba(22, 20, 21, 0.3)',
    textHero: '#161415',    // 標題字
    // ── Aliases (修正先前 undefined key 造成的顏色 fallback) ──
    accent: '#F95C4B',      // = coral，供 renderCaption @提及使用
    text: '#161415',        // = textPrimary，供 CommentSheet 使用
};


// （已移除未使用的 MOCK_FEED 假資料；feed 一律走真實後端，無資料時顯示 FeedEmptyState）

// 🔴 零模擬數據：原 MOCK_COMMENTS 假留言已移除（CommentSheet 一律走真實留言 API）


/* ═══ RUN CARD (Feed Item - DRVN Strava Style) ═══ */
// ══════════════════════════════════════════════════════════════════════════
// 🗓️ 貼文時間／作者防呆
//
//    使用者回報：貼文標頭出現「訪客用戶 · NaN/NaN · invalid date」。
//    成因：`new Date(post.createdAt || Date.now())` —— createdAt 若是
//    「有值但無法解析」的字串（空字串以外的髒值、後端未帶時區的格式），
//    `new Date()` 會回 Invalid Date，getMonth() 就是 NaN，
//    `|| Date.now()` 這道 fallback 完全擋不到（因為它只擋 falsy）。
//
//    規則（使用者要求）：一律用「發文者發文當下」的名稱與時間，
//    多來源依序 fallback，全部解析失敗才用現在時間，永不顯示 NaN。
// ══════════════════════════════════════════════════════════════════════════
// 時間／作者防呆搬到 SocialFeed/communityHelpers（兩個社群共用一份）；這裡保留同名匯出給舊的引用端。
export { resolvePostDate, resolvePostAuthorName };

export const RunCard = ({ post, onKudo, onComment, onShowKudoers, onDelete, onEdit, isOwner, index = 0, hideHeader = false, surface = 'plain' }) => {

    const raw = post.raw || {};
    const card = raw.drvnCard || {};
    const accent = card.accentColor || '#F95C4B'; // DRVN Coral (was #D94030 — off-palette)

    // 🚀 Native Hydration 判斷:與 FitnessCommunityPage.StrengthCard 完全相同的邏輯
    let drvn = raw.drvnCard || post.drvnCard;

    // 1. Bulletproof extraction from nested session_data
    if (!drvn && raw.session_data) {
        try {
            const sd = typeof raw.session_data === 'string' ? JSON.parse(raw.session_data) : raw.session_data;
            drvn = sd.drvnCard;
        } catch (e) { }
    }

    // 2. 🛠️ LocalStorage Rescue: If server data is missing drvnCard, look for it locally
    if (!drvn && raw.activity_id) {
        try {
            const localItems = getSocialPosts(raw.user_id);
            const match = localItems.find(it => String(it.activity_id) === String(raw.activity_id));
            if (match?.drvnCard) drvn = match.drvnCard;
        } catch (e) { }
    }

    if (typeof drvn === 'string') {
        try { drvn = JSON.parse(drvn); } catch (e) { /* ignore */ }
    }

    const isFitnessPost = raw.activity_type === 'fitness' || raw.activity_type === 'strength' || post.type === 'fitness';
    // 純照片貼文（type/activity_type === 'post'）不算跑步；只有明確標記 run、或帶有跑步 stats 的舊資料才算
    const isPhotoPost = raw.activity_type === 'post' || post.type === 'post';
    const hasRunStats = !!(post.stats && (post.stats.distance || post.stats.pace || post.stats.duration));
    const isRunPost = !isFitnessPost && !isPhotoPost && (raw.activity_type === 'run' || post.type === 'run' || (!raw.activity_type && hasRunStats));
    // 🎯 拔除名稱限制：只要有 layout 屬性，就嘗試使用新渲染！
    const canHydrateRunCard = Boolean(isRunPost && drvn && drvn.layout);
    const canHydrateFitnessCard = Boolean(isFitnessPost && drvn && drvn.layout);

    let dist = Number(post.stats?.distance || 0);
    let pace = Number(post.stats?.pace || 0);
    let duration = Number(post.stats?.duration || 0);

    const routeData = card.route || raw.route_preview || raw.route || [];
    let svgPath = getSvgPathFromRoute(routeData, 300, 120);

    const fmtPaceDark = (s) => {
        if (!s) return "--'--";
        const m = Math.floor(s / 60);
        const sc = Math.floor(s % 60);
        return `${m}:${String(sc).padStart(2, '0')}`;
    };

    const fmtTimeDark = (s) => {
        if (!s) return '0:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
        return `${m}:${String(sec).padStart(2, '0')}`;
    };

    const isFitness = post.activity_type === 'fitness' || post.type === 'fitness';
    const isGeneratedLayout = post.drvnCard && post.drvnCard.layoutMode !== undefined;
    const heartRate = Number(post.metrics?.heartRate || post.stats?.heartRate) || null;   // 沒量到就不顯示，不編 135
    const calories = post.metrics?.calories || post.stats?.calories || 0;
    const exercisesList = card.exercises || post.stats?.exercises || [];
    const isPureMeetup = post.meetup && !post.photo && !raw.photo_url && !post.routeImg && !card.customImage;

    /* 媒體區（照片／DRVN 卡牌／純數據卡）—— 外框（頭像列、動作列、文字）交給 FeedPostShell。
       W 是這一則實際量到的寬度：左右滿版之後，卡牌依它等比縮放。 */
    const renderMedia = (W) => (
            (isPhotoPost && !drvn && (post.photo || post.routeImg || raw.photo_url)) ? (
                <PostPhotos post={post} />
            ) : canHydrateFitnessCard ? (
                /* 💪 Fitness Native Hydration: FeatureCard / PeakCard / ReportCard
                   🩹 外框比照跑步貼文：卡牌往側邊闊出去、貼齊貼文外框（負 margin 吃掉容器左右 padding） */
                (() => {
                    const feedWidth = W;
                    const editorW = drvn.editorWidth || 390;
                    const editorH = drvn.editorHeight || Math.round(editorW * 4 / 3);
                    const scale = feedWidth / editorW;
                    const cardState = (drvn.cardStates && drvn.cardStates[drvn.layout]) || { x: 0, y: 0, scale: 1, opacity: 100 };
                    return (
                        <div style={{
                            position: 'relative', width: '100%',
                            height: feedWidth * (editorH / editorW),
                            backgroundColor: '#161415', overflow: 'hidden',
                        }}>
                            <div style={{
                                position: 'absolute', top: 0, left: 0,
                                width: editorW, height: editorH,
                                transform: `scale(${scale})`,
                                transformOrigin: 'top left',
                                pointerEvents: 'none'
                            }}>
                                {drvn.customImage ? (
                                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${drvn.customImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                                ) : (
                                    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 30% 30%, #F95C4B18 0%, transparent 60%)` }} />
                                )}
                                <div style={{ position: 'absolute', inset: 0, background: drvn.customImage ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)' }} />
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{
                                        position: 'relative',
                                        transform: `translate(${cardState.x}px, ${cardState.y}px)`,
                                        willChange: 'transform',
                                        width: ['POSTER', 'FEATURE'].includes(drvn.layout?.toUpperCase()) ? editorW : 'auto',
                                        height: ['POSTER', 'FEATURE'].includes(drvn.layout?.toUpperCase()) ? editorH : 'auto',
                                    }}>
                                        <div style={{ transform: `scale(${cardState.scale})`, transformOrigin: 'center' }}>
                                            {['POSTER', 'FEATURE'].includes(drvn.layout?.toUpperCase()) && (
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
                                            {['PR', 'PEAK', 'APEX'].includes(drvn.layout?.toUpperCase()) && (
                                                <PeakCard
                                                    featuredPR={drvn.featuredPR || { name: 'Workout', weight: 0 }}
                                                    isNewRecord={drvn.isNewRecord || false}
                                                    bgOpacity={cardState.opacity}
                                                />
                                            )}
                                            {['MINIMAL', 'REPORT', 'PHYSIO'].includes(drvn.layout?.toUpperCase()) && (
                                                <ReportCard
                                                    processedExercises={drvn.processedExercises || []}
                                                    calories={drvn.calories || 0}
                                                    bgOpacity={cardState.opacity}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()
            ) : canHydrateRunCard ? (
                /* 🚀 Native Hydration: 與 FitnessCommunityPage.StrengthCard 完全相同的渲染邏輯 */
                <div style={{
                    position: 'relative', width: '100%',
                    height: W * ((drvn.editorHeight || 693) / (drvn.editorWidth || 390)),
                    backgroundColor: '#161415', overflow: 'hidden'
                }}>
                    {/* Dynamic Scaler: 自動適配目前手機螢幕與創建時手機螢幕的比例差距 */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: drvn.editorWidth || 390, height: drvn.editorHeight || 693,
                        transform: `scale(${W / (drvn.editorWidth || 390)})`,
                        transformOrigin: 'top left',
                        pointerEvents: 'none'
                    }}>
                        {/* Background Photo */}
                        {drvn.customImage && (
                            <div className="absolute inset-0 w-full h-full" style={{
                                backgroundImage: `url(${drvn.customImage})`,
                                backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat'
                            }} />
                        )}
                        <div className="absolute inset-0 bg-black/20" />

                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {(drvn.layout === 'POSTER' || drvn.layout === 'FEATURE') && (drvn.cardStates?.POSTER || drvn.cardStates?.FEATURE) && (
                                <div style={{
                                    position: 'relative',
                                    transform: `translate(${(drvn.cardStates?.POSTER || drvn.cardStates?.FEATURE)?.x || 0}px, ${(drvn.cardStates?.POSTER || drvn.cardStates?.FEATURE)?.y || 0}px)`,
                                    willChange: 'transform'
                                }}>
                                    <div style={{ transform: `scale(${(drvn.cardStates?.POSTER || drvn.cardStates?.FEATURE)?.scale || 1})`, transformOrigin: 'center' }}>
                                        <RunningFeatureCard data={drvn} bgOpacity={(drvn.cardStates?.POSTER || drvn.cardStates?.FEATURE)?.opacity ?? 35} />
                                    </div>
                                </div>
                            )}
                            {(drvn.layout === 'PEAK' || drvn.layout === 'PR' || drvn.layout === 'APEX') && (drvn.cardStates?.PEAK || drvn.cardStates?.PR || drvn.cardStates?.APEX) && (
                                <div style={{
                                    position: 'relative',
                                    transform: `translate(${(drvn.cardStates?.PEAK || drvn.cardStates?.PR || drvn.cardStates?.APEX)?.x || 0}px, ${(drvn.cardStates?.PEAK || drvn.cardStates?.PR || drvn.cardStates?.APEX)?.y || 0}px)`,
                                    willChange: 'transform'
                                }}>
                                    <div style={{ transform: `scale(${(drvn.cardStates?.PEAK || drvn.cardStates?.PR || drvn.cardStates?.APEX)?.scale || 1})`, transformOrigin: 'center' }}>
                                        <RunningApexCard data={drvn} bgOpacity={(drvn.cardStates?.PEAK || drvn.cardStates?.PR || drvn.cardStates?.APEX)?.opacity ?? 85} />
                                    </div>
                                </div>
                            )}
                            {(drvn.layout === 'REPORT' || drvn.layout === 'MINIMAL' || drvn.layout === 'PHYSIO') && (drvn.cardStates?.REPORT || drvn.cardStates?.MINIMAL || drvn.cardStates?.PHYSIO) && (
                                <div style={{
                                    position: 'relative',
                                    transform: `translate(${(drvn.cardStates?.REPORT || drvn.cardStates?.MINIMAL || drvn.cardStates?.PHYSIO)?.x || 0}px, ${(drvn.cardStates?.REPORT || drvn.cardStates?.MINIMAL || drvn.cardStates?.PHYSIO)?.y || 0}px)`,
                                    willChange: 'transform'
                                }}>
                                    <div style={{ transform: `scale(${(drvn.cardStates?.REPORT || drvn.cardStates?.MINIMAL || drvn.cardStates?.PHYSIO)?.scale || 1})`, transformOrigin: 'center' }}>
                                        <RunningPhysioCard data={drvn} bgOpacity={(drvn.cardStates?.REPORT || drvn.cardStates?.MINIMAL || drvn.cardStates?.PHYSIO)?.opacity ?? 90} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (() => {
                // 是否有任何照片/路線圖背景 → 沒有就走「圖三瑞士極簡純數據排版」（Paper 底）
                const hasBg = !!(card.customImage || raw.photo_url || post.routeImg || post.photo);
                if (!isGeneratedLayout && !hasBg) {
                    // ── 無照片：共用瑞士極簡純數據卡（與發帖預覽同一組件）──
                    const distVal = (typeof dist === 'number' ? dist : parseFloat(dist) || 0);
                    return isFitness ? (
                        <DataStatCard
                            type="fitness"
                            bigValue={(post.stats?.volume || post.metrics?.volume_kg || post.stats?.volume_kg || 0).toLocaleString()}
                            bigUnit="kg"
                            label="總訓練量"
                            rows={[['運動時間', `${Math.floor(duration / 60)} 分`], ['消耗熱量', `${calories} 大卡`]]}
                            bleed
                        />
                    ) : (
                        <DataStatCard
                            type="run"
                            bigValue={distVal.toFixed(2)}
                            bigUnit="km"
                            label="總距離"
                            rows={[['配速', `${fmtPaceDark(pace)} /公里`], ['時間', fmtTimeDark(duration)]]}
                            bleed
                        />
                    );
                }
                // 🖼 Generated snapshot：用快照建立時的真實長寬比（editorWidth/Height）撐開容器，
                //     讓圖片用 cover 完整填滿、不再被 9/16 直框 + contain 壓出黑邊（與 feed 其他卡同一比例邏輯）
                const snapW = post.drvnCard?.editorWidth || 390;
                const snapH = post.drvnCard?.editorHeight || Math.round(snapW * 16 / 9);
                return (
                <div style={{
                    position: 'relative', width: '100%',
                    aspectRatio: isGeneratedLayout ? `${snapW} / ${snapH}` : '4/4.5',
                    background: isGeneratedLayout ? '#161415' : 'linear-gradient(to bottom, #2B2B2B 0%, #161415 40%, #161415 100%)',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: isGeneratedLayout ? '0' : '32px 20px 20px', color: 'white'
                }}>
                    {isGeneratedLayout ? (
                        /* Display Generated High-Fidelity Snapshot — cover 填滿，比例由容器決定 */
                        <img loading="lazy" decoding="async" src={post.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Drvn Layout" />
                    ) : (
                        /* Legacy ActivityCard Render for old posts */
                        <>
                            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E")`, zIndex: 0, pointerEvents: 'none' }} />
                            {(card.customImage || raw.photo_url || post.routeImg || post.photo) && (
                                <div style={{ position: 'absolute', inset: 0, background: `url(${card.customImage || raw.photo_url || post.routeImg || post.photo}) center/cover`, filter: 'brightness(0.35) contrast(1.1) blur(1px)', zIndex: 0 }} />
                            )}

                            <div style={{ position: 'relative', zIndex: 1, marginBottom: 28 }}>
                                <p style={{ fontSize: 14, fontWeight: 900, color: 'white', letterSpacing: '0.25em', margin: 0, textTransform: 'uppercase' }}>
                                    {isFitness ? 'DRVN 重訓' : 'DRVN'}
                                </p>
                            </div>

                            {isFitness ? (
                                <>
                                    <div style={{ position: 'relative', zIndex: 1, marginBottom: '40px', textAlign: 'center' }}>
                                        {(() => {
                                            const scores = exercisesList.flatMap(ex => Array.isArray(ex.sets) ? ex.sets.map(s => s.effortScore || 0) : []);
                                            const avgEffort = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : (post.stats?.effortScore || 0); // fallback or 0
                                            return (
                                                <>
                                                    <div style={{ display: 'inline-block' }}>
                                                        <span style={{ fontSize: '110px', fontWeight: 900, lineHeight: 1, letterSpacing: '-4px', fontStyle: 'italic', color: '#F95C4B' }}>{avgEffort}</span>
                                                        <span style={{ fontSize: '20px', fontWeight: 900, fontStyle: 'italic', marginLeft: '4px', color: '#F95C4B' }}>%</span>
                                                    </div>
                                                    <p style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.02em', marginTop: '-8px', opacity: 0.4, color: 'white' }}>強度分數</p>
                                                </>
                                            );
                                        })()}
                                    </div>

                                    <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', rowGap: '32px', columnGap: '16px', marginBottom: '36px' }}>
                                        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px', textAlign: 'left' }}>
                                            <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.4, margin: '0 0 4px', color: 'white' }}>總訓練量</p>
                                            <p style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'white', margin: 0 }}>{(post.stats?.volume || post.metrics?.volume_kg || post.stats?.volume_kg || 0).toLocaleString()}<span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.5 }}>KG</span></p>
                                        </div>
                                        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px', textAlign: 'left' }}>
                                            <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.4, margin: '0 0 4px', color: 'white' }}>運動時間</p>
                                            <p style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'white', margin: 0 }}>{Math.floor(duration / 60)}<span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.5 }}>MIN</span></p>
                                        </div>
                                        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px', textAlign: 'left' }}>
                                            <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.4, margin: '0 0 4px', color: 'white' }}>消耗熱量</p>
                                            <p style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'white', margin: 0 }}>{calories}<span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.5 }}>KCAL</span></p>
                                        </div>
                                        {heartRate && (
                                            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px', textAlign: 'left' }}>
                                                <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.4, margin: '0 0 4px', color: 'white' }}>平均心率</p>
                                                <p style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'white', margin: 0 }}>{heartRate}<span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.5 }}>BPM</span></p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* 距離主數字 */}
                                    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 24 }}>
                                        <p style={{ fontSize: 72, fontWeight: 300, color: 'white', lineHeight: 1, margin: '0 0 4px', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)' }}>
                                            {dist.toFixed(2)}
                                        </p>
                                        <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', margin: 0, letterSpacing: '0.02em', fontFamily: 'var(--font-mono)' }}>
                                            公里
                                        </p>
                                    </div>

                                    {/* Pace / Time — Liquid Glass 玻璃數據面板 */}
                                    <div style={{
                                        position: 'relative', zIndex: 1, width: '100%',
                                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                                        borderRadius: 18,
                                        background: 'rgba(255,255,255,0.08)',
                                        backdropFilter: 'blur(16px) saturate(1.4)',
                                        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
                                        border: '1px solid rgba(255,255,255,0.14)',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                                        overflow: 'hidden', marginBottom: 16,
                                    }}>
                                        <div style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                                            <p style={{ fontSize: 24, fontWeight: 300, color: 'white', margin: '0 0 3px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)' }}>
                                                {fmtPaceDark(pace)} <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.6 }}>/km</span>
                                            </p>
                                            <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '0.02em', fontFamily: 'var(--font-mono)' }}>
                                                配速
                                            </p>
                                        </div>
                                        <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                                            <p style={{ fontSize: 24, fontWeight: 300, color: 'white', margin: '0 0 3px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)' }}>{fmtTimeDark(duration)}</p>
                                            <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '0.02em', fontFamily: 'var(--font-mono)' }}>時間</p>
                                        </div>
                                    </div>
                                </>
                            )}

                            {isFitness ? (
                                <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: '80px', zIndex: 0, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', padding: '12px 0px', overflow: 'hidden' }}>
                                    {(() => {
                                        // 🩹 原本用 parseInt(s.weight)，2.5kg 槓片被截成 2kg。改走共用入口。
                                        const getVol = exerciseVolume;
                                        const maxVol = Math.max(0, ...exercisesList.slice(0, 3).map(getVol));

                                        return exercisesList.slice(0, 3).map((ex, i) => {
                                            const vol = getVol(ex);
                                            return (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%', letterSpacing: '0.2px' }}>{ex.name || (typeof ex === 'string' ? ex : 'Movement')}</span>
                                                    <span style={{ fontSize: 13, fontWeight: 800, color: accent, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                                                        {vol > 0 ? vol.toLocaleString() : '-'} <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 2 }}>KG</span>
                                                    </span>
                                                </div>
                                            );
                                        });
                                    })()}
                                    {card.exercisesCount > 3 && (
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'left', marginTop: 4, fontStyle: 'italic' }}>
                                            還有 {card.exercisesCount - 3} 個動作
                                        </div>
                                    )}

                                    <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.02em', }}>總計</span>
                                        <span style={{ fontSize: 14, fontWeight: 900, color: 'white' }}>{post.metrics?.volume_kg || post.stats?.volume_kg || post.stats?.volume || 0} kg</span>
                                    </div>
                                </div>
                            ) : (
                                svgPath && (
                                    <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: '80px', zIndex: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg viewBox="0 0 300 120" style={{ width: '80%', height: '100%', display: 'block' }}>
                                            <path d={svgPath} fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                )
                            )}
                        </>
                    )}
                </div>
                );
            })()
    );

    return (
        <FeedPostShell
            post={post}
            isOwner={isOwner}
            hideHeader={hideHeader}
            surface={surface}
            onKudo={onKudo}
            onComment={onComment}
            onShowKudoers={onShowKudoers}
            onEdit={onEdit}
            onDelete={onDelete}
            renderMedia={isPureMeetup ? null : renderMedia}
            after={(isRunPost || post.meetup) ? (
                <>
                    {/* 賽段成果 badge（KOM/PR/名次）— 僅跑步貼文，無成果自動不顯示 */}
                    {isRunPost && <SegmentBadges sessionId={post.raw?.session_id || post.activity_id || raw.activity_id} userId={post.uId} C={C} />}
                    {/* 揪團卡：「我要參加」原本只會震一下 —— 改成打開留言，去那裡跟發起人報名 */}
                    {post.meetup && (
                        <MeetupCard meetup={post.meetup} joinLabel="留言報名"
                            onJoin={() => { triggerHaptic('medium'); onComment?.(post.id); }} />
                    )}
                </>
            ) : null}
        />
    );
};


/* ═══ SWISS SECTION HEADER ═══
   大標 + 鈦金屬細線。
   ⚠️ 原本上面還有一行「— OFFICIAL」英文 kicker 和「NO.01/01」計數：
      kicker 是大標的英譯（同一件事講兩次，§3），計數則跟右邊的圓點
      講同一件事，而且只有一檔活動時永遠顯示 01/01（§7 不顯示沒有作用的東西）。
      兩個都刪掉，右側動作直接跟大標同一列。 */
const SwissSectionHeader = ({ zh, right = null, accent = false, compact = false }) => (
    <div style={{ padding: '0 24px', marginBottom: compact ? 10 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'inline-block', position: 'relative', minWidth: 0 }}>
                <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: C.textPrimary, margin: 0, lineHeight: 1 }}>
                    {zh}
                </h2>
                {accent && (
                    <svg width="100%" height="7" viewBox="0 0 120 7" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', height: 7, overflow: 'visible' }}>
                        {/* 手繪風波浪底線 */}
                        <path d="M1 4 Q 20 1, 40 3.5 T 80 3 T 119 4" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                )}
            </div>
            {right}
        </div>
        {/* 鈦金屬細線 —— compact 版不畫，導覽性區塊不需要整套標頭 */}
        {!compact && <div style={{ height: 1, marginTop: 14, background: 'linear-gradient(90deg, rgba(151,166,182,0) 0%, rgba(151,166,182,0.5) 20%, rgba(255,255,255,0.95) 50%, rgba(151,166,182,0.5) 80%, rgba(151,166,182,0) 100%)' }} />}
    </div>
);


/* ═══ FEED 內嵌提醒卡 ═══
   滑動時穿插出現，提醒用戶可參加挑戰/官方活動。
   有官方活動圖 → 無框編輯式海報；純常駐挑戰 → Liquid Glass 鈦白卡。 */
const FeedReminderCard = ({ event, challenge, onAct }) => {
    const [showDetail, setShowDetail] = useState(false);
    const open = () => { triggerHaptic('medium'); setShowDetail(true); if (onAct) onAct(); };

    // 共用詳情 Sheet（瑞士極簡）
    const detailSheet = (
        <AnimatePresence>
            {showDetail && (
                <PortalSheet>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/45 backdrop-blur-sm" style={{ zIndex: 100200 }} onClick={() => setShowDetail(false)} />
                    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto" style={{ zIndex: 100201 }} onClick={e => e.stopPropagation()}>
                        <div style={{ background: '#F6F4F1', borderRadius: '28px 28px 0 0', maxHeight: '88dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
                            {event && <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden' }}><img src={event.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
                            <div style={{ padding: '22px 24px', paddingBottom: 'max(32px, env(safe-area-inset-bottom) + 24px)' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, marginTop: -2 }}>
                                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.16em', color: C.coral }}>
                                    {event ? '官方活動' : '常駐挑戰'}
                                </span>
                                <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#161415', margin: '6px 0 10px', lineHeight: 1.1 }}>
                                    {event ? event.title : challenge.titleZh}
                                </h2>
                                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(22,20,21,0.7)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>
                                    {event ? (event.fullDesc || event.desc) : challenge.desc}
                                </p>
                                {/* 目標 */}
                                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', padding: '14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.02em', color: 'rgba(22,20,21,0.45)' }}>目標</span>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: '#161415', fontFamily: 'var(--font-body)' }}>{event ? event.goal : challenge.goal}</span>
                                </div>
                                {/* 獎勵 */}
                                {((event && event.rewards) || (challenge && challenge.rewards)) && (
                                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', padding: '14px 0 6px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.02em', color: 'rgba(22,20,21,0.45)' }}>獎勵</span>
                                        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {(event ? event.rewards : challenge.rewards).map((r, i) => (
                                                <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(22,20,21,0.3)' }}>{String(i + 1).padStart(2, '0')}</span>
                                                    <span style={{ fontSize: 14, color: '#161415', fontFamily: 'var(--font-body)' }}>{r}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                <motion.button {...pressProps('row')} onClick={() => setShowDetail(false)} style={{ width: '100%', marginTop: 22, padding: '15px', borderRadius: 99, background: C.coral, color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                    {event ? '立即報名' : '接受挑戰'}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </PortalSheet>
            )}
        </AnimatePresence>
    );

    // 變體一：官方活動海報（圖一藝術雜誌排版 + 鈦金屬飾條）
    if (event) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const sd = new Date(event.startDate);
        const dayStr = `${sd.getDate()}. ${months[sd.getMonth()]} ${sd.getFullYear()}`;
        const num = (event.id || '').replace(/\D/g, '') || '1';
        return (
            <>
            {detailSheet}
            <motion.div
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                onClick={open}
                style={{ margin: '4px 24px 30px', cursor: 'pointer', display: 'flex', gap: 16 }}
            >
                {/* 左側鈦金屬飾條 */}
                <div style={{ width: 2, borderRadius: 99, flexShrink: 0, alignSelf: 'stretch',
                    background: 'linear-gradient(180deg, #F95C4B 0%, #F95C4B 40%, rgba(151,166,182,0.9) 40%, rgba(255,255,255,0.95) 60%, rgba(151,166,182,0.7) 100%)',
                    boxShadow: '0 1px 4px rgba(249,92,75,0.2)' }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Filter 式 meta 列 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, color: '#161415' }}>
                            官方活動<span style={{ fontWeight: 400, color: 'rgba(22,20,21,0.4)' }}>, 開放報名</span>
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: C.coral }}>NO.{String(num).padStart(2, '0')}</span>
                    </div>
                    {/* 月份時間軸標注（圖一風） */}
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(22,20,21,0.35)', lineHeight: 1.5, margin: '0 0 12px' }}>
                        {event.subtitle} · {dayStr}
                    </p>
                    {/* 鈦金屬細線 */}
                    <div style={{ height: 1, marginBottom: 16, background: 'linear-gradient(90deg, rgba(151,166,182,0.6) 0%, rgba(255,255,255,0.95) 40%, rgba(151,166,182,0.4) 100%)' }} />

                    {/* 大圖（無框、編輯式） */}
                    <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', marginBottom: 14 }}>
                        <img src={event.image} alt={event.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>

                    {/* No. + 標題 + 時間 + CTA（圖一底部排版） */}
                    <h3 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: '#161415', margin: '0 0 2px', lineHeight: 1.1 }}>
                        No. {num} {event.title}
                    </h3>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: '#161415', margin: '0 0 2px', fontWeight: 400 }}>{dayStr}</p>
                    <p style={{ fontSize: 13, color: 'rgba(22,20,21,0.5)', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>{event.goal}</p>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: C.coral, borderBottom: `1.5px solid ${C.coral}`, paddingBottom: 1 }}>立即報名</span>
                </div>
            </motion.div>
            </>
        );
    }

    // 變體二：常駐挑戰 → 瑞士極簡海報感（左側鈦金屬飾條 + 編輯排版）
    const catColor = challenge.category === 'running' ? C.coral : challenge.category === 'strength' ? '#5A7A3A' : '#D4A843';
    const cnum = (challenge.id || '').replace(/\D/g, '') || '1';
    return (
        <>
        {detailSheet}
        <motion.div
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            onClick={open}
            style={{ margin: '4px 24px 30px', cursor: 'pointer', display: 'flex', gap: 16 }}
        >
            {/* 左側鈦金屬飾條 */}
            <div style={{ width: 2, borderRadius: 99, flexShrink: 0, alignSelf: 'stretch',
                background: `linear-gradient(180deg, ${catColor} 0%, ${catColor} 40%, rgba(151,166,182,0.9) 40%, rgba(255,255,255,0.95) 60%, rgba(151,166,182,0.7) 100%)` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* meta 列 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, color: '#161415' }}>
                        常駐挑戰<span style={{ fontWeight: 400, color: 'rgba(22,20,21,0.4)' }}>, 等你來戰</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: catColor }}>NO.{String(cnum).padStart(2, '0')}</span>
                </div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.04em', color: 'rgba(22,20,21,0.35)', margin: '0 0 12px', textTransform: 'uppercase' }}>{challenge.titleEn}</p>
                {/* 鈦金屬細線 */}
                <div style={{ height: 1, marginBottom: 16, background: 'linear-gradient(90deg, rgba(151,166,182,0.6) 0%, rgba(255,255,255,0.95) 40%, rgba(151,166,182,0.4) 100%)' }} />
                {/* 大標 + 內文 + CTA */}
                <h3 style={{ fontFamily: 'var(--font-body)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: '#161415', margin: '0 0 8px', lineHeight: 1.05 }}>{challenge.titleZh}</h3>
                <p style={{ fontSize: 14, color: 'rgba(22,20,21,0.55)', lineHeight: 1.65, margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>{challenge.desc}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(22,20,21,0.6)' }}>{challenge.goal}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: C.coral, borderBottom: `1.5px solid ${C.coral}`, paddingBottom: 1 }}>接受挑戰</span>
                </div>
            </div>
        </motion.div>
        </>
    );
};


/* ═══ OFFICIAL EVENTS HERO CAROUSEL ═══ */

const OfficialEventsBanner = () => {
    const [index, setIndex] = useState(0);
    const [showDetail, setShowDetail] = useState(null);
    const [userProgress] = useState({ oe1: 2.4, oe2: 0, oe3: 0 });
    const [paused, setPaused] = useState(false);
    const now = new Date();
    const activeEvents = getOfficialEvents(now);

    // 自動輪播：使用者一旦互動（點 dot / 開詳情）即永久暫停，避免「閱讀時畫面自己在動」。
    // 改用 useVisibilityInterval：分頁切到背景時自動暫停（背景輪播沒意義、白耗電）。
    // delay 傳 null 即暫停 —— 沿用原本「只有一張或使用者已暫停就不輪播」的條件。
    // runOnFocus:false：回前景時不要立刻跳下一張，只是恢復計時。
    useVisibilityInterval(
        () => setIndex(i => (i + 1) % activeEvents.length),
        (activeEvents.length > 1 && !paused) ? 6000 : null,
        { runOnFocus: false }
    );

    if (activeEvents.length === 0) return null;

    const event = activeEvents[index];
    const isLive = new Date(event.startDate) <= now;
    const daysLeft = Math.max(0, Math.ceil((new Date(event.endDate) - now) / (1000 * 60 * 60 * 24)));
    const myProgress = userProgress[event.id] || 0;
    /* 剩餘天數文案：四個海報版型共用同一份，不各寫一次（介面標準 §9）。 */
    const remainLabel = daysLeft > 0 ? `還有 ${daysLeft} 天` : '今天最後一天';
    const progressPct = event.targetPerMember > 0 ? Math.min(100, (myProgress / event.targetPerMember) * 100) : 0;

    return (
        <>
            {/* ── Section Header — Swiss 鈦金屬細線 + 手繪下劃線 ── */}
            <SwissSectionHeader
                zh="官方活動" accent
                right={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {/* 只有一檔活動時圓點沒有作用（介面標準 §7），不畫 */}
                    {activeEvents.length > 1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingBottom: 2 }}>
                        {activeEvents.map((_, i) => (
                            <button key={i} onClick={() => { triggerHaptic('light'); setPaused(true); setIndex(i); }}
                                aria-label={`活動 ${i + 1}`}
                                style={{
                                    borderRadius: 99, border: 'none', padding: 0, cursor: 'pointer',
                                    width: i === index ? 16 : 4, height: 4,
                                    background: i === index ? C.coral : 'rgba(22,20,21,0.15)',
                                    transition: 'all 0.3s'
                                }}
                            />
                        ))}
                    </div>
                ) : null}
                <CommunitySwitch community="run" />
                </div>
                }
            />

            {/* ── Editorial Poster Card — heavy display + Liquid Glass info panel ── */}
            <div data-onboard="social-events" className="mx-4 mb-5" style={{ borderRadius: 28, overflow: 'hidden', boxShadow: '0 24px 48px -18px rgba(32,32,32,0.28)' }}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        style={{ 
                            position: 'relative', height: 'clamp(224px, 32dvh, 288px)', cursor: 'pointer',
                            background: '#E8E9E6',
                            display: 'flex',
                            overflow: 'hidden'
                        }}
                        onClick={() => { setPaused(true); setShowDetail(event); }}
                    >
                        {/* Layout 0: Grid & Serif Collage (Reference 1) */}
                        {index % 4 === 0 && (
                            <div style={{ flex: 1, position: 'relative', background: '#F6F4F1', padding: 24, display: 'flex', flexDirection: 'column' }}>
                                {/* Thin Grid Background */}
                                <div className="absolute inset-0 pointer-events-none" style={{ 
                                    backgroundImage: 'linear-gradient(rgba(22,20,21,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(22,20,21,0.05) 1px, transparent 1px)', 
                                    backgroundSize: '40px 40px' 
                                }} />
                                
                                {/* Floating Collage Photo */}
                                {event.image && (
                                    <div className="absolute top-6 right-5 z-[1]" style={{ 
                                        width: 104, height: 140, 
                                        backgroundImage: `url(${event.image})`, 
                                        backgroundSize: 'cover', backgroundPosition: 'center',
                                        filter: 'grayscale(100%) contrast(1.2)',
                                        boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                                        transform: 'rotate(4deg)'
                                    }} />
                                )}

                                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', color: 'rgba(22,20,21,0.5)', zIndex: 2 }}>
                                    {remainLabel}
                                </span>

                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                                    <h2 style={{
                                        fontSize: 'min(44px, 11.5vw)',
                                        fontFamily: 'var(--font-display)',
                                        fontWeight: 400,
                                        lineHeight: 0.9,
                                        color: '#161415',
                                        textAlign: 'center',
                                        textTransform: 'uppercase',
                                        letterSpacing: '-0.02em',
                                        mixBlendMode: 'multiply'
                                    }}>
                                        {event.subtitle?.split(' ').map((word, i) => (
                                            <span key={i} style={{ display: 'block', transform: `translateX(${i % 2 === 0 ? '-10%' : '10%'})` }}>{word}</span>
                                        )) || event.title}
                                    </h2>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', zIndex: 2 }}>
                                    {/* 左下原本是英文標題（PEAK HEAT），就是中間大標「盛夏強度」的英譯 —— 同一件事講兩次，刪掉 */}
                                    <p style={{ fontSize: 11, fontWeight: 700, color: '#F95C4B' }}>{event.goal}</p>
                                </div>
                            </div>
                        )}

                        {/* Layout 1: Center Overlap & Red Circle (Reference 2) */}
                        {index % 4 === 1 && (
                            <div style={{ flex: 1, position: 'relative', background: '#E8E9E6', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                {/* Centered top metadata */}
                                <div className="absolute top-8 w-full z-[2]">
                                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', color: '#161415' }}>
                                        {remainLabel}
                                    </p>
                                </div>

                                {/* Orange Oval Background containing photo */}
                                <div className="absolute overflow-hidden" style={{ width: '75%', height: '35%', border: '1px solid #F95C4B', borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.9 }}>
                                    {event.image && (
                                        <div className="absolute inset-0" style={{ 
                                            backgroundImage: `url(${event.image})`, 
                                            backgroundSize: 'cover', backgroundPosition: 'center',
                                            filter: 'grayscale(100%) contrast(1.2) sepia(0.8) hue-rotate(330deg)', 
                                            mixBlendMode: 'multiply',
                                            opacity: 0.6 
                                        }} />
                                    )}
                                </div>

                                {/* Overlapping Text */}
                                <div style={{ zIndex: 2, mixBlendMode: 'multiply' }}>
                                    <h2 style={{ fontSize: 'min(40px, 10vw)', fontFamily: 'var(--font-body)', fontWeight: 300, color: '#F95C4B', letterSpacing: '0.02em', margin: 0 }}>
                                        {event.subtitle}
                                    </h2>
                                </div>

                                {/* Centered bottom metadata */}
                                <div className="absolute bottom-8 w-full z-[2]">
                                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', color: '#161415' }}>
                                        {event.goal}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Layout 2: Chunky Staggered Sans-Serif (Reference 3) */}
                        {index % 4 === 2 && (
                            <div style={{ flex: 1, position: 'relative', background: '#E8E9E6', padding: '24px 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                {/* Stark Black and White Photo Block */}
                                {event.image && (
                                    <div className="absolute top-[40%] left-0 right-0 bottom-0 pointer-events-none" style={{ 
                                        backgroundImage: `url(${event.image})`, 
                                        backgroundSize: 'cover', backgroundPosition: 'center',
                                        filter: 'grayscale(100%) contrast(1.5)',
                                        opacity: 0.15,
                                        mixBlendMode: 'multiply',
                                        zIndex: 0
                                    }} />
                                )}

                                {/* Top Metadata */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(22,20,21,0.6)', zIndex: 1 }}>
                                    <span>{remainLabel}</span>
                                </div>

                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: 12, zIndex: 1 }}>
                                    <h2 style={{
                                        fontSize: 'min(42px, 11vw)',
                                        fontFamily: 'var(--font-body)',
                                        fontWeight: 900,
                                        lineHeight: 0.85,
                                        letterSpacing: '-0.03em',
                                        color: '#161415',
                                        textTransform: 'uppercase',
                                        mixBlendMode: 'multiply'
                                    }}>
                                        <span style={{ display: 'block', textAlign: 'left', color: '#F95C4B' }}>{event.subtitle}</span>
                                    </h2>
                                </div>

                                {/* Bottom Metadata */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(22,20,21,0.6)', zIndex: 1 }}>
                                    <span>{event.goal}</span>
                                </div>
                            </div>
                        )}

                        {/* Layout 3: Brutalist Full-Bleed Abstract (Reference 4) */}
                        {index % 4 === 3 && (
                            <div style={{ flex: 1, position: 'relative', background: '#161415', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 24 }}>
                                {/* Full-bleed artistic background */}
                                {event.image && (
                                    <div className="absolute inset-0 z-0 pointer-events-none" style={{ 
                                        backgroundImage: `url(${event.image})`, 
                                        backgroundSize: 'cover', backgroundPosition: 'center',
                                        filter: 'contrast(1.3) brightness(0.8)',
                                        opacity: 0.8
                                    }} />
                                )}

                                {/* Stark Typography */}
                                <div style={{ zIndex: 2, mixBlendMode: 'difference', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}>
                                        {remainLabel}
                                    </span>
                                </div>

                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', zIndex: 2, marginTop: 20 }}>
                                    <h2 style={{
                                        fontSize: 'min(54px, 13.5vw)',
                                        fontFamily: 'var(--font-body)',
                                        fontWeight: 900,
                                        lineHeight: 0.8,
                                        letterSpacing: '-0.05em',
                                        color: '#F95C4B',
                                        textTransform: 'uppercase',
                                        mixBlendMode: 'screen'
                                    }}>
                                        {event.subtitle}
                                    </h2>
                                </div>

                                <div style={{ zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', color: '#E8E9E6' }}>
                                    <span />
                                    <p style={{ fontSize: 11, fontWeight: 700, color: '#F95C4B' }}>{event.goal}</p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* ── Detail Sheet ── */}
            <AnimatePresence>
                {showDetail && (
                    <PortalSheet>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-end justify-center z-[100200]"
                            onClick={() => setShowDetail(null)}>
                            <motion.div
                                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                                className="w-full max-w-md rounded-t-[36px] overflow-hidden shadow-2xl border-t border-white/80"
                                style={{ background: '#F6F4F1', maxHeight: '92dvh', overflowY: 'auto' }}
                                onClick={e => e.stopPropagation()}>

                                {/* Hero image in modal */}
                                <div className="relative h-56 w-full bg-cover bg-center" style={{ backgroundImage: `url(${showDetail.image})` }}>
                                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #F6F4F1 5%, transparent 70%)' }} />
                                    <motion.button {...pressProps('icon')} onClick={() => setShowDetail(null)}
 className="absolute top-5 right-5 w-10 h-10 rounded-full bg-[#161415]/30 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-md">
                                        <X size={20} strokeWidth={2.5} />
                                    </motion.button>
                                    {/* Floating badge */}
                                    <div className="absolute bottom-5 left-7">
                                        <span className="text-[12px] font-bold px-3.5 py-1.5 tracking-[0.3em] border border-[#161415]/15 bg-[#F6F4F1]/90 text-[#161415] backdrop-blur-sm"
                                            style={{ letterSpacing: '0.25em' }}>
                                            {isLive ? `ACTIVE / 剩 ${daysLeft} 天` : `UPCOMING / ${showDetail.startDate?.slice(5)} 開始`}
                                        </span>
                                    </div>
                                </div>

                                <div className="px-7 pb-9 -mt-2 relative z-10">
                                    {/* Title block — Swiss: kicker → headline, no emoji icon */}
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className="pt-1 flex-1">
                                            <p className="text-[12px] font-[1000] tracking-[0.04em] mb-1" style={{ color: '#D94030' }}>官方挑戰</p>
                                            <h2 className="text-[26px] tracking-tight leading-tight text-[#161415]" style={{ fontFamily: "'Tenor Sans', sans-serif", fontWeight: 300, letterSpacing: '-0.01em' }}>{showDetail.title}</h2>
                                            {showDetail.subtitle && <p className="text-[12px] font-bold text-[#161415]/50 uppercase tracking-widest mt-0.5">{showDetail.subtitle}</p>}
                                        </div>
                                    </div>

                                    {/* Story */}
                                    <p className="text-[14px] font-medium leading-relaxed mb-7 text-[#161415]/80 w-11/12 py-1" style={{ fontFamily: "'Tenor Sans', sans-serif" }}>
                                        {showDetail.fullDesc || showDetail.desc}
                                    </p>

                                    {/* ── High-End Editorial Layout (Loewe / 雜誌排版風格) ── */}
                                    <div className="flex flex-col border-t border-[#161415]/10 mt-8 mb-10">

                                        {/* Target */}
                                        <div className="py-7 border-b border-[#161415]/10 flex flex-col gap-3">
                                            <span className="text-[11px] font-bold tracking-[0.02em] text-[#D94030]">
                                                目標
                                            </span>
                                            <span className="text-[15px] font-bold text-[#161415] tracking-wide leading-relaxed w-11/12">
                                                {showDetail.goal}
                                            </span>
                                        </div>

                                        {/* My progress in detail */}
                                        {showDetail.targetPerMember > 0 && (
                                            <div className="py-7 border-b border-[#161415]/10 flex flex-col gap-2">
                                                <span className="text-[11px] font-bold tracking-[0.02em] text-[#D94030]">
                                                    進度
                                                </span>
                                                <div className="w-full mt-2">
                                                    <div className="flex items-baseline gap-3 mb-4">
                                                        {/* 誇張放大的數字，帶入襯線體增加精品優雅感 */}
                                                        <span className="text-[48px] font-light text-[#161415] leading-none tracking-tighter" style={{ fontFamily: '"Tenor Sans", sans-serif', fontStyle: 'italic' }}>
                                                            {userProgress[showDetail.id] || 0}
                                                        </span>
                                                        <span className="text-[9px] text-[#161415]/40 font-bold uppercase tracking-[0.2em]">
                                                            / {showDetail.targetPerMember} {showDetail.unit}
                                                        </span>
                                                    </div>
                                                    {/* 極細的時尚進度條 */}
                                                    <div className="h-[2px] w-full bg-[#161415]/5 overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${Math.min(100, ((userProgress[showDetail.id] || 0) / showDetail.targetPerMember) * 100)}%` }}
                                                            transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                                                            className="h-full bg-[#D94030]"
                                                        />
                                                    </div>
                                                    <p className="text-[9px] font-bold mt-4 text-[#161415]/30 tracking-[0.25em] uppercase">
                                                        {userProgress[showDetail.id] >= showDetail.targetPerMember ? 'Mission Accomplished' : `${Math.max(0, showDetail.targetPerMember - (userProgress[showDetail.id] || 0)).toFixed(1)} ${showDetail.unit} Remaining`}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Rewards */}
                                        {showDetail.rewards?.length > 0 && (
                                            <div className="py-7 border-b border-[#161415]/10 flex flex-col gap-5">
                                                <span className="text-[11px] font-bold tracking-[0.02em] text-[#D94030]">
                                                    獎勵
                                                </span>
                                                <ul className="flex flex-col gap-4 mt-1">
                                                    {showDetail.rewards.map((r, i) => (
                                                        <li key={i} className="flex items-center gap-5">
                                                            <span className="text-[9px] font-light text-[#161415]/20 tracking-widest" style={{ fontFamily: 'var(--font-mono)' }}>
                                                                {String(i + 1).padStart(2, '0')}
                                                            </span>
                                                            <span className="text-[14px] font-medium text-[#161415] tracking-wide">{r}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    {/* 滿版懸浮感按鈕 */}
                                    <motion.button {...pressProps('row')}
 onClick={() => setShowDetail(null)}
 className="w-full py-5 text-[12px] font-[1000] uppercase tracking-[0.4em] text-[#F6F4F1] hover:bg-[#D94030]"
 style={{ background: '#161415' }}>
                                        {(userProgress[showDetail.id] || 0) >= showDetail.targetPerMember ? 'Cleared' : 'Engage'}
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </PortalSheet>
                )}
            </AnimatePresence>
        </>
    );
};




/* ═══ PERMANENT CHALLENGES ROW (常駐挑戰) ═══ */
const PermanentChallengesRow = ({ onShowAll }) => {
    const [showAll, setShowAll] = useState(false);
    const [collapsed, setCollapsed] = useState(true); // 預設收合

    const handleShowAll = () => {
        setShowAll(true);
        if (onShowAll) onShowAll();
    };

    return (
        <div style={{ marginBottom: 8 }}>
            {/* Section header — Swiss kicker style + 收合切換 */}
            <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: collapsed ? 0 : 14, cursor: 'pointer' }}
                onClick={() => setCollapsed(v => !v)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 2, height: 14, borderRadius: 99, background: 'rgba(22,20,21,0.25)', flexShrink: 0 }} />
                    <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.28em', color: 'rgba(22,20,21,0.38)', fontFamily: '"Tenor Sans", sans-serif', margin: 0 }}>
                        常駐挑戰
                    </p>
                    {/* 收合箭頭 */}
                    <motion.div
                        animate={{ rotate: collapsed ? 0 : 180 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        style={{ display: 'flex', alignItems: 'center' }}
                    >
                        <ChevronDown size={14} strokeWidth={2.2} color="rgba(22,20,21,0.35)" />
                    </motion.div>
                </div>
                <motion.button {...pressProps('row')}
 onClick={(e) => { e.stopPropagation(); handleShowAll(); }}
 style={{
 fontSize: 12, fontWeight: 800, letterSpacing: '0.18em',
 textTransform: 'uppercase', color: C.coral,
 background: 'none', border: 'none', cursor: 'pointer',
 display: 'flex', alignItems: 'center', gap: 4,
 fontFamily: '"Tenor Sans", sans-serif'
 }}
 >
                    更多
                </motion.button>
            </div>

            {/* Challenge cards — 可收合 */}
            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.div
                        key="challenges-grid"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        style={{ overflow: 'hidden' }}
                    >
                        {/* Challenge cards — Swiss Bento grid (Titanium surfaces) */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 10,
                            padding: '14px 20px 0',
                        }}>
                            {PERMANENT_CHALLENGES.slice(0, 3).map((ch, idx) => {
                                const catColor = ch.category === 'running' ? C.coral : ch.category === 'strength' ? '#5A7A3A' : '#D4A843';
                                const isFeature = idx === 0;
                                return (
                                    <motion.div
                                        key={ch.id}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(idx, 6) * 0.07, type: 'spring', stiffness: 260, damping: 22 }}
                                        style={{
                                            gridColumn: isFeature ? '1 / -1' : 'auto',
                                            borderRadius: 18,
                                            background: 'linear-gradient(145deg, #F6F4F1 0%, #E4DED2 50%, #E4DED2 100%)',
                                            boxShadow: '0 8px 24px -10px rgba(22,20,21,0.14), inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 2px rgba(151,166,182,0.25)',
                                            border: '1px solid rgba(207,198,184,0.8)',
                                            padding: isFeature ? '18px 18px' : '16px 14px',
                                            cursor: 'pointer', position: 'relative', overflow: 'hidden',
                                            display: 'flex', flexDirection: 'column',
                                        }}
                                        whileTap={{ scale: 0.97 }}
                                    >
                                        {/* Category kicker */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                                            <div style={{ width: 2, height: 10, borderRadius: 99, background: catColor, flexShrink: 0 }} />
                                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: catColor, fontFamily: '"Tenor Sans", sans-serif' }}>
                                                {ch.category === 'running' ? 'CARDIO' : ch.category === 'strength' ? 'STRENGTH' : 'ENDURANCE'}
                                            </span>
                                        </div>
                                        <h3 style={{
                                            fontSize: isFeature ? 17 : 14, fontWeight: 700, color: '#161415',
                                            lineHeight: 1.2, marginBottom: 6,
                                            fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                                            letterSpacing: '-0.01em'
                                        }}>
                                            {ch.titleZh}
                                        </h3>
                                        <p style={{ fontSize: isFeature ? 11 : 10, color: 'rgba(22,20,21,0.50)', lineHeight: 1.55, marginBottom: 14, maxWidth: isFeature ? '78%' : '100%' }}>
                                            {ch.desc}
                                        </p>
                                        {/* Goal chip */}
                                        <div style={{
                                            marginTop: 'auto',
                                            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                                            textTransform: 'uppercase',
                                            color: 'rgba(22,20,21,0.65)',
                                            background: 'rgba(207,198,184,0.30)',
                                            border: '1px solid rgba(207,198,184,0.8)',
                                            padding: '4px 10px', borderRadius: 99, display: 'inline-block',
                                            alignSelf: 'flex-start',
                                            fontFamily: '"Tenor Sans", sans-serif'
                                        }}>
                                            {ch.goal}
                                        </div>
                                    </motion.div>
                                );
                            })}

                            {/* +更多 bento tile */}
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.24, type: 'spring', stiffness: 260, damping: 22 }}
                                onClick={handleShowAll}
                                style={{
                                    gridColumn: '1 / -1',
                                    borderRadius: 18,
                                    border: `1px dashed ${C.pebble}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    cursor: 'pointer', padding: '14px 18px',
                                    background: 'rgba(207,198,184,0.10)',
                                }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {/* 左邊已經說了「全部 N 個挑戰」，右邊再寫一次 View All 是同一件事講兩次（§3），
                                    只留箭頭當作可點的提示就好。 */}
                                <span style={{ fontSize: 12, fontWeight: 800, color: C.textMuted, letterSpacing: '0.02em', fontFamily: 'var(--font-body)' }}>
                                    全部 {PERMANENT_CHALLENGES.length} 個挑戰
                                </span>
                                <ChevronRight size={16} strokeWidth={2.5} color={C.coral} />
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── 更多挑戰 Full Modal ── */}
            <AnimatePresence>
                {showAll && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
                        onClick={() => setShowAll(false)}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                            style={{ width: '100%', background: '#F6F4F1', borderRadius: '28px 32px 0 0', maxHeight: '82dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Handle */}
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 8px' }}>
                                <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: C.pebble }} />
                            </div>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 16px', borderBottom: `1px solid ${C.stone}` }}>
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 300, color: C.textPrimary, fontFamily: '"Tenor Sans", sans-serif', lineHeight: 1, letterSpacing: '-0.01em' }}>全部常駐挑戰</h2>
                                </div>
                                <motion.button {...pressProps('row')} onClick={() => setShowAll(false)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: C.stone, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: '16px', color: C.textPrimary, lineHeight: 1 }}>×</span>
                                </motion.button>
                            </div>
                            {/* List */}
                            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 40px' }}>
                                {PERMANENT_CHALLENGES.map((ch, idx) => {
                                    const catColor = ch.category === 'running' ? C.coral : ch.category === 'strength' ? '#5A7A3A' : '#D4A843';
                                    return (
                                        <motion.div
                                            key={ch.id}
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(idx, 6) * 0.05 }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '14px',
                                                padding: '14px 16px', borderRadius: '18px',
                                                // Titanium neutral surface — Swiss consistency
                                                background: 'linear-gradient(145deg, #F6F4F1 0%, #E4DED2 55%, #E4DED2 100%)',
                                                border: '1px solid rgba(207,198,184,0.8)',
                                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
                                                marginBottom: '8px', cursor: 'pointer',
                                                position: 'relative', overflow: 'hidden',
                                            }}
                                        >
                                            {/* Category hairline accent */}
                                            <div style={{ width: 2, alignSelf: 'stretch', borderRadius: 99, background: catColor, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: catColor, marginBottom: '3px', fontFamily: '"Tenor Sans", sans-serif' }}>
                                                    {ch.titleEn}
                                                </div>
                                                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#161415', marginBottom: '3px', fontFamily: '"Noto Sans TC", sans-serif', letterSpacing: '-0.01em' }}>
                                                    {ch.titleZh}
                                                </h3>
                                                <p style={{ fontSize: '11px', color: 'rgba(22,20,21,0.5)', lineHeight: 1.45 }}>{ch.desc}</p>
                                            </div>
                                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                                <span style={{
                                                    fontSize: '9px', fontWeight: 800, color: 'rgba(22,20,21,0.65)',
                                                    letterSpacing: '0.1em', textTransform: 'uppercase',
                                                    background: 'rgba(207,198,184,0.30)',
                                                    border: '1px solid rgba(207,198,184,0.8)',
                                                    padding: '4px 10px',
                                                    borderRadius: '100px', display: 'block', whiteSpace: 'nowrap',
                                                    fontFamily: '"Tenor Sans", sans-serif',
                                                }}>
                                                    {ch.goal}
                                                </span>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/* ═══ FEED SKELETON (載入骨架，取代直接 pop-in) ═══ */
/* ❌ FeedCardSkeleton / FeedEmptyState 的本地版已移除（2026-09 稽核）
   —— 與健身社群那份只差幾個字，卻已經開始各自漂移。
   兩頁共用 SocialFeed/CommunityChrome.jsx，文案用 community 參數區分。 */

const FeedTab = ({ userId, patchReady, autoOpenCreate, onAutoOpenCreateDone }) => {
    const navigate = useNavigate();

    /* 🧩 2026-09 稽核第二階段：
       「抓資料 / 發文 / 按讚 / 刪除 / 編輯 / 過濾」原本在這裡與
       FitnessCommunityPage 各寫一份，兩份持續漂移 ——
       上一輪抓到的「照片貼文變 0 公里跑步卡」「發文欄位丟失」
       就是因為只修好了其中一邊。行為統一交給 useCommunityFeed，
       這一頁只留跑步社群真正不一樣的：貼文卡怎麼畫、草稿長什麼樣。 */
    const buildDraft = useCallback((data, { userId: uid, uName }) => {
        const isRun = !!data.activity;
        // 欄位別名容錯：composer 給 images[]，也順手補 photo（Profile grid 讀這個）
        const photo = data.images?.[0] || data.photo || null;
        const targets = data.targets || data.communities || ['run'];
        return {
            id: `p_new_${Date.now()}`, activity_id: `local_${Date.now()}`,
            uId: uid, user_id: uid, userName: uName, user_name: uName, init: uName[0] || 'U',
            type: isRun ? 'run' : 'post', activity_type: isRun ? 'run' : 'post',
            createdAt: new Date().toISOString(), caption: data.caption, title: data.title || null,
            // 純照片貼文不要帶跑步 stats，否則會被誤判成 0.00 公里的跑步分享卡
            // ⚠️ 原本寫死 pace: 320、duration: 1600 —— 每一篇帶跑步的貼文都顯示 5:20 配速、26:40（§9 不編數字）
            stats: isRun ? { distance: data.activity.distance || 0, pace: data.linkedWorkout?.paceSec || 0, duration: data.linkedWorkout?.durationSec || 0 } : null,
            routeImg: photo, photo, images: data.images || (photo ? [photo] : []),
            kudos: 0, commentCount: 0, myKudo: false,
            targets, communities: targets, visibility: data.visibility || 'public',
            meetup: data.meetup || null,
            tags: data.tags || [], location: data.location || null,
            orientation: data.orientation || 'portrait', imgPos: data.imgPos ?? 50,
            session_data: { type: isRun ? 'run' : 'post', route: [], stats: {}, drvnCard: data.linkedWorkout || null, meetup: data.meetup || null },
        };
    }, []);

    // 只載入跑步與一般貼文（健身貼文歸健身社群牆）
    const localFilter = useCallback((a) => (
        a.activity_type === 'run' || a.activity_type === 'post' || !a.activity_type
    ), []);

    /* 只擋「完全空白」的假跑步卡：無距離、無時間、無照片、也無文字，且不是自己發的。
       自己剛發的一律保留，避免「發文成功卻看不到」。 */
    const extraVisibleFilter = useCallback((a) => {
        if (a.uId === userId) return true;
        if (a.activity_type === 'post') return true;        // 純文字/照片貼文不算空跑步卡
        const dist = a.stats?.distance || 0;
        const dur = a.stats?.duration || 0;
        const hasPhoto = !!a.photo;
        const hasCaption = !!(a.caption && a.caption.trim());
        const hasLinkedCard = !!(a.raw?.session_data?.drvnCard || a.drvnCard);
        return !(a.type === 'run' && dist <= 0 && dur <= 0 && !hasPhoto && !hasCaption && !hasLinkedCard);
    }, [userId]);

    const {
        filtered, loading, feedError,
        feedFilter, setFeedFilter,
        following, setFollowing, graph, counts,
        commentPostId, setCommentPostId,
        kudoersPostId, setKudoersPostId,
        editingPost, setEditingPost,
        showCreate, setShowCreate,
        handleNewPost, handleKudo, handleDelete, handleEdit, saveEdit, bumpCommentCount,
    } = useCommunityFeed({ userId, community: 'run', buildDraft, localFilter, extraVisibleFilter });

    // 從別處帶 openCreate 進來時自動打開發文
    useEffect(() => {
        if (autoOpenCreate) {
            setShowCreate(true);
            onAutoOpenCreateDone && onAutoOpenCreateDone();
        }
    }, [autoOpenCreate]);   // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div>
            {feedError && !loading && <FeedOfflineNotice reason={feedError} />}

            <OfficialEventsBanner />
            <PermanentChallenges defaultTab="running" />

            {/* 探索入口 — 移到追蹤/探索切換之前，讓使用者先看到入口 */}
            <div style={{ marginTop: 4, marginBottom: 8 }}>
                <SwissSectionHeader zh="探索" compact />
                <HeroCards navigate={navigate} C={C} primary={{
                    onClick: () => navigate('/fitness-community-mobile'),
                    image: imgFitness, gearImage: imgGear,
                    titleTop: '健身', titleBottom: '社群', Icon: Activity,
                }} />
            </div>

            <FeedFilterTabs
                activeFilter={feedFilter}
                onFilterChange={setFeedFilter}
                colors={{ text: '#FFFFFF', sub: C.textMuted, bg: 'rgba(22,20,21,0.05)', activeBg: C.coral, activeShadow: '0 8px 20px rgba(249,92,75,0.3)' }}
            />

            {/* 🎯 找人追蹤：搜尋（名稱/ID/好友碼）＋ 可展開的推薦清單。
                sport="run" 只影響推薦排序；追蹤關係與健身社群共用同一張 followGraph。 */}
            {feedFilter === 'discover' && (
                <FollowSuggestions
                    userId={userId}
                    following={following}
                    graph={graph}
                    sport="run"
                    onFollowChange={setFollowing}
                    colors={{ text: C.textPrimary, sub: C.textMuted, highlight: C.coral }}
                />
            )}
            {feedFilter === 'following' && (
                <div style={{ padding: '8px 16px 0' }}>
                    {/* 追蹤中 / 粉絲 / 好友 — 三個數字放在一起，語意才不會混淆 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, fontWeight: 700, color: C.textMuted }}>
                        <DataPulse ready={patchReady} w="4rem" h="0.65rem" radius="0.32rem" theme="light" inline>
                            <span>追蹤中 <span style={{ color: C.textPrimary, fontWeight: 900 }}>{counts.following}</span></span>
                        </DataPulse>
                        <span style={{ opacity: 0.3 }}>·</span>
                        <span>粉絲 <span style={{ color: C.textPrimary, fontWeight: 900 }}>{counts.fans}</span></span>
                        <span style={{ opacity: 0.3 }}>·</span>
                        <span>好友 <span style={{ color: C.coral, fontWeight: 900 }}>{counts.friends}</span></span>
                        <motion.button {...pressProps('row')}
 onClick={() => { triggerHaptic('light'); setFeedFilter('discover'); }}
 style={{
 marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
 background: 'none', border: 'none', cursor: 'pointer',
 fontSize: 11, fontWeight: 800, color: C.coral, padding: 0,
 }}
 >
                            找人追蹤 <Search size={11} strokeWidth={2.5} />
                        </motion.button>
                    </div>
                </div>
            )}
            {loading ? (
                <div><FeedCardSkeleton /><FeedCardSkeleton /></div>
            ) : filtered.length === 0 ? (
                <FeedEmptyState community="run" filter={feedFilter}
                    onDiscover={() => { triggerHaptic('light'); setFeedFilter('discover'); }}
                    onCreate={() => { triggerHaptic('medium'); setShowCreate(true); }}
                />
            ) : filtered.map((post, idx) => {
                // 每 3 篇貼文後穿插一張提醒卡（官方活動優先，其次常駐挑戰輪替）
                const showReminder = idx > 0 && (idx + 1) % 3 === 0;
                const now = new Date();
                const liveEvents = getOfficialEvents(now);
                const reminderIndex = Math.floor((idx + 1) / 3) - 1;
                let reminderNode = null;
                if (showReminder) {
                    if (liveEvents.length > 0 && reminderIndex % 2 === 0) {
                        const ev = liveEvents[Math.floor(reminderIndex / 2) % liveEvents.length];
                        reminderNode = <FeedReminderCard key={`rm_ev_${idx}`} event={ev} onAct={() => triggerHaptic('medium')} />;
                    } else if (PERMANENT_CHALLENGES.length > 0) {
                        const ch = PERMANENT_CHALLENGES[reminderIndex % PERMANENT_CHALLENGES.length];
                        reminderNode = <FeedReminderCard key={`rm_ch_${idx}`} challenge={ch} onAct={() => triggerHaptic('medium')} />;
                    }
                }
                return (
                    <React.Fragment key={post.id}>
                        <RunCard post={post} index={idx} onKudo={handleKudo} onComment={id => setCommentPostId(id)} onShowKudoers={id => setKudoersPostId(id)} onDelete={handleDelete} onEdit={handleEdit} isOwner={post.uId === userId} />
                        {reminderNode}
                    </React.Fragment>
                );
            })}

            <AnimatePresence>
                {commentPostId && <CommentSheet postId={commentPostId} onClose={() => setCommentPostId(null)} userId={userId} C={C} onPosted={bumpCommentCount} />}
                {kudoersPostId && <KudosSheet postId={kudoersPostId} onClose={() => setKudoersPostId(null)} C={C} />}
                {editingPost && <EditPostSheet post={editingPost} onClose={() => setEditingPost(null)} onSave={saveEdit} C={C} />}
            </AnimatePresence>
            <motion.button aria-label="建立貼文" onClick={() => setShowCreate(true)} className="fixed z-50 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-xl" style={{ background: C.highlight, bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))', right: 20 }} whileTap={{ scale: 0.94 }}><Plus size={26} /></motion.button>
            <AnimatePresence>
                {showCreate && <IGPostComposer userId={userId} community="cardio" onClose={() => setShowCreate(false)} onPost={handleNewPost} />}
            </AnimatePresence>
        </div>
    );
};

/* ═══ TABS & PAGE ═══ */
/* ❌ TABS / TabBar 的本地版已移除 —— 與健身社群那份幾乎逐字相同，只差 layoutId。
   改用 SocialFeed/CommunityChrome.jsx 的 CommunityTabBar。 */

// ── Swiss Magazine entrance animation variants ────────────────────────
// Motion Personality: Premium — duration 400–600ms, ease (0.4,0,0.2,1), zero overshoot
// 由上而下：全部從 y:-20 落下，只動 opacity + y（GPU composited，效能最優）
const EASE_PREMIUM = [0.4, 0, 0.2, 1]; // Material Design standard — smooth both ends

const editorialReveal = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } }
};
// Border: scaleY 由上往下畫線
const borderReveal = {
    hidden: { opacity: 0, scaleY: 0 },
    visible: { opacity: 1, scaleY: 1, transition: { duration: 0.5, ease: EASE_PREMIUM } }
};
// Label: 從上方輕落
const labelReveal = {
    hidden: { opacity: 0, y: -16 },
    visible: { opacity: 0.55, y: 0, transition: { duration: 0.45, ease: EASE_PREMIUM } }
};
// 標題字：從上方落下，稍長
const wordRevealItalic = {
    hidden: { opacity: 0, y: -24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_PREMIUM } }
};

const SocialHubMobile = ({ userId: propUserId }) => {
    const userId = propUserId || getUserId();
    const location = useLocation();
    const navigate = useNavigate();
    // 有人加你好友時，「我的」分頁的好友列要標出來（底部導覽的紅點也讀同一份）
    const { count: pendingFriends } = usePendingFriendRequests(userId);
    const [activeTab, setActiveTab] = useState('feed');
    const [headerVisible, setHeaderVisible] = useState(false);
    const [autoOpenCreate, setAutoOpenCreate] = useState(false);

    // FeedTab 內部自己管理資料載入，SocialHubMobile 無 loading state。
    // DataPulse 交由 FeedTab 自行控制，此處直接 true 不阻擋渲染。
    const socialPatchReady = true;

    useEffect(() => {
        const t = setTimeout(() => setHeaderVisible(true), 50);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (location.state?.activeTab) {
            setActiveTab(location.state.activeTab);
        }
        if (location.state?.openCreate) {
            setAutoOpenCreate(true);
        }
        if (location.state?.openInvitation) {
            setActiveTab('ranking');
        }
        if (location.state) {
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    return (
        <div className="min-h-[100dvh] w-full font-sans relative overflow-x-hidden" style={{ minHeight: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', color: C.textHero }}>
            {/* Pebble 主畫布 — 暖灰大地色，讓 Titanium 卡片浮起 */}
            <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: '#D6CDBF' }} />

            <CommunityTabBar activeTab={activeTab} setActiveTab={setActiveTab} community="run" />

            <div className="h-full relative z-10 overflow-y-auto no-scrollbar w-full" style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden', touchAction: 'pan-y', paddingBottom: 'var(--nav-clearance, 120px)' }}>
                {activeTab !== 'ranking' && (
                    /* 分頁列是 fixed 的，內容要從它下面開始（--community-content-top，見 index.css）。
                       排行分頁例外：RunningPulseRanking 自己帶招牌列與 sticky 篩選列。 */
                    <div className="pb-2 flex flex-col" style={{ paddingTop: 'var(--community-content-top)' }}>
                        {/* ── Masthead —— 共用組件（SocialFeed/CommunityChrome）。
                            左邊那一句會跟著分頁換，關鍵字底下有手寫重點線；
                            右邊的字標點一下換到健身社群。
                            ⚠️ 原本這裡是一份在地的招牌列，跟健身社群、兩個排行頁各一份，
                               同一條線改一次要改四個地方（§8）。 */}
                        {/* 動態分頁不放招牌列：分頁列已經寫了「動態」，「動態，紀錄你的每一步」是同一件事講兩次（§3）。
                            字標（換社群）改放到官方活動那一列的右邊。 */}
                        {activeTab !== 'feed' && (
                            <motion.div
                                variants={editorialReveal}
                                initial="hidden"
                                animate={headerVisible ? "visible" : "hidden"}
                            >
                                <CommunityMasthead community="run" tab={activeTab} />
                            </motion.div>
                        )}
                    </div>
                )}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full mt-2"
                    >
                        {activeTab === 'feed' && <FeedTab userId={userId} patchReady={socialPatchReady} autoOpenCreate={autoOpenCreate} onAutoOpenCreateDone={() => setAutoOpenCreate(false)} />}
                        {activeTab === 'ranking' && <RunningPulseRanking />}
                        {activeTab === 'squads' && <div className="px-4 pt-2"><SquadsView type="run" userId={userId} /></div>}
                        {activeTab === 'profile' && (
                            /* ⚠️ 不要再加 --community-content-top：上面的招牌列已經把內容推到
                               分頁列下方了，這裡再推一次會多出一整個分頁列的空白。 */
                            <div className="px-4">
                                {/* 👥 好友入口 ────────────────────────────────────────────
                                    稽核前：好友清單與「待審邀請」只存在 /social 這一頁，
                                    而唯一到得了的路徑是「個人檔案 → 社群」——
                                    從底部導覽的「社群」進來完全看不到，
                                    所以有人加你好友時，這裡是死路。
                                    現在社群分頁的紅點會指到這一列。 */}
                                <motion.button
                                    {...pressProps('card')}
                                    onClick={() => { triggerHaptic('light'); navigate('/social'); }}
                                    aria-label={pendingFriends > 0 ? `好友，${pendingFriends} 則待回覆的邀請` : '好友'}
                                    className="w-full flex items-center justify-between mb-4"
                                    style={{
                                        padding: '14px 16px', borderRadius: 18, border: '1px solid rgba(207,198,184,0.7)',
                                        background: pendingFriends > 0 ? 'rgba(249,92,75,0.07)' : 'rgba(255,255,255,0.55)',
                                        cursor: 'pointer', textAlign: 'left',
                                    }}
                                >
                                    <span className="flex items-center gap-3">
                                        <Users size={18} color={pendingFriends > 0 ? C.coral : C.textMuted} />
                                        <span>
                                            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: C.textPrimary }}>好友</span>
                                            <span style={{ display: 'block', fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                                                {pendingFriends > 0 ? `${pendingFriends} 則邀請等你回覆` : '管理好友、加人、看邀請'}
                                            </span>
                                        </span>
                                    </span>
                                    {pendingFriends > 0 && (
                                        <span style={{
                                            minWidth: 22, height: 22, padding: '0 6px', borderRadius: 999,
                                            background: C.coral, color: '#fff', fontSize: 12, fontWeight: 800,
                                            lineHeight: '22px', textAlign: 'center',
                                        }}>{pendingFriends}</span>
                                    )}
                                </motion.button>

                                {/* 🚫 封鎖名單：封鎖之後要找得到、解得開（App Store 1.2） */}
                                <BlockedUsersRow />

                                <GrowthAchievementProfileCard userId={userId} />
                                <GrowthAchievementSystem userId={userId} profileMode={true} hideHeader={true} />
                                {/* （「清空我的貼文」按鈕已依需求移除） */}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
            <MobileNavigation />
        </div>
    );
};

export default SocialHubMobile;
