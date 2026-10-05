"""
Multi-Exercise AI Fitness Coach Module (V1.0)
Ported from multi_exercise_coach_v1.ipynb

Supports 6 exercises:
  - lat_pulldown (滑輪下拉)
  - squat (深蹲)
  - deadlift (硬舉)
  - bench_press (臥推)
  - overhead_press (肩推)
  - barbell_row (划船)
"""

import cv2
import numpy as np
import pandas as pd
import os
import time
import sys
from collections import deque
from scipy.signal import butter, filtfilt, find_peaks, savgol_filter
from scipy.interpolate import interp1d

# 【v5.0】機位 × 解剖平面的可測性查表（取代舊的 is_side bool + front_only_metrics）
try:
    from core import measurability
except ImportError:          # 直接以 backend/core 為工作目錄執行時
    import measurability

# Try importing tslearn for DBA
try:
    from tslearn.barycenters import dtw_barycenter_averaging
except ImportError:
    print("⚠️  tslearn not installed — template building will fail. pip install tslearn")
    dtw_barycenter_averaging = None

# MediaPipe
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

BaseOptions        = mp.tasks.BaseOptions
PoseLandmarker     = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode  = mp.tasks.vision.RunningMode

# ─── Model path ──────────────────────────────────────────────────────────────
# 模型選擇：heavy(最準最慢) / full(平衡) / lite(最快)。
# 深蹲、硬舉、臥推、滑輪下拉等「大關節」動作用 full 已足夠準確，推論速度
# 明顯快於 heavy（heavy 的優勢主要在手指/腳趾等細節追蹤，本專案用不到）。
# ⚠️ 切換模型後務必「重新建立模板」：舊的 template_*.npz 是用 heavy 建的，
#    若用 full 抽出的使用者影片去比對 heavy 模板，會有系統性的座標偏差。
POSE_MODEL = "pose_landmarker_full"
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(MODEL_DIR, f"{POSE_MODEL}.task")

# Try fallback paths
if not os.path.exists(MODEL_PATH):
    alt = os.path.join(os.path.dirname(MODEL_DIR), f"{POSE_MODEL}.task")
    if os.path.exists(alt):
        MODEL_PATH = alt

def ensure_model():
    """Download model if missing."""
    if os.path.exists(MODEL_PATH):
        return
    url = (f"https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
           f"{POSE_MODEL}/float16/latest/{POSE_MODEL}.task")
    print(f"Downloading pose model to {MODEL_PATH}...")
    import urllib.request
    urllib.request.urlretrieve(url, MODEL_PATH)
    print("Model downloaded.")


# ─── PoseLandmarker 建構（GPU 可選 + CPU 安全後備）────────────────────────────
#   Python 版 MediaPipe 的 GPU delegate 在 macOS 上並不可靠 —— 可能在建構期
#   就拋錯，也可能建得起來卻在推論期才出問題。為了不讓後端因為「想加速」反而
#   崩潰，這裡：
#     · 預設一律走 CPU（行為與原本完全相同，零風險）。
#     · 只有設環境變數 POSE_GPU=1 時才嘗試 GPU；嘗試失敗一律安全退回 CPU。
#   想在支援的機器上實測 GPU，啟動後端前 `export POSE_GPU=1` 即可。
def _create_pose_landmarker(running_mode=VisionRunningMode.VIDEO, num_poses=1):
    ensure_model()

    def _build(delegate):
        return PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH, delegate=delegate),
            running_mode=running_mode, num_poses=num_poses,
        )

    if os.environ.get("POSE_GPU", "").strip().lower() in ("1", "true", "yes"):
        try:
            lm = PoseLandmarker.create_from_options(_build(BaseOptions.Delegate.GPU))
            print("[pose] PoseLandmarker 使用 GPU delegate")
            return lm
        except Exception as e:
            print(f"[pose] GPU delegate 不可用，安全退回 CPU：{e}")
    return PoseLandmarker.create_from_options(_build(BaseOptions.Delegate.CPU))


# ─── Geometry helpers ────────────────────────────────────────────────────────

def calculate_angle(a, b, c):
    ba, bc = a - b, c - b
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba == 0 or norm_bc == 0:
        return np.nan
    cos = np.dot(ba, bc) / (norm_ba * norm_bc)
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))

def vector_angle_deg(v1, v2):
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    if norm_v1 == 0 or norm_v2 == 0:
        return np.nan
    cos = np.dot(v1, v2) / (norm_v1 * norm_v2)
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))

def torso_lean_angle(hip_3d, shoulder_3d):
    v = shoulder_3d - hip_3d
    return vector_angle_deg(v, np.array([0, -1, 0]))

def lm_to_np(lm):
    return np.array([lm.x, lm.y, lm.z])

def mid(a, b):
    return (a + b) * 0.5

# ─── 解剖座標系與標準平面投影（ISB 建議的骨盆嵌入式座標系）────────────────────
#
#  為什麼需要這一段
#  ────────────────
#  舊版指標直接拿 MediaPipe world landmark 的 x / y 分量當「額狀面」「垂直」用。
#  那等於假設「受測者永遠正對鏡頭」——受測者一轉身，同一個物理量就換了平面，
#  數值不可比，也無法對應到任何一篇文獻的定義。
#
#  文獻上的做法是先在身體上建一個座標系（ISB 對下肢的建議：以骨盆為基準），
#  再把量測投影到解剖三面（矢狀面 sagittal / 額狀面 frontal / 橫斷面 transverse）。
#  這樣算出來的角度才是「軀幹前傾角」「FPPA」這種有國際定義的量，
#  而不是「畫面上看起來的角度」。
#
#  座標系定義（右手系，MediaPipe world landmark：y 軸向下、單位公尺、原點在兩髖中點）
#      ê_ml    內外側軸 (medio-lateral)：右髖 → 左髖，去掉垂直分量後正規化
#      ê_vert  垂直軸：重力反方向 = (0, −1, 0)
#      ê_ap    前後軸 (antero-posterior)：ê_vert × ê_ml
#
#      矢狀面 = span(ê_vert, ê_ap)  ← 法向量 ê_ml   （量前傾、蹲深、膝屈曲）
#      額狀面 = span(ê_vert, ê_ml)  ← 法向量 ê_ap   （量 FPPA、側傾、COM–BOS）
#
#  ⚠️ 這個座標系是「量得到」的必要條件，不是充分條件：
#     受測者側對鏡頭時額狀面仍然定義得出來，但組成它的點位是模型推估的。
#     可信與否由 measurability（可見度 / 骨長對稱）判定，兩件事分開。

_UP = np.array([0.0, -1.0, 0.0])          # MediaPipe world: y 向下 → 「上」是 −y


def anatomical_frame(l_hip, r_hip):
    """由骨盆建立解剖座標系，回傳 (ê_ml, ê_vert, ê_ap)；退化時回傳 None。"""
    ml = np.asarray(l_hip, dtype=float) - np.asarray(r_hip, dtype=float)
    ml = ml - np.dot(ml, _UP) * _UP        # 去掉垂直分量 → 純水平的內外側軸
    n = np.linalg.norm(ml)
    if not np.isfinite(n) or n < 1e-6:
        return None
    ml = ml / n
    ap = np.cross(_UP, ml)
    n2 = np.linalg.norm(ap)
    if not np.isfinite(n2) or n2 < 1e-6:
        return None
    return ml, _UP.copy(), ap / n2


def project_to_plane(v, normal):
    """把向量投影到以 normal 為法向量的平面上。"""
    v = np.asarray(v, dtype=float)
    return v - np.dot(v, normal) * normal


def signed_angle_in_plane(v, ref, normal):
    """v 與 ref 在 normal 所定義的平面內的帶符號夾角（度）。

    符號依右手定則：以 normal 為拇指方向，ref 逆時針轉到 v 為正。
    """
    a = project_to_plane(v, normal)
    b = project_to_plane(ref, normal)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-9 or nb < 1e-9:
        return np.nan
    ang = float(np.degrees(np.arccos(np.clip(np.dot(a, b) / (na * nb), -1.0, 1.0))))
    return ang if float(np.dot(np.cross(b, a), normal)) >= 0 else -ang


def bench_frame(l_sh, r_sh, l_hip, r_hip):
    """臥推（仰臥）的身體座標系，回傳 (ê_ml, ê_long, ê_ap)；退化時 None。

        ê_ml   右肩 → 左肩          內外側（握距、肘外展的方向）
        ê_long 髖中點 → 肩中點      身體長軸（尾 → 頭），已去掉 ê_ml 分量
        ê_ap   ê_ml × ê_long        垂直於身體平面 —— 仰臥時就是槓的行程方向

    為什麼臥推不能沿用 anatomical_frame
    ──────────────────────────────────
    anatomical_frame 會先去掉「垂直分量」再取內外側軸，那是為**站姿**設計的：
    受測者站著時內外側軸本來就水平。仰臥時整個人躺平，去掉垂直分量會把
    真正的內外側方向切掉，所以臥推要用自己的一組基底，且**完全不假設重力方向**。

    為什麼一定要做這件事（實測證據）
    ──────────────────────────────
    舊版的 Forearm Vertical 直接拿世界座標軸配對（正側面用 (x,y)、其餘用 (z,y)），
    背後假設是「x = 身體長軸、y = 垂直、z = 左右」。2026-08-30 把三支俯視影片
    重跑 MediaPipe、直接看原始 world landmark：
        肩線平均分量  |x| = 0.007   |y| = 0.345   |z| = 0.024
    內外側方向其實落在 **y**，不是 z —— 因為 pose_world_landmarks 是跟著**影像**
    的方向，手機怎麼拿就怎麼轉。所以「非正側面就取 (z, y)」取到的根本不是額狀面。
    改用這組由受測者自己算出來的基底之後，結果與手機握持方向無關。
    """
    ml = np.asarray(l_sh, float) - np.asarray(r_sh, float)
    n1 = float(np.linalg.norm(ml))
    if not np.isfinite(n1) or n1 < 1e-6:
        return None
    ml = ml / n1
    lon = ((np.asarray(l_sh, float) + np.asarray(r_sh, float)) * 0.5
           - (np.asarray(l_hip, float) + np.asarray(r_hip, float)) * 0.5)
    lon = lon - np.dot(lon, ml) * ml
    n2 = float(np.linalg.norm(lon))
    if not np.isfinite(n2) or n2 < 1e-6:
        return None
    lon = lon / n2
    ap = np.cross(ml, lon)
    n3 = float(np.linalg.norm(ap))
    if not np.isfinite(n3) or n3 < 1e-6:
        return None
    return ml, lon, ap / n3


def forearm_verticality(wrist, elbow, plane_axis, ap):
    """前臂與身體平面法線 ê_ap 的夾角（deg），只在 (plane_axis, ê_ap) 平面內計算。

        90° = 前臂完全沿 ê_ap（理想：槓在手掌正上方、力直上直下）
         0° = 前臂躺平在身體平面上

    plane_axis 取 ê_long → 矢狀分量（從正側面看得到：槓偏頭側或腳側）
    plane_axis 取 ê_ml   → 額狀分量（從正上方看得到：手肘內扣或外開）
    兩者是**不同的量**，不可互比 —— 所以模板與受測影片必須同機位。
    """
    v = np.asarray(elbow, float) - np.asarray(wrist, float)
    a = float(np.dot(v, plane_axis))
    b = float(np.dot(v, ap))
    n = float(np.hypot(a, b))
    if not np.isfinite(n) or n < 1e-6:
        return np.nan
    return float(np.degrees(np.arcsin(min(1.0, abs(b) / n))))


# ─── 國際標準指標公式（深蹲）─────────────────────────────────────────────────

def knee_flexion_angle(hip, knee, ankle):
    """膝關節屈曲角（deg）。ISB / 臨床慣例：完全伸直 = 0°，越彎數值越大。

    = 180° − ∠(髖, 膝, 踝)

    舊版直接回傳 ∠(髖,膝,踝)（伸直≈180°、越彎越小），方向要設 lower_better，
    與所有文獻報告的「knee flexion angle」正好相反，圖表也不能直接跟文獻對照。
    """
    inc = calculate_angle(np.asarray(hip, float), np.asarray(knee, float),
                          np.asarray(ankle, float))
    return np.nan if not np.isfinite(inc) else float(180.0 - inc)


def trunk_flexion_angle(mid_hip, mid_shoulder, frame):
    """矢狀面軀幹傾角（deg）。直立 = 0°，離開垂直線越多數值越大。

    定義：軀幹向量（髖中點 → 肩中點）**先投影到矢狀面**，再取它與垂直線的夾角。

    舊版 torso_lean_angle 用的是 3D 向量與垂直線的夾角，把「前傾」和「側傾」
    混在同一個數字裡——側身歪一下也會被算成前傾。文獻報告的 trunk flexion
    一律是矢狀面分量，側傾是另一個獨立的量（見 lateral_trunk_lean）。

    ⚠️ 這裡回傳**大小**不帶前後符號。深蹲的軀幹一定是往前傾，而 MediaPipe
       world landmark 的 z 軸方向會隨受測者朝向翻轉，硬要判前／後只會製造
       一個看不出來的符號 bug。方向性由 metric_directions 的 "both" 處理：
       比教練傾得多、或直得過頭（重心後移蹲不下去）都算偏離，兩邊都扣分。
    """
    if frame is None:
        return np.nan
    ml, up, ap = frame
    v = np.asarray(mid_shoulder, float) - np.asarray(mid_hip, float)
    v_sag = project_to_plane(v, ml)                 # 去掉內外側分量
    n = float(np.linalg.norm(v_sag))
    if not np.isfinite(n) or n < 1e-6:
        return np.nan
    along = float(np.dot(v_sag, up))                # 沿垂直軸的分量
    perp = float(np.linalg.norm(v_sag - along * up))  # 垂直於垂直軸的分量
    return float(np.degrees(np.arctan2(perp, along)))


def thigh_segment_angle(hip, knee, frame):
    """大腿節段角（deg）＝ 蹲深的標準量法。

    定義：大腿節段（髖 → 膝）與**水平面**的夾角。

        站直      ≈ −90°   （大腿接近垂直、髖遠高於膝）
        大腿平行地面 =   0°   ← 這正是 parallel squat 的判準線
        過平行（髖低於膝） >  0°

    為什麼換掉舊的 (髖.y − 膝.y) / 大腿長
    ────────────────────────────────────
    舊式是自製的無單位比值，沒有文獻對應、口試無法引用，而且「0.4 個大腿長」
    這種說法不能翻譯成任何教練或臨床看得懂的東西。節段角是運動生物力學報告
    下肢姿勢的標準方式，而且 0° 剛好落在大家公認的 parallel 判準上——
    海報可以直接寫「0° = 大腿與地面平行」，不必再解釋一次自訂尺度。

    數學上兩者是同一個量的單調變換（asin），鑑別度不會變差，只是換成有名字的單位。

    【v9.2 幾何統一】改在**矢狀面內**計算，與 trunk_flexion_angle 用同一套幾何。
    舊版分母是 3D 股骨長（含 z），等於把單鏡頭最不可靠的深度推估混進節段角；
    而且同一個引擎裡 Torso Lean 早就是矢狀面分量，兩個矢狀面的量卻用不同幾何，
    口試講不出一致的定義。ê_ml 是水平的，投影到矢狀面不會動到 y 分量，
    所以分子不變、只有分母去掉內外側成分 —— 得到的正是從側面看到的那個角度。
    frame 為 None 時退回舊的 3D 算法，不會壞掉。
    """
    h = np.asarray(hip, float)
    k = np.asarray(knee, float)
    v = k - h                                   # 髖 → 膝
    if frame is not None:
        ml, _up, _ap = frame
        v = project_to_plane(v, ml)             # 去掉內外側分量 → 純矢狀面
    femur = float(np.linalg.norm(v))
    if not np.isfinite(femur) or femur < 1e-6:
        return np.nan
    # y 向下 → (hip.y − knee.y) > 0 代表髖比膝低（過平行）
    s = float(np.clip((h[1] - k[1]) / femur, -1.0, 1.0))
    return float(np.degrees(np.arcsin(s)))


FPPA_MIN_THIGH_PROJ = 0.30      # 大腿在額狀面上的投影長度至少要有股骨長的 30%


def fppa_signed(hip, knee, ankle, frame, side, min_proj=FPPA_MIN_THIGH_PROJ):
    """帶符號的額狀面投影角 FPPA（deg）。**診斷用，不進七大指標計分。**

    定義（Herrington & Munro 等 2D 動態膝外翻篩檢文獻）：
        大腿線（髖→膝）與小腿線（膝→踝）投影到額狀面後在膝關節形成的夾角，
        以偏離共線的量表示。
            FPPA > 0 ＝ 膝相對髖–踝連線往**內**位移 → valgus（膝內夾、X 型）
            FPPA < 0 ＝ 膝往**外**位移              → varus （膝外翻、O 型）

    ⚠️ 為什麼深蹲底部不能用 FPPA（這一點很重要，口試會被問）
    ────────────────────────────────────────────────────────
    FPPA 的兩條線要在額狀面上**有長度**才定義得出角度。雙腳深蹲蹲到大腿與地面
    平行時，髖與膝幾乎同高、大腿幾乎只剩前後方向的分量 —— 它在額狀面上的投影
    趨近於零，夾角先變得極度敏感、再變成無定義。合成骨架實測：大腿節段角 0°
    時 FPPA = NaN，+15° 時算出 −177°（符號整個翻掉）。

    這不是實作 bug，是 FPPA 這個工具本身的適用範圍：文獻裡 FPPA 一律用在
    **單腳蹲、落地、drop jump** 這類「大腿仍明顯傾斜」的任務，不是雙腳深蹲底部。

    所以本系統：
      · 計分用 KASR（見 knee_ankle_separation_ratio）—— 那才是雙腳蹲的標準工具
      · FPPA 只在大腿投影夠長（≥ min_proj × 股骨長）的影格算出來當診斷值，
        並如實回報有多少比例的影格算得出來

    side: 'L' 或 'R'，用來決定「內側」是 ê_ml 的哪一邊。
    """
    if frame is None:
        return np.nan
    ml, up, ap = frame
    h = np.asarray(hip, float)
    k = np.asarray(knee, float)
    a = np.asarray(ankle, float)
    femur = float(np.linalg.norm(k - h))
    # 投影到額狀面（法向量 = ê_ap）
    hf, kf, af = (project_to_plane(p, ap) for p in (h, k, a))
    thigh = kf - hf
    shank = af - kf
    n_th = float(np.linalg.norm(thigh))
    # 退化守門（兩道，缺一不可）
    #   ① 投影長度：太短就沒有方向可言
    #   ② 投影方向：大腿在額狀面上必須**夠垂直**。這一道才是關鍵 ——
    #      實測發現雙腳深蹲蹲到底時，膝比髖寬，大腿的額狀面投影長度其實很夠，
    #      但它幾乎是**水平**的，夾角於是被左右分量主導、算出 −50° 到 −88°
    #      這種不可能的值，而且每一幀都算得出來（100% 有定義）。
    #      那比「回 NaN」危險得多：它會安靜地吐出看起來很合理的假數字。
    if (femur < 1e-6 or n_th < min_proj * femur or np.linalg.norm(shank) < 1e-6):
        return np.nan
    vert_frac = abs(float(np.dot(thigh, up))) / max(n_th, 1e-9)
    if vert_frac < 0.5:            # 大腿偏離垂直超過 60° → FPPA 失去意義
        return np.nan
    dev = abs(signed_angle_in_plane(shank, thigh, ap))
    if not np.isfinite(dev):
        return np.nan
    # 符號：膝相對「髖→踝」連線的內外側位移
    ha = af - hf
    n_ha = float(np.linalg.norm(ha))
    if n_ha < 1e-9:
        return np.nan
    perp = (kf - hf) - (float(np.dot(kf - hf, ha)) / (n_ha ** 2)) * ha
    lateral = float(np.dot(perp, ml))       # +ê_ml 指向受測者左側
    # 左腿：內側 = −ê_ml；右腿：內側 = +ê_ml
    medial = -lateral if str(side).upper().startswith('L') else lateral
    return float(dev if medial >= 0 else -dev)


def knee_ankle_separation_ratio(l_knee, r_knee, l_ankle, r_ankle, frame):
    """膝踝間距比 KASR（無單位）——雙腳深蹲／落地篩檢動態膝外翻的標準量。

        KASR = 兩膝在額狀面上的間距 ÷ 兩踝在額狀面上的間距

        KASR < 1   膝比踝窄 → knee valgus（膝內夾）
        KASR ≈ 1   膝踝等寬
        KASR > 1   膝比踝寬 → 膝往外推（深蹲要的方向）；極端則為 varus

    為什麼雙腳深蹲用 KASR 而不是 FPPA
    ────────────────────────────────
    FPPA 在大腿接近水平時退化（見 fppa_signed 的說明），而雙腳深蹲最該檢查
    膝內夾的時刻正是最深點。KASR 量的是兩個**距離的比**，在任何深度都定義得
    出來，也不受身高影響——這正是 2D／Kinect 篩檢文獻在雙腳落地與蹲舉任務
    改用它的原因。

    與舊版 (踝距 − 膝距) / 髖寬 的差別
    ────────────────────────────────
    ① 用**解剖內外側軸 ê_ml** 投影，不是畫面 x：受測者轉身也不變意義。
    ② 分母改成踝距（KASR 的正規名稱定義），不是髖寬——踝距就是支撐底面寬，
       「膝有沒有掉進腳的裡面」本來就該拿腳的間距當尺。
    ③ 回傳比值本身，可直接對照文獻報告的 KASR 值域，不是一個自訂的差值。

    方向：higher_better（越接近或超過 1 越好；內夾使它變小）。
    """
    if frame is None:
        return np.nan
    ml, up, ap = frame
    kd = abs(float(np.dot(np.asarray(l_knee, float) - np.asarray(r_knee, float), ml)))
    ad = abs(float(np.dot(np.asarray(l_ankle, float) - np.asarray(r_ankle, float), ml)))
    if not np.isfinite(kd) or not np.isfinite(ad) or ad < 1e-4:
        return np.nan
    return float(kd / ad)


def valgus_index(l_knee, r_knee, l_ankle, r_ankle, frame):
    """膝內夾指數 VI（無單位）＝ **1 − KASR**，也就是「膝比踝窄了幾成」。

        VI = (踝間距 − 膝間距) / 踝間距

        VI > 0   膝比踝窄 → knee valgus（膝內夾）；0.20 = 膝距少了兩成踝距
        VI = 0   膝踝等寬
        VI < 0   膝比踝寬 → 膝往外推

    為什麼存 VI 而不是直接存 KASR
    ────────────────────────────
    兩者只差一個 1− 的單調變換，資訊完全一樣；差別在**取極值的方向**。
    引擎對「幅度類指標」一律取整下動作的 nanmax（見 _metric_deviation_extremum），
    因為那是動作資訊所在的極值。KASR 的最大值出現在**站直**那一刻——
    每個人站直時膝踝都差不多寬，最該抓的底部內夾反而被平均掉。
    存成 VI 之後，「最內夾的那一瞬間」正好就是最大值，
    與既有的 lower_better + max 語意一致，不必動到共用的評分機制。

    要對照文獻報告的 KASR 時：KASR = 1 − VI（overlay 兩個值都會輸出）。
    """
    r = knee_ankle_separation_ratio(l_knee, r_knee, l_ankle, r_ankle, frame)
    return np.nan if not np.isfinite(r) else float(1.0 - r)


def asymmetry_index(left_val, right_val):
    """雙側不對稱指數 AI（%）——Bishop 等人建議用於雙邊動作的標準算式。

        AI = (較大值 − 較小值) / 較大值 × 100

    0% ＝ 完全對稱，數值越大越不對稱，上限 100%。

    舊版直接用 |左膝角 − 右膝角| 的「度數差」：同樣差 5°，在深蹲底部（膝屈 120°）
    和站直附近（膝屈 10°）意義完全不同，而且沒有正規化就不能跨人比較。
    """
    l, r = float(left_val), float(right_val)
    if not (np.isfinite(l) and np.isfinite(r)):
        return np.nan
    hi = max(abs(l), abs(r))
    if hi < 1e-6:
        return 0.0
    return float((hi - min(abs(l), abs(r))) / hi * 100.0)


def com_bos_lateral_offset(mid_shoulder, mid_hip, l_ankle, r_ankle, frame):
    """額狀面 COM–BOS 側向偏移（% of 支撐底面寬）——姿勢穩定度的標準構念。

    平衡與姿勢控制文獻評估穩定度的方式是「質心相對支撐底面（BOS）的位置」，
    而不是某個座標的變異數。這裡取：

        COM 代理點 = 軀幹中心（肩中點與髖中點的中點）
        BOS 中心   = 兩踝中點；BOS 寬 = 兩踝在 ê_ml 上的距離
        指標       = |COM 到 BOS 中心的內外側分量| / BOS 寬 × 100 (%)

    0% ＝ 質心正對支撐底面中心；越大代表重心越偏向一側。

    舊版 np.var(重心 x) 的問題：① 單位是「正規化座標的平方」，沒有物理意義、
    無法跨影片比較；② 用的是畫面 x 而非解剖內外側軸，受測者一轉身就換了意義；
    ③ 變異數只反映「有沒有晃」，不反映「晃到超出腳掌沒有」——後者才是失衡。
    """
    if frame is None:
        return np.nan
    ml, up, ap = frame
    la = np.asarray(l_ankle, float)
    ra = np.asarray(r_ankle, float)
    bos_w = abs(float(np.dot(la - ra, ml)))
    # ⚠️ 退化守門：正側面拍攝時兩踝在內外側軸上幾乎重疊（一前一後），
    #   bos_w → 0，比值會炸成幾百 %。實測正側面曾算出 835%。
    #   支撐底面寬度至少要有髖寬的一半才算量得到 —— 量不到就回 NaN，
    #   不要吐一個看起來像數字的東西出來。
    if not np.isfinite(bos_w) or bos_w < 0.10:
        return np.nan
    com = (np.asarray(mid_shoulder, float) + np.asarray(mid_hip, float)) * 0.5
    bos_c = (la + ra) * 0.5
    off = abs(float(np.dot(com - bos_c, ml)))
    return float(off / bos_w * 100.0)


def lateral_trunk_lean(mid_hip, mid_shoulder, frame):
    """額狀面軀幹側傾角（deg）。直立 = 0°，往受測者**左側**傾為正。

    符號在這裡是安全的：ê_ml 由 (左髖 − 右髖) 定義，永遠指向受測者的左邊，
    與鏡頭朝向無關。

    目前不佔七大指標的欄位，但 measurement_overlay 與診斷會用到，
    也是把「前傾」從「側傾」分乾淨之後自然產生的另一半。
    """
    if frame is None:
        return np.nan
    ml, up, ap = frame
    v = np.asarray(mid_shoulder, float) - np.asarray(mid_hip, float)
    lat = float(np.dot(v, ml))
    vert = float(np.dot(v, up))
    if not (np.isfinite(lat) and np.isfinite(vert)):
        return np.nan
    return float(np.degrees(np.arctan2(lat, vert)))


# 七大指標的「標準卡」：名稱、公式、單位、用到的 MediaPipe landmark、所屬解剖面。
# 這份表會被寫進分析結果 JSON（metricStandards），海報圖與口試小抄直接讀它，
# 不必再從程式碼裡人工抄一次公式——抄錯是海報數字對不上的主要來源。
SQUAT_METRIC_STANDARDS = {
    "L Knee": dict(
        standard="Knee Flexion Angle", zh="左膝屈曲角",
        formula="180° − ∠(hip, knee, ankle)", unit="deg",
        landmarks=[23, 25, 27], landmark_names=["L_HIP", "L_KNEE", "L_ANKLE"],
        plane="sagittal", direction="higher_better",
        note="伸直 = 0°，屈曲越深數值越大（ISB / 臨床慣例）"),
    "R Knee": dict(
        standard="Knee Flexion Angle", zh="右膝屈曲角",
        formula="180° − ∠(hip, knee, ankle)", unit="deg",
        landmarks=[24, 26, 28], landmark_names=["R_HIP", "R_KNEE", "R_ANKLE"],
        plane="sagittal", direction="higher_better",
        note="伸直 = 0°，屈曲越深數值越大（ISB / 臨床慣例）"),
    "Torso Lean": dict(
        standard="Trunk Flexion Angle (sagittal)", zh="軀幹前傾角",
        formula="∠(軀幹向量投影至矢狀面, 垂直線)", unit="deg",
        landmarks=[11, 12, 23, 24],
        landmark_names=["L_SHOULDER", "R_SHOULDER", "L_HIP", "R_HIP"],
        plane="sagittal", direction="both",
        note="直立 = 0°，前傾為正；側傾已分離為獨立量，不再混入"),
    "Hip Depth": dict(
        standard="Thigh Segment Angle", zh="大腿節段角（蹲深）",
        formula="asin((hip.y − knee.y) / |股骨投影至矢狀面|)", unit="deg",
        landmarks=[23, 25, 24, 26],
        landmark_names=["L_HIP", "L_KNEE", "R_HIP", "R_KNEE"],
        plane="sagittal", direction="higher_better",
        note="0° = 大腿與地面平行（parallel 判準）；> 0° 為過平行"),
    "Knee Sym": dict(
        standard="Inter-limb Asymmetry Index", zh="雙側不對稱指數",
        formula="(max − min) / max × 100", unit="%",
        landmarks=[23, 25, 27, 24, 26, 28],
        landmark_names=["L_HIP", "L_KNEE", "L_ANKLE", "R_HIP", "R_KNEE", "R_ANKLE"],
        plane="bilateral", direction="lower_better",
        note="以左右膝屈曲角計算；0% = 完全對稱（Bishop 等人建議之雙邊算式）"),
    "Stability": dict(
        standard="COM–BOS Medio-lateral Offset", zh="質心–支撐底面側向偏移",
        formula="|COM→BOS 中心的內外側分量| / 兩踝間距 × 100", unit="%",
        landmarks=[11, 12, 23, 24, 27, 28],
        landmark_names=["L_SHOULDER", "R_SHOULDER", "L_HIP", "R_HIP",
                        "L_ANKLE", "R_ANKLE"],
        plane="frontal", direction="lower_better",
        note="0% = 質心正對支撐底面中心；平衡控制文獻的標準構念"),
    "Knee Valgus": dict(
        standard="Knee-to-Ankle Separation Ratio (KASR)",
        zh="膝內夾指數（1 − KASR）",
        formula="(踝間距 − 膝間距) / 踝間距，兩距離皆沿解剖內外側軸 ê_ml 量",
        unit="ratio",
        landmarks=[25, 26, 27, 28],
        landmark_names=["L_KNEE", "R_KNEE", "L_ANKLE", "R_ANKLE"],
        plane="frontal", direction="lower_better",
        equivalent="KASR = 1 − 本指標",
        note="正值 = valgus 膝內夾、負值 = 膝往外推（varus 方向），"
             "同一指標涵蓋兩種方向；本研究誘發 valgus，故只罰正值。"
             "不用 FPPA 的原因：雙腳蹲到底時大腿接近水平，"
             "FPPA 在額狀面上的投影退化、角度無定義（見 fppa_signed）"),
}

