import SwiftUI
import WatchKit
import WatchConnectivity

// MARK: - Local color aliases (DRVN design system)
private extension Color {
    static let coral  = Color.drvnEmber   // #D94030 — high-vis buttons on OLED black
    static let stone  = Color.drvnPebble  // #CFC6B8 — secondary labels
    static let cellBg = Color(white: 0.09)
    static let selBg  = Color(white: 0.15)
}

// ─────────────────────────────────────────────
// MARK: GymLoggingView (root)
// ─────────────────────────────────────────────
struct GymLoggingView: View {
    @StateObject private var gym = GymWorkoutManager()
    var onBack: () -> Void = {}

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch gym.screen {
            case .planSelect: PlanSelectionScreen(gym: gym, onBack: onBack)
            case .preview:    PlanPreviewScreen(gym: gym)
            case .logging:    GymSessionScreen(gym: gym)
            case .rest:       RestTimerScreen(gym: gym)
            case .done:       GymSummaryScreen(gym: gym)
            }
        }
    }
}

// ─────────────────────────────────────────────
// MARK: Plan Selection  (Editorial)
// ─────────────────────────────────────────────
struct PlanSelectionScreen: View {
    @ObservedObject var gym: GymWorkoutManager
    var onBack: () -> Void = {}
    @State private var chosen = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Magazine Header ──────────────────────────
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Button(action: { WKInterfaceDevice.current().play(.click); onBack() }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    .buttonStyle(.plain)
                    
                    Spacer()
                    
                    Text("DRVN")
                        .font(.custom("Helvetica Neue", size: 10))
                        .fontWeight(.black)
                        .tracking(3)
                        .foregroundColor(Color.drvnEmber)
                }
                .padding(.bottom, 6)

                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("SELECT")
                        .font(.custom("Helvetica Neue", size: 18))
                        .fontWeight(.thin)
                    Text("PLAN")
                        .font(.custom("Helvetica Neue", size: 18))
                        .fontWeight(.black)
                }
                .foregroundColor(.white)
                .tracking(0.5)
            }
            .padding(.horizontal, 10)
            .padding(.top, 2)
            .padding(.bottom, 10)

            // ── 空狀態：尚未同步到真計劃（不再顯示假的預設計劃）──────────
            if gym.availablePlans.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        Rectangle().fill(Color.white.opacity(0.12)).frame(height: 0.5)
                        Text("尚未同步計劃")
                            .font(.custom("Helvetica Neue", size: 15))
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                        Text("在手機打開 DRVN 產生訓練計劃後，手錶會自動同步。也可以先用通用範本開練（重量僅供參考）。")
                            .font(.custom("Helvetica Neue", size: 11))
                            .foregroundColor(.white.opacity(0.55))
                            .lineSpacing(2)
                        Button(action: {
                            WKInterfaceDevice.current().play(.click)
                            gym.fetchPlanFromAPI()
                            gym.requestGymPlan()
                        }) {
                            Text("重新同步")
                                .font(.custom("Helvetica Neue", size: 11)).fontWeight(.black).tracking(2)
                                .frame(maxWidth: .infinity).frame(height: 34)
                                .drvnGlass(tint: Color.drvnEmber, corner: 18, light: false).foregroundColor(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        Button(action: {
                            WKInterfaceDevice.current().play(.click)
                            gym.buildDefaultPlans()
                        }) {
                            Text("用通用範本開練")
                                .font(.custom("Helvetica Neue", size: 11)).fontWeight(.bold).tracking(1.5)
                                .frame(maxWidth: .infinity).frame(height: 34)
                                .drvnGlass(tint: Color.white.opacity(0.10), corner: 18, light: false).foregroundColor(.white.opacity(0.85))
                                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 10)
                    .padding(.top, 8)
                }
            } else {

            // ── Editorial List ──────────────────────────
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(gym.availablePlans.enumerated()), id: \.offset) { i, plan in
                        Button(action: { WKInterfaceDevice.current().play(.click); chosen = i }) {
                            VStack(alignment: .leading, spacing: 0) {
                                // Divider Line
                                Rectangle()
                                    .fill(Color.white.opacity(0.12))
                                    .frame(height: 0.5)

                                HStack(alignment: .center, spacing: 12) {
                                    // Index
                                    Text(String(format: "%02d", i + 1))
                                        .font(.custom("Helvetica Neue", size: 10))
                                        .fontWeight(.bold)
                                        .foregroundColor(chosen == i ? Color.drvnEmber : Color.white.opacity(0.3))
                                    
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(plan.label.uppercased())
                                            .font(.custom("Helvetica Neue", size: 16))
                                            .fontWeight(chosen == i ? .bold : .light)
                                            .foregroundColor(chosen == i ? .white : .white.opacity(0.7))
                                            .tracking(0.5)
                                        
                                        Text("\(plan.exercises.count) EXERCISES")
                                            .font(.custom("Helvetica Neue", size: 9))
                                            .fontWeight(.medium)
                                            .tracking(1)
                                            .foregroundColor(chosen == i ? Color.drvnEmber.opacity(0.8) : Color.white.opacity(0.3))
                                    }
                                    
                                    Spacer()
                                    
                                    if chosen == i {
                                        Circle()
                                            .fill(Color.drvnEmber)
                                            .frame(width: 4, height: 4)
                                    }
                                }
                                .padding(.vertical, 20)
                                .padding(.horizontal, 4)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    
                    // Final Closing Line
                    Rectangle()
                        .fill(Color.white.opacity(0.12))
                        .frame(height: 0.5)
                }
            }
            .padding(.horizontal, 10)

            // ── CTA Button ──────────────────────────────
            Button(action: {
                WKInterfaceDevice.current().play(.click)
                gym.previewPlanIndex = chosen
                gym.screen = .preview
            }) {
                Text("PREVIEW")
                    .font(.custom("Helvetica Neue", size: 11))
                    .fontWeight(.black)
                    .tracking(2)
                    .frame(maxWidth: .infinity)
                    .frame(height: 34)
                    .drvnGlass(tint: Color.drvnEmber, corner: 18, light: false)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            } // end if availablePlans.isEmpty else
        }
    }
}

