import Foundation
import WatchConnectivity
import Combine
import HealthKit   // startWatchApp：從 iPhone 自動把手錶 App 拉起進 workout

/// iOS-side manager that bridges WatchConnectivity messages from Apple Watch.
class WatchConnectivityManager: NSObject, WCSessionDelegate, ObservableObject {
    static let shared = WatchConnectivityManager()

    // MARK: - Published live metrics (updated by Watch)
    @Published var lastHeartRate: Double = 0.0
    @Published var lastCalories: Double = 0.0
    @Published var lastDistance: Double = 0.0   // metres
    @Published var workoutState: String = "IDLE" // IDLE | RUNNING | PAUSED | ENDED

    // MARK: - Published connection status (so React can show「已連接」)
    @Published var isPaired: Bool = false             // iPhone 是否配對了 Apple Watch
    @Published var isWatchAppInstalled: Bool = false  // 手錶上是否安裝了本 App
    @Published var isReachable: Bool = false          // 手錶目前是否可即時通訊

    // MARK: - Init
    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    /// 蒐集目前連線狀態並廣播給 App（再由 WebView 轉發給 React）。
    /// connected 的定義：已配對 + 已安裝手錶 App（reachable 只代表「現在能即時通訊」，
    /// 手錶在背景時 reachable 會是 false 但仍算已連接）。
    private func broadcastConnectionStatus() {
        #if os(iOS)
        let session = WCSession.default
        let paired = session.isPaired
        let installed = session.isWatchAppInstalled
        let reachable = session.isReachable
        DispatchQueue.main.async {
            self.isPaired = paired
            self.isWatchAppInstalled = installed
            self.isReachable = reachable
            let connected = paired && installed
            NotificationCenter.default.post(
                name: .didChangeWatchConnection,
                object: nil,
                userInfo: [
                    "connected":           connected,
                    "isPaired":            paired,
                    "isWatchAppInstalled": installed,
                    "isReachable":         reachable
                ]
            )
            print("[WatchConnectivity] 📶 status — paired:\(paired) installed:\(installed) reachable:\(reachable) → connected:\(connected)")
        }
        #endif
    }

    /// 供 App 啟動 / WebView ready 時主動查一次目前狀態（不必等狀態變化事件）。
    func refreshConnectionStatus() {
        broadcastConnectionStatus()
    }

    // MARK: - Sync userId → Watch
    /// Call this whenever the user logs in or the app becomes active.
    /// Pushes the current userId (and apiHost) to the Watch so it always
    /// saves workouts under the same account as the iPhone.
    /// 預設後端 base URL：依平台取自對應的設定來源
    /// （iPhone → AppConfig；Watch → WatchConfig），避免跨 target 看不到對方的設定。
    static var defaultAPIBaseURL: String {
        #if os(watchOS)
        return WatchConfig.apiBaseURL
        #else
        return AppConfig.apiBaseURL
        #endif
    }

