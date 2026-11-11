"""HTTP client for the pricing service. Standard library only."""

import json
import urllib.error
import urllib.request

from fastapi import HTTPException

from app.telemetry import Telemetry, timed_pricing_call


class PricingUnavailable(Exception):
    """The pricing service cannot be reached or failed."""


class PricingClient:
    def __init__(self, base_url: str, timeout: float = 10.0, telemetry: Telemetry | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.telemetry = telemetry

    def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        with timed_pricing_call(self.telemetry, path):
            return self._send(method, path, body)

    def _send(self, method: str, path: str, body: dict | None) -> dict:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            self.base_url + path, data=data, method=method, headers={"content-type": "application/json"}
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404:  # the endpoint itself is missing (older pricing service image)
                raise PricingUnavailable(f"pricing service has no {path}") from None
            if 400 <= error.code < 500:
                try:
                    detail = json.load(error).get("detail", "Rejected by the pricing service")
                except (ValueError, AttributeError):
                    detail = "Rejected by the pricing service"
                raise HTTPException(status_code=error.code, detail=detail) from None
            raise PricingUnavailable(f"pricing service returned {error.code}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError, OSError) as error:
            raise PricingUnavailable(str(error)) from None

    def model(self) -> dict:
        return self._call("GET", "/model")

    def relativities(self) -> dict:
        return self._call("GET", "/relativities")

    def monitoring(self) -> dict:
        return self._call("GET", "/monitoring")

    def quote(self, profile: dict) -> dict:
        return self._call("POST", "/quote", profile)

    def scenario_impact(self, request: dict) -> dict:
        return self._call("POST", "/scenario-impact", request)
