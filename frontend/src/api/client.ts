// Single entry point for data access. One function per endpoint.
import type {
  AuditEntry,
  Impact,
  LoginResponse,
  ModelInfo,
  Monitoring,
  QuoteRequest,
  QuoteResponse,
  Relativity,
  Role,
  Scenario,
  ScenarioInput,
  ScenarioParams,
  ScenarioSummary,
} from "./types";
import { getToken } from "@/lib/session";

export const USE_MOCKS = (import.meta.env["VITE_USE_MOCKS"] ?? "true") !== "false";
const BASE_URL = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  if (USE_MOCKS) {
    const { mockRequest, MockHttpError } = await import("./mock/handlers");
    try {
      return (await mockRequest(method, path, body, token)) as T;
    } catch (e) {
      if (e instanceof MockHttpError) throw new ApiError(e.status, e.message);
      throw e;
    }
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = typeof data?.detail === "string" ? data.detail : msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  login: (role: Role) => request<LoginResponse>("POST", "/api/auth/login", { role }),
  getModel: () => request<ModelInfo>("GET", "/api/model"),
  createQuote: (q: QuoteRequest) => request<QuoteResponse>("POST", "/api/quotes", q),
  getRelativities: () => request<Relativity[]>("GET", "/api/relativities"),
  getMonitoring: () => request<Monitoring>("GET", "/api/monitoring"),
  listScenarios: () => request<ScenarioSummary[]>("GET", "/api/scenarios"),
  getScenario: (id: string) => request<Scenario>("GET", `/api/scenarios/${id}`),
  createScenario: (s: ScenarioInput) => request<Scenario>("POST", "/api/scenarios", s),
  updateScenario: (id: string, s: ScenarioInput) => request<Scenario>("PUT", `/api/scenarios/${id}`, s),
  computeImpact: (params: ScenarioParams) => request<Impact>("POST", "/api/scenarios/impact", { params }),
  submitScenario: (id: string) => request<Scenario>("POST", `/api/scenarios/${id}/submit`),
  approveScenario: (id: string, comment: string) =>
    request<Scenario>("POST", `/api/scenarios/${id}/approve`, { comment }),
  rejectScenario: (id: string, comment: string) =>
    request<Scenario>("POST", `/api/scenarios/${id}/reject`, { comment }),
  getAudit: (id: string) => request<AuditEntry[]>("GET", `/api/scenarios/${id}/audit`),
};
