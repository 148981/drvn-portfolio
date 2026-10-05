"""
metrology.py — 量測學層：直接量「量測值」，不量「分數」
════════════════════════════════════════════════════════════════════════════

為什麼需要這個檔案
──────────────────
v8 以前的實驗全部在比較**分數**。但分數是

    骨架座標 → 特徵指標 → 與模板逐點比對 → 除以尺規(z) → 評分曲線 → 加權

六層加工的產物。任何一層出問題，看到的都只是「分數怪怪的」，
無法定位。實測後果：臥推自選機位的鑑別度 d 從 1.26 掉到 0.06，
只因為 5 支標準影片裡有 1 支離群 —— 而那支離群的**量測值其實正常**，
是模板尺規（用 n=2 估的）把 4° 的正常差異放大成 10 個標準差。

這個檔案改成直接量**未經加工的量測值**，而且用「不需要真值」的方法：

  ① 骨長恆定性 —— 骨頭不會伸縮，任何變動都是量測誤差
  ② 左右對稱性 —— 同一個人左右同名骨段等長，差異就是遮擋腦補
  ③ 相機方位   —— 從骨架反推，量出「機位到底差了多少」
  ④ 逐軸雜訊   —— 真實動作平滑，高頻變化就是雜訊

這四項都是 metrology（計量學）的標準手法：**用物理約束當內建真值**，
不需要光學動作捕捉系統。

實測依據（2026-08-03，6 支影片）
────────────────────────────────
  雙機同步（同一瞬間，兩台相機）   骨長差 18.7%　關節角差 24.5°
  同機位重複（4 支，含跨場次）     骨長差  6.8%　關節角差  4.0°
  遮擋（左右可見度比 0.76）        左右前臂長度差 52.3%
  逐軸雜訊                        Z 是 X/Y 的 4.3 倍（肩部 10 倍）

⇒ 跨機位不可比、同機位可比。這是整個產品定位的實證基礎。
"""

from __future__ import annotations
import numpy as np

# MediaPipe Pose landmark 索引
NOSE = 0
L_SH, R_SH = 11, 12
L_EL, R_EL = 13, 14
L_WR, R_WR = 15, 16
L_HIP, R_HIP = 23, 24
L_KNE, R_KNE = 25, 26
L_ANK, R_ANK = 27, 28

# 要量的骨段。成對的放一起，方便算左右對稱性。
BONES = [
    ("上臂", L_SH, L_EL, R_SH, R_EL),
    ("前臂", L_EL, L_WR, R_EL, R_WR),
    ("大腿", L_HIP, L_KNE, R_HIP, R_KNE),
    ("小腿", L_KNE, L_ANK, R_KNE, R_ANK),
]
SINGLE = [("肩寬", L_SH, R_SH), ("髖寬", L_HIP, R_HIP)]


def _w(landmarks):
    """從 (N,33,5) 取出 world 座標（欄 2-4）。若已是 (N,33,3) 就直接用。"""
    a = np.asarray(landmarks, dtype=float)
    if a.ndim != 3 or a.shape[1] < 29:
        return None
    return a[:, :, 2:5] if a.shape[2] >= 5 else a[:, :, :3]


def _len(W, a, b):
    """骨段長度的逐幀序列（公尺）。"""
    return np.linalg.norm(W[:, a, :] - W[:, b, :], axis=1)


