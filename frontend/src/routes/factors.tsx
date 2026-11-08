import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, ErrorBar, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/api/client";
import type { Relativity } from "@/api/types";
import { PageHeader } from "@/components/app-shell";
import { SectionCard } from "@/components/scenario-parts";
import { fmtNum, fmtRel } from "@/lib/format";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/factors")({
  head: () => ({
    meta: [
      { title: "Rating factors · Health Pricing Workbench" },
      { name: "description", content: "Relativities, confidence bands and exposure for each rating factor." },
      { property: "og:title", content: "Rating factors · Health Pricing Workbench" },
      { property: "og:description", content: "Relativities, confidence bands and exposure for each rating factor." },
    ],
  }),
  component: FactorsPage,
});

function FactorsPage() {
  const session = useSession();
  const model = useQuery({ queryKey: ["model"], queryFn: api.getModel, enabled: !!session });
  const rels = useQuery({ queryKey: ["relativities"], queryFn: api.getRelativities, enabled: !!session });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Rating factors" description="Relativity with confidence band (line, left axis) and exposure in lives (bars, right axis)." />
      <div className="grid gap-4 lg:grid-cols-2">
        {model.data?.factors.map((f) => {
          const rows = (rels.data ?? []).filter((r) => r.factor === f.key);
          return (
            <div key={f.key} className={f.group === "age" ? "lg:col-span-2" : ""}>
              <SectionCard title={f.label}>
                <FactorChart rows={rows} labelFor={(v) => f.levels.find((l) => l.value === v)?.label ?? v} />
                {rows.some((r) => r.lower == null || r.upper == null) && (
                  <p className="mt-1 text-xs text-muted-foreground">Levels without a band have no confidence interval available.</p>
                )}
              </SectionCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FactorChart({ rows, labelFor }: { rows: Relativity[]; labelFor: (v: string) => string }) {
  const data = rows.map((r) => ({
    level: labelFor(r.level),
    relativity: r.relativity,
    exposure: r.exposure,
    lower: r.lower,
    upper: r.upper,
    // ErrorBar takes [below, above] offsets; zero when bounds are missing.
    band: r.lower != null && r.upper != null ? [r.relativity - r.lower, r.upper - r.relativity] : [0, 0],
  }));
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="level" tick={{ fontSize: 11 }} interval={0} />
          <YAxis yAxisId="rel" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
          <YAxis yAxisId="exp" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(v)} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0]?.payload as (typeof data)[number];
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                  <div className="mb-1 font-medium">{d.level}</div>
                  <div>Relativity <span className="num">{fmtRel(d.relativity)}</span></div>
                  <div>Band <span className="num">{d.lower == null || d.upper == null ? "not available" : `${fmtRel(d.lower)} to ${fmtRel(d.upper)}`}</span></div>
                  <div>Exposure <span className="num">{fmtNum(d.exposure)}</span> lives</div>
                </div>
              );
            }}
          />
          <Bar yAxisId="exp" dataKey="exposure" fill="var(--chart-2)" fillOpacity={0.45} radius={[2, 2, 0, 0]} />
          <Line yAxisId="rel" dataKey="relativity" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
            <ErrorBar dataKey="band" width={5} stroke="var(--chart-1)" strokeOpacity={0.6} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
