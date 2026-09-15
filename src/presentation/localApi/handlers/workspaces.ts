import type { Workspace } from "@domain/entities/Workspace";
import type { WorkspaceDeletionTarget } from "@domain/usecases/workspaces/DeleteWorkspace";
import { getWorkspaces } from "@domain/usecases/workspaces/GetWorkspaces";
import { isWorkspaceColor, WORKSPACE_COLORS } from "@domain/utils/workspaceColor";
import { DomainError } from "@shared/errors";
import { ConflictError, NotFoundError } from "../errors";
import type { LocalApiDeps, LocalApiHandler } from "../types";

interface WorkspaceBody {
  name: string;
  color?: string | null;
}

interface DeleteBody {
  mode: string;
  toWorkspaceId?: string | null;
}

function workspaceDto(w: Workspace, activeWorkspaceId: string) {
  return {
    id: w.id,
    name: w.name,
    color: w.color,
    createdAt: w.createdAt,
    active: w.id === activeWorkspaceId,
  };
}

// A UI só oferece os slots da paleta; o domínio aceita qualquer string, e uma
// cor fora dela deixaria o workspace sem cor nenhuma na tela.
function color(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isWorkspaceColor(value)) {
    throw new DomainError(`Cor inválida: '${value}'. Use ${WORKSPACE_COLORS.join(", ")}`);
  }
  return value;
}

async function findOrThrow(deps: LocalApiDeps, id: string | undefined): Promise<Workspace> {
  const workspace = id ? await deps.workspaceRepo.findById(id) : null;
  if (!workspace) throw new NotFoundError(`Workspace '${id}' não encontrado`);
  return workspace;
}

function deletionTarget(body: DeleteBody | null): WorkspaceDeletionTarget {
  if (body?.mode === "delete") return { mode: "delete" };
  if (body?.mode !== "move") throw new DomainError("mode inválido: use 'move' ou 'delete'");
  if (!body.toWorkspaceId) throw new DomainError("toWorkspaceId é obrigatório no modo 'move'");
  return { mode: "move", toWorkspaceId: body.toWorkspaceId };
}

export const listWorkspaces: LocalApiHandler = async (deps) => ({
  status: 200,
  body: (await getWorkspaces(deps.workspaceRepo)).map((w) =>
    workspaceDto(w, deps.activeWorkspaceId)
  ),
});

export const createWorkspaceHandler: LocalApiHandler = async (deps, params) => {
  const body = params.body as WorkspaceBody;
  const created = await deps.workspaces.create(body.name, color(body.color));
  return { status: 201, body: workspaceDto(created, deps.activeWorkspaceId) };
};

export const updateWorkspaceHandler: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  const body = params.body as WorkspaceBody;
  // Ausente preserva: o `updateWorkspace` do domínio recalcularia a cor pelo nome.
  await deps.workspaces.update(existing.id, body.name, color(body.color) ?? existing.color);
  return {
    status: 200,
    body: workspaceDto(await findOrThrow(deps, existing.id), deps.activeWorkspaceId),
  };
};

/**
 * As três 409 são regra só da API (decisão do usuário, spec §6): a UI desabilita
 * o botão do último workspace e só oferece destinos que existem, e a exclusão
 * com tarefa ativa apagaria ou moveria a tarefa por baixo do timer.
 */
export const deleteWorkspaceHandler: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  const target = deletionTarget(params.body as DeleteBody | null);
  const all = await getWorkspaces(deps.workspaceRepo);
  if (all.length <= 1) throw new ConflictError("Não é possível excluir o último workspace.");
  if (
    target.mode === "move" &&
    target.toWorkspaceId !== existing.id &&
    !all.some((w) => w.id === target.toWorkspaceId)
  ) {
    throw new ConflictError(`Workspace de destino '${target.toWorkspaceId}' não encontrado`);
  }
  if (deps.running.runningTask?.workspaceId === existing.id) {
    throw new ConflictError(
      "Há uma tarefa ativa neste workspace. Pare ou cancele a tarefa antes de excluí-lo."
    );
  }
  await deps.workspaces.remove(existing.id, target);
  return { status: 204, body: null };
};

export const getActiveWorkspace: LocalApiHandler = async (deps) => ({
  status: 200,
  body: workspaceDto(await findOrThrow(deps, deps.activeWorkspaceId), deps.activeWorkspaceId),
});

/** A guarda é a mesma da UI (`useWorkspaceSwitchGuard`), mas a API não para a tarefa sozinha. */
export const setActiveWorkspace: LocalApiHandler = async (deps, params) => {
  const id = (params.body as { id?: string | null } | null)?.id;
  if (!id) throw new DomainError("Informe o id do workspace");
  const target = await deps.workspaceRepo.findById(id);
  if (!target) throw new ConflictError(`Workspace '${id}' não encontrado`);
  if (id !== deps.activeWorkspaceId) {
    if (deps.running.runningTask) {
      throw new ConflictError(
        "Há uma tarefa ativa. Pare ou cancele a tarefa antes de trocar de workspace."
      );
    }
    await deps.workspaces.switchTo(id);
  }
  return { status: 200, body: workspaceDto(target, id) };
};
