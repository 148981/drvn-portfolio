//
//  ARPlaybackView.swift
//  混合邊緣運算遷移 — AR 動作回放：前端渲染架構（Stage 2，SwiftUI 疊合播放器）
//
//  ───────────────────────────────────────────────────────────────────────────
//  取代「後端用 OpenCV 畫骨架再壓 MP4」的舊做法。這裡：
//    · AVPlayer 播放使用者的原始影片（沒有任何後製、零轉檔）。
//    · addPeriodicTimeObserver 監聽播放進度。
//    · 依當前秒數，從 ARRepClip 的逐幀骨架做「線性插值」取出該瞬間的姿勢，
//      用 SwiftUI Canvas 即時疊合畫在影片上。
//    · best / worst 兩下可即時切換對照。
//
//  ── 對位正確性（三個技術坑都處理掉了）─────────────────────────────────────
//   1. 正規化座標基準：MediaPipe 的 x,y 是 0~1，相對「轉正後影像」。這裡用
//      contentRect(in:videoSize:) 算出影片在畫面上 aspect-fit 後的真實內容矩形，
//      骨架座標乘上這個矩形 —— 與 AVPlayerLayer 的 .resizeAspect 完全同步，
//      不會發生「人往右、骨架往左」或「骨架小一號」的偏移。
//   2. 幀數 / 時間戳對齊：每個 ARSkeletonFrame 都帶絕對影片秒數 timeSec；
//      播放器看的是秒數，直接拿來插值，不靠「第幾幀」。
//   3. 跳幀平滑：MediaPipe 端壓到 ~15fps，這裡逐幀做線性插值補回平滑度，
//      不依賴 withAnimation 也不會頓。
//  ───────────────────────────────────────────────────────────────────────────

import SwiftUI
import AVFoundation
import Combine

// MARK: - 設計語彙（Swiss Minimalism 配色）

private enum ARTheme {
    static let ink       = Color(red: 0.055, green: 0.059, blue: 0.067)   // #0E0F11 近黑底
    static let surface   = Color(red: 0.110, green: 0.118, blue: 0.133)   // 抬升面（Claymorphism 用）
    static let offWhite  = Color(red: 0.949, green: 0.945, blue: 0.933)   // #F2F1EE
    static let muted     = Color(red: 0.949, green: 0.945, blue: 0.933).opacity(0.45)
    static let coral     = Color(red: 1.0,   green: 0.353, blue: 0.235)   // #FF5A3C
    static let jade      = Color(red: 0.357, green: 0.878, blue: 0.722)   // #5BE0B8
    static let amber     = Color(red: 1.0,   green: 0.741, blue: 0.286)   // #FFBD49
    static let sky       = Color(red: 0.435, green: 0.706, blue: 1.0)     // #6FB4FF

    /// 教練提示嚴重度 → 配色。
    static func tone(for level: String) -> Color {
        switch level {
        case "excellent": return jade
        case "good":      return sky
        case "fair":      return amber
        default:          return coral          // needs_work
        }
    }
}

// MARK: - 骨架插值（補回 MediaPipe 跳幀造成的不平滑）

private struct InterpolatedJoint {
    let pos: CGPoint        // 0~1 正規化座標
    let vis: Float
}

@available(iOS 17.0, *)   // 用到 ARSkeletonBuilder.keyJoints（iOS 17 受限）
extension ARRepClip {

    /// 取得指定「絕對影片秒數」的插值骨架。
    /// 回傳 [關節id: InterpolatedJoint]，對 ~15fps 偵測做線性插值補幀。
    /// fileprivate：回傳型別 InterpolatedJoint 為本檔私有。
    fileprivate func interpolatedJoints(atVideoTime t: Double) -> [Int: InterpolatedJoint] {
        guard let first = frames.first, let last = frames.last else { return [:] }
        if t <= first.timeSec { return Self.snapshot(first) }
        if t >= last.timeSec  { return Self.snapshot(last) }

        // 片段短（數十幀），線性掃描即可。
        for i in 1..<frames.count {
            let hi = frames[i]
            guard t <= hi.timeSec else { continue }
            let lo = frames[i - 1]
            let span = hi.timeSec - lo.timeSec
            let alpha = span > 1e-6 ? Float((t - lo.timeSec) / span) : 0
            return Self.blend(lo, hi, alpha)
        }
        return Self.snapshot(last)
    }

