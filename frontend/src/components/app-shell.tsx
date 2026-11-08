import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Activity, BarChart3, Calculator, FileStack, Home, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { setSession, useSession } from "@/lib/session";
import { USE_MOCKS } from "@/api/client";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/quote", label: "Quote", icon: Calculator },
  { to: "/factors", label: "Rating factors", icon: BarChart3 },
  { to: "/monitoring", label: "Monitoring", icon: Activity },
  { to: "/scenarios", label: "Scenarios", icon: FileStack },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (session === null) navigate({ to: "/login" });
  }, [session, navigate]);

  if (!session) return <div className="min-h-screen bg-background" />;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-56 shrink-0 border-r bg-sidebar">
        <div className="border-b px-4 py-4">
          <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">Health Pricing</div>
          <div className="text-xs text-muted-foreground">Workbench</div>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-end gap-3 border-b bg-card px-6 text-sm">
          {USE_MOCKS && (
            <Badge variant="outline" className="border-warning text-warning-foreground bg-warning/15">
              Mock data
            </Badge>
          )}
          <span className="text-foreground">{session.user.name}</span>
          <Badge variant="secondary">{session.user.role}</Badge>
          <button
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSession(null);
              qc.clear();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function PremiumBanner() {
  return (
    <div className="mb-5 rounded-md border border-info/40 bg-info/10 px-4 py-2.5 text-sm text-foreground">
      Risk premium (expected claims cost), illustrative £. Scaled to a UK mean of about £576 per life (ABI 2023, all
      covered lives). The model is fitted on US data.
    </div>
  );
}
