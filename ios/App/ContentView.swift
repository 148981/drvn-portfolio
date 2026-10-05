import SwiftUI
import MapKit
import CoreMotion
import UIKit
import WebKit

@available(iOS 26.0, *)
struct ContentView: View {
    @StateObject private var bridge: HealthAppBridge

    init(bridge: HealthAppBridge = HealthAppBridge()) {
        _bridge = StateObject(wrappedValue: bridge)
    }

    var body: some View {
        ZStack {
            // Base layer: Prevent white background leaking on overscroll
            Color(red: 0.12, green: 0.16, blue: 0.23) // #1e293b to match night theme
                .ignoresSafeArea()

            // Level 1: THE WEBVIEW - Sole interaction layer
            WebView(bridgeManager: bridge)
                .ignoresSafeArea()
                .allowsHitTesting(true)

            // Level 2: LOADING OVERLAY & ERROR HANDLING
            if bridge.isLoading {
                DRVNLoadingView(progress: bridge.loadProgress) {
                    // logo 描邊動畫至少畫完一遍 → 通知 bridge。
                    // bridge 會在「網頁也載完」時才真正淡出載入畫面 (取較晚者)。
                    bridge.splashAnimationDone = true
                }
                    .transition(.asymmetric(
                        insertion: .opacity,
                        removal: .move(edge: .top).combined(with: .opacity)))
                    .zIndex(100)
            } else if let error = bridge.loadingError {
                ZStack {
                    Color.black.opacity(0.9)
                        .ignoresSafeArea()
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.system(size: 42, weight: .semibold))
                            .foregroundColor(.white)
                        Text("無法載入內容")
                            .font(.headline)
                            .foregroundColor(.white)
                        Text(error)
                            .font(.footnote)
                            .foregroundColor(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                        Button(action: { bridge.reload() }) {
                            Text("重新整理")
                                .font(.system(size: 16, weight: .semibold))
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(Color.white)
                                .foregroundColor(.black)
                                .cornerRadius(10)
                        }
                    }
                    .padding()
                }
                .transition(.opacity)
                .zIndex(100)
            }
        }
        .animation(.easeInOut(duration: 0.5), value: bridge.isLoading)
        .preferredColorScheme(.dark)
    }
}

// MARK: - DRVN animated launch identity
// Keep the opaque canvas until both the web content and the intro are ready.

@available(iOS 17.0, *)
struct DRVNLoadingView: View {
    /// 真實載入進度 0.0 ~ 1.0
    let progress: Double
    /// logo 描邊動畫至少完整畫完一遍後呼叫 (混合式收尾用)。
    var onAnimationComplete: () -> Void = {}

    /// logo 描邊動畫時長 — 這也是「保證畫完一遍」的最短載入畫面時間。
    private let logoDrawDuration: Double = 1.4

    @State private var logoDraw: CGFloat = 0        // logo 描邊動畫進度 0~1
    @State private var logoReveal: CGFloat = 0      // logo 整體淡入 + 微縮放 0~1
    @State private var textReveal: CGFloat = 0      // 字標 + 標語淡入 0~1
    @State private var frameReveal: CGFloat = 0     // 上下 masthead / footer 淡入 0~1
    @State private var sweep: CGFloat = 0           // 高光掃過字標 0~1
    @State private var displayProgress: Double = 0  // 平滑追蹤真實進度，避免跳動
    @State private var notifiedDone: Bool = false   // 避免重複回呼

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // ── 時尚品牌編輯視覺（Fashion Editorial Cover）──
    // 暖紙白畫布 + 近黑細字 + 唯一一點 Coral，像一本精品品牌的季刊封面。
    private let paper = Color(red: 0.965, green: 0.957, blue: 0.945)  // Paper #F6F4F1
    private let stone = Color(red: 0.894, green: 0.871, blue: 0.824)  // Stone #E4DED2
    private let ink = Color(red: 0.086, green: 0.078, blue: 0.082)    // Deep Black #161415
    private let coral = Color(red: 0.976, green: 0.361, blue: 0.294)  // Coral #F95C4B

    private var inkSoft: Color { ink.opacity(0.55) }
    private var inkFaint: Color { ink.opacity(0.34) }
    private var hairline: Color { ink.opacity(0.16) }

