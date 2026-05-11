import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "@shared/utils/toast";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";

interface UpdateInfo {
  version: string;
  body: string | null;
}

export function useUpdateNotifier() {
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
}
