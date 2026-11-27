import { describe, it, expect } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import type { Task } from "@domain/entities/Task";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, makePlanned, makeTask, NOW } from "../fakeDeps";

const FIELDS: CustomField[] = [
  {
    id: "f-sel",
    label: "Fase",
    type: "select",
    options: [
      { id: "o-1", label: "Análise" },
      { id: "o-2", label: "Entrega" },
    ],
    sortOrder: 0,
    archived: false,
    createdAt: NOW,
  },
  {
    id: "f-chk",
    label: "Urgente",
    type: "checkbox",
    options: [],
    sortOrder: 1,
    archived: false,
    createdAt: NOW,
  },
  {
    id: "f-txt",
    label: "Nota",
    type: "text",
    options: [],
    sortOrder: 2,
    archived: true,
    createdAt: NOW,
  },
];

function deps(running?: Parameters<typeof makeDeps>[0]) {
  const d = makeDeps(running);
  d.customFieldRepo.findAll.mockResolvedValue(FIELDS);
  return d;
}

const concluida = makeTask({
  id: "t-1",
  status: "completed",
  startTime: localISO(2026, 9, 15, 8),
  endTime: localISO(2026, 9, 15, 9),
  durationSeconds: 3600,
});

const HISTORY_BODY = {
  billable: true,
  startTime: localISO(2026, 9, 14, 9),
  endTime: localISO(2026, 9, 14, 10),
};
const PLANNED_BODY = {
  name: "Daily",
  billable: false,
  scheduleType: "recurring",
  recurringDays: [1],
};

describe("history.create — customValues", () => {
  it("normaliza rótulo do select, checkbox 'Sim' e aceita campo arquivado", async () => {
    const d = deps();
    const result = await dispatchLocalApiRequest(d, "history.create", {
      body: {
        ...HISTORY_BODY,
        customValues: { "f-sel": " entrega ", "f-chk": "Sim", "f-txt": " a  b " },
      },
    });
    expect(result.status).toBe(201);
    expect((d.taskRepo.save.mock.calls[0][0] as Task).customValues).toEqual({
      "f-sel": "o-2",
      "f-chk": "1",
      "f-txt": "a b",
    });
  });

  it("aceita o id da opção e omite checkbox desmarcado", async () => {
    const d = deps();
    await dispatchLocalApiRequest(d, "history.create", {
      body: { ...HISTORY_BODY, customValues: { "f-sel": "o-1", "f-chk": "false" } },
    });
    expect((d.taskRepo.save.mock.calls[0][0] as Task).customValues).toEqual({ "f-sel": "o-1" });
  });

  it("devolve 400 para id de campo desconhecido e não grava", async () => {
    const d = deps();
    const result = await dispatchLocalApiRequest(d, "history.create", {
      body: { ...HISTORY_BODY, customValues: { "f-x": "a" } },
    });
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).toContain("f-x");
    expect(d.taskRepo.save).not.toHaveBeenCalled();
  });

  it("devolve 400 citando campo e opções para select inválido", async () => {
    const d = deps();
    const result = await dispatchLocalApiRequest(d, "history.create", {
      body: { ...HISTORY_BODY, customValues: { "f-sel": "Outra" } },
    });
    expect(result.status).toBe(400);
    const msg = JSON.stringify(result.body);
    expect(msg).toContain("Fase");
    expect(msg).toContain("Análise");
    expect(msg).toContain("Entrega");
    expect(d.taskRepo.save).not.toHaveBeenCalled();
  });
});

describe("history.update — customValues", () => {
  it("normaliza o valor gravado", async () => {
    const d = deps();
    d.taskRepo.findById.mockResolvedValue(concluida);
    const result = await dispatchLocalApiRequest(d, "history.update", {
      id: "t-1",
      body: { customValues: { "f-sel": "Análise" } },
    });
    expect(result.status).toBe(200);
    expect((d.taskRepo.update.mock.calls[0][0] as Task).customValues).toEqual({ "f-sel": "o-1" });
  });

  it("null limpa para {}", async () => {
    const d = deps();
    d.taskRepo.findById.mockResolvedValue({ ...concluida, customValues: { "f-sel": "o-1" } });
    await dispatchLocalApiRequest(d, "history.update", { id: "t-1", body: { customValues: null } });
    expect((d.taskRepo.update.mock.calls[0][0] as Task).customValues).toEqual({});
  });

  it("devolve 400 para campo desconhecido e não grava", async () => {
    const d = deps();
    d.taskRepo.findById.mockResolvedValue(concluida);
    const result = await dispatchLocalApiRequest(d, "history.update", {
      id: "t-1",
      body: { customValues: { "f-x": "a" } },
    });
    expect(result.status).toBe(400);
    expect(d.taskRepo.update).not.toHaveBeenCalled();
  });
});

