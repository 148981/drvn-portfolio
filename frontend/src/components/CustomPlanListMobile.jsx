import React, { useState, useCallback, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { confirmDialog, toast } from '../utils/toast';
import { activateProgram, newProgramId } from '../utils/trainingProgram';
import { getUserId } from '../utils/auth';
import { BlockLibraryModal } from './WorkoutBlockModals';
import { loadBlocks, hydrateBlocksFromCloud } from '../utils/workoutBlocks';
import { pushBlob, hydrateIfLocalEmpty } from '../utils/cloudSync';

/** 本地日期鍵 YYYY-MM-DD（toISOString 是 UTC，跨時區會差一天） */
const toLocalDayKeyForPlan = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};


// ─── Design tokens ────────────────────────────────────────────────
const P = {
  paper:   '#F6F4F1',
  stone:   '#E4DED2',
  pebble:  '#CFC6B8',
  ink:     '#161415',
  coral:   '#F95C4B',
  muted:   '#6B6B6B',
  hairline: '1.5px solid #CFC6B8',
  hairlineInk: '1.5px solid #161415',
};

const Label = ({ children, style }) => (
  <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: P.muted, fontFamily: 'var(--font-display)', ...style }}>
    {children}
  </span>
);

const HR = ({ style }) => <div style={{ height: 1.5, background: P.pebble, ...style }} />;

// ─── Load / save helpers ──────────────────────────────────────────
const loadPlans = () => {
  try { return JSON.parse(localStorage.getItem('drvn_custom_plans') || '[]'); }
  catch { return []; }
};
const savePlans = (plans) => {
  localStorage.setItem('drvn_custom_plans', JSON.stringify(plans));
  // ☁️ best-effort 雲端備份（換機不遺失）
  pushBlob('custom_plans', plans || []);
};

// ─── Plan stats helper ────────────────────────────────────────────
const planStats = (plan) => {
  const totalEx = (plan.weeks || []).reduce((wAcc, w) =>
    wAcc + (w.days || []).reduce((dAcc, d) => dAcc + (d.exercises || []).length, 0), 0);
  const totalDays = (plan.weeks || []).reduce((acc, w) => acc + (w.days || []).length, 0);
  return { totalEx, totalDays };
};

// ─── Day preview row ─────────────────────────────────────────────
const DayPreview = ({ day }) => {
  const focusColors = {
    PUSH: P.coral, PULL: '#3B82F6', LEGS: '#8B5CF6',
    UPPER: '#059669', LOWER: '#D97706', 'FULL BODY': '#0891B2',
    CARDIO: '#DB2777', REST: P.muted,
  };
  const fc = focusColors[day.focus] || P.ink;
  return (
    <div style={{ paddingBottom: 14, borderBottom: '1px solid rgba(22,20,21,0.08)', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(22,20,21,0.5)', minWidth: 20 }}>
          {String(day.dayNumber).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 9, letterSpacing: '0.15em', color: fc, fontFamily: 'var(--font-display)', textTransform: 'uppercase', fontWeight: 600 }}>
          {day.focus}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(22,20,21,0.4)' }}>{day.exercises.length} 動作</span>
      </div>
      {day.exercises.slice(0, 4).map((ex, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 30, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.3)', minWidth: 14, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
          <span style={{ fontSize: 13, color: P.ink, fontWeight: 500 }}>{ex.name}</span>
          <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', marginLeft: 'auto', fontWeight: 600 }}>{ex.sets}×{ex.reps}</span>
        </div>
      ))}
      {day.exercises.length > 4 && (
        <div style={{ paddingLeft: 44, fontSize: 11, color: 'rgba(22,20,21,0.4)', marginTop: 4, fontStyle: 'italic' }}>
          +{day.exercises.length - 4} 更多動作
        </div>
      )}
    </div>
  );
};