    // DRVN 字標 — 精品字標：細字重 + expanded + 大字距。
    // 逐字 runway 登場：每個字母像伸展台開場般依序從底線浮起，
    // 最後 Coral 句點以 spring 彈出 — 全畫面唯一的 Coral。
    @State private var lettersIn = false
    @State private var dotIn = false
    @State private var dotScaleX: CGFloat = 0.01
    @State private var dotScaleY: CGFloat = 0.01
    @State private var dotOffsetY: CGFloat = -18
    private let letters = ["D", "R", "V", "N"]

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    private var coralDotFill: LinearGradient {
        LinearGradient(colors: [.white.opacity(0.10), coral.opacity(0.16), coral.opacity(0.28)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    @ViewBuilder
    private var coralDotSurface: some View {
        if reduceTransparency {
            Circle().fill(coral).frame(width: 9, height: 9)
        } else if #available(iOS 26.0, *) {
            Circle().fill(coralDotFill)
                .frame(width: 9, height: 9)
                .glassEffect(.clear.tint(coral.opacity(0.12)), in: Circle())
        } else {
            Circle().fill(.ultraThinMaterial)
                .overlay(Circle().fill(coralDotFill))
                .frame(width: 9, height: 9)
        }
    }

    private var coralGlassDot: some View {
        coralDotSurface
            .overlay {
                if !reduceTransparency {
                    ZStack {
                        Circle().strokeBorder(coral.opacity(0.18), lineWidth: 0.35)
                        Circle().strokeBorder(
                            AngularGradient(colors: [.white.opacity(0.85), .cyan.opacity(0.32),
                                                     coral.opacity(0.22), .white.opacity(0.65),
                                                     .purple.opacity(0.28), .yellow.opacity(0.22),
                                                     .white.opacity(0.85)], center: .center),
                            lineWidth: 0.55)
                        Ellipse().fill(.white.opacity(0.65))
                            .frame(width: 2.4, height: 1.1)
                            .rotationEffect(.degrees(-35))
                            .offset(x: -1.6, y: -2)
                    }
                    .frame(width: 9, height: 9)
                }
            }
            // Reserve breathing room for the native glass rim on every side.
            .padding(3)
            .fixedSize()
    }

    private var wordmark: some View {
        HStack(alignment: .lastTextBaseline, spacing: 0) {
            ForEach(Array(letters.enumerated()), id: \.offset) { i, ch in
                Text(ch)
                    .font(.system(size: 58, weight: .light))
                    .fontWidth(.expanded)
                    .tracking(14)
                    .foregroundStyle(ink)
                    .opacity(lettersIn ? 1 : 0)
                    .offset(y: lettersIn ? 0 : 26)
                    .rotationEffect(.degrees(lettersIn ? 0 : 3), anchor: .bottomLeading)
                    .animation(
                        reduceMotion
                            ? .easeOut(duration: 0.25)
                            : .timingCurve(0.16, 1, 0.3, 1, duration: 0.7).delay(0.45 + Double(i) * 0.09),
                        value: lettersIn)
            }
            // The final punctuation lands only after the mark and wordmark settle.
            coralGlassDot
                .frame(width: 9, height: 9)
                .scaleEffect(x: dotScaleX, y: dotScaleY)
                .offset(x: -8, y: -6 + dotOffsetY)
                .opacity(dotIn ? 1 : 0)
        }
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // 畫布：不透明暖紙白（先鋪滿，載入中絕不透出底下的網頁導航），
                // 再疊一層底部微沉的 Stone 漸層（像紙張受光）。
                paper.ignoresSafeArea()
                LinearGradient(colors: [.clear, .clear, stone.opacity(0.55)],
                               startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()

                VStack(spacing: 0) {

                    // ── 刊頭已移除：splash 只保留中央 logo 主舞台 ──

                    Spacer()

                    // ── 主舞台：鳥型 logo 細線描繪 + 巨型字標 ──
                    VStack(spacing: 0) {
                        // 進場不是淡入，是「從後面衝到定位」：
                        // 從左後方帶著傾角滑進來，spring 收尾時有一點點過衝。
                        animatedLogo
                            .opacity(Double(logoReveal))
                            .scaleEffect(reduceMotion ? 1 : 0.88 + 0.12 * logoReveal)
                            .rotationEffect(.degrees(reduceMotion ? 0 : -6 * Double(1 - logoReveal)))
                            .offset(x: reduceMotion ? 0 : -22 * (1 - logoReveal),
                                    y: reduceMotion ? 0 : 10 * (1 - logoReveal))

                        Spacer().frame(height: 56)

                        // 字標 — 逐字 runway 登場（動畫在 wordmark 內部），
                        // 登場後一道柔光掃過（絲光，不是玻璃反光）
                        wordmark
                            .overlay(
                                GeometryReader { g in
                                    Rectangle()
                                        .fill(LinearGradient(
                                            colors: [.clear, Color.white.opacity(0.9), .clear],
                                            startPoint: .leading, endPoint: .trailing))
                                        .frame(width: 80)
                                        .rotationEffect(.degrees(18))
                                        .offset(x: sweep * (g.size.width + 180) - 100)
                                        .blendMode(.plusLighter)
                                }
                                .mask(wordmark)
                                .allowsHitTesting(false)
                            )

                        Spacer().frame(height: 22)

                        // 標語 — 微字級 + 超寬字距，兩側短 hairline 夾住（couture 細節）
                        HStack(spacing: 14) {
                            Rectangle().fill(hairline).frame(width: 28, height: 1)
                            Text("MOVE WITH INTENT.")
                                .font(.system(size: 10, weight: .medium))
                                .tracking(5.5)
                                .foregroundColor(inkSoft)
                            Rectangle().fill(hairline).frame(width: 28, height: 1)
                        }
                        .opacity(Double(textReveal))
                    }

                    Spacer()

                    // ── 版權欄 / LOADING 文字已移除：splash 只保留中央 logo 主舞台 ──
                }
            }
        }
        .task {
            playPremiumIntro()
            displayProgress = progress
            // Cancellation prevents a dismissed splash from firing an old completion callback.
            do {
                if reduceMotion {
                    withAnimation(.easeOut(duration: 0.2)) {
                        dotIn = true
                        dotScaleX = 1
                        dotScaleY = 1
                        dotOffsetY = 0
                    }
                    try await Task.sleep(for: .seconds(0.3))
                } else {
                    // Last letter settles at 1.42s; leave a short beat before the dot.
                    try await Task.sleep(for: .seconds(1.55))
                    guard !Task.isCancelled else { return }
                    withAnimation(.easeIn(duration: 0.11)) {
                        dotIn = true
                        dotScaleX = 0.76
                        dotScaleY = 1.28
                        dotOffsetY = 2
                    }
                    try await Task.sleep(for: .seconds(0.11))
                    withAnimation(.spring(response: 0.18, dampingFraction: 0.42)) {
                        dotScaleX = 1.22
                        dotScaleY = 0.80
                        dotOffsetY = -3
                    }
                    try await Task.sleep(for: .seconds(0.12))
                    withAnimation(.spring(response: 0.24, dampingFraction: 0.62)) {
                        dotScaleX = 1
                        dotScaleY = 1
                        dotOffsetY = 0
                    }
                    try await Task.sleep(for: .seconds(0.28))
                }
            } catch { return }
            guard !Task.isCancelled, !notifiedDone else { return }
            notifiedDone = true
            onAnimationComplete()
        }
        .onChange(of: progress) { _, newValue in
            withAnimation(.easeOut(duration: 0.45)) {
                displayProgress = newValue
            }
        }
    }

    @State private var motionStart = Date()
    // Two flowing strokes gather into the original mark; the surrounding layout stays fixed.
    private var animatedLogo: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: reduceMotion)) { timeline in
            let elapsed = max(0, timeline.date.timeIntervalSince(motionStart))
            let raw = min(1, max(0, (elapsed - 0.18) / 1.05))
            let gather = reduceMotion ? 1 : CGFloat(raw * raw * (3 - 2 * raw))
            let head = reduceMotion ? 1 : CGFloat(min(1, max(0, (elapsed - 0.85) / 0.4)))
            let colorSettle = reduceMotion ? 1 : min(1, max(0, (elapsed - 1.05) / 0.3))
            let t = CGFloat(max(0, elapsed - 1.4).truncatingRemainder(dividingBy: 3.6) / 3.6)
            ZStack {
                DRVNFlowingStroke(gather: gather, upper: true)
                    .stroke(ink, style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                DRVNFlowingStroke(gather: gather, upper: false)
                    .stroke(ink, style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                DRVNFlowingStroke(gather: gather, upper: false)
                    .stroke(coral, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                    .opacity(1 - colorSettle)
                DRVNBirdLogoHead(trim: head)
                    .stroke(ink, style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
                    .offset(y: -7 * (1 - head))
                if !reduceMotion && elapsed > 1.4 {
                    // A soft light band crosses the strokes together. Unlike trimming a
                    // disconnected path, it cannot jump between the upper and lower strokes.
                    let lightX = -0.45 + 1.9 * t
                    let light = LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0),
                            .init(color: coral.opacity(0.25), location: 0.22),
                            .init(color: coral, location: 0.5),
                            .init(color: coral.opacity(0.25), location: 0.78),
                            .init(color: .clear, location: 1),
                        ],
                        startPoint: UnitPoint(x: lightX - 0.22, y: 0.5),
                        endPoint: UnitPoint(x: lightX + 0.22, y: 0.5))
                    DRVNBirdLogo(trim: 1)
                        .stroke(light, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                        .opacity(min(1, (elapsed - 1.4) / 0.5))
                }
            }
            .frame(width: 170, height: 85)
        }
        .accessibilityHidden(true)
    }

    private func playPremiumIntro() {
        motionStart = Date()
        logoDraw = 0
        logoReveal = 0
        textReveal = 0
        frameReveal = 0
        sweep = 0

        lettersIn = false
        dotIn = false
        dotScaleX = 0.01
        dotScaleY = 0.01
        dotOffsetY = -18

        // ♿️ 減少動態：直接淡入到位，不描繪、不掃光（<0.3s）。
        if reduceMotion {
            withAnimation(.easeOut(duration: 0.3)) {
                logoReveal = 1.0; logoDraw = 1.0; textReveal = 1.0; frameReveal = 1.0
            }
            lettersIn = true
            return
        }

        DispatchQueue.main.async {
            // 1) logo 淡入 + 微縮放 settle
            withAnimation(.spring(response: 0.65, dampingFraction: 0.56)) {
                self.logoReveal = 1.0
            }
            // 2) 筆觸描繪
            withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: self.logoDrawDuration)) {
                self.logoDraw = 1.0
            }
            // 3) 字標逐字 runway 登場 + 標語浮現
            self.lettersIn = true
            withAnimation(.easeOut(duration: 0.55).delay(0.9)) {
                self.textReveal = 1.0
            }
            // 4) 刊頭 / 版權欄最後淡入（雜誌裝幀感：先看作品、再看版框）
            withAnimation(.easeOut(duration: 0.6).delay(0.7)) {
                self.frameReveal = 1.0
            }
            // 5) 絲光掃過字標
            withAnimation(.easeInOut(duration: 0.6).delay(0.85)) {
                self.sweep = 1.0
            }
        }
    }
}

