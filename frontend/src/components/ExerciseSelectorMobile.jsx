import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Play, CheckCircle2, Eye, Lock } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import apiClient from '../api/client';
import { specFor, exerciseStatus, EXERCISE_ORDER, EXERCISE_SPEC, STATUS_COLOR } from '../lib/exerciseSpec';

/* ⚠️ 背景圖以前硬寫在 render 中間的一個 bgImages 物件裡，歷史頁又各寫一份，
   而且原本那份 EXERCISE_STYLES 根本沒人用（死碼）。
   現在顏色與圖一律從 exerciseSpec 取 —— 動作長什麼樣只有一份定義。 */

const FontStyle = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap');
        
        .font-tenor { font-family: 'Tenor Sans', sans-serif; }
        .font-jakarta { font-family: 'Plus Jakarta Sans', sans-serif; }
    `}</style>
);

// 【v4.6 核心五動作】每部位一個、以拍攝可靠度為先：
//   深蹲(腿)、硬舉(後鏈)、臥推(胸)、肩推(肩)、划船(背)。
//   滑輪下拉與划船部位重疊且坐姿+機器遮擋最嚴重 → 從新分析入口移除
//  （後端與歷史紀錄保留，舊資料照常可查）。
// 【v9.2】順序改成「有驗證過角度的排前面」（見 lib/exerciseSpec.js）——
//   深蹲、臥推是本專題做過效度實驗的兩個動作，其餘三個沒有對照影片，
//   放後面並標成未驗證，避免使用者以為它們一樣可靠。
const curate = (list) => EXERCISE_ORDER
    .map((k) => list.find((e) => e.key === k))
    .filter(Boolean);

const ExerciseSelectorMobile = () => {
    const navigate = useNavigate();
    const [exercises, setExercises] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadExercises(); }, []);

    const loadExercises = async () => {
        try {
            const res = await apiClient.get('/api/multi-exercise/exercises');
            setExercises(curate(res.data.exercises || []));
        } catch {
            // 連不到後端時，至少讓畫面照 spec 顯示（模板狀態一律當成沒有）
            setExercises(EXERCISE_ORDER.map((k) => {
                const sp = specFor(k);
                return { key: k, name_zh: sp?.name || k, name_en: sp?.nameEn || '', icon: '', templates: {} };
            }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div 
            className="min-h-[100dvh] flex flex-col font-sans relative pb-10 overflow-hidden" 
            style={{ 
                backgroundColor: '#161415', 
                maxWidth: '430px', 
                margin: '0 auto',
                backgroundImage: `url('${encodeURI('/download/_ (2).jpeg')}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
            }}
        >
            <FontStyle />
            {/* Dark overlay for text readability */}
            <div className="fixed inset-0 bg-black/80 z-0 pointer-events-none" style={{ maxWidth: '430px', margin: '0 auto' }} />

            {/* Header */}
            <div className="px-8 pb-4 relative z-10 w-full mb-8" style={{ paddingTop: 'max(64px, calc(env(safe-area-inset-top) + 24px))' }}>
                <motion.button {...pressProps('row')}
 onClick={() => navigate('/analysis-choice-mobile')}
 className="flex items-center gap-2 mb-10 opacity-30 hover:opacity-100 text-white hover:translate-x-[-4px]"
 >
                    <ArrowLeft size={16} />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em]">Back</span>
                </motion.button>
                
                <div className="space-y-3">
                    <h1 className="text-6xl font-normal tracking-tighter text-[#F6F4F1] leading-none font-tenor">
                        Exercises
                    </h1>
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em] font-jakarta">
                        Select Training Movement
                    </p>
                </div>
            </div>

            {/* Carousel Container */}
            <div className="flex-1 relative z-10 w-full flex flex-col justify-center">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                ) : (
                    <div 
                        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar px-8 gap-6 pb-12"
                        style={{ scrollPadding: '2rem' }}
                    >
                        {exercises.map((ex) => {

                            // 【v9.2】三級狀態，見 lib/exerciseSpec.js
                            //   ready 可分析 · needTpl 先建模板 · unvalidated 沒做過角度實驗
                            const sp = specFor(ex.key);
                            const st = exerciseStatus(ex.key, ex.templates ?? ex.has_template);
                            const locked = st.level === 'unvalidated';
                            const dot = STATUS_COLOR[st.level];
                            const go = (path) => navigate(path, {
                                state: {
                                    exerciseKey: ex.key, exerciseName: ex.name_zh,
                                    exerciseNameEn: ex.name_en, icon: ex.icon, multiExercise: true,
                                },
                            });

                            return (
                                <div
                                    key={ex.key}
                                    className="snap-center shrink-0 w-[85vw] aspect-[3/4.2] rounded-[36px] relative overflow-hidden group shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10"
                                    style={{ maxWidth: '340px' }}
                                >
                                    <img loading="lazy" decoding="async"
                                        src={EXERCISE_SPEC[ex.key]?.image || "/download/default.jpg"}
                                        alt={ex.name_zh}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-110"
                                        style={locked ? { filter: 'grayscale(1)' } : undefined}
                                    />

                                    <div className={`absolute inset-0 z-[15] bg-gradient-to-b ${locked ? 'from-black/70 via-black/80 to-black/95' : 'from-black/10 via-black/30 to-black/95'}`} />

                                    {/* 機位徽章 —— 顯示「已驗證過的機位」，不是偏好視角 */}
                                    <div className="absolute top-8 right-8 z-20 px-3 py-1.5 rounded-full border backdrop-blur-md flex items-center gap-2"
                                        style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}>
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                                        <span className="text-[9px] font-black uppercase tracking-widest font-jakarta"
                                            style={{ color: locked ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.8)' }}>
                                            {sp?.viewName || st.label}
                                        </span>
                                    </div>

                                    {/* 中央：一個標題 + 一行狀態，不再堆疊資訊 */}
                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-9 text-center">
                                        <div className="w-10 h-px bg-white/30 mb-8 group-hover:w-16 transition-all duration-700" />
                                        <h3 className="text-5xl font-normal mb-4 leading-[1.1] tracking-tighter drop-shadow-2xl font-tenor"
                                            style={{ color: locked ? 'rgba(246,244,241,0.5)' : '#fff' }}>
                                            {ex.name_zh}
                                        </h3>
                                        <p className="text-[9px] font-black text-white/40 tracking-[0.3em] uppercase font-jakarta">
                                            {ex.name_en}
                                        </p>
                                        <p className="mt-6 text-[12px] leading-relaxed font-jakarta"
                                            style={{ color: locked ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.62)' }}>
                                            {locked ? '沒做過角度效度實驗' : st.note}
                                        </p>
                                    </div>

                                    {/* 底部：狀態決定有哪些鍵 */}
                                    <div className="absolute bottom-10 left-9 right-9 z-30 flex flex-col gap-3">
                                        {locked ? (
                                            <div className="w-full py-4 rounded-[18px] border border-white/10 bg-white/[0.04] flex items-center justify-center gap-2">
                                                <Lock size={13} className="text-white/35" strokeWidth={2} />
                                                <span className="text-[12px] font-black tracking-[0.2em] text-white/35 font-jakarta">
                                                    尚未開放
                                                </span>
                                            </div>
                                        ) : st.level === 'needTpl' ? (
                                            <motion.button {...pressProps('pill')}
 onClick={(e) => { e.stopPropagation(); go('/template-upload-mobile'); }}
 className="w-full py-4 rounded-[18px] text-[12px] font-black tracking-[0.2em] bg-[#F6F4F1] text-[#161415] shadow-2xl hover:bg-white font-jakarta"
 >
                                                建立模板
                                            </motion.button>
                                        ) : (
                                            <>
                                                <motion.button {...pressProps('pill')}
 onClick={(e) => { e.stopPropagation(); go('/template-upload-mobile'); }}
 className="w-full py-4 rounded-[18px] text-[12px] font-black tracking-[0.2em] border border-white/20 text-white/60 backdrop-blur-lg hover:bg-white/10 font-jakarta"
 >
                                                    重建模板
                                                </motion.button>
                                                <motion.button {...pressProps('pill')}
 onClick={(e) => { e.stopPropagation(); go('/upload-mobile'); }}
 className="w-full py-4 rounded-[18px] text-[12px] font-black tracking-[0.2em] bg-[#F6F4F1] text-[#161415] shadow-2xl hover:bg-white font-jakarta"
 >
                                                    開始分析
                                                </motion.button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pagination indicator (optional but premium) */}
            {!loading && (
                <div className="flex justify-center gap-2 mt-2 z-10">
                    {exercises.map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ExerciseSelectorMobile;