    private static func snapshot(_ f: ARSkeletonFrame) -> [Int: InterpolatedJoint] {
        var m: [Int: InterpolatedJoint] = [:]
        for j in f.joints {
            m[j.id] = InterpolatedJoint(pos: CGPoint(x: CGFloat(j.x), y: CGFloat(j.y)),
                                        vis: j.visibility)
        }
        return m
    }

    /// 兩幀之間逐關節線性插值。alpha ∈ [0,1]。
    private static func blend(_ lo: ARSkeletonFrame,
                              _ hi: ARSkeletonFrame,
                              _ alpha: Float) -> [Int: InterpolatedJoint] {
        let a = CGFloat(max(0, min(1, alpha)))
        var m: [Int: InterpolatedJoint] = [:]
        let loMap = Dictionary(uniqueKeysWithValues: lo.joints.map { ($0.id, $0) })
        let hiMap = Dictionary(uniqueKeysWithValues: hi.joints.map { ($0.id, $0) })
        for id in ARSkeletonBuilder.keyJoints {
            switch (loMap[id], hiMap[id]) {
            case let (.some(p), .some(q)):
                let x = CGFloat(p.x) + (CGFloat(q.x) - CGFloat(p.x)) * a
                let y = CGFloat(p.y) + (CGFloat(q.y) - CGFloat(p.y)) * a
                let v = p.visibility + (q.visibility - p.visibility) * Float(a)
                m[id] = InterpolatedJoint(pos: CGPoint(x: x, y: y), vis: v)
            case let (.some(p), .none):
                m[id] = InterpolatedJoint(pos: CGPoint(x: CGFloat(p.x), y: CGFloat(p.y)),
                                          vis: p.visibility)
            case let (.none, .some(q)):
                m[id] = InterpolatedJoint(pos: CGPoint(x: CGFloat(q.x), y: CGFloat(q.y)),
                                          vis: q.visibility)
            case (.none, .none):
                continue
            }
        }
        return m
    }
}

// MARK: - 播放引擎（AVPlayer + addPeriodicTimeObserver）

@available(iOS 17.0, *)
final class ARPlaybackEngine: ObservableObject {

    let player: AVPlayer
    let clips: [ARRepClip]

    /// 當前「絕對影片秒數」。
    @Published var currentTime: Double = 0
    @Published var isPlaying: Bool = true
    /// 目前回放的片段 index（對應 clips）。
    @Published var activeIndex: Int = 0

    private var timeObserver: Any?
    private var statusObs: NSKeyValueObservation?
    /// 時間觀察的間隔 —— 1/30 秒，骨架重畫夠細緻。
    private let tickInterval = CMTime(value: 1, timescale: 30)

    /// 使用者正在拖曳進度條。拖曳期間：暫停播放、時間觀察不要回寫 currentTime。
    /// 沒有這個旗標的話，播放頭每 1/30 秒就把 currentTime 蓋回去，
    /// 手指拖到哪都會被彈回播放位置 —— 看起來就是「進度條拉不動」。
    @Published var isScrubbing: Bool = false
    /// 拖曳開始前是否正在播放，放手後要還原。
    private var wasPlayingBeforeScrub: Bool = false

    var activeClip: ARRepClip { clips[min(activeIndex, clips.count - 1)] }

    init(videoURL: URL, clips: [ARRepClip]) {
        self.clips = clips
        let item = AVPlayerItem(url: videoURL)
        self.player = AVPlayer(playerItem: item)
        // 訓練影片回放預設靜音，避免打斷使用者正在聽的音樂。
        self.player.isMuted = true
        self.player.actionAtItemEnd = .pause

        addObserver()
        if let first = clips.first {
            currentTime = first.startTimeSec       // 先讓 UI 有正確起點
        }
    }

    deinit {
        if let token = timeObserver { player.removeTimeObserver(token) }
        statusObs?.invalidate()
    }

