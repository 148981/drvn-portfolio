import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEventBus } from '../contexts/EventBusContext';

const TrainingPartnerBubble = ({ userId, position = 'bottom-right' }) => {
    const [insights, setInsights] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const { subscribe, EventTypes } = useEventBus();

    useEffect(() => {
        if (userId) {
            fetchInsights();
        }
    }, [userId]);

    // Subscribe to events
    useEffect(() => {
        const unsubWorkout = subscribe(EventTypes.WORKOUT_SAVED, () => {
            // Fetch new insights after workout
            setTimeout(() => {
                fetchInsights();
                setIsVisible(true);
            }, 2000);
        });

        const unsubPR = subscribe(EventTypes.PR_ACHIEVED, (data) => {
            // Show celebration message
            const prMessage = {
                type: 'celebration',
                message: `🏆 太棒了！你突破了 ${data.prAlerts.length} 個 PR！`,
                tone: 'celebrating',
                priority: 'high'
            };
            setInsights(prev => [prMessage, ...prev]);
            setIsVisible(true);
            setCurrentIndex(0);
        });

        return () => {
            unsubWorkout();
            unsubPR();
        };
    }, [subscribe]);

    const fetchInsights = async () => {
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/analysis/insights/${userId}`);
            const data = await response.json();
            if (data.insights && data.insights.length > 0) {
                setInsights(data.insights);
                setIsVisible(true);
            }
        } catch (error) {
            console.error('Failed to fetch insights:', error);
        }
    };

    const nextInsight = () => {
        setCurrentIndex((prev) => (prev + 1) % insights.length);
    };

    const prevInsight = () => {
        setCurrentIndex((prev) => (prev - 1 + insights.length) % insights.length);
    };

    const getToneColor = (tone) => {
        switch (tone) {
            case 'celebrating':
                return 'from-amber-500/20 to-yellow-500/20 border-amber-500/50';
            case 'encouraging':
                return 'from-emerald-500/20 to-green-500/20 border-emerald-500/50';
            case 'analytical':
                return 'from-blue-500/20 to-cyan-500/20 border-blue-500/50';
            case 'gentle':
                return 'from-purple-500/20 to-pink-500/20 border-purple-500/50';
            case 'advisory':
                return 'from-orange-500/20 to-red-500/20 border-orange-500/50';
            default:
                return 'from-zinc-500/20 to-gray-500/20 border-zinc-500/50';
        }
    };

    const positionClass = () => {
        switch (position) {
            case 'bottom-right':
                return 'bottom-6 right-6';
            case 'bottom-left':
                return 'bottom-6 left-6';
            case 'top-right':
                return 'top-6 right-6';
            case 'top-left':
                return 'top-6 left-6';
            default:
                return 'bottom-6 right-6';
        }
    };

    if (!isVisible || insights.length === 0) {
        return null;
    }

    const currentInsight = insights[currentIndex];

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 20 }}
                    className={`fixed ${positionClass()} z-50`}
                >
                    {/* Collapsed State - Avatar Only */}
                    {!isExpanded && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsExpanded(true)}
                            className="relative"
                        >
                            {/* Avatar */}
                            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/50 border-2 border-white/20">
                                <Bot size={32} className="text-white" />
                            </div>
                            {/* Notification Badge */}
                            {insights.length > 1 && (
                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-[#0A0A0A]">
                                    {insights.length}
                                </div>
                            )}
                            {/* Pulse Animation */}
                            <motion.div
                                animate={{
                                    scale: [1, 1.2, 1],
                                    opacity: [0.5, 0, 0.5]
                                }}
                                transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                                className="absolute inset-0 bg-purple-500 rounded-full"
                            />
                        </motion.button>
                    )}

                    {/* Expanded State - Message Card */}
                    {isExpanded && (
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className={`bg-gradient-to-br ${getToneColor(currentInsight.tone)} backdrop-blur-xl rounded-[18px] border p-5 shadow-xl max-w-sm relative`}
                            style={{ backdropFilter: 'blur(20px)' }}
                        >
                            {/* Close Button */}
                            <motion.button {...pressProps('icon')}
 onClick={() => setIsVisible(false)}
 className="absolute top-2 right-2 p-1 hover:bg-white/10 rounded-full transition-colors"
 >
                                <X size={16} className="text-white/70" />
                            </motion.button>

                            {/* Avatar Icon */}
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Bot size={20} className="text-white" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-zinc-400 mb-1">訓練夥伴</div>
                                    <p className="text-white text-sm leading-relaxed">
                                        {currentInsight.message}
                                    </p>
                                </div>
                            </div>

                            {/* Navigation & Actions */}
                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                                <div className="flex gap-2">
                                    {insights.length > 1 && (
                                        <>
                                            <motion.button {...pressProps('icon')} aria-label="上一個"
 onClick={prevInsight}
 className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
 >
                                                <ChevronLeft size={16} className="text-white/70" />
                                            </motion.button>
                                            <motion.button {...pressProps('icon')} aria-label="下一個"
 onClick={nextInsight}
 className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
 >
                                                <ChevronRight size={16} className="text-white/70" />
                                            </motion.button>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-500">
                                        {currentIndex + 1} / {insights.length}
                                    </span>
                                    <motion.button {...pressProps('row')}
 onClick={() => setIsExpanded(false)}
 className="text-xs text-white/60 hover:text-white transition-colors"
 >
                                        收起
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default TrainingPartnerBubble;
