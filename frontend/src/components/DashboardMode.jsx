import React, { useMemo, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Minimize2, Pause, Play, Compass, LayoutGrid } from 'lucide-react';
import RunAmbientGlow from './ui/RunAmbientGlow';
import RouteMap from './RouteMap';
import { getTrackingTarget } from '../utils/brickTrackingTargets';
import { cadenceAdvice, CADENCE_IDEAL } from '../utils/cadenceCoach';

const INK = '#F5F1EA';
const MUTED = '#8A857C';
const FAINT = '#5F5B54';

// 🪙 配速三色（鈦金屬）— 依「目前配速 vs 目標配速」回傳顏色（配速 = 秒/km，數字越小越快）
//   太慢（> 目標 +10%）→ 鈦紅橘(提醒加快)；太快（< 目標 −10%）→ 鈦冰川藍(提醒放慢)；±10% 內 → 鈦質感綠
const PACE_HOT  = '#F95C4B'; // 鈦紅橘 — 太慢，要快一點
const PACE_COLD = '#5FA8E0'; // 鈦冰川藍 — 太快，要慢一點
const PACE_GOOD = '#3FA787'; // 鈦質感綠 — 在目標區間
// 🪙 對應的鈦金屬拉絲漸層（進度條填充用）
const PACE_GRAD_HOT  = 'linear-gradient(135deg, #FF7A6B 0%, #F95C4B 45%, #D94030 50%, #FF7A6B 100%)';
const PACE_GRAD_COLD = 'linear-gradient(135deg, #8FC6F0 0%, #5FA8E0 45%, #3E86C4 50%, #8FC6F0 100%)';
const PACE_GRAD_GOOD = 'linear-gradient(135deg, #66C9A6 0%, #3FA787 45%, #2E8568 50%, #66C9A6 100%)';
const paceColor = (current, target) => {
    if (!current || current <= 0 || !target || target <= 0) return INK;
    const lower = target * 0.9;  // 比目標快 10%（秒數更小）
    const upper = target * 1.1;  // 比目標慢 10%（秒數更大）
    if (current > upper) return PACE_HOT;    // 太慢 → 鈦紅橘
    if (current < lower) return PACE_COLD;   // 太快 → 鈦冰川藍
    return PACE_GOOD;                         // 區間內 → 鈦質感綠
};
// 🪙 回傳對應的鈦金屬漸層；無有效配速 → null（呼叫端自行用中性色）
const paceGradient = (current, target) => {
    if (!current || current <= 0 || !target || target <= 0) return null;
    if (current > target * 1.1) return PACE_GRAD_HOT;
    if (current < target * 0.9) return PACE_GRAD_COLD;
    return PACE_GRAD_GOOD;
};

// 🪙 把 step 轉成簡短狀態標籤（與 CardioTrackerMobile.getStepStatus 對齊）
const stepStatusShort = (step) => {
    const n = String(step?.name || '').toLowerCase();
    if (/暖身|warm.?up|熱身/.test(n)) return 'WARM UP';
    if (/收操|cool.?down|緩和|冷卻/.test(n)) return 'COOL DOWN';
    if (/恢復|recover|rest|walk|休息/.test(n)) return 'RECOVER';
    if (/衝刺|sprint|全力|加速|極限|interval|間歇|rep|衝/.test(n)) return 'SPRINT';
    if (/節奏|tempo|threshold|閾值/.test(n)) return 'TEMPO';
    if (/穩定|steady|long|長跑|巡航|cruise/.test(n)) return 'STEADY';
    if (/輕鬆|easy/.test(n)) return 'EASY';
    return String(step?.name || 'STEP').toUpperCase();
};

// 🇨🇭 瑞士極簡字體堆疊（Helvetica 風）+ 等寬數字避免跳動
const SWISS_FONT = '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif';
// 🔢 主要大數字字體 — Michroma（幾何科技感，字寬偏寬，故 letter-spacing 收緊）
const DATA_FONT = 'Michroma, "Helvetica Neue", Helvetica, sans-serif';

