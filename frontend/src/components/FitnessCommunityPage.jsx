import React, { useState, useEffect, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Trophy, Users, User, Plus, X, UserPlus, MessageCircle, ArrowUp, Share2, Heart, BarChart3, RefreshCcw, ChevronLeft, ChevronRight, MapPin, Clock, Calendar, Award, TrendingUp, Info, MoreVertical, Trash2, Edit, Search } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { useNavigate, useLocation } from 'react-router-dom';
import { OFFICIAL_EVENTS, getOfficialEvents } from '../utils/socialDataConnector';
import { getSocialPosts } from '../utils/socialPostsStore';
// 🧩 動態牆的單一資料層 —— 與跑步社群共用同一份映射／去重／排序
// 🧩 社群共用層：行為（hook）與外框（分頁列 / 骨架 / 空狀態 / 離線提示）
import { useCommunityFeed } from './SocialFeed/useCommunityFeed';
import { CommunityTabBar, CommunityMasthead, CommunitySwitch, FeedCardSkeleton, FeedEmptyState, FeedOfflineNotice } from './SocialFeed/CommunityChrome';
// 🪪 送給後端的身分 —— 不再一律署名「我」
import FeedFilterTabs from './SocialFeed/FeedFilterTabs';
import FollowSuggestions from './SocialFeed/FollowSuggestions';
import { triggerHaptic, resolvePostAvatar, fmtPostTime } from './SocialFeed/communityHelpers';
import { PortalSheet, renderCaption, CommentSheet, KudosSheet, SegmentBadges, EditPostSheet, HeroCards } from './SocialFeed/communityShared';
import { FeedPostShell, PostPhotos } from './SocialFeed/FeedPost';
import { MeetupCard } from './PostBodyCards';
import KineticWordmark from './ui/KineticWordmark';
import IGPostComposer from './IGPostComposer';
import { RunningFeatureCard, RunningApexCard, RunningPhysioCard } from './RunningCardComponents';
import { FeatureCard, PeakCard, ReportCard } from './FitnessCardComponents';
import DataPulse from './ui/DataPulse';
import PermanentChallenges from './SocialFeed/PermanentChallenges';
import BlockedUsersRow from './SocialFeed/BlockedUsersRow';

import GrowthAchievementSystem, { GrowthAchievementProfileCard } from './GrowthAchievementSystem';
import RankingBoard from './RankingBoard';
import StrengthPulseRanking from './StrengthPulseRanking';
import SquadsView from './SquadsView';
import MobileNavigation from './MobileNavigation';
import imgRun from '../assets/desktop/Run Connected, Run Comfortable.jpeg';
import imgGear from '../assets/desktop/123.jpeg';
import { getUserId } from '../utils/auth';
import { sessionVolume, exerciseVolume } from '../utils/strengthMath';




const C = {
    page: '#F6F4F1',        // Paper底色
    paper: '#FFFFFF',       // 純白 (卡片)
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
    text: '#161415',        // = textPrimary，供共用 CommentSheet/EditPostSheet 使用
    accent: '#F95C4B',      // = coral，供共用 renderCaption 使用
};


// 🔴 零模擬數據：原 MOCK_COMMENTS 假留言已移除（CommentSheet 一律走真實留言 API）



/* ═══ STRENGTH ACTIVITY CARD (DRVN STYLE) ═══ */

