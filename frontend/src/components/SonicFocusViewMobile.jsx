import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import {
    ArrowLeft, Play, Music, Plus, Settings2, ArrowUpRight,
    ExternalLink, X, Link2, FolderPlus, Check, Trash2,
    ImagePlus, ChevronLeft, ChevronRight, Type, Image as ImageIcon
} from 'lucide-react';
import { getUserId } from '../utils/auth';
import { editorialColors } from '../utils/colors';
import { toast } from '../utils/toast';
import { haptic } from '../utils/haptics';
import { recordFirst } from '../utils/momentEngine';

// ═══ IMG_6007 高級質感色票 ═══
const C = editorialColors;

const FontStyle = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
        * {
            font-family: 'Tenor Sans', sans-serif !important;
        }
    `}</style>
);

// ═══ 初始策展數據 ═══
const INITIAL_CATEGORIES = [];
const INITIAL_PLAYLISTS = [];


const SonicFocusViewMobile = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);

    // ═══ 觸感回饋 (Haptic Feedback) 輔助函數 ═══
    const triggerHaptic = (pattern = 15) => haptic(Array.isArray(pattern) ? 'medium' : (pattern > 20 ? 'medium' : 'light'));

    // ═══ 狀態管理：分類與歌單 ═══
    const [categories, setCategories] = useState(INITIAL_CATEGORIES);
    const [playlists, setPlaylists] = useState(INITIAL_PLAYLISTS);
    const [libraryLoaded, setLibraryLoaded] = useState(false);

    // ═══ User ID ═══
    const userId = getUserId();

    // ═══ 從後端載入歌單庫 ═══
    useEffect(() => {
        const fetchLibrary = async () => {
            try {
                const res = await apiClient.get(`/api/sonic/library/${userId}`);
                const data = res.data;
                let cats = data.categories || [];
                let pls = data.playlists || [];

                if (cats.length === 0 && pls.length === 0) {
                    const cached = localStorage.getItem('sonicfocus_library');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        cats = parsed.categories || [];
                        pls = parsed.playlists || [];
                    }
                }

                // 過濾預設歌單邏輯
                const defaultTitles = ['Morning Rise', 'Power Hour', 'Zen Flow'];
                const isDefault = (title) => title && defaultTitles.some(d => title.includes(d));
                const hasCustom = pls.some(p => !isDefault(p.title));

                if (hasCustom) {
                    pls = pls.filter(p => !isDefault(p.title));
                    // 順便把空的預設分類過濾掉
                    cats = cats.filter(c => pls.some(p => p.categoryId === c.id) || !['c1', 'c2', 'c3'].includes(c.id));
                }

                setCategories(cats);
                setPlaylists(pls);
                localStorage.setItem('sonicfocus_library', JSON.stringify({ categories: cats, playlists: pls }));
            } catch (err) {
                console.warn('[SonicFocus] Backend unavailable, loading from localStorage cache');
                const cached = localStorage.getItem('sonicfocus_library');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        let cats = parsed.categories || [];
                        let pls = parsed.playlists || [];

                        const defaultTitles = ['Morning Rise', 'Power Hour', 'Zen Flow'];
                        const isDefault = (title) => title && defaultTitles.some(d => title.includes(d));
                        const hasCustom = pls.some(p => !isDefault(p.title));

                        if (hasCustom) {
                            pls = pls.filter(p => !isDefault(p.title));
                            cats = cats.filter(c => pls.some(p => p.categoryId === c.id) || !['c1', 'c2', 'c3'].includes(c.id));
                        }

                        if (cats.length) setCategories(cats);
                        if (pls.length) setPlaylists(pls);
                    } catch { }
                }
            } finally {
                setLibraryLoaded(true);
            }
        };
        fetchLibrary();
    }, []);

    // ═══ 自動儲存到後端（debounce 1.5s）═══
    const saveTimerRef = useRef(null);
    const saveLibraryToBackend = useCallback((cats, pls) => {
        // 更新 localStorage 緩存（即時）
        localStorage.setItem('sonicfocus_library', JSON.stringify({ categories: cats, playlists: pls }));
        // Debounce 後端儲存 1.5s
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                await apiClient.post('/api/sonic/library', {
                    user_id: userId,
                    categories: cats,
                    playlists: pls,
                });
                console.log('[SonicFocus] ✅ Library saved to backend');
            } catch (err) {
                console.warn('[SonicFocus] ⚠️ Backend save failed, data is in localStorage:', err.message);
            }
        }, 1500);
    }, [userId]);

    // 監聴 categories/playlists 變化並儲存
    useEffect(() => {
        if (!libraryLoaded) return; // 防止載入時觸發不必要的儲存
        saveLibraryToBackend(categories, playlists);
    }, [categories, playlists, libraryLoaded, saveLibraryToBackend]);

    // ═══ 自動補全遺失的封面 (網路恢復時自動修復) ═══
    useEffect(() => {
        if (!libraryLoaded) return;
        
        const fetchMissingCovers = async () => {
            let updated = false;
            const updatedPlaylists = await Promise.all(playlists.map(async (p) => {
                if (!p.img && p.url && p.url.startsWith('http')) {
                    try {
                        const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(p.url)}`);
                        if (response.ok) {
                            const data = await response.json();
                            if (data.data?.image?.url) {
                                updated = true;
                                return { ...p, img: data.data.image.url };
                            }
                        }
                    } catch (e) {
                        // 依然失敗則忽略
                    }
                }
                return p;
            }));
            
            if (updated) {
                setPlaylists(updatedPlaylists);
                console.log('[SonicFocus] Auto-healed missing covers.');
            }
        };

        const hasMissingCovers = playlists.some(p => !p.img && p.url && p.url.startsWith('http'));
        if (hasMissingCovers) {
            fetchMissingCovers();
        }
    }, [libraryLoaded, playlists.length]); // 依賴長度改變時（新增後）或初始載入完成時檢查

    const [activeCategoryId, setActiveCategoryId] = useState('c1');
    const [activePlaylistId, setActivePlaylistId] = useState(1);

    // 播放器狀態
    const [isPlaying, setIsPlaying] = useState(() => {
        try {
            const raw = localStorage.getItem('sonicfocus_playback');
            if (raw) return JSON.parse(raw).isPlaying || false;
        } catch {}
        return false;
    });

    // 編輯模式狀態
    const [isEditMode, setIsEditMode] = useState(false);
    const [showEditCoverModal, setShowEditCoverModal] = useState(false);
    const [editCoverFileUrl, setEditCoverFileUrl] = useState('');

    // 新增 Modal 狀態
    const [showAddPlaylistModal, setShowAddPlaylistModal] = useState(false);
    const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

    // 手動輸入的歌單資料 (標題、網址、圖片)
    const [newPlaylist, setNewPlaylist] = useState({ title: '', url: '', img: '' });
    const [newCategory, setNewCategory] = useState({ title: '', subtitle: '' });
    const [isFetchingLink, setIsFetchingLink] = useState(false);

    // 取得當前資料
    const filteredPlaylists = playlists.filter(p => p.categoryId === activeCategoryId);
    const currentPlaylist = playlists.find(p => p.id === activePlaylistId) || filteredPlaylists[0] || null;

    useEffect(() => {
        setTimeout(() => setLoading(false), 400);
    }, []);

    // 當切換分類時
    useEffect(() => {
        if (!isEditMode) {
            if (filteredPlaylists.length > 0) {
                setActivePlaylistId(filteredPlaylists[0].id);
            } else {
                setActivePlaylistId(null);
            }
            setIsPlaying(false);
        }
    }, [activeCategoryId]);

    // ═══ 同步播放狀態到 localStorage（供 WorkoutSession 使用）═══
    useEffect(() => {
        if (currentPlaylist) {
            localStorage.setItem('sonicfocus_playback', JSON.stringify({
                isPlaying: isPlaying,
                title: currentPlaylist.title,
                subtitle: currentPlaylist.subtitle || '',
                platform: currentPlaylist.platform || 'other',
                bpm: currentPlaylist.bpm || null,
                img: currentPlaylist.img || '',
                url: currentPlaylist.url || '',
            }));
            // Dispatch event so other components (like ActionFirstDashboardMobile) update immediately
            window.dispatchEvent(new Event('sonicfocus_playback_changed'));
        }
        // ❌ 不在 unmount 時清空 — 離頁面不代表停止播放
        // 只在 App 完全關閉時清空
    }, [isPlaying, currentPlaylist]);

    // 只在 App 關閉時清空播放狀態
    useEffect(() => {
        const onUnload = () => {
            localStorage.setItem('sonicfocus_playback', JSON.stringify({ isPlaying: false }));
        };
        window.addEventListener('beforeunload', onUnload);
        return () => window.removeEventListener('beforeunload', onUnload);
    }, []);

    // ═══ 唱片點擊邏輯：單擊 = 選擇（橘色框），雙擊 = 跳連結 ═══
    const lastClickRef = useRef({ id: null, time: 0 });

    const handleDiscClick = (item) => {
        if (isEditMode) return;

        const now = Date.now();
        const DOUBLE_THRESHOLD = 400; // ms

        if (lastClickRef.current.id === item.id && (now - lastClickRef.current.time) < DOUBLE_THRESHOLD) {
            // ✌️ 雙擊：跳到 Spotify / Apple Music
            triggerHaptic([30, 40, 30]);
            setIsPlaying(true);
            if (item.url) {
                const a = document.createElement('a');
                a.href = item.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            return;
        }

        // 👆 單擊：選擇並聚焦（點亮橘色邊框）
        lastClickRef.current = { id: item.id, time: now };
        triggerHaptic(15);

        if (activePlaylistId === item.id) {
            setIsPlaying(!isPlaying);
        } else {
            setActivePlaylistId(item.id);
            setIsPlaying(true);
        }
    };

    // ═══ 編輯模式功能 ═══
    const handleDeletePlaylist = (id) => {
        const newPlaylists = playlists.filter(p => p.id !== id);
        setPlaylists(newPlaylists);
        if (activePlaylistId === id) {
            const newFiltered = newPlaylists.filter(p => p.categoryId === activeCategoryId);
            setActivePlaylistId(newFiltered.length > 0 ? newFiltered[0].id : null);
            setIsPlaying(false);
        }
    };

    const handleMovePlaylist = (id, direction) => {
        const currentIndex = playlists.findIndex(p => p.id === id);
        if (currentIndex < 0) return;

        const categoryItems = playlists.filter(p => p.categoryId === activeCategoryId);
        const catIndex = categoryItems.findIndex(p => p.id === id);

        if (direction === 'left' && catIndex > 0) {
            const prevId = categoryItems[catIndex - 1].id;
            const prevGlobalIndex = playlists.findIndex(p => p.id === prevId);
            const newPlaylists = [...playlists];
            [newPlaylists[currentIndex], newPlaylists[prevGlobalIndex]] = [newPlaylists[prevGlobalIndex], newPlaylists[currentIndex]];
            setPlaylists(newPlaylists);
        } else if (direction === 'right' && catIndex < categoryItems.length - 1) {
            const nextId = categoryItems[catIndex + 1].id;
            const nextGlobalIndex = playlists.findIndex(p => p.id === nextId);
            const newPlaylists = [...playlists];
            [newPlaylists[currentIndex], newPlaylists[nextGlobalIndex]] = [newPlaylists[nextGlobalIndex], newPlaylists[currentIndex]];
            setPlaylists(newPlaylists);
        }
    };

    // 處理本地圖片上傳 (新增歌單用)
    const handleAddImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const imageUrl = URL.createObjectURL(file);
            setNewPlaylist({ ...newPlaylist, img: imageUrl });
        }
    };

    // 處理本地圖片上傳 (編輯封面用)
    const handleEditImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const imageUrl = URL.createObjectURL(file);
            setEditCoverFileUrl(imageUrl);
        }
    };

    const handleSaveCover = (e) => {
        e.preventDefault();
        if (!editCoverFileUrl) return;
        setPlaylists(playlists.map(p => p.id === activePlaylistId ? { ...p, img: editCoverFileUrl } : p));
        setShowEditCoverModal(false);
        setEditCoverFileUrl('');
    };

    // ═══ 新增功能 ═══
    // ═══ 1. 替換為支援智能解析網址的 handleAddPlaylist ═══
    const handleAddPlaylist = async (e) => {
        e.preventDefault();
        if (!newPlaylist.url) return;

        setIsFetchingLink(true); // 開啟按鈕的 Loading 動畫

        try {
            let platform = 'other';
            if (newPlaylist.url.includes('spotify.com')) platform = 'spotify';
            if (newPlaylist.url.includes('apple.com')) platform = 'apple';

            let finalTitle = newPlaylist.title || 'Custom Record';
            let finalImg = newPlaylist.img || '';

            // 如果使用者沒有手動上傳圖片或填寫標題，就呼叫 API 抓取
            if (!finalImg || !newPlaylist.title) {
                try {
                    const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(newPlaylist.url)}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (!newPlaylist.title && data.data?.title) {
                            finalTitle = data.data.title.split(' - ')[0].split(' | ')[0];
                        }
                        if (!finalImg && data.data?.image?.url) {
                            finalImg = data.data.image.url;
                        }
                    }
                } catch (fetchErr) {
                    console.warn("Failed to fetch metadata, proceeding with default/provided data:", fetchErr);
                }
            }

            const addedPlaylist = {
                id: Date.now(),
                categoryId: activeCategoryId,
                title: finalTitle.length > 22 ? finalTitle.substring(0, 22) + '...' : finalTitle,
                subtitle: platform === 'spotify' ? 'Spotify Selection' : platform === 'apple' ? 'Apple Music' : 'Personal Curation',
                bpm: Math.floor(Math.random() * (160 - 90 + 1)) + 90,
                img: finalImg, // 可能是 API 抓的，也可能是本地上傳的，也可能為空
                url: newPlaylist.url,
                platform: platform
            };

            setPlaylists([...playlists, addedPlaylist]);
            setActivePlaylistId(addedPlaylist.id);
            setNewPlaylist({ title: '', url: '', img: '' });
            setShowAddPlaylistModal(false);
            triggerHaptic([10, 30, 10]); // 成功加入的清爽震動
            // ✨ 第一首訓練歌入庫 → 滿版時刻（只慶祝一次）
            try { recordFirst(userId, 'add_music'); } catch { /* */ }
        } catch (error) {
            toast.error("解析連結失敗，請確認網址或手動上傳圖片。");
        } finally {
            setIsFetchingLink(false);
        }
    };

    const handleAddCategory = (e) => {
        e.preventDefault();
        if (!newCategory.title) return;
        const formattedTitle = newCategory.title.replace(' ', '\n');
        const newCat = {
            id: `c_${Date.now()}`,
            title: formattedTitle,
            subtitle: newCategory.subtitle || 'Custom Category'
        };
        setCategories([...categories, newCat]);
        setActiveCategoryId(newCat.id);
        setNewCategory({ title: '', subtitle: '' });
        setShowAddCategoryModal(false);
        triggerHaptic(20); // 分類成功的紮實震動
    };

    if (loading) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center page-top-safe" style={{ backgroundColor: C.paper }}>
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] pb-32 overflow-x-hidden relative" style={{ backgroundColor: C.paper, maxWidth: '430px', margin: '0 auto' }}>
            <FontStyle />

            {/* 1. Header (含返回與編輯鈕) */}
            <header className="pt-14 px-8 relative z-10">
                <motion.div
                    className="flex justify-between items-center mb-6"
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                    <motion.button {...pressProps('icon')} onClick={() => navigate(-1)} className="p-2 rounded-full bg-black/5 hover:bg-black/10">
                        <ArrowLeft size={20} color={C.deepBlack} />
                    </motion.button>
                    <motion.button {...pressProps('icon')}
 onClick={() => { setIsEditMode(!isEditMode); setIsPlaying(false); }}
 className={`p-2.5 rounded-full transition-colors ${isEditMode ? 'bg-[#F95C4B] text-white' : 'bg-black/5 text-[#161415]'}`}
 >
                        {isEditMode ? <Check size={20} /> : <Settings2 size={20} />}
                    </motion.button>
                </motion.div>
                <div style={{ overflow: 'hidden' }}>
                    <motion.h1
                        className="text-6xl font-medium tracking-tighter mb-2"
                        style={{ color: C.deepBlack }}
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                    >Sonic</motion.h1>
                </div>
                <motion.p
                    className="text-sm font-medium opacity-40 max-w-[200px] leading-snug"
                    style={{ color: C.deepBlack }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.4 }}
                    transition={{ delay: 0.28, duration: 0.5 }}
                >
                    {isEditMode ? 'Editing Mode Active' : 'DRVN® lab'}
                </motion.p>
                {/* 🎵 行為說明 — 音樂在外部 App 播放，DRVN 只是入口，避免使用者誤以為 app 內建播放器 */}
                {!isEditMode && (
                    <motion.p
                        className="text-[11px] font-bold leading-relaxed mt-3 max-w-[280px]"
                        style={{ color: 'rgba(22,20,21,0.38)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.36, duration: 0.5 }}
                    >
                        雙擊唱片會開啟 Spotify / Apple Music 播放。實際播放由外部 App 控制，
                        跑步時的音樂膠囊僅顯示你最後選擇的歌單；重新開啟 DRVN 後會自動清除。
                    </motion.p>
                )}
            </header>

            {/* 2. 唱盤區 */}
            <section className="mt-10 min-h-[320px] relative">
                <div className="px-8 flex justify-between items-end mb-8">
                    <div className="flex flex-col h-[70px] justify-end">
                        {currentPlaylist ? (
                            <>
                                <span className="text-[9px] font-black tracking-widest uppercase opacity-30 mb-1" style={{ color: C.deepBlack }}>
                                    {isEditMode ? 'EDITING...' : currentPlaylist.platform === 'spotify' ? 'SPOTIFY PLAYLIST' : currentPlaylist.platform === 'apple' ? 'APPLE MUSIC' : 'CUSTOM PLAYLIST'}
                                </span>
                                <h2 className="text-4xl font-medium leading-[0.9] tracking-tighter transition-all" style={{ color: C.deepBlack }}>
                                    {currentPlaylist.title.split(' ')[0]}
                                    {currentPlaylist.title.split(' ').length > 1 && <><br />{currentPlaylist.title.split(' ').slice(1).join(' ')}</>}
                                </h2>
                            </>
                        ) : (
                            <>
                                <span className="text-[9px] font-black tracking-widest uppercase opacity-30 mb-1" style={{ color: C.deepBlack }}>EMPTY CATEGORY</span>
                                <h2 className="text-4xl font-medium leading-[0.9] tracking-tighter text-[#161415]/20">No Records<br />Yet</h2>
                            </>
                        )}
                    </div>

                    {/*  */}

                </div>

                {/* 圓形卡片滾動條 */}
                <div className="flex gap-6 overflow-x-auto px-8 pb-8 no-scrollbar snap-x items-center">
                    {filteredPlaylists.map((item, index) => (
                        <motion.div
                            key={item.id}
                            onClick={() => handleDiscClick(item)}
                            className="flex-shrink-0 snap-center relative cursor-pointer"
                        >
                            {/* 編輯模式：左右移動按鈕 */}
                            <AnimatePresence>
                                {isEditMode && activePlaylistId === item.id && (
                                    <>
                                        {index > 0 && (
                                            <motion.button
                                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                                onClick={(e) => { e.stopPropagation(); handleMovePlaylist(item.id, 'left'); }}
                                                className="absolute -left-6 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center z-20 hover:scale-110 active:scale-95 transition-all text-[#161415]"
                                            >
                                                <ChevronLeft size={20} />
                                            </motion.button>
                                        )}
                                        {index < filteredPlaylists.length - 1 && (
                                            <motion.button
                                                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                                onClick={(e) => { e.stopPropagation(); handleMovePlaylist(item.id, 'right'); }}
                                                className="absolute -right-6 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center z-20 hover:scale-110 active:scale-95 transition-all text-[#161415]"
                                            >
                                                <ChevronRight size={20} />
                                            </motion.button>
                                        )}
                                    </>
                                )}
                            </AnimatePresence>

                            {/* 🔥 唱片本體 (點擊啟動旋轉) 🔥 */}
                            <motion.div
                                animate={{ rotate: isPlaying && activePlaylistId === item.id && !isEditMode ? [0, 360] : 0 }}
                                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                                className={`w-56 h-56 rounded-full overflow-hidden relative transition-all duration-500 flex items-center justify-center border-[1.5px] 
                                ${activePlaylistId === item.id ? 'scale-100' : 'scale-90 opacity-40 grayscale blur-[1px]'}`}
                                style={{
                                    backgroundColor: item.img ? 'transparent' : '#262523',
                                    borderColor: activePlaylistId === item.id ? C.coral : 'transparent',
                                    touchAction: 'manipulation' // 阻止手機瀏覽器預設的雙擊縮放，讓雙擊跳轉更靈敏
                                }}
                            >
                                {/* 🖼 唱片封面 - 若空則顯示炭灰色黑膠質感 */}
                                {item.img ? (
                                    <>
                                        <img loading="lazy" decoding="async" src={item.img} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
                                        {/* 有圖片時的細微壓痕，增加印刷感 */}
                                        <div className="absolute inset-0 rounded-full border border-white/10" />
                                    </>
                                ) : (
                                    <>
                                        {/* 深炭灰色的亮面與同心圓質感 */}
                                        <div className="absolute inset-0 bg-[#262523] flex items-center justify-center">
                                            {/* 模擬黑膠亮面反射 */}
                                            <div className="absolute inset-0 opacity-10 bg-[conic-gradient(from_0deg,transparent_0deg,white_45deg,transparent_90deg,transparent_180deg,white_225deg,transparent_270deg)]" />
                                        </div>
                                        <div className="absolute inset-0 rounded-full border border-white/5" />
                                        <div className="absolute inset-4 rounded-full border border-white/5" />
                                        <div className="absolute inset-8 rounded-full border border-white/5" />
                                        <div className="absolute inset-12 rounded-full border border-white/5" />
                                        <div className="absolute inset-16 rounded-full border border-white/5" />
                                        <div className="absolute inset-20 rounded-full border border-white/5" />
                                        <div className="absolute inset-24 rounded-full border border-white/5" />

                                        {/* 強化陰影感 */}
                                        <div className="absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), inset 0 0 15px rgba(0,0,0,0.4)' }} />
                                    </>
                                )}

                                {/* 中心孔洞裝飾 (維持高級感) */}
                                <div className="w-16 h-16 rounded-full bg-black/20 backdrop-blur-sm border border-white/10 flex items-center justify-center z-0 relative">
                                    <div className="w-4 h-4 bg-[#F6F4F1] rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]">
                                        <div className="absolute inset-[5px] bg-[#161415]/10 rounded-full" />
                                    </div>
                                </div>

                                {/* 編輯模式功能按鈕 */}
                                <AnimatePresence mode="wait">
                                    {activePlaylistId === item.id && isEditMode && (
                                        <motion.div
                                            key="edit-mode"
                                            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                                            className="absolute inset-0 flex items-center justify-center z-10"
                                        >
                                            <div className="w-24 h-24 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center shadow-2xl gap-2 border border-white/20">
                                                <motion.button {...pressProps('icon')} onClick={(e) => { e.stopPropagation(); setShowEditCoverModal(true); }} className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#161415] hover:scale-110">
                                                    <ImagePlus size={16} />
                                                </motion.button>
                                                <motion.button {...pressProps('icon')} onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(item.id); }} className="w-9 h-9 rounded-full bg-[#F95C4B] flex items-center justify-center text-white hover:scale-110">
                                                    <Trash2 size={16} />
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </motion.div>
                    ))}

                    {/* 新增連結唱盤 (保留在列表最後) */}
                    <motion.div
                        onClick={() => setShowAddPlaylistModal(true)}
                        className="flex-shrink-0 snap-center relative cursor-pointer group"
                    >
                        <div className="w-56 h-56 rounded-full border-2 border-dashed border-[#161415]/20 flex flex-col items-center justify-center hover:bg-[#161415]/5 transition-colors">
                            <Plus size={32} className="text-[#161415]/30 mb-2" />
                            <span className="text-[9px] font-black tracking-widest uppercase text-[#161415]/40">Add Playlist</span>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* 3. 分類區塊 - Premium Wood & Titanium Aesthetic */}
            <section 
                className="mx-6 mt-4 p-8 rounded-[36px] relative overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.4)]"
                style={{
                    backgroundColor: '#FAF9F6',
                    backgroundImage: `
                        linear-gradient(to right, rgba(0,0,0,0.1) 0%, transparent 50%, rgba(0,0,0,0.1) 100%),
                        linear-gradient(to bottom, rgba(255,255,255,0.05) 0%, transparent 100%),
                        repeating-linear-gradient(145deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 20px),
                        repeating-linear-gradient(35deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 20px),
                        linear-gradient(to right, #5C2E0A 0%, #7A3B10 50%, #5C2E0A 100%)
                    `,
                    backgroundSize: '100% 100%, 100% 100%, 50% 100%, 50% 100%, 100% 100%',
                    backgroundPosition: '0 0, 0 0, 0 0, 100% 0, 0 0',
                    backgroundRepeat: 'no-repeat',
                    border: '2.2px solid transparent',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 24px 48px rgba(0,0,0,0.4)',
                }}
            >
                {/* Wood Grain Texture Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]" />

                {/* [NEW] Matte Titanium Metal Frame — Concentric & Sleek */}
                <div 
                    className="absolute inset-0 rounded-[36px] pointer-events-none"
                    style={{
                        padding: '2.2px',
                        background: `
                            radial-gradient(circle at center, rgba(0,0,0,0.05) 0.5px, transparent 0.5px),
                            repeating-linear-gradient(
                                135deg,
                                rgba(255,255,255,0.01) 0px,
                                rgba(255,255,255,0.01) 1px,
                                transparent 1px,
                                transparent 3px
                            ),
                            linear-gradient(135deg, 
                                #5A5A5A 0%, 
                                #7A7A7A 20%, 
                                #B0B0B0 45%, 
                                #909090 55%, 
                                #7A7A7A 80%, 
                                #5A5A5A 100%
                            )
                        `,
                        backgroundSize: '1px 1px, 100% 100%, 100% 100%',
                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude',
                    }}
                />

                {/* Matte Finish Shadow Overlay */}
                <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.2)',
                        opacity: 0.3
                    }}
                />

                <div className="flex justify-between items-start mb-10 relative z-10">
                    <div className="flex flex-col">
                        <span 
                            className="text-[9px] font-black uppercase tracking-[0.2em] mb-1"
                            style={{ 
                                background: 'linear-gradient(135deg, #E5E4E2 0%, #BCC6CC 50%, #E5E4E2 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                            }}
                        >
                            Categories
                        </span>
                        <p 
                            className="text-sm font-medium leading-tight"
                            style={{ 
                                background: 'linear-gradient(135deg, #F2F2F7 0%, #D1D1D6 50%, #8E8E93 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                opacity: 0.9
                            }}
                        >
                            {categories.find(c => c.id === activeCategoryId)?.subtitle || 'Filter your sound'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-10 overflow-x-auto no-scrollbar items-end pb-4 snap-x relative z-10">
                    {categories.map((cat) => (
                        <div
                            key={cat.id}
                            onClick={() => { setActiveCategoryId(cat.id); setIsEditMode(false); setIsPlaying(false); triggerHaptic(10); }}
                            className={`flex flex-col flex-shrink-0 cursor-pointer snap-start transition-all duration-300 origin-bottom-left ${activeCategoryId === cat.id ? 'opacity-100 scale-100' : 'opacity-30 scale-90'}`}
                        >
                            <h3 
                                className="text-4xl font-medium leading-[0.9] tracking-tighter whitespace-pre-line"
                                style={{ 
                                    background: activeCategoryId === cat.id 
                                        ? 'linear-gradient(135deg, #FFFFFF 0%, #F2F2F7 45%, #D1D1D6 55%, #8E8E93 100%)' 
                                        : 'linear-gradient(135deg, #BCC6CC 0%, #8E8E93 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    filter: activeCategoryId === cat.id ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'none'
                                }}
                            >
                                {cat.title}
                            </h3>
                        </div>
                    ))}
                    <div
                        onClick={() => { setShowAddCategoryModal(true); triggerHaptic(15); }}
                        className="flex flex-col justify-end pb-2 flex-shrink-0 cursor-pointer snap-start opacity-40 hover:opacity-100 transition-opacity"
                    >
                        <div 
                            className="w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center transition-all active:scale-90"
                            style={{ 
                                borderColor: '#BCC6CC',
                                background: 'rgba(255,255,255,0.05)',
                                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)'
                            }}
                        >
                            <Plus size={24} color="#F2F2F7" />
                        </div>
                    </div>
                </div>
            </section>



            {/* 🎵 Modal 1: 新增歌單 (本地上傳圖片版) */}
            <AnimatePresence>
                {showAddPlaylistModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                        onClick={() => setShowAddPlaylistModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm bg-[#F6F4F1] rounded-[36px] p-6 shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-medium tracking-tight text-[#161415]">New Record</h3>
                                <motion.button {...pressProps('icon')} onClick={() => setShowAddPlaylistModal(false)} className="p-2 bg-black/5 rounded-full text-[#161415]/60 hover:text-[#161415]">
                                    <X size={20} />
                                </motion.button>
                            </div>

                            <form onSubmit={handleAddPlaylist}>
                                <div className="space-y-4 mb-8">
                                    {/* 標題輸入 */}
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#161415]/40">
                                            <Type size={18} />
                                        </div>
                                        <input
                                            type="text" placeholder="Title (e.g. Focus Flow)"
                                            value={newPlaylist.title} onChange={(e) => setNewPlaylist({ ...newPlaylist, title: e.target.value })}
                                            required autoFocus
                                            className="w-full bg-white border border-[#E4DED2] rounded-[18px] py-4 pl-12 pr-4 text-[#161415] placeholder:text-[#161415]/30 focus:outline-none focus:ring-2 focus:ring-[#F95C4B]/20 font-bold"
                                        />
                                    </div>

                                    {/* 連結輸入 */}
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#161415]/40">
                                            <Link2 size={18} />
                                        </div>
                                        <input
                                            type="url" placeholder="Spotify / Apple Music Link"
                                            value={newPlaylist.url} onChange={(e) => setNewPlaylist({ ...newPlaylist, url: e.target.value })}
                                            required
                                            className="w-full bg-white border border-[#E4DED2] rounded-[18px] py-4 pl-12 pr-4 text-[#161415] placeholder:text-[#161415]/30 focus:outline-none focus:ring-2 focus:ring-[#F95C4B]/20"
                                        />
                                    </div>

                                    {/* 本地圖片上傳 */}
                                    <div className="relative">
                                        <div className="w-full bg-white border border-dashed border-[#161415]/20 rounded-[18px] py-4 px-4 text-center cursor-pointer hover:bg-black/5 transition-colors">
                                            <label className="cursor-pointer flex flex-col items-center gap-2">
                                                <input type="file" accept="image/*" onChange={handleAddImageUpload} className="hidden" />
                                                <ImageIcon size={20} className="text-[#161415]/40" />
                                                <span className="text-xs font-bold text-[#161415]/50">
                                                    {newPlaylist.img ? 'Image Selected (Click to change)' : 'Upload Cover (Optional)'}
                                                </span>
                                            </label>
                                        </div>
                                        {newPlaylist.img && (
                                            <div className="mt-3 flex justify-center">
                                                <img loading="lazy" decoding="async" src={newPlaylist.img} alt="Preview" className="w-16 h-16 rounded-full object-cover border border-black/10 shadow-sm" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <motion.button {...pressProps('pill')}
 type="submit"
 disabled={isFetchingLink}
 className="w-full py-4 rounded-[18px] font-black text-white shadow-lg flex items-center justify-center gap-2 overflow-hidden relative"
 style={{ backgroundColor: C.coral }}
 >
                                    {isFetchingLink ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span>Analyzing Link...</span>
                                        </>
                                    ) : (
                                        'Save to Category'
                                    )}
                                    {/* 按鈕點擊時的微光動效 */}
                                    <motion.div
                                        initial={{ x: '-100%' }}
                                        animate={isFetchingLink ? { x: '200%' } : { x: '-100%' }}
                                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-1/2 skew-x-12"
                                    />
                                </motion.button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 📁 Modal 2: 新增分類 */}
            <AnimatePresence>
                {showAddCategoryModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                        onClick={() => setShowAddCategoryModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm bg-[#F6F4F1] rounded-[36px] p-6 shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-medium tracking-tight text-[#161415]">New Category</h3>
                                <motion.button {...pressProps('icon')} onClick={() => setShowAddCategoryModal(false)} className="p-2 bg-black/5 rounded-full text-[#161415]/60 hover:text-[#161415]">
                                    <X size={20} />
                                </motion.button>
                            </div>

                            <form onSubmit={handleAddCategory}>
                                <div className="space-y-3 mb-8">
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-[#161415]/40 mb-1 block">Title (e.g. Deep Focus)</label>
                                        <input
                                            type="text" placeholder="Deep Focus" value={newCategory.title}
                                            onChange={(e) => setNewCategory({ ...newCategory, title: e.target.value })}
                                            required autoFocus
                                            className="w-full bg-white border border-[#E4DED2] rounded-[18px] py-4 px-4 text-[#161415] placeholder:text-[#161415]/30 focus:outline-none focus:ring-2 focus:ring-[#161415]/20 font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-[#161415]/40 mb-1 block">Subtitle</label>
                                        <input
                                            type="text" placeholder="Get in the zone" value={newCategory.subtitle}
                                            onChange={(e) => setNewCategory({ ...newCategory, subtitle: e.target.value })}
                                            className="w-full bg-white border border-[#E4DED2] rounded-[18px] py-4 px-4 text-[#161415] placeholder:text-[#161415]/30 focus:outline-none focus:ring-2 focus:ring-[#161415]/20"
                                        />
                                    </div>
                                </div>
                                <motion.button {...pressProps('pill')} type="submit" className="w-full py-4 rounded-[18px] font-bold text-white shadow-lg flex items-center justify-center gap-2" style={{ backgroundColor: C.deepBlack }}>
                                    <FolderPlus size={18} /> Create Category
                                </motion.button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 編輯模式：更換封面 Modal (本地上傳) */}
            <AnimatePresence>
                {showEditCoverModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                        onClick={() => setShowEditCoverModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm bg-[#F6F4F1] rounded-[36px] p-6 shadow-2xl"
                        >
                            <h3 className="text-2xl font-medium tracking-tight text-[#161415] mb-6">Change Cover</h3>
                            <form onSubmit={handleSaveCover}>
                                <div className="w-full bg-white border border-dashed border-[#161415]/20 rounded-[18px] py-6 px-4 text-center cursor-pointer hover:bg-black/5 transition-colors mb-6">
                                    <label className="cursor-pointer flex flex-col items-center gap-3">
                                        <input type="file" accept="image/*" onChange={handleEditImageUpload} className="hidden" />
                                        <ImageIcon size={24} className="text-[#161415]/40" />
                                        <span className="text-sm font-bold text-[#161415]/50">Select an Image File</span>
                                    </label>
                                </div>
                                {editCoverFileUrl && (
                                    <div className="mb-6 flex justify-center">
                                        <img loading="lazy" decoding="async" src={editCoverFileUrl} alt="Preview" className="w-24 h-24 rounded-full object-cover border border-black/10 shadow-md" />
                                    </div>
                                )}
                                <motion.button {...pressProps('pill')} type="submit" className="w-full py-4 rounded-[18px] font-bold text-white shadow-lg" style={{ backgroundColor: C.coral }}>
                                    Save Cover
                                </motion.button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default SonicFocusViewMobile;