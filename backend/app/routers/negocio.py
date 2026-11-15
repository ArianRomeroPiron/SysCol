from datetime import UTC, date, datetime, time, timedelta, timezone
from decimal import Decimal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Abono,
    Categoria,
    Cliente,
    DetalleVenta,
    Deuda,
    Movimiento,
    Producto,
    Usuario,
    Venta,
)
from app.schemas.negocio import Category, Customer, Payment, Product, Sale, Stock, Void

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
    id_categoria: int | None = Query(None, gt=0),
    activo: bool | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Producto).where(Producto.colmado_id == user.colmado_id)
    if q:
        query = query.where(Producto.nombre.ilike("%" + q + "%") | (Producto.codigo_barras == q))
    if bajo_stock:
        query = query.where(Producto.stock <= Producto.stock_minimo, Producto.activo.is_(True))
    if id_categoria:
        query = query.where(Producto.id_categoria == id_categoria)
    if activo is not None:
        query = query.where(Producto.activo.is_(activo))
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
    producto_id: int | None = Query(None, gt=0),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    manager(user)
    query = select(Movimiento).where(Movimiento.colmado_id == user.colmado_id)
    if producto_id:
        query = query.where(Movimiento.producto_id == producto_id)
    return db.scalars(query.order_by(Movimiento.id.desc()).offset(offset).limit(limit)).all()


@router.get("/clientes")
def customers(
    q: str = Query("", max_length=160),
    con_deuda: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Cliente).where(Cliente.colmado_id == user.colmado_id)
    if q:
        query = query.where(Cliente.nombre.ilike("%" + q + "%") | Cliente.telefono.contains(q))
    order = (Cliente.nombre, Cliente.id)
    if con_deuda:
        query = query.where(Cliente.saldo > 0)
        order = (Cliente.saldo.desc(), Cliente.id)
    return db.scalars(query.order_by(*order).offset(offset).limit(limit)).all()


