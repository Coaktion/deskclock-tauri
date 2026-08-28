import { describe, expect, it, vi } from "vitest";

import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import {
  fillPlanGaps,
  tasksWithGaps,
  type FillPlanGapsOptions,
} from "@domain/usecases/llm/FillPlanGaps";

const PROJECTS: Project[] = [
  { id: "p1", workspaceId: "w1", name: "DeskClock", colorIndex: 0 },
  { id: "p2", workspaceId: "w1", name: "Aktie", colorIndex: 1 },
];

const CATEGORIES: Category[] = [
  { id: "c1", workspaceId: "w1", name: "Reunião", defaultBillable: true },
];

const STAGE: CustomField = {
  id: "f1",
  label: "Etapa",
  type: "select",
  options: [
    { id: "o1", label: "Discovery" },
    { id: "o2", label: "Execução" },
  ],
  sortOrder: 0,
  archived: false,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt1",
    workspaceId: "w1",
    name: "Alinhamento",
    projectId: null,
    categoryId: null,
    billable: false,
    scheduleType: "specific_date",
    scheduleDate: "2026-09-02",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-08-28T12:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

function makeLlm(answer: string): ILlmApi {
  return {
    complete: vi.fn(async () => ({ text: answer })),
    listModels: vi.fn(async () => []),
  };
}

function reply(...items: unknown[]): string {
  return JSON.stringify({ tarefas: items });
}

function makeOptions(overrides: Partial<FillPlanGapsOptions> = {}): FillPlanGapsOptions {
  return {
    tasks: [makeTask()],
    projects: PROJECTS,
    categories: CATEGORIES,
    selectFields: [STAGE],
    ...overrides,
  };
}

describe("tasksWithGaps", () => {
  it("traz a tarefa sem projeto", () => {
    expect(tasksWithGaps([makeTask()], [])).toHaveLength(1);
  });

  it("deixa de fora a tarefa que já tem tudo", () => {
    const complete = makeTask({ projectId: "p1", categoryId: "c1" });
    expect(tasksWithGaps([complete], [])).toEqual([]);
  });

  it("conta campo select vazio como lacuna", () => {
    const task = makeTask({ projectId: "p1", categoryId: "c1" });
    expect(tasksWithGaps([task], [STAGE])[0].missing).toEqual(["Etapa"]);
  });

  it("campo select preenchido não é lacuna", () => {
    const task = makeTask({ projectId: "p1", categoryId: "c1", customValues: { f1: "o1" } });
    expect(tasksWithGaps([task], [STAGE])).toEqual([]);
  });

  it("nomeia cada lacuna, e é isso que o prompt manda", () => {
    expect(tasksWithGaps([makeTask()], [STAGE])[0].missing).toEqual([
      "projeto",
      "categoria",
      "Etapa",
    ]);
  });

  it("deixa de fora a tarefa sem nome, que não dá ao modelo do que inferir", () => {
    expect(tasksWithGaps([makeTask({ name: "  " })], [])).toEqual([]);
  });
});

describe("fillPlanGaps", () => {
  it("faz uma chamada só e resolve os nomes para ids", async () => {
    const llm = makeLlm(reply({ id: "t1", projeto: "Aktie", categoria: "Reunião" }));

    const { fills } = await fillPlanGaps({ llm }, makeOptions());

    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(fills).toEqual([{ taskId: "pt1", projectId: "p2", categoryId: "c1", customValues: {} }]);
  });

  it("resolve a opção do campo select para o id que fica gravado", async () => {
    const llm = makeLlm(reply({ id: "t1", campos: { Etapa: "execução" } }));

    const { fills } = await fillPlanGaps({ llm }, makeOptions());

    expect(fills[0].customValues).toEqual({ f1: "o2" });
  });

  it("descarta opção que não existe no campo", async () => {
    const llm = makeLlm(reply({ id: "t1", campos: { Etapa: "Sprint 4" } }));

    const { fills } = await fillPlanGaps({ llm }, makeOptions());

    expect(fills).toEqual([]);
  });

  it("nunca sobrescreve campo já preenchido", async () => {
    // A trava é aqui, e não só no prompt: o modelo devolve o que quiser, e o
    // que o usuário escolheu à mão não se toca.
    const task = makeTask({ projectId: "p1" });
    const llm = makeLlm(reply({ id: "t1", projeto: "Aktie", categoria: "Reunião" }));

    const { fills } = await fillPlanGaps({ llm }, makeOptions({ tasks: [task] }));

    expect(fills[0]).toEqual({ taskId: "pt1", categoryId: "c1", customValues: {} });
  });

  it("nome que não casa com o catálogo não vira nada", async () => {
    const llm = makeLlm(reply({ id: "t1", projeto: "Cliente Fantasma" }));

    const { fills } = await fillPlanGaps({ llm }, makeOptions());

    expect(fills).toEqual([]);
  });

  it("não chama o provedor quando não há lacuna nenhuma", async () => {
    const llm = makeLlm(reply());
    const complete = makeTask({ projectId: "p1", categoryId: "c1", customValues: { f1: "o1" } });

    const { fills } = await fillPlanGaps({ llm }, makeOptions({ tasks: [complete] }));

    expect(llm.complete).not.toHaveBeenCalled();
    expect(fills).toEqual([]);
  });

  it("propaga o erro do provedor sem traduzir", async () => {
    const error = new Error("401");
    const llm: ILlmApi = {
      complete: vi.fn(async () => {
        throw error;
      }),
      listModels: vi.fn(async () => []),
    };

    await expect(fillPlanGaps({ llm }, makeOptions())).rejects.toBe(error);
  });

  it("manda ao modelo o que falta em cada tarefa", async () => {
    const llm = makeLlm(reply());

    await fillPlanGaps({ llm }, makeOptions());

    const [messages] = vi.mocked(llm.complete).mock.calls[0];
    expect(messages[1].content).toContain("Alinhamento");
    expect(messages[1].content).toContain("projeto, categoria, Etapa");
  });
});
