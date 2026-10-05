import SwiftUI
import WatchKit
import Combine
import Foundation
import WatchConnectivity

// ══════════════════════════════════════════════════════
// MARK: - DRVN Nutrition Palette
// ══════════════════════════════════════════════════════
private extension Color {
    static let nutBg      = Color(hex: "161415") // Deep Black
    static let nutPaper   = Color(hex: "F6F4F1") // Paper   – primary text
    static let nutStone   = Color(hex: "E4DED2") // Stone   – secondary text
    static let nutPebble  = Color(hex: "CFC6B8") // Pebble  – tertiary / dividers
    static let nutEmber   = Color(hex: "D94030") // Ember   – main accent (calories)
    static let nutCoral   = Color(hex: "F95C4B") // Coral   – highlight
    // Macro accents (warm neutrals + one blue)
    static let nutProtein = Color(hex: "F6F4F1") // Paper
    static let nutCarbs   = Color(hex: "CFC6B8") // Pebble
    static let nutFat     = Color(hex: "D94030") // Ember
    static let nutFiber   = Color(hex: "A8B4A0") // Sage
}

// ══════════════════════════════════════════════════════
// MARK: - Data Models
// ══════════════════════════════════════════════════════

struct NutritionFoodItem: Identifiable, Hashable {
    let id: String
    let emoji: String
    let name: String
    let kcal: Int
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    /// 這一份是幾克（紀錄時送給後端；內建食物以 100g 為一份）
    var grams: Double = 100
}

struct NutritionWaterEntry: Identifiable {
    let id = UUID()
    let time: Date
    let ml: Int
}

private let nutritionFoodDB: [String: [NutritionFoodItem]] = [
    "早餐": [
        NutritionFoodItem(id:"b1", emoji:"🥚", name:"水煮蛋",   kcal:78,  protein:6,  carbs:0.6, fat:5,  fiber:0),
        NutritionFoodItem(id:"b2", emoji:"🥛", name:"牛奶",     kcal:120, protein:8,  carbs:12,  fat:5,  fiber:0),
        NutritionFoodItem(id:"b3", emoji:"🍞", name:"全麥吐司", kcal:120, protein:4,  carbs:22,  fat:2,  fiber:2),
        NutritionFoodItem(id:"b4", emoji:"🍌", name:"香蕉",     kcal:89,  protein:1,  carbs:23,  fat:0,  fiber:3),
        NutritionFoodItem(id:"b5", emoji:"🫐", name:"藍莓",     kcal:57,  protein:1,  carbs:14,  fat:0,  fiber:2),
        NutritionFoodItem(id:"b6", emoji:"🧃", name:"柳橙汁",   kcal:112, protein:2,  carbs:26,  fat:0,  fiber:0),
    ],
    "午餐": [
        NutritionFoodItem(id:"l1", emoji:"🍗", name:"雞胸肉",   kcal:165, protein:31, carbs:0,   fat:4,  fiber:0),
        NutritionFoodItem(id:"l2", emoji:"🍚", name:"白飯",     kcal:206, protein:4,  carbs:45,  fat:0,  fiber:1),
        NutritionFoodItem(id:"l3", emoji:"🥦", name:"花椰菜",   kcal:55,  protein:4,  carbs:11,  fat:1,  fiber:5),
        NutritionFoodItem(id:"l4", emoji:"🥗", name:"生菜沙拉", kcal:35,  protein:2,  carbs:7,   fat:0,  fiber:3),
        NutritionFoodItem(id:"l5", emoji:"🐟", name:"鮭魚",     kcal:208, protein:20, carbs:0,   fat:13, fiber:0),
        NutritionFoodItem(id:"l6", emoji:"🥚", name:"炒蛋",     kcal:148, protein:10, carbs:2,   fat:11, fiber:0),
    ],
    "晚餐": [
        NutritionFoodItem(id:"d1", emoji:"🥩", name:"牛排",     kcal:271, protein:26, carbs:0,   fat:18, fiber:0),
        NutritionFoodItem(id:"d2", emoji:"🍠", name:"地瓜",     kcal:103, protein:2,  carbs:24,  fat:0,  fiber:3),
        NutritionFoodItem(id:"d3", emoji:"🥬", name:"菠菜",     kcal:23,  protein:3,  carbs:4,   fat:0,  fiber:2),
        NutritionFoodItem(id:"d4", emoji:"🍳", name:"煎豆腐",   kcal:145, protein:10, carbs:4,   fat:10, fiber:1),
        NutritionFoodItem(id:"d5", emoji:"🍜", name:"蕎麥麵",   kcal:192, protein:8,  carbs:42,  fat:1,  fiber:3),
        NutritionFoodItem(id:"d6", emoji:"🐚", name:"味噌湯",   kcal:40,  protein:3,  carbs:5,   fat:1,  fiber:0),
    ],
    "點心": [
        NutritionFoodItem(id:"s1", emoji:"🍎", name:"蘋果",     kcal:52,  protein:0,  carbs:14,  fat:0,  fiber:2),
        NutritionFoodItem(id:"s2", emoji:"🥜", name:"腰果",     kcal:157, protein:5,  carbs:9,   fat:12, fiber:1),
        NutritionFoodItem(id:"s3", emoji:"🍫", name:"黑巧克力", kcal:170, protein:2,  carbs:13,  fat:12, fiber:3),
        NutritionFoodItem(id:"s4", emoji:"🧁", name:"希臘優格", kcal:100, protein:17, carbs:6,   fat:1,  fiber:0),
        NutritionFoodItem(id:"s5", emoji:"🍊", name:"柳橙",     kcal:47,  protein:1,  carbs:12,  fat:0,  fiber:2),
        NutritionFoodItem(id:"s6", emoji:"🌰", name:"杏仁",     kcal:164, protein:6,  carbs:6,   fat:14, fiber:3),
    ],
]

