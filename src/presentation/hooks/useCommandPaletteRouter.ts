import { useEffect, type RefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ConfigContextValue } from "@shared/types/appConfig";
import { OVERLAY_EVENTS, type CommandPaletteNavigatePayload } from "@shared/types/overlayEvents";
import type { Page } from "@presentation/components/Sidebar";

const appWindow = getCurrentWindow();

interface CommandPaletteRouterDeps {
  config: ConfigContextValue;
  setPage: (page: Page) => void;
  setFocusTaskEdit: (value: boolean) => void;
  ignoreBlurRef: RefObject<boolean>;
  showMainWindow: (focusToo?: boolean) => Promise<void>;
  showCommandPalette: () => Promise<void>;
}

export function useCommandPaletteRouter({
  config,
  setPage,
  setFocusTaskEdit,
  ignoreBlurRef,
  showMainWindow,
  showCommandPalette,
}: CommandPaletteRouterDeps) {
  // Atalho de teclado: mostra command palette
  useEffect(() => {
    const unlisten = listen("shortcut:show-command-palette", () => {
      void showCommandPalette();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navega para página quando command palette seleciona
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

  // Mostra a janela principal no estado atual, sem trocar de página
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_OPEN_APP, async () => {
      await showMainWindow(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navega para planejamento quando acionado pelo overlay
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_NAVIGATE_PLANNING, async () => {
      await showMainWindow(true);
      setPage("planning");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navega para tarefas e foca edição quando overlay solicita
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_FOCUS_TASK_EDIT, async () => {
      ignoreBlurRef.current = true;
      setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 600);
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
      setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 600);
      await showMainWindow(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navega para Settings quando toast de atualização é clicado
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.NAVIGATE_SETTINGS, () => {
      setPage("settings");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setPage]);
}
