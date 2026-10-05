"""
framing_guide.py — 錄影前的「架機位驗收」
════════════════════════════════════════════════════════════════════════════

為什麼需要這個檔案
──────────────────
2026-08-01 的 40 支實驗證明：**自己架的機位會毀掉效度**。

    深蹲 正面 0°（照指示架）  刻意膝內夾 → 分數掉 31.4  ✅ 抓得到
    深蹲 自選 45°（自己架）   刻意膝內夾 → 分數掉  5.7  ❌ 抓不到
    臥推 俯視  （照指示架）  刻意肘外展 → 分數掉 24.9  ✅ 抓得到
    臥推 自選 45°（自己架）   刻意肘外展 → 分數掉  9.5  ❌ 抓不到

機制是「刻度膨脹」：自己架的機位每次位置都不同，模板的跨影片變異被撐大到
典型偏差的 4.33 倍（照指示架的正面只有 1.83 倍），真實錯誤被評分曲線吸收掉。

**所以架機位不能是建議，必須是強制驗收。** 錄影鍵在全部通過之前是禁用的。

門檻怎麼來的
────────────
凡是標【實測】的，門檻都取自那 40 支影片的實際量測值，而且都取在
「兩群資料中間的空隙」，不是拍腦袋：

    深蹲 左右可見度比   正面 0.99–1.00 ／ 正側面 0.26–0.35   → 門檻 0.85（空隙 0.64）
    臥推 左右可見度比   俯視 0.94–1.00 ／ 正側面 0.17–0.52   → 門檻 0.80（空隙 0.42）
    入鏡率              全部 0.964–1.000                      → 門檻 0.99

標【待校準】的是還沒有實測資料的項目（人體高度佔比、鏡頭高度、俯視判定）。
它們會照樣量、照樣回報數值，但**先不擋人**（`blocking=False`），
等累積資料後再收緊 —— 這跟整份研究的做法一致：先量，再定門檻，不要先猜。

⚠️ 這個檔案只吃 2D 座標（landmarks 欄 0–1）與 visibility（欄 3）。
   不用 z —— MediaPipe 的 z 是單目推估，躺姿時特別不可靠。
"""

from __future__ import annotations

# MediaPipe Pose landmark 索引
NOSE = 0
L_SH, R_SH = 11, 12
L_EL, R_EL = 13, 14
L_WR, R_WR = 15, 16
L_HIP, R_HIP = 23, 24
L_KNE, R_KNE = 25, 26
L_ANK, R_ANK = 27, 28


def _np():
    return __import__("numpy")


def _pt(f, i):
    """取第 i 個關節的 (x, y, visibility)。"""
    return float(f[i][0]), float(f[i][1]), (float(f[i][3]) if len(f[i]) > 3 else 1.0)


def _mid(f, a, b):
    ax, ay, _ = _pt(f, a)
    bx, by, _ = _pt(f, b)
    return (ax + bx) / 2.0, (ay + by) / 2.0


def _dist(f, a, b):
    np = _np()
    ax, ay, _ = _pt(f, a)
    bx, by, _ = _pt(f, b)
    return float(np.hypot(ax - bx, ay - by))


def _vis(f, idxs):
    """這幾個關節裡最低的 visibility。"""
    return min(_pt(f, i)[2] for i in idxs)


def _in_frame(f, idxs, margin=0.02):
    """這幾個關節有幾成在畫面內（含邊界緩衝）。"""
    ok = 0
    for i in idxs:
        x, y, _ = _pt(f, i)
        if margin <= x <= 1 - margin and margin <= y <= 1 - margin:
            ok += 1
    return ok / max(len(idxs), 1)


def _check(key, label, ok, measured, want, hint, blocking=True, calibrated=True):
    return {
        "key": key, "label": label, "pass": bool(ok),
        "measured": (None if measured is None else round(float(measured), 3)),
        "want": want, "hint": (None if ok else hint),
        "blocking": bool(blocking),           # False = 只回報不擋人
        "calibrated": bool(calibrated),       # False = 門檻尚未由實測定錨
    }


# ══════════════════════════════════════════════════════════════════════════
# 靜態檢查：單一幀就能判定（即時預覽每幀跑）
# ══════════════════════════════════════════════════════════════════════════

