import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.usuario import Usuario

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Usuario:
    credenciales_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm], options={"require": ["exp", "sub"]}
        )
        email: str = payload.get("sub")
        if email is None:
            raise credenciales_invalidas
    except InvalidTokenError:
        raise credenciales_invalidas from None

    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if usuario is None or not usuario.esta_activo:
        raise credenciales_invalidas
    return usuario
