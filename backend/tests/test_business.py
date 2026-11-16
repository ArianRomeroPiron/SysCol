from decimal import Decimal
from uuid import uuid4


def account(api, email="owner@example.com"):
    r = api.post(
        "/auth/register",
        json={"nombre": "Arian", "colmado": "La Esquina", "email": email, "password": "correct-horse-123"},
    )
    assert r.status_code == 201, r.text
    token = api.post("/auth/login", data={"username": email, "password": "correct-horse-123"}).json()[
        "access_token"
    ]
    return {"Authorization": "Bearer " + token}


def setup(api, headers):
    cat = api.post("/categorias", headers=headers, json={"nombre": "Alimentos"}).json()
    r = api.post(
        "/productos",
        headers=headers,
        json={
            "nombre": "Arroz",
            "id_categoria": cat["id"],
            "precio_compra": "20.10",
            "precio_venta": "35.50",
        },
    )
    assert r.status_code == 201, r.text
    product = r.json()
    assert (
        api.post(
            f"/productos/{product['id']}/stock",
            headers=headers,
            json={"cantidad": 10, "motivo": "Compra inicial"},
        ).status_code
        == 200
    )
    customer = api.post(
        "/clientes",
        headers=headers,
        json={
            "nombre": "Ana",
            "telefono": "+18095551234",
            "limite_credito": "200",
            "consentimiento_whatsapp": True,
        },
    ).json()
    return product["id"], customer["id"]


def sale(product, customer=None, quantity=2, ref=None):
    return {
        "referencia": ref or str(uuid4()),
        "metodo_pago": "fiao" if customer else "efectivo",
        "id_cliente": customer,
        "detalles": [{"id_producto": product, "cantidad": quantity}],
    }


def test_sale_credit_payment_and_reports(api):
    h = account(api)
    p, c = setup(api, h)
    data = sale(p, c)
    r = api.post("/ventas", headers=h, json=data)
    assert r.status_code == 201, r.text
    assert float(r.json()["total"]) == 71
    assert api.post("/ventas", headers=h, json=data).json()["id"] == r.json()["id"]
    assert api.get("/productos", headers=h).json()[0]["stock"] == 8
    debt = api.get("/deudas", headers=h).json()[0]
    pay = {"referencia": str(uuid4()), "monto": "21.00"}
    url = f"/deudas/{debt['id']}/abonos"
    assert api.post(url, headers=h, json=pay).status_code == 201
    assert api.post(url, headers=h, json=pay).status_code == 201
    assert float(api.get("/clientes", headers=h).json()[0]["saldo"]) == 50
    assert api.post(url, headers=h, json={"referencia": str(uuid4()), "monto": "51"}).status_code == 409
    assert api.get(f"/whatsapp/{c}", headers=h).json()["url"].startswith("https://wa.me/18095551234")
    from datetime import datetime, timedelta, timezone

    today = datetime.now(timezone(timedelta(hours=-4))).date().isoformat()
    report = api.get("/reportes", headers=h, params={"desde": today, "hasta": today}).json()
    assert report["ventas"] == 1
    assert float(report["total"]) == 71
    assert float(report["deuda_pendiente"]) == 50


def test_rejections_rollback_and_isolation(api):
    h = account(api)
    p, c = setup(api, h)
    assert api.post("/ventas", headers=h, json=sale(p, c, 6)).status_code == 409
    assert api.get("/productos", headers=h).json()[0]["stock"] == 10
    assert api.post("/ventas", headers=h, json=sale(p, quantity=11)).status_code == 409
    data = sale(p)
    data["detalles"][0]["precio_venta"] = "0.01"
    assert api.post("/ventas", headers=h, json=data).status_code == 422
    data = sale(p)
    data["detalles"].append(data["detalles"][0])
    assert api.post("/ventas", headers=h, json=data).status_code == 422
    other = account(api, "other@example.com")
    assert api.get("/productos", headers=other).json() == []
    assert api.post("/ventas", headers=other, json=sale(p)).status_code == 404
    assert api.get(f"/whatsapp/{c}", headers=other).status_code == 404
    assert api.get("/productos").status_code == 401


