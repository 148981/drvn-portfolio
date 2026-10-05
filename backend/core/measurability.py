"""
measurability.py — 「這個機位到底量不量得到這個指標」的單一事實來源
════════════════════════════════════════════════════════════════════════════
v5.0 新增。取代舊的 `is_side_view: bool` + `front_only_metrics` 二元開關。

為什麼需要這個檔案
──────────────────
v4.8 的實驗（2026-07-27，16 支影片）暴露了三個互相牽連的硬傷：

 1. **旗標永遠是 false**：前端 SPEC 兩個動作都寫 `sideMode: false`，所以
    `is_side_view` 在全部 16 支影片都是 False → `score_rep()` 裡整段
    `if is_side:` 與 `front_only_metrics` 是死碼，從來沒執行過。
    宣告 side 跟宣告 front 的影片走完全一樣的計分路徑，
    「視角比較」這個實驗因子等於沒有操作到。

 2. **額狀面指標在正側面機位變成量 MediaPipe 的 z 雜訊**：
    臥推 Elbow Flare 用「肩線」當參考軸。正側面 90° 拍攝時肩線正對鏡頭，
    2D 投影長度趨近 0，向量整個由 z 主導 —— 而 MediaPipe 的 z 是單目推估、
    躺姿時特別不可靠。實測結果：受試者刻意把手肘外展到接近 T 字，
    Elbow Flare 只從 56.58° 變成 55.72°（Δ = −0.86°），
    感測器對這個「最該抓到的錯誤」幾乎零反應。
    Grip Width 同理（腕距/肩距兩個都是額狀面寬度，同時被透視壓縮），
    量到 2.65 倍肩寬，但解剖上典型值是 1.5–2.0。

 3. **二元旗標表達力不足**：「正側面 90°」「斜前方 45°」「正上方俯視」
    對每個指標的可測性完全不同，塞不進一個 bool。斜前方 45° 對矢狀面
    （膝角、軀幹前傾）與額狀面（膝內塌）都是「半可測」，不是非 0 即 1。

這個檔案怎麼解
──────────────
用 (機位, 指標) → 可測性等級 的明確查表，取代猜測：

    FULL    1.00  這個機位可以正面量到 → 全額計分
    PARTIAL 0.55  透視壓縮但仍有反應 → 降權計分，並在報告標註
    NONE    0.00  這個機位在物理上量不到 → 不計分，且明確回報
                  「此機位測不到」，而不是給一個看起來很正常的分數

關鍵原則：**NONE 必須讓使用者看得見。** v4.8 最危險的失真就是
指標被靜默歸零後，總分反而變高 —— 刻意做錯的那一項一旦沒量到，
就完全不扣分，於是刻意錯組的分數贏過標準組。

⚠️ 【v5.4 重要修正】這張表是「先驗假設」，不是量測結果
──────────────────────────────────────────────────────
v5.3 以前把幾何推論直接寫成硬性 gate（NONE ＝ 權重歸零）。
2026-07-27 第二批資料打臉了大部分的 NONE：

    深蹲                主機位動態範圍   對照機位動態範圍   保留比例
      L Knee               12.1°           45.2°          372%  ← 正面測得更好
      R Knee               76.1°           42.5°           56%
      Knee Valgus           0.81            0.90          111%
      Hip Depth             0.638           0.437          68%
    臥推（七個指標有五個在對照機位訊號一樣強或更強，85–140%）

    真正接近 0 的只有 Stability（1%）。

也就是說「這個機位測不到那個指標」多數情況下是錯的——訊號還在，
只是**品質不同**（動態範圍、對錯誤的反應、重複性）。
把它寫成硬 gate 會讓實驗發現不了東西：你只會量到自己假設的東西。

因此這張表的定位改成：
  · NONE    只保留給**實測證明真的沒有訊號**的組合（例如 Stability）
  · PARTIAL 用在有訊號但品質較差的組合，降權而不是丟棄
  · 真正的機位選擇，交給**逐指標的量測品質比較**（測試模式圖 S8）：
      反應倍率（對操弄有沒有反應）÷ 重測 CV（量得穩不穩）
    這兩個標準與機位無關，才能公平比較同一個指標在不同機位的表現。

參考
────
- Ershadi & Goldberg (2021) Viewpoint-Invariant Exercise Repetition Counting,
  arXiv:2107.13760 — 明確指出單目姿態估計的平面外（out-of-plane）量測
  必須依機位處理，不能一律採用。
- MediaPipe Pose 官方說明：z 為相對深度推估，精度顯著低於 x/y。
"""

from __future__ import annotations

# ── 可測性等級 ───────────────────────────────────────────────────────────────
FULL, PARTIAL, NONE = 1.0, 0.55, 0.0


# ══════════════════════════════════════════════════════════════════════════
# 【v6.1】(機位 × 指標) 可測性 —— 先驗定死，不再每次跑去偵測
# ══════════════════════════════════════════════════════════════════════════
# 為什麼要寫死：這些是**幾何事實**，不是要靠量測發現的東西。
#   · 正側面拍 → 遠側肢體被近側擋住 → 任何需要「左右兩側」的指標都不可能量到
#   · 動作方向正對鏡頭 → 該平面的角度在投影上退化 → 不可能量到
# 逐次偵測的壞處是不穩定：同一個機位換一支影片，可見度 0.13 可能變 0.30，
# 指標集就跟著跳動，同一組影片變得不可比較（實測標準組三支的計分指標數
# 曾經是 1/1/5）。先驗定死之後，該機位所有影片必定用同一組指標。
#
# 下表每一格都有 2026-07-28 實測佐證（括號內是實測可見度或 ROM）。
# ⚠️【v9.0 待重新校準】七大指標的量測公式已全面改為國際標準定義
#   （膝屈曲角／矢狀面軀幹傾角／大腿節段角／不對稱指數／COM–BOS 偏移／1−KASR）。
#   下表的每一格原本是用**舊公式**的實測可見度與 ROM 訂出來的。
#   因為公式改變而**必然**要跟著改的只有 Stability（它從「任意方向的重心變異」
#   變成「額狀面的內外側偏移」，所屬平面變了），已直接修正。
#   其餘各格的等級請在新一批影片跑完後，用新的可見度／CV 重新確認一次
#   —— 不要因為數字看起來合理就沿用舊結論。
VIEW_METRIC_TABLE = {
    "squat": {
        "sagittal_90": {          # 正側面：矢狀面完整，但遠側腿全滅
            "L Knee": FULL,       # 近側膝角（實測可見度 0.78–0.90）
            "R Knee": NONE,       # 遠側被軀幹擋住（實測 0.165–0.289）
            "Torso Lean": FULL,   # 軀幹前傾在矢狀面正對鏡頭（實測 0.99）
            "Hip Depth": FULL,    # 髖膝高低差（實測 0.85）
            "Knee Sym": NONE,     # 需要兩腿都準（實測 0.20）
            # 【v9.0】Stability 由「重心 x 的變異數」改成 COM–BOS **內外側**偏移。
            #   內外側軸在正側面正對鏡頭 → 該方向的位移在投影上退化，
            #   跟 Torso Lean 在正面退化是同一件事。改公式就必須改這一格，
            #   否則等於宣告一個量不到的東西量得到。
            "Stability": NONE,
            "Knee Valgus": NONE,  # 需要兩膝兩踝的左右距離（實測 0.13）
        },
        "frontal_0": {            # 正面：額狀面完整，矢狀面的前後資訊丟失
            "L Knee": FULL, "R Knee": FULL,        # 實測兩側皆 1.00
            "Torso Lean": NONE,   # 前傾方向正對鏡頭 → 投影退化
            "Hip Depth": PARTIAL, # 只剩垂直分量，前後看不到
            "Knee Sym": FULL,     # 實測 1.00
            "Stability": FULL,
            "Knee Valgus": FULL,  # 實測 0.98 —— 這是正面才量得到的關鍵指標
        },
        # 斜角：矢狀面被 cos45° 壓縮，而遠側腿**仍然被擋**（第一批實測
        # 斜後方 45°：近側 0.97、遠側 0.44）。所以「需要兩腿」的指標
        # 在斜角一樣不可用 —— 不能因為它是中間角度就給 PARTIAL 放行。
        "oblique_45": {
            "L Knee": FULL,        # 近側仍看得到
            "R Knee": NONE,        # 遠側被擋（實測 0.44，且是腦補的）
            "Torso Lean": PARTIAL, # cos45° 壓縮
            "Hip Depth": PARTIAL,
            "Knee Sym": NONE,      # 需要兩腿都準
            "Stability": PARTIAL,  # 【v9.0】內外側軸被 cos45° 壓縮（同 Torso Lean）
            "Knee Valgus": NONE,   # 需要兩膝兩踝的左右距離
        },
    },
    "bench_press": {
        "sagittal_90": {          # 正側面：近側手臂的矢狀面，遠側全滅
            "L Elbow": NONE,      # 遠側（實測 0.34，且被近側完全重疊）
            "R Elbow": FULL,      # 近側（實測 0.66）
            "Elbow Flare": NONE,  # 需要肩線＋兩側上臂（實測 0.17）
            "Forearm Vertical": FULL,   # 近側前臂與地面夾角，矢狀面看得到
            "Elbow Sym": NONE,    # 需要兩側（實測 0.17）
            "Bar Path": FULL,     # 槓的前後/上下軌跡
            "Grip Width": NONE,   # 需要兩腕的左右距離（實測量到 2.5–3.0 倍肩寬，不可能）
        },
        "overhead": {             # 正上方：額狀面完整，但上下推的方向正對鏡頭
            "L Elbow": NONE,      # ⚠️ 可見度高達 0.99，但肘角 ROM 只有 9–20°
            "R Elbow": NONE,      #    （解剖下限 28°）—— 骨架抓得到，角度投影退化
            "Elbow Flare": FULL,  # 上臂與肩線的夾角，正上方最準（實測 0.97）
            "Forearm Vertical": NONE,   # 前臂與地面夾角需要垂直資訊，正上方看不到
            "Elbow Sym": FULL,    # 實測 0.97
            "Bar Path": PARTIAL,  # 只剩水平分量
            "Grip Width": FULL,   # 兩腕左右距離，正上方最準（實測 0.96）
        },
        # 斜角：遠側手臂仍被近側遮擋，需要兩側的指標一樣不可用
        "oblique_45": {
            "L Elbow": NONE,           # 遠側
            "R Elbow": PARTIAL,        # 近側，但角度被部分壓縮
            "Elbow Flare": NONE,       # 需要肩線＋兩側上臂
            "Forearm Vertical": PARTIAL,
            "Elbow Sym": NONE,         # 需要兩側
            "Bar Path": PARTIAL,
            "Grip Width": NONE,        # 需要兩腕的左右距離
        },
    },
}


def orient_table(exercise_key, view, tbl, occluded_side, cfg=None):
    """【v6.4】把先驗表的「近側／遠側」對到這支影片實際的左右。

    ── 為什麼需要這個 ────────────────────────────────────────────────
    先驗表裡寫的是 `"L Knee": FULL  # 近側`、`"R Knee": NONE  # 遠側`，
    註解講的是「近側／遠側」，但程式碼寫死成 L／R。

    **哪一側是近側，取決於受測者面向鏡頭的哪一邊 —— 那是任意的。**
    人轉個身，近遠側就對調，但表不會跟著換。

    實測 2026-07-31 蹲7／蹲9（正側面）：
        L Knee 可見度 0.255 / 0.303  ← 其實是**遠側**（被擋）
        R Knee 可見度 0.893 / 0.929  ← 其實是**近側**（看得到）
    表卻保留 L Knee（擋住的）、擋掉 R Knee（看得到的）
    → 正側面**兩個膝蓋都沒了**，有效權重掉到 63%、只剩 2 個指標計分。
    設計上正側面應該是 4/7。

    佐證這是校準失誤而非物理事實：同一份表裡
        squat  sagittal → L=FULL(近), R=NONE(遠)
        bench  sagittal → L=NONE(遠), R=FULL(近)
    兩個動作的慣例**剛好相反** —— 那只反映當初各自那批影片站哪邊，
    不是解剖或幾何。

    ── 影響為什麼嚴重 ──────────────────────────────────────────────
    · 正側面被系統性低估 → 「正面完勝」的結論會被這個 bug 灌水
    · 受測者兩次站的方向不同，指標集就跟著跳 → 重測信度不可解讀

    ── 做法 ──────────────────────────────────────────────────────
    只在**矢狀面／斜角**這種「有近遠側之分」的機位動作。額狀面
    （正面／正上方）兩側都看得到，表裡成對指標同為 FULL，交換無影響。
    occluded_side 由 bilateral_visibility() 從可見度量出來。
    """
    if not tbl or not occluded_side:
        return tbl
    pairs = (cfg or {}).get("bilateral_pairs") or []
    if not pairs:
        return tbl
    a, b = pairs[0][0], pairs[0][1]
    if a not in tbl or b not in tbl:
        return tbl
    # 表認為「被擋的那個」＝值為 NONE 的那個
    tbl_occluded = a if tbl.get(a, FULL) <= 0.0 else (b if tbl.get(b, FULL) <= 0.0 else None)
    if tbl_occluded is None or tbl_occluded == occluded_side:
        return tbl                      # 表跟實際一致，不用動
    out = dict(tbl)
    out[a], out[b] = tbl[b], tbl[a]     # 近遠側對調
    return out


