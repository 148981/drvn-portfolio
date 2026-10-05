import React, { useState, useEffect } from 'react';
import { Apple, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { brandColors as C } from '../utils/colors';
import { calcBMR_MifflinStJeor, calcTDEE } from '../utils/NutritionEngine';

const NutritionTracker = ({ userProfile, userId }) => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ calories: 0, protein: 0, carbs: 0, fats: 0 });

    // Goals Calculation (Mini version)
    const calculateGoals = () => {
        // 沒有資料就回 null，讓畫面顯示「去補資料」而不是一組編出來的目標
        if (!userProfile) return null;
        const weight = parseFloat(userProfile.weight);
        const height = parseFloat(userProfile.height);
        const age = parseInt(userProfile.age);
        const gender = userProfile.gender;

        // Mifflin-St Jeor
        const bmr = calcBMR_MifflinStJeor({ weight, height, age, gender });
        const tdee = calcTDEE(bmr, 1.55);
        return {
            calories: tdee,
            protein: Math.round(weight * 2.0)
        };
    };

    const GOALS = calculateGoals();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await apiClient.get(`/api/nutrition/daily/${userId}`);
                if (res.data && res.data.summary) {
                    setStats(res.data.summary);
                }
            } catch (e) {
                console.error("Failed to load nutrition summary");
            }
        };
        if (userId) fetchStats();
    }, [userId]);

    return (
        <div
            className="relative p-6 flex items-center justify-between overflow-hidden group cursor-pointer transition-all duration-300 rounded-[18px]"
            style={{
                backgroundColor: C.stone2,
                border: '1px solid rgba(224, 216, 211, 0.05)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
            }}
            onClick={() => navigate('/nutrition-mobile')}
        >
            {/* Leather Texture Overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-40"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stub='7'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E")`,
                    mixBlendMode: 'overlay'
                }}
            />

            {/* Left Info */}
            <div className="z-10 flex items-center gap-4">
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{
                        backgroundColor: C.stone,
                        border: '1px solid rgba(198, 142, 93, 0.3)',
                        color: C.bronze
                    }}
                >
                    <Apple size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold" style={{ color: C.cream }}>Daily Nutrition</h3>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(224, 216, 211, 0.6)' }}>
                        <span>{GOALS ? `${Math.round(stats.calories)} / ${GOALS.calories} kcal` : '先填身體數據才算得出目標'}</span>
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgba(224, 216, 211, 0.3)' }}></span>
                        <span>{Math.round(stats.protein)}g Protein</span>
                    </div>
                </div>
            </div>

            {/* Right Action */}
            <div className="z-10 flex items-center gap-2 group-hover:translate-x-1 transition-transform" style={{ color: C.bronze }}>
                <span className="text-sm font-bold tracking-wide">Details</span>
                <ChevronRight size={18} />
            </div>

            {/* Progress Bar Background */}
            <div className="absolute bottom-0 left-0 h-1 w-full" style={{ backgroundColor: 'rgba(198, 142, 93, 0.1)' }}>
                <div
                    className="h-full transition-all duration-500"
                    style={{
                        width: GOALS ? `${Math.min(100, (stats.calories / GOALS.calories) * 100)}%` : '0%',
                        backgroundColor: C.bronze
                    }}
                ></div>
            </div>
        </div>
    );
};

export default NutritionTracker;