const StrengthCard = ({ post, onKudo, onComment, onShowKudoers, onDelete, onEdit }) => {
    const userId = getUserId();
    const isOwner = post.uId === userId;

    const raw = post.raw || post;
    const card = raw.drvnCard || {};
    const accent = '#FFF';

    const cardPhoto = post.photo || raw.photo || null;

    // 🎯 終極提取 drvnCard
    let drvn = post.drvnCard || raw.drvnCard || raw.drvn_card;

    // 如果找不到，試著從 session_data 解開
    if (!drvn) {
        let sd = raw.session_data || post.session_data || raw.sessionData;
        if (typeof sd === 'string') { try { sd = JSON.parse(sd); } catch (e) { } }
        if (sd && (sd.drvnCard || sd.drvn_card)) drvn = sd.drvnCard || sd.drvn_card;
    }

    // 如果還是找不到，但這是你剛發的貼文，直接去 socialPostsStore 拿！(終極救援)
    if (!drvn && post.id && String(post.id).startsWith('local_')) {
        try {
            const localItems = getSocialPosts(post.uId || post.user_id);
            const original = localItems.find(p => p.activity_id === post.id);
            if (original?.drvnCard) drvn = original.drvnCard;
        } catch (e) { }
    }

    if (typeof drvn === 'string') { try { drvn = JSON.parse(drvn); } catch (e) { } }

    const isFitnessPost = raw.activity_type === 'fitness' || raw.activity_type === 'strength' || post.type === 'fitness';
    // 純照片／文字貼文不是跑步也不是重訓 —— 以前會掉到最後一個分支，被畫成一張全是 0 的「DRVN 重訓」數據卡
    const isPhotoPost = raw.activity_type === 'post' || post.type === 'post';
    const isRunPost = !isFitnessPost && !isPhotoPost && (raw.activity_type === 'run' || post.type === 'run' || !raw.activity_type);

    const canHydrateRunCard = Boolean(isRunPost && drvn && drvn.layout);

    // 🎯 拔除名稱限制：只要是健身貼文，且有 layout 屬性，無條件使用新渲染！
    const canHydrateFitnessCard = Boolean(isFitnessPost && drvn && drvn.layout);

    let dist = Number(post.stats?.distance || raw.metrics?.distance || 0);
    let pace = Number(post.stats?.pace || raw.metrics?.pace || 0);
    let duration = Number(post.stats?.duration || raw.metrics?.duration || 0);

    const fmtPaceShort = (s) => {
        if (!s) return "--'--";
        const m = Math.floor(s / 60);
        const sc = Math.floor(s % 60);
        return `${m}'${String(sc).padStart(2, '0')}"`;
    };

    const fmtTimeShort = (s) => {
        if (!s) return '0\'00"';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
        return `${m}'${String(sec).padStart(2, '0')}"`;
    };

    const heartRate = Number(post.metrics?.heartRate || post.stats?.heartRate) || null;   // 沒量到就不顯示，不編 135
    const calories = post.metrics?.calories || post.stats?.calories || raw.metrics?.calories || 0;
    const exercisesList = card.exercises || post.stats?.exercises || [];

    /* 媒體區 —— 外框（頭像列、選單、動作列、文字）交給 FeedPostShell，兩個社群同一份。
       W 是這一則實際量到的寬度：左右滿版之後，卡牌依它等比縮放。 */
    const renderMedia = (W) => {
        if (isPhotoPost) {
            const hasPhoto = !!(post.photo || raw.photo_url || (Array.isArray(post.images) && post.images.length) || (Array.isArray(raw.images) && raw.images.length));
            return hasPhoto ? <PostPhotos post={post} /> : null;
        }
        if (isRunPost && (cardPhoto || canHydrateRunCard)) {
            return (
                <>
    {/* DRVN 卡牌：原生 Hydration 渲染 或 舊版截圖 */}
                    {canHydrateRunCard ? (
                        <div style={{ position: 'relative', width: '100%', height: W * ((drvn.editorHeight || 520) / (drvn.editorWidth || 390)), backgroundColor: '#161415', overflow: 'hidden' }}>
                            {/* Dynamic Scaler: 自動適配目前手機螢幕與創建時手機螢幕的比例差距 */}
                            <div style={{
                                position: 'absolute', top: 0, left: 0,
                                width: drvn.editorWidth || 390, height: drvn.editorHeight || 520,
                                transform: `scale(${W / (drvn.editorWidth || 390)})`,
                                transformOrigin: 'top left',
                                pointerEvents: 'none'
                            }}>
                                {/* Background Photo */}
                                {drvn.customImage && (
                                    <div className="absolute inset-0 w-full h-full" style={{ backgroundImage: `url(${drvn.customImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
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
                    ) : (
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                            {cardPhoto && <img loading="lazy" decoding="async" src={cardPhoto} alt="DRVN Running Content" style={{ width: '100%', display: 'block', objectFit: 'cover' }} />}
                        </div>
                    )}
                </>
            );
        }
        if (canHydrateFitnessCard) {
        const feedWidth = W;
        const editorW = drvn.editorWidth || 390;
        const editorH = drvn.editorHeight || Math.round(editorW * 4 / 3);
        const scale = feedWidth / editorW;
        const cardState = (drvn.cardStates && drvn.cardStates[drvn.layout]) || { x: 0, y: 0, scale: 1, opacity: 100 };
            return (
                <>
    {/* 🎯 Fitness Card Native Hydration Canvas */}
                    <div style={{
                        position: 'relative', width: '100%',
                        height: feedWidth * (editorH / editorW),
                        backgroundColor: '#161415', overflow: 'hidden'
                    }}>
                        {/* Dynamic Scaler: maps editor coords → feed display */}
                        <div style={{
                            position: 'absolute', top: 0, left: 0,
                            width: editorW, height: editorH,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                            pointerEvents: 'none'
                        }}>
                            {/* 🎯 FIX 3: 補上若沒有自訂圖片時的預設背景漸層 (與編輯器保持一致) */}
                            {drvn.customImage ? (
                                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${drvn.customImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                            ) : (
                                <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 30% 30%, #F95C4B18 0%, transparent 60%)` }} />
                            )}

                            {drvn.layout === 'POSTER' && drvn.customImage && (
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.6) 100%)' }} />
                            )}
                            <div style={{ position: 'absolute', inset: 0, background: drvn.customImage ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)' }} />

                            {/* Flex-center: same layout as CardEditor */}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{
                                    position: 'relative',
                                    transform: `translate(${cardState.x}px, ${cardState.y}px)`,
                                    willChange: 'transform',
                                    width: drvn.layout === 'POSTER' ? editorW : 'auto',
                                    height: drvn.layout === 'POSTER' ? editorH : 'auto',
                                }}>
                                    <div style={{ transform: `scale(${cardState.scale})`, transformOrigin: 'center' }}>
                                        {/* 🎯 支援所有命名 (包含 FEATURE, APEX, PHYSIO 等) */}
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
                </>
            );
        }
        return (
            <>
    {/* Media (The Strava-Style Dark Card - Sized Down) */}
                <div style={{
                    position: 'relative', width: '100%', aspectRatio: '4/4.5',
                    background: 'linear-gradient(to bottom, #2B2B2B 0%, #161415 40%, #161415 100%)',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '32px 20px 20px', color: 'white'
                }}>
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E")`, zIndex: 0, pointerEvents: 'none' }} />
                    {(card.customImage || raw.photo_url || post.routeImg || post.photo) && (
                        <div style={{ position: 'absolute', inset: 0, background: `url(${card.customImage || raw.photo_url || post.routeImg || post.photo}) center/cover`, filter: 'brightness(0.35) contrast(1.1) blur(1px)', zIndex: 0 }} />
                    )}

                    <div style={{ position: 'relative', zIndex: 1, marginBottom: 28 }}>
                        <p style={{ fontSize: 14, fontWeight: 900, color: 'white', letterSpacing: '0.25em', margin: 0, textTransform: 'uppercase' }}>
                            DRVN 重訓
                        </p>
                    </div>

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
                            <p style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'monospace', color: 'white', margin: 0 }}>{(post.stats?.volume || 0).toLocaleString()}<span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.5 }}>KG</span></p>
                        </div>
                        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px', textAlign: 'left' }}>
                            <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.4, margin: '0 0 4px', color: 'white' }}>運動時間</p>
                            <p style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'monospace', color: 'white', margin: 0 }}>{Math.floor(duration / 60)}<span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.5 }}>MIN</span></p>
                        </div>
                        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px', textAlign: 'left' }}>
                            <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.4, margin: '0 0 4px', color: 'white' }}>消耗熱量</p>
                            <p style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'monospace', color: 'white', margin: 0 }}>{calories}<span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.5 }}>KCAL</span></p>
                        </div>
                        {heartRate && (
                            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px', textAlign: 'left' }}>
                                <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.4, margin: '0 0 4px', color: 'white' }}>平均心率</p>
                                <p style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'monospace', color: 'white', margin: 0 }}>{heartRate}<span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.5 }}>BPM</span></p>
                            </div>
                        )}
                    </div>

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
                                        <span style={{ fontSize: 13, fontWeight: 800, color: accent, textAlign: 'right', fontFamily: 'monospace' }}>
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
                </div>
            </>
        );
    };

    return (
        <FeedPostShell
            post={post}
            isOwner={isOwner}
            onKudo={onKudo}
            onComment={onComment}
            onShowKudoers={onShowKudoers}
            onEdit={onEdit}
            onDelete={onDelete}
            renderMedia={renderMedia}
            after={(isRunPost || post.meetup) ? (
                <>
                    {isRunPost && <SegmentBadges sessionId={post.raw?.session_id || post.activity_id || raw.activity_id} userId={post.uId || post.user_id} C={C} />}
                    {post.meetup && (
                        <MeetupCard meetup={post.meetup} isFitness joinLabel="留言報名"
                            onJoin={() => { triggerHaptic('medium'); onComment?.(post.id); }} />
                    )}
                </>
            ) : null}
        />
    );
};