# ══════════════════════════════════════════════════════════════════════════
# 【v8】第二道關卡：重測信度（Reliability）
# ══════════════════════════════════════════════════════════════════════════
# 為什麼「量得到」不等於「量得準」
# ────────────────────────────────
# v7 只把關「這個機位看不看得到這個指標」（可見度 + ROM）。2026-08-01
# 的 40 支資料證明這一關遠遠不夠：
#
#   深蹲正側面的 Hip Depth 可見度 0.91–0.94、ROM 正常，可測性完全過關，
#   而且它是權重最重的指標（0.32）。但**同一個人、同一個機位、同樣
#   做標準動作的 5 支影片，Hip Depth 子分數是 100 / 99 / 100 / 36 / 31**。
#   標準組自己就散成這樣，拿它去判斷「有沒有蹲夠深」毫無意義 ——
#   實測結果正是刻意只蹲 1/4 的那支拿到 73.6 分，比標準組平均 66.1 還高。
#
# 所以要加第二道關卡：**同一機位、同一人、重複做標準動作，該指標的
# 分數變異係數 CV = SD/mean 必須夠小**，否則權重歸零。
#
# 門檻 0.35 怎麼定的（資料決定，不是拍腦袋）
# ──────────────────────────────────────────
# 用 40 支實測資料掃 CV ∈ {1.00, 0.50, 0.35, 0.25, 0.20}，看「機位 ×
# 錯誤型態」的 12 格判定有幾格符合解剖學預期（矢狀面錯誤只有矢狀面
# 機位抓得到、額狀面錯誤只有額狀面機位抓得到）：
#
#     CV≤1.00（等於沒把關）  6/12 符合   ← 目前版本
#     CV≤0.50               9/12
#     CV≤0.35              11/12        ← 取這裡
#     CV≤0.25              10/12（深蹲正面只剩 1 個指標，開始損失資訊）
#     CV≤0.20               8/12（深蹲正側面 0 個指標 → 整個機位不給分）
#
# ⚠️ 統計上的重要說明（避免循環論證）
# ──────────────────────────────────
# CV **只用標準組**（每機位 4–5 支）估計，刻意犯錯的影片完全沒有參與。
# 「錯誤有沒有被抓到」才用錯誤組驗證。信度估計與效度驗證用的是
# 互斥的資料，所以不是拿答案去調答案。
#
# ⚠️ 這張表的適用範圍
# ──────────────────
# 來自單一受測者（p01）、單一場地、單一支手機。不同體型／場地／機型
# 的 CV 可能不同。所以執行期一旦有 ≥3 支同機位的建模影片，
# **一律改用當場實測的 CV**，這張表只是還沒有足夠資料時的預設值。
RELIABILITY_CV = {
    "squat": {
        "sagittal_90": {"R Knee": 0.229, "Stability": 0.258,
                        "Hip Depth": 0.498, "Torso Lean": 0.535},
        "frontal_0": {"Stability": 0.0, "Knee Valgus": 0.074, "Torso Lean": 0.262,
                      "Knee Sym": 0.394, "R Knee": 0.418, "L Knee": 0.425,
                      "Hip Depth": 0.914},
        "oblique_45": {"Knee Valgus": 0.02, "Stability": 0.229, "L Knee": 0.238,
                       "R Knee": 0.248, "Knee Sym": 0.56, "Hip Depth": 0.565,
                       "Torso Lean": 0.645},
    },
    "bench_press": {
        # Bar Path 三個機位的子分數在**所有**標準影片都恆等於 0
        #   （raw_loss ≈ 3e-4，但 scoring_scales 給它 5000 倍 → 直接觸底）。
        #   一個永遠回同一個值的指標帶不了任何資訊，標成 9.9 讓它一律出局，
        #   免得它出現在「計分指標」清單裡誤導使用者。
        "sagittal_90": {"R Elbow": 0.009, "Forearm Vertical": 0.095,
                        "Bar Path": 9.9},
        "overhead": {"Elbow Flare": 0.033, "Elbow Sym": 0.237,
                     "Forearm Vertical": 0.256, "Grip Width": 0.591,
                     "R Elbow": 0.897, "L Elbow": 1.18, "Bar Path": 9.9},
        "oblique_45": {"L Elbow": 0.01, "Forearm Vertical": 0.023,
                       "Elbow Sym": 0.479, "Elbow Flare": 0.669,
                       "Grip Width": 0.676, "R Elbow": 1.514,
                       "Bar Path": 9.9},
    },
}
RELIABILITY_CV_MAX = 0.35
RELIABILITY_TRUST_VIDEOS = 3        # ≥ 這個數量才直接採信實測 CV
# ⚠️⚠️ 為什麼「用建模影片自己估 CV」在 n=2 時**結構上不可能成立** ⚠️⚠️
# ──────────────────────────────────────────────────────────────────────
# 直覺上會想：既然有 2 支建模影片，就拿它們互相比，差很多就代表不穩。
# 這個想法是錯的，而且錯得很隱蔽 —— 自我測試花了三輪才抓到：
#
#   模板（DBA 平均）是從那 2 支算出來的，模板的刻度（tpl_dev_mad）也是。
#   刻度甚至明確取了「跨影片變異」當下限（v7 為了修 z 爆炸加的）。
#   所以拿這 2 支回頭去比模板，變異早就被吸收進分母 → z 永遠很小 → CV ≈ 0。
#
#   實測：刻意讓兩支建模影片差**一倍深度**，算出來的 Hip Depth CV 還是 0.044。
#   改用「只含 rep 間變異」的刻度當分母也一樣 —— 因為 med 與 mad 都被
#   那兩群資料同時撐開了。
#
#   **模板跟它的尺規都是那 2 支自己定的，那 2 支永遠不會看起來異常。**
#   這是統計上的硬限制，不是實作問題。
#
# 那離線驗證的「表 + 2 支否決 = 99%」是怎麼來的？
#   那裡的 2 支是**受測影片**（用另外的建模影片建出的模板去評分），
#   不是模板自己的來源影片。兩者完全不同。
#
# 所以正式做法：
#   · 本研究：**一律以驗證表為準**，建模影片不參與信度判定。
#   · 產品路線圖：使用者每完成一次標準組分析就累積一筆分數，
#     同機位累積 ≥2 筆之後才啟用個人化 CV 否決（那時的資料才是獨立的）。
#     這不需要使用者多拍任何東西，只是要用一陣子。
RELIABILITY_VETO_CV = 0.60          # 保留給未來的「累積式個人化」使用


def reliable_metrics(exercise_key, view, candidate_metrics,
                     measured_cv=None, n_videos=None, cv_max=RELIABILITY_CV_MAX,
                     cv_source=None):
    """從「量得到」的指標裡，再篩出「量得準」的。

    candidate_metrics: 已通過可測性關卡的指標名稱集合
    measured_cv:       {指標: CV}
    n_videos:          算這份 CV 用了幾支影片
    cv_source:         CV 從哪來 —— 這個參數決定要不要採信
                         'calibration'  獨立校準影片（≥3 支標準動作，
                                        與建模影片分開）→ 直接採信
                         其他 / None    建模影片自估 → 需 n≥3 才採信

    ── 【v8.7】為什麼要區分來源 ────────────────────────────────────────
    建模影片自估的 CV 是**循環的**：模板由它們做出來、尺規也取了它們之間
    的變異當下限，回頭再用它們評分，變異早就被吸收，CV 永遠 ≈ 0。
    所以原本設了 n≥3 的門檻擋著 —— 但實際上光是 n 夠也救不了循環性。

    獨立校準影片沒有這個問題：它們沒參與建模、沒影響尺規，
    量到的 CV 就是「同一個人重複拍，這個指標的分數會飄多少」。

    實測差別（深蹲自選機位 Torso Lean）：
        建模自估 CV ≈ 0     → 通過 → 帶著 5 分進總分 → 一支正常動作拿 45 分
        獨立校準 CV = 0.79  → 擋下 → 標準組 45/89/91 變成 99/100/100
    而且擋掉不穩指標後，偵測力反而變強（深蹲正面膝內夾 +35.9 → +42.8）。

    回傳 (通過的 list, {指標: (CV, 來源, 過不過)} 的說明 dict)
    """
    tbl = (RELIABILITY_CV.get(exercise_key or "", {}) or {}).get(view or "", {})
    _calib = str(cv_source or "") == "calibration"
    # 校準來源：n≥3 就採信（本來就要求 ≥3 才算得出來）
    # 建模自估：仍維持 RELIABILITY_TRUST_VIDEOS 的保守門檻
    trust = ((n_videos or 0) >= 3) if _calib else ((n_videos or 0) >= RELIABILITY_TRUST_VIDEOS)
    keep, why = [], {}
    for lab in (candidate_metrics or []):
        mcv = float(measured_cv[lab]) if (measured_cv and lab in measured_cv) else None
        tcv = float(tbl[lab]) if lab in tbl else None

        if mcv is not None and trust:
            src = (f"獨立校準（{n_videos} 支標準影片，未參與建模）" if _calib
                   else f"實測（{n_videos} 支建模影片，獨立於模板）")
            cv, ok = mcv, mcv <= cv_max
        elif tcv is not None:
            cv, ok = tcv, tcv <= cv_max
            src = "驗證表（40 支實驗資料）"
            if mcv is not None:
                src += f"（建模只有 {n_videos or '<3'} 支，自估 CV 不可用）"
        else:
            # 沒有任何信度資訊 → 不敢當作可靠，但也不能無聲丟掉。
            # 保守放行並標記，讓報告上看得到「這一項的信度未知」。
            why[lab] = (None, "無信度資料", True)
            keep.append(lab)
            continue

        why[lab] = (round(cv, 3), src, ok)
        if ok:
            keep.append(lab)
    return keep, why


# ── 錯誤型態 → 需要哪些指標才抓得到 ─────────────────────────────────────
#   用來回答使用者最關心的問題：「這個角度拍，抓不到我哪些毛病？」
#   對應關係是解剖學事實，不是統計結果。
#   每個錯誤分兩層：
#     primary   直接量這個錯誤的指標。有它才敢宣告「抓得到」。
#     secondary 錯誤發生時會連帶改變、但不是直接量它的指標。
#
#   為什麼要分：40 支資料實測有兩格「宣告抓不到、實際卻抓到了」——
#     · 深蹲正面的「深度不足」：Hip Depth 被信度關卡擋掉，但蹲淺會連帶
#       減少髖屈曲 → Torso Lean 也跟著變，分數照樣掉 31.8。
#     · 臥推自選 45° 的「肘外展」：Elbow Flare 被信度關卡擋掉，但外展會
#       改變胸口位置的肘角 → L Elbow 跟著變，分數掉 28.7。
#   把它們塞進 primary 可以讓一致率變成 12/12，但那是**拿驗證資料回頭
#   改對應表**，等於用答案調答案。所以維持 primary 只放直接量測的指標，
#   secondary 另外標示「可能連帶反映」。系統寧可少宣告，不可多宣告。
ERROR_CLASSES = {
    "squat": [
        ("深度不足",   "蹲得不夠低、沒到大腿與地面平行",
         ["Hip Depth"], ["R Knee", "L Knee", "Torso Lean"]),
        ("膝蓋內夾",   "起身時膝蓋往內塌（knee valgus）",
         ["Knee Valgus"], ["Knee Sym"]),
        ("軀幹過度前傾", "上半身倒得太前面、變成早安式",
         ["Torso Lean"], ["Hip Depth"]),
        ("左右不對稱",  "重心偏一邊、兩腿出力不均",
         ["Knee Sym"], ["Stability"]),
    ],
    "bench_press": [
        ("肘外展過開",  "手臂與軀幹接近 90°（T 字），肩關節壓力大",
         ["Elbow Flare"], ["R Elbow", "L Elbow"]),
        ("握距不當",    "握得過寬或過窄",
         ["Grip Width"], ["Elbow Flare"]),
        ("下放深度不足", "槓沒碰到胸口就推回",
         ["R Elbow", "L Elbow"], ["Forearm Vertical"]),
        ("前臂不垂直",  "手腕在肘的前方或後方，力線歪掉",
         ["Forearm Vertical"], []),
        ("左右不對稱",  "一邊先推上去",
         ["Elbow Sym"], []),
    ],
}


