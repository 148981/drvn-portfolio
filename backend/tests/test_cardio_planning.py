"""Isolated tests: no application startup, user database, or filesystem writes.

Run: PYTHONDONTWRITEBYTECODE=1 CARDIO_TEST_NODE=/path/to/node python3 backend/tests/test_cardio_planning.py
"""
import importlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import types
import unittest
from copy import deepcopy
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
# Avoid core/__init__.py, which boots the unrelated motion-analysis dependencies.
package = types.ModuleType("cardio_planning_test_core")
package.__path__ = [str(ROOT / "backend/core")]
sys.modules[package.__name__] = package
rules = importlib.import_module("cardio_planning_test_core.cardio_plan_rules")
storage = importlib.import_module("cardio_planning_test_core.cardio_plan_storage")
spec = importlib.util.spec_from_file_location("cardio_planning_test_api", ROOT / "backend/api_cardio_plan_endpoints.py")
api = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = api
with patch.dict(sys.modules, {"core": package}):
    spec.loader.exec_module(api)


class CardioPlanningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        node = os.environ.get("CARDIO_TEST_NODE", "node")
        cls.fixtures = json.loads(subprocess.check_output([
            node, str(ROOT / "frontend/scripts/verify_cardio_planning.mjs"), "--fixtures"
        ], text=True))

    def setUp(self):
        token = storage._active_transaction.set(("u", {"payload": []}))
        self.addCleanup(storage._active_transaction.reset, token)
        self.saved = [{"plan_id": "p", "updated_at": "v1", "weeks": [
            {"week_index": 1, "bricks": [], "settlement": None}, deepcopy(self.fixtures[0]["week"])
        ]}]
        self.load_patch = patch.object(storage, "load_user_plans", side_effect=lambda _: self.saved)
        self.save_patch = patch.object(storage, "save_user_plans", side_effect=self.persist)
        self.load_patch.start()
        self.writer = self.save_patch.start()
        self.addCleanup(self.load_patch.stop)
        self.addCleanup(self.save_patch.stop)

    def persist(self, uid, plans):
        self.saved = deepcopy(plans)

    def settle(self, **kwargs):
        return storage.settle_week("u", 1, settlement={"verdict": "demote", "adjustments": self.fixtures[0]["adjustments"]}, **kwargs)

    def test_frontend_backend_parity(self):
        for f in self.fixtures:
            self.assertEqual(rules.adjust_week(f["week"], f["adjustments"]), f["expected"])
            meta = rules.summarize_plan(deepcopy(f["plan"]))["meta"]
            self.assertEqual(meta["totals"], f["meta"]["totals"])
            self.assertEqual(meta["mileage_audit"], f["meta"]["mileage_audit"])

    def test_week_completion_counts_partial_and_preserves_zero(self):
        week = {"target_mileage_km": 10, "bricks": [
            {"status": "partial", "distance_km": 5, "actual_distance_km": 2},
            {"status": "completed", "distance_km": 5, "actual_distance_km": 0},
        ]}
        result = storage.week_completion(week)
        self.assertEqual(result["total_mileage_actual_km"], 2)
        self.assertEqual(result["mileage_completion_rate"], .2)

    def test_save_and_retry_apply_once(self):
        result = self.settle(plan_id="p", expected_updated_at="v1")
        self.assertEqual(result["weeks"][1]["target_mileage_km"], 8)
        self.assertEqual(result["meta"]["totals"]["total_km"], 8)
        self.assertEqual(self.settle(expected_updated_at="v1"), result)
        self.assertEqual(self.writer.call_count, 1)

    def test_decline_preserves_prescriptions_and_calibration(self):
        before = deepcopy(self.saved[0]["weeks"][1])
        result = self.settle(apply_adjustments=False, pace_calibration={"new_baseline_pace_5k_sec": 400, "samples": 1})
        self.assertEqual(result["weeks"][1], before)
        self.assertNotIn("meta", result)

    def test_started_week_preserved(self):
        self.saved[0]["weeks"][1]["bricks"][0]["status"] = "partial"
        before = deepcopy(self.saved[0]["weeks"][1]["bricks"])
        result = self.settle()
        self.assertEqual(result["weeks"][1]["bricks"], before)
        self.assertFalse(result["weeks"][0]["settlement"]["adjustments_applied"])

    def test_stale_and_replaced_plan_rejected(self):
        for kwargs in ({"plan_id": "other"}, {"expected_updated_at": "v0"}):
            with self.assertRaisesRegex(ValueError, "plan_changed"):
                self.settle(**kwargs)
        self.writer.assert_not_called()

    def test_failed_save_does_not_mutate_cache(self):
        before = deepcopy(self.saved)
        self.writer.side_effect = OSError("disk unavailable")
        with self.assertRaises(OSError):
            self.settle()
        self.assertEqual(self.saved, before)

    def test_calibration_only_changes_unstarted_future_bricks(self):
        p = self.saved[0]
        p["weeks"][0]["bricks"] = [deepcopy(p["weeks"][1]["bricks"][0])]
        p["weeks"][1]["bricks"][0]["status"] = "partial"
        before = deepcopy(p)
        result = self.settle(pace_calibration={"new_baseline_pace_5k_sec": 400, "samples": 1})
        self.assertEqual(result["weeks"][0]["bricks"], before["weeks"][0]["bricks"])
        self.assertEqual(result["weeks"][1]["bricks"][0], before["weeks"][1]["bricks"][0])
        self.assertEqual(result["weeks"][1]["bricks"][1]["target_pace_sec"], 400 + rules.PACE_SHIFT["medium"])  # 6 km 中距離跑：新基準 + 中距離偏移

    def test_endpoint_validation_ownership_conflict_and_success(self):
        app = FastAPI()
        @app.middleware("http")
        async def identity(request, call_next):
            request.state.user_id = "u"
            return await call_next(request)
        app.include_router(api.router)
        client = TestClient(app)
        url = "/api/cardio-plan/settle-week"
        body = {"user_id": "u", "week_index": 1, "plan_id": "p", "settlement": {"adjustments": self.fixtures[0]["adjustments"]}}
        self.assertEqual(client.post(url, json={**body, "user_id": "other"}).status_code, 403)
        self.assertEqual(client.post(url, json={**body, "week_index": 0}).status_code, 422)
        self.assertEqual(client.post(url, json={**body, "settlement": {"adjustments": {"next_week_mileage_multiplier": -1}}}).status_code, 422)
        self.assertEqual(client.post(url, json={**body, "expected_updated_at": "v0"}).status_code, 409)
        self.assertEqual(client.post(url, json={**body, "week_index": 99}).status_code, 404)
        response = client.post(url, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["plan"]["weeks"][1]["target_mileage_km"], 8)


if __name__ == "__main__":
    unittest.main()