// MARK: - 貫穿式尾燈進度條
// 循環播放，無端點點點，模擬網頁版的 CSS Keyframe 開合動畫
@available(iOS 17.0, *)
struct PenetratingTaillight: View, Animatable {
    var loopProgress: Double // 0~1 (4.5s cycle)
    let glow: Bool
    let coral: Color
    let track: Color

    var animatableData: Double {
        get { loopProgress }
        set { loopProgress = newValue }
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            
            // 模擬 web css (開合至手機最左側與最右側): 0% -> 0, 30% -> 100%, 60% -> 100%, 100% -> 0
            let litRatio: CGFloat = {
                if loopProgress < 0.3 {
                    return CGFloat((loopProgress / 0.3) * 1.0)
                } else if loopProgress < 0.6 {
                    return CGFloat(1.0)
                } else {
                    return CGFloat(1.0 * (1.0 - (loopProgress - 0.6) / 0.4))
                }
            }()
            
            let litOpacity: Double = {
                if loopProgress < 0.1 { return loopProgress / 0.1 }
                if loopProgress < 0.6 { return 1.0 }
                return 1.0 - (loopProgress - 0.6) / 0.4
            }()
            
            let lit = max(0, w * litRatio)
            
            ZStack {
                // 底軌 (整條暗線)
                Capsule()
                    .fill(track)
                    .frame(height: 1.5)

                // 中心向兩側開合的尾燈光帶 — 使用實色珊瑚紅，無端點漸變淡化，配上略微減弱的精緻霓虹光暈
                Capsule()
                    .fill(coral)
                    .frame(width: lit, height: 2.5)
                    .shadow(color: coral.opacity(glow ? 0.65 : 0.45), radius: 4)
                    .shadow(color: coral.opacity(glow ? 0.45 : 0.30), radius: 10)
                    .shadow(color: coral.opacity(glow ? 0.25 : 0.15), radius: 20)
                    .opacity(litOpacity)
            }
            .frame(width: w, height: geo.size.height, alignment: .center)
        }
    }
}


