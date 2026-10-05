//
//  PoseAnalyzer.swift
//  混合邊緣運算遷移 — Phase 2：Swift 原生骨架偵測
//
//  ───────────────────────────────────────────────────────────────────────────
//  「Swift 原生骨架偵測」的入口模組。
//
//  Phase 1（已完成）：打通 JS ↔ Swift 雙向橋。
//  Phase 2（本檔）   ：PHPicker 選影片 → AVAssetReader 逐幀解碼
//                     → MediaPipe PoseLandmarker 抓 33 點骨架 → 回報偵測統計。
//  Phase 3（待做）   ：把每幀骨架丟進 PoseFeatureExtractors 算 7 維特徵。
//
//  ── 橋接協定 ─────────────────────────────────────────────────────────────
//  JS → Swift：
//    window.webkit.messageHandlers.poseAnalyzer.postMessage({
//      action:     'pickAndAnalyze' | 'ping',
//      exerciseKey:'squat' | 'deadlift' | ...,
//      requestId:  '<由 JS 產生的唯一字串>'
//    })
//
//  Swift → JS（透過 HealthAppBridge.sendToJS → window.nativeBridge.onNativeEvent）：
//    { type:'poseReady',    requestId }
//    { type:'poseProgress', requestId, percent, stage }
//    { type:'poseResult',   requestId, exerciseKey, isSideView, fps,
//                           frameCount, posesDetected, detectionOnly, features }
//    { type:'poseError',    requestId, error }
//
//  決策 A1：評分仍留在 Python 後端。Swift 端只做「骨架偵測 + 特徵擷取」。
//  ───────────────────────────────────────────────────────────────────────────

import Foundation
import WebKit
import AVFoundation
import PhotosUI
import UIKit
import SwiftUI
import UniformTypeIdentifiers
import MediaPipeTasksVision

@available(iOS 17.0, *)
final class PoseAnalyzer: NSObject {

    /// 沿用既有 HealthAppBridge 的 sendToJS。weak 以免 retain cycle（bridge 持有本物件）。
    private weak var bridge: HealthAppBridge?

    /// App bundle 內的模型檔名（不含副檔名）。需把 pose_landmarker_full.task 加入 target 的資源。
    private let modelBaseName = "pose_landmarker_full"

    /// 支援的動作 key —— 必須與後端 EXERCISE_CONFIGS、前端 EXERCISE_INFO 一致。
    static let supportedExercises: Set<String> = [
        "lat_pulldown", "squat", "deadlift",
        "bench_press", "overhead_press", "barbell_row"
    ]

    /// 側視動作（對應後端 cfg["preferred_view"] == "side"）。
    private static let sideViewExercises: Set<String> = [
        "squat", "deadlift", "bench_press", "barbell_row"
    ]

    /// PHPicker 是非同步流程，用這個把「哪一次請求」的情境帶著走。
    private struct PendingRequest {
        let requestId: String
        let exerciseKey: String
        var view: String? = nil        // 【建模】機位代號 frontal_0 / sagittal_90 …
        var apiBase: String? = nil     // 【建模】後端 base，例如 http://192.168.x.x:8000
        var isTemplate: Bool = false   // 【建模】true=多支建模、false=單支分析
        var authToken: String? = nil   // 【建模】JWT —— 建模端點要求登入，URLSession 不會自動帶
    }
    private var pending: PendingRequest?

    /// 【App 內錄影建模】JS 分段傳進來的影片：requestId → (第幾支 → 暫存檔)。
    /// App 內錄好的影片是 WebView 裡的 blob，PHPicker 看不到，只能由 JS 分段送進來。
    private var incomingClips: [String: [Int: URL]] = [:]

    /// 偵測時每一幀的骨架（Phase 3 會接著用它算 7 維特徵）。
    struct PoseFrame {
        let timestampMs: Int
        let world: [Landmark]              // 33 點 3D world 座標（給幾何計算）
        let image: [NormalizedLandmark]    // 33 點 正規化座標（含 visibility，給門檻判斷）
    }

    /// 一次完整分析的快取 —— 給 showARPlayback 取「原始影片 + 逐幀骨架」做 AR 疊合回放。
    /// 偵測（PoseAnalyzer）只負責分析；渲染（ARPlaybackView）只負責畫 —— 架構乾性分離。
    struct AnalyzedSession {
        let videoURL: URL          // 使用者原始影片的本機暫存檔
        let videoSize: CGSize      // 轉正後的顯示尺寸（給 aspect-fit 座標換算）
        let exerciseKey: String
        let frames: [PoseFrame]    // 已依真實 PTS 排序的逐幀骨架
    }

    /// 依 requestId 快取最近一次分析。新分析進來時舊的會被汰除（連暫存影片一起刪）。
    private var sessionCache: [String: AnalyzedSession] = [:]

    /// 寫入快取，並汰除舊的 session（刪掉舊暫存影片釋放空間，只留最新一筆）。
    private func cacheSession(requestId: String, session: AnalyzedSession) {
        for (key, old) in sessionCache where key != requestId {
            try? FileManager.default.removeItem(at: old.videoURL)
        }
        sessionCache = [requestId: session]
        print("[PoseAnalyzer] 🗄️ 已快取 session \(requestId)：\(session.frames.count) 幀骨架")
    }

