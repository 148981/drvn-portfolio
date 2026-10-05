import SwiftUI
import HealthKit
import WatchConnectivity
import Combine
import WatchKit

// MARK: - Models

struct ExerciseSet: Identifiable {
    let id = UUID()
    var weight: Double
    var reps: Int
    var rpe: Double = 8.0          // 🟢 準備接收後端回傳的分數
    var effortScore: Int = 0       // 🟢 準備接收後端回傳的分數
    var isPR: Bool = false         // 🟢 準備接收後端回傳的 PR 狀態
    var completed = false
    var timestamp: Date?
}

struct GymExercise: Identifiable {
    let id = UUID()
    var name: String
    var sets: [ExerciseSet]
    var restSeconds: Int = 90
    /// 原始次數區間字串（如 "8-12"），供顯示用；無則退回單一 reps 數字。
    var repsLabel: String? = nil
}

struct DayPlan: Identifiable {
    let id = UUID()
    var label: String       // e.g. "Day 1 · Push"
    var muscle: String      // e.g. "Push", "Chest", "Full Body"
    var exercises: [GymExercise]
}

enum GymScreen { case planSelect, preview, logging, rest, done }

// MARK: - GymWorkoutManager

class GymWorkoutManager: NSObject, ObservableObject,
                         HKWorkoutSessionDelegate,
                         HKLiveWorkoutBuilderDelegate,
                         WCSessionDelegate {

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    // Screen
    @Published var screen: GymScreen = .planSelect
    @Published var isPaused = false

    // 沈浸式發力狀態
    @Published var isLifting: Bool = false

    // Plan
    @Published var availablePlans: [DayPlan] = []
    @Published var selectedPlanIndex: Int = 0
    @Published var previewPlanIndex: Int = 0

    // Set state
    @Published var exercises: [GymExercise] = []
    @Published var exerciseIndex = 0
    @Published var setIndex = 0
    @Published var currentWeight: Double = 60.0
    @Published var currentReps: Int = 10
    @Published var currentRPE: Double = 8.0

    // 🟢 上次訓練數據 (exercise name → (weight, reps))，首組顯示 & 預填用
    @Published var exerciseLastSession: [String: (weight: Double, reps: Int)] = [:]

    // 儲存各動作的歷史最高重量 (本次 session 中累積)
    private var exercisePRs: [String: Double] = [:]
    // 當前已識別的使用者 ID
    private var currentUserId: String = ""

    // 🟢 1. 新增計算單組分數的公式 (100% 對齊 React 端)
    private func calculateEffortScore(weight: Double, reps: Int, rpe: Double, exerciseName: String) -> Int {
        // 取得 PR，如果沒有歷史紀錄，就拿當前的重量當基準 (避免除以 0)
        let pr = exercisePRs[exerciseName] ?? (weight > 0 ? weight : 1.0)
        
        // Brzycki e1RM 公式
        let divisor = 1.0278 - (0.0278 * Double(reps))
        let currentE1RM = divisor > 0.1 ? (weight / divisor) : weight
        
        // 相對強度與 RPE 權重
        let intensityRatio = currentE1RM / pr
        let rpeWeight = rpe / 10.0
        
        // 70% 來自重量，30% 來自疲勞度
        let rawScore = (intensityRatio * 0.7 + rpeWeight * 0.3) * 100.0
        let finalScore = min(Int(round(rawScore)), 120) // 最高鎖定 120 分
        
        return finalScore
    }

    // 🟢 2. 新增計算整場「平均耗力分數」 (用於儀表板顯示)
    var avgEffortScore: Int {
        let completedSets = exercises.flatMap { $0.sets }.filter { $0.completed && $0.effortScore > 0 }
        guard !completedSets.isEmpty else { return Int(progressFraction * 100) } // 沒資料時先顯示完成度
        let sum = completedSets.reduce(0) { $0 + $1.effortScore }
        return sum / completedSets.count
    }

    // Rest
    @Published var restRemaining = 90
    @Published var totalRestSeconds = 90

    // Biometrics
    @Published var heartRate: Double = 0
    @Published var activeCalories: Double = 0
    @Published var elapsedSeconds = 0

    private var restTimer: AnyCancellable?
    private var sessionTimer: AnyCancellable?
    private var sessionStart: Date?
    private var accumulated = 0

    // Backend API base URL — 統一由 WatchConfig 決定（iPhone 推送 > 模擬器 > 正式網址）。
    // 不再寫死 IP；呼叫端用 "\(baseURL)/api/..." 接 path。
    private var baseURL: String { WatchConfig.apiBaseURL }

    override init() {
        super.init()
        // 🟢 從 UserDefaults 還原上次的 userId，避免 Watch 重啟後忘記帳號
        if let saved = UserDefaults.standard.string(forKey: "drvn_primaryUserId"), !saved.isEmpty {
            currentUserId = saved
        }
        if WCSession.isSupported() {
            // ⚠️ 不再自設 delegate（避免和常駐 WatchConnHub 互搶 delegate）。
            //    改成監聽 hub 廣播，沿用原本 handleIncomingMessage 邏輯。
            WCSession.default.activate()
        }
        NotificationCenter.default.addObserver(forName: .drvnWatchMsg, object: nil, queue: .main) { [weak self] note in
            guard let msg = note.userInfo as? [String: Any] else { return }
            self?.handleIncomingMessage(msg)
        }
        NotificationCenter.default.addObserver(forName: .drvnWatchReachable, object: nil, queue: .main) { [weak self] _ in
            self?.requestGymPlan()
        }
        // 🩹 v2：不再於啟動時塞「假的預設計劃」（臥推60kg…）— 使用者會誤以為
        //    那是自己的計劃、甚至照著假重量練。改成：載入真計劃前顯示空狀態，
        //    使用者可在選單手動選「通用範本」（清楚標示為範本）。
        // Directly fetch from backend API (works in simulator + real device)
        fetchPlanFromAPI()
    }

    // MARK: - Direct API Fetch (bypasses WatchConnectivity)
    /// Fetch the latest plan directly from the backend REST API.
    /// This works in the simulator where WCSession is unavailable.
    func fetchPlanFromAPI() {
        let uid = currentUserId.isEmpty 
            ? (UserDefaults.standard.stringArray(forKey: "drvn_userIds")?.first ?? "") 
            : currentUserId
        
        if !uid.isEmpty {
            fetchPlanForUser(uid)
        } else {
            print("[GymManager] ⚠️ 無法抓取計劃：目前沒有可用的 User ID")
        }
    }

    private func loadKnownUserIds() -> [String] {
        // Read from UserDefaults — populated by USER_ID_SYNC or gymPlan messages from iPhone
        let ids = UserDefaults.standard.stringArray(forKey: "drvn_userIds") ?? []
        // Do NOT fall back to hardcoded IDs: we only use the account synced from the iPhone
        return ids
    }

    private func fetchPlanForUser(_ userId: String) {
        guard let url = URL(string: "\(baseURL)/api/plan/\(userId)/latest") else { return }
        print("[GymManager] 🌐 Fetching plan from API for user: \(userId)")

        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { [weak self] data, response, error in
            guard let self = self else { return }
            guard error == nil,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let plan = json["plan"] as? [String: Any],
                  let weeks = plan["weeks"] as? [[String: Any]], !weeks.isEmpty else {
                print("[GymManager] ⚠️ API fetch failed for \(userId): \(error?.localizedDescription ?? "no plan")")
                return
            }

            // 用計劃的起始日算出「現在是第幾週」—— 以前固定第 1 週，第 2 週之後手錶上還是第 1 週的菜單
            let weekIdx: Int = {
                let startStr = (plan["startDate"] as? String) ?? (plan["start_date"] as? String) ?? ""
                let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")   // 後端日期字串：固定西曆
                guard let start = f.date(from: String(startStr.prefix(10))) else { return 0 }
                let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: start),
                                                           to: Calendar.current.startOfDay(for: Date())).day ?? 0
                return min(max(0, days / 7), weeks.count - 1)
            }()
            let week = weeks[weekIdx]
            guard let days = week["days"] as? [[String: Any]] else { return }

            // Plan-level split type (e.g. "foundation" / "bro_split" / "full_body")
            _ = (plan["split_type"] as? String ?? "").lowercased() // reserved for future use

            let plans: [DayPlan] = days.enumerated().compactMap { (i, day) in
                guard (day["is_rest_day"] as? Bool) != true,
                      let exercises = day["exercises"] as? [[String: Any]], !exercises.isEmpty else { return nil }

                let dayNum = (day["day_number"] as? Int) ?? (i + 1)
                let focusRaw   = (day["focus"]       as? String ?? "Training").trimmingCharacters(in: .whitespaces)
                let shortFocus = (day["shortFocus"]   as? String ?? "").trimmingCharacters(in: .whitespaces)

                // ── Smart label generation ──────────────────────────────────────
                // Priority order:
                //   1. Full Body (any source)
                //   2. PPL keywords (shortFocus → "Push/Pull/Legs")
                //   3. Bro-split → first segment of focus (e.g. "Chest", "Back")
                let focus: String = {
                    let combined = (shortFocus + " " + focusRaw).lowercased()

                    // 1. Full Body
                    if combined.contains("full body") || combined.contains("full_body") {
                        return "Full Body"
                    }

                    // 2. PPL — check shortFocus first, then fall back to focusRaw prefix
                    let checkTokens = [shortFocus.lowercased(), focusRaw.lowercased()]
                    for token in checkTokens {
                        if token.hasPrefix("push") { return "Push" }
                        if token.hasPrefix("pull") { return "Pull" }
                        if token.hasPrefix("leg")  { return "Legs" }
                    }

                    // 3. Bro-split / other: take the main segment before "—"
                    let main = (focusRaw.components(separatedBy: "—").first ?? focusRaw)
                        .trimmingCharacters(in: .whitespaces)
                    // Unwrap parentheses: "胸部 (Chest)" → "Chest"
                    if let ps = main.firstIndex(of: "("),
                       let pe = main.lastIndex(of: ")"), ps < pe {
                        return String(main[main.index(after: ps)..<pe])
                            .trimmingCharacters(in: .whitespaces)
                    }
                    return main
                }()
                // ───────────────────────────────────────────────────────────────

                let label = "Day \(dayNum) · \(focus)"

                let gymExercises: [GymExercise] = exercises.prefix(8).compactMap { ex in
                    guard let name = ex["name"] as? String, !name.isEmpty else { return nil }
                    let setsN: Int = {
                        if let s = ex["sets"] as? Int { return min(s, 6) }
                        if let s = ex["sets"] as? String { return min(Int(s) ?? 3, 6) }
                        return 3
                    }()
                    let repsN: Int = {
                        if let r = ex["reps"] as? Int { return r }
                        if let r = ex["reps"] as? String {
                            return Int(r.components(separatedBy: "-").first ?? r) ?? 10
                        }
                        return 10
                    }()
                    let weight: Double = {
                        if let w = ex["weight"] as? Double { return w }
                        if let w = ex["weight"] as? Int { return Double(w) }
                        if let w = ex["weight"] as? String { return Double(w) ?? 0 }
                        return 0
                    }()
                    let rest: Int = {
                        if let r = ex["rest"] as? Int { return r }
                        if let r = ex["rest"] as? String { return Int(r.replacingOccurrences(of: "s", with: "")) ?? 90 }
                        return 90
                    }()
                    let sets = (1...setsN).map { _ in ExerciseSet(weight: weight, reps: repsN) }
                    return GymExercise(name: name, sets: sets, restSeconds: rest)
                }

                guard !gymExercises.isEmpty else { return nil }
                return DayPlan(label: label, muscle: focus, exercises: gymExercises)
            }

            guard !plans.isEmpty else { return }

            DispatchQueue.main.async {
                self.availablePlans = plans
                self.currentUserId = userId   // 記住此 user 供歷史記錄查詢用
                // Save userId for future use
                var saved = UserDefaults.standard.stringArray(forKey: "drvn_userIds") ?? []
                if !saved.contains(userId) { saved.append(userId) }
                UserDefaults.standard.set(saved, forKey: "drvn_userIds")
                // 🟢 同步存入 primaryUserId，Watch 重啟後可立即還原正確帳號
                UserDefaults.standard.set(userId, forKey: "drvn_primaryUserId")
                print("[GymManager] ✅ API: loaded \(plans.count) plan(s) with \(plans.flatMap(\.exercises).count) exercises for \(userId)")
            }
        }.resume()
    }

    // MARK: - Default Plans (fallback when API is unreachable)
    // ⚠️ 只能由使用者在空狀態畫面「主動」選擇載入，且 label 清楚標示為範本；
    //    絕不在啟動時自動塞入，避免被誤認為使用者自己的計劃。
    func buildDefaultPlans() {
        availablePlans = [
            DayPlan(label: "範本 · Chest", muscle: "Chest", exercises: [
                GymExercise(name: "Barbell Bench Press",
                            sets: (1...4).map { _ in ExerciseSet(weight: 60, reps: 10) }),
                GymExercise(name: "Incline Dumbbell Press",
                            sets: (1...3).map { _ in ExerciseSet(weight: 22, reps: 12) }),
                GymExercise(name: "Cable Fly",
                            sets: (1...3).map { _ in ExerciseSet(weight: 15, reps: 15) })
            ]),
            DayPlan(label: "Day 2 · Back", muscle: "Back", exercises: [
                GymExercise(name: "Deadlift",
                            sets: (1...4).map { _ in ExerciseSet(weight: 80, reps: 5) }),
                GymExercise(name: "Pull Up",
                            sets: (1...3).map { _ in ExerciseSet(weight: 0, reps: 8) }),
                GymExercise(name: "Seated Row",
                            sets: (1...3).map { _ in ExerciseSet(weight: 50, reps: 12) })
            ]),
            DayPlan(label: "Day 3 · Legs", muscle: "Legs", exercises: [
                GymExercise(name: "Squat",
                            sets: (1...4).map { _ in ExerciseSet(weight: 70, reps: 8) }),
                GymExercise(name: "Leg Press",
                            sets: (1...3).map { _ in ExerciseSet(weight: 120, reps: 12) }),
                GymExercise(name: "Romanian Deadlift",
                            sets: (1...3).map { _ in ExerciseSet(weight: 60, reps: 10) })
            ]),
            DayPlan(label: "Day 4 · Shoulders", muscle: "Shoulders", exercises: [
                GymExercise(name: "Overhead Press",
                            sets: (1...4).map { _ in ExerciseSet(weight: 40, reps: 8) }),
                GymExercise(name: "Lateral Raise",
                            sets: (1...3).map { _ in ExerciseSet(weight: 10, reps: 15) }),
                GymExercise(name: "Face Pull",
                            sets: (1...3).map { _ in ExerciseSet(weight: 20, reps: 15) })
            ])
        ]
    }

    // MARK: - Start Session
    func startSession(planIndex: Int) {
        selectedPlanIndex = planIndex
        exercises = availablePlans[planIndex].exercises
        exerciseIndex = 0; setIndex = 0
        exerciseLastSession = [:]   // 清空上次快取
        loadDefaults()
        requestAuthAndBegin()
        WatchSessionGate.isViewSessionActive = true   // 🟢 手錶端自己在練 → 鎖住，hub 不重複起 session
        screen = .logging
        // 稍延 1 秒再拉取，讓 iPhone 的 userId 同步訊息有時間到達才開始查詢
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self = self else { return }
            self.fetchExerciseHistory(for: self.exercises)
        }
    }

    func loadDefaults() {
        guard exerciseIndex < exercises.count,
              setIndex < exercises[exerciseIndex].sets.count else { return }
        let ex  = exercises[exerciseIndex]
        let set = ex.sets[setIndex]

        if setIndex == 0, let hist = exerciseLastSession[ex.name], hist.weight > 0 {
            // 第一組：有歷史記錄就用歷史數據預填
            currentWeight = hist.weight
            currentReps   = hist.reps > 0 ? hist.reps : set.reps
        } else {
            currentWeight = set.weight
            currentReps   = set.reps
        }
    }

    // MARK: - Fetch exercise history from backend
    /// 向後端拉取本次訓練所有動作的最近一次重量/次數，直接鎖定當前用戶檔案
    func fetchExerciseHistory(for exList: [GymExercise]) {
        let uid = currentUserId.isEmpty
            ? (UserDefaults.standard.string(forKey: "drvn_primaryUserId") ?? UserDefaults.standard.stringArray(forKey: "drvn_userIds")?.first ?? "")
            : currentUserId

        guard !uid.isEmpty else {
            print("[GymManager] ⚠️ fetchExerciseHistory: 無可用 userId，無法查詢歷史重量")
            return
        }

        print("[GymManager] 🔍 正在為用戶 \(uid) 抓取 \(exList.count) 個動作的最後訓練紀錄...")
        for exercise in exList {
            fetchLastWeight(exerciseName: exercise.name, userId: uid)
        }
    }

    /// 直接針對特定用戶與動作，向後端 API 請求歷史數據
    private func fetchLastWeight(exerciseName name: String, userId uid: String) {
        guard let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseURL)/api/workout/last-weight/\(uid)?exercise=\(encoded)")
        else { return }

        URLSession.shared.dataTask(with: WatchConfig.authed(url)) { [weak self] data, _, error in
            guard let self = self else { return }

            if let error = error {
                print("[GymManager] ❌ '\(name)' 連線失敗: \(error.localizedDescription)")
                return
            }
            guard let data = data,
                  let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                print("[GymManager] 💭 用戶 \(uid) 的歷史資料解析失敗")
                return
            }

            let w = (result["weight"] as? Double) ?? Double(result["weight"] as? Int ?? 0)
            guard w > 0 else {
                print("[GymManager] 💭 用戶 \(uid) 的歷史檔案中查無 '\(name)' 的有效紀錄")
                return
            }

            let r = result["reps"] as? Int ?? 0
            let date = result["date"] as? String ?? ""
            print("[GymManager] ✅ '\(name)' 成功抓取數據 (ID: \(uid)): \(w)kg × \(r) (\(date))")

            DispatchQueue.main.async {
                self.exerciseLastSession[name] = (weight: w, reps: r)
                // 🌟 修復：即使 session 已張開，只要目前這个動作的第一組還沒開始，就立刻更新預填
                if self.exercises.indices.contains(self.exerciseIndex),
                   self.exercises[self.exerciseIndex].name == name,
                   self.setIndex == 0 {
                    self.currentWeight = w
                    if r > 0 { self.currentReps = r }
                }
            }
        }.resume()
    }

    /// 🔄 即時刺新当前動作的歷史重量，在任何時候都可呼叫（例如掰張 session 之後）
    func refreshHistoryForCurrentExercise() {
        guard let ex = currentExercise else { return }
        let uid = currentUserId.isEmpty
            ? (UserDefaults.standard.string(forKey: "drvn_primaryUserId") ?? UserDefaults.standard.stringArray(forKey: "drvn_userIds")?.first ?? "")
            : currentUserId
        guard !uid.isEmpty else { return }
        print("[GymManager] 🔄 手動刷新 '\(ex.name)' 的歷史數據 (uid=\(uid))")
        fetchLastWeight(exerciseName: ex.name, userId: uid)
    }

    // MARK: - Computed
    var currentExercise: GymExercise? {
        guard exerciseIndex < exercises.count else { return nil }
        return exercises[exerciseIndex]
    }
    var totalSets: Int { currentExercise?.sets.count ?? 0 }
    var displaySet: Int { setIndex + 1 }

    /// 已完成的訓練量 (重量 × 次數 的總和，公斤)，作為耗力指標
    var completedVolume: Double {
        exercises.flatMap(\.sets)
            .filter(\.completed)
            .reduce(0) { $0 + $1.weight * Double($1.reps) }
    }

    var progressFraction: Double {
        let total = exercises.reduce(0) { $0 + $1.sets.count }
        guard total > 0 else { return 0 }
        let done = exercises.prefix(exerciseIndex).reduce(0) { $0 + $1.sets.count } + setIndex
        return Double(done) / Double(total)
    }

    var elapsedFormatted: String {
        let h = elapsedSeconds/3600, m=(elapsedSeconds%3600)/60, s=elapsedSeconds%60
        return h > 0 ? String(format:"%d:%02d:%02d",h,m,s) : String(format:"%02d:%02d",m,s)
    }

    var totalDone: Int {
        exercises.flatMap(\.sets).filter(\.completed).count
    }

    // MARK: - Log Set
    func logCurrentSet() {
        guard exerciseIndex < exercises.count,
              setIndex < exercises[exerciseIndex].sets.count,
              let exName = currentExercise?.name else { return }
        
        // 紀錄完一組，確保切回儀表板狀態
        isLifting = false
        
        // 🟢 1. 先記錄當下輸入的數值 (分數暫時為 0)
        exercises[exerciseIndex].sets[setIndex].weight      = currentWeight
        exercises[exerciseIndex].sets[setIndex].reps        = currentReps
        exercises[exerciseIndex].sets[setIndex].rpe         = currentRPE
        exercises[exerciseIndex].sets[setIndex].completed   = true
        exercises[exerciseIndex].sets[setIndex].timestamp   = Date()

        WKInterfaceDevice.current().play(.click) // 先給個小震動回饋
        sendSetToPhone()

        // 🟢 2. 呼叫後端 API，計算這組的分數！
        // 我們將 index 傳進去，當 API 回傳時，它會自動把分數補填到正確的格子上
        calculateSetViaBackend(exerciseName: exName, 
                               weight: currentWeight, 
                               reps: currentReps, 
                               rpe: currentRPE, 
                               exIdx: exerciseIndex, 
                               setIdx: setIndex)

        // 3. 處理休息與切換下一組 (不需等待 API，讓使用者無縫休息)
        let rest = currentExercise?.restSeconds ?? 90
        let loggedWeight = currentWeight
        let loggedReps   = currentReps

        let nextSet = setIndex + 1
        if nextSet < exercises[exerciseIndex].sets.count {
            // 同一動作的下一組：自動帶入剛才輸入的重量/次數
            exercises[exerciseIndex].sets[nextSet].weight = loggedWeight
            exercises[exerciseIndex].sets[nextSet].reps   = loggedReps
            setIndex = nextSet
        } else if exerciseIndex + 1 < exercises.count {
            // 換下一個動作
            exerciseIndex += 1; setIndex = 0
        } else {
            // 結束訓練
            endSession(); return
        }
        
        loadDefaults()
        startRest(seconds: rest)
    }

    // MARK: - 呼叫後端 API 計算
    private func calculateSetViaBackend(exerciseName: String, weight: Double, reps: Int, rpe: Double, exIdx: Int, setIdx: Int) {
        // 使用與 saveWorkoutToBackend 相同的 userId 解析順序
        let userId = currentUserId.isEmpty
            ? (UserDefaults.standard.string(forKey: "drvn_primaryUserId") ?? UserDefaults.standard.stringArray(forKey: "drvn_userIds")?.first ?? "")
            : currentUserId
        guard !userId.isEmpty,
              let url = URL(string: "\(baseURL)/api/workout/calculate-set") else {
            print("❌ [Backend Calc] 無可用 userId 或 URL 錯誤，跳過分數計算")
            return
        }

        var request = WatchConfig.authed(url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: Any] = [
            "user_id": userId,
            "exercise_name": exerciseName,
            "weight": weight,
            "reps": reps,
            "rpe": rpe
        ]

        guard let httpBody = try? JSONSerialization.data(withJSONObject: payload) else { return }
        request.httpBody = httpBody

        print("📡 [Backend Calc] 發送請求計算分數... \(exerciseName)")

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            
            if let error = error {
                print("❌ [Backend Calc] API 請求失敗: \(error.localizedDescription)")
                return
            }

            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                print("❌ [Backend Calc] 無法解析 JSON 回傳資料")
                return
            }
            
            DispatchQueue.main.async {
                // 🟢 成功！把後端算好的分數，補進原本那個 set 裡面
                if let score = json["effort_score"] as? Int {
                    // 安全檢查，確保這個動作和組數沒有超出範圍
                    if exIdx < self.exercises.count && setIdx < self.exercises[exIdx].sets.count {
                        self.exercises[exIdx].sets[setIdx].effortScore = score
                        print("✅ [Backend Calc] 成功收到分數: \(score) PTS")
                        
                        // 強制刷新 UI，這樣儀表板 (`BiometricsPage`) 的 avgEffortScore 才會跳動
                        self.objectWillChange.send()
                    }
                }
                
                // 處理破 PR 的慶祝震動
                if let isPR = json["is_pr"] as? Bool, isPR == true {
                    if exIdx < self.exercises.count && setIdx < self.exercises[exIdx].sets.count {
                        self.exercises[exIdx].sets[setIdx].isPR = true
                        print("🏆 [Backend PR] 恭喜！破紀錄了！")
                        WKInterfaceDevice.current().play(.success) // 破 PR 時追加震動
                    }
                }
            }
        }.resume()
    }

    // MARK: - Rest
    func startRest(seconds: Int) {
        totalRestSeconds = seconds; restRemaining = seconds; screen = .rest
        restTimer?.cancel()
        restTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect().sink { [weak self] _ in
            guard let self else { return }
            if self.restRemaining > 1 {
                self.restRemaining -= 1
                if self.restRemaining == 10 { WKInterfaceDevice.current().play(.notification) }
            } else { self.finishRest() }
        }
    }

    func skipRest() { restTimer?.cancel(); finishRest() }
    private func finishRest() { 
        WKInterfaceDevice.current().play(.start)
        screen = .logging 
        // 進入 Logging 後自動切換為沈浸式發力模式
        isLifting = true
    }

    // MARK: - Pause / Resume
    func pauseSession() {
        session?.pause(); isPaused = true
        if let start = sessionStart { accumulated += Int(Date().timeIntervalSince(start)) }
        sessionTimer?.cancel(); sessionTimer = nil; sessionStart = nil
    }

    func resumeSession() {
        session?.resume(); isPaused = false
        sessionStart = Date()
        sessionTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
            .sink { [weak self] _ in
                guard let self, let s = self.sessionStart else { return }
                self.elapsedSeconds = self.accumulated + Int(Date().timeIntervalSince(s))
            }
    }

    // MARK: - End
    func endSession() {
        WatchSessionGate.isViewSessionActive = false   // 🟢 解鎖
        sessionTimer?.cancel(); restTimer?.cancel()
        session?.stopActivity(with: Date()); session?.end()
        builder?.endCollection(withEnd: Date()) { [weak self] _, _ in
            self?.builder?.finishWorkout { [weak self] _, _ in
                DispatchQueue.main.async { self?.screen = .done }
            }
        }
    }

    // MARK: - HealthKit
    private func requestAuthAndBegin() {
        // share：手錶需要「寫入」這些類型，HKLiveWorkoutDataSource 才能記錄卡路里和心率
        let share: Set<HKSampleType> = [
            HKQuantityType.workoutType(),
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKQuantityType.quantityType(forIdentifier: .heartRate)!
        ]
        // read：讀取歷史數據供即時顯示
        let read: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .basalEnergyBurned)!
        ]
        healthStore.requestAuthorization(toShare: share, read: read) { [weak self] _, _ in
            DispatchQueue.main.async { self?.beginHKSession() }
        }
    }

    private func beginHKSession() {
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        // 🩹 W-1: 不再 try? 靜默失敗 — 建不起來要讓使用者「感覺得到」
        let sess: HKWorkoutSession
        do {
            sess = try HKWorkoutSession(healthStore: healthStore, configuration: config)
        } catch {
            print("[GymManager] ❌ HKWorkoutSession init failed: \(error.localizedDescription)")
            WKInterfaceDevice.current().play(.failure)
            return
        }
        let bld = sess.associatedWorkoutBuilder()
        bld.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
        sess.delegate = self; bld.delegate = self
        session = sess; builder = bld
        let now = Date()
        sess.startActivity(with: now)
        bld.beginCollection(withStart: now) { _, _ in }
        sessionStart = now
        sessionTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
            .sink { [weak self] _ in
                guard let self, let s = self.sessionStart else { return }
                self.elapsedSeconds = self.accumulated + Int(Date().timeIntervalSince(s))
            }
    }

    // 🩹 W-1: session 被系統中斷/失敗 → 觸覺回饋＋節流自動重建（原本是空實作，靜默死亡）
    private var lastHKSessionRetry: Date = .distantPast

    func workoutSession(_ s: HKWorkoutSession, didChangeTo to: HKWorkoutSessionState, from: HKWorkoutSessionState, date: Date) {
        // 使用者主動結束（endSession 已解鎖 Gate）不處理；訓練中被系統終止才要救
        guard WatchSessionGate.isViewSessionActive, to == .ended || to == .stopped else { return }
        DispatchQueue.main.async { self.recoverHKSession(reason: "state_\(to.rawValue)") }
    }

    func workoutSession(_ s: HKWorkoutSession, didFailWithError e: Error) {
        print("[GymManager] ❌ HK session failed: \(e.localizedDescription)")
        DispatchQueue.main.async { self.recoverHKSession(reason: e.localizedDescription) }
    }

    private func recoverHKSession(reason: String) {
        WKInterfaceDevice.current().play(.failure)   // 讓使用者知道量測中斷了
        session = nil; builder = nil
        // 還在訓練畫面 → 60 秒節流重建，心率/卡路里恢復累積
        guard WatchSessionGate.isViewSessionActive,
              Date().timeIntervalSince(lastHKSessionRetry) > 60 else { return }
        lastHKSessionRetry = Date()
        beginHKSession()
        print("[GymManager] 🔄 HK session rebuilt after failure (\(reason))")
    }

    func workoutBuilder(_ wb: HKLiveWorkoutBuilder, didCollectDataOf types: Set<HKSampleType>) {
        for type in types {
            guard let qty = type as? HKQuantityType, let stats = wb.statistics(for: qty) else { continue }
            // ⚠️ 不能用 switch qty case HKQuantityType.quantityType(forIdentifier:)
            // 因為該方法回傳 Optional，與非 Optional 的 qty 永遠不匹配
            // 正確做法：比對 identifier 字串
            let id = HKQuantityTypeIdentifier(rawValue: qty.identifier)
            DispatchQueue.main.async {
                switch id {
                case .heartRate:
                    let bpm = stats.mostRecentQuantity()?
                        .doubleValue(for: HKUnit.count().unitDivided(by: .minute())) ?? 0
                    if bpm > 0 { self.heartRate = bpm }
                case .activeEnergyBurned:
                    let kcal = stats.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                    if kcal > 0 { self.activeCalories = kcal }
                default:
                    break
                }
            }
        }
    }
    func workoutBuilderDidCollectEvent(_ wb: HKLiveWorkoutBuilder) {}

    // MARK: - WatchConnectivity
    private func sendSetToPhone() {
        guard WCSession.default.isReachable, let ex = currentExercise else { return }
        WCSession.default.sendMessage(["type":"GYM_SET","exercise":ex.name,"weight":currentWeight,"reps":currentReps], replyHandler: nil)
    }

    // 🟢 重訓的「手機驅動即時心率串流」已移到常駐 WatchConnHub 統一處理
    //    （見 WatchConnHub.swift），這裡不再各自起 session，避免 delegate / session 互搶。

    // Called on activation AND whenever reachability changes — ensures we always request
    // the plan as soon as the iPhone is reachable.
    func requestGymPlan() {   // 空狀態「重新同步」鈕也會呼叫 → 開放存取
        let req: [String: Any] = ["type": "REQUEST_GYM_PLAN"]
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(req, replyHandler: nil) { _ in
                // sendMessage failed (e.g. phone went background mid-send) — queue it
                WCSession.default.transferUserInfo(req)
            }
        } else {
            // Phone not reachable right now — queue via transferUserInfo so it
            // arrives as soon as the iPhone comes into range / foreground.
            WCSession.default.transferUserInfo(req)
        }
    }

    // MARK: - Parse incoming plan (shared by didReceiveMessage + didReceiveUserInfo)
    private func handleIncomingMessage(_ message: [String: Any]) {
        // 🟢 重訓量測指令(START/STOP)已改由常駐 WatchConnHub 親自處理，
        //    這裡只負責 gymPlan / userId 同步，收到 command 直接略過避免重複起 session。
        if message["command"] != nil { return }

        // 🟢 先吃 userId（iPhone 推 plan 或 USER_ID_SYNC 時會一起送過來）
        //    確保 Watch 之後存 workout 時用的是正確的使用者 ID，
        //    而不是寫死的 fallback "user_123"
        if let uid = message["userId"] as? String, !uid.isEmpty {
            DispatchQueue.main.async {
                self.currentUserId = uid
                var saved = UserDefaults.standard.stringArray(forKey: "drvn_userIds") ?? []
                // 把這個 uid 推到陣列最前面，這樣下次 fallback `.first` 抓到的就是它
                saved.removeAll { $0 == uid }
                saved.insert(uid, at: 0)
                UserDefaults.standard.set(saved, forKey: "drvn_userIds")
                // 🟢 同步存入 primaryUserId，Watch 重啟後仍記得 iPhone 指定的帳號
                UserDefaults.standard.set(uid, forKey: "drvn_primaryUserId")
                print("[GymManager] 👤 收到 iPhone 推送 userId: \(uid)")
            }
        }

        // 🟢 吃 iPhone 推送的後端網址（優先 apiBaseURL 完整網址，相容舊版 apiHost）。
        //    Mac 換 WiFi / 切到 Railway 時，Watch 都會自動跟著同步。
        WatchConfig.store(from: message)

        // 🟢 USER_ID_SYNC：純粹同步帳號，不含 gymPlan → 處理完直接返回
        if (message["type"] as? String) == "USER_ID_SYNC" { return }

        guard let planData = message["gymPlan"] as? [[String: Any]] else {
            print("[GymManager] ⚠️ incoming message lacks 'gymPlan' array")
            return
        }
        
        let plans: [DayPlan] = planData.compactMap { dayDict in
            guard let label = dayDict["label"] as? String,
                  let exArr = dayDict["exercises"] as? [[String: Any]] else { return nil }

            // muscle field sent by WebView.swift (smart label)
            let muscle = (dayDict["muscle"] as? String) ?? {
                // fallback: extract from label after "·"
                let parts = label.components(separatedBy: "·")
                return parts.count > 1 ? parts.last?.trimmingCharacters(in: .whitespaces) ?? "" : ""
            }()

            let exercises: [GymExercise] = exArr.compactMap { exDict in
                guard let name = exDict["name"] as? String else { return nil }

                var parsedSets: [ExerciseSet] = []

                // 狀況 A：如果 iOS 端傳來的是已經展開的 Set Array (包含 completed 等狀態)
                if let sArr = exDict["sets"] as? [[String: Any]] {
                    parsedSets = sArr.compactMap { d in
                        let w = d["weight"] as? Double ?? Double("\(d["weight"] ?? "0")".replacingOccurrences(of: "kg", with: "")) ?? 0
                        let rRaw = "\(d["reps"] ?? "10")"
                        let r = Int(rRaw.components(separatedBy: "-").first ?? rRaw) ?? 10
                        return ExerciseSet(weight: w, reps: max(1, r))
                    }
                }
                // 狀況 B：如果 React 端傳來的是 Raw JSON (sets 是數字 3，weight 是 60)
                else {
                    let setsRaw = exDict["sets"] as? Int ?? Int("\(exDict["sets"] ?? "3")") ?? 3

                    let repsRaw = "\(exDict["reps"] ?? "10")"
                    let repsN = Int(repsRaw.components(separatedBy: "-").first ?? repsRaw) ?? 10

                    let weightRaw = "\(exDict["weight"] ?? "0")".replacingOccurrences(of: "kg", with: "").trimmingCharacters(in: .whitespaces)
                    let weightN = Double(weightRaw) ?? 0.0

                    parsedSets = (0..<max(1, setsRaw)).map { _ in ExerciseSet(weight: weightN, reps: repsN) }
                }

                guard !parsedSets.isEmpty else { return nil }
                // 🔴 Fix(plan-parity)：保留 iPhone 送來的原始次數區間（如 "8-12"）供顯示。
                let repsLabel = (exDict["repsLabel"] as? String)
                    ?? (exDict["reps"].map { "\($0)" })
                return GymExercise(name: name, sets: parsedSets, repsLabel: repsLabel)
            }
            guard !exercises.isEmpty else { return nil }
            return DayPlan(label: label, muscle: muscle, exercises: exercises)
        }
        
        guard !plans.isEmpty else {
            print("[GymManager] ❌ Parsing failed. Raw data: \(planData)")
            return 
        }
        
        DispatchQueue.main.async {
            self.availablePlans = plans
            self.selectedPlanIndex = 0 // 重置選取位置
            print("[GymManager] ✅ Successfully parsed \(plans.count) plan(s) from iPhone")
        }
    }

    // MARK: - WCSessionDelegate
    func session(_ session: WCSession,
                 activationDidCompleteWith state: WCSessionActivationState,
                 error: Error?) {
        guard state == .activated else { return }
        // Small delay so the session can settle, then request plan
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.requestGymPlan() }
    }

    // Fires whenever the iPhone comes into Bluetooth range / moves to foreground.
    // Re-request the plan so the Watch always stays in sync.
    func sessionReachabilityDidChange(_ session: WCSession) {
        if session.isReachable { requestGymPlan() }
    }

    // Live messages (phone in foreground, Bluetooth connected)
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleIncomingMessage(message)
    }

    // Queued messages (transferUserInfo — works even when phone is backgrounded)
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        handleIncomingMessage(userInfo)
    }
    // MARK: - 直接儲存到後端資料庫 (Watch → API, JSON body → SaveWorkoutRequest)
    // This mirrors exactly what React WatchWorkoutSync does so the backend
    // receives the same field shape regardless of which path fires.
    /// completion(true) = 手錶已經存進後端（手機收到 GYM_DONE 時就不要再存一次）
    func saveWorkoutToBackend(muscle: String, completion: ((Bool) -> Void)? = nil) {
        let finish: (Bool) -> Void = { ok in DispatchQueue.main.async { completion?(ok) } }
        // Use only the userId that was synced from iPhone; never fall back to a hardcoded ID
        let userId = currentUserId.isEmpty
            ? (UserDefaults.standard.string(forKey: "drvn_primaryUserId") ?? "")
            : currentUserId

        guard !userId.isEmpty else {
            print("❌ [Save] 無可用 userId — 請先透過 iPhone 同步帳號後再儲存")
            finish(false)
            return
        }
        // 沒有登入 token 就不打 —— 一定是 401，交給手機存
        guard !(UserDefaults.standard.string(forKey: WatchConfig.tokenKey) ?? "").isEmpty else {
            finish(false)
            return
        }

        guard let url = URL(string: "\(baseURL)/api/workout/save") else { finish(false); return }

        // ── Compute totals ────────────────────────────────────────────────────
        let completedSets  = exercises.flatMap(\.sets).filter(\.completed)
        let totalDone      = completedSets.count
        let totalVolume    = Int(completedSets.reduce(0) { $0 + $1.weight * Double($1.reps) })
        let durationMins   = max(1, Int(ceil(Double(elapsedSeconds) / 60.0)))
        let effortScore    = avgEffortScore

        // ── Build PR alert list as [{name:...}] dicts (matches SaveWorkoutRequest) ──
        let prAlertsArray: [[String: Any]] = exercises.flatMap { ex in
            ex.sets.filter { $0.isPR && $0.completed }.map { _ in ["name": ex.name] }
        }

        // ── Build exercises array ─────────────────────────────────────────────
        let exercisesArray: [[String: Any]] = exercises.map { ex -> [String: Any] in
            ["name": ex.name,
             "sets": ex.sets.filter { $0.completed }.map { s -> [String: Any] in
                 ["weight": s.weight, "reps": s.reps,
                  "rpe": s.rpe, "effortScore": s.effortScore,
                  "isPR": s.isPR, "completed": true]
             }]
        }

        // ── Build metrics dict ────────────────────────────────────────────────
        let metricsDict: [String: Any] = [
            "calories":        Int(activeCalories),
            "heartRate":       Int(heartRate),
            "effortScore":     effortScore,
            "source":          "appleWatch",
            "completion_rate": Int(progressFraction * 100),
            "intensity":       75
        ]

        // ── Assemble JSON body (matches SaveWorkoutRequest Pydantic model) ────
        let bodyDict: [String: Any] = [
            "user_id":       userId,
            "coach_id":      "apple_watch",
            "overall_score": effortScore,
            "metrics":       metricsDict,
            "reps_count":    totalDone,
            "exercises":     exercisesArray,
            "duration_mins": durationMins,
            "total_volume":  totalVolume,
            "focus_group":   muscle.isEmpty ? "strength" : muscle,
            "pr_alerts":     prAlertsArray
        ]

        guard let bodyData = try? JSONSerialization.data(withJSONObject: bodyDict) else {
            print("❌ [Save] JSON 序列化失敗")
            finish(false)
            return
        }

        var request = WatchConfig.authed(url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = bodyData

        print("📡 [Save] Sending workout to backend — user:\(userId) muscle:\(muscle) volume:\(totalVolume)kg")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("❌ [Save] 儲存失敗: \(error.localizedDescription)")
                finish(false)
                return
            }
            guard let httpRes = response as? HTTPURLResponse else { finish(false); return }
            if (200...299).contains(httpRes.statusCode) {
                print("✅ [Save] 訓練紀錄成功儲存至後端資料庫！")
                finish(true)
                // Notify iPhone WebView to refresh the 紀錄 list
                let msg: [String: Any] = ["type": "WATCH_WORKOUT_SAVED"]
                if WCSession.default.isReachable {
                    WCSession.default.sendMessage(msg, replyHandler: nil)
                } else {
                    WCSession.default.transferUserInfo(msg)
                }
            } else {
                let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                print("❌ [Save] 後端錯誤 HTTP \(httpRes.statusCode): \(body.prefix(200))")
                finish(false)
            }
        }.resume()
    }
}
