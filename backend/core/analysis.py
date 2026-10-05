import cv2
import numpy as np
import math
import pandas as pd
import os
import sys
import requests
from collections import deque
from scipy.signal import butter, filtfilt, find_peaks, savgol_filter
from scipy.interpolate import interp1d
from fastdtw import fastdtw
from tslearn.barycenters import dtw_barycenter_averaging
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


# --- Constants & Config ---
# Use temp directory to avoid Unicode path issues on Windows
import tempfile
MODEL_PATH = os.path.join(tempfile.gettempdir(), 'pose_landmarker_heavy.task')
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"

METRIC_LABELS = ["L Arm", "R Arm", "Torso", "Tempo", "Symmetry", "Stability", "Shoulder"]
METRIC_MAP = {name: i for i, name in enumerate(METRIC_LABELS)}

TIPS_DATABASE = {
    "L Arm": ("Left Arm", "Your left elbow's movement path or range is off.", "Focus on a smooth, full range of motion (ROM)."),
    "R Arm": ("Right Arm", "Your right elbow's movement path or range is off.", "Focus on a smooth, full range of motion (ROM)."),
    "Torso": ("Torso", "You are leaning back excessively when pulling.", "Keep your core tight and avoid using momentum."),
    "Tempo": ("Tempo", "Your movement tempo is too fast or unstable.", "Focus on the 'negative' (eccentric) phase; control the weight."),
    "Symmetry": ("Symmetry", "Your left and right arms are pulling inconsistently.", "Ensure both arms move together with equal force."),
    "Stability": ("Stability", "Your body is swaying sideways.", "Brace your core to stay centered and stable."),
    "Shoulder": ("Shoulder", "You are shrugging your shoulders excessively.", "Depress your shoulder blades; pull with your elbows, not your traps.")
}

# --- Initialization ---
def ensure_model_exists():
    if not os.path.exists(MODEL_PATH) or os.path.getsize(MODEL_PATH) < 100_000:
        print(f"Downloading model to {MODEL_PATH}...")
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        try:
            response = requests.get(MODEL_URL, timeout=30)
            response.raise_for_status()
            with open(MODEL_PATH, 'wb') as f:
                f.write(response.content)
            print("Model downloaded.")
        except Exception as e:
            print(f"Failed to download model: {e}")
            raise


# --- PoseLandmarker 建構（GPU 可選 + CPU 安全後備）---
#   預設一律走 CPU（與原本行為相同，零風險）。
#   只有設環境變數 POSE_GPU=1 時才嘗試 GPU delegate；嘗試失敗安全退回 CPU。
#   Python 版 MediaPipe 的 GPU delegate 在 macOS 上不穩，故不預設開啟。
def _create_pose_landmarker(running_mode=None, num_poses=1):
    ensure_model_exists()
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode
    if running_mode is None:
        running_mode = VisionRunningMode.VIDEO

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


# --- Helper Functions (From Colab V9.9) ---


def calculate_angle(a, b, c): 
    a, b, c = np.array(a), np.array(b), np.array(c)
    ba, bc = a - b, c - b
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
    return np.degrees(angle)

def vector_angle_deg(v1, v2):
    v1_u = v1 / (np.linalg.norm(v1) + 1e-6)
    v2_u = v2 / (np.linalg.norm(v2) + 1e-6)
    dot = np.clip(np.dot(v1_u, v2_u), -1.0, 1.0)
    return np.degrees(np.arccos(dot))

def calculate_torso_lean_angle(hip_3d, shoulder_3d):
    hip_3d, shoulder_3d = np.array(hip_3d), np.array(shoulder_3d)
    torso_vector_3d = shoulder_3d - hip_3d
    vertical_vector_3d = np.array([0, -1, 0])
    angle = vector_angle_deg(torso_vector_3d, vertical_vector_3d)
    return angle

