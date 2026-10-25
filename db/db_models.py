from datetime import datetime

from sqlalchemy import UniqueConstraint, Column, JSON
from sqlmodel import Field as SQField, SQLModel, Relationship as SQRelationship

from db.db_contract import PersonCreate, CareNetworkCreate, RelationshipCreate, TaskAssignmentBase, TaskCreate, AvailabilityWindowCreate, \
    CarePlanCreate, GapCreate, GapStatus, CheckinCreate, BurnoutScoreCreate, AccessGrant
from misc.utils import utc_now

# --------------------------------------------------
# DB rows
# -------------------------------------------------

class PersonsRow(PersonCreate, table=True):
    __tablename__ = "people"
    id: int | None = SQField(default=None, primary_key=True)
    created_at: datetime = SQField(default_factory=utc_now)


class CareNetworksRow(CareNetworkCreate, table=True):
    __tablename__ = "care_networks"
    id: int | None = SQField(default=None, primary_key=True)
    patient_id: int = SQField(foreign_key="people.id", unique=True)
    created_at: datetime = SQField(default_factory=utc_now)


class NetworkMembersRow(SQLModel, table=True):
    __tablename__ = "network_members"
    network_id: int = SQField(foreign_key="care_networks.id", primary_key=True)
    person_id: int = SQField(foreign_key="people.id", primary_key=True)
    joined_at: datetime = SQField(default_factory=utc_now)


class RelationshipsRow(RelationshipCreate, table=True):
    __tablename__ = "relationships"
    id: int | None = SQField(default=None, primary_key=True)
    created_at: datetime = SQField(default_factory=utc_now)
    network_id: int = SQField(foreign_key="care_networks.id")
    source_person_id: int = SQField(foreign_key="people.id")
    target_person_id: int = SQField(foreign_key="people.id")


class AssignmentsRow(TaskAssignmentBase, table=True):
    __tablename__ = "task_assignments"
    __table_args__ = (UniqueConstraint("task_id", "person_id"),)
    id: int | None = SQField(default=None, primary_key=True)
    assigned_at: datetime = SQField(default_factory=utc_now)
    updated_at: datetime = SQField(default_factory=utc_now)


class TasksRow(TaskCreate, table=True):
    __tablename__ = "tasks"
    id: int | None = SQField(default=None, primary_key=True)
    created_at: datetime = SQField(default_factory=utc_now)
    assignments: list[AssignmentsRow] = SQRelationship()
    network_id: int = SQField(foreign_key="care_networks.id")
    created_by_person_id: int | None = SQField(None, foreign_key="people.id", nullable=True)


class AvailabilityRow(AvailabilityWindowCreate, table=True):
    __tablename__ = "availability"
    id: int | None = SQField(default=None, primary_key=True)
    person_id: int = SQField(foreign_key="people.id")


class CarePlansRow(CarePlanCreate, table=True):
    __tablename__ = "care_plans"
    id: int | None = SQField(default=None, primary_key=True)
    created_at: datetime = SQField(default_factory=utc_now)
    network_id: int = SQField(foreign_key="care_networks.id")
    author_person_id: int = SQField(foreign_key="people.id")


class GapsRow(GapCreate, table=True):
    __tablename__ = "gaps"
    id: int | None = SQField(default=None, primary_key=True)
    created_at: datetime = SQField(default_factory=utc_now)
    network_id: int = SQField(foreign_key="care_networks.id")
    task_id: int = SQField(foreign_key="tasks.id", nullable=True)
    suggested_assignee_id: int = SQField(foreign_key="people.id", nullable=True)
    related_care_plan_ids: list[int] = SQField(default_factory=list, sa_column=Column(JSON))
    status: GapStatus = SQField(GapStatus.open)
    resolved_at: datetime | None = SQField(None, nullable=True)
    resolved_by_person_id: int | None = SQField(None, nullable=True)


class CheckinsRow(CheckinCreate, table=True):
    __tablename__ = "checkins"
    id: int | None = SQField(default=None, primary_key=True)
    created_at: datetime = SQField(default_factory=utc_now)
    person_id: int = SQField(foreign_key="people.id")
    network_id: int = SQField(foreign_key="care_networks.id")


class BurnoutScoresRow(BurnoutScoreCreate, table=True):
    __tablename__ = "burnout_scores"
    id: int | None = SQField(default=None, primary_key=True)
    computed_at: datetime = SQField(default_factory=utc_now)
    person_id: int = SQField(foreign_key="people.id")
    network_id: int = SQField(foreign_key="care_networks.id")
    sentiment_average: float | None = SQField(default=None, nullable=True)


class AccessGrantsRow(AccessGrant, table=True):
    __tablename__ = "access_grants"
    network_id: int = SQField(foreign_key="care_networks.id", primary_key=True)
    grantee_person_id: int = SQField(foreign_key="people.id", primary_key=True)
    granted_by_person_id: int = SQField(foreign_key="people.id")
    granted_at: datetime = SQField(default_factory=utc_now)
