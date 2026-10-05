/**
 * poseFeatureExtractors.js
 * ═══════════════════════════════════════════════════════════════
 * 前端邊緣運算：將 Python multi_exercise.py 的 6 個動作特徵擷取公式
 * 完整翻譯成 JavaScript，供 MediaPipe Web 即時計算。
 *
 * 每個 extractor 函數接收 MediaPipe 的 worldLandmarks 與 landmarks，
 * 回傳 7 維特徵向量 (Float64Array) + 8 維信心分數。
 *
 * 支援動作：
 *   lat_pulldown | squat | deadlift | bench_press | overhead_press | barbell_row
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Geometry Helpers（對應 Python calculate_angle / vector_angle_deg / torso_lean_angle / mid）────

/**
 * 計算三點夾角 (3D 空間)
 * @param {Object} a - {x, y, z}
 * @param {Object} b - {x, y, z} (vertex)
 * @param {Object} c - {x, y, z}
 * @returns {number} angle in degrees
 */
export const calculateAngle = (a, b, c) => {
  const ba = [a.x - b.x, a.y - b.y, a.z - b.z];
  const bc = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = ba[0] * bc[0] + ba[1] * bc[1] + ba[2] * bc[2];
  const magBA = Math.sqrt(ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2) + 1e-6;
  const magBC = Math.sqrt(bc[0] ** 2 + bc[1] ** 2 + bc[2] ** 2) + 1e-6;
  const cosine = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosine) * 180) / Math.PI;
};

/**
 * 兩向量夾角
 */
export const vectorAngleDeg = (v1, v2) => {
  const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2) + 1e-6;
  const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2) + 1e-6;
  const u1 = [v1[0] / mag1, v1[1] / mag1, v1[2] / mag1];
  const u2 = [v2[0] / mag2, v2[1] / mag2, v2[2] / mag2];
  const dot = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1] + u1[2] * u2[2]));
  return (Math.acos(dot) * 180) / Math.PI;
};

/**
 * 軀幹傾斜角度（相對於垂直線 [0, -1, 0]）
 */
export const torsoLeanAngle = (hip3D, shoulder3D) => {
  const torsoVec = [
    shoulder3D.x - hip3D.x,
    shoulder3D.y - hip3D.y,
    shoulder3D.z - hip3D.z,
  ];
  return vectorAngleDeg(torsoVec, [0, -1, 0]);
};

/**
 * 兩點中點
 */
export const midPoint = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

/**
 * 3D 向量長度
 */
const vecNorm = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * 滑動窗口方差計算器（模擬 Python deque + np.var）
 */
export class SlidingVariance {
  constructor(maxLen) {
    this.maxLen = maxLen;
    this.buffer = [];
  }
  push(val) {
    this.buffer.push(val);
    if (this.buffer.length > this.maxLen) this.buffer.shift();
  }
  get variance() {
    if (this.buffer.length < 2) return 0;
    const mean = this.buffer.reduce((s, v) => s + v, 0) / this.buffer.length;
    return this.buffer.reduce((s, v) => s + (v - mean) ** 2, 0) / this.buffer.length;
  }
  get last() { return this.buffer[this.buffer.length - 1]; }
  get first() { return this.buffer[0]; }
  get length() { return this.buffer.length; }
  reset() { this.buffer = []; }
}


// ─── MediaPipe Landmark Indices ─────────────────────────────────────────────
// 11=LS  12=RS  13=LE  14=RE  15=LW  16=RW
// 23=LH  24=RH  25=LK  26=RK  27=LA  28=RA
// 0=NOSE

const I = {
  LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16,
  LH: 23, RH: 24, LK: 25, RK: 26, LA: 27, RA: 28,
  NOSE: 0,
};

/** Safe landmark getter — returns {x:0, y:0, z:0, visibility:0} if missing */
const safeLm = (landmarks, idx) => {
  const lm = landmarks[idx];
  if (!lm || typeof lm.x !== 'number') return { x: 0, y: 0, z: 0, visibility: 0 };
  return lm;
};


// ═══════════════════════════════════════════════════════════════════════════════
// 1. 滑輪下拉 Lat Pulldown
// ═══════════════════════════════════════════════════════════════════════════════

