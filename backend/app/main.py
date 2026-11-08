"""FastAPI application. All routes live under /api."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import auth, routes_read, scenarios
from app.config import Settings, get_settings
from app.db import make_engine
from app.pricing import PricingClient


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Health Pricing Workbench API", version="0.1.0")
    app.state.settings = settings or get_settings()
    app.state.engine = make_engine(app.state.settings.database_url)
    app.state.pricing = PricingClient(app.state.settings.pricing_service_url)
    app.include_router(auth.router)
    app.include_router(routes_read.router)
    app.include_router(scenarios.router)

    @app.exception_handler(RequestValidationError)
    def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        # Leave out the submitted input: it can hold values JSON cannot carry (NaN) and should not be echoed.
        detail = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in error.errors()]
        return JSONResponse(status_code=422, content={"detail": detail})

    @app.get("/api/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
