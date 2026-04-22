import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { showToast } from "@shared/utils/toast";
import { positionNearTaskbar, centerOnWorkArea, type WindowPositionOverride } from "@shared/utils/windowPosition";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import { RunningTaskProvider, useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { effectiveDuration } from "@domain/usecases/tasks/_helpers";
import { formatHHMMSS, todayISO, addDaysISO, startOfDayISO, endOfDayISO } from "@shared/utils/time";
import { TaskRepository as AppTaskRepository } from "@infra/database/TaskRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { CategoryRepository } from "@infra/database/CategoryRepository";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import { groupTasks } from "@shared/utils/groupTasks";
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
  type CommandPaletteNavigatePayload,
  type CommandPaletteStartTaskPayload,
} from "@shared/types/overlayEvents";
import { SetupModal } from "@presentation/modals/SetupModal";

interface UpdateInfo {
  version: string;
  body: string | null;
}

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
      return <TasksPage focusTaskEdit={focusTaskEdit} onFocusTaskEditHandled={onFocusTaskEditHandled} />;
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

async function getOverlay() {
  return WebviewWindow.getByLabel("overlay");
}

async function getCommandPalette() {
  return WebviewWindow.getByLabel("command-palette");
}

const appWindow = getCurrentWindow();

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

  // Atalhos globais: stop-task (para como pendente — sem UI para confirmar)
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
          <PageContent page={page} setPage={setPage} focusTaskEdit={focusTaskEdit} onFocusTaskEditHandled={onFocusTaskEditHandled} />
        </main>
      </div>
    </div>
  );
}

