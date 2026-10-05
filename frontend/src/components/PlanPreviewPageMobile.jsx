import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { haptic } from '../utils/haptics';
import { pressProps } from '../utils/nutritionMotion';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { ArrowLeft, Clock, BarChart3, Target, CheckCircle2, Check, ChevronRight, ChevronDown, Calendar, Footprints, Flame, Zap, Award, Lock, Play, Sparkles, Edit2, GripVertical, Plus, Trash2, X, Save, Pencil, Search, RotateCcw } from 'lucide-react';
import { useMembership } from '../utils/membership';
import { isMemberCourse } from '../utils/memberLimits';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { useNavigate, useLocation } from 'react-router-dom';
// 🌟 匯入計劃資料與融合引擎
import { SHOULDER_ARM_PLAN } from '../data/shoulderArmPlanData';
import { fuseWorkoutPlans } from '../utils/planFusionEngine';
import generateUnifiedPlan from '../utils/UnifiedTrainingEngine';
import adaptPresetPlan from '../utils/adaptPresetPlan';
import { findExerciseByName } from '../utils/exerciseDB';
import toZhExerciseName from '../utils/exerciseNameZh';
import { getGlobalExerciseLibrary, searchGlobalExercises } from '../data/globalExerciseRegistry';
import { T } from '../utils/theme';
import { getUserId } from '../utils/auth';
import { confirmDialog, toast } from '../utils/toast';
import apiClient from '../api/client';
import { describeCourseImpact, impactMessage, applyCourseCardioPlan } from '../utils/courseApply';
import { readRunCommitment, focusTitle, WEEKDAY_LABEL } from '../utils/trainingFocus';
import { buildWeeklyAgenda, loadCachedBricks } from '../utils/dailyAgenda';
import { selectCourseLevels, prepareCourseProgram, activateProgram, newProgramId, withExistingRunSchedule } from '../utils/trainingProgram';
import { recordFirst } from '../utils/momentEngine';
import ExercisePlanEditModal from './ExercisePlanEditModal';
import { ExerciseDetailSheet } from './WorkoutPreviewSheet';

/* ─── PALETTE ─── */


/* ─── CMF MATERIALS ─── */
const M = {
  WOOD: `
    linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 45%, rgba(0,0,0,0.18) 100%),
    linear-gradient(to bottom, #3B241C 0%, #2A1812 100%)
  `,
  WOOD_GRAIN: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")',
  // 噴砂鈦金屬 (Sandblasted Titanium)
  TITANIUM: 'linear-gradient(135deg, #707070 0%, #B8B8B8 45%, #909090 50%, #707070 100%)',
  // 拉絲鈦金屬 (Brushed Titanium)
  BRUSHED: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 2px), linear-gradient(135deg, #8A8A8A 0%, #C0C0C0 50%, #8A8A8A 100%)',
  // Pebble 鈦金屬 (Pebble Titanium)
  PEBBLE_TITANIUM: 'linear-gradient(180deg, #E6E0D8 0%, #CFC6B8 45%, #BDB2A3 55%, #A19688 100%)',
  // Coral 鈦金屬 (Coral Titanium)
  CORAL_TITANIUM: 'linear-gradient(135deg, #FF8A7A 0%, #F95C4B 45%, #E84A3A 55%, #D94030 100%)',
};

