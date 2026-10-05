//
//  PoseFeatureExtractors.swift
//  混合邊緣運算遷移 — Phase 3：特徵擷取（Swift 版）
//
//  ───────────────────────────────────────────────────────────────────────────
//  這個檔案是 frontend/src/utils/poseFeatureExtractors.js 的 Swift 移植版，
//  而那支 JS 本身又是 backend/core/multi_exercise.py 的完整翻譯。
//
//  每個 extractor 吃 MediaPipe 的 worldLandmarks（3D world 座標，給幾何計算）
//  與 landmarks（正規化座標，取 visibility 做門檻判斷），逐幀回傳 7 維特徵向量。
//
//  支援動作：lat_pulldown / squat / deadlift / bench_press / overhead_press / barbell_row
//
//  翻譯原則：
//   - 幾何計算用 simd（simd_float3 / simd_dot / simd_length）求效能。
//   - 嚴格保留 JS 的防呆：1e-6 epsilon、acos 前 clamp(-1,1)、偵測不到時填 Float.nan。
//   - SlidingVariance 是帶內部狀態的滑動方差器，對應 JS 的 closure 狀態。
//   - extractor 是有狀態的物件，必須「依影格順序」逐幀呼叫 extract(...)。
//  ───────────────────────────────────────────────────────────────────────────

import Foundation
import simd
import MediaPipeTasksVision

// MARK: - 幾何工具（對應 JS 的 calculateAngle / vectorAngleDeg / torsoLeanAngle / midPoint）

/// 三點夾角（度）。b 為頂點。對應 JS calculateAngle。
fileprivate func calculateAngle(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ c: SIMD3<Float>) -> Float {
    let ba = a - b
    let bc = c - b
    let magBA = simd_length(ba) + 1e-6
    let magBC = simd_length(bc) + 1e-6
    let cosine = max(-1, min(1, simd_dot(ba, bc) / (magBA * magBC)))
    return acos(cosine) * 180 / .pi
}

/// 兩向量夾角（度）。對應 JS vectorAngleDeg。
fileprivate func vectorAngleDeg(_ v1: SIMD3<Float>, _ v2: SIMD3<Float>) -> Float {
    let mag1 = simd_length(v1) + 1e-6
    let mag2 = simd_length(v2) + 1e-6
    let u1 = v1 / mag1
    let u2 = v2 / mag2
    let dot = max(-1, min(1, simd_dot(u1, u2)))
    return acos(dot) * 180 / .pi
}

/// 軀幹相對垂直線 [0,-1,0] 的傾斜角度。對應 JS torsoLeanAngle。
fileprivate func torsoLeanAngle(hip: SIMD3<Float>, shoulder: SIMD3<Float>) -> Float {
    return vectorAngleDeg(shoulder - hip, SIMD3<Float>(0, -1, 0))
}

