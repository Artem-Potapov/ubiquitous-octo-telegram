from __future__ import annotations

from datetime import date

from db.db_contract import SYSTEM_VIEWER_ID, DBManager, Gap, GapCreate, GapKind, GapStatus
from engine.gap_engine import detect_gaps
from engine.workload import SENTIMENT_WINDOW, compute_burnout_scores


async def run_engine(db: DBManager, network_id: int, today: date | None = None) -> list[Gap]:
    """
    Re-run gap detection and burnout scoring for one network. NotFoundError for an unknown network.

    Reads as SYSTEM_VIEWER_ID so the rules see unredacted data; redaction happens when gaps are read.
    Open plan_conflict gaps are carried over, since they come from the AI review and the rules
    here cannot recreate them (their ids still change, like every other open gap).
    Burnout scores are appended on every run, as the contract says; they are never overwritten.
    """
    today = today or date.today()
    people = await db.list_people_in_network(network_id, SYSTEM_VIEWER_ID)
    tasks = await db.list_tasks(network_id, SYSTEM_VIEWER_ID)
    availability = await db.list_availability_in_network(network_id, SYSTEM_VIEWER_ID)
    open_gaps = await db.list_gaps(network_id, SYSTEM_VIEWER_ID, GapStatus.open)

    carried_over = [
        GapCreate.model_validate(gap.model_dump(include=set(GapCreate.model_fields)))
        for gap in open_gaps
        if gap.gap_kind == GapKind.plan_conflict
    ]
    detected = detect_gaps(tasks, people, availability, today)
    gaps = await db.replace_open_gaps(network_id, detected + carried_over)

    sentiment_by_person: dict[int, float | None] = {}
    for person in people:
        checkins = await db.list_checkins(network_id, person.id, SYSTEM_VIEWER_ID, SENTIMENT_WINDOW)
        sentiment_by_person[person.id] = (
            sum(checkin.sentiment_score for checkin in checkins) / len(checkins) if checkins else None
        )
    for score in compute_burnout_scores(network_id, tasks, people, sentiment_by_person):
        await db.record_burnout_score(score)

    return gaps
