import secrets
from typing import Annotated, Any, Literal

from pydantic import AnyUrl, BeforeValidator, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",          # keep as-is if your .env is at repo root
        env_ignore_empty=True,
        extra="ignore",
    )

    # --- app basics ---
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "lng-views"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    # Keep a secret key if anything uses it (cookies/signing later)
    SECRET_KEY: str = secrets.token_urlsafe(32)

    # --- CORS ---
    FRONTEND_HOST: str = "http://localhost:5173"
    BACKEND_CORS_ORIGINS: Annotated[list[AnyUrl] | str, BeforeValidator(parse_cors)] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST
        ]

    # --- Databricks SQL Warehouse connection ---
    DATABRICKS_SERVER_HOSTNAME: str | None = None
    DATABRICKS_HTTP_PATH: str | None = None
    DATABRICKS_TOKEN: str | None = None

    # UC table name you are using
    NEWS_TABLE: str = "lng_apac.news_state"

    SENTRY_DSN: str | None = None
    NEWS_BACKEND: str = "mock"



settings = Settings()  # type: ignore
