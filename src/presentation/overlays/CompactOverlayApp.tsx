import type { Task } from "@domain/entities/Task";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { TaskRepository } from "@infra/database/TaskRepository";
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
import { restoreOverlayPosition, useOverlayDrag } from "./useOverlayDrag";

const appWindow = getCurrentWindow();

const taskRepo = new TaskRepository();

async function getPopup() {
  return WebviewWindow.getByLabel("overlay-popup");
}

function CompactOverlayAppInner() {
  const config = useAppConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
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

  useOverlayDrag("overlayPosition_compact", snapToGrid, config, handlePositionChange, { width: 78, height: 52 });

  useEffect(() => {
    if (!config.isLoaded) return;
    applyFontSize(config.get("fontSize"));
    applyTheme(config.get("theme") as Theme);
    setOverlayOpacity(config.get("overlayOpacity") as number);
    setSnapToGrid(!!config.get("overlaySnapToGrid"));
    void appWindow.setMinSize(new LogicalSize(52, 52));
    void appWindow.setMaxSize(new LogicalSize(52, 52));
    void restoreOverlayPosition("overlayPosition_compact", config, { width: 52, height: 52 });
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
      className="w-screen h-screen m-auto relative overflow-hidden"
      style={{ opacity, transition: "opacity 0.2s ease" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CompactOverlayContent
        runningTask={runningTask}
        isPopupOpen={isPopupOpen}
        onMouseDown={handleMouseDown}
        onTogglePopup={handleTogglePopup}
      />
    </div>
  );
}

export function CompactOverlayApp() {
  return (
    <ConfigProvider>
      <CompactOverlayAppInner />
    </ConfigProvider>
  );
}
