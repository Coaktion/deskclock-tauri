import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { todayISO } from "@shared/utils/time";

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
 * **A busca dispara a geração.** O lote consulta `day_summaries` antes do
 * provedor: dia já resumido volta do banco sem gastar requisição, e só o dia
 * novo é chamado. É esse cache que torna o disparo automático viável — rebuscar
 * a mesma semana não custa nada.
 *
 * **Cada conjunto de dias roda uma vez.** A chave é workspace + dias, e é o que
 * impede o recarregamento por `TASKS_CHANGED` — que refaz a busca a cada tarefa
 * salva em qualquer janela — de virar uma segunda rodada paga sobre os mesmos
 * dias. É também o que faz valer o **erro não repete sozinho**: a mensagem fica,
 * e quem decide tentar de novo é o usuário, pelo botão.
 *
 * **Hoje é o único dia que não vem do cache.** O dia ainda está acontecendo, e o
 * filtro padrão da tela é "Hoje": guardar o resumo das 9h deixaria a seção
 * afirmando a manhã pelo resto do dia.
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
        // Hoje não vale do cache: o dia ainda está acontecendo, e o filtro
        // padrão do Histórico é justamente "Hoje".
        unfinishedDayISO: todayISO(),
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

  // O que identifica uma rodada: os dias, e o workspace em que eles são lidos.
  // Sem o workspace, trocar de recorte sobre o mesmo intervalo deixaria na tela
  // os resumos do workspace anterior.
  const runKey = `${workspaceId}|${dateISOs.join(",")}`;
  const lastRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Sem provedor a chave **não** é marcada: a config carrega depois da
    // primeira renderização, e marcá-la aqui perderia a rodada da busca inicial.
    if (!connected) return;
    if (lastRunKeyRef.current === runKey) return;
    lastRunKeyRef.current = runKey;
    if (dateISOs.length === 0) {
      // Busca sem dia nenhum: cancela a rodada em voo e limpa o que a busca
      // anterior deixou escrito, que senão descreveria um resultado que saiu da
      // tela.
      runIdRef.current++;
      setState(EMPTY);
      return;
    }
    void generate();
  }, [connected, runKey, dateISOs.length, generate]);

  return {
    ...state,
    connected,
    running: state.progress !== null,
    /** O caminho de retentar: o automático já rodou para este conjunto de dias. */
    retry: () => void generate(),
  };
}
