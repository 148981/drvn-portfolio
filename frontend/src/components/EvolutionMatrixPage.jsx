import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import EvolutionDashboard from './EvolutionDashboard';
import { getUserId } from '../utils/auth';


const EvolutionMatrixPage = () => {
    const navigate = useNavigate();
    const userId = getUserId(); // Hardcoded for demo, normally from context/auth

    return (
        // Outer Body: Neutral Dark (Desktop Scope)
        <div className="min-h-[100dvh] w-full bg-[#0F0F0F] flex justify-center">

            {/* 手機容器 —— ⚠️ 不可寫死 393px（iPhone 15 Pro 的寬度）：
                iPhone 14/15 是 390、SE 是 375，整頁會多出 3~18px 而橫向捲動。
                桌機上要有「手機框」的效果用 max-w 就夠了。 */}
            <div className="w-full max-w-[440px] h-[100dvh] overflow-y-auto overflow-x-hidden relative shadow-2xl flex flex-col font-sans bg-[#09090B] text-white no-scrollbar">

                {/* Header - Fixed within the phone container */}
                <div className="px-6 py-4  flex items-center gap-4 sticky top-0 bg-[#09090B]/90 backdrop-blur-md z-50 border-b border-white/5 page-top-safe--tight">
                    <motion.button {...pressProps('pill')}
 onClick={() => navigate(-1)}
 className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10"
 >
                        <ArrowLeft size={20} className="text-white" />
                    </motion.button>
                    <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-widest text-white/50 font-bold">Dashboard</span>
                        <h1 className="text-lg font-bold font-['Inter_Tight'] leading-none">Evolution Matrix</h1>
                    </div>
                </div>

                {/* Content */}
                <div className="pb-8"> {/* Reduced padding since nav is gone */}
                    <EvolutionDashboard userId={userId} />
                </div>
            </div>
        </div>
    );
};

export default EvolutionMatrixPage;
