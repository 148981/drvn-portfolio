import SwiftUI
import HealthKit
import Combine

// ══════════════════════════════════════════════════════════════════════════
// MARK: - DRVN Standby — AVANT-GARDE ATHLETIC EDITORIAL
// 視覺核心：出血排版 · 動態幾何流體 · 絕對大字 · 零容器設計
// ══════════════════════════════════════════════════════════════════════════

// MARK: - Watch Layout & Grid
enum WatchLayout {
    #if os(watchOS)
    static let screen = WKInterfaceDevice.current().screenBounds
    #else
    static let screen = CGRect(x: 0, y: 0, width: 198, height: 242)
    #endif
    static let w = screen.width
    static let h = screen.height
    static func hero(_ ratio: CGFloat) -> CGFloat { min(w, h) * ratio }
}

extension Color {
    static let techBlack = Color.black
    static let techOrange = Color(red: 1.0, green: 0.27, blue: 0.0) // 機能橘紅 #FF4500
    static let titaniumBase = Color(white: 0.15)
    static let titaniumHighlight = Color(white: 0.85)
    static let techGray = Color(white: 0.4)

}

// MARK: - Tech Components

// 1. 動態幾何流體 (Kinetic Fluid Geometry)
struct KineticFluidGeometry: View {
    var isReversed: Bool = false
    var body: some View {
        WatchGlassSurface(tint: Color.techOrange.opacity(0.10), corner: 28)
            .ignoresSafeArea()
    }
}

// 2. 機能雜誌感描邊字 (Stroked Editorial Text)
struct StrokedText: View {
    var text: String
    var font: Font
    var color: Color
    var lineWidth: CGFloat
    
    var body: some View {
        ZStack {
            Text(text).font(font).offset(x: -lineWidth, y: -lineWidth)
            Text(text).font(font).offset(x: lineWidth, y: -lineWidth)
            Text(text).font(font).offset(x: -lineWidth, y: lineWidth)
            Text(text).font(font).offset(x: lineWidth, y: lineWidth)
        }
        .foregroundColor(color)
        .fixedSize()
    }
}

// 3. 機能刻度式圓盤 (Watch-Scale Macro Dial)
// 3. 機能刻度式圓盤 (Watch-Scale Nutrition Gauge)
struct NutritionGaugeView: View {
    var label: String
    var value: Int
    var total: Int

    var body: some View {
        ZStack {
            // 1. 底層刻度 (白色加粗)
            ForEach(0..<12) { i in
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.4), .white.opacity(0.1)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 3.5, height: 8) 
                    .offset(y: -22)
                    .rotationEffect(.degrees(Double(i) * 30))
            }
            
            // 2. 點亮狀態 (極亮白)
            let progressCount = Int(min(Double(value) / Double(max(1, total)), 1.0) * 12)
            ForEach(0..<progressCount, id: \.self) { i in
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [.white, .titaniumHighlight, .white],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 3.8, height: 9) 
                    .offset(y: -22)
                    .rotationEffect(.degrees(Double(i) * 30))
                    .shadow(color: .white.opacity(0.9), radius: 3) 
            }
            
            VStack(spacing: -1) {
                Text("\(value)")
                    .font(.system(size: 14, weight: .heavy, design: .monospaced))
                    .foregroundColor(.white)
                
                Text(label)
                    .font(.system(size: 9, weight: .black, design: .monospaced))
                    .foregroundColor(.techOrange)
            }
        }
    }
}

// MARK: - Standby Phase (時間情境優先級判斷)
// ──────────────────────────────────────────────────────────────────
// 規則 (高 → 低):
// 1. preWorkout : 訓練前 60 min 內 (僅健身日)               → ⑤ T-MINUS
// 2. postWorkout: 訓練結束 30 min 內                          → ⑥ REPLENISH
// 3. evening    : 22:00 之後                                  → ⑦ END OF DAY
// 4. mealTime   : 早 07:30 / 午 12:30 / 晚 18:30 ± 30 min     → ③ KCAL LEFT
// 5. wakeWindow : 起床後 2 小時內 (健身日 → ② TARGET / 否則 → ① NO HUMAN)
// 6. default    : 任何時間都會輪播 (隨時)                     → ④ STEPS
// ──────────────────────────────────────────────────────────────────
enum StandbyPhase: Equatable {
    case preWorkout
    case postWorkout
    case evening
    case mealTime
    case wakeWorkout
    case wakeRecovery
    case idle   // 預設輪播 (步數)

    /// TabView 對應的 index (對應 StandbyView 的排列)
    /// 0:Morning ① / 1:HeroTarget ② / 2:KcalLeft ③ / 3:Steps ④
    /// 4:PreWorkout ⑤ / 5:PostWorkout ⑥ / 6:Evening ⑦
    var preferredIndex: Int {
        switch self {
        case .preWorkout:   return 4
        case .postWorkout:  return 5
        case .evening:      return 6
        case .mealTime:     return 2
        case .wakeWorkout:  return 1
        case .wakeRecovery: return 0
        case .idle:         return 3
        }
    }
}

// MARK: - Standby Manager (Production Data Engine)
final class StandbyManager: ObservableObject {
    private var userId: String {
        UserDefaults.standard.string(forKey: "drvn_primaryUserId") ??
        UserDefaults.standard.stringArray(forKey: "drvn_userIds")?.first ?? ""
    }
    private var baseURL: String { WatchConfig.apiBaseURL }
    private var planURL: String { WatchConfig.apiBaseURL } // /api/plan/{uid}/today
    private let healthStore = HKHealthStore()
    private var userIdObserver: NSObjectProtocol?

    init() {
        // 🟢 監聽 iPhone 透過 WCSession 推送 USER_ID_SYNC 後，ContentView 廣播的通知
        //    一旦帳號變了（清除 / OAuth 登入 / 切換帳號），立刻重新拉所有資料
        userIdObserver = NotificationCenter.default.addObserver(
            forName: .drvnUserIdDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            print("[StandbyManager] 🔁 userId 變更，重新拉所有資料")
            self?.refreshLiveData()
        }
    }