    init(bridge: HealthAppBridge) {
        self.bridge = bridge
        super.init()
        // 🧹 啟動清理：掃掉 crash 殘留的暫存分析影片，只留最新 N 個（容量治理）。
        Self.pruneOldPoseInputs(keepNewest: 3)
    }

    /// 清理暫存區的 pose_input_*.mov，只保留最新 keepNewest 個，其餘刪除。
    /// 正常流程 cacheSession 已只留最新一筆；這支是防止 crash 殘留累積的雙保險。
    static func pruneOldPoseInputs(keepNewest: Int = 3) {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory
        guard let files = try? fm.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return }
        let inputs = files
            .filter { $0.lastPathComponent.hasPrefix("pose_input_") }
            .sorted {
                let d0 = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
                let d1 = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
                return d0 > d1   // 最新在前
            }
        // 建模暫存檔（tmpl_input_*）只在單次建模期間有用；App 剛啟動時留著的一定是
        // 上次被中斷（JS 沒送 discard、App 被殺）的殘留，全部刪掉。
        for url in files where url.lastPathComponent.hasPrefix("tmpl_input_") {
            try? fm.removeItem(at: url)
        }
        guard inputs.count > keepNewest else { return }
        for url in inputs[keepNewest...] {
            try? fm.removeItem(at: url)
        }
    }

    // MARK: - 回傳事件

    private func send(_ type: String, _ payload: [String: Any]) {
        guard let bridge = bridge else {
            print("[PoseAnalyzer] ⚠️ bridge 已釋放，無法回傳 \(type)")
            return
        }
        bridge.sendToJS(type: type, data: payload)
    }

    private func sendError(_ requestId: String, _ message: String) {
        print("[PoseAnalyzer] ❌ \(message)")
        send("poseError", ["requestId": requestId, "error": message])
    }

    private func sendProgress(_ requestId: String, percent: Int, stage: String) {
        send("poseProgress", ["requestId": requestId, "percent": percent, "stage": stage])
    }
}

// MARK: - WKScriptMessageHandler（JS → Swift）

@available(iOS 17.0, *)
extension PoseAnalyzer: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "poseAnalyzer" else { return }

        let body = (message.body as? [String: Any]) ?? [:]
        let action = (body["action"] as? String) ?? ""
        let exerciseKey = (body["exerciseKey"] as? String) ?? ""
        let requestId = (body["requestId"] as? String) ?? UUID().uuidString

        print("[PoseAnalyzer] didReceive action=\(action) exerciseKey=\(exerciseKey) requestId=\(requestId)")

        switch action {
        case "ping":
            send("poseReady", ["requestId": requestId])

        case "pickAndAnalyze", "analyze":
            guard Self.supportedExercises.contains(exerciseKey) else {
                sendError(requestId, "不支援的動作：\(exerciseKey)")
                return
            }
            // 動作開始前先確認模型檔在不在，免得使用者選完影片才失敗。
            guard Bundle.main.path(forResource: modelBaseName, ofType: "task") != nil else {
                sendError(requestId, "找不到模型檔 \(modelBaseName).task —— 請先把它加入 App target 的資源。")
                return
            }
            DispatchQueue.main.async { [weak self] in
                self?.presentVideoPicker(exerciseKey: exerciseKey, requestId: requestId)
            }

        case "pickAndBuildTemplate":
            // 【裝置端建模】跟分析同一種前置處理：手機端抽骨架、只上傳骨架 JSON。
            guard Self.supportedExercises.contains(exerciseKey) else {
                sendError(requestId, "不支援的動作：\(exerciseKey)")
                return
            }
            guard Bundle.main.path(forResource: modelBaseName, ofType: "task") != nil else {
                sendError(requestId, "找不到模型檔 \(modelBaseName).task —— 請先把它加入 App target 的資源。")
                return
            }
            let view = body["view"] as? String
            let apiBase = body["apiBase"] as? String
            let authToken = body["authToken"] as? String
            DispatchQueue.main.async { [weak self] in
                self?.presentVideoPicker(exerciseKey: exerciseKey, requestId: requestId,
                                         isTemplate: true, view: view, apiBase: apiBase,
                                         authToken: authToken)
            }

        case "templateClipChunk":
            // 【App 內錄影建模】JS 把已經在手上的影片切段（base64）送進來，逐段寫進暫存檔。
            //   每收完一段回 poseChunkAck，JS 等到 ack 才送下一段，避免一次塞爆記憶體。
            let idx = (body["index"] as? NSNumber)?.intValue ?? 0
            guard let b64 = body["data"] as? String,
                  let chunk = Data(base64Encoded: b64) else {
                sendError(requestId, "影片分段解碼失敗。")
                return
            }
            var map = incomingClips[requestId] ?? [:]
            let fileURL: URL
            if let existing = map[idx] {
                fileURL = existing
            } else {
                fileURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent("tmpl_input_\(UUID().uuidString).mp4")
                FileManager.default.createFile(atPath: fileURL.path, contents: nil)
                map[idx] = fileURL
                incomingClips[requestId] = map
            }
            do {
                let handle = try FileHandle(forWritingTo: fileURL)
                try handle.seekToEnd()
                try handle.write(contentsOf: chunk)
                try handle.close()
            } catch {
                sendError(requestId, "寫入影片暫存檔失敗：\(error.localizedDescription)")
                return
            }
            send("poseChunkAck", ["requestId": requestId, "index": idx])

        case "buildTemplateFromClips":
            // 【App 內錄影建模】影片都收齊了 → 原生抽骨架 → 只上傳骨架 JSON（跟相簿建模同一條路）
            let urls = (incomingClips.removeValue(forKey: requestId) ?? [:])
                .sorted { $0.key < $1.key }.map { $0.value }
            guard Self.supportedExercises.contains(exerciseKey) else {
                urls.forEach { try? FileManager.default.removeItem(at: $0) }
                sendError(requestId, "不支援的動作：\(exerciseKey)")
                return
            }
            guard Bundle.main.path(forResource: modelBaseName, ofType: "task") != nil else {
                urls.forEach { try? FileManager.default.removeItem(at: $0) }
                sendError(requestId, "找不到模型檔 \(modelBaseName).task —— 請先把它加入 App target 的資源。")
                return
            }
            let req = PendingRequest(requestId: requestId, exerciseKey: exerciseKey,
                                     view: body["view"] as? String,
                                     apiBase: body["apiBase"] as? String,
                                     isTemplate: true,
                                     authToken: body["authToken"] as? String)
            sendProgress(requestId, percent: 10, stage: "extracting")
            Task { await self.handleTemplateFiles(urls, req: req) }

        case "discardTemplateClips":
            (incomingClips.removeValue(forKey: requestId) ?? [:]).values
                .forEach { try? FileManager.default.removeItem(at: $0) }

        case "showARPlayback":
            // JS 在 /api/analyze_set 評分完成後，把 repSegments / fatigueData / feedback
            // 交回來，這裡挑出 best / worst 兩下、組資料包並彈出 AR 疊合回放。
            handleShowARPlayback(body: body, requestId: requestId)

        default:
            sendError(requestId, "未知的 action：\(action)")
        }
    }
}

