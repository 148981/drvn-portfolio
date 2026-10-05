import React, { useState, useCallback, useRef, useEffect, memo, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { GripVertical, Edit2, Trash2 } from 'lucide-react';
import { getGlobalExerciseLibrary, getCategorizedGlobalLibrary, searchGlobalExercises } from '../data/globalExerciseRegistry';
import { getUserId } from '../utils/auth';
import { SaveWorkoutBlockModal, BlockPickerModal } from './WorkoutBlockModals';
import { blockToDayExercises } from '../utils/workoutBlocks';
import { ExercisePicker } from './ExercisePicker';
import FirstTimeHint from './FirstTimeHint';
import { mediaUrl } from '../utils/apiHostFix';

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

// ─── Data helpers ─────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 9);

const PHASES = ['BASE', 'BUILD', 'PEAK', 'DELOAD', 'BUILD II', 'PEAK II', 'TEST', 'STRENGTH'];
const FOCUS_OPTIONS = ['PUSH', 'PULL', 'LEGS', 'UPPER', 'LOWER', 'FULL BODY', 'CARDIO', 'REST'];
const FOCUS_COLORS  = {
  PUSH: '#F95C4B', PULL: '#3B82F6', LEGS: '#8B5CF6',
  UPPER: '#059669', LOWER: '#D97706', 'FULL BODY': '#0891B2',
  CARDIO: '#DB2777', REST: '#6B7280',
};

// 分類標籤 → globalExerciseRegistry 的 bodyCategory / subPart 篩選條件
const CAT_FILTERS = {
  '胸':   e => (e.bodyCategory || e.cat) === 'push' && (e.subPart || '').includes('chest'),
  '背':   e => (e.bodyCategory || e.cat) === 'back',
  // 腿 = 整個下肢，含股四頭 / 臀 / 腿後側 / 小腿（臀推也算腿日，因此腿仍看得到臀）
  '腿':   e => (e.bodyCategory || e.cat) === 'lower' || ['quads','glutes','hamstrings','calves'].includes(e.subPart),
  '肩':   e => (e.subPart||'').includes('delt') || (e.bodyCategory || e.cat) === 'shoulder',
  '手臂': e => (e.bodyCategory || e.cat) === 'arms' || ['biceps','triceps'].includes(e.subPart),
  '核心': e => (e.bodyCategory || e.cat) === 'core',
  // 臀獨立分類 — registry 的 subPart 實際是 'glutes'（先前誤寫 glutes_hams 導致永遠空白）
  '臀':   e => e.subPart === 'glutes',
  '全身': () => true,
};
const CAT_LABELS = Object.keys(CAT_FILTERS);

// 四週漸進方案
const PROGRESSIVE_SCHEMES = [
  { label: 'BASE',   sets: 3, reps: '10–12', rest: '90s' },
  { label: 'BUILD',  sets: 4, reps: '8–10',  rest: '90s' },
  { label: 'PEAK',   sets: 5, reps: '6–8',   rest: '120s' },
  { label: 'DELOAD', sets: 2, reps: '12–15', rest: '60s' },
];

const mkExerciseFromGlobal = (ex) => ({
  _id: genId(),
  name: ex.name,
  nameEn: ex.nameEn || '',
  sets: ex.defaultSets || 3,
  reps: ex.defaultReps || '10–12',
  rest: ex.defaultRest || '90s',
  cat: ex.bodyCategory || ex.cat,
  equipment: ex.equipment || '',
  targetLabel: ex.targetLabel || '',
  image_url: ex.image_url || '',
});

const mkDay = (num, templateFoci, idx) => ({
  _id: genId(),
  dayNumber: num,
  focus: templateFoci ? (templateFoci[idx % templateFoci.length] || FOCUS_OPTIONS[idx % FOCUS_OPTIONS.length])
                      : FOCUS_OPTIONS[idx % FOCUS_OPTIONS.length],
  exercises: [],
});

const mkWeek = (num, daysPerWeek, templateFoci) => ({
  _id: genId(),
  week_number: num,
  phase: PHASES[num - 1] || `W${num}`,
  days: Array.from({ length: daysPerWeek }, (_, i) => mkDay(i + 1, templateFoci, i)),
});

// ─── Tiny label ───────────────────────────────────────────────────
const Label = ({ children, style }) => (
  <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: P.muted, fontFamily: 'var(--font-display)', ...style }}>{children}</span>
);
const HR = ({ style }) => <div style={{ height: 1.5, background: P.pebble, ...style }} />;

// ─── free-exercise-db image lookup ───────────────────────────────
// One JSON fetch → all images, zero per-exercise API calls
const FREE_DB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const FREE_DB_JSON = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const IMG_CACHE = new Map();   // nameEn-key → resolved image URL (or null)
let _freeDbMap  = null;        // null = not yet loaded, Map = ready

// Strip everything except a-z0-9 for fuzzy name matching
const _norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function _loadFreeDb() {
  if (_freeDbMap !== null) return _freeDbMap;
  _freeDbMap = new Map(); // lock against concurrent loads
  try {
    const res = await fetch(FREE_DB_JSON, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return _freeDbMap;
    const list = await res.json();
    for (const ex of list) {
      if (ex.images?.length) {
        // images[0] is like "Barbell_Bench_Press/0.jpg" — prepend base URL
        _freeDbMap.set(_norm(ex.name), FREE_DB_BASE + ex.images[0]);
        // Also index by id (same thing but with underscores → space-less)
        _freeDbMap.set(_norm(ex.id.replace(/_/g, ' ')), FREE_DB_BASE + ex.images[0]);
      }
    }
  } catch { /* network failure — all lookups return null */ }
  return _freeDbMap;
}

const fetchExerciseImage = async (nameEn) => {
  if (!nameEn || /[一-鿿]/.test(nameEn)) return null;
  const key = _norm(nameEn);
  if (IMG_CACHE.has(key)) return IMG_CACHE.get(key);

  const map = await _loadFreeDb();
  const url = map.get(key) ?? null;
  IMG_CACHE.set(key, url);
  return url;
};

// ─── Exercise image thumb ─────────────────────────────────────────
// lazy=true  → fetch photo via IntersectionObserver (picker)
// lazy=false → emoji only (plan day rows — no network cost)
const ExThumb = memo(({ equipment, nameEn, imageUrl, lazy = false, size = 48, isCustom = false }) => {
  const [imgUrl, setImgUrl]       = useState(() => {
    if (imageUrl) return mediaUrl(imageUrl);
    // [修復] 自訂動作不走資料庫圖片
    if (isCustom) return null;
    const k = _norm(nameEn || '');
    return k && IMG_CACHE.has(k) ? IMG_CACHE.get(k) : null;
  });
  const [imgLoaded, setImgLoaded] = useState(false);
  const ref       = useRef(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (!lazy || !nameEn || /[一-鿿]/.test(nameEn) || isCustom) return;
    const k = _norm(nameEn);
    if (IMG_CACHE.has(k)) { setImgUrl(IMG_CACHE.get(k)); return; }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !triggered.current) {
          triggered.current = true;
          obs.disconnect();
          fetchExerciseImage(nameEn).then(url => { if (url) setImgUrl(url); });
        }
      },
      { threshold: 0.1, rootMargin: '160px' }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [nameEn, lazy, isCustom]);

  const icons = { barbell: '🏋️', dumbbell: '💪', cable: '🔗', machine: '🤖', bodyweight: '🧍' };
  const icon = icons[equipment] || '●';

  return (
    <div
      ref={ref}
      style={{
        width: size, height: size, borderRadius: 12, background: P.stone,
        border: '1px solid rgba(255,255,255,0.5)', overflow: 'hidden', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, position: 'relative',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)',
      }}
    >
      {imgUrl && (
        <img loading="lazy" decoding="async"
          src={imgUrl}
          alt=""
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgUrl(null); setImgLoaded(false); }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s',
          }}
        />
      )}
      {(!imgUrl || !imgLoaded) && <span>{icon}</span>}
    </div>
  );
});

