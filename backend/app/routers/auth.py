from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies import get_current_user
from app.models import Colmado, Usuario
from app.schemas.negocio import Employee, EmployeeUpdate, PasswordChange, Register
from app.schemas.usuario import MeOut, Token, UsuarioOut

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/register", response_model=UsuarioOut, status_code=201)
def register(data: Register, db: Session = Depends(get_db)):
    email = str(data.email).lower()
    if db.query(Usuario).filter_by(email=email).first():
        raise HTTPException(409, "Correo ya registrado")
    store = Colmado(nombre=data.colmado)
    db.add(store)
    db.flush()
    user = Usuario(
        nombre=data.nombre,
        email=email,
        colmado_id=store.id,
        hashed_password=hash_password(data.password),
        rol="dueno",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Usuario).filter_by(email=form.username.lower()).first()
    if not user or not verify_password(form.password, user.hashed_password) or not user.esta_activo:
        raise HTTPException(401, "Credenciales inválidas", headers={"WWW-Authenticate": "Bearer"})
    return {"access_token": create_access_token({"sub": user.email}), "token_type": "bearer"}


@router.get("/me", response_model=MeOut)
def me(user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    store = db.get(Colmado, user.colmado_id)
    return {**UsuarioOut.model_validate(user).model_dump(), "colmado": store.nombre if store else ""}


@router.post("/password", status_code=204)
def change_password(
    data: PasswordChange, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
):
    if not verify_password(data.actual, user.hashed_password):
        raise HTTPException(409, "La contraseña actual no es correcta")
    user.hashed_password = hash_password(data.nueva)
    db.commit()


def owner_only(user: Usuario):
    if user.rol != "dueno":
        raise HTTPException(403, "Solo el dueño administra empleados")


@router.get("/usuarios", response_model=list[UsuarioOut])
def employees(user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.rol != "dueno":
        raise HTTPException(403, "Solo el dueño administra empleados")
    return db.query(Usuario).filter_by(colmado_id=user.colmado_id).order_by(Usuario.id).all()


@router.post("/usuarios", response_model=UsuarioOut, status_code=201)
def employee(data: Employee, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.rol != "dueno":
        raise HTTPException(403, "Solo el dueño administra empleados")
    if db.query(Usuario).filter_by(email=str(data.email).lower()).first():
        raise HTTPException(409, "Correo ya registrado")
    obj = Usuario(
        nombre=data.nombre,
        email=str(data.email).lower(),
        hashed_password=hash_password(data.password),
        rol=data.rol,
        colmado_id=user.colmado_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/usuarios/{id}", response_model=UsuarioOut)
def update_employee(
    id: int, data: EmployeeUpdate, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
):
    owner_only(user)
    if data.rol is None and data.password is None:
        raise HTTPException(422, "Indica el rol o la nueva contraseña")
    obj = db.query(Usuario).filter_by(id=id, colmado_id=user.colmado_id).with_for_update().first()
    if not obj:
        raise HTTPException(404, "Usuario no encontrado")
    if obj.rol == "dueno":
        raise HTTPException(409, "La cuenta del dueño no se modifica desde aquí")
    if data.rol is not None:
        obj.rol = data.rol
    if data.password is not None:
        obj.hashed_password = hash_password(data.password)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/usuarios/{id}/estado", response_model=UsuarioOut)
def employee_status(
    id: int, activo: bool, user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
):
    if user.rol != "dueno":
        raise HTTPException(403, "Solo el dueño administra empleados")
    obj = db.query(Usuario).filter_by(id=id, colmado_id=user.colmado_id).first()
    if not obj:
        raise HTTPException(404, "Usuario no encontrado")
    if obj.rol == "dueno":
        raise HTTPException(409, "No puedes desactivar al dueño")
    obj.esta_activo = activo
    db.commit()
    db.refresh(obj)
    return obj
