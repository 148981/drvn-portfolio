import SwiftUI
import WebKit
import CoreLocation
import MapKit                    // 📍 附近健身房／跑步地點（MKLocalPointsOfInterestRequest，免金鑰）
import Photos                    // 儲存圖片到相片庫
import UIKit                     // UIImpactFeedbackGenerator
import WatchConnectivity
import AuthenticationServices    // ASWebAuthenticationSession (OAuth)
import Security                  // Keychain（登入狀態持久化，跨 rebuild 不遺失）
import WidgetKit                 // 🎴 桌面小工具（DailyPromptWidget）資料刷新

// ============================================================================
// MARK: - AppConfig（全 App 唯一的網址設定來源）
// ----------------------------------------------------------------------------
// 上架前唯一要改的地方：把 productionBaseURL 換成 Railway 的正式網址。
//
// 設計原則：
//   • Debug 版（Xcode 跑模擬器 / 連線開發機）→ 走區網開發伺服器，方便熱重載。
//   • Release 版（上架 / TestFlight）         → 走 Railway 正式後端 + App 內建網頁。
//   • 所有原生 API 呼叫一律用 AppConfig.apiBaseURL，禁止再寫死 IP。
//
// ⚠️ 重點：Railway 是 https://… 走 443，不是 http://host:8000。
//    所以這裡提供「完整 base URL」，呼叫端只要接 path，不要自己拼 :8000。
// ============================================================================
enum AppConfig {

    /// 🔧 開發用區網設定（只在 DEBUG build 生效，上架版完全不會用到）
    private static let devLANHost = "172.20.10.4"
    private static let devAPIPort = 8000
    private static let devWebPort = 5179

    /// 🚀 正式後端網址（上架前換成 Railway 的網域，結尾不要加斜線）
    ///    例：https://drvn-backend-production.up.railway.app
    static let productionBaseURL = "https://drvn-app-production.up.railway.app"

    /// 原生 API 呼叫的 base URL（呼叫端只接 path，如 "\(apiBaseURL)/api/plan/...")
    static var apiBaseURL: String {
        #if DEBUG
        return "http://\(devLANHost):\(devAPIPort)"
        #else
        return productionBaseURL
        #endif
    }

    /// WebView 要載入的網頁來源。
    /// DEBUG：載開發機（Vite dev server）方便熱重載。
    /// Release：回傳 nil → 改載 App 內建的 WebContent/dist（離線打包版）。
    static var devWebURL: String? {
        #if DEBUG
        return "http://\(devLANHost):\(devWebPort)/#/mobile-home"
        #else
        return nil
        #endif
    }

    /// 🔗 App 內建網頁的自訂載入 scheme。
    ///    用自訂 scheme（而非 file://）載入打包網頁，讓 `/desktop/...`、`/assets/...`
    ///    這類「絕對路徑」資源能正確解析到 dist 根目錄（file:// 下會被解析到檔案系統根 → 破圖）。
    ///    對應網頁 origin 為 "drvn://app"，後端 CORS 需放行此 origin（見 backend/main.py）。
    static let appScheme = "drvn"
    static let appHost = "app"
    /// 網頁 origin 字串，供後端 CORS 白名單對照（drvn://app）。
    static var webOrigin: String { "\(appScheme)://\(appHost)" }
}

// ============================================================================
// MARK: - KeychainStore（登入狀態持久化，跨 rebuild / 重裝不遺失）
// ----------------------------------------------------------------------------
// 問題：登入 token 原本只存在 WKWebView 的 localStorage，App 一重裝(每次 Xcode build
//      安裝新版都算重裝) localStorage 就被清掉 → 被登出 → 又要走 LAN/OAuth 重登很痛苦。
// 解法：登入成功時把 auth_token + userId 也寫進 Keychain（重裝後仍保留），
//      WebView 載入完成時若 localStorage 沒有就從 Keychain 還原。登出時清掉 Keychain。
// ============================================================================
enum KeychainStore {
    private static let service = "app.drvn.auth"

    @discardableResult
    static func save(_ value: String, for key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)   // 先刪舊值，避免 duplicate
        var attrs = query
        attrs[kSecValueData as String] = data
        attrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(attrs as CFDictionary, nil) == errSecSuccess
    }

    static func load(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let str = String(data: data, encoding: .utf8), !str.isEmpty else { return nil }
        return str
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    // 便捷 key
    static let tokenKey  = "drvn_auth_token"
    static let userIdKey = "drvn_user_id"
    /// 訪客的裝置密語（後端用它綁定訪客身分）。重裝後只還原 token 不還原密語，
    /// token 一過期就換不到新的（後端回 guest_claimed）→ 訪客資料再也打不開。所以一起鏡像。
    static let guestSecretKey = "drvn_guest_secret"

    static func saveLogin(token: String, userId: String) {
        if !token.isEmpty { save(token, for: tokenKey) }
        if !userId.isEmpty { save(userId, for: userIdKey) }
    }
    static func clearLogin() {
        delete(tokenKey); delete(userIdKey)
    }
}

// ============================================================================
// MARK: - 🛡️ 安全 JSON 序列化（Swift → JS）
// ----------------------------------------------------------------------------
// JSONSerialization.data(withJSONObject:) 遇到非 JSON 型別（Date、NaN / Infinity、
// 手錶 WCSession 帶來的 plist 型別…）會丟 Objective-C 例外 → App 直接閃退，
// `try?` 接不住。所有送往 WebView 的 payload 一律先過 isValidJSONObject。
// ============================================================================
func drvnJSONString(_ obj: Any) -> String? {
    guard JSONSerialization.isValidJSONObject(obj),
          let data = try? JSONSerialization.data(withJSONObject: obj),
          let str = String(data: data, encoding: .utf8) else {
        print("⚠️ [Bridge] payload 不是合法 JSON，已略過")
        return nil
    }
    return str
}

// MARK: - Map State Model
struct MapState {
    var isVisible: Bool = false
    var center: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: 25.033, longitude: 121.565)
    var routeCoordinates: [CLLocationCoordinate2D] = []
    var markers: [MapMarker] = []
    var currentPosition: CLLocationCoordinate2D? = nil
    var zoom: Double = 15
    var title: String = ""
    
    struct MapMarker: Identifiable {
        let id = UUID()
        let coordinate: CLLocationCoordinate2D
        let label: String
        let color: Color
        let index: Int
    }
}

// MARK: - Health App Bridge (shared state between SwiftUI ↔ WKWebView)
@available(iOS 17.0, *)
class HealthAppBridge: ObservableObject {
    @Published var isLoading: Bool = true
    @Published var loadingError: String? = nil
    /// 真實載入進度 (0.0 ~ 1.0)，由 WKWebView.estimatedProgress 經 KVO 即時更新。
    /// 載入畫面的進度條直接綁定此值，讓進度條反映實際的網頁載入時間。
    @Published var loadProgress: Double = 0.0

    // ── 混合式載入畫面收尾控制 ──────────────────────────────────────
    // 載入畫面要等「兩個條件都滿足」才淡出：
    //   (A) 網頁實際載入完成 (didFinish)               → webContentReady
    //   (B) logo 描邊動畫至少完整畫完一遍              → splashAnimationDone
    // 取兩者較晚者，確保 logo 一定畫得完，網頁慢時也照真實時間等。
    private var webContentReady = false
    /// 載入畫面動畫畫完一遍後，由 DRVNLoadingView 回呼設成 true。
    var splashAnimationDone = false {
        didSet { dismissSplashIfReady() }
    }

    weak var webView: WKWebView?

    var isPreview: Bool = false
    @Published var mapState = MapState()
    @Published var showNativeStartButton: Bool = false

    lazy var healthKit = HealthKitManager()
    var healthKitExtension: HealthKitExtension?
    /// 🏋️ 混合邊緣運算：Swift 原生骨架偵測模組（Phase 1 為橋接骨架）。
    /// 持有它只為了後續存取；WKUserContentController 註冊時也會強引用一份。
    var poseAnalyzer: PoseAnalyzer?
    /// 💳 App 內購（StoreKit 2）。整個 App 生命週期只建一個。
    var storeManager: StoreManager?
    lazy var location  = LocationManager()
    lazy var notification = NotificationManager()

    init(isPreview: Bool = false) {
        self.isPreview = isPreview
        // Note: ObservableObject has no superclass — super.init() is invalid here
        // Force-init the WCSession delegate singleton so Watch ↔ iOS messages are received.
        // WatchConnectivityManager.shared is lazy — without this line, WCSession.default.delegate
        // is never set and all Watch messages are silently dropped.
        _ = WatchConnectivityManager.shared
        setupWatchPlanObserver()
    }

    private func setupWatchPlanObserver() {
        // ── Listen for Watch requesting the current plan ──────────────────
        NotificationCenter.default.addObserver(
            forName: .didRequestGymPlan,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.sendGymPlanToWatch()
        }

        // ── 📶 手錶連線狀態 → React（顯示「已連接 Apple Watch」提示的依據）──
        NotificationCenter.default.addObserver(
            forName: .didChangeWatchConnection,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self, let info = notification.userInfo as? [String: Any] else { return }
            if let jsonString = drvnJSONString(info) {
                let js = """
                window.dispatchEvent(new CustomEvent('watch-connection-status', {
                    detail: \(jsonString)
                }));
                """
                self.webView?.evaluateJavaScript(js)
                print("[HealthAppBridge] 📶 watch-connection-status → React: \(jsonString)")
            }
        }

        // ── 🟢 手錶追蹤狀態(workout 進行中) → React ──
        NotificationCenter.default.addObserver(
            forName: .didChangeWatchTracking,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let tracking = notification.userInfo?["tracking"] as? Bool else { return }
            let js = "window.dispatchEvent(new CustomEvent('watch-tracking', { detail: { tracking: \(tracking) } }));"
            self.webView?.evaluateJavaScript(js)
        }

        // ── 🩹 W-1: HKWorkoutSession 失敗 → React 顯示「量測中斷」──
        NotificationCenter.default.addObserver(
            forName: .drvnHKWorkoutError,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self else { return }
            let msg = (notification.userInfo?["message"] as? String) ?? "unknown"
            let payload: [String: Any] = [
                "type": "workoutError",
                "data": ["message": msg],
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]
            if let jsonString = drvnJSONString(payload) {
                let js = "window.dispatchEvent(new CustomEvent('healthKitMessage', { detail: \(jsonString) }));"
                self.webView?.evaluateJavaScript(js)
            }
        }

        // ── ❤️ 即時心率（手錶傳來的單值 heartRate）→ React ──
        //    重訓模式心率主要走 HealthKit，但手錶在 sendMessage 時也會帶 heartRate，
        //    這裡一併轉發，讓「有手錶心率 = 已連接且記錄中」的判斷更即時。
        NotificationCenter.default.addObserver(
            forName: .didReceiveWatchHeartRate,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let hr = notification.userInfo?["heartRate"] as? Double, hr.isFinite else { return }
            let js = """
            window.dispatchEvent(new CustomEvent('watch-heart-rate', {
                detail: { heartRate: \(hr) }
            }));
            """
            self.webView?.evaluateJavaScript(js)
        }

        // ── Forward GYM_DONE workout data to React JS → backend save ─────
        NotificationCenter.default.addObserver(
            forName: .didReceiveGymDone,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let payload = notification.userInfo as? [String: Any] else { return }
            self?.sendToJS(type: "GYM_DONE", data: payload)
            print("[HealthAppBridge] GYM_DONE forwarded to React — volume: \(payload["volume"] ?? 0)kg")
        }

        // ── Watch saved directly to API → tell React to refresh 紀錄 list ──
        NotificationCenter.default.addObserver(
            forName: .didWatchWorkoutSaved,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // Dispatch the same custom event that WatchWorkoutSync fires after its own save
            let js = "window.dispatchEvent(new CustomEvent('watch-workout-saved'));"
            self?.webView?.evaluateJavaScript(js)
            print("[HealthAppBridge] Dispatched watch-workout-saved event to React")
        }

        // ── 🔴 Forward LIVE_METRICS (1Hz HealthKit snapshot) to React ─────
        //    React's CardioTrackerMobile listens for 'watch-live-metrics'
        //    and replaces its simulated values with the real Watch data.
        NotificationCenter.default.addObserver(
            forName: .didReceiveWatchLiveMetrics,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self, let payload = notification.userInfo else { return }
            if let jsonString = drvnJSONString(payload) {
                let js = """
                window.dispatchEvent(new CustomEvent('watch-live-metrics', {
                    detail: \(jsonString)
                }));
                """
                self.webView?.evaluateJavaScript(js)
            }
        }

        // ── ⌚ 手錶上按了暫停／繼續／結束 → 告訴 React（手機跟著停，兩邊時間才對得上）
        //    以前 WatchConnectivityManager 有廣播，但沒有人接。
        NotificationCenter.default.addObserver(
            forName: .didReceiveWatchWorkoutState,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let state = notification.userInfo?["state"] as? String else { return }
            let safe = state.replacingOccurrences(of: "'", with: "")
            let js = "window.dispatchEvent(new CustomEvent('watch-workout-state', { detail: { state: '\(safe)' } }));"
            self?.webView?.evaluateJavaScript(js)
        }

        // ── Forward Cardio Summary to React (single source of truth) ──────
        // ⚠️ DO NOT also POST to /api/cardio/session here. React 端的
        //    `CardioTrackerMobile.handleWatchSummary()` 會負責呼叫
        //    saveWorkoutData()。如果 native 與 React 都各存一次，
        //    後端會以兩個不同 UUID 各自存一筆，造成 history 出現重複紀錄。
        NotificationCenter.default.addObserver(
            forName: .didReceiveWatchWorkoutSummary,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self, let payload = notification.userInfo else { return }

            // 透過 JavaScript injection 把整包資料傳給 React
            if let jsonString = drvnJSONString(payload) {
                let js = """
                window.dispatchEvent(new CustomEvent('watch-cardio-summary', {
                    detail: { watchSummaryPayload: \(jsonString) }
                }));
                """
                self.webView?.evaluateJavaScript(js)
                print("[HealthAppBridge] Dispatched watch-cardio-summary → React (no native save)")
            }
        }
    }

