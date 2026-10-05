import './BodyAnalysisViewMobile.css';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { featureGate } from '../utils/biometrics';
import MissingDataRow from './ui/MissingDataRow';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Activity, TrendingUp, Target, AlertCircle, ArrowLeft, Plus, ChevronDown, ChevronRight, Flame, Droplets, Pencil, Trash2, X } from 'lucide-react';   // Map/Search 已移除：日期篩選不需要地圖與放大鏡
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import InBodyInputForm from './InBodyInputForm';
import MobileNavigation from './MobileNavigation';
import MuscleDistributionView from './MuscleDistributionView';
import BodyPhotoMuscleOverlay from './BodyPhotoMuscleOverlay';
import BodyPhotoCapture from './BodyPhotoCapture';
import { getPhotos, savePhoto, deletePhoto, formatPhotoDate } from '../utils/bodyPhotoManager';
import { getUserId } from '../utils/auth';
import { haptic } from '../utils/haptics';
import { localRecordDate } from '../utils/journeyDashboardSummary';   // 與首頁身體數據卡同一份日期解析
import apiClient from '../api/client';
import { editorialColors } from '../utils/colors';
import { isMember } from '../utils/membership';
import { trimToHistory } from '../utils/memberLimits';
import RunningLoader from './RunningLoader';
import MuscleBalanceAnalysis from './MuscleBalanceAnalysis';

const C = editorialColors;

