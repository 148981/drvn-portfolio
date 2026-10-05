import SwiftUI
import HealthKit
import WatchKit

// ══════════════════════════════════════════════════════
// MARK: - Cardio Editorial Root
// Swiss International Typographic Style · OLED Black
// ══════════════════════════════════════════════════════
struct CardioEditorialView: View {
    @ObservedObject var manager: WatchWorkoutManager
    @State private var page = 0

    var body: some View {
        TabView(selection: $page) {
            CardioControlsPage(manager: manager).tag(0)
            
            if manager.selectedMode != "free" {
                CoachPaceEditorialPage(manager: manager).tag(1)
            } else {
                PaceEditorialPage(manager: manager).tag(1)
            }
            
            HeartRateEditorialPage(manager: manager).tag(2)
            
            // ⭐ 新增：儀表板模式放在第 4 頁 (右滑到底)
            DashboardEditorialPage(manager: manager).tag(3)
        }
        .onAppear { page = 1 } // 預設進入中間的配速頁面
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(Color.drvnDeepBlack.ignoresSafeArea())
        .overlay(alignment: .bottom) {
            HStack(spacing: 4) {
                // ⭐ 修改：這裡從 0..<3 改成 0..<4 對應四個頁面
                ForEach(0..<4, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(i == page ? Color.drvnPaper : Color.drvnPebble.opacity(0.3))
                        .frame(width: i == page ? 12 : 4, height: 2)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: page)
            .padding(.bottom, 3)
        }
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Page 1 · PACE as Hero
// ══════════════════════════════════════════════════════
struct PaceEditorialPage: View {
    @ObservedObject var manager: WatchWorkoutManager

    private var paceString: String {
        guard manager.currentPace > 0 else { return "0'00\"" }
        let total = Int(manager.currentPace * 60)
        return String(format: "%d'%02d\"", total / 60, total % 60)
    }

    var body: some View {
        VStack(spacing: 0) {
            // ── Editorial Header ──────────────────────
            Text("DRVN CARDIO LAB")
                .font(.custom("Helvetica Neue", size: 9))
                .fontWeight(.bold)
                .tracking(2.5)
                .foregroundColor(Color.drvnCoral) // Requested Coral
                .padding(.top, 16)
                .padding(.bottom, 12)

            // ── Hero: DISTANCE ────────────────────────
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(String(format: "%.2f", manager.distance / 1000))
                    .font(.custom("Helvetica Neue", size: 48))
                    .fontWeight(.light) // Requested thinner numbers
                    .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87))
                    .monospacedDigit()
                Text("KM")
                    .font(.custom("Helvetica Neue", size: 10))
                    .fontWeight(.regular)
                    .tracking(1)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66))
            }
            .lineLimit(1).minimumScaleFactor(0.5)
            .padding(.bottom, 4)

            // ── PACE ──────────────────────────────────
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(paceString)
                    .font(.custom("Helvetica Neue", size: 22))
                    .fontWeight(.light) // Requested thinner numbers
                    .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87))
                    .monospacedDigit()
                Text("/KM")
                    .font(.custom("Helvetica Neue", size: 9))
                    .fontWeight(.regular)
                    .tracking(0.5)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66))
            }
            .padding(.bottom, 8)

            // ── DURATION ──────────────────────────────
            Text(manager.elapsedFormatted)
                .font(.custom("Helvetica Neue", size: 20))
                .fontWeight(.light) // Requested thinner numbers
                .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87))
                .monospacedDigit()

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Color(red: 0.07, green: 0.07, blue: 0.07))
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Page 2 · HEART RATE as Hero
// ══════════════════════════════════════════════════════

/// ✨ Zone Ambient Glow — 手錶端四周發光，顏色依 hrZone
///   設計：細描邊 + 角落徑向漸層 + 呼吸動畫，不會壓住內容
struct WatchZoneAmbientGlow: View {
    let zone: HRZone
    let active: Bool          // 是否在跑步（idle 時隱藏）
    @State private var pulse: Bool = false

