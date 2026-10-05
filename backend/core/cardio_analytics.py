import numpy as np

class CardioAnalytics:
    def __init__(self):
        pass

    def calculate_metrics(self, stream_data, user_history_efs=[]):
        """
        核心入口函數
        :param stream_data: 包含 heart_rate (list) 和 pace (list, 單位: 秒/公里)
        :param user_history_efs: 該用戶過去 5-10 次跑步的 EF 值 (List[float])
        :return: Dict (符合前端 PhysioInsightsGrid 的數據結構)
        """
        # Support both dictionary keys (from JSON) or direct args if refactored
        hr_stream = stream_data.get('heart_rate', [])
        pace_stream = stream_data.get('pace', []) # 假設單位是 秒/公里 (s/km)

        # 1. 數據防呆與前處理
        if not hr_stream or not pace_stream:
            return None
        
        # 確保長度一致 (取最小長度)
        min_len = min(len(hr_stream), len(pace_stream))
        hr_arr = np.array(hr_stream[:min_len])
        pace_arr = np.array(pace_stream[:min_len])

        # 過濾無效數據 (心率異常 或 配速異常的點)
        if len(hr_arr) < 5:
            return None

        # 心率合理範圍 40–220 bpm；配速 90–1200 s/km。
        # pace < 90 (=1:30/km) 比世界紀錄還快，必為 GPS 瞬跳 → 會讓 speed=1000/pace
        # 爆衝並污染 EF，務必過濾；pace > 1200 (=20 min/km) 視為停下/雜訊。
        valid_mask = (hr_arr > 40) & (hr_arr < 220) & (pace_arr > 90) & (pace_arr < 1200)
        
        hr_arr = hr_arr[valid_mask]
        pace_arr = pace_arr[valid_mask]

        if len(hr_arr) < 5: 
             return None

        # ------------------------------------------------
        # A. 計算效率係數 (EF - Efficiency Factor)
        # 定義：速度 (yard/min 或 m/min) / 心率
        # 這裡我們用：速度 (m/min) / HR
        # ------------------------------------------------
        # pace (s/km) -> speed (m/min)
        # 1 km = 1000m. pace = seconds for 1000m.
        # speed (m/s) = 1000 / pace
        # speed (m/min) = (1000 / pace) * 60
        
        # Avoid division by zero
        with np.errstate(divide='ignore', invalid='ignore'):
            speed_mpm = (1000.0 / pace_arr) * 60
            ef_instant = speed_mpm / hr_arr
        
        # Handle Inf/Nan
        ef_instant = np.nan_to_num(ef_instant, nan=0.0, posinf=0.0, neginf=0.0)
        
        current_ef = float(round(np.mean(ef_instant), 2))

        # 計算趨勢 (Trend)
        ef_trend = 0.0
        history_chart_data = []
        
        if user_history_efs:
            avg_history = np.mean(user_history_efs)
            if avg_history > 0:
                ef_trend = float(round(((current_ef - avg_history) / avg_history) * 100, 1))
            
            # 構建圖表數據 (歷史 + 當前)
            for idx, val in enumerate(user_history_efs):
                history_chart_data.append({"idx": idx, "val": float(val)})
            history_chart_data.append({"idx": len(user_history_efs), "val": current_ef})
        else:
            # 如果沒有歷史數據，就只顯示當前
            history_chart_data.append({"idx": 0, "val": current_ef})

        # ------------------------------------------------
        # B. 計算有氧脫鉤率 (Aerobic Decoupling)
        # 方法：比較前半段與後半段的 EF 比率 (Pw:HR)
        # ------------------------------------------------
        mid_point = len(hr_arr) // 2
        
        if mid_point > 0:
            # 前半段 EF
            ef_first_half = np.mean(speed_mpm[:mid_point]) / np.mean(hr_arr[:mid_point])
            # 後半段 EF
            ef_second_half = np.mean(speed_mpm[mid_point:]) / np.mean(hr_arr[mid_point:])
            
            # 脫鉤率公式: ((前半 - 後半) / 前半) * 100
            if ef_first_half > 0:
                decoupling_rate = float(round(((ef_first_half - ef_second_half) / ef_first_half) * 100, 1))
            else:
                decoupling_rate = 0.0
                
            ef1 = float(ef_first_half)
            ef2 = float(ef_second_half)
        else:
            decoupling_rate = 0.0
            ef1 = current_ef
            ef2 = current_ef

        # ------------------------------------------------
        # C. 估算末段心率下降 (Estimated HR Drop)
        # 真正的 HRR 需要「停止運動當下 HR − 停止後 60 秒 HR」，需有冷卻段資料。
        # 此資料流不保證含冷卻段，因此這裡只計算「末段心率下降幅度」當作估算值，
        # 並以 estimated=True 標記，避免被當成正式 HRR 誤導使用者。
        # 只有在末段確實呈下降趨勢 (end < peak) 時才回報正值，否則回報 0。
        # ------------------------------------------------
        lookback_window = min(60, len(hr_arr))
        last_minute_hr = hr_arr[-lookback_window:]

        # 末段最高點 → 末段最後一點的下降；峰值需出現在最後一點之前才算「恢復中」
        peak_idx = int(np.argmax(last_minute_hr))
        peak_hr_in_window = float(last_minute_hr[peak_idx])
        end_hr = float(last_minute_hr[-1])
        # 峰值若就在最後一點 (還在爬升/未降) → 視為無有效恢復段
        hrr_value = int(max(0, peak_hr_in_window - end_hr)) if peak_idx < len(last_minute_hr) - 1 else 0

        # 構建曲線數據 (正規化時間 t: 0~60)
        hrr_curve = [{"t": i, "hr": int(val)} for i, val in enumerate(last_minute_hr)]

        # ------------------------------------------------
        # D. 打包回傳 (對應前端 Props)
        # ------------------------------------------------
        return {
            "ef": {
                "current": current_ef,
                "trend_percentage": ef_trend,
                "history_chart": history_chart_data
            },
            "decoupling": {
                "value": decoupling_rate,
                "first_half_ef": round(ef1, 2),
                "second_half_ef": round(ef2, 2)
            },
            "hrr": {
                "value": hrr_value,
                "estimated": True,  # 非真正 HRR：無冷卻段資料，僅末段心率下降估算
                "curve": hrr_curve
            }
        }

# Shim for backward compatibility with previous calls if any
# (Though we updated cardio_storage to use this class, keeping a function wrapper helps if we missed spots)
def calculate_physiological_insights(hr_stream, pace_stream, history_efs=None):
    analyzer = CardioAnalytics()
    return analyzer.calculate_metrics({"heart_rate": hr_stream, "pace": pace_stream}, history_efs)
