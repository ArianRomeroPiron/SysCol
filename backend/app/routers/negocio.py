import csv
import io
from datetime import UTC, date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Abono,
    Categoria,
    Cliente,
    Colmado,
    DetalleVenta,
    Deuda,
    Movimiento,
    Producto,
    Usuario,
    Venta,
)
from app.schemas.negocio import PASOS_FE, Category, Customer, Fiscal, Payment, Product, Sale, Stock

router = APIRouter(tags=["Negocio"])


def manager(user):
    if user.rol not in ("dueno", "admin"):
        raise HTTPException(403, "Se requiere permiso de administrador")


def owned(db, cls, id, user, lock=False):
    query = select(cls).where(cls.id == id, cls.colmado_id == user.colmado_id)
    obj = db.scalar(query.with_for_update() if lock else query)
    if obj is None:
        raise HTTPException(404, "Registro no encontrado")
    return obj


_ACCENTS = {
    "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n",
    "Á": "a", "É": "e", "Í": "i", "Ó": "o", "Ú": "u", "Ü": "u", "Ñ": "n",
}  # fmt: skip


def _fold_text(text: str) -> str:
    text = text.strip().lower()
    return "".join(_ACCENTS.get(c, c) for c in text)


def _fold(column):
    """Minúsculas y sin tildes en SQL, para que «cafe» encuentre «Café»."""
    expr = func.lower(column)
    for accented, plain in _ACCENTS.items():
        expr = func.replace(expr, accented, plain)
    return expr


def _contains(q: str) -> str:
    escaped = _fold_text(q).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return "%" + escaped + "%"


CENT = Decimal("0.01")
# Días de negocio en hora de República Dominicana.
DR = timezone(timedelta(hours=-4))
LIMITE_FACTURADOR_GRATUITO = 150


def included_itbis(amount: Decimal, rate: int) -> Decimal:
    """ITBIS contenido en un precio final que ya lo incluye."""
    if not rate:
        return Decimal("0.00")
    return (amount * rate / (100 + rate)).quantize(CENT, rounding=ROUND_HALF_UP)


def period(desde: date, hasta: date):
    if hasta == date.max or hasta < desde or (hasta - desde).days > 366:
        raise HTTPException(422, "Selecciona un período de hasta 366 días")
    start = datetime.combine(desde, time.min, DR).astimezone(UTC)
    end = datetime.combine(hasta + timedelta(days=1), time.min, DR).astimezone(UTC)
    return start, end


