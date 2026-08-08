import { integrationButtonClass } from "../shared";
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
      <div className="border-t border-border-subtle px-4 py-3 flex items-center gap-2">
        <button onClick={onShowEntriesModal} className={`${integrationButtonClass} flex-1`}>
          <ListChecks size={14} />
          Gerenciar apontamentos…
        </button>
        <button onClick={onShowSendModal} className={`${integrationButtonClass} flex-1`}>
          <Send size={14} />
          Enviar tarefas manualmente…
        </button>
      </div>
    </>
  );
}