    deinit {
        if let obs = userIdObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    @Published var steps: Int = 0
    @Published var activeKcal: Int = 0
    @Published var caloriesConsumed: Int = 0
    @Published var caloriesGoal: Int = 2000
    @Published var proteinConsumed: Double = 0
    @Published var proteinGoal: Int = 180
    @Published var carbConsumed: Double = 0
    @Published var fatConsumed: Double = 0

    @Published var recoveryPct: Double = 0.88
    @Published var restingHeartRate: Int = 54
    @Published var todayPlanLabel: String = "PULL DAY"
    @Published var workoutMenu: [String] = []
    @Published var minutesToWorkout: Int = 45
    @Published var nextWorkoutTargetMain:  String = "140KG"
    @Published var preWorkoutFuel: String = "30G CARB"

    // ── 情境引擎 ────────────────────────────────
    @Published var isWorkoutDay: Bool = false
    @Published var wakeUpDate: Date? = nil      // HKSleep → 最近一次起床
    @Published var lastWorkoutEnd: Date? = nil  // HKWorkout → 今日最後一次訓練結束
    @Published var bedtimeDate: Date? = nil     // HKSleep schedule → 今日預計就寢時間
    @Published var currentPhase: StandbyPhase = .idle

    // ── 訓練時間預測 (取代固定 scheduledWorkoutDate) ────────
    // 演算法摘要 (v4.0)：
    //   1. 撈過去 60 天 HKWorkout
    //   2. 篩出與「今日 weekday」相同的樣本（週一到週日各自統計）
    //   3. 取最近 5 筆 → 依 startHour 分桶 (morning / afternoon / evening)
    //   4. 每個非空桶 → 取平均 startTime → 該時段預測值
    //   5. 都沒資料 → fallback 預設 10:00 / 15:00 / 19:00
    @Published var predictedWorkoutTimes: [Date] = []

    // Fallback 時段（依使用者敘述：早上 10、下午 3、晚上 7）
    private let defaultWorkoutHours: [Int] = [10, 15, 19]

    // 餐點時間中心點（30 分鐘容忍視窗）
    private let mealCenters: [(h:Int,m:Int)] = [(7,30),(12,30),(18,30)]

    // 體重 (kg) — 用於恢復餐推算
    var bodyWeightKg: Double {
        let w = UserDefaults.standard.double(forKey: "drvn_currentWeight")
        return w > 30 ? w : 70.0
    }

    // 推薦恢復餐 (與前端 NutritionPageMobile Recovery Fuel 公式一致)
    // 重訓: P = max(20, w*0.3) · C = max(30, w*0.6) K
    var recoveryProteinG: Int {
        max(20, Int((bodyWeightKg * 0.3).rounded()))
    }
    var recoveryCarbsG: Int {
        max(30, Int((bodyWeightKg * 0.6).rounded()))
    }

    /// 還能吃的卡路里 = 目標 − 已攝取 + 主動消耗（HealthKit Active Energy）
    /// 例：目標 2000 / 已吃 1500 / 主動消耗 300 → 還剩 2000 − 1500 + 300 = 800 kcal
    var caloriesRemaining: Int { max(0, caloriesGoal - caloriesConsumed + activeKcal) }

    // ── 情境判定 (核心優先級邏輯) ─────────────────
    func evaluatePhase(now: Date = Date()) {
        let cal = Calendar.current
        let hour = cal.component(.hour, from: now)

        // 1. 訓練前 60 min 內 (掃描所有預測時段，取最接近且尚未開始的一個)
        var bestUpcoming: (date: Date, mins: Int)? = nil
        for start in predictedWorkoutTimes {
            let interval = start.timeIntervalSince(now) // 正值=尚未開始
            guard interval > 0 && interval <= 60*60 else { continue }
            let mins = Int(ceil(interval / 60.0))
            if bestUpcoming == nil || mins < bestUpcoming!.mins {
                bestUpcoming = (start, mins)
            }
        }
        if let upcoming = bestUpcoming {
            DispatchQueue.main.async {
                self.minutesToWorkout = max(1, upcoming.mins)
                self.currentPhase = .preWorkout
            }
            return
        }

        // 2. 訓練結束 30 min 內
        if let end = lastWorkoutEnd {
            let interval = now.timeIntervalSince(end) // 正值=訓練已結束
            if interval >= 0 && interval <= 30*60 {
                DispatchQueue.main.async { self.currentPhase = .postWorkout }
                return
            }
        }

        // 3. 睡前 1 小時 ~ 凌晨 04:00
        //    若使用者在 Apple Health 設定睡眠排程 → 取偵測出的 bedtime 提前 60 min
        //    無資料 fallback：22:00 之後
        let eveningTrigger: Bool
        if let bed = bedtimeDate {
            let interval = bed.timeIntervalSince(now) // 正值=還沒睡
            eveningTrigger = interval <= 60*60        // 進入睡前 1 小時 (含已過睡點，凌晨也算)
        } else {
            eveningTrigger = (hour >= 22 || hour < 4)
        }
        if eveningTrigger {
            DispatchQueue.main.async { self.currentPhase = .evening }
            return
        }

        // 4. 三餐 ±30 min 視窗
        for c in mealCenters {
            var comp = cal.dateComponents([.year,.month,.day], from: now)
            comp.hour = c.h; comp.minute = c.m
            if let center = cal.date(from: comp),
               abs(now.timeIntervalSince(center)) <= 30*60 {
                DispatchQueue.main.async { self.currentPhase = .mealTime }
                return
            }
        }

        // 5. 起床後 2 小時內視窗
        if let wake = wakeUpDate,
           cal.isDate(wake, inSameDayAs: now),
           now.timeIntervalSince(wake) >= 0,
           now.timeIntervalSince(wake) <= 2*60*60 {
            DispatchQueue.main.async {
                self.currentPhase = self.isWorkoutDay ? .wakeWorkout : .wakeRecovery
            }
            return
        }

        // 6. Fallback — 一般時段，輪播步數圖
        DispatchQueue.main.async { self.currentPhase = .idle }
    }

    func refreshLiveData() {
        fetchUserGoals()       // 🟢 先抓使用者「個人化」目標（卡路里 / 蛋白質），覆蓋預設 2000
        fetchHealthKit()       // 步數 + 主動消耗
        fetchNutritionSummary()// 後端 daily summary（依 userId）
        fetchWakeUpTime()
        fetchLastWorkoutEnd()
        fetchTodayPlan()
        fetchPredictedWorkoutTimes()
        fetchBedtime()
        // 等資料回來後 evaluatePhase 會被各 fetch 呼叫；此處先做一次粗判
        evaluatePhase()
    }

    // ══════════════════════════════════════════════════════════════
    // MARK: - 就寢時間偵測 (Bedtime Detector)
    // ══════════════════════════════════════════════════════════════
    // 邏輯：
    //   1. 讀取最近 14 天 HKSleepAnalysis 的 inBed (或 asleep*) 樣本
    //   2. 取每筆 startDate 的「分鐘自午夜」(0–1439)
    //   3. 由於跨夜睡眠常 < 04:00 開始 (例: 23:30 / 00:15)，
    //      把 [00:00~04:00) 加 24h 視為前一天延續，避免平均被拉偏
    //   4. 取中位數 → 投影到今日相同 hh:mm
    //   5. 完全無資料 → bedtimeDate = nil → evaluatePhase 退回 22:00 邏輯
    private func fetchBedtime() {
        guard HKHealthStore.isHealthDataAvailable(),
              let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return }
        let cal = Calendar.current
        let now = Date()
        guard let from = cal.date(byAdding: .day, value: -14, to: now) else { return }
        let pred = HKQuery.predicateForSamples(withStart: from, end: now, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let q = HKSampleQuery(sampleType: sleepType, predicate: pred, limit: 200, sortDescriptors: [sort]) { [weak self] _, samples, _ in
            guard let self = self else { return }
            guard let cats = samples as? [HKCategorySample] else {
                DispatchQueue.main.async { self.bedtimeDate = nil; self.evaluatePhase() }
                return
            }
            // 過濾出 inBed / asleepCore / asleepDeep / asleepREM / asleepUnspecified
            let inBedRaw = HKCategoryValueSleepAnalysis.inBed.rawValue
            let asleepRaws: Set<Int> = {
                if #available(watchOS 9.0, *) {
                    return [
                        HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                        HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                        HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                        HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
                    ]
                } else {
                    return [HKCategoryValueSleepAnalysis.asleep.rawValue]
                }
            }()
            // 一次睡眠通常會有多筆樣本，只取每天最早的一筆當「就寢時刻」
            let dayStartGrouped = Dictionary(grouping: cats.filter {
                $0.value == inBedRaw || asleepRaws.contains($0.value)
            }) { sample -> Date in
                cal.startOfDay(for: sample.startDate)
            }
            let bedStarts: [Date] = dayStartGrouped.values.compactMap { samples in
                samples.min(by: { $0.startDate < $1.startDate })?.startDate
            }
            guard !bedStarts.isEmpty else {
                DispatchQueue.main.async { self.bedtimeDate = nil; self.evaluatePhase() }
                return
            }

            // 計算 minutes-from-midnight，並把凌晨 00:00–03:59 視為「前一日延續」(+1440)
            let minutes: [Int] = bedStarts.map { d in
                let comp = cal.dateComponents([.hour, .minute], from: d)
                let m = (comp.hour ?? 0) * 60 + (comp.minute ?? 0)
                return (comp.hour ?? 0) < 4 ? m + 24 * 60 : m
            }
            let sorted = minutes.sorted()
            let median = sorted[sorted.count / 2]
            let bedHourMin = median % (24 * 60)
            let h = bedHourMin / 60
            let m = bedHourMin % 60

            // 投影到今日 (若 hour < 4 表示是凌晨入睡 → 算「明天凌晨」)
            var comp = cal.dateComponents([.year,.month,.day], from: now)
            comp.hour = h
            comp.minute = m
            var bed = cal.date(from: comp)
            if h < 4, let b = bed {
                bed = cal.date(byAdding: .day, value: 1, to: b)
            }
            // 若推算出的 bed 已經早於 now (今日 23:30 但現在已經是隔天 00:30 之前算進化)
            if let b = bed, b.timeIntervalSince(now) < -6*60*60 {
                bed = cal.date(byAdding: .day, value: 1, to: b)
            }
            DispatchQueue.main.async {
                self.bedtimeDate = bed
                self.evaluatePhase()
            }
        }
        healthStore.execute(q)
    }

