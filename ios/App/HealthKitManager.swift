import Foundation
import HealthKit
import CoreLocation
import Combine

/**
 * 🏃 HealthKit Manager (iOS 17+ Optimized)
 * 負責所有與 HealthKit 相關的數據獲取和處理
 */
@available(iOS 17.0, *)
class HealthKitManager: NSObject, ObservableObject {
    
    // MARK: - Properties
    
    private let healthStore = HKHealthStore()
    
    private var workoutSession: HKWorkoutSession?
    private var workoutBuilder: HKLiveWorkoutBuilder?
    
    private let locationManager = CLLocationManager()
    
    @Published var isAuthorized: Bool = false
    @Published var currentHeartRate: Double = 0
    @Published var currentDistance: Double = 0
    @Published var currentPace: Double = 0
    @Published var currentElevation: Double = 0
    @Published var currentCalories: Double = 0
    @Published var currentCadence: Double = 0     // 🆕 spm
    @Published var currentStride: Double = 0      // 🆕 m
    @Published var duration: TimeInterval = 0

    @Published var routePoints: [(lat: Double, lng: Double, timestamp: Date)] = []

    var heartRateStream: [Double] = []
    var paceStream: [Double] = []
    var elevationStream: [Double] = []
    var cadenceStream: [Double] = []              // 🆕
    var strideStream: [Double] = []               // 🆕
    var timestampStream: [Date] = []

    // 🆕 步頻計算用：訓練起始時間 + 上一次步數樣本（供時間窗差分算「瞬時步頻」）
    var workoutStartDate: Date?
    private var lastStepTotal: Double = 0
    private var lastStepSampleTime: Date?

    @Published var hasHeartRateData: Bool = false
    @Published var hasGPSData: Bool = false
    @Published var hasElevationData: Bool = false
    @Published var hasCadenceData: Bool = false   // 🆕
    @Published var hasStrideData: Bool = false    // 🆕
    @Published var isTreadmillMode: Bool = false  // 🆕 — GPS 沒訊號 or 使用者指定室內

    // 🆕 跑步機模式專用：CMPedometer 推算的距離 (km)，當 GPS 不可用時取代 currentDistance
    @Published var pedometerDistance: Double = 0
    @Published var pedometerSteps: Int = 0

    // 🆕 訓練模式（決定要不要啟 GPS / Pedometer）
    enum WorkoutMode: String { case running, gym, treadmill }
    private var currentMode: WorkoutMode = .running

    // 🆕 跑步機模式的 CMPedometer 管理
    let pedometer = PedometerManager()
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        print("🏃 [HealthKit] Manager initialized (iOS 17.0+ Mode)")
        
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.activityType = .fitness
        // 🏃 不准 iOS 在背景「自動暫停」定位（預設會），否則鎖屏跑步時路線會斷掉一大段
        locationManager.pausesLocationUpdatesAutomatically = false
        
