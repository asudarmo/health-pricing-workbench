"""Response models and documented errors. Field names match frontend/src/api/types.ts exactly.

`api/openapi.json` is generated from these models (see tools/export_openapi.py); a test fails if it drifts and
`npm run check:contract` in frontend/ fails if the models drift from types.ts.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Role = Literal["Analyst", "Reviewer"]
ScenarioStatus = Literal["Draft", "Submitted", "Approved", "Rejected"]


class ErrorResponse(BaseModel):
    detail: str


class ValidationProblem(BaseModel):
    loc: list[str | int]
    msg: str
    type: str


class ValidationErrorResponse(BaseModel):
    """422: a message when a rule rejects the input, or a list of problems when the request shape is wrong."""

    detail: str | list[ValidationProblem]


class User(BaseModel):
    name: str
    role: Role


class LoginResponse(BaseModel):
    token: str
    user: User


class FactorLevel(BaseModel):
    value: str
    label: str


class Factor(BaseModel):
    key: str
    label: str
    group: Literal["age", "region", "condition"]
    levels: list[FactorLevel]


class Validation(BaseModel):
    deviance: float
    gini: float


class ModelInfo(BaseModel):
    id: str
    date: str
    dataYears: str
    trend: float
    rebase: float
    validation: Validation
    baseRate: float
    currency: str
    scalingNote: str
    illustrativeLabel: str
    factors: list[Factor]
    headlineAE: float
    recalibrationFlagCount: int


class QuoteStep(BaseModel):
    factor: str
    level: str
    relativity: float
    runningAmount: float


class QuoteResponse(BaseModel):
    baseRate: float
    steps: list[QuoteStep]
    riskPremium: float
    illustrativeLabel: str
    modelVersion: str


class Relativity(BaseModel):
    factor: str
    level: str
    relativity: float
    exposure: float
    lower: float | None
    upper: float | None


class AERow(BaseModel):
    factor: str
    level: str
    segment: str
    period: str
    actual: float
    expected: float
    exposure: float
    ae: float


class PSIRow(BaseModel):
    factor: str
    period: str
    psi: float


class MonitoringFlag(BaseModel):
    id: str
    segment: str
    ae: float
    exposure: float
    gapType: Literal["level shift", "change in shape"]
    note: str


class Monitoring(BaseModel):
    ae: list[AERow]
    psi: list[PSIRow]
    flags: list[MonitoringFlag]


class HistogramBucket(BaseModel):
    bucket: str
    policies: float


class AffectedSegment(BaseModel):
    segment: str
    averageChangePct: float


class Impact(BaseModel):
    averageChangePct: float
    histogram: list[HistogramBucket]
    cappedPolicies: int
    flooredPolicies: int
    projectedAE: float
    affectedSegments: list[AffectedSegment]


class ScenarioSummary(BaseModel):
    id: str
    name: str
    status: ScenarioStatus
    author: str
    updatedAt: str


class AuditEntry(BaseModel):
    at: str
    actor: str
    action: str
    fromStatus: ScenarioStatus | None
    toStatus: ScenarioStatus
    comment: str | None


class RelativityChange(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    factor: str = Field(min_length=1, max_length=60)
    level: str = Field(min_length=1, max_length=60)
    newRelativity: float = Field(gt=0)


class ScenarioParams(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    baseRateChangePct: float = Field(ge=-50, le=100)
    relativityChanges: list[RelativityChange] = Field(default=[], max_length=200)
    capPct: float = Field(ge=0, le=100, description="Maximum individual increase, %")
    floorPct: float = Field(ge=0, le=100, description="Maximum individual decrease, % (positive number)")


class ScenarioInput(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    rationale: str = Field(default="", max_length=10000)
    params: ScenarioParams


class Scenario(ScenarioSummary):
    params: ScenarioParams
    rationale: str
    impact: Impact
    reviewComment: str | None


def errors(*codes: int) -> dict:
    """Documented error responses for a route. 422 covers both rejected input and request-shape errors."""
    text = {
        401: "Not signed in, or the token is invalid or expired",
        403: "Signed in, but the role (or the four-eyes rule) does not allow this",
        404: "Not found",
        409: "The scenario status does not allow this",
        422: "Input rejected (the detail is a message, or a list of problems for request-shape errors)",
        502: "The pricing service is unavailable or lacks a field this app needs",
    }
    return {c: {"model": ValidationErrorResponse if c == 422 else ErrorResponse, "description": text[c]} for c in codes}


def roles(*names: str) -> dict:
    """Marks which roles may call a route; shown in the schema as x-roles."""
    return {"x-roles": list(names)}