@router.get("/fiao/resumen")
def credit_summary(user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    count, total = db.execute(
        select(func.count(Cliente.id), func.coalesce(func.sum(Cliente.saldo), 0)).where(
            Cliente.colmado_id == user.colmado_id, Cliente.saldo > 0
        )
    ).one()
    return {"clientes": count, "total": total}


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


def sales_out(db, rows):
    """Serialize sales with the customer and seller names used by receipts and history."""
    rows = list(rows)
    if not rows:
        return []
    store = rows[0].colmado_id
    user_ids = {x.usuario_id for x in rows} | {x.anulada_por for x in rows if x.anulada_por}
    client_ids = {x.id_cliente for x in rows if x.id_cliente}
    users = dict(
        db.execute(
            select(Usuario.id, Usuario.nombre).where(Usuario.colmado_id == store, Usuario.id.in_(user_ids))
        ).all()
    )
    clients = (
        dict(
            db.execute(
                select(Cliente.id, Cliente.nombre).where(Cliente.colmado_id == store, Cliente.id.in_(client_ids))
            ).all()
        )
        if client_ids
        else {}
    )
    return [
        {
            **{c.name: getattr(obj, c.name) for c in Venta.__table__.columns},
            "detalles": obj.detalles,
            "cliente": clients.get(obj.id_cliente),
            "vendedor": users.get(obj.usuario_id),
            "anulada_por_nombre": users.get(obj.anulada_por),
        }
        for obj in rows
    ]


def sale_out(db, obj):
    return sales_out(db, [obj])[0]


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
        return sale_out(db, existing)
    ids = [x.id_producto for x in data.detalles]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Agrupa las cantidades del mismo producto")
    client = owned(db, Cliente, data.id_cliente, user, lock=True) if data.id_cliente else None
    if data.metodo_pago == "fiao" and not client:
        raise HTTPException(422, "El fiao requiere un cliente")
    details = []
    total = Decimal(0)
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
        total += subtotal
        details.append(
            DetalleVenta(
                id_producto=product.id,
                nombre=product.nombre,
                cantidad=item.cantidad,
                precio_venta=product.precio_venta,
                subtotal=subtotal,
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
        subtotal=total,
        impuesto=0,
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
    return sale_out(db, obj)


@router.get("/ventas")
def sales(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sales_out(db, page(db, Venta, user, offset, limit))


@router.get("/ventas/{id}")
def get_sale(id: int, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    return sale_out(db, owned(db, Venta, id, user))


@router.post("/ventas/{id}/anular")
def void_sale(id: int, data: Void, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    """Void a whole sale: return stock and cancel unpaid credit, keeping every record."""
    manager(user)
    obj = owned(db, Venta, id, user, lock=True)
    if obj.anulada_en is not None:
        raise HTTPException(409, "La venta ya estaba anulada")
    if obj.metodo_pago == "fiao":
        # Same lock order as sales and payments: customer before debt.
        owned(db, Cliente, obj.id_cliente, user, lock=True)
        changed = db.execute(
            update(Deuda)
            .where(
                Deuda.id_venta == obj.id,
                Deuda.colmado_id == user.colmado_id,
                Deuda.saldo_pendiente == Deuda.monto_total,
            )
            .values(saldo_pendiente=0)
        )
        if changed.rowcount != 1:
            raise HTTPException(409, "La venta tiene abonos registrados; no se puede anular")
        changed = db.execute(
            update(Cliente)
            .where(Cliente.id == obj.id_cliente, Cliente.saldo >= obj.total)
            .values(saldo=Cliente.saldo - obj.total)
        )
        if changed.rowcount != 1:
            raise HTTPException(409, "El saldo del cliente no coincide con la deuda")
    for item in sorted(obj.detalles, key=lambda x: x.id_producto):
        owned(db, Producto, item.id_producto, user, lock=True)
        db.execute(
            update(Producto).where(Producto.id == item.id_producto).values(stock=Producto.stock + item.cantidad)
        )
        db.add(
            Movimiento(
                colmado_id=user.colmado_id,
                producto_id=item.id_producto,
                usuario_id=user.id,
                cantidad=item.cantidad,
                motivo=f"Anulación venta #{obj.id}"[:200],
            )
        )
    obj.anulada_en = func.now()
    obj.anulada_por = user.id
    obj.motivo_anulacion = data.motivo
    db.commit()
    db.refresh(obj)
    return sale_out(db, obj)


@router.get("/deudas")
def debts(
    pendientes: bool = False,
    id_cliente: int | None = Query(None, gt=0),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        select(Deuda, Cliente.nombre)
        .join(Cliente, Cliente.id == Deuda.id_cliente)
        .where(Deuda.colmado_id == user.colmado_id)
    )
    if pendientes:
        query = query.where(Deuda.saldo_pendiente > 0)
    if id_cliente:
        query = query.where(Deuda.id_cliente == id_cliente)
    order = Deuda.id.asc() if id_cliente else Deuda.id.desc()
    rows = db.execute(query.order_by(order).offset(offset).limit(limit)).all()
    return [
        {**{c.name: getattr(debt, c.name) for c in Deuda.__table__.columns}, "cliente": name}
        for debt, name in rows
    ]


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
    id_cliente: int | None = Query(None, gt=0),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        select(Abono, Deuda.id_cliente, Cliente.nombre)
        .join(Deuda, Deuda.id == Abono.id_deuda)
        .join(Cliente, Cliente.id == Deuda.id_cliente)
        .where(Abono.colmado_id == user.colmado_id)
    )
    if id_cliente:
        query = query.where(Deuda.id_cliente == id_cliente)
    rows = db.execute(query.order_by(Abono.id.desc()).offset(offset).limit(limit)).all()
    return [
        {
            **{c.name: getattr(obj, c.name) for c in Abono.__table__.columns},
            "id_cliente": client_id,
            "cliente": name,
        }
        for obj, client_id, name in rows
    ]


@router.get("/reportes")
def reports(
    desde: date, hasta: date, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
):
    manager(user)
    if hasta == date.max or hasta < desde or (hasta - desde).days > 366:
        raise HTTPException(422, "Selecciona un período de hasta 366 días")
    # Reporting days use Dominican time, independent of the database session zone.
    local = timezone(timedelta(hours=-4))
    start = datetime.combine(desde, time.min, local).astimezone(UTC)
    end = datetime.combine(hasta + timedelta(days=1), time.min, local).astimezone(UTC)
    period = (Venta.colmado_id == user.colmado_id, Venta.fecha >= start, Venta.fecha < end)
    conditions = (*period, Venta.anulada_en.is_(None))
    count, total = db.execute(
        select(func.count(Venta.id), func.coalesce(func.sum(Venta.total), 0)).where(*conditions)
    ).one()
    methods = db.execute(
        select(Venta.metodo_pago, func.count(Venta.id), func.coalesce(func.sum(Venta.total), 0))
        .where(*conditions)
        .group_by(Venta.metodo_pago)
    ).all()
    voided = db.scalar(select(func.count(Venta.id)).where(*period, Venta.anulada_en.is_not(None)))
    paid = db.scalar(
        select(func.coalesce(func.sum(Abono.monto), 0)).where(
            Abono.colmado_id == user.colmado_id, Abono.fecha >= start, Abono.fecha < end
        )
    )
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
        "deuda_pendiente": pending,
        "abonos": paid,
        "anuladas": voided,
        "por_metodo": [{"metodo": m, "ventas": n, "total": t} for m, n, t in methods],
        "productos": [dict(x) for x in top],
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
