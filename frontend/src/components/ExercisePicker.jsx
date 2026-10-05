import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import ReactDOM from 'react-dom';
import { getGlobalExerciseLibrary } from '../data/globalExerciseRegistry';
import { getUserId } from '../utils/auth';
import { EquipmentIcon } from '../utils/drvnIcons';

// ── 器械子分類（選完部位後再依器械快速篩選）──
const EQUIP_FILTERS = {
  '槓鈴': e => (e.equipment || '').toLowerCase() === 'barbell',
  '啞鈴': e => (e.equipment || '').toLowerCase() === 'dumbbell',
  '機械': e => ['machine', 'cable', 'smith'].includes((e.equipment || '').toLowerCase()),
  '繩索': e => (e.equipment || '').toLowerCase() === 'cable',
  '自重': e => ['bodyweight', 'body only', 'none', ''].includes((e.equipment || '').toLowerCase()),
  '彈力帶': e => ['band', 'bands'].includes((e.equipment || '').toLowerCase()),
};
const EQUIP_LABELS = Object.keys(EQUIP_FILTERS);

// ── 使用頻率（常用動作往上排）：每次選動作 +1，存 localStorage ──
const USAGE_KEY = 'drvn_exercise_usage';
const readUsage = () => { try { return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}'); } catch { return {}; } };
const bumpUsage = (name) => {
  try {
    const u = readUsage();
    const k = (name || '').toLowerCase().trim();
    if (!k) return;
    u[k] = (u[k] || 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  } catch { /* quota */ }
};

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ExercisePicker — 全 App 統一的「選擇動作」元件
 *   · 分類 chips（胸/背/腿/肩/手臂/核心/臀/全身）
 *   · free-exercise-db 真人示範照片（lazy 載入）
 *   · 依 Tier 排序
 * 任何需要「選動作」的地方都用這顆，確保體驗一致。
 * 用法：<ExercisePicker onSelect={ex => ...} onClose={() => ...} />
 *   onSelect 回傳已正規化的動作物件
 *   { _id, name, nameEn, sets, reps, rest, cat, equipment, targetLabel, image_url }
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const P = {
  paper: '#F6F4F1', stone: '#E4DED2', pebble: '#CFC6B8',
  ink: '#161415', coral: '#F95C4B', muted: '#6B6B6B',
  hairline: '1.5px solid #CFC6B8',
};

const genId = () => Math.random().toString(36).slice(2, 9);

const Label = ({ children, style }) => (
  <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: P.muted, fontFamily: 'var(--font-display)', ...style }}>{children}</span>
);

// 分類標籤 → globalExerciseRegistry 的 bodyCategory / subPart 篩選
const CAT_FILTERS = {
  '胸':   e => (e.bodyCategory || e.cat) === 'push' && (e.subPart || '').includes('chest'),
  '背':   e => (e.bodyCategory || e.cat) === 'back',
  '腿':   e => (e.bodyCategory || e.cat) === 'lower' || ['quads', 'glutes', 'hamstrings', 'calves'].includes(e.subPart),
  '肩':   e => (e.subPart || '').includes('delt') || (e.bodyCategory || e.cat) === 'shoulder',
  '手臂': e => (e.bodyCategory || e.cat) === 'arms' || ['biceps', 'triceps'].includes(e.subPart),
  '核心': e => (e.bodyCategory || e.cat) === 'core',
  '臀':   e => e.subPart === 'glutes',
  '全身': () => true,
};
const CAT_LABELS = Object.keys(CAT_FILTERS);

const TIER_META = {
  1: { label: 'S · 主要複合動作', color: P.coral },
  2: { label: 'A · 輔助動作',     color: '#3B82F6' },
  3: { label: 'B · 孤立動作',     color: P.muted },
};

// ── 依「block 分類標籤」判斷一個動作是否屬於該分類（用於建議/優先排序）──
//    例：選 PULL → 背 / 二頭 / 後三角 的動作優先顯示在前。
const _sub = e => (e.subPart || '');
const _cat = e => (e.bodyCategory || e.cat || '');
const BLOCK_CAT_MATCH = {
  PUSH: e => _sub(e).includes('chest') || ['delt_front', 'delt_side', 'triceps'].includes(_sub(e)) || _cat(e) === 'push',
  PULL: e => _cat(e) === 'back' || ['biceps', 'delt_rear'].includes(_sub(e)),
  LEGS: e => _cat(e) === 'lower' || ['quads', 'glutes', 'hamstrings', 'calves'].includes(_sub(e)),
  LOWER: e => _cat(e) === 'lower' || ['quads', 'glutes', 'hamstrings', 'calves'].includes(_sub(e)),
  UPPER: e => ['push', 'back', 'shoulder', 'arms'].includes(_cat(e)) || _sub(e).includes('chest') || _sub(e).includes('delt') || ['biceps', 'triceps'].includes(_sub(e)),
  'FULL BODY': () => true,
};
const belongsToBlockCat = (ex, cat) => {
  const fn = BLOCK_CAT_MATCH[String(cat || '').toUpperCase()];
  return fn ? !!fn(ex) : false;
};