// ─────────────────────────────────────────────
// MARK: Plan Preview Screen
// ─────────────────────────────────────────────
struct PlanPreviewScreen: View {
    @ObservedObject var gym: GymWorkoutManager

    private var plan: DayPlan? {
        guard gym.previewPlanIndex < gym.availablePlans.count else { return nil }
        return gym.availablePlans[gym.previewPlanIndex]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Magazine Header ──────────────────────────
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Button(action: { WKInterfaceDevice.current().play(.click); gym.screen = .planSelect }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    .buttonStyle(.plain)
                    
                    Spacer()
                    
                    Text("DRVN")
                        .font(.custom("Helvetica Neue", size: 10))
                        .fontWeight(.black)
                        .tracking(3)
                        .foregroundColor(Color.drvnEmber)
                }
                .padding(.bottom, 6)

                if let plan = plan {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("PLAN")
                            .font(.custom("Helvetica Neue", size: 18))
                            .fontWeight(.thin)
                        Text(plan.muscle.uppercased())
                            .font(.custom("Helvetica Neue", size: 18))
                            .fontWeight(.black)
                            .foregroundColor(Color.drvnEmber)
                    }
                    .foregroundColor(.white)
                    .tracking(0.5)
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 2)
            .padding(.bottom, 10)

            // ── Editorial Exercise List ──────────────────
            if let plan = plan {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(Array(plan.exercises.enumerated()), id: \.offset) { i, ex in
                            VStack(alignment: .leading, spacing: 0) {
                                // Hairline Divider
                                Rectangle()
                                    .fill(Color.white.opacity(0.12))
                                    .frame(height: 0.5)

                                HStack(alignment: .top, spacing: 12) {
                                    // Index
                                    Text(String(format: "%02d", i + 1))
                                        .font(.custom("Helvetica Neue", size: 10))
                                        .fontWeight(.bold)
                                        .foregroundColor(Color.drvnEmber)
                                        .padding(.top, 2)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(ex.name.uppercased())
                                            .font(.custom("Helvetica Neue", size: 12))
                                            .fontWeight(.bold)
                                            .foregroundColor(.white)
                                            .tracking(0.5)

                                        let setCount = ex.sets.count
                                        // 🔴 Fix(plan-parity)：優先顯示原始次數區間（如 "8-12"），與手機一致。
                                        let repsText = ex.repsLabel ?? "\(ex.sets.first?.reps ?? 10)"
                                        let weight = ex.sets.first?.weight ?? 0

                                        HStack(spacing: 6) {
                                            Text("\(setCount) SETS × \(repsText) REPS")
                                                .font(.custom("Helvetica Neue", size: 8))
                                                .fontWeight(.medium)
                                                .tracking(1)
                                                .foregroundColor(.white.opacity(0.4))
                                            
                                            if weight > 0 {
                                                Text("·")
                                                    .foregroundColor(.white.opacity(0.2))
                                                Text("\(String(format: "%.1f", weight)) KG")
                                                    .font(.custom("Helvetica Neue", size: 8))
                                                    .fontWeight(.black)
                                                    .foregroundColor(Color.drvnEmber.opacity(0.8))
                                            }
                                        }
                                    }
                                    Spacer()
                                }
                                .padding(.vertical, 14)
                                .padding(.horizontal, 4)
                            }
                        }
                        