# ══════════════════════════════════════════════════════════════════════════
# 【v8.1】第三道關卡：效度驗證（Validated detection）
# ══════════════════════════════════════════════════════════════════════════
# 為什麼「量得到 + 量得準」還是不夠
# ────────────────────────────────
# 深蹲自選 45° 的 Knee Valgus 重測 CV = 0.02（全資料集最穩），可測性、
# 信度兩關都是滿分，於是系統宣告「這個角度抓得到膝蓋內夾」。
# 實際拿刻意內夾的影片去測 —— **只掉 7.6 分**。
#
# 原因不在指標，在**刻度**：45° 是受測者自己架的，每次位置都不同，
# 模板的跨影片變異 mad 被膨脹到典型偏差的 4.33 倍（正面只有 1.83 倍）。
# 分母一大，z 就縮水，真正的錯誤被評分曲線吸收掉：
#     正面 z: 2.36 → 12.00（舊輪數字；最新一輪掉 56.8 分）
#     45°  z: 0.95 →  4.69，掉  7.6 分
# 兩邊的 raw_loss 反應倍率其實都不差（3.74× vs 2.34×）。
#
# 有沒有執行期可算的量能預測這件事？**掃過了，沒有。**
#   mad/med 當預測子：12 組只對 4 組（比亂猜差）。
#   反應倍率本身要有「刻意犯錯的影片」才算得出來，產品端沒有。
# 所以這一關**只能靠實驗驗證**，不能靠推論。這也是為什麼要做這個實驗。
#
# 規則：只有在實驗中證明「該機位對該錯誤真的會掉分」的組合，
# 才敢對使用者宣告「這個角度抓得到」。其餘一律降級為
# 「有量到，但沒驗證過」。寧可少宣告，不可多宣告。
#
# 判定門檻：總分掉 ≥20 分（實測落差極清楚 —— 有效的是 76.7 / 61.9，
# 無效的最高只有 7.6，中間沒有任何一組，不存在門檻敏感度問題）。
VALIDATED_DETECTION = {
    "squat": {
        # 【v9.2】數字更新到最新一輪（46 支，2026-08-04）
        "frontal_0": ["膝蓋內夾"],          # 實測掉 56.8 分（離已驗證機位 2.7°）
        "sagittal_90": [],                  # 額狀面錯誤，正側面投影退化 —— 只掉 8.9 分
        "oblique_45": [],                   # 自選機位靠 pose_gate 條件式宣告，不寫死
    },
    "bench_press": {
        "overhead": ["肘外展過開"],          # 實測掉 40.3 分
        "sagittal_90": [],                  # 前臂骨長左右差 32–47% → 關卡① 直接拒答
        "oblique_45": [],                   # 自選機位靠 pose_gate 條件式宣告，不寫死
    },
}
#   實驗裡有拍到刻意犯錯影片的錯誤型態。沒在這份清單裡的錯誤
#   （例如「軀幹過度前傾」）沒有對照影片，所以無從驗證，
#   一律標成「未驗證」而不是「抓得到」。
TESTED_ERRORS = {"squat": ["深度不足", "膝蓋內夾"],
                 "bench_press": ["肘外展過開", "握距不當"]}


# ══════════════════════════════════════════════════════════════════════════
# 【v8.2】計次也套同一套關卡：這個機位「數不數得準」是可以事先知道的
# ══════════════════════════════════════════════════════════════════════════
# 2026-08-01 的 40 支實測，把每支影片的每一條候選訊號都跟真值比對
# （403 筆候選），結論非常乾脆：
#
#   深蹲 正側面／正面／自選     右膝角度・肩高・髖高 等 5 條訊號**全部 7/7**
#   臥推 自選 45°              右前臂投影長・腕高 等 5 條訊號**全部 6/6**
#   臥推 正側面 90°            最好的單一訊號（右肘高度）只有 60%
#   臥推 正上方俯視            最好的單一訊號（右腕高度）只有 67%
#
# 這是**投影幾何的必然，不是演算法的缺陷**：
#   · 俯視：推的方向（垂直）正好沿著相機光軸 → 主要動作在 2D 上幾乎沒有投影，
#     只剩肘間距、投影長這些次要量，訊噪比本來就差。
#   · 正側面：躺姿 + 遠側手臂被近側完全遮擋，近側行程又短。
#   · 深蹲：無論哪個機位，髖的垂直位移都完整落在影像平面上。
#
# 已經試過而且**確認無效**的補救（都用同一批 40 支驗證，別再重試）：
#     加權共識（trr/cv/ratio 三特徵加權投票）   33/40，比現行 35/40 差
#     FFT 主頻當物理合理性過濾器（容差 0.4–1.1） 33–35/40，沒有增益
#     角度型候選優先                            臥推 8/20，大幅變差
#     每機位固定用實測最準的那條訊號（留一驗證） 27/40，大幅變差
#     頻域直接取代遲滯法                        33/40
#   FFT 單獨用是 33/40，而且跟遲滯法錯在**不同**的影片上（兩者都錯只有 1 支，
#   理論上限 39/40）—— 但沒有任何執行期可算的量能判斷「這支該信誰」。
#
# 所以做法跟評分一致：**不硬算，而是誠實標示可信度**，
# 並在產品端引導使用者換到數得準的角度。
COUNTING_ACCURACY = {
    "squat":       {"sagittal_90": 1.00, "frontal_0": 1.00, "oblique_45": 1.00},
    "bench_press": {"oblique_45": 1.00, "overhead": 0.71, "sagittal_90": 0.57},
}
COUNTING_TRUST_MIN = 0.90      # 低於此值一律標「次數需要確認」


def counting_reliability(exercise_key, view, consensus=None, free_placement=False):
    """這個機位的計次可不可信。

    consensus:       (同意數, 池大小)，來自候選共識投票。有的話會再往下修。
    free_placement:  這是使用者自己架的機位嗎

    ── 【v8.9】自選機位不得繼承別人的計次正確率 ────────────────────────
    自選機位在建模時會被解析成一個等效機位代號（實測臥推自選 → overhead），
    然後就沿用那個機位的實測正確率。但正確率是**這個角度實際數對幾支**，
    不是幾何性質，不會因為「看起來像」就跟著繼承。

    實測反例：臥推自選機位宣告 low / 71%（繼承 overhead），
             實際 6/6 = 100%。方向是保守的，但依據是錯的。
    這與先前修掉的「效度繼承」「信度繼承」是同一類問題的第三個變種。

    改成：自選機位用該動作**最差機位**的正確率當保守估計，並標明這是
    下界推估、不是實測 —— 因為我們確實不知道使用者架在哪。
    """
    _tbl0 = COUNTING_ACCURACY.get(exercise_key or "", {}) or {}
    if free_placement:
        acc = min(_tbl0.values()) if _tbl0 else None
        if acc is not None:
            lv = "high" if acc >= COUNTING_TRUST_MIN else "low"
            return {"level": lv, "accuracy": acc,
                    "reason": (f"自選機位無實測資料，採該動作最差機位的 {acc:.0%} 當保守下界"
                               f"（不是這個角度的實測值）"),
                    "advice": ("想要有保證的次數，請照指示架設機位"
                               if acc < COUNTING_TRUST_MIN else None),
                    "basis": "lower_bound_free_placement"}
    acc = _tbl0.get(view or "")
    tbl = COUNTING_ACCURACY.get(exercise_key or "", {}) or {}
    best = max(tbl.items(), key=lambda t: t[1]) if tbl else None
    if acc is None:
        return {"level": "unknown", "accuracy": None,
                "reason": "這個機位沒有實測資料", "advice": None}
    if acc >= COUNTING_TRUST_MIN:
        lv, reason = "high", f"實測此機位計次正確率 {acc:.0%}"
        advice = None
    else:
        lv = "low"
        reason = (f"實測此機位計次正確率只有 {acc:.0%}："
                  + ("推的方向正對鏡頭，垂直行程在畫面上幾乎沒有投影"
                     if view == "overhead" else
                     "躺姿讓遠側手臂被完全遮擋，近側的行程又短"))
        advice = (f"想要準確的次數，請改用「{VIEW_ZH.get(best[0], best[0])}」"
                  f"（實測 {best[1]:.0%}）" if best and best[1] >= COUNTING_TRUST_MIN else None)
    # 共識不足再降一級
    if consensus and len(consensus) == 2 and consensus[1]:
        agree, pool = consensus
        if pool and agree / pool < 0.6 and lv == "high":
            lv = "medium"
            reason += f"；但這支影片的候選訊號只有 {agree}/{pool} 一致"
    return {"level": lv, "accuracy": acc, "reason": reason, "advice": advice}


# ══════════════════════════════════════════════════════════════════════════
# 【v9.0】已驗證機位的**實測相機姿態** —— 效度宣告改綁角度，不綁機位代號
# ══════════════════════════════════════════════════════════════════════════
#
# 為什麼要換掉「宣告的機位代號」
# ────────────────────────────
# 舊做法用 view 字串決定要不要宣告偵測能力，並對自選機位一律拒絕
# （free_placement）。這個判準有兩個毛病：
#
#   ① 機位代號是**猜**出來的。自選機位由 resolve_actual_view 依左右可見度比
#      歸類，但「正面」「正上方」「斜前上方」的比值都 ≈1.0，分不出來。
#   ② 「自己架的所以不可靠」對實際資料不成立。實測受測者自選機位的
#      重複性（方位角全距）只有 5.1°，比被指定的正面機位（7.8°）還穩。
#
# 真正決定偵測力的是**角度差**，而那個我們量得到（metrology.camera_pose
# 從骨架反推，不需要任何額外硬體）：
#
#     深蹲 · 膝蓋內夾      離已驗證角度      掉分
#       正面 0°（基準）        0°          +56.8  ✅
#       自選機位             20.3°        +31.9  ✅
#       正側面 90°           63.6°        +22.1  ❌ 假的 —— Knee Valgus
#                                              權重是 0，掉分全靠 Hip Depth /
#                                              Torso Lean 的連帶變化
#     臥推 · 肘外展
#       正上方俯視（基準）      0°          +40.3  ✅
#       自選機位             27.7°        +27.8  ✅
#       正側面 90°           74.7°          —    ⛔ 骨長關卡已作廢
#
# ⇒ 偏 20–28° 仍過 20 分門檻；偏 63° 只剩連帶效應。
#   28°–63° 之間沒有資料，所以取 30° 當**保守**容差，
#   論文須標明「30°–63° 為未測區間」。
#
# 這麼改的產品意義：判準從「你宣告了什麼」變成「你實際架在哪」。
# 使用者自己架但剛好落在容差內，一樣拿得到宣告；
# 照指示架卻架歪了，也一樣會被擋下。
VALIDATED_CAMERA_POSE = {
    "squat": {
        "sagittal_90": (-113.2, 0.5),
        "frontal_0":   (-176.7, 6.5),
    },
    "bench_press": {
        "sagittal_90": (-100.0, 10.1),
        "overhead":    (-175.6, 6.9),
    },
}
POSE_TOLERANCE_DEG = 30.0        # 實測 20.3° / 27.7° 仍有效，63.6° 失效


def _pose_vec(az_deg, el_deg):
    """(方位角, 仰角) → 單位向量。用來算兩個相機方向的夾角。"""
    import numpy as _np
    a, e = _np.radians(float(az_deg)), _np.radians(float(el_deg))
    return _np.array([_np.sin(a) * _np.cos(e), _np.sin(e), _np.cos(a) * _np.cos(e)])


def camera_offset_deg(pose_a, pose_b):
    """兩個相機姿態之間的夾角（度）。

    用向量夾角而不是「方位差 + 仰角差」，因為方位角在極區會退化，
    而且兩個角度的差要合成才有意義。方位角本身也會在 ±180° 繞回
    （實測臥推自選 169.2° vs 俯視 −175.6°，直接相減是 344.8°，實際只差 15.2°）。
    """
    import numpy as _np
    try:
        c = float(_np.dot(_pose_vec(*pose_a), _pose_vec(*pose_b)))
        return float(_np.degrees(_np.arccos(_np.clip(c, -1.0, 1.0))))
    except Exception:
        return float("nan")


def pose_gate(exercise_key, view, measured_pose, tol=POSE_TOLERANCE_DEG):
    """這支影片的相機角度，離「該機位已驗證的角度」多遠、在不在容差內。

    measured_pose: (azimuth_deg, elevation_deg)，由 metrology.camera_pose 量出
    回傳 dict(ok, offset_deg, reference, tol) —— 量不到就 ok=None（不阻擋也不背書）
    """
    ref = (VALIDATED_CAMERA_POSE.get(exercise_key or "", {}) or {}).get(view or "")
    if not ref or not measured_pose or measured_pose[0] is None:
        return {"ok": None, "offset_deg": None, "reference": ref, "tol": tol}
    off = camera_offset_deg(measured_pose, ref)
    if off != off:                                   # NaN
        return {"ok": None, "offset_deg": None, "reference": ref, "tol": tol}
    return {"ok": bool(off <= tol), "offset_deg": round(off, 1),
            "reference": ref, "tol": tol}


