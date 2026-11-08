"""Demo login, JWT validation and role checks."""

import dataclasses
import json
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import jwt
from alembic import command
from alembic.config import Config
from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import CurrentUser, create_token, require_role
from app.config import Settings
from app.main import create_app
from app.models import User
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


class AuthTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.folder = tempfile.TemporaryDirectory()
        url = f"sqlite:///{Path(cls.folder.name, 'auth.db').as_posix()}"
        cls.settings = Settings(database_url=url, pricing_service_url="http://unused", jwt_secret=SECRET)
        import os

        os.environ["DATABASE_URL"] = url
        config = Config(str(ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(ROOT / "migrations"))
        command.upgrade(config, "head")
        os.environ.pop("DATABASE_URL")

        cls.app = create_app(cls.settings)

        @cls.app.get("/api/test/reviewer-only")
        def reviewer_only(user: CurrentUser = Depends(require_role("Reviewer"))) -> dict:
            return {"name": user.name}

        cls.context = running(cls.app)
        cls.base = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.context.__exit__(None, None, None)
        cls.app.state.engine.dispose()
        cls.folder.cleanup()

    def login(self, role: str) -> str:
        status, body = request(self.base, "POST", "/api/auth/login", {"role": role})
        self.assertEqual(status, 200)
        self.assertEqual(body["user"]["role"], role)
        return body["token"]

    def test_login_both_roles_returns_token_and_user(self) -> None:
        for role, name in (("Analyst", "Demo Analyst"), ("Reviewer", "Demo Reviewer")):
            _, body = request(self.base, "POST", "/api/auth/login", {"role": role})
            self.assertEqual(body["user"], {"name": name, "role": role})
            claims = jwt.decode(body["token"], SECRET, algorithms=["HS256"])
            self.assertEqual((claims["sub"], claims["role"]), (name, role))

    def test_login_twice_keeps_one_user_row(self) -> None:
        self.login("Analyst")
        self.login("Analyst")
        with Session(self.app.state.engine) as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(User).where(User.role == "Analyst")), 1)

    def test_unknown_or_missing_role_is_422(self) -> None:
        self.assertEqual(request(self.base, "POST", "/api/auth/login", {"role": "Admin"})[0], 422)
        self.assertEqual(request(self.base, "POST", "/api/auth/login", {})[0], 422)

    def test_reviewer_only_route(self) -> None:
        path = "/api/test/reviewer-only"
        self.assertEqual(request(self.base, "GET", path)[0], 401)
        self.assertEqual(request(self.base, "GET", path, token=self.login("Analyst"))[0], 403)
        status, body = request(self.base, "GET", path, token=self.login("Reviewer"))
        self.assertEqual((status, body["name"]), (200, "Demo Reviewer"))

    def test_bad_tokens_are_401(self) -> None:
        path = "/api/auth/me"
        good = self.login("Reviewer")
        expired = create_token(dataclasses.replace(self.settings, jwt_hours=-1), "Demo Reviewer", "Reviewer")
        wrong_key = create_token(dataclasses.replace(self.settings, jwt_secret="another-secret-0123456789-abcdef"), "Demo Reviewer", "Reviewer")
        unsigned = jwt.encode({"sub": "x", "role": "Reviewer"}, key=None, algorithm="none")
        for token in (expired, wrong_key, unsigned, good[:-3] + "abc", "not-a-token"):
            self.assertEqual(request(self.base, "GET", path, token=token)[0], 401, token[:20])
        self.assertEqual(request(self.base, "GET", path, token=good)[0], 200)


if __name__ == "__main__":
    unittest.main()
