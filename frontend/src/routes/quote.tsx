import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import type { Factor, FactorGroup } from "@/api/types";
import { PageHeader, PremiumBanner } from "@/components/app-shell";
import { SectionCard, factorLabel } from "@/components/scenario-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtGBP, fmtRel } from "@/lib/format";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/quote")({
  head: () => ({
    meta: [
      { title: "Quote · Health Pricing Workbench" },
      { name: "description", content: "Build an illustrative risk premium from age, region and declared conditions." },
      { property: "og:title", content: "Quote · Health Pricing Workbench" },
      { property: "og:description", content: "Build an illustrative risk premium from age, region and declared conditions." },
    ],
  }),
  component: QuotePage,
});

const GROUPS: { group: FactorGroup; title: string }[] = [
  { group: "age", title: "Age" },
  { group: "condition", title: "Conditions" },
  { group: "region", title: "Region" },
];

function QuotePage() {
  const session = useSession();
  const model = useQuery({ queryKey: ["model"], queryFn: api.getModel, enabled: !!session });
  const [age, setAge] = useState(40);
  const [selections, setSelections] = useState<Record<string, string>>({});

  // Initialise defaults from whatever factors the model returns.
  useEffect(() => {
    if (!model.data) return;
    setSelections((prev) => {
      const next = { ...prev };
      for (const f of model.data.factors) {
        if (f.group === "age" || next[f.key]) continue;
        next[f.key] = f.group === "condition" ? (f.levels.find((l) => l.value === "absent")?.value ?? f.levels[0]?.value ?? "") : (f.levels[0]?.value ?? "");
      }
      return next;
    });
  }, [model.data]);

  const validAge = Number.isFinite(age) && age >= 0 && age <= 100;
  const quote = useQuery({
    queryKey: ["quote", age, selections],
    queryFn: () => api.createQuote({ age, selections }),
    enabled: !!session && !!model.data && validAge && Object.keys(selections).length > 0,
    placeholderData: keepPreviousData,
  });

  const grouped = useMemo(() => {
    const out: Record<FactorGroup, Factor[]> = { age: [], region: [], condition: [] };
    model.data?.factors.forEach((f) => out[f.group].push(f));
    return out;
  }, [model.data]);

  const presentLevel = (f: Factor) => f.levels.find((l) => l.value === "present")?.value ?? f.levels[f.levels.length - 1]?.value ?? "";
  const absentLevel = (f: Factor) => f.levels.find((l) => l.value === "absent")?.value ?? f.levels[0]?.value ?? "";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Quote" description="Profile inputs are generated from the active model's rating factors." />
      <PremiumBanner />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <SectionCard title="Profile">
          <div className="space-y-5">
            {GROUPS.map(({ group, title }) =>
              grouped[group].length === 0 ? null : (
                <fieldset key={group} className="space-y-2">
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
                  {group === "age" && (
                    <div className="space-y-1">
                      <Label htmlFor="age">Age (0 to 100)</Label>
                      <Input
                        id="age"
                        type="number"
                        min={0}
                        max={100}
                        value={Number.isFinite(age) ? age : ""}
                        onChange={(e) => setAge(e.target.value === "" ? NaN : Number(e.target.value))}
                      />
                      {!validAge && <p className="text-xs text-destructive">Enter an age from 0 to 100.</p>}
                    </div>
                  )}
                  {group === "condition" &&
                    grouped.condition.map((f) => (
                      <label key={f.key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selections[f.key] === presentLevel(f)}
                          onCheckedChange={(c) =>
                            setSelections((s) => ({ ...s, [f.key]: c ? presentLevel(f) : absentLevel(f) }))
                          }
                        />
                        {f.label}
                      </label>
                    ))}
                  {group === "region" &&
                    grouped.region.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label>{f.label}</Label>
                        <Select value={selections[f.key] ?? ""} onValueChange={(v) => setSelections((s) => ({ ...s, [f.key]: v }))}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {f.levels.map((l) => (
                              <SelectItem key={l.value} value={l.value}>
                                {l.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                </fieldset>
              ),
            )}
          </div>
        </SectionCard>

        <SectionCard title="Risk premium (expected claims cost), illustrative £">
          {!quote.data ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Calculating…</p>
          ) : (
            <Table className={quote.isFetching ? "opacity-60" : ""}>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Relativity</TableHead>
                  <TableHead className="text-right">Running amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Base rate</TableCell>
                  <TableCell className="text-muted-foreground">Reference profile</TableCell>
                  <TableCell className="num text-right">—</TableCell>
                  <TableCell className="num text-right">{fmtGBP(quote.data.baseRate)}</TableCell>
                </TableRow>
                {quote.data.steps.map((s) => {
                  const f = model.data?.factors.find((x) => x.key === s.factor);
                  return (
                    <TableRow key={s.factor} className={s.relativity === 1 ? "text-muted-foreground" : ""}>
                      <TableCell>{factorLabel(model.data, s.factor)}</TableCell>
                      <TableCell>{f?.levels.find((l) => l.value === s.level)?.label ?? s.level}</TableCell>
                      <TableCell className="num text-right">× {fmtRel(s.relativity)}</TableCell>
                      <TableCell className="num text-right">{fmtGBP(s.runningAmount)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-semibold">
                    Risk premium (expected claims cost), illustrative £
                  </TableCell>
                  <TableCell className="num text-right text-base font-semibold">{fmtGBP(quote.data.riskPremium)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
