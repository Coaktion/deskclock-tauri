import { MAX_SUMMARY_DAYS } from "@domain/usecases/llm/SummarizeWorkdays";
import { summaryScopeNote } from "@presentation/hooks/daySummaries";
import { runDaySummaries } from "@presentation/integrations/daySummaries";
import { DomainError } from "@shared/errors";
import { addDaysISO, localDateISO } from "@shared/utils/time";
import { assertConfigured, importBody, optionalString, type ImportBody } from "../importInput";
import { periodRange } from "../period";
import { resolveRequestWorkspace } from "../resolve";
import type { LocalApiDeps, LocalApiHandler, LocalApiParams } from "../types";
import { searchHistory } from "./history";

// O resumo do dia por IA pela API local (`mcp.md` §7, Fase D2). A geração é a
// da aba Resumo do Histórico, num lugar só (`runDaySummaries`): teto de dias,
// o dia já resumido não é regerado, hoje é a exceção, erro por dia e parada no
// limite de cota. Sem provedor configurado a aba nem aparece — aqui é 409.

/**
 * Teto do período da leitura, regra só da API: a leitura consulta dia a dia, e
 * sem teto um período de séculos montaria uma consulta com milhões de dias.
 */
const MAX_LIST_DAYS = 366;

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDaysISO(day, 1)) {
    days.push(day);
    if (days.length > MAX_LIST_DAYS) {
      throw new DomainError(`O período pode ter no máximo ${MAX_LIST_DAYS} dias`);
    }
  }
  return days;
}

export const listDaySummaries: LocalApiHandler = async (deps, params) => {
  assertConfigured(deps.llm());
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const { from, to } = periodRange(deps, params);
  const found = await deps.daySummaryRepo.findByDays(workspaceId, daysBetween(from, to));
  return {
    status: 200,
    body: {
      workspaceId,
      from,
      to,
      summaries: found
        .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
        .map((entry) => ({
          date: entry.dateISO,
          summary: entry.summary,
          generatedAt: entry.generatedAt,
        })),
    },
  };
};

function optionalBooleanText(body: ImportBody, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new DomainError(`${key} deve ser true ou false`);
  return String(value);
}

/** O corpo do `POST` vira os mesmos parâmetros da busca do Histórico. */
function searchParams(raw: unknown): LocalApiParams {
  const body = importBody(raw);
  return {
    from: optionalString(body, "from"),
    to: optionalString(body, "to"),
    workspaceId: optionalString(body, "workspaceId"),
    name: optionalString(body, "name"),
    projectId: optionalString(body, "projectId"),
    categoryId: optionalString(body, "categoryId"),
    billable: optionalBooleanText(body, "billable"),
  };
}

async function projectNames(deps: LocalApiDeps, workspaceId: string) {
  const byId = new Map(
    (await deps.projectRepo.findAll(workspaceId)).map((project) => [project.id, project.name])
  );
  return (id: string | null) => (id === null ? undefined : byId.get(id));
}

export const generateDaySummaries: LocalApiHandler = async (deps, params) => {
  const source = deps.llm();
  assertConfigured(source);
  const { workspaceId, from, to, tasks } = await searchHistory(deps, searchParams(params.body));
  // Os dias do resultado da busca, do mais recente ao mais antigo — o que a
  // aba recebe da página.
  const dateISOs = [...new Set(tasks.map((task) => localDateISO(task.startTime)))].sort((a, b) =>
    b.localeCompare(a)
  );

  const run = await runDaySummaries(
    { taskRepo: deps.taskRepo, daySummaryRepo: deps.daySummaryRepo, llm: source.createLlm() },
    {
      workspaceId,
      dateISOs,
      projectNameById: await projectNames(deps, workspaceId),
      todayISO: deps.todayISO(),
    }
  );
  if (run.limits) await source.saveLimits(run.limits);

  return {
    status: 200,
    body: {
      workspaceId,
      from,
      to,
      dayCount: dateISOs.length,
      coveredDays: dateISOs.slice(0, MAX_SUMMARY_DAYS),
      scopeNote: summaryScopeNote(dateISOs.length),
      summaries: run.summaries.map((entry) => ({
        date: entry.dateISO,
        summary: entry.summary,
        source: entry.source,
      })),
      errors: run.errors.map((error) => ({ date: error.dateISO, message: error.message })),
      skipped: run.skipped,
    },
  };
};
