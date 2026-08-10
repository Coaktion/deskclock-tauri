import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import type { Page } from "@presentation/components/Sidebar";

const VALID_PAGES: Page[] = [
  "tasks",
  "retroactive",
  "planning",
  "history",
  "data",
  "integrations",
  "settings",
];

interface DeepLinkNavigatePayload {
  page: string;
}

export function useDeepLink(setPage: (page: Page) => void) {
  // App já em execução: recebe evento em tempo real.
  useEffect(() => {
    const unlisten = listen<DeepLinkNavigatePayload>(
      OVERLAY_EVENTS.DEEPLINK_NAVIGATE,
      ({ payload }) => {
        const page = payload.page as Page;
        if (VALID_PAGES.includes(page)) {
          setPage(page);
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setPage]);

  // App aberto pelo deep link: o evento chega antes do webview estar pronto,
  // então consultamos o estado Rust ao montar.
  useEffect(() => {
    invoke<string | null>("get_pending_deep_link_page").then((page) => {
      if (!page || !VALID_PAGES.includes(page as Page)) return;
      setPage(page as Page);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
