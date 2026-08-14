import { useState } from "react";
import { Upload } from "lucide-react";
import { ProjectsPanel } from "@presentation/components/ProjectsPanel";
import { CategoriesPanel } from "@presentation/components/CategoriesPanel";
import { WorkspacesPanel } from "@presentation/components/WorkspacesPanel";
import { CustomFieldsPanel } from "@presentation/components/CustomFieldsPanel";
import { Button, FilterPill, PageHeader } from "@presentation/components/ui";
import { BulkImportModal } from "@presentation/modals/BulkImportModal";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";

type Section = "projetos" | "categorias" | "workspaces" | "campos";

export function DataPage() {
  const [section, setSection] = useState<Section>("projetos");
  const [bulkOpen, setBulkOpen] = useState(false);
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

  /**
   * A importação em massa é ação **da tela**, e por isso mora no cabeçalho — no
   * painel ela dividia a linha com a busca, que é do conteúdo. Workspaces e
   * Campos não a têm: workspace se cria com cor, e campo com tipo.
   */
  const bulkImport =
    section === "projetos"
      ? {
          title: "Importar projetos em massa",
          placeholder: "Um projeto por linha.\nEx: Cliente A\nCliente B",
          onImport: projectsData.bulkImportProjects,
        }
      : section === "categorias"
        ? {
            title: "Importar categorias em massa",
            placeholder:
              "Uma categoria por linha.\nPrefixo ! = non-billable.\nEx: Desenvolvimento\n!Reuniões",
            onImport: categoriesData.bulkImportCategories,
          }
        : null;

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Dados"
        tabs={tabs.map(([key, label, count]) => (
          <FilterPill
            key={key}
            active={section === key}
            onClick={() => setSection(key)}
            count={count}
          >
            {label}
          </FilterPill>
        ))}
        actions={
          bulkImport && (
            <Button onClick={() => setBulkOpen(true)} icon={<Upload size={14} />}>
              Importar
            </Button>
          )
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {/* `h-full` é o que dá altura definida ao cartão de dentro: é contra ela
            que a lista para de crescer e passa a rolar por dentro, mantendo a
            linha de adicionar sempre à vista. */}
        <div className="h-full max-w-[720px] mx-auto flex flex-col gap-3">
          {section === "projetos" && (
            <ProjectsPanel data={projectsData} categories={categoriesData.categories} />
          )}
          {section === "categorias" && <CategoriesPanel data={categoriesData} />}
          {section === "workspaces" && <WorkspacesPanel />}
          {section === "campos" && <CustomFieldsPanel data={customFieldsData} />}
        </div>
      </div>

      {bulkOpen && bulkImport && (
        <BulkImportModal
          title={bulkImport.title}
          placeholder={bulkImport.placeholder}
          onImport={bulkImport.onImport}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
