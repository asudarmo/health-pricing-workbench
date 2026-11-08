import { Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { RelativityChange, Scenario, ScenarioInput, ScenarioParams } from "@/api/types";
import { PageHeader, PremiumBanner } from "@/components/app-shell";
import { ImpactView, SectionCard, StatusBadge, factorLabel } from "@/components/scenario-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtRel } from "@/lib/format";
import { useSession } from "@/lib/session";

const EMPTY: ScenarioInput = {
  name: "",
  rationale: "",
  params: { baseRateChangePct: 0, relativityChanges: [], capPct: 15, floorPct: 10 },
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ScenarioEditor({ scenario }: { scenario?: Scenario }) {
  const session = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const readOnly = !!scenario && scenario.status !== "Draft";
  const [form, setForm] = useState<ScenarioInput>(
    scenario ? { name: scenario.name, rationale: scenario.rationale, params: scenario.params } : EMPTY,
  );

  const model = useQuery({ queryKey: ["model"], queryFn: api.getModel, enabled: !!session });
  const rels = useQuery({ queryKey: ["relativities"], queryFn: api.getRelativities, enabled: !!session });
  const current = (f: string, l: string) => rels.data?.find((r) => r.factor === f && r.level === l)?.relativity;

  const debouncedParams = useDebounced(form.params, 400);
  const impact = useQuery({
    queryKey: ["impact", debouncedParams],
    queryFn: () => api.computeImpact(debouncedParams),
    enabled: !!session && !readOnly,
    placeholderData: keepPreviousData,
  });
  const shownImpact = readOnly ? scenario?.impact : impact.data;

  const setParams = (p: Partial<ScenarioParams>) => setForm((f) => ({ ...f, params: { ...f.params, ...p } }));
  const setChange = (i: number, c: Partial<RelativityChange>) =>
    setParams({ relativityChanges: form.params.relativityChanges.map((x, j) => (j === i ? { ...x, ...c } : x)) });

  const save = async (): Promise<Scenario> => {
    if (!form.name.trim()) {
      throw new Error("Give the scenario a name before saving.");
    }
    return scenario ? api.updateScenario(scenario.id, form) : api.createScenario(form);
  };

  const saveMut = useMutation({
    mutationFn: save,
    onSuccess: (s) => {
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      qc.setQueryData(["scenario", s.id], s);
      if (!scenario) navigate({ to: "/scenarios/$id", params: { id: s.id } });
    },
  });
  const submitMut = useMutation({
    mutationFn: async () => api.submitScenario((await save()).id),
    onSuccess: (s) => {
      toast.success("Submitted for review");
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      qc.invalidateQueries({ queryKey: ["scenario", s.id] });
      qc.invalidateQueries({ queryKey: ["audit", s.id] });
      navigate({ to: "/scenarios/$id/review", params: { id: s.id } });
    },
  });
  const busy = saveMut.isPending || submitMut.isPending;

  const changeable = (rels.data ?? []).filter((r) => !(r.factor.startsWith("cond_") && r.level === "absent") && !(r.factor === "region" && r.level === "South"));
  const levelOptions = (factor: string) => changeable.filter((r) => r.factor === factor);
  const factorOptions = model.data?.factors.filter((f) => levelOptions(f.key).length > 0) ?? [];

  const addChange = () => {
    const first = changeable.find(
      (r) => !form.params.relativityChanges.some((c) => c.factor === r.factor && c.level === r.level),
    );
    if (first) setParams({ relativityChanges: [...form.params.relativityChanges, { factor: first.factor, level: first.level, newRelativity: first.relativity }] });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={scenario ? scenario.name : "New scenario"}
        description={scenario ? `${scenario.author}` : "Changes are previewed live; nothing is saved until you choose Save draft."}
        actions={
          <div className="flex items-center gap-2">
            {scenario && <StatusBadge status={scenario.status} />}
            {scenario && (
              <Button variant="outline" asChild>
                <Link to="/scenarios/$id/review" params={{ id: scenario.id }}>
                  Review view
                </Link>
              </Button>
            )}
            {!readOnly && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => saveMut.mutate()}>
                  Save draft
                </Button>
                <Button disabled={busy} onClick={() => submitMut.mutate()}>
                  Submit for review
                </Button>
              </>
            )}
          </div>
        }
      />
      <PremiumBanner />
      {readOnly && (
        <div className="mb-4 flex items-center gap-2 rounded-md border bg-muted px-4 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> This scenario is {scenario?.status} and opens read-only.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <div className="space-y-4">
          <SectionCard title="Details">
            <fieldset disabled={readOnly} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rationale">Rationale</Label>
                <Textarea
                  id="rationale"
                  rows={4}
                  placeholder="Cite the A/E and exposure that support this change."
                  value={form.rationale}
                  onChange={(e) => setForm({ ...form, rationale: e.target.value })}
                />
              </div>
            </fieldset>
          </SectionCard>

          <SectionCard title="Parameters">
            <fieldset disabled={readOnly} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <NumField label="Base rate change (%)" step={0.1} value={form.params.baseRateChangePct} onChange={(v) => setParams({ baseRateChangePct: v })} />
                <NumField label="Cap: max increase (%)" step={1} min={0} value={form.params.capPct} onChange={(v) => setParams({ capPct: v })} />
                <NumField label="Floor: max decrease (%)" step={1} min={0} value={form.params.floorPct} onChange={(v) => setParams({ floorPct: v })} />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Relativity changes</Label>
                  {!readOnly && (
                    <Button type="button" size="sm" variant="outline" onClick={addChange}>
                      <Plus className="h-3.5 w-3.5" /> Add change
                    </Button>
                  )}
                </div>
                {form.params.relativityChanges.length === 0 && <p className="text-sm text-muted-foreground">No relativity changes.</p>}
                <div className="space-y-2">
                  {form.params.relativityChanges.map((c, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_80px_100px_32px] items-center gap-2">
                      <Select
                        value={c.factor}
                        disabled={readOnly}
                        onValueChange={(f) => {
                          const lvl = levelOptions(f)[0];
                          if (!lvl) return;
                          setChange(i, { factor: f, level: lvl.level, newRelativity: lvl.relativity });
                        }}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {factorOptions.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={c.level}
                        disabled={readOnly}
                        onValueChange={(l) => setChange(i, { level: l, newRelativity: current(c.factor, l) ?? 1 })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {levelOptions(c.factor).map((r) => (
                            <SelectItem key={r.level} value={r.level}>
                              {factorLabel(model.data, r.factor, r.level).replace(/^.*?: /, "")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="num text-right text-xs text-muted-foreground">was {fmtRel(current(c.factor, c.level) ?? null)}</span>
                      <Input
                        className="num h-8"
                        type="number"
                        step={0.001}
                        min={0.001}
                        value={c.newRelativity}
                        onChange={(e) => setChange(i, { newRelativity: Number(e.target.value) })}
                      />
                      {!readOnly && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Remove change"
                          onClick={() => setParams({ relativityChanges: form.params.relativityChanges.filter((_, j) => j !== i) })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </fieldset>
          </SectionCard>
          {scenario?.reviewComment && (
            <SectionCard title="Review comment">
              <p className="text-sm">{scenario.reviewComment}</p>
            </SectionCard>
          )}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <SectionCard title={readOnly ? "Impact" : "Live impact"}>
            <ImpactView impact={shownImpact} loading={!readOnly && (impact.isFetching || debouncedParams !== form.params)} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step, min }: { label: string; value: number; onChange: (v: number) => void; step: number; min?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        className="num"
        type="number"
        step={step}
        min={min}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </div>
  );
}

export { EMPTY as EMPTY_SCENARIO };
