import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Check, Flame, Trophy, Zap, Heart, Target, Activity, Users, Lock } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { createPortal } from 'react-dom';
import { editorialColors } from '../utils/colors';
import { getStickerStates } from '../utils/stickerUnlock';
import { getUserId } from '../utils/auth';

const C = editorialColors;

export const STICKER_TEMPLATES = {
    workout: {
        id: 'workout',
        name: 'Workouts Pro',
        category: 'Classic',
        render: ({ workouts = 0 } = {}) => (
            <div className="w-36 h-20 bg-[#F6F4F1] border-[3px] border-[#161415] rounded-[12px] shadow-2xl flex flex-col items-center justify-center p-2 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] opacity-10 pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-[2px] bg-[#F95C4B]" />
                <span className="text-[#161415] font-black text-[16px] tracking-tighter z-10">訓練</span>
                <div className="flex w-full justify-end px-2 mt-1">
                    <span className="text-[#F95C4B] font-black text-2xl italic leading-none">{workouts}</span>
                </div>
                <div className="absolute bottom-1 left-2 flex gap-0.5">
                    {[1,2,3,4].map(i => <div key={i} className="w-1 h-1 bg-black/10 rounded-full" />)}
                </div>
            </div>
        )
    },
    run: {
        id: 'run',
        name: 'Running Pulse',
        category: 'Classic',
        render: ({ runs = 0 } = {}) => (
            <div className="w-24 h-24 bg-[#161415] border-[4px] border-[#F95C4B] rounded-full shadow-2xl flex flex-col items-center justify-center p-2 relative overflow-hidden">
                <div className="absolute inset-0 rounded-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none" />
                <Flame size={18} className="text-[#F95C4B] mb-0.5" />
                <span className="text-white font-black text-[18px] italic leading-none" style={{ fontFamily: 'var(--font-display)' }}>Run</span>
                <span className="text-white font-black text-xl mt-1 leading-none">{runs}</span>
            </div>
        )
    },






















    // ── NEW: Dynamic DRVN Stickers from Desktop ─────────────────────────────
    ...Object.fromEntries([...Array(17)].map((_, i) => {
        const id = `drvnSticker${i + 1}`;
        return [id, {
            id,
            name: `Sticker ${i + 1}`,
            category: i < 9 ? 'Classic' : 'Social',
            render: () => (
                <div className="w-32 h-32 flex items-center justify-center relative drop-shadow-xl transition-transform hover:scale-110">
                    <img loading="lazy" decoding="async" 
                        src={`/assets/stickers/${i + 1}.png`} 
                        alt={`Sticker ${i + 1}`}
                        className="w-full h-full object-contain"
                    />
                </div>
            )
        }];
    }))
};

