import { ListChecks, Send, DownloadCloud } from "lucide-react";
import { MondayAutoImportSection } from "./MondayAutoImportSection";
import { MondayAutoSyncSection } from "./MondayAutoSyncSection";
import { MondayImportSection } from "./MondayImportSection";
import { MondayBoardsSection } from "./MondayBoardsSection";
import { DeskclockWorkspaceRow } from "../shared";

interface MondayConnectedSectionsProps {
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
  onShowSendModal: () => void;
  onShowImportModal: () => void;
  onShowEntriesModal: () => void;
}

const ACTION_CLASS =
  "w-full flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors justify-center border border-gray-700";

export function MondayConnectedSections({
  reloadProjects,
  reloadCategories,
  onShowSendModal,
  onShowImportModal,
  onShowEntriesModal,
}: MondayConnectedSectionsProps) {
  return (
    <>
      <DeskclockWorkspaceRow
        configKey="mondayDeskclockWorkspaceId"
        hint="Onde os projetos e as planejadas do Monday são criados, e de onde saem as horas enviadas. Não depende do workspace aberto na tela."
      />
      <MondayBoardsSection />
      <MondayImportSection reloadProjects={reloadProjects} reloadCategories={reloadCategories} />
      <MondayAutoSyncSection />
      <MondayAutoImportSection />
      <div className="border-t border-gray-800 px-4 py-3 space-y-2">
        <button onClick={onShowSendModal} className={ACTION_CLASS}>
          <Send size={12} />
          Enviar tarefas manualmente…
        </button>
        <button onClick={onShowImportModal} className={ACTION_CLASS}>
          <DownloadCloud size={12} />
          Importar itens como planejadas…
        </button>
        <button onClick={onShowEntriesModal} className={ACTION_CLASS}>
          <ListChecks size={12} />
          Gerenciar atividades…
        </button>
      </div>
    </>
  );
}
