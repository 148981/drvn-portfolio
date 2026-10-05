import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import {
    AreaChart, Area, LineChart, Line,
    Tooltip, ResponsiveContainer
} from 'recharts';
import { Zap, Activity, Heart, ArrowUpRight, TrendingUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRecovery } from '../contexts/RecoveryContext';
import { chartCoachNote } from '../utils/coachAnalysisEngine';

// 💡 Explanation Overlay Component
const PhysioExplanationOverlay = ({ metric, onClose }) => {
    if (!metric) return null;

    const content = {
        'ef': {
            title: '效率係數 (EF)',
            subtitle: 'Efficiency Factor',
            color: '#E4DED2',
            textColor: '#161415',
            definition: '你的「心肺燃油效率」。計算方式是每分鐘速度 (m/min) 除以心率 (bpm)。',
            insight: '數值越高，代表你在同樣心率下跑得越快，或同樣速度下心率更低。',
            guide: [
                { label: '趨勢向上', value: '有氧體能進步', color: 'text-green-600' },
                { label: '趨勢持平', value: '體能維持', color: 'text-gray-600' },
                { label: '趨勢向下', value: '疲勞或退步', color: 'text-red-500' }
            ]
        },
        'decoupling': {
            title: '有氧脫鉤率 (Decoupling)',
            subtitle: 'Aerobic Decoupling',
            color: '#F6F4F1',
            textColor: '#161415',
            definition: '測量長距離運動後的「心率漂移」。比較前半段與後半段的效率差異。',
            insight: '如果在維持同樣配速的情況下，後半段心率顯著上升，脫鉤率就會變高。',
            guide: [
                { label: '< 5%', value: '極佳 (有氧耐力穩固)', color: 'text-green-800' },
                { label: '5-10%', value: '良好 (可接受範圍)', color: 'text-yellow-800' },
                { label: '> 10%', value: '體能衰退 (耐力不足)', color: 'text-red-900' }
            ]
        },
        'hrr': {
            title: '心率恢復 (Recovery)',
            subtitle: 'Heart Rate Recovery',
            color: '#F6F4F1',
            textColor: '#161415',
            definition: '停止運動後 1 分鐘內，心跳下降的幅度 (beats)。若該次活動沒有完整冷卻段資料，會以「末段心率估算」標示，僅供參考。',
            insight: '下降幅度越大，代表心臟的神經調節能力越好，身體恢復速度越快。',
            guide: [
                { label: '> 20 bpm', value: '良好 (心臟強健)', color: 'text-green-700' },
                { label: '12-20 bpm', value: '普通 (正常範圍)', color: 'text-yellow-700' },
                { label: '< 12 bpm', value: '需注意 (可能疲勞)', color: 'text-red-600' }
            ]
        }
    };

    const info = content[metric] || content['ef'];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl relative"
                style={{ backgroundColor: info.color, color: info.textColor }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 pb-4 border-b border-black/5 flex justify-between items-start">
                    <div>
                        <h3 className="text-2xl font-black leading-tight mb-1">{info.title}</h3>
                        <p className="text-xs font-bold uppercase opacity-60 tracking-wider">{info.subtitle}</p>
                    </div>
                    <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="p-2 -mr-2 -mt-2 rounded-full hover:bg-black/10 transition-colors">
                        <X size={20} />
                    </motion.button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    <div>
                        <h4 className="text-[11px] font-black uppercase opacity-40 mb-2 tracking-widest">DEFINITION</h4>
                        <p className="text-base font-medium leading-relaxed opacity-90">
                            {info.definition}
                        </p>
                    </div>

                    <div>
                        <h4 className="text-[11px] font-black uppercase opacity-40 mb-2 tracking-widest">INSIGHT</h4>
                        <p className="text-sm font-medium leading-relaxed opacity-80">
                            {info.insight}
                        </p>
                    </div>

                    <div className="bg-black/5 rounded-[18px] p-4">
                        <h4 className="text-[11px] font-black uppercase opacity-40 mb-3 tracking-widest">HOW TO READ</h4>
                        <div className="space-y-3">
                            {info.guide.map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="font-bold opacity-70">{item.label}</span>
                                    <span className={`font-bold ${item.color}`}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Tip */}
                <div className="px-6 py-4 bg-black/5 text-[11px] font-bold text-center opacity-50">
                    Tap anywhere to close
                </div>
            </motion.div>
        </motion.div>
    );
};

