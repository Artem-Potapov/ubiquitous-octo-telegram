"""
Unit tests for the pure rule functions in engine/ (no database).

Run:  python -m pytest -q tests/engine_tests
"""

from datetime import date, datetime, time, timedelta

from db.db_contract import (
    AssignmentStatus,
    AvailabilityWindow,
    GapKind,
    GapSeverity,
    Person,
    PersonType,
    Task,
    TaskAssignment,
    TaskCategory,
    TaskFrequency,
)
from engine.gap_engine import detect_gaps, relative_due_label
from engine.suggestions import rank_candidates
from engine.workload import compute_burnout_scores, compute_weekly_loads

TODAY = date(2026, 10, 26)  # a Monday
CREATED = datetime(2026, 10, 1)


def person(person_id, person_type=PersonType.family, subrole="daughter", name=None, physician=False):
    return Person(id=person_id, person_type=person_type, subrole=subrole,
                  full_name=name or f"Person{person_id} Last", is_physician=physician,
                  created_at=CREATED)


def task(task_id, owners=(), statuses=None, **fields):
    statuses = statuses or {}
    assignments = [
        TaskAssignment(id=task_id * 100 + owner, task_id=task_id, person_id=owner,
                       status=statuses.get(owner, AssignmentStatus.pending),
                       assigned_at=CREATED, updated_at=CREATED)
        for owner in owners
    ]
    fields.setdefault("title", f"Task {task_id}")
    fields.setdefault("category", TaskCategory.household)
    return Task(id=task_id, network_id=1, created_at=CREATED, assignments=assignments, **fields)


def window(person_id, weekday):
    return AvailabilityWindow(id=person_id * 10 + weekday, person_id=person_id, weekday=weekday,
                              start_time=time(9), end_time=time(12))


PATIENT = person(1, PersonType.patient, "patient", "Pat Patient")
DAUGHTER = person(2, name="Dana Daughter")
SON = person(3, subrole="son", name="Sid Son")
DOCTOR = person(4, PersonType.professional, "cardiologist", "Hana Heart", physician=True)
PEOPLE = [PATIENT, DAUGHTER, SON, DOCTOR]


# ---------------------------------------------------------------------------
# Workload
# ---------------------------------------------------------------------------

def test_weekly_load_weights_and_splits_shared_tasks():
    tasks = [
        task(1, owners=[2], frequency=TaskFrequency.daily),                        # 7
        task(2, owners=[2, 3], frequency=TaskFrequency.weekly),                    # 0.5 each
        task(3, owners=[2, 3], frequency=TaskFrequency.monthly, is_exclusive=True),  # 0.25 each
        task(4, owners=[3], statuses={3: AssignmentStatus.done}),                  # done: no load
    ]
    loads = compute_weekly_loads(tasks, PEOPLE)
    assert loads[2].load == 7.75
    assert loads[3].load == 0.75


def test_burnout_formula():
    tasks = [
        task(1, owners=[2], frequency=TaskFrequency.weekly),
        task(2, owners=[2], frequency=TaskFrequency.weekly, statuses={2: AssignmentStatus.missed}),
        task(3, owners=[3], frequency=TaskFrequency.weekly),
    ]
    scores = compute_burnout_scores(1, tasks, PEOPLE, {2: -0.5, 3: 0.4})
    by_person = {score.person_id: score for score in scores}
    assert set(by_person) == {2, 3}  # family only
    # Only done assignments drop out of the load; missed ones still count (as in workload.ts).
    assert by_person[2].task_share == 0.667
    assert by_person[2].score == 63  # 2/3 * 65 + 10 missed + 0.5 * 20 wellbeing = 63.3
    assert by_person[3].score == 22  # 1/3 * 65 = 21.7, positive sentiment adds nothing
    assert [score.person_id for score in scores] == [2, 3]


def test_burnout_rounds_halves_up():
    tasks = [task(1, owners=[2], frequency=TaskFrequency.weekly),
             task(2, owners=[3], frequency=TaskFrequency.weekly)]
    by_person = {s.person_id: s for s in compute_burnout_scores(1, tasks, PEOPLE, {})}
    assert by_person[2].score == 33  # 32.5 -> 33 like Math.round, not 32 like round()