    private func addObserver() {
        timeObserver = player.addPeriodicTimeObserver(forInterval: tickInterval,
                                                      queue: .main) { [weak self] time in
            guard let self = self else { return }
            // 拖曳中一律不回寫 —— currentTime 這時候由手指決定，不是由播放頭決定。
            guard !self.isScrubbing else { return }
            let t = CMTimeGetSeconds(time)
            guard t.isFinite else { return }
            self.currentTime = t

            // 片段內循環播放：超過這一下的結尾就跳回開頭。
            let clip = self.activeClip
            if t >= clip.endTimeSec + 0.05 || t < clip.startTimeSec - 0.05 {
                self.seek(to: clip.startTimeSec)
            }
        }
    }

    // MARK: 控制

    func start() {
        // ⚠️ 第一次進來時 AVPlayerItem 還在載入，這時候 seek 會被丟掉、play 也不會真的開始，
        //   於是進度條拉不動；退出再進來因為資產已被快取才「突然正常」。
        //   所以要等 item 真的 readyToPlay 再做第一次 seek + play。
        if player.currentItem?.status == .readyToPlay {
            beginPlayback()
        } else {
            statusObs?.invalidate()
            statusObs = player.currentItem?.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                guard let self = self, item.status == .readyToPlay else { return }
                DispatchQueue.main.async {
                    self.statusObs?.invalidate()
                    self.statusObs = nil
                    self.beginPlayback()
                }
            }
        }
    }

    private func beginPlayback() {
        // 先跳到目前片段開頭，避免影片起點（0 秒）一閃才校正回來。
        seek(to: activeClip.startTimeSec)
        player.play()
        isPlaying = true
    }

    func togglePlay() {
        if isPlaying {
            player.pause()
        } else {
            // 播完停在尾端時，再按播放從這一下開頭重來。
            if currentTime >= activeClip.endTimeSec - 0.05 {
                seek(to: activeClip.startTimeSec)
            }
            player.play()
        }
        isPlaying.toggle()
    }

    func pause() {
        player.pause()
        isPlaying = false
    }

    /// 切換 best / worst 片段：跳到該片段開頭並播放。
    func select(index: Int) {
        guard index >= 0, index < clips.count, index != activeIndex else { return }
        activeIndex = index
        seek(to: clips[index].startTimeSec)
        player.play()
        isPlaying = true
    }

    // MARK: 進度條拖曳（三段式：開始 / 進行中 / 放手）

    func beginScrub() {
        guard !isScrubbing else { return }
        isScrubbing = true
        wasPlayingBeforeScrub = isPlaying
        player.pause()          // 拖曳時一定要停，否則播放頭會跟手指打架
        isPlaying = false
    }

    /// 在「目前片段」範圍內，依 0~1 比例跳轉（給進度條拖曳用）。
    func scrub(toFraction f: Double) {
        if !isScrubbing { beginScrub() }
        let clip = activeClip
        let span = clip.endTimeSec - clip.startTimeSec
        let target = clip.startTimeSec + max(0, min(1, f)) * span
        currentTime = target                      // UI 立刻跟手，不等 seek 完成
        // 拖曳中用「容許誤差」的快速 seek。逐格精確 seek（tolerance = .zero）
        // 一秒鐘幾十次會把 AVPlayer 塞爆，畫面就停在那裡不動。
        seek(to: target, exact: false)
    }

    func endScrub() {
        guard isScrubbing else { return }
        // 放手時才做一次精確 seek，確保停在正確的那一格。
        seek(to: currentTime, exact: true)
        isScrubbing = false
        if wasPlayingBeforeScrub {
            player.play()
            isPlaying = true
        }
    }

    private func seek(to seconds: Double, exact: Bool = true) {
        let t = CMTime(seconds: max(0, seconds), preferredTimescale: 600)
        if exact {
            player.seek(to: t, toleranceBefore: .zero, toleranceAfter: .zero)
        } else {
            let tol = CMTime(seconds: 0.05, preferredTimescale: 600)
            player.seek(to: t, toleranceBefore: tol, toleranceAfter: tol)
        }
        currentTime = seconds
    }

    /// 目前片段的播放進度 0~1。
    var clipProgress: Double {
        let clip = activeClip
        let span = clip.endTimeSec - clip.startTimeSec
        guard span > 1e-6 else { return 0 }
        return max(0, min(1, (currentTime - clip.startTimeSec) / span))
    }
}

// MARK: - AVPlayerLayer 包裝（自繪 UI，不要系統播放控制列）

@available(iOS 17.0, *)
private struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerContainerView {
        let view = PlayerContainerView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect      // 與骨架座標換算一致
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: PlayerContainerView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
    }
}

