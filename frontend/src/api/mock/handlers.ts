// In-memory mock of the FastAPI endpoints, enforcing the same status and role rules.
import type {
  AuditEntry,
  LoginResponse,
  QuoteRequest,
  QuoteResponse,
  Role,
  Scenario,
  ScenarioInput,
  ScenarioParams,
  ScenarioStatus,
  User,
} from "../types";
import { CONDITION_KEYS, FACTORS, MODEL, RELATIVITIES, ageToBand, baseRelativity } from "./data";
import { computeImpact } from "./impact";
import { MONITORING } from "./monitoring";

export class MockHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const USERS: Record<Role, User> = {
  Analyst: { name: "Priya Shah", role: "Analyst" },
  Reviewer: { name: "Tom Hughes", role: "Reviewer" },
};

function userFromToken(token: string | null): User {
  const role = token?.startsWith("mock.") ? token.slice(5) : null;
  if (role === "Analyst" || role === "Reviewer") return USERS[role];
  throw new MockHttpError(401, "Your session has expired. Please sign in again.");
}

interface StoredScenario {
  id: string;
  name: string;
  status: ScenarioStatus;
  author: string;
  updatedAt: string;
  params: ScenarioParams;
  rationale: string;
  reviewComment: string | null;
  audit: AuditEntry[];
}

const DEFAULT_PARAMS: ScenarioParams = { baseRateChangePct: 0, relativityChanges: [], capPct: 15, floorPct: 10 };

function seed(): StoredScenario[] {
  const a = USERS.Analyst.name;
  const r = USERS.Reviewer.name;
  const created = (at: string, actor: string): AuditEntry => ({
    at,
    actor,
    action: "Created draft",
    fromStatus: null,
    toStatus: "Draft",
    comment: null,
  });
  const submitted = (at: string): AuditEntry => ({
    at,
    actor: a,
    action: "Submitted for review",
    fromStatus: "Draft",
    toStatus: "Submitted",
    comment: null,
  });
  return [
    {
      id: "sc-101",
      name: "60+ level shift uplift",
      status: "Draft",
      author: a,
      updatedAt: "2026-11-06T09:12:00Z",
      params: {
        baseRateChangePct: 0,
        relativityChanges: ["60-64", "65-69", "70-74", "75-79", "80+"].map((level) => ({
          factor: "age",
          level,
          newRelativity: 1.079,
        })),
        capPct: 15,
        floorPct: 10,
      },
      rationale:
        "2023 A/E for the 60+ segment is 1.12 on 5,474 lives of exposure, a level shift with stable shape. Uplift all 60+ age relativities by 12% to close the gap.",
      reviewComment: null,
      audit: [created("2026-11-06T09:12:00Z", a)],
    },
    {
      id: "sc-102",
      name: "Trend refresh +1.9%",
      status: "Draft",
      author: "AI assistant (draft)",
      updatedAt: "2026-11-06T14:40:00Z",
      params: { baseRateChangePct: 1.9, relativityChanges: [], capPct: 10, floorPct: 5 },
      rationale:
        "Book A/E is 1.03 across 17,440 lives. Applying the 1.019 trend factor to the base rate brings expected claims in line with current experience. Requires analyst review before submission.",
      reviewComment: null,
      audit: [created("2026-11-06T14:40:00Z", "AI assistant (draft)")],
    },
    {
      id: "sc-103",
      name: "Midwest relativity trim",
      status: "Submitted",
      author: a,
      updatedAt: "2026-11-04T16:05:00Z",
      params: {
        baseRateChangePct: 0,
        relativityChanges: [{ factor: "region", level: "Midwest", newRelativity: 1.15 }],
        capPct: 10,
        floorPct: 10,
      },
      rationale:
        "Midwest A/E has run at 0.97 for two periods on 3,505 lives of exposure. Trim the relativity from 1.187 to 1.150, within its confidence band (1.009 to 1.395).",
      reviewComment: null,
      audit: [created("2026-11-03T10:00:00Z", a), submitted("2026-11-04T16:05:00Z")],
    },
    {
      id: "sc-104",
      name: "Asthma relativity review",
      status: "Approved",
      author: a,
      updatedAt: "2026-10-28T11:30:00Z",
      params: {
        baseRateChangePct: 0,
        relativityChanges: [{ factor: "cond_asthma", level: "present", newRelativity: 1.25 }],
        capPct: 10,
        floorPct: 10,
      },
      rationale:
        "Asthma A/E of 0.98 on 2,449 lives supports a small reduction from 1.277 to 1.250, well inside the band of 1.090 to 1.495.",
      reviewComment: "Supported by experience; small dislocation.",
      audit: [
        created("2026-10-20T09:00:00Z", a),
        submitted("2026-10-22T15:20:00Z"),
        {
          at: "2026-10-28T11:30:00Z",
          actor: r,
          action: "Approved",
          fromStatus: "Submitted",
          toStatus: "Approved",
          comment: "Supported by experience; small dislocation.",
        },
      ],
    },
    {
      id: "sc-105",
      name: "Cancer relativity cut",
      status: "Rejected",
      author: a,
      updatedAt: "2026-10-30T13:45:00Z",
      params: {
        baseRateChangePct: -1,
        relativityChanges: [{ factor: "cond_cancer", level: "present", newRelativity: 1.5 }],
        capPct: 20,
        floorPct: 20,
      },
      rationale:
        "Cancer A/E of 0.94 on 1,862 lives in 2022. Proposed cut from 1.767 to 1.500 with a 1% base rate reduction.",
      reviewComment: "1.500 sits below the lower confidence bound (1.505) and one period is not enough. Rework with a smaller change.",
      audit: [
        created("2026-10-25T09:30:00Z", a),
        submitted("2026-10-27T10:10:00Z"),
        {
          at: "2026-10-30T13:45:00Z",
          actor: r,
          action: "Rejected",
          fromStatus: "Submitted",
          toStatus: "Rejected",
          comment: "1.500 sits below the lower confidence bound (1.505) and one period is not enough. Rework with a smaller change.",
        },
      ],
    },
  ];
}

