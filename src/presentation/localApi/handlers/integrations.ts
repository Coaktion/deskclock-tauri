import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { getCategories } from "@domain/usecases/categories/GetCategories";
import { getProjects } from "@domain/usecases/projects/GetProjects";
import { groupSendStatus, loadTaskSendDays } from "@domain/usecases/tasks/LoadTaskSendDays";
import { sendBlockedReason, sendTaskGroups } from "@domain/usecases/tasks/SendTaskGroups";
import { buildResultMessage } from "@presentation/hooks/useTaskSendSelection";
import {
  isTaskSendIntegration,
  TASK_SEND_INTEGRATIONS,
  type TaskSendAdapter,
  type TaskSendIntegrationId,
} from "@presentation/integrations/taskSendAdapters";
import { DomainError } from "@shared/errors";
import { endOfDayISO, localDateISO, startOfDayISO } from "@shared/utils/time";
import { ConflictError, NotFoundError } from "../errors";
import { periodRange } from "../period";
import type { LocalApiDeps, LocalApiHandler, LocalApiParams } from "../types";

// Envio manual às integrações (`docs-internal/specs/mcp.md` §7, Fase C1). A
// regra é a do modal: o adaptador sai de `taskSendAdapters.ts` e o envio de
// `sendTaskGroups`; aqui só se traduz requisição em grupos e grupos em resposta.

function parseIntegration(value: string | undefined): TaskSendIntegrationId {
  if (isTaskSendIntegration(value)) return value;
  throw new NotFoundError(
    `Integração '${value}' desconhecida. Use: ${TASK_SEND_INTEGRATIONS.join(", ")}`
  );
}

/**
 * O adaptador da integração, com o catálogo do workspace dela — o mesmo que o
 * modal recebe de `useIntegrationCatalogs`. Não configurada → 409 com a
 * mensagem do modal.
 */
async function configuredAdapter(
  deps: LocalApiDeps,
  params: LocalApiParams
): Promise<{ adapter: TaskSendAdapter; projects: Project[]; categories: Category[] }> {
  const integration = parseIntegration(params.id);
  const workspaceId = deps.taskSend.workspaceIdFor(integration);
  const [projects, categories] = await Promise.all([
    getProjects(deps.projectRepo, workspaceId),
    getCategories(deps.categoryRepo, workspaceId),
  ]);
  const adapter = deps.taskSend.adapterFor(integration, { projects, categories });
  if (!adapter.sender) throw new ConflictError(adapter.notConfiguredMessage);
  return { adapter, projects, categories };
}

export const previewIntegrationSend: LocalApiHandler = async (deps, params) => {
  const { adapter, projects, categories } = await configuredAdapter(deps, params);
  const { from, to, startISO, endISO } = periodRange(deps, params);
  const { dayGroups, sentIds } = await loadTaskSendDays(
    deps.taskRepo,
    deps.taskLogRepo,
    adapter.integrationId,
    adapter.workspaceId,
    startISO,
    endISO
  );
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const pending: TaskGroup[] = [];
  const days = dayGroups.map(({ date, groups }) => ({
    date,
    totalSeconds: groups.reduce((sum, g) => sum + g.totalSeconds, 0),
    groups: groups.map((g) => {
      const status = groupSendStatus(g, sentIds, adapter.validateTask);
      if (status.state === "pending") pending.push(g);
      const first = g.tasks[0];
      return {
        key: g.key,
        name: first.name,
        projectId: first.projectId,
        projectName: first.projectId ? projectNames.get(first.projectId) : undefined,
        categoryId: first.categoryId,
        categoryName: first.categoryId ? categoryNames.get(first.categoryId) : undefined,
        totalSeconds: g.totalSeconds,
        taskIds: g.tasks.map((t) => t.id),
        sentTaskIds: g.tasks.filter((t) => sentIds.has(t.id)).map((t) => t.id),
        ...status,
      };
    }),
  }));

  return {
    status: 200,
    body: {
      integration: adapter.integrationId,
      workspaceId: adapter.workspaceId,
      from,
      to,
      days,
      // O aviso que o modal daria ao enviar os pendentes (a pré-seleção dele).
      sendWarning: pending.length > 0 ? sendBlockedReason(adapter, pending) : null,
      resendWarning: adapter.resendWarning,
    },
  };
};