                        // Final Divider
                        Rectangle()
                            .fill(Color.white.opacity(0.12))
                            .frame(height: 0.5)
                    }
                }
                .padding(.horizontal, 10)
            }

            // ── Start Button ─────────────────────────────
            Button(action: { 
                WKInterfaceDevice.current().play(.start)
                gym.startSession(planIndex: gym.previewPlanIndex) 
            }) {
                Text("START SESSION")
                    .font(.custom("Helvetica Neue", size: 11))
                    .fontWeight(.black)
                    .tracking(2)
                    .frame(maxWidth: .infinity)
                    .frame(height: 34)
                    .drvnGlass(tint: Color.drvnEmber, corner: 18, light: false)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
    }
}

// ─────────────────────────────────────────────
// MARK: Gym Session — 3-page TabView
// Pages: 0=Controls | 1=Logging | 2=Biometrics
// ─────────────────────────────────────────────
struct GymSessionScreen: View {
    @ObservedObject var gym: GymWorkoutManager
    @State private var page = 1

    var body: some View {
        TabView(selection: $page) {
            ControlsPage(gym: gym).tag(0)
            LoggingPage(gym: gym).tag(1)
            BiometricsPage(gym: gym).tag(2)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .overlay(alignment: .bottom) {
            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(i == page ? Color.drvnCoral : Color.drvnPebble.opacity(0.35))
                        .frame(width: i == page ? 5 : 4, height: i == page ? 5 : 4)
                }
            }
            .padding(.bottom, 4)
            .animation(.easeInOut(duration: 0.2), value: page)
        }
    }
}

// ─────────────────────────────────────────────
// MARK: Page 2 — Biometrics (Swiss DRVN style)
// ─────────────────────────────────────────────
struct BiometricsPage: View {
    @ObservedObject var gym: GymWorkoutManager

    var hrZoneColor: Color {
        let pct = gym.heartRate / 185
        switch pct {
        case ..<0.60: return Color.drvnStone
        case ..<0.75: return Color(red: 0.15, green: 0.60, blue: 1.0)
        case ..<0.87: return Color(red: 1.0,  green: 0.82, blue: 0.20)
        default:      return Color.drvnCoral
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // ── TIME ─────────────────────────────────────
            VStack(spacing: 0) {
                Text("TIME")
                    .font(.custom("Helvetica Neue", size: 9))
                    .fontWeight(.bold)
                    .tracking(2.5)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
                Text(gym.elapsedFormatted)
                    .font(.custom("Helvetica Neue", size: 42))
                    .fontWeight(.thin)
                    .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                    .monospacedDigit()
            }
            .padding(.top, 14)

            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(height: 0.5)
                .padding(.horizontal, 12).padding(.vertical, 8)

            // ── HEART RATE + CALORIES ─────────────────────
            HStack(spacing: 0) {
                VStack(spacing: 2) {
                    Text("HEART RATE")
                        .font(.custom("Helvetica Neue", size: 8))
                        .fontWeight(.bold)
                        .tracking(1.5)
                        .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        Text("\(Int(gym.heartRate))")
                            .font(.custom("Helvetica Neue", size: 28))
                            .fontWeight(.light)
                            .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                        Text("BPM")
                            .font(.custom("Helvetica Neue", size: 8))
                            .fontWeight(.bold)
                            .tracking(1)
                            .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66).opacity(0.8))
                    }
                }
                .frame(maxWidth: .infinity)

                Rectangle()
                    .fill(Color.white.opacity(0.12))
                    .frame(width: 0.5).padding(.vertical, 6)

                VStack(spacing: 2) {
                    Text("CALORIES")
                        .font(.custom("Helvetica Neue", size: 8))
                        .fontWeight(.bold)
                        .tracking(1.5)
                        .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        Text(String(format: "%.0f", gym.activeCalories))
                            .font(.custom("Helvetica Neue", size: 28))
                            .fontWeight(.light)
                            .foregroundColor(Color.drvnCoral) // Keep Coral for active metabolic data
                        Text("KCAL")
                            .font(.custom("Helvetica Neue", size: 8))
                            .fontWeight(.bold)
                            .tracking(1)
                            .foregroundColor(Color.drvnCoral.opacity(0.8))
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 8)

            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(height: 0.5)
                .padding(.horizontal, 12).padding(.vertical, 8)

