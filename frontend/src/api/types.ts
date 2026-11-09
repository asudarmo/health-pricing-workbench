// Contract types shared by the mock layer and the future FastAPI backend.

export type Role = "Analyst" | "Reviewer";

export interface User {
  name: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export type FactorGroup = "age" | "region" | "condition";

export interface FactorLevel {
  value: string;
  label: string;
}

export interface Factor {
  key: string;
  label: string;
  group: FactorGroup;
  levels: FactorLevel[];
}

export interface ModelInfo {
  id: string;
  date: string; // ISO date
  dataYears: string;
  trend: number;
  rebase: number;
  validation: { deviance: number; gini: number };
  baseRate: number;
  currency: string;
  scalingNote: string;
  illustrativeLabel: string;
  factors: Factor[];
  headlineAE: number;
  recalibrationFlagCount: number;
}

export interface QuoteRequest {
  age: number;
  selections: Record<string, string>;
}

export interface QuoteStep {
  factor: string;
  level: string;
  relativity: number;
  runningAmount: number;
}

export interface QuoteResponse {
  baseRate: number;
  steps: QuoteStep[];
  riskPremium: number;
  illustrativeLabel: string;
  modelVersion: string;
}

export interface Relativity {
  factor: string;
  level: string;
  relativity: number;
  exposure: number;
  lower: number | null;
  upper: number | null;
}

export interface AERow {
  factor: string;
  level: string;
  segment: string;
  period: string;
  actual: number;
  expected: number;
  exposure: number;
  ae: number;
}

export interface PSIRow {
  factor: string;
  period: string;
  psi: number;
}

export interface MonitoringFlag {
  id: string;
  segment: string;
  ae: number;
  exposure: number;
  gapType: "level shift" | "change in shape";
  note: string;
}

export interface Monitoring {
  ae: AERow[];
  psi: PSIRow[];
  flags: MonitoringFlag[];
}

export type ScenarioStatus = "Draft" | "Submitted" | "Approved" | "Rejected";

export interface RelativityChange {
  factor: string;
  level: string;
  newRelativity: number;
}

export interface ScenarioParams {
  baseRateChangePct: number;
  relativityChanges: RelativityChange[];
  /** Maximum individual increase, in %. */
  capPct: number;
  /** Maximum individual decrease, in % (positive number). */
  floorPct: number;
}

export interface Impact {
  averageChangePct: number;
  histogram: { bucket: string; policies: number }[];
  cappedPolicies: number;
  flooredPolicies: number;
  projectedAE: number;
  affectedSegments: { segment: string; averageChangePct: number }[];
}

export interface ScenarioSummary {
  id: string;
  name: string;
  status: ScenarioStatus;
  author: string;
  updatedAt: string; // ISO datetime
}

export interface Scenario extends ScenarioSummary {
  params: ScenarioParams;
  rationale: string;
  impact: Impact;
  reviewComment: string | null;
}

export interface ScenarioInput {
  name: string;
  rationale: string;
  params: ScenarioParams;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  fromStatus: ScenarioStatus | null;
  toStatus: ScenarioStatus;
  comment: string | null;
}
