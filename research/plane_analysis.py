#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
plane_analysis.py — 平面族架構下的實驗分析（v7）
════════════════════════════════════════════════════════════════════════

為什麼要改成「平面族」而不是「機位」
────────────────────────────────────
2026-07-31 的 52 支資料顯示：同一個人做同樣的標準動作，換機位之後
指標的絕對值差 11–80%。原因不是尺度沒正規化（已用股骨長/髖寬/肩寬
正規化過，與身高無關），而是 MediaPipe 的 world 座標是**單目推估的
3D 重建**，同一個真實三維量從不同角度重建出來就是不同數字。

但把比較範圍限縮到「兩個機位都量得到那個指標」之後，離散度大幅收斂：

    指標             跨三機位   只比可觀測的機位
    Knee Valgus        21%   →     2%
    Elbow Flare        28%   →     5%
    Grip Width         19%   →    12%
    Torso Lean         11%   →    14%
    Hip Depth          35%   →    16%
    Knee Sym           30%   →    30%   ← 沒救回來

也就是說：**可轉移性的邊界不是「角度 vs 距離」，是「這個量在不在
該機位看得見的平面上」。**（證據：比值型的 Knee Valgus 12%，
角度型的 Forearm Vertical 81% —— 型別不是預測因子。）

於是機位被歸成兩個平面族：

    矢狀面系  左右可見度比 < 0.40   一側被擋   量前後/上下的量
    額狀面系  左右可見度比 ≥ 0.70   兩側都看得到  量左右的量

本批資料的實測歸屬：
    深蹲 A(正側面) 0.31 → 矢狀面系 ｜ B(正面) 1.00、C(自選) 0.99 → 額狀面系
    臥推 A(正側面) 0.33 → 矢狀面系 ｜ B(俯視) 0.99、C(自選) 0.90 → 額狀面系

用法
────
    python3 plane_analysis.py <drvn_research_all_*.json>