function AppInner() {
  const config = useAppConfig();
  const [page, setPage] = useState<Page>("tasks");
  const [isPinned, setIsPinned] = useState(false);
  const [focusTaskEdit, setFocusTaskEdit] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const isPinnedRef = useRef(false);
  const ignoreBlurRef = useRef(false);

  // Sincroniza setupDone com o config ao carregar
  useEffect(() => {
    if (config.isLoaded && !config.loadError) {
      setSetupDone(config.get("setupCompleted"));
    }
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
        { action: "toggle-command-palette", accelerator: config.get("shortcutCommandPalette") },
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
      if (document.querySelector("[data-modal-open]")) return;
      appWindow.hide();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Salva posição da janela principal ao ser movida pelo usuário
  useEffect(() => {
    if (!config.isLoaded) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unlisten = appWindow.listen<{ x: number; y: number }>("tauri://move", ({ payload }) => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        config.set("mainWindowPosition", { x: payload.x, y: payload.y });
      }, 400);
    });
    return () => {
      unlisten.then((fn) => fn());
      if (debounce) clearTimeout(debounce);
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: lê config de posicionamento já carregado no cache — sem SQLite extra.
  function buildPosOverride(): WindowPositionOverride {
    return {
      auto: config.get("windowPositioningAuto"),
      workAreaWidth: config.get("workAreaWidth"),
      workAreaHeight: config.get("workAreaHeight"),
      taskbarPosition: config.get("taskbarPosition"),
      taskbarSize: config.get("taskbarSize"),
    };
  }

  // Helper: posiciona e exibe a janela principal. Usa posição salva se válida,
  // senão positionNearTaskbar com override do config manual.
  async function showMainWindow(focusToo = false) {
    const saved = config.get("mainWindowPosition");
    if (saved.x >= 0 && saved.y >= 0) {
      await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
    } else {
      await positionNearTaskbar(appWindow, { width: 800, height: 620 }, buildPosOverride());
    }
    await appWindow.show();
    if (focusToo) await appWindow.setFocus();
  }

  // Helper: posiciona e exibe o command palette centralizado.
  async function showCommandPalette() {
    const cp = await getCommandPalette();
    if (!cp) return;
    await centerOnWorkArea(cp, { width: 560, height: 500 }, buildPosOverride());
    await cp.show();
    await cp.setFocus();
  }

  // Show windows on startup
  useEffect(() => {
    if (!config.isLoaded) return;
    if (config.loadError) {
      positionNearTaskbar(appWindow, { width: 800, height: 620 }, buildPosOverride())
        .catch(() => {}).finally(() => appWindow.show());
      return;
    }
    if (!config.get("setupCompleted")) {
      positionNearTaskbar(appWindow, { width: 800, height: 620 }, buildPosOverride())
        .catch(() => {}).finally(() => appWindow.show());
      return;
    }

    void (async () => {
      // Overlay sempre sobe no startup (compact por padrão)
      const overlay = await getOverlay();
      await overlay?.show();

      if (config.get("showWelcomeMessage")) {
        const cp = await getCommandPalette();
        if (cp) {
          // CP aberto no startup — posiciona antes de mostrar para evitar race
          await showCommandPalette();
        } else {
          // Sem CP: mostra a janela principal diretamente
          await showMainWindow();
        }
      } else {
        await showMainWindow();
      }
    })();
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // F4: sincronização diária com Google Sheets
  useEffect(() => {
    if (!config.isLoaded) return;
    if (!config.get("integrationGoogleSheetsAutoSync")) return;
    if (config.get("sheetsAutoSyncMode") !== "daily") return;

    const spreadsheetId = config.get("integrationGoogleSheetsSpreadsheetId");
    const refreshToken = config.get("googleRefreshToken");
    if (!spreadsheetId || !refreshToken) return;

    const taskRepo = new AppTaskRepository();
    const logRepo = new TaskIntegrationLogRepository();

    // Envia todas as tarefas concluídas não sincronizadas no range [startISO, endISO].
    // Agrupa por nome+projeto+categoria; ignora grupos já totalmente enviados.
    async function runDailySync(rangeStartISO: string, rangeEndISO: string): Promise<number> {
      const [tasks, projects, categories] = await Promise.all([
        taskRepo.findByDateRange(rangeStartISO, rangeEndISO),
        new ProjectRepository().findAll(),
        new CategoryRepository().findAll(),
      ]);
      const completed = tasks.filter((t) => t.status === "completed");
      if (completed.length === 0) return 0;

      const sentIds = new Set(await logRepo.findSentIds("google_sheets", rangeStartISO, rangeEndISO));
      const groups = groupTasks(completed).filter((g) => !g.tasks.every((t) => sentIds.has(t.id)));
      if (groups.length === 0) return 0;

      const tasksToSend = groups.map((g) => ({ ...g.tasks[0], durationSeconds: g.totalSeconds }));
      const allIds = groups.flatMap((g) => g.tasks.map((t) => t.id));

      const sender = new GoogleSheetsTaskSender(config, spreadsheetId, projects, categories);
      await sender.send(tasksToSend);
      await logRepo.markSent(allIds, "google_sheets");
      return groups.length;
    }

    // Calcula o range "desde o último envio" até a data alvo (exclusive hoje para on-open).
    // Garante que fins de semana e dias perdidos são sempre cobertos.
    function calcRange(endDateISO: string): { start: string; end: string } | null {
      const lastTs = config.get("sheetsDailySyncLastTimestamp");
      // Extrai a data local do último timestamp (ou usa 7 dias atrás como fallback)
      const lastDateISO = lastTs
        ? new Date(lastTs).toLocaleDateString("sv-SE") // "YYYY-MM-DD" no locale sueco = ISO date
        : addDaysISO(todayISO(), -7);
      const startDateISO = addDaysISO(lastDateISO, 1);
      if (startDateISO > endDateISO) return null; // já sincronizado
      return { start: startOfDayISO(startDateISO), end: endOfDayISO(endDateISO) };
    }

    async function triggerSync(endDateISO: string) {
      const range = calcRange(endDateISO);
      if (!range) return; // nada a enviar
      try {
        const count = await runDailySync(range.start, range.end);
        await config.set("sheetsDailySyncLastTimestamp", new Date().toISOString());
        if (count > 0) {
          await showToast("success", `${count} grupo(s) enviado(s) automaticamente para o Sheets`);
        }
      } catch (err) {
        const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "Erro no envio diário ao Sheets.";
        await showToast("error", msg);
      }
    }

    const trigger = config.get("sheetsAutoSyncTrigger");

    if (trigger === "on-open") {
      // Ao abrir: envia até ontem (não inclui o dia de hoje, ainda em andamento)
      void triggerSync(addDaysISO(todayISO(), -1));
      return;
    }

    if (trigger === "fixed-time") {
      const [hh, mm] = config.get("sheetsAutoSyncTime").split(":").map(Number);
      let fired = false;

      const interval = setInterval(() => {
        if (fired) return;
        const now = new Date();
        if (now.getHours() === hh && now.getMinutes() === mm) {
          fired = true;
          // No horário fixo: envia até hoje (dia corrente já concluído no fim do expediente)
          void triggerSync(todayISO());
        }
      }, 30_000);

      return () => clearInterval(interval);
    }
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atalho de teclado: mostra command palette com posicionamento correto.
  // O hide já é feito pelo Rust (shortcuts.rs) — este evento só é emitido quando CP está oculto.
  useEffect(() => {
    const unlisten = listen("shortcut:show-command-palette", () => {
      void showCommandPalette();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate when command palette selects a page
  useEffect(() => {
    const unlisten = listen<CommandPaletteNavigatePayload>(
      OVERLAY_EVENTS.COMMAND_PALETTE_NAVIGATE,
      async ({ payload }) => {
        await showMainWindow(true);
        setPage(payload.page as Page);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to planning when triggered from overlay
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_NAVIGATE_PLANNING, async () => {
      await showMainWindow(true);
      setPage("planning");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to tasks when overlay requests task edit focus.
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_FOCUS_TASK_EDIT, async () => {
      ignoreBlurRef.current = true;
      setTimeout(() => { ignoreBlurRef.current = false; }, 600);
      setPage("tasks");
      setFocusTaskEdit(true);
      await showMainWindow(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exibe a janela quando o tray solicita
  useEffect(() => {
    const unlisten = appWindow.listen("tray:show-main", async () => {
      ignoreBlurRef.current = true;
      setTimeout(() => { ignoreBlurRef.current = false; }, 600);
      await showMainWindow(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <AppInner />
    </ConfigProvider>
  );
}

export default App;