// MARK: - PHPicker（選影片）

@available(iOS 17.0, *)
extension PoseAnalyzer: PHPickerViewControllerDelegate {

    /// 跳出系統相簿選取器讓使用者挑一支訓練影片。
    /// 用 PHPicker 的好處：它在獨立程序執行，不需要相簿權限（Info.plist 不用改）。
    private func presentVideoPicker(exerciseKey: String, requestId: String,
                                    isTemplate: Bool = false, view: String? = nil, apiBase: String? = nil,
                                    authToken: String? = nil) {
        guard let presenter = Self.topViewController() else {
            sendError(requestId, "找不到可呈現選取器的畫面。")
            return
        }
        pending = PendingRequest(requestId: requestId, exerciseKey: exerciseKey,
                                 view: view, apiBase: apiBase, isTemplate: isTemplate,
                                 authToken: authToken)

        var config = PHPickerConfiguration()
        config.filter = .videos
        // 建模要多支（≥3）；分析只要一支。0 = 不限數量。
        config.selectionLimit = isTemplate ? 0 : 1

        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        presenter.present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)

        guard let req = pending else { return }
        pending = nil

        // 【建模】多支影片 → 逐支抽骨架 → 上傳骨架 JSON
        if req.isTemplate {
            let providers = results.map { $0.itemProvider }
            guard !providers.isEmpty else {
                sendError(req.requestId, "使用者取消選取。")
                return
            }
            sendProgress(req.requestId, percent: 2, stage: "loading")
            Task { await self.handleTemplatePick(providers, req: req) }
            return
        }

        guard let item = results.first?.itemProvider else {
            sendError(req.requestId, "使用者取消選取。")
            return
        }

        sendProgress(req.requestId, percent: 3, stage: "loading")

        // PHPicker 給的檔案 URL 只在 closure 內有效，要先複製到自己的暫存區。
        item.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { [weak self] url, error in
            guard let self = self else { return }
            guard let url = url else {
                self.sendError(req.requestId, "讀取影片失敗：\(error?.localizedDescription ?? "未知錯誤")")
                return
            }
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent("pose_input_\(UUID().uuidString).mov")
            do {
                try FileManager.default.copyItem(at: url, to: dest)
            } catch {
                self.sendError(req.requestId, "複製影片到暫存區失敗：\(error.localizedDescription)")
                return
            }
            Task {
                // ⚠️ 不在這裡刪 dest —— 影片所有權移交給 sessionCache，
                //    供之後的 AR 疊合回放（showARPlayback）播放原始影片用。
                //    舊影片會在下一次分析快取進來時被 cacheSession 汰除。
                await self.analyzeVideo(at: dest,
                                        exerciseKey: req.exerciseKey,
                                        requestId: req.requestId)
            }
        }
    }

    /// 取得目前最上層的 view controller，用來呈現 PHPicker。
    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let keyWindow = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
        var top = keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

