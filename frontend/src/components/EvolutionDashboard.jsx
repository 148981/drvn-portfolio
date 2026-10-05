import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
// 🔴 修復：原本用裸 axios，不會帶 JWT（apiAuthHeader 只補 fetch）→ 後端一律 401，整頁載入失敗。改走 apiClient。
import apiClient from '../api/client';
import { toast } from '../utils/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Zap, Target, AlertTriangle, Calendar } from 'lucide-react';
import EvolutionBodyMap from './EvolutionBodyMap';
import { VolumeLoader, StrengthGauge, StructuralAlignment } from './FitnessVisuals';
import { MetabolicDualRings } from './MetabolicDualRings';
import PhysiqueDetailsModal from './PhysiqueDetailsModal';
import { getUserId } from '../utils/auth';
import { T } from '../utils/theme';
// import MetabolicArc from './MetabolicArc'; // Replaced by DualRings

const EvolutionDashboard = ({ userId }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false); // 真實載入失敗狀態（不再用假資料）
    const [activeModal, setActiveModal] = useState(null); // 'physique', 'metabolic', 'coach'

    // Goal Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [selectedWeek, setSelectedWeek] = useState(0); // 0-3 for Week 1-4
    const [cycleCurrentWeek, setCycleCurrentWeek] = useState(0); // Backend-determined current week index

    // 4-Week Plan State
    const [targetPlan, setTargetPlan] = useState([
        { muscles: {}, cardio: {} },
        { muscles: {}, cardio: {} },
        { muscles: {}, cardio: {} },
        { muscles: {}, cardio: {} }
    ]);

    useEffect(() => {
        fetchEvolutionData();
    }, [userId]);

    // Initialize targetPlan when data loads
    useEffect(() => {
        if (data) {
            // Load existing plan or initialize defaults
            const plan = data.target_plan || [];
            const filledPlan = [0, 1, 2, 3].map(i => {
                const existing = plan[i] || {};
                return {
                    muscles: {
                        chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0,
                        ...(existing.muscles || {})
                    },
                    cardio: {
                        distance_km: 0, calories_kcal: 0,
                        ...(existing.cardio || {})
                    }
                };
            });
            setTargetPlan(filledPlan);

            // Set current week from backend (1-based -> 0-based)
            const currentIdx = (data.current_week || 1) - 1;
            setCycleCurrentWeek(currentIdx);
            setSelectedWeek(currentIdx); // Default open to current week
        }
    }, [data]);

    const fetchEvolutionData = async () => {
        try {
            setLoadError(false);
            const response = await apiClient.get('/api/evolution/status', { params: { user_id: userId || getUserId() } });
            if (response.data.dashboard_data) {
                setData(response.data.dashboard_data);
            } else {
                setData(response.data);
            }
        } catch (error) {
            // 不再注入假資料 — 誠實顯示載入失敗，讓使用者知道這是真實狀態
            console.error("Evolution Dashboard 載入失敗：", error);
            setData(null);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    };

    const [selectedMuscleData, setSelectedMuscleData] = useState(null);
    const [demoMode, setDemoMode] = useState('default'); // 'default', 'hypertrophy', 'strength', 'repair'

    const [carouselIndex, setCarouselIndex] = useState(0);

    // Reset carousel when activeHighlights change (e.g. mode switch)
    useEffect(() => {
        setCarouselIndex(0);
    }, [demoMode, data]);

    const handleCarouselNext = (e) => {
        e.stopPropagation();
        if (!activeHighlights || activeHighlights.length === 0) return;
        setCarouselIndex((prev) => (prev + 1) % activeHighlights.length);
    };

    const handleCarouselPrev = (e) => {
        e.stopPropagation();
        if (!activeHighlights || activeHighlights.length === 0) return;
        setCarouselIndex((prev) => (prev - 1 + activeHighlights.length) % activeHighlights.length);
    };

    const handleMuscleClick = (muscleName) => {
        // Find data for this muscle
        const actualSets = data?.physique_card?.muscle_progress?.[muscleName]
            ? Math.round((data.physique_card.muscle_progress[muscleName] / 100) * (data.physique_card.muscle_targets?.[muscleName] || 20))
            : 0;

        const targetSets = data?.physique_card?.muscle_targets?.[muscleName] || 20;

        // 🔴 零模擬數據：不再捏造「Compound/Isolation」假動作拆分；
        //    無逐動作紀錄時傳空陣列 → modal 顯示誠實的「No exercises recorded」。
        setSelectedMuscleData({
            name: muscleName,
            actualSets,
            targetSets,
            exercises: []
        });
        setActiveModal('physique_details');
    };

    const handleUpdateTarget = (muscleName, newTarget) => {
        console.log(`Updating target for ${muscleName} to ${newTarget}`);
        // In real app: API call to update target
        if (data) {
            const newData = { ...data };
            if (newData.physique_card && newData.physique_card.muscle_targets) {
                newData.physique_card.muscle_targets[muscleName] = newTarget;
                setData(newData);
            }
        }
    };

    // Mock Visuals for Demo Mode
    const getDemoVisuals = () => {
        switch (demoMode) {
            case 'hypertrophy':
                return {
                    chest: { type: 'VOLUME_LOADING' },
                    shoulders: { type: 'VOLUME_LOADING' }
                };
            case 'strength':
                return {
                    legs: { type: 'STRENGTH_PEAKING', current_max: 140, is_pr: true },
                    chest: { type: 'STRENGTH_PEAKING', current_max: 100, is_pr: false }
                };
            case 'repair':
                return {
                    core: { type: 'STRUCTURAL_ALIGNMENT', focus: 'core stability', days_completed: [0, 1, 3, 4, 5] }
                };
            default:
                return data?.physique_card?.muscle_visuals || {};
        }
    };

    if (loading) return <div className="p-8 text-center text-white/50">Loading Evolution Matrix...</div>;
    if (loadError) return (
        <div className="p-8 text-center text-white/60 flex flex-col items-center gap-4">
            <div className="text-sm">無法載入進化數據，請確認網路或稍後再試。</div>
            <motion.button {...pressProps('icon')}
 onClick={() => { setLoading(true); fetchEvolutionData(); }}
 className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
 >
                重新載入
            </motion.button>
        </div>
    );
    if (!data) return null;

    const { current_tags, physique_card, metabolic_card, coach_card } = data;

    // Override visuals if in demo mode
    const activeVisuals = demoMode === 'default' ? physique_card.muscle_visuals : getDemoVisuals();

    // Override Highlight Areas for Demo
    const activeHighlights = demoMode === 'default' ? physique_card.highlight_areas :
        demoMode === 'hypertrophy' ? ['chest', 'shoulders'] :
            demoMode === 'strength' ? ['legs', 'chest'] :
                ['core'];

    // Helper to update specific week target
    const updateTarget = (weekIdx, type, field, value) => {
        setTargetPlan(prev => {
            const newPlan = [...prev];
            newPlan[weekIdx] = {
                ...newPlan[weekIdx],
                [type]: {
                    ...newPlan[weekIdx][type],
                    [field]: value
                }
            };
            return newPlan;
        });
    };

    const handleSaveTargets = async () => {
        try {
            await apiClient.post('/api/evolution/targets', {
                user_id: userId || getUserId(),
                target_plan: targetPlan,
                // If we want to RESET cycle, we send cycle_start_date. 
                // For now, just updating plan shouldn't reset start date unless requested.
            });
            setShowSettings(false);
            fetchEvolutionData();
        } catch (error) {
            console.error("Failed to save targets", error);
            toast.error('目標儲存失敗，請稍後再試');
        }
    };

    const modalContent = {
        physique: {
            title: "Physique Notes",
            icon: Target,
            color: "#EEDC82",
            textColor: "#3A3219",
            text: (
                <div className="space-y-4">
                    <p>這張卡片追蹤你的肌肉容量與結構進化。</p>
                    <div className="bg-[#3A3219]/5 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center opacity-60">
                            <div className="text-[9px] font-bold uppercase tracking-widest">Muscle Progress (Volume)</div>
                            <div className="text-[9px] font-bold uppercase tracking-widest">Actual / Target</div>
                        </div>
                        {physique_card.muscle_progress ? (
                            Object.entries(physique_card.muscle_progress).map(([part, pct]) => {
                                const target = physique_card.muscle_targets?.[part] || 0;
                                const actual = target > 0 ? Math.round((pct / 100) * target) : 0;
                                const displayVal = target > 0 ? `${actual} / ${target} Vol` : `${pct}%`;

                                return (
                                    <div key={part} className="flex items-center justify-between">
                                        <span className="text-sm font-bold capitalize w-20">{part}</span>
                                        <div className="flex items-center gap-2 flex-1 mx-3">
                                            <div className="h-1.5 flex-1 bg-[#3A3219]/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#3A3219]" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                        <span className="text-sm font-mono font-bold w-16 text-right">{displayVal}</span>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="text-sm opacity-60">No specific data available.</div>
                        )}
                    </div>
                    <ul className="text-sm space-y-2 opacity-80 list-disc pl-4">
                        <li><strong>黃色熱力圖：</strong>代表你選定的進化焦點。</li>
                        <li><strong>數字顯示：</strong>目前完成組數 / 每週目標組數。</li>
                        <li><strong>進化狀態：</strong>當進度達到 100%，該部位將會『進化』成金色狀態。</li>
                    </ul>
                </div>
            )
        },
        metabolic: {
            title: "Metabolic Burn",
            icon: Zap,
            color: "#FF8C69",
            textColor: "#3E1A1A",
            text: "外圈＝每週熱量消耗目標，內圈＝每週跑步里程目標。兩圈填滿代表本週達成。"
        },
        coach: {
            title: "Coach Notes",
            icon: AlertTriangle,
            color: "#F7F3E8",
            textColor: "#3D3D3D",
            text: "綜合你的重訓與有氧數據，在進度落後或訓練過量時提醒你調整。"
        }
    };

    const cardioKeywords = ['#FATBURN', '#ENDURANCE', '#RUNNING', '#MINDFULNESS', '#METABOLIC', '#CARDIO', '#HIIT'];
    const fitnessKeywords = ['#HYPERTROPHY', '#STRENGTH', '#BUILD', '#SCULPT', '#POWER', '#CHEST', '#BACK', '#LEG', '#ARM', '#ABS', '#GAINS'];
    const cardioTags = current_tags?.filter(tag => cardioKeywords.some(k => tag.toUpperCase().includes(k.replace('#', '')))) || [];
    const fitnessTags = current_tags?.filter(tag => fitnessKeywords.some(k => tag.toUpperCase().includes(k.replace('#', '')))) || [];
    const otherTags = current_tags?.filter(tag => !cardioTags.includes(tag) && !fitnessTags.includes(tag)) || [];
    const displayPhysiqueTags = [...fitnessTags, ...otherTags];
    const isCardioFocus = fitnessTags.length === 0 && cardioTags.length > 0;

    const THEME = {
  PAPER: T.PAPER,
  STONE: T.STONE,
  BLACK: T.BLACK,
  PEBBLE: T.PEBBLE,
  CORAL: T.CORAL,
};

    const PhysiqueCard = (
        <motion.div
            key="physique"
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveModal('physique')}
            className="w-full rounded-[28px] p-8 relative overflow-hidden shadow-xl min-h-[420px] flex flex-col cursor-pointer transition-all border border-black/5"
            style={{ background: THEME.STONE }}
        >
            <div className="absolute top-6 right-6 opacity-30"><ChevronRight size={20} className="text-[#161415]" /></div>
            <div className="flex justify-between items-start mb-6 z-10">
                <div>
                    <h2 className="text-[#161415] text-3xl font-light italic leading-tight" style={{ fontFamily: 'var(--font-display)' }}>Physique Notes</h2>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {displayPhysiqueTags.map((tag, i) => (
                            <span key={i} className="px-2.5 py-1 bg-black/5 rounded-lg text-[9px] font-bold text-[#161415]/60 uppercase tracking-widest">{tag}</span>
                        ))}
                    </div>
                </div>
                <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center">
                    <Target size={22} className="text-[#161415]" />
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center relative">
                <div className="scale-110 origin-center">
                    <EvolutionBodyMap
                        highlightAreas={activeHighlights}
                        progressPercentage={physique_card.progress_percentage}
                        muscleProgress={physique_card.muscle_progress}
                        muscleTargets={physique_card.muscle_targets}
                        muscleVisuals={activeVisuals}
                        status={physique_card.status}
                        theme="light"
                    />
                </div>
            </div>

            <div className="mt-6 px-2 relative min-h-[90px] flex items-center justify-center">
                {activeHighlights.length > 1 && (
                    <>
                        <motion.button {...pressProps('row')} aria-label="上一個"
 onClick={handleCarouselPrev}
 className="absolute left-0 z-20 p-2 text-[#161415]/20 hover:text-[#161415] transition-colors"
 >
                            <ChevronLeft size={24} />
                        </motion.button>
                        <motion.button {...pressProps('row')} aria-label="下一個"
 onClick={handleCarouselNext}
 className="absolute right-0 z-20 p-2 text-[#161415]/20 hover:text-[#161415] transition-colors"
 >
                            <ChevronRight size={24} />
                        </motion.button>
                    </>
                )}

                <AnimatePresence mode="wait">
                    {(() => {
                        if (!activeHighlights || activeHighlights.length === 0) return null;
                        const primaryMuscle = activeHighlights[carouselIndex % activeHighlights.length];
                        const visualConfig = activeVisuals[primaryMuscle];
                        if (!visualConfig) return null;

                        return (
                            <motion.div
                                key={primaryMuscle}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="w-full flex flex-col items-center"
                            >
                                <div className="text-[9px] uppercase font-black tracking-widest text-[#161415]/40 mb-3">{primaryMuscle} Evolution</div>
                                {visualConfig.type === 'VOLUME_LOADING' && (
                                    (() => {
                                        const target = physique_card.muscle_targets[primaryMuscle] || 16;
                                        const actualSets = Math.round((physique_card.muscle_progress[primaryMuscle] / 100) * target) || 0;
                                        return <VolumeLoader actual={actualSets} target={target} color={THEME.BLACK} />;
                                    })()
                                )}

                                {visualConfig.type === 'STRENGTH_PEAKING' && (
                                    <StrengthGauge currentWeight={visualConfig.current_max} prevMax={visualConfig.last_week_max ?? visualConfig.prev_max ?? null} color={THEME.BLACK} />
                                )}
                            </motion.div>
                        );
                    })()}
                </AnimatePresence>
            </div>
        </motion.div>
    );

    const MetabolicCard = (
        <motion.div
            key="metabolic"
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveModal('metabolic')}
            className="w-full rounded-[28px] p-8 relative overflow-hidden shadow-xl flex flex-col cursor-pointer transition-all border border-black/5"
            style={{ background: THEME.STONE }}
        >
            <div className="absolute top-6 right-6 opacity-30"><ChevronRight size={20} className="text-[#161415]" /></div>
            <div className="flex justify-between items-start mb-6 z-10">
                <div>
                    <h2 className="text-[#161415] text-3xl font-light italic leading-tight" style={{ fontFamily: 'var(--font-display)' }}>Metabolic Burn</h2>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {cardioTags.map((tag, i) => (
                            <span key={i} className="px-2.5 py-1 bg-black/5 rounded-lg text-[9px] font-bold text-[#161415]/60 uppercase tracking-widest">{tag}</span>
                        ))}
                    </div>
                </div>
                <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center">
                    <Zap size={22} className="text-[#161415]" />
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center my-4">
                <MetabolicDualRings
                    distanceCurrent={metabolic_card.metrics.distance_km}
                    distanceTarget={metabolic_card.targets?.distance_km || 20}
                    caloriesCurrent={metabolic_card.metrics.active_calories}
                    caloriesTarget={metabolic_card.targets?.calories_kcal || 3500}
                    colorMain={THEME.BLACK}
                    colorSub={THEME.CORAL}
                />
            </div>
            <div className="flex justify-around mt-6 pt-6 border-t border-black/5">
                <div className="text-center">
                    <div className="text-[#161415] text-2xl font-black">{metabolic_card.metrics.distance_km}<span className="text-xs ml-0.5 opacity-40">km</span></div>
                    <div className="text-[#161415]/40 text-[9px] uppercase font-black tracking-widest">Distance</div>
                </div>
                <div className="text-center">
                    <div className="text-[#161415] text-2xl font-black">{metabolic_card.metrics.active_calories}</div>
                    <div className="text-[#161415]/40 text-[9px] uppercase font-black tracking-widest">Kcal Burn</div>
                </div>
            </div>
        </motion.div >
    );

    const CoachCard = (
        <motion.div
            key="coach"
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveModal('coach')}
            className="w-full rounded-[28px] p-8 relative overflow-hidden shadow-xl cursor-pointer transition-all border border-black/5"
            style={{ background: THEME.PEBBLE }}
        >
            <div className="absolute top-6 right-6 opacity-30"><ChevronRight size={20} className="text-[#161415]" /></div>
            <div className="flex justify-between items-start mb-6 z-10">
                <div>
                    <h2 className="text-[#161415] text-3xl font-light italic leading-tight" style={{ fontFamily: 'var(--font-display)' }}>Coach Brain</h2>
                    <p className="text-[#161415]/40 text-[9px] font-black uppercase tracking-widest mt-2">Active Intelligence</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <AlertTriangle size={22} className="text-[#161415]" />
                </div>
            </div>
            <div className="space-y-4">
                <div className="flex items-start gap-4">
                    <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${coach_card.alert_level === 'critical' ? 'bg-red-500' :
                        coach_card.alert_level === 'warning' ? 'bg-yellow-500' : 'bg-[#161415]'}`} />
                    <p className="text-[#161415] text-[15px] font-medium leading-relaxed">{coach_card.feedback_text}</p>
                </div>
                {coach_card.nutrition_plan && (
                    <div className="mt-4 pt-4 border-t border-black/5">
                        <p className="text-[#161415]/40 text-[9px] uppercase font-black tracking-widest mb-1.5">Nutrition Strategy</p>
                        <p className="text-[#161415] text-sm font-bold">{coach_card.nutrition_plan}</p>
                    </div>
                )}
                {(() => {
                    const recoveryVisual = Object.values(activeVisuals || {}).find(v => v.type === 'STRUCTURAL_ALIGNMENT');
                    if (!recoveryVisual) return null;
                    const daysCompleted = new Set(recoveryVisual.days_completed || []);
                    const weeklyLogs = [0, 1, 2, 3, 4, 5, 6].map(i => daysCompleted.has(i));
                    return (
                        <div className="mt-6 bg-white/10 p-5 rounded-[18px] border border-white/20 shadow-inner">
                            <StructuralAlignment weeklyLogs={weeklyLogs} color={THEME.BLACK} />
                            {weeklyLogs.filter(Boolean).length >= 4 && (
                                <p className="text-center text-[9px] font-black text-[#161415] mt-3 tracking-widest uppercase">✨ System Aligned</p>
                            )}
                        </div>
                    );
                })()}
            </div>
        </motion.div>
    );

    const SettingsModal = (
        <AnimatePresence>
            {showSettings && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-[#161415]/90 backdrop-blur-md z-50 flex items-center justify-center p-6"
                    onClick={() => setShowSettings(false)}
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        className="w-full max-w-sm bg-[#F6F4F1] rounded-[36px] p-8 relative shadow-2xl overflow-y-auto max-h-[85dvh] no-scrollbar"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6 sticky top-0 bg-[#F6F4F1] z-10 pb-4 border-b border-black/5">
                            <div>
                                <h3 className="text-2xl font-light italic" style={{ fontFamily: 'var(--font-display)', color: THEME.BLACK }}>Adjust Targets</h3>
                                <p className="text-[9px] uppercase font-black tracking-widest opacity-40">4-Week Evolution Plan</p>
                            </div>
                            <motion.button {...pressProps('icon')} onClick={() => setShowSettings(false)} className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center text-black/40 hover:bg-black/10 transition-colors">✕</motion.button>
                        </div>

                        {/* Week Tabs */}
                        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
                            {[0, 1, 2, 3].map(weekIdx => (
                                <motion.button {...pressProps('icon')}
 key={weekIdx}
 onClick={() => setSelectedWeek(weekIdx)}
 className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${selectedWeek === weekIdx
 ? 'bg-[#161415] text-[#F6F4F1]'
 : 'bg-black/5 text-[#161415]/40 hover:bg-black/10'
 } ${cycleCurrentWeek === weekIdx ? 'ring-2 ring-[#F95C4B] ring-offset-2 ring-offset-[#F6F4F1]' : ''}`}
 >
                                    Week {weekIdx + 1}
                                    {cycleCurrentWeek === weekIdx && <span className="ml-1 opacity-60">· ACTIVE</span>}
                                </motion.button>
                            ))}
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-4">
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-[#161415]/40 pl-1">Muscular Loads (Sets)</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {Object.keys(targetPlan[selectedWeek].muscles).map(muscle => (
                                        <div key={muscle} className="bg-white rounded-3xl p-4 shadow-sm border border-black/5">
                                            <div className="text-[9px] uppercase font-black text-black/30 mb-2">{muscle}</div>
                                            <input
                                                type="number"
                                                value={targetPlan[selectedWeek].muscles[muscle]}
                                                onChange={(e) => updateTarget(selectedWeek, 'muscles', muscle, parseInt(e.target.value) || 0)}
                                                className="w-full bg-transparent text-[#161415] font-black text-2xl outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-[#161415]/40 pl-1">Metabolic Goals</h4>
                                <div className="space-y-4">
                                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-black/5 flex justify-between items-center">
                                        <div className="flex-1">
                                            <div className="text-[9px] uppercase font-black text-black/30 mb-1">Total Distance (km)</div>
                                            <input
                                                type="number"
                                                value={targetPlan[selectedWeek].cardio.distance_km}
                                                onChange={(e) => updateTarget(selectedWeek, 'cardio', 'distance_km', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-transparent text-[#161415] font-black text-2xl outline-none"
                                            />
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center opacity-30"><Target size={20} /></div>
                                    </div>
                                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-black/5 flex justify-between items-center">
                                        <div className="flex-1">
                                            <div className="text-[9px] uppercase font-black text-black/30 mb-1">Active Burn (kcal)</div>
                                            <input
                                                type="number"
                                                value={targetPlan[selectedWeek].cardio.calories_kcal}
                                                onChange={(e) => updateTarget(selectedWeek, 'cardio', 'calories_kcal', parseInt(e.target.value) || 0)}
                                                className="w-full bg-transparent text-[#161415] font-black text-2xl outline-none"
                                            />
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center opacity-30"><Zap size={20} /></div>
                                    </div>
                                </div>
                            </div>

                            <motion.button {...pressProps('pill')} onClick={handleSaveTargets} className="w-full py-5 rounded-3xl bg-[#161415] text-[#F6F4F1] font-black uppercase tracking-[0.2em] shadow-xl hover:opacity-90 mt-6 text-xs">
                                Update Evolution Plan
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div className="w-full min-h-[100dvh] text-[#161415] relative transition-colors duration-500" style={{ backgroundColor: THEME.PAPER }}>
            <div className="flex justify-end px-6 pt-6">
                <motion.button {...pressProps('icon')}
 onClick={() => setShowSettings(true)}
 className="flex items-center gap-2 text-[9px] font-black text-[#161415]/40 hover:text-[#161415] uppercase tracking-widest bg-black/5 px-4 py-2 rounded-full"
 >
                    <Target size={14} /> Adjust Evolution Flow
                </motion.button>
            </div>

            <div className="flex flex-col gap-8 px-6 py-6 pb-4">
                {isCardioFocus ? <>{MetabolicCard}{PhysiqueCard}</> : <>{PhysiqueCard}{MetabolicCard}</>}
                {CoachCard}
            </div>

            {SettingsModal}

            <AnimatePresence>
                {activeModal && activeModal !== 'physique_details' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-[#161415]/90 backdrop-blur-md z-50 flex items-center justify-center p-8"
                        onClick={() => setActiveModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="w-full max-w-sm rounded-[36px] p-10 relative shadow-2xl border border-white/10"
                            style={{ backgroundColor: THEME.PAPER }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full bg-black/5 flex items-center justify-center">
                                        {React.createElement(modalContent[activeModal].icon, { size: 28, color: THEME.BLACK })}
                                    </div>
                                    <h3 className="text-3xl font-light italic" style={{ fontFamily: 'var(--font-display)', color: THEME.BLACK }}>
                                        {modalContent[activeModal].title}
                                    </h3>
                                </div>
                                <motion.button {...pressProps('icon')} onClick={() => setActiveModal(null)} className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center text-black/40 hover:bg-black/10 transition-colors">✕</motion.button>
                            </div>
                            <div className="text-base font-medium leading-relaxed opacity-70 whitespace-pre-line text-[#161415]">
                                {modalContent[activeModal].text}
                            </div>
                            <motion.button {...pressProps('pill')} onClick={() => setActiveModal(null)} className="w-full mt-10 py-4 rounded-[18px] font-black text-xs uppercase tracking-widest bg-black text-white hover:opacity-90">
                                Acknowledge Evolution
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {activeModal === 'physique_details' && selectedMuscleData && (
                    <PhysiqueDetailsModal
                        isOpen={true}
                        onClose={() => setActiveModal(null)}
                        muscleData={selectedMuscleData}
                        onUpdateTarget={handleUpdateTarget}
                    />
                )}
            </AnimatePresence>
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};

export default EvolutionDashboard;
