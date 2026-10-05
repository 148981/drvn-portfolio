import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '../utils/haptics';
// matter-js loaded on-demand inside useEffect (bundle-dynamic-imports)

// ─── Haptic bridge: 三層 fallback ───────────────────────────────────────────
// 1. window.webkit.messageHandlers.haptic   → 新的獨立 handler (Xcode rebuild 後生效)
// 2. window.webkit.messageHandlers.fitnessApp → 舊的 fitnessApp handler (立即可用)
// 3. navigator.vibrate                       → Android / Web fallback
const triggerCollisionHaptic = (intensity = 'light') => haptic(intensity);

const WorkoutCompleteTransition = ({ isActive, totalVolume, totalSets, onComplete }) => {
    const [phase, setPhase] = useState('idle');
    const engineRef = useRef(null);
    const runnerRef = useRef(null);
    const lastHapticTimeRef = useRef(0); // throttle: min 80 ms between haptics

    // 用來儲存實體 DOM 節點的參照，跳過 React 的渲染週期直接更新位置，效能最高
    const blockRefs = useRef([]); 

    // 🎨 專屬調色盤
    const theme = {
        deepBlack: '#161415',
        paper: '#F6F4F1',
        stone: '#E4DED2',
        pebble: '#CFC6B8',
        coral: '#F95C4B',
        ember: '#D94030'
    };

    const onCompleteRef = useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    // 💡 增加數量：從 40 顆增加到 85 顆，讓畫面堆疊得更滿
    const blockColors = [theme.deepBlack, theme.stone, theme.coral, theme.ember, theme.pebble];
    const blocksData = useMemo(() => {
        return Array.from({ length: 110 }).map((_, i) => ({
            id: i,
            color: blockColors[i % blockColors.length],
            size: 40 + Math.random() * 45, 
            isCircle: i % 4 === 0, // Mix circles
            borderRadius: i % 4 === 0 ? '50%' : '14px' 
        }));
    }, []);

    useEffect(() => {
        if (!isActive) return;

        // 規範 v1：尊重 prefers-reduced-motion — 跳過物理動畫直上海報
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            setPhase('text');
            const t = setTimeout(() => onCompleteRef.current?.(), 2500);
            return () => clearTimeout(t);
        }

        let cleanup = () => {};
        import('matter-js').then(({ default: Matter }) => {
        // --- 1. 初始化無頭物理引擎 ---
        const { Engine, Runner, Bodies, Composite, Body, Events } = Matter;
        const engine = Engine.create();
        engineRef.current = engine;
        
        const width = window.innerWidth;
        const height = document.documentElement.clientHeight || window.innerHeight;

        // --- 2. 建立螢幕邊界 ---
        const groundHeight = 100;
        const ground = Bodies.rectangle(width / 2, height + groundHeight / 2, width * 2, groundHeight, { isStatic: true });
        const leftWall = Bodies.rectangle(-20, height / 2, 40, height * 2, { isStatic: true });
        const rightWall = Bodies.rectangle(width + 20, height / 2, 40, height * 2, { isStatic: true });

        // --- 3. 建立掉落的剛體 ---
        const bodies = blocksData.map((b, i) => {
            const bodyOptions = {
                restitution: 0.45, 
                friction: 0.1,
                density: 0.05
            };
            
            const startX = width / 2 + (Math.random() - 0.5) * (width * 0.9);
            // 💡 讓掉落高度間距拉大，產生源源不絕落下的感覺
            const startY = -100 - (i * 30); 

            const body = b.isCircle 
                ? Bodies.circle(startX, startY, b.size / 2, bodyOptions)
                : Bodies.rectangle(startX, startY, b.size, b.size, { 
                    ...bodyOptions, 
                    chamfer: { radius: 12 } 
                  });

            Body.setAngle(body, Math.random() * Math.PI);
            return body;
        });

        Composite.add(engine.world, [ground, leftWall, rightWall, ...bodies]);

        // --- 4. 啟動計算迴圈並同步到 DOM ---
        const runner = Runner.create();
        runnerRef.current = runner;
        Runner.run(runner, engine);

        Events.on(engine, 'afterUpdate', () => {
            bodies.forEach((body, i) => {
                if (blockRefs.current[i]) {
                    const x = body.position.x - blocksData[i].size / 2;
                    const y = body.position.y - blocksData[i].size / 2;
                    blockRefs.current[i].style.transform = `translate(${x}px, ${y}px) rotate(${body.angle}rad)`;
                }
            });
        });

        // --- 4b. 碰撞震動: 依衝擊速度決定強度，80 ms 節流避免過度震動 ---
        Events.on(engine, 'collisionStart', (event) => {
            const now = performance.now();
            if (now - lastHapticTimeRef.current < 80) return; // throttle

            // 計算碰撞相對速度 (取所有碰撞對中最大的)
            let maxSpeed = 0;
            event.pairs.forEach(pair => {
                const { bodyA, bodyB } = pair;
                const dvx = bodyA.velocity.x - bodyB.velocity.x;
                const dvy = bodyA.velocity.y - bodyB.velocity.y;
                const speed = Math.sqrt(dvx * dvx + dvy * dvy);
                if (speed > maxSpeed) maxSpeed = speed;
            });

            // 速度門檻：< 1.5 忽略 (滑過接觸), 1.5–4 輕震, 4–8 中震, > 8 重震
            if (maxSpeed < 1.5) return;
            const intensity = maxSpeed > 8 ? 'heavy' : maxSpeed > 4 ? 'medium' : 'light';
            triggerCollisionHaptic(intensity);
            lastHapticTimeRef.current = now;
        });

        // --- 5. 時間軸與爆炸控制 ---
        setPhase('falling');

        const explodeTimer = setTimeout(() => {
            Composite.remove(engine.world, [ground, leftWall, rightWall]);
            engine.world.gravity.y = 0;

            const originX = width / 2;
            const originY = height * 0.8; 

            bodies.forEach(b => {
                const dx = b.position.x - originX;
                const dy = b.position.y - originY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                
                const force = 0.09 * b.mass; 
                Body.applyForce(b, b.position, {
                    x: (dx / dist) * force + (Math.random() - 0.5) * 0.02,
                    y: (dy / dist) * force + (Math.random() - 0.5) * 0.02
                });
                Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.8);
            });

            setTimeout(() => {
                engine.timing.timeScale = 0.035; // 💡 更慢的子彈時間 (3.5%)
                setPhase('text'); // ⚡ 爆炸瞬間同步浮現海報
            }, 50);

        }, 1800); // 規範 v1：慶祝節奏收緊 — 掉落 3.0s→1.8s，儀式感保留、等待感拿掉

        const finishTimer = setTimeout(() => {
            if (onCompleteRef.current) onCompleteRef.current();
        }, 5200); // 規範 v1：總長 8.5s→5.2s（隨時可點擊跳過）

        cleanup = () => {
            clearTimeout(explodeTimer);
            clearTimeout(finishTimer);
            Runner.stop(runner);
            Engine.clear(engine);
        };
        }); // end import('matter-js').then
        return () => cleanup();
    }, [isActive, blocksData]);

    if (!isActive) return null;

    return (
        <motion.div 
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
            initial={{ backgroundColor: 'rgba(246, 244, 241, 0)' }}
            animate={{ backgroundColor: phase === 'idle' ? 'rgba(246, 244, 241, 0)' : theme.paper }} 
            transition={{ duration: 0.4 }}
            onClick={phase === 'text' ? () => onCompleteRef.current() : undefined}
        >
            {/* 物理畫布容器 */}
            <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                    transform: phase === 'text' ? 'scale(4.5)' : 'scale(1)',
                    transformOrigin: '50% 75%', 
                    transition: 'transform 5s cubic-bezier(0.16, 1, 0.3, 1), opacity 2s ease-in-out',
                    opacity: phase === 'text' ? 0.3 : 1 
                }}
            >
                {blocksData.map((b, i) => (
                    <div
                        key={b.id}
                        ref={el => blockRefs.current[i] = el}
                        className="absolute top-0 left-0" 
                        style={{
                            width: b.size,
                            height: b.size,
                            backgroundColor: b.color,
                            borderRadius: b.borderRadius,
                            boxShadow: 'inset 0 0 8px rgba(0,0,0,0.1)'
                        }}
                    />
                ))}
            </div>

            {/* 鼓勵海報文字：💡 全部集中到螢幕中央 */}
            <AnimatePresence>
                {phase === 'text' && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                        className="relative z-30 w-full h-full flex flex-col justify-center items-center p-6 max-w-[430px] mx-auto text-center"
                    >
                        {/* 頂部小標 */}
                        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
                            <span className="text-[9px] font-bold tracking-[0.4em] uppercase" style={{ color: theme.pebble }}>
                                session complete
                            </span>
                        </motion.div>

                        {/* 💡 集中排列的巨大標語 */}
                        <div className="flex flex-col items-center space-y-[-10px] my-10 w-full relative">
                            {/* 裝飾底塊 */}
                            <motion.div 
                                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 }}
                                className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-48 z-0 opacity-20" 
                                style={{ backgroundColor: theme.coral, borderRadius: '100px', filter: 'blur(40px)' }} 
                            />
                            
                            <motion.div 
                                initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, type: 'spring' }}
                                className="px-6 py-1 z-10" style={{ backgroundColor: theme.coral, borderRadius: '2px' }}
                            >
                                <h1 className="text-[4rem] leading-none font-black tracking-tighter lowercase" style={{ color: theme.paper }}>
                                    insane
                                </h1>
                            </motion.div>
                            <motion.div 
                                initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, type: 'spring' }}
                                className="px-8 py-1 mt-3 z-20" style={{ backgroundColor: theme.stone, borderRadius: '2px' }}
                            >
                                <h1 className="text-[4.8rem] leading-none font-black tracking-tighter lowercase" style={{ color: theme.deepBlack }}>
                                    effort
                                </h1>
                            </motion.div>
                            <motion.div 
                                initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4, type: 'spring' }}
                                className="px-6 py-1 mt-3 z-30" style={{ backgroundColor: theme.deepBlack, borderRadius: '2px' }}
                            >
                                <h1 className="text-[5.5rem] leading-[0.9] font-black tracking-tighter lowercase" style={{ color: theme.paper }}>
                                    today
                                </h1>
                            </motion.div>
                        </div>

                        {/* 數據預覽：也集中排版 */}
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                            className="flex space-x-10 mb-10"
                        >
                            <div className="text-center">
                                <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: theme.coral }}>Volume</p>
                                <p className="text-3xl font-black tracking-tighter" style={{ color: theme.deepBlack }}>
                                    {totalVolume.toLocaleString()}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: theme.coral }}>Sets</p>
                                <p className="text-3xl font-black tracking-tighter" style={{ color: theme.deepBlack }}>{totalSets}</p>
                            </div>
                        </motion.div>

                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                            className="text-xs font-bold leading-relaxed tracking-wide mb-16" style={{ color: theme.deepBlack }}
                        >
                            You earned your rest.
                        </motion.div>

                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full text-center">
                            <span className="text-[9px] font-bold uppercase tracking-[0.3em] animate-pulse" style={{ color: theme.pebble }}>
                                Tap anywhere to finish
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default WorkoutCompleteTransition;
