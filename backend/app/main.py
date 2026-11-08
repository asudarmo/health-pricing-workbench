"""FastAPI application. All routes live under /api."""

from fastapi import FastAPI

from app import auth
from app.config import Settings, get_settings
from app.db import make_engine


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Health Pricing Workbench API", version="0.1.0")
    app.state.settings = settings or get_settings()
    app.state.engine = make_engine(app.state.settings.database_url)
    app.include_router(auth.router)

    @app.get("/api/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