    // MARK: - 🌟 Surgery 2: Save Watch Cardio Session to Backend
    // ⚠️ DEPRECATED — DO NOT CALL.
    //    Saving is now owned exclusively by React (`CardioTrackerMobile.handleWatchSummary`)
    //    which already POSTs to /api/cardio/session. Calling this in addition would
    //    create duplicate session entries (one per UUID) in the user's
    //    cardio_sessions_<uid>.json file. Kept around as a safety hatch in case the
    //    WebView path is ever unavailable.
    func saveWatchCardioSession(userId: String, payload: [AnyHashable: Any], host: String) {
        let stats      = payload["stats"] as? [String: Any] ?? [:]
        
        let duration   = stats["duration"]   as? Int    ?? 0
        let calories   = stats["calories"]   as? Double ?? 0
        let distance   = stats["distance"]   as? Double ?? 0 // already KM from Watch now
        let avgHR      = stats["avgHR"]      as? Double ?? 0
        let zoneStats  = stats["zoneStats"]  as? [String: Int] ?? [:]
        let score      = stats["score"]      as? Double ?? 0
        let avgPaceSec = stats["avgPace"]    as? Double ?? 0  // seconds/km from Watch
        let splits     = stats["splits"]     as? [[String: Any]] ?? []
        
        let streamData = payload["stream_data"] as? [String: Any] ?? [:]
        
        _ = host // legacy param kept for call-site compatibility; URL now from AppConfig
        guard let saveURL = URL(string: "\(AppConfig.apiBaseURL)/api/cardio/session") else { return }
        var saveReq = URLRequest(url: saveURL)
        saveReq.httpMethod = "POST"
        saveReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Build zoneStats matching backend format
        var zoneStatsForBackend: [String: Int] = [
            "Recovery": 0, "Warm-up": 0, "Fat Burn": 0,
            "Aerobic": 0, "Anaerobic": 0, "Extreme": 0
        ]
        for (k, v) in zoneStats { zoneStatsForBackend[k] = v }
        
        let distanceKm = distance // It's already in KM from the new Watch payload
        let avgPacePerKm: Double = avgPaceSec / 60.0 // convert sec/km → min/km for display
        
        let ISOFormatter = ISO8601DateFormatter()
        ISOFormatter.timeZone = TimeZone.current
        
        let requestBody: [String: Any] = [
            "user_id": userId,
            "date": ISOFormatter.string(from: Date()),
            "route_data": [["lat": 0.0, "lng": 0.0, "timestamp": Int(Date().timeIntervalSince1970 * 1000)]],
            "metrics": [
                "distance_km": distanceKm,
                "duration_seconds": duration,
                "calories": calories,
                "avgHR": avgHR,
                "avgPace": avgPacePerKm,
                "score": score,
                "zoneStats": zoneStatsForBackend,
                "splits": splits
            ],
            "stream_data": streamData,
            "type": payload["type"] as? String ?? "running"
        ]
        saveReq.httpBody = try? JSONSerialization.data(withJSONObject: requestBody)
        
        URLSession.shared.dataTask(with: saveReq) { [weak self] data, response, err in
            if let err = err {
                print("[HealthAppBridge] ❌ cardio/session failed: \(err.localizedDescription)")
            } else if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode >= 400 {
                let body = String(data: data ?? Data(), encoding: .utf8) ?? ""
                print("[HealthAppBridge] ❌ cardio/session HTTP \(httpResponse.statusCode): \(body)")
            } else {
                print("[HealthAppBridge] ✅ Watch cardio session saved for userId=\(userId) dist=\(String(format:"%.0f",distance))m dur=\(duration)s")
                // Notify React to refresh history list
                DispatchQueue.main.async { [weak self] in
                    let js = "window.dispatchEvent(new CustomEvent('watch-workout-saved'));"
                    self?.webView?.evaluateJavaScript(js)
                }
            }
        }.resume()
    }

    // MARK: - Preview Mock
    static var preview: HealthAppBridge {
        let bridge = HealthAppBridge(isPreview: true)
        bridge.isLoading = false
        return bridge
    }