def detectable_errors(exercise_key, scored_metrics, view=None, free_placement=False,
                      measured_pose=None):
    """這個機位抓得到／抓不到哪些錯誤型態。

    free_placement: 這支影片是不是「使用者自己架的機位」。

        ── 【v8.4】為什麼自選機位不能繼承效度驗證 ──────────────────────
        自選機位（C 機位）在建模時會被解析成一個等效機位代號 ——
        實測深蹲自選 45° 解析成 `frontal_0`、臥推自選解析成 `overhead`。
        這個解析對「量得到什麼」是對的（可見度與 ROM 確實相近），
        但**效度驗證不能跟著繼承**：

            深蹲 正面 0°（照指示架）  膝內夾掉 56.8 分  ✅ 驗證通過
            臥推 俯視（照指示架）     肘外展掉 40.3 分  ✅ 驗證通過

        【v9.0 更新】自選機位不再一律否決，改成**依實測角度條件式宣告**
        （見 pose_gate）：量出來離已驗證機位 ≤30° 就承認，超過就不宣告。
        最新一輪（46 支）實測深蹲自選離正面 20.9°，膝內夾掉 31.9 分 —— 有效；
        角度掃描到 31.7° 時只掉 17.4 分，跌破 20 分門檻。交叉點落在 29.7°，
        這就是容差訂 30° 的來源。**「量得到」不等於「量得準到足以抓出錯誤」。**

        繼承驗證資格會直接造成「宣告抓得到、實際沒抓到」——
        這是整個系統最不該犯的一種錯。所以自選機位一律視為未驗證。

    回傳 (已驗證抓得到, 抓不到或未驗證)，每筆是 (名稱, 說明, 依據的指標)。

    三種狀態，對應三道關卡的結果：
      ✅ 已驗證抓得到 —— 主要指標在計分集裡，**而且**實驗證明真的會掉分
      🟡 有量到但未驗證 —— 主要指標在計分集裡，但沒有對照影片可以驗證
      ⛔ 抓不到 —— 主要指標根本不在計分集裡（量不到或量不準）

    設計原則：**只認 primary，而且只認驗證過的**。使用者看到
    「這個角度抓得到膝內夾」就會信它，宣告錯的代價比漏宣告高得多。
    """
    have = set(scored_metrics or [])

    # ── 【v9.0】判準從「宣告的機位代號」改成「量出來的相機角度」 ──────────
    #   舊行為：free_placement → 一律不宣告。
    #   問題：那是用「你說你是誰」在判斷，而不是「你實際在哪」。實測受測者
    #   自選機位的重複性（5.1°）比被指定的正面（7.8°）還好，一律否決並不合理；
    #   反過來說，照指示架卻架歪 30° 的人，舊邏輯照樣給他宣告。
    #
    #   新行為：量得到角度就用角度判（在容差內就宣告，不管你是自選還是指定）；
    #   量不到角度才退回舊的保守規則。詳見 VALIDATED_CAMERA_POSE 的說明。
    _pg = pose_gate(exercise_key, view, measured_pose) if measured_pose else None
    _pose_ok = _pg["ok"] if _pg else None
    _pose_off = _pg["offset_deg"] if _pg else None

    if _pose_ok is True:
        validated = set((VALIDATED_DETECTION.get(exercise_key or "", {}) or {}).get(view or "", [])
                        ) if view else None
        _blocked_reason = None
    elif _pose_ok is False:
        validated = set()          # 角度離已驗證位置太遠 → 驗證不適用
        _blocked_reason = (f"相機角度離已驗證位置 {_pose_off:.0f}°（容差 {_pg['tol']:.0f}°）"
                           f"，效度驗證不適用於這個角度")
    elif free_placement:
        validated = set()          # 量不到角度 + 自己架的 → 維持保守
        _blocked_reason = "這是自己架的機位，而且量不到相機角度，效度未經驗證"
    else:
        validated = set((VALIDATED_DETECTION.get(exercise_key or "", {}) or {}).get(view or "", [])
                        ) if view else None
        _blocked_reason = None

    tested = set(TESTED_ERRORS.get(exercise_key or "", []))
    yes, no = [], []
    for name, desc, prim, sec in ERROR_CLASSES.get(exercise_key or "", []):
        hit = [m for m in prim if m in have]
        if not hit:
            sec_hit = [m for m in sec if m in have]
            no.append((name, desc + ("（{} 可能連帶反映，但不保證）".format("、".join(sec_hit))
                                     if sec_hit else ""), prim))
        elif validated is None or name in validated:
            # 角度在容差內就照常宣告，並附上實測偏移，讓報告能交代依據
            _d = desc + (f"（相機角度離已驗證位置 {_pose_off:.0f}°，在 "
                         f"{_pg['tol']:.0f}° 容差內）" if _pose_off is not None else "")
            yes.append((name, _d, hit))
        elif _blocked_reason:
            # 角度太遠、或量不到角度又是自己架的 —— 兩種都不宣告，但理由不同
            _adv = ""
            if _pose_off is not None:
                _adv = "　把手機轉回建議角度再拍一次就能評得出來"
            no.append((name, desc + f"（{'、'.join(hit)} 有計分，但{_blocked_reason}{_adv}）", prim))
        elif name in tested:
            # 有對照影片、但實測掉分不足 → 這個角度對這個錯誤是無效的
            no.append((name, desc + f"（{'、'.join(hit)} 有計分，但實驗證明這個角度抓不出來）", prim))
        else:
            # 沒有對照影片可驗證 → 誠實標「未驗證」，不算抓得到
            no.append((name, desc + f"（{'、'.join(hit)} 有計分，但尚未經過效度驗證）", prim))
    return yes, no


# ══════════════════════════════════════════════════════════════════════════
# 骨長一致性關卡（v8.6，2026-08-03）
# ══════════════════════════════════════════════════════════════════════════
# 為什麼要加在 visibility 前面
# ──────────────────────────
# visibility 是 MediaPipe 自己回報的信心值，而**信心高不代表座標對**。
# 40 支實測：
#
#     深蹲·自選機位   可見度比 1.00（滿分）  但上臂左右長度差 35.9%
#     臥推·俯視       可見度比 0.98          但（舊規則下）多數骨段超標
#
# 骨長是物理常數 —— 同一個人左右同名骨段等長，量到不等長就是**數值錯誤**，
# 不是「信心低」。這是不需要動作捕捉真值就能用的內建判準。
#
# 兩條經 40 支資料驗證的規則
# ────────────────────────
#   ① 只看與該動作相關的骨段（見 metrology.EXERCISE_BONES）
#      舊版沒篩選 → 深蹲自選 6/6 被上臂誤判為「嚴重遮擋」，
#      但上臂與深蹲品質完全無關，腿部左右差只有 0.9–4.1%。
#
#   ② 骨長較短的那一側就是被遮擋側 —— 實測 6/6 與 visibility 判定一致。
#      物理上成立：肢段沿相機光軸前後排列時投影被壓縮，重建長度偏短。
#      有了這條，骨長不只能說「這支不可信」，還能指出**是哪一側**，
#      於是可以只砍掉壞的那側指標，保留好的那側 —— 比整支作廢精準。
#
# 修正後 40 支的判定（與效度驗證獨立比對）
#   臥推·正側面  前臂左右差 32.0%  🔴 量不到 ←→ 肘外展只掉 0.4 分 ✅一致
#   臥推·俯視    前臂左右差  1.5%  🟢 可測   ←→ 肘外展掉 23.5 分  ✅一致
#   深蹲·正面    大腿左右差  2.7%  🟢 可測   ←→ 膝內夾掉 35.9 分  ✅一致
#
# ⚠️ 骨長是**必要非充分**條件：它只管「座標可不可信」，
#    不管「這個角度看不看得到這個自由度」（那是投影幾何，由
#    check_signal_health 的 ROM 下限負責）。兩道都要過。

BONE_ASYM_MAX = 0.20

# 指標 → 依賴哪些骨段。骨段壞了，依賴它的指標就不可信。
METRIC_BONES = {
    "squat": {
        "L Knee": ["大腿", "小腿"], "R Knee": ["大腿", "小腿"],
        "Hip Depth": ["大腿"], "Knee Valgus": ["大腿", "小腿"],
        "Knee Sym": ["大腿", "小腿"], "Torso Lean": [],       # 軀幹，與四肢骨段無關
    },
    "bench_press": {
        "L Elbow": ["上臂", "前臂"], "R Elbow": ["上臂", "前臂"],
        "Elbow Flare": ["上臂"], "Elbow Sym": ["上臂", "前臂"],
        "Forearm Vertical": ["前臂"], "Grip Width": ["前臂"],
        "Bar Path": ["前臂"],
    },
}
# 需要「兩側都對」才成立的指標（左右比較類）—— 任一側壞掉就整個不可信
BILATERAL_METRICS = {"Knee Valgus", "Knee Sym", "Elbow Flare", "Elbow Sym", "Grip Width"}


def _metric_side(label):
    """指標屬於哪一側。回傳 'left' / 'right' / None（雙側或無側別）。"""
    s = str(label or "")
    if s.startswith("L ") or s.lower().startswith("left"):
        return "left"
    if s.startswith("R ") or s.lower().startswith("right"):
        return "right"
    return None


def bone_gate(exercise_key, metric_labels, bones, asym_max=BONE_ASYM_MAX):
    """骨長一致性關卡。

    參數
      bones  metrology.bone_lengths() 的輸出 {骨段: {left,right,asym,...}}

    回傳 (可用指標 list, 被擋原因 dict, 診斷 dict)

    邏輯
      1. 只檢查該動作相關的骨段
      2. 超標骨段 → 較短側標為不可信
      3. 砍掉：① 落在不可信側的單側指標　② 依賴該骨段的雙側比較指標
         保留：可信側的單側指標（這是「指出哪一側」帶來的精準度）
    """
    labels = list(metric_labels)
    # bad_bones 一律是 dict（沒壞就是空 dict）—— 型別要一致，
    # 否則呼叫端 .items() 會在「全部通過」的路徑上炸掉。
    if not bones:
        return labels, {}, {"checked": [], "bad_bones": {}, "bad_sides": []}

    try:
        from . import metrology as _M
    except Exception:                                     # pragma: no cover
        import core.metrology as _M                       # type: ignore
    rel = _M.relevant_bones(exercise_key)
    scope = [b for b in bones if rel is None or b in rel]

    bad_bones, bad_sides = {}, set()
    for b in scope:
        d = bones.get(b) or {}
        a = float(d.get("asym", 0) or 0)
        if a <= asym_max:
            continue
        L, R = float(d.get("left", 0) or 0), float(d.get("right", 0) or 0)
        side = "left" if L < R else "right"               # 規則②：較短側＝被擋側
        bad_bones[b] = {"asym": round(a, 4), "bad_side": side,
                        "left": L, "right": R}
        bad_sides.add(side)

    if not bad_bones:
        return labels, {}, {"checked": scope, "bad_bones": {}, "bad_sides": []}

    dep = METRIC_BONES.get(exercise_key or "", {})
    usable, why = [], {}
    for lab in labels:
        need = dep.get(lab)
        if need is None:            # 沒登錄依賴關係 → 不敢亂砍，放行
            usable.append(lab)
            continue
        hit = [b for b in need if b in bad_bones]
        if not hit:
            usable.append(lab)
            continue
        ms = _metric_side(lab)
        if lab in BILATERAL_METRICS or ms is None:
            # 左右比較類：任一側腦補就整個沒意義
            why[lab] = (f"骨長不對稱（{'、'.join(hit)} 左右差 "
                        f"{max(bad_bones[b]['asym'] for b in hit):.0%}），"
                        f"左右比較類指標失效")
            continue
        if ms in bad_sides:
            why[lab] = (f"{'左' if ms == 'left' else '右'}側被遮擋"
                        f"（{'、'.join(hit)} 左右差 "
                        f"{max(bad_bones[b]['asym'] for b in hit):.0%}，該側骨長偏短＝重建失敗）")
            continue
        usable.append(lab)          # 好的那一側保留

    return usable, why, {"checked": scope,
                         "bad_bones": bad_bones,
                         "bad_sides": sorted(bad_sides)}


