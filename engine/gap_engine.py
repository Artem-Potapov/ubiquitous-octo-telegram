"""
Deterministic care-gap detection (port of src/domain/gapEngine.ts).

  unowned   - task with zero assignments
  redundant - exclusive (single-owner) task with 2+ assignments
  missed    - an assignment marked missed

Shared (non-exclusive) tasks with several assignees are intentional backup
coverage and are NOT flagged. plan_conflict gaps come from the optional AI
care-plan review and are not produced here.
"""
from __future__ import annotations

from datetime import date

from db.db_contract import (
    AssignmentStatus,
    AvailabilityWindow,
    GapCreate,
    GapKind,
    GapSeverity,
    Person,
    Task,
)
from engine.suggestions import suggested_assignee
from engine.workload import compute_weekly_loads

WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def days_until(due_date: date | None, today: date) -> int | None:
    return None if due_date is None else (due_date - today).days


def relative_due_label(due_date: date | None, today: date) -> str:
    days = days_until(due_date, today)
    if days is None:
        return "No due date"
    if days == 0:
        return "Due today"
    if days == 1:
        return "Due tomorrow"
    if days == -1:
        return "1 day overdue"
    if days < 0:
        return f"{-days} days overdue"
    if days < 7:
        return f"Due {WEEKDAY_LONG[due_date.weekday()]}"
    return f"Due {MONTH_SHORT[due_date.month - 1]} {due_date.day}"


def unowned_severity(task: Task, today: date) -> GapSeverity:
    days = days_until(task.due_date, today)
    if days is None:
        return GapSeverity.low
    if days <= 2:
        return GapSeverity.high
    if days <= 7:
        return GapSeverity.medium
    return GapSeverity.low


def first_name(person: Person | None) -> str:
    if person is None:
        return "Someone"
    if person.is_physician:
        return f"Dr. {person.full_name.split(' ')[-1]}"
    return person.full_name.split(" ")[0]


def list_names(names: list[str]) -> str:
    if len(names) <= 2:
        return " and ".join(names)
    return f"{', '.join(names[:-1])}, and {names[-1]}"


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:]


def detect_gaps(
        tasks: list[Task],
        people: list[Person],
        availability: dict[int, list[AvailabilityWindow]],
        today: date,
) -> list[GapCreate]:
    by_id = {person.id: person for person in people}
    loads = compute_weekly_loads(tasks, people)
    gaps: list[GapCreate] = []

    for task in tasks:
        due_label = _lower_first(relative_due_label(task.due_date, today))

        if not task.assignments:
            suggestion = suggested_assignee(task, people, tasks, availability, today)
            gaps.append(GapCreate(
                gap_kind=GapKind.unowned,
                severity=unowned_severity(task, today),
                description=(
                    f'"{task.title}" has no owner ({due_label}). '
                    f"Everyone may be assuming someone else is handling it."
                ),
                task_id=task.id,
                suggested_assignee_id=suggestion.id if suggestion else None,
            ))

        if task.is_exclusive and len(task.assignments) >= 2:
            owners = [by_id[a.person_id] for a in task.assignments if a.person_id in by_id]
            # Suggest keeping the owner with the lightest load (stable, like Array.sort).
            keep = min(owners, key=lambda owner: loads[owner.id].load, default=None)
            gaps.append(GapCreate(
                gap_kind=GapKind.redundant,
                severity=GapSeverity.medium,
                description=(
                    f'"{task.title}" should have one owner, but '
                    f"{list_names([first_name(owner) for owner in owners])} are all assigned. "
                    f"They may duplicate work or give conflicting information."
                ),
                task_id=task.id,
                suggested_assignee_id=keep.id if keep else None,
            ))

        for assignment in task.assignments:
            if assignment.status != AssignmentStatus.missed:
                continue
            alternative = suggested_assignee(task, people, tasks, availability, today)
            gaps.append(GapCreate(
                gap_kind=GapKind.missed,
                severity=GapSeverity.high,
                description=(
                    f"{first_name(by_id.get(assignment.person_id))} was responsible for "
                    f'"{task.title}" ({due_label}) and it was marked missed. '
                    f"Nobody has followed up yet."
                ),
                task_id=task.id,
                suggested_assignee_id=alternative.id if alternative else None,
            ))

    return gaps
