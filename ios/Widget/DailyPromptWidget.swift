//
//  DailyPromptWidget.swift
//  RunWidget (Widget Extension)
//
//  🎴 DRVN 桌面小工具 v4.0 — 內容策展系統（小 / 中 / 大）
//  ═══════════════════════════════════════════════════════════
//  【內容型態規範】依時段與資料自動選擇，一次只講一件事：
//    · progress — 今日任務（預設主檔，09-19 時或有未完成任務）
//    · quote    — 運動員語錄（圖一風格整版大字：全完成 / 休息日 / 無資料 fallback）
//    · weather  — 天氣 × 運動建議（05-11 時且天氣快照 < 3 小時）
//    · deficit  — 金屬儀表：今日熱量（19 時後且有營養資料）
//    · league   — 段位邀請永遠只是 footer 一行 coral，不霸版
//
//  【日夜畫布】Timeline 在時段邊界自動換裝：
//    05-11 Mist 冷灰 #E8E9E6（亮畫布・墨字）
//    11-17 BrushedTi 亮銀拉絲 11.jpeg（亮畫布・墨字）
//    17-05 BrushedTiDark 暗黑拉絲 22.jpeg（暗畫布・紙白字）
//
//  【排版】大膽瑞士：整版敘事大字（灰×主字色×Coral 唯一彩色關鍵詞）、
//    tracked caps kicker、粗圓角分段條、平面硬派無光暈。
//
//  資料：App Group "group.com.mikeychen.DRVN.dev" key "dailyPromptWidget"
//  ⚠️ 編譯的是 ios/FitnessApp/RunWidget/ — 改完要同步兩個資料夾！
//

import WidgetKit
import SwiftUI

private let APP_GROUP = "group.com.mikeychen.DRVN.dev"
private let DATA_KEY = "dailyPromptWidget"

private extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }
    static let drvnPaper = Color(hex: 0xF6F4F1)
    static let drvnInk = Color(hex: 0x161415)
    static let drvnCoral = Color(hex: 0xF95C4B)
    static let drvnMist = Color(hex: 0xE8E9E6)
    static let drvnMint = Color(hex: 0x67D7B0)
    static let drvnSky = Color(hex: 0x65BCEB)
    static let drvnViolet = Color(hex: 0xA78BFA)
    static let drvnAmber = Color(hex: 0xF3B85B)
    // 🎨 Brand Gradients 色票（圖一）：事件提示卡的色塊背景
    static let drvnCoralBlock = Color(hex: 0xF0754E)   // 01 Coral
    static let drvnMystic     = Color(hex: 0xDFE9E9)   // 02 Mystic
    static let drvnCarnation  = Color(hex: 0xF95A4E)   // 03 Carnation
    static let drvnEbonyClay  = Color(hex: 0x1E2933)   // 04 Ebony Clay
}

// ═══ 資料模型 ═══════════════════════════════════════════════
struct WidgetTask: Codable, Identifiable {
    var id: String { label }
    let label: String
    let sub: String
    let cat: String
    let done: Bool
}
struct WidgetLeague: Codable { let pending: Bool; let label: String }
struct WidgetWeather: Codable { let tempC: Double; let rainPct: Double; let windKph: Double?; let fetchedAt: Double }
struct WidgetNutrition: Codable { let intakeKcal: Double; let targetKcal: Double? }
// 🔥 訓練連續（streakEngine v2）＋ 🎴 事件提示卡（streak / wrapup / kickoff）
struct WidgetStreak: Codable { let current: Int; let freezes: Int; let atRisk: Bool; let todayDone: Bool }
struct WidgetHint: Codable { let kind: String; let title: String; let sub: String }
struct WidgetRecentWorkout: Codable {
    let title: String; let value: String; let unit: String
    let detail: String; let performedAt: Double
}

struct DailyPromptData: Codable {
    let dayLabel: String
    let dayTitle: String
    let done: Int
    let total: Int
    let nextLabel: String
    let tasks: [WidgetTask]
    let league: WidgetLeague?
    let streakDays: Int
    let updatedAt: Double
    var weather: WidgetWeather?
    var nutrition: WidgetNutrition?
    var streak: WidgetStreak?
    var hint: WidgetHint?
    var recentWorkout: WidgetRecentWorkout?

    static let placeholder = DailyPromptData(
        dayLabel: "週一", dayTitle: "休息日",
        done: 0, total: 2, nextLabel: "記錄今天的飲食",
        tasks: [
            WidgetTask(label: "記錄今天的飲食", sub: "營養", cat: "nutrition", done: false),
            WidgetTask(label: "量第一筆 InBody", sub: "身體數據", cat: "inbody", done: false),
        ],
        league: nil, streakDays: 0, updatedAt: 0, weather: nil, nutrition: nil)

    static func load() -> DailyPromptData {
        guard let ud = UserDefaults(suiteName: APP_GROUP),
              let raw = ud.string(forKey: DATA_KEY),
              let data = raw.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(DailyPromptData.self, from: data)
        else { return .placeholder }
        return decoded
    }
}

// ═══ 日夜畫布 ═══════════════════════════════════════════════
enum DayPhase {
    case morning   // 05-11 warm pearl
    case midday    // 11-17 cool mineral
    case night     // 17-05 smoked glass

    static func at(_ date: Date) -> DayPhase {
        let h = Calendar.current.component(.hour, from: date)
        if h >= 5 && h < 11 { return .morning }
        if h >= 11 && h < 17 { return .midday }
        return .night
    }
    var isLight: Bool { self != .night }
    /// 主字色 / 次字色 / 弱字色
    var ink: Color {
        switch self {
        case .morning: return Color(hex: 0x30231F)
        case .midday: return Color(hex: 0x142936)
        case .night: return Color(hex: 0xF8F3EC)
        }
    }
    func ink(_ o: Double) -> Color { ink.opacity(o) }
    var base: Color {
        switch self {
        case .morning: return Color(hex: 0xF4E7DA)
        case .midday: return Color(hex: 0xDFEDF0)
        case .night: return Color(hex: 0x17191D)
        }
    }
}