    var body: some View {
        ZStack {
            // 角落徑向光暈（極淡）
            if active {
                ZStack {
                    Circle()
                        .fill(zone.color.opacity(pulse ? 0.32 : 0.18))
                        .frame(width: 110, height: 110)
                        .blur(radius: 28)
                        .offset(x: -90, y: -110)
                    Circle()
                        .fill(zone.color.opacity(pulse ? 0.32 : 0.18))
                        .frame(width: 110, height: 110)
                        .blur(radius: 28)
                        .offset(x: 90, y: -110)
                    Circle()
                        .fill(zone.color.opacity(pulse ? 0.28 : 0.16))
                        .frame(width: 130, height: 130)
                        .blur(radius: 32)
                        .offset(x: -90, y: 130)
                    Circle()
                        .fill(zone.color.opacity(pulse ? 0.28 : 0.16))
                        .frame(width: 130, height: 130)
                        .blur(radius: 32)
                        .offset(x: 90, y: 130)
                }
                .allowsHitTesting(false)
            }

            // 邊框描邊（細，圓角貼合錶面）
            if active {
                RoundedRectangle(cornerRadius: 38, style: .continuous)
                    .stroke(zone.color.opacity(pulse ? 0.85 : 0.5), lineWidth: 1.2)
                    .blur(radius: 0.3)
                    .padding(1)
                    .allowsHitTesting(false)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}

struct HeartRateEditorialPage: View {
    @ObservedObject var manager: WatchWorkoutManager

    var body: some View {
        VStack(spacing: 0) {
            // ── Editorial Header ──────────────────────
            Text("HEART RATE ZONE")
                .font(.custom("Helvetica Neue", size: 9))
                .fontWeight(.bold)
                .tracking(2.5)
                .foregroundColor(Color.drvnCoral)
                .padding(.top, 16)
                .padding(.bottom, 16)

            // ── Hero: BPM ────────────────────────────
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(Int(manager.heartRate))")
                    .font(.custom("Helvetica Neue", size: 54))
                    .fontWeight(.bold)
                    .tracking(-1)
                    .foregroundColor(manager.hrZone.color) // Keep zone color for HR
                    .monospacedDigit()
                Text("BPM")
                    .font(.custom("Helvetica Neue", size: 12))
                    .fontWeight(.light)
                    .tracking(1.5)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66))
            }
            .lineLimit(1).minimumScaleFactor(0.5)
            .padding(.bottom, 4)

            // ── Current Zone Name ────────────────────
            Text(manager.hrZone.label)
                .font(.custom("Helvetica Neue", size: 16))
                .fontWeight(.bold)
                .tracking(1.5)
                .foregroundColor(manager.hrZone.color)
                .padding(.bottom, 4)

            // ── Current Score & Calories ─────────────────
            HStack(spacing: 12) {
                Text("\(manager.score) PTS")
                    .font(.custom("Helvetica Neue", size: 10))
                    .fontWeight(.bold)
                    .tracking(2)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66))
                    
                Text("·")
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66).opacity(0.5))
                    
                Text("\(Int(manager.activeCalories)) CAL")
                    .font(.custom("Helvetica Neue", size: 10))
                    .fontWeight(.bold)
                    .tracking(2)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66))
            }
            .padding(.bottom, 14)

            // ── Zone Distribution Bar ────────────────
            HStack(spacing: 4) {
                ForEach(0..<5) { i in
                    Rectangle()
                        .fill(i <= manager.hrZone.rawValue
                               ? manager.hrZone.color
                               : Color(white: 0.15))
                        .frame(height: 4)
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 24)

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Color(red: 0.07, green: 0.07, blue: 0.07))
        .overlay(
            // ✨ Zone-coloured ambient glow — only while actively running
            WatchZoneAmbientGlow(zone: manager.hrZone,
                                 active: manager.state == .running)
        )
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Page 3 · Controls
// ══════════════════════════════════════════════════════
struct CardioControlsPage: View {
    @ObservedObject var manager: WatchWorkoutManager
    @State private var confirmEnd = false