export function createLatPulldownExtractor(fps = 30) {
  const wristHist = new SlidingVariance(2);
  const comHist = new SlidingVariance(Math.max(1, Math.floor(fps / 2)));

  return function extract(wl, il, bodyThr = 0.20, jointThr = 0.20) {
    const fv = new Array(7).fill(NaN);
    const vc = new Array(8).fill(0);

    const ls = safeLm(wl, I.LS), le = safeLm(wl, I.LE), lw = safeLm(wl, I.LW);
    const rs = safeLm(wl, I.RS), re = safeLm(wl, I.RE), rw = safeLm(wl, I.RW);
    const lh = safeLm(wl, I.LH), rh = safeLm(wl, I.RH);

    const lsv = il[I.LS].visibility, rsv = il[I.RS].visibility;
    const lev = il[I.LE].visibility, rev = il[I.RE].visibility;
    const lwv = il[I.LW].visibility, rwv = il[I.RW].visibility;
    const lhv = il[I.LH].visibility, rhv = il[I.RH].visibility;
    vc.splice(0, 8, lsv, rsv, lev, rev, lwv, rwv, lhv, rhv);

    // fv[0] L Elbow
    if (lsv > jointThr && lev > jointThr && lwv > jointThr) {
      fv[0] = calculateAngle(ls, le, lw);
    }
    // fv[1] R Elbow
    if (rsv > jointThr && rev > jointThr && rwv > jointThr) {
      fv[1] = calculateAngle(rs, re, rw);
    }
    // fv[2] Torso Lean
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      const mh = midPoint(lh, rh);
      const ms = midPoint(ls, rs);
      fv[2] = torsoLeanAngle(mh, ms);
    }
    // fv[3] Tempo (wrist Y delta)
    if (lwv > jointThr && rwv > jointThr) {
      const curY = (lw.y + rw.y) / 2;
      wristHist.push(curY);
      fv[3] = wristHist.length > 1 ? wristHist.last - wristHist.first : 0;
    }
    // fv[4] Elbow Symmetry
    if (!isNaN(fv[0]) && !isNaN(fv[1])) {
      fv[4] = Math.abs(fv[0] - fv[1]);
    }
    // fv[5] Stability (COM X variance)
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      const mh = midPoint(lh, rh);
      const ms = midPoint(ls, rs);
      comHist.push((mh.x + ms.x) / 2);
      fv[5] = comHist.variance;
    }
    // fv[6] Shrug (shoulder Y / torso length)
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      const ms = midPoint(ls, rs);
      const mh = midPoint(lh, rh);
      const tl = vecNorm(ms, mh);
      fv[6] = tl > 0.1 ? ms.y / tl : NaN;
    }

    return { features: fv, confidence: vc };
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. 深蹲 Squat
// ═══════════════════════════════════════════════════════════════════════════════