let store: StoredScenario[] = seed();
let nextId = 200;

/** Test helper: restore seeded state. */
export function resetMockState() {
  store = seed();
  nextId = 200;
}

function toScenario(s: StoredScenario): Scenario {
  const { audit: _a, ...rest } = s;
  return { ...rest, impact: computeImpact(s.params) };
}

function find(id: string): StoredScenario {
  const s = store.find((x) => x.id === id);
  if (!s) throw new MockHttpError(404, "Scenario not found.");
  return s;
}

function validateParams(p: unknown): ScenarioParams {
  const params = p as ScenarioParams;
  if (!params || typeof params.baseRateChangePct !== "number" || !Array.isArray(params.relativityChanges))
    throw new MockHttpError(422, "Scenario parameters are incomplete.");
  for (const c of params.relativityChanges) {
    if (!RELATIVITIES.some((r) => r.factor === c.factor && r.level === c.level))
      throw new MockHttpError(422, `Unknown factor level ${c.factor} / ${c.level}.`);
    if (!(c.newRelativity > 0)) throw new MockHttpError(422, "Relativities must be greater than zero.");
  }
  if (params.capPct < 0 || params.floorPct < 0) throw new MockHttpError(422, "Cap and floor must be zero or more.");
  return params;
}

function validateInput(body: unknown): ScenarioInput {
  const b = body as ScenarioInput;
  if (!b?.name?.trim()) throw new MockHttpError(422, "Scenario name is required.");
  return { name: b.name.trim(), rationale: b.rationale ?? "", params: validateParams(b.params) };
}

function transition(s: StoredScenario, actor: User, to: ScenarioStatus, action: string, comment: string | null) {
  const now = new Date().toISOString();
  s.audit.push({ at: now, actor: actor.name, action, fromStatus: s.status, toStatus: to, comment });
  s.status = to;
  s.updatedAt = now;
}

