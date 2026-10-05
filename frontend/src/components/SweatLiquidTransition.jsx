import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '../utils/haptics';
// matter-js loaded on-demand inside useEffect (bundle-dynamic-imports)

const LETTER_FINAL_RATIOS = [0.82, 0.88, 0.94, 1.0];

// ── 模組層級：震動 & 音效工具（可從 Matter.js 引擎內直接呼叫）────────
const triggerHaptic = (type = 'medium', pulses = 1) => { for (let i = 0; i < pulses; i++) setTimeout(() => haptic(type), i * 90); };

const SweatLiquidTransition = ({ isActive, onComplete }) => {
  const [phase, setPhase] = useState(0);

  const soRef = useRef(null);
  const rushRef = useRef(null);
  const letterRefs = useRef([null, null, null, null]);
  const canvasRef = useRef(null);   // SO 粒子 canvas
  const rushCanvasRef = useRef(null);  // RUSH 速度拖尾 canvas
  const phaseRef = useRef(phase);
  const impactedRef = useRef(false);

  const soParticles = useRef([]);
  const rushTrails = useRef([]);      // 速度線條段
  const sweatParticles = useRef([]); // 汗水粒子
  const soAnimRef = useRef(null);
  const rushAnimRef = useRef(null);
  const sweatAnimRef = useRef(null);
  const sweatCanvasRef = useRef(null);
  const bulletTimeScaleRef = useRef(1); // 同步 Matter.js timeScale 給 canvas loop 用
  const sweatQuickFadeRef = useRef(false); // phase 5 時強制快速消失
  const soCanvasPositionRef = useRef({ x: 0, y: 9999 }); // SO 目前位置，供 canvas 繪製波浪

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── SO 粒子系統 ───────────────────────────────────────────
  const spawnBurst = (x, y, count = 28) => {
    const colors = ['#FF7F50', '#FF5733', '#FFB347', '#F95C4B', '#FFA07A', '#FFFFFF'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 5.5;
      soParticles.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.012 + Math.random() * 0.018,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  };

  const spawnTrailSO = (x, y) => {
    const colors = ['#FF7F50', '#FF5733', '#FFB347'];
    for (let i = 0; i < 4; i++) {
      soParticles.current.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        life: 0.6 + Math.random() * 0.4,
        decay: 0.025 + Math.random() * 0.02,
        size: 1.5 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  };

  // ── 海浪噴濺粒子（SO 上升時從兩側噴出的水花）──────────────
  const spawnWaveSplash = (x, y) => {
    const waveColors = ['#FFFFFF', '#C8F0FF', '#87CEEB', '#B0E8FF', '#DFFFFF', '#E0FFFF'];
    // 左右各噴一組水花
    for (let s = -1; s <= 1; s += 2) {
      const count = 10;
      for (let i = 0; i < count; i++) {
        const hAngle = s * (Math.PI * 0.08 + Math.random() * Math.PI * 0.35); // 偏水平角
        const speed = 3.5 + Math.random() * 9;
        soParticles.current.push({
          x: x + s * (10 + Math.random() * 30),
          y: y + 50 + Math.random() * 30,
          vx: Math.cos(hAngle) * speed,
          vy: -Math.abs(Math.sin(hAngle)) * speed * 0.7, // 略微向上
          life: 0.65 + Math.random() * 0.5,
          decay: 0.018 + Math.random() * 0.016,
          size: 3 + Math.random() * 9,
          color: waveColors[Math.floor(Math.random() * waveColors.length)],
        });
      }
    }
    // 正上方少量水柱粒子
    for (let i = 0; i < 5; i++) {
      soParticles.current.push({
        x: x + (Math.random() - 0.5) * 60,
        y: y + 40,
        vx: (Math.random() - 0.5) * 3,
        vy: -(4 + Math.random() * 7),
        life: 0.5 + Math.random() * 0.4,
        decay: 0.02 + Math.random() * 0.015,
        size: 4 + Math.random() * 7,
        color: '#FFFFFF',
      });
    }
  };

  const runSOParticles = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── 在 SO 下方畫動態波浪弧線（phase 2 上升過程）──────────
    if (phaseRef.current === 2) {
      // ── 波浪圓弧漣漪已移除 ──
    }

    soParticles.current = soParticles.current.filter(p => p.life > 0);
    soParticles.current.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life * 0.9);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.04; p.vx *= 0.97;
      p.life -= p.decay;
    });
    ctx.globalAlpha = 1;
    if ((phaseRef.current >= 1 && phaseRef.current <= 3) || soParticles.current.length > 0) {
      soAnimRef.current = requestAnimationFrame(runSOParticles);
    }
  };

  // ── RUSH 速度拖尾系統 ─────────────────────────────────────
  // 每幀在 rushBody 左側噴射水平速度線段 + 殘影粒子
  const spawnRushTrail = (x, y, speed) => {
    const intensity = Math.min(1, speed / 70);
    // 速度線段：從 rushBody 左側往左延伸
    const lineCount = Math.floor(4 + intensity * 8);
    for (let i = 0; i < lineCount; i++) {
      const offsetY = (Math.random() - 0.5) * 140;
      const length = 40 + Math.random() * 180 * intensity;
      rushTrails.current.push({
        type: 'line',
        x1: x - 20,
        y1: y + offsetY,
        x2: x - 20 - length,
        y2: y + offsetY + (Math.random() - 0.5) * 4,
        life: 0.5 + Math.random() * 0.4,
        decay: 0.06 + Math.random() * 0.04,
        width: 0.8 + Math.random() * 2.5 * intensity,
        color: i % 3 === 0 ? '#FF5733' : i % 3 === 1 ? '#161415' : '#FF7F50',
      });
    }
    // 殘影粒子
    const pCount = Math.floor(3 + intensity * 6);
    for (let i = 0; i < pCount; i++) {
      rushTrails.current.push({
        type: 'dot',
        x: x - Math.random() * 120 * intensity,
        y: y + (Math.random() - 0.5) * 100,
        vx: -(0.5 + Math.random() * 2),
        vy: (Math.random() - 0.5) * 0.8,
        life: 0.4 + Math.random() * 0.4,
        decay: 0.05 + Math.random() * 0.04,
        size: 1 + Math.random() * 3,
        color: Math.random() > 0.5 ? '#FF5733' : '#161415',
      });
    }
  };

  const runRushTrails = () => {
    const canvas = rushCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    rushTrails.current = rushTrails.current.filter(t => t.life > 0);
    rushTrails.current.forEach(t => {
      ctx.globalAlpha = Math.max(0, t.life);
      if (t.type === 'line') {
        ctx.strokeStyle = t.color;
        ctx.lineWidth = t.width;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
        t.x1 -= 1; t.x2 -= 1;
      } else {
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.size * t.life, 0, Math.PI * 2);
        ctx.fill();
        t.x += t.vx; t.y += t.vy;
      }
      t.life -= t.decay;
    });
    ctx.globalAlpha = 1;
    if ((phaseRef.current === 4) || rushTrails.current.length > 0) {
      rushAnimRef.current = requestAnimationFrame(runRushTrails);
    }
  };


  // ── 汗水粒子系統（子彈時間期間四面八方噴灑）──────────────
  const spawnSweatBurst = (x, y) => {
    const colors = [
      [220, 240, 255], [180, 220, 255], [255, 255, 255],
      [160, 210, 240], [200, 235, 255], [140, 195, 230],
    ];
    const count = 55;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
      const speed = 2.5 + Math.random() * 7;
      const c = colors[Math.floor(Math.random() * colors.length)];
      sweatParticles.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        // 緩慢 decay → 子彈時間下生命夠長、時間恢復後快速飛散消失
        decay: 0.004 + Math.random() * 0.003,
        size: 2 + Math.random() * 5,
        streakLen: 12 + Math.random() * 28,
        r: c[0], g: c[1], b: c[2],
      });
    }
  };

  const runSweatParticles = () => {
    const canvas = sweatCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const btScale = bulletTimeScaleRef.current; // 0.05 (子彈時間) ~ 1.0 (正常)

    sweatParticles.current = sweatParticles.current.filter(p => p.life > 0);
    sweatParticles.current.forEach(p => {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      // 子彈時間：短拖尾（慢速感）；正常速度：長拖尾（飛散感）
      const trailMult = 0.4 + btScale * 3.5;
      const tx = p.x - (p.vx / speed) * p.streakLen * trailMult * p.life;
      const ty = p.y - (p.vy / speed) * p.streakLen * trailMult * p.life;

      // 水滴拖尾：頭部實心、尾部透明
      const grad = ctx.createLinearGradient(tx, ty, p.x, p.y);
      grad.addColorStop(0, `rgba(${p.r},${p.g},${p.b},0)`);
      grad.addColorStop(1, `rgba(${p.r},${p.g},${p.b},${(p.life * 0.85).toFixed(2)})`);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = p.size * p.life * 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // 粒子頭部加一個實心小圓（更像水滴）
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${(p.life * 0.7).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // 位移與 decay 都乘以 btScale → 子彈時間內慢動作
      p.x += p.vx * btScale;
      p.y += p.vy * btScale;
      p.vy += 0.025 * btScale; // 重力
      // phase 5：sweatQuickFadeRef → 10 倍速消失，與 RUSH 飛出同步
      const fadeBoost = sweatQuickFadeRef.current ? 10 : 1;
      p.life -= p.decay * Math.max(btScale, 0.025) * fadeBoost;
    });

    if (sweatParticles.current.length > 0) {
      sweatAnimRef.current = requestAnimationFrame(runSweatParticles);
    }
  };

  // ── Phase 控制 ────────────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      setPhase(1);
      impactedRef.current = false;
      soParticles.current = [];
      rushTrails.current = [];

      // SO 從下方衝出 → 持續震動 3 pulses
      setTimeout(() => { setPhase(2); triggerHaptic('medium', 3); }, 600);
      setTimeout(() => setPhase(3), 2400);
      // RUSH 由左至右衝入 → 強震動 4 pulses
      setTimeout(() => { setPhase(4); triggerHaptic('heavy', 4); }, 3400);
      // RUSH 飛出螢幕 → 震動 + 汗水/貝茲曲線同步消失
      setTimeout(() => {
        setPhase(5);
        triggerHaptic('heavy', 2);
        sweatQuickFadeRef.current = true; // 汗水快速淡出
      }, 5700);
      setTimeout(() => { setPhase(0); if (onComplete) onComplete(); }, 6600);
    }
  }, [isActive, onComplete]);

  useEffect(() => {
    if (phase >= 1 && phase <= 3) {
      soAnimRef.current = requestAnimationFrame(runSOParticles);
    }
    if (phase === 4) {
      rushAnimRef.current = requestAnimationFrame(runRushTrails);
    }
    return () => {
      if (soAnimRef.current) cancelAnimationFrame(soAnimRef.current);
      if (rushAnimRef.current) cancelAnimationFrame(rushAnimRef.current);
    };
  }, [phase]);

  // ── Matter.js ─────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

    let cleanup = () => {};
    import('matter-js').then(({ default: Matter }) => {
    const engine = Matter.Engine.create();
    engine.world.gravity.y = 0;
    engine.world.gravity.x = 0;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const targetX = screenW / 2;
    const targetY = screenH / 2;
    const startX = -1000;

    const FONT_MIN = 16;
    const FONT_MAX = screenW >= 640 ? 220 : 160;

    const state = {
      fired: false, impacted: false, impactRealTime: 0,
      rushPrevScale: 0.1, rushCurrentScale: 0.1,
      soCurrentScale: 1.0,
      bulletTimeDelay: false, // 撞擊後延遲進入慢動作
      bulletTimeStart: 0,     // 慢動作真正開始的 real time
      isBulletTime: false,
      soReachedCenter: false, lastTrailY: screenH + 400,
      lastWaveSplashY: screenH + 400, // 上次噴水花時的 Y 座標
      phase3Burst: false, lastRushX: startX,
    };

    const soBody = Matter.Bodies.rectangle(targetX, screenH + 400, 280, 120, {
      frictionAir: 0.08, restitution: 0.1, density: 0.001
    });
    const rushBody = Matter.Bodies.rectangle(startX, targetY, 600, 200, {
      collisionFilter: { mask: 0 }, isStatic: false, mass: 99999, frictionAir: 0
    });

    Matter.World.add(engine.world, [soBody, rushBody]);
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    Matter.Events.on(engine, 'beforeUpdate', () => {
      const p = phaseRef.current;
      Matter.Body.setAngle(rushBody, 0);

      // 每幀同步 SO 位置給 canvas wave 繪製用
      soCanvasPositionRef.current = { x: soBody.position.x, y: soBody.position.y };

      // ── SO phase 2: 上升 + 粒子 ──
      if (p === 2) {
        const distY = targetY - soBody.position.y;
        if (Math.abs(distY) > 2) Matter.Body.setVelocity(soBody, { x: 0, y: distY * 0.08 });
        else Matter.Body.setPosition(soBody, { x: targetX, y: targetY });
        if (state.soCurrentScale < 1.3) state.soCurrentScale += 0.002;
        const dy = Math.abs(soBody.position.y - state.lastTrailY);
        if (dy > 15) { spawnTrailSO(soBody.position.x, soBody.position.y + 60); state.lastTrailY = soBody.position.y; }
        // 每上升 10px 噴一次海浪水花
        const wdy = Math.abs(soBody.position.y - state.lastWaveSplashY);
        if (wdy > 10) { spawnWaveSplash(soBody.position.x, soBody.position.y); state.lastWaveSplashY = soBody.position.y; }
        if (!state.soReachedCenter && Math.abs(soBody.position.y - targetY) < 30) {
          state.soReachedCenter = true;
          spawnBurst(targetX, targetY);
          // ★ SO 粒子爆發 → 震動 2 pulses
          triggerHaptic('heavy', 2);
        }
      }

      if (p === 3) {
        Matter.Body.setPosition(soBody, { x: targetX, y: targetY });
        if (!state.phase3Burst) {
          state.phase3Burst = true;
          spawnBurst(targetX, targetY);
          // ★ phase3 粒子爆發 → 震動 2 pulses
          triggerHaptic('medium', 2);
        }
      }

      // ── RUSH phase 4: 衝入 + 速度拖尾 ──
      if (p === 4) {
        if (!state.fired) {
          Matter.Body.setPosition(rushBody, { x: startX, y: targetY });
          state.fired = true;
        } else if (!state.impacted) {
          Matter.Body.setPosition(rushBody, { x: rushBody.position.x + 70, y: targetY });
          const progress = Math.max(0, Math.min(1, (rushBody.position.x - startX) / (targetX - startX)));
          state.rushCurrentScale = 0.1 + (1.5 * Math.pow(progress, 4.0));
          const scaleDelta = state.rushCurrentScale / state.rushPrevScale;
          Matter.Body.scale(rushBody, scaleDelta, scaleDelta);
          state.rushPrevScale = state.rushCurrentScale;

          const fontSize = FONT_MIN + (FONT_MAX - FONT_MIN) * Math.pow(progress, 2.5);
          if (!impactedRef.current) {
            letterRefs.current.forEach(el => { if (el) el.style.fontSize = `${fontSize}px`; });
          }

          // 速度拖尾：每幀根據移動距離噴射
          const dx = rushBody.position.x - state.lastRushX;
          if (dx > 0) {
            spawnRushTrail(rushBody.position.x, rushBody.position.y, dx);
            state.lastRushX = rushBody.position.x;
          }

          if (rushBody.position.x >= targetX - 30) {
            Matter.Body.setPosition(rushBody, { x: targetX, y: targetY });
            rushBody.collisionFilter.mask = 0xFFFFFFFF;
            soBody.frictionAir = 0.005;
            Matter.Body.setVelocity(soBody, { x: 1.2, y: -0.3 });
            Matter.Body.setAngularVelocity(soBody, 0.008);
            Matter.Body.setVelocity(rushBody, { x: 0, y: 0 });
            // ★ 先保持正常速度讓汗水快速噴濺，280ms 後才進子彈時間
            engine.timing.timeScale = 1;
            bulletTimeScaleRef.current = 1;
            state.impacted = true;
            state.bulletTimeDelay = true; // 預告要進慢動作
            state.isBulletTime = false;
            state.impactRealTime = Date.now();
            impactedRef.current = true;
            // ★ RUSH 撞擊 SO → 強力震動 5 pulses（最大衝擊感）
            triggerHaptic('heavy', 5);
            // ★ 汗水先快速噴濺
            spawnSweatBurst(targetX, targetY);
            sweatAnimRef.current = requestAnimationFrame(runSweatParticles);
            // 撞擊時：切換遞減字體
            LETTER_FINAL_RATIOS.forEach((ratio, i) => {
              if (letterRefs.current[i]) {
                letterRefs.current[i].style.fontSize = `${FONT_MAX * ratio}px`;
                letterRefs.current[i].style.transition = 'font-size 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
              }
            });
            // 撞擊爆散：在 rush canvas 上噴射爆炸拖尾
            for (let b = 0; b < 40; b++) {
              const angle = (Math.PI * 2 * b) / 40;
              const spd = 3 + Math.random() * 8;
              rushTrails.current.push({
                type: 'dot',
                x: targetX, y: targetY,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd * 0.5,
                life: 0.8 + Math.random() * 0.4,
                decay: 0.02 + Math.random() * 0.02,
                size: 2 + Math.random() * 4,
                color: b % 2 === 0 ? '#FF5733' : '#161415',
              });
            }
          }
        } else {
          Matter.Body.setPosition(rushBody, { x: targetX, y: targetY });
          Matter.Body.setVelocity(rushBody, { x: 0, y: 0 });

          const realElapsed = Date.now() - state.impactRealTime;

          // 280ms 後：汗水已快速噴出，現在進入子彈時間慢動作
          if (state.bulletTimeDelay && realElapsed > 280) {
            engine.timing.timeScale = 0.05;
            bulletTimeScaleRef.current = 0.05;
            state.bulletTimeDelay = false;
            state.isBulletTime = true;
            state.bulletTimeStart = Date.now();
          }

          if (state.isBulletTime) {
            if (state.soCurrentScale < 3.2) state.soCurrentScale += 0.02;
            // 慢動作持續 1200ms real time 後恢復
            if (Date.now() - state.bulletTimeStart > 1200) {
              engine.timing.timeScale = 1;
              bulletTimeScaleRef.current = 1;
              state.isBulletTime = false;
              Matter.Body.setVelocity(soBody, { x: 3.5, y: -0.8 });
              Matter.Body.setAngularVelocity(soBody, 0.02);
            }
          }
        }
      }

      if (p === 5) { engine.timing.timeScale = 1; Matter.Body.setVelocity(rushBody, { x: 130, y: 0 }); }

      if (soRef.current) {
        const shake = state.isBulletTime ? (Math.random() - 0.5) * 12 : 0;
        soRef.current.style.transform = `translate(calc(-50% + ${soBody.position.x - targetX + shake}px), calc(-50% + ${soBody.position.y - targetY + shake}px)) rotate(${soBody.angle}rad) scale(${state.soCurrentScale})`;
      }
      if (rushRef.current) {
        rushRef.current.style.opacity = p >= 4 ? "1" : "0";
        rushRef.current.style.transform = `translate(calc(-50% + ${rushBody.position.x - targetX}px), calc(-50% + ${rushBody.position.y - targetY}px))`;
      }
    });

    cleanup = () => {
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      engine.timing.timeScale = 1;
      bulletTimeScaleRef.current = 1;
      sweatQuickFadeRef.current = false;
      if (sweatAnimRef.current) cancelAnimationFrame(sweatAnimRef.current);
    };
    }); // end import('matter-js').then
    return () => cleanup();
  }, [isActive]);

  const verticalLanes = [
    { id: 'v1', color: '#161415', x: 880 },
    { id: 'v2', color: '#FF5733', x: 1000 },
    { id: 'v3', color: '#161415', x: 1120 },
  ];

  // 貝茲曲線：迴圈中心對齊 SVG viewBox 中心 y=250（即畫面中央）
  // 上下幅度各 350px，比之前更大；三條線 offset 讓中間橘線正好穿過 RUSH 文字
  // 迴圈圓心從 x=900 往左移到 x=750，讓環偏左
  const loopPath = "M 0 250 L 550 250 C 950 250, 950 -100, 750 -100 C 550 -100, 550 600, 750 600 C 950 600, 950 250, 2000 250";
  const loopLanes = [
    { id: 'l1', color: '#161415', offset: -55 },
    { id: 'l2', color: '#FF5733', offset: 0 },
    { id: 'l3', color: '#161415', offset: 55 },
  ];

  const wavePath = "M 0 200 L 0 100 Q 150 0, 300 100 T 600 100 T 900 100 T 1200 100 T 1500 100 T 1800 100 T 2100 100 T 2400 100 L 2400 200 Z";
  const rushLetters = ['R', 'U', 'S', 'H'];

  return (
    <AnimatePresence>
      {phase > 0 && (
        <motion.div
          className="fixed inset-0 z-[9999999] bg-[#F8F8F0] overflow-hidden flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(4px)' }}
          transition={{ duration: 0.5 }}
        >
          {/* 雜訊紋理 */}
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none mix-blend-multiply z-0"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />

          {/* 波浪層 z-10 */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            <motion.div className="absolute bottom-0 left-0 w-[200vw] h-[130dvh] flex flex-col"
              initial={{ y: '100%' }}
              animate={phase <= 2 ? { y: phase >= 2 ? '-10%' : '100%', x: phase >= 2 ? '-50%' : '0%' } : { opacity: 0 }}
              transition={{ y: { duration: 2.0, ease: [0.16, 1, 0.3, 1] }, x: { duration: 2.8, ease: "linear" } }}>
              <svg viewBox="0 0 2400 200" preserveAspectRatio="none" className="w-full h-[10dvh] sm:h-[15dvh] -mb-[1px]">
                <path fill="#F95C4B" d={wavePath} />
              </svg>
              <div className="flex-1 w-full bg-[#F95C4B]" />
            </motion.div>
            <motion.div className="absolute bottom-0 left-0 w-[200vw] h-[130dvh] flex flex-col"
              initial={{ y: '100%' }}
              animate={phase <= 2 ? { y: phase >= 2 ? '-10%' : '100%', x: phase >= 2 ? '0%' : '-50%' } : { opacity: 0 }}
              transition={{ y: { duration: 2.0, ease: [0.16, 1, 0.3, 1], delay: 0.15 }, x: { duration: 2.8, ease: "linear", delay: 0.15 } }}>
              <svg viewBox="0 0 2400 200" preserveAspectRatio="none" className="w-full h-[10dvh] sm:h-[15dvh] -mb-[1px]">
                <path fill="#F8F8F0" d={wavePath} />
              </svg>
              <div className="flex-1 w-full bg-[#F8F8F0]" />
            </motion.div>
          </div>

          {/* SO 粒子 canvas z-25 */}
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 25 }} width={window.innerWidth} height={window.innerHeight} />

          {/* RUSH 速度拖尾 canvas z-45（在貝茲曲線 context 上方） */}
          <canvas ref={rushCanvasRef} className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 45 }} width={window.innerWidth} height={window.innerHeight} />

          {/* 汗水粒子 canvas z-55（最頂層，子彈時間慢動作噴灑） */}
          <canvas ref={sweatCanvasRef} className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 55 }} width={window.innerWidth} height={window.innerHeight} />

          {/* Context A（z-20）：垂直軌道 + SO */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20, isolation: 'isolate', overflow: 'visible' }}>
            <svg viewBox="0 0 2000 1000" className="absolute w-full h-full">
              {(phase === 1 || phase === 2) && verticalLanes.map((lane) => (
                <motion.path key={lane.id}
                  d={`M ${lane.x} 4000 L ${lane.x} -4000`}
                  fill="transparent" stroke={lane.color} strokeLinecap="round"
                  initial={{ pathLength: 0, strokeWidth: 4 }}
                  animate={{ pathLength: 1, strokeWidth: phase >= 2 ? 120 : 4 }}
                  transition={{ pathLength: { duration: 0.5, ease: "easeOut" }, strokeWidth: { duration: 1.5, ease: [0.16, 1, 0.3, 1] } }}
                />
              ))}
            </svg>
            <div ref={soRef}
              className="absolute flex flex-col items-center justify-center text-center overflow-visible pointer-events-none"
              style={{ left: '50%', top: '50%', mixBlendMode: 'difference' }}>
              <p className="text-[12px] sm:text-[14px] font-bold uppercase tracking-[0.5em] mb-2 pl-3"
                style={{ color: '#FF7F50' }}>DVRN LAB</p>
              <h2 className="text-[80px] sm:text-[130px] leading-none px-12 py-10 font-black uppercase tracking-tighter italic whitespace-nowrap overflow-visible"
                style={{ color: '#FF7F50' }}>SO</h2>
            </div>
          </div>

          {/* Context B（z-40）：貝茲曲線 + RUSH — 曲線中心對齊畫面中央 */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 40, isolation: 'isolate' }}>
            {/*
              SVG viewBox: "0 0 2000 500" — 把 y=250 對應到容器中心
              容器用 height: 100dvh，top/left 50% translate -50%
              這樣 loopPath 的 y=250 就正好在畫面垂直中央
              上下幅度 ±350px（viewBox 單位），在 160vw 容器裡視覺上很大
            */}
            <div className="absolute pointer-events-none"
              style={{
                width: '180vw', height: '100dvh',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <svg viewBox="0 0 2000 500"
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full"
                style={{ transform: 'skewX(-8deg)', overflow: 'visible' }}>
                <AnimatePresence>
                  {phase === 4 && loopLanes.map((lane) => (
                    <motion.path key={lane.id}
                      d={loopPath}
                      fill="transparent"
                      stroke={lane.color}
                      strokeWidth="55"
                      strokeLinecap="round"
                      style={{ transform: `translateY(${lane.offset}px)` }}
                      initial={{ pathLength: 0, opacity: 1 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
                      transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
                    />
                  ))}
                </AnimatePresence>
              </svg>
            </div>

            <div ref={rushRef}
              className="absolute flex flex-col items-start overflow-visible pointer-events-none"
              style={{ left: '50%', top: '50%', opacity: 0, mixBlendMode: 'difference' }}>
              <p className="font-bold uppercase tracking-[0.5em] mb-1 pl-1 whitespace-nowrap"
                style={{ color: '#00A8E0ff', fontSize: '13px' }}>DVRN LAB</p>
              <div className="flex items-baseline overflow-visible" style={{ gap: 0 }}>
                {rushLetters.map((char, i) => (
                  <span key={char}
                    ref={el => { letterRefs.current[i] = el; }}
                    className="font-black uppercase italic leading-none overflow-visible"
                    style={{
                      color: '#B7DCDCff', fontSize: '16px',
                      display: 'inline-block', verticalAlign: 'baseline',
                      transformOrigin: 'bottom center', letterSpacing: '-0.02em',
                    }}>
                    {char}
                  </span>
                ))}
              </div>
            </div>
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SweatLiquidTransition;