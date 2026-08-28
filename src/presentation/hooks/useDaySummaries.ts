import { useCallback, useMemo, useRef, useState } from "react";
import { summarizeWorkdays, type DaySummaryResult } from "@domain/usecases/llm/SummarizeWorkdays";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { useProjects } from "@presentation/hooks/useProjects";
import {
  describeLlmError,
  isLlmConnected,
} from "@presentation/sections/integrations/llm/llmConnection";

export interface DaySummaryError {
  dateISO: string;
  /** Já traduzido por `describeLlmError`; o erro cru não chega à tela. */
  message: string;
}

export interface DaySummariesState {
  summaries: DaySummaryResult[];
  errors: DaySummaryError[];
  /** Dias que o lote deixou de tentar por ter parado num limite de cota. */
  skipped: string[];
  progress: { done: number; total: number } | null;
}

const EMPTY: DaySummariesState = { summaries: [], errors: [], skipped: [], progress: null };

/**
 * Os resumos por dia do resultado da busca do Histórico.
 *
 * **Nada é gerado sozinho.** A geração é sempre um clique: cada dia é uma
 * requisição paga, e uma tela que resume ao abrir gastaria a cota de quem só
 * queria conferir as horas de ontem.
 *
 * **Erro não repete sozinho.** A mensagem fica e o ciclo para; quem decide
 * tentar de novo é o usuário, pelo mesmo botão.
 */
export function useDaySummaries(dateISOs: string[]) {
  const { taskRepo, daySummaryRepo } = useRepositories();
  const { createLlmApi } = useIntegrations();
  const config = useAppConfig();
  const workspaceId = useActiveWorkspaceId();
  const { projects } = useProjects();
  const [state, setState] = useState<DaySummariesState>(EMPTY);

  const projectNameById = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project.name]));
    return (id: string | null) => (id === null ? undefined : byId.get(id));
  }, [projects]);

  // Só a corrida mais recente escreve estado: trocar de workspace ou refazer a
  // busca no meio de uma geração deixaria a resposta anterior chegar depois e
  // sobrescrever a nova.
  const runIdRef = useRef(0);

  const generate = useCallback(async () => {
    const runId = ++runIdRef.current;
    const isCurrent = () => runId === runIdRef.current;

    setState({ ...EMPTY, progress: { done: 0, total: 0 } });
    const outcome = await summarizeWorkdays(
      { taskRepo, daySummaryRepo, llm: createLlmApi() },
      {
        workspaceId,
        dateISOs,
        projectNameById,
        onProgress: (progress) => {
          if (isCurrent()) setState((prev) => ({ ...prev, progress }));
        },
      }
    );
    if (!isCurrent()) return;

    // A cota só se conhece **fazendo** a chamada, e o card de Integrações não
    // tem outra fonte — sem guardar o que esta rodada mediu, ele fica com a
    // leitura anterior, que pode ser de dias atrás.
    if (outcome.limits) {
      await config.set("llmLastLimits", outcome.limits);
      await config.set("llmLastLimitsAt", new Date().toISOString());
    }
    if (!isCurrent()) return;
    setState({
      summaries: outcome.summaries,
      errors: outcome.failed.map((failure) => ({
        dateISO: failure.dateISO,
        message: describeLlmError(failure.error),
      })),
      skipped: outcome.skipped,
      progress: null,
    });
  }, [taskRepo, daySummaryRepo, createLlmApi, config, workspaceId, dateISOs, projectNameById]);

  const connected =
    config.isLoaded && isLlmConnected(config.get("llmBaseUrl"), config.get("llmModel"));

  return {
    ...state,
    connected,
    running: state.progress !== null,
    generate: () => void generate(),
  };
}