            // ── 耗力 · EFFORT ──────────────────────────────
            HStack {
                Text("耗力 · EFFORT")
                    .font(.custom("Helvetica Neue", size: 8))
                    .fontWeight(.bold)
                    .tracking(1.5)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
                
                Spacer()
                
                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text("\(gym.avgEffortScore)")
                        .font(.custom("Helvetica Neue", size: 32))
                        .fontWeight(.bold)
                        .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                    Text("PTS")
                        .font(.custom("Helvetica Neue", size: 9))
                        .fontWeight(.bold)
                        .tracking(1)
                        .foregroundColor(Color.drvnCoral)
                }
            }
            .padding(.horizontal, 12)

            Spacer()
        }
    }
}

// ─────────────────────────────────────────────
// MARK: Page 1 — Immersive Logging (Dual-State)
// ─────────────────────────────────────────────
struct LoggingPage: View {
    @ObservedObject var gym: GymWorkoutManager

    enum Field { case weight, reps, rpe }
    @State private var focused: Field = .weight
    @FocusState private var crownActive: Bool

    @State private var crownWeight: Double = 60.0
    @State private var crownReps: Double = 10.0
    @State private var crownRPE: Double = 8.0

    var pct: Int { Int(gym.progressFraction * 100) }

    // 🌟 升級版：心率氛圍燈顏色分級
    var auraColor: Color {
        let bpm = gym.heartRate
        if bpm > 150 { return Color.drvnEmber }       // 爆發/力竭：火紅餘燼
        if bpm > 120 { return Color.drvnCoral }       // 高強度發力：珊瑚紅
        if bpm > 90  { return Color(hex: "5D81BF") }  // 熱身/恢復：活力藍
        return Color.drvnPebble.opacity(0.5)          // 靜息：石灰
    }

