import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import AchievementBadge from './AchievementBadge';
import { X, Trophy, Target, Award, Sparkles } from 'lucide-react';

import apiClient from '../api/client';

const PALETTE = {
    background: '#F0EBE0',
    beige: '#F5F2E9',
    darkBeige: '#D4C4B0',
    warmGray: '#8B7F72',
    olive: '#556B2F',
    gold: '#B8956A'
};

const AchievementGallery = ({ userId, onClose }) => {
    const [achievements, setAchievements] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedAchievement, setSelectedAchievement] = useState(null);
    const [userStats, setUserStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [totalPoints, setTotalPoints] = useState(0);
    const [unlockedCount, setUnlockedCount] = useState(0);

    const categories = [
        { id: 'all', name: 'All', icon: Trophy },
        { id: 'distance', name: 'Distance', icon: Target },
        { id: 'consistency', name: 'Streaks', icon: Award },
        { id: 'personal_record', name: 'Records', icon: Sparkles },
        { id: 'special', name: 'Special', icon: Trophy }
    ];

    useEffect(() => {
        fetchAchievements();
    }, [userId]);

    const fetchAchievements = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get(`/api/achievements/user/${userId}`);
            const { unlocked, locked, total_points, unlocked_count, user_stats } = response.data;

            // Combine unlocked and locked
            const allAchievements = [...unlocked, ...locked];
            setAchievements(allAchievements);
            setTotalPoints(total_points);
            setUnlockedCount(unlocked_count);
            setUserStats(user_stats);
        } catch (error) {
            console.error('Error fetching achievements:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredAchievements = achievements.filter(ach =>
        selectedCategory === 'all' || ach.category === selectedCategory
    );

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{
                backgroundColor: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(10px)'
            }}
        >
            {/* Gallery Container */}
            <motion.div
                className="relative w-full max-w-4xl max-h-[90dvh] rounded-3xl overflow-hidden shadow-2xl"
                style={{ backgroundColor: PALETTE.background }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
            >
                {/* Header */}
                <div
                    className="p-6 border-b-2"
                    style={{
                        background: `linear-gradient(135deg, ${PALETTE.darkBeige} 0%, ${PALETTE.beige} 100%)`,
                        borderColor: PALETTE.warmGray
                    }}
                >
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold" style={{ color: PALETTE.warmGray }}>
                                🏆 Achievements
                            </h2>
                            <p className="text-sm mt-1" style={{ color: PALETTE.olive }}>
                                {unlockedCount} / {achievements.length} Unlocked • {totalPoints} Points
                            </p>
                        </div>
                        <motion.button {...pressProps('icon')} aria-label="關閉"
 onClick={onClose}
 className="p-2 rounded-full transition-colors hover:bg-black/10"
 >
                            <X size={24} color={PALETTE.warmGray} />
                        </motion.button>
                    </div>

                    {/* Category Filters */}
                    <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                        {categories.map(cat => {
                            const Icon = cat.icon;
                            const isSelected = selectedCategory === cat.id;
                            return (
                                <motion.button {...pressProps('icon')}
 key={cat.id}
 onClick={() => setSelectedCategory(cat.id)}
 className="flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap"
 style={{
 backgroundColor: isSelected ? PALETTE.olive : 'white',
 color: isSelected ? 'white' : PALETTE.warmGray,
 border: `2px solid ${isSelected ? PALETTE.olive : PALETTE.darkBeige}`
 }}
 >
                                    <Icon size={16} />
                                    <span className="text-sm font-semibold">{cat.name}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                {/* Achievement Grid */}
                <div
                    className="p-6 overflow-y-auto"
                    style={{ maxHeight: 'calc(90dvh - 200px)' }}
                >
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-center">
                                <div className="text-4xl mb-4 animate-bounce">🏃</div>
                                <p style={{ color: PALETTE.warmGray }}>Loading achievements...</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                            {filteredAchievements.map(achievement => (
                                <AchievementBadge
                                    key={achievement.achievement_id}
                                    achievement={achievement}
                                    unlocked={achievement.unlocked}
                                    progress={achievement.progress}
                                    onClick={() => setSelectedAchievement(achievement)}
                                />
                            ))}
                        </div>
                    )}

                    {!loading && filteredAchievements.length === 0 && (
                        <div className="text-center py-20">
                            <p style={{ color: PALETTE.warmGray }}>No achievements in this category</p>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Achievement Detail Modal */}
            <AnimatePresence>
                {selectedAchievement && (
                    <motion.div
                        className="absolute inset-0 flex items-center justify-center p-4"
                        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedAchievement(null)}
                    >
                        <motion.div
                            className="relative max-w-md w-full rounded-[18px] p-8 text-center"
                            style={{ backgroundColor: PALETTE.beige }}
                            initial={{ scale: 0.8, y: 50 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.8, y: 50 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <AchievementBadge
                                achievement={selectedAchievement}
                                unlocked={selectedAchievement.unlocked}
                                progress={selectedAchievement.progress}
                                size="large"
                                celebrationMode={selectedAchievement.unlocked}
                            />

                            <h3 className="text-2xl font-bold mt-6" style={{ color: PALETTE.warmGray }}>
                                {selectedAchievement.name}
                            </h3>
                            <p className="text-base mt-2" style={{ color: PALETTE.olive }}>
                                {selectedAchievement.description}
                            </p>

                            {selectedAchievement.unlocked ? (
                                <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(85, 107, 47, 0.1)' }}>
                                    <p className="text-sm font-semibold" style={{ color: PALETTE.olive }}>
                                        ✅ Unlocked!
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: PALETTE.warmGray }}>
                                        +{selectedAchievement.reward_points} points earned
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}>
                                    <p className="text-sm font-semibold" style={{ color: PALETTE.warmGray }}>
                                        Progress: {Math.round(selectedAchievement.progress)}%
                                    </p>
                                    <div className="w-full h-2 bg-gray-300 rounded-full mt-2">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${selectedAchievement.progress}%`,
                                                backgroundColor: PALETTE.olive
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            <motion.button {...pressProps('icon')}
 onClick={() => setSelectedAchievement(null)}
 className="mt-6 px-6 py-3 rounded-full font-semibold transition-colors"
 style={{
 backgroundColor: PALETTE.olive,
 color: 'white'
 }}
 >
                                Close
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AchievementGallery;
