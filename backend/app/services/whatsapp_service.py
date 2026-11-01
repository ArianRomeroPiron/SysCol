"""Run daily via python -m app.services.whatsapp_service. Disabled by default."""

import base64
import json
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Aviso, Cliente, Colmado


def send_template(phone, name, store, balance):
    sid = settings.twilio_account_sid
    credentials = base64.b64encode(f"{sid}:{settings.twilio_auth_token}".encode()).decode()
    payload = urlencode(
        {
            "To": "whatsapp:" + phone,
            "From": settings.twilio_whatsapp_number,
            "ContentSid": settings.twilio_content_sid,
            "ContentVariables": json.dumps({"1": name, "2": store, "3": f"{balance:.2f}"}),
        }
    )
    request = Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        data=payload.encode(),
        headers={"Authorization": "Basic " + credentials},
    )
    with urlopen(request, timeout=15) as response:
        return json.load(response)["sid"]


def run(factory=SessionLocal, sender=send_template):
    if not settings.whatsapp_enabled:
        return {"modo": "desactivado", "aceptados": 0}
    if not all(
        (
            settings.twilio_account_sid,
            settings.twilio_auth_token,
            settings.twilio_whatsapp_number,
            settings.twilio_content_sid,
        )
    ):
        raise RuntimeError("Configura el proveedor y una plantilla aprobada antes de activar envíos")
    day = datetime.now(timezone(timedelta(hours=-4))).date().isoformat()
    last = 0
    accepted = 0
    while True:
        with factory() as db:
            ids = db.scalars(
                select(Cliente.id)
                .where(Cliente.id > last, Cliente.saldo > 0, Cliente.consentimiento_whatsapp.is_(True))
                .order_by(Cliente.id)
                .limit(100)
            ).all()
        if not ids:
            break
        for id in ids:
            last = id
            with factory() as db:
                client = db.get(Cliente, id)
                if not client.consentimiento_whatsapp or client.saldo <= 0:
                    continue
                store = db.get(Colmado, client.colmado_id)
                args = (client.telefono, client.nombre, store.nombre, client.saldo)
                aviso = Aviso(colmado_id=client.colmado_id, cliente_id=id, dia=day, estado="enviando")
                db.add(aviso)
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    continue
                aviso_id = aviso.id
            # Claim is committed before sending: never automatically resend an uncertain delivery.
            state, provider_id = "desconocido", None
            try:
                provider_id = sender(*args)
                state = "aceptado"
                accepted += 1
            except HTTPError:
                state = "rechazado"
            except (URLError, TimeoutError, OSError, ValueError, KeyError):
                state = "desconocido"
            with factory() as db:
                aviso = db.get(Aviso, aviso_id)
                aviso.estado, aviso.proveedor_id = state, provider_id
                db.commit()
    return {"modo": "automatico", "aceptados": accepted}


if __name__ == "__main__":
    print(json.dumps(run()))
