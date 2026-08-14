import { ListChecks, Send, DownloadCloud } from "lucide-react";
import { MondayAutoImportSection } from "./MondayAutoImportSection";
import { MondayAutoSyncSection } from "./MondayAutoSyncSection";
import { MondayImportSection } from "./MondayImportSection";
import { MondayBoardsSection } from "./MondayBoardsSection";
import { Button } from "@presentation/components/ui";
import { DeskclockWorkspaceRow } from "../shared";

interface MondayConnectedSectionsProps {
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
  onShowSendModal: () => void;
  onShowImportModal: () => void;
  onShowEntriesModal: () => void;
}

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
      <div className="border-t border-border-subtle px-4 py-3 space-y-2">
        <Button onClick={onShowSendModal} icon={<Send size={14} />} className="w-full">
          Enviar tarefas manualmente…
        </Button>
        <Button onClick={onShowImportModal} icon={<DownloadCloud size={14} />} className="w-full">
          Importar itens como planejadas…
        </Button>
        <Button onClick={onShowEntriesModal} icon={<ListChecks size={14} />} className="w-full">
          Gerenciar atividades…
        </Button>
      </div>
    </>
  );
}
