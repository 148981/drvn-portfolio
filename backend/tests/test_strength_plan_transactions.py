"""Real SQLite concurrency and rollback checks, isolated from application data."""
import importlib.util
import sys
import tempfile
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

ROOT = Path(__file__).resolve().parents[1]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class PlanTransactions(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        engine = create_engine(f'sqlite:///{tmp.name}/test.db', connect_args={'timeout': 10})
        self.addCleanup(engine.dispose)
        db = types.SimpleNamespace(Base=declarative_base(), SessionLocal=sessionmaker(bind=engine), init_db=lambda: None)
        with patch.dict(sys.modules, {'core': types.ModuleType('core'), 'core.db': db}):
            model = load('isolated_strength_models', ROOT / 'core/models_training.py')
            with patch.dict(sys.modules, {'core.models_training': model}):
                self.repo = load('isolated_strength_repo', ROOT / 'repositories/plan_repo.py')
        db.Base.metadata.create_all(engine)

    def test_concurrent_creates_preserve_both_from_empty_user(self):
        gate = Barrier(2)
        def create(identifier):
            gate.wait()
            with self.repo.transaction('u'):
                plans = self.repo.load('u')
                plans.append({'plan_id': identifier})
                self.repo.save('u', plans)
        with ThreadPoolExecutor(2) as pool:
            list(pool.map(create, ['a', 'b']))
        self.assertEqual({p['plan_id'] for p in self.repo.load('u')}, {'a', 'b'})

    def test_concurrent_edits_to_distinct_fields_survive(self):
        self.repo.save('u', [{'plan_id': 'p'}])
        gate = Barrier(2)
        def edit(field):
            gate.wait()
            with self.repo.transaction('u'):
                plans = self.repo.load('u')
                plans[0][field] = True
                self.repo.save('u', plans)
        with ThreadPoolExecutor(2) as pool:
            list(pool.map(edit, ['day_edited', 'schedule_edited']))
        self.assertEqual(self.repo.load('u'), [{'plan_id': 'p', 'day_edited': True, 'schedule_edited': True}])

    def test_rollback_after_save_preserves_original(self):
        self.repo.save('u', [{'plan_id': 'p'}])
        with self.assertRaises(ValueError):
            with self.repo.transaction('u'):
                self.repo.save('u', [{'plan_id': 'other'}])
                raise ValueError('abort')
        self.assertEqual(self.repo.load('u'), [{'plan_id': 'p'}])

    def test_cross_user_nested_transaction_rejected(self):
        with self.repo.transaction('u'):
            with self.assertRaises(RuntimeError):
                with self.repo.transaction('other'):
                    pass

if __name__ == '__main__':
    unittest.main()
