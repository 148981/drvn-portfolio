import SwiftUI
import HealthKit
import WatchConnectivity
import Combine
import CoreLocation

// MARK: - Watch-wide notifications
extension Notification.Name {
    /// 當 iPhone 透過 WCSession 推送 USER_ID_SYNC 後，
    /// ContentView 會 post 這個通知。所有需要重新拉資料的 View / Manager 都應該監聽。
    static let drvnUserIdDidChange = Notification.Name("drvnUserIdDidChange")
}

// MARK: - Workout State
enum WorkoutState {
    case idle, running, paused, ended
}

// MARK: - Run Plan Models
struct RunStep: Identifiable {
    let id = UUID()
    let name: String              // e.g. "快走喚醒"
    let durationSeconds: Int      // e.g. 300
    let targetPaceStr: String     // e.g. "11'00\""
    let targetPaceSeconds: Double // e.g. 660.0
    let intensity: String         // "WARMUP" | "AEROBIC" | "INTERVAL" | "RACE" | "COOLDOWN"
}

struct RunPlan {
    let modeId: String
    let steps: [RunStep]
    /// 使用者自己的課（從手機的跑步計劃來）才有標題；內建範本是 nil
    var title: String? = nil
    var totalSeconds: Int { steps.reduce(0) { $0 + $1.durationSeconds } }
}

// Global run plan library — keyed by RunMode.id
let drvnRunPlans: [String: RunPlan] = [
    "recovery": RunPlan(modeId: "recovery", steps: [
        RunStep(name: "快走喚醒", durationSeconds: 300,  targetPaceStr: "11'00\"", targetPaceSeconds: 660, intensity: "WARMUP"),
        RunStep(name: "極輕跑",   durationSeconds: 600,  targetPaceStr: "9'00\"",  targetPaceSeconds: 540, intensity: "AEROBIC"),
        RunStep(name: "緩和步行", durationSeconds: 300,  targetPaceStr: "11'00\"", targetPaceSeconds: 660, intensity: "COOLDOWN"),
    ]),
    "interval": RunPlan(modeId: "interval", steps: [
        RunStep(name: "熱身慢跑", durationSeconds: 480,  targetPaceStr: "7'30\"",  targetPaceSeconds: 450, intensity: "WARMUP"),
        RunStep(name: "快速衝刺", durationSeconds: 240,  targetPaceStr: "4'30\"",  targetPaceSeconds: 270, intensity: "INTERVAL"),
        RunStep(name: "恢復慢跑", durationSeconds: 240,  targetPaceStr: "8'00\"",  targetPaceSeconds: 480, intensity: "AEROBIC"),
        RunStep(name: "快速衝刺", durationSeconds: 240,  targetPaceStr: "4'30\"",  targetPaceSeconds: 270, intensity: "INTERVAL"),
        RunStep(name: "緩和步行", durationSeconds: 600,  targetPaceStr: "10'00\"", targetPaceSeconds: 600, intensity: "COOLDOWN"),
    ]),
    "race": RunPlan(modeId: "race", steps: [
        RunStep(name: "熱身慢跑", durationSeconds: 300,  targetPaceStr: "7'30\"",  targetPaceSeconds: 450, intensity: "WARMUP"),
        RunStep(name: "目標配速", durationSeconds: 1200, targetPaceStr: "5'00\"",  targetPaceSeconds: 300, intensity: "RACE"),
        RunStep(name: "緩和慢走", durationSeconds: 300,  targetPaceStr: "9'00\"",  targetPaceSeconds: 540, intensity: "COOLDOWN"),
    ]),
    "long": RunPlan(modeId: "long", steps: [
        RunStep(name: "熱身走",   durationSeconds: 300,  targetPaceStr: "10'00\"", targetPaceSeconds: 600, intensity: "WARMUP"),
        RunStep(name: "穩定慢跑", durationSeconds: 3000, targetPaceStr: "6'30\"",  targetPaceSeconds: 390, intensity: "AEROBIC"),
        RunStep(name: "緩和步行", durationSeconds: 300,  targetPaceStr: "10'00\"", targetPaceSeconds: 600, intensity: "COOLDOWN"),
    ]),
]

// MARK: - Heart Rate Zone
enum HRZone: Int {
    case warmup = 0, fatBurn, aerobic, anaerobic, extreme

    var label: String {
        switch self {
        case .warmup:       return "WARM UP"
        case .fatBurn:      return "FAT BURN"
        case .aerobic:      return "AEROBIC"
        case .anaerobic:    return "ANAEROBIC"
        case .extreme:      return "EXTREME"
        }
    }

    var color: Color {
        switch self {
        case .warmup:       return Color(hex: "FDD835") // 黃色 (準備起點)
        case .fatBurn:      return Color(hex: "8BC34A") // 鮮綠 (能量穩定燃脂)
        case .aerobic:      return Color(hex: "FF9800") // 活力橘 (心肺穩定節奏)
        case .anaerobic:    return Color(hex: "F06292") // 亮粉 (無氧強度標記)
        case .extreme:      return Color(hex: "5C6BC0") // 深藍紫 (極限專注)
        }
    }

    static func zone(for hr: Double, maxHR: Double = 185) -> HRZone {
        let pct = hr / maxHR
        switch pct {
        case ..<0.50:  return .warmup
        case ..<0.60:  return .fatBurn
        case ..<0.75:  return .aerobic
        case ..<0.87:  return .anaerobic
        default:       return .extreme
        }
    }
}

// MARK: - 新增的資料結構
struct SplitData {
    let km: Int
    let time: Int
    let pace: Double
    let avgHR: Double
    let timestamp: Double
    
    var dictionary: [String: Any] {
        return ["km": km, "time": time, "pace": pace, "avgHR": avgHR, "timestamp": timestamp]
    }
}