function quote(req: QuoteRequest): QuoteResponse {
  if (typeof req?.age !== "number" || req.age < 0 || req.age > 100)
    throw new MockHttpError(422, "Age must be between 0 and 100.");
  let running = MODEL.baseRate;
  const steps = FACTORS.map((f) => {
    const level =
      f.group === "age" ? ageToBand(req.age) : (req.selections?.[f.key] ?? (f.group === "condition" ? "absent" : f.levels[0]?.value) ?? "");
    if (!f.levels.some((l) => l.value === level)) throw new MockHttpError(422, `Unknown level for ${f.label}.`);
    const relativity = baseRelativity(f.key, level);
    running *= relativity;
    return { factor: f.key, level, relativity, runningAmount: Math.round(running * 100) / 100 };
  });
  return { baseRate: MODEL.baseRate, steps, riskPremium: Math.round(running * 100) / 100 };
}

export async function mockRequest(method: string, path: string, body: unknown, token: string | null): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
  const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));

  if (method === "POST" && path === "/api/auth/login") {
    const role = (body as { role?: Role })?.role;
    if (role !== "Analyst" && role !== "Reviewer") throw new MockHttpError(422, "Unknown role.");
    return { token: `mock.${role}`, user: USERS[role] } satisfies LoginResponse;
  }

  const user = userFromToken(token);

  if (method === "GET" && path === "/api/model") return json(MODEL);
  if (method === "POST" && path === "/api/quotes") return quote(body as QuoteRequest);
  if (method === "GET" && path === "/api/relativities") return json(RELATIVITIES);
  if (method === "GET" && path === "/api/monitoring") return json(MONITORING);

  if (path === "/api/scenarios") {
    if (method === "GET")
      return store
        .map(({ id, name, status, author, updatedAt }) => ({ id, name, status, author, updatedAt }))
        .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    if (method === "POST") {
      const input = validateInput(body);
      const now = new Date().toISOString();
      const s: StoredScenario = {
        id: `sc-${nextId++}`,
        ...input,
        status: "Draft",
        author: user.name,
        updatedAt: now,
        reviewComment: null,
        audit: [{ at: now, actor: user.name, action: "Created draft", fromStatus: null, toStatus: "Draft", comment: null }],
      };
      store.push(s);
      return toScenario(s);
    }
  }

  if (method === "POST" && path === "/api/scenarios/impact")
    return computeImpact(validateParams((body as { params?: unknown })?.params ?? DEFAULT_PARAMS));

  const m = path.match(/^\/api\/scenarios\/([^/]+)(?:\/(submit|approve|reject|audit))?$/);
  if (m) {
    const s = find(m[1] ?? "");
    const action = m[2];
    if (!action && method === "GET") return toScenario(s);
    if (!action && method === "PUT") {
      if (s.status !== "Draft") throw new MockHttpError(409, `Only drafts can be edited. This scenario is ${s.status}.`);
      Object.assign(s, validateInput(body), { updatedAt: new Date().toISOString() });
      return toScenario(s);
    }
    if (action === "audit" && method === "GET") return json(s.audit);
    if (action === "submit" && method === "POST") {
      if (s.status !== "Draft") throw new MockHttpError(409, `Only drafts can be submitted. This scenario is ${s.status}.`);
      transition(s, user, "Submitted", "Submitted for review", null);
      return toScenario(s);
    }
    if ((action === "approve" || action === "reject") && method === "POST") {
      if (user.role !== "Reviewer") throw new MockHttpError(403, "Only reviewers can approve or reject scenarios.");
      if (s.status !== "Submitted")
        throw new MockHttpError(409, `Only submitted scenarios can be reviewed. This scenario is ${s.status}.`);
      const comment = (body as { comment?: string })?.comment?.trim();
      if (!comment) throw new MockHttpError(422, "A review comment is required.");
      transition(s, user, action === "approve" ? "Approved" : "Rejected", action === "approve" ? "Approved" : "Rejected", comment);
      s.reviewComment = comment;
      return toScenario(s);
    }
  }

  throw new MockHttpError(404, `No mock for ${method} ${path}.`);
}

export { CONDITION_KEYS };
