"""
Segment Management Module - Strava-style Segments & Leaderboards
Handles segment creation, matching, and leaderboard tracking
"""

from pydantic import BaseModel
from core.json_cache import save_json_atomic
from typing import List, Optional
from datetime import datetime
import json
import os
import math
from collections import defaultdict

# -----------------------------
# Data Models
# -----------------------------

class SegmentCreate(BaseModel):
    name: str
    waypoints: List[dict]  # List of {lat, lng} points defining the route
    distance_meters: int
    elevation_gain: Optional[int] = 0
    difficulty_rating: Optional[int] = 1  # 1-5
    created_by_user_id: str

class Segment(SegmentCreate):
    segment_id: str
    created_at: str
    total_attempts: int = 0

class SegmentEffort(BaseModel):
    effort_id: str
    segment_id: str
    user_id: str
    session_id: str
    elapsed_time_seconds: int
    avg_pace: float  # minutes per km
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    timestamp: str

class PersonalRecord(BaseModel):
    pr_id: str
    user_id: str
    segment_id: str
    best_time_seconds: int
    achieved_at: str

# -----------------------------
# Geospatial Utils
# -----------------------------

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate distance between two GPS coordinates in meters
    Using Haversine formula
    """
    R = 6371000  # Earth radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = math.sin(delta_lat / 2)**2 + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * \
        math.sin(delta_lng / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distance = R * c
    return distance

def calculate_bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate bearing between two points in degrees"""
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lng = math.radians(lng2 - lng1)
    
    x = math.sin(delta_lng) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - \
        math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(delta_lng)
    
    bearing = math.atan2(x, y)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360
    
    return bearing

# -----------------------------
# Segment Storage (JSON-based)
# -----------------------------



class JsonSegmentStorage:
    """Simple file-based storage for segments"""
    
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.segments_file = os.path.join(data_dir, "segments.json")
        self.efforts_file = os.path.join(data_dir, "segment_efforts.json")
        self.prs_file = os.path.join(data_dir, "personal_records.json")
        
        # Initialize files if they don't exist
        for file_path in [self.segments_file, self.efforts_file, self.prs_file]:
            if not os.path.exists(file_path):
                save_json_atomic(file_path, [], indent=2)
    def save_segment(self, segment: dict) -> dict:

        """Save a new segment"""
        segments = self._load_json(self.segments_file)
        segments.append(segment)
        self._save_json(self.segments_file, segments)
        return segment
    
    def get_segment(self, segment_id: str) -> Optional[dict]:
        """Get segment by ID"""
        segments = self._load_json(self.segments_file)
        for seg in segments:
            if seg['segment_id'] == segment_id:
                return seg
        return None
    
    def get_nearby_segments(self, lat: float, lng: float, radius_km: float = 5.0) -> List[dict]:
        """Find segments within radius"""
        segments = self._load_json(self.segments_file)
        nearby = []
        
        radius_meters = radius_km * 1000
        
        for seg in segments:
            # Check distance to any waypoint in the segment
            waypoints = seg.get('waypoints', [])
            if not waypoints:
                continue
                
            min_distance = float('inf')
            for waypoint in waypoints:
                dist = haversine_distance(lat, lng, waypoint['lat'], waypoint['lng'])
                min_distance = min(min_distance, dist)
            
            if min_distance <= radius_meters:
                nearby.append(seg)
        
        return nearby

    def delete_segment(self, segment_id: str) -> bool:
        """Delete a segment by ID"""
        segments = self._load_json(self.segments_file)
        initial_len = len(segments)
        segments = [s for s in segments if s['segment_id'] != segment_id]
        
        if len(segments) < initial_len:
            self._save_json(self.segments_file, segments)
            return True
        return False

    def update_segment(self, segment_id: str, updates: dict) -> Optional[dict]:
        """Update a segment by ID"""
        segments = self._load_json(self.segments_file)
        updated_segment = None
        
        for seg in segments:
            if seg['segment_id'] == segment_id:
                seg.update(updates)
                updated_segment = seg
                break
        
        if updated_segment:
            self._save_json(self.segments_file, segments)
            
        return updated_segment
    
    def save_effort(self, effort: dict) -> dict:
        """Save a segment effort"""
        efforts = self._load_json(self.efforts_file)
        efforts.append(effort)
        self._save_json(self.efforts_file, efforts)
        
        # Update segment total attempts
        self._increment_segment_attempts(effort['segment_id'])
        
        return effort
    
    def get_segment_efforts(self, segment_id: str, user_id: Optional[str] = None) -> List[dict]:
        """Get all efforts for a segment (optionally filtered by user)"""
        efforts = self._load_json(self.efforts_file)
        filtered = [e for e in efforts if e['segment_id'] == segment_id]
        
        if user_id:
            filtered = [e for e in filtered if e['user_id'] == user_id]
        
        # Sort by time (best first)
        filtered.sort(key=lambda x: x['elapsed_time_seconds'])
        
        return filtered
    
    def save_pr(self, pr: dict) -> dict:
        """Save or update a personal record"""
        prs = self._load_json(self.prs_file)
        
        # Check if PR exists for this user + segment
        existing_pr = None
        for i, p in enumerate(prs):
            if p['user_id'] == pr['user_id'] and p['segment_id'] == pr['segment_id']:
                existing_pr = i
                break
        
        if existing_pr is not None:
            # Update existing PR if new time is better
            if pr['best_time_seconds'] < prs[existing_pr]['best_time_seconds']:
                prs[existing_pr] = pr
        else:
            # New PR
            prs.append(pr)
        
        self._save_json(self.prs_file, prs)
        return pr
    
    def get_user_pr(self, user_id: str, segment_id: str) -> Optional[dict]:
        """Get user's personal record for a segment"""
        prs = self._load_json(self.prs_file)
        for pr in prs:
            if pr['user_id'] == user_id and pr['segment_id'] == segment_id:
                return pr
        return None
    
    def _increment_segment_attempts(self, segment_id: str):
        """Increment total attempts counter for a segment"""
        segments = self._load_json(self.segments_file)
        for seg in segments:
            if seg['segment_id'] == segment_id:
                seg['total_attempts'] = seg.get('total_attempts', 0) + 1
                break
        self._save_json(self.segments_file, segments)
    
    def _load_json(self, file_path: str) -> list:
        """Phase 2：改 DB（具名 JSON 清單，以檔名 stem 為集合名）。"""
        from repositories import social_repo
        return social_repo.load(os.path.splitext(os.path.basename(file_path))[0])

    def _save_json(self, file_path: str, data: list):
        from repositories import social_repo
        social_repo.save(os.path.splitext(os.path.basename(file_path))[0], data)

