// Walks the MVP steps through the real client module against a running stack (no mocks).
// Skipped in `npm test`. Run with the stack up (docker compose -f docker-compose.yml -f docker-compose.mock.yml up -d --build,
// then `docker compose exec backend python -m app.seed`):
//   LIVE_API=http://localhost:8080 VITE_USE_MOCKS=false VITE_API_BASE_URL=http://localhost:8080 npx vitest run src/test/live-walk.test.ts
import { describe, expect, it } from "vitest";
import { api, ApiError, USE_MOCKS } from "@/api/client";
import { setSession } from "@/lib/session";

// Node 26 ships its own localStorage global, which shadows jsdom's; use a plain in-memory one for this file.
const store = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

const live =Boolean(process.env["LIVE_API"]) && !USE_MOCKS;

async function code(p: Promise<unknown>) {
  try {
    await p;
    return 200;
  } catch (e) {
    return e instanceof ApiError ? e.status : -1;
  }
}

async function signIn(role: "Analyst" | "Reviewer") {
  const r = await api.login(role);
  setSession({ token: r.token, user: r.user });
  return r;
}

describe.skipIf(!live)("MVP steps against the live stack", () => {
  it("1. model version: id, factors, illustrative label", async () => {
    await signIn("Analyst");
    const m = await api.getModel();
    expect(m.id).toBeTruthy();
    expect(m.factors.length).toBeGreaterThan(0);
    expect(m.illustrativeLabel).toMatch(/illustrative/i);
    expect(m.factors.map((f) => f.key)).not.toContain("sex");
  });

  it("2. quote: steps multiply to the risk premium", async () => {
    const m = await api.getModel();
    const selections: Record<string, string> = {};
    for (const f of m.factors.filter((f) => f.group !== "age")) selections[f.key] = f.group === "region" ? f.levels[0]!.value : "absent";
    const q = await api.createQuote({ age: 45, selections });
    expect(q.riskPremium).toBeGreaterThan(0);
    expect(q.steps.length).toBeGreaterThan(0);
    expect(q.illustrativeLabel).toMatch(/illustrative/i);
  });

  it("3. factors: relativities with exposure and intervals", async () => {
    const rows = await api.getRelativities();
    expect(rows.length).toBeGreaterThan(10);
    expect(rows[0]).toHaveProperty("exposure");
  });

  it("4. monitoring: A/E, PSI and flags", async () => {
    const mon = await api.getMonitoring();
    expect(mon.ae.length).toBeGreaterThan(0);
    expect(mon.psi.length).toBeGreaterThan(0);
    expect(mon.flags.length).toBeGreaterThan(0);
  });

  it("5. to 6. scenario: create, impact, submit, approve, audit, immutability, roles", async () => {
    await signIn("Analyst");
    // The pricing mock only knows the seeded requests, so reuse the parameters of a seeded scenario.
    const seeded = (await api.listScenarios()).find((x) => x.name.startsWith("Trend refresh"))!;
    const { params } = await api.getScenario(seeded.id);
    const impact = await api.computeImpact(params);
    expect(impact.histogram.length).toBeGreaterThan(0);

    const name = `Walk ${Date.now()}`;
    const created = await api.createScenario({ name, rationale: "live walk", params });
    expect(created.status).toBe("Draft");
    const edited = await api.updateScenario(created.id, { name, rationale: "edited", params });
    expect(edited.rationale).toBe("edited");

    const submitted = await api.submitScenario(created.id);
    expect(submitted.status).toBe("Submitted");
    expect(await code(api.updateScenario(created.id, { name, rationale: "late", params }))).toBe(409);
    expect(await code(api.approveScenario(created.id, "self"))).toBe(403);

    await signIn("Reviewer");
    expect(await code(api.approveScenario(created.id, ""))).toBe(422);
    const approved = await api.approveScenario(created.id, "Looks reasonable");
    expect(approved.status).toBe("Approved");
    const audit = await api.getAudit(created.id);
    expect(audit.map((a) => a.toStatus)).toEqual(["Draft", "Draft", "Submitted", "Approved"]) // created, edited, submitted, approved;
  });

  it("unauthenticated calls return 401", async () => {
    setSession(null);
    expect(await code(api.listScenarios())).toBe(401);
  });
});