private struct PhaseCanvas: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let phase: DayPhase
    let tint: Color
    let edgeAccent: Color

    // Resolve the time-of-day and content hue into one material tint, not layers.
    private var glassTint: Color {
        let base = UIColor(phase.base)
        let hue = UIColor(tint)
        var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
        var hr: CGFloat = 0, hg: CGFloat = 0, hb: CGFloat = 0, ha: CGFloat = 0
        base.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        hue.getRed(&hr, green: &hg, blue: &hb, alpha: &ha)
        let amount: CGFloat = phase.isLight ? 0.64 : 0.48
        return Color(red: Double(br + (hr - br) * amount),
                     green: Double(bg + (hg - bg) * amount),
                     blue: Double(bb + (hb - bb) * amount))
    }

    private func glassLight(_ amount: CGFloat) -> Color {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(glassTint).getRed(&r, green: &g, blue: &b, alpha: &a)
        return Color(red: Double(r + (1 - r) * amount),
                     green: Double(g + (1 - g) * amount),
                     blue: Double(b + (1 - b) * amount))
    }

    /// 夜間：不是一片平的藍，而是「深夜天空」—— 左上帶一點內容色的微光，往右下沉到近黑的墨藍。
    private var baseFill: LinearGradient {
        if phase == .night {
            // 深色煙燻玻璃：石墨黑為底，內容色只混 10%（看得出是哪種卡，但不搶戲）
            let top = mixColor(Color(hex: 0x151D30), tint, 0.68)
            return LinearGradient(stops: [
                .init(color: mixColor(top, .white, reduceTransparency ? 0 : 0.035), location: 0),
                .init(color: top, location: 0.34),
                .init(color: mixColor(top, edgeAccent, 0.24), location: 0.74),
                .init(color: mixColor(top, .black, 0.24), location: 1),
            ], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
        return LinearGradient(stops: [
            .init(color: glassLight(reduceTransparency ? 0 : 0.30), location: 0),
            .init(color: glassTint, location: 0.32),
            .init(color: mixColor(glassLight(reduceTransparency ? 0 : 0.12), edgeAccent, 0.22), location: 0.74),
            .init(color: glassTint, location: 1),
        ], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var body: some View {
        // Widget snapshots must contain actual color pixels. A clear view with
        // glassEffect alone renders white on the Home Screen on affected systems.
        ContainerRelativeShape()
            .fill(baseFill)
            .overlay {
                if phase == .night {
                    // 天空的深度：左上一團內容色的光，右下一抹紫，四角壓暗
                    ZStack {
                        RadialGradient(colors: [tint.opacity(0.12), .clear],
                                       center: .topLeading, startRadius: 0, endRadius: 260)
                        RadialGradient(colors: [.clear, Color.black.opacity(0.22)],
                                       center: .center, startRadius: 130, endRadius: 330)
                    }
                }
            }
            .overlay {
                if !reduceTransparency { FilmSheen(isLight: phase.isLight) }
            }
            .overlay {
                if !reduceTransparency && !phase.isLight {
                    // 深色玻璃：邊緣是暗的，只有上緣一條很細的冷光 —— 不再是白色玻璃蓋在深色上
                    ContainerRelativeShape().strokeBorder(
                        LinearGradient(stops: [
                            .init(color: .white.opacity(0.20), location: 0),
                            .init(color: .white.opacity(0.05), location: 0.35),
                            .init(color: .white.opacity(0.02), location: 0.7),
                            .init(color: .white.opacity(0.08), location: 1),
                        ], startPoint: .top, endPoint: .bottom),
                        lineWidth: 0.8)
                    ContainerRelativeShape().inset(by: 1).strokeBorder(Color.black.opacity(0.35), lineWidth: 1.5)
                        .blur(radius: 1)
                } else if !reduceTransparency {
                    // A narrow, softly refracted rim; the centre remains free of glow.
                    ContainerRelativeShape().inset(by: 1.5)
                        .strokeBorder(
                            AngularGradient(stops: [
                                .init(color: .clear, location: 0),
                                .init(color: Color(hex: 0x70D5E8).opacity(0.70), location: 0.12),
                                .init(color: .clear, location: 0.26),
                                .init(color: Color(hex: 0xE8BC73).opacity(0.56), location: 0.44),
                                .init(color: Color(hex: 0xA8596B).opacity(0.46), location: 0.53),
                                .init(color: .clear, location: 0.66),
                                .init(color: Color(hex: 0x9ADCEB).opacity(0.66), location: 0.84),
                                .init(color: .clear, location: 1),
                            ], center: .center), lineWidth: 2.8)
                        .blur(radius: 0.8)
                    ContainerRelativeShape().strokeBorder(
                        LinearGradient(colors: [.white.opacity(0.65), .white.opacity(0.08),
                                                tint.opacity(0.65), .white.opacity(0.42)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing),
                        lineWidth: 1.2)
                    ContainerRelativeShape().inset(by: 2).strokeBorder(
                        LinearGradient(colors: [.white.opacity(0.28), .clear, tint.opacity(0.22)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 4)
                        .blur(radius: 1.2)
                }
            }
        .clipShape(ContainerRelativeShape())
        .environment(\.colorScheme, phase.isLight ? .light : .dark)
    }
}

private func mixColor(_ a: Color, _ b: Color, _ t: CGFloat) -> Color {
    var ar: CGFloat = 0, ag: CGFloat = 0, ab: CGFloat = 0, aa: CGFloat = 0
    var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
    UIColor(a).getRed(&ar, green: &ag, blue: &ab, alpha: &aa)
    UIColor(b).getRed(&br, green: &bg, blue: &bb, alpha: &ba)
    return Color(red: Double(ar + (br - ar) * t), green: Double(ag + (bg - ag) * t), blue: Double(ab + (bb - ab) * t))
}

// ═══ 手繪感工具：固定亂數（每次畫出來一樣，不會每次刷新就抖動）═══════════
private struct SeededRNG {
    var state: UInt64
    init(seed: UInt64) { state = (seed &* 0x9E3779B97F4A7C15) | 1 }
    mutating func next() -> UInt64 {
        state ^= state << 13; state ^= state >> 7; state ^= state << 17
        return state
    }
    mutating func unit() -> CGFloat { CGFloat(next() % 10_000) / 10_000 }
    mutating func range(_ a: CGFloat, _ b: CGFloat) -> CGFloat { a + (b - a) * unit() }
}

/// 把折線點串成平滑的筆跡（中點二次曲線）
private func smoothPath(_ pts: [CGPoint]) -> Path {
    var p = Path()
    guard pts.count > 1 else { return p }
    p.move(to: pts[0])
    if pts.count == 2 { p.addLine(to: pts[1]); return p }
    for i in 1..<(pts.count - 1) {
        let mid = CGPoint(x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2)
        p.addQuadCurve(to: mid, control: pts[i])
    }
    p.addLine(to: pts[pts.count - 1])
    return p
}

/// 手畫的一筆線：微微起伏、不完全水平
private struct HandLine: Shape {
    var seed: UInt64
    var wobble: CGFloat = 0.9
    func path(in r: CGRect) -> Path {
        var rng = SeededRNG(seed: seed)
        let n = max(3, Int(r.width / 14))
        let tilt = rng.range(-wobble, wobble) * 0.6
        let pts = (0...n).map { i -> CGPoint in
            let t = CGFloat(i) / CGFloat(n)
            return CGPoint(x: r.minX + r.width * t,
                           y: r.midY + tilt * (t - 0.5) * 2 + rng.range(-wobble, wobble))
        }
        return smoothPath(pts)
    }
}

/// 手畫的圓圈：半徑不均勻，收筆稍微超過起點
private struct HandRing: Shape {
    var seed: UInt64
    func path(in r: CGRect) -> Path {
        var rng = SeededRNG(seed: seed)
        let c = CGPoint(x: r.midX, y: r.midY)
        let rad = min(r.width, r.height) / 2
        let start = rng.range(0, .pi * 2)
        let sweep = CGFloat.pi * 2 + 0.5
        let steps = 14
        let pts = (0...steps).map { i -> CGPoint in
            let t = CGFloat(i) / CGFloat(steps)
            let a = start + sweep * t
            let rr = rad * (1 + rng.range(-0.08, 0.08)) - t * rad * 0.08
            return CGPoint(x: c.x + cos(a) * rr, y: c.y + sin(a) * rr)
        }
        return smoothPath(pts)
    }
}

/// 手畫的勾
private struct HandCheck: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX + r.width * 0.06, y: r.minY + r.height * 0.52))
        p.addQuadCurve(to: CGPoint(x: r.minX + r.width * 0.38, y: r.minY + r.height * 0.88),
                       control: CGPoint(x: r.minX + r.width * 0.20, y: r.minY + r.height * 0.74))
        p.addQuadCurve(to: CGPoint(x: r.minX + r.width * 1.02, y: r.minY + r.height * 0.02),
                       control: CGPoint(x: r.minX + r.width * 0.58, y: r.minY + r.height * 0.40))
        return p
    }
}

/// 表面那層「薄膜」：斜向一道很淡的光＋細細的顆粒 —— 讓顏色不再是平的色塊
private struct FilmSheen: View {
    let isLight: Bool
    var body: some View {
        ZStack {
            LinearGradient(stops: [
                .init(color: .white.opacity(isLight ? 0.14 : 0.045), location: 0),
                .init(color: .clear, location: 0.42),
                .init(color: .white.opacity(isLight ? 0.04 : 0.015), location: 0.78),
                .init(color: .clear, location: 1),
            ], startPoint: .topLeading, endPoint: .bottomTrailing)
            Canvas { ctx, size in
                var rng = SeededRNG(seed: 7)
                let n = min(2200, Int(size.width * size.height / 70))
                let grain = (isLight ? Color.black : Color.white).opacity(isLight ? 0.025 : 0.02)
                for _ in 0..<n {
                    ctx.fill(Path(CGRect(x: rng.unit() * size.width, y: rng.unit() * size.height,
                                         width: 0.7, height: 0.7)), with: .color(grain))
                }
            }
        }
        .allowsHitTesting(false)
    }
}

private extension View {
    @ViewBuilder
    func drvnCanvas(_ phase: DayPhase, tint: Color, edgeAccent: Color) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) {
                PhaseCanvas(phase: phase, tint: tint, edgeAccent: edgeAccent)
            }
        } else {
            self.background(PhaseCanvas(phase: phase, tint: tint, edgeAccent: edgeAccent))
        }
    }
}

