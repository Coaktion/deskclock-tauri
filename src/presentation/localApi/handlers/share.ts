import { activeCustomFields } from "@domain/usecases/customFields/GetCustomFields";
import { planSharedTask } from "@domain/usecases/plannedTasks/planSharedTask";
import { resolveSharedPayload, type ResolvedSharedTask } from "@domain/utils/resolveSharedPayload";
import { plannedTaskShareLink, sharedTaskStartWarning } from "@domain/utils/sharePayload";
import { DomainError } from "@shared/errors";
import { readDeepLinkInput } from "@shared/utils/deepLinkInput";
import { parseShareLink, SHARE_LINK_PATH, SHARE_LINK_SCHEME } from "@shared/utils/shareLink";
import { ConflictError, NotFoundError } from "../errors";
import { plannedTaskDto, taskDto } from "../dto";
import { assertDate } from "../period";
import { resolveRequestWorkspace } from "../resolve";
import type { LocalApiDeps, LocalApiHandler } from "../types";

/**
 * Compartilhar tarefa por link (Fase D3a da paridade): gerar o
 * `deskclock://task/share` de uma planejada, como o "Copiar link"; e, do lado de
 * quem recebe, a prévia e a ação do modal "Tarefa recebida por link". O
 * contrato — e o que **não** viaja — é o de `shareLink.ts`
 * (`docs-internal/specs/compartilhar-tarefa.md`).
 */

const SHARE_PREFIX = `${SHARE_LINK_SCHEME}://${SHARE_LINK_PATH}`;

// Como o `tasks.start`: o envio automático da tarefa encerrada depende de rede e
// passaria do prazo de 10 s da ponte, então segue em segundo plano.
const STOP_OPTIONS = { syncInBackground: true } as const;

interface ShareLinkBody {
  plannedTaskId?: string | null;
}

/** O "Copiar link" da linha da planejada, sem a área de transferência. */
export const shareLinkHandler: LocalApiHandler = async (deps, params) => {
  const body = (params.body ?? {}) as ShareLinkBody;
  if (typeof body.plannedTaskId !== "string" || !body.plannedTaskId) {
    throw new DomainError("plannedTaskId é obrigatório.");
  }
  const task = await deps.plannedTaskRepo.findById(body.plannedTaskId);
  if (!task) throw new NotFoundError(`Planejada '${body.plannedTaskId}' não encontrada`);
  const [projects, categories, customFields] = await Promise.all([
    deps.projectRepo.findAll(task.workspaceId),
    deps.categoryRepo.findAll(task.workspaceId),
    // O catálogo inteiro, arquivados inclusive, como a linha da planejada.
    deps.customFieldRepo.findAll(),
  ]);
  const link = plannedTaskShareLink(task, projects, categories, customFields);
  // O payload é o que o outro lado lê do link, e não o que a planejada tem:
  // aparado, sem vazio e sem horário fora de HH:MM — exatamente o que viaja.
  return { status: 200, body: { link, payload: parseShareLink(link) } };
};

/**
 * Lê o link como o campo "Receber link" valida: as mesmas mensagens para as
 * mesmas formas. A API só lê o `task/share`; os outros deeplinks só mexem na
 * tela (navegar, abrir o Lançamento retroativo) ou têm op própria.
 */
function readSharedLink(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) throw new DomainError("link é obrigatório.");
  const input = readDeepLinkInput(raw);
  if (input.error) throw new DomainError(input.error);
  // Só o `task/share` com nome volta com `sharedName`; sem nome, já é erro acima.
  if (input.sharedName === null) {
    throw new DomainError(
      `A API só lê links de tarefa compartilhada (${SHARE_PREFIX}). Os demais deeplinks do app só navegam na tela; para iniciar ou lançar tarefa, use as rotas de tarefa.`
    );
  }
  const payload = parseShareLink(input.url);
  if (!payload) throw new DomainError("Este link de tarefa não traz o nome da tarefa.");
  return payload;
}

