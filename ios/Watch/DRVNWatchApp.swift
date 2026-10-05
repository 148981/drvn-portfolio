//
//  _______AppWatchApp.swift
//  ＦｉｔｎｅｓｓAppWatch Watch App
//
//  Created by Chen Peng Yu on 2026/2/12.
//

import SwiftUI

@main
struct _______AppWatch_Watch_AppApp: App {
    // 🟢 App 一啟動就建立常駐連線中樞（唯一 WCSession delegate），
    //    讓 iPhone 的 START 指令不管手錶停在哪一頁都收得到 → 自動量心率。
    init() {
        WatchConnHub.bootstrap()
        // 跑步管理器不在這裡建立：啟動當下多做事會拖慢第一個畫面。
        // ContentView 一出現就會用到 WatchWorkoutManager.shared，那時才建立，一樣收得到手機的 START。
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .watchGlassGroup()
        }
    }
}
