import { useState } from "react";
import { ProjectsPanel } from "@presentation/components/ProjectsPanel";
import { CategoriesPanel } from "@presentation/components/CategoriesPanel";
import { WorkspacesPanel } from "@presentation/components/WorkspacesPanel";
import { CustomFieldsPanel } from "@presentation/components/CustomFieldsPanel";
import { FilterPill, PageHeader } from "@presentation/components/ui";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";

type Section = "projetos" | "categorias" | "workspaces" | "campos";

export function DataPage() {
  const [section, setSection] = useState<Section>("projetos");
  // Os hooks vivem aqui, não dentro dos painéis: duas instâncias teriam estados
  // independentes e o contador da aba ficaria velho a cada exclusão.
  const projectsData = useProjects();
  const categoriesData = useCategories();
  const customFieldsData = useCustomFields();
  const { workspaces } = useWorkspaces();

  const tabs: [Section, string, number][] = [
    ["projetos", "Projetos", projectsData.projects.length],
    ["categorias", "Categorias", categoriesData.categories.length],
    ["workspaces", "Workspaces", workspaces.length],
    ["campos", "Campos", customFieldsData.fields.length],
  ];

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Dados" />
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        <div className="flex gap-2 mb-5">
          {tabs.map(([key, label, count]) => (
            <FilterPill
              key={key}
              active={section === key}
              onClick={() => setSection(key)}
              count={count}
            >
              {label}
            </FilterPill>
          ))}
        </div>
        {section === "projetos" && (
          <ProjectsPanel
            showTitle={false}
            data={projectsData}
            categories={categoriesData.categories}
          />
        )}
        {section === "categorias" && <CategoriesPanel showTitle={false} data={categoriesData} />}
        {section === "workspaces" && <WorkspacesPanel showTitle={false} />}
        {section === "campos" && <CustomFieldsPanel showTitle={false} data={customFieldsData} />}
      </div>
    </div>
  );
}
