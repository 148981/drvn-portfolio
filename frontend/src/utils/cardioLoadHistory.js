import apiClient from '../api/client';
import { uStorage } from './userStorage';

export async function loadCardioHistory(userId) {
    if (!userId) return { sessions: [], complete: false };
    try {
        const res = await apiClient.get(`/api/cardio-plan/${userId}/load-history`);
        if (Array.isArray(res.data?.sessions)) return { sessions: res.data.sessions, complete: res.data.complete === true };
    } catch { /* Offline: use the existing per-user cache. */ }
    const store = uStorage(userId);
    const current = store.get('cardio_sessions', null);
    if (Array.isArray(current) && current.length) return { sessions: current, complete: false };
    try {
        const legacy = JSON.parse(localStorage.getItem(`cardio_sessions_${userId}`) || 'null');
        if (Array.isArray(legacy) && legacy.length) return { sessions: legacy, complete: false };
    } catch { /* Invalid legacy cache. */ }
    const history = store.get('workout_history', []);
    return { sessions: Array.isArray(history) ? history : [], complete: false };
}
