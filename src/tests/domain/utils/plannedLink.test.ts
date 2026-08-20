import { describe, it, expect } from "vitest";
import { resolveActivePlannedLink, runningPlannedTaskId } from "@domain/utils/plannedLink";
import type { Task } from "@domain/entities/Task";

const TASK: Task = {
  id: "t1",
  workspaceId: "ws-1",
  name: "Daily",
  projectId: null,
  categoryId: null,
  billable: true,
  startTime: "2026-04-08T09:00:00.000Z",
  endTime: null,
  durationSeconds: null,
  status: "running",
  createdAt: "2026-04-08T09:00:00.000Z",
  updatedAt: "2026-04-08T09:00:00.000Z",
  customValues: {},
};

describe("resolveActivePlannedLink", () => {
  it("evento sem o campo preserva o vínculo atual", () => {
    // Pausar, retomar ou atualizar não muda a origem da tarefa, e por isso omite
    // o campo. Zerar aqui apagava o vínculo no meio da execução.
    expect(resolveActivePlannedLink("pt-1", TASK, undefined)).toBe("pt-1");
  });

  it("evento com o campo troca o vínculo", () => {
    expect(resolveActivePlannedLink("pt-1", TASK, "pt-2")).toBe("pt-2");
  });

  it("evento que declara origem nenhuma zera o vínculo", () => {
    // Iniciar uma tarefa solta é diferente de omitir o campo: aqui o evento
    // afirma que não há planejada de origem.
    expect(resolveActivePlannedLink("pt-1", TASK, null)).toBeNull();
  });

  it("sem tarefa não há origem, ainda que o vínculo anterior exista", () => {
    expect(resolveActivePlannedLink("pt-1", null, undefined)).toBeNull();
  });
});

describe("runningPlannedTaskId", () => {
  it("o vínculo vivo tem precedência sobre o gravado na tarefa", () => {
    expect(runningPlannedTaskId("pt-1", { ...TASK, plannedTaskId: "pt-velho" })).toBe("pt-1");
  });

  it("sem vínculo vivo, vale o gravado na tarefa", () => {
    // É o caso da janela que só recebeu o `RUNNING_TASK_CHANGED` de outra: o
    // campo do evento é opcional, e a tarefa carrega a origem consigo.
    expect(runningPlannedTaskId(null, { ...TASK, plannedTaskId: "pt-2" })).toBe("pt-2");
  });

  it("execução que não nasceu de planejada não tem origem", () => {
    expect(runningPlannedTaskId(null, TASK)).toBeNull();
  });

  it("sem tarefa não há origem", () => {
    expect(runningPlannedTaskId("pt-1", null)).toBeNull();
  });
});
