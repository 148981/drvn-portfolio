import React from 'react';
import { motion, useTime, useTransform } from 'framer-motion';

const BespokeAmbientGlowDark = () => {
    const time = useTime();

    // 📐 數學模型：非同步利薩茹曲線 (永遠不會重複的呼吸感)
    const x1 = useTransform(time, (t) => Math.sin(t / 9000) * 80);
    const y1 = useTransform(time, (t) => Math.cos(t / 7000) * 50);
    const scale1 = useTransform(time, (t) => 1 + 0.15 * Math.sin(t / 4000));

    const x2 = useTransform(time, (t) => Math.cos(t / 8500 + 2) * -70);
    const y2 = useTransform(time, (t) => Math.sin(t / 10000 + 1) * 60);
    const scale2 = useTransform(time, (t) => 1 + 0.1 * Math.cos(t / 5000));

    const x3 = useTransform(time, (t) => Math.sin(t / 11000 + 3) * 60);
    const y3 = useTransform(time, (t) => Math.cos(t / 9500 + 1.5) * -40);

    const x4 = useTransform(time, (t) => Math.cos(t / 12000 + 5) * 50);
    const y4 = useTransform(time, (t) => Math.sin(t / 11500 + 0.5) * -70);

    return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">

            {/* 🌟 溫暖橘黃 (右上) - 參考圖一頂部 */}
            <motion.div
                className="absolute top-[-20%] right-[-10%] w-[120vw] h-[120vw] rounded-full"
                style={{
                    x: x1, y: y1, scale: scale1,
                    background: 'radial-gradient(circle at center, rgba(255,160,60,0.45) 0%, rgba(255,160,60,0) 60%)',
                    opacity: 0.8,
                    willChange: 'transform'
                }}
            />

            {/* 🌊 雲朵粉藍 (中央偏左) - 參考圖一中間 */}
            <motion.div
                className="absolute top-[10%] left-[-20%] w-[130vw] h-[130vw] rounded-full"
                style={{
                    x: x2, y: y2, scale: scale2,
                    background: 'radial-gradient(circle at center, rgba(147,197,253,0.35) 0%, rgba(147,197,253,0) 60%)',
                    opacity: 0.7,
                    willChange: 'transform'
                }}
            />

            {/* 🌿 薄荷嫩綠 (左下) - 參考圖一左下 */}
            <motion.div
                className="absolute bottom-[-15%] left-[-10%] w-[110vw] h-[110vw] rounded-full"
                style={{
                    x: x3, y: y3,
                    background: 'radial-gradient(circle at center, rgba(167,243,208,0.3) 0%, rgba(167,243,208,0) 60%)',
                    opacity: 0.6,
                    willChange: 'transform'
                }}
            />

            {/* 🍑 蜜桃流沙 (右下) - 參考圖一右下 */}
            <motion.div
                className="absolute bottom-[-20%] right-[-15%] w-[120vw] h-[120vw] rounded-full"
                style={{
                    x: x4, y: y4,
                    background: 'radial-gradient(circle at center, rgba(254,215,170,0.35) 0%, rgba(254,215,170,0) 60%)',
                    opacity: 0.7,
                    willChange: 'transform'
                }}
            />

            {/* 🌑 深度暗角遮罩 (保持暗色調基礎，但稍微降低暗角強度讓色彩透出來) */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0)_20%,_rgba(22,20,21,0.8)_100%)]" />
        </div>
    );
};

export default BespokeAmbientGlowDark;
