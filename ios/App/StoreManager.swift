//
//  StoreManager.swift — App 內購（StoreKit 2）：DRVN 會員訂閱
//
//  JS → Swift：window.webkit.messageHandlers.purchase.postMessage({ action, productId })
//     action = "products"  取商品（Apple 在地化價格、是否還能用免費試用）
//              "buy"       購買 productId
//              "restore"   恢復購買（AppStore.sync，會請使用者登入 Apple ID）
//              "sync"      回報目前有效的訂閱（不跳任何視窗；App 開啟、回到前景時用）
//              "manage"    開 Apple 的訂閱管理頁（換方案、取消）
//
//  Swift → JS：window.dispatchEvent(new CustomEvent('drvn:iap', { detail }))
//     detail.type = products | purchased | pending | cancelled | failed | entitlements
//     purchased / entitlements 帶 Apple 簽章的交易（JWS），以及 renewal（續訂狀態，給 App 內提醒用）。
//
//  扣款前提醒（本機推播，identifier 固定、每次同步都重排，不會累積）：
//     免費試用結束前 3 天、年訂閱續訂前 7 天、月訂閱「第一次」續訂前 2 天、
//     取消自動續訂後到期前 3 天。沒開通知權限時用「安靜遞送」（provisional），不跳權限視窗。
//     ⚠️ 會員身分以後端為準：網頁把 JWS 送 /api/membership/apple/verify，
//        後端驗過 Apple 憑證鏈才寫入。這裡不自己判斷誰是會員。
//
//  商品 ID 與前端 utils/membership.js 的 MEMBERSHIP_PLANS、後端 APPLE_IAP_PRODUCT_IDS 必須一致，
//  並在 App Store Connect 建立同名的自動續訂訂閱（同一個訂閱群組）。
//

import Foundation
import StoreKit
import UIKit
import UserNotifications
import WebKit

@MainActor
final class StoreManager: NSObject {

    static let productIds: [String] = ["drvn.member.yearly", "drvn.member.monthly"]
    static let reminderId = "drvn.subscription.renewal.reminder"

    weak var webView: WKWebView?
    private var products: [String: Product] = [:]
    private var updatesTask: Task<Void, Never>?