    // MARK: - Send LuxuryPlan → Watch
    func sendGymPlanToWatch() {
        guard !isPreview else { return }

        // ── Strategy: Backend API first (origin-agnostic, works regardless of port)
        //    Fall back to WKWebView localStorage only if API fails.
        // ─────────────────────────────────────────────────────────────────────

        // Step 1: Get userId from WKWebView localStorage (fast, same-origin safe)
        guard let wv = webView else {
            print("[HealthAppBridge] sendGymPlanToWatch: no webView")
            return
        }
        // userId、登入 token、目前第幾週一起讀：後端 /api/plan/{uid}/latest 需要登入（以前沒帶 → 401），
        // 而且以前寫死第 1 週，第 2 週之後手錶上還是第 1 週的菜單。
        let js = "JSON.stringify([localStorage.getItem('userId')||'', localStorage.getItem('auth_token')||'', localStorage.getItem('activeWeek_'+(localStorage.getItem('userId')||''))||'1'])"
        wv.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self = self else { return }
            var userId = "", token = "", activeWeek = 1
            if let str = result as? String, let data = str.data(using: .utf8),
               let arr = try? JSONSerialization.jsonObject(with: data) as? [String] {
                userId = arr.count > 0 ? arr[0] : ""
                token = arr.count > 1 ? arr[1] : ""
                activeWeek = max(1, Int(arr.count > 2 ? arr[2] : "1") ?? 1)
            }

            if !userId.isEmpty {
                // Step 2: Try backend API first (most reliable — port-agnostic)
                self.fetchAndSendPlanFromBackend(userId: userId, token: token, activeWeek: activeWeek)
            }

            // Step 3: Also try localStorage as a parallel/fallback path
            self.sendPlanFromLocalStorage()
        }
    }

    /// Try reading the plan from WKWebView localStorage and sending to Watch.
    /// This works when the WebView is on the SAME origin/port as the plan was saved.
    private func sendPlanFromLocalStorage() {
        guard let wv = webView else { return }

        let js = """
        (function() {
            try {
                const userId = localStorage.getItem('userId') || '';
                const raw = localStorage.getItem('currentPlan_' + userId);
                if (!raw) return '[]';
                const plan = JSON.parse(raw);
                if (!plan || !Array.isArray(plan.weeks) || !plan.weeks.length) return '[]';

                const activeWeekNum = parseInt(localStorage.getItem('activeWeek_' + userId) || '1');
                const weekIdx = Math.max(0, activeWeekNum - 1);
                const week = plan.weeks[weekIdx] || plan.weeks[0];
                if (!week || !Array.isArray(week.days)) return '[]';

                const scheduleRaw = localStorage.getItem('weeklyTrainingDays_' + userId);
                const schedule = scheduleRaw ? JSON.parse(scheduleRaw) : null;
                const todayWeekday = new Date().getDay();
                const weekSched = schedule && schedule[String(activeWeekNum)];
                const todayDayNum = weekSched ? (weekSched[String(todayWeekday)] || 0) : 0;

                const extractLabel = (focus, shortFocus) => {
                    if (!focus && !shortFocus) return 'Training';
                    const combined = ((shortFocus || '') + ' ' + (focus || '')).toLowerCase();
                    if (combined.includes('full body') || combined.includes('full_body')) return 'Full Body';
                    const sh = (shortFocus || '').toLowerCase();
                    const fo = (focus || '').toLowerCase();
                    if (sh.startsWith('push') || fo.startsWith('push')) return 'Push';
                    if (sh.startsWith('pull') || fo.startsWith('pull')) return 'Pull';
                    if (sh.startsWith('leg')  || fo.startsWith('leg'))  return 'Legs';
                    // Bro-split: take main muscle before "—"
                    const dashParts = (focus || '').split('—');
                    const main = (dashParts[0] || focus || '').trim();
                    const parenStart = main.indexOf('(');
                    const parenEnd   = main.lastIndexOf(')');
                    if (parenStart >= 0 && parenEnd > parenStart)
                        return main.substring(parenStart + 1, parenEnd).trim();
                    const slashParts = main.split('/');
                    if (slashParts.length > 1) return slashParts[slashParts.length - 1].trim();
                    return main || 'Training';
                };

                const days = week.days.filter(d => !d.is_rest_day && Array.isArray(d.exercises) && d.exercises.length > 0);
                return JSON.stringify(days.map((d, i) => {
                    const dayNum = d.day_number || (i + 1);
                    const isToday = todayDayNum > 0 && dayNum === todayDayNum;
                    const focusLabel = extractLabel(d.focus || d.workout_name || d.name, d.shortFocus);
                    return {
                        label: (isToday ? 'Today · ' : ('Day ' + dayNum + ' · ')) + focusLabel,
                        muscle: focusLabel,
                        // 🔴 Fix(plan-parity)：不再截斷。完整送出全部動作與組數，
                        //    讓手錶計劃與手機「一模一樣」。repsLabel 保留原始區間字串（如 8-12）。
                        exercises: (d.exercises || []).map(ex => ({
                            name: ex.name || '',
                            repsLabel: String(ex.reps != null ? ex.reps : '10'),
                            sets: Array.from({length: parseInt(ex.sets) || 3}, () => ({
                                weight: parseFloat(ex.weight || ex.load || 0) || 0,
                                reps: parseInt(String(ex.reps).split('-')[0]) || 10
                            }))
                        }))
                    };
                }));
            } catch(e) {
                console.error('[sendGymPlanToWatch] Error:', e);
                return '[]';
            }
        })()
        """

        wv.evaluateJavaScript(js) { result, error in
            guard let jsonString = result as? String, !jsonString.isEmpty, jsonString != "[]",
                  let data = jsonString.data(using: .utf8),
                  let planArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
            else {
                print("[HealthAppBridge] localStorage path: no plan found (likely port mismatch or not loaded yet)")
                return
            }
            // Only send if backend hasn't already sent a plan
            print("[HealthAppBridge] localStorage path: sending \(planArray.count) day(s) to Watch")
            // 🟢 也把 userId 從 localStorage 撈出來一起送，避免 Watch 只能用寫死的 fallback id
            wv.evaluateJavaScript("localStorage.getItem('userId') || ''") { uidResult, _ in
                let uid = (uidResult as? String) ?? ""
                var msg: [String: Any] = ["gymPlan": planArray]
                if !uid.isEmpty { msg["userId"] = uid }
                // 🟢 把後端 base URL 帶過去，Watch 直接用它打 API（Railway https/443 也正確）。
                //    同時附帶純 host 以相容尚未更新的舊版 Watch build。
                msg["apiBaseURL"] = AppConfig.apiBaseURL
                if let host = URL(string: AppConfig.apiBaseURL)?.host, !host.isEmpty {
                    msg["apiHost"] = host
                }
                if WCSession.isSupported() && WCSession.default.activationState == .activated {
                    if WCSession.default.isReachable {
                        WCSession.default.sendMessage(msg, replyHandler: nil)
                    } else {
                        WCSession.default.transferUserInfo(msg)
                    }
                }
            }
        }
    }
    // MARK: - Backend API (primary source for Watch plan sync)
    private func fetchAndSendPlanFromBackend(userId: String, token: String = "", activeWeek: Int = 1) {
        guard let url = URL(string: "\(AppConfig.apiBaseURL)/api/plan/\(userId)/latest") else { return }
        print("[HealthAppBridge] Fetching plan from backend: \(url.absoluteString)")
        var request = URLRequest(url: url)
        if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        URLSession.shared.dataTask(with: request) { data, _, error in
            guard error == nil,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let plan = json["plan"] as? [String: Any],
                  let weeks = plan["weeks"] as? [[String: Any]], !weeks.isEmpty else {
                print("[HealthAppBridge] fetchAndSendPlanFromBackend: failed — \(error?.localizedDescription ?? "parse error or no plan")")
                return
            }

            // Determine which week to use (prefer week 1 for now; the Watch shows all days)
            // Collect ALL training days across the plan's current active week
            let activeWeekIdx = max(0, activeWeek - 1)
            let week = weeks[min(activeWeekIdx, weeks.count - 1)]
            guard let days = week["days"] as? [[String: Any]] else { return }

            // Try to determine today's training day from backend schedule
            let schedule = plan["training_schedule"] as? [String: [String: Int]]
            let todayWeekday = Calendar.current.component(.weekday, from: Date()) - 1  // 0=Sun … 6=Sat → convert to JS convention
            let weekSched = schedule?["\(activeWeek)"] ?? schedule?["1"]
            let todayDayNum = weekSched?["\(todayWeekday)"] ?? 0

            let planArray: [[String: Any]] = days.compactMap { day in
                guard (day["is_rest_day"] as? Bool) != true,
                      let exercises = day["exercises"] as? [[String: Any]], !exercises.isEmpty else { return nil }
                let dayNum = (day["day_number"] as? Int) ?? 0
                let isToday = todayDayNum > 0 && dayNum == todayDayNum
                let focusRaw   = (day["focus"]       as? String) ?? (day["workout_name"] as? String) ?? ""
                let shortFocus = (day["shortFocus"] as? String ?? "").trimmingCharacters(in: .whitespaces)
                // Smart label: PPL → "Push/Pull/Legs", Full Body → "Full Body", Bro-split → main muscle
                let focus: String = {
                    let combined = (shortFocus + " " + focusRaw).lowercased()
                    if combined.contains("full body") || combined.contains("full_body") { return "Full Body" }
                    let tokens = [shortFocus.lowercased(), focusRaw.lowercased()]
                    for t in tokens {
                        if t.hasPrefix("push") { return "Push" }
                        if t.hasPrefix("pull") { return "Pull" }
                        if t.hasPrefix("leg")  { return "Legs" }
                    }
                    // Bro-split: take segment before "—"
                    let main = (focusRaw.components(separatedBy: "—").first ?? focusRaw).trimmingCharacters(in: .whitespaces)
                    if let ps = main.firstIndex(of: "("), let pe = main.lastIndex(of: ")"), ps < pe {
                        return String(main[main.index(after: ps)..<pe]).trimmingCharacters(in: .whitespaces)
                    }
                    let slashParts = main.components(separatedBy: "/")
                    if slashParts.count > 1 { return slashParts.last?.trimmingCharacters(in: .whitespaces) ?? main }
                    return main.isEmpty ? "Training" : main
                }()
                let label = (isToday ? "Today · " : "Day \(dayNum) · ") + (focus.isEmpty ? "Training" : focus)
                // 🔴 Fix(plan-parity)：不再 prefix(8) / min(sets,5) 截斷，
                //    完整送出全部動作與組數，讓手錶計劃與手機「一模一樣」。
                let exList: [[String: Any]] = exercises.map { ex in
                    let setsN: Int = {
                        if let s = ex["sets"] as? Int { return max(1, s) }
                        if let s = ex["sets"] as? String { return max(1, Int(s) ?? 3) }
                        return 3
                    }()
                    let repsLabel: String = {
                        if let r = ex["reps"] as? Int { return String(r) }
                        if let r = ex["reps"] as? String { return r }
                        return "10"
                    }()
                    let repsN: Int = Int(repsLabel.components(separatedBy: "-").first ?? repsLabel) ?? 10
                    let weight: Double = {
                        if let w = ex["weight"] as? Double { return w }
                        if let w = ex["weight"] as? Int { return Double(w) }
                        if let w = ex["load"] as? Double { return w }
                        return 0.0
                    }()
                    return ["name": (ex["name"] as? String) ?? "",
                            "repsLabel": repsLabel,
                            "sets": Array(repeating: ["weight": weight, "reps": repsN] as [String: Any], count: setsN)]
                }
                return ["label": label, "muscle": focus, "exercises": exList]
            }

            guard !planArray.isEmpty else {
                print("[HealthAppBridge] fetchAndSendPlanFromBackend: no training days found in plan")
                return
            }
            print("[HealthAppBridge] ✅ Backend API: sending \(planArray.count) day(s) to Watch (uid=\(userId))")
            guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
            DispatchQueue.main.async {
                // 🟢 把 userId + 後端網址一起塞進 message。
                //    apiBaseURL 為完整網址（Railway https/443 也正確），apiHost 純 host 相容舊版。
                var msg: [String: Any] = ["gymPlan": planArray, "userId": userId,
                                          "apiBaseURL": AppConfig.apiBaseURL]
                if let h = URL(string: AppConfig.apiBaseURL)?.host, !h.isEmpty { msg["apiHost"] = h }
                if WCSession.default.isReachable {
                    WCSession.default.sendMessage(msg, replyHandler: nil)
                } else {
                    WCSession.default.transferUserInfo(msg)
                }
            }
        }.resume()
    }

    func sendToJS(type: String, data: [String: Any] = [:]) {
        guard !isPreview else { return }
        var payload = data
        payload["type"] = type
        guard let jsonString = drvnJSONString(payload) else { return }
        let js = "window.nativeBridge && window.nativeBridge.onNativeEvent('\(jsonString.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'"))');"
        DispatchQueue.main.async { self.webView?.evaluateJavaScript(js) }
    }
    
    func reload() {
        DispatchQueue.main.async {
            self.loadingError = nil
            self.isLoading = true
            self.loadProgress = 0.0   // 重新整理時進度條歸零
            self.webContentReady = false
            self.splashAnimationDone = false  // 重新整理 → 動畫重新跑、重新畫一遍
            self.webView?.reload()
        }
    }

    // ── 混合式收尾 ──────────────────────────────────────────────
    /// 標記網頁內容已載入完成 (由 WebViewDelegate.didFinish 呼叫)。
    func markWebContentReady() {
        webContentReady = true
        loadProgress = 1.0          // 進度條補滿到 100%
        dismissSplashIfReady()
    }

    /// 只有「網頁載完」且「描邊動畫至少畫完一遍」兩者都成立，才淡出載入畫面。
    /// 取兩者較晚者 → logo 保證畫得完，網頁慢時也照真實時間等。
    func dismissSplashIfReady() {
        guard webContentReady, splashAnimationDone, isLoading else { return }
        DispatchQueue.main.async {
            // 留一點時間讓進度條動畫跑到 100%，再移除 overlay
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                self.isLoading = false
                // 🎬 載入畫面消失 → 通知 React「畫面真正可見了」，首頁才開始播進場動畫
                //    （否則動畫在 splash 後面就播完了，使用者看不到）
                self.webView?.evaluateJavaScript(
                    "window.__drvnRevealed = true; window.dispatchEvent(new CustomEvent('drvn:app-revealed'));",
                    completionHandler: nil
                )
            }
        }
    }
}

// MARK: - SwiftUI UIViewRepresentable Wrapper
@available(iOS 17.0, *)
struct WebView: UIViewRepresentable {
    @ObservedObject var bridgeManager: HealthAppBridge

    init(bridgeManager: HealthAppBridge) {
        self._bridgeManager = ObservedObject(wrappedValue: bridgeManager)
    }

    typealias Coordinator = WebViewDelegate

