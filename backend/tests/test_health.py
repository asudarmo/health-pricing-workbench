"""Health endpoint, checked over real HTTP with the standard library (no extra test packages)."""

import json
import threading
import time
import unittest
import urllib.request

import uvicorn

from app.main import create_app


class HealthTest(unittest.TestCase):
    def test_health_returns_ok(self) -> None:
        server = uvicorn.Server(uvicorn.Config(create_app(), host="127.0.0.1", port=0, log_level="warning"))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        try:
            for _ in range(100):
                if server.started:
                    break
                time.sleep(0.05)
            port = server.servers[0].sockets[0].getsockname()[1]
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=5) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(json.load(response), {"status": "ok"})
        finally:
            server.should_exit = True
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
