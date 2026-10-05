import SwiftUI

// ══════════════════════════════════════════════════════
// MARK: - DRVN Editorial Font (watchOS)
// Uses SF Pro Serif / New York via system(.serif) design token.
// .custom("NewYork-...") requires the font to be bundled or
// available by exact PostScript name — unreliable on watchOS.
// .system(design: .serif) gives the same New York look without
// hard-coded font names and compiles cleanly on all Apple targets.
// ══════════════════════════════════════════════════════
extension Font {

    /// Primary editorial font — New York-style serif at any weight.
    static func drvnFont(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }

    // ── Convenience shorthands ──────────────────────────
    static func drvnBlack(_ size: CGFloat)  -> Font { .system(size: size, weight: .black,  design: .serif) }
    static func drvnBold(_ size: CGFloat)   -> Font { .system(size: size, weight: .bold,   design: .rounded) }
    static func drvnMedium(_ size: CGFloat) -> Font { .system(size: size, weight: .medium, design: .default) }
}