export default function StickerGallery({ onClose, onSelect, onSave, activeStickers = [], actionText = "Save Layout" }) {
    const categories = ['All', 'Classic', 'Lifestyle', 'Hardcore', 'Social', 'Elite'];
    const [activeCat, setActiveCat] = React.useState('All');

    const filteredTemplates = Object.values(STICKER_TEMPLATES).filter(t =>
        activeCat === 'All' || t.category === activeCat
    );

    // 限定貼紙狀態（段位俱樂部 + 里程碑）：達到就給，未達顯示鎖 + 條件 + 進度
    const limitedStates = React.useMemo(() => {
        try { return getStickerStates(getUserId()); } catch (_) { return []; }
    }, []);
    // 限定貼紙只在「All」分頁顯示（它們不屬於現有功能分類）
    const showLimited = activeCat === 'All' && limitedStates.length > 0;

    return createPortal(
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-xl flex flex-col"
            onClick={onClose}
        >
            <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="mt-auto bg-[#F6F4F1] rounded-t-[36px] w-full max-h-[85dvh] overflow-hidden flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 pb-2 flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-black text-[#161415] tracking-tighter">STICKER<br/><span className="text-[#F95C4B]">LAB</span></h2>
                        <p className="text-[9px] font-bold text-[#8A7E73] uppercase tracking-[0.2em] mt-2">Personalize Your Identity</p>
                    </div>
                    <motion.button {...pressProps('icon')} aria-label="關閉" 
 onClick={onClose}
 className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center"
 >
                        <X size={24} className="text-[#161415]" />
                    </motion.button>
                </div>

                {/* Categories */}
                <div className="px-6 py-4 flex gap-4 overflow-x-auto no-scrollbar">
                    {categories.map(cat => (
                        <motion.button {...pressProps('icon')}
 key={cat}
 onClick={() => setActiveCat(cat)}
 className={`flex-shrink-0 px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest
 ${activeCat === cat 
 ? 'bg-[#161415] text-white shadow-xl scale-105' 
 : 'bg-black/5 text-[#8A7E73] hover:bg-black/10'}`}
 >
                            {cat}
                        </motion.button>
                    ))}
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto px-6 pb-20 no-scrollbar">
                    <div className="grid grid-cols-2 gap-6 pt-4">
                        {filteredTemplates.map(template => {
                            const isSelected = activeStickers.includes(template.id);
                            return (
                                <motion.div 
                                    key={template.id}
                                    whileTap={{ scale: 0.95 }}
                                    className="flex flex-col items-center gap-4 group"
                                    onClick={() => onSelect(template.id)}
                                >
                                    <div className={`relative w-full aspect-square bg-white rounded-[28px] border-2 flex items-center justify-center transition-all duration-300
                                        ${isSelected ? 'border-[#F95C4B] shadow-2xl bg-white scale-105' : 'border-black/5 shadow-sm group-hover:border-black/10'}`}>
                                        
                                        {/* Scale the preview sticker to fit */}
                                        <div className="transform scale-[0.7]">
                                            {template.render()}
                                        </div>

                                        {/* Selection Indicator */}
                                        {isSelected && (
                                            <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-[#F95C4B] flex items-center justify-center shadow-lg">
                                                <Check size={14} className="text-white" strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <span className="text-[12px] font-black text-[#161415] uppercase tracking-tighter">{template.name}</span>
                                        <div className="flex items-center justify-center gap-1 mt-1">
                                            <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-[#F95C4B]' : 'bg-black/10'}`} />
                                            <span className="text-[9px] font-bold text-[#8A7E73] uppercase tracking-widest">{template.category}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* ── 限定貼紙（達到就給：段位俱樂部 + 里程碑）────────────── */}
                    {showLimited && (
                        <div className="mt-10">
                            <div className="flex items-baseline justify-between mb-1">
                                <span className="text-[14px] font-black text-[#161415] uppercase tracking-tighter">限定貼紙</span>
                                <span className="text-[12px] font-bold text-[#8A7E73] tracking-widest">達成即解鎖</span>
                            </div>
                            <p className="text-[11px] font-medium text-[#8A7E73] mb-4 leading-relaxed">
                                到達段位或完成訓練成就就會自動獲得 — 每張都寫清楚怎麼拿到。
                            </p>
                            <div className="grid grid-cols-2 gap-6">
                                {limitedStates.map(s => {
                                    const unlocked = s.unlocked;
                                    const selected = activeStickers.includes(s.id);
                                    return (
                                        <motion.div
                                            key={s.id}
                                            whileTap={unlocked ? { scale: 0.95 } : {}}
                                            className="flex flex-col items-center gap-3"
                                            onClick={() => unlocked && onSelect(s.id)}
                                            style={{ cursor: unlocked ? 'pointer' : 'default' }}
                                        >
                                            <div className={`relative w-full aspect-square rounded-[28px] border-2 flex items-center justify-center transition-all duration-300
                                                ${selected ? 'border-[#F95C4B] shadow-2xl scale-105' : unlocked ? 'border-black/5 shadow-sm bg-white' : 'border-black/5 bg-black/[0.03]'}`}>
                                                <span className="text-[44px]" style={{ filter: unlocked ? 'none' : 'grayscale(1)', opacity: unlocked ? 1 : 0.3 }}>
                                                    {s.emoji}
                                                </span>
                                                {!unlocked && (
                                                    <div className="absolute top-4 right-4 w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                                                        <Lock size={13} className="text-[#8A7E73]" />
                                                    </div>
                                                )}
                                                {selected && (
                                                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-[#F95C4B] flex items-center justify-center shadow-lg">
                                                        <Check size={14} className="text-white" strokeWidth={3} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="text-[12px] font-black text-[#161415] tracking-tighter block">{s.name}</span>
                                                {unlocked ? (
                                                    <span className="text-[12px] font-bold text-[#5FA876] tracking-widest">已解鎖</span>
                                                ) : (
                                                    <>
                                                        <span className="text-[11px] font-medium text-[#8A7E73] block leading-snug mt-0.5">{s.unlockText}</span>
                                                        {/* 透明：進度條 + 目前/目標 */}
                                                        <div className="h-1 rounded-full bg-black/5 overflow-hidden mt-1.5">
                                                            <div className="h-full rounded-full bg-[#F95C4B]" style={{ width: `${s.progress}%` }} />
                                                        </div>
                                                        {s.target != null && (
                                                            <span className="text-[11px] font-bold text-[#8A7E73] block mt-1">
                                                                {Math.round(s.current ?? 0).toLocaleString()} / {s.target.toLocaleString()}{s.unit ? ` ${s.unit}` : ''}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Bar */}
                <div className="p-6 bg-white border-t border-black/5 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-[#8A7E73] uppercase">Selected</span>
                        <span className="text-xl font-black text-[#161415]">{activeStickers.length} <span className="text-xs text-[#8A7E73]">Stickers</span></span>
                    </div>
                    <motion.button {...pressProps('pill')} 
 onClick={() => { onSave ? onSave() : onClose(); }}
 className="px-8 py-4 rounded-full text-white text-[13px] font-black uppercase tracking-[0.2em] shadow-2xl"
 style={{
 background: 'linear-gradient(135deg, #F45948 0%, #F95C4B 50%, #E64D3D 100%)',
 boxShadow: '0 8px 24px rgba(249,92,75,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
 }}
 >
                        {actionText}
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}
