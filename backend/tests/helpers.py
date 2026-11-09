"""Shared test helpers: HTTP calls, a migrated temporary database, and a backend wired to the pricing mock."""

import json
import os
import tempfile
import urllib.error
import urllib.request
from contextlib import ExitStack
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.config import Settings
from app.main import create_app
from tests.pricing_mock.app import create_mock_app
from tests.pricing_mock.server import running

ROOT = Path(__file__).resolve().parents[1]
SECRET = "test-secret-not-for-production-0123456789"


def request(base: str, method: str, path: str, body=None, token: str | None = None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"content-type": "application/json", **({"authorization": f"Bearer {token}"} if token else {})}
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def migrated_url(folder: str) -> str:
    url = f"sqlite:///{Path(folder, 'test.db').as_posix()}"
    os.environ["DATABASE_URL"] = url
    try:
        config = Config(str(ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(ROOT / "migrations"))
        command.upgrade(config, "head")
    finally:
        os.environ.pop("DATABASE_URL")
    return url


class Stack:
    """A backend on a migrated temporary database, talking to the pricing mock (or to a given URL)."""

    def __init__(self, pricing_url: str | None = None) -> None:
        self.pricing_url = pricing_url

    def __enter__(self) -> "Stack":
        self.stack = ExitStack()
        folder = self.stack.enter_context(tempfile.TemporaryDirectory(ignore_cleanup_errors=True))
        pricing = self.pricing_url or self.stack.enter_context(running(create_mock_app()))
        self.pricing = pricing
        settings = Settings(database_url=migrated_url(folder), pricing_service_url=pricing, jwt_secret=SECRET)
        self.app = create_app(settings)
        self.stack.callback(self.app.state.engine.dispose)
        self.base = self.stack.enter_context(running(self.app))
        return self

    def __exit__(self, *exc) -> None:
        self.stack.close()

    def token(self, role: str) -> str:
        return request(self.base, "POST", "/api/auth/login", {"role": role})[1]["token"]

    def get(self, path: str, role: str = "Analyst"):
        return request(self.base, "GET", path, token=self.token(role))

    def post(self, path: str, body=None, role: str = "Analyst"):
        return request(self.base, "POST", path, body, token=self.token(role))

    def put(self, path: str, body=None, role: str = "Analyst"):
        return request(self.base, "PUT", path, body, token=self.token(role))
