import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Image as ImageIcon, Search, ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCategorizedGlobalLibrary, getGlobalExerciseLibrary } from '../data/globalExerciseRegistry';
import { getUserId } from '../utils/auth';
import { findExerciseByName } from '../utils/exerciseDB';
import { toast } from '../utils/toast';
import { T } from '../utils/theme';
import { mediaUrl } from '../utils/apiHostFix';

/* ─── INLINE EXERCISE DETAIL SHEET ─── */
const ExerciseDetailSheet = ({ ex, onClose }) => {
    const [dbData, setDbData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [imgIdx, setImgIdx] = useState(0);

    useEffect(() => {
        if (ex?.name) {
            setLoading(true);
            setDbData(null);
            findExerciseByName(ex.name).then(data => {
                setDbData(data || null);
                setLoading(false);
            }).catch(() => setLoading(false));
        }
    }, [ex?.name]);

    const images = dbData?.imageUrls || [];
    const instructions = dbData?.instructions || [];

    return (
        <motion.div className="fixed inset-0 z-[200] flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                className="relative w-full rounded-t-[36px] bg-[#F6F4F1] overflow-hidden"
                style={{ maxHeight: '88dvh', overflowY: 'auto' }}
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
                <div className="sticky top-0 right-0 p-5 flex justify-end z-10 bg-[#F6F4F1]/80 backdrop-blur-sm">
                    <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
                        <X size={20} />
                    </motion.button>
                </div>

                <div className="px-8 pb-14 -mt-4">
                    <p className="text-[12px] font-black tracking-[0.04em] text-[#F95C4B] mb-2">動作詳情</p>
                    <h2 className="text-3xl font-black text-[#161415] mb-2 leading-tight uppercase">{ex.name}</h2>
                    {ex.targetLabel && (
                        <div className="flex items-center gap-2 mb-6">
                            <span className="text-xs font-black text-[#F95C4B] uppercase tracking-wider">{ex.targetLabel}</span>
                            {ex.equipment && <><span className="text-[#161415]/20">·</span><span className="text-xs font-bold text-[#161415]/40 uppercase tracking-wider">{ex.equipment}</span></>}
                        </div>
                    )}

                    {loading && (
                        <div className="py-16 flex flex-col items-center gap-4">
                            <div className="w-8 h-8 border-2 border-[#161415]/10 border-t-[#F95C4B] rounded-full animate-spin" />
                            <span className="text-[9px] font-bold tracking-widest opacity-40 uppercase">Loading Data...</span>
                        </div>
                    )}

                    {!loading && images.length > 0 && (
                        <div className="mb-8 rounded-3xl overflow-hidden aspect-video bg-black/5 relative">
                            <img loading="lazy" decoding="async" src={images[imgIdx]} alt={ex.name} className="w-full h-full object-contain" />
                            {images.length > 1 && (
                                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                                    {images.map((_, i) => (
                                        <button key={i} onClick={() => setImgIdx(i)} className={`h-1 rounded-full transition-all ${i === imgIdx ? 'w-6 bg-[#F95C4B]' : 'w-2 bg-black/20'}`} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && instructions.length > 0 && (
                        <div className="space-y-6">
                            <h3 className="text-[9px] font-black tracking-[0.2em] opacity-40 uppercase">How to Perform</h3>
                            <div className="space-y-4">
                                {instructions.map((step, i) => (
                                    <div key={i} className="flex gap-4">
                                        <div className="w-6 h-6 rounded-lg bg-black/5 flex items-center justify-center shrink-0 text-[11px] font-black">{i + 1}</div>
                                        <p className="text-[14px] leading-relaxed text-[#161415]/80 font-medium">{step}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!loading && !dbData && (
                        <div className="py-10 text-center">
                            <p className="text-[13px] text-[#161415]/40 font-medium">這個動作還沒有詳細資料</p>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// --- Colors for Minimalist UI ---
const P = {
  paper: T.PAPER,
  stone: T.STONE,
  pebble: T.PEBBLE,
  black: T.BLACK,
  ink: T.BLACK,
  muted: 'rgba(22,20,21,0.5)',
  coral: T.CORAL,
  ember: T.EMBER,
  hairline: '1px solid rgba(22,20,21,0.06)',
};

const TIER_META = {
    1: { label: 'T1 Compound', color: P.coral },
    2: { label: 'T2 Accessory', color: P.coral },
    3: { label: 'T3 Isolation', color: P.coral },
    9: { label: 'Custom', color: P.coral }
};

// Image Thumbnail Component
const ExThumb = ({ equipment, nameEn, imageUrl, size = 48, isCustom = false }) => {
    const [imgErr, setImgErr] = useState(false);
    
    const [dbUrl, setDbUrl] = useState(null);

    useEffect(() => {
        // [修復] 自訂動作若沒上傳照片，不抓取資料庫圖片，直接跳轉 Emoji Fallback
        if (!imageUrl && !isCustom) {
            const fetchImg = async () => {
                const exData = await findExerciseByName(nameEn || '');
                if (exData?.gifUrl) {
                    setDbUrl(exData.gifUrl);
                } else if (nameEn) {
                    // Fallback to direct path if fuzzy match fails but nameEn exists
                    const k = nameEn.toLowerCase().replace(/ /g, '_');
                    setDbUrl(`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${k}/0.jpg`);
                }
            };
            fetchImg();
        }
    }, [nameEn, imageUrl, isCustom]);

    if (imageUrl && !imgErr) {
        return (
            <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: P.stone, position: 'relative' }}>
                <img loading="lazy" decoding="async" src={mediaUrl(imageUrl)} alt="Exercise" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgErr(true)} />
            </div>
        );
    }
    
    if (dbUrl && !imgErr) {
        return (
            <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: P.stone, position: 'relative' }}>
                <img loading="lazy" decoding="async" src={dbUrl} alt="Exercise" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgErr(true)} />
            </div>
        );
    }

    // Fallback emoji
    const getFallback = (eq) => {
        if (!eq) return '🏋️';
        const e = eq.toLowerCase();
        if (e.includes('barbell')) return '🏋️';
        if (e.includes('dumbbell')) return '💪';
        if (e.includes('cable') || e.includes('machine')) return '⚙️';
        if (e.includes('bodyweight')) return '🧍';
        return '🏋️';
    };

    return (
        <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 8, background: P.stone, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45 }}>
            {getFallback(equipment)}
        </div>
    );
};

const CustomExerciseLibraryViewMobile = () => {
    const navigate = useNavigate();
    const userId = getUserId();

    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All');
    const [globalLib, setGlobalLib] = useState([]);
    const [customExercises, setCustomExercises] = useState([]);
    const [showAddSheet, setShowAddSheet] = useState(false);
    const [selectedExercise, setSelectedExercise] = useState(null);

    // 「臀」獨立成分類（仍保留在 Legs 內可見，因臀推也屬腿日）
    const categories = ['All', 'Chest', 'Back', 'Legs', 'Glutes', 'Shoulder', 'Arms', 'Core', 'Custom'];

    const fetchData = async () => {
        // 1. Get global master DB
        const globalItems = getGlobalExerciseLibrary();
        setGlobalLib(globalItems);

        // 2. Fetch custom exercises for user
        try {
            const res = await fetch(`http://${window.location.hostname}:8000/api/exercises/custom?user_id=${userId}`);
            if (res.ok) {
                const data = await res.json();
                setCustomExercises(data.exercises || []);
            }
        } catch (e) {
            console.error('Failed to fetch custom exercises:', e);
        }
    };

    useEffect(() => {
        fetchData();
    }, [userId]);

    // Merge and filter
    const displayList = useMemo(() => {
        let merged = [...globalLib, ...customExercises];
        
        // Remove exact duplicates by name (custom overrides global if same name)
        const nameMap = new Map();
        merged.forEach(ex => {
            nameMap.set(ex.name.toLowerCase().replace(/\s/g, ''), ex);
        });
        merged = Array.from(nameMap.values());

        return merged.filter(ex => {
            const matchQ = !query || ex.name.toLowerCase().includes(query.toLowerCase()) || (ex.nameEn && ex.nameEn.toLowerCase().includes(query.toLowerCase()));
            
            if (category === 'All') return matchQ;
            if (category === 'Custom') return matchQ && (ex.sourcePlan === 'Custom' || ex.userId);

            const catLower = category.toLowerCase();
            let matchC = false;
            const bodyCat = ex.bodyCategory || ex.cat;
            
            if (catLower === 'chest') {
                matchC = bodyCat === 'push' && (ex.subPart || '').startsWith('chest');
            } else if (catLower === 'shoulder') {
                matchC = bodyCat === 'push' && (ex.subPart || '').startsWith('delt');
            } else if (catLower === 'back') {
                matchC = bodyCat === 'back';
            } else if (catLower === 'legs') {
                // 腿 = 整個下肢（含臀），臀推也算腿日
                matchC = bodyCat === 'lower';
            } else if (catLower === 'glutes') {
                // 臀 = 下肢中 subPart 為 glutes 者（臀大肌動作）
                matchC = bodyCat === 'lower' && ex.subPart === 'glutes';
            } else if (catLower === 'arms') {
                matchC = bodyCat === 'arms';
            } else if (catLower === 'core') {
                matchC = bodyCat === 'core';
            } else {
                matchC = bodyCat === catLower;
            }

            return matchQ && matchC;
        }).sort((a, b) => {
            // 依「動作等級」排序，主要動作排前面：
            // 1) 複合動作(compound) 永遠在隔離動作(isolation) 之前
            // 2) 同類型再比 tier（1=大重量主項 → 3=收尾隔離）
            // 3) 再比神經壓力（extreme > high > medium > low）讓最硬的主項在最上
            const typeRank = (x) => (x.type === 'compound' ? 0 : x.type === 'isolation' ? 2 : 1);
            const cnsRank = (x) => ({ extreme: 0, high: 1, medium: 2, low: 3 }[x.cns] ?? 2);
            const tr = typeRank(a) - typeRank(b);
            if (tr) return tr;
            const ti = (a.tier || 9) - (b.tier || 9);
            if (ti) return ti;
            return cnsRank(a) - cnsRank(b);
        });
    }, [globalLib, customExercises, query, category]);

    const handleCustomAdded = () => {
        setShowAddSheet(false);
        fetchData(); // Refresh list
    };

    return (
        <div style={{ minHeight: '100dvh', background: P.paper, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)' }}>
            
            {/* Header */}
            <div style={{ padding: 'env(safe-area-inset-top, 40px) 20px 16px', background: P.paper, borderBottom: P.hairline, position: 'sticky', top: 0, zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <motion.button {...pressProps('row')} onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, marginLeft: -8, display: 'flex', alignItems: 'center', color: P.black }}>
                        <ChevronLeft size={24} strokeWidth={1.5} />
                    </motion.button>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase', color: P.black }}>Exercise Library</div>
                        <div style={{ fontSize: 11, color: P.muted, fontWeight: 700, marginTop: 2 }}>{displayList.length} ITEMS ARCHIVED</div>
                    </div>
                    <motion.button {...pressProps('row')} onClick={() => setShowAddSheet(true)} style={{ background: P.black, color: P.paper, border: 'none', width: 40, height: 40, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <Plus size={22} />
                    </motion.button>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: 20 }}>
                    <Search size={16} color={P.muted} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input 
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Filter by name or equipment..."
                        style={{ width: '100%', padding: '16px 16px 16px 44px', border: P.hairline, borderRadius: 12, background: P.stone, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: P.black, fontWeight: 500, letterSpacing: '0.01em' }}
                    />
                </div>

                {/* Categories */}
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                    {categories.map(c => (
                        <motion.button {...pressProps('row')} key={c} onClick={() => setCategory(c)}
 style={{ 
 padding: '8px 18px', borderRadius: 18, flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
 background: category === c ? P.black : 'transparent',
 color: category === c ? P.paper : P.muted,
 border: category === c ? `1px solid ${P.black}` : `1px solid ${P.pebble}`,
 transition: 'all 0.2s ease'
 }}
 >
                            {c}
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 40px' }}>
                {displayList.map((ex, i) => {
                    const t = ex.tier || 3;
                    const meta = TIER_META[t] || TIER_META[3];
                    return (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i, 6) * 0.03 }}
                            key={i}
                            onClick={() => setSelectedExercise(ex)}
                            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderBottom: P.hairline, cursor: 'pointer' }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <ExThumb
                                equipment={ex.equipment}
                                nameEn={ex.nameEn}
                                imageUrl={ex.image_url}
                                size={56}
                                isCustom={!!(ex.sourcePlan === 'Custom' || ex.userId)}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: P.black, marginBottom: 4, letterSpacing: '-0.01em' }}>{ex.name}</div>
                                <div style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    <span style={{ color: P.coral, fontWeight: 900 }}>{ex.targetLabel || ex.bodyCategory || ex.cat || 'Other'}</span>
                                    {/* 多關節動作的次要肌群標籤 */}
                                    {Array.isArray(ex.secondaryLabels) && ex.secondaryLabels.map((sl) => (
                                        <span key={sl} style={{ color: 'rgba(22,20,21,0.45)', fontWeight: 700, background: 'rgba(22,20,21,0.05)', padding: '1px 6px', borderRadius: 4 }}>{sl}</span>
                                    ))}
                                    {ex.equipment && (
                                        <>
                                            <span style={{ color: P.pebble }}>•</span>
                                            <span style={{ color: P.muted, fontWeight: 600 }}>{ex.equipment}</span>
                                        </>
                                    )}
                                    {ex.sourcePlan === 'Custom' && <span style={{ fontSize: 11, background: P.coral, color: 'white', padding: '2px 8px', borderRadius: 2, fontWeight: 900, marginLeft: 4 }}>CUSTOM</span>}
                                </div>
                            </div>
                            <ChevronRight size={18} color={P.pebble} />
                        </motion.div>
                    );
                })}
                {displayList.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: P.muted, fontSize: 14 }}>
                        無動作資料，可點擊右上角新增自訂動作
                    </div>
                )}
            </div>

            {/* Add Custom Exercise Sheet */}
            <AnimatePresence>
                {showAddSheet && <AddCustomExerciseSheet onClose={() => setShowAddSheet(false)} onSuccess={handleCustomAdded} userId={userId} />}
            </AnimatePresence>

            {/* Exercise Detail Sheet */}
            <AnimatePresence>
                {selectedExercise && (
                    <ExerciseDetailSheet
                        ex={selectedExercise}
                        onClose={() => setSelectedExercise(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// Add Sheet Component
const AddCustomExerciseSheet = ({ onClose, onSuccess, userId }) => {
    const [formData, setFormData] = useState({
        name: '', nameEn: '', cat: 'chest', tier: '2', subPart: 'chest_mid', equipment: 'dumbbell'
    });
    const [imageFile, setImageFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [loading, setLoading] = useState(false);

    const update = (k, v) => setFormData(p => ({ ...p, [k]: v }));

    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
            setPreviewUrl(URL.createObjectURL(e.target.files[0]));
        }
    };

    const submit = async () => {
        if (!formData.name) return toast.error('請填寫動作名稱');
        setLoading(true);
        const form = new FormData();
        form.append('user_id', userId);
        form.append('name', formData.name);
        form.append('nameEn', formData.nameEn);
        form.append('cat', formData.cat);
        form.append('tier', formData.tier);
        form.append('subPart', formData.subPart);
        form.append('equipment', formData.equipment);
        
        if (imageFile) form.append('image', imageFile);

        try {
            const res = await fetch(`http://${window.location.hostname}:8000/api/exercises/custom`, {
                method: 'POST', body: form
            });
            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json();
                toast.error('上傳失敗: ' + (data.detail || '未知錯誤'));
            }
        } catch (e) {
            toast.error('上傳失敗: 網路錯誤');
        }
        setLoading(false);
    };

    return (
        <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ 
                position: 'fixed', inset: 0, zIndex: 100, background: P.paper, 
                display: 'flex', flexDirection: 'column', padding: 'env(safe-area-inset-top, 40px) 24px 40px',
                fontFamily: 'var(--font-display)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
                <h2 style={{ fontSize: 24, fontWeight: 400, color: P.black, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Exercise</h2>
                <motion.button {...pressProps('row')} onClick={onClose} style={{ background: P.stone, border: 'none', width: 36, height: 36, borderRadius: 18, color: P.black, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</motion.button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                    {/* Image Upload Area */}
                    <div 
                        onClick={() => document.getElementById('ex-img-input').click()}
                        style={{ 
                            width: '100%', height: 220, borderRadius: 18, border: `2px dashed ${P.pebble}`,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            background: previewUrl ? `url(${previewUrl}) center/cover no-repeat` : P.stone,
                            cursor: 'pointer', overflow: 'hidden', position: 'relative',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        {!previewUrl && (
                            <>
                                <ImageIcon size={36} color={P.pebble} />
                                <span style={{ fontSize: 9, color: P.muted, marginTop: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Upload Exercise Media</span>
                            </>
                        )}
                        <input id="ex-img-input" type="file" hidden accept="image/*" onChange={handleImageChange} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: P.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Action Name (Traditional Chinese)</label>
                            <input value={formData.name} onChange={e => update('name', e.target.value)} placeholder="e.g. 戰繩" style={{ width: '100%', padding: '16px 18px', borderRadius: 12, border: P.hairline, background: 'transparent', color: P.black, boxSizing: 'border-box', outline: 'none', fontSize: 16, fontWeight: 500 }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: P.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Action Name (English)</label>
                            <input value={formData.nameEn} onChange={e => update('nameEn', e.target.value)} placeholder="e.g. Battle Ropes" style={{ width: '100%', padding: '16px 18px', borderRadius: 12, border: P.hairline, background: 'transparent', color: P.black, boxSizing: 'border-box', outline: 'none', fontSize: 16, fontWeight: 500 }} />
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: P.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Focus Group</label>
                                <select value={formData.cat} onChange={e => update('cat', e.target.value)} style={{ width: '100%', padding: '16px 18px', borderRadius: 12, border: P.hairline, background: P.stone, color: P.black, boxSizing: 'border-box', fontSize: 15, fontWeight: 500, appearance: 'none' }}>
                                    <option value="chest">Chest</option>
                                    <option value="back">Back</option>
                                    <option value="legs">Legs</option>
                                    <option value="shoulder">Shoulder</option>
                                    <option value="arms">Arms</option>
                                    <option value="core">Core</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: P.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Impact Tier</label>
                                <select value={formData.tier} onChange={e => update('tier', e.target.value)} style={{ width: '100%', padding: '16px 18px', borderRadius: 12, border: P.hairline, background: P.stone, color: P.black, boxSizing: 'border-box', fontSize: 15, fontWeight: 500, appearance: 'none' }}>
                                    <option value="1">T1 - Compound</option>
                                    <option value="2">T2 - Accessory</option>
                                    <option value="3">T3 - Isolation</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: 9, fontWeight: 800, color: P.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Equipment Protocol</label>
                            <select value={formData.equipment} onChange={e => update('equipment', e.target.value)} style={{ width: '100%', padding: '16px 18px', borderRadius: 12, border: P.hairline, background: P.stone, color: P.black, boxSizing: 'border-box', fontSize: 15, fontWeight: 500, appearance: 'none' }}>
                                <option value="barbell">Barbell</option>
                                <option value="dumbbell">Dumbbell</option>
                                <option value="machine">Machine</option>
                                <option value="cable">Cable</option>
                                <option value="bodyweight">Bodyweight</option>
                                <option value="kettlebell">Kettlebell</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
                <motion.button {...pressProps('row')} 
 onClick={onClose}
 style={{ padding: '20px', borderRadius: 18, border: P.hairline, background: 'transparent', color: P.black, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 12, cursor: 'pointer' }}
 >
                    Dismiss
                </motion.button>
                <motion.button {...pressProps('row')} 
 onClick={submit}
 disabled={loading || !formData.name}
 style={{ 
 padding: '20px', borderRadius: 18, border: 'none', background: P.black, color: P.paper, 
 fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 12, 
 cursor: 'pointer', opacity: (loading || !formData.name) ? 0.5 : 1,
 boxShadow: '0 12px 30px rgba(0,0,0,0.15)',
 transition: 'all 0.3s ease'
 }}
 >
                    {loading ? 'Archiving...' : 'Register Exercise'}
                </motion.button>
            </div>
        </motion.div>
    );
};

export default CustomExerciseLibraryViewMobile;
