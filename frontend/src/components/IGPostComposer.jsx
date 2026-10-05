import React, { useState, useEffect, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Check, Flame, Camera, MapPin, UserPlus, Activity, Users, Calendar, ChevronRight } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { createPortal } from 'react-dom';

import api from '../api/client';
import { DataStatCard, MeetupCard } from './PostBodyCards';
import { recordFirst } from '../utils/momentEngine';
import { VISIBILITY, VISIBILITY_OPTIONS, COMMUNITY_TARGETS as TARGETS_BASE } from '../utils/followGraph';

// ─── 真實近期訓練：防禦式正規化（後端欄位命名分歧，逐一 fallback） ──────────
const num = (...vals) => { for (const v of vals) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; } return 0; };
const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const days = Math.floor((Date.now() - d) / 86400000);
    if (days <= 0) return '今天'; if (days === 1) return '昨天'; if (days < 7) return `${days} 天前`;
    return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
};
const fmtPace = (sec) => { if (!sec) return '--'; const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtDur = (sec) => { if (!sec) return '--'; const s = Math.round(sec); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };

const normalizeCardio = (s, i) => {
    const meters = num(s.distance_meters);
    const distKm = num(s.distance_km, s.distanceKm, s.dist, s.distance) || (meters ? meters / 1000 : 0);
    const durSec = num(s.duration, s.duration_seconds) || num(s.duration_mins, s.durationMins) * 60;
    const paceSec = num(s.avg_pace_per_km, s.avg_pace, s.paceSec, s.pace) || (distKm && durSec ? durSec / distKm : 0);
    const cal = num(s.calories, s.calories_burned, s.kcal);
    const dateIso = s.created_at || s.date || null;
    return {
        id: s.session_id || s.id || `run_${i}`, type: 'run',
        title: s.title || s.name || '跑步訓練',
        date: fmtDate(dateIso),
        dist: distKm ? distKm.toFixed(1) : '0', unit: 'km',
        pace: `${fmtPace(paceSec)}`, dur: fmtDur(durSec),
        // 🔢 帶上原始數值 + ISO 日期，發文後卡片才不會退回 0.00 / invalid date
        distanceKm: +distKm.toFixed(2) || 0, paceSec: Math.round(paceSec) || 0, durationSec: Math.round(durSec) || 0,
        calories: Math.round(cal) || 0, dateIso,
        _ts: new Date(dateIso || 0).getTime() || 0,
    };
};
const normalizeStrength = (w, i) => {
    const volKg = num(w.total_volume, w.volume_kg, w.totalVolume, w.volume);
    const exs = w.exercises || w.processedExercises || [];
    const main = Array.isArray(exs) && exs.length ? (exs[0].name || exs[0].exercise_name || '') : '';
    const setCount = Array.isArray(exs)
        ? exs.reduce((n, e) => n + (Array.isArray(e.sets) ? e.sets.length : num(e.sets, e.set_count)), 0)
        : num(w.total_sets, w.sets);
    const durSec = num(w.duration, w.duration_seconds) || num(w.duration_mins, w.durationMins) * 60;
    const cal = num(w.calories, w.calories_burned, w.kcal);
    const isPR = !!(w.is_pr || w.hasPR || w.pr);
    const dateIso = w.created_at || w.date || w.completed_at || null;
    return {
        id: w.session_id || w.workout_id || w.id || `str_${i}`, type: 'strength',
        title: w.title || w.workout_name || w.name || '重量訓練',
        date: fmtDate(dateIso),
        vol: volKg ? (volKg / 1000).toFixed(1) : '0', unit: 't',
        main: main || 'PR Set',
        // 🔢 帶上原始數值 + ISO 日期，發文後健身卡片才有真數據（不再全是 0）
        volumeKg: Math.round(volKg) || 0, exerciseCount: Array.isArray(exs) ? exs.length : 0,
        setCount: setCount || 0, durationSec: Math.round(durSec) || 0, calories: Math.round(cal) || 0,
        intensity: isPR ? 'PR' : (w.intensity || w.intensityLabel || '—'), dateIso,
        _ts: new Date(dateIso || 0).getTime() || 0,
    };
};

/* ── 發布目標：可複選的社群 ────────────────────────────────────────────
   跑步社群與健身社群共用同一份貼文資料，只是出現在哪個 feed 由 targets 決定。
   都不選 → 只留在個人檔案（Profile grid）。 */
const TARGET_DESC = { run: 'Stride 動態', fitness: '重訓動態' };
const COMMUNITY_TARGETS = TARGETS_BASE.map((t) => ({ ...t, desc: TARGET_DESC[t.id] || '' }));

const IGPostComposer = ({ userId, onClose, onPost, community = 'cardio' }) => {
    const isFitnessCommunity = community === 'fitness' || community === 'strength';
    const [step, setStep] = useState(0); // 0 = Media, 1 = Details & Data Overlay
    
    const [image, setImage] = useState(null);
    const [title, setTitle] = useState('');
    const [caption, setCaption] = useState('');
    const [selectedWorkout, setSelectedWorkout] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    // 揪團模式：填時間 / 地點 / 人數
    const [meetup, setMeetup] = useState(null); // null = 一般貼文；{ when, place, slots } = 揪團
    const [dataMode, setDataMode] = useState(false); // true = 純數據發文（無照片，純數據排版）
    const [recentWorkouts, setRecentWorkouts] = useState([]);
    const [loadingWorkouts, setLoadingWorkouts] = useState(true);
    const [tags, setTags] = useState([]);        // 標註用戶
    const [location, setLocation] = useState(''); // 新增地點
    const [tagInput, setTagInput] = useState('');
    const [showTagField, setShowTagField] = useState(false);
    const [showLocField, setShowLocField] = useState(false);
    // 標註用戶：真實用戶搜尋（/api/user/profiles），不再只是手動輸入文字
    const [allUsers, setAllUsers] = useState(null); // null = 未載入
    useEffect(() => {
        if (!showTagField || allUsers !== null) return;
        api.get('/api/user/profiles').then(r => {
            const dict = r?.data || {};
            const list = Object.entries(dict)
                .map(([id, p]) => ({ id, name: p?.name || p?.displayName || p?.username || '' }))
                .filter(u => u.name && u.id !== userId);
            setAllUsers(list);
        }).catch(() => setAllUsers([]));
    }, [showTagField, allUsers, userId]);
    const tagSuggestions = (tagInput.trim() && Array.isArray(allUsers))
        ? allUsers.filter(u =>
            u.name.toLowerCase().includes(tagInput.trim().toLowerCase()) &&
            !tags.includes(u.name)
        ).slice(0, 5)
        : [];
    const [orientation, setOrientation] = useState('portrait'); // portrait 4/5 | landscape 16/10
    const [imgPos, setImgPos] = useState(50); // objectPosition Y %，可拖移

    /* ── 發布設定 ──────────────────────────────────────────────────────
       targets    要同步到哪些社群（可複選；空陣列 = 只留個人檔案）
       visibility 誰可以看：public 公開 / followers 粉絲 / friends 僅好友
       預設把「現在所在的社群」先勾起來，符合使用者當下的心智模型。 */
    const [targets, setTargets] = useState(
        () => (community === 'fitness' ? ['fitness'] : ['run'])
    );
    const [visibility, setVisibility] = useState(VISIBILITY.PUBLIC);

    const toggleTarget = (id) => {
        setTargets(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
        if (window.navigator?.vibrate) window.navigator.vibrate(8);
    };
    const dragRef = useRef(null);

    // 載入使用者真實近期訓練（跑步 + 重量），失敗或無資料則顯示空狀態（不再用假資料）
    useEffect(() => {
        let alive = true;
        const load = async () => {
            const out = [];
            // 兩種訓練都抓（使用者的重訓不該在跑步社群發文時「看起來像沒有資料」）；
            // 排序時讓「本社群類型」優先，再依時間新→舊。
            const [strength, cardio] = await Promise.all([
                api.get(`/api/workout/history/${userId}?limit=10`).catch(() => null),
                api.get(`/api/cardio/sessions/${userId}?limit=10`).catch(() => null),
            ]);
            const sArr = strength?.data?.history || strength?.data?.sessions || strength?.data || [];
            if (Array.isArray(sArr)) out.push(...sArr.map(normalizeStrength));
            const cArr = cardio?.data?.sessions || cardio?.data?.runs || cardio?.data || [];
            if (Array.isArray(cArr)) out.push(...cArr.map(normalizeCardio));
            // 最近 5 次：本社群類型優先 → 時間新→舊
            const preferType = isFitnessCommunity ? 'strength' : 'run';
            const cleaned = out
                .filter(w => w && (Number(w.dist) > 0 || Number(w.vol) > 0))
                .sort((a, b) => (a.type === preferType ? -1 : 0) - (b.type === preferType ? -1 : 0) || b._ts - a._ts)
                .slice(0, 5);
            if (alive) { setRecentWorkouts(cleaned); setLoadingWorkouts(false); }
        };
        load().catch(() => { if (alive) { setRecentWorkouts([]); setLoadingWorkouts(false); } });
        return () => { alive = false; };
    }, [userId]);

    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setImage(ev.target.result);
                setDataMode(false);
                setMeetup(null);
                setStep(1);
            };
            reader.readAsDataURL(file);
        }
    };

    // 可發文條件：照片 / 文字 / 連結訓練 任一即可（不再強制照片）
    const canPost = !!image || !!title.trim() || !!caption.trim() || !!selectedWorkout || !!meetup;

    const handleShare = () => {
        if (!canPost || isUploading) return;
        setIsUploading(true);

        // 對齊 handleNewPost 期待的資料結構：images[] / activity / linkedWorkout / caption
        const isRunWorkout = selectedWorkout?.type === 'run';
        const activity = isRunWorkout
            ? {
                distance: parseFloat(selectedWorkout.dist) || 0,
                pace: selectedWorkout.pace,
                duration: selectedWorkout.dur,
            }
            : null;

        setTimeout(() => {
            const nowIso = new Date().toISOString();
            const payload = {
                images: image ? [image] : [],
                title: title.trim() || null,
                caption,
                activity,                 // 有跑步訓練 → 帶上跑步數據，會被當成 run 貼文
                linkedWorkout: selectedWorkout, // 數據卡（跑步或重訓）
                meetup: meetup ? meetup : null, // 揪團資訊
                tags,                     // 標註用戶
                location: location || null, // 地點
                orientation, imgPos,      // 照片比例與位置
                // ── 發布設定 ──
                targets,                  // ['run'] / ['fitness'] / 兩者 / []
                communities: targets,     // 別名，讓舊消費端也讀得到（欄位別名地獄防禦）
                visibility,               // public | followers | friends
                // 🩹 photo 欄位：Profile grid 與部分 feed 直接讀 post.photo，
                //    只給 images[] 會導致「發了有照片但沒有預覽圖」。兩個都給。
                photo: image || null,
                // ⏰ 打卡照片也一定帶上發文時間，避免時間欄空白
                created_at: nowIso,
                timestamp: nowIso,
                time: nowIso,
            };
            onPost(payload);
            setIsUploading(false);
            // ✨ 第一篇發文 → 滿版時刻。composer 關閉、回到 Feed 的空檔正好上滿版，
            //    不會壓住發文流程本身。
            try { recordFirst(userId, 'first_post'); } catch { /* */ }
            onClose();
        }, 1200);
    };

    return createPortal(
        <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed inset-0 z-[999999] text-[#161415] flex flex-col font-sans"
            style={{ maxWidth: '430px', margin: '0 auto', background: '#E4DED2' }}
        >

            {/* ── HEADER — Swiss 細線 ── */}
            <div className="flex items-center justify-between px-5 flex-shrink-0 z-50"
                 style={{ height: 'calc(60px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)', borderBottom: '1px solid rgba(22,20,21,0.08)' }}>
                <motion.button {...pressProps('icon')} aria-label={step === 0 ? '關閉' : '返回'} onClick={step === 0 ? onClose : () => setStep(0)} className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center transition">
                    <X size={22} strokeWidth={1.8} />
                </motion.button>
                <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 400, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.55)' }}>
                    {step === 0 ? 'New Post' : (meetup ? 'Meetup' : 'Details')}
                </h1>
                <div className="w-14 flex justify-end">
                    {step === 0 ? (
                        <span className="w-10" />
                    ) : (
                        <motion.button {...pressProps('row')}
 onClick={handleShare}
 disabled={!canPost || isUploading}
 aria-label="發布貼文"
 style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em', color: (!canPost || isUploading) ? 'rgba(22,20,21,0.2)' : '#F95C4B', background: 'none', border: 'none', cursor: (!canPost || isUploading) ? 'not-allowed' : 'pointer' }}
 >
                            {isUploading ? '發布中…' : '發布'}
                        </motion.button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                
                {/* ── STEP 0: 選擇發文形式（Swiss editorial chooser） ── */}
                {step === 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col px-6 pt-8">
                        {/* Masthead */}
                        <div className="mb-7">
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 400, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.45)', margin: '0 0 6px' }}>— Choose a format</p>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: '#161415', margin: 0, lineHeight: 1 }}>想分享什麼？</h2>
                        </div>

                        <input type="file" id="imageUpload" accept="image/*" className="hidden" onChange={handleImageSelect} />

                        <div className="flex flex-col gap-3">
                            {/* 照片貼文 */}
                            {[
                                { key: 'photo', icon: Camera, zh: '照片貼文', en: 'Photo', desc: '從相簿選一張訓練照片', as: 'label' },
                                // 🗑️ 「純文字/數據」格式已移除（會產生 NaN/invalid date 的數據卡）→ 分享數據改走結算頁的分享工作室。
                                { key: 'meetup', icon: Users, zh: isFitnessCommunity ? '揪團 / 約健身' : '揪團 / 約跑', en: 'Meetup', desc: isFitnessCommunity ? '揪大家一起練，填時間地點' : '揪大家一起跑，填時間地點', as: 'button', accent: true, onClick: () => { setDataMode(false); setImage(null); setMeetup({ when: '', place: '', route: '', dist: '', pace: 'easy', slots: '' }); setStep(1); } },
                            ].map(({ key, icon: Icon, zh, en, desc, as, onClick, accent }, i) => {
                                // §4 三材質分層：01 Paper 暖紙 → 02 Mist 冷灰（退後地面）→ 03 深鈦＋唯一 coral（高級金屬三式）
                                const dark = key === 'meetup';
                                const mist = key === 'data';
                                const ink = dark ? '#F6F4F1' : '#161415';
                                const inner = (
                                    <div style={{ position: 'relative', width: '100%' }}>
                                        {/* 大細編號 — 尺度跳躍（§5 律六） */}
                                        <span aria-hidden style={{ position: 'absolute', top: -6, right: 0, fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em', color: ink, opacity: dark ? 0.14 : 0.10, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                                            0{i + 1}
                                        </span>
                                        {/* kicker 開場（§5 律五）：直角 icon 框＋tracked caps */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                            <div style={{ width: 34, height: 34, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${dark ? 'rgba(249,92,75,0.45)' : 'rgba(207,198,184,0.9)'}`, background: 'transparent' }}>
                                                <Icon size={16} color={dark ? '#F95C4B' : '#161415'} strokeWidth={1.8} />
                                            </div>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: dark ? 'rgba(246,244,241,0.5)' : 'rgba(22,20,21,0.42)' }}>{en}</span>
                                        </div>
                                        {/* 標題 → 支撐文字，共享同一條左緣（§5 律一、二） */}
                                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                                            <div style={{ textAlign: 'left' }}>
                                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: ink, margin: 0, lineHeight: 1.1 }}>{zh}</h3>
                                                <p style={{ fontSize: 12, color: dark ? 'rgba(246,244,241,0.55)' : 'rgba(22,20,21,0.5)', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>{desc}</p>
                                            </div>
                                            <ChevronRight size={18} color={dark ? 'rgba(246,244,241,0.4)' : 'rgba(22,20,21,0.3)'} style={{ flexShrink: 0, marginBottom: 2 }} />
                                        </div>
                                    </div>
                                );
                                const cardStyle = {
                                    width: '100%', padding: '20px', borderRadius: 24, cursor: 'pointer', display: 'block',
                                    background: dark
                                        ? 'linear-gradient(165deg, #2A2724 0%, #161415 62%)'
                                        : mist ? '#E8E9E6' : '#F6F4F1',
                                    border: dark ? '1px solid rgba(246,244,241,0.07)' : `1px solid ${mist ? 'rgba(22,20,21,0.06)' : 'rgba(207,198,184,0.7)'}`,
                                    boxShadow: dark
                                        ? 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 34px rgba(22,20,21,0.22)'
                                        : mist ? 'none' : '0 6px 18px -10px rgba(22,20,21,0.12), inset 0 1px 0 rgba(255,255,255,0.85)',
                                };
                                const reveal = {
                                    initial: { opacity: 0, y: 14 },
                                    animate: { opacity: 1, y: 0 },
                                    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 6) * 0.07 }
                                };
                                return as === 'label' ? (
                                    <motion.label {...reveal} key={key} htmlFor="imageUpload" whileTap={{ scale: 0.97 }} style={cardStyle}>{inner}</motion.label>
                                ) : (
                                    <motion.button {...reveal} key={key} onClick={onClick} whileTap={{ scale: 0.97 }} style={{ ...cardStyle, textAlign: 'left' }}>{inner}</motion.button>
                                );
                            })}
                        </div>

                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(22,20,21,0.35)', textAlign: 'center', marginTop: 24, letterSpacing: '0.04em' }}>
                            照片非必填 · 三種形式都能附訓練數據
                        </p>
                    </motion.div>
                )}

                {/* ── STEP 1: PREVIEW & DETAILS ── */}
                {step === 1 && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col">
                        
                        {/* 預覽 — 只在有照片時顯示，瑞士極簡 */}
                        {image && (
                            <div className="px-6 pt-6">
                                {/* 直式 / 橫式 切換 */}
                                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                    {[{ id: 'portrait', zh: '直式' }, { id: 'landscape', zh: '橫式' }].map(o => (
                                        <motion.button {...pressProps('row')} key={o.id} onClick={() => setOrientation(o.id)}
 style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
 background: orientation === o.id ? '#161415' : 'rgba(22,20,21,0.05)', color: orientation === o.id ? '#F6F4F1' : 'rgba(22,20,21,0.55)', border: '1px solid ' + (orientation === o.id ? '#161415' : 'rgba(22,20,21,0.1)') }}>
                                            {o.zh}
                                        </motion.button>
                                    ))}
                                    <span style={{ marginLeft: 'auto', alignSelf: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(22,20,21,0.35)' }}>拖曳照片可調整位置</span>
                                </div>
                                <div
                                    ref={dragRef}
                                    onPointerDown={(e) => {
                                        const el = dragRef.current; if (!el) return;
                                        el.setPointerCapture(e.pointerId);
                                        const startY = e.clientY; const startPos = imgPos; const h = el.offsetHeight;
                                        const move = (ev) => { const dy = ev.clientY - startY; setImgPos(Math.max(0, Math.min(100, startPos - (dy / h) * 100))); };
                                        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                                        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
                                    }}
                                    className="w-full relative rounded-[18px] overflow-hidden"
                                    style={{ aspectRatio: orientation === 'landscape' ? '16/10' : '4/5', border: '1px solid rgba(22,20,21,0.08)', cursor: 'grab', touchAction: 'none' }}>
                                    <img loading="lazy" decoding="async" src={image} alt="貼文預覽" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `50% ${imgPos}%` }} draggable={false} />
                                    {selectedWorkout && (
                                        <div className="absolute left-0 right-0 bottom-0 p-4 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(22,20,21,0.85), transparent)' }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                                    {selectedWorkout.type === 'run' ? selectedWorkout.dist : selectedWorkout.vol}
                                                </span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{selectedWorkout.unit}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 純數據貼文預覽 — 共用 DataStatCard（與 Feed 發出後完全一致） */}
                        {dataMode && (() => {
                            const isRun = selectedWorkout?.type === 'run';
                            return (
                                <div className="px-6 pt-6">
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 400, letterSpacing: '0.16em', color: 'rgba(22,20,21,0.4)', margin: '0 0 10px' }}>— 預覽</p>
                                    {selectedWorkout ? (
                                        <DataStatCard
                                            type={isRun ? 'run' : 'fitness'}
                                            bigValue={isRun ? selectedWorkout.dist : selectedWorkout.vol}
                                            bigUnit={selectedWorkout.unit}
                                            label={isRun ? 'Total Distance' : 'Total Volume'}
                                            date={selectedWorkout.date}
                                            rows={isRun
                                                ? [
                                                    ['Pace', selectedWorkout.pace || '—'],
                                                    ['Time', selectedWorkout.dur || '—'],
                                                    ...(selectedWorkout.calories ? [['Calories', `${selectedWorkout.calories} kcal`]] : []),
                                                ]
                                                : [
                                                    ['Main Set', selectedWorkout.main || '—'],
                                                    ...(selectedWorkout.setCount ? [['Sets', `${selectedWorkout.setCount} 組`]] : []),
                                                    ...(selectedWorkout.durationSec ? [['Duration', fmtDur(selectedWorkout.durationSec)]] : []),
                                                    ['Intensity', selectedWorkout.intensity || '—'],
                                                ]}
                                        />
                                    ) : (
                                        <DataStatCard empty />
                                    )}
                                </div>
                            );
                        })()}

                        {/* 揪團貼文預覽 — 共用 MeetupCard（與 Feed 發出後完全一致：照片在上、卡在下） */}
                        {meetup && (
                            <div className="px-6 pt-6">
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 400, letterSpacing: '0.16em', color: 'rgba(22,20,21,0.4)', margin: '0 0 10px' }}>— 預覽</p>
                                {image && <div style={{ width: '100%', aspectRatio: '4/5', overflow: 'hidden', marginBottom: 14, borderRadius: 18 }}><img src={image} alt="路線" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
                                <MeetupCard meetup={meetup} joinLabel="我要參加" isFitness={isFitnessCommunity} />
                            </div>
                        )}

                        {/* POST SETTINGS AREA */}
                        <div className="px-6 pt-6 space-y-6">
                            {/* 標題 — 藝術雜誌式大標 */}
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={meetup ? (isFitnessCommunity ? '揪團標題（例：週末一起練胸）' : '揪團標題（例：週末河濱輕鬆跑）') : '標題（選填）'}
                                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#161415', paddingBottom: 4 }}
                            />
                            {/* 作者列 + 內文 */}
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#161415', background: 'rgba(22,20,21,0.08)', fontFamily: 'var(--font-body)' }}>我</div>
                                <textarea
                                    value={caption}
                                    onChange={(e) => setCaption(e.target.value)}
                                    placeholder={meetup ? (isFitnessCommunity ? '揪團說明：菜單、地點、集合方式…' : '揪團說明：路線、配速、集合方式…') : '分享這次訓練的心得…'}
                                    className="flex-1 bg-transparent text-[#161415] text-[15px] leading-relaxed resize-none outline-none placeholder:text-[#161415]/30 h-20"
                                    style={{ fontFamily: 'var(--font-body)', paddingTop: 6 }}
                                />
                            </div>

                            {/* 標註用戶 / 新增地點 — IG 式 action rows */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {/* 標註用戶 */}
                                <motion.button {...pressProps('row')} onClick={() => setShowTagField(v => !v)}
 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', background: 'none', border: 'none', borderTop: '1px solid rgba(22,20,21,0.08)', cursor: 'pointer' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <UserPlus size={18} color="rgba(22,20,21,0.55)" strokeWidth={1.8} />
                                        <span style={{ fontSize: 15, color: '#161415', fontFamily: 'var(--font-body)' }}>標註用戶</span>
                                    </div>
                                    {tags.length > 0
                                        ? <span style={{ fontSize: 13, color: '#F95C4B', fontFamily: 'var(--font-body)' }}>{tags.length} 人</span>
                                        : <ChevronRight size={18} color="rgba(22,20,21,0.3)" />}
                                </motion.button>
                                {showTagField && (
                                    <div style={{ padding: '4px 0 12px 30px' }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid rgba(22,20,21,0.12)', paddingBottom: 8 }}>
                                            <span style={{ color: 'rgba(22,20,21,0.4)', fontSize: 15 }}>@</span>
                                            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                                                placeholder="搜尋用戶名稱…"
                                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#161415', fontFamily: 'var(--font-body)' }} />
                                        </div>
                                        {/* 真實用戶搜尋結果 */}
                                        {tagInput.trim() && (
                                            <div style={{ marginTop: 8 }}>
                                                {allUsers === null ? (
                                                    <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.35)', margin: 0 }}>載入用戶中…</p>
                                                ) : tagSuggestions.length === 0 ? (
                                                    <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.35)', margin: 0 }}>找不到「{tagInput.trim()}」</p>
                                                ) : tagSuggestions.map(u => (
                                                    <motion.button {...pressProps('row')} key={u.id}
 onClick={() => { setTags(t => [...t, u.name]); setTagInput(''); }}
 style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                                        <span style={{ width: 28, height: 28, borderRadius: 99, background: 'rgba(22,20,21,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#161415' }}>{u.name[0]}</span>
                                                        <span style={{ fontSize: 14, color: '#161415', fontFamily: 'var(--font-body)' }}>{u.name}</span>
                                                    </motion.button>
                                                ))}
                                            </div>
                                        )}
                                        {tags.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                                {tags.map((t, i) => (
                                                    <span key={i} onClick={() => setTags(arr => arr.filter((_, j) => j !== i))}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, background: 'rgba(22,20,21,0.06)', fontSize: 12, color: '#161415', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                        @{t} <X size={11} />
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* 新增地點 */}
                                <motion.button {...pressProps('row')} onClick={() => setShowLocField(v => !v)}
 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', background: 'none', border: 'none', borderTop: '1px solid rgba(22,20,21,0.08)', cursor: 'pointer' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <MapPin size={18} color="rgba(22,20,21,0.55)" strokeWidth={1.8} />
                                        <span style={{ fontSize: 15, color: '#161415', fontFamily: 'var(--font-body)' }}>新增地點</span>
                                    </div>
                                    {location
                                        ? <span style={{ fontSize: 13, color: '#F95C4B', fontFamily: 'var(--font-body)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{location}</span>
                                        : <ChevronRight size={18} color="rgba(22,20,21,0.3)" />}
                                </motion.button>
                                {showLocField && (
                                    <div style={{ padding: '4px 0 12px 30px' }}>
                                        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="輸入地點"
                                            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#161415', borderBottom: '1px solid rgba(22,20,21,0.12)', paddingBottom: 8, fontFamily: 'var(--font-body)' }} />
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                            {['大安森林公園', '河濱公園', '象山', '台北田徑場'].map(loc => (
                                                <motion.button {...pressProps('row')} key={loc} onClick={() => setLocation(loc)}
 style={{ padding: '5px 11px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', background: location === loc ? '#161415' : 'rgba(22,20,21,0.05)', color: location === loc ? '#F6F4F1' : 'rgba(22,20,21,0.6)', border: '1px solid ' + (location === loc ? '#161415' : 'rgba(22,20,21,0.1)') }}>
                                                    {loc}
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 揪團表單 — 為跑者設計：時間 / 地點 / 路線 / 距離 / 配速強度 / 名額 */}
                            {meetup && (() => {
                                const fieldRow = (icon, node) => (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(22,20,21,0.12)', paddingBottom: 8 }}>
                                        {icon}{node}
                                    </div>
                                );
                                const inputStyle = { flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: '#161415', fontFamily: 'var(--font-body)' };
                                const chip = (active) => ({ padding: '6px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', background: active ? '#161415' : '#F6F4F1', color: active ? '#F6F4F1' : 'rgba(22,20,21,0.6)', border: '1px solid ' + (active ? '#161415' : 'rgba(207,198,184,0.8)') });
                                const PACES = isFitnessCommunity ? [
                                    { id: 'easy', zh: '輕鬆泵感', sub: '高次數 · 恢復' },
                                    { id: 'tempo', zh: '穩定增肌', sub: '中等強度' },
                                    { id: 'interval', zh: '大重量力量', sub: '低次數 · 重量' },
                                    { id: 'long', zh: '超級組 / 力竭', sub: '高強度' },
                                ] : [
                                    { id: 'easy', zh: '輕鬆跑', sub: '6:00+/km · 聊天配速' },
                                    { id: 'tempo', zh: '節奏跑', sub: '5:00–6:00/km' },
                                    { id: 'interval', zh: '間歇 / 速度', sub: '< 5:00/km' },
                                    { id: 'long', zh: 'LSD 長跑', sub: '拉長距離' },
                                ];
                                return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 22, background: '#E8E9E6', borderRadius: 24, padding: '20px', border: '1px solid rgba(22,20,21,0.06)' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.45)' }}>— 揪團資訊</span>

                                    {/* 時間 + 快捷 chip + 自訂 */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {fieldRow(<Calendar size={16} color="rgba(22,20,21,0.4)" strokeWidth={1.8} />,
                                            <input value={meetup.when} onChange={e => setMeetup(m => ({ ...m, when: e.target.value }))} placeholder="時間（可手打或選下方）" style={inputStyle} />)}
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {['今晚 19:00', '明早 06:00', '週六 06:00', '週日 16:00'].map(t => (
                                                <motion.button {...pressProps('row')} key={t} onClick={() => setMeetup(m => ({ ...m, when: t }))} style={chip(meetup.when === t)}>{t}</motion.button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 集合地點 */}
                                    {fieldRow(<MapPin size={16} color="rgba(22,20,21,0.4)" strokeWidth={1.8} />,
                                        <input value={meetup.place} onChange={e => setMeetup(m => ({ ...m, place: e.target.value }))} placeholder="集合地點" style={inputStyle} />)}

                                    {/* 路線 / 部位 */}
                                    {fieldRow(<Activity size={16} color="rgba(22,20,21,0.4)" strokeWidth={1.8} />,
                                        <input value={meetup.route} onChange={e => setMeetup(m => ({ ...m, route: e.target.value }))} placeholder={isFitnessCommunity ? '部位 / 菜單（例：胸 + 三頭）' : '路線（例：河濱往返）'} style={inputStyle} />)}

                                    {/* 距離 / 時長 + 快捷 */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {fieldRow(<Flame size={16} color="rgba(22,20,21,0.4)" strokeWidth={1.8} />,
                                            <input value={meetup.dist} onChange={e => setMeetup(m => ({ ...m, dist: e.target.value }))} inputMode="decimal" placeholder={isFitnessCommunity ? '時長（分鐘）' : '距離 km'} style={inputStyle} />)}
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {(isFitnessCommunity ? ['30', '45', '60', '90'] : ['3', '5', '10', '15', '21']).map(d => (
                                                <motion.button {...pressProps('row')} key={d} onClick={() => setMeetup(m => ({ ...m, dist: d }))} style={chip(meetup.dist === d)}>{isFitnessCommunity ? `${d}分` : `${d}K`}</motion.button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 配速 / 強度 */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.5)', fontFamily: 'var(--font-body)' }}>{isFitnessCommunity ? '訓練強度' : '配速強度'}</span>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            {PACES.map(p => {
                                                const active = meetup.pace === p.id;
                                                return (
                                                    <motion.button {...pressProps('row')} key={p.id} onClick={() => setMeetup(m => ({ ...m, pace: p.id }))}
 style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
 background: active ? 'linear-gradient(165deg, #2A2724 0%, #161415 62%)' : '#F6F4F1',
 border: '1px solid ' + (active ? 'rgba(246,244,241,0.07)' : 'rgba(207,198,184,0.8)'),
 boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 20px -8px rgba(22,20,21,0.30)' : 'none' }}>
                                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: active ? '#F6F4F1' : '#161415' }}>{p.zh}</div>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: active ? 'rgba(246,244,241,0.6)' : 'rgba(22,20,21,0.4)', marginTop: 2 }}>{p.sub}</div>
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* 名額 — stepper + 可手輸入 */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <UserPlus size={16} color="rgba(22,20,21,0.4)" strokeWidth={1.8} />
                                            <span style={{ fontSize: 15, color: '#161415', fontFamily: 'var(--font-body)' }}>名額</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <motion.button {...pressProps('row')} onClick={() => setMeetup(m => ({ ...m, slots: String(Math.max(0, (parseInt(m.slots) || 0) - 1)) }))}
 style={{ width: 32, height: 32, borderRadius: 18, border: '1px solid rgba(22,20,21,0.15)', background: 'transparent', color: '#161415', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</motion.button>
                                            <input value={meetup.slots} onChange={e => setMeetup(m => ({ ...m, slots: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder="不限"
                                                style={{ width: 48, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 300, color: '#161415', fontVariantNumeric: 'tabular-nums' }} />
                                            <motion.button {...pressProps('row')} onClick={() => setMeetup(m => ({ ...m, slots: String((parseInt(m.slots) || 0) + 1) }))}
 style={{ width: 32, height: 32, borderRadius: 18, border: '1px solid rgba(22,20,21,0.15)', background: 'transparent', color: '#161415', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</motion.button>
                                        </div>
                                    </div>

                                    {/* 可選放圖 */}
                                    <label htmlFor="imageUpload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 12, border: '1px dashed rgba(22,20,21,0.2)', cursor: 'pointer', color: 'rgba(22,20,21,0.5)' }}>
                                        <Camera size={16} strokeWidth={1.8} />
                                        <span style={{ fontSize: 13, fontFamily: 'var(--font-body)' }}>{image ? (isFitnessCommunity ? '已加入照片' : '已加入路線圖／照片') : (isFitnessCommunity ? '加入照片（可選）' : '加入路線圖或照片（可選）')}</span>
                                    </label>
                                </div>
                                );
                            })()}

                            {/* 鈦金屬細線分隔（揪團模式不顯示數據卡） */}
                            {!meetup && <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(151,166,182,0) 0%, rgba(151,166,182,0.4) 50%, rgba(151,166,182,0) 100%)' }} />}

                            {/* WORKOUT PICKER — 揪團不需要連結訓練 */}
                            {!meetup && (
                            <div>
                                <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 400, letterSpacing: '0.16em', color: 'rgba(22,20,21,0.45)', margin: '0 0 14px' }}>— 最近 5 次訓練（重訓＋跑步）</h3>
                                {loadingWorkouts ? (
                                    <div className="space-y-3">
                                        {[0, 1].map(i => <div key={i} className="h-[88px] rounded-[28px] ti-skeleton" />)}
                                    </div>
                                ) : recentWorkouts.length === 0 ? (
                                    <div className="rounded-[28px] bg-black/5 px-6 py-8 text-center">
                                        <Activity size={24} className="mx-auto mb-2 text-black/20" strokeWidth={1.5} />
                                        <p className="text-[12px] font-bold text-black/40">尚無近期訓練可連結</p>
                                        <p className="text-[11px] text-black/30 mt-1">完成一次訓練後就能附加數據卡</p>
                                    </div>
                                ) : (
                                <div className="space-y-3">
                                    {recentWorkouts.map((workout) => {
                                        const isSelected = selectedWorkout?.id === workout.id;
                                        const isRun = workout.type === 'run';
                                        
                                        return (
                                            <motion.div
                                                key={workout.id} whileTap={{ scale: 0.98 }}
                                                onClick={() => setSelectedWorkout(isSelected ? null : workout)}
                                                className="cursor-pointer transition-all duration-300"
                                                style={{
                                                    padding: '14px 16px', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    background: isSelected ? '#FFFFFF' : '#F6F4F1',
                                                    border: isSelected ? '1px solid #F95C4B' : '1px solid rgba(207,198,184,0.8)',
                                                    boxShadow: isSelected ? '0 8px 24px -10px rgba(249,92,75,0.3)' : 'inset 0 1px 0 rgba(255,255,255,0.85)',
                                                }}
                                            >
                                                <div className="flex items-center gap-3.5">
                                                    <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isRun ? 'rgba(249,92,75,0.12)' : 'rgba(22,20,21,0.08)' }}>
                                                        {isRun ? <Flame size={18} color="#F95C4B" /> : <Dumbbell size={18} color="#161415" />}
                                                    </div>
                                                    <div>
                                                        <h4 style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: '#161415', lineHeight: 1.2, margin: 0 }}>{workout.title}</h4>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(22,20,21,0.4)', margin: '3px 0 0' }}>{workout.date}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 300, color: '#161415', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{isRun ? workout.dist : workout.vol}</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(22,20,21,0.35)', textTransform: 'uppercase' }}>{workout.unit}</span>
                                                    </div>
                                                    <div style={{ width: 22, height: 22, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', border: isSelected ? 'none' : '1.5px solid rgba(22,20,21,0.15)', background: isSelected ? '#F95C4B' : 'transparent' }}>
                                                        {isSelected && <Check size={13} color="white" strokeWidth={3} />}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                                )}
                            </div>
                            )}

                            {/* ══════════════════════════════════════════════════════════
                                發布設定 — 「這篇要出現在哪裡」＋「誰看得到」
                                ----------------------------------------------------------
                                以前發文只會落在個人檔案，使用者不知道貼文有沒有進社群、
                                也無法限定觀眾。這一區把兩個決定攤在發文前，
                                並且是「可複選社群 + 單選可見度」的最小可理解模型。
                               ══════════════════════════════════════════════════════════ */}
                            <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(151,166,182,0) 0%, rgba(151,166,182,0.4) 50%, rgba(151,166,182,0) 100%)' }} />

                            <div>
                                <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 400, letterSpacing: '0.16em', color: 'rgba(22,20,21,0.45)', margin: '0 0 6px' }}>— 發布到</h3>
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.42)', margin: '0 0 14px', fontFamily: "'Noto Sans TC', sans-serif", lineHeight: 1.5 }}>
                                    可複選。不選任何社群 → 只會留在你的個人檔案。
                                </p>

                                <div style={{ display: 'flex', gap: 10 }}>
                                    {COMMUNITY_TARGETS.map(c => {
                                        const on = targets.includes(c.id);
                                        return (
                                            <motion.button
                                                key={c.id}
                                                whileTap={{ scale: 0.97 }}
                                                onClick={() => toggleTarget(c.id)}
                                                aria-pressed={on}
                                                style={{
                                                    flex: 1, textAlign: 'left', cursor: 'pointer',
                                                    padding: '14px 14px', borderRadius: 18,
                                                    background: on ? '#FFFFFF' : '#F6F4F1',
                                                    border: on ? '1px solid #F95C4B' : '1px solid rgba(207,198,184,0.8)',
                                                    boxShadow: on ? '0 8px 24px -10px rgba(249,92,75,0.3)' : 'inset 0 1px 0 rgba(255,255,255,0.85)',
                                                    transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <div style={{
                                                        width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: on ? (c.id === 'run' ? 'rgba(249,92,75,0.12)' : 'rgba(22,20,21,0.08)') : 'rgba(22,20,21,0.05)',
                                                    }}>
                                                        {c.id === 'run'
                                                            ? <Flame size={16} color={on ? '#F95C4B' : 'rgba(22,20,21,0.35)'} />
                                                            : <Dumbbell size={16} color={on ? '#161415' : 'rgba(22,20,21,0.35)'} />}
                                                    </div>
                                                    <div style={{
                                                        width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        border: on ? 'none' : '1.5px solid rgba(22,20,21,0.15)',
                                                        background: on ? '#F95C4B' : 'transparent',
                                                    }}>
                                                        {on && <Check size={12} color="white" strokeWidth={3} />}
                                                    </div>
                                                </div>
                                                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: '#161415', fontFamily: 'var(--font-body)' }}>{c.label}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(22,20,21,0.40)', fontFamily: "'Noto Sans TC', sans-serif" }}>{c.desc}</p>
                                            </motion.button>
                                        );
                                    })}
                                </div>

                                {/* 誰可以看 — 三段式，預設公開 */}
                                <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 400, letterSpacing: '0.16em', color: 'rgba(22,20,21,0.45)', margin: '22px 0 12px' }}>— 誰可以看</h3>

                                <div style={{ display: 'flex', padding: 4, borderRadius: 14, background: 'rgba(22,20,21,0.05)', gap: 4 }}>
                                    {VISIBILITY_OPTIONS.map(v => {
                                        const on = visibility === v.id;
                                        return (
                                            <motion.button {...pressProps('row')}
 key={v.id}
 onClick={() => setVisibility(v.id)}
 aria-pressed={on}
 style={{
 flex: 1, position: 'relative', cursor: 'pointer',
 padding: '9px 4px', borderRadius: 11, border: 'none',
 background: on ? '#161415' : 'transparent',
 color: on ? '#FFFFFF' : 'rgba(22,20,21,0.5)',
 fontSize: 12.5, fontWeight: 600,
 fontFamily: "'Noto Sans TC', sans-serif",
 transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
 }}
 >
                                                {v.label}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.42)', margin: '10px 0 0', fontFamily: "'Noto Sans TC', sans-serif", lineHeight: 1.5 }}>
                                    {VISIBILITY_OPTIONS.find(v => v.id === visibility)?.desc}
                                </p>
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.32)', margin: '6px 0 0', fontFamily: "'Noto Sans TC', sans-serif", lineHeight: 1.55 }}>
                                    好友＝互相追蹤，或在社群名冊互相加入的人；粉絲＝單方面追蹤你的人。
                                </p>
                            </div>

                            <div style={{ height: 'max(24px, env(safe-area-inset-bottom, 24px))' }} />
                        </div>
                    </motion.div>
                )}
            </div>
        </motion.div>,
        document.body
    );
};

export default IGPostComposer;
