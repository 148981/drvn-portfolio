/**
 * CameraAngleFinder — 拍之前先把角度找對
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼擋在錄影之前
 * ────────────────
 *   實測（46 支）：同一個人、同一個動作，只換相機角度 ——
 *     離已驗證機位  2.7° → 刻意膝內夾掉 56.8 分  ✅
 *     離已驗證機位 31.7° → 只掉 17.4 分          ❌ 跌破 20 分門檻
 *     離已驗證機位 63.0° → 連標準動作都只剩 22 分 ❌ 整個量測失效
 *   角度不是拍攝建議，是能不能用的前提。事後才發現不對，使用者已經練完了。
 *
 * 三步，每步只做一件事
 * ──────────────────
 *   ① 定位 站在訓練位置，鏡頭朝向身體正面 → 設為基準
 *   ② 對角度 帶著手機沿圓弧走，到位震動 + 打勾
 *   ③ 驗收 手機架好、人走進畫面，用骨架反推真值
 *
 * 設計：瑞士編輯式極簡（Mist 冷灰底）
 * ──────────────────────────────
 *   · 底色固定 Mist #E8E9E6 —— 冷灰是遞後的地，Paper 卡片浮在上面
 *   · 全部左對齊到同一條基線；大而輕的度數 vs 極小的 tracked-caps 標籤
 *   · 按鈕一律平面：實色填滿，無漸層、無陰影、無光暈
 *   · 分隔用 1px Pebble 細線，不用框
 *   · 一頁一個焦點，解釋全部收折
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronDown, Check, RotateCw,
  ArrowLeft, ArrowRight,
} from 'lucide-react';
import {
  relativeAzimuth, azimuthVerdict, flatVerdict, skeletonVerdict,
  subscribeOrientation, requestOrientationPermission, hasOrientationSensor,
  makeAngleSmoother, POSE_TOLERANCE_DEG,
} from '../lib/cameraAngle';
import { specFor, angleTargetFor, rigFor, RIG } from '../lib/exerciseSpec';
import { cameraPose } from '../lib/framingCheck';
import { hapticTap, hapticSuccess, hapticSelectionChanged, hapticCelebrate } from '../utils/haptics';

/* Mist 冷灰為地、Paper 暖白為紙、一個 Coral 焦點 */
const C = {
  mist: '#E8E9E6',
  paper: '#F6F4F1',
  ink: '#161415',
  sub: 'rgba(22,20,21,0.62)',
  faint: 'rgba(22,20,21,0.40)',
  ghost: 'rgba(22,20,21,0.22)',
  rule: '#CFC6B8',
  coral: '#F95C4B',
  olive: '#5A7A3A',
  bronze: '#A8722F',
};
const EASE = [0.16, 1, 0.3, 1];
const TONE = { perfect: C.olive, ok: C.olive, near: C.bronze, far: C.coral };

