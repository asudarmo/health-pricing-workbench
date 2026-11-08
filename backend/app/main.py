"""FastAPI application. All routes live under /api."""

from fastapi import FastAPI

from app.config import get_settings


def create_app() -> FastAPI:
    app = FastAPI(title="Health Pricing Workbench API", version="0.1.0")
    app.state.settings = get_settings()

    @app.get("/api/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
