import React, { useState, useMemo, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, BarChart3, Target, CheckCircle2, ChevronRight, ChevronDown, Calendar, Flame, Zap, Award, Lock, Play } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { useNavigate, useLocation } from 'react-router-dom';
// 🌟 匯入剛剛建立的胸肌計劃資料
import { CHEST_PLAN } from '../data/chestPlanData';
import { getUserId } from '../utils/auth';
import { T } from '../utils/theme';
import { findExerciseByName } from '../utils/exerciseDB';
import { ExerciseDetailSheet } from './WorkoutPreviewSheet';

/* ─── 共用小元件：動作縮圖 + kicker（與 FusePlan 一致）─── */
const _thumbCache = {};
const ExerciseThumb = memo(({ name, size = 40 }) => {
  const [url, setUrl] = useState(() => _thumbCache[name] || null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!name || url || _thumbCache[name]) return;
    let dead = false;
    findExerciseByName(name).then(ex => {
      if (dead) return;
      const u = ex?.imageUrls?.[0] || ex?.gifUrl || null;
      if (u) { _thumbCache[name] = u; setUrl(u); }
    }).catch(() => {});
    return () => { dead = true; };
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const radius = Math.round(size * 0.28);
  if (url && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, background: 'rgba(22,20,21,0.06)', border: '1px solid rgba(22,20,21,0.07)' }}>
        <img loading="lazy" decoding="async" src={url} alt={name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: 'rgba(22,20,21,0.05)', border: '1px solid rgba(22,20,21,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Dumbbell size={Math.round(size * 0.38)} color="rgba(22,20,21,0.3)" strokeWidth={2} />
    </div>
  );
});
const Lbl = ({ children, color = 'rgba(22,20,21,0.4)', style = {} }) => (
  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color, ...style }}>{children}</span>
);

/* ─── PALETTE ─── */


/* ─── CMF MATERIALS ─── */
const M = {
  WOOD: `
    linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(0,0,0,0.15) 100%),
    repeating-linear-gradient(to right, #5D3A2D 0px, #5D3A2D 52px, rgba(245,245,240,0.1) 52px, rgba(245,245,240,0.1) 53px),
    #4A2C22
  `,
  WOOD_GRAIN: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")',
  TITANIUM: 'linear-gradient(135deg, #707070 0%, #B8B8B8 45%, #909090 50%, #707070 100%)',
};

/* ─── LEVEL SELECTOR ─── */
const LevelPill = ({ levels, active, onChange }) => (
  <div className="flex gap-3 flex-wrap">
    {Object.values(levels).map((lv) => {
      const isActive = lv.key === active;
      return (
        <motion.button
          key={lv.key}
          whileTap={{ scale: 0.96 }}
          onClick={() => onChange(lv.key)}
          className="px-5 py-3 rounded-[18px] transition-all duration-300 flex flex-col items-start"
          style={isActive ? {
            background: T.BLACK,
            color: T.STONE,
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
          } : {
            background: 'rgba(255,255,255,0.5)',
            color: 'rgba(22,20,21,0.6)',
            border: '1px solid rgba(22,20,21,0.08)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="text-[11px] font-black tracking-wider" style={{ color: isActive ? '#fff' : T.BLACK }}>{lv.label}</span>
          {(lv.labelEn || lv.sub) && (
            <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: isActive ? 'rgba(255,255,255,0.45)' : 'rgba(22,20,21,0.35)' }}>{lv.labelEn || lv.sub}</span>
          )}
        </motion.button>
      );
    })}
  </div>
);

