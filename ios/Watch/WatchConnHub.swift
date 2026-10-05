//
//  WatchConnHub.swift
//  ＦｉｔｎｅｓｓAppWatch Watch App
//
//  常駐連線中樞（Persistent Connectivity Hub）
//  ──────────────────────────────────────────────────────────────────────────
//  問題：原本 cardio / gym / nutrition 三個 manager 各自把自己設成 WCSession.default.delegate，
//        而且都是「進到那個畫面才被建立」。只有最後一個會勝出 → 手錶停在主選單 / App 在背景時，
//        沒有任何人在聽 iPhone 送來的 START → 手機進重訓也量不到心率。
//
//  解法：App 一啟動就建立這個 hub，並讓它成為「唯一」的 WCSession delegate。
//        1) 收到任何訊息 → 用 NotificationCenter 廣播給各畫面 manager（保留原本全部行為）。
//        2) 收到「重訓模式(mode=gym)」的 START → 不管手錶停在哪一頁，hub 自己啟動一個
//           HR 量測 session，並每 2 秒把心率/卡路里回傳 iPhone。
//           達成「手機一進重訓、手錶自動量、完全不用手動開手錶 App」。
//
//  與 cardio 不衝突：cardio 送 mode=cardio，hub 不接手，仍交給 WatchWorkoutManager（GPS/配速）。
//  與手錶端自己練不衝突：WatchSessionGate 標記畫面層 session 進行中時，hub 不重複起 session。
//

import Foundation
import WatchConnectivity
import HealthKit
import Combine

extension Notification.Name {
    /// hub 收到 iPhone 訊息後對 App 內廣播（各畫面 manager 監聽這個取代原本當 delegate）。
    static let drvnWatchMsg       = Notification.Name("drvnWatchMsg")
    /// 與 iPhone 的可連線狀態變 true（GymWorkoutManager 監聽後重新拉計劃）。
    static let drvnWatchReachable = Notification.Name("drvnWatchReachable")
}

/// 全域單一鎖：手錶「畫面層」(gym/cardio UI) 是否正在進行 workout。
/// watchOS 同時只能有一個 HKWorkoutSession，hub 起 session 前會檢查此鎖避免衝突。
enum WatchSessionGate {
    static var isViewSessionActive = false
}

