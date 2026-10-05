// utils/indexedDB.js
// 離線數據存儲工具 - 整合版 (Workout Plans + Running Sessions)

const DB_NAME = 'FitnessAppDB';
const DB_VERSION = 2; // 升級版本以支持新表
const STORE_NAMES = {
    PLANS: 'trainingPlans',
    WORKOUTS: 'workouts',
    SYNC_STATUS: 'syncStatus'
};

class IndexedDBManager {
    constructor() {
        this.db = null;
        this.isReady = false;
    }

    /**
     * 初始化數據庫
     */
    async init() {
        if (this.isReady && this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('❌ IndexedDB open failed:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                console.log('✅ IndexedDB initialized (v' + DB_VERSION + ')');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                console.log(`📦 IndexedDB upgrading from v${oldVersion} to v${DB_VERSION}`);

                // 1. Training Plans Store (Existing)
                if (!db.objectStoreNames.contains(STORE_NAMES.PLANS)) {
                    const objectStore = db.createObjectStore(STORE_NAMES.PLANS, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    objectStore.createIndex('userId', 'userId', { unique: false });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    objectStore.createIndex('planId', 'planId', { unique: false });
                }

                // 2. Workouts Store (Running Sessions - New)
                if (!db.objectStoreNames.contains(STORE_NAMES.WORKOUTS)) {
                    const workoutStore = db.createObjectStore(STORE_NAMES.WORKOUTS, {
                        keyPath: 'id', // 使用統一樣式的 id
                        autoIncrement: false
                    });
                    workoutStore.createIndex('userId', 'userId', { unique: false });
                    workoutStore.createIndex('timestamp', 'timestamp', { unique: false });
                    workoutStore.createIndex('synced', 'synced', { unique: false });
                }

                // 3. Sync Status Store (New)
                if (!db.objectStoreNames.contains(STORE_NAMES.SYNC_STATUS)) {
                    db.createObjectStore(STORE_NAMES.SYNC_STATUS, {
                        keyPath: 'key'
                    });
                }

                console.log('✅ IndexedDB schema upgraded');
            };
        });
    }

    // ==========================================
    // Training Plans Methods
    // ==========================================