// ══════════════════════════════════════════════════════
// MARK: - State Manager
// ══════════════════════════════════════════════════════

final class NutritionManager: NSObject, ObservableObject, WCSessionDelegate {
    // ── Goals ──────────────────────────────────────────────────────────
    // 🔴 Fix(targets)：目標不再寫死。改由後端 /api/nutrition/sql/daily 回傳的
    //    `targets`（手機端 NutritionEngine 算好後推上來）動態填入，
    //    確保手錶的進度環/百分比與手機「一模一樣」。
    //    預設值僅作為「後端尚未回傳前」的過渡 fallback。
    @Published var goalCalories: Int    = 2000
    @Published var goalProtein: Double  = 150
    @Published var goalCarbs: Double    = 200
    @Published var goalFat: Double      = 65
    @Published var goalFiber: Double    = 25
    @Published var goalWater: Int       = 2500

    // ── Published state ────────────────────────────────────────────────
    @Published var calories: Int    = 0
    @Published var protein: Double  = 0
    @Published var carbs: Double    = 0
    @Published var fat: Double      = 0
    @Published var fiber: Double    = 0
    @Published var water: Int       = 0
    @Published var mealCount: Int   = 0
    @Published var waterLog: [NutritionWaterEntry] = []
    @Published var currentMeal: String = "早餐"
    /// 手機上最近吃過的食物（後端 /api/nutrition/sql/recent，跟手機「常吃」同一份）
    @Published var recentFoods: [NutritionFoodItem] = []
    @Published var selectedFoods: Set<String> = []
    @Published var isSyncing: Bool = false
    @Published var lastSyncError: String? = nil

    // ── Derived percentages ────────────────────────────────────────────
    var caloriePct:  Double { min(Double(calories) / Double(goalCalories), 1.0) }
    var proteinPct:  Double { min(protein / goalProtein, 1.0) }
    var carbsPct:    Double { min(carbs   / goalCarbs,   1.0) }
    var fatPct:      Double { min(fat     / goalFat,     1.0) }
    var fiberPct:    Double { min(fiber   / goalFiber,   1.0) }
    var waterPct:    Double { min(Double(water) / Double(goalWater), 1.0) }
    var remaining:   Int    { max(0, goalCalories - calories) }

    // ── API config (mirrors GymManager's UserDefaults keys) ───────────
    private var userId: String {
        UserDefaults.standard.string(forKey: "drvn_primaryUserId") ??
        UserDefaults.standard.stringArray(forKey: "drvn_userIds")?.first ?? ""
    }

    private var baseURL: String { WatchConfig.apiBaseURL }

    // ── Init — activate WatchConnectivity so USER_ID_SYNC updates userId ──
    override init() {
        super.init()
        if WCSession.isSupported() {
            // ⚠️ 不再自設 delegate（避免和常駐 WatchConnHub 互搶）。改監聽 hub 廣播。
            WCSession.default.activate()
        }
        NotificationCenter.default.addObserver(forName: .drvnWatchMsg, object: nil, queue: .main) { [weak self] note in
            guard let self = self, let msg = note.userInfo as? [String: Any] else { return }
            self.session(WCSession.default, didReceiveMessage: msg)
        }
    }

