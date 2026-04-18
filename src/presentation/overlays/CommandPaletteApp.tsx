import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import { CommandPalette } from "@presentation/components/CommandPalette";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { todayISO } from "@shared/utils/time";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme } from "@shared/utils/theme";
import { formatShortcut } from "@shared/utils/shortcuts";
import {
  OVERLAY_EVENTS,
  type CommandPaletteNavigatePayload,
  type CommandPaletteStartTaskPayload,
} from "@shared/types/overlayEvents";
import type { Theme } from "@shared/utils/theme";
import type { Page } from "@presentation/components/Sidebar";

const appWindow = getCurrentWindow();

function CommandPaletteAppInner() {
  const config = useAppConfig();
  const today = todayISO();
  const { tasks: plannedTasks } = usePlannedTasksForDate(today);
  const { projects } = useProjects();

  // Apply theme/font from config
  useEffect(() => {
    if (!config.isLoaded) return;
    applyFontSize(config.get("fontSize"));
    applyTheme(config.get("theme") as Theme);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on focus loss
  useEffect(() => {
    const unlisten = appWindow.listen("tauri://blur", () => {
      void appWindow.hide();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function handleNavigate(page: Page) {
    await emit(OVERLAY_EVENTS.COMMAND_PALETTE_NAVIGATE, {
      page,
    } satisfies CommandPaletteNavigatePayload);
    await appWindow.hide();
  }

  async function handleStartTask(input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable: boolean;
    plannedTaskId?: string | null;
  }) {
    await emit(OVERLAY_EVENTS.COMMAND_PALETTE_START_TASK, {
      ...input,
    } satisfies CommandPaletteStartTaskPayload);
    await appWindow.hide();
  }

  const shortcutLabel = config.isLoaded
    ? formatShortcut(config.get("shortcutCommandPalette"))
    : "Ctrl+K";

  return (
    <div className="w-full h-full flex items-center justify-center">
      <CommandPalette
        open={true}
        onClose={() => void appWindow.hide()}
        onNavigate={handleNavigate}
        onStartTask={handleStartTask}
        plannedTasks={plannedTasks}
        projects={projects}
        shortcutLabel={shortcutLabel}
        standalone
      />
    </div>
  );
}

export function CommandPaletteApp() {
  return (
    <ConfigProvider>
      <CommandPaletteAppInner />
    </ConfigProvider>
  );
}