# -----------------------------
# Segment Matching Algorithm
# -----------------------------

class SegmentMatcher:
    """Detect when a route passes through a segment"""
    
    @staticmethod
    def match_route_to_segments(gps_points: List[dict], segments: List[dict]) -> List[dict]:
        """
        Match a GPS route to segments
        
        Args:
            gps_points: List of {lat, lng, timestamp} dicts
            segments: List of segment dicts
        
        Returns:
            List of matched segments with timing info
        """
        matched = []
        
        for segment in segments:
            match_result = SegmentMatcher._match_single_segment(gps_points, segment)
            if match_result:
                matched.append(match_result)
        
        return matched
    
    @staticmethod
    def _match_single_segment(gps_points: List[dict], segment: dict) -> Optional[dict]:
        """
        Check if route passes through a segment's waypoints sequentially
        Returns timing info if matched
        """
        WAYPOINT_THRESHOLD = 50  # meters - how close to each waypoint
        
        waypoints = segment.get('waypoints', [])
        if len(waypoints) < 2:
            return None
        
        # Track which waypoint we're looking for (sequential matching)
        matched_indices = []
        
        for i, waypoint in enumerate(waypoints):
            # Find closest GPS point to this waypoint (after previous matches)
            start_search_idx = matched_indices[-1] if matched_indices else 0
            
            for j in range(start_search_idx, len(gps_points)):
                point = gps_points[j]
                dist = haversine_distance(
                    point['lat'], point['lng'],
                    waypoint['lat'], waypoint['lng']
                )
                if dist <= WAYPOINT_THRESHOLD:
                    matched_indices.append(j)
                    break
        
        # Must match all waypoints
        if len(matched_indices) != len(waypoints):
            return None
        
        # Calculate elapsed time between first and last waypoint
        start_idx = matched_indices[0]
        end_idx = matched_indices[-1]
        
        start_time = gps_points[start_idx].get('timestamp', 0)
        end_time = gps_points[end_idx].get('timestamp', 0)
        elapsed_seconds = end_time - start_time
        
        if elapsed_seconds <= 0:
            return None
        
        # Calculate average pace
        distance_km = segment['distance_meters'] / 1000
        avg_pace = (elapsed_seconds / 60) / distance_km if distance_km > 0 else 0
        
        return {
            'segment_id': segment['segment_id'],
            'segment_name': segment['name'],
            'elapsed_time_seconds': int(elapsed_seconds),
            'avg_pace': round(avg_pace, 2),
            'start_index': start_idx,
            'end_index': end_idx
        }

