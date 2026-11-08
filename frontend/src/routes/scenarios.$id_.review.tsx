import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { PageHeader, PremiumBanner } from "@/components/app-shell";
import { AuditTrail, ImpactView, ParamsView, SectionCard, StatusBadge } from "@/components/scenario-parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/lib/format";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/scenarios/$id_/review")({
  head: () => ({
    meta: [
      { title: "Scenario review · Health Pricing Workbench" },
      { name: "description", content: "Review a pricing scenario's rationale, parameters, impact and audit trail." },
      { property: "og:title", content: "Scenario review · Health Pricing Workbench" },
      { property: "og:description", content: "Review a pricing scenario's rationale, parameters, impact and audit trail." },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { id } = Route.useParams();
  const session = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

  const sc = useQuery({ queryKey: ["scenario", id], queryFn: () => api.getScenario(id), enabled: !!session });
  const audit = useQuery({ queryKey: ["audit", id], queryFn: () => api.getAudit(id), enabled: !!session });
  const model = useQuery({ queryKey: ["model"], queryFn: api.getModel, enabled: !!session });
  const rels = useQuery({ queryKey: ["relativities"], queryFn: api.getRelativities, enabled: !!session });
  const current = (f: string, l: string) => rels.data?.find((r) => r.factor === f && r.level === l)?.relativity;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["scenario", id] });
    qc.invalidateQueries({ queryKey: ["audit", id] });
    qc.invalidateQueries({ queryKey: ["scenarios"] });
  };

  const decide = useMutation({
    mutationFn: (kind: "approve" | "reject") => {
      if (!comment.trim()) throw new Error("A comment is required to approve or reject.");
      return kind === "approve" ? api.approveScenario(id, comment) : api.rejectScenario(id, comment);
    },
    onSuccess: (s) => {
      toast.success(`Scenario ${s.status.toLowerCase()}`);
      setComment("");
      refresh();
    },
  });

  const copy = useMutation({
    mutationFn: () => {
      const s = sc.data!;
      return api.createScenario({ name: `${s.name} (copy)`, rationale: s.rationale, params: s.params });
    },
    onSuccess: (s) => {
      toast.success("New draft created");
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      navigate({ to: "/scenarios/$id", params: { id: s.id } });
    },
  });

  const s = sc.data;
  if (sc.isError) return <p className="text-sm text-muted-foreground">Scenario could not be loaded.</p>;
  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const isReviewer = session?.user.role === "Reviewer";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={s.name}
        description={`${s.author} · updated ${fmtDate(s.updatedAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={s.status} />
            <Button variant="outline" asChild>
              <Link to="/scenarios/$id" params={{ id: s.id }}>
                {s.status === "Draft" ? "Edit" : "Open in editor"}
              </Link>
            </Button>
            {s.status === "Rejected" && (
              <Button disabled={copy.isPending} onClick={() => copy.mutate()}>
                Copy to new draft
              </Button>
            )}
          </div>
        }
      />
      <PremiumBanner />
      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <div className="space-y-4">
          <SectionCard title="Rationale">
            <p className="whitespace-pre-wrap text-sm">{s.rationale || "No rationale given."}</p>
          </SectionCard>
          <SectionCard title="Parameters">
            <ParamsView params={s.params} model={model.data} current={current} />
          </SectionCard>
          <SectionCard title="Impact on the book">
            <ImpactView impact={s.impact} />
          </SectionCard>
        </div>
        <div className="space-y-4">
          {isReviewer && s.status === "Submitted" && (
            <SectionCard title="Decision">
              <div className="space-y-2">
                <Label htmlFor="comment">Comment (required)</Label>
                <Textarea id="comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex gap-2">
                  <Button disabled={decide.isPending || !comment.trim()} onClick={() => decide.mutate("approve")}>
                    Approve
                  </Button>
                  <Button variant="destructive" disabled={decide.isPending || !comment.trim()} onClick={() => decide.mutate("reject")}>
                    Reject
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}
          {s.reviewComment && (
            <SectionCard title="Review comment">
              <p className="text-sm">{s.reviewComment}</p>
            </SectionCard>
          )}
          <SectionCard title="Audit trail">
            <AuditTrail entries={audit.data} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