// The same Bézier topology as the original mark allows a continuous, exact landing.
private struct DRVNFlowingStroke: Shape {
    var gather: CGFloat
    let upper: Bool

    var animatableData: CGFloat {
        get { gather }
        set { gather = newValue }
    }

    func path(in rect: CGRect) -> Path {
        func point(_ ax: CGFloat, _ ay: CGFloat, _ bx: CGFloat, _ by: CGFloat) -> CGPoint {
            CGPoint(x: (ax + (bx - ax) * gather) * rect.width / 300,
                    y: (ay + (by - ay) * gather) * rect.height / 150)
        }
        var path = Path()
        if upper {
            path.move(to: point(-28, 108, 75, 46))
            path.addCurve(to: point(165, 64, 155, 40),
                          control1: point(30, 110, 90, 38),
                          control2: point(95, 68, 125, 36))
            path.addCurve(to: point(292, 54, 186, 76),
                          control1: point(212, 57, 180, 43),
                          control2: point(256, 53, 186, 60))
        } else {
            path.move(to: point(-28, 110, 90, 112))
            path.addCurve(to: point(100, 88, 135, 58),
                          control1: point(15, 114, 105, 102),
                          control2: point(62, 104, 118, 72))
            path.addCurve(to: point(205, 30, 182, 122),
                          control1: point(140, 68, 150, 44),
                          control2: point(171, 41, 170, 90))
            path.addCurve(to: point(276, 14, 228, 64),
                          control1: point(232, 18, 195, 155),
                          control2: point(256, 10, 204, 92))
        }
        return path
    }
}