    func makeUIView(context: Context) -> WKWebView {
        print("🚀 [WebView] Initializing...")
        let config = WKWebViewConfiguration()

        // 0. 影片一律內嵌播放，不要接管全螢幕
        //    ⚠️ allowsInlineMediaPlayback 在 iPhone 上預設是 false —— 只要網頁呼叫
        //       video.play()，iOS 就會把播放器推成全螢幕。裝置端建模需要在背景
        //       逐幀讀取影片，這個預設值會讓使用者看到「上傳完卻跳出影片預覽、
        //       還要手動滑掉」，而滑掉＝暫停播放＝抽幀迴圈永遠等不到下一幀。
        //    mediaTypesRequiringUserActionForPlayback = [] 讓靜音影片不需要
        //       使用者手勢就能播放（否則 play() 會被拒絕）。
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // 1. Viewport & Bridge
        let source = "var meta = document.createElement('meta'); meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'; document.getElementsByTagName('head')[0].appendChild(meta);"
        config.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController.add(context.coordinator, name: "fitnessApp")
        
        // 2. HealthKit Extension
        let manager = self.bridgeManager
        let hkManager = manager.healthKit
        let hkExtension = HealthKitExtension(healthKitManager: hkManager)
        
        manager.healthKitExtension = hkExtension
        config.userContentController.add(hkExtension, name: "healthKit")

        // 🔥 Haptic feedback bridge (JS: window.webkit.messageHandlers.haptic.postMessage('light/medium/heavy'))
        config.userContentController.add(context.coordinator, name: "haptic")

        // 🎴 桌面小工具資料 bridge（對應前端 utils/widgetBridge.js）
        //    JS: window.webkit.messageHandlers.widgetData.postMessage({ json: '...' })
        //    寫入 App Group → WidgetCenter 刷新 DailyPromptWidget（小/中/大）。
        config.userContentController.add(context.coordinator, name: "widgetData")

        // 📋 Clipboard bridge — JS: window.webkit.messageHandlers.clipboard.postMessage({ text: '...' })
        //    Native fallback for environments where execCommand('copy') / navigator.clipboard fail.
        //    Writes to UIPasteboard.general so user can paste anywhere on iOS.
        config.userContentController.add(context.coordinator, name: "clipboard")

        // 🔐 Auth bridge — 登出時清掉 Keychain 內的登入狀態，避免重裝後又被自動還原。
        //    JS: window.webkit.messageHandlers.authBridge.postMessage({ action: 'clear' })
        config.userContentController.add(context.coordinator, name: "authBridge")

        // ⚙️ Open Settings bridge — GPS / 定位權限被關時，帶使用者直接跳到本 App 設定頁。
        //    JS: window.webkit.messageHandlers.openSettings.postMessage('')
        config.userContentController.add(context.coordinator, name: "openSettings")

        // 📍 Location bridge — JS sends { command: 'START' | 'STOP' | 'GET_ONCE' }.
        //    LocationManager events are forwarded by WebViewDelegate → sendToJS
        //    (which fires window.nativeBridge.onNativeEvent in JS).
        config.userContentController.add(context.coordinator, name: "location")
        // 🔋 定位權限改為「第一次開始跑步時」才請求（LocationManager.startTracking 處理），
        //    App 啟動不再彈定位權限、不開 GPS。
        // 暖機保留：已授權的老用戶啟動時做一次 one-shot 定位（單次、省電），
        //    進跑步頁更快拿到第一個 fix；未授權者此呼叫為 no-op。
        manager.location.warmUp()
        // 📊「動作與健身」權限不在啟動時要（審核規範：不可在沒有情境下一開 App 就跳權限）。
        //    改由第一次開始跑步／跑步機時 CMPedometer.startUpdates 自然觸發系統詢問。

        // ⌚ Watch workout bridge — JS sends { command: 'START' | 'PAUSE' | 'RESUME' | 'STOP' }
        //    forwards to WatchConnectivityManager → Watch app starts HKWorkoutSession
        //    which begins streaming HR via existing LIVE_METRICS payloads.
        config.userContentController.add(context.coordinator, name: "watchWorkout")

        // 🏝️ Live Activity bridge — 跑步時鎖屏卡片 + 靈動島。
        //    JS: window.webkit.messageHandlers.liveActivity.postMessage({
        //        command:'START'|'UPDATE'|'STOP', distanceKm, paceLabel, elapsedSec, calories, isPaused })
        config.userContentController.add(context.coordinator, name: "liveActivity")

        // 🔥 Save-to-Photos bridge (JS: window.webkit.messageHandlers.saveImage.postMessage(dataURL))
        config.userContentController.add(context.coordinator, name: "saveImage")

        // 📤 Share bridge — 系統分享面板（WKWebView 沒有 Web Share API，
        //    分享卡一律走這裡；utils/shareCard.js 為唯一 JS 入口）
        // JS: window.webkit.messageHandlers.shareImage.postMessage({ dataURL, filename, text })
        config.userContentController.add(context.coordinator, name: "shareImage")

        // 📄 File bridge — PDF 報告存檔（月報、進化日誌）。WKWebView 的 <a download>／blob 都存不下來，
        //    改由原生寫成暫存檔再開系統分享面板（可「儲存到檔案」、AirDrop、傳 LINE）。
        // JS: window.webkit.messageHandlers.saveFile.postMessage({ name: 'x.pdf', data: 'data:application/pdf;base64,...' })
        config.userContentController.add(context.coordinator, name: "saveFile")

        // 📍 Places bridge — 附近的健身房（重訓記憶）／公園、操場（跑步記憶）。Apple 地圖搜尋，免金鑰。
        // JS: window.webkit.messageHandlers.places.postMessage({ lat, lng, kind: 'gym'|'run', radius, requestId })
        //     → sendToJS(type: 'placesResult', { requestId, places:[{ name, lat, lng, distance, category, area }] })
        config.userContentController.add(context.coordinator, name: "places")

        // 🔥 OAuth bridge — LINE / Google / Facebook
        // JS: window.webkit.messageHandlers.openOAuth.postMessage('http://172.20.10.4:8000/api/auth/line?native=1')
        // Swift opens ASWebAuthenticationSession (LINE/Google-trusted browser, not WKWebView)
        config.userContentController.add(context.coordinator, name: "openOAuth")

        // 🔔 訓練提醒 bridge（對應前端 utils/workoutReminders.js）
        // JS: window.webkit.messageHandlers.requestNotificationPermission.postMessage('request')
        // JS: window.webkit.messageHandlers.scheduleDailyReminder.postMessage({ time:'19:00', enabled:true })
        // JS: window.webkit.messageHandlers.showLocalNotification.postMessage({ title, body, route })
        config.userContentController.add(context.coordinator, name: "requestNotificationPermission")
        config.userContentController.add(context.coordinator, name: "scheduleDailyReminder")
        config.userContentController.add(context.coordinator, name: "showLocalNotification")
        config.userContentController.add(context.coordinator, name: "scheduleOneShotNotification")

        // 🏋️ Pose Analyzer bridge — 混合邊緣運算（Swift 原生骨架偵測）
        // JS: window.webkit.messageHandlers.poseAnalyzer.postMessage({ action, exerciseKey, requestId })
        // PoseAnalyzer 自身即 WKScriptMessageHandler（與 HealthKitExtension 同模式），
        // 不經 coordinator 分流，回傳走 HealthAppBridge.sendToJS。
        let poseAnalyzer = PoseAnalyzer(bridge: manager)
        manager.poseAnalyzer = poseAnalyzer
        config.userContentController.add(poseAnalyzer, name: "poseAnalyzer")

        // 🗺️ 路線地圖快照（Apple Maps，免金鑰）—— 像 Strava 一樣先給一張高解析靜態圖
        // JS: window.webkit.messageHandlers.routeSnapshot.postMessage({ requestId, coords, markers, width, height, dark, color })
        // 回傳：nativeBridge.onNativeEvent({ type:'routeSnapshot', requestId, image, markers })
        config.userContentController.add(RouteMapSnapshotter(bridge: manager), name: "routeSnapshot")

        // 💳 App 內購（StoreKit 2）— 會員訂閱
        // JS: window.webkit.messageHandlers.purchase.postMessage({ action: 'products' | 'buy' | 'restore' | 'sync', productId })
        // 回傳：window 事件 'drvn:iap'（見 StoreManager.swift）。StoreManager 在 App 啟動時建立，才能接住 Transaction.updates。
        let storeManager = manager.storeManager ?? StoreManager()
        manager.storeManager = storeManager
        config.userContentController.add(storeManager, name: "purchase")

        // 🔗 自訂 scheme handler — 用 drvn://app/ 載入打包網頁，修正絕對路徑資源破圖。
        //    必須在建立 WKWebView 前掛到 config 上。Release（離線打包）才需要；
        //    Debug 走 Vite dev server，不影響。
        if let distURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebContent/dist")?
            .deletingLastPathComponent() {
            config.setURLSchemeHandler(LocalAssetSchemeHandler(rootDirectory: distURL),
                                       forURLScheme: AppConfig.appScheme)
        }

        let webView = WKWebView(frame: .zero, configuration: config)
        hkExtension.webView = webView
        storeManager.webView = webView

        // 3. UI Config
        // Make the WebView opaque to prevent default white background leaking through safe areas.
        webView.isOpaque = true
        let themeColor = UIColor(red: 0.12, green: 0.16, blue: 0.23, alpha: 1.0) // #1e293b
        webView.backgroundColor = themeColor
        webView.scrollView.backgroundColor = themeColor
        
        webView.isUserInteractionEnabled = true
        webView.scrollView.isScrollEnabled = true
        webView.scrollView.bounces = false // Disable rubber-banding
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // 🔒 Safari 網頁檢閱器只在開發版開啟；上架版關閉，避免他人接線讀取 localStorage 的登入 token。
        #if DEBUG
        webView.isInspectable = true
        #endif

        manager.webView = webView
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator

        // 📊 監聽真實載入進度 — 把 WKWebView.estimatedProgress (0~1) 即時餵給載入畫面的進度條
        context.coordinator.observeProgress(of: webView)
        
        // DEBUG：載區網開發機；Release：devWebURL 為 nil → 載 App 內建打包網頁。
        if let dev = activeDevURLString(), let url = URL(string: dev) {
            print("📱 [WebView] Target URL (dev): \(dev)")
            webView.load(URLRequest(url: url))
        } else {
            print("📦 [WebView] Loading bundled WebContent/dist (release).")
            loadLocalContent(in: webView)
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            if manager.isLoading {
                manager.loadingError = "載入時間過長，請確認網路連線後點「重新整理」。"
                manager.isLoading = false
            }
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> WebViewDelegate {
        WebViewDelegate(bridge: bridgeManager)
    }
    
    // MARK: - Local Loading
    private func loadLocalContent(in webView: WKWebView) {
        // 🔗 改用自訂 scheme（drvn://app/index.html）載入打包網頁。
        //    file:// 下絕對路徑（/desktop、/assets）會解析到檔案系統根 → 破圖；
        //    自訂 scheme handler 會把路徑對映到 dist 根目錄，全 App 破圖一次修好。
        guard Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebContent/dist") != nil,
              let appURL = URL(string: "\(AppConfig.webOrigin)/index.html") else {
            return
        }
        webView.load(URLRequest(url: appURL))
    }
    
    /// DEBUG → 區網開發機網址；Release → nil（改載 App 內建打包網頁）。
    /// 來源統一由 AppConfig 決定，這裡不再寫死任何 IP。
    private func activeDevURLString() -> String? {
        return AppConfig.devWebURL
    }
}

// MARK: - Local Asset Scheme Handler
// ----------------------------------------------------------------------------
// 用自訂 scheme（drvn://app/）服務 App 內建打包網頁（WebContent/dist）。
// 解決：file:// 載入時，網頁裡的絕對路徑（/desktop/x.png、/assets/x.jpg）會被
//      解析到「檔案系統根目錄」而非 dist 根目錄 → 全 App 破圖。
// 改用自訂 scheme 後，drvn://app/desktop/x.png 會正確對映到 dist/desktop/x.png。
// SPA 用 hash routing，文件 URL 固定停在 drvn://app/index.html，相對路徑亦穩定。
@available(iOS 17.0, *)
final class LocalAssetSchemeHandler: NSObject, WKURLSchemeHandler {
    /// dist 根目錄（…/WebContent/dist）
    private let rootDirectory: URL

    init(rootDirectory: URL) {
        self.rootDirectory = rootDirectory
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        // 取出 path（已百分比解碼），去掉開頭 '/'。空路徑或目錄 → index.html。
        var relativePath = url.path
        if relativePath.hasPrefix("/") { relativePath.removeFirst() }
        if relativePath.isEmpty || relativePath.hasSuffix("/") {
            relativePath += "index.html"
        }

        // 防目錄跳脫（../）：標準化後必須仍在 rootDirectory 之內。
        let fileURL = rootDirectory.appendingPathComponent(relativePath).standardizedFileURL
        let rootStd = rootDirectory.standardizedFileURL
        //    比對時補上結尾 "/"，避免 dist2/… 這類同字首的兄弟目錄混過檢查。
        guard fileURL.path.hasPrefix(rootStd.path + "/") else {
            urlSchemeTask.didFailWithError(URLError(.noPermissionsToReadFile))
            return
        }

        // 🧭 SPA 後備：沒有副檔名的路徑（例如 window.location.assign('/mobile-home')）
        //    不是靜態檔 → 回 index.html，讓 HashRouter 接手，不要整頁 404 變白屏。
        var servedURL = fileURL
        var fileData = try? Data(contentsOf: fileURL)
        if fileData == nil, fileURL.pathExtension.isEmpty {
            servedURL = rootStd.appendingPathComponent("index.html")
            fileData = try? Data(contentsOf: servedURL)
        }

        guard let data = fileData else {
            // 找不到檔案 → 回 404（避免 SPA 抓不到資源時整頁卡死）。
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                                       headerFields: ["Access-Control-Allow-Origin": "*"])!
            urlSchemeTask.didReceive(resp)
            urlSchemeTask.didReceive(Data())
            urlSchemeTask.didFinish()
            return
        }

        let mime = Self.mimeType(for: servedURL.pathExtension)
        let headers: [String: String] = [
            "Content-Type": mime,
            "Content-Length": "\(data.count)",
            // 同 origin 服務，理論上不需 CORS；保險起見對資源放行所有來源。
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
        ]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: headers)!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // 同步讀檔，無需取消處理。
    }

    /// 依副檔名回傳 MIME type。
    static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm":      return "text/html; charset=utf-8"
        case "js", "mjs":        return "text/javascript; charset=utf-8"
        case "css":              return "text/css; charset=utf-8"
        case "json", "map":      return "application/json; charset=utf-8"
        case "svg":              return "image/svg+xml"
        case "png":              return "image/png"
        case "jpg", "jpeg":      return "image/jpeg"
        case "webp":             return "image/webp"
        case "gif":              return "image/gif"
        case "ico":              return "image/x-icon"
        case "woff2":            return "font/woff2"
        case "woff":             return "font/woff"
        case "ttf":              return "font/ttf"
        case "otf":              return "font/otf"
        case "eot":              return "application/vnd.ms-fontobject"
        case "mp4":              return "video/mp4"
        case "mov":              return "video/quicktime"
        case "webm":             return "video/webm"
        case "mp3":              return "audio/mpeg"
        case "wav":              return "audio/wav"
        case "txt":              return "text/plain; charset=utf-8"
        case "wasm":             return "application/wasm"
        default:                 return "application/octet-stream"
        }
    }
}

