from contextlib import asynccontextmanager

import anyio
from fastapi import FastAPI

from db.db_manager import SQLiteDBManager
from misc.dependencies import DatabaseDependency


@asynccontextmanager
async def lifespan(app: FastAPI):
    database = SQLiteDBManager("constellation.db")   # or FakeDBManager()
    await database.connect()
    await database.init_schema()
    app.state.database = database
    yield
    await database.close()

app = FastAPI(lifespan=lifespan)

#Yeah so just don't delete this part but feel free to move it somewhere else
#DO NOT cut out the lifespan out of fastapi, or DB won't start

@app.get("/some/url")
#To get full type hinting across the DB do this, PyCharm does not like app.state
async def something(network_id: int, viewer_id: int, db: DatabaseDependency):
    await anyio.sleep(0)
    return