from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Venta(Base):
    __tablename__ = "ventas"

    id = Column(Integer, primary_key=True, index=True)
    id_cliente = Column(Integer, nullable=True)  # FK a clientes.id cuando P3 la suba
    fecha = Column(DateTime(timezone=True), server_default=func.now())
    subtotal = Column(Numeric(10, 2), nullable=False)
    impuesto = Column(Numeric(10, 2), nullable=False, default=0)
    total = Column(Numeric(10, 2), nullable=False)
    metodo_pago = Column(String, nullable=False)  # 'efectivo', 'tarjeta', 'fiao'

    detalles = relationship("DetalleVenta", back_populates="venta", cascade="all, delete-orphan")


class DetalleVenta(Base):
    __tablename__ = "detalle_venta"

    id = Column(Integer, primary_key=True, index=True)
    id_venta = Column(Integer, ForeignKey("ventas.id"), nullable=False)
    id_producto = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)
    precio_venta = Column(Numeric(10, 2), nullable=False)
    subtotal = Column(Numeric(10, 2), nullable=False)

    venta = relationship("Venta", back_populates="detalles")