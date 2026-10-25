from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from db.exceptions import AccessDeniedError, ConflictError, NotFoundError

STATUS_BY_ERROR: dict[type[Exception], int] = {
    NotFoundError: 404,
    AccessDeniedError: 403,
    ConflictError: 409,
}


def register_exception_handlers(app: FastAPI) -> None:
    for error_type, status_code in STATUS_BY_ERROR.items():
        app.add_exception_handler(error_type, _handler_for(status_code))


def _handler_for(status_code: int):
    async def handle(_request: Request, error: Exception) -> JSONResponse:
        return JSONResponse(status_code=status_code, content={"detail": str(error)})
    return handle
