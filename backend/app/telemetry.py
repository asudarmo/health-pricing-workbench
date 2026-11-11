"""Traces, metrics and structured logs that share a trace ID. No customer data goes into any of them.

What is recorded: HTTP method, route template and status, pricing-service call names and timings, and counters of quotes and scenario status changes.
What is never recorded: request or response bodies, Authorization headers, tokens, quote profiles, names.

Signals are exported over OTLP/HTTP when OTEL_EXPORTER_OTLP_ENDPOINT is set (Grafana Cloud reads the standard
OTEL_EXPORTER_OTLP_HEADERS and OTEL_RESOURCE_ATTRIBUTES variables). Otherwise nothing leaves the process, but
log lines and the X-Trace-Id header still carry the trace ID.
"""

import json
import logging
import os
import time
from dataclasses import dataclass, field

from fastapi import FastAPI, Request
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

TRACE_HEADER = "X-Trace-Id"


class JsonFormatter(logging.Formatter):
    """One JSON object per line, with the current trace and span IDs."""

    def format(self, record: logging.LogRecord) -> str:
        context = trace.get_current_span().get_span_context()
        entry = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if context.is_valid:
            entry["trace_id"] = format(context.trace_id, "032x")
            entry["span_id"] = format(context.span_id, "016x")
        if record.exc_info:
            entry["exception"] = record.exc_info[0].__name__  # the type only, never the message or values
        return json.dumps(entry)


@dataclass
class Telemetry:
    tracer_provider: TracerProvider
    meter_provider: MeterProvider
    logger_provider: LoggerProvider | None = None
    quotes: object = field(default=None)
    transitions: object = field(default=None)
    pricing_calls: object = field(default=None)
    pricing_seconds: object = field(default=None)

    def __post_init__(self) -> None:
        meter = self.meter_provider.get_meter("hpw")
        self.quotes = meter.create_counter("hpw.quotes", description="Quotes calculated")
        self.transitions = meter.create_counter("hpw.scenario.transitions", description="Scenario status changes")
        self.pricing_calls = meter.create_counter("hpw.pricing.calls", description="Calls to the pricing service")
        self.pricing_seconds = meter.create_histogram("hpw.pricing.duration", unit="s", description="Pricing call time")

    @property
    def tracer(self) -> trace.Tracer:
        return self.tracer_provider.get_tracer("hpw")


def build_providers() -> Telemetry:
    """Providers for the real app. Exporters are added only when an OTLP endpoint is configured."""
    resource = Resource.create({"service.name": os.environ.get("OTEL_SERVICE_NAME", "hpw-backend")})
    tracer_provider = TracerProvider(resource=resource)
    readers, logger_provider = [], None
    if os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

        tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        readers.append(PeriodicExportingMetricReader(OTLPMetricExporter(), export_interval_millis=60_000))
        logger_provider = LoggerProvider(resource=resource)
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
    return Telemetry(tracer_provider, MeterProvider(resource=resource, metric_readers=readers), logger_provider)


def setup_logging(telemetry: Telemetry | None = None, stream=None) -> logging.Handler:
    """JSON lines on stderr (or the given stream). Also sent over OTLP when configured."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler._hpw = True  # type: ignore[attr-defined]
    root.handlers = [h for h in root.handlers if not getattr(h, "_hpw", False)]
    root.addHandler(handler)
    if telemetry and telemetry.logger_provider:
        root.addHandler(LoggingHandler(logger_provider=telemetry.logger_provider))
    return handler


def instrument(app: FastAPI, telemetry: Telemetry) -> None:
    """Attach tracing and the X-Trace-Id response header to the app."""
    app.state.telemetry = telemetry

    log = logging.getLogger("app.request")

    @app.middleware("http")
    async def observe(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        route = getattr(request.scope.get("route"), "path", "unmatched")
        context = trace.get_current_span().get_span_context()
        if context.is_valid:
            response.headers[TRACE_HEADER] = format(context.trace_id, "032x")
        if response.status_code < 300:
            if (request.method, route) == ("POST", "/api/quotes"):
                telemetry.quotes.add(1)
            elif request.method == "POST" and route.rsplit("/", 1)[-1] in ("submit", "approve", "reject"):
                telemetry.transitions.add(1, {"action": route.rsplit("/", 1)[-1]})
        # Method, route template and status only: never the body, query string or headers.
        log.info("%s %s %s %.0f ms", request.method, route, response.status_code, (time.perf_counter() - started) * 1000)
        return response

    # Added last, so it is the outermost layer and the span exists when trace_header runs.
    FastAPIInstrumentor.instrument_app(
        app,
        tracer_provider=telemetry.tracer_provider,
        meter_provider=telemetry.meter_provider,
        excluded_urls="/api/health",
        http_capture_headers_server_request=[],
        http_capture_headers_server_response=[],
        exclude_spans=["receive", "send"],
    )



class timed_pricing_call:
    """Context manager around one pricing-service call: a span, a counter and a duration."""

    def __init__(self, telemetry: Telemetry | None, name: str) -> None:
        self.telemetry, self.name = telemetry, name

    def __enter__(self):
        if self.telemetry:
            self.span = self.telemetry.tracer.start_as_current_span(f"pricing {self.name}")
            self.span.__enter__()
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.telemetry:
            outcome = "error" if exc_type else "ok"
            attrs = {"call": self.name, "outcome": outcome}
            self.telemetry.pricing_calls.add(1, attrs)
            self.telemetry.pricing_seconds.record(time.perf_counter() - self.start, attrs)
            self.span.__exit__(exc_type, exc, tb)
        return False
