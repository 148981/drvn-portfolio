/**
 * exerciseSpec.js — 動作 × 機位規格的單一真相來源
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼要有這個檔案
 * ────────────────
 *   「這個動作該怎麼拍」的表原本在三個檔案裡各複製一份，而且都停在
 *   實驗之前的版本 —— App 在推薦自己的實驗已經證明沒用的角度。
 *   所有畫面一律從這裡讀，不要再各自定義。
 *
 * 【v9.3】一個動作可以有多個機位，各自量不同的東西
 * ────────────────────────────────────────────
 *   不同機位量到的**不是同一個量**。深蹲：
 *
 *     正面 0°    膝蓋內夾是左右方向的位移 → 落在影像平面上，量得到
 *     正側面 90° 同一個位移沿著鏡頭光軸 → 投影退化，量不到
 *                但蹲的深度與軀幹角度反而是正側面最清楚
 *
 *   所以模板必須**每個機位各建一份**（後端 template_{key}__{view}.npz），
 *   拿 A 機位的模板去比 B 機位的影片，比到的是投影差異不是動作差異。
 *
 * 三種機位狀態
 * ──────────
 *   validated  做過效度實驗，系統敢宣告「這個角度抓得到某某錯誤」
 *   scoring    可以計分，但沒做過效度實驗 → 只講量到什麼，不宣告抓得到錯誤
 *   blocked    連量都量不到（骨長恆定性沒過）→ 不開放
 */

import { CAMERA_TARGETS, POSE_TOLERANCE_DEG } from './cameraAngle.js';

export { POSE_TOLERANCE_DEG };

/** 相機架法。UI 依這個決定要顯示羅盤盤面還是水平儀。 */
export const RIG = {
  UPRIGHT: 'upright',
  OVERHEAD: 'overhead',
};

export const RIG_SPEC = {
  [RIG.UPRIGHT]: {
    label: '直立環繞',
    hold: '手機直立拿著，螢幕朝自己、鏡頭朝外',
    move: '帶著手機沿圓弧走動，全程鏡頭對準訓練位置',
    moveWarn: '站在原地轉手機沒有用 —— 那只改變朝向，你的位置沒變',
    mount: '架在髖部高度、距離 2.5–3 公尺，不要俯拍',
  },
  [RIG.OVERHEAD]: {
    label: '水平俯視',
    hold: '手機放平，鏡頭朝正下方',
    move: '調整到完全水平，畫面對準胸口',
    moveWarn: '不要仰拍 —— 從下往上拍，槓片會完全遮住手腕與手肘',
    mount: '架在臥推椅正上方，畫面涵蓋頭到髖',
  },
};

/** 機位狀態 */
export const VIEW_STATE = {
  VALIDATED: 'validated',
  SCORING: 'scoring',
  BLOCKED: 'blocked',
};

/**
 * 動作 → 機位表。
 *
 *   state     validated / scoring / blocked
 *   catches   實測驗證過、系統敢宣告抓得到的錯誤（只有 validated 才有）
 *   measures  這個機位量得到的項目（給 scoring 用，講量到什麼但不宣告抓得到錯誤）
 *   evidence  一句話實測依據，收在問號裡
 */
/* tint / btn / image：畫面上的呈現。
   ⚠️ 這三樣以前散在 ExerciseSelectorMobile 的 EXERCISE_STYLES、同檔 render 裡
      硬寫的 bgImages、以及 ExerciseHistoryMobile 的 EXERCISES 三個地方 ——
      三份清單長度還不一樣（選擇頁 5 個、歷史頁 6 個），
      所以同一個動作在兩頁看起來是兩件事。動作是什麼，只能有一份定義。 */