    async savePlan(userId, plan) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAMES.PLANS], 'readwrite');
            const store = transaction.objectStore(STORE_NAMES.PLANS);

            const data = {
                id: `plan_${userId}_${Date.now()}`,
                userId: userId,
                planId: plan.plan_id,
                plan: plan,
                timestamp: Date.now(),
                synced: false
            };

            const request = store.put(data);
            request.onsuccess = async () => {
                console.log('💾 Plan saved to IndexedDB:', data.id);
                await this.updateSyncStatus(`lastPlanSync_${userId}`, new Date().toISOString());
                resolve(data);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getLatestPlan(userId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAMES.PLANS], 'readonly');
            const store = transaction.objectStore(STORE_NAMES.PLANS);
            const index = store.index('userId');
            const request = index.getAll(userId);

            request.onsuccess = () => {
                const plans = request.result;
                if (plans.length === 0) {
                    resolve(null);
                    return;
                }
                const latest = plans.reduce((max, p) => p.timestamp > max.timestamp ? p : max, plans[0]);
                resolve(latest.plan);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getUnsyncedPlans(userId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAMES.PLANS], 'readonly');
            const store = transaction.objectStore(STORE_NAMES.PLANS);
            const request = store.getAll();

            request.onsuccess = () => {
                const allPlans = request.result;
                const unsynced = allPlans.filter(
                    p => p.userId === userId && !p.synced
                );
                resolve(unsynced);
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ==========================================
    // Running Sessions (Workouts) Methods
    // ==========================================

    async saveWorkout(userId, workout) {
        try {
            await this.init();
            const transaction = this.db.transaction([STORE_NAMES.WORKOUTS], 'readwrite');
            const store = transaction.objectStore(STORE_NAMES.WORKOUTS);

            const workoutData = {
                id: workout.session_id || `run_${userId}_${Date.now()}`,
                userId: userId,
                workout: workout,
                timestamp: workout.timestamp || Date.now(),
                synced: workout.synced || false,
                saved_at: new Date().toISOString()
            };

            await new Promise((resolve, reject) => {
                const request = store.put(workoutData);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            console.log('💾 Workout saved to IndexedDB');
            await this.updateSyncStatus(`lastWorkoutSync_${userId}`, new Date().toISOString());
            return true;
        } catch (error) {
            console.error('❌ Save workout failed:', error);
            return false;
        }
    }

    async getUnsyncedWorkouts(userId) {
        try {
            await this.init();
            const transaction = this.db.transaction([STORE_NAMES.WORKOUTS], 'readonly');
            const store = transaction.objectStore(STORE_NAMES.WORKOUTS);
            const index = store.index('userId');

            return new Promise((resolve, reject) => {
                const request = index.getAll(IDBKeyRange.only(userId));
                request.onsuccess = () => {
                    const workouts = request.result.filter(w => !w.synced);
                    console.log(`📥 Found ${workouts.length} unsynced workouts`);
                    resolve(workouts);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Get unsynced workouts failed:', error);
            return [];
        }
    }

    async markWorkoutSynced(workoutId) {
        try {
            await this.init();
            const transaction = this.db.transaction([STORE_NAMES.WORKOUTS], 'readwrite');
            const store = transaction.objectStore(STORE_NAMES.WORKOUTS);

            const data = await new Promise((resolve, reject) => {
                const request = store.get(workoutId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (data) {
                data.synced = true;
                data.synced_at = new Date().toISOString();
                await new Promise((resolve, reject) => {
                    const request = store.put(data);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
            return true;
        } catch (error) {
            console.error('❌ Mark synced failed:', error);
            return false;
        }
    }

    // ==========================================
    // Sync Status Methods
    // ==========================================

    async updateSyncStatus(key, value) {
        try {
            await this.init();
            const transaction = this.db.transaction([STORE_NAMES.SYNC_STATUS], 'readwrite');
            const store = transaction.objectStore(STORE_NAMES.SYNC_STATUS);
            await new Promise((resolve, reject) => {
                const request = store.put({ key, value, updated_at: new Date().toISOString() });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            return true;
        } catch (error) {
            console.error('❌ Update sync status failed:', error);
            return false;
        }
    }

    async getSyncStatus(key) {
        try {
            await this.init();
            const transaction = this.db.transaction([STORE_NAMES.SYNC_STATUS], 'readonly');
            const store = transaction.objectStore(STORE_NAMES.SYNC_STATUS);
            return new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Get sync status failed:', error);
            return null;
        }
    }

    // ==========================================
    // Utility Methods
    // ==========================================

    async markAsSynced(id) {
        // Alias for markPlanSynced to stay backward compatible with existing calls
        return this.markPlanSynced(id);
    }

    async markPlanSynced(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAMES.PLANS], 'readwrite');
            const store = transaction.objectStore(STORE_NAMES.PLANS);
            const getRequest = store.get(id);
            getRequest.onsuccess = () => {
                const data = getRequest.result;
                if (data) {
                    data.synced = true;
                    const updateRequest = store.put(data);
                    updateRequest.onsuccess = () => resolve(true);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve(false);
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async cleanupOldData(userId, daysToKeep = 30) {
        if (!this.db) await this.init();
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

        const deleteFromStore = (storeName) => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const index = store.index('timestamp');
                const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
                let count = 0;
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (cursor.value.userId === userId && cursor.value.synced) {
                            cursor.delete();
                            count++;
                        }
                        cursor.continue();
                    } else {
                        resolve(count);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        };

        const plansCount = await deleteFromStore(STORE_NAMES.PLANS);
        const workoutsCount = await deleteFromStore(STORE_NAMES.WORKOUTS);
        console.log(`🗑️ Cleaned up ${plansCount} plans and ${workoutsCount} workouts`);
        return plansCount + workoutsCount;
    }
}

const indexedDBManager = new IndexedDBManager();
export default indexedDBManager;
