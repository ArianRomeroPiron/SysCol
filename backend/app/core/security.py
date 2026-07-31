from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password_plano: str, password_hasheado: str) -> bool:
    return pwd_context.verify(password_plano, password_hasheado)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expira = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    to_encode.update({"exp": expira})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None