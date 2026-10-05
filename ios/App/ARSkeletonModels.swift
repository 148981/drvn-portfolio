//
//  ARSkeletonModels.swift
//  混合邊緣運算遷移 — AR 動作回放：前端渲染架構（Stage 1，Swift 地端版）
//
//  ───────────────────────────────────────────────────────────────────────────
//  原本的做法：後端用 OpenCV 把骨架畫進影格、再壓成 MP4 —— 又慢又耗效能。
//  新做法「乾性分離」：
//    · 偵測（已在 PoseAnalyzer.swift 用 MediaPipe 地端跑完）只負責「分析」。
//    · 這個檔案把每幀 33 點骨架，整理成「只含主要關節 + 時間軸」的輕量資料合約，
//      交給 ARPlaybackView 用 AVPlayer + Canvas 即時疊合渲染。
//
//  ⚠️ 為什麼資料來源是 Swift 而不是 Python？
//     本專案走「混合邊緣運算」：MediaPipe 在 iOS 地端跑，33 點座標本來就在手機上。
//     後端 /api/analyze_set 只收到 7 維特徵、不含座標 —— 所以骨架 JSON 由 Swift 組裝，
//     後端只回傳「哪一下是 best / worst」（repSegments + fatigueData）。
//
//  ── 座標系約定（對位正確性的關鍵）──────────────────────────────────────────
//  MediaPipe 的 NormalizedLandmark.x / y 是 0.0~1.0 的比例值，相對於
//  「轉正後（已套用 preferredTransform 方向）」的影像。AVPlayer 播放時也會
//  把影片轉正顯示，兩邊基準一致 —— ARPlaybackView 只要再乘上影片在畫面上
//  實際被 aspect-fit 後的內容矩形寬高即可精準對位。
//  ───────────────────────────────────────────────────────────────────────────

import Foundation
import CoreGraphics
import MediaPipeTasksVision

// MARK: - 骨架資料合約（對應原 prompt 的 JSON 結構）

/// 單一關節點。對應 prompt JSON 的 joints["11"] = { x, y, visibility }。
struct ARJoint: Codable, Hashable {
    /// MediaPipe pose landmark index（11=左肩、24=右髖…）。
    let id: Int
    /// 0.0~1.0 正規化座標（相對於轉正後影像寬）。
    let x: Float
    /// 0.0~1.0 正規化座標（相對於轉正後影像高）。
    let y: Float
    /// 該點可見度 0~1，太低時 ARPlaybackView 會略過不畫。
    let visibility: Float
}

/// 一幀骨架。time 用「相對整支影片」的秒數，AVPlayer 才能直接對齊。
struct ARSkeletonFrame: Codable {
    /// 相對整支影片的時間（秒）。由 frameIndex / fps 反推、單調遞增。
    let timeSec: Double
    /// 該幀的主要關節（已過濾，只留 ARSkeletonBuilder.keyJoints）。
    let joints: [ARJoint]

    /// 以關節 id 快速取點。
    func joint(_ id: Int) -> ARJoint? {
        joints.first { $0.id == id }
    }
}

/// 一條教練提示。對應 prompt JSON 的 tips[] = { metric, message, action }。
struct ARCoachTip: Codable, Identifiable {
    var id: String { metric }
    /// 指標名稱，如 "Squat Depth" / "Torso"。
    let metric: String
    /// 問題描述。
    let message: String
    /// 修正建議。
    let action: String
    /// 嚴重度：excellent / good / fair / needs_work。決定提示框配色。
    let level: String
}

/// 一個 rep 片段 —— best（最完美）或 worst（失誤最多）那一下。
struct ARRepClip: Codable, Identifiable {
    var id: String { "\(repType)_\(repIndex)" }
    /// "best" 或 "worst"。
    let repType: String
    /// 第幾下（1-based），對應後端 repSegments 的 rep 編號。
    let repIndex: Int
    /// 這一下在原始影片上的起訖秒數。
    let startTimeSec: Double
    let endTimeSec: Double
    /// 後端評分 0~100。
    let score: Double
    /// 教練提示。
    let tips: [ARCoachTip]
    /// 這一下的逐幀骨架（已切段、已過濾關節）。
    let frames: [ARSkeletonFrame]

    /// 中文標題。
    var displayTitle: String {
        repType == "best" ? "最佳一下" : "待加強一下"
    }
}