// ═══ 內容型態選擇（策展規則）════════════════════════════════
//  【一卡一訊息】每張卡只講一件事，各型態有自己專屬的設計語言：
//    league   = 黑卡會員卡（coral 細框 + 壓印字標，晉升未領取時獨佔）
//    deficit  = 金屬儀表
//    weather  = 巨大溫度字
//    progress = 大數字 + 分段條
//    quote    = 整版語錄
enum ContentKind { case league, progress, quote, weather, deficit, dashboard, reminder }

/// 黑卡保鮮期：晉升未領取時只獨佔「首次亮相後 2 小時」
private func leagueFresh(_ d: DailyPromptData) -> Bool {
    guard let lg = d.league, lg.pending else { return false }
    let ud = UserDefaults(suiteName: APP_GROUP)
    let key = "leagueShownAt:\(lg.label)"
    let now = Date().timeIntervalSince1970
    let shownAt = ud?.double(forKey: key) ?? 0
    if shownAt <= 0 { ud?.set(now, forKey: key); return true }
    return now - shownAt < 2 * 3600
}

/// 【v4.3 各尺寸各司其職】三張卡放在一起也不重複：
///   小卡 = 語錄海報（晨間偶爾換巨大溫度字）
///   中卡 = 時段輪替（進度主檔、晨間天氣、晚間熱量儀表）
///   大卡 = 今日總覽儀表板（顯示最多內容）
///   黑卡 = 三種尺寸共用的事件插播（2 小時保鮮）
func pickContent(_ d: DailyPromptData, at date: Date, family: WidgetFamily) -> ContentKind {
    let hasTasks = d.total > 0
    let allDone = hasTasks && d.done >= d.total
    let freshWeather = (d.weather != nil) &&
        (Date().timeIntervalSince1970 - (d.weather?.fetchedAt ?? 0) < 3 * 3600)
    let hasNutrition = (d.nutrition?.targetKcal ?? 0) > 0

    if leagueFresh(d) { return .league }

    // 🎴 事件提示卡：有 hint（streak 保衛戰 / 晚間收尾 / 週一開賽）時，
    //    在「對的時段」搶下中卡與小卡（大卡維持總覽，資訊量不犧牲）。
    //    kickoff 只佔早上、streak/wrapup 只佔 17 時後 — 平時不打擾。
    let hour = Calendar.current.component(.hour, from: date)
    let hintActive: Bool = {
        guard let h = d.hint, !h.title.isEmpty else { return false }
        switch h.kind {
        case "kickoff": return hour < 11
        case "streak", "wrapup": return hour >= 17
        default: return false
        }
    }()

    switch family {
    case .systemSmall:
        // 小卡固定「語錄海報」——但事件時刻讓位給提示卡（一次只講一件事）
        if hintActive { return .reminder }
        return .quote
    case .systemLarge:
        // 大卡固定「今日總覽儀表板」——空狀態也顯示「修復在今天發生」，不退語錄→與小卡不撞
        return .dashboard
    default:
        // 中卡以「營養/熱量」為主；事件提示卡優先於營養（保衛戰比熱量急）。
        if hintActive { return .reminder }
        if hasNutrition { return .deficit }
        if freshWeather { return .weather }
        if hasTasks && !allDone { return .progress }
        return .quote
    }
}

// ═══ 語錄庫（運動員語句・每 6 小時輪替）═════════════════════
private let QUOTES: [(zh: String, key: String, author: String)] = [
    // 🏃 跑步 / 馬拉松
    ("沒有人是極限。", "極限", "Eliud Kipchoge"),
    ("只有自律的人，才是自由的。", "自律", "Eliud Kipchoge"),
    ("不盡全力，就是辜負天賦。", "辜負天賦", "Steve Prefontaine"),
    ("鳥要飛，魚要游，人就是要跑。", "要跑", "Emil Zátopek"),
    ("痛苦難免，磨難可選。", "磨難可選", "村上春樹"),
    ("只要你有身體，你就是運動員。", "運動員", "Bill Bowerman"),
    ("我訓練四年，只為那九秒。", "九秒", "Usain Bolt"),
    // 💪 健身 / 健美
    ("力量不是來自勝利，而是來自你的掙扎。", "掙扎", "Arnold Schwarzenegger"),
    ("最後那三、四下，才讓肌肉真正生長。", "最後那三、四下", "Arnold Schwarzenegger"),
    ("每個人都想當健美選手，卻沒人想舉重。", "沒人想舉重", "Ronnie Coleman"),
    ("要刺激肌肉，而不是摧毀它。", "刺激", "Lee Haney"),
    ("運動是國王，營養是皇后。", "國王", "Jack LaLanne"),
    ("我不怕練過一萬種踢法的人，只怕把一種踢法練一萬次的人。", "一萬次", "Bruce Lee"),
    ("別祈求輕鬆的人生，要祈求扛得起的力量。", "扛得起", "Bruce Lee"),
    // 🏀 籃球
    ("我不斷失敗，這就是我成功的原因。", "成功的原因", "Michael Jordan"),
    ("你沒出手的球，百分之百不會進。", "不會進", "Wayne Gretzky"),
    ("如果你害怕失敗，你很可能就會失敗。", "害怕失敗", "Kobe Bryant"),
    ("你見過凌晨四點的洛杉磯嗎？", "凌晨四點", "Kobe Bryant"),
    // 🥊 拳擊
    ("現在受苦，餘生就當冠軍。", "冠軍", "Muhammad Ali"),
    ("別數日子，讓每一天都算數。", "算數", "Muhammad Ali"),
    ("每個人都有計劃，直到臉上挨一拳。", "挨一拳", "Mike Tyson"),
    // ⚽ 足球
    ("成功不是偶然，是努力與熱愛的累積。", "累積", "Pelé"),
    ("沒有努力，天賦什麼都不是。", "天賦", "Cristiano Ronaldo"),
    // 🎯 教練 / 綜合
    ("疲累，會讓所有人都變成懦夫。", "懦夫", "Vince Lombardi"),
    ("你不必很厲害才能開始，但你必須開始才會厲害。", "開始", "Zig Ziglar"),
    ("痛苦是暫時的，放棄是永遠的。", "放棄是永遠的", "Lance Armstrong"),
    ("紀律，等於自由。", "自由", "Jocko Willink"),
    ("當天賦不努力，努力就會擊敗天賦。", "擊敗天賦", "Tim Notke"),
    ("你永遠打不敗一個永不放棄的人。", "永不放棄", "Babe Ruth"),
    ("沒有奇蹟，只有累積。", "累積", "伊調馨"),
]
private func quoteOfNow(_ date: Date) -> (zh: String, key: String, author: String) {
    let bucket = Int(date.timeIntervalSince1970 / (6 * 3600))
    return QUOTES[bucket % QUOTES.count]
}

