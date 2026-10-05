import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus } from 'lucide-react';

// 彈窗主組件
const PhysiqueDetailsModal = ({ isOpen, onClose, muscleData, onUpdateTarget }) => {
    const [currentTarget, setCurrentTarget] = useState(0);

    // Sync state with props when modal opens or data changes
    useEffect(() => {
        if (muscleData) {
            setCurrentTarget(muscleData.targetSets || 0);
        }
    }, [muscleData]);

    if (!isOpen || !muscleData) return null;

    const { name, actualSets, exercises } = muscleData;

    // 處理目標調整
    const handleAdjust = (adjustment) => {
        const newTarget = Math.max(1, currentTarget + adjustment); // 最少 1 組
        setCurrentTarget(newTarget);
        if (onUpdateTarget) {
            onUpdateTarget(name.toLowerCase(), newTarget);
        }
    };

    const roundedActual = Math.round(actualSets || 0);

    return (
        <AnimatePresence>
            {/* 背景遮罩 (Backdrop) */}
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
                onClick={onClose} // 點擊背景關閉
            >
                {/* 彈窗本體 (Modal Content) */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-[#1C1917] w-full max-w-md rounded-3xl border border-[#C5A059]/30 p-6 shadow-2xl shadow-[#C5A059]/10 relative overflow-hidden"
                    onClick={(e) => e.stopPropagation()} // 防止點擊彈窗本體關閉
                >
                    {/* 裝飾背景光 */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#C5A059]/10 blur-3xl rounded-full -z-10 pointer-events-none"></div>

                    {/* 1. Header */}
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-[#EEDC82] uppercase tracking-widest font-medium font-['Reenie_Beanie'] text-2xl">{name} EVOLUTION</h2>
                        <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} className="text-stone-400 hover:text-white transition-colors">
                            <X size={24} />
                        </motion.button>
                    </div>

                    {/* 2. Hero Metric (核心數據) */}
                    <div className="flex flex-col items-center mb-6">
                        <div className="flex items-baseline leading-none font-bold">
                            <span className="text-6xl text-[#EEDC82] font-mono">{roundedActual}</span>
                            <span className="text-4xl text-[#57534E] mx-2 font-light">/</span>
                            <span className="text-4xl text-[#F7F3E8] font-mono">{currentTarget}</span>
                        </div>
                        <span className="text-[9px] text-[#57534E] uppercase tracking-wider mt-2 font-bold">Weekly Effective Sets</span>
                    </div>

                    {/* 3. Visual Progress (進度條) */}
                    <div className="h-3 bg-[#292524] rounded-full overflow-hidden flex mb-10 border border-white/5">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((roundedActual / currentTarget) * 100, 100)}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="h-full bg-[#C5A059] shadow-[0_0_12px_rgba(197,160,89,0.5)]"
                        />
                    </div>

                    {/* 4. Target Override (目標校準) */}
                    <div className="mb-8">
                        <label className="text-xs text-[#57534E] uppercase tracking-wider mb-3 block font-bold">Calibrate Target</label>
                        <div className="flex items-center justify-between bg-[#292524] p-2 rounded-xl border border-white/5">
                            <motion.button {...pressProps('pill')} onClick={() => handleAdjust(-1)} className="p-2 text-[#57534E] hover:text-white hover:bg-[#44403C] rounded-lg transition ">
                                <Minus size={20} />
                            </motion.button>
                            <span className="text-[#F7F3E8] font-mono text-lg font-bold">{currentTarget} SETS</span>
                            <motion.button {...pressProps('pill')} onClick={() => handleAdjust(1)} className="p-2 text-[#57534E] hover:text-white hover:bg-[#44403C] rounded-lg transition ">
                                <Plus size={20} />
                            </motion.button>
                        </div>
                    </div>

                    {/* 5. Breakdown (訓練細節) */}
                    <div>
                        <h3 className="text-xs text-[#57534E] uppercase tracking-wider mb-3 font-bold">Contributing Exercises</h3>
                        <ul className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {exercises && exercises.length > 0 ? (
                                exercises.map((ex, index) => (
                                    <li key={index} className="flex justify-between text-sm border-b border-[#44403C]/30 pb-2 last:border-0 last:pb-0">
                                        <span className="text-[#D6D3D1]">{ex.name}</span>
                                        <span className="text-[#EEDC82] font-mono">{ex.sets} Sets</span>
                                    </li>
                                ))
                            ) : (
                                <li className="text-xs text-[#57534E] italic text-center py-2">No exercises recorded this week.</li>
                            )}
                        </ul>
                    </div>

                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default PhysiqueDetailsModal;
