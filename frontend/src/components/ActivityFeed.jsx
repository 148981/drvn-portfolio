/* ⚠️ 死碼 — 全專案零引用（2026-09 社群稽核）
   ────────────────────────────────────────────────────────────────
   桌機版動態牆。/activity-feed 路由已於 2026-09 移除（全專案零導航，使用者到不了）。動態牆的正式入口是 /social-mobile。
   保留只是因為稽核當下沒有直接刪檔的權限；確認過沒有其他用途後
   可以整支移除，不影響任何畫面。 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Heart, MessageCircle, MapPin, Clock, Zap, User, Calendar, TrendingUp, ArrowLeft } from 'lucide-react';
import RouteMap from './RouteMap';
import { getUserId } from '../utils/auth';
import { toast, confirmDialog } from '../utils/toast';

import apiClient from '../api/client';
import { formatPace as fmtPace } from '../utils/format';
import { mediaUrl } from '../utils/apiHostFix';


// LOEWE Color Palette (matching CardioTracker)
const PALETTE = {
    background: '#F6F4F1',
    cream: '#F6F4F1',
    espresso: '#4A3B32',
    terracotta: '#8A7E73',
    olive: '#5A7A3A',
    sand: '#E4DED2',
    warmGray: '#8A7E73',
    orange: '#D94030'
};

// Helper Functions
const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatPace = fmtPace;   // 🩹 J: 單一真相源 → utils/format.js

const formatRelativeTime = (isoString) => {
    const now = new Date();
    const then = new Date(isoString);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
};

// ============================================================================
// Activity Card Component
// ============================================================================

const ActivityCard = ({ activity, onKudo, onEdit, onDelete, currentUserId }) => {
    const [isKudoing, setIsKudoing] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editCaption, setEditCaption] = useState(activity.caption || '');
    const [isDeleting, setIsDeleting] = useState(false);

    const handleKudoClick = async () => {
        if (isKudoing) return;
        setIsKudoing(true);
        await onKudo(activity.activity_id, activity.user_gave_kudo);
        setTimeout(() => setIsKudoing(false), 300);
    };

    const handleEditSubmit = async () => {
        try {
            await onEdit(activity.activity_id, editCaption);
            setShowEditModal(false);
        } catch (error) {
            console.error('Edit failed:', error);
            toast.error('更新動態失敗，請稍後再試');
        }
    };

    const handleDeleteClick = async () => {
        if (isDeleting) return;
        if ((await confirmDialog('確定要刪除這個活動嗎？', { danger: true }))) {
            setIsDeleting(true);
            try {
                await onDelete(activity.activity_id);
            } catch (error) {
                console.error('Delete failed:', error);
                toast.error('刪除動態失敗，請稍後再試');
                setIsDeleting(false);
            }
        }
    };

    const isOwnPost = activity.user_id === currentUserId;

    return (
        <div
            className="activity-card rounded-3xl p-6 mb-5 transition-all hover:shadow-xl relative"
            style={{
                backgroundColor: PALETTE.cream,
                border: `2px solid ${PALETTE.sand}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}
        >
            {/* User Header */}
            <div className="flex items-center gap-3 mb-4">
                <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-md"
                    style={{ backgroundColor: PALETTE.terracotta }}
                >
                    <User size={28} color="white" />
                </div>
                <div className="flex-1">
                    <h3
                        className="font-serif font-bold text-xl"
                        style={{ color: PALETTE.espresso }}
                    >
                        {activity.user_name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm" style={{ color: PALETTE.warmGray }}>
                        <Calendar size={14} />
                        <span>{formatRelativeTime(activity.created_at)}</span>
                    </div>
                </div>
                <div
                    className="px-4 py-2 rounded-full text-sm font-bold"
                    style={{
                        backgroundColor: PALETTE.olive + '30',
                        color: PALETTE.olive,
                        border: `1px solid ${PALETTE.olive}`
                    }}
                >
                    🏃 Run
                </div>

                {/* Edit/Delete Buttons (only for own posts) */}
                {isOwnPost && (
                    <div className="flex gap-2">
                        <motion.button {...pressProps('row')}
 onClick={() => setShowEditModal(true)}
 className="p-2 rounded-lg hover:bg-black/5 transition-colors"
 style={{ color: PALETTE.warmGray }}
 >
                            ✏️
                        </motion.button>
                        <motion.button {...pressProps('row')}
 onClick={handleDeleteClick}
 disabled={isDeleting}
 className="p-2 rounded-lg hover:bg-black/5 transition-colors"
 style={{ color: isDeleting ? PALETTE.warmGray : '#D94030' }}
 >
                            {isDeleting ? '...' : '🗑️'}
                        </motion.button>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="bg-white rounded-[18px] p-6 max-w-md w-full shadow-2xl">
                        <h3 className="text-2xl font-bold mb-4" style={{ color: PALETTE.espresso }}>編輯活動</h3>
                        <textarea
                            value={editCaption}
                            onChange={(e) => setEditCaption(e.target.value)}
                            className="w-full p-3 rounded-xl border-2 mb-4 resize-none font-serif"
                            style={{ borderColor: PALETTE.sand, backgroundColor: PALETTE.background }}
                            rows={4}
                            placeholder="更新你的心得..."
                        />
                        <div className="flex gap-3">
                            <motion.button {...pressProps('cta')}
 onClick={() => setShowEditModal(false)}
 className="flex-1 py-3 rounded-xl font-bold"
 style={{ backgroundColor: PALETTE.background, color: PALETTE.warmGray }}
 >
                                取消
                            </motion.button>
                            <motion.button {...pressProps('cta')}
 onClick={handleEditSubmit}
 className="flex-1 py-3 rounded-xl font-bold text-white"
 style={{ backgroundColor: PALETTE.olive }}
 >
                                儲存
                            </motion.button>
                        </div>
                    </div>
                </div>
            )}

            {/* Caption */}
            {activity.caption && (
                <p className="text-base mb-4 leading-relaxed font-serif" style={{ color: PALETTE.espresso }}>
                    {activity.caption}
                </p>
            )}

            {/* Photo */}
            {activity.photo_url && (
                <div className="mb-4 rounded-[18px] overflow-hidden shadow-lg border-2" style={{ borderColor: PALETTE.sand }}>
                    <img loading="lazy" decoding="async"
                        src={mediaUrl(activity.photo_url)}
                        alt="Activity"
                        className="w-full object-cover"
                        style={{ maxHeight: '400px' }}
                    />
                </div>
            )}

            {/* Map Thumbnail or Location Indicator */}
            {(() => {
                if (activity.route_preview && activity.route_preview.length > 1) {
                    console.log(`🗺️ Activity ${activity.activity_id} map route points:`, activity.route_preview.length);
                    return (
                        <div className="h-56 rounded-[18px] overflow-hidden mb-4 border-2 shadow-md relative z-0" style={{ borderColor: PALETTE.sand }}>
                            <RouteMap
                                route={activity.route_preview}
                                showControls={false}
                                mapStyle="minimal"
                                className="w-full h-full"
                            />
                        </div>
                    );
                } else if (activity.route_preview && activity.route_preview.length === 1) {
                    return (
                        <div
                            className="h-56 rounded-[18px] mb-4 border-2 shadow-md flex flex-col items-center justify-center gap-3"
                            style={{
                                backgroundColor: PALETTE.background,
                                borderColor: PALETTE.sand
                            }}
                        >
                            <MapPin size={48} style={{ color: PALETTE.terracotta }} />
                            <p className="text-sm font-bold" style={{ color: PALETTE.warmGray }}>
                                📍 位置已記錄
                            </p>
                            <p className="text-xs" style={{ color: PALETTE.warmGray }}>
                                {activity.route_preview[0].lat?.toFixed(4)}, {activity.route_preview[0].lng?.toFixed(4)}
                            </p>
                        </div>
                    );
                }
                return null;
            })()}

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <StatCard
                    icon={MapPin}
                    label="Distance"
                    value={`${activity.distance_km.toFixed(2)} km`}
                />
                <StatCard
                    icon={Clock}
                    label="Time"
                    value={formatTime(activity.duration_seconds)}
                />
                <StatCard
                    icon={Zap}
                    label="Pace"
                    value={formatPace(activity.pace_per_km)}
                />
            </div>

            {/* Kudos & Comments Bar */}
            <div
                className="flex items-center gap-6 pt-4 border-t-2"
                style={{ borderColor: PALETTE.sand }}
            >
                <motion.button {...pressProps('pill')}
 onClick={handleKudoClick}
 disabled={isKudoing}
 className="flex items-center gap-2 hover:opacity-80"
 >
                    <Heart
                        size={24}
                        fill={activity.user_gave_kudo ? PALETTE.orange : 'none'}
                        stroke={activity.user_gave_kudo ? PALETTE.orange : PALETTE.warmGray}
                        strokeWidth={2.5}
                        className={isKudoing ? 'animate-pulse' : ''}
                    />
                    <span
                        className="text-base font-bold"
                        style={{ color: activity.user_gave_kudo ? PALETTE.orange : PALETTE.warmGray }}
                    >
                        {activity.kudos_count}
                    </span>
                </motion.button>

                <motion.button {...pressProps('row')} className="flex items-center gap-2 hover:opacity-80">
                    <MessageCircle size={22} strokeWidth={2.5} style={{ color: PALETTE.warmGray }} />
                    <span className="text-base font-bold" style={{ color: PALETTE.warmGray }}>
                        {activity.comment_count}
                    </span>
                </motion.button>

                {activity.segment_efforts && activity.segment_efforts.length > 0 && (
                    <div className="ml-auto flex items-center gap-2 text-sm font-bold" style={{ color: PALETTE.olive }}>
                        <TrendingUp size={18} />
                        <span>{activity.segment_efforts.length} Segments</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// Stat Card Component
// ============================================================================

const StatCard = ({ icon: Icon, label, value }) => {
    return (
        <div
            className="flex flex-col items-center py-4 px-3 rounded-xl border-2"
            style={{
                backgroundColor: PALETTE.background,
                borderColor: PALETTE.sand
            }}
        >
            <Icon size={20} style={{ color: PALETTE.warmGray }} className="mb-2" />
            <span className="text-xs uppercase tracking-wide font-bold" style={{ color: PALETTE.warmGray }}>
                {label}
            </span>
            <span
                className="text-lg font-bold mt-1 font-serif"
                style={{ color: PALETTE.espresso }}
            >
                {value}
            </span>
        </div>
    );
};

// ============================================================================
// Main Activity Feed Component
// ============================================================================

const ActivityFeed = () => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);

    const currentUserId = getUserId();

    useEffect(() => {
        fetchFeed();
    }, []);

    const fetchFeed = async () => {
        try {
            console.log('🔍 Fetching activity feed...');
            const response = await apiClient.get(`/api/activities/feed?user_id=${currentUserId}&limit=20`);
            console.log('✅ Feed response:', response.data);
            setActivities(response.data.activities);
            setHasMore(response.data.has_more);
            setLoading(false);
        } catch (error) {
            console.error('❌ Error fetching feed:', error);
            setLoading(false);
        }
    };

    const handleKudo = async (activityId, currentlyKudoed) => {
        const action = currentlyKudoed ? 'remove' : 'add';

        try {
            const formData = new FormData();
            formData.append('user_id', currentUserId);
            formData.append('user_name', 'Current User');
            formData.append('action', action);

            const response = await apiClient.post(`/api/activities/${activityId}/kudos`, formData);

            setActivities(prev => prev.map(a =>
                a.activity_id === activityId
                    ? {
                        ...a,
                        kudos_count: response.data.kudos_count,
                        user_gave_kudo: response.data.user_gave_kudo
                    }
                    : a
            ));
        } catch (error) {
            console.error('Error toggling kudo:', error);
        }
    };

    const handleEdit = async (activityId, newCaption) => {
        try {
            const formData = new FormData();
            formData.append('user_id', currentUserId);
            formData.append('caption', newCaption);

            const response = await apiClient.put(`/api/activities/${activityId}`, formData);

            setActivities(prev => prev.map(a =>
                a.activity_id === activityId
                    ? { ...a, caption: response.data.caption }
                    : a
            ));
        } catch (error) {
            console.error('Error editing activity:', error);
            throw error;
        }
    };

    const handleDelete = async (activityId) => {
        try {
            await apiClient.delete(`/api/activities/${activityId}?user_id=${currentUserId}`);
            setActivities(prev => prev.filter(a => a.activity_id !== activityId));
        } catch (error) {
            console.error('Error deleting activity:', error);
            throw error;
        }
    };

    if (loading) {
        return (
            <div
                className="min-h-[100dvh] flex items-center justify-center"
                style={{ backgroundColor: PALETTE.background }}
            >
                <div className="text-center">
                    <div className="text-5xl mb-4 animate-bounce">🏃</div>
                    <div className="text-2xl font-serif font-bold" style={{ color: PALETTE.espresso }}>
                        Loading feed...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-[100dvh] font-sans pb-4"
            style={{ backgroundColor: PALETTE.background }}
        >
            {/* Header with Back Button */}
            <div
                className="sticky top-0 z-20 backdrop-blur-md border-b-2 shadow-sm"
                style={{
                    backgroundColor: PALETTE.cream + 'F0',
                    borderColor: PALETTE.sand
                }}
            >
                <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-4">
                    <motion.button {...pressProps('pill')}
 onClick={() => window.history.back()}
 className="p-2 rounded-xl hover:bg-black/5"
 style={{ color: PALETTE.espresso }}
 >
                        <ArrowLeft size={24} strokeWidth={2.5} />
                    </motion.button>
                    <div className="flex-1">
                        <h1
                            className="text-3xl font-serif font-bold"
                            style={{ color: PALETTE.espresso }}
                        >
                            Activity Feed
                        </h1>
                        <p className="text-sm font-bold uppercase tracking-wide mt-1" style={{ color: PALETTE.warmGray }}>
                            {activities.length} recent {activities.length === 1 ? 'activity' : 'activities'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Feed Content */}
            <div className="max-w-3xl mx-auto px-4 py-6">
                {activities.length === 0 ? (
                    <div
                        className="text-center py-20 rounded-3xl border-2 shadow-lg"
                        style={{
                            backgroundColor: PALETTE.cream,
                            borderColor: PALETTE.sand
                        }}
                    >
                        <div className="text-7xl mb-6">🏃‍♂️</div>
                        <h2
                            className="text-2xl font-serif font-bold mb-3"
                            style={{ color: PALETTE.espresso }}
                        >
                            No Activities Yet
                        </h2>
                        <p className="text-lg" style={{ color: PALETTE.warmGray }}>
                            Complete a run and share it to see activities here!
                        </p>
                    </div>
                ) : (
                    activities.map(activity => (
                        <ActivityCard
                            key={activity.activity_id}
                            activity={activity}
                            onKudo={handleKudo}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            currentUserId={currentUserId}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default ActivityFeed;
