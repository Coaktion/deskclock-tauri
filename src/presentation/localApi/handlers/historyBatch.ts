import type { Task } from "@domain/entities/Task";
import { mergeTaskGroup } from "@domain/usecases/tasks/MergeTaskGroup";
import { moveTasksToWorkspace } from "@domain/usecases/tasks/MoveTasksToWorkspace";
import type { CatalogResolution } from "@domain/usecases/workspaces/reconcileCatalog";
import { taskGroupKey } from "@domain/utils/groupTasks";
import { DomainError } from "@shared/errors";
import { localDateISO } from "@shared/utils/time";
import { ConflictError, NotFoundError } from "../errors";
import { taskDto } from "../dto";
import { assertNotActive } from "../taskInput";
import type { LocalApiDeps, LocalApiHandler } from "../types";

interface MoveBody {
  ids: string[];
  toWorkspaceId: string;
  project: CatalogResolution;
  category: CatalogResolution;
  mode: string;
}

// Tudo ou nada, como nos lotes do catálogo: agir só em parte esconderia do
// cliente o id que errou.
async function loadAll(deps: LocalApiDeps, ids: string[]): Promise<Task[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new DomainError("Informe ao menos uma tarefa em ids");
  const found = await Promise.all(unique.map((id) => deps.taskRepo.findById(id)));
  const missing = unique.filter((_, i) => !found[i]);
  if (missing.length > 0) {
    throw new NotFoundError(`Tarefas não encontradas: ${missing.join(", ")}`);
  }
  const tasks = found as Task[];
  tasks.forEach(assertNotActive);
  return tasks;
}

export const deleteManyHistoryTasks: LocalApiHandler = async (deps, params) => {
  const { ids } = params.body as { ids: string[] };
  const tasks = await loadAll(deps, ids);
  await deps.taskRepo.deleteMany(tasks.map((t) => t.id));
  await deps.notifyTasksChanged();
  return { status: 204, body: null };
};

/** §6.3: o grupo existe num dia e num workspace, pela chave do domínio. */
function assertSameGroup(tasks: Task[]) {
  const [first] = tasks;
  const key = taskGroupKey(first);
  const day = localDateISO(first.startTime);
  const sameGroup = tasks.every(
    (t) =>
      t.workspaceId === first.workspaceId &&
      localDateISO(t.startTime) === day &&
      taskGroupKey(t) === key
  );
  if (!sameGroup) {
    throw new ConflictError(
      "As tarefas não formam um grupo: precisam ser do mesmo dia e workspace, com nome, projeto, categoria e campos personalizados iguais."
    );
  }
}

export const mergeHistoryTasks: LocalApiHandler = async (deps, params) => {
  const { ids } = params.body as { ids: string[] };
  if (new Set(ids).size < 2) throw new DomainError("Informe ao menos duas tarefas para unificar");
  const tasks = await loadAll(deps, ids);
  assertSameGroup(tasks);
  // Espelha a tela, que só unifica as entradas de hoje (`TodayEntriesSection`).
  // O use case serviria a qualquer dia; a restrição é só da interface.
  if (localDateISO(tasks[0].startTime) !== deps.todayISO()) {
    throw new ConflictError("Só é possível unificar as tarefas de hoje.");
  }
  const merged = await mergeTaskGroup(deps.taskRepo, tasks, deps.nowISO());
  await deps.notifyTasksChanged();
  return { status: 201, body: await taskDto(deps, merged) };
};

async function checkResolution(
  resolution: CatalogResolution | undefined,
  field: string,
  destination: () => Promise<{ id: string }[]>
): Promise<CatalogResolution> {
  switch (resolution?.kind) {
    case "unset":
      return { kind: "unset" };
    case "create": {
      const name = resolution.name?.trim();
      if (!name) throw new DomainError(`${field}.name é obrigatório com kind 'create'`);
      return { kind: "create", name };
    }
    case "match":
      if (!(await destination()).some((e) => e.id === resolution.targetId)) {
        throw new ConflictError(
          `${field}.targetId '${resolution.targetId}' não encontrado no workspace de destino`
        );
      }
      return resolution;
    default:
      throw new DomainError(`${field}.kind inválido: use 'match', 'create' ou 'unset'`);
  }
}

export const moveHistoryTasks: LocalApiHandler = async (deps, params) => {
  const body = params.body as MoveBody;
  if (body.mode !== "move" && body.mode !== "copy") {
    throw new DomainError("mode inválido: use 'move' ou 'copy'");
  }
  // `ids` vazio é erro de formato (400) e vence o destino inexistente (409).
  if (!body.ids?.length) throw new DomainError("Informe ao menos uma tarefa em ids");
  if (!(await deps.workspaceRepo.findById(body.toWorkspaceId))) {
    throw new ConflictError(`Workspace de destino '${body.toWorkspaceId}' não encontrado`);
  }
  const tasks = await loadAll(deps, body.ids);
  if (tasks.some((t) => t.workspaceId === body.toWorkspaceId)) {
    throw new DomainError("O workspace de destino é o mesmo de uma das tarefas");
  }
  const project = await checkResolution(body.project, "project", () =>
    deps.projectRepo.findAll(body.toWorkspaceId)
  );
  const category = await checkResolution(body.category, "category", () =>
    deps.categoryRepo.findAll(body.toWorkspaceId)
  );

  const count = await moveTasksToWorkspace(
    deps,
    tasks,
    { toWorkspaceId: body.toWorkspaceId, project, category, mode: body.mode },
    deps.nowISO()
  );
  await deps.notifyTasksChanged();
  // Criar no destino é mutação de catálogo (guardrails §9.2).
  if (project.kind === "create") await deps.notifyProjectsChanged();
  if (category.kind === "create") await deps.notifyCategoriesChanged();
  return { status: 200, body: { count } };
};
