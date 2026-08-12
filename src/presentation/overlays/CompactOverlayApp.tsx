import type { Task } from "@domain/entities/Task";
import { getActiveTasks } from "@domain/usecases/tasks/GetActiveTasks";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import { RepositoriesProvider, useRepositories } from "@presentation/contexts/RepositoriesContext";
import { WorkspaceProvider } from "@presentation/contexts/WorkspaceContext";
import { useAppearanceSync } from "@presentation/hooks/useAppearanceSync";
import {
    OVERLAY_EVENTS,
    type OverlayConfigChangedPayload,
    type RunningTaskChangedPayload,
} from "@shared/types/overlayEvents";
import { POPUP_SIZE, positionPopupNearCompact } from "@shared/utils/windowPosition";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompactOverlayContent } from "./CompactOverlayContent";
import { useOverlayDrag } from "./useOverlayDrag";

async function getPopup() {
  return WebviewWindow.getByLabel("overlay-popup");
}

/** Precisa acompanhar `overlay-compact` em `tauri.conf.json`: é o fallback usado para
 *  validar a posição salva quando a janela ainda não reportou o próprio tamanho. */
const OVERLAY_COMPACT_SIZE = { width: 68, height: 44 } as const;

function CompactOverlayAppInner() {
  const config = useAppConfig();
  useAppearanceSync(config);
  const { taskRepo } = useRepositories();
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

  const restoreCompactPosition = useOverlayDrag(
    "overlayPosition_compact",
    snapToGrid,
    config,
    handlePositionChange,
    OVERLAY_COMPACT_SIZE
  );

  useEffect(() => {
    if (!config.isLoaded) return;
    setOverlayOpacity(config.get("overlayOpacity") as number);
    setSnapToGrid(!!config.get("overlaySnapToGrid"));
    void restoreCompactPosition(OVERLAY_COMPACT_SIZE);
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
    await positionPopupNearCompact(popup, { width: POPUP_SIZE.width, height: POPUP_SIZE.height });
    await popup.show();
    await popup.setFocus();
    syncPopupOpen(true);
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
