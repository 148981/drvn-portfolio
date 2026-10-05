import React, { useEffect } from 'react';
import { getUserId } from '../utils/auth';
import { notify } from '../utils/drvnNotifications';
import FullScreenCelebration from './FullScreenCelebration';

// ══════════════════════════════════════════════════════════════════════════
// ChallengeCompletionModal — 挑戰完成
//
// 2026-08 UI 稽核前，這支違反了三條 DRVN 既有規範：
//   1. 形態：是「半透明遮罩 + rounded-3xl 置中卡」，不是整頁
//   2. 色系：自成一套米色 #FDFBF7 / #4A3F35 / #8B7F72，
//      與 Paper/Ink/Coral 官方色票無關（全 App 因此有四套慶祝色系）
//   3. Emoji：用了 `challenge.badge_icon || '🏆'`，
//      直接牴觸 DailyGoalCelebration 檔頭明文的「無 emoji，圖示一律走 SVG」
//   另外文案是「Challenge Complete!」「Share Achievement」，
//   而同專案的產品原則寫的是「文案不浮誇（『你把它收下了』而非『太棒了！！』）」。
//
// 現在改成走共用的 FullScreenCelebration：整頁、官方色、無 emoji、繁中、
// 離開方式與其他慶祝頁一致。檔名與對外 props 維持不變，呼叫端不用改。
//
// confetti 也一併移除 —— 慶祝的重量應該來自「你做到了什麼」，
// 不是滿天彩帶；其他八個慶祝頁也沒有一個用彩帶。
// ══════════════════════════════════════════════════════════════════════════

const ChallengeCompletionModal = ({ isOpen, onClose, challenge, badge }) => {
    // ★ v2.3 挑戰完成也進統一通知（只發一次，之後再開這個 modal 不會重複打擾）
    useEffect(() => {
        if (!isOpen || !challenge) return;
        const title = challenge.title || challenge.name || '挑戰';
        try { notify(getUserId(), 'challengeDone', { title }); } catch { /* */ }
    }, [isOpen, challenge]);

    if (!isOpen || !challenge) return null;

    const name = challenge.name || challenge.title || '這個挑戰';

    // 只放真的有值的數字，最多三個（規格的一部分）
    const stats = [];
    if (challenge.goal_value != null) {
        stats.push({ value: String(challenge.goal_value), unit: challenge.goal_unit || '', label: '達成目標' });
    }
    if (badge?.reward_points != null) {
        stats.push({ value: `+${badge.reward_points}`, unit: '分', label: '獲得積分' });
    }

    return (
        <FullScreenCelebration
            open={isOpen}
            onDismiss={onClose}
            eyebrow="CHALLENGE · DONE"
            title="完成了。"
            subtitle={`你把「${name}」走完了。這種一路撐到底的事，做過的人才知道有多難。`}
            stats={stats}
            tone="dark"
            dismissMode="cta-required"
            ctaLabel="收下"
        />
    );
};

export default ChallengeCompletionModal;
