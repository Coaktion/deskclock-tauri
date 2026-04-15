import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { showToast } from "@shared/utils/toast";
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

interface UpdateInfo {
  version: string;
  body: string | null;
}

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

const appWindow = getCurrentWindow();

// Posiciona a janela principal no canto inferior direito da área de trabalho
// (acima da barra de tarefas). screen.availWidth/availHeight reflete a work area
// do monitor no WebView2/Chromium, excluindo a taskbar automaticamente.
async function positionWindowBottomRight() {
  const dpr = window.devicePixelRatio || 1;
  const outerSize = await appWindow.outerSize();
  // outerSize() retorna 0 para janelas ainda não exibidas; usa dimensões lógicas × dpr como fallback
  const winW = outerSize.width > 0 ? outerSize.width : Math.round(800 * dpr);
  const winH = outerSize.height > 0 ? outerSize.height : Math.round(620 * dpr);

  const x = Math.max(0, Math.round(window.screen.availWidth * dpr) - winW);
  const y = Math.max(0, Math.round(window.screen.availHeight * dpr) - winH);
  await appWindow.setPosition(new PhysicalPosition(x, y));
}

// MainContent — inside RunningTaskProvider, has access to useRunningTask
function MainContent({
  page,
  setPage,
  welcomeActiveRef,
  ignoreBlurRef,
  isPinned,
  onTogglePin,
}: {
  page: Page;
  setPage: (p: Page) => void;
  welcomeActiveRef: React.MutableRefObject<boolean>;
  ignoreBlurRef: React.MutableRefObject<boolean>;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const { startTask, pauseTask, resumeTask, stopTask, runningTask } = useRunningTask();
  const config = useAppConfig();

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

        if (payload.action === "start-task") {
          await startTask({ billable: true });
          return; // execution overlay handles visibility
        }

        // Suprime o closeOnFocusLoss enquanto reorganizamos as janelas
        ignoreBlurRef.current = true;
        setTimeout(() => { ignoreBlurRef.current = false; }, 600);

        if (payload.action === "navigate-planning") {
          await positionWindowBottomRight();
          await appWindow.show();
          setPage("planning");
        }
        // "close" e "navigate-planning": exibe apenas o overlay compacto
        const overlay = await getOverlay();
        if (overlay) {
          await overlay.show();
          await emit(OVERLAY_EVENTS.OVERLAY_SET_MODE, {
            mode: "compact",
          } satisfies OverlaySetModePayload);
        }
        if (payload.action === "navigate-planning") {
          await appWindow.setFocus();
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [startTask, setPage, welcomeActiveRef]);

  const showPin = config.isLoaded && config.get("closeOnFocusLoss");

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <TitleBar page={page} showPin={showPin} isPinned={isPinned} onTogglePin={onTogglePin} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar current={page} onChange={setPage} />
        <main className="flex-1 overflow-hidden">
          <PageContent page={page} />
        </main>
      </div>
    </div>
  );
}

function AppInner() {
  const config = useAppConfig();
  const [page, setPage] = useState<Page>("tasks");
  const [isPinned, setIsPinned] = useState(false);
  const welcomeActiveRef = useRef(false);
  const isPinnedRef = useRef(false);
  const ignoreBlurRef = useRef(false);

  // Mantém ref sincronizada com state (evita closure stale nos listeners)
  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);

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

  // Fecha janela ao perder foco, se habilitado e não fixada
  useEffect(() => {
    const unlisten = appWindow.listen("tauri://blur", () => {
      if (ignoreBlurRef.current) return;
      if (!config.get("closeOnFocusLoss")) return;
      if (isPinnedRef.current) return;
      appWindow.hide();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC fecha a janela (exceto quando um input/textarea/select está focado)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (document.activeElement as HTMLElement)?.tagName ?? "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      appWindow.hide();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Show welcome or overlay on startup
  useEffect(() => {
    if (!config.isLoaded) return;
    if (config.get("showWelcomeMessage")) {
      getWelcome().then((w) => {
        if (!w) return;
        w.show();
        setTimeout(() => {
          welcomeActiveRef.current = true;
        }, 200);
      });
    } else {
      positionWindowBottomRight().then(() => appWindow.show());
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
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_NAVIGATE_PLANNING, async () => {
      await positionWindowBottomRight();
      await appWindow.show();
      await appWindow.setFocus();
      setPage("planning");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Navigate to tasks when overlay requests task edit focus.
  // Navega diretamente no listener do evento — sem depender de tauri://focus
  // como intermediário, eliminando a race condition entre IPC e foco.
  // ignoreBlurRef suprime o closeOnFocusLoss durante a transição.
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_FOCUS_TASK_EDIT, () => {
      ignoreBlurRef.current = true;
      setTimeout(() => { ignoreBlurRef.current = false; }, 600);
      setPage("tasks");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Exibe a janela no canto inferior direito quando o tray solicita (evento emitido pelo Rust)
  useEffect(() => {
    const unlisten = appWindow.listen("tray:show-main", async () => {
      ignoreBlurRef.current = true;
      setTimeout(() => { ignoreBlurRef.current = false; }, 600);
      await positionWindowBottomRight();
      await appWindow.show();
      await appWindow.setFocus();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Navega para Settings quando acionado pelo toast de atualização
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.NAVIGATE_SETTINGS, () => {
      setPage("settings");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Verifica atualizações silenciosamente ao abrir (delay de 10s)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const update = await invoke<UpdateInfo | null>("check_for_update");
        if (update) {
          await showToast(
            "update",
            `DeskClock ${update.version} disponível`,
            8000,
            "Ver",
            OVERLAY_EVENTS.NAVIGATE_SETTINGS
          );
        }
      } catch {
        // falha silenciosa — não incomodar o usuário por problema de rede
      }
    }, 10_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <RunningTaskProvider config={config}>
      <MainContent
        page={page}
        setPage={setPage}
        welcomeActiveRef={welcomeActiveRef}
        ignoreBlurRef={ignoreBlurRef}
        isPinned={isPinned}
        onTogglePin={() => setIsPinned((v) => !v)}
      />
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