def apply_smoothing(features_data, fps, fc=3, N=4):
    if features_data.size == 0 or fps == 0:
        return features_data
    
    # 1. 先補 NaN，這是必須的 (沿用 DataFrame interpolate)
    clean = (pd.DataFrame(features_data)
             .interpolate(limit_direction='both')
             .bfill().ffill().fillna(0.0).to_numpy())
    
    # 2. Savitzky-Golay 參數
    win = max(5, int(fps * 0.25) // 2 * 2 + 1)
    if win > len(clean):
        win = len(clean) // 2 * 2 + 1
        if win < 3:
            return clean

    smoothed_features = np.zeros_like(clean)
    for i in range(clean.shape[1]):
        smoothed_features[:, i] = savgol_filter(clean[:, i], window_length=win, polyorder=3, mode='interp')
    return smoothed_features

def resample_to_length(data, target_length):
    if len(data) == target_length: return data
    if target_length <= 0: return np.array([])
    n_features = data.shape[1]
    resampled_data = np.zeros((target_length, n_features))
    x_original = np.linspace(0, 1, len(data))
    x_target = np.linspace(0, 1, target_length)
    
    # Interpolate DataFrame to handle NaNs
    data_interpolated = pd.DataFrame(data).interpolate(limit_direction='both').to_numpy()
    
    for i in range(n_features):
        col_data = data_interpolated[:, i]
        if np.isnan(data[:, i]).all():
            resampled_data[:, i] = np.nan
        else:
            f = interp1d(x_original, col_data, fill_value="extrapolate")
            resampled_data[:, i] = f(x_target)
    return resampled_data

# --- Core Logic from Colab V9.9 ---

def extract_features(video_path, body_visibility_threshold=0.60, elbow_visibility_threshold=0.50):
    """擷取 7 維動作特徵。

    回傳 (features, confs, fps, landmarks)：
      landmarks shape = (N, 33, 5)，欄 0-1 = 2D 正規化座標 (x, y)，
      欄 2-4 = 3D world 座標 (x, y, z) —— 供 AR 回放影片直接複用，
      不必再跑第二次 MediaPipe。
    """
    ensure_model_exists()
    print(f"Extracting features from {video_path}...", flush=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception(f"Could not open video {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"FPS: {fps}, Total Frames: {total_frames}")

    features = []
    confs = []                       # Track visibility confidence per frame
    landmarks = []                   # (33,5) 每幀骨架座標，供 AR 回放複用
    EMPTY_LM = np.zeros((33, 5), dtype=np.float32)
    wrist_y_history = deque(maxlen=2)
    com_x_history = deque(maxlen=int(fps/2) if int(fps/2) > 0 else 1)

    print("DEBUG: Creating PoseLandmarker...", flush=True)
    with _create_pose_landmarker() as landmarker:
        print("DEBUG: PoseLandmarker created. Starting loop...", flush=True)
        frame_num = 0
        while True:
            ret, frame = cap.read()
            if not ret: break
            frame_num += 1

            # 降解析度：HD/4K 影片縮到 640 寬再送 MediaPipe，推論大幅加速；
            # image landmark 是正規化座標、world landmark 與解析度無關，精度幾乎不變。
            h, w = frame.shape[:2]
            if w > 640:
                scale = 640.0 / w
                frame = cv2.resize(frame, (640, int(h * scale)),
                                   interpolation=cv2.INTER_LINEAR)

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
            frame_timestamp_ms = int((frame_num / fps) * 1000)

            if frame_num % 30 == 0: print(f"DEBUG: Processing frame {frame_num}", flush=True)

            feature_vector = [np.nan] * 7
            vis_list = [0.0] * 8         # Track visibility for 8 key points
            lm_frame = EMPTY_LM
            try:
                detection_result = landmarker.detect_for_video(mp_image, frame_timestamp_ms)
            except Exception as e:
                print(f"MediaPipe error at frame {frame_num}: {e}")
                # 出錯也補佔位，features / confs / landmarks 才能與影片幀數 1:1 對齊
                features.append(feature_vector)
                confs.append(vis_list)
                landmarks.append(lm_frame)
                continue

            if detection_result.pose_world_landmarks:
                k_world = detection_result.pose_world_landmarks[0]
                k_image = detection_result.pose_landmarks[0]
                # 一併保存骨架座標供 AR 回放影片複用
                _lm2d = np.array([[p.x, p.y] for p in k_image], dtype=np.float32)
                _lm3d = np.array([[p.x, p.y, p.z] for p in k_world], dtype=np.float32)
                lm_frame = np.hstack([_lm2d, _lm3d]).astype(np.float32)

                # Indices (Mix of User definition and direct indices)
                # 11=LS, 12=RS, 13=LE, 14=RE, 15=LW, 16=RW, 23=LH, 24=RH
                try:
                    L_S, L_E, L_W = k_world[11], k_world[13], k_world[15]
                    R_S, R_E, R_W = k_world[12], k_world[14], k_world[16]
                    L_H, R_H = k_world[23], k_world[24]
                    
                    L_S_vis, R_S_vis = k_image[11].visibility, k_image[12].visibility
                    L_E_vis, R_E_vis = k_image[13].visibility, k_image[14].visibility
                    L_W_vis, R_W_vis = k_image[15].visibility, k_image[16].visibility
                    L_H_vis, R_H_vis = k_image[23].visibility, k_image[24].visibility
                    vis_list = [L_S_vis, R_S_vis, L_E_vis, R_E_vis, L_W_vis, R_W_vis, L_H_vis, R_H_vis]
                    
                    # 1. L Elbow
                    if all(v > elbow_visibility_threshold for v in [L_S_vis, L_E_vis, L_W_vis]): 
                        feature_vector[0] = calculate_angle([L_S.x, L_S.y, L_S.z], [L_E.x, L_E.y, L_E.z], [L_W.x, L_W.y, L_W.z])
                    
                    # 2. R Elbow
                    if all(v > elbow_visibility_threshold for v in [R_S_vis, R_E_vis, R_W_vis]): 
                        feature_vector[1] = calculate_angle([R_S.x, R_S.y, R_S.z], [R_E.x, R_E.y, R_E.z], [R_W.x, R_W.y, R_W.z])
                    
                    # 3. Torso Lean
                    if all(v > body_visibility_threshold for v in [L_H_vis, R_H_vis, L_S_vis, R_S_vis]): 
                        mid_hip = ([L_H.x, L_H.y, L_H.z] + np.array([R_H.x, R_H.y, R_H.z])) / 2
                        mid_shoulder = ([L_S.x, L_S.y, L_S.z] + np.array([R_S.x, R_S.y, R_S.z])) / 2
                        feature_vector[2] = calculate_torso_lean_angle(mid_hip, mid_shoulder)
                    
                    # 4. Tempo
                    if all(v > elbow_visibility_threshold for v in [L_W_vis, R_W_vis]): 
                        current_wrist_y_avg = (L_W.y + R_W.y) / 2
                        wrist_y_history.append(current_wrist_y_avg)
                        feature_vector[3] = wrist_y_history[-1] - wrist_y_history[0] if len(wrist_y_history) > 1 else 0.0
                        
                    # 5. Elbow Sym
                    if not np.isnan(feature_vector[0]) and not np.isnan(feature_vector[1]): 
                        feature_vector[4] = abs(feature_vector[0] - feature_vector[1])
                        
                    # 6. Stability
                    if all(v > body_visibility_threshold for v in [L_H_vis, R_H_vis, L_S_vis, R_S_vis]):
                        mid_hip = ([L_H.x, L_H.y, L_H.z] + np.array([R_H.x, R_H.y, R_H.z])) / 2
                        mid_shoulder = ([L_S.x, L_S.y, L_S.z] + np.array([R_S.x, R_S.y, R_S.z])) / 2
                        com_x = (mid_hip[0] + mid_shoulder[0]) / 2
                        com_x_history.append(com_x)
                        feature_vector[5] = np.var(com_x_history) if len(com_x_history) > 1 else 0.0
                        
                    # 7. Shrug
                    if all(v > body_visibility_threshold for v in [L_H_vis, R_H_vis, L_S_vis, R_S_vis]):
                        mid_hip = ([L_H.x, L_H.y, L_H.z] + np.array([R_H.x, R_H.y, R_H.z])) / 2
                        mid_shoulder = ([L_S.x, L_S.y, L_S.z] + np.array([R_S.x, R_S.y, R_S.z])) / 2
                        avg_shoulder_y = mid_shoulder[1]
                        torso_length = np.linalg.norm(mid_shoulder - mid_hip)
                        feature_vector[6] = avg_shoulder_y / torso_length if torso_length > 0.1 else np.nan
                        
                except Exception as e:
                    print(f"Feature extraction error at frame {frame_num}: {e}")

            features.append(feature_vector)
            confs.append(vis_list)
            landmarks.append(lm_frame)

    cap.release()
    print(f"Extracted {len(features)} frames. Non-NaN L Elbow: {np.sum(~np.isnan([f[0] for f in features]))}")
    return (np.array(features), np.array(confs), fps,
            np.array(landmarks, dtype=np.float32))

def segment_repetitions(features_data, fps, min_rep_distance_sec=1.0, prominence=5):
    """Segment video into repetitions. Uses VERY relaxed settings."""
    print(f"Segmenting Reps. Data shape: {features_data.shape}. FPS: {fps}")
    rep_info_list = []
    if features_data.size == 0: 
        print("Empty features data")
        return rep_info_list
    
    # Use Right Elbow (Index 1), fallback to Left (Index 0)
    segment_signal = features_data[:, 1]
    if np.isnan(segment_signal).all() or np.sum(~np.isnan(segment_signal)) < 10:
        print("Right elbow mostly NaN, trying Left.")
        segment_signal = features_data[:, 0]
    
    # Interpolate to fill gaps
    interpolated_signal = pd.Series(segment_signal).interpolate(limit_direction='both').bfill().ffill().to_numpy()
    
    if np.isnan(interpolated_signal).all(): 
        print("Signal all NaNs after interpolation.")
        return []
    
    # Replace remaining NaNs with 90 (neutral angle)
    interpolated_signal = np.nan_to_num(interpolated_signal, nan=90.0)
    
    if len(interpolated_signal) < 10: 
        print(f"Signal too short: {len(interpolated_signal)}")
        return []
    
    # Calculate Range of Motion
    rom = np.ptp(interpolated_signal)
    print(f"Signal Stats: Min={np.min(interpolated_signal):.1f}, Max={np.max(interpolated_signal):.1f}, ROM={rom:.1f}")
    
    # VERY relaxed peak finding
    internal_peak_indices, _ = find_peaks(interpolated_signal, distance=int(fps * min_rep_distance_sec), prominence=prominence)
    print(f"Peaks found: {len(internal_peak_indices)}")
    
    # If no peaks found, try inverted signal (for different exercise types)
    if len(internal_peak_indices) == 0:
        internal_peak_indices_inv, _ = find_peaks(-interpolated_signal, distance=int(fps * min_rep_distance_sec), prominence=prominence)
        print(f"Inverted peaks found: {len(internal_peak_indices_inv)}")
        if len(internal_peak_indices_inv) > 0:
            internal_peak_indices = internal_peak_indices_inv
    
    # FALLBACK: If still no peaks but there IS movement, treat entire video as 1 rep
    if len(internal_peak_indices) == 0 and rom > 5:
        print(f"FALLBACK: No peaks but ROM={rom:.1f} > 5 degrees. Treating entire video as 1 rep.")
        mid_frame = len(features_data) // 2
        rep_info_list.append({
            "phase1": features_data[0:mid_frame, :],
            "phase2": features_data[mid_frame:, :],
            "start_frame": 0,
            "valley_frame": mid_frame,
            "end_frame": len(features_data) - 1
        })
        return rep_info_list
    
    # Add Start/End —— 只在「真的有抓到內部 peak」時才補頭尾切點。
    # peaks 為空代表訊號平到沒有可辨識的動作週期（有顯著 ROM 的情況上方
    # FALLBACK 已處理）。此時不要無條件補 [0, len-1] 假裝有 1 個 rep ——
    # 否則上層拿到的是一個被走位 / 喘息等垃圾頭尾幀污染的假 rep，
    # 還會把 DBA 模板拉歪。誠實回傳空清單。
    if len(internal_peak_indices) == 0:
        print("No internal peaks (and no significant ROM) — returning no reps.")
        return []
    split_points = np.unique(
        np.concatenate(([0], internal_peak_indices, [len(interpolated_signal) - 1]))
    )

    if len(split_points) < 2:
        print("Not enough split points.")
        return []
    
    for i in range(len(split_points) - 1):
        start_frame = split_points[i]
        end_frame = split_points[i+1]
        
        if start_frame == end_frame: continue
        
        rep_segment_angles_interp = interpolated_signal[start_frame:end_frame]
        if len(rep_segment_angles_interp) < 3: continue
        
        # Find Valley
        valley_index_relative = np.argmin(rep_segment_angles_interp[1:-1]) + 1
        valley_index_absolute = start_frame + valley_index_relative
        
        rep_info_list.append({
            "phase1": features_data[start_frame : valley_index_absolute, :],
            "phase2": features_data[valley_index_absolute : end_frame, :],
            "start_frame": int(start_frame),
            "valley_frame": int(valley_index_absolute),
            "end_frame": int(end_frame)
        })
        
    print(f"Segments found: {len(rep_info_list)}")
    return rep_info_list

def create_golden_template(all_expert_rep_info_list):
    if not all_expert_rep_info_list: return None, 0, 0
    
    concentric_lens = [len(r['phase1']) for r in all_expert_rep_info_list if len(r['phase1']) > 0]
    eccentric_lens = [len(r['phase2']) for r in all_expert_rep_info_list if len(r['phase2']) > 0]
    
    if not concentric_lens or not eccentric_lens: return None, 0, 0
    
    median_con = int(np.median(concentric_lens))
    median_ecc = int(np.median(eccentric_lens))
    
    all_reps = []
    for r in all_expert_rep_info_list:
        p1 = resample_to_length(r['phase1'], median_con)
        p2 = resample_to_length(r['phase2'], median_ecc)
        full = np.vstack((p1, p2))
        df_full = pd.DataFrame(full).interpolate(limit_direction='both').fillna(0)
        all_reps.append(df_full.to_numpy())
        
    # DBA
    dba_template = dtw_barycenter_averaging(np.array(all_reps), max_iter=10)
    return dba_template, median_con, median_ecc

def calculate_efficiency_score_custom(user_rep_normalized, golden_template_rep, is_side_view=False):
    """Calculate efficiency score with optional side view mode (from Colab Cell 4)"""
    if user_rep_normalized.shape[1] != 7: return 0.0, np.zeros(7)
    user_np, expert_np = user_rep_normalized, golden_template_rep
    
    with np.errstate(divide='ignore', invalid='ignore'):
        l_score = np.nanmean(np.clip(100 - np.abs(user_np[:,0] - expert_np[:,0]), 0, 100))
        r_score = np.nanmean(np.clip(100 - np.abs(user_np[:,1] - expert_np[:,1]), 0, 100))
        t_score = np.nanmean(np.clip(100 - np.abs(user_np[:,2] - expert_np[:,2]), 0, 100))
        tempo_score = np.nanmean(np.clip(100 - np.abs(user_np[:,3] - expert_np[:,3]) * 2000, 0, 100))
        sym_score = np.nanmean(np.clip(100 - np.abs(user_np[:,4] - expert_np[:,4]) * 2, 0, 100))
        stab_score = np.nanmean(np.clip(100 - np.abs(user_np[:,5] - expert_np[:,5]) * 10000, 0, 100))
        shrug_score = np.nanmean(np.clip(100 - np.abs(user_np[:,6] - expert_np[:,6]) * 300, 0, 100))
        
    sub_scores = np.nan_to_num(np.array([l_score, r_score, t_score, tempo_score, sym_score, stab_score, shrug_score]), nan=0.0)
    
    if is_side_view:
        # Side view: ignore symmetry and shrug (not visible from side)
        weights = np.array([0.25, 0.25, 0.20, 0.10, 0.0, 0.20, 0.0])
        # Dynamic weight adjustment - if elbow not visible, set weight to 0
        if sub_scores[0] < 1.0: weights[0] = 0.0  # L Elbow
        if sub_scores[1] < 1.0: weights[1] = 0.0  # R Elbow
        # Normalize weights
        total_weight = np.sum(weights)
        if total_weight > 0: 
            weights = weights / total_weight
        # Set invisible metrics to 100 (perfect)
        sub_scores[4] = 100.0  # Elbow Sym
        sub_scores[6] = 100.0  # Shrug
    else:
        # Front view weights
        weights = np.array([0.15, 0.15, 0.20, 0.05, 0.05, 0.20, 0.20])
    
    final_score = float(np.dot(sub_scores, weights))
    return final_score, sub_scores

# --- Upper-Body AR Overlay (Cell 5 from Colab) ---
def get_correction_instruction(target_angle, current_angle, threshold=15):
    """判斷角度差異並回傳顏色與文字"""
    diff = target_angle - current_angle
    if abs(diff) < threshold:
        return "Good", (0, 255, 0)  # Green
    elif diff > 0:
        return f"Extend (+{int(abs(diff))})", (0, 255, 255)  # Cyan
    else:
        return f"Bend (-{int(abs(diff))})", (0, 0, 255)  # Red

def calc_3d_angle(a, b, c):
    """Calculate 3D angle between three points"""
    v1 = np.array([a.x-b.x, a.y-b.y, a.z-b.z])
    v2 = np.array([c.x-b.x, c.y-b.y, c.z-b.z])
    return vector_angle_deg(v1, v2)

def generate_ar_overlay(video_path, output_path, rep_info, golden_template, fps):
    """Generate upper-body only AR overlay with color-coded feedback"""
    ensure_model_exists()
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1
    )
    
    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
    
    start_frame = rep_info['start_frame']
    end_frame = rep_info['end_frame']
    total_rep_frames = end_frame - start_frame
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    current_frame = start_frame
    
    NEUTRAL_COLOR = (200, 200, 200)  # Light gray for connection lines
    
    with PoseLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened() and current_frame <= end_frame:
            ret, frame = cap.read()
            if not ret: break
            
            # Darken background
            overlay = frame.copy()
            cv2.rectangle(overlay, (0, 0), (width, height), (10, 10, 10), -1)
            cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
            
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
            timestamp_ms = int((current_frame / fps) * 1000)
            
            detection_result = landmarker.detect_for_video(mp_image, timestamp_ms)
            
            if detection_result.pose_landmarks and detection_result.pose_world_landmarks:
                lm = detection_result.pose_landmarks[0]
                wlm = detection_result.pose_world_landmarks[0]
                
                px = lambda idx: (int(lm[idx].x * width), int(lm[idx].y * height))
                
                # Get upper body keypoints
                nose = px(0)
                ls, le, lw = px(11), px(13), px(15)  # Left Arm
                rs, re, rw = px(12), px(14), px(16)  # Right Arm
                lh, rh = px(23), px(24)  # Hips (for torso midline)
                
                # Calculate angles and guidance
                progress = (current_frame - start_frame) / total_rep_frames if total_rep_frames > 0 else 0
                t_idx = min(int(progress * (len(golden_template) - 1)), len(golden_template) - 1)
                
                # Elbows
                curr_l = calc_3d_angle(wlm[11], wlm[13], wlm[15])
                curr_r = calc_3d_angle(wlm[12], wlm[14], wlm[16])
                ideal_l = golden_template[t_idx][0]
                ideal_r = golden_template[t_idx][1]
                
                instr_l, color_l = get_correction_instruction(ideal_l, curr_l)
                instr_r, color_r = get_correction_instruction(ideal_r, curr_r)
                
                # Torso
                mid_hip_3d = (np.array([wlm[23].x, wlm[23].y, wlm[23].z]) + np.array([wlm[24].x, wlm[24].y, wlm[24].z])) / 2
                mid_shoulder_3d = (np.array([wlm[11].x, wlm[11].y, wlm[11].z]) + np.array([wlm[12].x, wlm[12].y, wlm[12].z])) / 2
                torso_vec = mid_shoulder_3d - mid_hip_3d
                vertical_vec = np.array([0, -1, 0])
                curr_torso = vector_angle_deg(torso_vec, vertical_vec)
                ideal_torso = golden_template[t_idx][2]
                _, color_torso = get_correction_instruction(ideal_torso, curr_torso, threshold=10)
                
                # Draw (upper body only)
                th = 4
                
                # A. Spine/Torso
                mid_hip_px = ((lh[0]+rh[0])//2, (lh[1]+rh[1])//2)
                mid_shoulder_px = ((ls[0]+rs[0])//2, (ls[1]+rs[1])//2)
                
                cv2.line(frame, mid_hip_px, mid_shoulder_px, color_torso, th+2)  # Spine
                cv2.line(frame, ls, rs, color_torso, th)  # Shoulder line
                cv2.line(frame, mid_shoulder_px, nose, NEUTRAL_COLOR, th)  # Neck
                
                # B. Arms (color-coded)
                cv2.line(frame, ls, le, color_l, th)
                cv2.line(frame, le, lw, color_l, th)
                cv2.line(frame, rs, re, color_r, th)
                cv2.line(frame, re, rw, color_r, th)
                
                # C. Joints
                for pt in [ls, le, lw, rs, re, rw, nose]:
                    cv2.circle(frame, pt, 5, (255, 255, 255), -1)
                
                # D. Text guidance
                # Left arm
                cv2.putText(frame, f"{curr_l:.0f}", (le[0]-30, le[1]-20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color_l, 2)
                if color_l != (0, 255, 0):
                    cv2.putText(frame, instr_l, (le[0]-60, le[1]+40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color_l, 3)
                    cv2.putText(frame, instr_l, (le[0]-60, le[1]+40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 1)
                
                # Right arm
                cv2.putText(frame, f"{curr_r:.0f}", (re[0]-30, re[1]-20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color_r, 2)
                if color_r != (0, 255, 0):
                    cv2.putText(frame, instr_r, (re[0]-60, re[1]+40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color_r, 3)
                    cv2.putText(frame, instr_r, (re[0]-60, re[1]+40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 1)
                        
            writer.write(frame)
            current_frame += 1
            
    cap.release()
    writer.release()
    return True

def generate_ar_overlay_all_reps(video_path, output_path, rep_info_list, golden_template, fps):
    """Generate AR overlay for ALL repetitions in sequence (full workout video)"""
    ensure_model_exists()
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1
    )
    
    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
    
    # Build a lookup: frame_num -> rep_info (for frames within reps)
    frame_to_rep = {}
    if rep_info_list:
        for rep_info in rep_info_list:
            for f in range(rep_info['start_frame'], rep_info['end_frame'] + 1):
                frame_to_rep[f] = rep_info
    else:
        print("WARNING: No reps found for AR. Generating video without overlay.")
    
    # Use VP80 for WebM (safer for browsers) or Fallback to mp4v if unavailable
    # Note: If OpenCV doesn't support VP8, this might fail. mp4v in webm is non-standard but might trigger 'download' instead of play.
    # Let's try 'vp80'. If that causes issues, we might need to revert to mp4 container in main.py.
    fourcc = cv2.VideoWriter_fourcc(*'vp80')
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not writer.isOpened():
        print("WARNING: Could not open VP80 writer. Falling back to mp4v.")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    start_processing_frame = 0
    end_processing_frame = total_frames - 1
    
    # Use all frames if we have no reps (fallback mode), otherwise restrict to rep range?
    # Actually, user expects to see the video. Let's write the whole video or just the relevant parts?
    # Original logic only wrote frames BELONGING to reps.
    # New logic: If no reps, write EVERYTHING (as a fallback). If reps exist, write reps.
    
    if not frame_to_rep:
        # Fallback: Write all frames
        pass 
    else:
        # Optimization: Only process range containing reps? 
        # But existing logic filtered strictly by frame_to_rep existence.
        # Let's keep strict filtering if reps exist.
        start_processing_frame = min(frame_to_rep.keys())
        end_processing_frame = max(frame_to_rep.keys())
        pass
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_processing_frame)
    current_frame = start_processing_frame
    
    NEUTRAL_COLOR = (200, 200, 200)
    
    with PoseLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened() and current_frame <= end_processing_frame:
            ret, frame = cap.read()
            if not ret: break
            
            # If we have reps, skip frames not in a rep
            if frame_to_rep and current_frame not in frame_to_rep:
                current_frame += 1
                continue
                
            # If no reps (fallback), just write original frame? Or try to track anyway?
            # Let's just write original frame + skeleton if possible? 
            # For robustness: Just write frame.
            
            if not frame_to_rep:
                 # No reps found mode - Just copy frame
                 writer.write(frame)
                 current_frame += 1
                 continue
                 
            rep_info = frame_to_rep[current_frame]
            
            # Darken background
            overlay = frame.copy()
            cv2.rectangle(overlay, (0, 0), (width, height), (10, 10, 10), -1)
            cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
            
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
            timestamp_ms = int((current_frame / fps) * 1000)
            
            detection_result = landmarker.detect_for_video(mp_image, timestamp_ms)
            
            if detection_result.pose_landmarks and detection_result.pose_world_landmarks:
                lm = detection_result.pose_landmarks[0]
                wlm = detection_result.pose_world_landmarks[0]
                
                px = lambda idx: (int(lm[idx].x * width), int(lm[idx].y * height))
                
                nose = px(0)
                ls, le, lw = px(11), px(13), px(15)
                rs, re, rw = px(12), px(14), px(16)
                lh, rh = px(23), px(24)
                
                
                # Calculate progress within this specific rep
                total_rep_frames = rep_info['end_frame'] - rep_info['start_frame']
                progress = (current_frame - rep_info['start_frame']) / total_rep_frames if total_rep_frames > 0 else 0
                t_idx = min(int(progress * (len(golden_template) - 1)), len(golden_template) - 1)
                
                # Elbows
                curr_l = calc_3d_angle(wlm[11], wlm[13], wlm[15])
                curr_r = calc_3d_angle(wlm[12], wlm[14], wlm[16])
                ideal_l = golden_template[t_idx][0]
                ideal_r = golden_template[t_idx][1]
                
                instr_l, color_l = get_correction_instruction(ideal_l, curr_l)
                instr_r, color_r = get_correction_instruction(ideal_r, curr_r)
                
                # Torso
                mid_hip_3d = (np.array([wlm[23].x, wlm[23].y, wlm[23].z]) + np.array([wlm[24].x, wlm[24].y, wlm[24].z])) / 2
                mid_shoulder_3d = (np.array([wlm[11].x, wlm[11].y, wlm[11].z]) + np.array([wlm[12].x, wlm[12].y, wlm[12].z])) / 2
                torso_vec = mid_shoulder_3d - mid_hip_3d
                vertical_vec = np.array([0, -1, 0])
                curr_torso = vector_angle_deg(torso_vec, vertical_vec)
                ideal_torso = golden_template[t_idx][2]
                _, color_torso = get_correction_instruction(ideal_torso, curr_torso, threshold=10)
                
                # Draw
                th = 4
                mid_hip_px = ((lh[0]+rh[0])//2, (lh[1]+rh[1])//2)
                mid_shoulder_px = ((ls[0]+rs[0])//2, (ls[1]+rs[1])//2)
                
                cv2.line(frame, mid_hip_px, mid_shoulder_px, color_torso, th+2)
                cv2.line(frame, ls, rs, color_torso, th)
                cv2.line(frame, mid_shoulder_px, nose, NEUTRAL_COLOR, th)
                
                cv2.line(frame, ls, le, color_l, th)
                cv2.line(frame, le, lw, color_l, th)
                cv2.line(frame, rs, re, color_r, th)
                cv2.line(frame, re, rw, color_r, th)
                
                for pt in [ls, le, lw, rs, re, rw, nose]:
                    cv2.circle(frame, pt, 5, (255, 255, 255), -1)
                
                # Text
                cv2.putText(frame, f"{curr_l:.0f}", (le[0]-30, le[1]-20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color_l, 2)
                if color_l != (0, 255, 0):
                    cv2.putText(frame, instr_l, (le[0]-60, le[1]+40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color_l, 3)
                    cv2.putText(frame, instr_l, (le[0]-60, le[1]+40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 1)
                
                cv2.putText(frame, f"{curr_r:.0f}", (re[0]-30, re[1]-20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color_r, 2)
                if color_r != (0, 255, 0):
                    cv2.putText(frame, instr_r, (re[0]-60, re[1]+40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color_r, 3)
                    cv2.putText(frame, instr_r, (re[0]-60, re[1]+40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 1)
                        
            writer.write(frame)
            current_frame += 1
            
    cap.release()
    writer.release()
    return True


# ───────────────────────────────────────────────────────────────────────────
# AR 回放影片 — 複用版（不重跑 MediaPipe）
#   與 generate_ar_overlay_all_reps 視覺輸出相同，但直接使用第一輪特徵擷取時
#   保存下來的骨架座標，省掉整整一次 MediaPipe 偵測，大幅縮短分析時間。
# ───────────────────────────────────────────────────────────────────────────
def _angle_from_world(a, b, c):
    """以三個 world 座標點（numpy 陣列）計算夾角，等同 calc_3d_angle 但吃陣列。"""
    return vector_angle_deg(np.asarray(a) - np.asarray(b),
                            np.asarray(c) - np.asarray(b))


def generate_ar_overlay_from_landmarks(video_path, output_path, rep_info_list,
                                       golden_template, fps, landmarks,
                                       progress_cb=None,
                                       max_width=720, target_fps=None,
                                       draw_idx=None):
    """
    產生 AR 動作回放影片，不再重跑 MediaPipe。

    ── v4.1 效能優化（2026-05）──────────────────────────────
      1. 預設改用 mp4v 編碼（比 VP80/libvpx 快 5-10 倍，前端 <video> 完全相容）。
         若 output_path 副檔名為 .webm，仍走 VP80；建議呼叫端改用 .mp4。
      2. 自動將輸出影片寬度限制在 max_width（預設 720）。
         多數手機影片是 1080p 甚至 2160p，下取樣可省 50-75% 編碼量。
      3. 非 rep 區段以 cap.set(POS_FRAMES) 直接跳過，
         不再 frame-by-frame decode，影片頭尾空檔越長收益越大。
      4. 文字疊加減量 — 只在錯誤幀畫提示文字，避免不必要的 putText。
      5. 可選 target_fps（預設沿用原 fps）讓輸出降幀，再砍一半時間。

    landmarks: np.ndarray，shape = (N, 33, 5)
        欄 0-1 = 2D 正規化座標 (x, y)；欄 2-4 = 3D world 座標 (x, y, z)
    progress_cb: 選填，callable(percent:int)，回報 AR 影片產生進度 0~100。
    """
    import time as _time
    _t_start = _time.time()

    cap = cv2.VideoCapture(video_path)
    src_width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # ── 1. 計算輸出解析度（等比例縮小，最長邊 ≤ max_width）──────
    if max_width and src_width > max_width:
        scale = max_width / float(src_width)
        out_w = (int(src_width * scale) // 2) * 2     # 保證偶數，避免 H264 報錯
        out_h = (int(src_height * scale) // 2) * 2
    else:
        scale = 1.0
        out_w, out_h = src_width, src_height

    # ── 2. 編碼器選擇：副檔名決定，預設 mp4v（最快）──────────
    out_fps = float(target_fps) if target_fps else float(fps or 30.0)
    ext = os.path.splitext(output_path)[1].lower()
    if ext == ".webm":
        fourcc = cv2.VideoWriter_fourcc(*'vp80')
        writer = cv2.VideoWriter(output_path, fourcc, out_fps, (out_w, out_h))
        if not writer.isOpened():
            print("WARNING: VP80 writer unavailable. Falling back to mp4v.")
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(output_path, fourcc, out_fps, (out_w, out_h))
    else:
        # 預設快速路徑：mp4v（廣泛相容，速度約為 VP80 的 5-10 倍）
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, out_fps, (out_w, out_h))
        if not writer.isOpened():
            print("WARNING: mp4v writer unavailable. Falling back to MJPG.")
            fourcc = cv2.VideoWriter_fourcc(*'MJPG')
            writer = cv2.VideoWriter(output_path, fourcc, out_fps, (out_w, out_h))

    # ── 3. 整理 rep 區段（避免 frame_to_rep 大字典 + dict-in 查找）──────
    rep_intervals = sorted(
        [(r['start_frame'], r['end_frame'], r) for r in (rep_info_list or [])],
        key=lambda x: x[0]
    )
    if not rep_intervals:
        print("WARNING: No reps for AR. Skipping AR video generation.")
        cap.release()
        writer.release()
        if progress_cb:
            progress_cb(100)
        return False

    total_rep_frames_all = sum(e - s + 1 for s, e, _ in rep_intervals)
    n_lm = len(landmarks) if landmarks is not None else 0
    NEUTRAL_COLOR = (200, 200, 200)
    GREEN = (0, 255, 0)
    WHITE = (255, 255, 255)

    # 【v5.0】只畫「該機位偵測得到的點位」——側面 90° 不硬畫對側被遮擋的手/腳。
    #   draw_idx = None → 舊行為（全畫）；給了清單 → 只有清單內的關節/段才畫。
    _allow = set(int(i) for i in draw_idx) if draw_idx else None
    def _ok(i):
        return _allow is None or int(i) in _allow
    # 軀幹畫法：雙肩都可見→畫中線；只剩單側（側面）→沿可見側肩→髖畫一條
    _both_sh = _ok(11) and _ok(12)

    # ── 4. 依區間迭代：跳過非 rep 區段（避免讀整支影片）──────────
    processed = 0
    last_reported_pct = -1
    for s_frame, e_frame, rep_info in rep_intervals:
        cap.set(cv2.CAP_PROP_POS_FRAMES, s_frame)
        cur = s_frame
        total_rep_frames = max(1, e_frame - s_frame)

        while cur <= e_frame:
            ret, frame = cap.read()
            if not ret:
                break

            # 下取樣（最大的耗時節省點）
            if scale != 1.0:
                frame = cv2.resize(frame, (out_w, out_h),
                                   interpolation=cv2.INTER_AREA)

            lm = landmarks[cur] if cur < n_lm else None

            # 壓暗背景 — 用 in-place addWeighted（省掉一次 frame.copy()）
            cv2.addWeighted(frame, 0.4, frame, 0.0, 0, frame)

            if lm is not None and not np.all(lm == 0):
                def px(i):
                    return (int(lm[i, 0] * out_w), int(lm[i, 1] * out_h))
                def wp(i):
                    return lm[i, 2:5]

                # ── 極簡骨架 v4.2 ──────────────────────────────────────
                # 設計：只畫「軀幹一條 + 雙臂各一段」共三條主線 + 4 個微小節點。
                # 無文字、無頭部線、無多餘節點。所有線寬統一細，色彩單一。
                # 上半身髖部 → 肩中點為軀幹主軸；肩 → 肘 → 腕為手臂彎曲。
                # 顏色：白色為主，錯誤超出閾值才整體染紅，避免左紅右綠的雜訊感。
                # ── 骨架 v4.3：分段高亮（哪邊偏掉就閃哪邊）──────
                ls, le, lw_ = px(11), px(13), px(15)
                rs, re, rw_ = px(12), px(14), px(16)
                lh, rh = px(23), px(24)

                progress = (cur - s_frame) / total_rep_frames
                t_idx = min(int(progress * (len(golden_template) - 1)),
                            len(golden_template) - 1)

                # 計算三段偏差度數（不只判 GREEN/RED，記實際偏差量）
                curr_l = _angle_from_world(wp(11), wp(13), wp(15))
                curr_r = _angle_from_world(wp(12), wp(14), wp(16))
                ideal_l = golden_template[t_idx][0]
                ideal_r = golden_template[t_idx][1]
                ideal_torso = golden_template[t_idx][2]
                mid_hip_3d = (wp(23) + wp(24)) / 2
                mid_shoulder_3d = (wp(11) + wp(12)) / 2
                curr_torso = vector_angle_deg(
                    mid_shoulder_3d - mid_hip_3d, np.array([0, -1, 0]))

                diff_l = float(curr_l - ideal_l)   # 正:太開 / 負:太彎
                diff_r = float(curr_r - ideal_r)
                diff_t = float(curr_torso - ideal_torso)

                ARM_THR = 15.0
                TORSO_THR = 10.0
                bad_l = abs(diff_l) > ARM_THR
                bad_r = abs(diff_r) > ARM_THR
                bad_t = abs(diff_t) > TORSO_THR

                # 配色 (BGR) — 對齊統一色票
                PAPER = (241, 244, 246)            # Paper #F6F4F1
                EMBER = (48, 64, 217)              # Ember #D94030

                mid_hip_px = ((lh[0] + rh[0]) // 2, (lh[1] + rh[1]) // 2)
                mid_shoulder_px = ((ls[0] + rs[0]) // 2, (ls[1] + rs[1]) // 2)

                def draw_segment(p1, p2, is_bad):
                    """正常 = 細白線（不搶戲）；偏掉 = 厚紅光暈 + 細白主線（強烈標示）。"""
                    if is_bad:
                        cv2.line(frame, p1, p2, EMBER, 8, cv2.LINE_AA)   # 光暈
                        cv2.line(frame, p1, p2, PAPER, 1, cv2.LINE_AA)   # 內芯
                    else:
                        cv2.line(frame, p1, p2, PAPER, 2, cv2.LINE_AA)

                # 軀幹：雙肩皆可見 → 中線 + 肩線；否則沿可見側肩→髖畫一條
                if _both_sh:
                    draw_segment(mid_hip_px, mid_shoulder_px, bad_t)   # 軀幹中線
                    draw_segment(ls, rs, bad_t)                         # 肩線
                else:
                    if _ok(11) and _ok(23): draw_segment(lh, ls, bad_t)   # 可見左側
                    if _ok(12) and _ok(24): draw_segment(rh, rs, bad_t)   # 可見右側
                # 手臂：兩端都要在可畫清單內才畫（側面只留可見側）
                if _ok(11) and _ok(13): draw_segment(ls, le, bad_l)       # 左上臂
                if _ok(13) and _ok(15): draw_segment(le, lw_, bad_l)      # 左前臂
                if _ok(12) and _ok(14): draw_segment(rs, re, bad_r)       # 右上臂
                if _ok(14) and _ok(16): draw_segment(re, rw_, bad_r)      # 右前臂

                # 節點：偏掉的關節變紅圓 (放大 + 白心)；正常的維持小白點
                def draw_joint(pt, is_bad):
                    if is_bad:
                        cv2.circle(frame, pt, 7, EMBER, -1, cv2.LINE_AA)
                        cv2.circle(frame, pt, 3, PAPER, -1, cv2.LINE_AA)
                    else:
                        cv2.circle(frame, pt, 3, PAPER, -1, cv2.LINE_AA)
                if _ok(13): draw_joint(le, bad_l)
                if _ok(15): draw_joint(lw_, bad_l)
                if _ok(14): draw_joint(re, bad_r)
                if _ok(16): draw_joint(rw_, bad_r)

                # ── 只在偏差最大那一段畫修正提示（避免畫面太雜）─────
                #   箭頭 + 紅底白字小標籤，直觀告訴使用者該往哪修。
                def draw_correction_badge(anchor, diff_deg,
                                          label_too_open, label_too_closed):
                    if abs(diff_deg) < 3:
                        return
                    too_open = diff_deg > 0
                    text = label_too_open if too_open else label_too_closed
                    ax, ay = anchor
                    tip = (ax + 28, ay + (14 if too_open else -14))
                    cv2.arrowedLine(frame, anchor, tip, EMBER, 2,
                                    cv2.LINE_AA, tipLength=0.35)
                    (tw, th_), _ = cv2.getTextSize(
                        text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                    bx, by = tip[0] + 4, tip[1] - th_ - 2
                    # 確保標籤不超出畫面
                    if bx + tw + 6 > out_w: bx = out_w - tw - 8
                    if by < 6: by = 6
                    cv2.rectangle(frame, (bx - 3, by - 3),
                                  (bx + tw + 5, by + th_ + 5), EMBER, -1)
                    cv2.putText(frame, text, (bx, by + th_),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, PAPER, 1,
                                cv2.LINE_AA)

                # ── 【v5.0】指標專屬的「就地」提示 ────────────────────────
                #   舊版只有手臂/軀幹兩種泛用提示，使用者看不出「是哪個指標、
                #   要往哪修」。這裡改成：把該 rep 最該修的那個指標，直接畫在
                #   它所依據的關節上 —— 量哪裡就標哪裡，並用箭頭指出修正方向。
                _cue = (rep_info or {}).get("_cue")   # 由呼叫端塞入（見 cue_by_rep）
                _cue_done = False
                if _cue:
                    _lab = _cue.get("label") or ""
                    _fix = _cue.get("fix") or ""
                    _kind = _cue.get("kind")
                    try:
                        if _kind == "valgus" and _ok(25) and _ok(26):
                            lk, rk = px(25), px(26)
                            # 量哪裡就畫哪裡：膝間距連線 + 往外推的雙箭頭
                            cv2.line(frame, lk, rk, EMBER, 3, cv2.LINE_AA)
                            for p, d in ((lk, +1), (rk, -1)):
                                cv2.arrowedLine(frame, p, (p[0] + d * 46, p[1]), EMBER, 3,
                                                cv2.LINE_AA, tipLength=0.4)
                            draw_correction_badge(((lk[0] + rk[0]) // 2, lk[1] - 26), 1,
                                                  "KNEES OUT", "KNEES OUT")
                            _cue_done = True
                        elif _kind == "depth" and _ok(23) and _ok(25):
                            hp, kn = px(23), px(25)
                            cv2.line(frame, (hp[0] - 52, hp[1]), (hp[0] + 52, hp[1]),
                                     EMBER, 2, cv2.LINE_AA)          # 目前髖高
                            cv2.line(frame, (kn[0] - 52, kn[1]), (kn[0] + 52, kn[1]),
                                     GREEN, 2, cv2.LINE_AA)          # 目標：與膝同高
                            cv2.arrowedLine(frame, (hp[0], hp[1]), (hp[0], kn[1]), EMBER, 3,
                                            cv2.LINE_AA, tipLength=0.25)
                            draw_correction_badge((hp[0], hp[1] - 20), 1, "GO LOWER", "GO LOWER")
                            _cue_done = True
                        elif _kind == "flare" and _ok(13) and _ok(14):
                            for p, d in ((px(13), +1), (px(14), -1)):
                                cv2.circle(frame, p, 12, EMBER, 3, cv2.LINE_AA)
                                cv2.arrowedLine(frame, p, (p[0] + d * 40, p[1]), EMBER, 3,
                                                cv2.LINE_AA, tipLength=0.4)
                            draw_correction_badge(px(13), 1, "TUCK ELBOWS", "TUCK ELBOWS")
                            _cue_done = True
                        elif _kind == "grip" and _ok(15) and _ok(16):
                            lw2, rw2 = px(15), px(16)
                            cv2.line(frame, lw2, rw2, EMBER, 3, cv2.LINE_AA)
                            for p, d in ((lw2, +1), (rw2, -1)):
                                cv2.arrowedLine(frame, p, (p[0] + d * 44, p[1]), EMBER, 3,
                                                cv2.LINE_AA, tipLength=0.4)
                            draw_correction_badge(((lw2[0] + rw2[0]) // 2, lw2[1] - 24), 1,
                                                  "WIDEN GRIP", "WIDEN GRIP")
                            _cue_done = True
                    except Exception:
                        _cue_done = False

                if not _cue_done:
                    worst_diff = max(
                        abs(diff_l) if bad_l else 0,
                        abs(diff_r) if bad_r else 0,
                        abs(diff_t) if bad_t else 0,
                    )
                    if worst_diff > 0:
                        _torso_anchor = mid_shoulder_px if _both_sh else (ls if _ok(11) else rs)
                        if bad_l and abs(diff_l) == worst_diff and _ok(13):
                            draw_correction_badge(le, diff_l, "OPEN UP", "BEND MORE")
                        elif bad_r and abs(diff_r) == worst_diff and _ok(14):
                            draw_correction_badge(re, diff_r, "OPEN UP", "BEND MORE")
                        elif bad_t:
                            draw_correction_badge(_torso_anchor, diff_t,
                                                  "LEAN BACK", "LEAN FWD")

            writer.write(frame)
            processed += 1
            cur += 1

            # 進度回報（去重 — 同百分比不重複呼叫）
            if progress_cb:
                pct = int(processed / total_rep_frames_all * 100)
                if pct != last_reported_pct and pct % 2 == 0:
                    progress_cb(pct)
                    last_reported_pct = pct

    cap.release()
    writer.release()

    # ── 5. ffmpeg 轉碼為 H.264 + faststart（iOS Safari 相容性）──────
    # OpenCV 的 mp4v = MPEG-4 Part 2，iOS Safari 不愛吃。
    # H.264 是 iOS 唯一能直接內嵌播放的硬體解碼格式。
    # 加 +faststart 讓 moov atom 移到檔頭，影片邊下載邊播。
    if ext != ".webm":
        try:
            import subprocess, shutil as _sh
            ffmpeg_bin = _sh.which("ffmpeg")
            if ffmpeg_bin:
                tmp_path = output_path + ".h264.mp4"
                cmd = [
                    ffmpeg_bin, "-y", "-loglevel", "error",
                    "-i", output_path,
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
                    "-pix_fmt", "yuv420p",       # iOS 必要
                    "-movflags", "+faststart",   # 邊下載邊播
                    "-an",                        # 無音訊
                    tmp_path,
                ]
                _t_ff = _time.time()
                r = subprocess.run(cmd, capture_output=True, timeout=120)
                if r.returncode == 0 and os.path.exists(tmp_path):
                    os.replace(tmp_path, output_path)
                    print(f"[AR] ffmpeg→H264 in {_time.time() - _t_ff:.2f}s (iOS compatible)")
                else:
                    print(f"[AR] ffmpeg failed (rc={r.returncode}), keeping mp4v: "
                          f"{r.stderr.decode('utf-8', 'ignore')[:200]}")
                    if os.path.exists(tmp_path):
                        try: os.remove(tmp_path)
                        except: pass
            else:
                print("[AR] WARNING: ffmpeg not in PATH — AR 影片留在 mp4v 格式，"
                      "iOS Safari 可能無法播放。請 brew install ffmpeg "
                      "或在系統安裝 ffmpeg。")
        except Exception as _ff_err:
            print(f"[AR] ffmpeg transcode skipped: {_ff_err}")

    if progress_cb:
        progress_cb(100)
    _elapsed = _time.time() - _t_start
    print(f"[AR] total {processed} frames in {_elapsed:.2f}s "
          f"({processed / max(_elapsed, 0.001):.1f} fps), "
          f"out={out_w}x{out_h}@{out_fps:.1f}, ext={ext or '.mp4'}")
    return True
