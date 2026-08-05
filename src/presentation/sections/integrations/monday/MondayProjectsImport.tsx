import {
  importMondayProjects,
  resolveProjectDestination,
} from "@domain/usecases/monday/importMondayProjects";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { notifyProjectsChanged } from "@shared/utils/catalogSync";
import { todayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";
import { ImportActionButton, ImportCard } from "./ImportCard";
import { useCallback, useEffect, useState } from "react";

interface SkippedBoard {
  boardName: string;
  reason: string;
}

/**
 * Campo do id do quadro, para o projeto cujo item de Portfólio ainda não tem a
 * coluna "ID Quadro Projeto" preenchida — 14 dos 62 hoje.
 *
 * Grava no blur ou no Enter, e não a cada tecla: um id parcial viraria uma
 * consulta a board inexistente no próximo ciclo do rastreador.
 */
function ProjectBoardIdInput({
  value,
  onSave,
}: {
  value: string;
  onSave: (boardId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);

  function commit() {
    const next = draft.trim();
    if (next === value) return;
    void onSave(next);
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="ID do quadro"
      title="Id do board onde as horas deste projeto serão gravadas"
      className="shrink-0 w-28 bg-gray-800 border border-amber-500/40 rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
    />
  );
}

/** Um projeto por item do board de Portfólio. */
export function MondayProjectsImport({
  mappings,
  deskclockWorkspaceId,
  onImported,
  reloadProjects,
}: {
  mappings: MondayProjectMapping[];
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
  const [autoError, setAutoError] = useState("");

  // Hidratação única: `config` é recriado a cada render do provider e reler a
  // cada um sobrescreveria o estado de um import em curso.
  useEffect(() => {
    if (config.isLoaded) setAutoError(config.get("mondayProjectsLastSyncError"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const portfolioBoardId = config.isLoaded ? config.get("mondayPortfolioBoardId") : "";
  const linked = mappings.filter((m) => namesById.has(m.deskclockProjectId));
  const stale = mappings.length - linked.length;
  const missingBoard = linked.filter((m) => !m.mondayBoardId).length;

  /**
   * Grava o quadro digitado à mão e já lê o schema dele.
   *
   * Sem ler o schema o vínculo ficaria sem grupo nem colunas — o projeto
   * apareceria vinculado e o envio continuaria sem ter onde criar a atividade,
   * que é o problema que o campo existe para resolver.
   */
  async function handleSetBoardId(portfolioItemId: string, boardId: string) {
    const { destination, failure } = await resolveProjectDestination(
      factories.createMondayApi(),
      boardId
    );
    if (failure) {
      await showToast("error", failure);
      return;
    }

    const next = normalizeProjectMappings(config.get("mondayProjectMapping")).map((m) =>
      m.portfolioItemId === portfolioItemId ? { ...m, mondayBoardId: boardId, ...destination } : m
    );
    await config.set("mondayProjectMapping", next);
    onImported(next);
    await showToast("success", boardId ? "Quadro vinculado." : "Quadro removido.");
  }

  async function handleImport() {
    setImporting(true);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await importMondayProjects({
        api: factories.createMondayApi(),
        projectRepo,
        portfolioBoardId: config.get("mondayPortfolioBoardId"),
        deskclockWorkspaceId,
        // Sem isto, o quadro digitado à mão logo abaixo seria desfeito no
        // primeiro "Atualizar": o Portfólio devolve a coluna vazia.
        existingMappings: normalizeProjectMappings(config.get("mondayProjectMapping")),
        onProgress: (done, total) => setProgress({ done, total }),
      });

      await config.set("mondayProjectMapping", result.mappings);
      // O clique acabou de fazer o trabalho do dia: marcar a data evita que a
      // releitura automática repita a mesma varredura horas depois, e limpar o
      // erro tira da tela uma falha que deixou de valer.
      await config.set("mondayProjectsSyncLastDate", todayISO());
      await config.set("mondayProjectsLastSyncError", "");
      setAutoError("");
      onImported(result.mappings);
      setSkipped(result.skipped);
      await loadNames();
      await reloadProjects();
      // Os projetos nascem pelo repositório, sem passar pelas mutações de
      // `useProjects`: sem este aviso, o overlay não os enxergaria até reiniciar.
      await notifyProjectsChanged();

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
      hint="Cada item do Portfólio vira um projeto e guarda onde as horas serão gravadas. A lista é relida sozinha uma vez por dia."
      action={
        <ImportActionButton
          label={linked.length > 0 ? "Atualizar" : "Importar"}
          busy={importing}
          disabled={!portfolioBoardId || !deskclockWorkspaceId}
          onClick={handleImport}
        />
      }
    >
      {progress && progress.total > 0 && (
        <p className="text-[11px] text-gray-500">
          Lendo projetos: {progress.done}/{progress.total}
        </p>
      )}

      {linked.length === 0 ? (
        <p className="text-xs text-gray-600 italic">Nenhum projeto vinculado ainda.</p>
      ) : (
        <div className="space-y-1">
          {linked.map((m) => (
            <div key={m.portfolioItemId} className="flex items-center gap-3 py-1">
              <span className="text-xs text-gray-300 flex-1 truncate">
                {namesById.get(m.deskclockProjectId)}
              </span>
              {m.mondayBoardId ? (
                <span className="text-xs text-gray-500 truncate max-w-[45%]">
                  {m.mondayBoardName}
                </span>
              ) : (
                <ProjectBoardIdInput
                  value={m.mondayBoardId}
                  onSave={(boardId) => handleSetBoardId(m.portfolioItemId, boardId)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* O motivo fica visível para o campo acima não parecer decoração: sem o
          id, tudo funciona menos o que a integração existe para fazer. */}
      {missingBoard > 0 && (
        <p className="text-[11px] text-amber-500/80">
          {missingBoard} projeto(s) sem quadro — as horas deles não sobem. Preencha o &quot;ID
          Quadro Projeto&quot; no Portfólio ou digite o id aqui.
        </p>
      )}

      {/* A releitura diária roda em segundo plano: sem esta linha, ela falharia
          em silêncio e a lista pararia de crescer sem nada na tela para dizer
          por quê — o mesmo motivo da frase de erro do rastreio da Agenda. */}
      {autoError && (
        <p className="text-[11px] text-amber-500/80">
          Falha na última atualização automática: {autoError}
        </p>
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
