import React from 'react';
import { motion } from 'framer-motion';

/**
 * Story Progress Bar - Instagram/Spotify-style
 * Shows progress across multiple slides
 */
const StoryProgress = ({ totalSlides, currentSlide, onSlideClick, autoPlayDuration = 5000 }) => {
    return (
        <div className="fixed top-0 left-0 right-0 z-50 p-4">
            <div className="flex gap-1">
                {Array.from({ length: totalSlides }).map((_, index) => (
                    <div
                        key={index}
                        className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer"
                        onClick={() => onSlideClick && onSlideClick(index)}
                    >
                        <motion.div
                            className="h-full bg-white rounded-full"
                            initial={{ width: '0%' }}
                            animate={{
                                width: index < currentSlide
                                    ? '100%'
                                    : index === currentSlide
                                        ? '100%'
                                        : '0%'
                            }}
                            transition={{
                                duration: index === currentSlide ? autoPlayDuration / 1000 : 0.3,
                                ease: index === currentSlide ? 'linear' : 'easeOut'
                            }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StoryProgress;