def page(db, cls, user, offset, limit):
    return db.scalars(
        select(cls)
        .where(cls.colmado_id == user.colmado_id)
        .order_by(cls.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()


@router.get("/categorias")
def categories(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return page(db, Categoria, user, offset, limit)


@router.post("/categorias", status_code=201)
def category(data: Category, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    manager(user)
    obj = Categoria(colmado_id=user.colmado_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/productos")
def products(
    q: str = Query("", max_length=160),
    bajo_stock: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Producto).where(Producto.colmado_id == user.colmado_id)
    if q.strip():
        pattern = _contains(q)
        query = query.where(
            _fold(Producto.nombre).like(pattern, escape="\\")
            | func.lower(Producto.codigo_barras).like(pattern, escape="\\")
        )
    if bajo_stock:
        query = query.where(Producto.stock <= Producto.stock_minimo, Producto.activo.is_(True))
    return db.scalars(query.order_by(Producto.nombre, Producto.id).offset(offset).limit(limit)).all()


@router.post("/productos", status_code=201)
def product(data: Product, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    manager(user)
    owned(db, Categoria, data.id_categoria, user)
    obj = Producto(colmado_id=user.colmado_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/productos/{id}")
def edit_product(
    id: int, data: Product, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
):
    manager(user)
    owned(db, Categoria, data.id_categoria, user)
    obj = owned(db, Producto, id, user, lock=True)
    for key, value in data.model_dump().items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/productos/{id}/stock")
def stock(id: int, data: Stock, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    manager(user)
    owned(db, Producto, id, user)
    changed = db.execute(
        update(Producto)
        .where(Producto.id == id, Producto.colmado_id == user.colmado_id, Producto.stock + data.cantidad >= 0)
        .values(stock=Producto.stock + data.cantidad)
    )
    if changed.rowcount != 1:
        raise HTTPException(409, "El ajuste deja stock negativo")
    db.add(
        Movimiento(
            colmado_id=user.colmado_id,
            producto_id=id,
            usuario_id=user.id,
            cantidad=data.cantidad,
            motivo=data.motivo,
        )
    )
    db.commit()
    return owned(db, Producto, id, user)


@router.get("/movimientos")
def movements(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    manager(user)
    return page(db, Movimiento, user, offset, limit)


@router.get("/clientes")
def customers(
    q: str = Query("", max_length=160),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Cliente).where(Cliente.colmado_id == user.colmado_id)
    if q.strip():
        pattern = _contains(q)
        query = query.where(
            _fold(Cliente.nombre).like(pattern, escape="\\")
            | Cliente.telefono.like(pattern, escape="\\")
        )
    return db.scalars(query.order_by(Cliente.nombre, Cliente.id).offset(offset).limit(limit)).all()


@router.post("/clientes", status_code=201)
def customer(data: Customer, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    obj = Cliente(colmado_id=user.colmado_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/clientes/{id}")
def edit_customer(
    id: int, data: Customer, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
):
    manager(user)
    obj = owned(db, Cliente, id, user, lock=True)
    if data.limite_credito < obj.saldo:
        raise HTTPException(409, "El límite no puede ser menor que la deuda actual")
    for key, value in data.model_dump().items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


def sale_out(obj):
    return {**{c.name: getattr(obj, c.name) for c in Venta.__table__.columns}, "detalles": obj.detalles}


@router.post("/ventas", status_code=201)
def sale(data: Sale, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    ref = str(data.referencia)
    existing = db.scalar(select(Venta).where(Venta.colmado_id == user.colmado_id, Venta.referencia == ref))
    if existing:
        expected = sorted((x.id_producto, x.cantidad) for x in data.detalles)
        actual = sorted((x.id_producto, x.cantidad) for x in existing.detalles)
        if (
            expected != actual
            or data.id_cliente != existing.id_cliente
            or data.metodo_pago != existing.metodo_pago
        ):
            raise HTTPException(409, "Referencia utilizada para otra venta")
        return sale_out(existing)
    ids = [x.id_producto for x in data.detalles]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Agrupa las cantidades del mismo producto")
    client = owned(db, Cliente, data.id_cliente, user, lock=True) if data.id_cliente else None
    if data.metodo_pago == "fiao" and not client:
        raise HTTPException(422, "El fiao requiere un cliente")
    details = []
    total = Decimal(0)
    tax = Decimal(0)
    for item in sorted(data.detalles, key=lambda x: x.id_producto):
        product = owned(db, Producto, item.id_producto, user, lock=True)
        if not product.activo:
            raise HTTPException(409, "Producto inactivo")
        changed = db.execute(
            update(Producto)
            .where(Producto.id == product.id, Producto.stock >= item.cantidad, Producto.activo.is_(True))
            .values(stock=Producto.stock - item.cantidad)
        )
        if changed.rowcount != 1:
            raise HTTPException(409, f"Stock insuficiente: {product.nombre}")
        subtotal = product.precio_venta * item.cantidad
        itbis = included_itbis(subtotal, product.tasa_itbis)
        total += subtotal
        tax += itbis
        details.append(
            DetalleVenta(
                id_producto=product.id,
                nombre=product.nombre,
                cantidad=item.cantidad,
                precio_venta=product.precio_venta,
                subtotal=subtotal,
                tasa_itbis=product.tasa_itbis,
                itbis=itbis,
            )
        )
        db.add(
            Movimiento(
                colmado_id=user.colmado_id,
                producto_id=product.id,
                usuario_id=user.id,
                cantidad=-item.cantidad,
                motivo="Venta " + ref,
            )
        )
    if total > Decimal("999999999999.99"):
        raise HTTPException(422, "Total fuera del límite permitido")
    if data.metodo_pago == "fiao":
        changed = db.execute(
            update(Cliente)
            .where(Cliente.id == client.id, Cliente.saldo + total <= Cliente.limite_credito)
            .values(saldo=Cliente.saldo + total)
        )
        if changed.rowcount != 1:
            raise HTTPException(409, "La venta supera el límite de crédito")
    obj = Venta(
        colmado_id=user.colmado_id,
        usuario_id=user.id,
        id_cliente=data.id_cliente,
        referencia=ref,
        subtotal=total - tax,
        impuesto=tax,
        total=total,
        metodo_pago=data.metodo_pago,
        detalles=details,
    )
    db.add(obj)
    db.flush()
    if data.metodo_pago == "fiao":
        db.add(
            Deuda(
                colmado_id=user.colmado_id,
                id_cliente=client.id,
                id_venta=obj.id,
                monto_total=total,
                saldo_pendiente=total,
            )
        )
    db.commit()
    db.refresh(obj)
    return sale_out(obj)


@router.get("/ventas")
def sales(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [sale_out(x) for x in page(db, Venta, user, offset, limit)]


@router.get("/ventas/exportar")
def export_sales(
    desde: date, hasta: date, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
):
    """CSV con una fila por producto vendido, listo para el proveedor de e-CF o el contador."""
    manager(user)
    start, end = period(desde, hasta)
    sales = db.scalars(
        select(Venta)
        .where(Venta.colmado_id == user.colmado_id, Venta.fecha >= start, Venta.fecha < end)
        .order_by(Venta.fecha, Venta.id)
    ).all()
    ids = {x.id_cliente for x in sales if x.id_cliente}
    clients = {c.id: c for c in db.scalars(select(Cliente).where(Cliente.id.in_(ids)))} if ids else {}
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(
        [
            "venta", "fecha", "hora", "metodo_pago", "cliente", "rnc_cedula_cliente",
            "razon_social_cliente", "producto", "cantidad", "precio_unitario",
            "tasa_itbis", "base_imponible", "itbis", "total_linea",
        ]
    )  # fmt: skip
    for sale in sales:
        local = sale.fecha.replace(tzinfo=sale.fecha.tzinfo or UTC).astimezone(DR)
        client = clients.get(sale.id_cliente)
        for d in sale.detalles:
            itbis = d.itbis if d.itbis is not None else Decimal("0.00")
            writer.writerow(
                [
                    sale.id, local.strftime("%Y-%m-%d"), local.strftime("%H:%M"), sale.metodo_pago,
                    client.nombre if client else "", (client.rnc or "") if client else "",
                    (client.razon_social or "") if client else "", d.nombre, d.cantidad,
                    f"{d.precio_venta:.2f}", "" if d.tasa_itbis is None else d.tasa_itbis,
                    f"{d.subtotal - itbis:.2f}", f"{itbis:.2f}", f"{d.subtotal:.2f}",
                ]
            )  # fmt: skip
    name = f"syscol-ventas-{desde}-{hasta}.csv"
    return Response(
        "\ufeff" + out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/ventas/{id}")
def get_sale(id: int, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    return sale_out(owned(db, Venta, id, user))


@router.get("/deudas")
def debts(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return page(db, Deuda, user, offset, limit)


@router.post("/deudas/{id}/abonos", status_code=201)
def pay(id: int, data: Payment, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.scalar(
        select(Abono).where(Abono.colmado_id == user.colmado_id, Abono.referencia == str(data.referencia))
    )
    if existing:
        if existing.id_deuda != id or existing.monto != data.monto:
            raise HTTPException(409, "Referencia utilizada para otro abono")
        return existing
    debt = owned(db, Deuda, id, user)
    client = owned(db, Cliente, debt.id_cliente, user, lock=True)
    debt = owned(db, Deuda, id, user, lock=True)
    changed = db.execute(
        update(Deuda)
        .where(Deuda.id == id, Deuda.saldo_pendiente >= data.monto)
        .values(saldo_pendiente=Deuda.saldo_pendiente - data.monto)
    )
    if changed.rowcount != 1:
        raise HTTPException(409, "El abono supera el saldo pendiente")
    db.execute(update(Cliente).where(Cliente.id == client.id).values(saldo=Cliente.saldo - data.monto))
    obj = Abono(
        colmado_id=user.colmado_id,
        id_deuda=id,
        monto=data.monto,
        referencia=str(data.referencia),
        usuario_id=user.id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/abonos")
def payments(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return page(db, Abono, user, offset, limit)


@router.get("/reportes")
def reports(
    desde: date, hasta: date, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
):
    manager(user)
    start, end = period(desde, hasta)
    conditions = (Venta.colmado_id == user.colmado_id, Venta.fecha >= start, Venta.fecha < end)
    count, total, itbis = db.execute(
        select(
            func.count(Venta.id),
            func.coalesce(func.sum(Venta.total), 0),
            func.coalesce(func.sum(Venta.impuesto), 0),
        ).where(*conditions)
    ).one()
    top = (
        db.execute(
            select(
                DetalleVenta.nombre,
                func.sum(DetalleVenta.cantidad).label("cantidad"),
                func.sum(DetalleVenta.subtotal).label("total"),
            )
            .join(Venta, Venta.id == DetalleVenta.id_venta)
            .where(*conditions)
            .group_by(DetalleVenta.id_producto, DetalleVenta.nombre)
            .order_by(func.sum(DetalleVenta.cantidad).desc())
            .limit(20)
        )
        .mappings()
        .all()
    )
    pending = db.scalar(
        select(func.coalesce(func.sum(Cliente.saldo), 0)).where(Cliente.colmado_id == user.colmado_id)
    )
    return {
        "ventas": count,
        "total": total,
        "itbis": itbis,
        "deuda_pendiente": pending,
        "productos": [dict(x) for x in top],
    }


def colmado_out(store):
    pasos = [x for x in (store.pasos_fe or "").split(",") if x in PASOS_FE]
    return {
        "id": store.id,
        "nombre": store.nombre,
        "rnc": store.rnc,
        "razon_social": store.razon_social,
        "direccion": store.direccion,
        "pasos_fe": pasos,
    }


@router.get("/colmado")
def get_store(user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    return colmado_out(db.get(Colmado, user.colmado_id))


@router.put("/colmado")
def edit_store(data: Fiscal, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    manager(user)
    store = db.get(Colmado, user.colmado_id)
    store.rnc = data.rnc
    store.razon_social = data.razon_social
    store.direccion = data.direccion
    store.pasos_fe = ",".join(x for x in PASOS_FE if x in data.pasos_fe)
    db.commit()
    db.refresh(store)
    return colmado_out(store)


@router.get("/fiscal/resumen")
def fiscal_summary(user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    """Volumen de facturas e ITBIS para decidir cómo emitir los e-CF."""
    manager(user)
    today = datetime.now(DR).date()
    start, end = period(today - timedelta(days=29), today)
    month_start, _ = period(today.replace(day=1), today)
    mine = Venta.colmado_id == user.colmado_id
    last_30 = db.scalar(select(func.count(Venta.id)).where(mine, Venta.fecha >= start, Venta.fecha < end))
    rows = db.execute(
        select(
            DetalleVenta.tasa_itbis,
            func.coalesce(func.sum(DetalleVenta.subtotal), 0),
            func.coalesce(func.sum(DetalleVenta.itbis), 0),
        )
        .join(Venta, Venta.id == DetalleVenta.id_venta)
        .where(mine, Venta.fecha >= month_start, Venta.fecha < end)
        .group_by(DetalleVenta.tasa_itbis)
        .order_by(DetalleVenta.tasa_itbis.desc())
    ).all()
    with_rnc = db.scalar(
        select(func.count(Venta.id))
        .join(Cliente, Cliente.id == Venta.id_cliente)
        .where(mine, Venta.fecha >= start, Venta.fecha < end, Cliente.rnc.is_not(None))
    )
    return {
        "ventas_30_dias": last_30,
        "limite_facturador_gratuito": LIMITE_FACTURADOR_GRATUITO,
        "recomendacion": "facturador_gratuito" if last_30 <= LIMITE_FACTURADOR_GRATUITO else "proveedor",
        "ventas_con_rnc_30_dias": with_rnc,
        "mes": {
            "desde": today.replace(day=1).isoformat(),
            "por_tasa": [
                {"tasa": rate, "total": total, "base": total - tax, "itbis": tax}
                for rate, total, tax in rows
            ],
            "itbis": sum((tax for _, _, tax in rows), Decimal("0.00")),
        },
    }


@router.get("/whatsapp/{id}")
def reminder(id: int, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    client = owned(db, Cliente, id, user)
    if not client.consentimiento_whatsapp:
        raise HTTPException(409, "El cliente no ha autorizado recordatorios")
    if client.saldo <= 0:
        raise HTTPException(409, "El cliente no tiene saldo pendiente")
    message = f"Hola {client.nombre}, te recordamos tu saldo pendiente de RD$ {client.saldo:.2f}. Gracias."
    return {
        "modo": "manual",
        "mensaje": message,
        "url": "https://wa.me/" + client.telefono.lstrip("+") + "?text=" + quote(message),
    }


@router.get("/avisos")
def notices(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models import Aviso

    manager(user)
    return page(db, Aviso, user, offset, limit)