interface ShareBody {
  link?: unknown;
  workspaceId?: string | null;
}

/** O modal resolve contra os catálogos do workspace, com os campos ativos. */
async function resolveShare(deps: LocalApiDeps, body: ShareBody) {
  const payload = readSharedLink(body.link);
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const [projects, categories, fields] = await Promise.all([
    deps.projectRepo.findAll(workspaceId),
    deps.categoryRepo.findAll(workspaceId),
    deps.customFieldRepo.findAll(),
  ]);
  const resolved = resolveSharedPayload(payload, projects, categories, activeCustomFields(fields));
  const names = {
    projectName: projects.find((p) => p.id === resolved.projectId)?.name ?? null,
    categoryName: categories.find((c) => c.id === resolved.categoryId)?.name ?? null,
  };
  return { payload, workspaceId, resolved, names };
}

/** O que o modal mostra antes de qualquer gravação. */
export const previewShareHandler: LocalApiHandler = async (deps, params) => {
  const body = (params.body ?? {}) as ShareBody;
  const { payload, workspaceId, resolved, names } = await resolveShare(deps, body);
  const active = deps.running.runningTask;
  const { unresolved, ...task } = resolved;
  return {
    status: 200,
    body: {
      payload,
      workspaceId,
      task: { ...task, ...names },
      unresolved,
      // A data não viaja no link: o modal nasce em hoje.
      date: deps.todayISO(),
      activeTask: active ? { id: active.id, name: active.name, status: active.status } : null,
      startWarning: active ? sharedTaskStartWarning(active) : null,
    },
  };
};

interface ApplyBody extends ShareBody {
  mode?: unknown;
  date?: string | null;
}

function formValues(resolved: ResolvedSharedTask) {
  return {
    name: resolved.name,
    projectId: resolved.projectId,
    categoryId: resolved.categoryId,
    billable: resolved.billable,
    customValues: resolved.customValues,
  };
}

/**
 * As duas ações do modal, com o que o link resolveu: "Adicionar como planejada"
 * (`plan`, na `date`, padrão hoje) e "Iniciar agora" (`start`, que encerra a
 * ativa pelas regras de parada, como o modal avisa). Editar antes de gravar é
 * com as rotas de edição, depois.
 */
export const applyShareHandler: LocalApiHandler = async (deps, params) => {
  const body = (params.body ?? {}) as ApplyBody;
  if (body.mode !== "plan" && body.mode !== "start") {
    throw new DomainError(
      "mode deve ser 'plan' (adicionar como planejada) ou 'start' (iniciar agora)."
    );
  }
  if (body.mode === "start" && body.date != null) {
    throw new DomainError(
      "date só vale em mode 'plan': iniciar agora começa no instante da chamada."
    );
  }
  const date = body.date ?? deps.todayISO();
  if (body.mode === "plan") assertDate(date, "date");
  const { workspaceId, resolved } = await resolveShare(deps, body);

  if (body.mode === "plan") {
    const planned = await planSharedTask(
      deps.plannedTaskRepo,
      {
        workspaceId,
        ...formValues(resolved),
        date,
        startTime: resolved.startTime,
        endTime: resolved.endTime,
      },
      deps.nowISO()
    );
    await deps.notifyPlannedTasksChanged();
    return {
      status: 201,
      body: {
        mode: "plan",
        plannedTask: await plannedTaskDto(deps, planned),
        unresolved: resolved.unresolved,
      },
    };
  }

  // `switchToTask` sem tarefa ativa só inicia; com ela, é o `switchToTask` do modal.
  const task = await deps.running.switchToTask(
    { workspaceId, ...formValues(resolved) },
    STOP_OPTIONS
  );
  if (!task) throw new ConflictError("Outra tarefa está sendo iniciada — tente novamente");
  return {
    status: 201,
    body: { mode: "start", task: await taskDto(deps, task), unresolved: resolved.unresolved },
  };
};
