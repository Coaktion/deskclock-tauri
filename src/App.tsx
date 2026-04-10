import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import { RunningTaskProvider, useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { effectiveDuration } from "@domain/usecases/tasks/_helpers";
import { formatHHMMSS } from "@shared/utils/time";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";
import { Sidebar, type Page } from "@presentation/components/Sidebar";
import { TitleBar } from "@presentation/components/TitleBar";
import { TasksPage } from "@presentation/pages/TasksPage";
import { PlanningPage } from "@presentation/pages/PlanningPage";
import { HistoryPage } from "@presentation/pages/HistoryPage";
import { DataPage } from "@presentation/pages/DataPage";
import { SettingsPage } from "@presentation/pages/SettingsPage";
import { RetroactivePage } from "@presentation/pages/RetroactivePage";
import { IntegrationsPage } from "@presentation/pages/IntegrationsPage";
import {
  OVERLAY_EVENTS,
  type WelcomeClosedPayload,
  type OverlaySetModePayload,
} from "@shared/types/overlayEvents";

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case "tasks":
      return <TasksPage />;
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

async function getOverlay() {
  return WebviewWindow.getByLabel("overlay");
}

async function getWelcome() {
  return WebviewWindow.getByLabel("welcome");
}

// MainContent — inside RunningTaskProvider, has access to useRunningTask
function MainContent({
  page,
  setPage,
  welcomeActiveRef,
}: {
  page: Page;
  setPage: (p: Page) => void;
  welcomeActiveRef: React.MutableRefObject<boolean>;
}) {
  const { startTask, pauseTask, resumeTask, stopTask, runningTask } = useRunningTask();
  const config = useAppConfig();

  // Live tray timer — atualiza tooltip do ícone da bandeja a cada segundo
  useEffect(() => {
    if (!runningTask || runningTask.status !== "running") {
      invoke("update_tray_tooltip", { text: null }).catch(() => {});
      return;
    }
    const interval = setInterval(() => {
      if (!config.get("liveTrayTimer")) {
        invoke("update_tray_tooltip", { text: null }).catch(() => {});
        return;
      }
      const elapsed = effectiveDuration(runningTask, new Date().toISOString());
      const name = runningTask.name ?? "(sem nome)";
      invoke("update_tray_tooltip", { text: `${name} — ${formatHHMMSS(elapsed)}` }).catch(() => {});
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

  // Atalhos globais: stop-task (para como pendente — sem UI para confirmar)
  useEffect(() => {
    const unlisten = listen("shortcut:stop-task", async () => {
      if (runningTask) await stopTask(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runningTask, stopTask]);

  useEffect(() => {
    const unlisten = listen<WelcomeClosedPayload>(
      OVERLAY_EVENTS.WELCOME_CLOSED,
      async ({ payload }) => {
        welcomeActiveRef.current = false;

        // Mostra a janela principal em todos os casos
        await appWindow.show();

        if (payload.action === "navigate-planning") {
          setPage("planning");
        } else if (payload.action === "start-task") {
          await startTask({ billable: true });
          return; // startTask handles showing the overlay
        }

        // For "navigate-planning" and "close": show compact overlay
        const overlay = await getOverlay();
        if (overlay) {
          await overlay.show();
          await emit(OVERLAY_EVENTS.OVERLAY_SET_MODE, {
            mode: "compact",
          } satisfies OverlaySetModePayload);
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [startTask, setPage, welcomeActiveRef]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <TitleBar page={page} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar current={page} onChange={setPage} />
        <main className="flex-1 overflow-hidden">
          <PageContent page={page} />
        </main>
      </div>
    </div>
  );
}

const appWindow = getCurrentWindow();

function AppInner() {
  const config = useAppConfig();
  const [page, setPage] = useState<Page>("tasks");
  const welcomeActiveRef = useRef(false);

  // Aplica tamanho de fonte e tema salvos ao iniciar
  useEffect(() => {
    if (!config.isLoaded) return;
    applyFontSize(config.get("fontSize"));
    applyTheme(config.get("theme") as Theme);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Registra atalhos globais salvos ao iniciar
  useEffect(() => {
    if (!config.isLoaded) return;
    invoke("update_shortcuts", {
      shortcuts: [
        { action: "toggle-task", accelerator: config.get("shortcutToggleTask") },
        { action: "stop-task", accelerator: config.get("shortcutStopTask") },
        { action: "toggle-overlay", accelerator: config.get("shortcutToggleOverlay") },
        { action: "toggle-window", accelerator: config.get("shortcutToggleWindow") },
      ],
    }).catch(() => {});
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show welcome or overlay on startup
  useEffect(() => {
    if (!config.isLoaded) return;
    if (config.get("showWelcomeMessage")) {
      getWelcome().then((w) => {
        if (!w) return;
        w.show();
        // Delay activating the ref so the initial window-focus event (fired at
        // app start, before this effect runs) is not mistakenly treated as a
        // tray-triggered focus.
        setTimeout(() => {
          welcomeActiveRef.current = true;
        }, 200);
      });
      // Janela principal permanece oculta até o Welcome ser dispensado
    } else {
      // Sem welcome: mostra a janela principal e o overlay imediatamente
      appWindow.show();
      getOverlay().then((overlay) => overlay?.show());
    }
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close welcome when main window gains focus (e.g., tray icon click)
  useEffect(() => {
    const unlisten = appWindow.listen("tauri://focus", async () => {
      if (!welcomeActiveRef.current) return;
      welcomeActiveRef.current = false;
      const w = await getWelcome();
      await w?.hide();
      await appWindow.show();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Navigate to planning when triggered from overlay
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_NAVIGATE_PLANNING, () => {
      setPage("planning");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Navigate to tasks when overlay requests task edit focus
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_FOCUS_TASK_EDIT, () => {
      setPage("tasks");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <RunningTaskProvider config={config}>
      <MainContent page={page} setPage={setPage} welcomeActiveRef={welcomeActiveRef} />
    </RunningTaskProvider>
  );
}

function App() {
  return (
    <ConfigProvider>
      <AppInner />
    </ConfigProvider>
  );
}

export default App;
