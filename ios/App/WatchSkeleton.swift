import Foundation
import WatchKit
import HealthKit
import WatchConnectivity
import SwiftUI
import Combine

// NOTE: This file is intended for the WATCH APP TARGET.
// You must create a Watch App Target in Xcode and copy this code there.

class ExtensionDelegate: NSObject, WKExtensionDelegate {
    func applicationDidFinishLaunching() {
        // Perform any final initialization of your application.
    }
    
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        // Handle workout launch from system
    }
}

// Minimal Workout Manager for Watch
class WatchWorkoutManager: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate, WCSessionDelegate {
    
    let healthStore = HKHealthStore()
    var session: HKWorkoutSession?
    var builder: HKLiveWorkoutBuilder?
    
    @Published var heartRate: Double = 0
    @Published var activeCalories: Double = 0
    @Published var distance: Double = 0
    @Published var isTracking: Bool = false      // 是否正在追蹤(workout 進行中)
    @Published var authorized: Bool = false      // HealthKit 是否已授權心率

    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        refreshAuthStatus()
    }

    func refreshAuthStatus() {
        if let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            // 注意：read 權限基於隱私無法直接查狀態，這裡以 share(workout) 狀態 + 是否能建立 session 粗略判斷
            let status = healthStore.authorizationStatus(for: HKQuantityType.workoutType())
            DispatchQueue.main.async { self.authorized = (status == .sharingAuthorized) }
            _ = hrType
        }
    }

    func requestAuthorization() {
        let typesToShare: Set = [
            HKQuantityType.workoutType()
        ]

        let typesToRead: Set = [
            HKQuantityType.quantityType(forIdentifier: .heartRate)!,
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!
        ]

        healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead) { (success, error) in
            DispatchQueue.main.async { self.refreshAuthStatus() }
        }
    }
    
    // MARK: - Session Control
    func startWorkout() {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .running
        configuration.locationType = .outdoor
        
        do {
            session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            builder = session?.associatedWorkoutBuilder()
        } catch {
            return
        }
        
        session?.delegate = self
        builder?.delegate = self
        
        builder?.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
        
        session?.startActivity(with: Date())
        builder?.beginCollection(withStart: Date()) { (success, error) in
            DispatchQueue.main.async {
                self.isTracking = true
                self.reportTrackingState(true)
            }
        }
    }

    func stopWorkout() {
        session?.stopActivity(with: Date())
        session?.end()
        builder?.endCollection(withEnd: Date()) { (success, error) in
            self.builder?.finishWorkout { (workout, error) in
                DispatchQueue.main.async {
                    self.isTracking = false
                    self.reportTrackingState(false)
                }
            }
        }
    }

    // 把「是否正在追蹤」回報給 iPhone（reachable→即時，否則排隊）
    func reportTrackingState(_ tracking: Bool) {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let msg: [String: Any] = ["watchTracking": tracking]
        if session.isReachable {
            session.sendMessage(msg, replyHandler: nil, errorHandler: { _ in session.transferUserInfo(msg) })
        } else {
            session.transferUserInfo(msg)
        }
    }
    
    // MARK: - HKWorkoutSessionDelegate
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        // Handle state changes
        DispatchQueue.main.async {
            switch toState {
            case .running:
                print("Workout running")
            case .stopped:
                print("Workout stopped")
            case .ended:
                print("Workout ended")
            default:
                break
            }
        }
    }
    
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        print("Workout session failed: \(error.localizedDescription)")
    }
    
    // MARK: - HKLiveWorkoutBuilderDelegate
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType else { continue }
            guard let statistics = workoutBuilder.statistics(for: quantityType) else { continue }
            
            DispatchQueue.main.async {
                switch quantityType {
                case HKQuantityType.quantityType(forIdentifier: .heartRate):
                    let heartRateUnit = HKUnit.count().unitDivided(by: HKUnit.minute())
                    self.heartRate = statistics.mostRecentQuantity()?.doubleValue(for: heartRateUnit) ?? 0
                    self.sendHeartRateToPhone(self.heartRate)
                case HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned):
                    let energyUnit = HKUnit.kilocalorie()
                    self.activeCalories = statistics.sumQuantity()?.doubleValue(for: energyUnit) ?? 0
                case HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning):
                    let meterUnit = HKUnit.meter()
                    self.distance = statistics.sumQuantity()?.doubleValue(for: meterUnit) ?? 0
                default:
                    break
                }
            }
        }
    }
    
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
    }
    
    // MARK: - Connectivity
    // 🔧 心率回傳：reachable → sendMessage(即時)；否則 transferUserInfo(排隊送達 iPhone)。
    func sendHeartRateToPhone(_ hr: Double) {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        if session.isReachable {
            session.sendMessage(["heartRate": hr], replyHandler: nil, errorHandler: { _ in
                session.transferUserInfo(["heartRate": hr])
            })
        } else {
            session.transferUserInfo(["heartRate": hr])
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    private func handleCommand(_ message: [String: Any]) {
        if let command = message["command"] as? String {
            DispatchQueue.main.async {
                if command == "START_WORKOUT" {
                    self.startWorkout()
                } else if command == "STOP_WORKOUT" {
                    self.stopWorkout()
                }
            }
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        handleCommand(message)
    }

    // 🔧 iPhone 用 transferUserInfo 送來的指令(手錶背景時)也要處理
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        handleCommand(userInfo)
    }
}

// SwiftUI View for Watch
struct ContentView: View {
    @ObservedObject var workoutManager = WatchWorkoutManager()
    
    var body: some View {
        VStack(spacing: 6) {
            // 追蹤狀態指示
            HStack(spacing: 5) {
                Circle()
                    .fill(workoutManager.isTracking ? Color.green : Color.gray)
                    .frame(width: 8, height: 8)
                Text(workoutManager.isTracking ? "追蹤中" : "未追蹤")
                    .font(.caption2)
                    .foregroundColor(workoutManager.isTracking ? .green : .gray)
            }

            Text("\(Int(workoutManager.heartRate)) BPM")
                .font(.system(size: 34, weight: .bold))
                .foregroundColor(.red)

            HStack {
                Button(action: { workoutManager.startWorkout() }) {
                    Image(systemName: "play.circle.fill")
                        .font(.title)
                        .foregroundColor(.green)
                }
                Button(action: { workoutManager.stopWorkout() }) {
                    Image(systemName: "stop.circle.fill")
                        .font(.title)
                        .foregroundColor(.red)
                }
            }

            // 🔑 重新請求 HealthKit 授權（授權卡住時用）
            Button(action: { workoutManager.requestAuthorization() }) {
                Text("重新授權心率")
                    .font(.caption2)
            }
            .tint(.orange)
        }
        .onAppear {
            workoutManager.requestAuthorization()
        }
    }
}
