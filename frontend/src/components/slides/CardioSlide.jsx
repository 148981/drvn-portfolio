import React, { useRef } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { Map, Activity, Timer, Zap, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * CardioSlide - "My Notes" Style
 * Purple/Pink Gradient Card
 */
const CardioSlide = ({ cardioData }) => {
    const navigate = useNavigate();
    const cardRef = useRef(null);

    // Default data if none provided
    const data = {
        distance: cardioData?.distance || 0, // km
        avgPace: cardioData?.avgPace || 0, // min/km (if available)
        calories: cardioData?.calories || 0,
        text: cardioData?.distance > 0 ? "You're consistently moving." : "Start your running journey."
    };

    return (
        <div className="w-full h-full bg-[#09090B] flex flex-col items-center justify-center p-4">
            <motion.div
                ref={cardRef}
                className="relative w-full aspect-[3/5] bg-gradient-to-br from-[#E0BBE4] to-[#957DAD] rounded-[36px] p-6 flex flex-col justify-between shadow-2xl overflow-hidden border-4 border-black"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                {/* Sticker Decoration */}
                <div className="absolute top-4 right-4 transform rotate-12">
                    <div className="w-16 h-16 bg-[#FFD66B] rounded-full border-2 border-black flex items-center justify-center shadow-lg">
                        <Activity size={32} className="text-black" />
                    </div>
                </div>

                {/* Header */}
                <div className="mt-8">
                    <h2 className="text-6xl font-black text-black leading-none tracking-tighter mb-2">
                        CARDIO<br /><span className="text-white text-stroke-3">TRACK</span>
                    </h2>
                    <div className="inline-block bg-black px-4 py-1 rounded-full">
                        <p className="text-[#E0BBE4] font-bold uppercase tracking-widest text-xs">Run • Walk • Hike</p>
                    </div>
                </div>

                {/* Stats Container */}
                <div className="bg-white/90 backdrop-blur-sm rounded-[28px] p-6 border-2 border-black shadow-xl transform -rotate-1">
                    <div className="flex justify-between items-end mb-4 border-b-2 border-dashed border-black/20 pb-4">
                        <div>
                            <p className="text-xs font-bold text-black/50 uppercase">Total Distance</p>
                            <h3 className="text-5xl font-black text-black">{data.distance}<span className="text-xl">km</span></h3>
                        </div>
                        <Map size={40} className="text-black/80 mb-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs font-bold text-black/50 uppercase">Calories</p>
                            <p className="text-2xl font-black text-black">{Math.round(data.calories)}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-black/50 uppercase">Best Pace</p>
                            <p className="text-2xl font-black text-black">--</p>
                        </div>
                    </div>
                </div>

                {/* Footer Action — High #6: 重新階層化（主CTA / 中secondary / 細text link） */}
                <div className="text-center space-y-3">
                    <p className="font-bold text-black text-lg italic">"{data.text}"</p>

                    {/* 主 CTA — Go Running */}
                    <motion.button {...pressProps('row')}
 onClick={(e) => {
 e.stopPropagation();
 navigate('/cardio-tracker-mobile');
 }}
 className="w-full py-4 bg-black text-white rounded-[18px] font-black uppercase flex items-center justify-center gap-2 hover:bg-[#262523] transition-colors shadow-lg "
 >
                        Go Running <ArrowRight size={20} />
                    </motion.button>

                    {/* 中等 secondary — This Week（每日會看，視覺權重提升） */}
                    <motion.button {...pressProps('pill')}
 onClick={(e) => {
 e.stopPropagation();
 navigate('/cardio-microcycle-inbox');
 }}
 className="w-full py-3 rounded-[18px] font-extrabold text-[9px] uppercase tracking-[0.22em] flex items-center justify-center gap-2 "
 style={{
 background: 'linear-gradient(135deg, #F6F4F1 0%, #E4DED2 100%)',
 color: '#161415',
 border: '1px solid rgba(22,20,21,0.14)',
 boxShadow: '0 4px 12px rgba(22,20,21,0.08), inset 0 1px 1px rgba(255,255,255,1)',
 }}
 >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F95C4B]" />
                        This Week
                    </motion.button>

                    {/* 細 tertiary — Build Plan（不常用，純文字 link） */}
                    <motion.button {...pressProps('pill')}
 onClick={(e) => {
 e.stopPropagation();
 navigate('/cardio-plan-builder');
 }}
 className="w-full py-1 text-[9px] font-black uppercase tracking-[0.28em] text-black/55 hover:text-black/80"
 >
                        + Build New Plan
                    </motion.button>
                </div>

            </motion.div>
        </div>
    );
};

export default CardioSlide;
