import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, CheckCircle, ArrowLeft, ArrowRight, Edit2, Save, Target } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import CollapsibleTagDrawer from './CollapsibleTagDrawer';
import BodyHeatmap2D from './BodyHeatmap2D';
import AdaptivePlanAccordion from './AdaptivePlanAccordion';
import { getMusclesFromTags } from '../utils/tagToMuscleMap';
import { selectExercisesForWeek } from '../data/exerciseDatabase';
import apiClient from '../api/client';
import { toast } from '../utils/toast';

// The LOEWE Luxury Design System
const LoeweLuxuryStyles = () => (
    <style>{`
        
        
        .serif-display {
            font-family: var(--font-display);
        }
        
        /* Artisan Palette */
        :root {
            --truffle: #262523;
            --suede: #33302C;
            --caramel: #C68E5D;
            --sand: #E0D8D3;
            --sage: #8F9E8B;
            --dusty-blue: #7B8D93;
            --clay: #D6C6B9;
            --khaki: #9C8C74;
        }

        /* Leather Card Texture */
        .leather-card {
            background-color: var(--suede);
            border-radius: 18px; 
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.03);
            position: relative;
            overflow: hidden;
        }

        /* Subtle Grain Texture Overlay */
        .leather-texture::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stub='7'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
            opacity: 0.4;
            pointer-events: none;
            mix-blend-mode: overlay;
        }

        .btn-leather {
            background-color: var(--caramel);
            color: var(--truffle);
            border-radius: 12px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            box-shadow: 0 4px 15px rgba(198, 142, 93, 0.3);
            transition: all 0.2s ease;
        }

        .btn-leather:active {
            transform: scale(0.98);
            box-shadow: 0 2px 8px rgba(198, 142, 93, 0.15);
        }
        
        .step-indicator-active {
            color: var(--caramel);
            border-color: var(--caramel);
        }
        
        .step-indicator-inactive {
            color: var(--sand);
            opacity: 0.3;
            border-color: rgba(224, 216, 211, 0.1);
        }
    `}</style>
);

