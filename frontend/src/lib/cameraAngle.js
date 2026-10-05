/**
 * cameraAngle.js — 拍攝角度引導的數學層
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼需要這個檔案（實測依據，drvn_research_all_1785908337184，46 支）
 * ──────────────────────────────────────────────────────────────────
 *   同一個人、同一個動作、同一套演算法，只換相機角度：
 *
 *     離已驗證機位  2.7°   刻意膝內夾掉 56.8 分   ✅ 抓得到
 *     離已驗證機位 20.9°                31.9 分   ✅ 抓得到
 *     離已驗證機位 31.7°                17.4 分   ❌ 跌破 20 分門檻
 *     離已驗證機位 41.7°                 8.4 分   ❌
 *     離已驗證機位 63.0°                22.1 分   ⚠️ 假偵測（連帶效應）
 *
 *   跌破門檻的交叉點落在 29.7°，所以容差訂 30°。
 *   更狠的是：超過 ~30° 之後連「標準動作」都只剩 22–26 分（正面是 93 分），
 *   不只是抓不到錯誤，是整個量測失效。
 *
 *   → 角度不是拍攝建議，是決定系統能不能用的前提。所以要在「拍之前」就擋。
 *
 * 兩段式量測（為什麼不是一種就好）
 * ──────────────────────────────
 *   第一段 · 羅盤（本檔 heading 區）
 *     使用者站在訓練位置、把手機對準身體正面按「設為基準」，之後拿著手機
 *     繞著走，即時算出「相機位在身體的哪個方位」。
 *     優點：手機在手上，看得到螢幕、震得到手。
 *     缺點：量的是手機朝向，基準沒對準就整組偏；健身房鐵器會干擾磁力計。
 *
 *   第二段 · 骨架反推（cameraPose，見 framingCheck.js）
 *     手機架好、人走進畫面之後，用肩線 × 軀幹軸建出身體座標系，
 *     反推相機在身體座標系的方位角 —— 跟後端 metrology.camera_pose
 *     完全同一套數學，不受磁干擾，是真值。
 *     缺點：要有人入鏡才有數字，找位置的當下量不到。
 *
 *   所以：羅盤用來「找」，骨架用來「驗」。兩段都過才准錄。
 *
 * ⚠️ 已評估並否決：Apple Watch ↔ 手機 測角
 *   Nearby Interaction（UWB 測方位＋距離）在 watchOS 上不開放，只支援
 *   iPhone 之間。剩下能做的只有「兩邊羅盤 heading 相減」，但那只給
 *   「兩個裝置朝向的夾角」，不等於「相機在身體的方位角」（需要相對位置，
 *   不是相對朝向），而且健身房鐵器對磁力計的干擾比單機更難校正。
 *   結論：不做。羅盤 + 骨架已經覆蓋同一個需求，而且不用戴手錶。
 */

/* eslint-disable no-empty */

// ══════════════════════════════════════════════════════════════════
// 常數 — 與後端 core/measurability.py 對齊，改這裡要同步改那裡
// ══════════════════════════════════════════════════════════════════

/** 容差（度）。實測交叉點 29.7°，取整 30°。 */
export const POSE_TOLERANCE_DEG = 30;

/** 進入「完美」狀態的角度，給 UI 一個更嚴的綠燈。 */
export const POSE_PERFECT_DEG = 12;

/** 手機要「放平朝下」時允許的傾斜（度）。 */
export const FLAT_TOLERANCE_DEG = 18;

/**
 * 每個動作的角度目標 —— 只放**數學**需要的欄位。
 *
 * 文案（為什麼是這個角度、怎麼架、抓得到什麼）一律放 exerciseSpec.js，
 * 這裡只留座標與判定參數，避免同一件事有兩個版本。
 *
 * 只列實測驗證過的機位 —— 沒有對照影片的角度一律不列，
 * 免得系統又在宣告它沒驗證過的能力。
 *
 *   mode 'azimuth'  用羅盤方位角引導（相機繞著人走）
 *   mode 'overhead' 用手機傾斜度引導（相機架在正上方朝下）
 *   skeletonRef     骨架反推出來的已驗證方位 (azimuth, elevation)，
 *                   對應後端 VALIDATED_CAMERA_POSE
 */
export const CAMERA_TARGETS = {
  squat: {
    frontal_0: {
      view: 'frontal_0',
      mode: 'azimuth',        // 用羅盤方位角引導
      targetAzimuth: 0,       // 0° = 相機在身體正前方
      skeletonRef: [-176.7, 6.5],
    },
    sagittal_90: {
      view: 'sagittal_90',
      mode: 'azimuth',
      targetAzimuth: 90,      // +90° = 相機在身體右側
      skeletonRef: [-113.2, 0.5],
    },
  },
  bench_press: {
    overhead: {
      view: 'overhead',
      mode: 'overhead',       // 沒有方位角可言，改用水平儀
      skeletonRef: [-175.6, 6.9],
    },
  },
};

