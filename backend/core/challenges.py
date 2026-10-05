"""
Challenge System Core Module

Handles challenge creation, management, progress tracking, and completion detection.
Supports personal, friend, and club challenges with various goal types.
"""

from datetime import datetime, timedelta
from .json_cache import save_json_atomic
from typing import Dict, List, Any, Optional
import json
import os
import uuid
from .json_cache import load_json_cached, save_json_atomic


class Challenge:
    """Base Challenge class"""
    
    def __init__(
        self,
        challenge_id: str,
        challenge_type: str,  # "personal" | "friend" | "club"
        name: str,
        description: str,
        goal_type: str,  # "distance" | "duration" | "frequency" | "streak"
        goal_value: float,
        time_window: int,  # days
        start_date: str,
        created_by: str,
        badge_icon: str = "🏆",
        badge_color: str = "gold",
        club_id: Optional[str] = None,

        participants: Optional[List[str]] = None,
        category: Optional[str] = None,
        template_id: Optional[str] = None
    ):
        self.challenge_id = challenge_id
        self.type = challenge_type
        self.name = name
        self.description = description
        self.goal_type = goal_type
        self.goal_value = goal_value
        self.time_window = time_window
        self.start_date = start_date
        self.end_date = self._calculate_end_date(start_date, time_window)
        self.created_by = created_by
        self.badge_icon = badge_icon
        self.badge_color = badge_color
        self.club_id = club_id

        self.participants = participants or [created_by]
        self.category = category
        self.template_id = template_id
        self.status = self._determine_status()
    
    def _calculate_end_date(self, start_date: str, days: int) -> str:
        """Calculate end date from start date and time window"""
        start = datetime.fromisoformat(start_date)
        end = start + timedelta(days=days)
        return end.isoformat()
    
    def _determine_status(self) -> str:
        """Determine current status of challenge"""
        now = datetime.now()
        end = datetime.fromisoformat(self.end_date)
        
        if now > end:
            return "expired"
        return "active"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "challenge_id": self.challenge_id,
            "type": self.type,
            "name": self.name,
            "description": self.description,
            "goal_type": self.goal_type,
            "goal_value": self.goal_value,
            "time_window": self.time_window,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "created_by": self.created_by,
            "badge_icon": self.badge_icon,
            "badge_color": self.badge_color,
            "club_id": self.club_id,
            "participants": self.participants,

            "status": self.status,
            "category": self.category,
            "template_id": self.template_id
        }


