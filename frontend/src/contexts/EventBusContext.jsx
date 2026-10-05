import React, { createContext, useContext, useCallback, useRef } from 'react';

// Event types
export const EventTypes = {
    WORKOUT_SAVED: 'WORKOUT_SAVED',
    PR_ACHIEVED: 'PR_ACHIEVED',
    INBODY_UPDATED: 'INBODY_UPDATED',
    STRENGTH_UPDATED: 'STRENGTH_UPDATED',
    CARDIO_COMPLETED: 'CARDIO_COMPLETED'
};

// Create Context
const EventBusContext = createContext(null);

// Event Bus Provider Component
export const EventBusProvider = ({ children }) => {
    // Store event listeners
    const listenersRef = useRef({});

    // Emit an event
    const emit = useCallback((eventType, data) => {
        console.log(`[EventBus] Emitting: ${eventType}`, data);

        const listeners = listenersRef.current[eventType] || [];
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventBus] Error in listener for ${eventType}:`, error);
            }
        });
    }, []);

    // Subscribe to an event
    const subscribe = useCallback((eventType, callback) => {
        console.log(`[EventBus] Subscribing to: ${eventType}`);

        if (!listenersRef.current[eventType]) {
            listenersRef.current[eventType] = [];
        }

        listenersRef.current[eventType].push(callback);

        // Return unsubscribe function
        return () => {
            console.log(`[EventBus] Unsubscribing from: ${eventType}`);
            listenersRef.current[eventType] = listenersRef.current[eventType].filter(
                cb => cb !== callback
            );
        };
    }, []);

    // Get all active subscriptions (for debugging)
    const getActiveSubscriptions = useCallback(() => {
        const subscriptions = {};
        Object.keys(listenersRef.current).forEach(eventType => {
            subscriptions[eventType] = listenersRef.current[eventType].length;
        });
        return subscriptions;
    }, []);

    const value = {
        emit,
        subscribe,
        getActiveSubscriptions,
        EventTypes
    };

    return (
        <EventBusContext.Provider value={value}>
            {children}
        </EventBusContext.Provider>
    );
};

// Custom Hook to use Event Bus
export const useEventBus = () => {
    const context = useContext(EventBusContext);

    if (!context) {
        throw new Error('useEventBus must be used within EventBusProvider');
    }

    return context;
};

export default EventBusContext;