    var isPaused: Bool { manager.state == .paused }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Status line
            HStack {
                Rectangle().fill(Color(hex: "CFC6B8").opacity(0.15)).frame(height: 1) // Pebble
                Text(isPaused ? "PAUSED" : "LIVE")
                    .font(.custom("Helvetica Neue", size: 9))
                    .fontWeight(.bold)
                    .tracking(3)
                    .foregroundColor(isPaused ? Color(hex: "E4DED2").opacity(0.4) : Color(hex: "F95C4B")) // Stone vs Coral
                    .fixedSize()
                Rectangle().fill(Color(hex: "CFC6B8").opacity(0.15)).frame(height: 1) // Pebble
            }
            .padding(.horizontal, 10).padding(.bottom, 12)

            // Pause / Resume
            Button(action: {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                    isPaused ? manager.resumeWorkout() : manager.pauseWorkout()
                }
                WKInterfaceDevice.current().play(.click)
            }) {
                HStack(spacing: 8) {
                    Image(systemName: isPaused ? "play.fill" : "pause.fill")
                        .font(.system(size: 14, weight: .bold))
                    Text(isPaused ? "RESUME" : "PAUSE")
                        .font(.custom("Helvetica Neue", size: 16))
                        .fontWeight(.bold)
                        .tracking(1.5)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .drvnGlass(tint: isPaused ? Color(hex: "F95C4B") : Color(hex: "E4DED2"), corner: 18, light: !isPaused) // Coral : Stone
                .foregroundColor(isPaused ? Color(hex: "F6F4F1") : Color(hex: "161415")) // Paper : Deep Black
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10)

            Spacer().frame(height: 10)

            // End / Confirm (Animated Capsule Split)
            HStack(spacing: confirmEnd ? 8 : 0) {
                if confirmEnd {
                    // BACK Button
                    Button(action: { 
                        WKInterfaceDevice.current().play(.click)
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                            confirmEnd = false 
                        }
                    }) {
                        Text("BACK")
                            .font(.custom("Helvetica Neue", size: 13))
                            .fontWeight(.bold)
                            .tracking(1)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .drvnGlass(tint: Color(hex: "CFC6B8"), corner: 18, light: true) // Pebble
                            .foregroundColor(Color(hex: "161415")) // Deep Black
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .transition(.move(edge: .trailing).combined(with: .opacity))

                    // FINISH Button
                    Button(action: { 
                        WKInterfaceDevice.current().play(.stop)
                        manager.endWorkout() 
                    }) {
                        Text("FINISH")
                            .font(.custom("Helvetica Neue", size: 13))
                            .fontWeight(.bold)
                            .tracking(1)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .drvnGlass(tint: Color(hex: "D94030"), corner: 18, light: false) // Ember
                            .foregroundColor(Color(hex: "F6F4F1")) // Paper
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .transition(.move(edge: .leading).combined(with: .opacity))
                } else {
                    // END RUN Button
                    Button(action: { 
                        WKInterfaceDevice.current().play(.click)
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                            confirmEnd = true 
                        }
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "stop.fill").font(.system(size: 12))
                            Text("END RUN")
                                .font(.custom("Helvetica Neue", size: 15))
                                .fontWeight(.bold)
                                .tracking(1.5)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .drvnGlass(tint: Color(hex: "D94030").opacity(0.15), corner: 18, light: false) // Light Ember
                        .foregroundColor(Color(hex: "D94030")) // Ember
                        .clipShape(Capsule())
                        .overlay(
                            Capsule().stroke(Color(hex: "D94030").opacity(0.3), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)

            Spacer()
        }
        .background(Color.drvnDeepBlack.ignoresSafeArea())
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Run Mode Model
// ══════════════════════════════════════════════════════
struct RunMode: Identifiable {
    let id: String
    let label: String        // 中文名稱
    let sublabel: String     // 英文副標
    let description: String
    let icon: String         // SF Symbol
    let accentR: Double; let accentG: Double; let accentB: Double
    let tag: String?

    var accent: Color { Color(red: accentR, green: accentG, blue: accentB) }
}

// AI 計劃卡牌 — 名稱對齊網頁版微週期 (Microcycle) 術語，
// 每個卡牌種類給不同的 DRVN 暖調配色。
let runModes: [RunMode] = [
    // EASY — 輕鬆跑 · 青檸綠 (DCE6B2) 漸進指標色
    RunMode(id: "free",     label: "輕鬆跑",     sublabel: "EASY · 輕鬆",   description: "自由配速，低強度有氧基礎",      icon: "figure.run",             accentR: 0.862, accentG: 0.902, accentB: 0.698, tag: "EASY"),
    // RECOVERY — 恢復 · 鈦冰川藍 (5FA8E0)
    RunMode(id: "recovery", label: "恢復跑",     sublabel: "RECOVERY · 恢復", description: "低心率，加速乳酸代謝與肌肉恢復", icon: "arrow.triangle.2.circlepath", accentR: 0.373, accentG: 0.659, accentB: 0.878, tag: "20M"),
    // INTERVAL — 間歇 · 復古橘 (EC643A)
    RunMode(id: "interval", label: "間歇訓練",   sublabel: "INTERVAL · 間歇", description: "高低配速交替，提升最大攝氧量",   icon: "bolt.fill",              accentR: 0.925, accentG: 0.392, accentB: 0.227, tag: "30M"),
    // TEMPO/RACE — 配速 · Coral (F95C4B) 焦點
    RunMode(id: "race",     label: "配速競技",   sublabel: "TEMPO · 配速",   description: "目標配速鎖定，模擬比賽節奏",     icon: "gauge.with.needle",      accentR: 0.976, accentG: 0.361, accentB: 0.294, tag: "5K"),
    // LONG — 長距離 · 鈦質感綠 (3FA787)
    RunMode(id: "long",     label: "長距離",     sublabel: "LONG · 耐力",    description: "建立有氧基礎，穩定耐力訓練",     icon: "heart.fill",             accentR: 0.247, accentG: 0.655, accentB: 0.529, tag: "60M+"),
]

// ══════════════════════════════════════════════════════
// MARK: - Mode Row (Swiss Editorial Style)
// ══════════════════════════════════════════════════════
struct ModeSelectionRow: View {
    let mode: RunMode
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 0) {
                // 左側 accent 色條 — 卡牌種類識別
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(mode.accent)
                    .frame(width: 3.5)
                    .padding(.vertical, 12)
                    .padding(.leading, 8)

                VStack(alignment: .leading, spacing: 3) {
                    // Top: kicker sublabel + 種類 tag
                    HStack(spacing: 5) {
                        Text(mode.sublabel)
                            .font(.custom("Helvetica Neue", size: 9))
                            .fontWeight(.black)
                            .tracking(1.8)
                            .foregroundColor(mode.accent)
                        if let tag = mode.tag {
                            Text(tag)
                                .font(.custom("Helvetica Neue", size: 8))
                                .fontWeight(.black)
                                .tracking(0.5)
                                .padding(.horizontal, 5).padding(.vertical, 1.5)
                                .background(mode.accent.opacity(0.18))
                                .foregroundColor(mode.accent)
                                .clipShape(Capsule())
                        }
                    }
                    // Main: Chinese label
                    Text(mode.label)
                        .font(.custom("Helvetica Neue", size: 16))
                        .fontWeight(.bold)
                        .foregroundColor(.drvnPaper)
                        .tracking(0.5)
                }
                .padding(.leading, 11)
                .padding(.vertical, 13)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.drvnPebble.opacity(0.5))
                    .padding(.trailing, 16)
            }
            // Dark Liquid Glass 卡牌底 — 與圖四微週期卡一致的霧面玻璃
            .drvnGlass(tint: mode.accent.opacity(0.22), corner: 16)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(mode.accent.opacity(0.32), lineWidth: 0.7)
            )
        }
        .buttonStyle(.plain)
    }
}

