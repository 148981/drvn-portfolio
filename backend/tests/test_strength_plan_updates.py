"""HTTP route regression with an in-memory repository; no user database."""
from copy import deepcopy
from contextlib import nullcontext
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api_plan_endpoints import router


class PlanUpdateTests(unittest.TestCase):
    def setUp(self):
        self.plans = [
            {"plan_id": key, "weeks": [{"days": [{"exercises": [{"name": key}]}]}]}
            for key in ["target", "latest"]
        ]
        self.before = deepcopy(self.plans)
        self.writes = []
        repo = types.SimpleNamespace(load=lambda _: deepcopy(self.plans), save=self.save, transaction=lambda _: nullcontext())
        modules = patch.dict(sys.modules, {"repositories": types.SimpleNamespace(plan_repo=repo)})
        modules.start()
        self.addCleanup(modules.stop)
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def save(self, user, plans):
        self.writes.append((user, deepcopy(plans)))
        self.plans = deepcopy(plans)

    def request(self, plan="target", day=1, week=1):
        return self.client.put(f"/api/plan/{plan}/day/{day}", json={
            "user_id": "test-user", "week": week, "exercises": [{"name": "replacement"}]
        })

    def test_missing_plan_rejected_without_writing_latest(self):
        self.assertEqual(self.request(plan="missing").status_code, 404)
        self.assertEqual(self.plans, self.before)
        self.assertEqual(self.writes, [])

    def test_invalid_day_and_week_never_corrected(self):
        for day, week in [(0, 1), (-1, 1), (2, 1), (5, 1), (1, 0), (1, 2)]:
            with self.subTest(day=day, week=week):
                self.assertEqual(self.request(day=day, week=week).status_code, 400)
                self.assertEqual(self.plans, self.before)
                self.assertEqual(self.writes, [])

    def test_valid_update_only_changes_requested_plan(self):
        self.assertEqual(self.request().status_code, 200)
        by_id = {p['plan_id']: p for p in self.plans}
        self.assertEqual(by_id['latest'], self.before[1])
        self.assertEqual(by_id['target']['weeks'][0]['days'][0]['exercises'], [{"name": "replacement"}])
        self.assertEqual(len(self.writes), 1)

    def test_empty_repository_is_not_server_error(self):
        self.plans = []
        self.assertEqual(self.request().status_code, 404)
        self.assertEqual(self.writes, [])


if __name__ == '__main__':
    unittest.main()