/* ── 角度盤：俯視圖。中心是人，淺色扇形是可用範圍，指針是相機 ─────── */
function AngleDial({ azimuth, target = 0, state, tol = POSE_TOLERANCE_DEG, size = 208 }) {
  const R = size / 2;
  const ring = R - 14;
  const live = Number.isFinite(azimuth);
  const pt = (deg, r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [R + Math.cos(a) * r, R + Math.sin(a) * r];
  };
  const wedge = (from, to, r) => {
    const [x1, y1] = pt(from, r);
    const [x2, y2] = pt(to, r);
    return `M ${R} ${R} L ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
  };
  const [nx, ny] = live ? pt(azimuth, ring) : [R, R];
  const col = TONE[state] || C.coral;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {/* 【v9.3】綠色扇形要跟著目標角度轉 —— 寫死 0° 的話，
          正側面（目標 90°）對準時指針會落在扇形外，畫面自打嘴巴 */}
      <path d={wedge(target - tol, target + tol, ring)} fill={C.olive} opacity={0.11} />
      <path d={wedge(target - 12, target + 12, ring)} fill={C.olive} opacity={0.14} />
      <circle cx={R} cy={R} r={ring} fill="none" stroke={C.rule} strokeWidth="1" />
      <circle cx={R} cy={R} r={ring * 0.6} fill="none" stroke={C.rule} strokeWidth="1" opacity={0.45} />
      {/* 正前方的硬線 —— 圓裡的方，張力來源 */}
      {(() => {
        const [tx1, ty1] = pt(target, ring);
        const [tx2, ty2] = pt(target, ring - 15);
        return <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={C.olive} strokeWidth="1.6" />;
      })()}
      <circle cx={R} cy={R} r={5} fill={C.ink} />
      <line x1={R} y1={R} x2={R} y2={R - 13} stroke={C.ink} strokeWidth="1.6" />
      {live && (
        <>
          <line x1={R} y1={R} x2={nx} y2={ny} stroke={col} strokeWidth="2" strokeLinecap="round" />
          <circle cx={nx} cy={ny} r={15} fill={col} opacity={0.16} />
          <circle cx={nx} cy={ny} r={9} fill={col} />
        </>
      )}
    </svg>
  );
}

/* ── 相機取景器：點一下標訓練位置，並在畫面上直接顯示角度與水平 ──────
   為什麼要用相機：純數字/轉盤看不出「該往哪走」。羅盤方位角在
   「原地轉手機」與「真的走到側面」兩種情況都會變，使用者常常原地轉一圈
   就以為對好了，實際站位根本沒動。先讓他在畫面上「點住那個人的位置」，
   再把角度、水平、該往哪走全部疊在實景上，就不會走錯。 */
function CameraViewfinder({ anchor, onAnchor, angleText, angleState, tilt, hint, arrow }) {
    const videoRef = React.useRef(null);
    const wrapRef = React.useRef(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let stream = null, dead = false;
        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
                    audio: false,
                });
                if (dead) { stream.getTracks().forEach(t => t.stop()); return; }
                if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
            } catch (e) { setErr(e?.name || 'error'); }
        })();
        return () => { dead = true; if (stream) stream.getTracks().forEach(t => t.stop()); };
    }, []);

    const tap = (e) => {
        const el = wrapRef.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        onAnchor({ x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height });
    };

    const level = Number.isFinite(tilt) ? Math.min(Math.abs(tilt), 30) : 0;
    const isLevel = Number.isFinite(tilt) && Math.abs(tilt) <= 6;
    const col = angleState === 'ok' ? '#2E7D4F' : angleState === 'near' ? '#C98A2B' : '#C0392B';

    return (
        <div ref={wrapRef} onClick={tap}
            style={{ position: 'relative', width: '100%', aspectRatio: '3/4', borderRadius: 18,
                overflow: 'hidden', background: '#000', cursor: 'crosshair', marginTop: 14 }}>
            <video ref={videoRef} playsInline muted autoPlay
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {err && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#fff', fontSize: 13, padding: 20, textAlign: 'center' }}>
                    {err === 'NotAllowedError' || err === 'SecurityError'
                        ? '相機權限被拒絕。請到 iPhone「設定 → DRVN → 相機」開啟；仍可用下方數字對角度。'
                        : '無法開啟相機。仍可用下方數字對角度。'}
                </div>
            )}

            {/* 水平參考線：手機夠水平才變綠，避免俯拍 */}
            <div style={{ position: 'absolute', left: '8%', right: '8%', top: '50%',
                height: 2, background: isLevel ? '#2E7D4F' : 'rgba(255,255,255,0.55)',
                transform: `translateY(-50%) rotate(${Number.isFinite(tilt) ? Math.max(-14, Math.min(14, tilt)) : 0}deg)`,
                transition: 'background .2s' }} />

            {/* 訓練位置錨點 */}
            {anchor && (
                <div style={{ position: 'absolute', left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%`,
                    transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
                    <div style={{ width: 54, height: 54, borderRadius: '50%', border: '3px solid #F95C4B',
                        boxShadow: '0 0 0 2px rgba(0,0,0,0.35)' }} />
                    <div style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: 8,
                        marginLeft: -4, marginTop: -4, borderRadius: '50%', background: '#F95C4B' }} />
                    <div style={{ position: 'absolute', top: 58, left: '50%', transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, color: '#fff',
                        background: 'rgba(0,0,0,0.55)', padding: '2px 7px', borderRadius: 6 }}>訓練位置</div>
                </div>
            )}
            {!anchor && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, textAlign: 'center',
                        background: 'rgba(0,0,0,0.5)', padding: '10px 16px', borderRadius: 12, lineHeight: 1.5 }}>
                        點一下畫面中<br />你要訓練的位置
                    </div>
                </div>
            )}

            {/* 角度 HUD */}
            <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex',
                alignItems: 'flex-start', gap: 8, pointerEvents: 'none' }}>
                <div style={{ background: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: '8px 12px',
                    borderLeft: `4px solid ${col}` }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.7)' }}>目前角度</div>
                    <div style={{ fontSize: 30, fontWeight: 300, color: '#fff', lineHeight: 1.05,
                        fontVariantNumeric: 'tabular-nums' }}>{angleText}</div>
                </div>
                <div style={{ marginLeft: 'auto', background: 'rgba(0,0,0,0.6)', borderRadius: 12,
                    padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.7)' }}>手機水平</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: isLevel ? '#7BC49A' : '#F0B84A' }}>
                        {isLevel ? '已水平' : `偏 ${Math.round(level)}°`}
                    </div>
                </div>
            </div>

            {/* 該往哪走 */}
            {arrow && (
                <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.62)', borderRadius: 999, padding: '9px 18px',
                    color: '#fff', fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                    {arrow}
                </div>
            )}
            {hint && !arrow && (
                <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12,
                    background: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: '8px 12px',
                    color: '#fff', fontSize: 12, lineHeight: 1.5, pointerEvents: 'none' }}>{hint}</div>
            )}
        </div>
    );
}