    // ══════════════════════════════════════════════════════════════
    // MARK: - 訓練時間預測演算法 (Workout Time Forecaster v4.0)
    // ══════════════════════════════════════════════════════════════
    // 規則：
    //   • 取過去 60 天 HKWorkout
    //   • 先試「今日 weekday 的最近 5 筆」 → 樣本不足 (<3) 則改用「全部 weekday 的最近 5 筆」
    //   • 依 startHour 分三桶：morning [04-11) / afternoon [11-17) / evening [17-04)
    //   • 每個非空桶 → 平均 startTime (分鐘) → 一個預測時段
    //   • 完全沒資料 → 套用預設 10:00 / 15:00 / 19:00
    private func fetchPredictedWorkoutTimes() {
        guard HKHealthStore.isHealthDataAvailable() else {
            applyDefaultPredictedTimes(); return
        }
        let cal = Calendar.current
        let now = Date()
        let todayWeekday = cal.component(.weekday, from: now) // 1=Sun ... 7=Sat
        guard let from = cal.date(byAdding: .day, value: -60, to: now) else {
            applyDefaultPredictedTimes(); return
        }
        let pred = HKQuery.predicateForSamples(withStart: from, end: now, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let q = HKSampleQuery(sampleType: .workoutType(),
                              predicate: pred,
                              limit: 100,
                              sortDescriptors: [sort]) { [weak self] _, samples, _ in
            guard let self = self else { return }
            guard let workouts = samples as? [HKWorkout], !workouts.isEmpty else {
                self.applyDefaultPredictedTimes(); return
            }

            // ── 1. 過濾「相同 weekday」的樣本 ────────────────
            let sameWeekday = workouts.filter {
                cal.component(.weekday, from: $0.startDate) == todayWeekday
            }

            // ── 2. 樣本不足 → 退回全 weekday 的近 5 筆 ───────
            let picked: [HKWorkout]
            if sameWeekday.count >= 3 {
                picked = Array(sameWeekday.prefix(5))
            } else {
                picked = Array(workouts.prefix(5))
            }

            // ── 3. 依時段分桶 (處理早晚極端不同) ─────────────
            //   morning : 04-11h
            //   afternoon: 11-17h
            //   evening  : 17h - 04h (跨夜算晚上)
            var buckets: [String: [Int]] = ["morning": [], "afternoon": [], "evening": []]
            for w in picked {
                let comp = cal.dateComponents([.hour, .minute], from: w.startDate)
                let h = comp.hour ?? 0
                let mins = h * 60 + (comp.minute ?? 0)
                let key: String
                if (4..<11).contains(h)      { key = "morning" }
                else if (11..<17).contains(h) { key = "afternoon" }
                else                          { key = "evening" }
                buckets[key, default: []].append(mins)
            }

            // ── 4. 每個非空桶取平均 → 今日預測 Date ──────────
            var predicted: [Date] = []
            var todayComp = cal.dateComponents([.year, .month, .day], from: now)
            for (_, mins) in buckets where !mins.isEmpty {
                let avg = mins.reduce(0, +) / mins.count
                todayComp.hour   = avg / 60
                todayComp.minute = avg % 60
                if let d = cal.date(from: todayComp) { predicted.append(d) }
            }

            if predicted.isEmpty {
                self.applyDefaultPredictedTimes(); return
            }

            DispatchQueue.main.async {
                self.predictedWorkoutTimes = predicted.sorted()
                self.evaluatePhase()
            }
        }
        healthStore.execute(q)
    }

    /// 沒任何歷史 → 套用預設早上 10、下午 3、晚上 7
    private func applyDefaultPredictedTimes() {
        let cal = Calendar.current
        var c = cal.dateComponents([.year,.month,.day], from: Date())
        let dates: [Date] = defaultWorkoutHours.compactMap { h in
            c.hour = h; c.minute = 0
            return cal.date(from: c)
        }
        DispatchQueue.main.async {
            self.predictedWorkoutTimes = dates
            self.evaluatePhase()
        }
    }

    private func fetchHealthKit() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        let kcalType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
        let start = Calendar.current.startOfDay(for: Date())
        let pred  = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        healthStore.execute(HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: pred, options: .cumulativeSum) { [weak self] _,r,_ in
            let v = r?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            DispatchQueue.main.async { self?.steps = Int(v) }
        })
        healthStore.execute(HKStatisticsQuery(quantityType: kcalType, quantitySamplePredicate: pred, options: .cumulativeSum) { [weak self] _,r,_ in
            let v = r?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
            DispatchQueue.main.async { self?.activeKcal = Int(v) }
        })
    }

    // ── HealthKit: 抓最近一次「起床時刻」 ────────────────────
    // 取近 18 小時內 sleepAnalysis 樣本，找最後一筆 endDate
    private func fetchWakeUpTime() {
        guard HKHealthStore.isHealthDataAvailable(),
              let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return }
        let now = Date()
        let from = now.addingTimeInterval(-18*60*60)
        let pred = HKQuery.predicateForSamples(withStart: from, end: now, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: sleepType, predicate: pred, limit: 50, sortDescriptors: [sort]) { [weak self] _, samples, _ in
            guard let self = self,
                  let s = (samples as? [HKCategorySample])?.first(where: {
                      // 排除 awake；inBed / asleep* 結尾可視為起床點
                      $0.value != HKCategoryValueSleepAnalysis.awake.rawValue
                  }) else {
                DispatchQueue.main.async {
                    // 無睡眠資料 → 使用預設 07:00 作為起床時間 fallback
                    var c = Calendar.current.dateComponents([.year,.month,.day], from: Date())
                    c.hour = 7; c.minute = 0
                    self?.wakeUpDate = Calendar.current.date(from: c)
                    self?.evaluatePhase()
                }
                return
            }
            DispatchQueue.main.async {
                self.wakeUpDate = s.endDate
                self.evaluatePhase()
            }
        }
        healthStore.execute(q)
    }

    // ── HealthKit: 抓今日最近一次 Workout 結束時刻 ─────────
    private func fetchLastWorkoutEnd() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let start = Calendar.current.startOfDay(for: Date())
        let pred = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: .workoutType(), predicate: pred, limit: 1, sortDescriptors: [sort]) { [weak self] _, samples, _ in
            guard let self = self else { return }
            DispatchQueue.main.async {
                self.lastWorkoutEnd = (samples?.first as? HKWorkout)?.endDate
                self.evaluatePhase()
            }
        }
        healthStore.execute(q)
    }

    // ── 今日訓練計劃 (rest day vs workout day) ────────────
    private func fetchTodayPlan() {
        let uid = userId; guard !uid.isEmpty else {
            // 無使用者 ID：fallback — UserDefaults 手動標記
            DispatchQueue.main.async {
                self.isWorkoutDay = UserDefaults.standard.bool(forKey: "drvn_isWorkoutDayOverride")
                self.evaluatePhase()
            }
            return
        }
        guard let url = URL(string: "\(planURL)/api/plan/\(uid)/today") else { return }
        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { [weak self] data, _, _ in
            guard let self = self else { return }
            guard let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String:Any] else {
                DispatchQueue.main.async {
                    self.isWorkoutDay = UserDefaults.standard.bool(forKey: "drvn_isWorkoutDayOverride")
                    self.evaluatePhase()
                }
                return
            }
            let isRest = json["is_rest_day"] as? Bool ?? true
            let plan   = json["today_plan"] as? [String:Any]
            DispatchQueue.main.async {
                self.isWorkoutDay = !isRest
                if let label = plan?["label"] as? String, !label.isEmpty {
                    self.todayPlanLabel = label.uppercased()
                }
                self.evaluatePhase()
            }
        }.resume()
    }

    func fetchNutritionSummary() {
        let uid = userId; guard !uid.isEmpty else { return }
        // 後端日期 key：固定西曆＋POSIX（同 NutritionView.todayDateString）
        let today = { () -> String in
            let f = DateFormatter()
            f.calendar = Calendar(identifier: .gregorian)
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "yyyy-MM-dd"
            return f.string(from: Date())
        }()
        guard let url = URL(string: "\(baseURL)/api/nutrition/sql/daily/\(uid)?date=\(today)") else { return }
        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { [weak self] data,_,_ in
            guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String:Any], let summary = json["summary"] as? [String:Any] else { return }
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.caloriesConsumed = Int((summary["calories"] as? Double ?? 0).rounded())
                self.proteinConsumed  =      summary["protein"]  as? Double ?? 0
                self.carbConsumed     =      summary["carbs"]    as? Double ?? 0
                // 🐛 Bug fix: 後端 key 是 "fats"（複數），不是 "fat"
                self.fatConsumed      =      summary["fats"]     as? Double ?? (summary["fat"] as? Double ?? 0)
                if let items = json["items"] as? [[String:Any]] {
                    self.workoutMenu = items.compactMap { $0["name"] as? String }.filter { !$0.isEmpty }.prefix(2).map { $0 }
                }
            }
        }.resume()
    }

    /// 🟢 從後端拉「使用者本人」的卡路里 / 蛋白質目標，覆蓋預設的 2000 / 180g
    /// 端點：GET /api/user/nutrition-goals/{uid}（本人才能讀，跟手機營養頁同一個來源：有承諾的計劃先用計劃）
    /// ⚠️ 以前讀 /api/user/profiles 的整包個資；那支現在只回名字，手錶就永遠停在預設值。
    /// 失敗 fallback 維持 2000 kcal / 180g protein
    func fetchUserGoals() {
        let uid = userId; guard !uid.isEmpty else { return }
        let encoded = uid.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? uid
        guard let url = URL(string: "\(baseURL)/api/user/nutrition-goals/\(encoded)") else { return }
        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { [weak self] data, resp, _ in
            guard let self = self,
                  (resp as? HTTPURLResponse)?.statusCode == 200,
                  let data,
                  let me = try? JSONSerialization.jsonObject(with: data) as? [String:Any] else { return }
            let kcal = (me["target_calories"] as? NSNumber)?.doubleValue ?? 0
            let protein = (me["protein_target"] as? NSNumber)?.doubleValue ?? 0
            DispatchQueue.main.async {
                if kcal.isFinite, kcal > 0 { self.caloriesGoal = Int(kcal) }
                if protein.isFinite, protein > 0 { self.proteinGoal = Int(protein) }
            }
        }.resume()
    }
}

