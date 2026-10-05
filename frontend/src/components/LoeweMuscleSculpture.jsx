import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import BodyScanner from './BodyScanner';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { editorialColors } from '../utils/colors';

// ── Count-up score (animates 0 → value on mount / change) ──────────────
const CountUpScore = ({ value = 0, style }) => {
    const mv = useMotionValue(0);
    const spring = useSpring(mv, { stiffness: 90, damping: 22 });
    const rounded = useTransform(spring, (v) => Math.round(v));
    useEffect(() => { mv.set(value); }, [value, mv]);
    return <motion.span className="tabular-nums" style={style}>{rounded}</motion.span>;
};

// ── Unified palette (Image 3 spec) — 暖調中性 + 單一點睛色 ───────────────
const C = editorialColors;

// ─── 1. 精細肌肉座標資料 (15 個以上部位) ─────────────────────────────
const FRONT = [
    {
        id: 'chest_upper', label: 'UPPER CHEST',
        d: "M 500 330 C 440 325, 410 340, 390 380 C 420 395, 470 410, 500 415 C 530 410, 580 395, 610 380 C 590 340, 560 325, 500 330 Z"
    },
    {
        id: 'chest_lower', label: 'LOWER CHEST',
        d: "M 390 385 C 420 405, 460 420, 500 425 C 540 420, 580 405, 610 385 C 590 440, 540 450, 500 445 C 460 450, 410 440, 390 385 Z"
    },
    { 
        id: 'abs_upper', label: 'UPPER ABS', 
        d: "M 495 455 C 450 460, 435 480, 440 520 C 460 525, 480 530, 500 530 C 520 530, 540 525, 560 520 C 565 480, 550 460, 505 455 Z" 
    },
    { 
        id: 'abs_lower', label: 'LOWER ABS', 
        d: "M 440 525 C 460 535, 480 540, 500 540 C 520 540, 540 535, 560 525 C 565 570, 530 600, 500 605 C 470 600, 435 570, 440 525 Z" 
    },
    { id: 'left_front_delt', label: 'FRONT DELT', d: "M 400 340 C 360 338, 335 355, 335 400 C 355 410, 380 410, 400 395 Z" },
    { id: 'right_front_delt', label: 'FRONT DELT', d: "M 600 340 C 640 338, 665 355, 665 400 C 645 410, 620 410, 600 395 Z" },
    // 🆕 側三角（肩膀外側肩峰蓋）— 對應 side_delts（側平舉等動作）
    { id: 'left_side_delt', label: 'SIDE DELT', d: "M 398 330 C 352 315, 316 334, 308 388 C 320 402, 338 404, 350 393 C 345 362, 362 342, 398 344 Z" },
    { id: 'right_side_delt', label: 'SIDE DELT', d: "M 602 330 C 648 315, 684 334, 692 388 C 680 402, 662 404, 650 393 C 655 362, 638 342, 602 344 Z" },
    // 🆕 斜方肌上束（頸肩交界）— 對應 traps（聳肩等動作，正面也看得到）
    { id: 'left_trap_front', label: 'TRAPS', d: "M 455 300 C 430 305, 410 318, 400 335 C 420 340, 445 338, 470 330 Z" },
    { id: 'right_trap_front', label: 'TRAPS', d: "M 545 300 C 570 305, 590 318, 600 335 C 580 340, 555 338, 530 330 Z" },
    // 🆕 腹外斜肌 — 對應核心動作（俄羅斯轉體、側棒式等）
    { id: 'left_oblique', label: 'OBLIQUES', d: "M 432 468 C 414 500, 412 552, 434 588 C 446 560, 450 506, 446 474 Z" },
    { id: 'right_oblique', label: 'OBLIQUES', d: "M 568 468 C 586 500, 588 552, 566 588 C 554 560, 550 506, 554 474 Z" },
    { id: 'left_biceps', label: 'BICEPS', d: "M 340 420 C 310 450, 310 520, 335 560 C 360 540, 375 490, 370 450 Z" },
    { id: 'left_forearm', label: 'FOREARM', d: "M 345 580 C 310 630, 320 700, 350 730 C 365 690, 370 630, 360 580 Z" },
    { id: 'right_biceps', label: 'BICEPS', d: "M 660 420 C 690 450, 690 520, 665 560 C 640 540, 625 490, 630 450 Z" },
    { id: 'right_forearm', label: 'FOREARM', d: "M 655 580 C 690 630, 680 700, 650 730 C 635 690, 630 630, 640 580 Z" },
    {
        id: 'left_quads', label: 'QUADS',
        d: "M 480 620 C 440 615, 395 630, 395 680 C 395 730, 410 780, 435 810 C 460 780, 485 710, 480 620 Z"
    },
    {
        id: 'left_calves', label: 'CALVES',
        d: "M 445 845 C 410 890, 415 980, 440 1040 C 460 1020, 480 940, 470 855 Z"
    },
    {
        id: 'right_quads', label: 'QUADS',
        d: "M 520 620 C 560 615, 605 630, 605 680 C 605 730, 590 780, 565 810 C 540 780, 515 710, 520 620 Z"
    },
    {
        id: 'right_calves', label: 'CALVES',
        d: "M 555 845 C 590 890, 585 980, 560 1040 C 540 1020, 520 940, 530 855 Z"
    }
];

