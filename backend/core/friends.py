"""
Friends Management Module - Friend Requests, Friendships, and Discovery
"""
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime
from pathlib import Path
import os
import uuid
from .json_cache import load_json_cached, save_json_atomic
from .coach_profile import get_user_profile

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))

# ============================================================================
# Data Models
# ============================================================================

class FriendRequest(BaseModel):
    request_id: str
    from_user_id: str
    to_user_id: str
    status: str = "pending"  # "pending", "accepted", "declined"
    created_at: str
    updated_at: str

class Friendship(BaseModel):
    user_id_1: str
    user_id_2: str
    created_at: str

# ============================================================================
# Storage System
# ============================================================================

class FriendsStorage:
    """File-based storage for friends features"""
    
    def __init__(self, data_dir: str = DATA_DIR):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self.requests_file = self.data_dir / 'friend_requests.json'
        self.friendships_file = self.data_dir / 'friendships.json'
        self.blocks_file = self.data_dir / 'blocks.json'
        # ⚠️ 2026-09：這裡原本叫 'kudos.json'，與 core/social.py 的社群牆按讚
        #    「同名不同形狀」—— 兩邊都寫進 social_repo 的同一個 "kudos" 集合。
        #    friends 存 {user_id, activity_id}，social 讀 k['to_activity_id']，
        #    所以只要有人在好友動態按過一次讚，整面社群牆就永久 500。
        #    改成自己的集合；舊資料由 _split_legacy_kudos_once() 一次性搬過來。
        self.kudos_file = self.data_dir / 'friend_kudos.json'
        # 追蹤圖（有向邊）：{follower_id, following_id, created_at}
        # 「粉絲」= 單向追蹤我的人；「好友」= 互相追蹤 或 已接受的好友請求。
        self.follows_file = self.data_dir / 'follows.json'

        # Initialize files if they don't exist
        for file in [self.requests_file, self.friendships_file, self.blocks_file, self.kudos_file, self.follows_file]:
            if not file.exists():
                file.write_text('[]')
    
    def _load_json(self, file_path: Path) -> List[Dict]:
        # Phase 2：改 DB（social_collections 表，以集合名稱為 key）。
        from repositories import social_repo
        return social_repo.load(Path(file_path).stem)

    def _save_json(self, file_path: Path, data: List[Dict]):
        from repositories import social_repo
        social_repo.save(Path(file_path).stem, data)
    
    # --- Friend Requests ---
    
    def send_request(self, from_user_id: str, to_user_id: str) -> Dict:
        if from_user_id == to_user_id:
            raise ValueError("Cannot send friend request to yourself")
            
        if self.is_blocked(from_user_id, to_user_id):
            raise ValueError("Action not permitted")
            
        # Check if already friends
        if self.are_friends(from_user_id, to_user_id):
            raise ValueError("Already friends")
            
        requests = self._load_json(self.requests_file)
        
        # Check for existing pending request
        for req in requests:
            if req['status'] == 'pending':
                if req['from_user_id'] == from_user_id and req['to_user_id'] == to_user_id:
                    return req
                if req['from_user_id'] == to_user_id and req['to_user_id'] == from_user_id:
                    # They already sent you a request! Auto-accept or just return error
                    raise ValueError("This user already sent you a friend request")

        now = datetime.now().isoformat()
        new_req = FriendRequest(
            request_id=str(uuid.uuid4()),
            from_user_id=from_user_id,
            to_user_id=to_user_id,
            created_at=now,
            updated_at=now
        )
        
        requests.append(new_req.dict())
        self._save_json(self.requests_file, requests)
        return new_req.dict()
        
    def respond_to_request(self, to_user_id: str, request_id: str, action: str) -> bool:
        """action: 'accept' or 'decline'"""
        if action not in ['accept', 'decline']:
            raise ValueError("Invalid action. Must be 'accept' or 'decline'")
            
        requests = self._load_json(self.requests_file)
        req_index = next((i for i, r in enumerate(requests) if r['request_id'] == request_id), None)
        
        if req_index is None:
            raise ValueError("Friend request not found")
            
        req = requests[req_index]
        if req['to_user_id'] != to_user_id:
            raise ValueError("Unauthorized to respond to this request")
            
        if req['status'] != 'pending':
            raise ValueError(f"Request is already {req['status']}")
            
        now = datetime.now().isoformat()
        requests[req_index]['status'] = action + 'ed'
        requests[req_index]['updated_at'] = now
        self._save_json(self.requests_file, requests)
        
        if action == 'accept':
            self._create_friendship(req['from_user_id'], req['to_user_id'])
            
        return True

    def get_pending_requests(self, user_id: str) -> List[Dict]:
        """Get requests SENT TO the user"""
        requests = self._load_json(self.requests_file)
        pending = [r for r in requests if r['to_user_id'] == user_id and r['status'] == 'pending']
        
        # Hydrate with user profiles
        for req in pending:
            profile = get_user_profile(req['from_user_id']) or {}
            req['from_user'] = {
                'name': profile.get('name', req['from_user_id']),
                'avatar': profile.get('avatar'),
                'tag': profile.get('tag')
            }
        return pending

    # --- Friendships ---
    
    def _create_friendship(self, user1: str, user2: str):
        # Order IDs consistently to prevent duplicates
        u1, u2 = sorted([user1, user2])
        friendships = self._load_json(self.friendships_file)
        
        # Check if exists
        if any(f['user_id_1'] == u1 and f['user_id_2'] == u2 for f in friendships):
            return
            
        friendships.append(Friendship(
            user_id_1=u1,
            user_id_2=u2,
            created_at=datetime.now().isoformat()
        ).dict())
        self._save_json(self.friendships_file, friendships)

    def are_friends(self, user1: str, user2: str) -> bool:
        u1, u2 = sorted([user1, user2])
        friendships = self._load_json(self.friendships_file)
        return any(f['user_id_1'] == u1 and f['user_id_2'] == u2 for f in friendships)
        
    def get_friends(self, user_id: str) -> List[Dict]:
        friendships = self._load_json(self.friendships_file)
        friend_ids = []
        for f in friendships:
            if f['user_id_1'] == user_id:
                friend_ids.append(f['user_id_2'])
            elif f['user_id_2'] == user_id:
                friend_ids.append(f['user_id_1'])
                
        # Hydrate
        friends = []
        for fid in friend_ids:
            profile = get_user_profile(fid) or {}
            friends.append({
                'user_id': fid,
                'name': profile.get('name', fid),
                'avatar': profile.get('avatar'),
                'tag': profile.get('tag'),
                'bio': profile.get('bio'),
                'city': profile.get('city'),
                'is_running': profile.get('is_running', False)
            })
        return friends
        
    def remove_friend(self, user_id: str, friend_id: str) -> bool:
        u1, u2 = sorted([user_id, friend_id])
        friendships = self._load_json(self.friendships_file)
        original_len = len(friendships)
        friendships = [f for f in friendships if not (f['user_id_1'] == u1 and f['user_id_2'] == u2)]
        
        if len(friendships) < original_len:
            self._save_json(self.friendships_file, friendships)
            
            # Also cleanup any request history to allow re-adding later
            requests = self._load_json(self.requests_file)
            requests = [r for r in requests if not (
                (r['from_user_id'] == user_id and r['to_user_id'] == friend_id) or
                (r['from_user_id'] == friend_id and r['to_user_id'] == user_id)
            )]
            self._save_json(self.requests_file, requests)
            return True
        return False

    # --- Block System ---
    
    def block_user(self, user_id: str, blocked_id: str) -> bool:
        if user_id == blocked_id:
            raise ValueError("Cannot block yourself")
            
        blocks = self._load_json(self.blocks_file)
        # Check if already blocked
        if any(b.get('user_id') == user_id and b.get('blocked_id') == blocked_id for b in blocks):
            return True
            
        blocks.append({
            'user_id': user_id,
            'blocked_id': blocked_id,
            'created_at': datetime.now().isoformat()
        })
        self._save_json(self.blocks_file, blocks)
        
        # Remove any existing friendships
        self.remove_friend(user_id, blocked_id)
        
        # Remove any pending requests between them
        requests = self._load_json(self.requests_file)
        original_len = len(requests)
        requests = [r for r in requests if not (
            (r['from_user_id'] == user_id and r['to_user_id'] == blocked_id) or
            (r['from_user_id'] == blocked_id and r['to_user_id'] == user_id)
        )]
        if len(requests) < original_len:
            self._save_json(self.requests_file, requests)
            
        return True

    def unblock_user(self, user_id: str, blocked_id: str) -> bool:
        blocks = self._load_json(self.blocks_file)
        original_len = len(blocks)
        blocks = [b for b in blocks if not (b.get('user_id') == user_id and b.get('blocked_id') == blocked_id)]
        
        if len(blocks) < original_len:
            self._save_json(self.blocks_file, blocks)
            return True
        return False

    def get_blocked_users(self, user_id: str) -> List[Dict]:
        blocks = self._load_json(self.blocks_file)
        blocked_ids = [b['blocked_id'] for b in blocks if b.get('user_id') == user_id]
        
        # Hydrate
        blocked_profiles = []
        for bid in blocked_ids:
            profile = get_user_profile(bid) or {}
            blocked_profiles.append({
                'user_id': bid,
                'name': profile.get('name', bid),
                'avatar': profile.get('avatar'),
                'tag': profile.get('tag')
            })
        return blocked_profiles

    def is_blocked(self, user1: str, user2: str) -> bool:
        """Returns True if either user blocked the other"""
        blocks = self._load_json(self.blocks_file)
        if any(
            (b.get('user_id') == user1 and b.get('blocked_id') == user2) or
            (b.get('user_id') == user2 and b.get('blocked_id') == user1)
            for b in blocks
        ):
            return True
        # App Store 1.2：社群牆／留言的「封鎖」存在 user_blocks（api_moderation）。
        # 以前這裡只看舊名冊，被封鎖的人照樣能追蹤你、送好友邀請、出現在推薦與搜尋。
        try:
            from sqlalchemy import or_, and_
            from core.db import SessionLocal
            from core.models_moderation import UserBlock
            with SessionLocal() as db:
                return db.query(UserBlock.id).filter(or_(
                    and_(UserBlock.user_id == user1, UserBlock.blocked_user_id == user2),
                    and_(UserBlock.user_id == user2, UserBlock.blocked_user_id == user1),
                )).first() is not None
        except Exception:
            return False

    # ── 舊資料一次性拆分 ────────────────────────────────────────────────
    _split_done = False

    def _split_legacy_kudos_once(self):
        """把舊的共用 "kudos" 集合拆開：社群牆的留在原地，好友動態的搬到 friend_kudos。

        冪等：搬完之後舊集合裡就沒有好友動態形狀的資料，再呼叫不會做事。
        """
        if FriendsStorage._split_done:
            return
        FriendsStorage._split_done = True
        try:
            from repositories import social_repo
            legacy = social_repo.load('kudos') or []
            mine = [k for k in legacy
                    if isinstance(k, dict) and 'activity_id' in k and 'to_activity_id' not in k]
            if not mine:
                return
            theirs = [k for k in legacy if k not in mine]
            existing = social_repo.load('friend_kudos') or []
            seen = {(k.get('user_id'), k.get('activity_id')) for k in existing if isinstance(k, dict)}
            merged = existing + [k for k in mine if (k.get('user_id'), k.get('activity_id')) not in seen]
            social_repo.save('friend_kudos', merged)
            social_repo.save('kudos', theirs)
            print(f"[friends] 舊 kudos 集合拆分完成：搬走 {len(mine)} 筆好友動態按讚")
        except Exception as e:
            print(f"[friends] 舊 kudos 拆分略過（下次再試）：{e}")

    # --- Kudos System ---
    
    def add_kudo(self, user_id: str, activity_id: str) -> bool:
        self._split_legacy_kudos_once()
        kudos = self._load_json(self.kudos_file)
        # Prevent double kudos
        if any(k.get('user_id') == user_id and k.get('activity_id') == activity_id for k in kudos):
            return False
        kudos.append({
            'user_id': user_id,
            'activity_id': activity_id,
            'created_at': datetime.now().isoformat()
        })
        self._save_json(self.kudos_file, kudos)
        return True

    def get_activity_stats(self, activity_id: str, current_user_id: str = None) -> Dict:
        self._split_legacy_kudos_once()
        kudos = self._load_json(self.kudos_file)
        matching = [k for k in kudos if k.get('activity_id') == activity_id]
        return {
            'count': len(matching),
            'has_kudoed': any(k.get('user_id') == current_user_id for k in matching) if current_user_id else False
        }

    # ========================================================================
    # 追蹤圖（Follow graph）— 單一真相源
    # ------------------------------------------------------------------------
    # 名詞定義（全 app 一致，前端 utils/followGraph.js 對應同一套語意）：
    #   following  我追蹤的人（有向邊 me → them）
    #   followers  追蹤我的人
    #   粉絲(fan)  追蹤我、但我沒有追回去 → 只能看到我的公開/粉絲可見貼文
    #   好友(friend) 互相追蹤 或 已接受好友請求 → 可看到「僅好友」貼文
    # 跑步社群與健身社群共用同一張圖，不分家。
    # ========================================================================

    def follow(self, follower_id: str, following_id: str) -> bool:
        """建立一條追蹤邊。已存在或自己追自己 → 回 False（冪等）。"""
        if not follower_id or not following_id or follower_id == following_id:
            return False
        if self.is_blocked(follower_id, following_id):
            return False
        edges = self._load_json(self.follows_file)
        if any(e.get('follower_id') == follower_id and e.get('following_id') == following_id for e in edges):
            return False
        edges.append({
            'follower_id': follower_id,
            'following_id': following_id,
            'created_at': datetime.now().isoformat(),
        })
        self._save_json(self.follows_file, edges)
        return True

    def unfollow(self, follower_id: str, following_id: str) -> bool:
        edges = self._load_json(self.follows_file)
        remaining = [
            e for e in edges
            if not (e.get('follower_id') == follower_id and e.get('following_id') == following_id)
        ]
        if len(remaining) == len(edges):
            return False
        self._save_json(self.follows_file, remaining)
        return True

    def get_following_ids(self, user_id: str) -> List[str]:
        edges = self._load_json(self.follows_file)
        return [e['following_id'] for e in edges if e.get('follower_id') == user_id]

    def get_follower_ids(self, user_id: str) -> List[str]:
        edges = self._load_json(self.follows_file)
        return [e['follower_id'] for e in edges if e.get('following_id') == user_id]

    def get_graph(self, user_id: str) -> Dict:
        """一次回傳完整關係，避免前端多次往返各算各的（單一真相源）。"""
        following = set(self.get_following_ids(user_id))
        followers = set(self.get_follower_ids(user_id))
        # 已接受好友請求的人也算好友（舊的名冊系統）
        accepted = {f['user_id'] for f in self.get_friends(user_id)}
        mutual = following & followers
        friends = mutual | accepted
        # 粉絲 = 追蹤我但不是好友的人（單方面）
        fans = followers - friends
        return {
            'user_id': user_id,
            'following': sorted(following),
            'followers': sorted(followers),
            'friends': sorted(friends),      # 互相追蹤 或 已接受好友請求
            'fans': sorted(fans),            # 單方面追蹤我
            'counts': {
                'following': len(following),
                'followers': len(followers),
                'friends': len(friends),
                'fans': len(fans),
            },
        }

    def relation_to(self, me: str, other: str) -> str:
        """me 對 other 的關係：'self' | 'friend' | 'following' | 'fan' | 'none'"""
        if me == other:
            return 'self'
        following = set(self.get_following_ids(me))
        followers = set(self.get_follower_ids(me))
        accepted = {f['user_id'] for f in self.get_friends(me)}
        if other in accepted or (other in following and other in followers):
            return 'friend'
        if other in following:
            return 'following'
        if other in followers:
            return 'fan'
        return 'none'

# Create a singleton instance
friends_storage = FriendsStorage()