// ══════════════════════════════════════════════════════════════════════════
// MARK: - AVANT-GARDE SLIDES
// ══════════════════════════════════════════════════════════════════════════

// ① MORNING — INSPIRATION & WEATHER (硬核名言雙切換 + 右下角天氣)
struct MorningRecoverySlide: View {
    @ObservedObject var mgr: StandbyManager

    // 預設由「今日是否為健身日」決定：
    // 健身日 → STAY HARD ；休息日 → NO HUMAN LIMITED
    // 使用者仍可輕點切換 (manual override)
    @State private var manualOverride: Bool? = nil
    private var showStayHard: Bool {
        manualOverride ?? mgr.isWorkoutDay
    }

    var weatherIcon: String = "cloud.sun.fill"
    var temperature: String = "24°"
    var condition: String = "CLEAR"

    var body: some View {
        ZStack {
            Color.techBlack.ignoresSafeArea()
            KineticFluidGeometry().opacity(0.15)
            VStack(alignment: .leading, spacing: -12) {
                if showStayHard {
                    Text("STAY")
                        .foregroundColor(.white)
                    Text("HARD.")
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, .titaniumHighlight, .titaniumBase],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .font(.system(size: 60, weight: .black))
                } else {
                    Text("NO")
                        .font(.system(size: 42, weight: .black))
                        .foregroundColor(.techGray)
                    
                    Text("HUMAN")
                        .font(.system(size: 45, weight: .black))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, .titaniumHighlight, .titaniumBase],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .minimumScaleFactor(0.8)
                    
                    Text("LIMITED.")
                        .font(.system(size: 45, weight: .black))
                        .foregroundColor(.techOrange)
                        .minimumScaleFactor(0.8)
                }
            }
            .italic()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 12)
            .offset(y: -25)
            .onTapGesture {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    manualOverride = !showStayHard
                }
            }
            
            VStack {
                Spacer()
                HStack(alignment: .center, spacing: 4) {
                    Spacer()
                    Image(systemName: weatherIcon)
                        .symbolRenderingMode(.multicolor)
                        .font(.system(size: 13, weight: .bold))
                    Text("\(temperature) \(condition)")
                        .font(.system(size: 10, weight: .heavy, design: .monospaced))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, .titaniumHighlight, .techGray],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
                .padding(.trailing, 10)
                .padding(.bottom, 8)
            }
        }
    }
}

