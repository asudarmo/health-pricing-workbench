"""Runs every test suite and contract check. Exit code is non-zero if any step fails.

Usage (from the repo root):  python scripts/test.py
Steps: backend unit and integration tests (unittest, SQLite, pricing mock), frontend tests (vitest),
and the contract check between api/openapi.json and the frontend client.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def backend_python() -> str:
    for candidate in (BACKEND / ".venv" / "Scripts" / "python.exe", BACKEND / ".venv" / "bin" / "python"):
        if candidate.exists():
            return str(candidate)
    return sys.executable


def run(name: str, command: list[str], cwd: Path) -> bool:
    print(f"\n=== {name} ===", flush=True)
    npm_env = dict(os.environ)
    result = subprocess.run(command, cwd=cwd, env=npm_env)
    return result.returncode == 0


def main() -> int:
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if npm is None:
        print("npm was not found on PATH (Node 26 is needed for the frontend tests).")
        return 2
    steps = [
        ("Backend tests", [backend_python(), "-m", "unittest", "discover", "-s", "tests", "-t", "."], BACKEND),
        ("Frontend tests", [npm, "test"], FRONTEND),
        ("Contract check", [npm, "run", "check:contract"], FRONTEND),
    ]
    results = [(name, run(name, command, cwd)) for name, command, cwd in steps]
    print("\n=== Summary ===")
    for name, ok in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
    return 0 if all(ok for _, ok in results) else 1


if __name__ == "__main__":
    sys.exit(main())