def test_missed_points_are_capped():
    tasks = [task(i, owners=[2], statuses={2: AssignmentStatus.missed}) for i in range(1, 4)]
    (score,) = [s for s in compute_burnout_scores(1, tasks, PEOPLE, {}) if s.person_id == 2]
    assert score.missed_count == 3
    assert score.score == 80  # 65 for the whole share + 15 cap, not 30


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

def test_ranking_excludes_patient_and_wrong_role():
    clinical = task(1, required_role="cardiologist")
    assert rank_candidates(clinical, PEOPLE, [clinical], {}, TODAY) == [DOCTOR]

    family_only = task(2, required_role="family")
    assert {p.id for p in rank_candidates(family_only, PEOPLE, [family_only], {}, TODAY)} == {2, 3}


def test_ranking_prefers_availability_on_due_weekday_and_light_load():
    target = task(1, due_date=TODAY + timedelta(days=2))  # Wednesday
    busy = task(2, owners=[3], frequency=TaskFrequency.daily)
    availability = {2: [window(2, 0)], 3: [window(3, 2)]}
    # Son is free on Wednesday (+40) but carries all the load (+0); daughter: +0 and +40. Tie -> lower id.
    ranked = rank_candidates(target, [DAUGHTER, SON], [target, busy], availability, TODAY)
    assert [p.id for p in ranked] == [2, 3]
    # Without the busy task the son wins on availability.
    ranked = rank_candidates(target, [DAUGHTER, SON], [target], availability, TODAY)
    assert [p.id for p in ranked] == [3, 2]


# ---------------------------------------------------------------------------
# Gap detection
# ---------------------------------------------------------------------------

def test_unowned_severity_by_due_date():
    tasks = [
        task(1, due_date=TODAY - timedelta(days=1)),
        task(2, due_date=TODAY + timedelta(days=2)),
        task(3, due_date=TODAY + timedelta(days=5)),
        task(4, due_date=TODAY + timedelta(days=30)),
        task(5),
    ]
    gaps = detect_gaps(tasks, PEOPLE, {}, TODAY)
    assert [g.gap_kind for g in gaps] == [GapKind.unowned] * 5
    assert [g.severity for g in gaps] == [
        GapSeverity.high, GapSeverity.high, GapSeverity.medium, GapSeverity.low, GapSeverity.low,
    ]
    assert all(g.suggested_assignee_id in {2, 3} for g in gaps)


def test_redundant_only_for_exclusive_tasks_and_keeps_lightest_owner():
    tasks = [
        task(1, owners=[2, 3], is_exclusive=True, title="Pick up meds"),
        task(2, owners=[2, 3]),  # shared backup coverage: not a gap
        task(3, owners=[2], frequency=TaskFrequency.daily),
    ]
    gaps = detect_gaps(tasks, PEOPLE, {}, TODAY)
    assert [(g.gap_kind, g.task_id) for g in gaps] == [(GapKind.redundant, 1)]
    assert gaps[0].suggested_assignee_id == 3
    assert "Dana and Sid are all assigned" in gaps[0].description


def test_missed_gap_suggests_someone_else():
    tasks = [task(1, owners=[2], statuses={2: AssignmentStatus.missed}, title="Refill")]
    gaps = detect_gaps(tasks, PEOPLE, {}, TODAY)
    assert [(g.gap_kind, g.severity) for g in gaps] == [(GapKind.missed, GapSeverity.high)]
    assert gaps[0].suggested_assignee_id == 3
    assert gaps[0].description.startswith('Dana was responsible for "Refill" (no due date)')


def test_physician_names_and_due_labels():
    tasks = [task(1, owners=[4], statuses={4: AssignmentStatus.missed})]
    assert detect_gaps(tasks, PEOPLE, {}, TODAY)[0].description.startswith("Dr. Heart")
    assert relative_due_label(TODAY + timedelta(days=3), TODAY) == "Due Thursday"
    assert relative_due_label(date(2026, 11, 15), TODAY) == "Due Nov 15"
    assert relative_due_label(TODAY - timedelta(days=3), TODAY) == "3 days overdue"
