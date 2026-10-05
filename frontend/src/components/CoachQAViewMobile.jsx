import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { ChevronLeft, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CoachQACard from './CoachQACard';
import MobileNavigation from './MobileNavigation';

// Sample Q&A session data
const SAMPLE_QA_SESSION = {
    id: 'week-1-squat',
    week: 1,
    theme: '如何正確深蹲？',
    coach: {
        name: '陳教練',
        photo_url: null,
        title: '肌力訓練專家'
    },
    qaPairs: [
        {
            question: '深蹲時膝蓋會痛，是姿勢不對嗎？',
            asker_name: 'Mike',
            answer: '膝蓋疼痛通常是因為膝蓋過度前移。確保下蹲時臀部向後推，膝蓋不要超過腳尖太多。同時檢查腳掌是否平貼地面，重心在腳跟。',
            featured: true
        },
        {
            question: '深蹲到底要蹲多低？',
            asker_name: 'Sarah',
            answer: '理想的深蹲深度是大腿至少平行地面，但這取決於你的活動度。初學者可以先從高腳杯深蹲開始，逐漸增加深度。重要的是保持腰椎中立，不要圓背。',
            featured: true
        },
        {
            question: '槓鈴應該放在肩膀哪個位置？',
            asker_name: 'David',
            answer: '高槓位深蹲將槓放在斜方肌上部，低槓位則放在肩胛骨後上方。高槓位更強調股四頭肌，低槓位更多使用臀部和後側鏈。選擇你感覺最舒適的位置。',
            featured: false
        }
    ],
    status: 'open'
};

const CoachQAViewMobile = () => {
    const navigate = useNavigate();
    const [currentSession, setCurrentSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setTimeout(() => {
            setCurrentSession(SAMPLE_QA_SESSION);
            setLoading(false);
        }, 300);
    }, []);

    if (loading) {
        return (
            <div className="min-h-[100dvh] bg-[#F5EFE7] flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#C68E5D]"></div>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] bg-[#F5EFE7] pb-4" style={{ maxWidth: '430px', margin: '0 auto' }}>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[#F5EFE7]/95 backdrop-blur-sm border-b border-[#262523]/10 page-top-safe--tight">
                <div className="px-6 py-4">
                    <div className="flex items-center gap-4">
                        <motion.button {...pressProps('row')}
 onClick={() => navigate(-1)}
 className="p-2 rounded-lg hover:bg-white/50 transition-colors"
 >
                            <ChevronLeft size={24} className="text-[#262523]" />
                        </motion.button>
                        <div className="flex-1">
                            <h1 className="text-2xl font-serif text-[#262523] mb-1">
                                Coach's Q&A
                            </h1>
                            <p className="text-sm text-[#8B7F72]">
                                專業教練問答
                            </p>
                        </div>
                        <MessageCircle size={24} className="text-[#C68E5D]" />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="px-6 py-6">
                {currentSession ? (
                    <CoachQACard session={currentSession} />
                ) : (
                    <div className="text-center py-12">
                        <p className="text-[#8B7F72]">目前沒有進行中的問答</p>
                    </div>
                )}

                {/* Info Section */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-6 p-6 bg-white/50 rounded-[18px] border border-[#262523]/5"
                >
                    <h3 className="text-sm font-bold text-[#262523] mb-2 uppercase tracking-wider">
                        About Coach's Q&A
                    </h3>
                    <p className="text-xs text-[#8B7F72] leading-relaxed">
                        每週五開放一個訓練主題，讓你向專業教練提問。教練會從中挑選最具代表性的問題進行詳細解答。問題將以雜誌專訪的形式呈現，優雅且專業。
                    </p>
                </motion.div>
            </div>

            {/* Mobile Navigation */}
            <MobileNavigation />
        </div>
    );
};

export default CoachQAViewMobile;
