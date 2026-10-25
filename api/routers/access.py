from fastapi import APIRouter, status

from db.db_contract import AccessGrant
from misc.dependencies import DatabaseDependency, ViewerDependency

router = APIRouter(prefix="/networks/{network_id}", tags=["access"])


@router.put("/grants/{grantee_id}")
async def grant_restricted_access(
        network_id: int, grantee_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> AccessGrant:
    return await db.grant_restricted_access(network_id, grantee_id, viewer_id)


@router.delete("/grants/{grantee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_restricted_access(
        network_id: int, grantee_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> None:
    await db.revoke_restricted_access(network_id, grantee_id, viewer_id)


@router.get("/grants")
async def list_access_grants(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> list[AccessGrant]:
    return await db.list_access_grants(network_id, viewer_id)


@router.get("/can-view-restricted")
async def can_view_restricted(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> bool:
    return await db.can_view_restricted(network_id, viewer_id)