const PhysioInsightsGrid = ({ data }) => {
    const [selectedMetric, setSelectedMetric] = React.useState(null);
    // HRR 30 秒倒數：剛跑完才需要等，歷史 session 直接顯示
    const [hrrCountdown, setHrrCountdown] = React.useState(null); // null = 不倒數

    // 🔥 Use Recovery Context to check if recovery is completed
    const { recoveryCompleted: contextRecoveryCompleted, isRecovering } = useRecovery();

    // 只有「剛跑完」（isRecovering = true）才啟動 30 秒倒數
    React.useEffect(() => {
        if (isRecovering) {
            setHrrCountdown(30);
        }
    }, [isRecovering]);

    React.useEffect(() => {
        if (hrrCountdown === null || hrrCountdown <= 0) return;
        const t = setTimeout(() => setHrrCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [hrrCountdown]);

    // 🩹 v2：移除「看起來很漂亮的預設假數據」— 沒有真實數據就顯示誠實空狀態。
    //    （舊版缺資料時會顯示 EF 1.42 / HRR 24 / 漂移 3.2% 的裝飾數字，誤導使用者）
    const safeData = data || {};
    const ef = safeData.ef || safeData.physio_metrics?.ef || {};
    const decoupling = safeData.decoupling || safeData.physio_metrics?.decoupling || {};
    const hrr = safeData.hrr || safeData.physio_metrics?.hrr || safeData.hr_recovery || {};
    const efValue = Number(ef?.current);
    const hasEF = Number.isFinite(efValue) && efValue > 0;
    const decValue = Number(decoupling?.value);
    const hasDecoupling = Number.isFinite(decValue);
    const efNote = chartCoachNote('ef', { efValue: hasEF ? efValue : null });
    const decNote = chartCoachNote('decoupling', { decouplingValue: hasDecoupling ? decValue : null });

    // HRR 顯示邏輯：
    // - 歷史 session（!isRecovering）→ 直接顯示後端計算值
    // - 剛跑完（isRecovering）→ 等 30 秒倒數結束後才顯示
    const hrrWaiting = isRecovering && hrrCountdown !== null && hrrCountdown > 0;
    const isRecoveryDone = !hrrWaiting && (hrr?.value != null);

    return (
        <>
            <style>{`
                .glass-card-physio {
                    background: rgba(228, 222, 210, 0.7); /* Stone Base */
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1px solid rgba(207, 198, 184, 0.3); /* Pebble Border */
                    box-shadow: 0 4px 20px 0 rgba(22, 20, 21, 0.03);
                }
            `}</style>
            <div className="w-full bg-transparent mt-4" style={{ fontFamily: 'var(--font-body)' }}>
                {/* Swiss editorial section header — dash motif */}
                <div className="flex justify-between items-center mb-6 pb-3 border-b border-black/10">
                    <span className="text-[11px] font-black uppercase tracking-[0.28em] text-black/55">— Physio Metrics</span>
                    <span className="text-[11px] font-black uppercase tracking-[0.28em] text-black/40">Cardiac Engine</span>
                </div>

                {/* Swiss editorial：拿掉所有 glass-card-physio + 圓角卡，全部改 divide-y 大字編輯排版 */}
                <div className="divide-y divide-black/10">
                    {/* --- Efficiency Factor (EF) ---
                          只在 history_chart 有 >= 3 個有效 sample 時才顯示 chart，否則只給數字 */}
                    {(() => {
                        const validHistory = Array.isArray(ef?.history_chart)
                            ? ef.history_chart.filter(d => Number.isFinite(Number(d?.val)) && Number(d?.val) > 0)
                            : [];
                        const showChart = validHistory.length >= 3;
                        return (
                            <div
                                className="py-6 cursor-pointer active:opacity-70 transition-opacity"
                                onClick={() => setSelectedMetric('ef')}
                            >
                                <div className="flex items-baseline justify-between mb-2">
                                    <span className="text-[11px] font-black uppercase tracking-[0.22em] text-black/55">Efficiency Factor</span>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-black/35">m/min/bpm</span>
                                </div>
                                <div className="flex items-baseline gap-2.5">
                                    <span className="text-[40px] font-black tabular-nums leading-none" style={{ letterSpacing: '-0.04em', color: hasEF ? '#161415' : 'rgba(22,20,21,0.25)' }}>{hasEF ? ef.current : '—'}</span>
                                    {/* 🩹 趨勢徽章只在後端真的算出趨勢時顯示（不再寫死 +2.5%） */}
                                    {hasEF && Number.isFinite(Number(ef.trend_percentage)) && Number(ef.trend_percentage) !== 0 && (
                                        <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-sm tabular-nums ${ef.trend_percentage >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                                            {ef.trend_percentage > 0 ? "+" : ""}{ef.trend_percentage}%
                                        </span>
                                    )}
                                    {hasEF && ef.avg_hr > 0 && (
                                        <span className="text-[11px] text-black/35 tabular-nums">依平均心率 {ef.avg_hr} bpm 計算</span>
                                    )}
                                </div>
                                {/* 🎓 教練判讀（依真實數值） */}
                                <p className="text-[11px] text-black/55 leading-relaxed mt-3 max-w-[340px]">{efNote}</p>
                                {/* 趨勢曲線只在有 ≥3 筆真實歷史 EF 時呈現（不再畫裝飾用假線） */}
                                {showChart && (
                                    <div className="h-16 w-full mt-4 opacity-80">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={validHistory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                                <Area type="monotone" dataKey="val" stroke="#D94030" strokeWidth={2} fill="transparent" isAnimationActive={false} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* --- Heart Rate Recovery (HRR) ---
                          只在 isRecoveryDone 且 curve 有 >= 5 sample 時才畫線 */}
                    {(() => {
                        const validCurve = Array.isArray(hrr?.curve)
                            ? hrr.curve.filter(d => Number.isFinite(Number(d?.hr)))
                            : [];
                        const showCurve = isRecoveryDone && validCurve.length >= 5;
                        return (
                            <div
                                className="py-6 cursor-pointer active:opacity-70 transition-opacity"
                                onClick={() => setSelectedMetric('hrr')}
                            >
                                <div className="flex items-baseline justify-between mb-2">
                                    <span className="text-[11px] font-black uppercase tracking-[0.22em] text-black/55">HRR Recovery</span>
                                    <span className={`text-[12px] font-black tracking-widest ${
                                        isRecoveryDone
                                            ? (hrr.value >= 20 ? 'text-emerald-600' : hrr.value >= 12 ? 'text-yellow-600' : 'text-red-500')
                                            : 'text-black/45'
                                    }`}>
                                        {isRecoveryDone
                                            ? (hrr.value >= 20 ? 'Good' : hrr.value >= 12 ? 'Normal' : 'Low')
                                            : hrrWaiting ? `量測中 · ${hrrCountdown}s` : 'Waiting'}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[40px] font-black tabular-nums text-black leading-none" style={{ letterSpacing: '-0.04em' }}>
                                        {isRecoveryDone ? hrr.value : "—"}
                                    </span>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-black/35">bpm</span>
                                    {isRecoveryDone && (
                                        <span className="text-[11px] text-black/35 ml-1">
                                            {hrr?.estimated ? '· 末段心率估算（非冷卻段量測）' : '· 停止後 1 分鐘降幅'}
                                        </span>
                                    )}
                                </div>
                                {/* 🎓 教練判讀（依真實數值；null → 誠實說明如何取得） */}
                                <p className="text-[11px] text-black/55 leading-relaxed mt-3 max-w-[340px]">
                                    {chartCoachNote('hrr', { hrrValue: isRecoveryDone ? Number(hrr.value) : null })}
                                </p>
                                {/* 心率回落曲線：這條線是「停止後 60 秒的實際心率」— 有真實樣本才畫 */}
                                {showCurve ? (
                                    <div className="mt-4">
                                        <div className="h-12 w-full opacity-60">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={validCurve} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                                    <Line type="monotone" dataKey="hr" stroke="#161415" strokeWidth={2} dot={false} isAnimationActive={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <p className="text-[11px] text-black/35 mt-1">▲ 停止後 60 秒實際心率回落曲線（越陡越好）</p>
                                    </div>
                                ) : !isRecoveryDone ? (
                                    <p className="text-[11px] text-black/35 mt-3">恢復期結束後將顯示心率回落曲線</p>
                                ) : null}
                            </div>
                        );
                    })()}

                    {/* --- Aerobic Decoupling --- Swiss editorial：用 1px 漂移條 + 1/2 half EF 並列 */}
                    <div
                        className="py-6 cursor-pointer active:opacity-70 transition-opacity"
                        onClick={() => setSelectedMetric('decoupling')}
                    >
                        <div className="flex items-baseline justify-between mb-2">
                            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-black/55">Aerobic Decoupling</span>
                            {hasDecoupling && (
                                <span className={`text-[11px] font-black tracking-widest uppercase ${decValue < 5 ? 'text-emerald-600' : decValue <= 10 ? 'text-yellow-600' : 'text-[#F95C4B]'}`}>
                                    {decValue < 5 ? 'Low Drift' : decValue <= 10 ? 'Moderate' : 'Efficiency Drop'}
                                </span>
                            )}
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[40px] font-black tabular-nums leading-none" style={{ letterSpacing: '-0.04em', color: hasDecoupling ? '#161415' : 'rgba(22,20,21,0.25)' }}>{hasDecoupling ? decValue : '—'}</span>
                            <span className="text-[14px] font-black tabular-nums text-black/40">%</span>
                            <span className="text-[11px] font-black uppercase tracking-widest text-black/35 ml-1">drift</span>
                        </div>
                        {/* 🎓 教練判讀（依真實數值） */}
                        <p className="text-[11px] text-black/55 leading-relaxed mt-3 max-w-[340px]">{decNote}</p>
                        {/* 漂移量尺：綠段代表「離 10% 危險線的餘裕」— 只在有真實值時呈現 */}
                        {hasDecoupling && (
                            <>
                                <div className="w-full h-px mt-5 mb-4" style={{ background: 'rgba(0,0,0,0.08)' }}>
                                    <div
                                        className="h-full transition-all duration-700"
                                        style={{
                                            width: `${Math.min(Math.max(100 - decValue * 10, 4), 100)}%`,
                                            backgroundColor: decValue < 5 ? '#5A7A3A' : decValue <= 10 ? '#C9A25A' : '#D94030'
                                        }}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-black/40 mb-1">1st Half EF</span>
                                        <span className="text-[15px] font-black tabular-nums text-black">{decoupling.first_half_ef || '—'}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-black/40 mb-1">2nd Half EF</span>
                                        <span className="text-[15px] font-black tabular-nums text-black">{decoupling.second_half_ef || '—'}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {selectedMetric && (
                    <PhysioExplanationOverlay
                        metric={selectedMetric}
                        onClose={() => setSelectedMetric(null)}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

export default PhysioInsightsGrid;