// MARK: - Watch Workout Manager
class WatchWorkoutManager: NSObject, ObservableObject,
                           HKWorkoutSessionDelegate,
                           HKLiveWorkoutBuilderDelegate,
                           WCSessionDelegate,
                           CLLocationManagerDelegate {

    /// App 一啟動就建立（見 _______AppWatchApp.init）。
    /// 以前只有進到 RUN 畫面才 new 一個 —— 手錶停在主選單時沒有人接 iPhone 的跑步 START，
    /// 手機開跑、手錶完全沒反應。
    static let shared = WatchWorkoutManager()

    // MARK: - HealthKit
    let healthStore = HKHealthStore()
    var session: HKWorkoutSession?
    var builder: HKLiveWorkoutBuilder?

    /// 這一趟是 iPhone 開的（手機負責存檔；手錶按 DONE 不再送一份，避免重複紀錄）
    @Published var startedByPhone = false
    /// iPhone 一進跑步頁就先「預熱」（讓心率感測器先穩定）。真的開跑之前都算預熱：
    /// 開跑那一刻從 0 重新計時；沒開跑就離開 → 這段不存進健康 App。
    private(set) var isPrewarm = false
    private var distanceBase: Double = 0
    private var caloriesBase: Double = 0

    // MARK: - Published
    @Published var state: WorkoutState = .idle
    @Published var heartRate: Double = 0
    @Published var activeCalories: Double = 0
    @Published var distance: Double = 0          // metres
    @Published var elapsedSeconds: Int = 0
    @Published var hrZone: HRZone = .warmup
    @Published var avgHeartRate: Double = 0
    @Published var currentPace: Double = 0       // min/km
    // 🟢 跑步進階數據（深度分析用）：步頻(spm) / 步幅(m)
    @Published var cadence: Double = 0
    @Published var strideLength: Double = 0
    private var lastStepCount: Double = 0
    private var lastStepDate: Date?
    
    // MARK: - Coach Mode
    @Published var selectedMode: String = "free"
    @Published var targetPace: Double = 300      // 預設 5'00" / km

    // MARK: - Structured Run Plan State
    @Published var currentPlan: RunPlan? = nil
    @Published var currentStepIndex: Int = 0
    @Published var stepElapsedSeconds: Int = 0
    private var stepAccumulatedSeconds: Int = 0
    private var stepTimerStartDate: Date? = nil

    // MARK: - Private
    private var timer: AnyCancellable?
    private var hrSamples: [Double] = []
    private var timerStartDate: Date?
    private var accumulatedSeconds: Int = 0

    // MARK: - GPS 定位
    private let locationManager = CLLocationManager()
    private var routeCoordinates: [[String: Double]] = []
    
    // MARK: - Zone Accumulator (seconds per zone, @Published for live UI)
    // ⚠️ Keys MUST match `cardiotrackermobile.jsx` ZONES exactly:
    //     <= 130 → Warm Up,  <= 150 → Fat Burn,  <= 170 → Aerobic,
    //     <= 190 → Anaerobic, > 190 → Extreme
    // (Recovery is intentionally folded into Warm Up so the React side and
    //  watch side produce identical aggregates.)
    @Published var zoneSeconds: [String: Int] = [
        "Warm Up": 0, "Fat Burn": 0,
        "Aerobic": 0, "Anaerobic": 0, "Extreme": 0
    ]
    
    // 🚀 新增：連續數據流 (Stream Data) 與 分段 (Splits)
    private var streamTimestamps: [Double] = []
    private var streamHeartRates: [Double] = []
    private var streamPaces: [Double] = []
    private var streamElevations: [Double] = []
    private var streamZones: [String] = []     // 每秒的 zone 名稱
    
    private var splits: [SplitData] = []
    private var lastSplitDistanceKm: Int = 0
    private var lastSplitElapsedSec: Int = 0
    private var hrSamplesForCurrentSplit: [Double] = []
    
    @Published var accumulatedScore: Double = 0.0 // 精準的 Effort Points
    
    // MARK: - Computed Score (0-100, calorie efficiency index)
    var score: Int {
        guard elapsedSeconds > 0 else { return 0 }
        let minElapsed = Double(elapsedSeconds) / 60.0
        let raw = (activeCalories / max(1.0, minElapsed)) * 10
        return max(0, min(100, Int(raw)))
    }
    
    // MARK: - User ID (synced from iPhone via WatchConnectivity)
    private var syncedUserId: String {
        UserDefaults.standard.string(forKey: "drvn_synced_userId") ?? ""
    }

    // MARK: - Init
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

        // GPS 定位基礎設定 — 為跑步路徑優化
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation // 跑步追蹤要求最高精度
        locationManager.distanceFilter = kCLDistanceFilterNone // 不過濾，由我們自己判斷（避免短距漏點）
        locationManager.activityType = .fitness // 告訴系統這是健身活動，最佳化 GPS 行為
        // ⚠️ allowsBackgroundLocationUpdates 必須在 Info.plist 加入 WKBackgroundModes (location) 後才能設定
        // 已在 startWorkout() 內啟用
    }

    // MARK: - Authorization
    func requestAuthorization() {
        let share: Set<HKSampleType> = [HKQuantityType.workoutType()]
        let read: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .runningSpeed)!,
            HKObjectType.quantityType(forIdentifier: .runningStrideLength)!,   // 🟢 步幅（深度分析）
            // ── DRVN Standby 預測引擎所需 ──────────────
            HKObjectType.workoutType(),                                 // 歷史 Workout (推算訓練時間)
            HKObjectType.quantityType(forIdentifier: .stepCount)!,      // 步數圖
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!   // 起床時間 (Wake Window)
        ]
        healthStore.requestAuthorization(toShare: share, read: read) { _, _ in }
    }

    // MARK: - 本週跑步計劃（跟手機同一份：/api/cardio-plan/{uid}/this-week）
    struct WeekRunItem: Identifiable {
        let id: String
        let title: String
        let detail: String
        let done: Bool
        let plan: RunPlan
    }
    @Published var weekPlans: [WeekRunItem] = []
    @Published var weekPlansLoaded = false

    func fetchWeekPlans() {
        guard !syncedUserId.isEmpty,
              let url = URL(string: "\(WatchConfig.apiBaseURL)/api/cardio-plan/\(syncedUserId)/this-week") else {
            weekPlansLoaded = true
            return
        }
        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { [weak self] data, _, _ in
            let bricks = (data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["bricks"]
                          as? [[String: Any]]) ?? []
            let items = bricks.enumerated().compactMap { WatchWorkoutManager.runItem(from: $0.element, index: $0.offset) }
            DispatchQueue.main.async {
                self?.weekPlans = items
                self?.weekPlansLoaded = true
            }
        }.resume()
    }

    /// 把手機計劃裡的一堂課換成手錶的分段課表（暖身 → 主課 → 緩和，間歇拆成快慢交替）
    static func runItem(from b: [String: Any], index: Int) -> WeekRunItem? {
        func num(_ v: Any?) -> Double? {
            if let d = v as? Double { return d }
            if let i = v as? Int { return Double(i) }
            if let s = v as? String { return Double(s) }
            return nil
        }
        let kind = ((b["subtype"] as? String) ?? (b["type"] as? String) ?? "easy").lowercased()
        if kind == "strength" { return nil }   // 交叉訓練不是跑步，手錶跑步這邊不列
        let defaultPace: Double = {
            switch kind {
            case "recovery": return 420
            case "tempo", "speed": return 320
            case "interval": return 285
            case "long": return 400
            default: return 390
            }
        }()
        let pace = num(b["target_pace_sec"]).flatMap { $0 > 120 ? $0 : nil } ?? defaultPace
        let km = num(b["distance_km"]) ?? 0
        let totalMin: Double = num(b["duration_min"]).flatMap { $0 > 0 ? $0 : nil }
            ?? (km > 0 ? km * pace / 60 : 30)
        let total = max(600, Int(totalMin * 60))
        func paceStr(_ s: Double) -> String { String(format: "%d'%02d\"", Int(s) / 60, Int(s) % 60) }
        func step(_ name: String, _ sec: Int, _ p: Double, _ intensity: String) -> RunStep {
            RunStep(name: name, durationSeconds: max(60, sec), targetPaceStr: paceStr(p),
                    targetPaceSeconds: p, intensity: intensity)
        }
        var steps: [RunStep] = []
        let modeId: String
        switch kind {
        case "interval":
            modeId = "interval"
            let warm = 480, cool = 300
            let reps = max(3, min(8, (total - warm - cool) / 300))
            steps.append(step("熱身慢跑", warm, pace + 150, "WARMUP"))
            for _ in 0..<reps {
                steps.append(step("快速衝刺", 180, pace, "INTERVAL"))
                steps.append(step("恢復慢跑", 120, pace + 180, "AEROBIC"))
            }
            steps.append(step("緩和", cool, pace + 210, "COOLDOWN"))
        case "tempo", "speed":
            modeId = "race"
            steps.append(step("熱身慢跑", 600, pace + 120, "WARMUP"))
            steps.append(step("節奏跑", total - 900, pace, "RACE"))
            steps.append(step("緩和", 300, pace + 150, "COOLDOWN"))
        case "long":
            modeId = "long"
            steps.append(step("長距離", total, pace, "AEROBIC"))
        case "recovery":
            modeId = "recovery"
            steps.append(step("恢復跑", total, pace, "AEROBIC"))
        default:
            modeId = "free"
            steps.append(step("輕鬆跑", total, pace, "AEROBIC"))
        }
        let title = (b["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "第 \(index + 1) 趟"
        let detail = km > 0 ? String(format: "%.1f km · %@", km, paceStr(pace)) : "\(total / 60) 分 · \(paceStr(pace))"
        let status = (b["status"] as? String) ?? ""
        var plan = RunPlan(modeId: modeId, steps: steps)
        plan.title = title
        return WeekRunItem(id: (b["brick_id"] as? String) ?? "b\(index)", title: title, detail: detail,
                           done: status == "completed" || status == "skipped", plan: plan)
    }

    // MARK: - Session Control
    func startWorkout(activityType: HKWorkoutActivityType = .running, mode: String = "free", plan: RunPlan? = nil,
                      byPhone: Bool = false, prewarm: Bool = false) {
        // 上一趟停在結算畫面（還沒按 DONE）→ 以前會擋掉下一次 START，手機開跑手錶沒反應
        if state == .ended { resetWorkout() }
        guard state == .idle else { return }
        // 手機開跑時手錶可能還沒問過健康權限（沒進過 RUN 畫面）—— 開跑前補問一次（已授權就不會跳）
        if healthStore.authorizationStatus(for: HKQuantityType.workoutType()) == .notDetermined {
            requestAuthorization()
        }
        self.startedByPhone = byPhone
        self.isPrewarm = prewarm
        self.distanceBase = 0
        self.caloriesBase = 0
        self.selectedMode = mode
        self.currentPlan = plan
        self.currentStepIndex = 0
        self.stepElapsedSeconds = 0
        self.stepAccumulatedSeconds = 0
        if let firstStep = plan?.steps.first {
            self.targetPace = firstStep.targetPaceSeconds
        }
        
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = .outdoor // 🔴 修正：.outdoor 啟用真實 GPS

        // ── 1. 先把 HKWorkoutSession 啟好（跑步本體不能被 GPS 拖死） ──
        do {
            session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            builder = session?.associatedWorkoutBuilder()
        } catch {
            print("[Watch] ❌ HKWorkoutSession 建立失敗: \(error.localizedDescription)")
            return
        }

        session?.delegate = self
        builder?.delegate = self
        builder?.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)

        let now = Date()
        session?.startActivity(with: now)
        builder?.beginCollection(withStart: now) { [weak self] _, _ in
            DispatchQueue.main.async { self?.beginTimer() }
        }
        state = .running
        WatchSessionGate.isViewSessionActive = true   // 🟢 cardio 進行中 → 鎖住，hub 不重複起 session

        // ── 2. 再啟動 GPS（best-effort：失敗也不影響跑步） ──
        // ⚠️ 千萬不要設 allowsBackgroundLocationUpdates = true
        //    在沒有 "Background Modes → Location updates" capability 的情況下會直接 raise
        //    NSInternalInconsistencyException ("Invalid parameter not satisfying: !stayUp || ...")
        let auth = locationManager.authorizationStatus
        if auth == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        }
        // locationManager.allowsBackgroundLocationUpdates = true // 註解掉避免 Crash
        locationManager.startUpdatingLocation()
        print("[Watch] 🛰️ GPS startUpdatingLocation 已呼叫，授權狀態 = \(auth.rawValue)")
    }

    func pauseWorkout() {
        guard state == .running else { return }
        session?.pause()
        pauseTimer()
        locationManager.stopUpdatingLocation() // 暫停 GPS
        state = .paused
        sendStateToPhone("PAUSED")
    }

    func resumeWorkout() {
        guard state == .paused else { return }
        session?.resume()
        beginTimer()
        locationManager.startUpdatingLocation() // 恢復 GPS
        state = .running
        sendStateToPhone("RUNNING")
    }

    func endWorkout(byPhone: Bool = false) {
        guard state == .running || state == .paused else { return }
        WatchSessionGate.isViewSessionActive = false   // 🟢 解鎖
        pauseTimer()
        locationManager.stopUpdatingLocation() // 停止 GPS
        session?.stopActivity(with: Date())
        session?.end()
        // 只有預熱、從沒真的開跑（進了跑步頁又離開）→ 不存成一筆跑步
        if isPrewarm {
            let b = builder
            b?.endCollection(withEnd: Date()) { _, _ in b?.discardWorkout() }
            isPrewarm = false
            resetWorkout()
            return
        }
        // 在手錶上結束手機開的那一趟 → 告訴手機（手機會先暫停，不讓兩邊時間對不上）
        if !byPhone && startedByPhone { sendStateToPhone("ENDED") }
        builder?.endCollection(withEnd: Date()) { [weak self] _, _ in
            self?.builder?.finishWorkout { [weak self] _, _ in
                DispatchQueue.main.async {
                    // ⚠️ Do NOT call sendSummaryToPhone() here.
                    // Data is sent ONLY when user taps DONE on the summary screen.
                    self?.state = .ended
                    WKInterfaceDevice.current().play(.success)
                }
            }
        }
    }

    func resetWorkout() {
        state = .idle
        heartRate = 0
        activeCalories = 0
        distance = 0
        currentPace = 0
        avgHeartRate = 0
        elapsedSeconds = 0
        accumulatedSeconds = 0
        timerStartDate = nil
        timer?.cancel()
        timer = nil
        currentPlan = nil
        currentStepIndex = 0
        stepElapsedSeconds = 0
        stepAccumulatedSeconds = 0
        stepTimerStartDate = nil
        hrSamples = []
        accumulatedScore = 0.0
        zoneSeconds = ["Warm Up": 0, "Fat Burn": 0,
                       "Aerobic": 0, "Anaerobic": 0, "Extreme": 0]
                       
        // 🚀 Clear stream arrays
        streamTimestamps = []
        streamHeartRates = []
        streamPaces = []
        streamElevations = []
        streamZones = []
        splits = []
        lastSplitDistanceKm = 0
        lastSplitElapsedSec = 0
        hrSamplesForCurrentSplit = []
        accumulatedScore = 0.0

        routeCoordinates = [] // 清空路線紀錄
    }

    /// 預熱中收到「真的開跑」→ HKWorkout 不動（感測器已經穩了），但計時、距離、
    /// 卡路里、區間、串流全部從這一刻重新算，不把等待的時間算進這一趟。
    func beginRealRun() {
        guard isPrewarm, state == .running || state == .paused else { return }
        isPrewarm = false
        pauseTimer()
        accumulatedSeconds = 0
        elapsedSeconds = 0
        distanceBase += distance
        caloriesBase += activeCalories
        distance = 0
        activeCalories = 0
        hrSamples = []
        accumulatedScore = 0.0
        zoneSeconds = ["Warm Up": 0, "Fat Burn": 0,
                       "Aerobic": 0, "Anaerobic": 0, "Extreme": 0]
        streamTimestamps = []
        streamHeartRates = []
        streamPaces = []
        streamElevations = []
        streamZones = []
        splits = []
        lastSplitDistanceKm = 0
        lastSplitElapsedSec = 0
        hrSamplesForCurrentSplit = []
        routeCoordinates = []
        stepAccumulatedSeconds = 0
        stepElapsedSeconds = 0
        currentStepIndex = 0
        if state == .paused {
            session?.resume()
            locationManager.startUpdatingLocation()
            state = .running
        }
        beginTimer()
        WKInterfaceDevice.current().play(.start)
    }

    // MARK: - Timer
    private func beginTimer() {
        timerStartDate = Date()
        stepTimerStartDate = Date()
        timer = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self = self, let start = self.timerStartDate else { return }
                self.elapsedSeconds = self.accumulatedSeconds + Int(Date().timeIntervalSince(start))
                
                let nowMs = Date().timeIntervalSince1970 * 1000
                let currentKmFloat = self.distance / 1000.0
                let currentKmInt = Int(currentKmFloat)

                // 1. 紀錄連續數據流 (Stream Data) — timestamps 改為相對秒數
                self.streamTimestamps.append(Double(self.elapsedSeconds)) // 相對秒數 (0, 1, 2...) 而非 Unix 毫秒
                self.streamHeartRates.append(self.heartRate > 0 ? self.heartRate : (self.hrSamples.last ?? 0))
                self.streamPaces.append(self.currentPace > 0 ? self.currentPace * 60 : 0)
                self.streamElevations.append(0) // 若有高度計可替換
                // Zone 每秒標記 (給前端畫 zone 時序条用)
                let currentZone = self.currentZoneName(for: self.heartRate > 0 ? self.heartRate : (self.hrSamples.last ?? 0))
                self.streamZones.append(currentZone)
                self.hrSamplesForCurrentSplit.append(self.heartRate)

                // 2. Zone 累積與 Effort Score 計算 (對齊前端 React 的 ZONE_MULTIPLIERS)
                let zoneName = self.currentZoneName(for: self.heartRate)
                self.zoneSeconds[zoneName, default: 0] += 1
                
                let pointsPerSec: Double
                switch zoneName {
                    case "Warm Up": pointsPerSec = 0.5 / 60.0
                    case "Fat Burn": pointsPerSec = 1.0 / 60.0
                    case "Aerobic": pointsPerSec = 2.0 / 60.0
                    case "Anaerobic": pointsPerSec = 3.5 / 60.0
                    case "Extreme": pointsPerSec = 5.0 / 60.0
                    default: pointsPerSec = 0.0
                }
                self.accumulatedScore += pointsPerSec

                // 3. 計算 1KM 分段紀錄 (Splits)
                if currentKmInt > self.lastSplitDistanceKm && currentKmInt > 0 {
                    let splitTime = self.elapsedSeconds - self.lastSplitElapsedSec
                    let avgHR = self.hrSamplesForCurrentSplit.isEmpty ? self.heartRate : self.hrSamplesForCurrentSplit.reduce(0, +) / Double(self.hrSamplesForCurrentSplit.count)
                    let splitPace = Double(splitTime) // 完成 1km 的秒數就是配速
                    
                    self.splits.append(SplitData(km: currentKmInt, time: splitTime, pace: splitPace, avgHR: avgHR, timestamp: nowMs))
                    
                    self.lastSplitDistanceKm = currentKmInt
                    self.lastSplitElapsedSec = self.elapsedSeconds
                    self.hrSamplesForCurrentSplit = []
                }

                // Step tracking for structured run plans
                if let stepStart = self.stepTimerStartDate {
                    let elapsed = self.stepAccumulatedSeconds + Int(Date().timeIntervalSince(stepStart))
                    self.stepElapsedSeconds = elapsed
                    if let plan = self.currentPlan,
                       self.currentStepIndex < plan.steps.count,
                       elapsed >= plan.steps[self.currentStepIndex].durationSeconds {
                        self.advanceStep(plan: plan)
                    }
                }
            }
    }

    private func advanceStep(plan: RunPlan) {
        let next = currentStepIndex + 1
        guard next < plan.steps.count else { return }
        currentStepIndex = next
        stepAccumulatedSeconds = 0
        stepTimerStartDate = Date()
        stepElapsedSeconds = 0
        targetPace = plan.steps[next].targetPaceSeconds
        WKInterfaceDevice.current().play(.notification)
    }

    private func pauseTimer() {
        if let start = timerStartDate {
            accumulatedSeconds += Int(Date().timeIntervalSince(start))
        }
        if let stepStart = stepTimerStartDate {
            stepAccumulatedSeconds += Int(Date().timeIntervalSince(stepStart))
        }
        timer?.cancel()
        timer = nil
        timerStartDate = nil
        stepTimerStartDate = nil
    }

    // MARK: - Formatted helpers
    var elapsedFormatted: String {
        let h = elapsedSeconds / 3600
        let m = (elapsedSeconds % 3600) / 60
        let s = elapsedSeconds % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%02d:%02d", m, s)
    }

    var distanceFormatted: String {
        if distance >= 1000 { return String(format: "%.2f km", distance / 1000) }
        return String(format: "%.0f m", distance)
    }

    // MARK: - HKWorkoutSessionDelegate
    func workoutSession(_ workoutSession: HKWorkoutSession,
                        didChangeTo toState: HKWorkoutSessionState,
                        from fromState: HKWorkoutSessionState,
                        date: Date) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { self.state = .idle }
    }

    // MARK: - HKLiveWorkoutBuilderDelegate
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                        didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let qty = type as? HKQuantityType,
                  let stats = workoutBuilder.statistics(for: qty) else { continue }
            DispatchQueue.main.async {
                switch qty {
                case HKQuantityType.quantityType(forIdentifier: .heartRate):
                    let unit = HKUnit.count().unitDivided(by: .minute())
                    if let hr = stats.mostRecentQuantity()?.doubleValue(for: unit) {
                        self.heartRate = hr
                        self.hrSamples.append(hr)
                        self.avgHeartRate = self.hrSamples.reduce(0, +) / Double(self.hrSamples.count)
                        self.hrZone = HRZone.zone(for: hr)
                        self.sendHeartRateToPhone(hr)
                    }
                case HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned):
                    let total = stats.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                    self.activeCalories = max(0, total - self.caloriesBase)
                case HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning):
                    let total = stats.sumQuantity()?.doubleValue(for: .meter()) ?? 0
                    self.distance = max(0, total - self.distanceBase)
                case HKQuantityType.quantityType(forIdentifier: .runningSpeed):
                    // Convert m/s → min/km
                    let mps = stats.mostRecentQuantity()?.doubleValue(for: .meter().unitDivided(by: .second())) ?? 0
                    self.currentPace = mps > 0 ? (1000.0 / mps / 60.0) : 0
                    if self.selectedMode == "race" {
                        self.checkPaceCoaching(currentPace: self.currentPace * 60, targetPace: self.targetPace)
                        // currentPace * 60 is total seconds, e.g. 5 min/km = 300 seconds
                    }
                // 🟢 步頻：用累積步數的增量推算 spm（每分鐘步數）
                case HKQuantityType.quantityType(forIdentifier: .stepCount):
                    let steps = stats.sumQuantity()?.doubleValue(for: .count()) ?? 0
                    let now = Date()
                    if let last = self.lastStepDate {
                        let dt = now.timeIntervalSince(last)
                        let dSteps = steps - self.lastStepCount
                        if dt > 1, dSteps >= 0 { self.cadence = (dSteps / dt) * 60.0 }
                    }
                    self.lastStepCount = steps; self.lastStepDate = now
                // 🟢 步幅（watchOS 直接量測，比手機估算準）
                case HKQuantityType.quantityType(forIdentifier: .runningStrideLength):
                    let s = stats.mostRecentQuantity()?.doubleValue(for: .meter()) ?? 0
                    if s > 0 { self.strideLength = s }
                default: break
                }
            }
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    // MARK: - Coach Mode
    func checkPaceCoaching(currentPace: Double, targetPace: Double) {
        let delta = currentPace - targetPace
        
        // 如果太慢了 15 秒以上 (秒數越多代表越慢)
        if delta > 15 { 
            WKInterfaceDevice.current().play(.directionDown) // 下沉感回饋
        } 
        // 如果太快了 15 秒以上
        else if delta < -15 { 
            WKInterfaceDevice.current().play(.directionUp) // 輕快回饋
        }
    }

    // MARK: - WatchConnectivity
    // 🔴 LIVE METRICS — send a full snapshot of the current workout state to iPhone
    //    so the React tracker can display real biometrics from HealthKit instead
    //    of the simulator. Includes: HR / pace / distance / calories / zone /
    //    elapsedSeconds / score. Sent ~1×/sec from the HR delegate callback.
    private func sendHeartRateToPhone(_ hr: Double) {
        guard WCSession.default.isReachable else { return }
        let zoneName = currentZoneName(for: hr)
        let payload: [String: Any] = [
            "type":             "LIVE_METRICS",
            "heartRate":        hr,
            "calories":         activeCalories,
            "distance":         distance,          // metres
            "currentPace":      currentPace,       // seconds per km
            "elapsedSeconds":   elapsedSeconds,
            "zone":             zoneName,
            "zoneId":           hrZone.rawValue,
            "score":            Double(score),
            "cadence":          cadence,           // 🟢 步頻 spm（深度分析步頻/步幅卡）
            "stride":           strideLength,      // 🟢 步幅 m
            "state":            String(describing: state)
        ]
        WCSession.default.sendMessage(payload, replyHandler: nil) { err in
            print("[Watch→Phone] live metrics send error: \(err.localizedDescription)")
        }
    }

    private func sendStateToPhone(_ stateStr: String) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["workoutState": stateStr], replyHandler: nil)
    }

    // MARK: - Zone Stats Helper
    // ⚠️ MUST mirror `cardiotrackermobile.jsx → getZoneInfo(hr)` exactly.
    //    React uses `<= max` cut-offs:  <=130 / <=150 / <=170 / <=190 / >190
    private func currentZoneName(for hr: Double) -> String {
        if hr <= 0     { return "Warm Up" }    // no signal yet → treat as warm-up
        if hr <= 130   { return "Warm Up" }
        if hr <= 150   { return "Fat Burn" }
        if hr <= 170   { return "Aerobic" }
        if hr <= 190   { return "Anaerobic" }
        return "Extreme"
    }

    // MARK: - 🪒 Downsampling Helpers (UI 視覺極限壓縮法)
    // 不管實際取樣多少點，最終都壓縮到 maxPoints (預設 100) 再送出，
    // 讓 JSON 永遠在幾 KB 以內，前端 Recharts / Leaflet 渲染又快又平滑。

    /// 把任意長度的 Double 陣列降採樣到至多 maxPoints 個點 (組內取平均)。
    private func downsample(_ values: [Double], to maxPoints: Int = 100) -> [Double] {
        guard values.count > maxPoints, maxPoints > 0 else { return values }
        let bucketSize = Double(values.count) / Double(maxPoints)
        var result: [Double] = []
        result.reserveCapacity(maxPoints)
        for i in 0..<maxPoints {
            let start = Int(Double(i) * bucketSize)
            let end = min(values.count, Int(Double(i + 1) * bucketSize))
            if start >= end { continue }
            let slice = values[start..<end]
            let avg = slice.reduce(0, +) / Double(slice.count)
            result.append(avg)
        }
        return result
    }

    /// 把字串陣列降採樣 (例如 zone 名稱) — 取每個 bucket 中出現次數最多的值。
    private func downsampleStrings(_ values: [String], to maxPoints: Int = 100) -> [String] {
        guard values.count > maxPoints, maxPoints > 0 else { return values }
        let bucketSize = Double(values.count) / Double(maxPoints)
        var result: [String] = []
        result.reserveCapacity(maxPoints)
        for i in 0..<maxPoints {
            let start = Int(Double(i) * bucketSize)
            let end = min(values.count, Int(Double(i + 1) * bucketSize))
            if start >= end { continue }
            // 取 bucket 中出現次數最多的 zone (mode)
            var counts: [String: Int] = [:]
            for v in values[start..<end] { counts[v, default: 0] += 1 }
            if let top = counts.max(by: { $0.value < $1.value })?.key {
                result.append(top)
            }
        }
        return result
    }

    /// 把 GPS 座標陣列降採樣 — 直接抽樣 (不取平均，避免路徑被「截彎取直」變掉)。
    private func downsampleCoordinates(_ coords: [[String: Double]], to maxPoints: Int = 100) -> [[String: Double]] {
        guard coords.count > maxPoints, maxPoints > 1 else { return coords }
        var result: [[String: Double]] = []
        result.reserveCapacity(maxPoints)
        let step = Double(coords.count - 1) / Double(maxPoints - 1)
        for i in 0..<maxPoints {
            let idx = min(coords.count - 1, Int(round(Double(i) * step)))
            result.append(coords[idx])
        }
        return result
    }

    func sendSummaryToPhone() {
        // 1. 確保數據都有安全值
        let finalDistanceMeters = self.distance
        let finalDistanceKm = finalDistanceMeters / 1000.0
        let finalDurationSeconds = self.elapsedSeconds
        let finalAvgHeartRate = self.avgHeartRate

        // 2. 卡路里：HealthKit 優先，若為 0 則用 MET 公式備用計算
        //    (HealthKit 沒有使用者體重/年齡時會回傳 0)
        var finalCalories = self.activeCalories
        if finalCalories <= 0 && finalDurationSeconds > 0 {
            let durationHours = Double(finalDurationSeconds) / 3600.0
            let metValue: Double
            if finalDistanceKm > 0 {
                let speedKmH = finalDistanceKm / durationHours
                metValue = speedKmH < 6 ? 3.5 : speedKmH < 8 ? 6.0 : speedKmH < 10 ? 8.0 : speedKmH < 12 ? 10.0 : 12.5
            } else if finalAvgHeartRate > 0 {
                metValue = finalAvgHeartRate < 120 ? 3.0 : finalAvgHeartRate < 140 ? 5.0 : finalAvgHeartRate < 160 ? 7.0 : 9.0
            } else {
                metValue = 6.0
            }
            let weightKg = 70.0 // HealthKit 未設定時預設 70 kg
            finalCalories = metValue * weightKg * durationHours
        }
        
        // 2. 配速計算 (以秒/公里計算)
        let finalAvgPaceSec = (finalDurationSeconds > 0 && finalDistanceKm > 0) ? Double(finalDurationSeconds) / finalDistanceKm : 0.0
        
        // 3. Score 的保險計算 (避免原本 accumulatedScore 傳送失敗)
        let finalScore = self.accumulatedScore > 0 ? self.accumulatedScore : Double(self.score)

        // 4. 強制轉換 Splits (避免型別問題)
        let formattedSplits = self.splits.map { split in
            return [
                "km": split.km,
                "time": split.time,
                "pace": split.pace,
                "avgHR": split.avgHR,
                "timestamp": split.timestamp
            ]
        }

        // 5. 🪒 UI 視覺極限壓縮法 — 不管跑了 10 分鐘還是 2 小時，
        //    所有時序陣列都壓到固定 100 點。這樣：
        //    • JSON 大小永遠被鎖死在幾 KB 以內 (省 WatchConnectivity 頻寬)
        //    • Recharts 不會 over-render，曲線一樣平滑漂亮
        //    • Leaflet Polyline 只需要畫 100 點就能拼出完整路徑
        let MAX_POINTS = 100
        let dsTimestamps  = downsample(streamTimestamps,  to: MAX_POINTS)
        let dsHeartRates  = downsample(streamHeartRates,  to: MAX_POINTS)
        let dsPaces       = downsample(streamPaces,       to: MAX_POINTS)
        let dsElevations  = downsample(streamElevations,  to: MAX_POINTS)
        let dsZones       = downsampleStrings(streamZones, to: MAX_POINTS)
        let dsRoute       = downsampleCoordinates(routeCoordinates, to: MAX_POINTS)

        print("[Watch] 🪒 Downsample: route \(routeCoordinates.count)→\(dsRoute.count), stream \(streamHeartRates.count)→\(dsHeartRates.count)")

        // 6. 🎯 組裝 JSON 結構 (完美的 Nested Structure)
        let payload: [String: Any] = [
            "workoutState": "ENDED", // 保留給 iPhone 判斷用的狀態標籤
            "source": "appleWatch",
            "userId": syncedUserId,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "type": selectedMode == "free" ? "running" : selectedMode,
            "targetScore": 0,

            // 🔥 這一包就是 React 會直接設進 `setWorkoutSummary(payload)` 的 stats
            "stats": [
                "distance": finalDistanceKm,         // React 要的通常是 Km
                "distance_meters": finalDistanceMeters, // 備用公尺
                "duration": finalDurationSeconds,    // 秒數
                "duration_seconds": finalDurationSeconds,
                "currentPace": currentPace * 60,
                "avgPace": finalAvgPaceSec,          // 平均配速
                "pace": finalAvgPaceSec,             // 備用配速 Key
                "calories": finalCalories,
                "heartRate": heartRate,
                "avgHR": finalAvgHeartRate,
                "score": finalScore,                 // 確認分數不為 0
                // 鍵名與 React `cardiotrackermobile.jsx` 的 zoneStats 完全一致
                "zoneStats": [
                    "Warm Up":   zoneSeconds["Warm Up"]   ?? 0,
                    "Fat Burn":  zoneSeconds["Fat Burn"]  ?? 0,
                    "Aerobic":   zoneSeconds["Aerobic"]   ?? 0,
                    "Anaerobic": zoneSeconds["Anaerobic"] ?? 0,
                    "Extreme":   zoneSeconds["Extreme"]   ?? 0
                ],
                "splits": formattedSplits
            ],

            // 真實 GPS 路線座標 (已壓縮到 100 點)
            "route": dsRoute,
            "stream_data": [
                "timestamps": dsTimestamps,  // 相對秒數，已壓縮
                "heart_rate": dsHeartRates,
                "pace": dsPaces,
                "elevation": dsElevations,
                "zones": dsZones             // 每段最頻繁的 zone 名稱
            ]
        ]

        // 7. 傳送資料到 iPhone
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(["watchSummaryPayload": payload], replyHandler: nil, errorHandler: { err in
                print("[Watch] sendSummary error: \(err.localizedDescription)")
                WCSession.default.transferUserInfo(["watchSummaryPayload": payload])
            })
        } else {
            WCSession.default.transferUserInfo(["watchSummaryPayload": payload])
        }

        print("[Watch] 📤 Sent cardio summary: Dist=\(finalDistanceKm)km, Time=\(finalDurationSeconds)s, Score=\(finalScore), RoutePts=\(dsRoute.count)")
    }

    // MARK: - WCSessionDelegate
    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {}

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async {
            // 🌟 接收 iPhone 推送的 userId 並持久化（同步寫入「所有 manager 讀的 key」）
            //    Watch 上 ContentView / NutritionManager / GymManager 各自註冊 WCSessionDelegate，
            //    只有最後一個會勝出。為了讓 StandbyManager / NutritionManager 也能讀到，
            //    在這裡同時更新所有 canonical key。
            if let uid = message["userId"] as? String, !uid.isEmpty {
                var saved = UserDefaults.standard.stringArray(forKey: "drvn_userIds") ?? []
                saved.removeAll { $0 == uid }
                saved.insert(uid, at: 0)
                UserDefaults.standard.set(saved, forKey: "drvn_userIds")
                UserDefaults.standard.set(uid, forKey: "drvn_primaryUserId")
                UserDefaults.standard.set(uid, forKey: "drvn_synced_userId")
                print("[Watch] 🔑 Stored userId: \(uid)")
                // 廣播給其他畫面（StandbyManager 監聽這個通知後重新拉資料）
                NotificationCenter.default.post(name: .drvnUserIdDidChange, object: nil, userInfo: ["userId": uid])
            }
            WatchConfig.store(from: message)

            // ⚠️ mode == "gym" 的指令交給 WatchConnHub 處理（重訓量心率），這裡只接 cardio/legacy。
            if let cmd = message["command"] as? String, (message["mode"] as? String) != "gym" {
                /* ⏱ 過期的指令一律丟掉。

                   手錶 App 沒開時，手機的 sendMessage 會退回 transferUserInfo 排隊，
                   而佇列要等手錶 App「下次啟動」才送達 —— 可能是幾小時甚至幾天後。
                   開跑還會連送三次（立刻／+1.5s／+4s），所以佇列裡常常積了三則
                   START_WORKOUT。使用者的症狀就是「一打開手錶 App 就直接跳進跑步」。

                   只有 90 秒內發出的指令才算數。沒有 ts 的是舊版手機送的，
                   同樣不自動開跑 —— 寧可少開一次，也不要使用者一打開就被拉進跑步。 */
                let age = Date().timeIntervalSince1970 - (message["ts"] as? Double ?? 0)
                let isFresh = age >= 0 && age < 90

                if !isFresh && cmd == "START_WORKOUT" {
                    print("[Watch] ⏱ 忽略過期的 START_WORKOUT（\(Int(age)) 秒前發出）")
                } else {
                    switch cmd {
                    case "START_WORKOUT":
                        let prewarm = (message["prewarm"] as? Bool) ?? false
                        if self.isPrewarm && !prewarm {
                            // 預熱中 → 手機真的開跑了：從這一刻重新計時
                            self.beginRealRun()
                        } else if self.state == .idle && WatchSessionGate.isViewSessionActive {
                            // 手錶上正在練重訓（同時只能有一個 workout）→ 不搶
                            print("[Watch] ⚠️ 手錶正在進行其他訓練，略過跑步 START")
                        } else {
                            self.startWorkout(byPhone: true, prewarm: prewarm)
                        }
                    case "PAUSE_WORKOUT":  self.pauseWorkout()
                    case "RESUME_WORKOUT": self.resumeWorkout()
                    case "STOP_WORKOUT":   self.endWorkout(byPhone: true)
                    default: break
                    }
                }
            }
        }
    }
    
    // Background delivery (transferUserInfo) also routes here
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        self.session(session, didReceiveMessage: userInfo)
    }

    // MARK: - CLLocationManagerDelegate
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // 只有在跑步進行中才記錄；暫停或結束都跳過
        guard state == .running else { return }

        for location in locations {
            // 過濾掉完全沒有定位的訊號 (accuracy < 0)；其餘一律收下，
            // 之前的 < 30m 上限太嚴格，剛開始定位時常常被擋掉導致空陣列
            guard location.horizontalAccuracy > 0 else { continue }

            // 太久之前的快取點不要 (> 5 秒)
            if abs(location.timestamp.timeIntervalSinceNow) > 5 { continue }

            let coord: [String: Double] = [
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude
            ]
            DispatchQueue.main.async {
                self.routeCoordinates.append(coord)
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[Watch] 🛰️ GPS error: \(error.localizedDescription)")
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let st = manager.authorizationStatus
        print("[Watch] 🛰️ GPS auth changed: \(st.rawValue)")
        // 拿到授權後立刻補開始（避免授權彈窗時錯過第一波點）
        if (st == .authorizedWhenInUse || st == .authorizedAlways) && state == .running {
            manager.startUpdatingLocation()
        }
    }
}

