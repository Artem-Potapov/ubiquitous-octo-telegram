"""
DBManager does not access-check writes. When the request names a viewer, every route
here first loads the task as that viewer (404 / 403 before anything is written), and
updated tasks are re-read as the viewer so restricted text is never sent back unredacted.
Without a viewer the routes behave exactly like the DBManager methods.
"""
from fastapi import APIRouter, status

from api.schemas import AssignmentStatusUpdate
from db.db_contract import DBManager, Task, TaskAssignment, TaskUpdate
from misc.dependencies import DatabaseDependency, OptionalViewerDependency

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _check_viewer(db: DBManager, task_id: int, viewer_id: int | None) -> None:
    if viewer_id is not None:
        await db.get_task(task_id, viewer_id)


@router.patch("/{task_id}")
async def update_task(
        task_id: int, changes: TaskUpdate, viewer_id: OptionalViewerDependency, db: DatabaseDependency
) -> Task:
    if viewer_id is None:
        return await db.update_task(task_id, changes)
    await _check_viewer(db, task_id, viewer_id)
    await db.update_task(task_id, changes)
    return await db.get_task(task_id, viewer_id)


@router.put("/{task_id}/assignments/{person_id}")
async def assign_task(
        task_id: int, person_id: int, viewer_id: OptionalViewerDependency, db: DatabaseDependency
) -> TaskAssignment:
    await _check_viewer(db, task_id, viewer_id)
    return await db.assign_task(task_id, person_id)


@router.delete("/{task_id}/assignments/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unassign_task(
        task_id: int, person_id: int, viewer_id: OptionalViewerDependency, db: DatabaseDependency
) -> None:
    await _check_viewer(db, task_id, viewer_id)
    await db.unassign_task(task_id, person_id)


@router.patch("/{task_id}/assignments/{person_id}")
async def set_assignment_status(
        task_id: int,
        person_id: int,
        body: AssignmentStatusUpdate,
        viewer_id: OptionalViewerDependency,
        db: DatabaseDependency,
) -> TaskAssignment:
    await _check_viewer(db, task_id, viewer_id)
    return await db.set_assignment_status(task_id, person_id, body.status)