/// 兩點中點。對應 JS midPoint。
fileprivate func midPoint(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> SIMD3<Float> {
    return (a + b) * 0.5
}

/// 兩點 3D 距離。對應 JS vecNorm。
fileprivate func vecNorm(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
    return simd_length(a - b)
}

// MARK: - 滑動方差器（對應 JS class SlidingVariance）

fileprivate final class SlidingVariance {
    private let maxLen: Int
    private var buffer: [Float] = []

    init(maxLen: Int) {
        self.maxLen = max(1, maxLen)
    }

    func push(_ v: Float) {
        buffer.append(v)
        if buffer.count > maxLen { buffer.removeFirst() }
    }

    /// 母體方差。資料少於 2 筆時回傳 0（與 JS 一致）。
    var variance: Float {
        guard buffer.count >= 2 else { return 0 }
        let n = Float(buffer.count)
        let mean = buffer.reduce(0, +) / n
        return buffer.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / n
    }

    var last: Float { buffer.last ?? 0 }
    var first: Float { buffer.first ?? 0 }
    var count: Int { buffer.count }
}

// MARK: - MediaPipe 33 點骨架索引

fileprivate enum LM {
    static let nose = 0
    static let lShoulder = 11, rShoulder = 12
    static let lElbow = 13, rElbow = 14
    static let lWrist = 15, rWrist = 16
    static let lHip = 23, rHip = 24
    static let lKnee = 25, rKnee = 26
    static let lAnkle = 27, rAnkle = 28
}

/// 取某索引的 3D world 座標。
fileprivate func worldPoint(_ w: [Landmark], _ i: Int) -> SIMD3<Float> {
    let p = w[i]
    return SIMD3<Float>(p.x, p.y, p.z)
}

/// 取某索引的 visibility（取自 image landmarks，對應 JS 用 il[idx].visibility）。
fileprivate func visibilityOf(_ image: [NormalizedLandmark], _ i: Int) -> Float {
    return image[i].visibility?.floatValue ?? 0
}

// MARK: - 擷取器協定

/// 動作特徵擷取器。有內部狀態，必須依影格順序逐幀呼叫 extract。
protocol PoseFeatureExtractor: AnyObject {
    /// 回傳長度 7 的特徵向量；偵測不到的維度為 Float.nan。
    func extract(world: [Landmark], image: [NormalizedLandmark]) -> [Float]
}

/// 共用的輸入合法性檢查。
fileprivate func validFrame(_ world: [Landmark], _ image: [NormalizedLandmark]) -> Bool {
    return world.count >= 33 && image.count >= 33
}

// MARK: - 1. 滑輪下拉 Lat Pulldown

final class LatPulldownExtractor: PoseFeatureExtractor {
    private let bodyThr: Float = 0.20
    private let jointThr: Float = 0.20
    private let wristHist = SlidingVariance(maxLen: 2)
    private let comHist: SlidingVariance

    init(fps: Double) {
        comHist = SlidingVariance(maxLen: max(1, Int(fps / 2)))
    }

    func extract(world: [Landmark], image: [NormalizedLandmark]) -> [Float] {
        var fv = [Float](repeating: .nan, count: 7)
        guard validFrame(world, image) else { return fv }

        let ls = worldPoint(world, LM.lShoulder), le = worldPoint(world, LM.lElbow), lw = worldPoint(world, LM.lWrist)
        let rs = worldPoint(world, LM.rShoulder), re = worldPoint(world, LM.rElbow), rw = worldPoint(world, LM.rWrist)
        let lh = worldPoint(world, LM.lHip),      rh = worldPoint(world, LM.rHip)

        let lsv = visibilityOf(image, LM.lShoulder), rsv = visibilityOf(image, LM.rShoulder)
        let lev = visibilityOf(image, LM.lElbow),    rev = visibilityOf(image, LM.rElbow)
        let lwv = visibilityOf(image, LM.lWrist),    rwv = visibilityOf(image, LM.rWrist)
        let lhv = visibilityOf(image, LM.lHip),      rhv = visibilityOf(image, LM.rHip)

        // fv[0] 左手肘角度
        if lsv > jointThr && lev > jointThr && lwv > jointThr {
            fv[0] = calculateAngle(ls, le, lw)
        }
        // fv[1] 右手肘角度
        if rsv > jointThr && rev > jointThr && rwv > jointThr {
            fv[1] = calculateAngle(rs, re, rw)
        }
        // fv[2] 軀幹傾斜
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            fv[2] = torsoLeanAngle(hip: midPoint(lh, rh), shoulder: midPoint(ls, rs))
        }
        // fv[3] 節奏（手腕 Y 位移差）
        if lwv > jointThr && rwv > jointThr {
            wristHist.push((lw.y + rw.y) / 2)
            fv[3] = wristHist.count > 1 ? (wristHist.last - wristHist.first) : 0
        }
        // fv[4] 手肘對稱
        if !fv[0].isNaN && !fv[1].isNaN {
            fv[4] = abs(fv[0] - fv[1])
        }
        // fv[5] 穩定度（重心 X 方差）
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            let mh = midPoint(lh, rh), ms = midPoint(ls, rs)
            comHist.push((mh.x + ms.x) / 2)
            fv[5] = comHist.variance
        }
        // fv[6] 聳肩（肩 Y / 軀幹長）
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            let ms = midPoint(ls, rs), mh = midPoint(lh, rh)
            let tl = vecNorm(ms, mh)
            fv[6] = tl > 0.1 ? ms.y / tl : .nan
        }
        return fv
    }
}

// MARK: - 2. 深蹲 Squat