// MARK: - App Mode
enum AppMode { case picker, gym, cardio, lab, nutrition }

// MARK: - Root ContentView (Navigation Host)
struct ContentView: View {
    @State private var mode: AppMode = .picker
    @ObservedObject private var cardio = WatchWorkoutManager.shared

    var body: some View {
        ZStack {
            Color.drvnDeepBlack.ignoresSafeArea()
            switch mode {
            case .picker:    ModePicker(mode: $mode)
            case .gym:       GymLoggingView(onBack: { mode = .picker })
            case .cardio:    CardioRootView(onBack: { mode = .picker })
            case .lab:       LabDashboardView(onBack: { mode = .picker })
            case .nutrition: NutritionView(onBack: { mode = .picker })
            }
        }
        // 手機開跑 → 手錶不管停在哪一頁（重訓除外）都切到跑步畫面，看得到心率與時間
        .onReceive(cardio.$state) { st in
            if (st == .running || st == .paused) && mode != .cardio && mode != .gym {
                mode = .cardio
            }
        }

    }
}

// MARK: - Mode Picker (Swiss Grid Design)
struct ModePicker: View {
    @Binding var mode: AppMode

    // ── Standby (Always-On Smart Stack) ───────────────────────
    // 使用者在主頁面靜止 > 30 秒即觸發待機輪播畫面
    @State private var showStandby: Bool = false
    @State private var idleTimer: Timer?
    private let idleThreshold: TimeInterval = 5.0