struct CardioIdleView: View {
    @ObservedObject var manager: WatchWorkoutManager
    var onBack: () -> Void
    var onSelectMode: (String) -> Void
    /// 選了手機跑步計劃裡的某一堂
    var onSelectPlan: (RunPlan) -> Void = { _ in }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {

                // ── Header: Back button + Logotype ──
                HStack(alignment: .center, spacing: 12) {
                    Button(action: {
                        onBack()
                        WKInterfaceDevice.current().play(.click)
                    }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 28, height: 28)
                            .drvnGlass(tint: Color.white.opacity(0.12), corner: 18, light: false)
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 0) {
                        Text("DRVN")
                            .font(.custom("Helvetica Neue", size: 24))
                            .fontWeight(.black)
                            .tracking(3)
                            .foregroundColor(.drvnCoral)
                        Text("S T U D I O")
                            .font(.custom("Helvetica Neue", size: 9))
                            .fontWeight(.thin)
                            .tracking(6)
                            .foregroundColor(.white.opacity(0.6))
                            .offset(y: -2)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)

                Rectangle()
                    .fill(Color.drvnPebble.opacity(0.12))
                    .frame(height: 1)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 10)

                // ── 我的本週計劃（跟手機跑步計劃同一份）──
                if !manager.weekPlans.isEmpty {
                    Text("本週計劃 · 跟手機同步")
                        .font(.drvnBold(8))
                        .tracking(2)
                        .foregroundColor(.drvnCoral)
                        .padding(.horizontal, 10)
                        .padding(.bottom, 7)
                    VStack(spacing: 5) {
                        ForEach(manager.weekPlans) { item in
                            Button(action: { onSelectPlan(item.plan) }) {
                                HStack(spacing: 8) {
                                    Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(item.done ? Color(hex: "A8C99C") : .drvnPebble.opacity(0.7))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.title)
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundColor(item.done ? .drvnPaper.opacity(0.55) : .drvnPaper)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.8)
                                        Text(item.detail)
                                            .font(.system(size: 10, weight: .semibold))
                                            .foregroundColor(.drvnPebble.opacity(0.8))
                                            .lineLimit(1)
                                    }
                                    Spacer(minLength: 2)
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(.drvnPebble.opacity(0.5))
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .drvnGlass(tint: Color(hex: "F95C4B").opacity(item.done ? 0.06 : 0.16), corner: 16)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 12)
                } else if manager.weekPlansLoaded {
                    Text("手機還沒有排跑步計劃，先用下面的範本")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.drvnPebble.opacity(0.8))
                        .padding(.horizontal, 10)
                        .padding(.bottom, 10)
                }

                // ── Section label ──
                Text("範本 · 自由選擇")
                    .font(.drvnBold(7))
                    .tracking(2.5)
                    .foregroundColor(.drvnStone.opacity(0.8))
                    .padding(.horizontal, 10)
                    .padding(.bottom, 7)

                // ── Mode List ──
                VStack(spacing: 5) {
                    ForEach(runModes) { mode in
                        ModeSelectionRow(mode: mode) {
                            onSelectMode(mode.id)
                        }
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 16)
            }
        }
        .background(Color.drvnDeepBlack.ignoresSafeArea())
        .onAppear { manager.fetchWeekPlans() }
    }
}