// ─── Plan card ───────────────────────────────────────────────────
const PlanCard = ({ plan, onExecute, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeWeek, setActiveWeek] = useState(0);
  const stats = planStats(plan);
  const weeks = plan.weeks || [];

  return (
    <div style={{
      border: '1px solid rgba(255, 255, 255, 0.35)',
      borderRadius: 24,
      marginBottom: 16,
      overflow: 'hidden',
      background: 'rgba(207, 198, 184, 0.45)',
      backdropFilter: 'blur(48px) saturate(150%)',
      WebkitBackdropFilter: 'blur(48px) saturate(150%)',
      boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.25), 0 8px 24px rgba(0, 0, 0, 0.06)',
    }}>
      {/* Card header */}
      <div style={{ padding: '20px 20px', background: 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: P.ink, lineHeight: 1.2, marginBottom: 6 }}>
              {plan.name}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.6)' }}>{weeks.length} 週</span>
              <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.3)' }}>·</span>
              <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.6)' }}>{plan.daysPerWeek} 天/週</span>
              <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.3)' }}>·</span>
              <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.6)' }}>{stats.totalEx} 個動作</span>
            </div>
          </div>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <motion.button {...pressProps('row')} onClick={() => onEdit(plan)} style={{ padding: '8px 12px', border: '1px solid rgba(22,20,21,0.1)', borderRadius: 12, background: 'rgba(255,255,255,0.4)', fontSize: 12, color: P.ink, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
              編輯
            </motion.button>
            <motion.button {...pressProps('row')} onClick={() => onDelete(plan._id)} style={{ padding: '8px 10px', border: '1px solid rgba(22,20,21,0.1)', borderRadius: 12, background: 'rgba(255,255,255,0.4)', fontSize: 14, color: '#E53E3E', cursor: 'pointer', lineHeight: 1 }}>
              ×
            </motion.button>
          </div>
        </div>

        {/* Execute button — Liquid Glass（深色玻璃材質：半透明墨色 + 背景模糊 + 內緣高光） */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onExecute(plan)}
          style={{
            marginTop: 18, width: '100%', padding: '14px 0',
            background: 'rgba(22,20,21,0.82)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            border: '1px solid rgba(255,255,255,0.16)', borderRadius: 18,
            fontSize: 14, letterSpacing: '0.14em', color: P.paper,
            fontFamily: 'var(--font-display)', cursor: 'pointer', fontWeight: 600,
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.22), 0 8px 22px -8px rgba(22,20,21,0.45)'
          }}
        >
          ▶ 執行此計劃
        </motion.button>

        {/* Preview toggle */}
        <motion.button {...pressProps('row')}
 onClick={() => setExpanded(e => !e)}
 style={{ marginTop: 12, width: '100%', padding: '8px 0', background: 'transparent', border: 'none', fontSize: 12, color: 'rgba(22,20,21,0.5)', cursor: 'pointer', fontFamily: 'var(--font-display)', letterSpacing: '0.12em' }}
 >
          {expanded ? '收起預覽 ▲' : '查看完整計劃 ▼'}
        </motion.button>
      </div>

      {/* Expanded preview */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="preview"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            style={{ overflow: 'hidden' }}
            transition={{ duration: 0.25 }}
          >
            <div style={{ borderTop: '1px solid rgba(22,20,21,0.08)', background: 'transparent' }}>
              {/* Week tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(22,20,21,0.08)', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                {weeks.map((w, i) => (
                  <motion.button {...pressProps('row')}
 key={w._id || i}
 onClick={() => setActiveWeek(i)}
 style={{
 flexShrink: 0, padding: '12px 18px',
 background: activeWeek === i ? 'rgba(22,20,21,0.05)' : 'transparent',
 color: activeWeek === i ? P.ink : 'rgba(22,20,21,0.4)',
 border: 'none', borderRight: '1px solid rgba(22,20,21,0.08)',
 fontSize: 9, letterSpacing: '0.18em', fontFamily: 'var(--font-display)',
 cursor: 'pointer', fontWeight: activeWeek === i ? 600 : 400
 }}
 >
                    W{w.week_number} · {w.phase}
                  </motion.button>
                ))}
              </div>

              {/* Days for active week */}
              <div style={{ padding: '20px 20px' }}>
                {(weeks[activeWeek]?.days || []).map(day => (
                  <DayPreview key={day._id || day.dayNumber} day={day} />
                ))}
                {(weeks[activeWeek]?.days || []).length === 0 && (
                  <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'rgba(22,20,21,0.4)' }}>此週尚無訓練日</div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Root component ───────────────────────────────────────────────
const CustomPlanListMobile = ({ userId }) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState(loadPlans);
  const [executing, setExecuting] = useState(null);
  const [blockLibOpen, setBlockLibOpen] = useState(false);
  const [cloudTick, setCloudTick] = useState(0); // 雲端還原後觸發重繪
  // 每次 render 直接重讀，關閉 Block 庫(setState→重繪)後即反映新增/刪除
  const blockCount = loadBlocks().length;

  // ☁️ 換機還原：本地為空且雲端有 → 拉回，並重繪畫面
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await hydrateIfLocalEmpty('drvn_custom_plans', 'custom_plans',
        (v) => !Array.isArray(v) || v.length === 0);
      const b = await hydrateBlocksFromCloud();
      if (alive && (p || b)) {
        setPlans(loadPlans());
        setCloudTick(t => t + 1);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleExecute = useCallback(async (plan) => {
    setExecuting(plan._id);
    try {
      // Adapt local plan shape to the backend API format
      const payload = {
        plan_name: plan.name,
        weeks: plan.weeks.map(w => ({
          week_number: w.week_number,
          phase: w.phase,
          days: w.days.map(d => ({
            day_number: d.dayNumber,
            focus: d.focus,
            exercises: d.exercises.map(ex => ({
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rest: ex.rest,
            })),
            warmup: [],
          })),
        })),
        isCustom: true,
      };

      // Build a plan object shaped the way LuxuryPlanViewMobile expects
      const luxuryPlan = {
        ...payload,
        plan_id: `custom_${plan._id}`,
        plan_name: plan.name,
        // Map days to the shape LuxuryPlanViewMobile renders
        weeks: payload.weeks.map((w, wi) => ({
          ...w,
          days: w.days.map((d, di) => ({
            ...d,
            dayNumber: d.day_number ?? di + 1,
            focus: d.focus,
            exercises: d.exercises,
            time: d.exercises.length * 5 + 15,
          })),
        })),
        isCustom: true,
        // 中控台要算「跑到第幾週」→ 執行的那一刻就是這份課表的起始日
        startDate: toLocalDayKeyForPlan(new Date()),
      };

      // 存上後端並設為目前計劃（跟精靈、預設課表同一條路）。
      // 以前打的是不存在的 /api/users/{id}/workout-plan，失敗被吞掉，
      // 計劃只在本機 —— 下次開中控就被後端的上一份蓋回去。
      const uid = userId || getUserId();
      let saved;
      try {
        saved = await activateProgram(uid, {
          program_id: newProgramId(),
          strength: { ...luxuryPlan, custom_plan_id: plan._id },
        }, apiClient);
      } catch {
        toast.error('計劃還沒存好，請確認連線後再按一次。');
        return;
      }

      navigate('/luxury-plan-view-mobile', {
        replace: true,
        state: { plan: saved?.strength || luxuryPlan },
      });
    } finally {
      setExecuting(null);
    }
  }, [userId, navigate]);

  const handleEdit = useCallback((plan) => {
    // Pass plan id via sessionStorage so CustomPlanBuilderMobile can load it
    sessionStorage.setItem('editingCustomPlanId', plan._id);
    navigate('/custom-plan-builder');
  }, [navigate]);

  const handleDelete = useCallback(async (planId) => {
    if (!(await confirmDialog('確定要刪除這個計劃嗎？', { danger: true }))) return;
    const updated = plans.filter(p => p._id !== planId);
    setPlans(updated);
    savePlans(updated);
    /* 這裡刪的是「我的計劃庫」裡的範本。正在執行的那份已經是一份獨立的計劃（存在後端），
       不跟著刪 —— 以前會清掉本機的目前計劃，但後端還在，下次打開又冒回來，看起來像刪不掉。 */
  }, [plans]);

  return (
    <div style={{
      minHeight: '100dvh', background: P.paper,
      fontFamily: 'var(--font-display)', color: P.ink,
      maxWidth: 430, margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '0 20px 0',
        paddingTop: 'max(52px, env(safe-area-inset-top, 52px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 14 }}>
          <motion.button {...pressProps('row')} onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 20, color: P.ink, cursor: 'pointer', marginRight: 'auto', padding: '4px 0' }}>
            ←
          </motion.button>
          <Label>我的計劃庫</Label>
          <div style={{ marginLeft: 'auto', width: 28 }} />
        </div>
        <HR />

        {/* Title */}
        <div style={{ paddingTop: 28, paddingBottom: 24 }}>
          <h1 style={{ fontSize: 32, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, color: P.ink, margin: 0, lineHeight: 1.1 }}>
            自訂計劃庫
          </h1>
          <p style={{ fontSize: 13, color: P.muted, marginTop: 8, lineHeight: 1.5 }}>
            {plans.length} 個計劃 · 選擇執行或繼續編輯
          </p>
        </div>

        {/* 我的 Block 庫 入口 */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setBlockLibOpen(true)}
          style={{
            width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12,
            background: P.stone, border: 'none', borderRadius: 14, padding: '14px 16px', marginBottom: 22,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 18 }}>🧱</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: P.ink }}>我的 Block 庫</div>
            <div style={{ fontSize: 11, color: P.muted, marginTop: 2 }}>{blockCount} 個訓練積木 · 管理 / 刪除</div>
          </div>
          <span style={{ fontSize: 16, color: P.muted }}>›</span>
        </motion.button>
      </div>

      {/* Plan list */}
      <div style={{ padding: '0 20px', paddingBottom: 100 }}>
        {plans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 13, color: P.muted, marginBottom: 24, lineHeight: 1.6 }}>
              尚未建立任何自訂計劃
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/custom-plan-builder')}
              style={{ padding: '14px 32px', background: P.ink, color: P.paper, border: 'none', borderRadius: 2, fontSize: 13, fontFamily: 'inherit', letterSpacing: '0.14em', cursor: 'pointer' }}
            >
              ＋ 建立第一個計劃
            </motion.button>
          </div>
        ) : (
          <>
            {plans.map(plan => (
              <PlanCard
                key={plan._id}
                plan={plan}
                onExecute={handleExecute}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </>
        )}
      </div>

      {/* Sticky footer — New Plan */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: P.paper, borderTop: P.hairline,
        padding: '14px 20px',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))',
      }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/custom-plan-builder')}
          style={{
            width: '100%', padding: '14px 0',
            border: P.hairlineInk, borderRadius: 2,
            background: 'transparent', color: P.ink,
            fontSize: 13, letterSpacing: '0.14em', fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          ＋ 新增計劃
        </motion.button>
      </div>

      {/* 我的 Block 庫 */}
      <BlockLibraryModal open={blockLibOpen} onClose={() => setBlockLibOpen(false)} />
    </div>
  );
};

export default CustomPlanListMobile;
