/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * workoutBlocks.js — 單日訓練「Block」資料層 (localStorage)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 一個 Block = 一天份的訓練菜單模板（動作清單 + 使用者自訂分類）。
 * 來源：
 *   · 'report' — 在結算頁把今日完成的菜單存成 block
 *   · 'manual' — 在自訂計劃 builder 裡把某天的動作存成 block
 * 之後排計劃時可直接挑選 block 填入某一天，把訓練計劃積木化。
 *
 * 儲存：localStorage key = 'drvn_workout_blocks'（與 drvn_custom_plans 一致，純前端）。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { pushBlob, hydrateIfLocalEmpty } from './cloudSync';

const KEY = 'drvn_workout_blocks';

// 預設分類（部位 / 訓練分法）。使用者也能自由命名（自訂分類）。
export const BLOCK_CATEGORIES = ['PUSH', 'PULL', 'LEGS', 'UPPER', 'LOWER', 'FULL BODY'];

// 分類配色（對齊 builder 的 FOCUS_COLORS；未知分類用 ink）
export const CATEGORY_COLORS = {
  PUSH: '#F95C4B', PULL: '#3B82F6', LEGS: '#8B5CF6',
  UPPER: '#059669', LOWER: '#D97706', 'FULL BODY': '#0891B2',
};
export const categoryColor = (c) => CATEGORY_COLORS[String(c || '').toUpperCase()] || '#161415';

/* 畫面上顯示的分類名。存檔仍用英文代號（PUSH…），舊資料不用搬；
   使用者看到的一律中文 —— 一排大寫英文要先翻譯才知道是什麼。 */
export const CATEGORY_ZH = { PUSH: '推', PULL: '拉', LEGS: '腿', UPPER: '上半身', LOWER: '下半身', 'FULL BODY': '全身' };
export const categoryLabel = (c) => CATEGORY_ZH[String(c || '').toUpperCase()] || String(c || '自訂');

const uid = () => `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const exid = () => Math.random().toString(36).slice(2, 9);

export function loadBlocks() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveBlocks(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr || [])); } catch { /* quota / private mode */ }
  // ☁️ best-effort 備份到雲端（換機不遺失）；失敗不影響本地。
  pushBlob('workout_blocks', arr || []);
}

/** 換機還原：本地 block 為空且雲端有 → 拉回 localStorage。回傳是否套用雲端。 */
export function hydrateBlocksFromCloud() {
  return hydrateIfLocalEmpty(KEY, 'workout_blocks', (v) => !Array.isArray(v) || v.length === 0);
}

/**
 * 把任意來源的「動作」正規化成 builder 相容的形狀：
 *   { _id, name, nameEn, sets:Number, reps:String, rest:String, equipment, muscle, tier }
 * - 結算頁動作：{ name, sets:[{weight,reps,completed}] } → sets 取組數、reps 取第一組
 * - builder 動作：{ name, sets:Number, reps:String, rest } → 原樣帶入
 */
export function normalizeExercise(ex = {}) {
  const setsArr = Array.isArray(ex.sets) ? ex.sets : null;
  const setCount = setsArr ? setsArr.length : (Number(ex.sets) || 3);

  let reps = (!setsArr) ? ex.reps : undefined;
  if (reps == null && setsArr && setsArr.length) {
    const r = setsArr.find(s => s && (s.reps || s.reps === 0));
    reps = r ? r.reps : undefined;
  }

  return {
    _id: ex._id || exid(),
    name: ex.name || ex.nameZh || ex.title || 'Exercise',
    nameEn: ex.nameEn || ex.englishName || '',
    sets: Number(setCount) || 3,
    reps: (reps != null && reps !== '') ? String(reps) : '8–12',
    rest: ex.rest || '90s',
    equipment: ex.equipment || ex.cat || ex.category || '',
    muscle: ex.muscle || ex.primaryMuscle || ex.subPart || ex.target || '',
    tier: ex.tier ?? null,
    image_url: ex.image_url || '',
  };
}

/** 同分類自動 A/B/C 命名（使用者未填名稱時用）。 */
export function defaultBlockName(category, blocks = loadBlocks()) {
  const cat = String(category || 'CUSTOM').toUpperCase();
  const sameCat = blocks.filter(b => String(b.category || '').toUpperCase() === cat).length;
  const letter = String.fromCharCode(65 + sameCat); // A, B, C, ...
  return `${CATEGORY_ZH[cat] || cat} ${letter}`;
}

/** 新增一個 block，回傳建立好的 block。 */
export function addBlock({ name, category, exercises, source = 'manual' } = {}) {
  const blocks = loadBlocks();
  const cat = String(category || '').trim() || 'CUSTOM';
  const cleanName = String(name || '').trim() || defaultBlockName(cat, blocks);
  const block = {
    _id: uid(),
    name: cleanName,
    category: cat,
    exercises: (exercises || []).map(normalizeExercise),
    source,
    createdAt: Date.now(),
  };
  blocks.unshift(block);
  saveBlocks(blocks);
  return block;
}

export function deleteBlock(id) {
  saveBlocks(loadBlocks().filter(b => b._id !== id));
}

/** 更新一個 block（合併 patch；exercises 若有給就整批取代並正規化）。回傳更新後的 block。 */
export function updateBlock(id, patch = {}) {
  const blocks = loadBlocks();
  let updated = null;
  const next = blocks.map(b => {
    if (b._id !== id) return b;
    updated = {
      ...b,
      ...patch,
      name: (patch.name != null ? String(patch.name).trim() : b.name) || b.name,
      category: (patch.category != null ? String(patch.category).trim().toUpperCase() : b.category) || b.category,
      exercises: patch.exercises ? patch.exercises.map(normalizeExercise) : b.exercises,
      updatedAt: Date.now(),
    };
    return updated;
  });
  saveBlocks(next);
  return updated;
}

/**
 * 依分類分組（給挑選視窗用）。同分類內 >1 個時，附上 _letter（A/B/C）以利區分。
 * 回傳：[{ category, color, blocks:[...] }]，分類順序為預設分類在前、自訂在後。
 */
export function groupBlocksByCategory(blocks = loadBlocks()) {
  const map = new Map();
  blocks.forEach(b => {
    const cat = String(b.category || 'CUSTOM').toUpperCase();
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(b);
  });

  const order = (cat) => {
    const i = BLOCK_CATEGORIES.indexOf(cat);
    return i === -1 ? 999 : i;
  };

  return Array.from(map.entries())
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([category, arr]) => ({
      category,
      color: categoryColor(category),
      blocks: arr.map((b, i) => ({ ...b, _letter: arr.length > 1 ? String.fromCharCode(65 + i) : '' })),
    }));
}

/** 把 block 的動作轉成可塞進 builder 某天的 exercises（重新產生 _id 避免 key 衝突）。 */
export function blockToDayExercises(block) {
  return (block?.exercises || []).map(ex => ({ ...normalizeExercise(ex), _id: exid() }));
}
