from fastapi import APIRouter, status

from db import seed_demo
from engine.runner import run_engine
from misc.dependencies import DatabaseDependency

router = APIRouter(prefix="/demo", tags=["demo"])

DEMO_PATIENT_ID = 1
"""Walter is the seed's first person. SQLite restarts ids after reset_all_data, and the
frontend's role switcher already relies on that (it hardcodes person ids 1, 2, 6 and 9)."""


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_demo(db: DatabaseDependency) -> None:
    """Wipe every row and re-seed the Lindqvist network. Demo only: not access-checked."""
    await db.reset_all_data()
    # The seed's canned gaps include the AI plan conflict; the engine then recomputes the
    # deterministic gaps (keeping that conflict) and today's burnout scores, like the mock's seed().
    await seed_demo.seed(db, sample_plans=True, with_gaps=True)
    for network in await db.list_networks_for_person(DEMO_PATIENT_ID):
        await run_engine(db, network.id)
