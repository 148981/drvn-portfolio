"""
Social Features Module - Activity Feed, Kudos, Comments
"""
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime
from pathlib import Path
import json
import uuid
from .json_cache import load_json_cached, save_json_atomic


# ============================================================================
# Data Models
# ============================================================================

class Activity(BaseModel):
    """Social activity post for a workout"""
    activity_id: str
    user_id: str
    user_name: str
    session_id: str
    activity_type: str  # "run", "cardio", "workout"
    
    # Stats
    distance_km: float
    duration_seconds: int
    pace_per_km: int
    calories: int
    heart_rate: Optional[int] = 0
    elevation_gain: Optional[int] = 0
    volume_kg: Optional[int] = 0
    sets_completed: Optional[int] = 0
    
    # Classification
    community: str = "fitness"  # "fitness" or "cardio"

    # Social
    caption: Optional[str] = ""
    photo_url: Optional[str] = None
    privacy: str = "public"  # "public", "followers", "private"
    # 發文時填的欄位 —— 以前後端完全沒存，只活在作者手機的本機那一份；
    # 別人看不到標題／地點／標註，作者換一台手機也全部消失，編輯也無從寫回。
    title: Optional[str] = None
    location: Optional[str] = None
    tags: Optional[List[str]] = []
    communities: Optional[List[str]] = None   # 發到哪幾個社群（run / fitness）
    img_pos: Optional[int] = 50               # 照片垂直位置 0–100（objectPosition Y%）
    
    # Metadata
    created_at: str
    route_preview: List[Dict] = []  # GPS points for map thumbnail
    kudos_count: int = 0
    comment_count: int = 0
    
    # Segments if available
    segment_efforts: Optional[List[Dict]] = []
    
    # Workout Log
    exercises: Optional[List[Dict]] = []

    drvn_card: Optional[Dict] = None

class Kudo(BaseModel):
    """Like/appreciation for an activity"""
    kudo_id: str
    from_user_id: str
    from_user_name: str
    to_activity_id: str
    created_at: str


# ── kudos 的形狀判定 ────────────────────────────────────────────────────
# 為什麼要有這支：social（社群牆按讚）與 friends（好友動態按讚）曾經共用
# 同一個集合名稱 "kudos"，但欄位名不同。形狀判定集中在這裡一份，
# 讀到不是自己家的資料就略過，而不是 KeyError 把整支 API 打成 500。
SOCIAL_KUDO_KEYS = ("kudo_id", "from_user_id", "to_activity_id", "created_at")


def is_social_kudo(k) -> bool:
    """這筆 kudo 是不是社群牆這一邊的形狀。"""
    return isinstance(k, dict) and all(key in k for key in SOCIAL_KUDO_KEYS)


class Comment(BaseModel):
    """Text comment on an activity"""
    comment_id: str
    user_id: str
    user_name: str
    activity_id: str
    content: str
    created_at: str


# ============================================================================
# Storage System
# ============================================================================

