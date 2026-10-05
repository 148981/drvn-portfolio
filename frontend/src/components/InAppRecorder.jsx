/**
 * InAppRecorder — App 內建錄影
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼要內建，而不是讓使用者從相簿選
 * ──────────────────────────────────
 *   從相簿選 = 系統完全不知道那支影片是在什麼角度、什麼距離拍的，
 *   只能事後從骨架反推、發現不對再叫人重拍 —— 使用者已經練完了。
 *   內建錄影可以在「按下錄影之前」就把角度、取景、時長全部擋好。
 *
 *   所以主要入口是「用手機直接拍」，相簿上傳降為次要（給堅持用舊影片的人），
 *   並且那條路徑會在報告上標明「機位未驗證」。
 *
 * 取景遮罩
 * ────────
 *   實測最常見的失敗不是角度，是「站直時全身都在、蹲到最低點時髖部掉出下緣」。
 *   所以畫面上直接給人形安全框，並要求先做一次完整動作確認不出框。
 *
 * 設計語彙：DRVN Dark Canvas —— 相機畫面本身就是背景，
 *   所有控制項用 Liquid Glass 浮在上面（玻璃在深色／影像上最漂亮）。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, RotateCcw, Check, AlertTriangle, SwitchCamera } from 'lucide-react';
import { hapticTap, hapticSuccess, hapticWarning, hapticSelectionChanged } from '../utils/haptics';

const C = {
  ink: '#161415',
  paper: '#F6F4F1',
  soft: 'rgba(246,244,241,0.68)',
  faint: 'rgba(246,244,241,0.44)',
  ember: '#D94030',
  olive: '#6E8F4A',
};
const EASE = [0.16, 1, 0.3, 1];

const MAX_SEC = 90;          // 超過就自動停 —— 影片越長分析越久，5 下就夠
const MIN_SEC = 4;           // 太短一定不是完整動作

/** MediaRecorder 在不同瀏覽器支援的容器不一樣，挑第一個能用的。 */
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = [
    'video/mp4;codecs=h264,aac',   // iOS 17+ Safari / WKWebView
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return list.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || null;
}

