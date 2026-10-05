import React from 'react';
import { Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴

// Helper functions
const getTimePercentage = (dateString) => {
    if (!dateString) return 0;
    const date = new Date(dateString);
    const minutes = date.getHours() * 60 + date.getMinutes();
    const totalMinutes = 24 * 60;
    return (minutes / totalMinutes) * 100;
};

const getDurationPercentage = (durationSeconds) => {
    if (!durationSeconds) return 0;
    const totalSeconds = 24 * 60 * 60;
    return (durationSeconds / totalSeconds) * 100;
};

const NutrientTimingCard = ({ meals = [], workout }) => {
    // 1. 安全檢查：如果沒有運動數據，顯示空狀態
    if (!workout || !workout.timestamp || !Number.isFinite(new Date(workout.timestamp).getTime())) {
        return (
            <div className="bg-[#161415] p-6 rounded-[28px] border border-white/10 text-center mb-6">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="text-white/40" />
                </div>
                <p className="text-white/60 text-sm">今日尚未偵測到運動，無法分析營養時機。</p>
            </div>
        );
    }

    // 2. 計算位置 (0% - 100%)
    const workoutStartPos = getTimePercentage(workout.timestamp);
    const workoutWidth = getDurationPercentage(workout.duration || 3600); // 預設 1小時寬度
    const workoutEndPos = workoutStartPos + workoutWidth;

    // 3. 核心邏輯：分析表現 (AI Insight Logic)
    const analyzeTiming = () => {
        const workoutStart = new Date(workout.timestamp).getTime();
        const workoutEnd = workoutStart + (workout.duration || 3600) * 1000;

        // 窗口定義
        const preWindowStart = workoutStart - (3 * 60 * 60 * 1000); // 運動前 3 小時
        const postWindowEnd = workoutEnd + (2 * 60 * 60 * 1000);    // 運動後 2 小時

        // 尋找關鍵餐點 (Check strict range)
        const preWorkoutMeal = meals.find(m => {
            const t = new Date(m.timestamp).getTime();
            return t >= preWindowStart && t < workoutStart;
        });

        const postWorkoutMeal = meals.find(m => {
            const t = new Date(m.timestamp).getTime();
            return t > workoutEnd && t <= postWindowEnd;
        });

        // 產生建議
        if (postWorkoutMeal) {
            return {
                status: 'success',
                title: '已記錄訓練後餐點',
                desc: '訓練附近有餐點紀錄。恢復也取決於全天攝取、睡眠與訓練量，請繼續依每日目標安排飲食。',
                color: 'text-green-400',
                bg: 'bg-green-500/20'
            };
        } else if (Date.now() > postWindowEnd) {
            // 如果現在已經過了窗口期還沒吃
            return {
                status: 'warning',
                title: '確認是否漏記餐點',
                desc: '訓練後兩小時內沒有餐點紀錄，不代表沒有進食或已流失肌肉。如果吃過請補記；尚未吃可依每日目標安排正常餐點。',
                color: 'text-yellow-400',
                bg: 'bg-yellow-500/20'
            };
        } else {
            // 還在窗口期內
            return {
                status: 'neutral',
                title: '安排接下來的餐點',
                desc: '可在接下來的餐點補充蛋白質與主食，時機配合上一餐和訓練安排，不必追趕固定倒數時間。',
                color: 'text-blue-400',
                bg: 'bg-blue-500/20'
            };
        }
    };

    const insight = analyzeTiming();

    return (
        <div className="bg-[#161415] p-6 rounded-[28px] border border-white/10 relative overflow-hidden">
            {/* 標題區 */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                        <Clock size={16} className="text-blue-400" />
                    </div>
                    <h3 className="font-bold text-white text-lg">飲食與訓練時機</h3>
                </div>
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">24H TIMELINE</span>
            </div>

            {/* 時間軸視覺化 (Timeline Visualization) */}
            <div className="relative h-16 w-full mb-6">
                {/* 1. 底軌 (00:00 - 24:00) */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-white/10 rounded-full -translate-y-1/2"></div>

                {/* 2. 時間刻度 (0, 6, 12, 18, 24) */}
                {[0, 6, 12, 18, 24].map(h => (
                    <div key={h} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-2" style={{ left: `${(h / 24) * 100}%` }}>
                        <div className="h-2 w-[1px] bg-white/20"></div>
                        {h % 6 === 0 && h !== 0 && h !== 24 && (
                            <span className="text-[11px] text-white/30 font-mono mt-3">{h}:00</span>
                        )}
                    </div>
                ))}

                {/* 3. 運動區間 (Workout Block) */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 h-8 rounded-lg flex items-center justify-center z-10 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                    style={{
                        left: `${workoutStartPos}%`,
                        width: `${Math.max(workoutWidth, 2)}%`, // 最小顯示 2%
                        background: 'linear-gradient(90deg, #3B82F6 0%, #60A5FA 100%)'
                    }}
                >
                    <Dumbbell size={14} className="text-white drop-shadow-md" />
                </div>

                {/* 4. 餐點落點 (Meal Dots) */}
                {meals.map((meal, idx) => (
                    <div
                        key={idx}
                        className="absolute top-1/2 -translate-y-1/2 z-20 group"
                        style={{ left: `${getTimePercentage(meal.timestamp || new Date().toISOString())}%` }}
                    >
                        {/* 點點 */}
                        <div className="w-3 h-3 bg-[#FCD535] rounded-full border-2 border-[#161415] shadow-lg transform transition-transform hover:scale-150 cursor-pointer"></div>
                        {/* Tooltip (Hover 時顯示) */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[11px] font-bold rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-30">
                            {meal.name}
                        </div>
                    </div>
                ))}
            </div>

            {/* 智慧回饋區 (Insight Box) */}
            <div className={`p-4 rounded-[18px] flex gap-3 items-start ${insight.bg}`}>
                <div className={`mt-0.5 ${insight.color}`}>
                    {insight.status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                </div>
                <div>
                    <h4 className={`text-sm font-bold mb-1 ${insight.color}`}>{insight.title}</h4>
                    <p className="text-xs text-white/80 leading-relaxed">
                        {insight.desc}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default NutrientTimingCard;
