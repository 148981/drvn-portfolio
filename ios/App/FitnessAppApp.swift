import SwiftUI
import UserNotifications

@available(iOS 26.0, *)
@main
struct FitnessAppApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .background(Color(red: 0.12, green: 0.16, blue: 0.23).ignoresSafeArea())
                .preferredColorScheme(.dark)
                // 🧹 冷啟動清掉殘留的鎖屏卡/靈動島（殭屍 Live Activity）；
                //    若真的有進行中訓練，JS 端 3 秒內的 UPDATE 會自動重建。
                .task { LiveActivityManager.shared.endZombies() }
                // 🏝️ Live Activity / 靈動島點擊 → fitnessapp://run-dashboard → 跑步儀表板
                //    沿用通知導頁機制（drvn.notif.route → WebView 改 HashRouter 路由）
                .onOpenURL { url in
                    guard url.scheme == "fitnessapp" else { return }
                    let route: String
                    switch url.host {
                    case "run-dashboard": route = "/cardio-tracker-mobile"
                    case "gym-session":   route = "/training-session-mobile" // 🏋️ 重訓 Live Activity 點擊返回
                    case "dashboard":     route = "/mobile-home"
                    default:              return
                    }
                    NotificationCenter.default.post(
                        name: Notification.Name("drvn.notif.route"),
                        object: nil,
                        userInfo: ["route": route]
                    )
                }
        }
    }
}

// MARK: - AppDelegate for Notification Handling
class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // 🧟 App 被滑掉／終止 → 立刻收掉 Live Activity，不留凍結的殭屍鎖屏卡
    //    （下次冷啟動的 endZombies 是第二道保險）。
    func applicationWillTerminate(_ application: UIApplication) {
        LiveActivityManager.shared.endAllBlocking()
    }

    // Show notifications even when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    // 🔔 使用者點擊通知 → 把夾帶的 route 廣播出去，WebView 會收下並導頁（HashRouter）。
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if let route = response.notification.request.content.userInfo["route"] as? String {
            NotificationCenter.default.post(
                name: Notification.Name("drvn.notif.route"),
                object: nil,
                userInfo: ["route": route]
            )
        }
        completionHandler()
    }
}
