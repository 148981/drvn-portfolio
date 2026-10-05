"""舊版飲食路由與跑步磚塊寫入：body 裡的 user_id 必須是本人。

真實漏洞：PUT /api/nutrition/meal/{id} 不需登入就能改別人的餐點，
/api/cardio-plan/complete-brick|skip-brick|log-rpe 沒檢查擁有者。
"""
import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _app(router, uid):
    app = FastAPI()

    @app.middleware('http')
    async def identity(request, call_next):
        request.state.user_id = uid
        return await call_next(request)
    app.include_router(router)
    return TestClient(app)


class LegacyNutritionOwnerTest(unittest.TestCase):
    def setUp(self):
        self.nut = types.ModuleType('core.nutrition')
        for n in ['log_meal', 'update_meal', 'delete_meal']:
            setattr(self.nut, n, Mock(return_value=True))
        core = types.ModuleType('core'); core.__path__ = []; core.nutrition = self.nut
        with patch.dict(sys.modules, {'core': core, 'core.nutrition': self.nut}):
            sys.modules.pop('api_nutrition', None)
            self.routes = importlib.import_module('api_nutrition')
        self.meal = dict(user_id='other', name='飯', calories=200)

    def test_other_user_blocked(self):
        c = _app(self.routes.router, 'owner')
        self.assertEqual(c.post('/api/nutrition/meal', json=self.meal).status_code, 403)
        self.assertEqual(c.put('/api/nutrition/meal/1', json=self.meal).status_code, 403)
        self.assertEqual(c.delete('/api/nutrition/meal/1?user_id=other').status_code, 403)
        for n in ['log_meal', 'update_meal', 'delete_meal']:
            getattr(self.nut, n).assert_not_called()

    def test_anonymous_blocked(self):
        c = _app(self.routes.router, None)
        self.assertEqual(c.put('/api/nutrition/meal/1', json=self.meal).status_code, 401)

    def test_owner_allowed(self):
        c = _app(self.routes.router, 'owner')
        self.assertEqual(c.put('/api/nutrition/meal/1', json={**self.meal, 'user_id': 'owner'}).status_code, 200)


class CardioBrickOwnerTest(unittest.TestCase):
    def setUp(self):
        self.cps = types.ModuleType('core.cardio_plan_storage')
        for n in ['complete_brick', 'skip_brick', 'log_brick_rpe']:
            setattr(self.cps, n, Mock(return_value={'id': 'b1'}))
        core = types.ModuleType('core'); core.__path__ = []; core.cardio_plan_storage = self.cps
        with patch.dict(sys.modules, {'core': core, 'core.cardio_plan_storage': self.cps}):
            sys.modules.pop('api_cardio_plan_endpoints', None)
            self.routes = importlib.import_module('api_cardio_plan_endpoints')

    def test_other_user_blocked(self):
        c = _app(self.routes.router, 'owner')
        self.assertEqual(c.post('/api/cardio-plan/complete-brick', json={'user_id': 'other', 'brick_id': 'b1'}).status_code, 403)
        self.assertEqual(c.post('/api/cardio-plan/skip-brick', json={'user_id': 'other', 'brick_id': 'b1'}).status_code, 403)
        self.assertEqual(c.post('/api/cardio-plan/log-rpe', json={'user_id': 'other', 'brick_id': 'b1', 'rpe': 5}).status_code, 403)
        for n in ['complete_brick', 'skip_brick', 'log_brick_rpe']:
            getattr(self.cps, n).assert_not_called()

    def test_owner_allowed(self):
        c = _app(self.routes.router, 'owner')
        self.assertEqual(c.post('/api/cardio-plan/skip-brick', json={'user_id': 'owner', 'brick_id': 'b1'}).status_code, 200)


if __name__ == '__main__':
    unittest.main()
