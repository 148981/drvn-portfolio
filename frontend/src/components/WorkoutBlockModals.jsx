import React, { useMemo, useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Trash2, ChevronRight, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import {
  BLOCK_CATEGORIES, categoryLabel, addBlock,
  loadBlocks, groupBlocksByCategory, deleteBlock, defaultBlockName, updateBlock,
  hydrateBlocksFromCloud,
} from '../utils/workoutBlocks';
import { ExercisePicker } from './ExercisePicker';

// ── 共用瑞士極簡調色盤（對齊 builder）──
const P = {
  paper: '#F6F4F1', stone: '#E4DED2', pebble: '#CFC6B8',
  ink: '#161415', coral: '#F95C4B', muted: '#6B6B6B',
};

const Backdrop = ({ children, onClose }) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: 0.2 }}
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      background: 'rgba(22,20,21,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}
  >
    {children}
  </motion.div>
);

const Sheet = ({ children }) => (
  <motion.div
    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
    transition={{ type: 'spring', stiffness: 320, damping: 34 }}
    onClick={e => e.stopPropagation()}
    style={{
      width: '100%', maxWidth: 480, background: P.paper,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      padding: '14px 22px max(22px, env(safe-area-inset-bottom, 22px))',
      maxHeight: '86dvh', display: 'flex', flexDirection: 'column',
      boxShadow: '0 -18px 50px rgba(22,20,21,0.22)',
    }}
  >
    <div style={{ width: 42, height: 5, borderRadius: 999, background: P.pebble, margin: '0 auto 14px' }} />
    {children}
  </motion.div>
);

const Tag = ({ children, color }) => (
  <span style={{
    fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
    color: color || P.muted, border: `1.2px solid ${color || P.pebble}`,
    borderRadius: 8, padding: '2px 7px', whiteSpace: 'nowrap',
  }}>{children}</span>
);


/* ── 共用小零件（介面標準：點擊區 ≥ 44、段落標題不拉大字距、一個畫面一個主要動作）── */
const SectionLabel = ({ children, meta }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', margin: '18px 0 8px' }}>
    <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(22,20,21,0.5)' }}>{children}</span>
    {meta && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.4)' }}>{meta}</span>}
  </div>
);

