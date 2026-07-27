from fastapi import FastAPI

from app.routers import auth

app = FastAPI(title="SysCol API")

app.include_router(auth.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}