// ─── Exercise row ─────────────────────────────────────────────────
const ExRow = memo(({ ex, onDelete, onEdit, dragControls }) => {
  const restSec = ex.rest ? `${ex.rest}`.replace('s','') + 's' : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 18,
      // Liquid Glass：半透明白 + 背景模糊 + 內緣高光，對齊圖三的玻璃質感
      background: 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      border: '1px solid rgba(255,255,255,0.7)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.8), 0 4px 14px -8px rgba(22,20,21,0.18)',
      marginBottom: 8,
    }}>
      {/* Drag handle */}
      <div
        onPointerDown={e => { e.preventDefault(); dragControls && dragControls.start(e); }}
        style={{ cursor: 'grab', padding: '4px', display: 'flex', alignItems: 'center', color: 'rgba(22,20,21,0.2)' }}
      >
        <GripVertical size={16} />
      </div>

      {/* lazy 開啟 → 計劃動作列也載入照片（對齊圖三），中文名動作自動 fallback emoji */}
      <ExThumb equipment={ex.equipment} nameEn={ex.nameEn} lazy />

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: P.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.name}</div>
        <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', fontWeight: 600, marginTop: 2, letterSpacing: '0.04em' }}>
          {ex.sets} × {ex.reps}{restSec ? ` · ${restSec}` : ''}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <motion.button {...pressProps('row')}
 onClick={(e) => { e.stopPropagation(); onEdit(ex); }}
 style={{ width: 34, height: 34, borderRadius: 12, background: '#F0EDE7', border: `1px solid ${P.pebble}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
 >
          <Edit2 size={13} color="rgba(22,20,21,0.55)" />
        </motion.button>
        <motion.button {...pressProps('row')}
 onClick={(e) => { e.stopPropagation(); onDelete(ex._id); }}
 style={{ width: 34, height: 34, borderRadius: 12, background: 'rgba(249,92,75,0.1)', border: '1px solid rgba(249,92,75,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
 >
          <Trash2 size={13} color={P.coral} />
        </motion.button>
      </div>
    </div>
  );
});

// ─── Draggable exercise item ──────────────────────────────────────
const DraggableExItem = ({ ex, onDelete, onEdit }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item as="div" value={ex} dragListener={false} dragControls={controls} style={{ listStyle: 'none', position: 'relative' }}>
      <ExRow ex={ex} onDelete={onDelete} onEdit={onEdit} dragControls={controls} />
    </Reorder.Item>
  );
};

// ─── Day accordion ────────────────────────────────────────────────
const DayRow = memo(({ day, weekIdx, dayIdx, onFocusChange, onAddExercise, onDeleteEx, onEditEx, onReorderEx, onPickBlock, onSaveBlock }) => {
  const [open, setOpen] = useState(false);
  const focusColor = FOCUS_COLORS[day.focus] || P.ink;

  return (
    <div style={{ borderBottom: P.hairline }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', cursor: 'pointer' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.2em', color: P.muted, minWidth: 24, fontFamily: 'var(--font-display)' }}>
          {String(day.dayNumber).padStart(2, '0')}
        </span>
        <motion.button {...pressProps('row')}
 onClick={e => { e.stopPropagation(); onFocusChange(weekIdx, dayIdx); }}
 style={{ padding: '4px 12px', borderRadius: 12, border: `1.5px solid ${focusColor}`, color: focusColor, fontSize: 9, letterSpacing: '0.18em', fontFamily: 'var(--font-display)', background: 'transparent', cursor: 'pointer', textTransform: 'uppercase' }}
 >{day.focus}</motion.button>
        <span style={{ flex: 1, fontSize: 12, color: P.muted }}>{day.exercises.length} 個動作</span>
        <span style={{ fontSize: 12, color: P.muted, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
            <div style={{ paddingLeft: 36, paddingBottom: 12 }}>
              {day.exercises.length === 0 && (
                <div style={{ padding: '12px 0', fontSize: 12, color: P.muted, fontStyle: 'italic' }}>尚未新增動作</div>
              )}
              <Reorder.Group as="div" axis="y" values={day.exercises} onReorder={newOrder => onReorderEx(weekIdx, dayIdx, newOrder)} style={{ margin: 0, padding: 0 }}>
                {day.exercises.map(ex => (
                  <DraggableExItem
                    key={ex._id}
                    ex={ex}
                    onDelete={id => onDeleteEx(weekIdx, dayIdx, id)}
                    onEdit={ex => onEditEx(weekIdx, dayIdx, ex)}
                  />
                ))}
              </Reorder.Group>
              <motion.button {...pressProps('row')}
 onClick={() => onAddExercise(weekIdx, dayIdx)}
 style={{ marginTop: 8, width: '100%', padding: '10px 0', border: `1.5px dashed ${P.pebble}`, borderRadius: 4, background: 'transparent', color: P.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.1em' }}
 >＋ 新增動作</motion.button>

              {/* Block 區塊化：挑選現成 block 填入這天，或把這天存成 block */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <motion.button {...pressProps('row')}
 onClick={() => onPickBlock(weekIdx, dayIdx)}
 style={{ flex: 1, padding: '9px 0', border: `1.5px solid ${P.ink}`, borderRadius: 4, background: 'transparent', color: P.ink, fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em', fontFamily: 'inherit', fontWeight: 600 }}
 >📥 從 Block 選擇</motion.button>
                <motion.button {...pressProps('row')}
 disabled={day.exercises.length === 0}
 onClick={() => onSaveBlock(weekIdx, dayIdx)}
 style={{ flex: 1, padding: '9px 0', border: `1.5px solid ${day.exercises.length === 0 ? P.pebble : P.ink}`, borderRadius: 4, background: 'transparent', color: day.exercises.length === 0 ? P.pebble : P.ink, fontSize: 11, cursor: day.exercises.length === 0 ? 'not-allowed' : 'pointer', letterSpacing: '0.08em', fontFamily: 'inherit', fontWeight: 600 }}
 >💾 存成 Block</motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── Tier metadata ────────────────────────────────────────────────
const TIER_META = {
  1: { label: 'S · 主要複合動作', color: P.coral },
  2: { label: 'A · 輔助動作',     color: '#3B82F6' },
  3: { label: 'B · 孤立動作',     color: P.muted },
};

// ─── Exercise picker (uses globalExerciseRegistry + free-exercise-db photos) ──
const ExPicker = ({ onSelect, onClose }) => {
  const [query, setQuery]       = useState('');
  const [category, setCategory] = useState(null);
  const [dbReady, setDbReady]   = useState(false);

  // Kick off the free-exercise-db JSON fetch immediately when picker opens
  useEffect(() => {
    _loadFreeDb().then(() => setDbReady(true));
  }, []);

  // Load all exercises once — synchronous local registry
  const [customExercises, setCustomExercises] = useState([]);

  useEffect(() => {
    const fetchCustom = async () => {
      try {
        const userId = getUserId();
        const res = await fetch(`http://${window.location.hostname}:8000/api/exercises/custom?user_id=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setCustomExercises(data.exercises || []);
        }
      } catch (e) {
        console.error('Failed to fetch custom exercises', e);
      }
    };
    fetchCustom();
  }, []);

  const allExercises = useMemo(() => {
    const globalLib = getGlobalExerciseLibrary();
    let merged = [...globalLib, ...customExercises];
    // deduplicate by name
    const nameMap = new Map();
    merged.forEach(ex => nameMap.set(ex.name.toLowerCase().replace(/\s/g, ''), ex));
    return Array.from(nameMap.values());
  }, [customExercises]);

  const results = useMemo(() => {
    let filtered = allExercises;
    if (category && CAT_FILTERS[category]) {
      filtered = allExercises.filter(CAT_FILTERS[category]);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.nameEn || '').toLowerCase().includes(q) ||
        (e.targetLabel || '').toLowerCase().includes(q)
      );
    }
    // Sort by tier ascending (1 = main compounds first)
    return [...filtered].sort((a, b) => (a.tier || 9) - (b.tier || 9));
  }, [allExercises, query, category]);

  // Group results by tier for section headers
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => (a.tier || 9) - (b.tier || 9));
  }, [results]);

  const sheet = (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: P.paper, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)' }}
    >
      {/* ── Header ── */}
      <div style={{ padding: '20px 20px 12px', borderBottom: P.hairline, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Label>選擇動作</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!dbReady && (
              <span style={{ fontSize: 11, color: P.muted, letterSpacing: '0.06em' }}>載入圖片中…</span>
            )}
            <motion.button {...pressProps('row')} onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: P.muted, cursor: 'pointer', lineHeight: 1 }}>×</motion.button>
          </div>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜尋動作名稱（中 / 英）…"
          style={{ width: '100%', padding: '10px 12px', border: P.hairline, borderRadius: 4, background: P.stone, fontSize: 13, color: P.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 10, paddingBottom: 2, scrollbarWidth: 'none' }}>
          {CAT_LABELS.map(cat => (
            <motion.button {...pressProps('row')}
 key={cat}
 onClick={() => setCategory(c => c === cat ? null : cat)}
 style={{ flexShrink: 0, padding: '6px 14px', border: `1.5px solid ${category === cat ? P.ink : P.pebble}`, borderRadius: 12, background: category === cat ? P.ink : 'transparent', color: category === cat ? P.paper : P.ink, fontSize: 9, letterSpacing: '0.12em', cursor: 'pointer', fontFamily: 'inherit' }}
 >{cat}</motion.button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        {results.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: P.muted, fontSize: 13 }}>無搜尋結果</div>
        )}

        {sortedResults.map((ex, i) => {
          const t = ex.tier || 3;
          const meta = TIER_META[t] || TIER_META[3];
          return (
            <motion.button {...pressProps('row')}
 key={`${ex.name}-${i}`}
 onClick={() => onSelect(mkExerciseFromGlobal(ex))}
 style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 8, borderRadius: 18,
 // Liquid Glass 列卡 — 對齊圖三選擇動作的玻璃質感
 background: 'rgba(255,255,255,0.5)',
 backdropFilter: 'blur(18px) saturate(160%)',
 WebkitBackdropFilter: 'blur(18px) saturate(160%)',
 border: '1px solid rgba(255,255,255,0.65)',
 boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.75), 0 3px 12px -8px rgba(22,20,21,0.16)',
 cursor: 'pointer', textAlign: 'left' }}
 >
              <ExThumb
                equipment={ex.equipment} 
                nameEn={ex.nameEn} 
                imageUrl={ex.image_url} 
                lazy 
                size={48} 
                isCustom={!!(ex.userId || ex.sourcePlan === 'Custom')}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: P.ink, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.name}</div>
                <div style={{ fontSize: 12, color: P.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {ex.targetLabel && <span style={{ color: meta.color }}>{ex.targetLabel}</span>}
                  {ex.targetLabel && ex.equipment && <span style={{ color: 'rgba(22,20,21,0.2)' }}>·</span>}
                  {ex.equipment && <span style={{ opacity: 0.7 }}>{ex.equipment}</span>}
                </div>
              </div>
            </motion.button>
          );
        })}
        <div style={{ height: 48 }} />
      </div>
    </motion.div>
  );

  return ReactDOM.createPortal(<AnimatePresence>{sheet}</AnimatePresence>, document.body);
};

