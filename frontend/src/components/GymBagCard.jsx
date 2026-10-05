import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Tag, X } from 'lucide-react';

const GymBagCard = ({ post, onToggleSave }) => {
    const {
        id,
        user,
        imageUrl,
        description,
        tags = [], // { id, x, y, brand, product, link }
        likes,
        isSaved
    } = post;

    const [showTags, setShowTags] = useState(false);
    const [activeTagId, setActiveTagId] = useState(null);

    const handleSaveClick = (e) => {
        e.stopPropagation();
        onToggleSave(id);
    };

    return (
        <div className="bg-white group rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {/* Image Container with Tag Interaction */}
            <div
                className="relative aspect-square bg-[#F5EFE7] overflow-hidden cursor-pointer"
                onClick={() => setShowTags(!showTags)}
            >
                <img loading="lazy" decoding="async"
                    src={imageUrl || 'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=1000&auto=format&fit=crop'}
                    alt="Gym Bag Flat Lay"
                    className="w-full h-full object-cover"
                />

                {/* Tag Toggle Hint */}
                <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2">
                    <Tag size={12} className="text-white" />
                    <span className="text-[11px] font-medium text-white">
                        {showTags ? 'Hide Tags' : 'Tap for details'}
                    </span>
                </div>

                {/* Tags Layer */}
                <AnimatePresence>
                    {showTags && tags.map((tag) => (
                        <motion.button
                            key={tag.id}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            style={{ left: `${tag.x}%`, top: `${tag.y}%` }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveTagId(activeTagId === tag.id ? null : tag.id);
                            }}
                        >
                            {/* Pulsing Dot */}
                            <div className="relative">
                                <div className="w-4 h-4 rounded-full bg-white shadow-lg border-2 border-[#262523] flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#262523]" />
                                </div>
                                <div className="absolute inset-0 rounded-full bg-white opacity-50 animate-ping" />
                            </div>

                            {/* Tag Details Popover */}
                            <AnimatePresence>
                                {activeTagId === tag.id && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 5, scale: 0.9 }}
                                        className="absolute top-6 left-1/2 -translate-x-1/2 w-48 bg-white p-3 rounded-xl shadow-xl border border-[#F5EFE7] z-20 pointer-events-auto"
                                    >
                                        <div className="text-xs font-bold text-[#262523] mb-0.5">{tag.brand}</div>
                                        <div className="text-[11px] text-[#8B7F72] mb-2">{tag.product}</div>
                                        <a
                                            href={tag.link || '#'}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block w-full py-1.5 text-center bg-[#262523] text-white text-[11px] font-bold rounded-lg hover:bg-[#403E3B]"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            View Product
                                        </a>
                                        {/* Arrow */}
                                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 border-t border-l border-[#F5EFE7]" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.button>
                    ))}
                </AnimatePresence>
            </div>

            {/* Content Body */}
            <div className="p-4">
                {/* User Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#E0D8D3] flex items-center justify-center overflow-hidden">
                            {user.avatar ? (
                                <img loading="lazy" decoding="async" src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xs font-bold text-[#8B7F72]">{user.name[0]}</span>
                            )}
                        </div>
                        <span className="text-sm font-bold text-[#262523]">{user.name}</span>
                    </div>
                    <motion.button {...pressProps('icon')} aria-label="收藏"
 onClick={handleSaveClick}
 className="p-2 -mr-2 rounded-full hover:bg-[#F5EFE7] transition-colors"
 >
                        <Bookmark
                            size={20}
                            className={isSaved ? "fill-[#C68E5D] text-[#C68E5D]" : "text-[#262523]"}
                        />
                    </motion.button>
                </div>

                {/* Description */}
                <p className="text-xs text-[#8B7F72] leading-relaxed line-clamp-2 mb-4">
                    {description}
                </p>

                {/* Tag List - Text Version */}
                <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                        <span
                            key={tag.id}
                            className="text-[11px] font-medium text-[#262523] px-2 py-1 bg-[#F5EFE7] rounded-md"
                        >
                            {tag.brand}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default GymBagCard;
