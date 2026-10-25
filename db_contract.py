"""
Caregiver Constellation - DBManager contract.

Shared by everyone. The real SQLiteDBManager (aiosqlite) and any FakeDBManager
both subclass DBManager and must follow the behaviour described in the docstrings
below and in the "DBManager Contract" doc.

Do not redefine these models elsewhere; import them from here.
"""

from __future__ import annotations

from datetime import date, datetime, time
from enum import Enum
from typing import Final

from pydantic import BaseModel, Field, model_validator

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SYSTEM_VIEWER_ID: Final[int] = 0
"""Viewer id for engines and seed scripts. Bypasses every access check.
Real ids start at 1, so this never collides. Never pass it from a request handler."""

REDACTED_TASK_TITLE: Final[str] = "Restricted task"
REDACTED_RELATIONSHIP_LABEL: Final[str] = "Restricted"
REDACTED_CARE_PLAN_TITLE: Final[str] = "Restricted care plan"
REDACTED_GAP_DESCRIPTION: Final[str] = "Gap on a restricted item"


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class PersonType(str, Enum):
    patient = "patient"
    professional = "professional"
    family = "family"


class Sensitivity(str, Enum):
    normal = "normal"
    restricted = "restricted"


class TaskCategory(str, Enum):
    medication = "medication"
    appointment = "appointment"
    monitoring = "monitoring"
    transport = "transport"
    household = "household"
    communication = "communication"
    other = "other"


class TaskFrequency(str, Enum):
    once = "once"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    as_needed = "as_needed"


class AssignmentStatus(str, Enum):
    pending = "pending"
    done = "done"
    missed = "missed"


class GapKind(str, Enum):
    unowned = "unowned"            # task with zero assignments
    redundant = "redundant"        # exclusive task with 2+ assignments
    plan_conflict = "plan_conflict"  # Gemini collision between care plans
    missed = "missed"              # assignment marked missed


class GapSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class GapStatus(str, Enum):
    open = "open"
    resolved = "resolved"


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


# ---------------------------------------------------------------------------
# Models - people & networks
# ---------------------------------------------------------------------------

class PersonCreate(BaseModel):
    person_type: PersonType
    subrole: str                      # "cardiologist", "spouse", "neighbor", ...
    full_name: str
    phone_number: str | None = None
    is_physician: bool = False


class PersonUpdate(BaseModel):
    """Only fields that are explicitly set are written."""
    subrole: str | None = None
    full_name: str | None = None
    phone_number: str | None = None
    is_physician: bool | None = None


class Person(PersonCreate):
    id: int
    created_at: datetime


class CareNetworkCreate(BaseModel):
    patient_id: int
    network_name: str


class CareNetwork(CareNetworkCreate):
    id: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Models - graph
# ---------------------------------------------------------------------------

class RelationshipCreate(BaseModel):
    network_id: int
    source_person_id: int
    target_person_id: int
    label: str                        # "prescribes insulin"
    sensitivity: Sensitivity = Sensitivity.normal


class Relationship(RelationshipCreate):
    id: int
    created_at: datetime
    is_redacted: bool = False


class NetworkGraph(BaseModel):
    network_id: int
    nodes: list[Person]               # members, ordered by id
    edges: list[Relationship]         # ordered by id, redacted as needed


# ---------------------------------------------------------------------------
# Models - tasks & assignments
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    network_id: int
    title: str
    category: TaskCategory
    required_role: str | None = None  # matched against subrole or person_type
    frequency: TaskFrequency = TaskFrequency.once
    due_date: date | None = None
    is_exclusive: bool = False        # True -> only one person should own it
    sensitivity: Sensitivity = Sensitivity.normal
    created_by_person_id: int | None = None


class TaskUpdate(BaseModel):
    """Only fields that are explicitly set are written."""
    title: str | None = None
    category: TaskCategory | None = None
    required_role: str | None = None
    frequency: TaskFrequency | None = None
    due_date: date | None = None
    is_exclusive: bool | None = None
    sensitivity: Sensitivity | None = None


class TaskAssignment(BaseModel):
    id: int
    task_id: int
    person_id: int
    status: AssignmentStatus
    assigned_at: datetime
    updated_at: datetime


class Task(TaskCreate):
    id: int
    created_at: datetime
    assignments: list[TaskAssignment] = Field(default_factory=list)
    is_redacted: bool = False


# ---------------------------------------------------------------------------
# Models - availability
# ---------------------------------------------------------------------------

class AvailabilityWindowCreate(BaseModel):
    weekday: int = Field(ge=0, le=6)  # 0 = Monday ... 6 = Sunday
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def check_window_order(self) -> "AvailabilityWindowCreate":
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        return self


class AvailabilityWindow(AvailabilityWindowCreate):
    id: int
    person_id: int


# ---------------------------------------------------------------------------
# Models - care plans & gaps
# ---------------------------------------------------------------------------

class CarePlanCreate(BaseModel):
    network_id: int
    author_person_id: int
    title: str
    raw_text: str
    sensitivity: Sensitivity = Sensitivity.normal


class CarePlan(CarePlanCreate):
    id: int
    created_at: datetime
    is_redacted: bool = False


class GapCreate(BaseModel):
    gap_kind: GapKind
    severity: GapSeverity
    description: str
    task_id: int | None = None
    suggested_assignee_id: int | None = None
    related_care_plan_ids: list[int] = Field(default_factory=list)


class Gap(GapCreate):
    id: int
    network_id: int
    status: GapStatus
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by_person_id: int | None = None
    is_redacted: bool = False


# ---------------------------------------------------------------------------
# Models - check-ins & burnout
# ---------------------------------------------------------------------------

class CheckinCreate(BaseModel):
    person_id: int
    network_id: int
    message: str
    sentiment_score: float = Field(ge=-1.0, le=1.0)  # computed before insert


class Checkin(CheckinCreate):
    id: int
    created_at: datetime


class BurnoutScoreCreate(BaseModel):
    person_id: int
    network_id: int
    score: int = Field(ge=0, le=100)
    task_share: float = Field(ge=0.0, le=1.0)
    missed_count: int = Field(ge=0)
    sentiment_average: float | None = Field(default=None, ge=-1.0, le=1.0)


class BurnoutScore(BurnoutScoreCreate):
    id: int
    computed_at: datetime


# ---------------------------------------------------------------------------
# Models - access control
# ---------------------------------------------------------------------------

class AccessGrant(BaseModel):
    network_id: int
    grantee_person_id: int
    granted_by_person_id: int
    granted_at: datetime


# ---------------------------------------------------------------------------
# The contract
# ---------------------------------------------------------------------------

