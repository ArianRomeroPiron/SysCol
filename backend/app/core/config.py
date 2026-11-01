from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str
    secret_key: str = Field(min_length=32)
    whatsapp_enabled: bool = False
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_number: str = ""
    twilio_content_sid: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, ge=5, le=1440)
    cors_origins: list[str] = ["http://localhost:4200"]

    @field_validator("secret_key")
    @classmethod
    def secure_key(cls, value):
        if value.startswith("cambia-"):
            raise ValueError("Genera una SECRET_KEY aleatoria antes de iniciar")
        return value


settings = Settings()
