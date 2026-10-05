import React, { useEffect, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const EvolutionDiagnosisModal = ({ metricType, data, educationDetails, onClose }) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    const details = educationDetails;

    if (!details || !mounted) return null;

    const modalContent = (
        <AnimatePresence>
            {/* 這裡改成 items-center justify-center 讓內容置中 */}
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6" onClick={onClose}>
                
                {/* 背景遮罩稍微加深，凸顯中間的卡片 */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                />

                {/* 卡片本體：改用 scale 縮放動畫，並加上深色半透明背景與細白邊框 */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative z-10 w-full max-w-[340px] bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-[28px] p-8 shadow-2xl flex flex-col gap-6"
                    onClick={(e) => e.stopPropagation()} // 防止點擊卡片內部關閉
                >
                    {/* 關閉按鈕 */}
                    <motion.button {...pressProps('icon')} aria-label="關閉" 
 onClick={onClose}
 className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
 >
                        <X size={16} />
                    </motion.button>

                    {/* Header: Subtitle & Title */}
                    <div className="pr-8">
                        <h4 className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2">
                            {details.subtitle}
                        </h4>
                        <h2 className="text-3xl font-light text-white leading-tight tracking-tight">
                            {details.title}
                        </h2>
                    </div>

                    {/* 🎯 一句話講完「這個指標是在練什麼的」——放在最前面。
                        使用者原話：「每一個點進去都要顯示這個指標是去練什麼的精簡資訊。」
                        下面的 description 是背景說明，先給結論再給脈絡。 */}
                    {details.trains && (
                        <div className="rounded-2xl px-4 py-3.5"
                             style={{ background: 'rgba(232,93,4,0.10)', border: '1px solid rgba(232,93,4,0.28)' }}>
                            <div className="text-[12px] font-black tracking-[0.22em] mb-1.5" style={{ color: '#F0954E' }}>
                                這個指標在練什麼
                            </div>
                            <div className="text-[13.5px] font-bold text-white leading-relaxed">
                                {details.trains}
                            </div>
                            {details.howToImprove && (
                                <div className="text-[11.5px] font-medium text-white/60 leading-relaxed mt-2 pt-2"
                                     style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                                    <span className="font-black text-white/45">怎麼練起來　</span>
                                    {details.howToImprove}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 主要描述文字 */}
                    <p className="text-sm font-medium text-white/70 leading-relaxed">
                        {details.description}
                    </p>

                    {/* 條列重點 (Insights) */}
                    <div className="space-y-4 mt-2">
                        {details.insights.map((insight, idx) => (
                            <div key={idx} className="flex flex-col border-l-2 border-white/20 pl-3 py-0.5">
                                <span className="text-[9px] font-black text-[#E85D04] uppercase tracking-widest mb-1">
                                    {insight.label}
                                </span>
                                <span className="text-xs font-medium text-white/90 leading-snug">
                                    {insight.text}
                                </span>
                            </div>
                        ))}
                    </div>

                </motion.div>
            </div>
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
};

export default EvolutionDiagnosisModal;