class ChallengeManager:
    """Manages all challenge operations"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.challenges_file = os.path.join(data_dir, "challenges.json")
        self.participants_file = os.path.join(data_dir, "challenge_participants.json")
        self._ensure_data_files()
    
    def _ensure_data_files(self):
        """Ensure data files exist"""
        os.makedirs(self.data_dir, exist_ok=True)
        
        if not os.path.exists(self.challenges_file):
            save_json_atomic(self.challenges_file, [], indent=2)
        if not os.path.exists(self.participants_file):
            save_json_atomic(self.participants_file, [], indent=2)
    def _load_challenges(self) -> List[Dict[str, Any]]:
        """Phase 2：改 DB（具名 JSON 清單）。"""
        from repositories import social_repo
        return social_repo.load("challenges")

    def _save_challenges(self, challenges: List[Dict[str, Any]]):
        from repositories import social_repo
        social_repo.save("challenges", challenges)

    def _load_participants(self) -> List[Dict[str, Any]]:
        from repositories import social_repo
        return social_repo.load("challenge_participants")

    def _save_participants(self, participants: List[Dict[str, Any]]):
        from repositories import social_repo
        social_repo.save("challenge_participants", participants)
    
    def create_challenge(
        self,
        user_id: str,
        challenge_type: str,
        name: str,
        description: str,
        goal_type: str,
        goal_value: float,
        time_window: int,
        badge_icon: str = "🏆",
        badge_color: str = "gold",
        invited_users: Optional[List[str]] = None,
        club_id: Optional[str] = None,
        category: Optional[str] = None,
        template_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new challenge
        
        Args:
            user_id: Creator's user ID
            challenge_type: "personal" | "friend" | "club"
            name: Challenge name
            description: Challenge description
            goal_type: "distance" | "duration" | "frequency" | "streak"
            goal_value: Target value to achieve
            time_window: Number of days to complete
            badge_icon: Icon for completion badge
            badge_color: Color for completion badge
            invited_users: List of invited user IDs (for friend challenges)
            club_id: Club ID (for club challenges)
        
        Returns:
            Created challenge data
        """
        challenge_id = str(uuid.uuid4())
        start_date = datetime.now().isoformat()
        
        # Determine participants
        participants = [user_id]
        if challenge_type == "friend" and invited_users:
            participants.extend(invited_users)
        
        # Create challenge object
        challenge = Challenge(
            challenge_id=challenge_id,
            challenge_type=challenge_type,
            name=name,
            description=description,
            goal_type=goal_type,
            goal_value=goal_value,
            time_window=time_window,
            start_date=start_date,
            created_by=user_id,
            badge_icon=badge_icon,
            badge_color=badge_color,
            club_id=club_id,
            participants=participants,
            category=category,
            template_id=template_id
        )
        
        # Save challenge
        challenges = self._load_challenges()
        challenges.append(challenge.to_dict())
        self._save_challenges(challenges)
        
        # Initialize participant records
        participants_data = self._load_participants()
        for participant_id in participants:
            participants_data.append({
                "participant_id": str(uuid.uuid4()),
                "challenge_id": challenge_id,
                "user_id": participant_id,
                "current_progress": 0.0,
                "completed": False,
                "completed_at": None,
                "badge_earned": False
            })
        self._save_participants(participants_data)
        
        return challenge.to_dict()
    
    def join_challenge(self, challenge_id: str, user_id: str) -> bool:
        """
        Join an existing challenge
        
        Args:
            challenge_id: Challenge to join
            user_id: User joining the challenge
        
        Returns:
            Success status
        """
        challenges = self._load_challenges()
        
        # Find challenge
        challenge = next((c for c in challenges if c["challenge_id"] == challenge_id), None)
        if not challenge:
            return False
        
        # Check if already joined
        if user_id in challenge["participants"]:
            return False
        
        # Add participant to challenge
        challenge["participants"].append(user_id)
        self._save_challenges(challenges)
        
        # Initialize participant record
        participants = self._load_participants()
        participants.append({
            "participant_id": str(uuid.uuid4()),
            "challenge_id": challenge_id,
            "user_id": user_id,
            "current_progress": 0.0,
            "completed": False,
            "completed_at": None,
            "badge_earned": False
        })
        self._save_participants(participants)
        
        return True
    
    def leave_challenge(self, challenge_id: str, user_id: str) -> bool:
        """
        Leave an existing challenge
        
        Args:
            challenge_id: Challenge to leave
            user_id: User leaving the challenge
        
        Returns:
            Success status
        """
        challenges = self._load_challenges()
        
        # Find challenge
        challenge = next((c for c in challenges if c["challenge_id"] == challenge_id), None)
        if not challenge:
            return False
        
        # Check if actually joined
        if user_id not in challenge["participants"]:
            return False
        
        # Remove user from participants list
        challenge["participants"] = [uid for uid in challenge["participants"] if uid != user_id]
        
        # If no participants left, maybe delete challenge? (Optional, let's keep it simple for now)
        # If it was created by the user and is personal, maybe we should delete it?
        # For now, just remove from participants list is safer for data integrity
        
        self._save_challenges(challenges)
        
        # Update participant record to inactive or deleted
        # Actually better to remove the participant record to clean up
        participants = self._load_participants()
        participants = [
            p for p in participants 
            if not (p["challenge_id"] == challenge_id and p["user_id"] == user_id)
        ]
        self._save_participants(participants)
        
        return True
    
    def get_active_challenges(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all active challenges for a user
        Auto-removes user from expired challenges if incomplete
        
        Args:
            user_id: User ID
        
        Returns:
            List of active challenges
        """
        challenges = self._load_challenges()
        participants = self._load_participants()
        
        # Get challenges where user is a participant
        user_challenges = [
            c for c in challenges
            if user_id in c.get("participants", [])
        ]
        
        active_user_challenges = []
        now = datetime.now()
        
        for challenge in user_challenges:
            # Check expiration
            end_date = datetime.fromisoformat(challenge["end_date"])
            is_expired = now > end_date
            
            # Get progress
            user_progress = next(
                (p for p in participants 
                 if p["challenge_id"] == challenge["challenge_id"] and p["user_id"] == user_id),
                {"current_progress": 0.0, "completed": False}
            )
            
            # If expired and not completed, auto-leave (cleanup)
            if is_expired and not user_progress["completed"]:
                print(f"👋 [Auto-Exit] User {user_id} removed from expired challenge: {challenge['name']}")
                self.leave_challenge(challenge["challenge_id"], user_id)
                continue
            
            # Only include if actually active (not expired) OR completed (maybe keep completed? User said exit "expired" ones)
            # Usually "Active" tab implies currently running.
            # If completed, it might belong in "Trophy" or "History", not "Active".
            # The UI logic for "Active" tab (in frontend) typically shows things to work on.
            
            # If it's expired but completed, we might want to keep it? 
            # But the logic below filters by status="active".
            # Let's trust the expiration check.
            
            if not is_expired:
                challenge["current_progress"] = user_progress["current_progress"]
                challenge["user_completed"] = user_progress["completed"]
                active_user_challenges.append(challenge)
        
        return active_user_challenges
    
    def get_challenge_progress(self, challenge_id: str) -> Dict[str, Any]:
        """
        Get detailed progress for a challenge
        
        Args:
            challenge_id: Challenge ID
        
        Returns:
            Challenge data with all participants' progress
        """
        challenges = self._load_challenges()
        participants = self._load_participants()
        
        challenge = next((c for c in challenges if c["challenge_id"] == challenge_id), None)
        if not challenge:
            return None
        
        # Get all participants' progress
        challenge_participants = [
            p for p in participants if p["challenge_id"] == challenge_id
        ]
        
        # Calculate progress percentage
        for participant in challenge_participants:
            participant["percentage"] = min(
                100,
                (participant["current_progress"] / challenge["goal_value"]) * 100
            )
        
        return {
            "challenge": challenge,
            "participants": challenge_participants
        }
    
    def update_progress(
        self,
        challenge_id: str,
        user_id: str,
        activity_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update user's progress in a challenge based on activity
        
        Args:
            challenge_id: Challenge ID
            user_id: User ID
            activity_data: Activity data (distance, duration, type, etc.)
        
        Returns:
            Updated participant data
        """
        challenges = self._load_challenges()
        participants = self._load_participants()
        
        # Find challenge
        challenge = next((c for c in challenges if c["challenge_id"] == challenge_id), None)
        if not challenge:
            return None
        
        # Find participant
        participant_idx = next(
            (i for i, p in enumerate(participants)
             if p["challenge_id"] == challenge_id and p["user_id"] == user_id),
            None
        )
        
        if participant_idx is None:
            return None
        
        participant = participants[participant_idx]
        
        # Calculate progress increment based on goal type and activity type
        increment = 0.0
        goal_type = challenge["goal_type"]
        activity_type = activity_data.get("activity_type", "")
        
        print(f"🔍 [Challenge] Calculating increment for {challenge['name']} (ID: {challenge_id})")
        print(f"   Goal type: {goal_type}, Incoming Data: {activity_data}")
        
        if goal_type == "distance":
            # Distance in kilometers (cardio only)
            increment = activity_data.get("distance_km", 0)
            print(f"   Distance increment: {increment} km")
        
        elif goal_type == "duration":
            # Duration in minutes (all activities)
            increment = activity_data.get("duration_minutes", 0)
            print(f"   Duration increment: {increment} min")
        
        elif goal_type == "frequency":
            # Count each activity as 1
            increment = 1
            print(f"   Frequency increment: 1 activity")
        
        elif goal_type == "streak":
            # Streak handling - check consecutive days
            # For nutrition/hydration, check if daily goal met
            if activity_type in ["nutrition", "hydration"]:
                # Only increment if requirements met
                if activity_data.get("met_goal", False) or activity_data.get("is_balanced", False):
                    increment = self._calculate_streak_increment(participant, activity_data)
                    print(f"   Streak increment: {increment} day(s)")
                else:
                    increment = 0
                    print(f"   Streak: goals not met, no increment")
            else:
                # For general training streak
                increment = self._calculate_streak_increment(participant, activity_data)
                print(f"   Streak increment: {increment} day(s)")
        
        # Update progress
        old_progress = participant["current_progress"]
        participant["current_progress"] += increment
        new_progress = participant["current_progress"]
        
        print(f"   Progress: {old_progress} → {new_progress} / {challenge['goal_value']}")
        
        # Check if goal reached
        if participant["current_progress"] >= challenge["goal_value"] and not participant["completed"]:
            participant["completed"] = True
            participant["completed_at"] = datetime.now().isoformat()
            participant["badge_earned"] = True
            print(f"   🎉 CHALLENGE COMPLETED!")
        
        # Save updated participants
        participants[participant_idx] = participant
        self._save_participants(participants)
        
        return participant
    
    def _calculate_streak_increment(self, participant: Dict[str, Any], activity_data: Dict[str, Any]) -> int:
        """
        Calculate streak increment based on consecutive days
        Simple implementation: check if activity is on a new day
        """
        # For now, simple implementation: +1 if new day
        # TODO: Implement proper consecutive day checking
        last_activity_date = participant.get("last_activity_date")
        current_date = activity_data.get("date") or datetime.now().strftime("%Y-%m-%d")
        
        if last_activity_date != current_date:
            participant["last_activity_date"] = current_date
            return 1
        
        return 0
    
    def check_completion(self, challenge_id: str) -> List[str]:
        """
        Check which participants have completed the challenge
        
        Args:
            challenge_id: Challenge ID
        
        Returns:
            List of user IDs who completed the challenge
        """
        participants = self._load_participants()
        
        completed_users = [
            p["user_id"] for p in participants
            if p["challenge_id"] == challenge_id and p["completed"]
        ]
        
        return completed_users

    def process_active_challenges(self, user_id: str, activity_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Process all active challenges for a user with the new activity data
        
        Args:
            user_id: User ID
            activity_data: Activity data (distance, duration, type, etc.)
        
        Returns:
            List of updated challenge progresses
        """
        print(f"🔄 [Challenge] Processing active challenges for {user_id}")
        active_challenges = self.get_active_challenges(user_id)
        
        updated_challenges = []
        
        for challenge in active_challenges:
            challenge_id = challenge["challenge_id"]
            
            # Check if this activity applies to this challenge
            # e.g. if challenge is cardio only, ignore strength workouts unless duration-based
            goal_type = challenge.get("goal_type")
            activity_type = activity_data.get("activity_type", "unknown")
            
            # Basic filtering logic could go here, but update_progress handles 0 increments mostly
            # Only optimize if needed.
            
            updated_participant = self.update_progress(challenge_id, user_id, activity_data)
            
            if updated_participant:
                updated_challenges.append({
                    "challenge_id": challenge_id,
                    "name": challenge["name"],
                    "progress": updated_participant["current_progress"],
                    "completed": updated_participant["completed"],
                    "badge_earned": updated_participant["badge_earned"]
                })
                print(f"   ✅ Updated: {updated_participant['current_progress']}")
                
        print(f"✅ [Challenge] Updated {len(updated_challenges)} challenges")
        return updated_challenges


# Global instance
challenge_manager = ChallengeManager()
