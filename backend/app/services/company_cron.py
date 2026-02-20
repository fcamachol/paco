"""
PACO Company Cron Helpers

Utilities for computing next trigger times from cron expressions.
"""

from datetime import datetime, timedelta, timezone


def compute_next_trigger(
    schedule_type: str,
    cron_expression: str | None = None,
    interval_seconds: int | None = None,
    tz_name: str = "America/Mexico_City",
) -> datetime:
    """Compute next trigger time for a schedule.

    Returns a timezone-aware UTC datetime.
    """
    now = datetime.now(timezone.utc)

    if schedule_type == "cron" and cron_expression:
        try:
            from croniter import croniter
            import zoneinfo
            local_tz = zoneinfo.ZoneInfo(tz_name)
            local_now = now.astimezone(local_tz)
            cron = croniter(cron_expression, local_now)
            next_local = cron.get_next(datetime)
            return next_local.astimezone(timezone.utc)
        except ImportError:
            # croniter not installed, fallback to 1 hour
            return now + timedelta(hours=1)
        except Exception:
            return now + timedelta(hours=1)

    if schedule_type in ("interval", "heartbeat") and interval_seconds:
        return now + timedelta(seconds=interval_seconds)

    # Default: 30 minutes
    return now + timedelta(minutes=30)


def is_within_active_hours(
    active_start: str | None,
    active_end: str | None,
    tz_name: str = "America/Mexico_City",
    working_days: list[int] | None = None,
) -> bool:
    """Check if current time is within active hours and working days.

    active_start/end are "HH:MM" strings.
    working_days is list of ISO weekday numbers (1=Monday, 7=Sunday).
    """
    import zoneinfo

    local_tz = zoneinfo.ZoneInfo(tz_name)
    now_local = datetime.now(local_tz)

    # Check working days
    if working_days:
        if now_local.isoweekday() not in working_days:
            return False

    # Check active hours
    if active_start and active_end:
        try:
            start_h, start_m = map(int, active_start.split(":"))
            end_h, end_m = map(int, active_end.split(":"))
            current_minutes = now_local.hour * 60 + now_local.minute
            start_minutes = start_h * 60 + start_m
            end_minutes = end_h * 60 + end_m
            return start_minutes <= current_minutes <= end_minutes
        except (ValueError, AttributeError):
            return True

    return True
