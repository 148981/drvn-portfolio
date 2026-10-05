//
//  LiveActivityManager.swift
//  FitnessApp
//
//  🏃 鎖屏 Live Activity + 靈動島（Dynamic Island）管理。
//  只在「跑步進行中」存在：START 建立、UPDATE 更新、STOP 結束。
//  JS 橋接：window.webkit.messageHandlers.liveActivity.postMessage({
//      command: 'START' | 'UPDATE' | 'STOP',
//      distanceKm, paceLabel, elapsedSec, calories, isPaused
//  })
//
//  ⚠️ 此檔案只屬於 App target（不用加進 widget extension）。
//

import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

final class LiveActivityManager {

    static let shared = LiveActivityManager()
    private init() {}

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private var currentActivity: Activity<RunActivityAttributes>? {
        get { _current as? Activity<RunActivityAttributes> }
        set { _current = newValue }
    }
    #endif
    private var _current: Any?

    // MARK: - Public API（由 WebView bridge 呼叫）

    func handle(command: String, payload: [String: Any]) {
        guard #available(iOS 16.1, *) else { return }
        let state = Self.parseState(payload)
        /* 只認跑步（mode 空）與重訓（mode "gym"）。其他 mode（例如舊版網頁的 "plan" 排課計時）
           原生沒有對應版面，會被畫成「RUNNING · 0.00 km」—— 使用者沒跑步卻看到跑步卡。直接忽略。 */
        if let mode = state.mode, !mode.isEmpty, mode != "gym", command.uppercased() != "STOP" { return }
        switch command.uppercased() {
        case "START":  start(state: state)
        case "UPDATE": update(state: state)
        case "STOP":   stop(finalState: state)
        default: break
        }
    }

    // MARK: - Internals

    @available(iOS 16.1, *)
    private func start(state: RunActivityAttributes.ContentState) {
        #if canImport(ActivityKit)
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("[LiveActivity] Live Activities disabled by user/system")
            return
        }
        // 已有進行中的 activity → 直接更新，避免疊加
        if currentActivity != nil { update(state: state); return }

        let attributes = RunActivityAttributes(startedAt: Date())
        do {
            let activity = try Activity<RunActivityAttributes>.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil),
                pushType: nil
            )
            currentActivity = activity
            print("[LiveActivity] started: \(activity.id)")
        } catch {
            print("[LiveActivity] start failed: \(error.localizedDescription)")
        }
        #endif
    }

    @available(iOS 16.1, *)
    private func update(state: RunActivityAttributes.ContentState) {
        #if canImport(ActivityKit)
        // 🛠 App 曾被系統回收再重開 → currentActivity 參照遺失。
        //    活動還在進行（JS 持續送 UPDATE）→ 直接重建，別讓鎖屏卡凍結在舊數據。
        guard let activity = currentActivity else { start(state: state); return }
        Task {
            await activity.update(.init(state: state, staleDate: nil))
        }
        #endif
    }

    @available(iOS 16.1, *)
    private func stop(finalState: RunActivityAttributes.ContentState) {
        #if canImport(ActivityKit)
        let activity = currentActivity
        currentActivity = nil
        Task {
            // 結束後鎖屏卡片保留幾秒讓使用者看到總結，然後自動消失
            if let activity {
                await activity.end(
                    .init(state: finalState, staleDate: nil),
                    dismissalPolicy: .after(.now + 4)
                )
            }
            // 🧟 掃掉所有殘留 activity（App 重啟後參照遺失的殭屍卡 —— 使用者
            //    「結束跑步了靈動島還在」的根因）。目前的那顆上面已優雅結束，
            //    這裡把其餘的立即清除。
            for zombie in Activity<RunActivityAttributes>.activities where zombie.id != activity?.id {
                await zombie.end(nil, dismissalPolicy: .immediate)
            }
        }
        #endif
    }

    /// 🧹 App 冷啟動時呼叫：結束所有殘留的 Live Activity。
    /// 冷啟動時不可能有合法的進行中訓練（若有，JS 端 3 秒內的 UPDATE 會自動重建）。
    func endZombies() {
        guard #available(iOS 16.1, *) else { return }
        #if canImport(ActivityKit)
        Task {
            for zombie in Activity<RunActivityAttributes>.activities {
                await zombie.end(nil, dismissalPolicy: .immediate)
            }
        }
        #endif
    }

    /// 🧹 App 即將被終止（使用者從多工畫面滑掉、系統結束背景中的跑步）時呼叫。
    ///    App 一死，GPS 與 JS 都不會再更新 → 鎖屏卡／靈動島會凍結在最後的數字好幾個小時。
    ///    applicationWillTerminate 只給幾秒，這裡最多同步等 2 秒讓 end 送出。
    ///    用 Task.detached：不可跑在主執行緒，否則下面的 wait 會卡死自己。
    func endAllBlocking(timeout: TimeInterval = 2) {
        guard #available(iOS 16.1, *) else { return }
        #if canImport(ActivityKit)
        guard !Activity<RunActivityAttributes>.activities.isEmpty else { return }
        currentActivity = nil
        let done = DispatchSemaphore(value: 0)
        Task.detached {
            for activity in Activity<RunActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            done.signal()
        }
        _ = done.wait(timeout: .now() + timeout)
        #endif
    }

    // MARK: - Payload 解析

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static func parseState(_ p: [String: Any]) -> RunActivityAttributes.ContentState {
        func d(_ key: String) -> Double { (p[key] as? NSNumber)?.doubleValue ?? Double("\(p[key] ?? "")") ?? 0 }
        func i(_ key: String) -> Int { (p[key] as? NSNumber)?.intValue ?? Int("\(p[key] ?? "")") ?? 0 }
        return .init(
            distanceKm: d("distanceKm"),
            paceLabel: (p["paceLabel"] as? String) ?? "--",
            elapsedSec: i("elapsedSec"),
            calories: i("calories"),
            isPaused: (p["isPaused"] as? Bool) ?? false,
            mode: p["mode"] as? String,
            gymExercise: p["gymExercise"] as? String,
            gymSetLabel: p["gymSetLabel"] as? String,
            // ⏱ 自走計時錨點（JS 端 utils/liveActivity.js 帶上來）
            startedAtEpoch: d("startedAtEpoch") > 0 ? d("startedAtEpoch") : nil,
            updatedAtEpoch: d("updatedAtEpoch") > 0 ? d("updatedAtEpoch") : nil
        )
    }
    #endif
}
