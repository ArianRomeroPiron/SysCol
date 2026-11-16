from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]
Name = Annotated[str, Field(min_length=1, max_length=160)]
TasaItbis = Literal[0, 16, 18]
PASOS_FE = ("rnc", "oficina_virtual", "solicitud", "certificado", "modalidad", "pruebas")


def tax_id(value):
    """RNC (9 dígitos) o cédula (11); acepta guiones y espacios."""
    if value is None:
        return None
    digits = "".join(c for c in str(value) if c not in "- ")
    if not digits:
        return None
    if not digits.isdigit() or len(digits) not in (9, 11):
        raise ValueError("Escribe un RNC de 9 dígitos o una cédula de 11")
    return digits


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Register(Input):
    nombre: Name
    colmado: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class Employee(Input):
    nombre: Name
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    rol: Literal["admin", "cajero"] = "cajero"


class Category(Input):
    nombre: str = Field(min_length=1, max_length=120)


class Product(Input):
    nombre: Name
    id_categoria: int = Field(gt=0)
    codigo_barras: str | None = Field(default=None, min_length=1, max_length=80)
    precio_compra: Money
    precio_venta: Money
    stock_minimo: int = Field(default=5, ge=0, le=1000000)
    activo: bool = True
    tasa_itbis: TasaItbis = 18


class Stock(Input):
    cantidad: int = Field(ge=-1000000, le=1000000)
    motivo: str = Field(min_length=3, max_length=200)


class Customer(Input):
    nombre: Name
    telefono: str = Field(pattern=r"^\+[1-9]\d{7,14}$")
    limite_credito: Money = Decimal(0)
    consentimiento_whatsapp: bool = False
    rnc: str | None = None
    razon_social: str | None = Field(default=None, max_length=160)

    _rnc = field_validator("rnc", mode="before")(tax_id)

    @field_validator("razon_social")
    @classmethod
    def blank_is_none(cls, value):
        return value or None


class Item(Input):
    id_producto: int = Field(gt=0)
    cantidad: int = Field(gt=0, le=1000000)


class Sale(Input):
    referencia: UUID
    id_cliente: int | None = Field(default=None, gt=0)
    metodo_pago: Literal["efectivo", "tarjeta", "transferencia", "fiao"]
    detalles: list[Item] = Field(min_length=1, max_length=200)


class Payment(Input):
    referencia: UUID
    monto: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]


class Fiscal(Input):
    rnc: str | None = None
    razon_social: str | None = Field(default=None, max_length=160)
    direccion: str | None = Field(default=None, max_length=200)
    pasos_fe: list[Literal[PASOS_FE]] = Field(default_factory=list)  # type: ignore[valid-type]

    _rnc = field_validator("rnc", mode="before")(tax_id)

    @field_validator("razon_social", "direccion")
    @classmethod
    def blank_is_none(cls, value):
        return value or None