    /// apiBaseURL：完整後端 base URL（含 scheme / host / port），預設取自平台設定。
    /// 同時附帶 apiHost（純 host）以相容舊版 Watch 端解析。
    func syncUserId(_ userId: String, token: String? = nil,
                    apiBaseURL: String = WatchConnectivityManager.defaultAPIBaseURL) {
        guard !userId.isEmpty else { return }
        let host = URL(string: apiBaseURL)?.host ?? apiBaseURL
        var msg: [String: Any] = [
            "type":       "USER_ID_SYNC",
            "userId":     userId,
            "apiBaseURL": apiBaseURL,   // ✅ 新：完整 base URL（Railway https/443 也正確）
            "apiHost":    host          // 🔁 舊：純 host，相容尚未更新的 Watch build
        ]
        // 🔐 登入 token 也一起給手錶：後端的私人 API 都要驗身分，
        //    以前手錶沒帶 → 恢復度、飲食、計劃全部 401（畫面一直轉圈或顯示沒資料）。
        #if os(iOS)
        let tok = token ?? KeychainStore.load(KeychainStore.tokenKey)
        if let tok = tok, !tok.isEmpty { msg["authToken"] = tok }
        #endif
        if WCSession.isSupported() && WCSession.default.activationState == .activated {
            // transferUserInfo works even when Watch is not currently reachable
            WCSession.default.transferUserInfo(msg)
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(msg, replyHandler: nil, errorHandler: nil)
            }
        }
        print("[WatchConnectivity] 📤 Synced userId=\(userId) to Watch")
    }

    // MARK: - 自動喚醒手錶 App（iPhone 沒心率感測器，必須讓手錶開始 workout 才量得到心率）
    private let healthStore = HKHealthStore()

    /// 從 iPhone 直接把手錶上的 DRVN App 拉起並進入 workout session。
    /// 這樣使用者不必手動打開手錶 App，一進訓練畫面手錶就自動開始量心率/卡路里。
    /// 需求：手機端有 HealthKit 權限、手錶 App 是 workout App（已具 workout-processing 背景模式）。
    /// 從 iPhone 主動拉起手錶 App 並建立 workout session。
    /// - Parameter mode: "gym" 重訓（室內肌力）／"cardio" 有氧（戶外跑步）
    ///
    /// ⚠️ activityType / locationType 必須跟著模式走：手錶收到 `.running` + `.outdoor`
    ///    才會啟用 GPS 與跑步專用的能量/步頻模型；沿用重訓的 `.traditionalStrengthTraining`
    ///    + `.indoor` 會讓手錶以為在室內做肌力，卡路里與距離都算錯。
    private func launchWatchWorkoutApp(mode: String = "gym") {
        // ⚠️ startWatchApp(toHandle:) 只存在於 iOS（從 iPhone 拉起手錶 App）。
        //    本檔同時被編進 Watch target，watchOS 上沒有這個 API → 必須用 #if os(iOS) 隔離，
        //    否則 Watch target 會出現「Incorrect argument label」編譯錯誤。
        #if os(iOS)
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[WatchConnectivity] ⚠️ HealthKit 不可用，無法自動喚醒手錶")
            return
        }
        let config = HKWorkoutConfiguration()
        if mode == "cardio" {
            config.activityType = .running
            config.locationType = .outdoor
        } else {
            config.activityType = .traditionalStrengthTraining
            config.locationType = .indoor
        }
        healthStore.startWatchApp(with: config) { success, error in
            print("[WatchConnectivity] ⌚ startWatchApp(mode=\(mode)) success=\(success) err=\(error?.localizedDescription ?? "-")")
        }
        #endif
    }

    // MARK: - Commands → Watch
    //  mode：「gym」重訓（手機驅動，會自動喚醒手錶 + 由 WatchConnHub 量心率）
    //        「cardio」有氧（跑步；手錶跑 GPS/配速/步頻，手機端合併兩邊串流）
    /// prewarm = true：進跑步頁先把手錶叫起來、讓心率先穩定；手錶端會把「真的開跑」之前的時間丟掉。
    func startWatchWorkout(mode: String = "gym", prewarm: Bool = false) {
        // ① 兩種模式都主動把手錶 App 拉起。
        //    以前只有 gym 會拉，理由是「cardio 多半在手錶上自己開始」——
        //    但使用者是從 iPhone 按 QUICK START 開跑的，手錶不會自己醒，
        //    結果心率/步頻整趟都沒有。現在手機開跑＝手錶同步開跑，
        //    兩邊一起收數據（手錶給心率/步頻，手機給 GPS/路線）。
        launchWatchWorkoutApp(mode: mode)
        // ② 送出 START（reachable 即時送；尚未起來則 transferUserInfo 排隊，手錶起來後立即處理）
        let msg: [String: Any] = ["command": "START_WORKOUT", "mode": mode, "prewarm": prewarm]
        sendMessage(msg)
        // ③ 手錶 App 冷啟需要一點時間 → 兩種模式都補送，確保 START 一定被收到。
        //    （cardio 冷啟同樣會漏掉第一則訊息，之前沒補送是漏網之魚。）
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.sendMessage(msg)
        }
        // ④ 戶外跑冷啟＋GPS 定位更慢，再補一次（重送是冪等的，手錶端會忽略重複 START）
        if mode == "cardio" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) { [weak self] in
                self?.sendMessage(msg)
            }
        }
    }

    func pauseWatchWorkout(mode: String = "gym") {
        sendMessage(["command": "PAUSE_WORKOUT", "mode": mode])
    }

    func resumeWatchWorkout(mode: String = "gym") {
        sendMessage(["command": "RESUME_WORKOUT", "mode": mode])
    }

    func stopWatchWorkout(mode: String = "gym") {
        sendMessage(["command": "STOP_WORKOUT", "mode": mode])
    }

    // MARK: - Private send helper
    // 🔧 指令(START/STOP…)即使手錶 App 在背景也要送達：
    //    reachable → sendMessage(即時)；不 reachable → transferUserInfo(排隊送達且會喚醒手錶 App)。
    //    這修掉「桌面顯示已連接、但訓練時手錶沒收到 START、心率傳不回來」的根因。
    private func sendMessage(_ message: [String: Any]) {
        var message = message
        /* ⏱ 每一則指令都蓋上發送時間。
           手錶端用它判斷「這是現在的指令，還是佇列裡的舊指令」。

           為什麼需要：手錶 App 沒開時，sendMessage 會退回 transferUserInfo 排隊，
           而那個佇列要等手錶 App 下次啟動才送達 —— 可能是幾小時後。
           使用者的症狀就是「一打開手錶 App 就自己跳進跑步」：那是上次
           （甚至上上次）手機開跑時排進去的 START_WORKOUT 現在才送到。
           開跑還會連送三次，所以佇列裡往往積了三則。 */
        message["ts"] = Date().timeIntervalSince1970

        let session = WCSession.default
        guard session.activationState == .activated else {
            print("[WatchConnectivity] session not activated")
            return
        }
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { [weak self] error in
                print("[WatchConnectivity] sendMessage error: \(error.localizedDescription) → fallback transferUserInfo")
                _ = self // keep
                session.transferUserInfo(message)
            }
        } else {
            // 手錶 App 不在前景 → 用 transferUserInfo 排隊送（會喚醒手錶 App 處理）
            session.transferUserInfo(message)
            print("[WatchConnectivity] not reachable → transferUserInfo: \(message)")
        }
    }

    // MARK: - WCSessionDelegate — receive from Watch
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async {
            let msgType = message["type"] as? String

            // ── Live biometrics ─────────────────────────
            if let hr = message["heartRate"] as? Double {
                self.lastHeartRate = hr
                NotificationCenter.default.post(name: .didReceiveWatchHeartRate, object: nil,
                                                userInfo: ["heartRate": hr])
            }
            if let cal = message["calories"] as? Double {
                self.lastCalories = cal
                NotificationCenter.default.post(name: .didReceiveWatchCalories, object: nil,
                                                userInfo: ["calories": cal])
            }
            if let dist = message["distance"] as? Double { self.lastDistance = dist }

            // ── 手錶追蹤狀態(workout 是否進行中) → 廣播給 React ──
            if let tracking = message["watchTracking"] as? Bool {
                NotificationCenter.default.post(name: .didChangeWatchTracking, object: nil,
                                                userInfo: ["tracking": tracking])
            }

            // ── 🔴 LIVE_METRICS: full per-second snapshot from Watch ─────────
            //    Forward the entire payload so the React tracker can replace
            //    its simulated values with real HealthKit data.
            if msgType == "LIVE_METRICS" {
                NotificationCenter.default.post(name: .didReceiveWatchLiveMetrics,
                                                object: nil,
                                                userInfo: message)
            }

            // ── Workout state ───────────────────────────
            if let state = message["workoutState"] as? String {
                self.workoutState = state
                NotificationCenter.default.post(name: .didReceiveWatchWorkoutState, object: nil,
                                                userInfo: ["state": state])
            }

            // ── Cardio summary (Perfectly Aligned Format) ──────────
            if let watchPayload = message["watchSummaryPayload"] as? [String: Any] {
                NotificationCenter.default.post(name: .didReceiveWatchWorkoutSummary, object: nil,
                                                userInfo: watchPayload)
                if let stats = watchPayload["stats"] as? [String: Any],
                   let duration = stats["duration"] as? Int {
                    print("[WatchConnectivity] Cardio summary — duration: \(duration)s")
                }
            }
            // -- Legacy Fallback (optional, keep if needed) --
            else if let duration = message["duration"] as? Int, message["avgHR"] != nil {
                NotificationCenter.default.post(name: .didReceiveWatchWorkoutSummary, object: nil,
                                                userInfo: message)
                print("[WatchConnectivity] Cardio summary — duration: \(duration)s")
            }

            // ── GYM_DONE: 存入 DRVN ─────────────────────
            if msgType == "GYM_DONE" {
                let volume      = message["volume"]      as? Double ?? 0
                let sets        = message["sets"]        as? Int    ?? 0
                let calories    = message["calories"]    as? Double ?? 0
                let duration    = message["duration"]    as? Int    ?? 0
                let hr          = message["heartRate"]   as? Double ?? 0
                let effortScore = message["effortScore"] as? Int    ?? 0
                let muscle      = message["muscle"]      as? String ?? "strength"
                let exercises   = message["exercises"]               ?? []
                let savedByWatch = message["savedByWatch"] as? Bool ?? false

                let payload: [String: Any] = [
                    "source":      "appleWatch",
                    "type":        "strength",
                    "volume":      volume,
                    "sets":        sets,
                    "calories":    calories,
                    "duration":    duration,
                    "avgHR":       hr,
                    "heartRate":   hr,
                    "effortScore": effortScore,
                    "muscle":      muscle,
                    "exercises":   exercises,
                    "savedByWatch": savedByWatch,
                    "timestamp":   Int(Date().timeIntervalSince1970 * 1000)
                ]

                NotificationCenter.default.post(name: .didReceiveGymDone, object: nil,
                                                userInfo: payload)
                print("[WatchConnectivity] GYM_DONE — volume:\(volume)kg sets:\(sets) effort:\(effortScore)")
            }

            // ── REQUEST_GYM_PLAN: Watch 請求同步計劃 ──────
            if msgType == "REQUEST_GYM_PLAN" {
                NotificationCenter.default.post(name: .didRequestGymPlan, object: nil)
                print("[WatchConnectivity] Watch requested GYM_PLAN — will read from localStorage")
            }

            // ── WATCH_WORKOUT_SAVED: Watch 直接儲存成功，通知 React 刷新紀錄 ──
            if msgType == "WATCH_WORKOUT_SAVED" {
                NotificationCenter.default.post(name: .didWatchWorkoutSaved, object: nil)
                print("[WatchConnectivity] Watch reported workout saved — notifying React to refresh")
            }
        }
    }

    // MARK: - WCSessionDelegate — receive userInfo (transferUserInfo fallback)
    // Handles GYM_DONE and other messages queued when iPhone was backgrounded
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        self.session(session, didReceiveMessage: userInfo)
    }

    // MARK: - WCSessionDelegate — lifecycle
    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        print("[WatchConnectivity] Activation: \(activationState.rawValue)")
        if let error = error {
            print("[WatchConnectivity] Activation error: \(error.localizedDescription)")
        }
        // 啟用完成 → 立刻廣播一次目前連線狀態（這是 React 顯示「已連接」的第一手來源）
        broadcastConnectionStatus()
    }

    #if os(iOS)
    /// 手錶可達性改變（手錶 App 進前景/背景、藍牙範圍變化…）→ 更新狀態
    func sessionReachabilityDidChange(_ session: WCSession) {
        print("[WatchConnectivity] Reachability changed → \(session.isReachable)")
        broadcastConnectionStatus()
    }

    /// 配對狀態 / 手錶 App 安裝狀態改變（配對新手錶、安裝/移除手錶 App…）→ 更新狀態
    func sessionWatchStateDidChange(_ session: WCSession) {
        print("[WatchConnectivity] Watch state changed (paired/installed)")
        broadcastConnectionStatus()
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
        print("[WatchConnectivity] Became inactive")
        broadcastConnectionStatus()
    }
    func sessionDidDeactivate(_ session: WCSession) {
        print("[WatchConnectivity] Deactivated — reactivating…")
        WCSession.default.activate()
    }
    #endif
}

// MARK: - Notification Names
extension Notification.Name {
    static let didReceiveWatchHeartRate      = Notification.Name("didReceiveWatchHeartRate")
    static let didReceiveWatchCalories       = Notification.Name("didReceiveWatchCalories")
    static let didReceiveWatchLiveMetrics    = Notification.Name("didReceiveWatchLiveMetrics")
    static let didReceiveWatchWorkoutState   = Notification.Name("didReceiveWatchWorkoutState")
    static let didReceiveWatchWorkoutSummary = Notification.Name("didReceiveWatchWorkoutSummary")
    static let didReceiveGymDone             = Notification.Name("didReceiveGymDone")
    static let didRequestGymPlan             = Notification.Name("didRequestGymPlan")
    static let didWatchWorkoutSaved          = Notification.Name("didWatchWorkoutSaved")
    static let didChangeWatchConnection      = Notification.Name("didChangeWatchConnection")
    static let didChangeWatchTracking        = Notification.Name("didChangeWatchTracking")
    /// 🩹 W-1: 手機端 HKWorkoutSession 失敗 → 通知 WebView 顯示「量測中斷」
    static let drvnHKWorkoutError            = Notification.Name("drvnHKWorkoutError")
}
