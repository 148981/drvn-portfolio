# -*- coding: utf-8 -*-
"""
measurement_overlay.py — 把「這個指標到底量了哪兩個點、量了什麼幾何」寫進分析結果
════════════════════════════════════════════════════════════════════════════════

為什麼需要這個模組
──────────────────
海報上的骨架量測圖如果是人工照著程式碼畫的，就會有兩份真相：程式碼一改、
圖就過期，而且沒有人會發現——圖看起來永遠很合理。實測已經吃過這個虧
（海報寫「Knee Valgus 98→19」，實際資料是 93.9→19.0；「53.3 分」在任何一份
資料裡都不存在）。

所以量測圖的資料一律由引擎輸出：跑完影片，JSON 裡就帶著

    · 代表影格（最深點）的骨架座標（2D 正規化 + 3D 世界座標）
    · 每個指標用到哪些 MediaPipe landmark
    · 每個指標的量測幾何（要畫哪條線、哪個角、哪條參考線）
    · 那一刻的實際數值與單位

畫圖腳本只是把這份規格渲染出來，不再自己決定任何一條線畫在哪裡。

輸出格式
────────
    {
      "exercise": "squat",
      "keyFrame":  {"frame": 412, "rep": 2, "phase": "deepest", ...},
      "landmarks": {"L_HIP": {"xy": [.., ..], "world": [.., .., ..], "vis": 0.97}, ...},
      "skeleton":  [["L_HIP","L_KNEE"], ...],
      "frameAxes": {"ml": [...], "vert": [...], "ap": [...]},
      "metrics": [
         {"key": "Knee Valgus", "standard": "...", "formula": "...", "unit": "ratio",
          "value": 0.31, "landmarks": [...], "scored": true,
          "draw": [{"type": "segment", "from": "L_KNEE", "to": "R_KNEE",
                    "label": "膝間距 0.21 m", "role": "measure"}, ...]}
      ],
      "diagnostics": {...}
    }

draw 原語（畫圖端只需要認得這五種）
    segment       兩個 landmark 之間的線段
    angle         以 vertex 為頂點、到 a 與 b 兩點的夾角弧
    ref_horizontal 通過某 landmark 的水平參考線
    ref_vertical   通過某 landmark 的垂直參考線
    point          標記單一 landmark（例如質心、支撐底面中心）
"""
from __future__ import annotations

import numpy as np

# MediaPipe Pose 的 landmark 索引 → 可讀名稱。深蹲只會用到這幾個。
LM_NAMES = {
    11: "L_SHOULDER", 12: "R_SHOULDER",
    23: "L_HIP",      24: "R_HIP",
    25: "L_KNEE",     26: "R_KNEE",
    27: "L_ANKLE",    28: "R_ANKLE",
    29: "L_HEEL",     30: "R_HEEL",
    31: "L_FOOT",     32: "R_FOOT",
}
NAME_LM = {v: k for k, v in LM_NAMES.items()}

SKELETON_EDGES = [
    ("L_SHOULDER", "R_SHOULDER"), ("L_SHOULDER", "L_HIP"), ("R_SHOULDER", "R_HIP"),
    ("L_HIP", "R_HIP"),
    ("L_HIP", "L_KNEE"), ("L_KNEE", "L_ANKLE"), ("L_ANKLE", "L_FOOT"),
    ("R_HIP", "R_KNEE"), ("R_KNEE", "R_ANKLE"), ("R_ANKLE", "R_FOOT"),
]


def _f(x, n=4):
    """轉成可 JSON 序列化的 float，NaN/inf 一律變 None（不要讓 NaN 溜進 JSON）。"""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return round(v, n) if np.isfinite(v) else None


def _vec(v, n=5):
    if v is None:
        return None
    return [_f(c, n) for c in np.asarray(v, dtype=float).ravel()]


def _valid_frame(lm_row):
    """整列都是 0 代表那一幀沒偵測到人（_run_pose_extraction 的 EMPTY_LM）。"""
    a = np.asarray(lm_row, dtype=float)
    return bool(np.isfinite(a).all() and np.abs(a).sum() > 1e-6)


