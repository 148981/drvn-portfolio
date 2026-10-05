import React, { useRef } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';

/**
 * Share Slide - "My Notes" Style
 * Redesigned: Vibrant, Playful, Not Monotonous
 */
const ShareSlide = ({ weekNumber, totalVolume, topExercise, muscleData }) => {
    const cardRef = useRef(null);

    const handleShare = async () => {
        // 🩹 L: 打包版走原生分享面板（WKWebView 無 Web Share API）
        try {
            if (window.webkit?.messageHandlers?.shareImage) {
                window.webkit.messageHandlers.shareImage.postMessage({
                    text: `Week ${weekNumber} Recap — Training Complete! Volume: ${totalVolume}kg.`,
                });
                return;
            }
        } catch (_) { /* 繼續走 navigator.share */ }
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Week ${weekNumber} Recap`,
                    text: `Training Complete! Volume: ${totalVolume}kg.`,
                    url: window.location.href,
                });
            } catch (error) {
                console.log('Error sharing:', error);
            }
        }
    };

    const getTopMuscle = () => {
        if (!muscleData) return 'Full Body';
        const sorted = Object.entries(muscleData).sort((a, b) => b[1] - a[1]);
        return sorted[0] ? sorted[0][0] : 'Full Body';
    };

    return (
        <div className="w-full h-full bg-[#09090B] flex flex-col items-center justify-center p-4">
            <motion.div
                ref={cardRef}
                className="relative w-full aspect-[3/5] bg-[#FFD66B] rounded-[36px] p-6 flex flex-col items-center justify-between shadow-2xl overflow-hidden border-4 border-black"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                {/* Decorative Background Elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF9F76] rounded-full blur-2xl opacity-50 -mr-10 -mt-10"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#B5D8F6] rounded-full blur-2xl opacity-50 -ml-16 -mb-16"></div>

                {/* Header Badge */}
                <div className="relative mt-4">
                    <div className="bg-black text-white px-6 py-2 rounded-full font-black text-lg tracking-widest uppercase transform -rotate-2">
                        WEEK {weekNumber}
                    </div>
                </div>

                {/* Main Stats "Sticker" */}
                <div className="relative bg-white border-4 border-black rounded-[28px] p-6 w-full transform rotate-2 shadow-xl">
                    <div className="text-center">
                        <p className="text-xs font-bold text-black/50 uppercase tracking-widest mb-1">Total Volume</p>
                        <h2 className="text-5xl font-black text-black leading-none mb-4">{totalVolume}<span className="text-lg text-black/50">kg</span></h2>

                        <div className="h-1 w-full bg-black/10 rounded-full mb-4"></div>

                        <div className="grid grid-cols-2 gap-2 text-left">
                            <div>
                                <p className="text-[9px] font-bold text-black/50 uppercase">Top Muscle</p>
                                <p className="text-xl font-bold text-black capitalize">{getTopMuscle()}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-black/50 uppercase">MVP Move</p>
                                <p className="text-xl font-bold text-black leading-tight bg-[#B5D8F6] inline-block px-1 rounded transform -rotate-1">{topExercise?.name || 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    {/* "Certified" Badge */}
                    <div className="absolute -bottom-6 -right-4 w-20 h-20 bg-[#FF9F76] rounded-full flex items-center justify-center border-4 border-black transform rotate-12">
                        <span className="text-[11px] font-black text-black text-center leading-none transform -rotate-12">GOAL<br />CRUSHED</span>
                    </div>
                </div>

                {/* Footer Section */}
                <div className="w-full text-center space-y-4 mb-4 relative z-10">
                    <p className="text-black font-bold italic text-lg">"Another week stronger."</p>

                    <motion.button {...pressProps('cta')}
 onClick={handleShare}
 className="w-full py-4 bg-black text-white rounded-[18px] font-black text-xl uppercase tracking-widest hover:scale-105 flex items-center justify-center gap-2 shadow-lg"
 >
                        <Share2 size={20} /> Share Stats
                    </motion.button>
                    <p className="text-[11px] font-bold text-black/40">AI FITNESS COACH • {new Date().getFullYear()}</p>
                </div>

            </motion.div>
        </div>
    );
};

export default ShareSlide;
