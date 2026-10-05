import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { ArrowLeft, Share2, Info } from 'lucide-react';
import BodyWeaknessMap from './BodyWeaknessMap';

const MuscleDistributionView = ({ record, userProfile, onBack }) => {
    // If no record, show empty state
    if (!record) return (
        <div className="flex flex-col items-center justify-center h-full text-white/50">
            <p>No InBody data available.</p>
            <motion.button {...pressProps('icon')} onClick={onBack} className="mt-4 px-4 py-2 bg-white/10 rounded-full text-white">Go Back</motion.button>
        </div>
    );

    // Calculate Standard (Ideal) Values based on height/gender
    // Simple heuristic: 
    // Arms: 4.5% - 6.0% of weight? Or use fixed logic.
    // If we assume a "Standard" logic is:
    // Arm: ~3kg (F) ~4kg (M) baseline + scaled by height
    // We can just compare Left vs Right for balance first.

    // Let's create a "Weakness" list for the map
    const weaknesses = [];
    const avgArm = ((parseFloat(record.right_arm_muscle) || 0) + (parseFloat(record.left_arm_muscle) || 0)) / 2;
    const avgLeg = ((parseFloat(record.right_leg_muscle) || 0) + (parseFloat(record.left_leg_muscle) || 0)) / 2;
    const trunk = parseFloat(record.trunk_muscle) || 0;

    // Balance Check
    const armDiff = Math.abs((parseFloat(record.right_arm_muscle) || 0) - (parseFloat(record.left_arm_muscle) || 0));
    if (armDiff > 0.2) {
        weaknesses.push({
            area: 'arms',
            severity: 'moderate',
            reason: 'Imbalanced L/R'
        });
    }

    const legDiff = Math.abs((parseFloat(record.right_leg_muscle) || 0) - (parseFloat(record.left_leg_muscle) || 0));
    if (legDiff > 0.2) {
        weaknesses.push({
            area: 'legs',
            severity: 'moderate',
            reason: 'Imbalanced L/R'
        });
    }

    // Relative Strength Check (Top vs Bottom)
    // Heuristic: Arms should be ~40-50% of Leg mass?
    // This is very rough. Using simple logic for demo.

    return (
        <div className="min-h-[100dvh] w-full bg-[#F6F4F1] flex flex-col items-center text-[#161415] font-sans absolute inset-0 z-50 overflow-y-auto no-scrollbar">

            {/* Header */}
            <div className="w-full max-w-[393px] pt-8 px-6 pb-4 flex items-center justify-between sticky top-0 bg-[#F6F4F1]/90 backdrop-blur-md z-20">
                <motion.button {...pressProps('pill')} aria-label="返回" onClick={onBack} className="w-10 h-10 rounded-full border border-[#161415]/10 flex items-center justify-center bg-[#161415]/5 transition">
                    <ArrowLeft size={20} className="text-[#161415]" />
                </motion.button>
                <div className="text-lg font-bold">Muscle Analysis</div>
                <div className="w-10"></div>
            </div>

            <div className="w-full max-w-[393px] px-6 pb-4">

                {/* 1. The Map */}
                <div className="bg-[#E4DED2] rounded-[36px] p-6 mb-6 border border-[#161415]/5 shadow-2xl relative">
                    <div className="absolute top-6 left-6 z-10">
                        <div className="text-xs font-bold text-[#161415]/40 uppercase tracking-widest mb-1">Status</div>
                        <div className="text-2xl font-black text-[#161415]">Balanced</div>
                    </div>

                    <div className="h-[360px] w-full flex items-center justify-center">
                        <BodyWeaknessMap
                            weaknesses={weaknesses}
                            targetAreas={[]} // Could pass focused areas
                        />
                    </div>

                    <p className="text-center text-xs text-[#161415]/30 font-medium mt-2">
                        * Highlighted areas indicate imbalance or weakness
                    </p>
                </div>

                {/* 2. Segmental Data Table */}
                <div className="space-y-4">
                    <h3 className="text-lg font-bold pl-1 flex items-center gap-2">
                        <Info size={18} className="text-[#F95C4B]" />
                        Segmental Details (kg)
                    </h3>

                    <div className="bg-[#E4DED2] rounded-[18px] p-1 overflow-hidden">
                        {/* Header */}
                        <div className="grid grid-cols-3 text-center py-3 bg-[#161415]/5 text-xs font-bold text-[#161415]/50 uppercase tracking-wider">
                            <div>Segment</div>
                            <div>Right</div>
                            <div>Left</div>
                        </div>

                        {/* Row: Arms */}
                        <div className="grid grid-cols-3 text-center py-4 border-b border-[#161415]/5 items-center">
                            <div className="text-sm font-bold text-[#161415]/80">Arms</div>
                            <div className="text-xl font-black text-[#161415]">{record.right_arm_muscle || '--'}</div>
                            <div className="text-xl font-black text-[#161415]">{record.left_arm_muscle || '--'}</div>
                        </div>

                        {/* Row: Legs */}
                        <div className="grid grid-cols-3 text-center py-4 border-b border-[#161415]/5 items-center">
                            <div className="text-sm font-bold text-[#161415]/80">Legs</div>
                            <div className="text-xl font-black text-[#161415]">{record.right_leg_muscle || '--'}</div>
                            <div className="text-xl font-black text-[#161415]">{record.left_leg_muscle || '--'}</div>
                        </div>

                        {/* Row: Trunk (Centered) */}
                        <div className="py-4 flex flex-col items-center justify-center gap-1">
                            <div className="text-sm font-bold text-[#161415]/80">Trunk (Core)</div>
                            <div className="text-2xl font-black text-[#161415]">{record.trunk_muscle || '--'}</div>
                        </div>
                    </div>
                </div>

                {/* 3. Analysis Summary */}
                <div className="mt-8 p-6 bg-[#161415] rounded-[28px] text-[#F6F4F1]">
                    <h3 className="font-black text-xl mb-2">Coach's Insight</h3>
                    <p className="font-bold text-[#F6F4F1]/70 leading-relaxed text-sm">
                        {weaknesses.length === 0
                            ? "Your muscle development is well-balanced! Continue with your current full-body routine to maintain symmetry."
                            : "Focus on correcting the displayed imbalances. Add unilateral exercises (single-arm/leg) to your weaker side."}
                    </p>
                </div>

            </div>
        </div>
    );
};

export default MuscleDistributionView;