        // 🔒 Preview/Simulator Safety: Only enable background updates if not in a preview
        // This prevents the 'stayUp' crash (NSInternalInconsistencyException)
        if ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] != "1" {
            locationManager.allowsBackgroundLocationUpdates = true
            locationManager.showsBackgroundLocationIndicator = true
        }
    }
    
    // MARK: - Methods
    
    func requestAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, NSError(domain: "HealthKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "HealthKit not available"]))
            return
        }
        
        // 🆕 多讀 runningStrideLength（步幅）+ height/sex 給 Apple 推算 stride
        var typesToRead: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .runningSpeed)!,
            HKObjectType.quantityType(forIdentifier: .height)!,
            HKObjectType.characteristicType(forIdentifier: .biologicalSex)!,
            HKObjectType.workoutType(),
            // 🛌 恢復訊號：睡眠 / HRV / 靜息心率。
            //    手錶本來就會把這三樣寫進 HealthKit，iPhone 直接讀就好，
            //    不必再繞一條 Watch → iPhone 的訊息通道。
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        ]
        if let strideType = HKObjectType.quantityType(forIdentifier: .runningStrideLength) {
            typesToRead.insert(strideType)
        }
        
        let typesToShare: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        ]
        
        healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead) { [weak self] success, error in
            DispatchQueue.main.async {
                if success { self?.isAuthorized = true }
                completion(success, error)
            }
        }
    }
    
    /// 🆕 由 WebView 端傳入 mode：running / gym / treadmill
    /// 健身房模式：traditionalStrengthTraining、不啟 GPS、不啟 Pedometer
    /// 跑步機模式：running + .indoor、不啟 GPS、改用 CMPedometer
    /// 戶外跑步：running + .outdoor、啟 GPS
    func startWorkout(mode: WorkoutMode = .running) {
        self.currentMode = mode

        // 🧹 每一趟訓練從乾淨狀態開始：以前這些串流與即時值從不清空，
        //    同一次 App 開啟中的第二趟訓練，結算會混入上一趟的路線、心率、配速。
        routePoints.removeAll()
        heartRateStream.removeAll()
        paceStream.removeAll()
        elevationStream.removeAll()
        cadenceStream.removeAll()
        strideStream.removeAll()
        timestampStream.removeAll()
        currentHeartRate = 0; currentDistance = 0; currentPace = 0; currentElevation = 0
        currentCalories = 0; currentCadence = 0; currentStride = 0; duration = 0
        pedometerDistance = 0; pedometerSteps = 0
        hasHeartRateData = false; hasGPSData = false; hasElevationData = false
        hasCadenceData = false; hasStrideData = false

        let configuration = HKWorkoutConfiguration()
        switch mode {
        case .gym:
            configuration.activityType = .traditionalStrengthTraining
            configuration.locationType = .indoor
            self.isTreadmillMode = false
        case .treadmill:
            configuration.activityType = .running
            configuration.locationType = .indoor
            self.isTreadmillMode = true
        case .running:
            configuration.activityType = .running
            configuration.locationType = .outdoor
            self.isTreadmillMode = false
        }

        // 只有戶外跑步要 GPS
        if mode == .running {
            locationManager.requestWhenInUseAuthorization()
        }

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()

            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)

            session.delegate = self
            builder.delegate = self

            self.workoutSession = session
            self.workoutBuilder = builder

            let startDate = Date()
            // 🩹 修步頻永遠 N/A：以前 self.duration 從未被賦值(恆為0)，導致 cadence 計算分支
            //    永遠不執行。記下起跑時間，didCollectDataOf 才算得出 duration 與步頻。
            self.workoutStartDate = startDate
            self.lastStepTotal = 0
            self.lastStepSampleTime = nil
            session.startActivity(with: startDate)
            builder.beginCollection(withStart: startDate) { [weak self] success, _ in
                guard success, let self = self else { return }
                DispatchQueue.main.async {
                    switch mode {
                    case .running:
                        self.locationManager.startUpdatingLocation()
                        // 🆕 戶外跑步也啟動 CMPedometer —— 只拿來補「步頻」，距離仍以 GPS 為準。
                        //    這樣沒戴 Apple Watch 也能有步頻（手機在臂套/口袋時最準）。
                        self.pedometer.start { [weak self] _, _, spm in
                            guard let self = self else { return }
                            if spm > 0 && spm <= 250 {
                                self.currentCadence = spm
                                self.cadenceStream.append(spm)
                                self.hasCadenceData = true
                            }
                            // ⚠️ 戶外模式「不」覆寫 currentDistance / hasGPSData（GPS 才是距離來源）
                        }
                    case .treadmill:
                        // 🆕 跑步機：啟動 CMPedometer，每秒更新 pedometerDistance / pedometerSteps / 步頻
                        self.pedometer.start { [weak self] steps, distanceMeters, spm in
                            guard let self = self else { return }
                            self.pedometerSteps = steps
                            self.pedometerDistance = distanceMeters / 1000.0   // m → km
                            // 跑步機沒 GPS，把 Pedometer 距離當主要里程
                            self.currentDistance = distanceMeters
                            self.hasGPSData = false
                            if spm > 0 && spm <= 250 {
                                self.currentCadence = spm
                                self.cadenceStream.append(spm)
                                self.hasCadenceData = true
                            }
                        }
                    case .gym:
                        // 健身房不需要 GPS 或 Pedometer
                        break
                    }
                }
            }
        } catch {
            print("❌ [HealthKit] Error: \(error.localizedDescription)")
        }
    }

    /// 🆕 舊呼叫的相容入口（沒帶 mode 就走戶外跑步）
    func startWorkout() { startWorkout(mode: .running) }
    
    func pauseWorkout() {
        workoutSession?.pause()
        if currentMode == .running { locationManager.stopUpdatingLocation() }
        if currentMode != .gym { pedometer.pause() }   // 🆕 跑步機 + 戶外跑步都用 pedometer(步頻)
    }

    func resumeWorkout() {
        workoutSession?.resume()
        if currentMode == .running { locationManager.startUpdatingLocation() }
        if currentMode != .gym { pedometer.resume() }
    }

    func endWorkout(completion: @escaping ([String: Any]) -> Void) {
        if currentMode == .running { locationManager.stopUpdatingLocation() }
        if currentMode != .gym { pedometer.stop() }
        workoutSession?.end()
        
        workoutBuilder?.endCollection(withEnd: Date()) { [weak self] success, _ in
            guard let self = self, success else { completion([:]); return }
            self.workoutBuilder?.finishWorkout { workout, _ in
                if let workout = workout {
                    completion(self.generateWorkoutSummary(workout: workout))
                } else {
                    completion([:])
                }
            }
        }
    }
    
    private func generateWorkoutSummary(workout: HKWorkout) -> [String: Any] {
        var summary: [String: Any] = [:]
        summary["duration"] = Int(workout.duration)

        // 🔥 Fix iOS 18 Deprecations: Use statistics(for:) instead of direct properties
        let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!
        let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!

        let hkDistanceKm = (workout.statistics(for: distanceType)?.sumQuantity()?.doubleValue(for: .meter()) ?? 0) / 1000
        // 🆕 跑步機模式：用 CMPedometer 推算的距離覆蓋 HK 的距離（HK 室內距離常為 0）
        summary["distance"] = isTreadmillMode ? max(pedometerDistance, hkDistanceKm) : hkDistanceKm
        summary["calories"] = workout.statistics(for: energyType)?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0

        summary["avgHeartRate"] = heartRateStream.isEmpty ? 0 : heartRateStream.reduce(0, +) / Double(heartRateStream.count)
        summary["avgCadence"]   = cadenceStream.isEmpty   ? 0 : cadenceStream.reduce(0, +)   / Double(cadenceStream.count)
        summary["avgStride"]    = strideStream.isEmpty    ? 0 : strideStream.reduce(0, +)    / Double(strideStream.count)

        summary["route"] = routePoints.map { ["lat": $0.lat, "lng": $0.lng, "timestamp": $0.timestamp.timeIntervalSince1970 * 1000] }
        summary["streamData"] = [
            "timestamps": timestampStream.map { $0.timeIntervalSince1970 * 1000 },
            "heartRate": heartRateStream,
            "pace": paceStream,
            "elevation": elevationStream,
            "cadence": cadenceStream,
            "stride": strideStream
        ]
        summary["isTreadmillMode"] = isTreadmillMode
        summary["pedometerSteps"]  = pedometerSteps
        summary["hasGPSData"]      = hasGPSData
        summary["hasHeartRateData"] = hasHeartRateData
        summary["hasCadenceData"]  = hasCadenceData
        summary["hasStrideData"]   = hasStrideData
        return summary
    }

    // MARK: - Compatibility Methods
    
    func getTodaySteps(completion: @escaping (Int, String?) -> Void) {
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: Calendar.current.startOfDay(for: Date()), end: Date(), options: .strictStartDate), options: .cumulativeSum) { _, result, error in
            completion(Int(result?.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0), error?.localizedDescription)
        }
        healthStore.execute(query)
    }

    /// 🟢 抓今日「主動消耗熱量」(Active Energy Burned, kcal)
    /// 來源：iPhone 配對的所有 HealthKit data sources（含 Apple Watch、第三方 App）。
    /// 直接拿 HKStatisticsQuery 的 cumulativeSum，HealthKit 內部已自動 dedupe。
    func getTodayActiveEnergy(completion: @escaping (Int, String?) -> Void) {
        let kcalType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
        let pred = HKQuery.predicateForSamples(
            withStart: Calendar.current.startOfDay(for: Date()),
            end: Date(),
            options: .strictStartDate
        )
        let query = HKStatisticsQuery(quantityType: kcalType, quantitySamplePredicate: pred, options: .cumulativeSum) { _, result, error in
            let kcal = result?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
            completion(Int(kcal.rounded()), error?.localizedDescription)
        }
        healthStore.execute(query)
    }

    // MARK: - 恢復訊號（睡眠 / HRV / 靜息心率）

    /// 昨晚實際睡著的時數。
    /// 只算 asleep 系列（不含 inBed）—— 躺著不等於睡著。
    private func fetchLastNightSleepHours(completion: @escaping (Double?) -> Void) {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(nil); return
        }
        // 往回看 18 小時：早上看是昨晚，晚上看還是昨晚，不會跨到今天的小睡
        let start = Date().addingTimeInterval(-18 * 3600)
        let pred = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        let query = HKSampleQuery(sampleType: sleepType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            guard let items = samples as? [HKCategorySample], !items.isEmpty else {
                completion(nil); return          // 沒有樣本 → nil，不是 0
            }
            let asleepValues: Set<Int> = [
                HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                HKCategoryValueSleepAnalysis.asleepREM.rawValue
            ]
            let seconds = items
                .filter { asleepValues.contains($0.value) }
                .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
            completion(seconds > 0 ? seconds / 3600.0 : nil)
        }
        healthStore.execute(query)
    }

    /// 某個量化型別的「最新一筆」與「近 30 天平均 + 樣本數」。
    /// ⚠️ 基準與樣本數一定要一起回：HRV 的絕對值因人而異，
    ///    沒有「自己的」基準就不該拿來判斷高低，樣本太少的基準也不算數。
    private func fetchLatestAndBaseline(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        completion: @escaping (Double?, Double?, Int, Date?) -> Void
    ) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            completion(nil, nil, 0, nil); return
        }
        let start = Date().addingTimeInterval(-30 * 24 * 3600)
        let pred = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
        let query = HKSampleQuery(sampleType: type, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: sort) { _, samples, _ in
            guard let items = samples as? [HKQuantitySample], !items.isEmpty else {
                completion(nil, nil, 0, nil); return
            }
            let values = items.map { $0.quantity.doubleValue(for: unit) }
            let latest = values.first
            // 基準用「不含今天最新一筆」的平均，免得今天的值把自己的基準拉走
            let rest = Array(values.dropFirst())
            let baseline = rest.isEmpty ? nil : rest.reduce(0, +) / Double(rest.count)
            // 最新一筆的時間一定要一起回 —— 手錶幾天沒戴，「最新一筆」就是幾天前的，
            // 前端靠這個判斷它還算不算「今天」。
            completion(latest, baseline, rest.count, items.first?.endDate)
        }
        healthStore.execute(query)
    }

    /// 一次把三個恢復訊號抓齊，回一個可直接丟給 JS 的 dictionary。
    /// 沒授權 / 沒資料的欄位一律不放進去 —— 讓前端知道「沒有」，
    /// 而不是收到一個 0 當成真實值。
    func fetchRecoverySignals(completion: @escaping ([String: Any]) -> Void) {
        var out: [String: Any] = [:]
        let group = DispatchGroup()

        group.enter()
        fetchLastNightSleepHours { hours in
            if let h = hours { out["sleepHours"] = (h * 10).rounded() / 10 }
            group.leave()
        }

        group.enter()
        fetchLatestAndBaseline(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli)) { latest, baseline, n, at in
            if let v = latest { out["hrv"] = (v * 10).rounded() / 10 }
            if let d = at { out["hrvAt"] = (d.timeIntervalSince1970 * 1000).rounded() }
            if let b = baseline { out["hrvBaseline"] = (b * 10).rounded() / 10 }
            out["hrvSamples"] = n
            group.leave()
        }

        group.enter()
        fetchLatestAndBaseline(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute())) { latest, baseline, n, at in
            if let v = latest { out["restingHr"] = v.rounded() }
            if let d = at { out["restingHrAt"] = (d.timeIntervalSince1970 * 1000).rounded() }
            if let b = baseline { out["restingHrBaseline"] = (b * 10).rounded() / 10 }
            out["restingHrSamples"] = n
            group.leave()
        }

        group.notify(queue: .main) { completion(out) }
    }

    func saveExtendedWorkout(distance: Double, energyBurned: Double, duration: Double, elevationGain: Double, avgHeartRate: Double, metadata: [String: Any]?, completion: @escaping (Bool, String?) -> Void) {
        // 🔥 Fix iOS 18 Deprecations: Use HKWorkoutBuilder to create the workout object
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .running
        configuration.locationType = .outdoor
        
        let builder = HKWorkoutBuilder(healthStore: healthStore, configuration: configuration, device: .local())
        
        let startDate = Date().addingTimeInterval(-duration)
        let endDate = Date()
        
        builder.beginCollection(withStart: startDate) { success, error in
            guard success else { completion(false, error?.localizedDescription); return }
            
            let samples: [HKSample] = [
                HKQuantitySample(type: HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!, quantity: HKQuantity(unit: .meter(), doubleValue: distance * 1000), start: startDate, end: endDate),
                HKQuantitySample(type: HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!, quantity: HKQuantity(unit: .kilocalorie(), doubleValue: energyBurned), start: startDate, end: endDate)
            ]
            
            builder.add(samples) { success, error in
                guard success else { completion(false, error?.localizedDescription); return }
                
                builder.addMetadata(metadata ?? [:]) { success, error in
                    builder.endCollection(withEnd: endDate) { success, error in
                        guard success else { completion(false, error?.localizedDescription); return }
                        
                        builder.finishWorkout { workout, error in
                            completion(workout != nil, error?.localizedDescription)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Delegates

@available(iOS 17.0, *)
extension HealthKitManager: HKWorkoutSessionDelegate {
    // 🩹 W-1: 不再空實作 — session 失敗時停掉感測器（省電）並廣播給 WebView 顯示提示
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended || toState == .stopped else { return }
        // 使用者主動 endWorkout 時 workoutSession 已在 end 流程；這裡只補「意外終止」時的感測器清理
        if self.workoutSession != nil {
            if currentMode == .running { locationManager.stopUpdatingLocation() }
            if currentMode != .gym { pedometer.stop() }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        print("❌ [HealthKit] workout session failed: \(error.localizedDescription)")
        DispatchQueue.main.async {
            // 1) 停掉持續型感測器，避免 session 已死還在燒電
            if self.currentMode == .running { self.locationManager.stopUpdatingLocation() }
            if self.currentMode != .gym { self.pedometer.stop() }
            // 2) 廣播給 WebView bridge → 前端顯示「量測中斷」而不是假裝還在量
            NotificationCenter.default.post(
                name: .drvnHKWorkoutError,
                object: nil,
                userInfo: ["message": error.localizedDescription]
            )
        }
    }
}

@available(iOS 17.0, *)
extension HealthKitManager: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType, let statistics = workoutBuilder.statistics(for: quantityType) else { continue }
            DispatchQueue.main.async {
                switch quantityType {
                case HKQuantityType.quantityType(forIdentifier: .heartRate):
                    if let hr = statistics.mostRecentQuantity()?.doubleValue(for: .count().unitDivided(by: .minute())) {
                        self.currentHeartRate = hr
                        self.heartRateStream.append(hr)
                        self.hasHeartRateData = true
                    }
                case HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning):
                    self.currentDistance = statistics.sumQuantity()?.doubleValue(for: .meter()) ?? 0
                case HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned):
                    self.currentCalories = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                case HKQuantityType.quantityType(forIdentifier: .runningSpeed):
                    if let speed = statistics.mostRecentQuantity()?.doubleValue(for: .meter().unitDivided(by: .second())) {
                        let pace = speed > 0 ? (1000 / speed / 60) : 0
                        self.currentPace = pace
                        self.paceStream.append(pace)
                    }
                // 🆕 stepCount 累積值 → 換算 cadence (spm = 每分鐘步數)
                //    🩹 修步頻：① 先用起跑時間算出 duration（以前恆為0，分支永遠不跑）；
                //    ② 改「時間窗差分」：Δ步數 / Δ秒 × 60 = 瞬時步頻，逐次 append。
                //    用累積步數÷總分鐘只會得到一條平線，會被前端 cadIsFlat 判為無效而擋掉。
                case HKQuantityType.quantityType(forIdentifier: .stepCount):
                    if let totalSteps = statistics.sumQuantity()?.doubleValue(for: .count()) {
                        let now = Date()
                        if let startDate = self.workoutStartDate {
                            self.duration = now.timeIntervalSince(startDate)   // 供 JS bridge 的 duration
                        }
                        if let lastTime = self.lastStepSampleTime {
                            let dt = now.timeIntervalSince(lastTime)
                            let dSteps = totalSteps - self.lastStepTotal
                            if dt >= 1.0 && dSteps >= 0 {
                                let spm = (dSteps / dt) * 60.0
                                // 合理範圍過濾（>250 spm 幾乎必為抖動）
                                if spm > 0 && spm <= 250 {
                                    self.currentCadence = spm
                                    self.cadenceStream.append(spm)
                                    self.hasCadenceData = true
                                }
                                self.lastStepTotal = totalSteps
                                self.lastStepSampleTime = now
                            }
                        } else {
                            // 第一次樣本：只記基準，下次才有差分
                            self.lastStepTotal = totalSteps
                            self.lastStepSampleTime = now
                        }
                    }
                // 🆕 runningStrideLength（Apple Watch 才有；iPhone-only 會永遠收不到 → 由 Pedometer 推算）
                // 外層已有 @available(iOS 17.0, *)，runningStrideLength 是 iOS 16+ API
                // → 必然可用，不需要再做 #available(iOS 16) 檢查
                default:
                    if quantityType == HKQuantityType.quantityType(forIdentifier: .runningStrideLength),
                       let stride = statistics.mostRecentQuantity()?.doubleValue(for: .meter()) {
                        self.currentStride = stride
                        self.strideStream.append(stride)
                        self.hasStrideData = true
                    }
                }
            }
        }
    }
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}

@available(iOS 17.0, *)
extension HealthKitManager: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        DispatchQueue.main.async {
            self.routePoints.append((lat: location.coordinate.latitude, lng: location.coordinate.longitude, timestamp: location.timestamp))
            self.hasGPSData = true
            if location.verticalAccuracy >= 0 {
                self.currentElevation = location.altitude
                self.elevationStream.append(location.altitude)
                self.hasElevationData = true
            }
            self.timestampStream.append(location.timestamp)
        }
    }
}
