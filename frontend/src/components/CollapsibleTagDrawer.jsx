import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Tag } from 'lucide-react';

/**
 * CollapsibleTagDrawer - LOEWE Edition
 * Morandi Color Palette for Tags
 */
const CollapsibleTagDrawer = ({ selectedTags = [], onTagToggle, allTags = [], defaultExpanded = true }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    // Morandi Palette Cycler
    const morandiColors = [
        { bg: 'rgba(143, 158, 139, 0.15)', border: '#8F9E8B', text: '#8F9E8B' }, // Sage
        { bg: 'rgba(123, 141, 147, 0.15)', border: '#7B8D93', text: '#7B8D93' }, // Dusty Blue
        { bg: 'rgba(214, 198, 185, 0.15)', border: '#D6C6B9', text: '#D6C6B9' }, // Clay
        { bg: 'rgba(156, 140, 116, 0.15)', border: '#9C8C74', text: '#9C8C74' }, // Khaki
    ];

    const getTagStyle = (index) => morandiColors[index % morandiColors.length];

    // Categorize tags
    const tagCategories = {
        'Body Structure': ['#改善圓肩', '#駝背矯正', '#骨盆前傾', '#腰痠背痛'],
        'Muscle Building': ['#增強胸肌', '#壯大背肌', '#強化核心', '#粗壯手臂', '#練出腹肌', '#腿部訓練', '#肩膀增肌'],
        'Performance': ['#提升臥推', '#深蹲進步', '#硬舉突破', '#爆發力'],
        'Shaping': ['#消除啤酒肚', '#甩掉蝴蝶袖', '#緊實大腿', '#翹臀計劃']
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full font-serif"
        >
            {/* Collapsed State - Leather Strip */}
            <motion.div
                onClick={() => setIsExpanded(!isExpanded)}
                className="relative bg-[#33302C] p-4 rounded-xl cursor-pointer border border-[#E0D8D3]/5 overflow-hidden"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
            >
                {/* Texture Overlay */}
                <div className="absolute inset-0 opacity-40 pointer-events-none mix-blend-overlay"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stub='7'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E")`
                    }}
                />

                <div className="relative z-10 flex items-center justify-between">
                    {/* Selected Tags Pills */}
                    <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#E0D8D3] opacity-60 mr-2 whitespace-nowrap">
                            Selected ({selectedTags.length})
                        </span>

                        {selectedTags.length > 0 ? (
                            selectedTags.slice(0, 3).map((tag, index) => {
                                const style = role => getTagStyle(index);
                                return (
                                    <motion.div
                                        key={tag}
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="px-3 py-1 rounded-full border flex items-center gap-1 whitespace-nowrap"
                                        style={{
                                            backgroundColor: morandiColors[index % 4].bg,
                                            borderColor: morandiColors[index % 4].border,
                                        }}
                                    >
                                        <span className="text-[11px] font-bold tracking-wide" style={{ color: morandiColors[index % 4].text }}>
                                            {tag}
                                        </span>
                                    </motion.div>
                                );
                            })
                        ) : (
                            <span className="text-sm text-[#E0D8D3] opacity-40 italic">Select your focus areas...</span>
                        )}

                        {selectedTags.length > 3 && (
                            <span className="text-xs text-[#C68E5D] font-bold ml-1">
                                +{selectedTags.length - 3}
                            </span>
                        )}
                    </div>

                    {/* Expand Icon */}
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                        className="ml-4"
                    >
                        <ChevronDown size={20} className="text-[#C68E5D]" />
                    </motion.div>
                </div>
            </motion.div>

            {/* Expanded State - Tag Selection Panel */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 p-6 rounded-xl bg-[#262523] border border-[#E0D8D3]/5 shadow-xl">
                            <div className="space-y-6">
                                {Object.entries(tagCategories).map(([category, tags], catIndex) => (
                                    <div key={category}>
                                        {/* Category Label */}
                                        <h4 className="flex items-center gap-2 mb-3">
                                            <div className="w-1 h-3 bg-[#C68E5D] rounded-full"></div>
                                            <span className="text-xs font-bold uppercase tracking-widest text-[#E0D8D3]">{category}</span>
                                        </h4>

                                        {/* Tags Grid */}
                                        <div className="flex flex-wrap gap-2">
                                            {tags.map((tag, tagIndex) => {
                                                const isSelected = selectedTags.includes(tag);
                                                // Deterministic random-ish color assignment based on tag string length
                                                const colorIndex = tag.length % 4;
                                                const color = morandiColors[colorIndex];

                                                return (
                                                    <motion.button
                                                        key={tag}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onTagToggle(tag);
                                                        }}
                                                        className={`
                                                            px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
                                                            ${isSelected ? '' : 'bg-transparent border-[#E0D8D3]/10 text-[#E0D8D3]/60 hover:border-[#E0D8D3]/30'}
                                                        `}
                                                        style={isSelected ? {
                                                            backgroundColor: color.bg,
                                                            borderColor: color.border,
                                                            color: color.text
                                                        } : {}}
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                    >
                                                        {tag}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Confirm Button */}
                            <motion.button
                                onClick={() => setIsExpanded(false)}
                                className="mt-6 w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest bg-[#C68E5D] text-[#262523] hover:bg-[#E0D8D3] transition-colors"
                                whileTap={{ scale: 0.98 }}
                            >
                                Confirm Selection ({selectedTags.length})
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default CollapsibleTagDrawer;
