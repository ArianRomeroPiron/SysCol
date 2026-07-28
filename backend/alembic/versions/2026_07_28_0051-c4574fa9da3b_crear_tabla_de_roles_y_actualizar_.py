"""Crear tabla de roles y actualizar usuarios

Revision ID: c4574fa9da3b
Revises: 5f6377b4145f
Create Date: 2026-07-28 00:51:41.597095

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4574fa9da3b'
down_revision: Union[str, Sequence[str], None] = '5f6377b4145f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Crear tabla roles
    op.create_table(
        'roles',
        sa.Column('id_rol', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(), nullable=False),
        sa.Column('descripcion', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id_rol'),
    )
    op.create_index(op.f('ix_roles_id_rol'), 'roles', ['id_rol'], unique=False)
    op.create_index(op.f('ix_roles_nombre'), 'roles', ['nombre'], unique=True)

    # 2. Sembrar roles iniciales
    op.execute(
        "INSERT INTO roles (nombre, descripcion) VALUES "
        "('admin', 'Acceso total al sistema'), "
        "('cajero', 'Maneja ventas e inventario del dia a dia'), "
        "('dueno', 'Dueno del colmado, ve reportes y finanzas')"
    )

    # 3. Agregar id_rol a usuarios (nullable primero para poder rellenar)
    op.add_column('usuarios', sa.Column('id_rol', sa.Integer(), nullable=True))

    # 4. Migrar usuarios existentes segun su rol de texto viejo
    op.execute(
        "UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE roles.nombre = usuarios.rol)"
    )
    op.execute(
        "UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE roles.nombre = 'cajero') "
        "WHERE id_rol IS NULL"
    )

    # 5. Hacer NOT NULL y crear la llave foranea
    op.alter_column('usuarios', 'id_rol', nullable=False)
    op.create_foreign_key(
        'fk_usuarios_id_rol_roles', 'usuarios', 'roles', ['id_rol'], ['id_rol']
    )

    # 6. Eliminar la columna vieja de texto
    op.drop_column('usuarios', 'rol')

def downgrade() -> None:
    op.add_column('usuarios', sa.Column('rol', sa.String(), nullable=True))
    op.execute(
        "UPDATE usuarios SET rol = (SELECT nombre FROM roles WHERE roles.id_rol = usuarios.id_rol)"
    )
    op.drop_constraint('fk_usuarios_id_rol_roles', 'usuarios', type_='foreignkey')
    op.drop_column('usuarios', 'id_rol')
    op.drop_index(op.f('ix_roles_nombre'), table_name='roles')
    op.drop_index(op.f('ix_roles_id_rol'), table_name='roles')
    op.drop_table('roles')
