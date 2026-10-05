import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Footprints } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCurrentShoe } from '../utils/shoeManager';
import { brandColors as C } from '../utils/colors';

// iOS 26 Liquid Glass container — 統一沿用 App 的 coral / ink 色系
const GlassCard = ({ children, onClick }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onClick}
        className="rounded-[28px] p-6 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.62) 0%, rgba(244,240,233,0.46) 100%)',
            backdropFilter: 'blur(22px) saturate(170%)',
            WebkitBackdropFilter: 'blur(22px) saturate(170%)',
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 40px -16px rgba(22,20,21,0.22), 0 2px 6px -4px rgba(22,20,21,0.18)',
            color: C.ink,
        }}
    >
        {/* 玻璃折射柔光 — coral tint */}
        <div
            className="absolute -top-10 -right-8 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(249,92,75,0.16), transparent 70%)', filter: 'blur(30px)' }}
        />
        {children}
    </motion.div>
);

const Header = () => (
    <div className="flex justify-between items-start mb-5 relative z-10">
        <div>
            <h2 className="text-xl font-black tracking-tight" style={{ color: C.ink }}>
                Shoe Mileage
            </h2>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mt-1" style={{ color: C.coral }}>
                Gear Lifecycle
            </p>
        </div>
        {/* 右上角箭頭：暗示可點擊進入裝備庫 */}
        <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.7)' }}
        >
            <ChevronRight size={16} style={{ color: C.ink }} />
        </div>
    </div>
);

const ShoeTrackerCard = () => {
    const navigate = useNavigate();
    const currentShoe = getCurrentShoe();
    const goGarage = () => navigate('/gear-garage-mobile');

    // ── 空狀態：尚未選裝備 → 原位貼心文案 + 明確 CTA ──
    if (!currentShoe) {
        return (
            <GlassCard onClick={goGarage}>
                <Header />
                <div className="relative z-10 flex flex-col items-center text-center py-3">
                    <div
                        className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                        style={{ background: 'rgba(249,92,75,0.12)', border: '1px solid rgba(249,92,75,0.25)' }}
                    >
                        <Footprints size={22} style={{ color: C.coral }} />
                    </div>
                    <p className="text-[15px] font-black" style={{ color: C.ink }}>
                        還沒選跑鞋
                    </p>
                    <p className="text-[12px] mt-1.5 leading-relaxed font-medium" style={{ color: 'rgba(22,20,21,0.5)', maxWidth: 230 }}>
                        綁定一雙跑鞋，之後每次跑步的里程都會自動累積，到達磨損上限時也會提醒你換鞋。
                    </p>
                    <div
                        className="mt-5 px-7 py-3 rounded-full"
                        style={{
                            background: 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)',
                            color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
                            boxShadow: '0 8px 22px rgba(249,92,75,0.4)',
                        }}
                    >
                        選擇跑鞋
                    </div>
                </div>
            </GlassCard>
        );
    }

    // ── 有選裝備：顯示磨損進度 ──
    const name = `${currentShoe.brand} ${currentShoe.model}`;
    const mileage = currentShoe.mileage || 0;
    const maxMileage = currentShoe.maxMileage || 800;
    const emoji = (currentShoe.imageUrl && currentShoe.imageUrl.length <= 4) ? currentShoe.imageUrl : '👟';
    const percentage = maxMileage > 0 ? Math.min((mileage / maxMileage) * 100, 100) : 0;
    const remaining = Math.max(maxMileage - mileage, 0);
    const needsReplacement = percentage >= 80;
    const barColor = needsReplacement ? C.coralDeep : C.coral;

    return (
        <GlassCard onClick={goGarage}>
            <Header />

            <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className="text-4xl">{emoji}</div>
                <div className="flex-1 min-w-0">
                    <p className="text-lg font-black truncate" style={{ color: C.ink }}>
                        {name}
                    </p>
                    <p className="text-xs font-bold mt-0.5" style={{ color: 'rgba(22,20,21,0.45)' }}>
                        {mileage.toFixed(1)} / {maxMileage} km
                    </p>
                </div>
            </div>

            {/* 磨損進度條 — 玻璃軌道 + coral 填充 */}
            <div
                className="relative h-8 rounded-full overflow-hidden mb-3 relative z-10"
                style={{
                    background: 'rgba(255,255,255,0.4)',
                    border: '1px solid rgba(255,255,255,0.55)',
                    boxShadow: 'inset 0 1px 3px rgba(22,20,21,0.10)',
                }}
            >
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                        background: `linear-gradient(90deg, ${C.coral} 0%, ${barColor} 100%)`,
                        boxShadow: needsReplacement ? `0 0 12px ${C.coralDeep}` : 'none',
                    }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-black" style={{ color: percentage > 50 ? '#FFFFFF' : C.ink }}>
                        {percentage.toFixed(0)}%
                    </span>
                </div>
            </div>

            <div className="flex items-center justify-between text-xs relative z-10">
                <span className="font-bold" style={{ color: 'rgba(22,20,21,0.45)' }}>
                    剩餘 {remaining.toFixed(1)} km
                </span>
                {needsReplacement && (
                    <span className="px-2 py-1 rounded-md font-black" style={{ backgroundColor: 'rgba(217,64,48,0.12)', color: C.coralDeep }}>
                        ⚠️ 建議換鞋
                    </span>
                )}
            </div>
        </GlassCard>
    );
};

export default ShoeTrackerCard;
