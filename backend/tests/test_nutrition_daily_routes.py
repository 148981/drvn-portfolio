"""Route ownership and missing-record behavior without touching user data."""
import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

class NutritionRoutesTest(unittest.TestCase):
    def setUp(self):
        self.db = types.ModuleType('core.nutrition_db')
        for name in ['log_meal_sql', 'update_meal_sql', 'delete_meal_sql', 'save_nutrition_targets']:
            setattr(self.db, name, Mock(return_value=False))
        core = types.ModuleType('core')
        core.__path__ = []
        core.nutrition_db = self.db
        with patch.dict(sys.modules, {'core': core, 'core.nutrition_db': self.db}):
            sys.modules.pop('api_nutrition_sql', None)
            routes = importlib.import_module('api_nutrition_sql')
        app = FastAPI()
        @app.middleware('http')
        async def identity(request, call_next):
            request.state.user_id = 'owner'
            return await call_next(request)
        app.include_router(routes.router)
        self.client = TestClient(app)
        self.meal = dict(user_id='other', name='飯', calories=200, protein=4, carbs=44, fats=1)

    def test_all_writes_enforce_owner(self):
        for method, url, body in [('post', '/api/nutrition/sql/log', self.meal),
                                 ('put', '/api/nutrition/sql/meal/1', self.meal),
                                 ('patch', '/api/nutrition/sql/meal/1', self.meal),
                                 ('post', '/api/nutrition/sql/targets', {'user_id': 'other'})]:
            self.assertEqual(getattr(self.client, method)(url, json=body).status_code, 403)
        self.assertEqual(self.client.delete('/api/nutrition/sql/meal/1?user_id=other').status_code, 403)
        for name in ['log_meal_sql', 'update_meal_sql', 'delete_meal_sql', 'save_nutrition_targets']:
            getattr(self.db, name).assert_not_called()

    def test_missing_meal_is_404(self):
        self.assertEqual(self.client.delete('/api/nutrition/sql/meal/missing?user_id=owner').status_code, 404)
        for method in ['put', 'patch']:
            self.assertEqual(getattr(self.client, method)('/api/nutrition/sql/meal/missing', json={**self.meal, 'user_id': 'owner'}).status_code, 404)

    def test_owner_can_log(self):
        self.db.log_meal_sql.return_value = {'id': 1}
        self.assertEqual(self.client.post('/api/nutrition/sql/log', json={**self.meal, 'user_id': 'owner'}).status_code, 200)

    def test_negative_or_empty_food_is_rejected(self):
        for change in [{'calories': -1}, {'protein': -1}, {'grams': -10}, {'name': '  '}]:
            response = self.client.post('/api/nutrition/sql/log', json={**self.meal, 'user_id': 'owner', **change})
            self.assertEqual(response.status_code, 422)
        self.db.log_meal_sql.assert_not_called()

if __name__ == '__main__':
    unittest.main()
