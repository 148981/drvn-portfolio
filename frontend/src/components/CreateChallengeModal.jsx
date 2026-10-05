import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Target, Clock, Users, Trophy } from 'lucide-react';
import { toast } from '../utils/toast';

import apiClient from '../api/client';

const COLORS = {
    primary: '#161415',
    secondary: '#5A5A5A',
    accent: '#E4DED2',
    highlight: '#F95C4B',
    sand: '#F6F4F1'
};

const CreateChallengeModal = ({ isOpen, onClose, userId, onChallengeCreated }) => {
    const [step, setStep] = useState(1); // 1: Type, 2: Details, 3: Badge
    const [challengeData, setChallengeData] = useState({
        type: 'personal',
        name: '',
        description: '',
        goal_type: 'distance',
        goal_value: 50,
        time_window: 7,
        badge_icon: '🏆',
        badge_color: 'gold',
        invited_users: []
    });

    const challengeTypes = [
        { id: 'personal', label: 'Personal', icon: '👤', desc: 'Solo challenge for yourself' },
        { id: 'friend', label: 'Friends', icon: '👥', desc: 'Invite friends to join' },
        { id: 'club', label: 'Club', icon: '🏢', desc: 'For your club members' }
    ];

    const goalTypes = [
        { id: 'distance', label: 'Distance', unit: 'km', icon: '🏃', desc: 'Total distance covered' },
        { id: 'duration', label: 'Duration', unit: 'min', icon: '⏱️', desc: 'Total time spent' },
        { id: 'frequency', label: 'Frequency', unit: 'times', icon: '🔄', desc: 'Number of activities' },
        { id: 'streak', label: 'Streak', unit: 'days', icon: '🔥', desc: 'Consecutive days' }
    ];

    const badgeIcons = ['🏆', '🎯', '⭐', '🏅', '👑', '💪', '🔥', '⚡', '💫', '🌟'];
    const badgeColors = [
        { id: 'gold', label: 'Gold', gradient: 'from-[#D4A853] to-[#FFA500]' },
        { id: 'silver', label: 'Silver', gradient: 'from-[#C0C0C0] to-[#808080]' },
        { id: 'bronze', label: 'Bronze', gradient: 'from-[#CD7F32] to-[#8B4513]' },
        { id: 'platinum', label: 'Platinum', gradient: 'from-[#E5E4E2] to-[#989898]' },
        { id: 'emerald', label: 'Emerald', gradient: 'from-[#50C878] to-[#009874]' }
    ];

    const handleCreate = async () => {
        try {
            const response = await apiClient.post('/api/challenges/create', {
                user_id: userId,
                ...challengeData
            });

            if (response.data.success) {
                onChallengeCreated?.(response.data.challenge);
                onClose();
                // Reset form
                setChallengeData({
                    type: 'personal',
                    name: '',
                    description: '',
                    goal_type: 'distance',
                    goal_value: 50,
                    time_window: 7,
                    badge_icon: '🏆',
                    badge_color: 'gold',
                    invited_users: []
                });
                setStep(1);
            }
        } catch (error) {
            console.error('Failed to create challenge:', error);
            toast.error('建立挑戰失敗，請稍後再試');
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="fixed bottom-0 left-0 right-0 z-[70] sm:inset-0 sm:flex sm:items-center sm:justify-center p-4 pointer-events-none"
                >
                    <div className="bg-[#FDFBF7] w-full max-w-2xl rounded-t-[28px] sm:rounded-[28px] p-6 shadow-2xl pointer-events-auto border border-white/50 max-h-[90dvh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-2xl font-bold text-[#4A3F35] font-serif-elegant">Create Challenge</h3>
                                <p className="text-sm text-[#8B7F72] mt-1">Step {step} of 3</p>
                            </div>
                            <motion.button {...pressProps('icon')} aria-label="新增"
 onClick={onClose}
 className="p-2 rounded-full hover:bg-black/5 transition-colors"
 >
                                <Plus size={24} className="rotate-45 text-[#8B7F72]" />
                            </motion.button>
                        </div>

                        {/* Step 1: Type Selection */}
                        {step === 1 && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-[#4A3F35] mb-3">Challenge Type</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {challengeTypes.map(type => (
                                            <motion.button {...pressProps('row')}
 key={type.id}
 onClick={() => setChallengeData({ ...challengeData, type: type.id })}
 className={`p-4 rounded-xl border-2 ${challengeData.type === type.id
 ? 'border-[#9BAF9E] bg-[#9BAF9E]/10'
 : 'border-[#E8DCC8] hover:border-[#D4C4B0]'
 }`}
 >
                                                <div className="text-3xl mb-2">{type.icon}</div>
                                                <div className="text-sm font-bold text-[#4A3F35]">{type.label}</div>
                                                <div className="text-xs text-[#8B7F72] mt-1">{type.desc}</div>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                <motion.button {...pressProps('pill')}
 onClick={() => setStep(2)}
 className="w-full py-4 rounded-xl text-white font-bold shadow-lg "
 style={{ background: `linear-gradient(135deg, ${COLORS.highlight} 0%, #D94030 100%)` }}
 >
                                    Continue
                                </motion.button>
                            </div>
                        )}

                        {/* Step 2: Details */}
                        {step === 2 && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-[#4A3F35] mb-2">Challenge Name</label>
                                    <input
                                        type="text"
                                        value={challengeData.name}
                                        onChange={(e) => setChallengeData({ ...challengeData, name: e.target.value })}
                                        placeholder="e.g., 50K in 7 Days"
                                        className="w-full p-4 rounded-xl bg-[#F5F2EE] border-2 border-transparent focus:border-[#9BAF9E] focus:bg-white text-[#4A3F35] outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-[#4A3F35] mb-2">Description</label>
                                    <textarea
                                        value={challengeData.description}
                                        onChange={(e) => setChallengeData({ ...challengeData, description: e.target.value })}
                                        placeholder="Describe your challenge..."
                                        className="w-full h-24 p-4 rounded-xl bg-[#F5F2EE] border-2 border-transparent focus:border-[#9BAF9E] focus:bg-white text-[#4A3F35] outline-none resize-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-[#4A3F35] mb-3">Goal Type</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {goalTypes.map(goal => (
                                            <motion.button {...pressProps('row')}
 key={goal.id}
 onClick={() => setChallengeData({ ...challengeData, goal_type: goal.id })}
 className={`p-3 rounded-xl border-2 text-left ${challengeData.goal_type === goal.id
 ? 'border-[#9BAF9E] bg-[#9BAF9E]/10'
 : 'border-[#E8DCC8] hover:border-[#D4C4B0]'
 }`}
 >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xl">{goal.icon}</span>
                                                    <span className="text-sm font-bold text-[#4A3F35]">{goal.label}</span>
                                                </div>
                                                <div className="text-xs text-[#8B7F72]">{goal.desc}</div>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-[#4A3F35] mb-2">Target Value</label>
                                        <input
                                            type="number"
                                            value={challengeData.goal_value}
                                            onChange={(e) => setChallengeData({ ...challengeData, goal_value: parseFloat(e.target.value) })}
                                            className="w-full p-4 rounded-xl bg-[#F5F2EE] border-2 border-transparent focus:border-[#9BAF9E] focus:bg-white text-[#4A3F35] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-[#4A3F35] mb-2">Days to Complete</label>
                                        <input
                                            type="number"
                                            value={challengeData.time_window}
                                            onChange={(e) => setChallengeData({ ...challengeData, time_window: parseInt(e.target.value) })}
                                            className="w-full p-4 rounded-xl bg-[#F5F2EE] border-2 border-transparent focus:border-[#9BAF9E] focus:bg-white text-[#4A3F35] outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <motion.button {...pressProps('cta')}
 onClick={() => setStep(1)}
 className="flex-1 py-4 rounded-xl border-2 border-[#E8DCC8] text-[#4A3F35] font-bold hover:bg-[#F5F2EE]"
 >
                                        Back
                                    </motion.button>
                                    <motion.button {...pressProps('pill')}
 onClick={() => setStep(3)}
 disabled={!challengeData.name || !challengeData.description}
 className="flex-1 py-4 rounded-xl text-white font-bold shadow-lg disabled:opacity-50 "
 style={{ background: `linear-gradient(135deg, ${COLORS.highlight} 0%, #D94030 100%)` }}
 >
                                        Continue
                                    </motion.button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Badge Customization */}
                        {step === 3 && (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-[#4A3F35] mb-3">Badge Icon</label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {badgeIcons.map(icon => (
                                            <motion.button {...pressProps('row')}
 key={icon}
 onClick={() => setChallengeData({ ...challengeData, badge_icon: icon })}
 className={`p-4 rounded-xl border-2 text-3xl ${challengeData.badge_icon === icon
 ? 'border-[#9BAF9E] bg-[#9BAF9E]/10 scale-110'
 : 'border-[#E8DCC8] hover:border-[#D4C4B0]'
 }`}
 >
                                                {icon}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-[#4A3F35] mb-3">Badge Color</label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {badgeColors.map(color => (
                                            <motion.button {...pressProps('row')}
 key={color.id}
 onClick={() => setChallengeData({ ...challengeData, badge_color: color.id })}
 className={`p-3 rounded-xl border-2 ${challengeData.badge_color === color.id
 ? 'border-[#4A3F35] scale-110'
 : 'border-transparent'
 }`}
 >
                                                <div className={`h-12 rounded-lg bg-gradient-to-br ${color.gradient}`} />
                                                <div className="text-xs text-[#4A3F35] mt-1 font-bold">{color.label}</div>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                {/* Preview */}
                                <div className="p-6 bg-[#F5F2EE] rounded-[18px]">
                                    <p className="text-xs text-[#8B7F72] mb-3 uppercase tracking-wider">Preview</p>
                                    <div className={`w-32 h-32 mx-auto rounded-full bg-gradient-to-br ${badgeColors.find(c => c.id === challengeData.badge_color)?.gradient} flex items-center justify-center text-6xl shadow-xl`}>
                                        {challengeData.badge_icon}
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <motion.button {...pressProps('cta')}
 onClick={() => setStep(2)}
 className="flex-1 py-4 rounded-xl border-2 border-[#E8DCC8] text-[#4A3F35] font-bold hover:bg-[#F5F2EE]"
 >
                                        Back
                                    </motion.button>
                                    <motion.button {...pressProps('pill')}
 onClick={handleCreate}
 className="flex-1 py-4 rounded-xl text-white font-bold shadow-lg flex items-center justify-center gap-2"
 style={{ background: `linear-gradient(135deg, ${COLORS.highlight} 0%, #D94030 100%)` }}
 >
                                        <Trophy size={20} />
                                        Create Challenge
                                    </motion.button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </>
        </AnimatePresence>
    );
};

export default CreateChallengeModal;
