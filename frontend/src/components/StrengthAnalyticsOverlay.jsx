import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { X, Search, TrendingUp, Calendar, Plus, Trophy, ArrowRight } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import StrengthProgressChart from './StrengthProgressChart';
import StrengthLoggerModal from './StrengthLoggerModal';
import { getUserId } from '../utils/auth';
import { confirmDialog } from '../utils/toast';

const StrengthAnalyticsOverlay = ({ userId: propUserId, onClose }) => {
    const userId = propUserId || getUserId();
    const [history, setHistory] = useState([]);
    const [uniqueExercises, setUniqueExercises] = useState([]);
    const [selectedExercise, setSelectedExercise] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoggerOpen, setIsLoggerOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [editingRecord, setEditingRecord] = useState(null);

    // Common exercises to seed the list if empty
    const commonExercises = [
        'Bench Press', 'Squat', 'Deadlift', 'Overhead Press',
        'Pull Ups', 'Barbell Rows', 'Leg Press', 'Dumbbell Curl'
    ];

    useEffect(() => {
        fetchAllHistory();
    }, [userId]);

    const fetchAllHistory = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/strength/history/${userId}`);
            if (response.ok) {
                const rawData = await response.json();

                // Backend returns { "Bench Press": [...], "Squat": [...] }
                // We need to flatten this for the frontend logic
                let flatHistory = [];
                let exercisesList = [];

                if (Array.isArray(rawData)) {
                    // Just in case it returns array in future or if filtered
                    flatHistory = rawData;
                    exercisesList = [...new Set(rawData.map(item => item.exercise_name))];
                } else if (typeof rawData === 'object' && rawData !== null) {
                    Object.entries(rawData).forEach(([exName, records]) => {
                        // Ensure records have the exercise name attached if not already
                        const recordsWithInfo = records.map(r => ({ ...r, exercise_name: exName }));
                        flatHistory = [...flatHistory, ...recordsWithInfo];
                        exercisesList.push(exName);
                    });
                }

                setHistory(flatHistory);

                // Merge with common exercises, keeping history ones first
                const merged = [...new Set([...exercisesList, ...commonExercises])];
                setUniqueExercises(merged);

                // Select first one by default if not set
                if (!selectedExercise && merged.length > 0) {
                    setSelectedExercise(merged[0]);
                }
            }
        } catch (error) {
            console.error("Failed to load strength history", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Filter data for the selected exercise
    const chartData = history.filter(h => h.exercise_name === selectedExercise);

    // Calculate stats
    const currentPR = chartData.length > 0
        ? Math.max(...chartData.map(d => d.pr_weight || 0))
        : 0;

    // O(n) max instead of O(n log n) sort (js-min-max-loop)
    const lastSession = chartData.reduce((latest, s) => new Date(s.date) > new Date(latest.date) ? s : latest, chartData[0]);

    const filteredExercises = uniqueExercises.filter(ex =>
        ex.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleLogSave = async (payload) => {
        try {
            let url = `http://${window.location.hostname}:8000/api/strength/record`;
            let method = 'POST';

            if (payload.record_id) {
                url = `http://${window.location.hostname}:8000/api/strength/record/${payload.record_id}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    ...payload
                })
            });

            if (response.ok) {
                // Refresh data
                await fetchAllHistory();
                setEditingRecord(null); // Clear edit mode
            }
        } catch (error) {
            console.error("Error saving record:", error);
        }
    };

    const handleDelete = async (recordId) => {
        if (!(await confirmDialog('Are you sure you want to delete this record?', { danger: true }))) return;

        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/strength/record/${recordId}?user_id=${userId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                await fetchAllHistory();
            }
        } catch (error) {
            console.error("Error deleting record:", error);
        }
    };

    const openEditModal = (record) => {
        setEditingRecord(record);
        setIsLoggerOpen(true);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-6xl h-[85dvh] bg-[#121212] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">

                {/* Close Button (Mobile overlap or nice corner) */}
                <motion.button {...pressProps('icon')} aria-label="關閉"
 onClick={onClose}
 className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-white/10 text-white rounded-full z-10 transition-colors"
 >
                    <X size={24} />
                </motion.button>

                {/* Left Sidebar: Exercise List */}
                <div className="w-full md:w-1/3 border-r border-white/5 flex flex-col bg-black/20">
                    <div className="p-6 border-b border-white/5">
                        <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                            <Trophy className="text-yellow-500" />
                            Strength Hub
                        </h2>
                        <p className="text-glass-muted text-sm">Track your PRs and progress</p>

                        <div className="mt-4 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <input
                                type="text"
                                placeholder="Search exercises..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-glass-blue transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {filteredExercises.map(ex => {
                            // Find latest stats for this exercise
                            const exStats = history.filter(h => h.exercise_name === ex);
                            const exPR = exStats.length > 0 ? Math.max(...exStats.map(d => d.pr_weight || 0)) : 0;

                            return (
                                <motion.button {...pressProps('cta')}
 key={ex}
 onClick={() => setSelectedExercise(ex)}
 className={`w-full text-left p-3 rounded-xl group ${selectedExercise === ex
 ? 'bg-glass-blue/20 border border-glass-blue/30'
 : 'hover:bg-white/5 border border-transparent'
 }`}
 >
                                    <div className="flex justify-between items-center">
                                        <span className={`font-medium ${selectedExercise === ex ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>
                                            {ex}
                                        </span>
                                        {exPR > 0 && (
                                            <span className="text-xs bg-black/40 px-2 py-1 rounded text-glass-blue font-mono">
                                                PR: {exPR}kg
                                            </span>
                                        )}
                                    </div>
                                </motion.button>
                            );
                        })}

                        {filteredExercises.length === 0 && (
                            <div className="text-center text-glass-muted py-8">
                                No exercises found.
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Main Area: Chart & Details */}
                <div className="flex-1 flex flex-col relative bg-gradient-to-br from-black/40 to-glass-blue/5">
                    {selectedExercise ? (
                        <>
                            {/* Header */}
                            <div className="p-6 md:p-8 flex justify-between items-start">
                                <div>
                                    <h1 className="text-3xl md:text-4xl font-black text-white mb-2">{selectedExercise}</h1>
                                    <div className="flex items-center gap-4 text-sm text-glass-muted">
                                        <span className="flex items-center gap-1">
                                            <TrendingUp className="w-4 h-4" />
                                            {chartData.length} records
                                        </span>
                                        {lastSession && (
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-4 h-4" />
                                                Last: {lastSession.date}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <motion.button {...pressProps('row')}
 onClick={() => setIsLoggerOpen(true)}
 className="px-6 py-3 bg-glass-blue hover:bg-blue-400 text-black font-bold rounded-xl flex items-center gap-2 shadow-lg hover:shadow-blue-500/20"
 >
                                    <Plus className="w-5 h-5" />
                                    Log New
                                </motion.button>
                            </div>

                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 gap-4 px-6 md:px-8 mb-6">
                                <div className="bg-white/5 border border-white/10 p-4 rounded-[18px]">
                                    <p className="text-xs text-glass-muted uppercase tracking-wider mb-1">Personal Record</p>
                                    <p className="text-3xl font-black text-white flex items-end gap-1">
                                        {currentPR} <span className="text-sm font-bold text-glass-blue mb-1">kg</span>
                                    </p>
                                </div>
                                <div className="bg-white/5 border border-white/10 p-4 rounded-[18px]">
                                    <p className="text-xs text-glass-muted uppercase tracking-wider mb-1">Latest Training</p>
                                    <p className="text-3xl font-black text-white/80 flex items-end gap-1">
                                        {lastSession?.training_weight || 0} <span className="text-sm font-bold text-white/40 mb-1">kg</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 px-6 md:px-8 pb-8 min-h-0 overflow-y-auto custom-scrollbar">
                                <div className="h-[300px] w-full bg-black/20 rounded-3xl border border-white/5 p-4 relative mb-6">
                                    <StrengthProgressChart data={chartData} exerciseName={selectedExercise} />
                                </div>

                                {/* History List */}
                                <div className="space-y-3 mt-8">
                                    <h3 className="text-white font-bold text-lg mb-2">History Log</h3>
                                    {chartData.length === 0 ? (
                                        <p className="text-glass-muted text-sm italic">No records found.</p>
                                    ) : (
                                        <div className="grid gap-2">
                                            {/* Header */}
                                            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-glass-muted uppercase font-bold tracking-wider">
                                                <div className="col-span-3">Date</div>
                                                <div className="col-span-3">Training</div>
                                                <div className="col-span-3">PR</div>
                                                <div className="col-span-3 text-right">Actions</div>
                                            </div>

                                            {/* Rows */}
                                            {[...chartData].sort((a, b) => new Date(b.date) - new Date(a.date)).map((record) => (
                                                <div key={record.record_id || Math.random()} className="grid grid-cols-12 gap-4 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl items-center border border-white/5 transition-colors group">
                                                    <div className="col-span-3 text-white text-sm font-mono">{record.date ? record.date.substring(5) : '-'}</div>
                                                    <div className="col-span-3 text-white font-bold">{record.training_weight > 0 ? record.training_weight + 'kg' : '-'}</div>
                                                    <div className="col-span-3 text-blue-400 font-bold">{record.pr_weight > 0 ? record.pr_weight + 'kg' : '-'}</div>
                                                    <div className="col-span-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <motion.button {...pressProps('row')}
 onClick={() => openEditModal(record)}
 className="p-1.5 hover:bg-white/10 rounded text-glass-muted hover:text-white transition-colors"
 title="Edit"
 >
                                                            <div className="w-4 h-4 text-xs">Edit</div>
                                                        </motion.button>
                                                        <motion.button {...pressProps('row')}
 onClick={() => handleDelete(record.record_id)}
 className="p-1.5 hover:bg-red-500/20 rounded text-glass-muted hover:text-red-400 transition-colors"
 title="Delete"
 >
                                                            <div className="w-4 h-4 text-xs">Del</div>
                                                        </motion.button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-glass-muted">
                            <Dumbbell className="w-16 h-16 mb-4 opacity-20" />
                            <p>Select an exercise to view progress</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal for Logging */}
            <StrengthLoggerModal
                isOpen={isLoggerOpen}
                onClose={() => {
                    setIsLoggerOpen(false);
                    setEditingRecord(null);
                }}
                initialData={editingRecord}
                exerciseName={selectedExercise}
                onSave={handleLogSave}
            />
        </div>
    );
};

export default StrengthAnalyticsOverlay;
