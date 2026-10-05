/**
 * CameraSetupGuide — 錄影前的架機位引導與驗收
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼這個畫面必須存在（實測依據，2026-08-03）
 * ────────────────────────────────────────────
 *   跨機位   相機方位差 69°  →  骨長差 18.7%、關節角差 24.5°   ❌ 量到的是不同的東西
 *   同機位   相機方位差 4.2° →  骨長差  6.8%、關節角差  4.0°   ✅ 可以比
 *
 * 也就是說：**使用者自然架設的重複性其實夠好，真正會出事的是換到完全不同的機位。**
 * 所以引導的目標不是「精準到 1 度」，而是
 *   ① 第一次就架在該檢查項驗證過的機位（深蹲正面 0°／臥推正上方俯視）
 *   ② 之後每次回到同一個位置（用記憶的相機方位做復位提示）
 *
 * 設計原則
 * ────────
 *   · 逐項打勾，每一項都說「為什麼」與「怎麼改」，不是丟一句「請調整角度」
 *   · 未通過就禁用錄影鍵 —— 假分數比不給分更危險
 *   · 尚未由實測定錨的門檻標成參考項，照樣顯示但不擋人
 *   · 靜態通過後還要「先做一次完整動作」——
 *     實測最常見的失敗是「站直時全身都在、蹲到最低點時髖部掉出下緣」
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { checkFrame, checkFullROM, cameraPose, repositionHint, REPOSITION_TOL } from '../lib/framingCheck';

const C = {
  bg: '#0F0F0F', panel: 'rgba(255,255,255,0.06)', line: 'rgba(255,255,255,0.14)',
  text: '#F5F3F0', sub: 'rgba(245,243,240,0.62)', faint: 'rgba(245,243,240,0.38)',
  ok: '#6FD39A', warn: '#E8B87A', bad: '#E8735A', coral: '#E1613F',
};
const FONT = '"Helvetica Neue", -apple-system, sans-serif';

/** 每個檢查項要說明「為什麼」—— 使用者知道原因才會配合 */
const WHY = {
  facing: '膝蓋內夾是左右方向的偏移，必須正對鏡頭才量得到',
  in_frame: '蹲到最低點那幾幀才有資訊，被裁掉就等於沒拍',
  distance: '太近蹲到底會出框、太遠關節只剩幾個像素',
  height: '俯拍會讓膝踝的水平距離被透視扭曲',
  knee_ankle: '膝與踝的水平距離就是判斷內夾的依據',
  both_arms: '肘外展要比較兩側上臂與肩線的夾角',
  elbows: '肩線與上臂決定外展角度',
  overhead: '正上方時推的方向沿垂直軸，量測最穩定',
};

