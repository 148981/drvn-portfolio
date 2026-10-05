//
//  RunActivityAttributes.swift
//  FitnessApp
//
//  🏃 跑步 Live Activity 的共用資料模型。
//  ⚠️ 這個檔案必須同時加入「App target」與「RunWidget extension target」
//     （Xcode File Inspector → Target Membership 勾兩個）。
//

import Foundation
#if canImport(ActivityKit)
import ActivityKit

struct RunActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// 累積距離（公里）
        var distanceKm: Double
        /// 配速字串，例如 5'32"（已由前端格式化）
        var paceLabel: String
        /// 已經過秒數
        var elapsedSec: Int
        /// 消耗卡路里
        var calories: Int
        /// 是否暫停中
        var isPaused: Bool
        /// 模式："run"（預設，nil 視為 run）或 "gym"（重訓）
        var mode: String?
        /// 重訓：目前動作名稱（例：槓鈴臥推）
        var gymExercise: String?
        /// 重訓：組數進度標籤（例：3/5 組）
        var gymSetLabel: String?

        // ══════════════════════════════════════════════════════════════════
        // ⏱ 自走式計時錨點（Self-ticking timer）
        //
        // 問題：WKWebView 進背景後 JS 計時器會被系統節流，鎖屏卡的「已用時間」
        //      就卡在最後一次推送的值 —— 使用者回報「跑到某分鐘就停止更新，
        //      點進去才又有新數據」。
        //
        // 解法：帶上「這段計時的起算時間點」，Widget 端改用
        //      `Text(timerInterval:)` 讓時間由系統自己走，完全不依賴 JS 推送。
        //      距離／配速仍靠 UPDATE 刷新（那本來就需要新的 GPS 資料）。
        //
        // 暫停時 anchor 為 nil → Widget 退回顯示靜態的 elapsedSec。
        // ══════════════════════════════════════════════════════════════════
        var startedAtEpoch: Double?
        var updatedAtEpoch: Double?

        /// 計時錨點：now − elapsedSec。暫停中回 nil（時間不該繼續走）。
        var timerAnchor: Date? {
            guard !isPaused else { return nil }
            if let e = startedAtEpoch, e > 0 { return Date(timeIntervalSince1970: e) }
            return nil
        }
    }

    /// 開跑時間（不可變）
    var startedAt: Date
}
#endif