/* ── 水平儀：氣泡回到中心就是水平 ───────────────────────────── */
function LevelDial({ tilt, state, size = 208 }) {
  const R = size / 2;
  const col = TONE[state] || C.coral;
  const t = Number.isFinite(tilt) ? Math.min(tilt, 60) : 0;
  const r = (t / 60) * (R - 30);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={R} cy={R} r={R - 14} fill="none" stroke={C.rule} strokeWidth="1" />
      <circle cx={R} cy={R} r={(18 / 60) * (R - 30)} fill={C.olive} opacity={0.11} />
      <circle cx={R} cy={R} r={(18 / 60) * (R - 30)} fill="none" stroke={C.olive} strokeWidth="1.4" opacity={0.55} />
      <line x1={R - 12} y1={R} x2={R + 12} y2={R} stroke={C.ghost} strokeWidth="1" />
      <line x1={R} y1={R - 12} x2={R} y2={R + 12} stroke={C.ghost} strokeWidth="1" />
      <circle cx={R + r} cy={R} r={16} fill={col} opacity={0.16} />
      <circle cx={R + r} cy={R} r={11} fill={col} />
    </svg>
  );
}

/* ── 收折說明 —— 一條 hairline，不是框 ───────────────────────── */
function Disclosure({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${C.rule}`, marginTop: 22 }}>
      <motion.button {...pressProps('row')}
 onClick={() => { hapticTap(); setOpen(v => !v); }}
 style={{
 width: '100%', display: 'flex', alignItems: 'center', gap: 8,
 padding: '15px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
 }}>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: C.sub }}>{title}</span>
        <ChevronDown size={15} color={C.faint} strokeWidth={2}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .22s' }} />
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }}
            style={{ overflow: 'hidden' }}>
            <div style={{ paddingBottom: 18, ...body, fontSize: 13, maxWidth: '34ch' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function CameraAngleFinder({
  exerciseKey,
  viewCode,          // 【v9.3】要對哪個機位的角度（不給就用主機位）
  exerciseName,
  purpose = 'analyze',
  getWorldFrame,
  onReady,
  onSkip,
  onCancel,
}) {
  const spec = useMemo(() => specFor(exerciseKey, viewCode), [exerciseKey, viewCode]);
  const target = useMemo(() => angleTargetFor(exerciseKey, viewCode), [exerciseKey, viewCode]);
  const rig = useMemo(() => rigFor(exerciseKey, viewCode), [exerciseKey, viewCode]);
  const overhead = spec?.rig === RIG.OVERHEAD;

  const [stage, setStage] = useState('anchor');
  const [perm, setPerm] = useState(hasOrientationSensor() ? 'idle' : 'unsupported');
  const [heading, setHeading] = useState(NaN);
  const [tilt, setTilt] = useState(NaN);
  const [absolute, setAbsolute] = useState(true);
  const [base, setBase] = useState(null);
  const [locked, setLocked] = useState(false);
  const [skel, setSkel] = useState(null);
  const [anchorPt, setAnchorPt] = useState(null);   // 相機取景器上標的訓練位置

  const smooth = useRef(makeAngleSmoother(0.16));
  const holdRef = useRef(0);
  const tickRef = useRef(0);
  const lastState = useRef(null);

  useEffect(() => {
    if (perm !== 'granted') return undefined;
    return subscribeOrientation(({ heading: h, tilt: t, absolute: abs }) => {
      if (Number.isFinite(h)) setHeading(smooth.current(h));
      if (Number.isFinite(t)) setTilt(t);
      setAbsolute(abs);
    });
  }, [perm]);

  const ask = useCallback(async () => {
    hapticTap();
    setPerm(await requestOrientationPermission());
  }, []);

  const relAz = base == null ? NaN : relativeAzimuth(heading, base);
  const verdict = overhead ? flatVerdict(tilt) : azimuthVerdict(relAz, target?.targetAzimuth ?? 0);

  const stateRef = useRef(verdict.state);
  useEffect(() => { stateRef.current = verdict.state; }, [verdict.state]);

  useEffect(() => {
    if (stage !== 'find') { holdRef.current = 0; tickRef.current = 0; return undefined; }
    const id = setInterval(() => {
      const s = stateRef.current;
      const good = s === 'perfect' || s === 'ok';
      if (s !== lastState.current) {
        if (good && (lastState.current === 'near' || lastState.current === 'far')) hapticSuccess();
        lastState.current = s;
      }
      tickRef.current += 1;
      if ((s === 'near' || s === 'ok') && tickRef.current % 3 === 0) hapticSelectionChanged();
      holdRef.current = good ? holdRef.current + 1 : 0;
      setLocked(prev => {
        if (holdRef.current >= 5 && !prev) { hapticCelebrate(); return true; }
        if (!good && prev) return false;
        return prev;
      });
    }, 200);
    return () => clearInterval(id);
  }, [stage]);

  // 骨架驗收：每幀都 setState 會讓這頁一秒重繪 60 次。
  //   只在「整數度數變了」或「狀態變了」時才更新。
  useEffect(() => {
    if (stage !== 'verify' || !getWorldFrame) return undefined;
    let raf, lastKey = null;
    const tick = () => {
      const wf = getWorldFrame();
      const p = wf ? cameraPose(wf) : null;
      const v = p ? skeletonVerdict(p, target) : null;
      const key = v ? `${Math.round(v.off)}|${v.state}` : 'none';
      if (key !== lastKey) { lastKey = key; setSkel(v); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, getWorldFrame, target]);

  /* 沒驗證過的動作 —— 不假裝能引導 */
  if (!spec?.validatedView || !target) {
    return (
      <Shell onCancel={onCancel} title="拍攝角度" step={null}>
        <p style={kicker}>未驗證機位</p>
        <h2 style={{ ...display, fontSize: 30, marginTop: 12 }}>
          {exerciseName || spec?.name || exerciseKey}<br />還沒有驗證過的角度
        </h2>
        <p style={{ ...body, marginTop: 18, maxWidth: '30ch' }}>
          {spec?.reason || '這個動作沒有做過角度效度實驗。'}
        </p>
        <BtnFlat kind="quiet" onClick={() => { hapticTap(); onSkip?.({ verified: false }); }} style={{ marginTop: 28 }}>
          仍要拍（報告會標明未驗證）
        </BtnFlat>
      </Shell>
    );
  }

  const stepNo = stage === 'anchor' ? 1 : stage === 'find' ? 2 : 3;
  const col = TONE[verdict.state] || C.coral;

  return (
    <Shell
      onCancel={onCancel}
      title={`${spec.name} · ${spec.viewName}`}
      step={overhead ? `${stepNo}／3` : `${stepNo}／3`}>
      <AnimatePresence mode="wait">

        {/* ═══ ① 定位 ═══ */}
        {stage === 'anchor' && (
          <motion.div key="anchor" {...fade}>
            <p style={kicker}>Step 1 — {overhead ? '架法' : '定位'}</p>
            <h2 style={{ ...display, fontSize: 33, marginTop: 12 }}>
              {overhead
                ? <>手機放平<br />鏡頭朝正下方</>
                : <>站到訓練位置<br />鏡頭朝向正前方</>}
            </h2>

            <div style={rule} />
            <p style={{ ...body, maxWidth: '30ch' }}>{rig.hold}</p>

            {/* 相機取景器：先點出訓練位置，並在實景上看到角度與水平 */}
            <CameraViewfinder
              anchor={anchorPt}
              onAnchor={(p) => { hapticTap(); setAnchorPt(p); }}
              angleText={Number.isFinite(heading) ? `${Math.round(heading)}°` : '—'}
              angleState={anchorPt ? 'ok' : 'off'}
              tilt={tilt}
              hint={anchorPt
                ? '位置已標記。保持手機水平、鏡頭朝向這個點，按下方按鈕設為正面。'
                : null}
            />

            {perm === 'granted' ? (
              <>
                {!overhead && (
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 12,
                    marginTop: 26, paddingBottom: 12, borderBottom: `1px solid ${C.rule}`,
                  }}>
                    <span style={{ ...kicker, color: C.faint }}>目前朝向</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 40, fontWeight: 300, color: C.ink,
                      letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    }}>{Number.isFinite(heading) ? Math.round(heading) : '—'}<span style={{ fontSize: 17 }}>°</span></span>
                  </div>
                )}
                {!overhead && !absolute && <Note>這台裝置只給相對角度，數字可能不準。第 3 步的骨架驗收才是真值。</Note>}
                <BtnFlat
                  onClick={() => {
                    if (!overhead && !Number.isFinite(heading)) return;
                    if (!overhead && !anchorPt) return;
                    hapticSuccess();
                    if (!overhead) setBase(heading);
                    lastState.current = null;
                    setStage('find');
                  }}
                  disabled={(!overhead && !Number.isFinite(heading)) || (!overhead && !anchorPt)}
                  style={{ marginTop: 24 }}>
                  {overhead ? '開始對水平' : (anchorPt ? '設為我的正面' : '先點一下訓練位置')}
                </BtnFlat>
              </>
            ) : (
              <>
                <BtnFlat onClick={ask} style={{ marginTop: 26 }}>開啟方位感測</BtnFlat>
                {perm === 'denied' && <Note>動作與方向權限被拒。請完全關閉 App 再開一次並選「允許」，或按「跳過，我自己架」直接錄影。</Note>}
                {perm === 'unsupported' && <Note>這台裝置沒有方位感測器，無法做角度引導。</Note>}
              </>
            )}

            <Disclosure title={`為什麼是${spec.viewName}`}>
              {spec.evidence}
              <div style={{ height: 1, background: C.rule, margin: '12px 0' }} />
              {spec.catches?.length > 0
                ? <>抓得到：<b style={{ color: C.ink, fontWeight: 500 }}>{spec.catches.join('、')}</b>。</>
                : <>量得到：<b style={{ color: C.ink, fontWeight: 500 }}>{(spec.metrics || []).join('、')}</b>。</>}
              {spec.blind?.length > 0 && <>{' '}這個角度量不到：{spec.blind.join('、')}。</>}
            </Disclosure>
            <BtnText onClick={() => { hapticTap(); onSkip?.({ verified: false }); }}>跳過，我自己架</BtnText>
          </motion.div>
        )}

        {/* ═══ ② 對角度 ═══ */}
        {stage === 'find' && (
          <motion.div key="find" {...fade}>
            <p style={kicker}>Step 2 — {overhead ? '放平' : '對角度'}</p>

            {/* 實景取景器：把「該往哪走」直接疊在畫面上，避免原地轉手機就以為對了 */}
            {!overhead && (
              <CameraViewfinder
                anchor={anchorPt}
                onAnchor={(p) => { hapticTap(); setAnchorPt(p); }}
                angleText={Number.isFinite(relAz) ? `${Math.round(relAz)}°` : '—'}
                angleState={verdict.state === 'perfect' ? 'ok' : verdict.state}
                tilt={tilt}
                arrow={(() => {
                  const tgt = target?.targetAzimuth ?? 0;
                  if (!Number.isFinite(relAz)) return '把鏡頭對準訓練位置';
                  const d = relAz - tgt;
                  if (Math.abs(d) <= 8) return '✓ 角度到位，站著別動';
                  const dir = d > 0 ? '左' : '右';
                  return `帶著手機往${dir}繞 ${Math.abs(Math.round(d))}°（人要走，不是原地轉）`;
                })()}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18, position: 'relative' }}>
              {overhead
                ? <LevelDial tilt={tilt} state={verdict.state} />
                : <AngleDial azimuth={relAz} target={target?.targetAzimuth ?? 0} state={verdict.state} />}
              <AnimatePresence>
                {locked && (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: 999, background: C.olive,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><Check size={30} color={C.paper} strokeWidth={3} /></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 大而輕的度數，對比極小的 tracked-caps 標籤 */}
            <div style={{ marginTop: 18, paddingBottom: 14, borderBottom: `1px solid ${C.rule}` }}>
              <div style={{
                fontSize: 76, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 0.9,
                color: col, fontVariantNumeric: 'tabular-nums',
              }}>
                {Number.isFinite(verdict.off) ? Math.round(verdict.off) : '—'}
                <span style={{ fontSize: 26, fontWeight: 400 }}>°</span>
              </div>
              <p style={{ ...kicker, marginTop: 12, color: C.faint }}>
                {overhead ? '離水平' : '離目標'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, minHeight: 26 }}>
              {verdict.arrow === 'left' && <ArrowLeft size={18} color={col} strokeWidth={2.2} />}
              <span style={{ fontSize: 16, fontWeight: 500, color: locked ? C.olive : C.ink }}>
                {locked ? '到位了，把手機架好' : verdict.hint}
              </span>
              {verdict.arrow === 'right' && <ArrowRight size={18} color={col} strokeWidth={2.2} />}
            </div>

            {/* 唯一常駐的提示：怎麼移動。這是最容易做錯的一件事。 */}
            <p style={{ ...body, marginTop: 12, maxWidth: '32ch' }}>{rig.move}</p>

            <Disclosure title="架設細節與常見錯誤">
              {rig.mount}
              <div style={{ height: 1, background: C.rule, margin: '12px 0' }} />
              <b style={{ color: C.coral, fontWeight: 500 }}>常犯：</b>{rig.moveWarn}
              <div style={{ height: 1, background: C.rule, margin: '12px 0' }} />
              取景：{spec.framing}
            </Disclosure>

            <BtnFlat onClick={() => { hapticTap(); setStage('verify'); }} disabled={!locked} style={{ marginTop: 4 }}>
              手機架好了
            </BtnFlat>
            {!overhead && (
              <BtnText onClick={() => { hapticTap(); setBase(null); setLocked(false); setStage('anchor'); }}>
                <RotateCw size={13} strokeWidth={2} />重設基準
              </BtnText>
            )}
          </motion.div>
        )}

        {/* ═══ ③ 驗收 ═══ */}
        {stage === 'verify' && (
          <motion.div key="verify" {...fade}>
            <p style={kicker}>Step 3 — 驗收</p>
            <h2 style={{ ...display, fontSize: 33, marginTop: 12 }}>走進畫面站好</h2>
            <div style={rule} />

            {getWorldFrame ? (
              <>
                <p style={{ ...kicker, color: C.faint }}>骨架反推</p>
                {skel ? (
                  <>
                    <div style={{
                      fontSize: 64, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 0.92,
                      marginTop: 10, color: TONE[skel.state], fontVariantNumeric: 'tabular-nums',
                    }}>{Math.round(skel.off)}<span style={{ fontSize: 23 }}>°</span></div>
                    <p style={{ ...body, marginTop: 12, maxWidth: '32ch' }}>{skel.hint}</p>
                  </>
                ) : (
                  <p style={{ ...body, marginTop: 10, maxWidth: '32ch' }}>
                    還沒偵測到骨架，請整個人走進畫面。
                  </p>
                )}
              </>
            ) : (
              <p style={{ ...body, maxWidth: '32ch' }}>
                這台裝置沒有即時骨架，先用羅盤的估計值。
                <b style={{ color: C.ink, fontWeight: 500 }}>上傳後系統會反推真實角度，超過 {POSE_TOLERANCE_DEG}° 會在報告上明講並建議重拍。</b>
              </p>
            )}

            <Disclosure title="為什麼還要驗一次">
              羅盤量的是手機朝向，健身房的鐵器會干擾磁力計。
              骨架反推是用肩線 × 軀幹軸建出身體座標系再算相機方位 —— 跟系統評分時同一套數學，不受磁干擾。
            </Disclosure>

            <BtnFlat
              onClick={() => {
                hapticSuccess();
                // 【v9.3】三個修正：
                //   · off 要回「離目標角度」而不是原始方位角 ——
                //     正側面目標是 90°，回 relAzimuth 的話對準時會顯示「離基準 90°」
                //   · 沒有即時骨架時，verified 要退回羅盤的判定，
                //     否則每一次都被標成「角度未驗證」
                //   · view 用實際選到的機位代號
                onReady?.({
                  off: Number.isFinite(verdict.off) ? verdict.off : null,
                  relAzimuth: Number.isFinite(relAz) ? relAz : null,
                  baseHeading: base,
                  skeletonOff: skel?.off ?? null,
                  verified: skel
                    ? skel.state !== 'far'
                    : (verdict.state === 'perfect' || verdict.state === 'ok'),
                  verifiedBy: skel ? 'skeleton' : 'compass',
                  view: spec.viewCode || spec.validatedView,
                });
              }}
              disabled={skel?.state === 'far'}
              style={{ marginTop: 4 }}>
              {purpose === 'template' ? '開始錄參考影片' : '開始錄影'}
            </BtnFlat>
            <BtnText onClick={() => { hapticTap(); setStage('find'); }}>
              <ChevronLeft size={13} strokeWidth={2} />回去調角度
            </BtnText>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

/* ── 外殼：Mist 冷灰底，沒有氛圍燈、沒有玻璃 ─────────────────── */
function Shell({ children, onCancel, title, step }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: C.mist, zIndex: 900,
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      fontFamily: '"Helvetica Neue", -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: 440, margin: '0 auto', padding: '0 24px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 48 }}>
          <motion.button {...pressProps('row')} onClick={onCancel} aria-label="返回" style={{
 width: 36, height: 36, marginLeft: -8, borderRadius: 0, border: 'none', flexShrink: 0,
 background: 'none', color: C.ink, cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
 }}><ChevronLeft size={22} strokeWidth={1.8} /></motion.button>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.sub }}>{title}</span>
          {step && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
              color: C.faint, fontVariantNumeric: 'tabular-nums',
            }}>{step}</span>
          )}
        </div>
        <div style={{ paddingTop: 22 }}>{children}</div>
      </div>
    </div>
  );
}

/* ── 平面按鈕：實色填滿，沒有漸層、沒有陰影、沒有光暈 ───────────── */
function BtnFlat({ children, onClick, disabled, kind = 'primary', style }) {
  const bg = disabled ? '#DCDDDA' : kind === 'quiet' ? C.paper : C.ink;
  const fg = disabled ? C.faint : kind === 'quiet' ? C.ink : C.paper;
  return (
    <motion.button {...pressProps('row')}
 onClick={onClick}
 disabled={disabled}
 style={{
 width: '100%', height: 54, borderRadius: 4,
 border: kind === 'quiet' ? `1px solid ${C.rule}` : 'none',
 background: bg, color: fg, cursor: disabled ? 'not-allowed' : 'pointer',
 fontSize: 15, fontWeight: 500, letterSpacing: '0.01em',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
 transition: 'background .18s',
 ...style,
 }}>
      {children}
    </motion.button>
  );
}

const BtnText = ({ children, onClick }) => (
  <motion.button {...pressProps('row')} onClick={onClick} style={{
 width: '100%', marginTop: 14, background: 'none', border: 'none', cursor: 'pointer',
 color: C.faint, fontSize: 13, fontWeight: 500, padding: '10px 0',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
 }}>{children}</motion.button>
);

const Note = ({ children }) => (
  <p style={{
    ...body, fontSize: 12.5, marginTop: 14, paddingLeft: 12,
    borderLeft: `2px solid ${C.coral}`, maxWidth: '32ch',
  }}>{children}</p>
);

const kicker = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
  textTransform: 'uppercase', color: C.coral, margin: 0,
};
const display = { fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1.12, color: C.ink, margin: 0 };
const body = { fontSize: 14.5, lineHeight: 1.62, color: C.sub, margin: 0 };
const rule = { height: 1, background: C.rule, margin: '22px 0 18px' };
const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.38, ease: EASE },
};
