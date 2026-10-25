from __future__ import annotations

from sqlalchemy import case, delete, event, func, or_
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from db.db_contract import (
    REDACTED_CARE_PLAN_TITLE,
    REDACTED_GAP_DESCRIPTION,
    REDACTED_RELATIONSHIP_LABEL,
    REDACTED_TASK_TITLE,
    SYSTEM_VIEWER_ID,
    AccessGrant,
    AssignmentStatus,
    AvailabilityWindow,
    AvailabilityWindowCreate,
    BurnoutScore,
    BurnoutScoreCreate,
    CareNetwork,
    CareNetworkCreate,
    CarePlan,
    CarePlanCreate,
    Checkin,
    CheckinCreate,
    DBManager,
    Gap,
    GapCreate,
    GapSeverity,
    GapStatus,
    NetworkGraph,
    Person,
    PersonCreate,
    PersonType,
    PersonUpdate,
    Relationship,
    RelationshipCreate,
    Sensitivity,
    Task,
    TaskAssignment,
    TaskCategory,
    TaskCreate,
    TaskUpdate,
)
from db.db_models import (
    AccessGrantsRow,
    AssignmentsRow,
    AvailabilityRow,
    BurnoutScoresRow,
    CareNetworksRow,
    CarePlansRow,
    CheckinsRow,
    GapsRow,
    NetworkMembersRow,
    PersonsRow,
    RelationshipsRow,
    TasksRow,
)  # importing tables registers them in SQLModel.metadata
from db.exceptions import AccessDeniedError, ConflictError, NotFoundError
from misc.utils import utc_now


# REAL DEAL -----------------------------------------------------------------------------------------------------------

