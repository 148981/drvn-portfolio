/* ════════════════════════════════════════════════════════════════
 * ExercisePlanEditModal — 統一的動作編輯 / 新增彈窗（final-drvn 設計）
 * Swiss editorial × Apple materiality：刷金屬底材 + Mist 冷調層次 + 大留白 +
 * 唯一 Coral 焦點。FusePlan 與 LuxuryPlanView 共用同一份組件。
 *
 *   • 編輯既有動作（initialData 有值）→ DETAIL 視圖
 *       GENERAL chip · 大標動作名 · SETS/REPS/REST chips · 技術備註 · 替換動作
 *   • 新增 / 替換動作 → PICKER 視圖（選肌群網格 → 動作列表）
 *
 * onSave({ name, targetLabel, sets, reps, rest, note })
 * ════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo, memo } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { T } from '../utils/theme';
import { getGlobalExerciseLibrary } from '../data/globalExerciseRegistry';
import { ExercisePicker } from './ExercisePicker';
import { findExerciseByName } from '../utils/exerciseDB';
import { ExerciseDetailSheet } from './WorkoutPreviewSheet';

// ── final-drvn 補充色票（theme.js 沒有 MIST）──
const MIST = '#E8E9E6';          // 唯一冷調中性 — 層次／退到後面的底
const PAPER = T.PAPER;           // #F6F4F1
const STONE = T.STONE;           // #E4DED2
const PEBBLE = T.PEBBLE;         // #CFC6B8
const INK = T.BLACK;             // #161415
const CORAL = T.CORAL;           // #F95C4B

// 乾淨同色卡（不用金屬材質）— 細微陰影即可
const CARD_SHADOW = '0 4px 14px -8px rgba(32,32,32,0.12)';

const SUBPART_ZH = {
  chest: '胸部', back: '背部', shoulder: '肩部', shoulders: '肩部',
  biceps: '二頭', triceps: '三頭', arms: '手臂', legs: '腿部', lower: '下肢',
  quads: '股四頭', glutes: '臀部', glutes_hams: '臀腿', calves: '小腿',
  core: '核心', other: '全身', push: '推', pull: '拉',
};
const exToTargetLabel = (ex) => SUBPART_ZH[ex.subPart] || SUBPART_ZH[ex.bodyCategory || ex.cat] || ex.subPart || '';

const FIELD_OPTS = {
  sets: ['1', '2', '3', '4', '5', '6'],
  reps: ['5', '6', '8', '5-8', '6-10', '8-12', '10-12', '12-15', '15-20', '20+'],
  rest: ['30', '45', '60', '90', '120', '150', '180'],
};

const PICKER_CATS = [
  { id: 'CHEST', label: '胸部訓練', rx: /(胸|chest|bench|fly|pec)/i },
  { id: 'BACK', label: '背部訓練', rx: /(背|back|row|pull|lat|deadlift|硬舉|划船|下拉|引體)/i },
  { id: 'LEGS', label: '腿部訓練', rx: /(腿|leg|squat|lunge|deadlift|calf|深蹲|弓箭步|提踵|quad|hamstring)/i },
  { id: 'GLUTES', label: '臀部訓練', rx: /(臀|glute|hip thrust|臀推|臀橋|kickback)/i },
  { id: 'SHOULDER', label: '肩膀訓練', rx: /(肩|shoulder|delt|overhead|側平舉|前平舉|肩推)/i },
  { id: 'ARMS', label: '手臂訓練', rx: /(手臂|臂|bicep|tricep|arm|curl|彎舉|三頭|下壓)/i },
  { id: 'CORE', label: '核心訓練', rx: /(腹|核心|core|abs|crunch|plank|捲腹|平板)/i },
];

// ── 動作縮圖（lazy load）──
const thumbCache = {};
const ExerciseThumb = memo(({ name, size = 44 }) => {
  const [url, setUrl] = useState(() => thumbCache[name] || null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!name || url || thumbCache[name]) return;
    let dead = false;
    findExerciseByName(name).then(ex => {
      if (dead) return;
      const u = ex?.imageUrls?.[0] || ex?.gifUrl || null;
      if (u) { thumbCache[name] = u; setUrl(u); }
    }).catch(() => {});
    return () => { dead = true; };
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const radius = Math.round(size * 0.28);
  if (url && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, background: MIST, border: `1px solid ${PEBBLE}` }}>
        <img loading="lazy" decoding="async" src={url} alt={name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: MIST, border: `1px solid ${PEBBLE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Dumbbell size={Math.round(size * 0.36)} color="rgba(22,20,21,0.3)" strokeWidth={2} />
    </div>
  );
});

const ExercisePlanEditModal = ({ isOpen, onClose, onSave, initialData }) => {
  const isEdit = !!initialData;
  const [view, setView] = useState(isEdit ? 'detail' : 'picker');
  const [form, setForm] = useState({ name: '', targetLabel: '', sets: 4, reps: '8-12', rest: '90S', note: '' });
  const [field, setField] = useState(null);
  const [cat, setCat] = useState(null);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState(null);   // 唯讀動作預覽（圖一）

  const allExercises = useMemo(() => getGlobalExerciseLibrary(), []);

  useEffect(() => {
    if (isOpen) {
      setView(initialData ? 'detail' : 'picker');
      setField(null); setCat(null); setQuery('');
      setForm(initialData
        ? { name: initialData.name || '', targetLabel: initialData.targetLabel || '', sets: initialData.sets || 4, reps: String(initialData.reps || '8-12'), rest: initialData.rest || '90S', note: initialData.note || '' }
        : { name: '', targetLabel: '', sets: 4, reps: '8-12', rest: '90S', note: '' }
      );
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchResults = query.trim().length >= 1
    ? allExercises.filter(ex => {
        const rx = new RegExp(query.trim().split('').join('.*'), 'i');
        return rx.test(ex.name) || (ex.nameEn && rx.test(ex.nameEn));
      }).slice(0, 60)
    : null;

  const catExercises = cat
    ? allExercises.filter(ex => {
        const c = PICKER_CATS.find(x => x.id === cat);
        return c && (c.rx.test(ex.name) || (ex.nameEn && c.rx.test(ex.nameEn)));
      }).slice(0, 80)
    : null;

  const handlePick = (ex) => {
    const picked = {
      name: ex.name,
      targetLabel: exToTargetLabel(ex),
      sets: ex.sets || form.sets || 4,
      reps: String(ex.reps || form.reps || '8-12'),
      rest: ex.rest || form.rest || '90S',
      note: ex.note || (isEdit ? form.note : ''),
    };
    if (isEdit) { setForm(picked); setView('detail'); }
    else { onSave(picked); onClose(); }
  };

  const pick = (f, v) => { setForm(p => ({ ...p, [f]: v })); setField(null); };
  const save = () => { if (form.name) onSave(form); onClose(); };

  // ── SETS / REPS / REST chip（刷金屬卡）──
  const Chip = ({ label, value, fieldKey }) => {
    const active = field === fieldKey;
    const display = fieldKey === 'rest' ? `${String(value).replace(/s/i, '')}s` : (value || '—');
    return (
      <motion.div whileTap={{ scale: 0.94 }} onClick={() => setField(p => p === fieldKey ? null : fieldKey)}
        style={{
          flex: 1, padding: '18px 8px', borderRadius: 18, textAlign: 'center', cursor: 'pointer',
          background: active ? INK : PAPER,
          border: `1.5px solid ${active ? INK : PEBBLE}`,
          boxShadow: active ? '0 8px 20px -8px rgba(22,20,21,0.4)' : CARD_SHADOW,
          transition: 'all 0.15s',
        }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: active ? 'rgba(246,244,241,0.55)' : 'rgba(22,20,21,0.4)', marginBottom: 10 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 300, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', lineHeight: 1, color: active ? PAPER : INK }}>{display}</div>
      </motion.div>
    );
  };

  // ── 動作列表 row（點主體=預覽、點 + =加入/替換）──
  const Row = ({ ex }) => (
    <div
      style={{ padding: '12px 14px', borderRadius: 14, border: `1px solid ${PEBBLE}`, background: PAPER, boxShadow: CARD_SHADOW, display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <motion.button whileTap={{ scale: 0.98 }} onClick={() => setPreview(ex)}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
        <ExerciseThumb name={ex.name} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {exToTargetLabel(ex) && (
              <span style={{ fontSize: 11, fontWeight: 800, background: MIST, color: 'rgba(22,20,21,0.55)', padding: '2px 8px', borderRadius: 99, letterSpacing: '0.08em' }}>{exToTargetLabel(ex)}</span>
            )}
            {ex.nameEn && <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.35)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{ex.nameEn}</span>}
          </div>
        </div>
      </motion.button>
      <motion.button whileTap={{ scale: 0.88 }} onClick={() => handlePick(ex)} aria-label="加入"
        style={{ width: 34, height: 34, borderRadius: 12, flexShrink: 0, background: INK, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Plus size={15} color={PAPER} />
      </motion.button>
    </div>
  );

  if (!isOpen) return null;

  const backdrop = (children, onBg) => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onBg}>
      {children}
    </motion.div>
  );

  // 乾淨同色 sheet 外殼（無金屬材質）
  const sheetShell = (extra = {}) => ({
    position: 'relative', width: '100%', maxWidth: 500, background: PAPER,
    boxShadow: '0 -20px 60px rgba(0,0,0,0.18)', ...extra,
  });
  const Sheen = () => null;

  // ════════ DETAIL ════════
  const detailSheet = backdrop(
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      onClick={e => e.stopPropagation()}
      style={sheetShell({ borderRadius: '28px 28px 0 0', padding: '10px 24px 0' })}>
      <Sheen />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: PEBBLE, margin: '0 auto 22px' }} />

        <div style={{ fontSize: 12, fontWeight: 800, color: CORAL, letterSpacing: '0.22em', marginBottom: 8 }}>動作資訊 · EXERCISE</div>
        <div style={{ display: 'inline-flex', padding: '5px 13px', borderRadius: 99, background: MIST, border: `1px solid ${PEBBLE}`, marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(22,20,21,0.55)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>{form.targetLabel || 'General'}</span>
        </div>
        <h2 style={{ fontSize: 30, fontWeight: 400, fontFamily: 'var(--font-display)', color: INK, margin: '0 0 24px', lineHeight: 1.05, letterSpacing: '-0.03em' }}>{form.name || '—'}</h2>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <Chip label="SETS" value={form.sets} fieldKey="sets" />
          <Chip label="REPS" value={form.reps} fieldKey="reps" />
          <Chip label="REST" value={form.rest} fieldKey="rest" />
        </div>

        <AnimatePresence>
          {field && (
            <motion.div key={field} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ background: MIST, border: `1px solid ${PEBBLE}`, borderRadius: 18, padding: '14px 16px' }}>
                <div style={{ fontSize: 9, fontWeight: 900, color: CORAL, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>{field}</div>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }} className="no-scrollbar">
                  {(FIELD_OPTS[field] || []).map(opt => {
                    const cur = String(form[field]).replace(/s/i, '');
                    const isSel = cur === String(opt);
                    return (
                      <motion.button key={opt} whileTap={{ scale: 0.9 }}
                        onClick={() => pick(field, field === 'rest' ? `${opt}S` : opt)}
                        style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 12, border: `1.5px solid ${isSel ? INK : PEBBLE}`, background: isSel ? INK : PAPER, color: isSel ? PAPER : INK, fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em' }}>
                        {field === 'rest' ? `${opt}s` : opt}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.4)', marginBottom: 8 }}>技術備註 NOTE</div>
          <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={{ width: '100%', padding: '14px 16px', borderRadius: 18, border: `1px solid ${PEBBLE}`, background: MIST, fontSize: 13, fontWeight: 500, color: INK, outline: 'none', boxSizing: 'border-box' }}
            placeholder="例：手肘微收，避免與肩膀平行" />
        </div>

        <div style={{ display: 'flex', gap: 10, paddingBottom: 36 }}>
          <motion.button whileTap={{ scale: 0.96 }} onClick={save}
            style={{ flex: 1, padding: '16px', borderRadius: 18, background: MIST, border: `1px solid ${PEBBLE}`, color: INK, fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em' }}>
            {isEdit ? '關閉' : '儲存'}
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => { setView('picker'); setCat(null); setQuery(''); }}
            style={{ flex: 2, padding: '16px', borderRadius: 18, background: INK, border: 'none', color: PAPER, fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', boxShadow: '0 8px 20px -8px rgba(22,20,21,0.5)' }}>
            替換動作
          </motion.button>
        </div>
      </div>
    </motion.div>,
    () => field ? setField(null) : (isEdit ? save() : onClose())
  );

  // ════════ PICKER — 改用全 App 共用的 ExercisePicker（分類 + 圖片）════════
  //   挑到動作 → handlePick：新增即 onSave、編輯則進入 detail 設定步驟。
  const pickerSheet = (
    <ExercisePicker
      title={isEdit ? '替換動作' : '選擇動作'}
      onSelect={(ex) => handlePick(ex)}
      onClose={() => { if (isEdit) setView('detail'); else onClose(); }}
    />
  );

  return ReactDOM.createPortal(
    <>
      <AnimatePresence>{view === 'detail' ? detailSheet : pickerSheet}</AnimatePresence>
      <AnimatePresence>
        {preview && <ExerciseDetailSheet key="preview" ex={preview} onClose={() => setPreview(null)} />}
      </AnimatePresence>
    </>,
    document.body
  );
};

export default ExercisePlanEditModal;
