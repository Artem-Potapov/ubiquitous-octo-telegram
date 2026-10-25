# dependencies.py
from typing import Annotated
from fastapi import Depends, Header, Request
from db.db_contract import DBManager


def get_database(request: Request) -> DBManager:
    # noinspection PyUnresolvedReferences
    return request.app.state.database


# Demo only: production would take the viewer from an authenticated session.
# gt=0 keeps SYSTEM_VIEWER_ID from ever coming in through a request.
def get_viewer_id(x_viewer_id: Annotated[int, Header(alias="X-Viewer-Id", gt=0)]) -> int:
    return x_viewer_id


def get_optional_viewer_id(
        x_viewer_id: Annotated[int | None, Header(alias="X-Viewer-Id", gt=0)] = None
) -> int | None:
    # The frontend does not send X-Viewer-Id on most writes yet. Write routes check
    # access when it is present and fall back to the contract's unchecked writes when not.
    return x_viewer_id


DatabaseDependency = Annotated[DBManager, Depends(get_database)]
ViewerDependency = Annotated[int, Depends(get_viewer_id)]
OptionalViewerDependency = Annotated[int | None, Depends(get_optional_viewer_id)]