/* ─── INFO CARD ─── */
const InfoCard = ({ icon: Icon, value, label, accent }) => (
  <div
    className="px-5 py-5 rounded-[28px] transition-all relative overflow-hidden"
    style={{
      background: accent ? M.WOOD : 'rgba(255,255,255,0.4)',
      backdropFilter: 'blur(20px)',
      border: accent ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.5)',
      boxShadow: '0 15px 35px rgba(0,0,0,0.04)',
    }}
  >
    {accent && (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: M.WOOD_GRAIN, opacity: 0.3, backgroundSize: '180px' }} />
    )}
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <div
          className="w-10 h-10 rounded-[18px] flex items-center justify-center shadow-inner"
          style={{
            background: accent ? 'rgba(255,255,255,0.12)' : M.TITANIUM,
            color: accent ? T.PAPER : T.BLACK,
            border: accent ? 'none' : '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <Icon size={18} />
        </div>
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent ? T.CORAL : 'rgba(22,20,21,0.2)', boxShadow: accent ? '0 0 8px rgba(249,92,75,0.5)' : 'none' }} />
      </div>
      <p className="text-lg font-serif font-bold italic leading-tight" style={{ color: accent ? T.PAPER : T.BLACK }}>{value}</p>
      <p className="font-black uppercase" style={{ fontSize: 9, letterSpacing: '0.25em', marginTop: 4, opacity: accent ? 0.6 : 0.5, color: accent ? T.PAPER : T.BLACK }}>{label}</p>
    </div>
  </div>
);