// ─── Exercise edit sheet ──────────────────────────────────────────
const ExEditSheet = ({ ex, onSave, onClose }) => {
  const [local, setLocal] = useState({ ...ex });
  const set = (key, val) => setLocal(p => ({ ...p, [key]: val }));

  const sheet = (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 340, damping: 38 }}
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9998, background: P.paper, borderRadius: '18px 20px 0 0', padding: '24px 24px 40px', fontFamily: 'var(--font-display)', boxShadow: '0 -4px 40px rgba(0,0,0,0.12)' }}
    >
      <div style={{ width: 36, height: 4, background: P.pebble, borderRadius: 2, margin: '0 auto 20px' }} />
      <Label style={{ marginBottom: 16, display: 'block' }}>編輯動作</Label>
      <div style={{ fontSize: 18, fontWeight: 700, color: P.ink, marginBottom: 20, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>{local.name}</div>
      {[
        { key: 'sets', label: '組數', type: 'number', placeholder: '3' },
        { key: 'reps', label: '次數', type: 'text', placeholder: '10–12' },
        { key: 'rest', label: '休息', type: 'text', placeholder: '90s' },
      ].map(field => (
        <div key={field.key} style={{ marginBottom: 14 }}>
          <Label style={{ marginBottom: 6, display: 'block' }}>{field.label}</Label>
          <input
            value={local[field.key]}
            onChange={e => set(field.key, e.target.value)}
            type={field.type}
            placeholder={field.placeholder}
            style={{ width: '100%', padding: '10px 12px', border: P.hairline, borderRadius: 4, background: P.stone, fontSize: 14, color: P.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', border: P.hairlineInk, borderRadius: 0, marginTop: 24, overflow: 'hidden' }}>
        <motion.button {...pressProps('row')} onClick={onClose} style={{ flex: 1, padding: 14, background: 'transparent', border: 'none', borderRight: P.hairlineInk, cursor: 'pointer', fontSize: 13, color: P.ink, fontFamily: 'inherit' }}>取消</motion.button>
        <motion.button {...pressProps('row')} onClick={() => { onSave(local); onClose(); }} style={{ flex: 1, padding: 14, background: P.ink, border: 'none', cursor: 'pointer', fontSize: 13, color: P.paper, fontFamily: 'inherit', fontWeight: 600 }}>儲存 ✓</motion.button>
      </div>
    </motion.div>
  );

  return ReactDOM.createPortal(
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(22,20,21,0.45)', zIndex: 9997 }} onClick={onClose} />
      {sheet}
    </>,
    document.body
  );
};

// ─── Copy Plan Sheet (漸進 / 直接複製 / 取消) ─────────────────────
const CopyPlanSheet = ({ sourceWeekNum, totalWeeks, onProgressive, onDirect, onClose }) => {
  const sheet = (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(22,20,21,0.5)', zIndex: 9990 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 36 }}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9991, background: P.paper, borderRadius: '18px 20px 0 0', padding: '24px 24px 44px', fontFamily: 'var(--font-display)' }}
      >
        <div style={{ width: 36, height: 4, background: P.pebble, borderRadius: 2, margin: '0 auto 24px' }} />

        <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: P.ink, marginBottom: 6 }}>
          套用 W{sourceWeekNum} 計劃
        </div>
        <p style={{ fontSize: 13, color: P.muted, lineHeight: 1.65, margin: '0 0 20px' }}>
          選擇要如何將 W{sourceWeekNum} 的動作套用到其餘各週。
        </p>

        {/* Option A: Progressive */}
        <motion.button {...pressProps('row')}
 onClick={onProgressive}
 style={{ width: '100%', padding: '16px 18px', background: P.ink, border: 'none', borderRadius: 18, cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}
 >
          <div style={{ fontSize: 13, color: P.paper, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 4 }}>漸進超負荷 →</div>
          <div style={{ fontSize: 11, color: 'rgba(246,244,241,0.65)', lineHeight: 1.5 }}>
            自動為各週設計不同組數與次數（BASE → BUILD → PEAK → DELOAD）
          </div>
          {/* Mini preview */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {PROGRESSIVE_SCHEMES.slice(0, Math.min(totalWeeks, 4)).map((s, i) => (
              <div key={i} style={{ flex: 1, background: 'rgba(246,244,241,0.1)', borderRadius: 3, padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: P.coral, letterSpacing: '0.12em' }}>W{i + 1}</div>
                <div style={{ fontSize: 12, color: P.paper, fontWeight: 700 }}>{s.sets}×</div>
                <div style={{ fontSize: 11, color: 'rgba(246,244,241,0.6)' }}>{s.reps}</div>
              </div>
            ))}
          </div>
        </motion.button>

        {/* Option B: Direct copy */}
        <motion.button {...pressProps('row')}
 onClick={onDirect}
 style={{ width: '100%', padding: '16px 18px', background: 'transparent', border: P.hairlineInk, borderRadius: 18, cursor: 'pointer', textAlign: 'left', marginBottom: 16 }}
 >
          <div style={{ fontSize: 13, color: P.ink, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 4 }}>直接複製 →</div>
          <div style={{ fontSize: 11, color: P.muted, lineHeight: 1.5 }}>
            保持 W{sourceWeekNum} 完全相同的動作、組數與次數套到所有週
          </div>
        </motion.button>

        {/* Cancel */}
        <motion.button {...pressProps('row')}
 onClick={onClose}
 style={{ width: '100%', padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: P.muted, fontFamily: 'inherit', letterSpacing: '0.08em' }}
 >
          取消，手動設定各週
        </motion.button>
      </motion.div>
    </>
  );

  return ReactDOM.createPortal(<AnimatePresence>{sheet}</AnimatePresence>, document.body);
};

// ─── Workout templates ────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'ppl',
    name: '推拉腿',
    subtitle: 'Push Pull Legs',
    desc: '胸肩三頭 / 背二頭 / 腿 — 最經典的力量訓練分化',
    weeks: 4, days: 6,
    accentColor: P.coral,
    dayFoci: ['PUSH','PULL','LEGS','PUSH','PULL','LEGS'],
  },
  {
    id: 'upper_lower',
    name: '上下肢',
    subtitle: 'Upper / Lower Split',
    desc: '均衡訓練上半身與下半身，每週各練兩次',
    weeks: 4, days: 4,
    accentColor: '#3B82F6',
    dayFoci: ['UPPER','LOWER','UPPER','LOWER'],
  },
  {
    id: 'full_body',
    name: '全身訓練',
    subtitle: 'Full Body 3×',
    desc: '每次訓練覆蓋全身，高頻率強化動作模式',
    weeks: 4, days: 3,
    accentColor: '#059669',
    dayFoci: ['FULL BODY','FULL BODY','FULL BODY'],
  },
  {
    id: 'bro_split',
    name: '傳統分化',
    subtitle: 'Bro Split 5-day',
    desc: '胸/背/肩/手臂/腿 — 每肌群獨立精雕',
    weeks: 4, days: 5,
    accentColor: '#8B5CF6',
    dayFoci: ['PUSH','PULL','LEGS','UPPER','LOWER'],
  },
  {
    id: 'custom',
    name: '空白計劃',
    subtitle: 'From Scratch',
    desc: '完全空白，自己決定每天的訓練重點',
    weeks: 4, days: 4,
    accentColor: P.pebble,
    dayFoci: null,
  },
];

// ─── Phase 1: Setup screen ────────────────────────────────────────
const SetupScreen = ({ onConfirm, onBack }) => {
  const [planName, setPlanName]       = useState('');
  const [weeks, setWeeks]             = useState(4);
  const [days, setDays]               = useState(4);
  const [nameFocused, setNameFocused] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const weekOptions = [2, 4, 6, 8];
  const dayOptions  = [2, 3, 4, 5];
  const canProceed  = planName.trim().length > 0;

  const applyTemplate = (tpl) => {
    setSelectedTemplate(tpl.id);
    setWeeks(tpl.weeks);
    setDays(tpl.days);
    if (!planName) setPlanName(tpl.name + ' 訓練計劃');
  };

  return (
    <div style={{ minHeight: '100dvh', background: P.paper, fontFamily: 'var(--font-display)', color: P.ink, maxWidth: 430, margin: '0 auto', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 24px', paddingTop: 'max(24px, env(safe-area-inset-top, 24px))', paddingBottom: 16 }}>
        <motion.button {...pressProps('row')} onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 20, color: P.ink, cursor: 'pointer', padding: '4px 0', marginRight: 'auto' }}>←</motion.button>
      </div>
      <HR />
      <div style={{ padding: '32px 24px 24px' }}>
        <Label>自訂計劃</Label>
        <h1 style={{ fontSize: 38, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, lineHeight: 1.08, color: P.ink, margin: '10px 0 6px' }}>制定你的<br />訓練計劃</h1>
      </div>

      <div style={{ paddingLeft: 24, paddingBottom: 4, marginBottom: 4 }}><Label>選擇模板</Label></div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '10px 24px 20px', scrollbarWidth: 'none' }}>
        {TEMPLATES.map(tpl => {
          const active = selectedTemplate === tpl.id;
          
          // 1. 判斷是否為第一張卡牌 (推拉腿) 以套用珊瑚紅 (Coral)
          const isCoral = tpl.id === 'ppl'; 
          
          // 2. Liquid Glass 玻璃色調設定 (.tint)
          const glassTint = active 
            ? (isCoral ? 'rgba(249, 92, 75, 0.45)' : `${tpl.accentColor}66`) // 珊瑚紅 or 原強調色加 40% 透明度
            : 'rgba(250, 252, 255, 0.25)'; // 未啟動時的白玻璃

          // 3. 確保文字在深色玻璃上的對比度
          const textPrimary = active ? (isCoral ? '#61160E' : P.paper) : P.ink;
          const textSecondary = active ? (isCoral ? 'rgba(97, 22, 14, 0.65)' : 'rgba(246,244,241,0.85)') : P.muted;
          const borderTint = active ? (isCoral ? 'rgba(97, 22, 14, 0.2)' : 'rgba(246,244,241,0.4)') : P.pebble;

          return (
            <motion.button 
              key={tpl.id} 
              whileTap={{ scale: 0.94 }} // Liquid Glass 的互動回饋 (.interactive)
              onClick={() => applyTemplate(tpl)}
              style={{
                flexShrink: 0, width: 140, padding: '16px 14px',
                borderRadius: 18, // 稍微加大圓角以符合 iOS 26 的流體感
                
                // --- Liquid Glass (iOS 26) 核心特效 ---
                background: glassTint,
                backdropFilter: 'blur(36px) saturate(180%)',
                WebkitBackdropFilter: 'blur(36px) saturate(180%)',
                // 使用 inset shadow 取代 border，能更好地模擬玻璃的邊緣高光與厚度折射
                boxShadow: active 
                  ? 'inset 0 1px 1px rgba(255, 255, 255, 0.9), inset 0 0 0 1px rgba(255, 255, 255, 0.35), 0 8px 24px rgba(0, 0, 0, 0.06)' 
                  : 'inset 0 1px 1px rgba(255, 255, 255, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 4px 12px rgba(0, 0, 0, 0.03)',
                border: 'none', 
                // -------------------------------------
                
                textAlign: 'left', 
                cursor: 'pointer', 
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)' // 加入平滑的 morphing 過渡
              }}
            >
              <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: textPrimary, lineHeight: 1.2, marginBottom: 4 }}>{tpl.name}</div>
              <div style={{ fontSize: 9, letterSpacing: '0.18em', color: textSecondary, marginBottom: 8, textTransform: 'uppercase' }}>{tpl.subtitle}</div>
              <div style={{ fontSize: 11, color: textSecondary, lineHeight: 1.5 }}>{tpl.desc}</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 11, padding: '2px 7px', border: `1px solid ${borderTint}`, borderRadius: 4, color: textPrimary }}>{tpl.weeks}週</span>
                <span style={{ fontSize: 11, padding: '2px 7px', border: `1px solid ${borderTint}`, borderRadius: 4, color: textPrimary }}>{tpl.days}天/週</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <HR style={{ margin: '0 24px 28px' }} />

      <div style={{ padding: '0 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <Label style={{ marginBottom: 10, display: 'block' }}>計劃名稱</Label>
          <input
            value={planName} onChange={e => setPlanName(e.target.value)}
            onFocus={() => setNameFocused(true)} onBlur={() => setNameFocused(false)}
            placeholder="例：我的推拉腿計劃"
            style={{ width: '100%', padding: '12px 0', border: 'none', borderBottom: `2px solid ${nameFocused ? P.ink : P.pebble}`, background: 'transparent', fontSize: 20, color: P.ink, fontFamily: 'var(--font-display)', fontStyle: planName ? 'italic' : 'normal', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <Label style={{ marginBottom: 12, display: 'block' }}>週期長度</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: P.hairlineInk, borderRadius: 18, overflow: 'hidden' }}>
            {weekOptions.map((w, i) => (
              <motion.button {...pressProps('row')} key={w} onClick={() => setWeeks(w)} style={{ padding: '14px 0', textAlign: 'center', background: weeks === w ? P.ink : 'transparent', color: weeks === w ? P.paper : P.ink, border: 'none', borderLeft: i > 0 ? P.hairlineInk : 'none', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>{w}週</motion.button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <Label style={{ marginBottom: 12, display: 'block' }}>每週訓練天數</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: P.hairlineInk, borderRadius: 18, overflow: 'hidden' }}>
            {dayOptions.map((d, i) => (
              <motion.button {...pressProps('row')} key={d} onClick={() => setDays(d)} style={{ padding: '14px 0', textAlign: 'center', background: days === d ? P.ink : 'transparent', color: days === d ? P.paper : P.ink, border: 'none', borderLeft: i > 0 ? P.hairlineInk : 'none', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>{d}天</motion.button>
            ))}
          </div>
        </div>

        <div style={{ background: P.stone, padding: 20, marginBottom: 32, border: P.hairline, borderRadius: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Label>計劃框架</Label>
              <div style={{ fontSize: 20, fontWeight: 700, color: P.ink, marginTop: 4, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>{weeks} 週 · {days} 天/週</div>
              {selectedTemplate && selectedTemplate !== 'custom' && (
                <div style={{ fontSize: 9, color: P.coral, marginTop: 4, letterSpacing: '0.12em' }}>{TEMPLATES.find(t => t.id === selectedTemplate)?.subtitle}</div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <Label>總訓練天</Label>
              <div style={{ fontSize: 28, fontWeight: 700, color: P.coral, marginTop: 2 }}>{weeks * days}</div>
            </div>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            if (!canProceed) return;
            const tpl = TEMPLATES.find(t => t.id === selectedTemplate);
            onConfirm({ planName: planName.trim(), weeks, days, templateDayFoci: tpl?.dayFoci || null });
          }}
          style={{ width: '100%', padding: '18px 0', background: canProceed ? P.ink : P.pebble, color: P.paper, border: 'none', borderRadius: 18, fontSize: 14, letterSpacing: '0.14em', fontFamily: 'inherit', cursor: canProceed ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}
        >
          建立計劃框架 →
        </motion.button>
        <div style={{ height: 60 }} />
      </div>
    </div>
  );
};

// ─── Phase 2: Edit canvas ─────────────────────────────────────────
const EditCanvas = ({ plan, setPlan, onSave, onBack }) => {
  const [activeWeek, setActiveWeek]     = useState(0);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [editTarget, setEditTarget]     = useState(null);
  const [editingName, setEditingName]   = useState(false);
  const [showCopySheet, setShowCopySheet] = useState(false);
  const [blockPickerTarget, setBlockPickerTarget] = useState(null); // { weekIdx, dayIdx }
  const [saveBlockTarget, setSaveBlockTarget]     = useState(null); // { weekIdx, dayIdx, exercises, focus }

  const currentWeek = plan.weeks[activeWeek];

  // ── Copy helpers ──────────────────────────────────────────────
  const buildCopiedWeeks = useCallback((scheme) => {
    const srcDays = plan.weeks[0].days; // always copy from W1
    return plan.weeks.map((w, wi) => {
      const s = Array.isArray(scheme) ? (scheme[wi] || scheme[scheme.length - 1]) : scheme;
      const days = w.days.map((d, di) => {
        const srcDay = srcDays[di];
        if (!srcDay) return d;
        return {
          ...d,
          focus: srcDay.focus,
          exercises: srcDay.exercises.map(ex => ({
            ...ex,
            _id: wi === 0 ? ex._id : genId(),
            sets: s.sets,
            reps: s.reps,
            rest: s.rest,
          })),
        };
      });
      return { ...w, phase: Array.isArray(scheme) ? (scheme[wi]?.label || w.phase) : w.phase, days };
    });
  }, [plan.weeks]);

  const applyProgressive = useCallback(() => {
    setPlan(p => ({ ...p, weeks: buildCopiedWeeks(PROGRESSIVE_SCHEMES) }));
    setShowCopySheet(false);
  }, [buildCopiedWeeks, setPlan]);

  const applyDirect = useCallback(() => {
    const src = plan.weeks[0].days[0]?.exercises?.[0];
    const baseScheme = { sets: src?.sets || 3, reps: src?.reps || '10–12', rest: src?.rest || '90s' };
    setPlan(p => ({ ...p, weeks: buildCopiedWeeks(plan.weeks.map(() => baseScheme)) }));
    setShowCopySheet(false);
  }, [buildCopiedWeeks, plan.weeks, setPlan]);

  // ── Mutations ─────────────────────────────────────────────────
  const cycleDay = useCallback((weekIdx, dayIdx) => {
    setPlan(p => ({ ...p, weeks: p.weeks.map((w, wi) => wi !== weekIdx ? w : { ...w, days: w.days.map((d, di) => di !== dayIdx ? d : { ...d, focus: FOCUS_OPTIONS[(FOCUS_OPTIONS.indexOf(d.focus) + 1) % FOCUS_OPTIONS.length] }) }) }));
  }, [setPlan]);

  const addExercise = useCallback((weekIdx, dayIdx, ex) => {
    setPlan(p => ({ ...p, weeks: p.weeks.map((w, wi) => wi !== weekIdx ? w : { ...w, days: w.days.map((d, di) => di !== dayIdx ? d : { ...d, exercises: [...d.exercises, ex] }) }) }));
  }, [setPlan]);

  const deleteExercise = useCallback((weekIdx, dayIdx, exId) => {
    setPlan(p => ({ ...p, weeks: p.weeks.map((w, wi) => wi !== weekIdx ? w : { ...w, days: w.days.map((d, di) => di !== dayIdx ? d : { ...d, exercises: d.exercises.filter(e => e._id !== exId) }) }) }));
  }, [setPlan]);

  const saveEditedEx = useCallback((weekIdx, dayIdx, updated) => {
    setPlan(p => ({ ...p, weeks: p.weeks.map((w, wi) => wi !== weekIdx ? w : { ...w, days: w.days.map((d, di) => di !== dayIdx ? d : { ...d, exercises: d.exercises.map(e => e._id === updated._id ? updated : e) }) }) }));
  }, [setPlan]);

  const reorderExercises = useCallback((weekIdx, dayIdx, newOrder) => {
    setPlan(p => ({ ...p, weeks: p.weeks.map((w, wi) => wi !== weekIdx ? w : { ...w, days: w.days.map((d, di) => di !== dayIdx ? d : { ...d, exercises: newOrder }) }) }));
  }, [setPlan]);

  // ── Block 區塊化：把選到的 block 填入某天（覆蓋動作，並對齊 focus）──
  const applyBlockToDay = useCallback((weekIdx, dayIdx, block) => {
    const newExercises = blockToDayExercises(block);
    const cat = String(block.category || '').toUpperCase();
    const nextFocus = FOCUS_OPTIONS.includes(cat) ? cat : undefined;
    setPlan(p => ({ ...p, weeks: p.weeks.map((w, wi) => wi !== weekIdx ? w : {
      ...w,
      days: w.days.map((d, di) => di !== dayIdx ? d : {
        ...d,
        focus: nextFocus || d.focus,
        exercises: newExercises,
      }),
    }) }));
  }, [setPlan]);

  const addWeek = useCallback(() => {
    setPlan(p => ({ ...p, weeks: [...p.weeks, mkWeek(p.weeks.length + 1, p.daysPerWeek, null)] }));
  }, [setPlan]);

  const removeWeek = useCallback((weekIdx) => {
    if (plan.weeks.length <= 1) return;
    setPlan(p => ({ ...p, weeks: p.weeks.filter((_, i) => i !== weekIdx).map((w, i) => ({ ...w, week_number: i + 1, phase: PHASES[i] || `W${i+1}` })) }));
    setActiveWeek(w => Math.max(0, Math.min(w, plan.weeks.length - 2)));
  }, [plan.weeks.length, setPlan]);

  // Is W1 complete enough to copy?
  const w1HasExercises = plan.weeks[0]?.days?.some(d => d.exercises.length > 0);

  return (
    <div style={{ minHeight: '100dvh', background: P.paper, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', color: P.ink, maxWidth: 430, margin: '0 auto', position: 'relative' }}>

      {/* ── Top bar ── */}
      <div style={{ paddingTop: 'max(20px, env(safe-area-inset-top, 20px))', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px 14px', gap: 12 }}>
          <motion.button {...pressProps('row')} onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 20, color: P.ink, cursor: 'pointer', padding: 0, marginRight: 4 }}>←</motion.button>
          <Label style={{ flex: 1, textAlign: 'center' }}>自訂計劃</Label>
          <motion.button {...pressProps('row')} onClick={onSave} style={{ background: 'none', border: 'none', fontSize: 13, color: P.coral, cursor: 'pointer', letterSpacing: '0.1em', fontFamily: 'inherit' }}>儲存</motion.button>
        </div>

        {/* Plan name */}
        <div style={{ padding: '0 20px 16px' }}>
          {editingName ? (
            <input autoFocus value={plan.name} onChange={e => setPlan(p => ({ ...p, name: e.target.value }))} onBlur={() => setEditingName(false)}
              style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontStyle: 'italic', border: 'none', borderBottom: `2px solid ${P.ink}`, background: 'transparent', color: P.ink, width: '100%', outline: 'none', padding: '0 0 4px' }}
            />
          ) : (
            <h1 onClick={() => setEditingName(true)} style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, color: P.ink, margin: 0, cursor: 'text', lineHeight: 1.2 }}>
              {plan.name || '未命名計劃'}
              <span style={{ fontSize: 12, color: P.muted, marginLeft: 8, fontStyle: 'normal', fontFamily: 'var(--font-display)' }}>✎</span>
            </h1>
          )}
        </div>

        {/* ── 複製計劃 banner（永遠可見，有 W1 動作才亮起） ── */}
        <div style={{
          margin: '0 20px 12px',
          background: w1HasExercises ? 'rgba(250, 252, 255, 0.55)' : 'rgba(250, 252, 255, 0.25)',
          backdropFilter: 'blur(36px) saturate(180%)',
          WebkitBackdropFilter: 'blur(36px) saturate(180%)',
          boxShadow: w1HasExercises 
            ? 'inset 0 1px 1px rgba(255, 255, 255, 0.9), inset 0 0 0 1px rgba(255, 255, 255, 0.35), 0 4px 14px rgba(0, 0, 0, 0.05)'
            : 'inset 0 1px 1px rgba(255, 255, 255, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 2px 8px rgba(0, 0, 0, 0.02)',
          borderRadius: 18,
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all 0.3s'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: w1HasExercises ? P.ink : 'rgba(22,20,21,0.4)', letterSpacing: '0.06em', marginBottom: 2 }}>套用 W1 計劃到所有週</div>
            <div style={{ fontSize: 11, color: w1HasExercises ? 'rgba(22,20,21,0.6)' : 'rgba(22,20,21,0.3)' }}>
              {w1HasExercises ? '選擇漸進超負荷或直接複製' : '先在 W1 新增至少一個動作'}
            </div>
          </div>
          <motion.button
            whileTap={{ scale: w1HasExercises ? 0.95 : 1 }}
            onClick={() => w1HasExercises && setShowCopySheet(true)}
            style={{ 
              flexShrink: 0, padding: '8px 16px', 
              background: w1HasExercises ? P.ink : 'rgba(22,20,21,0.05)', 
              border: w1HasExercises ? 'none' : '1px solid rgba(22,20,21,0.1)', 
              borderRadius: 12, 
              color: w1HasExercises ? P.paper : 'rgba(22,20,21,0.3)', 
              fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', fontFamily: 'inherit', 
              cursor: w1HasExercises ? 'pointer' : 'default', transition: 'all 0.2s',
              boxShadow: w1HasExercises ? '0 4px 12px rgba(22,20,21,0.15)' : 'none'
            }}
          >套用</motion.button>
        </div>

        <HR />

        {/* Week tabs — bento 圓角玻璃膠囊 */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0 12px', scrollbarWidth: 'none' }}>
          {plan.weeks.map((w, i) => (
            <motion.button {...pressProps('row')} key={w._id} onClick={() => setActiveWeek(i)}
 style={{
 flexShrink: 0, padding: '10px 20px', borderRadius: 12,
 background: activeWeek === i ? P.ink : 'rgba(255,255,255,0.5)',
 backdropFilter: 'blur(16px) saturate(160%)', WebkitBackdropFilter: 'blur(16px) saturate(160%)',
 color: activeWeek === i ? P.paper : P.muted,
 border: activeWeek === i ? 'none' : '1px solid rgba(255,255,255,0.7)',
 boxShadow: activeWeek === i ? '0 4px 12px -4px rgba(22,20,21,0.3)' : 'inset 0 1px 1px rgba(255,255,255,0.7)',
 fontSize: 9, letterSpacing: '0.18em', fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.2s',
 }}
 >W{w.week_number}</motion.button>
          ))}
          <motion.button {...pressProps('row')} onClick={addWeek} style={{ flexShrink: 0, width: 40, padding: '10px 0', borderRadius: 12, background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.6)', color: P.muted, fontSize: 16, cursor: 'pointer' }}>＋</motion.button>
        </div>
      </div>

      {/* Week content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 0 10px', borderBottom: P.hairline }}>
          <div>
            <span style={{ fontSize: 20, fontWeight: 700, color: P.ink, marginRight: 8 }}>W{currentWeek.week_number}</span>
            <span style={{ fontSize: 9, letterSpacing: '0.2em', color: P.coral }}>{currentWeek.phase}</span>
          </div>
          <motion.button {...pressProps('row')} onClick={() => removeWeek(activeWeek)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 11, color: P.muted, cursor: 'pointer', letterSpacing: '0.08em', fontFamily: 'inherit' }}>移除此週</motion.button>
        </div>

        <div style={{ padding: '10px 0 4px' }}>
          <Label style={{ marginBottom: 6, display: 'block' }}>週期標籤</Label>
          <input
            value={currentWeek.phase}
            onChange={e => setPlan(p => ({ ...p, weeks: p.weeks.map((w, i) => i === activeWeek ? { ...w, phase: e.target.value } : w) }))}
            style={{ fontSize: 13, border: 'none', borderBottom: P.hairline, background: 'transparent', color: P.ink, width: '100%', outline: 'none', padding: '4px 0 6px', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {currentWeek.days.map((day, dayIdx) => (
          <DayRow
            key={day._id}
            day={day}
            weekIdx={activeWeek}
            dayIdx={dayIdx}
            onFocusChange={cycleDay}
            onAddExercise={(wi, di) => setPickerTarget({ weekIdx: wi, dayIdx: di })}
            onDeleteEx={deleteExercise}
            onEditEx={(wi, di, ex) => setEditTarget({ weekIdx: wi, dayIdx: di, ex })}
            onReorderEx={reorderExercises}
            onPickBlock={(wi, di) => setBlockPickerTarget({ weekIdx: wi, dayIdx: di })}
            onSaveBlock={(wi, di) => {
              const d = plan.weeks[wi]?.days[di];
              setSaveBlockTarget({ weekIdx: wi, dayIdx: di, exercises: d?.exercises || [], focus: d?.focus });
            }}
          />
        ))}
        <div style={{ height: 120 }} />
      </div>

      {/* Footer */}
      <div style={{ position: 'sticky', bottom: 0, background: P.paper, borderTop: P.hairline, padding: '16px 20px', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))', flexShrink: 0 }}>
        <div style={{ display: 'flex', border: P.hairlineInk, overflow: 'hidden' }}>
          <motion.button {...pressProps('row')} onClick={onBack} style={{ flex: 1, padding: 16, background: 'transparent', border: 'none', borderRight: P.hairlineInk, cursor: 'pointer', fontSize: 13, color: P.ink, fontFamily: 'inherit', letterSpacing: '0.1em' }}>取消</motion.button>
          <motion.button {...pressProps('row')} onClick={onSave} style={{ flex: 2, padding: 16, background: P.ink, border: 'none', cursor: 'pointer', fontSize: 13, color: P.paper, fontFamily: 'inherit', letterSpacing: '0.12em', fontWeight: 600 }}>儲存計劃 ✓</motion.button>
        </div>
      </div>

      {/* Exercise picker — 全 App 統一元件 */}
      <AnimatePresence>
        {pickerTarget && (
          <ExercisePicker
            suggestCategory={plan.weeks[pickerTarget.weekIdx]?.days[pickerTarget.dayIdx]?.focus}
            onSelect={ex => { addExercise(pickerTarget.weekIdx, pickerTarget.dayIdx, ex); setPickerTarget(null); }}
            onClose={() => setPickerTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Exercise edit */}
      <AnimatePresence>
        {editTarget && (
          <ExEditSheet
            ex={editTarget.ex}
            onSave={updated => saveEditedEx(editTarget.weekIdx, editTarget.dayIdx, updated)}
            onClose={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Copy plan sheet */}
      <AnimatePresence>
        {showCopySheet && (
          <CopyPlanSheet
            sourceWeekNum={1}
            totalWeeks={plan.weeks.length}
            onProgressive={applyProgressive}
            onDirect={applyDirect}
            onClose={() => setShowCopySheet(false)}
          />
        )}
      </AnimatePresence>

      {/* Block 挑選：填入某天 */}
      <BlockPickerModal
        open={!!blockPickerTarget}
        onClose={() => setBlockPickerTarget(null)}
        onPick={(block) => {
          if (blockPickerTarget) applyBlockToDay(blockPickerTarget.weekIdx, blockPickerTarget.dayIdx, block);
        }}
      />

      {/* Block 儲存：把某天存成 block */}
      <SaveWorkoutBlockModal
        open={!!saveBlockTarget}
        exercises={saveBlockTarget?.exercises || []}
        defaultCategory={saveBlockTarget?.focus || ''}
        source="manual"
        onClose={() => setSaveBlockTarget(null)}
        onSaved={() => setSaveBlockTarget(null)}
      />
    </div>
  );
};

// ─── Root component ───────────────────────────────────────────────
const CustomPlanBuilderMobile = ({ userId }) => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('setup');
  const [plan, setPlan]   = useState(null);

  useEffect(() => {
    const editId = sessionStorage.getItem('editingCustomPlanId');
    if (editId) {
      const stored = (() => { try { return JSON.parse(localStorage.getItem('drvn_custom_plans') || '[]'); } catch { return []; } })();
      const existingPlan = stored.find(p => p._id === editId);
      if (existingPlan) {
        setPlan(existingPlan);
        setPhase('edit');
      }
      sessionStorage.removeItem('editingCustomPlanId');
    }
  }, []);

  const handleSetupConfirm = ({ planName, weeks, days, templateDayFoci }) => {
    const newPlan = {
      _id: genId(),
      name: planName,
      daysPerWeek: days,
      weeks: Array.from({ length: weeks }, (_, i) => mkWeek(i + 1, days, templateDayFoci)),
      createdAt: new Date().toISOString(),
      isCustom: true,
    };
    setPlan(newPlan);
    setPhase('edit');
  };

  const handleSave = () => {
    if (!plan) return;
    const stored = (() => { try { return JSON.parse(localStorage.getItem('drvn_custom_plans') || '[]'); } catch { return []; } })();
    const idx = stored.findIndex(p => p._id === plan._id);
    const updated = { ...plan, updatedAt: new Date().toISOString() };
    if (idx >= 0) stored[idx] = updated; else stored.unshift(updated);
    localStorage.setItem('drvn_custom_plans', JSON.stringify(stored));
    navigate('/custom-plans', { replace: true });
  };

  return (
    <>
      {/* 首次進入自訂課表 → 操作步驟教學（看過一次即不再出現） */}
      <FirstTimeHint
        tipKey="first-custom-plan"
        title="自訂課表怎麼做"
        steps={[
          '設週數與每天練哪裡',
          '點某一天加動作與組數',
          '存檔後進我的計劃',
        ]}
      />
      {phase === 'setup'
        ? <SetupScreen onConfirm={handleSetupConfirm} onBack={() => navigate(-1)} />
        : <EditCanvas plan={plan} setPlan={setPlan} onSave={handleSave} onBack={() => setPhase('setup')} />}
    </>
  );
};

export default CustomPlanBuilderMobile;
