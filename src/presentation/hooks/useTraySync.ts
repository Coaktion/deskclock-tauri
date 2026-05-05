import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

export function useTraySync(status: string | undefined) {
  useEffect(() => {
    invoke("update_tray_icon", { status: status ?? "idle" }).catch(console.error);
  }, [status]);
}
