import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { X, Save, Trophy, Calendar } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { toLocalDateKey } from '../utils/localDate';

const StrengthLoggerModal = ({ isOpen, onClose, exerciseName, onSave, initialData = null }) => {
    const [formData, setFormData] = useState({
        date: toLocalDateKey(new Date()),
        training_weight: '',
        pr_weight: '',
        reps: '',
        note: ''
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load initial data when modal opens or initialData changes
    React.useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    date: initialData.date,
                    training_weight: initialData.training_weight || '',
                    pr_weight: initialData.pr_weight || '',
                    reps: initialData.reps || '',
                    note: initialData.note || ''
                });
            } else {
                // Reset for new entry
                setFormData({
                    date: toLocalDateKey(new Date()),
                    training_weight: '',
                    pr_weight: '',
                    reps: '',
                    note: ''
                });
            }
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Prepare payload - convert empty strings to 0 or null as needed
        const payload = {
            exercise_name: exerciseName,
            date: formData.date,
            training_weight: parseFloat(formData.training_weight) || 0,
            pr_weight: parseFloat(formData.pr_weight) || 0,
            reps: parseInt(formData.reps) || 0,
            note: formData.note
        };

        // Pass ID if editing
        if (initialData?.record_id) {
            payload.record_id = initialData.record_id;
        }

        await onSave(payload);
        setIsSubmitting(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-md bg-[#161415] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-gradient-to-r from-white/5 to-transparent">
                    <div>
                        <h2 className="text-white font-bold text-xl flex items-center gap-2">
                            <Dumbbell className="w-5 h-5 text-glass-blue" />
                            Log Progress
                        </h2>
                        <p className="text-glass-muted text-sm mt-1">{exerciseName}</p>
                    </div>
                    <motion.button {...pressProps('icon')}
 onClick={onClose}
 className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
 >
                        <X className="w-5 h-5" />
                    </motion.button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Date */}
                    <div className="space-y-2">
                        <label className="text-xs text-glass-muted uppercase font-bold tracking-wider flex items-center gap-2">
                            <Calendar className="w-3 h-3" /> Date
                        </label>
                        <input
                            type="date"
                            required
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-glass-blue focus:outline-none transition-all font-mono"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Training Weight */}
                        <div className="space-y-2">
                            <label className="text-xs text-glass-muted uppercase font-bold tracking-wider flex items-center gap-2">
                                <Dumbbell className="w-3 h-3 text-emerald-500" /> Training (kg)
                            </label>
                            <input
                                type="number"
                                step="0.5"
                                placeholder="0.0"
                                value={formData.training_weight}
                                onChange={(e) => setFormData({ ...formData, training_weight: e.target.value })}
                                className="w-full bg-black/40 border border-emerald-500/20 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all font-mono text-lg font-bold text-center"
                            />
                        </div>

                        {/* PR Weight */}
                        <div className="space-y-2">
                            <label className="text-xs text-glass-muted uppercase font-bold tracking-wider flex items-center gap-2">
                                <Trophy className="w-3 h-3 text-blue-500" /> PR (kg)
                            </label>
                            <input
                                type="number"
                                step="0.5"
                                placeholder="0.0"
                                value={formData.pr_weight}
                                onChange={(e) => setFormData({ ...formData, pr_weight: e.target.value })}
                                className="w-full bg-black/40 border border-blue-500/20 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-all font-mono text-lg font-bold text-center"
                            />
                        </div>
                    </div>

                    {/* Reps */}
                    <div className="space-y-2">
                        <label className="text-xs text-glass-muted uppercase font-bold tracking-wider">
                            Reps (Optional)
                        </label>
                        <input
                            type="number"
                            placeholder="e.g. 8"
                            value={formData.reps}
                            onChange={(e) => setFormData({ ...formData, reps: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-glass-blue focus:outline-none transition-all"
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-4 flex gap-3">
                        <motion.button {...pressProps('cta')}
 type="button"
 onClick={onClose}
 className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 font-medium hover:bg-white/5 transition-colors"
 >
                            Cancel
                        </motion.button>
                        <motion.button {...pressProps('row')}
 type="submit"
 disabled={isSubmitting}
 className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2"
 >
                            <Save className="w-4 h-4" />
                            {isSubmitting ? 'Saving...' : 'Save Record'}
                        </motion.button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StrengthLoggerModal;
