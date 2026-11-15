from datetime import datetime, timedelta, timezone
from uuid import uuid4

from test_business import account, sale, setup


def today():
    return datetime.now(timezone(timedelta(hours=-4))).date().isoformat()


def login(api, email, password):
    r = api.post("/auth/login", data={"username": email, "password": password})
    return r.status_code, {"Authorization": "Bearer " + r.json().get("access_token", "")}


def test_void_cash_sale_returns_stock_and_leaves_reports(api):
    h = account(api)
    p, _ = setup(api, h)
    created = api.post("/ventas", headers=h, json=sale(p, quantity=3)).json()
    assert created["vendedor"] == "Arian"
    assert api.get("/productos", headers=h).json()[0]["stock"] == 7

    assert api.post(f"/ventas/{created['id']}/anular", headers=h, json={"motivo": "x"}).status_code == 422
    r = api.post(f"/ventas/{created['id']}/anular", headers=h, json={"motivo": "Error de cobro"})
    assert r.status_code == 200, r.text
    assert r.json()["anulada_en"] is not None
    assert r.json()["anulada_por_nombre"] == "Arian"
    assert api.get("/productos", headers=h).json()[0]["stock"] == 10
    again = api.post(f"/ventas/{created['id']}/anular", headers=h, json={"motivo": "Error de cobro"})
    assert again.status_code == 409

    moves = api.get(f"/movimientos?producto_id={p}", headers=h).json()
    assert [m["cantidad"] for m in moves[:2]] == [3, -3]

    report = api.get("/reportes", headers=h, params={"desde": today(), "hasta": today()}).json()
    assert report["ventas"] == 0
    assert float(report["total"]) == 0
    assert report["anuladas"] == 1
    assert report["productos"] == []

    other = account(api, "other@example.com")
    assert api.post(f"/ventas/{created['id']}/anular", headers=other, json={"motivo": "Ajeno"}).status_code == 404


def test_void_credit_sale_only_without_payments(api):
    h = account(api)
    p, c = setup(api, h)
    first = api.post("/ventas", headers=h, json=sale(p, c, 1)).json()
    second = api.post("/ventas", headers=h, json=sale(p, c, 2)).json()
    assert second["cliente"] == "Ana"
    debts = {d["id_venta"]: d for d in api.get("/deudas", headers=h).json()}
    assert debts[first["id"]]["cliente"] == "Ana"

    pay = {"referencia": str(uuid4()), "monto": "5.00"}
    assert api.post(f"/deudas/{debts[second['id']]['id']}/abonos", headers=h, json=pay).status_code == 201
    blocked = api.post(f"/ventas/{second['id']}/anular", headers=h, json={"motivo": "Devolución"})
    assert blocked.status_code == 409
    assert api.get("/productos", headers=h).json()[0]["stock"] == 7

    r = api.post(f"/ventas/{first['id']}/anular", headers=h, json={"motivo": "Cliente equivocado"})
    assert r.status_code == 200, r.text
    customer = api.get("/clientes", headers=h).json()[0]
    assert float(customer["saldo"]) == 71 - 5
    pending = api.get("/deudas?pendientes=true", headers=h).json()
    assert [d["id_venta"] for d in pending] == [second["id"]]
    assert api.get("/productos", headers=h).json()[0]["stock"] == 8


def test_cashier_cannot_void(api):
    h = account(api)
    p, _ = setup(api, h)
    data = {"nombre": "Caja", "email": "caja@example.com", "password": "correct-horse-123"}
    assert api.post("/auth/usuarios", headers=h, json=data).status_code == 201
    _, cashier = login(api, data["email"], data["password"])
    created = api.post("/ventas", headers=cashier, json=sale(p)).json()
    assert created["vendedor"] == "Caja"
    r = api.post(f"/ventas/{created['id']}/anular", headers=cashier, json={"motivo": "Me equivoqué"})
    assert r.status_code == 403
    assert api.get("/productos", headers=h).json()[0]["stock"] == 8


