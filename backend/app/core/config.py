import os
from dotenv import load_dotenv

# Carga las variables del archivo .env que creaste
load_dotenv()

class Settings:
    # Lee el DATABASE_URL de tu .env. Si por alguna razón falla, usa el valor por defecto de Docker.
    database_url: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://postgres:postgres@localhost:5432/colmados_db"
    )

settings = Settings()