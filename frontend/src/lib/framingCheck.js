/**
 * framingCheck.js — 前端即時架機位驗收（與後端 framing_guide.py 同一套規則）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼需要即時驗收
 * ──────────────────
 * 2026-08-03 的實測（6 支影片、雙機同步）證明：
 *
 *   跨機位   相機方位差 69°  →  骨長差 18.7%、關節角差 24.5°   ❌ 不可比
 *   同機位   相機方位差 4.2° →  骨長差  6.8%、關節角差  4.0°   ✅ 可比
 *
 * 也就是說：**使用者自然架設的重複性其實夠好，真正會出事的是「換到完全
 * 不同的機位」。** 所以引導的目標不是「精準到 1 度」，而是
 *   ① 第一次架對（落在該檢查項驗證過的機位）
 *   ② 之後每次都回到同一個位置
 *
 * ⚠️ 全部只吃 2D 正規化座標與 visibility；world 座標的 z 是單目推估，
 *    實測雜訊是 x/y 的 4.3 倍（肩部達 10 倍），不適合當即時判準。
 */

// MediaPipe Pose landmark 索引
export const LM = {
  NOSE: 0, L_SH: 11, R_SH: 12, L_EL: 13, R_EL: 14, L_WR: 15, R_WR: 16,
  L_HIP: 23, R_HIP: 24, L_KNE: 25, R_KNE: 26, L_ANK: 27, R_ANK: 28,
};

const vis = (f, i) => (f?.[i]?.visibility ?? f?.[i]?.[3] ?? 1);
const px = (f, i) => (f?.[i]?.x ?? f?.[i]?.[0] ?? NaN);
const py = (f, i) => (f?.[i]?.y ?? f?.[i]?.[1] ?? NaN);

const minVis = (f, idxs) => Math.min(...idxs.map(i => vis(f, i)));
const inFrame = (f, idxs, m = 0.02) => {
  const ok = idxs.filter(i => {
    const x = px(f, i), y = py(f, i);
    return x >= m && x <= 1 - m && y >= m && y <= 1 - m;
  });
  return ok.length / Math.max(idxs.length, 1);
};

/** 單一檢查項 */
const chk = (key, label, pass, measured, want, hint, blocking = true) => ({
  key, label, pass: !!pass,
  measured: measured == null ? null : Math.round(measured * 1000) / 1000,
  want, hint: pass ? null : hint, blocking,
});

/**
 * 深蹲 · 正面 0°
 * 這是唯一通過效度驗證能抓到膝蓋內夾的機位（效果量 2.9 SD）。
 */
function squatFront(f) {
  const out = [];
  // ① 正對鏡頭【實測門檻】正面 0.99–1.00 ／ 正側面 0.26–0.35，中間空 0.64
  const lv = minVis(f, [LM.L_SH, LM.L_HIP, LM.L_KNE, LM.L_ANK]);
  const rv = minVis(f, [LM.R_SH, LM.R_HIP, LM.R_KNE, LM.R_ANK]);
  const ratio = Math.max(lv, rv) > 1e-6 ? Math.min(lv, rv) / Math.max(lv, rv) : 0;
  out.push(chk('facing', '身體正對鏡頭', ratio >= 0.85, ratio, '≥ 0.85',
    '身體再轉正一點，讓鏡頭同時看到左右兩邊'));

  // ② 全身入鏡（含腳踝）—— Knee Valgus 就是靠膝與踝的水平距離算的
  const joints = [LM.L_SH, LM.R_SH, LM.L_HIP, LM.R_HIP, LM.L_KNE, LM.R_KNE, LM.L_ANK, LM.R_ANK];
  const fr = inFrame(f, joints);
  out.push(chk('in_frame', '全身入鏡（含腳踝）', fr >= 0.999, fr, '= 100%',
    '往後退一點，腳踝也要在畫面裡'));

  // ③ 距離：肩到踝佔畫面高度的比例
  const sy = (py(f, LM.L_SH) + py(f, LM.R_SH)) / 2;
  const ay = (py(f, LM.L_ANK) + py(f, LM.R_ANK)) / 2;
  const span = Math.abs(ay - sy);
  out.push(chk('distance', '距離適中', span >= 0.35 && span <= 0.80, span, '35% – 80%',
    span > 0.80 ? '太近了，退到 2.5–3 公尺' : '太遠了，靠近一點'));

  // ④ 鏡頭高度：俯拍會讓 Knee Valgus 的水平比值被透視扭曲
  const hy = (py(f, LM.L_HIP) + py(f, LM.R_HIP)) / 2;
  out.push(chk('height', '鏡頭接近腰部高度', hy >= 0.30 && hy <= 0.70, hy, '30% – 70%',
    hy < 0.30 ? '手機放低一點，大概到腰的高度' : '手機抬高一點'));

  // ⑤ 膝踝清楚
  const kv = minVis(f, [LM.L_KNE, LM.R_KNE, LM.L_ANK, LM.R_ANK]);
  out.push(chk('knee_ankle', '膝蓋與腳踝清楚', kv >= 0.60, kv, '≥ 0.60',
    '膝蓋或腳踝被擋住了，把褲管拉高或換個背景'));
  return out;
}