    var body: some View {
        ZStack {
            // ── 沈浸狀態 (Lifting) ──
            if gym.isLifting {
                // 🌟 邊緣氛圍燈 (Ambient Light)
                ZStack {
                    Color.black.ignoresSafeArea()
                    
                    RadialGradient(
                        gradient: Gradient(colors: [auraColor.opacity(0.0), auraColor.opacity(0.4)]),
                        center: .center,
                        startRadius: 30,
                        endRadius: 110 // 暈染到手錶邊緣
                    )
                    .ignoresSafeArea()
                    // 讓氛圍燈的呼吸頻率與真實心跳同步 (60秒 / 心率 = 每次心跳秒數)
                    .scaleEffect(gym.heartRate > 90 ? 1.08 : 1.0)
                    .animation(
                        .easeInOut(duration: 60.0 / max(gym.heartRate, 60.0))
                        .repeatForever(autoreverses: true),
                        value: gym.heartRate
                    )
                }

                VStack(spacing: 0) {
                    Spacer()
                    
                    VStack(spacing: 4) {
                        Text("FOCUS")
                            .font(.custom("Helvetica Neue", size: 10))
                            .fontWeight(.bold)
                            .tracking(4)
                            .foregroundColor(auraColor.opacity(0.8))
                        
                        // 極簡巨大心率
                        Text(gym.heartRate > 0 ? "\(Int(gym.heartRate))" : "--")
                            .font(.system(size: 76, weight: .ultraLight, design: .default))
                            .foregroundColor(.white)
                            .monospacedDigit()
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                    }
                    
                    Spacer()
                    
                    // 🌟 新增：盲操作提示字
                    Text("TAP TO SWITCH")
                        .font(.custom("Helvetica Neue", size: 9))
                        .fontWeight(.bold)
                        .tracking(2)
                        .foregroundColor(Color.white.opacity(0.25))
                        .padding(.bottom, 8)
                }
                .transition(.opacity.combined(with: .scale(scale: 1.05)))
            } 
            // ── 儀表板狀態 (Resting / Setup) ──
            else {
                dashboardView
                    .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }
        }
        // 點擊全螢幕切換狀態 (盲操作)
        .onTapGesture {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                gym.isLifting.toggle()
                WKInterfaceDevice.current().play(.click)
            }
        }
    }

    // 將原本 LoggingPage 的內容抽出來變成一個 sub-view
    private var dashboardView: some View {
        VStack(spacing: 0) {
            // ── Progress bar + percentage ─────────────────
            HStack(spacing: 5) {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(Color(hex: "161415")) // Deep Black
                        Rectangle().fill(Color(hex: "F95C4B")) // Coral
                            .frame(width: g.size.width * gym.progressFraction)
                            .animation(.easeInOut(duration: 0.4), value: gym.progressFraction)
                    }
                }
                .frame(height: 2)
                .clipShape(Capsule())

                Text("\(pct)%")
                    .font(.custom("Helvetica Neue", size: 9))
                    .fontWeight(.bold)
                    .foregroundColor(Color(hex: "F95C4B")) // Coral
                    .frame(width: 28, alignment: .trailing)
            }
            .padding(.horizontal, 6).padding(.top, 8)

            // ── ❤️ 心率 · 🔥 卡路里（即時生理數據）────────────────
            HStack(spacing: 0) {
                HStack(spacing: 3) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(gym.heartRate > 0 ? Color.drvnCoral : Color.drvnPebble.opacity(0.4))
                    Text(gym.heartRate > 0 ? "\(Int(gym.heartRate))" : "--")
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(gym.heartRate > 0 ? .white : Color.drvnPebble.opacity(0.4))
                    Text("BPM")
                        .font(.drvnFont(size: 8, weight: .heavy))
                        .foregroundColor(Color.drvnPebble.opacity(0.5))
                }
                .frame(maxWidth: .infinity)

                Rectangle()
                    .fill(Color.drvnPebble.opacity(0.2))
                    .frame(width: 0.5, height: 14)

                HStack(spacing: 3) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(gym.activeCalories > 0 ? Color.orange : Color.drvnPebble.opacity(0.4))
                    Text(gym.activeCalories > 0 ? "\(Int(gym.activeCalories))" : "--")
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(gym.activeCalories > 0 ? .white : Color.drvnPebble.opacity(0.4))
                    Text("KCAL")
                        .font(.drvnFont(size: 8, weight: .heavy))
                        .foregroundColor(Color.drvnPebble.opacity(0.5))
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 8)
            .padding(.top, 5)
            .padding(.bottom, 2)

            // ── SET · EXERCISE ────────────────────────────
            VStack(spacing: 2) {
                Text("SET \(gym.displaySet) · \(gym.totalSets)")
                    .font(.custom("Helvetica Neue", size: 10))
                    .fontWeight(.bold)
                    .tracking(2)
                    .foregroundColor(Color(hex: "E4DED2").opacity(0.6)) // Stone
                Text(gym.currentExercise?.name ?? "—")
                    .font(.custom("Helvetica Neue", size: 14))
                    .fontWeight(.bold)
                    .foregroundColor(Color(hex: "F6F4F1")) // Paper
                    .lineLimit(1).minimumScaleFactor(0.75)
                    .padding(.horizontal, 8)
            }
            .padding(.top, 2)

            Spacer(minLength: 2)

            // ── LAST SESSION 提示 (僅第一組顯示) ─────────────────
            if gym.setIndex == 0,
               let hist = gym.exerciseLastSession[gym.currentExercise?.name ?? ""],
               hist.weight > 0 {
                HStack(spacing: 4) {
                    Text("LAST")
                        .font(.custom("Helvetica Neue", size: 8))
                        .fontWeight(.bold)
                        .tracking(2)
                        .foregroundColor(Color(hex: "CFC6B8").opacity(0.5)) // Pebble
                    Spacer()
                    Text(String(format: "%.1f", hist.weight) + " kg")
                        .font(.custom("Helvetica Neue", size: 10))
                        .fontWeight(.regular)
                        .foregroundColor(Color(hex: "CFC6B8").opacity(0.85))
                    if hist.reps > 0 {
                        Text("× \(hist.reps)")
                            .font(.custom("Helvetica Neue", size: 10))
                            .fontWeight(.regular)
                            .foregroundColor(Color(hex: "CFC6B8").opacity(0.55))
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 2)
            }

            // ── KG / REPS / RPE cells ───────────────────────────
            HStack(spacing: 4) {
                // 1. 重量 (Weight)
                DataEntryCell(title: "KG",
                              value: String(format: "%.1f", gym.currentWeight),
                              isSelected: focused == .weight)
                .focusable()
                .digitalCrownRotation($crownWeight, from: 0, through: 300, by: 2.5,
                                      sensitivity: .medium, isContinuous: true,
                                      isHapticFeedbackEnabled: true)
                .onChange(of: crownWeight) { _, v in gym.currentWeight = v }
                .onAppear { crownWeight = gym.currentWeight }
                .onTapGesture { focused = .weight }

                // 2. 次數 (Reps)
                DataEntryCell(title: "REPS",
                              value: "\(gym.currentReps)",
                              isSelected: focused == .reps)
                .focusable()
                .digitalCrownRotation($crownReps, from: 1, through: 100, by: 1,
                                      sensitivity: .medium, isContinuous: true,
                                      isHapticFeedbackEnabled: true)
                .onChange(of: crownReps) { _, v in gym.currentReps = max(1, Int(v)) }
                .onAppear { crownReps = Double(gym.currentReps) }
                .onTapGesture { focused = .reps }

                // RPE 轉輪
                DataEntryCell(title: "RPE",
                              value: "\(String(format: "%g", gym.currentRPE))",
                              isSelected: focused == .rpe)
                .focusable()
                .digitalCrownRotation($crownRPE, from: 5, through: 10, by: 0.5,
                                      sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
                .onChange(of: crownRPE) { _, v in gym.currentRPE = v }
                .onTapGesture { focused = .rpe }
            }
            .focused($crownActive)
            .onAppear {
                crownWeight = gym.currentWeight
                crownReps   = Double(gym.currentReps)
                crownRPE    = gym.currentRPE
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { crownActive = true }
            }
            .onChange(of: gym.setIndex) { _, _ in
                crownWeight = gym.currentWeight
                crownReps   = Double(gym.currentReps)
                crownRPE    = gym.currentRPE
            }
            .onChange(of: gym.exerciseIndex) { _, _ in
                crownWeight = gym.currentWeight
                crownReps   = Double(gym.currentReps)
                crownRPE    = gym.currentRPE
            }
            .onChange(of: gym.currentWeight) { _, newVal in
                crownWeight = newVal
            }
            .onChange(of: gym.currentReps) { _, newVal in
                crownReps = Double(newVal)
            }
            .padding(.horizontal, 4)
            .frame(height: 70)

            Spacer(minLength: 4)

            // ── LOG SET ───────────────────────────────────
            Button(action: { WKInterfaceDevice.current().play(.success); gym.logCurrentSet() }) {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .bold))
                    Text("LOG SET")
                        .font(.custom("Helvetica Neue", size: 14))
                        .fontWeight(.bold)
                        .tracking(1)
                }
                .frame(maxWidth: .infinity).frame(height: 48)
                .drvnGlass(tint: Color(hex: "F95C4B"), corner: 18, light: false) // Coral
                .foregroundColor(Color(hex: "F6F4F1")) // Paper text
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 6).padding(.bottom, 14)
        }
    }
}

