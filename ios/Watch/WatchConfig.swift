import Foundation

// ============================================================================
// MARK: - WatchConfig（Watch App 唯一的後端網址設定來源）
// ----------------------------------------------------------------------------
// Watch 是獨立 target，看不到 iPhone 端的 AppConfig，所以這裡自成一份。
//
// 取值優先順序（由 apiBaseURL 決定）：
//   1. iPhone 透過 WatchConnectivity 推送的「完整 base URL」(drvn_apiBaseURL)
//      → 最準確，連 Railway 的 https/443 也正確。
//   2. 舊版只推送純 host 時的相容路徑 (drvn_apiHost) → http://host:8000
//   3. 模擬器 → http://127.0.0.1:8000（後端跑在 Mac 自己）
//   4. 最終 fallback → productionBaseURL（上架版）/ 開發區網（DEBUG）
//
// ⚠️ 上架前唯一要改的：把 productionBaseURL 換成 Railway 正式網址，
//    並與 iPhone 端 AppConfig.productionBaseURL 保持一致。
// ============================================================================
enum WatchConfig {

    /// UserDefaults keys（與 iPhone 推送端約定一致）
    static let baseURLKey = "drvn_apiBaseURL"
    static let hostKey    = "drvn_apiHost"        // 舊版相容
    /// iPhone 同步過來的登入 token。後端的私人 API 都要帶它，不然一律 401。
    static let tokenKey   = "drvn_auth_token"

    /// 帶登入身分的請求。手錶上所有打後端的地方都要用這個，不要直接 URLRequest(url:)。
    static func authed(_ url: URL) -> URLRequest {
        var r = URLRequest(url: url)
        r.timeoutInterval = 15
        if let t = UserDefaults.standard.string(forKey: tokenKey), !t.isEmpty {
            r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        }
        return r
    }

    /// 🔧 DEBUG 區網開發機
    private static let devLANHost = "172.20.10.4"
    private static let devAPIPort = 8000

    /// 🚀 正式後端網址（上架前換成 Railway，結尾不要加斜線；需與 AppConfig 一致）
    static let productionBaseURL = "https://drvn-app-production.up.railway.app"

    /// 全 Watch App 統一使用的後端 base URL（呼叫端只接 path）。
    static var apiBaseURL: String {
        let d = UserDefaults.standard

        // 1. iPhone 推送的完整 base URL（最優先）
        if let full = d.string(forKey: baseURLKey), !full.isEmpty {
            return full.hasSuffix("/") ? String(full.dropLast()) : full
        }

        // 2. 舊版只推送純 host → 組回 http://host:8000
        //    🩹 W-5: 僅限 DEBUG — Release 上 watchOS ATS 會擋 cleartext http，
        //    走這條只會靜默失敗，直接讓它 fallback 到 productionBaseURL。
        #if DEBUG
        if let host = d.string(forKey: hostKey), !host.isEmpty {
            return "http://\(host):\(devAPIPort)"
        }
        #endif

        // 3. 模擬器走 localhost
        #if targetEnvironment(simulator)
        return "http://127.0.0.1:\(devAPIPort)"
        #else
        // 4. 最終 fallback：一律正式後端。
        //    以前 DEBUG 會退回區網開發機 172.20.10.4 —— 那台沒開時手錶所有資料都載不到
        //    （恢復度一直轉圈、計劃同步不到），而現在開發也是連 Railway。
        _ = devLANHost
        return productionBaseURL
        #endif
    }

    /// 收到 iPhone 推送時呼叫：把 base URL / host 存進 UserDefaults。
    /// 兩個都吃，新版優先存 apiBaseURL。
    static func store(from message: [String: Any]) {
        let d = UserDefaults.standard
        if let base = message["apiBaseURL"] as? String, !base.isEmpty {
            d.set(base, forKey: baseURLKey)
        }
        if let host = message["apiHost"] as? String, !host.isEmpty {
            d.set(host, forKey: hostKey)
        }
        if let token = message["authToken"] as? String, !token.isEmpty {
            d.set(token, forKey: tokenKey)
        }
    }
}
