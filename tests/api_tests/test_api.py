"""
HTTP tests for the routes in api/routers, run against a real SQLiteDBManager on a temp file.

Run:  python -m pytest -q tests/api_tests
"""

from datetime import date, timedelta

import httpx
import pytest
import pytest_asyncio

from db.db_contract import (
    REDACTED_GAP_DESCRIPTION,
    REDACTED_TASK_TITLE,
    AvailabilityWindowCreate,
    CareNetworkCreate,
    CarePlanCreate,
    GapCreate,
    GapKind,
    GapSeverity,
    PersonCreate,
    PersonType,
    RelationshipCreate,
    BurnoutScoreCreate,
    Sensitivity,
    TaskCategory,
    TaskCreate,
)
from db.db_manager import SQLiteDBManager
from main import app
from misc.dependencies import get_database


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def database(tmp_path):
    test_database = SQLiteDBManager(str(tmp_path / "test.db"))
    await test_database.connect()
    await test_database.init_schema()
    yield test_database
    await test_database.close()


@pytest_asyncio.fixture
async def client(database):
    app.dependency_overrides[get_database] = lambda: database
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def seed(database):
    """Patient, spouse, physician, an outsider, and one network with a normal and a restricted task."""
    patient = await database.create_person(PersonCreate(
        person_type=PersonType.patient, subrole="patient", full_name="Pat Patient"))
    spouse = await database.create_person(PersonCreate(
        person_type=PersonType.family, subrole="spouse", full_name="Sam Spouse"))
    doctor = await database.create_person(PersonCreate(
        person_type=PersonType.professional, subrole="cardiologist",
        full_name="Dr. Heart", is_physician=True))
    outsider = await database.create_person(PersonCreate(
        person_type=PersonType.family, subrole="neighbor", full_name="Olly Outsider"))
    network = await database.create_care_network(CareNetworkCreate(
        patient_id=patient.id, network_name="Pat's network"))
    await database.add_network_member(network.id, spouse.id)
    await database.add_network_member(network.id, doctor.id)

    groceries = await database.create_task(TaskCreate(
        network_id=network.id, title="Buy groceries", category=TaskCategory.household,
        due_date=date(2026, 11, 1)))
    insulin = await database.create_task(TaskCreate(
        network_id=network.id, title="Insulin injection", category=TaskCategory.medication,
        sensitivity=Sensitivity.restricted, is_exclusive=True))
    await database.create_relationship(RelationshipCreate(
        network_id=network.id, source_person_id=doctor.id, target_person_id=patient.id,
        label="prescribes insulin", sensitivity=Sensitivity.restricted))
    await database.create_care_plan(CarePlanCreate(
        network_id=network.id, author_person_id=doctor.id, title="Diabetes plan",
        raw_text="Insulin twice a day", sensitivity=Sensitivity.restricted))
    gaps = await database.replace_open_gaps(network.id, [
        GapCreate(gap_kind=GapKind.unowned, severity=GapSeverity.high,
                  description="Nobody gives insulin", task_id=insulin.id),
        GapCreate(gap_kind=GapKind.unowned, severity=GapSeverity.low,
                  description="Nobody buys groceries", task_id=groceries.id),
    ])
    await database.replace_availability(spouse.id, [AvailabilityWindowCreate(
        weekday=0, start_time="09:00", end_time="12:00")])
    await database.record_burnout_score(BurnoutScoreCreate(
        person_id=spouse.id, network_id=network.id, score=40, task_share=0.5, missed_count=0))
    await database.record_burnout_score(BurnoutScoreCreate(
        person_id=spouse.id, network_id=network.id, score=60, task_share=0.7, missed_count=1))
    return {
        "patient": patient, "spouse": spouse, "doctor": doctor, "outsider": outsider,
        "network": network, "groceries": groceries, "insulin": insulin, "gaps": gaps,
    }