// ─────────────────────────────────────────────
// MARK: Page 0 — Controls
// ─────────────────────────────────────────────
struct ControlsPage: View {
    @ObservedObject var gym: GymWorkoutManager
    @State private var confirmEnd = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Status line
            HStack {
                Rectangle().fill(Color(hex: "CFC6B8").opacity(0.15)).frame(height: 1) // Pebble
                Text(gym.isPaused ? "PAUSED" : "LIVE")
                    .font(.custom("Helvetica Neue", size: 9))
                    .fontWeight(.bold)
                    .tracking(3)
                    .foregroundColor(gym.isPaused ? Color(hex: "E4DED2").opacity(0.4) : Color(hex: "F95C4B")) // Stone vs Coral
                    .fixedSize()
                Rectangle().fill(Color(hex: "CFC6B8").opacity(0.15)).frame(height: 1) // Pebble
            }
            .padding(.horizontal, 10).padding(.bottom, 12)

            // Pause / Resume
            Button(action: {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                    gym.isPaused ? gym.resumeSession() : gym.pauseSession()
                }
                WKInterfaceDevice.current().play(.click)
            }) {
                HStack(spacing: 8) {
                    Image(systemName: gym.isPaused ? "play.fill" : "pause.fill")
                        .font(.system(size: 14, weight: .bold))
                    Text(gym.isPaused ? "RESUME" : "PAUSE")
                        .font(.custom("Helvetica Neue", size: 16))
                        .fontWeight(.bold)
                        .tracking(1.5)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .drvnGlass(tint: gym.isPaused ? Color(hex: "F95C4B") : Color(hex: "E4DED2"), corner: 18, light: !gym.isPaused) // Coral : Stone
                .foregroundColor(gym.isPaused ? Color(hex: "F6F4F1") : Color(hex: "161415")) // Paper : Deep Black
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
                        gym.endSession() 
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
                    // END WORKOUT Button
                    Button(action: { 
                        WKInterfaceDevice.current().play(.click)
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                            confirmEnd = true 
                        }
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "stop.fill").font(.system(size: 12))
                            Text("END WORKOUT")
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
        .background(Color(hex: "161415").ignoresSafeArea()) // Deep Black
    }
}

