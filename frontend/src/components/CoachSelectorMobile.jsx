import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Trophy, Target, ArrowRight } from 'lucide-react';

const CoachSelectorMobile = ({ onSelect, onSkip, userProfile, onBack }) => {
    const [coaches, setCoaches] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [exerciseType, setExerciseType] = useState('lat_pulldown');

    useEffect(() => {
        fetchCoaches();
    }, []);

    const fetchCoaches = async () => {
        try {
            const endpoint = userProfile?.user_id
                ? `http://${window.location.hostname}:8000/api/coaches/match/${userProfile.user_id}`
                : `http://${window.location.hostname}:8000/api/coaches`;

            const response = await fetch(endpoint);
            const data = await response.json();
            setCoaches(data.coaches || []);
        } catch (error) {
            console.error('Error fetching coaches:', error);
            // Mock data fallback if API fails
            setCoaches([
                { coach_id: 'coach_alex', name: 'Alex Johnson', difficulty: 'beginner', description: 'Focus on basics and form.', match_score: 95 },
                { coach_id: 'coach_sara', name: 'Sara Miller', difficulty: 'intermediate', description: 'Balanced approach to fitness.', match_score: 88 },
                { coach_id: 'coach_mike', name: 'Mike Tyson', difficulty: 'advanced', description: 'High intensity training.', match_score: 75 },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (coach) => {
        if (onSelect) onSelect({ ...coach, exerciseType: exerciseType });
    };

    const nextCoach = () => {
        setCurrentIndex((prev) => (prev + 1) % coaches.length);
    };

    const prevCoach = () => {
        setCurrentIndex((prev) => (prev - 1 + coaches.length) % coaches.length);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[100dvh] bg-[#3A342F] text-[#C9B7A5]">
                Loading coaches...
            </div>
        );
    }

    const currentCoach = coaches[currentIndex];
    const getCoachGender = (coach) => {
        if (!coach) return 'male';
        const id = coach.coach_id?.toLowerCase() || '';
        const name = coach.name?.toLowerCase() || '';
        return (id.includes('sara') || name.includes('sara')) ? 'female' : 'male';
    };

    const coachGender = getCoachGender(currentCoach);
    const isFemale = coachGender === 'female';

    const colors = isFemale ? {
        gradient: 'linear-gradient(135deg, #FF9F76 0%, #FFD66B 100%)', // Orange -> Yellow
        primary: '#FF9F76',
        textPrimary: '#161415',
        textSecondary: '#4A4A4A',
    } : {
        gradient: 'linear-gradient(135deg, #B5D8F6 0%, #E0F2FE 100%)', // Blue -> Light Blue
        primary: '#B5D8F6',
        textPrimary: '#161415',
        textSecondary: '#4A4A4A',
    };

    return (
        <div className="min-h-[100dvh] relative overflow-hidden flex flex-col font-sans" style={{ backgroundColor: '#09090B', maxWidth: '430px', margin: '0 auto' }}>

            {/* Header */}
            <div className="pt-12 px-6 flex justify-between items-center z-10 mb-4">
                <motion.button {...pressProps('row')} aria-label="上一個" onClick={onBack} className="text-white p-2 -ml-2">
                    <ChevronLeft size={24} />
                </motion.button>
                <div className="text-white font-bold text-lg">Select Coach</div>
                <div className="w-8"></div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col justify-center px-6 relative z-10 pb-8">
                {/* Exercise Selector */}
                <div className="mb-6 flex justify-center">
                    <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
                        <Target size={14} className="text-white/70" />
                        <select
                            value={exerciseType}
                            onChange={(e) => setExerciseType(e.target.value)}
                            className="bg-transparent border-none text-white text-sm font-bold focus:outline-none cursor-pointer appearance-none"
                        >
                            <option value="lat_pulldown" className="bg-[#09090B]">Lat Pulldown</option>
                            <option value="squat" className="bg-[#09090B]" disabled>Squat (Coming Soon)</option>
                        </select>
                    </div>
                </div>

                <div className="relative">
                    {/* Navigation Buttons */}
                    <motion.button {...pressProps('icon')} aria-label="上一個"
 onClick={prevCoach}
 className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2 z-20 w-12 h-12 rounded-full bg-white text-black hover:scale-110 flex items-center justify-center shadow-xl"
 >
                        <ChevronLeft size={24} />
                    </motion.button>

                    <motion.button {...pressProps('icon')} aria-label="下一個"
 onClick={nextCoach}
 className="absolute right-0 top-1/2 -translate-y-1/2 -mr-2 z-20 w-12 h-12 rounded-full bg-white text-black hover:scale-110 flex items-center justify-center shadow-xl"
 >
                        <ChevronRight size={24} />
                    </motion.button>

                    <AnimatePresence mode="wait">
                        {currentCoach && (
                            <motion.div
                                key={currentIndex}
                                initial={{ opacity: 0, x: 50, scale: 0.95 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -50, scale: 0.95 }}
                                transition={{ duration: 0.4, type: "spring", bounce: 0.3 }}
                                className="relative px-2"
                            >
                                {/* Coach Card */}
                                <div className="relative rounded-[36px] overflow-hidden shadow-2xl aspect-[3/4] mb-8 group" style={{
                                    background: colors.gradient,
                                }}>
                                    {/* Coach Emoji/Image Placeholder */}
                                    <div className="absolute inset-0 flex items-center justify-center text-9xl scale-125 group-hover:scale-135 transition-transform duration-700">
                                        {currentCoach.coach_id.includes('alex') ? '👨' : currentCoach.coach_id.includes('sara') ? '👩' : '🧑'}
                                    </div>

                                    {/* Info Overlay */}
                                    <div className="absolute bottom-0 left-0 right-0 p-8 pt-24 bg-gradient-to-t from-black/20 to-transparent">
                                        <h2 className="text-4xl font-black mb-1" style={{ color: colors.textPrimary }}>{currentCoach.name}</h2>
                                        <div className="flex items-center gap-3 mb-3 font-bold opacity-70" style={{ color: colors.textSecondary }}>
                                            <span className="capitalize px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs">{currentCoach.difficulty}</span>
                                            <span className="text-xs">{exerciseType === 'lat_pulldown' ? 'Lat Pulldown' : 'Exercise'}</span>
                                        </div>

                                        {currentCoach.match_score && (
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-white text-black shadow-lg">
                                                <Trophy size={12} className="text-yellow-500" />
                                                {currentCoach.match_score}% MATCH
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="text-center px-4 mb-8">
                                    <p className="text-white/60 text-sm font-medium leading-relaxed line-clamp-3">
                                        {currentCoach.description}
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Controls */}
            <div className="pb-10 px-6 z-10">
                {/* Navigation Dots */}
                <div className="flex justify-center gap-2 mb-6">
                    {coaches.map((_, index) => (
                        <div
                            key={index}
                            onClick={() => setCurrentIndex(index)}
                            className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${index === currentIndex ? 'w-8 bg-white' : 'w-2 bg-white/20'}`}
                        />
                    ))}
                </div>

                {/* Primary Action */}
                <motion.button {...pressProps('pill')}
 onClick={() => handleSelect(currentCoach)}
 className="w-full py-5 rounded-[24px] font-black text-lg shadow-xl flex items-center justify-center gap-2 group"
 style={{
 backgroundColor: '#FFFFFF',
 color: '#000000',
 }}
 >
                    Select Trainer
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </motion.button>

                <motion.button {...pressProps('cta')}
 onClick={onSkip}
 className="w-full py-4 mt-2 text-xs font-bold text-white/40 hover:text-white transition-colors uppercase tracking-widest"
 >
                    Skip for now
                </motion.button>
            </div>
        </div>
    );
};

export default CoachSelectorMobile;
