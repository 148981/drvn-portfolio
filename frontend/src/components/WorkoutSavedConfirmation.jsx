import React, { useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowRight } from 'lucide-react';

const WorkoutSavedConfirmation = ({ isOpen, onComplete }) => {
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                onComplete();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isOpen, onComplete]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[20000000] bg-[#161415] flex flex-col items-center justify-center p-8"
                >
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ 
                            type: "spring",
                            damping: 20,
                            stiffness: 100,
                            delay: 0.2
                        }}
                        className="flex flex-col items-center text-center"
                    >
                        <div className="w-24 h-24 rounded-full bg-[#F95C4B] flex items-center justify-center mb-8 shadow-2xl shadow-[#F95C4B]/20">
                            <CheckCircle size={48} className="text-white" strokeWidth={3} />
                        </div>

                        <h2 className="text-4xl font-black italic text-white mb-4 tracking-tighter">
                            SAVED TO DRVN
                        </h2>
                        
                        <p className="text-[#F6F4F1]/60 text-sm font-bold tracking-widest uppercase mb-12">
                            Your performance has been recorded
                        </p>

                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 2.5, ease: "linear" }}
                            className="h-1 bg-[#F95C4B] rounded-full max-w-[200px] mb-8"
                        />

                        <motion.button {...pressProps('row')} 
 onClick={onComplete}
 className="flex items-center gap-2 text-white/40 text-[9px] font-black uppercase tracking-[0.3em] hover:text-white transition-colors"
 >
                            Continue <ArrowRight size={12} />
                        </motion.button>
                    </motion.div>

                    {/* Background Decorative Elements */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#F95C4B]/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#E4DED2]/5 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/3" />
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default WorkoutSavedConfirmation;
