import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, USE_MOCKS } from "@/api/client";
import type { Role } from "@/api/types";
import { setSession, useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · Health Pricing Workbench" },
      { name: "description", content: "Sign in to the Health Pricing Workbench as an analyst or reviewer." },
      { property: "og:title", content: "Sign in · Health Pricing Workbench" },
      { property: "og:description", content: "Sign in to the Health Pricing Workbench as an analyst or reviewer." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const session = useSession();
  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  const login = useMutation({
    mutationFn: (role: Role) => api.login(role),
    onSuccess: (res) => {
      setSession(res);
      navigate({ to: "/" });
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Health Pricing Workbench</h1>
          {USE_MOCKS && <Badge variant="outline">Mock data</Badge>}
        </div>
        <p className="mb-6 text-sm text-muted-foreground">Internal tool. Choose a role to continue.</p>
        <div className="flex flex-col gap-2">
          <Button disabled={login.isPending} onClick={() => login.mutate("Analyst")}>
            Sign in as Analyst
          </Button>
          <Button variant="outline" disabled={login.isPending} onClick={() => login.mutate("Reviewer")}>
            Sign in as Reviewer
          </Button>
        </div>
      </div>
    </div>
  );
}
