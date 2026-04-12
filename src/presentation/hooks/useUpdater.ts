import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type UpdaterStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

interface UpdateInfo {
  version: string;
  body: string | null;
}

interface UpdaterState {
  status: UpdaterStatus;
  version: string | null;
  body: string | null;
  progress: number | null;
  error: string | null;
}

export interface UseUpdaterReturn {
  state: UpdaterState;
  check: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  relaunch: () => Promise<void>;
}

const INITIAL_STATE: UpdaterState = {
  status: "idle",
  version: null,
  body: null,
  progress: null,
  error: null,
};

export function useUpdater(): UseUpdaterReturn {
  const [state, setState] = useState<UpdaterState>(INITIAL_STATE);
  const downloadedBytesRef = useRef(0);

  // Escuta eventos de progresso e conclusão do download
  useEffect(() => {
    const unlistenProgress = listen<{ chunk: number; total: number | null }>(
      "update:progress",
      ({ payload }) => {
        downloadedBytesRef.current += payload.chunk;
        const progress =
          payload.total != null
            ? Math.min(100, Math.round((downloadedBytesRef.current / payload.total) * 100))
            : null;
        setState((s) => ({ ...s, status: "downloading", progress }));
      }
    );

    const unlistenReady = listen("update:ready", () => {
      setState((s) => ({ ...s, status: "ready", progress: 100 }));
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenReady.then((fn) => fn());
    };
  }, []);

  async function check() {
    setState((s) => ({ ...s, status: "checking", error: null }));
    try {
      const update = await invoke<UpdateInfo | null>("check_for_update");
      if (update) {
        setState((s) => ({
          ...s,
          status: "available",
          version: update.version,
          body: update.body,
        }));
      } else {
        setState((s) => ({ ...s, status: "idle" }));
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }

  async function downloadAndInstall() {
    downloadedBytesRef.current = 0;
    setState((s) => ({ ...s, status: "downloading", progress: 0, error: null }));
    try {
      await invoke("download_and_install_update");
    } catch (e) {
      setState((s) => ({
        ...s,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }

  async function relaunch() {
    await invoke("relaunch_app");
  }

  return { state, check, downloadAndInstall, relaunch };
}