// MARK: - WKWebView Delegate
@available(iOS 17.0, *)
class WebViewDelegate: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate,
                       ASWebAuthenticationPresentationContextProviding {
    let bridge: HealthAppBridge
    // Keep a strong reference so ASWebAuthenticationSession isn't deallocated mid-flow
    var authSession: ASWebAuthenticationSession?
    // 📊 KVO observation for WKWebView.estimatedProgress (真實載入進度)
    private var progressObservation: NSKeyValueObservation?

    init(bridge: HealthAppBridge) {
        self.bridge = bridge
        super.init()
        if !bridge.isPreview {
            print("🔄 [WebView] Started loading bridge listeners...")
            bridge.location.onEvent = { [weak self] type, data in self?.bridge.sendToJS(type: type, data: data) }
        }
        // 🔔 通知被點擊 → AppDelegate 會 post 一個 "drvn.notif.route" 通知夾帶 route，
        //    這裡收下後把 WebView（HashRouter）導到該頁。
        NotificationCenter.default.addObserver(
            forName: Notification.Name("drvn.notif.route"),
            object: nil, queue: .main
        ) { [weak self] note in
            guard let route = note.userInfo?["route"] as? String else { return }
            let safe = route.replacingOccurrences(of: "'", with: "")
            // 📊 市場觀察：先廣播 push-open 事件（前端遙測 push_open），再導頁
            self?.bridge.webView?.evaluateJavaScript(
                "try{window.dispatchEvent(new CustomEvent('drvn:push-open',{detail:{route:'\(safe)'}}));}catch(e){};if(window.location.hash!=='#\(safe)'){window.location.hash='#\(safe)';}",
                completionHandler: nil
            )
        }
    }

    deinit {
        progressObservation?.invalidate()
    }

    // MARK: - 真實載入進度監聽
    /// 用 KVO 觀察 WKWebView.estimatedProgress，並把 0~1 的進度即時同步到 bridge.loadProgress。
    /// 載入畫面的進度條綁定 bridge.loadProgress，因此進度條會反映實際的網頁載入時間。
    func observeProgress(of webView: WKWebView) {
        progressObservation?.invalidate()
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak bridge] wv, _ in
            let p = wv.estimatedProgress
            DispatchQueue.main.async {
                // 進度只往前不倒退，避免新導航把進度條拉回去造成視覺跳動
                if p > (bridge?.loadProgress ?? 0) {
                    bridge?.loadProgress = p
                }
            }
        }
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Return the key window so ASWebAuthenticationSession knows where to present the browser
        // 🟢 iOS 26: `UIWindow()` 已 deprecate → 強制走 windowScene API
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let windowScene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first {
            return windowScene.windows.first(where: { $0.isKeyWindow })
                ?? UIWindow(windowScene: windowScene)
        }
        // 兜底：用 WebView 自己的 window（一定存在，因為這個 callback 是 WebView 觸發的）
        if let w = bridge.webView?.window { return w }
        // 真的什麼 scene 都沒有，理論上不可能發生（iOS 13+ 一定有 windowScene）
        // 直接 fatalError 比回傳一個瑕疵 window 更安全
        fatalError("[OAuth] presentationAnchor: no UIWindowScene available")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {

        // ─────────────────────────────────────────────────────────────────
        // MARK: 🎴 桌面小工具資料（對應前端 utils/widgetBridge.js）
        //   前端把「今日進度/段位邀請函/飲食 streak」快照以 JSON 傳入，
        //   寫進 App Group（與 RunWidget extension 共享）後刷新小工具。
        // ─────────────────────────────────────────────────────────────────
        if message.name == "widgetData" {
            guard let body = message.body as? [String: Any],
                  let json = body["json"] as? String else { return }
            if let ud = UserDefaults(suiteName: "group.com.mikeychen.DRVN.dev") {
                ud.set(json, forKey: "dailyPromptWidget")
            }
            WidgetCenter.shared.reloadTimelines(ofKind: "DRVNDailyPrompt")
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: 🔔 訓練提醒（對應前端 utils/workoutReminders.js）
        // ─────────────────────────────────────────────────────────────────
        if message.name == "requestNotificationPermission" {
            bridge.notification.requestAuthorization { [weak self] granted, _ in
                // 把結果回傳給 JS（Notification.permission 無法被原生改寫，改發自訂事件）
                let perm = granted ? "granted" : "denied"
                self?.bridge.webView?.evaluateJavaScript(
                    "window.dispatchEvent(new CustomEvent('drvn:native-notif-permission',{detail:{permission:'\(perm)'}}));",
                    completionHandler: nil
                )
            }
            return
        }

        if message.name == "scheduleDailyReminder" {
            guard let body = message.body as? [String: Any] else { return }
            let enabled = (body["enabled"] as? Bool) ?? true
            if !enabled { bridge.notification.cancelDaily(); return }
            let time = (body["time"] as? String) ?? "19:00"
            let parts = time.split(separator: ":").map { Int($0) ?? 0 }
            // 時間格式異常（如 "25:99"）時夾回合法範圍，避免排出永遠不會響的提醒
            let hour = min(23, max(0, parts.count > 0 ? parts[0] : 19))
            let minute = min(59, max(0, parts.count > 1 ? parts[1] : 0))
            bridge.notification.scheduleDaily(
                hour: hour, minute: minute,
                title: "今天還沒訓練 💪",
                body: "你的課表在等你 — 花 30 分鐘完成今天這一步。",
                route: (body["route"] as? String) ?? "/mobile-home"
            )
            return
        }

        if message.name == "showLocalNotification" {
            guard let body = message.body as? [String: Any] else { return }
            let title = (body["title"] as? String) ?? "DRVN"
            let text  = (body["body"] as? String) ?? ""
            bridge.notification.showNow(title: title, body: text, route: body["route"] as? String)
            return
        }

        // 🆕 一次性延遲推播（前端 scheduleOneShot 用：恢復提醒等，app 關閉也送得到）
        // JS: window.webkit.messageHandlers.scheduleOneShotNotification.postMessage({ title, body, delaySeconds, route })
        if message.name == "scheduleOneShotNotification" {
            guard let body = message.body as? [String: Any] else { return }
            let title = (body["title"] as? String) ?? "DRVN"
            let text  = (body["body"] as? String) ?? ""
            let delay = (body["delaySeconds"] as? Double)
                ?? Double(body["delaySeconds"] as? Int ?? 0)
            bridge.notification.schedule(title: title, body: text, delaySeconds: max(60, delay),
                                         route: body["route"] as? String) { _ in }
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: OAuth via ASWebAuthenticationSession
        // JS:  window.webkit.messageHandlers.openOAuth.postMessage(urlString)
        // LINE / Google / Facebook block WKWebView. ASWebAuthenticationSession
        // opens a separate trusted browser session that these providers accept.
        // The backend redirects to fitnessapp://auth-callback?token=...&user_id=...
        // iOS intercepts this custom scheme and calls our completion handler.
        // ─────────────────────────────────────────────────────────────────
        if message.name == "openOAuth" {
            // 🛡️ 只接受 https（DEBUG 連區網後端允許 http）；ASWebAuthenticationSession
            //    收到其他 scheme 會直接失敗或丟例外。
            guard let urlString = message.body as? String,
                  let url = URL(string: urlString),
                  let scheme = url.scheme?.lowercased() else { return }
            #if DEBUG
            guard scheme == "https" || scheme == "http" else { return }
            #else
            guard scheme == "https" else { return }
            #endif

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }

                let session = ASWebAuthenticationSession(
                    url: url,
                    callbackURLScheme: "fitnessapp"
                ) { [weak self] callbackURL, error in
                    guard let self = self else { return }

                    if let error = error {
                        // User cancelled or provider error
                        let asError = error as? ASWebAuthenticationSessionError
                        if asError?.code != .canceledLogin {
                            print("❌ [OAuth] ASWebAuthenticationSession error: \(error.localizedDescription)")
                        }
                        return
                    }

                    guard let callbackURL = callbackURL else { return }
                    print("✅ [OAuth] Callback received: \(callbackURL.absoluteString.prefix(80))")

                    // Parse token & user_id from fitnessapp://auth-callback?token=...&user_id=...
                    guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else { return }
                    let token  = components.queryItems?.first(where: { $0.name == "token"   })?.value ?? ""
                    let userId = components.queryItems?.first(where: { $0.name == "user_id" })?.value
                              ?? components.queryItems?.first(where: { $0.name == "userId"  })?.value
                              ?? ""

                    guard !token.isEmpty else {
                        print("❌ [OAuth] No token in callback URL")
                        return
                    }

                    // Inject token + userId into WKWebView localStorage, then navigate to home
                    let escaped = token.replacingOccurrences(of: "'", with: "\\'")
                    let escapedUid = userId.replacingOccurrences(of: "'", with: "\\'")
                    let js = """
                    (function() {
                        localStorage.setItem('auth_token', '\(escaped)');
                        if ('\(escapedUid)') localStorage.setItem('userId', '\(escapedUid)');
                        try {
                            var parts = '\(escaped)'.split('.');
                            if (parts.length >= 2) {
                                var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                                var payload = JSON.parse(decodeURIComponent(atob(b64).split('').map(function(c){ return '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2); }).join('')));
                                if (payload.avatar) localStorage.setItem('oauth_avatar', payload.avatar);
                                if (payload.name)   localStorage.setItem('oauth_name', payload.name);
                                if (payload.email)  localStorage.setItem('oauth_email', payload.email);
                                localStorage.setItem('oauth_logged_in', 'true');
                                console.log('✅ [OAuth] Logged in as', payload.name || '\(escapedUid)');
                            }
                        } catch(e) { console.error('JWT decode error', e); }
                        // ⚠️ 不可只改 hash：HashRouter 改 hash 不會重載頁面，
                        //    App.jsx 的 userId state 仍停在訪客 → 帳號頁會一直顯示訪客。
                        //    改成整頁導向 AuthCallbackPage（token 放 ? query、pathname 維持 /），
                        //    強制 React 完整重新初始化，並走訪客資料併入流程。
                        window.location.replace(
                            window.location.origin + '/?token=' + encodeURIComponent('\(escaped)') +
                            '&user_id=' + encodeURIComponent('\(escapedUid)') + '#/auth-callback'
                        );
                    })();
                    """
                    DispatchQueue.main.async {
                        // 🔐 登入成功 → 寫進 Keychain，重裝/rebuild 後仍保持登入
                        KeychainStore.saveLogin(token: token, userId: userId)
                        self.bridge.webView?.evaluateJavaScript(js)
                        // 🟢 同步 userId 到 Watch
                        if !userId.isEmpty {
                            WatchConnectivityManager.shared.syncUserId(userId)
                        }
                        print("✅ [OAuth] Token injected, userId=\(userId), navigating to /auth-callback")
                    }
                }

                // Required: provide the window for the auth session UI
                session.presentationContextProvider = self
                // prefersEphemeralWebBrowserSession = false → reuse existing LINE login session
                session.prefersEphemeralWebBrowserSession = false
                self.authSession = session
                session.start()
            }
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: Haptic Feedback
        // JS:  window.webkit.messageHandlers.haptic.postMessage('light' | 'medium' | 'heavy')
        // ─────────────────────────────────────────────────────────────────
        if message.name == "haptic" {
            let style = message.body as? String ?? "medium"
            DispatchQueue.main.async {
                let feedbackStyle: UIImpactFeedbackGenerator.FeedbackStyle
                switch style {
                case "light":  feedbackStyle = .light
                case "heavy":  feedbackStyle = .heavy
                case "rigid":  feedbackStyle = .rigid
                case "soft":   feedbackStyle = .soft
                default:       feedbackStyle = .medium
                }
                let generator = UIImpactFeedbackGenerator(style: feedbackStyle)
                generator.prepare()          // pre-warm so first hit is immediate
                generator.impactOccurred()
            }
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: 📋 Clipboard bridge
        // JS:  window.webkit.messageHandlers.clipboard.postMessage({ text: '...' })
        // Native fallback when execCommand('copy') / navigator.clipboard fail
        // ─────────────────────────────────────────────────────────────────
        if message.name == "clipboard" {
            let body = message.body as? [String: Any] ?? [:]
            let text = (body["text"] as? String) ?? (message.body as? String ?? "")
            if !text.isEmpty {
                DispatchQueue.main.async {
                    UIPasteboard.general.string = text
                }
            }
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: 🔐 Auth bridge — 登出時清掉 Keychain
        // JS: window.webkit.messageHandlers.authBridge.postMessage({ action: 'clear' })
        // ─────────────────────────────────────────────────────────────────
        if message.name == "authBridge" {
            let body = message.body as? [String: Any] ?? [:]
            if (body["action"] as? String) == "clear" {
                KeychainStore.clearLogin()
                print("🔐 [WebView] Keychain login cleared (logout).")
            }
            return
        }

        // ⚙️ Open the app's Settings page (定位 / 健康權限引導)
        if message.name == "openSettings" {
            DispatchQueue.main.async {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: 📍 Location bridge
        // JS: window.webkit.messageHandlers.location.postMessage({ command: 'START' | 'STOP' | 'GET_ONCE' })
        // LocationManager → onEvent → sendToJS (window.nativeBridge.onNativeEvent)
        // ─────────────────────────────────────────────────────────────────
        // ─────────────────────────────────────────────────────────────────
        // MARK: 🏝️ Live Activity bridge（鎖屏卡片 + 靈動島）
        // ─────────────────────────────────────────────────────────────────
        if message.name == "liveActivity" {
            let body = message.body as? [String: Any] ?? [:]
            let command = (body["command"] as? String) ?? ""
            LiveActivityManager.shared.handle(command: command, payload: body)
            return
        }

        if message.name == "location" {
            let body = message.body as? [String: Any] ?? [:]
            let command = (body["command"] as? String) ?? "GET_ONCE"
            switch command.uppercased() {
            case "START":
                bridge.location.startTracking()
            case "STOP":
                bridge.location.stopTracking()
            case "GET_ONCE":
                // 🔋 單次定位（requestLocation），不再誤開連續追蹤
                bridge.location.getOnce()
            default:
                break
            }
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: ⌚ Watch workout bridge
        // JS: window.webkit.messageHandlers.watchWorkout.postMessage({ command:'START'|'PAUSE'|'RESUME'|'STOP' })
        // Tells the paired Apple Watch to begin / pause / end its HKWorkoutSession.
        // Once running, the Watch streams HR via WCSession LIVE_METRICS payloads
        // → WatchConnectivityManager → WebView 'watch-live-metrics' CustomEvent.
        // ─────────────────────────────────────────────────────────────────
        if message.name == "watchWorkout" {
            let body = message.body as? [String: Any] ?? [:]
            let command = (body["command"] as? String) ?? ""
            // 🟢 mode 區分重訓/有氧：gym → 手機驅動自動量心率；cardio → 走原本 GPS 流程
            let mode = (body["mode"] as? String) ?? "gym"
            let wcm = WatchConnectivityManager.shared
            switch command.uppercased() {
            case "START":  wcm.startWatchWorkout(mode: mode)
            case "PAUSE":  wcm.pauseWatchWorkout(mode: mode)
            case "RESUME": wcm.resumeWatchWorkout(mode: mode)
            // ⌚ PREWARM — 一進跑步頁就先把手錶的 workout session 起起來，
            //    讓心率感測器提前穩定。使用者回報「開跑後要等一分鐘才有心率」，
            //    原因就是按下開始才建立 session。預熱等同提前 START。
            case "PREWARM": wcm.startWatchWorkout(mode: mode, prewarm: true)
            // 🩺 RECOVERY — 跑步結束但「還不要」收掉手錶。
            //    HRR（心率恢復力）需要停止後 60 秒的真實心率串流，
            //    手錶一 STOP 就再也量不到（結算頁 HRR 永遠 0 bpm / LOW）。
            //    刻意 no-op：session 原封不動繼續串流心率，
            //    等 60 秒量測窗結束、JS 送 STOP 才真正結束並存檔。
            //    （這 60 秒屬於緩和期，計入 workout 也是正確的。）
            case "RECOVERY": break
            case "STOP":   wcm.stopWatchWorkout(mode: mode)
            // 🔄 React 右上角手錶鈕點擊 → 主動重查連線狀態並回報（也順便重送 userId）
            case "REFRESH_STATUS", "SYNC":
                wcm.refreshConnectionStatus()
                if let uid = body["userId"] as? String, !uid.isEmpty {
                    wcm.syncUserId(uid)
                }
            default: break
            }
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: Save Image to Photo Library
        // JS:  window.webkit.messageHandlers.saveImage.postMessage(dataURL)
        //      dataURL is a base64 PNG string, e.g. "data:image/png;base64,iVBOR..."
        // ─────────────────────────────────────────────────────────────────
        // 📍 places — 附近的健身房／跑步地點（Apple 地圖 POI 搜尋）
        if message.name == "places" {
            let body = message.body as? [String: Any] ?? [:]
            let requestId = (body["requestId"] as? String) ?? ""
            guard let lat = body["lat"] as? Double, let lng = body["lng"] as? Double else {
                bridge.sendToJS(type: "placesResult", data: ["requestId": requestId, "places": [], "error": "no_coords"])
                return
            }
            let kind = (body["kind"] as? String) ?? "gym"
            let radius = min(max((body["radius"] as? Double) ?? 400, 50), 3000)
            let center = CLLocationCoordinate2D(latitude: lat, longitude: lng)
            let request = MKLocalPointsOfInterestRequest(center: center, radius: radius)
            let categories: [MKPointOfInterestCategory] = kind == "run"
                ? [.park, .stadium, .school, .beach]
                : [.fitnessCenter]
            request.pointOfInterestFilter = MKPointOfInterestFilter(including: categories)
            let here = CLLocation(latitude: lat, longitude: lng)
            MKLocalSearch(request: request).start { [weak self] response, error in
                var places: [[String: Any]] = []
                for item in response?.mapItems ?? [] {
                    let c = item.placemark.coordinate
                    let d = CLLocation(latitude: c.latitude, longitude: c.longitude).distance(from: here)
                    var p: [String: Any] = [
                        "name": item.name ?? "",
                        "lat": c.latitude,
                        "lng": c.longitude,
                        "distance": Int(d.rounded()),
                    ]
                    if let cat = item.pointOfInterestCategory { p["category"] = cat.rawValue }
                    if let area = item.placemark.subLocality ?? item.placemark.locality { p["area"] = area }
                    places.append(p)
                }
                places.sort { (($0["distance"] as? Int) ?? 0) < (($1["distance"] as? Int) ?? 0) }
                self?.bridge.sendToJS(type: "placesResult", data: [
                    "requestId": requestId,
                    "places": Array(places.prefix(8)),
                    "error": error?.localizedDescription ?? "",
                ])
            }
            return
        }

        // 📄 saveFile — 把 PDF 等檔案寫成暫存檔，開系統分享面板
        if message.name == "saveFile" {
            guard let body = message.body as? [String: Any],
                  let dataStr = body["data"] as? String,
                  let base64 = dataStr.components(separatedBy: ",").last,
                  let fileData = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
                  !fileData.isEmpty
            else {
                print("❌ [saveFile] Invalid message body")
                return
            }
            let rawName = (body["name"] as? String) ?? "DRVN.pdf"
            let cleaned = rawName.replacingOccurrences(of: "/", with: "_")
                                 .replacingOccurrences(of: ":", with: "_")
                                 .trimmingCharacters(in: .whitespacesAndNewlines)
            // 🛡️ "." / ".." 會指到 tmp 的上層（App 容器根目錄），下面的 removeItem 會把整個
            //    Documents / Library 刪光 → 一律換成預設檔名。
            let safeName = (cleaned.isEmpty || cleaned.hasPrefix(".")) ? "DRVN.pdf" : cleaned
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            do {
                try? FileManager.default.removeItem(at: url)
                try fileData.write(to: url, options: .atomic)
            } catch {
                print("❌ [saveFile] write failed: \(error.localizedDescription)")
                return
            }
            DispatchQueue.main.async {
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                guard let scene = UIApplication.shared.connectedScenes
                        .compactMap({ $0 as? UIWindowScene }).first,
                      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
                else { return }
                av.popoverPresentationController?.sourceView = root.view
                av.popoverPresentationController?.sourceRect = CGRect(
                    x: root.view.bounds.midX, y: root.view.bounds.midY, width: 0, height: 0)
                var top = root
                while let presented = top.presentedViewController { top = presented }
                top.present(av, animated: true)
            }
            return
        }

        // 📤 shareImage — 系統分享面板（圖片與/或純文字；至少要有一樣）
        if message.name == "shareImage" {
            guard let body = message.body as? [String: Any] else {
                print("❌ [shareImage] Invalid message body")
                return
            }
            var image: UIImage? = nil
            if let dataURL = body["dataURL"] as? String,
               let base64 = dataURL.components(separatedBy: ",").last,
               let imageData = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) {
                image = UIImage(data: imageData)
            }
            let text = (body["text"] as? String) ?? ""
            guard image != nil || !text.isEmpty else {
                print("❌ [shareImage] Nothing to share")
                return
            }
            DispatchQueue.main.async {
                var items: [Any] = []
                if let image { items.append(image) }
                if !text.isEmpty { items.append(text) }
                let av = UIActivityViewController(activityItems: items, applicationActivities: nil)
                guard let scene = UIApplication.shared.connectedScenes
                        .compactMap({ $0 as? UIWindowScene }).first,
                      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
                else { return }
                // iPad popover anchor（iPhone 自動忽略）
                av.popoverPresentationController?.sourceView = root.view
                av.popoverPresentationController?.sourceRect = CGRect(
                    x: root.view.bounds.midX, y: root.view.bounds.midY, width: 0, height: 0)
                var top = root
                while let presented = top.presentedViewController { top = presented }
                top.present(av, animated: true)
            }
            return
        }

        if message.name == "saveImage" {
            guard
                let dataURL  = message.body as? String,
                let base64   = dataURL.components(separatedBy: ",").last,
                let imageData = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
                let image    = UIImage(data: imageData)
            else {
                print("❌ [saveImage] Failed to decode base64 image")
                return
            }

            // Request add-only permission (non-destructive; won't prompt if already granted)
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
                guard status == .authorized || status == .limited else {
                    print("⚠️ [saveImage] Photo library permission denied (status: \(status.rawValue))")
                    DispatchQueue.main.async {
                        self?.bridge.sendToJS(type: "imageSaved", data: ["success": false, "error": "permission_denied"])
                    }
                    return
                }

                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAsset(from: image)
                }) { [weak self] success, error in
                    DispatchQueue.main.async {
                        if success {
                            print("✅ [saveImage] Saved to Photos successfully")
                            // Notify JS so the UI can show a success toast
                            self?.bridge.sendToJS(type: "imageSaved", data: ["success": true])
                        } else {
                            print("❌ [saveImage] PHPhotoLibrary error: \(error?.localizedDescription ?? "unknown")")
                            self?.bridge.sendToJS(type: "imageSaved", data: ["success": false, "error": error?.localizedDescription ?? "unknown"])
                        }
                    }
                }
            }
            return
        }

        // ─────────────────────────────────────────────────────────────────
        // MARK: Existing fitnessApp bridge (keep unchanged)
        // ─────────────────────────────────────────────────────────────────
        guard message.name == "fitnessApp",
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }

        switch type {
        case "requestHealthAuth":
            bridge.healthKit.requestAuthorization { [weak self] success, error in
                self?.bridge.sendToJS(type: "healthAuthResult", data: ["success": success, "error": error?.localizedDescription ?? ""])
            }
        case "getSteps":
            bridge.healthKit.getTodaySteps { [weak self] steps, error in
                self?.bridge.sendToJS(type: "stepsResult", data: ["steps": steps, "error": error ?? ""])
            }
        case "getActiveEnergy":
            // 🟢 React 端會用這個值整合到「淨卡路里」公式：
            //    netCalories = 攝取 − 訓練紀錄消耗 − HK 主動消耗
            bridge.healthKit.getTodayActiveEnergy { [weak self] kcal, error in
                self?.bridge.sendToJS(type: "activeEnergyResult",
                                      data: ["kcal": kcal, "error": error ?? ""])
            }
        case "hapticFeedback":
            // Legacy path (fitnessApp type) — kept for backward compat
            let style = body["style"] as? String ?? "medium"
            DispatchQueue.main.async {
                let feedbackStyle: UIImpactFeedbackGenerator.FeedbackStyle = (style == "heavy") ? .heavy : (style == "light") ? .light : .medium
                let generator = UIImpactFeedbackGenerator(style: feedbackStyle)
                generator.impactOccurred()
            }

        // ── React 主動推送計劃到 Watch ────────────────────────────
        case "sendGymPlanToWatch":
            if let gymPlan = body["gymPlan"] as? [[String: Any]] {
                print("[HealthAppBridge] ✅ Received pre-formatted gymPlan from React, sending to Watch...")
                // 🟢 React 也可順帶帶 userId 進來，沒有的話就嘗試從 body 撿
                var msg: [String: Any] = ["gymPlan": gymPlan]
                if let uid = body["userId"] as? String, !uid.isEmpty {
                    msg["userId"] = uid
                }
                // ⌚ 沒配對手錶 / iPad / session 尚未啟用 → 直接略過，不要對未啟用的 session 送資料
                guard WCSession.isSupported(),
                      WCSession.default.activationState == .activated,
                      WCSession.default.isPaired,
                      WCSession.default.isWatchAppInstalled else { break }
                if WCSession.default.isReachable {
                    WCSession.default.sendMessage(msg, replyHandler: nil, errorHandler: nil)
                }
                // 保底更新機制
                try? WCSession.default.updateApplicationContext(msg)
                WCSession.default.transferUserInfo(msg)
            } else {
                // Fallback to old behavior if no payload is provided
                bridge.sendGymPlanToWatch()
            }

        // ─────────────────────────────────────────────────────────────────
        // MARK: Save Image (fitnessApp fallback path)
        // JS: window.webkit.messageHandlers.fitnessApp.postMessage({ type: 'saveImage', data: dataURL })
        // Used when the dedicated 'saveImage' handler is not yet registered (old build).
        // ─────────────────────────────────────────────────────────────────
        case "saveImage":
            guard
                let dataURL   = body["data"] as? String,
                let base64    = dataURL.components(separatedBy: ",").last,
                let imageData = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
                let image     = UIImage(data: imageData)
            else {
                print("❌ [fitnessApp/saveImage] Failed to decode base64 image")
                break
            }
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
                guard status == .authorized || status == .limited else {
                    print("⚠️ [fitnessApp/saveImage] Permission denied (status: \(status.rawValue))")
                    DispatchQueue.main.async {
                        self?.bridge.sendToJS(type: "imageSaved", data: ["success": false, "error": "permission_denied"])
                    }
                    return
                }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAsset(from: image)
                }) { [weak self] success, error in
                    DispatchQueue.main.async {
                        if success {
                            print("✅ [fitnessApp/saveImage] Saved to Photos")
                            self?.bridge.sendToJS(type: "imageSaved", data: ["success": true])
                        } else {
                            print("❌ [fitnessApp/saveImage] Error: \(error?.localizedDescription ?? "unknown")")
                            self?.bridge.sendToJS(type: "imageSaved", data: ["success": false, "error": error?.localizedDescription ?? "unknown"])
                        }
                    }
                }
            }

        default: break
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let currentURL = webView.url?.absoluteString ?? "unknown"
        print("✅ [WebView] Navigation finished successfully. URL: \(currentURL)")
        DispatchQueue.main.async {
            self.bridge.loadingError = nil
            // 混合式：標記網頁載完，但要等描邊動畫也畫完一遍才會真正淡出。
            self.bridge.markWebContentReady()
        }

        // 🔐 Keychain 還原 / 鏡像（讓 rebuild / 重裝後仍保持登入）
        //    localStorage 有 token → 鏡像進 Keychain；localStorage 空但 Keychain 有 → 還原並導向 auth-callback。
        webView.evaluateJavaScript("JSON.stringify({t: localStorage.getItem('auth_token')||'', u: localStorage.getItem('userId')||'', s: localStorage.getItem('drvn_guest_secret')||''})") { result, _ in
            guard let json = result as? String,
                  let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return }
            let lsToken = obj["t"] ?? ""
            let lsUid   = obj["u"] ?? ""
            let lsSecret = obj["s"] ?? ""
            if !lsSecret.isEmpty { _ = KeychainStore.save(lsSecret, for: KeychainStore.guestSecretKey) }

            if !lsToken.isEmpty {
                // ① localStorage 已登入 → 鏡像進 Keychain（之後重裝可還原）
                KeychainStore.saveLogin(token: lsToken, userId: lsUid)
            } else if let kcToken = KeychainStore.load(KeychainStore.tokenKey), !kcToken.isEmpty {
                // ② localStorage 被清空(剛重裝)但 Keychain 還有 → 還原登入
                let kcUid = KeychainStore.load(KeychainStore.userIdKey) ?? ""
                let escT = kcToken.replacingOccurrences(of: "'", with: "\\'")
                let escU = kcUid.replacingOccurrences(of: "'", with: "\\'")
                let kcSecret = lsSecret.isEmpty ? (KeychainStore.load(KeychainStore.guestSecretKey) ?? "") : ""
                let escS = kcSecret.replacingOccurrences(of: "'", with: "\\'")
                let restoreJS = """
                (function(){
                    if('\(escS)') localStorage.setItem('drvn_guest_secret','\(escS)');
                    localStorage.setItem('auth_token','\(escT)');
                    if('\(escU)') localStorage.setItem('userId','\(escU)');
                    localStorage.setItem('oauth_logged_in','true');
                    window.location.replace(window.location.origin + '/?token=' + encodeURIComponent('\(escT)') + '&user_id=' + encodeURIComponent('\(escU)') + '#/auth-callback');
                })();
                """
                DispatchQueue.main.async {
                    webView.evaluateJavaScript(restoreJS)
                    if !kcUid.isEmpty { WatchConnectivityManager.shared.syncUserId(kcUid) }
                    print("🔐 [WebView] Restored login from Keychain (uid=\(kcUid)) — survived reinstall.")
                }
            }
        }

        // 🟢 立即同步 userId → Watch（不用等計劃，讓 Watch 儘快知道正確帳號）
        // 這樣即使 Watch 先啟動、iPhone 後開 App，userId 也能在幾秒內傳過去
        // (此 closure 內未使用 self，移除 [weak self] 以消除「unused self」warning)
        webView.evaluateJavaScript("JSON.stringify([localStorage.getItem('userId')||'', localStorage.getItem('auth_token')||''])") { result, _ in
            guard let str = result as? String, let data = str.data(using: .utf8),
                  let arr = try? JSONSerialization.jsonObject(with: data) as? [String],
                  let uid = arr.first, !uid.isEmpty else { return }
            let tok = arr.count > 1 && !arr[1].isEmpty ? arr[1] : nil
            WatchConnectivityManager.shared.syncUserId(uid, token: tok)
            print("[WebView] 🟢 Proactive userId sync → Watch: \(uid) apiBaseURL:\(AppConfig.apiBaseURL)")
        }

        // 📶 網頁載完 → 主動把目前手錶連線狀態推給 React（讓「已連接」提示一進場就正確顯示，
        //    不必等到狀態變化事件才有資料）。稍延遲確保 React 已掛好事件監聽。
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            WatchConnectivityManager.shared.refreshConnectionStatus()
        }

        // Proactively push gym plan to Watch after React hydrates (~2s delay)
        // This ensures the Watch gets the plan even if it requested before the page loaded.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            self?.bridge.sendGymPlanToWatch()
            print("[WebView] Auto-pushed gym plan to Watch after page load")
        }
    }

    // MARK: - OAuth Callback Interceptor
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           (url.path.contains("/auth-callback") || url.path.contains("/login")),
           let tokenItem = components.queryItems?.first(where: { $0.name == "token" }),
           let token = tokenItem.value {

            // Extract user_id if present
            let userId = components.queryItems?.first(where: { $0.name == "user_id" })?.value ?? ""

            print("🔐 [WebView] OAuth token intercepted! Injecting into localStorage.")

            // Cancel this navigation and inject the token instead
            decisionHandler(.cancel)

            // Inject token AND decoded user info into localStorage via JavaScript
            // The JS code decodes the JWT payload and saves avatar/name/email separately
            let escapedToken = token.replacingOccurrences(of: "'", with: "\\'")
            let escapedUserId = userId.replacingOccurrences(of: "'", with: "\\'")
            let js = """
            (function() {
                // 1. Save auth_token and userId
                localStorage.setItem('auth_token', '\(escapedToken)');
                localStorage.setItem('userId', '\(escapedUserId)');

                // 2. Decode the JWT payload and save user info separately
                try {
                    var parts = '\(escapedToken)'.split('.');
                    if (parts.length >= 2) {
                        var base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                        var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                        var payload = JSON.parse(jsonPayload);

                        // Save individual fields for resilience
                        if (payload.avatar) localStorage.setItem('oauth_avatar', payload.avatar);
                        if (payload.name) localStorage.setItem('oauth_name', payload.name);
                        if (payload.email) localStorage.setItem('oauth_email', payload.email);
                        if (payload.id) localStorage.setItem('oauth_provider_id', payload.id);
                        localStorage.setItem('oauth_logged_in', 'true');

                        console.log('✅ OAuth user data saved:', payload.name, payload.avatar ? 'has avatar' : 'no avatar');
                    }
                } catch(e) {
                    console.error('JWT decode failed:', e);
                }

                // 3. 整頁導向 AuthCallbackPage（不可只改 hash — 否則 React userId state
                //    停在訪客，帳號頁會一直顯示訪客登入）。token 放 ? query、pathname 維持 /，
                //    強制 React 完整重新初始化並走訪客資料併入流程。
                window.location.replace(
                    window.location.origin + '/?token=' + encodeURIComponent('\(escapedToken)') +
                    '&user_id=' + encodeURIComponent('\(escapedUserId)') + '#/auth-callback'
                );
            })();
            """

            // 🔐 登入成功 → 寫進 Keychain，重裝/rebuild 後仍保持登入
            KeychainStore.saveLogin(token: token, userId: userId)

            webView.evaluateJavaScript(js) { result, error in
                if let error = error {
                    print("❌ [WebView] Failed to inject token: \(error)")
                } else {
                    print("✅ [WebView] Token + user data injected into localStorage successfully.")
                    // 🟢 登入成功後立即把 userId 同步給 Watch
                    if !userId.isEmpty {
                        WatchConnectivityManager.shared.syncUserId(userId)
                        print("[WebView] 🟢 Post-login userId sync → Watch: \(userId)")
                    }
                }
            }
            return
        }

        // 🌐 外部連結一律交給 Safari／系統 App，不在 App 的 WebView 裡導頁。
        //    否則點隱私權政策、歌單、Apple 訂閱管理…整個 App 會被換成外部網站（沒有返回鍵），
        //    而且外部網頁也能呼叫所有原生 bridge（openOAuth、saveFile、purchase…）。
        //    iframe（targetFrame 非主框架）不攔，嵌入內容照常載入；
        //    開新視窗（targetFrame == nil）交給下面的 createWebViewWith，避免同一連結開兩次。
        if let url = navigationAction.request.url,
           navigationAction.targetFrame?.isMainFrame == true,
           Self.shouldOpenExternally(url) {
            decisionHandler(.cancel)
            DispatchQueue.main.async { UIApplication.shared.open(url) }
            return
        }

        decisionHandler(.allow)
    }

    /// 是否該離開 App 用系統開啟。App 內建網頁（drvn://）、頁內資源、自家後端（OAuth 網頁備援）
    /// 與 DEBUG 開發機留在 App 內；其餘 http(s) 與 tel:/mailto:/itms-apps: 等交給系統。
    static func shouldOpenExternally(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        switch scheme {
        case AppConfig.appScheme, "about", "data", "blob", "javascript":
            return false
        case "http", "https":
            let host = url.host?.lowercased() ?? ""
            if let apiHost = URL(string: AppConfig.apiBaseURL)?.host?.lowercased(), host == apiHost {
                return false
            }
            if let dev = AppConfig.devWebURL, let devHost = URL(string: dev)?.host?.lowercased(), host == devHost {
                return false
            }
            return true
        default:
            return true
        }
    }

    /// 導頁被取消（使用者點了下一個連結、我們自己 .cancel 外部連結、OAuth 攔截）不是錯誤，
    /// 不可因此重載整個 App 或跳錯誤頁。
    private static func isBenignCancel(_ error: Error) -> Bool {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return true }
        if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return true }   // Frame load interrupted
        return false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("❌ [WebView] Provisional navigation failed: \(error.localizedDescription)")
        if Self.isBenignCancel(error) { return }

        // 🔥 Fallback: If remote server is down, try local content
        //    同 loadLocalContent：改用自訂 scheme 載入，避免 file:// 絕對路徑破圖。
        if let webView = bridge.webView {
            if Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebContent/dist") != nil,
               let appURL = URL(string: "\(AppConfig.webOrigin)/index.html") {
                webView.load(URLRequest(url: appURL))
                return
            }
        }
        
        DispatchQueue.main.async {
            self.bridge.loadingError = error.localizedDescription
            self.bridge.isLoading = false
        }
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("❌ [WebView] Navigation failed: \(error.localizedDescription)")
        if Self.isBenignCancel(error) { return }
        DispatchQueue.main.async {
            self.bridge.loadingError = error.localizedDescription
            self.bridge.isLoading = false
        }
    }
    
    /// 🩹 WebContent 程序被系統回收（記憶體壓力、背景太久）→ 自動重載，
    ///    不要讓使用者回到 App 時卡在英文錯誤頁、只剩「重新整理」按鈕。
    ///    （登入 token / 進行中資料存在 localStorage，重載後由網頁自行恢復。）
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        print("⚠️ [WebView] WebContent process terminated → reloading")
        if webView.url != nil {
            bridge.reload()
        } else if let appURL = URL(string: "\(AppConfig.webOrigin)/index.html") {
            webView.load(URLRequest(url: appURL))
        }
    }

    // MARK: - WKUIDelegate (Native JS UI Support)

    /// 🌐 target="_blank" / window.open()：WKWebView 預設什麼都不做（例如「管理訂閱」連結點了沒反應）。
    ///    外部網址交給 Safari；App 內／blob: 等不開新視窗（不可把整個 App 頁面換掉）。
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, Self.shouldOpenExternally(url) {
            DispatchQueue.main.async { UIApplication.shared.open(url) }
        }
        return nil
    }

    /// 找最上層正在顯示的 view controller（分享面板、其他 alert 開著時也能疊上去）。
    /// 以前直接用 rootViewController.present → 上面已有 presented VC 時會靜默失敗，
    /// completionHandler 永遠不被呼叫 → WebKit 丟例外閃退。
    private func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
        let window = scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }

    /// Handle window.alert()
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let top = topViewController() else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default) { _ in
            completionHandler()
        })
        top.present(alert, animated: true, completion: nil)
    }

    /// Handle window.confirm()
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let top = topViewController() else { completionHandler(false); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)

        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in
            completionHandler(false)
        })

        alert.addAction(UIAlertAction(title: "確定", style: .default) { _ in
            completionHandler(true)
        })

        top.present(alert, animated: true, completion: nil)
    }

    /// 🎥 網頁 getUserMedia（InAppRecorder 錄訓練動作影片）的相機／麥克風權限。
    ///    沒實作時 WKWebView 每次都會再跳一次「"drvn://app" 想使用相機」的網頁層詢問。
    ///    自家來源（drvn://app 打包網頁、自家 API 網域、DEBUG 開發機）→ .grant，
    ///    交由 iOS 系統層權限（NSCameraUsageDescription）決定；其他來源 → .deny，
    ///    避免任何嵌入的第三方頁面拿到相機。
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(Self.isTrustedMediaOrigin(origin) ? .grant : .deny)
    }

    /// 是否為自家網頁來源（只看 scheme + host，不信任 frame 內任意網址）。
    private static func isTrustedMediaOrigin(_ origin: WKSecurityOrigin) -> Bool {
        let scheme = origin.protocol.lowercased()
        let host = origin.host.lowercased()
        if scheme == AppConfig.appScheme && host == AppConfig.appHost { return true }
        if scheme == "https",
           let apiHost = URL(string: AppConfig.apiBaseURL)?.host?.lowercased(), host == apiHost {
            return true
        }
        #if DEBUG
        // 開發版走區網 Vite dev server（http），只放行該開發機
        if let dev = AppConfig.devWebURL, let devHost = URL(string: dev)?.host?.lowercased(), host == devHost {
            return true
        }
        #endif
        return false
    }
}

