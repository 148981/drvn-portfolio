import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap } from 'lucide-react';

/**
 * Effort Score 說明彈窗
 * 
 * 顯示以下資訊：
 * - 心率區間與顏色對應
 * - 心率加權計算 (Zone × Multiplier)
 * - 目標進度條說明
 * - 分數顯示樣式說明 (Rubik ExtraBold 800 Italic, 深棕灰漸層透明感, 流光效果)
 */
const EffortExplanationModal = ({ isOpen, onClose }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
                    >
                        {/* Modal Content */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#F0EEE6] w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl relative max-h-[85dvh] overflow-y-auto"
                        >
                            {/* Close Button */}
                            <motion.button {...pressProps('icon')} aria-label="關閉"
 onClick={onClose}
 className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-black/60 hover:bg-black/10 transition-colors z-10"
 >
                                <X size={18} />
                            </motion.button>

                            {/* Header Image / Graphic Area */}
                            <div className="bg-[#E9C46A] p-8 flex flex-col items-center justify-center pt-12 pb-10 relative overflow-hidden">
                                <Zap className="w-32 h-32 text-black/5 absolute -right-4 -top-4 -rotate-12" />
                                <div className="z-10 text-center">
                                    <h2 className="text-3xl font-black text-black leading-none mb-2 tracking-tight">GRAVITY<br />SCORE</h2>
                                    <p className="text-xs font-bold text-black/60 uppercase tracking-widest bg-black/10 px-3 py-1 rounded-full inline-block">動態負荷系統</p>
                                </div>
                            </div>

                            {/* Content Body */}
                            <div className="p-6 pb-12 space-y-6">
                                <p className="text-sm font-medium text-black/70 leading-relaxed">
                                    此指標結合 <b className="text-black">心率區間</b>、<b className="text-black">運動強度</b> 和 <b className="text-black">燃脂效率</b>，為您提供完整的運動負荷評估。
                                </p>

                                {/* 1. Colors & Zones */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">1</div>
                                        <h3 className="font-bold text-black text-lg">心率區間與顏色</h3>
                                    </div>
                                    <div className="space-y-2 pl-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-[#CCD5AE]"></div>
                                            <span className="text-xs font-bold text-black/60">熱身區 (低強度)</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-[#E9C46A]"></div>
                                            <span className="text-xs font-bold text-black/80">燃脂區 (最佳效率)</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-[#F4A261]"></div>
                                            <span className="text-xs font-bold text-black/60">有氧區 (耐力訓練)</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-[#E76F51]"></div>
                                            <span className="text-xs font-bold text-black/60">無氧區 (高強度)</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-[#D62828]"></div>
                                            <span className="text-xs font-bold text-black/60">極限區 (最大負荷)</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Effort Score Calculation */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">2</div>
                                        <h3 className="font-bold text-black text-lg">心率加權計算</h3>
                                    </div>
                                    <div className="bg-white rounded-[18px] p-4 border border-black/5">
                                        <div className="grid grid-cols-3 gap-2 mb-2 border-b border-black/5 pb-2 text-[9px] font-black uppercase text-black/40 tracking-wider">
                                            <span>區間</span>
                                            <span className="text-center">強度</span>
                                            <span className="text-right">乘數</span>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 items-center mb-1">
                                            <span className="text-xs font-bold text-[#D62828]">Zone 5</span>
                                            <span className="text-xs font-medium text-black/60 text-center">極限</span>
                                            <span className="text-xs font-black text-black text-right">2.0x</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 items-center mb-1">
                                            <span className="text-xs font-bold text-[#E76F51]">Zone 4</span>
                                            <span className="text-xs font-medium text-black/60 text-center">高強度</span>
                                            <span className="text-xs font-black text-black text-right">1.5x</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 items-center mb-1">
                                            <span className="text-xs font-bold text-[#F4A261]">Zone 3</span>
                                            <span className="text-xs font-medium text-black/60 text-center">有氧</span>
                                            <span className="text-xs font-black text-black text-right">1.2x</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 items-center">
                                            <span className="text-xs font-bold text-[#E9C46A]">Zone 2</span>
                                            <span className="text-xs font-medium text-black/60 text-center">基礎</span>
                                            <span className="text-xs font-black text-black text-right">1.0x</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-black/60 leading-relaxed">
                                        分數 = <b className="text-black">卡路里消耗</b> × <b className="text-black">心率乘數</b><br />
                                        心率越高，分數累積越快，符合您的生理負荷曲線。
                                    </p>
                                </div>

                                {/* 3. Goal Progress */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">3</div>
                                        <h3 className="font-bold text-black text-lg">目標進度條</h3>
                                    </div>
                                    <p className="text-xs font-medium text-black/60 leading-relaxed">
                                        動態追蹤您的 <b className="text-black">目標完成度</b> (0% → 100%)。<br />
                                        <span className="block mt-2">
                                            <span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1"></span><b>維持目標</b>：白色光效。<br />
                                            <span className="inline-block w-2 h-2 rounded-full bg-[#D4A853] mr-1"></span><b>挑戰目標</b>：<b className="text-[#D62828] italic">極限突破</b> 金色流光。
                                        </span>
                                    </p>
                                </div>

                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default EffortExplanationModal;
