from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.core.database import Base

class Categoria(Base):
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, index=True, nullable=False)
    descripcion = Column(String, nullable=True)

    # Relación inversa: una categoría tiene muchos productos
    productos = relationship("Producto", back_populates="categoria")