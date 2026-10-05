import React, { useEffect, useState } from 'react';
import { animate } from 'framer-motion';
import FullScreenCelebration from './FullScreenCelebration';

// ══════════════════════════════════════════════════════════════════════════
// GrowthReportOverlay — 能力基準提升
//
// 2026-08 UI 稽核前的狀況：
//   · 形態：「bg-black/80 遮罩 + max-w-sm rounded-[36px] 置中卡」，不是整頁
//   · 色系：又一套米色（#F9F6E8 / #FF9F76 / #D4A853），
//     是全 App 第四套慶祝色系
//   · 語氣：「LEVEL UP!」「Accept New Standard」，
//     牴觸專案自己寫的「文案不浮誇（『你把它收下了』而非『太棒了！！』）」
//   · 說明整段是英文（"Based on your strong performance..."），
//     而 App 其餘部分是繁中
//   · 離開方式：只有一顆 Accept，沒有其他出口
//
// 現在走共用的 FullScreenCelebration，與其他慶祝頁同一套語言。
// 數字滾動保留 —— 那是這一頁真正有價值的細節（看著自己的基準往上爬）。
// ══════════════════════════════════════════════════════════════════════════

const GrowthReportOverlay = ({ reportData, onConfirm }) => {
    const { oldBaseline, newBaseline, growthPercent } = reportData || {};
    const [displayBaseline, setDisplayBaseline] = useState(oldBaseline ?? 0);

    useEffect(() => {
        if (oldBaseline == null || newBaseline == null) return undefined;
        // 數字滾動：讓使用者看著基準往上爬，而不是直接看到結果
        const controls = animate(oldBaseline, newBaseline, {
            duration: 2.5,
            ease: 'circOut',
            onUpdate: (value) => setDisplayBaseline(Math.round(value)),
        });
        return () => controls.stop();
    }, [oldBaseline, newBaseline]);

    const stats = [
        { value: String(displayBaseline), unit: '分', label: '新基準' },
        { value: String(oldBaseline ?? '—'), unit: '分', label: '先前' },
    ];
    if (growthPercent != null) {
        stats.push({ value: `+${growthPercent}`, unit: '%', label: '成長' });
    }

    return (
        <FullScreenCelebration
            open
            onDismiss={onConfirm}
            eyebrow="BASELINE · UPDATED"
            title="你的基礎往上走了。"
            subtitle="這段時間你都跟上了課表的節奏，所以我們把訓練模型的基準調高了 —— 接下來的課會比之前重一點。"
            stats={stats}
            tone="dark"
            dismissMode="cta-required"
            ctaLabel="知道了，繼續"
        />
    );
};

export default GrowthReportOverlay;
