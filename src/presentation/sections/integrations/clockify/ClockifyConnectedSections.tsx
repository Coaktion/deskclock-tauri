import { ListChecks, Send } from "lucide-react";
import { ClockifyAutoSyncSection } from "./ClockifyAutoSyncSection";
import { ClockifyMappingsSection } from "./ClockifyMappingsSection";
import { ClockifyWorkspaceSection } from "./ClockifyWorkspaceSection";

interface ClockifyConnectedSectionsProps {
  projects: import("@domain/entities/Project").Project[];
  categories: import("@domain/entities/Category").Category[];
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
  onShowSendModal: () => void;
  onShowEntriesModal: () => void;
}

export function ClockifyConnectedSections({
  projects,
  categories,
  reloadProjects,
  reloadCategories,
  onShowSendModal,
  onShowEntriesModal,
}: ClockifyConnectedSectionsProps) {
  return (
    <>
      <ClockifyWorkspaceSection />
      <ClockifyMappingsSection
        projects={projects}
        categories={categories}
        reloadProjects={reloadProjects}
        reloadCategories={reloadCategories}
      />
      <ClockifyAutoSyncSection />
      <div className="border-t border-gray-800 px-4 py-3 flex items-center gap-2">
        <button
          onClick={onShowEntriesModal}
          className="flex-1 flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors justify-center border border-gray-700"
        >
          <ListChecks size={12} />
          Gerenciar apontamentos…
        </button>
        <button
          onClick={onShowSendModal}
          className="flex-1 flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors justify-center border border-gray-700"
        >
          <Send size={12} />
          Enviar tarefas manualmente…
        </button>
      </div>
    </>
  );
}
