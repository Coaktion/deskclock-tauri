import { useState } from "react";
import { RunningTaskProvider } from "@presentation/contexts/RunningTaskContext";
import { Sidebar, type Page } from "@presentation/components/Sidebar";
import { ExecutionOverlay } from "@presentation/overlays/ExecutionOverlay";
import { TasksPage } from "@presentation/pages/TasksPage";
import { DataPage } from "@presentation/pages/DataPage";
import { PlaceholderPage } from "@presentation/pages/PlaceholderPage";

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case "tasks":    return <TasksPage />;
    case "data":     return <DataPage />;
    case "planning": return <PlaceholderPage title="Planejamento" />;
    case "history":  return <PlaceholderPage title="Histórico" />;
    case "settings": return <PlaceholderPage title="Configurações" />;
  }
}

function App() {
  const [page, setPage] = useState<Page>("tasks");

  return (
    <RunningTaskProvider>
      <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <Sidebar current={page} onChange={setPage} />
        <main className="flex-1 ml-14 overflow-hidden">
          <PageContent page={page} />
        </main>
        <ExecutionOverlay />
      </div>
    </RunningTaskProvider>
  );
}

export default App;
