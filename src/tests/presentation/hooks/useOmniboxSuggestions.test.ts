import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOmniboxSuggestions } from "@presentation/hooks/useOmniboxSuggestions";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Daily",
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

function makePlanned(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt-1",
    workspaceId: "ws-1",
    name: "Planejada",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-04-08T08:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

function suggestionsFor(planned: PlannedTask[], recent: Task[]) {
  const { result } = renderHook(() => useOmniboxSuggestions(planned, recent, [], [], ""));
  return result.current;
}

describe("useOmniboxSuggestions", () => {
  it("a sugestão recente carrega a planejada de origem da tarefa", () => {
    // Sem isso, reexecutar pelo acesso rápido perdia o vínculo e a planejada
    // seguia pendente no planejamento depois de parar a tarefa (§4.1).
    const [sugg] = suggestionsFor([], [makeTask({ plannedTaskId: "pt-9" })]);
    expect(sugg.plannedTaskId).toBe("pt-9");
  });

  it("a sugestão recente continua fora da lista de planejadas", () => {
    // `isPlanned` distingue a origem da sugestão na UI — carregar o vínculo não
    // transforma uma entrada do dia em tarefa planejada.
    const [sugg] = suggestionsFor([], [makeTask({ plannedTaskId: "pt-9" })]);
    expect(sugg.isPlanned).toBe(false);
  });

  it("entre tarefas de mesmo nome e projeto, a origem vem da mais recente", () => {
    // O dedupe é por nome+projeto, e a origem não entra na chave: duas execuções
    // do mesmo trabalho vindas de planejadas diferentes colapsam numa sugestão só.
    // Vence a primeira ocorrência da chave — ordenar a lista é responsabilidade de
    // quem a monta, não do hook.
    const [sugg] = suggestionsFor(
      [],
      [
        makeTask({ id: "t2", plannedTaskId: "pt-nova" }),
        makeTask({ id: "t1", plannedTaskId: "pt-velha" }),
      ]
    );
    expect(sugg.plannedTaskId).toBe("pt-nova");
  });

  it("tarefa solta continua sem origem", () => {
    const [sugg] = suggestionsFor([], [makeTask({ plannedTaskId: null })]);
    expect(sugg.plannedTaskId).toBeNull();
  });

  it("a sugestão planejada aponta para a própria planejada", () => {
    const [sugg] = suggestionsFor([makePlanned({ id: "pt-1" })], []);
    expect(sugg.plannedTaskId).toBe("pt-1");
    expect(sugg.isPlanned).toBe(true);
  });
});
