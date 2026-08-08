import { CalendarDays, DownloadCloud, ListChecks, Send, Sheet } from "lucide-react";
import type { ReactNode } from "react";
import { isMondayReady } from "@domain/usecases/monday/isMondayReady";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  useIntegrationsUi,
  type IntegrationModal,
} from "@presentation/contexts/IntegrationsUiContext";
import { ClockifyLogo } from "@presentation/sections/integrations/clockify/ClockifyLogo";
import { MondayLogo } from "@presentation/sections/integrations/monday/MondayLogo";

interface FlyoutAction {
  label: string;
  icon: ReactNode;
  modal: IntegrationModal;
}

interface RailTileProps {
  title: string;
  status: string;
  icon: ReactNode;
  tileClassName: string;
  actions: FlyoutAction[];
  onOpen: (modal: IntegrationModal) => void;
}

function RailTile({ title, status, icon, tileClassName, actions, onOpen }: RailTileProps) {
  return (
    <div className="group relative">
      <button
        className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white/5 hover:text-gray-100 transition-colors"
        aria-label={title}
        title={title}
      >
        <span
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${tileClassName}`}
        >
          {icon}
        </span>
        <span
          className="absolute right-1.5 bottom-1.5 w-2 h-2 rounded-full bg-green-500 border-[1.5px] border-gray-900"
          aria-hidden
        />
      </button>

      {/*
        O flyout desce a partir do topo da placa, e não centrado nela: a linha
        que contém o rail é `overflow-hidden` (App.tsx), então a metade de cima
        de um flyout centrado nas primeiras placas cai acima da borda e é
        cortada — parecia perder para a title bar. Descendo, ele fica sempre
        dentro do rail, que ocupa a altura inteira.
      */}
      <div className="pointer-events-none absolute right-full top-0 z-50 min-w-[240px] pr-2 opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 group-hover:pointer-events-auto group-focus-within:pointer-events-auto hover:opacity-100 hover:translate-x-0 hover:pointer-events-auto transition-[opacity,transform] duration-150">
        <div className="relative rounded-lg border border-gray-700 bg-gray-900 p-2.5 shadow-2xl">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-sm font-semibold text-gray-100">{title}</span>
            <span className="text-xs text-green-400">{status}</span>
          </div>
          <div className="h-px bg-gray-800 my-1" />
          {actions.map((a) => (
            <button
              key={a.modal}
              onClick={() => onOpen(a.modal)}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs text-gray-300 rounded hover:bg-gray-800 hover:text-gray-100 transition-colors"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
          {/* Meia altura da placa (`h-11`), para a seta apontar o centro dela. */}
          <span
            className="absolute right-[-5px] top-5.5 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-gray-900 border-r border-t border-gray-700"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}

export function IntegrationsRail() {
  const config = useAppConfig();
  const { openModal } = useIntegrationsUi();

  if (!config.isLoaded) return null;
  if (!config.get("showIntegrationsRail")) return null;

  const googleConnected = !!config.get("googleAccessToken");
  const sheetsConnected = googleConnected && !!config.get("integrationGoogleSheetsSpreadsheetId");
  const clockifyConnected = !!config.get("clockifyApiKey");

  // O Monday só entra configurado ponta a ponta: com a chave de API, mas sem os
  // dois boards ou sem projeto com quadro de destino, todas as ações abrem
  // vazias. Ver `isMondayReady`.
  const mondayReady = isMondayReady({
    apiKey: config.get("mondayApiKey"),
    portfolioBoardId: config.get("mondayPortfolioBoardId"),
    reportBoardId: config.get("mondayReportBoardId"),
    projectMapping: config.get("mondayProjectMapping"),
  });

  if (!googleConnected && !clockifyConnected && !mondayReady) return null;

  return (
    <aside
      aria-label="Integrações conectadas"
      className="w-[52px] shrink-0 h-full bg-gray-900 border-l border-gray-800 flex flex-col items-center py-3 gap-1 z-30"
    >
      {sheetsConnected && (
        <RailTile
          title="Google Sheets"
          status="Conectado"
          icon={<Sheet size={18} />}
          tileClassName="bg-[#0f9d58]"
          actions={[
            {
              label: "Enviar tarefas manualmente…",
              icon: <Send size={14} />,
              modal: "sheets-send",
            },
          ]}
          onOpen={openModal}
        />
      )}

      {googleConnected && (
        <RailTile
          title="Google Agenda"
          status="Conectado"
          icon={<CalendarDays size={18} />}
          tileClassName="bg-[#4285f4]"
          actions={[
            {
              label: "Importar eventos",
              icon: <CalendarDays size={14} />,
              modal: "calendar-import",
            },
          ]}
          onOpen={openModal}
        />
      )}

      {clockifyConnected && (
        <RailTile
          title="Clockify"
          status="Conectado"
          icon={<ClockifyLogo size={18} />}
          tileClassName="bg-[#03a9f4]"
          actions={[
            {
              label: "Gerenciar apontamentos…",
              icon: <ListChecks size={14} />,
              modal: "clockify-entries",
            },
            {
              label: "Enviar tarefas manualmente…",
              icon: <Send size={14} />,
              modal: "clockify-send",
            },
          ]}
          onOpen={openModal}
        />
      )}

      {mondayReady && (
        <RailTile
          title="Monday"
          status="Conectado"
          // A mesma placa do `IntegrationTile` na tela de Integrações: o logo do
          // Monday não traz fundo próprio, e inventar um aqui faria o mesmo
          // ícone ter dois visuais no app.
          icon={<MondayLogo size={18} />}
          tileClassName="bg-gray-800/60"
          actions={[
            {
              label: "Enviar tarefas manualmente…",
              icon: <Send size={14} />,
              modal: "monday-send",
            },
            {
              label: "Importar itens como planejadas…",
              icon: <DownloadCloud size={14} />,
              modal: "monday-import",
            },
            {
              label: "Gerenciar atividades…",
              icon: <ListChecks size={14} />,
              modal: "monday-entries",
            },
          ]}
          onOpen={openModal}
        />
      )}
    </aside>
  );
}
