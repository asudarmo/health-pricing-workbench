import type { Factor, ModelInfo, Relativity } from "../types";

type Row = [string, number, number, number | null, number | null];

const AGE: Row[] = [
  ["00-04", 0.3, 693, 0.177, 0.509],
  ["05-14", 0.231, 2002, 0.164, 0.325],
  ["15-17", 0.459, 634, 0.289, 0.728],
  ["18-24", 0.299, 1169, 0.205, 0.438],
  ["25-29", 0.432, 945, 0.292, 0.637],
  ["30-34", 0.553, 1020, 0.389, 0.785],
  ["35-39", 0.667, 1116, 0.477, 0.932],
  ["40-44", 0.742, 1046, 0.537, 1.024],
  ["45-49", 0.781, 994, 0.57, 1.071],
  ["50-54", 0.825, 1127, 0.619, 1.099],
  ["55-59", 0.892, 1221, 0.682, 1.166],
  ["60-64", 0.963, 1283, 0.747, 1.241],
  ["65-69", 0.963, 1300, null, null],
  ["70-74", 0.963, 1168, 0.751, 1.232],
  ["75-79", 0.963, 785, 0.731, 1.266],
  ["80+", 0.963, 938, 0.736, 1.258],
];

const REGION: Row[] = [
  ["Northeast", 1.152, 2771, 0.971, 1.366],
  ["Midwest", 1.187, 3505, 1.009, 1.395],
  ["South", 1.0, 6704, 1.0, 1.0],
  ["West", 1.09, 4460, 0.935, 1.271],
];

const CONDITIONS: { key: string; label: string; row: [number, number, number, number] }[] = [
  { key: "cond_hbp", label: "High blood pressure", row: [1.108, 5312, 0.959, 1.28] },
  { key: "cond_chd", label: "Coronary heart disease", row: [1.382, 841, 1.096, 1.743] },
  { key: "cond_ohd", label: "Other heart disease", row: [1.226, 1716, 1.034, 1.452] },
  { key: "cond_chol", label: "High cholesterol", row: [0.996, 5013, 0.864, 1.146] },
  { key: "cond_cancer", label: "Cancer", row: [1.767, 1862, 1.505, 2.074] },
  { key: "cond_arthritis", label: "Arthritis", row: [1.674, 4186, 1.452, 1.928] },
  { key: "cond_asthma", label: "Asthma", row: [1.277, 2449, 1.09, 1.495] },
];

export const TOTAL_EXPOSURE = REGION.reduce((s, r) => s + r[2], 0); // 17,440

export const AGE_BANDS = AGE.map((r) => r[0]);
export const REGIONS = REGION.map((r) => r[0]);
export const CONDITION_KEYS = CONDITIONS.map((c) => c.key);

export function ageToBand(age: number): string {
  const a = Math.max(0, Math.min(100, Math.floor(age)));
  if (a >= 80) return "80+";
  const edges = [0, 5, 15, 18, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
  let idx = 0;
  for (let i = 0; i < edges.length; i++) if (a >= (edges[i] ?? 0)) idx = i;
  return AGE_BANDS[idx] ?? "80+";
}

export const FACTORS: Factor[] = [
  { key: "age", label: "Age band", group: "age", levels: AGE.map((r) => ({ value: r[0], label: r[0] })) },
  { key: "region", label: "Region", group: "region", levels: REGION.map((r) => ({ value: r[0], label: r[0] })) },
  ...CONDITIONS.map((c) => ({
    key: c.key,
    label: c.label,
    group: "condition" as const,
    levels: [
      { value: "absent", label: "Absent" },
      { value: "present", label: "Present" },
    ],
  })),
];

export const RELATIVITIES: Relativity[] = [
  ...AGE.map(([level, relativity, exposure, lower, upper]) => ({ factor: "age", level, relativity, exposure, lower, upper })),
  ...REGION.map(([level, relativity, exposure, lower, upper]) => ({ factor: "region", level, relativity, exposure, lower, upper })),
  ...CONDITIONS.flatMap((c) => [
    { factor: c.key, level: "absent", relativity: 1, exposure: TOTAL_EXPOSURE - c.row[1], lower: null, upper: null },
    { factor: c.key, level: "present", relativity: c.row[0], exposure: c.row[1], lower: c.row[2], upper: c.row[3] },
  ]),
];

export function baseRelativity(factor: string, level: string): number {
  return RELATIVITIES.find((r) => r.factor === factor && r.level === level)?.relativity ?? 1;
}

export const BOOK_AVERAGE = 576;
export const BOOK_AE = 1.03;

export const MODEL: ModelInfo = {
  id: "v1",
  date: "2026-11-05",
  dataYears: "2022",
  trend: 1.019,
  rebase: 1.06,
  validation: { deviance: 838173, gini: 0.378 },
  baseRate: 556,
  currency: "GBP",
  scalingNote: "Scaled to a mean of about £576 per life, ABI 2023, all covered lives",
  factors: FACTORS,
  headlineAE: BOOK_AE,
  recalibrationFlagCount: 1,
};
