from fastapi import FastAPI
from app.routers import auth, ventas

app = FastAPI(title="SysCol API")

app.include_router(auth.router)
app.include_router(ventas.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}