from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class Colmado(Base):
    __tablename__ = "colmados"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False)


class Categoria(Base):
    __tablename__ = "categorias"
    __table_args__ = (UniqueConstraint("colmado_id", "nombre"),)
    id = Column(Integer, primary_key=True)
    colmado_id = Column(Integer, ForeignKey("colmados.id"), nullable=False, index=True)
    nombre = Column(String(120), nullable=False)


class Producto(Base):
    __tablename__ = "productos"
    __table_args__ = (
        UniqueConstraint("colmado_id", "codigo_barras"),
        CheckConstraint("stock >= 0 AND precio_venta >= 0 AND precio_compra >= 0"),
    )
    id = Column(Integer, primary_key=True)
    colmado_id = Column(Integer, ForeignKey("colmados.id"), nullable=False, index=True)
    id_categoria = Column(Integer, ForeignKey("categorias.id"), nullable=False)
    nombre = Column(String(160), nullable=False)
    codigo_barras = Column(String(80), nullable=True)
    precio_compra = Column(Numeric(14, 2), nullable=False)
    precio_venta = Column(Numeric(14, 2), nullable=False)
    stock = Column(Integer, nullable=False, default=0)
    stock_minimo = Column(Integer, nullable=False, default=5)
    activo = Column(Boolean, nullable=False, default=True)


class Movimiento(Base):
    __tablename__ = "movimientos"
    id = Column(Integer, primary_key=True)
    colmado_id = Column(Integer, ForeignKey("colmados.id"), nullable=False, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)
    motivo = Column(String(200), nullable=False)
    fecha = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Cliente(Base):
    __tablename__ = "clientes"
    id = Column(Integer, primary_key=True)
    colmado_id = Column(Integer, ForeignKey("colmados.id"), nullable=False, index=True)
    nombre = Column(String(160), nullable=False)
    telefono = Column(String(20), nullable=False)
    limite_credito = Column(Numeric(14, 2), nullable=False, default=0)
    saldo = Column(Numeric(14, 2), nullable=False, default=0)
    consentimiento_whatsapp = Column(Boolean, nullable=False, default=False)
    __table_args__ = (CheckConstraint("saldo >= 0 AND limite_credito >= 0"),)


class Venta(Base):
    __tablename__ = "ventas"
    __table_args__ = (UniqueConstraint("colmado_id", "referencia"),)
    id = Column(Integer, primary_key=True)
    colmado_id = Column(Integer, ForeignKey("colmados.id"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    id_cliente = Column(Integer, ForeignKey("clientes.id"), nullable=True)
    referencia = Column(String(80), nullable=False)
    fecha = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    subtotal = Column(Numeric(14, 2), nullable=False)
    impuesto = Column(Numeric(14, 2), nullable=False, default=0)
    total = Column(Numeric(14, 2), nullable=False)
    metodo_pago = Column(String(20), nullable=False)
    detalles = relationship("DetalleVenta", cascade="all, delete-orphan", lazy="selectin")


class DetalleVenta(Base):
    __tablename__ = "detalle_venta"
    id = Column(Integer, primary_key=True)
    id_venta = Column(Integer, ForeignKey("ventas.id"), nullable=False)
    id_producto = Column(Integer, ForeignKey("productos.id"), nullable=False)
    nombre = Column(String(160), nullable=False)
    cantidad = Column(Integer, nullable=False)
    precio_venta = Column(Numeric(14, 2), nullable=False)
    subtotal = Column(Numeric(14, 2), nullable=False)


class Deuda(Base):
    __tablename__ = "deudas"
    id = Column(Integer, primary_key=True)
    colmado_id = Column(Integer, ForeignKey("colmados.id"), nullable=False, index=True)
    id_cliente = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    id_venta = Column(Integer, ForeignKey("ventas.id"), nullable=False, unique=True)
    monto_total = Column(Numeric(14, 2), nullable=False)
    saldo_pendiente = Column(Numeric(14, 2), nullable=False)
    fecha = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (CheckConstraint("saldo_pendiente >= 0 AND saldo_pendiente <= monto_total"),)


class Abono(Base):
    __tablename__ = "abonos"
    __table_args__ = (UniqueConstraint("colmado_id", "referencia"),)
    id = Column(Integer, primary_key=True)
    colmado_id = Column(Integer, ForeignKey("colmados.id"), nullable=False, index=True)
    id_deuda = Column(Integer, ForeignKey("deudas.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    monto = Column(Numeric(14, 2), nullable=False)
    referencia = Column(String(80), nullable=False)
    fecha = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Aviso(Base):
    __tablename__ = "avisos"
    __table_args__ = (UniqueConstraint("cliente_id", "dia"),)
    id = Column(Integer, primary_key=True)
    colmado_id = Column(Integer, ForeignKey("colmados.id"), nullable=False, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    dia = Column(String(10), nullable=False)
    estado = Column(String(20), nullable=False)
    proveedor_id = Column(String(80), nullable=True)
