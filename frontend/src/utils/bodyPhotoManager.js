/**
 * bodyPhotoManager.js — v3
 *
 * CHANGE from v2:
 *   savePhoto now stores a full `snapshot` of the composition at capture time.
 *   This includes weight, bodyFat, muscle parts, bmr, etc.
 *   When switching photos, the parent can use this snapshot to override ALL fields,
 *   not just weight/bodyFat — fixing the body label desync issue.
 *
 * Storage key: `body_photos_${userId}`
 * Each entry:  { id, image, date, bodyWeight?, bodyFat?, snapshot? }
 * Sorted:      newest-first (index 0 = most recent)
 */

const STORAGE_KEY = (userId) => `body_photos_${userId}`;

export const getPhotos = (userId) => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY(userId));
        if (!raw) return [];
        const photos = JSON.parse(raw);
        return photos.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (e) {
        console.error('[bodyPhotoManager] getPhotos error:', e);
        return [];
    }
};

/**
 * Save a new photo with full composition snapshot.
 * @param {string} userId
 * @param {string} imageBase64
 * @param {object} metadata - { bodyWeight, bodyFat, snapshot }
 *   snapshot: the full finalComposition object at capture time
 */
export const savePhoto = (userId, imageBase64, metadata = {}) => {
    try {
        const existing = getPhotos(userId);

        // Build a clean snapshot — strip non-serializable or huge fields
        let cleanSnapshot = null;
        if (metadata.snapshot && typeof metadata.snapshot === 'object') {
            cleanSnapshot = {};
            const SNAPSHOT_KEYS = [
                'weight', 'body_fat_percentage', 'muscle_mass', 'bmr',
                'inbody_score', 'visceral_fat_level', 'body_water_percent',
                'trunk_muscle', 'left_arm_muscle', 'right_arm_muscle',
                'left_leg_muscle', 'right_leg_muscle',
                'weight_kg', 'body_fat_percent', 'skeletal_muscle_mass', 'bmi',
            ];
            SNAPSHOT_KEYS.forEach(k => {
                if (metadata.snapshot[k] !== null && metadata.snapshot[k] !== undefined && metadata.snapshot[k] !== '') {
                    cleanSnapshot[k] = metadata.snapshot[k];
                }
            });
        }

        const newPhoto = {
            id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            image: imageBase64,
            date: new Date().toISOString(),
            bodyWeight: metadata.bodyWeight ?? null,
            bodyFat: metadata.bodyFat ?? null,
            snapshot: cleanSnapshot,
        };

        const updated = [newPhoto, ...existing];

        try {
            localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(updated));
        } catch (quotaError) {
            console.warn('[bodyPhotoManager] Storage quota exceeded, removing oldest photo');
            if (updated.length > 1) {
                const trimmed = updated.slice(0, -1);
                localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(trimmed));
            } else {
                throw quotaError;
            }
        }

        console.log(`[bodyPhotoManager] Saved photo ${newPhoto.id}. Total: ${updated.length}. Has snapshot: ${!!cleanSnapshot}`);
        return newPhoto;
    } catch (e) {
        console.error('[bodyPhotoManager] savePhoto error:', e);
        return null;
    }
};

export const deletePhoto = (userId, photoId) => {
    try {
        const existing = getPhotos(userId);
        const updated = existing.filter(p => p.id !== photoId);
        localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(updated));
        console.log(`[bodyPhotoManager] Deleted photo ${photoId}. Remaining: ${updated.length}`);
        return updated;
    } catch (e) {
        console.error('[bodyPhotoManager] deletePhoto error:', e);
        return getPhotos(userId);
    }
};

export const formatPhotoDate = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}/${d.getDate()}`;
};
