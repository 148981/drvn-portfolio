import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
import { toast } from '../utils/toast';
import { Calendar, Save, Activity, Droplets, Ruler, Flame, Info, Scale, X, AlertTriangle } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import apiClient from '../api/client';
import { recordFirst } from '../utils/momentEngine';
import { toLocalDateKey } from '../utils/localDate';
import { calcBMR_MifflinStJeor, calcTDEE, bmrFromLBM } from '../utils/NutritionEngine';

// InputRow moved OUTSIDE the main component to prevent re-mounting on every render (and thus focus loss)
const InputRow = ({ label, name, value, onChange, type = "number", unit, icon: Icon, placeholder, warning, error }) => (
    <div>
        <div
            className={`p-4 rounded-[18px] border flex items-center justify-between group transition-colors ${error ? 'border-[#D94030]/50' : warning ? 'border-[#F95C4B]/40' : 'border-[#B8B0A4]/30 focus-within:border-[#8A8278]/60'}`}
            style={{
                background: error
                    ? 'rgba(217,64,48,0.04)'
                    : 'linear-gradient(135deg, rgba(210,204,196,0.55) 0%, rgba(195,189,181,0.45) 50%, rgba(185,179,172,0.55) 100%)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.06)',
            }}
        >
            <div className="flex items-center gap-3 min-w-[90px]" style={{ color: 'rgba(22,20,21,0.55)' }}>
                {Icon && <Icon size={18} className={error ? 'text-[#D94030]' : 'text-[#F95C4B]'} />}
                <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end ml-2">
                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder || (type === 'date' ? '' : "0")}
                    className={`bg-transparent text-right font-black text-[#161415] outline-none w-full min-w-0 placeholder:text-[#161415]/10 ${type === 'date' ? 'text-base' : 'text-3xl'}`}
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                    step={type === 'date' ? undefined : "0.1"}
                />
                {unit && <span className="text-xs font-bold text-[#161415]/40 w-6 text-right uppercase tracking-tighter">{unit}</span>}
            </div>
        </div>
        {error && (
            <div className="flex items-start gap-1 ml-2 mt-2">
                <AlertTriangle size={12} className="text-[#D94030] mt-0.5" />
                <span className="text-[11px] font-bold text-[#D94030]/90 leading-tight">{error}</span>
            </div>
        )}
        {!error && warning && (
            <div className="flex items-start gap-1 ml-2 mt-2">
                <AlertTriangle size={12} className="text-[#F95C4B] mt-0.5" />
                <span className="text-[11px] font-bold text-[#F95C4B]/80 leading-tight">{warning}</span>
            </div>
        )}
    </div>
);

