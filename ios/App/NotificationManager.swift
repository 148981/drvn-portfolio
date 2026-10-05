import Foundation
import UserNotifications

/// 本地通知管理器。
/// - 一次性提醒：`schedule(...)`
/// - 每日重複提醒：`scheduleDaily(...)`（供前端 workoutReminders.js 的訓練提醒使用）
/// - 立即顯示：`showNow(...)`（前端 fireReminder 在原生環境會走這條）
///
/// 注意：UNUserNotificationCenter.delegate 由 AppDelegate（FitnessAppApp.swift）統一持有，
/// 前景橫幅顯示與點擊路由都在那裡處理，這裡只負責「排程 / 取消」，不搶 delegate。
class NotificationManager {

    /// 每日訓練提醒用固定 identifier → 重新排程時會覆蓋舊的，不會累積。
    static let dailyReminderID = "drvn.daily.workout.reminder"

    // MARK: - Authorization
    func requestAuthorization(completion: @escaping (Bool, String?) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            DispatchQueue.main.async {
                completion(granted, error?.localizedDescription)
            }
        }
    }

    // MARK: - 一次性提醒（延遲秒數）
    func schedule(title: String, body: String, delaySeconds: Double, route: String? = nil,
                  completion: @escaping (String?) -> Void) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body  = body
        content.sound = .default
        // 🔔 點通知要能導回對應頁面（前端 scheduleOneShot 會帶 route；以前被丟掉）
        if let route = route, !route.isEmpty { content.userInfo = ["route": route] }

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, delaySeconds), repeats: false)
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger)

        UNUserNotificationCenter.current().add(request) { error in
            DispatchQueue.main.async { completion(error?.localizedDescription) }
        }
    }

    // MARK: - 立即顯示（前端 fireReminder 用）
    func showNow(title: String, body: String, route: String?) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body  = body
        content.sound = .default
        if let route = route { content.userInfo = ["route": route] }
        // trigger = nil → 立即遞送（前景由 delegate 的 willPresent 顯示橫幅）
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    // MARK: - 每日重複提醒
    /// hour/minute 為 24 小時制。repeats:true → 每天同一時間觸發。
    func scheduleDaily(hour: Int, minute: Int, title: String, body: String, route: String?) {
        let center = UNUserNotificationCenter.current()
        // 先移除舊的，避免重複
        center.removePendingNotificationRequests(withIdentifiers: [Self.dailyReminderID])

        let content = UNMutableNotificationContent()
        content.title = title
        content.body  = body
        content.sound = .default
        if let route = route { content.userInfo = ["route": route] }

        var dateComponents = DateComponents()
        dateComponents.hour = hour
        dateComponents.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(identifier: Self.dailyReminderID, content: content, trigger: trigger)
        center.add(request, withCompletionHandler: nil)
    }

    func cancelDaily() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.dailyReminderID])
    }

    // MARK: - Cancel All
    func cancelAll() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
}