    private var dateLabel: String {
        let f = DateFormatter(); f.dateFormat = "EEE d MMM"
        return f.string(from: Date()).uppercased()
    }

    private func resetIdleTimer() {
        idleTimer?.invalidate()
        idleTimer = Timer.scheduledTimer(withTimeInterval: idleThreshold,
                                         repeats: false) { _ in
            // 只有當仍在主頁面 (ModePicker) 時才彈出待機
            showStandby = true
        }
    }
    private func stopIdleTimer() {
        idleTimer?.invalidate()
        idleTimer = nil
    }

    var body: some View {
        HStack(spacing: 7) {
            // ── 左側區塊：DRVN LAB — Titanium 拉絲金屬卡 ──
            Button(action: {
                WKInterfaceDevice.current().play(.click)
                mode = .lab
            }) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 2) {
                        Text("D\nR")
                            .font(.custom("Helvetica Neue", size: 28))
                            .fontWeight(.black)
                            .lineSpacing(-8)
                            .foregroundColor(Color.drvnDeepBlack)
                        Text("V\nN")
                            .font(.custom("Helvetica Neue", size: 28))
                            .fontWeight(.black)
                            .lineSpacing(-8)
                            .foregroundColor(Color.drvnDeepBlack)
                    }
                    .padding(.top, 14)
                    .padding(.leading, 12)

                    Spacer()

                    // square editorial hairline — 圓殼 vs 硬線張力
                    Rectangle()
                        .fill(Color.drvnDeepBlack.opacity(0.18))
                        .frame(width: 26, height: 1.5)
                        .padding(.leading, 12)
                        .padding(.bottom, 6)

                    Text(dateLabel)
                        .font(.custom("Helvetica Neue", size: 9))
                        .fontWeight(.bold)
                        .tracking(1.5)
                        .foregroundColor(Color.drvnDeepBlack.opacity(0.62))
                        .padding(.leading, 12)
                        .padding(.bottom, 2)

                    Text("LAB")
                        .font(.custom("Helvetica Neue", size: 12))
                        .fontWeight(.bold)
                        .tracking(2)
                        .foregroundColor(Color.drvnDeepBlack.opacity(0.5))
                        .padding(.bottom, 14)
                        .padding(.leading, 12)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .drvnGlass(tint: Color.drvnPaper.opacity(0.65), corner: 22, light: true)
                .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .buttonStyle(.plain)

            // ── 右側區塊：GYM / RUN / EAT ──
            VStack(spacing: 6) {
                // 右上：GYM — 唯一 Coral 焦點
                Button(action: {
                    WKInterfaceDevice.current().play(.click)
                    mode = .gym
                }) {
                    ModeTile(title: "GYM", sub: "STRENGTH",
                             titleColor: .drvnPaper, subColor: .drvnPaper.opacity(0.72),
                             tint: Color(hex: "F95C4B").opacity(0.55))
                }
                .buttonStyle(.plain)

                // 右中：RUN — 深鈦金屬牆 + Liquid Glass 浮層
                Button(action: {
                    WKInterfaceDevice.current().play(.click)
                    mode = .cardio
                }) {
                    ModeTile(title: "RUN", sub: "ENDURANCE",
                             titleColor: .drvnPaper, subColor: .drvnPebble.opacity(0.85),
                             tint: Color(white: 0.12).opacity(0.4))
                }
                .buttonStyle(.plain)

                // 右下：EAT — Sage 玻璃綠 (DRVN 暖調)
                Button(action: {
                    WKInterfaceDevice.current().play(.click)
                    mode = .nutrition
                }) {
                    ModeTile(title: "EAT", sub: "NUTRITION",
                             titleColor: Color(hex: "1C2418"), subColor: Color(hex: "1C2418").opacity(0.6),
                             tint: Color(hex: "A8C99C").opacity(0.65), light: true)
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(6)
        .background(
            // 玻璃後面放三團很淡的色光：珊瑚、鼠尾草綠、暖灰 —— 讓玻璃有東西可以折射，
            // 不然黑底上的玻璃只是一塊塊霧面色塊
            ZStack {
                Color.drvnDeepBlack
                Circle().fill(Color(hex: "F95C4B").opacity(0.32)).frame(width: 90, height: 90)
                    .blur(radius: 30).offset(x: 42, y: -52)
                Circle().fill(Color(hex: "A8C99C").opacity(0.26)).frame(width: 80, height: 80)
                    .blur(radius: 28).offset(x: 46, y: 58)
                Circle().fill(Color(hex: "CFC6B8").opacity(0.20)).frame(width: 96, height: 96)
                    .blur(radius: 32).offset(x: -44, y: 4)
            }
            .ignoresSafeArea()
        )
        // 任何點擊（含按鈕）都重置閒置計時器
        .simultaneousGesture(
            TapGesture().onEnded { _ in resetIdleTimer() }
        )
        .onAppear { resetIdleTimer() }
        .onDisappear { stopIdleTimer() }
        // ── Standby 全螢幕覆蓋（overlay 方式：無系統 X 按鈕）──
        .overlay {
            if showStandby {
                StandbyView(onDismiss: {
                    withAnimation(.easeInOut(duration: 0.35)) { showStandby = false }
                    resetIdleTimer()
                })
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.35), value: showStandby)
                .ignoresSafeArea()
            }
        }
    }
}

