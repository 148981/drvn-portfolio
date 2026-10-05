import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Edit2, Save, X, Calendar, Target, ChevronDown, ChevronUp, Activity, Zap, Ruler, Battery, Check } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴

const ProgramViewer = ({ program, onEdit, onSave, onClose }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedProgram, setEditedProgram] = useState(program);
    const [expandedWeek, setExpandedWeek] = useState(1);

    const handleSave = () => {
        if (onSave) {
            onSave(editedProgram);
        }
        setIsEditing(false);
    };

    const updateExercise = (weekIndex, workoutIndex, exerciseIndex, field, value) => {
        const newProgram = { ...editedProgram };
        if (newProgram.weeks) {
            newProgram.weeks[weekIndex].workouts[workoutIndex].exercises[exerciseIndex][field] = value;
        }
        setEditedProgram(newProgram);
    };

    const getIconForIndex = (id) => {
        switch (id) {
            case 'structural': return <Activity size={20} className="text-blue-400" />;
            case 'metabolic': return <Zap size={20} className="text-orange-400" />;
            case 'alignment': return <Ruler size={20} className="text-purple-400" />;
            case 'vitality': return <Battery size={20} className="text-green-400" />;
            default: return <Target size={20} className="text-yellow-400" />;
        }
    };

    // New Goal-Based View
    if (program.goal_indexes) {
        return (
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[18px] p-6 border border-white/10 max-h-[85dvh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-1">專屬目標任務清單</h2>
                        <p className="text-glass-muted text-sm">你的個人化執行藍圖</p>
                    </div>
                    <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg"
 >
                        <X size={16} />
                    </motion.button>
                </div>

                {/* Rationalization Summary */}
                {program.rationalization_text && (
                    <div className="mb-6 p-4 bg-glass-blue/10 border border-glass-blue/20 rounded-xl">
                        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            <Target size={20} className="text-glass-blue" /> 專屬分析
                        </h3>
                        <p className="text-glass-muted text-sm leading-relaxed whitespace-pre-line">
                            {program.rationalization_text}
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {program.goal_indexes.map((index) => (
                        <div key={index.id} className="bg-white/5 rounded-xl border border-white/10 p-5">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-3 items-center">
                                    <div className="p-2 bg-white/5 rounded-lg">
                                        {getIconForIndex(index.id)}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{index.name}</h3>
                                        <p className="text-xs text-glass-muted uppercase">{index.en_name}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-bold text-white">{index.score} 分</div>
                                </div>
                            </div>

                            {/* Tasks */}
                            <div className="space-y-2">
                                {index.tasks.map((task, tIdx) => (
                                    <div key={task.id || tIdx} className="flex items-start gap-3 bg-black/20 p-3 rounded-lg">
                                        <div className={`mt-1 w-2 h-2 rounded-full ${task.type === 'exercise' ? 'bg-blue-400' :
                                                task.type === 'habit' ? 'bg-green-400' : 'bg-purple-400'
                                            }`} />
                                        <div>
                                            <div className="text-sm font-medium text-white">{task.title}</div>
                                            <div className="text-xs text-glass-muted">{task.description}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Legacy 4-Week View
    return (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[18px] p-6 border border-white/10 max-h-[85dvh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">你的4週訓練計劃</h2>
                    <p className="text-glass-muted text-sm">共 {program.total_workouts || 0} 次訓練</p>
                </div>
                <div className="flex gap-2">
                    {!isEditing ? (
                        <>
                            <motion.button {...pressProps('row')}
 onClick={() => setIsEditing(true)}
 className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg flex items-center gap-2"
 >
                                <Edit2 size={16} />
                                編輯計劃
                            </motion.button>
                            <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg"
 >
                                <X size={16} />
                            </motion.button>
                        </>
                    ) : (
                        <>
                            <motion.button {...pressProps('row')}
 onClick={handleSave}
 className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center gap-2"
 >
                                <Save size={16} />
                                保存修改
                            </motion.button>
                            <motion.button {...pressProps('row')}
 onClick={() => {
 setIsEditing(false);
 setEditedProgram(program);
 }}
 className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg"
 >
                                取消
                            </motion.button>
                        </>
                    )}
                </div>
            </div>

            {/* Weeks */}
            <div className="space-y-4">
                {(isEditing ? editedProgram : program).weeks?.map((week, weekIndex) => (
                    <div key={weekIndex} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                        {/* Week Header */}
                        <motion.button {...pressProps('cta')}
 onClick={() => setExpandedWeek(expandedWeek === week.week ? null : week.week)}
 className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5"
 >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-glass-blue/20 rounded-xl flex items-center justify-center">
                                    <span className="text-2xl font-bold text-glass-blue">{week.week}</span>
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white">{week.focus}</h3>
                                    <p className="text-sm text-glass-muted">{week.description}</p>
                                </div>
                            </div>
                            {expandedWeek === week.week ? (
                                <ChevronUp className="text-glass-muted" />
                            ) : (
                                <ChevronDown className="text-glass-muted" />
                            )}
                        </motion.button>

                        {/* Week Content */}
                        {expandedWeek === week.week && (
                            <div className="px-6 pb-6 space-y-4">
                                {week.workouts.map((workout, workoutIndex) => (
                                    <div key={workoutIndex} className="bg-white/5 rounded-lg p-4 border border-white/5">
                                        {/* Workout Header */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <Calendar size={18} className="text-glass-beige" />
                                                <div>
                                                    <h4 className="font-semibold text-white">{workout.day_name}</h4>
                                                    <p className="text-xs text-glass-muted">{workout.type} • {workout.duration_mins}分鐘</p>
                                                </div>
                                            </div>
                                            <div className="text-sm text-glass-muted">
                                                目標: {workout.target_calories} kcal
                                            </div>
                                        </div>

                                        {/* Exercises */}
                                        <div className="space-y-2">
                                            {workout.exercises.map((exercise, exerciseIndex) => (
                                                <div key={exerciseIndex} className="flex items-center gap-3 bg-black/20 rounded-lg p-3">
                                                    <Dumbbell size={16} className="text-glass-blue" />
                                                    {isEditing ? (
                                                        <>
                                                            <input
                                                                type="text"
                                                                value={exercise.name}
                                                                onChange={(e) => updateExercise(weekIndex, workoutIndex, exerciseIndex, 'name', e.target.value)}
                                                                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={exercise.sets || exercise.duration}
                                                                onChange={(e) => updateExercise(weekIndex, workoutIndex, exerciseIndex, exercise.sets ? 'sets' : 'duration', e.target.value)}
                                                                className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm text-center"
                                                            />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="flex-1 text-white text-sm font-medium">{exercise.name}</span>
                                                            <span className="text-glass-muted text-sm">
                                                                {exercise.sets && exercise.reps && `${exercise.sets} × ${exercise.reps}`}
                                                                {exercise.duration && `${exercise.duration}分鐘`}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProgramViewer;
