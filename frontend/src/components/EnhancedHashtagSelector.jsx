/* ⚠️ 死碼 — 全專案零引用（2026-09 社群稽核）
   ────────────────────────────────────────────────────────────────
   只被 HashtagSetupPage 使用，而那一頁的路由已移除 → 一併成為孤兒。
   保留只是因為稽核當下沒有直接刪檔的權限；確認過沒有其他用途後
   可以整支移除，不影響任何畫面。 */
import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Target, Check, TrendingUp } from 'lucide-react';
import apiClient from '../api/client';

// Hashtag categories with visual styles
const HASHTAG_CATEGORIES = {
    pain_recovery: {
        name: "痛點修復",
        icon: "🩹",
        color: "red",
        gradient: "from-red-500 to-pink-500",
        bgGlow: "bg-red-500/20"
    },
    aesthetics: {
        name: "體態雕塑",
        icon: "🎯",
        color: "blue",
        gradient: "from-blue-500 to-purple-500",
        bgGlow: "bg-blue-500/20"
    },
    performance: {
        name: "運動表現",
        icon: "⚡",
        color: "yellow",
        gradient: "from-yellow-500 to-orange-500",
        bgGlow: "bg-yellow-500/20"
    },
    wellness: {
        name: "身心健康",
        icon: "🧘",
        color: "green",
        gradient: "from-green-500 to-teal-500",
        bgGlow: "bg-green-500/20"
    },
    context: {
        name: "特殊情境",
        icon: "👤",
        color: "purple",
        gradient: "from-purple-500 to-pink-500",
        bgGlow: "bg-purple-500/20"
    }
};