// MARK: - Cardio Root View (Swiss Editorial)
struct CardioRootView: View {
    @ObservedObject private var manager = WatchWorkoutManager.shared
    var onBack: () -> Void

    // Navigation state — all handled here so children stay stateless
    @State private var showingPlan: RunPlan? = nil
    @State private var showCountdown: Bool  = false
    @State private var pendingModeId: String = "free"
    @State private var pendingPlan: RunPlan? = nil

    var body: some View {
        ZStack {
            Color.drvnDeepBlack.ignoresSafeArea()
            switch manager.state {
            case .idle:
                Group {
                    if let plan = showingPlan {
                        // ── Plan Preview ──
                        RunPlanPreviewView(
                            mode: runModes.first(where: { $0.id == plan.modeId }) ?? runModes[0],
                            plan: plan,
                            onStart: {
                                pendingPlan = plan
                                showingPlan = nil
                                showCountdown = true
                            },
                            onBack: { showingPlan = nil }
                        )
                    } else if showCountdown {
                        // ── 3-2-1 Countdown ──
                        CountdownView {
                            showCountdown = false
                            let plan = pendingPlan ?? (pendingModeId == "free" ? nil : drvnRunPlans[pendingModeId])
                            pendingPlan = nil
                            manager.startWorkout(activityType: .running,
                                                 mode: pendingModeId,
                                                 plan: plan)
                        }
                    } else {
                        // ── Mode Selector ──
                        CardioIdleView(manager: manager, onBack: onBack, onSelectMode: { modeId in
                            pendingPlan = nil
                            pendingModeId = modeId
                            WKInterfaceDevice.current().play(.click)
                            if modeId == "free" {
                                showCountdown = true
                            } else if let plan = drvnRunPlans[modeId] {
                                showingPlan = plan
                            } else {
                                showCountdown = true   // fallback for future modes
                            }
                        }, onSelectPlan: { plan in
                            // 使用者自己的課：先看分段預覽，按開始才用這一份開跑
                            WKInterfaceDevice.current().play(.click)
                            pendingModeId = plan.modeId
                            showingPlan = plan
                        })
                    }
                }
            case .running, .paused:
                CardioEditorialView(manager: manager)
            case .ended:
                CardioSummaryView(manager: manager)
            }
        }
        .onAppear { manager.requestAuthorization() }
    }
}