struct CardioSummaryView: View {
    @ObservedObject var manager: WatchWorkoutManager
    @State private var showConfirmation = false

    // Average pace string: e.g. "5'30\""
    private var avgPaceString: String {
        let distKm = manager.distance / 1000
        guard distKm > 0, manager.elapsedSeconds > 0 else { return "0'00\"" }
        let totalSec = Int(Double(manager.elapsedSeconds) / distKm)
        return String(format: "%d'%02d\"", totalSec / 60, totalSec % 60)
    }

    var body: some View {
        ZStack {
            // ── Main Summary Page ──
            ScrollView {
                VStack(spacing: 0) {

                    // ── Header ────────────────────────────────────────
                    VStack(spacing: 2) {
                        Text("WORKOUT")
                            .font(.custom("Helvetica Neue", size: 9))
                            .fontWeight(.bold)
                            .tracking(4)
                            .foregroundColor(Color.drvnCoral)
                        Text("COMPLETE")
                            .font(.custom("Helvetica Neue", size: 28))
                            .fontWeight(.bold)
                            .tracking(-1)
                            .foregroundColor(.white)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 14)
                    .padding(.bottom, 12)

                    // ── Swiss Hairline ─────────────────────────────────
                    Rectangle()
                        .fill(Color.white.opacity(0.12))
                        .frame(height: 1)
                        .padding(.horizontal, 10)
                        .padding(.bottom, 10)

                    // ── Stats: SCORE (hero) ────────────────────────────
                    VStack(spacing: 1) {
                        Text("SCORE")
                            .font(.custom("Helvetica Neue", size: 8))
                            .fontWeight(.bold)
                            .tracking(2.5)
                            .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
                        Text("\(manager.score)")
                            .font(.custom("Helvetica Neue", size: 42))
                            .fontWeight(.bold)
                            .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                            .monospacedDigit()
                        Text("PTS")
                            .font(.custom("Helvetica Neue", size: 9))
                            .fontWeight(.bold)
                            .tracking(1.5)
                            .foregroundColor(Color.drvnCoral)
                    }
                    .padding(.bottom, 12)

                    // ── Swiss Hairline ─────────────────────────────────
                    Rectangle()
                        .fill(Color.white.opacity(0.12))
                        .frame(height: 1)
                        .padding(.horizontal, 10)
                        .padding(.bottom, 4)
                    // ── Stats Grid ────────────────────────────────────
                    VStack(spacing: 0) {
                        SummaryEditorialRow(label: "TIME",     value: manager.elapsedFormatted)
                        SummaryEditorialRow(label: "PACE",     value: avgPaceString + " /km")
                        SummaryEditorialRow(label: "DISTANCE", value: manager.distanceFormatted)
                        SummaryEditorialRow(label: "CAL",      value: "\(Int(manager.activeCalories)) kcal")
                        SummaryEditorialRow(label: "AVG HR",   value: "\(Int(manager.avgHeartRate)) BPM")
                    }
                    .padding(.horizontal, 10)

                    Spacer().frame(height: 16)

                    // ── DONE Button ───────────────────────────────────
                    Button(action: {
                        WKInterfaceDevice.current().play(.success)
                        withAnimation { showConfirmation = true }
                        // 手機開的那一趟由手機存檔；手錶再送一份會變成兩筆紀錄、跑鞋里程加兩次
                        if !manager.startedByPhone { manager.sendSummaryToPhone() }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                            manager.resetWorkout()
                        }
                    }) {
                        Text("DONE")
                            .font(.drvnBlack(14))
                            .tracking(2)
                            .frame(maxWidth: .infinity)
                            .frame(height: 42)
                            .drvnGlass(tint: Color.white, corner: 18, light: true)
                            .foregroundColor(.black)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 12)
                }
            }
            .background(Color(red: 0.07, green: 0.07, blue: 0.07).ignoresSafeArea())
            .opacity(showConfirmation ? 0 : 1)


            // ── Confirmation Screen ──
            if showConfirmation {
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.drvnCoral)
                        .symbolEffect(.bounce, value: showConfirmation)

                    VStack(spacing: 4) {
                        Text("DRVN STUDIO")
                            .font(.drvnBold(10))
                            .tracking(3)
                            .foregroundColor(.drvnStone)
                        Text("數據已存入")
                            .font(.drvnBlack(22))
                            .foregroundColor(.drvnPaper)
                    }

                    Rectangle()
                        .fill(Color.drvnCoral)
                        .frame(width: 40, height: 2)
                        .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.drvnDeepBlack.ignoresSafeArea())
                .transition(.asymmetric(insertion: .opacity, removal: .opacity))
            }
        }
    }
}