def _pick_key_frames(landmarks, rep_segments, me):
    """挑代表影格：最深點（畫蹲深與膝內夾）＋ 下降中段（畫 FPPA 診斷）。

    最深點 = 大腿節段角最大的那一幀（髖相對膝最低）。用世界座標直接算，
    不依賴特徵矩陣，這樣就算特徵那一欄被 gate 掉、圖還是畫得出來。
    """
    L = np.asarray(landmarks, dtype=float)
    n = L.shape[0]
    segs = []
    for r in (rep_segments or []):
        # 接受兩種格式：引擎內部的 {"start_frame","end_frame"} 或單純的 (start, end)
        if isinstance(r, dict):
            a, b = r.get("start_frame"), r.get("end_frame")
        else:
            try:
                a, b = r[0], r[1]
            except (TypeError, IndexError):
                continue
        if a is None or b is None:
            continue
        a, b = int(a), int(b)
        if 0 <= a < b <= n:
            segs.append((a, b))
    if not segs:
        segs = [(0, n)]
    # 取中間那一下：第一下常常還在找節奏，最後一下常常已經累了
    s, e = segs[len(segs) // 2]
    rep_idx = len(segs) // 2

    depth_track = []
    for i in range(s, e):
        if not _valid_frame(L[i]):
            depth_track.append(np.nan)
            continue
        w = L[i][:, 2:5]
        fr = me.anatomical_frame(w[23], w[24])
        # 兩側各算一次，取較深的那側（單側就量得到深度）
        d = [me.thigh_segment_angle(w[h], w[k], fr) for h, k in ((23, 25), (24, 26))]
        d = [x for x in d if np.isfinite(x)]
        depth_track.append(max(d) if d else np.nan)

    # ⚠️ 不能直接對原始曲線取 argmax。單一幀的點位跳動就能贏過真正的最深點 ——
    #   實測抓到一支正側面影片挑到雜訊幀，節段角 +24°（另外兩支同機位是 −16°），
    #   軀幹角算出 90°，整張圖就毀了。先做 5 幀中位數濾波再取極值，
    #   雜訊尖峰過不了中位數，真正的谷底則因為持續好幾幀而留得下來。
    track = np.asarray(depth_track, dtype=float)
    if not np.isfinite(track).any():
        return None, None, rep_idx, segs
    k = min(5, len(track) if len(track) % 2 else len(track) - 1)
    smooth = track.copy()
    if k >= 3:
        half = k // 2
        for i in range(len(track)):
            win = track[max(0, i - half):i + half + 1]
            win = win[np.isfinite(win)]
            smooth[i] = float(np.median(win)) if win.size else np.nan
    if not np.isfinite(smooth).any():
        return None, None, rep_idx, segs
    best_i = int(s + int(np.nanargmax(smooth)))

    # 下降中段：從這一下的起點到最深點之間，大腿節段角最接近 −45° 的那一幀。
    # 那裡大腿明顯傾斜，FPPA 在額狀面的投影還沒退化。
    mid_i, mid_gap = None, 1e18
    for i in range(s, best_i + 1):
        v = depth_track[i - s]
        if np.isfinite(v):
            g = abs(v - (-45.0))
            if g < mid_gap:
                mid_gap, mid_i = g, i
    return best_i, mid_i, rep_idx, segs


def _landmark_block(lm_row, confs_row=None):
    out = {}
    a = np.asarray(lm_row, dtype=float)
    for idx, name in LM_NAMES.items():
        if idx >= a.shape[0]:
            continue
        out[name] = {
            "lm": idx,
            "xy": _vec(a[idx, 0:2]),        # 2D 正規化影像座標（0–1）
            "world": _vec(a[idx, 2:5]),     # 3D 世界座標（公尺，原點兩髖中點）
        }
    if confs_row is not None:
        c = np.asarray(confs_row, dtype=float)
        # confs 的排列是 [lsv, rsv, lhv, rhv, lkv, rkv, lav, rav]
        order = ["L_SHOULDER", "R_SHOULDER", "L_HIP", "R_HIP",
                 "L_KNEE", "R_KNEE", "L_ANKLE", "R_ANKLE"]
        for j, name in enumerate(order):
            if j < c.shape[0] and name in out:
                out[name]["vis"] = _f(c[j], 3)
    return out


def _squat_metric_specs(w, fr, me, std):
    """深蹲七大指標：在代表影格上算出數值，並描述要畫什麼。"""
    ls, rs = w[11], w[12]
    lh, rh = w[23], w[24]
    lk, rk = w[25], w[26]
    la, ra = w[27], w[28]
    ms, mh = (ls + rs) * 0.5, (lh + rh) * 0.5

    def base(key, value, draw):
        d = dict(std.get(key, {}))
        d.update(key=key, value=_f(value), scored=True, draw=draw)
        return d

    out = []

    # ① / ② 膝屈曲角
    for key, (h, k, a, hn, kn, an) in {
        "L Knee": (lh, lk, la, "L_HIP", "L_KNEE", "L_ANKLE"),
        "R Knee": (rh, rk, ra, "R_HIP", "R_KNEE", "R_ANKLE"),
    }.items():
        out.append(base(key, me.knee_flexion_angle(h, k, a), [
            {"type": "segment", "from": hn, "to": kn, "role": "limb"},
            {"type": "segment", "from": kn, "to": an, "role": "limb"},
            {"type": "angle", "vertex": kn, "a": hn, "b": an,
             "role": "measure", "label": "膝屈曲角 = 180° − ∠(髖,膝,踝)"},
        ]))

    # ③ 矢狀面軀幹傾角
    out.append(base("Torso Lean", me.trunk_flexion_angle(mh, ms, fr), [
        {"type": "segment", "from": "MID_HIP", "to": "MID_SHOULDER", "role": "limb",
         "label": "軀幹向量"},
        {"type": "ref_vertical", "at": "MID_HIP", "role": "reference", "label": "垂直線"},
        {"type": "angle", "vertex": "MID_HIP", "a": "MID_SHOULDER", "b": "VERTICAL_UP",
         "role": "measure", "label": "軀幹前傾角（投影至矢狀面）"},
    ]))

    # ④ 大腿節段角（蹲深）—— 取可見度較佳那側；這裡先用左側，實際那側由呼叫端覆寫
    out.append(base("Hip Depth", me.thigh_segment_angle(lh, lk, fr), [
        {"type": "segment", "from": "L_HIP", "to": "L_KNEE", "role": "limb",
         "label": "大腿節段"},
        {"type": "ref_horizontal", "at": "L_KNEE", "role": "reference",
         "label": "水平線（0° = 大腿與地面平行）"},
        {"type": "angle", "vertex": "L_KNEE", "a": "L_HIP", "b": "HORIZONTAL",
         "role": "measure", "label": "大腿節段角"},
    ]))

    # ⑤ 雙側不對稱指數
    kl = me.knee_flexion_angle(lh, lk, la)
    kr = me.knee_flexion_angle(rh, rk, ra)
    out.append(base("Knee Sym", me.asymmetry_index(kl, kr), [
        {"type": "angle", "vertex": "L_KNEE", "a": "L_HIP", "b": "L_ANKLE",
         "role": "measure", "label": f"左膝 {_f(kl,1)}°"},
        {"type": "angle", "vertex": "R_KNEE", "a": "R_HIP", "b": "R_ANKLE",
         "role": "measure", "label": f"右膝 {_f(kr,1)}°"},
    ]))

    # ⑥ COM–BOS 側向偏移
    com = (ms + mh) * 0.5
    bos = (la + ra) * 0.5
    out.append(base("Stability", me.com_bos_lateral_offset(ms, mh, la, ra, fr), [
        {"type": "point", "at": "COM", "role": "measure", "label": "質心代理點"},
        {"type": "segment", "from": "L_ANKLE", "to": "R_ANKLE", "role": "reference",
         "label": "支撐底面寬"},
        {"type": "point", "at": "BOS_CENTER", "role": "reference", "label": "支撐底面中心"},
        {"type": "segment", "from": "COM", "to": "BOS_CENTER", "role": "measure",
         "label": "側向偏移"},
    ]))

    # ⑦ 膝內夾指數 = 1 − KASR
    kasr = me.knee_ankle_separation_ratio(lk, rk, la, ra, fr)
    m = base("Knee Valgus", me.valgus_index(lk, rk, la, ra, fr), [
        {"type": "segment", "from": "L_KNEE", "to": "R_KNEE", "role": "measure",
         "label": "膝間距"},
        {"type": "segment", "from": "L_ANKLE", "to": "R_ANKLE", "role": "measure",
         "label": "踝間距"},
    ])
    m["kasr"] = _f(kasr)
    out.append(m)

    return out, dict(com=_vec(com), bos_center=_vec(bos),
                     mid_hip=_vec(mh), mid_shoulder=_vec(ms))


def build(landmarks, rep_segments, exercise_key, me,
          confs=None, standards=None, diagnostics_standards=None):
    """組出 measurementOverlay 區塊。

    landmarks     (N, 33, 5) — 欄 0-1 = 2D 正規化座標，欄 2-4 = 3D 世界座標
    rep_segments  每一下的影格範圍，接受 [{"start_frame":..,"end_frame":..}, ...]
                  或 [(start, end), ...] 兩種格式
    exercise_key  目前只支援 "squat"，其他動作回 None（不要吐半成品）
    me            multi_exercise 模組本身（拿它的公式，保證與計分用的是同一份）
    confs         (N, 8) 可見度，排列 [lsv,rsv,lhv,rhv,lkv,rkv,lav,rav]，可省略

    任何一步失敗都回 None —— 這是給海報用的附加資料，絕不該讓它弄掛分析主流程。
    """
    try:
        if exercise_key != "squat" or landmarks is None:
            return None
        L = np.asarray(landmarks, dtype=float)
        if L.ndim != 3 or L.shape[1] < 33 or L.shape[2] < 5:
            return None
        std = standards or getattr(me, "SQUAT_METRIC_STANDARDS", {}) or {}
        dstd = diagnostics_standards or getattr(me, "SQUAT_DIAGNOSTIC_STANDARDS", {}) or {}

        key_i, mid_i, rep_idx, segs = _pick_key_frames(L, rep_segments, me)
        if key_i is None:
            return None

        w = L[key_i][:, 2:5]
        fr = me.anatomical_frame(w[23], w[24])
        metrics, extra_pts = _squat_metric_specs(w, fr, me, std)

        # 蹲深實際用的是可見度較高那側 —— 如果拿得到可見度就據實標記
        if confs is not None:
            c = np.asarray(confs, dtype=float)
            if key_i < c.shape[0] and c.shape[1] >= 8:
                use_left = (c[key_i, 2] + c[key_i, 4]) >= (c[key_i, 3] + c[key_i, 5])
                if not use_left:
                    for m in metrics:
                        if m.get("key") == "Hip Depth":
                            m["value"] = _f(me.thigh_segment_angle(w[24], w[26], fr))
                            m["draw"] = [
                                {"type": "segment", "from": "R_HIP", "to": "R_KNEE",
                                 "role": "limb", "label": "大腿節段"},
                                {"type": "ref_horizontal", "at": "R_KNEE",
                                 "role": "reference",
                                 "label": "水平線（0° = 大腿與地面平行）"},
                                {"type": "angle", "vertex": "R_KNEE", "a": "R_HIP",
                                 "b": "HORIZONTAL", "role": "measure",
                                 "label": "大腿節段角"},
                            ]
                            m["side_used"] = "R"
                        elif m.get("key") == "Hip Depth":
                            m["side_used"] = "L"

        # ── 診斷值：FPPA 在最深點通常是無定義的，這件事本身要如實報出來 ──────
        def fppa_at(i):
            if i is None or not _valid_frame(L[i]):
                return None, None
            ww = L[i][:, 2:5]
            ff = me.anatomical_frame(ww[23], ww[24])
            return (me.fppa_signed(ww[23], ww[25], ww[27], ff, 'L'),
                    me.fppa_signed(ww[24], ww[26], ww[28], ff, 'R'))

        fl_deep, fr_deep = fppa_at(key_i)
        fl_mid, fr_mid = fppa_at(mid_i)

        s, e = segs[rep_idx]
        defined = 0
        total = 0
        for i in range(s, e):
            if not _valid_frame(L[i]):
                continue
            ww = L[i][:, 2:5]
            ff = me.anatomical_frame(ww[23], ww[24])
            total += 1
            if np.isfinite(me.fppa_signed(ww[23], ww[25], ww[27], ff, 'L')):
                defined += 1

        diagnostics = {
            "note": "FPPA 僅在大腿於額狀面的投影夠長時有定義；"
                    "雙腳深蹲最深點附近會退化，故不作為計分指標。",
            "fppa_at_deepest": {"L": _f(fl_deep, 2), "R": _f(fr_deep, 2)},
            "fppa_at_mid_descent": {"L": _f(fl_mid, 2), "R": _f(fr_mid, 2)},
            "fppa_defined_frame_ratio": _f(defined / total, 3) if total else None,
            "lateral_trunk_lean_deg": _f(
                me.lateral_trunk_lean((w[23] + w[24]) * 0.5,
                                      (w[11] + w[12]) * 0.5, fr), 2),
            "standards": dstd,
        }

        blocks = {
            "deepest": _landmark_block(
                L[key_i], confs[key_i] if confs is not None
                and key_i < np.asarray(confs).shape[0] else None),
        }
        if mid_i is not None:
            blocks["mid_descent"] = _landmark_block(
                L[mid_i], confs[mid_i] if confs is not None
                and mid_i < np.asarray(confs).shape[0] else None)

        # 衍生點（質心、支撐底面中心、髖／肩中點）也給畫圖端，
        # 免得每個腳本自己重算一次、算法還不一定一致
        derived = {}
        for nm, key in (("MID_HIP", "mid_hip"), ("MID_SHOULDER", "mid_shoulder"),
                        ("COM", "com"), ("BOS_CENTER", "bos_center")):
            derived[nm] = {"world": extra_pts.get(key)}
        # 衍生點的 2D 座標由對應 landmark 的 2D 平均得出，供直接疊圖用
        d2 = L[key_i][:, 0:2]
        derived["MID_HIP"]["xy"] = _vec((d2[23] + d2[24]) * 0.5)
        derived["MID_SHOULDER"]["xy"] = _vec((d2[11] + d2[12]) * 0.5)
        derived["COM"]["xy"] = _vec((d2[11] + d2[12] + d2[23] + d2[24]) * 0.25)
        derived["BOS_CENTER"]["xy"] = _vec((d2[27] + d2[28]) * 0.5)

        return {
            "schema": "drvn.measurement_overlay/1",
            "exercise": exercise_key,
            "keyFrame": {"frame": int(key_i), "rep": int(rep_idx),
                         "phase": "deepest",
                         "midDescentFrame": None if mid_i is None else int(mid_i),
                         "repRange": [int(s), int(e)]},
            "landmarks": blocks,
            "derivedPoints": derived,
            "skeleton": [list(t) for t in SKELETON_EDGES],
            "frameAxes": ({"ml": _vec(fr[0]), "vert": _vec(fr[1]), "ap": _vec(fr[2])}
                          if fr is not None else None),
            "axesNote": "ê_ml 由(左髖−右髖)定義、指向受測者左側；ê_vert = 重力反向；"
                        "ê_ap = ê_vert × ê_ml。矢狀面法向量 = ê_ml、額狀面法向量 = ê_ap。",
            "metrics": metrics,
            "diagnostics": diagnostics,
        }
    except Exception as exc:      # noqa: BLE001 — 附加資料失敗絕不能拖垮分析
        try:
            print(f"[overlay] 量測示意圖資料產生失敗（不影響分析）："
                  f"{type(exc).__name__}: {exc}")
        except Exception:
            pass
        return None
