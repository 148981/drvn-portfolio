import SwiftUI

// ══════════════════════════════════════════════════════
// MARK: - DRVN Design System Colors
// Palette: Paper / Stone / Coral / Deep Black / Pebble / Ember
// ══════════════════════════════════════════════════════
extension Color {
    // Primary Neutrals
    static let drvnDeepBlack = Color(hex: "121212")
    static let drvnPaper     = Color(hex: "F6F4F1")
    static let drvnStone     = Color(hex: "E4DED2")
    
    // UI Elements
    static let drvnPebble    = Color(hex: "CFC6B8") // Dividers, borders
    
    // Accents
    static let drvnCoral     = Color(hex: "F95C4B") // Dates, heart icons
    static let drvnEmber     = Color(hex: "D94030") // Buttons on dark bg

    // Vitame Data Palette
    /// 活力藍 (#5D81BF) - 適合：已完成、基準數據、有氧區間
    static let drvnDataBlue     = Color(hex: "5D81BF")

    /// 青檸綠 (#DCE6B2) - 適合：進步指標、達成目標、新手建議
    static let drvnDataLime     = Color(hex: "DCE6B2")

    /// 復古橘 (#EC643A) - 適合：破紀錄 (PR)、高強度區間、警告
    static let drvnDataOrange   = Color(hex: "EC643A")

    /// 深炭藍 (#242F35) - 適合：深色模式下的數據背景或次要文字
    static let drvnDataCharcoal = Color(hex: "242F35")

    // Figure 2 Theme Colors
    static let drvnSunsetOrange = Color(hex: "FF8000")
    static let drvnApricot      = Color(hex: "FFD700")
    static let drvnAzure        = Color(hex: "007FFF")
    static let drvnLightCoral   = Color(hex: "F08080")

    // Figure 2 Verra Palette
    static let drvnSapphire     = Color(hex: "2B57A7")
    static let drvnBeige        = Color(hex: "F5F4DC")
    static let drvnBurgundy     = Color(hex: "801323")
    static let drvnBlueMagenta  = Color(hex: "E6E5F3")

    // Figure 1 Swiss Magazine Palette (Crimson)
    static let drvnCrimson      = Color(hex: "710014")
    static let drvnWarmSand     = Color(hex: "B38F6F")
    static let drvnSoftPearl    = Color(hex: "F2F1ED")
    
    // Legacy / Fixes
    static let drvnMagenta      = Color(hex: "ED0086") 

    // Swiss Style Magazine Palette
    static let swissBlack  = Color(hex: "121212") // Morandi Deep Black
    static let swissPaper  = Color(hex: "E0E1DD") // Glacier White
    static let swissStone  = Color(hex: "778DA9") // Aluminum Gray
    static let swissAccent = Color(hex: "E63946") // Bauhaus Classic Red

    // 🪙 配速三色（鈦金屬）— 跑步計劃配速回饋，與手機 / 網頁端一致
    //   太慢(> 目標 +10%) → 鈦紅橘 / 太快(< 目標 −10%) → 鈦冰川藍 / ±10% 內 → 鈦質感綠
    static let titaniumCoral   = Color(hex: "F95C4B") // 太慢，要快一點
    static let titaniumGlacier = Color(hex: "5FA8E0") // 太快，要慢一點
    static let titaniumGreen   = Color(hex: "3FA787") // 達標
}

// ── Hex Helper ──────────────────────────────────────────
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