export default function InAppRecorder({
  exerciseName,
  viewName,             // 已確認的機位名稱，顯示在角落當提醒
  angleNote,            // 例：「離已驗證機位 6°」
  onDone,               // (File) => void
  onCancel,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunks = useRef([]);
  const tickRef = useRef(null);

  const [phase, setPhase] = useState('boot');   // boot | ready | count | rec | review | error
  const [err, setErr] = useState(null);
  const [facing, setFacing] = useState('environment');
  const [count, setCount] = useState(3);
  const [sec, setSec] = useState(0);
  const [preview, setPreview] = useState(null); // { url, file }

  // ── 開相機 ────────────────────────────────────────────────
  const start = useCallback(async (mode) => {
    setPhase('boot'); setErr(null);
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        },
        audio: false,      // 動作分析不需要聲音，省檔案大小
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
      setPhase('ready');
    } catch (e) {
      /* App 是 WKWebView，相機權限掛在 App 自己身上，不是 Safari ——
         原本叫人去「設定 → Safari → 相機」，在 App 裡永遠找不到開關。 */
      const inApp = !!window.webkit?.messageHandlers;
      setErr(e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
        ? (inApp
          ? '相機權限被拒絕。請到 iPhone「設定 → DRVN → 相機」開啟後再回來，或改用「從相簿選擇」。'
          : '相機權限被拒絕。請在瀏覽器的網站設定裡允許使用相機，或改用「從相簿選擇」。')
        : '打不開相機。可能是被其他 App 佔用，或這台裝置不支援。可以改用「從相簿選擇」。');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr('這個瀏覽器不支援內建錄影，請改用「從相簿選擇」。');
      setPhase('error');
      return undefined;
    }
    start(facing);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  /* 重拍時相機 <video> 是重新掛上的新元素（review 時被回放影片換掉），
     不把 stream 接回去的話畫面會是一片黑，但其實還在錄。 */
  useEffect(() => {
    if (phase === 'review' || phase === 'error') return;
    const v = videoRef.current;
    const s = streamRef.current;
    if (v && s && v.srcObject !== s) {
      v.srcObject = s;
      v.play().catch(() => {});
    }
  }, [phase]);

  // 離開時釋放回放用的 blob URL（一支影片幾十 MB，不放掉會一直佔記憶體）
  const previewUrlRef = useRef(null);
  previewUrlRef.current = preview?.url || null;
  useEffect(() => () => {
    if (previewUrlRef.current) { try { URL.revokeObjectURL(previewUrlRef.current); } catch { /* */ } }
  }, []);

  // ── 倒數 ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'count') return undefined;
    if (count <= 0) { beginRec(); return undefined; }
    hapticSelectionChanged();
    const id = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count]);

  const beginRec = useCallback(() => {
    const s = streamRef.current;
    const mime = pickMime();
    if (!s || !mime) {
      setErr('這台裝置的瀏覽器不支援錄影格式，請改用「從相簿選擇」。');
      setPhase('error');
      return;
    }
    try {
      chunks.current = [];
      const r = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      r.ondataavailable = e => { if (e.data?.size) chunks.current.push(e.data); };
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: mime });
        if (!blob.size) {
          setErr('這次沒有錄到任何畫面，請返回再錄一次。');
          setPhase('error');
          return;
        }
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `drvn_${Date.now()}.${ext}`, { type: mime });
        setPreview({ url: URL.createObjectURL(blob), file });
        setPhase('review');
        hapticSuccess();
      };
      r.start(250);
      recRef.current = r;
      setSec(0);
      setPhase('rec');
      hapticSuccess();
      tickRef.current = setInterval(() => {
        setSec(v => {
          const n = v + 1;
          if (n >= MAX_SEC) { stopRec(); }
          return n;
        });
      }, 1000);
    } catch {
      setErr('錄影啟動失敗，請改用「從相簿選擇」。');
      setPhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRec = useCallback(() => {
    clearInterval(tickRef.current);
    try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch { /* */ }
  }, []);

  const retake = useCallback(() => {
    hapticTap();
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null); setSec(0); setCount(3); setPhase('ready');
  }, [preview]);

  // sec 是整秒；不到 1 秒就停的時候 sec 是 0，也一樣算太短
  const tooShort = sec < MIN_SEC;
  const hitMax = sec >= MAX_SEC;

  // ── 錯誤畫面 ──────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div style={shell}>
        <Header onCancel={onCancel} title="內建錄影" />
        <div style={{ padding: '0 20px' }}>
          <div className="lg-glass lg-glass--quiet" style={{ borderRadius: 20, padding: 22 }}>
            <AlertTriangle size={22} color={C.ember} strokeWidth={2.2} />
            <p style={{ ...body, marginTop: 12 }}>{err}</p>
            <motion.button {...pressProps('row')} onClick={() => { hapticTap(); onCancel?.(); }}
 className="lg-btn lg-btn--frost lg-btn--interactive" style={{ ...cta, marginTop: 18 }}>
              返回
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      {/* ── 相機畫面（review 時換成回放）── */}
      <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
        {phase === 'review' && preview ? (
          <video src={preview.url} controls playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : (
          <video ref={videoRef} muted playsInline autoPlay
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: facing === 'user' ? 'scaleX(-1)' : 'none',
            }} />
        )}
      </div>

      {/* ── 取景安全框 ── */}
      {phase !== 'review' && (
        <svg viewBox="0 0 100 178" preserveAspectRatio="none" aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <rect x="14" y="14" width="72" height="150" rx="3"
            fill="none" stroke="rgba(246,244,241,0.34)" strokeWidth="0.45" strokeDasharray="3 2.4" />
          {/* 四角實角 —— 圓角框裡的方形硬角，製造精密儀器感 */}
          {[[14, 14, 1, 1], [86, 14, -1, 1], [14, 164, 1, -1], [86, 164, -1, -1]].map(([x, y, sx, sy], i) => (
            <path key={i} d={`M ${x} ${y + 9 * sy} L ${x} ${y} L ${x + 8 * sx} ${y}`}
              fill="none" stroke={C.paper} strokeWidth="0.8" opacity="0.85" />
          ))}
        </svg>
      )}

      {/* ── 頂部：機位提醒 ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}>
        <Header onCancel={phase === 'rec' ? null : onCancel} title="" />
        <div style={{ padding: '0 20px' }}>
          <AnimatePresence>
            {phase !== 'rec' && phase !== 'count' && (
              <motion.div {...fade} className="lg-glass lg-glass--dark"
                style={{ borderRadius: 16, padding: '11px 15px' }}>
                <p style={{ ...kicker, color: C.olive }}>
                  {viewName || '機位'}{angleNote ? ` · ${angleNote}` : ''}
                </p>
                <p style={{ ...body, fontSize: 13, marginTop: 4 }}>
                  {exerciseName ? `${exerciseName} · ` : ''}整個人要在虛線框內，蹲到最低點也不能出框
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── 倒數 ── */}
      <AnimatePresence>
        {phase === 'count' && count > 0 && (
          <motion.div key={count} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}
            style={{
              position: 'absolute', inset: 0, display: 'flex', zIndex: 3,
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
            <span style={{
              fontSize: 128, fontWeight: 300, color: C.paper, letterSpacing: '-0.04em',
              textShadow: '0 8px 40px rgba(0,0,0,0.5)', fontVariantNumeric: 'tabular-nums',
            }}>{count}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 錄影中的計時 ── */}
      {phase === 'rec' && (
        <div style={{
          position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 18px)',
          left: '50%', transform: 'translateX(-50%)', zIndex: 3,
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 15px',
          borderRadius: 999, background: 'rgba(22,20,21,0.62)', backdropFilter: 'blur(14px)',
        }}>
          <motion.span animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
            style={{ width: 8, height: 8, borderRadius: 999, background: C.ember }} />
          <span style={{
            fontSize: 15, fontWeight: 600, color: C.paper, fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
          }}>
            {String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 11, color: C.faint }}>/ {MAX_SEC}s</span>
        </div>
      )}

      {/* ── 底部控制 ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
        padding: '0 20px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 26px)',
        background: 'linear-gradient(180deg, transparent, rgba(22,20,21,0.72) 42%)',
        paddingTop: 56,
      }}>
        {phase === 'review' ? (
          <motion.div {...fade}>
            {tooShort && (
              <div style={{
                display: 'flex', gap: 9, alignItems: 'center', marginBottom: 12,
                padding: '10px 14px', borderRadius: 13, background: 'rgba(217,64,48,0.18)',
              }}>
                <AlertTriangle size={15} color={C.ember} strokeWidth={2.2} />
                <span style={{ ...body, fontSize: 13 }}>
                  {sec < 1 ? '不到 1 秒' : `只有 ${sec} 秒`}，可能不到一下完整動作，建議重拍
                </span>
              </div>
            )}
            {hitMax && (
              <div style={{
                display: 'flex', gap: 9, alignItems: 'center', marginBottom: 12,
                padding: '10px 14px', borderRadius: 13, background: 'rgba(246,244,241,0.12)',
              }}>
                <AlertTriangle size={15} color={C.paper} strokeWidth={2.2} />
                <span style={{ ...body, fontSize: 13 }}>已達 {MAX_SEC} 秒上限，自動停止錄影</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <motion.button {...pressProps('row')} onClick={retake} className="lg-btn lg-btn--frost lg-btn--interactive"
 style={{ ...cta, flex: '0 0 44%' }}>
                <RotateCcw size={16} strokeWidth={2.2} />重拍
              </motion.button>
              <motion.button {...pressProps('row')} onClick={() => { hapticSuccess(); onDone?.(preview.file); }}
 className="lg-btn lg-btn--coral lg-btn--interactive" style={{ ...cta, flex: 1 }}>
                <Check size={17} strokeWidth={2.6} />用這一支分析
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* 左：切換鏡頭 */}
            <motion.button {...pressProps('row')}
 onClick={() => { hapticTap(); setFacing(f => (f === 'user' ? 'environment' : 'user')); }}
 disabled={phase === 'rec' || phase === 'count'}
 aria-label="切換鏡頭"
 style={{
 width: 46, height: 46, borderRadius: 14, border: 'none', cursor: 'pointer',
 background: 'rgba(246,244,241,0.12)', color: C.paper,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 opacity: phase === 'rec' || phase === 'count' ? 0.3 : 1,
 }}><SwitchCamera size={20} strokeWidth={2} /></motion.button>

            {/* 中：快門 */}
            <motion.button {...pressProps('row')}
 onClick={() => {
 if (phase === 'rec') { hapticWarning(); stopRec(); }
 else if (phase === 'ready') { hapticTap(); setCount(3); setPhase('count'); }
 }}
 disabled={phase === 'boot' || phase === 'count'}
 aria-label={phase === 'rec' ? '停止錄影' : '開始錄影'}
 style={{
 width: 80, height: 80, borderRadius: 999, cursor: 'pointer',
 border: `3px solid ${C.paper}`, background: 'transparent', padding: 5,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 opacity: phase === 'boot' ? 0.4 : 1, transition: 'opacity .2s',
 }}>
              <motion.span
                animate={phase === 'rec' ? { borderRadius: 12, width: 32, height: 32 } : { borderRadius: 999, width: 64, height: 64 }}
                transition={{ duration: 0.28, ease: EASE }}
                style={{ display: 'block', background: C.ember }} />
            </motion.button>

            {/* 右：佔位，維持快門置中 */}
            <div style={{ width: 46 }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 共用 ───────────────────────────────────────────────────── */
function Header({ onCancel, title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, height: 48,
      padding: '0 20px', marginTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
      marginBottom: 10,
    }}>
      {onCancel && (
        <motion.button {...pressProps('row')} onClick={onCancel} aria-label="返回" style={{
 width: 40, height: 40, borderRadius: 12, border: 'none', flexShrink: 0,
 background: 'rgba(22,20,21,0.5)', backdropFilter: 'blur(12px)', color: C.paper,
 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
 }}><ChevronLeft size={20} strokeWidth={2.2} /></motion.button>
      )}
      {title && <span style={{ fontSize: 13, fontWeight: 700, color: C.soft }}>{title}</span>}
    </div>
  );
}

const shell = { position: 'fixed', inset: 0, background: C.ink, zIndex: 950, overflow: 'hidden' };
const kicker = {
  fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
  textTransform: 'uppercase', margin: 0,
};
const body = { fontSize: 14, lineHeight: 1.55, color: C.soft, margin: 0 };
const cta = {
  height: 54, borderRadius: 16, border: 'none', cursor: 'pointer',
  fontSize: 15.5, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};
const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.36, ease: EASE },
};
