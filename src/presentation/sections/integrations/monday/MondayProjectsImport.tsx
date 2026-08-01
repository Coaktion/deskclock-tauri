import { importMondayProjects } from "@domain/usecases/monday/importMondayProjects";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { showToast } from "@shared/utils/toast";
import { ImportActionButton, ImportCard } from "./ImportCard";
import { useCallback, useEffect, useState } from "react";

interface SkippedBoard {
  boardName: string;
  reason: string;
}

/** Um projeto por board de cliente, mais o board interno vinculado. */
export function MondayProjectsImport({
  mappings,
  mondayWorkspaceId,
  deskclockWorkspaceId,
  onImported,
  reloadProjects,
}: {
  mappings: MondayProjectMapping[];
  mondayWorkspaceId: string;
  deskclockWorkspaceId: string;
  onImported: (mappings: MondayProjectMapping[]) => void;
  reloadProjects: () => Promise<void>;
}) {
  const { projectRepo } = useRepositories();
  const config = useAppConfig();
  const factories = useIntegrations();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [skipped, setSkipped] = useState<SkippedBoard[]>([]);
  const [namesById, setNamesById] = useState<Map<string, string>>(new Map());

  /**
   * Os projetos que existem **no destino**, e não a lista do workspace ativo do
   * app. O vínculo mora na config e sobrevive a apagar o projeto: sem conferir,
   * a tela mostrava o nome do board e o board apagado parecia importado.
   */
  const loadNames = useCallback(async () => {
    if (!deskclockWorkspaceId) return;
    const rows = await projectRepo.findAll(deskclockWorkspaceId);
    setNamesById(new Map(rows.map((p) => [p.id, p.name])));
  }, [projectRepo, deskclockWorkspaceId]);

  useEffect(() => {
    void loadNames();
  }, [loadNames, mappings]);

  const linked = mappings.filter((m) => namesById.has(m.deskclockProjectId));
  const stale = mappings.length - linked.length;

  async function handleImport() {
    setImporting(true);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await importMondayProjects({
        api: factories.createMondayApi(),
        projectRepo,
        workspaceId: mondayWorkspaceId,
        deskclockWorkspaceId,
        clientsFolderId: config.get("mondayClientsFolderId"),
        internalFolderId: config.get("mondayInternalFolderId"),
        internalBoardId: config.get("mondayInternalBoardId"),
        onProgress: (done, total) => setProgress({ done, total }),
      });

      const otherWorkspaces = config
        .get("mondayProjectMapping")
        .filter((m) => m.workspaceId !== mondayWorkspaceId);
      await config.set("mondayProjectMapping", [...otherWorkspaces, ...result.mappings]);
      onImported(result.mappings);
      setSkipped(result.skipped);
      await loadNames();
      await reloadProjects();

      await showToast(
        result.skipped.length > 0 ? "warning" : "success",
        result.skipped.length > 0
          ? `${result.mappings.length} projeto(s); ${result.skipped.length} board(s) fora do template.`
          : `${result.mappings.length} projeto(s) importado(s).`
      );
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao importar projetos.");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <ImportCard
      title="Projetos"
      hint="Cada board vira um projeto e guarda onde as horas serão gravadas."
      action={
        <ImportActionButton
          label={linked.length > 0 ? "Atualizar" : "Importar"}
          busy={importing}
          disabled={!mondayWorkspaceId || !deskclockWorkspaceId}
          onClick={handleImport}
        />
      }
    >
      {progress && progress.total > 0 && (
        <p className="text-[11px] text-gray-500">
          Lendo boards: {progress.done}/{progress.total}
        </p>
      )}

      {linked.length === 0 ? (
        <p className="text-xs text-gray-600 italic">Nenhum projeto vinculado ainda.</p>
      ) : (
        <div className="space-y-1">
          {linked.map((m) => (
            <div key={m.mondayBoardId} className="flex items-center gap-3 py-1">
              <span className="text-xs text-gray-300 flex-1 truncate">
                {namesById.get(m.deskclockProjectId)}
              </span>
              <span className="text-xs text-gray-500 truncate max-w-[45%]">
                {m.mondayBoardName}
              </span>
            </div>
          ))}
        </div>
      )}

      {stale > 0 && (
        <p className="text-[11px] text-amber-500/80">
          {stale} vínculo(s) apontam para projetos que não existem mais no destino. Importe de novo
          para recriá-los.
        </p>
      )}

      {/* O motivo de cada board recusado já existia no resultado do import e era
          descartado: o usuário via só o número e não tinha como agir. */}
      {skipped.length > 0 && (
        <div className="border-t border-gray-800 pt-2 space-y-1">
          <p className="text-[11px] text-gray-500">
            {skipped.length} board(s) fora do template de Activities:
          </p>
          {skipped.map((s) => (
            <div key={s.boardName} className="flex items-baseline gap-2">
              <span className="text-[11px] text-gray-400 truncate max-w-[45%]">{s.boardName}</span>
              <span className="text-[11px] text-gray-600 truncate">{s.reason}</span>
            </div>
          ))}
        </div>
      )}
    </ImportCard>
  );
}