// 天氣 → 運動建議句
private func weatherLine(_ w: WidgetWeather) -> (advice: String, key: String) {
    if w.rainPct >= 50 { return ("適合進健身房把推力練透。", "健身房") }
    switch w.tempC {
    case ..<10: return ("先熱身兩倍長，再上大重量。", "熱身兩倍長")
    case 10..<17: return ("這溫度是長跑的黃金檔。", "長跑")
    case 17..<25: return ("最適合輕鬆跑的一天。", "輕鬆跑")
    case 25..<31: return ("挑清晨或傍晚跑，水帶夠。", "清晨或傍晚")
    default: return ("太熱了，今天練室內。", "室內")
    }
}

// 天氣 → 狀況詞（大卡除了溫度，也顯示天氣狀況）
private func weatherCond(_ w: WidgetWeather) -> String {
    if w.rainPct >= 60 { return "有雨" }
    if w.rainPct >= 30 { return "短暫雨" }
    switch w.tempC {
    case ..<10: return "寒冷"
    case 10..<17: return "微涼"
    case 17..<25: return "舒適"
    case 25..<31: return "溫暖"
    default: return "炎熱"
    }
}

// 小卡語錄：把第一句（首個「，」之前，含逗號）上 Coral 色，其餘用主字色。
private func quoteHeadColored(_ zh: String, phase: DayPhase) -> Text {
    // 中英文皆可斷句：首個「，。,.」之前（含標點）上 Coral，其餘主字色。
    let delims: Set<Character> = ["，", "。", ",", "."]
    if let idx = zh.firstIndex(where: { delims.contains($0) }) {
        let head = String(zh[...idx])
        let tail = String(zh[zh.index(after: idx)...])
        if tail.isEmpty { return Text(head).foregroundColor(.drvnCoral) }
        // iOS 26 起 Text 用「+」串接已淘汰，改用字串插值串起兩段不同顏色的字
        let headText = Text(head).foregroundColor(.drvnCoral)
        let tailText = Text(tail).foregroundColor(phase.ink(0.92))
        return Text("\(headText)\(tailText)")
    }
    return Text(zh).foregroundColor(phase.ink(0.92))
}

// ═══ 共用元件 ═══════════════════════════════════════════════
private struct Kicker: View {
    let text: String
    let phase: DayPhase
    var body: some View {
        Text(text)
            .font(.system(size: 8.5, weight: .heavy))
            .kerning(2.2)
            .foregroundColor(phase.ink(0.72))
            .textCase(.uppercase)
            .lineLimit(1)
    }
}

private struct SegmentTrack: View {
    let done: Int
    let total: Int
    let phase: DayPhase
    var segments: Int = 12
    var height: CGFloat = 7
    var body: some View {
        let pct = total > 0 ? Double(done) / Double(total) : 0
        let lit = Int((Double(segments) * pct).rounded())
        HStack(spacing: 5) {
            ForEach(0..<segments, id: \.self) { i in
                HandLine(seed: UInt64(i + 1) &* 31, wobble: height * 0.05)
                    .stroke(i < lit ? Color.drvnCoral : phase.ink(0.18),
                            style: StrokeStyle(lineWidth: height * (i < lit ? 0.55 : 0.42), lineCap: .round))
                    .frame(height: height)
            }
        }
    }
}

/// 敘事句：nil=弱灰、.primary 主字色、.coral 關鍵詞
private enum Tone { case dim, main, coral }
private func narrative(_ parts: [(String, Tone)], size: CGFloat, phase: DayPhase) -> Text {
    parts.reduce(Text("")) { acc, p in
        let color: Color = { switch p.1 {
            case .dim: return phase.ink(0.72)
            case .main: return phase.ink
            case .coral: return phase.isLight ? Color(hex: 0x722B40) : Color(hex: 0xFFD49D) } }()
        let piece = Text(p.0)
            .font(.system(size: size, weight: p.1 == .dim ? .medium : .semibold))
            .foregroundColor(color)
        return Text("\(acc)\(piece)")
    }
}

private struct WidgetCardTone {
    let tint: Color
    let edge: Color
}

private func widgetCardTone(_ d: DailyPromptData, content: ContentKind, phase: DayPhase) -> WidgetCardTone {
    // Rotate the same content through a coordinated daily palette.
    let palette: [UInt32]
    switch phase {
    case .morning: palette = [0x8DBDE8, 0xE7B35F, 0xEFC46D, 0xED9D87, 0xA7CADA]
    case .midday: palette = [0x66AFE8, 0x85B7DB, 0xEBC363, 0xEE9987, 0x9DAFE0]
    case .night: palette = [0x294C8B, 0x285B73, 0x795132, 0x762D43, 0x405685]
    }
    let category = d.tasks.first(where: { !$0.done })?.cat.lowercased() ?? ""
    let slot: Int
    if d.total > 0 && d.done >= d.total { slot = 1 }
    else if content == .reminder { slot = d.hint?.kind == "streak" ? 3 : 0 }
    else if category.contains("nutrition") { slot = 2 }
    else if category.contains("inbody") { slot = 4 }
    else if category.contains("run") { slot = 0 }
    else { slot = 3 }
    let companion: [UInt32] = phase == .night
        ? [0x316C88, 0x344E80, 0x713D32, 0x472A42, 0x24485D]
        : [0xB6D8F0, 0xD1DFF1, 0xF5D59B, 0xF3BA91, 0xB8D4ED]
    return WidgetCardTone(tint: Color(hex: palette[slot]), edge: Color(hex: companion[slot]))
}


// 【一卡一訊息】footer 只留 DRVN 字標收筆，不再混入第二個資訊
private struct BrandMark: View {
    let phase: DayPhase
    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Text("DRVN")
                .font(.system(size: 9, weight: .heavy))
                .kerning(2.4)
                .foregroundColor(phase.ink(0.5))
        }
    }
}

