from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

pwd_context = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password_plano: str, password_hasheado: str) -> bool:
    try:
        if password_hasheado.startswith("$2"):
            import bcrypt

            return bcrypt.checkpw(password_plano.encode(), password_hasheado.encode())
        return pwd_context.verify(password_plano, password_hasheado)
    except (ValueError, TypeError):
        return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expira = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expira})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