export function createSquatExtractor(fps = 30) {
  const comHist = new SlidingVariance(Math.max(1, Math.floor(fps / 2)));

  // 門檻調降：0.75/0.65 太嚴 —— 關節稍微低可見度（如腳踝靠近畫面邊緣）
  // 就會讓整個角度特徵變 NaN，連帶計次訊號整欄失效。0.45/0.35 與後端側面
  // 視角門檻一致，能擋掉真雜訊又不會誤殺正常偵測。
  return function extract(wl, il, bodyThr = 0.45, jointThr = 0.35) {
    const fv = new Array(7).fill(NaN);
    const vc = new Array(8).fill(0);

    const ls = safeLm(wl, I.LS), rs = safeLm(wl, I.RS);
    const lh = safeLm(wl, I.LH), rh = safeLm(wl, I.RH);
    const lk = safeLm(wl, I.LK), rk = safeLm(wl, I.RK);
    const la = safeLm(wl, I.LA), ra = safeLm(wl, I.RA);

    const lsv = il[I.LS].visibility, rsv = il[I.RS].visibility;
    const lhv = il[I.LH].visibility, rhv = il[I.RH].visibility;
    const lkv = il[I.LK].visibility, rkv = il[I.RK].visibility;
    const lav = il[I.LA].visibility, rav = il[I.RA].visibility;
    vc.splice(0, 8, lsv, rsv, lhv, rhv, lkv, rkv, lav, rav);

    // fv[0] L Knee
    if (lhv > jointThr && lkv > jointThr && lav > jointThr) {
      fv[0] = calculateAngle(lh, lk, la);
    }
    // fv[1] R Knee
    if (rhv > jointThr && rkv > jointThr && rav > jointThr) {
      fv[1] = calculateAngle(rh, rk, ra);
    }
    // fv[2] Torso Lean
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      fv[2] = torsoLeanAngle(midPoint(lh, rh), midPoint(ls, rs));
    }
    // fv[3] Hip Depth
    if (lhv > jointThr && lkv > jointThr) {
      // 【v4.8】改用真實大腿長正規化（原本除以 |Δy| 等於只剩 ±1 的符號，
      //   量不到「蹲多深」）。⚠️ 必須與後端 _extract_squat 一致。
      const femur = Math.sqrt(
        (lh.x - lk.x) ** 2 + (lh.y - lk.y) ** 2 + ((lh.z ?? 0) - (lk.z ?? 0)) ** 2);
      if (femur > 1e-6) fv[3] = (lh.y - lk.y) / femur;
    }
    // fv[4] Knee Symmetry
    if (!isNaN(fv[0]) && !isNaN(fv[1])) {
      fv[4] = Math.abs(fv[0] - fv[1]);
    }
    // fv[5] Stability
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      const ms = midPoint(ls, rs), mh = midPoint(lh, rh);
      comHist.push((ms.x + mh.x) / 2);
      fv[5] = comHist.variance;
    }
    // fv[6] Knee Valgus
    if (lkv > jointThr && rkv > jointThr && lav > jointThr && rav > jointThr && lhv > jointThr && rhv > jointThr) {
      // 【v4.8】改成帶符號：正＝膝比踝窄＝內夾（危險）、負＝膝外推（正確）。
      //   舊版取絕對值會讓「外推」和「內夾」變成同一個數字。
      //   ⚠️ 必須與 backend _extract_squat 一致。
      const hipW = Math.abs(lh.x - rh.x) + 1e-6;
      const kneeD = Math.abs(lk.x - rk.x);
      const ankleD = Math.abs(la.x - ra.x);
      fv[6] = (ankleD - kneeD) / hipW;
    }

    return { features: fv, confidence: vc };
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. 硬舉 Deadlift
// ═══════════════════════════════════════════════════════════════════════════════

export function createDeadliftExtractor(fps = 30) {
  const comHist = new SlidingVariance(Math.max(1, Math.floor(fps / 2)));

  return function extract(wl, il, bodyThr = 0.45, jointThr = 0.35) {
    const fv = new Array(7).fill(NaN);
    const vc = new Array(8).fill(0);

    const ls = safeLm(wl, I.LS), rs = safeLm(wl, I.RS), lw = safeLm(wl, I.LW);
    const lh = safeLm(wl, I.LH), rh = safeLm(wl, I.RH);
    const lk = safeLm(wl, I.LK), rk = safeLm(wl, I.RK);
    const la = safeLm(wl, I.LA), ra = safeLm(wl, I.RA);

    const lsv = il[I.LS].visibility, rsv = il[I.RS].visibility;
    const lwv = il[I.LW].visibility;
    const lhv = il[I.LH].visibility, rhv = il[I.RH].visibility;
    const lkv = il[I.LK].visibility, rkv = il[I.RK].visibility;
    const lav = il[I.LA].visibility, rav = il[I.RA].visibility;
    vc.splice(0, 8, lsv, rsv, lhv, rhv, lkv, rkv, lav, rav);

    // fv[0] Hip Hinge (torso lean)
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      fv[0] = torsoLeanAngle(midPoint(lh, rh), midPoint(ls, rs));
    }
    // fv[1] L Knee
    if (lhv > jointThr && lkv > jointThr && lav > jointThr) {
      fv[1] = calculateAngle(lh, lk, la);
    }
    // fv[2] R Knee
    if (rhv > jointThr && rkv > jointThr && rav > jointThr) {
      fv[2] = calculateAngle(rh, rk, ra);
    }
    // fv[3] Back Flatness (shoulder deviation from hip-ankle line)
    if (lsv > jointThr && lhv > jointThr && lav > jointThr) {
      const hipV = [lh.x - la.x, lh.y - la.y, lh.z - la.z];
      const shV = [ls.x - la.x, ls.y - la.y, ls.z - la.z];
      const hipMag2 = hipV[0] ** 2 + hipV[1] ** 2 + hipV[2] ** 2 + 1e-6;
      const proj = (shV[0] * hipV[0] + shV[1] * hipV[1] + shV[2] * hipV[2]) / hipMag2;
      const cx = la.x + proj * hipV[0];
      const cy = la.y + proj * hipV[1];
      fv[3] = Math.sqrt((ls.x - cx) ** 2 + (ls.y - cy) ** 2);
    }
    // fv[4] Knee Symmetry
    if (!isNaN(fv[1]) && !isNaN(fv[2])) {
      fv[4] = Math.abs(fv[1] - fv[2]);
    }
    // fv[5] Stability
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      const ms = midPoint(ls, rs), mh = midPoint(lh, rh);
      comHist.push((ms.x + mh.x) / 2);
      fv[5] = comHist.variance;
    }
    // fv[6] Bar Path (wrist-shoulder distance)
    if (lwv > jointThr && lsv > jointThr) {
      fv[6] = Math.abs(lw.x - ls.x);
    }

    return { features: fv, confidence: vc };
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 4. 臥推 Bench Press
// ═══════════════════════════════════════════════════════════════════════════════

