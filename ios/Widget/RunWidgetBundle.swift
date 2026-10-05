//
//  RunWidgetBundle.swift
//  RunWidget (Widget Extension)
//
//  ⚠️ 這個資料夾是「新的 Widget Extension target」的內容。
//  Xcode 加入方式見 ios/RunWidget/SETUP_XCODE.md
//

import WidgetKit
import SwiftUI

@main
struct RunWidgetBundle: WidgetBundle {
    var body: some Widget {
        RunLiveActivityWidget()
        DailyPromptWidget()   // 🎴 桌面小工具：今日進度/段位邀請函/飲食提醒（小/中/大）
    }
}