const PlanGeneratorModal = ({ userId, onClose, onPlanGenerated }) => {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1); // 1, 2, 3
    const [selectedTags, setSelectedTags] = useState([]);
    const [userHashtags, setUserHashtags] = useState([]);
    const [generatedPlan, setGeneratedPlan] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Derived data
    const targetMuscles = getMusclesFromTags(selectedTags);

    // Fetch user hashtags on mount
    useEffect(() => {
        const fetchHashtags = async () => {
            try {
                const response = await apiClient.get(`/api/user/${userId}/hashtags`);
                if (response.data?.hashtags) {
                    setUserHashtags(response.data.hashtags.map(h => `#${h}`));
                }
            } catch (error) {
                console.error('Error fetching hashtags:', error);
                // Use default tags
                setUserHashtags(['#改善圓肩', '#增強胸肌', '#駝背矯正', '#強化核心', '#腿部訓練']);
            }
        };
        fetchHashtags();
    }, [userId]);

    // Handle tag toggle
    const handleTagToggle = (tag) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    // Step 1 → Step 2: Generate Plan Preview
    const handleGeneratePreview = async () => {
        if (selectedTags.length === 0) {
            toast.error('請至少選擇一個目標部位');
            return;
        }

        setLoading(true);
        try {
            const response = await apiClient.post(`/api/plan/${userId}/generate`, {
                hashtags: selectedTags.map(tag => tag.replace('#', '')),
                weeks: 4 // Always request 4 weeks
            });

            if (response.data?.plan) {
                setGeneratedPlan(response.data.plan);
                setCurrentStep(2);
            }
        } catch (error) {
            console.error('Error generating plan:', error);
            // Fallback for demo
            setCurrentStep(2);
        } finally {
            setLoading(false);
        }
    };

    // Step 2 → Step 3: Final Confirm
    const handleSavePlan = async () => {
        setLoading(true);
        try {
            // If modified, re-save logic would go here
            await new Promise(r => setTimeout(r, 1000)); // Simulating save

            // Navigate to the new Luxury Plan View
            navigate('/luxury-plan-view-mobile');
            if (onClose) onClose();

        } catch (error) {
            console.error('Error saving plan:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center font-sans" style={{ backgroundColor: '#262523' }}>
            <LoeweLuxuryStyles />

            <div className="w-full max-w-lg h-full max-h-[100dvh] overflow-y-auto relative flex flex-col">

                {/* Header */}
                <div className="sticky top-0 z-10 bg-[#262523]/95 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-[#E0D8D3]/5">
                    <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="p-2 rounded-full hover:bg-[#33302C] text-[#E0D8D3]">
                        <X size={24} />
                    </motion.button>
                    <h2 className="serif-display text-lg text-[#E0D8D3]">
                        {currentStep === 1 ? 'Design Protocol' : currentStep === 2 ? 'Review Blueprint' : 'Activation'}
                    </h2>
                    <div className="w-10"></div>
                </div>

                {/* Progress Steps */}
                <div className="px-8 py-6 flex justify-between items-center relative">
                    {/* Line */}
                    <div className="absolute left-8 right-8 top-1/2 h-0.5 bg-[#33302C] -z-10"></div>
                    <div className="absolute left-8 right-8 top-1/2 h-0.5 bg-[#C68E5D] -z-10 transition-all duration-500"
                        style={{ width: `${((currentStep - 1) / 2) * 100}%` }}></div>

                    {[1, 2, 3].map((step) => (
                        <div key={step} className={`
                            w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-[#262523]
                            ${step <= currentStep ? 'border-[#C68E5D] text-[#C68E5D]' : 'border-[#33302C] text-[#E0D8D3]/30'}
                        `}>
                            {step < currentStep ? <CheckCircle size={14} /> : <span className="text-xs font-bold">{step}</span>}
                        </div>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 px-6 pb-24 overflow-y-auto">
                    <AnimatePresence mode="wait">

                        {/* Step 1: Design (Tags) */}
                        {currentStep === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="text-center space-y-2 mb-8">
                                    <Sparkles size={32} className="text-[#C68E5D] mx-auto mb-2" />
                                    <h1 className="text-3xl serif-display text-[#E0D8D3]">Focus Areas</h1>
                                    <p className="text-[#E0D8D3]/60 text-sm">Select your primary objectives for this cycle.</p>
                                </div>

                                <CollapsibleTagDrawer
                                    selectedTags={selectedTags}
                                    onTagToggle={handleTagToggle}
                                    allTags={userHashtags}
                                    defaultExpanded={true}
                                />

                                <div className="p-4 rounded-xl bg-[#33302C] border border-[#E0D8D3]/5 flex items-start gap-3">
                                    <Target className="text-[#8F9E8B] mt-1 shrink-0" size={18} />
                                    <div>
                                        <h4 className="text-sm font-bold text-[#E0D8D3] mb-1">Target Analysis</h4>
                                        <p className="text-xs text-[#E0D8D3]/60 leading-relaxed">
                                            {selectedTags.length > 0
                                                ? `Focusing on ${targetMuscles.join(', ')} based on your selection.`
                                                : "We'll build a custom split based on your selections."}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 2: Review (Preview) */}
                        {currentStep === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="serif-display text-2xl text-[#E0D8D3]">Your Blueprint</h3>
                                    <span className="text-xs font-bold text-[#C68E5D] border border-[#C68E5D] px-2 py-1 rounded">4 WEEKS</span>
                                </div>

                                {loading ? (
                                    <div className="py-20 flex justify-center">
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#C68E5D]"></div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Simplified Preview Card */}
                                        <div className="leather-card p-5 leather-texture">
                                            <div className="flex items-center gap-3 mb-4">
                                                <Dumbbell className="text-[#7B8D93]" size={20} />
                                                <span className="font-bold text-[#E0D8D3]">Weekly Structure</span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm text-[#E0D8D3]/80 py-2 border-b border-[#E0D8D3]/5">
                                                    <span>Frequency</span>
                                                    <span>3 Days / Week</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-[#E0D8D3]/80 py-2 border-b border-[#E0D8D3]/5">
                                                    <span>Focus</span>
                                                    <span>Hypertrophy & Strength</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-[#E0D8D3]/80 py-2">
                                                    <span>Est. Duration</span>
                                                    <span>45-60 min / session</span>
                                                </div>
                                            </div>
                                        </div>

                                        <p className="text-center text-xs text-[#E0D8D3]/40 mt-4">
                                            Detailed daily breakdown will be available in the Plan View.
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>

                {/* Footer Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-[#262523] border-t border-[#E0D8D3]/5 backdrop-blur-lg">
                    {currentStep === 1 ? (
                        <motion.button {...pressProps('cta')}
 onClick={handleGeneratePreview}
 disabled={selectedTags.length === 0}
 className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2
 ${selectedTags.length > 0 ? 'bg-[#C68E5D] text-[#262523] shadow-lg shadow-[#C68E5D]/20' : 'bg-[#33302C] text-[#E0D8D3]/30 cursor-not-allowed'}
 `}
 >
                            <span>Confirm Selection</span>
                            <ArrowRight size={16} />
                        </motion.button>
                    ) : (
                        <div className="flex gap-3">
                            <motion.button {...pressProps('cta')}
 onClick={() => setCurrentStep(1)}
 className="flex-1 py-4 rounded-xl font-bold uppercase tracking-widest text-sm border border-[#E0D8D3]/20 text-[#E0D8D3]"
 >
                                Back
                            </motion.button>
                            <motion.button {...pressProps('row')}
 onClick={handleSavePlan}
 className="flex-[2] py-4 rounded-xl font-bold uppercase tracking-widest text-sm bg-[#C68E5D] text-[#262523] shadow-lg shadow-[#C68E5D]/20 flex items-center justify-center gap-2"
 >
                                <Save size={16} />
                                <span>Activate Plan</span>
                            </motion.button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlanGeneratorModal;
