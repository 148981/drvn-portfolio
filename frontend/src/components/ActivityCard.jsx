import React, { useState, memo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { Heart, MessageCircle, MoreHorizontal, MapPin, PenTool } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import RouteMap from './RouteMap';
import CommentSection from './CommentSection';
import './SocialEditorial.css';

import apiClient from '../api/client';
import { formatPace as fmtPace } from '../utils/format';


const ActivityCard = ({ activity, currentUserId, onKudoUpdate, onInteraction, onDelete, onEdit }) => {
    // Debug info
    console.log(`[ActivityCard] ID: ${activity.activity_id}, Owner: ${activity.user_id} (${typeof activity.user_id}), Current: ${currentUserId} (${typeof currentUserId}), Kudos: ${activity.kudos_count} (${typeof activity.kudos_count})`);

    const [liked, setLiked] = useState(activity.user_gave_kudo);
    const [likesCount, setLikesCount] = useState(parseInt(activity.kudos_count) || 0);
    const [showComments, setShowComments] = useState(false);
    const [isLikeAnimating, setIsLikeAnimating] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const formatPace = fmtPace;   // 🩹 J: 單一真相源 → utils/format.js

    const handleKudo = async () => {
        if (isLikeAnimating) return;
        const newLiked = !liked;
        const newCount = likesCount + (newLiked ? 1 : -1);
        setLiked(newLiked);
        setLikesCount(newCount);
        setIsLikeAnimating(true);
        setTimeout(() => setIsLikeAnimating(false), 300);

        try {
            const formData = new FormData();
            formData.append('user_id', currentUserId);
            formData.append('user_name', 'Me');
            formData.append('action', newLiked ? 'add' : 'remove');
            const response = await apiClient.post(`/api/activities/${activity.activity_id}/kudos`, formData);
            if (response.data) {
                setLikesCount(response.data.kudos_count);
                setLiked(response.data.user_gave_kudo);
            }
            if (onKudoUpdate) onKudoUpdate(activity.activity_id, newCount, newLiked);
            if (newLiked && onInteraction) onInteraction('kudo');
        } catch (error) {
            setLiked(!newLiked);
            setLikesCount(likesCount);
        }
    };

    // --- Helper for Dynamic Greeting ---
    const getRunTitle = () => {
        const date = new Date(activity.created_at || new Date());
        const hour = date.getHours();

        const morningTitles = ["Morning Ritual", "Dawn Patrol", "Sunrise Stride"];
        const middayTitles = ["Solar Session", "Midday Grind", "Power Break"];
        const afternoonTitles = ["Golden Hour", "Sunset Chase", "Dusk Dash", "Sundown Session", "Magic Hour"];
        const eveningTitles = ["Night Shift", "After Hours", "City Lights", "Evening Flow"];

        const pick = (arr) => arr[(date.getDate() + hour) % arr.length].toUpperCase();

        if (hour >= 5 && hour < 11) return pick(morningTitles);
        if (hour >= 11 && hour < 16) return pick(middayTitles);
        if (hour >= 16 && hour < 18) return pick(afternoonTitles);
        return pick(eveningTitles);
    };

    const formatDate = (isoString) => {
        if (!isoString) return "";
        const date = new Date(isoString);
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        const dateStr = date.toLocaleDateString('en-US', options).toUpperCase();
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        // Simplified status logic since we don't have full "completed" status in basic activity object, assume completed
        return `${dateStr} ● ${timeStr}`;
    };

    return (
        <div className="activity-card-container mb-6 p-4">
            <style>{`
                
                
                
                .font-atomic { font-family: 'Atomic Age', cursive; }
                .font-reenie { font-family: 'Reenie Beanie', cursive; }
                
                .note-card {
                    border-radius: 28px;
                    padding: 20px;
                    position: relative;
                    overflow: hidden;
                    transition: transform 0.2s;
                }
                .note-dark {
                    background-color: #262523;
                    color: white;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .note-cream {
                    background-color: #F3F0E6;
                    color: #262523;
                }
            `}</style>

            {/* 1. Header (Updated to Clean Style with Reenie Beanie) */}
            <div className="flex justify-between items-end mb-4 px-2 relative z-50">
                <div>
                    <h1 className="map-section-title !font-reenie !text-6xl !lowercase !tracking-normal !mb-0" style={{ fontFamily: '"Reenie Beanie", cursive' }}>
                        {getRunTitle()}
                    </h1>
                </div>
                <div className="text-right pb-4 flex flex-col items-end gap-1">
                    {/* Menu for Owner */}
                    {((currentUserId === activity.user_id) || (currentUserId?.replace('_', '') === activity.user_id?.replace('_', ''))) && (
                        <div className="relative">
                            <motion.button {...pressProps('icon')}
 onClick={() => setShowMenu(!showMenu)}
 className="p-1 hover:bg-black/5 rounded-full mb-1 transition-colors"
 >
                                <MoreHorizontal size={20} className="text-[#888]" />
                            </motion.button>

                            {showMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-xl border border-black/5 z-20 overflow-hidden py-1">
                                        <motion.button {...pressProps('cta')}
 onClick={() => { setShowMenu(false); onEdit(activity.activity_id, activity.caption); }}
 className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
 >
                                            <PenTool size={14} /> Edit
                                        </motion.button>
                                        <motion.button {...pressProps('cta')}
 onClick={() => { setShowMenu(false); onDelete(activity.activity_id); }}
 className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
 >
                                            <MoreHorizontal size={14} className="rotate-90" /> Delete
                                        </motion.button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <p className="text-[12px] font-bold tracking-widest text-[#888] uppercase mb-1">
                        {formatDate(activity.created_at)}
                    </p>
                    <div className="inline-block px-3 py-1 rounded-full bg-[#9FEF00] text-[#111] text-[9px] font-black tracking-widest uppercase">
                        COMPLETED
                    </div>
                </div>
            </div>

            {/* 2. Map Card (Using New CSS Class + Cream Filter) */}
            <div className="map-container relative group">
                {/* Clean Map View: No avatar, no filters, just current route on cream bg */}

                {/* 1. Remove Avatar Overlay (Deleted) */}

                {/* 2. Remove Strong Filters (Deleted) - keeping minimal overlay if needed or raw? User said 'only screenshot' */}
                {/* Actually, user said 'screenshot of route map' - so let's keep it raw. */}

                {activity.route_preview && activity.route_preview.length > 0 ? (
                    <RouteMap
                        route={activity.route_preview}
                        mapStyle="minimal"
                        showControls={false}
                        mapOnly={true}
                        interactive={false}
                        className="w-full h-full"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#F7F5F0]">
                        <span className="text-gray-300 font-sans text-xl">NO MAP DATA</span>
                    </div>
                )}
            </div>

            {/* 3. Stats Grid (New Dark Widgets -> Now White via CSS) */}
            <div className="stats-grid">
                {/* Distance */}
                <div className="stat-card">
                    <span className="stat-label">距離</span>
                    <span className="stat-value">{(activity.distance_km || 0).toFixed(2)}</span>
                    <span className="text-[11px] text-gray-500 mt-1">KM</span>
                </div>

                {/* Duration */}
                <div className="stat-card">
                    <span className="stat-label">時長</span>
                    <span className="stat-value">
                        {new Date((activity.duration_seconds || 0) * 1000).toISOString().substr(11, 8).replace(/^00:/, '')}
                    </span>
                </div>


            </div>

            {/* 4. Actions Footer (Clean Style) */}
            <div className="interaction-bar relative z-10">
                <motion.button {...pressProps('pill')}
 onClick={handleKudo}
 className={`flex items-center gap-2 group`}
 >
                    <Heart size={24}
                        className={`transition-colors ${liked ? 'fill-[#FF9F7F] text-[#FF9F7F]' : 'text-black group-hover:text-[#FF9F7F]'}`}
                        strokeWidth={2}
                    />
                    <span className="font-sans text-sm font-bold text-[#111]">{likesCount}</span>
                </motion.button>

                <motion.button {...pressProps('pill')}
 onClick={() => setShowComments(true)}
 className="flex items-center gap-2 group"
 >
                    <MessageCircle size={24} className="text-[#111] transition-colors" strokeWidth={2} />
                    <span className="font-sans text-sm font-bold text-[#111]">{activity.comment_count || 0}</span>
                </motion.button>
            </div>

            {/* Comments Drawer (Existing) */}
            <AnimatePresence>
                {showComments && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowComments(false)}
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9999]"
                        />
                        <motion.div
                            initial={{ y: '100%', opacity: 0, scale: 0.95 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: '100%', opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed bottom-24 left-4 right-4 z-[9999] max-h-[60dvh] rounded-[28px] overflow-hidden shadow-2xl mb-0 max-w-[393px] mx-auto bg-[#F9F7F2] border border-white/50"
                        >
                            <div className="flex justify-center py-3 border-b border-black/5">
                                <div className="w-12 h-1 rounded-full bg-black/10" />
                            </div>
                            <div className="overflow-y-auto max-h-[calc(70dvh-50px)] p-4">
                                <CommentSection
                                    activityId={activity.activity_id}
                                    currentUserId={currentUserId}
                                    onInteraction={onInteraction}
                                />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

// 🟢 P2-2: feed 清單項目，常被 .map 大量渲染 → memo 避免單筆互動觸發整列重繪
export default memo(ActivityCard);
