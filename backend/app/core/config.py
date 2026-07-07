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
    PROJECT_NAME: str = "lng-trading-app"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    # Keep a secret key if anything uses it (cookies/signing later)
    SECRET_KEY: str = secrets.token_urlsafe(32)

    # --- Access control ---
    # Email that is granted superuser (write) access.
    FIRST_SUPERUSER: str = "admin@example.com"
    # Only users whose email ends with this domain may access the app.
    # Set to "" to allow any authenticated email.
    ALLOWED_EMAIL_DOMAIN: str = "equinor.com"

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
    DATABRICKS_USE_SERVICE_PRINCIPAL: bool = False

    # PAT auth (optional fallback)
    DATABRICKS_TOKEN: str | None = None

    # Service Principal auth
    DATABRICKS_TENANT_ID: str | None = None
    DATABRICKS_CLIENT_ID: str | None = None
    DATABRICKS_CLIENT_SECRET: str | None = None
    DATABRICKS_WORKSPACE_RESOURCE_ID: str | None = None
    # Azure name compatibility (if team uses AZURE_* env names)
    AZURE_TENANT_ID: str | None = None
    AZURE_CLIENT_ID: str | None = None
    AZURE_CLIENT_SECRET: str | None = None
    AZURE_WORKSPACE_RESOURCE_ID: str | None = None
    DATABRICKS_AAD_SCOPE: str = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default"

    # --- Databricks Jobs / pipeline trigger (REST API) ---
    # Workspace base URL, e.g. "https://adb-1234.5.azuredatabricks.net".
    # Falls back to DATABRICKS_SERVER_HOSTNAME when unset.
    DATABRICKS_WORKSPACE_URL: str | None = None
    # The Databricks Job ID that runs the news ingestion pipeline.
    DATABRICKS_JOB_ID: str | None = None
    # TLS verification for Databricks/AAD REST calls. On a corporate network that
    # intercepts TLS, keep DATABRICKS_VERIFY_SSL=true and set DATABRICKS_CA_BUNDLE
    # to your company's CA bundle (.pem) so the proxy's chain validates.
    DATABRICKS_VERIFY_SSL: bool = True
    DATABRICKS_CA_BUNDLE: str | None = None

    # UC table name you are using
    NEWS_TABLE: str = "lng_apac.news_state"

    SENTRY_DSN: str | None = None
    NEWS_BACKEND: str = "mock"

    # --- Mock backend tuning ---
    MOCK_NEWS_SEED_COUNT: int = 12
    MOCK_NEWS_MAX_TAGS: int = 3
    MOCK_NEWS_TAG_NONE_PROBABILITY: float = 0.15
    MOCK_NEWS_REGION_NONE_PROBABILITY: float = 0.15
    MOCK_NEWS_SOURCE: str = "mock"

    # --- Equinor Atlas Email ---
    ATLAS_TENANT_ID: str = "3aa4a235-b6e2-48d5-9195-7fcf05b459b0"
    ATLAS_CLIENT_ID: str | None = None
    ATLAS_CLIENT_SECRET: str | None = None
    ATLAS_ENV: Literal["dev", "test", "qa", "prod"] = "prod"
    ATLAS_REPLY_TO: str = "csee@equinor.com"
    ATLAS_DEFAULT_RECIPIENT: str = "csee@equinor.com"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def atlas_host(self) -> str:
        if self.ATLAS_ENV == "prod":
            return "atlas.equinor.com"
        return f"{self.ATLAS_ENV}.atlas.equinor.com"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.ATLAS_CLIENT_ID and self.ATLAS_CLIENT_SECRET)



settings = Settings()  # type: ignore
