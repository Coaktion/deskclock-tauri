import { describe, it, expect } from "vitest";
import {
  groupTasksForMonday,
  mondayGroupInterval,
} from "@domain/usecases/monday/groupTasksForMonday";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Tarefa",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    startTime: "2026-07-30T12:00:00.000Z",
    endTime: "2026-07-30T13:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T13:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

describe("groupTasksForMonday", () => {
  it("soma as durações do mesmo grupo no mesmo dia", () => {
    const groups = groupTasksForMonday([
      makeTask({ id: "a", durationSeconds: 3600 }),
      makeTask({ id: "b", durationSeconds: 1800 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].totalSeconds).toBe(5400);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("separa dias locais distintos", () => {
    const groups = groupTasksForMonday([
      makeTask({ id: "a", startTime: "2026-07-30T12:00:00.000Z" }),
      makeTask({ id: "b", startTime: "2026-07-31T12:00:00.000Z" }),
    ]);

    expect(groups.map((g) => g.dayISO).sort()).toEqual(["2026-07-30", "2026-07-31"]);
  });

  it("separa nomes, projetos e categorias distintos", () => {
    const groups = groupTasksForMonday([
      makeTask({ id: "a" }),
      makeTask({ id: "b", workspaceId: "ws-1", name: "Outra" }),
      makeTask({ id: "c", workspaceId: "ws-1", projectId: "proj-2" }),
      makeTask({ id: "d", workspaceId: "ws-1", categoryId: "cat-2" }),
    ]);

    expect(groups).toHaveLength(4);
  });

  it("separa billable de non-billable — Billing type é uma coluna só por item", () => {
    const groups = groupTasksForMonday([
      makeTask({ id: "a", workspaceId: "ws-1", billable: true, durationSeconds: 3600 }),
      makeTask({ id: "b", workspaceId: "ws-1", billable: false, durationSeconds: 1800 }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.billable)?.totalSeconds).toBe(3600);
    expect(groups.find((g) => !g.billable)?.totalSeconds).toBe(1800);
  });

  it("ordena as tarefas por startTime, independente da ordem de entrada", () => {
    const early = makeTask({ id: "cedo", startTime: "2026-07-30T09:00:00.000Z" });
    const late = makeTask({ id: "tarde", startTime: "2026-07-30T17:00:00.000Z" });

    expect(groupTasksForMonday([late, early])[0].tasks.map((t) => t.id)).toEqual(["cedo", "tarde"]);
    expect(groupTasksForMonday([early, late])[0].tasks.map((t) => t.id)).toEqual(["cedo", "tarde"]);
  });

  it("trata duração ausente como zero", () => {
    const groups = groupTasksForMonday([makeTask({ durationSeconds: null })]);
    expect(groups[0].totalSeconds).toBe(0);
  });

  it("retorna vazio sem tarefas", () => {
    expect(groupTasksForMonday([])).toEqual([]);
  });
});

describe("mondayGroupInterval", () => {
  it("vai do início da primeira tarefa ao fim da última", () => {
    const [group] = groupTasksForMonday([
      makeTask({
        id: "a",
        startTime: "2026-07-30T09:00:00.000Z",
        endTime: "2026-07-30T10:00:00.000Z",
      }),
      makeTask({
        id: "b",
        startTime: "2026-07-30T14:00:00.000Z",
        endTime: "2026-07-30T17:30:00.000Z",
      }),
    ]);

    expect(mondayGroupInterval(group)).toEqual({
      startISO: "2026-07-30T09:00:00.000Z",
      endISO: "2026-07-30T17:30:00.000Z",
    });
  });

  it("usa o maior fim, não o da tarefa que começou por último", () => {
    // Execuções sobrepostas: a última a começar terminou antes.
    const [group] = groupTasksForMonday([
      makeTask({
        id: "longa",
        startTime: "2026-07-30T09:00:00.000Z",
        endTime: "2026-07-30T18:00:00.000Z",
      }),
      makeTask({
        id: "curta",
        startTime: "2026-07-30T10:00:00.000Z",
        endTime: "2026-07-30T11:00:00.000Z",
      }),
    ]);

    expect(mondayGroupInterval(group).endISO).toBe("2026-07-30T18:00:00.000Z");
  });

  it("cai no próprio início quando a tarefa não tem fim", () => {
    const [group] = groupTasksForMonday([makeTask({ endTime: null })]);

    expect(mondayGroupInterval(group)).toEqual({
      startISO: "2026-07-30T12:00:00.000Z",
      endISO: "2026-07-30T12:00:00.000Z",
    });
  });
});

describe("groupTasksForMonday com campos personalizados", () => {
  it("separa em itens distintos tarefas com Project Stage diferente", () => {
    // Sem isto, as duas colapsariam num item só e o stage gravado dependeria de
    // qual tarefa chegou primeiro — o defeito que motivou a Fase 3.
    const groups = groupTasksForMonday([
      makeTask({ id: "t1", customValues: { "f-stage": "o1" } }),
      makeTask({ id: "t2", customValues: { "f-stage": "o2" } }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.groupKey)).size).toBe(2);
  });
});
