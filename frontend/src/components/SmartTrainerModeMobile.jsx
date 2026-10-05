import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { Clock, Zap, Target, Play, RefreshCw, ChevronRight, BatteryCharging, Sparkles, Edit3, Plus, X, Trash2, ArrowLeft, Search } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import apiClient from '../api/client';
import MobileNavigation from './MobileNavigation';
import { uStorage } from '../utils/userStorage';
import { getUserId } from '../utils/auth';

const SmartTrainerModeMobile = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    // 'initial' | 'plan_view'
    const [viewMode, setViewMode] = useState('initial');
    const [plan, setPlan] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [showAddExercise, setShowAddExercise] = useState(false); // Modal for adding exercise
    const [customSearch, setCustomSearch] = useState(''); // Custom exercise search/input

    // Form States
    const [time, setTime] = useState(40);
    const [selectedParts, setSelectedParts] = useState([]); // Multi-select body parts
    const [selectedFilterPart, setSelectedFilterPart] = useState('all'); // For Add Exercise Modal

    const bodyParts = [
        { id: 'chest', label: '胸部', labelEn: 'Chest' },
        { id: 'back', label: '背部', labelEn: 'Back' },
        { id: 'legs', label: '腿部', labelEn: 'Legs' },
        { id: 'shoulders', label: '肩部', labelEn: 'Shoulders' },
        { id: 'arms', label: '手臂', labelEn: 'Arms' },
        { id: 'core', label: '核心', labelEn: 'Core' }
    ];

    const availableExercises = [
        { name: 'Push Ups', part: 'chest' },
        { name: 'Pull Ups', part: 'back' },
        { name: 'Squats', part: 'legs' },
        { name: 'Lunges', part: 'legs' },
        { name: 'Plank', part: 'core' },
        { name: 'Dumbbell Press', part: 'shoulders' },
        { name: 'Bicep Curls', part: 'arms' },
        { name: 'Tricep Dips', part: 'arms' },
        { name: 'Burpees', part: 'full' },
        { name: 'Mountain Climbers', part: 'core' }
    ];

    const toggleBodyPart = (partId) => {
        setSelectedParts(prev =>
            prev.includes(partId)
                ? prev.filter(p => p !== partId)
                : [...prev, partId]
        );
    };

    const handleGenerateAI = async () => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('time_mins', time);
            formData.append('energy_level', 'medium');
            formData.append('target_part', selectedParts.length > 0 ? selectedParts.join(',') : 'full_body');
            formData.append('fitness_level', 'intermediate');

            const response = await apiClient.post('/api/trainer/generate', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data) {
                setPlan(response.data);
                setViewMode('plan_view');
                setIsEditing(false);
            }
        } catch (error) {
            console.error("Failed to generate workout", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCustomPlan = () => {
        const newPlan = {
            title: 'Custom Workout',
            duration: time + ' min',
            calories_est: 0,
            exercises: []
        };
        setPlan(newPlan);
        setViewMode('plan_view');
        setIsEditing(true); // Default to edit mode for custom plans
    };

    const reset = () => {
        setPlan(null);
        setViewMode('initial');
        setIsEditing(false);
    };

    // Plan Editing Functions
    const removeExercise = (index) => {
        if (!plan) return;
        const updatedExercises = plan.exercises.filter((_, i) => i !== index);
        setPlan({ ...plan, exercises: updatedExercises });
    };

    const addExerciseToPlan = (exerciseName) => {
        if (!plan) return;
        const newExercise = {
            name: exerciseName,
            sets: 3,
            reps: '10-12',
            rest: '60s'
        };
        setPlan({ ...plan, exercises: [...plan.exercises, newExercise] });
        setShowAddExercise(false);
    };

    const updateExerciseParam = (index, field, value) => {
        if (!plan) return;
        const updatedExercises = [...plan.exercises];
        updatedExercises[index] = { ...updatedExercises[index], [field]: value };
        setPlan({ ...plan, exercises: updatedExercises });
    };

    return (
        <div className="min-h-[100dvh] pb-24 bg-[#09090B] text-white font-sans selection:bg-[#FF7E6B] selection:text-black" style={{
            maxWidth: '430px',
            margin: '0 auto',
        }}>

            {/* Header */}
            <div className="pt-8 pb-6 px-6 flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight mb-1">Smart<br />Trainer</h1>
                </div>
                {viewMode === 'initial' && (
                    <div className="w-12 h-12 bg-[#27272A] rounded-full flex items-center justify-center border border-[#3F3F46]">
                        <Sparkles size={20} className="text-[#FF7E6B]" />
                    </div>
                )}
                {viewMode === 'plan_view' && (
                    <motion.button {...pressProps('icon')} aria-label="返回" onClick={reset} className="w-12 h-12 bg-[#27272A] hover:bg-[#3F3F46] rounded-full flex items-center justify-center transition-colors">
                        <ArrowLeft size={20} />
                    </motion.button>
                )}
            </div>

            {/* INITIAL VIEW DASHBOARD */}
            {viewMode === 'initial' && (
                <div className="px-5 space-y-4 animate-fade-in">

                    {/* Navigation Pills */}
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <motion.button {...pressProps('icon')} className="px-6 py-2 bg-white text-black rounded-full font-bold text-sm whitespace-nowrap">AI Generate</motion.button>
                        <motion.button {...pressProps('icon')}
 onClick={handleCustomPlan}
 className="px-6 py-2 bg-[#27272A] text-[#A1A1AA] rounded-full font-bold text-sm border border-[#3F3F46] whitespace-nowrap hover:bg-[#3F3F46] transition-colors">
                            Custom Build
                        </motion.button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {/* CARD 1: Body Part Selection (Orange) */}
                        <div className="bg-[#FF7E6B] rounded-[28px] p-6 text-[#1A1A1A] shadow-lg shadow-orange-900/20 relative overflow-hidden group min-h-[300px] flex flex-col justify-between">
                            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all"></div>

                            <div>
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-2xl font-black leading-none">Focus<br />Area</h3>
                                    <div className="w-8 h-8 bg-black/10 rounded-full flex items-center justify-center">
                                        <Target size={16} className="text-black/70" />
                                    </div>
                                </div>
                                <p className="text-sm font-medium opacity-70 mb-4">Select target muscles</p>

                                <div className="flex flex-wrap gap-2">
                                    {bodyParts.map((part) => (
                                        <motion.button {...pressProps('icon')}
 key={part.id}
 onClick={() => toggleBodyPart(part.id)}
 className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 border-transparent
 ${selectedParts.includes(part.id)
 ? 'bg-[#1A1A1A] text-white shadow-md'
 : 'bg-white/30 text-[#1A1A1A] hover:bg-white/50 border-black/5'
 }`}
 >
                                            {part.labelEn}
                                        </motion.button>
                                    ))}
                                </div>
                                {selectedParts.length === 0 && (
                                    <p className="mt-4 text-xs font-bold opacity-50">Default: Full Body Workout</p>
                                )}
                            </div>

                            <div className="mt-4">
                                <div className="w-full h-1 bg-black/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-black/30 w-[60%]"></div>
                                </div>
                            </div>
                        </div>

                        {/* CARD 2: Duration (Yellow) */}
                        <div className="bg-[#FFE66D] rounded-[28px] p-6 text-[#1A1A1A] shadow-lg shadow-yellow-900/20 relative overflow-hidden min-h-[180px] flex flex-col justify-between">
                            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-white/20 rounded-full blur-2xl"></div>

                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-2xl font-black mb-1">Time</h3>
                                    <p className="font-bold opacity-60 text-sm">Session Duration</p>
                                </div>
                                <div className="text-3xl font-black bg-white/20 px-3 py-1 rounded-xl">
                                    {time}<span className="text-sm ml-1 font-bold opacity-60">MIN</span>
                                </div>
                            </div>

                            <input
                                type="range"
                                min="10" max="90" step="10"
                                value={time}
                                onChange={(e) => setTime(Number(e.target.value))}
                                className="w-full h-3 bg-black/10 rounded-full appearance-none cursor-pointer accent-[#1A1A1A] mt-4"
                            />
                        </div>
                    </div>

                    {/* GENERATE BUTTON */}
                    <motion.button {...pressProps('row')}
 onClick={handleGenerateAI}
 disabled={loading}
 className="w-full py-5 bg-white text-black rounded-[24px] font-black text-lg shadow-xl shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:scale-[1.02] mt-4"
 >
                        {loading ? <RefreshCw className="animate-spin" /> : <Play fill="currentColor" size={24} />}
                        GENERATE PLAN
                    </motion.button>
                </div>
            )}

            {/* PLAN VIEW (Generated or Custom) */}
            {viewMode === 'plan_view' && plan && (
                <div className="px-5 space-y-4 animate-fade-in pb-32">

                    {/* Controls Header */}
                    <div className="flex justify-between items-end mb-2">
                        <h2 className="text-2xl font-bold">{plan.title}</h2>
                        <motion.button {...pressProps('icon')}
 onClick={() => setIsEditing(!isEditing)}
 className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2
 ${isEditing
 ? 'bg-[#FF7E6B] text-black'
 : 'bg-[#27272A] text-white border border-[#3F3F46]'}`}
 >
                            <Edit3 size={14} />
                            {isEditing ? 'Done Editing' : 'Edit Plan'}
                        </motion.button>
                    </div>

                    {/* Meta Stats */}
                    <div className="flex gap-4 mb-4">
                        <div className="px-4 py-3 bg-[#1E1E20] rounded-[18px] flex-1 border border-[#3F3F46]">
                            <p className="text-xs text-gray-400 mb-1 font-bold uppercase">Duration</p>
                            <p className="text-lg font-bold text-white flex items-center gap-2">
                                <Clock size={16} className="text-[#FF7E6B]" /> {plan.duration}
                            </p>
                        </div>
                        <div className="px-4 py-3 bg-[#1E1E20] rounded-[18px] flex-1 border border-[#3F3F46]">
                            <p className="text-xs text-gray-400 mb-1 font-bold uppercase">Burn</p>
                            <p className="text-lg font-bold text-white flex items-center gap-2">
                                <Zap size={16} className="text-[#FFE66D]" /> {plan.calories_est || 'Active'}
                            </p>
                        </div>
                    </div>

                    {/* EXERCISE LIST */}
                    <div className="space-y-3">
                        {plan.exercises.length === 0 && (
                            <div className="p-8 text-center bg-[#1E1E20] rounded-3xl border border-dashed border-[#52525B]">
                                <p className="text-gray-400 font-medium">No exercises yet.</p>
                                <p className="text-xs text-gray-600 mt-1">Add some to build your workout.</p>
                            </div>
                        )}

                        {plan.exercises.map((ex, idx) => (
                            <div key={idx} className="bg-white rounded-[18px] p-4 text-black relative group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-[#F4F4F5] rounded-xl flex items-center justify-center font-black text-lg text-[#D4D4D8]">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-lg leading-tight">{ex.name}</h4>

                                        {!isEditing ? (
                                            <div className="flex gap-3 mt-1 text-sm font-medium opacity-60">
                                                <span>{ex.sets} Sets</span>
                                                <span>×</span>
                                                <span>{ex.reps}</span>
                                                <span className="ml-auto text-xs bg-black/5 px-2 py-0.5 rounded">Rest: {ex.rest}</span>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 mt-2">
                                                <div className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                                                    <span className="text-[9px] uppercase font-bold text-gray-400">Sets</span>
                                                    <input
                                                        className="w-8 bg-transparent font-bold text-center border-b border-gray-300 focus:outline-none focus:border-black"
                                                        value={ex.sets}
                                                        onChange={(e) => updateExerciseParam(idx, 'sets', e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                                                    <span className="text-[9px] uppercase font-bold text-gray-400">Reps</span>
                                                    <input
                                                        className="w-12 bg-transparent font-bold text-center border-b border-gray-300 focus:outline-none focus:border-black"
                                                        value={ex.reps}
                                                        onChange={(e) => updateExerciseParam(idx, 'reps', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {isEditing && (
                                        <motion.button {...pressProps('icon')}
 onClick={() => removeExercise(idx)}
 className="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition-colors"
 >
                                            <Trash2 size={16} />
                                        </motion.button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isEditing && (
                            <motion.button {...pressProps('cta')}
 onClick={() => setShowAddExercise(true)}
 className="w-full py-4 rounded-[18px] border-2 border-dashed border-[#52525B] text-[#71717A] font-bold hover:bg-[#27272A] hover:text-white hover:border-transparent flex items-center justify-center gap-2"
 >
                                <Plus size={20} />
                                Add Exercise
                            </motion.button>
                        )}
                    </div>

                    {/* START BUTTON (Fixed Bottom) */}
                    {!isEditing && (
                        <div className="fixed bottom-[130px] left-0 right-0 px-5 pointer-events-none z-[100]" style={{ maxWidth: '430px', margin: '0 auto' }}>
                            <motion.button {...pressProps('row')}
 onClick={() => {
 uStorage(getUserId()).set('currentWorkoutPlan', plan);
 navigate('/training-session-mobile', { state: { day: plan } });
 }}
 className="w-full pointer-events-auto py-5 bg-[#FF7E6B] text-[#1A1A1A] rounded-[24px] font-black text-xl shadow-2xl shadow-orange-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] border-2 border-white/10"
 >
                                <Play fill="currentColor" size={24} />
                                START WORKOUT
                            </motion.button>
                        </div>
                    )}
                </div>
            )}

            {/* ADD EXERCISE MODAL */}
            {showAddExercise && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-[#18181B] w-full max-w-[400px] rounded-3xl overflow-hidden shadow-2xl animate-slide-up border border-[#27272A] max-h-[80dvh] flex flex-col">
                        <div className="p-4 border-b border-[#27272A] flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-lg text-white">Select Exercise</h3>
                            <motion.button {...pressProps('icon')} onClick={() => setShowAddExercise(false)} className="p-2 bg-[#27272A] rounded-full text-gray-400 hover:text-white">
                                <X size={18} />
                            </motion.button>
                        </div>

                        {/* Body Part Filter Tabs */}
                        <div className="px-4 pt-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide shrink-0">
                            <motion.button {...pressProps('icon')}
 onClick={() => setSelectedFilterPart('all')}
 className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${selectedFilterPart === 'all' ? 'bg-[#FF7E6B] text-black' : 'bg-[#27272A] text-gray-400'
 }`}
 >
                                All
                            </motion.button>
                            {bodyParts.map(part => (
                                <motion.button {...pressProps('icon')}
 key={part.id}
 onClick={() => setSelectedFilterPart(part.id)}
 className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${selectedFilterPart === part.id ? 'bg-[#FF7E6B] text-black' : 'bg-[#27272A] text-gray-400'
 }`}
 >
                                    {part.labelEn}
                                </motion.button>
                            ))}
                        </div>

                        {/* Custom Search/Add Input */}
                        <div className="p-4 border-b border-[#27272A] shrink-0">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <input
                                    type="text"
                                    value={customSearch}
                                    onChange={(e) => setCustomSearch(e.target.value)}
                                    placeholder="Search or add custom exercise..."
                                    className="w-full bg-[#27272A] text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF7E6B] placeholder-gray-600 font-medium"
                                />
                            </div>

                            {customSearch && !availableExercises.some(e => e.name.toLowerCase() === customSearch.toLowerCase()) && (
                                <motion.button {...pressProps('cta')}
 onClick={() => {
 addExerciseToPlan(customSearch);
 setCustomSearch('');
 }}
 className="w-full mt-3 py-3 bg-[#FF7E6B]/10 text-[#FF7E6B] rounded-xl font-bold hover:bg-[#FF7E6B]/20 flex items-center justify-center gap-2"
 >
                                    <Plus size={16} />
                                    Add "{customSearch}"
                                </motion.button>
                            )}
                        </div>

                        <div className="p-2 overflow-y-auto flex-1">
                            {availableExercises
                                .filter(ex => {
                                    const matchesSearch = ex.name.toLowerCase().includes(customSearch.toLowerCase());
                                    const matchesPart = selectedFilterPart === 'all' || ex.part === selectedFilterPart || (selectedFilterPart === 'core' && ex.part === 'full');
                                    return matchesSearch && matchesPart;
                                })
                                .map((ex, i) => (
                                    <motion.button {...pressProps('cta')}
 key={i}
 onClick={() => addExerciseToPlan(ex.name)}
 className="w-full p-4 flex items-center justify-between hover:bg-[#27272A] rounded-xl group transition-colors text-left"
 >
                                        <div>
                                            <p className="font-bold text-white">{ex.name}</p>
                                            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{ex.part === 'full' ? 'Full Body' : ex.part}</p>
                                        </div>
                                        <div className="w-8 h-8 rounded-full border border-[#3F3F46] flex items-center justify-center group-hover:bg-[#FF7E6B] group-hover:border-[#FF7E6B] group-hover:text-black transition-all">
                                            <Plus size={16} />
                                        </div>
                                    </motion.button>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Navigation */}
            <MobileNavigation />
        </div>
    );
};

export default SmartTrainerModeMobile;
