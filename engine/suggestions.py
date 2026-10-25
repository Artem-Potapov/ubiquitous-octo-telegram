"""
Deterministic "who could take this?" ranking (port of src/domain/suggestions.ts).

Safety rule: a person who does not match a task's required_role is never
suggested, so clinical tasks can't land on family members by accident.
The UI builds its own human-readable reasons; only the ordering matters here.
"""
from __future__ import annotations

from datetime import date

from db.db_contract import AvailabilityWindow, Person, PersonType, Task
from engine.workload import compute_weekly_loads, js_round

AVAILABILITY_POINTS = 40
LIGHT_LOAD_POINTS = 40
EXACT_ROLE_POINTS = 20
PER_MISSED_POINTS = 10


def matches_required_role(person: Person, required_role: str | None) -> bool:
    """Contract rule: required_role is matched against subrole or person_type."""
    if not required_role:
        return True
    role = required_role.lower()
    return person.subrole.lower() == role or person.person_type.value == role


def is_eligible(person: Person, task: Task) -> bool:
    if person.person_type == PersonType.patient:
        return False
    if any(assignment.person_id == person.id for assignment in task.assignments):
        return False
    return matches_required_role(person, task.required_role)


def availability_coverage(task: Task, windows: list[AvailabilityWindow], today: date) -> float:
    """1/0 for an upcoming due date's weekday, otherwise the share of the week covered."""
    if task.due_date is not None and task.due_date >= today:
        return 1.0 if any(window.weekday == task.due_date.weekday() for window in windows) else 0.0
    return len({window.weekday for window in windows}) / 7


def rank_candidates(
        task: Task,
        people: list[Person],
        tasks: list[Task],
        availability: dict[int, list[AvailabilityWindow]],
        today: date,
) -> list[Person]:
    """Eligible people for `task`, best first (ties broken by id)."""
    loads = compute_weekly_loads(tasks, people)
    eligible = [person for person in people if is_eligible(person, task)]
    if not eligible:
        return []
    max_load = max(1.0, *(loads[person.id].load for person in eligible))

    def score(person: Person) -> int:
        entry = loads[person.id]
        exact = bool(task.required_role) and person.subrole.lower() == task.required_role.lower()
        return js_round(
            AVAILABILITY_POINTS * availability_coverage(task, availability.get(person.id, []), today)
            + LIGHT_LOAD_POINTS * (1 - entry.load / max_load)
            + (EXACT_ROLE_POINTS if exact else 0)
            - PER_MISSED_POINTS * entry.missed_count
        )

    return sorted(eligible, key=lambda person: (-score(person), person.id))


def suggested_assignee(
        task: Task,
        people: list[Person],
        tasks: list[Task],
        availability: dict[int, list[AvailabilityWindow]],
        today: date,
) -> Person | None:
    ranked = rank_candidates(task, people, tasks, availability, today)
    return ranked[0] if ranked else None
