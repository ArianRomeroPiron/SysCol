from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, index=True, nullable=False)
    id_categoria = Column(Integer, ForeignKey("categorias.id"), nullable=False)
    precio_compra = Column(Float, nullable=False)
    precio_venta = Column(Float, nullable=False)
    codigo_barras = Column(String, unique=True, index=True, nullable=True)

    # Relación directa: un producto pertenece a una categoría
    categoria = relationship("Categoria", back_populates="productos")