describe("tasks.updateActive — customValues", () => {
  it("normaliza o valor repassado ao contexto", async () => {
    const d = deps({ running: { runningTask: makeTask() } });
    d.taskRepo.findById.mockResolvedValue(makeTask());
    await dispatchLocalApiRequest(d, "tasks.updateActive", {
      body: { customValues: { "f-chk": "TRUE" } },
    });
    expect(d.running.updateActiveTask).toHaveBeenCalledWith({ customValues: { "f-chk": "1" } });
  });

  it("devolve 400 para campo desconhecido", async () => {
    const d = deps({ running: { runningTask: makeTask() } });
    const result = await dispatchLocalApiRequest(d, "tasks.updateActive", {
      body: { customValues: { "f-x": "a" } },
    });
    expect(result.status).toBe(400);
    expect(d.running.updateActiveTask).not.toHaveBeenCalled();
  });
});

describe("tasks.start — customValues", () => {
  it("normaliza antes de iniciar", async () => {
    let recebido: unknown;
    const d = deps({
      running: {
        switchToTask: async (input) => {
          recebido = input;
          return makeTask();
        },
      },
    });
    await dispatchLocalApiRequest(d, "tasks.start", {
      body: { customValues: { "f-sel": "entrega" } },
    });
    expect(recebido).toMatchObject({ customValues: { "f-sel": "o-2" } });
  });

  it("devolve 400 para select inválido e não inicia", async () => {
    const d = deps();
    const result = await dispatchLocalApiRequest(d, "tasks.start", {
      body: { customValues: { "f-sel": "nada" } },
    });
    expect(result.status).toBe(400);
    expect(d.running.switchToTask).not.toHaveBeenCalled();
  });
});

describe("plannedTasks create/update — customValues", () => {
  it("create normaliza rótulo e checkbox", async () => {
    const d = deps();
    const result = await dispatchLocalApiRequest(d, "plannedTasks.create", {
      body: { ...PLANNED_BODY, customValues: { "f-sel": "ENTREGA", "f-chk": "1" } },
    });
    expect(result.status).toBe(201);
    expect((d.plannedTaskRepo.save.mock.calls[0][0] as PlannedTask).customValues).toEqual({
      "f-sel": "o-2",
      "f-chk": "1",
    });
  });

  it("create devolve 400 para campo desconhecido e não grava", async () => {
    const d = deps();
    const result = await dispatchLocalApiRequest(d, "plannedTasks.create", {
      body: { ...PLANNED_BODY, customValues: { "f-x": "a" } },
    });
    expect(result.status).toBe(400);
    expect(d.plannedTaskRepo.save).not.toHaveBeenCalled();
  });

  it("update normaliza o que veio, preserva o ausente e limpa com null", async () => {
    const existing = makePlanned({ customValues: { "f-sel": "o-1" } });
    const d = deps();
    d.plannedTaskRepo.findById.mockResolvedValue(existing);

    await dispatchLocalApiRequest(d, "plannedTasks.update", {
      id: "p-1",
      body: { ...PLANNED_BODY, customValues: { "f-sel": "entrega" } },
    });
    await dispatchLocalApiRequest(d, "plannedTasks.update", { id: "p-1", body: PLANNED_BODY });
    await dispatchLocalApiRequest(d, "plannedTasks.update", {
      id: "p-1",
      body: { ...PLANNED_BODY, customValues: null },
    });

    const [a, b, c] = d.plannedTaskRepo.update.mock.calls.map((x) => x[0] as PlannedTask);
    expect(a.customValues).toEqual({ "f-sel": "o-2" });
    expect(b.customValues).toEqual({ "f-sel": "o-1" });
    expect(c.customValues).toEqual({});
  });

  it("update devolve 400 para select inválido e não grava", async () => {
    const d = deps();
    d.plannedTaskRepo.findById.mockResolvedValue(makePlanned());
    const result = await dispatchLocalApiRequest(d, "plannedTasks.update", {
      id: "p-1",
      body: { ...PLANNED_BODY, customValues: { "f-sel": "nada" } },
    });
    expect(result.status).toBe(400);
    expect(d.plannedTaskRepo.update).not.toHaveBeenCalled();
  });
});
