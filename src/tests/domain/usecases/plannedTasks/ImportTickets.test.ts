import { describe, it, expect, vi } from "vitest";
import { importTickets, type ImportTicketInput } from "@domain/usecases/plannedTasks/ImportTickets";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";

function makeRepo() {
  const saved: PlannedTask[] = [];
  const repo = {
    save: vi.fn(async (task: PlannedTask) => {
      saved.push(task);
    }),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findForDate: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    uncomplete: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  } as unknown as IPlannedTaskRepository;
  return { repo, saved };
}

function makeInput(overrides: Partial<ImportTicketInput> = {}): ImportTicketInput {
  return {
    ticket: {
      id: 42,
      subject: "Erro no login",
      status: "open",
      webUrl: "https://coaktion.zendesk.com/agent/tickets/42",
    },
    name: "Erro no login",
    projectId: null,
    categoryId: null,
    addOpenUrlAction: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-08-13",
    ...overrides,
  };
}

const NOW = "2026-08-13T12:00:00.000Z";

describe("importTickets", () => {
  it("a ação do ticket nasce nomeada pelo destino", async () => {
    // O nome da planejada já é o assunto do ticket: nomear a ação com o mesmo
    // texto faria o chip ecoar o nome que o card mostra logo abaixo dele.
    const { repo, saved } = makeRepo();
    await importTickets(repo, [makeInput()], NOW, "ws-1");

    expect(saved[0].actions).toEqual([
      {
        type: "open_url",
        value: "https://coaktion.zendesk.com/agent/tickets/42",
        label: "Zendesk",
      },
    ]);
  });

  it("sem a ação pedida, a planejada nasce sem ação nenhuma", async () => {
    const { repo, saved } = makeRepo();
    await importTickets(repo, [makeInput({ addOpenUrlAction: false })], NOW, "ws-1");
    expect(saved[0].actions).toEqual([]);
  });

  it("ticket sem URL não cria ação que não abre nada", async () => {
    // A guarda que o literal escrito à mão não tinha: com `webUrl` em branco,
    // a planejada nascia com uma ação de valor vazio.
    const { repo, saved } = makeRepo();
    const input = makeInput();
    await importTickets(repo, [{ ...input, ticket: { ...input.ticket, webUrl: "" } }], NOW, "ws-1");
    expect(saved[0].actions).toEqual([]);
  });

  it("não salva nada com lista vazia", async () => {
    const { repo } = makeRepo();
    expect(await importTickets(repo, [], NOW, "ws-1")).toBe(0);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