    // ── WCSessionDelegate stubs (required) ────────────────────────────
    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {}

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        // Capture USER_ID_SYNC from iPhone so we have userId immediately
        if let type = userInfo["type"] as? String, type == "USER_ID_SYNC",
           let uid  = userInfo["userId"] as? String, !uid.isEmpty {
            var saved = UserDefaults.standard.stringArray(forKey: "drvn_userIds") ?? []
            if !saved.contains(uid) { saved.append(uid) }
            UserDefaults.standard.set(saved, forKey: "drvn_userIds")
            UserDefaults.standard.set(uid,   forKey: "drvn_primaryUserId")
            WatchConfig.store(from: userInfo)
            // Re-fetch after receiving user identity
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.fetchTodaySummary() }
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        self.session(session, didReceiveUserInfo: message)
    }

    // ── Fetch today's totals from backend ─────────────────────────────
    func fetchTodaySummary() {
        let uid = userId
        guard !uid.isEmpty else { return }
        fetchRecentFoods()
        let today = todayDateString()
        guard let url = URL(string: "\(baseURL)/api/nutrition/sql/daily/\(uid)?date=\(today)") else { return }

        isSyncing = true
        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isSyncing = false
                if let error {
                    self.lastSyncError = error.localizedDescription
                    return
                }
                guard let data,
                      let json    = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let summary = json["summary"] as? [String: Any] else { return }

                // Map backend fields → local state
                // SUM 結果在 SQLite 可能回 Int 或 Double，兩種都吃以免漏接。
                func num(_ v: Any?) -> Double {
                    if let d = v as? Double { return d }
                    if let i = v as? Int    { return Double(i) }
                    return 0
                }
                self.calories  = Int(num(summary["calories"]).rounded())
                self.protein   =     num(summary["protein"])
                self.carbs     =     num(summary["carbs"])
                self.fat       =     num(summary["fats"])
                self.fiber     =     num(summary["fiber"])
                self.water     = Int(num(summary["water"]).rounded())
                self.mealCount =     summary["meal_count"] as? Int ?? Int(num(summary["meal_count"]))

                // 🔴 Fix(targets)：套用後端回傳的每日目標（與手機同源）。
                if let targets = json["targets"] as? [String: Any] {
                    self.goalCalories = Int(num(targets["calories"]).rounded())
                    self.goalProtein  =     num(targets["protein"])
                    self.goalCarbs    =     num(targets["carbs"])
                    self.goalFat      =     num(targets["fats"])
                    let fiberT = num(targets["fiber"]); if fiberT > 0 { self.goalFiber = fiberT }
                    let waterT = num(targets["water"]); if waterT > 0 { self.goalWater = Int(waterT.rounded()) }
                }
                self.lastSyncError = nil
            }
        }.resume()
    }

    // ── 手機最近吃過的食物（每一份的熱量與營養，照手機記錄時的份量）──
    func fetchRecentFoods() {
        let uid = userId
        guard !uid.isEmpty, let url = URL(string: "\(baseURL)/api/nutrition/sql/recent/\(uid)") else { return }
        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { [weak self] data, _, _ in
            guard let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rows = json["results"] as? [[String: Any]] else { return }
            func num(_ v: Any?) -> Double {
                if let d = v as? Double { return d }
                if let i = v as? Int { return Double(i) }
                return 0
            }
            let foods: [NutritionFoodItem] = rows.prefix(12).enumerated().compactMap { i, r in
                guard let name = r["name"] as? String, !name.isEmpty else { return nil }
                let g = num(r["serving_size_g"]) > 0 ? num(r["serving_size_g"]) : 100
                let k = g / 100   // 後端給的是每 100 克，換成「一份」
                return NutritionFoodItem(id: "recent_\(i)", emoji: "🍽️", name: name,
                                         kcal: Int((num(r["calories"]) * k).rounded()),
                                         protein: (num(r["protein"]) * k).rounded(),
                                         carbs: (num(r["carbs"]) * k).rounded(),
                                         fat: (num(r["fats"]) * k).rounded(),
                                         fiber: (num(r["fiber"]) * k).rounded(),
                                         grams: g)
            }
            DispatchQueue.main.async {
                guard let self else { return }
                let hadNone = self.recentFoods.isEmpty
                self.recentFoods = foods
                if hadNone && !foods.isEmpty { self.currentMeal = "常吃" }
            }
        }.resume()
    }

    /// 目前分頁的食物：「常吃」= 手機最近吃過的，其餘 = 內建清單
    func foods(for meal: String) -> [NutritionFoodItem] {
        meal == "常吃" ? recentFoods : (nutritionFoodDB[meal] ?? [])
    }

    // ── Toggle food selection ─────────────────────────────────────────
    func toggleFood(_ id: String) {
        if selectedFoods.contains(id) { selectedFoods.remove(id) }
        else { selectedFoods.insert(id) }
    }

    // ── 一鍵紀錄單一食物（One-tap log）─────────────────────────────────
    /// 點一下卡片立即紀錄該食物，無需多選 + 確認。
    @Published var lastLoggedId: String? = nil   // 給 UI 顯示「已紀錄」的瞬時回饋
    func logFood(_ food: NutritionFoodItem) {
        calories += food.kcal
        protein  += food.protein
        carbs    += food.carbs
        fat      += food.fat
        fiber    += food.fiber
        mealCount += 1
        postFoodLog(food, meal: currentMeal)   // async POST
        WKInterfaceDevice.current().play(.success)

        // 瞬時「已紀錄」標記
        lastLoggedId = food.id
        let thisId = food.id
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) { [weak self] in
            if self?.lastLoggedId == thisId { self?.lastLoggedId = nil }
        }
    }

    // ── Log selected foods (local + backend) ──────────────────────────
    func logSelectedFoods() {
        let mealFoods = foods(for: currentMeal)
        let toLog = mealFoods.filter { selectedFoods.contains($0.id) }
        // Optimistic local update
        for f in toLog {
            calories += f.kcal
            protein  += f.protein
            carbs    += f.carbs
            fat      += f.fat
            fiber    += f.fiber
            postFoodLog(f, meal: currentMeal)   // async POST
        }
        if !toLog.isEmpty { mealCount += 1 }
        selectedFoods.removeAll()
        WKInterfaceDevice.current().play(.success)
    }

    // ── Add water (local + backend) ───────────────────────────────────
    func addWater(_ ml: Int) {
        water += ml
        waterLog.insert(NutritionWaterEntry(time: Date(), ml: ml), at: 0)
        postWaterLog(ml)   // async POST
        WKInterfaceDevice.current().play(.click)
    }

    // ── Private: POST food entry ──────────────────────────────────────
    private func postFoodLog(_ food: NutritionFoodItem, meal: String) {
        let uid = userId
        guard !uid.isEmpty, let url = URL(string: "\(baseURL)/api/nutrition/sql/log") else { return }

        let body: [String: Any] = [
            "user_id":   uid,
            "name":      "\(food.emoji) \(food.name)",
            "calories":  food.kcal,
            "protein":   food.protein,
            "carbs":     food.carbs,
            "fats":      food.fat,
            "fiber":     food.fiber,
            "grams":     food.grams,
            "water_ml":  0,
            "date":      todayDateString(),
            "timestamp": isoNow()
        ]
        postJSON(to: url, body: body)
    }

    // ── Private: POST water entry ─────────────────────────────────────
    private func postWaterLog(_ ml: Int) {
        let uid = userId
        guard !uid.isEmpty, let url = URL(string: "\(baseURL)/api/nutrition/sql/log") else { return }

        let body: [String: Any] = [
            "user_id":   uid,
            "name":      "💧 水 (Apple Watch)",
            "calories":  0,
            "protein":   0,
            "carbs":     0,
            "fats":      0,
            "fiber":     0,
            "grams":     0,
            "water_ml":  ml,
            "date":      todayDateString(),
            "timestamp": isoNow()
        ]
        postJSON(to: url, body: body)
    }

    // ── Shared URLSession POST helper ─────────────────────────────────
    private func postJSON(to url: URL, body: [String: Any]) {
        var req = WatchConfig.authed(url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 10
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        req.httpBody = data
        URLSession.shared.dataTask(with: req) { [weak self] _, resp, error in
            if let error {
                DispatchQueue.main.async { self?.lastSyncError = error.localizedDescription }
            }
        }.resume()
    }

    // ── Date helpers ──────────────────────────────────────────────────
    private func todayDateString() -> String {
        // 後端日期 key：固定西曆＋POSIX，避免手錶設成佛曆／日本曆或 12 小時制地區時送出「2569-…」之類的錯日期
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
    private func isoNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Root View
// ══════════════════════════════════════════════════════

struct NutritionView: View {
    @StateObject private var mgr = NutritionManager()
    var onBack: () -> Void = {}

    var body: some View {
        TabView {
            NutritionDashboard(mgr: mgr, onBack: onBack)
            NutritionQuickAdd(mgr: mgr)
            NutritionHydration(mgr: mgr)
        }
        .tabViewStyle(.page)
        .background(Color.nutBg.ignoresSafeArea())
        .onAppear { mgr.fetchTodaySummary() }
        // Sync status overlay — tiny dot in corner while talking to backend
        .overlay(alignment: .topTrailing) {
            if mgr.isSyncing {
                Circle()
                    .fill(Color(hex: "4EA8DE").opacity(0.85))
                    .frame(width: 5, height: 5)
                    .padding(6)
            } else if mgr.lastSyncError != nil {
                Circle()
                    .fill(Color.nutEmber.opacity(0.85))
                    .frame(width: 5, height: 5)
                    .padding(6)
            }
        }
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Screen 1: Dashboard
// ══════════════════════════════════════════════════════

struct NutritionDashboard: View {
    @ObservedObject var mgr: NutritionManager
    var onBack: () -> Void = {}

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {

                // ── Header bar ───────────────────────────────
                HStack {
                    Button(action: { WKInterfaceDevice.current().play(.click); onBack() }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.nutPebble)
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    Text(timeString())
                        .font(.system(size: 11, weight: .thin))
                        .foregroundColor(.nutPebble)

                    Spacer()

                    Text(dateString())
                        .font(.system(size: 8, weight: .semibold))
                        .tracking(1.2)
                        .foregroundColor(.nutPebble.opacity(0.5))
                }
                .padding(.horizontal, 12)
                .padding(.top, 1)
                .padding(.bottom, 2)

                // ── Semicircular calorie arc gauge ────────────
                ZStack(alignment: .bottom) {
                    CalorieArcGauge(progress: mgr.caloriePct)
                        .frame(width: geo.size.width - 24,
                               height: (geo.size.width - 24) / 2 + 14)

                    VStack(spacing: 1) {
                        Text("\(mgr.calories)")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.nutPaper)
                        Text("KCAL")
                            .font(.system(size: 8, weight: .black))
                            .tracking(2.5)
                            .foregroundColor(.nutEmber)
                        Text(mgr.calories >= mgr.goalCalories ? "GOAL ✓" : "\(mgr.remaining) LEFT")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.nutPebble)
                        // Tap to refresh from backend
                        Text(mgr.isSyncing ? "SYNCING…" : "↻ REFRESH")
                            .font(.system(size: 8, weight: .black))
                            .tracking(0.8)
                            .foregroundColor(.nutPebble.opacity(0.4))
                            .onTapGesture { mgr.fetchTodaySummary() }
                    }
                    .padding(.bottom, 4)
                }
                .frame(height: (geo.size.width - 24) / 2 + 14)
                .padding(.horizontal, 12)
                .padding(.top, 0)

                // ── 4 Macro gradient arc rings ────────────────
                HStack(spacing: 6) {
                    MacroArcRing(pct: mgr.proteinPct,
                                 value: "\(Int(mgr.protein))g",
                                 label: "PROT",
                                 arcColor: .nutProtein)
                    MacroArcRing(pct: mgr.carbsPct,
                                 value: "\(Int(mgr.carbs))g",
                                 label: "CARB",
                                 arcColor: .nutCarbs)
                    MacroArcRing(pct: mgr.fatPct,
                                 value: "\(Int(mgr.fat))g",
                                 label: "FAT",
                                 arcColor: .nutFat)
                    MacroArcRing(pct: mgr.fiberPct,
                                 value: "\(Int(mgr.fiber))g",
                                 label: "FIBR",
                                 arcColor: .nutFiber)
                }
                .padding(.horizontal, 12)
                .padding(.top, 3)

                // ── Thin divider ─────────────────────────────
                Rectangle()
                    .fill(Color.nutPebble.opacity(0.15))
                    .frame(height: 0.5)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 5)

                // ── Stats row ─────────────────────────────────
                HStack(spacing: 0) {
                    NutStatCell(value: "\(mgr.mealCount)", label: "MEALS")
                    Rectangle().fill(Color.nutPebble.opacity(0.2)).frame(width: 0.5)
                    NutStatCell(value: "\(mgr.water)", label: "ML H₂O")
                    Rectangle().fill(Color.nutPebble.opacity(0.2)).frame(width: 0.5)
                    NutStatCell(value: "\(Int(mgr.waterPct * 100))%", label: "HYDRATED")
                }
                .padding(.horizontal, 12)

                Spacer(minLength: 0)
            }
        }
        .background(Color.nutBg)
    }

    private func timeString() -> String {
        let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: Date())
    }
    private func dateString() -> String {
        let f = DateFormatter(); f.dateFormat = "EEE d MMM"
        return f.string(from: Date()).uppercased()
    }
}