def measured_usable_metrics(exercise_key, metric_labels, metric_vis, feature_cols=None,
                            vis_min=0.55, bones=None):
    """【v6.4】由**建模影片的實測資料**決定這個機位量得到哪些指標。

    ── 為什麼要換掉先驗表 ──────────────────────────────────────────────
    v6.1 把可用指標集改成查 VIEW_METRIC_TABLE（寫死的 機位×指標 表）。
    2026-07-31 的 40 支資料顯示這個做法在自選機位上系統性地砍錯東西：

        臥推 / 自選機位   L Elbow 可見度 0.99 → 被砍
                          R Elbow 可見度 0.89 → 被砍
                          Forearm Vertical 0.89 → 被砍
                          Bar Path 0.96 → 被砍
                          七個指標只剩三個計分，分數掉到 0–3 分
        深蹲 / 自選機位   Torso Lean 可見度 1.00 → 被砍

    受測者親眼確認自選機位「幾乎沒有任何身體部位被重疊」，實測可見度
    0.89–1.00 也完全支持這件事 —— 是表在亂砍，不是相機看不到。

    根本原因：resolve_actual_view() 只用**左右可見度比**把 C 機位歸類到
    某個既有機位。但「正上方俯視」「斜前上方」「正面」三者的左右可見度比
    都 ≈1.0，分不出來 —— 於是 C 被套上最嚴苛的 overhead 表，
    連帶把它其實量得到的指標一起砍掉。

    ── 改成量出來 ──────────────────────────────────────────────────
    先驗表想表達的其實只有兩個物理機制，而**兩個都可以直接量**：

        ① 遮擋      → 該指標依賴的關節可見度低
        ② 投影退化  → 關節看得到（可見度高），但該指標的活動範圍
                       低於解剖學下限（例如正上方俯拍臥推，肘角
                       ROM 只剩 9–27°，解剖下限 28°）
        ③ 量測失效  → 數值落在解剖學合理區間外（正側面量到握距
                       2.65 倍肩寬，真人不可能）

    ①用 metric_vis、②③用 check_signal_health，都是現成的。

    ── 穩定性（v6.1 當初換表的理由）────────────────────────────────
    「逐支偵測會讓指標集跳動」這個顧慮是對的，但解法不是寫死，
    而是**只在建模階段量一次、存進模板**，該機位所有受測影片沿用。
    這正是 v5.9 原本的做法，v6.1 連同解法一起丟掉了。

    vis_min=0.55 的依據（同一批 40 支）：
        真的被擋的：0.26 – 0.31
        真的看得到：0.85 – 1.00
        中間是空的 → 0.55 落在缺口中央，怎麼抖都不會誤判。

    ── v8.6 新增第 0 道：骨長一致性（bones 參數）─────────────────────
    順序刻意排在 visibility 前面，因為 visibility 是 MediaPipe 的**自評**，
    骨長是**物理約束**。實測有影片 visibility 1.00 但骨長左右差 35.9%
    —— 自評分數再高也救不了錯誤的座標。詳見 bone_gate() 的說明。

    回傳 (可用指標 list, 每個指標的理由 dict)
    """
    import numpy as np
    labels = list(metric_labels)
    usable, why = [], {}

    # ── 第 0 道：骨長一致性。先砍掉「座標本身就是錯的」那些指標 ──
    bone_block = {}
    if bones:
        kept, bone_block, _diag = bone_gate(exercise_key, labels, bones)
        why.update(bone_block)

    vm = None
    if metric_vis is not None:
        a = np.asarray(metric_vis, dtype=float)
        if a.ndim == 2 and a.shape[1] >= len(labels):
            vm = np.nanmean(a, axis=0)
    for i, lab in enumerate(labels):
        if lab in bone_block:          # 骨長已否決，不必再看 visibility
            continue
        v = float(vm[i]) if vm is not None and i < len(vm) else None
        if v is not None and np.isfinite(v) and v < vis_min:
            why[lab] = f"被遮擋（建模影片平均可見度 {v:.2f} < {vis_min}）"
            continue
        col = None
        if feature_cols is not None:
            try:
                col = np.asarray(feature_cols, dtype=float)[:, i]
            except Exception:
                col = None
        if col is not None and col.size:
            ok, reason = check_signal_health(exercise_key, lab, col)
            if not ok:
                why[lab] = reason      # ROM 過小＝投影退化；區間外＝量測失效
                continue
        usable.append(lab)
        why[lab] = f"可用（可見度 {v:.2f}）" if v is not None else "可用"
    return usable, why


def usable_metrics_for(exercise_key, view, metric_labels, occluded_side=None, cfg=None):
    """這個機位「先驗上」量得到哪些指標。找不到表就全給（不擋）。

    occluded_side：這支影片實際被擋住的是哪一側（由 bilateral_visibility 量出）。
    有給的話會先把表的近／遠側對到實際左右，見 orient_table()。
    """
    tbl = (VIEW_METRIC_TABLE.get(exercise_key or "") or {}).get(view or "")
    if not tbl:
        return list(metric_labels)
    tbl = orient_table(exercise_key, view, tbl, occluded_side, cfg)
    return [m for m in metric_labels if tbl.get(m, FULL) > 0.0]


def resolve_actual_view(exercise_key, metric_vis, cfg, declared_view=None):
    """C 機位（使用者自選）：從資料判定它**實際等效於哪個機位**。

    A/B 是我們指定的角度，先驗表直接查得到。C 是受測者自己架的，角度事先
    不知道 —— 但我們真正需要知道的不是「幾度」，而是「遮住了什麼」，
    那個可以量：左右成對肢體的可見度比。

        比值 < 0.40  一側被擋   → 等效於正側面（矢狀面機位）
        比值 ≥ 0.70  兩側都看得到 → 等效於正面／正上方（額狀面機位）
        中間          部分遮擋   → 斜角

    判定完就套那個機位的先驗表，C 機位因此也有明確、穩定的指標集。

    ⚠️ 必須在**建模階段**判定一次，存進模板讓受測沿用 —— 逐支判定會讓
    同一組影片的指標集跳動，重測信度與效度就不可解讀了（v5.9 的教訓）。

    回傳 (機位代號, 判定依據 dict)
    """
    bv = bilateral_visibility(None, cfg, metric_vis=metric_vis)
    if not bv:
        return declared_view or VIEW_OBLIQUE_45, None
    r = bv["ratio"]
    if r < 0.40:
        view = VIEW_SAGITTAL_90
    elif r >= 0.70:
        # 臥推是躺姿，「兩側都看得到」在實務上就是正上方俯視
        view = VIEW_OVERHEAD if exercise_key == "bench_press" else VIEW_FRONTAL_0
    else:
        view = VIEW_OBLIQUE_45
    return view, bv


def estimate_view_angle(lms):
    """從骨架反推「人體相對鏡頭的朝向角」，單位：度。

        0°  = 額狀面正對鏡頭（正面／正後方拍；躺姿臥推＝正上方俯視）
        90° = 矢狀面正對鏡頭（正側面拍）

    原理：肩線（左肩↔右肩）與髖線在 **world 座標**裡的分量。
      · 正面拍 → 肩線幾乎全在影像水平方向 x，深度分量 z ≈ 0
      · 正側面 → 肩線幾乎全在深度方向 z，x ≈ 0
      角度 = atan2(|dz|, |dx|)

    為什麼要有這個 —— 實驗只測 0° 和 90° 兩個端點，但真實使用者最常
    隨手架成斜 45°。與其把所有角度都測過一遍，不如讓系統自己知道
    現在是幾度：可以（a）選對應的模板與可測性、（b）偏離太多時直接
    提示使用者調整，而不是默默算出一個不可信的分數。

    MediaPipe 的 z 是單目推估、精度低於 x/y，但用來粗分 0/45/90 綽綽有餘：
    模擬 z 帶 15% 相對誤差時，估計偏差仍在 ±8° 以內。

    lms: (N, 33, 5) —— 欄 0-1 為 2D 正規化座標、欄 2-4 為 world (x, y, z)
    回傳 float 或 None（骨架不足時）
    """
    import numpy as np
    try:
        a = np.asarray(lms, dtype=float)
        if a.ndim != 3 or a.shape[1] < 25 or a.shape[2] < 5:
            return None

        def _n(v, ax=-1):
            return np.linalg.norm(v, axis=ax)

        # 【v5.6】改用「2D 投影比 ÷ 3D 真實比」，不要直接拿 z 去 atan2。
        #   舊版 atan2(|dz|, |dx|) 完全押在 z 上，而 MediaPipe 的 z 對**躺姿**
        #   特別不準（訓練資料以站姿為主）—— 實測正上方俯視的臥推被判成 50 幾度。
        #   新版把角度資訊主要放在 x/y（精度高很多）：
        #     肩線 2D 投影 / 軀幹 2D 長度   ÷   肩線 3D 長度 / 軀幹 3D 長度  =  cos θ
        #   軀幹長軸在這兩個機位下都躺在影像平面內，剛好可以當「不受角度影響」的
        #   尺規，把「人離鏡頭多遠」這個未知數消掉。
        s2 = _n(a[:, 11, 0:2] - a[:, 12, 0:2])                       # 肩線 2D
        t2 = _n((a[:, 11, 0:2] + a[:, 12, 0:2]) / 2
                - (a[:, 23, 0:2] + a[:, 24, 0:2]) / 2)               # 軀幹 2D
        s3 = _n(a[:, 11, 2:5] - a[:, 12, 2:5])                       # 肩線 3D
        t3 = _n((a[:, 11, 2:5] + a[:, 12, 2:5]) / 2
                - (a[:, 23, 2:5] + a[:, 24, 2:5]) / 2)               # 軀幹 3D
        ok = (np.isfinite(s2) & np.isfinite(t2) & np.isfinite(s3) & np.isfinite(t3)
              & (t2 > 1e-4) & (s3 > 1e-4) & (t3 > 1e-4))
        if ok.sum() >= 5:
            # 3D 的「肩寬/軀幹長」在解剖上必定落在 0.5–1.2。超出這個範圍代表
            # world 座標本身不可信 —— 躺姿（臥推）最常發生：MediaPipe 以站姿
            # 資料為主訓練，躺著時 z 會把軀幹壓扁，t3 被低估、s3/t3 爆大，
            # 換算出來的角度就整個偏高（實測正上方俯視被判成 54°）。
            # 這種時候改用解剖學常數當基準，寧可犧牲一點個體精度，
            # 也不要讓一個壞掉的 3D 比值主導結果。
            r3 = np.median(s3[ok] / t3[ok])
            r3_use = r3 if 0.5 <= r3 <= 1.2 else 0.78
            ratio = (s2[ok] / t2[ok]) / r3_use
            cos_t = np.clip(ratio, 0.0, 1.0)
            return float(np.degrees(np.arccos(np.median(cos_t))))

        # 資料太少才退回舊的 z 法
        out = []
        for i, j in ((11, 12), (23, 24)):
            d = a[:, i, 2:5] - a[:, j, 2:5]
            m = np.isfinite(d).all(axis=1) & (_n(d) > 1e-3)
            if m.any():
                out.append(np.degrees(np.arctan2(np.abs(d[m, 2]), np.abs(d[m, 0]))))
        return float(np.median(np.concatenate(out))) if out else None
    except Exception:
        return None



# 每個動作「一定要在畫面內」的關節（MediaPipe landmark index）
_FRAMING_JOINTS = {
    "squat":       {11: "左肩", 12: "右肩", 23: "左髖", 24: "右髖",
                    25: "左膝", 26: "右膝", 27: "左踝", 28: "右踝"},
    "deadlift":    {11: "左肩", 12: "右肩", 23: "左髖", 24: "右髖",
                    25: "左膝", 26: "右膝", 27: "左踝", 28: "右踝"},
    "bench_press": {11: "左肩", 12: "右肩", 13: "左肘", 14: "右肘",
                    15: "左腕", 16: "右腕"},
    "overhead_press": {11: "左肩", 12: "右肩", 13: "左肘", 14: "右肘",
                       15: "左腕", 16: "右腕", 23: "左髖", 24: "右髖"},
}
_FRAMING_DEFAULT = {11: "左肩", 12: "右肩", 23: "左髖", 24: "右髖",
                    25: "左膝", 26: "右膝"}


def check_framing(lms, exercise_key=None, margin=0.02):
    """取景檢查：需要的關節有沒有全程待在畫面內。

    使用者不會照量角器站位 —— 他們會自己微調到一個「全身塞得進畫面、
    動作全程不出框」的位置，那個角度由場地與器材決定。所以比起強制角度，
    更該檢查的是**取景到底可不可用**：關節一旦被裁掉，該指標整段就是空的，
    分數卻還是會算出來（剩下的權重重新正規化），看起來完全正常。

    特別要抓「動作極值時才出框」：深蹲站直時全身都在，蹲到底腳掌卻被裁掉；
    臥推手臂鎖死時腕關節頂出上緣。平均值看不出來，要看最糟的那些幀。

    lms: (N, 33, 5)，欄 0-1 為 2D 正規化座標（0–1）
    回傳 dict(in_frame_ratio, worst, joints={名稱: 出框比例})
    """
    import numpy as np
    try:
        a = np.asarray(lms, dtype=float)
        if a.ndim != 3 or a.shape[2] < 2:
            return None
        jm = _FRAMING_JOINTS.get(exercise_key or "", _FRAMING_DEFAULT)
        idx = [i for i in jm if i < a.shape[1]]
        if not idx:
            return None
        xy = a[:, idx, 0:2]
        valid = np.isfinite(xy).all(axis=2) & (np.abs(xy).sum(axis=2) > 1e-6)
        inside = ((xy[:, :, 0] > margin) & (xy[:, :, 0] < 1 - margin) &
                  (xy[:, :, 1] > margin) & (xy[:, :, 1] < 1 - margin))
        okf = np.where(valid, inside, True)          # 沒偵測到的幀不算「出框」
        per_joint = {}
        for k, i in enumerate(idx):
            n = int(valid[:, k].sum())
            if n:
                per_joint[jm[i]] = round(float(1.0 - okf[valid[:, k], k].mean()), 3)
        frame_ok = okf.all(axis=1)
        return {
            "in_frame_ratio": round(float(frame_ok.mean()), 3),
            "worst": max(per_joint, key=per_joint.get) if per_joint else None,
            "joints": {k: v for k, v in sorted(per_joint.items(),
                                               key=lambda x: -x[1]) if v > 0.0},
        }
    except Exception:
        return None





