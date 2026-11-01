import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from test_business import account, sale, setup


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="Requires real PostgreSQL")
def test_concurrent_sales_never_oversell(api):
    headers = account(api)
    product, _ = setup(api, headers)

    def buy(_):
        return api.post("/ventas", headers=headers, json=sale(product, quantity=1)).status_code

    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(buy, range(30)))
    assert results.count(201) == 10, results
    assert results.count(409) == 20, results
    assert api.get("/productos", headers=headers).json()[0]["stock"] == 0
    assert len(api.get("/ventas", headers=headers).json()) == 10


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="Requires real PostgreSQL")
def test_concurrent_payments_do_not_overpay(api):
    from uuid import uuid4

    headers = account(api)
    product, customer = setup(api, headers)
    assert api.post("/ventas", headers=headers, json=sale(product, customer)).status_code == 201
    debt = api.get("/deudas", headers=headers).json()[0]

    def pay(_):
        return api.post(
            f"/deudas/{debt['id']}/abonos", headers=headers, json={"referencia": str(uuid4()), "monto": "10"}
        ).status_code

    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(pay, range(20)))
    assert results.count(201) == 7, results
    assert results.count(409) == 13, results
    assert float(api.get("/deudas", headers=headers).json()[0]["saldo_pendiente"]) == 1
    assert float(api.get("/clientes", headers=headers).json()[0]["saldo"]) == 1
