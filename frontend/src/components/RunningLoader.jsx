import React from 'react';
import BespokeAmbientGlow from './ui/BespokeAmbientGlow';

const RunningLoader = () => {
    return (
        <div className="fixed inset-0 z-[999999] bg-[#CFC6B8] flex flex-col justify-center items-center select-none overflow-hidden">
            {/* 氣氛燈背景 */}
            <BespokeAmbientGlow forceLightBg={true} forceFullPage={true} />

            <style dangerouslySetInnerHTML={{
                __html: `
                .running-loader-wrapper {
                    position: relative;
                    animation: float-run 3s ease-in-out infinite;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 10;
                }
                .run-svg {
                    width: 180px;
                }
                .run-main {
                    fill: none;
                    stroke: url(#metal-grad);
                    stroke-width: 1.4;
                }
                .run-leg-front {
                    transform-origin: 120px 70px;
                    animation: stepFront 1.2s ease-in-out infinite;
                }
                .run-leg-back {
                    transform-origin: 90px 60px;
                    animation: stepBack 1.2s ease-in-out infinite;
                }
                .run-energy-front {
                    stroke: #FF6A3D;
                    stroke-width: 1.4;
                    fill: none;
                    stroke-dasharray: 60 200;
                    animation: energyFront 1.2s linear infinite;
                    filter: blur(0.6px);
                }
                .run-energy-back {
                    stroke: #FF6A3D;
                    stroke-width: 1.2;
                    fill: none;
                    stroke-dasharray: 60 200;
                    animation: energyBack 1.2s linear infinite;
                    opacity: 0.4;
                    filter: blur(2px);
                }
                .run-dot {
                    fill: url(#coralMetal-grad);
                    filter: drop-shadow(0 0 8px rgba(255,106,61,0.6));
                    animation: headMove 1.2s ease-in-out infinite;
                }
                @keyframes stepFront {
                    0%, 100% { transform: scaleY(1); }
                    40% { transform: scaleY(0.85); }
                    60% { transform: scaleY(1.05); }
                }
                @keyframes stepBack {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(6px); }
                }
                @keyframes energyFront {
                    0% { stroke-dashoffset: 0; opacity: 0; }
                    20% { opacity: 1; }
                    100% { stroke-dashoffset: -260; opacity: 0; }
                }
                @keyframes energyBack {
                    0% { stroke-dashoffset: 40; }
                    100% { stroke-dashoffset: -220; }
                }
                @keyframes headMove {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }
                @keyframes float-run {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(4px); }
                }
                .run-loading-text {
                    text-align: center;
                    margin-top: 12px;
                    font-size: 9px;
                    letter-spacing: 5px;
                    color: #161415;
                    font-weight: bold;
                }
                .run-drvn-brand {
                    text-align: center;
                    margin-top: 4px;
                    font-family: "Tenor Sans", -apple-system, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    letter-spacing: 3px;
                    color: #F95C4B;
                    text-transform: uppercase;
                    opacity: 0.95;
                }
            `}} />

            <div className="running-loader-wrapper">
                <svg viewBox="0 0 220 140" className="run-svg">
                    <defs>
                        <linearGradient id="metal-grad" x1="0%" y1="0%" x2="100%">
                            <stop offset="0%" stopColor="#161415" />
                            <stop offset="50%" stopColor="#888" />
                            <stop offset="100%" stopColor="#161415" />
                        </linearGradient>

                        <linearGradient id="coralMetal-grad" x1="0%" y1="0%" x2="100%">
                            <stop offset="0%" stopColor="#FFB199" />
                            <stop offset="40%" stopColor="#FF6A3D" />
                            <stop offset="70%" stopColor="#B23A1F" />
                            <stop offset="100%" stopColor="#FFD2C2" />
                        </linearGradient>
                    </defs>

                    {/* 上弧 */}
                    <path className="run-main" d="M60 35 Q110 5 155 30" />

                    {/* 後腳 */}
                    <path className="run-main run-leg-back" d="M25 85 L80 45 Q105 25 130 45" />

                    {/* 前腳 */}
                    <path className="run-main run-leg-front" d="M130 45 L160 75 L200 45" />

                    {/* 能量（後） */}
                    <path className="run-energy-back" d="M25 85 L80 45 Q105 25 130 45" />

                    {/* 能量（前） */}
                    <path className="run-energy-front" d="M130 45 L160 75 L200 45" />

                    {/* 頭 */}
                    <circle className="run-dot" cx="160" cy="25" r="6" />
                </svg>

                <div className="run-loading-text">LOADING</div>
                <div className="run-drvn-brand">drvn</div>
            </div>
        </div>
    );
};

export default RunningLoader;