function requireTaskIds(body: unknown): string[] {
  const ids = (body as { taskIds?: unknown } | null)?.taskIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new DomainError("taskIds deve ser uma lista de ids de tarefa");
  }
  const unique = [...new Set(ids as string[])];
  if (unique.length === 0) throw new DomainError("Selecione ao menos uma tarefa.");
  return unique;
}

async function loadRequested(deps: LocalApiDeps, ids: string[], workspaceId: string) {
  const found = await Promise.all(ids.map((id) => deps.taskRepo.findById(id)));
  const missing = ids.filter((_, i) => !found[i]);
  if (missing.length > 0) {
    throw new NotFoundError(`Tarefas não encontradas: ${missing.join(", ")}`);
  }
  const tasks = found as Task[];
  const active = tasks.filter((t) => t.status !== "completed").map((t) => t.id);
  if (active.length > 0) {
    throw new ConflictError(`Só tarefas concluídas são enviadas: ${active.join(", ")}`);
  }
  const outside = tasks.filter((t) => t.workspaceId !== workspaceId).map((t) => t.id);
  if (outside.length > 0) {
    throw new ConflictError(
      `Tarefas fora do workspace da integração (${workspaceId}): ${outside.join(", ")}`
    );
  }
  return tasks;
}

/**
 * Um id escolhe o **grupo inteiro** em que ele está, no dia dele — como a
 * caixa do modal, que só marca grupo. Mandar só parte do grupo mudaria a carga
 * (o representante leva a duração somada) e não é algo que a tela faça.
 */
async function groupsOf(deps: LocalApiDeps, adapter: TaskSendAdapter, tasks: Task[]) {
  const days = tasks.map((t) => localDateISO(t.startTime)).sort();
  const { dayGroups, sentIds } = await loadTaskSendDays(
    deps.taskRepo,
    deps.taskLogRepo,
    adapter.integrationId,
    adapter.workspaceId,
    startOfDayISO(days[0]),
    endOfDayISO(days[days.length - 1])
  );
  const wanted = new Set(tasks.map((t) => t.id));
  const groups = dayGroups.flatMap(({ groups }) =>
    groups.filter((g) => g.tasks.some((t) => wanted.has(t.id)))
  );
  return { groups, sentIds };
}

export const sendToIntegration: LocalApiHandler = async (deps, params) => {
  const ids = requireTaskIds(params.body);
  const { adapter } = await configuredAdapter(deps, params);
  const tasks = await loadRequested(deps, ids, adapter.workspaceId);
  const { groups, sentIds } = await groupsOf(deps, adapter, tasks);

  // O modal não deixa marcar grupo inválido; aqui é erro, antes de enviar nada.
  const invalid = groups
    .map((g) => ({ g, status: groupSendStatus(g, sentIds, adapter.validateTask) }))
    .filter(({ status }) => status.state === "invalid")
    .map(
      ({ g, status }) =>
        `"${g.tasks[0].name ?? "(sem nome)"}" — faltando: ${status.missing.join(", ")}`
    );
  if (invalid.length > 0) throw new ConflictError(`Dados incompletos:\n${invalid.join("\n")}`);

  const result = await sendTaskGroups(adapter, groups, deps.taskLogRepo);
  if (result.kind === "blocked") throw new ConflictError(result.message);

  const { outcome, sent } = result;
  // O badge "Enviado" das telas relê o log quando a lista de tarefas recarrega.
  if (sent.taskIds.length > 0) await deps.notifyTasksChanged();
  return {
    status: 200,
    body: {
      sentTaskIds: sent.taskIds,
      skippedTaskIds: outcome.skippedTaskIds ?? [],
      refused: outcome.refused,
      failed: outcome.failed,
      sentGroups: sent.fullySentGroups,
      message: buildResultMessage(sent.fullySentGroups, outcome).text,
    },
  };
};
