import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Play, Pause, RotateCcw, Plus, Minus, X } from 'lucide-react';

const RestTimer = ({ defaultDuration = 60, onClose }) => {
    const [timeLeft, setTimeLeft] = useState(defaultDuration);
    const [isActive, setIsActive] = useState(false);
    const [duration, setDuration] = useState(defaultDuration);

    useEffect(() => {
        let interval = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(timeLeft => timeLeft - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            setIsActive(false);
            // Optional: Play sound here
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft]);

    const toggleTimer = () => {
        setIsActive(!isActive);
    };

    const resetTimer = () => {
        setIsActive(false);
        setTimeLeft(duration);
    };

    const adjustTime = (amount) => {
        const newDuration = Math.max(10, duration + amount);
        setDuration(newDuration);
        if (!isActive) {
            setTimeLeft(newDuration);
        } else {
            setTimeLeft(prev => Math.max(0, prev + amount));
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Circular progress calculation
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - ((duration - timeLeft) / duration) * circumference;

    return (
        <div className="bg-glass-card border border-white/10 rounded-[18px] p-6 w-72 shadow-2xl backdrop-blur-xl animate-fade-in relative">
            <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 className="absolute top-2 right-2 p-1 text-white/40 hover:text-white transition-colors"
 >
                <X size={16} />
            </motion.button>

            <div className="flex flex-col items-center">
                <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Rest Timer</h3>

                {/* Circular Timer Display */}
                <div className="relative mb-6">
                    <svg className="transform -rotate-90 w-32 h-32">
                        <circle
                            cx="64"
                            cy="64"
                            r={radius}
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            className="text-white/5"
                        />
                        <circle
                            cx="64"
                            cy="64"
                            r={radius}
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            className="text-glass-blue transition-all duration-1000 ease-linear"
                        />
                    </svg>
                    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                        <span className="text-3xl font-bold text-white tabular-nums">
                            {formatTime(timeLeft)}
                        </span>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-4 mb-4">
                    <motion.button {...pressProps('icon')}
 onClick={() => adjustTime(-10)}
 className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors"
 >
                        <Minus size={16} />
                    </motion.button>

                    <motion.button {...pressProps('pill')}
 onClick={toggleTimer}
 className={`p-4 rounded-full shadow-lg transform ${isActive
 ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
 : 'bg-glass-blue text-glass-dark hover:bg-glass-blue/90'
 }`}
 >
                        {isActive ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                    </motion.button>

                    <motion.button {...pressProps('icon')}
 onClick={() => adjustTime(10)}
 className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors"
 >
                        <Plus size={16} />
                    </motion.button>
                </div>

                <div className="flex gap-2">
                    <motion.button {...pressProps('icon')}
 onClick={resetTimer}
 className="text-xs text-white/40 hover:text-white flex items-center gap-1 transition-colors px-3 py-1 rounded-full hover:bg-white/5"
 >
                        <RotateCcw size={12} />
                        Reset
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default RestTimer;