def bone_lengths(landmarks):
    """① 骨長恆定性　②左右對稱性

    骨頭是物理常數：
      · 同一支影片內的變動 → 量測雜訊
      · 左右同名骨段的差異 → 遮擋造成的腦補（**比 visibility 更硬的判準**）

    實測：可見度比 0.76 的影片，左右前臂長度差 52.3%；
          可見度比 ≥0.93 的三支，左右差都在 12% 以內。
    回傳 {骨段: {left, right, asym, cv_left, cv_right}}
    """
    W = _w(landmarks)
    if W is None or len(W) < 5:
        return {}
    out = {}
    for nm, la, lb, ra, rb in BONES:
        L, R = _len(W, la, lb), _len(W, ra, rb)
        ml, mr = float(np.nanmedian(L)), float(np.nanmedian(R))
        if not (np.isfinite(ml) and np.isfinite(mr)) or min(ml, mr) < 1e-6:
            continue
        out[nm] = {
            "left": round(ml, 4), "right": round(mr, 4),
            "asym": round(abs(ml - mr) / ((ml + mr) / 2), 4),      # 左右不對稱率
            "cv_left": round(float(np.nanstd(L) / ml), 4),          # 片內變異
            "cv_right": round(float(np.nanstd(R) / mr), 4),
        }
    for nm, a, b in SINGLE:
        V = _len(W, a, b)
        m = float(np.nanmedian(V))
        if np.isfinite(m) and m > 1e-6:
            out[nm] = {"left": round(m, 4), "right": round(m, 4), "asym": 0.0,
                       "cv_left": round(float(np.nanstd(V) / m), 4),
                       "cv_right": round(float(np.nanstd(V) / m), 4)}
    return out


ASYM_MAX = 0.20      # 左右差 > 20% → 該側是腦補的

# ── 每個動作「評分真正會用到」的骨段 ──────────────────────────────────
# 這張表是 2026-08-03 的修正。舊版沒有這張表，只要**任一**骨段左右差超標
# 就把整支影片判為不可靠，結果：
#
#   深蹲自選機位 6/6 全被判「嚴重遮擋」
#     實際 → 大腿左右差 0.9–4.1%、小腿 3.5–9.1%（六個機位裡最乾淨的）
#            被判超標的是**上臂** 31.5–39.6%
#
# 深蹲時手扶槓／抱胸，上臂本來就貼著軀幹、又常指向鏡頭（軸向退化），
# 左右差大是必然的 —— 而且上臂跟深蹲品質**完全無關**。
# 拿無關骨段去否決整支影片，等於用不相干的證據下判決。
#
# ⇒ 遮擋判定必須按動作篩選骨段。核心骨段超標才叫「量不到」；
#   無關骨段超標只記錄、不否決。
EXERCISE_BONES = {
    "squat":            ["大腿", "小腿", "髖寬"],
    "deadlift":         ["大腿", "小腿", "髖寬"],
    "lunge":            ["大腿", "小腿", "髖寬"],
    "bench_press":      ["上臂", "前臂", "肩寬"],
    "overhead_press":   ["上臂", "前臂", "肩寬"],
    "shoulder_press":   ["上臂", "前臂", "肩寬"],
    "row":              ["上臂", "前臂", "肩寬"],
    "barbell_row":      ["上臂", "前臂", "肩寬"],
    "pull_up":          ["上臂", "前臂", "肩寬"],
    "bicep_curl":       ["上臂", "前臂", "肩寬"],
    "lat_pulldown":     ["上臂", "前臂", "肩寬"],
}


def relevant_bones(exercise_key):
    """該動作評分會用到的骨段。未登錄的動作回傳 None（＝全部都看，保守）。"""
    return EXERCISE_BONES.get((exercise_key or "").lower())


def occlusion_flags(bl, exercise_key=None):
    """由骨長對稱性判斷哪些肢段不可信。

    ⚠️ 這比 visibility 嚴格：實測有一支影片 visibility 0.76（看起來還行），
       但左右前臂長度差 52.3% —— 那不是「信心低」，是**數值錯誤**。

    ⚠️ 但必須**只看與該動作相關的骨段**（見 EXERCISE_BONES 的說明）。
       否則深蹲會因為上臂而被誤判 —— 這是 2026-08-03 抓到的實際 bug。

    回傳
      unreliable_segments  相關骨段中超標的（→ 這才會否決評分）
      irrelevant_flagged   無關骨段中超標的（→ 只記錄，不否決）
      worst_asym           相關骨段中最大的左右差
      blocking             相關骨段是否有超標（給上游做 gate 用）
    """
    bl = bl or {}
    rel = relevant_bones(exercise_key)
    scope = {nm: d for nm, d in bl.items() if rel is None or nm in rel}
    other = {nm: d for nm, d in bl.items() if rel is not None and nm not in rel}
    bad = [nm for nm, d in scope.items() if d.get("asym", 0) > ASYM_MAX]
    ign = [nm for nm, d in other.items() if d.get("asym", 0) > ASYM_MAX]
    return {
        "unreliable_segments": bad,
        "irrelevant_flagged": ign,
        "worst_asym": round(max([d.get("asym", 0) for d in scope.values()], default=0.0), 4),
        "worst_asym_all": round(max([d.get("asym", 0) for d in bl.values()], default=0.0), 4),
        "scope": sorted(scope.keys()),
        "blocking": bool(bad),
    }