# ══════════════════════════════════════════════════════════════════════════
# 【v6.0】計次訊號：依機位選，而且只用 2D 座標
# ══════════════════════════════════════════════════════════════════════════
# 為什麼不能一律用關節角度 —— 角度必須靠 world z 才算得出來，而 z 在
# 「動作方向正對鏡頭」的機位上會退化。實測臥推正上方俯視：七個指標的
# 可見度全都 ≥0.96（骨架抓得很好），但肘角 ROM 只有 13–27°（解剖下限 28°），
# 拿它計次就把 5 下切成 9 下。骨架沒問題，是「用錯量」。
#
# 計次其實不需要解剖角度，只需要一個「隨動作週期單調變化、而且在該機位的
# 2D 畫面上看得清楚」的量。以下三個都只用 x/y —— MediaPipe 的 2D 精度
# 遠高於 z，這正是它們在退化機位仍然可靠的原因。
COUNTING_SIGNAL = {
    "squat": {
        # 人上下蹲，髖的垂直位移在任何機位都看得到
        "*": ("hip_height", "髖部垂直高度"),
    },
    "deadlift": {
        "*": ("hip_height", "髖部垂直高度"),
    },
    "bench_press": {
        # 槓上下移動 → 腕的垂直位置
        # ⚠️ 這裡用字面值不用常數 —— COUNTING_SIGNAL 是模組層級的 dict，
        #   定義時就會求值，而 VIEW_* 常數宣告在本檔更後面，會 NameError。
        "sagittal_90": ("wrist_height", "腕部垂直高度"),
        "oblique_45":  ("wrist_height", "腕部垂直高度"),
        "frontal_0":   ("wrist_height", "腕部垂直高度"),
        # 正上方：上下方向正對鏡頭、完全看不到。但下放時肘外展、推起時內收，
        # 雙肘水平間距是這個機位唯一清楚的週期訊號。
        "overhead":    ("elbow_span", "雙肘間距（2D）"),
    },
    "overhead_press": {
        "*": ("wrist_height", "腕部垂直高度"),
    },
}


# 【v6.4】計次候選訊號。
#   每筆 = (顯示名稱, 算法, 依賴的 confs 索引)
#   confs 是 8 個關節的可見度，順序依動作而定：
#     squat / deadlift : [左肩 右肩 左髖 右髖 左膝 右膝 左踝 右踝]
#     bench / press    : [左肩 右肩 左肘 右肘 左腕 右腕 左髖 右髖]
#   算法只吃 landmarks 的欄 0-1（2D 正規化座標），完全不碰 z。
#
# 為什麼要一次列這麼多 ──────────────────────────────────────────────
#   舊版每個機位只寫死一條訊號，而且好幾條是**雙側平均**
#   （wrist_height = (左腕y + 右腕y)/2、hip_height 同理）。
#   正側面拍一定有一隻手/腳被擋，MediaPipe 會腦補一條幾乎不動的假訊號，
#   平均下去振幅直接被腰斬 —— 這正是 feature 欄早就修掉的 avg_elbow 問題，
#   但計次訊號這邊沒跟著修。
#   實測 2026-07-31 臥推正側面：明明右腕可見度 0.85–0.90 很乾淨，
#   卻因為跟可見度 0.15 的左腕平均，5 下數成 4 下。
#
#   所以改成：**單側訊號各自列為候選**，加上距離型訊號，
#   由上層依「可見度 → 是否合模板 rep 長度 → 規律度」挑一條最好的。
_LM = dict(LSH=11, RSH=12, LEL=13, REL=14, LWR=15, RWR=16,
           LHIP=23, RHIP=24, LKNE=25, RKNE=26, LANK=27, RANK=28)


def _y(a, i):
    return a[:, i, 1]


def _dist(a, i, j):
    return __import__("numpy").hypot(a[:, i, 0] - a[:, j, 0], a[:, i, 1] - a[:, j, 1])


def _mid(a, pair):
    """兩點的中點 (x, y)。雙腕中點 ≈ 槓在影像上的位置。"""
    i, j = pair
    return (a[:, i, 0] + a[:, j, 0]) / 2.0, (a[:, i, 1] + a[:, j, 1]) / 2.0




def _ang(a, i, j, k):
    """關節角度（度）：以 j 為頂點，i-j-k 的 2D 夾角。

    【v7.2】只用影像平面的 x/y，不碰 z（z 是單目推估、精度差得多）。
    角度型訊號的兩個好處：
      · 對「人在畫面裡的位置漂移」免疫 —— 位置型會被鏡頭晃動污染
      · 只要三個關節點都在就成立，不必要求特定關節（例如腕）可見度也高
    臥推的肘角 170°→90°→170°、深蹲的膝角 170°→90°→170°，
    都是該動作最直接的週期訊號。
    """
    np_ = __import__("numpy")
    v1x, v1y = a[:, i, 0] - a[:, j, 0], a[:, i, 1] - a[:, j, 1]
    v2x, v2y = a[:, k, 0] - a[:, j, 0], a[:, k, 1] - a[:, j, 1]
    n1 = np_.hypot(v1x, v1y)
    n2 = np_.hypot(v2x, v2y)
    den = n1 * n2
    den = np_.where(den < 1e-9, np_.nan, den)
    cos = np_.clip((v1x * v2x + v1y * v2y) / den, -1.0, 1.0)
    return np_.degrees(np_.arccos(cos))


def _uses_bilateral_mean(name):
    """這條候選是不是把左右兩側平均起來算的。

    平均型在「一側被擋」時必然被污染 —— MediaPipe 對遮擋肢體會腦補一條
    幾乎不動的假訊號，平均下去振幅腰斬。單側候選本來就在清單裡，
    排除平均型不會少掉可用訊號，只會逼它選乾淨的那一側。

    實測 2026-08-01：臥推正側面挑到「腕中點高度」3 次、錯 2 次。

    【v7.2】原本還檢查「手離」「手的」兩個名字，但那兩條候選
    （手離肩線距離／手的前後位移）實測 12 次出場只對 1 次，已整條移除，
    留著只是誤導後續維護者以為清單裡還有這些項目。
    """
    return "中點" in name


COUNTING_CANDIDATES = {
    "squat": [
        ("左髖高度",      lambda a: _y(a, 23),            [2]),
        ("右髖高度",      lambda a: _y(a, 24),            [3]),
        ("髖中點高度",    lambda a: (_y(a, 23) + _y(a, 24)) / 2.0, [2, 3]),
        ("左膝高度",      lambda a: _y(a, 25),            [4]),
        ("右膝高度",      lambda a: _y(a, 26),            [5]),
        ("左肩高度",      lambda a: _y(a, 11),            [0]),
        ("右肩高度",      lambda a: _y(a, 12),            [1]),
        ("左大腿投影長",  lambda a: _dist(a, 23, 25),     [2, 4]),
        ("右大腿投影長",  lambda a: _dist(a, 24, 26),     [3, 5]),
        ("肩髖投影距離",  lambda a: _dist(a, 11, 23),     [0, 2]),
        # 【v7.2】單側膝角 —— 深蹲一下的本質就是「膝蓋彎曲→伸直」。
        #   角度對「人在畫面裡的位置漂移」免疫，而且只要髖膝踝三點在就成立，
        #   不像位置型候選還要求特定關節（例如腕）也看得到。
        ("左膝角度",      lambda a: _ang(a, 23, 25, 27),  [2, 4, 6]),
        ("右膝角度",      lambda a: _ang(a, 24, 26, 28),  [3, 5, 7]),
    ],
    "deadlift": [
        ("髖中點高度",    lambda a: (_y(a, 23) + _y(a, 24)) / 2.0, [2, 3]),
        ("左髖高度",      lambda a: _y(a, 23),            [2]),
        ("右髖高度",      lambda a: _y(a, 24),            [3]),
        ("左腕高度",      lambda a: _y(a, 15),            [0]),
        ("右腕高度",      lambda a: _y(a, 16),            [1]),
    ],
    "bench_press": [
        # 單側優先 —— 正側面一定有一隻手被擋，平均會毀掉訊號
        ("左腕高度",      lambda a: _y(a, 15),            [4]),
        ("右腕高度",      lambda a: _y(a, 16),            [5]),
        ("腕中點高度",    lambda a: (_y(a, 15) + _y(a, 16)) / 2.0, [4, 5]),
        ("左肘高度",      lambda a: _y(a, 13),            [2]),
        ("右肘高度",      lambda a: _y(a, 14),            [3]),
        # 距離型 —— 正上方俯拍時上下方向正對鏡頭，高度沒訊號，但這些還有
        ("雙肘間距",      lambda a: _dist(a, 13, 14),     [2, 3]),
        ("雙腕間距",      lambda a: _dist(a, 15, 16),     [4, 5]),
        ("左上臂投影長",  lambda a: _dist(a, 11, 13),     [0, 2]),
        ("右上臂投影長",  lambda a: _dist(a, 12, 14),     [1, 3]),
        ("左前臂投影長",  lambda a: _dist(a, 13, 15),     [2, 4]),
        ("右前臂投影長",  lambda a: _dist(a, 14, 16),     [3, 5]),
        # ── 【v7.2】單側關節角度 ────────────────────────────────────────
        #   前面所有候選量的都是**位置**或**距離**，沒有一條是關節角度。
        #   但臥推一下的本質就是「手肘彎曲→伸直」—— 肘角從約 170°（鎖死）
        #   到約 90°（槓貼胸）再回來，是最直接的週期訊號。
        #
        #   為什麼特別重要：正側面時遠側手臂被完全擋住，能用的訊號本來就少。
        #   實測 2026-08-01 有兩支正側面影片**一條候選都沒有**（全被
        #   可見度門檻刷掉），只能退回特徵欄硬切 —— 其中一支的
        #   R Elbow 可見度高達 0.857，右手明明拍得很清楚。
        #   位置型候選要求「腕」也看得到，角度型只要肩肘腕三點在就成立，
        #   而且角度對「人在畫面裡的位置漂移」免疫。
        ("左肘角度",      lambda a: _ang(a, 11, 13, 15),  [0, 2, 4]),
        ("右肘角度",      lambda a: _ang(a, 12, 14, 16),  [1, 3, 5]),
    ],
}
COUNTING_CANDIDATES["overhead_press"] = COUNTING_CANDIDATES["bench_press"]
COUNTING_CANDIDATES["barbell_row"] = COUNTING_CANDIDATES["bench_press"]
COUNTING_CANDIDATES["lat_pulldown"] = COUNTING_CANDIDATES["bench_press"]


def counting_candidates(landmarks, exercise_key, confs=None, vis_min=0.55, reasons=None):
    """列出所有「算得出來且看得到」的計次候選訊號。

    回傳 [(名稱, 訊號 ndarray, 可見度 float, 依賴的關節索引 tuple), ...]，
    依可見度由高到低排序。關節索引供上層判斷「兩條候選是不是互相獨立」——
    共識計次不能讓一群共用同一組關節的訊號互相背書。
    可見度 = 該訊號依賴的所有關節裡**最低**的那個（有一個被擋就不可信）。
    confs 為 None 時不做可見度篩選，全部回傳（可見度標 nan）。

    reasons: 傳一個 list 進來，會被填入每一條被淘汰的候選與原因。
        【v8】2026-08-01 實測有一支臥推正側面影片候選數是 **0**，
        最後退回預設的「腕中點高度」——而那支影片左側關節 100% 是 NaN
        （nan_ratio_per_col = [1,0,0,1,1,0,0]），等於拿被腦補的左腕
        去跟真的右腕平均，少算一下。**退無可退時退到雙側平均，
        正好是最不該退的地方。** 沒有淘汰理由就查不出是哪一關卡住的，
        所以這裡把理由帶出去。
    """
    import numpy as np
    _log = reasons if isinstance(reasons, list) else None

    def _drop(nm, why):
        if _log is not None:
            _log.append({"name": nm, "why": why})
    try:
        a = np.asarray(landmarks, dtype=float)
        if a.ndim != 3 or a.shape[1] < 29 or a.shape[2] < 2:
            return []
        cf = None
        if confs is not None:
            c = np.asarray(confs, dtype=float)
            if c.ndim == 2 and c.shape[1] >= 8:
                cf = np.nanmean(c, axis=0)
        out = []
        # 沒偵測到的幀 landmarks 全 0 → 轉 NaN，不要當成真實座標
        zero = (np.abs(a[:, :, 0:2]).sum(axis=(1, 2)) < 1e-6)
        for name, fn, need in COUNTING_CANDIDATES.get(exercise_key or "", []):
            try:
                sig = np.asarray(fn(a), dtype=float).copy()
            except Exception as _e:
                _drop(name, f"算不出來：{type(_e).__name__}")
                continue
            if sig.shape[0] != a.shape[0]:
                _drop(name, "長度對不上")
                continue
            sig[zero] = np.nan
            if not np.isfinite(sig).any():
                _drop(name, "整條都是 NaN（依賴的關節整支影片都沒偵測到）")
                continue
            # 【v8】cf 的長度不保證涵蓋所有 need 索引。舊版直接 cf[i]，
            #   一旦越界會拋 IndexError，而它落在 for 迴圈的 try 之外 →
            #   直接被外層 except 吞掉、整個函式回傳 []（0 候選）。
            v = float("nan")
            if cf is not None:
                try:
                    v = float(np.nanmin([cf[i] for i in need]))
                except Exception:
                    v = float("nan")           # 取不到就當作「不知道」，不要因此淘汰
            if cf is not None and np.isfinite(v) and v < vis_min:
                _drop(name, f"可見度 {v:.2f} < {vis_min:.2f}")
                continue                       # 依賴的關節有被擋 → 這條不能用
            # ── 【v7】雙側平均型候選：一側被擋時必須排除 ──────────────────
            #   「腕中點高度」「髖中點高度」是 (左+右)/2。只要有一側被擋，
            #   MediaPipe 會腦補一條幾乎不動的假訊號，平均下去振幅被腰斬 ——
            #   這正是 feature 欄早就修掉的 avg_elbow 問題。
            #
            #   上面的 min() 門檻擋不住它：兩側可見度 0.86 / 0.56 都過 0.55，
            #   但比值 0.65 已經代表一側明顯較差。
            #   實測 2026-08-01：臥推正側面挑到「腕中點高度」3 次、錯 2 次。
            #
            #   單側候選（左腕高度／右腕高度）本來就在清單裡，
            #   排除平均型不會少掉可用訊號，只會逼它選乾淨的那一側。
            #   ⚠️ 判斷依據是「這條有沒有把左右兩側平均起來」，不能只看名字有
            #      沒有「中點」——v7.1 新增的「手離肩線距離」「手的前後位移」
            #      同樣用雙腕中點，一側被擋時一樣會被幻覺污染。
            if cf is not None and len(need) >= 2 and _uses_bilateral_mean(name):
                try:
                    vs = [cf[i] for i in need]
                except Exception:
                    vs = []
                if vs and max(vs) > 1e-6 and min(vs) / max(vs) < 0.80:
                    _drop(name, f"雙側平均型，兩側可見度差太多（{min(vs):.2f}/{max(vs):.2f}）")
                    continue
            rng = float(np.nanmax(sig) - np.nanmin(sig))
            if not np.isfinite(rng) or rng < 1e-6:
                _drop(name, "訊號是平線（動態範圍 ≈ 0）")
                continue                       # 平線
            out.append((name, sig, v, tuple(need)))
        out.sort(key=lambda t: (-(t[2] if np.isfinite(t[2]) else 0.0)))
        return out
    except Exception as _e:
        _drop("<全部>", f"counting_candidates 整個拋例外：{type(_e).__name__}: {_e}")
        return []


