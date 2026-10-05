import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// 🔥 定義流動背景動畫的 CSS
const FluidStyles = () => (
    <style>{`
        @keyframes liquidFlow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .glass-card {
            background-size: 200% 200%;
            animation: liquidFlow 6s ease-in-out infinite;
            backdrop-filter: blur(24px) saturate(180%);
            -webkit-backdrop-filter: blur(24px) saturate(180%);
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .glass-card:active {
            transform: scale(0.97);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.3);
        }
    `}</style>
);

const TargetSelectionModal = ({ isOpen, onClose, onSelectTarget, savedBaseline = 40 }) => {
    if (!isOpen) return null;

    // 計算三個層級的目標分數
    const pushScore = Math.round(savedBaseline * 1.15);
    const steadyScore = savedBaseline;
    const easyScore = Math.round(savedBaseline * 0.5);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100000] flex flex-col items-center justify-center p-4"
                >
                    <FluidStyles />
                    
                    {/* 全局暗色遮罩（帶一點點模糊讓背景更沉） */}
                    <div 
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ y: '100%', opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: '100%', opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="relative w-full max-w-sm rounded-[36px] p-7 overflow-hidden z-10"
                        style={{
                            // 底層面板也用帶有高質感的霧面玻璃
                            background: 'linear-gradient(180deg, rgba(238,238,238,0.2) 0%, rgba(220,220,220,0.2) 100%)',
                            backdropFilter: 'blur(30px)',
                            WebkitBackdropFilter: 'blur(30px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            boxShadow: '0 24px 60px rgba(0,0,0,0.2)'
                        }}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-4xl font-black italic tracking-tighter leading-none text-[#161415]">
                                    今日<br/>目標
                                </h2>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-[#161415]/40 mt-3">
                                    BASELINE: {savedBaseline} PTS • ATHLETE
                                </p>
                            </div>
                            <motion.button {...pressProps('icon')} aria-label="關閉" 
 onClick={onClose}
 className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors"
 >
                                <X size={16} className="text-[#161415]/60" />
                            </motion.button>
                        </div>

                        {/* Cards Container */}
                        <div className="flex flex-col gap-4">
                            
                            {/* 🔴 PUSH CARD */}
                            <div 
                                onClick={() => onSelectTarget(pushScore, 'challenge')}
                                className="glass-card relative w-full rounded-[28px] p-5 cursor-pointer overflow-hidden group"
                                style={{
                                    // 降低 alpha 值讓它變透，搭配不同深淺的橘紅色營造流動層次
                                    background: 'linear-gradient(135deg, rgba(249, 92, 75, 0.7) 0%, rgba(255, 130, 100, 0.4) 50%, rgba(249, 92, 75, 0.6) 100%)',
                                }}
                            >
                                {/* 右上角標籤 */}
                                <div className="absolute top-5 right-5 bg-[#161415] text-white text-[11px] font-black px-3 py-1 rounded-full">
                                    +15%
                                </div>
                                {/* 浮水印裝飾 */}
                                <div className="absolute -right-4 -bottom-6 text-[100px] opacity-[0.07] rotate-12 pointer-events-none">⚡️</div>

                                <div className="flex items-center gap-1.5 text-white/90 mb-1">
                                    <span className="text-sm">⚡️</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest">PUSH</span>
                                </div>
                                <div className="flex items-end gap-1 mb-2">
                                    <span className="text-5xl font-black text-white leading-none tracking-tighter">{pushScore}</span>
                                    <span className="text-xs font-bold text-white/70 mb-1">PTS</span>
                                </div>
                                <p className="text-[11px] font-bold text-white/80">挑戰極限，完成後更新你的基準線</p>
                            </div>

                            {/* 🟡 STEADY CARD */}
                            <div 
                                onClick={() => onSelectTarget(steadyScore, 'routine')}
                                className="glass-card relative w-full rounded-[28px] p-5 cursor-pointer overflow-hidden group"
                                style={{
                                    // 奶油米色流動玻璃
                                    background: 'linear-gradient(135deg, rgba(228, 222, 210, 0.7) 0%, rgba(245, 240, 230, 0.4) 50%, rgba(228, 222, 210, 0.6) 100%)',
                                }}
                            >
                                <div className="absolute -right-4 -bottom-4 text-[100px] opacity-[0.05] -rotate-12 pointer-events-none">🎯</div>

                                <div className="flex items-center gap-1.5 text-[#161415]/70 mb-1">
                                    <span className="text-sm">🎯</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest">STEADY</span>
                                </div>
                                <div className="flex items-end gap-1 mb-2">
                                    <span className="text-5xl font-black text-[#F95C4B] leading-none tracking-tighter">{steadyScore}</span>
                                    <span className="text-xs font-bold text-[#161415]/40 mb-1">PTS</span>
                                </div>
                                <p className="text-[11px] font-bold text-[#161415]/60">穩定維持體能，不衝不退</p>
                            </div>

                            {/* 🟢 EASY CARD */}
                            <div 
                                onClick={() => onSelectTarget(easyScore, 'mindfulness')}
                                className="glass-card relative w-full rounded-[28px] p-5 cursor-pointer overflow-hidden group"
                                style={{
                                    // 透白微綠色流動玻璃
                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(240, 245, 240, 0.5) 50%, rgba(255, 255, 255, 0.7) 100%)',
                                }}
                            >
                                <div className="absolute -right-4 -bottom-4 text-[100px] opacity-[0.03] rotate-12 pointer-events-none">🌿</div>

                                <div className="flex items-center gap-1.5 text-[#161415]/70 mb-1">
                                    <span className="text-sm">🌿</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest">EASY</span>
                                </div>
                                <div className="flex items-end gap-1 mb-2">
                                    <span className="text-5xl font-black text-[#161415] leading-none tracking-tighter">{easyScore}</span>
                                    <span className="text-xs font-bold text-[#161415]/40 mb-1">PTS</span>
                                </div>
                                <p className="text-[11px] font-bold text-[#161415]/60">輕鬆跑恢復日，超速會收到警告</p>
                            </div>

                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default TargetSelectionModal;