// MARK: - Idle / Start Screen
struct IdleView: View {
    @ObservedObject var manager: WatchWorkoutManager
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Logo mark
            ZStack {
                Circle()
                    .stroke(Color.drvnPaper.opacity(0.08), lineWidth: 1)
                    .frame(width: 80, height: 80)
                    .scaleEffect(pulse ? 1.15 : 1.0)
                    .opacity(pulse ? 0 : 0.6)
                    .animation(.easeOut(duration: 1.5).repeatForever(autoreverses: false), value: pulse)

                Circle()
                    .stroke(Color.drvnPaper.opacity(0.20), lineWidth: 0.5)
                    .frame(width: 64, height: 64)

                Image(systemName: "figure.run")
                    .font(.drvnFont(size: 26, weight: .ultraLight))
                    .foregroundColor(.drvnPaper)
            }

            Spacer().frame(height: 18)

            Text("DRVN")
                .font(.drvnFont(size: 13, weight: .thin))
                .tracking(8)
                .foregroundColor(.drvnStone)

            Text("STUDIO")
                .font(.drvnFont(size: 10, weight: .thin))
                .tracking(6)
                .foregroundColor(.drvnStone.opacity(0.6))

            Spacer()

            // Start button
            Button(action: { manager.startWorkout() }) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 6, height: 6)
                    Text("BEGIN SESSION")
                        .font(.drvnBold(10))
                        .tracking(2)
                        .foregroundColor(.drvnDeepBlack)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .drvnGlass(tint: Color.drvnPaper, corner: 18, light: true)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)

            Spacer().frame(height: 8)
        }
        .onAppear { pulse = true }
    }
}

// MARK: - Active Workout View (Running / Paused)
struct ActiveWorkoutView: View {
    @ObservedObject var manager: WatchWorkoutManager
    @State private var showControls = false
    @State private var hrPulse = false

    var isPaused: Bool { manager.state == .paused }

    var body: some View {
        VStack(spacing: 0) {

            // ── Top bar ────────────────────────────────────
            HStack {
                // Zone pill
                Text(manager.hrZone.label)
                    .font(.drvnBold(8))
                    .tracking(2)
                    .foregroundColor(manager.hrZone.color)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(manager.hrZone.color.opacity(0.6), lineWidth: 0.5)
                    )

                Spacer()

                // Status indicator
                HStack(spacing: 4) {
                    Circle()
                        .fill(isPaused ? Color.drvnStone : Color.drvnCoral)
                        .frame(width: 5, height: 5)
                        .opacity(isPaused ? 1 : (hrPulse ? 0.3 : 1))
                        .animation(.easeInOut(duration: 0.8).repeatForever(), value: hrPulse)
                    Text(isPaused ? "PAUSED" : "LIVE")
                        .font(.drvnFont(size: 9, weight: .medium))
                        .tracking(1.5)
                        .foregroundColor(.drvnStone)
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)

            // ── Timer ──────────────────────────────────────
            Text(manager.elapsedFormatted)
                .font(.drvnFont(size: 38, weight: .thin))
                .foregroundColor(isPaused ? Color.drvnStone : .drvnPaper)
                .padding(.top, 4)
                .padding(.bottom, 2)

            // ── Divider line ──────────────────────────────
            Rectangle()
                .fill(Color(white: 0.15))
                .frame(height: 0.5)
                .padding(.horizontal, 16)

            // ── Metrics grid ──────────────────────────────
            HStack(spacing: 0) {
                MetricCell(
                    value: "\(Int(manager.heartRate))",
                    unit: "BPM",
                    label: "HEART RATE",
                    color: manager.hrZone.color
                )

                // Vertical divider
                Rectangle()
                    .fill(Color.drvnPebble.opacity(0.12))
                    .frame(width: 1)
                    .padding(.vertical, 4)

                MetricCell(
                    value: String(format: "%.0f", manager.activeCalories),
                    unit: "KCAL",
                    label: "ENERGY",
                    color: .drvnPaper.opacity(0.8)
                )
            }
            .padding(.vertical, 6)

            // ── Distance row ──────────────────────────────
            Rectangle()
                .fill(Color(white: 0.15))
                .frame(height: 0.5)
                .padding(.horizontal, 16)

            HStack {
                Text("DISTANCE")
                    .font(.drvnFont(size: 8, weight: .medium))
                    .tracking(2)
                    .foregroundColor(.drvnStone)
                Spacer()
                Text(manager.distanceFormatted)
                    .font(.drvnFont(size: 13, weight: .light))
                    .foregroundColor(.drvnStone.opacity(0.8))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)

            Spacer()

            // ── Control buttons ───────────────────────────
            HStack(spacing: 16) {
                // Pause / Resume
                ControlButton(
                    icon: isPaused ? "play.fill" : "pause.fill",
                    tint: isPaused ? Color.drvnCoral : Color.drvnStone,
                    action: {
                        if isPaused { manager.resumeWorkout() }
                        else        { manager.pauseWorkout() }
                    }
                )

                // End (only visible when paused)
                if isPaused {
                    ControlButton(
                        icon: "stop.fill",
                        tint: .drvnEmber,
                        action: { manager.endWorkout() }
                    )
                }
            }
            .padding(.bottom, 10)
        }
        .onAppear { hrPulse = true }
    }
}

