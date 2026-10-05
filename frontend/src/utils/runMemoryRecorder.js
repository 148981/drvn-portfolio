// 🏃 runMemoryRecorder — 跑完存檔時把地點與路線記進跑步記憶（utils/runMemory）
// 起跑點附近沒記過 → 用 Apple 地圖找附近的公園／操場取名（找不到用地區名），使用者之後可以改。
// 任何一步失敗都安靜略過：記憶是加分，不能擋存檔。
import { loadRunMemory, saveRunMemory, recordRun, findRunPlaceNear, kindFromCategory } from './runMemory';
import { getNearbyPlaces } from './nearbyPlaces';
import { reverseGeocodeName } from './locationName';

export async function recordRunToMemory(userId, { route, distanceKm, durationSec, type = null } = {}) {
    try {
        if (!userId || !Array.isArray(route) || route.length < 2) return null;
        const start = route[0];
        let place = null;
        if (!findRunPlaceNear(loadRunMemory(userId), start)) {
            const [places, area] = await Promise.all([
                getNearbyPlaces(start, { kind: 'run', radius: 300 }).catch(() => []),
                reverseGeocodeName(start.lat, start.lng).catch(() => null),
            ]);
            const poi = places[0] || null;
            place = {
                poiName: poi?.name || null,
                kind: kindFromCategory(poi?.category, poi?.name),
                area: area || null,
                name: poi?.name || (area ? area.split(' · ')[0] : null),
            };
        }
        // 等地圖回來的期間記憶可能被改過 → 重讀再寫
        const r = recordRun(loadRunMemory(userId), { route, distanceKm, durationSec, type, place });
        saveRunMemory(userId, r.mem);
        return r;
    } catch { return null; }
}

export default recordRunToMemory;