// MARK: - DRVN 鳥型 logo 路徑 (完美復刻網頁版 viewBox 300x150)
struct DRVNBirdLogo: Shape {
    var trim: CGFloat   // 0~1 描邊進度

    var animatableData: CGFloat {
        get { trim }
        set { trim = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let sx = rect.width / 300
        let sy = rect.height / 150

        // 上半身: M 75,46 C 90,38 125,36 155,40 C 180,43 186,60 186,76
        p.move(to: CGPoint(x: 75 * sx, y: 46 * sy))
        p.addCurve(to: CGPoint(x: 155 * sx, y: 40 * sy),
                   control1: CGPoint(x: 90 * sx, y: 38 * sy),
                   control2: CGPoint(x: 125 * sx, y: 36 * sy))
        p.addCurve(to: CGPoint(x: 186 * sx, y: 76 * sy),
                   control1: CGPoint(x: 180 * sx, y: 43 * sy),
                   control2: CGPoint(x: 186 * sx, y: 60 * sy))

        // 下半身: M 90,112 C 105,102 118,72 135,58 C 150,44 170,90 182,122 C 195,155 204,92 228,64
        p.move(to: CGPoint(x: 90 * sx, y: 112 * sy))
        p.addCurve(to: CGPoint(x: 135 * sx, y: 58 * sy),
                   control1: CGPoint(x: 105 * sx, y: 102 * sy),
                   control2: CGPoint(x: 118 * sx, y: 72 * sy))
        p.addCurve(to: CGPoint(x: 182 * sx, y: 122 * sy),
                   control1: CGPoint(x: 150 * sx, y: 44 * sy),
                   control2: CGPoint(x: 170 * sx, y: 90 * sy))
        p.addCurve(to: CGPoint(x: 228 * sx, y: 64 * sy),
                   control1: CGPoint(x: 195 * sx, y: 155 * sy),
                   control2: CGPoint(x: 204 * sx, y: 92 * sy))

        return p.trimmedPath(from: 0, to: trim)
    }
}

// DRVN 鳥型 logo - Coral 流光描跡（一小段亮光沿完整筆畫循環滑行，會跨越終點 wrap 回起點）
struct DRVNBirdComet: Shape {
    var phase: CGFloat          // 0~1 流光目前位置
    var window: CGFloat = 0.14  // 流光長度（佔整條路徑比例）

    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let full = DRVNBirdLogo(trim: 1).path(in: rect)
        let start = phase
        let end = phase + window
        if end <= 1 {
            return full.trimmedPath(from: start, to: end)
        }
        // 跨越終點：尾段 + 從頭接上的一段
        var p = full.trimmedPath(from: start, to: 1)
        p.addPath(full.trimmedPath(from: 0, to: end - 1))
        return p
    }
}