// ── Semicircular calorie arc gauge (true 180°, linear 0–100%) ──
// 使用 Circle().trim + rotation(180°) 避免 clockwise 語意在 SwiftUI/UIKit 的混淆。
// SwiftUI Circle 從 3 o'clock 順時針開始：
//   trim(0, 0.5)          = 右半圓 (3→6→9)
//   + rotation(180°)      = 上半圓 (9→12→3，即 left→top→right)  ✓
// 進度：trim(0, pct*0.5) + rotation(180°) = 從左端往右填滿
// arc center 放在 frame 底邊，.clipped() 確保下半不顯示
struct CalorieArcGauge: View {
    var progress: Double
    private let sw: CGFloat = 7

    var body: some View {
        GeometryReader { geo in
            let W = geo.size.width
            let H = geo.size.height
            let diameter = W - sw - 4
            let r        = diameter / 2
            let pct      = min(max(progress, 0), 1)

            ZStack {
                // ── 1. Dark track (全上半弧，always 180°) ──────────
                Circle()
                    .trim(from: 0, to: 0.5)
                    .rotation(Angle(degrees: 180))
                    .stroke(Color(white: 0.12),
                            style: StrokeStyle(lineWidth: sw, lineCap: .round))
                    .frame(width: diameter, height: diameter)
                    .position(x: W / 2, y: H)   // 圓心貼在 frame 底邊

                // ── 2. Swiss tick marks (Canvas 直接用 cos/sin) ─────
                Canvas { ctx, _ in
                    for i in 0...24 {
                        let frac  = Double(i) / 24.0
                        // π + frac*π 從左(180°)掃到右(360°)經過頂(270°)
                        let angle = Double.pi + frac * Double.pi
                        let isMaj = i % 6 == 0
                        let r1 = r - CGFloat(isMaj ? 14 : 9)
                        let r2 = r - CGFloat(isMaj ? 7  : 5)
                        var tick = Path()
                        tick.move(to: CGPoint(x: W / 2 + r1 * cos(angle),
                                             y: H       + r1 * sin(angle)))
                        tick.addLine(to: CGPoint(x: W / 2 + r2 * cos(angle),
                                                 y: H       + r2 * sin(angle)))
                        ctx.stroke(tick,
                                   with: .color(Color(white: isMaj ? 0.34 : 0.20)),
                                   style: StrokeStyle(lineWidth: isMaj ? 1.5 : 0.8))
                    }
                }
                .frame(width: W, height: H)

                // ── 3. Progress arc (0%=沒有, 100%=全上半弧) ────────
                Circle()
                    .trim(from: 0, to: pct * 0.5)
                    .rotation(Angle(degrees: 180))
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color(hex: "D94030").opacity(0.50),
                                Color(hex: "E84030").opacity(0.85),
                                Color(hex: "F95C4B")
                            ],
                            startPoint: .leading,
                            endPoint:   .trailing
                        ),
                        style: StrokeStyle(lineWidth: sw, lineCap: .round)
                    )
                    .frame(width: diameter, height: diameter)
                    .position(x: W / 2, y: H)
                    .animation(.easeInOut(duration: 0.5), value: pct)