const BACK = [
    {
        id: 'traps', label: 'UPPER BACK',
        d: "M 500 250 C 470 270, 450 300, 435 320 C 465 335, 500 350, 500 350 C 500 350, 535 335, 565 320 C 550 300, 530 270, 500 250 Z"
    },
    { id: 'left_rear_delt', label: 'REAR DELT', d: "M 415 315 C 360 325, 320 360, 315 400 C 350 420, 380 410, 405 385 Z" },
    { id: 'right_rear_delt', label: 'REAR DELT', d: "M 585 315 C 640 325, 680 360, 685 400 C 650 420, 620 410, 595 385 Z" },
    {
        // 高精度倒三角形闊背肌 (Lats)
        id: 'left_lats', label: 'LATS',
        d: "M 455 335 C 410 380, 400 450, 430 520 C 450 535, 480 540, 500 540 C 500 500, 480 430, 455 335 Z"
    },
    {
        id: 'right_lats', label: 'LATS',
        d: "M 545 335 C 590 380, 600 450, 570 520 C 550 535, 520 540, 500 540 C 500 500, 520 430, 545 335 Z"
    },
    { id: 'left_triceps', label: 'TRICEPS', d: "M 345 410 C 295 460, 305 560, 330 610 C 360 570, 375 490, 365 415 Z" },
    { id: 'right_triceps', label: 'TRICEPS', d: "M 655 410 C 705 460, 695 560, 670 610 C 640 570, 625 490, 635 415 Z" },
    // 🆕 中背（菱形肌/斜方中束）— 對應 mid_back（划船類動作）
    {
        id: 'mid_back', label: 'MID BACK',
        d: "M 500 360 C 478 382, 468 440, 478 512 C 492 524, 508 524, 522 512 C 532 440, 522 382, 500 360 Z"
    },
    // 🆕 前臂（背面）— 對應 forearms
    { id: 'left_forearm_back', label: 'FOREARM', d: "M 332 625 C 300 665, 300 722, 326 758 C 346 722, 352 662, 342 626 Z" },
    { id: 'right_forearm_back', label: 'FOREARM', d: "M 668 625 C 700 665, 700 722, 674 758 C 654 722, 648 662, 658 626 Z" },
    {
        id: 'spinal_erectors', label: 'LOWER BACK',
        d: "M 500 540 C 475 550, 470 600, 480 635 C 490 645, 510 645, 520 635 C 530 600, 525 550, 500 540 Z"
    },
    {
        // 圓潤飽滿的臀大肌 (Glutes)
        id: 'glutes', label: 'GLUTES',
        d: `
            M 495 620 C 460 605, 420 620, 420 660 C 420 700, 460 710, 495 680 Z
            M 505 620 C 540 605, 580 620, 580 660 C 580 700, 540 710, 505 680 Z
        `
    },
    {
        id: 'left_hamstrings', label: 'HAMSTRINGS',
        d: "M 480 690 C 430 700, 400 750, 425 845 C 450 820, 485 760, 480 690 Z"
    },
    {
        id: 'right_hamstrings', label: 'HAMSTRINGS',
        d: "M 520 690 C 570 700, 600 750, 575 845 C 550 820, 515 760, 520 690 Z"
    },
    {
        id: 'left_calves', label: 'CALVES',
        d: "M 435 840 C 390 890, 410 970, 435 1020 C 460 1000, 470 910, 465 845 Z"
    },
    {
        id: 'right_calves', label: 'CALVES',
        d: "M 565 840 C 610 890, 590 970, 565 1020 C 540 1000, 530 910, 535 845 Z"
    },
];