// ② MORNING — TARGET SESSION
struct HeroTargetSlide: View {
    @ObservedObject var mgr: StandbyManager
    
    var body: some View {
        ZStack {
            KineticFluidGeometry(isReversed: true)
            
            VStack(alignment: .leading, spacing: 0) {
                Text("TARGET")
                    .font(.system(size: 20, weight: .black, design: .monospaced))
                    .foregroundColor(.techOrange)
                
                VStack(alignment: .leading, spacing: -10) {
                    Text(mgr.todayPlanLabel.replacingOccurrences(of: " DAY", with: ""))
                        .font(.system(size: 65, weight: .black))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, .drvnPebble, .drvnPebble.opacity(0.6)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .fixedSize(horizontal: true, vertical: false)
                    
                    Text("DAY")
                        .font(.system(size: 28, weight: .black))
                        .foregroundColor(.techOrange)
                        .offset(x: 45)
                }
                
                Spacer()
                
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text("\(Int(mgr.recoveryPct * 100))")
                        .font(.system(size: 70, weight: .black))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, .titaniumHighlight, .titaniumBase],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    
                    Text("% RECOVERY")
                        .font(.system(size: 16, weight: .black))
                        .foregroundColor(.techOrange)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 12).padding(.vertical, 15)
        }
    }
}