const CloseBtn = ({ onClick }) => (
  <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClick}
    style={{ background: P.stone, border: 'none', borderRadius: 999, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
    <X size={18} color={P.ink} />
  </motion.button>
);

/** 分類：中文藥丸、選中的一顆是墨色，最後一顆是自訂（選了才出現輸入框） */
const CategoryChips = ({ category, customMode, customCat, onPick, onCustom, onCustomText }) => (
  <>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {BLOCK_CATEGORIES.map(cat => {
        const on = !customMode && category === cat;
        return (
          <motion.button {...pressProps('pill')} key={cat} onClick={() => onPick(cat)}
            style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1.5px solid ${on ? P.ink : 'rgba(22,20,21,0.1)'}`, background: on ? P.ink : 'rgba(22,20,21,0.03)', color: on ? P.paper : P.ink, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {categoryLabel(cat)}
          </motion.button>
        );
      })}
      <motion.button {...pressProps('pill')} onClick={onCustom}
        style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1.5px ${customMode ? 'solid' : 'dashed'} ${customMode ? P.ink : P.pebble}`, background: customMode ? P.ink : 'transparent', color: customMode ? P.paper : P.muted, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
        自訂
      </motion.button>
    </div>
    {customMode && (
      <input autoFocus value={customCat} onChange={e => onCustomText(e.target.value)} placeholder="例：手臂"
        style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, height: 48, fontSize: 16, color: P.ink, background: '#fff', border: `1.5px solid ${P.pebble}`, borderRadius: 12, padding: '0 14px', outline: 'none', fontFamily: 'inherit' }} />
    )}
  </>
);

// ═══════════════════════════════════════════════════════════════
//  SaveWorkoutBlockModal — 把一份動作清單存成 block（命名 + 分類）
// ═══════════════════════════════════════════════════════════════
export const SaveWorkoutBlockModal = ({
  open, exercises = [], defaultCategory = '', source = 'manual', onClose, onSaved,
}) => {
  const presetDefault = BLOCK_CATEGORIES.includes(String(defaultCategory).toUpperCase())
    ? String(defaultCategory).toUpperCase() : '';
  const [category, setCategory] = useState(presetDefault || 'PUSH');
  const [customMode, setCustomMode] = useState(false);
  const [customCat, setCustomCat] = useState('');
  const [name, setName] = useState('');

  const effectiveCat = customMode ? (customCat.trim().toUpperCase() || 'CUSTOM') : category;
  const placeholder = useMemo(() => defaultBlockName(effectiveCat), [effectiveCat]);
  const count = exercises.length;

  const save = () => {
    if (count === 0) return;
    const block = addBlock({ name: name.trim(), category: effectiveCat, exercises, source });
    onSaved?.(block);
    onClose?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <Backdrop onClose={onClose}>
          <Sheet>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: P.ink, margin: 0 }}>存成 Block</h2>
                <p style={{ fontSize: 13, color: P.muted, margin: '4px 0 0' }}>之後排計劃可以直接套用</p>
              </div>
              <CloseBtn onClick={onClose} />
            </div>

            <div style={{ overflowY: 'auto', paddingTop: 16 }}>
              <SectionLabel>分類</SectionLabel>
              <CategoryChips category={category} customMode={customMode} customCat={customCat}
                onPick={(c) => { setCustomMode(false); setCategory(c); }} onCustom={() => setCustomMode(true)} onCustomText={setCustomCat} />

              <SectionLabel meta="可不填">名稱</SectionLabel>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={placeholder}
                style={{ width: '100%', boxSizing: 'border-box', height: 48, fontSize: 16, color: P.ink, background: '#fff', border: `1.5px solid ${P.pebble}`, borderRadius: 12, padding: '0 14px', outline: 'none', fontFamily: 'inherit' }} />

              {/* 動作預覽 */}
              <div style={{ marginTop: 18, background: P.stone, borderRadius: 18, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: P.muted, marginBottom: count ? 8 : 0 }}>
                  {count} 個動作
                </div>
                {exercises.slice(0, 6).map((ex, i) => (
                  <div key={i} style={{ fontSize: 14, color: P.ink, padding: '3px 0' }}>{ex.name || '動作'}</div>
                ))}
                {count > 6 && <div style={{ fontSize: 13, color: P.muted, paddingTop: 4 }}>還有 {count - 6} 個</div>}
                {count === 0 && <div style={{ fontSize: 13, color: P.muted }}>沒有可存的動作</div>}
              </div>
            </div>

            <motion.button {...pressProps('row')}
 onClick={save}
 disabled={count === 0}
 style={{ marginTop: 18, width: '100%', height: 54, borderRadius: 18, border: 'none', background: count === 0 ? P.pebble : P.ink, color: P.paper, fontSize: 15, fontWeight: 800, cursor: count === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              <Check size={16} /> 儲存
            </motion.button>
          </Sheet>
        </Backdrop>
      )}
    </AnimatePresence>
  );
};

// ── 單一 block 編輯器（建立 / 修改）──────────────────────────────
// 順序照「做這件事的人在想什麼」：先放動作（Block 的本體）→ 再分類 → 名稱可以不填。
// 以前是名稱 → 分類 → 動作，而且動作區只有一行斜體「還沒有動作」，
// 主按鈕灰掉卻不說為什麼。現在沒動作時主按鈕直接寫「先加動作」。
const BlockEditor = ({ block, isNew = false, onCancel, onSaved }) => {
  const isPreset = BLOCK_CATEGORIES.includes(String(block.category || '').toUpperCase());
  const [name, setName] = useState(block.name || '');
  const [category, setCategory] = useState(isPreset ? String(block.category).toUpperCase() : 'PUSH');
  const [customMode, setCustomMode] = useState(!!block.category && !isPreset);
  const [customCat, setCustomCat] = useState(isPreset ? '' : (block.category || ''));
  const [exs, setExs] = useState((block.exercises || []).map(e => ({ ...e })));
  const [pickerOpen, setPickerOpen] = useState(false);

  const effectiveCat = customMode ? (customCat.trim().toUpperCase() || 'CUSTOM') : category;
  const placeholder = useMemo(() => defaultBlockName(effectiveCat), [effectiveCat]);
  const setEx = (i, patch) => setExs(arr => arr.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const removeEx = (i) => setExs(arr => arr.filter((_, j) => j !== i));
  const addEx = (ex) => { setExs(arr => [...arr, { ...ex, _id: `tmp_${Date.now().toString(36)}_${arr.length}` }]); setPickerOpen(false); };
  const move = (i, dir) => setExs(arr => {
    const j = i + dir; if (j < 0 || j >= arr.length) return arr;
    const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const empty = exs.length === 0;

  const save = () => {
    if (empty) { setPickerOpen(true); return; }
    const saved = isNew
      ? addBlock({ name, category: effectiveCat, exercises: exs, source: 'manual' })
      : updateBlock(block._id, { name: name.trim() || placeholder, category: effectiveCat, exercises: exs });
    onSaved?.(saved);
  };

  const numBox = { height: 44, borderRadius: 12, border: `1.5px solid ${P.pebble}`, background: '#fff', fontSize: 17, fontWeight: 300, color: P.ink, textAlign: 'center', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', outline: 'none', boxSizing: 'border-box' };
  const iconBtn = (disabled) => ({ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 0, opacity: disabled ? 0.25 : 1 });

  return (
    <div style={{ padding: '0 0 4px' }}>
      <SectionLabel meta={empty ? null : `${exs.length} 個`}>動作</SectionLabel>
      {exs.map((ex, i) => (
        <div key={ex._id || i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(22,20,21,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: P.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</span>
            <motion.button {...pressProps('icon')} aria-label="刪除動作" onClick={() => removeEx(i)} style={iconBtn(false)}><Trash2 size={17} color={P.muted} /></motion.button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input inputMode="numeric" aria-label="組數" value={ex.sets} onChange={e => setEx(i, { sets: e.target.value.replace(/[^0-9]/g, '') || '' })} style={{ ...numBox, width: 56 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: P.muted }}>組</span>
            <input aria-label="次數" value={ex.reps} onChange={e => setEx(i, { reps: e.target.value })} style={{ ...numBox, width: 72, marginLeft: 6 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: P.muted }}>次</span>
            {exs.length > 1 && (
              <span style={{ marginLeft: 'auto', display: 'flex' }}>
                <motion.button {...pressProps('icon')} aria-label="往上移" onClick={() => move(i, -1)} disabled={i === 0} style={iconBtn(i === 0)}><ChevronUp size={18} color={P.ink} /></motion.button>
                <motion.button {...pressProps('icon')} aria-label="往下移" onClick={() => move(i, 1)} disabled={i === exs.length - 1} style={iconBtn(i === exs.length - 1)}><ChevronDown size={18} color={P.ink} /></motion.button>
              </span>
            )}
          </div>
        </div>
      ))}
      <motion.button {...pressProps('row')} onClick={() => setPickerOpen(true)}
        style={{ marginTop: empty ? 0 : 8, width: '100%', minHeight: empty ? 64 : 48, borderRadius: 18, border: `1.5px ${empty ? 'solid' : 'dashed'} ${empty ? P.ink : P.pebble}`, background: 'transparent', color: P.ink, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={17} /> {empty ? '加第一個動作' : '再加動作'}
      </motion.button>

      <SectionLabel>分類</SectionLabel>
      <CategoryChips category={category} customMode={customMode} customCat={customCat}
        onPick={(c) => { setCustomMode(false); setCategory(c); }} onCustom={() => setCustomMode(true)} onCustomText={setCustomCat} />

      <SectionLabel meta="可不填">名稱</SectionLabel>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', height: 48, fontSize: 16, color: P.ink, background: '#fff', border: `1.5px solid ${P.pebble}`, borderRadius: 12, padding: '0 14px', outline: 'none', fontFamily: 'inherit' }} />

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <motion.button {...pressProps('cta')} onClick={onCancel}
          style={{ flex: 1, height: 52, borderRadius: 18, border: `1.5px solid ${P.pebble}`, background: 'transparent', color: P.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>取消</motion.button>
        <motion.button {...pressProps('cta')} onClick={save}
          style={{ flex: 2, height: 52, borderRadius: 18, border: 'none', background: P.ink, color: P.paper, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {empty ? <><Plus size={16} /> 先加動作</> : <><Check size={16} /> {isNew ? '建立' : '儲存'}</>}
        </motion.button>
      </div>

      <AnimatePresence>
        {pickerOpen && <ExercisePicker onSelect={addEx} suggestCategory={effectiveCat} onClose={() => setPickerOpen(false)} />}
      </AnimatePresence>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
//  BlockLibraryModal — 我的 Block 庫（管理：展開看動作 / 編輯 / 刪除）
//  建立時整張表單取代清單（標題跟著換），不再塞進一個灰盒子裡、又寫一次「建立新 Block」。
//  一個都沒有 → 只有一張動作卡（介面標準：沒資料只顯示該做的事）。
// ═══════════════════════════════════════════════════════════════
export const BlockLibraryModal = ({ open, onClose }) => {
  const [version, setVersion] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  // ☁️ 開啟時換機還原（本地空才拉雲端）
  useEffect(() => {
    if (open) hydrateBlocksFromCloud().then(applied => applied && setVersion(v => v + 1));
  }, [open]);
  useEffect(() => { if (!open) { setCreating(false); setEditingId(null); setExpandedId(null); } }, [open]);
  const groups = useMemo(() => (open ? groupBlocksByCategory(loadBlocks()) : []), [open, version]);
  const total = groups.reduce((a, g) => a + g.blocks.length, 0);

  const remove = (id) => { deleteBlock(id); setExpandedId(null); setEditingId(null); setVersion(v => v + 1); };
  const refresh = () => { setEditingId(null); setCreating(false); setVersion(v => v + 1); };
  const startCreate = () => { setCreating(true); setEditingId(null); setExpandedId(null); };
  const NEW_DRAFT = { name: '', category: '', exercises: [] };

  return (
    <AnimatePresence>
      {open && (
        <Backdrop onClose={onClose}>
          <Sheet>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: P.ink, margin: 0 }}>{creating ? '建立 Block' : '我的 Block 庫'}</h2>
                {!creating && total > 0 && <p style={{ fontSize: 13, color: P.muted, margin: '4px 0 0' }}>{total} 個</p>}
                {creating && <p style={{ fontSize: 13, color: P.muted, margin: '4px 0 0' }}>存好之後排計劃可以直接套用</p>}
              </div>
              <CloseBtn onClick={onClose} />
            </div>

            <div style={{ overflowY: 'auto', margin: '0 -22px', padding: '0 22px' }}>
              {creating ? (
                <BlockEditor block={NEW_DRAFT} isNew onCancel={() => setCreating(false)} onSaved={refresh} />
              ) : total === 0 ? (
                <motion.button {...pressProps('card')} onClick={startCreate}
                  style={{ marginTop: 14, width: '100%', minHeight: 72, borderRadius: 24, border: 'none', background: P.ink, color: P.paper, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxSizing: 'border-box' }}>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>建立第一個 Block</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.66)', marginTop: 3 }}>練完在結算頁也能直接存</span>
                  </span>
                  <ChevronRight size={18} color="rgba(246,244,241,0.66)" />
                </motion.button>
              ) : (
                <>
                  <motion.button {...pressProps('row')} onClick={startCreate}
                    style={{ margin: '12px 0 4px', width: '100%', minHeight: 52, borderRadius: 18, border: `1.5px solid ${P.ink}`, background: 'transparent', color: P.ink, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Plus size={17} /> 建立 Block
                  </motion.button>

                  {groups.map(group => (
                    <div key={group.category}>
                      <SectionLabel meta={`${group.blocks.length} 個`}>{categoryLabel(group.category)}</SectionLabel>
                      {group.blocks.map(block => {
                        const isOpen = expandedId === block._id;
                        const editing = editingId === block._id;
                        return (
                          <div key={block._id} style={{ borderBottom: '1px solid rgba(22,20,21,0.08)' }}>
                            <motion.button {...pressProps('row')}
                              onClick={() => { setExpandedId(isOpen ? null : block._id); setEditingId(null); }}
                              style={{ width: '100%', minHeight: 60, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '8px 0', fontFamily: 'inherit' }}>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: P.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.name}</span>
                                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginTop: 3 }}>{block.exercises.length} 個動作</span>
                              </span>
                              {isOpen ? <ChevronDown size={18} color={P.muted} /> : <ChevronRight size={18} color={P.muted} />}
                            </motion.button>
                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                                  {editing ? (
                                    <BlockEditor block={block} onCancel={() => setEditingId(null)} onSaved={refresh} />
                                  ) : (
                                    <div style={{ padding: '0 0 14px' }}>
                                      {block.exercises.map((ex, i) => (
                                        <div key={ex._id || i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0' }}>
                                          <span style={{ fontSize: 14, color: P.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</span>
                                          <span style={{ fontSize: 13, color: P.muted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{ex.sets} 組 × {ex.reps}</span>
                                        </div>
                                      ))}
                                      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                        <motion.button {...pressProps('row')} onClick={() => remove(block._id)}
                                          style={{ flex: 1, height: 44, borderRadius: 14, border: '1px solid rgba(22,20,21,0.08)', background: 'none', color: 'rgba(22,20,21,0.62)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>刪除</motion.button>
                                        <motion.button {...pressProps('row')} onClick={() => setEditingId(block._id)}
                                          style={{ flex: 2, height: 44, borderRadius: 14, border: `1.5px solid ${P.ink}`, background: 'transparent', color: P.ink, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>編輯</motion.button>
                                      </div>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          </Sheet>
        </Backdrop>
      )}
    </AnimatePresence>
  );
};

// ═══════════════════════════════════════════════════════════════
//  BlockPickerModal — 依分類挑選一個 block 填入某天
// ═══════════════════════════════════════════════════════════════
export const BlockPickerModal = ({ open, onClose, onPick }) => {
  const [version, setVersion] = useState(0); // 刪除後重繪
  // ☁️ 開啟時換機還原（本地空才拉雲端）
  useEffect(() => {
    if (open) hydrateBlocksFromCloud().then(applied => applied && setVersion(v => v + 1));
  }, [open]);
  const groups = useMemo(() => (open ? groupBlocksByCategory(loadBlocks()) : []), [open, version]);
  const total = groups.reduce((a, g) => a + g.blocks.length, 0);

  const remove = (id) => { deleteBlock(id); setVersion(v => v + 1); };

  return (
    <AnimatePresence>
      {open && (
        <Backdrop onClose={onClose}>
          <Sheet>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: P.ink, margin: 0 }}>挑一個 Block</h2>
                {total > 0 && <p style={{ fontSize: 13, color: P.muted, margin: '4px 0 0' }}>點一下換進這一天</p>}
              </div>
              <CloseBtn onClick={onClose} />
            </div>

            <div style={{ overflowY: 'auto' }}>
              {total === 0 && (
                <div style={{ padding: '28px 0', color: P.muted }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: P.ink, margin: 0 }}>還沒有 Block</p>
                  <p style={{ fontSize: 13, marginTop: 6 }}>先把某一天存成 Block 就能在這裡挑</p>
                </div>
              )}

              {groups.map(group => (
                <div key={group.category} style={{ marginBottom: 6 }}>
                  <SectionLabel meta={`${group.blocks.length} 個`}>{categoryLabel(group.category)}</SectionLabel>

                  {group.blocks.map(block => (
                    <div key={block._id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: P.stone, borderRadius: 18, padding: '8px 6px 8px 16px', marginBottom: 8, minHeight: 60 }}>
                      <motion.button {...pressProps('row')}
 onClick={() => { onPick?.(block); onClose?.(); }}
 style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: P.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {block.name}
                          </div>
                          <div style={{ fontSize: 12, color: P.muted, marginTop: 3 }}>{block.exercises.length} 個動作</div>
                        </div>
                        <ChevronRight size={18} color={P.muted} />
                      </motion.button>
                      <motion.button {...pressProps('icon')} onClick={() => remove(block._id)} aria-label="刪除"
 style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                        <Trash2 size={17} color={P.muted} />
                      </motion.button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Sheet>
        </Backdrop>
      )}
    </AnimatePresence>
  );
};
