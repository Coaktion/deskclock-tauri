import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { DownloadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import { SubSection } from "../shared";
import { MondayCategoriesImport } from "./MondayCategoriesImport";
import { MondayProjectStageField } from "./MondayProjectStageField";
import { MondayProjectsImport } from "./MondayProjectsImport";

/**
 * Traz do Monday o que o DeskClock precisa para registrar horas: projetos,
 * categorias e as opções de Project Stage. Não há tabela de mapeamento a manter
 * — o nome no DeskClock **é** o rótulo no board.
 */
export function MondayImportSection({
  reloadProjects,
  reloadCategories,
}: {
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
}) {
  const config = useAppConfig();
  const { workspaces, activeWorkspaceId } = useWorkspaces();
  const [mappings, setMappings] = useState<MondayProjectMapping[]>([]);
  const [destinationId, setDestinationId] = useState("");

  // Distinto do destino: este é o workspace do **Monday**.
  const mondayWorkspaceId = config.get("mondayActiveWorkspaceId");

  useEffect(() => {
    if (!config.isLoaded) return;
    setMappings(
      normalizeProjectMappings(config.get("mondayProjectMapping")).filter(
        (m) => m.workspaceId === mondayWorkspaceId
      )
    );
    // Relê só quando a config carrega ou o workspace do Monday muda: `config` é
    // recriado a cada render do provider e sobrescreveria um import em curso.
  }, [config.isLoaded, mondayWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!destinationId && activeWorkspaceId) setDestinationId(activeWorkspaceId);
  }, [activeWorkspaceId, destinationId]);

  // O board interno tem o próprio Activity Type; os rótulos de etapa, não — eles
  // vêm de qualquer board mapeado, já que todos nascem do mesmo template.
  const stageSource = mappings.find((m) => m.projectStageLabels.length > 0);

  return (
    <SubSection icon={<DownloadCloud size={15} />} title="Importação de dados">
      <div className="pb-2 space-y-3">
        {workspaces.length > 1 && (
          <div className="flex items-center justify-between gap-3 border border-gray-800 rounded-lg p-3">
            <div className="min-w-0">
              <span className="text-xs font-medium text-gray-300">Workspace de destino</span>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Projetos e categorias importados são criados aqui. Não troca o workspace ativo do
                app.
              </p>
            </div>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="shrink-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500 max-w-[160px]"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <MondayProjectsImport
          mappings={mappings}
          mondayWorkspaceId={mondayWorkspaceId}
          deskclockWorkspaceId={destinationId}
          onImported={setMappings}
          reloadProjects={reloadProjects}
        />

        <MondayCategoriesImport
          mappings={mappings}
          deskclockWorkspaceId={destinationId}
          reloadCategories={reloadCategories}
        />

        <MondayProjectStageField
          optionLabels={stageSource?.projectStageLabels ?? []}
          columnTitle={stageSource?.projectStageTitle ?? ""}
        />
      </div>
    </SubSection>
  );
}
