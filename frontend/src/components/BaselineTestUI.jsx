import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Timer, Info, CheckCircle2, AlertTriangle, Trophy, Activity, Play, RotateCcw } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { BASELINE_TESTS, evaluateTestResult } from '../utils/BaselineTest';

export default function BaselineTestFlow({ onComplete, onManualInput }) {
    const [testOrder] = useState(['pushUp', 'squat', 'plank']);
    const [currentTestIndex, setCurrentTestIndex] = useState(0);
    const [step, setStep] = useState('intro'); // intro, prep, testing, input, result, summary
    const [timeLeft, setTimeLeft] = useState(60);
    const [isActive, setIsActive] = useState(false);
    const [results, setResults] = useState({
        pushUpReps: 0,
        squatReps: 0,
        plankSeconds: 0
    });
    const [currentResult, setCurrentResult] = useState(null);

    const currentTestKey = testOrder[currentTestIndex];
    const currentTest = BASELINE_TESTS[currentTestKey];

    // Timer Logic
    useEffect(() => {
        let interval = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(time => time - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            setIsActive(false);
            // Auto complete if timer runs out (optional, maybe just play sound)
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft]);

    const startTest = () => {
        // Plank has 120s limit, others 60s
        setTimeLeft(currentTestKey === 'plank' ? 120 : 60);
        setStep('prep');
    };

    const beginTimer = () => {
        setIsActive(true);
        setStep('testing');
    };

    const stopTimer = () => {
        setIsActive(false);
        // If plank, record time automatically
        if (currentTestKey === 'plank') {
            const timeSpent = 120 - timeLeft;
            handleResultSubmit(timeSpent);
        } else {
            setStep('input');
        }
    };

    const handleResultSubmit = (value) => {
        const score = parseInt(value);
        const evaluation = evaluateTestResult(currentTestKey, score, 'male'); // TODO: Pass gender

        setCurrentResult(evaluation);

        setResults(prev => ({
            ...prev,
            [currentTestKey === 'plank' ? 'plankSeconds' : `${currentTestKey}Reps`]: score
        }));

        setStep('result');
    };

    const nextTest = () => {
        if (currentTestIndex < testOrder.length - 1) {
            setCurrentTestIndex(prev => prev + 1);
            setStep('prep');
            setCurrentResult(null);
            setTimeLeft(testOrder[currentTestIndex + 1] === 'plank' ? 120 : 60);
        } else {
            setStep('summary');
        }
    };

    // --- Render Helpers ---

    const renderIntro = () => (
        <div className="flex flex-col h-full justify-between p-6 pt-10">
            <div>
                <h1 className="text-3xl font-bold text-[#262523] serif-display mb-4">Baseline Assessment</h1>
                <p className="text-[#262523]/60 mb-8">
                    To build the perfect plan, we need to know exactly where you stand.
                    We will perform 3 standard tests.
                </p>

                <div className="space-y-4">
                    {testOrder.map((key, index) => {
                        const test = BASELINE_TESTS[key];
                        return (
                            <div key={key} className="bg-white rounded-[18px] p-4 flex items-center gap-4 border border-black/5">
                                <div className="w-10 h-10 rounded-full bg-[#262523]/5 flex items-center justify-center font-bold text-[#262523]">
                                    {index + 1}
                                </div>
                                <div>
                                    <h3 className="font-bold text-[#262523]">{test.name}</h3>
                                    <p className="text-xs text-[#262523]/40 uppercase tracking-wider font-bold">{test.target}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-3">
                <motion.button {...pressProps('pill')}
 onClick={startTest}
 className="w-full bg-[#262523] text-white py-4 rounded-3xl font-bold flex items-center justify-center gap-2 shadow-xl text-lg"
 >
                    Start Assessment <ChevronRight size={20} />
                </motion.button>

                {onManualInput && (
                    <motion.button {...pressProps('cta')}
 onClick={onManualInput}
 className="w-full bg-transparent text-[#262523]/60 py-3 rounded-full font-bold text-sm hover:bg-[#262523]/5"
 >
                        Skip & Enter Manually
                    </motion.button>
                )}
            </div>
        </div>
    );

    const renderPrep = () => (
        <div className="flex flex-col h-full p-6 pt-4 relative">
            <div className="flex-1 overflow-y-auto pb-24"> {/* Scrollable content */}
                <div className="flex items-center gap-2 mb-6">
                    <span className="px-3 py-1 bg-[#262523] text-white rounded-full text-[9px] font-bold uppercase tracking-widest">
                        Test {currentTestIndex + 1} / 3
                    </span>
                    <span className="text-[#262523]/40 text-xs font-bold uppercase tracking-wider">
                        {currentTest.name}
                    </span>
                </div>

                <div className="bg-white rounded-[28px] p-6 shadow-xl border border-black/5 mb-6">
                    <h2 className="text-2xl font-bold text-[#262523] serif-display mb-4">Instructions</h2>
                    <ul className="space-y-3">
                        {currentTest.protocol.execution.map((step, i) => (
                            <li key={i} className="flex gap-3 text-sm text-[#262523]/80">
                                <div className="min-w-[20px] h-5 rounded-full bg-[#E6F45D] flex items-center justify-center text-[11px] font-bold mt-0.5">
                                    {i + 1}
                                </div>
                                {step}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <div className="bg-[#A0FFE3]/30 rounded-[18px] p-5 border border-[#A0FFE3]">
                        <div className="flex items-center gap-2 mb-3 text-[#262523]">
                            <CheckCircle2 size={18} className="text-[#00A876]" />
                            <span className="font-bold text-sm uppercase tracking-wider">Form Checklist</span>
                        </div>
                        <ul className="space-y-2">
                            {currentTest.protocol.formChecklist.map((item, i) => (
                                <li key={i} className="text-xs text-[#262523]/70 pl-6 relative">
                                    <span className="absolute left-0 top-1 w-1.5 h-1.5 rounded-full bg-[#00A876]" />
                                    {item.replace('✓ ', '')}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="bg-[#FF8A75]/20 rounded-[18px] p-5 border border-[#FF8A75]/50">
                        <div className="flex items-center gap-2 mb-3 text-[#B24A3B]">
                            <AlertTriangle size={18} />
                            <span className="font-bold text-sm uppercase tracking-wider">Disqualifications</span>
                        </div>
                        <ul className="space-y-2">
                            {currentTest.protocol.disqualifications.map((item, i) => (
                                <li key={i} className="text-xs text-[#B24A3B]/80 pl-6 relative">
                                    <span className="absolute left-0 top-1 w-1.5 h-1.5 rounded-full bg-[#B24A3B]" />
                                    {item.replace('❌ ', '')}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-36 left-0 right-0 p-6 z-20">
                <motion.button {...pressProps('pill')}
 onClick={beginTimer}
 className="w-full bg-[#E6F45D] text-[#262523] py-4 rounded-3xl font-bold flex items-center justify-center gap-2 shadow-xl text-lg border border-black/5"
 >
                    <Timer size={20} />
                    Start Timer
                </motion.button>
            </div>
        </div>
    );

    const renderTesting = () => (
        <div className="flex flex-col h-full items-center justify-center p-6 relative">
            <div className="absolute top-6 left-6 right-6 flex justify-between items-center text-[#262523]/60">
                <span className="text-xs font-bold uppercase tracking-wider">{currentTest.name}</span>
                <span className="text-xs font-bold uppercase tracking-wider">In Progress</span>
            </div>

            <div className="relative w-64 h-64 flex items-center justify-center">
                {/* Progress Ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                        cx="128" cy="128" r="120"
                        fill="none" stroke="#E5E5E5" strokeWidth="8"
                    />
                    <motion.circle
                        cx="128" cy="128" r="120"
                        fill="none" stroke="#262523" strokeWidth="8"
                        strokeLinecap="round"
                        initial={{ pathLength: 1 }}
                        animate={{ pathLength: timeLeft / (currentTestKey === 'plank' ? 120 : 60) }}
                        transition={{ duration: 1, ease: "linear" }}
                    />
                </svg>
                <div className="text-center">
                    <div className="text-7xl font-bold text-[#262523] tabular-nums tracking-tighter">
                        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-xs font-bold uppercase tracking-widest text-[#262523]/40 mt-2">Time Remaining</div>
                </div>
            </div>

            <h3 className="text-[#262523] font-bold text-xl mt-12 mb-2 text-center">Form is everything</h3>
            <p className="text-[#262523]/60 text-center text-sm max-w-[200px] mb-12">
                Stop immediately if your form breaks or you cannot continue.
            </p>

            <motion.button {...pressProps('pill')}
 onClick={stopTimer}
 className="w-full max-w-[200px] bg-[#FF8A75] text-white py-4 rounded-full font-bold shadow-lg"
 >
                Stop / Finish
            </motion.button>
        </div>
    );

    const renderInput = () => (
        <div className="flex flex-col h-full bg-black/80 backdrop-blur-xl absolute inset-0 p-6 pt-20 items-center text-white z-20">
            <h2 className="text-3xl font-bold mb-2">Test Complete</h2>
            <p className="text-white/60 mb-10">How many reps did you complete with <span className="text-[#E6F45D] font-bold">perfect form</span>?</p>

            <div className="flex items-center gap-4 mb-10">
                <motion.button {...pressProps('icon')}
 onClick={() => {
 const val = document.getElementById('rep-input');
 if (val) val.stepDown();
 }}
 className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl"
 >
                    -
                </motion.button>
                <input
                    id="rep-input"
                    type="number"
                    className="bg-transparent text-6xl font-bold text-center w-32 border-b-2 border-white/20 focus:border-[#E6F45D] outline-none"
                    placeholder="0"
                    defaultValue="0"
                    autoFocus
                />
                <motion.button {...pressProps('icon')}
 onClick={() => {
 const val = document.getElementById('rep-input');
 if (val) val.stepUp();
 }}
 className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl"
 >
                    +
                </motion.button>
            </div>

            <motion.button {...pressProps('pill')}
 onClick={() => handleResultSubmit(document.getElementById('rep-input').value)}
 className="w-full bg-[#E6F45D] text-black py-4 rounded-3xl font-bold shadow-xl text-lg mt-auto"
 >
                Submit Result
            </motion.button>
        </div>
    );

    const renderResult = () => (
        <div className="flex flex-col h-full p-6 pt-10">
            <div className="text-center mb-8">
                <div className="w-20 h-20 bg-[#262523] rounded-full flex items-center justify-center text-white mx-auto mb-4 shadow-xl">
                    <Trophy size={32} />
                </div>
                <h2 className="text-3xl font-bold text-[#262523] mb-1">Level {currentResult.level}</h2>
                <div className="inline-block px-3 py-1 bg-[#262523]/5 rounded-full text-xs font-bold uppercase tracking-widest text-[#262523]/60">
                    {currentResult.category}
                </div>
            </div>

            <div className="bg-white rounded-[28px] p-6 shadow-xl border border-black/5 mb-6">
                <h3 className="font-bold text-[#262523] mb-2">Feedback</h3>
                <p className="text-sm text-[#262523]/70 leading-relaxed mb-4">
                    {currentResult.feedback}
                </p>
                <div className="h-px bg-black/5 w-full mb-4" />
                <h3 className="font-bold text-[#262523] mb-2 text-xs uppercase tracking-wider opacity-60">Next Steps</h3>
                <ul className="space-y-2">
                    {currentResult.recommendations.slice(0, 2).map((rec, i) => (
                        <li key={i} className="text-xs text-[#262523]/70 flex gap-2">
                            <div className="min-w-[4px] h-4 rounded-full bg-[#C68E5D]" />
                            {rec}
                        </li>
                    ))}
                </ul>
            </div>

            <motion.button {...pressProps('pill')}
 onClick={nextTest}
 className="w-full bg-[#262523] text-white py-4 rounded-3xl font-bold shadow-xl text-lg mt-auto"
 >
                {currentTestIndex < testOrder.length - 1 ? 'Next Test' : 'Finish Assessment'}
            </motion.button>
        </div>
    );

    return (
        <div className="bg-[#F2F0ED] min-h-[600px] h-full rounded-[36px] relative overflow-hidden">
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="h-full"
                >
                    {step === 'intro' && renderIntro()}
                    {step === 'prep' && renderPrep()}
                    {step === 'testing' && renderTesting()}
                    {step === 'input' && renderInput()}
                    {step === 'result' && renderResult()}
                    {step === 'summary' && (() => { onComplete(results); return null; })()}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
