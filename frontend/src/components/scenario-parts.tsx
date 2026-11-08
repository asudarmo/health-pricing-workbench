import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AuditEntry, Impact, ModelInfo, ScenarioParams, ScenarioStatus } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime, fmtNum, fmtPct, fmtRel } from "@/lib/format";

const STATUS_CLASS: Record<ScenarioStatus, string> = {
  Draft: "bg-secondary text-secondary-foreground border-border",
  Submitted: "bg-info/15 text-foreground border-info/40",
  Approved: "bg-success/15 text-foreground border-success/40",
  Rejected: "bg-destructive/10 text-destructive border-destructive/40",
};

export function StatusBadge({ status }: { status: ScenarioStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {status}
    </Badge>
  );
}

export function factorLabel(model: ModelInfo | undefined, factor: string, level?: string) {
  const f = model?.factors.find((x) => x.key === factor);
  const fl = f?.label ?? factor;
  if (level === undefined) return fl;
  const ll = f?.levels.find((l) => l.value === level)?.label ?? level;
  return f?.group === "condition" ? `${fl} (${ll.toLowerCase()})` : `${fl}: ${ll}`;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | undefined }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num text-lg font-semibold ${tone === "up" ? "text-destructive" : tone === "down" ? "text-success" : ""}`}>
        {value}
      </div>
    </div>
  );
}

export function ImpactView({ impact, loading }: { impact: Impact | undefined; loading?: boolean }) {
  if (!impact) return <div className="py-10 text-center text-sm text-muted-foreground">Calculating impact…</div>;
  const tone = (n: number) => (n > 0.05 ? "up" : n < -0.05 ? "down" : undefined);
  return (
    <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Metric label="Average premium change" value={fmtPct(impact.averageChangePct, 2)} tone={tone(impact.averageChangePct)} />
        <Metric label="Projected A/E" value={impact.projectedAE.toFixed(3)} />
        <Metric label="Capped lives" value={fmtNum(impact.cappedPolicies)} />
        <Metric label="Floored lives" value={fmtNum(impact.flooredPolicies)} />
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">Dislocation: lives by premium change</div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={impact.histogram} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={44} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [fmtNum(v), "Lives"]} />
              <Bar dataKey="policies" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">Affected segments</div>
        <Table>
          <TableBody>
            {impact.affectedSegments.map((s) => (
              <TableRow key={s.segment}>
                <TableCell className="py-1.5">{s.segment}</TableCell>
                <TableCell className={`num py-1.5 text-right ${tone(s.averageChangePct) === "up" ? "text-destructive" : tone(s.averageChangePct) === "down" ? "text-success" : ""}`}>
                  {fmtPct(s.averageChangePct, 2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ParamsView({
  params,
  model,
  current,
}: {
  params: ScenarioParams;
  model: ModelInfo | undefined;
  current: (factor: string, level: string) => number | undefined;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Base rate change" value={fmtPct(params.baseRateChangePct, 1)} />
        <Metric label="Cap (max increase)" value={`${params.capPct}%`} />
        <Metric label="Floor (max decrease)" value={`${params.floorPct}%`} />
      </div>
      {params.relativityChanges.length === 0 ? (
        <p className="text-muted-foreground">No relativity changes.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factor level</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Proposed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {params.relativityChanges.map((c) => (
              <TableRow key={`${c.factor}|${c.level}`}>
                <TableCell>{factorLabel(model, c.factor, c.level)}</TableCell>
                <TableCell className="num text-right">{fmtRel(current(c.factor, c.level) ?? null)}</TableCell>
                <TableCell className="num text-right font-medium">{fmtRel(c.newRelativity)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function AuditTrail({ entries }: { entries: AuditEntry[] | undefined }) {
  if (!entries) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <ol className="space-y-3">
      {entries.map((e, i) => (
        <li key={i} className="border-l-2 border-primary/40 pl-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{e.action}</span>
            {e.fromStatus && <StatusBadge status={e.fromStatus} />}
            {e.fromStatus && <span className="text-muted-foreground">→</span>}
            <StatusBadge status={e.toStatus} />
          </div>
          <div className="text-xs text-muted-foreground">
            {e.actor} · {fmtDateTime(e.at)}
          </div>
          {e.comment && <p className="mt-1 text-sm italic">“{e.comment}”</p>}
        </li>
      ))}
    </ol>
  );
}

export function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}