const FontStyle = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
        .body-analysis-page {
            font-family: 'Tenor Sans', sans-serif !important;
        }
        .editorial-title {
            font-family: 'Tenor Sans', sans-serif !important;
            letter-spacing: -0.04em;
        }
        .editorial-number {
            font-family: 'Tenor Sans', sans-serif !important;
            letter-spacing: -0.06em;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
    `}</style>
);

/* ─── InBody Score helper (normalized, 40-100 range) ─── */
const calcInbodyScore = (weight, muscleMass, bodyFatPct, heightCm, gender = 'male') => {
    const w   = parseFloat(weight);
    const smm = parseFloat(muscleMass);
    const bfP = parseFloat(bodyFatPct);
    const hCm = parseFloat(heightCm);
    const h   = hCm / 100;
    // 身高也是必要條件 —— 以前缺身高就用 175 頂，體型分數整個算歪
    if (!w || !smm || !bfP || w < 1 || !(hCm > 80 && hCm < 250)) return null;
    if (!['male', 'female'].includes(String(gender))) return null;

    const stdW      = h * h * (gender === 'male' ? 22 : 21.5);
    const idealBFPct = gender === 'male' ? 0.15 : 0.23;
    const stdBFM    = stdW * idealBFPct;
    const stdLBM    = stdW - stdBFM;
    const actualBFM = w * (bfP / 100);
    const actualLBM = w - actualBFM;

    // Muscle component: ±20 pts, normalized by expected LBM
    const muscleScore = Math.max(-20, Math.min(20, ((actualLBM - stdLBM) / stdLBM) * 50));
    // Fat penalty: ±20 pts, normalized by expected BFM
    const fatPenalty  = Math.max(-20, Math.min(20, ((actualBFM - stdBFM) / stdBFM) * 35));

    return Math.round(Math.max(40, Math.min(100, 80 + muscleScore - fatPenalty)));
};

/* ─── 體型分數的區間說明 ───────────────────────────────────────────
   一個數字沒有區間就答不出「我現在在哪」（介面標準 §6 三秒直覺測試）。
   全專案只有這一份定義（§9）；2–3 個字，窄卡也放得下（§1.3）。 */
const scoreBand = (s) => {
    const n = parseFloat(s);
    if (!(n > 0)) return null;
    if (n >= 85) return '很好';
    if (n >= 70) return '不錯';
    if (n >= 55) return '普通';
    return '待加強';
};

const BodyAnalysisViewMobile = ({ userId: propUserId, onBack }) => {
    const userId = propUserId || getUserId();
    const navigate = useNavigate();
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [inbodyHistory, setInbodyHistory] = useState([]);
    const [inbodyTrends, setInbodyTrends] = useState(null);
    const [editingRecord, setEditingRecord] = useState(null);
    const [showInputForm, setShowInputForm] = useState(false);
    // 🎯 從「完整計劃」引導頁的營養項過來（沒量過 / 資料過期）→ 直接把量測表單打開，
    //    使用者不用自己在頁面裡找「新增紀錄」按鈕。只在掛載時判斷一次。
    const _location = useLocation();
    useEffect(() => {
        if (_location?.state?.openInBodyForm) setShowInputForm(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [showMuscleView, setShowMuscleView] = useState(false);
    const [showPhotoCapture, setShowPhotoCapture] = useState(false);
    const [bodyPhotos, setBodyPhotos] = useState(() => getPhotos(userId)); // lazy init — avoids [] → photos flash (rerender-lazy-state-init)
    const [activePhotoIndex, setActivePhotoIndex] = useState(0);
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null); // ✅ 取代 window.confirm

    // ★ NEW: pending photo waiting for InBody data before being saved
    const [pendingPhotoBase64, setPendingPhotoBase64] = useState(null);

    // 🎯 「身體」屬性雷達分頁刪除，改成「肌肉平衡」完整分析系統分頁（個人數據總和）。
    const TABS = [
        { id: 'overview', label: '總覽' },
        { id: 'muscle', label: '肌肉平衡' },
        { id: 'history', label: '歷史' }
    ];
    const [activeTab, setActiveTab] = useState('overview');
    useEffect(() => {
        // 舊的 'body' 分頁移除 → 若殘留就導回總覽
        if (activeTab === 'body') setActiveTab('overview');
    }, [activeTab]);
    const [trendMetric, setTrendMetric] = useState('weight_kg');
    /* 量測紀錄預設只顯示前幾筆 —— 一路往下鋪到底的話，頁面尾端就變成
       一疊長得一樣的卡，而使用者真正會看的只有最近那幾次。 */
    const RECORDS_PREVIEW = 3;
    const [showAllRecords, setShowAllRecords] = useState(false);

    /* ── 一個指標的趨勢資料 ──────────────────────────────────────────────
       這一段是這頁跟首頁「身體數據」卡之間的接縫。
       首頁用 bodyMeasurementPair 決定「這次 vs 上次」，而它有一條規則：
       同一天重複匯入／修改，不算一次新的身體變化。這頁以前沒有這條規則，
       直接拿排序後的第二筆來減 —— 同一天量兩次就變成「較上次 0.0 kg」，
       而首頁同時間顯示的是跟真正上一天比的數字。同一份資料，兩個答案。
       現在兩邊共用同一個函式，規則只有一份。

       回傳：
         points  依時間排序、同一天收斂成一筆（取當天最後一次）的資料點
         change  跟「上一個不同日期」比的變化，連間隔幾天一起講
         total / skipped  這個指標有幾筆、有幾筆沒填（畫面要老實說）
         ticks   折線 X 軸的刻度（真實日期，不是等距的索引） */
    const metricSeries = React.useCallback((metric) => {
        const rows = Array.isArray(inbodyHistory) ? inbodyHistory : [];
        const total = rows.length;
        const valid = rows
            .map((r) => {
                const raw = r[metric];
                const v = Number(raw);
                const d = localRecordDate(r.measurement_date || r.date);
                return Number.isFinite(v) && v > 0 && Number.isFinite(d.getTime())
                    ? { value: v, date: d, day: String(r.measurement_date || r.date).slice(0, 10), raw: r }
                    : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.date - b.date);

        // 同一天多筆 → 只留當天最後一次（與 bodyMeasurementPair 同一條規則）
        const byDay = new Map();
        valid.forEach((x) => byDay.set(x.day, x));
        const points = [...byDay.values()]
            .sort((a, b) => a.date - b.date)
            .map((x) => ({ t: x.date.getTime(), value: x.value, day: x.day,
                dateLabel: `${x.date.getFullYear()}/${x.date.getMonth() + 1}/${x.date.getDate()}` }));

        let change = null;
        if (points.length >= 2) {
            const cur = points[points.length - 1];
            const prev = points[points.length - 2];
            const d = cur.value - prev.value;
            const days = Math.max(1, Math.round((cur.t - prev.t) / 86400000));
            const unit = { weight_kg: 'kg', skeletal_muscle_mass: 'kg', body_fat_percent: '%', body_water_percent: '%' }[metric] || '';
            const sign = d > 0 ? '+' : d < 0 ? '−' : '';
            change = {
                diff: d,
                days,
                text: d === 0
                    ? `跟 ${days} 天前一樣`
                    : `${days} 天內 ${sign}${Math.abs(d).toFixed(1)} ${unit}`.trim(),
            };
        }
        return { points, change, total, skipped: total - points.length, ticks: points.map((p) => p.t) };
    }, [inbodyHistory]);
    const [showInfo, setShowInfo] = useState(null);
    useEffect(() => {
        const hidden = showInputForm || showPhotoCapture || deleteConfirmId != null || showInfo != null;
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden } }));
        return () => window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
    }, [showInputForm, showPhotoCapture, deleteConfirmId, showInfo]);


    const INFO_CONTENT = {
        cid: {
            title: "體型判定分析",
            desc: (
                <>
                    比較體重、肌肉、脂肪三者的相對高低：<br/><br/>
                    <span className="font-bold text-[#161415]">C 型</span>　脂肪多於肌肉<br/>
                    <span className="font-bold text-[#161415]">I 型</span>　三者接近<br/>
                    <span className="font-bold text-[#161415]">D 型</span>　肌肉明顯多於脂肪
                </>
            ),
            tips: "理想目標是朝 D 型邁進。"
        },
        ffmi: {
            title: "無脂體重指數",
            desc: (
                <>
                    扣掉脂肪後，衡量骨架上有多少<span className="font-bold text-[#161415]">純肌肉</span>。BMI 看總重，FFMI 只看肌肉。
                </>
            ),
            tips: "22 為優秀，25 為自然生理極限。"
        },
        recovery: {
            title: "恢復與疲勞指標",
            desc: (
                <>
                    大重量訓練或睡不好時，肌肉發炎會讓水分集中到細胞外，數值就會上升。<span className="font-bold text-[#D94030]">這不是變胖</span>。<br/><br/>超過 <span className="font-bold text-[#161415]">0.390</span> 代表發炎或水腫，硬練容易受傷，請安排減載日。
                </>
            ),
            tips: "數值過高時，那一週就把重量與組數降下來。"
        },
        leanbulk: {
            title: "增肌品質",
            desc: "增加的體重裡，有多少比例是肌肉。分數越高，代表增重增得越漂亮。",
            tips: "60% 以上是非常理想的增肌品質。"
        }
    };

    const getCoachAdvice = (type, value) => {
        if (type === 'cid') {
            if (value === 'C') return "現在肌肉量偏低。先從深蹲、硬舉這類多關節動作把基礎力量練起來，別急著減重，每天的蛋白質先吃夠。新手這段時間長得最快。";
            if (value === 'I') return "三個數字很平均。想再往上推的話，可以開始慢慢增重：熱量和碳水多一點，訓練量也跟著加。";
            if (value === 'D') return "肌肉量很充足，現在狀態很好。適合開始練大重量，或是準備測一次三大項的最大重量。";
        }
        if (type === 'ffmi') {
            if (value < 18) return "這是長肌肉最快的階段。每次訓練都比上次多一點點重量或次數，肌肉量會長得很快。";
            if (value >= 18 && value < 20) return "已經不是新手了。接下來課表要分週期安排，也要開始注意疲勞累積，不然會卡住。";
            if (value >= 20 && value <= 22) return "肌肉量很出色。要再往上就得把飲食管得更嚴，並且針對弱的部位補強。";
            if (value > 22) return "肌肉量已經接近不用藥的極限。接下來練的是怎麼把現有的肌肉用出更大的力量。";
        }
        if (type === 'recovery') {
            if (value < 0.380) return "身體水分平衡得很好，沒有發炎跡象。今天狀態很好，適合挑戰大重量。";
            if (value >= 0.380 && value <= 0.390) return "恢復狀況良好。維持現在的訓練節奏和睡眠，照課表練就可以。";
            if (value > 0.390 && value <= 0.395) return "數值微幅上升，可能是上一次練太重留下的發炎。今天暖身做足、多補水，不要練到力竭。";
            if (value > 0.395) return "水腫指數過高，身體正在發炎或很疲勞。今天改成輕鬆活動，或整週把重量和組數降下來 —— 這時候硬練很容易受傷。";
        }
        return null;
    };

    // ─────────────────────────────────────────────────
    // HELPER: find closest inbody record (only used as fallback for old photos)
    // ─────────────────────────────────────────────────
    const findClosestRecord = React.useCallback((targetDate) => {
        if (!inbodyHistory || inbodyHistory.length === 0) return null;
        const targetTime = new Date(targetDate).getTime();
        if (isNaN(targetTime)) return inbodyHistory[0];
        let closest = null;
        let minDiff = Infinity;
        for (const record of inbodyHistory) {
            const recordTime = new Date(record.measurement_date || record.date).getTime();
            const diff = Math.abs(targetTime - recordTime);
            if (diff < minDiff) { minDiff = diff; closest = record; }
        }
        return closest;
    }, [inbodyHistory]);

    // ─────────────────────────────────────────────────
    // latestComposition: always the newest inbody record
    // Used as fallback when user skips filling data
    // ─────────────────────────────────────────────────
    const latestComposition = React.useMemo(() => {
        const base = (analysis && analysis.composition) ? { ...analysis.composition } : {};
        const latest = inbodyHistory?.[0];
        if (!latest) return base;
        if (latest.weight_kg) base.weight = latest.weight_kg;
        if (latest.body_fat_percent) base.body_fat_percentage = latest.body_fat_percent;
        if (latest.skeletal_muscle_mass) base.muscle_mass = latest.skeletal_muscle_mass;
        Object.keys(latest).forEach(key => { const val = latest[key]; if (val !== null && val !== undefined && val !== '') base[key] = val; });
        // 缺身高或性別時 calcInbodyScore 自己會回 null，不在這裡補假值
        const score = calcInbodyScore(base.weight, base.muscle_mass, base.body_fat_percentage, base.height || base.height_cm, analysis?.gender);
        if (score !== null) base.inbody_score = score;
        return base;
    }, [analysis, inbodyHistory]);

    // ─────────────────────────────────────────────────
    // buildCompositionForPhoto
    //
    // ★ CORE CHANGE: snapshot is the ONLY data source for photos.
    //   Photo + data are BOUND together via snapshot.
    //   Old photos without snapshot fallback to closest inbody record.
    // ─────────────────────────────────────────────────
    const buildCompositionForPhoto = React.useCallback((photoIndex) => {
        const base = (analysis && analysis.composition) ? { ...analysis.composition } : {};
        const photo = bodyPhotos?.[photoIndex];

        if (!photo) {
            // No photo at this index — use latest inbody record
            const latest = inbodyHistory?.[0];
            if (latest) {
                if (latest.weight_kg) base.weight = latest.weight_kg;
                if (latest.body_fat_percent) base.body_fat_percentage = latest.body_fat_percent; // fixed: was latest.body_fat_percentage
                if (latest.skeletal_muscle_mass) base.muscle_mass = latest.skeletal_muscle_mass;
                Object.keys(latest).forEach(key => { const val = latest[key]; if (val !== null && val !== undefined && val !== '') base[key] = val; });
            }
        } else if (photo.snapshot && typeof photo.snapshot === 'object') {
            // ★ Photo HAS snapshot → use it as THE data source (bound)
            Object.keys(photo.snapshot).forEach(key => {
                const val = photo.snapshot[key];
                if (val !== null && val !== undefined && val !== '') base[key] = val;
            });
        } else {
            // ★ Old photo WITHOUT snapshot → fallback to closest inbody record
            const closestRecord = findClosestRecord(photo.date);
            if (closestRecord) {
                if (closestRecord.weight_kg) base.weight = closestRecord.weight_kg;
                if (closestRecord.body_fat_percent) base.body_fat_percentage = closestRecord.body_fat_percent;
                if (closestRecord.skeletal_muscle_mass) base.muscle_mass = closestRecord.skeletal_muscle_mass;
                Object.keys(closestRecord).forEach(key => { const val = closestRecord[key]; if (val !== null && val !== undefined && val !== '') base[key] = val; });
            }
            if (photo.bodyWeight) base.weight = photo.bodyWeight;
            if (photo.bodyFat) base.body_fat_percentage = photo.bodyFat;
        }

        // Recalculate InBody Score
        const score = calcInbodyScore(
            base.weight, base.muscle_mass, base.body_fat_percentage,
            base.height || base.height_cm,
            analysis?.gender
        );
        if (score !== null) base.inbody_score = score;
        return base;
    }, [analysis, bodyPhotos, inbodyHistory, findClosestRecord]);

    const finalComposition = React.useMemo(() => buildCompositionForPhoto(activePhotoIndex), [buildCompositionForPhoto, activePhotoIndex]);

    const prevComposition = React.useMemo(() => {
        const prevPhotoIdx = activePhotoIndex + 1;
        if (bodyPhotos && bodyPhotos.length > 0 && bodyPhotos[prevPhotoIdx]) return buildCompositionForPhoto(prevPhotoIdx);
        return {};
    }, [buildCompositionForPhoto, activePhotoIndex, bodyPhotos]);

    const prevDate = React.useMemo(() => {
        const prevPhotoIdx = activePhotoIndex + 1;
        const prevPhoto = bodyPhotos?.[prevPhotoIdx];
        if (prevPhoto?.date) { const d = new Date(prevPhoto.date); return isNaN(d.getTime()) ? null : `${d.getMonth() + 1}/${d.getDate()}`; }
        return null;
    }, [activePhotoIndex, bodyPhotos]);

    // ─────────────────────────────────────────────────
    // Data fetching
    // ─────────────────────────────────────────────────
    useEffect(() => { if (userId) { fetchBodyAnalysis(); fetchInBodyHistory(); } }, [userId]);
    useEffect(() => { setBodyPhotos(getPhotos(userId)); }, [userId, showPhotoCapture]);

    const fetchBodyAnalysis = async () => {
        try {
            const response = await apiClient.get(`/api/user/body-analysis/${userId}`);
            setAnalysis(response.data.analysis);
        } catch (error) { console.error('Error fetching body analysis:', error); } finally { setLoading(false); }
    };

    // ★ normalize a record so the chart always has consistent field names
    const normalizeRecord = (r) => {
        const n = { ...r };
        // Ensure measurement_date (used by XAxis & sort) is always present
        if (!n.measurement_date && n.date) n.measurement_date = n.date;
        // Map frontend-style field names → chart field names (backend format)
        if (n.weight        !== undefined && n.weight_kg       === undefined) n.weight_kg            = n.weight;
        if (n.body_fat_percentage !== undefined && n.body_fat_percent === undefined) n.body_fat_percent = n.body_fat_percentage;
        if (n.muscle_mass   !== undefined && n.skeletal_muscle_mass === undefined) n.skeletal_muscle_mass = n.muscle_mass;
        return n;
    };

    const fetchInBodyHistory = async () => {
        let localRecords = [];
        try { localRecords = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]'); } catch (e) { }
        try {
            const response = await apiClient.get(`/api/user/inbody-history/${userId}?limit=20`, { timeout: 5000 });
            const data = response.data; let backendHistory = data.history || [];
            const backendIds = new Set(backendHistory.map(r => r.record_id).filter(Boolean));
            const localOnly = localRecords.filter(r => !r.record_id || !backendIds.has(r.record_id));
            const merged = [...localOnly, ...backendHistory]
                .map(normalizeRecord)
                .sort((a, b) => new Date(b.measurement_date || b.date) - new Date(a.measurement_date || a.date));
            setInbodyHistory(merged); setInbodyTrends(data.trends || null);
        } catch (error) {
            console.warn('Backend offline, using local InBody data');
            setInbodyHistory(localRecords.map(normalizeRecord).sort((a, b) => new Date(b.measurement_date) - new Date(a.measurement_date)));
        }
    };

    // ─────────────────────────────────────────────────
    // ★ HELPER: build a snapshot object from an inbody record
    // ─────────────────────────────────────────────────
    const buildSnapshotFromRecord = (record) => {
        const snap = {};
        if (!record) return snap;
        if (record.weight_kg) snap.weight = record.weight_kg;
        if (record.body_fat_percent) snap.body_fat_percentage = record.body_fat_percent;
        if (record.skeletal_muscle_mass) snap.muscle_mass = record.skeletal_muscle_mass;
        Object.keys(record).forEach(key => {
            const val = record[key];
            if (val !== null && val !== undefined && val !== '') snap[key] = val;
        });
        return snap;
    };

    // ─────────────────────────────────────────────────
    // ★ Form success handler: fetch fresh data, then save pending photo
    // ─────────────────────────────────────────────────
    const handleInputFormSuccess = async () => {
        // 1. Fetch the latest inbody record directly (don't wait for React state)
        let freshLatestRecord = null;
        try {
            const response = await apiClient.get(`/api/user/inbody-history/${userId}?limit=1`, { timeout: 5000 });
            const data = response.data;
            if (data.history && data.history.length > 0) freshLatestRecord = data.history[0];
        } catch (e) { }

        // Fallback to local records
        if (!freshLatestRecord) {
            try {
                const local = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
                if (local.length > 0) {
                    freshLatestRecord = local.reduce((max, item) => new Date(item.measurement_date || item.date) > new Date(max.measurement_date || max.date) ? item : max, local[0]);
                }
            } catch (e) { }
        }

        // 2. If there's a pending photo, save it with the FRESH data as snapshot
        if (pendingPhotoBase64) {
            const snapshot = buildSnapshotFromRecord(freshLatestRecord);
            savePhoto(userId, pendingPhotoBase64, {
                bodyWeight: snapshot.weight,
                bodyFat: snapshot.body_fat_percentage,
                snapshot: snapshot,
            });
            setPendingPhotoBase64(null);
        }

        // 3. Refresh all state
        fetchInBodyHistory();
        fetchBodyAnalysis();
        setBodyPhotos(getPhotos(userId));
        setActivePhotoIndex(0);
        setShowInputForm(false);
        setEditingRecord(null);
    };

    // ─────────────────────────────────────────────────
    // ★ Form close handler: save pending photo with current data as fallback
    // ─────────────────────────────────────────────────
    const handleFormClose = () => {
        if (pendingPhotoBase64) {
            // User skipped filling data — use current latest as fallback snapshot
            const snapshot = buildSnapshotFromRecord(inbodyHistory?.[0]);
            savePhoto(userId, pendingPhotoBase64, {
                bodyWeight: snapshot.weight || latestComposition.weight,
                bodyFat: snapshot.body_fat_percentage || latestComposition.body_fat_percentage,
                snapshot: Object.keys(snapshot).length > 0 ? snapshot : latestComposition,
            });
            setPendingPhotoBase64(null);
            setBodyPhotos(getPhotos(userId));
            setActivePhotoIndex(0);
        }
        setShowInputForm(false);
        setEditingRecord(null);
    };

    // ─────────────────────────────────────────────────
    // Non-photo form success (e.g. FAB button add data without photo)
    // ─────────────────────────────────────────────────
    const handleNormalFormSuccess = () => {
        fetchInBodyHistory();
        fetchBodyAnalysis();
        setShowInputForm(false);
        setEditingRecord(null);
        // 從營養計劃的「去量測」過來的：營養頁那邊說了「填完會回到計劃」，就要真的帶回去並打開計劃面板
        if (_location?.state?.from === 'nutrition-plan') {
            navigate('/nutrition-mobile', { state: { openPlanner: true } });
        }
    };

    const handleDeleteRecord = async (recordId, e) => {
        if (e) e.stopPropagation();
        // ✅ 使用 state-based confirm，避免 mobile 瀏覽器封鎖 window.confirm
        setDeleteConfirmId(recordId);
    };

    const confirmDeleteRecord = async () => {
        const recordId = deleteConfirmId;
        setDeleteConfirmId(null);
        if (`${recordId}`.startsWith('local_')) {
            try { let localRecords = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]'); localRecords = localRecords.filter(r => r.record_id !== recordId && r.id !== recordId); localStorage.setItem(`inbody_local_${userId}`, JSON.stringify(localRecords)); fetchInBodyHistory(); return; } catch (error) { console.error('Error deleting local record:', error); }
        }
        try {
            await apiClient.delete(`/api/user/inbody-record/${recordId}?user_id=${userId}`);
            fetchInBodyHistory();
        } catch (error) { console.error('Error deleting record:', error); }
    };

    /* 跟上一次量測比的變化。深色卡要傳 onDark，否則黑字看不見。
       §1.4：最小字級 11px —— 原本的 text-xs/9px 不合格。 */
    const renderTrend = (current, previous, onDark = false) => {
        const c = parseFloat(current), pv = parseFloat(previous);
        if (!(c > 0) || !(pv > 0)) return null;
        const diff = c - pv;
        const color = onDark ? 'rgba(255,255,255,0.72)' : 'rgba(22,20,21,0.62)';
        if (Math.abs(diff) < 0.1) return <span style={{ fontSize: 12, fontWeight: 700, color }}>持平</span>;
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                <TrendingUp size={13} strokeWidth={3} style={{ transform: diff > 0 ? 'none' : 'rotate(180deg)' }} />
                {Math.abs(diff).toFixed(1)}
            </span>
        );
    };

    // 🎯 統一載入動畫：原本是黑底 + 一行 `LOADING...`，與 app 其他頁不一致。
    //    改用全站單一真相源 DrvnPageLoader（瑞士 kicker + Coral 掃描線 + 節拍點）。
    if (loading) { return <RunningLoader />; }

    return (
        <div className="body-analysis-page min-h-[100dvh] w-full bg-[#E8E9E6] flex justify-center font-sans">
            <FontStyle />
            {/* ⚠️ 同 EvolutionMatrixPage：寬度不可寫死 393px。 */}
            <div 
                className="w-full max-w-[440px] min-h-[100dvh] relative flex flex-col text-[#161415] pb-24 overflow-hidden shadow-sm bg-[#E8E9E6]"
            >
                {/* ── Swiss Atmosphere Lights (Refined & Subtle) ── */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                    {/* Primary Flare (Lowered) */}
                    <div className="absolute -top-[5%] -left-[30%] w-[80%] h-[50%] bg-[#F95C4B]/10 rounded-full blur-[140px]" />
                    
                    {/* Secondary Accent (Lowered) */}
                    <div className="absolute top-[15%] -right-[40%] w-[70%] h-[40%] bg-[#CFC6B8]/20 rounded-full blur-[120px]" />
                </div>

                <header className="body-analysis-header" data-onboard="body-overview">
                    <button type="button" aria-label="返回分析" onClick={() => onBack ? onBack() : navigate('/analysis-choice-mobile')}><ArrowLeft size={20} /></button>
                    <h1>身體分析</h1>
                    <button type="button" className="body-analysis-add" onClick={() => { setEditingRecord(null); setShowInputForm(true); }}><Plus size={16} />新增量測</button>
                </header>

                <div className="body-analysis-tabs px-5 mb-5 relative z-10">
                    <div className="flex gap-3">
                        {TABS.map(tab => (
                            <motion.button
                                key={tab.id}
                                aria-pressed={activeTab === tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                whileTap={{ scale: 0.95 }}
                                className={`px-6 py-3 rounded-full text-sm font-bold transition-colors whitespace-nowrap border ${activeTab === tab.id ? 'bg-[#D94030] text-[#F6F4F1] border-[#D94030] shadow-lg shadow-orange-500/10' : 'bg-transparent text-[#161415]/40 border-[#161415]/10'}`}
                            >
                                {tab.label}
                            </motion.button>
                        ))}
                    </div>
                </div>

                <div className="px-5 flex-1 overflow-y-auto no-scrollbar body-analysis-scroll relative z-0">
                <AnimatePresence mode="wait">

                    {activeTab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                            className="grid grid-cols-2 gap-3 px-1"
                        >
                            {(() => {
                                /* ══ 總覽版面 ══════════════════════════════════════════════
                                   介面標準 §1：以 390pt 為基準 —— 左右各 20、格線 px-1、
                                   gap 12 → 單欄 165px、整排 342px。字級只取
                                   12 / 19 / 30 / 52 四級（§2 相鄰差 ≥1.5×），整頁 4 級。

                                   改掉的兩件事：
                                   1) 比例 —— 以前是一張 165×376 的窄長珊瑚卡配兩張方卡，
                                      24px 的「身體組成分數」在 165px 寬裡必然折兩行。
                                      現在分數卡改成整排短卡，節奏變成 寬 / 方方 / 寬 / 寬。
                                   2) 提示 —— 以前算不出分數時顯示「--」，下面再掛一張白色
                                      提示卡（§1.4 卡中卡），那張卡只剩約 30px 可用寬，
                                      「要看體型分數，先填身高、性別」被折成六行。
                                      §7 要的是**取代**不是附加：現在沒分數時整張珊瑚卡
                                      直接變成一行動作，不顯示假的「--」。 */
                                const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
                                const weight = num(finalComposition.weight);
                                const fatPct = num(finalComposition.body_fat_percentage);
                                const muscle = num(finalComposition.muscle_mass);
                                const bmr    = num(finalComposition.bmr);
                                const score  = num(finalComposition.inbody_score);
                                const hasBody = !!(weight || fatPct || muscle);

                                /* 缺什麼欄位的定義只有 biometrics 一份（§9）。
                                   gate.label 是「要看體型分數，先填身高、性別」——
                                   卡片標題已經講了「體型分數」，這裡只留後半句的動作
                                   （§4.2 解釋要精確，不要完整）。 */
                                const gate = featureGate('inbodyScore', userId, null);
                                const tailOf = (s) => { const t = String(s || ''); const i = t.lastIndexOf('，'); return i >= 0 ? t.slice(i + 1) : t; };
                                const openForm = () => { haptic('light'); setEditingRecord(null); setShowInputForm(true); };
                                const scoreAction = !hasBody
                                    ? { kicker: '身體數據', label: '先量一次身體數據', run: openForm }
                                    : gate.ok
                                        ? { kicker: '體型分數', label: '先補一次完整量測', run: openForm }
                                        : { kicker: '體型分數', label: tailOf(gate.label), run: () => { haptic('light'); navigate(gate.route, { state: { returnTo: '/body-analysis-mobile' } }); } };

                                const prevScore  = num(prevComposition.inbody_score);
                                const scoreDelta = (score && prevScore)
                                    ? (score === prevScore ? '跟上次一樣' : `較上次 ${score > prevScore ? '+' : '−'}${Math.abs(score - prevScore)}`)
                                    : null;

                                const CARD  = { borderRadius: 24, padding: 20, position: 'relative', overflow: 'hidden' };
                                const LABEL = { fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.3 };
                                const HERO  = { fontSize: 52, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' };
                                const SUB   = { fontSize: 30, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' };
                                const TITLE = { fontSize: 19, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.25 };

                                /* 進場錯開 70ms、最多錯 6 個（§8）。transition 寫在 animate 裡，
                                   才不會蓋掉 pressProps 的按壓彈簧。 */
                                let k = 0;
                                const rise = () => {
                                    const i = Math.min(k++, 5);
                                    return {
                                        initial: { opacity: 0, y: 18 },
                                        animate: { opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.42, ease: [0.16, 1, 0.3, 1] } },
                                    };
                                };

                                /* 有幾個就排幾個；只剩一個就佔滿整排，不留空格子（§7 不假裝有資料）。*/
                                const squares = [
                                    weight && { id: 'w', label: '體重',   value: weight.toFixed(1), unit: '公斤', bg: '#F6F4F1', trend: renderTrend(finalComposition.weight, prevComposition.weight) },
                                    fatPct && { id: 'f', label: '體脂率', value: fatPct.toFixed(1), unit: '%',   bg: '#E4DED2', trend: renderTrend(finalComposition.body_fat_percentage, prevComposition.body_fat_percentage) },
                                ].filter(Boolean);
                                const muscleTrend = renderTrend(finalComposition.muscle_mass, prevComposition.muscle_mass, true);

                                return (<>
                                    {/* 體型分數＋體重＋體脂＝一個正方形：分數直的佔左半、體重右上、體脂右下。
                                        三個數字一眼看完，下面才接肌肉量、代謝。 */}
                                    {score ? (
                                        <div className="col-span-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gridTemplateRows: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, aspectRatio: squares.length ? '1 / 1' : 'auto' }}>
                                            <motion.div {...rise()}
                                                style={{ ...CARD, gridColumn: squares.length ? '1' : '1 / span 2', gridRow: '1 / span 2', background: '#F95C4B', minHeight: squares.length ? 0 : 132, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 18px 40px -16px rgba(249,92,75,0.45)' }}>
                                                <div style={{ ...LABEL, color: 'rgba(255,255,255,0.6)', zIndex: 1 }}>體型分數</div>
                                                <div style={{ minWidth: 0, zIndex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                                        <span className="editorial-number" style={{ ...HERO, color: '#fff' }}>{score}</span>
                                                        <span style={{ ...LABEL, color: 'rgba(255,255,255,0.6)' }}>分</span>
                                                    </div>
                                                    <div style={{ ...TITLE, color: '#fff', marginTop: 10 }}>{scoreBand(score)}</div>
                                                    {scoreDelta && <div style={{ ...LABEL, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>{scoreDelta}</div>}
                                                </div>
                                                <div className="absolute -top-16 -right-16 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                                            </motion.div>
                                            {squares.map((sq) => (
                                                <motion.div key={sq.id} {...rise()}
                                                    style={{ ...CARD, gridColumn: '2', gridRow: squares.length === 1 ? '1 / span 2' : undefined, background: sq.bg, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.55)' }}>
                                                    <div style={{ ...LABEL, color: 'rgba(22,20,21,0.45)', minWidth: 0 }}>{sq.label}</div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
                                                            <span className="editorial-number" style={{ ...SUB, color: '#161415' }}>{sq.value}</span>
                                                            <span style={{ ...LABEL, color: 'rgba(22,20,21,0.45)' }}>{sq.unit}</span>
                                                        </div>
                                                        {sq.trend && <div style={{ marginTop: 6, minWidth: 0 }}>{sq.trend}</div>}
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    ) : (<>
                                        <motion.button {...pressProps('cta')} {...rise()} type="button" onClick={scoreAction.run} className="col-span-2"
                                            style={{ ...CARD, background: '#F95C4B', minHeight: 100, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: 'none', textAlign: 'left', cursor: 'pointer', boxShadow: '0 18px 40px -16px rgba(249,92,75,0.45)' }}>
                                            <span style={{ minWidth: 0, flex: 1, zIndex: 1 }}>
                                                <span style={{ ...LABEL, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 8 }}>{scoreAction.kicker}</span>
                                                <span style={{ ...TITLE, color: '#fff', display: 'block' }}>{scoreAction.label}</span>
                                            </span>
                                            <ChevronRight size={20} color="#fff" strokeWidth={2.4} style={{ flexShrink: 0, zIndex: 1 }} />
                                            <span aria-hidden className="absolute -top-16 -right-16 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                                        </motion.button>
                                        {squares.map((sq) => (
                                            <motion.div key={sq.id} {...rise()} className={squares.length === 1 ? 'col-span-2' : 'col-span-1'}
                                                style={{ ...CARD, background: sq.bg, minHeight: 132, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.55)' }}>
                                                <div style={{ ...LABEL, color: 'rgba(22,20,21,0.4)', minWidth: 0 }}>{sq.label}</div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                                        <span className="editorial-number" style={{ ...SUB, color: '#161415' }}>{sq.value}</span>
                                                        <span style={{ ...LABEL, color: 'rgba(22,20,21,0.4)' }}>{sq.unit}</span>
                                                    </div>
                                                    {sq.trend && <div style={{ marginTop: 9, minWidth: 0 }}>{sq.trend}</div>}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </>)}

                                    {muscle && (
                                        <motion.div {...rise()} className="col-span-2"
                                            style={{ ...CARD, minHeight: 132, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14,
                                                background: 'repeating-linear-gradient(to right,#3B241C 0px,#3B241C 48px,rgba(246,244,241,0.15) 48.5px,rgba(246,244,241,0.15) 49px),#2A1812',
                                                border: '1px solid rgba(255,255,255,0.22)',
                                                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -1px 1px rgba(0,0,0,0.4)' }}>
                                            <div style={{ minWidth: 0, zIndex: 1 }}>
                                                <div style={{ ...LABEL, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>骨骼肌量</div>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                                                    <span className="editorial-number" style={{ ...HERO, color: '#fff' }}>{muscle.toFixed(1)}</span>
                                                    <span style={{ ...LABEL, color: 'rgba(255,255,255,0.5)' }}>公斤</span>
                                                </div>
                                            </div>
                                            {muscleTrend && <div style={{ flexShrink: 0, paddingBottom: 4, zIndex: 1 }}>{muscleTrend}</div>}
                                            <div className="absolute inset-0 opacity-[0.10] pointer-events-none" style={{ backgroundImage: 'url("/desktop/22.jpeg")', backgroundSize: 'cover', mixBlendMode: 'soft-light' }} />
                                        </motion.div>
                                    )}

                                    {bmr && (
                                        <motion.div {...rise()} className="col-span-2"
                                            style={{ ...CARD, minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                                                background: 'linear-gradient(135deg,#F6F4F1 0%,#CFC6B8 100%)',
                                                border: '1px solid rgba(255,255,255,0.6)',
                                                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(22,20,21,0.06)' }}>
                                            <div style={{ minWidth: 0, zIndex: 1 }}>
                                                <div style={{ ...LABEL, color: 'rgba(22,20,21,0.4)', marginBottom: 10 }}>基礎代謝</div>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                                    <span className="editorial-number" style={{ ...SUB, color: '#161415' }}>{Math.round(bmr)}</span>
                                                    <span style={{ ...LABEL, color: 'rgba(22,20,21,0.4)' }}>大卡</span>
                                                </div>
                                            </div>
                                            <div style={{ width: 44, height: 44, borderRadius: 999, background: '#161415', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                                                <Flame size={20} className="text-[#F95C4B]" />
                                            </div>
                                            <div className="absolute inset-0 opacity-[0.12] pointer-events-none" style={{ backgroundImage: 'url("/desktop/11.jpeg")', backgroundSize: 'cover', mixBlendMode: 'luminosity' }} />
                                        </motion.div>
                                    )}

                                    {/* 整頁唯一一句說明（§4.1）。 */}
                                    <motion.button {...pressProps('card')} {...rise()} type="button"
                                        onClick={() => { haptic('light'); setActiveTab('muscle'); }}
                                        aria-label="查看肌肉平衡分析"
                                        className="col-span-2"
                                        style={{ ...CARD, background: '#161415', width: '100%', boxSizing: 'border-box', minHeight: 88, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: 'none', textAlign: 'left', cursor: 'pointer', boxShadow: '0 16px 40px -18px rgba(22,20,21,0.4)' }}>
                                        <span style={{ minWidth: 0, flex: 1 }}>
                                            <span style={{ ...TITLE, color: '#F6F4F1', display: 'block' }}>肌肉平衡分析</span>
                                            <span style={{ ...LABEL, fontWeight: 600, color: 'rgba(255,255,255,0.45)', display: 'block', marginTop: 7 }}>看各部位練得夠不夠</span>
                                        </span>
                                        <span style={{ width: 44, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(249,92,75,0.16)', border: '1px solid rgba(249,92,75,0.3)' }}>
                                            <Activity size={20} className="text-[#F95C4B]" />
                                        </span>
                                    </motion.button>
                                </>);
                            })()}
                        </motion.div>
                    )}

                    {activeTab === 'history' && (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                            className="flex flex-col items-center"
                        >
                            {(() => {
                                const METRIC_THEMES = {
                                    weight_kg:            { label: '體重',   unit: 'kg' },
                                    body_fat_percent:     { label: '體脂率', unit: '%'  },
                                    skeletal_muscle_mass: { label: '肌肉量', unit: 'kg' },
                                    bmi:                  { label: 'BMI',    unit: ''   },
                                    body_water_percent:   { label: '體水率', unit: '%'  },
                                    visceral_fat_level:   { label: '內臟脂', unit: ''   },
                                };
                                const theme = METRIC_THEMES[trendMetric];
                                const series = metricSeries(trendMetric);
                                // 💳 趨勢圖：免費看最近 90 天，會員看全部（資料一筆都不刪，只是圖畫多遠）
                                const { rows: chartPoints } = trimToHistory(series.points, (p) => p.t, isMember());
                                const hasChart = chartPoints.length >= 2;   // 介面標準 §5：趨勢圖至少要兩筆真實量測
                                const latest = series.points[series.points.length - 1] || null;
                                const change = series.change;

                                return (<>
                                    {/* ── 選指標 ──────────────────────────────────────────
                                        ⚠️ 原本選中的膠囊是滿版珊瑚，跟上面的「歷史」分頁、
                                           「＋新增量測」、折線本身、底部導覽的相機鍵全部同一個珊瑚
                                           —— 一個畫面五個珊瑚，等於沒有重點。
                                           整頁的珊瑚留給折線（那才是這頁在講的事），
                                           選指標改成墨黑實心，一樣看得出選了哪個。
                                        字級 12px font-bold uppercase tracking-tighter 對中文
                                        只會把字擠在一起，一併拿掉。 */}
                                    <div className="flex w-full overflow-x-auto no-scrollbar gap-2 mb-4 pb-2 px-1">
                                        {Object.entries(METRIC_THEMES).map(([id, t]) => {
                                            const on = trendMetric === id;
                                            return (
                                                <motion.button {...pressProps('pill')}
                                                    key={id}
                                                    onClick={() => { haptic('light'); setTrendMetric(id); }}
                                                    aria-pressed={on}
                                                    className="h-11 px-4 rounded-full text-[13px] font-bold whitespace-nowrap border flex items-center justify-center transition-colors duration-200"
                                                    style={on
                                                        ? { background: '#161415', color: '#F6F4F1', borderColor: '#161415' }
                                                        : { background: 'rgba(22,20,21,0.05)', color: 'rgba(22,20,21,0.55)', borderColor: 'rgba(22,20,21,0.08)' }}
                                                >
                                                    {t.label}
                                                </motion.button>
                                            );
                                        })}
                                    </div>

                                    <section className="body-history-summary" aria-label="量測趨勢">
                                        {latest ? (<>
                                            <div className="body-history-value">
                                                <span>{theme.label}</span>
                                                <strong>{latest.value.toFixed(1)}<small>{theme.unit}</small></strong>
                                            </div>
                                            <div className="body-history-meta">
                                                <span>{latest.dateLabel}</span>
                                                {/* ⚠️ 原本寫「較上次 0.0 kg」—— 因為同一天量了兩次，
                                                       直接拿前一筆來減就是 0。首頁的身體數據卡早就處理過
                                                       這件事（bodyMeasurementPair：同一天重複匯入不算一次變化），
                                                       這頁卻自己另寫一套，同一份資料兩個畫面講不同的話。
                                                       現在兩邊共用同一個函式，而且把「隔多久」一起講出來。 */}
                                                {change
                                                    ? <span>{change.text}</span>
                                                    : <span>再量一次就能看到變化</span>}
                                                {series.skipped > 0 && (
                                                    <span>{series.total} 筆紀錄中有 {series.points.length} 筆填了{theme.label}</span>
                                                )}
                                            </div>
                                        </>) : (
                                            <div className="body-history-value">
                                                <span>{theme.label}</span>
                                                <strong style={{ fontSize: 20, fontWeight: 700, color: 'rgba(22,20,21,0.55)' }}>還沒有紀錄</strong>
                                            </div>
                                        )}

                                        {/* ── 折線 ────────────────────────────────────────
                                            ⚠️ 原本 XAxis 直接吃 measurement_date 字串。Recharts 預設
                                               是分類軸 —— 每一點等距排開，不管實際隔了幾天。
                                               截圖裡 08-21 → 09-06（16 天）、09-06 → 09-12（6 天）、
                                               09-12 → 09-12（同一天）畫成一樣寬，那條線的斜率是假的。
                                               改成時間軸，日期間距才是真的。
                                            同一天的多筆也先收斂成一筆（取當天最後一次），
                                            不然會出現一段「零天」的水平線。 */}
                                        {hasChart ? (
                                            <div style={{ height: 210, marginTop: 20 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={chartPoints} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
                                                        <CartesianGrid vertical={false} stroke="#e6e1da" />
                                                        <XAxis
                                                            dataKey="t" type="number" scale="time"
                                                            domain={['dataMin', 'dataMax']}
                                                            ticks={chartPoints.map((p) => p.t)}
                                                            tickFormatter={(t) => {
                                                                const d = new Date(t);
                                                                return `${d.getMonth() + 1}/${d.getDate()}`;
                                                            }}
                                                            tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                                                        />
                                                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                                        <Tooltip
                                                            labelFormatter={(t) => {
                                                                const d = new Date(t);
                                                                return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                                                            }}
                                                            formatter={(v) => [`${v} ${theme.unit}`, theme.label]}
                                                        />
                                                        <Line dataKey="value" stroke="#F95C4B" strokeWidth={2} dot={{ r: 3, fill: '#F95C4B' }} isAnimationActive={false} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        ) : (
                                            /* 只有一筆（或零筆）就不要畫一條線／一個孤點出來裝作有趨勢。
                                               介面標準 §5：不到門檻整塊不渲染，只留一行動作。 */
                                            <motion.button {...pressProps('row')}
                                                onClick={() => { haptic('medium'); setShowInputForm(true); }}
                                                className="body-history-cta">
                                                <span>{latest ? `再量一次${theme.label}` : `先量一次${theme.label}`}</span>
                                                <Plus size={18} />
                                            </motion.button>
                                        )}
                                    </section>

                                    <details className="body-analysis-details">
                                        <summary><span>更多身體指標</span><ChevronDown size={16} aria-hidden /></summary>
                                    {/* ══ ADVANCED ANALYTICS PANELS ══ */}
                                    {(() => {
                                        const latest = inbodyHistory[0];
                                        if (!latest) return null;
                                        const w   = parseFloat(latest.weight_kg || latest.weight) || 0;
                                        const smm = parseFloat(latest.skeletal_muscle_mass || latest.muscle_mass) || 0;
                                        const bfPct = parseFloat(latest.body_fat_percent || latest.body_fat_percentage) || 0;
                                        const bfm = w * (bfPct / 100);
                                        // 沒身高就不算 BMI —— 用 175 估出來的不是這個人的數字
                                        const _hCm = parseFloat(latest.height || finalComposition.height);
                                        const hM  = _hCm > 80 && _hCm < 250 ? _hCm / 100 : null;
                                        const lbm = w - bfm;
                                        if (w === 0) return null;

                                        // ✅ CID 正確判定邏輯：比較 smm vs bfm 的相對關係
                                        // D型：肌肉量 >> 脂肪量（smm > bfm * 2.5，肌肉主導）
                                        // C型：脂肪量 >> 肌肉量（bfm > smm * 0.8，脂肪偏多）
                                        // I型：均衡
                                        // ✅ CID 正確判定邏輯：比較 smm vs bfm 的相對關係
                                        // D型：肌肉量 >> 脂肪量（smm > bfm * 2.5，肌肉主導）
                                        // C型：脂肪量 >> 肌肉量（bfm > smm * 0.8，脂肪偏多）
                                        // I型：均衡
                                        const cid = smm > bfm * 2.5 ? 'D' : bfm > smm * 0.8 ? 'C' : 'I';
                                        const cidColor = { C:'#D94030', I:'#5A554E', D:'#D94030' };
                                        const cidDesc  = { C:'虛弱型 — 肌肉量相對不足', I:'均衡型 — 三維趨於一直線', D:'強壯型 — 肌肉量突出' };

                                        // FFMI (normalized)
                                        // 沒身高算不出 FFMI —— 顯示 0 等於說「你的 FFMI 是 0」
                                        const ffmi = hM > 0 ? +(lbm / (hM * hM) + 6.1 * (1.8 - hM)).toFixed(1) : null;
                                        // ⚠️ ffmi 為 null 時 `null < 18` 是 true，會被標成「初學者」
                                        //    而且 gap 算成 (20 - null) = 20.0 —— 憑空長出一個數字。
                                        const ffmiLevel = ffmi == null
                                            ? { label: null, color: 'rgba(22,20,21,0.3)', next: null, gap: null }
                                            : ffmi < 18
                                            ? { label:'初學者', color:'#5A554E', next:'進階 (20)', gap:(20-ffmi).toFixed(1) }
                                            : ffmi < 20
                                            ? { label:'進階',   color:'#B28300', next:'優秀 (22)', gap:(22-ffmi).toFixed(1) }
                                            : ffmi < 22
                                            ? { label:'優秀',   color:'#D94030', next:'菁英 (25)', gap:(25-ffmi).toFixed(1) }
                                            : { label:'自然極限', color:'#5A7A3A', next:null, gap:null };

                                        // ECW/TBW
                                        const ecwRatio = parseFloat(latest.ecw_tbw_ratio || finalComposition.ecw_tbw_ratio) || 0;
                                        const ecwHigh  = ecwRatio >= 0.395;
                                        const ecwOk    = ecwRatio > 0 && ecwRatio < 0.390;

                                        // Lean Bulk (compare latest two records)
                                        const prev = inbodyHistory[1];
                                        let lbScore = null;
                                        if (prev) {
                                            const dW = w - (parseFloat(prev.weight_kg || prev.weight) || 0);
                                            const dS = smm - (parseFloat(prev.skeletal_muscle_mass || prev.muscle_mass) || 0);
                                            if (dW > 0.1) lbScore = Math.round((dS / dW) * 100);
                                        }

                                        /* ⚠️ 原本每張卡都是 shadow-2xl ＋ 0 20px 40px rgba(0,0,0,0.35)
                                           的純黑投影，四張卡疊在一起像四片浮起來的板子。
                                           設計系統的深度靠材質（拉絲金屬的內斜角）做，不靠投影；
                                           真要陰影也必須是暖色調的軟陰影，不是純黑。
                                           這裡只留內斜角與細邊，卡片自己貼在頁面上。 */
                                        const titaniumStyle = {
                                            background: 'linear-gradient(135deg, #EAE5DF 0%, #E2DCD3 50%, #D8D2C7 100%)',
                                            border: '1px solid rgba(255, 255, 255, 0.7)',
                                            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -2px 4px rgba(22,20,21,0.05)',
                                            color: '#161415'
                                        };

                                        return (
                                            <motion.div
                                                className="w-full mb-8 flex flex-col gap-4 px-1"
                                                initial="hidden"
                                                animate="visible"
                                                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.09 } } }}
                                            >
                                                {/* ⚠️ 這裡原本有一行「Advanced Analytics」，顏色是
                                                    rgba(246,244,241,0.20) —— 近白色的字印在近白色的頁面上，
                                                    在畫面上就是「更多身體指標」下面那一片糊掉的影子，
                                                    也是那塊空白看起來特別大的原因（它佔了高度卻讀不到）。
                                                    上面的「更多身體指標」已經說完這一區是什麼，直接刪掉。 */}

                                                {/* ⚠️ 全部重做：原本一張卡上有 7 段文字（標題＋副標＋徽章＋
                                                    抽象折線圖＋三列數字表＋結論＋一句建議），而真正的答案
                                                    （「強壯型」）躺在最下面。介面標準 §6：一張卡最多三層
                                                    —— 主角 / 佐證 / 動作。現在結論放最上面當主角，
                                                    數字收成一行佐證，說明全部收進「?」。 */}

                                                {/* 1 — 體型 */}
                                                <motion.div
                                                    variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }}
                                                    onClick={() => { haptic('light'); setShowInfo({ ...INFO_CONTENT.cid, advice: getCoachAdvice('cid', cid) }); }}
                                                    whileTap={{ scale: 0.98 }}
                                                    className="body-metric-card"
                                                    style={titaniumStyle}
                                                >
                                                    <div className="body-metric-card__grain" aria-hidden />
                                                    <div className="body-metric-card__head">
                                                        <p className="body-metric-card__title">體型</p>
                                                        <span className="body-metric-card__help" aria-hidden>?</span>
                                                    </div>
                                                    {/* 主角＝結論 */}
                                                    <p className="body-metric-card__verdict" style={{ color: cidColor[cid] }}>
                                                        {{ C: '脂肪偏多', I: '肌肉脂肪平均', D: '肌肉偏多' }[cid]}
                                                    </p>
                                                    {/* 現況與目標畫在同一條軌道上（介面標準 §4） */}
                                                    <div className="body-scale" role="img"
                                                         aria-label={`三段量尺，目前在${{ C: '脂肪偏多', I: '平均', D: '肌肉偏多' }[cid]}`}>
                                                        {['C', 'I', 'D'].map((k) => (
                                                            <span key={k} className={`body-scale__seg${k === cid ? ' is-on' : ''}`}
                                                                  style={k === cid ? { background: cidColor[cid] } : undefined}>
                                                                {{ C: '脂肪多', I: '平均', D: '肌肉多' }[k]}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {/* 佐證＝一行 */}
                                                    <p className="body-metric-card__facts">
                                                        肌肉 {smm.toFixed(1)} · 體脂 {bfm.toFixed(1)} · 體重 {w.toFixed(1)} kg
                                                    </p>
                                                </motion.div>

                                                {/* 2 — FFMI */}
                                                <motion.div
                                                    variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }}
                                                    onClick={() => { haptic('light'); setShowInfo({ ...INFO_CONTENT.ffmi, advice: getCoachAdvice('ffmi', ffmi) }); }}
                                                    whileTap={{ scale: 0.98 }}
                                                    className="body-metric-card"
                                                    style={titaniumStyle}
                                                >
                                                    <div className="body-metric-card__grain" aria-hidden />
                                                    <div className="body-metric-card__head">
                                                        <p className="body-metric-card__title">肌肉量等級</p>
                                                        <span className="body-metric-card__help" aria-hidden>?</span>
                                                    </div>
                                                    {ffmi == null ? (
                                                        <MissingDataRow gate={featureGate('ffmi', userId, null)} returnTo="/body-analysis-mobile" />
                                                    ) : (<>
                                                        <p className="body-metric-card__verdict" style={{ color: ffmiLevel.color }}>
                                                            {ffmiLevel.label}
                                                            <span className="body-metric-card__verdict-num">{ffmi}</span>
                                                        </p>
                                                        {/* 實心＝現在，虛線刻度＝下一階（同一條軌道上看得到兩者） */}
                                                        <div className="body-track">
                                                            <div className="body-track__fill"
                                                                 style={{ width: `${Math.min(100, Math.max(2, ((ffmi - 14) / 14) * 100))}%`, background: ffmiLevel.color }} />
                                                            {ffmiLevel.next && (
                                                                <div className="body-track__goal"
                                                                     style={{ left: `${((parseFloat(ffmiLevel.next.match(/\d+/)?.[0] || 20) - 14) / 14) * 100}%` }} />
                                                            )}
                                                        </div>
                                                        <p className="body-metric-card__facts">
                                                            {ffmiLevel.next ? `再 ${ffmiLevel.gap} 點到${ffmiLevel.next.replace(/\s*\(\d+\)/, '')}` : '已達自然極限'}
                                                        </p>
                                                    </>)}
                                                </motion.div>

                                                {/* 3 — 恢復 */}
                                                {ecwRatio > 0 ? (
                                                    <motion.div
                                                        variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }}
                                                        onClick={() => { haptic('light'); setShowInfo({ ...INFO_CONTENT.recovery, advice: getCoachAdvice('recovery', ecwRatio) }); }}
                                                        whileTap={{ scale: 0.98 }}
                                                        className="body-metric-card"
                                                        style={ecwHigh ? {
                                                            background: 'linear-gradient(135deg, #EADAD9 0%, #E2CBC9 50%, #D8BCBA 100%)',
                                                            border: '1px solid rgba(255, 255, 255, 0.7)',
                                                            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -2px 4px rgba(217,64,48,0.10)',
                                                            color: '#161415',
                                                        } : titaniumStyle}
                                                    >
                                                        <div className="body-metric-card__grain" aria-hidden />
                                                        <div className="body-metric-card__head">
                                                            <p className="body-metric-card__title">恢復狀況</p>
                                                            <span className="body-metric-card__help" aria-hidden>?</span>
                                                        </div>
                                                        <p className="body-metric-card__verdict" style={{ color: ecwHigh ? '#D94030' : ecwOk ? '#5A7A3A' : '#B28300' }}>
                                                            {ecwHigh ? '在發炎' : ecwOk ? '恢復得好' : '要注意'}
                                                            <span className="body-metric-card__verdict-num">{ecwRatio.toFixed(3)}</span>
                                                        </p>
                                                        <div className="body-track">
                                                            <div className="body-track__fill"
                                                                 style={{ width: `${Math.min(100, Math.max(2, ((ecwRatio - 0.36) / 0.06) * 100))}%`,
                                                                          background: ecwHigh ? '#D94030' : ecwOk ? '#5A7A3A' : '#B28300' }} />
                                                            <div className="body-track__goal" style={{ left: '50%' }} />
                                                        </div>
                                                        <p className="body-metric-card__facts">{ecwHigh ? '這週把重量降下來' : '正常在 0.390 以下'}</p>
                                                    </motion.div>
                                                ) : (
                                                    /* 沒資料就只給一個動作（介面標準 §5），不要再描述一次「你沒填」 */
                                                    <motion.button {...pressProps('row')} type="button"
                                                        onClick={() => { haptic('medium'); setShowInputForm(true); }}
                                                        className="body-metric-card body-metric-card--action"
                                                        style={titaniumStyle}>
                                                        <div className="body-metric-card__grain" aria-hidden />
                                                        <span className="body-metric-card__verdict" style={{ color: '#161415' }}>填恢復數值</span>
                                                        <ChevronDown size={20} style={{ transform: 'rotate(-90deg)', color: 'rgba(22,20,21,0.35)' }} />
                                                    </motion.button>
                                                )}

                                                {/* 4 — 增肌品質 */}
                                                {lbScore !== null && (
                                                    <motion.div
                                                        variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } }}
                                                        onClick={() => { haptic('light'); setShowInfo(INFO_CONTENT.leanbulk); }}
                                                        whileTap={{ scale: 0.98 }}
                                                        className="body-metric-card"
                                                        style={titaniumStyle}
                                                    >
                                                        <div className="body-metric-card__grain" aria-hidden />
                                                        <div className="body-metric-card__head">
                                                            <p className="body-metric-card__title">增肌品質</p>
                                                            <span className="body-metric-card__help" aria-hidden>?</span>
                                                        </div>
                                                        <p className="body-metric-card__verdict" style={{ color: lbScore >= 60 ? '#5A7A3A' : lbScore >= 40 ? '#B28300' : '#D94030' }}>
                                                            {lbScore >= 60 ? '增得很乾淨' : lbScore >= 40 ? '還可以' : '脂肪增太多'}
                                                            <span className="body-metric-card__verdict-num">{lbScore}%</span>
                                                        </p>
                                                        <div className="body-track">
                                                            <div className="body-track__fill"
                                                                 style={{ width: `${Math.min(100, Math.max(2, lbScore))}%`,
                                                                          background: lbScore >= 60 ? '#5A7A3A' : lbScore >= 40 ? '#B28300' : '#D94030' }} />
                                                            <div className="body-track__goal" style={{ left: '60%' }} />
                                                        </div>
                                                        <p className="body-metric-card__facts">
                                                            體重 {(w - (parseFloat(prev?.weight_kg || prev?.weight) || 0) > 0 ? '+' : '')}{(w - (parseFloat(prev?.weight_kg || prev?.weight) || 0)).toFixed(1)} · 肌肉 {(smm - (parseFloat(prev?.skeletal_muscle_mass || prev?.muscle_mass) || 0) > 0 ? '+' : '')}{(smm - (parseFloat(prev?.skeletal_muscle_mass || prev?.muscle_mass) || 0)).toFixed(1)} kg
                                                        </p>
                                                    </motion.div>
                                                )}
                                            </motion.div>
                                        );
                                    })()}

                                    </details>
                                    {/* History List */}

                                    <div className="w-full text-left">
                                        <div className="flex justify-between items-end mb-8 pl-4 pr-4">
                                            <h4 className="text-[12px] font-black text-[#161415]/70">量測紀錄</h4>
                                            <span className="text-[12px] font-semibold text-[#161415]/50">
                                                {historySearchQuery || showAllRecords || inbodyHistory.length <= RECORDS_PREVIEW
                                                    ? `共 ${inbodyHistory.length} 筆`
                                                    : `最近 ${Math.min(RECORDS_PREVIEW, inbodyHistory.length)} 筆 · 共 ${inbodyHistory.length} 筆`}
                                            </span>
                                        </div>
                                        {/* ── 挑日期 ──────────────────────────────────────
                                            ⚠️ 原本這裡是一顆滿版墨黑膠囊，浮在整片暖白的頁面上
                                               （那一區唯一的深色物件），右邊還放了一個「地圖」圖示
                                               —— 量體重的日期篩選跟地圖沒有任何關係。
                                               提示字「使用日曆選擇日期…」也是在教使用者怎麼操作控制項，
                                               那是介面自己該講清楚的事。
                                            改成安靜的一列：左邊說它是什麼，右邊就是日期本身。 */}
                                        <div className="mb-6 px-4">
                                            <label className="body-history-filter">
                                                <span className="body-history-filter__label">挑一天看</span>
                                                <input
                                                    type="date"
                                                    aria-label="挑一天看量測紀錄"
                                                    value={historySearchQuery}
                                                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                                                    className="body-history-filter__input"
                                                />
                                                {historySearchQuery && (
                                                    <motion.button {...pressProps('icon')} type="button"
                                                        onClick={(e) => { e.preventDefault(); haptic('light'); setHistorySearchQuery(''); }}
                                                        aria-label="看全部"
                                                        className="body-history-filter__clear">
                                                        <X size={15} />
                                                    </motion.button>
                                                )}
                                            </label>
                                        </div>

                                        <motion.div
                                            className="space-y-4 w-full"
                                            initial="hidden"
                                            animate="visible"
                                            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
                                        >
                                            {(() => {
                                                const matched = inbodyHistory.filter(record => {
                                                    if (!historySearchQuery) return true;
                                                    const d = new Date(record.measurement_date || record.date);
                                                    if (isNaN(d.getTime())) return false;
                                                    const yyyy = d.getFullYear();
                                                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                                                    const dd = String(d.getDate()).padStart(2, '0');
                                                    return `${yyyy}-${mm}-${dd}` === historySearchQuery;
                                                });
                                                // 篩了日期就全部顯示（本來就沒幾筆）；沒篩才收成前幾筆
                                                const shown = (historySearchQuery || showAllRecords)
                                                    ? matched : matched.slice(0, RECORDS_PREVIEW);
                                                return shown.map((record, idx) => (
                                                <motion.div
                                                    key={record.record_id || idx}
                                                    variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 26 } } }}
                                                    className="w-full p-6 rounded-[28px] overflow-hidden body-record-card"
                                                >
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-baseline gap-2">
                                                            {/* 日期就寫日期。原本是 9px 的英文 RECORD_LOG ＋ 斜體大寫的
                                                                「09.12」，兩個都不是使用者要讀的東西。 */}
                                                            <span className="text-[17px] font-bold text-[#161415]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                                {(() => { const d = new Date(record.measurement_date || record.date);
                                                                    return Number.isNaN(d.getTime()) ? '日期未記錄' : `${d.getMonth() + 1} 月 ${d.getDate()} 日`; })()}
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <motion.button {...pressProps('icon')} onClick={(e) => { e.stopPropagation(); setEditingRecord(record); setShowInputForm(true); }} className="w-8 h-8 rounded-full bg-[#161415]/5 flex items-center justify-center text-[#161415]/40 hover:text-[#F6F4F1] hover:bg-[#161415]"><Pencil size={12} /></motion.button>
                                                            <motion.button {...pressProps('icon')} onClick={(e) => handleDeleteRecord(record.record_id, e)} className="w-8 h-8 rounded-full bg-[#161415]/5 flex items-center justify-center text-[#161415]/40 hover:bg-[#D94030] hover:text-white"><Trash2 size={12} /></motion.button>
                                                        </div>
                                                    </div>

                                                    {/* Basic Data Row: Weight, Fat%, Muscle */}
                                                    <div className="grid grid-cols-3 gap-1 py-1">
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-black text-[#161415]/40 tracking-widest mb-1">體重</span>
                                                            <div className="flex items-baseline gap-0.5">
                                                                <span className="text-xl font-black text-[#161415] italic tracking-tighter">{record.weight_kg || record.weight || '--'}</span>
                                                                <span className="text-[12px] font-semibold text-[#161415]/40">kg</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col border-l border-black/5 pl-4">
                                                            <span className="text-[12px] font-semibold text-[#161415]/45 mb-1">體脂</span>
                                                            <div className="flex items-baseline gap-0.5">
                                                                <span className="text-xl font-black text-[#161415] italic tracking-tighter">{record.body_fat_percent || record.body_fat_percentage || '--'}</span>
                                                                <span className="text-[11px] font-bold text-[#161415]/30">%</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col border-l border-black/5 pl-4">
                                                            <span className="text-[12px] font-semibold text-[#161415]/45 mb-1">肌肉</span>
                                                            <div className="flex items-baseline gap-0.5">
                                                                <span className="text-xl font-black text-[#161415] italic tracking-tighter">{record.skeletal_muscle_mass || record.muscle_mass || '--'}</span>
                                                                <span className="text-[12px] font-semibold text-[#161415]/40">kg</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                                ));
                                            })()}
                                        </motion.div>

                                        {/* 還有更多 —— 只在真的被收起來的時候出現 */}
                                        {!historySearchQuery && !showAllRecords && inbodyHistory.length > RECORDS_PREVIEW && (
                                            <div className="px-4 mt-4">
                                                <motion.button {...pressProps('row')} type="button"
                                                    onClick={() => { haptic('light'); setShowAllRecords(true); }}
                                                    className="body-record-more">
                                                    看其餘 {inbodyHistory.length - RECORDS_PREVIEW} 筆
                                                    <ChevronDown size={16} />
                                                </motion.button>
                                            </div>
                                        )}
                                        {!historySearchQuery && showAllRecords && inbodyHistory.length > RECORDS_PREVIEW && (
                                            <div className="px-4 mt-4">
                                                <motion.button {...pressProps('row')} type="button"
                                                    onClick={() => { haptic('light'); setShowAllRecords(false); }}
                                                    className="body-record-more">
                                                    收起來
                                                    <ChevronDown size={16} style={{ transform: 'rotate(180deg)' }} />
                                                </motion.button>
                                            </div>
                                        )}
                                    </div>
                                </>);
                            })()}
                        </motion.div>
                    )}

                    {/* 🆕 肌肉平衡分析分頁（取代原「身體」屬性雷達分頁）——
                        個人數據總和：各部位訓練量分佈＋肌力骨架＋1RM 預測＋教練建議串聯健身計劃。 */}
                    {activeTab === 'muscle' && (
                        <motion.div
                            key="muscle"
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <MuscleBalanceAnalysis
                                embedded
                                onNavigatePlan={(weakParts) => {
                                    // 把弱項帶進健身計劃系統（計劃頁可讀 state.focusParts 優先排這些部位）
                                    navigate('/workout-plan-mobile', { state: { focusParts: weakParts, from: 'muscle-balance' } });
                                }}
                            />
                        </motion.div>
                    )}
                    </AnimatePresence>
                    <div className="h-16"></div>
                </div>

                {/* 肌肉平衡分析已改為分頁（activeTab==='muscle'），不再用彈窗 */}

                {/* ★ Input Form Modal — 🎯 改為「置中彈窗」：原本 items-end 底部彈出、
                    上方留一大片黑，改成置中卡片、背景只做半透明模糊（看得到頁面），
                    圓角四邊、限寬限高，視覺壓力小很多。 */}
                {showInputForm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
                        <div className="w-full bg-[#F6F4F1] rounded-[32px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300"
                            style={{ maxWidth: 440, maxHeight: '86dvh' }}>
                            {/* 🎯 防呆：從營養計劃／其他系統跳過來的人，要知道自己為什麼在這、
                                填完會發生什麼。沒有這一條，跳轉過來只會看到一張空表單。 */}
                            {_location?.state?.from === 'nutrition-plan' && (
                                <div className="mx-6 mt-5 mb-1 px-4 py-3 rounded-[14px] flex-shrink-0"
                                    style={{ background: 'rgba(249,92,75,0.08)', border: '1px solid rgba(217,64,48,0.24)' }}>
                                    <p className="text-[12px] font-black tracking-[0.2em] mb-1" style={{ color: '#D94030' }}>
                                        從營養計劃過來
                                    </p>
                                    <p className="text-[11.5px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.62)' }}>
                                        至少填「體重」，有體脂率更準。存檔後回到營養頁，計劃的預測曲線與每日目標會用這筆新數據重算。
                                    </p>
                                </div>
                            )}
                            <div className="px-6 pt-5 pb-1 flex justify-between items-center flex-shrink-0">
                                {pendingPhotoBase64 ? (
                                    <span className="text-[#161415]/40 text-xs font-bold">填寫數據後將與照片綁定</span>
                                ) : <div />}
                                <motion.button {...pressProps('row')} onClick={handleFormClose} className="text-[#161415]/50 hover:text-[#161415] px-2 py-1 font-bold text-[15px]">關閉</motion.button>
                            </div>
                            <div className="flex-1 overflow-y-auto px-4 pb-8">
                                <InBodyInputForm
                                    userId={userId}
                                    userProfile={analysis?.user_info}
                                    onSuccess={pendingPhotoBase64 ? handleInputFormSuccess : handleNormalFormSuccess}
                                    onClose={handleFormClose}
                                    editingRecord={editingRecord}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <MobileNavigation />
                {showPhotoCapture && (<BodyPhotoCapture userId={userId} bodyWeight={latestComposition.weight} bodyFat={latestComposition.body_fat_percentage} onCapture={() => setBodyPhotos(getPhotos(userId))} onClose={() => setShowPhotoCapture(false)} />)}

                {/* ✅ 刪除確認 Modal（取代 window.confirm） */}
                {deleteConfirmId && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-6"
                    >
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
                        <div className="relative w-full max-w-xs bg-[#F6F4F1] rounded-[36px] p-7 shadow-2xl">
                            <h4 className="text-[18px] font-black text-[#161415] mb-2">確認刪除</h4>
                            <div className="w-10 h-1 bg-[#D94030] mb-5" />
                            <p className="text-[#161415]/60 text-[13px] font-medium mb-6 leading-relaxed">確定要刪除這筆 InBody 紀錄？此操作無法復原。</p>
                            <div className="flex gap-3">
                                <motion.button {...pressProps('pill')}
 onClick={() => setDeleteConfirmId(null)}
 className="flex-1 py-3 rounded-[18px] bg-[#161415]/08 text-[#161415] text-[13px] font-black"
 >取消</motion.button>
                                <motion.button {...pressProps('pill')}
 onClick={confirmDeleteRecord}
 className="flex-1 py-3 rounded-[18px] bg-[#D94030] text-white text-[13px] font-black shadow-lg"
 >刪除</motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Explanation Modal */}
                {showInfo && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowInfo(null)} />
                        <div className="relative w-full max-w-xs bg-[#F6F4F1] rounded-[36px] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                            {/* ⚠️ 這個彈窗原本三個地方講英文：標題（Lean Bulk Score）、
                                小標（Expert Tip / Coach's Insight）、按鈕（Got it）。
                                提示字還用粗體斜體 —— 中文沒有真斜體，瀏覽器合成出來是歪的。
                                全部收成同一套中文層級。 */}
                            <div className="mb-5">
                                <h4 className="text-[20px] font-bold text-[#161415] mb-2 leading-tight">{showInfo.title}</h4>
                                <div className="w-12 h-1 rounded-full bg-[#F95C4B]" />
                            </div>
                            <p className="text-[#161415]/70 text-[14px] leading-relaxed mb-5 font-medium">{showInfo.desc}</p>
                            <div className="bg-[#161415]/5 rounded-[18px] p-4 mb-4">
                                <p className="text-[12px] font-bold text-[#161415]/45 mb-1.5">記住這個數字</p>
                                <p className="text-[#161415] text-[14px] font-bold leading-relaxed">{showInfo.tips}</p>
                            </div>
                            {showInfo.advice && (
                                <div className="bg-[#161415] rounded-[18px] p-5 mb-6 border-l-4 border-[#F95C4B]">
                                    <p className="text-[12px] font-bold text-[#F95C4B] mb-2 flex items-center gap-2">
                                        <Activity size={14} /> 教練怎麼說
                                    </p>
                                    <p className="text-[#F6F4F1]/90 text-[14px] font-medium leading-relaxed">{showInfo.advice}</p>
                                </div>
                            )}
                            <motion.button {...pressProps('cta')}
 onClick={() => { haptic('light'); setShowInfo(null); }}
 className="w-full py-4 rounded-full bg-[#161415] text-[#F6F4F1] text-[15px] font-bold transition-colors"
 >
                                知道了
                            </motion.button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BodyAnalysisViewMobile;
