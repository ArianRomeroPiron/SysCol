import os
import subprocess
import sys

from sqlalchemy import create_engine, text


def test_upgrade_legacy_accounts_without_losing_users(tmp_path):
    url = "sqlite:///" + str(tmp_path / "legacy.db")
    env = {**os.environ, "DATABASE_URL": url}
    command = [sys.executable, "-m", "alembic", "upgrade"]
    subprocess.run(command + ["5f6377b4145f"], env=env, check=True, capture_output=True)
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO usuarios (nombre,email,hashed_password,rol,esta_activo) VALUES ('Ana','ana@example.com','old-hash','cajero',1),('Luis','luis@example.com','other-hash','admin',1)"
            )
        )
    subprocess.run(command + ["head"], env=env, check=True, capture_output=True)
    with engine.connect() as connection:
        rows = connection.execute(
            text("SELECT colmado_id, hashed_password, rol FROM usuarios ORDER BY id")
        ).all()
        assert len(rows) == 2
        assert rows[0][0] != rows[1][0]
        assert rows[0][1] == "old-hash"
        assert all(row[2] == "dueno" for row in rows)
    subprocess.run([sys.executable, "-m", "alembic", "check"], env=env, check=True, capture_output=True)
    engine.dispose()
