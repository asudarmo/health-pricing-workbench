import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/api/client";
import type { ScenarioStatus } from "@/api/types";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/scenario-parts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/scenarios/")({
  head: () => ({
    meta: [
      { title: "Scenarios · Health Pricing Workbench" },
      { name: "description", content: "Pricing change scenarios with status, author and review progress." },
      { property: "og:title", content: "Scenarios · Health Pricing Workbench" },
      { property: "og:description", content: "Pricing change scenarios with status, author and review progress." },
    ],
  }),
  component: ScenariosPage,
});

const STATUSES: (ScenarioStatus | "All")[] = ["All", "Draft", "Submitted", "Approved", "Rejected"];

function ScenariosPage() {
  const session = useSession();
  const list = useQuery({ queryKey: ["scenarios"], queryFn: api.listScenarios, enabled: !!session });
  const [status, setStatus] = useState<string>("All");
  const rows = (list.data ?? []).filter((s) => status === "All" || s.status === status);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Scenarios"
        description="Draft → Submitted → Approved or Rejected. Only drafts can be edited."
        actions={
          <Button asChild>
            <Link to="/scenarios/new">
              <Plus className="h-4 w-4" /> New scenario
            </Link>
          </Button>
        }
      />
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  {s.status === "Draft" ? (
                    <Link to="/scenarios/$id" params={{ id: s.id }} className="text-primary hover:underline">
                      {s.name}
                    </Link>
                  ) : (
                    <Link to="/scenarios/$id/review" params={{ id: s.id }} className="text-primary hover:underline">
                      {s.name}
                    </Link>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
                <TableCell className={s.author.includes("AI assistant") ? "italic text-muted-foreground" : ""}>{s.author}</TableCell>
                <TableCell>{fmtDate(s.updatedAt)}</TableCell>
                <TableCell className="text-right text-xs">
                  <Link to="/scenarios/$id" params={{ id: s.id }} className="text-muted-foreground hover:text-foreground">
                    {s.status === "Draft" ? "Edit" : "Open"}
                  </Link>
                  <span className="mx-2 text-border">|</span>
                  <Link to="/scenarios/$id/review" params={{ id: s.id }} className="text-muted-foreground hover:text-foreground">
                    Review
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {list.data && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No scenarios with this status.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