    override init() {
        super.init()
        // Apple 規定：App 一啟動就要聽 Transaction.updates，
        // 否則在別處完成的購買（家長同意、續訂、其他裝置）會漏接。
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    let renewal = await self.refreshRenewal()
                    self.emit(["type": "entitlements", "transactions": [result.jwsRepresentation], "renewal": self.orNull(renewal)])
                }
            }
        }
    }

    // MARK: - 商品

    private func loadProducts() async throws -> [Product] {
        if products.count == Self.productIds.count { return Array(products.values) }
        let list = try await Product.products(for: Self.productIds)
        for p in list { products[p.id] = p }
        return list
    }

    private func sendProducts() async {
        do {
            let list = try await loadProducts()
            var items: [[String: Any]] = []
            for p in list {
                var item: [String: Any] = [
                    "id": p.id,
                    "displayPrice": p.displayPrice,
                    "price": NSDecimalNumber(decimal: p.price).doubleValue,
                ]
                if let sub = p.subscription {
                    let eligible = await sub.isEligibleForIntroOffer
                    let offer = sub.introductoryOffer
                    item["trialEligible"] = eligible && offer?.paymentMode == .freeTrial
                    if let offer, offer.paymentMode == .freeTrial {
                        item["trialDays"] = Self.days(of: offer.period)
                    }
                }
                items.append(item)
            }
            emit(["type": "products", "products": items])
        } catch {
            emit(["type": "failed", "stage": "products", "message": "目前無法連上 App Store"])
        }
    }

    private static func days(of period: Product.SubscriptionPeriod) -> Int {
        switch period.unit {
        case .day: return period.value
        case .week: return period.value * 7
        case .month: return period.value * 30
        case .year: return period.value * 365
        @unknown default: return period.value
        }
    }

    // MARK: - 購買／恢復

    private func buy(_ productId: String) async {
        guard Self.productIds.contains(productId) else {
            emit(["type": "failed", "stage": "buy", "message": "找不到這個方案"])
            return
        }
        do {
            _ = try await loadProducts()
            guard let product = products[productId] else {
                emit(["type": "failed", "stage": "buy", "message": "找不到這個方案"])
                return
            }
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    await transaction.finish()
                    let renewal = await refreshRenewal()
                    emit(["type": "purchased", "productId": productId, "transaction": verification.jwsRepresentation,
                          "renewal": self.orNull(renewal)])
                case .unverified:
                    emit(["type": "failed", "stage": "buy", "message": "購買驗證失敗，沒有扣款請再試一次"])
                }
            case .pending:
                // 家長同意（Ask to Buy）或需要額外驗證：核准後會從 Transaction.updates 進來
                emit(["type": "pending"])
            case .userCancelled:
                emit(["type": "cancelled"])
            @unknown default:
                emit(["type": "cancelled"])
            }
        } catch {
            emit(["type": "failed", "stage": "buy", "message": "無法完成購買，請稍後再試"])
        }
    }

    private func currentEntitlements() async -> [String] {
        var jws: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, Self.productIds.contains(t.productID) {
                jws.append(result.jwsRepresentation)
            }
        }
        return jws
    }

    private func restore() async {
        do {
            try await AppStore.sync()
        } catch {
            // 使用者關掉 Apple ID 登入視窗也會走到這裡 —— 照樣回報手上已有的訂閱
        }
        let renewal = await refreshRenewal()
        emit(["type": "entitlements", "restore": true, "transactions": await currentEntitlements(), "renewal": self.orNull(renewal)])
    }

    private func sync() async {
        let renewal = await refreshRenewal()
        emit(["type": "entitlements", "restore": false, "transactions": await currentEntitlements(), "renewal": self.orNull(renewal)])
    }

    /// 管理訂閱（換方案／取消）：App 內直接開 Apple 的訂閱管理頁。
    /// ⚠️ 網頁的 window.open(_blank) 在 WKWebView 沒有 createWebViewWith 時什麼都不會發生 ——
    ///    以前「換方案或取消訂閱」「先去取消訂閱」按了沒反應。打不開就退回 Apple 的網址。
    private func manage() async {
        if let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) {
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                await sync()   // 關掉管理頁後回報最新續訂狀態（取消自動續訂 → 退訂問卷、到期提醒）
                return
            } catch {
                // 落到下面開網址
            }
        }
        if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
            _ = await UIApplication.shared.open(url)
        }
    }

    // MARK: - 續訂狀態與扣款前提醒

    /// 目前有效的訂閱：哪個方案、何時到期／扣款、會不會自動續訂、是不是免費試用、是不是還沒續訂過。
    private func renewalSnapshot() async -> [String: Any]? {
        var latest: Transaction?
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, Self.productIds.contains(t.productID), t.revocationDate == nil {
                if (t.expirationDate ?? .distantPast) > (latest?.expirationDate ?? .distantPast) { latest = t }
            }
        }
        guard let tx = latest, let expires = tx.expirationDate else { return nil }
        _ = try? await loadProducts()
        let product = products[tx.productID]
        var willAutoRenew = true
        if let statuses = try? await product?.subscription?.status {
            for st in statuses {
                if case .verified(let info) = st.renewalInfo, info.originalTransactionID == tx.originalID {
                    willAutoRenew = info.willAutoRenew
                }
            }
        }
        return [
            "productId": tx.productID,
            "expiresAt": Int(expires.timeIntervalSince1970 * 1000),
            "willAutoRenew": willAutoRenew,
            "isTrial": tx.offer?.type == .introductory,
            "firstRenewal": tx.id == tx.originalID,
            "displayPrice": product?.displayPrice ?? "",
        ]
    }

    /// 讀續訂狀態並重排提醒；回傳狀態給網頁（App 內提示、退訂問卷用）。
    private func refreshRenewal() async -> [String: Any]? {
        let snap = await renewalSnapshot()
        await scheduleReminder(snap)
        return snap
    }

    private func scheduleReminder(_ snap: [String: Any]?) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.reminderId])
        guard let snap,
              let ms = snap["expiresAt"] as? Int,
              let productId = snap["productId"] as? String else { return }
        let expires = Date(timeIntervalSince1970: Double(ms) / 1000)
        let willAutoRenew = (snap["willAutoRenew"] as? Bool) ?? true
        let isTrial = (snap["isTrial"] as? Bool) ?? false
        let firstRenewal = (snap["firstRenewal"] as? Bool) ?? false
        let price = (snap["displayPrice"] as? String) ?? ""
        let yearly = productId.hasSuffix("yearly")
        let per = price.isEmpty ? "" : "以 \(price)／\(yearly ? "年" : "月")"

        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "zh_Hant_TW")
        fmt.dateFormat = "M月d日"
        let day = fmt.string(from: expires)
        let cancelHint = "不想續訂，到「設定 › Apple 帳號 › 訂閱」取消。"

        let plan: (Int, String, String)
        if !willAutoRenew {
            plan = (3, "DRVN 會員 3 天後到期", "\(day) 到期，之後不會再扣款。你的紀錄都會留著。")
        } else if isTrial {
            plan = (3, "免費試用 3 天後結束", "\(day) 起\(per)自動續訂。\(cancelHint)")
        } else if yearly {
            plan = (7, "DRVN 會員 7 天後續訂", "\(day) 將\(per)自動續訂。\(cancelHint)")
        } else if firstRenewal {
            plan = (2, "DRVN 會員 2 天後續訂", "\(day) 將\(per)自動續訂。\(cancelHint)")
        } else {
            return   // 月訂閱第二個月起每月扣款，使用者已經知道，不每月打擾
        }
        let (days, title, body) = plan

        // 提醒那天晚上 8 點送（不半夜吵人）；晚上 8 點已經過了到期時間就用原時間
        let base = expires.addingTimeInterval(-Double(days) * 86400)
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: base)
        comps.hour = 20
        var fire = Calendar.current.date(from: comps) ?? base
        if fire >= expires { fire = base }
        let delay = fire.timeIntervalSinceNow
        guard delay > 60 else { return }   // 已經在提醒區間內：交給 App 內提示

        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .provisional])
        }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = ["route": "/mobile-home"]
        let request = UNNotificationRequest(identifier: Self.reminderId, content: content,
                                            trigger: UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false))
        try? await center.add(request)
    }

    // MARK: - Swift → JS

    private func orNull(_ value: [String: Any]?) -> Any {
        if let value { return value }
        return NSNull()
    }

    private func emit(_ detail: [String: Any]) {
        // 🛡️ 走共用的 drvnJSONString（先 isValidJSONObject）：非 JSON 型別會丟 ObjC 例外，try? 接不住
        guard let json = drvnJSONString(detail) else { return }
        let js = "window.dispatchEvent(new CustomEvent('drvn:iap', { detail: \(json) }));"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}

// MARK: - WKScriptMessageHandler（JS → Swift）

extension StoreManager: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "purchase" else { return }
        let body = (message.body as? [String: Any]) ?? [:]
        let action = (body["action"] as? String) ?? ""
        let productId = (body["productId"] as? String) ?? ""
        Task { @MainActor in
            switch action {
            case "products": await self.sendProducts()
            case "buy":      await self.buy(productId)
            case "restore":  await self.restore()
            case "sync":     await self.sync()
            case "manage":   await self.manage()
            default: break
            }
        }
    }
}
