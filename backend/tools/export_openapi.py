"""Write the API contract to api/openapi.json (run from backend/: python tools/export_openapi.py)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app  # noqa: E402
from app.config import Settings  # noqa: E402

TARGET = Path(__file__).resolve().parents[2] / "api" / "openapi.json"


def contract_text() -> str:
    app = create_app(Settings(database_url="sqlite://", pricing_service_url="http://unused", jwt_secret="unused"))
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    TARGET.write_text(contract_text(), encoding="utf-8", newline="\n")
    print("wrote", TARGET)
