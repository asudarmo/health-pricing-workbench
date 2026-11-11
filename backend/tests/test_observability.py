"""Observability: a trace ID on every response and log line, spans for the journey, and no customer data in any signal."""

import io
import json
import logging
import unittest
import urllib.request

from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app.telemetry import JsonFormatter, Telemetry
from tests.helpers import Stack
from tests.test_read_endpoints import CONDITIONS  # a profile recorded in the pricing mock
from tests.test_scenarios import BODY

SECRET_NAME = "ZZ-private-scenario-name"
SECRET_NOTE = "ZZ-private-rationale-text"


class ObservabilityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.spans = InMemorySpanExporter()
        tracer = TracerProvider()
        tracer.add_span_processor(SimpleSpanProcessor(cls.spans))
        cls.reader = InMemoryMetricReader()
        cls.stack = Stack(telemetry=Telemetry(tracer, MeterProvider(metric_readers=[cls.reader]))).__enter__()
        cls.logs = io.StringIO()
        cls.handler = logging.StreamHandler(cls.logs)
        cls.handler.setFormatter(JsonFormatter())
        logging.getLogger().addHandler(cls.handler)
        logging.getLogger().setLevel(logging.INFO)

    @classmethod
    def tearDownClass(cls) -> None:
        logging.getLogger().removeHandler(cls.handler)
        cls.stack.__exit__(None, None, None)

    def call(self, method: str, path: str, body=None, token: str | None = None):
        headers = {"content-type": "application/json", **({"authorization": f"Bearer {token}"} if token else {})}
        req = urllib.request.Request(self.stack.base + path, json.dumps(body).encode() if body is not None else None, headers, method=method)
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.headers, json.load(response)

    def journey(self):
        """Login, quote, create and submit a scenario, then approve it as the Reviewer."""
        _, login = self.call("POST", "/api/auth/login", {"role": "Analyst"})
        token = login["token"]
        quote_headers, _ = self.call("POST", "/api/quotes", {"age": 40, "selections": {"region": "South", **CONDITIONS}}, token)
        _, scenario = self.call("POST", "/api/scenarios", {**BODY, "name": SECRET_NAME, "rationale": SECRET_NOTE}, token)
        self.call("POST", f"/api/scenarios/{scenario['id']}/submit", None, token)
        reviewer = self.call("POST", "/api/auth/login", {"role": "Reviewer"})[1]["token"]
        self.call("POST", f"/api/scenarios/{scenario['id']}/approve", {"comment": "ZZ-private-comment"}, reviewer)
        return token, reviewer, quote_headers

    def test_trace_id_links_response_span_and_log_line(self) -> None:
        _, _, quote_headers = self.journey()
        trace_id = quote_headers["X-Trace-Id"]
        self.assertRegex(trace_id, r"^[0-9a-f]{32}$")
        span_traces = {format(s.context.trace_id, "032x"): s for s in self.spans.get_finished_spans()}
        self.assertIn(trace_id, span_traces)
        names = {s.name for s in self.spans.get_finished_spans() if format(s.context.trace_id, "032x") == trace_id}
        self.assertTrue(any(n.startswith("pricing ") for n in names), names)  # the pricing call sits in the same trace
        lines = [json.loads(line) for line in self.logs.getvalue().splitlines() if line.startswith("{")]
        self.assertIn(trace_id, {line.get("trace_id") for line in lines if "/api/quotes" in line["message"]})

    def test_metrics_count_quotes_and_status_changes(self) -> None:
        self.journey()
        data = self.reader.get_metrics_data()
        points = {m.name: m for rm in data.resource_metrics for sm in rm.scope_metrics for m in sm.metrics}
        self.assertGreaterEqual(sum(p.value for p in points["hpw.quotes"].data.data_points), 1)
        actions = {p.attributes["action"] for p in points["hpw.scenario.transitions"].data.data_points}
        self.assertEqual(actions, {"submit", "approve"})
        self.assertIn("hpw.pricing.duration", points)

    def test_no_customer_data_tokens_or_names_in_any_signal(self) -> None:
        token, reviewer, _ = self.journey()
        spans = "\n".join(json.dumps(dict(s.attributes or {}), default=str) + s.name for s in self.spans.get_finished_spans())
        data = self.reader.get_metrics_data()
        metrics = data.to_json() if data else ""
        everything = spans + self.logs.getvalue() + metrics
        # Guard against a vacuous pass: the signals must actually hold the journey.
        self.assertIn("pricing /quote", spans)
        self.assertIn("/api/quotes", self.logs.getvalue())
        self.assertIn("hpw.quotes", metrics)
        for secret in (token, reviewer, SECRET_NAME, SECRET_NOTE, "ZZ-private-comment", "Bearer", "authorization", "cond_hbp", "HIBPDX", "South"):
            self.assertNotIn(secret, everything, secret)
        self.assertNotIn('"age"', everything)


if __name__ == "__main__":
    unittest.main()
