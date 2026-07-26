from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Variables de PostgreSQL (para que Pydantic las reconozca sin quejarse)
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_db: str = "sistema_colmados"

    # Variables de conexión y seguridad
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    class Config:
        env_file = ".env"
        extra = "ignore"  # Le dice que ignore cualquier otra variable extra del .env


settings = Settings()