struct SummaryEditorialRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.custom("Helvetica Neue", size: 9))
                .fontWeight(.bold)
                .tracking(1.5)
                .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
            Spacer()
            Text(value)
                .font(.custom("Helvetica Neue", size: 14))
                .fontWeight(.light)
                .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
        }
        .padding(.vertical, 8)
        .overlay(
            Rectangle()
                .fill(Color.white.opacity(0.12)) // #FFFFFF point detail
                .frame(height: 1),
            alignment: .bottom
        )
    }
}

#Preview {
    CardioEditorialView(manager: WatchWorkoutManager())
}

// ══════════════════════════════════════════════════════
// MARK: - Coach Mode: Pace Tracking Page
// ══════════════════════════════════════════════════════
struct CoachPaceEditorialPage: View {
    @ObservedObject var manager: WatchWorkoutManager
    
    private var paceDelta: Double {
        guard manager.currentPace > 0 else { return 0 }
        return manager.currentPace * 60 - manager.targetPace 
    }
    
    private var deltaString: String {
        guard manager.currentPace > 0 else { return "+0:00" }
        let absDelta = Int(abs(paceDelta))
        let sign = paceDelta > 0 ? "+" : "-"
        return String(format: "%@%d:%02d", sign, absDelta / 60, absDelta % 60)
    }