// 🎯 拉桿式輸入 —— 用滑桿減輕填寫壓力：可直接拖，也可點數字微調。
//   兼容 handleChange（送出 { target: { name, value } }）。
const SliderRow = ({ label, name, value, onChange, unit, icon: Icon, min, max, step = 0.1, defaultVal, warning }) => {
    const num = value === '' || value == null ? null : parseFloat(value);
    const sliderVal = num == null ? defaultVal : Math.min(max, Math.max(min, num));
    const emit = (v) => onChange({ target: { name, value: String(v) } });
    const pct = ((sliderVal - min) / (max - min)) * 100;
    return (
        <div>
            <div className="p-4 rounded-[18px] border"
                style={{
                    borderColor: warning ? 'rgba(249,92,75,0.4)' : 'rgba(184,176,164,0.3)',
                    background: 'linear-gradient(135deg, rgba(210,204,196,0.55) 0%, rgba(195,189,181,0.45) 50%, rgba(185,179,172,0.55) 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 8px rgba(0,0,0,0.06)',
                }}>
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-3" style={{ color: 'rgba(22,20,21,0.55)' }}>
                        {Icon && <Icon size={18} className="text-[#F95C4B]" />}
                        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <input
                            type="number" name={name} value={value} onChange={onChange}
                            placeholder={String(defaultVal)} step={step}
                            className="bg-transparent text-right font-black text-[#161415] outline-none text-3xl"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif", width: 84 }}
                        />
                        {unit && <span className="text-xs font-bold text-[#161415]/40 uppercase">{unit}</span>}
                    </div>
                </div>
                {/* 拉桿 */}
                <input
                    type="range" min={min} max={max} step={step}
                    value={sliderVal}
                    onChange={(e) => emit(e.target.value)}
                    aria-label={`${label} 拉桿`}
                    className="drvn-slider w-full"
                    style={{
                        WebkitAppearance: 'none', appearance: 'none', height: 6, borderRadius: 999, outline: 'none',
                        background: `linear-gradient(90deg, #F95C4B 0%, #F95C4B ${pct}%, rgba(22,20,21,0.10) ${pct}%, rgba(22,20,21,0.10) 100%)`,
                    }}
                />
                <div className="flex justify-between mt-1">
                    <span className="text-[11px] font-bold text-[#161415]/30 tabular-nums">{min}</span>
                    <span className="text-[11px] font-bold text-[#161415]/30 tabular-nums">{max}</span>
                </div>
            </div>
            {warning && (
                <div className="flex items-start gap-1 ml-2 mt-2">
                    <AlertTriangle size={12} className="text-[#F95C4B] mt-0.5" />
                    <span className="text-[11px] font-bold text-[#F95C4B]/80 leading-tight">{warning}</span>
                </div>
            )}
            {/* 拉桿把手樣式（只注入一次即可，重複注入無害） */}
            <style>{`
                .drvn-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:22px; height:22px; border-radius:50%; background:#F6F4F1; border:2px solid #F95C4B; box-shadow:0 2px 8px rgba(249,92,75,0.35); cursor:pointer; }
                .drvn-slider::-moz-range-thumb { width:22px; height:22px; border-radius:50%; background:#F6F4F1; border:2px solid #F95C4B; box-shadow:0 2px 8px rgba(249,92,75,0.35); cursor:pointer; }
            `}</style>
        </div>
    );
};