/* ═══ OFFICIAL EVENTS HERO CAROUSEL ═══ */
const OfficialEventsBanner = () => {
    const [index, setIndex] = useState(0);
    const [showDetail, setShowDetail] = useState(null);
    const [userProgress] = useState({ oe1: 2.4, oe2: 0, oe3: 0 });
    const now = new Date();
    const activeEvents = getOfficialEvents(now);

    // 教學模式進行中 → 暫停輪播並固定在第一張示範海報。
    const [tutorialActive, setTutorialActive] = useState(false);
    useEffect(() => {
        const onState = (e) => {
            const on = !!e?.detail?.active;
            setTutorialActive(on);
            if (on) setIndex(0);
        };
        window.addEventListener('drvn:onboarding-state', onState);
        return () => window.removeEventListener('drvn:onboarding-state', onState);
    }, []);

    useEffect(() => {
        if (activeEvents.length <= 1 || tutorialActive) return;
        const timer = setInterval(() => {
            setIndex(i => (i + 1) % activeEvents.length);
        }, 6000);
        return () => clearInterval(timer);
    }, [activeEvents.length, tutorialActive]);

    if (activeEvents.length === 0) return null;

    const event = activeEvents[index];
    const isLive = new Date(event.startDate) <= now;
    const daysLeft = Math.max(0, Math.ceil((new Date(event.endDate) - now) / (1000 * 60 * 60 * 24)));
    const myProgress = userProgress[event.id] || 0;
    /* 剩餘天數文案：四個海報版型共用同一份，不各寫一次（介面標準 §9）。 */
    const remainLabel = daysLeft > 0 ? `還有 ${daysLeft} 天` : '今天最後一天';
    const progressPct = event.targetPerMember > 0 ? Math.min(100, (myProgress / event.targetPerMember) * 100) : 0;

    return (
        <div className="mb-5">
            {/* ── Section Header — Swiss 鈦金屬細線 + 手繪下劃線 ── */}
            <div style={{ padding: '0 24px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'inline-block', position: 'relative', minWidth: 0 }}>
                        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: C.textPrimary, margin: 0, lineHeight: 1 }}>官方活動</h2>
                        <svg width="100%" height="7" viewBox="0 0 120 7" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', height: 7, overflow: 'visible' }}>
                            <path d="M1 4 Q 20 1, 40 3.5 T 80 3 T 119 4" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </div>
                    {/* 只有一檔活動時圓點沒有作用（介面標準 §7），不畫 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {activeEvents.length > 1 && (
                    <div className="flex items-center gap-1.5" style={{ paddingBottom: 2 }}>
                    {activeEvents.map((_, i) => (
                        <button key={i} onClick={() => setIndex(i)}
                            className="rounded-full transition-all duration-300"
                            style={{
                                width: i === index ? 20 : 8,
                                height: 8,
                                background: i === index ? C.coral : 'rgba(22,20,21,0.15)'
                            }}
                        />
                    ))}
                    </div>
                )}
                <CommunitySwitch community="fitness" />
                </div>
                </div>
                <div style={{ height: 1, marginTop: 14, background: 'linear-gradient(90deg, rgba(151,166,182,0) 0%, rgba(151,166,182,0.5) 20%, rgba(255,255,255,0.95) 50%, rgba(151,166,182,0.5) 80%, rgba(151,166,182,0) 100%)' }} />
            </div>

            {/* ── Vertical Poster Card (Figure 1 Style) ── */}
            <div className="mx-4 mb-5" style={{ borderRadius: 28, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
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
                        onClick={() => setShowDetail(event)}
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
                                    {/* 左下原本是英文標題（PEAK HEAT），就是中間大標的英譯 —— 同一件事講兩次，刪掉 */}
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: '"Space Mono", monospace', fontSize: 11, color: 'rgba(22,20,21,0.6)', zIndex: 1 }}>
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
                                <div style={{ display: 'flex', justifyContent: 'flex-end', fontFamily: '"Space Mono", monospace', fontSize: 11, color: 'rgba(22,20,21,0.6)', zIndex: 1 }}>
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
                                        fontFamily: '"Plus Jakarta Sans", sans-serif',
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

            {/* ── Detail Modal (Swiss Minimalist Editorial Style) ── */}
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
                                    {/* Title block */}
                                    <div className="flex items-start gap-4 mb-6">
                                        <span className="text-5xl leading-none drop-shadow-sm grayscale saturate-50 opacity-80">{showDetail.icon}</span>
                                        <div className="pt-1 flex-1">
                                            <p className="text-[12px] font-[1000] tracking-[0.04em] mb-1" style={{ color: '#D94030' }}>官方挑戰</p>
                                            <h2 className="text-[26px] font-[1000] tracking-tight leading-tight text-[#161415]" style={{ fontFamily: "var(--font-display)" }}>{showDetail.title}</h2>
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
                                                        <span className="text-[48px] font-light text-[#161415] leading-none tracking-tighter" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
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
                                                            <span className="text-[9px] font-light text-[#161415]/20 tracking-widest" style={{ fontFamily: 'monospace' }}>
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
                                        {(userProgress[showDetail.id] || 0) >= showDetail.targetPerMember ? 'Cleared ✓' : 'Engage'}
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </PortalSheet>
                )}
            </AnimatePresence>
        </div>
    );
};