// MARK: - 影片解碼 + MediaPipe 偵測

@available(iOS 17.0, *)
extension PoseAnalyzer {

    /// 逐幀解碼影片並用 MediaPipe 抓骨架。Phase 2 只回報偵測統計；
    /// Phase 3 會在「收集骨架」與「回傳」之間插入 7 維特徵擷取。
    private func analyzeVideo(at url: URL, exerciseKey: String, requestId: String) async {
        do {
            // ── 1. 建立 MediaPipe PoseLandmarker（video 模式）────────────────
            guard let modelPath = Bundle.main.path(forResource: modelBaseName, ofType: "task") else {
                sendError(requestId, "找不到模型檔 \(modelBaseName).task。")
                return
            }
            let options = PoseLandmarkerOptions()
            options.baseOptions.modelAssetPath = modelPath
            options.runningMode = .video
            options.numPoses = 1
            let landmarker = try PoseLandmarker(options: options)

            // ── 2. 開啟影片、取得視訊軌與基本資訊 ────────────────────────────
            let asset = AVURLAsset(url: url)
            guard let track = try await asset.loadTracks(withMediaType: .video).first else {
                sendError(requestId, "影片裡找不到視訊軌。")
                return
            }
            let nominalFPS = try await track.load(.nominalFrameRate)
            let transform = try await track.load(.preferredTransform)
            let duration = try await asset.load(.duration)
            let naturalSize = try await track.load(.naturalSize)

            let fps = nominalFPS > 0 ? Double(nominalFPS) : 30.0
            let orientation = Self.imageOrientation(from: transform)
            // 轉正後的顯示尺寸：套用 preferredTransform 後取正值寬高。
            // AR 回放用它算影片在畫面上 aspect-fit 後的內容矩形，骨架才對得準。
            let orientedSize = CGRect(origin: .zero, size: naturalSize)
                .applying(transform).standardized.size
            // 動態跳幀：把實際送進 MediaPipe 的量壓到約 15fps（對齊後端做法）。
            let skip = max(1, Int((fps / 15.0).rounded()))
            let effectiveFps = fps / Double(skip)   // 跳幀後實際送進擷取器的有效幀率（≈15）
            let totalFrames = max(1, Int(CMTimeGetSeconds(duration) * fps))

            sendProgress(requestId, percent: 8, stage: "detecting")

            // ── 3. AVAssetReader 逐幀解碼 ───────────────────────────────────
            let reader = try AVAssetReader(asset: asset)
            let outputSettings: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]
            let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
            trackOutput.alwaysCopiesSampleData = false
            reader.add(trackOutput)
            reader.startReading()

            var frames: [PoseFrame] = []
            var frameIndex = 0      // 解碼出來的總幀數
            var sampledCount = 0    // 實際送進 MediaPipe 的幀數
            var lastTimestamp = -1
            var keepReading = true

            // ⏱ 效能計時：分離「解碼迴圈總時間」與「純 MediaPipe 推論時間」，
            //   才能看出到底是哪一段慢（解碼 / ML 推論 / 特徵擷取）。
            let tDecodeLoopStart = CFAbsoluteTimeGetCurrent()
            var detectAccumMs: Double = 0

            while keepReading && reader.status == .reading {
                autoreleasepool {
                    guard let sample = trackOutput.copyNextSampleBuffer() else {
                        keepReading = false
                        return
                    }
                    let kept = (frameIndex % skip == 0)
                    frameIndex += 1
                    guard kept, let pixelBuffer = CMSampleBufferGetImageBuffer(sample) else { return }
                    sampledCount += 1

                    // realTs：真實 PTS（特徵時序排序用）。
                    // feedTs：餵 MediaPipe 的時間戳，video 模式要求嚴格遞增。
                    let realTs = Int(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)) * 1000)
                    var feedTs = realTs
                    if feedTs <= lastTimestamp { feedTs = lastTimestamp + 1 }
                    lastTimestamp = feedTs

                    do {
                        let mpImage = try MPImage(pixelBuffer: pixelBuffer, orientation: orientation)
                        let tDetect = CFAbsoluteTimeGetCurrent()
                        let result = try landmarker.detect(videoFrame: mpImage,
                                                            timestampInMilliseconds: feedTs)
                        detectAccumMs += (CFAbsoluteTimeGetCurrent() - tDetect) * 1000
                        if let world = result.worldLandmarks.first,
                           let image = result.landmarks.first {
                            frames.append(PoseFrame(timestampMs: realTs, world: world, image: image))
                        }
                    } catch {
                        // 個別壞幀略過，不中斷整體分析。
                    }

                    if sampledCount % 10 == 0 {
                        let pct = min(95, 8 + Int(Double(frameIndex) / Double(totalFrames) * 87))
                        self.sendProgress(requestId, percent: pct, stage: "detecting")
                    }
                }
            }

            let decodeLoopMs = (CFAbsoluteTimeGetCurrent() - tDecodeLoopStart) * 1000

            if reader.status == .failed {
                sendError(requestId, "影片解碼失敗：\(reader.error?.localizedDescription ?? "未知錯誤")")
                return
            }

            let posesDetected = frames.count
            print("[PoseAnalyzer] ✅ 偵測完成：取樣 \(sampledCount) 幀，偵測到骨架 \(posesDetected) 幀")

            guard posesDetected >= 5 else {
                sendError(requestId, "偵測到的骨架幀數太少（\(posesDetected)）—— 請確認影片有完整拍到人。")
                return
            }

            // ── 4. 依真實 PTS 排序（處理 B-frame 解碼順序 ≠ 播放順序）──────────
            frames.sort { $0.timestampMs < $1.timestampMs }

            // ── 5. 逐幀算 7 維特徵（Phase 3）─────────────────────────────────
            sendProgress(requestId, percent: 96, stage: "extracting")
            guard let extractor = PoseFeatureExtractors.make(exerciseKey: exerciseKey,
                                                             fps: effectiveFps) else {
                sendError(requestId, "不支援的動作：\(exerciseKey)")
                return
            }
            let tExtractStart = CFAbsoluteTimeGetCurrent()
            var features: [[Float]] = []
            features.reserveCapacity(frames.count)
            for f in frames {
                features.append(extractor.extract(world: f.world, image: f.image))
            }
            let extractMs = (CFAbsoluteTimeGetCurrent() - tExtractStart) * 1000
            // 轉成 JSON 安全格式：NaN → null（對齊 JS stopRecording 的清理邏輯）。
            let featuresJSON: [[Any]] = features.map { row in
                row.map { $0.isFinite ? (Double($0) as Any) : (NSNull() as Any) }
            }
            print("[PoseAnalyzer] ✅ 特徵擷取完成：\(features.count) 幀 × 7 維")

            // ── ⏱ 效能計時總結 ─────────────────────────────────────────────
            //   detect      = 純 MediaPipe ML 推論（找 33 點），分析最久的就是這段。
            //   decodeLoop  = 解碼 + 推論整段迴圈。
            //   decodeOnly  = 兩者之差 ≈ AVAssetReader 解碼 + 像素處理開銷。
            let detectAvgMs = sampledCount > 0 ? detectAccumMs / Double(sampledCount) : 0
            print(String(format:
                "[PoseAnalyzer] ⏱ 效能 | 取樣 %d 幀 @ %.1f fps\n" +
                "   骨架偵測 (MediaPipe ML 推論)：總計 %.0f ms，每幀平均 %.1f ms\n" +
                "   解碼+推論迴圈：總計 %.0f ms（其中純解碼約 %.0f ms）\n" +
                "   特徵擷取：%.0f ms\n" +
                "   ⚠️ 模擬器無 GPU / Neural Engine，偵測會比真機慢數倍，此數字只可拿來相對比較。",
                sampledCount, effectiveFps,
                detectAccumMs, detectAvgMs,
                decodeLoopMs, max(0, decodeLoopMs - detectAccumMs),
                extractMs))

            // ── 5.5 快取本次 session ────────────────────────────────────────
            //   留著「原始影片 + 逐幀骨架」，等 JS 評分回來呼叫 showARPlayback 時，
            //   直接在地端組 AR 疊合回放資料，不必再傳一次座標給後端。
            cacheSession(requestId: requestId,
                         session: AnalyzedSession(videoURL: url,
                                                  videoSize: orientedSize,
                                                  exerciseKey: exerciseKey,
                                                  frames: frames))

            // ── 6. 回報結果 ─────────────────────────────────────────────────
            send("poseResult", [
                "requestId": requestId,
                "exerciseKey": exerciseKey,
                "isSideView": Self.sideViewExercises.contains(exerciseKey),
                "fps": effectiveFps,
                "frameCount": sampledCount,
                "posesDetected": posesDetected,
                "featureCount": features.count,
                "features": featuresJSON
            ])

        } catch {
            sendError(requestId, "分析發生錯誤：\(error.localizedDescription)")
        }
    }

    // MARK: - 【裝置端建模】多支影片抽骨架 → 上傳骨架 JSON

    /// 把 PHPicker 選到的多支影片逐支抽骨架，組成 clips，POST 給後端建模端點。
    private func handleTemplatePick(_ providers: [NSItemProvider], req: PendingRequest) async {
        guard Bundle.main.path(forResource: modelBaseName, ofType: "task") != nil else {
            sendError(req.requestId, "找不到模型檔 \(modelBaseName).task。")
            return
        }
        var clips: [[String: Any]] = []
        let n = max(1, providers.count)
        for (i, provider) in providers.enumerated() {
            guard let url = await loadMovieToTemp(provider) else { continue }
            defer { try? FileManager.default.removeItem(at: url) }
            guard let extracted = await extractPoseFramesForTemplate(at: url),
                  extracted.frames.count >= 10 else { continue }
            let framesJSON: [[String: Any]] = extracted.frames.map { f in
                [
                    "world": f.world.map { [$0.x, $0.y, $0.z] },
                    "image": f.image.map { [$0.x, $0.y] },
                    "vis":   f.image.map { ($0.visibility?.floatValue) ?? Float(1.0) }
                ]
            }
            clips.append(["fps": extracted.fps, "frames": framesJSON])
            let pct = 6 + Int(Double(i + 1) / Double(n) * 44)   // 抽取佔 6–50%
            sendProgress(req.requestId, percent: pct, stage: "extracting")
        }
        guard clips.count >= 3 else {
            sendError(req.requestId, "有效影片不足（\(clips.count) 支）—— 建模至少要 3 支完整拍到動作的影片。")
            return
        }
        sendProgress(req.requestId, percent: 50, stage: "uploading")
        var payload: [String: Any] = ["exercise_key": req.exerciseKey, "clips": clips]
        if let v = req.view { payload["view"] = v }
        postTemplate(payload, apiBase: req.apiBase, req: req)
    }

    /// 【App 內錄影建模】JS 送進來、已經落地的影片檔 → 逐支抽骨架 → 上傳骨架 JSON。
    /// 與 handleTemplatePick 同一套抽取與上傳，差別只在影片來源。
    private func handleTemplateFiles(_ urls: [URL], req: PendingRequest) async {
        defer { urls.forEach { try? FileManager.default.removeItem(at: $0) } }
        var clips: [[String: Any]] = []
        let n = max(1, urls.count)
        for (i, url) in urls.enumerated() {
            guard let extracted = await extractPoseFramesForTemplate(at: url),
                  extracted.frames.count >= 10 else { continue }
            let framesJSON: [[String: Any]] = extracted.frames.map { f in
                [
                    "world": f.world.map { [$0.x, $0.y, $0.z] },
                    "image": f.image.map { [$0.x, $0.y] },
                    "vis":   f.image.map { ($0.visibility?.floatValue) ?? Float(1.0) }
                ]
            }
            clips.append(["fps": extracted.fps, "frames": framesJSON])
            let pct = 10 + Int(Double(i + 1) / Double(n) * 40)   // 抽取佔 10–50%
            sendProgress(req.requestId, percent: pct, stage: "extracting")
        }
        guard clips.count >= 3 else {
            sendError(req.requestId, "手機端只從 \(clips.count) 支影片抽到完整骨架 —— 建模至少要 3 支完整拍到動作的影片。")
            return
        }
        sendProgress(req.requestId, percent: 50, stage: "uploading")
        var payload: [String: Any] = ["exercise_key": req.exerciseKey, "clips": clips]
        if let v = req.view, !v.isEmpty { payload["view"] = v }
        postTemplate(payload, apiBase: req.apiBase, req: req)
    }

    /// PHPicker 的檔案 URL 只在 closure 內有效 → 先複製到暫存區再回傳。
    private func loadMovieToTemp(_ provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { cont in
            provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, _ in
                guard let url = url else { cont.resume(returning: nil); return }
                let dest = FileManager.default.temporaryDirectory
                    .appendingPathComponent("tmpl_input_\(UUID().uuidString).mov")
                do {
                    try FileManager.default.copyItem(at: url, to: dest)
                    cont.resume(returning: dest)
                } catch {
                    cont.resume(returning: nil)
                }
            }
        }
    }

    /// 逐幀解碼 + MediaPipe，回 (有效幀率, 依 PTS 排序的骨架)。與 analyzeVideo 前段同邏輯。
    private func extractPoseFramesForTemplate(at url: URL) async -> (fps: Double, frames: [PoseFrame])? {
        do {
            guard let modelPath = Bundle.main.path(forResource: modelBaseName, ofType: "task") else { return nil }
            let options = PoseLandmarkerOptions()
            options.baseOptions.modelAssetPath = modelPath
            options.runningMode = .video
            options.numPoses = 1
            let landmarker = try PoseLandmarker(options: options)

            let asset = AVURLAsset(url: url)
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { return nil }
            let nominalFPS = try await track.load(.nominalFrameRate)
            let transform = try await track.load(.preferredTransform)
            let duration = try await asset.load(.duration)
            let fps = nominalFPS > 0 ? Double(nominalFPS) : 30.0
            let orientation = Self.imageOrientation(from: transform)
            let skip = max(1, Int((fps / 15.0).rounded()))     // 壓到約 15fps，對齊後端
            let effectiveFps = fps / Double(skip)
            _ = duration

            let reader = try AVAssetReader(asset: asset)
            let outputSettings: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]
            let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
            trackOutput.alwaysCopiesSampleData = false
            reader.add(trackOutput)
            reader.startReading()

            var frames: [PoseFrame] = []
            var frameIndex = 0
            var lastTimestamp = -1
            var keepReading = true
            while keepReading && reader.status == .reading {
                autoreleasepool {
                    guard let sample = trackOutput.copyNextSampleBuffer() else { keepReading = false; return }
                    let kept = (frameIndex % skip == 0)
                    frameIndex += 1
                    guard kept, let pixelBuffer = CMSampleBufferGetImageBuffer(sample) else { return }
                    let realTs = Int(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)) * 1000)
                    var feedTs = realTs
                    if feedTs <= lastTimestamp { feedTs = lastTimestamp + 1 }
                    lastTimestamp = feedTs
                    do {
                        let mpImage = try MPImage(pixelBuffer: pixelBuffer, orientation: orientation)
                        let result = try landmarker.detect(videoFrame: mpImage, timestampInMilliseconds: feedTs)
                        if let world = result.worldLandmarks.first, let image = result.landmarks.first {
                            frames.append(PoseFrame(timestampMs: realTs, world: world, image: image))
                        }
                    } catch { /* 個別壞幀略過 */ }
                }
            }
            if reader.status == .failed { return nil }
            frames.sort { $0.timestampMs < $1.timestampMs }
            guard frames.count >= 10 else { return nil }
            return (effectiveFps, frames)
        } catch {
            return nil
        }
    }

    /// 把骨架 clips POST 給 /api/multi-exercise/template-from-pose-async，回 job_id 給 JS 輪詢。
    private func postTemplate(_ payload: [String: Any], apiBase: String?, req: PendingRequest) {
        guard let base = apiBase,
              let url = URL(string: base + "/api/multi-exercise/template-from-pose-async") else {
            sendError(req.requestId, "缺少後端位址，無法上傳骨架。")
            return
        }
        // 🛡️ 先 isValidJSONObject：骨架座標若有 NaN / Infinity，data(withJSONObject:) 會丟 ObjC 例外閃退，try? 接不住
        guard JSONSerialization.isValidJSONObject(payload),
              let httpBody = try? JSONSerialization.data(withJSONObject: payload) else {
            sendError(req.requestId, "骨架資料序列化失敗。")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = req.authToken, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = httpBody
        request.timeoutInterval = 300
        URLSession.shared.dataTask(with: request) { [weak self] data, _, err in
            guard let self = self else { return }
            if let err = err {
                self.sendError(req.requestId, "上傳骨架失敗：\(err.localizedDescription)")
                return
            }
            guard let data = data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                self.sendError(req.requestId, "伺服器回應無法解析。")
                return
            }
            if let jobId = obj["job_id"] as? String {
                self.send("poseTemplateJob", ["requestId": req.requestId, "jobId": jobId])
            } else {
                let msg = (obj["error"] as? String) ?? "伺服器未回傳工作編號"
                self.sendError(req.requestId, msg)
            }
        }.resume()
    }

    /// 由視訊軌的 preferredTransform 推算影像方向，餵給 MPImage 才不會把骨架抓歪。
    private static func imageOrientation(from t: CGAffineTransform) -> UIImage.Orientation {
        switch (t.a, t.b, t.c, t.d) {
        case (0, 1, -1, 0):   return .right   // 直立（順時針 90°）
        case (0, -1, 1, 0):   return .left    // 逆時針 90°
        case (-1, 0, 0, -1):  return .down    // 180°
        default:              return .up      // 一般橫向
        }
    }
}