def as_viewer(person) -> dict[str, str]:
    return {"X-Viewer-Id": str(person.id)}


# ---------------------------------------------------------------------------
# Viewer header & error mapping
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_missing_viewer_header_is_422(client, seed):
    response = await client.get(f"/networks/{seed['network'].id}")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_system_viewer_id_is_rejected(client, seed):
    response = await client.get(f"/networks/{seed['network'].id}", headers={"X-Viewer-Id": "0"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_not_found_is_404_with_detail(client, seed):
    response = await client.get("/people/9999")
    assert response.status_code == 404
    assert "9999" in response.json()["detail"]


@pytest.mark.asyncio
async def test_non_member_is_403(client, seed):
    response = await client.get(
        f"/networks/{seed['network'].id}/tasks", headers=as_viewer(seed["outsider"]))
    assert response.status_code == 403
    assert response.json()["detail"]


@pytest.mark.asyncio
@pytest.mark.parametrize("origin, allowed", [
    ("http://localhost:5173", True),
    ("http://127.0.0.1:5173", True),
    ("https://demo.somenewsteps.space", True),
    ("http://demo.somenewsteps.space:5173", True),
    ("https://evil.example", False),
    ("https://demo.somenewsteps.space.evil.example", False),
])
async def test_cors_allows_frontend_origins_only(client, seed, origin, allowed):
    response = await client.options(
        f"/networks/{seed['network'].id}",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "X-Viewer-Id",
        },
    )
    assert (response.headers.get("access-control-allow-origin") == origin) is allowed


# ---------------------------------------------------------------------------
# People & networks
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_person_and_their_networks(client, seed):
    response = await client.get(f"/people/{seed['spouse'].id}")
    assert response.status_code == 200
    assert response.json()["full_name"] == "Sam Spouse"

    response = await client.get(f"/people/{seed['spouse'].id}/networks")
    assert [network["id"] for network in response.json()] == [seed["network"].id]


@pytest.mark.asyncio
async def test_network_people_and_graph(client, seed):
    network_id = seed["network"].id
    response = await client.get(f"/networks/{network_id}", headers=as_viewer(seed["spouse"]))
    assert response.json()["network_name"] == "Pat's network"

    response = await client.get(f"/networks/{network_id}/people", headers=as_viewer(seed["spouse"]))
    assert len(response.json()) == 3

    response = await client.get(f"/networks/{network_id}/graph", headers=as_viewer(seed["spouse"]))
    graph = response.json()
    assert len(graph["nodes"]) == 3
    assert graph["edges"][0]["is_redacted"] is True


@pytest.mark.asyncio
async def test_patient_profile(client, seed):
    path = f"/networks/{seed['network'].id}/patient-profile"
    response = await client.get(path, headers=as_viewer(seed["spouse"]))
    assert response.status_code == 200
    profile = response.json()
    assert profile["person_id"] == seed["patient"].id
    assert profile["age"] == 74
    assert profile["discharged_on"] == (date.today() - timedelta(days=4)).isoformat()

    assert (await client.get(path, headers=as_viewer(seed["outsider"]))).status_code == 403
    assert (await client.get("/networks/9999/patient-profile",
                             headers=as_viewer(seed["spouse"]))).status_code == 404


@pytest.mark.asyncio
async def test_availability_keyed_by_person(client, seed):
    response = await client.get(
        f"/networks/{seed['network'].id}/availability", headers=as_viewer(seed["patient"]))
    availability = response.json()
    assert set(availability) == {str(seed["patient"].id), str(seed["spouse"].id), str(seed["doctor"].id)}
    assert availability[str(seed["spouse"].id)][0]["start_time"] == "09:00:00"


@pytest.mark.asyncio
async def test_care_plans_redacted_for_family(client, seed):
    path = f"/networks/{seed['network'].id}/care-plans"
    assert (await client.get(path, headers=as_viewer(seed["spouse"]))).json()[0]["is_redacted"] is True
    assert (await client.get(path, headers=as_viewer(seed["doctor"]))).json()[0]["raw_text"]


# ---------------------------------------------------------------------------
# Tasks & assignments
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_tasks_redacts_restricted_for_family(client, seed):
    response = await client.get(
        f"/networks/{seed['network'].id}/tasks", headers=as_viewer(seed["spouse"]))
    titles = {task["id"]: task["title"] for task in response.json()}
    assert titles[seed["insulin"].id] == REDACTED_TASK_TITLE
    assert titles[seed["groceries"].id] == "Buy groceries"


@pytest.mark.asyncio
async def test_update_task_returns_viewer_view(client, seed):
    response = await client.patch(
        f"/tasks/{seed['insulin'].id}", json={"due_date": "2026-11-05"},
        headers=as_viewer(seed["spouse"]))
    assert response.status_code == 200
    assert response.json()["due_date"] == "2026-11-05"
    assert response.json()["title"] == REDACTED_TASK_TITLE


@pytest.mark.asyncio
async def test_task_writes_require_membership(client, seed):
    response = await client.patch(
        f"/tasks/{seed['groceries'].id}", json={"title": "hijacked"},
        headers=as_viewer(seed["outsider"]))
    assert response.status_code == 403
    response = await client.get(
        f"/networks/{seed['network'].id}/tasks", headers=as_viewer(seed["patient"]))
    assert "hijacked" not in {task["title"] for task in response.json()}


@pytest.mark.asyncio
async def test_assignment_lifecycle(client, seed):
    path = f"/tasks/{seed['groceries'].id}/assignments/{seed['spouse'].id}"
    headers = as_viewer(seed["spouse"])

    response = await client.put(path, headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "pending"

    response = await client.patch(path, json={"status": "missed"}, headers=headers)
    assert response.json()["status"] == "missed"

    response = await client.patch(path, json={"status": "bogus"}, headers=headers)
    assert response.status_code == 422

    response = await client.delete(path, headers=headers)
    assert response.status_code == 204

    response = await client.delete(path, headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_task_writes_work_without_viewer_header(client, seed):
    # The frontend does not send X-Viewer-Id on writes yet; these behave like the DBManager.
    response = await client.patch(f"/tasks/{seed['insulin'].id}", json={"due_date": "2026-11-05"})
    assert response.status_code == 200
    assert response.json()["title"] == "Insulin injection"

    path = f"/tasks/{seed['groceries'].id}/assignments/{seed['spouse'].id}"
    assert (await client.put(path)).status_code == 200
    assert (await client.patch(path, json={"status": "done"})).json()["status"] == "done"
    assert (await client.delete(path)).status_code == 204


@pytest.mark.asyncio
async def test_assigning_non_member_is_409(client, seed):
    response = await client.put(
        f"/tasks/{seed['groceries'].id}/assignments/{seed['outsider'].id}",
        headers=as_viewer(seed["patient"]))
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Gaps
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_gaps_status_filter(client, seed):
    path = f"/networks/{seed['network'].id}/gaps"
    headers = as_viewer(seed["spouse"])
    await client.post(
        f"/gaps/{seed['gaps'][1].id}/resolve",
        json={"resolved_by_person_id": seed["spouse"].id}, headers=headers)

    assert len((await client.get(path, headers=headers)).json()) == 2
    assert len((await client.get(path, params={"status": "open"}, headers=headers)).json()) == 1
    resolved = (await client.get(path, params={"status": "resolved"}, headers=headers)).json()
    assert [gap["id"] for gap in resolved] == [seed["gaps"][1].id]


@pytest.mark.asyncio
async def test_resolve_gap_hidden_from_outsiders(client, seed):
    gap_id = seed["gaps"][1].id
    response = await client.post(
        f"/gaps/{gap_id}/resolve",
        json={"resolved_by_person_id": seed["outsider"].id}, headers=as_viewer(seed["outsider"]))
    assert response.status_code == 404
    open_gaps = (await client.get(
        f"/networks/{seed['network'].id}/gaps", params={"status": "open"},
        headers=as_viewer(seed["patient"]))).json()
    assert gap_id in {gap["id"] for gap in open_gaps}


@pytest.mark.asyncio
async def test_resolve_gap_without_viewer(client, seed):
    response = await client.post(
        f"/gaps/{seed['gaps'][1].id}/resolve", json={"resolved_by_person_id": seed["spouse"].id})
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"


@pytest.mark.asyncio
async def test_detect_gaps_replaces_open_gaps_and_scores_burnout(client, seed, database):
    await database.create_care_plan(CarePlanCreate(
        network_id=seed["network"].id, author_person_id=seed["doctor"].id,
        title="Physio plan", raw_text="Walk daily"))
    plans = await database.list_care_plans(seed["network"].id, 0)
    await database.replace_open_gaps(seed["network"].id, [GapCreate(
        gap_kind=GapKind.plan_conflict, severity=GapSeverity.medium,
        description="Plans disagree", related_care_plan_ids=[plan.id for plan in plans])])
    headers = as_viewer(seed["patient"])
    await client.put(f"/tasks/{seed['groceries'].id}/assignments/{seed['spouse'].id}", headers=headers)

    response = await client.post(f"/networks/{seed['network'].id}/gaps/detect", headers=headers)
    assert response.status_code == 204

    gaps = (await client.get(
        f"/networks/{seed['network'].id}/gaps", params={"status": "open"}, headers=headers)).json()
    # Insulin is still unowned, groceries now has an owner, and the AI conflict survives.
    assert sorted((gap["gap_kind"], gap["task_id"]) for gap in gaps) == [
        ("plan_conflict", None), ("unowned", seed["insulin"].id)]
    insulin_gap = next(gap for gap in gaps if gap["gap_kind"] == "unowned")
    assert insulin_gap["suggested_assignee_id"] in {seed["spouse"].id, seed["doctor"].id}

    latest = (await client.get(
        f"/networks/{seed['network'].id}/burnout/latest", headers=headers)).json()
    assert [(score["person_id"], score["task_share"]) for score in latest] == [(seed["spouse"].id, 1.0)]
    history = (await client.get(
        f"/networks/{seed['network'].id}/people/{seed['spouse'].id}/burnout", headers=headers)).json()
    assert len(history) == 3  # appended to the two seeded scores


@pytest.mark.asyncio
async def test_detect_gaps_checks_viewer_and_network(client, seed):
    response = await client.post(
        f"/networks/{seed['network'].id}/gaps/detect", headers=as_viewer(seed["outsider"]))
    assert response.status_code == 403
    assert (await client.post("/networks/9999/gaps/detect")).status_code == 404
    assert (await client.post(f"/networks/{seed['network'].id}/gaps/detect")).status_code == 204


@pytest.mark.asyncio
async def test_resolve_gap_redacts_response(client, seed):
    response = await client.post(
        f"/gaps/{seed['gaps'][0].id}/resolve",
        json={"resolved_by_person_id": seed["spouse"].id}, headers=as_viewer(seed["spouse"]))
    assert response.status_code == 200
    gap = response.json()
    assert gap["status"] == "resolved"
    assert gap["resolved_by_person_id"] == seed["spouse"].id
    assert gap["description"] == REDACTED_GAP_DESCRIPTION


# ---------------------------------------------------------------------------
# Check-ins & burnout
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_checkins_are_private(client, seed):
    network_id, spouse = seed["network"].id, seed["spouse"]
    body = {"person_id": spouse.id, "network_id": network_id,
            "message": "Tired today", "sentiment_score": -0.4}

    response = await client.post("/checkins", json=body, headers=as_viewer(spouse))
    assert response.status_code == 201

    response = await client.post("/checkins", json=body, headers=as_viewer(seed["patient"]))
    assert response.status_code == 403

    response = await client.post("/checkins", json=body)
    assert response.status_code == 201

    path = f"/networks/{network_id}/people/{spouse.id}/checkins"
    assert len((await client.get(path, headers=as_viewer(spouse))).json()) == 2
    assert (await client.get(path, headers=as_viewer(seed["patient"]))).status_code == 403


@pytest.mark.asyncio
async def test_checkin_sentiment_out_of_range_is_422(client, seed):
    response = await client.post("/checkins", json={
        "person_id": seed["spouse"].id, "network_id": seed["network"].id,
        "message": "x", "sentiment_score": 3}, headers=as_viewer(seed["spouse"]))
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_burnout_latest_and_history(client, seed):
    network_id, spouse = seed["network"].id, seed["spouse"]
    latest = (await client.get(
        f"/networks/{network_id}/burnout/latest", headers=as_viewer(spouse))).json()
    assert [score["score"] for score in latest] == [60]

    path = f"/networks/{network_id}/people/{spouse.id}/burnout"
    history = (await client.get(path, headers=as_viewer(spouse))).json()
    assert [score["score"] for score in history] == [40, 60]
    limited = (await client.get(path, params={"limit": 1}, headers=as_viewer(spouse))).json()
    assert [score["score"] for score in limited] == [60]


# ---------------------------------------------------------------------------
# Demo reset
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_demo_reset_reseeds_with_frontend_ids(client, seed):
    assert (await client.post("/demo/reset")).status_code == 204
    # Twice in a row must work too: the second run must not hit "patient already has a network".
    assert (await client.post("/demo/reset")).status_code == 204

    # The frontend's role switcher hardcodes these ids.
    for person_id, name in [(1, "Walter Lindqvist"), (2, "Margaret Lindqvist"),
                            (6, "Dr. Amara Okafor"), (9, "Marcus Bell, PharmD")]:
        assert (await client.get(f"/people/{person_id}")).json()["full_name"] == name

    networks = (await client.get("/people/1/networks")).json()
    assert [network["network_name"] for network in networks] == ["Walter's Care Constellation"]
    network_id = networks[0]["id"]
    walter = {"X-Viewer-Id": "1"}

    gaps = (await client.get(
        f"/networks/{network_id}/gaps", params={"status": "open"}, headers=walter)).json()
    assert sorted(gap["gap_kind"] for gap in gaps) == [
        "missed", "plan_conflict", "redundant", "unowned", "unowned", "unowned"]

    latest = (await client.get(f"/networks/{network_id}/burnout/latest", headers=walter)).json()
    assert latest[0]["person_id"] == 2  # Margaret carries most of the family load

    profile = (await client.get(f"/networks/{network_id}/patient-profile", headers=walter)).json()
    assert profile["person_id"] == 1


# ---------------------------------------------------------------------------
# Access grants
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_grant_flow(client, seed):
    network_id, spouse, patient = seed["network"].id, seed["spouse"], seed["patient"]
    can_view_path = f"/networks/{network_id}/can-view-restricted"
    grant_path = f"/networks/{network_id}/grants/{spouse.id}"

    assert (await client.get(can_view_path, headers=as_viewer(spouse))).json() is False

    assert (await client.put(grant_path, headers=as_viewer(spouse))).status_code == 403
    response = await client.put(grant_path, headers=as_viewer(patient))
    assert response.status_code == 200
    assert response.json()["granted_by_person_id"] == patient.id

    assert (await client.get(can_view_path, headers=as_viewer(spouse))).json() is True
    grants = (await client.get(f"/networks/{network_id}/grants", headers=as_viewer(spouse))).json()
    assert [grant["grantee_person_id"] for grant in grants] == [spouse.id]

    assert (await client.delete(grant_path, headers=as_viewer(patient))).status_code == 204
    assert (await client.get(can_view_path, headers=as_viewer(spouse))).json() is False
