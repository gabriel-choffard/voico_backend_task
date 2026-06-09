from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./db.sqlite3"
    openai_api_key: str = ""
    app_name: str = "Voico Calls Dashboard"

    # Task 3 — stale-call auto-expiry background job.
    # Both are in seconds so they can be dialled down to a few seconds for testing
    # (e.g. interval=5, threshold=10) without touching the code. ``ge=1`` makes the
    # app fail fast on a non-positive value rather than busy-looping the DB on a 0s
    # interval or expiring brand-new calls on a 0s threshold.
    stale_call_check_interval_seconds: int = Field(default=600, ge=1)  # job cadence (10 min)
    stale_call_threshold_seconds: int = Field(default=1800, ge=1)  # in_progress age limit (30 min)


settings = Settings()
