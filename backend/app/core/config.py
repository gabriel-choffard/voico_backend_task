from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./db.sqlite3"
    openai_api_key: str = ""
    app_name: str = "Voico Calls Dashboard"

    openai_model: str = "gpt-4o-mini"
    openai_timeout_seconds: float = Field(default=20.0, gt=0)  # per-request budget
    openai_max_retries: int = Field(default=1, ge=0)  # SDK-level retries on transient errors

    stale_call_check_interval_seconds: int = Field(default=600, ge=1)  # job cadence (10 min)
    stale_call_threshold_seconds: int = Field(default=1800, ge=1)  # in_progress age limit (30 min)


settings = Settings()