def camera_pose(landmarks):
    """③ 從骨架反推相機相對身體的方位（不需要任何額外硬體）

    world 座標的 z 軸就是相機光軸。用肩線與軀幹長軸建立身體座標系，
    再算相機光軸落在這個座標系的哪個方向。

    回傳 {azimuth_deg, elevation_deg}
      azimuth   繞身體長軸的方位角
      elevation 相機相對身體橫斷面的仰角

    實測（4 支自選機位，無腳架、含跨場次）：方位角全距只有 4.3°
      —— 使用者「隨便架」其實相當一致，這是產品可行性的關鍵證據。
    對照：真正的不同機位（雙機同步）方位差 69°。
    """
    W = _w(landmarks)
    if W is None or len(W) < 5:
        return {}
    ls, rs = W[:, L_SH, :], W[:, R_SH, :]
    lh, rh = W[:, L_HIP, :], W[:, R_HIP, :]
    x_b = rs - ls                                        # 身體左右軸
    n = np.linalg.norm(x_b, axis=1, keepdims=True)
    ok = (n[:, 0] > 1e-6)
    if ok.sum() < 5:
        return {}
    x_b = x_b / np.where(n < 1e-9, 1.0, n)
    y_b = (lh + rh) / 2 - (ls + rs) / 2                  # 身體長軸（肩→髖）
    y_b = y_b - np.einsum('ij,ij->i', y_b, x_b)[:, None] * x_b
    n2 = np.linalg.norm(y_b, axis=1, keepdims=True)
    y_b = y_b / np.where(n2 < 1e-9, 1.0, n2)
    z_b = np.cross(x_b, y_b)                             # 身體前後軸
    cam = np.array([0.0, 0.0, 1.0])                      # 相機光軸
    az = np.degrees(np.arctan2(x_b @ cam, z_b @ cam))
    el = np.degrees(np.arcsin(np.clip(y_b @ cam, -1, 1)))
    return {"azimuth_deg": round(float(np.nanmedian(az[ok])), 2),
            "elevation_deg": round(float(np.nanmedian(el[ok])), 2),
            "azimuth_sd": round(float(np.nanstd(az[ok])), 2)}


def axis_noise(landmarks):
    """④ 逐軸雜訊：真實動作是平滑的，二階差分的高頻成分就是雜訊。

    實測：Z 軸雜訊是 X/Y 的 4.3 倍（肩部高達 10 倍）。
    這是「z 是單目推估」最直接的量化證據，不需要任何真值。
    回傳 {x_mm, y_mm, z_mm, z_over_xy}
    """
    W = _w(landmarks)
    if W is None or len(W) < 8:
        return {}
    joints = [L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP]
    j = []
    for ax in range(3):
        s = W[:, joints, ax]
        d2 = np.diff(s, 2, axis=0)
        j.append(float(np.nanstd(d2) / np.sqrt(6) * 1000))     # mm
    xy = (j[0] + j[1]) / 2
    return {"x_mm": round(j[0], 2), "y_mm": round(j[1], 2), "z_mm": round(j[2], 2),
            "z_over_xy": round(j[2] / xy, 2) if xy > 1e-9 else None}


def measure(landmarks, exercise_key=None):
    """一次算完四項量測學指標。給 API 直接掛上去。

    exercise_key 一定要傳 —— 遮擋判定會依動作只看相關骨段。
    不傳的話會退回「全部骨段都看」，那會把深蹲因為上臂而誤判。
    """
    bl = bone_lengths(landmarks)
    return {"bones": bl, "occlusion": occlusion_flags(bl, exercise_key),
            "camera": camera_pose(landmarks), "noise": axis_noise(landmarks)}


