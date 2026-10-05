//
//  RunLiveActivityWidget.swift
//  RunWidget (Widget Extension)
//
//  🏃/🏋️ 訓練 Live Activity（跑步＋重訓共用）：
//  - 鎖屏/待機：DRVN 瑞士極簡卡片
//      跑步：時間 / 配速 / 距離；重訓：時間 / 動作 / 組數
//  - 靈動島：壓縮態左側 DRVN app icon、右側距離(跑) or 組數(重訓)
//  - 點擊 → 跑步回跑步儀表板、重訓回訓練頁
//

import ActivityKit
import WidgetKit
import SwiftUI

// DRVN 色票
private let drvnCoral  = Color(red: 0.976, green: 0.361, blue: 0.294) // #F95C4B
private let drvnInk    = Color(red: 0.086, green: 0.078, blue: 0.082) // #161415
private let drvnPaper  = Color(red: 0.965, green: 0.957, blue: 0.945) // #F6F4F1

private func fmtElapsed(_ sec: Int) -> String {
    let h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s)
                 : String(format: "%d:%02d", m, s)
}

private func isGym(_ state: RunActivityAttributes.ContentState) -> Bool {
    state.mode == "gym"
}

private func deepLink(_ state: RunActivityAttributes.ContentState) -> URL? {
    URL(string: isGym(state) ? "fitnessapp://gym-session" : "fitnessapp://run-dashboard")
}

// ── DRVN app logo（透明底跑者 glyph，用於壓縮態/minimal） ──
//    圖片來源：RunWidget/Assets.xcassets/DRVNIcon.imageset/icon.png（1024×1024）
//    目前使用 frontend/public/desktop/applogo.png 的裁切置中版；
//    想換圖直接替換該 PNG 再重新 build 即可。透明底 glyph 不做圓形裁切，
//    以 scaledToFit 完整顯示，避免切到跑者的角。
private struct DRVNBadge: View {
    var size: CGFloat = 20
    var body: some View {
        Image("DRVNIcon")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
    }
}

