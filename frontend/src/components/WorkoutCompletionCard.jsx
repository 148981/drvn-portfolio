import React, { useState, useRef, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { Camera, Share2, Download, Heart, Map as MapIcon, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
// html2canvas loaded on-demand (bundle-dynamic-imports)
import RouteMap from './RouteMap';
import { formatDuration, formatPace, generateHashtag } from '../utils/gpsUtils';

// Confetti 粒子組件
const ConfettiParticle = ({ index, color }) => {
    const angle = Math.random() * 360;
    const dist  = 60 + Math.random() * 80;
    const rad   = (angle * Math.PI) / 180;
    const tx    = Math.cos(rad) * dist;
    const ty    = Math.sin(rad) * dist - 60; // 往上爆
    const size  = 5 + Math.random() * 6;
    const shapes = ['rounded-sm', 'rounded-full', ''];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    return (
        <motion.div
            className={`absolute pointer-events-none ${shape}`}
            style={{
                width: size,
                height: size * (Math.random() > 0.5 ? 1 : 0.4),
                background: color,
                top: '50%',
                left: '50%',
                marginTop: -size / 2,
                marginLeft: -size / 2,
                zIndex: 50,
            }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{
                x: tx,
                y: ty + 120 * Math.random(), // 散落感
                opacity: 0,
                rotate: Math.random() * 540 - 270,
                scale: 0.3,
            }}
            transition={{ duration: 1 + Math.random() * 0.8, ease: 'easeOut', delay: Math.random() * 0.15 }}
        />
    );
};

// Style tags for watermark
const STYLE_TAGS = [
    { id: 'power', label: '爆發', color: 'red' },
    { id: 'speed', label: '速度', color: 'yellow' },
    { id: 'chill', label: '輕鬆', color: 'blue' },
    { id: 'focus', label: '專注', color: 'purple' },
    { id: 'grind', label: '苦練', color: 'orange' }
];

const WorkoutCompletionCard = ({
    sessionData,
    userId,
    onSave,
    onCancel
}) => {
    const { route = [], metrics = {}, startTime, endTime } = sessionData || {};
    const [selectedStyle, setSelectedStyle] = useState('power'); // Default to POWER
    const [uploadedPhoto, setUploadedPhoto] = useState(null);
    const [notes, setNotes] = useState('');
    const [isGeneratingCard, setIsGeneratingCard] = useState(false);
    const [viewMode, setViewMode] = useState('map'); // 'map' or 'photo'

    const cardRef = useRef(null);
    const photoInputRef = useRef(null);
    const [confetti, setConfetti] = useState([]);

    // 進場時爆一次 confetti
    useEffect(() => {
        const CONFETTI_COLORS = ['#D4A853', '#F95C4B', '#00FFFF', '#D4AF6A', '#FFFFFF', '#FB923C'];
        const particles = Array.from({ length: 18 }, (_, i) => ({
            id: i,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        }));
        setConfetti(particles);
        const t = setTimeout(() => setConfetti([]), 2000);
        return () => clearTimeout(t);
    }, []);

    // Handle photo upload
    const handlePhotoUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadedPhoto(reader.result);
                setViewMode('photo'); // Switch to photo view on upload
            };
            reader.readAsDataURL(file);
        }
    };

    // Generate shareable workout card
    const handleGenerateCard = async () => {
        if (!cardRef.current) return;

        setIsGeneratingCard(true);

        try {
            // Force specific size for consistent export
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: '#1A1D1F',
                scale: 2,
                logging: false,
                useCORS: true
            });

            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `workout-${Date.now()}.png`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
                setIsGeneratingCard(false);
            });
        } catch (error) {
            console.error('Error generating card:', error);
            setIsGeneratingCard(false);
        }
    };

    // Save workout session
    const handleSave = () => {
        if (onSave) {
            onSave({
                route,
                metrics,
                style_tag: selectedStyle,
                photo: uploadedPhoto,
                notes,
                startTime,
                endTime
            });
        }
    };

    // Safely access metrics
    const distance = metrics?.distance || 0;
    const duration = metrics?.duration || 0;
    const calories = metrics?.calories || 0;
    const avgPace = metrics?.avgPace || 0;
    const hashtag = generateHashtag(distance, duration);

    const dateString = new Date(startTime || Date.now()).toLocaleString('zh-TW', {
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    return (
        <motion.div
            className="min-h-[100dvh] bg-glass-dark flex flex-col relative overflow-hidden"
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
            {/* Top Section - Visuals (Map or Photo) */}
            <div className="relative h-[55dvh] w-full bg-gray-900 transition-all duration-300" ref={cardRef}>
                {viewMode === 'map' ? (
                    <div className="w-full h-full relative">
                        <RouteMap
                            route={route}
                            mapStyle="minimal" // Using standard layout for clearer view
                            showHeatMap={false}
                            className="w-full h-full"
                        />
                        {/* Overlay Gradient for readability at bottom of map */}
                        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-glass-dark to-transparent pointer-events-none" />
                    </div>
                ) : (
                    <div className="w-full h-full relative">
                        {uploadedPhoto ? (
                            <img loading="lazy" decoding="async"
                                src={uploadedPhoto}
                                alt="Workout"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white/50 gap-4">
                                <Camera size={48} />
                                <p>尚未上傳照片</p>
                                <motion.button {...pressProps('icon')}
 onClick={() => photoInputRef.current?.click()}
 className="px-6 py-2 bg-white/10 rounded-full hover:bg-white/20 text-white"
 >
                                    選擇照片
                                </motion.button>
                            </div>
                        )}

                        {/* Watermark Overlay for Photo Mode */}
                        {uploadedPhoto && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-12">
                                <div className="text-white">
                                    <div className="text-5xl font-bold font-mono tracking-tighter shadow-sm">{distance.toFixed(2)}<span className="text-lg ml-2 font-normal opacity-80">km</span></div>
                                    <div className="flex gap-4 mt-2 opacity-90 text-sm font-medium">
                                        <span>{formatDuration(duration)}</span>
                                        <span>•</span>
                                        <span>{calories} kcal</span>
                                    </div>
                                    <div className="mt-4 inline-block bg-glass-blue/20 backdrop-blur-sm border border-glass-blue/30 px-3 py-1 rounded-full text-xs text-glass-blue">
                                        {hashtag}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* BIG STYLE WATERMARK - Centered */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
                    <span
                        className="text-9xl font-black italic tracking-tighter transition-all duration-300"
                        style={{
                            fontFamily: 'var(--font-display)',
                            color: STYLE_TAGS.find(t => t.id === selectedStyle)?.color || 'white',
                            opacity: 0.3,
                            textShadow: '0 0 30px rgba(0,0,0,0.5)',
                            WebkitTextStroke: '2px rgba(255,255,255,0.3)'
                        }}
                    >
                        {STYLE_TAGS.find(t => t.id === selectedStyle)?.label}
                    </span>
                </div>

                {/* Top Bar Overlay */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 bg-gradient-to-b from-black/60 to-transparent">
                    <motion.button {...pressProps('icon')} aria-label="上一個"
 onClick={onCancel}
 className="p-2 rounded-full bg-black/20 text-white hover:bg-white/10 backdrop-blur-md"
 >
                        <ChevronLeft size={24} />
                    </motion.button>
                    <div className="text-white font-medium text-sm bg-black/20 px-3 py-1 rounded-full backdrop-blur-md">
                        {dateString}
                    </div>

                    {/* View Toggle */}
                    <div className="flex bg-black/40 rounded-full p-1 backdrop-blur-md">
                        <motion.button {...pressProps('icon')}
 onClick={() => setViewMode('map')}
 className={`p-2 rounded-full ${viewMode === 'map' ? 'bg-white text-black shadow-sm' : 'text-white/70 hover:text-white'}`}
 >
                            <MapIcon size={18} />
                        </motion.button>
                        <motion.button {...pressProps('icon')}
 onClick={() => {
 if (!uploadedPhoto) photoInputRef.current?.click();
 else setViewMode('photo');
 }}
 className={`p-2 rounded-full ${viewMode === 'photo' ? 'bg-white text-black shadow-sm' : 'text-white/70 hover:text-white'}`}
 >
                            <Camera size={18} />
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* Bottom Section - Stats & Actions */}
            <div className="flex-1 bg-glass-dark relative -mt-6 rounded-t-3xl border-t border-white/10 p-6 flex flex-col overflow-y-auto">
                {/* Drag Handle Indicator */}
                <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />

                <div className="flex-1">
                    {/* Main Stats Row */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="text-glass-muted text-sm font-medium uppercase tracking-wider mb-1">總距離</div>
                        <div className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-gray-400 font-mono tracking-tighter">
                            {distance.toFixed(2)}<span className="text-2xl text-glass-muted ml-2 font-normal">km</span>
                        </div>
                    </div>

                    {/* Secondary Stats Grid */}
                    <div className="grid grid-cols-3 gap-6 mb-8">
                        <div className="flex flex-col items-center">
                            <div className="text-2xl font-bold text-white mb-1 font-mono">{formatDuration(duration)}</div>
                            <div className="text-xs text-glass-muted">總時間</div>
                        </div>
                        <div className="flex flex-col items-center border-x border-white/10">
                            <div className="text-2xl font-bold text-white mb-1 font-mono">{formatPace(avgPace)}</div>
                            <div className="text-xs text-glass-muted">平均配速</div>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="text-2xl font-bold text-white mb-1 font-mono">{calories}</div>
                            <div className="text-xs text-glass-muted">卡路里</div>
                        </div>
                    </div>

                    {/* Style Tag Selector */}
                    <div className="mb-8">
                        <h3 className="text-sm font-bold text-white mb-4 text-center">選擇個性水印</h3>
                        <div className="flex flex-wrap justify-center gap-3">
                            {STYLE_TAGS.map((style, i) => (
                                <motion.button
                                    key={style.id}
                                    onClick={() => setSelectedStyle(style.id)}
                                    initial={{ x: -12, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ delay: 0.3 + i * 0.08, duration: 0.28, ease: 'easeOut' }}
                                    whileTap={{ scale: 0.93 }}
                                    className={`px-4 py-2 rounded-full font-bold italic tracking-wider transition-all ${selectedStyle === style.id
                                        ? `bg-white text-black scale-105 shadow-lg`
                                        : 'bg-white/10 text-white/50 hover:bg-white/20'
                                        }`}
                                >
                                    {style.label}
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* Notes Input */}
                    <div className="bg-white/5 rounded-xl p-4 mb-4">
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="寫下您的運動心得..."
                            className="w-full bg-transparent border-none text-white placeholder-glass-muted focus:ring-0 text-sm resize-none"
                            rows={2}
                        />
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="grid grid-cols-2 gap-4 mt-auto pt-4">
                    <motion.button {...pressProps('row')}
 onClick={handleGenerateCard}
 disabled={isGeneratingCard}
 className="py-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center gap-2"
 >
                        <Share2 size={20} />
                        {isGeneratingCard ? '生成中...' : '分享'}
                    </motion.button>
                    <motion.button {...pressProps('row')}
 onClick={handleSave}
 disabled={!selectedStyle}
 className={`py-4 rounded-xl font-bold flex items-center justify-center gap-2 ${selectedStyle
 ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/30'
 : 'bg-white/5 text-white/30 cursor-not-allowed'
 }`}
 >
                        <Heart size={20} />
                        保存
                    </motion.button>
                </div>
            </div>

            {/* Confetti 爆炸層（絕對定位，疊在畫面中央） */}
            {confetti.map(p => <ConfettiParticle key={p.id} index={p.id} color={p.color} />)}

            {/* Hidden Photo Input */}
            <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
            />
        </motion.div>
    );
};

export default WorkoutCompletionCard;
