import React, { useState, useEffect, useMemo, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { epleyE1RM, isValidE1RMSet } from '../utils/strengthMath';
import { readJSON } from '../utils/safeStorage';
import { motion, AnimatePresence, useInView, useReducedMotion, LayoutGroup } from 'framer-motion';

// ═══ Animation Variants (Swiss editorial — confident, minimal) ═══
const pageVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.05 }
    }
};

const heroVariants = {
    hidden: { opacity: 0, y: 40, scale: 0.96 },
    visible: {
        opacity: 1, y: 0, scale: 1,
        transition: { type: 'spring', stiffness: 260, damping: 28 }
    }
};

const cardVariants = {
    hidden: { opacity: 0, y: 28 },
    visible: {
        opacity: 1, y: 0,
        transition: { type: 'spring', stiffness: 320, damping: 30 }
    }
};

const counterUp = {
    hidden: { opacity: 0, scale: 0.7 },
    visible: {
        opacity: 1, scale: 1,
        transition: { type: 'spring', stiffness: 400, damping: 20, delay: 0.15 }
    }
};

const barVariants = {
    hidden: { scaleX: 0, originX: 0 },
    visible: {
        scaleX: 1,
        transition: { type: 'spring', stiffness: 200, damping: 30, delay: 0.3 }
    }
};

// Scroll-triggered card wrapper
const ScrollCard = ({ children, delay = 0, className, style, onClick }) => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-40px' });
    const shouldReduce = useReducedMotion();
    return (
        <motion.div
            ref={ref}
            onClick={onClick}
            className={className}
            style={style}
            initial={shouldReduce ? false : { opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ type: 'spring', stiffness: 300, damping: 28, delay }}
        >
            {children}
        </motion.div>
    );
};
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Mic, Heart, MoreHorizontal, ArrowUpRight, Calendar, Flame, Clock, Edit2, Trash2, X, Check, Filter, ArrowLeft, RefreshCw, Activity, Zap, Target, Trophy, Utensils, Shield, Layers, ChevronDown, ChevronRight, TrendingUp, Brain, AlertTriangle, Award, Timer, Gauge } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis, RadialBarChart, RadialBar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { getMuscleRecoveryDetails, getMuscleRecoveryScores, readinessFromScores } from '../utils/muscleRecoveryTracker';
import { getTodayReadiness, readinessLabel, readinessSourceLine } from '../utils/readiness';
import { calculateFullNutrition, getLatestInBody } from '../utils/NutritionEngine';
import apiClient, { getWorkoutHistory } from '../api/client';
import MobileNavigation from './MobileNavigation';
import { getUserId } from '../utils/auth';
import { useChartVisibility } from '../utils/advancedCharts';
import MemberLockCard from './MemberLockCard';
import CoachVerdict from './CoachVerdict';
import { acwrNote, muscleBalanceNote } from '../utils/strengthCoachNotes';
import DataPulse from './ui/DataPulse';
import CountUp from './ui/CountUp';
import { editorialColors } from '../utils/colors';
import { toast, confirmDialog } from '../utils/toast';
import { T } from '../utils/theme';
import { toLocalDateKey, startOfWeek } from '../utils/localDate';
import { toZhExerciseName } from '../utils/exerciseNameZh';
import { historyCutoffMs } from '../utils/memberLimits';
import { totalVolume as sumSets } from '../utils/strengthMath';
import { sessionGroups, muscleZh } from '../utils/exerciseTaxonomy';

// ── 依實際動作推導訓練的主要肌群 ───────────────────────────────
// 解決儲存時 focus_group 標籤與動作不符的問題（例：標 shoulders 卻全是機械胸推）。
// 用每個動作名稱關鍵字判類，取「動作數最多」的肌群當這筆訓練的分組標籤。
const GROUP_KEYWORDS = [
    ['CHEST', /bench|chest|push[\s-]?up|fly|dip|臥推|推胸|胸推|胸|飛鳥/],
    ['SHOULDERS', /shoulder|delt|overhead|lateral|arnold|shrug|肩|側平|聳肩/],
    ['BACK', /row|pull|\blat\b|chin|deadlift|rdl|划船|引體|下拉|背|硬舉/],
    ['ARMS', /bicep|tricep|curl|pushdown|二頭|三頭|手臂|彎舉/],
    ['LEGS', /squat|lunge|\bleg\b|calf|glute|thrust|腿|深蹲|臀/],
    ['CORE', /core|abs|plank|crunch|leg raise|核心|腹|捲腹|棒式/],
];
const detectGroupEN = (name) => {
    const n = (name || '').toLowerCase();
    for (const [g, re] of GROUP_KEYWORDS) if (re.test(n)) return g;
    return null;
};
/* 一場訓練的標題怎麼來。
   以前是「反推出唯一一個主要肌群，推不出來就寫死 Full Body」，於是：
     · 推力日（胸＋肩＋三頭）被壓成一個字
     · 動作清單是空的（中途離開／舊資料）→ 整排都寫 Full Body 0 KG，
       看起來像你每天都練了全身又什麼都沒舉起來
   現在：真的練到四個以上部位才叫全身；分類不出來就說分類不出來，不編一個。
   中英對照的分項名（Push/Pull…）也一併翻成中文 —— 這是全中文的 App。 */
const SPLIT_ZH = {
    push: '推力', pull: '拉力', upper: '上肢', lower: '下肢',
    fullbody: '全身', 'full body': '全身', cardio: '有氧', conditioning: '體能',
};
const labelZh = (v) => {
    const raw = String(v || '').trim();
    if (!raw) return null;
    if (/[\u4e00-\u9fff]/.test(raw)) return raw;   // 課表本來就是中文，照用
    return muscleZh(raw) || SPLIT_ZH[raw.toLowerCase()] || null;
};

const deriveDominantGroupEN = (exercises) => {
    if (!Array.isArray(exercises) || exercises.length === 0) return null;
    const tally = {};
    exercises.forEach((ex) => {
        const g = detectGroupEN(ex?.name);
        if (g) tally[g] = (tally[g] || 0) + 1;
    });
    const entries = Object.entries(tally);
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
};

const LollipopBar = (props) => {
    const { fill, x, y, width, height, value, maxVal } = props;
    const centerX = x + width / 2;
    const isMax = value === maxVal && value > 0;
    
    // Safety
    if (typeof y !== 'number' || typeof height !== 'number') return null;

    const baseline = y + height;
    const dotY = height === 0 ? baseline : y;
    const radius = isMax ? 7 : 4;
    
    return (
        <g>
            {height > 0 && <line x1={centerX} y1={y} x2={centerX} y2={baseline} stroke={fill} strokeWidth={2} />}
            <circle cx={centerX} cy={dotY} r={radius} fill={fill} />
            {isMax && (
                <text x={centerX} y={y - 12} fill={fill} fontSize={11} fontWeight={900} textAnchor="middle" style={{ letterSpacing: '0.02em' }}>
                    {value.toLocaleString()}
                </text>
            )}
        </g>
    );
};

const C = editorialColors;

const BrightTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ 
            background: C.paper, 
            border: `1px solid ${C.deepBlack}`, 
            padding: '8px 12px', 
            borderRadius: '0px', 
            boxShadow: '4px 4px 0 rgba(22, 20, 21, 0.05)' 
        }}>
            <p style={{ fontSize: 11, fontWeight: 900, color: C.deepBlack, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ fontSize: 13, fontWeight: 300, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: p.color || C.coral, margin: 0, lineHeight: 1 }}>
                    {typeof p.value === 'number' ? p.value.toLocaleString() : p.value} <span style={{ fontSize: 11, fontStyle: 'normal', fontWeight: 800 }}>{p.name}</span>
                </p>
            ))}
        </div>
    );
};