// MARK: - Metric Cell
struct MetricCell: View {
    let value: String
    let unit: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.drvnFont(size: 8, weight: .medium))
                .tracking(1.5)
                .foregroundColor(.drvnStone.opacity(0.8))
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value)
                    .font(.drvnFont(size: 26, weight: .thin))
                    .foregroundColor(color)
                Text(unit)
                    .font(.drvnFont(size: 9, weight: .medium))
                    .tracking(1)
                    .foregroundColor(color.opacity(0.6))
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Control Button
struct ControlButton: View {
    let icon: String
    let tint: Color
    let action: () -> Void
    @State private var pressed = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.10))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Circle().stroke(tint.opacity(0.35), lineWidth: 0.5)
                    )
                Image(systemName: icon)
                    .font(.drvnFont(size: 16, weight: .regular))
                    .foregroundColor(tint)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Summary Screen
struct SummaryView: View {
    @ObservedObject var manager: WatchWorkoutManager
    @State private var appear = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {

            VStack(alignment: .leading, spacing: 0) {
                // ── Compact Magazine Header ──────────────────
                VStack(alignment: .leading, spacing: 0) {
                    Text("WORKOUT")
                        .font(.custom("Helvetica Neue", size: 9))
                        .fontWeight(.bold)
                        .tracking(3)
                        .foregroundColor(.drvnCoral)
                    
                    Text("COMPLETE")
                        .font(.custom("Helvetica Neue", size: 18))
                        .fontWeight(.thin)
                        .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                }
                .padding(.horizontal, 8)
                .padding(.top, 18) // Adjusted to fit screen without scrolling
                .opacity(appear ? 1 : 0)
                .animation(.easeOut(duration: 0.6), value: appear)

                Spacer(minLength: 4)

                // ── Compact Stats Grid ───────────────────────
                VStack(spacing: 0) {
                    SummaryRow(label: "DURATION", value: manager.elapsedFormatted, accent: .clear)
                    SummaryRow(label: "CALORIES", value: "\(Int(manager.activeCalories)) KCAL", accent: .clear)
                    SummaryRow(label: "DISTANCE", value: manager.distanceFormatted, accent: .clear)
                    SummaryRow(label: "AVG HR", value: "\(Int(manager.avgHeartRate)) BPM", accent: .clear)
                    SummaryRow(label: "ZONE", value: HRZone.zone(for: manager.avgHeartRate).label.uppercased(), accent: .clear)
                    
                    Rectangle()
                        .fill(Color.white.opacity(0.12))
                        .frame(height: 0.5)
                }
                .padding(.horizontal, 8)

                Spacer(minLength: 4)

                // ── Compact Button ───────────────────────────
                Button(action: {
                    manager.heartRate = 0
                    manager.activeCalories = 0
                    manager.distance = 0
                    manager.elapsedSeconds = 0
                    manager.state = .idle
                }) {
                    Text("DONE")
                        .font(.custom("Helvetica Neue", size: 10))
                        .fontWeight(.bold)
                        .tracking(2)
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .drvnGlass(tint: Color.white.opacity(0.1), corner: 18, light: false)
                        .foregroundColor(Color(red: 0.88, green: 0.88, blue: 0.87)) // #E0E1DD
                        .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.bottom, 6)
            }
            .background(Color.drvnDeepBlack.ignoresSafeArea())

            }
        }
        .onAppear { appear = true }
    }
}

// MARK: - Summary Row
struct SummaryRow: View {
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
            .padding(.vertical, 8)
            .padding(.horizontal, 2)
        }
    }
}

// MARK: - Run Plan Preview View (Swiss Editorial)
struct RunPlanPreviewView: View {
    let mode: RunMode
    let plan: RunPlan
    var onStart: () -> Void
    var onBack: () -> Void

    @State private var difficulty: String = "beginner"

    var adjustedSteps: [RunStep] {
        if difficulty == "advanced" {
            return plan.steps.map { step in
                let newSeconds = Int(Double(step.durationSeconds) * 1.5)
                let newPace = max(step.targetPaceSeconds - 30, 180) // 30s faster, min 3'00"
                let total = Int(newPace)
                let newPaceStr = String(format: "%d'%02d\"", total / 60, total % 60)
                return RunStep(name: step.name, durationSeconds: newSeconds, targetPaceStr: newPaceStr, targetPaceSeconds: newPace, intensity: step.intensity)
            }
        }
        return plan.steps
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                
                // ── Header (Back & Label) ──
                HStack(alignment: .center) {
                    Button(action: {
                        WKInterfaceDevice.current().play(.click)
                        onBack()
                    }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 26, height: 26)
                            .drvnGlass(tint: Color.white.opacity(0.12), corner: 18, light: false)
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    
                    Spacer()
                    
                    Text("DRVN CLUB")
                        .font(.drvnBold(8))
                        .tracking(2.0)
                        .foregroundColor(.drvnStone)
                }
                .padding(.horizontal, 10)
                .padding(.top, 10)

                // ── Plan Hero ──
                VStack(alignment: .leading, spacing: 2) {
                    Text(mode.sublabel)
                        .font(.custom("Helvetica Neue", size: 9))
                        .fontWeight(.black)
                        .tracking(1.5)
                        .foregroundColor(mode.id == "free" ? Color.drvnCrimson : mode.accent)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background((mode.id == "free" ? Color.drvnCrimson : mode.accent).opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 2))
                    
                    Text(mode.label)
                        .font(.custom("Helvetica Neue", size: 24))
                        .fontWeight(.black)
                        .foregroundColor(.white)
                        .tracking(1)
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)
                
                // ── Difficulty Selector ──
                HStack(spacing: 8) {
                    Button(action: { difficulty = "beginner" }) {
                        Text("入門")
                            .font(.drvnFont(size: 11, weight: .heavy))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                            .background(difficulty == "beginner" ? mode.accent.opacity(0.15) : Color(white: 0.1))
                            .foregroundColor(difficulty == "beginner" ? mode.accent : Color(white: 0.5))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(difficulty == "beginner" ? mode.accent.opacity(0.4) : Color.clear, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    
                    Button(action: { difficulty = "advanced" }) {
                        Text("進階")
                            .font(.drvnFont(size: 11, weight: .heavy))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                            .background(difficulty == "advanced" ? mode.accent.opacity(0.15) : Color(white: 0.1))
                            .foregroundColor(difficulty == "advanced" ? mode.accent : Color(white: 0.5))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(difficulty == "advanced" ? mode.accent.opacity(0.4) : Color.clear, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }

                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                
                Rectangle()
                    .fill(Color.drvnPebble.opacity(0.15))
                    .frame(height: 1)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 4)
                
                Text("WORKOUT STRUCTURE")
                    .font(.drvnBold(8))
                    .tracking(2.0)
                    .foregroundColor(.drvnStone)
                    .padding(.horizontal, 10)

                // ── Steps Timeline ──
                VStack(spacing: 8) {
                    ForEach(adjustedSteps) { step in
                        HStack(spacing: 6) {
                            Text("\(step.durationSeconds / 60)m")
                                .font(.drvnFont(size: 10, weight: .medium))
                                .foregroundColor(.drvnStone)
                                .frame(width: 24, alignment: .trailing)
                            
                            Circle()
                                .stroke(mode.accent, lineWidth: 1.5)
                                .frame(width: 6, height: 6)
                            
                            Text(step.name)
                                .font(.drvnBold(12))
                                .foregroundColor(.drvnPaper)
                            
                            Spacer()
                            
                            Text(step.targetPaceStr)
                                .font(.drvnBold(12))
                                .foregroundColor(mode.accent)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)
                
                Spacer().frame(height: 12)
                
                // ── Start Button ──
                Button(action: {
                    WKInterfaceDevice.current().play(.click)
                    onStart()
                }) {
                    Text("START \(difficulty == "beginner" ? "入門" : "進階")")
                        .font(.custom("Helvetica Neue", size: 12))
                        .fontWeight(.black)
                        .tracking(2.0)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .drvnGlass(tint: Color.drvnCrimson, corner: 18, light: false)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 10)
                .padding(.bottom, 10)
            }
        }
        .background(Color.drvnDeepBlack.ignoresSafeArea())
    }
}

// MARK: - Countdown View
struct CountdownView: View {
    var onComplete: () -> Void
    @State private var count = 3
    let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            Color.drvnDeepBlack.ignoresSafeArea()
            
            VStack(spacing: 0) {
                Text("READY")
                    .font(.custom("Helvetica Neue", size: 10))
                    .fontWeight(.black)
                    .tracking(5)
                    .foregroundColor(.drvnCoral)
                    .padding(.bottom, 4)
                
                Text("\(count)")
                    .font(.custom("Helvetica Neue", size: 80))
                    .fontWeight(.thin)
                    .foregroundColor(.white)
                    .transition(.scale.combined(with: .opacity))
                    .id(count)
                
                Text("GO")
                    .font(.custom("Helvetica Neue", size: 10))
                    .fontWeight(.black)
                    .tracking(5)
                    .foregroundColor(.white.opacity(0.2))
                    .padding(.top, 4)
            }
        }
        .onAppear {
            WKInterfaceDevice.current().play(.click)
        }
        .onReceive(timer) { _ in
            if count > 1 {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    count -= 1
                }
                WKInterfaceDevice.current().play(.click)
            } else {
                timer.upstream.connect().cancel()
                WKInterfaceDevice.current().play(.start)
                onComplete()
            }
        }
    }
}

