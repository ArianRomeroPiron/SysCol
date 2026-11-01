from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import engine
from app.routers import auth, negocio

app = FastAPI(title="SysCol API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth.router)
app.include_router(negocio.router)


@app.exception_handler(IntegrityError)
async def integrity_error(request: Request, exc: IntegrityError):
    return JSONResponse(
        status_code=409,
        content={"detail": "Conflicto con un registro existente. Actualiza y vuelve a intentar."},
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/ready")
def readiness():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1 FROM alembic_version"))
    return {"status": "ready"}
