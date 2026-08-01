import { Send } from "lucide-react";
import { MondayAutoSyncSection } from "./MondayAutoSyncSection";
import { MondayImportSection } from "./MondayImportSection";
import { MondayWorkspaceSection } from "./MondayWorkspaceSection";

interface MondayConnectedSectionsProps {
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
  onShowSendModal: () => void;
}

export function MondayConnectedSections({
  reloadProjects,
  reloadCategories,
  onShowSendModal,
}: MondayConnectedSectionsProps) {
  return (
    <>
      <MondayWorkspaceSection />
      <MondayImportSection reloadProjects={reloadProjects} reloadCategories={reloadCategories} />
      <MondayAutoSyncSection />
      <div className="border-t border-gray-800 px-4 py-3">
        <button
          onClick={onShowSendModal}
          className="w-full flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors justify-center border border-gray-700"
        >
          <Send size={12} />
          Enviar tarefas manualmente…
        </button>
      </div>
    </>
  );
}
