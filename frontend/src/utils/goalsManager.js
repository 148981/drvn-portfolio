// Goals storage and management for running analytics
import { useState, useEffect } from 'react';

const GOALS_STORAGE_KEY = 'running_goals';

export const GoalTypes = {
    DISTANCE: 'distance',
    PACE: 'pace',
    CONSISTENCY: 'consistency',
    PR: 'personal_record'
};

export const GoalPeriods = {
    WEEK: 'week',
    MONTH: 'month',
    YEAR: 'year'
};

// Goal structure
export class RunningGoal {
    constructor({
        id = null,
        type,
        target,
        period,
        startDate = new Date().toISOString(),
        description = '',
        currentProgress = 0
    }) {
        this.id = id || `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = type;
        this.target = target;
        this.period = period;
        this.startDate = startDate;
        this.description = description;
        this.currentProgress = currentProgress;
        this.completed = false;
        this.completedDate = null;
    }
}

// Load goals from localStorage
export const loadGoals = () => {
    try {
        const stored = localStorage.getItem(GOALS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error loading goals:', error);
        return [];
    }
};

// Save goals to localStorage
export const saveGoals = (goals) => {
    try {
        localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
        return true;
    } catch (error) {
        console.error('Error saving goals:', error);
        return false;
    }
};

// Add a new goal
export const addGoal = (goalData) => {
    const goals = loadGoals();
    const newGoal = new RunningGoal(goalData);
    goals.push(newGoal);
    saveGoals(goals);
    return newGoal;
};

// Update goal progress
export const updateGoalProgress = (goalId, progress) => {
    const goals = loadGoals();
    const goal = goals.find(g => g.id === goalId);

    if (goal) {
        goal.currentProgress = progress;

        // Check if goal is completed
        if (progress >= goal.target && !goal.completed) {
            goal.completed = true;
            goal.completedDate = new Date().toISOString();
        }

        saveGoals(goals);
        return goal;
    }

    return null;
};

// Delete a goal
export const deleteGoal = (goalId) => {
    const goals = loadGoals();
    const filtered = goals.filter(g => g.id !== goalId);
    saveGoals(filtered);
    return true;
};

// Get active goals
export const getActiveGoals = () => {
    const goals = loadGoals();
    return goals.filter(g => !g.completed);
};

// Get completed goals
export const getCompletedGoals = () => {
    const goals = loadGoals();
    return goals.filter(g => g.completed);
};

// Calculate progress percentage
export const getGoalProgress = (goal) => {
    return Math.min(100, Math.round((goal.currentProgress / goal.target) * 100));
};

// Update goals based on session data
export const updateGoalsFromSession = async (userId, sessionData) => {
    const goals = getActiveGoals();
    const { metrics } = sessionData;

    for (const goal of goals) {
        let newProgress = goal.currentProgress;

        switch (goal.type) {
            case GoalTypes.DISTANCE:
                newProgress += metrics.distance;
                break;

            case GoalTypes.PACE:
                // For pace goals, we check if session meets the target
                if (metrics.avgPace <= goal.target) {
                    newProgress += 1; // Increment count of successful runs
                }
                break;

            case GoalTypes.CONSISTENCY:
                // Increment run count
                newProgress += 1;
                break;

            case GoalTypes.PR:
                // Check if this is a PR
                // Would need historical data comparison
                break;
        }

        updateGoalProgress(goal.id, newProgress);
    }
};

// Generate goal suggestions
export const getGoalSuggestions = (userId) => {
    return [
        {
            type: GoalTypes.DISTANCE,
            target: 50,
            period: GoalPeriods.MONTH,
            description: 'Run 50km this month',
            icon: '🎯'
        },
        {
            type: GoalTypes.PACE,
            target: 300, // 5:00 /km
            period: GoalPeriods.WEEK,
            description: 'Break 5:00 /km average',
            icon: '⚡'
        },
        {
            type: GoalTypes.CONSISTENCY,
            target: 12,
            period: GoalPeriods.MONTH,
            description: 'Run 3x per week',
            icon: '📅'
        },
        {
            type: GoalTypes.PR,
            target: 1,
            period: GoalPeriods.MONTH,
            description: 'Set a new 5K personal record',
            icon: '🏆'
        }
    ];
};

export default {
    GoalTypes,
    GoalPeriods,
    RunningGoal,
    loadGoals,
    saveGoals,
    addGoal,
    updateGoalProgress,
    deleteGoal,
    getActiveGoals,
    getCompletedGoals,
    getGoalProgress,
    updateGoalsFromSession,
    getGoalSuggestions
};
