import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, User } from 'lucide-react';

const CoachQACard = ({ session }) => {
    const {
        theme,
        coach,
        qaPairs,
        status
    } = session;

    const [expandedIndex, setExpandedIndex] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [questionText, setQuestionText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Fixed Q&A Library for quick selection
    const FAQ_LIBRARY = [
        "深蹲時腰會痠是正常的嗎？",
        "每週應該練幾次腿？",
        "做深蹲需要穿舉重鞋嗎？",
        "如何改善腳踝活動度？"
    ];

    const toggleQuestion = (index) => {
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    const handleSubmit = () => {
        if (!questionText.trim()) return;

        setIsSubmitting(true);
        // Simulate API call
        setTimeout(() => {
            setIsSubmitting(false);
            setShowSuccess(true);
            setQuestionText('');

            // Close modal after success message
            setTimeout(() => {
                setShowSuccess(false);
                setIsModalOpen(false);
            }, 1500);
        }, 1000);
    };

    return (
        <>
            <div className="bg-[#F5EFE7] rounded-3xl overflow-hidden shadow-lg relative">
                {/* Header */}
                <div className="p-6 border-b border-[#262523]/10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C68E5D]/10 border border-[#C68E5D]/30 mb-3">
                        <span className="text-xs font-bold text-[#C68E5D] uppercase tracking-wider">
                            {status === 'open' ? '📝 Open for Questions' : '✓ Closed'}
                        </span>
                    </div>
                    <h2 className="text-2xl font-serif text-[#262523] mb-2">
                        {theme}
                    </h2>
                    <p className="text-sm text-[#8B7F72]">
                        本週教練問答
                    </p>
                </div>

                {/* Magazine Layout: Coach Photo + Q&A */}
                <div className="grid md:grid-cols-[200px_1fr] gap-6 p-6">
                    {/* Coach Photo - Left Column */}
                    <div className="flex flex-col items-center">
                        <div className="relative w-40 h-40 rounded-[18px] overflow-hidden mb-4 shadow-xl">
                            {coach.photo_url ? (
                                <img loading="lazy" decoding="async"
                                    src={coach.photo_url}
                                    alt={coach.name}
                                    className="w-full h-full object-cover"
                                    style={{ filter: 'grayscale(100%) contrast(1.1)' }}
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[#8B7F72] to-[#262523] flex items-center justify-center">
                                    <User size={48} className="text-[#F5EFE7]" />
                                </div>
                            )}
                        </div>
                        <h3 className="text-lg font-serif text-[#262523] text-center mb-1">
                            {coach.name}
                        </h3>
                        <p className="text-xs text-[#8B7F72] text-center">
                            {coach.title}
                        </p>
                    </div>

                    {/* Q&A Accordion - Right Column */}
                    <div className="space-y-3">
                        {qaPairs.map((qa, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(index, 6) * 0.1 }}
                                className="bg-white/50 rounded-[18px] border border-[#262523]/5 overflow-hidden"
                            >
                                {/* Question Header */}
                                <motion.button {...pressProps('cta')}
 onClick={() => toggleQuestion(index)}
 className="w-full p-4 flex items-start justify-between gap-4 hover:bg-white/30 transition-colors text-left"
 >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            {qa.featured && (
                                                <span className="px-2 py-0.5 rounded-md bg-[#C68E5D]/20 text-[#C68E5D] text-[9px] font-bold uppercase">
                                                    Featured
                                                </span>
                                            )}
                                            <span className="text-xs text-[#8B7F72]">
                                                {qa.asker_name}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-[#262523]">
                                            {qa.question}
                                        </p>
                                    </div>
                                    {expandedIndex === index ? (
                                        <ChevronUp size={20} className="text-[#8B7F72] flex-shrink-0 mt-1" />
                                    ) : (
                                        <ChevronDown size={20} className="text-[#8B7F72] flex-shrink-0 mt-1" />
                                    )}
                                </motion.button>

                                {/* Answer - Accordion Content */}
                                <AnimatePresence>
                                    {expandedIndex === index && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-4 pb-4 pt-2 border-t border-[#262523]/5">
                                                <div className="flex gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-[#C68E5D]/20 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-xs font-bold text-[#C68E5D]">A</span>
                                                    </div>
                                                    <p className="text-sm text-[#262523] leading-relaxed font-serif italic">
                                                        "{qa.answer}"
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Submit Question Section */}
                {status === 'open' && (
                    <div className="p-6 bg-white/30 border-t border-[#262523]/10">
                        <p className="text-xs text-[#8B7F72] text-center mb-3">
                            本週主題：{theme}
                        </p>
                        <motion.button {...pressProps('row')}
 onClick={() => setIsModalOpen(true)}
 className="w-full py-3 px-6 rounded-xl bg-[#C68E5D] text-white font-semibold text-sm hover:bg-[#B67B4A] transition-colors shadow-lg shadow-[#C68E5D]/20 "
 >
                            提交問題
                        </motion.button>
                    </div>
                )}
            </div>

            {/* Submission Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg bg-[#F5EFE7] rounded-3xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-6">
                                <h3 className="text-xl font-serif text-[#262523] mb-1">
                                    Ask the Coach
                                </h3>
                                <p className="text-sm text-[#8B7F72] mb-6">
                                    向 {coach.name} 提問
                                </p>

                                {showSuccess ? (
                                    <div className="py-8 text-center">
                                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 text-2xl">
                                            ✓
                                        </div>
                                        <p className="text-[#262523] font-medium">問題已提交！</p>
                                        <p className="text-xs text-[#8B7F72] mt-2">教練審核後將會通知您</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* FAQ Chips */}
                                        <div>
                                            <p className="text-xs font-bold text-[#C68E5D] uppercase tracking-wider mb-2">
                                                常見問題 (點擊帶入)
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {FAQ_LIBRARY.map((q, idx) => (
                                                    <motion.button {...pressProps('row')}
 key={idx}
 onClick={() => setQuestionText(q)}
 className="px-3 py-1.5 rounded-lg bg-white border border-[#C68E5D]/20 text-xs text-[#594D46] hover:bg-[#C68E5D]/10 hover:border-[#C68E5D] text-left"
 >
                                                        {q}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Custom Input */}
                                        <div>
                                            <label className="text-xs font-bold text-[#262523] uppercase tracking-wider mb-2 block">
                                                您的問題
                                            </label>
                                            <textarea
                                                value={questionText}
                                                onChange={(e) => setQuestionText(e.target.value)}
                                                placeholder="請輸入您想問的問題..."
                                                className="w-full h-32 p-4 rounded-xl bg-white border border-[#262523]/10 focus:outline-none focus:border-[#C68E5D] text-[#262523] resize-none text-sm placeholder:text-[#8B7F72]/50"
                                            />
                                        </div>

                                        <div className="flex gap-3 mt-6">
                                            <motion.button {...pressProps('cta')}
 onClick={() => setIsModalOpen(false)}
 className="flex-1 py-3 px-4 rounded-xl bg-transparent border border-[#262523]/10 text-[#8B7F72] font-semibold text-sm hover:bg-[#262523]/5 transition-colors"
 >
                                                取消
                                            </motion.button>
                                            <motion.button {...pressProps('cta')}
 onClick={handleSubmit}
 disabled={!questionText.trim() || isSubmitting}
 className="flex-1 py-3 px-4 rounded-xl bg-[#C68E5D] text-white font-semibold text-sm hover:bg-[#B67B4A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
 >
                                                {isSubmitting ? (
                                                    <>
                                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        提交中...
                                                    </>
                                                ) : '發送問題'}
                                            </motion.button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default CoachQACard;