export default function CameraSetupGuide({
  exerciseKey,
  viewCode,
  viewName,
  checkName,              // 這次要檢查什麼（例：膝蓋內夾）
  getFrame,               // () => 2D landmarks (33) | null
  getWorldFrame,          // () => world landmarks (33×3) | null，可省略
  savedPose,              // 記憶的相機方位 {azimuth, elevation} | null
  onReady,                // (pose) => void　通過驗收
  onCancel,
}) {
  const [res, setRes] = useState({ ready: false, supported: true, checks: [], blockingLeft: 1 });
  const [pose, setPose] = useState(null);
  const [stage, setStage] = useState('static');      // static | rom | done
  const [romMsg, setRomMsg] = useState(null);
  const [recording, setRecording] = useState(false);
  const buf = useRef([]);
  const holdRef = useRef(0);

  // ── 即時驗收迴圈 ──────────────────────────────────────────────
  useEffect(() => {
    let raf, alive = true;
    const tick = () => {
      if (!alive) return;
      const f = getFrame?.();
      const r = checkFrame(f, exerciseKey, viewCode);
      setRes(r);
      const wf = getWorldFrame?.();
      if (wf) { const p = cameraPose(wf); if (p) setPose(p); }
      // 連續通過 0.8 秒才算穩定，避免瞬間閃過
      holdRef.current = r.ready ? holdRef.current + 1 : 0;
      if (stage === 'rom' && recording && f) {
        buf.current.push(f);
        if (buf.current.length > 300) buf.current.shift();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [exerciseKey, viewCode, getFrame, getWorldFrame, stage, recording]);

  const repo = useMemo(() => repositionHint(pose, savedPose), [pose, savedPose]);
  const stable = holdRef.current > 40;                // ~0.8 秒 @50fps

  const startRom = () => { buf.current = []; setRomMsg(null); setRecording(true); setStage('rom'); };
  const finishRom = () => {
    setRecording(false);
    const r = checkFullROM(buf.current, exerciseKey);
    setRomMsg(r);
    if (r.ok) { setStage('done'); setTimeout(() => onReady?.(pose), 700); }
  };

  const blocking = res.checks.filter(c => c.blocking);
  const passed = blocking.filter(c => c.pass).length;
  const pct = blocking.length ? passed / blocking.length : 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: C.bg, color: C.text, fontFamily: FONT,
      display: 'flex', flexDirection: 'column', zIndex: 60,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* 頁首 */}
      <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <motion.button {...pressProps('row')} onClick={onCancel} style={{
 background: 'none', border: 'none', color: C.sub, fontSize: 15, padding: 4, cursor: 'pointer',
 }}>取消</motion.button>
          <div style={{ fontSize: 12, letterSpacing: '0.2em', color: C.faint, }}>
            架設機位
          </div>
          <div style={{ width: 32 }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {viewName}
        </div>
        {checkName && (
          <div style={{ marginTop: 3, fontSize: 12.5, color: C.sub, lineHeight: 1.45 }}>
            這個角度是<b style={{ color: C.text }}>唯一</b>驗證過能抓到「{checkName}」的機位
          </div>
        )}
      </div>

      {/* 進度條 */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)' }}>
        <motion.div animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.25 }}
          style={{ height: '100%', background: pct === 1 ? C.ok : C.coral }} />
      </div>

      {/* 復位提示（有記憶機位時才出現） */}
      {savedPose && repo && (
        <div style={{
          margin: '10px 16px 0', padding: '9px 12px', borderRadius: 10,
          background: repo.ok ? 'rgba(111,211,154,0.12)' : 'rgba(232,184,122,0.12)',
          border: `1px solid ${repo.ok ? 'rgba(111,211,154,0.3)' : 'rgba(232,184,122,0.3)'}`,
          fontSize: 12.5, lineHeight: 1.45,
        }}>
          <b style={{ color: repo.ok ? C.ok : C.warn }}>
            {repo.ok ? '✓ 回到上次的位置了' : `↻ ${repo.hint}`}
          </b>
          <span style={{ color: C.faint, marginLeft: 6 }}>
            偏離 {repo.off.toFixed(0)}°（容許 {REPOSITION_TOL}°）
          </span>
        </div>
      )}

      {/* 檢查清單 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 8px' }}>
        {res.noPose && (
          <div style={{ padding: 20, textAlign: 'center', color: C.sub, fontSize: 13.5 }}>
            還沒偵測到人 —— 請站進畫面裡
          </div>
        )}
        {res.checks.map(c => (
          <div key={c.key} style={{
            display: 'flex', gap: 11, padding: '11px 12px', marginBottom: 7, borderRadius: 11,
            background: c.pass ? 'rgba(111,211,154,0.07)' : C.panel,
            border: `1px solid ${c.pass ? 'rgba(111,211,154,0.22)' : C.line}`,
          }}>
            <div style={{
              width: 21, height: 21, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              background: c.pass ? C.ok : (c.blocking ? 'rgba(232,115,90,0.18)' : 'rgba(255,255,255,0.08)'),
              border: c.pass ? 'none' : `1.5px solid ${c.blocking ? C.bad : C.faint}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 900, color: '#0F0F0F',
            }}>{c.pass ? '✓' : ''}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, display: 'flex', gap: 7, alignItems: 'baseline' }}>
                {c.label}
                {!c.blocking && (
                  <span style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>參考</span>
                )}
              </div>
              {!c.pass && c.hint && (
                <div style={{ fontSize: 13, color: C.warn, marginTop: 3, lineHeight: 1.4 }}>{c.hint}</div>
              )}
              {WHY[c.key] && (
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3, lineHeight: 1.4 }}>
                  {WHY[c.key]}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {c.measured != null ? c.measured : '—'}
            </div>
          </div>
        ))}

        {/* 動態驗收結果 */}
        <AnimatePresence>
          {romMsg && !romMsg.ok && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                marginTop: 6, padding: '11px 13px', borderRadius: 11,
                background: 'rgba(232,115,90,0.12)', border: '1px solid rgba(232,115,90,0.3)',
                fontSize: 13, lineHeight: 1.5, color: C.text,
              }}>
              <b style={{ color: C.bad }}>取景沒過　</b>{romMsg.reason}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部動作區 */}
      <div style={{ padding: '10px 16px 16px', borderTop: `1px solid ${C.line}` }}>
        {stage === 'static' && (
          <>
            <div style={{ fontSize: 12, color: C.faint, marginBottom: 9, lineHeight: 1.5 }}>
              {res.ready
                ? '靜態檢查通過。接下來請完整做一次動作 —— 站直時全身都在，不代表蹲到底也在。'
                : `還有 ${res.blockingLeft} 項要調整`}
            </div>
            <motion.button {...pressProps('row')} disabled={!res.ready || !stable} onClick={startRom} style={{
 width: '100%', padding: '15px 0', borderRadius: 13, border: 'none',
 background: (res.ready && stable) ? C.coral : 'rgba(255,255,255,0.09)',
 color: (res.ready && stable) ? '#fff' : C.faint,
 fontSize: 15.5, fontWeight: 800, fontFamily: FONT,
 cursor: (res.ready && stable) ? 'pointer' : 'not-allowed',
 }}>
              {res.ready ? (stable ? '開始取景測試' : '保持穩定…') : '調整好就能開始'}
            </motion.button>
          </>
        )}

        {stage === 'rom' && (
          <>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 9, lineHeight: 1.5 }}>
              <b>做一次完整動作</b> —— {exerciseKey === 'squat' ? '蹲到最低再站起來' : '把槓推到最高再放下'}
            </div>
            <motion.button {...pressProps('row')} onClick={finishRom} style={{
 width: '100%', padding: '15px 0', borderRadius: 13, border: `1.5px solid ${C.coral}`,
 background: 'transparent', color: C.coral, fontSize: 15.5, fontWeight: 800,
 fontFamily: FONT, cursor: 'pointer',
 }}>做完了，檢查取景</motion.button>
          </>
        )}

        {stage === 'done' && (
          <div style={{
            padding: '15px 0', textAlign: 'center', fontSize: 15.5, fontWeight: 800, color: C.ok,
          }}>✓ 機位就緒，開始錄影</div>
        )}
      </div>
    </div>
  );
}