class SocialStorage:
    """File-based storage for social features"""
    
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self.activities_file = self.data_dir / 'activities.json'
        self.kudos_file = self.data_dir / 'kudos.json'
        self.comments_file = self.data_dir / 'comments.json'
        
        # Initialize files if they don't exist
        for file in [self.activities_file, self.kudos_file, self.comments_file]:
            if not file.exists():
                file.write_text('[]')
    
    def _load_json(self, file_path: Path) -> List[Dict]:
        """Phase 2：改 DB（social_collections 表，以集合名稱為 key）。"""
        from repositories import social_repo
        return social_repo.load(Path(file_path).stem)

    def _save_json(self, file_path: Path, data: List[Dict]):
        from repositories import social_repo
        social_repo.save(Path(file_path).stem, data)
    
    # ========================================================================
    # Activity Methods
    # ========================================================================
    
    def create_activity(self, activity: Activity) -> Activity:
        """Create new activity"""
        activities = self._load_json(self.activities_file)
        activities.append(activity.dict())
        self._save_json(self.activities_file, activities)
        return activity
    
    def get_activity(self, activity_id: str) -> Optional[Activity]:
        """Get single activity by ID"""
        activities = self._load_json(self.activities_file)
        for activity in activities:
            if activity['activity_id'] == activity_id:
                return Activity(**activity)
        return None
    
    def get_feed(self, user_id: str, skip: int = 0, limit: int = 20, community: Optional[str] = None) -> List[Activity]:
        """Get activity feed (all public activities, newest first)"""
        activities_data = self._load_json(self.activities_file)
        
        # Convert to objects first regarding classification check
        activities = []
        for a_data in activities_data:
            # Backwards compatibility: infer community if missing
            if 'community' not in a_data:
                # Infer from activity_type or other fields
                a_type = a_data.get('activity_type', 'run')
                if a_type == 'fitness' or a_data.get('volume_kg', 0) > 0:
                    a_data['community'] = 'fitness'
                else:
                    a_data['community'] = 'cardio'
            activities.append(a_data)

        # Filter public activities
        filtered = [a for a in activities if a.get('privacy') == 'public']
        
        # Filter by community if specified
        if community:
            filtered = [a for a in filtered if a.get('community') == community]
        
        # Sort by created_at (newest first)
        # created_at 若有一筆是 None，None 與 str 不能比 → TypeError → 整面牆 500。
        filtered.sort(key=lambda x: str(x.get('created_at') or ''), reverse=True)
        
        # Pagination
        paginated = filtered[skip:skip + limit]
        
        # Add user_gave_kudo flag
        # 2026-09：kudos 這個集合曾被 core/friends.py 用同一個名字寫入
        #    （它存的是 {user_id, activity_id}，這裡要的是 {from_user_id, to_activity_id}）。
        #    只要有人在好友動態按過一次讚，這裡的 k['from_user_id'] 就 KeyError，
        #    整面社群牆 500 —— 而前端把 500 說成「連不到伺服器」，查了很久。
        #    現在只認得出形狀的那些，認不得的略過，讓髒資料不能再毒死整面牆。
        kudos = self._load_json(self.kudos_file)
        user_kudos = {
            k.get('to_activity_id') for k in kudos
            if isinstance(k, dict) and k.get('from_user_id') == user_id
        } - {None}
        
        for activity in paginated:
            activity['user_gave_kudo'] = activity.get('activity_id') in user_kudos
        
        # 一筆壞資料不該讓整面牆消失 —— 讀不出來的那筆跳過。
        feed = []
        for a in paginated:
            try:
                feed.append(Activity(**a))
            except Exception as e:
                print(f"[social] 略過讀不回來的貼文 {a.get('activity_id')}：{e}")
        return feed
    
    def update_activity(self, activity: Activity):
        """Update existing activity"""
        activities = self._load_json(self.activities_file)
        for i, a in enumerate(activities):
            if a['activity_id'] == activity.activity_id:
                activities[i] = activity.dict()
                break
        self._save_json(self.activities_file, activities)
    
    def delete_activity(self, activity_id: str, user_id: str) -> bool:
        """Delete activity (only by owner)"""
        activities = self._load_json(self.activities_file)
        original_len = len(activities)
        
        # Filter out the activity if it exists and belongs to the user
        # Handle user_123 vs user123 mismatch
        activities = [
            a for a in activities 
            if not (
                a['activity_id'] == activity_id and 
                (a['user_id'] == user_id or a['user_id'].replace('_', '') == user_id.replace('_', ''))
            )
        ]
        
        self._save_json(self.activities_file, activities)
        return len(activities) < original_len
    
    # ========================================================================
    # Kudos Methods
    # ========================================================================
    
    def add_kudo(self, kudo: Kudo) -> Kudo:
        """Add kudos to activity"""
        kudos = self._load_json(self.kudos_file)
        
        # Check if already exists
        existing = any(
            isinstance(k, dict)
            and k.get('from_user_id') == kudo.from_user_id
            and k.get('to_activity_id') == kudo.to_activity_id
            for k in kudos
        )
        
        if not existing:
            kudos.append(kudo.dict())
            self._save_json(self.kudos_file, kudos)
        
        return kudo
    
    def remove_kudo(self, user_id: str, activity_id: str) -> bool:
        """Remove kudos from activity"""
        kudos = self._load_json(self.kudos_file)
        original_len = len(kudos)
        
        kudos = [
            k for k in kudos
            if not (isinstance(k, dict)
                    and k.get('from_user_id') == user_id
                    and k.get('to_activity_id') == activity_id)
        ]
        
        self._save_json(self.kudos_file, kudos)
        return len(kudos) < original_len
    
    def get_activity_kudos(self, activity_id: str) -> List[Kudo]:
        """Get all kudos for an activity"""
        kudos = self._load_json(self.kudos_file)
        activity_kudos = [
            k for k in kudos
            if isinstance(k, dict) and k.get('to_activity_id') == activity_id
        ]
        return [Kudo(**k) for k in activity_kudos if is_social_kudo(k)]
    
    # ========================================================================
    # Comment Methods
    # ========================================================================
    
    def add_comment(self, comment: Comment) -> Comment:
        """Add comment to activity"""
        comments = self._load_json(self.comments_file)
        comments.append(comment.dict())
        self._save_json(self.comments_file, comments)
        return comment
    
    def get_activity_comments(self, activity_id: str) -> List[Comment]:
        """Get all comments for an activity"""
        comments = self._load_json(self.comments_file)
        activity_comments = [c for c in comments if c['activity_id'] == activity_id]
        # Sort by created_at (oldest first)
        activity_comments.sort(key=lambda x: x.get('created_at', ''))
        return [Comment(**c) for c in activity_comments]
    
    def delete_comment(self, comment_id: str, user_id: str) -> bool:
        """Delete comment (only by comment author)"""
        comments = self._load_json(self.comments_file)
        original_len = len(comments)
        
        comments = [
            c for c in comments
            if not (c['comment_id'] == comment_id and c['user_id'] == user_id)
        ]
        
        self._save_json(self.comments_file, comments)
        return len(comments) < original_len
