from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Crea el motor de conexión usando la URL del .env
engine = create_engine(settings.database_url)

# Configura la sesión para interactuar con la base de datos
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ¡Esta es la variable Base que Alembic está buscando!
Base = declarative_base()


# Función para obtener la sesión de la base de datos en las rutas de FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()