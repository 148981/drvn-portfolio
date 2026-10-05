import Foundation
import CoreMotion

/**
 * 🏃‍♂️ PedometerManager
 *
 * 跑步機 / 室內模式專用 — 用 CoreMotion 的 CMPedometer 抓步數與 Apple 推算的距離。
 *
 * 原理：
 *   - CMPedometer 直接吃手機加速度計 + 陀螺儀的訊號偵測步數。
 *   - 當 GPS 不可用（例如在跑步機上），CMPedometer 仍會回傳一個 distance（NSNumber, meters）。
 *   - 這個推算距離會根據使用者的 HealthKit 身高/性別自動修正（所以一定要先請過 HK 權限）。
 *
 * UX 注意事項（必須在 UI 端提示）：
 *   - 使用者若把手機放在跑步機儀表板上不動，加速度計收不到訊號 → 步數 = 0，距離 = 0。
 *   - 要在 treadmill mode 啟動時提示「請將手機握在手中、放入口袋或使用運動臂套」。
 */
@available(iOS 17.0, *)
final class PedometerManager {

    private let pedometer = CMPedometer()
    private var startDate: Date?
    private var isPaused: Bool = false
    private var accumulatedPauseDuration: TimeInterval = 0
    private var pauseAt: Date?

    /// 回呼參數：(累積步數, 累積距離 meters)
    private var callback: ((Int, Double, Double) -> Void)?

    /// 是否可用（部分舊機型 / 模擬器會回 false）
    static var isAvailable: Bool { CMPedometer.isStepCountingAvailable() }

    // 📊 「動作與健身」(Motion & Fitness / Core Motion) 授權觸發。
    //    保持 static 存活，否則 async callback 還沒回來物件就被釋放。
    private static let motionActivityManager = CMMotionActivityManager()

    /// App 啟動時呼叫一次：請求「動作與健身」權限。
    /// 首次呼叫會跳出系統授權（或靜默授權），並讓 App 出現在
    /// 「設定 ＞ <App> ＞ 動作與健身」開關（與 Strava 相同），之後就能讀原生步數/動作。
    static func requestMotionAuthorization() {
        guard CMMotionActivityManager.isActivityAvailable() else { return }
        // queryActivityStarting 會觸發 Motion & Fitness 權限並把 App 註冊進系統設定。
        motionActivityManager.queryActivityStarting(from: Date().addingTimeInterval(-3600),
                                                    to: Date(),
                                                    to: .main) { _, _ in }
    }

    /// 啟動 — 跑步機模式呼叫
    /// - Parameter onUpdate: 每秒回呼一次（steps, distanceMeters, cadenceSpm）。distance / cadence 若硬體不支援會為 0。
    func start(onUpdate: @escaping (Int, Double, Double) -> Void) {
        guard CMPedometer.isStepCountingAvailable() else {
            print("⚠️ [Pedometer] Step counting not available on this device")
            return
        }

        self.callback = onUpdate
        self.startDate = Date()
        self.isPaused = false
        self.accumulatedPauseDuration = 0
        self.pauseAt = nil

        // Live updates — 每次系統偵測到變化就 push 一次
        pedometer.startUpdates(from: Date()) { [weak self] data, error in
            guard let self = self, !self.isPaused, let data = data else {
                if let err = error { print("❌ [Pedometer] Update error: \(err.localizedDescription)") }
                return
            }
            let steps = data.numberOfSteps.intValue
            // distance 為 NSNumber? — 部分舊裝置不支援，CMPedometer.isDistanceAvailable() == false
            let distance = (data.distance?.doubleValue) ?? 0
            // 🆕 currentCadence 為 steps/sec（iOS 9+）→ ×60 得 spm；不支援時為 nil。
            let spm = (data.currentCadence?.doubleValue ?? 0) * 60.0
            DispatchQueue.main.async {
                self.callback?(steps, distance, spm)
            }
        }
    }

    /// 暫停（保留累計，不再 push 更新）
    func pause() {
        guard !isPaused else { return }
        isPaused = true
        pauseAt = Date()
    }

    /// 恢復
    func resume() {
        guard isPaused else { return }
        if let p = pauseAt {
            accumulatedPauseDuration += Date().timeIntervalSince(p)
        }
        pauseAt = nil
        isPaused = false
    }

    /// 停止並清除狀態
    func stop() {
        pedometer.stopUpdates()
        callback = nil
        startDate = nil
        isPaused = false
        pauseAt = nil
        accumulatedPauseDuration = 0
    }
}