def enable_sqlite_pragmas(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


class SQLiteDBManager(DBManager):
    def __init__(self, database_path: str):
        self.database_url = f"sqlite+aiosqlite:///{database_path}"
        self.engine: AsyncEngine | None = None
        self.session_factory: async_sessionmaker[AsyncSession] | None = None

    # MANAGEMENT -------------------------------------------------------------------------------
    async def connect(self) -> None:
        self.engine = create_async_engine(self.database_url, connect_args={"timeout": 15})
        event.listen(self.engine.sync_engine, "connect", enable_sqlite_pragmas)
        self.session_factory = async_sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def close(self) -> None:
        if self.engine is not None:
            await self.engine.dispose()
            self.engine = None

    async def init_schema(self) -> None:
        async with self.engine.begin() as connection:
            await connection.run_sync(SQLModel.metadata.create_all)

    async def reset_all_data(self) -> None:
        async with self.session_factory() as session, session.begin():
            for table in reversed(SQLModel.metadata.sorted_tables):
                await session.exec(delete(table))

    # HELPERS ----------------------------------------------------------------------------------
    async def _get_network(self, session: AsyncSession, network_id: int) -> CareNetworksRow:
        network = await session.get(CareNetworksRow, network_id)
        if network is None:
            raise NotFoundError(f"care network {network_id} does not exist")
        return network

    async def _require_member(
            self, session: AsyncSession, network_id: int, viewer_id: int
    ) -> CareNetworksRow:
        network = await self._get_network(session, network_id)
        if viewer_id == SYSTEM_VIEWER_ID:
            return network
        membership = await session.get(NetworkMembersRow, (network_id, viewer_id))
        if membership is None:
            raise AccessDeniedError(f"person {viewer_id} is not in network {network_id}")
        return network

    async def _is_member(
            self, session: AsyncSession, network_id: int, person_id: int
    ) -> bool:
        membership = await session.get(NetworkMembersRow, (network_id, person_id))
        return membership is not None

    async def _can_view_restricted(
            self, session: AsyncSession, network_id: int, viewer_id: int
    ) -> bool:
        if viewer_id == SYSTEM_VIEWER_ID:
            return True
        network = await session.get(CareNetworksRow, network_id)
        if network is None:
            return False
        if viewer_id == network.patient_id:
            return True
        if not await self._is_member(session, network_id, viewer_id):
            return False
        person = await session.get(PersonsRow, viewer_id)
        if person is not None and person.is_physician:
            return True
        grant = await session.get(AccessGrantsRow, (network_id, viewer_id))
        return grant is not None

    @staticmethod
    def _redact_task(task: Task) -> Task:
        return task.model_copy(update={
            "title": REDACTED_TASK_TITLE,
            "category": TaskCategory.other,
            "required_role": None,
            "is_redacted": True,
        })

    @staticmethod
    def _redact_relationship(relationship: Relationship) -> Relationship:
        return relationship.model_copy(update={
            "label": REDACTED_RELATIONSHIP_LABEL,
            "is_redacted": True,
        })

    @staticmethod
    def _redact_care_plan(care_plan: CarePlan) -> CarePlan:
        return care_plan.model_copy(update={
            "title": REDACTED_CARE_PLAN_TITLE,
            "raw_text": "",
            "is_redacted": True,
        })

    @staticmethod
    def _redact_gap(gap: Gap) -> Gap:
        return gap.model_copy(update={
            "description": REDACTED_GAP_DESCRIPTION,
            "is_redacted": True,
        })

    async def _maybe_redact_task(self, task: Task, can_view: bool) -> Task:
        if can_view or task.sensitivity != Sensitivity.restricted:
            return task
        return self._redact_task(task)

    async def _maybe_redact_relationship(
            self, relationship: Relationship, can_view: bool
    ) -> Relationship:
        if can_view or relationship.sensitivity != Sensitivity.restricted:
            return relationship
        return self._redact_relationship(relationship)

    async def _maybe_redact_care_plan(self, care_plan: CarePlan, can_view: bool) -> CarePlan:
        if can_view or care_plan.sensitivity != Sensitivity.restricted:
            return care_plan
        return self._redact_care_plan(care_plan)

    async def _maybe_redact_gap(
            self, session: AsyncSession, gap: Gap, can_view: bool
    ) -> Gap:
        if can_view:
            return gap
        if gap.task_id is not None:
            task_row = await session.get(TasksRow, gap.task_id)
            if task_row is not None and task_row.sensitivity == Sensitivity.restricted:
                return self._redact_gap(gap)
        for care_plan_id in gap.related_care_plan_ids:
            plan_row = await session.get(CarePlansRow, care_plan_id)
            if plan_row is not None and plan_row.sensitivity == Sensitivity.restricted:
                return self._redact_gap(gap)
        return gap

    async def _load_task(self, session: AsyncSession, task_id: int) -> TasksRow:
        # noinspection PyTypeChecker
        result = await session.exec(
            select(TasksRow)
            .where(TasksRow.id == task_id)
            .options(selectinload(TasksRow.assignments))
        )
        task_row = result.first()
        if task_row is None:
            raise NotFoundError(f"task {task_id} does not exist")
        return task_row

    @staticmethod
    def _task_statement(*where_clauses):
        statement = select(TasksRow).options(selectinload(TasksRow.assignments))
        if where_clauses:
            statement = statement.where(*where_clauses)
        # noinspection PyTypeChecker
        return statement.order_by(
            TasksRow.due_date.is_(None),
            TasksRow.due_date,
            TasksRow.id,
        )

    # METHODS ---------------------------------------------------------------------------------
    # PEOPLE
    async def create_person(self, new_person: PersonCreate) -> Person:
        async with self.session_factory() as session, session.begin():
            person_row = PersonsRow.model_validate(new_person)
            session.add(person_row)
            await session.flush()  # assigns the id
            return Person.model_validate(person_row)

    async def get_person(self, person_id: int) -> Person:
        async with self.session_factory() as session, session.begin():
            person_row = await session.get(PersonsRow, person_id)
            if person_row is None:
                raise NotFoundError(f"person {person_id} does not exist")
            return Person.model_validate(person_row)

    async def update_person(self, person_id: int, changes: PersonUpdate) -> Person:
        async with self.session_factory() as session, session.begin():
            person_row = await session.get(PersonsRow, person_id)
            if person_row is None:
                raise NotFoundError(f"person {person_id} does not exist")
            person_row.sqlmodel_update(changes.model_dump(exclude_unset=True))
            return Person.model_validate(person_row)

    async def list_people_in_network(self, network_id: int, viewer_id: int) -> list[Person]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            result = await session.exec(
                select(PersonsRow)
                .join(NetworkMembersRow, NetworkMembersRow.person_id == PersonsRow.id)
                .where(NetworkMembersRow.network_id == network_id)
                .order_by(PersonsRow.id)
            )
            return [Person.model_validate(person_row) for person_row in result.all()]

    # CARE NETWORKS

    async def create_care_network(self, new_network: CareNetworkCreate) -> CareNetwork:
        async with self.session_factory() as session, session.begin():
            patient = await session.get(PersonsRow, new_network.patient_id)
            if patient is None:
                raise NotFoundError(f"person {new_network.patient_id} does not exist")
            if patient.person_type != PersonType.patient:
                raise ConflictError(
                    f"person {new_network.patient_id} is not a patient"
                )
            # noinspection PyTypeChecker
            existing = await session.exec(
                select(CareNetworksRow).where(
                    CareNetworksRow.patient_id == new_network.patient_id
                )
            )
            if existing.first() is not None:
                raise ConflictError(
                    f"person {new_network.patient_id} already has a care network"
                )
            network_row = CareNetworksRow.model_validate(new_network)
            session.add(network_row)
            await session.flush()
            session.add(NetworkMembersRow(
                network_id=network_row.id,
                person_id=new_network.patient_id,
            ))
            return CareNetwork.model_validate(network_row)

    async def get_care_network(self, network_id: int, viewer_id: int) -> CareNetwork:
        async with self.session_factory() as session, session.begin():
            network = await self._require_member(session, network_id, viewer_id)
            return CareNetwork.model_validate(network)

    async def list_networks_for_person(self, person_id: int) -> list[CareNetwork]:
        async with self.session_factory() as session, session.begin():
            result = await session.exec(
                select(CareNetworksRow)
                .join(NetworkMembersRow, NetworkMembersRow.network_id == CareNetworksRow.id)
                .where(NetworkMembersRow.person_id == person_id)
                .order_by(CareNetworksRow.id)
            )
            return [CareNetwork.model_validate(network_row) for network_row in result.all()]

    async def add_network_member(self, network_id: int, person_id: int) -> None:
        async with self.session_factory() as session, session.begin():
            await self._get_network(session, network_id)
            if await session.get(PersonsRow, person_id) is None:
                raise NotFoundError(f"person {person_id} does not exist")
            membership = await session.get(NetworkMembersRow, (network_id, person_id))
            if membership is None:
                session.add(NetworkMembersRow(network_id=network_id, person_id=person_id))

    async def remove_network_member(self, network_id: int, person_id: int) -> None:
        async with self.session_factory() as session, session.begin():
            network = await self._get_network(session, network_id)
            if await session.get(PersonsRow, person_id) is None:
                raise NotFoundError(f"person {person_id} does not exist")
            if network.patient_id == person_id:
                raise ConflictError("cannot remove the patient from their own network")
            membership = await session.get(NetworkMembersRow, (network_id, person_id))
            if membership is None:
                raise NotFoundError(
                    f"person {person_id} is not a member of network {network_id}"
                )
            # noinspection PyTypeChecker
            await session.exec(
                delete(AssignmentsRow).where(
                    AssignmentsRow.person_id == person_id,
                    AssignmentsRow.task_id.in_(
                        select(TasksRow.id).where(TasksRow.network_id == network_id)
                    ),
                )
            )
            # noinspection PyTypeChecker
            await session.exec(
                delete(RelationshipsRow).where(
                    RelationshipsRow.network_id == network_id,
                    or_(
                        RelationshipsRow.source_person_id == person_id,
                        RelationshipsRow.target_person_id == person_id,
                    ),
                )
            )
            # noinspection PyTypeChecker
            await session.exec(
                delete(AccessGrantsRow).where(
                    AccessGrantsRow.network_id == network_id,
                    AccessGrantsRow.grantee_person_id == person_id,
                )
            )
            await session.delete(membership)

    # GRAPH
    async def create_relationship(self, new_relationship: RelationshipCreate) -> Relationship:
        async with self.session_factory() as session, session.begin():
            if new_relationship.source_person_id == new_relationship.target_person_id:
                raise ConflictError("relationship source and target must differ")
            if not await self._is_member(
                    session, new_relationship.network_id, new_relationship.source_person_id
            ):
                raise ConflictError(
                    f"person {new_relationship.source_person_id} is not a member "
                    f"of network {new_relationship.network_id}"
                )
            if not await self._is_member(
                    session, new_relationship.network_id, new_relationship.target_person_id
            ):
                raise ConflictError(
                    f"person {new_relationship.target_person_id} is not a member "
                    f"of network {new_relationship.network_id}"
                )
            relationship_row = RelationshipsRow.model_validate(new_relationship)
            session.add(relationship_row)
            await session.flush()
            return Relationship.model_validate(relationship_row)

    async def delete_relationship(self, relationship_id: int) -> None:
        async with self.session_factory() as session, session.begin():
            relationship_row = await session.get(RelationshipsRow, relationship_id)
            if relationship_row is None:
                raise NotFoundError(f"relationship {relationship_id} does not exist")
            await session.delete(relationship_row)

    async def get_network_graph(self, network_id: int, viewer_id: int) -> NetworkGraph:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            can_view = await self._can_view_restricted(session, network_id, viewer_id)
            # noinspection PyTypeChecker
            people_result = await session.exec(
                select(PersonsRow)
                .join(NetworkMembersRow, NetworkMembersRow.person_id == PersonsRow.id)
                .where(NetworkMembersRow.network_id == network_id)
                .order_by(PersonsRow.id)
            )
            nodes = [Person.model_validate(person_row) for person_row in people_result.all()]

            # noinspection PyTypeChecker
            rel_result = await session.exec(
                select(RelationshipsRow)
                .where(RelationshipsRow.network_id == network_id)
                .order_by(RelationshipsRow.id)
            )
            edges = [
                await self._maybe_redact_relationship(
                    Relationship.model_validate(relationship_row), can_view
                )
                for relationship_row in rel_result.all()
            ]
            return NetworkGraph(network_id=network_id, nodes=nodes, edges=edges)

    # TASKS
    async def create_task(self, new_task: TaskCreate) -> Task:
        async with self.session_factory() as session, session.begin():
            await self._get_network(session, new_task.network_id)
            task_row = TasksRow.model_validate(new_task)
            session.add(task_row)
            await session.flush()
            task_row = await self._load_task(session, task_row.id)
            return Task.model_validate(task_row)

    async def get_task(self, task_id: int, viewer_id: int) -> Task:
        async with self.session_factory() as session, session.begin():
            task_row = await self._load_task(session, task_id)
            can_view = await self._can_view_restricted(session, task_row.network_id, viewer_id)
            await self._require_member(session, task_row.network_id, viewer_id)
            return await self._maybe_redact_task(Task.model_validate(task_row), can_view)

    async def update_task(self, task_id: int, changes: TaskUpdate) -> Task:
        async with self.session_factory() as session, session.begin():
            task_row = await self._load_task(session, task_id)
            task_row.sqlmodel_update(changes.model_dump(exclude_unset=True))
            task_row = await self._load_task(session, task_id)
            return Task.model_validate(task_row)

    async def delete_task(self, task_id: int) -> None:
        async with self.session_factory() as session, session.begin():
            task_row = await session.get(TasksRow, task_id)
            if task_row is None:
                raise NotFoundError(f"task {task_id} does not exist")
            # noinspection PyTypeChecker
            await session.exec(
                delete(AssignmentsRow).where(AssignmentsRow.task_id == task_id)
            )
            # noinspection PyTypeChecker
            await session.exec(delete(GapsRow).where(GapsRow.task_id == task_id))
            await session.delete(task_row)

    async def list_tasks(self, network_id: int, viewer_id: int) -> list[Task]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            can_view = await self._can_view_restricted(session, network_id, viewer_id)
            result = await session.exec(self._task_statement(TasksRow.network_id == network_id))
            return [
                await self._maybe_redact_task(Task.model_validate(task_row), can_view)
                for task_row in result.all()
            ]

    async def list_tasks_for_person(
            self, network_id: int, person_id: int, viewer_id: int
    ) -> list[Task]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            can_view = await self._can_view_restricted(session, network_id, viewer_id)
            result = await session.exec(
                self._task_statement(
                    TasksRow.network_id == network_id,
                    TasksRow.id.in_(
                        select(AssignmentsRow.task_id).where(
                            AssignmentsRow.person_id == person_id
                        )
                    ),
                )
            )
            return [
                await self._maybe_redact_task(Task.model_validate(task_row), can_view)
                for task_row in result.all()
            ]

    # ASSIGNMENTS
    async def assign_task(self, task_id: int, person_id: int) -> TaskAssignment:
        async with self.session_factory() as session, session.begin():
            if await session.get(PersonsRow, person_id) is None:
                raise NotFoundError(f"person {person_id} does not exist")
            task_row = await session.get(TasksRow, task_id)
            if task_row is None:
                raise NotFoundError(f"task {task_id} does not exist")
            if not await self._is_member(session, task_row.network_id, person_id):
                raise ConflictError(
                    f"person {person_id} is not a member of network {task_row.network_id}"
                )
            # noinspection PyTypeChecker
            existing = await session.exec(
                select(AssignmentsRow).where(
                    AssignmentsRow.task_id == task_id,
                    AssignmentsRow.person_id == person_id,
                )
            )
            assignment_row = existing.first()
            if assignment_row is not None:
                return TaskAssignment.model_validate(assignment_row)
            assignment_row = AssignmentsRow(task_id=task_id, person_id=person_id)
            session.add(assignment_row)
            await session.flush()
            return TaskAssignment.model_validate(assignment_row)

    async def unassign_task(self, task_id: int, person_id: int) -> None:
        async with self.session_factory() as session, session.begin():
            # noinspection PyTypeChecker
            existing = await session.exec(
                select(AssignmentsRow).where(
                    AssignmentsRow.task_id == task_id,
                    AssignmentsRow.person_id == person_id,
                )
            )
            assignment_row = existing.first()
            if assignment_row is None:
                raise NotFoundError(
                    f"person {person_id} is not assigned to task {task_id}"
                )
            await session.delete(assignment_row)

    async def set_assignment_status(
            self, task_id: int, person_id: int, status: AssignmentStatus
    ) -> TaskAssignment:
        async with self.session_factory() as session, session.begin():
            # noinspection PyTypeChecker
            existing = await session.exec(
                select(AssignmentsRow).where(
                    AssignmentsRow.task_id == task_id,
                    AssignmentsRow.person_id == person_id,
                )
            )
            assignment_row = existing.first()
            if assignment_row is None:
                raise NotFoundError(
                    f"person {person_id} is not assigned to task {task_id}"
                )
            assignment_row.status = status
            assignment_row.updated_at = utc_now()
            return TaskAssignment.model_validate(assignment_row)

    # AVAILABILITY
    async def replace_availability(
            self, person_id: int, windows: list[AvailabilityWindowCreate]
    ) -> list[AvailabilityWindow]:
        async with self.session_factory() as session, session.begin():
            if await session.get(PersonsRow, person_id) is None:
                raise NotFoundError(f"person {person_id} does not exist")
            # noinspection PyTypeChecker
            await session.exec(
                delete(AvailabilityRow).where(AvailabilityRow.person_id == person_id)
            )
            for window in windows:
                session.add(AvailabilityRow(person_id=person_id, **window.model_dump()))
            await session.flush()
            # noinspection PyTypeChecker
            result = await session.exec(
                select(AvailabilityRow)
                .where(AvailabilityRow.person_id == person_id)
                .order_by(AvailabilityRow.weekday, AvailabilityRow.start_time, AvailabilityRow.id)
            )
            return [AvailabilityWindow.model_validate(row) for row in result.all()]

    async def get_availability(self, person_id: int) -> list[AvailabilityWindow]:
        async with self.session_factory() as session, session.begin():
            if await session.get(PersonsRow, person_id) is None:
                raise NotFoundError(f"person {person_id} does not exist")
            # noinspection PyTypeChecker
            result = await session.exec(
                select(AvailabilityRow)
                .where(AvailabilityRow.person_id == person_id)
                .order_by(AvailabilityRow.weekday, AvailabilityRow.start_time, AvailabilityRow.id)
            )
            return [AvailabilityWindow.model_validate(row) for row in result.all()]

    async def list_availability_in_network(
            self, network_id: int, viewer_id: int
    ) -> dict[int, list[AvailabilityWindow]]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            # noinspection PyTypeChecker
            members_result = await session.exec(
                select(PersonsRow)
                .join(NetworkMembersRow, NetworkMembersRow.person_id == PersonsRow.id)
                .where(NetworkMembersRow.network_id == network_id)
                .order_by(PersonsRow.id)
            )
            member_ids = [person_row.id for person_row in members_result.all()]
            availability: dict[int, list[AvailabilityWindow]] = {
                person_id: [] for person_id in member_ids
            }
            if not member_ids:
                return availability
            # noinspection PyTypeChecker
            windows_result = await session.exec(
                select(AvailabilityRow)
                .where(AvailabilityRow.person_id.in_(member_ids))
                .order_by(
                    AvailabilityRow.person_id,
                    AvailabilityRow.weekday,
                    AvailabilityRow.start_time,
                    AvailabilityRow.id,
                )
            )
            for row in windows_result.all():
                availability[row.person_id].append(AvailabilityWindow.model_validate(row))
            return availability

    # CARE PLANS
    async def create_care_plan(self, new_plan: CarePlanCreate) -> CarePlan:
        async with self.session_factory() as session, session.begin():
            if not await self._is_member(
                    session, new_plan.network_id, new_plan.author_person_id
            ):
                raise ConflictError(
                    f"person {new_plan.author_person_id} is not a member "
                    f"of network {new_plan.network_id}"
                )
            plan_row = CarePlansRow.model_validate(new_plan)
            session.add(plan_row)
            await session.flush()
            return CarePlan.model_validate(plan_row)

    async def get_care_plan(self, care_plan_id: int, viewer_id: int) -> CarePlan:
        async with self.session_factory() as session, session.begin():
            plan_row = await session.get(CarePlansRow, care_plan_id)
            if plan_row is None:
                raise NotFoundError(f"care plan {care_plan_id} does not exist")
            can_view = await self._can_view_restricted(session, plan_row.network_id, viewer_id)
            await self._require_member(session, plan_row.network_id, viewer_id)
            return await self._maybe_redact_care_plan(CarePlan.model_validate(plan_row), can_view)

    async def list_care_plans(self, network_id: int, viewer_id: int) -> list[CarePlan]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            can_view = await self._can_view_restricted(session, network_id, viewer_id)
            # noinspection PyTypeChecker
            result = await session.exec(
                select(CarePlansRow)
                .where(CarePlansRow.network_id == network_id)
                .order_by(CarePlansRow.id)
            )
            return [
                await self._maybe_redact_care_plan(CarePlan.model_validate(row), can_view)
                for row in result.all()
            ]

    # GAPS
    async def replace_open_gaps(self, network_id: int, new_gaps: list[GapCreate]) -> list[Gap]:
        async with self.session_factory() as session, session.begin():
            await self._get_network(session, network_id)
            # noinspection PyTypeChecker
            await session.exec(
                delete(GapsRow).where(
                    GapsRow.network_id == network_id,
                    GapsRow.status == GapStatus.open,
                )
            )
            gap_rows: list[GapsRow] = []
            for new_gap in new_gaps:
                gap_row = GapsRow.model_validate(
                    {**new_gap.model_dump(), "network_id": network_id}
                )
                session.add(gap_row)
                gap_rows.append(gap_row)
            await session.flush()
            return [Gap.model_validate(gap_row) for gap_row in gap_rows]

    async def list_gaps(
            self, network_id: int, viewer_id: int, status: GapStatus | None = GapStatus.open
    ) -> list[Gap]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            can_view = await self._can_view_restricted(session, network_id, viewer_id)
            statement = select(GapsRow).where(GapsRow.network_id == network_id)
            if status is not None:
                statement = statement.where(GapsRow.status == status)
            # noinspection PyTypeChecker
            statement = statement.order_by(
                case(
                    (GapsRow.severity == GapSeverity.high, 0),
                    (GapsRow.severity == GapSeverity.medium, 1),
                    else_=2,
                ),
                GapsRow.id,
            )
            result = await session.exec(statement)
            return [
                await self._maybe_redact_gap(session, Gap.model_validate(row), can_view)
                for row in result.all()
            ]

    async def resolve_gap(self, gap_id: int, resolved_by_person_id: int) -> Gap:
        async with self.session_factory() as session, session.begin():
            gap_row = await session.get(GapsRow, gap_id)
            if gap_row is None:
                raise NotFoundError(f"gap {gap_id} does not exist")
            if gap_row.status != GapStatus.resolved:
                gap_row.status = GapStatus.resolved
                gap_row.resolved_at = utc_now()
                gap_row.resolved_by_person_id = resolved_by_person_id
            return Gap.model_validate(gap_row)

    # CHECK-INS AND BURNOUT
    async def create_checkin(self, new_checkin: CheckinCreate) -> Checkin:
        async with self.session_factory() as session, session.begin():
            checkin_row = CheckinsRow.model_validate(new_checkin)
            session.add(checkin_row)
            await session.flush()
            return Checkin.model_validate(checkin_row)

    async def list_checkins(
            self, network_id: int, person_id: int, viewer_id: int, limit: int = 50
    ) -> list[Checkin]:
        async with self.session_factory() as session, session.begin():
            if viewer_id != SYSTEM_VIEWER_ID and viewer_id != person_id:
                raise AccessDeniedError(
                    f"person {viewer_id} cannot read check-ins for person {person_id}"
                )
            # noinspection PyTypeChecker
            result = await session.exec(
                select(CheckinsRow)
                .where(
                    CheckinsRow.network_id == network_id,
                    CheckinsRow.person_id == person_id,
                )
                .order_by(CheckinsRow.id.desc())
                .limit(limit)
            )
            return [Checkin.model_validate(row) for row in result.all()]

    async def record_burnout_score(self, new_score: BurnoutScoreCreate) -> BurnoutScore:
        async with self.session_factory() as session, session.begin():
            score_row = BurnoutScoresRow.model_validate(new_score)
            session.add(score_row)
            await session.flush()
            return BurnoutScore.model_validate(score_row)

    async def list_latest_burnout_scores(
            self, network_id: int, viewer_id: int
    ) -> list[BurnoutScore]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            newest_ids = (
                select(
                    BurnoutScoresRow.person_id,
                    func.max(BurnoutScoresRow.id).label("max_id"),
                )
                .where(BurnoutScoresRow.network_id == network_id)
                .group_by(BurnoutScoresRow.person_id)
                .subquery()
            )
            # noinspection PyTypeChecker
            result = await session.exec(
                select(BurnoutScoresRow)
                .join(newest_ids, BurnoutScoresRow.id == newest_ids.c.max_id)
                .order_by(BurnoutScoresRow.score.desc(), BurnoutScoresRow.id)
            )
            return [BurnoutScore.model_validate(row) for row in result.all()]

    async def get_burnout_history(
            self, network_id: int, person_id: int, viewer_id: int, limit: int = 30
    ) -> list[BurnoutScore]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            # noinspection PyTypeChecker
            result = await session.exec(
                select(BurnoutScoresRow)
                .where(
                    BurnoutScoresRow.network_id == network_id,
                    BurnoutScoresRow.person_id == person_id,
                )
                .order_by(BurnoutScoresRow.id.desc())
                .limit(limit)
            )
            rows = list(result.all())
            rows.reverse()
            return [BurnoutScore.model_validate(row) for row in rows]

    # ACCESS CONTROL
    async def grant_restricted_access(
            self, network_id: int, grantee_person_id: int, granted_by_person_id: int
    ) -> AccessGrant:
        async with self.session_factory() as session, session.begin():
            network = await self._get_network(session, network_id)
            if (
                    granted_by_person_id != SYSTEM_VIEWER_ID
                    and granted_by_person_id != network.patient_id
            ):
                raise AccessDeniedError(
                    f"person {granted_by_person_id} cannot grant restricted access"
                )
            if not await self._is_member(session, network_id, grantee_person_id):
                raise ConflictError(
                    f"person {grantee_person_id} is not a member of network {network_id}"
                )
            existing = await session.get(
                AccessGrantsRow, (network_id, grantee_person_id)
            )
            if existing is not None:
                return AccessGrant.model_validate(existing)
            grant_row = AccessGrantsRow(
                network_id=network_id,
                grantee_person_id=grantee_person_id,
                granted_by_person_id=granted_by_person_id,
            )
            session.add(grant_row)
            await session.flush()
            return AccessGrant.model_validate(grant_row)

    async def revoke_restricted_access(
            self, network_id: int, grantee_person_id: int, revoked_by_person_id: int
    ) -> None:
        async with self.session_factory() as session, session.begin():
            network = await self._get_network(session, network_id)
            if (
                    revoked_by_person_id != SYSTEM_VIEWER_ID
                    and revoked_by_person_id != network.patient_id
            ):
                raise AccessDeniedError(
                    f"person {revoked_by_person_id} cannot revoke restricted access"
                )
            existing = await session.get(AccessGrantsRow, (network_id, grantee_person_id))
            if existing is not None:
                await session.delete(existing)

    async def list_access_grants(self, network_id: int, viewer_id: int) -> list[AccessGrant]:
        async with self.session_factory() as session, session.begin():
            await self._require_member(session, network_id, viewer_id)
            # noinspection PyTypeChecker
            result = await session.exec(
                select(AccessGrantsRow)
                .where(AccessGrantsRow.network_id == network_id)
                .order_by(AccessGrantsRow.grantee_person_id)
            )
            return [AccessGrant.model_validate(row) for row in result.all()]

    async def can_view_restricted(self, network_id: int, viewer_id: int) -> bool:
        async with self.session_factory() as session, session.begin():
            return await self._can_view_restricted(session, network_id, viewer_id)