def counting_candidates_resilient(landmarks, exercise_key, confs=None,
                                  vis_min=0.55, reasons=None):
    """【v8】候選全滅時的階梯式退讓，取代「掉回雙側平均預設訊號」。

    為什麼要有這個
    ──────────────
    2026-08-01 實測：40 支影片有 1 支候選數為 0（臥推正側面），
    退回預設的「腕中點高度」——但那支影片左半身 100% 是 NaN，
    等於拿 MediaPipe 腦補出來的左腕跟真的右腕平均，5 下算成 4 下。

    **候選全滅的原因幾乎都是「一側被擋」，而預設訊號偏偏是雙側平均**，
    退讓方向完全反了。正確的退讓是「降低可見度要求，但更嚴格地
    只留單側訊號」——寧可用一條可見度 0.4 的右手訊號，
    也不要用一條混了幻覺左手的平均訊號。

    階梯（一有結果就停）：
      ① vis_min 原值（預設 0.55）
      ② vis_min × 0.65（≈0.36）—— 遮擋嚴重時右手常落在 0.4–0.5
      ③ 不做可見度篩選，但**排除所有雙側平均型候選**
    """
    log = reasons if isinstance(reasons, list) else []
    out = counting_candidates(landmarks, exercise_key, confs=confs,
                              vis_min=vis_min, reasons=log)
    if out:
        return out
    relaxed = round(vis_min * 0.65, 3)
    log.append({"name": "<階梯>", "why": f"第一輪 0 條 → 放寬可見度門檻到 {relaxed}"})
    out = counting_candidates(landmarks, exercise_key, confs=confs,
                              vis_min=relaxed, reasons=log)
    if out:
        return out
    log.append({"name": "<階梯>", "why": "第二輪仍 0 條 → 放棄可見度篩選，但只留非雙側平均型"})
    out = counting_candidates(landmarks, exercise_key, confs=None,
                              vis_min=0.0, reasons=log)
    return [t for t in out if not _uses_bilateral_mean(t[0])]


def _live_side(a, li, ri):
    """【v8】左右兩個對稱點，哪一側是「真的看得到」的那一側。

    判斷依據是**動態範圍**，不是可見度分數：MediaPipe 對被擋的肢體不會留白，
    而是腦補一條幾乎不動的假軌跡，可見度照樣可以有 0.5–0.8，但 ROM 趨近 0。
    回傳 'both' / 'L' / 'R'。兩側 ROM 相差 2.5 倍以上才判定單側。
    """
    np_ = __import__("numpy")
    def rom(i):
        v = a[:, i, 1]
        v = v[np_.isfinite(v)]
        return float(np_.ptp(v)) if v.size > 4 else 0.0
    rl, rr = rom(li), rom(ri)
    if max(rl, rr) < 1e-9:
        return "both"
    if rl > rr * 2.5:
        return "L"
    if rr > rl * 2.5:
        return "R"
    return "both"


def counting_signal(landmarks, exercise_key, view=None):
    """依機位算出最適合的計次訊號。只用 2D 座標（landmarks 欄 0-1）。

    landmarks: (N, 33, 5) —— 欄 0-1 = 2D 正規化座標
    回傳 (訊號陣列, 名稱) 或 (None, None)
    """
    import numpy as np
    try:
        a = np.asarray(landmarks, dtype=float)
        if a.ndim != 3 or a.shape[1] < 29 or a.shape[2] < 2:
            return None, None
        table = COUNTING_SIGNAL.get(exercise_key or "", {})
        kind, zh = table.get(view) or table.get("*") or (None, None)
        if kind is None:
            return None, None

        # 【v8】高度型預設訊號本來一律取左右中點。但這條是「所有候選都
        #   淘汰光了」時的最後保險，而候選全滅的典型原因就是一側被擋 ——
        #   此時取中點等於把腦補出來的那一側平均進去，振幅腰斬、漏算次數。
        #   實測 2026-08-01：一支臥推正側面左半身 100% NaN，5 下算成 4 下。
        #   所以中點只在「兩側都真的有在動」時才用。
        if kind == "hip_height":
            _s = _live_side(a, 23, 24)
            sig = (a[:, 23, 1] if _s == "L" else a[:, 24, 1] if _s == "R"
                   else (a[:, 23, 1] + a[:, 24, 1]) / 2.0)
            if _s != "both":
                zh = f"{zh}（只用{'左' if _s == 'L' else '右'}側，另一側被擋）"
        elif kind == "wrist_height":
            _s = _live_side(a, 15, 16)
            sig = (a[:, 15, 1] if _s == "L" else a[:, 16, 1] if _s == "R"
                   else (a[:, 15, 1] + a[:, 16, 1]) / 2.0)
            if _s != "both":
                zh = f"{zh}（只用{'左' if _s == 'L' else '右'}側，另一側被擋）"
        elif kind == "elbow_span":
            # 【v6.4 修計次加倍】原本是 np.abs(x13 - x14) —— 只取 x 分量再取絕對值，
            #   兩個問題疊在一起：
            #
            #   ① 只用 x → 依賴手機怎麼拿。正上方俯拍時，身體的左右軸會映射到
            #      影像的哪一軸完全看手機旋轉；一旦左右軸對到影像 y，
            #      x13−x14 就在 0 附近，訊號等於雜訊。
            #   ② 取絕對值 → 訊號在 0 附近擺盪時，|·| 會把頻率**加倍**
            #      （負半週被折上來變成第二個峰）。
            #
            #   實測 2026-07-31：臥推凡是用這條訊號的機位（正上方、自選）
            #   幾乎全錯，而且是很規律的 2 倍 ——
            #     5 下 → 偵測 10、9、8、8；切出的 rep 間距 34,30,34,41,36,37,35,35,34 幀
            #     （約 1.2 秒，真實一下約 2.3 秒）。
            #   同一批用「腕部垂直高度」的正側面 5/7 正確、深蹲用「髖部垂直高度」20/20 全對。
            #
            #   改用雙肘的**真實 2D 距離**：與手機旋轉無關，而且本來就恆正、
            #   不存在折疊，下放時變大、推起時變小，一個 rep 剛好一個週期。
            sig = np.hypot(a[:, 13, 0] - a[:, 14, 0],
                           a[:, 13, 1] - a[:, 14, 1])       # 雙肘 2D 間距
        else:
            return None, None

        # 沒偵測到的幀 landmarks 是 0 → 轉成 NaN，不要當成真實數值
        zero = (np.abs(a[:, 23:25, 0:2]).sum(axis=(1, 2)) < 1e-6)
        sig = np.where(zero, np.nan, sig)
        if not np.isfinite(sig).any():
            return None, None
        return sig.astype(float), zh
    except Exception:
        return None, None


def bilateral_visibility(features, cfg, metric_vis=None):
    """【v5.8】用「左右成對肢體的活動範圍比」判斷機位，取代不可靠的幾何角度估計。

    為什麼放棄猜角度 —— 從骨架反推視角要靠 world 座標的 z 與「軀幹長」當尺規，
    兩者在單目估計下都不穩：MediaPipe 的髖點稍微偏低，肩寬/軀幹長就從解剖值
    0.76 掉到 0.445，arccos 出來一律 ~55°。實測正側面 90°、正上方 0°、正面 0°
    三種機位全被判成 48–58°，等於對拍對的人亂噴紅字。

    但我們真正關心的從來不是「幾何上幾度」，而是**這個機位遮住了什麼**。
    那個可以直接量：左右成對的肢體，活動範圍比多少。

        ratio ≈ 1.0  兩側都看得到  → 額狀面機位（正面／正上方俯視）
        ratio < 0.4  一側被擋住    → 矢狀面機位（正側面）
        中間          部分遮擋      → 斜角

    這個判斷不需要 z、不需要尺規，而且直接連結到「這個機位能量到什麼指標」——
    那才是 measurability 要回答的問題。

    回傳 dict(ratio, view, occluded_side, ranges) 或 None
    """
    import numpy as np
    try:
        pairs = cfg.get("bilateral_pairs") or []
        ml = cfg.get("metric_labels") or []
        # 只要有 metric_vis 就能判定，不需要 features（判定遮擋靠可見度）
        if not pairs or (features is None and metric_vis is None):
            return None
        ia, ib = ml.index(pairs[0][0]), ml.index(pairs[0][1])

        # ⚠️ 判斷遮擋要用**可見度**，不能只看活動範圍。
        #   MediaPipe 對被擋住的肢體不是留白，而是「腦補出跟看得到那側幾乎
        #   一樣的動作」——實測正側面拍臥推、兩隻手臂在畫面上完全重疊，
        #   兩側活動範圍卻只差 12%（對稱度 88%），被誤判成「兩側都看得到」。
        #   可見度才誠實：同一支影片 L Elbow 0.164 vs R Elbow 0.431（比值 0.38）。
        if metric_vis is not None:
            v = np.asarray(metric_vis, dtype=float)
            va = float(np.nanmean(v[:, ia])); vb = float(np.nanmean(v[:, ib]))
            if np.isfinite(va) and np.isfinite(vb) and max(va, vb) > 1e-6:
                ratio = min(va, vb) / max(va, vb)
                ra, rb = va, vb
                view = (VIEW_SAGITTAL_90 if ratio < 0.40
                        else VIEW_OBLIQUE_45 if ratio < 0.70 else VIEW_FRONTAL_0)
                return {
                    "ratio": round(ratio, 3), "view": view, "basis": "visibility",
                    "occluded_side": (pairs[0][0] if va < vb else pairs[0][1]) if ratio < 0.7 else None,
                    "ranges": {pairs[0][0]: round(va, 3), pairs[0][1]: round(vb, 3)},
                }

        # 沒有可見度資料才退回活動範圍（會低估遮擋，僅供參考）
        if features is None:
            return None
        a = np.asarray(features, dtype=float)
        ra = float(np.nanmax(a[:, ia]) - np.nanmin(a[:, ia]))
        rb = float(np.nanmax(a[:, ib]) - np.nanmin(a[:, ib]))
        if not (np.isfinite(ra) and np.isfinite(rb)) or max(ra, rb) <= 1e-6:
            return None
        ratio = min(ra, rb) / max(ra, rb)
        view = (VIEW_SAGITTAL_90 if ratio < 0.40
                else VIEW_OBLIQUE_45 if ratio < 0.70
                else VIEW_FRONTAL_0)
        return {
            "ratio": round(ratio, 3),
            "view": view,
            "basis": "rom",
            "occluded_side": (pairs[0][0] if ra < rb else pairs[0][1]) if ratio < 0.7 else None,
            "ranges": {pairs[0][0]: round(ra, 1), pairs[0][1]: round(rb, 1)},
        }
    except Exception:
        return None


def classify_view(deg, exercise_key=None):
    """量到的角度 → 機位代號。臥推的「0°」在實務上就是正上方俯視。

    ⚠️ 這是舊的幾何估計法，實測不可靠（見 bilateral_visibility 的說明）。
    保留只為相容，新程式請改用 bilateral_visibility()。
    """
    if deg is None:
        return None
    if deg < 25.0:
        return VIEW_OVERHEAD if exercise_key == "bench_press" else VIEW_FRONTAL_0
    if deg < 65.0:
        return VIEW_OBLIQUE_45
    return VIEW_SAGITTAL_90

# ── 機位代號 ─────────────────────────────────────────────────────────────────
# 用字串代號而不是 bool，前端 SPEC 直接送這個值上來。
VIEW_SAGITTAL_90 = "sagittal_90"     # 正側面 90°（矢狀面正對鏡頭）
VIEW_OBLIQUE_45  = "oblique_45"      # 斜前方 / 斜後方 45°
VIEW_FRONTAL_0   = "frontal_0"       # 正面 0°（額狀面正對鏡頭）
VIEW_OVERHEAD    = "overhead"        # 正上方俯視（橫斷面）