                // ── 4. Inner gloss ring ──────────────────────────────
                Circle()
                    .trim(from: 0, to: 0.5)
                    .rotation(Angle(degrees: 180))
                    .stroke(Color.white.opacity(0.07), lineWidth: 0.6)
                    .frame(width: diameter - sw, height: diameter - sw)
                    .position(x: W / 2, y: H)
            }
        }
        .clipped()  // 下半圓（超出 frame 底邊）不顯示
    }
}

// ── Macro gradient arc ring (full 360°) ──────────────
struct MacroArcRing: View {
    var pct:      Double
    var value:    String
    var label:    String
    var arcColor: Color

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                // 1. 金屬深色底盤
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(white: 0.15), Color(white: 0.05)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 36, height: 36)
                    .overlay(Circle().stroke(Color(white: 0.25), lineWidth: 0.5)) // 金屬邊緣高光

                // 2. 實心扇形進度 (利用 lineWidth 等於半徑 18 的技巧，完美填滿成實心扇形)
                Circle()
                    .trim(from: 0, to: max(pct, 0.001))
                    .stroke(
                        AngularGradient(
                            colors: [arcColor.opacity(0.3), arcColor],
                            center: .center,
                            startAngle: .degrees(-90),
                            endAngle: .degrees(-90 + 360 * max(pct, 0.001))
                        ),
                        style: StrokeStyle(lineWidth: 18, lineCap: .butt) 
                    )
                    .frame(width: 18, height: 18) 
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.5), value: pct)
            }
            .frame(width: 36, height: 36)

            // 因為變成了實心，我們將數值與標籤移到底部對齊
            Text(value)
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.nutPaper)
                .padding(.top, 2)
            
            Text(label)
                .font(.system(size: 8, weight: .black))
                .tracking(0.8)
                .foregroundColor(.nutPebble)
        }
        .frame(maxWidth: .infinity)
    }
}

