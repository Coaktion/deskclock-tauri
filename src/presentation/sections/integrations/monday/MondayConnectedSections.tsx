import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import { Send } from "lucide-react";
import { MondayAutoSyncSection } from "./MondayAutoSyncSection";
import { MondayMappingsSection } from "./MondayMappingsSection";
import { MondayWorkspaceSection } from "./MondayWorkspaceSection";

interface MondayConnectedSectionsProps {
  projects: Project[];
  categories: Category[];
  reloadProjects: () => Promise<void>;
  onShowSendModal: () => void;
}

export function MondayConnectedSections({
  projects,
  categories,
  reloadProjects,
  onShowSendModal,
}: MondayConnectedSectionsProps) {
  return (
    <>
      <MondayWorkspaceSection />
      <MondayMappingsSection
        projects={projects}
        categories={categories}
        reloadProjects={reloadProjects}
      />
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