/** 沒有對應設定的動作 → 不做角度引導，但也不假裝可以。 */
export function targetFor(exerciseKey) {
  return CAMERA_TARGETS[exerciseKey] || null;
}

// ══════════════════════════════════════════════════════════════════
// 角度數學
// ══════════════════════════════════════════════════════════════════

/** 把任意角度收斂到 [−180, 180)。正後方一律記成 −180。 */
export function wrap180(deg) {
  if (!Number.isFinite(deg)) return NaN;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * 相機位在身體的哪個方位角。
 *
 *   cameraHeading  手機（鏡頭）現在朝向的羅盤方位，0° = 正北、順時針increasing
 *   baseHeading    使用者站定時「身體正面」朝向的羅盤方位（按基準鍵時記下的）
 *
 * 推導：相機在 C、人在 P。相機朝向 P，所以 C→P 的方位 = cameraHeading，
 *       反過來 P→C（相機位在人的哪邊）= cameraHeading + 180。
 *       再減掉身體正面的朝向，就得到「以身體正面為 0°」的方位角。
 *
 * 回傳：0° = 正前方 · +90° = 身體右側 · ±180° = 正後方
 */
export function relativeAzimuth(cameraHeading, baseHeading) {
  if (!Number.isFinite(cameraHeading) || !Number.isFinite(baseHeading)) return NaN;
  return wrap180(cameraHeading + 180 - baseHeading);
}

/** 帶正負號的角度誤差（現在 − 目標），已處理 ±180 繞回。 */
export function azimuthError(current, target) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return NaN;
  return wrap180(current - target);
}

/**
 * 兩個相機姿態的夾角（度）。
 *
 * 用向量夾角而不是「方位差 + 仰角差」—— 方位角在極區會退化，而且會在
 * ±180° 繞回（實測臥推自選 169.2° vs 俯視 −175.6°，直接相減是 344.8°，
 * 實際只差 15.2°）。與後端 camera_offset_deg 同一套。
 */
export function poseOffsetDeg(a, b) {
  if (!a || !b) return NaN;
  const vec = (az, el) => {
    const A = (az * Math.PI) / 180;
    const E = (el * Math.PI) / 180;
    return [Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E)];
  };
  const va = vec(a[0], a[1]);
  const vb = vec(b[0], b[1]);
  const d = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

/**
 * 羅盤階段的即時判定。
 *
 * 回傳 { off, err, state, hint, arrow }
 *   state  'perfect' | 'ok' | 'near' | 'far'
 *   arrow  'left' | 'right' | null —— 使用者要往哪邊繞
 */
export function azimuthVerdict(currentAz, targetAz, tol = POSE_TOLERANCE_DEG) {
  const err = azimuthError(currentAz, targetAz);
  const off = Math.abs(err);
  if (!Number.isFinite(off)) {
    return { off: NaN, err: NaN, state: 'far', hint: '正在讀取方位…', arrow: null };
  }
  // 使用者面向訓練位置站著。相機偏身體右側（err > 0）時，
  // 要往「持機者的右手邊」沿圓弧繞才會回到正面。（詳見檔頭推導）
  const arrow = off <= POSE_PERFECT_DEG ? null : (err > 0 ? 'right' : 'left');
  if (off <= POSE_PERFECT_DEG) {
    return { off, err, state: 'perfect', hint: '就是這裡，別動', arrow: null };
  }
  if (off <= tol) {
    return { off, err, state: 'ok', hint: `可以用了，再往${err > 0 ? '右' : '左'}一點更好`, arrow };
  }
  if (off <= tol * 1.6) {
    return { off, err, state: 'near', hint: `還差 ${Math.round(off - tol)}°，往${err > 0 ? '右' : '左'}繞`, arrow };
  }
  return { off, err, state: 'far', hint: `往${err > 0 ? '右' : '左'}繞，離目標還有 ${Math.round(off)}°`, arrow };
}

/**
 * 俯視階段的即時判定 —— 手機有沒有放平（鏡頭朝正下方）。
 * tilt: 由 deviceorientation 的 beta / gamma 合成，0 = 完全水平。
 */