// DRVN 鳥型 logo - 頭部圓圈
struct DRVNBirdLogoHead: Shape {
    var trim: CGFloat   // 0~1 描邊進度

    var animatableData: CGFloat {
        get { trim }
        set { trim = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let sx = rect.width / 300
        let sy = rect.height / 150
        
        // 頭部: cx="212" cy="52" r="10.5"
        let cx = 212 * sx
        let cy = 52 * sy
        let r = 10.5 * min(sx, sy)
        
        p.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
        return p.trimmedPath(from: 0, to: trim)
    }
}

// MARK: - 鈦金屬漸層
// SwiftUI 原生畫面無法用真正的 3D 金屬貼圖，改用「線性漸層」模擬
// 鈦金屬拋光的冷調反光：暗→亮銀→白高光→暗，斜向佈光。
enum TitaniumGradient {
    /// 深灰鈦金屬漸層 (logo 描邊用) — 整體壓暗的槍鐵色調，
    /// 仍保留中段一道亮高光做出拋光反光，但不是銀白色。
    static func darkMetal(isDark: Bool) -> LinearGradient {
        let stops: [Gradient.Stop] = isDark
            ? [   // 深色背景 — 深灰但提亮一階，避免糊進暗底
                .init(color: Color(red: 0.30, green: 0.31, blue: 0.34), location: 0.00),
                .init(color: Color(red: 0.52, green: 0.54, blue: 0.58), location: 0.30),
                .init(color: Color(red: 0.68, green: 0.70, blue: 0.74), location: 0.48),
                .init(color: Color(red: 0.40, green: 0.42, blue: 0.46), location: 0.64),
                .init(color: Color(red: 0.24, green: 0.25, blue: 0.28), location: 1.00),
            ]
            : [   // 淺色背景 — 深槍鐵灰，中段一道銀亮高光
                .init(color: Color(red: 0.16, green: 0.17, blue: 0.19), location: 0.00),
                .init(color: Color(red: 0.34, green: 0.35, blue: 0.39), location: 0.30),
                .init(color: Color(red: 0.62, green: 0.64, blue: 0.68), location: 0.48),
                .init(color: Color(red: 0.28, green: 0.29, blue: 0.33), location: 0.66),
                .init(color: Color(red: 0.12, green: 0.12, blue: 0.14), location: 1.00),
            ]
        return LinearGradient(gradient: Gradient(stops: stops),
                              startPoint: .topLeading,
                              endPoint: .bottomTrailing)
    }

    /// 珊瑚紅鈦金屬拉絲材質 (用於字標 "V" 的拋光拉絲質感)
    static var coralMetal: LinearGradient {
        let stops: [Gradient.Stop] = [
            .init(color: Color(red: 0.82, green: 0.22, blue: 0.12), location: 0.00), // 深珊瑚紅
            .init(color: Color(red: 1.00, green: 0.45, blue: 0.32), location: 0.30), // 陽極氧化金屬橘紅
            .init(color: Color(red: 1.00, green: 0.72, blue: 0.65), location: 0.48), // 金屬反光高光 (粉白橘)
            .init(color: Color(red: 0.95, green: 0.35, blue: 0.22), location: 0.66), // 飽和金屬紅
            .init(color: Color(red: 0.72, green: 0.18, blue: 0.08), location: 1.00), // 深部陰影
        ]
        return LinearGradient(gradient: Gradient(stops: stops),
                              startPoint: .topLeading,
                              endPoint: .bottomTrailing)
    }
}

// MARK: - 城市天際線 (直接解析網頁版 SVG Path)
struct Skyline: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let sx = rect.width / 400
        let sy = rect.height / 100
        
