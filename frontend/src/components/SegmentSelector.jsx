import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { X, Trophy, MapPin, TrendingUp, Circle, CheckCircle2 } from 'lucide-react';

const SegmentSelector = ({ segments = [], selectedIds = [], onToggle, onClose, onStartRun }) => {

    // Dynamic Card Colors for List to match "My Notes" aesthetic
    const cardColors = ['#FFD66B', '#FF9F76', '#B5D8F6', '#F4F4F5'];

    return (
        <div className="fixed inset-0 z-[1000001] flex flex-col bg-[#09090B] text-white overflow-hidden animate-in slide-in-from-bottom-5 duration-300 mx-auto max-w-[430px] shadow-[0_0_0_100vw_rgba(0,0,0,0.5)]">
            {/* Header */}
            <div
                className="pb-4 px-6 flex items-start justify-between bg-[#09090B] shrink-0"
                style={{ paddingTop: 'max(32px, env(safe-area-inset-top))' }}
            >
                <div>
                    <h2 className="text-4xl font-bold text-white leading-none tracking-tight" style={{ fontFamily: '"Knewave", system-ui' }}>
                        Challenge<br />Route
                    </h2>
                    <p className="text-white/60 text-sm mt-2 font-medium">
                        Select routes to challenge in this run.
                    </p>
                </div>

                <motion.button {...pressProps('icon')} aria-label="關閉"
 onClick={onClose}
 className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white hover:bg-white/10 transition-colors bg-white/5 backdrop-blur-md"
 >
                    <X size={24} />
                </motion.button>
            </div>

            {/* Selection Status Bar */}
            <div className="px-6 mb-4 shrink-0">
                <div className="bg-white/5 rounded-[18px] p-4 border border-white/10 flex items-center justify-between backdrop-blur-md">
                    <span className="text-sm font-bold text-white/80">
                        {selectedIds.length} Selected
                    </span>
                    {selectedIds.length > 0 && (
                        <span className="text-xs font-bold text-[#FFD66B] uppercase tracking-wider">
                            Ready to Run
                        </span>
                    )}
                </div>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-3 custom-scrollbar">
                {segments.length === 0 ? (
                    <div className="text-white/50 text-center py-20 flex flex-col items-center gap-4">
                        <MapPin size={48} strokeWidth={1} />
                        <p>No nearby segments found.</p>
                    </div>
                ) : (
                    segments.map((seg, idx) => {
                        const isSelected = selectedIds.includes(seg.segment_id);
                        const cardColor = isSelected ? '#FFFFFF' : cardColors[idx % cardColors.length];
                        const textColor = isSelected ? '#000000' : '#000000'; // Always black text on these colored cards looks best

                        return (
                            <div
                                key={seg.segment_id}
                                onClick={() => onToggle(seg.segment_id)}
                                className={`rounded-[28px] p-5 cursor-pointer transition-all active:scale-95 border-4 relative overflow-hidden group ${isSelected
                                    ? 'border-[#000000] scale-[1.02]'
                                    : 'border-transparent opacity-90 hover:opacity-100'
                                    }`}
                                style={{
                                    backgroundColor: cardColor
                                }}
                            >
                                {/* Selection Indicator Overlay */}
                                <div className="absolute top-4 right-4 z-10">
                                    {isSelected ? (
                                        <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shadow-lg transform transition-transform scale-100">
                                            <CheckCircle2 size={20} />
                                        </div>
                                    ) : (
                                        <div className="w-8 h-8 rounded-full border-2 border-black/20 group-hover:border-black/50 transition-colors" />
                                    )}
                                </div>

                                <div className="flex flex-col gap-1 pr-10">
                                    <h3
                                        className="text-2xl font-black leading-tight break-words"
                                        style={{ color: textColor }}
                                    >
                                        {seg.name}
                                    </h3>

                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="px-2 py-1 rounded-full bg-black/5 flex items-center gap-1">
                                            <MapPin size={10} className="text-black/60" />
                                            <span className="text-[11px] font-bold text-black/60">
                                                {(seg.distance_meters / 1000).toFixed(2)}km
                                            </span>
                                        </div>
                                        <div className="px-2 py-1 rounded-full bg-black/5 flex items-center gap-1">
                                            <Trophy size={10} className="text-black/60" />
                                            <span className="text-[11px] font-bold text-black/60">
                                                Rank #{Math.floor(Math.random() * 20) + 1}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Mini visual bar for difficulty or just decor */}
                                    <div className="flex gap-1 mt-3 opacity-20">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className="h-1 flex-1 rounded-full bg-black" />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Bottom Action Bar */}
            <div
                className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#09090B] via-[#09090B] to-transparent z-[100]"
                style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}
            >
                <motion.button {...pressProps('pill')}
 onClick={onStartRun}
 className="w-full py-5 rounded-[36px] bg-[#F95C4B] text-white font-black text-xl shadow-2xl flex items-center justify-center gap-2 hover:scale-[1.02]"
 style={{
 boxShadow: '0 10px 40px -10px rgba(255, 69, 0, 0.5)',
 pointerEvents: 'auto',
 touchAction: 'none'
 }}
 >
                    START RUN
                    <span className="bg-white text-[#F95C4B] text-xs px-2 py-1 rounded-full font-bold">
                        {selectedIds.length}
                    </span>
                </motion.button>
            </div>
        </div>
    );
};

export default SegmentSelector;
