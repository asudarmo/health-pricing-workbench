// Deterministic mock impact engine. Lives only in the mock layer: the real
// backend will compute impact; components only display what the client returns.
import type { Impact, ScenarioParams } from "../types";
import {
  AGE_BANDS,
  BOOK_AE,
  BOOK_AVERAGE,
  CONDITION_KEYS,
  REGIONS,
  RELATIVITIES,
  TOTAL_EXPOSURE,
  baseRelativity,
} from "./data";

interface Cell {
  age: string;
  region: string;
  conditions: string[];
  weight: number;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand: () => number, items: { key: string; w: number }[]): string {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rand() * total;
  for (const i of items) {
    r -= i.w;
    if (r <= 0) return i.key;
  }
  return items[items.length - 1]?.key ?? "";
}

const CELL_COUNT = 1744;
const WEIGHT = TOTAL_EXPOSURE / CELL_COUNT; // 10 lives per cell

// Synthetic, aggregated book built once from exposure shares with a fixed seed.
const BOOK: Cell[] = (() => {
  const rand = mulberry32(20221105);
  const exp = (f: string) =>
    RELATIVITIES.filter((r) => r.factor === f).map((r) => ({ key: r.level, w: r.exposure }));
  const ageW = exp("age");
  const regW = exp("region");
  const condP = CONDITION_KEYS.map((k) => ({
    k,
    p: (RELATIVITIES.find((r) => r.factor === k && r.level === "present")?.exposure ?? 0) / TOTAL_EXPOSURE,
  }));
  return Array.from({ length: CELL_COUNT }, () => ({
    age: pick(rand, ageW),
    region: pick(rand, regW),
    conditions: condP.filter((c) => rand() < c.p).map((c) => c.k),
    weight: WEIGHT,
  }));
})();

function premium(cell: Cell, rel: (f: string, l: string) => number): number {
  let p = rel("age", cell.age) * rel("region", cell.region);
  for (const k of CONDITION_KEYS) p *= rel(k, cell.conditions.includes(k) ? "present" : "absent");
  return p;
}

const RAW_MEAN = BOOK.reduce((s, c) => s + premium(c, baseRelativity), 0) / BOOK.length;
const SCALE = BOOK_AVERAGE / RAW_MEAN; // calibrates book average to about £576

const BUCKETS: { label: string; max: number }[] = [
  { label: "< -15%", max: -15 },
  { label: "-15 to -10%", max: -10 },
  { label: "-10 to -5%", max: -5 },
  { label: "-5 to 0%", max: 0 },
  { label: "0 to +5%", max: 5 },
  { label: "+5 to +10%", max: 10 },
  { label: "+10 to +15%", max: 15 },
  { label: "> +15%", max: Infinity },
];

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeImpact(params: ScenarioParams): Impact {
  const overrides = new Map(params.relativityChanges.map((c) => [`${c.factor}|${c.level}`, c.newRelativity]));
  const newRel = (f: string, l: string) => overrides.get(`${f}|${l}`) ?? baseRelativity(f, l);
  const baseMult = 1 + params.baseRateChangePct / 100;
  const cap = Math.max(0, params.capPct);
  const floor = Math.max(0, params.floorPct);

  const hist = BUCKETS.map(() => 0);
  let capped = 0;
  let floored = 0;
  let oldTotal = 0;
  let newTotal = 0;
  const seg = new Map<string, { old: number; new: number }>();

  for (const c of BOOK) {
    const oldP = premium(c, baseRelativity) * SCALE;
    let change = ((premium(c, newRel) * SCALE * baseMult) / oldP - 1) * 100;
    if (change > cap) {
      change = cap;
      capped += c.weight;
    } else if (change < -floor) {
      change = -floor;
      floored += c.weight;
    }
    const newP = oldP * (1 + change / 100);
    oldTotal += oldP * c.weight;
    newTotal += newP * c.weight;
    const bi = BUCKETS.findIndex((b) => change < b.max || b.max === Infinity);
    hist[bi] = (hist[bi] ?? 0) + c.weight;

    const ageSeg = AGE_BANDS.indexOf(c.age) >= AGE_BANDS.indexOf("60-64") ? "Age 60+" : "Age under 60";
    const keys = [ageSeg, `Region ${c.region}`, c.conditions.length ? "Any condition" : "No conditions"];
    for (const k of keys) {
      const s = seg.get(k) ?? { old: 0, new: 0 };
      s.old += oldP * c.weight;
      s.new += newP * c.weight;
      seg.set(k, s);
    }
  }

  const order = ["Age under 60", "Age 60+", ...REGIONS.map((r) => `Region ${r}`), "No conditions", "Any condition"];
  const averageChangePct = (newTotal / oldTotal - 1) * 100;
  return {
    averageChangePct: round(averageChangePct, 2),
    histogram: BUCKETS.map((b, i) => ({ bucket: b.label, policies: Math.round(hist[i] ?? 0) })),
    cappedPolicies: Math.round(capped),
    flooredPolicies: Math.round(floored),
    projectedAE: round(BOOK_AE / (newTotal / oldTotal), 3),
    affectedSegments: order
      .filter((k) => seg.has(k))
      .map((k) => ({ segment: k, averageChangePct: round((seg.get(k)!.new / seg.get(k)!.old - 1) * 100, 2) })),
  };
}
