import { useEffect, useRef } from "react";
import { importMondayProjects } from "@domain/usecases/monday/importMondayProjects";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import {
  isMondayLinkedWorkspace,
  shouldSyncMondayProjects,
} from "@domain/usecases/monday/mondayProjectsSyncPolicy";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { notifyProjectsChanged } from "@shared/utils/catalogSync";
import { truncateError } from "@shared/utils/syncError";
import { todayISO } from "@shared/utils/time";

// Cadência do relógio, não do trabalho: o ciclo só vai à rede quando o dia
// virou. Um app aberto a semana inteira precisa perceber a virada sem depender
// de ser reaberto.
const TICK_MS = 30 * 60 * 1000;
// Atraso do primeiro tick, para tirar a busca do caminho da abertura do app.
const INITIAL_DELAY_MS = 8000;

/**
 * Relê os boards do Monday como Projects **uma vez por dia**.
 *
 * Cliente novo no board vira Project sem ninguém lembrar de abrir Integrações e
 * apertar "Atualizar" — que era a única forma de a lista crescer. Faz
 * exatamente o que aquele botão faz (`importMondayProjects`), no mesmo destino,
 * e mantém os vínculos dos outros workspaces do Monday, que a varredura deste
 * não conhece.
 *
 * **Só roda num workspace que já tem projeto mapeado do Monday.** Sem isso, o
 * destino seria o workspace ativo, qualquer que fosse ele: bastava estar num
 * workspace pessoal na virada do dia para todos os boards da empresa nascerem
 * lá dentro, sem ninguém ter pedido. A guarda é provisória e some quando a
 * integração ganhar o workspace DeskClock associado em config — aí o destino
 * deixa de depender de onde o usuário está.
 *
 * Deve rodar na janela principal, como os outros rastreadores.
 */
export function useMondayProjectsTracker() {
  const config = useAppConfig();
  const { createMondayApi } = useIntegrations();
  const { projectRepo } = useRepositories();
  const { activeWorkspaceId: workspaceId, loading: workspaceLoading } = useWorkspaces();

  // O efeito roda uma vez e captura o closure; sem o ref, o destino congelaria
  // no workspace da montagem e uma troca depois criaria projeto no lugar errado.
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  // Enquanto o WorkspaceContext carrega, o id ativo é o do workspace "Padrão" —
  // um palpite. O gate é no efeito e não dentro do tick porque aqui o intervalo
  // é de 30 min: barrar no tick não adiaria o primeiro ciclo por um tick, e sim
  // por meia hora (§5.7).
  useEffect(() => {
    if (!config.isLoaded || workspaceLoading) return;

    let disposed = false;
    let inFlight = false;

    async function runSync(): Promise<void> {
      const deskclockWorkspaceId = workspaceIdRef.current;
      const mondayWorkspaceId = config.get("mondayActiveWorkspaceId");

      // Já mapeado **neste** workspace: é o que prova que o usuário escolheu
      // trazer os boards do Monday para cá. O vínculo mora na config e não sabe
      // de workspace, então a prova é o projeto existir no destino.
      const projectIds = new Set(
        (await projectRepo.findAll(deskclockWorkspaceId)).map((p) => p.id)
      );
      const linked = isMondayLinkedWorkspace(
        normalizeProjectMappings(config.get("mondayProjectMapping")),
        mondayWorkspaceId,
        projectIds
      );
      if (!linked) return;

      const result = await importMondayProjects({
        api: createMondayApi(),
        projectRepo,
        workspaceId: mondayWorkspaceId,
        deskclockWorkspaceId,
        clientsFolderId: config.get("mondayClientsFolderId"),
        internalFolderId: config.get("mondayInternalFolderId"),
        internalBoardId: config.get("mondayInternalBoardId"),
      });

      // Os vínculos dos outros workspaces do Monday não passaram por esta
      // varredura: sobrescrever a chave inteira os apagaria. Mesma mescla do
      // botão da tela de Integrações.
      const otherWorkspaces = normalizeProjectMappings(config.get("mondayProjectMapping")).filter(
        (m) => m.workspaceId !== mondayWorkspaceId
      );
      await config.set("mondayProjectMapping", [...otherWorkspaces, ...result.mappings]);

      // Os projetos nascem pelo repositório, sem passar pelas mutações de
      // `useProjects`: sem o aviso, o overlay-popup — que nasce com o app e
      // nunca remonta — ficaria com o catálogo velho para sempre (§9.2).
      await notifyProjectsChanged();

      // Só depois do sucesso: gravar antes trocaria uma falha de rede pela
      // perda da varredura do dia inteiro.
      await config.set("mondayProjectsSyncLastDate", todayISO());
    }

    async function tick(): Promise<void> {
      if (disposed || inFlight) return;
      const due = shouldSyncMondayProjects({
        apiKey: config.get("mondayApiKey"),
        mondayWorkspaceId: config.get("mondayActiveWorkspaceId"),
        lastSyncDate: config.get("mondayProjectsSyncLastDate"),
        todayISO: todayISO(),
      });
      if (!due) return;

      inFlight = true;
      let failure = "";
      try {
        await runSync();
      } catch (err: unknown) {
        failure = truncateError(err instanceof Error ? err.message : String(err));
        console.error("[mondayProjectsTracker] falha ao reler os boards", err);
      } finally {
        inFlight = false;
      }

      // Escrever só na mudança: o tick roda a cada 30 min e gravar sempre seria
      // um UPDATE no SQLite sem nada de novo para dizer.
      if (config.get("mondayProjectsLastSyncError") !== failure) {
        await config.set("mondayProjectsLastSyncError", failure);
      }
    }

    const initialTimer = setTimeout(() => void tick(), INITIAL_DELAY_MS);
    const interval = setInterval(() => void tick(), TICK_MS);

    return () => {
      disposed = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
    // createMondayApi e projectRepo vêm de Providers e são estáveis por sessão;
    // capturá-los uma vez na montagem é seguro (§9.2).
  }, [config.isLoaded, workspaceLoading]); // eslint-disable-line react-hooks/exhaustive-deps
}
