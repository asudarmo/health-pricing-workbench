import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/api/client";
import { PageHeader, PremiumBanner } from "@/components/app-shell";
import { SectionCard, StatusBadge } from "@/components/scenario-parts";
import { fmtDate, fmtGBP0, fmtNum } from "@/lib/format";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home · Health Pricing Workbench" },
      { name: "description", content: "Active pricing model, headline A/E, recalibration flags and scenarios awaiting review." },
      { property: "og:title", content: "Home · Health Pricing Workbench" },
      { property: "og:description", content: "Active pricing model, headline A/E, recalibration flags and scenarios awaiting review." },
    ],
  }),
  component: HomePage,
});

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function HomePage() {
  const session = useSession();
  const model = useQuery({ queryKey: ["model"], queryFn: api.getModel, enabled: !!session });
  const monitoring = useQuery({ queryKey: ["monitoring"], queryFn: api.getMonitoring, enabled: !!session });
  const scenarios = useQuery({ queryKey: ["scenarios"], queryFn: api.listScenarios, enabled: !!session });
  const m = model.data;
  const awaiting = scenarios.data?.filter((s) => s.status === "Submitted") ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Home" description="Active model and items needing attention." />
      <PremiumBanner />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active model" value={m ? m.id : "…"} sub={m ? `Fitted ${fmtDate(m.date)} · data ${m.dataYears}` : undefined} />
        <Stat label="Base rate (reference profile)" value={m ? fmtGBP0(m.baseRate) : "…"} sub="Book average about £576" />
        <Stat label="Gini" value={m ? m.validation.gini.toFixed(3) : "…"} sub={m ? `Deviance ${fmtNum(m.validation.deviance)}` : undefined} />
        <Stat label="Headline A/E" value={m ? m.headlineAE.toFixed(2) : "…"} sub={m ? `Trend ${m.trend} · rebase ${m.rebase}` : undefined} />
      </div>
      {m && <p className="mt-2 text-xs text-muted-foreground">{m.scalingNote}.</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={`Recalibration flags (${m?.recalibrationFlagCount ?? "…"})`}
          action={<Link to="/monitoring" className="text-xs text-primary hover:underline">Monitoring</Link>}
        >
          <div className="space-y-2">
            {monitoring.data?.flags.map((f) => (
              <div key={f.id} className="flex gap-3 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                <div>
                  <div className="font-medium">
                    {f.segment}: A/E <span className="num">{f.ae.toFixed(2)}</span> · {f.gapType}
                  </div>
                  <div className="text-xs text-muted-foreground">Exposure {fmtNum(f.exposure)} lives</div>
                  <p className="mt-1 text-sm">{f.note}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard
          title={`Scenarios awaiting review (${awaiting.length})`}
          action={<Link to="/scenarios" className="text-xs text-primary hover:underline">All scenarios</Link>}
        >
          {awaiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing awaiting review.</p>
          ) : (
            <ul className="divide-y">
              {awaiting.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link to="/scenarios/$id/review" params={{ id: s.id }} className="font-medium text-primary hover:underline">
                      {s.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {s.author} · {fmtDate(s.updatedAt)}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
