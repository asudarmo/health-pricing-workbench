import type { AERow, Monitoring } from "../types";
import { REGIONS } from "./data";

// Aggregated A/E only — no person-level records.
const AGE_GROUPS = ["0-17", "18-39", "40-59", "60-79", "80+"];
const SEGMENTS = ["All", "Under 60", "60+"];
const PERIODS = ["2022", "2023"];

function inSegment(level: string, segment: string): boolean {
  if (segment === "All") return true;
  const old = level === "60-79" || level === "80+";
  return segment === "60+" ? old : !old;
}

function aeFor(factor: string, level: string, segment: string, period: string, i: number): number {
  const wobble = ((i * 37) % 9) / 100 - 0.04; // -0.04..+0.04, deterministic
  const sixtyPlus = segment === "60+" || (factor === "age" && (level === "60-79" || level === "80+"));
  if (period === "2023" && sixtyPlus) return 1.12 + wobble / 4;
  return 1 + wobble + (period === "2023" ? 0.01 : 0);
}

const rows: AERow[] = [];
let i = 0;
for (const period of PERIODS) {
  for (const segment of SEGMENTS) {
    const levels: [string, string, number][] = [
      ...AGE_GROUPS.filter((l) => inSegment(l, segment)).map((l): [string, string, number] => ["age", l, 3400]),
      ...REGIONS.map((l): [string, string, number] => [
        "region",
        l,
        segment === "All" ? 4360 : segment === "60+" ? 1180 : 3180,
      ]),
    ];
    for (const [factor, level, baseExp] of levels) {
      i++;
      const exposure = Math.round(baseExp * (0.85 + ((i * 13) % 30) / 100));
      const expected = Math.round(exposure * 576 * (factor === "age" && level >= "60" ? 1.4 : 1));
      const ae = Math.round(aeFor(factor, level, segment, period, i) * 1000) / 1000;
      rows.push({ factor, level, segment, period, exposure, expected, actual: Math.round(expected * ae), ae });
    }
  }
}

export const MONITORING: Monitoring = {
  ae: rows,
  psi: [
    { factor: "age", period: "2022", psi: 0.02 },
    { factor: "age", period: "2023", psi: 0.14 },
    { factor: "region", period: "2022", psi: 0.03 },
    { factor: "region", period: "2023", psi: 0.05 },
    { factor: "conditions", period: "2022", psi: 0.04 },
    { factor: "conditions", period: "2023", psi: 0.09 },
  ],
  flags: [
    {
      id: "flag-60plus",
      segment: "60+",
      ae: 1.12,
      exposure: 5474,
      gapType: "level shift",
      note: "A/E of 1.12 across all 60+ bands in 2023 with a stable shape; consider a uniform uplift to 60+ relativities.",
    },
  ],
};