const TrainingRecordPageMobile = ({ userId }) => {
    const navigate = useNavigate();
    const [records, setRecords] = useState([]);
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const [activeTab, setActiveTab] = useState('overview');
    // 圖表分級（utils/advancedCharts 登記表）：恢復與近七天訓練量是基本圖表；
    // 負荷分析與 ACWR 是會員的進階圖表
    const chartVis = useChartVisibility();
    const showLoad = chartVis.visible('strengthLoad');
    const showAcwr = chartVis.visible('strengthAcwr');
    useEffect(() => {
        if (!showLoad && activeTab === 'load') setActiveTab('overview');
    }, [showLoad, activeTab]);

    const TABS = [
        { id: 'overview', label: '總覽' },
        { id: 'strength', label: '肌力' },
        ...(showLoad ? [{ id: 'load', label: '負荷' }] : []),
        { id: 'recovery', label: '恢復' },
        { id: 'history', label: '紀錄' }
    ];
    const [selectedExercise, setSelectedExercise] = useState(null);
    const [showPRCelebration, setShowPRCelebration] = useState(false);

    // fetchRecords 完成後設 true；無資料也設 true → 顯示預設值而非卡住佔位符
    const [dataReady, setDataReady] = useState(false);
    const recordPatchReady = dataReady;

    /* 本週每天的訓練量（週一 → 週日）。跟上面的「本週累積」同一個窗 ——
       原本這張是「近七天」、上面是「本週」，同一頁兩個「這一週」數字對不起來。
       還沒到的日子是 null（不畫點），過去沒練的日子才是 0。 */
    const weeklyVolumeData = useMemo(() => {
        const data = [];
        let maxVal = 0;
        const labels = ['一', '二', '三', '四', '五', '六', '日'];
        const monday = startOfWeek(new Date());
        const todayStr = toLocalDateKey(new Date());
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const dateStr = toLocalDateKey(d);
            const future = dateStr > todayStr;
            const sumVolume = future ? null : records
                .filter(r => toLocalDateKey(new Date(r.date)) === dateStr)
                .reduce((acc, r) => acc + (r.volume || 0), 0);
            if (sumVolume > maxVal) maxVal = sumVolume;
            data.push({ day: labels[i], date: dateStr, volume: sumVolume });
        }
        return { data, maxVal };
    }, [records]);

    // 本週累積（週一起算）：本週總訓練量 / 次數 vs 上週 — 各等級都顯示，健身側的長期進步錨點
    const weeklyAccum = useMemo(() => {
        const monday = startOfWeek(new Date());
        const lastMonday = startOfWeek(new Date(), -1);
        let thisVol = 0, thisCount = 0, lastVol = 0;
        records.forEach((r) => {
            const d = new Date(r.date);
            if (isNaN(d.getTime())) return;
            const vol = r.volume || 0;
            if (d >= monday) { thisVol += vol; thisCount += 1; }
            else if (d >= lastMonday && d < monday) { lastVol += vol; }
        });
        return { thisVol, thisCount, lastVol, deltaVol: thisVol - lastVol };
    }, [records]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: !!isEditModalOpen } }));
        return () => window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
    }, [isEditModalOpen]);

    useEffect(() => {
        const fetchRecords = async () => {
            setIsProcessing(true);
            try {
                // Use the centralized apiClient for consistency and security
                const data = await getWorkoutHistory(userId, 1000);
                
                // Assuming the backend returns the array within a 'history' key
                const backendRecords = (data.history && Array.isArray(data.history) ? data.history : Array.isArray(data) ? data : []).map(r => {
                    // Parse exercises JSON string → array (backend stores it as string)
                    let exercises = r.exercises;
                    if (typeof exercises === 'string') {
                        try { exercises = JSON.parse(exercises); } catch { exercises = []; }
                    }
                    exercises = Array.isArray(exercises) ? exercises : [];

                    // Normalise volume: backend field is total_volume, UI reads .volume
                    const volume = r.total_volume ?? r.volume ?? 0;

                    // 🎯 依實際動作推導練了哪些部位（優先），修正 focus_group 標籤錯配
                    //   （如標 shoulders 卻全是機械胸推）。推導不出來才退回後端標籤。
                    const groups = sessionGroups(exercises);
                    const titleZh = groups.label
                        || labelZh(r.focus_group)
                        || (Array.isArray(r.muscles) ? r.muscles.map(labelZh).filter(Boolean)[0] : null)
                        || (exercises.length > 0 ? '自由訓練' : null);

                    // 真的做完幾組 —— 這是「有沒有練」的判準，比訓練量可靠
                    //（徒手動作做滿 20 組，訓練量照樣是 0 公斤）
                    const setsDone = exercises.reduce((n, ex) => {
                        const c = Number(ex?.setsCount);
                        if (Number.isFinite(c) && c > 0) return n + c;
                        return n + (Array.isArray(ex?.sets) ? ex.sets.filter((x) => x?.completed).length : 0);
                    }, 0);

                    return {
                        ...r,
                        id:       r.session_id || r.id || `local-${Math.random()}`,
                        type:     titleZh || '未分類',
                        titleZh,
                        setsDone,
                        volume:   volume,
                        muscles:  groups.keys.length > 0 ? groups.keys : (Array.isArray(r.muscles) ? r.muscles : []),
                        date:     r.timestamp || r.date,
                        exercises: exercises
                    };
                });

                // ✅ Use userId-scoped localStorage key so different users never see each other's cache
                const cacheKey = `trainingRecords_${userId}`;
                const localRecords = readJSON(cacheKey, {});
                const recordMap = { ...localRecords };

                // Backend is the single source of truth — overwrite any cached entries
                backendRecords.forEach(r => {
                    recordMap[r.id] = r;
                });

                const mergedRecords = Object.values(recordMap).sort((a, b) => new Date(b.date) - new Date(a.date));
                setRecords(mergedRecords);
                localStorage.setItem(cacheKey, JSON.stringify(recordMap));
            } catch (error) {
                console.error("Error fetching records:", error);
                // Fallback: load from this user's own cache
                const cacheKey = `trainingRecords_${userId}`;
                // 快取損毀時 JSON.parse 會在 catch 裡再丟錯 → 改用 readJSON
                const parsed = readJSON(cacheKey, null);
                if (parsed && typeof parsed === 'object') {
                    const recordsArray = Object.values(parsed).sort((a, b) => new Date(b.date) - new Date(a.date));
                    setRecords(recordsArray);
                }
            } finally {
                setIsProcessing(false);
                setDataReady(true); // 無論有無資料，DataPulse 都顯示（預設值或真實值）
            }
        };

        if (userId) {
            fetchRecords();
        }

        // ⌚ 手錶回傳新紀錄時自動重新整理
        const onWatchSync = () => fetchRecords();
        window.addEventListener('watch-workout-saved', onWatchSync);
        return () => window.removeEventListener('watch-workout-saved', onWatchSync);
    }, [userId]);

    const handleDeleteRecord = async (dateId, e) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }

        const confirmDelete = (await confirmDialog("確定要刪除這筆訓練紀錄嗎？刪除後無法復原。", { danger: true }));
        if (!confirmDelete) return;

        // 1. Optimistic UI Update: Remove immediately
        const previousRecords = [...records]; // Backup for rollback
        const updatedRecords = records.filter(r => r.id !== dateId);
        setRecords(updatedRecords);

        // Close modal immediately if open
        if (selectedRecord && selectedRecord.id === dateId) {
            setIsEditModalOpen(false);
            setSelectedRecord(null);
        }

        setIsProcessing(true);

        try {
            // 2. Send DELETE request to Backend (Background)
            // 🔴 修復：原本用 raw fetch 打 http://{hostname}:8000，略過 VITE_API_URL →
            //    iOS 正式版（WKWebView）永遠連不到後端，刪除一律失敗被回滾。改走 apiClient。
            //    404 代表後端本來就沒有（本機產生的 local- 紀錄）→ 視為刪除成功。
            const response = await apiClient.delete(`/api/workout/history/${encodeURIComponent(userId)}/${encodeURIComponent(dateId)}`, {
                validateStatus: () => true,
            });
            const ok = (response.status >= 200 && response.status < 300) || response.status === 404;

            if (!ok) {
                // Revert on failure
                setRecords(previousRecords);
                toast.error("刪除紀錄失敗，請稍後再試");
            } else {
                // Update the userId-scoped cache on success
                const cacheKey = `trainingRecords_${userId}`;
                const saved = readJSON(cacheKey, {});
                delete saved[dateId];
                localStorage.setItem(cacheKey, JSON.stringify(saved));
            }
        } catch (e) {
            console.error("Error deleting record", e);
            // Revert on error
            setRecords(previousRecords);
            toast.error("刪除紀錄失敗，請檢查網路連線");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveRecord = async (updatedRecord, closeOnSave = true) => {
        if (!updatedRecord || !updatedRecord.id) {
            console.error("Missing Record ID!");
            return;
        }

        setIsProcessing(true);

        // 1. Calculate new Total Volume
        // 1. Calculate new Total Volume (Robust check)
        const newVolume = updatedRecord.exercises?.reduce((sum, ex) => {
            // Check for detailed sets first
            const setsArr = ex.detailedSets || (Array.isArray(ex.sets) && typeof ex.sets[0] === 'object' ? ex.sets : null);
            if (setsArr) {
                return sum + setsArr.reduce((v, s) => v + ((parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0)), 0);
            }
            // Fallback to summary calc
            const sets = parseFloat(ex.sets) || 0;
            const weight = parseFloat((ex.weight || 0).toString().replace('kg', '')) || 0;
            // Handle range reps
            const rStr = (ex.reps || '0').toString();
            let reps = parseFloat(rStr) || 0;
            if (rStr.includes('-')) {
                const parts = rStr.split('-').map(p => parseFloat(p));
                reps = (parts[0] + parts[1]) / 2;
            }

            const vol = sets * reps * weight;
            return sum + (isNaN(vol) ? 0 : vol);
        }, 0) || 0;

        const finalRecordToSave = {
            ...updatedRecord,
            volume: newVolume
        };

        try {
            // 2. Send PUT request to Backend
            // 🔴 修復：同上，raw fetch 在 iOS 正式版連不到後端 → 改走 apiClient（自動帶 JWT、吃 VITE_API_URL）
            const response = await apiClient.put(
                `/api/workout/history/${encodeURIComponent(userId)}/${encodeURIComponent(finalRecordToSave.id)}`,
                finalRecordToSave,
                { validateStatus: () => true },
            );

            if (response.status >= 200 && response.status < 300) {
                // 3. Update global list with functional update for safety
                setRecords(prevRecords =>
                    prevRecords.map(r => r.id === finalRecordToSave.id ? finalRecordToSave : r)
                );

                // 💡 Update selectedRecord to prevent stale data in modal
                setSelectedRecord(finalRecordToSave);

                // 4. Update LocalStorage（🔴 修復：要寫進以 userId 分開的快取，原本寫到共用 key，
                //    下次開頁會被舊快取蓋回去、或被別的帳號看到）
                const cacheKey = `trainingRecords_${userId}`;
                const saved = readJSON(cacheKey, {});
                saved[finalRecordToSave.id] = finalRecordToSave;
                try { localStorage.setItem(cacheKey, JSON.stringify(saved)); } catch { /* 容量滿：略過快取 */ }

                if (closeOnSave) {
                    setIsEditModalOpen(false);
                }
                console.log("Record saved successfully");
            } else {
                throw new Error("Server storage failed");
            }
        } catch (e) {
            console.error("Save failed:", e);
            toast.error("連線異常，變更可能未儲存，請檢查網路");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteExercise = async (index, e) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }

        if (!selectedRecord || !selectedRecord.exercises) return;

        // 1. Optimistic UI Update: Create new state immediately
        const newExercises = selectedRecord.exercises.filter((_, i) => i !== index);
        const updatedRecord = { ...selectedRecord, exercises: newExercises };

        // 2. Immediately reflect in Modal
        setSelectedRecord(updatedRecord);

        // 3. Immediately reflect in Main List (Fix for "jump back" issue)
        setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));

        // 4. Background Save
        await handleSaveRecord(updatedRecord, false);
    };

    const filteredRecords = useMemo(() => {
        return records.filter(record => {
            const matchesFilter = filter === 'All' || (record.muscles && record.muscles.includes(filter));
            const matchesSearch = !searchQuery ||
                (record.exercises && record.exercises.some(e => String(e?.name || '').toLowerCase().includes(searchQuery.toLowerCase()))) ||
                (record.date && String(record.date).includes(searchQuery));
            return matchesFilter && matchesSearch;
        });
    }, [records, filter, searchQuery]);

    // ═════════════════════════════════════════════════════
    // ANALYTICS ENGINE — derive real insights from records
    // ═════════════════════════════════════════════════════

    // Flatten all sets across all records with proper date tagging
    const allSets = useMemo(() => {
        const out = [];
        records.forEach(r => {
            const dateObj = new Date(r.date);
            (r.exercises || []).forEach(ex => {
                const detailed = ex.detailedSets || (Array.isArray(ex.sets) && typeof ex.sets[0] === 'object' ? ex.sets : null);
                if (detailed && detailed.length > 0) {
                    detailed.forEach(s => {
                        const w = parseFloat(s.weight) || 0;
                        const rp = parseInt(s.reps) || 0;
                        if (w > 0 && rp > 0) {
                            out.push({ name: ex.name, weight: w, reps: rp, volume: w * rp, date: dateObj, muscle: (ex.muscle || '').toLowerCase(), rpe: s.rpe });
                        }
                    });
                } else {
                    const w = parseFloat((ex.weight || '0').toString().replace('kg', '')) || 0;
                    const setCount = parseInt(ex.sets) || 0;
                    const rStr = (ex.reps || '0').toString();
                    let rp = parseFloat(rStr) || 0;
                    if (rStr.includes('-')) {
                        const parts = rStr.split('-').map(parseFloat);
                        rp = (parts[0] + parts[1]) / 2;
                    }
                    if (w > 0 && rp > 0 && setCount > 0) {
                        for (let i = 0; i < setCount; i++) {
                            out.push({ name: ex.name, weight: w, reps: rp, volume: w * rp, date: dateObj, muscle: (ex.muscle || '').toLowerCase() });
                        }
                    }
                }
            });
        });
        return out;
    }, [records]);

    /* Epley 只在低反覆準確；30 下會把 1RM 灌成體重的 2 倍
       （曾經出現 171KG / +114KG 的假數值）。
       🔢 2026-09 稽核：這一頁當時修好了，但其他五處沒有 ——
       同一組訓練在不同頁面出現四個 1RM。實作已收斂到 utils/strengthMath，
       這裡改為引用，之後只會有一個版本。 */
    const estimate1RM = epleyE1RM;
    const isValid1RMSet = isValidE1RMSet;

    // Detect muscle from exercise name (reuse keywords logic)
    const detectMuscleGroup = (name) => {
        const n = (name || '').toLowerCase();
        if (/bench|press|chest|push|fly|dip|臥推|推胸|胸|飛鳥/.test(n)) return '胸';
        if (/row|pull|lat|deadlift|chin|划船|引體|下拉|硬舉|背/.test(n)) return '背';
        if (/shoulder|delt|overhead|lateral|arnold|shrug|肩|推舉|側平/.test(n)) return '肩';
        if (/bicep|tricep|curl|extension|pushdown|二頭|三頭|手臂|彎舉/.test(n)) return '手臂';
        if (/squat|lunge|leg|calf|glute|rdl|deadlift|thrust|腿|深蹲|臀/.test(n)) return '腿';
        if (/core|abs|plank|crunch|leg raise|核心|腹|捲腹|棒式/.test(n)) return '核心';
        return '其他';
    };

    // Top exercises by frequency (for 1RM selector)
    const topExercises = useMemo(() => {
        const freq = {};
        allSets.forEach(s => { freq[s.name] = (freq[s.name] || 0) + 1; });
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
    }, [allSets]);

    // Default exercise: top one
    const activeExercise = selectedExercise || topExercises[0] || null;

    // 1RM trend series for activeExercise
    // 趨勢圖：2026-09 起所有人都看全部（utils/memberLimits 同一條界線；FREE_HISTORY_DAYS = null）
    const historyCutoff = historyCutoffMs(chartVis.member, new Date().setHours(0, 0, 0, 0));   // 以今天 0 點為準，避免每次 render 都重算
    const oneRMTrimmed = useMemo(() => (
        historyCutoff != null && !!activeExercise
        && allSets.some(s => s.name === activeExercise && isValid1RMSet(s) && s.date.getTime() < historyCutoff)
    ), [allSets, activeExercise, historyCutoff]);
    const oneRMTrend = useMemo(() => {
        if (!activeExercise) return [];
        const byDate = {};
        allSets.filter(s => s.name === activeExercise && isValid1RMSet(s)
            && (historyCutoff == null || s.date.getTime() >= historyCutoff)).forEach(s => {
            const key = toLocalDateKey(s.date);
            const est = estimate1RM(s.weight, s.reps);
            if (!byDate[key] || est > byDate[key]) byDate[key] = est;
        });
        return Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-12)
            .map(([d, v]) => ({ date: d.slice(5), value: Math.round(v * 10) / 10 }));
    }, [allSets, activeExercise, historyCutoff]);

    const current1RM = oneRMTrend.length > 0 ? oneRMTrend[oneRMTrend.length - 1].value : 0;
    const previous1RM = oneRMTrend.length > 1 ? oneRMTrend[0].value : current1RM;
    const oneRMDelta = current1RM - previous1RM;

    // ACWR (Acute:Chronic Workload Ratio)
    // Requires at least 2 weeks of historical data to produce a meaningful result.
    // If all volume is in the most recent 7 days (no older baseline), ratio would be
    // misleadingly high (4×) for any new user — return 'insufficient' instead.
    const acwr = useMemo(() => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        let acute = 0, chronic = 0, olderThan7 = 0;
        records.forEach(r => {
            const days = (now - new Date(r.date).getTime()) / day;
            if (days <= 7)  acute   += (r.volume || 0);
            if (days <= 28) chronic += (r.volume || 0);
            if (days > 7 && days <= 28) olderThan7 += (r.volume || 0);
        });
        // Need chronic baseline (volume outside the acute window) to be meaningful
        if (olderThan7 === 0 || chronic === 0) {
            // Calculate how many more days of training history are needed
            // Find the earliest record date to estimate progress toward 8-day minimum
            const sortedDates = records
                .map(r => new Date(r.date).getTime())
                .filter(t => !isNaN(t))
                .sort((a, b) => a - b);
            const oldestDaysAgo = sortedDates.length > 0
                ? Math.floor((Date.now() - sortedDates[0]) / day)
                : 0;
            // Need at least 8 days of spread (7 acute + 1 day chronic baseline)
            const daysUntilUnlock = Math.max(0, 8 - oldestDaysAgo);
            return { ratio: '—', acute, chronic: 0, status: 'insufficient', daysUntilUnlock };
        }
        const chronicAvg = chronic / 4; // weekly average over 4 weeks
        const ratio = acute / chronicAvg;
        let status = 'safe';
        if (ratio < 0.8) status = 'detraining';
        else if (ratio > 1.5) status = 'danger';
        else if (ratio > 1.3) status = 'caution';
        return { ratio: +ratio.toFixed(2), acute, chronic: chronicAvg, status };
    }, [records]);

    // Volume by muscle group (last 7 days)
    const volumeByMuscle = useMemo(() => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        const map = { '胸': 0, '背': 0, '肩': 0, '手臂': 0, '腿': 0, '核心': 0 };
        allSets.forEach(s => {
            const days = (now - s.date.getTime()) / day;
            if (days > 7) return;
            const g = detectMuscleGroup(s.name);
            if (map[g] !== undefined) map[g] += s.volume;
        });
        const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
        return Object.entries(map).map(([name, vol]) => ({
            name, volume: Math.round(vol), percent: Math.round((vol / total) * 100)
        })).sort((a, b) => b.volume - a.volume);
    }, [allSets]);

    // ── 升級：訓練刺激區間 (Stimulus Profile) ──
    /* ⚠️ 這裡原本也是 `parseFloat(s.rpe) || 8` —— 沒填 RPE 的組全部當成 8，
       於是一個從來沒填過 RPE 的人，照樣會看到一個信心滿滿的強度分布圓餅圖，
       而那張圖 100% 是假設出來的。現在只認真的有填的那些；一組都沒有就回 null，
       畫面顯示「還沒有 RPE 資料」而不是畫一個圖。 */
    const trainingStimulus = useMemo(() => {
        let highTension = 0, hypertrophy = 0, junkVolume = 0, rated = 0;
        const since = Date.now() - 28 * 24 * 60 * 60 * 1000;   // 圖中央寫「28 天」，就真的只算 28 天
        allSets.forEach(s => {
            if (s.date.getTime() < since) return;
            const rpeNum = parseFloat(s.rpe);
            if (!Number.isFinite(rpeNum)) return;
            rated++;
            if (rpeNum < 6) {
                junkVolume++;
            } else if (s.reps <= 5 && rpeNum >= 8) {
                highTension++;
            } else {
                hypertrophy++;
            }
        });
        if (rated === 0) return null;
        const total = (highTension + hypertrophy + junkVolume) || 1;
        return [
            { name: '大重量', zone: '1–5 下 · RPE 8 以上', volume: highTension, percent: Math.round((highTension / total) * 100), color: C.deepBlack },
            { name: '肌肥大', zone: '6 下以上 · RPE 6 以上', volume: hypertrophy, percent: Math.round((hypertrophy / total) * 100), color: C.coral },
            { name: '輕量／熱身', zone: 'RPE 6 以下', volume: junkVolume, percent: Math.round((junkVolume / total) * 100), color: C.pebble }
        ];
    }, [allSets]);

    // ── 升級：有效組數 (Hard Sets) ──
    /* 有效組數（RPE ≥ 7 的那些）。
     *
     * ⚠️ 這裡原本寫 `(parseFloat(s.rpe) || 8) >= 7` —— 沒填 RPE 的組一律當成 8，
     *    也就是「每一組都算有效組」。使用者從來沒填過 RPE 的話，
     *    這個數字其實是「總組數」，卻掛著「有效總量」的標題。
     *    現在分開算：有填過 RPE 就報有效組，一次都沒填就報總組數，
     *    標題跟著換 —— 標籤要跟實際算的東西一致。
     */
    const hardSetsStats = useMemo(() => {
        const countSets = (record) => {
            let rated = 0, ratedHard = 0, all = 0;
            (record.exercises || []).forEach(ex => {
                const setsArr = ex.detailedSets || (Array.isArray(ex.sets) && typeof ex.sets[0] === 'object' ? ex.sets : null);
                if (setsArr) {
                    setsArr.forEach(st => {
                        all++;
                        const rpe = parseFloat(st.rpe);
                        if (Number.isFinite(rpe)) { rated++; if (rpe >= 7) ratedHard++; }
                    });
                } else {
                    const reps = parseInt(ex.reps) || 0;
                    if (reps > 0) all += (parseInt(ex.sets || 1) || 0);
                }
            });
            // 後端算好的 hard_sets 是真的有效組，優先採用
            const backend = Number(record.hard_sets);
            if (Number.isFinite(backend)) return { rated: Math.max(rated, backend), ratedHard: backend, all: Math.max(all, backend) };
            return { rated, ratedHard, all };
        };

        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        const win = { this: { rated: 0, ratedHard: 0, all: 0 }, last: { rated: 0, ratedHard: 0, all: 0 } };
        records.forEach(r => {
            const days = (now - new Date(r.date).getTime()) / day;
            const bucket = days <= 7 ? win.this : (days <= 14 ? win.last : null);
            if (!bucket) return;
            const c = countSets(r);
            bucket.rated += c.rated; bucket.ratedHard += c.ratedHard; bucket.all += c.all;
        });

        const hasRpe = win.this.rated > 0 || win.last.rated > 0;
        const thisWeek = hasRpe ? win.this.ratedHard : win.this.all;
        const lastWeek = hasRpe ? win.last.ratedHard : win.last.all;

        /* 三種狀態，不要混成一個 0：
             pct   上週有紀錄 → 真的比得出來
             first 這週第一次 → 基準線剛建立
             none  兩週都沒有 → 沒有東西可以比，就不要寫「▲0% 較上週」 */
        let compare = 'none', diff = null;
        if (lastWeek > 0) { compare = 'pct'; diff = Math.round(((thisWeek - lastWeek) / lastWeek) * 100); }
        else if (thisWeek > 0) { compare = 'first'; }

        return { total: Math.round(thisWeek), diff, compare, hasRpe };
    }, [records]);

    // Muscle recovery
    const recoveryDetails = useMemo(() => getMuscleRecoveryDetails(userId || getUserId()), [userId, records]);

    // Training frequency (days active in last 14)
    const trainingFrequency = useMemo(() => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        const active = new Set();
        records.forEach(r => {
            const days = Math.floor((now - new Date(r.date).getTime()) / day);
            if (days >= 0 && days < 14) active.add(days);
        });
        return { active: active.size, days: Array.from({ length: 14 }, (_, i) => active.has(13 - i)) };
    }, [records]);

    /* 系統準備狀態 —— 與跑步頁、首頁同一支 computeReadiness。
     *
     * ⚠️ 這裡原本自己算一份：恢復度 50% ＋ ACWR 30% ＋ 頻率 20%，而且三個輸入
     *    在「沒資料」時各自有一個編出來的墊底值 ——
     *      · 沒有恢復紀錄 → avgRecovery = 85
     *      · ACWR 資料不足 → acwrScore = 100（「不扣分」）
     *      · 一次都沒練   → freqScore  = 70
     *    於是一個完全沒練過的人會看到 85×0.5 + 100×0.3 + 70×0.2 = 94「巔峰」，
     *    旁邊卻寫著「訓練頻率 0/14、有效總量 0 組」。三個編出來的數字湊成一個
     *    看起來很專業的分數，這正是規則要擋的事。
     *
     *    而且它跟跑步頁的準備度是兩套算法、兩個數字，同一個概念各說各話。
     *    現在一律走 utils/readiness：訓練負荷（只算真的練過的肌群）＋睡眠＋HRV＋
     *    靜息心率，有哪個算哪個，一個都沒有就回 null → 畫面顯示該做的事。
     */
    const readiness = useMemo(() => {
        const uid = userId || getUserId();
        if (!uid) return null;
        const load = readinessFromScores(getMuscleRecoveryScores(uid))?.score ?? null;
        const r = getTodayReadiness(uid);
        if (!r) return null;
        return {
            score: r.score,
            label: readinessLabel(r.score),
            color: r.score >= 70 ? C.coral : C.ember,
            source: readinessSourceLine(r.from),
            avgRecovery: load,        // null = 還沒有任何肌群練過
        };
    }, [userId, recoveryDetails]);

    // PR stats
    const prStats = useMemo(() => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        const historicalBest = {};
        const weekBest = {};
        
        allSets.forEach(s => {
            const e = estimate1RM(s.weight, s.reps);
            const days = (now - s.date.getTime()) / day;
            if (days <= 7) {
                if (!weekBest[s.name] || e > weekBest[s.name].e1rm) {
                    weekBest[s.name] = {
                        name: s.name,
                        weight: s.weight,
                        reps: s.reps,
                        e1rm: e,
                        date: s.date
                    };
                }
            } else {
                historicalBest[s.name] = Math.max(historicalBest[s.name] || 0, e);
            }
        });
        
        const items = [];
        Object.values(weekBest).forEach(wb => {
            const prevBest = historicalBest[wb.name] || 0;
            if (wb.e1rm >= prevBest - 0.01 && wb.e1rm > 0) {
                items.push(wb);
            }
        });
        return { count: items.length, items };
    }, [allSets]);

    // ── 每筆紀錄的 Personal Best 判定（依「每個動作」回溯整段歷史）──
    //    對每個動作，比較該筆紀錄當天的最佳 e1RM 是否 ≥ 此動作在「該日之前」
    //    的所有歷史最佳。是 → 該動作在當天創下個人最佳 (all-time PB)。
    //    回傳 { [recordId]: Set<該筆中破紀錄的動作名稱> }
    const recordPRMap = useMemo(() => {
        // 1. 依時間排序所有 set（舊→新）
        const sorted = [...allSets].sort((a, b) => a.date.getTime() - b.date.getTime());

        // 2. 逐筆累積各動作的歷史最佳 e1RM，標記「當下刷新紀錄」的 set
        const runningBest = {}; // name → 截至目前的最佳 e1RM
        const prByRecordExercise = {}; // `${dayKey}|${name}` → true

        sorted.forEach(s => {
            const e = estimate1RM(s.weight, s.reps);
            const dayKey = new Date(s.date); dayKey.setHours(0, 0, 0, 0);
            const recKey = `${dayKey.getTime()}|${s.name}`;
            const prev = runningBest[s.name] || 0;
            if (e >= prev && e > 0) {
                // ≥ 視為持平或刷新（持平也算守住 PB），但只有「嚴格 > 0 且 ≥ 歷史」才標記
                if (e > prev - 0.01) prByRecordExercise[recKey] = true;
                runningBest[s.name] = Math.max(prev, e);
            }
        });

        // 3. 攤平回每筆 record：哪些動作在當天是 PB
        const map = {};
        records.forEach(r => {
            const dayKey = new Date(r.date); dayKey.setHours(0, 0, 0, 0);
            const prNames = new Set();
            (r.exercises || []).forEach(ex => {
                if (prByRecordExercise[`${dayKey.getTime()}|${ex.name}`]) prNames.add(ex.name);
            });
            map[r.id] = prNames;
        });
        return map;
    }, [allSets, records]);

    const nutrition = useMemo(() => calculateFullNutrition({
        profile: {}, inbody: getLatestInBody(userId), userId
    }), [userId]);

    // Helper: Bento Card Component — 改為極簡無邊框分割
    // §4 分層：dark＝深鈦牆（漸層＋inset bevel，非平黑）；mist＝唯一冷灰地面（暖卡靠它浮起）；light＝paper 編輯排版
    const BentoCard = ({ children, title, icon: Icon, dark = false, mist = false, bgImage, glass = false, accent, gridArea, onClick, delay = 0 }) => (
        <ScrollCard
            onClick={onClick}
            delay={delay}
            className={(dark || mist || bgImage || glass) ? 'flex flex-col relative my-4 overflow-hidden' : 'py-8 flex flex-col relative border-b overflow-hidden'}
            style={{
                background: bgImage
                    ? '#E8E9E6'
                    : dark
                        ? 'linear-gradient(165deg, #2A2724 0%, #161415 62%)'
                        : glass
                            ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.1) 100%)'
                        : mist ? C.mist : 'transparent',
                backgroundImage: bgImage
                    ? `url("${bgImage}")`
                    : mist
                        ? 'repeating-linear-gradient(180deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 1px, rgba(151,166,182,0.05) 2px, rgba(151,166,182,0.05) 3px)'
                        : undefined,
                backdropFilter: glass ? 'blur(24px) saturate(150%)' : undefined,
                WebkitBackdropFilter: glass ? 'blur(24px) saturate(150%)' : undefined,
                backgroundSize: bgImage ? 'cover' : undefined,
                backgroundPosition: bgImage ? 'center' : undefined,
                borderColor: (dark || mist || bgImage || glass) ? 'transparent' : 'rgba(22,20,21,0.1)',
                border: dark ? '1px solid rgba(246,244,241,0.07)' : glass ? '1px solid rgba(255,255,255,0.6)' : (mist || bgImage) ? '1px solid rgba(207,198,184,0.55)' : undefined,
                color: dark ? C.white : C.deepBlack,
                borderRadius: (dark || mist || bgImage || glass) ? 28 : 0,
                padding: (dark || bgImage || glass) ? '28px 24px' : mist ? '24px 20px' : undefined,
                boxShadow: dark
                    ? 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 34px rgba(22,20,21,0.22)'
                    : glass
                        ? 'inset 0 1px 2px rgba(255,255,255,0.9), 0 12px 40px rgba(0,0,0,0.06)'
                    : (mist || bgImage)
                        ? 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 2px rgba(151,166,182,0.18), 0 8px 24px -10px rgba(32,32,32,0.16)'
                        : undefined,
                gridArea
            }}
        >
            <div className={(dark || mist || bgImage || glass) ? 'relative z-10 flex flex-col flex-1' : 'relative z-10 flex flex-col flex-1 px-2'} style={{ color: dark ? '#FFFFFF' : '#161415' }}>
                {title && (
                    <div className="flex items-center gap-2 mb-6 opacity-50 text-[11px] font-black uppercase tracking-[0.3em]">
                        {Icon && <Icon size={14} color={accent || (dark ? C.coral : C.deepBlack)} />} {title}
                    </div>
                )}
                {children}
            </div>
        </ScrollCard>
    );

    // Masonry Layout Logic (2 columns)
    const leftColumn = filteredRecords.filter((_, i) => i % 2 === 0);
    const rightColumn = filteredRecords.filter((_, i) => i % 2 === 1);

    return (
        <div className="min-h-[100dvh] font-sans pb-4" style={{ backgroundColor: C.paper, maxWidth: '430px', margin: '0 auto' }}>
            
            {/* Header: Editorial Style */}
            <div className="px-6 pb-4 sticky top-0 z-30 page-top-safe--tight" style={{ backgroundColor: C.paper }}>
                <div className="flex justify-between items-center mb-6">
                    <div className="relative">
                        <div className="absolute -top-5 -left-2 text-[75px] font-[900] opacity-[0.05] tracking-tighter select-none pointer-events-none uppercase" style={{ color: C.deepBlack, fontFamily: '"Tenor Sans", sans-serif' }}>
                            紀錄
                        </div>
                        <h1 className="text-5xl font-[900] tracking-[-0.04em] leading-none relative z-10 uppercase" style={{ color: C.deepBlack, fontFamily: '"Tenor Sans", sans-serif' }}>
                            訓練
                        </h1>
                        <div className="flex items-center gap-3 mt-3">
                            <div className="h-[2px] w-10 bg-gradient-to-r from-[#8A7E73] to-[#CFC6B8]" />
                            <p className="text-[12px] font-black tracking-[0.3em] opacity-40" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                表現與歷史
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <motion.button {...pressProps('icon')} onClick={() => navigate('/luxury-plan-view-mobile')} className="w-10 h-10 rounded-full flex items-center justify-center border border-black/5" style={{ background: C.white }}>
                            <ArrowLeft size={18} color={C.deepBlack} />
                        </motion.button>
                    </div>
                </div>

                {/* Tab Navigation — Liquid Glass Pills */}
                <LayoutGroup>
                    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2 px-1">
                        {TABS.map(tab => {
                            const active = activeTab === tab.id;
                            return (
                                <motion.button {...pressProps('pill')}
 key={tab.id}
 onClick={() => setActiveTab(tab.id)}
 className="relative px-6 py-2.5 rounded-full text-xs font-black whitespace-nowrap flex items-center justify-center text-center"
 style={{
 color: active ? C.white : C.deepBlack,
 // Inactive pills: Light Liquid Glass
 background: active ? 'transparent' : 'linear-gradient(180deg, rgba(246, 244, 241, 0.4) 0%, rgba(246, 244, 241, 0.1) 100%)',
 backdropFilter: active ? 'none' : 'blur(20px) saturate(150%)',
 WebkitBackdropFilter: active ? 'none' : 'blur(20px) saturate(150%)',
 border: active ? 'none' : '1px solid rgba(22, 20, 21, 0.08)',
 boxShadow: active ? 'none' : 'inset 0 1px 2px rgba(255, 255, 255, 0.8)'
 }}
 >
                                    {active && (
                                        <motion.span
                                            layoutId="activeTabPill"
                                            className="absolute inset-0 rounded-full"
                                            style={{ 
                                                // Active pill: Dark Liquid Glass
                                                background: 'linear-gradient(180deg, rgba(38, 35, 36, 0.85) 0%, rgba(22, 20, 21, 0.95) 100%)',
                                                backdropFilter: 'blur(24px) saturate(120%)',
                                                WebkitBackdropFilter: 'blur(24px) saturate(120%)',
                                                border: '1px solid rgba(246, 244, 241, 0.12)',
                                                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 -1px 1px rgba(0, 0, 0, 0.6)'
                                            }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                        />
                                    )}
                                    <span className="relative z-10 leading-none block pt-[1px]">{tab.label}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </LayoutGroup>
            </div>


            {/* Main Content Area */}
            <main className="px-6" style={{ paddingBottom: 'var(--nav-clearance, 120px)' }}>
                <AnimatePresence mode="wait">
                {activeTab === 'overview' && (
                    <motion.div
                        key="overview"
                        className="space-y-4"
                        variants={pageVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {/* ═══ HERO: READINESS (High-End Editorial Style) ═══ */}
                        <motion.div
                            variants={heroVariants}
                            className="pt-2 pb-12 border-b relative"
                            style={{ borderColor: C.border }}
                        >
                            {/* 頂部標籤 */}
                            <motion.div
                                className="flex items-center gap-2 mb-4 opacity-50 text-[11px] font-black uppercase tracking-[0.4em]"
                                style={{ color: C.deepBlack }}
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 0.5, x: 0 }}
                                transition={{ delay: 0.15, duration: 0.4 }}
                            >
                                <Brain size={12} color={C.coral} /> 系統準備狀態
                            </motion.div>

                            {/* 算不出準備度就不要生一個數字出來 —— 顯示該做的事。
                                以前這裡永遠有分數：沒紀錄用 85、ACWR 不足給 100、
                                沒練過給 70，湊出來就是「94 巔峰」。 */}
                            {!readiness ? (
                                <div className="mb-6">
                                    <p className="text-[19px] font-bold leading-snug" style={{ color: C.deepBlack }}>
                                        還沒有東西可以算準備度
                                    </p>
                                    <p className="text-[12px] mt-2 opacity-55" style={{ color: C.deepBlack }}>
                                        練一場，或讓手錶同步睡眠與 HRV，這裡就會有數字。
                                    </p>
                                </div>
                            ) : (
                            <>
                            {/* 誇張比例的主分數 */}
                            <div className="flex items-baseline gap-2 mb-2">
                                <motion.span
                                    className="text-[120px] font-light tracking-tighter leading-none"
                                    style={{ fontFamily: 'var(--font-display)', color: C.deepBlack }}
                                    variants={counterUp}
                                >
                                    <DataPulse ready={recordPatchReady} w="7rem" h="6rem" radius="0" theme="light" inline>
                                        <CountUp value={readiness.score} />
                                    </DataPulse>
                                </motion.span>
                                <motion.span
                                    className="text-3xl font-light italic"
                                    style={{ fontFamily: 'var(--font-display)', color: C.deepBlack, opacity: 0.3 }}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.3 }}
                                    transition={{ delay: 0.35 }}
                                >/100</motion.span>
                            </div>

                            {/* 狀態與橫向細線 */}
                            <motion.div
                                className="flex items-center gap-4 mb-3 mt-2"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 24 }}
                            >
                                <span className="text-sm font-black tracking-[0.1em]" style={{ color: readiness.color }}>
                                    {readiness.label}
                                </span>
                                <motion.div
                                    className="flex-1 h-[1px]"
                                    style={{ backgroundColor: C.border }}
                                    initial={{ scaleX: 0, originX: 0 }}
                                    animate={{ scaleX: 1 }}
                                    transition={{ delay: 0.4, duration: 0.5, ease: 'easeOut' }}
                                />
                            </motion.div>

                            {/* 這個數字是用什麼算出來的 —— 跟跑步頁同一句話 */}
                            {readiness.source && (
                                <p className="text-[11px] mb-10 opacity-45" style={{ color: C.deepBlack }}>
                                    {readiness.source}
                                </p>
                            )}

                            {/* 三項子指標：精品級排版 */}
                            <div className="grid grid-cols-3 gap-6">
                                {[
                                    /* 沒練過的肌群不算進恢復度，也不假裝有分數 */
                                    {
                                        label: '恢復度',
                                        pct: readiness.avgRecovery ?? 0,
                                        val: readiness.avgRecovery == null ? '—' : `${readiness.avgRecovery}%`,
                                        color: C.coral,
                                    },
                                    {
                                        label: '訓練負荷 (ACWR)',
                                        pct: acwr.status === 'insufficient' ? 0 : Math.min(100, ((+acwr.ratio || 0) / 1.5) * 100),
                                        val: acwr.status === 'insufficient' ? '—' : acwr.ratio,
                                        color: acwr.status === 'safe' ? C.coral : C.deepBlack,
                                    },
                                    {
                                        label: '訓練頻率',
                                        pct: Math.min(100, (trainingFrequency.active / 14) * 100),
                                        val: `${trainingFrequency.active}/14`,
                                        color: C.deepBlack,
                                    },
                                ].map((bar, i) => (
                                    <motion.div
                                        key={bar.label}
                                        className="flex flex-col gap-2"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.35 + i * 0.08, type: 'spring', stiffness: 300, damping: 26 }}
                                    >
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[11px] font-bold opacity-40 tracking-[0.06em]" style={{ color: C.deepBlack }}>
                                                {bar.label}
                                            </span>
                                            <span className="text-[13px] font-light italic" style={{ fontFamily: 'var(--font-display)', color: C.deepBlack }}>
                                                {bar.val}
                                            </span>
                                        </div>
                                        {/* 1px 的極細進度條 */}
                                        <div className="h-[1px] w-full overflow-hidden" style={{ backgroundColor: 'rgba(22,20,21,0.05)' }}>
                                            <motion.div
                                                className="h-full"
                                                style={{ backgroundColor: bar.color }}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${bar.pct}%` }}
                                                transition={{ delay: 0.5 + i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                                            />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                            </>
                            )}
                        </motion.div>

                        {/* ═══ MID ROW: Volume + PR ═══ */}
                        <div className="grid grid-cols-2 gap-4">
                            <BentoCard title={hardSetsStats.hasRpe ? '有效總量' : '總組數'} icon={Flame} bgImage="/desktop/11.jpeg">
                                <div className="flex items-baseline gap-1 mt-auto">
                                    <span className="text-3xl font-light font-display tracking-tighter text-[#161415]">
                                        <DataPulse ready={recordPatchReady} w="3rem" h="2.5rem" radius="0" theme="dark" inline>
                                            <CountUp value={hardSetsStats.total} />
                                        </DataPulse>
                                    </span>
                                    <span className="text-[11px] font-black opacity-40">組數</span>
                                </div>
                                {hardSetsStats.compare === 'pct' && (
                                    <p className="text-[11px] font-black mt-1" style={{ color: hardSetsStats.diff >= 0 ? C.coral : C.deepBlack }}>
                                        {hardSetsStats.diff >= 0 ? '▲' : '▼'} {Math.abs(hardSetsStats.diff)}% <span className="opacity-30">較上週</span>
                                    </p>
                                )}
                                {hardSetsStats.compare === 'first' && (
                                    <p className="text-[11px] font-black mt-1 opacity-30">基準線已建立</p>
                                )}
                                {/* compare === 'none'：兩週都沒紀錄，沒有東西可以比，就不寫 */}
                            </BentoCard>

                            <BentoCard title="本週 PR" icon={Trophy} dark bgImage="/desktop/22.jpeg" accent={C.gold} onClick={() => {
                                setShowPRCelebration(true);
                            }}>
                                <div className="flex items-baseline gap-1 mt-auto">
                                    <span className="text-3xl font-black tracking-tighter" style={{ color: prStats.count > 0 ? C.gold : C.white }}>
                                        <DataPulse ready={recordPatchReady} w="3rem" h="2.5rem" radius="0" theme="light" inline>
                                            <CountUp value={prStats.count} />
                                        </DataPulse>
                                    </span>
                                    <span className="text-[11px] font-black opacity-30">破紀錄次數</span>
                                </div>
                                {prStats.count > 0 ? (
                                    <div className="flex gap-1 overflow-hidden mt-1">
                                        {prStats.items.slice(0, 2).map((item, i) => (
                                            <span key={i} className="text-[11px] font-black tracking-widest uppercase truncate min-w-0 flex-1 border border-white/15 px-1 rounded-none">{item.name}</span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] font-black mt-1 opacity-30">繼續努力</p>
                                )}
                            </BentoCard>
                        </div>

                        {/* ═══ ACWR STRIP — 會員的進階圖表；免費版在這個位置放唯一一張會員卡 ═══ */}
                        {!showAcwr && chartVis.locked('重訓') && (
                            <MemberLockCard feature="advancedCharts" label="解鎖訓練負荷分析" />
                        )}
                        {showAcwr && (
                        <BentoCard title="訓練負荷比 ACWR" icon={Gauge} glass delay={0.05}>
                            <div className="flex items-baseline gap-2 mb-3">
                                <motion.span
                                    className="text-4xl font-black tracking-tighter"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ type: 'spring', stiffness: 350, damping: 22, delay: 0.1 }}
                                >{acwr.ratio}</motion.span>
                                <span className="text-[12px] font-black opacity-40 tracking-widest">
                                    {acwr.status === 'safe' && '安全區'}
                                    {acwr.status === 'caution' && '注意'}
                                    {acwr.status === 'danger' && '高風險'}
                                    {acwr.status === 'detraining' && '訓練不足'}
                                    {acwr.status === 'insufficient' && '資料不足'}
                                </span>
                            </div>
                            {/* Horizontal gauge — animated marker */}
                            <div className="relative h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: C.pebble }}>
                                <div className="absolute top-0 bottom-0 bg-black/10" style={{ left: '40%', width: '25%' }} />
                                <motion.div
                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg"
                                    style={{ backgroundColor: acwr.status === 'safe' ? C.coral : C.ember }}
                                    initial={{ left: '0%' }}
                                    animate={{ left: `${Math.min(100, ((+acwr.ratio || 0) / 2) * 100)}%` }}
                                    viewport={{ once: true }}
                                    transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.2 }}
                                />
                            </div>
                            <div className="flex justify-between text-[11px] font-black mt-2 opacity-30 uppercase">
                                <span>0.0</span><span>0.8</span><span>1.3</span><span>2.0</span>
                            </div>
                            {/* Insufficient data unlock hint */}
                            {acwr.status === 'insufficient' && (
                                <motion.div
                                    className="mt-4 flex items-start gap-3 rounded-[18px] px-4 py-3.5 shadow-[0_8px_20px_rgba(0,0,0,0.12)] border border-[#5E5953]/80 bg-gradient-to-b from-[#383633] to-[#211F1D] text-[#F6F4F1]"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4, duration: 0.4 }}
                                >
                                    <span className="text-base leading-none mt-0.5">🔒</span>
                                    <div>
                                        <p className="text-[11px] font-black text-[#F6F4F1]">
                                            {acwr.daysUntilUnlock > 0
                                                ? `再 ${acwr.daysUntilUnlock} 天訓練紀錄即可解鎖`
                                                : '完成本週第一筆訓練後解鎖'}
                                        </p>
                                        <p className="text-[12px] mt-0.5 opacity-40 font-black tracking-widest">需要 8 天以上的歷史資料</p>
                                    </div>
                                </motion.div>
                            )}
                            {/* 🎓 結論＋下一步（會員進階圖表） */}
                            <CoachVerdict note={acwrNote(acwr)} />
                        </BentoCard>
                        )}

                        {/* ═══ 本週累積 ＋ 本週每天（週一起算）— 一張卡講完「這一週」═══
                            這週還沒練 → 只放一行動作，不畫七個 0 的空圖 */}
                        {(weeklyAccum.thisVol > 0 || weeklyAccum.thisCount > 0) ? (
                        <BentoCard title="本週累積" icon={TrendingUp} glass delay={0.08}>
                            <div className="mt-3">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[44px] font-light leading-none tracking-tight" style={{ color: C.deepBlack, fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                                        {Math.round(weeklyAccum.thisVol).toLocaleString()}
                                    </span>
                                    <span className="text-[12px] font-bold opacity-40">kg</span>
                                    {weeklyAccum.lastVol > 0 && Math.abs(weeklyAccum.deltaVol) >= 1 && (
                                        <span
                                            className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                                            style={{ color: weeklyAccum.deltaVol >= 0 ? '#5A7A3A' : '#D94030', backgroundColor: (weeklyAccum.deltaVol >= 0 ? '#5A7A3A' : '#D94030') + '15' }}
                                        >
                                            {weeklyAccum.deltaVol >= 0 ? '▲' : '▼'} {Math.abs(Math.round(weeklyAccum.deltaVol)).toLocaleString()}kg
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-2 text-[11px] font-semibold opacity-55" style={{ color: C.deepBlack }}>
                                    <span>{weeklyAccum.thisCount} 次訓練</span>
                                    {weeklyAccum.lastVol > 0 && <><span className="opacity-30">·</span><span className="opacity-70">上週 {Math.round(weeklyAccum.lastVol).toLocaleString()}kg</span></>}
                                </div>
                            </div>
                            {chartVis.visible('strengthWeeklyVolume') && (
                            <div className="h-40 mt-2 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={weeklyVolumeData.data} margin={{ top: 20, bottom: 0, left: 10, right: 10 }}>
                                        <XAxis
                                            dataKey="day"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 11, fontWeight: 900, fill: C.deepBlack, opacity: 0.5 }}
                                            dy={10}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                            contentStyle={{ borderRadius: 18, border: 'none', background: C.deepBlack, color: C.white, fontWeight: 'bold', fontSize: 12 }}
                                            itemStyle={{ color: C.coral }}
                                            formatter={(value) => (value == null ? ['還沒到', ''] : [`${value.toLocaleString()} kg`, '訓練量'])}
                                        />
                                        <Bar
                                            dataKey="volume"
                                            fill={C.coral}
                                            shape={(props) => (props.value == null ? null : <LollipopBar {...props} maxVal={weeklyVolumeData.maxVal} />)}
                                            isAnimationActive={true}
                                            animationBegin={300}
                                            animationDuration={800}
                                            animationEasing="ease-out"
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            )}
                        </BentoCard>
                        ) : (
                        <motion.button {...pressProps('card')}
                            onClick={() => { haptic('light'); navigate('/master-journey-mobile'); }}
                            className="w-full flex items-center justify-between rounded-[24px] px-5"
                            style={{ minHeight: 64, background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.08)', color: C.deepBlack }}>
                            <span className="text-[19px] font-black tracking-tight">去練這週第一次</span>
                            <ChevronRight size={18} color="#F95C4B" strokeWidth={2.5} />
                        </motion.button>
                        )}

                    </motion.div>
                )}

                {activeTab === 'strength' && (
                    <motion.div
                        key="strength"
                        className="space-y-4"
                        variants={pageVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {/* ═══ 1RM TREND ═══ */}
                        <BentoCard title="估算 1RM 趨勢" icon={TrendingUp}>
                            {topExercises.length === 0 ? (
                                <div className="h-48 flex items-center justify-center opacity-30 text-xs font-black">尚無訓練紀錄</div>
                            ) : (
                                <>
                                    {/* Exercise selector - Dropdown */}
                                    <div className="relative mb-6">
                                        <select
                                            value={activeExercise}
                                            onChange={(e) => setSelectedExercise(e.target.value)}
                                            className="w-full border rounded-[18px] px-4 py-3 text-sm font-black outline-none appearance-none pr-10"
                                            style={{ color: C.deepBlack, backgroundColor: C.white, borderColor: C.pebble }}
                                        >
                                            {topExercises.map(ex => (
                                                <option key={ex} value={ex}>{toZhExerciseName(ex) || ex}</option>
                                            ))}
                                        </select>
                                        <div className="absolute top-1/2 right-4 -translate-y-1/2 pointer-events-none opacity-50">
                                            <ChevronDown size={18} color={C.deepBlack} />
                                        </div>
                                    </div>

                                    {/* Current 1RM summary */}
                                    <div className="flex items-baseline justify-between mb-3">
                                        <div>
                                            <div className="text-[12px] font-black opacity-40 tracking-widest">當前預估</div>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-4xl font-black tracking-tighter" style={{ fontVariantNumeric: 'tabular-nums' }}>{current1RM}</span>
                                                <span className="text-sm font-black opacity-40">kg</span>
                                            </div>
                                        </div>
                                        {oneRMDelta !== 0 && (
                                            <div className="text-right">
                                                <div className="text-[12px] font-black opacity-40 tracking-widest">變化</div>
                                                <div className="text-lg font-black" style={{ color: oneRMDelta > 0 ? C.ember : '#888' }}>
                                                    {oneRMDelta > 0 ? '+' : ''}{oneRMDelta.toFixed(1)} kg
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {oneRMTrend.length < 2 ? (
                                        <p className="text-[17px] font-bold mt-2" style={{ color: C.deepBlack }}>再練一次這個動作，就畫得出趨勢</p>
                                    ) : (
                                    <div className="h-40 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={oneRMTrend} margin={{ top: 10, right: 24, left: 8, bottom: 4 }}>
                                                <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={8} minTickGap={20} padding={{ left: 12, right: 12 }} tick={{ fontSize: 11, fill: '#999', fontWeight: 700 }} />
                                                <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                                                <Tooltip content={<BrightTooltip />} cursor={{ stroke: C.deepBlack, strokeWidth: 1, strokeDasharray: '2 4', opacity: 0.3 }} />
                                                <Area type="linear" dataKey="value" stroke={C.coral} strokeWidth={1.5} fill="transparent"
                                                    dot={{ r: 2, fill: C.white, stroke: C.coral, strokeWidth: 1.5 }}
                                                    activeDot={{ r: 4, fill: C.deepBlack, stroke: C.white, strokeWidth: 1.5 }} 
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                    )}
                                    <p className="text-[12px] font-black opacity-30 tracking-widest mt-2">Epley 公式 · 最多顯示 12 次訓練</p>
                                </>
                            )}
                        </BentoCard>

                        {/* ═══ INTENSITY ZONES DONUT ═══ */}
                        <BentoCard title="強度區間分布" icon={Zap} glass>
                            {!trainingStimulus ? (
                                <p className="text-[12px] opacity-55 mt-2 leading-relaxed">
                                    這張圖要靠每一組的 RPE。記錄訓練時填一下，這裡就會出現。
                                </p>
                            ) : (
                            <div className="flex items-center gap-4 mt-2">
                                <div className="w-32 h-32 relative shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            {/* 將 innerRadius 與 outerRadius 縮短差距，並拿掉白邊 */}
                                            <Pie data={trainingStimulus.filter(z => z.volume > 0)} dataKey="volume" innerRadius={56} outerRadius={60} stroke="none" paddingAngle={4}>
                                                {trainingStimulus.filter(z => z.volume > 0).map((z, i) => (
                                                    <Cell key={i} fill={z.color === C.deepBlack ? '#161415' : z.color} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[12px] font-black opacity-50 text-[#161415]/50">28 天</span>
                                        <span className="text-sm font-black text-[#161415]">分布</span>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-3">
                                    {trainingStimulus.map((z, i) => (
                                        <div key={i}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[12px] font-black text-[#161415] tracking-wide">{z.name}</span>
                                                <span className="text-[11px] font-light font-display text-[#161415]">{z.percent}%</span>
                                            </div>
                                            <div className="h-[2px] w-full bg-[#161415]/10 overflow-hidden">
                                                <div className="h-full transition-all duration-700" style={{ width: `${z.percent}%`, backgroundColor: z.color === C.deepBlack ? '#161415' : z.color }} />
                                            </div>
                                            <div className="text-[11px] opacity-40 font-bold mt-1" style={{ color: '#161415' }}>{z.zone}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            )}
                        </BentoCard>

                        {/* ═══ VOLUME STATS ═══ */}
                        <div className="grid grid-cols-2 gap-4">
                            <BentoCard title="最高單次訓練量">
                                <span className="text-2xl font-black mt-2 tracking-tighter">
                                    {Math.max(0, ...records.map(r => r.volume || 0)).toLocaleString()}
                                    <small className="text-xs opacity-30"> kg</small>
                                </span>
                            </BentoCard>
                            <BentoCard title="平均單次訓練量">
                                <span className="text-2xl font-black mt-2 tracking-tighter">
                                    {Math.round(records.reduce((a, b) => a + (b.volume || 0), 0) / (records.length || 1)).toLocaleString()}
                                    <small className="text-xs opacity-30"> kg</small>
                                </span>
                            </BentoCard>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'load' && (
                    <motion.div
                        key="load"
                        className="space-y-4"
                        variants={pageVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {/* ═══ ACWR GAUGE (large) ═══ */}
                        {/* 改用 glass（淺玻璃卡＋深色文字）— 原本 dark 在此頁實際 render 成淺底，
                            白字配淺底糊到看不清，改深字即清晰可讀。 */}
                        <BentoCard title="訓練負荷比 ACWR" icon={Gauge} glass>
                            <div className="flex items-baseline gap-3 mb-1">
                                <span className="text-6xl font-black tracking-tighter" style={{ color: acwr.status === 'safe' ? C.coral : C.ember }}>
                                    {acwr.ratio}
                                </span>
                                <span className="text-xs font-black italic opacity-80">
                                    {acwr.status === 'safe' && '最佳訓練區間'}
                                    {acwr.status === 'caution' && '接近過勞邊緣'}
                                    {acwr.status === 'danger' && '高受傷風險'}
                                    {acwr.status === 'detraining' && '訓練量不足'}
                                    {acwr.status === 'insufficient' && '資料不足'}
                                </span>
                            </div>
                            <p className="text-[11px] opacity-70 mb-4">急性 7 天 / 慢性 28 天平均</p>

                            {/* Horizontal gauge bar */}
                            <div className="relative h-3 rounded-full overflow-hidden bg-black/10">
                                <div className="absolute top-0 bottom-0 bg-black/10" style={{ left: '40%', width: '25%' }} />
                                <div className="absolute top-0 bottom-0 border-l-2 border-coral/60" style={{ left: '40%' }} />
                                <div className="absolute top-0 bottom-0 border-l-2 border-coral/60" style={{ left: '65%' }} />
                                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-white"
                                    style={{ left: `${Math.min(100, ((+acwr.ratio || 0) / 2) * 100)}%`, backgroundColor: acwr.status === 'safe' ? C.coral : C.ember, boxShadow: '0 0 12px rgba(249,92,75,0.6)' }} />
                            </div>
                            <div className="flex justify-between text-[11px] font-black mt-2 opacity-70 uppercase tracking-widest">
                                <span>不足</span>
                                <span style={{ color: C.coral }}>安全 0.8-1.3</span>
                                <span style={{ color: C.ember }}>危險 &gt;1.5</span>
                            </div>

                            {acwr.status === 'insufficient' ? (
                                /* ── Unlock progress card (replaces the 急性/慢性 grid) ── */
                                <motion.div
                                    className="mt-5 pt-4 border-t border-black/10"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3, duration: 0.4 }}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[12px] font-black opacity-40 tracking-widest">解鎖進度</span>
                                        <span className="text-[11px] font-black" style={{ color: C.coral }}>
                                            {acwr.daysUntilUnlock > 0
                                                ? `還差 ${acwr.daysUntilUnlock} 天`
                                                : '即將解鎖'}
                                        </span>
                                    </div>
                                    {/* Progress bar toward 8 days */}
                                    <div className="h-1.5 rounded-full overflow-hidden bg-black/10 mb-3">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: C.coral }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, ((8 - (acwr.daysUntilUnlock || 0)) / 8) * 100)}%` }}
                                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.45 }}
                                        />
                                    </div>
                                    <p className="text-[11px] font-black opacity-50 leading-relaxed">
                                        ACWR 需要橫跨 8 天以上的訓練紀錄來建立慢性負荷基線。<br />
                                        持續訓練後此指標將自動解鎖，協助你偵測過勞與受傷風險。
                                    </p>
                                    {/* Current acute volume peek */}
                                    {acwr.acute > 0 && (
                                        <div className="mt-3 pt-3 border-t border-black/10">
                                            <div className="text-[12px] opacity-55 font-black tracking-widest">本週已累積</div>
                                            <div className="text-lg font-black mt-0.5">{Math.round(acwr.acute).toLocaleString()}<small className="text-[11px] opacity-40"> kg</small></div>
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-black/10">
                                    <div>
                                        <div className="text-[12px] opacity-70 font-black tracking-widest">本週 (急性)</div>
                                        <div className="text-lg font-black mt-0.5">{Math.round(acwr.acute).toLocaleString()}<small className="text-[11px] opacity-60"> kg</small></div>
                                    </div>
                                    <div>
                                        <div className="text-[12px] opacity-70 font-black tracking-widest">4 週均 (慢性)</div>
                                        <div className="text-lg font-black mt-0.5">{Math.round(acwr.chronic).toLocaleString()}<small className="text-[11px] opacity-60"> kg</small></div>
                                    </div>
                                </div>
                            )}
                            <CoachVerdict note={acwrNote(acwr)} />
                        </BentoCard>

                        {/* ═══ VOLUME BY MUSCLE ═══ */}
                        <BentoCard title="肌群訓練量分布" icon={Layers} delay={0.05}>
                            <p className="text-[12px] opacity-30 font-black tracking-widest mb-4">過去 7 天</p>
                            <motion.div
                                className="h-48 w-full -ml-2"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ type: 'spring', stiffness: 200, damping: 24, delay: 0.2 }}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={volumeByMuscle}>
                                        <PolarGrid stroke={C.pebble} />
                                        <PolarAngleAxis dataKey="name" tick={{ fill: C.deepBlack, fontSize: 11, fontWeight: 'bold' }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                                        <Radar name="Volume" dataKey="volume" stroke={C.coral} fill={C.coral} fillOpacity={0.5} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </motion.div>
                            <CoachVerdict note={muscleBalanceNote(volumeByMuscle)} />
                        </BentoCard>
                    </motion.div>
                )}

                {activeTab === 'recovery' && (
                    <motion.div
                        key="recovery"
                        className="space-y-4"
                        variants={pageVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {/* ═══ OVERALL READINESS (small hero) ═══ */}
                        {/* glass（淺玻璃卡＋深色文字）— 原 dark 在此頁 render 成淺底，白字看不清 */}
                        <BentoCard title="整體恢復狀態" icon={Heart} glass>
                            <div className="flex items-baseline gap-3 mb-4">
                                <motion.span
                                    className="text-5xl font-black tracking-tighter"
                                    style={{ color: C.coral }}
                                    initial={{ opacity: 0, scale: 0.7 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
                                >{readiness?.avgRecovery == null ? '—' : `${readiness.avgRecovery}%`}</motion.span>
                                <span className="text-xs font-black italic opacity-80">
                                    {readiness?.avgRecovery == null ? '練一場就看得到' : `平均 · ${readiness.label}`}
                                </span>
                            </div>
                            <div className="grid grid-cols-6 gap-1.5">
                                {Object.entries(recoveryDetails).map(([key, data], idx) => (
                                    <motion.div
                                        key={key}
                                        className="flex flex-col items-center gap-1"
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.15 + idx * 0.04 }}
                                    >
                                        {/* 沒練過的不畫成滿格 —— 那會讓人以為全身都練完且完全恢復 */}
                                        <div className="w-full h-10 rounded-md relative overflow-hidden bg-black/10">
                                            <motion.div
                                                className="absolute bottom-0 inset-x-0"
                                                style={{ backgroundColor: data.tracked === false ? 'rgba(22,20,21,0.12)' : (data.score >= 80 ? C.coral : data.score >= 50 ? C.ember : '#555') }}
                                                initial={{ height: 0 }}
                                                animate={{ height: data.tracked === false ? '8%' : `${data.score}%` }}
                                                viewport={{ once: true }}
                                                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.25 + idx * 0.05 }}
                                            />
                                        </div>
                                        <span className="text-[11px] font-black opacity-70 uppercase">{key.slice(0, 3)}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </BentoCard>

                        {/* ═══ MUSCLE RECOVERY COUNTDOWN ═══ */}
                        <BentoCard title="肌群恢復倒數" icon={Timer} delay={0.05}>
                            <p className="text-[12px] opacity-30 font-black tracking-widest mb-4">48-72 小時 完全恢復</p>
                            <div className="space-y-3">
                                {Object.entries(recoveryDetails).map(([key, data], idx) => {
                                    const labels = { chest: '胸', back: '背', shoulders: '肩', arms: '手臂', core: '核心', legs: '腿' };
                                    const statusLabels = { ready: '可訓練', almost_ready: '即將恢復', recovering: '恢復中', fatigued: '疲勞' };
                                    const statusColors = { ready: C.coral, almost_ready: C.coral, recovering: C.ember, fatigued: C.ember };
                                    return (
                                        <motion.div
                                            key={key}
                                            initial={{ opacity: 0, x: -16 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ type: 'spring', stiffness: 300, damping: 28, delay: Math.min(idx, 6) * 0.06 }}
                                        >
                                            <div className="flex justify-between items-baseline mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-black">{labels[key] || key}</span>
                                                    <span className="text-[11px] font-black opacity-40">
                                                        {data.tracked === false ? '還沒練' : (statusLabels[data.status] || data.status)}
                                                    </span>
                                                </div>
                                                <span className="text-[11px] font-black" style={{ color: statusColors[data.status] || C.deepBlack }}>
                                                    {data.tracked === false ? '—' : (data.hoursUntilRecovery > 0 ? `${data.hoursUntilRecovery}h 後` : '已準備好')}
                                                </span>
                                            </div>
                                            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.pebble }}>
                                                <motion.div
                                                    className="h-full rounded-full"
                                                    style={{ backgroundColor: data.tracked === false ? 'rgba(22,20,21,0.14)' : (statusColors[data.status] || C.coral) }}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: data.tracked === false ? '4%' : `${data.score}%` }}
                                                    viewport={{ once: true }}
                                                    transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.1 + idx * 0.06 }}
                                                />
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </BentoCard>

                        {/* 「本週耗能預估」已移除：原本是訓練量 ×0.045 ＋ 活動天數 ×150 的編造公式，
                            進度條寫死 75%。沒有實測就不顯示（熱量消耗在營養頁以實際運動紀錄計算）。 */}
                    </motion.div>
                )}

                {activeTab === 'history' && (
                    <motion.div
                        key="history"
                        className="space-y-4"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                        <div className="flex gap-2">
                            <div className="flex-1 rounded-[18px] px-4 py-2 flex items-center gap-2 border transition-colors search-bar-container" style={{ backgroundColor: C.white, borderColor: C.pebble }}>
                                <Calendar size={16} color={C.deepBlack} className="opacity-50 shrink-0" />
                                <input 
                                    type="date" 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent border-none outline-none text-xs w-full py-1.5 uppercase tracking-widest"
                                    style={{ color: C.deepBlack }}
                                />
                                {searchQuery && (
                                    <motion.button {...pressProps('icon')} onClick={() => setSearchQuery('')} className="opacity-50 hover:opacity-100 p-1 shrink-0 bg-black/5 rounded-full">
                                        <X size={12} color={C.deepBlack} />
                                    </motion.button>
                                )}
                            </div>
                        </div>

                        {filteredRecords.length > 0 ? (
                            <div className="flex flex-col mt-4 w-full">
                                {filteredRecords.map((record, index) => (
                                    <RecordCard
                                        key={record.id}
                                        record={record}
                                        index={index}
                                        prExercises={recordPRMap[record.id] || new Set()}
                                        onClick={() => {
                                            setSelectedRecord(record);
                                            setIsEditModalOpen(true);
                                        }}
                                    />
                                ))}
                            </div>
                        ) : searchQuery ? (
                            <div className="py-20 text-center opacity-40">
                                <p className="text-sm font-black uppercase tracking-widest">無符合搜尋條件的紀錄</p>
                                <p className="text-[11px] mt-2 tracking-widest uppercase">No matching records found</p>
                            </div>
                        ) : null}
                    </motion.div>
                )}

                {activeTab === 'history' && isProcessing && (
                    <div className="py-20 text-center space-y-4">
                        <div className="w-12 h-12 mx-auto border-4 border-coral/30 border-t-coral rounded-full animate-spin" />
                        <p className="text-[12px] font-black tracking-widest opacity-40">讀取訓練紀錄中...</p>
                    </div>
                )}

                {activeTab === 'history' && !isProcessing && records.length === 0 && (
                    <div className="bg-white/50 rounded-[28px] p-12 text-center space-y-4 border border-black/5">
                        <div className="w-16 h-16 mx-auto rounded-full bg-stone flex items-center justify-center" style={{ background: C.stone }}>
                            <Dumbbell size={32} color={C.coral} />
                        </div>
                        <h2 className="text-xl font-bold" style={{ color: C.deepBlack }}>No Records Yet</h2>
                        <p className="text-sm opacity-40" style={{ color: C.deepBlack }}>
                            Your completed workouts will appear here.
                        </p>
                        <p className="text-[11px] opacity-30 mt-4 uppercase">User ID: {userId}</p>
                    </div>
                )}
                </AnimatePresence>
            </main>

            {/* Floating Action Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/luxury-plan-view-mobile')}
                className="fixed bottom-24 right-6 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl z-20 transition-transform"
                style={{ backgroundColor: C.coral }}
            >
                <Plus size={32} color="white" strokeWidth={3} />
            </motion.button>


            {/* Edit Modal - Editable Version */}
            < AnimatePresence >
                {isEditModalOpen && selectedRecord && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-8 sm:pb-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="w-full max-w-sm rounded-[36px] p-8 lg-glass relative overflow-hidden flex flex-col max-h-[85dvh]"
                            style={{ 
                                backgroundColor: C.pebble, 
                                backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.18) 48%, rgba(255,255,255,0.34) 100%)' 
                            }}
                        >
                            <div className="flex justify-between items-center mb-8 shrink-0">
                                <div>
                                    <h2 className="text-3xl font-black italic tracking-tighter" style={{ color: C.deepBlack }}>
                                        {new Date(selectedRecord.date).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })}
                                    </h2>
                                    <p className="text-[12px] font-black tracking-widest opacity-60" style={{ color: C.deepBlack }}>
                                        {selectedRecord.muscles?.join(' / ')} • {selectedRecord.timestamp ? new Date(selectedRecord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '14:30'} • 耗時 {selectedRecord.duration_mins || 45} 分鐘
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <motion.button {...pressProps('icon')}
 onClick={(e) => handleDeleteRecord(selectedRecord.id, e)}
 className="w-10 h-10 rounded-full flex items-center justify-center bg-black/5 hover:bg-red-500 hover:text-white"
 >
                                        <Trash2 size={18} />
                                    </motion.button>
                                    <motion.button {...pressProps('icon')}
 onClick={() => setIsEditModalOpen(false)}
 className="w-10 h-10 rounded-full flex items-center justify-center bg-black/5 hover:bg-black/10"
 >
                                        <X size={20} color={C.deepBlack} />
                                    </motion.button>
                                </div>
                            </div>

                            <div className="space-y-4 overflow-y-auto pr-2 scrollbar-thin flex-1 pb-4">
                                {selectedRecord.exercises
                                    ?.map((ex, i) => ({ ex, i }))   // 保留原始 index，避免編輯/刪除錯位
                                    .filter(({ ex }) => {
                                        // 只顯示「當天實際有訓練」的動作；跳過/未記錄(0組0重量)的不顯示
                                        const detailed = ex.detailedSets || (Array.isArray(ex.sets) && typeof ex.sets[0] === 'object' ? ex.sets : null);
                                        if (detailed) {
                                            return detailed.some(s => (parseFloat(s.weight) || 0) > 0 || (parseInt(s.reps) || 0) > 0);
                                        }
                                        const setCount = Array.isArray(ex.sets) ? ex.sets.length : (parseInt(ex.sets) || 0);
                                        const w = parseFloat((ex.weight || 0).toString().replace('kg', '')) || 0;
                                        return setCount > 0 && w > 0;
                                    })
                                    .map(({ ex, i }) => (
                                    <div key={i} className="bg-white rounded-[24px] p-6 shadow-sm border border-black/5">
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex-1 flex items-center gap-2 mr-2 min-w-0">
                                                <input
                                                    value={ex.name}
                                                    onChange={(e) => {
                                                        const newExercises = [...selectedRecord.exercises];
                                                        newExercises[i].name = e.target.value;
                                                        setSelectedRecord({ ...selectedRecord, exercises: newExercises });
                                                    }}
                                                    className="font-black text-lg bg-transparent border-b-2 border-transparent focus:border-coral outline-none w-full transition-colors truncate"
                                                    style={{ color: C.deepBlack }}
                                                />
                                                {prStats.items.some(item => item.name === ex.name) && (
                                                    <div className="bg-[#F95C4B]/10 rounded-full px-2 py-1 flex items-center shrink-0 border border-[#F95C4B]/20 shadow-sm shadow-[#F95C4B]/10">
                                                        <Trophy size={14} color={C.coral} />
                                                        <span className="text-[11px] font-black ml-1 uppercase" style={{ color: C.coral }}>PR</span>
                                                    </div>
                                                )}
                                            </div>
                                            <motion.button {...pressProps('row')}
 onClick={(e) => handleDeleteExercise(i, e)}
 className="p-2 text-black/20 hover:text-red-500 transition-colors"
 >
                                                <Trash2 size={16} />
                                            </motion.button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="flex flex-col">
                                                <label className="text-[11px] font-bold text-black/40 uppercase mb-1">Sets</label>
                                                <input
                                                    type="number"
                                                    value={Array.isArray(ex.sets) ? ex.sets.length : (ex.sets || '')}
                                                    placeholder="0"
                                                    onChange={(e) => {
                                                        const newExercises = [...selectedRecord.exercises];
                                                        newExercises[i].sets = e.target.value;
                                                        setSelectedRecord({ ...selectedRecord, exercises: newExercises });
                                                    }}
                                                    className="w-full bg-white/60 rounded-lg px-2 py-1.5 text-xs font-bold text-black focus:ring-2 focus:ring-black/10 outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <label className="text-[12px] font-bold text-black/40 mb-1">次數</label>
                                                <input
                                                    value={ex.reps || (Array.isArray(ex.sets) && ex.sets.length > 0 ? Math.round(ex.sets.reduce((a, b) => a + (parseInt(b.reps) || 0), 0) / ex.sets.length) : '')}
                                                    placeholder="0"
                                                    onChange={(e) => {
                                                        const newExercises = [...selectedRecord.exercises];
                                                        newExercises[i].reps = e.target.value;
                                                        setSelectedRecord({ ...selectedRecord, exercises: newExercises });
                                                    }}
                                                    className="w-full bg-white/60 rounded-lg px-2 py-1.5 text-xs font-bold text-black focus:ring-2 focus:ring-black/10 outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <label className="text-[12px] font-bold text-black/40 mb-1">最大重量</label>
                                                <div className="relative">
                                                    <input
                                                        value={ex.weight?.toString().replace('kg', '') || (Array.isArray(ex.sets) && ex.sets.length > 0 ? Math.max(...ex.sets.map(s => parseInt(s.weight) || 0)) : '')}
                                                        placeholder="0"
                                                        onChange={(e) => {
                                                            const newExercises = [...selectedRecord.exercises];
                                                            newExercises[i].weight = e.target.value;
                                                            setSelectedRecord({ ...selectedRecord, exercises: newExercises });
                                                        }}
                                                        className="w-full bg-white/60 rounded-lg pl-2 pr-6 py-1.5 text-xs font-bold text-black focus:ring-2 focus:ring-black/10 outline-none"
                                                    />
                                                    <span className="absolute right-2 top-1.5 text-xs font-bold text-black/40">kg</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Display detailed sets if available (read-only：訓練後不再事後修改) */}
                                        {(ex.detailedSets && ex.detailedSets.length > 0) || (Array.isArray(ex.sets) && typeof ex.sets[0] === 'object') ? (
                                            <div className="mt-3 pt-3 border-t border-black/5">
                                                <div className="flex justify-between text-[11px] font-bold text-black/40 mb-1 px-2">
                                                    <span>組數</span>
                                                    <span>重量</span>
                                                    <span>次數</span>
                                                </div>
                                                {(ex.detailedSets || ex.sets).map((set, setIdx) => (
                                                    <div key={setIdx} className="flex justify-between items-center py-1.5 px-2 bg-white/30 rounded mb-1">
                                                        <span className="font-bold text-xs w-8 text-black/60">#{set.set_number || setIdx + 1}</span>
                                                        <span className="font-bold text-xs text-black">{set.weight || 0} <span className="text-[11px] text-black/40">KG</span></span>
                                                        <span className="font-bold text-xs text-black">{set.reps || 0} <span className="text-[11px] text-black/40">次</span></span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}

                                    </div>
                                ))}

                                <motion.button {...pressProps('cta')}
 onClick={() => {
 const newExercises = [...(selectedRecord.exercises || []), { name: 'New Exercise', sets: 3, reps: 10, weight: 10 }];
 setSelectedRecord({ ...selectedRecord, exercises: newExercises });
 }}
 className="w-full py-3 rounded-[18px] bg-white/30 border border-dashed border-black/20 text-black/60 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/50 transition-colors"
 >
                                    <Plus size={16} />
                                    新增動作
                                </motion.button>
                            </div>

                            <div className="mt-6 pt-4 border-t border-black/5 shrink-0">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs font-bold uppercase text-black/40">總訓練量</span>
                                    <span className="text-xl font-bold text-black">
                                        {selectedRecord.exercises?.reduce((acc, ex) => {
                                            // 1. Try detailed calculation first
                                            const setsArr = ex.detailedSets || (Array.isArray(ex.sets) && typeof ex.sets[0] === 'object' ? ex.sets : null);
                                            if (setsArr) {
                                                const exerciseVolume = setsArr.reduce((v, s) => v + ((parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0)), 0);
                                                return acc + exerciseVolume;
                                            }

                                            // 2. Fallback to summary calc
                                            const w = parseFloat((ex.weight || 0).toString().replace('kg', '')) || 0;
                                            const s = parseInt(ex.sets || 0);

                                            // Handle reps range "8-12"
                                            const rStr = (ex.reps || '0').toString();
                                            let r = 0;
                                            if (rStr.includes('-')) {
                                                const parts = rStr.split('-').map(p => parseFloat(p));
                                                r = (parts[0] + parts[1]) / 2;
                                            } else {
                                                r = parseFloat(rStr) || 0;
                                            }

                                            const vol = s * r * w;
                                            return acc + (isNaN(vol) ? 0 : vol);
                                        }, 0).toLocaleString()} kg
                                    </span>
                                </div>
                                <motion.button {...pressProps('pill')}
 onClick={() => handleSaveRecord(selectedRecord, true)}
 className="w-full py-3.5 rounded-xl bg-[#161415] text-white font-bold shadow-lg flex items-center justify-center gap-2"
 >
                                    <Check size={18} />
                                    Save Changes
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            {/* PR Celebration Overlay */}
            <AnimatePresence>
                {showPRCelebration && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1000000] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md"
                        onClick={() => setShowPRCelebration(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 15 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            transition={{ ease: "easeOut", duration: 0.25 }}
                            className="bg-[#F6F4F1] border border-[#161415] rounded-none p-8 max-w-sm w-full text-left relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-8 pb-3 border-b border-[#161415]/10">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-black tracking-[0.3em] uppercase opacity-40 text-[#161415]">
                                        Weekly Record
                                    </span>
                                    <h2 className="text-2xl font-light italic text-[#161415]" style={{ fontFamily: 'var(--font-display)' }}>
                                        {prStats.count > 0 ? 'Personal Record' : 'No New Records'}
                                    </h2>
                                </div>
                                <Zap size={18} color={C.coral} />
                            </div>

                            {prStats.count > 0 ? (
                                <div className="space-y-4 mb-8">
                                    {prStats.items.map((item, i) => (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.1 + i * 0.08 }}
                                            key={i} 
                                            className="flex flex-col pb-3 border-b border-[#161415]/5 last:border-b-0 last:pb-0"
                                        >
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className="font-bold text-[#161415] text-sm tracking-wide">{item.name}</span>
                                                <span className="text-xs font-light italic opacity-60" style={{ fontFamily: 'var(--font-display)' }}>
                                                    Est. 1RM
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-xs opacity-50 font-bold uppercase tracking-wider">
                                                    {item.weight}kg × {item.reps} reps
                                                </span>
                                                <span className="text-base font-light italic text-[#161415]" style={{ fontFamily: 'var(--font-display)' }}>
                                                    {Math.round(item.e1rm)}kg
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-6 mb-8 text-center border border-[#161415]/5 bg-black/[0.02]">
                                    <p className="text-[12px] font-black opacity-30 tracking-[0.04em] mb-1">繼續努力</p>
                                    <p className="text-xs opacity-50 px-4">本週尚未突破個人紀錄。維持規律訓練，挑戰下一次高峰！</p>
                                </div>
                            )}
                            
                            <motion.button {...pressProps('row')} 
 onClick={() => setShowPRCelebration(false)}
 className="w-full bg-[#161415] text-[#F6F4F1] font-black py-4 rounded-none tracking-[0.2em] text-[12px]"
 >
                                {prStats.count > 0 ? '繼續保持' : '返回儀表板'}
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {!isEditModalOpen && <MobileNavigation />}
        </div >
    );
};

const RecordCard = ({ record, onClick, prExercises = new Set(), index = 0 }) => {
    const C = {
  deepBlack: T.BLACK,
  coral: T.EMBER,
  border: 'rgba(22, 20, 21, 0.12)',
};
    const effort = record.effortScore || record.overall_score || 0;
    const hasPR = prExercises.size > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} whileTap={{ opacity: 0.7 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 6) * 0.07 }}
            onClick={onClick}
            className="py-6 border-b cursor-pointer flex flex-col group"
            style={{ borderColor: C.border }}
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.3em] opacity-40 text-[#161415]">
                        {new Date(record.date).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })}
                    </span>
                    <h3 className="text-3xl font-light font-display"
                        style={{ color: record.titleZh ? '#161415' : 'rgba(22,20,21,0.38)' }}>
                        {record.titleZh || '沒有記錄動作'}
                    </h3>
                </div>
                <div className="text-right">
                    {/* 0 KG 有兩種完全不同的意思：徒手做滿 20 組也是 0 公斤，
                        中途離開沒記到任何一組也是 0 公斤。不能都印成「0 KG」。 */}
                    <div className="text-lg font-black tracking-widest text-[#161415]">
                        {record.volume > 0 ? (
                            <>{record.volume.toLocaleString()} <span className="text-[11px] opacity-30 font-bold">KG</span></>
                        ) : record.setsDone > 0 ? (
                            <>{record.setsDone} <span className="text-[11px] opacity-30 font-bold">組</span></>
                        ) : (
                            <span className="text-[13px] font-bold" style={{ color: 'rgba(22,20,21,0.32)' }}>未記錄</span>
                        )}
                    </div>
                    {hasPR && (
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                            <Trophy size={10} color="#D94030" />
                            <span className="text-[12px] font-black tracking-[0.18em] text-[#D94030]">
                                {prExercises.size} 項個人最佳
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
                {record.exercises?.slice(0, 3).map((ex, i) => {
                    const exIsPR = prExercises.has(ex.name);
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full" style={{ background: exIsPR ? '#D94030' : 'rgba(22,20,21,0.2)' }} />
                            <span className="text-[11px] font-bold uppercase tracking-[0.05em]"
                                style={{ color: exIsPR ? '#D94030' : 'rgba(22,20,21,0.6)' }}>
                                {ex.name}
                            </span>
                            {exIsPR && <Trophy size={9} color="#D94030" />}
                        </div>
                    );
                })}
            </div>

            {effort > 0 && (
                <div className="w-full h-[1px] mt-5 bg-[#161415]/10 overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }} animate={{ width: `${effort}%` }}
                        className="h-full"
                        style={{ backgroundColor: effort >= 80 ? C.coral : C.deepBlack }}
                    />
                </div>
            )}
        </motion.div>
    );
};

export default TrainingRecordPageMobile;