private final class PlayerContainerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

// MARK: - 主畫面

@available(iOS 17.0, *)
struct ARPlaybackView: View {

    let payload: ARPlaybackPayload
    let onClose: () -> Void

    @StateObject private var engine: ARPlaybackEngine
    @State private var showSkeleton = true

    init(payload: ARPlaybackPayload, onClose: @escaping () -> Void) {
        self.payload = payload
        self.onClose = onClose
        _engine = StateObject(wrappedValue: ARPlaybackEngine(videoURL: payload.videoURL,
                                                             clips: payload.clips))
    }

    private var clip: ARRepClip { engine.activeClip }
    private var accent: Color { clip.repType == "best" ? ARTheme.jade : ARTheme.coral }

    var body: some View {
        ZStack {
            ARTheme.ink.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                stage
                bottomPanel
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { engine.start() }
        .onDisappear { engine.pause() }
    }

    // MARK: 頂部列

    private var header: some View {
        HStack(alignment: .center) {
            // 關閉
            Button(action: { engine.pause(); onClose() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(ARTheme.offWhite)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(ARTheme.surface))
                    .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
            }

            Spacer()

            VStack(spacing: 2) {
                Text("AR 動作回放")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(2.6)
                    .foregroundColor(ARTheme.muted)
                Text(payload.exerciseName.isEmpty ? "動作分析" : payload.exerciseName)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(ARTheme.offWhite)
            }

            Spacer()

            // 骨架顯示開關
            Button(action: { withAnimation(.easeInOut(duration: 0.2)) { showSkeleton.toggle() } }) {
                Image(systemName: showSkeleton ? "eye.fill" : "eye.slash.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(showSkeleton ? ARTheme.ink : ARTheme.offWhite)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(showSkeleton ? accent : ARTheme.surface))
                    .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 14)
    }

    // MARK: 影片 + 骨架疊層

    private var stage: some View {
        GeometryReader { geo in
            let rect = Self.contentRect(in: geo.size, videoSize: payload.videoSize)

            ZStack {
                PlayerLayerView(player: engine.player)

                // 骨架疊層
                if showSkeleton {
                    Canvas { ctx, _ in
                        drawSkeleton(in: ctx, contentRect: rect)
                    }
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }

                // 四角取景框（與 App 內即時偵測畫面一致的視覺語彙）
                cornerBrackets(in: rect)

                // 分數徽章（Claymorphism）浮在左上
                VStack {
                    HStack {
                        scoreBadge
                        Spacer()
                    }
                    Spacer()
                    // best / worst 切換浮在底部中央
                    if payload.clips.count > 1 {
                        repToggle
                    }
                }
                .padding(14)
            }
        }
    }

    private func cornerBrackets(in rect: CGRect) -> some View {
        let len: CGFloat = 18
        let inset: CGFloat = 10
        return ZStack {
            ForEach(0..<4, id: \.self) { i in
                BracketShape(corner: i, length: len)
                    .stroke(ARTheme.offWhite.opacity(0.55), lineWidth: 1.5)
                    .frame(width: len, height: len)
                    .position(bracketPosition(i, in: rect, inset: inset))
            }
        }
        .allowsHitTesting(false)
    }

    private func bracketPosition(_ i: Int, in rect: CGRect, inset: CGFloat) -> CGPoint {
        let l: CGFloat = 9   // 半個 bracket
        switch i {
        case 0: return CGPoint(x: rect.minX + inset + l, y: rect.minY + inset + l)
        case 1: return CGPoint(x: rect.maxX - inset - l, y: rect.minY + inset + l)
        case 2: return CGPoint(x: rect.minX + inset + l, y: rect.maxY - inset - l)
        default: return CGPoint(x: rect.maxX - inset - l, y: rect.maxY - inset - l)
        }
    }

    private var scoreBadge: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(clip.repType == "best" ? "最佳" : "待加強")
                .font(.system(size: 8, weight: .heavy))
                .tracking(1.8)
                .foregroundColor(accent)
            // 分數作廢 / 非有限值 → 顯示「—」（Int(NaN) 會直接閃退，也不能把沒分數畫成 0）
            Text(clip.score.isFinite ? "\(Int(clip.score.rounded()))" : "—")
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .foregroundColor(ARTheme.offWhite)
                .monospacedDigit()
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 9)
        .clayCard(cornerRadius: 15)
    }

    private var repToggle: some View {
        HStack(spacing: 4) {
            ForEach(Array(payload.clips.enumerated()), id: \.offset) { idx, c in
                let on = engine.activeIndex == idx
                Button(action: {
                    withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                        engine.select(index: idx)
                    }
                }) {
                    Text(c.repType == "best" ? "最佳一下" : "待加強一下")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(on ? ARTheme.ink : ARTheme.offWhite.opacity(0.7))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(
                            Capsule().fill(on ? (c.repType == "best" ? ARTheme.jade : ARTheme.coral)
                                              : Color.clear)
                        )
                }
            }
        }
        .padding(4)
        .background(Capsule().fill(.ultraThinMaterial))
        .overlay(Capsule().stroke(Color.white.opacity(0.10), lineWidth: 1))
    }

