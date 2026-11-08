import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRequest, resetMockState } from "@/api/mock/handlers";
import { computeImpact } from "@/api/mock/impact";

const A = "mock.Analyst";
const R = "mock.Reviewer";

async function status(p: Promise<unknown>) {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as { status: number }).status;
  }
}

describe("mock API rules", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    resetMockState();
  });
  const call = (m: string, p: string, b: unknown, t: string) => {
    const pr = mockRequest(m, p, b, t);
    vi.runAllTimers();
    return pr;
  };

  it("analyst cannot approve (403)", async () => {
    expect(await status(call("POST", "/api/scenarios/sc-103/approve", { comment: "ok" }, A))).toBe(403);
  });
  it("reviewer cannot approve a non-submitted scenario (409)", async () => {
    expect(await status(call("POST", "/api/scenarios/sc-101/approve", { comment: "ok" }, R))).toBe(409);
  });
  it("only drafts can be edited (409)", async () => {
    const body = { name: "x", rationale: "", params: { baseRateChangePct: 0, relativityChanges: [], capPct: 10, floorPct: 10 } };
    expect(await status(call("PUT", "/api/scenarios/sc-104", body, A))).toBe(409);
  });
  it("approving adds an audit entry", async () => {
    await call("POST", "/api/scenarios/sc-103/approve", { comment: "fine" }, R);
    const audit = (await call("GET", "/api/scenarios/sc-103/audit", null, A)) as { toStatus: string }[];
    expect(audit.at(-1)?.toStatus).toBe("Approved");
  });
  it("quote maps age 62 to the 60-64 band", async () => {
    const q = (await call("POST", "/api/quotes", { age: 62, selections: { region: "South" } }, A)) as {
      steps: { factor: string; level: string }[];
    };
    expect(q.steps.find((s) => s.factor === "age")?.level).toBe("60-64");
  });
});

describe("mock impact", () => {
  const base = { baseRateChangePct: 0, relativityChanges: [], capPct: 15, floorPct: 10 };
  it("is deterministic and zero for no change", () => {
    expect(computeImpact(base)).toEqual(computeImpact(base));
    expect(computeImpact(base).averageChangePct).toBe(0);
  });
  it("responds to base rate, relativities, cap and floor", () => {
    expect(computeImpact({ ...base, baseRateChangePct: 5 }).averageChangePct).toBeCloseTo(5, 1);
    const up = computeImpact({ ...base, relativityChanges: [{ factor: "region", level: "West", newRelativity: 1.3 }] });
    expect(up.averageChangePct).toBeGreaterThan(0);
    expect(computeImpact({ ...base, baseRateChangePct: 20, capPct: 5 }).cappedPolicies).toBeGreaterThan(0);
    expect(computeImpact({ ...base, baseRateChangePct: -20, floorPct: 5 }).flooredPolicies).toBeGreaterThan(0);
  });
});