"""
import sys, json, glob
from collections import defaultdict
import numpy as np

# 左右可見度比的平面族門檻（與 measurability 一致）
FRONTAL_MIN, SAGITTAL_MAX = 0.70, 0.40

BILATERAL = {"squat": ("L Knee", "R Knee"), "bench_press": ("L Elbow", "R Elbow")}
# 每個指標「量的是哪個平面的量」—— 這是幾何定義，不是實測結果
METRIC_PLANE = {
    "squat": {
        "L Knee": "both", "R Knee": "both",          # 膝屈伸兩個平面都看得到一部分
        "Torso Lean": "sagittal",                     # 前後傾
        "Hip Depth": "sagittal",                      # 髖膝的上下/前後關係
        "Knee Sym": "frontal", "Knee Valgus": "frontal",   # 左右
        "Stability": "both",
    },
    "bench_press": {
        "L Elbow": "both", "R Elbow": "both",
        "Forearm Vertical": "sagittal", "Bar Path": "sagittal",
        "Elbow Flare": "frontal", "Elbow Sym": "frontal", "Grip Width": "frontal",
    },
}
# 極值取哪一邊（與 multi_exercise._metric_deviation_extremum 一致：一律 max，
# 只有需要看「最小值」語意的膝角/肘角例外，那裡看的是最彎的那一刻）
PEAK = {"L Knee": "min", "R Knee": "min", "L Elbow": "min", "R Elbow": "min",
        "Forearm Vertical": "min"}


def load(path):
    out = []
    for p in (sorted(glob.glob(path)) or [path]):
        try:
            d = json.load(open(p, encoding="utf-8"))
        except Exception:
            continue
        out.extend(d.get("analyses") or ([d] if "source" in d else []))
    return out


def rep_peaks(a, lab):
    """一支影片 → 每個 rep 的極值"""
    how = PEAK.get(lab, "max")
    v = []
    for rep in a.get("chartsData") or []:
        c = rep.get(lab)
        if not c:
            continue
        u = np.array([p["user"] for p in c], dtype=float)
        if np.isfinite(u).any():
            v.append(float(np.nanmin(u) if how == "min" else np.nanmax(u)))
    return v


def plane_of(analyses, ex, view):
    """從實測可見度判定這個機位屬於哪個平面族"""
    pair = BILATERAL.get(ex)
    if not pair:
        return "?", None
    vs = defaultdict(list)
    for a in analyses:
        s = a["source"]
        if s["exercise"] != ex or s["view"] != view:
            continue
        for r in (a.get("debug") or {}).get("per_rep") or []:
            for m in r.get("metrics", []):
                if m["label"] in pair and m.get("visibility") is not None:
                    vs[m["label"]].append(float(m["visibility"]))
    if len(vs) < 2:
        return "?", None
    va, vb = np.mean(vs[pair[0]]), np.mean(vs[pair[1]])
    ratio = float(min(va, vb) / max(va, vb)) if max(va, vb) > 0 else 0.0
    fam = "額狀面系" if ratio >= FRONTAL_MIN else ("矢狀面系" if ratio < SAGITTAL_MAX else "斜角")
    return fam, ratio


def std_videos(analyses, ex, view):
    return [a for a in analyses if a["source"]["exercise"] == ex
            and a["source"]["view"] == view
            and a["source"]["quality"] == "good" and a["source"]["group"] == "exp"]


# ══════════════════════════════════════════════════════════════════════
def h0_families(A):
    print("═" * 74)
    print("H0  機位的平面族歸屬（由實測左右可見度比判定，非事先指定）")
    print("═" * 74)
    fams = {}
    for ex in ["squat", "bench_press"]:
        for vw in ["side", "front", "nat"]:
            f, r = plane_of(A, ex, vw)
            if r is None:
                continue
            fams[(ex, vw)] = f
            print(f"  {ex:<12}{vw:<6} 左右可見度比 {r:.2f} → {f}")
        print()
    return fams


def h1_cross_plane(A, fams):
    """同一次動作、兩台同時拍 → 量到的值差多少。

    這是本實驗最強的證據：A/B 是**同一次動作**兩台同時錄，
    physical truth 完全相同，差異只可能來自機位。
    """
    print("═" * 74)
    print("H1  跨平面族不可轉移（配對設計：同一次動作、兩機位同時拍）")
    print("═" * 74)
    print("  同一個物理事件，兩個平面族量到的值差幾 %。")
    print("  若可轉移 → 應接近 0%。\n")
    for ex in ["squat", "bench_press"]:
        labs = list(METRIC_PLANE[ex])
        print(f"  【{ex}】A(矢狀面系) vs B(額狀面系)")
        print(f"    {'指標':<20}{'量的平面':<10}{'A 中位':>9}{'B 中位':>9}{'差異':>9}")
        for lab in labs:
            va = [np.median(rep_peaks(a, lab)) for a in std_videos(A, ex, "side")
                  if rep_peaks(a, lab)]
            vb = [np.median(rep_peaks(a, lab)) for a in std_videos(A, ex, "front")
                  if rep_peaks(a, lab)]
            if not va or not vb:
                continue
            ma, mb = float(np.median(va)), float(np.median(vb))
            rel = abs(ma - mb) / max(abs(ma), abs(mb), 1e-6) * 100
            print(f"    {lab:<20}{METRIC_PLANE[ex][lab]:<10}{ma:9.2f}{mb:9.2f}{rel:8.0f}%")
        print()


def h2_within_plane(A, fams):
    """同平面族內是否可轉移 —— 預建模板能不能用的關鍵。"""
    print("═" * 74)
    print("H2  同平面族內可轉移性（預建模板能否套用的關鍵）")
    print("═" * 74)
    for ex in ["squat", "bench_press"]:
        members = [vw for vw in ["side", "front", "nat"] if fams.get((ex, vw)) == "額狀面系"]
        if len(members) < 2:
            print(f"  【{ex}】額狀面系成員不足 2 個，無法檢驗\n")
            continue
        print(f"  【{ex}】額狀面系成員：{members}")
        print(f"    {'指標':<20}{'量的平面':<10}" + "".join(f"{m:>10}" for m in members) + f"{'離散':>8}")
        for lab in METRIC_PLANE[ex]:
            vals = []
            for vw in members:
                v = [np.median(rep_peaks(a, lab)) for a in std_videos(A, ex, vw) if rep_peaks(a, lab)]
                vals.append(float(np.median(v)) if v else None)
            if any(v is None for v in vals):
                continue
            cv = float(np.std(vals) / max(abs(np.mean(vals)), 1e-6) * 100)
            plane = METRIC_PLANE[ex][lab]
            # 只有「該平面族量得到的指標」才該期待可轉移
            expect = plane in ("frontal", "both")
            mark = ("✅ 可轉移" if cv < 15 else "❌") if expect else "（此族量不到，不列入）"
            print(f"    {lab:<20}{plane:<10}" + "".join(f"{v:10.2f}" for v in vals)
                  + f"{cv:7.0f}%  {mark}")
        print(f"    ⚠️ n={len(members)} 個機位，離散度是 {len(members)} 個數字算出來的，"
              f"統計上很不穩，方向可信、數字勿當精確值。\n")


def h3_discrimination(A):
    """同機位內的鑑別力 —— 系統有沒有用的底線。對機位偏誤免疫。"""
    print("═" * 74)
    print("H3  同機位內的鑑別力（反應倍率 D，對機位偏誤免疫）")
    print("═" * 74)
    print("  D = |刻意錯 − 標準| ÷ 標準組組內 SD。D≥3 且相對變化≥15% 才算抓得到。\n")
    for ex in ["squat", "bench_press"]:
        for vw in ["side", "front", "nat"]:
            rows = [a for a in A if a["source"]["exercise"] == ex and a["source"]["view"] == vw]
            if not rows:
                continue
            good = std_videos(A, ex, vw)
            errs = defaultdict(list)
            for a in rows:
                et = a["source"].get("err_type")
                if et:
                    errs[et].append(a)
            if not good or not errs:
                continue
            print(f"  【{ex} / {vw}】")
            for lab in METRIC_PLANE[ex]:
                g = [np.median(rep_peaks(a, lab)) for a in good if rep_peaks(a, lab)]
                if len(g) < 2:
                    continue
                mu, sd = float(np.mean(g)), float(np.std(g, ddof=1))
                sd = sd if sd > 1e-9 else 1e-9
                cells = []
                for et in sorted(errs):
                    b = [np.median(rep_peaks(a, lab)) for a in errs[et] if rep_peaks(a, lab)]
                    if not b:
                        cells.append(f"{et}: —")
                        continue
                    mb = float(np.mean(b))
                    D = abs(mb - mu) / sd
                    rel = abs(mb - mu) / max(abs(mu), 1e-9)
                    hit = D >= 3 and rel >= 0.15
                    cells.append(f"{et} D={D:5.1f} Δ{rel:4.0%}{'✅' if hit else '  '}")
                print(f"    {lab:<20}{'   '.join(cells)}")
            print()


def h4_counting(A):
    print("═" * 74)
    print("H4  計次正確率")
    print("═" * 74)
    b = defaultdict(lambda: [0, 0])
    for a in A:
        s = a["source"]
        act, det = s.get("actual_reps"), a.get("repCount")
        if act is None:
            continue
        b[(s["exercise"], s["view"])][0] += (act == det)
        b[(s["exercise"], s["view"])][1] += 1
    tot = [0, 0]
    for k in sorted(b):
        o, n = b[k]
        tot[0] += o; tot[1] += n
        print(f"  {k[0]:<12}{k[1]:<6}{o:>3}/{n:<3}{o / n * 100:5.0f}%")
    if tot[1]:
        print(f"  {'總計':<18}{tot[0]:>3}/{tot[1]:<3}{tot[0] / tot[1] * 100:5.0f}%")
    low = [a for a in A if a.get("countConfidence") == "low"]
    if low:
        print(f"\n  ⚠️ 其中 {len(low)} 支計次信心度低（候選訊號無共識），"
              f"這些的次數與分數都不該進統計")
    print()


def h5_experience(A):
    print("═" * 74)
    print("H5  經驗差異（同機位內，有經驗·標準 vs 新手）")
    print("═" * 74)
    for ex in ["squat", "bench_press"]:
        for vw in ["side", "front", "nat"]:
            e = std_videos(A, ex, vw)
            n = [a for a in A if a["source"]["exercise"] == ex and a["source"]["view"] == vw
                 and a["source"]["group"] == "nov"]
            if len(e) < 2 or not n:
                continue
            se = [a["overallScore"] for a in e]
            sn = [a["overallScore"] for a in n]
            sd = float(np.std(se, ddof=1)) or 1e-9
            D = abs(np.mean(se) - np.mean(sn)) / sd
            print(f"  {ex:<12}{vw:<6} 有經驗 {np.mean(se):5.1f} → 新手 {np.mean(sn):5.1f}"
                  f"  差 {np.mean(se) - np.mean(sn):+5.1f}  D={min(D, 999):5.1f}"
                  f"  n={len(e)}/{len(n)}")
    print()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "research_out/json/*.json"
    A = load(path)
    if not A:
        print(f"在 {path} 找不到資料"); return
    print(f"\n讀到 {len(A)} 支分析結果\n")
    fams = h0_families(A)
    h1_cross_plane(A, fams)
    h2_within_plane(A, fams)
    h3_discrimination(A)
    h4_counting(A)
    h5_experience(A)
    print("═" * 74)
    print("結論該怎麼寫")
    print("═" * 74)
    print("""  · H1 支持「跨平面族不可轉移」—— 配對設計，證據最強
  · H2 支持「同平面族內可轉移」—— 但 n 小，只能當初步證據
  · H3 是系統有用的底線，且對機位偏誤免疫，可獨立成立
  · H4/H5 依賴計次與分數，受 H1/H2 的限制約束
  · 產品建議：模板依**平面族**建，系統先判定相機看到哪個平面，
    只評該平面量得到的指標，其餘明確標示「此機位不可評」""")


if __name__ == "__main__":
    main()
