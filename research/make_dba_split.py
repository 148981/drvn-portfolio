#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 DBA 圖拆成兩張：主曲線（不含內嵌圖）+ 獨立的收斂小圖。
海報上主圖放核心技術卡，收斂小圖放下方空白處。數值全部來自 JSON。"""
import sys, os, json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

P = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else "fig"
os.makedirs(OUT, exist_ok=True)
D = json.load(open(P, encoding="utf-8"))
T = D["templates"]
for p in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
          "/usr/share/fonts/truetype/noto-cjk/NotoSansCJK-Regular.ttc",
          "/System/Library/Fonts/PingFang.ttc"]:
    if os.path.exists(p):
        fm.fontManager.addfont(p)
        plt.rcParams["font.family"] = fm.FontProperties(fname=p).get_name(); break
plt.rcParams["axes.unicode_minus"] = False

INK, MEAS, REF, GREY = "#1A1A1A", "#C0392B", "#2B5C8A", "#5F5A54"

L = dict(
    zh=dict(t="黃金模板建立：DTW 對齊 → DBA 迭代平均",
            c1="專家示範各次循環", c2="DBA 代表性黃金模板",
            x="標準化動作週期 (%)", y="膝屈曲角（度）",
            conv_t="模板變化量 8 次迭代內收斂", it="迭代次數", ch="模板變化量（度）",
            note="第 7 次後變化量 < 0.01°，視為收斂"),
    en=dict(t="Golden template: DTW alignment → DBA iterative averaging",
            c1="expert cycles", c2="DBA golden template",
            x="Normalised movement cycle (%)", y="Knee flexion angle (deg)",
            conv_t="Template change converges within 8 iterations",
            it="Iteration", ch="Template change (deg)",
            note="change < 0.01° after iteration 7 → converged"),
)


def build(lang):
    t = L[lang]
    tt = T["squat__side"]
    C = np.array(tt["resampled_seg_curves"]); tpl = np.array(tt["template_seg_curve"])
    n = C.shape[0]
    x = np.linspace(0, 100, C.shape[1])

    # ── 主圖（不含內嵌） ──
    fig, ax = plt.subplots(figsize=(8.0, 5.4))
    for i, c in enumerate(C):
        ax.plot(x, c, color=REF, lw=1.5, alpha=.5, zorder=2,
                label=f"{t['c1']} (n={n})" if i == 0 else None)
    ax.plot(x, tpl, color=MEAS, lw=4.6, zorder=4, label=t["c2"], solid_capstyle="round")
    ax.set_xlabel(t["x"], fontsize=15); ax.set_ylabel(t["y"], fontsize=15)
    ax.tick_params(labelsize=13)
    ax.legend(fontsize=13, loc="upper right", framealpha=.95)
    for s_ in ("top", "right"): ax.spines[s_].set_visible(False)
    ax.grid(color="#EEE", zorder=0); ax.set_axisbelow(True)
    fig.suptitle(t["t"], fontsize=17, fontweight="bold", y=1.0)
    fig.savefig(f"{OUT}/fig_dba_{lang}.png", dpi=200, facecolor="white",
                bbox_inches="tight", pad_inches=.22)
    plt.close(fig); print(f"  ✔ fig_dba_{lang}.png  (n={n})")

    # ── 收斂獨立小圖（寬扁，適合放空白帶） ──
    conv = tt["dba_convergence"]
    it = [d["iter"] for d in conv]; ch = [d["change"] for d in conv]
    fig, ax = plt.subplots(figsize=(8.0, 3.0))
    ax.plot(it, ch, "o-", color=INK, lw=2.6, ms=8, zorder=3)
    ax.fill_between(it, ch, color=INK, alpha=.07, zorder=1)
    # 標註最後收斂點
    ax.annotate(t["note"], xy=(it[-2], ch[-2]),
                xytext=(it[-1] - 3.0, max(ch) * .45),
                fontsize=12.5, color=MEAS, fontweight="bold",
                arrowprops=dict(arrowstyle="->", color=MEAS, lw=1.3))
    ax.set_xlabel(t["it"], fontsize=14); ax.set_ylabel(t["ch"], fontsize=14)
    ax.set_xticks(it)
    ax.tick_params(labelsize=12.5)
    for s_ in ("top", "right"): ax.spines[s_].set_visible(False)
    ax.grid(color="#EEE", zorder=0); ax.set_axisbelow(True)
    ax.set_title(t["conv_t"], fontsize=15, fontweight="bold", pad=8)
    fig.savefig(f"{OUT}/fig_dba_conv_{lang}.png", dpi=200, facecolor="white",
                bbox_inches="tight", pad_inches=.20)
    plt.close(fig); print(f"  ✔ fig_dba_conv_{lang}.png")


for lang in ("zh", "en"):
    build(lang)
