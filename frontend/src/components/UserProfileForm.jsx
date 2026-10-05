import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { User, Target, Flame, Heart, Scale } from 'lucide-react';
import { toast } from '../utils/toast';
import { calcBMR_MifflinStJeor, calcTDEE } from '../utils/NutritionEngine';

const UserProfileForm = ({ onSubmit, onSkip }) => {
    const [formData, setFormData] = useState({
        user_id: `user_${Date.now()}`,
        name: '',
        height_cm: 170,
        weight_kg: 65,
        age: 26,
        gender: 'male',
        activity_level: 'moderate', // sedentary, light, moderate, active, very_active
        fitness_level: 'beginner',
        goals: []
    });

    const [previousData, setPreviousData] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Load previous profile data on mount
    useEffect(() => {
        const loadPreviousData = async () => {
            try {
                const response = await fetch(`http://${window.location.hostname}:8000/api/user/profiles`);
                if (response.ok) {
                    const profiles = await response.json();
                    const profileList = Object.values(profiles);
                    if (profileList.length > 0) {
                        const latest = profileList.sort((a, b) =>
                            new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
                        )[0];
                        setPreviousData(latest);

                        // Auto-load previous data
                        if (latest.age && latest.height_cm && latest.weight_kg) {
                            setFormData(prev => ({
                                ...prev,
                                age: latest.age,
                                height_cm: latest.height_cm,
                                weight_kg: latest.weight_kg,
                                gender: ['male', 'female'].includes(String(latest.gender)) ? latest.gender : null,
                                activity_level: latest.activity_level || 'moderate'
                            }));
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading previous data:', error);
            }
        };
        loadPreviousData();
    }, []);

    // ========== HEALTH CALCULATIONS ==========

    // BMR (Basal Metabolic Rate) - Mifflin-St Jeor Equation
    const bmr = useMemo(() => {
        const { weight_kg, height_cm, age, gender } = formData;
        if (!weight_kg || !height_cm || !age) return 0;

        return calcBMR_MifflinStJeor({ weight: weight_kg, height: height_cm, age, gender });
    }, [formData.weight_kg, formData.height_cm, formData.age, formData.gender]);

    // TDEE (Total Daily Energy Expenditure)
    const tdee = useMemo(() => {
        const multipliers = {
            sedentary: 1.2,
            light: 1.375,
            moderate: 1.55,
            active: 1.725,
            very_active: 1.9
        };
        return Math.round(bmr * multipliers[formData.activity_level]);
    }, [bmr, formData.activity_level]);

    // Heart Rate Zones
    const heartRateZones = useMemo(() => {
        const { age } = formData;
        if (!age) return null;

        const maxHR = Math.round(208 - (0.7 * age));
        return {
            maxHR,
            zone1: { min: Math.round(maxHR * 0.50), max: Math.round(maxHR * 0.60), name: 'Warm-up' },
            zone2: { min: Math.round(maxHR * 0.60), max: Math.round(maxHR * 0.70), name: 'Fat Burn' },
            zone3: { min: Math.round(maxHR * 0.70), max: Math.round(maxHR * 0.80), name: 'Cardio' },
            zone4: { min: Math.round(maxHR * 0.80), max: Math.round(maxHR * 0.90), name: 'Threshold' },
            zone5: { min: Math.round(maxHR * 0.90), max: maxHR, name: 'Peak' }
        };
    }, [formData.age]);

    // BMI & Ideal Weight Range
    const bodyMetrics = useMemo(() => {
        const { weight_kg, height_cm } = formData;
        if (!weight_kg || !height_cm) return null;

        const height_m = height_cm / 100;
        const bmi = weight_kg / (height_m * height_m);
        const idealMin = Math.round(18.5 * height_m * height_m);
        const idealMax = Math.round(24.9 * height_m * height_m);

        let status = 'Healthy';
        if (bmi < 18.5) status = 'Light';
        else if (bmi >= 25 && bmi < 30) status = 'Strong';
        else if (bmi >= 30) status = 'Heavy';

        return {
            bmi: bmi.toFixed(1),
            status,
            idealMin,
            idealMax
        };
    }, [formData.weight_kg, formData.height_cm]);

    // 🔴 Fix(validation): 各欄位合理邊界值 — 防止 age=0 導致 BMR 負值、weight=999 污染演算法
    const FIELD_BOUNDS = {
        age:       { min: 10,  max: 100 },
        height_cm: { min: 100, max: 250 },
        weight_kg: { min: 30,  max: 300 },
    };

    const clamp = (name, val) => {
        const bounds = FIELD_BOUNDS[name];
        if (!bounds) return val;
        return Math.max(bounds.min, Math.min(bounds.max, val));
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSliderChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: clamp(name, parseInt(value)) }));
    };

    const handleGoalToggle = (goal) => {
        setFormData(prev => ({
            ...prev,
            goals: prev.goals.includes(goal)
                ? prev.goals.filter(g => g !== goal)
                : [...prev.goals, goal]
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaveSuccess(false);

        // 🔴 Fix(validation): 提交前夾值，防止手動輸入的極端值流入後端
        const sanitized = {
            ...formData,
            /* ⚠️ 沒填就不要送 25／170／65 —— 那會被存成使用者真正的身體數據，
               之後所有熱量與目標都從一個不存在的人算出來。 */
            ...(parseInt(formData.age) > 0 ? { age: clamp('age', parseInt(formData.age)) } : { age: null }),
            ...(parseInt(formData.height_cm) > 0 ? { height_cm: clamp('height_cm', parseInt(formData.height_cm)) } : { height_cm: null }),
            ...(parseFloat(formData.weight_kg) > 0 ? { weight_kg: clamp('weight_kg', parseFloat(formData.weight_kg)) } : { weight_kg: null }),
        };

        try {
            const formBody = new FormData();
            Object.keys(sanitized).forEach(key => {
                if (key === 'goals') {
                    formBody.append(key, JSON.stringify(sanitized[key]));
                } else if (sanitized[key] !== '') {
                    formBody.append(key, sanitized[key]);
                }
            });

            const response = await fetch(`http://${window.location.hostname}:8000/api/user/profile`, {
                method: 'POST',
                body: formBody
            });

            const data = await response.json();

            // Show success message without reload
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);

            // Call parent callback if exists
            if (onSubmit) {
                onSubmit(data.profile);
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            toast.error('個人資料儲存失敗，請稍後再試');
        }
    };

    return (
        <div className="min-h-[100dvh] page-top-safe" style={{
            background: 'linear-gradient(to bottom right, #E5E8E5, #CBD0C8, #B1C7C8)',
            padding: '2rem'
        }}>
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #ED9851, #F0A870)',
                            boxShadow: '0 8px 24px rgba(237, 152, 81, 0.25)'
                        }}>
                        <User size={36} style={{ color: '#FFFFFF' }} />
                    </div>
                    <h1 style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '2.5rem',
                        fontWeight: 400,
                        color: '#7B84A5',
                        marginBottom: '0.5rem'
                    }}>Your Profile</h1>
                    <p style={{ color: '#7B84A5', opacity: 0.7 }}>Discover your body's language</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Input Section */}
                    <div className="relative" style={{
                        backgroundColor: '#F5F3F0',
                        borderRadius: '24px',
                        padding: '2rem',
                        boxShadow: '0 4px 24px rgba(123, 132, 165, 0.08)',
                        border: '1px solid rgba(203, 208, 200, 0.3)'
                    }}>
                        <div className="space-y-6">
                            {/* Name */}
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    color: '#7B84A5',
                                    opacity: 0.7,
                                    marginBottom: '0.5rem',
                                    fontWeight: 600
                                }}>Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    placeholder="Enter your name"
                                    style={{
                                        width: '100%',
                                        padding: '0.875rem 1rem',
                                        backgroundColor: '#F9F8F6',
                                        border: '2px solid #E8E6E3',
                                        borderRadius: '12px',
                                        fontSize: '1rem',
                                        color: '#4A4A4A',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.borderColor = '#ED9851';
                                        e.target.style.boxShadow = '0 0 0 3px rgba(237, 152, 81, 0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = '#E8E6E3';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                />
                            </div>

                            {/* Gender & Activity Level */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        opacity: 0.7,
                                        marginBottom: '0.5rem',
                                        fontWeight: 600
                                    }}>Gender</label>
                                    <select
                                        name="gender"
                                        value={formData.gender}
                                        onChange={handleChange}
                                        style={{
                                            width: '100%',
                                            padding: '0.875rem 1rem',
                                            backgroundColor: '#F9F8F6',
                                            border: '2px solid #E8E6E3',
                                            borderRadius: '12px',
                                            fontSize: '1rem',
                                            color: '#4A4A4A',
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        opacity: 0.7,
                                        marginBottom: '0.5rem',
                                        fontWeight: 600
                                    }}>Activity Level</label>
                                    <select
                                        name="activity_level"
                                        value={formData.activity_level}
                                        onChange={handleChange}
                                        style={{
                                            width: '100%',
                                            padding: '0.875rem 1rem',
                                            backgroundColor: '#F9F8F6',
                                            border: '2px solid #E8E6E3',
                                            borderRadius: '12px',
                                            fontSize: '1rem',
                                            color: '#4A4A4A',
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="sedentary">Sedentary</option>
                                        <option value="light">Light</option>
                                        <option value="moderate">Moderate</option>
                                        <option value="active">Active</option>
                                        <option value="very_active">Very Active</option>
                                    </select>
                                </div>
                            </div>

                            {/* Age Slider */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label style={{
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        opacity: 0.7,
                                        fontWeight: 600
                                    }}>Age</label>
                                    <span style={{
                                        fontSize: '1.5rem',
                                        fontWeight: 300,
                                        color: '#ED9851'
                                    }}>{formData.age}</span>
                                </div>
                                <input
                                    type="range"
                                    min="15"
                                    max="80"
                                    value={formData.age}
                                    onChange={(e) => handleSliderChange('age', e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '6px',
                                        borderRadius: '3px',
                                        outline: 'none',
                                        background: `linear-gradient(to right, #ED9851 0%, #ED9851 ${((formData.age - 15) / 65) * 100}%, #E8E6E3 ${((formData.age - 15) / 65) * 100}%, #E8E6E3 100%)`,
                                        appearance: 'none',
                                        WebkitAppearance: 'none'
                                    }}
                                    className="slider"
                                />
                            </div>

                            {/* Height Slider */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label style={{
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        opacity: 0.7,
                                        fontWeight: 600
                                    }}>Height (cm)</label>
                                    <span style={{
                                        fontSize: '1.5rem',
                                        fontWeight: 300,
                                        color: '#7B84A5'
                                    }}>{formData.height_cm}</span>
                                </div>
                                <input
                                    type="range"
                                    min="140"
                                    max="220"
                                    value={formData.height_cm}
                                    onChange={(e) => handleSliderChange('height_cm', e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '6px',
                                        borderRadius: '3px',
                                        outline: 'none',
                                        background: `linear-gradient(to right, #7B84A5 0%, #7B84A5 ${((formData.height_cm - 140) / 80) * 100}%, #E8E6E3 ${((formData.height_cm - 140) / 80) * 100}%, #E8E6E3 100%)`,
                                        appearance: 'none',
                                        WebkitAppearance: 'none'
                                    }}
                                    className="slider"
                                />
                            </div>

                            {/* Weight Slider */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label style={{
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        opacity: 0.7,
                                        fontWeight: 600
                                    }}>Weight (kg)</label>
                                    <span style={{
                                        fontSize: '1.5rem',
                                        fontWeight: 300,
                                        color: '#B1C7C8'
                                    }}>{formData.weight_kg}</span>
                                </div>
                                <input
                                    type="range"
                                    min="40"
                                    max="150"
                                    value={formData.weight_kg}
                                    onChange={(e) => handleSliderChange('weight_kg', e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '6px',
                                        borderRadius: '3px',
                                        outline: 'none',
                                        background: `linear-gradient(to right, #B1C7C8 0%, #B1C7C8 ${((formData.weight_kg - 40) / 110) * 100}%, #E8E6E3 ${((formData.weight_kg - 40) / 110) * 100}%, #E8E6E3 100%)`,
                                        appearance: 'none',
                                        WebkitAppearance: 'none'
                                    }}
                                    className="slider"
                                />
                            </div>

                            {/* Fitness Level & Goals - Compact */}
                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        opacity: 0.7,
                                        marginBottom: '0.75rem',
                                        fontWeight: 600
                                    }}>Level</label>
                                    <div className="flex flex-col gap-2">
                                        {['beginner', 'intermediate', 'advanced'].map((level) => (
                                            <motion.button {...pressProps('row')}
 key={level}
 type="button"
 onClick={() => setFormData(prev => ({ ...prev, fitness_level: level }))}
 style={formData.fitness_level === level
 ? {
 padding: '0.5rem 0.75rem',
 background: '#7B84A5',
 color: '#FFFFFF',
 border: 'none',
 borderRadius: '8px',
 fontSize: '0.75rem',
 fontWeight: 600,
 cursor: 'pointer'
 }
 : {
 padding: '0.5rem 0.75rem',
 backgroundColor: 'transparent',
 color: '#7B84A5',
 border: '1px solid rgba(123, 132, 165, 0.3)',
 borderRadius: '8px',
 fontSize: '0.75rem',
 cursor: 'pointer'
 }
 }
 >
                                                {level.charAt(0).toUpperCase() + level.slice(1)}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        opacity: 0.7,
                                        marginBottom: '0.75rem',
                                        fontWeight: 600
                                    }}>Goals</label>
                                    <div className="flex flex-col gap-2">
                                        {['strength', 'endurance', 'weight_loss'].map((goal) => (
                                            <motion.button {...pressProps('row')}
 key={goal}
 type="button"
 onClick={() => handleGoalToggle(goal)}
 style={formData.goals.includes(goal)
 ? {
 padding: '0.5rem 0.75rem',
 background: '#B1C7C8',
 color: '#3A3F4A',
 border: 'none',
 borderRadius: '8px',
 fontSize: '0.75rem',
 fontWeight: 600,
 cursor: 'pointer'
 }
 : {
 padding: '0.5rem 0.75rem',
 backgroundColor: 'transparent',
 color: '#B1C7C8',
 border: '1px solid rgba(177, 199, 200, 0.4)',
 borderRadius: '8px',
 fontSize: '0.75rem',
 cursor: 'pointer'
 }
 }
 >
                                                {goal.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Health Metrics Cards */}
                    <div>
                        <h2 style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.75rem',
                            color: '#7B84A5',
                            marginBottom: '1rem',
                            textAlign: 'center'
                        }}>Your Body Metrics</h2>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Card 1: Life Fuel (BMR/TDEE) */}
                            <div style={{
                                background: 'rgba(245, 243, 240, 0.8)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(203, 208, 200, 0.3)',
                                borderRadius: '18px',
                                padding: '1.5rem',
                                boxShadow: '0 8px 24px rgba(123, 132, 165, 0.08)'
                            }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <Flame size={20} style={{ color: '#ED9851' }} />
                                    <h3 style={{
                                        fontSize: '0.875rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        fontWeight: 600
                                    }}>Life Fuel</h3>
                                </div>
                                <div style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: '2.5rem',
                                    fontWeight: 300,
                                    color: '#ED9851',
                                    marginBottom: '0.5rem'
                                }}>{bmr.toLocaleString()}</div>
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: '#7B84A5',
                                    opacity: 0.7,
                                    marginBottom: '1rem'
                                }}>kcal · Resting Burn</div>
                                <div style={{
                                    borderTop: '1px solid rgba(203, 208, 200, 0.3)',
                                    paddingTop: '0.75rem'
                                }}>
                                    <div style={{
                                        fontSize: '1.25rem',
                                        fontWeight: 300,
                                        color: '#7B84A5'
                                    }}>{tdee.toLocaleString()}</div>
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: '#7B84A5',
                                        opacity: 0.7
                                    }}>kcal · Daily Target</div>
                                </div>
                            </div>

                            {/* Card 2: Sweet Spot (Heart Rate Zones) */}
                            <div style={{
                                background: 'rgba(245, 243, 240, 0.8)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(203, 208, 200, 0.3)',
                                borderRadius: '18px',
                                padding: '1.5rem',
                                boxShadow: '0 8px 24px rgba(123, 132, 165, 0.08)'
                            }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <Heart size={20} style={{ color: '#D89B9B' }} />
                                    <h3 style={{
                                        fontSize: '0.875rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        fontWeight: 600
                                    }}>Sweet Spot</h3>
                                </div>
                                {heartRateZones && (
                                    <>
                                        <div style={{
                                            fontFamily: 'var(--font-display)',
                                            fontSize: '2rem',
                                            fontWeight: 300,
                                            color: '#D89B9B',
                                            marginBottom: '0.5rem'
                                        }}>{heartRateZones.zone2.min}-{heartRateZones.zone2.max}</div>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: '#7B84A5',
                                            opacity: 0.7,
                                            marginBottom: '1rem'
                                        }}>bpm · Fat Burn Zone</div>

                                        {/* Gradient Bar */}
                                        <div style={{
                                            height: '8px',
                                            borderRadius: '4px',
                                            background: 'linear-gradient(to right, #E8E6E3 0%, #D89B9B 50%, #4A464F 100%)',
                                            position: 'relative',
                                            marginBottom: '1rem'
                                        }}>
                                            {/* Zone 2 Marker */}
                                            <div style={{
                                                position: 'absolute',
                                                left: '60%',
                                                width: '10%',
                                                height: '16px',
                                                background: '#ED9851',
                                                borderRadius: '4px',
                                                top: '-4px',
                                                boxShadow: '0 2px 8px rgba(237, 152, 81, 0.3)'
                                            }} />
                                        </div>

                                        <div style={{
                                            fontSize: '0.7rem',
                                            color: '#7B84A5',
                                            opacity: 0.6
                                        }}>Max HR: {heartRateZones.maxHR} bpm</div>
                                    </>
                                )}
                            </div>

                            {/* Card 3: Balance (BMI) */}
                            <div style={{
                                background: 'rgba(245, 243, 240, 0.8)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(203, 208, 200, 0.3)',
                                borderRadius: '18px',
                                padding: '1.5rem',
                                boxShadow: '0 8px 24px rgba(123, 132, 165, 0.08)'
                            }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <Scale size={20} style={{ color: '#9DAA97' }} />
                                    <h3 style={{
                                        fontSize: '0.875rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#7B84A5',
                                        fontWeight: 600
                                    }}>Balance</h3>
                                </div>
                                {bodyMetrics && (
                                    <>
                                        <div style={{
                                            fontFamily: 'var(--font-display)',
                                            fontSize: '2.5rem',
                                            fontWeight: 300,
                                            color: '#9DAA97',
                                            marginBottom: '0.5rem'
                                        }}>{bodyMetrics.bmi}</div>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: '#7B84A5',
                                            opacity: 0.7,
                                            marginBottom: '1rem'
                                        }}>BMI · {bodyMetrics.status}</div>
                                        <div style={{
                                            borderTop: '1px solid rgba(203, 208, 200, 0.3)',
                                            paddingTop: '0.75rem'
                                        }}>
                                            <div style={{
                                                fontSize: '0.875rem',
                                                color: '#7B84A5',
                                                opacity: 0.8
                                            }}>Ideal Range</div>
                                            <div style={{
                                                fontSize: '1.125rem',
                                                fontWeight: 300,
                                                color: '#7B84A5'
                                            }}>{bodyMetrics.idealMin}-{bodyMetrics.idealMax} kg</div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-between gap-4">
                        {onSkip && (
                            <motion.button {...pressProps('row')}
 type="button"
 onClick={onSkip}
 style={{
 padding: '1rem 2rem',
 backgroundColor: 'transparent',
 color: '#7B84A5',
 border: '2px solid rgba(123, 132, 165, 0.3)',
 borderRadius: '18px',
 fontSize: '1rem',
 fontWeight: 500,
 cursor: 'pointer'
 }}
 >
                                Skip for Now
                            </motion.button>
                        )}
                        <motion.button {...pressProps('row')}
 type="submit"
 className="flex items-center gap-2 ml-auto"
 style={{
 padding: '1rem 2.5rem',
 background: 'linear-gradient(135deg, #ED9851, #F0A870)',
 color: '#FFFFFF',
 border: 'none',
 borderRadius: '18px',
 fontSize: '1rem',
 fontWeight: 600,
 cursor: 'pointer',
 boxShadow: '0 4px 16px rgba(237, 152, 81, 0.3)'
 }}
 >
                            <Target size={18} />
                            {saveSuccess ? '✓ Saved!' : 'Save Profile'}
                        </motion.button>
                    </div>
                </form>

                {/* Custom Slider Styles */}
                <style>{`
                    .slider::-webkit-slider-thumb {
                        appearance: none;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: white;
                        cursor: pointer;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                        border: 2px solid #ED9851;
                    }
                    .slider::-moz-range-thumb {
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: white;
                        cursor: pointer;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                        border: 2px solid #ED9851;
                    }
                `}</style>
            </div >
        </div >
    );
};

export default UserProfileForm;
