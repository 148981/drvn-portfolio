import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { TrendingUp, ArrowLeft } from 'lucide-react';
import { haptic } from '../utils/haptics';


const triggerHaptic = (style = 'medium') => haptic(style);

const SaveConfirmationModal = ({ sessionScore, currentBaseline, onConfirm, onSaveOnly, isEligible = false, onBack }) => {
    // isEligible determines if this is a "Record Breaking" event

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        >
            <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className="w-full max-w-xs rounded-[36px] p-8 text-black relative"
                style={{
                    // Stone 色 Liquid Glass — 與 RPE 彈窗一致
                    background: 'rgba(228, 222, 210, 0.85)',
                    backdropFilter: 'blur(36px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(36px) saturate(160%)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderTop: '1px solid rgba(255,255,255,0.9)',
                    borderLeft: '1px solid rgba(255,255,255,0.6)',
                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.8), 0 12px 40px rgba(0,0,0,0.2)',
                }}
            >
                {/* 返回鍵已移除（使用者要求）：此步只確認或取消，不需要回上一步 */}

                {/* Step Indicator — 與 RPE Modal 一致：標示「Step 2/2 · 完成」*/}
                <div className="w-full mb-5 pt-4 flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.30)' }}>
                        Step 2 / 2
                    </span>
                    <div className="flex-1 h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(22,20,21,0.10)' }}>
                        <div className="h-full" style={{ width: '100%', background: '#F95C4B' }} />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: '#F95C4B' }}>
                        RPE · Save
                    </span>
                </div>

                <p className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-2 text-center">
                    Session Complete
                </p>
                <h3 className="text-2xl font-black italic text-center mb-6 leading-tight">
                    {isEligible ? <>Update your<br />Baseline?</> : <>Confirm<br />Record?</>}
                </h3>

                <div className="rounded-3xl p-5 mb-6 text-center"
                     style={{
                         background: 'linear-gradient(160deg, rgba(255,255,255,0.6), rgba(246,244,241,0.35))',
                         border: '1px solid rgba(255,255,255,0.5)',
                         boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                     }}>
                    <p className="text-[9px] font-bold opacity-40 uppercase">Session Score</p>
                    <p className="text-4xl font-black italic">{sessionScore}<span className="text-sm ml-1">PTS</span></p>
                    {isEligible && (
                        <div className="mt-2 text-[#5A7A3A] text-[9px] font-black uppercase flex items-center justify-center gap-1">
                            <TrendingUp size={12} /> Exceeds Standard
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3">
                    {/* Main Action Button - Coral Titanium */}
                    <motion.button {...pressProps('pill')}
 onClick={() => { triggerHaptic('heavy'); onConfirm(); }}
 className="w-full rounded-full py-4 font-black text-sm tracking-widest shadow-lg hover:shadow-xl relative overflow-hidden group border border-[#FF8E7D]/40"
 style={{
 background: 'linear-gradient(135deg, #FFA092 0%, #F95C4B 30%, #E64D3D 60%, #D94030 100%)',
 color: '#FFFFFF',
 boxShadow: '0 8px 20px rgba(249,92,75,0.25), inset 0 1px 0 rgba(255,255,255,0.4)'
 }}
 >
                        {/* Brushed Metal Overlay */}
                        <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-20" 
                             style={{ backgroundImage: `url("https://www.transparenttextures.com/patterns/brushed-alum.png")` }} />
                        <span className="relative z-10">DONE</span>
                    </motion.button>

                    {/* Secondary Action */}
                    <motion.button {...pressProps('pill')}
 onClick={onSaveOnly}
 className="w-full bg-black/5 text-black/60 rounded-full py-4 font-black text-xs tracking-widest hover:bg-black/10"
 >
                        CANCEL
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default SaveConfirmationModal;