/* ═══ FEED SKELETON (載入骨架，取代直接 pop-in) ═══ */
/* ❌ FeedCardSkeleton / FeedEmptyState 的本地版已移除（2026-09 稽核）
   —— 與 SocialHubMobile 的那份只差幾個字，卻已經開始各自漂移。
   兩頁共用 SocialFeed/CommunityChrome.jsx 的版本，文案用 community 參數區分。 */

const FeedTab = ({ userId, autoOpenCreate, onAutoOpenCreateDone }) => {
    const navigate = useNavigate();

    /* 🧩 2026-09 稽核第二階段：
       這裡原本有一份跟 SocialHubMobile 幾乎一樣的
       「抓資料 / 發文 / 按讚 / 刪除 / 編輯 / 過濾」，兩份各自漂移，
       於是同一個 bug 修一邊忘一邊。整段行為改吃 useCommunityFeed，
       這一頁只留下健身社群真正不一樣的東西：貼文卡怎麼畫、草稿長什麼樣。 */
    const buildDraft = useCallback((data, { userId: uid, uName }) => {
        const ts = Date.now();
        // 🔢 從連結的訓練帶出真數據（不再寫死 0）—— 修掉「數據全是未知 / 0」的根因
        const lw = data.linkedWorkout || {};
        const realStats = {
            volume: lw.volumeKg || 0,
            volume_kg: lw.volumeKg || 0,
            sets: lw.setCount || 0,
            exercises: lw.exerciseCount || 0,
            duration: lw.durationSec || 0,
            calories: lw.calories || 0,
            mainSet: lw.main || null,
            intensity: lw.intensity || null,
        };
        // 用訓練的真實日期；沒有才退回發文當下，避免 invalid date
        const createdIso = lw.dateIso || data.created_at || new Date().toISOString();
        const targets = data.targets || data.communities || ['fitness'];
        return {
            id: `p_new_${ts}`, activity_id: `local_${ts}`,
            uId: uid, user_id: uid, userName: uName, user_name: uName, init: uName[0] || 'U',
            type: 'fitness', activity_type: 'fitness', community: 'fitness',
            createdAt: createdIso, caption: data.caption, title: data.title || null,
            stats: realStats, metrics: { volume_kg: lw.volumeKg || 0 },
            photo: data.images?.[0] || data.photo || null,
            images: data.images || (data.photo ? [data.photo] : []),
            kudos: 0, commentCount: 0, myKudo: false,
            targets, communities: targets,
            visibility: data.visibility || 'public',
            tags: data.tags || [], location: data.location || null,
            meetup: data.meetup || null,
            orientation: data.orientation || 'portrait', imgPos: data.imgPos ?? 50,
            session_data: { type: 'fitness', stats: realStats, drvnCard: data.linkedWorkout, meetup: data.meetup || null },
        };
    }, []);

    // 只載入健身類貼文（跑步貼文歸跑步社群牆）
    const localFilter = useCallback((a) => (
        a.activity_type === 'fitness' || a.activity_type === 'strength' || a.community === 'fitness'
    ), []);

    const {
        filtered, loading, feedError,
        feedFilter, setFeedFilter,
        following, setFollowing, graph, counts,
        commentPostId, setCommentPostId,
        kudoersPostId, setKudoersPostId,
        editingPost, setEditingPost,
        showCreate, setShowCreate,
        handleNewPost, handleKudo, handleDelete, handleEdit, saveEdit, bumpCommentCount,
    } = useCommunityFeed({
        userId,
        community: 'fitness',
        buildDraft,
        localFilter,
        // 🩹 之前沒帶 community → 伺服器端分類錯，重載後撈不回來
        createFields: { community: 'fitness' },
    });

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
            <PermanentChallenges defaultTab="strength" />
            <FeedFilterTabs
                activeFilter={feedFilter}
                onFilterChange={setFeedFilter}
                colors={{ text: '#FFFFFF', sub: C.textMuted, bg: 'rgba(22,20,21,0.05)', activeBg: C.coral, activeShadow: '0 8px 20px rgba(249,92,75,0.3)' }}
            />

            {/* 探索入口（上移到追蹤動態之前） */}
            <div className="mt-4">
                {/* 探索是導覽入口，不是這頁的主角 —— 標頭收一階、不畫細線 */}
                <div style={{ padding: '0 24px', marginBottom: 10 }}>
                    <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: C.textPrimary, margin: 0, lineHeight: 1 }}>探索</h2>
                </div>
                <HeroCards navigate={navigate} C={C} primary={{
                    onClick: () => navigate('/social-mobile', { state: { activeTab: 'feed' } }),
                    image: imgRun, gearImage: imgGear,
                    titleTop: '跑步', titleBottom: '社群', Icon: Activity,
                }} />
            </div>

            {/* 🎯 找人追蹤：搜尋（名稱/ID/好友碼）＋ 可展開推薦。
                sport="strength" 只影響推薦排序；追蹤關係與跑步社群完全同步。 */}
            {feedFilter === 'discover' && (
                <FollowSuggestions
                    userId={userId}
                    following={following}
                    graph={graph}
                    sport="strength"
                    onFollowChange={setFollowing}
                    colors={{ text: C.textPrimary, sub: C.textMuted, highlight: C.coral }}
                />
            )}
            {feedFilter === 'following' && (
                <div style={{ padding: '8px 16px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, fontWeight: 700, color: C.textMuted }}>
                        <DataPulse ready={true} w="4rem" h="0.65rem" radius="0.32rem" theme="light" inline>
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
                <FeedEmptyState community="fitness" filter={feedFilter}
                    onDiscover={() => { triggerHaptic('light'); setFeedFilter('discover'); }}
                    onCreate={() => { triggerHaptic('medium'); setShowCreate(true); }}
                />
            ) : filtered.map(post => <StrengthCard key={post.id} post={post} onKudo={handleKudo} onComment={id => setCommentPostId(id)} onShowKudoers={id => setKudoersPostId(id)} onDelete={handleDelete} onEdit={handleEdit} />)}

            <AnimatePresence>
                {commentPostId && <CommentSheet postId={commentPostId} onClose={() => setCommentPostId(null)} userId={userId} C={C} onPosted={bumpCommentCount} />}
                {kudoersPostId && <KudosSheet postId={kudoersPostId} onClose={() => setKudoersPostId(null)} C={C} />}
                {editingPost && <EditPostSheet post={editingPost} onClose={() => setEditingPost(null)} onSave={saveEdit} C={C} />}
            </AnimatePresence>
            <motion.button aria-label="建立貼文" onClick={() => setShowCreate(true)} className="fixed z-50 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-xl" style={{ background: C.highlight, bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))', right: 20 }} whileTap={{ scale: 0.94 }}><Plus size={26} /></motion.button>
            <AnimatePresence>
                {showCreate && <IGPostComposer userId={userId} community="fitness" onClose={() => setShowCreate(false)} onPost={handleNewPost} />}
            </AnimatePresence>
        </div>
    );
};