// ── Stat cell ─────────────────────────────────────────
struct NutStatCell: View {
    var value: String
    var label: String

    var body: some View {
        VStack(spacing: 1) {
            Text(value)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.nutPaper)
            Text(label)
                .font(.system(size: 8, weight: .black))
                .tracking(0.8)
                .foregroundColor(.nutPebble.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Screen 2: Quick Add
// ══════════════════════════════════════════════════════

struct NutritionQuickAdd: View {
    @ObservedObject var mgr: NutritionManager
    private var meals: [String] { (mgr.recentFoods.isEmpty ? [] : ["常吃"]) + ["早餐","午餐","晚餐","點心"] }

    var body: some View {
        VStack(spacing: 0) {
            // Header — 一鍵紀錄提示
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text("QUICK ADD")
                        .font(.system(size: 11, weight: .black))
                        .tracking(1.5)
                        .foregroundColor(.nutPaper)
                    Text("點一下立即紀錄")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.nutPebble)
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 6)

            // Meal tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(meals, id: \.self) { meal in
                        Button(action: {
                            WKInterfaceDevice.current().play(.click)
                            mgr.currentMeal = meal
                        }) {
                            Text(meal)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(mgr.currentMeal == meal ? .nutBg : .nutPebble)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(mgr.currentMeal == meal ? Color.nutPaper : Color(white: 0.1))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
            }
            .padding(.bottom, 2)

            // ── 一鍵食物卡（單欄大卡，點擊即紀錄）──
            let foods = mgr.foods(for: mgr.currentMeal)
            ScrollView(showsIndicators: false) {
                VStack(spacing: 7) {
                    ForEach(foods) { food in
                        NutFoodCard(
                            food: food,
                            justLogged: mgr.lastLoggedId == food.id,
                            onTap: { mgr.logFood(food) }
                        )
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 8)
                .padding(.bottom, 12)
            }
        }
        .background(Color.nutBg)
    }
}

// 一鍵大卡：整張卡是點擊區，點擊立即紀錄並閃現「已紀錄」綠勾
struct NutFoodCard: View {
    var food: NutritionFoodItem
    var justLogged: Bool
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 11) {
                // emoji 圓徽
                Text(food.emoji)
                    .font(.system(size: 24))
                    .frame(width: 42, height: 42)
                    .background(
                        Circle().fill(Color.white.opacity(0.06))
                            .overlay(Circle().stroke(Color.nutPebble.opacity(0.18), lineWidth: 0.6))
                    )

                VStack(alignment: .leading, spacing: 1) {
                    Text(food.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.nutPaper)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text("\(food.kcal)")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.nutStone)
                            .monospacedDigit()
                            .fixedSize()
                        Text("KCAL")
                            .font(.system(size: 8, weight: .black))
                            .tracking(0.8)
                            .foregroundColor(.nutPebble)
                            .fixedSize()
                    }
                    Text("P\(Int(food.protein)) C\(Int(food.carbs)) F\(Int(food.fat))")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.nutPebble.opacity(0.75))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .layoutPriority(1)
                Spacer(minLength: 4)

