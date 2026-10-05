import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { TrendingUp, TrendingDown, Minus, Edit2, Trash2, ChevronDown, ChevronRight, Tag } from 'lucide-react';

const InBodyHistoryTable = ({ history, onEdit, onDelete, compareMode = false, selectedDates = [], onSelectDate }) => {
    const [expandedDates, setExpandedDates] = useState([]);
    const [deletingId, setDeletingId] = useState(null);

    // Group records by date
    const groupedRecords = history.reduce((acc, record) => {
        const date = record.measurement_date || new Date(record.timestamp).toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(record);
        return acc;
    }, {});

    const dates = Object.keys(groupedRecords).sort((a, b) => new Date(b) - new Date(a));

    const toggleDate = (date) => {
        setExpandedDates(prev =>
            prev.includes(date)
                ? prev.filter(d => d !== date)
                : [...prev, date]
        );
    };

    const getChange = (current, previous) => {
        const c = parseFloat(current);
        const p = parseFloat(previous);
        if (isNaN(c) || isNaN(p)) return null;
        const change = c - p;
        if (Math.abs(change) < 0.1) return null;
        return change;
    };

    const getChangeIcon = (change) => {
        if (!change) return <Minus size={14} className="text-gray-400" />;
        if (change > 0) return <TrendingUp size={14} className="text-[#84A98C]" />;
        return <TrendingDown size={14} className="text-[#D4A373]" />;
    };

    const getChangeColor = (change) => {
        if (!change) return 'text-gray-400';
        if (change > 0) return 'text-[#84A98C]';
        return 'text-[#D4A373]';
    };

    const handleDeleteClick = (recordId) => {
        setDeletingId(recordId);
    };

    const confirmDelete = async () => {
        if (deletingId && onDelete) {
            await onDelete(deletingId);
            setDeletingId(null);
        }
    };

    // Get tag for record based on time or context (can be extended)
    const getRecordTag = (record) => {
        // Simple heuristic - can be extended with real data
        const hour = record.timestamp ? new Date(record.timestamp).getHours() : null;
        if (hour !== null) {
            if (hour < 8) return { text: '空腹', color: 'bg-[#8D99AE]/20 text-[#8D99AE] border-[#8D99AE]/30' };
            if (hour >= 15 && hour <= 18) return { text: '運動後', color: 'bg-[#D4A373]/20 text-[#D4A373] border-[#D4A373]/30' };
            if (hour > 20) return { text: '晚餐後', color: 'bg-[#6D597A]/20 text-[#6D597A] border-[#6D597A]/30' };
        }
        return null;
    };

    if (!history || history.length === 0) {
        return (
            <div className="glass-card-light p-8 rounded-3xl border border-white/10 text-center">
                <p className="text-glass-muted">尚無歷史記錄</p>
            </div>
        );
    }

    return (
        <>
            <div className="glass-card-light overflow-hidden rounded-3xl border border-white/10">
                <div className="p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Tag size={20} className="text-glass-blue" />
                        測量記錄
                        <span className="text-xs text-glass-muted font-normal ml-auto">
                            共 {history.length} 筆記錄
                        </span>
                    </h3>

                    <div className="space-y-2">
                        {dates.map(date => {
                            const dateRecords = groupedRecords[date];
                            const isExpanded = expandedDates.includes(date) || dateRecords.length === 1;
                            const latestRecord = dateRecords[0]; // Most recent record for this date
                            const previousDateIndex = dates.indexOf(date) + 1;
                            const previousDate = dates[previousDateIndex];
                            const previousRecord = previousDate ? groupedRecords[previousDate][0] : null;

                            return (
                                <div key={date} className="border border-white/10 rounded-xl overflow-hidden backdrop-blur-sm">
                                    {/* Date Header */}
                                    <div
                                        className={`flex items-center justify-between p-4 bg-gradient-to-r from-glass-blue/5 to-transparent ${selectedDates.includes(date) ? 'bg-purple-500/20 border-l-4 border-purple-500' : ''
                                            } transition-colors`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* Comparison Mode Checkbox */}
                                            {compareMode && (
                                                <div
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectDate?.(date);
                                                    }}
                                                    className={`w-6 h-6 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${selectedDates.includes(date)
                                                        ? 'bg-purple-500 border-purple-500'
                                                        : 'border-white/40 hover:border-purple-400 hover:bg-purple-500/10'
                                                        }`}
                                                >
                                                    {selectedDates.includes(date) && (
                                                        <svg className="w-4 h-4 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path d="M5 13l4 4L19 7"></path>
                                                        </svg>
                                                    )}
                                                </div>
                                            )}

                                            {/* Expand/Collapse Chevron */}
                                            {dateRecords.length > 1 && !compareMode && (
                                                <div
                                                    onClick={() => toggleDate(date)}
                                                    className="cursor-pointer"
                                                >
                                                    {isExpanded
                                                        ? <ChevronDown size={18} className="text-glass-blue" />
                                                        : <ChevronRight size={18} className="text-glass-blue" />}
                                                </div>
                                            )}

                                            <div>
                                                <span className="text-white font-semibold">{date}</span>
                                                {dateRecords.length > 1 && (
                                                    <span className="ml-2 text-xs text-glass-muted">
                                                        {dateRecords.length} 筆記錄
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Quick Stats */}
                                        <div className="flex items-center gap-4 text-xs">
                                            <div className="flex items-center gap-1">
                                                <span className="text-glass-muted">體重:</span>
                                                <span className="text-white font-medium">{latestRecord.weight_kg?.toFixed(1)} kg</span>
                                                {previousRecord && (
                                                    <div className="flex items-center gap-0.5 ml-1">
                                                        {getChangeIcon(getChange(latestRecord.weight_kg, previousRecord.weight_kg))}
                                                        <span className={getChangeColor(getChange(latestRecord.weight_kg, previousRecord.weight_kg))}>
                                                            {Math.abs(getChange(latestRecord.weight_kg, previousRecord.weight_kg) || 0).toFixed(1)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-glass-muted">體脂:</span>
                                                <span className="text-[#D4A373] font-medium">{latestRecord.body_fat_percent?.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Records */}
                                    {isExpanded && (
                                        <div className="divide-y divide-white/5">
                                            {dateRecords.map((record, idx) => {
                                                const recordTag = getRecordTag(record);
                                                const prevRecord = idx < dateRecords.length - 1
                                                    ? dateRecords[idx + 1]
                                                    : previousRecord;

                                                return (
                                                    <div key={record.record_id || idx} className="p-4 hover:bg-white/5 transition-colors">
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                {record.timestamp && (
                                                                    <span className="text-xs text-glass-muted">
                                                                        {new Date(record.timestamp).toLocaleTimeString('zh-TW', {
                                                                            hour: '2-digit',
                                                                            minute: '2-digit'
                                                                        })}
                                                                    </span>
                                                                )}
                                                                {recordTag && (
                                                                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${recordTag.color} font-medium`}>
                                                                        {recordTag.text}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <motion.button {...pressProps('row')}
 onClick={() => onEdit && onEdit(record)}
 className="p-1.5 hover:bg-glass-blue/20 rounded-lg transition-colors group"
 title="編輯"
 >
                                                                    <Edit2 size={14} className="text-glass-blue group-hover:scale-110 transition-transform" />
                                                                </motion.button>
                                                                <motion.button {...pressProps('row')}
 onClick={() => handleDeleteClick(record.record_id)}
 className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors group"
 title="刪除"
 >
                                                                    <Trash2 size={14} className="text-red-400 group-hover:scale-110 transition-transform" />
                                                                </motion.button>
                                                            </div>
                                                        </div>

                                                        {/* Metrics Grid */}
                                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                            {/* Weight */}
                                                            <div className="bg-white/5 rounded-lg p-2">
                                                                <div className="text-[11px] text-glass-muted mb-1">體重</div>
                                                                <div className="text-sm font-bold text-white">{record.weight_kg?.toFixed(1)} kg</div>
                                                                {prevRecord && (
                                                                    <div className="flex items-center gap-1 text-[11px] mt-1">
                                                                        {getChangeIcon(getChange(record.weight_kg, prevRecord.weight_kg))}
                                                                        <span className={getChangeColor(getChange(record.weight_kg, prevRecord.weight_kg))}>
                                                                            {getChange(record.weight_kg, prevRecord.weight_kg)?.toFixed(1)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* BMI */}
                                                            <div className="bg-white/5 rounded-lg p-2">
                                                                <div className="text-[11px] text-glass-muted mb-1">BMI</div>
                                                                <div className="text-sm font-bold text-[#8D99AE]">{record.bmi?.toFixed(1)}</div>
                                                                {prevRecord && (
                                                                    <div className="flex items-center gap-1 text-[11px] mt-1">
                                                                        {getChangeIcon(getChange(record.bmi, prevRecord.bmi))}
                                                                        <span className={getChangeColor(getChange(record.bmi, prevRecord.bmi))}>
                                                                            {getChange(record.bmi, prevRecord.bmi)?.toFixed(1)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Body Fat */}
                                                            <div className="bg-white/5 rounded-lg p-2">
                                                                <div className="text-[11px] text-glass-muted mb-1">體脂率</div>
                                                                <div className="text-sm font-bold text-[#D4A373]">{record.body_fat_percent?.toFixed(1)}%</div>
                                                                {prevRecord && (
                                                                    <div className="flex items-center gap-1 text-[11px] mt-1">
                                                                        {getChangeIcon(getChange(record.body_fat_percent, prevRecord.body_fat_percent))}
                                                                        <span className={getChangeColor(getChange(record.body_fat_percent, prevRecord.body_fat_percent))}>
                                                                            {getChange(record.body_fat_percent, prevRecord.body_fat_percent)?.toFixed(1)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Muscle */}
                                                            <div className="bg-white/5 rounded-lg p-2">
                                                                <div className="text-[11px] text-glass-muted mb-1">肌肉量</div>
                                                                <div className="text-sm font-bold text-[#84A98C]">{record.skeletal_muscle_mass?.toFixed(1)} kg</div>
                                                                {prevRecord && (
                                                                    <div className="flex items-center gap-1 text-[11px] mt-1">
                                                                        {getChangeIcon(getChange(record.skeletal_muscle_mass, prevRecord.skeletal_muscle_mass))}
                                                                        <span className={getChangeColor(getChange(record.skeletal_muscle_mass, prevRecord.skeletal_muscle_mass))}>
                                                                            {getChange(record.skeletal_muscle_mass, prevRecord.skeletal_muscle_mass)?.toFixed(1)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Visceral Fat */}
                                                            <div className="bg-white/5 rounded-lg p-2">
                                                                <div className="text-[11px] text-glass-muted mb-1">內臟脂肪</div>
                                                                <div className="text-sm font-bold text-[#6D597A]">{record.visceral_fat_level || '-'}</div>
                                                                {prevRecord && (
                                                                    <div className="flex items-center gap-1 text-[11px] mt-1">
                                                                        {getChangeIcon(getChange(record.visceral_fat_level, prevRecord.visceral_fat_level))}
                                                                        <span className={getChangeColor(getChange(record.visceral_fat_level, prevRecord.visceral_fat_level))}>
                                                                            {getChange(record.visceral_fat_level, prevRecord.visceral_fat_level)?.toFixed(0)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            {deletingId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[18px] p-6 max-w-md w-full border border-white/10 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">確認刪除</h3>
                        <p className="text-glass-muted mb-6">
                            確定要刪除此 InBody 記錄嗎？此操作無法復原。
                        </p>
                        <div className="flex gap-3">
                            <motion.button {...pressProps('cta')}
 onClick={() => setDeletingId(null)}
 className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
 >
                                取消
                            </motion.button>
                            <motion.button {...pressProps('cta')}
 onClick={confirmDelete}
 className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
 >
                                確認刪除
                            </motion.button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default InBodyHistoryTable;
