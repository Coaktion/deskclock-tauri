import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type IntegrationModal =
  | "sheets-send"
  | "calendar-import"
  | "clockify-send"
  | "clockify-entries"
  | "monday-send"
  | "monday-import"
  | "monday-entries";

interface IntegrationsUiContextValue {
  modal: IntegrationModal | null;
  openModal: (modal: IntegrationModal) => void;
  closeModal: () => void;
}

const IntegrationsUiContext = createContext<IntegrationsUiContextValue | null>(null);

export function IntegrationsUiProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<IntegrationModal | null>(null);

  const openModal = useCallback((m: IntegrationModal) => setModal(m), []);
  const closeModal = useCallback(() => setModal(null), []);

  const value = useMemo(() => ({ modal, openModal, closeModal }), [modal, openModal, closeModal]);

  return <IntegrationsUiContext.Provider value={value}>{children}</IntegrationsUiContext.Provider>;
}

export function useIntegrationsUi(): IntegrationsUiContextValue {
  const ctx = useContext(IntegrationsUiContext);
  if (!ctx) throw new Error("useIntegrationsUi must be used within an IntegrationsUiProvider");
  return ctx;
}