/* ═══ TABS & PAGE ═══ */
/* ❌ TABS / TabBar 的本地版已移除 —— 與跑步社群那份幾乎逐字相同，
   只差 layoutId，而且其中一頁的分頁鈕漏了按壓回饋。
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

const FitnessCommunityPage = ({ userId: propUserId }) => {
    const userId = propUserId || getUserId();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState('feed');
    const [headerVisible, setHeaderVisible] = useState(false);
    const [autoOpenCreate, setAutoOpenCreate] = useState(false);

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
            {/* 健身頁主背景：Misty Grey #E8E9E6 */}
            <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: '#E8E9E6' }} />

            <CommunityTabBar activeTab={activeTab} setActiveTab={setActiveTab} community="fitness" />

            <div className="h-full relative z-10 overflow-y-auto no-scrollbar w-full" style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden', touchAction: 'pan-y', paddingBottom: 'var(--nav-clearance, 140px)' }}>
                {activeTab !== 'ranking' && (
                    <div className="pb-2 flex flex-col" style={{ paddingTop: 'var(--community-content-top)' }}>
                        {/* ── Masthead —— 共用組件（SocialFeed/CommunityChrome）。
                            右邊的字標點一下換到跑步社群。 */}
                        {/* 動態分頁不放招牌列（分頁列已寫「動態」，§3）；字標改放到官方活動那一列。 */}
                        {activeTab !== 'feed' && (
                            <motion.div
                                variants={editorialReveal}
                                initial="hidden"
                                animate={headerVisible ? "visible" : "hidden"}
                            >
                                <CommunityMasthead community="fitness" tab={activeTab} />
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
                        {activeTab === 'feed' && <FeedTab userId={userId} autoOpenCreate={autoOpenCreate} onAutoOpenCreateDone={() => setAutoOpenCreate(false)} />}
                        {activeTab === 'ranking' && <StrengthPulseRanking />}
                        {activeTab === 'squads' && <div className="px-4 pt-2"><SquadsView type="strength" userId={userId} /></div>}
                        {activeTab === 'profile' && (
                            <div className="px-4 pt-2">
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

export default FitnessCommunityPage;