export function createBenchPressExtractor(fps = 30) {
  const wristYHist = new SlidingVariance(3);

  return function extract(wl, il, bodyThr = 0.45, jointThr = 0.35) {
    const fv = new Array(7).fill(NaN);
    const vc = new Array(8).fill(0);

    const ls = safeLm(wl, I.LS), le = safeLm(wl, I.LE), lw = safeLm(wl, I.LW);
    const rs = safeLm(wl, I.RS), re = safeLm(wl, I.RE), rw = safeLm(wl, I.RW);
    const lh = safeLm(wl, I.LH), rh = safeLm(wl, I.RH);

    const lsv = il[I.LS].visibility, rsv = il[I.RS].visibility;
    const lev = il[I.LE].visibility, rev = il[I.RE].visibility;
    const lwv = il[I.LW].visibility, rwv = il[I.RW].visibility;
    const lhv = il[I.LH].visibility, rhv = il[I.RH].visibility;
    vc.splice(0, 8, lsv, rsv, lev, rev, lwv, rwv, lhv, rhv);

    // fv[0] L Elbow
    if (lsv > jointThr && lev > jointThr && lwv > jointThr) {
      fv[0] = calculateAngle(ls, le, lw);
    }
    // fv[1] R Elbow
    if (rsv > jointThr && rev > jointThr && rwv > jointThr) {
      fv[1] = calculateAngle(rs, re, rw);
    }
    // fv[2] Elbow Flare (upper arm vs torso angle)
    if (lsv > bodyThr && rsv > bodyThr && lev > bodyThr && rev > bodyThr) {
      const ms = midPoint(ls, rs);
      const mh_actual = (lhv > bodyThr && rhv > bodyThr)
        ? midPoint(lh, rh)
        : midPoint(ls, rs); // fallback
      const mh = (lhv > bodyThr) ? { x: lh.x, y: lh.y, z: lh.z } : ls;
      const mhR = (rhv > bodyThr) ? { x: rh.x, y: rh.y, z: rh.z } : rs;
      const mhMid = midPoint(mh, mhR);
      // 【v4.8】改用肩線當參考軸（躺姿下肩→髖向量不可靠，量不到外展）。
      //   ⚠️ 必須與 backend _extract_bench_press 一致。
      const shR = [rs.x - ls.x, rs.y - ls.y, (rs.z ?? 0) - (ls.z ?? 0)];
      const shL = [-shR[0], -shR[1], -shR[2]];
      const uaL = [le.x - ls.x, le.y - ls.y, (le.z ?? 0) - (ls.z ?? 0)];
      const uaR = [re.x - rs.x, re.y - rs.y, (re.z ?? 0) - (rs.z ?? 0)];
      if (Math.hypot(...shR) > 1e-6) {
        fv[2] = 90 - (vectorAngleDeg(uaL, shL) + vectorAngleDeg(uaR, shR)) / 2;
      }
    }
    // fv[3] 【v4.8】Forearm Vertical — 前臂與地面的夾角（度），90° = 完全垂直
    //   舊版是 (le.y - lw.y) 位移量，量綱不可解讀且受下放深度影響。
    //   世界座標 y 軸即垂直軸 → asin(|dy| / |v|) 直接得到對地仰角。
    //   ⚠️ 必須與 backend/core/multi_exercise.py::_extract_bench_press 完全一致。
    if (lev > jointThr && lwv > jointThr && rev > jointThr && rwv > jointThr) {
      const groundAng = (w, e) => {
        const dx = e.x - w.x, dy = e.y - w.y, dz = (e.z ?? 0) - (w.z ?? 0);
        const n = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (n < 1e-6) return NaN;
        return (Math.asin(Math.min(1, Math.abs(dy) / n)) * 180) / Math.PI;
      };
      const aL = groundAng(lw, le), aR = groundAng(rw, re);
      if (!isNaN(aL) && !isNaN(aR)) fv[3] = (aL + aR) / 2;
    }
    // fv[4] Elbow Symmetry
    if (!isNaN(fv[0]) && !isNaN(fv[1])) {
      fv[4] = Math.abs(fv[0] - fv[1]);
    }
    // fv[5] Bar Path (wrist Y variance)
    if (lwv > jointThr && rwv > jointThr) {
      wristYHist.push((lw.y + rw.y) / 2);
      fv[5] = wristYHist.variance;
    }
    // fv[6] 【v4.8】Grip Width — 腕距 / 肩寬（無單位比值，不受身高與鏡頭距離影響）
    //   取代舊的 Body Line（肩髖高度差符號，權重僅 0.06、資訊量低）。
    //   ⚠️ 必須與 backend/core/multi_exercise.py::_extract_bench_press 完全一致。
    if (lsv > bodyThr && rsv > bodyThr && lwv > jointThr && rwv > jointThr) {
      const dist = (a, b) => Math.sqrt(
        (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z ?? 0) - (b.z ?? 0)) ** 2);
      const shW = dist(ls, rs);
      if (shW > 1e-6) fv[6] = dist(lw, rw) / shW;
    }

    return { features: fv, confidence: vc };
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 5. 肩推 Overhead Press
// ═══════════════════════════════════════════════════════════════════════════════

export function createOverheadPressExtractor(fps = 30) {
  const comHist = new SlidingVariance(Math.max(1, Math.floor(fps / 2)));

  return function extract(wl, il, bodyThr = 0.45, jointThr = 0.35) {
    const fv = new Array(7).fill(NaN);
    const vc = new Array(8).fill(0);

    const ls = safeLm(wl, I.LS), le = safeLm(wl, I.LE), lw = safeLm(wl, I.LW);
    const rs = safeLm(wl, I.RS), re = safeLm(wl, I.RE), rw = safeLm(wl, I.RW);
    const lh = safeLm(wl, I.LH), rh = safeLm(wl, I.RH);

    const lsv = il[I.LS].visibility, rsv = il[I.RS].visibility;
    const lev = il[I.LE].visibility, rev = il[I.RE].visibility;
    const lwv = il[I.LW].visibility, rwv = il[I.RW].visibility;
    const lhv = il[I.LH].visibility, rhv = il[I.RH].visibility;
    vc.splice(0, 8, lsv, rsv, lev, rev, lwv, rwv, lhv, rhv);

    // fv[0] L Elbow
    if (lsv > jointThr && lev > jointThr && lwv > jointThr) {
      fv[0] = calculateAngle(ls, le, lw);
    }
    // fv[1] R Elbow
    if (rsv > jointThr && rev > jointThr && rwv > jointThr) {
      fv[1] = calculateAngle(rs, re, rw);
    }
    // fv[2] Torso Lean
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      fv[2] = torsoLeanAngle(midPoint(lh, rh), midPoint(ls, rs));
    }
    // fv[3] L Overhead (shoulder-wrist height / torso length)
    if (lsv > jointThr && lwv > jointThr) {
      const torsoL = Math.abs(ls.y - (lhv > bodyThr ? lh.y : ls.y - 0.3)) + 1e-6;
      fv[3] = (ls.y - lw.y) / torsoL;
    }
    // fv[4] R Overhead
    if (rsv > jointThr && rwv > jointThr) {
      const torsoL2 = Math.abs(rs.y - (rhv > bodyThr ? rh.y : rs.y - 0.3)) + 1e-6;
      fv[4] = (rs.y - rw.y) / torsoL2;
    }
    // fv[5] Elbow Symmetry
    if (!isNaN(fv[0]) && !isNaN(fv[1])) {
      fv[5] = Math.abs(fv[0] - fv[1]);
    }
    // fv[6] Stability
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      const ms = midPoint(ls, rs), mh = midPoint(lh, rh);
      comHist.push((ms.x + mh.x) / 2);
      fv[6] = comHist.variance;
    }

    return { features: fv, confidence: vc };
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 6. 划船 Barbell Row
// ═══════════════════════════════════════════════════════════════════════════════

export function createBarbellRowExtractor(fps = 30) {
  const comHist = new SlidingVariance(Math.max(1, Math.floor(fps / 2)));
  const hipYHist = new SlidingVariance(Math.max(1, Math.floor(fps / 2)));

  return function extract(wl, il, bodyThr = 0.45, jointThr = 0.35) {
    const fv = new Array(7).fill(NaN);
    const vc = new Array(8).fill(0);

    const ls = safeLm(wl, I.LS), le = safeLm(wl, I.LE), lw = safeLm(wl, I.LW);
    const rs = safeLm(wl, I.RS), re = safeLm(wl, I.RE), rw = safeLm(wl, I.RW);
    const lh = safeLm(wl, I.LH), rh = safeLm(wl, I.RH);

    const lsv = il[I.LS].visibility, rsv = il[I.RS].visibility;
    const lev = il[I.LE].visibility, rev = il[I.RE].visibility;
    const lwv = il[I.LW].visibility, rwv = il[I.RW].visibility;
    const lhv = il[I.LH].visibility, rhv = il[I.RH].visibility;
    vc.splice(0, 8, lsv, rsv, lev, rev, lwv, rwv, lhv, rhv);

    // fv[0] L Elbow
    if (lsv > jointThr && lev > jointThr && lwv > jointThr) {
      fv[0] = calculateAngle(ls, le, lw);
    }
    // fv[1] R Elbow
    if (rsv > jointThr && rev > jointThr && rwv > jointThr) {
      fv[1] = calculateAngle(rs, re, rw);
    }
    // fv[2] Torso Hinge
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      fv[2] = torsoLeanAngle(midPoint(lh, rh), midPoint(ls, rs));
    }
    // fv[3] Hip Stability (hip Y variance)
    if (lhv > bodyThr && rhv > bodyThr) {
      hipYHist.push((lh.y + rh.y) / 2);
      fv[3] = hipYHist.variance;
    }
    // fv[4] Elbow Symmetry
    if (!isNaN(fv[0]) && !isNaN(fv[1])) {
      fv[4] = Math.abs(fv[0] - fv[1]);
    }
    // fv[5] Shrug (shoulder Y / torso length)
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      const ms = midPoint(ls, rs), mh = midPoint(lh, rh);
      const tl = vecNorm(ms, mh);
      fv[5] = tl > 0.1 ? ms.y / tl : NaN;
    }
    // fv[6] Stability (COM X variance)
    if (lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr) {
      const ms = midPoint(ls, rs), mh = midPoint(lh, rh);
      comHist.push((ms.x + mh.x) / 2);
      fv[6] = comHist.variance;
    }

    return { features: fv, confidence: vc };
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Factory: 根據 exerciseKey 建立對應的 extractor
// ═══════════════════════════════════════════════════════════════════════════════

const EXTRACTOR_MAP = {
  lat_pulldown: createLatPulldownExtractor,
  squat: createSquatExtractor,
  deadlift: createDeadliftExtractor,
  bench_press: createBenchPressExtractor,
  overhead_press: createOverheadPressExtractor,
  barbell_row: createBarbellRowExtractor,
};

/**
 * 建立指定動作的特徵擷取器
 * @param {string} exerciseKey - 動作 key (e.g. 'lat_pulldown')
 * @param {number} fps - 前端鏡頭 FPS
 * @returns {Function} extract(worldLandmarks, imageLandmarks) => { features, confidence }
 */
export function createExtractor(exerciseKey, fps = 30) {
  const factory = EXTRACTOR_MAP[exerciseKey];
  if (!factory) {
    throw new Error(`Unknown exercise: ${exerciseKey}. Available: ${Object.keys(EXTRACTOR_MAP).join(', ')}`);
  }
  return factory(fps);
}

/**
 * 重置所有內部狀態（切換動作時使用）
 */
export function resetExtractor(extractorFn) {
  // Extractors are closures — create a new one to reset state
  return extractorFn;
}

export const SUPPORTED_EXERCISES = Object.keys(EXTRACTOR_MAP);
