import React, { useEffect, useState, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { Trophy, Sparkles, TrendingUp, X } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { motion, AnimatePresence } from 'framer-motion';

/** PR 數字 CountUp */
function usePRCountUp(target, active, duration = 900) {
    const [value, setValue] = useState(0);
    const rafRef = useRef(null);
    useEffect(() => {
        if (!active) { setValue(0); return; }
        let startTime = null;
        const step = (ts) => {
            if (!startTime) startTime = ts;
            const p = Math.min((ts - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(parseFloat((target * eased).toFixed(1)));
            if (p < 1) rafRef.current = requestAnimationFrame(step);
            else setValue(target);
        };
        rafRef.current = requestAnimationFrame(step);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [target, active, duration]);
    return value;
}

const PRNotification = ({ isVisible, onClose, prData }) => {
    const [confetti, setConfetti] = useState([]);

    useEffect(() => {
        if (isVisible) {
            const particles = [];
            for (let i = 0; i < 50; i++) {
                particles.push({
                    id: i,
                    left: Math.random() * 100,
                    delay: Math.random() * 0.5,
                    duration: 2 + Math.random() * 2,
                    rotation: Math.random() * 360,
                    color: ['#D4A853', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'][Math.floor(Math.random() * 5)]
                });
            }
            setConfetti(particles);

            const timer = setTimeout(() => {
                onClose();
            }, 6000);

            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);

    // 注意：hooks 必須無條件呼叫，提早 return 放最後（修正 rules-of-hooks）
    const exerciseName = prData?.exercise || prData?.name;
    const oldPR = prData?.previous_best || prData?.oldPR || prData?.old_pr;
    const newPR = prData?.current_score || prData?.newPR || prData?.new_pr;
    const improvement = prData?.improvement || (newPR - oldPR);

    const animatedNewPR = usePRCountUp(newPR || 0, isVisible, 1000);

    if (!prData) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                >
                    {confetti.map((particle) => (
                        <motion.div
                            key={particle.id}
                            initial={{
                                top: '-10%',
                                left: `${particle.left}%`,
                                opacity: 1,
                                rotate: 0
                            }}
                            animate={{
                                top: '110%',
                                opacity: 0,
                                rotate: particle.rotation
                            }}
                            transition={{
                                duration: particle.duration,
                                delay: particle.delay,
                                ease: 'easeOut'
                            }}
                            className="absolute w-3 h-3 rounded-sm pointer-events-none"
                            style={{ backgroundColor: particle.color }}
                        />
                    ))}

                    <motion.div
                        initial={{ y: 80, opacity: 0, scale: 0.92 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 60, opacity: 0, scale: 0.88 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                        className="relative bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 p-1 rounded-3xl shadow-2xl max-w-md w-full mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-[#1A1D1F] rounded-3xl p-8 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-transparent rounded-3xl"></div>

                            <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
 >
                                <X size={24} />
                            </motion.button>

                            <div className="relative z-10 text-center">
                                <motion.div
                                    animate={{
                                        scale: [1, 1.2, 1],
                                        rotate: [0, -10, 10, -10, 0]
                                    }}
                                    transition={{
                                        duration: 0.6,
                                        repeat: Infinity,
                                        repeatDelay: 1
                                    }}
                                    className="inline-block mb-4"
                                >
                                    <Trophy size={64} className="text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />
                                </motion.div>

                                <h2 className="text-2xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                                    <Sparkles size={20} className="text-yellow-300" />
                                    PR 突破！
                                    <Sparkles size={20} className="text-yellow-300" />
                                </h2>

                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <Dumbbell size={18} className="text-yellow-400" />
                                    <p className="text-lg font-semibold text-white">{exerciseName}</p>
                                </div>

                                <div className="flex items-center justify-center gap-6 my-6">
                                    <div className="text-center">
                                        <div className="text-sm text-white/60 mb-1">舊紀錄</div>
                                        <div className="text-2xl font-bold text-white/80">{oldPR}kg</div>
                                    </div>

                                    <TrendingUp size={32} className="text-green-400" />

                                    <div className="text-center">
                                        <div className="text-sm text-white/60 mb-1">新紀錄</div>
                                        <div className="text-4xl font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]">
                                            {animatedNewPR}kg
                                        </div>
                                    </div>
                                </div>

                                <div className="inline-block bg-green-500/20 border border-green-500/30 rounded-full px-6 py-2 mb-4">
                                    <span className="text-green-400 font-semibold">
                                        +{improvement}kg 進步！🚀
                                    </span>
                                </div>

                                <p className="text-white/80 text-sm">
                                    保持下去！你每天都在變得更強！
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default PRNotification;