// MARK: - AR 疊合回放（showARPlayback）

@available(iOS 17.0, *)
extension PoseAnalyzer {

    /// 收到 JS 轉交的後端評分結果 → 挑 best / worst → 組 ARPlaybackPayload → 彈出回放。
    func handleShowARPlayback(body: [String: Any], requestId: String) {
        guard let session = sessionCache[requestId] else {
            print("[PoseAnalyzer] ⚠️ showARPlayback：找不到 session \(requestId)，略過。")
            return
        }

        // 後端 /api/analyze_set 回傳、由 PoseAnalyzerMobile.jsx 原樣轉交的欄位。
        let repSegments  = (body["repSegments"]  as? [[String: Any]]) ?? []
        let fatigueData  = (body["fatigueData"]  as? [[String: Any]]) ?? []
        let feedback     = (body["feedback"]     as? [[String: Any]]) ?? []
        let exerciseName = (body["exerciseName"] as? String) ?? ""
        // 分數作廢（null）時不能當成 0 分 —— 用 NaN 標記「沒有分數」，畫面顯示「—」
        let overallScore = Self.numeric(body["overallScore"]) ?? .nan

        guard !repSegments.isEmpty else {
            print("[PoseAnalyzer] ⚠️ showARPlayback：repSegments 為空，略過。")
            return
        }

        // rep 編號 → 起訖秒（與原始影片真實 PTS 同一時間軸）。
        var segByRep: [Int: (start: Double, end: Double)] = [:]
        for seg in repSegments {
            guard let rep = Self.intValue(seg["rep"]) else { continue }
            segByRep[rep] = (Self.numeric(seg["startSec"]) ?? 0,
                             Self.numeric(seg["endSec"])   ?? 0)
        }
        // rep 編號 → 分數。量不到（null）的那一下不給分，也不參與挑 best / worst。
        var scoreByRep: [Int: Double] = [:]
        for f in fatigueData {
            guard let rep = Self.intValue(f["rep"]),
                  let sc = Self.numeric(f["score"]) else { continue }
            scoreByRep[rep] = sc
        }

        let reps = segByRep.keys.sorted()
        guard !reps.isEmpty else { return }
        let scored = reps.compactMap { r in scoreByRep[r].map { (r, $0) } }
        guard let bestPair = scored.max(by: { $0.1 < $1.1 }),
              let worstPair = scored.min(by: { $0.1 < $1.1 }) else {
            // 沒有任何一下有可信分數 → 無從比較最佳 / 待加強，不硬挑
            print("[PoseAnalyzer] ⚠️ showARPlayback：沒有任何 rep 有分數，略過。")
            return
        }
        let bestRep  = bestPair.0    // 分數最高那一下
        let worstRep = worstPair.0   // 分數最低那一下

        let bestTips  = Self.buildTips(from: feedback, positive: true)
        let worstTips = Self.buildTips(from: feedback, positive: false)

        func makeClip(rep: Int, type: String, tips: [ARCoachTip]) -> ARRepClip? {
            guard let seg = segByRep[rep] else { return nil }
            return ARSkeletonBuilder.buildClip(
                repType: type, repIndex: rep,
                startSec: seg.start, endSec: seg.end,
                score: scoreByRep[rep] ?? overallScore,
                tips: tips, allFrames: session.frames)
        }

        var clips: [ARRepClip] = []
        if bestRep == worstRep {
            // 只切出一下：依分數決定它算 best 還是 worst。
            let s = scoreByRep[bestRep] ?? overallScore
            let type = s >= 70 ? "best" : "worst"
            if let c = makeClip(rep: bestRep, type: type,
                                tips: type == "best" ? bestTips : worstTips) {
                clips = [c]
            }
        } else {
            if let b = makeClip(rep: bestRep,  type: "best",  tips: bestTips)  { clips.append(b) }
            if let w = makeClip(rep: worstRep, type: "worst", tips: worstTips) { clips.append(w) }
        }

        guard clips.contains(where: { !$0.frames.isEmpty }) else {
            print("[PoseAnalyzer] ⚠️ showARPlayback：切不出有骨架的片段，略過。")
            return
        }

        let payload = ARPlaybackPayload(videoURL: session.videoURL,
                                        videoSize: session.videoSize,
                                        exerciseName: exerciseName,
                                        overallScore: overallScore,
                                        clips: clips)
        presentARPlayback(payload)
    }