        let points: [(CGFloat, CGFloat)] = [
            (0,100), (0,85), (10,85), (10,70), (25,70), (25,60), (35,60), (35,80), (45,80), (45,50),
            (55,50), (55,40), (60,40), (60,30), (65,30), (65,50), (75,50), (75,75), (85,75), (85,45),
            (98,45), (98,80), (105,80), (105,65), (115,65), (115,96), (117,96), (123,76), (121,76),
            (121,72), (124,72), (127,48), (126,48), (126,45), (128,45), (129,25), (130,25), (131,25),
            (131,45), (133,45), (133,48), (132,48), (135,72), (138,72), (138,76), (136,76), (142,96),
            (144,96), (144,100), (148,100), (148,60), (160,60), (160,85), (172,85), (172,50), (180,50),
            (180,42), (195,42), (195,78), (205,78), (205,62), (215,62), (215,35), (220,35), (220,15),
            (223,15), (223,5), (225,15), (228,15), (228,35), (235,35), (235,82), (240,82), (240,76),
            (251,76), (249,71), (251,71), (249,66), (251,66), (249,61), (251,61), (249,56), (251,56),
            (249,51), (251,51), (249,46), (251,46), (249,41), (251,41), (249,36), (254,36), (254,28),
            (255,28), (255,20), (256,20), (256,28), (257,28), (257,36), (261,36), (259,41), (261,41),
            (259,46), (261,46), (259,51), (261,51), (259,56), (261,56), (259,61), (261,61), (259,66),
            (261,66), (259,71), (261,71), (259,76), (264,76), (264,82), (271,82), (276,82), (276,55),
            (282,55), (282,45), (295,45), (295,75), (305,75), (305,50), (315,50), (315,38), (325,38),
            (325,70), (335,70), (335,58), (348,58), (348,80), (360,80), (360,65), (370,65), (370,48),
            (385,48), (385,85), (398,85), (398,75), (400,75), (400,100)
        ]
        
        if let first = points.first {
            p.move(to: CGPoint(x: first.0 * sx, y: first.1 * sy))
            for i in 1..<points.count {
                p.addLine(to: CGPoint(x: points[i].0 * sx, y: points[i].1 * sy))
            }
            p.closeSubpath()
        }
        
        return p
    }
}

// MARK: - 背景方格
struct GridPattern: Shape {
    var spacing: CGFloat = 64
    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x: CGFloat = 0
        while x <= rect.width {
            p.move(to: CGPoint(x: x, y: 0))
            p.addLine(to: CGPoint(x: x, y: rect.height))
            x += spacing
        }
        var y: CGFloat = 0
        while y <= rect.height {
            p.move(to: CGPoint(x: 0, y: y))
            p.addLine(to: CGPoint(x: rect.width, y: y))
            y += spacing
        }
        return p
    }
}

// MARK: - DRVN 字標樣式 (鈦金屬填色)
private extension Text {
    func drvnWordmark<S: ShapeStyle>(_ style: S) -> some View {
        // 瑞士極簡但有設計感：San Francisco 粗體 + expanded 字寬，乾淨幾何感、近似 Manrope
        self.font(.system(size: 40, weight: .bold, design: .default))
            .fontWidth(.expanded)
            .tracking(2)
            .foregroundStyle(style)
    }
}

@available(iOS 26.0, *)
#Preview("Fitness App") {
    ContentView(bridge: HealthAppBridge.preview)
}

@available(iOS 17.0, *)
#Preview("Loading - 18%") {
    DRVNLoadingView(progress: 0.18)
}

@available(iOS 17.0, *)
#Preview("Loading - 72%") {
    DRVNLoadingView(progress: 0.72)
}
