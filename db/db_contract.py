"""
Caregiver Constellation - DBManager contract.

Shared by everyone. The real SQLiteDBManager (SQLAlchemy) and any FakeDBManager
both subclass DBManager and must follow the behaviour described in the docstrings
below and in the "DBManager Contract" doc.

Do not redefine these models elsewhere; import them from here.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, time
from datetime import datetime
from enum import Enum
from typing import Final

from pydantic import model_validator, Field as PDField
from sqlmodel import Field as SQField, SQLModel

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
# Models - people & networks
# ---------------------------------------------------------------------------

class PersonCreate(SQLModel):
    person_type: PersonType
    subrole: str                      # "cardiologist", "spouse", "neighbor", ...
    full_name: str
    phone_number: str | None = None
    is_physician: bool = False


class PersonUpdate(SQLModel):
    """Only fields that are explicitly set are written."""
    subrole: str | None = None
    full_name: str | None = None
    phone_number: str | None = None
    is_physician: bool | None = None


class Person(PersonCreate):
    id: int
    created_at: datetime


class CareNetworkCreate(SQLModel):
    patient_id: int
    network_name: str


class CareNetwork(CareNetworkCreate):
    id: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Models - graph
# ---------------------------------------------------------------------------

class RelationshipCreate(SQLModel):
    network_id: int
    source_person_id: int
    target_person_id: int
    label: str                        # "prescribes insulin"
    sensitivity: Sensitivity = Sensitivity.normal


class Relationship(RelationshipCreate):
    id: int
    created_at: datetime
    is_redacted: bool = False


class NetworkGraph(SQLModel):
    network_id: int
    nodes: list[Person]               # members, ordered by id
    edges: list[Relationship]         # ordered by id, redacted as needed


# ---------------------------------------------------------------------------
# Models - tasks & assignments
# ---------------------------------------------------------------------------

class TaskCreate(SQLModel):
    network_id: int
    title: str
    category: TaskCategory
    required_role: str | None = None  # matched against subrole or person_type
    frequency: TaskFrequency = TaskFrequency.once
    due_date: date | None = None
    is_exclusive: bool = False        # True -> only one person should own it
    sensitivity: Sensitivity = Sensitivity.normal
    created_by_person_id: int | None = None

class TaskUpdate(SQLModel):
    """Only fields that are explicitly set are written."""
    title: str | None = None
    category: TaskCategory | None = None
    required_role: str | None = None
    frequency: TaskFrequency | None = None
    due_date: date | None = None
    is_exclusive: bool | None = None
    sensitivity: Sensitivity | None = None


class TaskAssignmentBase(SQLModel):
    task_id: int = SQField(foreign_key="tasks.id")
    person_id: int = SQField(foreign_key="people.id")
    status: AssignmentStatus = AssignmentStatus.pending

class TaskAssignment(TaskAssignmentBase):
    id: int
    assigned_at: datetime
    updated_at: datetime

class Task(TaskCreate):
    id: int
    created_at: datetime
    assignments: list[TaskAssignment] = PDField(default_factory=list)
    is_redacted: bool = False


# ---------------------------------------------------------------------------
# Models - availability
# ---------------------------------------------------------------------------

class AvailabilityWindowCreate(SQLModel):
    weekday: int = PDField(ge=0, le=6)  # 0 = Monday ... 6 = Sunday
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

class CarePlanCreate(SQLModel):
    network_id: int
    author_person_id: int
    title: str
    raw_text: str
    sensitivity: Sensitivity = Sensitivity.normal


class CarePlan(CarePlanCreate):
    id: int
    created_at: datetime
    is_redacted: bool = False


class GapCreate(SQLModel):
    gap_kind: GapKind
    severity: GapSeverity
    description: str
    task_id: int | None = None
    suggested_assignee_id: int | None = None
    related_care_plan_ids: list[int] = PDField(default_factory=list)


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

class CheckinCreate(SQLModel):
    person_id: int
    network_id: int
    message: str
    sentiment_score: float = PDField(ge=-1.0, le=1.0)  # computed before insert


class Checkin(CheckinCreate):
    id: int
    created_at: datetime


class BurnoutScoreCreate(SQLModel):
    person_id: int
    network_id: int
    score: int = PDField(ge=0, le=100)
    task_share: float = PDField(ge=0.0, le=1.0)
    missed_count: int = PDField(ge=0)
    sentiment_average: float | None = PDField(default=None, ge=-1.0, le=1.0)


class BurnoutScore(BurnoutScoreCreate):
    id: int
    computed_at: datetime


# ---------------------------------------------------------------------------
# Models - access control
# ---------------------------------------------------------------------------

class AccessGrant(SQLModel):
    network_id: int
    grantee_person_id: int
    granted_by_person_id: int
    granted_at: datetime


class DBManager(ABC):
    """
    Rules every implementation follows:

    * Every method is one transaction: full success or no change.
    * Returned models are copies; mutating them never changes stored data.
    * Lists are ordered ascending by id unless a method says otherwise.
    * Any method taking viewer_id:
        - raises AccessDeniedError if the viewer is not a member of the network
          (SYSTEM_VIEWER_ID bypasses every check);
        - returns restricted Task / Relationship / CarePlan / Gap rows with
          is_redacted=True and their text replaced by the REDACTED_* constants,
          unless the viewer is the patient, a physician member, or has a grant.
    * Writes are not access-checked, except grant/revoke.
    """

    # ----- lifecycle ------------------------------------------------------

    @abstractmethod
    async def connect(self) -> None:
        """Open the connection and enable foreign keys."""

    @abstractmethod
    async def close(self) -> None:
        """Close the connection. Safe to call twice."""

    @abstractmethod
    async def init_schema(self) -> None:
        """Create all tables if missing. Idempotent."""

    @abstractmethod
    async def reset_all_data(self) -> None:
        """Delete every row, keep tables. For demo seeding and tests."""

    # ----- people ---------------------------------------------------------

    @abstractmethod
    async def create_person(self, new_person: PersonCreate) -> Person: ...

    @abstractmethod
    async def get_person(self, person_id: int) -> Person:
        """NotFoundError. Not access-checked (name/phone are not restricted)."""

    @abstractmethod
    async def update_person(self, person_id: int, changes: PersonUpdate) -> Person:
        """Write only fields set in `changes` (model_fields_set). NotFoundError."""

    @abstractmethod
    async def list_people_in_network(self, network_id: int, viewer_id: int) -> list[Person]:
        """Members ordered by id."""

    # ----- care networks --------------------------------------------------

    @abstractmethod
    async def create_care_network(self, new_network: CareNetworkCreate) -> CareNetwork:
        """Adds the patient as a member.
        NotFoundError if patient missing; ConflictError if person_type != patient
        or the patient already has a network."""

    @abstractmethod
    async def get_care_network(self, network_id: int, viewer_id: int) -> CareNetwork:
        """NotFoundError, AccessDeniedError."""

    @abstractmethod
    async def list_networks_for_person(self, person_id: int) -> list[CareNetwork]:
        """Networks the person is a member of."""

    @abstractmethod
    async def add_network_member(self, network_id: int, person_id: int) -> None:
        """Idempotent. NotFoundError for either id."""

    @abstractmethod
    async def remove_network_member(self, network_id: int, person_id: int) -> None:
        """Also deletes the person's assignments, relationships and grant in this
        network. ConflictError when removing the patient."""

    # ----- graph ----------------------------------------------------------

    @abstractmethod
    async def create_relationship(self, new_relationship: RelationshipCreate) -> Relationship:
        """ConflictError if either end is not a member or source == target."""

    @abstractmethod
    async def delete_relationship(self, relationship_id: int) -> None:
        """NotFoundError."""

    @abstractmethod
    async def get_network_graph(self, network_id: int, viewer_id: int) -> NetworkGraph:
        """Nodes = members, edges = relationships, both ordered by id, redacted as needed."""

    # ----- tasks ----------------------------------------------------------

    @abstractmethod
    async def create_task(self, new_task: TaskCreate) -> Task:
        """Starts with no assignments. NotFoundError for unknown network."""

    @abstractmethod
    async def get_task(self, task_id: int, viewer_id: int) -> Task:
        """NotFoundError, AccessDeniedError."""

    @abstractmethod
    async def update_task(self, task_id: int, changes: TaskUpdate) -> Task:
        """Partial update; returned unredacted. NotFoundError."""

    @abstractmethod
    async def delete_task(self, task_id: int) -> None:
        """Deletes its assignments and any gaps linked to it. NotFoundError."""

    @abstractmethod
    async def list_tasks(self, network_id: int, viewer_id: int) -> list[Task]:
        """Ordered by due_date (None last), then id. Each task carries its assignments."""

    @abstractmethod
    async def list_tasks_for_person(
            self, network_id: int, person_id: int, viewer_id: int
    ) -> list[Task]:
        """Tasks the person is assigned to; same ordering as list_tasks."""

    # ----- assignments ----------------------------------------------------

    @abstractmethod
    async def assign_task(self, task_id: int, person_id: int) -> TaskAssignment:
        """Status starts pending. Idempotent (returns the existing row).
        NEVER rejects a second owner on an exclusive task - that is a gap, not an error.
        NotFoundError for unknown task/person; ConflictError if person is not a member."""

    @abstractmethod
    async def unassign_task(self, task_id: int, person_id: int) -> None:
        """NotFoundError if not assigned."""

    @abstractmethod
    async def set_assignment_status(
            self, task_id: int, person_id: int, status: AssignmentStatus
    ) -> TaskAssignment:
        """Updates updated_at. NotFoundError if not assigned."""

    # ----- availability ---------------------------------------------------

    @abstractmethod
    async def replace_availability(
            self, person_id: int, windows: list[AvailabilityWindowCreate]
    ) -> list[AvailabilityWindow]:
        """Replaces all of the person's windows. NotFoundError for unknown person."""

    @abstractmethod
    async def get_availability(self, person_id: int) -> list[AvailabilityWindow]:
        """Ordered by weekday, then start_time."""

    @abstractmethod
    async def list_availability_in_network(
            self, network_id: int, viewer_id: int
    ) -> dict[int, list[AvailabilityWindow]]:
        """Keyed by person id; every member present (empty list if none)."""

    # ----- care plans -----------------------------------------------------

    @abstractmethod
    async def create_care_plan(self, new_plan: CarePlanCreate) -> CarePlan:
        """ConflictError if the author is not a member."""

    @abstractmethod
    async def get_care_plan(self, care_plan_id: int, viewer_id: int) -> CarePlan:
        """NotFoundError, AccessDeniedError."""

    @abstractmethod
    async def list_care_plans(self, network_id: int, viewer_id: int) -> list[CarePlan]:
        """Ordered by id."""

    # ----- gaps -----------------------------------------------------------

    @abstractmethod
    async def replace_open_gaps(self, network_id: int, new_gaps: list[GapCreate]) -> list[Gap]:
        """Atomically delete the network's OPEN gaps and insert new_gaps as open.
        Resolved gaps are untouched. Gap ids change between engine runs."""

    @abstractmethod
    async def list_gaps(
            self, network_id: int, viewer_id: int, status: GapStatus | None = GapStatus.open
    ) -> list[Gap]:
        """status=None returns all. Ordered high -> low severity, then id.
        A gap linked to a restricted task or care plan is redacted for viewers without access."""

    @abstractmethod
    async def resolve_gap(self, gap_id: int, resolved_by_person_id: int) -> Gap:
        """Sets status=resolved and resolved_at. Idempotent. NotFoundError."""

    # ----- check-ins & burnout -------------------------------------------

    @abstractmethod
    async def create_checkin(self, new_checkin: CheckinCreate) -> Checkin:
        """sentiment_score is computed by the caller before insert."""

    @abstractmethod
    async def list_checkins(
            self, network_id: int, person_id: int, viewer_id: int, limit: int = 50
    ) -> list[Checkin]:
        """Newest first. AccessDeniedError unless viewer is person_id or SYSTEM_VIEWER_ID."""

    @abstractmethod
    async def record_burnout_score(self, new_score: BurnoutScoreCreate) -> BurnoutScore:
        """Appends; never overwrites."""

    @abstractmethod
    async def list_latest_burnout_scores(self, network_id: int, viewer_id: int) -> list[BurnoutScore]:
        """Newest score per member that has one. Ordered by score, highest first."""

    @abstractmethod
    async def get_burnout_history(
            self, network_id: int, person_id: int, viewer_id: int, limit: int = 30
    ) -> list[BurnoutScore]:
        """The newest `limit` rows, returned oldest -> newest for charting."""

    # ----- access control -------------------------------------------------

    @abstractmethod
    async def grant_restricted_access(
            self, network_id: int, grantee_person_id: int, granted_by_person_id: int
    ) -> AccessGrant:
        """Idempotent. AccessDeniedError unless granter is the patient or SYSTEM_VIEWER_ID.
        ConflictError if grantee is not a member."""

    @abstractmethod
    async def revoke_restricted_access(
            self, network_id: int, grantee_person_id: int, revoked_by_person_id: int
    ) -> None:
        """No-op if no grant exists. Same AccessDeniedError rule as grant."""

    @abstractmethod
    async def list_access_grants(self, network_id: int, viewer_id: int) -> list[AccessGrant]:
        """Membership-checked."""

    @abstractmethod
    async def can_view_restricted(self, network_id: int, viewer_id: int) -> bool:
        """True for SYSTEM_VIEWER_ID, the patient, physician members, and grantees.
        Returns False (does not raise) for non-members."""