// MARK: - HealthKit Extension
@available(iOS 17.0, *)
class HealthKitExtension: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private let healthKitManager: HealthKitManager
    private var updateTimer: Timer?
    
    init(healthKitManager: HealthKitManager) {
        self.healthKitManager = healthKitManager
        super.init()
    }
    
    private func sendMessage(type: String, data: [String: Any]) {
        let message: [String: Any] = ["type": type, "data": data, "timestamp": Date().timeIntervalSince1970 * 1000]
        guard let jsonString = drvnJSONString(message) else { return }
        let js = "window.dispatchEvent(new CustomEvent('healthKitMessage', { detail: \(jsonString) }));"
        DispatchQueue.main.async { self.webView?.evaluateJavaScript(js) }
    }
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "healthKit", let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "requestAuthorization":
            healthKitManager.requestAuthorization { [weak self] success, error in
                self?.sendMessage(type: "healthKitReady", data: ["authorized": success, "error": error?.localizedDescription ?? ""])
            }
        case "startWorkout":
            // 🆕 接收 React 端傳的 mode：'running' | 'gym' | 'treadmill'，預設 running
            let modeRaw = (body["mode"] as? String) ?? "running"
            let mode = HealthKitManager.WorkoutMode(rawValue: modeRaw) ?? .running
            healthKitManager.startWorkout(mode: mode)
            updateTimer?.invalidate()   // 重複 START 不可疊出多個 1Hz 計時器（每秒送好幾次 metrics）
            updateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in self?.sendRealtimeMetrics() }
            sendMessage(type: "workoutStarted", data: ["status": "running", "mode": modeRaw])
        case "pauseWorkout":
            healthKitManager.pauseWorkout()
            updateTimer?.invalidate()
            sendMessage(type: "workoutPaused", data: ["status": "paused"])
        case "resumeWorkout":
            healthKitManager.resumeWorkout()
            updateTimer?.invalidate()
            updateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in self?.sendRealtimeMetrics() }
            sendMessage(type: "workoutResumed", data: ["status": "running"])
        case "endWorkout":
            updateTimer?.invalidate()
            healthKitManager.endWorkout { [weak self] summary in self?.sendMessage(type: "workoutEnded", data: summary) }
        case "requestReadiness":
            // ⚠️ 前端 useHealthKit 一直在發這個 action，而且已經準備好接
            //    readinessUpdate —— 但這裡以前沒有這個 case，訊息直接掉進
            //    default: break。半條管線蓋了很久，睡眠與 HRV 從來沒到過前端。
            healthKitManager.fetchRecoverySignals { [weak self] signals in
                self?.sendMessage(type: "readinessUpdate", data: signals)
            }
        default: break
        }
    }
    
    private func sendRealtimeMetrics() {
        // 🆕 跑步機模式時，距離以 CMPedometer 推算為準（HK 室內常為 0）
        let distanceKm: Double = healthKitManager.isTreadmillMode
            ? max(healthKitManager.pedometerDistance, healthKitManager.currentDistance / 1000)
            : healthKitManager.currentDistance / 1000

        let metrics: [String: Any] = [
            "heartRate":         healthKitManager.currentHeartRate,
            "distance":          distanceKm,
            "pace":              healthKitManager.currentPace,
            "elevation":         healthKitManager.currentElevation,
            "calories":          healthKitManager.currentCalories,
            "duration":          healthKitManager.duration,
            "cadence":           healthKitManager.currentCadence,
            "stride":            healthKitManager.currentStride,
            "pedometerDistance": healthKitManager.pedometerDistance,
            "pedometerSteps":    healthKitManager.pedometerSteps,
            "hasHeartRateData":  healthKitManager.hasHeartRateData,
            "hasGPSData":        healthKitManager.hasGPSData,
            "hasElevationData":  healthKitManager.hasElevationData,
            "hasCadenceData":    healthKitManager.hasCadenceData,
            "hasStrideData":     healthKitManager.hasStrideData,
            "isTreadmillMode":   healthKitManager.isTreadmillMode,
            "currentPosition":   healthKitManager.routePoints.last.map { ["lat": $0.lat, "lng": $0.lng] } as Any
        ]
        sendMessage(type: "metricsUpdate", data: metrics)
    }
}