// ③ DAYTIME — NUTRITION
struct DaytimeKcalSlide: View {
    @ObservedObject var mgr: StandbyManager

    var body: some View {
        ZStack {
            Color.techBlack.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                Text("KCAL LEFT")
                    .font(.system(size: 18, weight: .black, design: .monospaced))
                    .foregroundColor(.techOrange)
                    .padding(.leading, 2)

                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    let kcalStr = "\(mgr.caloriesRemaining)"
                    Text(kcalStr.prefix(1))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, .drvnCoral, .drvnCoral.opacity(0.8)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Text(kcalStr.dropFirst())
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, .titaniumHighlight, .titaniumBase],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
                .font(.system(size: 85, weight: .black))
                .tracking(-3)
                .offset(y: -5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 15)
            .offset(y: -35)
            
            Rectangle()
                .fill(
                    LinearGradient(
                        stops: [
                            .init(color: .titaniumBase, location: 0.0),
                            .init(color: .titaniumHighlight.opacity(0.5), location: 0.2),
                            .init(color: .titaniumBase, location: 0.4),
                            .init(color: .titaniumHighlight.opacity(0.7), location: 0.5),
                            .init(color: .titaniumBase, location: 0.6),
                            .init(color: .titaniumHighlight.opacity(0.4), location: 0.8),
                            .init(color: .titaniumBase, location: 1.0)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(height: 1.5)
                .frame(maxWidth: .infinity)
                .offset(y: 15)
            
            VStack {
                Spacer()
                HStack { 
                    NutritionGaugeView(label: "P", value: Int(mgr.proteinConsumed), total: 200)
                    Spacer()
                    NutritionGaugeView(label: "C", value: Int(mgr.carbConsumed), total: 300)
                    Spacer()
                    NutritionGaugeView(label: "F", value: Int(mgr.fatConsumed), total: 80)
                }
                .padding(.horizontal, 25)
                .offset(y: 0)
                .padding(.bottom, 5)
            }
        }
    }
}

// ④ DAYTIME — STEPS (勞斯萊斯金屬轉速表版)
struct DaytimeStepsSlide: View {
    @ObservedObject var mgr: StandbyManager
    
    var progress: Double {
        min(Double(mgr.steps) / 10000.0, 1.0)
    }
    
    var body: some View {
        ZStack {
            Color.techBlack.ignoresSafeArea()
            
            // ── High-Gloss Titanium Material Engine ──
            RadialGradient(
                gradient: Gradient(stops: [
                    .init(color: Color(white: 0.25), location: 0.0),
                    .init(color: Color(white: 0.18), location: 0.4),
                    .init(color: Color(white: 0.12), location: 0.7),
                    .init(color: .black, location: 1.0)
                ]),
                center: .center, startRadius: 0, endRadius: WatchLayout.w * 0.9
            )
            .ignoresSafeArea()
            
            // Specular Reflection (Diagonal Sheen)
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0.3),
                    .init(color: .white.opacity(0.12), location: 0.48),
                    .init(color: .white.opacity(0.15), location: 0.5),
                    .init(color: .white.opacity(0.12), location: 0.52),
                    .init(color: .clear, location: 0.7)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .blendMode(.screen)
            .ignoresSafeArea()
            
            ZStack {
                // Outer Ring — Hardware Grade
                Circle()
                    .stroke(style: StrokeStyle(lineWidth: 16, dash: [2, 8]))
                    .foregroundColor(.white.opacity(0.15))
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(colors: [.white.opacity(0.2), .clear, .white.opacity(0.1)], 
                                               startPoint: .topLeading, endPoint: .bottomTrailing),
                                lineWidth: 1
                            )
                    )
                
                // Active Progress Ring (Functional Orange)
                Circle()
                    .trim(from: 0.0, to: progress)
                    .stroke(style: StrokeStyle(lineWidth: 16, dash: [2, 8]))
                    .foregroundColor(.techOrange)
                    .rotationEffect(.degrees(-90))
                    .shadow(color: .techOrange.opacity(0.8), radius: 6)
                
                // Inner Specular Ring (High-Gloss Edge)
                Circle()
                    .inset(by: 12)
                    .stroke(
                        LinearGradient(
                            stops: [
                                .init(color: .white.opacity(0.4), location: 0.0),
                                .init(color: .clear, location: 0.5),
                                .init(color: .white.opacity(0.2), location: 1.0)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.5
                    )
            }
            .frame(width: WatchLayout.w * 0.88, height: WatchLayout.w * 0.88)
            
            VStack(spacing: -4) {
                Text("STEPS")
                    .font(.system(size: 16, weight: .black, design: .monospaced))
                    .foregroundColor(.techOrange)
                    .shadow(color: .techOrange.opacity(0.4), radius: 2)
                
                Text("\(mgr.steps)")
                    .font(.system(size: 58, weight: .black, design: .monospaced))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.4)
                    .lineLimit(1)
                    .frame(width: WatchLayout.w * 0.65)
                    .shadow(color: .white.opacity(0.2), radius: 4)
                
                Text("OBJ: 10,000")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.techGray)
                    .padding(.top, 4)
                    .opacity(0.8)
            }
        }
    }
}

