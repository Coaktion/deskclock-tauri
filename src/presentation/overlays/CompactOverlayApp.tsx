import type { Task } from "@domain/entities/Task";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { RepositoriesProvider, useRepositories } from "@presentation/contexts/RepositoriesContext";
import { WorkspaceProvider } from "@presentation/contexts/WorkspaceContext";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  OVERLAY_EVENTS,
  type OverlayConfigChangedPayload,
  type RunningTaskChangedPayload,
} from "@shared/types/overlayEvents";
import { applyFontSize } from "@shared/utils/fontSize";
import type { Theme } from "@shared/utils/theme";
import { applyTheme } from "@shared/utils/theme";
import { positionPopupNearCompact } from "@shared/utils/windowPosition";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompactOverlayContent } from "./CompactOverlayContent";
import { useOverlayDrag } from "./useOverlayDrag";

const appWindow = getCurrentWindow();

async function getPopup() {
  return WebviewWindow.getByLabel("overlay-popup");
}

// Dimensões visuais do overlay (usadas para clamping de tela e restore de posição).
const OVERLAY_VISUAL = {
  big: { width: 78, height: 52 },
  small: { width: 68, height: 44 },
} as const;

// Dimensões de janela para setMinSize/setMaxSize (apenas a altura varia entre tamanhos;
// a largura é gerenciada pelo GTK/WebView e pode ser maior que o conteúdo visual).
const OVERLAY_WINDOW_HEIGHT = { big: 52, small: 44 } as const;

function CompactOverlayAppInner() {
  const config = useAppConfig();
  const { taskRepo } = useRepositories();
  const [isHovered, setIsHovered] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlaySize, setOverlaySize] = useState<"big" | "small">("big");
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  // Ref-based state for use inside event handlers without stale closure issues
  const isPopupOpenRef = useRef(false);
  const wasPopupOpenOnMouseDownRef = useRef(false);

  const syncPopupOpen = (value: boolean) => {
    isPopupOpenRef.current = value;
    setIsPopupOpen(value);
  };

  // Close popup if compact moves (user dragging)
  const handlePositionChange = useCallback(() => {
    if (isPopupOpenRef.current) {
      syncPopupOpen(false);
      void getPopup().then((p) => p?.hide());
    }
  }, []);

  const restoreCompactPosition = useOverlayDrag(
    "overlayPosition_compact",
    snapToGrid,
    config,
    handlePositionChange,
    OVERLAY_VISUAL[overlaySize]
  );

  useEffect(() => {
    if (!config.isLoaded) return;
    applyFontSize(config.get("fontSize"));
    applyTheme(config.get("theme") as Theme);
    setOverlayOpacity(config.get("overlayOpacity") as number);
    setSnapToGrid(!!config.get("overlaySnapToGrid"));
    const size = (config.get("overlaySize") as "big" | "small") ?? "big";
    setOverlaySize(size);
    const h = OVERLAY_WINDOW_HEIGHT[size];
    void appWindow.setMinSize(new LogicalSize(52, h));
    void appWindow.setMaxSize(new LogicalSize(52, h));
    void restoreCompactPosition(OVERLAY_VISUAL[size]);
    // Load initial running task — RUNNING_TASK_CHANGED is only emitted on mutations,
    // not on startup, so we query the DB directly.
    void getActiveTasks(taskRepo).then((tasks) => {
      const running = tasks.find((t) => t.status === "running");
      setRunningTask(running ?? tasks[0] ?? null);
    });
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlisten = listen<OverlayConfigChangedPayload>(
      OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED,
      ({ payload }) => {
        if (payload.key === "overlayOpacity") setOverlayOpacity(payload.value as number);
        else if (payload.key === "overlaySnapToGrid") setSnapToGrid(!!payload.value);
        else if (payload.key === "fontSize") applyFontSize(payload.value as string);
        else if (payload.key === "theme") applyTheme(payload.value as Theme);
        else if (payload.key === "overlaySize") {
          const size = payload.value as "big" | "small";
          setOverlaySize(size);
          const h = OVERLAY_WINDOW_HEIGHT[size];
          void appWindow.setMinSize(new LogicalSize(52, h));
          void appWindow.setMaxSize(new LogicalSize(52, h));
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Track running task for visual state (timer + ring)
  useEffect(() => {
    const unlisten = listen<RunningTaskChangedPayload>(
      OVERLAY_EVENTS.RUNNING_TASK_CHANGED,
      ({ payload }) => {
        setRunningTask(payload.task);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Popup tells us it closed itself (blur or ESC)
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_POPUP_CLOSED, () => {
      syncPopupOpen(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const openPopup = useCallback(async () => {
    const popup = await getPopup();
    if (!popup) return;
    await positionPopupNearCompact(popup, { width: 288, height: 380 });
    await popup.show();
    await popup.setFocus();
    syncPopupOpen(true);
  }, []);

  const closePopup = useCallback(async () => {
    syncPopupOpen(false);
    const popup = await getPopup();
    await popup?.hide();
  }, []);

  // Capture popup state on mousedown, before blur fires
  const handleMouseDown = useCallback(() => {
    wasPopupOpenOnMouseDownRef.current = isPopupOpenRef.current;
  }, []);

  // Toggle popup: if it was open when mousedown fired, blur already closed it — don't reopen
  const handleTogglePopup = useCallback(() => {
    if (wasPopupOpenOnMouseDownRef.current) {
      // Popup was open → blur closed it → stay closed
      return;
    }
    void openPopup();
  }, [openPopup]);

  // Also expose an explicit close path for the position-change case
  useEffect(() => {
    // The handlePositionChange callback captures closePopup via closure — keep it stable
  }, [closePopup]);

  const opacity = isHovered ? 1 : overlayOpacity / 100;

  return (
    <div
      className="w-screen h-screen relative"
      style={{ opacity, transition: "opacity 0.2s ease" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CompactOverlayContent
        runningTask={runningTask}
        isPopupOpen={isPopupOpen}
        overlaySize={overlaySize}
        onMouseDown={handleMouseDown}
        onTogglePopup={handleTogglePopup}
      />
    </div>
  );
}

export function CompactOverlayApp() {
  return (
    <ConfigProvider>
      <RepositoriesProvider>
        <WorkspaceProvider>
          <CompactOverlayAppInner />
        </WorkspaceProvider>
      </RepositoriesProvider>
    </ConfigProvider>
  );
}
