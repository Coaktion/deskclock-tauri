import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { Task } from "@domain/entities/Task";
import type { CatalogResolution } from "@domain/usecases/workspaces/reconcileCatalog";
import { createProject } from "@domain/usecases/projects/CreateProject";
import { createCategory } from "@domain/usecases/categories/CreateCategory";
import { generateUUID } from "@shared/utils/uuid";
import type { UUID } from "@shared/types";

export interface MoveTasksDeps {
  taskRepo: ITaskRepository;
  projectRepo: IProjectRepository;
  categoryRepo: ICategoryRepository;
}

export interface MoveTasksPlan {
  toWorkspaceId: UUID;
  /** O que fazer com o projeto das tarefas no destino. */
  project: CatalogResolution;
  /** O que fazer com a categoria das tarefas no destino. */
  category: CatalogResolution;
  /** `move` reatribui as tarefas; `copy` deixa as originais intactas. */
  mode: "move" | "copy";
}

/**
 * Resolve uma decisão de reconciliação num id do workspace de destino.
 *
 * O `create` tolera corrida com um homônimo já existente: se a criação falhar
 * por unicidade, relê pelo nome em vez de abortar a operação inteira.
 */
async function resolve(
  resolution: CatalogResolution,
  workspaceId: UUID,
  find: (name: string, workspaceId: UUID) => Promise<{ id: UUID } | null>,
  create: (name: string, workspaceId: UUID) => Promise<{ id: UUID }>
): Promise<UUID | null> {
  if (resolution.kind === "unset") return null;
  if (resolution.kind === "match") return resolution.targetId;
  try {
    return (await create(resolution.name, workspaceId)).id;
  } catch {
    return (await find(resolution.name, workspaceId))?.id ?? null;
  }
}

/**
 * Move ou copia tarefas para outro workspace, aplicando a reconciliação de
 * projeto e categoria.
 *
 * Projeto e categoria são escopados por workspace, então os ids da origem não
 * valem no destino — daí a reconciliação. Custom fields, quando existirem,
 * passarão intactos: são globais justamente para que mover não exija reconciliar
 * também campo e opção de select.
 */
export async function moveTasksToWorkspace(
  deps: MoveTasksDeps,
  tasks: Task[],
  plan: MoveTasksPlan,
  nowISO: string
): Promise<number> {
  if (tasks.length === 0) return 0;

  const projectId = await resolve(
    plan.project,
    plan.toWorkspaceId,
    (name, ws) => deps.projectRepo.findByName(name, ws),
    (name, ws) => createProject(deps.projectRepo, name, ws)
  );
  const categoryId = await resolve(
    plan.category,
    plan.toWorkspaceId,
    (name, ws) => deps.categoryRepo.findByName(name, ws),
    (name, ws) => createCategory(deps.categoryRepo, name, true, ws)
  );

  for (const task of tasks) {
    // `plannedTaskId` atravessa a mudança de workspace, de propósito: ele registra
    // de onde a execução partiu, e isso não deixa de ser verdade porque a tarefa
    // mudou de lugar. Fica um id de planejada de outro workspace, e ele é inerte —
    // quem lê o vínculo (conclusão da planejada ao parar, reconhecimento de
    // reunião) só olha tarefa em execução, e aqui se move o que já foi concluído.
    // Zerá-lo no modo `move` exigiria escrever a coluna no UPDATE, que é justamente
    // o que mantém a origem imutável para todos os outros callers.
    const moved: Task = {
      ...task,
      workspaceId: plan.toWorkspaceId,
      projectId,
      categoryId,
      updatedAt: nowISO,
    };
    if (plan.mode === "copy") {
      await deps.taskRepo.save({ ...moved, id: generateUUID(), createdAt: nowISO });
    } else {
      await deps.taskRepo.update(moved);
    }
  }

  return tasks.length;
}
