import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

// Recovery state for cardio sessions
const RecoveryContext = createContext(null);

export const RecoveryProvider = ({ children }) => {
    // Core recovery state
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveryTimer, setRecoveryTimer] = useState(60);
    const [recoveryStartHR, setRecoveryStartHR] = useState(null);
    const [currentHR, setCurrentHR] = useState(0);
    const [recoveryCompleted, setRecoveryCompleted] = useState(false);

    const intervalRef = useRef(null);

    // Start recovery countdown
    const startRecovery = useCallback((startHR) => {
        console.log("🧊 [RecoveryContext] Starting recovery with HR:", startHR);
        setIsRecovering(true);
        setRecoveryTimer(60);
        setRecoveryStartHR(startHR);
        setCurrentHR(startHR);
        setRecoveryCompleted(false);

        // Clear any existing interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        // Start countdown
        intervalRef.current = setInterval(() => {
            setRecoveryTimer(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                    setRecoveryCompleted(true);
                    setIsRecovering(false);
                    console.log("✅ [RecoveryContext] Recovery completed!");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // Update current heart rate during recovery
    const updateHeartRate = useCallback((hr) => {
        setCurrentHR(hr);
    }, []);

    // Skip recovery (user action)
    const skipRecovery = useCallback(() => {
        console.log("⏭️ [RecoveryContext] Skipping recovery");
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setRecoveryTimer(0);
        setRecoveryCompleted(true);
        setIsRecovering(false);
    }, []);

    // Reset all recovery state
    const resetRecovery = useCallback(() => {
        console.log("🔄 [RecoveryContext] Resetting recovery state");
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsRecovering(false);
        setRecoveryTimer(60);
        setRecoveryStartHR(null);
        setCurrentHR(0);
        setRecoveryCompleted(false);
    }, []);

    // Calculate HRR value (Heart Rate Recovery)
    const getHRRValue = useCallback(() => {
        if (!recoveryStartHR) return 0;
        return Math.max(0, recoveryStartHR - currentHR);
    }, [recoveryStartHR, currentHR]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const value = {
        // State
        isRecovering,
        recoveryTimer,
        recoveryStartHR,
        currentHR,
        recoveryCompleted,
        // Computed
        hrrValue: getHRRValue(),
        // Actions
        startRecovery,
        updateHeartRate,
        skipRecovery,
        resetRecovery
    };

    return (
        <RecoveryContext.Provider value={value}>
            {children}
        </RecoveryContext.Provider>
    );
};

// Custom hook to use recovery context
export const useRecovery = () => {
    const context = useContext(RecoveryContext);
    if (!context) {
        throw new Error('useRecovery must be used within a RecoveryProvider');
    }
    return context;
};

export default RecoveryContext;