# ══════════════════════════════════════════════════════════════════════════
# 穩健統計 —— 取代平均 + 標準差
# ══════════════════════════════════════════════════════════════════════════
# 為什麼一定要換：n 只有 4–5 支時，單一離群值同時
#   ① 把平均拉走（分子縮小）② 把 SD 撐大（分母膨脹）
# 兩邊夾殺。實測臥推自選機位：
#   含離群 [100, 96, 91, 44]  平均 82.7  SD 26.0  →  Cohen's d = 0.06
#   剔除後 [100, 96, 91]      平均 95.6  SD  4.1  →  Cohen's d = 1.26
# 一支影片讓判別力差了 21 倍。這不是機位的問題，是統計方法的問題。

def mad(x, scale=1.4826):
    """中位數絕對偏差（換算成與 SD 同量綱）。"""
    x = np.asarray([v for v in x if v is not None and np.isfinite(v)], dtype=float)
    if x.size == 0:
        return float("nan")
    m = np.median(x)
    return float(np.median(np.abs(x - m)) * scale)


def outliers(x, k=2.5):
    """回傳離群值的索引。判準：偏離中位數超過 k 倍 MAD。"""
    x = np.asarray(x, dtype=float)
    m = np.median(x[np.isfinite(x)]) if np.isfinite(x).any() else np.nan
    s = mad(x)
    if not np.isfinite(s) or s < 1e-12:
        return []
    return [i for i, v in enumerate(x) if np.isfinite(v) and abs(v - m) / s > k]


def robust_d(good, bad, k=2.5):
    """穩健版效果量：用中位數與 MAD 取代平均與 SD。

    回傳 (d_robust, d_classic, 被判為離群的標準組索引)
    兩個都回傳，報告上要並列 —— 差很多本身就是重要資訊。
    """
    g = np.asarray([v for v in good if v is not None and np.isfinite(v)], dtype=float)
    b = np.asarray([v for v in bad if v is not None and np.isfinite(v)], dtype=float)
    if g.size < 2 or b.size < 1:
        return float("nan"), float("nan"), []
    out = outliers(g, k)
    keep = np.array([v for i, v in enumerate(g) if i not in out])
    if keep.size < 2:
        keep = g
        out = []
    # 穩健：中位數差 ÷ 合併 MAD
    s_rob = np.sqrt((mad(keep) ** 2 * (keep.size - 1) + mad(b) ** 2 * max(b.size - 1, 1))
                    / max(keep.size + b.size - 2, 1))
    d_rob = ((np.median(keep) - np.median(b)) / s_rob) if s_rob > 1e-9 else float("nan")
    # 傳統：平均差 ÷ 合併 SD
    sp = np.sqrt(((g.size - 1) * np.var(g, ddof=1) + max(b.size - 1, 1) * np.var(b, ddof=1))
                 / max(g.size + b.size - 2, 1)) if b.size > 1 else np.std(g, ddof=1)
    d_cls = ((g.mean() - b.mean()) / sp) if sp > 1e-9 else float("nan")
    return (round(float(d_rob), 3), round(float(d_cls), 3), out)


# ══════════════════════════════════════════════════════════════════════════
# 尺規下限 —— 防止 n=2 估出過小的分母
# ══════════════════════════════════════════════════════════════════════════
# 實測：自選機位有一支影片的 Elbow Flare 只比同組中位數差 4°，
#   卻被算成 z = 10.00（→ 0 分）。因為尺規（mad）是用 2 支建模影片估的，
#   估太小 → 正常差異被放大成重大偏離。
# 對策：尺規不得小於「該指標典型值的一定比例」。
SCALE_FLOOR_RATIO = 0.15


def scale_floor(typical_value, current_scale, ratio=SCALE_FLOOR_RATIO):
    """回傳套過下限的尺規。typical_value 用該指標的模板動態範圍或中位數。"""
    try:
        floor = abs(float(typical_value)) * ratio
        return max(float(current_scale), floor)
    except Exception:
        return current_scale