def test_roles_and_disabled_user(api):
    h = account(api)
    data = {"nombre": "Cajero", "email": "cashier@example.com", "password": "correct-horse-123"}
    emp = api.post("/auth/usuarios", headers=h, json=data).json()
    token = api.post("/auth/login", data={"username": data["email"], "password": data["password"]}).json()[
        "access_token"
    ]
    cashier = {"Authorization": "Bearer " + token}
    assert api.post("/categorias", headers=cashier, json={"nombre": "No"}).status_code == 403
    assert api.post("/auth/usuarios", headers=cashier, json=data).status_code == 403
    assert api.patch(f"/auth/usuarios/{emp['id']}/estado?activo=false", headers=h).status_code == 200
    assert api.get("/auth/me", headers=cashier).status_code == 401
    data.update({"colmado": "Bad", "rol": "admin"})
    assert api.post("/auth/register", json=data).status_code == 422


def test_pagination_and_input_validation(api):
    h = account(api)
    assert (
        api.post(
            "/auth/register",
            json={
                "nombre": "Test",
                "colmado": "x" * 121,
                "email": "invalid-length@example.com",
                "password": "correct-horse-123",
            },
        ).status_code
        == 422
    )
    assert api.get("/reportes?desde=9999-12-31&hasta=9999-12-31", headers=h).status_code == 422
    assert api.get("/productos?limit=201", headers=h).status_code == 422
    assert api.post("/clientes", headers=h, json={"nombre": "", "telefono": "abc"}).status_code == 422
    assert api.get("/reportes?desde=2026-10-31&hasta=2026-10-01", headers=h).status_code == 422


def test_search_finds_customers_beyond_first_page(api):
    from app.models import Cliente

    h = account(api)
    store = api.get("/auth/me", headers=h).json()["colmado_id"]
    with api.db_factory() as db:
        db.add_all(
            Cliente(colmado_id=store, nombre=f"Cliente {i:04}", telefono="+18095551234") for i in range(250)
        )
        db.commit()
    assert len(api.get("/clientes?limit=200", headers=h).json()) == 200
    found = api.get("/clientes?q=Cliente%200249", headers=h).json()
    assert len(found) == 1
    assert found[0]["nombre"] == "Cliente 0249"


def test_search_ignores_case_accents_and_wildcards(api):
    h = account(api)
    cat = api.post("/categorias", headers=h, json={"nombre": "Víveres"}).json()
    for name, code in (("Café Molido", "7461234500017"), ("Azúcar crema", None), ("Jabón 100%", None)):
        r = api.post(
            "/productos",
            headers=h,
            json={
                "nombre": name,
                "id_categoria": cat["id"],
                "codigo_barras": code,
                "precio_compra": "10",
                "precio_venta": "15",
            },
        )
        assert r.status_code == 201, r.text
    names = lambda q: [p["nombre"] for p in api.get("/productos", params={"q": q}, headers=h).json()]  # noqa: E731
    assert names("cafe") == ["Café Molido"]
    assert names("AZUCAR") == ["Azúcar crema"]
    assert names("74612345") == ["Café Molido"]
    assert names("100%") == ["Jabón 100%"]
    assert names("%") == ["Jabón 100%"]
    assert len(names("  ")) == 3
    api.post("/clientes", headers=h, json={"nombre": "José Núñez", "telefono": "+18095550000"})
    found = api.get("/clientes", params={"q": "jose nunez"}, headers=h).json()
    assert [c["nombre"] for c in found] == ["José Núñez"]
    assert len(api.get("/clientes", params={"q": "555000"}, headers=h).json()) == 1