final class WatchConnHub: NSObject, ObservableObject,
                          WCSessionDelegate,
                          HKWorkoutSessionDelegate,
                          HKLiveWorkoutBuilderDelegate {

    static let shared = WatchConnHub()

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var hrTimer: AnyCancellable?
    private var heartRate: Double = 0
    private var calories: Double = 0
    private var streaming = false

    // 🩹 W-2: 手機不 reachable（鎖屏/背景）時的心率緩衝。
    //    以前 broadcast() 直接 guard isReachable 丟棄 → 圖表出現無解釋空洞。
    //    現在：不 reachable 就先存起來，恢復 reachable 後用 transferUserInfo 批次補傳。
    private var pendingMetrics: [[String: Any]] = []
    private let pendingMetricsCap = 600   // 2 秒/筆 ≈ 20 分鐘，超過丟最舊的

    // 🩹 W-1: session 失敗自動重建的節流（避免無限重試迴圈）
    private var lastSessionRetry: Date = .distantPast

    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self   // hub 是「唯一」delegate
            WCSession.default.activate()
        }
    }

    /// App 啟動時呼叫一次，確保 hub 被建立（觸發 singleton init）。
    static func bootstrap() { _ = WatchConnHub.shared }

    // MARK: - WCSessionDelegate
    func session(_ s: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}

    func sessionReachabilityDidChange(_ s: WCSession) {
        if s.isReachable {
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .drvnWatchReachable, object: nil)
                self.flushPendingMetrics()   // 🩹 W-2: 恢復連線 → 補傳斷線期間的心率
            }
        }
    }

    /// 🩹 W-2: 把斷線期間累積的心率批次補傳給 iPhone。
    /// transferUserInfo 不需要 reachable、系統會排隊保證送達。
    private func flushPendingMetrics() {
        guard !pendingMetrics.isEmpty else { return }
        let batch = pendingMetrics
        pendingMetrics.removeAll()
        WCSession.default.transferUserInfo([
            "type":    "LIVE_METRICS_BACKFILL",
            "samples": batch
        ])
        print("[WatchConnHub] ⌚→📱 backfilled \(batch.count) buffered HR samples")
    }

    func session(_ s: WCSession, didReceiveMessage message: [String: Any]) { route(message) }
    func session(_ s: WCSession, didReceiveUserInfo userInfo: [String: Any]) { route(userInfo) }

    private func route(_ message: [String: Any]) {
        DispatchQueue.main.async {
            // 1) 廣播給各畫面 manager（cardio / gym / nutrition 照常運作）
            NotificationCenter.default.post(name: .drvnWatchMsg, object: nil, userInfo: message)

            // 2) 重訓模式的 START/STOP 由 hub 親自處理（畫面沒開也能量心率）
            if let cmd = message["command"] as? String {
                let mode = (message["mode"] as? String) ?? ""
                /* ⏱ 跟 ContentView 同一道閘：transferUserInfo 的佇列會在手錶 App
                   下次啟動時才送達，過期的 START 會讓使用者一打開就被拉進量測。
                   只擋「開始」類的指令 —— 遲到的 STOP 無害，而且該照做。 */
                let age = Date().timeIntervalSince1970 - (message["ts"] as? Double ?? 0)
                let isFresh = age >= 0 && age < 90
                switch cmd {
                case "START_WORKOUT"  where mode == "gym":
                    if isFresh { self.startGymHR() }
                    else { print("[WatchConnHub] ⏱ 忽略過期的 gym START（\(Int(age)) 秒前）") }
                case "RESUME_WORKOUT" where mode == "gym":
                    if isFresh { self.startGymHR() }
                case "STOP_WORKOUT"   where mode == "gym": self.stopGymHR()
                default: break
                }
            }
        }
    }

    // MARK: - Gym HR session（手機驅動、與畫面無關）
    private func startGymHR() {
        // 手錶上使用者自己正在練（畫面層 session）→ 交給它，hub 不重複起 session
        guard !WatchSessionGate.isViewSessionActive else { return }

        if session == nil {
            let share: Set<HKSampleType> = [
                HKQuantityType.workoutType(),
                HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
                HKQuantityType.quantityType(forIdentifier: .heartRate)!
            ]
            let read: Set<HKObjectType> = [
                HKObjectType.quantityType(forIdentifier: .heartRate)!,
                HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
            ]
            healthStore.requestAuthorization(toShare: share, read: read) { [weak self] _, _ in
                DispatchQueue.main.async { self?.beginSession() }
            }
        }
        streaming = true
        hrTimer?.cancel()
        hrTimer = Timer.publish(every: 2, on: .main, in: .common).autoconnect()
            .sink { [weak self] _ in self?.broadcast() }
        broadcast()   // 立刻回報一次「追蹤中」，指示燈即時亮起
        print("[WatchConnHub] ⌚→📱 gym HR streaming started")
    }

    private func beginSession() {
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        guard let s = try? HKWorkoutSession(healthStore: healthStore, configuration: config) else { return }
        let b = s.associatedWorkoutBuilder()
        b.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
        s.delegate = self; b.delegate = self
        session = s; builder = b
        let now = Date()
        s.startActivity(with: now)
        b.beginCollection(withStart: now) { _, _ in }
    }

    private func stopGymHR() {
        streaming = false
        hrTimer?.cancel(); hrTimer = nil
        session?.stopActivity(with: Date()); session?.end()
        builder?.endCollection(withEnd: Date()) { [weak self] _, _ in
            self?.builder?.finishWorkout { _, _ in }
        }
        session = nil; builder = nil
        if WCSession.default.activationState == .activated {
            // 🩹 停止訊號改為「保證送達」：reachable 即時送，否則排隊（原本不 reachable 直接丟）
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(["watchTracking": false], replyHandler: nil, errorHandler: nil)
            } else {
                WCSession.default.transferUserInfo(["watchTracking": false])
            }
            flushPendingMetrics()   // 順手把最後一段緩衝送出
        }
        print("[WatchConnHub] ⌚→📱 gym HR streaming stopped")
    }

    private func broadcast() {
        guard streaming,
              WCSession.default.activationState == .activated else { return }

        let payload: [String: Any] = [
            "type":          "LIVE_METRICS",
            "heartRate":     heartRate,
            "calories":      calories,
            "timestamp":     Date().timeIntervalSince1970,
            "watchTracking": true
        ]

        // 🩹 W-2: 不 reachable（手機鎖屏/背景）→ 進緩衝，恢復後補傳，不再丟棄
        guard WCSession.default.isReachable else {
            pendingMetrics.append(payload)
            if pendingMetrics.count > pendingMetricsCap {
                pendingMetrics.removeFirst(pendingMetrics.count - pendingMetricsCap)
            }
            return
        }
        WCSession.default.sendMessage(payload, replyHandler: nil) { [weak self] _ in
            // 即時送失敗（剛好切背景）→ 一樣進緩衝
            DispatchQueue.main.async { self?.pendingMetrics.append(payload) }
        }
    }

    // MARK: - HK delegates
    // 🩹 W-1: 不再靜默。session 意外終止/失敗時：通知手機顯示「量測中斷」、
    //         若還在 streaming 就節流重建（60 秒最多一次，避免無限重試）。
    func workoutSession(_ s: HKWorkoutSession, didChangeTo to: HKWorkoutSessionState, from: HKWorkoutSessionState, date: Date) {
        guard streaming, to == .ended || to == .stopped else { return }
        print("[WatchConnHub] ⚠️ HK session unexpectedly \(to.rawValue) while streaming → recover")
        DispatchQueue.main.async { self.recoverGymSession(reason: "state_\(to.rawValue)") }
    }

    func workoutSession(_ s: HKWorkoutSession, didFailWithError e: Error) {
        print("[WatchConnHub] ❌ HK session failed: \(e.localizedDescription)")
        DispatchQueue.main.async { self.recoverGymSession(reason: e.localizedDescription) }
    }

    /// 🩹 W-1: session 死亡後的恢復路徑 — 告知手機＋節流重建。
    private func recoverGymSession(reason: String) {
        // 1) 讓 iPhone 端知道量測中斷（前端顯示提示，而不是假裝還在量）
        let notice: [String: Any] = ["type": "HR_SESSION_INTERRUPTED", "reason": reason]
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(notice, replyHandler: nil, errorHandler: nil)
        } else {
            WCSession.default.transferUserInfo(notice)
        }
        // 2) 還在 streaming → 節流重建 session（60 秒最多重試一次）
        session = nil; builder = nil
        guard streaming, Date().timeIntervalSince(lastSessionRetry) > 60 else { return }
        lastSessionRetry = Date()
        beginSession()
        print("[WatchConnHub] 🔄 HK session rebuilt after failure (\(reason))")
    }

    func workoutBuilderDidCollectEvent(_ b: HKLiveWorkoutBuilder) {}

    func workoutBuilder(_ b: HKLiveWorkoutBuilder, didCollectDataOf types: Set<HKSampleType>) {
        for t in types {
            guard let q = t as? HKQuantityType, let stats = b.statistics(for: q) else { continue }
            let id = HKQuantityTypeIdentifier(rawValue: q.identifier)
            DispatchQueue.main.async {
                switch id {
                case .heartRate:
                    let bpm = stats.mostRecentQuantity()?
                        .doubleValue(for: HKUnit.count().unitDivided(by: .minute())) ?? 0
                    if bpm > 0 { self.heartRate = bpm; self.broadcast() }
                case .activeEnergyBurned:
                    let kcal = stats.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                    if kcal > 0 { self.calories = kcal }
                default:
                    break
                }
            }
        }
    }
}
