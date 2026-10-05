import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Star, Award, TrendingUp } from 'lucide-react';

/**
 * MVPSlide - "My Notes" Style
 * Cream Card, Certificate/Trophy Aesthetic
 */
const MVPSlide = ({ topExercise }) => {
    const safeExercise = {
        name: topExercise?.name || 'Training',
        value: topExercise?.value || 0,
        unit: topExercise?.unit || 'kg',
        label: topExercise ? 'BEST PERFORMANCE' : 'KEEP PUSHING',
        sets: topExercise?.setsCount || 0,
        maxWeight: topExercise?.maxWeight || 0
    };

    return (
        <div className="w-full h-full bg-[#09090B] flex flex-col items-center justify-center p-4">
            <motion.div
                className="relative w-full aspect-[3/5] bg-[#F4F4F5] rounded-[36px] p-6 flex flex-col items-center text-center overflow-hidden shadow-2xl border-4 border-black"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 1.5px, transparent 1.5px)', backgroundSize: '16px 16px' }}></div>

                {/* Header Badge */}
                <div className="relative z-10 mb-6 bg-black text-white px-6 py-2 rounded-full transform -rotate-2">
                    <span className="font-black tracking-widest uppercase text-xs">MVP Of The Week</span>
                </div>

                {/* Trophy Illustration */}
                <div className="relative z-10 mb-8">
                    <motion.div
                        className="relative"
                        initial={{ rotate: -5, scale: 0.9 }}
                        animate={{ rotate: 5, scale: 1.05 }}
                        transition={{ duration: 2.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                    >
                        {/* Glow Behind */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-[#FFD66B] rounded-full blur-2xl opacity-60"></div>

                        <Trophy size={110} strokeWidth={2.5} className="text-black drop-shadow-[5px_5px_0px_rgba(0,0,0,0.2)] relative z-10" fill="#FFD66B" />

                        <motion.div
                            className="absolute -top-6 -right-6 z-20"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                        >
                            <Star size={48} fill="#FF9F76" stroke="black" strokeWidth={2} />
                        </motion.div>
                    </motion.div>
                </div>

                {/* Main Content Box - "Certificate" Style */}
                <div className="w-full bg-white border-4 border-black rounded-3xl p-6 relative shadow-[6px_6px_0px_rgba(0,0,0,1)]">
                    {/* Corner Decors */}
                    <div className="absolute top-2 left-2 w-2 h-2 bg-black rounded-full"></div>
                    <div className="absolute top-2 right-2 w-2 h-2 bg-black rounded-full"></div>
                    <div className="absolute bottom-2 left-2 w-2 h-2 bg-black rounded-full"></div>
                    <div className="absolute bottom-2 right-2 w-2 h-2 bg-black rounded-full"></div>

                    <h1 className="text-3xl font-black text-black leading-tight mb-1 uppercase tracking-tight">
                        {safeExercise.name}
                    </h1>
                    <div className="h-1 w-20 bg-[#FF9F76] mx-auto mb-4 rounded-full"></div>

                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div className="bg-[#B5D8F6] p-3 rounded-xl border border-black">
                            <p className="text-[9px] font-bold text-black/60 uppercase mb-1">Total Volume</p>
                            <span className="text-2xl font-black text-black block leading-none">{safeExercise.value}</span>
                            <span className="text-[11px] font-bold text-black">kg</span>
                        </div>
                        <div className="bg-[#FFD66B] p-3 rounded-xl border border-black">
                            <p className="text-[9px] font-bold text-black/60 uppercase mb-1">Result</p>
                            <span className="text-sm font-black text-black block leading-tight">Crushed It!</span>
                            <TrendingUp size={16} className="mt-1" />
                        </div>
                    </div>
                </div>

            </motion.div>
        </div>
    );
};

export default MVPSlide;
