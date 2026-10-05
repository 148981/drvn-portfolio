import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Music, X, SkipForward, ChevronDown } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

/* ── EQ 動畫條（模組級，不隨 render 重建） ── */
const EQ_BARS = [
    { heights: ['30%', '90%', '50%', '80%', '30%'], duration: 0.7 },
    { heights: ['70%', '30%', '95%', '40%', '70%'], duration: 0.85 },
    { heights: ['50%', '80%', '25%', '90%', '50%'], duration: 0.6 },
    { heights: ['90%', '45%', '70%', '35%', '90%'], duration: 0.95 },
];

const EqBars = ({ isPlaying }) => (
    <div className="flex items-end gap-[2px]" style={{ height: '14px', width: '18px' }}>
        {EQ_BARS.map((bar, i) => (
            <motion.div
                key={i}
                className="flex-1 rounded-full"
                style={{ background: '#F95C4B', minHeight: '3px' }}
                animate={isPlaying
                    ? { height: bar.heights }
                    : { height: '30%' }
                }
                transition={isPlaying
                    ? { duration: bar.duration, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }
                    : { duration: 0.3 }
                }
            />
        ))}
    </div>
);

const GlobalFloatingMusicPlayer = () => {
    const [playback, setPlayback] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [library, setLibrary] = useState({ categories: [], playlists: [] });
    const [hidden, setHidden] = useState(() => localStorage.getItem('sonicfocus_hidden') === '1');
    const navigate = useNavigate();
    const location = useLocation();

    const isWorkoutSession =
        location.pathname.includes('/training-session-mobile') ||
        location.pathname.includes('/training-session') ||
        location.pathname.includes('/cardio-tracker') ||
        location.pathname.includes('/cardio-mobile');

    useEffect(() => {
        const checkPlayback = () => {
            const raw = localStorage.getItem('sonicfocus_playback');
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    setPlayback(prev => JSON.stringify(prev) !== raw ? data : prev);
                } catch (e) {}
            } else {
                setPlayback(null);
            }
        };
        const checkLibrary = () => {
            const rawLib = localStorage.getItem('sonicfocus_library');
            if (rawLib) {
                try {
                    const parsed = JSON.parse(rawLib);
                    const pls = parsed.playlists || [];
                    const defaultTitles = ['Morning Rise', 'Power Hour', 'Zen Flow'];
                    const isDefault = (title) => title && defaultTitles.some(d => title.includes(d));
                    const hasCustom = pls.some(p => !isDefault(p.title));
                    
                    let finalPls = pls;
                    if (hasCustom) {
                        finalPls = pls.filter(p => !isDefault(p.title));
                    }
                    const newLibrary = { ...parsed, playlists: finalPls };
                    setLibrary(prev => JSON.stringify(prev) !== JSON.stringify(newLibrary) ? newLibrary : prev);
                } catch (e) {}
            }
        };
        const checkHidden = () =>
            setHidden(localStorage.getItem('sonicfocus_hidden') === '1');

        const runChecks = () => { checkPlayback(); checkLibrary(); checkHidden(); };
        runChecks();
        const interval = setInterval(() => {
            // 分頁切到背景時跳過：省下每秒 2 次 localStorage 讀取 + JSON.parse。
            // 真正的狀態變動仍會由下方的 storage / 自訂事件即時觸發，不會漏更新。
            if (document.hidden) return;
            runChecks();
        }, 500);
        // 回到前景時立即補同步一次，避免顯示舊狀態
        const onVisible = () => { if (!document.hidden) runChecks(); };
        document.addEventListener('visibilitychange', onVisible);

        const onStorage = (e) => {
            if (e.key === 'sonicfocus_playback') checkPlayback();
            if (e.key === 'sonicfocus_library') checkLibrary();
            if (e.key === 'sonicfocus_hidden') checkHidden();
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener('sonicfocus_playback_changed', checkPlayback);
        window.addEventListener('sonicfocus_library_changed', checkLibrary);
        window.addEventListener('sonicfocus_hidden_changed', checkHidden);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('sonicfocus_playback_changed', checkPlayback);
            window.removeEventListener('sonicfocus_library_changed', checkLibrary);
            window.removeEventListener('sonicfocus_hidden_changed', checkHidden);
        };
    }, []);

    if (!playback || isWorkoutSession || hidden) return null;

    const playlists = library.playlists || [];

    const openUrl = (url) => {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const switchAlbum = (p, e) => {
        e.stopPropagation();
        // 切換歌單時自動恢復顯示
        localStorage.removeItem('sonicfocus_hidden');
        window.dispatchEvent(new Event('sonicfocus_hidden_changed'));
        const newState = { id: p.id, title: p.title, subtitle: p.subtitle, platform: p.platform, url: p.url, img: p.img, isPlaying: true };
        localStorage.setItem('sonicfocus_playback', JSON.stringify(newState));
        window.dispatchEvent(new Event('sonicfocus_playback_changed'));
        openUrl(p.url);
        setExpanded(false);
    };

    const togglePlay = (e) => {
        e.stopPropagation();
        const newState = { ...playback, isPlaying: !playback.isPlaying };
        localStorage.setItem('sonicfocus_playback', JSON.stringify(newState));
        window.dispatchEvent(new Event('sonicfocus_playback_changed'));
    };

    const playNext = (e) => {
        e.stopPropagation();
        if (!playlists.length) return;
        const idx = playlists.findIndex(p => p.title === playback.title);
        const next = playlists[idx >= 0 && idx < playlists.length - 1 ? idx + 1 : 0];
        if (!next) return;
        const newState = { id: next.id, title: next.title, subtitle: next.subtitle, platform: next.platform, url: next.url, img: next.img, isPlaying: true };
        localStorage.setItem('sonicfocus_playback', JSON.stringify(newState));
        window.dispatchEvent(new Event('sonicfocus_playback_changed'));
        openUrl(next.url);
    };

    const platformLabel = (p) => {
        if (p === 'spotify') return 'Spotify';
        if (p === 'apple') return 'Apple Music';
        return 'Music';
    };

    return (
        <div
            className="fixed z-[99999]"
            style={{ bottom: '88px', right: '16px', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
        >
            <AnimatePresence mode="wait">

                {/* ══ 展開：播放清單面板 ══ */}
                {expanded && (
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, y: 14, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 14, scale: 0.97 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            width: '272px',
                            background: 'rgba(18,16,17,0.97)',
                            borderRadius: '18px',
                            border: '1px solid rgba(246,244,241,0.09)',
                            overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
                        }}
                    >
                        {/* Panel header */}
                        <div
                            className="flex items-center justify-between px-4 py-3"
                            style={{ borderBottom: '1px solid rgba(246,244,241,0.06)' }}
                        >
                            <div className="flex items-center gap-2">
                                <EqBars isPlaying={playback.isPlaying} />
                                <span className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: '#CFC6B8' }}>
                                    Playlists
                                </span>
                            </div>
                            <motion.button {...pressProps('icon')}
 onClick={e => { e.stopPropagation(); setExpanded(false); }}
 className="flex items-center justify-center w-7 h-7 rounded-full transition-colors "
 style={{ background: 'rgba(246,244,241,0.08)' }}
 >
                                <ChevronDown size={14} color="#F6F4F1" />
                            </motion.button>
                        </div>

                        {/* 清單 */}
                        <div style={{ maxHeight: '260px', overflowY: 'auto', scrollbarWidth: 'none' }}>
                            {playlists.length > 0 ? playlists.map(p => {
                                const isActive = p.id === playback.id || p.title === playback.title;
                                return (
                                    <div
                                        key={p.id}
                                        onClick={e => switchAlbum(p, e)}
                                        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors active:bg-white/10"
                                        style={{ background: isActive ? 'rgba(249,92,75,0.08)' : 'transparent' }}
                                    >
                                        {/* 方形封面 */}
                                        <div
                                            className="w-10 h-10 flex-shrink-0 overflow-hidden"
                                            style={{ borderRadius: '12px', background: '#2A2020' }}
                                        >
                                            {p.img
                                                ? <img loading="lazy" decoding="async" src={p.img} className="w-full h-full object-cover" alt={p.title} />
                                                : <div className="w-full h-full flex items-center justify-center">
                                                    <Music size={14} style={{ color: 'rgba(246,244,241,0.25)' }} />
                                                </div>
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div
                                                className="text-[13px] font-bold truncate leading-tight"
                                                style={{ color: isActive ? '#F95C4B' : '#F6F4F1', fontFamily: "'Tenor Sans', sans-serif" }}
                                            >
                                                {p.title}
                                            </div>
                                            <div className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'rgba(246,244,241,0.30)' }}>
                                                {platformLabel(p.platform)}
                                                {isActive ? ' · NOW PLAYING' : p.url ? ' ↗' : ''}
                                            </div>
                                        </div>
                                        {isActive && (
                                            <div className="flex-shrink-0">
                                                <EqBars isPlaying={playback.isPlaying} />
                                            </div>
                                        )}
                                    </div>
                                );
                            }) : (
                                <div className="px-4 py-8 text-center">
                                    <Music size={20} className="mx-auto mb-2" style={{ color: 'rgba(246,244,241,0.12)' }} />
                                    <p className="text-[11px] font-bold mb-3" style={{ color: 'rgba(246,244,241,0.22)' }}>
                                        前往 Library 新增歌單
                                    </p>
                                    <motion.button {...pressProps('row')}
 onClick={e => { e.stopPropagation(); navigate('/sonic-focus-mobile'); setExpanded(false); }}
 className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest"
 style={{ background: 'rgba(249,92,75,0.15)', color: '#F95C4B' }}
 >
                                        Open Library
                                    </motion.button>
                                </div>
                            )}
                        </div>

                        {/* 控制列 */}
                        <div
                            className="flex gap-2 px-4 py-3"
                            style={{ borderTop: '1px solid rgba(246,244,241,0.06)' }}
                        >
                            <motion.button {...pressProps('pill')}
 onClick={togglePlay}
 className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[18px] "
 style={{ background: '#F95C4B', color: '#161415' }}
 >
                                {playback.isPlaying
                                    ? <Pause size={13} fill="currentColor" />
                                    : <Play size={13} fill="currentColor" />
                                }
                                <span className="text-[9px] font-black uppercase tracking-widest">
                                    {playback.isPlaying ? 'Pause' : 'Play'}
                                </span>
                            </motion.button>
                            <motion.button {...pressProps('pill')} aria-label="下一首"
 onClick={playNext}
 className="flex items-center justify-center w-10 rounded-[18px] "
 style={{ background: 'rgba(246,244,241,0.06)', color: '#F6F4F1', border: '1px solid rgba(246,244,241,0.09)' }}
 >
                                <SkipForward size={14} fill="currentColor" />
                            </motion.button>
                        </div>
                    </motion.div>
                )}

                {/* ══ 收合：迷你播放列 ══ */}
                {!expanded && (
                    <motion.div
                        key="mini"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setExpanded(true)}
                        className="flex items-center gap-3 cursor-pointer"
                        style={{
                            background: 'rgba(18,16,17,0.97)',
                            borderRadius: '18px',
                            border: '1px solid rgba(246,244,241,0.10)',
                            padding: '10px 12px 10px 10px',
                            boxShadow: '0 8px 30px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)',
                            minWidth: '200px',
                            maxWidth: '248px',
                        }}
                    >
                        {/* 方形封面 */}
                        <div
                            className="w-9 h-9 flex-shrink-0 overflow-hidden"
                            style={{ borderRadius: '9px', background: '#2A2020' }}
                        >
                            {playback.img
                                ? <img loading="lazy" decoding="async" src={playback.img} className="w-full h-full object-cover" alt="cover" />
                                : <div className="w-full h-full flex items-center justify-center">
                                    <Music size={13} style={{ color: 'rgba(246,244,241,0.3)' }} />
                                </div>
                            }
                        </div>

                        {/* 曲目 + EQ */}
                        <div className="flex-1 min-w-0">
                            <div
                                className="text-[13px] font-black truncate leading-tight"
                                style={{ color: '#F6F4F1', fontFamily: "'Tenor Sans', sans-serif" }}
                            >
                                {playback.title}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                                <EqBars isPlaying={playback.isPlaying} />
                                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(246,244,241,0.35)' }}>
                                    {playback.isPlaying ? 'Playing' : 'Paused'}
                                </span>
                            </div>
                        </div>

                        {/* 快速播放暫停 */}
                        <motion.button {...pressProps('icon')}
 onClick={togglePlay}
 className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 "
 style={{ background: '#F95C4B', color: '#161415' }}
 >
                            {playback.isPlaying
                                ? <Pause size={12} fill="currentColor" />
                                : <Play size={12} fill="currentColor" />
                            }
                        </motion.button>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
};

export default GlobalFloatingMusicPlayer;
