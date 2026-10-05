import React, { useEffect, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { Calendar, Flame, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '../api/client';

const ActivityCalendar = ({ userId, isOpen, onClose }) => {
    const [heatmapData, setHeatmapData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && userId) {
            fetchCalendarData();
        }
    }, [isOpen, userId]);

    const fetchCalendarData = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get(`/api/activity/calendar/${userId}?days=30`);
            setHeatmapData(response.data.heatmap || []);
        } catch (error) {
            console.error('Failed to fetch calendar data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getIntensityColor = (intensity) => {
        const colors = {
            0: 'bg-white/5',
            1: 'bg-green-900/40',
            2: 'bg-green-700/60',
            3: 'bg-green-500/80',
            4: 'bg-green-400'
        };
        return colors[intensity] || colors[0];
    };

    // Group data by week
    const groupByWeek = (data) => {
        const weeks = [];
        for (let i = 0; i < data.length; i += 7) {
            weeks.push(data.slice(i, i + 7));
        }
        return weeks;
    };

    const weeks = groupByWeek(heatmapData);
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="bg-[#1A1D1F] border border-white/10 rounded-3xl p-6 max-w-2xl w-full shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Calendar className="text-glass-beige" size={28} />
                                <div>
                                    <h3 className="text-xl font-bold text-white">Activity Calendar</h3>
                                    <p className="text-sm text-white/60">Your 30-day workout history</p>
                                </div>
                            </div>
                            <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 className="text-white/60 hover:text-white transition-colors"
 >
                                <X size={24} />
                            </motion.button>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="animate-spin rounded-full h-12 w-12 border-4 border-glass-beige border-t-transparent"></div>
                            </div>
                        ) : (
                            <>
                                {/* Day Labels */}
                                <div className="flex gap-1 mb-2 ml-12">
                                    {daysOfWeek.map((day, idx) => (
                                        <div
                                            key={idx}
                                            className="w-8 text-center text-[11px] text-white/40 font-medium"
                                        >
                                            {day[0]}
                                        </div>
                                    ))}
                                </div>

                                {/* Calendar Grid */}
                                <div className="space-y-1">
                                    {weeks.map((week, weekIdx) => (
                                        <div key={weekIdx} className="flex items-center gap-1">
                                            <span className="w-10 text-xs text-white/40 text-right pr-2">
                                                W{weekIdx + 1}
                                            </span>
                                            {week.map((day, dayIdx) => (
                                                <div
                                                    key={dayIdx}
                                                    className="group relative"
                                                >
                                                    <div
                                                        className={`w-8 h-8 rounded-md ${getIntensityColor(day.intensity)} 
                                                        border border-white/10 hover:border-glass-beige/50 
                                                        transition-all duration-200 cursor-pointer
                                                        hover:scale-110 hover:shadow-lg`}
                                                    />

                                                    {/* Tooltip */}
                                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                                                        opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                                                        <div className="bg-[#323736] text-white text-xs rounded-lg px-3 py-2 
                                                            whitespace-nowrap shadow-xl border border-white/10">
                                                            <div className="font-semibold">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                                            <div className="text-white/60">
                                                                {day.count > 0 ? (
                                                                    <>
                                                                        {day.count} workout{day.count > 1 ? 's' : ''}
                                                                        {day.duration > 0 && ` • ${day.duration} min`}
                                                                    </>
                                                                ) : (
                                                                    'No activity'
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>

                                {/* Legend */}
                                <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                                    <div className="flex items-center gap-2 text-xs text-white/60">
                                        <span>Less</span>
                                        <div className="flex gap-1">
                                            {[0, 1, 2, 3, 4].map((intensity) => (
                                                <div
                                                    key={intensity}
                                                    className={`w-4 h-4 rounded ${getIntensityColor(intensity)} border border-white/10`}
                                                />
                                            ))}
                                        </div>
                                        <span>More</span>
                                    </div>

                                    <div className="text-xs text-white/60">
                                        Total: <span className="text-white font-semibold">
                                            {heatmapData.filter(d => d.count > 0).length}
                                        </span> active days
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ActivityCalendar;
