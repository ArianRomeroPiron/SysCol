from pydantic import BaseModel


class RolOut(BaseModel):
    id_rol: int
    nombre: str
    descripcion: str | None = None

    class Config:
        from_attributes = True


class UsuarioBase(BaseModel):
    nombre: str
    email: str


class UsuarioCreate(UsuarioBase):
    password: str


class UsuarioOut(UsuarioBase):
    id: int
    esta_activo: bool
    rol: RolOut

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"