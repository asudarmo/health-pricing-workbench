import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { ScenarioEditor } from "@/components/scenario-editor";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/scenarios/$id")({
  head: () => ({
    meta: [
      { title: "Scenario editor · Health Pricing Workbench" },
      { name: "description", content: "Edit scenario parameters and see the live premium impact." },
      { property: "og:title", content: "Scenario editor · Health Pricing Workbench" },
      { property: "og:description", content: "Edit scenario parameters and see the live premium impact." },
    ],
  }),
  component: EditScenarioPage,
});

function EditScenarioPage() {
  const { id } = Route.useParams();
  const session = useSession();
  const q = useQuery({ queryKey: ["scenario", id], queryFn: () => api.getScenario(id), enabled: !!session });
  if (q.isError) return <p className="text-sm text-muted-foreground">Scenario could not be loaded.</p>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  // Key on id+status so the form resets when the scenario changes state.
  return <ScenarioEditor key={`${q.data.id}-${q.data.status}`} scenario={q.data} />;
}