final class SquatExtractor: PoseFeatureExtractor {
    // 門檻調降 0.75/0.65 → 0.45/0.35：原值太嚴，腳踝稍微低可見度
    // 就讓膝角特徵整欄 NaN，連帶後端計次訊號失效。與 JS / 後端側面門檻一致。
    private let bodyThr: Float = 0.45
    private let jointThr: Float = 0.35
    private let comHist: SlidingVariance

    init(fps: Double) {
        comHist = SlidingVariance(maxLen: max(1, Int(fps / 2)))
    }

    func extract(world: [Landmark], image: [NormalizedLandmark]) -> [Float] {
        var fv = [Float](repeating: .nan, count: 7)
        guard validFrame(world, image) else { return fv }

        let ls = worldPoint(world, LM.lShoulder), rs = worldPoint(world, LM.rShoulder)
        let lh = worldPoint(world, LM.lHip),      rh = worldPoint(world, LM.rHip)
        let lk = worldPoint(world, LM.lKnee),     rk = worldPoint(world, LM.rKnee)
        let la = worldPoint(world, LM.lAnkle),    ra = worldPoint(world, LM.rAnkle)

        let lsv = visibilityOf(image, LM.lShoulder), rsv = visibilityOf(image, LM.rShoulder)
        let lhv = visibilityOf(image, LM.lHip),      rhv = visibilityOf(image, LM.rHip)
        let lkv = visibilityOf(image, LM.lKnee),     rkv = visibilityOf(image, LM.rKnee)
        let lav = visibilityOf(image, LM.lAnkle),    rav = visibilityOf(image, LM.rAnkle)

        // fv[0] 左膝角度
        if lhv > jointThr && lkv > jointThr && lav > jointThr {
            fv[0] = calculateAngle(lh, lk, la)
        }
        // fv[1] 右膝角度
        if rhv > jointThr && rkv > jointThr && rav > jointThr {
            fv[1] = calculateAngle(rh, rk, ra)
        }
        // fv[2] 軀幹傾斜
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            fv[2] = torsoLeanAngle(hip: midPoint(lh, rh), shoulder: midPoint(ls, rs))
        }
        // fv[3] 髖部深度
        if lhv > jointThr && lkv > jointThr {
            let femur = abs(lh.y - lk.y) + 1e-6
            fv[3] = (lh.y - lk.y) / femur
        }
        // fv[4] 膝蓋對稱
        if !fv[0].isNaN && !fv[1].isNaN {
            fv[4] = abs(fv[0] - fv[1])
        }
        // fv[5] 穩定度
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            let ms = midPoint(ls, rs), mh = midPoint(lh, rh)
            comHist.push((ms.x + mh.x) / 2)
            fv[5] = comHist.variance
        }
        // fv[6] 膝蓋內夾（Knee Valgus）
        if lkv > jointThr && rkv > jointThr && lav > jointThr && rav > jointThr && lhv > jointThr && rhv > jointThr {
            let hipW = abs(lh.x - rh.x) + 1e-6
            let kneeD = abs(lk.x - rk.x)
            let ankleD = abs(la.x - ra.x)
            fv[6] = abs(kneeD - ankleD) / hipW
        }
        return fv
    }
}

// MARK: - 3. 硬舉 Deadlift

final class DeadliftExtractor: PoseFeatureExtractor {
    private let bodyThr: Float = 0.45
    private let jointThr: Float = 0.35
    private let comHist: SlidingVariance

    init(fps: Double) {
        comHist = SlidingVariance(maxLen: max(1, Int(fps / 2)))
    }

