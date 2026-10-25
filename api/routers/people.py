from fastapi import APIRouter

from db.db_contract import CareNetwork, Person
from misc.dependencies import DatabaseDependency

router = APIRouter(prefix="/people", tags=["people"])


@router.get("/{person_id}")
async def get_person(person_id: int, db: DatabaseDependency) -> Person:
    return await db.get_person(person_id)


@router.get("/{person_id}/networks")
async def list_networks_for_person(person_id: int, db: DatabaseDependency) -> list[CareNetwork]:
    return await db.list_networks_for_person(person_id)
