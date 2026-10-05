#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
estimate_view_angle.py — 用 2D 肩＋髖投影縮短率，估計每支影片的「影像估計相對方位角」
====================================================================================
方法（自校正，最容易 defend）：
  · 只取「站直」幀（膝角接近最大），避免蹲到底軀幹/骨盆旋轉污染。
  · 只用 MediaPipe 2D 影像座標 x,y（不用不可靠的 z）。
  · r = ( |肩寬|/軀幹長 + |髖寬|/軀幹長 ) / 2  ← 越正面越寬、越側面越窄。
  · 用你「確定正面」的影片定 0°、「確定正側面」的影片定 90° 做校正：
        q = (r - r90) / (r0 - r90)   ∈[0,1]
        θ = acos(q)                  → 0°≈正面, 90°≈正側面
輸出：每支影片的 r / q / θ 表 + angle_estimate.png（單調性檢查）。

⚠ 這是「影像估計的相對角度」，不是物理 ground truth。海報標籤請寫「影像估計相對角度」。

用法（用專案 venv）：
  backend/.venv_arm64/bin/python3 estimate_view_angle.py \
      --front 深6.mov --side 深5.mov  深6.mov 深X.mov 深Y.mov 深5.mov
  （--front / --side 是校正片；後面列出所有要估角度的影片，可含校正片本身）
"""
import os, sys, math, argparse
import numpy as np
import cv2

REPO = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL = os.path.join(REPO, 'backend', 'core', 'pose_landmarker_full.task')

L_SH, R_SH, L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANK, R_ANK = 11, 12, 23, 24, 25, 26, 27, 28


def _angle(a, b, c):
    a, b, c = np.array(a), np.array(b), np.array(c)
    ba, bc = a - b, c - b
    cos = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-9)
    return math.degrees(math.acos(max(-1, min(1, cos))))


def landmarks_of(video, model, every_ms=100):
    """回傳每個取樣幀的 2D 影像座標 (33,3)=[x,y,vis]（normalized 0-1）。"""
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    opts = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=model),
        running_mode=vision.RunningMode.VIDEO, num_poses=1)
    out = []
    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    with vision.PoseLandmarker.create_from_options(opts) as lm:
        fn, last = 0, -1e9
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            fn += 1
            ts = fn * 1000.0 / fps
            if ts - last < every_ms:
                continue
            last = ts
            h, w = frame.shape[:2]
            if w > 640:
                frame = cv2.resize(frame, (640, int(h * 640.0 / w)))
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(ts))
            if not res.pose_landmarks:
                continue
            p = res.pose_landmarks[0]
            out.append(np.array([[q.x, q.y, getattr(q, 'visibility', 1.0)] for q in p]))
    cap.release()
    return out


def ratio_r(video, model):
    """取站直幀，回傳 r 中位數（肩+髖投影縮短率），以及使用幀數。"""
    lms = landmarks_of(video, model)
    if not lms:
        return None, 0
    # 每幀膝角（2D），取站直（膝角大）
    knees, rs = [], []
    for p in lms:
        vis = min(p[L_SH, 2], p[R_SH, 2], p[L_HIP, 2], p[R_HIP, 2])
        if vis < 0.4:
            knees.append(np.nan); rs.append(np.nan); continue
        try:
            k = 0.5 * (_angle(p[L_HIP, :2], p[L_KNEE, :2], p[L_ANK, :2]) +
                       _angle(p[R_HIP, :2], p[R_KNEE, :2], p[R_ANK, :2]))
        except Exception:
            k = np.nan
        sh_mid = (p[L_SH, :2] + p[R_SH, :2]) / 2
        hip_mid = (p[L_HIP, :2] + p[R_HIP, :2]) / 2
        H = np.linalg.norm(sh_mid - hip_mid) + 1e-9
        Ws = abs(p[L_SH, 0] - p[R_SH, 0]); Wh = abs(p[L_HIP, 0] - p[R_HIP, 0])
        r = 0.5 * (Ws / H + Wh / H)
        knees.append(k); rs.append(r)
    knees, rs = np.array(knees), np.array(rs)
    ok = np.isfinite(knees) & np.isfinite(rs)
    if ok.sum() < 3:
        good = np.isfinite(rs)
        return (float(np.nanmedian(rs[good])) if good.any() else None), int(good.sum())
    thr = np.nanpercentile(knees[ok], 70)          # 站直＝膝角前 30%
    stand = ok & (knees >= thr)
    if stand.sum() < 3:
        stand = ok
    return float(np.median(rs[stand])), int(stand.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('videos', nargs='+', help='要估角度的影片（可含校正片本身）')
    ap.add_argument('--front', required=True, help='確定正面(0°)的校正影片')
    ap.add_argument('--side', required=True, help='確定正側面(90°)的校正影片')
    ap.add_argument('--model', default=DEFAULT_MODEL)
    args = ap.parse_args()
    if not os.path.exists(args.model):
        print('找不到模型：', args.model); sys.exit(1)

    print('校正中…')
    r0, n0 = ratio_r(args.front, args.model); print(f'  正面 0°  r0 = {r0:.4f}（{n0} 幀）' if r0 else '  [ERR] 正面校正失敗')
    r90, n90 = ratio_r(args.side, args.model); print(f'  側面 90° r90= {r90:.4f}（{n90} 幀）' if r90 else '  [ERR] 側面校正失敗')
    if r0 is None or r90 is None or abs(r0 - r90) < 1e-3:
        print('校正失敗：r0/r90 太接近或抓不到骨架。'); sys.exit(1)
    if r0 < r90:
        print('⚠ 注意：正面 r0 應大於側面 r90（正面看起來較寬）。目前相反，請確認 --front/--side 沒放反。')

    rows = []
    for v in args.videos:
        if not os.path.exists(v):
            print(f'  [skip] 找不到 {v}'); continue
        r, n = ratio_r(v, args.model)
        if r is None:
            print(f'  [skip] {os.path.basename(v)} 抓不到站直幀'); continue
        q = (r - r90) / (r0 - r90)
        q = max(0.0, min(1.0, q))
        theta = math.degrees(math.acos(q))
        rows.append((os.path.basename(v), r, q, theta, n))

    print('\n影像估計相對方位角（自校正 0°/90°）：')
    print(f"{'影片':22s} {'r':>8s} {'q':>7s} {'θ(度)':>8s} {'幀':>5s}")
    for name, r, q, th, n in rows:
        print(f'{name:22.22s} {r:8.4f} {q:7.3f} {th:8.1f} {n:5d}')

    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        rows2 = sorted(rows, key=lambda x: x[3])
        fig, ax = plt.subplots(figsize=(7, 4.2))
        ax.bar(range(len(rows2)), [x[3] for x in rows2], color='#E1613F')
        ax.set_xticks(range(len(rows2))); ax.set_xticklabels([x[0][:10] for x in rows2], rotation=30, ha='right', fontsize=8)
        ax.set_ylabel('image-estimated relative azimuth (deg)'); ax.axhline(90, color='#888', ls='--', lw=1)
        ax.set_title('2D shoulder+hip foreshortening — view angle')
        fig.tight_layout(); fig.savefig(os.path.join(REPO, 'angle_estimate.png'), dpi=150)
        print(f'\n圖 → {os.path.join(REPO, "angle_estimate.png")}')
    except Exception as e:
        print('（略過圖）', e)
    print('\n⚠ 這是影像估計的「相對」角度，非物理 ground truth。海報標籤請用「影像估計相對角度」。')


if __name__ == '__main__':
    main()
