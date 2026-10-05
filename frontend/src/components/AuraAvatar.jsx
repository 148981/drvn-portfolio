import React, { useRef, useEffect } from 'react';

// Using the app's theme colors: Orange (230,126,81), Gold (212,168,67), Sage (143,168,122)
const BLOBS = [
    { spd: 0.38, rOff: 0.18, baseA: 0.0, color: [230, 126, 81], size: 0.25, alpha: 0.90 },
    { spd: 0.22, rOff: 0.12, baseA: 1.8, color: [212, 168, 67], size: 0.22, alpha: 0.85 },
    { spd: 0.51, rOff: 0.25, baseA: 3.5, color: [143, 168, 122], size: 0.20, alpha: 0.80 },
    { spd: 0.17, rOff: 0.10, baseA: 2.4, color: [230, 126, 81], size: 0.28, alpha: 0.85 },
    { spd: 0.64, rOff: 0.22, baseA: 5.0, color: [212, 168, 67], size: 0.18, alpha: 0.75 },
    { spd: 0.29, rOff: 0.15, baseA: 4.2, color: [143, 168, 122], size: 0.20, alpha: 0.70 },
    { spd: 0.44, rOff: 0.20, baseA: 0.9, color: [245, 190, 120], size: 0.15, alpha: 0.65 },
];

export default function AuraAvatar({ size = 100 }) {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);
    const tRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = size * DPR;
        canvas.height = size * DPR;

        const draw = () => {
            tRef.current += 0.012;
            const t = tRef.current;
            const W = size, H = size;
            const cx = W / 2, cy = H / 2;
            const haloR = W * 0.35; // Shrink orbit slightly to hug avatar

            ctx.save();
            ctx.scale(DPR, DPR);
            ctx.clearRect(0, 0, W, H);

            // 繪製動態色光暈
            for (const b of BLOBS) {
                const angle = b.baseA + t * b.spd;
                const rPulse = haloR * (1 + b.rOff * Math.sin(t * b.spd * 1.7 + b.baseA));
                const bx = cx + Math.cos(angle) * rPulse;
                const by = cy + Math.sin(angle) * rPulse;
                const brad = W * b.size;

                const gr = ctx.createRadialGradient(bx, by, 0, bx, by, brad);
                const [r, g, bl] = b.color;
                gr.addColorStop(0, `rgba(${r},${g},${bl},${b.alpha})`);
                gr.addColorStop(0.35, `rgba(${r},${g},${bl},${+(b.alpha * 0.45).toFixed(2)})`);
                gr.addColorStop(0.7, `rgba(${r},${g},${bl},${+(b.alpha * 0.10).toFixed(2)})`);
                gr.addColorStop(1, `rgba(${r},${g},${bl},0)`);
                ctx.fillStyle = gr;
                ctx.beginPath();
                ctx.arc(bx, by, brad, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
            rafRef.current = requestAnimationFrame(draw);
        };

        rafRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafRef.current);
    }, [size]);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: size, height: size, borderRadius: '50%', display: 'block' }}
        />
    );
}