/**
 * 臥推 · 正上方俯視
 * 唯一通過效度驗證能抓到肘外展的機位（效果量 2.7 SD）。
 * 正上方之所以穩：推的方向沿垂直軸，肩線與上臂都落在影像平面上，
 * 幾乎不依賴 z（單目推估最不可靠的那一維）。
 */
function benchOverhead(f) {
  const out = [];
  // ① 兩側手臂都看得到【實測門檻】俯視 0.94–1.00 ／ 正側面 0.17–0.52
  const lv = minVis(f, [LM.L_SH, LM.L_EL, LM.L_WR]);
  const rv = minVis(f, [LM.R_SH, LM.R_EL, LM.R_WR]);
  const ratio = Math.max(lv, rv) > 1e-6 ? Math.min(lv, rv) / Math.max(lv, rv) : 0;
  out.push(chk('both_arms', '兩隻手臂都看得到', ratio >= 0.80, ratio, '≥ 0.80',
    '鏡頭要在正上方，不要偏到一側'));

  // ② 頭到髖入鏡
  const joints = [LM.NOSE, LM.L_SH, LM.R_SH, LM.L_EL, LM.R_EL, LM.L_WR, LM.R_WR, LM.L_HIP, LM.R_HIP];
  const fr = inFrame(f, joints);
  out.push(chk('in_frame', '頭到髖都在畫面內', fr >= 0.999, fr, '= 100%',
    '鏡頭往上移一點，頭跟髖都要入鏡'));

  // ③ 肩肘清楚 —— Elbow Flare 就是靠肩線與上臂算的
  const ev = minVis(f, [LM.L_SH, LM.R_SH, LM.L_EL, LM.R_EL]);
  out.push(chk('elbows', '肩膀與手肘清楚', ev >= 0.60, ev, '≥ 0.60',
    '手肘被擋住了，確認槓片或架子沒有遮到'));

  // ④ 真的在正上方：俯視時肩寬與髖寬都以接近真實的比例呈現。
  //    斜拍會讓近端放大、遠端縮小，比值偏離。門檻寬鬆，只擋明顯歪斜。
  const sw = Math.abs(px(f, LM.L_SH) - px(f, LM.R_SH));
  const hw = Math.abs(px(f, LM.L_HIP) - px(f, LM.R_HIP));
  const r = hw > 1e-6 ? sw / hw : 0;
  out.push(chk('overhead', '鏡頭在正上方', r >= 0.85 && r <= 2.20, r, '0.85 – 2.20',
    '鏡頭要正對天花板往下拍，不要斜著拍', false));
  return out;
}

const CHECKS = {
  'squat|frontal_0': squatFront,
  'bench_press|overhead': benchOverhead,
};

/**
 * 單幀驗收。
 * @returns {{ready, supported, checks, blockingLeft}}
 *   ready 只看 blocking=true 的項目；標 blocking=false 的門檻尚未由實測定錨，
 *   照樣回報數值但不擋人 —— 用還沒定錨的門檻擋使用者是不誠實的。
 */
export function checkFrame(frame, exerciseKey, viewCode) {
  const fn = CHECKS[`${exerciseKey}|${viewCode}`];
  if (!fn) return { ready: true, supported: false, checks: [], blockingLeft: 0 };
  if (!frame || frame.length < 29) {
    return { ready: false, supported: true, checks: [], blockingLeft: 1, noPose: true };
  }
  let checks = [];
  try { checks = fn(frame); } catch { return { ready: false, supported: true, checks: [], blockingLeft: 1 }; }
  const blocking = checks.filter(c => c.blocking);
  const left = blocking.filter(c => !c.pass).length;
  return { ready: left === 0, supported: true, checks, blockingLeft: left };
}

/**
 * 動態驗收：要求先做一次完整動作。
 *
 * 為什麼靜態不夠：實測最常見的取景失敗是「站直時全身都在畫面裡，
 * 蹲到最低點時髖部掉出下緣」。平均取景率算出來 95% 很漂亮，
 * 但被裁掉的那幾幀正好是唯一有資訊的地方。
 */
