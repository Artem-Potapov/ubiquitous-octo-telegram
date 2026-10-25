from __future__ import annotations


# ---------------------------------------------------------------------------
# Exceptions  (map: NotFound -> 404, AccessDenied -> 403, Conflict -> 409)
# ---------------------------------------------------------------------------

class DatabaseError(Exception):
    """Base class for every error DBManager raises on purpose."""


class NotFoundError(DatabaseError):
    """An id passed in does not exist."""


class AccessDeniedError(DatabaseError):
    """Viewer is not a network member, reads someone else's check-ins,
    or a non-patient tries to grant/revoke restricted access."""


class ConflictError(DatabaseError):
    """The request contradicts current state (non-member assignee,
    second network for a patient, removing the patient, ...)."""

class DatabaseNotConnectedError(DatabaseError):
    """Database is not even initialized. You're doing something terribly wrong."""