export const mkExerciseFromGlobal = (ex) => ({
  _id: genId(),
  name: ex.name,
  nameEn: ex.nameEn || '',
  sets: ex.defaultSets || 3,
  reps: ex.defaultReps || '10–12',
  rest: ex.defaultRest || '90s',
  cat: ex.bodyCategory || ex.cat,
  bodyCategory: ex.bodyCategory || ex.cat || '',
  subPart: ex.subPart || '',
  equipment: ex.equipment || '',
  targetLabel: ex.targetLabel || '',
  image_url: ex.image_url || '',
  muscle: ex.subPart || ex.bodyCategory || '',
  tier: ex.tier ?? null,
});

// ─── free-exercise-db image lookup（一次 JSON → 全部圖片）──
const FREE_DB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const FREE_DB_JSON = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMG_CACHE = new Map();
let _freeDbMap = null;
const _norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function _loadFreeDb() {
  if (_freeDbMap !== null) return _freeDbMap;
  _freeDbMap = new Map();
  try {
    const res = await fetch(FREE_DB_JSON, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return _freeDbMap;
    const list = await res.json();
    for (const ex of list) {
      if (ex.images?.length) {
        _freeDbMap.set(_norm(ex.name), FREE_DB_BASE + ex.images[0]);
        _freeDbMap.set(_norm(ex.id.replace(/_/g, ' ')), FREE_DB_BASE + ex.images[0]);
      }
    }
  } catch { /* offline → emoji fallback */ }
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

const ExThumb = memo(({ equipment, nameEn, imageUrl, size = 48, isCustom = false }) => {
  const [imgUrl, setImgUrl] = useState(() => {
    // 🩹 自訂動作圖：舊版寫死 http://<host>:8000 → 打包上線必失敗。
    //    改用相對路徑（同源），只有明確 http(s) 開頭才原樣使用。
    if (imageUrl) return /^https?:\/\//.test(imageUrl) ? imageUrl : imageUrl;
    if (isCustom) return null;
    const k = _norm(nameEn || '');
    return k && IMG_CACHE.has(k) ? IMG_CACHE.get(k) : null;
  });
  const [imgLoaded, setImgLoaded] = useState(false);
  const ref = useRef(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (!nameEn || /[一-鿿]/.test(nameEn) || isCustom) return;
    const k = _norm(nameEn);
    if (IMG_CACHE.has(k)) { setImgUrl(IMG_CACHE.get(k)); return; }
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !triggered.current) {
        triggered.current = true;
        obs.disconnect();
        fetchExerciseImage(nameEn).then(url => { if (url) setImgUrl(url); });
      }
    }, { threshold: 0.1, rootMargin: '160px' });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [nameEn, isCustom]);

  // 🎯 UI 無 emoji（Definition §6.3）：器材 fallback 改用 lucide 線性圖示。
  return (
    <div ref={ref} style={{ width: size, height: size, borderRadius: 12, background: P.stone, border: '1px solid rgba(255,255,255,0.5)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)' }}>
      {imgUrl && (
        <img loading="lazy" decoding="async" src={imgUrl} alt=""
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgUrl(null); setImgLoaded(false); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s' }} />
      )}
      {(!imgUrl || !imgLoaded) && <EquipmentIcon type={equipment} size={Math.round(size * 0.42)} strokeWidth={1.6} style={{ color: 'rgba(22,20,21,0.4)' }} />}
    </div>
  );
});

