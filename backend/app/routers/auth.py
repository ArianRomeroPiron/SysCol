from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut, Token, LoginRequest
from app.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/register", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def register(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    existe = db.query(Usuario).filter(Usuario.email == usuario.email).first()
    if existe:
        raise HTTPException(status_code=400, detail="Email ya registrado")

    nuevo_usuario = Usuario(
        nombre=usuario.nombre,
        email=usuario.email,
        hashed_password=hash_password(usuario.password),
        rol=usuario.rol,
        esta_activo=True,
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    return nuevo_usuario


@router.post("/login", response_model=Token)
def login(credenciales: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.email == credenciales.email).first()

    if not user or not verify_password(credenciales.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )

    if not user.esta_activo:
        raise HTTPException(status_code=403, detail="Usuario inactivo")

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UsuarioOut)
def me(current_user: Usuario = Depends(get_current_user)):
    return current_user