/// 丟給 ARPlaybackView 的完整資料包（非 Codable —— 含本機 video URL）。
struct ARPlaybackPayload {
    /// 使用者原始影片的本機檔案 URL（PoseAnalyzer 快取下來的暫存檔）。
    let videoURL: URL
    /// 轉正後的影片顯示尺寸（px）—— 用來算 aspect-fit 內容矩形。
    let videoSize: CGSize
    /// 動作中文名稱，如「深蹲」。
    let exerciseName: String
    /// 整體分數 0~100。
    let overallScore: Double
    /// 要回放的片段，順序為 [best, worst]（任一可能缺）。
    let clips: [ARRepClip]
}

// MARK: - 骨架建構器（Stage 1 的核心：33 點 → 輕量合約）

/// 把 PoseAnalyzer 偵測到的逐幀骨架，切成指定 rep 的 ARRepClip。
/// 標 iOS 17：buildClip 參數型別 PoseAnalyzer.PoseFrame 巢狀於 @available(iOS 17) 的類別內。
@available(iOS 17.0, *)
enum ARSkeletonBuilder {

    // ── 主要關節白名單 ──────────────────────────────────────────────
    //  MediaPipe Pose 共 33 點，但畫骨架只需要軀幹四肢這 13 點。
    //  眼睛、耳朵、手指末端、腳趾全部剔除 —— 對應原 prompt「節省 JSON 大小」那一條。
    static let keyJoints: [Int] = [
        0,                       // 鼻（頭部參考點）
        11, 12,                  // 左 / 右肩
        13, 14,                  // 左 / 右肘
        15, 16,                  // 左 / 右腕
        23, 24,                  // 左 / 右髖
        25, 26,                  // 左 / 右膝
        27, 28,                  // 左 / 右踝
    ]

    /// 骨架連線（畫線用）。每組是一對關節 id。
    static let bones: [(Int, Int)] = [
        (11, 12),                // 肩線
        (11, 13), (13, 15),      // 左臂
        (12, 14), (14, 16),      // 右臂
        (11, 23), (12, 24),      // 軀幹兩側
        (23, 24),                // 髖線
        (23, 25), (25, 27),      // 左腿
        (24, 26), (26, 28),      // 右腿
    ]

    /// 頭部到雙肩的淡連線（與 bones 分開畫，畫得更細）。
    static let headBones: [(Int, Int)] = [(0, 11), (0, 12)]

    /// 低於此 visibility 的關節視為「被遮蔽」，畫面上略過。
    static let visibilityThreshold: Float = 0.35

    /// 把整支影片的逐幀骨架切出某個 rep 的片段。
    /// - Parameters:
    ///   - repType: "best" / "worst"
    ///   - repIndex: 第幾下（1-based）
    ///   - startSec / endSec: 該 rep 在原始影片上的起訖秒數（來自後端 repSegments）
    ///   - score: 該 rep 分數
    ///   - tips: 教練提示
    ///   - allFrames: PoseAnalyzer 偵測到、已依真實 PTS 排序的全部骨架幀
    static func buildClip(repType: String,
                          repIndex: Int,
                          startSec: Double,
                          endSec: Double,
                          score: Double,
                          tips: [ARCoachTip],
                          allFrames: [PoseAnalyzer.PoseFrame]) -> ARRepClip {
        // 前後各留一點緩衝，回放時這一下的頭尾才不會被切掉。
        let pad = 0.20
        let lo = startSec - pad
        let hi = endSec + pad

        var skeletonFrames: [ARSkeletonFrame] = []
        skeletonFrames.reserveCapacity(allFrames.count)

        for frame in allFrames {
            let t = Double(frame.timestampMs) / 1000.0
            guard t >= lo, t <= hi else { continue }

            var joints: [ARJoint] = []
            joints.reserveCapacity(keyJoints.count)
            for idx in keyJoints {
                guard idx < frame.image.count else { continue }
                let lm = frame.image[idx]
                // NormalizedLandmark.visibility 是 NSNumber?；偵測不到時當作 0。
                let vis = lm.visibility?.floatValue ?? 0
                joints.append(ARJoint(id: idx,
                                      x: lm.x,
                                      y: lm.y,
                                      visibility: vis))
            }
            skeletonFrames.append(ARSkeletonFrame(timeSec: t, joints: joints))
        }

        return ARRepClip(repType: repType,
                         repIndex: repIndex,
                         startTimeSec: startSec,
                         endTimeSec: endSec,
                         score: score,
                         tips: tips,
                         frames: skeletonFrames)
    }
}