export function flatVerdict(tilt, tol = FLAT_TOLERANCE_DEG) {
  if (!Number.isFinite(tilt)) {
    return { off: NaN, state: 'far', hint: '正在讀取傾斜角…', arrow: null };
  }
  if (tilt <= tol * 0.5) return { off: tilt, state: 'perfect', hint: '水平了，固定住', arrow: null };
  if (tilt <= tol) return { off: tilt, state: 'ok', hint: '接近水平，可以用', arrow: null };
  if (tilt <= tol * 2) return { off: tilt, state: 'near', hint: `再放平一點，還差 ${Math.round(tilt - tol)}°`, arrow: null };
  return { off: tilt, state: 'far', hint: '手機要放平、鏡頭朝正下方', arrow: null };
}

/** 骨架驗收：量到的方位離已驗證機位多遠。回傳 null = 這一幀量不到。 */
export function skeletonVerdict(pose, target, tol = POSE_TOLERANCE_DEG) {
  if (!pose || !target?.skeletonRef) return null;
  const off = poseOffsetDeg([pose.azimuth, pose.elevation], target.skeletonRef);
  if (!Number.isFinite(off)) return null;
  if (off <= POSE_PERFECT_DEG) return { off, state: 'perfect', hint: '角度確認，跟驗證過的機位一致' };
  if (off <= tol) return { off, state: 'ok', hint: `離已驗證機位 ${Math.round(off)}°，在容差內` };
  return {
    off,
    state: 'far',
    hint: `離已驗證機位 ${Math.round(off)}°，超過 ${tol}° 容差 —— 這個角度量不準，請重新架`,
  };
}

// ══════════════════════════════════════════════════════════════════
// 感測器
// ══════════════════════════════════════════════════════════════════

/** 這台裝置有沒有方位感測器。 */
export function hasOrientationSensor() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** iOS 13+ 需要在使用者手勢裡要權限。回傳 'granted' | 'denied' | 'unsupported' */
export async function requestOrientationPermission() {
  if (!hasOrientationSensor()) return 'unsupported';
  const D = window.DeviceOrientationEvent;
  if (typeof D.requestPermission !== 'function') return 'granted';   // Android / 舊 iOS
  try {
    const r = await D.requestPermission();
    return r === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * 訂閱裝置方位。
 *
 * cb({ heading, tilt, absolute })
 *   heading   羅盤方位（0 = 正北，順時針）。拿不到 → NaN
 *   tilt      手機離水平多少度（0 = 完全放平，鏡頭朝正下方）
 *   absolute  heading 是不是真的絕對方位（false = 只有相對角，不可信）
 *
 * 回傳 unsubscribe()
 */
export function subscribeOrientation(cb) {
  if (typeof window === 'undefined' || !hasOrientationSensor()) return () => {};

  const handle = (e) => {
    // iOS：webkitCompassHeading 已經是校正過的真北方位
    let heading = NaN;
    let absolute = false;
    if (Number.isFinite(e.webkitCompassHeading)) {
      heading = e.webkitCompassHeading;
      absolute = true;
    } else if (Number.isFinite(e.alpha)) {
      // W3C：alpha 是逆時針，且只有 absolute 事件才是真北
      heading = (360 - e.alpha) % 360;
      absolute = !!e.absolute;
    }
    // beta（前後傾）與 gamma（左右傾）合成「離水平多遠」
    const beta = Number.isFinite(e.beta) ? e.beta : NaN;
    const gamma = Number.isFinite(e.gamma) ? e.gamma : NaN;
    const tilt = Number.isFinite(beta) && Number.isFinite(gamma)
      ? Math.min(90, Math.hypot(wrap180(beta), wrap180(gamma)))
      : NaN;
    cb({ heading, tilt, absolute });
  };

  // deviceorientationabsolute 才是真北；沒有就退回 deviceorientation
  let evt = 'deviceorientation';
  try {
    if ('ondeviceorientationabsolute' in window) evt = 'deviceorientationabsolute';
  } catch {}
  window.addEventListener(evt, handle, true);
  return () => { try { window.removeEventListener(evt, handle, true); } catch {} };
}

/**
 * 角度平滑 —— 磁力計原始值抖得很兇，直接顯示會讓數字一直跳。
 * 用圓形平均（把角度當單位向量疊加）避免 359° / 1° 之間的跳動。
 */
export function makeAngleSmoother(alpha = 0.18) {
  let x = null;
  let y = null;
  return (deg) => {
    if (!Number.isFinite(deg)) return NaN;
    const r = (deg * Math.PI) / 180;
    const cx = Math.cos(r);
    const cy = Math.sin(r);
    if (x === null) { x = cx; y = cy; } else {
      x += (cx - x) * alpha;
      y += (cy - y) * alpha;
    }
    return wrap180((Math.atan2(y, x) * 180) / Math.PI);
  };
}
