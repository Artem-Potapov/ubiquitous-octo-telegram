from __future__ import annotations

from sqlalchemy import event, Select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from db.db_contract import PersonCreate, Person, DBManager, PersonUpdate, SYSTEM_VIEWER_ID, CareNetwork, CareNetworkCreate, TaskAssignment, Task, \
    TaskUpdate, TaskCreate, NetworkGraph, RelationshipCreate, Relationship, AccessGrant, BurnoutScore, BurnoutScoreCreate, Checkin, CheckinCreate, \
    Gap, GapStatus, GapCreate, CarePlan, CarePlanCreate, AvailabilityWindow, AvailabilityWindowCreate, AssignmentStatus
from db.db_models import PersonsRow, CareNetworksRow  # importing tables registers them in SQLModel.metadata
from db.exceptions import NotFoundError, AccessDeniedError


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
        raise NotImplementedError

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
                raise NotFoundError(f"persoon {person_id} does not exist")
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
            network_row = await session.get(CareNetworksRow, network_id)
            if network_row is None:
                raise NotFoundError(f"care network {network_id} does not exist")
            member_ids = {member.id for member in network_row.members}
            if viewer_id != SYSTEM_VIEWER_ID and viewer_id not in member_ids:
                raise AccessDeniedError(f"person {viewer_id} is not in network {network_id}")
            return [Person.model_validate(member) for member in network_row.members]
        
    # CARE NETZWERKS 
    
    async def create_care_network(self, new_network: CareNetworkCreate) -> CareNetwork:
        raise NotImplementedError

    async def get_care_network(self, network_id: int, viewer_id: int) -> CareNetwork:
        raise NotImplementedError

    async def list_networks_for_person(self, person_id: int) -> list[CareNetwork]:
        raise NotImplementedError

    async def add_network_member(self, network_id: int, person_id: int) -> None:
        raise NotImplementedError

    async def remove_network_member(self, network_id: int, person_id: int) -> None:
        raise NotImplementedError
    
    # GRAPH
    async def create_relationship(self, new_relationship: RelationshipCreate) -> Relationship:
        raise NotImplementedError

    async def delete_relationship(self, relationship_id: int) -> None:
        raise NotImplementedError

    async def get_network_graph(self, network_id: int, viewer_id: int) -> NetworkGraph:
        raise NotImplementedError

    # TASKS
    async def create_task(self, new_task: TaskCreate) -> Task:
        raise NotImplementedError

    async def get_task(self, task_id: int, viewer_id: int) -> Task:
        raise NotImplementedError

    async def update_task(self, task_id: int, changes: TaskUpdate) -> Task:
        raise NotImplementedError

    async def delete_task(self, task_id: int) -> None:
        raise NotImplementedError

    async def list_tasks(self, network_id: int, viewer_id: int) -> list[Task]:
        raise NotImplementedError

    async def list_tasks_for_person(self, network_id: int, person_id: int, viewer_id: int) -> list[Task]:
        raise NotImplementedError
    
    # ASSIGNMENTS
    async def assign_task(self, task_id: int, person_id: int) -> TaskAssignment:
        raise NotImplementedError

    async def unassign_task(self, task_id: int, person_id: int) -> None:
        raise NotImplementedError
    
    async def set_assignment_status(self, task_id: int, person_id: int, status: AssignmentStatus) -> TaskAssignment:
        raise NotImplementedError

    # AVAILABILITY 
    async def replace_availability(self, person_id: int, windows: list[AvailabilityWindowCreate]) -> list[AvailabilityWindow]:
        raise NotImplementedError

    async def get_availability(self, person_id: int) -> list[AvailabilityWindow]:
        raise NotImplementedError

    async def list_availability_in_network(self, network_id: int, viewer_id: int) -> dict[int, list[AvailabilityWindow]]:
        raise NotImplementedError

    # CARE PLANS
    async def create_care_plan(self, new_plan: CarePlanCreate) -> CarePlan:
        raise NotImplementedError

    async def get_care_plan(self, care_plan_id: int, viewer_id: int) -> CarePlan:
        raise NotImplementedError

    async def list_care_plans(self, network_id: int, viewer_id: int) -> list[CarePlan]:
        raise NotImplementedError

    # GAPS
    async def replace_open_gaps(self, network_id: int, new_gaps: list[GapCreate]) -> list[Gap]:
        raise NotImplementedError

    async def list_gaps(self, network_id: int, viewer_id: int, status: GapStatus | None = GapStatus.open) -> list[Gap]:
        raise NotImplementedError

    async def resolve_gap(self, gap_id: int, resolved_by_person_id: int) -> Gap:
        raise NotImplementedError

    # CHECK-INS AND BURNOUT
    async def create_checkin(self, new_checkin: CheckinCreate) -> Checkin:
        raise NotImplementedError

    async def list_checkins(self, network_id: int, person_id: int, viewer_id: int, limit: int = 50) -> list[Checkin]:
        raise NotImplementedError

    async def record_burnout_score(self, new_score: BurnoutScoreCreate) -> BurnoutScore:
        raise NotImplementedError

    async def list_latest_burnout_scores(self, network_id: int, viewer_id: int) -> list[BurnoutScore]:
        raise NotImplementedError

    async def get_burnout_history(self, network_id: int, person_id: int, viewer_id: int, limit: int = 30) -> list[BurnoutScore]:
        raise NotImplementedError


    # ACCESS CONTROL
    async def grant_restricted_access(self, network_id: int, grantee_person_id: int, granted_by_person_id: int) -> AccessGrant:
        raise NotImplementedError

    async def revoke_restricted_access(self, network_id: int, grantee_person_id: int, revoked_by_person_id: int) -> None:
        raise NotImplementedError

    async def list_access_grants(self, network_id: int, viewer_id: int) -> list[AccessGrant]:
        raise NotImplementedError

    async def can_view_restricted(self, network_id: int, viewer_id: int) -> bool:
        raise NotImplementedError