struct RunLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            // ── 鎖屏 / 待機卡片 ──
            // 💧 Liquid Glass：改用「半透明 tint」→ 系統會把鎖屏桌布模糊後透進卡片，
            //    得到真正的液態玻璃質感（Uber 到站卡那種）；不再用不透明深色底。
            //    文字加細微陰影確保任何桌布上都過 AA 對比。
            LockScreenRunView(state: context.state)
                .activityBackgroundTint(drvnInk.opacity(0.32))
                .activitySystemActionForegroundColor(drvnPaper)
                .widgetURL(deepLink(context.state))
        } dynamicIsland: { context in
            let gym = isGym(context.state)
            return DynamicIsland {
                // ── 展開態 ──
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        DRVNBadge(size: 18)
                        Text("DRVN")
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(drvnPaper)
                    }
                    .padding(.leading, 16)   // 往中間收，不貼左緣
                    .padding(.top, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.isPaused ? "已暫停" : (gym ? "重訓中" : "跑步中"))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(context.state.isPaused ? .orange : drvnCoral)
                        .padding(.trailing, 16)  // 往中間收，不貼右緣
                        .padding(.top, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        metricTime("時間", state: context.state)
                        Spacer()
                        if gym {
                            metric("動作", context.state.gymExercise ?? "--")
                            Spacer()
                            metric("組數", context.state.gymSetLabel ?? "--", accent: true)
                        } else {
                            metric("配速 /km", context.state.paceLabel)
                            Spacer()
                            metric("公里", String(format: "%.2f", context.state.distanceKm), accent: true)
                        }
                    }
                    .padding(.top, 4)
                    .padding(.horizontal, 16)  // 左右數據往中間收，不貼島緣
                }
            } compactLeading: {
                // ── 壓縮態左側：DRVN app icon（原本是跑步小人 SF Symbol） ──
                DRVNBadge(size: 20)
            } compactTrailing: {
                Text(gym ? (context.state.gymSetLabel ?? "--")
                         : String(format: "%.1f km", context.state.distanceKm))
                    .font(.system(size: 12, weight: .heavy).monospacedDigit())
                    .foregroundStyle(drvnCoral)
            } minimal: {
                DRVNBadge(size: 18)
            }
            .widgetURL(deepLink(context.state))
            .keylineTint(drvnCoral)
        }
    }

    @ViewBuilder
    private func metric(_ label: String, _ value: String, accent: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(drvnPaper.opacity(0.45))
            Text(value)
                .font(.system(size: 20, weight: .heavy).monospacedDigit())
                .foregroundStyle(accent ? drvnCoral : drvnPaper)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⏱ 自走式時間 —— 由系統驅動，不依賴 App 推送
    //
    // 使用者回報：「Apple 背景頁面顯示小工具裡面看數據會有延遲，
    //             有時候跑到某分鐘就會停止更新，點進去才又會有新數據。」
    // 成因：WKWebView 一進背景 JS 計時器被節流 → 沒有新的 UPDATE →
    //       鎖屏卡的秒數就凍在最後一次推送的值。
    // 解法：SwiftUI 的 Text(timerInterval:) 由系統每秒自行重繪，
    //       只要有錨點就永遠準確，跟 App 是不是在前台完全無關。
    //       暫停時 anchor 為 nil → 退回靜態文字（時間本來就不該走）。
    // ══════════════════════════════════════════════════════════════════════
    @ViewBuilder
    private func metricTime(_ label: String, state: RunActivityAttributes.ContentState) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(drvnPaper.opacity(0.45))
            Group {
                if let anchor = state.timerAnchor {
                    Text(timerInterval: anchor...Date.distantFuture,
                         pauseTime: nil,
                         countsDown: false,
                         showsHours: true)
                } else {
                    Text(fmtElapsed(state.elapsedSec))
                }
            }
            .font(.system(size: 20, weight: .heavy).monospacedDigit())
            .foregroundStyle(drvnPaper)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
        }
    }
}

// ── 鎖屏卡片 v2（Liquid Glass × Swiss Editorial）──────────────
//    · 玻璃底由 activityBackgroundTint(半透明) + 系統模糊提供
//    · 頂部 specular 髮絲高光 → 玻璃的「受光面」
//    · 底部虛線發光進度軌（Uber 到站卡語法）：
//        跑步 = 本公里進度（0→1km 的小節奏成就感）
//        重訓 = 本動作組數進度（3/5 組）
private struct LockScreenRunView: View {
    let state: RunActivityAttributes.ContentState

    /// 進度 0~1：重訓取 gymSetLabel "3/5" → 0.6；跑步取距離的小數部份（往下一公里）
    private var trackProgress: Double {
        if isGym(state) {
            let parts = (state.gymSetLabel ?? "").split(separator: "/")
            if parts.count == 2, let a = Double(parts[0]), let b = Double(parts[1]), b > 0 {
                return min(1, a / b)
            }
            return 0
        }
        let frac = state.distanceKm.truncatingRemainder(dividingBy: 1)
        return state.distanceKm > 0 && frac == 0 ? 1 : frac
    }

