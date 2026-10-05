"""
PR Notification System - Backend Component
Manages PR breakthrough notifications and triggers
"""

from typing import Dict, List, Optional
from .json_cache import save_json_atomic
from datetime import datetime
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '../data')
PR_NOTIFICATIONS_PATH = os.path.join(DATA_DIR, 'pr_notifications.json')

def load_notifications():
    """Load PR notifications database"""
    if os.path.exists(PR_NOTIFICATIONS_PATH):
        with open(PR_NOTIFICATIONS_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_notifications(notifications):
    """Save PR notifications database"""
    save_json_atomic(PR_NOTIFICATIONS_PATH, notifications, indent=2)
def create_pr_notification(
    user_id: str,
    pr_data: Dict,
    workout_session_id: str
) -> Dict:
    """
    Create a PR breakthrough notification
    
    Args:
        user_id: User identifier
        pr_data: PR details
            {
                "exercise": "Bench Press",
                "name": "Bench Press",
                "oldPR": 80,
                "newPR": 85,
                "improvement": 5
            }
        workout_session_id: Associated workout session
    
    Returns:
        Created notification object
    """
    notifications = load_notifications()
    
    if user_id not in notifications:
        notifications[user_id] = []
    
    # Generate notification ID
    notif_id = f"pr_notif_{len(notifications[user_id]) + 1}_{int(datetime.now().timestamp())}"
    
    notification = {
        "id": notif_id,
        "type": "PR_BREAKTHROUGH",
        "created_at": datetime.now().isoformat(),
        "read": False,
        "dismissed": False,
        "workout_session_id": workout_session_id,
        "pr_data": {
            "exercise": pr_data.get("exercise") or pr_data.get("name"),
            "old_pr": pr_data.get("oldPR"),
            "new_pr": pr_data.get("newPR"),
            "improvement": pr_data.get("improvement") or (pr_data.get("newPR", 0) - pr_data.get("oldPR", 0)),
            "improvement_percent": round(
                ((pr_data.get("newPR", 0) - pr_data.get("oldPR", 0)) / pr_data.get("oldPR", 1)) * 100, 
                1
            ) if pr_data.get("oldPR") else 0
        },
        "title": f"🏆 PR 突破！",
        "message": f"{pr_data.get('exercise') or pr_data.get('name')}: {pr_data.get('oldPR')}kg → {pr_data.get('newPR')}kg"
    }
    
    notifications[user_id].append(notification)
    save_notifications(notifications)
    
    return notification


def create_bulk_pr_notifications(
    user_id: str,
    pr_alerts: List[Dict],
    workout_session_id: str
) -> List[Dict]:
    """
    Create multiple PR notifications from a workout session
    
    Args:
        user_id: User identifier
        pr_alerts: List of PR data from workout
        workout_session_id: Associated workout session
    
    Returns:
        List of created notifications
    """
    created_notifications = []
    
    for pr_data in pr_alerts:
        notif = create_pr_notification(user_id, pr_data, workout_session_id)
        created_notifications.append(notif)
    
    return created_notifications


def get_user_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: Optional[int] = None
) -> List[Dict]:
    """
    Get notifications for a user
    
    Args:
        user_id: User identifier
        unread_only: If True, only return unread notifications
        limit: Optional limit on number of notifications
    
    Returns:
        List of notifications, most recent first
    """
    notifications = load_notifications()
    user_notifs = notifications.get(user_id, [])
    
    # Filter by read status if requested
    if unread_only:
        user_notifs = [n for n in user_notifs if not n.get("read", False)]
    
    # Sort by created_at descending (most recent first)
    user_notifs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    # Apply limit
    if limit:
        user_notifs = user_notifs[:limit]
    
    return user_notifs


def mark_notification_as_read(user_id: str, notification_id: str) -> bool:
    """
    Mark a notification as read
    
    Returns:
        True if successful, False if not found
    """
    notifications = load_notifications()
    
    if user_id not in notifications:
        return False
    
    for notif in notifications[user_id]:
        if notif.get("id") == notification_id:
            notif["read"] = True
            notif["read_at"] = datetime.now().isoformat()
            save_notifications(notifications)
            return True
    
    return False


def mark_all_as_read(user_id: str) -> int:
    """
    Mark all notifications as read for a user
    
    Returns:
        Number of notifications marked as read
    """
    notifications = load_notifications()
    
    if user_id not in notifications:
        return 0
    
    count = 0
    for notif in notifications[user_id]:
        if not notif.get("read", False):
            notif["read"] = True
            notif["read_at"] = datetime.now().isoformat()
            count += 1
    
    if count > 0:
        save_notifications(notifications)
    
    return count


def dismiss_notification(user_id: str, notification_id: str) -> bool:
    """
    Dismiss (soft delete) a notification
    
    Returns:
        True if successful, False if not found
    """
    notifications = load_notifications()
    
    if user_id not in notifications:
        return False
    
    for notif in notifications[user_id]:
        if notif.get("id") == notification_id:
            notif["dismissed"] = True
            notif["dismissed_at"] = datetime.now().isoformat()
            save_notifications(notifications)
            return True
    
    return False


def get_unread_count(user_id: str) -> int:
    """
    Get count of unread notifications
    
    Returns:
        Number of unread notifications
    """
    notifications = load_notifications()
    user_notifs = notifications.get(user_id, [])
    
    unread_count = sum(1 for n in user_notifs if not n.get("read", False) and not n.get("dismissed", False))
    
    return unread_count


def clear_old_notifications(user_id: str, days: int = 30) -> int:
    """
    Clear notifications older than specified days
    
    Args:
        user_id: User identifier
        days: Age threshold in days
    
    Returns:
        Number of notifications cleared
    """
    from datetime import timedelta
    
    notifications = load_notifications()
    
    if user_id not in notifications:
        return 0
    
    cutoff_date = datetime.now() - timedelta(days=days)
    
    original_count = len(notifications[user_id])
    
    # Keep only recent notifications
    notifications[user_id] = [
        n for n in notifications[user_id]
        if datetime.fromisoformat(n.get("created_at", datetime.now().isoformat())) > cutoff_date
    ]
    
    cleared_count = original_count - len(notifications[user_id])
    
    if cleared_count > 0:
        save_notifications(notifications)
    
    return cleared_count


# Example usage
if __name__ == "__main__":
    # Test creating a notification
    test_pr = {
        "exercise": "Bench Press",
        "oldPR": 80,
        "newPR": 85
    }
    
    notif = create_pr_notification(
        user_id="USR001",
        pr_data=test_pr,
        workout_session_id="session_123"
    )
    
    print("Created notification:", notif)
    
    # Test getting notifications
    user_notifs = get_user_notifications("USR001", unread_only=True)
    print(f"\nUnread notifications: {len(user_notifs)}")
    
    # Test marking as read
    if user_notifs:
        mark_notification_as_read("USR001", user_notifs[0]["id"])
        print(f"Marked as read: {user_notifs[0]['id']}")