// ==========================================
// 🇨🇭 共用元件：分段配速 (Splits) — DRVN 瑞士極簡版
//   每完成 1 公里記一段；hairline 分隔 + 細長條(越快越長) + 等寬數字。
//   最新一段以珊瑚色點標示、本場最快段標「FASTEST」。
//   （功能參考跑錶分段，視覺為 DRVN 自有語言：留白、大寫 eyebrow、無框）
// ==========================================
const CORAL = '#F95C4B';
const SplitsStrip = ({ splits = [], formatPace }) => {
    // 🇨🇭 分段配速 — 等寬橫條版（參考跑錶分段，DRVN 瑞士極簡語言）
    //   每格 = 1 公里：已完成 → 實色條＋配速標籤（最快 = coral）；
    //   進行中 → 呼吸中的半透明條；未來 → 淡灰佔位條。
    //   從第一步就看得到（不再等跑滿 1 公里才出現）。
    const data = useMemo(() => {
        const valid = (splits || [])
            .map((s) => ({ km: s.km, sec: Number(s.time > 0 ? s.time : s.pace) || 0 }))
            .filter((s) => s.sec > 30 && s.sec < 3600);
        const fastest = valid.length ? Math.min(...valid.map((s) => s.sec)) : 0;
        return { valid, fastest };
    }, [splits]);

    // 顯示視窗：最多 4 格 —— 最近完成的段落 + 進行中 + 未來佔位
    const done = data.valid.slice(-3);                    // 最近最多 3 段完成
    const doneCount = data.valid.length;
    const slots = [];
    done.forEach((s) => slots.push({ kind: 'done', ...s }));
    slots.push({ kind: 'active', km: doneCount + 1 });    // 進行中的這一公里
    while (slots.length < 4) slots.push({ kind: 'future', km: doneCount + slots.length - done.length + 1 });

    return (
        <div style={{ width: '100%', marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.22em', color: MUTED, }}>Splits · 分段配速</span>
                {data.fastest > 0 && (
                    <span style={{ fontFamily: SWISS_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 11, fontWeight: 700, color: FAINT }}>
                        最快 {formatPace(data.fastest)}
                    </span>
                )}
            </div>
            {/* 等寬分段條列 */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                {slots.map((s, i) => {
                    const isFastest = s.kind === 'done' && s.sec === data.fastest && data.valid.length > 1;
                    return (
                        <div key={`${s.kind}_${s.km}_${i}`} style={{ flex: 1, minWidth: 0 }}>
                            {/* 配速標籤（完成才顯示，齊左） */}
                            <div style={{ height: 16, marginBottom: 6 }}>
                                {s.kind === 'done' && (
                                    <span style={{ fontFamily: SWISS_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 800, color: isFastest ? CORAL : INK, whiteSpace: 'nowrap' }}>
                                        {formatPace(s.sec)}
                                    </span>
                                )}
                            </div>
                            {/* 段落條 */}
                            <div style={{
                                height: 6, borderRadius: 3,
                                background: s.kind === 'done'
                                    ? (isFastest ? CORAL : 'rgba(245,241,234,0.85)')
                                    : s.kind === 'active'
                                        ? 'rgba(245,241,234,0.30)'
                                        : 'rgba(255,255,255,0.10)',
                                boxShadow: isFastest ? `0 0 8px ${CORAL}66` : 'none',
                                animation: s.kind === 'active' ? 'drvnSplitPulse 1.8s ease-in-out infinite' : 'none',
                                transition: 'background 0.5s ease',
                            }} />
                            {/* 公里標記 */}
                            <div style={{ marginTop: 6 }}>
                                <span style={{ fontFamily: SWISS_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: s.kind === 'done' ? MUTED : FAINT }}>
                                    {s.km}K
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <style>{`@keyframes drvnSplitPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
        </div>
    );
};


// ==========================================
// 🏎️ 共用元件：超跑風對稱弧形儀表 (Gauge Arc + Liquid Glass Base)
// ==========================================
// 🪙 鈦冰川藍 — 超標(快於目標)時，繞滿一圈後的重疊段提醒色（原鈦銀色改為冰川藍，與配速太快同色系）
const TITANIUM = '#5FA8E0';

const ArcGauge = ({ value, label, unit, percent, color, isRightSide = false, overshootColor = TITANIUM, size = 160 }) => {
    const R = 72;
    const CIRC = 2 * Math.PI * R;
    const SWEEP = 1; // 🔄 100% = 繞滿整圈（原 0.65 只繞約 234°，不直覺）
    const dash = CIRC * SWEEP;
    const k = size / 160; // 🔧 等比縮放係數：字級隨儀表尺寸縮放，手機可塞下左右兩個小錶
    // 🪙 基礎弧最多填到滿格(100%)，超過的部分另用鈦銀色重疊弧表示。
    const basePct = Math.min(100, percent || 0);
    const overPct = Math.max(0, Math.min(100, (percent || 0) - 100)); // 多出的比例(0–100)，>100% 才有值
    const offset = dash - (dash * (basePct / 100));
    const overOffset = dash - (dash * (overPct / 100));

    return (
        <div style={{ position: 'relative', width: size, height: size, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* 🧼 液態玻璃底板已移除 — 儀表只保留刻度環與數字，乾淨不搶視覺 */}

            <svg width={size} height={size} viewBox="0 0 160 160" style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
                <defs>
                    <mask id={`mask-${label.replace(/\s/g, '')}`}>
                        <motion.circle
                            cx="80" cy="80" r={R} fill="none" stroke="white" strokeWidth="24"
                            strokeDasharray={`${dash} ${CIRC}`} strokeLinecap="butt"
                            animate={{ strokeDashoffset: isNaN(offset) ? dash : offset }}
                            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                        />
                    </mask>
                    {/* 🪙 超標重疊段遮罩：只露出 0 → overPct 這一段，疊在已滿格的弧上 */}
                    <mask id={`mask-over-${label.replace(/\s/g, '')}`}>
                        <motion.circle
                            cx="80" cy="80" r={R} fill="none" stroke="white" strokeWidth="24"
                            strokeDasharray={`${dash} ${CIRC}`} strokeLinecap="butt"
                            animate={{ strokeDashoffset: isNaN(overOffset) ? dash : overOffset }}
                            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                        />
                    </mask>
                </defs>
                <g style={{
                    transformOrigin: '80px 80px',
                    /* 繞滿整圈：起點轉到 6 點鐘方向，順時針填滿 */
                    transform: 'rotate(90deg)'
                }}>
                    <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="16" strokeDasharray="2.5 5" strokeLinecap="butt" />
                    <circle cx="80" cy="80" r={R} fill="none" stroke={color} strokeWidth="16" strokeDasharray="2.5 5" strokeLinecap="butt" mask={`url(#mask-${label.replace(/\s/g, '')})`} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                    {/* 🪙 超標重疊段：快於目標時，多出的 % 以鈦銀色疊在滿格弧上方提醒已超標 */}
                    {overPct > 0 && (
                        <circle cx="80" cy="80" r={R} fill="none" stroke={overshootColor} strokeWidth="16" strokeDasharray="2.5 5" strokeLinecap="butt" mask={`url(#mask-over-${label.replace(/\s/g, '')})`} style={{ filter: `drop-shadow(0 0 5px ${overshootColor}AA)` }} />
                    )}
                </g>
            </svg>
            
            <div className="flex flex-col items-center justify-center z-10 text-center" style={{ position: 'absolute', inset: 0 }}>
                <span style={{ fontFamily: SWISS_FONT, fontSize: Math.max(8, 9 * k), fontWeight: 700, color: MUTED, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</span>
                <span style={{ fontFamily: DATA_FONT, fontSize: 30 * k, fontWeight: 400, color: INK, lineHeight: 1, marginTop: 4 * k, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', whiteSpace: 'nowrap', textShadow: `0 0 10px ${color}44` }}>
                    {value}
                </span>
                <span style={{ fontFamily: SWISS_FONT, fontSize: Math.max(8, 9 * k), fontWeight: 600, color: FAINT, marginTop: 2 * k, letterSpacing: '0.1em' }}>{unit}</span>
            </div>
        </div>
    );
};

const Metric = ({ label, value, unit, color = INK }) => (
    <div style={{ flex: 1, textAlign: 'center', minWidth: 0, position: 'relative', padding: '10px 0' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', color: color === INK ? MUTED : color, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, opacity: 0.9 }}>
            [{label}]
        </div>
        <div className="share-tech-mono" style={{ 
            fontSize: 42, 
            fontWeight: 900, 
            color: color, 
            lineHeight: 1, 
            fontVariantNumeric: 'tabular-nums', 
            letterSpacing: '-0.04em',
            textShadow: color !== INK ? `0 0 16px ${color}88, 0 0 32px ${color}44` : '0 0 12px rgba(245,241,234,0.15)'
        }}>
            {value}
        </div>
        {unit && <div style={{ fontSize: 9, color: MUTED, fontWeight: 800, marginTop: 4, letterSpacing: '0.15em' }}>{unit}</div>}
    </div>
);

const SubMetric = ({ label, value, unit, color = '#CFC9BF' }) => (
    <div style={{ flex: 1, textAlign: 'center', minWidth: 0, position: 'relative' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: MUTED, fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
            {label}
        </div>
        <div className="share-tech-mono" style={{ 
            fontSize: 22, 
            fontWeight: 900, 
            color: color, 
            fontVariantNumeric: 'tabular-nums',
            textShadow: color !== '#CFC9BF' ? `0 0 12px ${color}66` : 'none'
        }}>
            {value}{unit && <span style={{ fontSize: 9, color: MUTED, marginLeft: 4, letterSpacing: '0.1em' }}>{unit}</span>}
        </div>
    </div>
);

const DashboardMode = ({
    open,
    onClose,
    cardioData = {},
    activePlan = null,
    currentStep = null,
    goalDistanceKm = null,
    segmentPaces = {},
    isPaused = false,
    onTogglePause,
    zoneInfo = null,
    brick = null,
    route = [],
    currentPosition = null,
    formatDuration = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.round((s || 0) % 60)).padStart(2, '0')}`,
    formatPace = (s) => (!s || s <= 0 || s > 3600 ? "0'00\"" : `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`),
    safeFixed = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : (0).toFixed(d)),
}) => {
    // 🎛️ 模式切換： 'standard' | 'telemetry'
    // 極簡：固定走 standard（4 數據）排版，不再有汽車圓盤儀表 + 地圖環。
    const [viewMode, setViewMode] = useState('standard');

    // 🎯 從 brick 取追蹤目標定義（recovery/easy/tempo/interval/long/strength）
    const trackingTarget = useMemo(() => getTrackingTarget(brick || activePlan), [brick, activePlan]);

    const hasTargetPace = currentStep && currentStep.targetPace > 0;

    // panelMode 由 brick 定義驅動，否則退回既有自動判定
    const panelMode = trackingTarget?.panelMode
        || (hasTargetPace ? 'pace' : (goalDistanceKm > 0 ? 'distance' : 'pace'));

    const isDistancePlan = (panelMode === 'distance' && goalDistanceKm > 0) || (!trackingTarget && !hasTargetPace && goalDistanceKm > 0);
    const isDurationPlan = panelMode === 'duration';
    const isZonePlan = panelMode === 'zone';

    // 🎯 儀表刻度計算依據 — 全部錨定 brick 的目標設定（distance_km / target_pace / duration_min）。
    //    目標里程：優先用 brick 自帶 distance_km，其次 goalDistanceKm prop。
    const goalKm = (brick?.distance_km ?? activePlan?.distance_km ?? goalDistanceKm) || 0;
    const goalDurationSec = ((brick?.duration_min ?? activePlan?.duration_min) || 0) * 60;

    // 里程表刻度：已跑里程 / 目標里程（long 型計劃滿格＝達標）。自由跑時每 1km 為一圈。
    const distPct = useMemo(() => {
        if (!goalKm) return Math.min(100, ((cardioData.distance || 0) % 1) * 100);
        return Math.min(100, Math.max(0, ((cardioData.distance || 0) / goalKm) * 100));
    }, [cardioData.distance, goalKm]);

    // 配速表刻度：以 brick 的「目標配速」為 100% 滿格基準。
    //   達到目標配速(或更快)＝100% 滿格；比目標慢則按比例遞減（目標/實際）。
    //   計算依據＝currentStep.targetPace（由 brick.target_pace_sec 經 step 帶入）。
    const pacePct = useMemo(() => {
        const pace = cardioData.currentPace || 0;
        if (pace <= 0) return 0;
        const target = hasTargetPace ? currentStep.targetPace : 360;
        // 配速是「秒/km」，越小越快。達標＝100% 滿格；
        // 🪙 比目標更快 → 回傳 >100（例如 110%），多出的部分由 ArcGauge 以鈦銀色重疊弧呈現提醒超標；
        //    比目標慢 → target/pace 比例遞減。上限 200% 避免極端值畫超過整圈。
        return Math.min(200, Math.max(0, (target / pace) * 100));
    }, [cardioData.currentPace, currentStep, hasTargetPace]);

    // 時長表刻度：已用時長 / 目標時長（strength/duration 型計劃滿格＝達標）。
    const durationPct = useMemo(() => {
        if (!goalDurationSec) return 0;
        return Math.min(100, Math.max(0, ((cardioData.duration || 0) / goalDurationSec) * 100));
    }, [cardioData.duration, goalDurationSec]);

    // 🌈 外圈氛圍燈 + 主視覺強調色 — 一律走「心率 Zone」配色（不再依配速變色）。
    //    配速快/慢/剛好的回饋全部收進 panel 內，外圈只負責「現在身體在哪個 Zone」，
    //    職責分離，使用者不會把氛圍燈和配速條搞混。
    const zoneGlowColor = useMemo(() => {
        if (zoneInfo) {
            return RunAmbientGlow.resolveGlowColor({ mode: 'zone', zoneId: zoneInfo.id, zoneColor: zoneInfo.color });
        }
        return null;
    }, [zoneInfo]);

    // 主視覺強調色：有 Zone 走 Zone；尚未量到心率時退回 brick 定義色，最後才退中性綠。
    const ringColor = zoneGlowColor || trackingTarget?.color || RunAmbientGlow.PACE_COLORS.onTarget;

    // 🎯 第 4 個數據 = 該 brick 追蹤的「專注數據」。固定三項(時間/配速/里程)＋這一項。
    //   zone→當前 Zone；reps→趟數；distance/duration→目標達成%；pace→目標配速。
    const focusMetric = useMemo(() => {
        if (panelMode === 'zone') {
            return { label: 'Zone', value: zoneInfo?.name || 'WARM UP', unit: trackingTarget?.zoneRange ? `目標 ${trackingTarget.zoneRange[0]}–${trackingTarget.zoneRange[1]}` : '', color: ringColor };
        }
        if (panelMode === 'reps' && activePlan?.steps) {
            const isRepName = (n) => /衝刺|sprint|全力|加速|極限|interval|間歇|rep/i.test(n || '');
            const total = activePlan.steps.filter(s => isRepName(s.name)).length;
            const done = activePlan.steps.slice(0, (currentStep?.index ?? 0)).filter(s => isRepName(s.name)).length + (isRepName(currentStep?.name) ? 1 : 0);
            return { label: 'Reps', value: `${Math.min(done, total)}`, unit: `/ ${total} 趟`, color: trackingTarget?.color || ringColor };
        }
        if (panelMode === 'distance') {
            return { label: 'Goal', value: `${Math.round(distPct)}`, unit: `% of ${safeFixed(goalKm, 1)}km`, color: trackingTarget?.color || ringColor };
        }
        if (panelMode === 'duration') {
            return { label: 'Goal', value: `${Math.round(durationPct)}`, unit: `% of ${activePlan?.duration_min || '—'}min`, color: trackingTarget?.color || ringColor };
        }
        // pace 型（easy/tempo）：第 4 項顯示目標配速，跑者一眼比對
        return { label: 'Target', value: hasTargetPace ? formatPace(currentStep.targetPace) : '—', unit: '/km', color: trackingTarget?.color || '#FF3D00' };
    }, [panelMode, zoneInfo, trackingTarget, ringColor, activePlan, currentStep, distPct, durationPct, goalKm, hasTargetPace, formatPace, safeFixed]);

    // 🧱 瑞士極簡垂直排版：依 brick 的 panelMode 決定主數據(Hero)與其下方副數據順序。
    //   每個數據定義一致：key / 大標籤 / 數值 / 單位。Hero 放最上方放最大，其餘依序排下。
    const verticalLayout = useMemo(() => {
        const m = {
            duration: { key: 'duration', label: '時間', value: formatDuration(cardioData.duration), unit: '' },
            pace:     { key: 'pace',     label: '配速', value: formatPace(cardioData.currentPace), unit: '/km' },
            distance: { key: 'distance', label: '距離', value: safeFixed(cardioData.distance, 2), unit: 'km' },
        };
        // 依 brick 類型決定誰是主角：
        //   pace(easy/tempo)→配速為王；distance(long)→里程為王；duration/strength→時間為王；
        //   interval(reps)→配速為王(衝刺看配速)；zone→配速為王(維持節奏)。
        // 🦶 步頻：跑步當下最能「立刻改掉」的東西（配速要靠體能，步頻改一下就有）。
        //    量不到就顯示 --，不用 pace 反推假造（那不是量測、是猜的）。
        const cad = Math.round(Number(cardioData.cadence) || 0);
        m.cadence = { key: 'cadence', label: '步頻', value: cad > 0 ? String(cad) : '--', unit: 'spm' };

        let order;
        if (panelMode === 'distance')      order = ['distance', 'pace', 'duration', 'cadence'];
        else if (panelMode === 'duration') order = ['duration', 'pace', 'distance', 'cadence'];
        else                                order = ['pace', 'distance', 'duration', 'cadence']; // pace / reps / zone 皆以配速為主
        const heroColor = (panelMode === 'distance' || panelMode === 'duration')
            ? (trackingTarget?.color || ringColor)
            : '#FF3D00'; // 配速主角用招牌橘紅
        return { hero: { ...m[order[0]], color: heroColor }, rest: order.slice(1).map(k => m[k]) };
    }, [panelMode, trackingTarget, ringColor, cardioData.duration, cardioData.currentPace, cardioData.distance, cardioData.cadence, formatDuration, formatPace, safeFixed]);

    // 🦶 步頻教練提示 — 門檻與結算頁 coachAnalysisEngine C5 同一套，
    //    避免「跑步中說 OK、跑完說偏低」的前後矛盾。
    const cadenceTip = useMemo(() => cadenceAdvice(cardioData.cadence), [cardioData.cadence]);

    // 🫧 計劃進度（液態玻璃條用）— 已完成 steps 時間 / 計劃總時間，全 brick 通用。
    const planProgressPct = useMemo(() => {
        if (!activePlan?.steps?.length) return 0;
        const total = activePlan.steps.reduce((s, x) => s + (x.duration || 0), 0);
        if (!total) return 0;
        return Math.min(100, Math.max(0, ((cardioData.duration || 0) / total) * 100));
    }, [activePlan, cardioData.duration]);

    // 距離進度環 SVG 參數 (For standard mode)
    const R = 78;
    const CIRC = 2 * Math.PI * R;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="dashboard"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 60, background: '#09090B', // F1 HUD 極致黑底
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}
                >
                    {/* 四周氛圍燈 — 一律走 Zone 模式（配速回饋交給 panel，避免混淆） */}
                    <RunAmbientGlow mode="zone" zoneId={zoneInfo?.id} zoneColor={zoneInfo?.color} active={!isPaused} intensity={isPaused ? 0.4 : 1} />

                    {/* 頂部列：計劃膠囊(置中) + 切換模式鈕 + 收合鈕 */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: 'max(20px, env(safe-area-inset-top)) 18px 8px', zIndex: 65 }}>
                        {/* 計劃膠囊 — 絕對置中於頂部列，左右按鈕不影響其位置 */}
                        {activePlan && (
                            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 18, background: 'transparent', border: 'none', maxWidth: 'calc(100% - 140px)' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: ringColor, flexShrink: 0 }} />
                                {/* 🪙 以「目前步驟」為主：STEP n/N · 狀態，讓使用者一眼知道現在在哪一段 */}
                                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {currentStep
                                        ? `STEP ${currentStep.index + 1}/${activePlan.steps?.length || '—'} · ${stepStatusShort(currentStep)}`
                                        : activePlan.title}
                                </span>
                            </div>
                        )}

                        {/* 🔄 一鍵切換：極簡 4 數據 ⇄ 汽車儀表板模式 */}
                        <div className="flex flex-col gap-3">
                            <motion.button {...pressProps('icon')}
 onClick={() => setViewMode(prev => prev === 'standard' ? 'telemetry' : 'standard')}
 className="w-11 h-11 rounded-full flex items-center justify-center "
 style={{ 
 background: 'rgba(255, 255, 255, 0.08)', 
 backdropFilter: 'blur(32px) saturate(180%)',
 WebkitBackdropFilter: 'blur(32px) saturate(180%)',
 border: '1px solid rgba(255,255,255,0.15)',
 boxShadow: '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.25)',
 color: '#FFFFFF' 
 }}
 >
                                {viewMode === 'standard' ? <Compass size={18} /> : <LayoutGrid size={18} />}
                            </motion.button>
                            <motion.button {...pressProps('icon')}
 onClick={onClose}
 className="w-11 h-11 rounded-full flex items-center justify-center "
 style={{ 
 background: 'rgba(255, 255, 255, 0.08)', 
 backdropFilter: 'blur(32px) saturate(180%)',
 WebkitBackdropFilter: 'blur(32px) saturate(180%)',
 border: '1px solid rgba(255,255,255,0.15)',
 boxShadow: '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.25)',
 color: '#FFFFFF' 
 }}
 >
                                <Minimize2 size={20} />
                            </motion.button>
                        </div>
                    </div>

                    {/* 中央視圖切換 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 12px', zIndex: 62 }}>
                        
                        {viewMode === 'telemetry' ? (
                            // ==========================================
                            // 🏎️ 超跑 HUD 遙測儀表板模式 (Telemetry Mode)
                            // ==========================================
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }} 
                                animate={{ opacity: 1, scale: 1 }} 
                                className="w-full flex flex-col items-center justify-center"
                            >
                                {/* 🎯 計劃目標橫幅 — ZONE 膠囊改用 Liquid Glass 材質 */}
                                {trackingTarget?.primary?.label && (
                                    <div className="mb-6 flex flex-col items-center">
                                        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', color: '#D4C4B7', textTransform: 'uppercase', marginBottom: 8, textShadow: '0 0 8px rgba(212,196,183,0.4)' }}>DRVN LAB</div>
                                        {/* 🫧 Liquid Glass 膠囊：①折射模糊層 ②頂部高光 ③色彩反射 ④內緣折射邊 */}
                                        <div style={{
                                            position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10,
                                            padding: '11px 24px', borderRadius: 999, overflow: 'hidden', isolation: 'isolate',
                                            background: `linear-gradient(135deg, ${ringColor}14 0%, rgba(255,255,255,0.04) 100%)`,
                                            backdropFilter: 'blur(20px) saturate(180%) brightness(1.06)',
                                            WebkitBackdropFilter: 'blur(20px) saturate(180%) brightness(1.06)',
                                            border: '1px solid rgba(255,255,255,0.22)',
                                            boxShadow: `inset 0 1.5px 1px rgba(255,255,255,0.45), inset 0 -6px 14px rgba(0,0,0,0.28), inset 0 0 20px ${ringColor}22, 0 8px 28px rgba(0,0,0,0.45)`,
                                        }}>
                                            {/* ② 頂部 specular 高光弧 */}
                                            <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: '8%', right: '8%', height: '55%', borderRadius: '0 0 50% 50%', background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 50%, transparent 80%)', pointerEvents: 'none', zIndex: 1 }} />
                                            {/* ③ 底部色彩反射 — 玻璃吸收 zone 色 */}
                                            <span aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: '40%', background: `radial-gradient(ellipse at 50% 100%, ${ringColor}55 0%, transparent 75%)`, filter: 'blur(5px)', pointerEvents: 'none', zIndex: 1 }} />
                                            {/* 內容層 */}
                                            <span style={{ position: 'relative', zIndex: 2, width: 9, height: 9, borderRadius: '50%', background: ringColor, boxShadow: `0 0 10px ${ringColor}` }} />
                                            <span style={{ position: 'relative', zIndex: 2, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', color: ringColor, textTransform: 'uppercase' }}>
                                                ZONE {zoneInfo?.id || 1}
                                            </span>
                                            <span style={{ position: 'relative', zIndex: 2, width: 1, height: 14, background: 'rgba(255,255,255,0.25)' }} />
                                            <span style={{ position: 'relative', zIndex: 2, fontSize: 14, fontWeight: 800, color: INK }}>{zoneInfo?.name || 'WARM UP'}</span>
                                        </div>
                                    </div>
                                )}

                                {/* 頂部：巨大的數位時鐘（DRVN LAB 僅在上方 ZONE 膠囊未顯示時才在此補上，避免重複） */}
                                <div className="text-center mb-5">
                                    {!trackingTarget?.primary?.label && (
                                        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', color: '#D4C4B7', textTransform: 'uppercase', marginBottom: 8, textShadow: '0 0 8px rgba(212,196,183,0.4)' }}>DRVN LAB</div>
                                    )}
                                    <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 mb-1" style={{ fontFamily: SWISS_FONT, fontWeight: 500 }}>Time Elapsed</p>
                                    <div className="text-[48px] leading-none" style={{ color: INK, fontFamily: SWISS_FONT, fontWeight: 300, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 24px rgba(255,255,255,0.15)' }}>
                                        {formatDuration(cardioData.duration)}
                                    </div>
                                </div>

                                {/* 🔽 上中下三等大儀表 — 配速 / 地圖 / 里程 垂直排列，三圓同尺寸不重疊 */}
                                {/* 📐 手機友善三角構圖：地圖大圓置中當主角，配速(左)/里程(右)兩個小錶
                                    對稱掛在地圖下緣兩側 → 視線集中、三圓互不擠壓、寬度自適應。 */}
                                <div className="w-full flex justify-center mb-8 overflow-visible">
                                    <div style={{ position: 'relative', width: 'min(86vw, 360px)', aspectRatio: '1.42 / 1' }}>

                                        {/* ② 中央主角：圓形地圖 — clamp 直徑，HUD 準星 + Zone 標籤 */}
                                        <div
                                            style={{
                                                position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)',
                                                width: 'clamp(150px, 56vw, 220px)', aspectRatio: '1 / 1', borderRadius: '50%',
                                                padding: 4, background: `linear-gradient(135deg, rgba(207, 198, 184, 0.45), transparent 80%)`,
                                                boxShadow: `0 0 30px rgba(207, 198, 184, 0.25), inset 0 0 20px rgba(207, 198, 184, 0.4), 0 0 40px rgba(0,0,0,0.8)`,
                                                zIndex: 0,
                                            }}
                                        >
                                            <div className="w-full h-full rounded-full overflow-hidden bg-[#161415] border-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                                                <div className="w-full h-full pointer-events-none scale-150 transform">
                                                    <RouteMap
                                                        route={route}
                                                        currentPosition={currentPosition}
                                                        mapStyle="dark"
                                                        hideStats={true}
                                                        isFollowing={true}
                                                    />
                                                </div>
                                            </div>
                                            {/* HUD 準心準星裝飾 */}
                                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                                <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#FFF]" />
                                                <div className="absolute w-[1px] h-3 bg-white/50 top-[15px]" />
                                                <div className="absolute w-[1px] h-3 bg-white/50 bottom-[15px]" />
                                                <div className="absolute h-[1px] w-3 bg-white/50 left-[15px]" />
                                                <div className="absolute h-[1px] w-3 bg-white/50 right-[15px]" />
                                            </div>
                                            {/* 小巧的 Zone 名稱標籤 */}
                                            <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm border" style={{ borderColor: `${ringColor}55`, width: 'max-content' }}>
                                                <span style={{ fontSize: 9, fontWeight: 900, color: ringColor, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{zoneInfo?.name || 'WARM UP'}</span>
                                            </div>
                                        </div>

                                        {/* ① 左下：配速儀表 — 目標配速為滿格基準，超標以鈦銀色重疊 */}
                                        <div style={{ position: 'absolute', left: 0, bottom: 0, zIndex: 10 }}>
                                            <ArcGauge size={118} value={formatPace(cardioData.currentPace)} label="Pace" unit={hasTargetPace ? `目標 ${formatPace(currentStep.targetPace)}` : 'MIN/KM'} percent={pacePct} color="#FF3D00" />
                                        </div>

                                        {/* ③ 右下：里程儀表 — 已跑里程 / 目標里程 = 0–100% */}
                                        <div style={{ position: 'absolute', right: 0, bottom: 0, zIndex: 10 }}>
                                            <ArcGauge size={118} value={safeFixed(cardioData.distance, 2)} label="Distance" unit={goalKm ? `/ ${safeFixed(goalKm, 1)} KM` : 'KM'} percent={distPct} color={ringColor} isRightSide={true} />
                                        </div>
                                    </div>
                                </div>

                                {/* 🎯 配速差提示 — 放在圓環下方，加大、格式 +分秒(zone 型不顯示) */}
                                {!isZonePlan && hasTargetPace && cardioData.currentPace > 0 && (() => {
                                    const target = currentStep.targetPace;
                                    const cur = cardioData.currentPace;
                                    const diffAbs = Math.abs(Math.round(cur - target));
                                    const dm = Math.floor(diffAbs / 60);
                                    const ds = diffAbs % 60;
                                    const dStr = dm > 0 ? `${dm}'${String(ds).padStart(2, '0')}"` : `${ds}"`;
                                    // 🪙 嚴格依正負號：+（比目標慢）→ 紅；−（比目標快）→ 藍；剛好 → ± 綠
                                    const sign = diffAbs === 0 ? '±' : (cur > target ? '+' : '−');
                                    const diffColor = sign === '+' ? PACE_HOT : sign === '−' ? PACE_COLD : PACE_GOOD;
                                    return (
                                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -4, marginBottom: 8 }}>
                                            <span style={{ fontFamily: DATA_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 34, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em', color: diffColor, textShadow: `0 0 20px ${diffColor}66` }}>
                                                {sign}{dStr}
                                            </span>
                                        </div>
                                    );
                                })()}

                                {/* 🫧 計劃進度（telemetry）— 依時間分段大格 + 本段建議配速；進度條依「配速 vs 目標」著色 */}
                                {activePlan?.steps?.length > 0 && (() => {
                                    const elapsed = cardioData.duration || 0;
                                    let acc = 0;
                                    // 🎨 進度條當前色：太快橘紅 / 太慢冰川藍 / ±10% 質感綠
                                    const currentBarColor = paceColor(cardioData.currentPace, currentStep?.targetPace);
                                    return (
                                        <div style={{ width: '100%', maxWidth: 420, marginTop: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: MUTED, }}>本段建議配速</span>
                                                    {currentStep?.targetPace > 0 && (
                                                        <span style={{ fontFamily: SWISS_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 16, fontWeight: 700, color: currentBarColor, textShadow: `0 0 10px ${currentBarColor}66` }}>
                                                            {formatPace(currentStep.targetPace)}<span style={{ fontSize: 11, color: MUTED, marginLeft: 3 }}>/km</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontFamily: SWISS_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 11, fontWeight: 700, color: MUTED }}>{Math.round(planProgressPct)}%</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 5, width: '100%' }}>
                                                {activePlan.steps.map((s, i) => {
                                                    const segSec = s.duration || 0;
                                                    const start = acc; acc += segSec;
                                                    const fill = segSec > 0 ? Math.min(1, Math.max(0, (elapsed - start) / segSec)) : 0;
                                                    const isCurrent = elapsed >= start && elapsed < start + segSec;
                                                    const isPast = elapsed >= start + segSec;
                                                    // 🪙 鈦三色：當前段→即時配速；已完成段→該段實際平均配速；與該段 targetPace 比
                                                    const segActualPace = isCurrent ? cardioData.currentPace : (isPast ? segmentPaces[i] : 0);
                                                    const segGrad = paceGradient(segActualPace, s.targetPace || currentStep?.targetPace);
                                                    const segColor = isCurrent ? paceColor(cardioData.currentPace, s.targetPace) : (isPast ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)');
                                                    const fillBg = segGrad || segColor;
                                                    return (
                                                        <div key={i} style={{
                                                            flex: segSec || 1, position: 'relative', height: 12, borderRadius: 6, overflow: 'hidden',
                                                            background: 'rgba(255,255,255,0.06)',
                                                            border: `1px solid ${isCurrent ? `${segColor}88` : 'rgba(255,255,255,0.14)'}`,
                                                        }}>
                                                            <motion.div
                                                                animate={{ width: `${fill * 100}%` }}
                                                                transition={{ type: 'spring', damping: 26, stiffness: 90 }}
                                                                style={{
                                                                    position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 6,
                                                                    background: fillBg,
                                                                    backgroundSize: segGrad ? '200% 100%' : undefined,
                                                                    boxShadow: (isCurrent || (isPast && segGrad)) ? `0 0 12px ${segColor}55` : 'none',
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* 🇨🇭 分段配速 — 只在「自由跑」顯示；執行計劃時隱藏，避免畫面太亂 */}
                                {!activePlan && (
                                    <div style={{ width: '100%', maxWidth: 420 }}>
                                        <SplitsStrip splits={cardioData.splits} formatPace={formatPace} />
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            // ==========================================
                            // 📊 標準等重排版 (Standard Mode) - 原有邏輯
                            // ==========================================
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full" style={{ maxWidth: 460 }}>
                                {/* ════════════════════════════════════════════
                                    🇨🇭 瑞士極簡 · 由上到下垂直排版 (手機直式)
                                    結構：① 計劃/Zone 標頭(左對齊) → ② 主數據 Hero
                                          → ③ 細分隔線 → ④ 副數據(標籤左·數值右) → ⑤ 分段進度條
                                    ════════════════════════════════════════════ */}

                                {/* ① 標頭 — 左對齊 eyebrow + ZONE，瑞士風不置中、不用膠囊 */}
                                <div style={{ marginBottom: 28 }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.32em', color: '#D4C4B7', textTransform: 'uppercase', marginBottom: 10 }}>DRVN LAB</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: ringColor, textTransform: 'uppercase' }}>ZONE {zoneInfo?.id || 1}</span>
                                        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.01em', color: INK }}>{zoneInfo?.name || 'WARM UP'}</span>
                                    </div>
                                </div>

                                {/* ② 主數據 Hero — 依 brick 決定(配速/里程/時間)，超大左對齊
                                    🎨 著色規則：brick 追蹤 zone → 數字全白(顏色交給上方 ZONE)；
                                       否則只有「配速」數字依 太快橘紅/太慢冰川藍/±10%質感綠，其餘白色。 */}
                                {(() => {
                                  const heroNumColor = isZonePlan
                                      ? INK
                                      : (verticalLayout.hero.key === 'pace'
                                          ? paceColor(cardioData.currentPace, hasTargetPace ? currentStep.targetPace : 0)
                                          : INK);
                                  return (
                                    <div style={{ marginBottom: 4 }}>
                                        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.1em', color: heroNumColor === INK ? 'rgba(245,241,234,0.78)' : heroNumColor, marginBottom: 6 }}>
                                            {verticalLayout.hero.label}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                                            <span style={{ fontFamily: DATA_FONT, fontSize: 68, fontWeight: 400, lineHeight: 0.96, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', color: heroNumColor, textShadow: heroNumColor === INK ? '0 0 14px rgba(245,241,234,0.15)' : `0 0 22px ${heroNumColor}66` }}>
                                                {verticalLayout.hero.value}
                                            </span>
                                            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', color: MUTED, paddingBottom: 12 }}>{verticalLayout.hero.unit}</span>
                                            {/* 🎯 配速差提示 — 放在大數字右邊、加大、格式 +分秒(zone 型不顯示) */}
                                            {!isZonePlan && hasTargetPace && cardioData.currentPace > 0 && (() => {
                                                const target = currentStep.targetPace;
                                                const cur = cardioData.currentPace;
                                                const diffAbs = Math.abs(Math.round(cur - target)); // 秒
                                                const dm = Math.floor(diffAbs / 60);
                                                const ds = diffAbs % 60;
                                                const dStr = dm > 0 ? `${dm}'${String(ds).padStart(2, '0')}"` : `${ds}"`;
                                                // 🪙 嚴格依正負號：+（比目標慢）→ 紅；−（比目標快）→ 藍；剛好 → ± 綠
                                                const sign = diffAbs === 0 ? '±' : (cur > target ? '+' : '−'); // +需加快(慢)／−可放慢(快)
                                                const diffColor = sign === '+' ? PACE_HOT : sign === '−' ? PACE_COLD : PACE_GOOD;
                                                return (
                                                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', fontFamily: DATA_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 32, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em', color: diffColor, textShadow: `0 0 18px ${diffColor}66`, paddingBottom: 6 }}>
                                                        {sign}{dStr}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                  );
                                })()}

                                {/* ③ 細分隔線 — 瑞士風 hairline */}
                                <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '20px 0' }} />

                                {/* ④ 副數據 — 每列：左標籤 · 右數值，等距堆疊。配速數字同樣套三色，其餘白色。 */}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {verticalLayout.rest.map((m, i) => {
                                        const numColor = (!isZonePlan && m.key === 'pace')
                                            ? paceColor(cardioData.currentPace, hasTargetPace ? currentStep.targetPace : 0)
                                            : m.key === 'cadence'
                                                ? (cadenceTip?.color || FAINT)   // 量不到 → 淡色，不亮起假訊號
                                                : INK;
                                        return (
                                        <div key={m.key} style={{
                                            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                                            padding: '14px 0',
                                            borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.07)',
                                        }}>
                                            <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', color: 'rgba(245,241,234,0.72)' }}>{m.label}</span>
                                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                                <span style={{ fontFamily: SWISS_FONT, fontSize: 34, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: numColor, textShadow: numColor === INK ? 'none' : `0 0 14px ${numColor}55` }}>{m.value}</span>
                                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: FAINT }}>{m.unit}</span>
                                            </span>
                                        </div>
                                        );
                                    })}
                                </div>

                                {/* ④.2 🦶 步頻教練提示 — 跑步中最能「當下就改掉」的東西。
                                    配速要靠體能，步頻改一下馬上有；所以提示一律是
                                    「維持配速、只調步伐大小」，不是叫使用者跑更快。 */}
                                {cadenceTip ? (
                                    <div style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                        marginTop: 14, padding: '12px 14px', borderRadius: 14,
                                        background: `${cadenceTip.color}1A`,
                                        border: `1px solid ${cadenceTip.color}44`,
                                    }}>
                                        <span style={{
                                            width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                                            background: cadenceTip.color, boxShadow: `0 0 10px ${cadenceTip.color}`,
                                        }} />
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', color: cadenceTip.color, marginBottom: 3 }}>
                                                {cadenceTip.label}
                                                <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginLeft: 8, letterSpacing: '0.06em' }}>
                                                    理想 {CADENCE_IDEAL[0]}–{CADENCE_IDEAL[1]} spm
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 11.5, lineHeight: 1.55, fontWeight: 600, color: 'rgba(245,241,234,0.70)' }}>
                                                {cadenceTip.hint}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ marginTop: 12, fontSize: 11, fontWeight: 600, lineHeight: 1.5, color: FAINT }}>
                                        步頻未偵測到 — 配戴 Apple Watch，或在「設定 → 隱私 → 動作與健身」允許本 App 後即可即時顯示。
                                    </div>
                                )}

                                {/* ④.5 🇨🇭 分段配速 — 只在「自由跑」顯示；執行計劃時隱藏 */}
                                {!activePlan && <SplitsStrip splits={cardioData.splits} formatPace={formatPace} />}

                                {/* ⑤ 分段進度條 — 氟化(扁平)瑞士風；進度條依配速著色(zone型則用 zone 主色) */}
                                {activePlan?.steps?.length > 0 && (() => {
                                    const elapsed = cardioData.duration || 0;
                                    let acc = 0;
                                    // 🎨 zone 型計劃 → 用 zone 主色；其餘 → 太快橘紅/太慢冰川藍/±10%質感綠
                                    const currentBarColor = isZonePlan ? ringColor : paceColor(cardioData.currentPace, currentStep?.targetPace);
                                    return (
                                        <div style={{ width: '100%', marginTop: 28 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', color: MUTED, }}>本段建議配速</span>
                                                    {currentStep?.targetPace > 0 && (
                                                        <span style={{ fontFamily: SWISS_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 700, color: currentBarColor }}>
                                                            {formatPace(currentStep.targetPace)}<span style={{ fontSize: 11, color: MUTED, marginLeft: 3 }}>/km</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontFamily: SWISS_FONT, fontVariantNumeric: 'tabular-nums', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: MUTED }}>{Math.round(planProgressPct)}%</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                                                {activePlan.steps.map((s, i) => {
                                                    const segSec = s.duration || 0;
                                                    const start = acc; acc += segSec;
                                                    const fill = segSec > 0 ? Math.min(1, Math.max(0, (elapsed - start) / segSec)) : 0;
                                                    const isCurrent = elapsed >= start && elapsed < start + segSec;
                                                    const isPast = elapsed >= start + segSec;
                                                    // 🪙 鈦三色：當前段→即時配速；已完成段→該段實際平均配速（zone 型仍用 zone 主色）
                                                    const segActualPace = isCurrent ? cardioData.currentPace : (isPast ? segmentPaces[i] : 0);
                                                    const segGrad = isZonePlan ? null : paceGradient(segActualPace, s.targetPace || currentStep?.targetPace);
                                                    const segColor = isZonePlan ? ringColor : (isCurrent ? paceColor(cardioData.currentPace, s.targetPace) : (isPast ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)'));
                                                    return (
                                                        <div key={i} style={{
                                                            flex: segSec || 1, position: 'relative', height: 4, borderRadius: 2, overflow: 'hidden',
                                                            background: isCurrent ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.09)',
                                                        }}>
                                                            <motion.div
                                                                animate={{ width: `${fill * 100}%` }}
                                                                transition={{ type: 'tween', ease: 'linear', duration: 0.4 }}
                                                                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, background: segGrad || segColor, backgroundSize: segGrad ? '200% 100%' : undefined }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </motion.div>
                        )}

                        {/* 心率 / 熱量 已移除 — 極簡儀表板只留 4 數據 + 計劃進度，不堆生理副數據。 */}

                    </div>

                    {/* 底部：暫停 */}
                    <div style={{ padding: '0 22px max(22px, env(safe-area-inset-bottom))', zIndex: 65 }}>
                        <motion.button {...pressProps('row')}
 onClick={onTogglePause}
 style={{ width: '100%', height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)', color: INK, fontSize: 15, fontWeight: 800, letterSpacing: '0.1em' }}
 >
                            {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
                            {isPaused ? 'RESUME' : 'PAUSE'}
                        </motion.button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default DashboardMode;
