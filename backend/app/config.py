"""Settings, read from environment variables only."""

import logging
import os
import secrets
from dataclasses import dataclass

log = logging.getLogger("app.config")


@dataclass(frozen=True)
class Settings:
    database_url: str
    pricing_service_url: str
    jwt_secret: str
    jwt_hours: int = 8


def get_settings() -> Settings:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        # A random secret keeps the app safe by default; tokens stop working when the process restarts.
        secret = secrets.token_urlsafe(32)
        log.warning("JWT_SECRET is not set: using a random secret for this process")
    return Settings(
        database_url=os.environ.get("DATABASE_URL", "sqlite:///./data/workbench.db"),
        pricing_service_url=os.environ.get("PRICING_SERVICE_URL", "http://localhost:8000"),
        jwt_secret=secret,
        jwt_hours=int(os.environ.get("JWT_HOURS", "8")),
    )