    var body: some View {
        let gym = isGym(state)
        VStack(alignment: .leading, spacing: 0) {
            // 頂列：品牌字標 ── 髮絲線 ── 狀態
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("DRVN")
                    .font(.system(size: 12, weight: .black))
                    .kerning(2.5)
                    .foregroundStyle(drvnPaper)
                Rectangle()
                    .fill(drvnPaper.opacity(0.22))
                    .frame(height: 1)
                Text(state.isPaused ? "PAUSED" : (gym ? "LIFTING" : "RUNNING"))
                    .font(.system(size: 9, weight: .heavy))
                    .kerning(2)
                    .foregroundStyle(state.isPaused ? drvnPaper.opacity(0.55) : drvnCoral)
                    .shadow(color: state.isPaused ? .clear : drvnCoral.opacity(0.6), radius: 4)
            }
            .padding(.bottom, 11)

            // 數據列：小標在上、大數字在下，欄間髮絲分隔線
            HStack(alignment: .top, spacing: 0) {
                lockMetricTime("TIME 時間", state: state)
                divider
                if gym {
                    lockMetric("EXERCISE 動作", state.gymExercise ?? "--", shrink: true)
                    divider
                    lockMetric("SET 組數", state.gymSetLabel ?? "--", accent: true)
                } else {
                    lockMetric("PACE 配速", state.paceLabel)
                    divider
                    lockMetric("KM 距離", String(format: "%.2f", state.distanceKm), accent: true)
                }
            }
            .padding(.bottom, 12)

            // 💧 虛線發光進度軌（玻璃卡上的一條光）
            HStack(spacing: 8) {
                GlowDashTrack(progress: trackProgress,
                              accent: state.isPaused ? drvnPaper.opacity(0.4) : drvnCoral)
                Text(gym ? "本動作" : "下一公里")
                    .font(.system(size: 8, weight: .heavy))
                    .kerning(1.2)
                    .foregroundStyle(drvnPaper.opacity(0.5))
                    .fixedSize()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        // 玻璃「受光面」：頂部 specular 髮絲高光
        .overlay(alignment: .top) {
            LinearGradient(colors: [drvnPaper.opacity(0.35), drvnPaper.opacity(0.0)],
                           startPoint: .leading, endPoint: .trailing)
                .frame(height: 1)
                .padding(.horizontal, 22)
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(drvnPaper.opacity(0.16))
            .frame(width: 1, height: 34)
            .padding(.horizontal, 12)
    }

    @ViewBuilder
    private func lockMetric(_ label: String, _ value: String, accent: Bool = false, shrink: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 8, weight: .heavy))
                .kerning(1.6)
                .foregroundStyle(drvnPaper.opacity(0.55))
            Text(value)
                .font(.system(size: shrink ? 19 : 27, weight: .heavy).monospacedDigit())
                .foregroundStyle(accent ? drvnCoral : drvnPaper)
                .shadow(color: .black.opacity(0.35), radius: 2, y: 1)   // 玻璃上保證可讀
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // ⏱ 鎖屏卡的自走式時間（同 metricTime 的理由 — 系統驅動，不靠 App 推送）
    @ViewBuilder
    private func lockMetricTime(_ label: String, state: RunActivityAttributes.ContentState) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 8, weight: .heavy))
                .kerning(1.6)
                .foregroundStyle(drvnPaper.opacity(0.55))
            Group {
                if let anchor = state.timerAnchor {
                    Text(timerInterval: anchor...Date.distantFuture,
                         pauseTime: nil,
                         countsDown: false,
                         showsHours: true)
                } else {
                    Text(fmtElapsed(state.elapsedSec))
                }
            }
            .font(.system(size: 27, weight: .heavy).monospacedDigit())
            .foregroundStyle(drvnPaper)
            .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// ── 虛線發光進度軌（Uber 到站卡語法：亮段發光、暗段虛線）──────
private struct GlowDashTrack: View {
    let progress: Double     // 0 ~ 1
    var accent: Color = drvnCoral
    var segments: Int = 16
    var body: some View {
        let lit = Int((Double(segments) * min(max(progress, 0), 1)).rounded())
        HStack(spacing: 3) {
            ForEach(0..<segments, id: \.self) { i in
                Capsule()
                    .fill(i < lit ? accent : drvnPaper.opacity(0.22))
                    .frame(height: i == max(0, lit - 1) ? 6 : 4)   // 前緣段略高＝行進感
                    .shadow(color: i < lit ? accent.opacity(0.7) : .clear, radius: 3)
            }
        }
        .animation(.easeOut(duration: 0.4), value: lit)
    }
}
