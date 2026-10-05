import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Play, CheckCircle2, Edit2, Save, X } from 'lucide-react';
import { getMuscleGroupOptions, getExercisesForMuscle, EXERCISE_MASTER_DB } from '../data/exerciseDatabase';

const AdaptivePlanAccordion = ({
    weeklyPlan = [],
    onStartWorkout,
    editable = false,
    onEditExercise = null,
    onEditDay = null
}) => {
    const [expandedDay, setExpandedDay] = useState(1);
    const [editingExercise, setEditingExercise] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [selectedMuscle, setSelectedMuscle] = useState('chest');

    const toggleDay = (dayNumber) => {
        setExpandedDay(expandedDay === dayNumber ? null : dayNumber);
    };

    const handleStartEdit = (dayIdx, exIdx, exercise) => {
        setEditingExercise({ dayIdx, exIdx });
        const initialMuscle = exercise.target_muscle || 'chest';
        setSelectedMuscle(initialMuscle);
        setEditForm({
            name: exercise.name || exercise.exercise,
            sets: exercise.sets,
            reps: exercise.reps,
            rest: exercise.rest || '',
            note: exercise.note || '',
            target_muscle: initialMuscle
        });
    };

    const handleSaveEdit = () => {
        if (onEditExercise && editingExercise) {
            const { dayIdx, exIdx } = editingExercise;
            onEditExercise(dayIdx, exIdx, {
                ...weeklyPlan[dayIdx].exercises[exIdx],
                name: editForm.name,
                sets: parseInt(editForm.sets),
                reps: editForm.reps,
                rest: editForm.rest,
                note: editForm.note,
                target_muscle: editForm.target_muscle
            });
        }
        setEditingExercise(null);
        setEditForm({});
    };

    const handleCancelEdit = () => {
        setEditingExercise(null);
        setEditForm({});
    };

    const handleExerciseSelect = (exerciseName) => {
        const selectedExercise = getExercisesForMuscle(selectedMuscle).find(
            e => e.name === exerciseName
        );
        if (selectedExercise) {
            setEditForm(prev => ({
                ...prev,
                name: selectedExercise.name,
                sets: selectedExercise.sets,
                reps: selectedExercise.reps,
                rest: selectedExercise.rest
            }));
        }
    };

    const handleMuscleChange = (muscle) => {
        setSelectedMuscle(muscle);
        setEditForm(prev => ({
            ...prev,
            target_muscle: muscle
        }));
    };

    const M = {
        WOOD: `
            linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(0,0,0,0.15) 100%),
            repeating-linear-gradient(to right, #5D3A2D 0px, #5D3A2D 52px, rgba(245,245,240,0.1) 52px, rgba(245,245,240,0.1) 53px),
            #4A2C22
        `,
        WOOD_GRAIN: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")',
        TITANIUM: 'linear-gradient(135deg, #707070 0%, #B8B8B8 45%, #909090 50%, #707070 100%)',
    };

    return (
        <div className="space-y-3">
            {weeklyPlan.map((day, index) => {
                const isExpanded = expandedDay === day.day;
                const isToday = day.day === 1;
                const isCompleted = day.completed || false;

                return (
                    <motion.div
                        key={day.day}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index, 6) * 0.1 }}
                        className={'rounded-[18px] overflow-hidden transition-all ' + (isExpanded ? '' : 'bg-white/[0.02]')}
                        style={{
                            background: isExpanded ? M.WOOD : 'transparent',
                            border: isExpanded ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(255, 255, 255, 0.05)',
                            boxShadow: isExpanded ? '0 12px 32px rgba(0,0,0,0.4)' : 'none'
                        }}
                    >
                        {/* Organic Grain Overlay */}
                        {isExpanded && (
                            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: M.WOOD_GRAIN, opacity: 0.15 }} />
                        )}
                        <motion.button {...pressProps('cta')}
 onClick={() => toggleDay(day.day)}
 className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.05] relative overflow-hidden"
 >
                            {/* Texture overlay for button area */}
                            {isExpanded && (
                                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
                            )}
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    {isExpanded ? <ChevronDown size={20} className="text-[#D4AF37]" /> : <ChevronRight size={20} className="text-gray-500" />}
                                    <span className="text-lg font-bold" style={{ color: '#D4AF37' }}>
                                        {day.day_name || ('Day ' + (day.day_number || day.day))}
                                    </span>
                                </div>
                                {isToday && <span className="px-2 py-0.5 bg-blue-500/20 border border-blue-400/40 rounded text-blue-300 text-xs font-medium">TODAY</span>}
                                {isCompleted && <CheckCircle2 size={18} className="text-green-400" />}
                            </div>
                            <div className="text-right">
                                <div className="text-sm text-gray-400">{(day.exercises?.length || 0) + ' exercises'}</div>
                            </div>
                        </motion.button>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-5 pb-5 pt-2 space-y-3">
                                        {day.exercises?.map((exercise, idx) => {
                                            const isEditing = editingExercise?.dayIdx === index && editingExercise?.exIdx === idx;
                                            return (
                                                <motion.div
                                                    key={idx}
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: Math.min(idx, 6) * 0.05 }}
                                                    className="p-3 rounded-xl transition-all"
                                                    style={{
                                                        border: isEditing ? '1px solid rgba(212, 175, 55, 0.6)' : '1px solid rgba(255, 255, 255, 0.05)',
                                                        background: isEditing ? 'rgba(212, 175, 55, 0.05)' : 'transparent'
                                                    }}
                                                >
                                                    {isEditing ? (
                                                        <div className="space-y-3">
                                                            <select value={selectedMuscle} onChange={(e) => handleMuscleChange(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-[#D4AF37]/40 rounded-lg text-white text-sm">
                                                                {getMuscleGroupOptions().map(opt => <option key={opt.value} value={opt.value} className="bg-[#161415]">{opt.label}</option>)}
                                                            </select>
                                                            <select value={editForm.name} onChange={(e) => handleExerciseSelect(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm">
                                                                <option value={editForm.name} className="bg-[#161415]">{editForm.name}</option>
                                                                {getExercisesForMuscle(selectedMuscle).map((ex, i) => <option key={i} value={ex.name} className="bg-[#161415]">{ex.name}</option>)}
                                                            </select>
                                                            <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" placeholder="或手動輸入動作名稱" />
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <input type="number" value={editForm.sets} onChange={(e) => setEditForm({ ...editForm, sets: e.target.value })} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" placeholder="Sets" />
                                                                <input type="text" value={editForm.reps} onChange={(e) => setEditForm({ ...editForm, reps: e.target.value })} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" placeholder="Reps" />
                                                                <input type="text" value={editForm.rest} onChange={(e) => setEditForm({ ...editForm, rest: e.target.value })} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" placeholder="Rest" />
                                                            </div>
                                                            <input type="text" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" placeholder="備註（選填）" />
                                                            <div className="flex gap-2">
                                                                <motion.button {...pressProps('cta')} onClick={handleSaveEdit} className="flex-1 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-400/40 rounded-lg text-green-300 text-sm font-medium flex items-center justify-center gap-2"><Save size={14} /> 保存</motion.button>
                                                                <motion.button {...pressProps('cta')} onClick={handleCancelEdit} className="flex-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 rounded-lg text-red-300 text-sm font-medium flex items-center justify-center gap-2"><X size={14} /> 取消</motion.button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <h4 className="text-sm font-bold text-white mb-1">{exercise.name || exercise.exercise}</h4>
                                                                    {exercise.is_ace && <span className="px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-400/40 rounded text-yellow-300 text-[11px] font-bold">ACE</span>}
                                                                </div>
                                                                <p className="text-xs text-gray-500">{exercise.sets + 'x' + exercise.reps + (exercise.rest ? '  ' + exercise.rest + ' rest' : '')}</p>
                                                                {exercise.note && <p className="text-xs text-gray-600 mt-1">{exercise.note}</p>}
                                                            </div>
                                                            {editable && <motion.button {...pressProps('row')} onClick={() => handleStartEdit(index, idx, exercise)} className="ml-2 p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} className="text-blue-400" /></motion.button>}
                                                        </div>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                        {!editable && onStartWorkout && (
                                            <motion.button 
                                                onClick={() => onStartWorkout(day)} 
                                                className="w-full mt-4 px-4 py-3 rounded-xl font-bold text-[#050505] flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all" 
                                                style={{ background: M.TITANIUM }}
                                                whileHover={{ scale: 1.02 }} 
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                <Play size={18} />開始訓練
                                            </motion.button>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                );
            })}
        </div>
    );
};

export default AdaptivePlanAccordion;