ALL_VIEWS = (VIEW_SAGITTAL_90, VIEW_OBLIQUE_45, VIEW_FRONTAL_0, VIEW_OVERHEAD)

VIEW_ZH = {
    VIEW_SAGITTAL_90: "正側面 90°",
    VIEW_OBLIQUE_45:  "斜前方 45°",
    VIEW_FRONTAL_0:   "正面 0°",
    VIEW_OVERHEAD:    "正上方俯視",
}


# ── 指標所屬的解剖平面 ───────────────────────────────────────────────────────
# sagittal  矢狀面：屈伸（膝角、肘角、軀幹前傾、蹲深）
# frontal   額狀面：內收外展、左右寬度（膝內塌、握距、肘外展）
# transverse橫斷面：旋轉
# scalar    純量：與投影方向無關（左右差值、變異數；仍受各自來源欄位影響）
SAGITTAL, FRONTAL, TRANSVERSE, SCALAR = "sagittal", "frontal", "transverse", "scalar"

# 平面 × 機位 的一般規則。個別指標可用 METRIC_OVERRIDE 覆寫。
_PLANE_TABLE = {
    SAGITTAL: {
        VIEW_SAGITTAL_90: FULL,
        VIEW_OBLIQUE_45:  PARTIAL,   # cos45° ≈ 0.71 的投影壓縮
        VIEW_FRONTAL_0:   NONE,      # 屈伸角在正面幾乎不可解
        VIEW_OVERHEAD:    NONE,
    },
    FRONTAL: {
        VIEW_SAGITTAL_90: NONE,      # ← 這一格就是臥推 Elbow Flare / Grip Width 的坑
        VIEW_OBLIQUE_45:  PARTIAL,
        VIEW_FRONTAL_0:   FULL,
        VIEW_OVERHEAD:    PARTIAL,
    },
    TRANSVERSE: {
        VIEW_SAGITTAL_90: NONE,
        VIEW_OBLIQUE_45:  PARTIAL,
        VIEW_FRONTAL_0:   NONE,
        VIEW_OVERHEAD:    FULL,
    },
    SCALAR: {v: FULL for v in ALL_VIEWS},
}


# ── 每個動作、每個指標屬於哪個平面 ───────────────────────────────────────────
METRIC_PLANE = {
    "squat": {
        "L Knee":      SAGITTAL,
        "R Knee":      SAGITTAL,
        "Torso Lean":  SAGITTAL,
        "Hip Depth":   SAGITTAL,
        "Knee Sym":    FRONTAL,    # 左右膝角差 —— 要兩腿都清楚看到才算數
        "Stability":   SCALAR,
        "Knee Valgus": FRONTAL,
    },
    "bench_press": {
        "L Elbow":           SAGITTAL,
        "R Elbow":           SAGITTAL,
        "Elbow Flare":       FRONTAL,
        "Forearm Vertical":  SAGITTAL,
        "Elbow Sym":         FRONTAL,
        "Bar Path":          SAGITTAL,
        "Grip Width":        FRONTAL,
    },
    "deadlift": {
        "Hip Hinge": SAGITTAL, "L Knee": SAGITTAL, "R Knee": SAGITTAL,
        "Back Flat": SAGITTAL, "Knee Sym": FRONTAL, "Stability": SCALAR,
        "Bar Path": SAGITTAL,
    },
    "overhead_press": {
        "L Elbow": SAGITTAL, "R Elbow": SAGITTAL, "Torso Lean": SAGITTAL,
        "Forearm Vertical": FRONTAL, "Elbow Sym": FRONTAL,
        "Stability": SCALAR, "Grip Width": FRONTAL,
    },
    "barbell_row": {},
    "lat_pulldown": {},
}

# ── 個別覆寫 ────────────────────────────────────────────────────────────────
# 有些指標的實作細節讓它比「所屬平面」的通則更嚴格或更寬鬆。
METRIC_OVERRIDE = {
    ("squat", "L Knee"): {
        # 斜前方 45° 時遠側（左）腿被軀幹遮擋。2026-07-27 實測：
        # L Knee 整段 165.9°–178.1°（動態範圍僅 12°），而同一下的 R Knee
        # 是 94.5°–170.6°（範圍 76°）—— 左腿根本沒被追到，輸出的是一條
        # 幾乎打直的假曲線。這條假曲線還進了黃金模板（模板 L Knee 範圍
        # 只有 22°，R Knee 81°），所以「跟模板比」的防呆抓不到它。
        VIEW_OBLIQUE_45: NONE,
        # 【v5.4】正面 0° 實測動態範圍 45.2°，比正側面的 12.1° 還大（372%）——
        #   從正面兩條腿都看得到，遠側不會被軀幹擋住。原本按「矢狀面」通則
        #   給 NONE 是錯的。
        VIEW_FRONTAL_0: PARTIAL,
    },
    ("squat", "Knee Sym"): {
        VIEW_OBLIQUE_45: NONE,   # 由 L Knee 推導而來，L Knee 死了它也死
    },
    ("squat", "R Knee"): {
        # 【v5.4】正面實測 42.5° vs 正側面 76.1°（保留 56%）：壓縮但仍有訊號
        VIEW_FRONTAL_0: PARTIAL,
    },
    ("squat", "Hip Depth"): {
        VIEW_FRONTAL_0: PARTIAL,   # 實測保留 68%
    },
    ("bench_press", "L Elbow"): {
        # 【v5.4】正上方俯視實測 71.5° vs 正側面 51.0°（140%）——比正側面還好
        VIEW_OVERHEAD: PARTIAL,
    },
    ("bench_press", "R Elbow"): {
        VIEW_OVERHEAD: PARTIAL,    # 實測保留 85%
    },
    ("bench_press", "Elbow Sym"): {
        # 正側面時近臂完全擋住遠臂，左右肘角差是拿幻覺點位算的
        VIEW_SAGITTAL_90: NONE,
    },
    ("bench_press", "Forearm Vertical"): {
        # 【v5.2】前臂偏離垂直有兩個獨立分量，一個機位只驗證得了一個：
        #   · 矢狀分量（槓偏頭側/腳側）→ 正側面 90° 可測
        #   · 額狀分量（手肘內扣，前臂往內斜）→ 只有正上方/正面測得到
        # 使用者指出的關鍵：從側面看，手肘內扣時前臂在矢狀面上照樣是 90°，
        # 但那正是握距過窄造成的錯誤。所以正側面給 PARTIAL 而不是 FULL——
        # 它是真的量得到東西，只是只驗證了一半。
        # ⚠️ 兩個機位算的是**不同的量**，數值不可互相比較。
        #    因此模板與受測影片必須同機位（見報告「模板跟受測影片必須同機位」）。
        VIEW_SAGITTAL_90: PARTIAL,
        VIEW_OVERHEAD:    FULL,
        VIEW_FRONTAL_0:   FULL,
    },
    ("bench_press", "Bar Path"): {
        # 3 幀腕高變異數，量級 1e-6，配 scale 5000 仍恆為滿分（實測
        # sub_score 平均 99.2、sd 0.6、100% ≥95）→ 零鑑別度，任何機位都不計分。
        # 要留著這個指標的話必須改成「腕部水平位移 ÷ 上臂長」的無因次量。
        v: NONE for v in ALL_VIEWS
    },
}


# ── 解剖學上的最小活動範圍（絕對門檻，不跟模板比）─────────────────────────
# v4.8 的死訊號防呆是「使用者動態範圍 < 模板的 15%」。當模板本身就是用
# 有缺陷的機位建出來的（深蹲 L Knee 模板範圍只有 22°），這個相對門檻
# 會一起失效。改成跟「人體實際做這個動作應該要有的幅度」比。
# 單位：度（角度類）或該欄位自身的無因次單位。
#
# 【v5.1 校準】第一次重跑（2026-07-27）的門檻訂得太貼近真實資料，
#   把正常的動作也擋掉了，屬於偽陽性：
#     - 臥推 L Elbow 實測每 rep 掃 40–44°，門檻 45° → 有經驗者的標準動作被判「未追蹤」
#     - 深蹲正面視角 R Knee 實測 36.7–38.9°，門檻 40° → 正面組整組被打成 15 分
#   門檻的用途是擋「關節完全沒被追到」（實測那條假的左腿只有 12°），
#   不是擋「幅度比理想值小一點」。幅度不足應該由**評分**去扣，不是由
#   **量測有效性**去否定。所以下修到「明顯是死訊號」的區間。
MIN_EXPECTED_ROM = {
    "squat": {
        "L Knee": 22.0,      # 實測死訊號 12°，正常最小 36.7° → 22° 剛好切在中間
        "R Knee": 22.0,
        "Torso Lean": 2.0,   # 正面視角實測 2.3–4.0°，不該被擋
        "Hip Depth": 0.15,
    },
    "bench_press": {
        "L Elbow": 28.0,     # 實測正常 40–52°，28° 只擋真的沒動的
        "R Elbow": 28.0,
        "Forearm Vertical": 6.0,
    },
    "deadlift": {"Hip Hinge": 30.0, "L Knee": 25.0, "R Knee": 25.0},
    "overhead_press": {"L Elbow": 50.0, "R Elbow": 50.0},
}

# 解剖學上的合理值域。落在區間外代表量測本身壞掉（例如正側面拍臥推
# 量到握距 2.65 倍肩寬 —— 真人不可能，是透視壓縮造成的）。
PLAUSIBLE_RANGE = {
    "squat": {
        "L Knee": (30.0, 185.0),
        "R Knee": (30.0, 185.0),
        "Torso Lean": (0.0, 80.0),
    },
    "bench_press": {
        "L Elbow": (30.0, 185.0),
        "R Elbow": (30.0, 185.0),
        "Elbow Flare": (0.0, 95.0),
        "Forearm Vertical": (0.0, 95.0),
        "Grip Width": (0.9, 2.4),   # 實測正側面量到 2.35–2.65 → 超出上界，判為不可信
    },
}


# ── 對外 API ─────────────────────────────────────────────────────────────────

def view_factor(exercise_key: str, metric_label: str, view: str) -> float:
    """回傳 (動作, 指標, 機位) 的可測性係數 ∈ {0.0, 0.55, 1.0}。

    未知的動作/指標/機位一律回 FULL（不主動破壞既有行為），
    但呼叫端應該把「查不到表」記進 log，避免新指標悄悄繞過 gating。
    """
    ov = METRIC_OVERRIDE.get((exercise_key, metric_label))
    if ov is not None and view in ov:
        return ov[view]
    plane = METRIC_PLANE.get(exercise_key, {}).get(metric_label)
    if plane is None:
        return FULL
    return _PLANE_TABLE[plane].get(view, FULL)


def legacy_view(is_side_view: bool, exercise_key: str = "") -> str:
    """把舊的 bool 旗標映射成機位代號，讓還沒改的呼叫端不會爆掉。

    ⚠️ 這是相容層，不是正確答案。舊旗標 False 對應到的其實是
    「不是正側面」，可能是斜 45° 也可能是正面，兩者的 gating 完全不同。
    新的呼叫端請直接送 view 代號。
    """
    return VIEW_SAGITTAL_90 if is_side_view else VIEW_OBLIQUE_45


def check_signal_health(exercise_key: str, metric_label: str, col) -> tuple[bool, str]:
    """絕對門檻的訊號健康檢查。回傳 (是否可信, 原因)。

    兩道關卡：
      ① 活動範圍太小 → 關節根本沒被追到（深蹲時膝蓋一直是打直的）
      ② 數值落在解剖學合理區間外 → 量測方式在這個機位失效
    """
    import numpy as np
    arr = np.asarray(col, dtype=float)
    if not np.isfinite(arr).any():
        return False, "整欄 NaN"

    lo, hi = float(np.nanmin(arr)), float(np.nanmax(arr))
    rom = hi - lo

    need = MIN_EXPECTED_ROM.get(exercise_key, {}).get(metric_label)
    if need is not None and rom < need:
        return False, f"活動範圍 {rom:.1f} < 解剖學下限 {need:.1f}（關節未被追蹤）"

    rng = PLAUSIBLE_RANGE.get(exercise_key, {}).get(metric_label)
    if rng is not None:
        med = float(np.nanmedian(arr))
        if not (rng[0] <= med <= rng[1]):
            return False, f"中位數 {med:.2f} 落在合理區間 {rng} 外（此機位量測失效）"

    return True, ""


def describe(exercise_key: str, metric_labels, view: str) -> dict:
    """給前端/報告用：這個機位下每個指標的狀態。

    回傳 {label: {"factor": float, "status": "full|partial|none", "zh": str}}
    """
    out = {}
    for lab in metric_labels:
        f = view_factor(exercise_key, lab, view)
        if f >= 1.0:
            st, zh = "full", "可量測"
        elif f > 0.0:
            st, zh = "partial", "透視壓縮（降權）"
        else:
            st, zh = "none", f"{VIEW_ZH.get(view, view)} 測不到"
        out[lab] = {"factor": f, "status": st, "zh": zh}
    return out
