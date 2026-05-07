import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import { RepositoriesProvider } from "@presentation/contexts/RepositoriesContext";
import { IntegrationsProvider } from "@presentation/contexts/IntegrationsContext";
import { RunningTaskProvider } from "@presentation/contexts/RunningTaskContext";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { effectiveDuration } from "@domain/usecases/tasks/_helpers";
import { formatHHMMSS } from "@shared/utils/time";
import { AutoSyncProvider, useAutoSync } from "@presentation/contexts/AutoSyncContext";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar, type Page } from "@presentation/components/Sidebar";
import { TitleBar } from "@presentation/components/TitleBar";
import { TasksPage } from "@presentation/pages/TasksPage";
import { PlanningPage } from "@presentation/pages/PlanningPage";
import { HistoryPage } from "@presentation/pages/HistoryPage";
import { DataPage } from "@presentation/pages/DataPage";
import { SettingsPage } from "@presentation/pages/SettingsPage";
import { RetroactivePage } from "@presentation/pages/RetroactivePage";
import { IntegrationsPage } from "@presentation/pages/IntegrationsPage";
import { OVERLAY_EVENTS, type CommandPaletteStartTaskPayload } from "@shared/types/overlayEvents";
import { SetupModal } from "@presentation/modals/SetupModal";
import { useAppearanceSync } from "@presentation/hooks/useAppearanceSync";
import { useGlobalShortcuts } from "@presentation/hooks/useGlobalShortcuts";
import { useStartupWindow } from "@presentation/hooks/useStartupWindow";
import { useDailySyncScheduler } from "@presentation/hooks/useDailySyncScheduler";
import { useUpdateNotifier } from "@presentation/hooks/useUpdateNotifier";
import { useCommandPaletteRouter } from "@presentation/hooks/useCommandPaletteRouter";

function PageContent({
  page,
  setPage,
  focusTaskEdit,
  onFocusTaskEditHandled,
}: {
  page: Page;
  setPage: (p: Page) => void;
  focusTaskEdit: boolean;
  onFocusTaskEditHandled: () => void;
}) {
  switch (page) {
    case "tasks":
      return (
        <TasksPage focusTaskEdit={focusTaskEdit} onFocusTaskEditHandled={onFocusTaskEditHandled} />
      );
    case "planning":
      return <PlanningPage />;
    case "data":
      return <DataPage />;
    case "history":
      return <HistoryPage />;
    case "retroactive":
      return <RetroactivePage />;
    case "integrations":
      return <IntegrationsPage onNavigate={setPage} />;
    case "settings":
      return <SettingsPage />;
  }
}

