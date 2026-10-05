"""Date-window selection for running load summaries; no storage dependencies."""
from datetime import datetime, timezone


def select_window(sessions, since, until):
    selected, invalid = [], 0
    for session in sessions:
        raw = session.get("date") or session.get("created_at") or session.get("completed_at") or session.get("timestamp")
        try:
            if isinstance(raw, (int, float)):
                stamp = datetime.fromtimestamp(raw / 1000 if raw > 1e11 else raw, timezone.utc)
            else:
                stamp = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                if stamp.tzinfo is None:
                    stamp = stamp.replace(tzinfo=timezone.utc)
            if since <= stamp <= until:
                selected.append({**session, "date": stamp.isoformat(), "created_at": stamp.isoformat()})
        except (ValueError, TypeError, OverflowError, OSError):
            invalid += 1
    return {"sessions": selected, "complete": invalid == 0, "invalid_dates": invalid,
            "since": since.isoformat(), "until": until.isoformat()}