export const EXERCISE_SPEC = {
  squat: {
    key: 'squat', name: '深蹲', nameEn: 'Squat',
    tint: '#A8D5A2', btn: '#2E7D32',
    image: '/download/7a1f0261de4715fd78874ac0d42d55b1.jpg',
    primaryView: 'frontal_0',
    views: {
      frontal_0: {
        code: 'frontal_0', name: '正面 0°', short: '正面',
        rig: RIG.UPRIGHT, state: VIEW_STATE.VALIDATED,
        catches: ['膝蓋內夾'],
        /* ⚠️ catchMetrics 是指標 key，不可省略。
           以前結果頁是拿 catches 的中文去跟 METRIC_ZH 做「互相包含」比對，
           「肘外展過開」與「手肘外展」互不包含 → 臥推的徽章永遠不出現。
           用字面猜對應關係本來就不該是機制，直接把 key 寫出來。 */
        catchMetrics: ['Knee Valgus'],
        measures: ['左右膝角', '軀幹前傾', '蹲深', '膝內夾'],
        blind: ['深度不足', '左右不對稱'],
        evidence: '正面刻意做膝內夾掉 56.8 分；同一個人同一組動作，換到正側面只掉 8.9 分。',
        framing: '蹲到最低點時腳到頭都要在框內',
      },
      sagittal_90: {
        code: 'sagittal_90', name: '正側面 90°', short: '側面',
        rig: RIG.UPRIGHT, state: VIEW_STATE.SCORING,
        catches: [],
        measures: ['蹲深', '軀幹前傾', '近側膝角'],
        blind: ['膝蓋內夾', '左右不對稱'],
        evidence: '正側面把蹲深與軀幹角度看得最清楚，但膝蓋內夾沿著鏡頭光軸，實測只掉 8.9 分 —— 這一項不會宣告抓得到。',
        framing: '蹲到最低點時腳到頭都要在框內',
      },
    },
  },

  bench_press: {
    key: 'bench_press', name: '臥推', nameEn: 'Bench Press',
    tint: '#F4A0A0', btn: '#C62828',
    image: '/download/c2c604115fb48a40ba6cd2b58beef67b.jpg',
    primaryView: 'overhead',
    views: {
      overhead: {
        code: 'overhead', name: '正上方俯視', short: '俯視',
        rig: RIG.OVERHEAD, state: VIEW_STATE.VALIDATED,
        catches: ['肘外展過開'],
        catchMetrics: ['Elbow Flare'],
        measures: ['肘外展', '前臂垂直', '左右對稱'],
        blind: ['握距不當', '下放深度'],
        evidence: '俯視刻意做肘外展掉 40.3 分；正側面拍時遠側手臂被完全擋住，量到的是深度雜訊。',
        framing: '頭到髖都要在框內，槓不要壓到手腕',
      },
      sagittal_90: {
        code: 'sagittal_90', name: '正側面 90°', short: '側面',
        rig: RIG.UPRIGHT, state: VIEW_STATE.BLOCKED,
        reason: '躺姿時遠側手臂被身體完全遮擋，實測前臂骨長左右差 32–47%（門檻 20%）。那一側的座標是模型推估的，不是看到的，系統會直接拒絕評分。',
      },
    },
  },

  // ── 以下動作尚未完成角度效度驗證 ────────────────────────────
  deadlift: {
    key: 'deadlift', name: '硬舉', nameEn: 'Deadlift',
    tint: '#FFD66B', btn: '#9A7000',
    image: '/download/91485723f70c440830daf5d5b2aa6860.jpg',
    primaryView: null, views: {},
    reason: '尚未完成此動作的機位效度驗證，暫不開放。',
  },
  overhead_press: {
    key: 'overhead_press', name: '肩推', nameEn: 'Overhead Press',
    tint: '#FF9F76', btn: '#C84B00',
    image: '/download/e4c52edbb30a82facb57f2194012ff25.jpg',
    primaryView: null, views: {},
    reason: '尚未完成此動作的機位效度驗證，暫不開放。',
  },
  /* ⚠️ lat_pulldown 以前不在這份表裡，但後端 EXERCISE_CONFIGS 有它、
     歷史頁的清單也有它 —— 於是選擇頁只看得到 5 個動作、歷史頁有 6 個，
     而 specFor('lat_pulldown') 回 null。補進來，狀態照實說。 */
  lat_pulldown: {
    key: 'lat_pulldown', name: '滑輪下拉', nameEn: 'Lat Pulldown',
    tint: '#B5D8F6', btn: '#1A72C9',
    image: '/download/Gemini_Generated_Image_ovyquxovyquxovyq.png',
    primaryView: null, views: {},
    reason: '尚未完成此動作的機位效度驗證，暫不開放。',
  },
  barbell_row: {
    key: 'barbell_row', name: '划船', nameEn: 'Barbell Row',
    tint: '#D4BAED', btn: '#6A1B9A',
    image: '/download/f1b5883caff589941f420db635305ca2.jpg',
    primaryView: null, views: {},
    reason: '尚未完成此動作的機位效度驗證，暫不開放。',
  },
};

/** 動作在選單上的順序 —— 已驗證的排前面。 */
export const EXERCISE_ORDER = [
  'squat', 'bench_press', 'deadlift', 'overhead_press', 'barbell_row', 'lat_pulldown',
];

/** 畫面上要列出的動作（含名稱、顏色、圖）—— 選擇頁與歷史頁都讀這一支。 */
export const EXERCISE_LIST = EXERCISE_ORDER.map((k) => {
  const ex = EXERCISE_SPEC[k];
  return {
    key: k, name: ex.name, nameEn: ex.nameEn,
    tint: ex.tint, btn: ex.btn, image: ex.image,
  };
});

/* ══════════════════════════════════════════════════════════════════
   查詢 API
   ══════════════════════════════════════════════════════════════════ */

export function exerciseFor(exerciseKey) {
  return EXERCISE_SPEC[exerciseKey] || null;
}