# 診斷用（不進七大指標計分）：有名字、但在雙腳深蹲底部不適用的量。
# 放進標準卡是為了讓口試能明確回答「為什麼沒有用 FPPA」。
SQUAT_DIAGNOSTIC_STANDARDS = {
    "FPPA": dict(
        standard="Frontal Plane Projection Angle (FPPA), signed",
        zh="額狀面投影角",
        formula="∠(大腿線, 小腿線) 投影至額狀面，偏離共線之量，帶內外側符號",
        unit="deg",
        landmarks=[23, 25, 27, 24, 26, 28],
        landmark_names=["L_HIP", "L_KNEE", "L_ANKLE", "R_HIP", "R_KNEE", "R_ANKLE"],
        plane="frontal", scored=False,
        note="正值 = valgus、負值 = varus。僅在大腿於額狀面的投影長度 ≥ 30% 股骨長"
             "的影格才有定義；雙腳深蹲最深點附近會退化，故不作為計分指標，"
             "只在 measurementOverlay 輸出當診斷值"),
    "Lateral Trunk Lean": dict(
        standard="Frontal-plane Trunk Lean", zh="額狀面軀幹側傾角",
        formula="∠(軀幹向量投影至額狀面, 垂直線)", unit="deg",
        landmarks=[11, 12, 23, 24],
        landmark_names=["L_SHOULDER", "R_SHOULDER", "L_HIP", "R_HIP"],
        plane="frontal", scored=False,
        note="把舊版 Torso Lean 混在一起的「側傾」分離出來的另一半；"
             "正值 = 往受測者左側傾"),
}

# ─── Signal processing ───────────────────────────────────────────────────────


def fill_nan_numpy(arr, fill_value_for_all_nan=0.0):
    """對每一欄做 NaN 線性插值補值。

    fill_value_for_all_nan:
      - 數值（預設 0.0）：整欄都是 NaN 時補成該數值（沿用舊行為）。
      - None：整欄都是 NaN 時「保留 NaN」。代表這個特徵整段都偵測不到
        （肢體被遮蔽 / 視角擋住），保留 NaN 才能讓下游 score_rep 的
        「權重歸零」防呆機制正確判定 —— 否則整欄被補成 0，score_rep 的
        np.isnan(...).all() 永遠為 False，會拿 0 去跟教練標準比對而誤扣分，
        前端圖表也會畫出一條假的水平零線。
    """
    arr_out = arr.copy()
    for i in range(arr.shape[1]):
        col = arr[:, i]
        mask = np.isnan(col)
        if mask.all():
            # 整欄全 NaN：依參數決定補值或保留 NaN（標記為「全程遮蔽」）
            arr_out[:, i] = np.nan if fill_value_for_all_nan is None else fill_value_for_all_nan
            continue
        valid_indices = np.where(~mask)[0]
        col[mask] = np.interp(np.where(mask)[0], valid_indices, col[valid_indices])
        arr_out[:, i] = col
    return arr_out

