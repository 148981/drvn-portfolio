"""Real transaction/receipt tests against an isolated temporary database."""
import os
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

temp = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f'sqlite:///{temp.name}/program.db'
os.environ['APP_ENV'] = 'development'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api_plan_endpoints import router
from api_nutrition_goals import router as goals_router
from core.db import init_db, SessionLocal
from core.models_misc import UserBlob
from core.committed_nutrition import read_committed_plan, plan_targets
from repositories import plan_repo

init_db()
app = FastAPI()
@app.middleware('http')
async def identity(request, call_next):
    import json
    raw = await request.body()
    try:
        body = json.loads(raw or b'{}')
        import re
        request.state.user_id = body.get('user_id') or (re.search(r'/([A-Za-z0-9_-]+)(?:/current)?$', request.url.path).group(1) if re.search(r'/([A-Za-z0-9_-]+)(?:/current)?$', request.url.path) else None)
    except Exception:
        import re
        match = re.search(r'/([A-Za-z0-9_-]+)(?:/current)?$', request.url.path)
        request.state.user_id = match.group(1) if match else None
    return await call_next(request)
app.include_router(router)
app.include_router(goals_router)
client = TestClient(app)


class ProgramConsistencyTests(unittest.TestCase):
    def payload(self, user):
        return {'user_id': user, 'program_id': 'cycle-1',
                'strength': {'weeks': [{'days': [{'exercises': [{'name': 'squat'}]}]}]},
                'nutrition': {'goalType': 'recomp', 'adjustedIntake': 2100, 'newProtein': 150, 'newCarbs': 240, 'newFat': 60}}

    def test_atomic_receipt_and_owner_isolation(self):
        payload = self.payload('receipt-user')
        first = client.post('/api/training-program/activate', json=payload)
        self.assertEqual(first.status_code, 200, first.text)
        retry = client.post('/api/training-program/activate', json=payload)
        self.assertEqual(first.json(), retry.json())
        self.assertEqual(len(plan_repo.load('receipt-user')), 1)
        self.assertEqual(plan_targets(read_committed_plan('receipt-user'))['calories'], 2100)
        goals = client.get('/api/user/nutrition-goals/receipt-user').json()
        self.assertEqual(goals['target_calories'], 2100)
        self.assertEqual(goals['plan']['program_id'], 'cycle-1')
        self.assertIsNone(read_committed_plan('other-user'))
        payload['nutrition']['adjustedIntake'] = 2200
        self.assertEqual(client.post('/api/training-program/activate', json=payload).status_code, 409)
        self.assertEqual(plan_targets(read_committed_plan('receipt-user'))['calories'], 2100)

    def test_invalid_track_does_not_partially_commit(self):
        payload = self.payload('invalid-user')
        payload['nutrition']['newProtein'] = -1
        self.assertEqual(client.post('/api/training-program/activate', json=payload).status_code, 422)
        self.assertEqual(plan_repo.load('invalid-user'), [])
        self.assertIsNone(read_committed_plan('invalid-user'))

    def test_omitted_track_keeps_previous_cycle(self):
        payload = self.payload('retain-user')
        self.assertEqual(client.post('/api/training-program/activate', json=payload).status_code, 200)
        previous = plan_repo.load('retain-user')
        payload.pop('strength')
        payload['program_id'] = 'nutrition-only'
        self.assertEqual(client.post('/api/training-program/activate', json=payload).status_code, 200)
        self.assertEqual(plan_repo.load('retain-user'), previous)
        current = client.get('/api/training-program/retain-user/current').json()
        self.assertEqual(current['strength']['program_id'], 'cycle-1')
        self.assertEqual(current['nutrition']['program_id'], 'nutrition-only')
        self.assertEqual(client.post('/api/training-program/activate', json=self.payload('retain-user')).status_code, 409)

    def test_failure_after_running_write_rolls_back_all_tracks(self):
        payload = self.payload('rollback-user')
        payload['running'] = {'weeks': [{'week_index': 1, 'bricks': [{'type': 'recovery', 'distance_km': 2}]}]}
        with patch.object(plan_repo, 'save', side_effect=RuntimeError('injected storage failure')):
            with self.assertRaises(RuntimeError):
                client.post('/api/training-program/activate', json=payload)
        with SessionLocal() as db:
            self.assertEqual(db.query(UserBlob).filter_by(user_id='rollback-user').count(), 0)
        self.assertEqual(plan_repo.load('rollback-user'), [])

    def test_existing_run_reschedule_commits_with_strength(self):
        initial = self.payload('schedule-user')
        initial['running'] = {'weeks': [{'week_index': 1, 'bricks': [{'brick_id': 'run-a', 'type': 'recovery', 'distance_km': 2}]}]}
        self.assertEqual(client.post('/api/training-program/activate', json=initial).status_code, 200)
        change = {'user_id': 'schedule-user', 'program_id': 'strength-next', 'strength': initial['strength'],
                  'running_schedule': {'plan_id': 'cycle-1:run', 'day_overrides': {'run-a': 4}}}
        result = client.post('/api/training-program/activate', json=change)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(client.post('/api/training-program/activate', json=change).json(), result.json())
        current = client.get('/api/training-program/schedule-user/current').json()
        self.assertEqual(current['running']['plan_id'], 'cycle-1:run')
        self.assertEqual(current['running']['day_overrides'], {'run-a': 4})
        self.assertEqual(current['strength']['program_id'], 'strength-next')

    def test_review_persists_for_exact_cycle(self):
        client.post('/api/training-program/activate', json=self.payload('review-user'))
        review = {'user_id': 'review-user', 'track': 'nutrition', 'cycle_id': 'cycle-1:nutrition', 'feeling': 'tired'}
        self.assertEqual(client.post('/api/training-program/review', json=review).status_code, 200)
        snapshot = client.get('/api/training-program/review-user/current').json()
        self.assertEqual(snapshot['reviews']['nutrition:cycle-1:nutrition'][-1]['feeling'], 'tired')
        self.assertEqual(client.get('/api/training-program/other-review-user/current').json()['reviews'], {})
        review['cycle_id'] = 'old-cycle'
        self.assertEqual(client.post('/api/training-program/review', json=review).status_code, 409)


if __name__ == '__main__':
    unittest.main()