def test_employee_role_and_password_management(api):
    h = account(api)
    me = api.get("/auth/me", headers=h).json()
    assert me["colmado"] == "La Esquina"
    data = {"nombre": "Luis", "email": "luis@example.com", "password": "correct-horse-123"}
    emp = api.post("/auth/usuarios", headers=h, json=data).json()
    url = f"/auth/usuarios/{emp['id']}"

    assert api.patch(url, headers=h, json={}).status_code == 422
    assert api.patch(url, headers=h, json={"rol": "dueno"}).status_code == 422
    assert api.patch(url, headers=h, json={"password": "short"}).status_code == 422
    r = api.patch(url, headers=h, json={"rol": "admin", "password": "new-horse-battery-9"})
    assert r.status_code == 200, r.text
    assert r.json()["rol"] == "admin"
    assert login(api, data["email"], data["password"])[0] == 401
    status, admin = login(api, data["email"], "new-horse-battery-9")
    assert status == 200
    assert api.post("/categorias", headers=admin, json={"nombre": "Bebidas"}).status_code == 201
    # Only the owner manages staff, and the owner account cannot be changed there.
    assert api.patch(url, headers=admin, json={"rol": "cajero"}).status_code == 403
    assert api.patch(f"/auth/usuarios/{me['id']}", headers=h, json={"rol": "admin"}).status_code == 409
    other = account(api, "other@example.com")
    assert api.patch(url, headers=other, json={"rol": "cajero"}).status_code == 404


def test_change_own_password(api):
    h = account(api)
    bad = {"actual": "wrong-password-1", "nueva": "another-horse-456"}
    assert api.post("/auth/password", headers=h, json=bad).status_code == 409
    short = {"actual": "correct-horse-123", "nueva": "short"}
    assert api.post("/auth/password", headers=h, json=short).status_code == 422
    ok = {"actual": "correct-horse-123", "nueva": "another-horse-456"}
    assert api.post("/auth/password", headers=h, json=ok).status_code == 204
    assert login(api, "owner@example.com", "correct-horse-123")[0] == 401
    assert login(api, "owner@example.com", "another-horse-456")[0] == 200


def test_credit_views_filters_and_report_breakdown(api):
    h = account(api)
    p, c = setup(api, h)
    api.post(
        "/clientes", headers=h, json={"nombre": "Beto", "telefono": "+18095550000", "limite_credito": "0"}
    )
    assert api.post("/ventas", headers=h, json=sale(p, c, 2)).status_code == 201
    assert api.post("/ventas", headers=h, json=sale(p, quantity=1)).status_code == 201

    owing = api.get("/clientes?con_deuda=true", headers=h).json()
    assert [x["nombre"] for x in owing] == ["Ana"]
    summary = api.get("/fiao/resumen", headers=h).json()
    assert summary["clientes"] == 1
    assert float(summary["total"]) == 71

    debt = api.get(f"/deudas?id_cliente={c}&pendientes=true", headers=h).json()[0]
    pay = {"referencia": str(uuid4()), "monto": "71"}
    assert api.post(f"/deudas/{debt['id']}/abonos", headers=h, json=pay).status_code == 201
    assert api.get("/deudas?pendientes=true", headers=h).json() == []
    payments = api.get(f"/abonos?id_cliente={c}", headers=h).json()
    assert payments[0]["cliente"] == "Ana"
    assert float(api.get("/fiao/resumen", headers=h).json()["total"]) == 0

    report = api.get("/reportes", headers=h, params={"desde": today(), "hasta": today()}).json()
    methods = {x["metodo"]: (x["ventas"], float(x["total"])) for x in report["por_metodo"]}
    assert methods == {"fiao": (1, 71.0), "efectivo": (1, 35.5)}
    assert float(report["abonos"]) == 71

    sales = api.get("/ventas", headers=h).json()
    assert {s["cliente"] for s in sales} == {"Ana", None}

    cat = api.post("/categorias", headers=h, json={"nombre": "Bebidas"}).json()
    soda = {"nombre": "Refresco", "id_categoria": cat["id"], "precio_compra": "20", "precio_venta": "30"}
    soda["activo"] = False
    assert api.post("/productos", headers=h, json=soda).status_code == 201
    assert [x["nombre"] for x in api.get(f"/productos?id_categoria={cat['id']}", headers=h).json()] == [
        "Refresco"
    ]
    assert [x["nombre"] for x in api.get("/productos?activo=true", headers=h).json()] == ["Arroz"]
