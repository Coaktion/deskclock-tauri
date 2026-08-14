import { useMemo } from "react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import {
  useIntegrationsUi,
  type IntegrationModal,
} from "@presentation/contexts/IntegrationsUiContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useIntegrationCatalogs } from "@presentation/hooks/useIntegrationCatalogs";
import { ClockifyEntriesModal } from "@presentation/modals/ClockifyEntriesModal";
import { ClockifySendModal } from "@presentation/modals/ClockifySendModal";
import { ImportCalendarModal } from "@presentation/modals/ImportCalendarModal";
import { MondayEntriesModal } from "@presentation/modals/MondayEntriesModal";
import { MondayImportModal } from "@presentation/modals/MondayImportModal";
import { MondaySendModal } from "@presentation/modals/MondaySendModal";
import { SheetsSendModal } from "@presentation/modals/SheetsSendModal";
import type { IntegrationWorkspaceKey } from "@shared/types/appConfig";
import { showToast } from "@shared/utils/toast";

function defaultCalendarRangeISO() {
  const today = new Date();
  const dow = today.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    defaultFromISO: new Date(fmt(mon) + "T00:00:00").toISOString(),
    defaultToISO: new Date(fmt(sun) + "T23:59:59").toISOString(),
  };
}

/**
 * Qual workspace do DeskClock cada modal enxerga.
 *
 * Todos eles são de integração, e nenhum trabalha no workspace aberto na tela:
 * o import cria no workspace da integração e o envio manda o dele. Os catálogos
 * têm de vir do mesmo lugar, ou a planejada nasce apontando para projeto de fora
 * e a lista de envio mostra o nome errado.
 */
const MODAL_WORKSPACE_KEY: Record<IntegrationModal, IntegrationWorkspaceKey | null> = {
  "sheets-send": "sheetsDeskclockWorkspaceId",
  "clockify-send": "clockifyDeskclockWorkspaceId",
  "monday-send": "mondayDeskclockWorkspaceId",
  "monday-import": "mondayDeskclockWorkspaceId",
  "calendar-import": "calendarDeskclockWorkspaceId",
  // Operam direto sobre o destino remoto e não montam nada com o catálogo local.
  "clockify-entries": null,
  "monday-entries": null,
};

export function IntegrationsModalsHost() {
  const { modal, closeModal } = useIntegrationsUi();
  const config = useAppConfig();
  const factories = useIntegrations();
  const { plannedTaskRepo, trackedMeetingRepo } = useRepositories();
  const { projects, categories } = useIntegrationCatalogs(
    modal ? MODAL_WORKSPACE_KEY[modal] : null
  );

  const calendarImporter = useMemo(
    () => (config.isLoaded ? factories.createCalendarImporter() : null),
    [config.isLoaded, factories]
  );

  const { defaultFromISO, defaultToISO } = useMemo(defaultCalendarRangeISO, []);

  if (!modal) return null;

  if (modal === "sheets-send") {
    return <SheetsSendModal projects={projects} categories={categories} onClose={closeModal} />;
  }

  if (modal === "clockify-send") {
    return <ClockifySendModal projects={projects} categories={categories} onClose={closeModal} />;
  }

  if (modal === "monday-send") {
    return <MondaySendModal projects={projects} categories={categories} onClose={closeModal} />;
  }

  if (modal === "clockify-entries") {
    return <ClockifyEntriesModal onClose={closeModal} />;
  }

  if (modal === "monday-entries") {
    return <MondayEntriesModal onClose={closeModal} />;
  }

  if (modal === "monday-import") {
    return (
      <MondayImportModal
        repo={plannedTaskRepo}
        projects={projects}
        categories={categories}
        onImported={(count) => {
          closeModal();
          showToast(
            "success",
            `${count} item${count !== 1 ? "s" : ""} importado${count !== 1 ? "s" : ""}.`
          );
        }}
        onClose={closeModal}
      />
    );
  }

  if (modal === "calendar-import" && calendarImporter) {
    return (
      <ImportCalendarModal
        importer={calendarImporter}
        repo={plannedTaskRepo}
        trackedRepo={trackedMeetingRepo}
        defaultFromISO={defaultFromISO}
        defaultToISO={defaultToISO}
        projects={projects}
        categories={categories}
        onImported={(count, tracked) => {
          closeModal();
          const rastreadas =
            tracked > 0
              ? ` ${tracked} ${tracked === 1 ? "reunião rastreada" : "reuniões rastreadas"}.`
              : "";
          showToast(
            "success",
            `${count} evento${count !== 1 ? "s" : ""} importado${count !== 1 ? "s" : ""}.${rastreadas}`
          );
        }}
        onClose={closeModal}
      />
    );
  }

  return null;
}
