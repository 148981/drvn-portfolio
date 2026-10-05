import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Zap } from 'lucide-react';

/**
 * Cover Slide - Week Recap Opening
 * Aesthetic: Vibrant Orange "Ticket" Style, Stats-heavy
 */
const CoverSlide = ({ weekNumber, message, workoutsCount = 0, activeMinutes = 0 }) => {
    return (
        <div className="relative w-full h-full flex flex-col justify-center px-4 bg-[#09090B]">

            {/* Main Card */}
            <motion.div
                className="relative w-full aspect-[3/5] bg-[#FF9F76] rounded-[36px] p-6 flex flex-col justify-between overflow-hidden shadow-2xl border-4 border-black"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, type: 'spring' }}
            >
                {/* Decorative Circles */}
                <div className="absolute top-[-50px] right-[-50px] w-64 h-64 rounded-full border-[8px] border-black/5"></div>

                {/* Header Badge */}
                <div className="relative z-10 flex justify-between items-start">
                    <motion.div
                        className="inline-block px-4 py-2 bg-black rounded-full transform -rotate-2"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <span className="text-white font-black uppercase tracking-wider text-xs flex items-center gap-1">
                            <Calendar size={12} /> Weekly Recap
                        </span>
                    </motion.div>
                </div>

                {/* Big Title */}
                <div className="relative z-10 mt-8 mb-4">
                    <motion.h1
                        className="text-8xl font-black text-black leading-[0.85] tracking-tighter"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                    >
                        WEEK<br />
                        <span className="text-white text-stroke-3">{weekNumber}</span>
                    </motion.h1>
                </div>

                {/* Main Stats "Sticker" */}
                <motion.div
                    className="relative z-10 bg-white rounded-3xl p-5 border-4 border-black transform rotate-2 shadow-[8px_8px_0px_rgba(0,0,0,1)]"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                >
                    <div className="flex justify-between items-center mb-4 border-b-2 border-black/10 pb-2">
                        <span className="font-bold text-black/50 text-xs uppercase">Summary</span>
                        <Zap size={20} className="text-[#FF9F76]" fill="currentColor" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-black/50 text-[9px] font-bold uppercase">Workouts</p>
                            <p className="text-4xl font-black text-black leading-none">{workoutsCount}</p>
                        </div>
                        <div>
                            <p className="text-black/50 text-[9px] font-bold uppercase">Active Mins</p>
                            <p className="text-4xl font-black text-black leading-none">{activeMinutes}</p>
                        </div>
                    </div>
                </motion.div>

                {/* Quote / Footer */}
                <div className="relative z-10 mt-auto pt-8">
                    <p className="text-xl font-bold text-black leading-tight mb-6">
                        "{message || "Ready for next week?"}"
                    </p>

                    <motion.div
                        className="w-full bg-black py-4 rounded-[18px] flex items-center justify-center gap-2 text-white"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                    >
                        <span className="text-sm font-bold uppercase tracking-widest">
                            TAP TO START
                        </span>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
};

export default CoverSlide;
