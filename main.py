from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.errors import register_exception_handlers
from api.routers import ALL_ROUTERS
from db.db_manager import SQLiteDBManager


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

# Routes get the DB through misc.dependencies.DatabaseDependency for full type hinting;
# PyCharm does not like app.state.

# Same hosts as allowedHosts in frontend/vite.config.js, on any scheme and port.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|demo\.somenewsteps\.space)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)
register_exception_handlers(app)
for router in ALL_ROUTERS:
    app.include_router(router)