/* ─── WEEK ACCORDION ─── */
// 與 FusePlan 一致的動態計劃表週卡
const WeekAccordion = ({ week, weekIdx, isOpen, onToggle, totalWeeks, onTapExercise }) => {
  const isFirst = weekIdx === 0;
  const fmtRest = (r) => {
    if (r == null || r === '') return '';
    const s = String(r);
    return /s$/i.test(s) ? s.toUpperCase() : `${s}S`;
  };
  return (
    <div className="relative mb-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-[18px] flex flex-col items-center justify-center shrink-0"
             style={{ background: isFirst ? T.BLACK : 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.5)' }}>
          <span className="text-[9px] font-black opacity-40 uppercase tracking-tighter" style={{ color: isFirst ? T.STONE : T.BLACK }}>Wk</span>
          <span className="text-xl font-serif font-bold italic leading-none" style={{ color: isFirst ? T.STONE : T.BLACK }}>{week.weekNumber}</span>
        </div>
        <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
      </div>

      <div className="relative">
        <motion.button
          onClick={onToggle}
          className="w-full flex flex-col p-6 rounded-[28px] text-left relative overflow-hidden"
          whileTap={{ scale: 0.98 }}
          style={{
            background: 'rgba(255,255,255,0.5)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.03)',
          }}
        >
          <div className="flex items-center justify-between w-full mb-2">
            <Lbl color={isFirst ? T.CORAL : 'rgba(22,20,21,0.4)'}>Phase Strategy</Lbl>
            <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown size={18} style={{ color: T.BLACK, opacity: 0.3 }} />
            </motion.div>
          </div>
          <p className="text-xl font-serif font-bold italic leading-tight pr-8" style={{ color: T.BLACK }}>{week.name}</p>
          {isFirst && (
            <div className="absolute top-0 right-0 p-3">
              <div className="w-2 h-2 rounded-full" style={{ background: T.CORAL, boxShadow: '0 0 10px rgba(249,92,75,0.5)' }} />
            </div>
          )}
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="space-y-3 pb-4">
                {week.days.map((day, di) => (
                  <div key={di} className="rounded-[28px] p-6 mb-4 mt-4" style={{
                    background: 'rgba(246, 244, 241, 0.98)',
                    boxShadow: '0 12px 35px rgba(0,0,0,0.05)',
                    border: '1px solid rgba(22, 20, 21, 0.08)',
                  }}>
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex flex-col gap-0.5">
                        <Lbl color={T.CORAL} style={{ fontSize: 11 }}>Session {day.dayNumber}</Lbl>
                        <span className="text-lg font-serif font-bold italic" style={{ color: T.BLACK }}>{day.weekday} · {day.focus}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(22,20,21,0.03)', border: '1px solid rgba(22,20,21,0.04)' }}>
                        <Clock size={12} style={{ color: 'rgba(22,20,21,0.4)' }} />
                        <span className="text-[11px] font-black" style={{ color: 'rgba(22,20,21,0.6)' }}>{day.time}m</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {day.exercises.map((ex, ei) => {
                        const isLast = ei === day.exercises.length - 1;
                        return (
                          <div key={ei} onClick={() => onTapExercise && onTapExercise(ex)} className="flex items-center gap-3 py-3 px-2" style={{ borderBottom: isLast ? 'none' : '1px solid rgba(22,20,21,0.05)', cursor: 'pointer' }}>
                            <ExerciseThumb name={ex.name} size={40} />
                            <div className="flex-1 flex flex-col gap-1 min-w-0">
                              <p className="text-[13px] font-bold truncate" style={{ color: T.BLACK }}>{ex.name}</p>
                              {ex.targetLabel && (
                                <div className="inline-flex">
                                  <span style={{ fontSize: 11, fontWeight: 700, background: '#F2F0ED', color: '#5E5A55', padding: '2px 6px', borderRadius: 4, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)', border: '1px solid rgba(22,20,21,0.03)' }}>
                                    {ex.targetLabel}
                                  </span>
                                </div>
                              )}
                              {ex.note && (
                                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.4)' }}>{ex.note}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[11px] font-black" style={{ color: T.BLACK }}>{ex.sets}×{ex.reps}</span>
                              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.4)' }}>{fmtRest(ex.rest)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN — ChestPlanPreviewPageMobile
   ═══════════════════════════════════════════ */
export default function ChestPlanPreviewPageMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  // 🌟 使用胸肌計劃資料
  const plan = location.state?.plan || CHEST_PLAN;
  const defaultLevel = location.state?.defaultLevel || 'beginner';
  const bg = location.state?.bg;

  const [selectedLevel, setSelectedLevel] = useState(defaultLevel);
  const [openWeek, setOpenWeek] = useState(0);
  const [previewEx, setPreviewEx] = useState(null);  // 唯讀動作預覽
  const scheduleRef = useRef(null);

  const levelData = plan.levels[selectedLevel];
  const [selectedDaysPerWeek, setSelectedDaysPerWeek] = useState(levelData.recommendedDays || 2);

  // When level changes, default to its recommended days
  const handleLevelChange = (lv) => {
    setSelectedLevel(lv);
    const newLvData = plan.levels[lv];
    setSelectedDaysPerWeek(newLvData.recommendedDays || 2);
    setOpenWeek(0);
  };

  // Flatten all days from the static periodization
  const allDays = useMemo(() => {
    let days = [];
    levelData.weeks.forEach(w => {
      w.days.forEach(d => days.push(d));
    });
    return days;
  }, [levelData]);

  // Dynamically chunk them into weeks based on selectedDaysPerWeek
  const dynamicWeeks = useMemo(() => {
    const weeksArr = [];
    for (let i = 0; i < allDays.length; i += selectedDaysPerWeek) {
      weeksArr.push({
        weekNumber: Math.floor(i / selectedDaysPerWeek) + 1,
        // Fallback name if we don't have enough periodization phases
        name: levelData.weeks[Math.min(Math.floor(i / selectedDaysPerWeek), levelData.weeks.length - 1)]?.name || '接續訓練',
        days: allDays.slice(i, i + selectedDaysPerWeek)
      });
    }
    return weeksArr;
  }, [allDays, selectedDaysPerWeek, levelData]);

  /* Computed stats based on dynamic structure */
  const totalExercises = useMemo(() => {
    const unique = new Set();
    allDays.forEach(d => d.exercises.forEach(e => unique.add(e.nameEn)));
    return unique.size;
  }, [allDays]);

  const totalSessions = allDays.length;

  return (
    <div className="min-h-[100dvh] pb-40" style={{ background: T.PEBBLE }}>

      {/* ── HERO SECTION（與 FusePlan 統一）── */}
      <div className="relative h-[420px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: bg ? (bg.includes('url') ? bg : `url(${bg})`) : '#161415',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {!bg && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08) 0%, transparent 70%)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(22,20,21,0.3) 0%, rgba(22,20,21,0.7) 60%, rgba(22,20,21,1) 100%)' }} />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 pt-16 z-10">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(-1)}
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <ArrowLeft size={20} style={{ color: T.PAPER }} />
          </motion.button>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Calendar size={12} color="white" />
            <span className="text-[9px] font-black text-white tracking-[0.2em] uppercase">{plan.duration} DAYS</span>
          </div>
        </div>

        {/* Title block */}
        <div className="absolute bottom-0 left-0 right-0 px-8 pb-12 z-10">
          <p className="font-black uppercase" style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>PROGRAM DOSSIER</p>
          <h1
            className="text-[32px] font-bold leading-[1.1] tracking-tight pr-10 mb-4"
            style={{ color: T.PAPER, fontFamily: '"Tenor Sans", sans-serif' }}
          >
            {plan.name}
          </h1>
          <div className="flex items-center gap-3">
            <div className="w-8 h-0.5" style={{ background: T.CORAL }} />
            <p className="text-[9px] font-black tracking-widest uppercase" style={{ color: 'rgba(246,244,241,0.6)' }}>
              {plan.bodyPartLabel?.toUpperCase() || 'CHEST'} · {levelData.label} · {selectedDaysPerWeek}D/WK
            </p>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="px-7 -mt-10 relative z-10">

        {/* Dossier card — SYSTEM SPLIT STRATEGY（與 FusePlan 統一）*/}
        <div
          className="rounded-[36px] p-8 mb-8 relative overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 24px 48px -18px rgba(32,32,32,0.22)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: M.TITANIUM }} />
          <p className="font-black uppercase" style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.15em', color: 'rgba(22,20,21,0.5)', display: 'block', marginBottom: 12 }}>System Split Strategy</p>
          <p className="text-base font-medium leading-relaxed italic" style={{ color: 'rgba(22,20,21,0.8)', fontFamily: 'var(--font-display)' }}>
            "{plan.description}"
          </p>
          <div className="flex flex-wrap gap-2.5 mt-8">
            {plan.tags.map((tag, i) => (
              <span
                key={i}
                className="px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest uppercase"
                style={{ background: T.BLACK, color: T.STONE }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* ── DIFFICULTY（選擇等級）── */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
            <span className="font-black uppercase" style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', color: 'rgba(22,20,21,0.4)' }}>Difficulty</span>
          </div>
          <LevelPill levels={plan.levels} active={selectedLevel} onChange={handleLevelChange} />
        </div>

        {/* ── FREQUENCY（選擇天數）── */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
            <span className="font-black uppercase" style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', color: 'rgba(22,20,21,0.4)' }}>Frequency</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,92,75,0.1)', color: T.CORAL }}>
              {levelData.recommendedDaysLabel}
            </span>
          </div>
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5, 6].map(days => {
              const isActive = days === selectedDaysPerWeek;
              return (
                <motion.button
                  key={days}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { setSelectedDaysPerWeek(days); setOpenWeek(0); }}
                  className="w-12 h-12 rounded-[18px] flex items-center justify-center font-black transition-all duration-300"
                  style={isActive ? {
                    background: T.BLACK,
                    color: T.STONE,
                    boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                  } : {
                    background: 'rgba(255,255,255,0.4)',
                    border: '1px solid rgba(255,255,255,0.6)',
                    color: 'rgba(22,20,21,0.3)',
                  }}
                >
                  <span className="text-sm">{days}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ── 計劃詳情（與 FusePlan 統一）── */}
        <div className="flex items-center gap-3 mb-6 mt-2">
          <h2 className="text-3xl font-serif font-bold italic tracking-tight" style={{ color: T.BLACK }}>計劃詳情<span style={{ color: T.CORAL }}>.</span></h2>
          <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <InfoCard icon={Calendar} value={`${dynamicWeeks.length} 週`} label="Training Cycle" accent />
          <InfoCard icon={BarChart3} value={levelData.label} label="Intensity Level" />
          <InfoCard icon={Dumbbell} value={levelData.equipment[0] + '等'} label="Primary Gear" />
          <InfoCard icon={Target} value={levelData.targetArea} label="Biological Focus" accent />
        </div>

        {/* Metric bar — 與 FusePlan 一致：深金屬底 + serif italic 數字 */}
        <div
          className="flex items-center justify-around py-8 rounded-[36px] mb-10 relative overflow-hidden"
          style={{
            background: M.WOOD,
            boxShadow: '0 30px 60px rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: M.WOOD_GRAIN, opacity: 0.18, backgroundSize: '180px' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08) 0%, transparent 70%)' }} />
          <div className="text-center relative z-10">
            <p className="text-3xl font-serif font-bold italic leading-none" style={{ color: T.CORAL }}>{totalSessions}</p>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mt-2" style={{ color: 'rgba(246,244,241,0.4)' }}>Sessions</p>
          </div>
          <div className="h-10 w-px relative z-10" style={{ background: 'rgba(246,244,241,0.15)' }} />
          <div className="text-center relative z-10">
            <p className="text-3xl font-serif font-bold italic leading-none" style={{ color: T.PAPER }}>{totalExercises}</p>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mt-2" style={{ color: 'rgba(246,244,241,0.4)' }}>Movements</p>
          </div>
          <div className="h-10 w-px relative z-10" style={{ background: 'rgba(246,244,241,0.15)' }} />
          <div className="text-center relative z-10">
            <p className="text-3xl font-serif font-bold italic leading-none" style={{ color: T.STONE }}>{levelData.durationPerSession}</p>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mt-2" style={{ color: 'rgba(246,244,241,0.4)' }}>Mins/Avg</p>
          </div>
        </div>

        {/* ── PERIODIZATION ── */}
        <div className="flex items-center gap-3 mb-6 mt-2">
          <h2 className="text-3xl font-serif font-bold italic tracking-tight" style={{ color: T.BLACK }}>訓練週期</h2>
          <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
        </div>
        <div className="space-y-3 mb-6">
          {Object.values(levelData.periodization).map((phase, pi) => (
            <div
              key={pi}
              className="flex gap-3 p-4 rounded-[18px]"
              style={{
                background: pi === 0 ? 'rgba(249,92,75,0.06)' : 'rgba(22,20,21,0.03)',
                border: pi === 0 ? '1px solid rgba(249,92,75,0.12)' : '1px solid rgba(22,20,21,0.06)',
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  background: pi === 0 ? T.CORAL : T.PEBBLE,
                  color: pi === 0 ? '#fff' : T.BLACK,
                }}
              >
                <span className="text-xs font-black">{pi + 1}</span>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: T.BLACK }}>{phase.name}</p>
                <p className="text-[11px] font-medium mt-0.5" style={{ color: 'rgba(22,20,21,0.50)' }}>{phase.focus}</p>
                <div className="flex gap-3 mt-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: T.STONE, color: T.BLACK }}>
                    {phase.reps}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: T.STONE, color: T.BLACK }}>
                    {phase.intensity}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── BENEFITS ── */}
        <h2 className="text-lg font-serif font-bold mb-3" style={{ color: T.BLACK }}>您可以獲得的成果</h2>
        <div
          className="rounded-[18px] p-5 mb-6"
          style={{
            background: '#FFFFFF',
            boxShadow: '0 2px 16px rgba(22,20,21,0.05)',
            border: '1px solid rgba(22,20,21,0.06)',
          }}
        >
          <div className="space-y-3">
            {levelData.benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 size={16} style={{ color: T.CORAL, marginTop: 2, flexShrink: 0 }} />
                <p className="text-sm" style={{ color: T.BLACK }}>{b}</p>
              </div>
            ))}
          </div>
          <div
            className="mt-4 pt-3 flex items-center gap-2"
            style={{ borderTop: '1px solid rgba(22,20,21,0.06)' }}
          >
            <Award size={14} style={{ color: T.EMBER }} />
            <p className="text-xs font-bold" style={{ color: T.EMBER }}>
              預期成效：{levelData.expectedGain}
            </p>
          </div>
        </div>

        {/* ── TRAINING SCHEDULE ── */}
        <div ref={scheduleRef}>
          <h2 className="text-lg font-serif font-bold mb-1" style={{ color: T.BLACK }}>動態計劃表 ({selectedDaysPerWeek}天/週)</h2>
          <p className="text-[11px] mb-4" style={{ color: 'rgba(22,20,21,0.40)' }}>
            系統已根據您的天數選擇自動重組課表
          </p>

          <div className="space-y-0">
            {dynamicWeeks.map((week, wi) => (
              <WeekAccordion
                key={wi}
                week={week}
                weekIdx={wi}
                isOpen={openWeek === wi}
                onToggle={() => setOpenWeek(openWeek === wi ? -1 : wi)}
                totalWeeks={dynamicWeeks.length}
                onTapExercise={setPreviewEx}
              />
            ))}
          </div>
        </div>

      </div>

      {/* ── BOTTOM CTA ── */}
      <div
        className="fixed bottom-0 left-0 right-0 px-5 py-4 z-50"
        style={{
          background: 'linear-gradient(transparent, rgba(246,244,241,0.95) 30%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          className="w-full py-4 rounded-[18px] flex items-center justify-center gap-2"
          style={{
            background: `linear-gradient(135deg, ${T.CORAL} 0%, ${T.EMBER} 100%)`,
            color: '#fff',
            boxShadow: '0 8px 32px rgba(249,92,75,0.35)',
          }}
          onClick={() => {
            // Persist as current active plan
            try {
                const userId = getUserId();
                /* ⚠ 這裡以前直接覆蓋 currentPlan_<uid>，而且寫進去的物件沒有 weeks
                   —— 使用者原本的四週課表會被一個空殼取代，今日議程與中控台
                   都會變成「還沒排」。改成保留原本課表的 weeks 與起始日，
                   只把專項的識別資訊併上去。 */
                let prev = null;
                try { prev = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null'); } catch { /* */ }
                const currentPlanData = {
                    ...(prev || {}),
                    id: plan.id,
                    name: plan.name,
                    selectedLevel: selectedLevel,
                    levelData: levelData,
                    startTime: Date.now(),
                    startDate: prev?.startDate || prev?.start_date || prev?.created_at || null,
                    weeks: Array.isArray(prev?.weeks) ? prev.weeks : [],
                };
                localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(currentPlanData));
                localStorage.setItem('currentPlan_user', JSON.stringify(currentPlanData)); // Fallback
            } catch (e) { console.error("Failed to save current plan", e); }

            navigate('/plan-tracking', {
              state: { plan, selectedLevel, defaultLevel: selectedLevel, levelData }
            });
          }}
        >
          {(() => {
            // PlanTrackingPageMobile writes 'currentPlan_user' when the plan starts
            let isStarted = false;
            try {
              const saved = localStorage.getItem('currentPlan_user');
              if (saved) {
                const parsed = JSON.parse(saved);
                isStarted = parsed.id === plan.id;
              }
            } catch(e) {}
            return (
              <>
                <Play size={18} fill="white" />
                <span className="text-sm font-bold tracking-wide">
                  {isStarted ? '繼續計劃' : '開始這個計劃'}
                </span>
              </>
            );
          })()}
        </motion.button>
      </div>

      {/* 唯讀動作預覽（點動作列表跳出）*/}
      <AnimatePresence>
        {previewEx && <ExerciseDetailSheet key="preview" ex={previewEx} onClose={() => setPreviewEx(null)} />}
      </AnimatePresence>

    </div>
  );
}
