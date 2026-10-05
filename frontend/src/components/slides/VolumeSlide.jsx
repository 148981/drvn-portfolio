import React from 'react';
import { motion } from 'framer-motion';

/**
 * Volume Slide - "My Notes" Style
 * Yellow Card
 */
const VolumeSlide = ({ totalVolume, volumeChange }) => {
    // Determine comparison object based on volume
    // Determine comparison object based on volume
    const getComparison = (volume = 0) => {
        if (!volume) volume = 0;

        // Approximate weights in kg
        const milestones = [
            { threshold: 100000, object: "Blue Whale 🐋", weight: "150,000kg" },
            { threshold: 75000, object: "Space Shuttle 🚀", weight: "78,000kg" },
            { threshold: 50000, object: "Main Battle Tank 🛡️", weight: "60,000kg" },
            { threshold: 30000, object: "Humpback Whale 🐋", weight: "30,000kg" },
            { threshold: 20000, object: "Fire Truck 🚒", weight: "22,000kg" },
            { threshold: 12000, object: "City Bus 🚌", weight: "12,000kg" },
            { threshold: 6000, object: "African Elephant 🐘", weight: "6,000kg" },
            { threshold: 3500, object: "Monster Truck 🛻", weight: "4,500kg" },
            { threshold: 2300, object: "White Rhino 🦏", weight: "2,300kg" },
            { threshold: 1500, object: "Compact Sedan 🚗", weight: "1,400kg" },
            { threshold: 800, object: "Grand Piano 🎹", weight: "400kg" },
            { threshold: 400, object: "Grizzly Bear 🐻", weight: "250kg" },
            { threshold: 200, object: "Refrigerator ❄️", weight: "100kg" },
            { threshold: 0, object: "Washing Machine 🧺", weight: "70kg" }
        ];

        // Find the heaviest milestone exceeded or matched
        const match = milestones.find(m => volume >= m.threshold);
        // Extract icon from string if needed, or just return as is
        // Splitting simple emoji logic for checking
        const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
        const iconMatch = match.object.match(emojiRegex);
        const icon = iconMatch ? iconMatch[0] : "📦";
        const name = match.object.replace(emojiRegex, '').trim();

        return { object: name, icon, approxWeight: match.weight };
    };

    const safeVolume = Number(totalVolume) || 0;
    const comparison = getComparison(safeVolume);
    const isPositive = (volumeChange || 0) >= 0;

    return (
        <div className="w-full h-full bg-[#09090B] flex flex-col items-center justify-center p-4">
            <motion.div
                className="relative w-full aspect-[3/5] bg-[#FFD66B] rounded-[36px] p-8 flex flex-col overflow-hidden shadow-2xl"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                {/* Header */}
                <div className="mb-6">
                    <span className="inline-block px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-full mb-2">
                        Training Volume
                    </span>
                    <h2 className="text-5xl font-black text-black leading-none tracking-tight">
                        Weekly<br />Load
                    </h2>
                </div>

                {/* Main Stat */}
                <div className="flex-1 flex flex-col justify-center items-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring' }}
                        className="text-8xl font-black text-black mb-2"
                    >
                        {safeVolume > 1000 ? (safeVolume / 1000).toFixed(1) : safeVolume}
                        <span className="text-2xl ml-1 text-black/60">k</span>
                    </motion.div>
                    <p className="text-black/60 font-bold uppercase tracking-widest text-sm">
                        Kilograms Lifted
                    </p>

                    {/* Fun Comparison */}
                    <div className="mt-8 p-4 bg-white/50 rounded-[18px] border-2 border-black/5 flex items-center gap-4 w-full">
                        <span className="text-4xl">{comparison.icon}</span>
                        <div>
                            <p className="text-xs font-bold text-black/40 uppercase">Equivalent to</p>
                            <p className="text-black font-bold leading-tight">{comparison.object}</p>
                        </div>
                    </div>
                </div>

                {/* Change Pill */}
                <div className="mt-auto">
                    <div className="flex items-center justify-between p-4 bg-black rounded-3xl text-white">
                        <span className="text-xs font-bold text-white/60 uppercase">Vs Last Week</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-xl font-bold ${isPositive ? 'text-[#FF9F76]' : 'text-[#B5D8F6]'}`}>
                                {isPositive ? '↑' : '↓'} {Math.abs(volumeChange)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Decor */}
                <div className="absolute top-[-50px] right-[-50px] w-40 h-40 border-[20px] border-white/20 rounded-full"></div>
            </motion.div>
        </div>
    );
};

export default VolumeSlide;