/* ─── EXERCISE IMAGE THUMBNAIL ─── */
const thumbCache = {};
const ExerciseThumb = memo(({ name, nameEn, size = 40 }) => {
  // 🔧 修復「動作沒有圖片」：圖庫(free-exercise-db)是英文資料庫，中文名翻譯命中率低。
  //    優先用動作自帶的 nameEn (英文) 查詢，命中率大幅提升；查無再退回中文名。
  const cacheKey = nameEn || name;
  const [url, setUrl]   = useState(() => thumbCache[cacheKey] || null);
  const [err, setErr]   = useState(false);

  useEffect(() => {
    if (!cacheKey || url || thumbCache[cacheKey]) return;
    let dead = false;
    (async () => {
      try {
        let ex = nameEn ? await findExerciseByName(nameEn) : null;
        if (!(ex?.imageUrls?.[0] || ex?.gifUrl)) ex = await findExerciseByName(name);
        if (dead) return;
        const u = ex?.imageUrls?.[0] || ex?.gifUrl || null;
        if (u) { thumbCache[cacheKey] = u; setUrl(u); }
      } catch { /* 靜默退回 placeholder */ }
    })();
    return () => { dead = true; };
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const radius = Math.round(size * 0.28);

  if (url && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, background: 'rgba(22,20,21,0.06)', border: '1px solid rgba(22,20,21,0.07)' }}>
        <img loading="lazy" decoding="async" src={url} alt={name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  // Fallback: small dumbbell icon
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: 'rgba(22,20,21,0.05)', border: '1px solid rgba(22,20,21,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Dumbbell size={Math.round(size * 0.38)} color="rgba(22,20,21,0.3)" strokeWidth={2} />
    </div>
  );
});

// 動作顯示名：已是中文就保留策展好名；英文才翻成中文。並把單獨的「下拉」統一顯示為「滑輪下拉」（更明確）。
const ZH_DISP_ALIAS = { '下拉': '滑輪下拉' };
const zhDisp = (ex) => {
  const n = ex?.name;
  const base = (n && /[\u4e00-\u9fff]/.test(n)) ? n : toZhExerciseName(ex?.nameEn || n);
  return ZH_DISP_ALIAS[base] || base || '';
};

const Lbl = ({ children, color = 'rgba(22,20,21,0.4)', style = {} }) => (
  <span style={{ 
    fontSize: 9, 
    fontWeight: 900, 
    letterSpacing: '0.25em', 
    textTransform: 'uppercase', 
    color,
    ...style 
  }}>
    {children}
  </span>
);

const RISE = [0.16, 1, 0.3, 1];

/* 把「3」「12」「90」寫成使用者的話：3 組 × 12 下 · 休 90 秒。
   ⚠️ 棒式這類動作的 reps 其實是秒數（資料靠 note 標「單位為秒」），
      直接印「30 下」會叫人做 30 次棒式。 */
const HOLD_RE = /plank|棒式|side bridge|撐體/i;
const isTimeBased = (ex) =>
  HOLD_RE.test(String(ex?.name || '') + String(ex?.nameEn || '')) ||
  /單位為秒|\d+\s*秒/.test(String(ex?.note || ''));

const prescription = (ex) => {
  if (!ex) return '';
  const unit = isTimeBased(ex) ? '秒' : '下';
  const head = [
    ex.sets ? `${ex.sets} 組` : null,
    (ex.reps != null && ex.reps !== '') ? `× ${ex.reps} ${unit}` : null,
  ].filter(Boolean).join(' ');
  const rest = typeof ex.rest === 'number'
    ? (ex.rest > 0 ? `休 ${ex.rest} 秒` : '不休息')
    : (ex.rest ? String(ex.rest).replace(/^(\d+)\s*s?$/i, '休 $1 秒') : '');
  return [head, rest].filter(Boolean).join(' · ');
};

const LEVEL_ZH = { beginner: '新手', intermediate: '中階', advanced: '進階' };

/* 區塊標題：一條細線 ＋ 一個中文標。取代原本散落各處的英文 <Lbl>Difficulty</Lbl>。 */
const SectionTitle = ({ children }) => (
  <div className="flex items-center gap-3 mb-4">
    <h3 className="text-[15px] font-bold shrink-0" style={{ color: 'rgba(22,20,21,0.55)' }}>{children}</h3>
    <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
  </div>
);

/* ─── DIFFICULTY LEVELS CONFIG ─── */
const DIFFICULTY_LEVELS = [
  /* ⚠️ 這裡原本每一階都寫死一句 desc（「每日 4 個動作、3 組、12–15 下」）。
     那是第二份真相：翹臀新手的正式動作是 5 個、鋼骨基石也是 5 個，
     而且翹臀還多 3 個啟動熱身 —— 畫面上的說明跟展開後的課表對不起來。
     說明改由 planFacts 從課表本身算出來，這裡只留 key 與中文名。
     labelEn（BASIC/ADV/PRO）一併移除：同一顆鈕上用 9px 英文重講一次中文。 */
  { key: 'beginner',     label: '新手', setsMultiplier: 0 },
  { key: 'intermediate', label: '中階', setsMultiplier: 1 },
  { key: 'advanced',     label: '進階', setsMultiplier: 2 },
];

/* ─── TRAINING STYLES CONFIG ─── */
const TRAINING_STYLES = [
  {
    key: 'bodybuilding',
    label: '健美',
    labelEn: 'Bodybuilding',
    sub: '高容量 · 8–12次',
    icon: Flame,
    accent: '#F95C4B',
    desc: '最大化肌肥大：高容量、短休息。動作以 8–12RM 為主，組間休息 80–90 秒。',
  },
  {
    key: 'powerlifting',
    label: '健力',
    labelEn: 'Strength',
    sub: '低次數 · 3–5次',
    icon: Award,
    accent: '#B8960C',
    desc: '突破 PR：5/3/1 方法論，複合動作為主，次數 3–5RM，組間休息 3–5 分鐘， ATP 完整恢復。',
  },
];

/* LevelPill 與 InfoCard 已移除 —— 前者是 9px 大寫英文膠囊，後者是 serif 斜體
   ＋ 四個英文標籤（Training Cycle / Intensity Level / Primary Gear /
   Biological Focus）的 2×2 格。兩者都不再被任何地方使用。 */

/* ─── SubPart → 中文標籤 對照 ─── */
const SUBPART_ZH = {
  chest_upper: '上胸', chest_mid: '中胸', chest_lower: '下胸',
  delt_front: '前三角', delt_side: '側三角', delt_rear: '後三角',
  back_width: '背部闊度', back_thickness: '背部厚度',
  biceps: '二頭肌', triceps: '三頭肌',
  quads: '股四頭', glutes_hams: '臀腿', calves: '小腿',
  core: '核心', other: '全身',
};
const exToTargetLabel = (ex) => SUBPART_ZH[ex.subPart] || SUBPART_ZH[ex.bodyCategory || ex.cat] || ex.subPart || '';

/* ─── 跑步 session 中文名（混合課 weeks[].runPlan[].subtype）───
   對應 leanLightPlanData / hyroxPlanData 裡 R(subtype, km, note) 的五種處方。
   ⚠ 這個表一定要留在模組層級：WeekAccordion 是模組層級元件，
     之前漏了宣告 → 混合課展開週卡時 ReferenceError → 整頁掉到 error boundary。 */
const RUN_ZH = {
  recovery: '恢復跑',
  easy: '輕鬆跑',
  long: '長跑',
  tempo: '節奏跑',
  interval: '間歇跑',
};


/* ─── DRAGGABLE EXERCISE ROW (edit mode) ─── */
const DraggableExRow = ({ ex, onEdit, onDelete, onTap }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={ex}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 px-3 py-3 rounded-[18px]"
      style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(22,20,21,0.07)', marginBottom: 8, cursor: 'default', touchAction: 'none' }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={e => controls.start(e)}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing px-1"
        style={{ color: 'rgba(22,20,21,0.25)', touchAction: 'none' }}
      >
        <GripVertical size={18} />
      </div>
      {/* Thumb + Info（可點開動作資訊） */}
      <div
        onClick={() => onTap && onTap(ex)}
        className="flex items-center gap-3 flex-1 min-w-0"
        style={{ cursor: 'pointer' }}
      >
      <ExerciseThumb name={ex.name} nameEn={ex.nameEn} size={36} />
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold truncate" style={{ color: T.BLACK }}>{zhDisp(ex)}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {(ex.targetLabel || ex.target) && (
            <span style={{ fontSize: 11, fontWeight: 700, background: '#F2F0ED', color: '#5E5A55', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(22,20,21,0.04)' }}>
              {ex.targetLabel || ex.target}
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.45)' }}>{ex.sets}×{ex.reps}</span>
          {ex.rest && <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.4)' }}>{typeof ex.rest === 'number' ? `休 ${ex.rest} 秒` : ex.rest}</span>}
        </div>
      </div>
      </div>
      {/* Edit */}
      <motion.button {...pressProps('icon')}
 onClick={() => onEdit(ex)}
 className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
 style={{ background: 'rgba(22,20,21,0.05)' }}
 >
        <Pencil size={13} style={{ color: 'rgba(22,20,21,0.45)' }} />
      </motion.button>
      {/* Delete */}
      <motion.button {...pressProps('icon')}
 onClick={() => onDelete(ex)}
 className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
 style={{ background: 'rgba(249,92,75,0.08)' }}
 >
        <Trash2 size={13} style={{ color: T.CORAL }} />
      </motion.button>
    </Reorder.Item>
  );
};

/* ─── WEEK ACCORDION ─── */
const WeekAccordion = ({
  week, weekIdx, isOpen, onToggle, totalWeeks, trainingStyle, difficultyLevel,
  editMode = false, onEditExercise, onAddExercise, onDeleteExercise, onReorderExercises,
  onExerciseTap, userRunBricks = [],
}) => {
  const isFirst = weekIdx === 0;
  return (
    <div className="relative mb-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-[18px] flex flex-col items-center justify-center shrink-0" 
             style={{ background: isFirst ? T.BLACK : 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.5)' }}>
          <span className="text-[12px] font-bold opacity-45" style={{ color: isFirst ? T.STONE : T.BLACK }}>週</span>
          <span className="text-[19px] font-semibold leading-none" style={{ color: isFirst ? T.STONE : T.BLACK, fontVariantNumeric: 'tabular-nums' }}>{week.weekNumber}</span>
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
            boxShadow: '0 10px 30px rgba(0,0,0,0.03)'
          }}
        >
          <div className="flex items-center justify-between w-full mb-2">
            <span style={{ fontSize: 12, fontWeight: 800, color: isFirst ? T.CORAL : 'rgba(22,20,21,0.42)' }}>
              第 {week.weekNumber || weekIdx + 1} 週{isFirst ? ' · 這週' : ''}
            </span>
            <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown size={18} style={{ color: T.BLACK, opacity: 0.3 }} />
            </motion.div>
          </div>
          <p className="text-[19px] font-bold leading-tight pr-8" style={{ color: T.BLACK }}>{week.name}</p>
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
                {/* ═══ 本週怎麼排 ═══
                    ⚠️ 這一區原本自己寫了一套排法（重訓照課表的 calendarDay，
                       跑步用 preferEmpty／preferDouble 塞空格）。中控台與首頁
                       走的是 dailyAgenda.buildWeeklyAgenda —— 重訓用
                       DEFAULT_STRENGTH_SPREAD 鋪開、跑步避開腿日隔天、長跑優先
                       週六。兩套算出來的星期根本不一樣：這裡說週一週四，
                       按下開始之後中控台顯示的是另一組日子。

                       現在改成呼叫同一支函式，preview 與中控台由建構上就一致。
                       跑步來源兩種都吃：課程自己帶處方（燃脂輕跑／HYROX）就用
                       它的，掛載型（跑者護甲）就用使用者自己的跑步計劃。 */}
                {(() => {
                  const courseRuns = (week.runPlan || []).map((r, i) => ({
                    brick_id: `course_w${weekIdx}_r${i}`,
                    type: r.subtype, distance_km: r.distance_km, rpe: r.rpe,
                  }));
                  const bricks = courseRuns.length ? courseRuns : (userRunBricks || []);
                  const agenda = buildWeeklyAgenda({
                    plan: { weeks: [{ days: week.days || [] }] },
                    activeWeek: 1,
                    cardioBricks: bricks,
                  });
                  const liftCount = agenda.filter(d => d.strength).length;
                  const runCount = agenda.filter(d => d.run).length;
                  if (!liftCount && !runCount) return null;
                  const doubles = agenda.filter(d => d.strength && d.run).length;
                  const km = agenda.reduce((a, d) => a + (Number(d.run?.distance_km) || 0), 0);

                  return (
                    <div className="rounded-[24px] p-5 mb-4 mt-4" style={{
                      background: 'rgba(246,244,241,0.98)', border: '1px solid rgba(22,20,21,0.08)',
                      boxShadow: '0 12px 35px rgba(0,0,0,0.05)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span style={{ fontSize: 12, fontWeight: 800, color: T.CORAL }}>這週</span>
                        <span className="text-[12px] font-bold" style={{ color: 'rgba(22,20,21,0.55)' }}>
                          重訓 {liftCount} 天{runCount ? ` · 跑步 ${runCount} 趟` : ''}
                          {km > 0 ? ` · ${Math.round(km * 10) / 10} km` : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-7 gap-1.5">
                        {WEEKDAY_LABEL.map((wd, i) => {
                          const d = agenda[i];
                          const both = d.strength && d.run;
                          return (
                            <div key={wd} className="flex flex-col gap-1">
                              <div className="text-[12px] font-black text-center"
                                   style={{ color: 'rgba(22,20,21,0.4)' }}>{wd}</div>
                              <div className="rounded-[9px] flex flex-col gap-1 p-1"
                                   style={{ minHeight: 62, background: 'rgba(22,20,21,0.03)' }}>
                                {d.strength && (
                                  <div className="rounded-[6px] px-0.5 py-1 text-center flex-1"
                                       style={{ background: 'rgba(22,20,21,0.08)' }}>
                                    <div className="text-[11px] font-black leading-none" style={{ color: T.BLACK }}>重訓</div>
                                    {!both && (
                                      <div className="text-[11px] font-bold leading-tight mt-0.5 truncate"
                                           style={{ color: 'rgba(22,20,21,0.6)' }}>{focusTitle(d.strength.focus)}</div>
                                    )}
                                  </div>
                                )}
                                {d.run && (
                                  <div className="rounded-[6px] px-0.5 py-1 text-center flex-1"
                                       style={{ background: 'rgba(249,92,75,0.12)' }}>
                                    <div className="text-[11px] font-black leading-none" style={{ color: T.CORAL }}>跑步</div>
                                    {!both && (
                                      <div className="text-[11px] font-bold leading-tight mt-0.5 truncate"
                                           style={{ color: 'rgba(22,20,21,0.6)' }}>
                                        {d.run.distance_km ? `${d.run.distance_km}K` : (RUN_ZH[d.run.type] || '跑步')}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {!d.strength && !d.run && (
                                  <div className="text-[11px] font-bold text-center flex-1 flex items-center justify-center"
                                       style={{ color: 'rgba(22,20,21,0.28)' }}>休息</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {doubles > 0 && (
                        <p className="text-[12px] font-bold mt-3" style={{ color: 'rgba(22,20,21,0.5)' }}>
                          有 {doubles} 天重訓跟跑步同一天，先重訓、隔 4 小時再跑
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* ═══ 跑步 session 卡（與重訓卡同級呈現）═══ */}
                {(week.runPlan || []).map((r, ri) => (
                  <div key={`run-${ri}`} className="rounded-[28px] p-6 mb-4 mt-4" style={{
                    background: 'rgba(249,92,75,0.055)', boxShadow: '0 12px 35px rgba(0,0,0,0.05)',
                    border: '1px solid rgba(249,92,75,0.22)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col gap-0.5">
                        <span style={{ fontSize: 12, fontWeight: 800, color: T.CORAL }}>第 {ri + 1} 趟跑步</span>
                        <span className="text-[17px] font-bold" style={{ color: T.BLACK }}>
                          {r.distance_km} 公里 · {RUN_ZH[r.subtype] || r.subtype}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                           style={{ background: 'rgba(249,92,75,0.10)', border: '1px solid rgba(249,92,75,0.2)' }}>
                        <span className="text-[12px] font-bold" style={{ color: T.CORAL }}>{String(r.rpe || '').replace(/RPE/i, '體感').trim() || '依體感'}</span>
                      </div>
                    </div>
                    <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.62)' }}>
                      {r.note || '照著配速跑完即可，不用追速度。'}
                      {Number.isFinite(r.pace_offset_sec) && (
                        <span className="block mt-1" style={{ color: 'rgba(22,20,21,0.45)' }}>
                          配速：比你的 5K 基準{r.pace_offset_sec >= 0 ? '慢' : '快'} {Math.abs(r.pace_offset_sec)} 秒/公里
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {(week.days || []).map((day, di) => (
                  <div key={di} className="rounded-[28px] p-6 mb-4 mt-4" style={{ 
                    background: 'rgba(246, 244, 241, 0.98)', /* Paper Finish */
                    boxShadow: '0 12px 35px rgba(0,0,0,0.05)', 
                    border: '1px solid rgba(22, 20, 21, 0.08)' 
                  }}>
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex flex-col gap-0.5">
                        <span style={{ fontSize: 12, fontWeight: 800, color: T.CORAL }}>第 {day.dayNumber} 堂</span>
                        <span className="text-[17px] font-bold" style={{ color: T.BLACK }}>
                          {day.calendarDay ? `週${['一','二','三','四','五','六','日'][day.calendarDay - 1]} · ` : ''}
                          <span style={{ color: T.CORAL, fontWeight: 800, fontSize: 13 }}>重訓</span>
                          {' · '}{day.focus}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(22,20,21,0.03)', border: '1px solid rgba(22,20,21,0.04)' }}>
                        <Clock size={12} style={{ color: 'rgba(22,20,21,0.4)' }} />
                        <span className="text-[11px] font-black" style={{ color: 'rgba(22,20,21,0.6)' }}>{day.time}m</span>
                      </div>
                    </div>

                    {/* ── EDIT MODE: draggable exercise list ── */}
                    {editMode ? (
                      <div>
                        <Reorder.Group
                          as="div"
                          axis="y"
                          values={day.exercises || []}
                          onReorder={(newOrder) => onReorderExercises && onReorderExercises(weekIdx, di, newOrder)}
                          style={{ padding: 0, margin: 0 }}
                        >
                          {(day.exercises || []).map((ex, ei) => (
                            <DraggableExRow
                              key={ex._uid || ex.name + ei}
                              ex={ex}
                              onEdit={(exData) => onEditExercise && onEditExercise(weekIdx, di, ei, exData)}
                              onDelete={(exData) => onDeleteExercise && onDeleteExercise(weekIdx, di, ei)}
                              onTap={(exData) => onExerciseTap && onExerciseTap(exData)}
                            />
                          ))}
                        </Reorder.Group>
                        {/* Add exercise button */}
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => onAddExercise && onAddExercise(weekIdx, di)}
                          className="w-full mt-2 py-3 rounded-[18px] flex items-center justify-center gap-2 font-bold text-sm"
                          style={{ background: 'rgba(249,92,75,0.07)', border: '1.5px dashed rgba(249,92,75,0.35)', color: T.CORAL }}
                        >
                          <Plus size={15} />
                          新增動作
                        </motion.button>
                      </div>
                    ) : (

                    <div className="space-y-4">
                      {(() => {
                        /* ⚠️ 啟動熱身原本跟正式動作混在同一條清單裡，沒有任何標示。
                           翹臀新手第一天因此長這樣：橋式、蚌殼式…（熱身）…橋式、蚌殼式（正式），
                           同一個動作在同一天出現兩次，使用者只會覺得課表排錯了。
                           熱身自己一區、標清楚，正式動作才從 1 開始數。 */
                        const allEx = day.exercises || [];
                        const warmupList = allEx.filter(e => e.isWarmup || e.warmup);
                        const exList = allEx.filter(e => !(e.isWarmup || e.warmup));
                        const groups = [];
                        let idx = 0;
                        while (idx < exList.length) {
                          const ex = exList[idx];
                          // v9.1: use supersetId (new engine field)
                          const ssId = ex.supersetId || ex.supersetGroup;
                          if (ssId) {
                            const pair = [];
                            while (idx < exList.length && (exList[idx].supersetId || exList[idx].supersetGroup) === ssId) {
                              pair.push(exList[idx]);
                              idx++;
                            }
                            groups.push({ type: 'superset', pair, ssId, supersetType: pair[0]?.supersetType });
                          } else {
                            groups.push({ type: 'standalone', ex });
                            idx++;
                          }
                        }

                        let ssCounter = 0;
                        /* 正式動作的流水號（超級組整組算一個號碼，裡面再分 A/B） */
                        let seqCounter = 0;
                        const mainSeq = () => ++seqCounter;
                        const warmupBlock = warmupList.length ? (
                          <div key="warmup" className="mb-3 px-4 py-3.5 rounded-[18px]"
                               style={{ background: 'rgba(22,20,21,0.035)', border: '1px solid rgba(22,20,21,0.05)' }}>
                            <div className="flex items-baseline justify-between mb-2.5">
                              <span className="text-[13px] font-bold" style={{ color: 'rgba(22,20,21,0.6)' }}>先做熱身</span>
                              <span className="text-[12px] font-bold" style={{ color: 'rgba(22,20,21,0.38)' }}>約 5 分鐘</span>
                            </div>
                            {warmupList.map((ex, wi) => (
                              <div key={wi} onClick={() => onExerciseTap && onExerciseTap(ex)}
                                   className="flex items-center gap-3 py-1.5" style={{ cursor: 'pointer' }}>
                                <ExerciseThumb name={ex?.name} nameEn={ex?.nameEn} size={30} />
                                <p className="flex-1 min-w-0 truncate text-[13px] font-semibold" style={{ color: 'rgba(22,20,21,0.7)' }}>{zhDisp(ex)}</p>
                                <span className="text-[12px] font-semibold shrink-0" style={{ color: 'rgba(22,20,21,0.45)', fontVariantNumeric: 'tabular-nums' }}>{prescription(ex)}</span>
                              </div>
                            ))}
                          </div>
                        ) : null;

                        return [warmupBlock, ...groups.map((g, gi) => {
                          const isLast = gi === groups.length - 1;

                            if (g.type === 'superset' && trainingStyle !== 'powerlifting' && difficultyLevel !== 'beginner') {
                                const letters = 'ABCDEFGH';
                                ssCounter++;
                                const ssSeq = mainSeq();   // 超級組整組佔一個號碼，裡面再分 A/B
                                const displayGid = `SS${ssCounter}`;
                                const isAntagonist = g.supersetType === 'antagonist';
                                const ssAccent = isAntagonist ? T.CORAL : '#E07B39';
                                const ssLabel = isAntagonist ? '兩個動作輪流做，中間不休息' : '接著做到力竭';
                                const SsIcon = isAntagonist ? Zap : Flame;
                            return (
                              <div key={gi} className="mb-2 pt-4 pb-4 px-4 rounded-[18px] relative overflow-hidden"
                                   style={{ background: isAntagonist ? 'rgba(249,92,75,0.04)' : 'rgba(224,123,57,0.05)', border: `1px solid ${ssAccent}18` }}>
                                {/* Left border accent line */}
                                <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full" style={{ background: ssAccent, opacity: 0.4 }} />
                                <div className="flex items-center justify-between mb-4 pl-3">
                                  <div className="flex items-center gap-2">
                                    <span style={{ fontSize: 12, fontWeight: 800, color: ssAccent }}>
                                      {ssSeq}. 超級組
                                    </span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: ssAccent, opacity: 0.62 }}>
                                      {ssLabel}
                                    </span>
                                  </div>
                                  <SsIcon size={12} color={ssAccent} />
                                </div>
                                {g.pair.map((ex, pi) => (
                                  <div key={pi} className="pl-3">
                                    <div onClick={() => onExerciseTap && onExerciseTap(ex)} className="flex items-center gap-3 py-2" style={{ cursor: 'pointer' }}>
                                      <ExerciseThumb name={ex?.name} nameEn={ex?.nameEn} size={36} />
                                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[11px] font-black"
                                           style={{ background: pi === 0 ? T.BLACK : `${ssAccent}15`, color: pi === 0 ? T.STONE : ssAccent }}>
                                        {letters[pi] || pi + 1}
                                      </div>
                                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                                        <p className="text-[13px] font-bold truncate" style={{ color: T.BLACK }}>{zhDisp(ex)}</p>
                                        {(ex?.targetLabel || ex?.target) && (
                                          <div className="inline-flex">
                                            <span style={{ 
                                              fontSize: 11, 
                                              fontWeight: 700, 
                                              background: '#F2F0ED', 
                                              color: '#5E5A55', 
                                              padding: '2px 6px', 
                                              borderRadius: 4,
                                              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                                              border: '1px solid rgba(22,20,21,0.03)'
                                            }}>
                                              {ex.targetLabel || ex.target}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[11px] font-black" style={{ color: T.BLACK }}>{ex?.sets}×{ex?.reps}</span>
                                        {ex.rest === '0s' && (
                                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                                                style={{ background: `${ssAccent}18`, color: ssAccent }}>不休息</span>
                                        )}
                                      </div>
                                    </div>
                                    {/* Connector line between superset exercises */}
                                    {pi < g.pair.length - 1 && (
                                      <div className="flex items-center gap-2 ml-8 my-1">
                                        <div className="w-px h-3 rounded-full" style={{ background: ssAccent, opacity: 0.3 }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: ssAccent, opacity: 0.55 }}>接著做</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          
                          // 🚨 修正：加入防禦性判斷，避免 g.ex 為 undefined 時崩潰
                          const isDropSetEligible = g.ex?.isDropSet && trainingStyle !== 'powerlifting' && difficultyLevel === 'advanced';

                          // 🌟 如果是 Drop Set，渲染與超級組同等級的高亮卡片視覺！
                          if (isDropSetEligible) {
                            const dropAccent = '#D94030'; // 使用 T.EMBER (深紅色) 代表力竭遞減
                            return (
                              <div key={gi} className="mb-2 mt-2 pt-4 pb-4 px-4 rounded-[18px] relative overflow-hidden"
                                   style={{ background: 'rgba(217,64,48,0.04)', border: `1px solid ${dropAccent}18` }}>
                                {/* 左側邊界高亮線 */}
                                <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full" style={{ background: dropAccent, opacity: 0.4 }} />
                                
                                {/* 卡片 Header */}
                                <div className="flex items-center justify-between mb-4 pl-3">
                                  <div className="flex items-center gap-2">
                                    <span style={{ fontSize: 12, fontWeight: 800, color: dropAccent }}>
                                      最後一組
                                    </span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: dropAccent, opacity: 0.62 }}>
                                      力竭後降重再做一次
                                    </span>
                                  </div>
                                  <Flame size={12} color={dropAccent} />
                                </div>

                                {/* 動作內容 */}
                                <div className="pl-3">
                                  {/* Top Row: Image, Name, and Sets/Reps */}
                                  <div onClick={() => onExerciseTap && onExerciseTap(g.ex)} className="flex items-start gap-3 py-1" style={{ cursor: 'pointer' }}>
                                    <ExerciseThumb name={g.ex.name} nameEn={g.ex.nameEn} size={40} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[14px] font-bold" style={{ color: T.BLACK, margin: 0, lineHeight: 1.25 }}>{zhDisp(g.ex)}</p>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                        {(g.ex.targetLabel || g.ex.target) && (
                                          <span style={{ 
                                            fontSize: 11, 
                                            fontWeight: 700, 
                                            background: '#F2F0ED', 
                                            color: '#5E5A55', 
                                            padding: '2px 6px', 
                                            borderRadius: 4,
                                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                                            border: '1px solid rgba(22,20,21,0.03)'
                                          }}>
                                            {g.ex.targetLabel || g.ex.target}
                                          </span>
                                        )}
                                        <span className="text-[12px] font-black px-1.5 py-0.5 rounded-full tracking-wider shrink-0"
                                              style={{ background: `${dropAccent}18`, color: dropAccent }}>不休息</span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="text-[12px] font-black block" style={{ color: T.BLACK }}>{g.ex.sets}×{g.ex.reps}</span>
                                    </div>
                                  </div>

                                  {/* Bottom Row: Full-width alert-style description box */}
                                  <div className="mt-3 p-2.5 rounded-xl border" style={{ background: 'rgba(217,64,48,0.02)', borderColor: `${dropAccent}15` }}>
                                    <p className="text-[11px] leading-relaxed font-bold" style={{ color: dropAccent, margin: 0 }}>
                                      💡 每組做到力竭後降重 20%，不休息接續
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          /* ── 一般動作列 ──────────────────────────────────────
                             ⚠️ 原本是「縮圖 ＋ 名稱 ＋ 肌群小標 ＋ 提示 ＋ 3×12 ＋ 90」。
                                問題有三個：① 沒有順序，看不出先做哪一個；
                                ② 「3×12」「90」是速記，不是給使用者看的話；
                                ③ 每一列都一樣重，當天真正的主項沒有被指出來。
                             現在：編號在最前、主項標「主項」、處方寫成完整中文。 */
                          const seq = mainSeq();
                          /* 「主項」＝當天第一個做、而且是大重量複合動作（tier 1）。
                             tier 缺值時不亂標，寧可不標也不要標錯。 */
                          const isMain = seq === 1 && g.ex.tier === 1;
                          return (
                            <div key={gi} onClick={() => onExerciseTap && onExerciseTap(g.ex)}
                                 className="flex items-start gap-3 py-3 px-2"
                                 style={{ borderBottom: isLast ? 'none' : '1px solid rgba(22,20,21,0.05)', cursor: 'pointer' }}>
                              {/* 順序 —— 直接告訴使用者第幾個做 */}
                              <span className="shrink-0 flex items-center justify-center rounded-lg"
                                    style={{
                                      width: 22, height: 22, marginTop: 9, fontSize: 12, fontWeight: 800,
                                      fontVariantNumeric: 'tabular-nums',
                                      background: isMain ? T.BLACK : 'rgba(22,20,21,0.06)',
                                      color: isMain ? T.PAPER : 'rgba(22,20,21,0.5)',
                                    }}>{seq}</span>
                              <ExerciseThumb name={g.ex.name} nameEn={g.ex.nameEn} size={40} />
                              <div className="flex-1 flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-[15px] font-bold truncate" style={{ color: T.BLACK }}>{zhDisp(g.ex)}</p>
                                  {isMain && (
                                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold"
                                          style={{ background: 'rgba(249,92,75,0.12)', color: T.EMBER }}>主項</span>
                                  )}
                                </div>
                                {/* 處方寫成一句完整中文，不用 3×12 這種速記 */}
                                <p className="text-[13px] font-semibold" style={{ color: 'rgba(22,20,21,0.58)', fontVariantNumeric: 'tabular-nums' }}>
                                  {prescription(g.ex)}
                                </p>
                                {(g.ex.targetLabel || g.ex.target) && (
                                  <span className="self-start px-1.5 py-0.5 rounded text-[12px] font-semibold"
                                        style={{ background: '#F2F0ED', color: '#5E5A55' }}>
                                    {g.ex.targetLabel || g.ex.target}
                                  </span>
                                )}
                                {g.ex.note && !g.ex.isDropSet && (
                                  <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.42)' }}>{g.ex.note}</p>
                                )}
                              </div>
                            </div>
                          );
                        })];
                      })()}
                    </div>
                    )} {/* end edit mode ternary */}
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
   MAIN — PlanPreviewPageMobile
   ═══════════════════════════════════════════ */
export default function PlanPreviewPageMobile() {
  const { member: isMemberNow, gateActive: memberGateOn } = useMembership();
  const navigate = useNavigate();
  const location = useLocation();
  const { plan: singlePlan, sourcePlans, sourceLevelsMap, daysPerWeek: configuredDays, defaultLevel: routeDefaultLevel, bg, isActivePlan } = location.state || {};
  // 💳 進階課程第 1 週免費、第 2 週起會員 —— 開課前就講清楚（鋼骨基石、融合與自己產生的計劃不顯示）
  const coursePaywallNote = memberGateOn && !isMemberNow && isMemberCourse(singlePlan?.id);
  
  // 🔧 修復：單一 preset 計劃的初始天數應對齊「預設難度的 recommendedDays」，
  //    而非硬編碼 4（否則 3D南瓜肩 新手=3天 卻顯示 4D/WK，與 12 sessions 自相矛盾）。
  //    融合/生成路由 (sourcePlans / engineParams) 無 singlePlan，維持原本 configuredDays||4 行為。
  const initialDaysPerWeek = (() => {
    if (configuredDays) return configuredDays;
    if (singlePlan?.levels) {
      const lvKey = (routeDefaultLevel && singlePlan.levels[routeDefaultLevel])
        ? routeDefaultLevel
        : Object.keys(singlePlan.levels)[0];
      return singlePlan.levels[lvKey]?.recommendedDays || 4;
    }
    return 4;
  })();
  const [trainingStyle, setTrainingStyle] = useState(
    location.state?.trainingStyle || 'bodybuilding'
  );
  
  // 計算整體的難易度 (如果使用者從 FusionConfig 傳入 sourceLevelsMap)
  const initialDifficulty = useMemo(() => {
    if (routeDefaultLevel && singlePlan?.levels?.[routeDefaultLevel]) return routeDefaultLevel;
    if (sourceLevelsMap) {
      const levels = Object.values(sourceLevelsMap);
      if (levels.length > 0) {
        if (levels.every(l => l === 'beginner')) return 'beginner';
        if (levels.some(l => l === 'advanced')) return 'advanced';
      }
    }
    return 'beginner';
  }, [sourceLevelsMap]);

  // 難易度選擇：新手 / 中階 / 精熟 — 控制組數與動作庫
  const [difficultyLevel, setDifficultyLevel] = useState(initialDifficulty);

  /* 一週練幾天不給使用者選 —— 每套專項套裝自己就規定好了（跑者護甲 3D/WK），
     天數跟著難度走（新手 3 天、中階 4 天…）。
     ⚠️ 原本是 1~6 天任選：使用者可以把跑者護甲改成一週 6 天，中控台就得在
        「套裝說 3 天」跟「使用者選 6 天」之間猜一個，兩邊排出來的課表對不上。
        天數是排程的地基，必須只有一個來源。 */
  const selectedDaysPerWeek = useMemo(() => {
    if (configuredDays) return configuredDays;
    const lv = singlePlan?.levels?.[difficultyLevel];
    return lv?.recommendedDays || initialDaysPerWeek;
  }, [configuredDays, singlePlan, difficultyLevel, initialDaysPerWeek]);
  const runDifficulty = routeDefaultLevel || 'beginner';   // 跑步難度改由跑步計劃頁設定

  /* 使用者「現在」有沒有跑步計劃。掛載型套裝（跑者護甲）只排重訓，
     所以這一頁必須回答：你有跑步嗎？沒有的話這份計劃照樣能開始，
     只是那一軌是空的 —— 與其用文字解釋，不如把狀態直接畫出來。 */
  const runCommitment = useMemo(() => readRunCommitment(getUserId()), []);
  /* 使用者本週實際的跑步磚。課程自己帶處方時用不到（那邊用課程的），
     掛載型套裝就靠這個把跑步畫進同一張週曆。 */
  const userRunBricks = useMemo(() => loadCachedBricks(getUserId()), []);
  const [startingCourse, setStartingCourse] = useState(false);
  const courseProgramId = useRef(newProgramId());
  const [courseOverrides, setCourseOverrides] = useState({});
  const coursePreview = useMemo(() => singlePlan?.courseSystem
    ? prepareCourseProgram(singlePlan, difficultyLevel, runDifficulty, { programId: courseProgramId.current }) : null,
    [singlePlan, difficultyLevel, runDifficulty]);
  const targetTimeMinutes = 60; // 固定 60 分鐘，不再暴露滑桿

  const [intensity, setIntensity] = useState('medium'); // 'low', 'medium', 'high'

  // 新手保護機制：如果難度切換到新手，且目前是高強度，強制降回中等
  useEffect(() => {
    if (difficultyLevel === 'beginner' && intensity === 'high') {
      setIntensity('medium');
    }
  }, [difficultyLevel, intensity]);

  // ── 計劃名稱編輯 ──
  const [customPlanName, setCustomPlanName] = useState('');
  const [isEditingPlanName, setIsEditingPlanName] = useState(false);

  // ── 編輯模式狀態 ──
  const [editMode, setEditMode] = useState(false);
  const [customWeeks, setCustomWeeks] = useState(null); // null = 使用引擎生成的 dynamicWeeks
  // Modal state: null | { weekIdx, dayIdx, exIdx (null=add), initialData }
  const [editModal, setEditModal] = useState(null);
  // 點擊動作 → 開啟動作資訊 Sheet（圖二）。編輯/非編輯狀態都可點。
  const [detailEx, setDetailEx] = useState(null);

  // ── 重新生成：用同設定換一批動作（variationSeed 餵給引擎的 pool 旋轉）──
  const [regenNonce, setRegenNonce] = useState(0);
  // ── 重新選擇標籤：進行中計劃按「重新生成」→ 重新打開難度/風格/天數選單讓使用者重選 ──
  const [reconfigure, setReconfigure] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false); // 重新生成前的確認提示
  // 「有效進行中」：進行中且尚未進入重新設定。控制選單收合/唯讀摘要/計劃本體顯示。
  const effectiveActive = isActivePlan && !reconfigure;

  // Regenerate plan when sourcePlans exist (from UnifiedTrainingEngine route)
  // or fall back to the pre-built singlePlan / SHOULDER_ARM_PLAN.
  const plan = useMemo(() => {
    const routeState = location.state || {};
    if (routeState.engineParams) {
      return generateUnifiedPlan({
        ...routeState.engineParams,
        trainingStyle,
        level: difficultyLevel, // 難易度對映到 level
        daysPerWeek: selectedDaysPerWeek,
        sessionDuration: targetTimeMinutes,
        intensity: intensity,
        variationSeed: regenNonce,
      });
    }
    if (sourcePlans && sourcePlans.length > 0) {
      return fuseWorkoutPlans(sourcePlans, selectedDaysPerWeek, sourceLevelsMap || difficultyLevel, trainingStyle, targetTimeMinutes, { variationSeed: regenNonce }, difficultyLevel, intensity);
    }
    const base = singlePlan || SHOULDER_ARM_PLAN;
    // 進行中：顯示已開始的計劃本體（選單已收起，不重算）。
    if (base?.levels && effectiveActive) return base;
    // 🔧 單一 preset 預覽：用「策展改編器」讓 難度/強度/風格/天數 四個選單即時生效，
    //    且只在該計劃自己的動作池內運作 → 不會像融合引擎那樣跨類別洩漏(背計劃跑出腿日)。
    //    「重新生成」(regenNonce>0) 時在同計劃動作池內換一批。
    if (base?.levels) {
      if (base.courseSystem) return selectCourseLevels(base, difficultyLevel, runDifficulty);
      const adapted = adaptPresetPlan(base, difficultyLevel, {
        intensity, style: trainingStyle, daysPerWeek: selectedDaysPerWeek, variationSeed: regenNonce,
      });
      return adapted || base;
    }
    return base;
  }, [singlePlan, sourcePlans, sourceLevelsMap, selectedDaysPerWeek, trainingStyle, targetTimeMinutes, difficultyLevel, runDifficulty, intensity, regenNonce, isActivePlan, reconfigure]);

  const defaultLevel = routeDefaultLevel || (plan.isFusion ? 'fusion' : 'beginner');
  const [openWeek, setOpenWeek] = useState(0);
  const scheduleRef = useRef(null);

  /* 難度只有 difficultyLevel 一個來源。
     ⚠️ 原本還有一個 selectedLevel state，而它唯一的 setter 沒有任何地方呼叫 ——
        所以沒有 courseSystem 的計劃按難度膠囊時，天數變了、課表卻沒變。 */
  const levelData = plan.levels[difficultyLevel] || plan.levels[defaultLevel] || Object.values(plan.levels)[0];

  // 混合課：資料裡有 courseSystem==='hybrid' 或任何一週帶 runPlan

  const isHybridCourse = useMemo(() => {
    const p = singlePlan || {};
    if (p.courseSystem === 'hybrid') return true;
    return (p.levels?.[difficultyLevel]?.weeks || p.weeks || []).some(w => (w.runPlan || []).length > 0);
  }, [singlePlan, difficultyLevel]);

  /* 目前是否已有「別的」執行中計劃（用來決定按下開始時要不要確認） */
  const otherActiveName = useMemo(() => {
    try {
      const pr = localStorage.getItem(`currentPlan_${getUserId()}`);
      if (!pr) return null;
      const a = JSON.parse(pr);
      const nm = a?.name || a?.plan_name;
      const aid = a?.plan_id || a?.id;
      if (!nm && !aid) return null;
      const mineId = plan?.id || plan?.plan_id;
      const mineNm = plan?.name || plan?.plan_name;
      // 就是這個計劃 → 不用問
      if ((aid && mineId && aid === mineId) || (nm && mineNm && nm === mineNm)) return null;
      return nm || '目前的計劃';
    } catch { return null; }
  }, [plan]);


  /* 這套一週練哪幾天 —— 直接讀課表第一週的訓練日，不查對照表。
     天數改了、難度改了，這一行就跟著改，永遠等於下面展開後看到的內容。 */
  const weekDayTitles = useMemo(() => {
    const days = levelData?.weeks?.[0]?.days || [];
    const names = days.map((d) => focusTitle(d?.focus || d?.name)).filter(Boolean);
    return names.length ? names : ['重訓'];
  }, [levelData]);

  const allDays = useMemo(() => {
    let days = [];
    levelData.weeks.forEach(w => {
      w.days.forEach(d => days.push(d));
    });
    return days;
  }, [levelData]);

  const dynamicWeeks = useMemo(() => {
    // Use the engine's pre-built week structure directly.
    // The fusion engine always generates exactly 4 weeks, each containing
    // exactly daysPerWeek days — so the week count is always stable and correct.
    // Re-numbering dayNumber globally (1…totalSessions) for display.
    let globalDay = 1;
    return levelData.weeks.map(w => ({
      ...w,
      days: w.days.map(d => ({ ...d, dayNumber: globalDay++ })),
    }));
  }, [levelData]);

  const totalExercises = useMemo(() => {
    const unique = new Set();
    allDays.forEach(d => 
      (d.exercises || []).forEach(e => unique.add(e.name || e.nameEn))
    );
    return unique.size;
  }, [allDays]);

  // When settings change, reset any custom edits so view stays in sync
  useEffect(() => {
    setCustomWeeks(null);
    setEditMode(false);
  }, [difficultyLevel, trainingStyle, selectedDaysPerWeek]);

  // The weeks actually rendered (custom overrides engine output)
  const displayWeeks = customWeeks || dynamicWeeks;

  // ── Edit mode helpers ──
  const deepCloneWeeks = (weeks) => JSON.parse(JSON.stringify(weeks));

  const handleEditExercise = useCallback((weekIdx, dayIdx, exIdx, exData) => {
    setEditModal({ weekIdx, dayIdx, exIdx, initialData: exData });
  }, []);

  const handleSaveEdit = useCallback((form) => {
    if (!editModal) return;
    const { weekIdx, dayIdx, exIdx } = editModal;
    setCustomWeeks(prev => {
      const next = deepCloneWeeks(prev || dynamicWeeks);
      next[weekIdx].days[dayIdx].exercises[exIdx] = {
        ...next[weekIdx].days[dayIdx].exercises[exIdx],
        name: form.name,
        targetLabel: form.targetLabel,
        sets: form.sets,
        reps: form.reps,
        rest: form.rest,
        note: form.note,
      };
      return next;
    });
    setEditModal(null);
  }, [editModal, dynamicWeeks]);

  const handleAddExercise = useCallback((weekIdx, dayIdx) => {
    setEditModal({ weekIdx, dayIdx, exIdx: null, initialData: null });
  }, []);

  const handleSaveAdd = useCallback((form) => {
    if (!editModal) return;
    const { weekIdx, dayIdx } = editModal;
    setCustomWeeks(prev => {
      const next = deepCloneWeeks(prev || dynamicWeeks);
      const newEx = {
        name: form.name,
        targetLabel: form.targetLabel,
        sets: form.sets,
        reps: form.reps,
        rest: form.rest,
        note: form.note,
        _uid: `custom_${Date.now()}_${Math.random()}`,
      };
      next[weekIdx].days[dayIdx].exercises = [
        ...(next[weekIdx].days[dayIdx].exercises || []),
        newEx,
      ];
      return next;
    });
    setEditModal(null);
  }, [editModal, dynamicWeeks]);

  const handleDeleteExercise = useCallback((weekIdx, dayIdx, exIdx) => {
    setCustomWeeks(prev => {
      const next = deepCloneWeeks(prev || dynamicWeeks);
      next[weekIdx].days[dayIdx].exercises.splice(exIdx, 1);
      return next;
    });
  }, [dynamicWeeks]);

  const handleReorderExercises = useCallback((weekIdx, dayIdx, newOrder) => {
    setCustomWeeks(prev => {
      const next = deepCloneWeeks(prev || dynamicWeeks);
      next[weekIdx].days[dayIdx].exercises = newOrder;
      return next;
    });
  }, [dynamicWeeks]);

  const totalSessions = displayWeeks.reduce((sum, w) => sum + w.days.length, 0);

  /* ── 這一頁要講的事實，全部從課表本身算出來 ────────────────────────
     ⚠️ DIFFICULTY_LEVELS[].desc 原本寫死「每日 4 個動作、3 組、12–15 下」，
        但那是第二份真相：翹臀新手正式動作是 5 個、鋼骨基石是 5 個，
        而且翹臀還多 3 個啟動熱身。畫面說的必須等於展開後看到的。 */
  const planFacts = useMemo(() => {
    const days = allDays;
    if (!days.length) return null;
    const work = d => (d.exercises || []).filter(e => !e.isWarmup && !e.warmup);
    const warm = d => (d.exercises || []).filter(e => e.isWarmup || e.warmup);
    const exCounts = days.map(d => work(d).length);
    const setCounts = days.map(d => work(d).reduce((a, e) => a + (Number(String(e.sets ?? '').match(/\d+/)?.[0]) || 0), 0));
    const rng = arr => {
      const lo = Math.min(...arr), hi = Math.max(...arr);
      return lo === hi ? `${lo}` : `${lo}–${hi}`;
    };
    return {
      exPerDay: rng(exCounts),
      setsPerDay: rng(setCounts),
      hasWarmup: days.some(d => warm(d).length > 0),
      warmupCount: Math.max(...days.map(d => warm(d).length)),
    };
  }, [allDays]);

  /* 一週怎麼排：資料自己那句話優先。
     ⚠️ 原本大字直接印 recommendedDays —— 但那個數字在混合課裡是「總場次」
        （減脂課 5 = 重訓 2 ＋ 跑步 3），在跑者肌力裡是「第一週的次數」
        （第 5 週起降為 2 次）。印成「5 天／週」跟下面列出來的兩個訓練日互相矛盾。 */
  const scheduleLine = useMemo(() => {
    const lbl = levelData?.recommendedDaysLabel;
    if (lbl) return lbl;
    const n = levelData?.weeks?.[0]?.days?.length || selectedDaysPerWeek;
    return `每週 ${n} 次重訓`;
  }, [levelData, selectedDaysPerWeek]);

  const avgSessionTime = useMemo(() => {
    if (!allDays.length) return 0;
    const sum = allDays.reduce((acc, d) => acc + (d.time || 0), 0);
    return Math.round(sum / allDays.length);
  }, [allDays]);

  return (
    <div className="min-h-[100dvh] pb-40" style={{ background: T.PEBBLE }}>

      {/* ── HERO SECTION ── */}
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

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 pt-16 z-10">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(-1)}
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <ArrowLeft size={20} style={{ color: T.PAPER }} />
          </motion.button>
          
          <div className="flex items-center gap-2">
            {/* 已開始的計劃：右上角「重新生成」→ 先提示確認，再重新打開選單讓使用者全部重選 */}
            {effectiveActive && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setShowRegenConfirm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full"
                style={{ background: 'rgba(249,92,75,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <RotateCcw size={12} color="white" />
                <span className="text-[12px] font-black text-white tracking-[0.04em]">重新生成</span>
              </motion.button>
            )}
            {/* 「56 DAYS」膠囊拿掉：下面那一行已經有「8 週」，同一件事不必講兩次，
                而且全站不留英文（介面標準 §3）。未開始時這裡改放「改名」。 */}
            {!effectiveActive && !isEditingPlanName && (
              <motion.button
                {...pressProps('icon')}
                onClick={() => { haptic('light'); setCustomPlanName(customPlanName || plan.name); setIsEditingPlanName(true); }}
                aria-label="修改課程名稱"
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <Pencil size={16} color="#fff" />
              </motion.button>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-8 pb-12 z-10">
          <span style={{ display: 'block', marginBottom: 12, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.55)' }}>課程</span>

          {/* ── 計劃名稱：可點擊編輯 ── */}
          {isEditingPlanName ? (
            <div className="mb-4 flex items-center gap-2">
              <input
                autoFocus
                value={customPlanName || plan.name}
                onChange={e => setCustomPlanName(e.target.value)}
                onBlur={() => setIsEditingPlanName(false)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingPlanName(false); }}
                className="flex-1 text-[26px] font-bold leading-[1.1] tracking-tight bg-transparent border-b-2 outline-none pr-2"
                style={{ color: T.PAPER, borderColor: T.CORAL, fontFamily: '"Tenor Sans", sans-serif' }}
              />
              <motion.button {...pressProps('row')}
 onMouseDown={() => setIsEditingPlanName(false)}
 className="shrink-0 px-3 py-1 rounded-xl text-[12px] font-black tracking-wider"
 style={{ background: T.CORAL, color: '#fff' }}
 >完成</motion.button>
            </div>
          ) : effectiveActive ? (
            // 已開始：名稱唯讀（編輯/重新生成由右上角「重新生成」負責）
            <div className="w-full text-left mb-4">
              <h1
                className="text-[32px] font-bold leading-[1.1] tracking-tight"
                style={{ color: T.PAPER, fontFamily: '"Tenor Sans", sans-serif' }}
              >
                {customPlanName || plan.name}
              </h1>
            </div>
          ) : (
            /* 「修改」膠囊原本壓在標題右上角，等於在教使用者按哪顆鈕（介面標準 §3），
               而且遮住標題。改名鈕移到右上角工具列，標題就只是標題。 */
            <div className="w-full text-left mb-4">
              <h1
                className="text-[32px] font-bold leading-[1.1] tracking-tight"
                style={{ color: T.PAPER, fontFamily: '"Tenor Sans", sans-serif' }}
              >
                {customPlanName || plan.name}
              </h1>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-8 h-0.5" style={{ background: T.CORAL }} />
            <p className="text-[13px] font-bold" style={{ color: 'rgba(246,244,241,0.72)' }}>
              {[plan.bodyPartLabel || '綜合訓練', `${displayWeeks.length} 週`, levelData?.label].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="px-7 -mt-10 relative z-10">
        {/* 這門課在幹嘛 —— 全頁唯一的說明區塊，兩句以內（介面標準 §2）。
            原本是英文 kicker「SYSTEM SPLIT STRATEGY」＋ 加引號的斜體段落，
            讀起來像廣告文案而不是說明，而且底下的標籤全用大寫英文字距。 */}
        <div className="ms-card rounded-[28px] p-7 mb-8 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: M.TITANIUM }} />
          <p className="text-[15px] font-medium leading-[1.75]" style={{ color: 'rgba(22,20,21,0.82)' }}>
            {plan.description}
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            {(plan.tags || []).map((tag, i) => (
              <span key={i} className="px-3.5 py-1.5 rounded-full text-[12px] font-bold"
                style={{ background: 'rgba(22,20,21,0.05)', color: 'rgba(22,20,21,0.62)', border: '1px solid rgba(22,20,21,0.06)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* ── AI INSIGHT BANNER ── shown when superset is active */}
        {plan.ai_insight && (
          <div
            className="rounded-[28px] p-6 mb-8 flex gap-4 items-start"
            style={{
              background: 'rgba(249,92,75,0.05)',
              border: '1px solid rgba(249,92,75,0.15)',
            }}
          >
            <div
              className="w-10 h-10 rounded-[18px] flex items-center justify-center shrink-0"
              style={{ background: 'rgba(249,92,75,0.12)', color: T.CORAL }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: T.CORAL, display: 'block', marginBottom: 6 }}>這份課表的調整</span>
              <p className="text-[12px] font-medium leading-relaxed" style={{ color: 'rgba(22,20,21,0.75)' }}>
                {plan.ai_insight}
              </p>
            </div>
          </div>
        )}

        {/* ── 已開始的計劃：四個選擇器全收起，改顯示瑞士極簡唯讀摘要 ── */}
        {effectiveActive && (
          <div className="mb-10">
            <SectionTitle>目前的設定</SectionTitle>
            <div className="rounded-[24px] px-6 py-1" style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(22,20,21,0.06)' }}>
              {[
                ['難度', LEVEL_ZH[difficultyLevel] || levelData?.label],
                ['每週安排', scheduleLine],   // 與下面未開始時的區塊標題「一週怎麼排」分開，同一句話不在同一支檔案出現兩次（R7）
                ['每次大約', `${levelData?.durationPerSession || avgSessionTime} 分鐘`],
              ].filter(([, v]) => v).map(([k, v], i, arr) => (
                <div key={k} className="flex items-baseline justify-between gap-6 py-4" style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(22,20,21,0.06)' : 'none' }}>
                  <span className="text-[13px] font-bold shrink-0" style={{ color: 'rgba(22,20,21,0.45)' }}>{k}</span>
                  <span className="text-[15px] font-bold text-right" style={{ color: T.BLACK }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 未開始(或重新設定中)：完整設定選擇器（難度/風格/頻率）── */}
        {!effectiveActive && (<>
        {/* ── 選難度 ──────────────────────────────────────────────────
            原本一顆膠囊上疊「新手 / BASIC」兩行（同一件事講兩次、9px 英文），
            說明用的是寫死的 DIFFICULTY_LEVELS[].desc —— 那句「每日 4 個動作」
            跟實際展開的課表對不上。現在說明直接從課表算。 */}
        <div className="mb-10">
          <SectionTitle>{singlePlan?.courseSystem === 'hybrid' ? '選重訓難度' : '選難度'}</SectionTitle>
          <div className="grid grid-cols-3 gap-2.5">
            {DIFFICULTY_LEVELS.map((lv) => {
              const isActive = lv.key === difficultyLevel;
              return (
                <motion.button
                  key={lv.key}
                  {...pressProps('pill')}
                  onClick={() => {
                    haptic('light');
                    setDifficultyLevel(lv.key);
                    courseProgramId.current = newProgramId(); setCourseOverrides({});
                    setOpenWeek(0);
                    if (lv.key === 'beginner' && trainingStyle === 'powerlifting') setTrainingStyle('bodybuilding');
                  }}
                  aria-pressed={isActive}
                  className="py-3.5 rounded-[18px] text-[15px] font-bold transition-colors duration-200"
                  style={isActive
                    ? { background: T.BLACK, color: T.PAPER, boxShadow: '0 8px 20px -10px rgba(22,20,21,0.45)' }
                    : { background: 'rgba(255,255,255,0.6)', color: 'rgba(22,20,21,0.55)', border: '1px solid rgba(22,20,21,0.08)' }}
                >
                  {lv.label}
                </motion.button>
              );
            })}
          </div>
          {/* 選了這個難度，實際會拿到什麼 —— 全部算自這份課表 */}
          <motion.div
            key={difficultyLevel}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: RISE }}
            className="mt-3 flex items-stretch rounded-[18px] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(22,20,21,0.06)' }}
          >
            {[
              ['每次動作', planFacts ? `${planFacts.exPerDay} 個` : '—'],
              ['每次組數', planFacts ? `${planFacts.setsPerDay} 組` : '—'],
              ['每次時間', `${levelData?.durationPerSession || avgSessionTime} 分`],
            ].map(([k, v], i) => (
              <div key={k} className="flex-1 px-3 py-3.5 text-center"
                   style={{ borderLeft: i ? '1px solid rgba(22,20,21,0.07)' : 'none' }}>
                <p className="text-[19px] font-semibold leading-none" style={{ color: T.BLACK, fontVariantNumeric: 'tabular-nums' }}>{v}</p>
                <p className="text-[12px] font-bold mt-1.5" style={{ color: 'rgba(22,20,21,0.42)' }}>{k}</p>
              </div>
            ))}
          </motion.div>
          {planFacts?.hasWarmup && (
            <p className="mt-2.5 px-1 text-[12px] font-bold" style={{ color: 'rgba(22,20,21,0.42)' }}>
              另含每次 {planFacts.warmupCount} 個啟動熱身，不算在上面
            </p>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            含跑步的套裝 → 跳出去設定跑步，不在這裡排
            ══════════════════════════════════════════════════════════════
            這一區原本有「跑步難度」選擇器，加上一整塊「健身與跑步日期確認」
            （TrainingScheduleReview）：選完健身天數之後，要在同一頁再把跑步
            的日子也排一次。兩件事混在一張表單裡，使用者看不出在做什麼。

            專項套裝這一層只負責健身。套裝裡有跑步處方的（跑者護甲、燃脂輕跑、
            HYROX），改成走出去：到跑步計劃那邊設定，設完導去中控台看合併後的
            一週怎麼排 —— 撞日避讓本來就只有中控台算得出來。 */}
        {isHybridCourse && (
          <div className="mb-8">
            <SectionTitle>{runCommitment ? '你的跑步' : '這套要搭配跑步'}</SectionTitle>
            <motion.button
              {...pressProps('cta')}
              type="button"
              onClick={() => {
                haptic('medium');
                navigate('/cardio-plan-builder', {
                  state: { returnTo: '/training-focus', fromPlan: singlePlan?.id || null },
                });
              }}
              style={{
                marginTop: 12, width: '100%', display: 'flex', alignItems: 'center',
                gap: 14, padding: '16px 18px', borderRadius: 18, cursor: 'pointer',
                background: '#fff', border: `1px solid ${T.PEBBLE || 'rgba(22,20,21,0.12)'}`,
                textAlign: 'left',
              }}
            >
              <span style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'rgba(249,92,75,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Footprints size={19} strokeWidth={2.2} color="#F95C4B" />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 700, color: T.BLACK }}>
                  {runCommitment ? '跑步已經排好了' : '去排跑步計劃'}
                </span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.45)', marginTop: 2 }}>
                  {runCommitment
                    ? [runCommitment.goalLabel,
                       runCommitment.sessionsPerWeek ? `本週 ${runCommitment.sessionsPerWeek} 趟` : null,
                       runCommitment.weekKm ? `${runCommitment.weekKm} 公里` : null,
                      ].filter(Boolean).join(' · ') || '在中控台看合併後的一週'
                    : '這門課只排重訓，跑步分開排'}
                </span>
              </span>
              <ChevronRight size={18} color="rgba(22,20,21,0.28)" />
            </motion.button>
          </div>
        )}

        {/* ── TRAINING STYLE SELECTOR：一律不顯示 ──
             這些是「配好的現成計劃」，使用者只需要選程度（新手/中階/精熟）。
             健美 vs 健力屬於進階細調，放在這裡只會讓人不知道該選哪個。
             trainingStyle 仍保留預設值 'bodybuilding' 供引擎使用，只是不讓使用者選。 */}
        <div className="mb-10" style={{ display: 'none' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
            <SectionTitle>訓練風格</SectionTitle>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {TRAINING_STYLES.map((style) => {
              const isActive = style.key === trainingStyle;
              // 🚨 新增：判斷是否為新手且為健力模式
              const isDisabled = difficultyLevel === 'beginner' && style.key === 'powerlifting';
              const StyleIcon = style.icon;
              return (
                <motion.button
                  key={style.key}
                  whileTap={isDisabled ? {} : { scale: 0.96 }}
                  onClick={() => { 
                    if (isDisabled) return; // 禁用狀態下點擊無效
                    setTrainingStyle(style.key); 
                    setOpenWeek(0); 
                  }}
                  className="px-5 py-3.5 rounded-[24px] transition-all duration-300 flex-shrink-0 text-left relative overflow-hidden"
                  style={{
                    ...(isActive ? {
                      background: style.key === 'powerlifting' ? '#1A1508' : T.BLACK,
                      boxShadow: isActive ? `0 8px 24px ${style.accent}30` : 'none',
                      border: `1px solid ${style.accent}40`,
                    } : {
                      background: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(22,20,21,0.07)',
                      backdropFilter: 'blur(8px)',
                    }),
                    // 🚨 新增：禁用時的透明度與游標樣式
                    opacity: isDisabled ? 0.3 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  {/* Active glow pulse */}
                  {isActive && (
                    <div
                      className="absolute inset-0 opacity-10"
                      style={{ background: `radial-gradient(circle at 30% 50%, ${style.accent}, transparent 70%)` }}
                    />
                  )}
                  <div className="flex items-center gap-2 mb-1.5 relative z-10">
                    <StyleIcon
                      size={13}
                      style={{ color: isActive ? style.accent : 'rgba(22,20,21,0.4)' }}
                    />
                    <span
                      className="text-[9px] font-black tracking-wider uppercase"
                      style={{ color: isActive ? '#fff' : T.BLACK }}
                    >
                      {style.label}
                    </span>
                    {style.key === 'powerlifting' && (
                      <span
                        className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                        style={{ background: '#B8960C20', color: '#B8960C' }}
                      >
                        PR
                      </span>
                    )}
                    {style.key === 'bodybuilding' && isActive && (
                      <span
                        className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                        style={{ background: 'rgba(249,92,75,0.15)', color: T.CORAL }}
                      >
                        SS On
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[11px] font-medium relative z-10 block"
                    style={{ color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(22,20,21,0.4)' }}
                  >
                    {style.sub}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Style description pill */}
          <motion.div
            key={trainingStyle}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-4 px-5 py-3.5 rounded-[18px]"
            style={{
              background: 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(22,20,21,0.05)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <p className="text-[11px] font-medium leading-relaxed" style={{ color: 'rgba(22,20,21,0.6)' }}>
              {TRAINING_STYLES.find(s => s.key === trainingStyle)?.desc}
            </p>
          </motion.div>
        </div>

        {/* ── 一週怎麼排 ─────────────────────────────────────────────
            ⚠️ 原本左邊是一個 36px 的大數字 selectedDaysPerWeek。
               那個數字在混合課裡是「總場次」（減脂課 5 ＝ 重訓 2 ＋ 跑步 3），
               在跑者肌力裡是「第一週的次數」（第 5 週起降為 2 次）——
               印成「5 天／週」，跟右邊只列出兩個訓練日互相矛盾。
               課程資料本來就有 recommendedDaysLabel 把話說完整，直接用它。 */}
        <div className="mb-10">
          <SectionTitle>一週怎麼排</SectionTitle>
          <div className="rounded-[18px] px-5 py-4"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.75)' }}>
            <p className="text-[17px] font-bold leading-snug" style={{ color: T.BLACK }}>{scheduleLine}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {weekDayTitles.map((t, i) => (
                <span key={i} className="px-2.5 py-1 rounded-lg text-[12px] font-bold"
                  style={{ background: 'rgba(22,20,21,0.05)', color: 'rgba(22,20,21,0.55)' }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
        </>)}

        {/* 直接把後端算好的 plan 傳進去，不要讓前端自己瞎猜了 */}
        {!effectiveActive && sourcePlans && sourcePlans.length > 0 && (
          <FusionModePreview plan={plan} daysPerWeek={selectedDaysPerWeek} />
        )}

        {/* TARGET DURATION SLIDER — 移除，改由組數控制 */}

        {/* ⚠️ 這裡原本有兩塊東西，現在整個拿掉：
             ① 2×2 的 InfoCard（Training Cycle / Intensity Level / Primary Gear /
                Biological Focus）—— 四個英文標籤，而且「週數」與「難度」
                上面的 hero 那一行已經講過了。
             ② 深色三欄條（Sessions / Movements / Mins/Avg）—— 「每次幾分鐘」
                在難度那一排已經有，「總共幾次」＝ 週數 × 每週次數，也是重講。
           介面標準 §2：同一個資訊在同一畫面只能出現一次。
           剩下真正還沒講過的只有「總共幾堂 / 幾個動作」，收成一行。 */}
        {!effectiveActive && (
          <div className="flex items-center justify-between gap-4 mt-10 mb-8 px-5 py-4 rounded-[18px]"
               style={{ background: 'rgba(22,20,21,0.035)', border: '1px solid rgba(22,20,21,0.05)' }}>
            <span className="text-[13px] font-bold" style={{ color: 'rgba(22,20,21,0.45)' }}>整套課程</span>
            <span className="text-[15px] font-bold" style={{ color: T.BLACK, fontVariantNumeric: 'tabular-nums' }}>
              {displayWeeks.length} 週 · {totalSessions} 堂 · {totalExercises} 個動作
            </span>
          </div>
        )}

        <div ref={scheduleRef}>
          <div className="flex items-center gap-3 mb-2">
            {/* serif 斜體不在設計系統裡（字體收斂表已把 Georgia/Playfair 這類移除）；
                「動態計劃表」也不是使用者的話，他要看的就是課表。 */}
            <h2 className="text-[22px] font-bold tracking-tight" style={{ color: T.BLACK }}>課表</h2>
            <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
            {/* ── 改課表 ────────────────────────────────────────────────
                ⚠️ 原本這顆是滿版珊瑚膠囊，跟畫面最下面那條「開始計劃」搶同一個
                   顏色。整頁只能有一個珊瑚焦點，而那個焦點是「開始」，不是「改」——
                   使用者第一次進來要做的事是看完然後開始，不是編輯。
                   改成安靜的次要按鈕；真的進到編輯狀態時才變深色（狀態看得出來）。
                文案也改了：「編輯計劃」是系統詞，使用者想的是「我要改課表」。 */}
            <motion.button
              {...pressProps('pill')}
              onClick={() => { haptic('light'); setEditMode(m => !m); }}
              aria-pressed={editMode}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full font-bold text-[13px] flex-shrink-0 transition-colors duration-200"
              style={editMode
                ? { background: T.BLACK, color: T.PAPER, border: '1px solid transparent' }
                : { background: 'rgba(255,255,255,0.6)', color: 'rgba(22,20,21,0.62)', border: '1px solid rgba(22,20,21,0.12)' }
              }
            >
              {editMode ? <><Check size={14} /> 改好了</> : <><Pencil size={13} /> 改課表</>}
            </motion.button>
          </div>
          {/* 「Dynamic periodization matrix generated」是講系統做了什麼，
              不是使用者得到什麼（介面標準 §3）—— 刪掉。 */}
          {/* Edit mode hint */}
          <AnimatePresence>
            {editMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="mb-6 px-4 py-3 rounded-[18px] flex items-center gap-2"
                style={{ background: 'rgba(249,92,75,0.07)', border: '1px solid rgba(249,92,75,0.18)' }}
              >
                <GripVertical size={13} style={{ color: T.CORAL, flexShrink: 0 }} />
                <span className="text-[13px] font-semibold" style={{ color: 'rgba(22,20,21,0.6)' }}>
                  動作可以拖著換順序、點開來改，也可以再加新的
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4" style={{ marginTop: editMode ? 0 : 24 }}>
            {displayWeeks.map((week, wi) => (
              <WeekAccordion
                key={wi}
                week={week}
                weekIdx={wi}
                isOpen={openWeek === wi}
                onToggle={() => setOpenWeek(openWeek === wi ? -1 : wi)}
                totalWeeks={displayWeeks.length}
                trainingStyle={trainingStyle}
                difficultyLevel={difficultyLevel}
                userRunBricks={userRunBricks}
                editMode={editMode}
                onEditExercise={handleEditExercise}
                onAddExercise={handleAddExercise}
                onDeleteExercise={handleDeleteExercise}
                onReorderExercises={handleReorderExercises}
                onExerciseTap={setDetailEx}
              />
            ))}
          </div>
        </div>

        {/* ── Exercise Edit / Add Modal（共用 final-drvn 組件）── */}
        <ExercisePlanEditModal
          isOpen={!!editModal}
          onClose={() => setEditModal(null)}
          onSave={editModal?.exIdx !== null && editModal?.exIdx !== undefined ? handleSaveEdit : handleSaveAdd}
          initialData={editModal?.initialData || null}
        />

        {/* ── 動作資訊 Sheet（圖二）：點任一動作即開，編輯/非編輯皆可 ── */}
        {detailEx && (
          <ExerciseDetailSheet ex={detailEx} onClose={() => setDetailEx(null)} />
        )}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 px-5 z-50"
        style={{
          paddingTop: 16,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          background: 'linear-gradient(transparent, rgba(246,244,241,0.95) 30%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* ── 按下去會動到哪幾條軌：在按之前就講，不要等到彈窗 ──
            首頁把訓練分成 跑步／重訓／營養 三條各自獨立的軌，
            混合課會一次接管兩條，使用者有權在按之前就知道。 */}
        {!effectiveActive && (() => {
          const imp = describeCourseImpact(plan, difficultyLevel);
          return (
            <p className="mb-2.5 px-1 text-[12px] font-bold" style={{ color: 'rgba(22,20,21,0.45)' }}>
              {imp.writesRun ? '會換掉你的重訓和跑步課表'
                : imp.runIsExternal ? '會換掉你的重訓課表，跑步不動'
                : '會換掉你的重訓課表'}
            </p>
          );
        })()}

        {/* 圖三設計：拉絲鈦金屬外框 + 液態玻璃珊瑚膠囊（繼續計劃時整體更淡） */}
        <div
          className="w-full rounded-[22px] relative"
          style={{
            padding: 5,
            background: 'linear-gradient(135deg,#FBFAF8 0%,#E4DDD2 38%,#CFC6B8 70%,#F1ECE3 100%)',
            boxShadow: effectiveActive
              ? '0 10px 26px -14px rgba(22,20,21,0.22), inset 0 1px 1px rgba(255,255,255,0.9)'
              : '0 18px 40px -12px rgba(22,20,21,0.35), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -2px 6px rgba(22,20,21,0.10)',
          }}
        >
          {/* 拉絲金屬紋理 garnish（低透明度） */}
          <div className="absolute inset-0 rounded-[22px] pointer-events-none" style={{ backgroundImage: "url('/desktop/11.jpeg')", backgroundSize: 'cover', mixBlendMode: 'luminosity', opacity: 0.16, borderRadius: 22 }} />
        <motion.button
          whileTap={{ scale: 0.97 }}
          className={`lg-btn lg-btn--interactive w-full py-4 rounded-[18px] flex items-center justify-center gap-2 relative ${effectiveActive ? '' : 'lg-btn--coral'}`}
          style={effectiveActive
            ? { background: 'rgba(249,92,75,0.16)', color: T.EMBER, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)' }
            : {
              /* 珊瑚降飽和 —— 滿版純 #F95C4B 在暖紙底上太跳，
                 整頁的視覺重心會被這條橫幅搶走。 */
              background: 'linear-gradient(135deg, #F07C6B 0%, #E8705F 100%)',
              boxShadow: '0 6px 18px -8px rgba(249,92,75,0.38), inset 0 1px 1px rgba(255,255,255,0.40)',
            }}
          onClick={async () => {
            if (startingCourse) return;
            /* 【切換確認移到這裡】以前一點卡片就跳「已有執行中的計劃」，
               使用者連內容都還沒看到就被問要不要切換 —— 那時他根本無從判斷。
               現在改成：看完課表、真的要用了，按下這顆才問。

               而且要逐軌講清楚：DRVN 首頁的訓練分成 跑步／重訓／營養 三條軌，
               混合課（燃脂輕跑、HYROX）會同時接管「重訓」與「跑步」兩條，
               純重訓課只動「重訓」。使用者按下去前必須先知道哪一條會被換掉。 */
            const impact = describeCourseImpact(plan, difficultyLevel);
            if (!effectiveActive && (otherActiveName || impact.writesRun)) {
              const keepCurrent = await confirmDialog(
                impactMessage(impact, { activeName: otherActiveName }),
                {
                  title: impact.writesRun ? '這門課會同時換掉重訓與跑步' : '要換成這門課嗎',
                  confirmText: otherActiveName ? '繼續目前計劃' : '先不要',
                  cancelText: '好，換成這門課',
                  danger: true,
                }
              );
              if (keepCurrent) return;   // 按「繼續目前計劃 / 先不要」→ 不切換
            }
            if (!effectiveActive && singlePlan?.courseSystem) {
              setStartingCourse(true);
              try {
                const program = { ...coursePreview, ...(coursePreview.running ? { running: { ...coursePreview.running, day_overrides: courseOverrides } } : {}) };
                const saved = await activateProgram(getUserId(), withExistingRunSchedule(getUserId(), program, courseOverrides), apiClient);
                navigate('/luxury-plan-view-mobile', { state: { plan: saved.strength, isActivePlan: true } });
              } catch (e) {
                toast.error('套裝尚未確認同步，請重試同一份設定，或回中控「重試並確認計劃」。');
              } finally { setStartingCourse(false); }
              return;
            }
            // 混合課：同一顆按鈕把「跑步」那一軌也一起換掉，
            // 不讓使用者按完還要自己去跑步頁再設定一次。
            let linkedRunPlan = null;
            if (!effectiveActive && impact.writesRun) {
              const uid = getUserId();
              const r = await applyCourseCardioPlan({
                plan, levelKey: difficultyLevel, userId: uid, apiClient,
              });
              if (r.ok) {
                linkedRunPlan = r.plan;
                toast.success(`跑步計劃已換成「${plan.name}」的處方（每週 ${impact.runSessions} 趟）`);
              } else {
                toast.error('跑步計劃尚未儲存，這次沒有繼續切換套裝。請恢復連線後重試。');
                return;
              }
            }
            // Flatten the fused plan structure so LuxuryPlanViewMobile
            // can access plan.weeks directly (it doesn't know about levels[].weeks)
            const luxuryPlan = {
              plan_id: plan.plan_id || plan.id || `fusion_${Date.now()}`,
              plan_name: customPlanName || plan.name || plan.plan_name,
              name: customPlanName || plan.name || plan.plan_name,
              isFusion: plan.isFusion || false,
              description: plan.description || '',
              duration: plan.duration || 28,
              days_per_week: levelData.recommendedDays || selectedDaysPerWeek || 4,
              weeks: levelData.weeks,
              tags: plan.tags || [],
              bodyPartLabel: plan.bodyPartLabel || '',
              estimatedTime: plan.estimatedTime || '',
              selected_hashtags: plan.tags || [],
              courseSystem: plan.courseSystem || 'strength',
              source_course: plan.source_course || { id: plan.id || plan.plan_id, name: plan.name || plan.plan_name, level: difficultyLevel },
              ...(plan.linked_cardio_plan_id ? { linked_cardio_plan_id: plan.linked_cardio_plan_id } : {}),
              ...(plan.startDate || plan.start_date ? { startDate: plan.startDate || plan.start_date } : {}),
              ...(plan.cycleWeeks ? { cycleWeeks: plan.cycleWeeks } : {}),
              ...(linkedRunPlan ? {
                linked_cardio_plan_id: linkedRunPlan.plan_id,
                startDate: linkedRunPlan.start_date,
                cycleWeeks: linkedRunPlan.weeks.length,
              } : {}),
            };
            // 預設課表／融合計劃一樣要存上後端並設為目前計劃。
            // 以前只帶著 router state 跳頁、存在本機 —— 下次打開中控，
            // refreshProgram 從後端拿回「上一份」計劃，新選的課表就被默默蓋回去。
            let activePlan = luxuryPlan;
            if (!effectiveActive) {
              setStartingCourse(true);
              try {
                const uid = getUserId();
                const saved = await activateProgram(uid, { program_id: newProgramId(), strength: luxuryPlan }, apiClient);
                if (!saved?.strength?.plan_id) throw new Error('no plan id');
                activePlan = saved.strength;
              } catch (e) {
                toast.error('計劃還沒存好，請確認連線後再按一次。');
                return;
              } finally { setStartingCourse(false); }
            }
            // ✨ 第一次啟用融合計劃 → 滿版時刻（跨頁 portal，落在跳轉空檔）
            if (plan.isFusion && !effectiveActive) {
              try { recordFirst(getUserId(), 'fusion_plan'); } catch { /* */ }
            }
            navigate('/luxury-plan-view-mobile', {
              state: { plan: activePlan }
            });
          }}
        >
          <Play size={18} fill="currentColor" />
          <span className="text-sm font-bold tracking-wide">{startingCourse ? '正在啟用…' : effectiveActive ? '繼續計劃' : '開始計劃'}</span>
        </motion.button>
        {/* 💳 先講清楚：進階課程第 1 週免費，第 2 週起是會員（不讓人練到一半才發現） */}
        {coursePaywallNote && (
          <p className="text-[12px] font-semibold text-center mt-2" style={{ color: 'rgba(22,20,21,0.5)' }}>第 1 週免費，第 2 週起是會員課程</p>
        )}
        </div>
      </div>

      {/* ── 重新生成確認提示 ── */}
      <AnimatePresence>
        {showRegenConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-8"
            style={{ background: 'rgba(22,20,21,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowRegenConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] rounded-[28px] p-7"
              style={{ background: T.PAPER, boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(249,92,75,0.12)' }}>
                <RotateCcw size={20} color={T.CORAL} />
              </div>
              <h3 className="text-[20px] font-black mb-2" style={{ color: T.BLACK }}>重新生成計劃？</h3>
              <p className="text-[13px] leading-relaxed mb-6" style={{ color: 'rgba(22,20,21,0.55)' }}>
                將重新選擇難度、訓練風格與每週天數。完成後請按「開始計劃」套用新課表，目前進度不會被保留。
              </p>
              <div className="flex gap-3">
                <motion.button {...pressProps('cta')}
 onClick={() => setShowRegenConfirm(false)}
 className="flex-1 py-3.5 rounded-[18px] text-[14px] font-black"
 style={{ background: 'rgba(22,20,21,0.06)', color: T.BLACK }}
 >取消</motion.button>
                <motion.button {...pressProps('cta')}
 onClick={() => { setCustomWeeks(null); setReconfigure(true); setShowRegenConfirm(false); }}
 className="flex-1 py-3.5 rounded-[18px] text-[14px] font-black text-white"
 style={{ background: T.CORAL, boxShadow: '0 8px 22px -6px rgba(249,92,75,0.55)' }}
 >確定重選</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── 融合模式預覽 (告訴使用者會用哪種排法) ─── */
/* 天數 → 分化方式。天數是唯讀的，這張表只負責把它翻成人話。 */

function FusionModePreview({ plan, daysPerWeek }) {

  // 直接拿引擎算出來的真實標籤！不再用猜的了！
  const splitLabel = plan?.bodyPartLabel || '針對性動態分化';

  let modeLabel = splitLabel;
  let modeDesc = '';
  let modeIcon = '🎯';

  // 根據引擎真實產出的 splitLabel 來給予對應的專業說明與圖示
  if (splitLabel.includes('沙漏')) {
    modeIcon = '⌛';
    modeDesc = '避開胸與粗腿，集中練肩頸、背與臀。';
  } else if (splitLabel.includes('胸臂')) {
    modeIcon = '🦍';
    modeDesc = '街健/Bro Split 風格，專注於上半身正面視覺與手臂維度，打造極致推力結構。';
  } else if (splitLabel.includes('PPL')) {
    modeIcon = '⚡';
    modeDesc = '黃金標準 Push / Pull / Legs 科學三分化，確保各肌群皆獲得 ≥ 48 小時的完美恢復期。';
  } else if (splitLabel.includes('Upper/Lower')) {
    modeIcon = '⚖️';
    modeDesc = '上下肢輪替，每個肌群一週練到兩次。';
  } else if (splitLabel.includes('Full Body')) {
    modeIcon = '🔥';
    modeDesc = '全身高頻循環，用來突破停滯期。';
  } else if (splitLabel.includes('下肢專項')) {
    modeIcon = '🍑';
    modeDesc = '徹底專注於下肢前側（股四頭）與後鏈（臀/腿後）的輪替，打造極致下盤基底。';
  } else {
    // 也就是 '針對性動態分化' (Dynamic Targeted)
    modeIcon = '🎯';
    modeDesc = '系統將依據您的肌群選擇進行動態分化。大肌群優先徵召，小肌群智能穿插收尾，完美平衡每日神經壓力。';
  }

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px flex-1" style={{ background: 'rgba(22,20,21,0.1)' }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(22,20,21,0.55)' }}>合併後的課表</span>
      </div>
      <div
        className="ti-surface-dark rounded-[24px] p-6 relative overflow-hidden"
        style={{
          boxShadow: '0 20px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-[18px] bg-white/20 flex items-center justify-center text-3xl shadow-inner backdrop-blur-sm border border-white/30">
              {modeIcon}
            </div>
            <div>
              <p className="text-lg font-black text-white tracking-tight">{modeLabel}</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
                <p className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.72)' }}>執行中 · 每週 {daysPerWeek} 天</p>
              </div>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-white/90 font-medium">
            {modeDesc}
          </p>
        </div>
      </div>
    </div>
  );
}
