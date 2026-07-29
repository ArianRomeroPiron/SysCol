from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime


class DetalleVentaCreate(BaseModel):
    id_producto: int
    cantidad: int
    precio_venta: Decimal


class VentaCreate(BaseModel):
    id_cliente: int | None = None
    metodo_pago: str
    detalles: list[DetalleVentaCreate]


class DetalleVentaOut(BaseModel):
    id_detalle: int
    id_producto: int
    cantidad: int
    precio_venta: Decimal
    subtotal: Decimal

    class Config:
        from_attributes = True


class VentaOut(BaseModel):
    id_venta: int
    id_cliente: int | None
    fecha: datetime
    subtotal: Decimal
    impuesto: Decimal
    total: Decimal
    metodo_pago: str
    detalles: list[DetalleVentaOut]

    class Config:
        from_attributes = True