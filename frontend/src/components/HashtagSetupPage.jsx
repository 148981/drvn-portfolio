/* ⚠️ 死碼 — 全專案零引用（2026-09 社群稽核）
   ────────────────────────────────────────────────────────────────
   獨立的標籤設定頁。/hashtag-setup 路由已於 2026-09 移除（零導航）。標籤選擇實際發生在發文流程的 IGPostComposer 裡。
   保留只是因為稽核當下沒有直接刪檔的權限；確認過沒有其他用途後
   可以整支移除，不影響任何畫面。 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import EnhancedHashtagSelector from './EnhancedHashtagSelector';

const HashtagSetupPage = ({ userId }) => {
    const navigate = useNavigate();
    const [completed, setCompleted] = useState(false);

    const handleComplete = (data) => {
        console.log('Hashtag selection completed:', data);

        // Save tags to localStorage for Dashboard to read
        if (data && data.selected_tags) {
            localStorage.setItem('userPlanTags', JSON.stringify(data.selected_tags));
        }

        setCompleted(true);
        // Navigate back to dashboard after a short delay
        setTimeout(() => {
            navigate('/dashboard');
        }, 1500);
    };

    const handleCancel = () => {
        navigate('/dashboard');
    };

    if (completed) {
        return (
            <div className="min-h-[100dvh] bg-[#0D0F11] flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center"
                >
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-green-500">
                        <span className="text-4xl">✓</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">雷達配置成功！</h2>
                    <p className="text-glass-muted">正在返回儀表板...</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] bg-[#0D0F11] py-8">
            <EnhancedHashtagSelector
                userId={userId}
                onComplete={handleComplete}
                onCancel={handleCancel}
                isModal={false}
            />
        </div>
    );
};

export default HashtagSetupPage;
