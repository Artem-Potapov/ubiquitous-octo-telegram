from fastapi import APIRouter, status

from api.schemas import GapResolve
from db.db_contract import DBManager, Gap, GapStatus
from db.exceptions import NotFoundError
from engine.runner import run_engine
from misc.dependencies import DatabaseDependency, OptionalViewerDependency, ViewerDependency

router = APIRouter(tags=["gaps"])


@router.get("/networks/{network_id}/gaps")
async def list_gaps(
        network_id: int,
        viewer_id: ViewerDependency,
        db: DatabaseDependency,
        status: GapStatus | None = None,
) -> list[Gap]:
    # Omitting ?status= returns every gap (the DBManager default is open-only).
    return await db.list_gaps(network_id, viewer_id, status)


@router.post("/networks/{network_id}/gaps/detect", status_code=status.HTTP_204_NO_CONTENT)
async def detect_gaps(
        network_id: int, viewer_id: OptionalViewerDependency, db: DatabaseDependency
) -> None:
    if viewer_id is not None:
        await db.get_care_network(network_id, viewer_id)
    await run_engine(db, network_id)


async def _network_of_visible_gap(db: DBManager, gap_id: int, viewer_id: int) -> int:
    # There is no get_gap, so look through the viewer's own networks. A gap the viewer
    # cannot see is a 404, not a 403, so outsiders cannot probe which gap ids exist.
    for network in await db.list_networks_for_person(viewer_id):
        if any(gap.id == gap_id for gap in await db.list_gaps(network.id, viewer_id, None)):
            return network.id
    raise NotFoundError(f"gap {gap_id} does not exist")


@router.post("/gaps/{gap_id}/resolve")
async def resolve_gap(
        gap_id: int, body: GapResolve, viewer_id: OptionalViewerDependency, db: DatabaseDependency
) -> Gap:
    if viewer_id is None:
        return await db.resolve_gap(gap_id, body.resolved_by_person_id)
    network_id = await _network_of_visible_gap(db, gap_id, viewer_id)
    await db.resolve_gap(gap_id, body.resolved_by_person_id)
    # Re-read as the viewer so the response is redacted like any other gap.
    resolved = await db.list_gaps(network_id, viewer_id, GapStatus.resolved)
    return next(gap for gap in resolved if gap.id == gap_id)
