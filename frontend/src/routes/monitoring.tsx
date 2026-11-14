import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/api/client";
import { PageHeader } from "@/components/app-shell";
import { byExposure, FlagCard } from "@/components/flag-list";
import { SectionCard } from "@/components/scenario-parts";
import { Term } from "@/components/term";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtGBP0, fmtNum } from "@/lib/format";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/monitoring")({
  head: () => ({
    meta: [
      { title: "Monitoring · Health Pricing Workbench" },
      { name: "description", content: "Actual versus expected, population stability and recalibration flags." },
      { property: "og:title", content: "Monitoring · Health Pricing Workbench" },
      { property: "og:description", content: "Actual versus expected, population stability and recalibration flags." },
    ],
  }),
  component: MonitoringPage,
});

const uniq = (xs: string[]) => [...new Set(xs)];
const FACTOR_LABEL: Record<string, string> = { age: "Age", region: "Region", conditions: "Conditions" };

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {FACTOR_LABEL[o] ?? o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MonitoringPage() {
  const session = useSession();
  const mon = useQuery({ queryKey: ["monitoring"], queryFn: api.getMonitoring, enabled: !!session });
  const [factor, setFactor] = useState("age");
  const [segment, setSegment] = useState("All");
  const [period, setPeriod] = useState("2023");

  const ae = mon.data?.ae ?? [];
  const rows = useMemo(
    () => ae.filter((r) => r.factor === factor && r.segment === segment && r.period === period),
    [ae, factor, segment, period],
  );
  const aeTone = (v: number) => (v >= 1.08 ? "text-destructive font-semibold" : v <= 0.92 ? "text-success font-semibold" : "");
  const aeFill = (v: number) => (v >= 1.08 ? "var(--destructive)" : v <= 0.92 ? "var(--success)" : "var(--foreground)");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Monitoring" description="Aggregated experience only. A/E above 1.00 means claims ran higher than expected." />

      {mon.data && mon.data.flags.length > 0 && (
        <div className="mb-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            {mon.data.flags.length} <Term k="recalibration">recalibration flags</Term> from the pricing service, largest <Term k="exposure">exposure</Term> first.
          </p>
          {(["level shift", "change in shape"] as const).map((gap) => {
            const group = byExposure(mon.data.flags.filter((f) => f.gapType === gap));
            if (group.length === 0) return null;
            return (
              <section key={gap}>
                <h2 className="mb-2 text-sm font-semibold">
                  <Term k={gap === "level shift" ? "levelShift" : "changeInShape"}>{gap === "level shift" ? "Level shift" : "Change in shape"}</Term> ({group.length})
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.map((f) => (
                    <FlagCard key={f.id} flag={f} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-4">
        <Filter label="Factor" value={factor} options={uniq(ae.map((r) => r.factor))} onChange={setFactor} />
        <Filter label="Segment" value={segment} options={uniq(ae.map((r) => r.segment))} onChange={setSegment} />
        <Filter label="Period" value={period} options={uniq(ae.map((r) => r.period))} onChange={setPeriod} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <SectionCard title="A/E by level">
          <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-destructive" />1.08 or more: claims higher than expected, so prices may be too low</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-foreground" />Between: close to expected</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-success" />0.92 or less: claims lower than expected, so prices may be too high</li>
          </ul>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="level" tick={{ fontSize: 11 }} interval={0} />
                <YAxis domain={[0.8, 1.2]} ticks={[0.8, 0.9, 1, 1.1, 1.2]} allowDataOverflow tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [v.toFixed(3), "A/E"]} />
                <ReferenceLine y={1} stroke="var(--foreground)" strokeDasharray="4 4" />
                <Bar dataKey="ae" radius={[2, 2, 0, 0]}>
                  {rows.map((r) => (
                    <Cell key={r.level} fill={aeFill(r.ae)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="A/E table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead className="text-right"><Term k="exposure">Exposure</Term></TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right"><Term k="ae">A/E</Term></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.level}>
                  <TableCell>{r.level}</TableCell>
                  <TableCell className="num text-right">{fmtNum(r.exposure)}</TableCell>
                  <TableCell className="num text-right">{fmtGBP0(r.actual)}</TableCell>
                  <TableCell className="num text-right">{fmtGBP0(r.expected)}</TableCell>
                  <TableCell className={`num text-right ${aeTone(r.ae)}`}>{r.ae.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>

      <div className="mt-4 max-w-xl">
        <SectionCard title="Population stability index (PSI)">
          <p className="mb-2 text-xs text-muted-foreground">
            <Term k="psi">What does PSI show?</Term>
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factor</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">PSI</TableHead>
                <TableHead>Reading</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mon.data?.psi.map((p) => (
                <TableRow key={`${p.factor}-${p.period}`}>
                  <TableCell>{FACTOR_LABEL[p.factor] ?? p.factor}</TableCell>
                  <TableCell>{p.period}</TableCell>
                  <TableCell className="num text-right">{p.psi.toFixed(2)}</TableCell>
                  <TableCell className={p.psi >= 0.1 ? "text-warning-foreground font-medium" : "text-muted-foreground"}>
                    {p.psi >= 0.25 ? "Significant shift" : p.psi >= 0.1 ? "Moderate shift" : "Stable"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </div>
  );
}
