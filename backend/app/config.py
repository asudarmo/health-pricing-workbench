"""Settings, read from environment variables only."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    pricing_service_url: str


def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", "sqlite:///./data/workbench.db"),
        pricing_service_url=os.environ.get("PRICING_SERVICE_URL", "http://localhost:8000"),
    )
