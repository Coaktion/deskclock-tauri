import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { positionNearTaskbar } from "@shared/utils/windowPosition";
import { CalendarDays, Plus, X } from "lucide-react";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import { OVERLAY_EVENTS, type WelcomeClosedPayload } from "@shared/types/overlayEvents";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";

const appWindow = getCurrentWindow();

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function WelcomeAppInner() {
  const config = useAppConfig();

  useEffect(() => {
    positionNearTaskbar(appWindow, { width: 320, height: 190 }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!config.isLoaded) return;
    applyFontSize(config.get("fontSize"));
    applyTheme(config.get("theme") as Theme);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function close(action: WelcomeClosedPayload["action"]) {
    await emit(OVERLAY_EVENTS.WELCOME_CLOSED, { action } satisfies WelcomeClosedPayload);
    await appWindow.close();
  }

  const userName = config.isLoaded ? config.get("userName") : "";
  const displayName = userName?.trim() || null;
  const greeting = getGreeting();

  return (
    <div className="w-full h-full p-2">
      <div className="w-full h-full bg-gray-900 border border-gray-700 rounded-2xl shadow-xl flex flex-col p-5 gap-3 relative">
        <button
          onClick={() => close("close")}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X size={14} />
        </button>

        <div>
          <h1 className="text-base font-semibold text-gray-100 pr-5">
            {greeting}
            {displayName ? `, ${displayName}` : ""}!
          </h1>
          <p className="text-xs text-gray-400 mt-1">No que iremos trabalhar hoje?</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => close("navigate-planning")}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white rounded-lg transition-colors text-sm font-medium"
          >
            <CalendarDays size={15} />
            Planejamento
          </button>
          <button
            onClick={() => close("start-task")}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Plus size={15} />
            Nova tarefa
          </button>
        </div>
      </div>
    </div>
  );
}

export function WelcomeApp() {
  return (
    <ConfigProvider>
      <WelcomeAppInner />
    </ConfigProvider>
  );
}
