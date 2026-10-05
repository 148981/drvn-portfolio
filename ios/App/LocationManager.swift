import Foundation
import CoreLocation

class LocationManager: NSObject, CLLocationManagerDelegate {
    private let clManager = CLLocationManager()
    private var route: [[String: Double]] = []

    /// 🔋 省電核心：只有「使用者正在跑步/運動追蹤」時才允許連續定位。
    ///    isTracking = 前端明確要求 START 後才為 true；STOP / 離開跑步頁即關閉。
    private var isTracking = false
    /// 使用者按了開始但權限還沒批 → 批准後才自動補開（僅此情境允許自動開）
    private var pendingStart = false
    /// GET_ONCE 時權限還沒決定 → 批准後補一次單次定位（否則第一次一定拿不到位置）
    private var pendingOnce = false

    /// Callback to send events back to JavaScript
    var onEvent: ((String, [String: Any]) -> Void)?

    override init() {
        super.init()
        clManager.delegate = self
        clManager.desiredAccuracy = kCLLocationAccuracyBest
        clManager.distanceFilter = 5 // meters
        // 🏃 告訴系統這是健身活動，並禁止「自動暫停定位」：
        //    預設 pausesLocationUpdatesAutomatically = true，跑者等紅燈／慢下來時 iOS 會在背景
        //    自動停掉 GPS，而且要等 App 回到前景才恢復 → 鎖屏跑步的軌跡整段消失。
        clManager.activityType = .fitness
        clManager.pausesLocationUpdatesAutomatically = false
        // ⚠️ 背景定位改為「開始追蹤時」才動態開啟（見 startTracking），
        //    否則 App 只要開著，GPS 就在背景持續耗電。
    }

    // MARK: - Authorization
    func requestAuthorization() {
        clManager.requestWhenInUseAuthorization()
    }

    /// 🔥 App 啟動時先做一次 one-shot 定位，把 iOS 定位快取暖機起來，
    ///    讓使用者進到跑步頁時能更快拿到第一個 fix（而非冷啟動空等好幾秒）。
    func warmUp() {
        switch clManager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            clManager.requestLocation()   // 單次定位，省電
        default:
            break
        }
    }

    // MARK: - Tracking
    func startTracking() {
        route.removeAll()

        switch clManager.authorizationStatus {
        case .notDetermined:
            // 使用者此刻按了「開始」→ 權限批准後由 delegate 自動補開
            pendingStart = true
            clManager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            isTracking = true
            // 🏃 只有追蹤期間才允許背景定位（跑步鎖屏也要記錄軌跡）
            if ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] != "1" {
                clManager.allowsBackgroundLocationUpdates = true
            }
            // 🎯 Immediate one-shot fix so the map can centre instantly,
            //    plus continuous updates for the live trail.
            clManager.requestLocation()
            clManager.startUpdatingLocation()
            onEvent?("trackingStarted", ["status": "active"])
        default:
            onEvent?("locationError", ["error": "Location permission denied."])
        }
    }

    func stopTracking() {
        isTracking = false
        pendingStart = false
        clManager.stopUpdatingLocation()
        // 🔋 追蹤結束立即關閉背景定位，GPS 徹底休眠
        if ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] != "1" {
            clManager.allowsBackgroundLocationUpdates = false
        }
        onEvent?("trackingStopped", ["pointsRecorded": route.count])
    }

    /// 單次定位（省電）：給「GET_ONCE」用，拿一個 fix 就結束，不開連續更新。
    func getOnce() {
        switch clManager.authorizationStatus {
        case .notDetermined:
            pendingOnce = true
            clManager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            clManager.requestLocation()
        default:
            onEvent?("locationError", ["error": "Location permission denied."])
        }
    }

    func getRoute() -> [[String: Double]] {
        return route
    }

    // MARK: - CLLocationManagerDelegate
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        var point: [String: Double] = [
            "latitude":  location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "speed":     max(0, location.speed),
            "speedKmh":  max(0, location.speed * 3.6),
            "course":    location.course,
            // 📶 GPS 訊號品質：水平誤差半徑（公尺），前端用它顯示「搜尋中/弱/普通/良好」燈號。
            //    原本沒送這個欄位 → gpsAccuracy 永遠 null → 訊號燈一直沒數據。
            "horizontalAccuracy": location.horizontalAccuracy
        ]

        // 🏔️ 海拔：CoreLocation 在 verticalAccuracy < 0 時 altitude 無效（會回傳垃圾值），
        //    只有有效時才帶上 altitude，否則前端會收到 null 佔位，避免爬升亂跳。
        if location.verticalAccuracy >= 0 {
            point["altitude"] = location.altitude
        }

        route.append(point)

        // Stream to JS
        onEvent?("locationUpdate", point as [String: Any])
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[Location] Error: \(error.localizedDescription)")
        onEvent?("locationError", ["error": error.localizedDescription])
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status: String
        switch manager.authorizationStatus {
        case .authorizedWhenInUse: status = "authorizedWhenInUse"
        case .authorizedAlways:    status = "authorizedAlways"
        case .denied:              status = "denied"
        case .restricted:          status = "restricted"
        case .notDetermined:       status = "notDetermined"
        @unknown default:          status = "unknown"
        }

        onEvent?("locationAuthChanged", ["status": status])

        // 🔋 只有「使用者剛按開始跑步、但當下權限未批」的情境才自動補開連續定位。
        //    原本這裡無條件 startUpdatingLocation() → App 一啟動 GPS 就永遠開著（重度耗電 bug）。
        let granted = manager.authorizationStatus == .authorizedWhenInUse ||
                      manager.authorizationStatus == .authorizedAlways
        if pendingStart && granted {
            pendingStart = false
            pendingOnce = false
            startTracking()
        } else if pendingOnce && granted {
            pendingOnce = false
            manager.requestLocation()
        } else if !granted && manager.authorizationStatus != .notDetermined {
            // 使用者拒絕 → 清掉待辦，並明確回報錯誤讓前端顯示「到設定開啟定位」引導
            if pendingStart || pendingOnce {
                onEvent?("locationError", ["error": "Location permission denied.", "status": status])
            }
            pendingStart = false
            pendingOnce = false
        }
    }
}
