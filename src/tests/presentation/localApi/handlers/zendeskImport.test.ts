import { describe, it, expect, vi } from "vitest";
import type { ZendeskTicket } from "@domain/integrations/ITicketImporter";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps, TODAY } from "../fakeDeps";

const TICKETS: ZendeskTicket[] = [
  { id: 10, subject: "Erro no login", status: "open", webUrl: "https://x.zendesk.com/t/10" },
  { id: 11, subject: "Fatura", status: "new", webUrl: "https://x.zendesk.com/t/11" },
];

function setup(notConfiguredMessage: string | null = null) {
  const deps = makeDeps();
  deps.imports.zendesk.mockReturnValue({
    notConfiguredMessage,
    importer: { getTickets: vi.fn(async () => TICKETS) },
    workspaceId: "ws-z",
  });
  return deps;
}

function saved(deps: ReturnType<typeof makeDeps>): PlannedTask[] {
  return deps.plannedTaskRepo.save.mock.calls.map(([t]) => t);
}

describe("zendesk.importPreview", () => {
  it("lista os tickets com a linha como a tela abre", async () => {
    const deps = setup();
    const res = await dispatchLocalApiRequest(deps, "zendesk.importPreview", {});
    expect(res.status).toBe(200);
    expect((res.body as { tickets: unknown[] }).tickets[0]).toEqual({
      id: 10,
      subject: "Erro no login",
      status: "open",
      webUrl: "https://x.zendesk.com/t/10",
      name: "#10 - Erro no login",
      scheduleType: "recurring",
      scheduleDate: TODAY,
      addOpenUrlAction: true,
    });
  });

  it("não conectado é 409", async () => {
    const deps = setup("Zendesk não conectado.");
    expect((await dispatchLocalApiRequest(deps, "zendesk.importPreview", {})).status).toBe(409);
  });
});

describe("zendesk.import", () => {
  it("grava no workspace da integração com o padrão e o que a linha mudou", async () => {
    const deps = setup();
    deps.projectRepo.findAll.mockResolvedValue([
      { id: "p-z", workspaceId: "ws-z", name: "Suporte", colorIndex: 0 },
    ]);
    const res = await dispatchLocalApiRequest(deps, "zendesk.import", {
      body: {
        tickets: [
          { id: 10 },
          {
            id: 11,
            name: "  ",
            projectId: "p-z",
            scheduleType: "specific_date",
            scheduleDate: "2026-09-20",
            addOpenUrlAction: false,
          },
        ],
      },
    });
    expect(res).toEqual({
      status: 200,
      body: { workspaceId: "ws-z", imported: 2, ticketIds: [10, 11] },
    });
    const [a, b] = saved(deps);
    expect(a).toMatchObject({
      workspaceId: "ws-z",
      name: "#10 - Erro no login",
      scheduleType: "recurring",
      recurringDays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(a.actions).toHaveLength(1);
    expect(b).toMatchObject({
      name: "#11 - Fatura",
      projectId: "p-z",
      scheduleType: "specific_date",
      scheduleDate: "2026-09-20",
      actions: [],
    });
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
  });

  it("id de texto 400; ticket fora da lista 404; data ruim 400", async () => {
    const deps = setup();
    const call = (body: unknown) => dispatchLocalApiRequest(deps, "zendesk.import", { body });
    expect((await call({ tickets: [{ id: "10" }] })).status).toBe(400);
    expect((await call({ tickets: [{ id: 99 }] })).status).toBe(404);
    expect((await call({ tickets: [{ id: 10, scheduleDate: "20/09" }] })).status).toBe(400);
    expect(deps.plannedTaskRepo.save).not.toHaveBeenCalled();
  });
});
