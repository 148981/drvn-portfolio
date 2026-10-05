import React, { useRef } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { Utensils, Zap, ArrowRight, Apple } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * NutritionSlide - "My Notes" Style
 * Sage/Green Gradient Card
 */
const NutritionSlide = ({ nutritionData }) => {
    const navigate = useNavigate();
    const cardRef = useRef(null);

    // Default data
    const data = {
        caloriesAvg: nutritionData?.caloriesAvg || 0,
        proteinAvg: nutritionData?.proteinAvg || 0,
        streak: nutritionData?.streak || 0,
        text: "Fuel your body right."
    };

    return (
        <div className="w-full h-full bg-[#09090B] flex flex-col items-center justify-center p-4">
            <motion.div
                ref={cardRef}
                className="relative w-full aspect-[3/5] bg-[#D4E09B] rounded-[36px] p-6 flex flex-col justify-between shadow-2xl overflow-hidden border-4 border-black"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #000 2px, transparent 2px)', backgroundSize: '24px 24px' }}></div>

                {/* Sticker Decoration */}
                <div className="absolute top-4 -left-2 transform -rotate-6 z-10">
                    <div className="bg-[#CBF078] px-4 py-2 border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                        <p className="font-black text-black text-sm uppercase">Eat Clean!</p>
                    </div>
                </div>

                {/* Header */}
                <div className="mt-12 text-center relative z-10">
                    <div className="w-20 h-20 bg-black rounded-full mx-auto flex items-center justify-center mb-4 border-4 border-white">
                        <Apple size={40} className="text-[#D4E09B]" />
                    </div>
                    <h2 className="text-5xl font-black text-black leading-none tracking-tight">
                        飲食<br />記錄
                    </h2>
                </div>

                {/* Stats Container */}
                <div className="grid grid-cols-2 gap-3 relative z-10">
                    <div className="bg-[#F6FFDE] p-4 rounded-[18px] border-2 border-black flex flex-col items-center justify-center">
                        <p className="text-[9px] font-bold text-black/60 uppercase">Daily Avg</p>
                        <h3 className="text-3xl font-black text-black">{data.caloriesAvg}</h3>
                        <p className="text-xs font-bold text-black">kcal</p>
                    </div>
                    <div className="bg-[#F6FFDE] p-4 rounded-[18px] border-2 border-black flex flex-col items-center justify-center">
                        <p className="text-[9px] font-bold text-black/60 uppercase">Protein</p>
                        <h3 className="text-3xl font-black text-black">{data.proteinAvg}</h3>
                        <p className="text-xs font-bold text-black">g</p>
                    </div>
                </div>

                {/* Footer Action */}
                <div className="text-center space-y-4 relative z-10">
                    <div className="bg-black/10 p-3 rounded-xl">
                        <p className="font-bold text-black text-sm">🔥 {data.streak} Day Log Streak</p>
                    </div>

                    <motion.button {...pressProps('cta')}
 onClick={(e) => {
 e.stopPropagation();
 navigate('/nutrition-mobile');
 }}
 className="w-full py-4 bg-black text-white rounded-[18px] font-black uppercase flex items-center justify-center gap-2 hover:bg-[#262523] transition-colors shadow-lg"
 >
                        Check Logs <ArrowRight size={20} />
                    </motion.button>
                </div>

            </motion.div>
        </div>
    );
};

export default NutritionSlide;
