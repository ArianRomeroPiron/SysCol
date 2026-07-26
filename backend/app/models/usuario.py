from sqlalchemy import Boolean, Column, Integer, String
from app.core.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    rol = Column(
        String, default="cajero"
    )  # Puede ser: "admin", "cajero", "dueno"
    esta_activo = Column(Boolean, default=True)