// ⑤ PRE-WORKOUT — COUNTDOWN (OLED 省電波浪 + 米杏色漸層 + Akzidenz字體)
struct PreWorkoutTimeSlide: View {
    @ObservedObject var mgr: StandbyManager
    var body: some View {
        ZStack {
            Color.techBlack.ignoresSafeArea()
            
            // 1. 速度感隧道背景 (極致省電：縮小範圍、減少層數)
            ZStack {
                ForEach(0..<4) { i in // 從 6 層減少到 4 層，大幅減少發光面積
                    let factor = CGFloat(i)
                    let size = WatchLayout.w * 0.85 - (factor * 35) // 初始半徑大幅縮小
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [
                                    // 加入米杏色 (Beige) 作為最高光，過渡到機能橘，再迅速轉黑
                                    Color(red: 0.96, green: 0.92, blue: 0.84).opacity(0.8 - Double(i) * 0.2),
                                    Color.techOrange.opacity(0.5 - Double(i) * 0.15),
                                    Color.black.opacity(0.95)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: size, height: size)
                        .offset(x: -WatchLayout.w * 0.25 + (factor * 10),
                                y: WatchLayout.h * 0.05 + (factor * 8))
                }
            }
            
            // 2. 文字排版 (前衛不規則錯落設計)
            VStack(alignment: .leading, spacing: -10) {
                Text("T-MINUS")
                    .font(.system(size: 22, weight: .black, design: .monospaced))
                    .foregroundColor(.techOrange)
                    .offset(x: 15)
                
                // 數字改用 Akzidenz-Grotesk-Bold
                Text(String(format: "%02d", mgr.minutesToWorkout))
                    .font(.custom("Akzidenz-Grotesk-Bold", size: 85))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.white, .titaniumHighlight, .titaniumBase],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .offset(x: -5)
                
                // Footer 也改用鈦金屬色
                Text("TO INITIATE")
                    .font(.system(size: 16, weight: .black, design: .monospaced))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.white, .titaniumHighlight, .techGray],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .offset(x: 35)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 15)
        }
    }
}

// ⑥ POST-WORKOUT — REPLENISH (中央細線極簡分割版 - 鈦金屬質感 + 重心上移)
struct PostWorkoutFuelSlide: View {
    @ObservedObject var mgr: StandbyManager
    var body: some View {
        ZStack {
            Color.techBlack.ignoresSafeArea()
            
            VStack(spacing: 20) { // 稍微縮小間距讓重心上移
                // 頂部小標題 (鈦金屬色)
                Text("REPLENISH")
                    .font(.system(size: 12, weight: .black, design: .monospaced))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.white, .techGray],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .tracking(2)
                    .offset(y: -10) // 標題往上一點
                
                ZStack {
                    // 中央極細分割線
                    // 中央極細分割線 (拉長至全螢幕)
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.clear, .drvnCoral.opacity(0.8), .clear],
                                startPoint: .top, endPoint: .bottom
                            )
                        )
                        .frame(width: 1.5, height: WatchLayout.h) 
                        .offset(y: -15) 
                    
                    HStack(spacing: 0) {
                        // 左側：碳水化合物 (依體重動態計算 — 與 NutritionPageMobile Recovery Fuel 同源)
                        VStack(alignment: .trailing, spacing: -5) {
                            Text("\(mgr.recoveryCarbsG)")
                                .font(.system(size: 55, weight: .light))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [.white, Color.drvnPebble, Color(red: 0.7, green: 0.68, blue: 0.63)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                            Text("CARB")
                                .font(.system(size: 14, weight: .bold, design: .monospaced))
                                .foregroundColor(.techGray)
                        }
                        .frame(width: WatchLayout.w * 0.45, alignment: .trailing)
                        .padding(.trailing, 10)

                        // 右側：蛋白質 (大膽白 -> 鈦金屬，依體重動態計算)
                        VStack(alignment: .leading, spacing: -5) {
                            Text("\(mgr.recoveryProteinG)")
                                .font(.system(size: 55, weight: .light))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [.white, .titaniumHighlight, .titaniumBase],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                            Text("PRO")
                                .font(.system(size: 14, weight: .bold, design: .monospaced))
                                .foregroundColor(.techOrange)
                        }
                        .frame(width: WatchLayout.w * 0.45, alignment: .leading)
                        .padding(.leading, 10)
                    }
                }
            }
        }
    }
}


// ⑦ EVENING — DAY RECAP (無浮水印 + 鈦金屬貫穿長條版)
struct EveningRecapSlide: View {
    @ObservedObject var mgr: StandbyManager
    
    // Stone 顏色定義 (#E4DED2)
    private let stoneColor = Color(red: 0.89, green: 0.87, blue: 0.82)
    