const InBodyInputForm = ({ userId, editingRecord, onClose, onSuccess, userProfile }) => {
    const isEditing = !!editingRecord;

    const [formData, setFormData] = useState({
        measurement_date: editingRecord?.measurement_date || toLocalDateKey(new Date()),
        weight_kg: editingRecord?.weight_kg || '',
        height: editingRecord?.height || '', // Added height
        body_fat_percent: editingRecord?.body_fat_percent || '',
        skeletal_muscle_mass: editingRecord?.skeletal_muscle_mass || '',
        body_water_percent: editingRecord?.body_water_percent || '',
        visceral_fat_level: editingRecord?.visceral_fat_level || '',
        bmr: editingRecord?.bmr || '',
        ecw_tbw_ratio: editingRecord?.ecw_tbw_ratio || '',
        // Segmental Muscle Mass
        right_arm_muscle: editingRecord?.right_arm_muscle || '',
        left_arm_muscle: editingRecord?.left_arm_muscle || '',
        trunk_muscle: editingRecord?.trunk_muscle || '',
        right_leg_muscle: editingRecord?.right_leg_muscle || '',
        left_leg_muscle: editingRecord?.left_leg_muscle || ''
    });
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'body'

    /* 送出前的必填檢查。以前完全沒有 —— 整張表單留白也存得下去，
       之後每一個讀這筆資料的畫面都會拿到 null。
       體重是硬性的（沒有它這筆紀錄沒有意義）；
       體脂與骨骼肌不擋，但要講清楚不填會少看到什麼。 */
    const REQUIRED_FIELDS = [
        { key: 'measurement_date', label: '量測日期' },
        { key: 'weight_kg', label: '體重' },
    ];
    const SUGGESTED_FIELDS = [
        { key: 'body_fat_percent', label: '體脂率' },
        { key: 'skeletal_muscle_mass', label: '骨骼肌' },
    ];
    const isBlank = (v) => v === '' || v === null || v === undefined
        || (typeof v !== 'string' && !(Number(v) > 0))
        || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) && !(Number(v) > 0));
    const missingRequired = REQUIRED_FIELDS.filter((f) => isBlank(formData[f.key]));
    const missingSuggested = SUGGESTED_FIELDS.filter((f) => isBlank(formData[f.key]));

    // 🔁 回饋式填寫：抓最近一筆量測 → 邊填邊看「與上次的差值」，減重/增肌立刻有進步感
    const [lastRecord, setLastRecord] = useState(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await apiClient.get(`/api/user/inbody-history/${userId}?limit=3`);
                const hist = res?.data?.history || [];
                // 編輯模式：跳過正在編輯的那筆，跟「更早一筆」比
                const prev = isEditing
                    ? hist.find((h) => h.id !== editingRecord?.id && h.measurement_date !== editingRecord?.measurement_date)
                    : hist[0];
                if (alive && prev) setLastRecord(prev);
            } catch { /* 沒歷史 → 首次量測，不顯示差值 */ }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const liveDeltas = useMemo(() => {
        if (!lastRecord) return [];
        const out = [];
        // 瑞士極簡：方向用 ▲▼ 細三角，不用 emoji；「變好」以顏色說話
        const cmp = (cur, prev, label, unit, goodWhenDown) => {
            const c = parseFloat(cur), p = parseFloat(prev);
            if (!(c > 0) || !(p > 0) || Math.abs(c - p) < 0.1) return;
            const d = c - p;
            const better = goodWhenDown ? d < 0 : d > 0;
            out.push({
                label,
                arrow: d > 0 ? '▲' : '▼',
                value: `${Math.abs(d).toFixed(1)}${unit}`,
                text: `${label} ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}${unit}`,
                better,
            });
        };
        cmp(formData.weight_kg, lastRecord.weight_kg, '體重', ' kg', true);
        cmp(formData.body_fat_percent, lastRecord.body_fat_percent, '體脂', '%', true);
        cmp(formData.skeletal_muscle_mass, lastRecord.skeletal_muscle_mass, '肌肉', ' kg', false);
        return out;
    }, [formData.weight_kg, formData.body_fat_percent, formData.skeletal_muscle_mass, lastRecord]);

    // Auto-calculate BMR based on Katch-McArdle or Mifflin-St Jeor formulas
    useEffect(() => {
        const weight = parseFloat(formData.weight_kg);
        const bodyFat = parseFloat(formData.body_fat_percent);
        const height = parseFloat(formData.height);

        let calculatedBMR = '';

        if (!isNaN(weight) && weight > 0 && !isNaN(bodyFat) && bodyFat > 0) {
            // Katch-McArdle formula (preferred when body fat is available)
            const lbm = weight * (1 - (bodyFat / 100));
            calculatedBMR = Math.round(370 + (21.6 * lbm)).toString();
        } else if (!isNaN(weight) && weight > 0 && !isNaN(height) && height > 0) {
            // Mifflin-St Jeor formula (fallback)
            /* ⚠️ 不補 25／male：算不出來就讓 BMR 留空。
               原本 String(null) 會寫進字串 "null"，之後 parseFloat 存成 NaN。 */
            const bmr = calcBMR_MifflinStJeor({
                weight, height, age: userProfile?.age, gender: userProfile?.gender,
            });
            calculatedBMR = bmr == null ? '' : String(bmr);
        }

        if (calculatedBMR !== '') {
            setFormData(prev => {
                if (prev.bmr === calculatedBMR) return prev;
                return { ...prev, bmr: calculatedBMR };
            });
        }
    }, [formData.weight_kg, formData.body_fat_percent, formData.height, userProfile]);

    const warnings = useMemo(() => {
        const w = {};
        const p = (v) => v !== '' && v !== null && v !== undefined ? parseFloat(v) : null;

        const weight    = p(formData.weight_kg);
        const height    = p(formData.height);
        const bodyFat   = p(formData.body_fat_percent);
        const muscleMass = p(formData.skeletal_muscle_mass);
        const ecwTbw = p(formData.ecw_tbw_ratio);
        if (ecwTbw !== null && (ecwTbw < 0.300 || ecwTbw > 0.450)) w.ecw_tbw_ratio = 'ECW/TBW 超出合理範圍（正常 0.300–0.450）';
        const rArm = p(formData.right_arm_muscle);
        const lArm = p(formData.left_arm_muscle);
        const trunk = p(formData.trunk_muscle);
        const rLeg = p(formData.right_leg_muscle);
        const lLeg = p(formData.left_leg_muscle);

        // Basic ranges
        if (weight !== null && (weight < 20 || weight > 300)) w.weight_kg = '體重範圍異常（正常 20–300 kg）';
        if (height !== null && (height < 100 || height > 250)) w.height = '身高範圍異常（正常 100–250 cm）';
        if (bodyFat !== null && (bodyFat < 2 || bodyFat > 60)) w.body_fat_percent = '體脂率範圍異常（正常 2–60%）';
        if (muscleMass !== null && weight !== null) {
            if (muscleMass > weight * 0.65) w.skeletal_muscle_mass = `肌肉量占比 ${(muscleMass / weight * 100).toFixed(0)}% 過高（正常上限 65%）`;
            if (muscleMass < weight * 0.15) w.skeletal_muscle_mass = `肌肉量占比 ${(muscleMass / weight * 100).toFixed(0)}% 過低（正常下限 15%）`;
        }

        // Per-segment range hints
        if (rArm !== null && (rArm < 1.0 || rArm > 10.0)) w.right_arm_muscle = `右臂肌肉量異常（合理範圍 1.0–10.0 kg）`;
        if (lArm !== null && (lArm < 1.0 || lArm > 10.0)) w.left_arm_muscle  = `左臂肌肉量異常（合理範圍 1.0–10.0 kg）`;
        if (trunk !== null && (trunk < 10 || trunk > 45))  w.trunk_muscle     = `軀幹肌肉量異常（合理範圍 10–45 kg）`;
        if (rLeg !== null && (rLeg < 4 || rLeg > 25))      w.right_leg_muscle = `右腿肌肉量異常（合理範圍 4–25 kg）`;
        if (lLeg !== null && (lLeg < 4 || lLeg > 25))      w.left_leg_muscle  = `左腿肌肉量異常（合理範圍 4–25 kg）`;

        // Symmetry hints (soft warnings)
        if (rArm !== null && lArm !== null && Math.abs(rArm - lArm) / Math.max(rArm, lArm, 1) > 0.3)
            w._arm_symmetry = '左右臂肌肉差距較大，請確認數值是否正確';
        if (rLeg !== null && lLeg !== null && Math.abs(rLeg - lLeg) / Math.max(rLeg, lLeg, 1) > 0.3)
            w._leg_symmetry = '左右腿肌肉差距較大，請確認數值是否正確';

        return w;
    }, [formData]);

    // ── Blocking error: segment sum cannot exceed total muscle mass ──
    const segmentSumError = useMemo(() => {
        const p = (v) => v !== '' && v !== null && v !== undefined ? parseFloat(v) : null;
        const muscleMass = p(formData.skeletal_muscle_mass);
        const segs = [
            p(formData.right_arm_muscle), p(formData.left_arm_muscle),
            p(formData.trunk_muscle),
            p(formData.right_leg_muscle), p(formData.left_leg_muscle),
        ].filter(v => v !== null);
        if (segs.length === 0 || muscleMass === null) return null;
        const segSum = segs.reduce((a, b) => a + b, 0);
        if (segSum > muscleMass) {
            return `各部位肌肉加總（${segSum.toFixed(1)} kg）超過您填入的總肌肉量（${muscleMass.toFixed(1)} kg），請重新填寫`;
        }
        return null;
    }, [formData]);

    const globalWarnings = useMemo(() => Object.entries(warnings).filter(([k]) => k.startsWith('_')).map(([, v]) => v), [warnings]);


    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (missingRequired.length > 0) {
            try { haptic('heavy'); } catch { /* */ }
            toast.error(`還要填：${missingRequired.map((f) => f.label).join('、')}`);
            return;
        }
        setLoading(true);

        // ══ 1. Always save locally first (instant feedback) ══
        const localRecord = {
            record_id: editingRecord?.record_id || `local_${Date.now()}`,
            measurement_date: formData.measurement_date,
            weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
            height: formData.height ? parseFloat(formData.height) : null,
            body_fat_percent: formData.body_fat_percent ? parseFloat(formData.body_fat_percent) : null,
            skeletal_muscle_mass: formData.skeletal_muscle_mass ? parseFloat(formData.skeletal_muscle_mass) : null,
            body_water_percent: formData.body_water_percent ? parseFloat(formData.body_water_percent) : null,
            visceral_fat_level: formData.visceral_fat_level ? parseInt(formData.visceral_fat_level) : null,
            bmr: formData.bmr ? parseFloat(formData.bmr) : null,
            right_arm_muscle: formData.right_arm_muscle ? parseFloat(formData.right_arm_muscle) : null,
            left_arm_muscle: formData.left_arm_muscle ? parseFloat(formData.left_arm_muscle) : null,
            trunk_muscle: formData.trunk_muscle ? parseFloat(formData.trunk_muscle) : null,
            right_leg_muscle: formData.right_leg_muscle ? parseFloat(formData.right_leg_muscle) : null,
            left_leg_muscle: formData.left_leg_muscle ? parseFloat(formData.left_leg_muscle) : null,
            ecw_tbw_ratio: formData.ecw_tbw_ratio ? parseFloat(formData.ecw_tbw_ratio) : null,
            savedAt: new Date().toISOString(),
        };

        try {
            const existingLocal = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
            const idx = existingLocal.findIndex(r => r.record_id === localRecord.record_id);
            if (idx >= 0) existingLocal[idx] = localRecord;
            else existingLocal.unshift(localRecord);
            localStorage.setItem(`inbody_local_${userId}`, JSON.stringify(existingLocal.slice(0, 50)));
            console.log('✅ Saved locally:', localRecord.record_id);
            // ✨ 第一筆 InBody（新填寫，非編輯）→ 滿版時刻（只慶祝一次）
            if (!editingRecord) { try { recordFirst(userId, 'inbody_first'); } catch { /* */ } }
        } catch (localErr) {
            console.warn('⚠️ Local save failed:', localErr);
        }

        // ══ 2. Try backend (best effort) ══
        try {
            const formDataToSend = new FormData();
            formDataToSend.append('user_id', userId);
            formDataToSend.append('measurement_date', formData.measurement_date);

            const appendIfValid = (key, value, isInteger = false) => {
                if (value && value !== '') {
                    const parsed = isInteger ? parseInt(value) : parseFloat(value);
                    if (!isNaN(parsed)) formDataToSend.append(key, parsed);
                }
            };

            appendIfValid('weight_kg', formData.weight_kg);
            appendIfValid('height', formData.height);
            appendIfValid('body_fat_percent', formData.body_fat_percent);
            appendIfValid('skeletal_muscle_mass', formData.skeletal_muscle_mass);
            appendIfValid('body_water_percent', formData.body_water_percent);
            appendIfValid('visceral_fat_level', formData.visceral_fat_level, true);
            appendIfValid('bmr', formData.bmr);
            appendIfValid('right_arm_muscle', formData.right_arm_muscle);
            appendIfValid('left_arm_muscle', formData.left_arm_muscle);
            appendIfValid('trunk_muscle', formData.trunk_muscle);
            appendIfValid('right_leg_muscle', formData.right_leg_muscle);
            appendIfValid('left_leg_muscle', formData.left_leg_muscle);
            appendIfValid('ecw_tbw_ratio', formData.ecw_tbw_ratio);

            const url = isEditing
                ? `/api/user/inbody-record/${editingRecord.record_id}`
                : `/api/user/inbody-record`;

            const response = isEditing
                ? await apiClient.put(url, formDataToSend, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 5000 })
                : await apiClient.post(url, formDataToSend, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 5000 });

            if (response.status === 200 || response.status === 201) {
                console.log('✅ Backend saved:', response.data);
            } else {
                console.warn('⚠️ Backend returned error, using local data');
            }
        } catch (backendErr) {
            // Network error / offline — that's OK, local save already done
            console.warn('⚠️ Backend unreachable, data saved locally:', backendErr.message);
        }

        // ══ 3. Always succeed (local data is saved) ══
        // 🎉 儲存後的進步回饋：有變好的項目 → Swiss 滿版編輯時刻 ＋ 原生三拍觸覺。
        //    零 emoji：差值本身就是主角（accent 大字），一句話收尾。
        try {
            const wins = liveDeltas.filter((d) => d.better);
            if (wins.length > 0) {
                const [{ hapticCelebrate }, { fireMoment }] = await Promise.all([
                    import('../utils/haptics'), import('../utils/momentEngine'),
                ]);
                hapticCelebrate();
                fireMoment({
                    kicker: 'INBODY · 量測完成',
                    theme: 'rosehip',
                    parts: [
                        [wins.map((w) => w.text).join(' · '), 'accent'],
                        ['\n身體正在回應你的訓練。', 'main'],
                    ],
                    holdMs: 2600,
                });
            }
        } catch { /* 回饋屬 nice-to-have */ }
        onSuccess();
        setLoading(false);
    };


    return (
        <div className="flex flex-col">
            <h2 className="text-2xl font-black text-[#161415] px-6 pt-1 mb-4">
                {isEditing ? 'Edit Record' : 'New Measurement'}
            </h2>

            <div className="px-6 mb-5 flex gap-2">
                <motion.button {...pressProps('cta')}
 type="button"
 onClick={() => setActiveTab('overview')}
 className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 ${activeTab === 'overview'
 ? 'bg-[#161415] border-[#161415] text-[#F6F4F1]'
 : 'bg-transparent border-[#161415]/20 text-[#161415]/50 hover:border-[#161415]/60'
 }`}
 >
                    Overview
                </motion.button>
                <motion.button {...pressProps('cta')}
 type="button"
 onClick={() => setActiveTab('body')}
 className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 ${activeTab === 'body'
 ? 'bg-[#161415] border-[#161415] text-[#F6F4F1]'
 : 'bg-transparent border-[#161415]/20 text-[#161415]/50 hover:border-[#161415]/60'
 }`}
 >
                    Body
                </motion.button>
            </div>

            {/* 🔁 即時進步回饋條 — 邊填邊看與上次的差值（有變好就亮起來） */}
            {liveDeltas.length > 0 && (
                <div className="px-6 mb-4">
                    <div
                        className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 rounded-2xl"
                        style={{ background: 'rgba(249,92,75,0.07)', border: '1px solid rgba(249,92,75,0.18)' }}
                    >
                        <span className="text-[12px] font-black tracking-[0.04em] text-[#161415]/45">vs 上次</span>
                        {liveDeltas.map((d, i) => (
                            <span
                                key={i}
                                className="inline-flex items-baseline gap-1 text-[12px] font-black px-2.5 py-0.5 rounded-full tabular-nums"
                                style={{
                                    background: d.better ? 'rgba(90,122,58,0.12)' : 'rgba(22,20,21,0.06)',
                                    color: d.better ? '#5A7A3A' : 'rgba(22,20,21,0.6)',
                                }}
                            >
                                <span>{d.label}</span>
                                <span style={{ fontSize: 11, transform: 'translateY(-1px)' }}>{d.arrow}</span>
                                <span>{d.value}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex-1 px-6 pb-6 no-scrollbar">

                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* 1. Basic Info */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-[#161415]/40 uppercase tracking-wider pl-1">Basic Info</h3>
                            <InputRow
                                label="Date"
                                name="measurement_date"
                                value={formData.measurement_date}
                                onChange={handleChange}
                                type="date"
                                icon={Calendar}
                            />
                            <SliderRow
                                label="Height" name="height" value={formData.height} onChange={handleChange}
                                unit="cm" icon={Ruler} min={100} max={220} step={1} defaultVal={170}
                                warning={warnings.height}
                            />
                            <SliderRow
                                label="Weight" name="weight_kg" value={formData.weight_kg} onChange={handleChange}
                                unit="kg" icon={Scale} min={30} max={200} step={0.1} defaultVal={65}
                                warning={warnings.weight_kg}
                            />
                        </div>

                        {/* 2. Composition */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-[#161415]/40 uppercase tracking-wider pl-1">Body Composition</h3>
                            <SliderRow
                                label="Body Fat" name="body_fat_percent" value={formData.body_fat_percent} onChange={handleChange}
                                unit="%" icon={Activity} min={3} max={50} step={0.1} defaultVal={18}
                                warning={warnings.body_fat_percent}
                            />
                            <SliderRow
                                label="Muscle Mass" name="skeletal_muscle_mass" value={formData.skeletal_muscle_mass} onChange={handleChange}
                                unit="kg" icon={Dumbbell} min={15} max={60} step={0.1} defaultVal={30}
                                warning={warnings.skeletal_muscle_mass}
                            />
                            <InputRow
                                label="Visceral Fat"
                                name="visceral_fat_level"
                                value={formData.visceral_fat_level}
                                onChange={handleChange}
                                unit="Lvl"
                                icon={Flame}
                            />
                        </div>

                        {/* 3. Detailed Stats */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-[#161415]/40 uppercase tracking-wider pl-1">Details</h3>
                            <InputRow
                                label="BMR"
                                name="bmr"
                                value={formData.bmr}
                                onChange={handleChange}
                                unit="kcal"
                                icon={Flame}
                                placeholder="1600" // Updated placeholder
                            />
                            <InputRow
                                label="Body Water"
                                name="body_water_percent"
                                value={formData.body_water_percent}
                                onChange={handleChange}
                                unit="%"
                                icon={Droplets}
                            />
                            <InputRow
                                label="ECW/TBW"
                                name="ecw_tbw_ratio"
                                value={formData.ecw_tbw_ratio}
                                onChange={handleChange}
                                unit=""
                                icon={Activity}
                                placeholder="0.380"
                                warning={warnings.ecw_tbw_ratio}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'body' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* 4. Segmental Muscle Mass (Advanced) */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-[#161415]/40 uppercase tracking-wider pl-1">Segmental Analysis (Optional)</h3>
                            <InputRow
                                label="Right Arm"
                                name="right_arm_muscle"
                                value={formData.right_arm_muscle}
                                onChange={handleChange}
                                unit="kg"
                                icon={Dumbbell}
                                warning={warnings.right_arm_muscle}
                            />
                            <InputRow
                                label="Left Arm"
                                name="left_arm_muscle"
                                value={formData.left_arm_muscle}
                                onChange={handleChange}
                                unit="kg"
                                icon={Dumbbell}
                                warning={warnings.left_arm_muscle}
                            />
                            <InputRow
                                label="Trunk"
                                name="trunk_muscle"
                                value={formData.trunk_muscle}
                                onChange={handleChange}
                                unit="kg"
                                icon={Dumbbell}
                                warning={warnings.trunk_muscle}
                            />
                            <InputRow
                                label="Right Leg"
                                name="right_leg_muscle"
                                value={formData.right_leg_muscle}
                                onChange={handleChange}
                                unit="kg"
                                icon={Dumbbell}
                                warning={warnings.right_leg_muscle}
                            />
                            <InputRow
                                label="Left Leg"
                                name="left_leg_muscle"
                                value={formData.left_leg_muscle}
                                onChange={handleChange}
                                unit="kg"
                                icon={Dumbbell}
                                warning={warnings.left_leg_muscle}
                            />
                        </div>
                    </div>
                )}

                {/* Blocking error — segment sum > total muscle mass */}
                {segmentSumError && (
                    <div className="mt-6 bg-[#D94030]/10 border border-[#D94030]/40 text-[#D94030] p-4 rounded-[18px] text-xs font-bold flex gap-2 items-start">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>{segmentSumError}</span>
                    </div>
                )}

                {/* Soft warnings */}
                {globalWarnings.length > 0 && (
                    <div className="mt-4 space-y-2">
                        {globalWarnings.map((m, i) => (
                            <div key={i} className="bg-orange-500/10 border border-orange-500/20 text-orange-500 p-3 rounded-xl text-xs font-bold flex gap-2">
                                <AlertTriangle size={14} />
                                {m}
                            </div>
                        ))}
                    </div>
                )}

                {/* Submit Area */}
                <div className="pt-4">
                    {/* 缺什麼直接講在按鈕上面，不要按下去才發現存不了 */}
                    {missingRequired.length > 0 && (
                        <p className="mb-3 text-[13px] font-bold" style={{ color: '#D94030' }}>
                            還要填：{missingRequired.map((f) => f.label).join('、')}
                        </p>
                    )}
                    {missingRequired.length === 0 && missingSuggested.length > 0 && (
                        <p className="mb-3 text-[12px] font-semibold" style={{ color: 'rgba(22,20,21,0.45)' }}>
                            沒填{missingSuggested.map((f) => f.label).join('、')} · 身體組成與肌肉平衡就看不到數字
                        </p>
                    )}
                    <motion.button {...pressProps('pill')}
 type="submit"
 disabled={loading || !!segmentSumError || missingRequired.length > 0}
 className="w-full h-14 bg-[#161415] hover:bg-[#161415]/90 text-[#F6F4F1] font-black text-lg rounded-[18px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:scale-100"
 >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-[#F6F4F1]/30 border-t-[#F6F4F1] rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={20} className="stroke-[3px]" />
                                <span>儲存這次量測</span>
                            </>
                        )}
                    </motion.button>
                </div>
            </form>
        </div>
    );
};

export default InBodyInputForm;