    // 🪙 鈦三色配速判定（±10%）：太慢→鈦紅橘 / 太快→鈦冰川藍 / 達標→鈦質感綠
    //   paceDelta = 目前配速 − 目標配速（秒/km，正值＝較慢）；門檻＝目標的 10%
    private var paceColor: Color {
        guard manager.currentPace > 0, manager.targetPace > 0 else {
            return Color(red: 0.88, green: 0.88, blue: 0.87) // 無資料 → 冰川白
        }
        let tolerance = manager.targetPace * 0.1
        if paceDelta > tolerance { return .titaniumCoral }   // 太慢
        if paceDelta < -tolerance { return .titaniumGlacier } // 太快
        return .titaniumGreen                                 // 達標
    }

    var body: some View {
        VStack(spacing: 0) {
            // ── Editorial Header ──────────────────────
            Text("COACH MODE")
                .font(.custom("Helvetica Neue", size: 9))
                .fontWeight(.regular)
                .tracking(2.5)
                .foregroundColor(manager.state == .paused ? .gray : Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
                .padding(.top, 16)
                .padding(.bottom, 12)
                
            // ── Hero: CURRENT PACE ────────────────────
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(paceFormatted)
                    .font(.custom("Helvetica Neue", size: 48))
                    .fontWeight(.bold)
                    .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                    .monospacedDigit()
                Text("/KM")
                    .font(.custom("Helvetica Neue", size: 10))
                    .fontWeight(.light)
                    .tracking(1)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
            }
            .lineLimit(1).minimumScaleFactor(0.5)
            .padding(.bottom, 4)
            
            // ── Pace Delta ────────────────────────────
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(deltaString)
                    .font(.custom("Helvetica Neue", size: 22))
                    .fontWeight(.bold)
                    .foregroundColor(paceColor)
                    .monospacedDigit()
                Text("VS TARGET")
                    .font(.custom("Helvetica Neue", size: 9))
                    .fontWeight(.light)
                    .tracking(1)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66))
            }
            .padding(.bottom, 12)

            // ── Visual Gauge ──────────────────────────
            ZStack(alignment: .center) {
                Capsule()
                    .fill(Color.white.opacity(0.1))
                    .frame(height: 4)
                
                Rectangle()
                    .fill(Color.white.opacity(0.5))
                    .frame(width: 2, height: 10)
                
                Circle()
                    .fill(paceColor)
                    .frame(width: 8, height: 8)
                    .shadow(color: paceColor.opacity(0.6), radius: 4)
                    .offset(x: CGFloat(clamp(paceDelta, min: -40, max: 40) * 1.5))
            }
            .padding(.horizontal, 24)

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Color(red: 0.07, green: 0.07, blue: 0.07))
    }
    
    private var paceFormatted: String {
        guard manager.currentPace > 0 else { return "0'00\"" }
        let t = Int(manager.currentPace * 60)
        return String(format: "%d'%02d\"", t / 60, t % 60)
    }
    
    private func clamp(_ value: Double, min: Double, max: Double) -> Double {
        return Swift.max(min, Swift.min(max, value))
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Page 4 · Experimental Dashboard (For Fun)
// ══════════════════════════════════════════════════════
struct DashboardEditorialPage: View {
    @ObservedObject var manager: WatchWorkoutManager
    
    var paceString: String {
        guard manager.currentPace > 0 else { return "0'00\"" }
        let total = Int(manager.currentPace * 60)
        return String(format: "%d'%02d\"", total / 60, total % 60)
    }
    
    var body: some View {
        VStack {
            Text("LAB DASHBOARD")
                .font(.custom("Helvetica Neue", size: 9))
                .fontWeight(.bold)
                .tracking(2.5)
                .foregroundColor(Color.drvnStone)
                .padding(.top, 16)
                .padding(.bottom, 8)
            
            Spacer()
            
            // ── 黑底圓角卡片 (完美還原截圖的包裹感) ──
            ZStack {
                RoundedRectangle(cornerRadius: 36, style: .continuous)
                    .fill(Color.black)
                    .frame(width: 156, height: 156)
                
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        // 左上：心率 (對應截圖的橘紅色)
                        ConicalGauge(
                            value: manager.heartRate,
                            max: 200,
                            color: Color.drvnCoral,
                            label: "HR",
                            valueText: "\(Int(manager.heartRate))"
                        )
                        // 右上：配速 (對應截圖的淺白色)
                        ConicalGauge(
                            // 邏輯：配速越快 (數值越小) 環越滿，假設最慢底線為 10分/km
                            value: max(0, 10 - manager.currentPace),
                            max: 10,
                            color: Color.drvnPaper,
                            label: "PACE",
                            valueText: paceString
                        )
                    }
                    HStack(spacing: 12) {
                        // 左下：里程 (對應截圖的灰色)
                        ConicalGauge(
                            value: manager.distance / 1000,
                            max: 10, // 假設 10K 跑滿一圈
                            color: Color.drvnStone,
                            label: "KM",
                            valueText: String(format: "%.2f", manager.distance / 1000)
                        )
                        // 右下：時間 (對應截圖的深鐵灰)
                        ConicalGauge(
                            value: Double(manager.elapsedSeconds),
                            max: 3600, // 假設 1 小時跑滿一圈
                            color: Color(hex: "4A4E69"),
                            label: "TIME",
                            valueText: String(format: "%02d:%02d", (manager.elapsedSeconds % 3600) / 60, manager.elapsedSeconds % 60)
                        )
                    }
                }
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Color(red: 0.07, green: 0.07, blue: 0.07)) // 與其他頁面統一的極深灰背景
    }
}