    var body: some View {
        ZStack {
            Color.techBlack.ignoresSafeArea()
            
            // 1. 頂部貫穿橫條：Coral 色鈦金屬帶 (壓在 KCAL OUT 下方)
            Rectangle()
                .fill(
                    LinearGradient(
                        stops: [
                            .init(color: Color.drvnCoral.opacity(0.4), location: 0.0),
                            .init(color: Color.drvnCoral.opacity(0.1), location: 0.3),
                            .init(color: Color.drvnCoral.opacity(0.3), location: 0.7),
                            .init(color: Color.drvnCoral.opacity(0.15), location: 1.0)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(height: 35)
                .frame(maxWidth: .infinity)
                .offset(y: -30)
            
            // 2. 中部貫穿橫條：Pebble 色鈦金屬帶 (位於 PRO 與 STEPS 之間)
            Rectangle()
                .fill(
                    LinearGradient(
                        stops: [
                            .init(color: Color.drvnPebble.opacity(0.4), location: 0.0),
                            .init(color: Color.drvnPebble.opacity(0.1), location: 0.4),
                            .init(color: Color.drvnPebble.opacity(0.3), location: 0.8),
                            .init(color: Color.drvnPebble.opacity(0.15), location: 1.0)
                        ],
                        startPoint: .trailing,
                        endPoint: .leading
                    )
                )
                .frame(height: 25)
                .offset(y: 35) // 調整位置至 PRO 與 STEPS 中間
            
            // 3. 右側裝飾性細直條：由左至右為 Stone, Coral, Pebble (全螢幕長度)
            HStack(spacing: 5) {
                // Stone
                Rectangle()
                    .fill(LinearGradient(colors: [Color(red: 0.89, green: 0.87, blue: 0.82).opacity(0.5), .clear], startPoint: .top, endPoint: .bottom))
                    .frame(width: 1.2, height: WatchLayout.h)
                
                // Coral
                Rectangle()
                    .fill(LinearGradient(colors: [Color.drvnCoral.opacity(0.5), .clear], startPoint: .top, endPoint: .bottom))
                    .frame(width: 1.2, height: WatchLayout.h)
                
                // Pebble
                Rectangle()
                    .fill(LinearGradient(colors: [Color.drvnPebble.opacity(0.5), .clear], startPoint: .top, endPoint: .bottom))
                    .frame(width: 1.2, height: WatchLayout.h)
            }
            .offset(x: WatchLayout.w * 0.42)
            
            // 階梯式錯落排版 (維持犬牙交錯感)
            VStack(alignment: .leading, spacing: 5) {
                Text("END OF DAY")
                    .font(.system(size: 16, weight: .black, design: .monospaced))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.drvnCoral, .white, Color.drvnCoral.opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .padding(.top, 8)
                    .padding(.bottom, 2)
                
                // 1. 活動消耗 (大白字，壓在鈦金屬長條上)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(mgr.activeKcal)")
                        .font(.custom("Akzidenz-Grotesk-Bold", size: 55))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                        .foregroundColor(.white)
                    Text("KCAL OUT")
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.techGray)
                }
                
                // 2. 蛋白質攝取 (數字與垂直字母並列)
                HStack(alignment: .center, spacing: 4) {
                    Text("\(Int(mgr.proteinConsumed))")
                        .font(.custom("Akzidenz-Grotesk-Bold", size: 55))
                        .foregroundColor(Color(red: 0.96, green: 0.92, blue: 0.84)) // 米杏色
                    
                    VStack(alignment: .leading, spacing: -2) {
                        Text("G")
                        Text("P")
                        Text("R")
                        Text("O")
                    }
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .foregroundColor(.techGray)
                }
                .offset(x: 20)
                
                // 3. 總步數 (機能橘，往左上移動)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    let stepK = String(format: "%.1f", Double(mgr.steps) / 1000.0)
                    Text(stepK)
                        .font(.custom("Akzidenz-Grotesk-Bold", size: 55))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                        .foregroundColor(.techOrange)
                    Text("K STEPS")
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.techGray)
                }
                .offset(x: 15)
                .offset(y: -5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 15)
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════
// MARK: - StandbyView
// ══════════════════════════════════════════════════════════════════════════
struct StandbyView: View {
    @StateObject private var mgr = StandbyManager()
    @State private var selection: Int = 3        // Default: ④ Steps
    @State private var phaseTimer: Timer? = nil
    @State private var hasUserSwiped: Bool = false // 使用者手動滑動後不再被覆蓋
    @State private var programmaticUpdate: Bool = false // 系統自動切換時 = true
    var onDismiss: () -> Void

    init(onDismiss: @escaping () -> Void = {}) {
        self.onDismiss = onDismiss
    }

    var body: some View {
        TabView(selection: $selection) {
            MorningRecoverySlide(mgr: mgr).tag(0)
            HeroTargetSlide(mgr: mgr).tag(1)
            DaytimeKcalSlide(mgr: mgr).tag(2)
            DaytimeStepsSlide(mgr: mgr).tag(3)
            PreWorkoutTimeSlide(mgr: mgr).tag(4)
            PostWorkoutFuelSlide(mgr: mgr).tag(5)
            EveningRecapSlide(mgr: mgr).tag(6)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .onTapGesture(count: 2) {
            // Double tap to dismiss Standby and return to main app
            withAnimation(.spring()) {
                onDismiss()
            }
        }
        .onAppear {
            mgr.refreshLiveData()
            applyPriority()
            // 每 30 秒重新判斷情境 (含 minutesToWorkout 倒數)
            phaseTimer?.invalidate()
            phaseTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
                mgr.evaluatePhase()
                applyPriority()
            }
        }
        .onDisappear {
            phaseTimer?.invalidate()
            phaseTimer = nil
        }
        // 🟢 watchOS 10+: onChange(of:perform:) 已 deprecate
        // → 改用零參數 (新 API: action closure 不接收 old/new value 時可省略)
        .onChange(of: mgr.currentPhase) { applyPriority() }
        .onChange(of: selection) {
            // 系統自動切換不算手動滑動；只有「人」滑的才鎖定
            if programmaticUpdate {
                programmaticUpdate = false
            } else {
                hasUserSwiped = true
            }
        }
    }

    /// 把 selection 設為 mgr.currentPhase 對應的優先索引
    private func applyPriority() {
        guard !hasUserSwiped else { return }
        let target = mgr.currentPhase.preferredIndex
        if selection != target {
            programmaticUpdate = true
            withAnimation(.easeInOut(duration: 0.4)) {
                selection = target
            }
        }
    }
}

#Preview("DRVN Standby — AVANT-GARDE") {
    StandbyView(onDismiss: {})
}
