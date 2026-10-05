import React, { useState, useEffect } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { Brain, ArrowRight, FileText, Lock } from 'lucide-react';

/**
 * AICoachSlide - "My Notes" Style
 * Orange/Black Card, "Top Secret/Confidential" File Aesthetic
 */
const AICoachSlide = ({ aiAdvice }) => {

    // Typewriter effect state
    const [displayedText, setDisplayedText] = useState("");
    const fullText = aiAdvice?.detail || aiAdvice?.message || "Great work! Keep pushing for progress.";

    useEffect(() => {
        let index = 0;
        setDisplayedText("");
        const intervalId = setInterval(() => {
            setDisplayedText((prev) => prev + fullText.charAt(index));
            index++;
            if (index === fullText.length) clearInterval(intervalId);
        }, 30);
        return () => clearInterval(intervalId);
    }, [fullText]);

    return (
        <div className="w-full h-full bg-[#09090B] flex flex-col items-center justify-center p-4">
            <motion.div
                className="relative w-full aspect-[3/5] bg-[#FF9F76] rounded-[36px] p-6 flex flex-col overflow-hidden shadow-2xl border-4 border-black"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                {/* Header - "Confidential" Logic */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center border-b-4 border-white/20">
                            <Brain size={24} color="white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-black leading-none">
                                教練<br />專區
                            </h2>
                        </div>
                    </div>
                    <div className="border-2 border-black rounded px-2 py-0.5 transform rotate-3">
                        <span className="text-[9px] font-black uppercase text-black">Analysis</span>
                    </div>
                </div>

                {/* Message Bubble - File Folder Style */}
                <div className="flex-1 bg-[#F4F4F5] rounded-tl-none rounded-tr-3xl rounded-br-3xl rounded-bl-3xl p-6 border-4 border-black mb-6 shadow-[8px_8px_0px_rgba(0,0,0,0.8)] relative flex flex-col justify-between">
                    {/* Tab Top */}
                    <div className="absolute -top-[16px] left-[-4px] bg-black text-white px-4 py-1 rounded-t-xl border-t-2 border-l-2 border-r-2 border-black">
                        <span className="text-[9px] font-bold uppercase tracking-widest">INSIGHTS.TXT</span>
                    </div>

                    <div className="mt-4 overflow-y-auto max-h-[220px]">
                        <p className="text-xl font-bold text-black leading-relaxed font-mono">
                            {displayedText}
                            <span className="inline-block w-3 h-5 bg-black ml-1 animate-pulse align-middle"></span>
                        </p>
                    </div>
                </div>

                {/* Footer Action */}
                {aiAdvice?.onViewDetails && (
                    <motion.button {...pressProps('row')}
 onClick={(e) => {
 e.stopPropagation();
 aiAdvice.onViewDetails();
 }}
 className="w-full py-4 bg-black text-white rounded-[18px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] shadow-lg border-2 border-white/20"
 >
                        SEE FULL PLAN <ArrowRight size={20} />
                    </motion.button>
                )}

            </motion.div>
        </div>
    );
};

export default AICoachSlide;