// MainContent — inside RunningTaskProvider, has access to useRunningTask
function MainContent({
  page,
  setPage,
  isPinned,
  onTogglePin,
  focusTaskEdit,
  onFocusTaskEditHandled,
}: {
  page: Page;
  setPage: (p: Page) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  focusTaskEdit: boolean;
  onFocusTaskEditHandled: () => void;
}) {
  const { startTask, pauseTask, resumeTask, stopTask, runningTask } = useRunningTask();
  const config = useAppConfig();

  // Ctrl+1–7 navigates directly
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const pages: Page[] = [
          "tasks",
          "retroactive",
          "planning",
          "history",
          "data",
          "integrations",
          "settings",
        ];
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < pages.length) {
          e.preventDefault();
          setPage(pages[idx]);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setPage]);

  // Command palette: start task from standalone window
  useEffect(() => {
    const unlisten = listen<CommandPaletteStartTaskPayload>(
      OVERLAY_EVENTS.COMMAND_PALETTE_START_TASK,
      async ({ payload }) => {
        await startTask(payload);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [startTask]);

  // Live tray timer — atualiza tooltip do ícone da bandeja a cada segundo
  useEffect(() => {
    if (!runningTask) {
      invoke("update_tray_tooltip", { text: "DeskClock (ocioso)" }).catch(() => {});
      return;
    }

    if (runningTask.status === "paused") {
      const name = runningTask.name || "(sem nome)";
      invoke("update_tray_tooltip", { text: `DeskClock — ${name} (pausada)` }).catch(() => {});
      return;
    }

    const interval = setInterval(() => {
      const name = runningTask.name || "(sem nome)";
      if (!config.get("liveTrayTimer")) {
        invoke("update_tray_tooltip", { text: `DeskClock — ${name} (executando)` }).catch(() => {});
        return;
      }
      const elapsed = effectiveDuration(runningTask, new Date().toISOString());
      invoke("update_tray_tooltip", {
        text: `DeskClock — ${name} (executando) — ${formatHHMMSS(elapsed)}`,
      }).catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, [runningTask, config]);

  // Atalhos globais: toggle-task
  useEffect(() => {
    const unlisten = listen("shortcut:toggle-task", async () => {
      if (!runningTask) {
        await startTask({ billable: true });
      } else if (runningTask.status === "running") {
        await pauseTask();
      } else if (runningTask.status === "paused") {
        await resumeTask();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runningTask, startTask, pauseTask, resumeTask]);

  // Atalhos globais: stop-task
  useEffect(() => {
    const unlisten = listen("shortcut:stop-task", async () => {
      if (runningTask) await stopTask(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runningTask, stopTask]);

  const showPin = config.isLoaded && config.get("closeOnFocusLoss");

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <TitleBar page={page} showPin={showPin} isPinned={isPinned} onTogglePin={onTogglePin} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar current={page} onChange={setPage} />
        <main className="flex-1 overflow-hidden">
          <PageContent
            page={page}
            setPage={setPage}
            focusTaskEdit={focusTaskEdit}
            onFocusTaskEditHandled={onFocusTaskEditHandled}
          />
        </main>
      </div>
    </div>
  );
}

function AppInner() {
  const config = useAppConfig();
  const { runDaily } = useAutoSync();
  const [page, setPage] = useState<Page>("tasks");
  const [isPinned, setIsPinned] = useState(false);
  const [focusTaskEdit, setFocusTaskEdit] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const isPinnedRef = useRef(false);
  const ignoreBlurRef = useRef(false);

  useEffect(() => {
    if (config.isLoaded && !config.loadError) setSetupDone(config.get("setupCompleted"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);

  useAppearanceSync(config);
  useGlobalShortcuts(config);
  const { showMainWindow, showCommandPalette } = useStartupWindow(config, ignoreBlurRef);
  useDailySyncScheduler(config, runDaily);
  useUpdateNotifier();
  useCommandPaletteRouter({
    config,
    setPage,
    setFocusTaskEdit,
    ignoreBlurRef,
    showMainWindow,
    showCommandPalette,
  });

  if (config.isLoaded && !config.loadError && !setupDone) {
    return <SetupModal config={config} onComplete={() => setSetupDone(true)} />;
  }

  if (config.isLoaded && config.loadError) {
    return (
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-red-400 text-3xl">⚠</span>
          <h1 className="text-base font-semibold">Falha ao carregar configurações</h1>
          <p className="text-sm text-gray-400 max-w-xs">
            Não foi possível inicializar o DeskClock. Reinicie o app para tentar novamente.
          </p>
        </div>
        <pre className="bg-gray-900 rounded p-3 w-full max-w-sm text-xs text-red-300 whitespace-pre-wrap break-all">
          {config.loadError}
        </pre>
        <button
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
          onClick={() => invoke("relaunch_app").catch(() => {})}
        >
          Reiniciar DeskClock
        </button>
      </div>
    );
  }

  return (
    <RunningTaskProvider config={config}>
      <MainContent
        page={page}
        setPage={setPage}
        isPinned={isPinned}
        onTogglePin={() => setIsPinned((v) => !v)}
        focusTaskEdit={focusTaskEdit}
        onFocusTaskEditHandled={() => setFocusTaskEdit(false)}
      />
    </RunningTaskProvider>
  );
}

function App() {
  return (
    <ConfigProvider>
      <RepositoriesProvider>
        <IntegrationsProvider>
          <AutoSyncProvider>
            <AppInner />
          </AutoSyncProvider>
        </IntegrationsProvider>
      </RepositoriesProvider>
    </ConfigProvider>
  );
}

export default App;
