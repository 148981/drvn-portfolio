import React, { useRef, useState } from 'react';
import { playTickSound } from '../../utils/soundUtils';

const Ruler = ({ min, max, value, onChange, unit }) => {
    const scrollRef = useRef(null);

    const handleScroll = (e) => {
        const y = e.target.scrollTop;
        // Trigger sound every 50px (approx)
        if (Math.abs(y % 50) < 5) playTickSound();

        const range = max - min;
        // Simple mapping: 10px per unit
        const newVal = Math.min(max, Math.max(min, Math.round(min + (y / 10))));
        if (newVal !== value) onChange(newVal);
    };

    return (
        <div className="h-64 flex items-center gap-8 relative">
            <div className="flex-1 text-right">
                <span className="text-6xl text-white font-[100]">{value}</span>
                <span className="text-sm text-zinc-500 ml-2 font-bold">{unit}</span>
            </div>
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="w-20 h-full overflow-y-scroll overflow-x-hidden scrollbar-hide relative border-l border-zinc-800"
                style={{ scrollSnapType: 'y mandatory' }}
            >
                <div className="h-[50%] w-full" /> {/* Padding top */}
                {Array.from({ length: (max - min) + 1 }).map((_, i) => (
                    <div key={i} className="h-[10px] w-full flex items-center" style={{ scrollSnapAlign: 'start' }}>
                        <div className={`h-[1px] bg-white ${i % 10 === 0 ? 'w-8 opacity-100' : 'w-4 opacity-30'}`} />
                    </div>
                ))}
                <div className="h-[50%] w-full" /> {/* Padding bottom */}
            </div>
            {/* Center Line marker */}
            <div className="absolute right-0 top-1/2 w-24 h-[1px] bg-[#C5A059]" />
        </div>
    );
};

export default Ruler;