def apply_smoothing(features_data, fps, fc=3, N=4):
    if features_data.size == 0 or fps == 0:
        return features_data
    
    # 1. 先補 NaN，這是必須的
    clean = fill_nan_numpy(features_data, fill_value_for_all_nan=0.0)
    
    # 2. Savitzky-Golay 參數
    # window_length: 必須是奇數，建議為 fps 的 25%
    # polyorder: 3 (足夠擬合動作曲線)
    win = max(5, int(fps * 0.25) // 2 * 2 + 1)
    # 防呆：如果 win 大於資料長度，自動縮小 win
    if win > len(clean):
        win = len(clean) // 2 * 2 + 1
        if win < 3:
            return clean

    out = np.zeros_like(clean)
    for i in range(clean.shape[1]):
        # mode='interp' 處理邊緣，效果比 butterworth 的 padding 好得多
        out[:, i] = savgol_filter(clean[:, i], window_length=win, polyorder=3, mode='interp')
    return out

def resample_to_length(data, target_length):
    if len(data) == target_length:
        return data
    if target_length <= 0:
        return np.array([])
    n = data.shape[1]
    x_orig = np.linspace(0, 1, len(data))
    x_tgt  = np.linspace(0, 1, target_length)
    out = np.zeros((target_length, n))
    for i in range(n):
        col = data[:, i]
        valid_mask = ~np.isnan(col)
        valid_count = np.sum(valid_mask)
        
        # 【新增防呆】如果有效影格不到總長度的 15%（通常代表嚴重遮蔽）
        # 就直接整欄保留 NaN，不要硬插值變成平線
        if valid_count < len(col) * 0.15:
            out[:, i] = np.nan
        else:
            out[:, i] = np.interp(x_tgt, x_orig[valid_mask], col[valid_mask])
    return out

# ─── Rep segmentation ────────────────────────────────────────────────────────

def primary_signal_of(features, cfg):
    """取出 cfg 指定的主訊號欄。

    segment_signal_idx 可以是整數欄位索引，**也可以是 "avg_elbow" 這種字串**
    （雙肘平均，抗單側雜訊）。任何地方直接拿它去做 features[:, idx] 都會在
    字串的情況炸掉 —— 而 build_multi_exercise_template 正是這樣寫的，
    例外被外層 except 吞掉、整支影片被跳過，最後回報「No valid repetitions
    found」，看起來像影片有問題，其實是索引型別錯誤。統一走這個函式。
    """
    idx = cfg.get("segment_signal_idx", 0)
    if isinstance(idx, str):
        if idx == "avg_elbow" and features.shape[1] >= 2:
            return (features[:, 0] + features[:, 1]) / 2.0, idx
        if idx == "auto_bilateral":
            # 要跟 segment_repetitions_auto 用同一套規則解析，否則 debug 印出來的
            # 「主訊號範圍」是第 0 欄、實際切割用的是另一欄，判讀時會被誤導。
            k = resolve_bilateral_col(features, cfg)
            return features[:, k], k
        return features[:, 0], 0
    return features[:, idx], idx


def resolve_bilateral_col(features, cfg):
    """auto_bilateral → 實際欄位索引：挑活動範圍大的那側（被擋住的那側範圍會很小）。"""
    ml = cfg.get("metric_labels") or []
    pairs = cfg.get("bilateral_pairs") or []
    if not pairs:
        return 0
    try:
        ia, ib = ml.index(pairs[0][0]), ml.index(pairs[0][1])
        ra = float(np.nanmax(features[:, ia]) - np.nanmin(features[:, ia]))
        rb = float(np.nanmax(features[:, ib]) - np.nanmin(features[:, ib]))
    except Exception:
        return 0
    if not (np.isfinite(ra) and np.isfinite(rb)):
        return ia
    return ia if ra >= rb else ib


def primary_label_of(cfg, features=None):
    """主訊號的可讀名稱（字串索引時給複合名稱）。"""
    idx = cfg.get("segment_signal_idx", 0)
    ml = cfg.get("metric_labels", [])
    if isinstance(idx, str):
        if idx == "avg_elbow" and len(ml) >= 2:
            return f"{ml[0]}+{ml[1]} 平均"
        if idx == "auto_bilateral":
            if features is not None:
                k = resolve_bilateral_col(features, cfg)
                return f"{ml[k]}（自動選看得到的那側）" if k < len(ml) else str(idx)
            return "左右自動選"
        return str(idx)
    return ml[idx] if 0 <= idx < len(ml) else str(idx)


# 【v9.2】自適應死區的三個常數（離線用 46 支 counting_signal 回放選定）
_DZ_K   = 5.0    # 死區半寬 = K × 雜訊估計；k=4~6 同分，取中間值
_DZ_MIN = 0.03   # 半寬下限（佔動作幅度比例）：再窄等於沒有遲滯
_DZ_MAX = 0.20   # 半寬上限：訊號很髒時仍維持原本的抗抖能力

def _hysteresis_phases(sig, fps, hi_frac=0.65, lo_frac=0.35, min_rep_sec=1.0):
    # hi_frac / lo_frac 自 v9.2 起不再使用（死區改為自適應），保留參數僅為相容
    """遲滯狀態機：回傳 (tops, bottoms) —— 每次「確認回到頂端」與「確認下探到底」的幀。

    用 5/95 百分位而不是 min/max 界定動作範圍，避免單一離群幀（骨架跳掉）
    把整個範圍撐大、導致死區失真。

    初始若已在頂端，把第 0 幀補進 tops —— 否則「頂→底→頂」拍法的第一下
    會少切一個循環（第一個頂在影片開頭、不會被狀態機記錄到）。
    """
    n = len(sig)
    fin = sig[np.isfinite(sig)]
    # ⚠️ 這兩個早退原本回 2 個值，但呼叫端（line ~1078）是
    #    `tops, bottoms, cycles = _hysteresis_phases(...)` 解 3 個 ——
    #    訊號太短或完全平坦時就會 ValueError: not enough values to unpack。
    #    而「完全平坦」正是骨架沒抓到人時的樣子，等於在最需要好好回報的情況下
    #    改丟一個看不懂的例外。統一回 3 個值。
    if fin.size < 10:
        return [], [], 0
    lo, hi = float(np.percentile(fin, 5)), float(np.percentile(fin, 95))
    rng = hi - lo
    if rng < 1e-6:
        return [], [], 0
    mid = lo + rng * 0.5
    # ── 【v9.2】死區寬度改由**訊號自身的雜訊量**決定，不再寫死成幅度的固定比例 ──
    #   死區存在的目的是擋住抖動，所以它該有多寬，本來就該問「這支訊號抖多大」，
    #   而不是一律取幅度的 30%。固定比例的問題實測得很清楚：臥推的肘角被透視
    #   壓縮，同樣 30% 的死區換算成絕對角度只剩約 10°，力竭時幅度變小的最後
    #   一下就跨不過去 —— 46 支回放中 6 支少算全是這一型。
    #
    #   雜訊估計用「相鄰幀差的**第 25 百分位**」：真正的動作是少數幀的大位移，
    #   停頓／頂端／底部佔多數，那些幀的幀間差就是雜訊本身。用中位數會被動作
    #   汙染（實測與固定死區完全同分），用 25 百分位才估到真正的抖動底噪。
    #
    #   離線驗證（用 46 支的 counting_signal 回放，真值來自拍攝腳本）：
    #     固定死區 0.35–0.65        38 / 46
    #     自適應 k=4~6              39 / 46   ← 採用，且 half 上下限怎麼設都一樣
    #     死區收到近乎 0            41 / 46   ← **不採用**：那等於關掉遲滯，
    #                                          在這 46 支上贏，是對單一受測者過擬合
    d_all = np.abs(np.diff(fin))
    noise = float(np.percentile(d_all, 25)) if d_all.size else 0.0
    half = max(rng * _DZ_MIN, min(rng * _DZ_MAX, _DZ_K * noise))
    th_lo, th_hi = mid - half, mid + half

    first = next((float(v) for v in sig if np.isfinite(v)), None)
    if first is None:
        return [], [], 0

    # ── 【v6.4】相位無關的事件序列 ────────────────────────────────────────
    #   舊版只精修 tops、只用 tops 數次數，再靠 init_top（拿「第一個有效幀
    #   在 mid 的哪一側」判斷）±1 校正。兩個問題：
    #     ① 不對稱：bottoms 是原始的門檻穿越幀，沒精修也沒合併，
    #        跟 tops 不是同一套標準，卻要拿來配對。
    #     ② init_top 由**單一幀**決定。起槓那一下、或第一幀骨架跳掉，
    #        整支影片的次數就整體 ±1。
    #
    #   使用者的要求很單純：**一個完整週期算一下，不管影片從哪個相位開始**。
    #     · 從上面起槓：頂 底 頂 底 … 頂   （N 下 → 2N+1 個極值）
    #     · 從胸口起  ：底 頂 底 頂 … 底   （N 下 → 2N+1 個極值）
    #   兩種都滿足 **N = (極值總數 − 1) // 2**，不需要知道起始相位。
    #
    #   所以改成：把 top / bottom 事件放進**同一條交替序列**，
    #   兩種極值都精修到真正的局部極值、都套同一個 min_gap 合併，
    #   最後用配對規則數。
    events = []                       # [(frame, 'T'|'B')]，狀態機保證天然交替
    state = 'top' if first >= mid else 'bottom'
    events.append((0, 'T' if state == 'top' else 'B'))
    for i in range(n):
        v = sig[i]
        if not np.isfinite(v):
            continue
        if state == 'top' and v <= th_lo:
            state = 'bottom'; events.append((i, 'B'))
        elif state == 'bottom' and v >= th_hi:
            state = 'top'; events.append((i, 'T'))

    # ⚠️ 事件記的是「穿越門檻的那一瞬間」，不是真正的極值。直接拿來當切點的話，
    #    一個 segment 會變成「還在上升 → 頂端停留 → 下降到底 → 升回門檻」，
    #    谷點嚴重偏後 —— 實測深蹲切出向心 56 / 離心 18（3:1），生物力學上不可能。
    #    精修：在相鄰兩個事件之間找真正的局部極值（top 取 max、bottom 取 min）。
    refined = []
    for k, (f, kind) in enumerate(events):
        nxt = events[k + 1][0] if k + 1 < len(events) else n
        seg = sig[f:nxt] if nxt > f else None
        if seg is not None and len(seg) and np.isfinite(seg).any():
            off = int(np.nanargmax(seg)) if kind == 'T' else int(np.nanargmin(seg))
            refined.append((f + off, kind))
        else:
            refined.append((f, kind))

    # 合併「間隔過近」的事件。死區擋得掉小抖動，但擋不掉骨架整個跳掉再跳回來
    # （臥推畫面有鏡子，MediaPipe 會在本人與鏡像之間跳），而且臥推肘角被透視
    # 壓縮到只有 30–47°，死區絕對值僅約 10°，更容易誤觸發。
    # ⚠️ 必須在偵測完之後合併，不能在狀態機迴圈裡 continue ——
    #    continue 只把轉換往後延，轉換本身還是發生了，次數照樣多算。
    # ⚠️ 合併時要**維持交替**：丟掉一個事件會讓前後兩個同類型相鄰，
    #    那就不再是合法的 T/B 交替序列，配對規則會失效。所以同類型相鄰時
    #    保留「更極端」的那一個。
    # ⚠️ 這裡的間隔是「相鄰兩個極值」＝**半個 rep**，不是一整下。
    #    舊版 min_gap 套在 tops 上（相隔一整下），係數 0.6 是對的；
    #    改成交替序列後如果沿用 0.6，等於要求半個 rep 也要 0.6×min_rep_sec，
    #    門檻整整加倍 —— 實測會把「力竭時加速到 1.3 秒一下」的最後幾下吃掉
    #    （5 下數成 4 下、從胸起的甚至數成 3 下）。所以要再折半。
    min_gap = max(1, int(fps * min_rep_sec * 0.3))
    merged_ev = []
    for f, kind in refined:
        if merged_ev and f - merged_ev[-1][0] < min_gap:
            pf, pk = merged_ev[-1]
            if pk == kind:                     # 同類型：留更極端的
                better = (sig[f] > sig[pf]) if kind == 'T' else (sig[f] < sig[pf])
                if better:
                    merged_ev[-1] = (f, kind)
            continue                            # 不同類型且太近 → 視為抖動，丟掉後者
        if merged_ev and merged_ev[-1][1] == kind:
            # 交替被破壞（前一個同類型被合併掉了）→ 留更極端的，不新增
            pf, _ = merged_ev[-1]
            better = (sig[f] > sig[pf]) if kind == 'T' else (sig[f] < sig[pf])
            if better:
                merged_ev[-1] = (f, kind)
            continue
        merged_ev.append((f, kind))

    # ── 【v6.4】漏切修補 ──────────────────────────────────────────────
    #   死區用的是「整段訊號 5–95 百分位」的固定門檻。只要有一下的幅度比其他下
    #   小（力竭時最後一下沒推到底、或起始那下還沒進入節奏），它就跨不過門檻，
    #   兩下被併成一下。實測 2026-07-31 剩下的計次錯誤幾乎全是這一種：
    #       臥推正側面 5→4  每下 [1.90, 1.87, 2.00, **4.37**] 秒
    #       臥推正側面 5→4  每下 [**3.70**, 2.03, 1.90, 2.20]
    #       臥推自選   5→4  每下 [3.03, **5.10**, 2.53, 2.70]
    #   共同特徵：有一段是中位數的兩倍左右，其餘都很整齊。
    #
    #   所以用**中位數當內部參照**回頭補：某一段明顯超過中位數的 1.6 倍時，
    #   到那段內部去找漏掉的那一對極值補進來。這不需要新的門檻常數，
    #   參照來自訊號自己，對節奏快慢一律成立。
    def _repair(ev):
        for _ in range(4):                       # 最多補四輪，避免病態訊號無限迴圈
            if len(ev) < 4:
                return ev
            gaps = [ev[i + 1][0] - ev[i][0] for i in range(len(ev) - 1)]
            med = float(np.median(gaps))
            if med <= 0:
                return ev
            # ⚠️ 【v7 試過並否決】曾改成「所有過長間距由大到小逐一嘗試」，
            #   想解決「第一個超標間距在影片開頭、補不出來就整個放棄」。
            #   拿 40 支真實 signal_dump 掃描：34/40 → 33/40，**更糟**
            #   （會把一支本來對的 5 下補成 8 下）。
            #   同時掃了門檻 1.8 / 2.0 / 2.4 與「只補一輪」，全部 32/40。
            #   完全停用 _repair 則掉到 26/40 —— 它確實有在做事。
            #   結論：保持「只試第一個、門檻 1.6、最多四輪」。
            holes = [i for i, g in enumerate(gaps) if g > med * 1.6][:1]
            if not holes:
                return ev
            patched = False
            for hole in holes:
                a_f, a_k = ev[hole]
                b_f, _ = ev[hole + 1]
                inner = sig[a_f:b_f]
                if len(inner) < 5 or not np.isfinite(inner).any():
                    continue
                # 漏掉的是「與兩端相反」的那個極值 —— 找它，再找回程的同型極值
                opp = int(np.nanargmin(inner)) if a_k == 'T' else int(np.nanargmax(inner))
                if opp < 2 or opp > len(inner) - 3:
                    continue
                seg2 = inner[opp:]
                same = opp + (int(np.nanargmax(seg2)) if a_k == 'T' else int(np.nanargmin(seg2)))
                if same <= opp or same >= len(inner) - 1:
                    continue
                # 補進來的兩個極值必須真的有幅度，不能是雜訊上的小起伏
                amp = abs(float(inner[opp]) - float(inner[same]))
                if amp < rng * 0.25:
                    continue
                ev = ev[:hole + 1] + [(a_f + opp, 'B' if a_k == 'T' else 'T'),
                                      (a_f + same, a_k)] + ev[hole + 1:]
                patched = True
                break
            if not patched:
                return ev
        return ev

    def _repair_tail(ev):
        """頭尾漏切：最後一下幅度變小（力竭）時，它連一次門檻都沒跨過，
        事件序列直接提早結束 —— 中間沒有「過長的空隙」可抓，所以 _repair
        看不到它。這裡另外檢查尾段（與頭段）還夠不夠塞下一次完整擺盪。

        實測就是這一種：五下但最後一下只做一半，偵測成 4 下。
        """
        for _ in range(3):
            if len(ev) < 3:
                return ev
            gaps = [ev[i + 1][0] - ev[i][0] for i in range(len(ev) - 1)]
            med = float(np.median(gaps))
            if med <= 0:
                return ev
            changed = False
            lf, lk = ev[-1]
            # ── 收尾半程：下去了但沒完全推回頂端（力竭時最後一下很常見）──
            #   這時序列停在 B，最後那次上升因為高度不足跨不過 th_hi，
            #   事件少一個 → (極值數−1)//2 少算一下。
            #   實測：五下但最後一下只推回 48% 幅度 → 數成 4 下。
            #   判準用「回程幅度是否達整體動作幅度的 40%」——
            #   真的有推回來就補；影片單純停在底部收工（你臥推從胸起的拍法）
            #   尾段近乎平線，達不到 40%，不會誤加。
            tail0 = sig[lf:]
            if len(tail0) > 5 and np.isfinite(tail0).any():
                back = float(np.nanmax(tail0)) - float(np.nanmin(tail0)) if lk == 'B' \
                    else float(np.nanmax(tail0)) - float(np.nanmin(tail0))
                if back >= rng * 0.40:
                    idx = int(np.nanargmax(tail0)) if lk == 'B' else int(np.nanargmin(tail0))
                    if idx > 1:
                        ev = ev + [(lf + idx, 'T' if lk == 'B' else 'B')]
                        changed = True
            if changed:
                continue
            # 尾段還塞得下一次完整擺盪
            if n - lf > med * 1.5:
                tail = sig[lf:]
                if len(tail) > 5 and np.isfinite(tail).any():
                    opp = int(np.nanargmin(tail)) if lk == 'T' else int(np.nanargmax(tail))
                    if 2 < opp < len(tail) - 2:
                        seg2 = tail[opp:]
                        same = opp + (int(np.nanargmax(seg2)) if lk == 'T' else int(np.nanargmin(seg2)))
                        if same > opp and abs(float(tail[opp]) - float(tail[same])) >= rng * 0.25:
                            ev = ev + [(lf + opp, 'B' if lk == 'T' else 'T'), (lf + same, lk)]
                            changed = True
            if not changed:
                return ev
        return ev

    merged_ev = _repair(merged_ev)        # 中間漏切（某段是兩倍長）
    merged_ev = _repair_tail(merged_ev)   # 尾段沒推回頂端
    #  ⚠️ 頭段無法在這裡修：狀態機一定會在第 0 幀記一個事件，
    #     所以「第一個事件之前」永遠是空的。實測 9 支少算的成因
    #     還沒定位，需要真實訊號才能診斷 —— 見下方 signal_dump。

    tops = [f for f, k in merged_ev if k == 'T']
    bottoms = [f for f, k in merged_ev if k == 'B']

    # 完整週期數：極值交替序列 T B T B … 或 B T B T …
    #   N 下 ⇒ 2N+1 個極值 ⇒ N = (總數 − 1) // 2
    # 這個式子對「從頂起」與「從底起」都成立，不必判斷起始相位。
    #
    # ⚠️ 【v7 試過並否決】曾改成「每離開起始狀態一次算一下」
    #    （從頂起數 B、從底起數 T），想解決「臥推推到鎖死就收工」
    #    那種頭尾不同型的序列（10 個極值被算成 4 下）。
    #    拿 40 支真實 signal_dump 回放：**85% → 60%，反而更糟。**
    #    原因是影片結尾常有一次「不算一下」的離開動作（放槓前的下放、
    #    收工時的半蹲），那條規則會把它算成一下。
    #    「要回得來才算一下」才是對的，與使用者的定義一致。
    cycles = max(0, (len(merged_ev) - 1) // 2)
    return tops, bottoms, cycles


def segment_repetitions(features_data, fps,
                        signal_col=1,
                        min_rep_sec=1.5,
                        prominence=15,
                        invert=False,
                        signal_override=None):
    rep_list = []
    if features_data.size == 0:
        return rep_list
        
    # 【加速關鍵】：先對整份特徵做一次性的插值，不要放在迴圈裡。
    # ⚠️ 修正：只補 NaN（被遮蔽的偵測缺口），不要做 0→NaN。
    #    Tempo（手腕位移差）、Stability（重心變異數）等特徵「合理就是 0」
    #    （例如動作起始幀、歷史視窗只有 1 筆時），若把 0 當成遺漏值插值掉，
    #    會抹掉這些正常的 0、輕微扭曲模板數值。fill_nan_numpy 本身只處理
    #    NaN、不動 0，因此這裡保留真實的 0。
    # ⚠️ fill_value_for_all_nan=None：若某個特徵整段都是 NaN（該側肢體
    #    被視角完全遮蔽），保留 NaN 不要歸零。這樣切割出來的 rep 仍帶著
    #    NaN，score_rep 才能偵測到「此肢體被遮蔽」並把權重歸零、不誤扣分。
    # ⚠️【v4.8 關鍵修正】這裡要分成兩份，不能共用一份：
    #   features_clean（整欄 NaN → 0）只給「切割訊號」用，讓 find_peaks/狀態機
    #     不會因為某欄壞掉就整個罷工；
    #   features_seg（整欄 NaN → 保留 NaN）才是切進 rep、送去評分的資料。
    #   舊版兩者共用填 0 的版本，後果非常嚴重：左腿整段追不到 → 該欄補成 0 →
    #   score_rep 的 np.isnan(col).all() 永遠 False → 拿「0 度」去跟模板的
    #   「120 度」比，raw_loss 高達 105，再被方向性評分判成「比教練小＝蹲更深」
    #   而完全不扣分。實測 3 支左腿全失聯的深蹲拿到 98.9/98.6/99.3 的最高分。
    features_clean = fill_nan_numpy(features_data.copy(), fill_value_for_all_nan=0.0)
    features_seg = fill_nan_numpy(features_data.copy(), fill_value_for_all_nan=None)

    if signal_override is not None:
        # 【v6.0】依機位算好的計次訊號（只用 2D 座標）。關節角度必須靠 world z，
        #   在「動作方向正對鏡頭」的機位會退化 —— 實測臥推正上方俯視骨架抓得
        #   很好（可見度 ≥0.96）但肘角 ROM 只剩 13–27°，5 下被切成 9 下。
        #   計次不需要解剖角度，只需要一個在該機位看得清楚的週期量。
        sig = np.asarray(signal_override, dtype=float)
        if len(sig) != len(features_clean):
            sig = features_clean[:, 0] if signal_col == "avg_elbow" else features_clean[:, signal_col]
        else:
            sig = fill_nan_numpy(sig.reshape(-1, 1), fill_value_for_all_nan=0.0)[:, 0]
    elif signal_col == "avg_elbow":
        sig = (features_clean[:, 0] + features_clean[:, 1]) / 2.0
    else:
        # 【v6.4】自保：signal_col 必須是真的欄位索引。
        #   上游（模板存回來的 seg_col、cfg 的字串設定）可能塞進 "counting:腕部垂直高度"
        #   這種名稱字串，直接拿去索引會噴 numpy 的 IndexError —— 訊息完全看不出
        #   哪裡錯，還會被 api 層吞成「分析失敗，請重試」。這裡先擋下並講清楚。
        if not isinstance(signal_col, (int, np.integer)):
            raise ValueError(
                f"計次訊號欄位設定錯誤：signal_col={signal_col!r} 不是欄位索引。"
                f"（模板存的 seg_col 可能是名稱字串，需由 segment_repetitions_auto 先還原）")
        if not (0 <= int(signal_col) < features_clean.shape[1]):
            raise ValueError(
                f"計次訊號欄位越界：signal_col={signal_col}，"
                f"這個動作只有 {features_clean.shape[1]} 欄指標。")
        sig = features_clean[:, int(signal_col)]

    if invert:
        sig = -sig

    if np.isnan(sig).all() or len(sig) < 20:
        return rep_list

    # ══════════════════════════════════════════════════════════════
    # 【v4.8】改用遲滯狀態機（hysteresis）決定切點，find_peaks 退居備援
    # ══════════════════════════════════════════════════════════════
    # 為什麼換掉 find_peaks+prominence：
    #   它是在找「局部極大值」，只要一下動作中途有停頓、鎖點微調、或骨架
    #   抖動超過 prominence，就會多出一個峰 → 多算一下。實測「做 5 下」被
    #   算成 7–8 下，就是這樣來的；把 prominence 調高又會漏掉幅度小的動作。
    #
    # 遲滯狀態機的作法：把動作範圍的 35%–65% 設成「死區」，
    #   在「頂端」狀態時必須跌破 35% 才算下去、在「底部」狀態時必須升破 65%
    #   才算回來。中途任何沒有跨越 30% 動作幅度的抖動都被忽略 ——
    #   這正是計次器（跑步、划船機、健身 app）的標準作法，對雜訊極穩健。
    #
    # 次數 = 下探次數（每「下去一次」就是一下），對兩種拍法都成立：
    #   「頂→底→頂」算一下、「底→頂→底」算一下，下探次數都等於實際下數。
    tops, bottoms, cycles = _hysteresis_phases(sig, fps, min_rep_sec=min_rep_sec)

    sig_range = float(np.nanmax(sig) - np.nanmin(sig)) if np.isfinite(sig).any() else 0.0
    counted, mode, adaptive_prom = 0, 'hysteresis', 0.0

    # 【v6.4】切點也要跟著相位選，不能寫死用 tops。
    #   從上面起槓（頂 底 頂 … 頂）：tops 有 N+1 個 → 切出 N 個完整循環 ✅
    #   從胸口起  （底 頂 底 … 底）：tops 只有 N 個 → 只切出 N−1 個 ❌ 少一個
    #   使用者做實驗時是「從胸起」，正是後者。改成**取數量較多的那種極值**當切點，
    #   兩種拍法都能拿到 N 個完整循環去評分。
    #   對應地，段內的相位分界要找相反的極值：
    #     頂→頂 的段，中間是谷（argmin）；底→底 的段，中間是峰（argmax）。
    use_bottoms = len(bottoms) > len(tops)
    anchors = bottoms if use_bottoms else tops
    if len(anchors) >= 2:
        # 切點＝每次回到同一個極值的時刻，相鄰兩個之間就是一個完整循環。
        # 這裡「不」再補 [0, len-1]：影片開頭到第一個極值、最後一個極值到結尾
        # 都只是半個循環，補進來就是製造假 rep（舊版多算的元凶之一）。
        splits = np.array(anchors, dtype=int)
        counted = cycles                # 完整週期數（下去且回得來）
    else:
        # 備援：訊號整段都在死區內擺盪等怪狀況，退回舊的 find_peaks
        mode = 'find_peaks'
        adaptive_prom = min(max(prominence * 0.7, sig_range * 0.18), sig_range * 0.40)
        peaks, _ = find_peaks(sig, distance=int(fps * min_rep_sec), prominence=adaptive_prom)
        if len(peaks) == 0:
            splits = np.array([0, len(sig) - 1], dtype=int)
        else:
            splits = np.unique(np.concatenate(([0], peaks, [len(sig) - 1]))).astype(int)

    # 【v7】把計次訊號本身存下來（降採樣到 ≤400 點）。
    #   實測有 9 支「穩定少算 1 下」但間距完全均勻 —— 沒有中間空隙可抓，
    #   代表漏的在頭尾。但光看 rep_boundaries 無法判斷是頭還是尾、
    #   也看不出訊號長什麼樣。沒有原始訊號就只能猜，而猜過三次都錯了。
    try:
        _st = max(1, len(sig) // 400)
        _dump = {"signal": [round(float(v), 4) if np.isfinite(v) else None
                            for v in sig[::_st]],
                 "stride": _st, "n": int(len(sig)),
                 "splits": [int(x) for x in splits],
                 "tops": [int(x) for x in tops], "bottoms": [int(x) for x in bottoms],
                 "counted": int(counted), "mode": mode}
    except Exception:
        _dump = None

    # 偵錯 log：遇到計次怪事直接看這行
    try:
        print(f"[segment_repetitions] mode={mode} signal_col={signal_col} "
              f"len={len(sig)} sig_range={sig_range:.2f} "
              f"tops={len(tops)} bottoms={len(bottoms)} cycles={cycles} counted={counted} "
              f"adaptive_prom={adaptive_prom:.2f} splits={splits.tolist()[:12]}")
    except Exception:
        pass

    if len(splits) < 2:
        return rep_list
        
    for i in range(len(splits) - 1):
        s, e = splits[i], splits[i + 1]
        if s == e:
            continue
            
        # 切給評分用的是「保留整欄 NaN」的版本 —— 壞掉的欄位必須讓 score_rep 看見
        seg_np = features_seg[s:e, :]
        # 但「找谷點」必須用補過值的連續訊號：np.argmin 碰到 NaN 會回傳 NaN 的位置，
        # 谷點一錯，向心/離心就從錯的地方切開，整個 rep 的相位都歪掉。
        seg_sig = sig[s:e]

        if len(seg_sig) < 3:
            continue
            
        # ── 段內的相位分界＝與切點相反的那個極值 ────────────────────────────
        #   頂→頂 的段：中間是谷 → argmin
        #   底→底 的段：中間是峰 → argmax（從胸口起的臥推就是這種）
        #
        # 【v8.5】舊版直接取**整段的全域極值**，兩個問題：
        #   ① 訊號在段邊界附近有雜訊尖峰時，極值就落在那裡 —— 實測臥推俯視
        #      有一個 rep 的「向心」只有 3 幀（整段 64 幀），佔比 0.05。
        #      一下的最低點不可能發生在動作的前 5%，那是雜訊不是動作。
        #   ② 相位切點一歪，這個 rep 的向心／離心就從錯的地方切開，
        #      重採樣後與其他 rep 相位對不上，DBA 疊起來互相抵銷 →
        #      模板被平均成一條幾乎沒有幅度的線。
        #      實測 12 個 rep 的向心佔比散在 0.05–0.71，但**一下的總長度
        #      CV 只有 0.07–0.18**（節奏其實很穩）—— 亂的只有切點。
        #
        # 修法兩層：
        #   ① 先平滑，避免單一幀的雜訊尖峰奪走極值
        #   ② 只在中段 [20%, 80%] 找極值 —— 這是物理約束不是調參：
        #      一下動作的最低（最高）點不可能落在前 20% 或後 20%
        _n = len(seg_sig)
        _sm = seg_sig
        if _n >= 7:
            _k = max(3, int(_n * 0.08) | 1)          # 奇數窗，約一下的 8%
            _pad = np.pad(seg_sig, _k // 2, mode='edge')
            _sm = np.convolve(_pad, np.ones(_k) / _k, mode='valid')[:_n]
        _lo = max(1, int(_n * 0.20))
        _hi = max(_lo + 1, int(_n * 0.80))
        _win = _sm[_lo:_hi]
        if _win.size and np.isfinite(_win).any():
            v_rel = _lo + int(np.nanargmax(_win) if use_bottoms else np.nanargmin(_win))
        else:                                        # 中段全 NaN → 退回舊行為
            v_rel = (int(np.argmax(seg_sig[1:-1])) if use_bottoms
                     else int(np.argmin(seg_sig[1:-1]))) + 1
        v_abs = s + v_rel

        rep_list.append({
            "phase1": seg_np[:v_rel, :],     # 向心階段
            "phase2": seg_np[v_rel:, :],     # 離心階段
            "start_frame": int(s),
            "valley_frame": int(v_abs),
            "end_frame": int(e),
            # 【v4.8】記錄振幅供假 rep 過濾用
            "amplitude": float(np.nanmax(seg_sig) - np.nanmin(seg_sig)) if np.isfinite(seg_sig).any() else 0.0,
        })
    if rep_list and _dump is not None:
        rep_list[0]["signal_dump"] = _dump

    # ── 【v4.8】假 rep 過濾 ───────────────────────────────────────
    # 不做這件事，計次會多算、而且模板與評分會一起被污染。實測一支「做 5 下」
    # 的臥推被切成 8–10 次，就是下面兩種東西混進來：
    #
    #   (a) 起槓 / 放槓 / 中途調整握距 —— 手肘也會屈伸，但幅度遠小於一下完整動作。
    #       → 用振幅過濾：小於中位數一半的丟掉。
    #
    #   (b) 頭尾的「半下」 —— 切點取在動作頂端（訊號極大值）。使用者如果是
    #       「底 → 頂 → 底」算一下（臥推從槓貼胸開始、深蹲從蹲底開始），
    #       第一段就是「起始底 → 第一個頂」、最後一段是「最後頂 → 結束底」，
    #       各只有半個循環。它們的振幅跟完整一下一樣大（振幅過濾抓不到），
    #       但長度只有一半 → 只對頭尾兩段做長度過濾。
    #
    # 對「頂 → 底 → 頂」的拍法無害：那種拍法頭尾本來就不會產生半下，
    # 而頭尾若有站著發呆的片段，長度過濾也剛好把它清掉。
    # 假 rep 過濾。兩條路徑都需要：
    #   · find_peaks 備援：會把起槓/放槓、雜訊抖動都切成一下（用振幅濾）
    #   · 遲滯狀態機：死區擋得掉小抖動，但動作幅度被透視壓縮時（臥推肘角只有
    #     30–47°，死區僅約 10°）仍會冒出「14 幀 / 32 幀」這種極短的假 rep。
    #     它們的振幅跟真 rep 差不多（振幅濾不到），但時長明顯不合理 → 用時長濾。
    if len(rep_list) >= 3:
        before = len(rep_list)
        if mode == 'find_peaks':
            amps = np.array([r["amplitude"] for r in rep_list], dtype=float)
            med_a = float(np.median(amps[amps > 0])) if np.any(amps > 0) else 0.0
            kept = [r for r in rep_list if not (med_a > 0 and r["amplitude"] < med_a * 0.5)]
        else:
            # 硬下限用 min_rep_sec（cfg 已經定義「一下最少幾秒」，是物理事實，
            # 比相對中位數的閾值可靠）；再加一道相對閾值處理極端不均的情況。
            lens = np.array([r["end_frame"] - r["start_frame"] for r in rep_list], dtype=float)
            med_l = float(np.median(lens))
            # 用 MAD（中位數絕對偏差）做離群偵測，而不是固定比例的門檻。
            #
            # 固定門檻在這裡一定會顧此失彼：力竭時最後幾下會加速（實測 2.9→1.2 秒），
            # 門檻嚴就把真的一下誤殺；門檻鬆又放進假 rep（實測 32 幀那種）。兩者的
            # 長度比例重疊（0.48 vs 0.61），單看「佔中位數幾成」分不開。
            #
            # MAD 的好處是**自動適應節奏是否整齊**：
            #   · 節奏一致時 MAD 很小 → 門檻收緊 → 突然冒出的短段一抓就中
            #   · 力竭而節奏本來就散時 MAD 大 → 門檻放寬 → 不會誤殺真的快 rep
            # 另外用 med_l*0.08 當 MAD 下限，避免長度完全相同時 MAD=0 讓門檻退化。
            mad = float(np.median(np.abs(lens - med_l)))
            min_len = max(int(fps * 0.5), med_l - 3.0 * max(mad, med_l * 0.08))
            kept = [r for r in rep_list if (r["end_frame"] - r["start_frame"]) >= min_len]
        if len(kept) >= 2 and len(kept) < before:
            try:
                print(f"[segment_repetitions] 假 rep 過濾（{mode}）：{before} → {len(kept)}")
            except Exception:
                pass
            # ── 【v7】只有 find_peaks 模式才扣次數 ────────────────────────
            #   舊版無條件把「濾掉幾個 segment」扣在次數上，假設每個被濾掉的
            #   segment 都對應一次假的頂點。那個假設在 find_peaks 模式成立
            #   （peak 本來就是一個一個切的），但在**遲滯狀態機模式不成立**：
            #   次數是由極值配對 (極值數−1)//2 算出來的，跟「切出幾個
            #   segment、其中幾個夠長」是兩件獨立的事。
            #
            #   一個 segment 太短被濾掉，通常是切點落點不理想（例如頭尾的
            #   半程），不代表那一下沒發生 —— 次數不該跟著少。
            #
            #   實測 2026-07-31（signal_dump）：臥推少算的案例裡，
            #   狀態機算出的 counted 是**對的**，卻被這行扣掉 1：
            #     正面 有經驗  實際 5  tops=6 bottoms=6 → counted=5 ✅ → 扣成 4 ❌
            #     正側 刻意錯  實際 4  tops=5 bottoms=5 → counted=4 ✅ → 扣成 3 ❌
            #     正側 新手    實際 5  tops=6 bottoms=6 → counted=5 ✅ → 扣成 4 ❌
            #   九支少算裡有四支是這一行造成的。
            #
            #   過濾本身仍然要做 —— 它的目的是**保護評分**（不要拿垃圾
            #   segment 去比模板），不是修正次數。
            if mode == 'find_peaks':
                counted = max(len(kept), counted - (before - len(kept))) if counted else len(kept)
            rep_list = kept

    # 把「回報次數」釘在每個 rep 上，讓上層不必重算也不會用錯（見 count_reps）
    for r in rep_list:
        r["counted_reps"] = counted if counted else len(rep_list)

    return rep_list


def count_reps(reps):
    """回報給使用者的「次數」——不等於 len(reps)。

    len(reps) 是「拿去評分的完整循環數」，切法是「頂→底→頂」。但使用者
    數的是「下探幾次」：
      · 「頂→底→頂」算一下（深蹲從站直開始）→ 循環數＝下數
      · 「底→頂→底」算一下（臥推從槓貼胸開始）→ 影片頭尾各半個循環，
        完整循環只有 N-1 個，直接用 len(reps) 會少算一下。
    所以次數由遲滯狀態機的「下探次數」決定，評分則只用完整循環。
    """
    if not reps:
        return 0
    return int(reps[0].get("counted_reps", len(reps)) or len(reps))


def _threshold_crossings(sig, hi_frac=0.65, lo_frac=0.35):
    """訊號穿越遲滯門檻的次數 —— 計次品質的直接量測。

    一個乾淨的 rep 剛好穿兩次：往下跌破 35%、往上升破 65%。
    穿越次數 ÷ 切出的下數（轉換比）理想是 2.0：
      · 明顯 > 2  訊號在門檻附近來回抖 → 容易多切
      · 明顯 < 2  有下數沒被偵測到 → 少切

    實測 2026-08-01（臥推 20 支）：轉換比 2.0–2.2 全對（9/9），
    ≥2.4 或 ≤1.5 全錯（0/7）。這個量與機位無關、與動作無關，
    是目前找到最能預測計次對錯的單一指標。
    """
    a = np.asarray(sig, dtype=float)
    f = a[np.isfinite(a)]
    if f.size < 10:
        return 0
    lo, hi = float(np.percentile(f, 5)), float(np.percentile(f, 95))
    rng = hi - lo
    if rng < 1e-9:
        return 0
    th_lo, th_hi = lo + rng * lo_frac, lo + rng * hi_frac
    state = 'top' if f[0] >= lo + rng * 0.5 else 'bot'
    n = 0
    for v in f:
        if state == 'top' and v <= th_lo:
            state = 'bot'; n += 1
        elif state == 'bot' and v >= th_hi:
            state = 'top'; n += 1
    return n


def _rep_len_ok(reps, expected_len, lo=0.70, hi=1.35):
    """【v6.4】用模板的「一下該多長」驗收一組切割結果。

    為什麼需要這道驗收 ────────────────────────────────────────────────
    計次訊號是用幾何推論挑的（深蹲用髖高、臥推正上方用雙肘間距…），
    但推論會錯，而且錯得**很安靜**：訊號若一個 rep 走了兩個週期，
    切出來的每一下都很規律、CV 很漂亮，只是數量剛好兩倍。
    沒有外部參照就分不出「切得很好」和「切得很好但全是半個」。

    模板正好提供了那個外部參照：建模時已經數對了，median_con + median_ecc
    就是這個人做這個動作「一下」的長度。

    實測 2026-07-31（40 支）——分析切出的一下 ÷ 模板的一下：
        深蹲 正側面/正面/自選     0.96 / 0.94 / 0.95   ✅
        臥推 正側面/正上方         0.94 / 1.08          ✅
        臥推 自選（雙肘間距）      **0.45**             ❌ 正好一半
    門檻怎麼定的（拿同一批 40 支逐支掃描，不是拍腦袋）：
        計次**正確**的 26 支：倍率 0.77 – 1.25（中位 0.96）
        計次**錯誤**的 14 支：0.39 0.42 0.45 0.66 0.66 0.70 0.78
                              0.85 0.87 1.06 1.20 1.37 1.55 1.99
        lo=0.70, hi=1.35  → 擋下 9/14 個錯誤、**誤殺 0 支**
        再收緊到 0.80     → 多擋 1 個，但誤殺 2–3 支正確的，不划算。

    擋不掉的那 5 個是 5→6、4→5 這種差一下的，倍率落在 0.78–1.25
    的正常區間內 —— 那是節奏變異造成的，不是訊號選錯，要另外處理。
    """
    if not reps or not expected_len or expected_len <= 0:
        return True, None                      # 沒有參照就不擋
    import numpy as _np
    L = [r["end_frame"] - r["start_frame"] for r in reps]
    if not L:
        return True, None
    med = float(_np.median(L))
    ratio = med / float(expected_len)
    if lo <= ratio <= hi:
        return True, ratio
    return False, ratio


def segment_repetitions_auto(features_data, fps, cfg, min_reps_target=2,
                             landmarks=None, view=None, expected_rep_len=None,
                             metric_vis=None, vis_min=0.55, joint_confs=None):
    """切 reps，並在「主訊號失效」時自動改用其他特徵欄計次。

    為什麼需要這個：
      計次（切 reps）只需要「大致的上下擺盪」，不需要高品質關節。但若主訊號
      （例如深蹲用的膝角）所依賴的關節被裁切出鏡頭、或可見度低於門檻，整欄會
      變成 NaN→0 的平線 —— find_peaks 一個波峰都抓不到 → 只切出 1 個假 rep。
      這就是「畫面骨架明明有抓到、次數卻只判定 1 下」的根因。
      但同一支影片裡，軀幹傾斜、深蹲深度、對側肢體等其他欄通常仍隨每下擺盪。

    做法：
      1. 先用 cfg 指定的主訊號切。
      2. 切不出 >= min_reps_target 個 rep 時，掃描其餘所有欄（含反向訊號），
         取「切出最多 rep」的那一欄。adaptive_prom 內建 8 度底線，平線 / 雜訊欄
         不會產生假 rep，所以掃描是安全的。

    回傳 (rep_list, used_col, used_invert)。
    """
    primary = cfg["segment_signal_idx"]
    min_rep_sec = cfg.get("min_rep_sec", 1.5)
    prom = cfg["segment_prominence"]
    inv0 = cfg.get("segment_invert", False)
    ex_key = cfg.get("_key") or cfg.get("exercise_key") or ""
    ml = cfg.get("metric_labels", [])

    # 【v6.4 修 IndexError】這個函式成功走「機位專屬計次訊號」時，回傳的
    #   used_col 是 f"counting:{名稱}"（例如 "counting:腕部垂直高度"）。
    #   api_pose_analysis 會把它存進模板的 seg_col，受測時再讀回來塞成
    #   cfg["segment_signal_idx"]，好讓建模與受測用同一條訊號切割。
    #
    #   但 "counting:xxx" 不是欄位索引。只要受測這支影片的計次訊號沒切到
    #   足夠的 rep（刻意錯只做 4 下、動作又不典型時很容易發生），流程就會
    #   往下掉到「拿 primary 當欄位索引」那條路，執行
    #       features_clean[:, "counting:腕部垂直高度"]
    #   → IndexError，被 api 層的 except Exception 吞成「分析失敗，請重試」，
    #   看起來像影片有問題，其實是型別錯誤。實測 2026-07-31 推11、推12 就是這樣掛的。
    #
    #   這裡把它還原成「沒有指定欄位」，讓後面的自動選欄邏輯正常接手。
    if isinstance(primary, str) and primary.startswith("counting:"):
        primary = "auto_bilateral" if (cfg.get("bilateral_pairs")) else 0

    # ── 【v6.0】優先用「依機位挑好的計次訊號」──────────────────────────────
    #   計次和評分是兩件事：評分要解剖角度，計次只要一個在該機位看得清楚的
    #   週期量。深蹲用髖的垂直高度、臥推正側面用腕高度、臥推正上方用雙肘間距，
    #   三個都只吃 2D 座標，不受 z 退化影響。
    # ── 【v6.4】多候選計次：把「算得出來且看得到」的 2D 週期訊號全部試過 ──
    #   舊版每個機位寫死一條，而且好幾條是雙側平均 —— 正側面一定有一側被擋，
    #   平均下去等於把真訊號和幻覺訊號相加，振幅腰斬。
    #   改成：單側訊號各自當候選，由資料決定誰最好。
    #   評分順序（都不是拍腦袋，都是可驗證的量）：
    #     ① 依賴的關節可見度夠不夠（低於門檻的直接不列入）
    #     ② 切出的一下長度合不合模板（擋掉「一個 rep 走兩個週期」）
    #     ③ rep 長度規律度 CV（越規律越好）
    if landmarks is not None:
        # ⚠️ 候選訊號的可見度要用**8 關節原始 confs**（joint_confs），
        #   不能用 metric_vis（那是轉成 7 個指標之後的，索引完全不同）。
        #   舊版傳錯導致「左腕高度」在正側面（左腕可見度 0.28）照樣通過門檻。
        _jc = joint_confs if joint_confs is not None else metric_vis
        # 【v8】改用階梯式退讓：候選全滅時放寬可見度、但堅持不用雙側平均型。
        #   舊版直接回 [] → 掉到下面的預設訊號「腕中點高度」（雙側平均），
        #   而候選全滅的原因正好就是「一側被擋」→ 拿幻覺點位去平均。
        _cand_drop = []
        _cands = measurability.counting_candidates_resilient(
            landmarks, ex_key, confs=_jc, reasons=_cand_drop)
        if not _cands and _cand_drop:
            try:
                print(f"[segment_auto] ⚠️ 計次候選 0 條，淘汰理由：{_cand_drop[:8]}")
            except Exception:
                pass
        _scored = []
        for _nm, _sig, _v, _joints in _cands:
            if len(_sig) != len(features_data):
                continue
            _r = segment_repetitions(features_data, fps, signal_col=0,
                                     min_rep_sec=min_rep_sec, prominence=prom,
                                     invert=False, signal_override=_sig)
            if len(_r) < min_reps_target:
                continue
            _ok, _ratio = _rep_len_ok(_r, expected_rep_len)
            _dev = abs((_ratio or 1.0) - 1.0)
            _L = np.array([x["end_frame"] - x["start_frame"] for x in _r], dtype=float)
            _cv = float(_L.std() / _L.mean()) if len(_L) > 1 and _L.mean() > 0 else 9.9
            # ── 【v7】轉換比：訊號穿越遲滯門檻的次數 ÷ 切出的下數 ──────────
            #   一下應該剛好穿兩次（下去一次、回來一次），理想值 2.0。
            #   > 2 = 訊號在門檻附近來回抖（臥推行程短、有黏著點、躺姿骨架
            #   估計差，特別容易）；< 2 = 有下數被漏切。
            #
            #   實測 2026-08-01（臥推 20 支）：
            #     轉換比 2.0–2.2 → 9/9 全對
            #     轉換比 ≥2.4 或 ≤1.5 → 0/7 全錯
            #   比「候選共識」更能預測對錯，而且是**純訊號性質**，
            #   不依賴任何機位假設 —— 深蹲、臥推、正側面、俯視都同一套。
            _n = count_reps(_r)
            _tr = _threshold_crossings(_sig)
            _trr = (_tr / _n) if _n > 0 else 9.9
            _scored.append(dict(reps=_r, name=_nm, vis=_v, joints=set(_joints),
                                ok=_ok, ratio=_ratio, dev=_dev, cv=_cv,
                                trr=_trr, trr_dev=abs(_trr - 2.0), n=_n))
        if _scored:
            # ── 【v7】共識分群，不是「挑分數最高的那條」──────────────────
            #   為什麼不能直接挑最好的：候選之間會共享同一種假象。
            #   臥推有 6 條距離型、2 條高度型 —— 距離型若同時受透視影響，
            #   排序時會整群壓過正確的高度型，看起來每條都很漂亮。
            #
            #   共識的做法是：依「數出幾下」分群，取最大群。
            #   但多數決在候選數量不均時一樣會偏，所以再加一個條件：
            #   **該群至少要有兩條依賴不同關節的訊號**（例如「右腕高度」和
            #   「雙肘間距」算不同，「左腕高度」和「腕中點高度」算同一組）。
            #   一條訊號自己不能形成共識。
            # ── 【v7.1】共識只在「可見度最高的前 K 條」之間投票 ──────────────
            #   為什麼要限縮：候選有 11 條，其中好幾條依賴被擋住的關節。
            #   全部一起投票時，那些爛訊號會互相背書 —— 它們錯得很像
            #   （同一套遮擋造成的幻覺），票數反而壓過少數乾淨訊號。
            #
            #   離線驗證（用 2026-08-01 的候選報告，38 支可模擬）：
            #     全部候選一起投票        32/38
            #     可見度前 3 / 4 / 5 條   33 / 34 / 35
            #     可見度前 6 / 7 / 8 條   34 / 34 / 35
            #     現行規則（轉換比優先）   31/38
            #   K 從 3 到 8 都比「全部一起投」好 → 不是挑參數挑出來的巧合。
            #   留一交叉驗證 34/38（89%）。深蹲在各 K 值都維持 20/20。
            _K = 5
            _pool = sorted(_scored,
                           key=lambda x: -(x["vis"] if np.isfinite(x["vis"]) else 0.0))[:_K]
            groups = {}
            for s in _pool:
                groups.setdefault(s["n"], []).append(s)

            def _independent(gs):
                """這一群裡有幾條「依賴的關節組不同」的訊號"""
                seen = []
                for g in gs:
                    if all(len(g["joints"] & s) < max(1, min(len(g["joints"]), len(s)))
                           for s in seen):
                        seen.append(g["joints"])
                return len(seen)

            ranked = sorted(groups.items(),
                            key=lambda kv: (-len(kv[1]), -_independent(kv[1])))
            top_n, top_g = ranked[0]
            indep = _independent(top_g)
            runner = len(ranked[1][1]) if len(ranked) > 1 else 0

            # 信心度：三個條件都滿足才算高
            #   ① 群內有 ≥2 條獨立訊號  ② 最大群明顯領先次大群  ③ 有通過模板長度驗收
            has_ok = any(g["ok"] for g in top_g)
            confident = (indep >= 2) and (len(top_g) > runner) and has_ok
            # 群內再挑代表：優先取通過驗收、可見度高、CV 小的
            # ── 【v7.1】轉換比降回**次要**條件 ──────────────────────────
            #   v7.0 把它排第一順位，理由是「trr 2.0–2.2 的 9 支全對」。
            #   但那是只看被選中訊號的樣本偏誤。看全部候選（338 條）就知道：
            #     trr 1.9–2.3 → 178/189 = 94%
            #     trr 2.3–3.0 →  46/74  = 62%
            #     trr ≥3.0    →  27/75  = 36%
            #   它是**必要不充分**：接近 2.0 的多半對，但正確答案不一定
            #   落在 trr 最接近 2.0 的那條。實測 6 支錯誤裡，選中的都是
            #   trr≈2.0，而正確答案是 trr 3.2–4.4 的候選 —— 排第一順位
            #   反而壓過共識，計次從 33/40 掉到 32/40。
            #   現在只在同一個共識群內當排序條件，不跨群。
            best = sorted(top_g, key=lambda g: (0 if g["ok"] else 1,
                                                g["dev"],
                                                round(g["trr_dev"], 1),
                                                g["cv"],
                                                -(g["vis"] if np.isfinite(g["vis"]) else 0)))[0]
            try:
                print(f"[segment_auto] 計次共識：{len(_scored)} 條候選 → "
                      f"{len(top_g)} 條同意「{top_n} 下」"
                      f"（其中 {indep} 條依賴不同關節；次大群 {runner} 條）"
                      f" → 代表訊號「{best['name']}」"
                      f"（可見度 {best['vis']:.2f}、{best['ratio'] or 1:.2f}× 模板、CV {best['cv']:.2f}）"
                      f" 信心度：{'高' if confident else '低 ⚠️'}")
                for k, gs in ranked[1:3]:
                    print(f"[segment_auto]    不同意：{len(gs)} 條說 {k} 下"
                          f"（{', '.join(g['name'] for g in gs[:3])}）")
            except Exception:
                pass
            # 【v7】把**所有候選**的結果記下來。目前只存被選中的那一條，
            #   所以無法回答「換一條訊號會不會比較好」「某個機位是不是
            #   該用專屬規則」——那需要看同一支影片下每條候選各自的表現。
            _cand_report = [dict(name=g["name"], n=g["n"], vis=round(float(g["vis"]), 3)
                                 if np.isfinite(g["vis"]) else None,
                                 trr=round(g["trr"], 2), cv=round(g["cv"], 3),
                                 ratio=round(g["ratio"], 3) if g["ratio"] else None,
                                 ok=bool(g["ok"]), chosen=(g is best))
                            for g in sorted(_scored, key=lambda x: x["trr_dev"])]
            if confident:
                for r in best["reps"]:
                    r["count_confidence"] = "high"
                    r["count_consensus"] = f"{len(top_g)}/{len(_pool)}"
                    r["candidate_report"] = _cand_report
                return best["reps"], f"counting:{best['name']}", False
            # 信心不足也要把資訊帶下去，讓評分端可以標「這支的次數不可信」
            if best["ok"]:
                for r in best["reps"]:
                    r["count_confidence"] = "low"
                    r["count_consensus"] = f"{len(top_g)}/{len(_pool)}"
                    r["candidate_report"] = _cand_report
                return best["reps"], f"counting:{best['name']}", False

    # 舊的單一訊號路徑（候選機制拿不到東西時的保險）
    if landmarks is not None:
        _cs, _cs_zh = measurability.counting_signal(landmarks, ex_key, view)
        if _cs is not None and len(_cs) == len(features_data):
            _reps = segment_repetitions(features_data, fps, signal_col=0,
                                        min_rep_sec=min_rep_sec, prominence=prom,
                                        invert=False, signal_override=_cs)
            # 【v6.4】計次訊號不能無條件勝出。
            #   舊版只要切出 >= min_reps_target（預設 2）就直接 return，
            #   等於**完全跳過**「沿用模板切割欄」那段（v5.7 加的）。
            #   後果：臥推自選機位的雙肘間距一個 rep 走兩個週期，
            #   5 下切成 10 下，而且每一下都很規律，看起來毫無問題。
            #   加上模板的 rep 長度驗收才擋得住 —— 見 _rep_len_ok()。
            _ok, _ratio = _rep_len_ok(_reps, expected_rep_len)
            if len(_reps) >= min_reps_target and _ok:
                try:
                    print(f"[segment_auto] 用機位專屬計次訊號「{_cs_zh}」→ 切出 {len(_reps)} 下"
                          + (f"（一下 {_ratio:.2f}× 模板長度）" if _ratio else ""))
                except Exception:
                    pass
                return _reps, f"counting:{_cs_zh}", False
            if not _ok:
                try:
                    print(f"[segment_auto] ⚠️ 計次訊號「{_cs_zh}」切出 {len(_reps)} 下，"
                          f"但一下只有模板的 {_ratio:.2f} 倍長 —— "
                          f"{'疑似一個 rep 走了兩個週期' if _ratio < 1 else '疑似漏切'}，"
                          f"改用其他欄位。")
                except Exception:
                    pass

    # ── 【v5.7】改成「先評估訊號品質再選欄」，不再是「切最多 rep 的贏」──────
    #
    # 舊做法有兩個致命問題，2026-07-28 的 28 支資料同時暴露：
    #
    #  ① 主訊號寫死用某一欄，但**正側面拍攝時遠側肢體是被擋住的**，
    #     MediaPipe 會腦補成一條幾乎不動的常數線。實測深蹲正側面的
    #     R Knee 動態範圍是 **0°**（完全平），臥推正側面的雙肘平均
    #     也被遠側幻覺污染。
    #
    #  ② 備援用「切出最多 rep」當標準 —— 這正好挑中雜訊最多的欄，
    #     因為雜訊越多、假 peak 越多、切出來的 rep 就越多。實測臥推
    #     正側面因此選到 Elbow Flare（範圍 −1°～45°，根本不是週期訊號），
    #     結果 5 下被切成 2 下。
    #
    # ⚠️ v5.7 第一版用「動態範圍 ÷ 逐幀抖動」跨欄比，那是**錯的**：不同欄的單位
    #    不一樣（膝角是度、Hip Depth 是無單位比值、Stability 是變異數），比值再怎麼
    #    算都不可跨欄比較。結果選到 Hip Depth／Stability 這種很平滑、SNR 看起來
    #    超高但根本不是週期波形的欄 —— 實測主訊號幅度只有 0.0–0.5，深蹲分數
    #    直接崩到 0.0～22.5。
    #
    # 正確做法用兩把尺，都不跨欄比大小：
    #   ① 這一欄「可不可信」→ measurability.check_signal_health()，
    #      用的是各指標自己的解剖學絕對門檻（膝角至少要動 22°、握距要落在
    #      0.9–2.4 倍肩寬…），本來就是為這件事寫的。
    #   ② 在可信的欄之中「誰切得好」→ 切出來的 rep 長度變異係數（CV）。
    #      這是無量綱的，而且直接反映切割品質：真的週期訊號每下長度相近，
    #      雜訊欄會切出長短不一的假 rep。


    def _col_signal(col):
        if col == "avg_elbow" and features_data.shape[1] >= 2:
            return (features_data[:, 0] + features_data[:, 1]) / 2.0
        try:
            return features_data[:, col]
        except Exception:
            return None

    # 【v6.4】計次也要看可見度。
    #   舊版 _healthy() 只查 check_signal_health（ROM 與合理區間），完全沒看
    #   關節到底有沒有被拍到。但 MediaPipe 對被擋住的肢體**不是留白，而是腦補**
    #   一條動作合理的假訊號 —— ROM 看起來很正常，順利通過健康檢查。
    #   實測 2026-07-31：臥推正側面有兩支拿**可見度 0.15 / 0.17** 的欄位去計次，
    #   5 下都數成 4 下。那條訊號整條都是幻覺，切出什麼都不奇怪。
    # 這一段是給「特徵欄」用的（features_data 的 7 欄），所以要用 metric_vis，
    # 與上面候選訊號用的 joint_confs 是兩套不同的索引，不能混。
    _vis_mean = None
    if metric_vis is not None:
        try:
            _v = np.asarray(metric_vis, dtype=float)
            _vis_mean = np.nanmean(_v, axis=0) if _v.ndim == 2 else _v
        except Exception:
            _vis_mean = None

    def _visible(col):
        if _vis_mean is None or not isinstance(col, (int, np.integer)):
            return True                      # 沒有可見度資料就不擋
        if not (0 <= int(col) < len(_vis_mean)):
            return True
        v = float(_vis_mean[int(col)])
        return (not np.isfinite(v)) or v >= vis_min

    def _healthy(col):
        """這一欄能不能拿來計次 —— 可見度 + 解剖學絕對門檻，不跨欄比。"""
        if not _visible(col):
            try:
                _lab = ml[col] if isinstance(col, int) and col < len(ml) else str(col)
                print(f"[segment_auto] 欄位 {_lab} 可見度 "
                      f"{float(_vis_mean[int(col)]):.2f} < {vis_min} → 不拿來計次"
                      f"（這條多半是 MediaPipe 對遮擋肢體腦補出來的）")
            except Exception:
                pass
            return False
        try:
            if isinstance(col, str):        # avg_elbow：兩側都要健康
                if not all(measurability.check_signal_health(ex_key, ml[i], features_data[:, i])[0]
                           for i in (0, 1) if i < len(ml)):
                    return False
                # ⚠️ 還要檢查「兩側是否平衡」。整段的活動範圍可能因為起槓/放槓
                #   而看起來很大、通過解剖學門檻，但真正做動作時遠側其實是被
                #   擋住的幻覺。實測臥推正側面 L Elbow 在單個 rep 內只動 6.7°、
                #   R Elbow 動 40°+，平均起來訊號被腰斬 → 5 下被切成 2 下。
                #   兩側活動範圍差一倍以上，就不能用平均，要退回看得到的那側。
                r0 = float(np.nanmax(features_data[:, 0]) - np.nanmin(features_data[:, 0]))
                r1 = float(np.nanmax(features_data[:, 1]) - np.nanmin(features_data[:, 1]))
                if max(r0, r1) > 0 and min(r0, r1) < max(r0, r1) * 0.5:
                    return False
                return True
            if not (0 <= col < len(ml)):
                return False
            return measurability.check_signal_health(ex_key, ml[col], features_data[:, col])[0]
        except Exception:
            return True                      # 沒有門檻資料就不擋

    def _len_cv(reps):
        """rep 長度的變異係數：越小代表切得越規律。無量綱，可跨欄比。"""
        if len(reps) < 2:
            return 9.9
        L = np.array([r["end_frame"] - r["start_frame"] for r in reps], dtype=float)
        m = float(L.mean())
        return float(L.std() / m) if m > 0 else 9.9

    n_cols = features_data.shape[1] if features_data.ndim == 2 else 0

    # ── 【v5.8】"auto_bilateral"：左右成對的主訊號，自動選「看得到的那一側」──
    #   臥推正側面拍，一定有一隻手被另一隻擋住 —— 這是幾何事實，不是參數問題。
    #   用雙手平均（avg_elbow）當主訊號，等於把一條真訊號和一條幻覺訊號相加，
    #   振幅直接被腰斬（實測 5 下切成 2 下）。深蹲正側面的遠側腿同理。
    #   所以成對指標的預設不該是「平均」，而是「挑健康的那側；都健康時挑
    #   活動範圍大的那側」——正側面會自動挑近側，正面/俯視兩側都好時挑誰都對。
    def _resolve_bilateral(p):
        if p != "auto_bilateral":
            return p
        pairs = cfg.get("bilateral_pairs") or []
        if not pairs:
            return 0
        try:
            ia, ib = ml.index(pairs[0][0]), ml.index(pairs[0][1])
        except (ValueError, AttributeError):
            return 0
        ha, hb = _healthy(ia), _healthy(ib)
        if ha != hb:
            return ia if ha else ib
        ra = float(np.nanmax(features_data[:, ia]) - np.nanmin(features_data[:, ia]))
        rb = float(np.nanmax(features_data[:, ib]) - np.nanmin(features_data[:, ib]))
        return ia if ra >= rb else ib

    if primary == "auto_bilateral":
        primary = _resolve_bilateral(primary)
        try:
            print(f"[segment_auto] 成對主訊號 → 自動選 {ml[primary]}"
                  f"（活動範圍較大／可信的那一側）")
        except Exception:
            pass

    # ① 主訊號健康就優先用它 —— 不要沒事亂換欄
    best, best_col, best_inv = [], primary, inv0
    if _healthy(primary):
        best = segment_repetitions(features_data, fps, signal_col=primary,
                                   min_rep_sec=min_rep_sec, prominence=prom, invert=inv0)
        # 主訊號同樣要過模板 rep 長度驗收，否則只是把「切成兩倍」的問題往後推
        _ok2, _r2 = _rep_len_ok(best, expected_rep_len)
        if len(best) >= min_reps_target and _ok2:
            return best, best_col, best_inv
        if not _ok2:
            try:
                print(f"[segment_auto] ⚠️ 主訊號切出的一下只有模板的 {_r2:.2f} 倍長 → 繼續找其他欄")
            except Exception:
                pass
            best = []
    else:
        try:
            _sig = _col_signal(primary)
            _lab = ml[primary] if isinstance(primary, int) and primary < len(ml) else str(primary)
            _ok, _why = (False, "") if _sig is None else measurability.check_signal_health(ex_key, _lab, _sig)
            print(f"[segment_auto] 主訊號 {_lab} 不可信（{_why}）→ 改掃描其他欄。"
                  f"多半是這個機位看不到該側肢體。")
        except Exception:
            pass

    # ② 換欄要「換同類」：主訊號是右膝角壞掉，合理的替代是左膝角，
    #    不是 Hip Depth 這種完全不同物理量的比值欄。後者雖然也隨動作週期
    #    起伏、CV 甚至更低，但它的尺度與模板訓練時的主訊號完全不同，
    #    換過去等於用另一套座標在切 rep。
    #    優先順序：bilateral pair 的另一側 → 其他健康欄。
    prefer = []
    for pair in cfg.get("bilateral_pairs", []):
        try:
            ia, ib = ml.index(pair[0]), ml.index(pair[1])
        except (ValueError, AttributeError):
            continue
        if primary == ia:
            prefer.append(ib)
        elif primary == ib:
            prefer.append(ia)
        elif isinstance(primary, str) and primary == "avg_elbow" and {ia, ib} & {0, 1}:
            prefer.extend([ia, ib])       # 雙肘平均壞掉 → 退回單側肘角
    for col in prefer:
        if not _healthy(col):
            continue
        cand = segment_repetitions(features_data, fps, signal_col=col,
                                   min_rep_sec=min_rep_sec, prominence=prom, invert=inv0)
        _okc, _rc = _rep_len_ok(cand, expected_rep_len)
        if len(cand) >= min_reps_target and _okc:
            try:
                print(f"[segment_auto] 改用同類欄 {ml[col]}（切出 {len(cand)} 下）")
            except Exception:
                pass
            return cand, col, inv0

    # ③ 同類欄也不行才全欄掃描，取切得最規律的。
    #    ⚠️ 不能用「切出最多 rep 的贏」——那等於獎勵雜訊最多的欄。
    #    【v6.4】排序再加一層：**先看 rep 長度合不合模板**，再看規律度。
    #      只看規律度（CV）分不出「切得很規律」與「切得很規律但每下都是半個」——
    #      實測臥推自選機位切出 30 幀的半 rep，CV 只有 0.10，比正確答案還漂亮。
    cands = []
    for col in range(n_cols):
        if not _healthy(col):          # 已含可見度檢查
            continue
        for inv in (False, True):
            if col == primary and inv == inv0:
                continue
            cand = segment_repetitions(features_data, fps, signal_col=col,
                                       min_rep_sec=min_rep_sec, prominence=prom,
                                       invert=inv)
            if len(cand) >= min_reps_target:
                _okc, _rc = _rep_len_ok(cand, expected_rep_len)
                # 主鍵：長度是否合模板（合的排前面）；次鍵：離 1.0 多遠；再來才是 CV
                _dev = abs((_rc or 1.0) - 1.0)
                cands.append((0 if _okc else 1, _dev, _len_cv(cand), -len(cand), cand, col, inv))
    if cands:
        cands.sort(key=lambda t: t[:4])
        best, best_col, best_inv = cands[0][4], cands[0][5], cands[0][6]
        try:
            _lab = ml[best_col] if isinstance(best_col, int) and best_col < len(ml) else str(best_col)
            print(f"[segment_auto] 改用 {_lab}（rep 長度 {1 + cands[0][1]:.2f}× 模板、"
                  f"CV={cands[0][2]:.2f}，切出 {len(best)} 下）")
        except Exception:
            pass
    return best, best_col, best_inv


# ─── 教練骨架軌跡（給 AR 疊合回放的可拖移黃金骨架用）──────────────────────
def pose_rep_slice(landmarks, rep):
    """單一 rep 的 2D 骨架切片 → (con_frames, ecc_frames)；landmarks (N,33,>=2)。"""
    try:
        s, e = int(rep["start_frame"]), int(rep["end_frame"])
        v = len(rep.get("phase1", []))
        seg = np.asarray(landmarks[s:e], dtype=float)
        if seg.ndim != 3 or seg.shape[0] < 2:
            return None
        seg = seg[:, :, :2]                      # 只取 2D x,y（正規化 0–1）
        con = seg[:v] if v > 0 else seg[:1]
        ecc = seg[v:] if v < seg.shape[0] else seg[-1:]
        if con.shape[0] < 1 or ecc.shape[0] < 1:
            return None
        return con, ecc
    except Exception:
        return None


def build_pose_trajectory(rep_slices, mc, me):
    """多個 (con,ecc) 骨架切片各自重採樣到 (mc,me) 後跨 rep 平均 → (mc+me,33,2)。"""
    seqs = []
    for sl in rep_slices:
        if not sl:
            continue
        con, ecc = sl
        try:
            c = resample_to_length(con.reshape(con.shape[0], -1), mc).reshape(mc, -1, 2)
            e = resample_to_length(ecc.reshape(ecc.shape[0], -1), me).reshape(me, -1, 2)
            seqs.append(np.vstack((c, e)))
        except Exception:
            continue
    if not seqs:
        return None
    return np.nanmean(np.array(seqs, dtype=float), axis=0)   # (L,33,2)


# 各機位「該畫哪些骨架點」——只畫實驗上量得到的點位，不硬畫遠側肢體
_POSE_DRAW = {
    'squat': {'frontal_0': [11, 12, 23, 24, 25, 26, 27, 28],
              'oblique_45': [11, 12, 23, 24, 25, 26, 27, 28],
              'sagittal_90_left': [11, 23, 25, 27], 'sagittal_90_right': [12, 24, 26, 28]},
    'bench_press': {'overhead': [11, 12, 13, 14, 15, 16],
                    'oblique_45': [11, 12, 13, 14, 15, 16],
                    'sagittal_90_left': [11, 13, 15], 'sagittal_90_right': [12, 14, 16]},
}


def pose_draw_indices(exercise_key, resolved_view, occluded_side=None):
    """回傳這個機位要畫的 landmark 索引；正側面只畫可見側。"""
    m = _POSE_DRAW.get(exercise_key, {})
    if resolved_view == 'sagittal_90':
        side = 'left' if occluded_side == 'right' else 'right'   # 遮擋右 → 畫左
        return m.get(f'sagittal_90_{side}', [11, 12, 23, 24, 25, 26, 27, 28])
    return m.get(resolved_view, [11, 12, 23, 24, 25, 26, 27, 28])


# 左右成對的 landmark（用來比較兩側活動範圍）
_CONTRA = {11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15,
           23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27}


def refine_draw_indices(pose_seq, base_idx, rom_ratio=0.35):
    """【資料驅動】用教練骨架軌跡的**實際活動範圍**再篩一次要畫的點位。

    為什麼需要：被遮擋的遠側肢體，MediaPipe 仍會輸出「看似合理但幾乎不動」的
    腦補座標（實測遠側 visibility 可達 0.84，活動範圍卻只有近側的一小部分）。
    只靠可見度或寫死的先驗表會漏判，於是把它畫出來 —— 使用者就看到一條
    根本沒被觀測到的假肢體。這裡直接比較左右同名點的軌跡動態範圍，
    明顯偏小的那一側視為未被實際觀測，從畫點集移除。

    pose_seq: (L,33,2)；base_idx: 先驗表給的候選點位
    回傳：實際可畫的點位（一定是 base_idx 的子集）
    """
    try:
        P = np.asarray(pose_seq, dtype=float)
        if P.ndim != 3 or P.shape[0] < 3:
            return list(base_idx)
        # 每個點位的軌跡動態範圍（x、y 取較大者，對相機朝向較不敏感）
        rng = np.nanmax(P, axis=0) - np.nanmin(P, axis=0)      # (33,2)
        amp = np.nanmax(rng, axis=1)                            # (33,)
        keep = []
        for i in base_idx:
            j = _CONTRA.get(int(i))
            a = amp[int(i)] if int(i) < len(amp) else np.nan
            if not np.isfinite(a):
                continue
            # 有對側可比 → 活動範圍明顯小於對側者判為腦補，不畫
            if j is not None and j < len(amp) and np.isfinite(amp[j]) and amp[j] > 1e-6:
                if a < amp[j] * rom_ratio:
                    continue
            keep.append(int(i))
        return keep if len(keep) >= 2 else list(base_idx)
    except Exception:
        return list(base_idx)


# ─── Golden template (DBA) ───────────────────────────────────────────────────

def create_golden_template(all_rep_info_list, metric_directions=None, metric_labels=None,
                           cfg_for_phase=None):
    if not all_rep_info_list:
        raise Exception("Template building failed: empty rep list.")
    c_lens = [len(r["phase1"]) for r in all_rep_info_list if len(r["phase1"]) > 0]
    e_lens = [len(r["phase2"]) for r in all_rep_info_list if len(r["phase2"]) > 0]
    if not c_lens or not e_lens:
        raise Exception("Template building failed: empty phase segments.")
    mc, me = int(np.median(c_lens)), int(np.median(e_lens))
    all_reps = []
    for r in all_rep_info_list:
        p1 = resample_to_length(r["phase1"], mc)
        p2 = resample_to_length(r["phase2"], me)
        full = np.vstack((p1, p2))
        full = fill_nan_numpy(full)
        all_reps.append(full)
    if not all_reps:
        raise Exception("Template building failed: all reps invalid.")
    stack = np.array(all_reps)              # (n_reps, L, n_metrics)
    if dtw_barycenter_averaging is None:
        # Fallback: simple mean
        template = np.mean(stack, axis=0)
    else:
        template = dtw_barycenter_averaging(stack, max_iter=10)

    # ── 【v5.0】模板自身的 rep 間變異（每個指標一個純量）────────────────────
    # 為什麼要存這個：2026-07-27 實測發現黃金模板自己的 rep 間平均絕對差
    # 就有 5–15°（深蹲主訊號 mean+2SD ≈ 10.7°、臥推 ≈ 14.1°），而使用者
    # 各組的 raw_loss 也落在 5–12° —— 也就是**組間差異整個埋在模板自身的
    # 雜訊底下**，再怎麼調評分曲線都不可能顯著。
    #
    # 解法是把「偏離多少算多」交給資料決定，而不是繼續手調 scoring_scales
    # 那組魔術數字（1 / 150 / 10000 …）。教練自己重複同一個動作會有的
    # 變異量 = 1 個單位，使用者偏離 1 個單位以內視為「跟教練做得一樣」。
    # 這也讓不同量綱的指標（度數 / 比值 / 變異數）自動可比。
    #
    # 用 MAD×1.4826 而不是 SD：rep 數只有 10–12，一下離群就會把 SD 撐大。
    # 【v5.1 修正】v5.0 這裡算錯了一個關鍵的東西，2026-07-27 第二次重跑才抓出來。
    #
    #   v5.0 存的是 MAD(每個 rep 的偏差) × 1.4826 —— 那是「教練的偏差本身有多不穩定」，
    #   不是「教練通常偏差多少」。兩者差了 4–5 倍。結果就是拿一個過小的分母去除，
    #   z 值全面爆炸：有經驗者做正確動作，7 個指標裡有 5 個 z > 3（被判定成
    #   「明顯做錯」），標準組總分掉到 46–66 分。專家自己不可能是明顯做錯。
    #
    #   正確的錨點是「教練自己的 rep 平均偏離模板多少」= median(per_rep)。
    #   使用者偏離到這個量 → z = 0 → 滿分（你跟教練做得一樣好）。
    #   再往外，用 MAD 當刻度：每多一個 MAD 就是多偏一級。
    #
    #       z = max(0, (使用者偏差 − 教練典型偏差) / 教練偏差的 MAD)
    #
    #   ⚠️ 分子分母必須用**同一種偏差定義**。計分時對 lower_better /
    #      higher_better 的指標會先 clip 掉「往好的方向」那一半，所以這裡
    #      建立基線時也要套同一個方向規則，否則使用者是半邊、教練是雙邊，
    #      分母被高估、所有人都白賺分數。
    n_metrics = stack.shape[2]
    tpl_dev_med = np.zeros(n_metrics, dtype=float)
    tpl_dev_mad = np.zeros(n_metrics, dtype=float)
    dirs = (metric_directions or {})
    labels = list(metric_labels or [])
    # 【v5.2】建立基線時必須套用跟計分端同一組底部加權核，
    #   否則分子加權、分母不加權，z 值會整體偏移。
    _pw = (phase_weights(template, cfg_for_phase)
           if cfg_for_phase is not None else np.ones(template.shape[0]) / template.shape[0])
    _ex_for_extremum = (cfg_for_phase or {}).get("_key") or \
                       (cfg_for_phase or {}).get("exercise_key") or ""
    _extremum_set = EXTREMUM_METRICS.get(_ex_for_extremum, ())
    # 【v7】每個 rep 來自哪一支建模影片 —— 尺規要用「跨影片」變異
    _src = [r.get("source_video") for r in all_rep_info_list]
    _has_src = len([s for s in set(_src) if s is not None]) >= 2
    _per_video_dev = {}          # 【v8】{metric_idx: {影片: 該影片的平均帶符號偏差}}
    _mad_within = np.zeros(n_metrics, dtype=float)   # 【v8.3】只含 rep 間變異的刻度

    # ══ 【v8.8】量測值空間的基線 —— 取代「差值空間」════════════════════════
    #
    #  為什麼要換掉差值空間（這是評分層最根本的缺陷）
    #  ────────────────────────────────────────────
    #  舊做法先算「使用者曲線 − 模板曲線」得到偏差，再用偏差的中位數與 MAD
    #  當錨點和刻度。問題是：**兩個相近的大數相減，相對誤差會被放大**。
    #
    #  實測（4 支同一人的深蹲自選機位影片，原始骨架直接量）：
    #      軀幹角度本身      15.1  14.5  12.9  14.2      CV = 0.065  ← 很穩
    #      減掉模板 14.3° 後  0.76  0.17  1.43  0.17      CV = 0.955  ← 放大 15 倍
    #
    #  角度量得再準都沒用，因為評分吃的是差值。而分母又是「差值的變異」，
    #  等於用一個不穩的量去除以另一個更不穩的量 —— 於是：
    #      · 45% 的指標拿滿分、只有 22% 落在 20–80 的有意義區間
    #      · 標準動作被判「明顯做錯」的比例 17%，刻意做錯 29%，幾乎分不開
    #      · Hip Depth 量測 CV 0.24（很穩）→ 分數 CV 0.91 → 被信度關卡剔除
    #
    #  還有一個獨立的錯誤：`both` 方向用 np.abs(diff)，所以**比模板做得更好
    #  也會被扣分**。留一驗證抓到：蹲得最直的那支（12.9°，四支裡最標準）
    #  舊公式只給 48 分。
    #
    #  新做法：直接在量測值空間比。
    #      z = 方向修正( 使用者量測值 − 教練量測值中位數 ) / 教練量測值的 MAD
    #  只減一次，而且分母是「教練原始量測值的離散度」——
    #  那是穩定、可解釋、有物理量綱的量（「教練自己做兩次會差幾度」）。
    #
    #  留一驗證（同樣那 4 支）：標準組分數全距 52 分 → 23 分，
    #  而且做得比教練更標準的那支從 48 分回到 100 分。
    tpl_val_med = np.zeros(n_metrics, dtype=float)
    tpl_val_mad = np.zeros(n_metrics, dtype=float)
    _val_by_video = {}           # {metric_idx: {影片: 該影片的代表量測值}}

    for i in range(n_metrics):
        _dir = dirs.get(labels[i], "both") if i < len(labels) else "both"
        if i < len(labels) and labels[i] in _extremum_set:
            # 【v7】幅度類：與 score_rep 用同一套量綱（比極值），
            #   否則分子比極值、分母比逐點，z 完全沒有意義。
            per_rep = np.array([_metric_deviation_extremum(stack[k, :, i], template[:, i], _dir)
                                for k in range(stack.shape[0])], dtype=float)
        else:
            diff = stack[:, :, i] - template[:, i]              # (n_reps, L) 帶符號
            if _dir == "lower_better":
                dev = np.clip(diff, 0, None)
            elif _dir == "higher_better":
                dev = np.clip(-diff, 0, None)
            else:
                dev = np.abs(diff)
            # 【v5.2】底部加權，與 score_rep 一致
            per_rep = np.array([weighted_nanmean(dev[k], _pw) for k in range(dev.shape[0])])
        med = float(np.nanmedian(per_rep)) if np.isfinite(per_rep).any() else 0.0
        mad = float(np.nanmedian(np.abs(per_rep - med))) if np.isfinite(per_rep).any() else 0.0
        mad *= 1.4826
        if mad <= 1e-9:
            mad = float(np.nanstd(per_rep)) if np.isfinite(np.nanstd(per_rep)) else 0.0

        # ── 【v7】尺規改用「跨影片」變異 ──────────────────────────────────
        #   上面的 mad 是所有 rep 混在一起算的，主要反映「同一支影片內
        #   連續 rep 之間」的差異 —— 同一次、同一機位、同一組，變異極小
        #   （實測 MAD 只有 1.1–2.3）。
        #   但受測單位是**一支新影片**，它與建模之間還多了「重新架機位、
        #   重新暖身、不同組」的變異。拿 rep 間變異當尺規去衡量影片間差異，
        #   分母系統性偏小 → 同一個人做同樣的動作換支影片就掉 40 分。
        #   實測：臥推自選 |z| 中位 5.65 → 38.5 分，正側面 |z| 0.35 → 82.8 分。
        #
        #   正確的尺規是「同一個人把同一個動作做對兩次，可以差多少」，
        #   也就是建模影片**彼此之間**的差異。
        #   只有 2 支建模影片時這個估計很粗，所以取兩者較大者當下限保護。
        #   ⚠️ 這裡必須用**帶符號**的偏差，不能用 per_rep。
        #      per_rep 已經過 clip/abs（方向規則），兩支影片一支偏 −3°、
        #      一支偏 +3° 時，取絕對值後都變成 3 → 平均相同 →
        #      跨影片變異算出來是 0，這道保護完全失效。
        #      （自我測試就是這樣抓到的：兩支建模差 3°，尺規反而變小。）
        if _has_src:
            if i < len(labels) and labels[i] in _extremum_set:
                _signed = np.array([
                    (np.nanmax(np.abs(stack[k, :, i])) - np.nanmax(np.abs(template[:, i])))
                    if _dir == 'both' else
                    (np.nanmax(stack[k, :, i]) - np.nanmax(template[:, i]))
                    for k in range(stack.shape[0])], dtype=float)
            else:
                _signed = np.array([weighted_nanmean(stack[k, :, i] - template[:, i], _pw)
                                    for k in range(stack.shape[0])], dtype=float)
            _by_vid = {}
            for k, sv in enumerate(_src):
                if sv is not None and np.isfinite(_signed[k]):
                    _by_vid.setdefault(sv, []).append(_signed[k])
            _vid_means = [float(np.mean(v)) for v in _by_vid.values() if v]
            # 【v8】留下「每支影片各自的偏差」供下面算重測信度 CV
            _per_video_dev[i] = {sv: float(np.mean(v)) for sv, v in _by_vid.items() if v}
            # 【v8.3】把「還沒被跨影片變異撐大」的刻度另外留一份。
            #   下面算重測信度 CV 必須用這一份，否則是循環的：
            #   mad 已經取了跨影片變異當下限 → 拿建模影片自己回頭算，
            #   變異早就被刻度吸收，z 永遠很小、CV 永遠 ≈ 0，這道關卡等於沒有。
            #   （自我測試抓到：刻意讓兩支建模差一倍深度，CV 仍是 0.04。）
            _mad_within[i] = mad
            if len(_vid_means) >= 2:
                _between = float(np.std(_vid_means, ddof=1))
                if np.isfinite(_between):
                    mad = max(mad, _between)

        # 地板：死訊號（Stability、Bar Path 這種量級 1e-6 的欄位）會讓 med/mad
        #   都趨近 0，z 直接爆成無限大。用模板自身動態範圍的比例撐住下限。
        tpl_range = float(np.nanmax(template[:, i]) - np.nanmin(template[:, i]))
        tpl_dev_med[i] = max(med, tpl_range * 0.02, 1e-9)
        # MAD 至少要是典型偏差的 25%，否則刻度太細、一點點差異就掉好幾十分
        tpl_dev_mad[i] = max(mad, tpl_dev_med[i] * 0.25, tpl_range * 0.02, 1e-9)

        # ── 【v8.8】量測值空間的錨點與刻度 ─────────────────────────────
        #   每個 rep 先化約成一個代表值（與 score_rep 用同一套規則），
        #   再逐影片取中位數 → 得到「每支影片的量測值」，
        #   最後跨影片取中位數與 MAD。
        if i < len(labels) and labels[i] in _extremum_set:
            # 幅度類：代表值是極值，不是逐點平均（要與 score_rep 同量綱）
            _rep_vals = np.array([
                (np.nanmax(np.abs(stack[k, :, i])) if _dir == 'both'
                 else np.nanmax(stack[k, :, i]))
                for k in range(stack.shape[0])], dtype=float)
        else:
            _rep_vals = np.array([weighted_nanmean(stack[k, :, i], _pw)
                                  for k in range(stack.shape[0])], dtype=float)
        _vv = {}
        for k, sv in enumerate(_src):
            if np.isfinite(_rep_vals[k]):
                _vv.setdefault(sv if sv is not None else "_", []).append(float(_rep_vals[k]))
        _val_by_video[i] = {sv: float(np.median(v)) for sv, v in _vv.items() if v}
        _per_vid_vals = list(_val_by_video[i].values())

        _vmed = float(np.nanmedian(_rep_vals)) if np.isfinite(_rep_vals).any() else 0.0
        # 刻度取三者最大，理由各自不同：
        #   ① 跨影片 MAD —— 我們真正想量的東西（「同一個人兩次會差多少」），
        #      但 n=2~5 時估計不穩，所以只當候選之一
        #   ② 片內 rep 間 MAD —— 樣本數是 rep 數（10 幾個），估得很穩，
        #      而且它是「這個量的重複性」的下限：跨影片不可能比片內還穩
        #   ③ 模板動態範圍的 2% —— 防死訊號（量級 1e-6 的欄位）除零
        _mad_between_val = 0.0
        if len(_per_vid_vals) >= 2:
            _m = float(np.median(_per_vid_vals))
            _mad_between_val = float(np.median(np.abs(np.array(_per_vid_vals) - _m)) * 1.4826)
            if _mad_between_val <= 1e-9:      # n=2 時 MAD 恆為 0，退回半距
                _mad_between_val = float(np.ptp(_per_vid_vals) / 2.0)
        _mad_within_val = float(np.nanmedian(np.abs(_rep_vals - _vmed)) * 1.4826) \
            if np.isfinite(_rep_vals).any() else 0.0
        tpl_val_med[i] = _vmed
        tpl_val_mad[i] = max(_mad_between_val, _mad_within_val, tpl_range * 0.02, 1e-9)

    # ══ 【v8】重測信度：同一機位重複拍標準動作，這個指標的分數穩不穩 ══════
    #   為什麼一定要算：可測性（看得到）與信度（量得準）是兩件事。
    #   深蹲正側面的 Hip Depth 可見度 0.91、ROM 正常、權重最重（0.32），
    #   但 5 支標準影片的子分數是 100/99/100/36/31 —— 拿它評分等於擲骰子。
    #
    #   做法：把每支建模影片各自的偏差，走一次跟 score_rep 相同的
    #   「偏差 → z → 分數曲線」，再算跨影片的 CV = SD/mean。
    #
    #   ⚠️ 2 支只有 1 個自由度，估出來的 CV 不足以「確認穩定」，
    #      但足以「否決明顯不穩」（單尾）。所以照算，由
    #      measurability.reliable_metrics 依 n_videos 決定怎麼用：
    #        ≥3 支 → 直接採信          2 支 → 只用來否決
    #      實測驗證：表為主 + 2 支否決 = 99% 判定正確率（只查表 90%）。
    metric_cv = np.full(n_metrics, np.nan, dtype=float)
    _n_vid = len({s for s in _src if s is not None})
    if _n_vid >= 2:
        for i in range(n_metrics):
            devs = _per_video_dev.get(i) or {}
            if len(devs) < 2:
                continue
            _dir = dirs.get(labels[i], "both") if i < len(labels) else "both"
            scores = []
            for _v in devs.values():
                if _dir == "lower_better":
                    dv = max(_v, 0.0)
                elif _dir == "higher_better":
                    dv = max(-_v, 0.0)
                else:
                    dv = abs(_v)
                # ⚠️ 分母用 _mad_within（只含 rep 間變異），不是 tpl_dev_mad。
                #   tpl_dev_mad 已經把跨影片變異吃進去了，用它算等於自己驗證自己。
                _scale = max(_mad_within[i], tpl_dev_med[i] * 0.25, 1e-9)
                z = max(0.0, (dv - tpl_dev_med[i]) / _scale)
                scores.append(_piecewise_score(_z_score(z)))
            m = float(np.mean(scores))
            if m > 1e-6 and len(scores) >= 2:
                # n=2 時 std(ddof=1) = |a−b|/√2，正是離線驗證用的估計量
                metric_cv[i] = float(np.std(scores, ddof=1) / m)
        try:
            _shown = {labels[i]: round(float(metric_cv[i]), 3)
                      for i in range(min(n_metrics, len(labels)))
                      if np.isfinite(metric_cv[i])}
            _use = ("直接採信" if _n_vid >= measurability.RELIABILITY_TRUST_VIDEOS
                    else f"只用來否決（CV > {measurability.RELIABILITY_VETO_CV}），其餘查驗證表")
            print(f"[template] 重測信度 CV（{_n_vid} 支建模影片實測，{_use}）：{_shown}")
        except Exception:
            pass
    else:
        try:
            print(f"[template] 建模影片只有 {_n_vid} 支，算不出跨影片變異 → 全數查驗證表")
        except Exception:
            pass

    # 【v8.8】多回傳一組 (量測值中位, 量測值 MAD)。呼叫端存進模板，
    #   score_rep 有它就走量測值空間，沒有（舊模板）就退回差值空間。
    return template, mc, me, (tpl_dev_med, tpl_dev_mad), metric_cv, (tpl_val_med, tpl_val_mad)

# ─── Scoring ─────────────────────────────────────────────────────────────────

def _piecewise_score(raw_loss):
    """v4.4 三段式評分曲線（forgiveness + gradient zone + safety floor）

    取代舊版 max(0, 100 - raw_loss) 線性扣分。
    新曲線意義：
      ① 0  ~ 10  raw_loss → 100→95  （容忍區：人不是機器，10° 內視為正確）
      ② 10 ~ 40  raw_loss → 95→70   （精修區：明顯偏差但動作仍可辨識）
      ③ 40 ~ 80  raw_loss → 70→35   （問題區：需要修正）
      ④ >80      raw_loss → 30      （地板：完全跑掉但「至少做了」，不羞辱性給 0）
    這樣可以避免「一個小指標暴衝 → 整體分數崩盤」的失真，
    也讓「動作不錯但不完美 = 80+」「動作明顯有問題 = 50-60」的分布更直覺。
    """
    # 【v4.8 收緊】舊曲線的容忍區是 0–10 只扣 5 分，實測真實資料的加權偏差
    #   大多落在 0–25，等於全部人都擠在 88–100 分、好壞完全分不開。
    #   容忍區縮到 0–4（人不是機器，但 4 單位已經夠寬），中段斜率加大。
    if raw_loss <= 4:
        return 100.0 - raw_loss * 1.0            # 100 → 96
    if raw_loss <= 20:
        return 96.0 - (raw_loss - 4) * (21.0 / 16.0)   # 96 → 75
    if raw_loss <= 50:
        return 75.0 - (raw_loss - 20) * (35.0 / 30.0)  # 75 → 40
    return max(25.0, 40.0 - (raw_loss - 50) * 0.3)     # 緩降到地板 25


def _user_value(col, tcol, pw, label, exercise_key, direction):
    """【v8.8】把使用者這一 rep 的曲線化約成**一個代表量測值**。

    必須與 create_golden_template 算 tpl_val 時用完全相同的規則，
    否則分子分母量綱不同，z 沒有意義。兩種規則：

      幅度類（EXTREMUM_METRICS）  取極值 —— 這類指標關心的是「最大到哪」
                                  （例如 Knee Valgus 的最大內夾角），
                                  逐點平均會被大量接近 0 的幀稀釋掉。
      其餘                        底部加權平均 —— 動作的對錯集中在最深點附近。

    ⚠️ 這裡回傳的是**量測值本身**，不是與模板的差。差值留給舊路徑。
    """
    try:
        a = np.asarray(col, dtype=float)
        if not np.isfinite(a).any():
            return None
        if label in EXTREMUM_METRICS.get(exercise_key or "", ()):
            return float(np.nanmax(np.abs(a)) if direction == 'both' else np.nanmax(a))
        w = np.asarray(pw, dtype=float)
        if w.shape[0] != a.shape[0]:                  # 對齊平移後長度可能不同
            w = np.ones(a.shape[0], dtype=float) / max(a.shape[0], 1)
        return float(weighted_nanmean(a, w))
    except Exception:
        return None


def _z_score(z):
    """【v5.0】以「教練自己的變異」為單位的評分曲線。

    z = 使用者偏離模板的量 ÷ 模板自身 rep 間的變異（tpl_sd）。
    也就是說：z = 1 代表「你跟教練的差距，剛好等於教練自己兩下之間的差距」。

    為什麼改成這個
    ──────────────
    舊的 _piecewise_score(raw_loss × scoring_scales[i]) 有兩個問題：
      ① scoring_scales 是手調的魔術數字（1 / 2 / 150 / 10000 / 120…），
         每次覺得「這個指標扣太少」就再乘大一點，沒有客觀依據，
         寫進論文無法解釋為什麼 Hip Depth 要乘 150 而 Torso Lean 乘 2。
      ② 它把「偏離量」跟「這個偏離量算不算大」混在一起。真正該問的是
         「這個偏離超出教練自己的重複性了嗎」，那是統計問題不是尺度問題。

    【v5.1】z 的定義改成 (使用者偏差 − 教練典型偏差) / 教練偏差的 MAD，
    所以錨點是 z = 0（不是 z = 1）：偏離量剛好等於教練自己那幾下的典型值。

    分段設計：
      z ≤ 1.0   → 100–92   跟教練自己的重複性同一級
      z ≤ 2.0   → 92–75    超出 1 MAD，開始看得出差異
      z ≤ 3.5   → 75–45    超出 2 MAD，統計上已算顯著偏離
      z > 3.5   → 45–0     明顯做錯，線性掉到 0

    地板拿掉了：舊版 max(25, …) 的 25 分地板配上 max(30, form-deductions)
    的 30 分地板，讓「完全做錯」跟「做得普通」的距離被壓縮，
    是天花板/地板效應的來源之一（實測 69 個 rep 只有 1% 低於 70 分）。
    要不要在 UI 上顯示地板是產品決定，不該寫死在計分核心裡。
    """
    z = float(z)
    if not np.isfinite(z) or z < 0:
        return np.nan
    if z <= 1.0:
        return 100.0 - z * 8.0                      # 100 → 92
    if z <= 2.0:
        return 92.0 - (z - 1.0) * 17.0              # 92 → 75
    if z <= 3.5:
        return 75.0 - (z - 2.0) * 20.0              # 75 → 45
    return max(0.0, 45.0 - (z - 3.5) * 12.0)        # 45 → 0


def phase_weights(template, cfg, emphasis=None):
    """【v5.2】底部加權：離「動作最深點」越近的幀，權重越高。

    為什麼要這樣（2026-07-27 實測驗證）
    ──────────────────────────────────
    舊版把整個週期的偏差直接 `nanmean` 平均。問題是**動作的對錯集中在底部**：
    深蹲蹲不蹲得夠深、臥推槓有沒有下到胸口、軀幹垮不垮，都發生在最深點附近；
    頂端站直／鎖死的那段，做對做錯的人長得幾乎一樣。全程平均等於拿一半
    「不含資訊的幀」去稀釋另一半「有資訊的幀」。

    實測（深蹲，標準組 vs 刻意錯，偏差量）：

        指標          全程平均 Δ    只看底部 Δ     倍率
        R Knee          11.856       24.705      2.1×
        Torso Lean       4.938        7.413      1.5×
        Hip Depth        0.087        0.239      2.7×
        Knee Sym         1.552        5.817      3.7×

    每一項的鑑別度都變成 1.5–3.7 倍。這是不用重拍、不用換公式就能拿到的改善。

    實作
    ────
    以分段主訊號（深蹲＝膝角、臥推＝肘角）的最小值定位「最深點」，
    套一個高斯核；再跟均勻權重混合（`emphasis` 比例），
    避免頂端完全不計分——鎖死不完全、站不直也還是要抓得到。

    ⚠️ 不是每個動作都該加權
    ────────────────────────
    掃描 emphasis 0→0.85 的結果（用 2026-07-27 實測資料，好壞組 Cohen's d）：

        深蹲：  0.00→8.39   0.40→9.62   0.55→9.4   0.70→9.78   0.85→9.15
        臥推：  0.00→2.05   0.40→1.70   0.70→1.56  0.85→1.41   （單調變差）

    深蹲的錯誤（蹲不夠深）**本質上就發生在底部**，加權有效；
    臥推的錯誤（肘外展、握距過窄）是**整個行程都存在**的姿勢問題，
    而且在正側面根本量不到，把注意力集中到底部只會丟掉其他幀的資訊。

    所以 emphasis 改成每個動作各自設定（cfg["phase_emphasis"]），
    預設 0.0（等同舊行為），不會讓沒調過的動作悄悄改變表現。

    ⚠️ 這些值是在 n=3 vs n=2 支影片上調出來的，**屬於過擬合風險區**。
       深蹲在 0.3–0.85 之間是一片平原（d 都 >9.1），所以取中段 0.55
       而不是取最大值 0.70。補完樣本後應該重新掃一次。

    ⚠️ 建模端算基線時必須用**同一組權重**，否則分子加權、分母不加權，
       量綱不一致，z 值會整體偏移。
    """
    if emphasis is None:
        emphasis = float(cfg.get("phase_emphasis", 0.0))
    if emphasis <= 1e-9:
        return np.ones(int(template.shape[0])) / int(template.shape[0])
    L = int(template.shape[0])
    idx = cfg.get("segment_signal_idx", 0)
    idx = idx if isinstance(idx, (int, np.integer)) else 0
    col = np.asarray(template[:, idx], dtype=float)
    if cfg.get("segment_invert"):
        col = -col
    if not np.isfinite(col).any():
        return np.ones(L) / L
    bottom = int(np.nanargmin(col))          # 最深點：膝角/肘角最小
    sigma = max(2.0, L * 0.18)
    d = np.abs(np.arange(L) - bottom)
    d = np.minimum(d, L - d)                 # 週期是循環的，取環狀距離
    k = np.exp(-0.5 * (d / sigma) ** 2)
    k = k / k.sum()
    return emphasis * k + (1.0 - emphasis) * (np.ones(L) / L)


def weighted_nanmean(values, w):
    """以 w 為權重的 nanmean —— NaN 的幀不計入，權重同步扣掉。"""
    v = np.asarray(values, dtype=float)
    m = np.isfinite(v)
    if not m.any():
        return np.nan
    tot = float(np.sum(w[m]))
    if tot <= 1e-12:
        return float(np.nanmean(v))
    return float(np.sum(v[m] * w[m]) / tot)


def _unpack_tpl_sd(tpl_sd, i):
    """把 tpl_sd 拆成 (典型偏差 med, 刻度 mad)。

    相容三種格式：
      (med_array, mad_array)  → v5.1 正式格式
      單一 array              → v5.0 舊格式，med 視為 0、該值當 mad（行為同 v5.0）
      None                    → 沒有模板變異資料，呼叫端退回舊的 scoring_scales
    """
    if tpl_sd is None:
        return None, None
    try:
        if isinstance(tpl_sd, (tuple, list)) and len(tpl_sd) == 2:
            med, mad = tpl_sd
            if i < len(med) and i < len(mad):
                return float(med[i]), float(mad[i])
            return None, None
        arr = np.asarray(tpl_sd, dtype=float)
        if arr.ndim == 2 and arr.shape[0] == 2:          # npz 存成 (2, n_metrics)
            if i < arr.shape[1]:
                return float(arr[0, i]), float(arr[1, i])
            return None, None
        if arr.ndim == 1 and i < len(arr):
            return 0.0, float(arr[i])                     # v5.0 舊格式
    except Exception:
        pass
    return None, None


# ── 【v7】幅度類指標 —— 比極值，不做逐點比對 ─────────────────────────────
#   判準：這個指標的「對錯」是不是一個純量？
#     · 蹲多深、膝蓋內夾多少、握距多寬、左右差多少 → 是純量，比極值
#     · 膝角/肘角的整條軌跡、槓的路徑形狀        → 是軌跡，要逐點比（含對齊）
#   放進這裡的指標對相位偏移完全免疫，這是最乾淨的解法；
#   軌跡類則靠 score_rep 裡的受限平移對齊處理。
#
#   ⚠️ create_golden_template 算 tpl_sd 時必須套用**同一套規則**，
#      否則分子（受測偏差）比極值、分母（模板典型偏差）比逐點，量綱不一致。
EXTREMUM_METRICS = {
    "squat": ("Hip Depth", "Knee Valgus", "Knee Sym", "Stability"),
    "deadlift": ("Knee Sym", "Stability"),
    "bench_press": ("Grip Width", "Elbow Sym", "Elbow Flare"),
    "overhead_press": ("Grip Width", "Elbow Sym"),
    "barbell_row": ("Grip Width", "Elbow Sym"),
    "lat_pulldown": ("Elbow Sym",),
}


def _metric_deviation_extremum(col, tcol, direction):
    """幅度類指標的偏差：比極值。給 score_rep 與 create_golden_template 共用，
    確保分子與分母用同一套量綱。

    ⚠️ 三種方向**都取 max**，不是「lower_better 取 min」——
       這點很容易寫反，而且寫反的話最該抓到的錯誤會完全消音：

       · lower_better（Knee Valgus）：值越小越好 → 最糟的一刻是**最大值**。
         取 min 的話會拿「站直時的膝內夾」去比，那一刻本來就不會內夾，
         受測與模板都是 2.0 → 差 0 → 膝蓋內夾完全抓不到。
         （這正是自我測試抓到的：膝內夾 +12° 卻得 97.7 分）
       · higher_better（Hip Depth）：值越大越好 → 看的是**最深那一刻**，也是 max。
       · both（Knee Sym）：偏離就是錯 → 取絕對值的 max。
    """
    if direction == 'both':
        uv, tv = np.nanmax(np.abs(col)), np.nanmax(np.abs(tcol))
    else:
        uv, tv = np.nanmax(col), np.nanmax(tcol)
    if not (np.isfinite(uv) and np.isfinite(tv)):
        return np.nan
    if direction == 'lower_better':
        return max(0.0, float(uv - tv))      # 比模板更嚴重才扣
    if direction == 'higher_better':
        return max(0.0, float(tv - uv))      # 比模板更不足才扣
    return abs(float(uv - tv))


def score_rep(user_rep, template, cfg, is_side=False, metric_visibility=None, out=None,
              view=None, tpl_sd=None, exercise_key=None, tpl_val=None):
    """v4.5 評分系統 — 形態品質主分 + 次要表現附加扣分架構

    out：可選的 dict，會被填入評分診斷（測試模式用）。為什麼需要它——
      指標若整欄 NaN 或可見度 < 0.30，權重會被歸零，最後再把剩下的權重
      重新正規化到 1.0。這在「拍不到就不扣分」的立場上是對的，但會產生
      一個很危險的假象：**刻意做錯的那個指標一旦沒被量到，錯誤就完全
      不扣分，分數反而比標準組還高**。不把「實際計入多少權重」攤開來，
      這種失真從分數上完全看不出來。
        out["final_weights"]   正規化後每個指標的實際權重
        out["measured_ratio"]  有被量到的權重佔原始主分權重的比例（1.0 = 全都量到）
        out["dropped"]         被歸零的指標名稱與原因
    """
    ws  = cfg["scoring_weights"].copy()
    scs = cfg["scoring_scales"]
    ml  = cfg["metric_labels"]
    subs = np.zeros(len(ml))

    # ── 【v5.0】機位可測性 gating ────────────────────────────────────────────
    # 舊版用 is_side(bool) + front_only_metrics。2026-07-27 實測發現前端兩個
    # 動作的 sideMode 都寫死 False → 這段邏輯 16 支影片一次都沒觸發過，
    # 「側面 vs 正面」的實驗因子等於沒有操作到。改成明確的機位代號查表。
    ex_key = exercise_key or cfg.get("_key") or cfg.get("exercise_key") or ""
    if view is None:
        view = measurability.legacy_view(bool(is_side), ex_key)

    # 【v5.5】raw_mode：關掉機位 gating，所有指標一律照算、照計分。
    #
    # 為什麼要有這個模式 —— 產品端只會用一個機位，所以這次實驗的目的是
    # 「選出最好的那一個角度」。但要比較機位，兩邊就必須量同一組東西：
    # gating 開著的時候，正側面的總分由 {Hip Depth, Torso Lean, 近側 Knee}
    # 組成、正面的總分由 {Knee Valgus, Knee Sym, …} 組成，權重各自重新
    # 正規化到 100% —— 兩個數字算的根本不是同一件事，拿來比等於用數學
    # 成績跟英文成績比學校。
    #
    # 更嚴重的是循環論證：measurability 表是幾何推論的**先驗假設**，
    # 先假設「正面測不到膝角」再把它歸零，然後「發現」正面的分數組成不同 ——
    # 那是自己設定的，不是實驗發現的。v5.4 的實測已經打臉大半：
    # L Knee 在正面的動態範圍是側面的 372%，臥推七個指標有五個在對照機位
    # 訊號一樣強或更強。用假設去 gate，只會量到自己的假設。
    #
    # 所以測試模式改走 raw_mode：所有 (指標 × 機位) 都產生可比較的數值，
    # 機位優劣改用「反應倍率 ÷ 重測 CV」判斷（與機位無關、單位一致）。
    # 產品端維持 gating 不變 —— 那裡的目的不是比較，是不要給使用者假回饋。
    raw_mode = bool(cfg.get("_raw_mode")) or bool(out is not None and out.get("raw_mode"))
    if raw_mode:
        vfac = np.ones(len(ml), dtype=float)
    else:
        vfac = np.array([measurability.view_factor(ex_key, lab, view) for lab in ml], dtype=float)
        # ── 【v7】實測 gating 才是權威，先驗表不得再硬歸零 ────────────────
        #   系統裡本來有**兩道獨立的先驗表閘**：
        #     ① cfg["_usable_metrics"]（來自 VIEW_METRIC_TABLE）
        #     ② 這裡的 view_factor（來自 METRIC_PLANE × _PLANE_TABLE）
        #   v6.4 只把 ① 換成了「建模影片實測」，② 完全沒動 —— 於是實測說
        #   可用的指標，還是被 ② 悄悄歸零。
        #
        #   實測 2026-07-31 抓到：深蹲正面/自選的 Torso Lean
        #   可見度 1.00、ROM 9.3°（解剖下限 2.0），兩關都過，
        #   卻因為 _PLANE_TABLE[SAGITTAL][FRONTAL_0] = NONE 被砍掉。
        #
        #   修法：建模階段量過的指標（存在 _usable_metrics 裡），
        #   view_factor 最低給 PARTIAL，不准歸零 —— 因為「看不看得到」
        #   已經量過了。保留 PARTIAL 的降權是合理的（正面的軀幹前傾
        #   確實被壓縮：實測正側面 18.6° vs 正面 9.3°，剩約一半），
        #   但那是降權不是丟棄。
        _um = cfg.get("_usable_metrics")
        if _um:
            _um = set(_um)
            for _i, _lab in enumerate(ml):
                if _lab in _um and vfac[_i] <= 0.0:
                    vfac[_i] = measurability.PARTIAL
    if out is not None:
        out["raw_mode"] = raw_mode
        out["view"] = view

    # 【v5.2】底部加權核（必須與建模端 create_golden_template 用同一組）
    _pw = phase_weights(template, cfg)

    # ── 【v5.3】左右成對指標：只留看得到的那一側 ──────────────────────────
    #   正側面拍攝時近側肢體會擋住遠側，MediaPipe 對遠側是「腦補」而不是留白，
    #   visibility 也不會歸零（實測遠側 0.84、近側 0.99，過不了任何既有門檻）。
    #   最危險的是：**遠側的假曲線跟模板的假曲線會很像**——因為兩邊是同一套
    #   幻覺。實測臥推遠側 L Elbow 對模板的偏差 9.13°，比真的看得到的近側
    #   R Elbow（10.25°）還小；深蹲的假左腿甚至讓刻意錯組的 Cohen's d 變成
    #   **−0.53**（做錯的人分數反而比較高）。
    #   一致性不等於有效性——兩邊錯得一樣，相似度會給滿分。
    #   所以直接把成對指標收斂成一個：留可見度高的那側，權重合併過去。
    _collapsed = []
    if metric_visibility is not None:
        for pair in cfg.get("bilateral_pairs", []):
            try:
                ia, ib = ml.index(pair[0]), ml.index(pair[1])
            except ValueError:
                continue
            va = float(np.nanmean(metric_visibility[:, ia]))
            vb = float(np.nanmean(metric_visibility[:, ib]))
            if not (np.isfinite(va) and np.isfinite(vb)):
                continue
            # 【v5.8】除了可見度，也看**活動範圍**。
            #   MediaPipe 對被擋住的肢體會給出「看似合理的 visibility」配上
            #   「幾乎不動的座標」——實測臥推正側面遠側手 visibility 0.84（不低）
            #   但活動範圍只有 6.7°（正常 40–52°）。只看 visibility 會漏判，
            #   而且會跟切割端的 auto_bilateral（看活動範圍）選到不同側，
            #   造成「用左手切 rep、用右手評分」的錯配。
            ra = float(np.nanmax(user_rep[:, ia]) - np.nanmin(user_rep[:, ia]))
            rb = float(np.nanmax(user_rep[:, ib]) - np.nanmin(user_rep[:, ib]))
            rom_gap = (min(ra, rb) / max(ra, rb)) if max(ra, rb) > 1e-6 else 1.0
            # 兩側都清楚看得到**而且**動得一樣多 → 不合併，左右對稱本身是有用的資訊
            if min(va, vb) >= 0.93 and rom_gap >= 0.7:
                continue
            # 活動範圍差距明顯時以它為準（比 visibility 可靠），否則才看 visibility
            if rom_gap < 0.7 and np.isfinite(ra) and np.isfinite(rb):
                near, far = (ia, ib) if ra >= rb else (ib, ia)
            else:
                near, far = (ia, ib) if va >= vb else (ib, ia)
            # ── 【v8】合併方向必須服從建模階段的實測結論 ────────────────────
            #   這裡是**逐影片**用可見度/ROM 決定併進哪一側，但下面的
            #   `_usable_metrics` 是**建模階段一次決定、該機位所有影片共用**的。
            #   兩者不一致時，合併後的那一側可能不在 usable 裡 →
            #   權重先併過去、再被 usable 關卡整包丟掉，**兩側一起消失**，
            #   而且 dropped 清單只會顯示一條，另一條無聲蒸發。
            #
            #   實測（合成資料重現）：usable = [R Knee, …] 但兩側可見度相同
            #   (0.92 = 0.92) → 依 `va >= vb` 併進 L Knee → L Knee 不在 usable
            #   → 最後 R/L Knee 權重都是 0，深蹲正側面連膝角都沒了。
            #
            #   規則：兩側只有一側在 usable 裡時，一律併往那一側。
            _um_now = cfg.get("_usable_metrics")
            if _um_now:
                _um_now = set(_um_now)
                _a_ok, _b_ok = ml[ia] in _um_now, ml[ib] in _um_now
                if _a_ok != _b_ok:                      # 剛好一邊在、一邊不在
                    near, far = (ia, ib) if _a_ok else (ib, ia)
            if ws[far] > 0:
                ws[near] += ws[far]
                _collapsed.append((ml[far], ml[near],
                                   f"可見度 {min(va, vb):.2f} < 近側 {max(va, vb):.2f}，"
                                   f"權重併入 {ml[near]}"))
                ws[far] = 0.0
                subs[far] = np.nan

    # 找出次要效能指標的索引
    tempo_idx = ml.index("Tempo") if "Tempo" in ml else -1
    stability_idx = ml.index("Stability") if "Stability" in ml else -1
    hip_stability_idx = ml.index("Hip Stability") if "Hip Stability" in ml else -1

    # 先將次要指標的權重強制歸零，不讓它們污染形態主分數
    for idx in [tempo_idx, stability_idx, hip_stability_idx]:
        if idx != -1:
            ws[idx] = 0.0

    _w0 = ws.sum()          # 主分權重原始總和（已扣掉次要指標），用來算 measured_ratio
    _dropped = []
    _unmeasurable = []      # 【v5.0】此機位物理上量不到 → 必須讓使用者看得見
    _w_lost = 0.0           # 【v5.0】完全放棄掉的權重（PARTIAL 降權不算在內）
    dirs = cfg.get("metric_directions", {})

    # 【v5.9】機位層級的固定指標集。由建模階段一次決定，該機位所有影片共用 ——
    #   這是「同一組影片可以互相比較」的前提，見下方逐影片門檻處的說明。
    usable = cfg.get("_usable_metrics")
    if usable is not None:
        usable = set(usable)
        for i, lab in enumerate(ml):
            if i in (tempo_idx, stability_idx, hip_stability_idx):
                continue
            if lab not in usable and ws[i] > 0:
                subs[i] = np.nan
                _dropped.append((lab, "此機位量不到（建模階段判定，該機位所有影片一致）"))
                _w_lost += float(ws[i])
                ws[i] = 0.0

    # ── 【v8】第二道關卡：重測信度 ───────────────────────────────────────
    #   「量得到」不等於「量得準」。深蹲正側面的 Hip Depth 可見度 0.91、
    #   ROM 正常、權重最重（0.32），但同一人同機位的 5 支標準影片
    #   子分數是 100/99/100/36/31 —— 標準組自己就散成這樣，
    #   拿它判斷「有沒有蹲夠深」等於擲骰子。實測後果：刻意只蹲 1/4 的
    #   那支拿 73.6 分，比標準組平均 66.1 還高，判定完全相反。
    #
    #   門檻 CV ≤ 0.35 由 40 支資料掃出來（見 measurability.RELIABILITY_CV
    #   的說明）：12 格「機位 × 錯誤型態」判定符合解剖學預期的格數
    #   從 6/12 提升到 11/12。
    #
    #   ⚠️【v8.9】校準階段必須跳過這一關（_skip_reliability_gate）。
    #   否則會形成循環，實測踩到：
    #       ① 指標被 RELIABILITY_CV 查表擋下 → 權重 0 → 子分數是 0
    #       ② 校準拿子分數算 CV → 收到 [0, 0, 0] → CV 算不出來
    #       ③ 算不出來就沿用查表 → 永遠翻不了身
    #   後果：深蹲自選機位 7 個指標只剩 1 個計分，而被擋掉的
    #   L Knee / R Knee / Hip Depth 的**原始量測 CV 只有 0.03–0.20**，
    #   非常穩定 —— 它們是被一張查錯的表（自選機位去查 frontal_0）冤枉的。
    #
    #   校準的職責就是量信度，所以它必須在「信度未知」的狀態下評分：
    #   可測性關卡照跑（那是物理限制），信度關卡跳過（那正是要量的東西）。
    _rel_why = {}
    if usable and not cfg.get("_skip_reliability_gate"):
        _reliable, _rel_why = measurability.reliable_metrics(
            ex_key, view, sorted(usable),
            measured_cv=cfg.get("_metric_cv"),
            n_videos=cfg.get("_n_source_videos"),
            # 【v8.7】CV 來源決定採不採信：獨立校準影片可直接用，
            #   建模影片自估的因為循環性仍要 n≥3（見 reliable_metrics 說明）
            cv_source=cfg.get("_cv_source"))
        _reliable = set(_reliable)
        for i, lab in enumerate(ml):
            if i in (tempo_idx, stability_idx, hip_stability_idx):
                continue
            if lab in usable and lab not in _reliable and ws[i] > 0:
                _cv, _src, _ = _rel_why.get(lab, (None, "", False))
                subs[i] = np.nan
                _dropped.append((lab, f"量得到但量不準：重複拍攝的變異 CV="
                                      f"{_cv if _cv is None else f'{_cv:.2f}'} > "
                                      f"{measurability.RELIABILITY_CV_MAX}（{_src}）"))
                _w_lost += float(ws[i])
                ws[i] = 0.0
    if out is not None:
        out["reliability"] = {k: {"cv": v[0], "source": v[1], "pass": v[2]}
                              for k, v in _rel_why.items()}

    # ── 【v5.0】先套機位 gating，再進逐指標迴圈 ──────────────────────────────
    for i, lab in enumerate(ml):
        if i in (tempo_idx, stability_idx, hip_stability_idx):
            continue
        if vfac[i] <= 0.0:
            subs[i] = np.nan
            _unmeasurable.append((lab, f"{measurability.VIEW_ZH.get(view, view)} 測不到（權重 {ws[i]:.2f} 已釋出）"))
            _w_lost += float(ws[i])
            ws[i] = 0.0
        elif vfac[i] < 1.0:
            # 透視壓縮：訊號還在但被壓縮，降權而不是丟掉
            ws[i] *= vfac[i]

    # 1. 計算主體形態分數
    for i in range(len(ml)):
        if ws[i] <= 0.0 and i not in (tempo_idx, stability_idx, hip_stability_idx):
            continue                      # 已被機位 gating 或左右合併排除
        col = user_rep[:, i]
        if np.isnan(col).all():
            subs[i] = np.nan     # 【v4.8】未量測記 NaN 而不是 0：記 0 會讓測試模式的
                                 #   散點圖出現一排 sub_score=0 的假點，看起來像評分崩壞
            if i not in [tempo_idx, stability_idx, hip_stability_idx]:
                _dropped.append((ml[i], f'整欄 NaN（權重 {ws[i]:.2f}）'))
                ws[i] = 0.0
            continue

        if metric_visibility is not None:
            # 【v4.8 放寬折扣】MediaPipe 對「背面／斜後方」視角的 visibility 本來就
            #   偏低，但點位其實是準的（是模型信心低，不是真的被遮住）。舊門檻
            #   (0.3/0.5/0.7) 讓深蹲整體有效權重只剩 61–65%，關鍵指標（膝內塌）
            #   被打到 0.4 折 → 刻意做錯也幾乎不影響總分。
            avg_vis = float(np.nanmean(metric_visibility[:, i]))
            # 【v5.9】有 usable_metrics（機位層級的固定指標集）時，**不再逐影片
            #   用可見度決定要不要計分**。逐影片決定會讓同一組的每支影片算的
            #   東西不一樣：實測臥推正側面標準組 3 支的計分指標數是 [1, 1, 5]，
            #   算出來的 SD 混了「動作變異」與「指標組成變異」兩件事，重測信度
            #   完全不可解讀；效度那邊標準組與刻意錯組的共同指標甚至只有 1/5。
            #   指標集必須由建模階段一次決定、該機位所有影片共用，比較才成立。
            if usable is not None:
                pass                       # 指標集已由 usable 決定，跳過逐影片門檻
            elif avg_vis < 0.25:
                subs[i] = np.nan
                if i not in [tempo_idx, stability_idx, hip_stability_idx]:
                    _dropped.append((ml[i], f'可見度 {avg_vis:.2f}<0.25（權重 {ws[i]:.2f}）'))
                    # ⚠️ 這裡漏掉 _w_lost 會讓 measured_ratio 假報成 1.0。
                    #   實測臥推正側面 7 個指標有 6 個因可見度歸零、分數整個由
                    #   R Elbow 一個指標撐起來，UI 卻顯示「有效權重 100%」，
                    #   連帶 score_trustworthy 也誤判成可信。
                    _w_lost += float(ws[i])
                    ws[i] = 0.0
                continue
            elif avg_vis < 0.40:
                ws[i] *= 0.6
            elif avg_vis < 0.60:
                ws[i] *= 0.85

        # ── 【v4.8】方向性評分 ──────────────────────────────────
        # 舊版一律用 |col - template|，也就是「跟教練不一樣就扣分」。
        # 這在健身上是錯的：蹲得比教練更深、肘外展比教練更收，都是更好的
        # 動作，卻被扣一樣的分。實測結果就是有經驗者（幅度大、蹲更深）
        # 分數輸給新手（動作保守、剛好落在模板平均附近）。
        # 改成只罰「往壞的方向偏離」，往好的方向不扣分。
        # 死欄防呆：關節整段沒被追到、或被補成常數，會產生一條「幾乎不動」的
        # 假曲線。它跟模板的偏差可能極大，方向性評分卻可能判成「比教練好」而
        # 給滿分。只要使用者這欄的動態範圍小於模板的 15%，就視為沒量到。
        # 【v5.0】改成「跟解剖學期望比」，不再「跟模板比」。
        #   舊版門檻是 使用者範圍 < 模板範圍 × 15%。這在模板本身乾淨時有效，
        #   但 2026-07-27 實測顯示模板可能繼承同一個缺陷：深蹲從斜前方 45° 拍，
        #   遠側左腿沒被追到，L Knee 整段只有 165.9°–178.1°（範圍 12°），
        #   而同一下的 R Knee 是 94.5°–170.6°（範圍 76°）。模板的 L Knee 範圍
        #   也只有 22° —— 兩邊一起壞掉，相對門檻就永遠不會觸發。
        #   人蹲下去膝蓋一定要彎超過 40°，這是絕對事實，拿它當門檻才擋得住。
        _ok, _why = measurability.check_signal_health(ex_key, ml[i], col)
        if not _ok:
            subs[i] = np.nan
            if i not in [tempo_idx, stability_idx, hip_stability_idx]:
                _dropped.append((ml[i], _why))
                _w_lost += float(ws[i])
                ws[i] = 0.0
            continue

        _dir = dirs.get(ml[i], 'both')
        _tcol = template[:, i]

        if ml[i] in EXTREMUM_METRICS.get(ex_key, ()):
            # ── 【v7】幅度類指標比極值，不做逐點比對 ────────────────────
            #   「蹲多深」「膝內夾多少」本質上是一個純量，不是一條軌跡。
            #   拿它做逐點比對，等於把「相位有沒有對齊」也算進分數裡 ——
            #   而相位偏移跟動作品質完全無關。
            #
            #   實測 2026-07-31：臥推自選機位的受測曲線與模板，
            #   數值範圍幾乎相同（L Elbow 受測 95.0–166.6 / 模板 91.1–167.7），
            #   但切點相位差了 16–20 幀（約 rep 長度的 20%），
            #   逐點比對就爆出 45° 的假偏差 —— 其中 56–66% 純粹來自偏移。
            #
            #   極值對相位完全免疫，從根本上避開這件事。
            #   用共用函式，確保與 create_golden_template 算尺規時完全同一套量綱
            diff = _metric_deviation_extremum(col, _tcol, _dir)
            if out is not None:
                out.setdefault("extremum_metrics", []).append(ml[i])
        else:
            # ── 【v7】軌跡類指標：先做**受限對齊**再逐點比對 ──────────────
            #   模板是用 DBA 建的（內含 DTW 對齊），但評分端原本只是把受測 rep
            #   重採樣到模板長度後直接相減 —— 建模有對齊、評分沒有，不對稱。
            #
            #   對齊必須受限，**不能用完整 DTW**：DTW 會把時間軸自由拉伸到
            #   最像為止，連「做錯」都能對掉。例如「只蹲 1/4」若被拉伸到與
            #   模板等長，深度差異會被部分吸收 —— 那正是本實驗最該抓到的錯誤。
            #
            #   所以只允許**整體平移**，上限 ±25% rep 長度
            #   （實測需要 16–20%，25% 有餘裕）。平移量會記錄下來 ——
            #   需要大幅平移本身就是資訊，代表切點系統性偏移，
            #   該回頭修計次，而不是靠這裡補。
            _L = len(col)
            _max_shift = max(1, int(_L * 0.25))
            _best_d, _best_s = None, 0
            for _s in range(-_max_shift, _max_shift + 1):
                if _s == 0:
                    _u, _t = col, _tcol
                elif _s > 0:
                    _u, _t = col[_s:], _tcol[:_L - _s]
                else:
                    _u, _t = col[:_L + _s], _tcol[-_s:]
                if len(_u) < _L * 0.5:
                    continue
                _dd = _u - _t
                if _dir == 'lower_better':
                    _dd = np.clip(_dd, 0, None)
                elif _dir == 'higher_better':
                    _dd = np.clip(-_dd, 0, None)
                else:
                    _dd = np.abs(_dd)
                _m = float(np.nanmean(_dd)) if np.isfinite(_dd).any() else np.inf
                if _best_d is None or _m < _best_d:
                    _best_d, _best_s = _m, _s
            # 用最佳平移量重算一次帶底部加權的偏差（權重長度要跟訊號對齊）
            if _best_s == 0:
                _u, _t, _w = col, _tcol, _pw
            elif _best_s > 0:
                _u, _t, _w = col[_best_s:], _tcol[:_L - _best_s], _pw[:_L - _best_s]
            else:
                _u, _t, _w = col[:_L + _best_s], _tcol[-_best_s:], _pw[-_best_s:]
            d = _u - _t
            if _dir == 'lower_better':
                d = np.clip(d, 0, None)
            elif _dir == 'higher_better':
                d = np.clip(-d, 0, None)
            else:
                d = np.abs(d)
            # 【v5.2】底部加權平均，不再全程均等。動作的對錯集中在最深點附近。
            diff = weighted_nanmean(d, _w)
            if out is not None and _best_s:
                out.setdefault("align_shift", {})[ml[i]] = int(_best_s)

        # ══ 【v8.8】主路徑：在**量測值空間**算 z ═══════════════════════════
        #   z = 方向修正(使用者量測值 − 教練量測值中位) / 教練量測值的 MAD
        #
        #   為什麼不再用差值空間（舊路徑，見下方 fallback）——
        #   差值是「兩個相近大數相減」，相對誤差被放大。實測同一人 4 支深蹲：
        #       軀幹角度      15.1 14.5 12.9 14.2   CV 0.065  ← 穩
        #       減掉模板後    0.76 0.17 1.43 0.17   CV 0.955  ← 放大 15 倍
        #   然後分母又是「差值的變異」，不穩除以更不穩 → 45% 指標滿分、
        #   標準動作有 17% 被判「明顯做錯」、Hip Depth 量測 CV 0.24 卻因為
        #   分數 CV 0.91 被信度關卡剔除。
        #
        #   量測值空間只減一次，分母是教練原始量測值的離散度 ——
        #   穩定、有物理量綱（「教練自己做兩次差幾度」）、可以解釋給人聽。
        #
        #   另外順帶修掉一個獨立的錯：`both` 方向舊版用 abs(diff)，
        #   所以**做得比教練更好也扣分**（留一驗證：蹲得最直的那支只拿 48 分）。
        #   這裡改成有方向的 clip，超越教練不扣分。
        # ⛔【v8.8 已停用，2026-08-03】────────────────────────────────────
        #  這條路徑實測**造成退步**，改以 USE_VALUE_SPACE 關掉，程式碼保留當紀錄。
        #
        #  失敗原因：_user_value() 把整條 rep 曲線壓成**一個平均值**，形狀資訊全丟。
        #  結果是「平均值剛好落在教練附近、但動作形狀完全跑掉」的影片拿滿分。
        #
        #  實測證據（臥推俯視・刻意肘外展）：
        #      指標 Forearm Vertical
        #        標準組   raw_loss 11.25 → 子分數  72.3
        #        刻意錯   raw_loss 39.67 → 子分數 100.0   ← 偏差大 3.5 倍卻滿分
        #  raw_loss 是有方向的逐點偏差，它變大就代表更差。子分數反而上升，
        #  代表 value-space 的判斷與逐點偏差**互相矛盾**——
        #  在任何評分公式下這都是錯的。
        #
        #  連帶後果：這一項的滿分抵銷掉 Elbow Flare 的扣分，
        #  已驗證的「臥推俯視抓肘外展」從 +23.5 分掉到 +8.0 分，偵測失效。
        #
        #  教訓：形狀是這個系統的核心資訊（DBA 模板本身就是一條曲線），
        #  任何把曲線化約成單一純量的做法都會丟掉它。差值空間的放大問題
        #  是真的（見上方稽核），但解法不能是「不比形狀」。
        USE_VALUE_SPACE = False
        _vmed, _vmad = _unpack_tpl_sd(tpl_val, i) if tpl_val is not None else (None, None)
        _uval = _user_value(col, _tcol, _pw, ml[i], ex_key, _dir) if USE_VALUE_SPACE else None
        if (USE_VALUE_SPACE and _vmed is not None and _vmad is not None and _vmad > 1e-9
                and _uval is not None and np.isfinite(_uval)):
            _delta = _uval - _vmed
            if _dir == 'lower_better':
                _z = max(0.0, _delta / _vmad)          # 越小越好 → 只罰偏大
            elif _dir == 'higher_better':
                _z = max(0.0, -_delta / _vmad)         # 越大越好 → 只罰偏小
            else:
                _z = abs(_delta) / _vmad               # 雙向 → 兩邊都罰
            subs[i] = _z_score(_z)
            if out is not None:
                out.setdefault("value_space", {})[ml[i]] = {
                    "user": round(float(_uval), 4), "coach_med": round(float(_vmed), 4),
                    "coach_mad": round(float(_vmad), 4), "z": round(float(_z), 3)}
        else:
            # ── 現行路徑：逐點比對曲線形狀，再以教練自身變異標準化 ──
            #   缺點已知（差值放大，見稽核紀錄），但它**保留形狀資訊**，
            #   而形狀是這個系統唯一真正的判斷依據。
            _med, _mad = _unpack_tpl_sd(tpl_sd, i)
            if _mad is not None and _mad > 1e-9:
                subs[i] = _z_score(max(0.0, (diff - _med) / _mad))
            else:
                subs[i] = _piecewise_score(diff * scs[i])

    # 【v5.0】舊版這裡有一段 `if is_side:` 把 sub_score < 1 的指標權重歸零，
    #   再套 front_only_metrics。兩件事都已經被上面的機位 gating 表取代
    #   （measurability.view_factor），而且舊版那個 `subs[i] < 1.0` 的條件
    #   在 v4.8 把未量測改記 NaN 之後就永遠是 False（NaN < 1.0 為 False），
    #   等於默默失效了兩個版本。

    # ══ 【v7.1】量不到就不要給分 ══════════════════════════════════════════
    #   舊行為：剩下的權重重新正規化到 1.0，然後照常算分。
    #   後果是**量到越少、分數越高** —— 因為沒量到的指標一律零扣分：
    #
    #     有效權重 <30%  → 平均 99 分（實測 2 支，都是新手）
    #     有效權重 ≥70%  → 平均 77 分
    #
    #   實測 推17（新手・正側面）：七個指標只剩 R Elbow 有權重，
    #   它剛好接近模板 → 99.7 分。同一支的 Forearm Vertical z=53.5、
    #   Bar Path z=19.7 全都很糟，但權重是 0，完全不扣分。
    #   一個新手拿到滿分，而且是「因為系統看不到他做錯」。
    #
    #   這比給錯的分數更危險：分數看起來完全正常，沒有任何跡象顯示它無效。
    #   所以低於門檻時**不給分**（回傳 NaN），而不是給分再警告。
    #
    #   ── 【v8】判定條件從「權重比例」改成「有沒有可靠指標」 ──────────────
    #   v7.1 用 有效權重 < 45% 當作廢條件。這個代理量測有兩個毛病：
    #
    #    ① **會誤殺**。臥推正側面實測只剩 R Elbow（CV=0.009）與
    #       Forearm Vertical（CV=0.095），兩個都是全資料集裡最穩的指標，
    #       但權重加起來只有 33% → 整個機位不給分。事實上它們足以判斷
    #       「下放深度」與「前臂垂直」，只是判斷不了額狀面的肘外展與握距。
    #       正確做法是給分並註明範圍，不是拒答。
    #
    #    ② **會漏放**。深蹲正側面有效權重 70%（4 個指標），輕鬆過關，
    #       但其中權重最大的 Hip Depth 重測 CV=0.50，等於在用擲骰子計分。
    #       權重高不代表可信。
    #
    #   換成：**通過「可測性 + 信度」兩關的指標一個都不剩，才不給分。**
    #   分數永遠只由可靠指標算出，並且一定附上涵蓋範圍
    #   （抓得到哪些錯誤、抓不到哪些），讓使用者知道這個分數管到哪裡。
    _measured_ratio_now = float(ws.sum() / _w0) if _w0 > 1e-9 else 0.0
    _n_scored = int((ws > 1e-6).sum())
    _scored_labels = [ml[i] for i in range(len(ml)) if ws[i] > 1e-6]
    # 【v8.4】自選機位（C 機位）在建模時會被解析成等效機位代號，但**效度驗證
    #   不得繼承** —— 實測深蹲自選 45° 解析成 frontal_0，於是宣告「抓得到膝內夾」，
    #   而實際只掉 5.7 分（正面是 31.4）。解析只保證「量得到什麼」。
    _can, _cannot = measurability.detectable_errors(
        ex_key, _scored_labels, view=view,
        free_placement=bool(cfg.get("_free_placement")),
        # 【v9.0】實測相機姿態（從骨架反推）。有量到就用角度判斷效度適不適用，
        #   量不到才退回 free_placement 那條保守規則。
        measured_pose=cfg.get("_measured_pose"))
    if out is not None:
        out["scored_metrics"] = _scored_labels
        out["detectable_errors"] = [{"name": n, "desc": d, "via": v} for n, d, v in _can]
        out["undetectable_errors"] = [{"name": n, "desc": d, "needs": v} for n, d, v in _cannot]
    # 【v8.6】第二個作廢條件：**骨長關卡擋下核心骨段，而且一個已驗證的錯誤都抓不到**。
    #
    #   為什麼不用「計分指標數 ≤ 1」當條件 —— 試過，會誤殺：
    #     深蹲正側面 只計 1 個指標（R Knee），但實測抓得到「深度不足」（掉 29.8 分）。
    #     指標少不等於沒用。
    #
    #   真正把「能用」跟「不能用」分開的是骨長：
    #     深蹲正側面   相關骨段全過   1 個指標  → 抓得到深度不足    ✅ 該給分
    #     臥推正側面   前臂左右差 32%  1 個指標  → 兩種錯誤都抓不到  ⛔ 不該給分
    #                                              （標準 97.8／肘外展 98.3，做錯反而更高）
    #
    #   兩個條件要**同時**成立才作廢：
    #     ① 骨長關卡判定核心骨段重建失敗（物理證據，不是信心值）
    #     ② 剩下的指標涵蓋不到任何一個經過效度驗證的錯誤（沒有保護力）
    #   單獨看①太嚴（骨長壞但仍抓得到錯誤時，分數仍有意義）；
    #   單獨看②太嚴（會把「尚未驗證但物理上量得到」的機位一併作廢）。
    _bone_blocked = bool(cfg.get("_bone_gate_blocking"))
    if _n_scored > 0 and _bone_blocked and not _can:
        if out is not None:
            out["scored_metrics"] = _scored_labels
            out["score_void"] = True
            out["score_void_reason"] = (
                f"這個角度量到的骨長左右不對稱（{cfg.get('_bone_gate_note') or '核心骨段重建失敗'}），"
                "代表被擋住那一側的座標是模型推估的、不是看到的；"
                "剩下的指標又抓不到任何一種已驗證的錯誤 —— "
                "此時給分數只會讓人誤以為動作沒問題。請換一個角度重拍。")
        try:
            print(f"[score_rep] ⚠️ 骨長關卡擋下核心骨段且無可偵測錯誤 → 不給分")
        except Exception:
            pass
        return np.nan, subs

    if _n_scored == 0:
        if out is not None:
            out["final_weights"] = {ml[i]: round(float(ws[i]), 3) for i in range(len(ml))}
            out["measured_ratio"] = _measured_ratio_now
            out["dropped"] = _dropped
            out["unmeasurable"] = _unmeasurable
            out["collapsed_bilateral"] = [f"{f} → {n}：{why}" for f, n, why in _collapsed]
            out["view"] = view
            out["score_void"] = True
            out["score_void_reason"] = (
                "這個機位沒有任何指標同時通過「量得到」與「量得準」兩關，"
                "算不出有意義的分數。請換一個角度重拍。")
        try:
            print("[score_rep] ⚠️ 可靠指標 0 個 → 不給分")
        except Exception:
            pass
        return np.nan, subs

    total_w = ws.sum()
    if out is not None:
        # 【v5.0】measured_ratio 只算「完全放棄」的權重。PARTIAL（透視壓縮）
        #   的指標還是有量到、只是降權，不該被算成「沒量到」。
        out["measured_ratio"] = round(1.0 - float(_w_lost / _w0), 3) if _w0 > 0 else 0.0
        # view_quality：這個機位對這個動作整體有多合適（1.0 = 每個指標都正面拍到）
        _vq = float(np.dot(cfg["scoring_weights"], vfac) / max(cfg["scoring_weights"].sum(), 1e-9))
        out["view_quality"] = round(_vq, 3)
        out["dropped"] = _dropped
        out["unmeasurable"] = _unmeasurable
        out["collapsed_bilateral"] = [f"{f} → {n}：{why}" for f, n, why in _collapsed]
        out["view"] = view
        out["view_factors"] = {ml[i]: round(float(vfac[i]), 2) for i in range(len(ml))}
        out["scale_mode"] = "template_sd" if tpl_sd is not None else "legacy_scales"
    if total_w > 0:
        ws /= total_w
    if out is not None:
        out["final_weights"] = {ml[i]: round(float(ws[i]), 3) for i in range(len(ml))}

    # ══ 【v8.9】形態基礎分：加權**冪平均**，不是加權算術平均 ═══════════════
    #
    #  為什麼要換掉算術平均
    #  ──────────────────
    #  算術平均會把「單一指標的嚴重錯誤」稀釋掉，而且指標越多稀釋越嚴重。
    #  這在修好信度關卡的循環 bug 之後直接爆出來：可靠指標從 2 個變 6 個，
    #  深蹲正面抓膝內夾的掉分從 +35.9 掉到 **+19.1**（低於 20 分門檻），
    #  已驗證的偵測就這樣被「更完整的量測」給稀釋掉了。
    #
    #  但這不是「指標太多」的問題 —— 是**聚合方式**的問題：
    #  動作品質是短板決定的。深蹲其他每項都完美、只有膝蓋嚴重內夾，
    #  那不是一個好深蹲，而算術平均會說它有 80 分。
    #
    #  冪平均（p < 1）保留了「加權」的語意，但對低分項的懲罰是非線性的：
    #      score = ( Σ wᵢ·(sᵢ/100)^p / Σwᵢ )^(1/p) × 100
    #  p → 1 退化成算術平均；p → 0 趨近幾何平均；p → −∞ 趨近取最小值。
    #
    #  p 的選擇（40 支資料實測，不是調參）：
    #      p     偵測格數   標準組平均   深蹲正面膝內夾   臥推俯視肘外展
    #     0.20    6/12       80.1        +52.7 ✅       +57.5 ✅
    #     0.30    6/12       80.2        +42.4 ✅       +57.2 ✅
    #     0.50    6/12       80.6        +30.4 ✅       +53.9 ✅
    #     0.70    6/12       80.9        +24.1 ✅       +50.5 ✅
    #     1.00    5/12       81.3        +19.1 ❌       +46.4 ✅   ← 現行算術平均
    #  0.2–0.7 的結論完全一致，只有 p=1 失敗 → 結論對 p 不敏感。
    #  取 p = 0.3：偵測力已飽和，而標準組平均只比算術平均低 1.1 分
    #  （80.2 vs 81.3），不會讓正常動作被冤枉。
    #
    #  ⚠️ nan_to_num 只是保險：被歸零的指標權重已是 0，不會把 NaN 帶進總分。
    FORM_POWER_P = 0.30
    _sv = np.clip(np.nan_to_num(subs, nan=0.0), 0.0, 100.0) / 100.0
    _wsum = float(ws.sum())
    if _wsum > 1e-9:
        _pm = float(np.dot(_sv ** FORM_POWER_P, ws) / _wsum)
        form_score = float(np.clip(_pm ** (1.0 / FORM_POWER_P), 0.0, 1.0) * 100.0)
    else:
        form_score = 0.0
    if out is not None:
        out["form_aggregator"] = {"kind": "power_mean", "p": FORM_POWER_P,
                                  "arithmetic": round(float(np.dot(_sv, ws) / max(_wsum, 1e-9)) * 100, 2)}

    # 2. 獨立計算次要表現的附加扣分項 (Deductions)
    deductions = 0.0
    
    # 節奏扣分：若 Tempo 表現低於 75 分，依比例最多扣 5 分
    if tempo_idx != -1 and subs[tempo_idx] < 75.0:
        deductions += (75.0 - subs[tempo_idx]) / 75.0 * 5.0
        
    # 核心穩定度扣分：若變異數過大導致分數低於 70 分，最多扣 5 分
    for s_idx in [stability_idx, hip_stability_idx]:
        if s_idx != -1 and subs[s_idx] < 70.0:
            deductions += (70.0 - subs[s_idx]) / 70.0 * 5.0

    # 【v5.0】拿掉 30 分地板。舊版 max(30, …) 疊在 _piecewise_score 的 25 分
    #   地板上，把「完全做錯」與「做得普通」壓縮到同一區間 —— 2026-07-27 實測
    #   69 個 rep 只有 1% 落在 70 分以下、52% 擠在 90 分以上，好壞分不開。
    #   「不要用 0 分羞辱使用者」是 UI 的責任（可在前端顯示為「需要重做」），
    #   不該讓計分核心失去解析度。
    final_score = max(0.0, form_score - deductions)

    # 【v5.0】量到的權重太少時，分數本身不可信 —— 必須讓上層知道，
    #   否則會重演「刻意做錯的那一項剛好沒量到 → 不扣分 → 分數比標準組還高」。
    if out is not None:
        out["form_score"] = round(float(form_score), 2)
        out["deductions"] = round(float(deductions), 2)
        out["score_trustworthy"] = bool(out.get("measured_ratio", 0.0) >= 0.70)

    return final_score, np.nan_to_num(subs, 0)

def compute_metric_visibility(exercise_key, confs):
    """將 MediaPipe 提取的 8 關節信心度 (Frames, 8) 轉換為對應 7 個評分指標的信心度 (Frames, 7)
    
    這樣 score_rep 才能正確動態調配降權權重。
    """
    if confs.size == 0 or confs.ndim != 2:
        return None
        
    frames = confs.shape[0]
    metric_vis = np.ones((frames, 7), dtype=np.float32)
    
    if exercise_key == "lat_pulldown":
        # vc = [lsv, rsv, lev, rev, lwv, rwv, lhv, rhv]
        # ml = ["L Elbow", "R Elbow", "Torso Lean", "Tempo", "Elbow Sym", "Stability", "Bar Tilt"]
        metric_vis[:, 0] = confs[:, 2]  # lev
        metric_vis[:, 1] = confs[:, 3]  # rev
        metric_vis[:, 2] = np.min(confs[:, [0, 1, 6, 7]], axis=1)  # 軀幹需要肩髖皆可見
        metric_vis[:, 3] = np.min(confs[:, [4, 5]], axis=1)        # Tempo 依賴雙手腕
        metric_vis[:, 4] = np.min(confs[:, [2, 3]], axis=1)        # 對稱依賴雙手肘
        metric_vis[:, 5] = np.min(confs[:, [0, 1, 6, 7]], axis=1)  # 重心變異數依賴軀幹
        metric_vis[:, 6] = np.min(confs[:, [2, 3, 4, 5]], axis=1)  # 桿面傾斜依賴雙肘雙腕（v4.6 對齊公式）
        
    elif exercise_key == "squat":
        # vc = [lsv, rsv, lhv, rhv, lkv, rkv, lav, rav]
        # ml = ["L Knee", "R Knee", "Torso Lean", "Hip Depth", "Knee Sym", "Stability", "Knee Valgus"]
        metric_vis[:, 0] = confs[:, 4]  # lkv
        metric_vis[:, 1] = confs[:, 5]  # rkv
        metric_vis[:, 2] = np.min(confs[:, [0, 1, 2, 3]], axis=1)  # Torso Lean
        # 【v4.8】Hip Depth 改成自動選可見度較高的一側 → 取「較好那側」的可見度
        metric_vis[:, 3] = np.max(np.stack([np.min(confs[:, [2, 4]], axis=1),
                                            np.min(confs[:, [3, 5]], axis=1)]), axis=0)
        # 【v9.0】不對稱指數以「左右膝屈曲角」計算，而膝屈曲角本身需要髖膝踝三點，
        #   所以它其實依賴六個下肢點位，不是只有兩個膝。舊版只查膝的可見度，
        #   會在遠側髖或踝被擋住時高估這個指標的可信度。
        metric_vis[:, 4] = np.min(confs[:, [2, 3, 4, 5, 6, 7]], axis=1)   # Knee Sym
        # 【v9.0】Stability 改為 COM–BOS 側向偏移：支撐底面由兩踝定義，
        #   所以踝的可見度變成必要條件（舊版只看髖，因為算的是重心 x 的變異數）。
        metric_vis[:, 5] = np.min(confs[:, [0, 1, 2, 3, 6, 7]], axis=1)   # Stability
        metric_vis[:, 6] = np.min(confs[:, [2, 3, 4, 5, 6, 7]], axis=1)   # FPPA 依賴髖膝踝
        
    elif exercise_key == "deadlift":
        # vc = [lsv, rsv, lhv, rhv, lkv, rkv, lav, rav]
        # ml = ["Hip Hinge", "L Knee", "R Knee", "Back Flat", "Knee Sym", "Stability", "Bar Path"]
        metric_vis[:, 0] = np.min(confs[:, [0, 2, 4]], axis=1)      # Hip Hinge (肩髖膝)
        metric_vis[:, 1] = confs[:, 4]  # lkv
        metric_vis[:, 2] = confs[:, 5]  # rkv
        metric_vis[:, 3] = np.min(confs[:, [0, 2, 4, 6]], axis=1)  # 脊椎中立依賴左肩髖膝踝（v4.6 對齊公式）
        metric_vis[:, 4] = np.min(confs[:, [4, 5]], axis=1)        # Knee Sym
        metric_vis[:, 5] = np.min(confs[:, [2, 3]], axis=1)        # Stability
        metric_vis[:, 6] = np.min(confs[:, [0, 1, 4, 5]], axis=1)  # Bar Path 依賴手腕(此處為簡化，實際對齊手與肩)
        
    elif exercise_key == "bench_press":
        # vc = [lsv, rsv, lev, rev, lwv, rwv, lhv, rhv]
        # ml = ["L Elbow", "R Elbow", "Elbow Flare", "Forearm Vertical", "Elbow Sym", "Bar Path", "Grip Width"]
        metric_vis[:, 0] = confs[:, 2]  # lev
        metric_vis[:, 1] = confs[:, 3]  # rev
        metric_vis[:, 2] = np.min(confs[:, [0, 1, 2, 3]], axis=1)  # Elbow Flare (肩肘與軀幹)
        metric_vis[:, 3] = np.min(confs[:, [2, 3, 4, 5]], axis=1)  # Forearm Vertical (肘+腕)
        metric_vis[:, 4] = np.min(confs[:, [2, 3]], axis=1)        # Elbow Sym
        metric_vis[:, 5] = np.min(confs[:, [4, 5]], axis=1)        # Bar Path
        metric_vis[:, 6] = np.min(confs[:, [0, 1, 4, 5]], axis=1)  # 【v4.8】Grip Width 依賴肩+腕
        
    elif exercise_key == "overhead_press":
        # vc = [lsv, rsv, lev, rev, lwv, rwv, lhv, rhv]
        # ml = ["L Elbow", "R Elbow", "Torso Lean", "Forearm Vertical", "Elbow Sym", "Stability", "Grip Width"]（v4.6）
        metric_vis[:, 0] = confs[:, 2]  # lev
        metric_vis[:, 1] = confs[:, 3]  # rev
        metric_vis[:, 2] = np.min(confs[:, [0, 1, 6, 7]], axis=1)  # Torso
        metric_vis[:, 3] = np.min(confs[:, [2, 3, 4, 5]], axis=1)  # 前臂垂直依賴雙肘雙腕
        metric_vis[:, 4] = np.min(confs[:, [2, 3]], axis=1)        # Elbow Sym
        metric_vis[:, 5] = np.min(confs[:, [0, 1, 6, 7]], axis=1)  # 重心穩定依賴肩髖
        metric_vis[:, 6] = np.min(confs[:, [0, 1, 4, 5]], axis=1)  # 握距依賴雙肩雙腕度
        
    elif exercise_key == "barbell_row":
        # vc = [lsv, rsv, lev, rev, lwv, rwv, lhv, rhv]
        # ml = ["L Elbow", "R Elbow", "Torso Hinge", "Pull Depth", "Elbow Sym", "Stability", "Grip Width"]（v4.6）
        metric_vis[:, 0] = confs[:, 2]  # lev
        metric_vis[:, 1] = confs[:, 3]  # rev
        metric_vis[:, 2] = np.min(confs[:, [0, 1, 6, 7]], axis=1)  # Torso Hinge
        metric_vis[:, 3] = np.min(confs[:, [2, 3, 4, 5]], axis=1)  # 拉桿幅度依賴雙肘雙腕
        metric_vis[:, 4] = np.min(confs[:, [2, 3]], axis=1)        # Elbow Sym
        metric_vis[:, 5] = np.min(confs[:, [0, 1, 6, 7]], axis=1)  # 重心穩定依賴肩髖
        metric_vis[:, 6] = np.min(confs[:, [0, 1, 4, 5]], axis=1)  # 握距依賴雙肩雙腕
        
    return metric_vis

# ═══════════════════════════════════════════════════════════════════════════════
# EXERCISE EXTRACTORS
# ═══════════════════════════════════════════════════════════════════════════════

def smooth_captured_landmarks(landmarks_data, fps):
    """針對擷取完成的全片骨架座標(Frames, 33, 5)進行時間軸平滑濾波"""
    if landmarks_data.size == 0 or len(landmarks_data) < 5:
        return landmarks_data
    smoothed = landmarks_data.copy()
    frames, num_joints, num_coords = smoothed.shape
    # 視窗長度（約 0.2 秒長度，必須為奇數）
    win = max(5, int(fps * 0.20) // 2 * 2 + 1)
    if win > frames:
        return smoothed
    for j in range(num_joints):
        for c in range(num_coords):
            col = smoothed[:, j, c]
            if np.all(col == 0) or np.isnan(col).all():
                continue
            # 使用二階多項式平滑，完美保留運動變向尖峰並消去高頻白噪訊
            smoothed[:, j, c] = savgol_filter(col, window_length=win, polyorder=2, mode='interp')
    return smoothed

def _select_subject(pose_landmarks, prev):
    """從多人偵測結果挑出「主體」，避免抓到鏡中倒影或旁邊的人。

    為什麼需要：舊版用 num_poses=1，MediaPipe 只回一個人，但「回哪一個」由它
    自己決定，而且**每一幀都可能換人**。健身房有整面鏡子、旁邊常有其他人，
    訊號會在本人與倒影/路人之間瞬間跳動 —— 表現出來就是計次多算、關節角度
    出現尖刺。改成偵測多人再自己鎖定主體。

    prev: {'center': (x, y), 'scale': float} 或 None
    回傳 (index 或 None, 新的 prev)
    """
    cands = []
    for i, lms in enumerate(pose_landmarks):
        try:
            ls, rs, lh, rh = lms[11], lms[12], lms[23], lms[24]
        except Exception:
            continue
        cx = (ls.x + rs.x + lh.x + rh.x) / 4.0
        cy = (ls.y + rs.y + lh.y + rh.y) / 4.0
        sh = ((ls.x - rs.x) ** 2 + (ls.y - rs.y) ** 2) ** 0.5
        tl = (((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2) ** 2 +
              ((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2) ** 2) ** 0.5
        scale = max(sh, tl)
        vis = float(np.mean([p.visibility for p in lms])) if len(lms) else 0.0
        cands.append((i, cx, cy, scale, vis))
    if not cands:
        return None, prev

    # ⚠️ 只有一個候選時一律接受，不做距離判斷。
    #   畫面裡就一個人，不可能「追錯人」——這時距離門檻只會製造假的追丟。
    #   v5.5 曾對單一候選也套 0.35 的門檻，結果深蹲整段被判定追丟：
    #   蹲下站起時肩髖中心的 y 在畫面上位移就有 0.2–0.3，配上跳幀（每 2–3 幀
    #   才處理一次）很容易越過門檻 → 大量幀被丟成「沒偵測到」。
    if len(cands) == 1:
        c = cands[0]
        return c[0], {'center': (c[1], c[2]), 'scale': c[3]}

    if prev is None:
        # 首次鎖定：軀幹越大、越靠畫面中央、可見度越高 → 越可能是被拍的人。
        # 鏡中倒影因為多了一段光程，在畫面上一定比本人小；旁邊的路人通常偏邊緣。
        best = max(cands, key=lambda c: c[3] * (1.0 - 0.6 * abs(c[1] - 0.5)) * (0.5 + 0.5 * c[4]))
    else:
        pcx, pcy = prev['center']; ps = max(prev['scale'], 1e-6)
        # 後續幀：時序連續性 —— 跟上一幀主體位置最接近、體型變化最小的才是同一個人
        best = min(cands, key=lambda c: (((c[1] - pcx) ** 2 + (c[2] - pcy) ** 2) ** 0.5
                                         + 0.5 * abs(c[3] - ps) / ps))
        # 追丟保護只在「有多個候選」時才有意義：離上一幀太遠就寧可跳過這一幀，
        # 也不要跳到另一個人身上（跳過去會生出一個假的動作循環）。
        # 門檻放寬到 0.5：動作本身的位移不該被當成追丟。
        if ((best[1] - pcx) ** 2 + (best[2] - pcy) ** 2) ** 0.5 > 0.5:
            return None, prev
    return best[0], {'center': (best[1], best[2]), 'scale': best[3]}


def _run_pose_extraction_from_frames(frames, fps, feature_fn):
    """裝置端建模用：骨架已經在手機上抽好，這裡只做「骨架 → 指標」那一段。

    為什麼要有這條路徑
    ──────────────────
      手機端（iOS 原生 / WASM MediaPipe）已經逐幀跑過一次 pose 偵測了。
      若再把整支影片上傳讓後端重跑，等於同一件事算兩次，而且在行動網路上
      要傳 30–150 MB。改成只上傳骨架（幾 MB 的 JSON），後端接手同一個
      feature_fn —— **指標公式完全共用**，不會出現「手機建的模板」與
      「後端建的模板」用不同公式的情況。

    frames: [{ 'world': [[x,y,z] ×33], 'image': [[x,y] ×33], 'vis': [v ×33] }, ...]
            —— 對應 MediaPipe 的 pose_world_landmarks / pose_landmarks / visibility。

    回傳格式與 _run_pose_extraction 完全一致：(features, confs, fps, landmarks)。

    ⚠ 主體選擇（_select_subject）在裝置端就做完了（numPoses=1），這裡不再做；
      跳幀也不做 —— 手機端抽取時已經壓到約 20fps。
    """
    features, confs, landmarks = [], [], []
    EMPTY_LM = np.zeros((33, 5), dtype=np.float32)
    state = {}
    fps = float(fps) if fps and float(fps) > 0 else 30.0

    for fr in (frames or []):
        try:
            w = np.asarray(fr.get('world') or [], dtype=np.float32)
            im = np.asarray(fr.get('image') or [], dtype=np.float32)
            vs = np.asarray(fr.get('vis') or [], dtype=np.float32)
            if w.shape != (33, 3) or im.shape != (33, 2) or vs.shape != (33,):
                raise ValueError("landmark shape mismatch")
            fv, vc = feature_fn(w, vs, state, fps)
            lm_frame = np.hstack([im, w]).astype(np.float32)   # (33,5)：欄 0-1 = 2D、欄 2-4 = world
        except Exception:
            fv, vc = [np.nan] * 7, [0.0] * 8
            lm_frame = EMPTY_LM
        features.append(fv)
        confs.append(vc)
        landmarks.append(lm_frame)

    if not features:
        return np.array([]), np.array([]), fps, np.array([])

    smoothed_lms = smooth_captured_landmarks(np.array(landmarks, dtype=np.float32), fps)
    return (np.array(features, dtype=np.float32),
            np.array(confs, dtype=np.float32),
            fps,
            smoothed_lms)


def _run_pose_extraction(video_path, feature_fn, progress_cb=None, frames=None, frames_fps=None):
    # 裝置端已抽好骨架 → 跳過解碼與 MediaPipe，直接進同一套 feature_fn
    if frames is not None:
        return _run_pose_extraction_from_frames(frames, frames_fps, feature_fn)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return np.array([]), np.array([]), 0.0, np.array([])

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    features, confs, landmarks = [], [], []
    EMPTY_LM = np.zeros((33, 5), dtype=np.float32)  # 無偵測時的骨架占位
    state = {}

    # 動態跳幀：把實際送進 MediaPipe 的處理量壓到約 15fps。
    # 健身大關節動作緩慢，15fps 已足夠解析波峰/波谷；高幀率影片（60/120fps）
    # 會自動跳更多幀（60fps→每4幀、120fps→每8幀），30fps 影片維持每2幀、不會變慢。
    # 【v4.8】15fps → 20fps。健身動作雖慢，但「蹲到最深」「槓碰胸」那一瞬間
    #   只有 2–3 幀，取樣太疏會直接錯過峰值 → 深度與 ROM 被系統性低估。
    SKIP = max(1, round(fps / 20))
    fn = 0
    import time
    start_time = time.time()

    subj = None          # 目前鎖定的主體（位置與體型），供跨幀追蹤
    tracked = lost = 0
    lost_streak = 0      # 連續追丟幀數；超過 LOST_RESET 就重新鎖定
    LOST_RESET = max(3, int(fps / 5))
    with _create_pose_landmarker(num_poses=4) as lm:
        while True:
            ret, frame = cap.read()
            if not ret: break
            fn += 1
            
            if progress_cb and fn % 15 == 0 and total > 0:
                elapsed = time.time() - start_time
                pfps = fn / elapsed if elapsed > 0 else 0
                progress_cb({
                    "percent": int((fn / total) * 100),
                    "processing_fps": round(pfps, 1),
                    "eta_seconds": int((total - fn) / pfps) if pfps > 0 else 0
                })

            # SKIP 已在迴圈外依影片幀率動態算好（約壓到 15fps）
            if fn % SKIP != 0:
                # 跳幀：特徵、信心度、骨架座標都沿用前一幀（保持等長對齊）
                features.append(features[-1] if features else [np.nan]*7)
                confs.append(confs[-1] if confs else [0.0]*8)
                landmarks.append(landmarks[-1] if landmarks else EMPTY_LM)
                continue

            h, w = frame.shape[:2]
            # 【v4.8】640 → 960。原註解說「幾乎不損精度」對「人佔滿畫面」才成立；
            #   實際拍攝要全身入鏡、距離 2.5–3 m，人只佔畫面高度的 6–7 成，
            #   4K 縮到 640 之後膝、踝關節只剩幾個像素，角度誤差直接反映成分數雜訊
            #   （實測同一人重測 SD 高達 5.5 分）。960 仍遠小於 4K，速度可接受。
            if w > 960:
                scale = 960.0 / w
                frame = cv2.resize(frame, (960, int(h * scale)), interpolation=cv2.INTER_AREA)
            
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            ts = int(fn * 1000 / fps)
            res = lm.detect_for_video(mp_img, ts)
            
            # 從多個候選中鎖定同一個人（見 _select_subject），而不是照單全收
            # MediaPipe 給的第 0 個 —— 那會在本人、鏡中倒影、旁邊路人之間亂跳。
            si, subj = (_select_subject(res.pose_landmarks, subj)
                        if res.pose_world_landmarks and res.pose_landmarks else (None, subj))
            if si is not None and si < len(res.pose_world_landmarks):
                pts = np.array([[p.x, p.y, p.z] for p in res.pose_world_landmarks[si]], dtype=np.float32)
                vis = np.array([p.visibility for p in res.pose_landmarks[si]], dtype=np.float32)
                fv, vc = feature_fn(pts, vis, state, fps)
                # 一併保存骨架座標，讓 AR 回放影片可直接複用、不必再跑一次 MediaPipe：
                #   欄 0-1 = 2D 正規化座標 (x, y)；欄 2-4 = 3D world 座標 (x, y, z)
                lm2d = np.array([[p.x, p.y] for p in res.pose_landmarks[si]], dtype=np.float32)
                lm_frame = np.hstack([lm2d, pts]).astype(np.float32)   # (33, 5)
                tracked += 1
            else:
                fv, vc = [np.nan]*7, [0.0]*8
                lm_frame = EMPTY_LM
                if res.pose_landmarks:
                    lost += 1        # 有偵測到人，但都不是我們在追的那個
                    # 連續追丟太久 = 一開始就鎖錯人（或人真的離開又回來）。
                    # 不重置的話會整支影片都追不回來，全部變成「沒偵測到」。
                    lost_streak += 1
                    if lost_streak >= LOST_RESET:
                        subj = None
                        lost_streak = 0
                else:
                    lost_streak = 0

            features.append(fv)
            confs.append(vc)
            landmarks.append(lm_frame)

    cap.release()
    # 追蹤品質回報：lost 高 = 畫面裡有多個人（鏡子/路人）而且一直在搶主體，
    # 這種影片的分數不可信，應該重拍而不是硬算。
    try:
        _t = tracked + lost
        if _t and lost / _t > 0.10:
            print(f"[pose] ⚠️ 主體追蹤不穩：{lost}/{_t} 幀 ({lost/_t:.0%}) 被判定為「不是同一個人」。"
                  f"畫面中可能有鏡子倒影或其他人，建議換角度重拍。")
        else:
            print(f"[pose] 主體追蹤穩定：{tracked} 幀鎖定、{lost} 幀排除他人")
    except Exception:
        pass
    # 【修改】：將原始陣列送進濾波器平滑後再 return
    smoothed_lms = smooth_captured_landmarks(np.array(landmarks, dtype=np.float32), fps)

    return (np.array(features, dtype=np.float32),
            np.array(confs, dtype=np.float32),
            fps,
            smoothed_lms)

def _extract_lat_pulldown(video_path, body_thr=0.80, joint_thr=0.60, progress_cb=None, view=None, frames=None, frames_fps=None):
    def feature_fn(pts, vis, state, fps):
        if 'wrist_hist' not in state: state['wrist_hist'] = deque(maxlen=2)
        if 'com_hist' not in state: state['com_hist'] = deque(maxlen=max(1, int(fps/2)))
        fv = [np.nan]*7; vc = [0.0]*8
        ls, le, lw_ = pts[11], pts[13], pts[15]
        rs, re, rw_ = pts[12], pts[14], pts[16]
        lh, rh = pts[23], pts[24]
        lsv, rsv, lev, rev, lwv, rwv, lhv, rhv = vis[11], vis[12], vis[13], vis[14], vis[15], vis[16], vis[23], vis[24]
        vc = [lsv, rsv, lev, rev, lwv, rwv, lhv, rhv]
        
        if lsv > joint_thr and lev > joint_thr and lwv > joint_thr:
            fv[0] = calculate_angle(ls, le, lw_)
        if rsv > joint_thr and rev > joint_thr and rwv > joint_thr:
            fv[1] = calculate_angle(rs, re, rw_)
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            mh = mid(lh, rh)
            ms = mid(ls, rs)
            fv[2] = torso_lean_angle(mh, ms)
        if lwv > joint_thr and rwv > joint_thr:
            cur = (lw_[1] + rw_[1])/2
            state['wrist_hist'].append(cur)
            fv[3] = state['wrist_hist'][-1] - state['wrist_hist'][0] if len(state['wrist_hist']) > 1 else 0.0
        if not np.isnan(fv[0]) and not np.isnan(fv[1]):
            fv[4] = abs(fv[0] - fv[1])
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            ms = mid(ls, rs)
            mh = mid(lh, rh)
            cx = (ms[0] + mh[0]) / 2
            state['com_hist'].append(cx)
            fv[5] = float(np.var(state['com_hist'])) if len(state['com_hist']) > 1 else 0.0
        if lev > joint_thr and rev > joint_thr and lwv > joint_thr and rwv > joint_thr and lsv > joint_thr and rsv > joint_thr:
            forearm_l = abs(le[1] - lw_[1])
            forearm_r = abs(re[1] - rw_[1])
            shoulder_w = abs(ls[0] - rs[0]) + 1e-6
            fv[6] = abs(forearm_l - forearm_r) / shoulder_w
        return fv, vc
    return _run_pose_extraction(video_path, feature_fn, progress_cb,
                               frames=frames, frames_fps=frames_fps)

def _extract_squat(video_path, body_thr=0.75, joint_thr=0.65, progress_cb=None, view=None, frames=None, frames_fps=None):
    """深蹲七大指標特徵萃取（v9.0：全面改用國際標準量測定義）。

    七個欄位對應的標準量（完整說明見 SQUAT_METRIC_STANDARDS）：

        fv[0] L Knee      左膝屈曲角          deg   伸直 0°，越彎越大
        fv[1] R Knee      右膝屈曲角          deg
        fv[2] Torso Lean  矢狀面軀幹傾角      deg   直立 0°
        fv[3] Hip Depth   大腿節段角          deg   0° = 大腿平行地面
        fv[4] Knee Sym    雙側不對稱指數      %     0% = 完全對稱
        fv[5] Stability   COM–BOS 側向偏移    %     0% = 質心對準支撐底面中心
        fv[6] Knee Valgus 膝內夾指數 = 1−KASR  —    + = 內夾、− = 膝外推

    ⚠️ 可見度 gate 與 v4.8 完全相同，一個字都沒改。
       換公式是為了讓每個量有國際定義與單位；「哪個機位量得到哪個指標」
       是實驗結論，不能因為換公式就偷偷放寬 gate 去改變它。
       特別是 fv[6] 仍然要求六個下肢點位全部過 joint_thr——正側面時遠側
       膝踝可見度實測只有 0.20–0.27，整欄 NaN、權重歸零，那正是要呈現的發現。
    """
    def feature_fn(pts, vis, state, fps):
        fv = [np.nan]*7; vc = [0.0]*8
        ls, rs = pts[11], pts[12]
        lh, rh = pts[23], pts[24]
        lk, rk = pts[25], pts[26]
        la, ra = pts[27], pts[28]
        lsv, rsv = vis[11], vis[12]
        lhv, rhv = vis[23], vis[24]
        lkv, rkv = vis[25], vis[26]
        lav, rav = vis[27], vis[28]
        vc = [lsv, rsv, lhv, rhv, lkv, rkv, lav, rav]

        # 解剖座標系：兩髖都要看得到才建得出來，建不出來就沒有「矢狀面／額狀面」可言
        frame = (anatomical_frame(lh, rh)
                 if (lhv > joint_thr and rhv > joint_thr) else None)

        # ── ① / ② 膝關節屈曲角（矢狀面）─────────────────────────────────
        if lhv > joint_thr and lkv > joint_thr and lav > joint_thr:
            fv[0] = knee_flexion_angle(lh, lk, la)
        if rhv > joint_thr and rkv > joint_thr and rav > joint_thr:
            fv[1] = knee_flexion_angle(rh, rk, ra)

        # ── ④ 大腿節段角＝蹲深（矢狀面，單側即可量）───────────────────────
        #   沿用 v4.8 的「自動選可見度較高那側」：斜後方拍攝時遠側腿被身體擋住
        #   （實測左腿 vis 0.44、右腿 0.97），寫死用左側等於拿最爛的資料算
        #   權重最高的指標。深度是單側就能量的東西，沒有理由固定用左邊。
        _h, _k, _hv, _kv = (lh, lk, lhv, lkv) if lhv + lkv >= rhv + rkv else (rh, rk, rhv, rkv)
        if _hv > joint_thr and _kv > joint_thr:
            fv[3] = thigh_segment_angle(_h, _k, frame)

        # ── ⑤ 雙側不對稱指數（以左右膝屈曲角計算）─────────────────────────
        if not np.isnan(fv[0]) and not np.isnan(fv[1]):
            fv[4] = asymmetry_index(fv[0], fv[1])

        # ── ③ 矢狀面軀幹傾角 ────────────────────────────────────────────
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            ms = (ls + rs) * 0.5
            mh = (lh + rh) * 0.5
            fv[2] = trunk_flexion_angle(mh, ms, frame)
            # ── ⑥ COM–BOS 側向偏移（額狀面）：還需要兩踝定義支撐底面 ──────
            if lav > body_thr and rav > body_thr:
                fv[5] = com_bos_lateral_offset(ms, mh, la, ra, frame)

        # ── ⑦ 膝內夾指數 VI = 1 − KASR（額狀面）─────────────────────────
        #   帶符號：正值 = 膝比踝窄（valgus 內夾）、負值 = 膝比踝寬（膝往外推／varus）。
        #   一個指標同時量得到兩種方向；要不要罰負值那一側由 metric_directions 決定。
        #   為什麼不是 FPPA：雙腳蹲到底時大腿接近水平，FPPA 在額狀面上退化
        #   （合成骨架實測會算出 NaN 或 −177°）。詳見 fppa_signed 的說明。
        if (lkv > joint_thr and rkv > joint_thr and lav > joint_thr
                and rav > joint_thr and lhv > joint_thr and rhv > joint_thr):
            fv[6] = valgus_index(lk, rk, la, ra, frame)
        return fv, vc
    return _run_pose_extraction(video_path, feature_fn, progress_cb,
                               frames=frames, frames_fps=frames_fps)

def _extract_deadlift(video_path, body_thr=0.70, joint_thr=0.60, progress_cb=None, view=None, frames=None, frames_fps=None):
    def feature_fn(pts, vis, state, fps):
        if 'com_hist' not in state: state['com_hist'] = deque(maxlen=max(1, int(fps/2)))
        fv = [np.nan]*7; vc = [0.0]*8
        ls, rs = pts[11], pts[12]
        lh, rh = pts[23], pts[24]
        lk, rk = pts[25], pts[26]
        la, ra = pts[27], pts[28]
        lw_, rw_ = pts[15], pts[16]
        lsv, rsv = vis[11], vis[12]
        lhv, rhv = vis[23], vis[24]
        lkv, rkv = vis[25], vis[26]
        lav, rav = vis[27], vis[28]
        lwv, rwv = vis[15], vis[16]
        vc = [lsv, rsv, lhv, rhv, lkv, rkv, lav, rav]
        
        if lsv > joint_thr and lhv > joint_thr and lkv > joint_thr:
            fv[0] = calculate_angle(ls, lh, lk)
        if rsv > joint_thr and rhv > joint_thr and rkv > joint_thr:
            fv[1] = calculate_angle(rs, rh, rk)
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            ms = mid(ls, rs)
            mh = mid(lh, rh)
            fv[2] = torso_lean_angle(mh, ms)
        # 【v4.6】gate 修正：本特徵公式使用 ls/lh/lk/la 四點，舊 gate 誤檢查手腕(lwv)
        #   而未檢查腳踝(lav)——腳踝被裁掉時會拿低可信座標算出雜訊。公式本身不變
        #  （與既有模板自洽）；幾何上更嚴謹的「肩至髖踝線距離」版本留待模板重建時導入。
        if lsv > joint_thr and lhv > joint_thr and lkv > joint_thr and lav > joint_thr:
            sh_v = ls - lh
            hip_v = lh - lk
            proj = np.dot(sh_v, hip_v) / (np.linalg.norm(hip_v)**2 + 1e-6)
            closest = la + proj * hip_v
            fv[3] = float(np.sqrt((ls[0]-closest[0])**2 + (ls[1]-closest[1])**2))
        if not np.isnan(fv[0]) and not np.isnan(fv[1]):
            fv[4] = abs(fv[0] - fv[1])
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            ms = mid(ls, rs)
            mh = mid(lh, rh)
            cx = (ms[0] + mh[0]) / 2
            state['com_hist'].append(cx)
            fv[5] = float(np.var(state['com_hist'])) if len(state['com_hist']) > 1 else 0.0
        if lwv > joint_thr and lsv > joint_thr:
            fv[6] = abs(lw_[0] - ls[0])
        return fv, vc
    return _run_pose_extraction(video_path, feature_fn, progress_cb,
                               frames=frames, frames_fps=frames_fps)

def _extract_bench_press(video_path, body_thr=0.60, joint_thr=0.50, progress_cb=None, view=None, frames=None, frames_fps=None):
    def feature_fn(pts, vis, state, fps):
        if 'wrist_y_hist' not in state: state['wrist_y_hist'] = deque(maxlen=3)
        fv = [np.nan]*7; vc = [0.0]*8
        ls, le, lw_ = pts[11], pts[13], pts[15]
        rs, re, rw_ = pts[12], pts[14], pts[16]
        lh, rh = pts[23], pts[24]
        lsv, rsv = vis[11], vis[12]
        lev, rev = vis[13], vis[14]
        lwv, rwv = vis[15], vis[16]
        lhv, rhv = vis[23], vis[24]
        vc = [lsv, rsv, lev, rev, lwv, rwv, lhv, rhv]
        
        if lsv > joint_thr and lev > joint_thr and lwv > joint_thr:
            fv[0] = calculate_angle(ls, le, lw_)
        if rsv > joint_thr and rev > joint_thr and rwv > joint_thr:
            fv[1] = calculate_angle(rs, re, rw_)
        # 【v4.8】Elbow Flare 改用「肩線」當參考，不再用「肩→髖」的軀幹向量。
        #   躺姿臥推時肩與髖幾乎同高，torso_v 又短又不穩，算出來的夾角是雜訊 ——
        #   實測「刻意肘外展接近 T 字」的 raw_loss（12.29）跟標準組（12.59）
        #   完全一樣，等於這個最高權重的指標對它該抓的錯誤毫無反應。
        #   肩線（左肩↔右肩）在躺姿下清楚穩定，是更好的參考軸：
        #     上臂與肩線夾角 ≈ 0°  → 手臂完全外展成 T 字（危險）
        #     上臂與肩線夾角 ≈ 90° → 上臂沿身體長軸、完全內收
        #   取 90 − 夾角 → 數值越大＝外展越多，配 lower_better。
        if lsv > body_thr and rsv > body_thr and lev > body_thr and rev > body_thr:
            sh_r = np.asarray(rs, dtype=float) - np.asarray(ls, dtype=float)   # 指向右肩
            if float(np.linalg.norm(sh_r)) > 1e-6:
                a_l = vector_angle_deg(np.asarray(le, dtype=float) - np.asarray(ls, dtype=float), -sh_r)
                a_r = vector_angle_deg(np.asarray(re, dtype=float) - np.asarray(rs, dtype=float), sh_r)
                if not (np.isnan(a_l) or np.isnan(a_r)):
                    fv[2] = 90.0 - (a_l + a_r) / 2.0
        # 【v4.8】fv[3] 手腕高度差 → 前臂與地面的夾角（Forearm Vertical，度）
        #   舊版 (le.y - lw.y) 只是「肘比腕高多少」的位移量，量綱是公尺、無法解讀，
        #   而且槓下放深淺就會影響它。教練實際看的是「前臂是否垂直地面」——
        #   槓在手掌正上方、前臂 90° 對地，力才會直上直下不外洩，握距過寬/過窄
        #   都會讓這個角度偏離 90°。pts 是 pose_world_landmarks（公尺、含 z 深度），
        #   y 軸即垂直軸，所以用 asin(|dy| / |v|) 直接得到與地面的仰角：
        #     90° = 前臂完全垂直（理想）、0° = 前臂平貼地面。
        # 【v5.1 重大修正】舊版用 3D 向量算 arcsin(|Δy| / |v|)，其中 |v| 含 z。
        #   問題有兩個，2026-07-27 兩次實測都指向同一件事：
        #
        #   ① **量錯了東西**：教練說的「前臂垂直地面」是**矢狀面**的檢查——
        #      從側面看，槓（手腕）要在手肘正上方，不能偏頭側或偏腳側。
        #      但正常臥推的手肘本來就會往身體兩側外展 45–75°，所以手肘在
        #      「左右方向」上一定離手腕有一段距離。舊公式把這個**正常的**
        #      左右位移也算成「不垂直」，於是每個人都量到 55–61°（理想 90°）：
        #        有經驗者 60.86° / 刻意錯 61.36° / 新手 56.77°
        #      ——連專家都差 30°，而且好壞完全分不開。那不是動作問題，是定義問題。
        #
        #   ② **用了鏡頭看不到的軸**：正側面 90° 拍攝時，左右方向正對鏡頭，
        #      完全落在 MediaPipe 的 z（單目深度推估）上，而 z 是最不可靠的一維。
        #      等於把最穩的兩軸(x,y)算出來的結果，拿最不穩的一軸去污染。
        #
        #   改成只在**影像平面**（x = 身體長軸、y = 垂直軸）算夾角，丟掉 z。
        #   這正好就是側面鏡頭最擅長、也是教練實際在看的那個角度。
        #
        #   另外改成**只取近側手臂**，不再左右平均：正側面下近臂會擋住遠臂
        #   （實測遠側 L Elbow 可見度 0.84、近側 R Elbow 0.99），
        #   平均等於把一條幻覺曲線混進一條好曲線裡。
        #   【v5.2 補正】v5.1 只丟掉 z 是不夠的。使用者指出的問題完全正確：
        #     「從側面看，如果手肘很內扣，前臂在矢狀面上**照樣是 90°**，
        #       但那正是握距太窄造成的錯誤動作。」
        #   幾何上確實如此——前臂偏離垂直有兩個獨立分量：
        #     · 矢狀分量（前後）：槓偏向頭側或腳側 → 正側面看得到
        #     · 額狀分量（左右）：手肘內扣/外開，前臂往內斜 → 正側面**完全看不到**
        #   而握距影響的主要是**額狀分量**。所以正側面能驗證的只有一半，
        #   另一半必須從正上方俯視看。
        #
        #   實測佐證（底部相位，標準 vs 刻意錯窄握）：
        #     Forearm Vertical（舊 3D 公式）  52.10° vs 52.44°  → Δ0.33，分不開
        #     Grip Width                      2.781  vs 2.393   → Δ0.39，抓得到
        #   也就是說在正側面，這個錯誤的訊號是跑到 Grip Width 上，不在前臂角度上。
        #
        #   解法：依機位計算**不同的分量**，並在 measurability 表裡標明
        #   兩者不可互相比較（所以模板與受測影片必須同機位）。
        #   【v9.2】上面那套「依機位挑世界座標軸」的作法有一個沒被發現的假設：
        #   它假定 x = 身體長軸、y = 垂直、z = 左右。實測推翻了這個假設 ——
        #   三支俯視影片的肩線分量是 |x|=0.007、|y|=0.345、|z|=0.024，
        #   內外側其實落在 y，因為 pose_world_landmarks 跟著**影像**方向走，
        #   手機怎麼拿就怎麼轉。所以改用 bench_frame() 由受測者自己算出來的
        #   ê_ml / ê_long / ê_ap，與手機握持方向無關。分量的選法不變：
        #   正側面看矢狀分量、俯視看額狀分量，兩者仍然不可互比。
        _bf = bench_frame(ls, rs, lh, rh) if (lsv > body_thr and rsv > body_thr
                                              and lhv > body_thr and rhv > body_thr) else None
        if _bf is not None and lev > joint_thr and lwv > joint_thr and rev > joint_thr and rwv > joint_thr:
            _ml, _lon, _ap = _bf
            _sagittal = view in (None, measurability.VIEW_SAGITTAL_90)
            _plane = _lon if _sagittal else _ml
            a_l = forearm_verticality(lw_, le, _plane, _ap)
            a_r = forearm_verticality(rw_, re, _plane, _ap)
            if _sagittal:
                # 正側面：近臂擋遠臂（實測遠側可見度 0.84 vs 近側 0.99），
                # 取可見度較高的那一側，不做左右平均
                if lwv + lev >= rwv + rev:
                    fv[3] = a_l if not np.isnan(a_l) else a_r
                else:
                    fv[3] = a_r if not np.isnan(a_r) else a_l
            else:
                # 正上方/正面：兩手都看得到，取平均才抓得到「單邊內扣」
                if not (np.isnan(a_l) or np.isnan(a_r)):
                    fv[3] = (a_l + a_r) / 2.0
                else:
                    fv[3] = a_l if not np.isnan(a_l) else a_r
        if not np.isnan(fv[0]) and not np.isnan(fv[1]):
            fv[4] = abs(fv[0] - fv[1])
        # 【v9.2】槓路徑改成沿 ê_ap（槓真正的行程方向）取變異，不再用世界座標 y。
        #   理由同上：世界 y 不保證是行程方向。此指標權重本來就是 0
        #   （實測單項分數均值 99.2、sd 0.6，零鑑別度），改這裡只是為了幾何一致。
        if lwv > joint_thr and rwv > joint_thr:
            if _bf is not None:
                wy = float(np.dot((np.asarray(lw_, float) + np.asarray(rw_, float)) * 0.5, _bf[2]))
            else:
                wy = (lw_[1] + rw_[1]) / 2.0
            state['wrist_y_hist'].append(wy)
            fv[5] = float(np.var(state['wrist_y_hist'])) if len(state['wrist_y_hist']) > 1 else 0.0
        # 【v4.8】fv[6] 肩髖高度差符號（Body Line，權重 0.06）→ 握距/肩寬比（Grip Width）
        #   舊 Body Line 只是 ±1 的指示訊號，權重 0.06、幾乎不影響總分，資訊量極低。
        #   換成握距：世界座標下的腕距 ÷ 肩距，是無單位比值 → 不受身高與鏡頭距離影響。
        #   典型臥推握距約 1.5–2.0 倍肩寬；過窄(<1.3)或過寬(>2.2)都會連帶把前臂
        #   推離垂直，是 Forearm Vertical 的「成因指標」，兩者一起看才講得出怎麼修。
        # 【v9.2】改成沿 ê_ml 投影，與深蹲的 KASR、Stability 用同一套幾何
        #   （內外側的量一律投影到內外側軸）。
        #   ⚠️ 誠實註記：這**不是**為了修正俯視握距不穩。2026-08-30 把三支俯視
        #   影片重跑 MediaPipe，直接用原始 landmark 把握距用四種幾何各算一遍
        #   （3D 距離比 / 沿肩線投影 / 丟 z / 丟 x），單支影片內 CV 分別是
        #   0.156 / 0.156 / 0.157 / 0.156 —— **幾乎完全一樣，改公式沒有用**。
        #   真正的不穩來自姿態模型本身：分母肩寬 CV 只有 1.8–3.2%，變異全在
        #   分子腕距（CV 10.8–15.1%），而且 corr(量到的握距, 肘角) = +0.59~+0.79，
        #   手臂一伸直 MediaPipe 就把兩腕估開。手固定在槓上、真實握距是常數，
        #   所以那是模型在動作行程中的系統性偏移，不是我們的公式。
        #   這裡改投影純粹是為了**幾何定義一致**，不宣稱會變準。
        if lsv > body_thr and rsv > body_thr and lwv > joint_thr and rwv > joint_thr:
            sh_v = np.asarray(ls, dtype=float) - np.asarray(rs, dtype=float)
            sh_w = float(np.linalg.norm(sh_v))
            if np.isfinite(sh_w) and sh_w > 1e-6:
                e_ml = sh_v / sh_w
                wr_v = np.asarray(lw_, dtype=float) - np.asarray(rw_, dtype=float)
                fv[6] = abs(float(np.dot(wr_v, e_ml))) / sh_w
        return fv, vc
    return _run_pose_extraction(video_path, feature_fn, progress_cb,
                               frames=frames, frames_fps=frames_fps)

def _extract_overhead_press(video_path, body_thr=0.75, joint_thr=0.60, progress_cb=None, view=None, frames=None, frames_fps=None):
    def feature_fn(pts, vis, state, fps):
        if 'com_hist' not in state: state['com_hist'] = deque(maxlen=max(1, int(fps/2)))
        fv = [np.nan]*7; vc = [0.0]*8
        ls, le, lw_ = pts[11], pts[13], pts[15]
        rs, re, rw_ = pts[12], pts[14], pts[16]
        lh, rh = pts[23], pts[24]
        lsv, rsv = vis[11], vis[12]
        lev, rev = vis[13], vis[14]
        lwv, rwv = vis[15], vis[16]
        lhv, rhv = vis[23], vis[24]
        vc = [lsv, rsv, lev, rev, lwv, rwv, lhv, rhv]
        
        if lsv > joint_thr and lev > joint_thr and lwv > joint_thr:
            fv[0] = calculate_angle(ls, le, lw_)
        if rsv > joint_thr and rev > joint_thr and rwv > joint_thr:
            fv[1] = calculate_angle(rs, re, rw_)
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            ms = mid(ls, rs)
            mh = mid(lh, rh)
            fv[2] = torso_lean_angle(mh, ms)
        if lev > joint_thr and lwv > joint_thr and rev > joint_thr and rwv > joint_thr:
            fv[3] = ((le[0] - lw_[0]) + (re[0] - rw_[0])) / 2.0
        if not np.isnan(fv[0]) and not np.isnan(fv[1]):
            fv[4] = abs(fv[0] - fv[1])
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            ms = mid(ls, rs)
            mh = mid(lh, rh)
            cx = (ms[0] + mh[0]) / 2
            state['com_hist'].append(cx)
            fv[5] = float(np.var(state['com_hist'])) if len(state['com_hist']) > 1 else 0.0
        if lwv > joint_thr and rwv > joint_thr and lsv > body_thr and rsv > body_thr:
            hand_w = abs(lw_[0] - rw_[0])
            sh_w = abs(ls[0] - rs[0]) + 1e-6
            fv[6] = hand_w / sh_w
        return fv, vc
    return _run_pose_extraction(video_path, feature_fn, progress_cb,
                               frames=frames, frames_fps=frames_fps)

def _extract_barbell_row(video_path, body_thr=0.70, joint_thr=0.60, progress_cb=None, view=None, frames=None, frames_fps=None):
    def feature_fn(pts, vis, state, fps):
        if 'com_hist' not in state: state['com_hist'] = deque(maxlen=max(1, int(fps/2)))
        fv = [np.nan]*7; vc = [0.0]*8
        ls, le, lw_ = pts[11], pts[13], pts[15]
        rs, re, rw_ = pts[12], pts[14], pts[16]
        lh, rh = pts[23], pts[24]
        lsv, rsv = vis[11], vis[12]
        lev, rev = vis[13], vis[14]
        lwv, rwv = vis[15], vis[16]
        lhv, rhv = vis[23], vis[24]
        vc = [lsv, rsv, lev, rev, lwv, rwv, lhv, rhv]
        
        if lsv > joint_thr and lev > joint_thr and lwv > joint_thr:
            fv[0] = calculate_angle(ls, le, lw_)
        if rsv > joint_thr and rev > joint_thr and rwv > joint_thr:
            fv[1] = calculate_angle(rs, re, rw_)
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            ms = mid(ls, rs)
            mh = mid(lh, rh)
            fv[2] = torso_lean_angle(mh, ms)
        if lev > joint_thr and lwv > joint_thr and rev > joint_thr and rwv > joint_thr:
            fv[3] = ((le[1] - lw_[1]) + (re[1] - rw_[1])) / 2.0
        if not np.isnan(fv[0]) and not np.isnan(fv[1]):
            fv[4] = abs(fv[0] - fv[1])
        if lsv > body_thr and rsv > body_thr and lhv > body_thr and rhv > body_thr:
            ms = mid(ls, rs)
            mh = mid(lh, rh)
            cx = (ms[0] + mh[0]) / 2
            state['com_hist'].append(cx)
            fv[5] = float(np.var(state['com_hist'])) if len(state['com_hist']) > 1 else 0.0
        if lwv > joint_thr and rwv > joint_thr and lsv > body_thr and rsv > body_thr:
            hand_w = abs(lw_[0] - rw_[0])
            sh_w = abs(ls[0] - rs[0]) + 1e-6
            fv[6] = hand_w / sh_w
        return fv, vc
    return _run_pose_extraction(video_path, feature_fn, progress_cb,
                               frames=frames, frames_fps=frames_fps)


# ═══════════════════════════════════════════════════════════════════════════════
# EXERCISE CONFIGS
# ═══════════════════════════════════════════════════════════════════════════════

EXERCISE_CONFIGS = {

    "lat_pulldown": {
        "name": "滑輪下拉  Lat Pulldown",
        "name_zh": "滑輪下拉",
        "name_en": "Lat Pulldown",
        "icon": "🔵",
        "extract_fn": _extract_lat_pulldown,
        # 【v4.6 信任度修正】fv[6] 實際為「左右前臂長度差/肩寬」＝把手左右高低
        #   （桿面傾斜），並非聳肩——聳肩需要肩耳距離，單靠現有點位測不到，
        #   據實改名 Bar Tilt 並調整權重，不再給出錯誤的「聳肩」教練建議。
        "metric_labels": ["L Elbow", "R Elbow", "Torso Lean", "Tempo", "Elbow Sym", "Stability", "Bar Tilt"],
        "segment_signal_idx": "avg_elbow", "segment_invert": False,
        "segment_prominence": 15, "min_rep_sec": 1.2,
        "body_thr": 0.55, "joint_thr": 0.65,
        # 軀幹用慣性 = 最常見錯誤；桿面水平反映左右發力
        "scoring_weights": np.array([0.15, 0.15, 0.28, 0.05, 0.12, 0.10, 0.15]),
        "scoring_scales":  [1, 1, 1, 2000, 2, 10000, 300],
        "preferred_view": "front",
        "ar_mode": "upper",
        "tips": {
            "L Elbow":    ("左臂幅度",        "左手肘下拉幅度不足，闊背刺激會打折。",
                                              "下拉時想著「把手肘往口袋夾」，肘尖要到肋骨下緣。"),
            "R Elbow":    ("右臂幅度",        "右手肘下拉幅度不足，左右刺激不平均。",
                                              "對齊左邊：肘尖夾到肋骨下緣，胸口往橫桿迎上去。"),
            "Torso Lean": ("軀幹後仰",        "向後仰角度過大，變成用體重盪重量。",
                                              "胸口立起來，最多後仰 15°，靠闊背把手肘拉下而不是身體拉下。"),
            "Tempo":      ("動作節奏",        "節奏太快或忽快忽慢，離心控制不夠。",
                                              "下拉 1 秒、停半秒夾背、上升 2 秒慢慢放，肌肉時間下會大幅提升。"),
            "Elbow Sym":  ("左右對稱",        "兩邊手肘下拉幅度差太多，會養成單邊代償。",
                                              "對著鏡子練；強的那邊主動收力慢一點，等弱邊跟上。"),
            "Stability":  ("身體穩定",        "上半身有側向晃動，核心沒鎖住。",
                                              "屁股完全坐死椅墊、雙膝勾穩護膝墊，先把下盤焊住再拉。"),
            "Bar Tilt":   ("桿面水平",        "下拉時左右手高低不一致，桿子是斜的，弱邊被強邊帶著走。",
                                              "對著鏡子拉，想著「兩手同時碰到鎖骨高度」；不行就先減重找回左右同步。"),
        },
    },

    "squat": {
        "name": "深蹲  Squat",
        "name_zh": "深蹲",
        "name_en": "Squat",
        "icon": "🟢",
        "extract_fn": _extract_squat,
        "metric_labels": ["L Knee", "R Knee", "Torso Lean", "Hip Depth", "Knee Sym", "Stability", "Knee Valgus"],
        # 【v5.8】寫死 R Knee → auto_bilateral：正側面時遠側腿被軀幹擋住，
        #   實測 R Knee 動態範圍 0°。改成自動挑看得到的那側。
        "segment_signal_idx": "auto_bilateral", "segment_invert": False,
        "segment_prominence": 20, "min_rep_sec": 1.5,
        # 【v5.2】底部加權：深蹲的錯誤（蹲不夠深、軀幹在底部垮掉）本質上就
        #   發生在最深點附近，頂端站直那段做對做錯的人長得一樣。
        #   實測掃描 0→0.85：d 從 8.39 升到 9.78，0.3–0.85 是一片平原，
        #   取中段避免對 n=5 的樣本過擬合。
        "phase_emphasis": 0.55,
        # 【v4.8】0.60/0.65 → 0.50/0.50：實測斜後方 45° 拍攝時，遠側（左）髖與
        #   腳踝的 visibility 常落在 0.5–0.65，整條左腿被 gate 掉 → L Knee /
        #   Hip Depth / Knee Sym / Knee Valgus 四欄同時全 NaN（3 支影片如此）。
        #   點位其實是準的，只是模型對背面視角信心低。
        "body_thr": 0.50, "joint_thr": 0.50,
        # v4.4 重新加權：深度 + 軀幹角度 + 膝內塌（安全/品質）= 重點
        # 【v4.6】Hip Depth 尺度 10→40：fv[3] 為 ±1 過平行指示訊號，
        #   尺度 10 時「整下都沒蹲到平行」只扣個位數分，過鬆；40 使其有實質鑑別度。
        # 【v4.8 權重重配】教練看深蹲的優先序：蹲夠深(有效) > 膝不內夾(安全)
        #   > 軀幹別垮(安全) > 左右對稱 > 單側膝角。左右膝角本來就與蹲深高度相關，
        #   給它們 0.12×2 等於把「深度」重複計了三次，稀釋掉膝內塌的話語權。
        #   ["L Knee","R Knee","Torso Lean","Hip Depth","Knee Sym","Stability","Knee Valgus"]
        # 【v5.3 收斂】依 2026-07-27 的指標子集分析重配（見診斷報告「每個動作該用幾個指標」）。
        #   窮舉所有子集 + 留一驗證的結果：
        #     1 個 (Torso Lean)              d = 9.44
        #     2 個 (Torso Lean + Hip Depth)  d = 9.78  ← 最佳
        #     3 個 (+ R Knee)                d = 8.20  ← 反而變差
        #   相關矩陣顯示 R Knee / Torso Lean / Hip Depth 彼此相關 0.54–0.75，
        #   主成分特徵值 [2.46, 0.93, 0.44, 0.16] → 四個指標只有 **1 個獨立維度**。
        #   它們都在測「蹲得夠不夠深」的不同面向，多放一個只是加雜訊。
        #
        #   所以：Hip Depth + Torso Lean 拿走主要權重；
        #   R Knee / L Knee / Knee Sym 降到象徵性權重（保留是為了給教練回饋
        #   文案有東西可講，不是為了鑑別）；
        #   Knee Valgus 維持 0.22 —— 它是唯一與 Torso Lean **不相關**（r=0.10）
        #   的方向，是第二個獨立維度的唯一來源。它在斜前方 45° 量不準，
        #   但 measurability 的機位 gating 會自動處理，權重會被釋出重新正規化。
        #   ["L Knee","R Knee","Torso Lean","Hip Depth","Knee Sym","Stability","Knee Valgus"]
        "scoring_weights": np.array([0.05, 0.05, 0.28, 0.32, 0.03, 0.05, 0.22]),
        # 【v5.3】左右成對的指標：正側面拍攝時遠側肢體是幻覺點位
        #   （實測遠側 L Knee 動態範圍只有 12°，近側 R Knee 是 76°）。
        #   score_rep 會依可見度只留近側，並把成對的權重合併過去。
        "bilateral_pairs": [("L Knee", "R Knee")],
        # ⚠️【v9.0】以下這段是 v4.8 的歷史紀錄，描述的是**舊公式**的值域與尺度校準：
        #     舊 Hip Depth    = (髖.y−膝.y)/大腿長，值域 −0.9 站直 → 0 平行
        #     舊 Knee Valgus  = (踝距−膝距)/髖寬
        #   新公式的單位已經完全不同（大腿節段角 deg、膝內夾指數 1−KASR），
        #   所以下面這些「扣幾分」的校準數字**不再適用**，保留只為追溯改動理由。
        #   現行計分不吃 scoring_scales，走 z-score（偏差 ÷ 教練自身重複性）。
        # 【v9.0】scoring_scales 只有舊的 _piecewise_score 路徑會用到；現行計分走
        #   z-score（偏差 ÷ 教練自身重複性）不吃這組魔術數字。改公式後單位全變了
        #   （比值 → 度／百分比），舊尺度已無意義，保留只為讓沒有 tpl_dev 的
        #   舊模板還能載入。新模板一律走 z-score 路徑。
        "scoring_scales":  [1, 1, 2, 150, 2, 10000, 120],
        # 【v9.0】方向依「國際標準定義」重設。注意 L/R Knee 反轉了——
        #   舊版存的是 ∠(髖,膝,踝)（伸直≈180°、越彎越小）所以是 lower_better；
        #   現在存的是**膝屈曲角**（伸直 0°、越彎越大），與文獻一致，
        #   自然變成 higher_better。忘了改這裡的話，最該扣分的「蹲不夠深」
        #   會變成加分，而且從總分上完全看不出來。
        "metric_directions": {
            "L Knee": "higher_better",     # 膝屈曲角越大＝蹲越深
            "R Knee": "higher_better",
            # ⚠️ Torso Lean 不能用單向：軀幹「過度直立」在深蹲同樣是錯的
            #   （重心後移、蹲不下去）。實測新手因為蹲很淺、身體挺得筆直，
            #   傾角比模板小 → 白賺滿分，這正是新手贏過有經驗者的來源之一。
            "Torso Lean": "both",
            "Hip Depth": "higher_better",  # 節段角越大＝髖越低＝蹲越深（0° = 平行）
            "Knee Sym": "lower_better",    # 不對稱指數 0% = 完全對稱，越大越差
            "Stability": "lower_better",   # COM–BOS 偏移 0% = 質心對準底面中心
            # 帶符號 FPPA：正值＝valgus 內夾（本研究誘發的錯誤）才扣分。
            # 想同時抓 varus 膝外翻改成 "both" 即可——指標本身已經帶符號，
            # 兩種錯誤都量得到，這裡只是決定「要不要罰另一邊」。
            "Knee Valgus": "lower_better",
        },
        # 【v4.7】FPPA 屬額狀面指標，只有正面/斜前視角看得到；
        #   側面拍攝模式下強制不計分（見 score_rep），避免幻覺點位產生假分數。
        "front_only_metrics": ["Knee Valgus"],
        # 【v9.0】每個指標的國際標準定義（名稱／公式／單位／landmarks／解剖面）。
        #   會被寫進分析結果 JSON 的 metricStandards，海報圖與口試小抄直接讀，
        #   不必再從程式碼人工抄一次公式。
        "metric_standards": SQUAT_METRIC_STANDARDS,
        "preferred_view": "side",
        "ar_mode": "lower",
        "tips": {
            "L Knee":     ("左膝幅度",        "左膝彎曲幅度不夠，左腿沒蹲到位。",
                                              "下蹲到大腿與地面平行，膝蓋朝腳尖方向推，不要往內夾。"),
            "R Knee":     ("右膝幅度",        "右膝彎曲幅度不夠，可能腳踝偏緊。",
                                              "對齊左腿；若做不到，先做 5 分鐘小腿與腳踝放鬆。"),
            "Torso Lean": ("軀幹直立",        "上半身前傾太多，容易變早安蹲。",
                                              "胸口挺住、目視前方；腳踝若卡，可墊一塊 2cm 的小鐵片在腳跟下。"),
            "Hip Depth":  ("蹲深",            "大腿還沒下到與地面平行（節段角 < 0°），沒打到目標肌群。",
                                              "想著「屁股往後椅子坐」，髖摺疊低於膝蓋頂線才算 Below Parallel。"),
            "Knee Sym":   ("左右對稱",        "左右膝屈曲角差異超過對稱容忍範圍。",
                                              "可能有骨盆側移；補做單腳分腿蹲 (Bulgarian Split Squat) 修對稱。"),
            "Stability":  ("重心置中",        "重心偏離兩腳中線，站不穩。",
                                              "雙腳寬於肩、腳尖外開 15-30°，全程把重心壓在兩腳掌中心之間。"),
            "Knee Valgus":("膝蓋內塌 ⚠",       "膝間距比踝間距窄（X 型腿），韌帶風險很高。",
                                              "下蹲時主動「把膝蓋往外推」到與腳掌同寬，配合臀中肌訓練：蚌殼式、彈力帶側走。"),
        },
    },

    "deadlift": {
        "name": "硬舉  Deadlift",
        "name_zh": "硬舉",
        "name_en": "Deadlift",
        "icon": "🟡",
        "extract_fn": _extract_deadlift,
        "metric_labels": ["Hip Hinge", "L Knee", "R Knee", "Back Flat", "Knee Sym", "Stability", "Bar Path"],
        "segment_signal_idx": 0, "segment_invert": False,
        "segment_prominence": 25, "min_rep_sec": 1.8,
        # 硬舉的高風險錯誤（圓背）發生在起槓那一瞬間，跟深蹲同理 → 加權底部
        "phase_emphasis": 0.5,
        "body_thr": 0.55, "joint_thr": 0.65,
        # v4.4 重新加權：脊椎中立 = 最高（避免下背受傷）；其次 Hip Hinge
        "scoring_weights": np.array([0.22, 0.10, 0.10, 0.25, 0.10, 0.08, 0.15]),
        "scoring_scales":  [1, 1, 1, 500, 2, 10000, 200],
        "preferred_view": "side",
        "ar_mode": "full",
        "tips": {
            "Hip Hinge":  ("髖鉸鏈",          "髖部沒先推回去，變成用蹲的硬拉。",
                                              "起始時想「屁股先碰後面的牆」，讓桿到膝蓋時上身約 45° 前傾。"),
            "L Knee":     ("左膝軌跡",        "左膝向前推太多，重量分配跑到腿。",
                                              "保持小腿垂直；用力推地板而不是拉桿子，硬舉是地板推不是手拉。"),
            "R Knee":     ("右膝軌跡",        "右膝軌跡不穩。",
                                              "對齊左腿，兩腳均勻推地，桿子才會直線上升。"),
            "Back Flat":  ("脊椎中立 ⚠",       "下背圓背！這是最高風險的錯誤動作。",
                                              "立刻減重 20%。起槓前先吸氣憋住、把背闊肌往後夾，整個軀幹像一塊鋼板再拉。"),
            "Knee Sym":   ("兩腿出力對稱",     "左右腿出力不均，骨盆有偏移。",
                                              "對著鏡子或從正前方拍；補做羅馬尼亞分腿硬舉修弱邊。"),
            "Stability":  ("身體穩定",        "起拉時身體側移或晃動。",
                                              "雙腳壓力對半分；桿子離地的瞬間，全身像被人從頭往上拉一條繩子。"),
            "Bar Path":   ("槓鈴路徑",        "槓鈴沒貼著身體，畫了 S 型。",
                                              "槓子從頭到尾貼著小腿、大腿往上滑，可以穿高襪保護脛骨。"),
        },
    },

    "bench_press": {
        "name": "臥推  Bench Press",
        "name_zh": "臥推",
        "name_en": "Bench Press",
        "icon": "🔴",
        "extract_fn": _extract_bench_press,
        # 【v4.6 信任度修正】fv[6] 原為「肩髖高度差之正負號」（Body Line），資訊量低。
        # 【v4.8 力學補強】改成教練實際會看的兩件事：
        #   fv[3] Forearm Vertical — 前臂與地面夾角（度），理想 90°（前臂垂直、力直上直下）
        #   fv[6] Grip Width      — 腕距/肩寬比（無單位），握距是前臂角度的「成因」，
        #                            過窄→肘內收、過寬→肘外展，兩者一起看才講得出怎麼修。
        "metric_labels": ["L Elbow", "R Elbow", "Elbow Flare", "Forearm Vertical", "Elbow Sym", "Bar Path", "Grip Width"],
        # 【v4.8】主訊號 L Elbow(0) → "avg_elbow"（左右肘平均）。
        #   實測單看左肘：可見度只有 0.71、動作幅度被透視壓縮到 30–47°
        #   （正常臥推肘角應該有 80–110°），死區絕對值只剩約 10°，
        #   骨架抖 ±5° 就誤觸發 → 5 下被切成 6–7 下。取雙肘平均可抵銷單側雜訊。
        # min_rep_sec 1.0 → 1.5：一下臥推不可能少於 1.5 秒，這道時間閘
        #   直接擋掉「14 幀 / 32 幀」那種假 rep（實測確實出現過）。
        # 【v5.8】avg_elbow → auto_bilateral：正側面拍臥推一定有一隻手被另一隻擋住，
        #   雙手平均等於把真訊號和幻覺訊號相加、振幅腰斬（實測 5 下切成 2 下）。
        #   改成自動挑「健康且活動範圍大」的那一側。
        "segment_signal_idx": "auto_bilateral", "segment_invert": False,
        "segment_prominence": 12, "min_rep_sec": 1.5,
        # 【v5.2】臥推**不加權**。實測掃描 emphasis 0→0.85，Cohen's d 從 2.05
        #   單調掉到 1.41 —— 臥推的錯誤（肘外展、握距過窄）是整個行程都存在的
        #   姿勢問題，不像深蹲的「蹲不夠深」集中在底部。把注意力壓到底部
        #   只會丟掉其他幀的資訊。
        "phase_emphasis": 0.0,
        "body_thr": 0.45, "joint_thr": 0.55,
        # 肘外展角度（避免肩傷）仍為首要；前臂垂直度接手第二順位
        # 【v4.8 權重重配】肘外展是肩傷主因，握距是它的成因，兩者一起加重。
        #   ["L Elbow","R Elbow","Elbow Flare","Forearm Vertical","Elbow Sym","Bar Path","Grip Width"]
        # 【v5.3 收斂】子集分析 + 留一驗證：
        #     1 個 (Grip Width)                              d = 2.66
        #     2 個 (+ Forearm Vertical)                      d = 2.89
        #     3 個 (+ Elbow Flare)                           d = 3.79  ← 最佳
        #     4 個 (+ R Elbow)                               d = 2.51  ← 反而變差
        #   主成分特徵值 [1.55, 1.26, 0.86, 0.33] → 4 個指標有 **2 個獨立維度**
        #   （R Elbow ↔ Forearm Vertical 相關 0.52 屬同一組；
        #     Elbow Flare 與 Grip Width 各自獨立）。3 個指標剛好撐滿。
        #   Bar Path 權重歸零：實測 sub_score 平均 99.2、sd 0.6、100% ≥95，零鑑別度。
        #   ["L Elbow","R Elbow","Elbow Flare","Forearm Vertical","Elbow Sym","Bar Path","Grip Width"]
        "scoring_weights": np.array([0.11, 0.11, 0.26, 0.22, 0.04, 0.00, 0.26]),
        # 正側面拍攝時近臂完全擋住遠臂（實測遠側可見度 0.84 / 近側 0.99，
        # 遠側肘角在底部讀到 109.8°，離解剖標準 90° 差 20°；近側讀到 92.0°，只差 2°）
        "bilateral_pairs": [("L Elbow", "R Elbow")],
        # 【v4.8】方向性：肘角用 lower_better 是刻意的取捨 —— 罰「沒下放到胸」
        #   （半程推，肘角在底部偏大），但不罰「下放更深」。頂端沒鎖死會漏掉，
        #   由完整週期判定（要升破 65% 才算完成一次）兜底。
        "metric_directions": {
            "L Elbow": "lower_better",
            "R Elbow": "lower_better",
            "Elbow Flare": "lower_better",  # 改用肩線後：數值越大＝外展越多＝越傷肩
            "Forearm Vertical": "higher_better",  # 越接近 90°（垂直）越好
            "Elbow Sym": "both",            # 對稱性是雙邊
            "Bar Path": "lower_better",
            "Grip Width": "both",           # 過寬過窄都會讓前臂推離垂直
        },
        # Forearm Vertical 已是度數 → scale 1.5（偏離 15° 約扣 15 分、30° 約扣 34 分）
        # Grip Width 是比值（典型 1.5–2.0）→ scale 50（握距差 0.5 倍肩寬約扣 21 分）
        # Elbow Flare 多外展 30°：1→78.3 分，1.5→65.6 分（肩傷風險該罰重一點）
        "scoring_scales":  [1, 1, 1.5, 1.5, 2, 5000, 50],
        # 握距屬額狀面資訊：真正的正側面拍攝會讓遠側手腕被近側擋住 → 側面模式不計分。
        # （本次研究用「側斜前上方俯角」，兩手都看得到，測試模式送 is_side_view=false）
        "front_only_metrics": ["Grip Width"],
        "preferred_view": "side",
        "ar_mode": "upper",
        "tips": {
            "L Elbow":         ("左肘幅度",      "左手肘沒下到底，胸肌沒完整伸展。",
                                                  "槓子要碰到胸骨下緣（乳頭位置）；上面要把手肘完全鎖死。"),
            "R Elbow":         ("右肘幅度",      "右手肘下降幅度不夠。",
                                                  "對齊左邊，可能是右肩活動度較差，加強胸肌與肩關節伸展。"),
            "Elbow Flare":     ("肘外展角度 ⚠",   "手肘外展太開（90°+），肩關節壓力過大、容易夾擠受傷。",
                                                  "想像「夾住一支鉛筆」把上臂往身體收一點，理想是 45-75° 之間。"),
            "Forearm Vertical": ("前臂垂直 ⚠",   "下放到底時前臂沒有垂直地面，力量往前或往後洩掉、手腕吃力。",
                                                  "槓要落在手腕正下方、前臂對地 90°；做不到通常是握距不對或槓下放位置太高/太低。"),
            "Elbow Sym":       ("左右對稱",      "兩邊推力不平均，槓子歪一邊。",
                                                  "從頭頂方向拍影片檢查；單邊弱的可以補單手啞鈴推。"),
            "Bar Path":        ("槓鈴路徑",      "槓鈴沒走出胸口→額頭的弧線，路徑不順。",
                                                  "下放時槓子到胸骨下緣，推上去時讓槓往臉的方向斜推，不要直上直下。"),
            "Grip Width":      ("握距",          "握距偏離標準，連帶讓前臂推不到垂直、肩關節角度也跟著跑掉。",
                                                  "先量：槓下放到胸口時前臂要對地 90°。太窄會夾肘、太寬會讓肩外展過大；"
                                                  "從約 1.5–2 倍肩寬開始微調，找到前臂垂直的那個位置就固定下來。"),
        },
    },

    "overhead_press": {
        "name": "肩推  Overhead Press",
        "name_zh": "肩推",
        "name_en": "Overhead Press",
        "icon": "🟠",
        "extract_fn": _extract_overhead_press,
        # 【v4.6 信任度修正】標籤/尺度對齊「實際計算的特徵」：
        #   fv[3] = 左右前臂水平偏移平均（肘x−腕x）→ Forearm Vertical
        #   fv[4] = 左右肘角差 → Elbow Sym
        #   fv[5] = 重心X變異數 → Stability（score_rep 自動列入次要扣分項）
        #   fv[6] = 握距/肩寬比 → Grip Width
        #   舊版標籤(L/R Overhead…)與 fv 順序錯位，且尺度配錯欄位：
        #   變異數(≈1e-4)配 scale 2 → 永遠滿分；比值(≈2)配 scale 10000 → 永遠 30 分地板。
        #   僅改「比對期」參數（標籤/尺度/提示），模板 npz 不受影響、無須重建。
        "metric_labels": ["L Elbow", "R Elbow", "Torso Lean", "Forearm Vertical", "Elbow Sym", "Stability", "Grip Width"],
        "segment_signal_idx": 0, "segment_invert": True,
        "segment_prominence": 15, "min_rep_sec": 1.2,
        "body_thr": 0.65, "joint_thr": 0.70,
        # 背過度後仰（高風險）為首要；前臂垂直為推舉效率關鍵
        "scoring_weights": np.array([0.14, 0.14, 0.24, 0.16, 0.14, 0.08, 0.10]),
        "scoring_scales":  [1, 1, 1, 300, 2, 10000, 50],
        "preferred_view": "front",
        "ar_mode": "upper",
        "tips": {
            "L Elbow":     ("左肘鎖死",        "左手沒完全推到頂，三頭肌沒鎖死。",
                                              "推到頂時手肘完全打直，耳朵應該被手臂稍微擋住。"),
            "R Elbow":     ("右肘鎖死",        "右手沒推到鎖死，可能三頭較弱。",
                                              "對齊左邊；若卡住，可以單獨補 Skullcrusher 練三頭。"),
            "Torso Lean":  ("軀幹後仰 ⚠",      "推的過程身體往後仰太多，下背承受巨大壓力。",
                                              "肋骨往下拉、屁股夾緊把骨盆後傾，重量推不上去就減 5kg，不要用腰代償。"),
            "Forearm Vertical": ("前臂垂直",   "推的過程手腕沒有疊在手肘正上方，力量傳遞打折、手腕吃力。",
                                              "想像前臂是一條垂直電梯軌道；握距先調到小臂自然垂直的位置再推。"),
            "Elbow Sym":   ("左右同步",        "兩邊推上去時間差太多或幅度不一。",
                                              "節奏想著「同時離槓、同時鎖死」；若卡，減重練協調再加重。"),
            "Stability":   ("下盤穩定",        "推時身體左右晃，下盤沒鎖死。",
                                              "雙腳與肩同寬、屁股夾緊、腳趾抓地，下盤要像水泥灌進去一樣。"),
            "Grip Width":  ("握距一致",        "握距與標準示範差異較大，會改變推舉路徑與肩膀壓力。",
                                              "握距約肩寬 1.1〜1.3 倍：小臂垂直地面、手肘自然在身體斜前方。"),
        },
    },

    "barbell_row": {
        "name": "划船  Barbell Row",
        "name_zh": "划船",
        "name_en": "Barbell Row",
        "icon": "🟣",
        "extract_fn": _extract_barbell_row,
        # 【v4.6 信任度修正】標籤/尺度對齊「實際計算的特徵」：
        #   fv[3] = 肘腕垂直差平均（拉桿幅度/公尺）→ Pull Depth
        #   fv[5] = 重心X變異數 → Stability（score_rep 自動列入次要扣分項）
        #   fv[6] = 握距/肩寬比 → Grip Width
        #   舊版把公尺量配 scale 5000（永遠 30 分紅字）、變異數配 300（永遠滿分、
        #   「聳肩」從不警示）、比值配 10000（永遠 30 分）——雷達圖與提示皆失真。
        #   後端extractor並未實際量測髖部高度與聳肩，據實移除該兩標籤。
        "metric_labels": ["L Elbow", "R Elbow", "Torso Hinge", "Pull Depth", "Elbow Sym", "Stability", "Grip Width"],
        "segment_signal_idx": 0, "segment_invert": False,
        "segment_prominence": 12, "min_rep_sec": 1.0,
        "body_thr": 0.55, "joint_thr": 0.70,
        # 軀幹角度（安全）與拉桿幅度（成效）並重
        "scoring_weights": np.array([0.14, 0.14, 0.22, 0.18, 0.12, 0.08, 0.12]),
        "scoring_scales":  [1, 1, 1, 500, 2, 10000, 20],
        # 【v4.7】握距屬額狀面指標；側面拍攝時遠側手腕多半被遮，
        #   即使偶爾偵測到也不可信 → 側面模式強制不計分。
        "front_only_metrics": ["Grip Width"],
        "preferred_view": "side",
        "ar_mode": "upper",
        "tips": {
            "L Elbow":       ("左肘幅度",      "左手肘沒拉到底，背部刺激不夠。",
                                              "拉到「手肘超過身體側面」、槓子碰到肚臍/下腹的位置。"),
            "R Elbow":       ("右肘幅度",      "右手肘拉的幅度落後。",
                                              "對齊左邊；在頂端停 1 秒夾背，比拉更多重要。"),
            "Torso Hinge":   ("軀幹角度 ⚠",     "拉的過程身體越站越直，變成「半個聳肩」。",
                                              "整下動作把上半身鎖在 45-70°（接近平行地面），用背拉不是用身體拉。"),
            "Pull Depth":    ("拉桿幅度",      "槓沒有拉滿到腹部，背肌只做到一半的收縮。",
                                              "拉到「手肘超過身體側面」、槓子碰到肚臍/下腹，頂端停 1 秒夾背。"),
            "Elbow Sym":     ("左右對稱",      "左右拉的軌跡不一致。",
                                              "從後方拍檢查；補單臂啞鈴划船修弱邊。"),
            "Stability":     ("身體穩定",      "拉動時身體左右晃動、用甩動的慣性帶重量。",
                                              "減 10% 重量；每下到頂端讓槓貼住身體停 1 秒，迫使你用背的力量控制。"),
            "Grip Width":    ("握距一致",      "握距與標準示範差異較大，刺激角度會偏掉。",
                                              "中握距（略寬於肩）對準下胸〜肚臍路徑；換握距等於換動作，先固定一種。"),
        },
    },
}


def get_exercise_list():
    """Return serializable list of exercises with metadata."""
    result = []
    for key, cfg in EXERCISE_CONFIGS.items():
        result.append({
            "key": key,
            "name": cfg["name"],
            "name_zh": cfg["name_zh"],
            "name_en": cfg["name_en"],
            "icon": cfg["icon"],
            "preferred_view": cfg["preferred_view"],
            "metric_labels": cfg["metric_labels"],
            "ar_mode": cfg["ar_mode"],
        })
    return result


def get_config(exercise_key):
    """Get exercise config by key. Returns None if not found."""
    cfg = EXERCISE_CONFIGS.get(exercise_key)
    if cfg is not None and cfg.get("_key") != exercise_key:
        cfg["_key"] = exercise_key      # 讓下游（切割選欄、score_rep）知道自己是哪個動作
    return cfg


print("✅ Multi-Exercise Module loaded. Available:", list(EXERCISE_CONFIGS.keys()))
