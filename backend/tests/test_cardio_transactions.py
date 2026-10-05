"""Real SQLite transaction regression tests; all files live in TemporaryDirectory."""
import importlib.util
import sys
import tempfile
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from test_cardio_planning import storage, ROOT


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class TransactionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.engine = create_engine('sqlite:///' + self.tmp.name + '/plans.db', connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        db = types.ModuleType('core.db')
        db.Base = declarative_base()
        db.SessionLocal = sessionmaker(bind=self.engine)
        db.init_db = lambda: None
        core = types.ModuleType('core')
        core.__path__ = []
        with patch.dict(sys.modules, {'core': core, 'core.db': db}):
            model = load_module('cardio_transaction_models', ROOT / 'backend/core/models_misc.py')
            training = load_module('cardio_transaction_training', ROOT / 'backend/core/models_training.py')
            with patch.dict(sys.modules, {'core.models_misc': model}):
                self.repo = load_module('cardio_transaction_repo', ROOT / 'backend/repositories/user_blob_repo.py')
            with patch.dict(sys.modules, {'core.models_training': training}):
                self.sessions = load_module('cardio_transaction_sessions', ROOT / 'backend/repositories/cardio_session_repo.py')
        db.Base.metadata.create_all(self.engine)
        repos = types.ModuleType('repositories')
        repos.user_blob_repo = self.repo
        self.repos_patch = patch.dict(sys.modules, {'repositories': repos})
        self.repos_patch.start()
        self.addCleanup(self.repos_patch.stop)
        self.mirror = patch.object(storage, 'save_json_atomic')
        self.mirror_mock = self.mirror.start()
        self.addCleanup(self.mirror.stop)
        legacy = patch.object(storage, '_legacy_plans', return_value=[])
        self.legacy_mock = legacy.start()
        self.addCleanup(legacy.stop)
        path = patch.object(storage, 'DATA_DIR', self.tmp.name)
        path.start()
        self.addCleanup(path.stop)
        self.plan = {"plan_id": "p", "weeks": [
            {"week_index": 1, "bricks": [{"brick_id": name, "distance_km": 5, "duration_min": 30, "status": "pending", "type": "recovery", "subtype": "easy"} for name in ['a', 'b']]},
            {"week_index": 2, "bricks": [{"brick_id": "c", "distance_km": 10, "duration_min": 60, "status": "pending", "type": "recovery", "subtype": "medium"}], "target_mileage_km": 10},
        ]}
        storage.upsert_plan('u', self.plan)

    def test_simultaneous_brick_updates_are_both_retained(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda b: storage.complete_brick('u', b, actual_distance_km=5), ['a', 'b']))
        self.assertEqual([b['status'] for b in results], ['completed', 'completed'])
        self.assertEqual([b['status'] for b in storage.get_latest_plan('u')['weeks'][0]['bricks']], ['completed', 'completed'])

    def test_simultaneous_settlements_scale_once(self):
        def settle(_):
            return storage.settle_week('u', 1, settlement={'adjustments': {'next_week_mileage_multiplier': .8}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(settle, range(2)))
        self.assertEqual([p['weeks'][1]['target_mileage_km'] for p in results], [8, 8])

    def test_simultaneous_first_creation_serializes(self):
        def append(value):
            with self.repo.transaction('new', 'cardio_plans', lambda: []) as state:
                state['payload'].append(value)
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(append, [1, 2]))
        self.assertEqual(sorted(self.repo.get('new', 'cardio_plans')), [1, 2])

    def test_history_projection_is_scoped_and_excludes_streams(self):
        self.sessions.sync('u', {'run': {'metrics': {'distance_km': 5}, 'date': '2026-09-06T00:00:00Z', 'route_data': [1, 2], 'stream_data': [3]}})
        self.sessions.sync('other', {'other-run': {'metrics': {'distance_km': 99}}})
        rows = self.sessions.load_summaries('u')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['metrics']['distance_km'], 5)
        self.assertNotIn('route_data', rows[0])
        self.assertNotIn('stream_data', rows[0])

    def test_full_save_returns_revision_and_rejects_old_revision(self):
        old = storage.get_latest_plan('u')
        saved = storage.save_plan('u', old)
        self.assertNotEqual(saved['updated_at'], old['updated_at'])
        with self.assertRaisesRegex(ValueError, 'plan_changed'):
            storage.save_plan('u', old)

    def test_stale_whole_plan_cannot_erase_completed_brick(self):
        old = storage.get_latest_plan('u')
        storage.complete_brick('u', 'a', actual_distance_km=5)
        with self.assertRaisesRegex(ValueError, 'plan_changed'):
            storage.upsert_plan('u', old, check_revision=True)
        self.assertEqual(storage.get_latest_plan('u')['weeks'][0]['bricks'][0]['status'], 'completed')

    def test_commit_failure_rolls_back_and_does_not_write_mirror(self):
        before = storage.get_latest_plan('u')
        self.mirror_mock.reset_mock()
        with patch.object(self.repo.SessionLocal.class_, 'commit', side_effect=OSError('commit failed')):
            with self.assertRaises(OSError):
                storage.complete_brick('u', 'a', actual_distance_km=5)
        self.assertEqual(storage.get_latest_plan('u'), before)
        self.mirror_mock.assert_not_called()

    def test_mirror_failure_does_not_hide_committed_data(self):
        self.mirror_mock.side_effect = OSError('mirror failed')
        with self.assertLogs(storage.logger, level='WARNING'):
            storage.complete_brick('u', 'a', actual_distance_km=5)
        self.assertEqual(storage.get_latest_plan('u')['weeks'][0]['bricks'][0]['status'], 'completed')

    def test_database_failure_never_reads_legacy_snapshot(self):
        self.legacy_mock.reset_mock()
        with patch.object(self.repo, 'get', side_effect=OSError('database down')):
            with self.assertRaises(OSError):
                storage.get_latest_plan('u')
        self.legacy_mock.assert_not_called()

    def test_deleted_plan_not_revived_from_old_snapshot(self):
        storage.delete_latest_plan('u')
        self.legacy_mock.return_value = [deepcopy(self.plan)]
        self.assertIsNone(storage.get_latest_plan('u'))

    def test_complete_load_window_not_truncated_at_200(self):
        rules = load_module('cardio_load_window_test', ROOT / 'backend/core/cardio_load_history.py')
        now = datetime.now(timezone.utc)
        sessions = [{'session_id': str(i), 'date': now.isoformat()} for i in range(250)]
        sessions += [{'date': (now - timedelta(days=29)).isoformat()}, {'date': (now + timedelta(days=1)).isoformat()}]
        result = rules.select_window(sessions, now - timedelta(days=28), now)
        self.assertEqual(len(result['sessions']), 250)
        self.assertTrue(result['complete'])
        self.assertFalse(rules.select_window([{'date': 'invalid'}], now - timedelta(days=28), now)['complete'])


if __name__ == '__main__':
    unittest.main()
