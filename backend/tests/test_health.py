"""
健康檢查端點的整合測試。
注意：會 import main（連帶載入 mediapipe/opencv 等較重套件），
僅在這些相依可用時執行，否則自動跳過。
"""
import pytest

pytest.importorskip("fastapi")


@pytest.fixture(scope="module")
def client():
    try:
        from fastapi.testclient import TestClient
        import main
    except Exception as e:  # 缺重依賴（如 mediapipe）時跳過，不算失敗
        pytest.skip(f"無法載入 main app（可能缺少視覺相依）：{e}")
    return TestClient(main.app)


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_readyz(client):
    r = client.get("/readyz")
    # DB 可連線回 200，否則 503；兩者都代表探針正常運作
    assert r.status_code in (200, 503)
    assert "status" in r.json()


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
