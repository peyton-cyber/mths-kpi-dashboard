import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";
import { Layout } from "@/components/Layout";
import { KpiDataProvider, useKpiSafe } from "@/components/KpiDataProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { useAuth } from "@/lib/useAuth";
import Overview from "@/pages/Overview";
import Acquisitions from "@/pages/Acquisitions";
import Dispositions from "@/pages/Dispositions";
import Transactions from "@/pages/Transactions";
import Marketing from "@/pages/Marketing";
import Leadership from "@/pages/Leadership";
import AcqScorecard from "@/pages/AcqScorecard";
import Employees from "@/pages/Employees";
import TvMode from "@/pages/TvMode";

/** Map route paths to the department(s) that can see them */
const ROUTE_DEPARTMENTS: Record<string, string[]> = {
  "/": [], // everyone can see overview
  "/acquisitions": ["acquisitions"],
  "/dispositions": ["dispositions"],
  "/transactions": ["transactions"],
  "/marketing": ["marketing"],
  "/leadership": ["leadership"],
  "/scorecard": ["acquisitions"],
  "/employees": [],
  "/admin": [], // guarded separately by isAdmin
};

function canAccess(userDepts: string, routePath: string): boolean {
  const depts = userDepts.split(",").filter(Boolean);
  // "all" = can see everything
  if (depts.includes("all")) return true;
  const required = ROUTE_DEPARTMENTS[routePath];
  // No specific department required (overview, admin)
  if (!required || required.length === 0) return true;
  // Check if user has at least one matching department
  return required.some((d) => depts.includes(d));
}

/** Wrapper that shows login if not authenticated */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "hsl(var(--baby-blue-500))", borderTopColor: "transparent" }} />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <>{children}</>;
}

/** Wrapper for admin-only routes */
function AdminRoute() {
  const { user } = useAuth();
  if (!user?.isAdmin) {
    return <Redirect to="/" />;
  }
  return <Admin />;
}

/** Wrapper for department-gated routes */
function DeptRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType;
}) {
  const { user } = useAuth();
  if (!user || !canAccess(user.departments, path)) {
    return <Redirect to="/" />;
  }
  return <Component />;
}

function AppRouter() {
  const kpiData = useKpiSafe();
  // Show nothing while data loads — the KpiDataProvider shows a loading overlay
  if (!kpiData) return null;
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/acquisitions">
        <DeptRoute path="/acquisitions" component={Acquisitions} />
      </Route>
      <Route path="/dispositions">
        <DeptRoute path="/dispositions" component={Dispositions} />
      </Route>
      <Route path="/transactions">
        <DeptRoute path="/transactions" component={Transactions} />
      </Route>
      <Route path="/marketing">
        <DeptRoute path="/marketing" component={Marketing} />
      </Route>
      <Route path="/leadership">
        <DeptRoute path="/leadership" component={Leadership} />
      </Route>
      <Route path="/scorecard">
        <DeptRoute path="/scorecard" component={AcqScorecard} />
      </Route>
      <Route path="/employees/:slug" component={Employees} />
      <Route path="/employees" component={Employees} />
      <Route path="/admin">
        <AdminRoute />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

/** TV mode — fullscreen, no sidebar, auto-cycles through pages */
function TvRouter() {
  const kpiData = useKpiSafe();
  if (!kpiData) return null;
  return <TvMode />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthProvider>
          <Router hook={useHashLocation}>
            <AuthGate>
              <KpiDataProvider>
                <Switch>
                  {/* TV mode — no Layout wrapper, fullscreen */}
                  <Route path="/tv">
                    <TvRouter />
                  </Route>
                  {/* Normal mode — with sidebar layout */}
                  <Route>
                    <Layout>
                      <AppRouter />
                    </Layout>
                  </Route>
                </Switch>
              </KpiDataProvider>
            </AuthGate>
          </Router>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
