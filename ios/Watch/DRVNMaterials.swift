import SwiftUI

/// Native watchOS glass; the opaque variant is reserved for accessibility.
struct WatchGlassSurface: View {
    var tint: Color = .white.opacity(0.08)
    var corner: CGFloat = 18
    var light = false
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var body: some View {
        Group {
            if reduceTransparency {
                RoundedRectangle(cornerRadius: corner).fill(light ? Color.drvnPaper : Color(white: 0.15))
            } else if #available(watchOS 26.0, *) {
                Color.clear.glassEffect(.regular.tint(tint), in: RoundedRectangle(cornerRadius: corner))
            } else {
                RoundedRectangle(cornerRadius: corner).fill(.regularMaterial)
            }
        }
        .environment(\.colorScheme, light ? .light : .dark)
    }
}

struct TitaniumSurface: View {
    var corner: CGFloat = 18
    var body: some View { WatchGlassSurface(tint: .drvnPaper.opacity(0.65), corner: corner, light: true) }
}
struct CoralSurface: View {
    var corner: CGFloat = 18
    var body: some View { WatchGlassSurface(tint: Color(hex: "F95C4B").opacity(0.55), corner: corner) }
}
struct DarkGlassSurface: View {
    var corner: CGFloat = 18
    var body: some View { WatchGlassSurface(tint: Color(white: 0.12).opacity(0.4), corner: corner) }
}
struct SageGlassSurface: View {
    var corner: CGFloat = 18
    var body: some View { WatchGlassSurface(tint: Color(hex: "A8C99C").opacity(0.65), corner: corner, light: true) }
}

/// Liquid Glass 當成「元件自己的材質」：內容一定畫在玻璃上面。
/// ⚠️ 不要再用 `.background(Color.clear.glassEffect())` 再把整個 App 包進 GlassEffectContainer ——
///    container 會把所有玻璃集中到同一層畫，那一層蓋在文字上面：
///    手錶主選單的 GYM / RUN / EAT / DRVN 字全被玻璃蓋掉，磚塊還會互相黏在一起。
struct DRVNGlassModifier: ViewModifier {
    let tint: Color
    let corner: CGFloat
    let light: Bool
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @ViewBuilder func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: corner, style: .continuous)
        if reduceTransparency {
            content.background(shape.fill(light ? Color.drvnPaper : Color(white: 0.15)))
        } else if #available(watchOS 26.0, *) {
            content
                .glassEffect(.regular.tint(tint), in: shape)
                .environment(\.colorScheme, light ? .light : .dark)
        } else {
            content.background(shape.fill(.regularMaterial))
        }
    }
}

extension View {
    func drvnGlass(tint: Color = .white.opacity(0.08), corner: CGFloat = 18, light: Bool = false) -> some View {
        modifier(DRVNGlassModifier(tint: tint, corner: corner, light: light))
    }
    /// 保留相容：以前在 App 最外層包 GlassEffectContainer，會讓玻璃蓋住文字，現在不做任何事。
    func watchGlassGroup() -> some View { self }
}

// ── 共用模式磚（GYM / RUN / EAT 右側三磚）──
struct ModeTile: View {
    let title: String
    let sub: String
    var titleColor: Color = .drvnPaper
    var subColor: Color = .drvnPebble
    var corner: CGFloat = 18
    var tint: Color = .white.opacity(0.08)
    var light: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.custom("Helvetica Neue", size: 18))
                .fontWeight(.bold)
                .tracking(0.5)
                .foregroundColor(titleColor)
            Text(sub)
                .font(.custom("Helvetica Neue", size: 8))
                .fontWeight(.bold)
                .tracking(1)
                .foregroundColor(subColor)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(10)
        .drvnGlass(tint: tint, corner: corner, light: light)
        .contentShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
    }
}
