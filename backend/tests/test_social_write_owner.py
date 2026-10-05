"""社群寫入：追蹤、取消追蹤、動態分享設定 —— body 裡的 user_id 必須是本人。

真實漏洞：POST /api/social/friends/follow|unfollow|privacy 沒檢查擁有者，
帶別人的 user_id 就能替對方追蹤任何人，或把對方的動態分享關掉。
（首次設定精靈會呼叫這三支。）
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import api_friends  # noqa: E402


def _client(uid):
    app = FastAPI()

    @app.middleware('http')
    async def identity(request, call_next):
        request.state.user_id = uid
        return await call_next(request)
    app.include_router(api_friends.router)
    return TestClient(app)


class SocialWriteOwnerTest(unittest.TestCase):
    def setUp(self):
        self.p_follow = patch.object(api_friends.friends_storage, 'follow', return_value=True)
        self.p_unfollow = patch.object(api_friends.friends_storage, 'unfollow', return_value=True)
        self.p_graph = patch.object(api_friends.friends_storage, 'get_graph',
                                    return_value={'counts': {}, 'following': [], 'followers': [], 'friends': []})
        self.p_rel = patch.object(api_friends.friends_storage, 'relation_to', return_value='following')
        self.p_load = patch.object(api_friends, '_load_privacy', return_value={})
        self.p_save = patch.object(api_friends, '_save_privacy')
        self.follow = self.p_follow.start(); self.unfollow = self.p_unfollow.start()
        self.p_graph.start(); self.p_rel.start(); self.p_load.start()
        self.save = self.p_save.start()

    def tearDown(self):
        patch.stopall()

    def test_other_user_blocked(self):
        c = _client('owner')
        body = {'user_id': 'victim', 'target_id': 'x'}
        self.assertEqual(c.post('/api/social/friends/follow', json=body).status_code, 403)
        self.assertEqual(c.post('/api/social/friends/unfollow', json=body).status_code, 403)
        self.assertEqual(c.post('/api/social/friends/privacy',
                                json={'user_id': 'victim', 'share_activities': False}).status_code, 403)
        self.follow.assert_not_called(); self.unfollow.assert_not_called(); self.save.assert_not_called()

    def test_anonymous_blocked(self):
        c = _client(None)
        self.assertEqual(c.post('/api/social/friends/follow', json={'user_id': 'a', 'target_id': 'b'}).status_code, 401)
        self.assertEqual(c.post('/api/social/friends/privacy', json={'user_id': 'a'}).status_code, 401)

    def test_owner_allowed(self):
        c = _client('owner')
        self.assertEqual(c.post('/api/social/friends/follow', json={'user_id': 'owner', 'target_id': 'x'}).status_code, 200)
        self.assertEqual(c.post('/api/social/friends/unfollow', json={'user_id': 'owner', 'target_id': 'x'}).status_code, 200)
        r = c.post('/api/social/friends/privacy', json={'user_id': 'owner', 'share_activities': False})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['share_activities'])
        self.follow.assert_called_once_with('owner', 'x')


if __name__ == '__main__':
    unittest.main()