// Recovery palette — 深色畫布版：提高彩度讓肌群色塊在 Deep-Black 上發光浮現
// 健康度從冷到暖：薄荷青 → 鵝卵石 → 暖沙 → Coral → 深紅
const getRecoveryColor = (score) => {
    if (score >= 90) return { fill: '#7FD9A8', label: 'FRESH' };       // 亮薄荷青（提彩度）
    if (score >= 70) return { fill: '#E8DCC4', label: 'GOOD' };        // 暖米石
    if (score >= 50) return { fill: '#E8B860', label: 'RECOVERING' };  // 亮暖沙金
    if (score >= 30) return { fill: '#FF6A57', label: 'FATIGUED' };    // 亮 Coral
    return { fill: '#F95C4B', label: 'DEPLETED' };                     // Coral 警示
};

/* 路徑的重心 —— 把 d 裡的座標成對平均。
   用來決定「這塊肌肉的數字要標在哪」。算出來而不是手寫 30 組座標：
   路徑之後被改動時，數字會自己跟著走，不會留在原地。 */
const centroidOf = (d) => {
    const nums = String(d).match(/-?\d*\.?\d+/g);
    if (!nums || nums.length < 2) return null;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i + 1 < nums.length; i += 2) {
        sx += parseFloat(nums[i]); sy += parseFloat(nums[i + 1]); n += 1;
    }
    return n ? { x: sx / n, y: sy / n } : null;
};

/* 還沒練過 —— 不是「完全恢復」。用中性灰，而且不給數字。 */
/* 肌群的中文名 —— 一份，側邊引線、懸停卡、底下那排都讀這裡。
   以前三個地方各自顯示英文大寫（UPPER CHEST…），介面標準 §3 要求全中文。 */
const ZH_LABEL = {
    'UPPER CHEST': '上胸', 'LOWER CHEST': '下胸',
    'UPPER ABS': '上腹', 'LOWER ABS': '下腹', 'OBLIQUES': '腹外斜',
    'FRONT DELT': '前三角', 'SIDE DELT': '側三角', 'REAR DELT': '後三角',
    'TRAPS': '斜方肌', 'UPPER BACK': '上背', 'MID BACK': '中背', 'LOWER BACK': '下背',
    'LATS': '背闊肌', 'BICEPS': '二頭', 'TRICEPS': '三頭', 'FOREARM': '前臂',
    'QUADS': '股四頭', 'HAMSTRINGS': '腿後', 'CALVES': '小腿', 'GLUTES': '臀',
};
const zhLabel = (l) => ZH_LABEL[l] || l;

const UNTRAINED_FILL = '#8A8A86';

/* 熱區縮放 —— 路徑是照人像外框畫的，蓋滿整塊肌肉時色塊比肌肉本身還大
   （胸口那片會橫跨到兩邊肩膀外）。整體往自己的重心縮一點，
   位置不動、只是不再糊成一大片。改這一個數字就好。 */
const ZONE_SCALE = 0.8;

