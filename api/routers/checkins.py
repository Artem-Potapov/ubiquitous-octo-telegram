from typing import Annotated

from fastapi import APIRouter, Query, status

from db.db_contract import BurnoutScore, Checkin, CheckinCreate
from db.exceptions import AccessDeniedError
from misc.dependencies import DatabaseDependency, OptionalViewerDependency, ViewerDependency

router = APIRouter(tags=["checkins"])


@router.post("/checkins", status_code=status.HTTP_201_CREATED)
async def create_checkin(
        new_checkin: CheckinCreate, viewer_id: OptionalViewerDependency, db: DatabaseDependency
) -> Checkin:
    # Check-ins are private to their author, so a named viewer can only post their own.
    if viewer_id is not None:
        if new_checkin.person_id != viewer_id:
            raise AccessDeniedError(
                f"person {viewer_id} cannot post check-ins for person {new_checkin.person_id}"
            )
        await db.get_care_network(new_checkin.network_id, viewer_id)
    return await db.create_checkin(new_checkin)


@router.get("/networks/{network_id}/people/{person_id}/checkins")
async def list_checkins(
        network_id: int,
        person_id: int,
        viewer_id: ViewerDependency,
        db: DatabaseDependency,
        limit: Annotated[int, Query(ge=1)] = 50,
) -> list[Checkin]:
    return await db.list_checkins(network_id, person_id, viewer_id, limit)


@router.get("/networks/{network_id}/burnout/latest")
async def list_latest_burnout_scores(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> list[BurnoutScore]:
    return await db.list_latest_burnout_scores(network_id, viewer_id)


@router.get("/networks/{network_id}/people/{person_id}/burnout")
async def get_burnout_history(
        network_id: int,
        person_id: int,
        viewer_id: ViewerDependency,
        db: DatabaseDependency,
        limit: Annotated[int, Query(ge=1)] = 30,
) -> list[BurnoutScore]:
    return await db.get_burnout_history(network_id, person_id, viewer_id, limit)
