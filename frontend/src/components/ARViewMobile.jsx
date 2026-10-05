import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { ChevronLeft, Play, Award, AlertCircle, RotateCcw, AlertTriangle,
         Layers, Move, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { mediaUrl } from '../utils/apiHostFix';

/**
 * ARViewMobile —— 動作回放 + 黃金骨架疊合 (v5.0)
 * ─────────────────────────────────────────────────────────────────────────
 *  兩條「拖移軌道」：
 *    1) 影片軌道：frame-by-frame 逐格拖移看自己實際動作（含 ◀ ▶ 逐格鍵）。
 *    2) 疊合軌道：拖移黃金模板的動作週期(phase 0→1)，白線=你、珊瑚線=教練，
 *       同步顯示在同一畫面。可用手指把「教練骨架」左右/上下拖到跟自己對齊，
 *       系統即時算出「哪個關節偏最多」。
 *  只畫「該機位偵測得到的點位」(poseDrawIdx)——側面 90° 不會硬畫對側被遮擋的手/腳。
 *  黃金骨架資料需後端以『建模模式』跑過一次才會有；沒有時自動退回純影片回放。
 */

const C = {
    black:  '#161415',
    paper:  '#F6F4F1',
    stone:  '#E4DED2',
    pebble: '#CFC6B8',
    coral:  '#F95C4B',
    ember:  '#D94030',
    sub:    '#8A8782',
};
const MONO = '"SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace';
const SANS = '"Helvetica Neue", -apple-system, sans-serif';

/* 明顯可拖曳的軌道：粗軌 + 大拉桿 + 白邊陰影，手指一看就知道可以拉 */
const SCRUB_CSS = `
.drvn-scrub{ -webkit-appearance:none; appearance:none; width:100%; height:34px;
  background:transparent; cursor:grab; touch-action:none; }
.drvn-scrub:active{ cursor:grabbing; }
.drvn-scrub::-webkit-slider-runnable-track{ height:10px; border-radius:99px;
  background:var(--trk); border:1px solid rgba(246,244,241,0.22); }
.drvn-scrub::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none;
  width:30px; height:30px; margin-top:-11px; border-radius:50%;
  background:#F6F4F1; border:3px solid #F95C4B;
  box-shadow:0 3px 10px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.25); }
.drvn-scrub::-moz-range-track{ height:10px; border-radius:99px; background:var(--trk); }
.drvn-scrub::-moz-range-thumb{ width:30px; height:30px; border-radius:50%;
  background:#F6F4F1; border:3px solid #F95C4B; box-shadow:0 3px 10px rgba(0,0,0,0.5); }
@keyframes drvnNudge{ 0%,100%{transform:translateX(0)} 50%{transform:translateX(5px)} }
.drvn-nudge{ animation:drvnNudge 1.5s ease-in-out 3; }
`;

// ── 骨架連線（33 點模型；只有兩端都在 poseDrawIdx 內才畫）────────────────
const BONES = [
    [11, 12], [11, 23], [12, 24], [23, 24],       // 軀幹
    [11, 13], [13, 15], [12, 14], [14, 16],       // 手臂
    [23, 25], [25, 27], [24, 26], [26, 28],       // 腿
];
const LM_ZH = {
    11: '左肩', 12: '右肩', 13: '左肘', 14: '右肘', 15: '左腕', 16: '右腕',
    23: '左髖', 24: '右髖', 25: '左膝', 26: '右膝', 27: '左踝', 28: '右踝',
};
// 兩點中點（任一點無效就回另一點；都無效回 null）——給骨架對位用
const midpt = (frame, a, b) => {
    const pa = frame && frame[a], pb = frame && frame[b];
    const va = pa && Number.isFinite(pa[0]), vb = pb && Number.isFinite(pb[0]);
    if (va && vb) return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    if (va) return [pa[0], pa[1]];
    if (vb) return [pb[0], pb[1]];
    return null;
};

const BRUSH_GUNMETAL = {
    background: [
        'radial-gradient(ellipse 140% 70% at 50% -10%, rgba(246,244,241,0.10) 0%, rgba(246,244,241,0) 60%)',
        'conic-gradient(from 180deg at 50% 50%, #3A3633 0deg, #1E1B19 45deg, #2C2926 90deg, #1A1715 135deg, #3A3633 180deg, #1A1715 225deg, #2C2926 270deg, #1E1B19 315deg, #3A3633 360deg)',
    ].join(', '),
    border: '1px solid rgba(207,198,184,0.18)',
    boxShadow: [
        'inset 0 1px 0 rgba(246,244,241,0.10)',
        'inset 0 -1px 0 rgba(0,0,0,0.5)',
        '0 1px 0 rgba(0,0,0,0.55)',
        '0 4px 14px -4px rgba(0,0,0,0.45)',
    ].join(', '),
};
const BRUSH_STONE = {
    background: [
        'radial-gradient(ellipse 140% 70% at 50% -10%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%)',
        'conic-gradient(from 180deg at 50% 50%, #C9BFAE 0deg, #ECE6DA 45deg, #B6AC9A 90deg, #E5DDCB 135deg, #C9BFAE 180deg, #EFEADD 225deg, #B6AC9A 270deg, #E5DDCB 315deg, #C9BFAE 360deg)',
    ].join(', '),
    border: '1px solid #9F9684',
    boxShadow: [
        'inset 0 1px 0 rgba(255,255,255,0.7)',
        'inset 0 -1px 0 rgba(80,72,60,0.18)',
        '0 1px 0 rgba(0,0,0,0.45)',
        '0 4px 14px -4px rgba(207,198,184,0.55)',
    ].join(', '),
};
const BRUSH_EMBER = {
    background: [
        'radial-gradient(ellipse 140% 70% at 50% -10%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 60%)',
        'conic-gradient(from 180deg at 50% 50%, #B33223 0deg, #FB7160 45deg, #D94030 90deg, #FB7160 135deg, #B33223 180deg, #FB7160 225deg, #D94030 270deg, #FB7160 315deg, #B33223 360deg)',
    ].join(', '),
    border: '1px solid #8A2818',
    boxShadow: [
        'inset 0 1px 0 rgba(255,255,255,0.4)',
        'inset 0 -1px 0 rgba(80,15,8,0.55)',
        '0 1px 0 rgba(0,0,0,0.5)',
        '0 4px 14px -4px rgba(217,64,48,0.50)',
    ].join(', '),
};

// ═══════════════════════════════════════════════════════════════════════════

const ARViewMobile = ({
    videoUrl: propVideoUrl,
    repSegments: propRepSegments,
    fatigueData: propFatigueData,
    repCorrections: propRepCorrections,
    goldenPose: propGoldenPose,
    userPose: propUserPose,
    poseDrawIdx: propPoseDrawIdx,
}) => {
    const navigate = useNavigate();
    const location = useLocation();

    // 返回：優先 pop 回上一頁（結算頁的 state 才不會掉），沒有歷史才 fallback
    const goBack = useCallback(() => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/result-mobile');
    }, [navigate]);

    const videoUrl = location.state?.videoUrl || propVideoUrl;
    const repSegments = location.state?.repSegments || propRepSegments || [];
    const fatigueData = location.state?.fatigueData || propFatigueData || [];
    const repCorrections = location.state?.repCorrections || propRepCorrections || [];
    const goldenPose = location.state?.goldenPose || propGoldenPose || null;
    const userPose = location.state?.userPose || propUserPose || null;
    const poseDrawIdxRaw = location.state?.poseDrawIdx || propPoseDrawIdx || null;

    const [isPlaying, setIsPlaying] = useState(false);
    const [videoTime, setVideoTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // mode: 'all' / 'best' / 'worst'
    const [mode, setMode] = useState('all');
    const videoRef = useRef(null);

    // ── 疊合（黃金骨架）狀態 ─────────────────────────────
    const hasPose = Array.isArray(goldenPose) && goldenPose.length > 1
        && Array.isArray(userPose) && userPose.length > 1;
    const poseLen = hasPose ? Math.min(goldenPose.length, userPose.length) : 0;

    // 哪些點位要畫：優先用後端給的；沒有就從教練第 0 幀非 NaN 推回來
    const drawIdx = useMemo(() => {
        if (!hasPose) return [];
        // 起點：後端給的可畫點位；沒有就用第 0 幀有值的點
        let base;
        if (Array.isArray(poseDrawIdxRaw) && poseDrawIdxRaw.length) {
            base = poseDrawIdxRaw.map(Number);
        } else {
            const f0 = goldenPose[0] || [];
            base = Object.keys(LM_ZH).map(Number).filter((k) => {
                const p = f0[k]; return p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
            });
        }
        /* 前端再保險一次：被遮擋的遠側肢體 MediaPipe 仍會給「幾乎不動的腦補座標」。
           比較左右同名點的實際活動範圍，明顯偏小的那側代表沒被真的觀測到 → 不畫，
           免得使用者看到一條根本量不到的假肢體。 */
        const CONTRA = { 11:12,12:11,13:14,14:13,15:16,16:15,23:24,24:23,25:26,26:25,27:28,28:27 };
        const amp = {};
        base.concat(base.map((i) => CONTRA[i]).filter(Boolean)).forEach((i) => {
            if (amp[i] !== undefined) return;
            let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity,seen=0;
            for (const fr of goldenPose) {
                const p = fr && fr[i];
                if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
                seen++; mnx=Math.min(mnx,p[0]); mxx=Math.max(mxx,p[0]);
                mny=Math.min(mny,p[1]); mxy=Math.max(mxy,p[1]);
            }
            amp[i] = seen >= 3 ? Math.max(mxx-mnx, mxy-mny) : NaN;
        });
        const kept = base.filter((i) => {
            const j = CONTRA[i];
            if (j == null || !Number.isFinite(amp[j]) || amp[j] <= 1e-6) return true;
            return !(Number.isFinite(amp[i]) && amp[i] < amp[j] * 0.35);
        });
        return kept.length >= 2 ? kept : base;
    }, [poseDrawIdxRaw, hasPose, goldenPose]);

    const [overlayOn, setOverlayOn]   = useState(false);   // 疊合模式（教練骨架蓋在影片上）
    const [coachX, setCoachX]         = useState(0);        // 教練骨架左右平移(px)，預設 0=置中
    const canvasRef                   = useRef(null);
    const canvasWrapRef               = useRef(null);
    const dragRef                     = useRef(null);       // 觸控拖曳教練骨架（等同拉左右軌）

    const { bestRep, worstRep, deltaScore } = useMemo(() => {
        if (!Array.isArray(fatigueData) || fatigueData.length < 2 ||
            !Array.isArray(repSegments) || repSegments.length < 2) {
            return { bestRep: null, worstRep: null, deltaScore: 0 };
        }
        /* 量不到的那一下（score 為 null）不參與比較 —— 以前 `?? 0` 會把它當成 0 分，
           於是「待加強」永遠挑到沒分數的那一下，還顯示「0 分」。 */
        let bestIdx = -1, worstIdx = -1;
        fatigueData.forEach((d, i) => {
            const s = d?.score;
            if (s == null || !Number.isFinite(Number(s))) return;
            if (bestIdx < 0 || Number(s) > Number(fatigueData[bestIdx].score)) bestIdx = i;
            if (worstIdx < 0 || Number(s) < Number(fatigueData[worstIdx].score)) worstIdx = i;
        });
        if (bestIdx < 0 || worstIdx < 0 || bestIdx === worstIdx) {
            return { bestRep: null, worstRep: null, deltaScore: 0 };
        }

        const bestSeg = repSegments[bestIdx];
        const worstSeg = repSegments[worstIdx];
        if (!bestSeg || !worstSeg) return { bestRep: null, worstRep: null, deltaScore: 0 };

        const bestScore = Number(fatigueData[bestIdx].score);
        const worstScore = Number(fatigueData[worstIdx].score);
        return {
            bestRep:  { index: bestIdx,  rep: bestSeg.rep,  startSec: bestSeg.startSec,  endSec: bestSeg.endSec,  score: bestScore  },
            worstRep: { index: worstIdx, rep: worstSeg.rep, startSec: worstSeg.startSec, endSec: worstSeg.endSec, score: worstScore },
            deltaScore: Math.round(bestScore - worstScore),
        };
    }, [fatigueData, repSegments]);

    const canCompare = !!(bestRep && worstRep);

    const currentRep = useMemo(() => {
        if (!repSegments || repSegments.length === 0) return 0;
        for (let i = 0; i < repSegments.length; i++) {
            if (videoTime < (repSegments[i].endSec ?? Infinity)) return i + 1;
        }
        return repSegments.length;
    }, [repSegments, videoTime]);

    const activeCorrection = useMemo(() => {
        if (!Array.isArray(repCorrections) || repCorrections.length === 0) return null;
        if (mode === 'best' && bestRep) return repCorrections[bestRep.index] || null;
        if (mode === 'worst' && worstRep) return repCorrections[worstRep.index] || null;
        if (mode === 'all' && currentRep > 0) return repCorrections[currentRep - 1] || null;
        return null;
    }, [mode, bestRep, worstRep, currentRep, repCorrections]);

    /* ⚠️ 這裡以前寫死 http://{hostname}:8000。<video src> 是瀏覽器自己去抓的，
       不會經過 apiHostFix 的 fetch/XHR 攔截 —— 打包版 hostname 是 app，
       所以分析完的 AR 疊合影片在手機上一定是黑的，而且不會報錯。 */
    const activeVideoUrl = mediaUrl(videoUrl);

    const playSegment = useCallback((seg) => {
        const v = videoRef.current;
        if (!v || !seg) return;
        try {
            v.currentTime = Math.max(0, (seg.startSec ?? 0) - 0.05);
            setVideoTime(Math.max(0, seg.startSec ?? 0));
            const p = v.play();
            if (p?.then) p.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        } catch (e) { console.warn('playSegment failed:', e); }
    }, []);

    const switchToBest  = useCallback(() => { setOverlayOn(false); if (bestRep)  { setMode('best');  playSegment(bestRep); } }, [bestRep, playSegment]);
    const switchToWorst = useCallback(() => { setOverlayOn(false); if (worstRep) { setMode('worst'); playSegment(worstRep); } }, [worstRep, playSegment]);
    const switchToAll   = useCallback(() => {
        setOverlayOn(false);
        setMode('all');
        const v = videoRef.current;
        if (v) {
            v.currentTime = 0;
            v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
    }, []);

    useEffect(() => {
        if (mode === 'all' || overlayOn) return;
        const seg = mode === 'best' ? bestRep : worstRep;
        if (!seg) return;
        if (videoTime >= (seg.endSec ?? 0) - 0.02) {
            const v = videoRef.current;
            if (v) {
                v.currentTime = Math.max(0, (seg.startSec ?? 0) - 0.05);
                setVideoTime(Math.max(0, seg.startSec ?? 0));
            }
        }
    }, [mode, videoTime, bestRep, worstRep, overlayOn]);

    const togglePlay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        if (isPlaying) { v.pause(); setIsPlaying(false); }
        else v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }, [isPlaying]);

    // 逐格步進（假設 30fps）
    const FRAME = 1 / 30;
    const stepFrame = useCallback((dir) => {
        const v = videoRef.current;
        if (!v) return;
        v.pause(); setIsPlaying(false);
        const t = Math.max(0, Math.min(duration || v.duration || 0, v.currentTime + dir * FRAME));
        v.currentTime = t; setVideoTime(t);
    }, [duration]);

    // 疊合相位：教練骨架的動作週期跟著「影片滑到哪」自動走（落在哪個 rep 內的比例）
    const phase = useMemo(() => {
        if (Array.isArray(repSegments) && repSegments.length) {
            for (const s of repSegments) {
                const a = s.startSec ?? 0, b = s.endSec ?? (a + 1);
                if (videoTime <= b) return Math.max(0, Math.min(1, (videoTime - a) / Math.max(0.05, b - a)));
            }
            return 1;
        }
        return duration ? Math.max(0, Math.min(1, videoTime / duration)) : 0;
    }, [videoTime, repSegments, duration]);
    const phaseIdx = hasPose ? Math.max(0, Math.min(poseLen - 1, Math.round(phase * (poseLen - 1)))) : 0;

    // 進入疊合模式：暫停影片、教練骨架回到置中
    const enterOverlay = useCallback(() => {
        const v = videoRef.current;
        if (v) { v.pause(); setIsPlaying(false); }
        setCoachX(0);
        setOverlayOn(true);
    }, []);

    // 把「教練骨架(0-1座標)」用相似變換套到「你這一幀的身體位置與大小」上，
    // 這樣珊瑚色教練骨架會直接疊在你身上；coachX 再做左右微調。
    const fitCoach = useCallback((gf, uf, W, H, extraX) => {
        if (!gf || !uf) return null;
        const gc = midpt(gf, 23, 24), gs = midpt(gf, 11, 12);
        const uc = midpt(uf, 23, 24), us = midpt(uf, 11, 12);
        if (!gc || !gs || !uc || !us) return null;
        const gH = Math.hypot(gs[0] - gc[0], gs[1] - gc[1]) || 1e-3;
        const uH = Math.hypot(us[0] - uc[0], us[1] - uc[1]) || 1e-3;
        const s = uH / gH;                       // 用軀幹長度對齊大小
        return (p) => {
            if (!p || !Number.isFinite(p[0])) return null;
            const nx = (p[0] - gc[0]) * s + uc[0];   // 0-1 空間，中心對到你的髖中點
            const ny = (p[1] - gc[1]) * s + uc[1];
            return [nx * W + extraX, ny * H];
        };
    }, []);

    // ── 疊合：算「這個瞬間哪個關節離教練最多」（純姿勢差，不受左右微調影響）──
    const divergence = useMemo(() => {
        if (!hasPose || !overlayOn) return null;
        const gf = goldenPose[phaseIdx] || [], uf = userPose[phaseIdx] || [];
        const gc = midpt(gf, 23, 24), gs = midpt(gf, 11, 12);
        const uc = midpt(uf, 23, 24), us = midpt(uf, 11, 12);
        if (!gc || !gs || !uc || !us) return null;
        const gH = Math.hypot(gs[0] - gc[0], gs[1] - gc[1]) || 1e-3;
        const uH = Math.hypot(us[0] - uc[0], us[1] - uc[1]) || 1e-3;
        const sc = uH / gH;
        let worst = null;
        drawIdx.forEach((i) => {
            const g = gf[i], u = uf[i];
            if (!g || !u || !Number.isFinite(g[0]) || !Number.isFinite(u[0])) return;
            const gx = (g[0] - gc[0]) * sc + uc[0], gy = (g[1] - gc[1]) * sc + uc[1];
            const d = Math.hypot(u[0] - gx, u[1] - gy);   // 0-1 正規化距離
            if (!worst || d > worst.d) worst = { i, d };
        });
        if (!worst) return null;
        return { ...worst, flagged: worst.d > 0.05, name: LM_ZH[worst.i] || `#${worst.i}` };
    }, [hasPose, overlayOn, goldenPose, userPose, drawIdx, phaseIdx]);

    // ── 疊合：畫布繪製（只畫教練珊瑚骨架，疊在你身上）────────────
    useEffect(() => {
        if (!overlayOn || !hasPose) return;
        const cvs = canvasRef.current, wrap = canvasWrapRef.current;
        if (!cvs || !wrap) return;
        const W = wrap.clientWidth, H = wrap.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        cvs.width = W * dpr; cvs.height = H * dpr;
        cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
        const ctx = cvs.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const gf = goldenPose[phaseIdx], uf = userPose[phaseIdx];
        const T = fitCoach(gf, uf, W, H, coachX);
        if (!T) return;
        const inSet = new Set(drawIdx);
        const bonesToDraw = BONES.filter(([a, b]) => inSet.has(a) && inSet.has(b));
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = C.coral; ctx.lineWidth = 4;
        ctx.shadowColor = C.coral; ctx.shadowBlur = 12;
        bonesToDraw.forEach(([a, b]) => {
            const pa = T(gf[a]), pb = T(gf[b]);
            if (!pa || !pb) return;
            ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
        });
        ctx.shadowBlur = 0;
        const wi = divergence?.flagged ? divergence.i : null;
        drawIdx.forEach((i) => {
            const p = T(gf[i]); if (!p) return;
            const bad = i === wi;
            ctx.beginPath(); ctx.arc(p[0], p[1], bad ? 7 : 4.5, 0, Math.PI * 2);
            ctx.fillStyle = bad ? C.ember : C.coral; ctx.fill();
            if (bad) { ctx.lineWidth = 2.5; ctx.strokeStyle = C.paper; ctx.stroke(); }
        });
    }, [overlayOn, hasPose, goldenPose, userPose, drawIdx, phaseIdx, coachX, divergence, fitCoach]);

    // 觸控拖曳教練骨架 = 左右微調（等同拉「教練左右對齊」軌）
    const onDragStart = useCallback((e) => {
        const t = e.touches ? e.touches[0] : e;
        dragRef.current = { sx: t.clientX, ox: coachX };
    }, [coachX]);
    const onDragMove = useCallback((e) => {
        if (!dragRef.current) return;
        const t = e.touches ? e.touches[0] : e;
        setCoachX(dragRef.current.ox + (t.clientX - dragRef.current.sx));
    }, []);
    const onDragEnd = useCallback(() => { dragRef.current = null; }, []);

    if (!activeVideoUrl) {
        return (
            <div className="min-h-[100dvh] flex flex-col items-center justify-center"
                style={{ background: C.black, fontFamily: SANS }}>
                <p style={{ color: C.paper, fontSize: 14 }}>沒有可播放的影片</p>
                <motion.button {...pressProps('row')} onClick={() => goBack()}
 style={{ marginTop: 16, color: C.coral, fontSize: 13, fontWeight: 700 }}>
                    返回
                </motion.button>
            </div>
        );
    }

    const activeSeg = mode === 'best' ? bestRep : mode === 'worst' ? worstRep : null;

    // ── 平面瑞士極簡按鈕：白底(啟用)／透明(未啟用) + 細邊 + 小色點指示模式 ──
    const MetalButton = ({ active, disabled, onClick, children, accent }) => (
        <motion.button {...pressProps('row')} onClick={onClick} disabled={disabled}
 className="flex-1 transition-colors "
 style={{
 borderRadius: 12,
 background: active ? C.paper : 'transparent',
 border: `1px solid ${active ? 'transparent' : 'rgba(246,244,241,0.16)'}`,
 color: disabled ? 'rgba(246,244,241,0.25)' : active ? C.black : 'rgba(246,244,241,0.7)',
 padding: '12px 8px', fontFamily: SANS,
 cursor: disabled ? 'not-allowed' : 'pointer',
 opacity: disabled ? 0.45 : 1, position: 'relative',
 }}>
            {active && accent && (
                <span style={{ position: 'absolute', top: 9, left: 9, width: 6, height: 6, borderRadius: '50%', background: accent }} />
            )}
            <div style={{ position: 'relative' }}>{children}</div>
        </motion.button>
    );

    return (
        <div className="min-h-[100dvh] relative overflow-hidden flex flex-col"
            style={{ background: C.black, fontFamily: SANS, maxWidth: 430, margin: '0 auto' }}>
            <style>{SCRUB_CSS}</style>

            {/* ───── Header ───── */}
            <div className="px-5 pb-4 flex items-center gap-3 z-20" style={{ paddingTop: 'max(64px, calc(env(safe-area-inset-top) + 24px))' }}>
                <motion.button {...pressProps('pill')} onClick={() => goBack()}
 className="flex items-center justify-center "
 style={{
 width: 42, height: 42, borderRadius: 12, cursor: 'pointer',
 background: C.paper, border: `1px solid ${C.pebble}`,
 flexShrink: 0, boxShadow: '0 1px 0 #fff inset, 0 2px 6px rgba(32,32,32,0.04)',
 }}>
                    <ChevronLeft size={18} color={C.black} strokeWidth={2} />
                </motion.button>
                <div style={{ flex: 1, textAlign: 'left' }}>
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: C.paper, letterSpacing: '-0.01em', lineHeight: 1.1, margin: 0 }}>
                        動作回放
                    </h1>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(246,244,241,0.55)', marginTop: 3, lineHeight: 1.35 }}>
                        {overlayOn ? '拖移教練骨架對齊自己，看哪個關節偏掉' : '逐格看自己 · 或疊上教練黃金骨架'}
                    </div>
                </div>
            </div>

            {/* ───── 模式按鈕 ───── */}
            <div className="px-5 pb-3 z-20">
                <div className="flex gap-2.5">
                    <MetalButton active={mode === 'all' && !overlayOn} accent={C.coral} onClick={switchToAll}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.01em' }}>完整影片</div>
                        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginTop: 1 }}>
                            {repSegments.length > 0 ? `${repSegments.length} 下` : '從頭看'}
                        </div>
                    </MetalButton>
                    <MetalButton active={mode === 'best' && !overlayOn} accent={C.ember} disabled={!canCompare} onClick={switchToBest}>
                        <div className="flex items-center justify-center gap-1" style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.01em' }}>
                            <Award size={13} />最佳這下
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 1, fontFamily: MONO, opacity: 0.6 }}>
                            {bestRep ? `第 ${bestRep.rep} 下 · ${Math.round(bestRep.score)} 分` : '需 2 下以上'}
                        </div>
                    </MetalButton>
                    <MetalButton active={mode === 'worst' && !overlayOn} accent={C.paper} disabled={!canCompare} onClick={switchToWorst}>
                        <div className="flex items-center justify-center gap-1" style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.01em' }}>
                            <AlertCircle size={13} />需改善
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 1, fontFamily: MONO, opacity: 0.6 }}>
                            {worstRep ? `第 ${worstRep.rep} 下 · ${Math.round(worstRep.score)} 分` : '需 2 下以上'}
                        </div>
                    </MetalButton>
                </div>
            </div>

            {/* ───── 主影片區（疊合模式時上方蓋骨架畫布）───── */}
            <div ref={canvasWrapRef} className="mx-4 relative overflow-hidden mb-3"
                style={{ borderRadius: 28, background: '#000', border: `1px solid ${C.pebble}26` }}>

                <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: '#000' }} onClick={overlayOn ? undefined : togglePlay}>
                    <video
                        ref={videoRef}
                        src={activeVideoUrl}
                        className="w-full h-full object-contain"
                        style={{ opacity: overlayOn ? 0.32 : 1 }}
                        playsInline webkit-playsinline="true" muted autoPlay
                        loop={mode === 'all' && !overlayOn}
                        onTimeUpdate={(e) => setVideoTime(e.target.currentTime)}
                        onLoadedMetadata={(e) => setDuration(e.target.duration)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onError={(e) => { console.error('Video Error:', e.nativeEvent); setIsPlaying(false); }}
                    />
                    {!isPlaying && !overlayOn && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{ background: 'rgba(22,20,21,0.32)' }}>
                            <div className="w-[68px] h-[68px] rounded-full flex items-center justify-center"
                                style={{ background: 'rgba(246,244,241,0.16)', border: `1px solid ${C.paper}40`, backdropFilter: 'blur(10px)' }}>
                                <Play size={30} color={C.paper} fill={C.paper} style={{ marginLeft: 3 }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* 骨架疊合畫布（可拖移教練骨架）*/}
                {overlayOn && hasPose && (
                    <canvas ref={canvasRef}
                        className="absolute inset-0"
                        style={{ touchAction: 'none', cursor: 'grab', zIndex: 5 }}
                        onMouseDown={onDragStart} onMouseMove={onDragMove} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}
                        onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
                    />
                )}

                {/* 影片區固定高度 */}
                <div style={{ paddingBottom: '125%' }} />

                {/* 左上角：模式徽章 */}
                <div className="absolute top-4 left-4 pointer-events-none" style={{ zIndex: 6 }}>
                    {overlayOn ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ ...BRUSH_STONE, color: C.black }}>
                            <Layers size={13} /><span style={{ fontSize: 11, fontWeight: 800 }}>骨架疊合</span>
                        </div>
                    ) : mode === 'all' ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ ...BRUSH_GUNMETAL, color: C.paper }}>
                            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.coral }} />
                            <span style={{ fontSize: 11, fontWeight: 800 }}>完整影片</span>
                        </div>
                    ) : mode === 'best' && bestRep ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ ...BRUSH_STONE, color: C.black }}>
                            <Award size={13} /><span style={{ fontSize: 11, fontWeight: 800 }}>最佳 · 第 {bestRep.rep} 下</span>
                        </div>
                    ) : mode === 'worst' && worstRep ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ ...BRUSH_EMBER, color: C.paper }}>
                            <AlertCircle size={13} /><span style={{ fontSize: 11, fontWeight: 800 }}>需改善 · 第 {worstRep.rep} 下</span>
                        </div>
                    ) : null}
                </div>

                {/* 右上角：疊合圖例 / 分數 */}
                <div className="absolute top-4 right-4 pointer-events-none" style={{ zIndex: 6 }}>
                    {overlayOn ? (
                        <div className="flex flex-col gap-1 px-3 py-2 rounded-[14px]" style={{ ...BRUSH_GUNMETAL }}>
                            <div className="flex items-center gap-1.5">
                                <div style={{ width: 14, height: 2.5, background: C.coral, borderRadius: 2, boxShadow: `0 0 6px ${C.coral}` }} />
                                <span style={{ fontSize: 11, fontWeight: 800, color: C.paper }}>教練骨架</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.ember }} />
                                <span style={{ fontSize: 11, fontWeight: 800, color: C.paper }}>差最多</span>
                            </div>
                        </div>
                    ) : activeSeg ? (
                        <div className="px-3 py-1.5 rounded-full" style={{ ...BRUSH_GUNMETAL }}>
                            <span style={{ fontSize: 13.5, fontWeight: 900, color: C.paper, fontFamily: MONO }}>
                                {Math.round(activeSeg.score)}<span style={{ fontSize: 11, opacity: 0.6, fontWeight: 700, marginLeft: 2 }}>分</span>
                            </span>
                        </div>
                    ) : repSegments.length > 0 ? (
                        <div className="px-3 py-1.5 rounded-full" style={{ ...BRUSH_GUNMETAL }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(246,244,241,0.55)' }}>第</span>
                            <span style={{ fontSize: 14, fontWeight: 900, color: C.paper, fontFamily: MONO, margin: '0 3px' }}>{currentRep}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(246,244,241,0.55)' }}>/ {repSegments.length} 下</span>
                        </div>
                    ) : null}
                </div>

                {/* 疊合模式：偏差提示（畫面中段）*/}
                {overlayOn && divergence && (
                    <div className="absolute left-1/2 pointer-events-none" style={{ top: 58, transform: 'translateX(-50%)', zIndex: 6 }}>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                            style={{
                                background: divergence.flagged ? 'rgba(217,64,48,0.92)' : 'rgba(22,20,21,0.85)',
                                border: `1px solid ${divergence.flagged ? '#8A2818' : C.pebble + '33'}`,
                                backdropFilter: 'blur(8px)',
                            }}>
                            {divergence.flagged
                                ? <AlertTriangle size={13} color={C.paper} />
                                : <Award size={13} color={C.stone} />}
                            <span style={{ fontSize: 11.5, fontWeight: 800, color: C.paper }}>
                                {divergence.flagged
                                    ? `${divergence.name} 偏離最多`
                                    : '整體貼合，姿勢到位'}
                            </span>
                        </div>
                    </div>
                )}

                {/* 疊合模式：拖移提示 */}
                {overlayOn && (
                    <div className="absolute bottom-4 left-1/2 pointer-events-none" style={{ transform: 'translateX(-50%)', zIndex: 6 }}>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                            style={{ background: 'rgba(22,20,21,0.7)', border: `1px solid ${C.pebble}22`, backdropFilter: 'blur(8px)' }}>
                            <Move size={12} color={C.pebble} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(246,244,241,0.75)' }}>拖動珊瑚色教練骨架來對齊</span>
                        </div>
                    </div>
                )}

                {/* 底部：影片軌道（frame-by-frame，兩個模式都在）*/}
                <div className="absolute bottom-0 left-0 right-0 p-4 z-10"
                    style={{ background: 'linear-gradient(to top, rgba(22,20,21,0.9), transparent)' }}
                    onClick={(e) => e.stopPropagation()}>
                    {/* 軌道標頭：講清楚這條可以拖 */}
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5" style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(246,244,241,0.72)' }}>
                            <Move size={11} color={C.coral} />
                            <span>影片軌道 · 左右拖曳看每一格</span>
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.paper }}>
                            {Math.floor(videoTime / 60)}:{Math.floor(videoTime % 60).toString().padStart(2, '0')}
                            <span style={{ opacity: 0.5 }}> / {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <motion.button {...pressProps('icon')} onClick={() => stepFrame(-1)}
 className="flex items-center justify-center"
 style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(246,244,241,0.16)', border: `1px solid ${C.paper}33`, flexShrink: 0 }}>
                            <SkipBack size={15} color={C.paper} fill={C.paper} />
                        </motion.button>
                        <input type="range" min="0" max="1000"
                            value={duration ? (videoTime / duration) * 1000 : 0}
                            onChange={(e) => {
                                const t = (e.target.value / 1000) * duration;
                                setVideoTime(t);
                                const v = videoRef.current;
                                if (v) { v.pause(); v.currentTime = t; }
                                setIsPlaying(false);
                            }}
                            className={`drvn-scrub flex-1${videoTime < 0.05 ? ' drvn-nudge' : ''}`}
                            style={{ '--trk': `linear-gradient(90deg, ${C.coral} 0%, ${C.coral} ${duration ? (videoTime / duration) * 100 : 0}%, rgba(246,244,241,0.22) ${duration ? (videoTime / duration) * 100 : 0}%)` }}
                        />
                        <motion.button {...pressProps('icon')} onClick={() => stepFrame(1)}
 className="flex items-center justify-center"
 style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(246,244,241,0.16)', border: `1px solid ${C.paper}33`, flexShrink: 0 }}>
                            <SkipForward size={15} color={C.paper} fill={C.paper} />
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* ───── 疊合控制：開關 + 教練左右對齊軌 ───── */}
            {hasPose ? (
                <div className="px-4 pb-3">
                    <div className="px-4 py-3" style={{
                        background: overlayOn ? 'rgba(233,97,63,0.08)' : 'rgba(246,244,241,0.045)',
                        border: `1px solid ${overlayOn ? C.coral + '44' : C.pebble + '26'}`, borderRadius: 18,
                    }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2" style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: overlayOn ? C.coral : C.pebble, textTransform: 'uppercase' }}>
                                <Layers size={12} />教練黃金骨架疊合
                            </div>
                            <motion.button {...pressProps('pill')} onClick={() => (overlayOn ? setOverlayOn(false) : enterOverlay())}
 style={{
 fontSize: 11, fontWeight: 800, padding: '5px 12px', borderRadius: 999,
 background: overlayOn ? C.coral : 'transparent',
 color: overlayOn ? C.paper : C.coral,
 border: `1px solid ${C.coral}${overlayOn ? '' : '66'}`, cursor: 'pointer',
 }}>
                                {overlayOn ? '關閉疊合' : '開始疊合'}
                            </motion.button>
                        </div>

                        {overlayOn ? (
                            <>
                                {/* 教練左右對齊軌（置中預設）*/}
                                <div className="flex items-center gap-2.5" style={{ marginTop: 14 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(246,244,241,0.55)', minWidth: 16, textAlign: 'center' }}>左</span>
                                    <input type="range" min="-120" max="120" value={coachX}
                                        onChange={(e) => setCoachX(Number(e.target.value))}
                                        className="drvn-scrub flex-1"
                                        style={{ '--trk': 'rgba(246,244,241,0.22)' }}
                                    />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(246,244,241,0.55)', minWidth: 16, textAlign: 'center' }}>右</span>
                                    <motion.button {...pressProps('pill')} onClick={() => setCoachX(0)}
 style={{ fontSize: 11, fontWeight: 800, color: C.pebble, padding: '4px 9px', borderRadius: 8, border: `1px solid ${C.pebble}44`, background: 'transparent', flexShrink: 0 }}>
                                        置中
                                    </motion.button>
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(246,244,241,0.5)', marginTop: 9, lineHeight: 1.55 }}>
                                    <span style={{ color: C.coral, fontWeight: 700 }}>珊瑚線＝教練</span>，已自動貼到你身上。滑<span style={{ fontWeight: 700 }}>影片軌道</span>換動作瞬間、拉這條左右對齊；只畫這個角度量得到的 {drawIdx.length} 個關節。
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: 11, color: 'rgba(246,244,241,0.55)', marginTop: 10, lineHeight: 1.5 }}>
                                開始疊合後，教練骨架會疊在你身上；滑影片看自己、拉軌把教練左右對齊，紅點就是差最多的關節。
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="px-4 pb-3">
                    <div className="px-4 py-3 flex gap-2.5 items-start" style={{ background: 'rgba(246,244,241,0.045)', border: `1px solid ${C.pebble}26`, borderRadius: 18 }}>
                        <Layers size={14} color={C.pebble} style={{ flexShrink: 0, marginTop: 1 }} />
                        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(246,244,241,0.7)' }}>
                            這支影片還沒有黃金骨架軌跡。用「<span style={{ color: C.coral, fontWeight: 700 }}>建模模式</span>」重新跑一次同一個角度，就能拖移教練骨架跟自己疊合比對。
                        </div>
                    </div>
                </div>
            )}

            {/* ───── 疊合偏差細節卡 ───── */}
            {overlayOn && divergence && (
                <div className="px-4 pb-3">
                    <div className="px-4 py-3 flex gap-3" style={{
                        background: divergence.flagged ? 'rgba(217,64,48,0.10)' : 'rgba(246,244,241,0.045)',
                        border: `1px solid ${divergence.flagged ? C.ember + '55' : C.pebble + '26'}`, borderRadius: 18,
                    }}>
                        <div style={{ width: 28, height: 28, borderRadius: 12, flexShrink: 0, background: divergence.flagged ? C.ember : 'rgba(246,244,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {divergence.flagged ? <AlertTriangle size={14} color={C.paper} /> : <Award size={14} color={C.stone} />}
                        </div>
                        <div style={{ flex: 1, lineHeight: 1.45 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: C.paper, marginBottom: 3 }}>
                                {divergence.flagged ? `對齊後，${divergence.name} 離教練最遠` : '骨架整體貼合教練'}
                            </div>
                            <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(246,244,241,0.70)' }}>
                                {divergence.flagged
                                    ? `在這個動作瞬間，${divergence.name}的位置和教練差最多——先把它對正到珊瑚線，再看是不是角度或深度沒到位。`
                                    : '把教練骨架對正後，各關節都落在相近位置，這個動作瞬間姿勢正確。'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ───── 修正建議卡 ───── */}
            {!overlayOn && activeCorrection && activeCorrection.severity > 0 && (
                <div className="px-4 pb-3">
                    <div className="px-4 py-3 flex gap-3" style={{
                        background: activeCorrection.severity === 2 ? 'rgba(217,64,48,0.10)' : 'rgba(246,244,241,0.045)',
                        border: `1px solid ${activeCorrection.severity === 2 ? C.ember + '55' : C.pebble + '26'}`, borderRadius: 18,
                    }}>
                        <div style={{ width: 28, height: 28, borderRadius: 12, flexShrink: 0, background: activeCorrection.severity === 2 ? C.ember : 'rgba(246,244,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {activeCorrection.severity === 2 ? <AlertTriangle size={14} color={C.paper} /> : <AlertCircle size={14} color={C.coral} />}
                        </div>
                        <div style={{ flex: 1, lineHeight: 1.45 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: C.paper, marginBottom: 3, letterSpacing: '-0.01em' }}>
                                {activeCorrection.title_zh}
                                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: activeCorrection.severity === 2 ? C.coral : C.pebble, fontFamily: MONO }}>
                                    {Math.round(activeCorrection.score)} 分
                                </span>
                            </div>
                            <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(246,244,241,0.70)', marginBottom: 4 }}>
                                {activeCorrection.desc_zh}
                            </div>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.paper, borderTop: '1px solid rgba(246,244,241,0.10)', paddingTop: 6, marginTop: 4 }}>
                                <span style={{ color: C.coral, marginRight: 5 }}>→ 修正：</span>{activeCorrection.fix_zh}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ───── 差距卡 ───── */}
            {!overlayOn && canCompare && (
                <div className="px-4 pb-3">
                    <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(246,244,241,0.045)', border: `1px solid ${C.pebble}26`, borderRadius: 18 }}>
                        <div className="flex items-center gap-2 flex-1">
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.stone, boxShadow: `0 0 0 2px ${C.pebble}55` }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.paper }}>第 {bestRep.rep} 下</span>
                            <span style={{ fontSize: 11, color: 'rgba(246,244,241,0.4)' }}>vs</span>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.coral, boxShadow: `0 0 0 2px ${C.ember}55` }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.paper }}>第 {worstRep.rep} 下</span>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.coral, fontFamily: MONO, letterSpacing: '-0.01em' }}>
                            差 {deltaScore} 分
                        </div>
                    </div>
                </div>
            )}

            {/* ───── 骨架圖示說明 ───── */}
            <div className="px-4 pb-5">
                <div className="px-4 py-3" style={{ background: 'rgba(246,244,241,0.045)', border: `1px solid ${C.pebble}26`, borderRadius: 18 }}>
                    <div className="flex items-center gap-2 mb-2" style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: C.pebble, textTransform: 'uppercase' }}>
                        <div style={{ width: 12, height: 1.5, background: C.pebble }} />如何看骨架
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <div style={{ width: 18, height: 2, background: C.coral, borderRadius: 1, boxShadow: `0 0 6px ${C.coral}` }} />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(246,244,241,0.8)' }}>珊瑚線 = 教練黃金骨架（影片裡的你＝比對對象）</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.ember, boxShadow: `0 0 8px ${C.ember}88` }} />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(246,244,241,0.8)' }}>紅點 = 這個關節偏離最多</span>
                    </div>
                </div>
            </div>

            {!canCompare && repSegments.length > 0 && !overlayOn && (
                <div className="px-4 pb-5">
                    <div className="px-4 py-3" style={{ borderRadius: 18, background: 'rgba(246,244,241,0.06)', border: `1px solid ${C.pebble}26`, color: 'rgba(246,244,241,0.6)', fontSize: 12, lineHeight: 1.55 }}>
                        這次只做了 {repSegments.length} 下 — 至少 2 下以上才能挑出「最佳」跟「需改善」。
                    </div>
                </div>
            )}
        </div>
    );
};

export default ARViewMobile;
