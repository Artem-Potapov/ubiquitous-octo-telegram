from datetime import datetime, UTC


def utc_now():
    return datetime.now(UTC)