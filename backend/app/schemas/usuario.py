from pydantic import BaseModel, EmailStr


class UsuarioCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    rol: str = "cajero"  # "admin", "cajero", "dueno"


class UsuarioOut(BaseModel):
    id: int
    nombre: str
    email: EmailStr
    rol: str
    esta_activo: bool

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str