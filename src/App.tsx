import { useState } from "react";
import { RunningTaskProvider } from "@presentation/contexts/RunningTaskContext";
import { Sidebar, type Page } from "@presentation/components/Sidebar";
import { ExecutionOverlay } from "@presentation/overlays/ExecutionOverlay";
import { PlanningOverlay } from "@presentation/overlays/PlanningOverlay";
import { CompactOverlay } from "@presentation/overlays/CompactOverlay";
import { TasksPage } from "@presentation/pages/TasksPage";
import { PlanningPage } from "@presentation/pages/PlanningPage";
import { DataPage } from "@presentation/pages/DataPage";
import { PlaceholderPage } from "@presentation/pages/PlaceholderPage";

type OverlayMode = "planning" | "compact" | "hidden";

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case "tasks":    return <TasksPage />;
    case "planning": return <PlanningPage />;
    case "data":     return <DataPage />;
    case "history":  return <PlaceholderPage title="Histórico" />;
    case "settings": return <PlaceholderPage title="Configurações" />;
  }
}

function App() {
  const [page, setPage] = useState<Page>("tasks");
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("planning");

  return (
    <RunningTaskProvider>
      <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <Sidebar current={page} onChange={setPage} />
        <main className="flex-1 ml-14 overflow-hidden">
          <PageContent page={page} />
        </main>
        <ExecutionOverlay />
        {overlayMode === "planning" && (
          <PlanningOverlay
            onMinimize={() => setOverlayMode("compact")}
            onClose={() => setOverlayMode("hidden")}
            onNavigatePlanning={() => { setPage("planning"); setOverlayMode("hidden"); }}
          />
        )}
        {overlayMode === "compact" && (
          <CompactOverlay onExpand={() => setOverlayMode("planning")} />
        )}
      </div>
    </RunningTaskProvider>
  );
}

export default App;
