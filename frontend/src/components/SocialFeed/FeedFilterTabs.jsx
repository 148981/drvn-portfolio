import React from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { motion } from 'framer-motion';

/**
 * Shared Toggle for Following/Discover feeds
 * @param {string} activeFilter - 'following' or 'discover'
 * @param {function} onFilterChange - callback to set filter
 * @param {object} colors - Optional color theme
 */
const FeedFilterTabs = ({ activeFilter, onFilterChange, colors }) => {
    // Default style (premium neutral/warm)
    const C = colors || {
        text: '#2C2416', 
        sub: '#8B7355',
        bg: 'rgba(0,0,0,0.05)',
        activeBg: 'white',
        activeShadow: '0 2px 8px rgba(0,0,0,0.08)'
    };

    const tabs = [
        { id: 'following', label: '追蹤中' },
        { id: 'discover', label: '探索' }
    ];

    return (
        <div className="flex gap-0 mx-4 mb-5 p-1 rounded-full relative overflow-hidden"
             style={{
                // 白色軌道 + Pebble hairline
                background: '#F6F4F1',
                border: '1px solid rgba(207,198,184,0.8)',
                boxShadow: 'inset 0 1px 2px rgba(22,20,21,0.04)'
             }}>
            {tabs.map((tab) => {
                const isActive = activeFilter === tab.id;
                return (
                    <motion.button {...pressProps('cta')}
 key={tab.id}
 onClick={() => onFilterChange(tab.id)}
 className="flex-1 py-2.5 rounded-full text-[13px] font-bold relative z-10"
 style={{
 color: isActive ? '#F6F4F1' : 'rgba(22,20,21,0.4)',
 fontFamily: 'var(--font-body)'
 }}
 >
                        {isActive && (
                            <motion.div
                                layoutId="feed-filter-pill"
                                className="absolute inset-0 rounded-full z-[-1] overflow-hidden"
                                style={{
                                    // 選到的：黑色 pill
                                    background: 'linear-gradient(145deg, #2A2729 0%, #161415 100%)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    boxShadow: '0 6px 16px -6px rgba(22,20,21,0.45), inset 0 1px 0 rgba(255,255,255,0.12)'
                                }}
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            >
                                {/* 細微高光掃光 */}
                                <span className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.08) 50%, transparent 62%)' }} />
                            </motion.div>
                        )}
                        {tab.label}
                    </motion.button>
                );
            })}
        </div>
    );
};

export default FeedFilterTabs;
