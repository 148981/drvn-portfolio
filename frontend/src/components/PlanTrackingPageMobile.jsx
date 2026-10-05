import React, { useState, useMemo, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, Play, CheckCircle2, Lock, Clock, Flame, ChevronRight, Calendar, Award, BarChart3, Target, Zap, Circle } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { useNavigate, useLocation } from 'react-router-dom';
import { SHOULDER_ARM_PLAN, trimDay } from '../data/shoulderArmPlanData';
import { CORE_PLAN } from '../data/corePlanData';
import { findExerciseByName } from '../utils/exerciseDB';
import { getUserId } from '../utils/auth';
import apiClient from '../api/client';
import { activateProgram, newProgramId } from '../utils/trainingProgram';
import {
  readPlanDoneIdxs, writePlanProgress, activateSpecialPlan, markPlanStarted,
} from '../utils/specialPlanProgress';
import { notify } from '../utils/drvnNotifications';
import { T } from '../utils/theme';

/* ─── PALETTE ─── */


/* ─── HELPERS ─── */
const estimateBurn = (exercises, durationMin) =>
  Math.round(durationMin * 5.5 + exercises.length * 12);

const parseRestVal = (r) => {
  if (typeof r === 'number') return r;
  const m = String(r || '60').match(/(\d+)/);
  return m ? parseInt(m[1]) : 60;
};

const MUSCLE_COLORS = {
  '二頭肌':    { bg: 'rgba(249,92,75,0.12)', text: T.CORAL,  border: 'rgba(249,92,75,0.25)' },
  '三頭肌':    { bg: 'rgba(217,64,48,0.10)', text: T.EMBER,  border: 'rgba(217,64,48,0.25)' },
  '二頭肌、肱肌': { bg: 'rgba(249,92,75,0.10)', text: T.CORAL,  border: 'rgba(249,92,75,0.20)' },
  '三頭肌、胸肌': { bg: 'rgba(207,198,184,0.30)', text: T.BLACK,  border: 'rgba(22,20,21,0.15)' },
  '三頭肌長頭': { bg: 'rgba(217,64,48,0.10)', text: T.EMBER,  border: 'rgba(217,64,48,0.20)' },
  '三頭肌外側頭': { bg: 'rgba(228,222,210,0.60)', text: T.BLACK, border: 'rgba(22,20,21,0.12)' },
  '二頭肌長頭': { bg: 'rgba(249,92,75,0.10)', text: T.CORAL,  border: 'rgba(249,92,75,0.20)' },
  '腹直肌': { bg: 'rgba(249,92,75,0.10)', text: T.CORAL,  border: 'rgba(249,92,75,0.20)' },
  '腹斜肌': { bg: 'rgba(228,222,210,0.60)', text: T.BLACK, border: 'rgba(22,20,21,0.12)' },
  '腹橫肌': { bg: 'rgba(217,64,48,0.08)', text: T.EMBER,  border: 'rgba(217,64,48,0.15)' },
  '下背 / 核心': { bg: 'rgba(207,198,184,0.30)', text: T.BLACK,  border: 'rgba(22,20,21,0.15)' },
};
const muscleStyle = (m) => MUSCLE_COLORS[m] || { bg: T.STONE, text: T.BLACK, border: 'rgba(22,20,21,0.15)' };

