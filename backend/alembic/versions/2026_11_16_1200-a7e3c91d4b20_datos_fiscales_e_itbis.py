"""datos fiscales e itbis para facturación electrónica

Revision ID: a7e3c91d4b20
Revises: cfb3392daa29
Create Date: 2026-11-16 12:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a7e3c91d4b20"
down_revision: Union[str, Sequence[str], None] = "cfb3392daa29"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("colmados", sa.Column("rnc", sa.String(length=11), nullable=True))
    op.add_column("colmados", sa.Column("razon_social", sa.String(length=160), nullable=True))
    op.add_column("colmados", sa.Column("direccion", sa.String(length=200), nullable=True))
    op.add_column(
        "colmados", sa.Column("pasos_fe", sa.String(length=400), nullable=False, server_default="")
    )
    # Los productos existentes quedan con la tasa general (18 %); el dueño ajusta los exentos.
    op.add_column(
        "productos", sa.Column("tasa_itbis", sa.Integer(), nullable=False, server_default="18")
    )
    op.add_column("clientes", sa.Column("rnc", sa.String(length=11), nullable=True))
    op.add_column("clientes", sa.Column("razon_social", sa.String(length=160), nullable=True))
    op.add_column("detalle_venta", sa.Column("tasa_itbis", sa.Integer(), nullable=True))
    op.add_column("detalle_venta", sa.Column("itbis", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("detalle_venta", "itbis")
    op.drop_column("detalle_venta", "tasa_itbis")
    op.drop_column("clientes", "razon_social")
    op.drop_column("clientes", "rnc")
    op.drop_column("productos", "tasa_itbis")
    op.drop_column("colmados", "pasos_fe")
    op.drop_column("colmados", "direccion")
    op.drop_column("colmados", "razon_social")
    op.drop_column("colmados", "rnc")