export function checkFullROM(frames, exerciseKey) {
  if (!frames || frames.length < 5) {
    return { ok: false, reason: '影格太少，請完整做一次動作' };
  }
  const isSquat = exerciseKey === 'squat';
  const watch = isSquat
    ? [LM.L_SH, LM.R_SH, LM.L_HIP, LM.R_HIP, LM.L_KNE, LM.R_KNE, LM.L_ANK, LM.R_ANK]
    : [LM.NOSE, LM.L_SH, LM.R_SH, LM.L_EL, LM.R_EL, LM.L_WR, LM.R_WR, LM.L_HIP, LM.R_HIP];
  const track = frames.map(f => isSquat
    ? (py(f, LM.L_HIP) + py(f, LM.R_HIP)) / 2
    : (py(f, LM.L_WR) + py(f, LM.R_WR)) / 2);
  const fin = track.filter(Number.isFinite);
  const rom = fin.length ? Math.max(...fin) - Math.min(...fin) : 0;
  const zh = isSquat ? '蹲到最低點' : '推到最高點';
  if (rom < 0.05) return { ok: false, reason: `沒偵測到完整動作，請${zh}再回來`, rom };

  const NAME = {
    [LM.L_SH]: '左肩', [LM.R_SH]: '右肩', [LM.L_HIP]: '左髖', [LM.R_HIP]: '右髖',
    [LM.L_KNE]: '左膝', [LM.R_KNE]: '右膝', [LM.L_ANK]: '左踝', [LM.R_ANK]: '右踝',
    [LM.L_EL]: '左肘', [LM.R_EL]: '右肘', [LM.L_WR]: '左腕', [LM.R_WR]: '右腕', [LM.NOSE]: '頭',
  };
  let worst = 1, worstIdx = -1;
  frames.forEach((f, i) => { const r = inFrame(f, watch); if (r < worst) { worst = r; worstIdx = i; } });
  if (worst < 0.999) {
    const bad = watch.filter(j => {
      const x = px(frames[worstIdx], j), y = py(frames[worstIdx], j);
      return !(x >= 0.02 && x <= 0.98 && y >= 0.02 && y <= 0.98);
    }).map(j => NAME[j] || j).slice(0, 3);
    return {
      ok: false, rom, worstIdx,
      reason: `${zh}時「${bad.join('、')}」跑出畫面了 —— 這幾幀正是最關鍵的資料，請退後或調整鏡頭`,
    };
  }
  return { ok: true, rom, reason: '取景通過，全程都在畫面內' };
}

/**
 * 從骨架反推相機相對身體的方位。用於「機位記憶與復位」。
 *
 * 實測（4 支自選機位、無腳架、含跨場次）：方位角全距僅 4.2°
 *   —— 使用者「隨便架」其實相當一致，所以復位引導是可行的。
 * 對照：真正的不同機位（雙機同步）方位差 69°。
 *
 * @param frame world 座標 (33×3)。⚠️ 這裡必須用 world，2D 算不出方位。
 */
export function cameraPose(worldFrame) {
  if (!worldFrame || worldFrame.length < 25) return null;
  const g = i => {
    const p = worldFrame[i];
    return [p?.x ?? p?.[0], p?.y ?? p?.[1], p?.z ?? p?.[2]];
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  const ls = g(LM.L_SH), rs = g(LM.R_SH), lh = g(LM.L_HIP), rh = g(LM.R_HIP);
  if ([ls, rs, lh, rh].some(p => p.some(v => !Number.isFinite(v)))) return null;
  const xb = unit(sub(rs, ls));                                  // 身體左右軸
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  let yb = sub(mid(lh, rh), mid(ls, rs));                        // 身體長軸
  const p = dot(yb, xb);
  yb = unit([yb[0] - p * xb[0], yb[1] - p * xb[1], yb[2] - p * xb[2]]);
  const zb = cross(xb, yb);                                      // 身體前後軸
  const cam = [0, 0, 1];                                         // world 的 z 就是相機光軸
  return {
    azimuth: Math.atan2(dot(xb, cam), dot(zb, cam)) * 180 / Math.PI,
    elevation: Math.asin(Math.max(-1, Math.min(1, dot(yb, cam)))) * 180 / Math.PI,
  };
}

/** 機位復位：目前方位與記憶方位差多少 */
export const REPOSITION_TOL = 15;   // 度。實測自然重複性 4.2°，15° 已相當寬鬆

export function repositionHint(now, saved) {
  if (!now || !saved) return null;
  const dAz = ((now.azimuth - saved.azimuth + 540) % 360) - 180;
  const dEl = now.elevation - saved.elevation;
  const off = Math.hypot(dAz, dEl);
  if (off <= REPOSITION_TOL) return { ok: true, off, hint: '位置對了' };
  const parts = [];
  if (Math.abs(dAz) > 8) parts.push(dAz > 0 ? '往左繞一點' : '往右繞一點');
  if (Math.abs(dEl) > 8) parts.push(dEl > 0 ? '手機放低一點' : '手機抬高一點');
  return { ok: false, off, hint: parts.join('、') || '再調整一下角度' };
}