    func extract(world: [Landmark], image: [NormalizedLandmark]) -> [Float] {
        var fv = [Float](repeating: .nan, count: 7)
        guard validFrame(world, image) else { return fv }

        let ls = worldPoint(world, LM.lShoulder), rs = worldPoint(world, LM.rShoulder)
        let lw = worldPoint(world, LM.lWrist)
        let lh = worldPoint(world, LM.lHip),   rh = worldPoint(world, LM.rHip)
        let lk = worldPoint(world, LM.lKnee),  rk = worldPoint(world, LM.rKnee)
        let la = worldPoint(world, LM.lAnkle), ra = worldPoint(world, LM.rAnkle)

        let lsv = visibilityOf(image, LM.lShoulder), rsv = visibilityOf(image, LM.rShoulder)
        let lwv = visibilityOf(image, LM.lWrist)
        let lhv = visibilityOf(image, LM.lHip),      rhv = visibilityOf(image, LM.rHip)
        let lkv = visibilityOf(image, LM.lKnee),     rkv = visibilityOf(image, LM.rKnee)
        let lav = visibilityOf(image, LM.lAnkle),    rav = visibilityOf(image, LM.rAnkle)

        // fv[0] 髖鉸鏈（軀幹傾斜）
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            fv[0] = torsoLeanAngle(hip: midPoint(lh, rh), shoulder: midPoint(ls, rs))
        }
        // fv[1] 左膝角度
        if lhv > jointThr && lkv > jointThr && lav > jointThr {
            fv[1] = calculateAngle(lh, lk, la)
        }
        // fv[2] 右膝角度
        if rhv > jointThr && rkv > jointThr && rav > jointThr {
            fv[2] = calculateAngle(rh, rk, ra)
        }
        // fv[3] 背部平直度（肩相對 髖-踝 連線的偏移，2D x/y）
        if lsv > jointThr && lhv > jointThr && lav > jointThr {
            let hipV = lh - la
            let shV = ls - la
            let hipMag2 = simd_dot(hipV, hipV) + 1e-6
            let proj = simd_dot(shV, hipV) / hipMag2
            let cx = la.x + proj * hipV.x
            let cy = la.y + proj * hipV.y
            fv[3] = sqrt((ls.x - cx) * (ls.x - cx) + (ls.y - cy) * (ls.y - cy))
        }
        // fv[4] 膝蓋對稱
        if !fv[1].isNaN && !fv[2].isNaN {
            fv[4] = abs(fv[1] - fv[2])
        }
        // fv[5] 穩定度
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            let ms = midPoint(ls, rs), mh = midPoint(lh, rh)
            comHist.push((ms.x + mh.x) / 2)
            fv[5] = comHist.variance
        }
        // fv[6] 槓鈴路徑（手腕-肩 X 距離）
        if lwv > jointThr && lsv > jointThr {
            fv[6] = abs(lw.x - ls.x)
        }
        return fv
    }
}

// MARK: - 4. 臥推 Bench Press

final class BenchPressExtractor: PoseFeatureExtractor {
    private let bodyThr: Float = 0.45
    private let jointThr: Float = 0.35
    private let wristYHist = SlidingVariance(maxLen: 3)

    init(fps: Double) {}

    func extract(world: [Landmark], image: [NormalizedLandmark]) -> [Float] {
        var fv = [Float](repeating: .nan, count: 7)
        guard validFrame(world, image) else { return fv }

        let ls = worldPoint(world, LM.lShoulder), le = worldPoint(world, LM.lElbow), lw = worldPoint(world, LM.lWrist)
        let rs = worldPoint(world, LM.rShoulder), re = worldPoint(world, LM.rElbow), rw = worldPoint(world, LM.rWrist)
        let lh = worldPoint(world, LM.lHip),      rh = worldPoint(world, LM.rHip)

        let lsv = visibilityOf(image, LM.lShoulder), rsv = visibilityOf(image, LM.rShoulder)
        let lev = visibilityOf(image, LM.lElbow),    rev = visibilityOf(image, LM.rElbow)
        let lwv = visibilityOf(image, LM.lWrist),    rwv = visibilityOf(image, LM.rWrist)
        let lhv = visibilityOf(image, LM.lHip),      rhv = visibilityOf(image, LM.rHip)

        // fv[0] 左手肘角度
        if lsv > jointThr && lev > jointThr && lwv > jointThr {
            fv[0] = calculateAngle(ls, le, lw)
        }
        // fv[1] 右手肘角度
        if rsv > jointThr && rev > jointThr && rwv > jointThr {
            fv[1] = calculateAngle(rs, re, rw)
        }
        // fv[2] 手肘外擴（上臂與軀幹夾角）
        if lsv > bodyThr && rsv > bodyThr && lev > bodyThr && rev > bodyThr {
            let ms = midPoint(ls, rs)
            let mh = (lhv > bodyThr) ? lh : ls
            let mhR = (rhv > bodyThr) ? rh : rs
            let mhMid = midPoint(mh, mhR)
            let torsoV = ms - mhMid
            let uaL = le - ls
            let uaR = re - rs
            fv[2] = (vectorAngleDeg(uaL, torsoV) + vectorAngleDeg(uaR, torsoV)) / 2
        }
        // fv[3] 手腕對齊（手肘 Y - 手腕 Y）
        if lev > jointThr && lwv > jointThr && rev > jointThr && rwv > jointThr {
            fv[3] = ((le.y - lw.y) + (re.y - rw.y)) / 2
        }
        // fv[4] 手肘對稱
        if !fv[0].isNaN && !fv[1].isNaN {
            fv[4] = abs(fv[0] - fv[1])
        }
        // fv[5] 槓鈴路徑（手腕 Y 方差）
        if lwv > jointThr && rwv > jointThr {
            wristYHist.push((lw.y + rw.y) / 2)
            fv[5] = wristYHist.variance
        }
        // fv[6] 肩胛後收
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            let ms = midPoint(ls, rs), mh = midPoint(lh, rh)
            let tl = abs(ms.y - mh.y) + 1e-6
            fv[6] = (ms.y - mh.y) / tl
        }
        return fv
    }
}

