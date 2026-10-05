import React, { useRef, useState } from 'react';
import apiClient from '../api/client';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Camera, CheckCircle2, MoreHorizontal, Share2, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUserId, resolveDisplayName } from '../utils/auth';
import { toast } from '../utils/toast';
import { sessionVolume, exerciseVolume } from '../utils/strengthMath';

const FitnessCompletionCard = ({
    exercises = [],
    durationSeconds = 0,
    calories = 0,
    completedSets = 0,
    completedDate = new Date(),
    onShare,
    onExit
}) => {
    const navigate = useNavigate();
    const [isSharing, setIsSharing] = useState(false);
    const [uploadedPhoto, setUploadedPhoto] = useState(null);
    const fileInputRef = useRef(null);

    const handlePhotoSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setUploadedPhoto(e.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handleConfirmShare = async () => {
        setIsSharing(true);
        try {
            const formData = new FormData();
            /* 🩹 2026-08 稽核：這裡原本寫死 user_name: 'Mike'。
               本元件目前是死碼（WorkoutSessionViewMobile 有 import 但從未渲染），
               所以還沒出包 —— 但只要哪天被重新接上，所有人分享到社群動態的
               貼文署名都會變成 'Mike'。改用與 EvolutionCompletionCard 同一支
               resolveDisplayName()，取不到名字時回傳「訓練者 #XXXX」而不是別人的名字。 */
            const uid = getUserId();
            formData.append('user_id', uid);
            formData.append('user_name', resolveDisplayName(uid, localStorage.getItem('userName')));
            /* ⚠️ 這裡原本送 'strength'，但 session_data 裡寫的是 'fitness'，
               而後端只認 'fitness' —— 徒手／核心訓練（volume_kg = 0）
               會被判成跑步、跑進跑步社群牆變成 0 公里的卡。
               兩邊統一成 'fitness'（後端也已放寬接受 'strength'，雙保險）。 */
            formData.append('activity_type', 'fitness');
            formData.append('communities', JSON.stringify(['fitness']));
            formData.append('caption', `Just crushed a workout! Finished ${exercises.length} exercises. 💪🔥 #Strength`);
            formData.append('privacy', 'public');

            const sessionStats = {
                activity_type: 'fitness',
                stats: {
                    duration: durationSeconds,
                    calories: calories,
                    volume_kg: totalVolume,
                    sets_completed: completedSets
                },
                exercises: exercises,
                volume_kg: totalVolume,
                sets_completed: completedSets
            };
            formData.append('session_data', JSON.stringify(sessionStats));

            if (uploadedPhoto) {
                formData.append('photo', uploadedPhoto);
            }

            /* 原本寫死 `http://${hostname}:8000` —— 打包版靠 utils/apiHostFix 攔截才沒出事，
               https 網頁版會被當 mixed content 擋掉，而且不會帶 JWT。改走 apiClient。 */
            await apiClient.post('/api/activities/create', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            navigate('/fitness-community-mobile');
        } catch (err) {
            console.error('API Error:', err);
            toast.error('分享失敗，請稍後再試');
            setIsSharing(false);
        }
    };

    // Calculate total volume
    const totalVolume = sessionVolume({ exercises });

    const dateStr = new Date(completedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const durationMins = Math.floor(durationSeconds / 60);

    const LuxuryStyles = () => (
        <style>{`
            :root {
                --bg-color-start: #0F1117; /* 深炭黑 */
                --bg-color-end: #1A1D29;   /* 午夜藍 */
                --card-bg: rgba(255, 255, 255, 0.05); /* 半透明磨砂玻璃底色 */
                --card-border: rgba(255, 255, 255, 0.1);
                --accent-gold: #D4AF37; /* 奢華金色 */
                --text-primary: #FFFFFF;
                --text-secondary: rgba(255, 255, 255, 0.6);
                --glow-shadow: 0 4px 30px rgba(0, 0, 0, 0.5); /* 柔和發光陰影 */
            }

            .luxury-page {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background: linear-gradient(135deg, var(--bg-color-start), var(--bg-color-end));
                color: var(--text-primary);
                min-height: 100dvh;
                padding: 24px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: center;
            }

            .luxury-container {
                width: 100%;
                max-width: 400px;
                display: flex;
                flex-direction: column;
                gap: 24px;
            }

            /* --- 頂部標題區 --- */
            .luxury-header {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                margin-top: 12px;
            }

            .luxury-header h1 {
                font-size: 32px;
                font-weight: 800;
                margin: 0;
                line-height: 1.1;
                letter-spacing: -0.5px;
            }

            .luxury-header span {
                font-weight: 800;
                color: var(--accent-gold);
            }

            .luxury-date {
                font-size: 14px;
                color: var(--text-secondary);
                font-weight: 500;
            }

            /* --- 數據總覽卡片區 --- */
            .stats-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }

            .stat-card {
                background: var(--card-bg);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid var(--card-border);
                border-radius: 18px;
                padding: 20px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                box-shadow: var(--glow-shadow);
                position: relative;
                overflow: hidden;
            }
            
            .stat-card.main-card {
                grid-column: 1 / span 2;
                background: linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(212, 175, 55, 0.05));
                border-color: rgba(212, 175, 55, 0.3);
            }

            .stat-card .label {
                font-size: 13px;
                font-weight: 500;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 1px;
                position: relative; z-index: 2;
            }

            .stat-card .value {
                font-size: 36px;
                font-weight: 800;
                color: var(--accent-gold);
                margin-top: 8px;
                position: relative; z-index: 2;
            }

            .stat-card .unit {
                font-size: 16px;
                font-weight: 500;
                color: var(--text-secondary);
                margin-left: 4px;
            }
            
            /* 裝飾圖標 */
            .stat-card .icon-bg {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                pointer-events: none;
                z-index: 1;
            }
            .main-card .icon-bg {
                right: 10px;
                font-size: 60px;
                opacity: 0.1;
            }
            .small-card .value {
                font-size: 28px;
            }
            .small-card .icon-bg {
                top: 20px;
                right: 20px;
                transform: none;
                opacity: 0.1;
            }

            /* --- 拍照按鈕區 --- */
            .capture-btn {
                background: var(--card-bg);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid var(--card-border);
                border-radius: 18px;
                padding: 30px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                box-shadow: var(--glow-shadow);
                cursor: pointer;
                transition: transform 0.2s ease, border-color 0.2s ease;
                position: relative;
                overflow: hidden;
            }
            
            .capture-btn:active {
                transform: scale(0.98);
                border-color: var(--accent-gold);
            }

            .capture-btn .camera-icon {
                font-size: 28px;
                color: var(--accent-gold);
                background: rgba(212, 175, 55, 0.1);
                padding: 15px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
            }

            .capture-btn span {
                font-size: 16px;
                font-weight: 600;
            }

            .capture-btn small {
                font-size: 12px;
                color: var(--text-secondary);
                letter-spacing: 1px;
            }

            /* --- 訓練記錄列表區 --- */
            .session-log {
                background: var(--card-bg);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid var(--card-border);
                border-radius: 24px;
                padding: 24px;
                box-shadow: var(--glow-shadow);
                margin-bottom: 80px; /* Space for footer */
            }

            .log-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }

            .log-header h2 {
                font-size: 20px;
                font-weight: 700;
                margin: 0;
            }
            
            .log-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .log-item {
                display: flex;
                align-items: center;
                background: rgba(255, 255, 255, 0.03); 
                padding: 16px;
                border-radius: 18px;
                border: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .log-item .check-icon {
                color: var(--accent-gold);
                margin-right: 16px;
            }

            .log-item-content h3 {
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 4px 0;
            }

            .log-item-content p {
                font-size: 13px;
                color: var(--text-secondary);
                margin: 0;
            }
            
            .more-logs {
                text-align: center;
                margin-top: 20px;
                font-size: 14px;
                font-weight: 600;
                color: var(--accent-gold);
                cursor: pointer;
            }

            /* --- Tooltip/Popups --- */
            .floating-footer {
                position: fixed;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(20, 20, 20, 0.8);
                backdrop-filter: blur(20px);
                padding: 8px 10px;
                border-radius: 100px;
                border: 1px solid rgba(255,255,255,0.1);
                display: flex;
                gap: 10px;
                z-index: 100;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            }
            
            .nav-btn {
                height: 52px;
                border-radius: 28px;
                border: none;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            }
            .btn-home {
                width: 52px;
                background: #fff;
                color: #000;
                border-radius: 50%;
            }
            .btn-share {
                background: var(--accent-gold);
                color: #000;
                padding: 0 24px;
                font-weight: 700;
                gap: 8px;
            }

        `}</style>
    );

    return (
        <div className="luxury-page">
            <LuxuryStyles />
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />

            <div className="luxury-container">
                {/* Header */}
                <div className="luxury-header">
                    <h1>訓練<br /><span>完成</span></h1>
                    <div className="luxury-date">{dateStr}</div>
                </div>

                {/* Stats Grid */}
                <div className="stats-grid">
                    <div className="stat-card main-card">
                        <div className="label">Total Volume</div>
                        <div className="value">
                            {(totalVolume / 1000).toFixed(1)}
                            <span className="unit">t</span>
                        </div>
                        {/* FontAwesome Icon for Decor */}
                        <i className="fa-solid fa-dumbbell icon-bg"></i>
                    </div>
                    <div className="stat-card small-card">
                        <div className="label">Energy Burned</div>
                        <div className="value">
                            {calories}
                            <span className="unit">kcal</span>
                        </div>
                        <i className="fa-solid fa-fire icon-bg"></i>
                    </div>
                    <div className="stat-card small-card">
                        <div className="label">Duration</div>
                        <div className="value">
                            {durationMins}
                            <span className="unit">m</span>
                        </div>
                        <i className="fa-regular fa-clock icon-bg"></i>
                    </div>
                </div>

                {/* Capture Button */}
                <div className="capture-btn" onClick={() => fileInputRef.current.click()}>
                    {uploadedPhoto ? (
                        <div className="absolute inset-0 z-10 w-full h-full">
                            <img loading="lazy" decoding="async" src={uploadedPhoto} className="w-full h-full object-cover opacity-60" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <span className="text-white font-bold drop-shadow-md">Photo Added</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="camera-icon">
                                <Camera size={24} />
                            </div>
                            <span>Capture the Moment</span>
                            <small>上傳照片</small>
                        </>
                    )}
                </div>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoSelect}
                    className="hidden"
                    accept="image/*"
                />

                {/* Session Log */}
                <div className="session-log">
                    <div className="log-header">
                        <h2>Session Log</h2>
                        <MoreHorizontal size={24} className="text-white/50" />
                    </div>
                    <div className="log-list">
                        {exercises.slice(0, 3).map((ex, i) => (
                            <div key={i} className="log-item">
                                <CheckCircle2 className="check-icon" size={20} />
                                <div className="log-item-content">
                                    <h3>{ex.name}</h3>
                                    <p>{Array.isArray(ex.sets) ? ex.sets.length : (ex.sets || 3)} Sets • {ex.reps || '8-12'} Reps</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    {exercises.length > 3 && (
                        <div className="more-logs">+ {exercises.length - 3} MORE</div>
                    )}
                </div>

                {/* Floating Footer */}
                <div className="floating-footer">
                    <motion.button {...pressProps('row')} aria-label="回首頁" onClick={onExit} className="nav-btn btn-home">
                        <Home size={22} />
                    </motion.button>
                    <motion.button {...pressProps('row')} onClick={isSharing ? null : handleConfirmShare} className="nav-btn btn-share">
                        <span>{isSharing ? 'POSTING...' : 'SHARE'}</span>
                        {!isSharing && <Share2 size={18} />}
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default FitnessCompletionCard;