def check_squat_front(f):
    """深蹲 · 正面 0° —— 唯一驗證通過抓得到膝內夾的機位。"""
    np = _np()
    out = []

    # ① 正對鏡頭【實測】
    #    正面 0.99–1.00 ／ 正側面 0.26–0.35，中間空 0.64，門檻取 0.85
    lv = _vis(f, [L_SH, L_HIP, L_KNE, L_ANK])
    rv = _vis(f, [R_SH, R_HIP, R_KNE, R_ANK])
    ratio = min(lv, rv) / max(lv, rv) if max(lv, rv) > 1e-6 else 0.0
    out.append(_check("facing", "身體正對鏡頭", ratio >= 0.85, ratio, "≥ 0.85",
                      "身體再轉正一點，讓鏡頭同時看到左右兩邊"))

    # ② 全身入鏡【實測】取景率全部 0.964–1.000，門檻 0.99（=只要有一個點出框就擋）
    joints = [L_SH, R_SH, L_HIP, R_HIP, L_KNE, R_KNE, L_ANK, R_ANK]
    fr = _in_frame(f, joints)
    out.append(_check("in_frame", "全身入鏡（含腳踝）", fr >= 0.99, fr, "= 1.00",
                      "往後退一點，腳踝也要在畫面裡"))

    # ③ 距離：人體高度佔畫面比例【待校準】
    #    太近 → 蹲到底會出框；太遠 → 關節解析度不足。
    sy = _mid(f, L_SH, R_SH)[1]
    ay = (_pt(f, L_ANK)[1] + _pt(f, R_ANK)[1]) / 2.0
    span = abs(ay - sy)
    out.append(_check("distance", "距離適中", 0.35 <= span <= 0.80, span, "0.35 – 0.80",
                      "太近了，退到 2.5–3 公尺" if span > 0.80 else "太遠了，靠近一點",
                      blocking=False, calibrated=False))

    # ④ 鏡頭高度：髖部應該在畫面垂直中央附近【待校準】
    #    俯拍會讓 Knee Valgus 的水平比值被透視扭曲。
    hy = _mid(f, L_HIP, R_HIP)[1]
    out.append(_check("camera_height", "鏡頭高度接近腰部", 0.30 <= hy <= 0.70, hy, "0.30 – 0.70",
                      "手機放低一點，大概到腰的高度" if hy < 0.30 else "手機抬高一點",
                      blocking=False, calibrated=False))

    # ⑤ 膝踝都要清楚 —— Knee Valgus 就是靠這四個點算的
    kv = _vis(f, [L_KNE, R_KNE, L_ANK, R_ANK])
    out.append(_check("knee_ankle", "膝蓋與腳踝清楚可見", kv >= 0.60, kv, "≥ 0.60",
                      "膝蓋或腳踝被擋住了，把褲管拉高或換個背景"))
    return out


def check_bench_overhead(f):
    """臥推 · 正上方俯視 —— 唯一驗證通過抓得到肘外展的機位。"""
    np = _np()
    out = []

    # ① 兩側手臂都看得到【實測】
    #    俯視 0.94–1.00 ／ 正側面 0.17–0.52，中間空 0.42，門檻取 0.80
    lv = _vis(f, [L_SH, L_EL, L_WR])
    rv = _vis(f, [R_SH, R_EL, R_WR])
    ratio = min(lv, rv) / max(lv, rv) if max(lv, rv) > 1e-6 else 0.0
    out.append(_check("both_arms", "兩隻手臂都看得到", ratio >= 0.80, ratio, "≥ 0.80",
                      "鏡頭要在正上方，不要偏到一側"))

    # ② 真的在正上方【待校準】
    #    俯視時肩線與髖線都以真實比例呈現，兩者長度比接近解剖值；
    #    斜角會讓近端放大、遠端縮小，比值偏離。
    #    ⚠️ 實測發現「左右可見度比」分不開俯視(0.94–1.00)與自選45°(0.83–0.96)，
    #       需要這個額外的幾何量。門檻先放寬，等資料回來再收。
    sw = _dist(f, L_SH, R_SH)
    hw = _dist(f, L_HIP, R_HIP)
    r = sw / hw if hw > 1e-6 else 0.0
    out.append(_check("overhead", "鏡頭在正上方", 0.85 <= r <= 1.80, r, "0.85 – 1.80",
                      "鏡頭要正對天花板往下拍，不要斜著拍",
                      blocking=False, calibrated=False))

    # ③ 頭到髖入鏡【實測】
    joints = [NOSE, L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP]
    fr = _in_frame(f, joints)
    out.append(_check("in_frame", "頭到髖都在畫面內", fr >= 0.99, fr, "= 1.00",
                      "鏡頭往上移一點，頭跟髖都要入鏡"))

    # ④ 手肘清楚 —— Elbow Flare 就是靠肩肘連線算的
    ev = _vis(f, [L_SH, R_SH, L_EL, R_EL])
    out.append(_check("elbows", "肩膀與手肘清楚可見", ev >= 0.60, ev, "≥ 0.60",
                      "手肘被擋住了，確認槓片或架子沒有遮到"))
    return out