// MARK: - 5. 肩推 Overhead Press

final class OverheadPressExtractor: PoseFeatureExtractor {
    private let bodyThr: Float = 0.45
    private let jointThr: Float = 0.35
    private let comHist: SlidingVariance

    init(fps: Double) {
        comHist = SlidingVariance(maxLen: max(1, Int(fps / 2)))
    }

    func extract(world: [Landmark], image: [NormalizedLandmark]) -> [Float] {
        var fv = [Float](repeating: .nan, count: 7)
        guard validFrame(world, image) else { return fv }

        let ls = worldPoint(world, LM.lShoulder), le = worldPoint(world, LM.lElbow), lw = worldPoint(world, LM.lWrist)
        let rs = worldPoint(world, LM.rShoulder), re = worldPoint(world, LM.rElbow), rw = worldPoint(world, LM.rWrist)
        let lh = worldPoint(world, LM.lHip),      rh = worldPoint(world, LM.rHip)

        let lsv = visibilityOf(image, LM.lShoulder), rsv = visibilityOf(image, LM.rShoulder)
        let lev = visibilityOf(image, LM.lElbow),    rev = visibilityOf(image, LM.rElbow)
        let lwv = visibilityOf(image, LM.lWrist),    rwv = visibilityOf(image, LM.rWrist)
        let lhv = visibilityOf(image, LM.lHip),      rhv = visibilityOf(image, LM.rHip)

        // fv[0] 左手肘角度
        if lsv > jointThr && lev > jointThr && lwv > jointThr {
            fv[0] = calculateAngle(ls, le, lw)
        }
        // fv[1] 右手肘角度
        if rsv > jointThr && rev > jointThr && rwv > jointThr {
            fv[1] = calculateAngle(rs, re, rw)
        }
        // fv[2] 軀幹傾斜
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            fv[2] = torsoLeanAngle(hip: midPoint(lh, rh), shoulder: midPoint(ls, rs))
        }
        // fv[3] 左臂過頭程度（肩-腕高度 / 軀幹長）
        if lsv > jointThr && lwv > jointThr {
            let torsoL = abs(ls.y - (lhv > bodyThr ? lh.y : ls.y - 0.3)) + 1e-6
            fv[3] = (ls.y - lw.y) / torsoL
        }
        // fv[4] 右臂過頭程度
        if rsv > jointThr && rwv > jointThr {
            let torsoL2 = abs(rs.y - (rhv > bodyThr ? rh.y : rs.y - 0.3)) + 1e-6
            fv[4] = (rs.y - rw.y) / torsoL2
        }
        // fv[5] 手肘對稱
        if !fv[0].isNaN && !fv[1].isNaN {
            fv[5] = abs(fv[0] - fv[1])
        }
        // fv[6] 穩定度
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            let ms = midPoint(ls, rs), mh = midPoint(lh, rh)
            comHist.push((ms.x + mh.x) / 2)
            fv[6] = comHist.variance
        }
        return fv
    }
}

