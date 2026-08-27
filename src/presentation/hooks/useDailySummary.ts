import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { summarizeWorkday } from "@domain/usecases/llm/SummarizeWorkday";
import { getLastDayWithTasks } from "@domain/usecases/tasks/GetLastDayWithTasks";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { useProjects } from "@presentation/hooks/useProjects";
import {
  describeLlmError,
  isLlmConnected,
} from "@presentation/sections/integrations/llm/llmConnection";
import { isDailySummaryCacheValid } from "./dailySummary";

export type DailySummaryStatus = "idle" | "loading" | "ready" | "error";

export interface DailySummaryState {
  /** `idle` é a seção calada: sem provedor, sem dia trabalhado ou sem tarefa nomeada. */
  status: DailySummaryStatus;
  /** O dia resumido — o que o título escreve. */
  dateISO: string | null;
  summary: string;
  /** Já traduzido por `describeLlmError`; o erro cru não chega à tela. */
  error: string | null;
}

const IDLE: DailySummaryState = { status: "idle", dateISO: null, summary: "", error: null };

/**
 * O resumo do último dia trabalhado, gerado uma vez por dia e por workspace.
 *
 * **Erro não repete sozinho.** A mensagem fica e o ciclo para: insistir contra
 * um 429 é o pior que um cliente de rate limit pode fazer, e quem decide tentar
 * de novo é o usuário, pelo `reload`.
 */
export function useDailySummary() {
  const { taskRepo } = useRepositories();
  const { createLlmApi } = useIntegrations();
  const config = useAppConfig();
  const workspaceId = useActiveWorkspaceId();
  const { projects, loading: projectsLoading } = useProjects();
  const [state, setState] = useState<DailySummaryState>(IDLE);

  const projectNameById = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project.name]));
    return (id: string | null) => (id === null ? undefined : byId.get(id));
  }, [projects]);

  // Só a corrida mais recente escreve estado: trocar de workspace no meio de uma
  // geração deixaria a resposta anterior chegar depois e sobrescrever a nova.
  const runIdRef = useRef(0);

  const run = useCallback(
    async (force: boolean) => {
      const runId = ++runIdRef.current;
      const isCurrent = () => runId === runIdRef.current;

      const day = await getLastDayWithTasks(taskRepo, workspaceId);
      if (!isCurrent()) return;
      if (!day) {
        setState(IDLE);
        return;
      }

      const cache = {
        dateISO: config.get("llmSummaryDate"),
        text: config.get("llmSummaryText"),
        workspaceId: config.get("llmSummaryWorkspaceId"),
      };
      if (!force && isDailySummaryCacheValid(cache, day.dateISO, workspaceId)) {
        setState({ status: "ready", dateISO: cache.dateISO, summary: cache.text, error: null });
        return;
      }

      setState({ status: "loading", dateISO: day.dateISO, summary: "", error: null });
      try {
        const result = await summarizeWorkday(
          { taskRepo, llm: createLlmApi() },
          { workspaceId, projectNameById }
        );
        if (!isCurrent()) return;
        if (!result) {
          setState(IDLE);
          return;
        }
        await config.set("llmSummaryDate", result.dateISO);
        await config.set("llmSummaryText", result.summary);
        await config.set("llmSummaryWorkspaceId", workspaceId);
        if (!isCurrent()) return;
        setState({
          status: "ready",
          dateISO: result.dateISO,
          summary: result.summary,
          error: null,
        });
      } catch (error) {
        if (!isCurrent()) return;
        setState({
          status: "error",
          dateISO: day.dateISO,
          summary: "",
          error: describeLlmError(error),
        });
      }
    },
    [taskRepo, workspaceId, config, createLlmApi, projectNameById]
  );

  // Sem os projetos carregados o prompt sairia sem nome de projeto nenhum — e
  // esse resumo empobrecido é o que ficaria em cache pelo resto do dia.
  const ready =
    config.isLoaded &&
    !projectsLoading &&
    isLlmConnected(config.get("llmBaseUrl"), config.get("llmModel"));

  const autoRunRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || autoRunRef.current === workspaceId) return;
    autoRunRef.current = workspaceId;
    void run(false);
  }, [ready, workspaceId, run]);

  const reload = useCallback(() => {
    autoRunRef.current = workspaceId;
    void run(true);
  }, [run, workspaceId]);

  return { ...state, reload };
}
