import React from 'react';
import { motion } from 'framer-motion';
import { Play, ExternalLink, Music, Headphones } from 'lucide-react';

const PlaylistCard = ({ playlist, index = 0 }) => {
    const {
        id,
        title,
        subtitle,
        coverImage,
        spotifyUrl,
        appleMusicUrl,
        durationMins,
        bpmRange,
        moodTags = []
    } = playlist;

    const handleOpenPlaylist = (platform) => {
        const url = platform === 'spotify' ? spotifyUrl : appleMusicUrl;
        if (url) {
            window.open(url, '_blank');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 6) * 0.1 }}
            className="relative overflow-hidden rounded-[18px] shadow-lg border border-white/60"
            style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)',
                backdropFilter: 'blur(10px)'
            }}
        >
            {/* Vinyl Record Background Graphic */}
            <div className="absolute top-0 right-0 w-48 h-48 opacity-10">
                <svg viewBox="0 0 200 200" className="w-full h-full">
                    <circle cx="100" cy="100" r="90" fill="none" stroke="#56A5C7" strokeWidth="2" />
                    <circle cx="100" cy="100" r="70" fill="none" stroke="#56A5C7" strokeWidth="1" />
                    <circle cx="100" cy="100" r="50" fill="none" stroke="#56A5C7" strokeWidth="1" />
                    <circle cx="100" cy="100" r="30" fill="none" stroke="#56A5C7" strokeWidth="1" />
                    <circle cx="100" cy="100" r="15" fill="#EBA5AC" />
                </svg>
            </div>

            <div className="relative p-6">
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                    {/* Cover Image or Icon */}
                    {coverImage ? (
                        <img loading="lazy" decoding="async"
                            src={coverImage}
                            alt={title}
                            className="w-20 h-20 rounded-lg object-cover shadow-lg"
                        />
                    ) : (
                        <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[#56A5C7] to-[#43829E] flex items-center justify-center shadow-lg shadow-[#56A5C7]/20">
                            <Music size={32} className="text-white" />
                        </div>
                    )}

                    {/* Title & Subtitle */}
                    <div className="flex-1">
                        <h3 className="text-xl font-serif text-[#56A5C7] mb-1 leading-tight">
                            {title}
                        </h3>
                        <p className="text-sm text-[#BDA0A0] font-light italic">
                            {subtitle}
                        </p>
                    </div>
                </div>

                {/* Metadata */}
                <div className="flex gap-4 mb-4 text-xs text-[#BDA0A0] font-mono">
                    {durationMins && (
                        <div className="flex items-center gap-1">
                            <Headphones size={14} className="text-[#EBA5AC]" />
                            <span>{durationMins} min</span>
                        </div>
                    )}
                    {bpmRange && (
                        <div className="flex items-center gap-1">
                            <Play size={14} className="text-[#EBA5AC]" />
                            <span>{bpmRange[0]}-{bpmRange[1]} BPM</span>
                        </div>
                    )}
                </div>

                {/* Mood Tags */}
                {moodTags.length > 0 && (
                    <div className="flex gap-2 flex-wrap mb-4">
                        {moodTags.map((tag, idx) => (
                            <span
                                key={idx}
                                className="px-2 py-1 rounded-md text-[11px] font-medium"
                                style={{
                                    backgroundColor: 'rgba(252, 215, 161, 0.2)',
                                    border: '1px solid rgba(252, 215, 161, 0.4)',
                                    color: '#C69B56'
                                }}
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                    {spotifyUrl && (
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleOpenPlaylist('spotify')}
                            className="flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all"
                            style={{
                                backgroundColor: '#8FA395', // Morandi Green
                                color: '#FFFFFF',
                                boxShadow: '0 4px 12px rgba(143, 163, 149, 0.3)'
                            }}
                        >
                            <ExternalLink size={16} />
                            <span>Spotify</span>
                        </motion.button>
                    )}

                    {appleMusicUrl && (
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleOpenPlaylist('apple')}
                            className="flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all"
                            style={{
                                backgroundColor: '#EBA5AC', // Morandi Pink (from palette)
                                color: '#FFFFFF',
                                boxShadow: '0 4px 12px rgba(235, 165, 172, 0.3)'
                            }}
                        >
                            <ExternalLink size={16} />
                            <span>Apple Music</span>
                        </motion.button>
                    )}
                </div>

                {/* Waveform Decoration */}
                <div className="mt-4 pt-4 border-t border-[#BDA0A0]/10">
                    <div className="flex items-end justify-between h-8 gap-1">
                        {Array.from({ length: 40 }).map((_, i) => {
                            const height = Math.random() * 60 + 20;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${height}%` }}
                                    transition={{
                                        delay: 0.5 + i * 0.02,
                                        duration: 0.3
                                    }}
                                    className="flex-1 rounded-sm"
                                    style={{
                                        backgroundColor: '#EBA5AC',
                                        opacity: 0.3
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default PlaylistCard;