// ─────────────────────────────────────────────
// MARK: DataEntryCell
// ─────────────────────────────────────────────
struct DataEntryCell: View {
    let title: String; let value: String; let isSelected: Bool
    var body: some View {
        VStack(spacing: 3) {
            Text(title)
                .font(.custom("Helvetica Neue", size: 10))
                .fontWeight(.bold)
                .tracking(1.5)
                .foregroundColor(isSelected ? Color(hex: "F95C4B") : Color(hex: "E4DED2").opacity(0.5)) // Coral vs Stone
            Text(value)
                .font(.custom("Helvetica Neue", size: 28))
                .fontWeight(.medium)
                .foregroundColor(isSelected ? Color(hex: "F6F4F1") : Color(hex: "F6F4F1").opacity(0.4)) // Paper
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(isSelected ? Color(hex: "161415") : Color(hex: "161415").opacity(0.4)) // Deep Black
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(isSelected ? Color(hex: "F95C4B").opacity(0.6) : Color.clear, lineWidth: 1.5))
        .animation(.easeInOut(duration: 0.18), value: isSelected)
    }
}

// ─────────────────────────────────────────────
// MARK: Rest Timer Screen
// ─────────────────────────────────────────────
struct RestTimerScreen: View {
    @ObservedObject var gym: GymWorkoutManager
    @State private var glow = false
    var progress: Double { Double(gym.restRemaining) / Double(max(1, gym.totalRestSeconds)) }
    var glowColor: Color { progress > 0.4 ? Color.drvnStone : Color.drvnEmber }

    var body: some View {
        ZStack {
            Circle().fill(glowColor.opacity(0.07)).frame(width: 130, height: 130)
                .scaleEffect(glow ? 1.18 : 0.9).blur(radius: 18)
                .animation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true), value: glow)

            VStack(spacing: 0) {
                Text("REST")
                    .font(.drvnFont(size: 10, weight: .heavy)).tracking(4)
                    .foregroundColor(Color.drvnPebble).padding(.top, 14)
                Spacer()
                ZStack {
                    Circle().stroke(Color(white: 0.13), lineWidth: 4).frame(width: 90, height: 90)
                    Circle().trim(from: 0, to: progress)
                        .stroke(glowColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .frame(width: 90, height: 90).rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 1), value: progress)
                    VStack(spacing: 1) {
                        Text("\(gym.restRemaining)")
                            .font(.system(size: 34, weight: .thin, design: .monospaced)).foregroundColor(.white)
                        Text("SEC")
                            .font(.drvnFont(size: 8, weight: .heavy)).tracking(2)
                            .foregroundColor(Color.drvnPebble)
                    }
                }
                Spacer()
                if let ex = gym.currentExercise {
                    Text("NEXT · \(ex.name)")
                        .font(.drvnFont(size: 9, weight: .regular)).tracking(1)
                        .foregroundColor(Color.drvnPebble).lineLimit(1).minimumScaleFactor(0.7)
                        .padding(.horizontal, 10)
                }
                Button(action: { WKInterfaceDevice.current().play(.click); gym.skipRest() }) {
                    Text("SKIP")
                        .font(.drvnFont(size: 10, weight: .heavy)).tracking(2)
                        .foregroundColor(Color.drvnPebble.opacity(0.5))
                        .padding(.vertical, 8).frame(maxWidth: .infinity)
                        .overlay(RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.drvnPebble.opacity(0.18), lineWidth: 0.5))
                }
                .buttonStyle(.plain).padding(.horizontal, 12).padding(.bottom, 8)
            }
        }
        .onAppear { glow = true }
    }
}

// ─────────────────────────────────────────────
// MARK: Summary Screen
// ─────────────────────────────────────────────
struct GymSummaryScreen: View {
    @ObservedObject var gym: GymWorkoutManager
    @State private var saved = false
    @State private var appear = false

    var totalDone: Int {
        gym.exercises.flatMap(\.sets).filter(\.completed).count
    }
    var volume: Double {
        gym.exercises.flatMap(\.sets).filter(\.completed)
            .reduce(0) { $0 + $1.weight * Double($1.reps) }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if saved {
                // ── Saved confirmation ────────────────────
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 40, weight: .thin))
                        .foregroundColor(Color.drvnCoral)
                        .scaleEffect(appear ? 1 : 0.3)
                        .animation(.spring(response: 0.4, dampingFraction: 0.6), value: appear)