    // MARK: 底部面板（transport + 教練提示）

    private var bottomPanel: some View {
        VStack(spacing: 14) {
            transportRow
            tipsPanel
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    private var transportRow: some View {
        HStack(spacing: 14) {
            Button(action: { engine.togglePlay() }) {
                Image(systemName: engine.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(ARTheme.ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(accent))
            }

            // 片段進度條（極簡細線）
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.12))
                        .frame(height: 4)
                    Capsule().fill(accent)
                        .frame(width: max(4, g.size.width * engine.clipProgress), height: 4)
                }
                .frame(maxHeight: .infinity, alignment: .center)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { v in
                            engine.scrub(toFraction: v.location.x / max(1, g.size.width))
                        }
                        .onEnded { v in
                            // 少了 onEnded 的話，拖完不會回到精確幀、也不會恢復播放
                            engine.scrub(toFraction: v.location.x / max(1, g.size.width))
                            engine.endScrub()
                        }
                )
            }
            .frame(height: 30)

            Text(timeLabel)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(ARTheme.muted)
        }
    }

    private var timeLabel: String {
        let c = clip
        let cur = max(0, engine.currentTime - c.startTimeSec)
        let total = max(0, c.endTimeSec - c.startTimeSec)
        return String(format: "%.1f / %.1fs", cur, total)
    }

    private var tipsPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Circle().fill(accent).frame(width: 6, height: 6)
                Text(clip.repType == "best" ? "教練回饋" : "重點修正")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(2)
                    .foregroundColor(ARTheme.muted)
            }

            if clip.tips.isEmpty {
                Text("這一下沒有偵測到明顯問題。")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(ARTheme.offWhite.opacity(0.8))
            } else {
                ForEach(clip.tips) { tip in
                    tipRow(tip)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .animation(.easeInOut(duration: 0.25), value: clip.id)
    }

    private func tipRow(_ tip: ARCoachTip) -> some View {
        let tone = ARTheme.tone(for: tip.level)
        return HStack(alignment: .top, spacing: 11) {
            RoundedRectangle(cornerRadius: 2)
                .fill(tone)
                .frame(width: 3)
                .padding(.vertical, 1)
            VStack(alignment: .leading, spacing: 3) {
                Text(tip.metric)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(ARTheme.offWhite)
                Text(tip.message)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(ARTheme.offWhite.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .top, spacing: 5) {
                    Image(systemName: "arrow.turn.down.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(tone)
                        .padding(.top, 2)
                    Text(tip.action)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(tone)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 3)
        .transition(.opacity.combined(with: .move(edge: .leading)))
    }

    // MARK: 骨架繪製

    private func drawSkeleton(in ctx: GraphicsContext, contentRect rect: CGRect) {
        guard rect.width > 1, rect.height > 1 else { return }
        let joints = clip.interpolatedJoints(atVideoTime: engine.currentTime)
        let threshold = ARSkeletonBuilder.visibilityThreshold

        // 正規化座標 → 畫面實際座標。低 visibility 回 nil（不畫）。
        func point(_ id: Int) -> CGPoint? {
            guard let j = joints[id], j.vis >= threshold else { return nil }
            return CGPoint(x: rect.minX + j.pos.x * rect.width,
                           y: rect.minY + j.pos.y * rect.height)
        }

        // 頭部淡連線
        for (a, b) in ARSkeletonBuilder.headBones {
            guard let pa = point(a), let pb = point(b) else { continue }
            var path = Path(); path.move(to: pa); path.addLine(to: pb)
            ctx.stroke(path, with: .color(ARTheme.offWhite.opacity(0.30)),
                       style: StrokeStyle(lineWidth: 2, lineCap: .round))
        }

        // 骨架連線 —— 先畫一層寬的半透明光暈，再疊清晰的主線。
        for (a, b) in ARSkeletonBuilder.bones {
            guard let pa = point(a), let pb = point(b) else { continue }
            var path = Path(); path.move(to: pa); path.addLine(to: pb)
            ctx.stroke(path, with: .color(accent.opacity(0.28)),
                       style: StrokeStyle(lineWidth: 9, lineCap: .round))
            ctx.stroke(path, with: .color(accent),
                       style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
        }

        // 關節點
        for id in ARSkeletonBuilder.keyJoints {
            guard let p = point(id) else { continue }
            let r: CGFloat = (id == 0) ? 6 : 4.5
            let glow = CGRect(x: p.x - r - 3, y: p.y - r - 3,
                              width: (r + 3) * 2, height: (r + 3) * 2)
            ctx.fill(Path(ellipseIn: glow), with: .color(accent.opacity(0.22)))
            let dot = CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)
            ctx.fill(Path(ellipseIn: dot), with: .color(ARTheme.offWhite))
            ctx.stroke(Path(ellipseIn: dot), with: .color(accent),
                       style: StrokeStyle(lineWidth: 2))
        }
    }

    // MARK: 座標換算

    /// 算出影片在容器內 aspect-fit（.resizeAspect）後的真實內容矩形。
    /// 這是「骨架對得準」的關鍵 —— 與 AVPlayerLayer 的 letterbox 完全一致。
    static func contentRect(in container: CGSize, videoSize: CGSize) -> CGRect {
        guard container.width > 0, container.height > 0,
              videoSize.width > 0, videoSize.height > 0 else {
            return CGRect(origin: .zero, size: container)
        }
        let videoAspect = videoSize.width / videoSize.height
        let containerAspect = container.width / container.height
        var w = container.width
        var h = container.height
        if videoAspect > containerAspect {
            // 影片較寬 → 以寬為準，上下留黑邊
            w = container.width
            h = container.width / videoAspect
        } else {
            // 影片較高 → 以高為準，左右留黑邊
            h = container.height
            w = container.height * videoAspect
        }
        return CGRect(x: (container.width - w) / 2,
                      y: (container.height - h) / 2,
                      width: w, height: h)
    }
}

// MARK: - 四角取景框形狀

private struct BracketShape: Shape {
    /// 0=左上 1=右上 2=左下 3=右下
    let corner: Int
    let length: CGFloat

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let l = length
        switch corner {
        case 0:
            p.move(to: CGPoint(x: 0, y: l)); p.addLine(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: l, y: 0))
        case 1:
            p.move(to: CGPoint(x: rect.width - l, y: 0)); p.addLine(to: CGPoint(x: rect.width, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: l))
        case 2:
            p.move(to: CGPoint(x: 0, y: rect.height - l)); p.addLine(to: CGPoint(x: 0, y: rect.height))
            p.addLine(to: CGPoint(x: l, y: rect.height))
        default:
            p.move(to: CGPoint(x: rect.width - l, y: rect.height))
            p.addLine(to: CGPoint(x: rect.width, y: rect.height))
            p.addLine(to: CGPoint(x: rect.width, y: rect.height - l))
        }
        return p
    }
}

// MARK: - Claymorphism 容器修飾子

private struct ClayCard: ViewModifier {
    let cornerRadius: CGFloat
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(ARTheme.surface)
                    .shadow(color: .black.opacity(0.55), radius: 12, x: 0, y: 8)
            )
            .overlay(
                // 上緣亮、下緣暗 → 輕微 3D 浮起的黏土質感
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [Color.white.opacity(0.16),
                                     Color.white.opacity(0.02),
                                     Color.black.opacity(0.30)],
                            startPoint: .top, endPoint: .bottom),
                        lineWidth: 1)
            )
    }
}

private extension View {
    func clayCard(cornerRadius: CGFloat) -> some View {
        modifier(ClayCard(cornerRadius: cornerRadius))
    }
}
