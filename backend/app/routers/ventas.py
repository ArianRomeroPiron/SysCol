from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from decimal import Decimal

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.venta import Venta, DetalleVenta
from app.schemas.venta import VentaCreate, VentaOut
from app.models.usuario import Usuario

router = APIRouter(prefix="/ventas", tags=["Ventas"])


@router.post("/", response_model=VentaOut, status_code=201)
def crear_venta(
    venta_data: VentaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    # Calcular subtotal por cada detalle y el subtotal general
    subtotal_general = Decimal("0")
    detalles_obj = []

    for item in venta_data.detalles:
        subtotal_item = item.precio_venta * item.cantidad
        subtotal_general += subtotal_item
        detalles_obj.append(
            DetalleVenta(
                id_producto=item.id_producto,
                cantidad=item.cantidad,
                precio_venta=item.precio_venta,
                subtotal=subtotal_item,
            )
        )

    impuesto = subtotal_general * Decimal("0.18")  # ITBIS 18% — ajustar si aplica distinto
    total = subtotal_general + impuesto

    nueva_venta = Venta(
        id_cliente=venta_data.id_cliente,
        metodo_pago=venta_data.metodo_pago,
        subtotal=subtotal_general,
        impuesto=impuesto,
        total=total,
        detalles=detalles_obj,
    )

    db.add(nueva_venta)
    db.commit()
    db.refresh(nueva_venta)

    return nueva_venta


@router.get("/{id_venta}", response_model=VentaOut)
def obtener_venta(
    id_venta: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    return db.query(Venta).filter(Venta.id_venta == id_venta).first()