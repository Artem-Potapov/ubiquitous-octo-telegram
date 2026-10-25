"""
Schema smoke tests for the SQLModel row classes in db_contract.py.

Run:  pytest -q test_db_rows.py
Uses a sync in-memory SQLite engine: these tests check the tables, columns and
row <-> contract-model conversion, not the async DBManager methods.
"""

from datetime import date, time

import pytest
from sqlalchemy import event, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import Session, SQLModel, create_engine, select

import db.db_contract as contract
import db.db_models


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def engine():
    test_engine = create_engine("sqlite://")

    @event.listens_for(test_engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def session(engine):
    with Session(engine) as test_session:
        yield test_session


@pytest.fixture
def network(session):
    """A patient, a spouse, and a care network containing both."""
    patient = db.db_models.PersonsRow(person_type="patient", subrole="patient", full_name="Pat Patient")
    spouse = db.db_models.PersonsRow(person_type="family", subrole="spouse", full_name="Sam Spouse")
    session.add_all([patient, spouse])
    session.commit()

    care_network = db.db_models.CareNetworksRow(patient_id=patient.id, network_name="Pat's network")
    session.add(care_network)
    session.commit()

    session.add_all([
        db.db_models.NetworkMembersRow(network_id=care_network.id, person_id=patient.id),
        db.db_models.NetworkMembersRow(network_id=care_network.id, person_id=spouse.id),
    ])
    session.commit()
    return {"patient": patient, "spouse": spouse, "network": care_network}


def save(session, row):
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Schema shape
# ---------------------------------------------------------------------------

EXPECTED_TABLES = {
    "people", "care_networks", "network_members", "relationships", "tasks",
    "task_assignments", "availability", "care_plans", "gaps", "checkins",
    "burnout_scores", "access_grants",
}

EXPECTED_FOREIGN_KEYS = {
    "people": {},
    "care_networks": {"patient_id": "people.id"},
    "network_members": {"network_id": "care_networks.id", "person_id": "people.id"},
    "relationships": {
        "network_id": "care_networks.id",
        "source_person_id": "people.id",
        "target_person_id": "people.id",
    },
    "tasks": {"network_id": "care_networks.id", "created_by_person_id": "people.id"},
    "task_assignments": {"task_id": "tasks.id", "person_id": "people.id"},
    "availability": {"person_id": "people.id"},
    "care_plans": {"network_id": "care_networks.id", "author_person_id": "people.id"},
    "gaps": {
        "network_id": "care_networks.id",
        "task_id": "tasks.id",
        "suggested_assignee_id": "people.id",
    },
    "checkins": {"person_id": "people.id", "network_id": "care_networks.id"},
    "burnout_scores": {"person_id": "people.id", "network_id": "care_networks.id"},
    "access_grants": {
        "network_id": "care_networks.id",
        "grantee_person_id": "people.id",
        "granted_by_person_id": "people.id",
    },
}


def test_all_tables_created(engine):
    assert set(inspect(engine).get_table_names()) == EXPECTED_TABLES


@pytest.mark.parametrize("table_name", sorted(EXPECTED_FOREIGN_KEYS))
def test_foreign_keys(engine, table_name):
    actual = {
        foreign_key["constrained_columns"][0]:
            f'{foreign_key["referred_table"]}.{foreign_key["referred_columns"][0]}'
        for foreign_key in inspect(engine).get_foreign_keys(table_name)
    }
    assert actual == EXPECTED_FOREIGN_KEYS[table_name]


def test_nullable_columns(engine):
    expected_nullable = {
        ("tasks", "created_by_person_id"), ("tasks", "due_date"), ("tasks", "required_role"),
        ("gaps", "task_id"), ("gaps", "suggested_assignee_id"),
        ("gaps", "resolved_at"), ("gaps", "resolved_by_person_id"),
        ("burnout_scores", "sentiment_average"), ("people", "phone_number"),
    }
    inspector = inspect(engine)
    for table_name, column_name in expected_nullable:
        columns = {column["name"]: column for column in inspector.get_columns(table_name)}
        assert columns[column_name]["nullable"], f"{table_name}.{column_name} should be nullable"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

def test_foreign_keys_are_enforced(session, network):
    session.add(db.db_models.AssignmentsRow(task_id=999, person_id=network["patient"].id))
    with pytest.raises(IntegrityError):
        session.commit()


def test_assignment_unique_per_task_and_person(session, network):
    task = save(session, db.db_models.TasksRow(network_id=network["network"].id, title="Refill", category="medication"))
    save(session, db.db_models.AssignmentsRow(task_id=task.id, person_id=network["spouse"].id))
    session.add(db.db_models.AssignmentsRow(task_id=task.id, person_id=network["spouse"].id))
    with pytest.raises(IntegrityError):
        session.commit()


def test_one_network_per_patient(session, network):
    session.add(db.db_models.CareNetworksRow(patient_id=network["patient"].id, network_name="Duplicate"))
    with pytest.raises(IntegrityError):
        session.commit()


def test_network_member_composite_key(session, network):
    session.add(db.db_models.NetworkMembersRow(network_id=network["network"].id, person_id=network["spouse"].id))
    with pytest.raises(IntegrityError):
        session.commit()


def test_access_grant_composite_key(session, network):
    grant_values = dict(
        network_id=network["network"].id,
        grantee_person_id=network["spouse"].id,
        granted_by_person_id=network["patient"].id,
    )
    save(session, db.db_models.AccessGrantsRow(**grant_values))
    session.add(db.db_models.AccessGrantsRow(**grant_values))
    with pytest.raises(IntegrityError):
        session.commit()


# ---------------------------------------------------------------------------
# Row -> contract model round trips
# ---------------------------------------------------------------------------

def test_person_round_trip(session, network):
    person = contract.Person.model_validate(network["patient"])
    assert person.id == network["patient"].id
    assert person.person_type == contract.PersonType.patient
    assert person.is_physician is False


def test_care_network_round_trip(network):
    care_network = contract.CareNetwork.model_validate(network["network"])
    assert care_network.patient_id == network["patient"].id


def test_relationship_round_trip(session, network):
    row = save(session, db.db_models.RelationshipsRow(
        network_id=network["network"].id,
        source_person_id=network["spouse"].id,
        target_person_id=network["patient"].id,
        label="drives to appointments",
    ))
    relationship = contract.Relationship.model_validate(row)
    assert relationship.sensitivity == contract.Sensitivity.normal
    assert relationship.is_redacted is False


def test_task_with_assignments_round_trip(session, network):
    task = save(session, db.db_models.TasksRow(
        network_id=network["network"].id,
        title="Insulin refill",
        category="medication",
        frequency="monthly",
        due_date=date(2026, 11, 1),
        is_exclusive=True,
    ))
    save(session, db.db_models.AssignmentsRow(task_id=task.id, person_id=network["patient"].id))
    save(session, db.db_models.AssignmentsRow(task_id=task.id, person_id=network["spouse"].id))

    session.expunge_all()
    loaded = session.exec(
        select(db.db_models.TasksRow).options(selectinload(db.db_models.TasksRow.assignments))
    ).one()
    converted = contract.Task.model_validate(loaded)

    assert converted.created_by_person_id is None
    assert converted.due_date == date(2026, 11, 1)
    assert len(converted.assignments) == 2
    assert all(isinstance(item, contract.TaskAssignment) for item in converted.assignments)
    assert all(item.status == contract.AssignmentStatus.pending for item in converted.assignments)


def test_availability_round_trip(session, network):
    row = save(session, db.db_models.AvailabilityRow(
        person_id=network["spouse"].id, weekday=2, start_time=time(9, 0), end_time=time(17, 30),
    ))
    window = contract.AvailabilityWindow.model_validate(row)
    assert (window.start_time, window.end_time) == (time(9, 0), time(17, 30))


def test_care_plan_round_trip(session, network):
    author = save(session, db.db_models.PersonsRow(
        person_type="professional", subrole="cardiologist", full_name="Dr. Heart", is_physician=True,
    ))
    row = save(session, db.db_models.CarePlansRow(
        network_id=network["network"].id,
        author_person_id=author.id,
        title="Cardiology plan",
        raw_text="Low sodium diet. Take metoprolol 25mg twice daily.",
        sensitivity="restricted",
    ))
    care_plan = contract.CarePlan.model_validate(row)
    assert care_plan.sensitivity == contract.Sensitivity.restricted


def test_gap_round_trip_with_care_plan_ids(session, network):
    row = save(session, db.db_models.GapsRow(
        network_id=network["network"].id,
        gap_kind="plan_conflict",
        severity="high",
        description="Diet conflict between plans",
        related_care_plan_ids=[3, 7],
    ))
    session.expunge_all()
    loaded = session.get(db.db_models.GapsRow, row.id)
    gap = contract.Gap.model_validate(loaded)
    assert gap.related_care_plan_ids == [3, 7]
    assert gap.status == contract.GapStatus.open
    assert gap.task_id is None and gap.resolved_at is None


def test_gap_care_plan_ids_default_empty(session, network):
    row = save(session, db.db_models.GapsRow(
        network_id=network["network"].id, gap_kind="unowned", severity="low", description="No owner",
    ))
    assert contract.Gap.model_validate(row).related_care_plan_ids == []


def test_checkin_round_trip(session, network):
    row = save(session, db.db_models.CheckinsRow(
        person_id=network["spouse"].id, network_id=network["network"].id,
        message="Exhausted this week", sentiment_score=-0.6,
    ))
    assert contract.Checkin.model_validate(row).sentiment_score == pytest.approx(-0.6)


def test_burnout_score_round_trip(session, network):
    row = save(session, db.db_models.BurnoutScoresRow(
        person_id=network["spouse"].id, network_id=network["network"].id,
        score=78, task_share=0.65, missed_count=2,
    ))
    burnout_score = contract.BurnoutScore.model_validate(row)
    assert burnout_score.score == 78
    assert burnout_score.sentiment_average is None


def test_access_grant_round_trip(session, network):
    row = save(session, db.db_models.AccessGrantsRow(
        network_id=network["network"].id,
        grantee_person_id=network["spouse"].id,
        granted_by_person_id=network["patient"].id,
    ))
    grant = contract.AccessGrant.model_validate(row)
    assert grant.granted_at is not None


# ---------------------------------------------------------------------------
# Contract promises
# ---------------------------------------------------------------------------

def test_datetimes_come_back_timezone_aware(engine, network):
    """The contract promises tz-aware UTC. Recent SQLModel maps datetime to its
    UTCDateTime type, which re-attaches UTC on load; this guards against a downgrade."""
    person_id = network["patient"].id
    with Session(engine) as fresh_session:
        reloaded = fresh_session.get(db.db_models.PersonsRow, person_id)
        assert reloaded.created_at.tzinfo is not None