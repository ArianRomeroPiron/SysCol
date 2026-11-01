from decimal import Decimal
from urllib.error import URLError

from sqlalchemy import select
from test_business import account, sale, setup

from app.core.config import settings
from app.models import Aviso
from app.services.whatsapp_service import run


def test_disabled_reminders_never_connect():
    def forbidden():
        raise AssertionError("Must not access database or provider")

    assert run(factory=forbidden, sender=forbidden)["modo"] == "desactivado"


def test_reminders_claim_once_and_handle_uncertain_send(api, monkeypatch):
    h = account(api)
    p, c = setup(api, h)
    assert api.post("/ventas", headers=h, json=sale(p, c)).status_code == 201
    for name in ("twilio_account_sid", "twilio_auth_token", "twilio_whatsapp_number", "twilio_content_sid"):
        monkeypatch.setattr(settings, name, "fake-test-value")
    monkeypatch.setattr(settings, "whatsapp_enabled", True)
    calls = []

    def sender(*args):
        calls.append(args)
        raise URLError("Simulated timeout")

    assert run(api.db_factory, sender)["aceptados"] == 0
    assert run(api.db_factory, sender)["aceptados"] == 0
    assert len(calls) == 1
    assert calls[0][3] == Decimal("71.00")
    with api.db_factory() as db:
        assert db.scalar(select(Aviso)).estado == "desconocido"