// ── 錐形漸層微型儀表板 ──
struct ConicalGauge: View {
    let value: Double
    let max: Double
    let color: Color
    let label: String
    let valueText: String
    
    var fraction: Double {
        min(Swift.max(value / max, 0.0), 1.0)
    }
    
    var body: some View {
        ZStack {
            // 1. 底層暗色錐形 (建立截圖中的 3D 圓柱感)
            Circle()
                .fill(
                    AngularGradient(
                        gradient: Gradient(colors: [color.opacity(0.05), color.opacity(0.2)]),
                        center: .center,
                        startAngle: .degrees(-90),
                        endAngle: .degrees(270)
                    )
                )
                .frame(width: 56, height: 56)
            
            // 2. 數據填充錐形 (使用 mask 做進度裁切，保留錐形光影)
            Circle()
                .fill(
                    AngularGradient(
                        gradient: Gradient(colors: [color.opacity(0.3), color]),
                        center: .center,
                        startAngle: .degrees(-90),
                        endAngle: .degrees(270)
                    )
                )
                .mask(
                    Circle()
                        .trim(from: 0, to: fraction)
                        .rotationEffect(.degrees(-90))
                )
                .frame(width: 56, height: 56)
                // ⭐ 加入這行！讓數據變化時帶有高級的滑順阻尼感
                .animation(.spring(response: 0.6, dampingFraction: 0.8), value: fraction) 
            
            // 3. 中心挖空黑洞 (確保小數字高對比易讀)
            Circle()
                .fill(Color.black)
                .frame(width: 36, height: 36)
            
            // 4. 小數字與單位顯示
            VStack(spacing: -1) {
                Text(valueText)
                    .font(.custom("Helvetica Neue", size: 11))
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .monospacedDigit()
                Text(label)
                    .font(.custom("Helvetica Neue", size: 8))
                    .fontWeight(.medium)
                    .tracking(0.5)
                    .foregroundColor(Color.drvnStone.opacity(0.8))
            }
        }
    }
}