const MuscleArea = ({ d, id, score, tracked, hovered, onHover }) => {
    const { fill: recoveredFill } = getRecoveryColor(score);
    const fill = tracked ? recoveredFill : UNTRAINED_FILL;
    const isHovered = hovered === id;

    // 🫁 呼吸燈：尚未恢復完全（<70）的部位發亮呼吸，越疲勞呼吸越急、越亮
    //    沒練過的部位不呼吸 —— 它沒有疲勞可言
    const needsRecovery = tracked && score < 70;
    const severe = tracked && score < 50;
    const breatheDuration = severe ? 1.6 : 2.6;          // 嚴重疲勞 → 呼吸更急促
    const glowPx = severe ? 14 : 9;

    // 深色畫布：低調呈現，hover 時才明顯（不搶戲）
    //    沒練過的更淡，讓有資料的那些先被看見
    const baseOpacity = isHovered ? 0.7 : (tracked ? 0.32 : 0.14);

    return (
        <motion.path
            d={d}
            fill={fill}
            animate={
                isHovered
                    ? { opacity: 0.7 }
                    : needsRecovery
                        ? { opacity: [0.30, severe ? 0.78 : 0.62, 0.30] }
                        : { opacity: baseOpacity }
            }
            transition={
                !isHovered && needsRecovery
                    ? { duration: breatheDuration, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
            }
            style={{
                cursor: 'pointer',
                // 🆕 深底用 screen（濾色）：顏色在 Deep-Black 上柔和浮現而非被乘黑
                mixBlendMode: 'screen',
                filter: isHovered
                    ? 'drop-shadow(0 0 12px rgba(255,106,87,0.5))'
                    : needsRecovery
                        ? `drop-shadow(0 0 ${glowPx}px ${fill})`   // 疲勞部位常駐光暈 + 呼吸透明度
                        : 'none',
            }}
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
            onTouchStart={() => onHover(id)}
        />
    );
};

const AntigravityMuscleMap = ({ recoveryData = {}, overallScore = null }) => {
    const [hovered, setHovered] = useState(null);
    const [view, setView] = useState('front');
    const [isScanning, setIsScanning] = useState(false);
    const [userImageFront, setUserImageFront] = useState(null);
    const [userImageBack, setUserImageBack] = useState(null);

    const activeMuscles = view === 'front' ? FRONT : BACK;
    const activeImage = view === 'front'
        ? (userImageFront || "/assets/model_front.png")
        : (userImageBack || "/assets/model_front.png");

    // ── Fine-grained subPart key mapping ──────────────────────────────────
    // SVG region id → recoveryData key (from muscleRecoveryTracker v3)
    const SCORE_KEY_MAP = {
        // FRONT
        chest_upper: 'chest_upper',
        chest_lower: 'chest_lower',
        abs_upper: 'abs',
        abs_lower: 'abs',
        left_front_delt: 'front_delts',
        right_front_delt: 'front_delts',
        left_side_delt: 'side_delts',
        right_side_delt: 'side_delts',
        left_trap_front: 'traps',
        right_trap_front: 'traps',
        left_oblique: 'abs',
        right_oblique: 'abs',
        left_biceps: 'biceps',
        right_biceps: 'biceps',
        left_forearm: 'forearms',
        right_forearm: 'forearms',
        left_quads: 'quads',
        right_quads: 'quads',
        left_calves: 'calves',
        right_calves: 'calves',
        // BACK
        traps: 'traps',
        left_rear_delt: 'rear_delts',
        right_rear_delt: 'rear_delts',
        left_lats: 'lats',
        right_lats: 'lats',
        left_triceps: 'triceps',
        right_triceps: 'triceps',
        spinal_erectors: 'lower_back',
        mid_back: 'mid_back',
        left_forearm_back: 'forearms',
        right_forearm_back: 'forearms',
        glutes: 'glutes',
        left_hamstrings: 'hamstrings',
        right_hamstrings: 'hamstrings',
    };

    // 某些 SVG 區塊需同時反映多個 tracker key 的疲勞（取最疲勞者）。
    // 例：平板臥推 → tracker 記為 chest_mid，但 SVG 只有上/下胸區塊，
    //     若不併入 chest_mid，練完平板臥推胸口仍會顯示 100% FRESH（假數據）。
    const MULTI_KEY_MAP = {
        chest_upper: ['chest_upper', 'chest_mid'],
        chest_lower: ['chest_lower', 'chest_mid'],
    };

    const readScore = (key) => {
        const data = recoveryData[key];
        if (typeof data === 'number') return Math.round(data);
        if (data?.hoursAgo !== undefined) return Math.min(100, Math.round((data.hoursAgo / 48) * 100));
        return 100;
    };

    const getScore = (id) => {
        // 多 key 區塊：取最疲勞（最低分）
        if (MULTI_KEY_MAP[id]) {
            return Math.min(...MULTI_KEY_MAP[id].map(readScore));
        }
        const key = SCORE_KEY_MAP[id] || id;
        return readScore(key);
    };

    /* 這塊肌肉真的有訓練紀錄嗎。
       ⚠️ readScore 對「沒有紀錄」回 100 —— 那是為了讓下游數學不炸，
          不是「完全恢復」。一次都沒練的人不該看到滿版綠色 100% FRESH。 */
    const trackedMap = recoveryData?._tracked || null;
    const isTracked = (id) => {
        if (!trackedMap) return true;   // 舊呼叫端沒給 _tracked → 維持原本行為
        const keys = MULTI_KEY_MAP[id] || [SCORE_KEY_MAP[id] || id];
        return keys.some(k => !!trackedMap[k]);
    };

    // ── Derive bottom card list from current view's SVG regions ─────────────
    // De-duplicate labels and show each muscle group once
    const getSummaryCards = () => {
        const seen = new Map(); // label → { id, label, score }
        activeMuscles.forEach(m => {
            // Use a canonical group label (strip left_/right_ prefix for display)
            const groupLabel = m.label;
            const score = getScore(m.id);
            // Keep lowest score (most fatigued) per label
            if (!seen.has(groupLabel) || score < seen.get(groupLabel).score) {
                seen.set(groupLabel, { id: m.id, label: groupLabel, score });
            }
        });
        return [...seen.values()].sort((a, b) => a.score - b.score); // most fatigued first
    };

    if (isScanning) {
        return (
            <div
                className="w-full max-w-md mx-auto relative z-50 p-4"
                style={{
                    background: C.black,
                    borderRadius: 28,
                    border: `1px solid ${C.paper}10`,
                    boxShadow: '0 18px 48px -24px rgba(22,20,21,0.45), 0 0 80px 10px rgba(249,92,75,0.28)',
                }}
            >
                <BodyScanner
                    onScanComplete={(img) => {
                        if (view === 'front') setUserImageFront(img);
                        else setUserImageBack(img);
                        setIsScanning(false);
                    }}
                    onCancel={() => setIsScanning(false)}
                />
            </div>
        );
    }

    return (
        <div
            className="relative isolate flex flex-col"
            style={{
                width: '100%',
                // 🆕 DRVN Deep-Black Hero slab：官方 #161415 暖黑，當背景底層往後退（三層景深）
                background: 'linear-gradient(155deg, #262523 0%, #161415 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: `
                    inset 0 1px 0 rgba(255, 255, 255, 0.10),
                    0 24px 48px -18px rgba(32, 28, 26, 0.55)
                `,
                // ────────────────────────────────────────
                borderRadius: 28,
                overflow: 'hidden',
                fontFamily: 'var(--font-body)',
            }}
        >
            {/* ── Swiss grid header — two columns, hairline divider below ─────── */}
            <div className="relative px-6 pt-7 pb-6">
                {/* Column row */}
                <div className="grid grid-cols-[1fr_auto] items-start gap-6">
                    {/* LEFT — eyebrow + score */}
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span
                                className="relative flex"
                                style={{ width: 6, height: 6 }}
                                aria-hidden
                            >
                                <motion.span
                                    className="absolute inset-0 rounded-full"
                                    style={{ background: C.coral }}
                                    animate={{ scale: [1, 2.2, 1], opacity: [0.45, 0, 0.45] }}
                                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
                                />
                                <span
                                    className="relative inline-block rounded-full"
                                    style={{ width: 6, height: 6, background: C.coral }}
                                />
                            </span>
                            <span
                                style={{
                                    color: 'rgba(246,244,241,0.55)',
                                    fontSize: 11,
                                    letterSpacing: '0.22em',
                                    fontWeight: 700,
                                }}
                            >
                                身體恢復
                            </span>
                        </div>

                        {/* ⚠️ 一次都沒練過的人不該看到「100%」。
                            那不是「你恢復得很好」，是「我們沒看過你訓練」——
                            兩件事差很多，而且後者不能用一個滿分數字表示。 */}
                        {Number.isFinite(overallScore) ? (
                            <>
                            <div className="flex items-baseline gap-1.5 mt-3 leading-none">
                                <CountUpScore
                                    value={Math.round(overallScore)}
                                    style={{
                                        fontFamily: 'var(--font-body)',
                                        fontWeight: 400,
                                        fontSize: 60,
                                        color: '#F6F4F1',
                                        letterSpacing: '-0.04em',
                                        lineHeight: 1,
                                    }}
                                />
                                <span style={{ color: 'rgba(246,244,241,0.45)', fontSize: 13, fontWeight: 600 }}>%</span>
                            </div>
                            {/* 「這個數字有沒有算睡眠跟 HRV」—— 講清楚，不要讓人用猜的。
                                這一塊是訓練後的肌群恢復；睡眠與 HRV 是準備度那個數字在用。 */}
                            <p style={{ color: 'rgba(246,244,241,0.42)', fontSize: 11, marginTop: 8 }}>
                                只看訓練後的恢復，睡眠與 HRV 在準備度
                            </p>
                            </>
                        ) : (
                            <div className="mt-3 leading-tight" style={{ maxWidth: 220 }}>
                                <div style={{ color: '#F6F4F1', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
                                    練一場就看得到
                                </div>
                                <div style={{ color: 'rgba(246,244,241,0.5)', fontSize: 11, fontWeight: 700, marginTop: 6 }}>
                                    重訓與跑步都會算進來
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT — 掃描與正/背面是輔助功能，不該跟主數字一樣大。
                        原本上下兩排（各自帶邊框、大字距英文），佔掉右上一整塊，
                        懸停卡還會疊在上面。收成一排、改中文、字級照階梯走。 */}
                    <div className="flex items-center gap-2.5">
                        {/* SCAN — ghost text button, no halo, hairline border in Ember */}
                        <motion.button
                            onClick={() => setIsScanning(true)}
                            whileTap={{ scale: 0.96 }}
                            className="rounded-full transition-colors duration-200 hover:bg-white/[0.04]"
                            style={{
                                color: 'rgba(246,244,241,0.5)',
                                background: 'transparent',
                                border: 'none',
                                fontSize: 11,
                                fontWeight: 500,
                                padding: '11px 6px',   /* 視覺很輕，但點擊高度還是 ≥44 */
                            }}
                        >
                            掃描
                        </motion.button>

                        {/* FRONT / BACK — the ONE place Liquid Glass earns its keep (morph state) */}
                        <div
                            className="relative isolate flex rounded-full p-[3px]"
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)',
                            }}
                        >
                            {['front', 'back'].map(v => {
                                const active = view === v;
                                return (
                                    <motion.button {...pressProps('pill')}
 key={v}
 onClick={() => setView(v)}
 className="relative px-3.5 py-1 rounded-full uppercase transition-colors duration-200 "
 style={{
 fontSize: 11,
 fontWeight: active ? 700 : 500,
 color: active ? '#161415' : 'rgba(246,244,241,0.55)',
 minWidth: 44,
 paddingTop: 7, paddingBottom: 7,
 }}
 >
                                        {active && (
                                            <motion.span
                                                layoutId="recovery-view-pill"
                                                className="absolute inset-0 rounded-full"
                                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                                style={{
                                                    background: '#F6F4F1',
                                                    boxShadow: [
                                                        'inset 0 1px 0 rgba(255,255,255,0.6)',
                                                        '0 2px 6px -1px rgba(0,0,0,0.25)',
                                                    ].join(', '),
                                                }}
                                            />
                                        )}
                                        <span className="relative z-10">{v === 'front' ? '正面' : '背面'}</span>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Swiss hairline divider */}
                <div
                    className="mt-5"
                    style={{
                        height: 1,
                        background: `linear-gradient(90deg, ${C.coral}66 0%, ${C.coral}33 14%, rgba(255,255,255,0.14) 18%, rgba(255,255,255,0.04) 100%)`,
                    }}
                />
            </div>

            {/* Model & SVG Layer */}
            {/* 人像原本撐到 102% 寬還放大 1.015 —— 整塊卡片高得誇張，
                一個螢幕幾乎只放得下這張圖。收到 88% 置中，卡片高度跟著少掉一截；
                側邊引線的字級同步放大，縮圖之後仍然 ≥11px。 */}
            <div className="relative w-full pt-0 pb-2 flex justify-center">
                <div
                    style={{
                        width: '88%',
                        position: 'relative',
                        margin: '0 auto',
                    }}
                >
                    <img loading="lazy" decoding="async"
                        src={activeImage}
                        alt="Body Model"
                        className="w-full h-auto block"
                        style={{
                            position: 'relative',
                            zIndex: 2,
                            opacity: 0.65,
                            filter: 'contrast(1.06) brightness(1.04) saturate(0.97)',
                        }}
                    />

                    {/* 肌肉熱區疊在人物之上，但用半透明讓人物色澤透出 */}
                    <svg
                        viewBox="0 0 1000 1200"
                        className="absolute inset-0 w-full h-full"
                        style={{ zIndex: 3, pointerEvents: 'none' }}
                    >
                        <g pointerEvents="auto">
                            {activeMuscles.map((m, i) => {
                                /* 各自繞著自己的重心縮 —— 整張圖一起縮會讓所有色塊往中間跑，
                                   位置就跟人像對不上了。 */
                                const c = centroidOf(m.d);
                                const shrink = c
                                    ? `translate(${c.x} ${c.y}) scale(${ZONE_SCALE}) translate(${-c.x} ${-c.y})`
                                    : undefined;
                                return (
                                    <g key={`${m.id}-${i}`} transform={shrink}>
                                        <MuscleArea
                                            id={m.id}
                                            d={m.d}
                                            score={getScore(m.id)}
                                            tracked={isTracked(m.id)}
                                            hovered={hovered}
                                            onHover={setHovered}
                                        />
                                    </g>
                                );
                            })}
                        </g>

                        {/* 每塊有紀錄的肌群拉一條線到旁邊顯示。
                            以前是把數字直接壓在肌肉上：深色人像上要墊一層黑底才看得到，
                            粗體 30px 四個數字擠在胸口，左右對稱的兩塊還會疊在一起。
                            改成解剖圖的做法 —— 重心點一個小圓，引線帶到側邊欄位，
                            名稱與數字用一般字重排在那裡，人像本身就乾淨了。 */}
                        <g pointerEvents="none">
                            {(() => {
                                const GUTTER_L = 40, GUTTER_R = 960;
                                const MIN_GAP = 58;          // 兩個標籤之間至少的垂直距離

                                const pts = activeMuscles
                                    .map((m, i) => ({ m, i, c: centroidOf(m.d) }))
                                    .filter((p) => p.c && isTracked(p.m.id))
                                    .map((p) => ({ ...p, side: p.c.x < 480 ? 'L' : p.c.x > 520 ? 'R' : null }));

                                /* 正中央那幾塊（胸、腹）沒有天然的左右，左右輪流放，
                                   不然全部擠在同一邊。 */
                                let flip = 0;
                                pts.forEach((p) => { if (!p.side) { p.side = flip % 2 === 0 ? 'L' : 'R'; flip += 1; } });

                                /* 同一側依高度排好，再往下推開 —— 兩個標籤不會疊字。 */
                                const place = (list) => {
                                    const sorted = [...list].sort((a, b) => a.c.y - b.c.y);
                                    let last = -Infinity;
                                    sorted.forEach((p) => { p.ly = Math.max(p.c.y, last + MIN_GAP); last = p.ly; });
                                    return sorted;
                                };
                                const rows = [
                                    ...place(pts.filter((p) => p.side === 'L')),
                                    ...place(pts.filter((p) => p.side === 'R')),
                                ];

                                return rows.map(({ m, i, c, side, ly }) => {
                                    const sc = getScore(m.id);
                                    const { fill } = getRecoveryColor(sc);
                                    const gx = side === 'L' ? GUTTER_L : GUTTER_R;
                                    const elbow = side === 'L' ? gx + 46 : gx - 46;
                                    return (
                                        <g key={`lead-${m.id}-${i}`}>
                                            <path
                                                d={`M ${c.x} ${c.y} L ${elbow} ${ly} L ${gx} ${ly}`}
                                                fill="none" stroke={fill} strokeWidth={1.6} strokeOpacity={0.5}
                                            />
                                            <circle cx={c.x} cy={c.y} r={4.5} fill={fill} fillOpacity={0.85} />
                                            <text
                                                x={gx} y={ly - 9}
                                                textAnchor={side === 'L' ? 'start' : 'end'}
                                                style={{ fontSize: 32, fontWeight: 400, fontFamily: 'var(--font-body)', fill: 'rgba(246,244,241,0.6)' }}
                                            >{zhLabel(m.label)}</text>
                                            <text
                                                x={gx} y={ly + 20}
                                                textAnchor={side === 'L' ? 'start' : 'end'}
                                                style={{ fontSize: 38, fontWeight: 400, fontFamily: 'var(--font-body)', fill, letterSpacing: '-0.02em' }}
                                            >{sc}</text>
                                        </g>
                                    );
                                });
                            })()}
                        </g>
                    </svg>
                </div>
            </div>

            {/* 懸停卡拿掉了 —— 它固定貼在右上角，會壓到掃描與正/背面切換；
                而且它要講的（哪一塊、幾分）現在引線標籤已經直接寫在人像兩側。 */}

            {/* ── Recovery data row — Swiss minimal: no boxes, hairline dividers ── */}
            <div className="mt-auto px-6 pt-5 pb-6 z-20">
                {/* Eyebrow row — label left, count right */}
                <div className="flex items-baseline justify-between mb-4">
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={view}
                            initial={{ opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -3 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            style={{
                                fontSize: 11,
                                letterSpacing: '0.1em',
                                color: 'rgba(246,244,241,0.55)',
                                fontFamily: '"Geist Mono", monospace',
                                fontWeight: 600,
                            }}
                        >
                            {view === 'front' ? '身體正面' : '身體背面'}
                        </motion.span>
                    </AnimatePresence>
                    <span
                        className="tabular-nums"
                        style={{
                            fontSize: 11,
                            letterSpacing: '0.06em',
                            color: 'rgba(246,244,241,0.45)',
                            fontFamily: '"Geist Mono", monospace',
                            fontWeight: 600,
                        }}
                    >
                        {/* 「為什麼下半身沒有顏色」—— 因為那些肌群還沒有訓練紀錄。
                            灰色不是「完全恢復」，是「沒資料」，這兩件事不能長一樣還不解釋。 */}
                        {(() => {
                            const ids = [...new Set(activeMuscles.map((m) => m.id))];
                            const cold = ids.filter((id) => !isTracked(id)).length;
                            return cold
                                ? `${ids.length - cold} 個有紀錄 · ${cold} 個灰的還沒練到`
                                : `${ids.length} 個肌群都有紀錄`;
                        })()}
                    </span>
                </div>

                {/* Horizontal data cells — divided by vertical hairlines, no boxes */}
                <div
                    className="-mx-2 px-2 overflow-x-auto no-scrollbar"
                    style={{ borderTop: `1px solid rgba(255,255,255,0.10)` }}
                >
                    <div className="flex min-w-max pt-4">
                        {getSummaryCards().map((m, i) => {
                            // 排序已是「最疲勞在前」（getSummaryCards 依分數升冪）
                            const isFatigued = m.score < 50;
                            const needsRecovery = m.score < 70; // 尚未恢復完全 → 數字同步呼吸提示
                            // 深色畫布：疲勞用 Coral、恢復中用暖沙金、正常用 Paper 亮色
                            const accent = isFatigued ? C.coral : needsRecovery ? '#E8B860' : '#F6F4F1';

                            return (
                                <motion.div
                                    key={`${view}-${m.label}`}
                                    layout
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                        duration: 0.32,
                                        delay: Math.min(i, 6) * 0.04,
                                        ease: [0.16, 1, 0.3, 1],
                                    }}
                                    className="relative flex flex-col items-start min-w-[92px] px-4"
                                    style={{
                                        borderLeft: i === 0 ? 'none' : `1px solid rgba(255,255,255,0.10)`,
                                    }}
                                >
                                    <span
                                        className="mb-1.5"
                                        style={{
                                            fontSize: 11,
                                            letterSpacing: '0.06em',
                                            color: 'rgba(246,244,241,0.55)',
                                            fontFamily: '"Geist Mono", monospace',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {zhLabel(m.label)}
                                    </span>

                                    {/* Score */}
                                    <div className="flex items-baseline gap-0.5 leading-none mb-2">
                                        <span
                                            className="tabular-nums"
                                            style={{
                                                fontFamily: 'var(--font-body)',
                                                fontWeight: 400,
                                                fontSize: 26,
                                                color: accent,
                                                letterSpacing: '-0.025em',
                                            }}
                                        >
                                            {m.score}
                                        </span>
                                        <span style={{ color: 'rgba(246,244,241,0.45)', fontSize: 11, fontWeight: 600 }}>%</span>
                                    </div>

                                    {/* Inline status — 尚未恢復完全的部位帶呼吸小燈 */}
                                    <span
                                        className="uppercase flex items-center gap-1.5"
                                        style={{
                                            fontSize: 9,
                                            letterSpacing: '0.26em',
                                            color: needsRecovery ? accent : 'rgba(246,244,241,0.55)',
                                            fontFamily: '"Geist Mono", monospace',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {needsRecovery && (
                                            <motion.span
                                                className="inline-block rounded-full"
                                                style={{
                                                    width: 4, height: 4, background: accent,
                                                    boxShadow: `0 0 6px ${accent}`,
                                                }}
                                                animate={{ opacity: [0.35, 1, 0.35] }}
                                                transition={{
                                                    duration: isFatigued ? 1.6 : 2.6,
                                                    repeat: Infinity,
                                                    ease: 'easeInOut',
                                                }}
                                            />
                                        )}
                                        {getRecoveryColor(m.score).label}
                                    </span>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default AntigravityMuscleMap;

