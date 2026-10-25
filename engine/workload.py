"""
Caregiver workload & strain index (port of src/domain/workload.ts).

ILLUSTRATIVE ONLY - a transparent heuristic for spotting uneven workload,
not a clinically validated burnout measure.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from db.db_contract import (
    AssignmentStatus,
    BurnoutScoreCreate,
    Person,
    PersonType,
    Task,
    TaskAssignment,
    TaskFrequency,
)

FREQUENCY_WEIGHT: dict[TaskFrequency, float] = {
    TaskFrequency.daily: 7,
    TaskFrequency.weekly: 1,
    TaskFrequency.monthly: 0.25,
    TaskFrequency.once: 1,
    TaskFrequency.as_needed: 0.5,
}

LOAD_SHARE_POINTS = 65   # points at 100% of the family's weekly task load
PER_MISSED_POINTS = 10   # points per missed responsibility...
MISSED_CAP_POINTS = 15   # ...capped here
WELLBEING_POINTS = 20    # points at the most negative check-in sentiment (-1)

SENTIMENT_WINDOW = 5
"""How many of a person's newest check-ins feed sentiment_average."""


@dataclass
class WeeklyLoad:
    load: float = 0.0
    task_count: int = 0
    missed_count: int = 0


def js_round(value: float) -> int:
    """Math.round: halves go up. Python's round() would send 2.5 to 2."""
    return math.floor(value + 0.5)


def _is_active(assignment: TaskAssignment) -> bool:
    return assignment.status != AssignmentStatus.done


def task_load_for(task: Task, person_id: int) -> float:
    """Weekly occurrences one person carries for a task. Shared (non-exclusive) tasks are split."""
    active = [assignment for assignment in task.assignments if _is_active(assignment)]
    if not any(assignment.person_id == person_id for assignment in active):
        return 0.0
    weight = FREQUENCY_WEIGHT.get(task.frequency, 1)
    return weight if task.is_exclusive else weight / len(active)


def compute_weekly_loads(tasks: list[Task], people: list[Person]) -> dict[int, WeeklyLoad]:
    loads = {person.id: WeeklyLoad() for person in people}
    for task in tasks:
        for assignment in task.assignments:
            entry = loads.get(assignment.person_id)
            if entry is None:
                continue
            if assignment.status == AssignmentStatus.missed:
                entry.missed_count += 1
            if not _is_active(assignment):
                continue
            entry.load += task_load_for(task, assignment.person_id)
            entry.task_count += 1
    return loads


def compute_burnout_scores(
        network_id: int,
        tasks: list[Task],
        people: list[Person],
        sentiment_by_person: dict[int, float | None],
) -> list[BurnoutScoreCreate]:
    """One score per family member, highest first."""
    family = [person for person in people if person.person_type == PersonType.family]
    loads = compute_weekly_loads(tasks, people)
    total = sum(loads[person.id].load for person in family)

    scores: list[BurnoutScoreCreate] = []
    for person in family:
        entry = loads[person.id]
        share = entry.load / total if total > 0 else 0.0
        sentiment = sentiment_by_person.get(person.id)
        points = (
            share * LOAD_SHARE_POINTS
            + min(entry.missed_count * PER_MISSED_POINTS, MISSED_CAP_POINTS)
            + (-sentiment * WELLBEING_POINTS if sentiment is not None and sentiment < 0 else 0)
        )
        scores.append(BurnoutScoreCreate(
            person_id=person.id,
            network_id=network_id,
            score=min(100, js_round(points)),
            task_share=round(share, 3),
            missed_count=entry.missed_count,
            sentiment_average=None if sentiment is None else round(sentiment, 2),
        ))
    scores.sort(key=lambda score: -score.score)
    return scores