/* ─── EXERCISE DETAIL SHEET ─── */
const ExerciseDetailSheet = ({ ex, dbData: initialDbData, onClose }) => {
  const [dbData, setDbData] = useState(initialDbData);
  const [loading, setLoading] = useState(!initialDbData);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    if (!dbData && ex.name) {
      setLoading(true);
      findExerciseByName(ex.name).then(data => {
        setDbData(data || null);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [ex.name, dbData]);

  const images = dbData?.imageUrls || [];
  const instructions = dbData?.instructions || [];

  return (
    <motion.div className="fixed inset-0 z-[100] flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div 
        className="relative w-full rounded-t-[36px] bg-[#F6F4F1] overflow-hidden"
        style={{ maxHeight: '85dvh', overflowY: 'auto' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      >
        <div className="sticky top-0 right-0 p-6 flex justify-end z-10">
          <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
            <X size={20} />
          </motion.button>
        </div>

        <div className="px-8 pb-12">
          <p className="text-[12px] font-black tracking-[0.04em] text-[#F95C4B] mb-2">動作詳情</p>
          <h2 className="text-3xl font-black text-[#161415] mb-6 leading-tight uppercase">{ex.name}</h2>
          
          {loading && (
            <div className="py-20 flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-[#161415]/10 border-t-[#F95C4B] rounded-full animate-spin" />
              <span className="text-[9px] font-bold tracking-widest opacity-40 uppercase">Loading Data...</span>
            </div>
          )}

          {!loading && images.length > 0 && (
            <div className="mb-8 rounded-3xl overflow-hidden aspect-video bg-black/5 relative group">
               <img loading="lazy" decoding="async" src={images[imgIdx]} alt={ex.name} className="w-full h-full object-contain" />
               {images.length > 1 && (
                 <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                   {images.map((_, i) => (
                     <div key={i} className={`h-1 rounded-full transition-all ${i === imgIdx ? 'w-6 bg-[#F95C4B]' : 'w-2 bg-black/20'}`} />
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
                    <div className="w-6 h-6 rounded-lg bg-black/5 flex items-center justify-center shrink-0 text-[11px] font-black">{i+1}</div>
                    <p className="text-[14px] leading-relaxed text-[#161415]/80 font-medium">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !dbData && (
            <div className="py-12 text-center opacity-40">
              <Dumbbell size={32} className="mx-auto mb-3" />
              <p className="text-xs font-bold">Details unavailable.</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════
   SESSION PREVIEW SHEET  (like 图二)
   ═══════════════════════════════════════════════════ */
// 🎯 統一時間預估引擎：精準計算包含超級組、遞減組與單邊動作的真實時長
const calculateActualDuration = (exercises = []) => {
    if (!exercises || exercises.length === 0) return 0;
    
    const totalSec = exercises.reduce((acc, ex, idx) => {
        // 1. 基礎執行時間 (單邊 50s, 雙邊 30s)
        let execSecPerSet = ex.unilateral ? 50 : 30;
        
        // 🔻 遞減組 (Drop Set) 補償
        const isDropSet = ex.isDropSet || (typeof ex.reps === 'string' && ex.reps.includes('->'));
        if (isDropSet && typeof ex.reps === 'string') {
            const dropStages = ex.reps.split('->').length;
            execSecPerSet = execSecPerSet * (dropStages * 0.85);
        }

        // 2. 休息時間
        const restVal = parseRestVal(ex.rest);
        let totalRestForEx = ((ex.sets || 3) - 1) * restVal;

        // ⚡️ 超級組 (Superset) 補償：A 動作後不休息
        const isSupersetA = ex.supersetGroup && exercises[idx + 1]?.supersetGroup === ex.supersetGroup;
        if (isSupersetA) totalRestForEx = 0;

        // 3. 轉場時間 (Transition)
        const transitionTime = 40;

        return acc + (ex.sets || 3) * execSecPerSet + totalRestForEx + transitionTime;
    }, 0);
    
    return Math.round(totalSec / 60);
};

const SessionPreviewSheet = ({ day, levelData, onClose, onStart }) => {
  const durVal = String(levelData?.durationPerSession || '30');
  const targetMin = parseInt(durVal.split('-')[0]);

  // 🔥 使用統一計算引擎
  const finalEx = day.exercises || [];
  const actualMin = calculateActualDuration(finalEx);
  
  const allMuscles = [...new Set(finalEx.map(e => e.target || e.targetLabel || '').filter(Boolean))];
  const kcal = Math.round(actualMin * 6 + finalEx.length * 10);

  const [detailEx, setDetailEx] = useState(null);

  const handleExClick = (ex) => {
    setDetailEx(ex);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(22,20,21,0.55)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      {/* Sheet */}
      <motion.div
        className="relative w-full rounded-t-[36px] overflow-hidden"
        style={{ background: T.STONE, maxHeight: '92dvh', overflowY: 'auto' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        {/* Close button */}
        <div className="absolute top-5 right-5 z-10">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(22,20,21,0.08)' }}
          >
            <X size={18} style={{ color: T.BLACK }} />
          </motion.button>
        </div>

        {/* Header */}
        <div className="px-6 pt-8 pb-5">
          <div className="flex items-start gap-4">
            {/* Day number box */}
            <div
              className="w-16 h-16 rounded-[18px] flex flex-col items-center justify-center shrink-0"
              style={{
                background: T.BLACK,
                boxShadow: '0 6px 20px rgba(22,20,21,0.25)',
              }}
            >
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(246,244,241,0.50)' }}>DAY</span>
              <span className="text-2xl font-black" style={{ color: T.PAPER }}>{day.dayNumber}</span>
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-wide" style={{ color: T.BLACK }}>
                {day.weekday}
              </h2>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] mt-0.5" style={{ color: 'rgba(22,20,21,0.55)' }}>
                {day.focus}
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(22,20,21,0.45)' }}>
                {finalEx.length} 個動作 · {finalEx.reduce((s, e) => s + e.sets, 0)} 總組數
              </p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="px-6 pb-5 flex gap-3">
          {[
            { icon: Clock,    value: actualMin,            unit: 'min',  label: '時長' },
            { icon: Flame,    value: kcal,                 unit: 'kcal', label: '預估燃燒' },
            { icon: Dumbbell, value: finalEx.length,     unit: '',     label: '動作數' },
          ].map((s, i) => (
            <div
              key={i}
              className="flex-1 rounded-[18px] p-3"
              style={{
                background: '#FFFFFF',
                boxShadow: '0 2px 12px rgba(22,20,21,0.06)',
                border: '1px solid rgba(22,20,21,0.06)',
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center mb-2"
                style={{ background: i === 0 ? 'rgba(249,92,75,0.12)' : i === 1 ? 'rgba(249,92,75,0.10)' : 'rgba(22,20,21,0.06)', color: i < 2 ? T.CORAL : T.BLACK }}
              >
                <s.icon size={13} />
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl font-black" style={{ color: T.BLACK }}>{s.value}</span>
                {s.unit && <span className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.50)' }}>{s.unit}</span>}
              </div>
              <p className="text-[9px] font-black tracking-widest uppercase mt-0.5" style={{ color: 'rgba(22,20,21,0.40)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        <div className="h-px mx-6" style={{ background: 'rgba(22,20,21,0.08)' }} />

        {/* Muscle groups */}
        <div className="px-6 py-4">
          <p className="text-[12px] font-black tracking-[0.04em] mb-3" style={{ color: 'rgba(22,20,21,0.40)' }}>訓練肌群</p>
          <div className="flex flex-wrap gap-2">
            {allMuscles.map((m, i) => {
              const s = muscleStyle(m);
              return (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-full text-[9px] font-black tracking-wide uppercase"
                  style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
                >
                  {m}
                </span>
              );
            })}
          </div>
        </div>

        {/* Equipment */}
        <div className="px-6 pb-4">
          <p className="text-[12px] font-black tracking-[0.04em] mb-3" style={{ color: 'rgba(22,20,21,0.40)' }}>所需器材</p>
          <div className="flex flex-wrap gap-2">
            {(levelData.equipment || []).map((eq, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(22,20,21,0.10)',
                  color: T.BLACK,
                  boxShadow: '0 1px 4px rgba(22,20,21,0.05)',
                }}
              >
                <Dumbbell size={10} style={{ color: T.CORAL }} />
                {eq.toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="h-px mx-6" style={{ background: 'rgba(22,20,21,0.08)' }} />

        {/* Exercise list */}
        <div className="px-6 pt-4 pb-6">
          <p className="text-[12px] font-black tracking-[0.04em] mb-3" style={{ color: 'rgba(22,20,21,0.40)' }}>動作列表</p>
          <div className="space-y-1.5">
            {(() => {
              const grouped = [];
              let currentGroup = null;
              finalEx.forEach(ex => {
                if (ex.supersetGroup) {
                  if (currentGroup && currentGroup.id === ex.supersetGroup) {
                    currentGroup.pair.push(ex);
                  } else {
                    currentGroup = { isSuperset: true, id: ex.supersetGroup, pair: [ex] };
                    grouped.push(currentGroup);
                  }
                } else {
                  currentGroup = null;
                  grouped.push({ isSuperset: false, ex });
                }
              });

              return grouped.map((g, gi) => {
                if (g.isSuperset) {
                  const isFusionSS = g.id.includes('::') || g.id.includes('_FUSION_') || g.id.includes('superset');
                  let displayGid = g.id;
                  if (isFusionSS) {
                    // 🎯 只要是 fusion 或系統生成的 ID，就抓取最後一個數字並加 1
                    const match = g.id.match(/(\d+)(?:-|$)/);
                    const ssNum = match ? parseInt(match[1]) + 1 : 1;
                    displayGid = `SS${ssNum}`;
                  }
                  const letters = ['A', 'B', 'C', 'D'];
                  return (
                    <div key={gi} className="mb-3 p-4 rounded-[28px] border border-[#F95C4B]/30 bg-[#F95C4B]/8 relative overflow-hidden">
                      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full" style={{ background: T.CORAL }} />
                      <div className="flex items-center justify-between mb-4 ml-3">
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,92,75,0.12)', color: T.CORAL }}>
                          {displayGid} <span style={{ opacity: 0.5 }}>Superset</span>
                        </span>
                        <Zap size={12} color={T.CORAL} />
                      </div>
                      {g.pair.map((ex, pi) => (
                        <div key={pi}>
                          <div className="flex items-center gap-3 py-2 cursor-pointer active:opacity-60 transition-opacity" onClick={() => handleExClick(ex)}>
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black"
                                 style={{ background: pi === 0 ? T.BLACK : 'rgba(22,20,21,0.05)', color: pi === 0 ? T.STONE : T.BLACK }}>
                              {letters[pi] || pi + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate" style={{ color: T.BLACK }}>{ex.name}</p>
                              <p className="text-[11px] font-medium" style={{ color: 'rgba(22,20,21,0.45)' }}>
                                {ex.sets} 組 × {ex.reps} 下{ex.unilateral ? '（每側）' : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {pi === g.pair.length - 1 ? (
                                <span className="text-[11px] font-black" style={{ color: 'rgba(22,20,21,0.30)' }}>休息 {ex.rest}s</span>
                              ) : (
                                <span className="text-[11px] font-black px-2 py-1 rounded-full" style={{ background: T.CORAL, color: '#fff' }}>→</span>
                              )}
                            </div>
                          </div>
                          {pi < g.pair.length - 1 && (
                            <div className="flex items-center pl-3 py-0.5">
                              <div style={{ width: 1.5, height: 12, background: T.CORAL, opacity: 0.3, borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
                
                // 🌟 Standalone (Check for Drop Set)
                const isDropSet = g.ex.isDropSet || (typeof g.ex.reps === 'string' && g.ex.reps.includes('->'));
                if (isDropSet) {
                  const dropAccent = '#D94030';
                  return (
                    <div key={gi} className="mb-3 p-4 rounded-[28px] border border-[#D94030]/30 bg-[#D94030]/10 relative overflow-hidden cursor-pointer active:opacity-90 transition-opacity" onClick={() => handleExClick(g.ex)}>
                      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full" style={{ background: dropAccent }} />
                      <div className="flex items-center justify-between mb-3 ml-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-black tracking-[0.04em]" style={{ color: dropAccent }}>收尾 / 遞減組</span>
                          <Flame size={12} color={dropAccent} />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 ml-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#D94030]/10">
                          <span className="text-xs font-black text-[#D94030]">{gi + 1}</span>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-[15px] font-black" style={{ color: T.BLACK }}>{g.ex.name}</h4>
                          <p className="text-[11px] font-medium opacity-60" style={{ color: T.BLACK }}>{g.ex.sets} 組 · {g.ex.reps} 下</p>
                          <p className="text-[12px] font-bold mt-1 tracking-wider" style={{ color: dropAccent }}>組間不休息 · 每次降重 20%</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={gi} 
                       className="flex items-center gap-3 px-4 py-3 mb-2 rounded-[18px] bg-white border border-[rgba(22,20,21,0.05)] shadow-[0_1px_6px_rgba(22,20,21,0.05)] cursor-pointer active:opacity-70 transition-opacity"
                       onClick={() => handleExClick(g.ex)}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[rgba(249,92,75,0.10)]">
                      <span className="text-xs font-black text-[#F95C4B]">{gi + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-[#161415]">{g.ex.name}</p>
                      <p className="text-[11px] font-medium text-[rgba(22,20,21,0.45)]">
                        {g.ex.sets} 組 × {g.ex.reps} 下{g.ex.unilateral ? '（每側）' : ''}
                      </p>
                    </div>
                    <span className="text-[11px] font-black text-[rgba(22,20,21,0.30)]">休息 {g.ex.rest}s</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-8 pt-2" style={{ background: 'linear-gradient(transparent, rgba(228,222,210,0.95) 30%)' }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onStart}
            className="w-full py-4 rounded-[18px] flex items-center justify-center gap-3"
            style={{
              background: T.BLACK,
              color: T.PAPER,
              boxShadow: '0 8px 32px rgba(22,20,21,0.30)',
            }}
          >
            <Play size={16} fill={T.PAPER} />
            <span className="text-sm font-black tracking-[0.15em] uppercase">Start Session</span>
          </motion.button>
        </div>

        {/* Exercise Detail Modal */}
        <AnimatePresence>
          {detailEx && (
            <ExerciseDetailSheet 
              ex={detailEx} 
              onClose={() => setDetailEx(null)} 
            />
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════
   PROGRESS RING
   ═══════════════════════════════════════════════════ */
const ProgressRing = ({ pct, size = 80, stroke = 6, color = T.CORAL }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(22,20,21,0.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
};

/* ═══════════════════════════════════════════════════
   MAIN — PlanTrackingPageMobile
   ═══════════════════════════════════════════════════ */
export default function PlanTrackingPageMobile() {
  const navigate = useNavigate();
  const location = useLocation();

  const plan           = location.state?.plan        || SHOULDER_ARM_PLAN;
  const levelKey       = location.state?.selectedLevel || location.state?.defaultLevel || 'beginner';
  const levelData      = plan.levels[levelKey];
  const weeks          = levelData.weeks;
  const fromDashboard  = location.state?.fromDashboard || false;

  /* Flatten all sessions */
  const allSessions = useMemo(() =>
    weeks.flatMap((w, wi) =>
      w.days.map((d, di) => ({ ...d, weekNumber: w.weekNumber, weekName: w.name, globalIdx: wi * 10 + di }))
    ), [weeks]);

  /* ── 進度與啟用：一律走 utils/specialPlanProgress（單一真相源）──
     key 帶 userId（舊的無前綴 key 會自動遷移），分母與首頁卡片同一份計算。 */
  const currentUserId = getUserId();

  /* Completed sessions — initialise from localStorage */
  const [completedSet, setCompletedSet] = useState(
    () => new Set(readPlanDoneIdxs(currentUserId, plan))
  );
  const [previewSession, setPreviewSession] = useState(null);
  const [activeWeekTab, setActiveWeekTab] = useState(0);

  /* 開始這份計劃（掛載時跑一次）
     🔴 修：過去只寫 { id, name } 進 currentPlan_<uid>，沒有 weeks —
        而今日議程（dailyAgenda.loadStrengthInputs）是讀 plan.weeks 的，
        所以「開始了專項計劃」之後首頁根本排不出重訓。
        改用 activateSpecialPlan()，把當前 level 的 weeks 一起寫進去，
        今日議程／完整計劃入口卡／恢復追蹤才會看到同一份課表。
     融合計劃維持原本行為：不搶 currentPlan。 */
  useEffect(() => {
    markPlanStarted(currentUserId, plan);
    if (plan.isFusion) return;
    let cur = null;
    try { cur = JSON.parse(localStorage.getItem(`currentPlan_${currentUserId}`) || 'null'); } catch { /* */ }
    if (cur?.special_plan_id === plan.id) return;          // 已經是目前計劃（而且存上後端了）
    const record = activateSpecialPlan(currentUserId, plan, levelKey);
    /* 也要存上後端、設成目前計劃 —— 只寫本機的話，下次開中控 refreshProgram
       會拿後端的上一份蓋回來。失敗就留著本機版，下次進來會再試一次。 */
    if (record?.weeks?.length && currentUserId) {
      activateProgram(currentUserId, {
        program_id: newProgramId(),
        strength: { ...record, special_plan_id: plan.id },
      }, apiClient).catch((e) => { console.warn('[special plan] activate failed', e?.message); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Persist completedSet whenever it changes */
  useEffect(() => {
    writePlanProgress(currentUserId, plan, [...completedSet]);
  }, [completedSet]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Detect return from WorkoutSession and mark session complete */
  useEffect(() => {
    const pendingIdx = sessionStorage.getItem('pendingCompleteIdx');
    if (pendingIdx !== null) {
      sessionStorage.removeItem('pendingCompleteIdx');
      setCompletedSet(prev => new Set([...prev, parseInt(pendingIdx, 10)]));
    }
  }, [location.key]); // re-runs on every navigation to/from this route

  const totalSessions   = allSessions.length;
  const completedCount  = completedSet.size;
  const progressPct     = totalSessions ? Math.round((completedCount / totalSessions) * 100) : 0;

  /* Current week's sessions */
  const weekSessions = weeks[activeWeekTab]?.days || [];

  // ══════════════════════════════════════════════════════════════════
  // ★ v2.3 重訓計劃的通知也走同一套滿版時刻
  //   · 整輪跑完 → 一次性的結業提示，帶去看下一輪
  //   · 這一週完成度偏低／偏高 → 課表調整提示（每週最多一次）
  // ══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!totalSessions) return;
    const uid = getUserId();
    if (!uid) return;

    // 整輪完成
    if (completedCount >= totalSessions) {
      notify(uid, 'strengthCycleDone', { weeks: weeks.length || 4 });
      return;
    }

    // 本週完成度 → 調整提示（只在這一週已經過完大半時才判定）
    const doneThisWeek = weekSessions.filter(
      (d, di) => completedSet.has(activeWeekTab * 10 + di),
    ).length;
    if (!weekSessions.length || doneThisWeek === 0) return;
    const ratio = doneThisWeek / weekSessions.length;
    if (ratio >= 1) notify(uid, 'strengthAdjusted', { week: activeWeekTab + 1, easier: false });
    else if (ratio <= 0.4) notify(uid, 'strengthAdjusted', { week: activeWeekTab + 1, easier: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount, totalSessions, activeWeekTab]);

  /* Next upcoming session */
  const nextSession = allSessions.find(s => !completedSet.has(s.globalIdx));

  /* Target minutes based on level (take lower bound of range, e.g. "35-40" → 35) */
  const durVal = String(levelData.durationPerSession || '30');
  const targetMin = parseInt(durVal.split('-')[0]);

  /* Format exercises for WorkoutSessionViewMobile */
  const buildWorkoutPlan = (session) => {
    // 🔥 不再過濾，直接使用全部動作
    const finalExercises = session.exercises || [];

    const formatted = finalExercises.map(ex => {
      // 🔥 簡化超級組標籤邏輯：將 leg-xxx::d0::A-A 轉為 SS-A
      let displayGroup = ex.supersetGroup || '';
      const sId = ex.supersetId || '';
      if (sId && sId.includes('::')) {
        const parts = sId.split('::');
        const lastPart = parts[parts.length - 1]; // 例如 "A-A" 或 "A-B"
        const groupNum = (parseInt(parts[1]?.replace('d', ''), 10) || 0) + 1;
        displayGroup = `SS${groupNum}-${lastPart.split('-')[1] || lastPart}`;
      }

      return {
        name:      ex.name,
        sets:      ex.sets,
        reps:      `${ex.reps}${ex.unilateral ? '（每側）' : ''}`,
        rest:      typeof ex.rest === 'number' ? `${ex.rest}s` : (ex.rest || '60s'),
        category:  ex.target || ex.targetLabel || 'STRENGTH',
        day_focus: ex.target || ex.targetLabel || 'TRAINING',
        // 🔥 傳遞美化後的標籤
        supersetGroup: displayGroup,
        ...(ex.note            ? { note: ex.note }                        : {}),
        ...(ex.superset        ? { supersetTransition: true }              : {}),
        ...(ex.isDropSet       ? { isDropSet: true }                       : {}),
        ...(ex.supersetType    ? { supersetType: ex.supersetType }         : {}),
      };
    });
    return {
      exercises:    formatted,
      calories_est: Math.round(targetMin * 5.5 + formatted.length * 12),
      focus:        session.focus || levelData.label,
    };
  };

  const handleStartSession = (session) => {
    const workoutPlan = buildWorkoutPlan(session);
    /* Store globalIdx in sessionStorage so onExit can mark it complete */
    sessionStorage.setItem('pendingCompleteIdx', String(session.globalIdx));
    navigate('/training-session-mobile', { state: { day: workoutPlan } });
  };

  const handleSessionDone = (session) => {
    setCompletedSet(prev => new Set([...prev, session.globalIdx]));
    setPreviewSession(null);
  };

  return (
    <div className="min-h-[100dvh] pb-10" style={{ background: T.PAPER }}>

      {/* ── HEADER ── */}
      <div
        className="px-5 pt-12 pb-6"
        style={{
          background: T.BLACK,
          borderRadius: '0 0 32px 32px',
          boxShadow: '0 12px 40px rgba(22,20,21,0.20)',
        }}
      >
        {/* Back */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => (fromDashboard || plan?.isFusion) ? navigate('/master-journey-mobile') : navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center mb-5"
          style={{ background: 'rgba(246,244,241,0.10)' }}
        >
          <ArrowLeft size={18} style={{ color: T.PAPER }} />
        </motion.button>

        {/* Plan name + level */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] font-black tracking-[0.25em] mb-1" style={{ color: 'rgba(246,244,241,0.40)' }}>
              追蹤中
            </p>
            <h1 className="text-xl font-serif font-bold leading-tight" style={{ color: T.PAPER }}>
              {plan.name}
            </h1>
            <p className="text-[11px] mt-1" style={{ color: 'rgba(246,244,241,0.50)' }}>
              {levelData.label} · {levelData.recommendedDaysLabel} · {plan.duration} 天
            </p>
          </div>
          <div
            className="px-3 py-1.5 rounded-full text-[11px] font-black tracking-wide"
            style={{ background: 'rgba(249,92,75,0.18)', color: T.CORAL }}
          >
            {levelData.label}
          </div>
        </div>

        {/* ── BIG PROGRESS RING ── */}
        <div className="flex items-center gap-6 mt-6">
          <div className="relative">
            <ProgressRing pct={progressPct} size={88} stroke={7} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-black" style={{ color: T.PAPER }}>{progressPct}%</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-end gap-1 mb-1">
              <span className="text-3xl font-black" style={{ color: T.CORAL }}>{completedCount}</span>
              <span className="text-sm font-bold mb-1" style={{ color: 'rgba(246,244,241,0.50)' }}>/ {totalSessions}</span>
            </div>
            <p className="text-xs font-bold" style={{ color: 'rgba(246,244,241,0.60)' }}>訓練次數完成</p>
            <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(246,244,241,0.10)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${T.CORAL}, ${T.EMBER})` }}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-5">
          {[
            { label: '剩餘天數', value: plan.duration - Math.round((plan.duration / totalSessions) * completedCount) },
            { label: '已完成組數', value: [...completedSet].reduce((sum, idx) => {
              const s = allSessions.find(a => a.globalIdx === idx);
              return sum + (s?.exercises?.reduce((ss, e) => ss + e.sets, 0) || 0);
            }, 0) },
            { label: '本週完成', value: weekSessions.filter((d, di) => completedSet.has(activeWeekTab * 10 + di)).length + '/' + weekSessions.length },
          ].map((st, i) => (
            <div key={i} className="flex-1 text-center py-2 rounded-[18px]" style={{ background: 'rgba(246,244,241,0.06)' }}>
              <p className="text-base font-black" style={{ color: T.PAPER }}>{st.value}</p>
              <p className="text-[11px] font-bold mt-0.5" style={{ color: 'rgba(246,244,241,0.40)' }}>{st.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── NEXT UP BANNER ── */}
      {nextSession && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mx-5 mt-5 rounded-[18px] overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(249,92,75,0.18)' }}
        >
          <div
            className="p-4 flex items-center gap-4"
            style={{ background: `linear-gradient(135deg, ${T.CORAL} 0%, ${T.EMBER} 100%)` }}
          >
            <div
              className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.20)' }}
            >
              <span className="text-[9px] font-black uppercase" style={{ color: 'rgba(255,255,255,0.70)' }}>DAY</span>
              <span className="text-lg font-black text-white">{nextSession.dayNumber}</span>
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-black tracking-widest" style={{ color: 'rgba(255,255,255,0.70)' }}>下一個</p>
              <p className="text-sm font-bold text-white">{nextSession.weekday} — {nextSession.focus}</p>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {calculateActualDuration(nextSession.exercises)} min · {nextSession.exercises.length} 個動作
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setPreviewSession(nextSession)}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.22)' }}
            >
              <Play size={16} fill="white" style={{ color: 'white' }} />
            </motion.button>
          </div>
        </motion.div>
      )}

      {!nextSession && (
        <div className="mx-5 mt-5 p-5 rounded-[18px] text-center" style={{ background: 'rgba(249,92,75,0.08)', border: '1px solid rgba(249,92,75,0.15)' }}>
          <Award size={28} style={{ color: T.CORAL, margin: '0 auto 8px' }} />
          <p className="text-sm font-bold" style={{ color: T.BLACK }}>計劃完成！</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(22,20,21,0.50)' }}>恭喜你完成所有 {totalSessions} 次訓練</p>
        </div>
      )}

      {/* ── WEEK TABS ── */}
      <div className="px-5 mt-6">
        <p className="text-[12px] font-black tracking-[0.2em] mb-3" style={{ color: 'rgba(22,20,21,0.35)' }}>
          訓練週期
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {weeks.map((w, wi) => {
            const isActive = wi === activeWeekTab;
            const weekDone = w.days.every((_, di) => completedSet.has(wi * 10 + di));
            return (
              <motion.button
                key={wi}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveWeekTab(wi)}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all"
                style={isActive ? {
                  background: T.BLACK, color: T.PAPER,
                  boxShadow: '0 4px 16px rgba(22,20,21,0.15)',
                } : {
                  background: weekDone ? 'rgba(249,92,75,0.10)' : T.STONE,
                  color: weekDone ? T.CORAL : 'rgba(22,20,21,0.60)',
                  border: weekDone ? '1px solid rgba(249,92,75,0.20)' : '1px solid transparent',
                }}
              >
                {weekDone && <CheckCircle2 size={10} className="inline mr-1" />}
                第 {w.weekNumber} 週
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── SESSION CARDS ── */}
      <div className="px-5 mt-4 space-y-3">
        <p className="text-sm font-bold mb-1" style={{ color: 'rgba(22,20,21,0.50)' }}>
          {weeks[activeWeekTab]?.name}
        </p>
        {weekSessions.map((day, di) => {
          const globalIdx = activeWeekTab * 10 + di;
          const isDone    = completedSet.has(globalIdx);
          const isNext    = nextSession?.globalIdx === globalIdx;

          return (
            <motion.div
              key={di}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.07 }}
              onClick={() => !isDone && setPreviewSession({ ...day, weekNumber: weeks[activeWeekTab].weekNumber, globalIdx })}
              className="rounded-[18px] overflow-hidden"
              style={{
                background: isDone ? 'rgba(249,92,75,0.06)' : '#FFFFFF',
                border: isDone
                  ? '1px solid rgba(249,92,75,0.15)'
                  : isNext
                    ? `1px solid ${T.CORAL}`
                    : '1px solid rgba(22,20,21,0.06)',
                boxShadow: isDone
                  ? 'none'
                  : isNext
                    ? '0 6px 24px rgba(249,92,75,0.14)'
                    : '0 2px 12px rgba(22,20,21,0.05)',
                cursor: isDone ? 'default' : 'pointer',
              }}
            >
              <div className="flex items-center gap-4 px-4 py-4">
                {/* Day box */}
                <div
                  className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0"
                  style={{
                    background: isDone ? 'rgba(249,92,75,0.12)' : isNext ? T.CORAL : T.STONE,
                    boxShadow: isNext ? '0 4px 14px rgba(249,92,75,0.30)' : 'none',
                  }}
                >
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: isDone ? T.CORAL : isNext ? 'rgba(255,255,255,0.70)' : 'rgba(22,20,21,0.40)' }}>DAY</span>
                  <span className="text-lg font-black leading-none" style={{ color: isDone ? T.CORAL : isNext ? '#fff' : T.BLACK }}>
                    {day.dayNumber}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-black uppercase tracking-wide" style={{ color: isDone ? T.CORAL : T.BLACK }}>
                      {day.weekday}
                    </p>
                    {isNext && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-black" style={{ background: T.CORAL, color: '#fff' }}>
                        NEXT
                      </span>
                    )}
                    {isDone && (
                      <CheckCircle2 size={13} style={{ color: T.CORAL }} />
                    )}
                  </div>
                  <p className="text-[11px] truncate" style={{ color: 'rgba(22,20,21,0.50)' }}>{day.focus}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.40)' }}>
                      <Clock size={9} />{calculateActualDuration(day.exercises)}m
                    </span>
                    <span className="text-[11px]" style={{ color: 'rgba(22,20,21,0.25)' }}>·</span>
                    <span className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.40)' }}>
                      {day.exercises.length} 動作
                    </span>
                  </div>
                </div>

                {/* Right arrow / done */}
                {isDone ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,92,75,0.12)' }}>
                    <CheckCircle2 size={16} style={{ color: T.CORAL }} />
                  </div>
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: isNext ? T.CORAL : T.STONE, boxShadow: isNext ? '0 3px 10px rgba(249,92,75,0.28)' : 'none' }}
                  >
                    <ChevronRight size={16} style={{ color: isNext ? '#fff' : 'rgba(22,20,21,0.45)' }} />
                  </div>
                )}
              </div>

              {/* Progress bar for done sessions */}
              {isDone && (
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(249,92,75,0.15)' }}>
                      <div className="h-full rounded-full" style={{ width: '100%', background: T.CORAL }} />
                    </div>
                    <span className="text-[11px] font-bold" style={{ color: T.CORAL }}>完成</span>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ── SESSION PREVIEW SHEET ── */}
      <AnimatePresence>
        {previewSession && (
          <SessionPreviewSheet
            day={previewSession}
            levelData={levelData}
            onClose={() => setPreviewSession(null)}
            onStart={() => handleStartSession(previewSession)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
