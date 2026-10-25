# dependencies.py
from typing import Annotated
from fastapi import Depends, Request
from db.db_manager import DBManager

def get_database(request: Request) -> DBManager:
    # noinspection PyUnresolvedReferences
    return request.app.state.database

DatabaseDependency = Annotated[DBManager, Depends(get_database)]