def test_itbis_fiscal_data_summary_and_export(api):
    from datetime import date

    h = account(api)
    cat = api.post("/categorias", headers=h, json={"nombre": "Víveres"}).json()

    def product(name, price, rate):
        r = api.post(
            "/productos",
            headers=h,
            json={
                "nombre": name,
                "id_categoria": cat["id"],
                "precio_compra": "1",
                "precio_venta": price,
                "tasa_itbis": rate,
            },
        )
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        api.post(f"/productos/{pid}/stock", headers=h, json={"cantidad": 50, "motivo": "Compra"})
        return pid

    soda = product("Refresco", "118.00", 18)
    rice = product("Arroz", "50.00", 0)
    assert api.post(
        "/productos",
        headers=h,
        json={"nombre": "X", "id_categoria": cat["id"], "precio_compra": "1", "precio_venta": "1", "tasa_itbis": 12},
    ).status_code == 422

    # Datos fiscales del cliente: acepta guiones, rechaza longitudes inválidas.
    bad = {"nombre": "Ferretería", "telefono": "+18095550000", "rnc": "1234"}
    assert api.post("/clientes", headers=h, json=bad).status_code == 422
    client = api.post(
        "/clientes",
        headers=h,
        json={"nombre": "Ferretería", "telefono": "+18095550000", "rnc": "1-01-23456-7", "razon_social": "Ferretería SRL"},
    ).json()
    assert client["rnc"] == "101234567"

    sale = api.post(
        "/ventas",
        headers=h,
        json={
            "referencia": str(uuid4()),
            "metodo_pago": "efectivo",
            "id_cliente": client["id"],
            "detalles": [{"id_producto": soda, "cantidad": 2}, {"id_producto": rice, "cantidad": 1}],
        },
    ).json()
    assert Decimal(sale["total"]) == Decimal("286.00")
    assert Decimal(sale["impuesto"]) == Decimal("36.00")  # 236 * 18/118
    assert Decimal(sale["subtotal"]) == Decimal("250.00")
    lines = {d["nombre"]: d for d in sale["detalles"]}
    assert (lines["Refresco"]["tasa_itbis"], Decimal(lines["Refresco"]["itbis"])) == (18, Decimal("36.00"))
    assert (lines["Arroz"]["tasa_itbis"], Decimal(lines["Arroz"]["itbis"])) == (0, Decimal("0.00"))

    today = date.today().isoformat()
    report = api.get(f"/reportes?desde={today}&hasta={today}", headers=h)
    if report.json()["ventas"]:  # el día dominicano puede diferir del día UTC del servidor
        assert Decimal(report.json()["itbis"]) == Decimal("36.00")

    # Datos fiscales del colmado y pasos de incorporación.
    assert api.get("/colmado", headers=h).json()["pasos_fe"] == []
    assert api.put("/colmado", headers=h, json={"rnc": "12345"}).status_code == 422
    store = api.put(
        "/colmado",
        headers=h,
        json={"rnc": "401-00000-1", "razon_social": "La Esquina SRL", "pasos_fe": ["certificado", "rnc"]},
    ).json()
    assert store["rnc"] == "401000001"
    assert store["pasos_fe"] == ["rnc", "certificado"]

    summary = api.get("/fiscal/resumen", headers=h).json()
    assert summary["ventas_30_dias"] == 1
    assert summary["recomendacion"] == "facturador_gratuito"
    assert summary["ventas_con_rnc_30_dias"] == 1
    assert Decimal(str(summary["mes"]["itbis"])) == Decimal("36.00")

    export = api.get(f"/ventas/exportar?desde=2026-01-01&hasta={date.today().isoformat()}", headers=h)
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    rows = export.text.lstrip("\ufeff").splitlines()
    assert rows[0].startswith("venta,fecha,hora,metodo_pago")
    assert len(rows) == 3
    assert "101234567" in rows[1] and "Ferretería SRL" in rows[1]

    cashier = {"nombre": "Caja", "email": "caja@example.com", "password": "correct-horse-123", "rol": "cajero"}
    api.post("/auth/usuarios", headers=h, json=cashier)
    token = api.post("/auth/login", data={"username": "caja@example.com", "password": "correct-horse-123"}).json()
    ch = {"Authorization": "Bearer " + token["access_token"]}
    assert api.get("/ventas/exportar?desde=2026-01-01&hasta=2026-01-02", headers=ch).status_code == 403
    assert api.put("/colmado", headers=ch, json={}).status_code == 403
