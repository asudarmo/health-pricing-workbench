import { createFileRoute } from "@tanstack/react-router";
import { ScenarioEditor } from "@/components/scenario-editor";

export const Route = createFileRoute("/scenarios/new")({
  head: () => ({
    meta: [
      { title: "New scenario · Health Pricing Workbench" },
      { name: "description", content: "Draft a pricing change scenario and preview its impact live." },
      { property: "og:title", content: "New scenario · Health Pricing Workbench" },
      { property: "og:description", content: "Draft a pricing change scenario and preview its impact live." },
    ],
  }),
  component: () => <ScenarioEditor />,
});