const EnhancedHashtagSelector = ({ userId, onComplete, onClose, onCancel, isModal = true }) => {
    const [selectedTags, setSelectedTags] = useState([]);
    const [hashtags, setHashtags] = useState({});
    const [loading, setLoading] = useState(true);
    const [idealShape, setIdealShape] = useState(null);

    useEffect(() => {
        fetchHashtags();
    }, []);

    useEffect(() => {
        if (selectedTags.length > 0) {
            calculateIdealShape();
        }
    }, [selectedTags]);

    const fetchHashtags = async () => {
        try {
            const response = await apiClient.get('/api/hashtags/pool');
            setHashtags(response.data);
        } catch (error) {
            console.error("Error fetching hashtags:", error);
            // Fallback to hardcoded data matching the robust list
            setHashtags({
                pain_recovery: { tags: ["下背痠痛", "肩頸僵硬", "膝蓋不適", "骨盆前傾", "圓肩駝背", "足底筋膜", "久坐族", "容易疲累", "腰椎不適", "五十肩", "髖關節緊繃", "小腿緊繃"] },
                aesthetics: { tags: ["增肌", "減脂", "線條緊實", "馬甲線", "蜜桃臀", "倒三角形", "告別掰掰袖", "腹肌顯現", "美背塑造", "緊實手臂", "修長雙腿", "翹臀養成", "消除副乳"] },
                performance: { tags: ["提升體力", "增加力量", "運動新手", "高強度挑戰", "爆發力訓練", "增加代謝", "提升耐力", "突破PR", "速度提升", "柔軟度改善", "核心穩定", "平衡感強化"] },
                wellness: { tags: ["改善睡眠", "抗壓舒壓", "提升專注力", "情緒穩定", "焦慮緩解", "增強免疫", "提升活力", "延緩老化", "改善循環", "淋巴排毒", "荷爾蒙平衡"] },
                context: { tags: ["久坐上班族", "產後修復", "週末戰士", "備賽挑戰", "銀髮族", "學生黨", "外食族補救", "時間有限", "在家訓練", "健身房訓練", "戶外運動"] }
            });
        } finally {
            setLoading(false);
        }
    };

    const calculateIdealShape = async () => {
        try {
            const response = await apiClient.post('/api/radar/ideal-shape', {
                selected_tags: selectedTags
            });
            setIdealShape(response.data);
        } catch (error) {
            console.error("Error calculating ideal shape:", error);
        }
    };

    const toggleTag = (tag) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            if (selectedTags.length < 5) {
                setSelectedTags([...selectedTags, tag]);
            }
        }
    };

    const handleComplete = async () => {
        try {
            const response = await apiClient.post('/api/user/radar-profile', {
                user_id: userId,
                selected_tags: selectedTags
            });
            // Always include selected_tags in the response
            onComplete({ ...response.data, selected_tags: selectedTags });
        } catch (error) {
            console.error("Error creating radar profile:", error);
            // Fallback if API fails
            onComplete({ selected_tags: selectedTags });
        }
    };

    const getTagColor = (category) => {
        const colorMap = {
            pain_recovery: "border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-300",
            aesthetics: "border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300",
            performance: "border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300",
            wellness: "border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-300",
            context: "border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300"
        };
        return colorMap[category] || colorMap.aesthetics;
    };

    if (loading) {
        return (
            <div className={isModal ? "fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" : "flex items-center justify-center min-h-[400px]"}>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-glass-beige"></div>
            </div>
        );
    }

    const containerClasses = isModal
        ? "fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
        : "w-full mx-auto";

    return (
        <div className={containerClasses}>
            <motion.div
                initial={isModal ? { opacity: 0, scale: 0.9 } : { opacity: 0 }}
                animate={isModal ? { opacity: 1, scale: 1 } : { opacity: 1 }}
                className={`w-full max-w-6xl bg-[#1A1D1F] border border-white/10 rounded-3xl shadow-2xl overflow-hidden ${!isModal && 'border-0 bg-transparent shadow-none'}`}
            >
                {/* Header with Glow Effect */}
                <div className="relative overflow-hidden bg-gradient-to-r from-glass-blue/20 to-purple-500/20 p-8 border-b border-white/10 rounded-t-3xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-glass-blue opacity-20 rounded-full blur-3xl"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-3 bg-glass-blue/20 rounded-xl border border-glass-blue/30">
                                    <Sparkles size={28} className="text-glass-blue" />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-bold text-white">選擇你的健身目標</h2>
                                    <p className="text-glass-muted mt-1">建立專屬於你的雷達圖 - 選擇 3-5 個標籤</p>
                                </div>
                            </div>
                        </div>
                        {isModal && onClose && (
                            <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/60 hover:text-white"
 >
                                <X size={24} />
                            </motion.button>
                        )}
                    </div>

                    {/* Tag Counter */}
                    <div className="mt-6 flex items-center gap-4">
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className={`w-3 h-3 rounded-full transition-all ${i <= selectedTags.length
                                        ? 'bg-glass-beige shadow-lg shadow-glass-beige/50'
                                        : 'bg-white/10'
                                        }`}
                                />
                            ))}
                        </div>
                        <span className="text-sm text-glass-muted">
                            已選擇 <span className="text-glass-beige font-bold">{selectedTags.length}</span> / 5
                        </span>
                    </div>
                </div>

                {/* Selected Tags Display */}
                {selectedTags.length > 0 && (
                    <div className="p-6 bg-black/20 border-b border-white/5">
                        <div className="flex flex-wrap gap-3">
                            {selectedTags.map((tag) => (
                                <motion.div
                                    key={tag}
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="px-4 py-2 bg-glass-beige/20 border border-glass-beige/50 rounded-full text-glass-beige font-medium flex items-center gap-2 shadow-lg"
                                >
                                    <Check size={16} />
                                    <span>#{tag}</span>
                                    <motion.button {...pressProps('icon')}
 onClick={() => toggleTag(tag)}
 className="ml-1 p-1 hover:bg-white/10 rounded-full transition-colors"
 >
                                        <X size={14} />
                                    </motion.button>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Hashtag Categories Grid - Improved for mobile */}
                <div className="p-8 max-h-[65dvh] overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 gap-8">
                        {Object.entries(hashtags).map(([categoryKey, categoryData]) => {
                            const category = HASHTAG_CATEGORIES[categoryKey];
                            if (!category) return null;

                            return (
                                <motion.div
                                    key={categoryKey}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`border border-white/10 rounded-[18px] p-6 relative overflow-hidden group hover:border-white/20 transition-all`}
                                >
                                    {/* Glow effect */}
                                    <div className={`absolute top-0 right-0 w-32 h-32 ${category.bgGlow} rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity`}></div>

                                    {/* Category Header */}
                                    <div className="flex items-center gap-3 mb-4 relative z-10">
                                        <div className={`text-4xl p-3 bg-gradient-to-br ${category.gradient} bg-opacity-10 rounded-xl`}>
                                            {category.icon}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{category.name}</h3>
                                            <p className="text-xs text-glass-muted uppercase tracking-wider">{categoryKey.replace('_', ' ')}</p>
                                        </div>
                                    </div>

                                    {/* Tags Grid - Larger buttons with better spacing */}
                                    <div className="flex flex-wrap gap-3 relative z-10">
                                        {categoryData.tags && categoryData.tags.map((tag) => {
                                            const isSelected = selectedTags.includes(tag);
                                            const isDisabled = !isSelected && selectedTags.length >= 5;

                                            return (
                                                <motion.button {...pressProps('pill')}
 key={tag}
 onClick={() => !isDisabled && toggleTag(tag)}
 disabled={isDisabled}
 className={`min-w-[140px] px-6 py-5 rounded-[18px] font-bold text-base border shadow-lg ${isSelected
 ? 'bg-glass-beige text-glass-dark border-glass-beige scale-105 ring-2 ring-glass-beige/50'
 : isDisabled
 ? 'bg-white/5 text-white/30 border-white/5 cursor-not-allowed'
 : `${getTagColor(categoryKey)} border cursor-pointer hover:scale-105 `
 }`}
 >
                                                    {isSelected && <Check size={16} className="inline mr-2" />}
                                                    #{tag}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer Actions - Added Cancel Support */}
                <div className="p-6 bg-black/20 border-t border-white/10 flex items-center justify-between flex-wrap gap-4">
                    <div className="text-sm text-glass-muted">
                        {selectedTags.length < 3 ? (
                            <span className="text-orange-400">⚠️ 至少選擇 3 個標籤</span>
                        ) : (
                            <span className="text-green-400">✓ 已達最低要求</span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        {(onCancel || onClose) && (
                            <motion.button {...pressProps('row')}
 onClick={onCancel || onClose}
 className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium border border-white/10"
 >
                                取消
                            </motion.button>
                        )}
                        <motion.button {...pressProps('pill')}
 onClick={handleComplete}
 disabled={selectedTags.length < 3}
 className={`px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg ${selectedTags.length >= 3
 ? 'bg-glass-beige text-glass-dark hover:scale-105 '
 : 'bg-white/5 text-white/30 cursor-not-allowed'
 }`}
 >
                            <Target size={20} />
                            選擇這些目標
                        </motion.button>
                    </div>
                </div>
            </motion.div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 12px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
            `}</style>
        </div>
    );
};

export default EnhancedHashtagSelector;
