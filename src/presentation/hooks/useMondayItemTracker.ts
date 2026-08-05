import { useEffect, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { activeCustomFields, getCustomFields } from "@domain/usecases/customFields/GetCustomFields";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import {
  syncMondayPlannedTasks,
  type SyncMondayPlannedTasksResult,
} from "@domain/usecases/monday/syncMondayPlannedTasks";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { OVERLAY_EVENTS, type MondayImportSyncResultPayload } from "@shared/types/overlayEvents";
import { weekBoundsISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";

// Item de board não muda de minuto em minuto, e cada ciclo custa uma busca de
// schemas mais uma de itens por variação de template.
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
// Atraso do primeiro ciclo: dá tempo de a config e os repositórios assentarem
// antes da primeira ida à rede, e tira a busca do caminho da abertura do app.
const INITIAL_DELAY_MS = 5000;

/**
 * Importa sozinho, como tarefas planejadas, os itens do usuário nos boards
 * mapeados do Monday — o análogo do `useMeetingTracker` para o Monday, sem
 * prompt algum. Deve rodar na janela principal.
 *
 * Toda a decisão de negócio vive em `syncMondayPlannedTasks`; aqui só há
 * agendamento, leitura de config e o toast do botão "Buscar itens agora".
 */
export function useMondayItemTracker() {
  const config = useAppConfig();
  const { createMondayApi } = useIntegrations();
  const { mondayImportedItemRepo, plannedTaskRepo, projectRepo, categoryRepo, customFieldRepo } =
    useRepositories();
  const { activeWorkspaceId: workspaceId, loading: workspaceLoading } = useWorkspaces();

  // O efeito roda uma vez e captura o closure; sem o ref, o workspace congelaria
  // no que estava ativo na montagem e todo item importado depois de uma troca
  // cairia no workspace errado.
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  // Enquanto o WorkspaceContext carrega, o id ativo é o do workspace "Padrão" —
  // um palpite. Sincronizar antes da resolução leria o catálogo do workspace
  // errado e, sem projeto mapeado lá, o ciclo não faria nada em silêncio.
  //
  // O gate é no efeito, não no `enabled()`: aqui o intervalo é de 30 min, então
  // barrar dentro do tick não adiaria o primeiro ciclo por um tick — adiaria por
  // meia hora. Reexecutar o efeito faz o atraso inicial contar da resolução.
  useEffect(() => {
    if (!config.isLoaded || workspaceLoading) return;

    let disposed = false;
    let inFlight = false;

    const enabled = () =>
      config.get("mondayAutoImportEnabled") &&
      !!config.get("mondayApiKey") &&
      !!config.get("mondayUserId");

    async function runSync(): Promise<SyncMondayPlannedTasksResult | null> {
      const activeWorkspaceId = workspaceIdRef.current;

      const [projects, categories, fields] = await Promise.all([
        projectRepo.findAll(activeWorkspaceId),
        categoryRepo.findAll(activeWorkspaceId),
        getCustomFields(customFieldRepo),
      ]);

      // Só os boards cujo Project existe **no workspace ativo**: o vínculo mora
      // na config e não sabe de workspace, então importar por um board mapeado
      // noutro criaria planejadas apontando para projeto que a tela nem exibe.
      // E só os que têm board: projeto sem "ID Quadro Projeto" não tem itens a
      // buscar, e mandá-lo na consulta pediria os itens de um board vazio.
      const mappings = normalizeProjectMappings(config.get("mondayProjectMapping"))
        .filter((m) => !!m.mondayBoardId)
        .filter((m) => projects.some((p) => p.id === m.deskclockProjectId));

      const stageField =
        activeCustomFields(fields).find((f) => f.id === config.get("mondayProjectStageFieldId")) ??
        null;

      const result = await syncMondayPlannedTasks(
        {
          api: createMondayApi(),
          trackedRepo: mondayImportedItemRepo,
          plannedRepo: plannedTaskRepo,
        },
        {
          mappings,
          projects,
          categories,
          stageField,
          personId: config.get("mondayUserId"),
          workspaceId: activeWorkspaceId,
          window: weekBoundsISO(),
          nowISO: new Date().toISOString(),
        }
      );

      if (result.created + result.updated + result.removed > 0) {
        await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      }
      return result;
    }

    async function tick(): Promise<SyncMondayPlannedTasksResult | null> {
      if (disposed || inFlight || !enabled()) return null;
      // Guarda de re-entrância: o ciclo faz várias idas à rede e pode passar do
      // intervalo. Dois ciclos concorrentes leriam o mesmo rastreamento vazio e
      // criariam a planejada duas vezes.
      inFlight = true;
      try {
        return await runSync();
      } finally {
        inFlight = false;
      }
    }

    // O botão das Configurações fica travado até este evento chegar, então todo
    // caminho de saída daqui precisa emiti-lo — inclusive os de erro.
    async function emitSyncResult(payload: MondayImportSyncResultPayload) {
      await emit(OVERLAY_EVENTS.MONDAY_IMPORT_SYNC_RESULT, payload);
    }

    // Busca manual do botão "Buscar itens agora" nas Configurações.
    async function handleSyncNow() {
      if (!enabled()) {
        await emitSyncResult({
          ok: false,
          created: 0,
          updated: 0,
          removed: 0,
          error: "Conecte o Monday e ative a importação automática para buscar itens.",
        });
        return;
      }

      let result: SyncMondayPlannedTasksResult | null = null;
      try {
        result = await tick();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro ao buscar itens.";
        await emitSyncResult({ ok: false, created: 0, updated: 0, removed: 0, error: message });
        await showToast("error", message);
        return;
      }

      if (!result) {
        // `tick` devolve null quando já há um ciclo em andamento — o automático
        // pegou o mesmo instante. Não é erro, mas o botão precisa saber.
        await emitSyncResult({ ok: true, created: 0, updated: 0, removed: 0, busy: true });
        return;
      }

      const { created, updated, removed } = result;
      await emitSyncResult({ ok: true, created, updated, removed });
      if (created + updated + removed === 0) {
        await showToast("info", "Nenhuma novidade nos boards do Monday");
      } else {
        await showToast(
          "success",
          [
            created > 0 ? `${created} planejada(s) criada(s)` : null,
            updated > 0 ? `${updated} atualizada(s)` : null,
            removed > 0 ? `${removed} removida(s)` : null,
          ]
            .filter(Boolean)
            .join(", ")
        );
      }
    }

    const unlistenSyncNow = listen(
      OVERLAY_EVENTS.MONDAY_IMPORT_SYNC_NOW,
      () => void handleSyncNow()
    );

    // A busca é best-effort (rede/token): falhar não pode derrubar o intervalo.
    const initialTimer = setTimeout(() => void tick().catch(() => null), INITIAL_DELAY_MS);
    const interval = setInterval(() => void tick().catch(() => null), SYNC_INTERVAL_MS);

    return () => {
      disposed = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      unlistenSyncNow.then((fn) => fn());
    };
    // createMondayApi e os repos vêm de Providers e são estáveis por sessão;
    // capturá-los uma vez no mount é seguro (§9.2).
  }, [config.isLoaded, workspaceLoading]); // eslint-disable-line react-hooks/exhaustive-deps
}