# -----------------------------
# Segment Manager (Facade)
# -----------------------------

class SegmentManager:
    """
    High-level manager for segment operations
    Combines storage, matching, and leaderboard logic
    """
    
    def __init__(self, data_dir: str):
        self.storage = JsonSegmentStorage(data_dir)
        
    def create_segment(self, segment_data: SegmentCreate) -> dict:
        """Create a new segment"""
        # Generate ID
        import uuid
        segment_id = f"seg_{uuid.uuid4()}"
        
        # Convert to dict
        segment_dict = segment_data.dict()
        segment_dict['segment_id'] = segment_id
        segment_dict['created_at'] = datetime.now().isoformat()
        segment_dict['total_attempts'] = 0
        
        # Save
        print(f"DEBUG_SEGMENTS: self.storage type: {type(self.storage)}")
        print(f"DEBUG_SEGMENTS: self.storage dir: {dir(self.storage)}")
        self.storage.save_segment(segment_dict)
        return segment_dict
    
    def get_segment(self, segment_id: str) -> Optional[dict]:
        return self.storage.get_segment(segment_id)
        
    def find_nearby_segments(self, lat: float, lng: float, radius_km: float = 5.0) -> List[dict]:
        return self.storage.get_nearby_segments(lat, lng, radius_km)
        
    def delete_segment(self, segment_id: str) -> bool:
        return self.storage.delete_segment(segment_id)
        
    def update_segment(self, segment_id: str, updates: dict) -> Optional[dict]:
        return self.storage.update_segment(segment_id, updates)
        
    def record_effort(self, user_id: str, session_id: str, gps_points: List[dict]) -> List[dict]:
        """
        Process a workout and record any segment efforts
        """
        # 1. Get all segments (optimize by location later)
        # For now, just load all
        all_segments = self.storage._load_json(self.storage.segments_file)
        
        # 2. Match
        matched = SegmentMatcher.match_route_to_segments(gps_points, all_segments)
        
        results = []
        for match in matched:
            # 3. Save effort
            import uuid
            effort = {
                'effort_id': f"eff_{uuid.uuid4()}",
                'segment_id': match['segment_id'],
                'user_id': user_id,
                'session_id': session_id,
                'elapsed_time_seconds': match['elapsed_time_seconds'],
                'avg_pace': match['avg_pace'],
                'timestamp': datetime.now().isoformat()
            }
            self.storage.save_effort(effort)
            
            # 4. Check for PR
            pr_update = self._check_and_update_pr(user_id, match['segment_id'], match['elapsed_time_seconds'])
            
            result = match.copy()
            result['is_pr'] = pr_update
            results.append(result)
            
        return results

    def _check_and_update_pr(self, user_id: str, segment_id: str, time_seconds: int) -> bool:
        """Check if this is a new PR and update if so"""
        existing_pr = self.storage.get_user_pr(user_id, segment_id)
        
        if not existing_pr or time_seconds < existing_pr['best_time_seconds']:
            # New PR!
            import uuid
            pr = {
                'pr_id': f"pr_{uuid.uuid4()}",
                'user_id': user_id,
                'segment_id': segment_id,
                'best_time_seconds': time_seconds,
                'achieved_at': datetime.now().isoformat()
            }
            self.storage.save_pr(pr)
            return True
            
        return False
        
    def calculate_leaderboard(self, segment_id: str):
        """Background task to recalculate leaderboards (placeholder)"""
        pass

# Initialize Manager
# Assume DATA_DIR is available or passed. 
# In core module, we usually access config or relative path.
# For simplicity, we'll use a local data folder relative to this file
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(CURRENT_DIR, "data")

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR, exist_ok=True)

segment_manager = SegmentManager(DATA_DIR)
SegmentStorage = JsonSegmentStorage