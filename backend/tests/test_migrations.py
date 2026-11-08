"""The Alembic baseline creates the three tables on an empty SQLite database and matches the models."""

import os
import tempfile
import unittest
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.db import Base, make_engine
from app import models  # noqa: F401

ROOT = Path(__file__).resolve().parents[1]


class MigrationTest(unittest.TestCase):
    def test_upgrade_head_creates_tables_and_matches_models(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            url = f"sqlite:///{Path(folder, 'test.db').as_posix()}"
            os.environ["DATABASE_URL"] = url
            self.addCleanup(os.environ.pop, "DATABASE_URL", None)
            config = Config(str(ROOT / "alembic.ini"))
            config.set_main_option("script_location", str(ROOT / "migrations"))
            command.upgrade(config, "head")
            engine = make_engine(url)
            try:
                self.assertTrue({"users", "scenarios", "audit_entries"} <= set(inspect(engine).get_table_names()))
                with engine.connect() as connection:
                    diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
                self.assertEqual(diff, [], "models and migrations have drifted")
            finally:
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