/** 某個動作可以拍的機位（blocked 的不列入可選，但仍回傳供說明用）。 */
export function viewsFor(exerciseKey, { includeBlocked = false } = {}) {
  const ex = EXERCISE_SPEC[exerciseKey];
  if (!ex) return [];
  return Object.values(ex.views || {})
    .filter(v => includeBlocked || v.state !== VIEW_STATE.BLOCKED);
}

export function viewSpecFor(exerciseKey, viewCode) {
  const ex = EXERCISE_SPEC[exerciseKey];
  if (!ex) return null;
  return (ex.views || {})[viewCode] || null;
}

/**
 * 相容既有畫面：回傳「主機位攤平後」的規格。
 *
 * 舊呼叫端拿到的欄位（validatedView / viewName / catches / blind /
 * evidence / framing / rig）全部維持，另外附上 views 供新畫面用。
 */
export function specFor(exerciseKey, viewCode) {
  const ex = EXERCISE_SPEC[exerciseKey];
  if (!ex) return null;
  const code = viewCode || ex.primaryView;
  const v = code ? (ex.views || {})[code] : null;
  if (!v) {
    return {
      key: ex.key, name: ex.name, nameEn: ex.nameEn,
      tint: ex.tint, btn: ex.btn, image: ex.image,
      validatedView: null, reason: ex.reason, views: ex.views || {},
    };
  }
  return {
    key: ex.key, name: ex.name, nameEn: ex.nameEn,
    viewCode: v.code,
    // ⚠️ validatedView 保留只為相容舊呼叫端。它對 scoring 機位也會有值，
    //    所以**不能**拿來判斷「這個機位驗證過了沒」—— 要用 viewState。
    validatedView: v.code,
    viewName: v.name,
    viewShort: v.short,
    viewState: v.state,
    rig: v.rig,
    catches: v.catches || [],
    catchMetrics: v.catchMetrics || [],
    blind: v.blind || [],
    metrics: v.measures || [],
    evidence: v.evidence,
    framing: v.framing,
    views: ex.views || {},
    primaryView: ex.primaryView,
  };
}

export function isValidated(exerciseKey, viewCode) {
  const s = specFor(exerciseKey, viewCode);
  return s?.viewState === VIEW_STATE.VALIDATED;
}

export function rigFor(exerciseKey, viewCode) {
  const s = specFor(exerciseKey, viewCode);
  return s?.rig ? RIG_SPEC[s.rig] : null;
}

/** 角度目標（CameraAngleFinder 用）。沿用 cameraAngle 的定義避免兩份。 */
export function angleTargetFor(exerciseKey, viewCode) {
  const byView = CAMERA_TARGETS[exerciseKey];
  if (!byView) return null;
  const code = viewCode || EXERCISE_SPEC[exerciseKey]?.primaryView;
  return byView[code] || null;
}

/**
 * 動作卡的三級狀態。
 * templates: 後端回的 { [view]: { exists, reps } }
 */
export function exerciseStatus(exerciseKey, templates) {
  const ex = EXERCISE_SPEC[exerciseKey];
  if (!ex) return { level: 'unvalidated', label: '不支援' };
  if (!ex.primaryView) {
    return { level: 'unvalidated', label: '尚未開放', note: ex.reason };
  }
  const t = templates && typeof templates === 'object' ? templates : {};
  const has = (code) => !!(t[code]?.exists);
  const usable = viewsFor(exerciseKey);
  const built = usable.filter(v => has(v.code));

  if (built.length > 0) {
    const primary = specFor(exerciseKey);
    return {
      level: 'ready',
      label: '可分析',
      note: built.length === usable.length
        ? `${usable.length} 個機位都可以分析`
        : `${built.map(v => v.short).join('、')} 可以分析`,
      builtViews: built.map(v => v.code),
      primaryName: primary?.viewName,
    };
  }
  return {
    level: 'needTpl',
    label: '先建模板',
    note: `還沒有模板，先錄幾支標準動作當基準`,
    builtViews: [],
  };
}

/** 狀態顏色 —— 三個畫面共用，不要各自定義。 */
export const STATUS_COLOR = {
  ready: '#6E8F4A',
  needTpl: '#C68E5D',
  unvalidated: '#8B8681',
};

/* ══════════════════════════════════════════════════════════════════
   結果頁：解釋「為什麼有些項目沒有分數」
   ══════════════════════════════════════════════════════════════════
   寫法要求：條列、不出現「本專題」這種內部語彙、預設收折。
   ────────────────────────────────────────────────────────────────── */
export function uncoveredReasons(exerciseKey, viewCode) {
  const s = specFor(exerciseKey, viewCode);
  const out = [
    '此角度無法取得該項目的有效影像，或重複量測結果不穩定。',
    '未達標準的項目一律不計入分數，不會以 0 分計算。',
  ];
  if (s?.catches?.length) {
    out.push(`目前機位（${s.viewName}）經驗證可偵測：${s.catches.join('、')}。`);
  }
  if (s?.blind?.length) {
    out.push(`${s.blind.join('、')} 需改用其他機位量測。`);
  }
  return out;
}
