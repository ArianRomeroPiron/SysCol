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
