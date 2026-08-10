import { effectiveDuration } from "@domain/usecases/tasks/_helpers";
import { Sidebar, type Page } from "@presentation/components/Sidebar";
import { TitleBar } from "@presentation/components/TitleBar";
import { AutoSyncProvider, useAutoSync } from "@presentation/contexts/AutoSyncContext";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import { IntegrationsProvider } from "@presentation/contexts/IntegrationsContext";
import { IntegrationsUiProvider } from "@presentation/contexts/IntegrationsUiContext";
import { IntegrationsRail } from "@presentation/components/IntegrationsRail";
import { IntegrationsModalsHost } from "@presentation/components/IntegrationsModalsHost";
import { RepositoriesProvider, useRepositories } from "@presentation/contexts/RepositoriesContext";
import { WorkspaceProvider } from "@presentation/contexts/WorkspaceContext";
import { RunningTaskProvider } from "@presentation/contexts/RunningTaskContext";
import { TourProvider } from "@presentation/contexts/TourContext";
import { useAppearanceSync } from "@presentation/hooks/useAppearanceSync";
import { useAppRouter } from "@presentation/hooks/useAppRouter";
import { useDailySyncScheduler } from "@presentation/hooks/useDailySyncScheduler";
import { useDeepLink } from "@presentation/hooks/useDeepLink";
import { useGlobalShortcuts } from "@presentation/hooks/useGlobalShortcuts";
import { useMeetingTracker } from "@presentation/hooks/useMeetingTracker";
import { useMondayItemTracker } from "@presentation/hooks/useMondayItemTracker";
import { useMondayProjectsTracker } from "@presentation/hooks/useMondayProjectsTracker";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useStartupWindow } from "@presentation/hooks/useStartupWindow";
import { useUpdateNotifier } from "@presentation/hooks/useUpdateNotifier";
import { SetupModal } from "@presentation/modals/SetupModal";
import { DataPage } from "@presentation/pages/DataPage";
import { HistoryPage } from "@presentation/pages/HistoryPage";
import { IntegrationsPage } from "@presentation/pages/IntegrationsPage";
import { PlanningPage } from "@presentation/pages/PlanningPage";
import { RetroactivePage } from "@presentation/pages/RetroactivePage";
import { SettingsPage } from "@presentation/pages/SettingsPage";
import { TasksPage } from "@presentation/pages/TasksPage";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { formatHHMMSS } from "@shared/utils/time";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

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
        <TasksPage
          focusTaskEdit={focusTaskEdit}
          onFocusTaskEditHandled={onFocusTaskEditHandled}
          onNavigatePlanning={() => setPage("planning")}
        />
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
      return <IntegrationsPage />;
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
  const { projectRepo, categoryRepo } = useRepositories();
  const config = useAppConfig();

  // Rastreamento automático de reuniões do Google Agenda (gated por config).
  useMeetingTracker();
  // Importação automática dos itens do Monday como planejadas (gated por config).
  useMondayItemTracker();
  // Releitura diária dos boards do Monday como projetos (gated por já haver
  // board mapeado no workspace ativo).
  useMondayProjectsTracker();

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

  // Deep link: task/start — resolve nomes para IDs e inicia a tarefa
  const handleDeepLinkStart = useCallback(
    async (params: {
      name?: string | null;
      projectName?: string | null;
      categoryName?: string | null;
      billable: boolean;
    }) => {
      const [projects, categories] = await Promise.all([
        projectRepo.findAll(),
        categoryRepo.findAll(),
      ]);
      const projectId = params.projectName
        ? (projects.find((p) => p.name === params.projectName)?.id ?? null)
        : null;
      const categoryId = params.categoryName
        ? (categories.find((c) => c.name === params.categoryName)?.id ?? null)
        : null;
      await startTask({
        name: params.name ?? null,
        projectId,
        categoryId,
        billable: params.billable,
      });
      setPage("tasks");
    },
    [projectRepo, categoryRepo, startTask, setPage]
  );

  useEffect(() => {
    const unlisten = listen<{
      name?: string | null;
      projectName?: string | null;
      categoryName?: string | null;
      billable: boolean;
    }>(OVERLAY_EVENTS.DEEPLINK_START_TASK, async ({ payload }) => {
      await handleDeepLinkStart(payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleDeepLinkStart]);

  useEffect(() => {
    invoke<{
      name?: string | null;
      projectName?: string | null;
      categoryName?: string | null;
      billable: boolean;
    } | null>("get_pending_start_task").then(async (params) => {
      if (!params) return;
      await handleDeepLinkStart(params);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        text: `${formatHHMMSS(elapsed)} — ${name}`,
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
    <div className="flex flex-col h-screen bg-canvas text-fg overflow-hidden">
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
        <IntegrationsRail />
      </div>
      <IntegrationsModalsHost />
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
  const { showMainWindow } = useStartupWindow(config, ignoreBlurRef, isPinnedRef);
  useDailySyncScheduler(config, runDaily);
  useUpdateNotifier();
  useAppRouter({
    config,
    setPage,
    setFocusTaskEdit,
    ignoreBlurRef,
    showMainWindow,
  });
  useDeepLink(setPage);

  if (config.isLoaded && !config.loadError && !setupDone) {
    return (
      <SetupModal
        config={config}
        onComplete={(landing) => {
          if (landing) setPage(landing);
          setSetupDone(true);
        }}
      />
    );
  }

  if (config.isLoaded && config.loadError) {
    return (
      <div className="flex flex-col h-screen bg-canvas text-fg items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-danger text-3xl">⚠</span>
          <h1 className="text-base font-semibold">Falha ao carregar configurações</h1>
          <p className="text-sm text-fg-muted max-w-xs">
            Não foi possível inicializar o DeskClock. Reinicie o app para tentar novamente.
          </p>
        </div>
        <pre className="bg-surface rounded-control p-3 w-full max-w-sm text-xs text-danger whitespace-pre-wrap break-all">
          {config.loadError}
        </pre>
        <button
          className="px-4 py-2 bg-accent hover:opacity-90 text-white rounded-control text-sm font-medium transition-opacity"
          onClick={() => invoke("relaunch_app").catch(() => {})}
        >
          Reiniciar DeskClock
        </button>
      </div>
    );
  }

  return (
    <RunningTaskProvider config={config}>
      <TourProvider config={config}>
        <MainContent
          page={page}
          setPage={setPage}
          isPinned={isPinned}
          onTogglePin={() => setIsPinned((v) => !v)}
          focusTaskEdit={focusTaskEdit}
          onFocusTaskEditHandled={() => setFocusTaskEdit(false)}
        />
      </TourProvider>
    </RunningTaskProvider>
  );
}

function App() {
  return (
    <ConfigProvider>
      <RepositoriesProvider>
        <WorkspaceProvider>
          <IntegrationsProvider>
            <IntegrationsUiProvider>
              <AutoSyncProvider>
                <AppInner />
              </AutoSyncProvider>
            </IntegrationsUiProvider>
          </IntegrationsProvider>
        </WorkspaceProvider>
      </RepositoriesProvider>
    </ConfigProvider>
  );
}

export default App;