// MARK: - 🗺️ 路線地圖快照（Apple Maps，免金鑰）
/// 為什麼要有這個：網頁裡的 Leaflet 要一張一張下載海外的免費圖磚（Esri／OSM），
/// 在手機網路上又慢、極簡底圖原生又只到 z16（放大就糊）。
/// Strava 的作法是先給一張「已經畫好路線的靜態地圖」，要互動才載入可拖曳的地圖。
/// 這裡用 iOS 內建的 MKMapSnapshotter：Apple Maps、視網膜解析度、不用任何金鑰，
/// 通常 0.3–0.8 秒就回來。
final class RouteMapSnapshotter: NSObject, WKScriptMessageHandler {
    private weak var bridge: HealthAppBridge?
    private var running: [String: MKMapSnapshotter] = [:]

    init(bridge: HealthAppBridge) {
        self.bridge = bridge
        super.init()
    }

    private static func number(_ any: Any?) -> Double? {
        if let n = any as? NSNumber { return n.doubleValue }
        if let s = any as? String { return Double(s) }
        return nil
    }

    private static func coordinates(_ raw: Any?) -> [CLLocationCoordinate2D] {
        guard let arr = raw as? [Any] else { return [] }
        return arr.compactMap { item in
            guard let p = item as? [Any], p.count >= 2,
                  let la = number(p[0]), let lo = number(p[1]),
                  la.isFinite, lo.isFinite, abs(la) <= 90, abs(lo) <= 180,
                  !(la == 0 && lo == 0) else { return nil }
            return CLLocationCoordinate2D(latitude: la, longitude: lo)
        }
    }

