from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# --- IMPORTACIONES (config, base de datos y modelos) ---
from app.core.config import settings
from app.core.database import Base

# Importa aquí CADA modelo nuevo que el equipo vaya agregando,
# para que Alembic --autogenerate los detecte correctamente.
from app.models.usuario import Usuario, Rol
from app.models.venta import Venta, DetalleVenta
from app.models.categoria import Categoria
from app.models.producto import Producto
# from app.models.cliente import Cliente          # <- agregar cuando P3 lo suba
# from app.models.deuda import Deuda, Abono         # <- agregar cuando P3 lo suba
# ---------------------------------------------------------

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# --- URL configurada para leer el .env ---
config.set_main_option("sqlalchemy.url", settings.database_url)
# ------------------------------------------

# Interpret the config file for