struct RecoveryStatus {
    var batteryLevel: Int = 0
    var statusZh: String = "載入中..."
    var targetMuscle: String = "--"
}

struct TodayPlanInfo {
    var label: String
    var focus: String
    var exerciseCount: Int
    var setCount: Int
}

// MARK: - Lab Dashboard (Luxury Plan & Recovery)
struct LabDashboardView: View {
    let onBack: () -> Void
    @StateObject private var gym = GymWorkoutManager()

    @State private var recoveryData = RecoveryStatus()
    @State private var isLoadingRecovery = true
    @State private var todayPlan: TodayPlanInfo? = nil
    @State private var isLoadingTodayPlan = true

    private var baseURL: String { WatchConfig.apiBaseURL }

    private var currentUserId: String {
        if let saved = UserDefaults.standard.string(forKey: "drvn_primaryUserId"), !saved.isEmpty { return saved }
        return UserDefaults.standard.stringArray(forKey: "drvn_userIds")?.first ?? ""
    }

    // MARK: - Fetch Today's Plan
    private func fetchTodayPlan() {
        let uid = currentUserId
        guard !uid.isEmpty,
              let url = URL(string: "\(baseURL)/api/plan/\(uid)/today") else {
            self.isLoadingTodayPlan = false
            self.fetchRecovery()
            return
        }
        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { data, _, error in
            DispatchQueue.main.async {
                self.isLoadingTodayPlan = false
                guard let data = data, error == nil,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let isRest = json["is_rest_day"] as? Bool, !isRest,
                      let planDict = json["today_plan"] as? [String: Any] else {
                    // 休息日或讀不到今天的課，也要去抓恢復度 —— 以前這裡直接 return，恢復度永遠在轉圈
                    self.fetchRecovery()
                    return
                }
                let label = planDict["label"] as? String ?? "Today"
                let focus = planDict["focus"] as? String ?? ""
                let exCount = planDict["exercise_count"] as? Int ?? 0
                let setCount = planDict["set_count"] as? Int ?? 0
                self.todayPlan = TodayPlanInfo(label: label, focus: focus,
                                               exerciseCount: exCount, setCount: setCount)
                // Now fetch recovery for today's specific muscle group
                self.fetchRecovery(muscle: focus)
            }
        }.resume()
    }

    private func fetchRecovery(muscle: String = "") {
        let uid = currentUserId
        var urlStr = "\(baseURL)/api/user/\(uid)/recovery-status"
        if !muscle.isEmpty, let encoded = muscle.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            urlStr += "?muscle=\(encoded)"
        }
        guard !uid.isEmpty, let url = URL(string: urlStr) else {
            self.recoveryData = RecoveryStatus(batteryLevel: 0, statusZh: "無法取得用戶 ID", targetMuscle: "--")
            self.isLoadingRecovery = false
            return
        }
        
        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { data, response, error in
            guard let data = data, error == nil else {
                DispatchQueue.main.async {
                    self.recoveryData = RecoveryStatus(batteryLevel: 0, statusZh: "連線失敗", targetMuscle: "--")
                    self.isLoadingRecovery = false
                }
                return
            }
            
            if let http = response as? HTTPURLResponse, http.statusCode == 401 || http.statusCode == 403 {
                DispatchQueue.main.async {
                    self.recoveryData = RecoveryStatus(batteryLevel: 0, statusZh: "打開手機 DRVN 同步登入", targetMuscle: "--")
                    self.isLoadingRecovery = false
                }
                return
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let battery = json["battery_level"] as? Int ?? 0
                let statusZh = json["status_zh"] as? String ?? ""
                let muscle = json["target_muscle"] as? String ?? ""
                DispatchQueue.main.async {
                    self.recoveryData = RecoveryStatus(batteryLevel: battery, statusZh: statusZh, targetMuscle: muscle)
                    self.isLoadingRecovery = false
                }
            } else {
                DispatchQueue.main.async {
                    self.isLoadingRecovery = false
                }
            }
        }.resume()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Header
                HStack {
                    Button(action: { WKInterfaceDevice.current().play(.click); onBack() }) {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 14, weight: .bold))
                            Text("BACK")
                                .font(.custom("Helvetica Neue", size: 10))
                                .fontWeight(.bold)
                                .tracking(1)
                        }
                        .foregroundColor(Color(hex: "161415")) // Deep Black
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .drvnGlass(tint: Color(hex: "CFC6B8"), corner: 18, light: true) // Pebble
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    
                    Spacer()
                    
                    Text("DRVN LAB")
                        .font(.custom("Helvetica Neue", size: 12))
                        .fontWeight(.bold)
                        .tracking(2)
                        .foregroundColor(Color(hex: "F6F4F1")) // Paper
                }
                .padding(.horizontal)
                .padding(.top, 16)

                // Today's Plan Capsule
                VStack(alignment: .leading, spacing: 8) {
                    Text("TODAY'S PROTOCOL")
                        .font(.custom("Helvetica Neue", size: 10))
                        .fontWeight(.bold)
                        .tracking(2)
                        .foregroundColor(Color(hex: "CFC6B8").opacity(0.7)) // Pebble
                    
                    if isLoadingTodayPlan {
                        // Loading
                        HStack {
                            ProgressView().tint(Color(hex: "D94030")) // Ember
                            Text("SYNCING...")
                                .font(.custom("Helvetica Neue", size: 12))
                                .fontWeight(.bold)
                                .tracking(1)
                                .foregroundColor(Color(hex: "161415")) // Deep Black
                                .padding(.leading, 8)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .drvnGlass(tint: Color(hex: "E4DED2"), corner: 18, light: true) // Stone
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    } else if let plan = todayPlan {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(plan.label)
                                .font(.custom("Helvetica Neue", size: 16))
                                .fontWeight(.black)
                                .foregroundColor(Color(hex: "161415")) // Deep Black

                            HStack {
                                Text("\(plan.exerciseCount) EXERCISES")
                                    .font(.custom("Helvetica Neue", size: 10))
                                    .fontWeight(.bold)
                                    .foregroundColor(Color(hex: "161415").opacity(0.7))

                                Text("·")
                                    .foregroundColor(Color(hex: "161415").opacity(0.7))

                                Text("\(plan.setCount) SETS")
                                    .font(.custom("Helvetica Neue", size: 10))
                                    .fontWeight(.bold)
                                    .foregroundColor(Color(hex: "161415").opacity(0.7))
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .drvnGlass(tint: Color(hex: "E4DED2"), corner: 18, light: true) // Stone
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    } else {
                        // Rest day
                        VStack(alignment: .leading, spacing: 4) {
                            Text("今天休息日")
                                .font(.custom("Helvetica Neue", size: 16))
                                .fontWeight(.black)
                                .foregroundColor(Color(hex: "161415")) // Deep Black
                            Text("REST & RECOVER")
                                .font(.custom("Helvetica Neue", size: 10))
                                .fontWeight(.bold)
                                .foregroundColor(Color(hex: "161415").opacity(0.7))
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .drvnGlass(tint: Color(hex: "E4DED2"), corner: 18, light: true) // Stone
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                }
                .padding(.horizontal)

                // Recovery Status Capsules
                VStack(alignment: .leading, spacing: 8) {
                    Text("RECOVERY METRICS")
                        .font(.custom("Helvetica Neue", size: 10))
                        .fontWeight(.bold)
                        .tracking(2)
                        .foregroundColor(Color(hex: "CFC6B8").opacity(0.7))
                    
                    if isLoadingRecovery {
                        HStack {
                            ProgressView().tint(Color(hex: "F95C4B")) // Coral
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .drvnGlass(tint: Color(hex: "1C1C1E"), corner: 18, light: false) // Deep Gray
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    } else {
                        VStack(spacing: 8) {
                            HStack(spacing: 8) {
                                // Battery Level
                                RecoveryCard(
                                    title: "BATTERY", 
                                    value: "\(recoveryData.batteryLevel)%", 
                                    color: Color(hex: "F95C4B"), // Coral
                                    bg: Color(hex: "1C1C1E") // Deep Gray
                                )
                                // Target Muscle
                                RecoveryCard(
                                    title: "TARGET", 
                                    value: recoveryData.targetMuscle, 
                                    color: Color(hex: "F6F4F1"), // Paper
                                    bg: Color(hex: "1C1C1E") // Deep Gray
                                )
                            }
                            // Status text
                            Text(recoveryData.statusZh)
                                .font(.custom("Helvetica Neue", size: 11))
                                .fontWeight(.regular)
                                .foregroundColor(Color(hex: "F6F4F1")) // Paper
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .frame(maxWidth: .infinity)
                                .drvnGlass(tint: Color(hex: "1C1C1E"), corner: 18, light: false) // Deep Gray
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
        }
        .background(Color(hex: "161415").ignoresSafeArea()) // Deep Black
        .onAppear {
            // 1. Fetch today's specific plan first; recovery is fetched inside with today's muscle
            fetchTodayPlan()
            // 2. Also load all plans for the gym selector
            gym.fetchPlanFromAPI()
        }
    }
}

struct RecoveryCard: View {
    let title: String
    let value: String
    let color: Color
    let bg: Color
    
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(color)
                .minimumScaleFactor(0.8)
                .lineLimit(1)
            
            Text(title)
                .font(.custom("Helvetica Neue", size: 10))
                .fontWeight(.bold)
                .tracking(1)
                .foregroundColor(Color(hex: "CFC6B8").opacity(0.8)) // Pebble
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
