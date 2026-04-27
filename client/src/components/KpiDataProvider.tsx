import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useKpiData, type KpiData } from "@/lib/useKpiData";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const KpiDataContext = createContext<KpiData | null>(null);

type KpiMeta = {
  isRefreshing: boolean;
  handleForceUpdate: () => Promise<void>;
};
const KpiMetaContext = createContext<KpiMeta>({ isRefreshing: false, handleForceUpdate: async () => {} });

export function useKpi(): KpiData {
  const ctx = useContext(KpiDataContext);
  if (!ctx) throw new Error("useKpi must be used within KpiDataProvider");
  return ctx;
}

/** Safe version — returns null if data isn't loaded yet (for use in Layout/sidebar) */
export function useKpiSafe(): KpiData | null {
  return useContext(KpiDataContext);
}

/** Meta hook — refresh state + handler, for integration into header/status bar */
export function useKpiMeta(): KpiMeta {
  return useContext(KpiMetaContext);
}

export function KpiDataProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error, isFetching, refetch } = useKpiData();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleForceUpdate = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await apiRequest("POST", "/api/kpi-data/refresh");
      await queryClient.invalidateQueries({ queryKey: ["/api/kpi-data"] });
    } catch (err) {
      console.error("Force refresh failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <KpiDataContext.Provider value={data ?? null}>
      <KpiMetaContext.Provider value={{ isRefreshing, handleForceUpdate }}>
      {children}
      {/* Loading overlay — shown inside Layout so sidebar remains visible */}
      {(isLoading || (!data && isFetching)) && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto" style={{ color: "hsl(var(--baby-blue-500))" }} />
            <div className="text-sm text-muted-foreground">
              Loading live data from Google Sheets...
            </div>
            <div className="text-xs text-muted-foreground/60">
              This may take a few seconds on first load
            </div>
          </div>
        </div>
      )}
      {/* Error overlay */}
      {!isLoading && (error || (!data && !isFetching)) && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertTriangle className="h-8 w-8 text-status-yellow mx-auto" />
            <div className="text-sm text-muted-foreground">
              Unable to load KPI data. Please try again.
            </div>
            <div className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Connection error"}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-2"
              data-testid="button-retry-data"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      )}
      {/* Live indicator is now integrated into Layout header — no floating overlay */}
      </KpiMetaContext.Provider>
    </KpiDataContext.Provider>
  );
}
