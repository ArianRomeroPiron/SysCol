"""anulacion de ventas

Revision ID: 623527437bba
Revises: cfb3392daa29
Create Date: 2026-11-15 13:16:33.960683

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "623527437bba"
down_revision: Union[str, Sequence[str], None] = "cfb3392daa29"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable void fields; existing sales stay valid."""
    with op.batch_alter_table("ventas") as batch:
        batch.add_column(sa.Column("anulada_en", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("anulada_por", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("motivo_anulacion", sa.String(length=200), nullable=True))
        batch.create_foreign_key("fk_ventas_anulada_por_usuarios", "usuarios", ["anulada_por"], ["id"])


def downgrade() -> None:
    raise RuntimeError("Conserva el registro de anulaciones. Restaura una copia verificada para retroceder.")
