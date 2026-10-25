from __future__ import annotations

from abc import ABC, abstractmethod

from db.db_contract import PersonCreate, Person, PersonUpdate, CareNetworkCreate, CareNetwork, RelationshipCreate, Relationship, NetworkGraph, \
    TaskCreate, Task, TaskUpdate, TaskAssignment, AssignmentStatus, AvailabilityWindowCreate, AvailabilityWindow, CarePlanCreate, CarePlan, GapCreate, \
    Gap, GapStatus, CheckinCreate, Checkin, BurnoutScoreCreate, BurnoutScore, AccessGrant


class FakeDBManager(ABC):
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