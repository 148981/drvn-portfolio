"""Local-only browser fixture server. Uses a temporary SQLite DB, never app data."""
from datetime import date
from types import SimpleNamespace
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn
from test_cardio_transactions import TransactionTests
from test_cardio_planning import api, storage


if __name__ == '__main__':
    fixture = TransactionTests()
    fixture.setUp()
    sys.modules['core'] = sys.modules['cardio_planning_test_core']
    sys.modules['repositories'].cardio_session_repo = SimpleNamespace(load_summaries=lambda uid: [])
    app = FastAPI()
    fail_once = {'value': False}

    @app.middleware('http')
    async def identity(request: Request, call_next):
        request.state.user_id = 'u'
        if request.url.path.endswith('/settle-week') and fail_once['value']:
            fail_once['value'] = False
            return JSONResponse({'detail': 'test write failure'}, status_code=503)
        return await call_next(request)

    @app.post('/__test/reset')
    async def reset():
        fixture.repo.put('u', 'cardio_plans', [])
        p = fixture.plan
        p.update(start_date=date.today().isoformat(), total_weeks=2, goal='aerobic_base', sessions_per_week=2)
        p['weeks'][0]['bricks'][0].update(status='partial', actual_distance_km=2, actual_duration_min=15, user_rpe=9)
        storage.upsert_plan('u', p)
        return {'ok': True}

    @app.post('/__test/fail-once')
    async def fail():
        fail_once['value'] = True
        return {'ok': True}

    app.include_router(api.router)
    try:
        uvicorn.run(app, host='127.0.0.1', port=8877, log_level='warning')
    finally:
        fixture.doCleanups()