    /// 把後端 feedback 轉成教練提示。
    /// - positive=true：取分數最高的一條當「教練回饋」。
    /// - positive=false：取需改善（fair / needs_work）的前 3 條當「重點修正」。
    private static func buildTips(from feedback: [[String: Any]], positive: Bool) -> [ARCoachTip] {
        func toTip(_ d: [String: Any]) -> ARCoachTip {
            ARCoachTip(metric:  (d["title"] as? String) ?? "動作",
                       message: (d["desc"]  as? String) ?? "",
                       action:  (d["fix"]   as? String) ?? "",
                       level:   (d["level"] as? String) ?? "fair")
        }
        if positive {
            // feedback 由後端依分數低→高排序，最後一條分數最高。
            return feedback.last.map { [toTip($0)] } ?? []
        }
        let needWork = feedback.filter {
            let lv = ($0["level"] as? String) ?? ""
            return lv == "fair" || lv == "needs_work"
        }
        return Array((needWork.isEmpty ? feedback : needWork).prefix(3)).map(toTip)
    }

    /// 全螢幕彈出 SwiftUI 的 ARPlaybackView（用 UIHostingController 包起來）。
    private func presentARPlayback(_ payload: ARPlaybackPayload) {
        DispatchQueue.main.async {
            guard let presenter = Self.topViewController() else {
                print("[PoseAnalyzer] ⚠️ 找不到可呈現 AR 回放的畫面。")
                return
            }
            // weak 變數先宣告、後賦值：關閉 closure 捕捉它，避免 host ↔ rootView 互相強引用。
            weak var weakHost: UIHostingController<ARPlaybackView>?
            let host = UIHostingController(
                rootView: ARPlaybackView(payload: payload, onClose: {
                    weakHost?.dismiss(animated: true)
                }))
            weakHost = host
            host.modalPresentationStyle = .fullScreen
            host.modalTransitionStyle = .crossDissolve
            presenter.present(host, animated: true)
            print("[PoseAnalyzer] ▶️ 開啟 AR 動作回放（\(payload.clips.count) 個片段）")
        }
    }

    // MARK: 數值解析小工具（JSON 來的數字可能是 Int / Double / NSNumber / String）

    //  ⚠️ JS 傳來的資料不可信：Double("nan") / "inf" 會變成非有限值，
    //     之後 Int(...) 轉換會直接讓 App 閃退 —— 一律只收有限值。
    fileprivate static func numeric(_ any: Any?) -> Double? {
        let v: Double?
        switch any {
        case let d as Double:   v = d
        case let i as Int:      v = Double(i)
        case let n as NSNumber: v = n.doubleValue
        case let s as String:   v = Double(s)
        default:                v = nil
        }
        guard let x = v, x.isFinite else { return nil }
        return x
    }

    fileprivate static func intValue(_ any: Any?) -> Int? {
        switch any {
        case let i as Int:      return i
        case let n as NSNumber:
            let d = n.doubleValue
            guard d.isFinite, abs(d) < 1_000_000_000 else { return nil }
            return Int(d)
        case let d as Double:
            guard d.isFinite, abs(d) < 1_000_000_000 else { return nil }   // Int(NaN) 會閃退
            return Int(d)
        case let s as String:   return Int(s)
        default:                return nil
        }
    }
}