    private static func color(_ hex: String) -> UIColor {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else {
            return UIColor(red: 0.976, green: 0.361, blue: 0.294, alpha: 1)   // DRVN coral #F95C4B
        }
        return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255,
                       green: CGFloat((v >> 8) & 0xFF) / 255,
                       blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }

    private func fail(_ requestId: String, _ message: String) {
        bridge?.sendToJS(type: "routeSnapshot", data: ["requestId": requestId, "error": message])
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "routeSnapshot", let body = message.body as? [String: Any] else { return }
        let requestId = (body["requestId"] as? String) ?? UUID().uuidString
        let coords = Self.coordinates(body["coords"])
        let markerCoords = Self.coordinates(body["markers"])
        let w = min(1200, max(60, Self.number(body["width"]) ?? 360))
        let h = min(1200, max(60, Self.number(body["height"]) ?? 240))
        let pad = min(120, max(0, Self.number(body["padding"]) ?? 28))
        let dark = (body["dark"] as? Bool) ?? false
        let lineColor = Self.color((body["color"] as? String) ?? "#F95C4B")

        guard coords.count >= 2 else { fail(requestId, "路線點太少"); return }

        // ── 視野：路線外框 + 留白，維持畫面比例；太短的路線至少看得到 300 公尺 ──
        var rect = MKMapRect.null
        for c in coords {
            let p = MKMapPoint(c)
            rect = rect.union(MKMapRect(x: p.x, y: p.y, width: 0, height: 0))
        }
        let aspect = w / h
        var rw = rect.size.width / max(0.2, 1 - 2 * pad / w)
        var rh = rect.size.height / max(0.2, 1 - 2 * pad / h)
        if rw / max(rh, 0.0001) > aspect { rh = rw / aspect } else { rw = rh * aspect }
        let minSpan = MKMapPointsPerMeterAtLatitude(coords[0].latitude) * 300
        if rw < minSpan { rw = minSpan; rh = rw / aspect }
        let mid = MKMapPoint(x: rect.midX, y: rect.midY)

        let size = CGSize(width: w, height: h)
        let options = MKMapSnapshotter.Options()
        options.mapRect = MKMapRect(x: mid.x - rw / 2, y: mid.y - rh / 2, width: rw, height: rh)
        options.size = size
        options.scale = UIScreen.main.scale
        // 極簡底圖：淡化的標準地圖、不要店家圖示 —— 主角是路線
        if #available(iOS 17.0, *) {
            let cfg = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
            cfg.pointOfInterestFilter = .excludingAll
            options.preferredConfiguration = cfg
        } else {
            options.mapType = .mutedStandard
            options.pointOfInterestFilter = .excludingAll
        }
        options.traitCollection = UITraitCollection(userInterfaceStyle: dark ? .dark : .light)

        let snapshotter = MKMapSnapshotter(options: options)
        running[requestId] = snapshotter
        snapshotter.start(with: .global(qos: .userInitiated)) { [weak self] snapshot, error in
            guard let self = self else { return }
            DispatchQueue.main.async { self.running[requestId] = nil }
            guard let snapshot = snapshot else {
                self.fail(requestId, error?.localizedDescription ?? "地圖快照失敗")
                return
            }
            let format = UIGraphicsImageRendererFormat()
            format.scale = snapshot.image.scale
            let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                snapshot.image.draw(at: .zero)
                let path = UIBezierPath()
                for (i, c) in coords.enumerated() {
                    let pt = snapshot.point(for: c)
                    if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
                }
                path.lineJoinStyle = .round
                path.lineCapStyle = .round
                // 白色描邊讓路線在任何底圖上都看得清楚，再疊主色
                UIColor.white.withAlphaComponent(0.92).setStroke()
                path.lineWidth = 7
                path.stroke()
                lineColor.setStroke()
                path.lineWidth = 4.2
                path.stroke()

                func dot(_ c: CLLocationCoordinate2D, fill: UIColor) {
                    let p = snapshot.point(for: c)
                    UIColor.white.setFill()
                    UIBezierPath(ovalIn: CGRect(x: p.x - 6, y: p.y - 6, width: 12, height: 12)).fill()
                    fill.setFill()
                    UIBezierPath(ovalIn: CGRect(x: p.x - 3.8, y: p.y - 3.8, width: 7.6, height: 7.6)).fill()
                }
                dot(coords.first!, fill: UIColor(red: 0.16, green: 0.62, blue: 0.40, alpha: 1))   // 起點
                dot(coords.last!, fill: lineColor)                                                 // 終點
            }
            // 網頁要在圖上疊獎牌膠囊 —— 回傳每個標記在圖上的座標（以 CSS 像素計）
            let markerPoints: [[Double]] = markerCoords.map {
                let p = snapshot.point(for: $0)
                return [Double(p.x), Double(p.y)]
            }
            guard let jpg = image.jpegData(compressionQuality: 0.85) else {
                self.fail(requestId, "地圖快照編碼失敗")
                return
            }
            self.bridge?.sendToJS(type: "routeSnapshot", data: [
                "requestId": requestId,
                "image": "data:image/jpeg;base64," + jpg.base64EncodedString(),
                "markers": markerPoints,
            ])
        }
    }
}