export const ExercisePicker = ({
  onSelect, onClose, suggestCategory = '',
  title = '選擇動作', subtitle = '', renderFooter = null,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [equip, setEquip] = useState(null);          // 器械子篩選
  const [dbReady, setDbReady] = useState(false);
  const [customExercises, setCustomExercises] = useState([]);
  const usage = useMemo(() => readUsage(), []);       // 常用頻率快照（進畫面讀一次）

  useEffect(() => { _loadFreeDb().then(() => setDbReady(true)); }, []);

  useEffect(() => {
    (async () => {
      try {
        const userId = getUserId();
        const res = await fetch(`http://${window.location.hostname}:8000/api/exercises/custom?user_id=${userId}`);
        if (res.ok) { const data = await res.json(); setCustomExercises(data.exercises || []); }
      } catch { /* ignore */ }
    })();
  }, []);

  const allExercises = useMemo(() => {
    const merged = [...getGlobalExerciseLibrary(), ...customExercises];
    const nameMap = new Map();
    merged.forEach(ex => nameMap.set((ex.name || '').toLowerCase().replace(/\s/g, ''), ex));
    return Array.from(nameMap.values());
  }, [customExercises]);

  const suggest = String(suggestCategory || '').toUpperCase();
  const hasSuggest = suggest && suggest !== 'FULL BODY' && BLOCK_CAT_MATCH[suggest];

  const results = useMemo(() => {
    let filtered = allExercises;
    if (category && CAT_FILTERS[category]) filtered = allExercises.filter(CAT_FILTERS[category]);
    if (equip && EQUIP_FILTERS[equip]) filtered = filtered.filter(EQUIP_FILTERS[equip]);
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.nameEn || '').toLowerCase().includes(q) ||
        (e.targetLabel || '').toLowerCase().includes(q));
    }
    const countOf = (e) => usage[(e.name || '').toLowerCase().trim()] || 0;
    // 排序優先序（穩定）：① 常用（使用者實際選過的往上）② tier ③ 建議分類相符
    return [...filtered]
      .sort((a, b) => (a.tier || 9) - (b.tier || 9))
      .sort((a, b) => {
        if (!hasSuggest) return 0;
        return (belongsToBlockCat(b, suggest) ? 1 : 0) - (belongsToBlockCat(a, suggest) ? 1 : 0);
      })
      .sort((a, b) => countOf(b) - countOf(a));   // 常用最優先
  }, [allExercises, query, category, equip, hasSuggest, suggest, usage]);

  const sheet = (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      style={{ position: 'fixed', inset: 0, zIndex: 100002, background: P.paper, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)' }}
    >
      <div style={{ padding: 'max(20px, env(safe-area-inset-top, 20px)) 20px 12px', borderBottom: P.hairline, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <Label>{title}</Label>
            {subtitle ? <p style={{ fontSize: 12, color: P.muted, margin: '6px 0 0' }}>{subtitle}</p> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {!dbReady && <span style={{ fontSize: 11, color: P.muted, letterSpacing: '0.06em' }}>載入圖片中…</span>}
            <motion.button {...pressProps('row')} onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: P.muted, cursor: 'pointer', lineHeight: 1 }}>×</motion.button>
          </div>
        </div>
        {hasSuggest && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: P.coral }} />
            <span style={{ fontSize: 11, color: P.muted }}>依 <strong style={{ color: P.ink }}>{suggest}</strong> 優先排序</span>
          </div>
        )}
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋動作名稱（中 / 英）…"
          style={{ width: '100%', padding: '10px 12px', border: P.hairline, borderRadius: 4, background: P.stone, fontSize: 13, color: P.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 10, paddingBottom: 2, scrollbarWidth: 'none' }}>
          {CAT_LABELS.map(cat => (
            <motion.button {...pressProps('row')} key={cat} onClick={() => setCategory(c => (c === cat ? null : cat))}
 style={{ flexShrink: 0, padding: '6px 14px', border: `1.5px solid ${category === cat ? P.ink : P.pebble}`, borderRadius: 12, background: category === cat ? P.ink : 'transparent', color: category === cat ? P.paper : P.ink, fontSize: 9, letterSpacing: '0.12em', cursor: 'pointer', fontFamily: 'inherit' }}>{cat}</motion.button>
          ))}
        </div>

        {/* 🎯 器械子篩選 —— 選完部位（或任何時候）再依器械快篩（槓鈴/啞鈴/機械/繩索/自重/彈力帶）。
            第二層用膠囊 + coral 選中，與部位（黑色方塊）在視覺上分層。 */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 8, paddingBottom: 2, scrollbarWidth: 'none' }}>
          <span style={{ flexShrink: 0, alignSelf: 'center', fontSize: 12, letterSpacing: '0.18em', color: P.muted, paddingRight: 2 }}>器械</span>
          {EQUIP_LABELS.map(eq => (
            <motion.button {...pressProps('row')} key={eq} onClick={() => setEquip(c => (c === eq ? null : eq))}
 style={{ flexShrink: 0, padding: '5px 12px', border: `1px solid ${equip === eq ? P.coral : 'rgba(22,20,21,0.12)'}`, borderRadius: 999, background: equip === eq ? 'rgba(249,92,75,0.1)' : 'rgba(255,255,255,0.5)', color: equip === eq ? P.coral : 'rgba(22,20,21,0.6)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{eq}</motion.button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        {results.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: P.muted, fontSize: 13 }}>無搜尋結果</div>}
        {results.map((ex, i) => {
          const meta = TIER_META[ex.tier || 3] || TIER_META[3];
          return (
            <motion.button {...pressProps('row')} key={`${ex.name}-${i}`} onClick={() => { bumpUsage(ex.name); onSelect(mkExerciseFromGlobal(ex)); }}
 style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 8, borderRadius: 18, marginTop: i === 0 ? 16 : 0,
 background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)',
 border: '1px solid rgba(255,255,255,0.65)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.75), 0 3px 12px -8px rgba(22,20,21,0.16)', cursor: 'pointer', textAlign: 'left' }}>
              <ExThumb equipment={ex.equipment} nameEn={ex.nameEn} imageUrl={ex.image_url} size={48} isCustom={!!(ex.userId || ex.sourcePlan === 'Custom')} />
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

      {renderFooter && (
        <div style={{ flexShrink: 0, padding: '10px 20px max(20px, env(safe-area-inset-bottom))', borderTop: P.hairline, background: P.paper }}>
          {renderFooter()}
        </div>
      )}
    </motion.div>
  );

  return ReactDOM.createPortal(<AnimatePresence>{sheet}</AnimatePresence>, document.body);
};

export default ExercisePicker;
