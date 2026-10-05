"""
pytest 共用設定。

讓測試能 `import config`, `import api_auth` 等（把 backend/ 放進 sys.path），
並提供測試用的安全環境變數，避免測試誤觸 production fail-fast。
"""
import os
import sys

# backend/ 根目錄加入 import path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ── CI / 無 ML 環境也能跑 repo 測試 ──────────────────────────────────
# repo 測試會經由 core/__init__ 觸發 import 重型視覺套件（mediapipe/opencv）。
# 這些在單元測試中用不到，缺套件時用 stub 取代，讓 CI 不必安裝它們（快很多）。
from unittest.mock import MagicMock as _Mock
for _light in ("cv2", "matplotlib", "matplotlib.pyplot"):
    try:
        __import__(_light)
    except Exception:
        sys.modules.setdefault(_light, _Mock())
try:
    import mediapipe  # noqa: F401
except Exception:
    for _mp in ("mediapipe", "mediapipe.tasks", "mediapipe.tasks.python",
                "mediapipe.tasks.python.vision", "mediapipe.framework",
                "mediapipe.framework.formats"):
        sys.modules.setdefault(_mp, _Mock())

# 測試一律以 development 跑，且給足夠長度的測試機密
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_value_at_least_32_characters_long")
os.environ.setdefault("SESSION_SECRET", "test_session_secret_value_at_least_32_characters")
