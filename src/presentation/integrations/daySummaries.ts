import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { IDaySummaryRepository } from "@domain/repositories/IDaySummaryRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import { summarizeWorkdays, type DaySummaryResult } from "@domain/usecases/llm/SummarizeWorkdays";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import {
  describeLlmError,
  isLlmConnected,
} from "@presentation/sections/integrations/llm/llmConnection";
import type { ConfigContextValue } from "@shared/types/appConfig";
import type { LlmRateLimits } from "@shared/types/llm";

// A rodada do resumo por IA como a aba Resumo do Histórico a faz, fora do hook
// para a API local gerar com as mesmas regras (`docs-internal/specs/mcp.md` §7,
// Fase D2). O teto de dias, o cache, a parada na cota e o erro por dia moram no
// `summarizeWorkdays`; aqui entram o que a aba acrescenta — hoje como o dia que
// não vem do cache e o erro já traduzido — e a gravação da cota.

/** Frase da API: na tela a aba nem aparece sem provedor, então não há uma. */
export const LLM_NOT_CONNECTED =
  "Provedor de IA não configurado. Conecte um provedor em Integrações.";

export interface DaySummaryError {
  dateISO: string;
  /** Já traduzido por `describeLlmError`; o erro cru não chega à tela. */
  message: string;
}

export interface DaySummariesRun {
  summaries: DaySummaryResult[];
  errors: DaySummaryError[];
  /** Dias que o lote deixou de tentar por ter parado num limite de cota. */
  skipped: string[];
  /** A cota da última chamada que a informou; ausente se nenhuma. */
  limits?: LlmRateLimits;
}

export interface DaySummariesRunDeps {
  taskRepo: ITaskRepository;
  daySummaryRepo: IDaySummaryRepository;
  llm: ILlmApi;
}

export interface DaySummariesRunOptions {
  workspaceId: string;
  dateISOs: string[];
  projectNameById: (id: string | null) => string | undefined;
  /** Hoje: o único dia que não vem do cache, porque ainda está acontecendo. */
  todayISO: string;
  onProgress?: (progress: { done: number; total: number }) => void;
}

export async function runDaySummaries(
  deps: DaySummariesRunDeps,
  options: DaySummariesRunOptions
): Promise<DaySummariesRun> {
  const outcome = await summarizeWorkdays(deps, {
    workspaceId: options.workspaceId,
    dateISOs: options.dateISOs,
    projectNameById: options.projectNameById,
    unfinishedDayISO: options.todayISO,
    onProgress: options.onProgress,
  });
  return {
    summaries: outcome.summaries,
    errors: outcome.failed.map((failure) => ({
      dateISO: failure.dateISO,
      message: describeLlmError(failure.error),
    })),
    skipped: outcome.skipped,
    ...(outcome.limits ? { limits: outcome.limits } : {}),
  };
}

/**
 * Guarda a cota que a rodada mediu. A cota só se conhece **fazendo** a
 * chamada, e o card de Integrações não tem outra fonte.
 */
export async function saveLlmLimits(
  config: Pick<ConfigContextValue, "set">,
  limits: LlmRateLimits,
  atISO: string
): Promise<void> {
  await config.set("llmLastLimits", limits);
  await config.set("llmLastLimitsAt", atISO);
}

/** O mesmo critério que decide se a aba Resumo existe. */
export function llmConnected(config: ConfigContextValue): boolean {
  return config.isLoaded && isLlmConnected(config.get("llmBaseUrl"), config.get("llmModel"));
}

/** O que a API local precisa do provedor — sem a chave, que fica na fábrica. */
export interface DaySummarySource {
  notConfiguredMessage: string | null;
  createLlm(): ILlmApi;
  saveLimits(limits: LlmRateLimits): Promise<void>;
}

export function buildDaySummarySource(
  config: ConfigContextValue,
  factories: Pick<IntegrationFactories, "createLlmApi">
): DaySummarySource {
  return {
    notConfiguredMessage: llmConnected(config) ? null : LLM_NOT_CONNECTED,
    createLlm: () => factories.createLlmApi(),
    saveLimits: (limits) => saveLlmLimits(config, limits, new Date().toISOString()),
  };
}
