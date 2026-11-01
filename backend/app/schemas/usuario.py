from pydantic import BaseModel, ConfigDict


class UsuarioBase(BaseModel):
    nombre: str
    email: str


class UsuarioCreate(UsuarioBase):
    password: str


class UsuarioOut(UsuarioBase):
    id: int
    colmado_id: int
    rol: str
    esta_activo: bool

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
