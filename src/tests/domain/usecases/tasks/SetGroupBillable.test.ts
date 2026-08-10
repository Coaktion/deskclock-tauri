import { describe, it, expect, vi } from "vitest";
import { setGroupBillable } from "@domain/usecases/tasks/SetGroupBillable";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";

const NOW = "2026-04-08T11:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Task A",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: "2026-04-08T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

/**
 * O use case lê pelo `findByDateRange` e escreve pelo `updateTask`, que busca
 * cada alvo pelo id — então o repositório falso guarda o dia inteiro e responde
 * às duas consultas a partir dele.
 */
function makeRepo(dayTasks: Task[]): ITaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async (id: string) => dayTasks.find((t) => t.id === id) ?? null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => dayTasks),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
  };
}

function updatedIds(repo: ITaskRepository): string[] {
  return (repo.update as ReturnType<typeof vi.fn>).mock.calls.map((call) => (call[0] as Task).id);
}

describe("setGroupBillable", () => {
  it("alterna o faturamento em todas as irmãs do grupo", async () => {
    const day = [
      makeTask({ id: "t1", billable: true }),
      makeTask({ id: "t2", billable: true }),
      makeTask({ id: "t3", billable: true }),
    ];
    const repo = makeRepo(day);

    const changed = await setGroupBillable(repo, day[0], false, NOW);

    expect(updatedIds(repo).sort()).toEqual(["t1", "t2", "t3"]);
    expect(changed.every((t) => t.billable === false)).toBe(true);
  });

  it("não toca em tarefa de outro grupo", async () => {
    // `billable` não compõe a chave (§6.3), mas nome, projeto, categoria e
    // valores personalizados compõem — e cada um deles tira a tarefa do grupo.
    const alvo = makeTask({ id: "t1", billable: true });
    const repo = makeRepo([
      alvo,
      makeTask({ id: "outro-nome", name: "Task B" }),
      makeTask({ id: "outro-projeto", projectId: "p2" }),
      makeTask({ id: "outra-categoria", categoryId: "c2" }),
      makeTask({ id: "outro-custom", customValues: { "f-stage": "o1" } }),
      makeTask({ id: "t2" }),
    ]);

    await setGroupBillable(repo, alvo, false, NOW);

    expect(updatedIds(repo).sort()).toEqual(["t1", "t2"]);
  });

  it("não escreve na irmã que já está no valor pedido", async () => {
    // É o que deixa a regra barata de chamar depois de qualquer edição: grupo
    // uniforme não vira escrita, e o `updatedAt` das irmãs fica onde estava.
    const day = [
      makeTask({ id: "t1", billable: true }),
      makeTask({ id: "t2", billable: false }),
    ];
    const repo = makeRepo(day);

    const changed = await setGroupBillable(repo, day[0], false, NOW);

    expect(updatedIds(repo)).toEqual(["t1"]);
    expect(changed).toHaveLength(1);
  });

  it("grupo já uniforme no valor pedido não gera escrita nenhuma", async () => {
    const day = [makeTask({ id: "t1", billable: false }), makeTask({ id: "t2", billable: false })];
    const repo = makeRepo(day);

    const changed = await setGroupBillable(repo, day[0], false, NOW);

    expect(repo.update).not.toHaveBeenCalled();
    expect(changed).toEqual([]);
  });

  it("ignora execução em curso com os mesmos dados — ela não está no grupo", async () => {
    // A lista agrupa só tarefas concluídas: a em execução não aparece no grupo,
    // e não pode ser arrastada por um clique que fala dele.
    const alvo = makeTask({ id: "t1", billable: true });
    const repo = makeRepo([
      alvo,
      makeTask({ id: "em-curso", status: "running", endTime: null, billable: true }),
      makeTask({ id: "pausada", status: "paused", endTime: null, billable: true }),
    ]);

    await setGroupBillable(repo, alvo, false, NOW);

    expect(updatedIds(repo)).toEqual(["t1"]);
  });

  it("procura as irmãs no dia e no workspace da tarefa", async () => {
    // O grupo só existe nesse recorte — `groupTasks` sempre recebe a lista de um
    // dia de um workspace. Sem o corte, o clique alcançaria outros dias.
    const alvo = makeTask({ startTime: "2026-04-08T09:00:00.000Z", workspaceId: "ws-2" });
    const repo = makeRepo([alvo]);

    await setGroupBillable(repo, alvo, false, NOW);

    const [startISO, endISO, workspaceId] = (repo.findByDateRange as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(workspaceId).toBe("ws-2");
    expect(new Date(startISO).getTime()).toBeLessThanOrEqual(new Date(alvo.startTime).getTime());
    expect(new Date(endISO).getTime()).toBeGreaterThan(new Date(alvo.startTime).getTime());
  });

  it("alterna o alvo mesmo quando a consulta não o devolve", async () => {
    // Depender da busca faria a alternância virar um no-op silencioso — o pior
    // dos defeitos possíveis aqui, porque a tela recarrega e nada mudou.
    const alvo = makeTask({ id: "t1", billable: true });
    const repo = makeRepo([]);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(alvo);

    const changed = await setGroupBillable(repo, alvo, false, NOW);

    expect(updatedIds(repo)).toEqual(["t1"]);
    expect(changed[0].billable).toBe(false);
  });
});
