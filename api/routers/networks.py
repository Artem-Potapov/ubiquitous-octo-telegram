from fastapi import APIRouter

from api.demo_data import demo_patient_profile
from api.schemas import PatientProfile
from db.db_contract import AvailabilityWindow, CareNetwork, CarePlan, NetworkGraph, Person, Task
from misc.dependencies import DatabaseDependency, ViewerDependency

router = APIRouter(prefix="/networks", tags=["networks"])


@router.get("/{network_id}")
async def get_care_network(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> CareNetwork:
    return await db.get_care_network(network_id, viewer_id)


@router.get("/{network_id}/patient-profile")
async def get_patient_profile(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> PatientProfile:
    network = await db.get_care_network(network_id, viewer_id)
    return demo_patient_profile(network.patient_id)


@router.get("/{network_id}/people")
async def list_people_in_network(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> list[Person]:
    return await db.list_people_in_network(network_id, viewer_id)


@router.get("/{network_id}/graph")
async def get_network_graph(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> NetworkGraph:
    return await db.get_network_graph(network_id, viewer_id)


@router.get("/{network_id}/tasks")
async def list_tasks(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> list[Task]:
    return await db.list_tasks(network_id, viewer_id)


@router.get("/{network_id}/availability")
async def list_availability_in_network(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> dict[int, list[AvailabilityWindow]]:
    return await db.list_availability_in_network(network_id, viewer_id)


@router.get("/{network_id}/care-plans")
async def list_care_plans(
        network_id: int, viewer_id: ViewerDependency, db: DatabaseDependency
) -> list[CarePlan]:
    return await db.list_care_plans(network_id, viewer_id)