                // 右側：一鍵紀錄狀態圖示
                ZStack {
                    if justLogged {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.nutFiber) // Sage 綠 — 已紀錄
                            .transition(.scale.combined(with: .opacity))
                    } else {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.nutCoral)
                    }
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: justLogged)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 56)   // 放大點擊區
            .drvnGlass(tint: Color.white.opacity(0.08), corner: 16)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(
                        justLogged ? Color.nutFiber.opacity(0.7) : Color.nutPebble.opacity(0.30),
                        lineWidth: justLogged ? 1.0 : 0.7
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Screen 3: Hydration
// ══════════════════════════════════════════════════════

struct NutritionHydration: View {
    @ObservedObject var mgr: NutritionManager

    var body: some View {
        VStack(spacing: 0) {

            // Header
            HStack {
                Text("HYDRATION")
                    .font(.system(size: 11, weight: .black))
                    .tracking(1.5)
                    .foregroundColor(.nutPaper)
                Spacer()
                Text("GOAL \(mgr.goalWater)ML")
                    .font(.system(size: 8, weight: .bold))
                    .tracking(0.8)
                    .foregroundColor(.nutPebble.opacity(0.5))
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)

            // Water dial (gradient arc, blue)
            ZStack {
                // Track
                Circle()
                    .stroke(Color(white: 0.11), lineWidth: 8)
                    .frame(width: 96, height: 96)

                // Swiss tick marks
                Canvas { ctx, size in
                    let cx = size.width / 2, cy = size.height / 2
                    let r = size.width / 2 - 2
                    for i in 0..<60 {
                        let angle = Double(i) / 60.0 * 2 * .pi - .pi / 2
                        let isMaj = i % 5 == 0
                        let r1 = r - (isMaj ? CGFloat(10) : CGFloat(6))
                        let r2 = r - (isMaj ? CGFloat(5)  : CGFloat(4))
                        var t = Path()
                        t.move(to:    CGPoint(x: cx + r1 * cos(angle), y: cy + r1 * sin(angle)))
                        t.addLine(to: CGPoint(x: cx + r2 * cos(angle), y: cy + r2 * sin(angle)))
                        ctx.stroke(t, with: .color(Color(white: isMaj ? 0.25 : 0.15)),
                                   style: StrokeStyle(lineWidth: isMaj ? 1.2 : 0.7))
                    }
                }
                .frame(width: 96, height: 96)

                // Solid Conic Disc (利用 lineWidth=48 填滿半徑)
                Circle()
                    .trim(from: 0, to: max(mgr.waterPct, 0.001))
                    .stroke(
                        AngularGradient(
                            colors: [
                                Color(hex: "4EA8DE").opacity(0.3),
                                Color(hex: "4EA8DE").opacity(0.8),
                                Color(hex: "4EA8DE")
                            ],
                            center: .center,
                            startAngle: .degrees(-90),
                            endAngle:   .degrees(-90 + 360 * max(mgr.waterPct, 0.001))
                        ),
                        style: StrokeStyle(lineWidth: 48, lineCap: .butt) 
                    )
                    .frame(width: 48, height: 48) // Frame is radius*2 for the stroke to fill
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.4), value: mgr.waterPct)

                VStack(spacing: 1) {
                    Text("\(mgr.water)")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.nutPaper)
                    Text("ML")
                        .font(.system(size: 8, weight: .black))
                        .tracking(1.5)
                        .foregroundColor(Color(hex: "4EA8DE"))
                    Text("\(Int(mgr.waterPct * 100))%")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.nutPebble)
                }
            }
            .frame(height: 100)
            .padding(.vertical, 4)

            // Progress bar
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(white: 0.1)).frame(height: 3)
                    Capsule()
                        .fill(Color(hex: "4EA8DE"))
                        .frame(width: g.size.width * mgr.waterPct, height: 3)
                        .animation(.easeInOut(duration: 0.4), value: mgr.waterPct)
                }
            }
            .frame(height: 3)
            .padding(.horizontal, 16)
            .padding(.bottom, 6)

            // Add buttons
            HStack(spacing: 5) {
                NutWaterBtn(emoji: "💧", amount: 250, label: "GLASS",  onTap: { mgr.addWater(250) })
                NutWaterBtn(emoji: "🍶", amount: 500, label: "BOTTLE", onTap: { mgr.addWater(500) })
                NutWaterBtn(emoji: "🫙", amount: 750, label: "LARGE",  onTap: { mgr.addWater(750) })
            }
            .padding(.horizontal, 10)

            // Log
            VStack(alignment: .leading, spacing: 0) {
                Text("TODAY'S LOG")
                    .font(.system(size: 8, weight: .black))
                    .tracking(1.2)
                    .foregroundColor(.nutPebble.opacity(0.5))
                    .padding(.bottom, 4)

                if mgr.waterLog.isEmpty {
                    Text("No entries yet")
                        .font(.system(size: 9))
                        .foregroundColor(.nutPebble.opacity(0.4))
                } else {
                    ForEach(mgr.waterLog.prefix(3)) { entry in
                        HStack {
                            Text(entry.time.formatted(date: .omitted, time: .shortened))
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.nutPebble)
                            Spacer()
                            Text("+\(entry.ml)ML")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.nutStone)
                        }
                        .padding(.vertical, 3)
                        Rectangle().fill(Color.nutPebble.opacity(0.12)).frame(height: 0.5)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 6)

            Spacer(minLength: 0)
        }
        .background(Color.nutBg)
    }
}

struct NutWaterBtn: View {
    var emoji: String
    var amount: Int
    var label: String
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 2) {
                Text(emoji).font(.system(size: 14))
                Text("+\(amount)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.nutPaper)
                Text(label)
                    .font(.system(size: 8, weight: .black))
                    .tracking(0.5)
                    .foregroundColor(.nutPebble.opacity(0.6))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .drvnGlass(tint: Color(hex: "4EA8DE").opacity(0.35), corner: 10)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color(hex: "89C4E8").opacity(0.75),
                                Color(hex: "4EA8DE").opacity(0.35),
                                Color.clear
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.7
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// ══════════════════════════════════════════════════════
// MARK: - Preview
// ══════════════════════════════════════════════════════

#Preview {
    NutritionView()
}