                    VStack(spacing: 3) {
                        Text("已儲存到")
                            .font(.drvnFont(size: 10, weight: .heavy)).tracking(2)
                            .foregroundColor(Color.drvnPebble)
                        Text("DRVN")
                            .font(.custom("AvenirNext-Heavy", size: 24)).tracking(5)
                            .foregroundColor(.white)
                    }
                }
                .opacity(appear ? 1 : 0)
                .animation(.easeOut(duration: 0.3), value: appear)
                .onAppear { appear = true }

            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        // ── Compact Magazine Header ──────────────────
                        VStack(alignment: .leading, spacing: 0) {
                            Text("WORKOUT")
                                .font(.custom("Helvetica Neue", size: 9))
                                .fontWeight(.bold)
                                .tracking(3)
                                .foregroundColor(.drvnCoral)
                            
                            Text("SUCCESS")
                                .font(.custom("Helvetica Neue", size: 22))
                                .fontWeight(.thin)
                                .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                        }
                        .padding(.horizontal, 8)
                        .padding(.top, 18)

                        Spacer().frame(height: 12)

                        // ── Compact Stats Grid ───────────────────────
                        VStack(spacing: 0) {
                            GymSummaryRow(label: "DURATION", value: gym.elapsedFormatted, accent: .drvnSoftPearl)
                            GymSummaryRow(label: "SETS DONE", value: "\(totalDone)", accent: .drvnCrimson)
                            GymSummaryRow(label: "TOTAL VOLUME", value: String(format: "%.0f KG", volume), accent: .drvnWarmSand)
                            GymSummaryRow(label: "EFFORT SCORE", value: "\(gym.avgEffortScore) PTS", accent: .drvnCrimson)
                            GymSummaryRow(label: "CALORIES", value: String(format: "%.0f KCAL", gym.activeCalories), accent: .drvnSoftPearl)
                            GymSummaryRow(label: "AVG HR", value: gym.heartRate > 0 ? "\(Int(gym.heartRate)) BPM" : "—", accent: .drvnWarmSand)
                            
                            Rectangle()
                                .fill(Color.white.opacity(0.12))
                                .frame(height: 0.5)
                        }
                        .padding(.horizontal, 8)

                        Spacer().frame(height: 16)

                        // ── Compact Button ───────────────────────────
                        Button(action: { saveToDRVN() }) {
                            Text("DONE")
                                .font(.custom("Helvetica Neue", size: 10))
                                .fontWeight(.black)
                                .tracking(2)
                                .frame(maxWidth: .infinity)
                                .frame(height: 36)
                                .drvnGlass(tint: Color.white.opacity(0.1), corner: 18, light: false)
                                .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                                .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 8)
                        .padding(.bottom, 24)
                    }
                }
                .background(Color.black.ignoresSafeArea())
            }
        }
    }

    private func saveToDRVN() {
        WKInterfaceDevice.current().play(.success)

        let planMuscle: String = {
            guard gym.selectedPlanIndex < gym.availablePlans.count else { return "strength" }
            let m = gym.availablePlans[gym.selectedPlanIndex].muscle
            return m.isEmpty ? "strength" : m
        }()

        // ── 序列化 exercises（WCSession 只支援基本型別的字典陣列）──────────
        let exercisesArray: [[String: Any]] = gym.exercises.map { ex in
            let completedSets = ex.sets.filter { $0.completed }
            return [
                "name": ex.name,
                "sets": completedSets.map { s -> [String: Any] in
                    ["weight": s.weight, "reps": s.reps,
                     "rpe": s.rpe, "effortScore": s.effortScore,
                     "isPR": s.isPR, "completed": true]
                }
            ]
        }

        let payload: [String: Any] = [
            "type":        "GYM_DONE",
            "volume":      volume,
            "sets":        totalDone,
            "calories":    gym.activeCalories,
            "duration":    gym.elapsedSeconds,
            "heartRate":   gym.heartRate,
            "effortScore": gym.avgEffortScore,
            "muscle":      planMuscle,
            "exercises":   exercisesArray   // ← 新增：讓 iPhone 卡片能顯示動作明細
        ]

        // 手錶先自己存進後端；存成功就告訴手機「已存」，手機只負責顯示結算，不再存第二次
        //（以前兩邊都存 —— 手錶沒帶登入所以一直失敗，現在帶了，不改就會變兩筆）
        gym.saveWorkoutToBackend(muscle: planMuscle) { savedByWatch in
            var msg = payload
            msg["savedByWatch"] = savedByWatch
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(msg, replyHandler: nil) { _ in
                    WCSession.default.transferUserInfo(msg)
                }
            } else {
                WCSession.default.transferUserInfo(msg)
            }
        }

        withAnimation { saved = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            gym.screen = .planSelect
        }
    }
}

// ─────────────────────────────────────────────
// MARK: Summary Row
// ─────────────────────────────────────────────
struct GymSummaryRow: View {
    let label: String
    let value: String
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(height: 0.5)

            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .font(.custom("Helvetica Neue", size: 8))
                    .fontWeight(.bold)
                    .tracking(1.5)
                    .foregroundColor(Color(red: 0.47, green: 0.55, blue: 0.66)) // #778DA9
                
                Spacer()
                
                Text(value)
                    .font(.custom("Helvetica Neue", size: 13))
                    .fontWeight(.light)
                    .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
            }
            .padding(.vertical, 7)
            .padding(.horizontal, 2)
        }
    }
}