CHECKS = {
    ("squat", "frontal_0"): check_squat_front,
    ("bench_press", "overhead"): check_bench_overhead,
}


def check_frame(landmarks_frame, exercise_key, target_view):
    """單一幀的架機位驗收。

    landmarks_frame: (33, ≥4) —— 欄 0-1 = 2D 正規化座標，欄 3 = visibility
    回傳 {"ready": bool, "checks": [...], "supported": bool}

    ready 只看 blocking=True 的項目。待校準的項目照樣回報數值供累積資料，
    但不擋人 —— 用還沒定錨的門檻擋使用者是不誠實的。
    """
    fn = CHECKS.get((exercise_key or "", target_view or ""))
    if fn is None:
        return {"ready": True, "supported": False, "checks": [],
                "note": "這個 (動作, 機位) 沒有驗證過的檢查，不做架機位驗收"}
    try:
        checks = fn(landmarks_frame)
    except Exception as e:
        return {"ready": False, "supported": True, "checks": [],
                "note": f"讀不到骨架：{type(e).__name__}"}
    ready = all(c["pass"] for c in checks if c["blocking"])
    return {"ready": ready, "supported": True, "checks": checks}


# ══════════════════════════════════════════════════════════════════════════
# 動態檢查：要求先做一次完整動作才能開錄
# ══════════════════════════════════════════════════════════════════════════

def check_full_rom(frames, exercise_key, target_view):
    """「預覽時先做一次完整動作」的驗收。

    ── 為什麼靜態檢查不夠 ────────────────────────────────────────────
    實驗裡最常見的取景失敗是：**站直時全身都在畫面裡，蹲到最低點時
    髖部掉出下緣。** 平均取景率算出來是 95%，看起來很漂亮 ——
    但被裁掉的那幾幀正好是唯一有資訊的地方（Hip Depth 只在最低點有意義）。

    靜態檢查在站姿那一幀一定會通過，所以一定要動態驗收。

    frames: (N, 33, ≥4)
    回傳 {"ok": bool, "reason": str, "worst_frame": int, "rom": float}
    """
    np = _np()
    a = np.asarray(frames, dtype=float)
    if a.ndim != 3 or a.shape[0] < 5:
        return {"ok": False, "reason": "影格太少，請完整做一次動作", "worst_frame": None, "rom": None}

    if exercise_key == "squat":
        watch = [L_SH, R_SH, L_HIP, R_HIP, L_KNE, R_KNE, L_ANK, R_ANK]
        track = a[:, [L_HIP, R_HIP], 1].mean(axis=1)     # 髖部垂直位移
        zh = "蹲到最低點"
    else:
        watch = [NOSE, L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP]
        track = a[:, [L_WR, R_WR], 1].mean(axis=1)       # 腕部垂直位移
        zh = "推到最高點"

    # ① 真的有做一次動作嗎（動態範圍夠不夠）
    rom = float(np.nanmax(track) - np.nanmin(track))
    if rom < 0.05:
        return {"ok": False, "reason": f"沒偵測到完整動作，請{zh}再回來",
                "worst_frame": None, "rom": rom}

    # ② 全程每一幀都要在畫面內 —— 尤其是動作端點那幾幀
    worst_ratio, worst_i = 1.0, None
    for i in range(a.shape[0]):
        r = _in_frame(a[i], watch)
        if r < worst_ratio:
            worst_ratio, worst_i = r, i
    if worst_ratio < 0.999:
        # 找出是哪個關節出框，講具體一點
        NAME = {L_SH: "左肩", R_SH: "右肩", L_HIP: "左髖", R_HIP: "右髖",
                L_KNE: "左膝", R_KNE: "右膝", L_ANK: "左踝", R_ANK: "右踝",
                L_EL: "左肘", R_EL: "右肘", L_WR: "左腕", R_WR: "右腕", NOSE: "頭"}
        bad = [NAME.get(j, str(j)) for j in watch
               if not (0.02 <= a[worst_i][j][0] <= 0.98 and 0.02 <= a[worst_i][j][1] <= 0.98)]
        return {"ok": False,
                "reason": f"{zh}時「{'、'.join(bad[:3])}」跑出畫面了 —— "
                          f"這幾幀正是最關鍵的資料，請退後或調整鏡頭",
                "worst_frame": int(worst_i), "rom": rom}

    return {"ok": True, "reason": "取景通過，全程都在畫面內",
            "worst_frame": None, "rom": rom}