// MARK: - 6. 划船 Barbell Row

final class BarbellRowExtractor: PoseFeatureExtractor {
    private let bodyThr: Float = 0.45
    private let jointThr: Float = 0.35
    private let comHist: SlidingVariance
    private let hipYHist: SlidingVariance

    init(fps: Double) {
        let win = max(1, Int(fps / 2))
        comHist = SlidingVariance(maxLen: win)
        hipYHist = SlidingVariance(maxLen: win)
    }

    func extract(world: [Landmark], image: [NormalizedLandmark]) -> [Float] {
        var fv = [Float](repeating: .nan, count: 7)
        guard validFrame(world, image) else { return fv }

        let ls = worldPoint(world, LM.lShoulder), le = worldPoint(world, LM.lElbow), lw = worldPoint(world, LM.lWrist)
        let rs = worldPoint(world, LM.rShoulder), re = worldPoint(world, LM.rElbow), rw = worldPoint(world, LM.rWrist)
        let lh = worldPoint(world, LM.lHip),      rh = worldPoint(world, LM.rHip)

        let lsv = visibilityOf(image, LM.lShoulder), rsv = visibilityOf(image, LM.rShoulder)
        let lev = visibilityOf(image, LM.lElbow),    rev = visibilityOf(image, LM.rElbow)
        let lwv = visibilityOf(image, LM.lWrist),    rwv = visibilityOf(image, LM.rWrist)
        let lhv = visibilityOf(image, LM.lHip),      rhv = visibilityOf(image, LM.rHip)

        // fv[0] 左手肘角度
        if lsv > jointThr && lev > jointThr && lwv > jointThr {
            fv[0] = calculateAngle(ls, le, lw)
        }
        // fv[1] 右手肘角度
        if rsv > jointThr && rev > jointThr && rwv > jointThr {
            fv[1] = calculateAngle(rs, re, rw)
        }
        // fv[2] 軀幹鉸鏈
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            fv[2] = torsoLeanAngle(hip: midPoint(lh, rh), shoulder: midPoint(ls, rs))
        }
        // fv[3] 髖部穩定（髖 Y 方差）
        if lhv > bodyThr && rhv > bodyThr {
            hipYHist.push((lh.y + rh.y) / 2)
            fv[3] = hipYHist.variance
        }
        // fv[4] 手肘對稱
        if !fv[0].isNaN && !fv[1].isNaN {
            fv[4] = abs(fv[0] - fv[1])
        }
        // fv[5] 聳肩（肩 Y / 軀幹長）
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            let ms = midPoint(ls, rs), mh = midPoint(lh, rh)
            let tl = vecNorm(ms, mh)
            fv[5] = tl > 0.1 ? ms.y / tl : .nan
        }
        // fv[6] 穩定度（重心 X 方差）
        if lsv > bodyThr && rsv > bodyThr && lhv > bodyThr && rhv > bodyThr {
            let ms = midPoint(ls, rs), mh = midPoint(lh, rh)
            comHist.push((ms.x + mh.x) / 2)
            fv[6] = comHist.variance
        }
        return fv
    }
}

// MARK: - 工廠

enum PoseFeatureExtractors {

    /// 支援的動作 key。
    static let supported: Set<String> = [
        "lat_pulldown", "squat", "deadlift",
        "bench_press", "overhead_press", "barbell_row"
    ]

    /// 依動作 key 建立對應的擷取器。fps 請傳「實際送進擷取器的取樣幀率」
    /// （Phase 2 已把影片動態跳幀壓到約 15fps，所以這裡傳的是壓過後的有效幀率）。
    static func make(exerciseKey: String, fps: Double) -> PoseFeatureExtractor? {
        switch exerciseKey {
        case "lat_pulldown":   return LatPulldownExtractor(fps: fps)
        case "squat":          return SquatExtractor(fps: fps)
        case "deadlift":       return DeadliftExtractor(fps: fps)
        case "bench_press":    return BenchPressExtractor(fps: fps)
        case "overhead_press": return OverheadPressExtractor(fps: fps)
        case "barbell_row":    return BarbellRowExtractor(fps: fps)
        default:               return nil
        }
    }
}