private struct TaskRow: View {
    let task: WidgetTask
    let phase: DayPhase
    /// 用文字算出固定的種子：同一個任務每次畫出來的筆跡都一樣
    private var labelSeed: UInt64 { task.label.unicodeScalars.reduce(UInt64(5)) { $0 &* 31 &+ UInt64($1.value) } }
    var body: some View {
        HStack(spacing: 9) {
            if task.done {
                HandCheck()
                    .stroke(Color.drvnCoral, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                    .frame(width: 11, height: 10)
                    .frame(width: 12)
            } else {
                HandRing(seed: labelSeed)
                    .stroke(phase.ink(0.45), style: StrokeStyle(lineWidth: 1.1, lineCap: .round))
                    .frame(width: 11, height: 11)
                    .frame(width: 12)
            }
            Text(task.label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(phase.ink(task.done ? 0.64 : 0.96))
                .strikethrough(task.done, color: phase.ink(0.3))
                .lineLimit(1)
            Spacer(minLength: 6)
            Text(task.sub)
                .font(.system(size: 8, weight: .heavy))
                .kerning(1.4)
                .foregroundColor(phase.ink(task.done ? 0.60 : 0.76))
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) {
            HandLine(seed: labelSeed &+ 5, wobble: 0.6)
                .stroke(phase.ink(0.16), style: StrokeStyle(lineWidth: 0.7, lineCap: .round))
                .frame(height: 2)
        }
    }
}

// ═══ 金屬儀表（熱量）════════════════════════════════════════
//  半圓弧 + 刻度 + 指針：intake / target。剩餘可吃 or 超標。
private struct CalorieGauge: View {
    let intake: Double
    let target: Double
    let phase: DayPhase
    var size: CGFloat = 96

    var body: some View {
        let pct = target > 0 ? min(intake / target, 1.3) : 0
        ZStack {
            // 刻度環（-90°~+90° 半圓，21 格）
            ForEach(0..<21) { i in
                Capsule()
                    .fill(phase.ink(i % 5 == 0 ? 0.5 : 0.22))
                    .frame(width: i % 5 == 0 ? 2 : 1.2, height: i % 5 == 0 ? 9 : 6)
                    .offset(y: -size / 2 + 5)
                    .rotationEffect(.degrees(Double(i) * 9 - 90))
            }
            // 進度弧
            Circle()
                .trim(from: 0, to: 0.5 * min(pct, 1.0))
                .stroke(Color.drvnCoral, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: size - 26, height: size - 26)
                .rotationEffect(.degrees(180))
            // 指針
            Capsule()
                .fill(Color.drvnCoral)
                .frame(width: 2.5, height: size / 2 - 20)
                .offset(y: -(size / 2 - 20) / 2)
                .rotationEffect(.degrees(pct * 180 - 90))
            Circle().fill(phase.ink).frame(width: 6, height: 6)
        }
        .frame(width: size, height: size / 2 + 12, alignment: .top)
        .clipped()
    }
}

// ═══ 四種內容 × 三種尺寸 ═════════════════════════════════════

// ── PROGRESS ──
private struct ProgressSmall: View {
    let d: DailyPromptData; let phase: DayPhase
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker(text: "TODAY", phase: phase)
            Spacer(minLength: 4)
            HStack(alignment: .lastTextBaseline, spacing: 3) {
                Text("\(d.done)").font(.system(size: 42, weight: .light)).foregroundColor(.drvnCoral)
                Text("/ \(d.total)").font(.system(size: 17, weight: .light)).foregroundColor(phase.ink(0.4))
            }
            SegmentTrack(done: d.done, total: d.total, phase: phase, segments: 8, height: 6)
                .padding(.vertical, 8)
            Text(d.nextLabel)
                .font(.system(size: 10.5, weight: .bold))
                .foregroundColor(phase.ink(0.75))
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(14)
    }
}

private struct ProgressMedium: View {
    let d: DailyPromptData; let phase: DayPhase
    var body: some View {
        let remain = max(0, d.total - d.done)
        HStack(alignment: .center, spacing: 14) {
            // 左：大膽敘事句 —— 中卡欄窄，只講「還差 N 項」一件事（v4.2 防破版）
            VStack(alignment: .leading, spacing: 8) {
                Kicker(text: "TODAY · \(d.dayTitle)", phase: phase)
                narrative([
                    ("還差", .dim),
                    ("\n\(remain) 項", .coral),
                ], size: 26, phase: phase)
                .lineSpacing(4)
                .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                SegmentTrack(done: d.done, total: d.total, phase: phase, segments: 8, height: 6)
            }
            Rectangle().fill(phase.ink(0.12)).frame(width: 0.5)
            VStack(spacing: 0) {
                ForEach(d.tasks.prefix(3)) { TaskRow(task: $0, phase: phase) }
                Spacer(minLength: 0)
            }
            .frame(width: 148)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(14)
    }
}

private struct ProgressLarge: View {
    let d: DailyPromptData; let phase: DayPhase
    var body: some View {
        let remain = max(0, d.total - d.done)
        VStack(alignment: .leading, spacing: 0) {
            Kicker(text: "TODAY · \(d.dayLabel)", phase: phase)
            narrative([
                ("\(d.dayTitle)", .main),
                ("，還差 ", .dim),
                ("\(remain) 項", .coral),
                ("。", .dim),
            ], size: 24, phase: phase)
            .padding(.top, 8)
            HStack(spacing: 10) {
                SegmentTrack(done: d.done, total: d.total, phase: phase, segments: 14)
                Text("\(d.done)/\(d.total)")
                    .font(.system(size: 12, weight: .bold).monospacedDigit())
                    .foregroundColor(phase.ink(0.5))
            }
            .padding(.top, 14).padding(.bottom, 6)
            VStack(spacing: 0) {
                ForEach(d.tasks.prefix(4)) { TaskRow(task: $0, phase: phase) }
            }
            Spacer(minLength: 8)
            BrandMark(phase: phase)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
    }
}

// ── QUOTE（圖一風格：整版大字，無數據）──
//  小卡＝只放「關鍵詞」當海報字（整句塞不下就不塞，敢留白）；
//  中卡＝整句敘事；大卡＝更大字級 + 上下大量留白（雜誌內頁）。
private struct QuoteView: View {
    let d: DailyPromptData; let phase: DayPhase; let family: WidgetFamily
    var body: some View {
        let q = quoteOfNow(Date())
        let pieces = q.zh.components(separatedBy: q.key)
        Group {
            if family == .systemSmall {
                // 小卡：完整語錄滿版（無 QUOTE 小標）
                VStack(alignment: .leading, spacing: 0) {
                    Spacer(minLength: 0)
                    quoteHeadColored(q.zh, phase: phase)
                        .font(.system(size: 16, weight: .semibold))
                        .lineLimit(5)
                        .minimumScaleFactor(0.5)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                    Rectangle().fill(phase.ink(0.25)).frame(width: 22, height: 1.5)
                        .padding(.vertical, 8)
                    Text(q.author)
                        .font(.system(size: 9, weight: .heavy))
                        .kerning(1.4)
                        .foregroundColor(phase.ink(0.5))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(14)
            } else {
                // 中/大卡：整句敘事 + 署名
                VStack(alignment: .leading, spacing: 0) {
                    if family == .systemLarge {
                        Spacer(minLength: 4)
                    }
                    narrative([
                        (pieces.first ?? "", .main),
                        (q.key, .coral),
                        (pieces.count > 1 ? pieces[1] : "", .main),
                    ], size: family == .systemLarge ? 28 : 21, phase: phase)
                    .lineSpacing(family == .systemLarge ? 8 : 5)
                    Spacer(minLength: 8)
                    HStack {
                        Text("— \(q.author)")
                            .font(.system(size: 10.5, weight: .heavy))
                            .kerning(1.6)
                            .foregroundColor(phase.ink(0.45))
                        Spacer()
                        Text("DRVN")
                            .font(.system(size: 9, weight: .heavy)).kerning(2.4)
                            .foregroundColor(phase.ink(0.5))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(family == .systemLarge ? 20 : 16)
            }
        }
    }
}

// ── WEATHER：巨大溫度字當主角（獨特設計：氣象台看板）──
private struct WeatherView: View {
    let d: DailyPromptData; let phase: DayPhase; let family: WidgetFamily
    var body: some View {
        let w = d.weather!
        let line = weatherLine(w)
        let temp = Int(w.tempC.rounded())
        let segs = line.advice.components(separatedBy: line.key)
        VStack(alignment: .leading, spacing: 0) {
            Kicker(text: "MORNING · \(d.dayLabel)", phase: phase)
            // 巨大溫度字（超輕字重 × 超大字級 = 這張卡的臉）
            HStack(alignment: .top, spacing: 2) {
                Text("\(temp)")
                    .font(.system(size: family == .systemSmall ? 52 : (family == .systemLarge ? 88 : 64),
                                  weight: .thin))
                    .foregroundColor(phase.ink)
                Text("°")
                    .font(.system(size: family == .systemSmall ? 24 : 36, weight: .light))
                    .foregroundColor(.drvnCoral)
                    .padding(.top, family == .systemSmall ? 4 : 8)
            }
            .padding(.top, 2)
            Spacer(minLength: 4)
            if family == .systemSmall {
                Text(line.key)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.drvnCoral)
            } else {
                narrative([
                    (segs.first ?? "", .dim),
                    (line.key, .coral),
                    (segs.count > 1 ? segs[1] : "", .dim),
                ], size: family == .systemLarge ? 24 : 17, phase: phase)
                .lineSpacing(4)
                if family == .systemLarge {
                    // 大卡專屬：底部氣象台資料列（同一資訊域：溫度 / 降雨）
                    Spacer(minLength: 10)
                    HStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 3) {
                            Kicker(text: "降雨機率", phase: phase)
                            Text("\(Int(w.rainPct))%")
                                .font(.system(size: 18, weight: .light).monospacedDigit())
                                .foregroundColor(phase.ink)
                        }
                        Rectangle().fill(phase.ink(0.12)).frame(width: 0.5, height: 30)
                            .padding(.horizontal, 16)
                        VStack(alignment: .leading, spacing: 3) {
                            Kicker(text: "建議時段", phase: phase)
                            Text(w.tempC >= 25 ? "清晨 / 傍晚" : "全天皆宜")
                                .font(.system(size: 18, weight: .light))
                                .foregroundColor(phase.ink)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 3) {
                            Text("DRVN")
                                .font(.system(size: 9, weight: .heavy)).kerning(2.4)
                                .foregroundColor(phase.ink(0.5))
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(family == .systemSmall ? 14 : 16)
    }
}

// ── LEAGUE：黑卡會員卡（實體卡語言：晶片 + 點狀卡號 + 燙印卡名）──
//  無論早晚，黑卡就是黑的 —— EntryView 會為此型態強制夜間畫布。
//  v4.2：移除 coral 細框（與系統圓角打架、像多餘的框框），
//        改用晶片與卡號點陣營造「實體卡」物件感。
private struct LeagueView: View {
    let d: DailyPromptData; let family: WidgetFamily

    // 金屬晶片（信用卡語言）
    private var chip: some View {
        RoundedRectangle(cornerRadius: 3.5)
            .fill(LinearGradient(colors: [Color.drvnPaper.opacity(0.55), Color.drvnPaper.opacity(0.25)],
                                 startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: 24, height: 17)
            .overlay(
                Rectangle().fill(Color.drvnInk.opacity(0.35)).frame(height: 1)
            )
    }
    // 點狀卡號（●●●● ●●●●）
    private var cardDots: some View {
        HStack(spacing: 10) {
            ForEach(0..<3) { _ in
                HStack(spacing: 3.5) {
                    ForEach(0..<4) { _ in
                        Circle().fill(Color.drvnPaper.opacity(0.22)).frame(width: 4, height: 4)
                    }
                }
            }
        }
    }

    var body: some View {
        let label = d.league?.label ?? ""
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text("DRVN LEAGUE")
                    .font(.system(size: 8.5, weight: .heavy))
                    .kerning(2.6)
                    .foregroundColor(Color.drvnPaper.opacity(0.45))
                Spacer()
                if family == .systemSmall {
                    chip.scaleEffect(0.8)
                } else {
                    Text("INVITATION")
                        .font(.system(size: 8.5, weight: .heavy))
                        .kerning(2.6)
                        .foregroundColor(.drvnCoral)
                }
            }
            if family != .systemSmall {
                chip.padding(.top, family == .systemLarge ? 18 : 10)
            }
            Spacer(minLength: 0)
            if family == .systemLarge {
                cardDots.padding(.bottom, 14)
            }
            // 卡名燙印：超大、極輕、置底左
            Text(label)
                .font(.system(size: family == .systemSmall ? 21 : (family == .systemLarge ? 40 : 28),
                              weight: .light))
                .foregroundColor(.drvnPaper)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
            Rectangle()
                .fill(Color.drvnCoral)
                .frame(width: family == .systemSmall ? 26 : 40, height: 2)
                .padding(.top, 8)
            Text(family == .systemSmall ? "邀請函已送達" : "你的邀請函已送達 — 點開領取")
                .font(.system(size: family == .systemSmall ? 10 : 11.5, weight: .bold))
                .foregroundColor(Color.drvnPaper.opacity(0.6))
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(family == .systemSmall ? 14 : 18)
    }
}

// ── DEFICIT（金屬儀表：今日熱量）──
private struct DeficitView: View {
    let d: DailyPromptData; let phase: DayPhase; let family: WidgetFamily
    var body: some View {
        let n = d.nutrition!
        let target = n.targetKcal ?? 0
        let remain = Int((target - n.intakeKcal).rounded())
        let over = remain < 0

        Group {
            if family == .systemSmall {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(text: "熱量 · KCAL", phase: phase)
                    Spacer(minLength: 2)
                    CalorieGauge(intake: n.intakeKcal, target: target, phase: phase, size: 84)
                        .frame(maxWidth: .infinity)
                    Spacer(minLength: 2)
                    narrative([
                        (over ? "超出 " : "還可吃 ", .dim),
                        ("\(abs(remain))", over ? .coral : .main),
                        (" kcal", .dim),
                    ], size: 14, phase: phase)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(14)
            } else if family == .systemMedium {
                // 中卡：儀表右、敘事左
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Kicker(text: "TONIGHT · 熱量結算", phase: phase)
                        narrative(over
                            ? [("今天超出 ", .dim), ("\(abs(remain)) kcal", .coral), ("，\n明天把它跑回來。", .main)]
                            : [("還可以吃 ", .dim), ("\(abs(remain)) kcal", .coral), ("，\n守住今天的紀律。", .main)],
                            size: 19, phase: phase)
                        .lineSpacing(4)
                        Spacer(minLength: 0)
                        Text("已攝取 \(Int(n.intakeKcal)) / 目標 \(Int(target))")
                            .font(.system(size: 10, weight: .semibold).monospacedDigit())
                            .foregroundColor(phase.ink(0.45))
                    }
                    Spacer(minLength: 0)
                    CalorieGauge(intake: n.intakeKcal, target: target, phase: phase, size: 96)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .padding(16)
            } else {
                // 大卡專屬：儀表置中當主角 + 瑞士三欄資料列（硬線分隔）
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(text: "TONIGHT · 熱量結算", phase: phase)
                    Spacer(minLength: 6)
                    CalorieGauge(intake: n.intakeKcal, target: target, phase: phase, size: 150)
                        .frame(maxWidth: .infinity)
                    narrative(over
                        ? [("超出 ", .dim), ("\(abs(remain))", .coral), (" kcal", .dim)]
                        : [("還可吃 ", .dim), ("\(abs(remain))", .coral), (" kcal", .dim)],
                        size: 26, phase: phase)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 2)
                    Spacer(minLength: 10)
                    // 三欄資料列：方形硬線（卡內張力）
                    HStack(spacing: 0) {
                        deficitCol("已攝取", "\(Int(n.intakeKcal))", phase: phase)
                        Rectangle().fill(phase.ink(0.14)).frame(width: 1, height: 32)
                        deficitCol("目標", "\(Int(target))", phase: phase)
                        Rectangle().fill(phase.ink(0.14)).frame(width: 1, height: 32)
                        deficitCol(over ? "超出" : "剩餘", "\(abs(remain))", phase: phase, accent: true)
                    }
                    .padding(.top, 4)
                    .overlay(alignment: .top) {
                        Rectangle().fill(phase.ink(0.20)).frame(height: 1.5)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(18)
            }
        }
    }

    @ViewBuilder
    private func deficitCol(_ label: String, _ value: String, phase: DayPhase, accent: Bool = false) -> some View {
        VStack(spacing: 3) {
            Text(label)
                .font(.system(size: 8.5, weight: .heavy))
                .kerning(1.6)
                .foregroundColor(phase.ink(0.72))
            Text(value)
                .font(.system(size: 19, weight: .light).monospacedDigit())
                .foregroundColor(accent ? .drvnCoral : phase.ink)
        }
        .frame(maxWidth: .infinity)
    }
}

// ── DASHBOARD（大卡專屬：今日總覽，顯示最多內容）──────────────
//  結構：標題敘事 → 分段進度 → 任務清單 → 底部資料列（動態拼裝：
//  熱量剩餘 / 目前溫度 / 飲食連續天數 —— 有資料的才上，湊滿瑞士三欄硬線表）
private struct DashboardLarge: View {
    let d: DailyPromptData; let phase: DayPhase
    private var recentWorkout: WidgetRecentWorkout? {
        guard let recent = d.recentWorkout else { return nil }
        let age = Date().timeIntervalSince1970 - recent.performedAt
        return age >= 0 && age < 7 * 86400 ? recent : nil
    }

    private struct Stat { let label: String; let value: String; let accent: Bool }
    private var stats: [Stat] {
        var out: [Stat] = []
        // 🌤️ 天氣快照新鮮（< 6h）→ 底部一整排就是天氣：溫度 / 風速 / 降雨機率（同一排）
        if let w = d.weather,
           Date().timeIntervalSince1970 - w.fetchedAt < 6 * 3600 {
            out.append(Stat(label: "目前溫度", value: "\(Int(w.tempC.rounded()))°", accent: false))
            out.append(Stat(label: "風速", value: "\(Int((w.windKph ?? 0).rounded())) km/h", accent: false))
            out.append(Stat(label: "降雨機率", value: "\(Int(w.rainPct))%", accent: false))
            return out
        }
        // 無天氣時退回營養/連續天數
        if let n = d.nutrition, let target = n.targetKcal, target > 0 {
            let remain = Int((target - n.intakeKcal).rounded())
            out.append(Stat(label: remain < 0 ? "熱量超出" : "熱量剩餘",
                            value: "\(abs(remain))", accent: remain < 0))
        }
        if d.streakDays > 0 {
            out.append(Stat(label: "飲食連續", value: "\(d.streakDays) 天", accent: false))
        }
        return Array(out.prefix(3))
    }

    var body: some View {
        let remain = max(0, d.total - d.done)
        let allDone = d.total > 0 && remain == 0
        VStack(alignment: .leading, spacing: 0) {
            // 標題敘事
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Kicker(text: "TODAY · \(d.dayLabel)", phase: phase)
                    if allDone {
                        narrative([("今天的你，", .dim), ("全部到位", .coral), ("。", .main)],
                                  size: 24, phase: phase)
                    } else if d.total > 0 {
                        narrative([("\(d.dayTitle)", .main), ("，還差 ", .dim),
                                   ("\(remain) 項", .coral), ("。", .dim)],
                                  size: 24, phase: phase)
                            .overlay(alignment: .bottomLeading) {
                                if d.dayTitle.contains("重訓") || d.dayTitle.contains("跑步") {
                                    HandLine(seed: 41, wobble: 0.6)
                                        .stroke(phase.isLight ? Color(hex: 0x843C40) : Color(hex: 0xF2C791),
                                                style: StrokeStyle(lineWidth: 2, lineCap: .round))
                                        .frame(width: 48, height: 3)
                                        .offset(y: 5)
                                        .accessibilityHidden(true)
                                }
                            }
                    } else {
                        narrative([("\(d.dayTitle)", .main), (" — 修復在今天發生。", .dim)],
                                  size: 24, phase: phase)
                    }
                }
                Spacer()
                Text("DRVN")
                    .font(.system(size: 9, weight: .heavy)).kerning(2.4)
                    .foregroundColor(phase.ink(0.5))
                    .padding(.top, 2)
            }
            // 進度
            if d.total > 0 {
                HStack(spacing: 10) {
                    SegmentTrack(done: d.done, total: d.total, phase: phase, segments: 14)
                    Text("\(d.done)/\(d.total)")
                        .font(.system(size: 12, weight: .bold).monospacedDigit())
                        .foregroundColor(phase.ink(0.5))
                }
                .padding(.top, 14).padding(.bottom, 4)
                VStack(spacing: 0) {
                    ForEach(d.tasks.prefix(4)) { TaskRow(task: $0, phase: phase) }
                }
            }
            Spacer(minLength: 10)
            if let recent = recentWorkout {
                VStack(alignment: .leading, spacing: 3) {
                    Text(recent.title).font(.system(size: 9, weight: .bold))
                        .foregroundColor(phase.ink(0.76))
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text(recent.value).font(.system(size: 28, weight: .light, design: .rounded))
                        Text(recent.unit).font(.system(size: 12, weight: .semibold))
                        Spacer()
                        Text(recent.detail).font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(phase.isLight ? Color(hex: 0x243E61) : Color(hex: 0xA5E7E0))
                    Path { p in
                        p.move(to: CGPoint(x: 1, y: 5))
                        p.addQuadCurve(to: CGPoint(x: 83, y: 3), control: CGPoint(x: 34, y: 0))
                        p.move(to: CGPoint(x: 8, y: 7))
                        p.addQuadCurve(to: CGPoint(x: 62, y: 6), control: CGPoint(x: 36, y: 4))
                    }
                    .stroke(phase.isLight ? Color(hex: 0x722B40) : Color(hex: 0xFFD49D),
                            style: StrokeStyle(lineWidth: 1.2, lineCap: .round))
                    .frame(width: 86, height: 8)
                    Text(Date(timeIntervalSince1970: recent.performedAt), style: .date)
                        .font(.system(size: 9)).foregroundColor(phase.ink(0.7))
                }
                .padding(.vertical, 6)
            }
            // 🏋️ 今日訓練提示（天氣 × 運動建議）— 保留大卡的教練語；天氣數字則移到最底資料列。
            if recentWorkout == nil, let w = d.weather,
               Date().timeIntervalSince1970 - w.fetchedAt < 6 * 3600 {
                let wl = weatherLine(w)
                let segs = wl.advice.components(separatedBy: wl.key)
                VStack(alignment: .leading, spacing: 5) {
                    Kicker(text: "TODAY'S TRAINING", phase: phase)
                    narrative([
                        (segs.first ?? "", .dim),
                        (wl.key, .coral),
                        (segs.count > 1 ? segs[1] : "", .dim),
                    ], size: 16, phase: phase)
                    .lineSpacing(3)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
                }
                .padding(.bottom, 10)
            }
            // 底部資料列：方形硬線（有幾欄放幾欄；一欄都沒有就收起）
            if !stats.isEmpty {
                HStack(spacing: 0) {
                    ForEach(Array(stats.enumerated()), id: \.offset) { i, s in
                        if i > 0 {
                            Rectangle().fill(phase.ink(0.14)).frame(width: 1, height: 32)
                        }
                        VStack(spacing: 3) {
                            Text(s.label)
                                .font(.system(size: 8.5, weight: .heavy))
                                .kerning(1.4)
                                .foregroundColor(phase.ink(0.72))
                            Text(s.value)
                                .font(.system(size: 19, weight: .light).monospacedDigit())
                                .foregroundColor(s.accent ? .drvnCoral : phase.ink)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .padding(.top, 8)
                .overlay(alignment: .top) {
                    Rectangle().fill(phase.ink(0.20)).frame(height: 1.5)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
    }
}

// ── 🎴 REMINDER（事件提示卡：Brand Gradients 色塊語言・圖一）──────────
//  設計：整版單色色塊（Coral / Mystic / Carnation / Ebony Clay 依事件與時段混搭）、
//  左上 tracked caps kicker、左下超大輕字標題、幽靈大數字右下（01/02 式編號感）、
//  hairline 收筆。平面硬派、零光暈、零 emoji — 與圖一色票頁同一種語言。
private struct ReminderView: View {
    let d: DailyPromptData
    let phase: DayPhase
    let family: WidgetFamily

    // 事件 × 時段 → 色塊配色（bg / 主字 / 強調）
    private var palette: (bg: Color, ink: Color, accent: Color, ghost: Color) {
        (.clear, phase.ink, .drvnCoral, phase.ink(0.08))
    }
    private var kickerText: String {
        let kind = d.hint?.kind ?? ""
        switch kind {
        case "streak":  return "STREAK · DAY \(d.streak?.current ?? 0)"
        case "wrapup":  return "DAILY CHECK-IN · 晚間收尾"
        default:        return "NEW WEEK · \(d.dayLabel)"
        }
    }
    // 幽靈大數字：streak=天數、wrapup=剩餘件數、kickoff=01
    private var ghostNumber: String {
        let kind = d.hint?.kind ?? ""
        switch kind {
        case "streak": return String(format: "%02d", min(99, d.streak?.current ?? 0))
        case "wrapup": return String(format: "%02d", min(99, max(0, d.total - d.done)))
        default:       return "01"
        }
    }

    var body: some View {
        let p = palette
        ZStack {
            Color.clear
            // 幽靈編號 — 右下、超大、極輕（圖一的 01/02 語言）
            VStack { Spacer()
                HStack { Spacer()
                    Text(ghostNumber)
                        .font(.system(size: family == .systemSmall ? 64 : 92, weight: .light))
                        .foregroundColor(p.ghost)
                        .padding(.trailing, family == .systemSmall ? 6 : 10)
                        .padding(.bottom, family == .systemSmall ? -8 : -12)
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    Text(kickerText)
                        .font(.system(size: 8.5, weight: .heavy)).kerning(2.4)
                        .foregroundColor(p.ink.opacity(0.72))
                    Spacer()
                    Text("DRVN")
                        .font(.system(size: 9, weight: .heavy)).kerning(2.4)
                        .foregroundColor(p.ink.opacity(0.4))
                }
                Spacer(minLength: 0)
                Text(d.hint?.title ?? "")
                    .font(.system(size: family == .systemSmall ? 19 : 27, weight: .light))
                    .foregroundColor(p.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Rectangle()
                    .fill(p.accent)
                    .frame(width: family == .systemSmall ? 26 : 40, height: 2)
                    .padding(.top, 7)
                Text(d.hint?.sub ?? "")
                    .font(.system(size: family == .systemSmall ? 10 : 11.5, weight: .bold))
                    .foregroundColor(p.ink.opacity(0.78))
                    .lineLimit(1)
                    .padding(.top, 7)
            }
            .padding(family == .systemSmall ? 14 : 18)
        }
    }
}

// ═══ Timeline：日夜邊界自動換裝 ═════════════════════════════
struct DailyPromptEntry: TimelineEntry {
    let date: Date
    let data: DailyPromptData
    let phase: DayPhase
}

struct DailyPromptProvider: TimelineProvider {
    private func entry(at date: Date, data: DailyPromptData) -> DailyPromptEntry {
        // content 依 family 而異 → 移到 EntryView 渲染時決定（一份 timeline 三種尺寸共用）
        DailyPromptEntry(date: date, data: data, phase: .at(date))
    }
    func placeholder(in context: Context) -> DailyPromptEntry {
        entry(at: .now, data: .placeholder)
    }
    func getSnapshot(in context: Context, completion: @escaping (DailyPromptEntry) -> Void) {
        completion(entry(at: .now, data: .load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DailyPromptEntry>) -> Void) {
        let data = DailyPromptData.load()
        let cal = Calendar.current
        var entries = [entry(at: .now, data: data)]
        // 未來 24h 的策展邊界：畫布 05/11/17 + 內容 19/21 + 每 6h 語錄輪替
        for h in [5, 11, 17, 19, 21] {
            if let t = cal.nextDate(after: .now, matching: DateComponents(hour: h, minute: 0),
                                    matchingPolicy: .nextTime), t.timeIntervalSinceNow < 24 * 3600 {
                entries.append(entry(at: t, data: data))
            }
        }
        entries.sort { $0.date < $1.date }
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        completion(Timeline(entries: entries, policy: .after(next)))
    }
}

// ═══ Widget 定義 ═════════════════════════════════════════════
struct DailyPromptWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: DailyPromptEntry
    var body: some View {
        // 內容依「尺寸角色」決定（小=語錄位、中=輪替位、大=總覽儀表板）
        let content = pickContent(entry.data, at: entry.date, family: family)
        let cardTone = widgetCardTone(entry.data, content: content, phase: entry.phase)
        // 黑卡是「事件卡」：無論早晚都用夜間黑畫布，其餘內容跟著日夜換裝
        let canvasPhase: DayPhase = content == .league ? .night : entry.phase
        Group {
            switch content {
            case .league where entry.data.league?.pending == true:
                LeagueView(d: entry.data, family: family)
            case .reminder where entry.data.hint != nil:
                ReminderView(d: entry.data, phase: entry.phase, family: family)
            case .dashboard:
                DashboardLarge(d: entry.data, phase: entry.phase)
            case .quote:
                QuoteView(d: entry.data, phase: entry.phase, family: family)
            case .weather where entry.data.weather != nil:
                WeatherView(d: entry.data, phase: entry.phase, family: family)
            case .deficit where entry.data.nutrition?.targetKcal != nil:
                DeficitView(d: entry.data, phase: entry.phase, family: family)
            default:
                switch family {
                case .systemSmall: ProgressSmall(d: entry.data, phase: entry.phase)
                case .systemLarge: ProgressLarge(d: entry.data, phase: entry.phase)
                default: ProgressMedium(d: entry.data, phase: entry.phase)
                }
            }
        }
        .drvnCanvas(canvasPhase, tint: cardTone.tint, edgeAccent: cardTone.edge)
    }
}

struct DailyPromptWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DRVNDailyPrompt", provider: DailyPromptProvider()) { entry in
            DailyPromptWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("DRVN 今日")
        .description("今日進度、語錄、天氣建議與熱量結算，隨時段自動切換。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
